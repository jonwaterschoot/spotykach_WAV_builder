import { detectPitchYin, semitonesToNearestC, semitonesToPitchClasses } from './pitch.ts';
import {
    applyGain, cut, dbToGain, declick, detectOnsets, fadeOutTail, findOnset, gatedRmsDb, joinInto, limit, loopCrossfade,
    monoMix, nearestZeroCrossing, peak, resample, resampleSinc, reverseInPlace, rmsDb, type Stereo,
} from './dsp.ts';
import { Planner } from './plan.ts';
import { createRng, deriveSeed } from './rng.ts';
import { detectHits } from './hits.ts';
import { MAX_CUE_POINTS, OUTPUT_MAX_SECONDS, scalePitchClasses, type MangleSettings } from './settings.ts';

/** Everything renders at the hardware's rate. */
export const MANGLE_SAMPLE_RATE = 48000;

/** A decoded source at 48 kHz. Mono sources pass the same array twice. */
export interface MangleSource {
    channels: Stereo;
    enabled: boolean;
    /**
     * The parts of the source new snippets may come from, as `[start, end)`
     * frames. Absent or empty: the whole file. A snippet never crosses a part's
     * edge; one longer than its part is cut to it.
     */
    regions?: [number, number][];
}

/** Sorted, merged, clamped parts; `null` means the whole file. */
export function usableRegions(source: MangleSource): [number, number][] | null {
    const length = source.channels[0].length;
    const parts = (source.regions ?? [])
        .map(([a, b]) => [Math.max(0, Math.min(length, Math.floor(a))), Math.max(0, Math.min(length, Math.floor(b)))] as [number, number])
        .filter(([a, b]) => b - a >= 2)
        .sort((x, y) => x[0] - y[0]);
    const merged: [number, number][] = [];
    for (const part of parts) {
        const last = merged[merged.length - 1];
        if (last && part[0] <= last[1]) last[1] = Math.max(last[1], part[1]);
        else merged.push([...part]);
    }
    return merged.length ? merged : null;
}

/** Frames a source offers new snippets: the sum of its parts. */
const usableLength = (source: MangleSource) =>
    (usableRegions(source) ?? [[0, source.channels[0].length]]).reduce((sum, [a, b]) => sum + b - a, 0);

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
    /** A rest: the snippet is silence (its length and cue point stay). */
    rest?: boolean;
    /** A soft part: turned down this many dB (negative) on top of `gainDb`. */
    softDb?: number;
    /** Attack–decay envelope, ms. Absent: none. */
    envelope?: SnippetEnvelope;
}

export interface SnippetEnvelope {
    attackMs: number;
    decayMs: number;
    curve: 'exp' | 'linear';
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
    /** Count mode: the snippets asked for didn't fit in 42 s, so there are fewer. */
    countCapped?: boolean;
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

/**
 * Attack, then decay: a rise from silence over the attack (a quick curve for
 * exp, a straight line for linear), then a fall to −60 dB (exp) or to silence
 * (linear) over the decay. Past the decay a linear envelope stays at 0.
 */
export function applyEnvelope(signal: Stereo, env: SnippetEnvelope, sampleRate: number): void {
    const [l, r] = signal;
    const attack = Math.round((env.attackMs / 1000) * sampleRate);
    const decay = Math.max(1, Math.round((env.decayMs / 1000) * sampleRate));
    const exp = env.curve === 'exp';
    // −60 dB over the decay: the gain per sample.
    const fall = Math.pow(10, -3 / decay);
    let level = 1;
    for (let i = 0; i < l.length; i++) {
        let g: number;
        if (i < attack) {
            const t = i / attack;
            g = exp ? (1 - Math.exp(-5 * t)) / (1 - Math.exp(-5)) : t;
        } else if (exp) {
            g = level;
            level *= fall;
        } else {
            g = Math.max(0, 1 - (i - attack) / decay);
        }
        l[i] *= g;
        if (r !== l) r[i] *= g;
    }
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
    const byCount = settings.fillMode === 'count';
    // Count mode renders into the most there may be, and ends where the last snippet does.
    const maxTotal = Math.round((byCount ? OUTPUT_MAX_SECONDS : settings.outputSeconds) * sr);
    const loopLength = settings.loop
        ? Math.min(Math.round(Math.min(1000, Math.max(10, settings.xfadeMaxMs)) * ms), maxTotal >> 2)
        : 0;
    const capacity = maxTotal + loopLength;
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
    const snapStart = (
        src: Stereo, start: number, readLength: number, used: number, reverse: boolean, lo: number, hi: number,
    ) => {
        const mode = settings.snapStart;
        if (mode === 'off') return start;
        const srcLength = src[0].length;
        const maxStart = Math.max(lo, hi - readLength);
        let next: number;
        if (mode === 'onset' && !reverse) {
            next = findOnset(src, start, Math.min(used, Math.round(0.5 * sr)), sr);
        } else {
            const anchor = reverse ? Math.min(srcLength - 1, start + used - 1) : start;
            next = start + nearestZeroCrossing(src, anchor, Math.round(0.005 * sr)) - anchor;
        }
        return Math.max(lo, Math.min(maxStart, next));
    };

    const planner = new Planner(
        createRng(seed),
        sources.map(s => ({ length: usableLength(s), enabled: s.enabled })),
        settings,
        sr,
    );
    if (!planner.hasSources && !fixed?.some(Boolean)) throw new Error('No sources to mangle');

    const snippets: SnippetInfo[] = [];
    let end = 0;
    let previousLength = 0;
    let lastProgress = 0;

    for (let index = 0; end < capacity && index < MAX_SNIPPETS; index++) {
        if (byCount && snippets.length >= settings.snippetCount) break;
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
                ...(spec.rest ? { rest: true } : {}),
                ...(spec.softDb ? { softDb: spec.softDb } : {}),
                ...(spec.envelope ? { envelope: spec.envelope } : {}),
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
                // Which part of the source, and where in it (0-1). Without parts
                // this is the whole file and `startFraction` as it is, so renders
                // from before parts existed come out bit-identical.
                const parts = usableRegions(sources[source]);
                let lo = 0, hi = srcLength, local = startFraction;
                if (parts) {
                    const total = parts.reduce((sum, [a, b]) => sum + b - a, 0);
                    let u = startFraction * total;
                    for (const [a, b] of parts) {
                        if (u < b - a || b === parts[parts.length - 1][1]) {
                            lo = a; hi = b; local = Math.min(1, Math.max(0, u / (b - a)));
                            break;
                        }
                        u -= b - a;
                    }
                }
                const span = hi - lo;
                const length = Math.max(2, Math.min(plan.length, span));

                // Pitch: detect on the planned region, then widen the read so the
                // snippet keeps its planned length after the shift.
                let pitch: SnippetPitch | null = null;
                const detune = plan.detune * settings.detuneSt;
                let shift = detune;
                let choice: PitchChoice | undefined;
                if (settings.repitch !== 'off') {
                    const at = lo + Math.floor(local * (span - length));
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
                const readLength = Math.min(span, Math.ceil(length * ratio) + 1);
                let start = lo + Math.floor(local * (span - readLength));
                start = snapStart(src, start, readLength, Math.ceil(length * ratio), plan.reverse, lo, hi);
                // One hit per snippet: stop before the next attack in the region, and
                // (flux) where this hit has died away, so no silent tail comes along.
                let outLength = length;
                if (settings.oneHit && settings.detector === 'flux') {
                    const minGap = Math.round(0.03 * sr * ratio);
                    const found = detectHits(src, sr, {
                        from: Math.max(lo, start - 2048), to: start + readLength, sensitivity: 0.5, minGapMs: 30,
                    });
                    const own = found.find(h => h.start <= start + minGap && h.end > start);
                    const next = found.find(h => h.start >= start + minGap);
                    const stop = Math.min(next?.start ?? Infinity, own?.end ?? Infinity);
                    if (Number.isFinite(stop)) outLength = Math.max(Math.round(0.02 * sr), Math.min(length, Math.floor((stop - start) / ratio)));
                } else if (settings.oneHit) {
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

            // The envelope: dice of its own per position too.
            if (settings.envelope) {
                const env = createRng(deriveSeed(seed, 0xad, index));
                info.envelope = {
                    attackMs: env.uniform(settings.attackMinMs, settings.attackMaxMs),
                    decayMs: env.logUniform(settings.decayMinMs, settings.decayMaxMs),
                    curve: settings.envelopeCurve,
                };
            }

            // Rests and soft parts: dice of their own per position, so switching them
            // on leaves every other pick (and every older result) as it was.
            if (settings.restProbability > 0 || settings.softProbability > 0) {
                const dyn = createRng(deriveSeed(seed, 0x50f7, index));
                const roll = dyn.next();
                const depth = dyn.next();
                if (roll < settings.restProbability) info.rest = true;
                else if (roll < settings.restProbability + settings.softProbability) {
                    info.softDb = -(settings.softMinDb + depth * (settings.softMaxDb - settings.softMinDb));
                }
            }
        }

        if (info.rest) {
            signal[0].fill(0);
            if (signal[1] !== signal[0]) signal[1].fill(0);
        } else if (info.softDb) applyGain(signal, dbToGain(info.softDb));
        if (info.envelope && !info.rest) applyEnvelope(signal, info.envelope, sr);

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

    // Length mode: exactly the length asked for. Count mode: up to the end of the
    // last snippet; a loop folds its last stretch into the start, so the file is
    // that much shorter (and the fold at most a fifth of what there is).
    const loopNow = byCount ? Math.min(loopLength, Math.floor(end / 5)) : loopLength;
    const total = byCount ? Math.max(2, Math.min(maxTotal, end - loopNow)) : maxTotal;
    let result: Stereo = out;
    if (loopNow > 0) {
        result = loopCrossfade(out, total, loopNow);
    } else {
        if (declickLength) fadeOutTail(out, total, declickLength);
        if (total < out[0].length) result = [out[0].slice(0, total), out[1].slice(0, total)];
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
        countCapped: byCount && snippets.length < settings.snippetCount,
        snippets,
        peakReductionDb,
    };
}
