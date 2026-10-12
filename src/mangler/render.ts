import { detectPitchYin, semitonesToNearestC, semitonesToPitchClasses } from '../lib/audio/pitch.ts';
import {
    applyGain, cut, dbToGain, declick, detectOnsets, fadeOutTail, findOnset, gatedRmsDb, joinInto, limit, loopCrossfade,
    monoMix, nearestZeroCrossing, peak, resample, resampleSinc, reverseInPlace, rmsDb, type Stereo,
} from './dsp.ts';
import { Planner } from './plan.ts';
import { createRng, deriveSeed } from './rng.ts';
import { MAX_CUE_POINTS, scalePitchClasses, type MangleSettings } from './settings.ts';

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
    /** Semitones to the nearest note of the render's scale (equals `toC` for "root only" on C). */
    toScale?: number;
}

/**
 * What a snippet's pitch was set to. Absent: its own pitch (plus detune).
 * `scale`: the nearest note of the scale. `note`: the nearest given pitch class.
 * `st`: a plain shift.
 */
export type PitchChoice =
    | { kind: 'scale' }
    | { kind: 'note'; pc: number }
    | { kind: 'st'; st: number };

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
    /** The shift includes the move to C (`pitch.toC`). Results from before `choice`. */
    toCApplied?: boolean;
    /** The random detune part of `shift`. */
    detune?: number;
    /** What the rest of `shift` is. Absent: nothing beyond the detune. */
    choice?: PitchChoice;
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

export interface RenderOptions {
    onProgress?: (fraction: number) => void;
    /**
     * Snippets to use as they are, by position: `fixed[i]` replaces the i-th
     * snippet the dice would have picked (same source region, shift, direction,
     * gain and crossfade). Positions past the end, or left empty, are rolled as
     * usual. This is how a result is edited: delete a snippet (the rest fixed,
     * the gap at the end refilled), apply C to one, or lock some and reroll.
     */
    fixed?: readonly (SnippetInfo | null | undefined)[];
}

/** Shift ratio for semitones. */
const ratioFor = (st: number) => Math.pow(2, st / 12);

/**
 * Renders one variation: `render(sources, settings, seed)`. Pure and seeded; the
 * same arguments give bit-identical output. See the plan's "Engine" section.
 */
export function render(
    sources: readonly MangleSource[],
    settings: MangleSettings,
    seed: number,
    options: RenderOptions = {},
): MangleResult {
    const { onProgress, fixed } = options;
    const sr = MANGLE_SAMPLE_RATE;
    const ms = sr / 1000;
    const total = Math.round(settings.outputSeconds * sr);
    const loopLength = settings.loop
        ? Math.min(Math.round(Math.min(1000, Math.max(10, settings.xfadeMaxMs)) * ms), total >> 2)
        : 0;
    const capacity = total + loopLength;
    const out: Stereo = [new Float32Array(capacity), new Float32Array(capacity)];
    const declickLength = settings.hardCuts ? 0 : Math.round(2 * ms);

    const scale = scalePitchClasses(settings.scaleRoot, settings.scaleMask);
    const resampleWith = (signal: Stereo, ratio: number, length: number) =>
        settings.resampler === 'sinc' ? resampleSinc(signal, ratio, length) : resample(signal, ratio, length);

    /**
     * Moves a region's start so the snippet begins cleanly: on a zero crossing
     * (within 5 ms), or on the strongest onset in its first half second. A
     * reversed snippet begins at the region's end, so that end is what snaps,
     * and onsets don't apply to it (played backwards, an onset is a cut-off).
     */
    const snapStart = (src: Stereo, start: number, readLength: number, used: number, reverse: boolean) => {
        const mode = settings.snapStart;
        if (mode === 'off') return start;
        const srcLength = src[0].length;
        const maxStart = Math.max(0, srcLength - readLength);
        let next: number;
        if (mode === 'onset' && !reverse) {
            next = findOnset(src, start, Math.min(used, Math.round(0.5 * sr)), sr);
        } else {
            const anchor = reverse ? Math.min(srcLength - 1, start + used - 1) : start;
            next = start + nearestZeroCrossing(src, anchor, Math.round(0.005 * sr)) - anchor;
        }
        return Math.max(0, Math.min(maxStart, next));
    };

    const planner = new Planner(
        createRng(seed),
        sources.map(s => ({ length: s.channels[0].length, enabled: s.enabled })),
        settings,
        sr,
    );
    if (!planner.hasSources && !fixed?.some(Boolean)) throw new Error('No sources to mangle');

    const snippets: SnippetInfo[] = [];
    let end = 0;
    let previousLength = 0;
    let lastProgress = 0;

    for (let index = 0; end < capacity && index < MAX_SNIPPETS; index++) {
        // Always drawn, fixed or not, so the snippets after a fixed one keep their dice.
        const plan = planner.next();
        const spec = fixed?.[index];
        let signal: Stereo;
        let info: Omit<SnippetInfo, 'outStart' | 'xfade' | 'gainDb'>;
        let gainDb = 0;
        let wantedXfade = plan.xfade;

        if (spec) {
            const src = sources[spec.source]?.channels;
            if (!src || src[0].length === 0) throw new Error('A source this result uses is no longer in the pool');
            signal = resampleWith(cut(src, spec.sourceStart, spec.sourceLength), ratioFor(spec.shift), spec.length);
            if (spec.reverse) reverseInPlace(signal);
            info = {
                source: spec.source,
                sourceStart: spec.sourceStart,
                sourceLength: spec.sourceLength,
                length: signal[0].length,
                reverse: spec.reverse,
                measuredDb: spec.measuredDb,
                pitch: spec.pitch,
                shift: spec.shift,
                toCApplied: spec.toCApplied,
                detune: spec.detune,
                choice: spec.choice,
                rerolls: spec.rerolls,
            };
            gainDb = spec.gainDb;
            wantedXfade = spec.xfade;
            if (gainDb) applyGain(signal, dbToGain(gainDb));
        } else {
            if (plan.source < 0) break; // Every source is switched off: the rest stays silent.
            const reroll = createRng(deriveSeed(seed, index));
            let source = plan.source;
            let startFraction = plan.startFraction;
            let rerolls = 0;

            for (;;) {
                const src = sources[source].channels;
                const srcLength = src[0].length;
                const length = Math.max(2, Math.min(plan.length, srcLength));

                // Pitch: detect on the planned region, then widen the read so the
                // snippet keeps its planned length after the shift.
                let pitch: SnippetPitch | null = null;
                const detune = plan.detune * settings.detuneSt;
                let shift = detune;
                let choice: PitchChoice | undefined;
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
                            toScale: semitonesToPitchClasses(estimate.frequency, scale),
                        };
                        if (settings.repitch === 'apply' && estimate.confidence >= settings.pitchConfidence) {
                            shift += pitch.toScale ?? pitch.toC;
                            choice = { kind: 'scale' };
                        }
                    }
                }
                const ratio = ratioFor(shift);
                const readLength = Math.min(srcLength, Math.ceil(length * ratio) + 1);
                let start = Math.floor(startFraction * (srcLength - readLength));
                start = snapStart(src, start, readLength, Math.ceil(length * ratio), plan.reverse);
                // One hit per snippet: stop before the next attack in the region.
                let outLength = length;
                if (settings.oneHit) {
                    const minGap = Math.round(0.03 * sr * ratio);
                    const next = detectOnsets(src, sr, {
                        from: start + minGap, to: start + readLength, sensitivity: 0.5, minGapMs: 30,
                    })[0];
                    if (next) outLength = Math.max(Math.round(0.02 * sr), Math.min(length, Math.floor((next.frame - start) / ratio)));
                }
                signal = resampleWith(cut(src, start, readLength), ratio, outLength);
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
                    detune,
                    choice,
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

            if (Number.isFinite(info.measuredDb)) {
                gainDb = Math.min(
                    settings.maxBoostDb,
                    settings.loudnessTargetDb - info.measuredDb + plan.spread * settings.loudnessSpreadDb,
                );
                applyGain(signal, dbToGain(gainDb));
            }
        }

        if (declickLength) declick(signal, declickLength);

        const length = signal[0].length;
        if (length < 2) continue;
        const xfade = index === 0 || snippets.length === 0
            ? 0
            : Math.min(wantedXfade, Math.floor(Math.min(length, previousLength) / 2));
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
