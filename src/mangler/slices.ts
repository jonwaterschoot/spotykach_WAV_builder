import { applyGain, cut, dbToGain, declick, resampleSinc, reverseInPlace, type Stereo } from './dsp.ts';
import type { HitClass } from './hits.ts';
import { applyEnvelope, type SnippetEnvelope, type SnippetInfo } from './render.ts';

/**
 * Slices: single sounds kept in a pool, to audition, collect and lay out again
 * (a kit now, the sequencer later). A slice is a reference, not audio: a region
 * of a pool source and what is done to it. It costs bytes, and renders the same
 * way a snippet does, so a kit made of slices sounds like the slices did.
 */

export interface SliceSpec {
    /** Seconds in the source. */
    start: number;
    end: number;
    reverse?: boolean;
    /** Semitones; the slice gets shorter going up, as on tape. */
    shift?: number;
    gainDb?: number;
    envelope?: SnippetEnvelope;
}

const ratioFor = (st: number) => Math.pow(2, st / 12);
/** The same declick a render adds when hard cuts are off. */
const DECLICK_SECONDS = 0.002;

/** Frames the slice has after its shift. */
export const sliceFrames = (spec: SliceSpec, sampleRate: number) =>
    Math.max(2, Math.round(((spec.end - spec.start) * sampleRate) / ratioFor(spec.shift ?? 0)));

/** The slice as audio: cut, shifted, reversed, gained, enveloped, declicked. */
export function renderSlice(source: Stereo, sampleRate: number, spec: SliceSpec): Stereo {
    const start = Math.max(0, Math.round(spec.start * sampleRate));
    const length = Math.max(2, Math.min(source[0].length - start, Math.round((spec.end - spec.start) * sampleRate)));
    let signal = cut(source, start, length);
    const ratio = ratioFor(spec.shift ?? 0);
    if (ratio !== 1) signal = resampleSinc(signal, ratio, sliceFrames(spec, sampleRate));
    if (spec.reverse) reverseInPlace(signal);
    if (spec.gainDb) applyGain(signal, dbToGain(spec.gainDb));
    if (spec.envelope) applyEnvelope(signal, spec.envelope, sampleRate);
    declick(signal, Math.round(DECLICK_SECONDS * sampleRate));
    return signal;
}

/** A slice as a fixed snippet for `render`, from source `index`. */
export function sliceAsSnippet(spec: SliceSpec, index: number, sampleRate: number): SnippetInfo {
    const sourceStart = Math.round(spec.start * sampleRate);
    const sourceLength = Math.max(2, Math.round((spec.end - spec.start) * sampleRate));
    return {
        source: index, sourceStart, sourceLength, outStart: 0, length: sliceFrames(spec, sampleRate), xfade: 0,
        reverse: !!spec.reverse, measuredDb: 0, gainDb: spec.gainDb ?? 0, pitch: null, shift: spec.shift ?? 0, rerolls: 0,
        ...(spec.envelope ? { envelope: spec.envelope } : {}),
    };
}

/** A rendered snippet as a slice of its source. A rest has no sound to keep: null. */
export function snippetAsSlice(sn: SnippetInfo, sampleRate: number): SliceSpec | null {
    if (sn.rest) return null;
    return {
        start: sn.sourceStart / sampleRate,
        end: (sn.sourceStart + sn.sourceLength) / sampleRate,
        ...(sn.reverse ? { reverse: true } : {}),
        ...(sn.shift ? { shift: sn.shift } : {}),
        ...(sn.gainDb + (sn.softDb ?? 0) ? { gainDb: sn.gainDb + (sn.softDb ?? 0) } : {}),
        ...(sn.envelope ? { envelope: sn.envelope } : {}),
    };
}

/** A small outline for a tile: `buckets` peaks, 0–1. */
export function slicePeaks(signal: Stereo, buckets = 48): number[] {
    const [l, r] = signal;
    const out: number[] = [];
    for (let b = 0; b < buckets; b++) {
        const from = Math.floor((b * l.length) / buckets);
        const to = Math.max(from + 1, Math.floor(((b + 1) * l.length) / buckets));
        let max = 0;
        for (let i = from; i < to && i < l.length; i++) max = Math.max(max, Math.abs(l[i]), Math.abs(r[i]));
        out.push(Math.round(Math.min(1, max) * 100) / 100);
    }
    return out;
}

export type { HitClass };
