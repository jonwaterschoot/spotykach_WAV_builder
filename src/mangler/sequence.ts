import type { Stereo } from './dsp.ts';
import { NOTE_NAMES } from './pitch.ts';
import { OUTPUT_MAX_SECONDS, scalePitchClasses } from './settings.ts';

/**
 * The step sequencer: four patterns (A–D) of 16 sixteenth-note steps, a chain
 * that plays them in order, and tracks of three kinds:
 *
 * - slice: plays a slice from the pool, repitched per step;
 * - cue: plays the segments of a sample with cue points, the step's note
 *   picking the segment (C1 the first cue, C#1 the second, …);
 * - cc: sends one of the Spotykach's MIDI CCs, a value per step or an LFO.
 *
 * Slice and cue tracks can also send their steps to a Spotykach deck as notes.
 * Pure functions here: where the hits fall, the controls, and the mix. Live
 * playback is in ui/useSequencePlayer.ts, MIDI in ui/useMidiLink.ts.
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
    /** Cue tracks: the note that picks the cue (CUE_BASE_NOTE is the first). */
    note?: number;
}

export type TrackKind = 'slice' | 'cue' | 'cc';

/** A sample with cue points, for a cue track: each cue starts a segment that runs to the next. */
export interface CueSound {
    kind: 'result' | 'source';
    id: string;
    name: string;
    /** Seconds, ascending, the first usually 0. */
    cues: number[];
    duration: number;
}

export type LfoShape = 'sine' | 'triangle' | 'saw' | 'square' | 'random';

export interface CcSetup {
    cc: number;
    /** A value per step, or an LFO running over the chain. */
    mode: 'steps' | 'lfo';
    lfo: {
        shape: LfoShape;
        /** Steps per cycle: 16 is a bar. */
        rateSteps: number;
        /** 0–127. */
        min: number;
        max: number;
        /** 0–1 of a cycle. */
        phase: number;
    };
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
    /**
     * Send the steps to a Spotykach deck as MIDI notes (60 + pitch), over the
     * link. Such a track plays even without a slice: the deck makes the sound.
     * A CC track sends to this deck's channel (A when unset).
     */
    midi?: Deck;
    /** Absent: slice. */
    kind?: TrackKind;
    cue?: CueSound;
    cc?: CcSetup;
    /** Step pitches snap to the sequence's scale. */
    scaleLock?: boolean;
}

export interface Sequence {
    bpm: number;
    /** 0–0.5 of a step: how late every second sixteenth comes. */
    swing: number;
    chain: PatternId[];
    tracks: SeqTrack[];
    /** The scale tracks with `scaleLock` snap to: root (0 = C) and a 12-bit mask (settings.ts). */
    scale?: { root: number; mask: number };
}

/** The Spotykach's two decks, each on its own MIDI channel. */
export type Deck = 'A' | 'B';

/** Where the cue points of a rendered sequence go. */
export type SeqCues = 'hits' | 'beats' | 'bars';

export const emptySteps = (): SeqStep[] => Array.from({ length: STEPS }, () => ({ on: false, velocity: 1 }));

/** C1, where cue tracks start: the first cue. */
export const CUE_BASE_NOTE = 24;
/** Middle C: a slice or deck at its own pitch. */
export const ROOT_NOTE = 60;

/** "C1", "F#3": C4 is 60. */
export const noteName = (note: number) => `${NOTE_NAMES[((note % 12) + 12) % 12]}${Math.floor(note / 12) - 1}`;

/**
 * The Spotykach's MIDI CCs (its manual's table, and config.h). Values go 0–127;
 * a toggle acts on a non-zero value, as a tap would; a momentary one is on
 * while non-zero.
 */
export const SK_CCS: { cc: number; name: string; kind: 'value' | 'toggle' | 'momentary' }[] = [
    { cc: 20, name: 'Position', kind: 'value' },
    { cc: 21, name: 'Position offset', kind: 'value' },
    { cc: 22, name: 'Size', kind: 'value' },
    { cc: 23, name: 'Envelope', kind: 'value' },
    { cc: 24, name: 'Pitch', kind: 'value' },
    { cc: 25, name: 'Deck mix', kind: 'value' },
    { cc: 26, name: 'Overdub feedback', kind: 'value' },
    { cc: 27, name: 'Drift envelope size', kind: 'value' },
    { cc: 28, name: 'Drift window size', kind: 'value' },
    { cc: 89, name: 'Modulation cycle', kind: 'value' },
    { cc: 90, name: 'Modulation glow', kind: 'value' },
    { cc: 103, name: 'Grit intensity', kind: 'value' },
    { cc: 104, name: 'Grit mix', kind: 'value' },
    { cc: 106, name: 'Flux intensity', kind: 'value' },
    { cc: 107, name: 'Flux feedback', kind: 'value' },
    { cc: 108, name: 'Flux mix', kind: 'value' },
    { cc: 102, name: 'Grit on', kind: 'momentary' },
    { cc: 105, name: 'Flux on', kind: 'momentary' },
    { cc: 85, name: 'Play forward', kind: 'toggle' },
    { cc: 86, name: 'Play reverse', kind: 'toggle' },
    { cc: 14, name: 'Record from the input', kind: 'toggle' },
    { cc: 15, name: 'Record from the other deck', kind: 'toggle' },
];
export const ccInfo = (cc: number) => SK_CCS.find(c => c.cc === cc) ?? { cc, name: `CC ${cc}`, kind: 'value' as const };

export const defaultCc = (): CcSetup => ({ cc: 22, mode: 'steps', lfo: { shape: 'sine', rateSteps: 16, min: 0, max: 127, phase: 0 } });

/** The nearest note whose pitch class is in the scale (ties go up). */
export function snapToScale(note: number, scale: { root: number; mask: number } | undefined): number {
    if (!scale) return note;
    const classes = new Set(scalePitchClasses(scale.root, scale.mask));
    for (let d = 0; d <= 6; d++) {
        if (classes.has((((note + d) % 12) + 12) % 12)) return note + d;
        if (classes.has((((note - d) % 12) + 12) % 12)) return note - d;
    }
    return note;
}

/**
 * The sound one step of a track makes, wherever it falls: the slice (or the
 * cue's segment, as an id `renderable` by the host), the shift to render it at,
 * and the note it is on a Spotykach deck. Null: nothing plays.
 */
export function stepSound(seq: Pick<Sequence, 'scale'>, track: SeqTrack, step: SeqStep):
    { sliceId: string | null; shift: number; note: number } | null {
    if (!step.on || track.kind === 'cc') return null;
    if (track.kind === 'cue') {
        const note = step.note ?? CUE_BASE_NOTE;
        const i = note - CUE_BASE_NOTE;
        const cue = track.cue;
        const sliceId = cue && i >= 0 && i < cue.cues.length
            ? cueSoundId(cue, i)
            : null;
        if (!sliceId && !track.midi) return null;
        return { sliceId, shift: 0, note };
    }
    const sliceId = step.sliceId ?? track.sliceId;
    if (!sliceId && !track.midi) return null;
    let note = ROOT_NOTE + track.shift + (step.shift ?? 0);
    if (track.scaleLock) note = snapToScale(Math.round(note), seq.scale);
    return { sliceId, shift: note - ROOT_NOTE, note: Math.round(note) };
}

/** A cue's segment as a sound id: `cue:<kind>:<id>:<start>:<end>` (seconds). */
export const cueSoundId = (cue: CueSound, i: number) =>
    `cue:${cue.kind}:${cue.id}:${cue.cues[i]}:${cue.cues[i + 1] ?? cue.duration}`;

export const parseCueSoundId = (id: string) => {
    const [tag, kind, ref, start, end] = id.split(':');
    if (tag !== 'cue' || (kind !== 'result' && kind !== 'source')) return null;
    return { kind: kind as 'result' | 'source', id: ref, start: Number(start), end: Number(end) };
};

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
    /** Null on a MIDI track without a slice: only the deck plays it. */
    sliceId: string | null;
    /** Linear: velocity × track volume. */
    gain: number;
    /** The step's own velocity, 0–1 (for MIDI). */
    velocity: number;
    /** Track shift plus the step's, semitones (the slice's own comes on top when it renders). */
    shift: number;
    /** The note for a Spotykach deck. */
    note: number;
    deck?: Deck;
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
        const sound = step && stepSound(seq, track, step);
        if (!sound) return;
        out.push({
            track: t, step: k, sliceId: sound.sliceId,
            gain: step.velocity * Math.pow(10, track.volumeDb / 20),
            velocity: step.velocity,
            shift: sound.shift,
            note: sound.note,
            ...(track.midi ? { deck: track.midi } : {}),
        });
    });
    return out;
}

/**
 * The sequence without what has gone from the mangler: slices (a track's, a
 * step's lock) and the samples cue tracks play (a result or a pool file, by
 * id). Unchanged, it is the same object.
 */
export function pruneSequence(seq: Sequence, goneSlices: ReadonlySet<string>, goneOwners: ReadonlySet<string>): Sequence {
    let changed = false;
    const tracks = seq.tracks.map(track => {
        let next = track;
        if (track.sliceId && goneSlices.has(track.sliceId)) next = { ...next, sliceId: null };
        if (track.cue && goneOwners.has(track.cue.id)) next = { ...next, cue: undefined };
        const locked = (Object.values(track.patterns) as SeqStep[][]).some(steps => steps.some(s => s.sliceId && goneSlices.has(s.sliceId)));
        if (locked) {
            const patterns = { ...next.patterns };
            for (const p of Object.keys(patterns) as PatternId[]) {
                patterns[p] = patterns[p].map(s => (s.sliceId && goneSlices.has(s.sliceId) ? { ...s, sliceId: undefined } : s));
            }
            next = { ...next, patterns };
        }
        if (next !== track) changed = true;
        return next;
    });
    return changed ? { ...seq, tracks } : seq;
}

/** Every sound a sequence can make (any pattern), to render ahead of playing. */
export function sequenceSounds(seq: Sequence): { sliceId: string; shift: number }[] {
    const out = new Map<string, { sliceId: string; shift: number }>();
    for (const track of seq.tracks) {
        for (const steps of Object.values(track.patterns)) {
            for (const step of steps) {
                const sound = stepSound(seq, track, step);
                if (sound?.sliceId) out.set(`${sound.sliceId}|${sound.shift}`, { sliceId: sound.sliceId, shift: sound.shift });
            }
        }
    }
    return [...out.values()];
}

// ---------------------------------------------------------------------------
// CC tracks
// ---------------------------------------------------------------------------

export interface SeqControl {
    track: number;
    deck: Deck;
    cc: number;
    /** Where in the step, 0–1. */
    at: number;
    value: number;
}

/** A small hash for the random LFO: the same cycle always gives the same value. */
const hash01 = (n: number) => {
    let x = (n * 2654435761) >>> 0;
    x ^= x >>> 16; x = Math.imul(x, 2246822507) >>> 0; x ^= x >>> 13;
    return (x >>> 0) / 4294967296;
};

/** An LFO's value, 0–1, at `cycles` (cycles since the chain began). */
export function lfoAt(shape: LfoShape, cycles: number, seed = 0): number {
    const ph = ((cycles % 1) + 1) % 1;
    switch (shape) {
        case 'sine': return 0.5 - 0.5 * Math.cos(2 * Math.PI * ph);
        case 'triangle': return 1 - Math.abs(2 * ph - 1);
        case 'saw': return ph;
        case 'square': return ph < 0.5 ? 1 : 0;
        case 'random': return hash01(Math.floor(cycles) * 31 + seed);
    }
}

/** LFO messages per step: four, smooth enough for a knob at 120 bpm. */
export const LFO_PER_STEP = 4;

/**
 * The CC messages of global step k: a value per switched-on step, or the LFO
 * four times a step. A toggle CC sends 127 on its steps; a momentary one 127,
 * and 0 near the end of the step when the next step is off.
 */
export function stepControls(seq: Sequence, k: number): SeqControl[] {
    const total = seq.chain.length * STEPS;
    const pattern = seq.chain[Math.floor(k / STEPS)];
    if (!pattern) return [];
    const soloed = seq.tracks.some(t => t.solo);
    const out: SeqControl[] = [];
    seq.tracks.forEach((track, t) => {
        if (track.kind !== 'cc' || !track.cc || track.mute || (soloed && !track.solo)) return;
        const { cc, mode, lfo } = track.cc;
        const deck = track.midi ?? 'A';
        if (mode === 'lfo') {
            const span = Math.max(1, lfo.rateSteps);
            for (let i = 0; i < LFO_PER_STEP; i++) {
                const v = lfoAt(lfo.shape, (k + i / LFO_PER_STEP) / span + lfo.phase, t);
                out.push({ track: t, deck, cc, at: i / LFO_PER_STEP, value: Math.round(lfo.min + (lfo.max - lfo.min) * v) });
            }
            return;
        }
        const step = track.patterns[pattern][k % STEPS];
        if (!step?.on) return;
        const kind = ccInfo(cc).kind;
        out.push({ track: t, deck, cc, at: 0, value: kind === 'value' ? Math.round(step.velocity * 127) : 127 });
        if (kind === 'momentary') {
            const nextK = (k + 1) % total;
            const next = track.patterns[seq.chain[Math.floor(nextK / STEPS)]][nextK % STEPS];
            if (!next?.on) out.push({ track: t, deck, cc, at: 0.9, value: 0 });
        }
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
    // Only hits with a sound in the file: a MIDI-only step is not in it.
    if (mode === 'hits') return [...new Set(hits.filter(h => h.sliceId).map(h => h.at))].sort((a, b) => a - b);
    const every = mode === 'beats' ? 4 : STEPS;
    const out: number[] = [];
    for (let k = 0; k < seq.chain.length * STEPS; k += every) out.push(stepAt(seq, k, sampleRate));
    return out;
}
