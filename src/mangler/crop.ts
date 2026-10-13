import { declick, type Stereo } from './dsp.ts';
import type { MangleResult } from './render.ts';
import { MAX_CUE_POINTS } from './settings.ts';

/**
 * A crop of a result: `[start, end)` frames of the full render. Kept in the
 * recipe, not baked in, so every re-render (an edit, a new setting) cuts the
 * same stretch again and the snippets stay editable. Snippet positions in the
 * recipe stay those of the full render; subtract `start` to place them in the
 * cropped file.
 */
export interface Crop {
    start: number;
    end: number;
}

/** A crop clamped to `length` frames, or null when nothing would be left. */
export function clampCrop(crop: Crop, length: number): Crop | null {
    const start = Math.max(0, Math.min(length, Math.round(crop.start)));
    const end = Math.max(start, Math.min(length, Math.round(crop.end)));
    return end - start >= 2 ? { start, end } : null;
}

/**
 * Cuts `[start, end)` out of a signal with cue points: 2 ms fades at the new
 * edges (none where an edge is the file's own), cues shifted, and one at 0.
 */
export function cropAudio(
    signal: Stereo, cuePoints: readonly number[], crop: Crop, sampleRate: number,
): { channels: Stereo; cuePoints: number[] } {
    const channels: Stereo = [signal[0].slice(crop.start, crop.end), signal[1].slice(crop.start, crop.end)];
    const fade = Math.round(0.002 * sampleRate);
    if (crop.start > 0 || crop.end < signal[0].length) {
        // `declick` fades both ends; restore an end that wasn't cut.
        const keepHead = crop.start === 0 ? [channels[0].slice(0, fade), channels[1].slice(0, fade)] : null;
        const n = channels[0].length;
        const keepTail = crop.end === signal[0].length ? [channels[0].slice(n - fade), channels[1].slice(n - fade)] : null;
        declick(channels, fade);
        if (keepHead) { channels[0].set(keepHead[0], 0); channels[1].set(keepHead[1], 0); }
        if (keepTail) { channels[0].set(keepTail[0], n - fade); channels[1].set(keepTail[1], n - fade); }
    }
    const shifted = cuePoints.filter(c => c >= crop.start && c < crop.end).map(c => c - crop.start);
    if (shifted[0] !== 0) shifted.unshift(0);
    return { channels, cuePoints: shifted.slice(0, MAX_CUE_POINTS) };
}

/** A whole render, cropped. Snippets keep their full-render positions. */
export function cropResult(result: MangleResult, crop: Crop): MangleResult {
    const clamped = clampCrop(crop, result.left.length);
    if (!clamped) return result;
    const { channels, cuePoints } = cropAudio([result.left, result.right], result.cuePoints, clamped, result.sampleRate);
    return { ...result, left: channels[0], right: channels[1], cuePoints };
}
