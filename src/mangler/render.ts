import { detectPitchYin, semitonesToNearestC } from '../lib/audio/pitch.ts';
import {
    applyGain, cut, dbToGain, declick, fadeOutTail, gatedRmsDb, joinInto, limit, loopCrossfade,
    monoMix, peak, resample, reverseInPlace, rmsDb, type Stereo,
} from './dsp.ts';
import { Planner } from './plan.ts';
import { createRng, deriveSeed } from './rng.ts';
import { MAX_CUE_POINTS, type MangleSettings } from './settings.ts';

/** Everything renders at the hardware's rate. */
export const MANGLE_SAMPLE_RATE = 48000;

/** A decoded source at 48 kHz. Mono sources pass the same array twice. */
export interface MangleSource {
    channels: Stereo;
    enabled: boolean;
}

export interface SnippetPitch {
    frequency: number;
    note: string;
    confidence: number;
    /** Semitones to the nearest C. */
    toC: number;
}

export interface SnippetInfo {
    /** Index into the sources passed to `render`. */
    source: number;
    /** Region read from the source, in source frames. */
    sourceStart: number;
    sourceLength: number;
    /** Where the snippet starts in the result (the start of its crossfade). */
    outStart: number;
    length: number;
    xfade: number;
    reverse: boolean;
    /** Gated RMS before the gain. −Infinity for silence. */
    measuredDb: number;
    gainDb: number;
    /** Null when repitch is off, the snippet is too short, or it has no clear pitch. */
    pitch: SnippetPitch | null;
    /** Semitones actually applied (to C, plus detune). */
    shift: number;
    /** Times the snippet was redrawn for being below the silence threshold. */
    rerolls: number;
}

export interface MangleResult {
    seed: number;
    sampleRate: number;
    left: Float32Array;
    right: Float32Array;
    /** Frames. One per snippet start (the middle of its crossfade), at most 255. */
    cuePoints: number[];
    /** More snippets started than the firmware has cue points for. */
    cuesCapped: boolean;
    snippets: SnippetInfo[];
    /** Deepest limiter (or scale-down) reduction, dB ≤ 0. */
    peakReductionDb: number;
}

const PEAK_CEILING_DB = -1;
const SILENCE_REROLLS = 5;
/** A runaway guard: 42 s of 20 ms snippets is about 2100. */
const MAX_SNIPPETS = 20000;

/**
 * Renders one variation: `render(sources, settings, seed)`. Pure and seeded; the
 * same arguments give bit-identical output. See the plan's "Engine" section.
 */
export function render(
    sources: readonly MangleSource[],
    settings: MangleSettings,
    seed: number,
    onProgress?: (fraction: number) => void,
): MangleResult {
    const sr = MANGLE_SAMPLE_RATE;
    const ms = sr / 1000;
    const total = Math.round(settings.outputSeconds * sr);
    const loopLength = settings.loop
        ? Math.min(Math.round(Math.min(1000, Math.max(10, settings.xfadeMaxMs)) * ms), total >> 2)
        : 0;
    const capacity = total + loopLength;
    const out: Stereo = [new Float32Array(capacity), new Float32Array(capacity)];
    const declickLength = settings.hardCuts ? 0 : Math.round(2 * ms);

    const planner = new Planner(
        createRng(seed),
        sources.map(s => ({ length: s.channels[0].length, enabled: s.enabled })),
        settings,
        sr,
    );

    const snippets: SnippetInfo[] = [];
    let end = 0;
    let previousLength = 0;
    let lastProgress = 0;

    for (let index = 0; end < capacity && index < MAX_SNIPPETS; index++) {
        const plan = planner.next();
        const reroll = createRng(deriveSeed(seed, index));

        let source = plan.source;
        let startFraction = plan.startFraction;
        let rerolls = 0;
        let signal: Stereo;
        let info: Omit<SnippetInfo, 'outStart' | 'xfade' | 'gainDb'>;

        for (;;) {
            const src = sources[source].channels;
            const srcLength = src[0].length;
            const length = Math.max(2, Math.min(plan.length, srcLength));

            // Pitch: detect on the planned region, then widen the read so the
            // snippet keeps its planned length after the shift.
            let pitch: SnippetPitch | null = null;
            let shift = plan.detune * settings.detuneSt;
            if (settings.repitch !== 'off') {
                const at = Math.floor(startFraction * (srcLength - length));
                const region: Stereo = [src[0].subarray(at, at + length), src[1].subarray(at, at + length)];
                const estimate = detectPitchYin(monoMix(region), sr);
                if (estimate) {
                    pitch = {
                        frequency: estimate.frequency,
                        note: estimate.note,
                        confidence: estimate.confidence,
                        toC: semitonesToNearestC(estimate.frequency),
                    };
                    if (settings.repitch === 'apply' && estimate.confidence >= settings.pitchConfidence) {
                        shift += pitch.toC;
                    }
                }
            }
            const ratio = Math.pow(2, shift / 12);
            const readLength = Math.min(srcLength, Math.ceil(length * ratio) + 1);
            const start = Math.floor(startFraction * (srcLength - readLength));
            signal = resample(cut(src, start, readLength), ratio, length);
            if (plan.reverse) reverseInPlace(signal);

            info = {
                source,
                sourceStart: start,
                sourceLength: readLength,
                length: signal[0].length,
                reverse: plan.reverse,
                measuredDb: gatedRmsDb(signal, sr),
                pitch,
                shift,
                rerolls,
            };

            if (!settings.skipSilence || rerolls >= SILENCE_REROLLS) break;
            if (rmsDb(signal) >= settings.silenceThresholdDb) break;
            // Too quiet: another place, maybe another source. Drawn from the
            // snippet's own stream, so the main plan doesn't move.
            rerolls++;
            source = planner.pickSource(reroll);
            startFraction = reroll.next();
        }

        let gainDb = 0;
        if (Number.isFinite(info.measuredDb)) {
            gainDb = Math.min(
                settings.maxBoostDb,
                settings.loudnessTargetDb - info.measuredDb + plan.spread * settings.loudnessSpreadDb,
            );
            applyGain(signal, dbToGain(gainDb));
        }
        if (declickLength) declick(signal, declickLength);

        const length = signal[0].length;
        if (length < 2) continue;
        const xfade = index === 0 || snippets.length === 0
            ? 0
            : Math.min(plan.xfade, Math.floor(Math.min(length, previousLength) / 2));
        const at = end - xfade;
        end = joinInto(out, signal, at, xfade);
        planner.commit(info.source);
        previousLength = length;
        snippets.push({ ...info, outStart: at, xfade, gainDb });

        const progress = end / capacity;
        if (onProgress && progress - lastProgress >= 0.05) {
            lastProgress = progress;
            onProgress(progress);
        }
    }

    let result: Stereo = out;
    if (loopLength > 0) {
        result = loopCrossfade(out, total, loopLength);
    } else if (declickLength) {
        fadeOutTail(out, total, declickLength);
    }

    const ceiling = dbToGain(PEAK_CEILING_DB);
    let peakReductionDb = 0;
    if (settings.limiter) {
        peakReductionDb = limit(result, ceiling, Math.round(5 * ms));
    } else {
        const p = peak(result);
        if (p > ceiling) {
            applyGain(result, ceiling / p);
            peakReductionDb = 20 * Math.log10(ceiling / p);
        }
    }

    // Cue at the middle of each crossfade: where the new snippet takes over.
    const starts = snippets.map(s => s.outStart + (s.xfade >> 1)).filter(f => f < total);
    const cuePoints = settings.cuePoints ? starts.slice(0, MAX_CUE_POINTS) : [];

    onProgress?.(1);
    return {
        seed,
        sampleRate: sr,
        left: result[0],
        right: result[1],
        cuePoints,
        cuesCapped: settings.cuePoints && starts.length > MAX_CUE_POINTS,
        snippets,
        peakReductionDb,
    };
}
