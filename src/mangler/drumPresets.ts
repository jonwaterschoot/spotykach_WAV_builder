import type { HitClass } from './hits.ts';
import { DRUM_PRESET_DATA } from './drumPresets.gen.ts';
import { PATTERNS, STEPS, allPatterns, newTrack, type PatternId, type SeqStep, type SeqTrack } from './sequence.ts';
import type { SynthKind, SynthRanges } from './synth.ts';

/**
 * Drum presets: TouchPlaited's patterns (its firmware's synth/patterns, brought
 * in by scripts/import-touchplaited-patterns.mjs), four bars of seven drum
 * tracks. Each step has a weight, 1 (a ghost) to 4 (the backbone), and maybe a
 * chance. Density picks which weights play, as the hardware's S33 does: a step
 * plays when weight + density ≥ 5, so density 1 keeps only the weight-4 steps
 * and density 4 plays them all.
 *
 * Loaded, the four bars become patterns A–D (chained A B C D) of seven tracks,
 * each with a slice: one from the pool that fits, or, with an empty pool, one
 * the synth makes for it (DRUM_VOICES).
 */

export interface DrumVoice {
    /** The track's name, as on TouchPlaited. */
    name: string;
    /** The synth generator that makes it, and ranges on top of its defaults. */
    kind: SynthKind;
    ranges: SynthRanges;
    /** The slice pool's class to fall back on, when no slice's name says what it is. */
    cls: HitClass;
    /** A slice name that says it is this drum. */
    match: RegExp;
}

/** The seven tracks, in the firmware's order (Kick, Snare, CHH, OHH, Clap, Tom, Perc). */
export const DRUM_VOICES: readonly DrumVoice[] = [
    { name: 'Kick', kind: 'kick', ranges: {}, cls: 'low', match: /kick|\bbd\b|bass ?drum/i },
    { name: 'Snare', kind: 'snare', ranges: {}, cls: 'mid', match: /snare|\bsd\b|rim/i },
    { name: 'CHH', kind: 'hat', ranges: { decayMs: [30, 80] }, cls: 'high', match: /chh|closed|hh|hat/i },
    { name: 'OHH', kind: 'hat', ranges: { decayMs: [250, 550] }, cls: 'high', match: /ohh|open|hh|hat|cymbal|ride/i },
    { name: 'Clap', kind: 'clap', ranges: {}, cls: 'mid', match: /clap|\bcp\b/i },
    { name: 'Tom', kind: 'perc', ranges: { pitchHz: [80, 170], material: [0.6, 0.9], decayMs: [220, 450], strike: [0.2, 0.4] }, cls: 'low', match: /tom/i },
    { name: 'Perc', kind: 'perc', ranges: { pitchHz: [450, 1100], decayMs: [60, 200], strike: [0.3, 0.6] }, cls: 'mid', match: /perc|block|bell|cow|conga|bongo|shaker/i },
];

/** Steps per preset track: four bars of 16. */
const PRESET_STEPS = 64;

export interface DrumPreset {
    id: string;
    genre: string;
    name: string;
    /** Per track, 64 step bytes (0xCW). */
    tracks: Uint8Array[];
}

const hexBytes = (hex: string) => Uint8Array.from({ length: hex.length / 2 }, (_, i) => parseInt(hex.slice(i * 2, i * 2 + 2), 16));

export const DRUM_PRESETS: readonly DrumPreset[] = DRUM_PRESET_DATA.map(p => ({
    id: `${p.genre}/${p.name}`, genre: p.genre, name: p.name, tracks: p.tracks.map(hexBytes),
}));

export const DRUM_GENRES: readonly string[] = [...new Set(DRUM_PRESETS.map(p => p.genre))];

/** The seven tracks with nothing on them: a kit to program from scratch. */
export const EMPTY_PRESET: DrumPreset = {
    id: 'empty', genre: '', name: 'empty', tracks: DRUM_VOICES.map(() => new Uint8Array(PRESET_STEPS)),
};
export const presetById = (id: string) => (id === EMPTY_PRESET.id ? EMPTY_PRESET : DRUM_PRESETS.find(p => p.id === id));

export const DENSITY_MIN = 1;
export const DENSITY_MAX = 4;
/** Density 3: the ghosts in, the sparsest weight-1 steps out. */
export const DEFAULT_DENSITY = 3;
/** What each density plays, as TouchPlaited's display names it. */
export const DENSITY_LABELS: Record<number, string> = { 1: 'layer 4', 2: 'layers 3–4', 3: 'layers 2–4', 4: 'layers 1–4' };

/** The bars of a preset: patterns A–D. */
export const PRESET_BARS = 4;
const PRESET_PATTERNS = PATTERNS.slice(0, PRESET_BARS) as PatternId[];

/** TouchPlaited's MIDI velocity per weight (45, 70, 95, 120), as 0–1. */
const VELOCITY_OF_WEIGHT = [0, 45 / 127, 70 / 127, 95 / 127, 120 / 127];
/** The chance nibble: 0 always, then 75, 50, 25 %. */
const CHANCE_OF = [1, 0.75, 0.5, 0.25];

/** One step byte at a density. */
export function presetStep(byte: number, density: number): SeqStep {
    const weight = Math.min(4, byte & 0x0f);
    const c = byte >> 4;
    const on = weight > 0 && weight + density >= 5;
    const chance = CHANCE_OF[c] ?? 1;
    return {
        on,
        velocity: on ? Math.round(VELOCITY_OF_WEIGHT[weight] * 100) / 100 : 1,
        ...(on && chance < 1 ? { chance } : {}),
    };
}

/** A track's four bars at a density, as patterns A–D. */
export function presetPatterns(bytes: Uint8Array, density: number): Record<PatternId, SeqStep[]> {
    const patterns = allPatterns();
    PRESET_PATTERNS.forEach((p, bar) => {
        patterns[p] = Array.from({ length: STEPS }, (_, i) => presetStep(bytes[bar * STEPS + i] ?? 0, density));
    });
    return patterns;
}

/** How many steps of a preset play at a density, all tracks together. */
export const presetHits = (preset: DrumPreset, density: number) =>
    preset.tracks.reduce((n, bytes) => n + [...bytes].filter(b => presetStep(b, density).on).length, 0);

/**
 * The preset's seven tracks, each with the slice `sliceFor` gives its voice
 * (null: silent until one is picked).
 */
export function presetTracks(
    preset: DrumPreset, density: number, ids: () => string, sliceFor: (voice: number) => string | null,
): SeqTrack[] {
    return DRUM_VOICES.map((v, i) => ({
        ...newTrack(ids(), v.name, sliceFor(i)),
        patterns: presetPatterns(preset.tracks[i] ?? new Uint8Array(PRESET_STEPS), density),
    }));
}

/** A preset's steps at another density, over tracks it loaded (by voice), keeping everything else about them. */
export function withPresetDensity(track: SeqTrack, preset: DrumPreset, voice: number, density: number): SeqTrack {
    const fresh = presetPatterns(preset.tracks[voice] ?? new Uint8Array(PRESET_STEPS), density);
    const patterns = { ...track.patterns };
    for (const p of PRESET_PATTERNS) patterns[p] = fresh[p];
    return { ...track, patterns };
}

/**
 * Slices for the voices from a pool: a slice whose name says it is that drum,
 * or else one of the voice's class; each slice used once while there are
 * others to pick. Null for a voice nothing fits.
 */
export function matchSlices(slices: readonly { id: string; name: string; cls?: HitClass }[]): (string | null)[] {
    const used = new Set<string>();
    const take = (list: readonly { id: string }[]) => {
        const fresh = list.find(s => !used.has(s.id)) ?? list[0];
        if (fresh) used.add(fresh.id);
        return fresh?.id ?? null;
    };
    // Named ones first, so a "clap" is not taken as some mid voice's class fallback before Clap gets it.
    const byName = DRUM_VOICES.map(v => slices.filter(s => v.match.test(s.name)));
    const out: (string | null)[] = byName.map(list => (list.length ? take(list) : null));
    return out.map((id, i) => id ?? take(slices.filter(s => s.cls === DRUM_VOICES[i].cls)) ?? take(slices));
}
