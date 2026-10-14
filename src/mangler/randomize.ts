import type { HitClass } from './hits.ts';
import { CUE_BASE_NOTE, STEPS, type CcSetup, type LfoShape, type PatternId, type SeqStep } from './sequence.ts';
import {
    BPM_MAX, BPM_MIN, SCALES, maskFromIntervals, sanitizeSettings, type GridDivision, type MangleSettings,
} from './settings.ts';
import { GENERATORS, type SynthKind, type SynthRanges } from './synth.ts';

/**
 * The dice buttons: settings, sequencer patterns and synth ranges rolled to
 * something worth hearing. Not the whole slider range: each roll stays where
 * the results are usable (snippets that aren't all 20 ms, crossfades shorter
 * than the snippets, rests now and then rather than always).
 *
 * `r` is the source of randomness (Math.random by default), so the checks can
 * pass a seeded one.
 */

type R = () => number;

const between = (r: R, a: number, b: number) => a + (b - a) * r();
const logBetween = (r: R, a: number, b: number) => a * Math.pow(b / a, r());
const pickOne = <T>(r: R, list: readonly T[]): T => list[Math.floor(r() * list.length) % list.length];
const chance = (r: R, p: number) => r() < p;
const round = (v: number, step: number) => Math.round(v / step) * step;

/** The settings groups that have a dice (see ui/SettingsPanel.tsx). */
export type DiceGroup = 'shape' | 'tempo' | 'loudness' | 'envelope' | 'pitch' | 'file';

export function rollGroup(group: DiceGroup, r: R = Math.random): Partial<MangleSettings> {
    switch (group) {
        case 'shape': {
            const min = round(logBetween(r, 20, 1500), 5);
            const max = Math.min(10000, round(min * logBetween(r, 1.5, 8), 5));
            const xMax = Math.min(min / 2, round(logBetween(r, 2, 300), 1));
            return {
                snippetMinMs: min, snippetMaxMs: max,
                bias: round(between(r, -0.6, 0.6), 0.05),
                xfadeMinMs: round(xMax * between(r, 0, 0.4), 1), xfadeMaxMs: xMax,
                hardCuts: chance(r, 0.2),
                snapStart: pickOne(r, ['off', 'off', 'zero', 'onset'] as const),
                oneHit: chance(r, 0.2),
                reverseProbability: round(between(r, 0, 0.6), 0.05),
            };
        }
        case 'tempo': {
            const division = pickOne<GridDivision>(r, ['1/16', '1/16', '1/8', '1/16T', '1/8T', '1/4']);
            const stepsMin = pickOne(r, [1, 1, 2]);
            return {
                bpm: Math.round(between(r, Math.max(BPM_MIN, 80), Math.min(BPM_MAX, 170))),
                division,
                stepsMin, stepsMax: stepsMin + pickOne(r, [0, 1, 3, 7]),
                gridFit: chance(r, 0.3) ? 'tape' : 'cut',
            };
        }
        case 'loudness': {
            const softMin = round(between(r, 3, 9), 1);
            return {
                loudnessSpreadDb: round(between(r, 0, 6), 0.5),
                restProbability: chance(r, 0.5) ? round(between(r, 0.05, 0.3), 0.01) : 0,
                softProbability: chance(r, 0.5) ? round(between(r, 0.1, 0.4), 0.01) : 0,
                softMinDb: softMin, softMaxDb: softMin + round(between(r, 3, 12), 1),
            };
        }
        case 'envelope': {
            const decayMin = round(logBetween(r, 30, 600), 5);
            const attackMax = round(logBetween(r, 1, 120), 1);
            return {
                envelope: true,
                attackMinMs: chance(r, 0.6) ? 0 : round(attackMax * between(r, 0, 0.5), 1), attackMaxMs: attackMax,
                decayMinMs: decayMin, decayMaxMs: Math.min(10000, round(decayMin * logBetween(r, 1.5, 6), 5)),
                envelopeCurve: chance(r, 0.7) ? 'exp' : 'linear',
            };
        }
        case 'pitch': {
            const scale = pickOne(r, SCALES);
            return {
                repitch: chance(r, 0.6) ? 'apply' : 'suggest',
                scaleRoot: Math.floor(r() * 12),
                scaleMask: maskFromIntervals(scale.intervals),
                pitchConfidence: round(between(r, 0.6, 0.9), 0.05),
                detuneSt: chance(r, 0.6) ? 0 : round(between(r, 0.5, 4), 0.5),
            };
        }
        case 'file':
            return { loop: chance(r, 0.4), cuePoints: true };
    }
    return {};
}

/** Every group at once ("Surprise"), sanitised. The fill and the output length stay. */
export const rollAll = (s: MangleSettings, r: R = Math.random): MangleSettings => sanitizeSettings({
    ...s,
    ...rollGroup('shape', r),
    ...rollGroup('loudness', r),
    ...(chance(r, 0.4) ? rollGroup('envelope', r) : { envelope: false }),
    ...rollGroup('pitch', r),
    ...rollGroup('file', r),
    ...(s.grid ? rollGroup('tempo', r) : {}),
});

// ---------------------------------------------------------------------------
// Sequencer
// ---------------------------------------------------------------------------

/**
 * A pattern for one track, after the slice's class: low on the beats, high
 * busier and on the off-beats, mid on the backbeat. Downbeats loud, the rest a
 * little softer. Unknown class: sparse and even.
 */
export function rollSteps(cls: HitClass | undefined, r: R = Math.random): SeqStep[] {
    const odds = (i: number): number => {
        if (cls === 'low') return i % 4 === 0 ? (i === 0 ? 1 : 0.7) : i % 2 === 0 ? 0.12 : 0.06;
        if (cls === 'mid') return i % 8 === 4 ? 0.9 : i % 2 === 0 ? 0.12 : 0.1;
        if (cls === 'high') return i % 2 === 0 ? 0.45 : 0.55;
        return 0.22;
    };
    return Array.from({ length: STEPS }, (_, i) => {
        const on = r() < odds(i);
        return { on, velocity: on ? (i % 4 === 0 ? 1 : round(between(r, 0.45, 0.95), 0.05)) : 1 };
    });
}

/**
 * A pattern for a cue track: hits mostly on the beats and the eighths, each
 * picking a cue at random (its note), velocities a little uneven.
 */
export function rollCueSteps(cueCount: number, r: R = Math.random): SeqStep[] {
    return Array.from({ length: STEPS }, (_, i) => {
        const on = r() < (i % 4 === 0 ? 0.75 : i % 2 === 0 ? 0.4 : 0.2);
        return {
            on,
            velocity: on ? round(between(r, 0.6, 1), 0.05) : 1,
            note: CUE_BASE_NOTE + Math.floor(r() * Math.max(1, cueCount)),
        };
    });
}

/** A CC track's steps: about half on, each with its own value. */
export const rollCcSteps = (r: R = Math.random): SeqStep[] =>
    Array.from({ length: STEPS }, () => ({ on: chance(r, 0.5), velocity: round(between(r, 0.05, 1), 0.01) }));

/** An LFO for a CC track: any shape, a cycle of 2 steps to 4 bars, a range at least 30 wide. */
export function rollLfo(r: R = Math.random): CcSetup['lfo'] {
    const min = Math.round(between(r, 0, 70));
    return {
        shape: pickOne<LfoShape>(r, ['sine', 'triangle', 'saw', 'square', 'random']),
        rateSteps: pickOne(r, [2, 4, 8, 16, 32, 64]),
        min, max: Math.min(127, min + Math.round(between(r, 30, 127 - min))),
        phase: round(r(), 0.25) % 1,
    };
}

/** A chain of the same length from the patterns that have something in them (A if none). */
export function rollChain(length: number, used: readonly PatternId[], r: R = Math.random): PatternId[] {
    const pool = used.length ? used : (['A'] as PatternId[]);
    const chain: PatternId[] = [pool[0]];
    for (let i = 1; i < length; i++) chain.push(chance(r, 0.5) ? chain[i - 1] : pickOne(r, pool));
    return chain;
}

// ---------------------------------------------------------------------------
// Slices and synth
// ---------------------------------------------------------------------------

/** One of a list at random, or undefined for an empty one. */
export const pickAny = <T>(list: readonly T[], r: R = Math.random): T | undefined =>
    (list.length ? list[Math.floor(r() * list.length) % list.length] : undefined);

/** A handful of slices for a kit: 4–12, taking turns across the classes. */
export function rollSelection<T extends { id: string; cls?: HitClass }>(slices: readonly T[], r: R = Math.random): string[] {
    if (slices.length === 0) return [];
    const want = Math.min(slices.length, 4 + Math.floor(r() * 9));
    const groups = (['low', 'mid', 'high', undefined] as const)
        .map(c => [...slices.filter(s => s.cls === c)].sort(() => r() - 0.5))
        .filter(g => g.length);
    const out: string[] = [];
    for (let k = 0; out.length < want; k++) {
        const g = groups[k % groups.length];
        const next = g.shift();
        if (next) out.push(next.id);
        if (groups.every(x => x.length === 0)) break;
    }
    return out;
}

/** Each of a generator's ranges rolled inside the parameter's bounds, at least a fifth of it wide. */
export function rollRanges(kind: SynthKind, r: R = Math.random): SynthRanges {
    const out: SynthRanges = {};
    for (const q of GENERATORS[kind].params) {
        const fromU = (u: number) => (q.log ? q.min * Math.pow(q.max / q.min, u) : q.min + u * (q.max - q.min));
        const width = between(r, 0.2, 0.6);
        const lo = between(r, 0, 1 - width);
        const a = fromU(lo), b = fromU(lo + width);
        const step = q.key === 'bursts' ? 1 : 0;
        out[q.key] = step ? [Math.round(a), Math.max(Math.round(a), Math.round(b))] : [a, b];
    }
    return out;
}
