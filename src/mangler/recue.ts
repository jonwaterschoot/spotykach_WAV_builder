import { detectOnsets, type Stereo } from './dsp.ts';
import type { SnippetInfo } from './render.ts';
import { MAX_CUE_POINTS } from './settings.ts';

/**
 * Cue points for a finished result, without touching its audio: at the snippet
 * starts (what a render writes), or at the hits found in the rendered file, so a
 * mangled drum loop gets one sound per cue however the snippets fell.
 */

export type CueLevel = 'auto' | 'gentle' | 'normal' | 'aggressive';

export const CUE_LEVELS: { value: CueLevel; label: string; hint: string }[] = [
    { value: 'auto', label: 'Auto', hint: 'Normal, eased off until it fits the 255 cue points' },
    { value: 'gentle', label: 'Gentle', hint: 'Only the clearest hits' },
    { value: 'normal', label: 'Normal', hint: 'Most hits' },
    { value: 'aggressive', label: 'Aggressive', hint: 'Every small attack, down to 40 ms apart' },
];

const SENSITIVITY: Record<Exclude<CueLevel, 'auto'>, number> = { gentle: 0.25, normal: 0.55, aggressive: 0.9 };

/** Where a render puts its cues: the middle of each snippet's incoming crossfade. */
export const snippetCues = (snippets: readonly SnippetInfo[], totalFrames: number): number[] =>
    snippets.map(s => s.outStart + (s.xfade >> 1)).filter(f => f < totalFrames).slice(0, MAX_CUE_POINTS);

/**
 * Cue points at the attacks in `signal`, always starting at 0, at most `maxCues`
 * (255 by default). Over the limit, the weakest attacks go first.
 */
export function transientCues(signal: Stereo, sampleRate: number, level: CueLevel, maxCues = MAX_CUE_POINTS): number[] {
    const limit = Math.max(1, Math.min(MAX_CUE_POINTS, Math.round(maxCues)));
    const pick = (sensitivity: number, minGapMs: number) => {
        const onsets = detectOnsets(signal, sampleRate, { sensitivity, minGapMs });
        const strongest = onsets.length > limit - 1
            ? [...onsets].sort((a, b) => b.strength - a.strength).slice(0, limit - 1)
            : onsets;
        const minFirst = Math.round(sampleRate * 0.02);
        const frames = strongest.map(o => o.frame).filter(f => f >= minFirst).sort((a, b) => a - b);
        return { count: onsets.length, cues: [0, ...frames] };
    };

    if (level !== 'auto') return pick(SENSITIVITY[level], level === 'aggressive' ? 40 : 60).cues;

    // Auto: normal, then less sensitive while there are far more hits than cue points.
    let sensitivity = SENSITIVITY.normal;
    let result = pick(sensitivity, 60);
    while (result.count > limit * 1.5 && sensitivity > 0.05) {
        sensitivity -= 0.15;
        result = pick(sensitivity, 60);
    }
    return result.cues;
}
