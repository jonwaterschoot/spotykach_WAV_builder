/**
 * The mangler's sliders. Ranges are min/max pairs; the dice pick a value inside
 * them per snippet. See docs/sample_mangler/sample-mangler-plan.md, "Parameters".
 */

export type RepitchMode = 'off' | 'suggest' | 'apply';
export type SourceMix = 'even' | 'length';

export interface MangleSettings {
    /** Length of the result. The hardware plays the first 42 s. */
    outputSeconds: number;
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
    /** Extra random shift of up to ± this many semitones. */
    detuneSt: number;
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
    outputSeconds: 42,
    snippetMinMs: 150,
    snippetMaxMs: 2000,
    bias: 0,
    xfadeMinMs: 5,
    xfadeMaxMs: 40,
    hardCuts: false,
    reverseProbability: 0.25,
    loudnessTargetDb: -18,
    loudnessSpreadDb: 0,
    maxBoostDb: 24,
    skipSilence: true,
    silenceThresholdDb: -50,
    repitch: 'suggest',
    pitchConfidence: 0.8,
    detuneSt: 0,
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
    s.maxPerSource = Math.round(clamp(s.maxPerSource, 0, 999, d.maxPerSource));
    s.variations = Math.round(clamp(s.variations, 1, VARIATIONS_MAX, d.variations));
    if (!['off', 'suggest', 'apply'].includes(s.repitch)) s.repitch = d.repitch;
    if (!['even', 'length'].includes(s.sourceMix)) s.sourceMix = d.sourceMix;
    for (const key of ['hardCuts', 'skipSilence', 'cuePoints', 'loop', 'limiter'] as const) {
        s[key] = typeof s[key] === 'boolean' ? s[key] : d[key];
    }
    return s;
}
