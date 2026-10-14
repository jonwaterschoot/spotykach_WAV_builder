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
/** Which hit detector "one hit per snippet" uses. Recipes from before 'flux' existed read as 'energy'. */
export type Detector = 'energy' | 'flux';
export type EnvelopeCurve = 'exp' | 'linear';
/** Grid steps per bar of 4/4: quarters, eighths, sixteenths, and their triplets. */
export type GridDivision = '1/4' | '1/8' | '1/16' | '1/8T' | '1/16T';
/** Cut: exactly the frames the steps need. Tape: the snippet sped up or slowed to fit, pitch and all. */
export type GridFit = 'cut' | 'tape';

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
    /**
     * Polyphony: a snippet keeps sounding while the next ones start, so a long
     * one rings under several short ones (summed; the crossfade is then each
     * snippet's fade in and out). Off the tempo grid only.
     */
    polyphony: boolean;
    /** How far into a snippet the next one may start, % of its length: each snippet picks between. */
    overlapMinPct: number;
    overlapMaxPct: number;
    /** At most this many snippets sound at once; a new one waits for the first to end. */
    maxLayers: number;
    /** 0–1, per snippet. */
    reverseProbability: number;
    /** Where a snippet may start: anywhere, on a zero crossing, or on a transient. */
    snapStart: SnapStart;
    /** End a snippet before the next hit, so each cue point holds one sound (drum loops). */
    oneHit: boolean;
    /** `flux`: hits.ts, which also ends a snippet where its hit has died away. */
    detector: Detector;
    /** Gated RMS every snippet is matched to. */
    loudnessTargetDb: number;
    /** Random ± deviation from the target, for dynamics on purpose. */
    loudnessSpreadDb: number;
    /** Caps the gain, so near-silent snippets aren't pulled up into hiss. */
    maxBoostDb: number;
    skipSilence: boolean;
    silenceThresholdDb: number;
    /** 0–1, per snippet: the snippet is a rest (silence of its own length, cue point kept). */
    restProbability: number;
    /** 0–1, per snippet: the snippet is turned down by an amount between the two below. */
    softProbability: number;
    softMinDb: number;
    softMaxDb: number;
    /** An attack–decay envelope on every snippet, picked per snippet from the ranges below. */
    envelope: boolean;
    attackMinMs: number;
    attackMaxMs: number;
    /** To −60 dB (exp) or to silence (linear), counted from the end of the attack. */
    decayMinMs: number;
    decayMaxMs: number;
    envelopeCurve: EnvelopeCurve;
    /**
     * Tempo grid: the file is exactly `bars` bars of 4/4 at `bpm`, every snippet
     * starts on a grid line and lasts whole steps. Replaces the fill, the output
     * length, the snippet length in ms and the crossfade (none: cuts on the line).
     */
    grid: boolean;
    bpm: number;
    division: GridDivision;
    bars: number;
    stepsMin: number;
    stepsMax: number;
    gridFit: GridFit;
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
/** How far a soft part may be turned down. */
export const SOFT_MAX_DB = 40;
export const ATTACK_MAX_MS = 500;
export const OVERLAP_MAX_PCT = 95;
export const MAX_LAYERS = 6;
export const BPM_MIN = 40;
export const BPM_MAX = 240;
export const STEPS_MAX = 32;
export const STEPS_PER_BAR: Record<GridDivision, number> = { '1/4': 4, '1/8': 8, '1/16': 16, '1/8T': 12, '1/16T': 24 };
/** Seconds per bar of 4/4. */
export const barSeconds = (bpm: number) => 240 / bpm;
/** As many bars as fit the 42 s the hardware plays. */
export const maxBars = (bpm: number) => Math.max(1, Math.floor(OUTPUT_MAX_SECONDS / barSeconds(bpm) + 1e-9));
export const DECAY_MIN_MS = 10;
export const DECAY_MAX_MS = 10000;

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
    polyphony: false,
    overlapMinPct: 25,
    overlapMaxPct: 75,
    maxLayers: 3,
    reverseProbability: 0.25,
    snapStart: 'off',
    oneHit: false,
    detector: 'flux',
    loudnessTargetDb: -18,
    loudnessSpreadDb: 0,
    maxBoostDb: 24,
    skipSilence: true,
    silenceThresholdDb: -50,
    restProbability: 0,
    softProbability: 0,
    softMinDb: 6,
    softMaxDb: 18,
    envelope: false,
    attackMinMs: 0,
    attackMaxMs: 10,
    decayMinMs: 150,
    decayMaxMs: 1500,
    envelopeCurve: 'exp',
    grid: false,
    bpm: 120,
    division: '1/16',
    bars: 4,
    stepsMin: 1,
    stepsMax: 4,
    gridFit: 'cut',
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
/**
 * Starting points, and styles for the dice: chosen, a preset's values are set,
 * and the dice then stay near them (randomize.ts, rollInStyle) while what the
 * preset leaves out rolls freely.
 */
export const PRESETS: Record<string, Partial<MangleSettings>> = {
    Glitch: {
        snippetMinMs: 20, snippetMaxMs: 300, bias: -0.4,
        xfadeMinMs: 0, xfadeMaxMs: 3, hardCuts: true,
        reverseProbability: 0.4, loudnessSpreadDb: 6, detuneSt: 0,
        grid: false, polyphony: false,
    },
    Texture: {
        snippetMinMs: 800, snippetMaxMs: 6000, bias: 0.3,
        xfadeMinMs: 300, xfadeMaxMs: 2000, hardCuts: false,
        reverseProbability: 0.5, loudnessSpreadDb: 3, detuneSt: 0,
        grid: false, polyphony: false,
    },
    Phrases: {
        snippetMinMs: 400, snippetMaxMs: 3000, bias: 0,
        xfadeMinMs: 10, xfadeMaxMs: 60, hardCuts: false,
        reverseProbability: 0.1, loudnessSpreadDb: 0, repitch: 'apply',
        grid: false, polyphony: false,
    },
    /** One sound per slice, cut at its attack and shaped like a hit: a kit for the slice mode. */
    'Drum hits': {
        oneHit: true, detector: 'flux', snapStart: 'onset',
        snippetMinMs: 60, snippetMaxMs: 400, bias: -0.3,
        xfadeMinMs: 0, xfadeMaxMs: 2, hardCuts: false, reverseProbability: 0.05,
        envelope: true, attackMinMs: 0, attackMaxMs: 2, decayMinMs: 80, decayMaxMs: 400, envelopeCurve: 'exp',
        restProbability: 0, softProbability: 0, grid: false, polyphony: false,
    },
    /** A loop on the tempo grid, snippets on the attacks. */
    'Beat grid': {
        grid: true, bpm: 120, division: '1/16', stepsMin: 1, stepsMax: 4, gridFit: 'cut',
        snapStart: 'onset', restProbability: 0.1, softProbability: 0, reverseProbability: 0.1,
        loop: true, polyphony: false,
    },
    /** On the grid with holes and ghost notes: rests, soft parts, hard edges. */
    'Broken beat': {
        grid: true, division: '1/16', stepsMin: 1, stepsMax: 2, gridFit: 'cut',
        restProbability: 0.25, softProbability: 0.3, softMinDb: 4, softMaxDb: 12,
        reverseProbability: 0.2, hardCuts: true, snapStart: 'onset', polyphony: false,
    },
    /** On the grid, each snippet sped up or slowed down to fit its steps, like tape. */
    'Tape chops': {
        grid: true, division: '1/8', stepsMin: 1, stepsMax: 4, gridFit: 'tape',
        reverseProbability: 0.3, restProbability: 0, polyphony: false,
    },
    /** Many short grains at once (polyphony), shaped and spread in pitch. */
    Cloud: {
        polyphony: true, overlapMinPct: 50, overlapMaxPct: 90, maxLayers: 6,
        snippetMinMs: 40, snippetMaxMs: 250, xfadeMinMs: 5, xfadeMaxMs: 20,
        envelope: true, attackMinMs: 5, attackMaxMs: 40, decayMinMs: 40, decayMaxMs: 250, envelopeCurve: 'linear',
        reverseProbability: 0.5, detuneSt: 2, grid: false,
    },
    /** Long layered stretches with slow fades, looping. */
    Drone: {
        polyphony: true, overlapMinPct: 60, overlapMaxPct: 90, maxLayers: 4,
        snippetMinMs: 2000, snippetMaxMs: 8000, xfadeMinMs: 500, xfadeMaxMs: 2000,
        reverseProbability: 0.4, envelope: false, restProbability: 0, grid: false, loop: true,
    },
    /** Room between the sounds: rests, soft parts and short decays. */
    Sparse: {
        restProbability: 0.35, softProbability: 0.3, softMinDb: 6, softMaxDb: 18,
        snippetMinMs: 100, snippetMaxMs: 800,
        envelope: true, attackMinMs: 0, attackMaxMs: 5, decayMinMs: 100, decayMaxMs: 600, envelopeCurve: 'exp',
        grid: false, polyphony: false,
    },
    /** Pitched snippets moved into A minor pentatonic. */
    Melodic: {
        repitch: 'apply', scaleRoot: 9, scaleMask: 0b10010101001, pitchConfidence: 0.7, detuneSt: 0,
        snippetMinMs: 200, snippetMaxMs: 1200, xfadeMinMs: 10, xfadeMaxMs: 50,
        grid: false, polyphony: false,
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
    s.overlapMinPct = clamp(s.overlapMinPct, 0, OVERLAP_MAX_PCT, d.overlapMinPct);
    s.overlapMaxPct = clamp(s.overlapMaxPct, 0, OVERLAP_MAX_PCT, d.overlapMaxPct);
    if (s.overlapMaxPct < s.overlapMinPct) [s.overlapMinPct, s.overlapMaxPct] = [s.overlapMaxPct, s.overlapMinPct];
    s.maxLayers = Math.round(clamp(s.maxLayers, 2, MAX_LAYERS, d.maxLayers));
    s.loudnessTargetDb = clamp(s.loudnessTargetDb, -30, -6, d.loudnessTargetDb);
    s.loudnessSpreadDb = clamp(s.loudnessSpreadDb, 0, 12, d.loudnessSpreadDb);
    s.maxBoostDb = clamp(s.maxBoostDb, 0, 36, d.maxBoostDb);
    s.silenceThresholdDb = clamp(s.silenceThresholdDb, -70, -30, d.silenceThresholdDb);
    s.restProbability = clamp(s.restProbability, 0, 1, d.restProbability);
    s.softProbability = clamp(s.softProbability, 0, 1, d.softProbability);
    s.softMinDb = clamp(s.softMinDb, 1, SOFT_MAX_DB, d.softMinDb);
    s.softMaxDb = clamp(s.softMaxDb, 1, SOFT_MAX_DB, d.softMaxDb);
    if (s.softMaxDb < s.softMinDb) [s.softMinDb, s.softMaxDb] = [s.softMaxDb, s.softMinDb];
    s.attackMinMs = clamp(s.attackMinMs, 0, ATTACK_MAX_MS, d.attackMinMs);
    s.attackMaxMs = clamp(s.attackMaxMs, 0, ATTACK_MAX_MS, d.attackMaxMs);
    if (s.attackMaxMs < s.attackMinMs) [s.attackMinMs, s.attackMaxMs] = [s.attackMaxMs, s.attackMinMs];
    s.decayMinMs = clamp(s.decayMinMs, DECAY_MIN_MS, DECAY_MAX_MS, d.decayMinMs);
    s.decayMaxMs = clamp(s.decayMaxMs, DECAY_MIN_MS, DECAY_MAX_MS, d.decayMaxMs);
    if (s.decayMaxMs < s.decayMinMs) [s.decayMinMs, s.decayMaxMs] = [s.decayMaxMs, s.decayMinMs];
    if (!['exp', 'linear'].includes(s.envelopeCurve)) s.envelopeCurve = d.envelopeCurve;
    s.bpm = clamp(s.bpm, BPM_MIN, BPM_MAX, d.bpm);
    if (!(s.division in STEPS_PER_BAR)) s.division = d.division;
    s.bars = Math.round(clamp(s.bars, 1, maxBars(s.bpm), Math.min(d.bars, maxBars(s.bpm))));
    s.stepsMin = Math.round(clamp(s.stepsMin, 1, STEPS_MAX, d.stepsMin));
    s.stepsMax = Math.round(clamp(s.stepsMax, 1, STEPS_MAX, d.stepsMax));
    if (s.stepsMax < s.stepsMin) [s.stepsMin, s.stepsMax] = [s.stepsMax, s.stepsMin];
    if (!['cut', 'tape'].includes(s.gridFit)) s.gridFit = d.gridFit;
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
    if (!['energy', 'flux'].includes(s.detector)) s.detector = d.detector;
    for (const key of ['hardCuts', 'oneHit', 'skipSilence', 'cuePoints', 'loop', 'limiter', 'envelope', 'grid', 'polyphony'] as const) {
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
