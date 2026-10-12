import type { MangleResult, SnippetInfo } from './render.ts';
import type { MangleSettings } from './settings.ts';

/** A source as a result remembers it: enough to name it and carry its license. */
export interface RecipeSource {
    id: string;
    name: string;
    origin: string;
    license?: string;
}

/**
 * How a result was made. Stored next to the WAV in IndexedDB, not in it, so the
 * header's `ICMT` stays the shape the rest of the app reads.
 */
export interface MangleRecipe {
    seed: number;
    settings: MangleSettings;
    /** Every source passed to the render, in order; `snippets[].source` indexes this. */
    sources: RecipeSource[];
    snippets: SnippetInfo[];
    /** Frames. */
    cuePoints: number[];
    cuesCapped: boolean;
    peakReductionDb: number;
    /** Where the cue points came from: the snippet starts (absent), or the hits found at this level. */
    cueSource?: 'snippets' | import('./recue').CueLevel;
    /** The stretch of the full render the file keeps. Snippet positions stay those of the full render. */
    crop?: import('./crop').Crop;
}

export const recipeFromResult = (
    result: MangleResult, settings: MangleSettings, sources: RecipeSource[],
): MangleRecipe => ({
    seed: result.seed,
    settings,
    sources,
    snippets: result.snippets,
    cuePoints: result.cuePoints,
    cuesCapped: result.cuesCapped,
    peakReductionDb: result.peakReductionDb,
});

/** The sources a result actually uses, which is what its license follows. */
export const usedSources = (recipe: MangleRecipe): RecipeSource[] => {
    const used = new Set(recipe.snippets.map(s => s.source));
    return recipe.sources.filter((_, i) => used.has(i));
};

/** `mangle_20261012_123456789`. */
export const resultName = (seed: number, date = new Date()): string => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `mangle_${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${seed}`;
};

/** Peak per bucket over both channels, for drawing without decoding. */
export function waveformPeaks(left: Float32Array, right: Float32Array, buckets = 600): number[] {
    const n = left.length;
    const peaks: number[] = [];
    for (let b = 0; b < buckets; b++) {
        const start = Math.floor((b * n) / buckets);
        const end = Math.max(start + 1, Math.floor(((b + 1) * n) / buckets));
        let max = 0;
        for (let i = start; i < end && i < n; i++) {
            const v = Math.max(Math.abs(left[i]), Math.abs(right[i]));
            if (v > max) max = v;
        }
        peaks.push(Math.round(max * 1000) / 1000);
    }
    return peaks;
}
