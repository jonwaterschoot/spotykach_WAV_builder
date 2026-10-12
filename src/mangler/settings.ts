/**
 * The mangler's sliders. Ranges are min/max pairs; the dice pick a value inside
 * them per snippet. See docs/sample_mangler/sample-mangler-plan.md, "Parameters".
 */

export type RepitchMode = 'off' | 'suggest' | 'apply';
export type SourceMix = 'even' | 'length';
/** Fill to a length (as many snippets as fit), or make a number of snippets (whatever length that gives). */
export type FillMode = 'length' | 'count';
export type SnapStart = 'off' | 'zero' | 'onset';
export type Resampler = 'linear' | 'sinc';

export interface MangleSettings {
    fillMode: FillMode;
    /** Length of the result, in `length` mode. The hardware plays the first 42 s. */
    outputSeconds: number;
    /** Snippets per result, in `count` mode. The file ends where the last one does (42 s at most). */
    snippetCount: number;
    snippetMinMs: number;
    snippetMaxMs: number;
    /** −1 favours short snippets, +1 long ones. */
    bias: number;
    xfadeMinMs: number;
    xfadeMaxMs: number;
    /** Leave clicks in where the crossfade is 0. Off adds a 2 ms declick fade. */
    hardCuts: boolean;
    /** 0–1, per snippet. */
    reverseProbability: number;
    /** Where a snippet may start: anywhere, on a zero crossing, or on a transient. */
    snapStart: SnapStart;
    /** End a snippet before the next hit, so each cue point holds one sound (drum loops). */
    oneHit: boolean;
    /** Gated RMS every snippet is matched to. */
    loudnessTargetDb: number;
    /** Random ± deviation from the target, for dynamics on purpose. */
    loudnessSpreadDb: number;
    /** Caps the gain, so near-silent snippets aren't pulled up into hiss. */
    maxBoostDb: number;
    skipSilence: boolean;
    silenceThresholdDb: number;
    repitch: RepitchMode;
    /** Below this, a snippet keeps its own pitch. 0–1. */
    pitchConfidence: number;
    /** Repitch target: the scale's root, 0 = C … 11 = B. */
    scaleRoot: number;
    /**
     * The scale as a 12-bit mask relative to the root: bit 0 is the root, bit 7
     * the fifth. `1` (root only) is the original "repitch to C".
     */
    scaleMask: number;
    /** Extra random shift of up to ± this many semitones. */
    detuneSt: number;
    /** Windowed sinc keeps the highs on big shifts; linear is the old, duller one. */
    resampler: Resampler;
    sourceMix: SourceMix;
    /** 0 = no cap. */
    maxPerSource: number;
    cuePoints: boolean;
    /** Crossfade the end into the start so the file loops cleanly. */
    loop: boolean;
    /** Brick-wall the peaks at −1 dBFS; off scales the whole file down instead. */
    limiter: boolean;
    /** How many variations one click renders. */
    variations: number;
}

export const OUTPUT_MAX_SECONDS = 42;
export const SNIPPET_MIN_MS = 20;
export const SNIPPET_MAX_MS = 10000;
export const XFADE_MAX_MS = 3000;
export const VARIATIONS_MAX = 12;
/** `kMaxFileCuePoints` in the firmware. */
export const MAX_CUE_POINTS = 255;

export const DEFAULT_SETTINGS: MangleSettings = {
    fillMode: 'length',
    outputSeconds: 42,
    snippetCount: 16,
    snippetMinMs: 150,
    snippetMaxMs: 2000,
    bias: 0,
    xfadeMinMs: 5,
    xfadeMaxMs: 40,
    hardCuts: false,
    reverseProbability: 0.25,
    snapStart: 'off',
    oneHit: false,
    loudnessTargetDb: -18,
    loudnessSpreadDb: 0,
    maxBoostDb: 24,
    skipSilence: true,
    silenceThresholdDb: -50,
    repitch: 'suggest',
    pitchConfidence: 0.8,
    scaleRoot: 0,
    scaleMask: 1,
    detuneSt: 0,
    resampler: 'sinc',
    sourceMix: 'even',
    maxPerSource: 0,
    cuePoints: true,
    loop: false,
    limiter: true,
    variations: 4,
};

/** Starting points for the preset menu. Each only overrides what it cares about. */
export const PRESETS: Record<string, Partial<MangleSettings>> = {
    Glitch: {
        snippetMinMs: 20, snippetMaxMs: 300, bias: -0.4,
        xfadeMinMs: 0, xfadeMaxMs: 3, hardCuts: true,
        reverseProbability: 0.4, loudnessSpreadDb: 6, detuneSt: 0,
    },
    Texture: {
        snippetMinMs: 800, snippetMaxMs: 6000, bias: 0.3,
        xfadeMinMs: 300, xfadeMaxMs: 2000, hardCuts: false,
        reverseProbability: 0.5, loudnessSpreadDb: 3, detuneSt: 0,
    },
    Phrases: {
        snippetMinMs: 400, snippetMaxMs: 3000, bias: 0,
        xfadeMinMs: 10, xfadeMaxMs: 60, hardCuts: false,
        reverseProbability: 0.1, loudnessSpreadDb: 0, repitch: 'apply',
    },
};

/**
 * Settings read back from storage or typed in: every number clamped to its range,
 * every pair in order, every missing field defaulted.
 */
export function sanitizeSettings(input: Partial<MangleSettings> | null | undefined): MangleSettings {
    const s: MangleSettings = { ...DEFAULT_SETTINGS, ...(input ?? {}) };
    const clamp = (v: number, lo: number, hi: number, fallback: number) =>
        Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
    const d = DEFAULT_SETTINGS;

    s.outputSeconds = clamp(s.outputSeconds, 1, OUTPUT_MAX_SECONDS, d.outputSeconds);
    s.snippetCount = Math.round(clamp(s.snippetCount, 1, MAX_CUE_POINTS, d.snippetCount));
    if (!['length', 'count'].includes(s.fillMode)) s.fillMode = d.fillMode;
    s.snippetMinMs = clamp(s.snippetMinMs, SNIPPET_MIN_MS, SNIPPET_MAX_MS, d.snippetMinMs);
    s.snippetMaxMs = clamp(s.snippetMaxMs, SNIPPET_MIN_MS, SNIPPET_MAX_MS, d.snippetMaxMs);
    if (s.snippetMaxMs < s.snippetMinMs) [s.snippetMinMs, s.snippetMaxMs] = [s.snippetMaxMs, s.snippetMinMs];
    s.bias = clamp(s.bias, -1, 1, d.bias);
    s.xfadeMinMs = clamp(s.xfadeMinMs, 0, XFADE_MAX_MS, d.xfadeMinMs);
    s.xfadeMaxMs = clamp(s.xfadeMaxMs, 0, XFADE_MAX_MS, d.xfadeMaxMs);
    if (s.xfadeMaxMs < s.xfadeMinMs) [s.xfadeMinMs, s.xfadeMaxMs] = [s.xfadeMaxMs, s.xfadeMinMs];
    s.reverseProbability = clamp(s.reverseProbability, 0, 1, d.reverseProbability);
    s.loudnessTargetDb = clamp(s.loudnessTargetDb, -30, -6, d.loudnessTargetDb);
    s.loudnessSpreadDb = clamp(s.loudnessSpreadDb, 0, 12, d.loudnessSpreadDb);
    s.maxBoostDb = clamp(s.maxBoostDb, 0, 36, d.maxBoostDb);
    s.silenceThresholdDb = clamp(s.silenceThresholdDb, -70, -30, d.silenceThresholdDb);
    s.pitchConfidence = clamp(s.pitchConfidence, 0, 1, d.pitchConfidence);
    s.detuneSt = clamp(s.detuneSt, 0, 12, d.detuneSt);
    s.scaleRoot = Math.round(clamp(s.scaleRoot, 0, 11, d.scaleRoot));
    s.scaleMask = Math.round(clamp(s.scaleMask, 0, 4095, d.scaleMask)) | 1; // the root is always in
    s.maxPerSource = Math.round(clamp(s.maxPerSource, 0, 999, d.maxPerSource));
    s.variations = Math.round(clamp(s.variations, 1, VARIATIONS_MAX, d.variations));
    if (!['off', 'suggest', 'apply'].includes(s.repitch)) s.repitch = d.repitch;
    if (!['even', 'length'].includes(s.sourceMix)) s.sourceMix = d.sourceMix;
    if (!['off', 'zero', 'onset'].includes(s.snapStart)) s.snapStart = d.snapStart;
    if (!['linear', 'sinc'].includes(s.resampler)) s.resampler = d.resampler;
    for (const key of ['hardCuts', 'oneHit', 'skipSilence', 'cuePoints', 'loop', 'limiter'] as const) {
        s[key] = typeof s[key] === 'boolean' ? s[key] : d[key];
    }
    return s;
}

/** Scales for the pitch menu, as intervals from the root. */
export const SCALES: { name: string; intervals: number[] }[] = [
    { name: 'Root only', intervals: [0] },
    { name: 'Chromatic', intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
    { name: 'Major', intervals: [0, 2, 4, 5, 7, 9, 11] },
    { name: 'Minor', intervals: [0, 2, 3, 5, 7, 8, 10] },
    { name: 'Dorian', intervals: [0, 2, 3, 5, 7, 9, 10] },
    { name: 'Lydian', intervals: [0, 2, 4, 6, 7, 9, 11] },
    { name: 'Mixolydian', intervals: [0, 2, 4, 5, 7, 9, 10] },
    { name: 'Pentatonic major', intervals: [0, 2, 4, 7, 9] },
    { name: 'Pentatonic minor', intervals: [0, 3, 5, 7, 10] },
    { name: 'Fifths', intervals: [0, 7] },
];

export const maskFromIntervals = (intervals: readonly number[]): number =>
    intervals.reduce((mask, i) => mask | (1 << (((i % 12) + 12) % 12)), 0);

/** The scale's pitch classes (0 = C), from root and mask. */
export const scalePitchClasses = (root: number, mask: number): number[] => {
    const out: number[] = [];
    for (let i = 0; i < 12; i++) if (mask & (1 << i)) out.push((root + i) % 12);
    return out;
};

/** The preset a mask matches, or null for a custom scale. */
export const scaleName = (mask: number): string | null =>
    SCALES.find(sc => maskFromIntervals(sc.intervals) === mask)?.name ?? null;
