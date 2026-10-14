import type { Stereo } from './dsp.ts';
import { OUTPUT_MAX_SECONDS } from './settings.ts';

/**
 * The step sequencer: four patterns (A–D) of 16 sixteenth-note steps, a chain
 * that plays them in order, and tracks that each play a slice. It lives in the
 * browser only; the hardware gets it as a rendered file. Pure functions here:
 * where the hits fall, and the mix. Live playback is in ui/useSequencePlayer.ts.
 */

export const PATTERNS = ['A', 'B', 'C', 'D'] as const;
export type PatternId = typeof PATTERNS[number];
/** Sixteenths per pattern: a pattern is one bar of 4/4. */
export const STEPS = 16;
export const MAX_TRACKS = 8;
export const MAX_CHAIN = 16;
export const VELOCITIES = [1, 0.66, 0.33] as const;

export interface SeqStep {
    on: boolean;
    /** 0–1, as amplitude. */
    velocity: number;
    /** Slice lock: this step plays another slice than the track's. */
    sliceId?: string;
    /** Semitones on top of the track's shift. On the Spotykach: the note (60 + shift). */
    shift?: number;
}

export interface SeqTrack {
    id: string;
    name: string;
    /** The track's slice; null: silent until one is picked. */
    sliceId: string | null;
    volumeDb: number;
    /** Semitones, on top of the slice's own shift. */
    shift: number;
    mute: boolean;
    solo: boolean;
    patterns: Record<PatternId, SeqStep[]>;
}

export interface Sequence {
    bpm: number;
    /** 0–0.5 of a step: how late every second sixteenth comes. */
    swing: number;
    chain: PatternId[];
    tracks: SeqTrack[];
}

/** Where the cue points of a rendered sequence go. */
export type SeqCues = 'hits' | 'beats' | 'bars';

export const emptySteps = (): SeqStep[] => Array.from({ length: STEPS }, () => ({ on: false, velocity: 1 }));

export const newTrack = (id: string, name: string, sliceId: string | null = null): SeqTrack => ({
    id, name, sliceId, volumeDb: 0, shift: 0, mute: false, solo: false,
    patterns: { A: emptySteps(), B: emptySteps(), C: emptySteps(), D: emptySteps() },
});

export const newSequence = (ids: () => string): Sequence => ({
    bpm: 120,
    swing: 0,
    chain: ['A'],
    tracks: [1, 2, 3, 4].map(n => newTrack(ids(), `Track ${n}`)),
});

/** Frames per sixteenth. */
export const stepFrames = (bpm: number, sampleRate: number) => (60 / bpm / 4) * sampleRate;

/** As many patterns (bars) as fit the 42 s the hardware plays. */
export const maxChain = (bpm: number) =>
    Math.max(1, Math.min(MAX_CHAIN, Math.floor(OUTPUT_MAX_SECONDS / ((240 / bpm)) + 1e-9)));

/** Global step k's frame: its own line, rounded on its own; odd steps late by the swing. */
export const stepAt = (seq: Pick<Sequence, 'bpm' | 'swing'>, k: number, sampleRate: number): number => {
    const step = stepFrames(seq.bpm, sampleRate);
    return Math.round(k * step) + (k % 2 === 1 ? Math.round(seq.swing * step) : 0);
};

/** The whole chain, exactly: patterns × 16 steps, no swing at the end. */
export const sequenceFrames = (seq: Sequence, sampleRate: number) =>
    Math.round(seq.chain.length * STEPS * stepFrames(seq.bpm, sampleRate));

export interface SeqHit {
    track: number;
    /** Global step: chain position × 16 + step. */
    step: number;
    at: number;
    sliceId: string;
    /** Linear: velocity × track volume. */
    gain: number;
    /** Track shift, semitones (the slice's own comes on top when it renders). */
    shift: number;
}

/**
 * What plays on global step k (chain position × 16 + step), without its time:
 * the live player asks this per step. Muted tracks out; with any solo, only solos.
 */
export function stepHits(seq: Sequence, k: number): Omit<SeqHit, 'at'>[] {
    const pattern = seq.chain[Math.floor(k / STEPS)];
    if (!pattern) return [];
    const soloed = seq.tracks.some(t => t.solo);
    const out: Omit<SeqHit, 'at'>[] = [];
    seq.tracks.forEach((track, t) => {
        if (track.mute || (soloed && !track.solo)) return;
        const step = track.patterns[pattern][k % STEPS];
        const sliceId = step?.on ? step.sliceId ?? track.sliceId : null;
        if (!sliceId) return;
        out.push({
            track: t, step: k, sliceId,
            gain: step.velocity * Math.pow(10, track.volumeDb / 20),
            shift: track.shift + (step.shift ?? 0),
        });
    });
    return out;
}

/** Every hit of the chain, in time order. */
export function sequenceHits(seq: Sequence, sampleRate: number): SeqHit[] {
    const hits: SeqHit[] = [];
    for (let k = 0; k < seq.chain.length * STEPS; k++) {
        const at = stepAt(seq, k, sampleRate);
        for (const h of stepHits(seq, k)) hits.push({ ...h, at });
    }
    return hits;
}

/**
 * The mix. Each hit's audio comes from `audioFor` (null: left out). A tail that
 * runs past the end folds into the start when `fold` is on, so the chain loops
 * without a gap or a cut; otherwise it is cut at the end.
 */
export function mixSequence(
    hits: readonly SeqHit[], audioFor: (hit: SeqHit) => Stereo | null, total: number, fold: boolean,
): Stereo {
    const l = new Float32Array(total), r = new Float32Array(total);
    for (const hit of hits) {
        const audio = audioFor(hit);
        if (!audio) continue;
        const [al, ar] = audio;
        for (let i = 0; i < al.length; i++) {
            let at = hit.at + i;
            if (at >= total) {
                if (!fold) break;
                at %= total;
            }
            l[at] += al[i] * hit.gain;
            r[at] += ar[i] * hit.gain;
        }
    }
    return [l, r];
}

/** Cue points: at each step with a hit, at each beat, or at each bar (pattern). */
export function sequenceCues(seq: Sequence, hits: readonly SeqHit[], mode: SeqCues, sampleRate: number): number[] {
    if (mode === 'hits') return [...new Set(hits.map(h => h.at))].sort((a, b) => a - b);
    const every = mode === 'beats' ? 4 : STEPS;
    const out: number[] = [];
    for (let k = 0; k < seq.chain.length * STEPS; k += every) out.push(stepAt(seq, k, sampleRate));
    return out;
}
