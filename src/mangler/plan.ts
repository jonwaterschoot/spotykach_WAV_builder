import type { Rng } from './rng.ts';
import { OUTPUT_MAX_SECONDS, STEPS_PER_BAR, barSeconds, type MangleSettings } from './settings.ts';

/**
 * One snippet's dice, picked before any audio is touched. The renderer turns it
 * into samples; where the plan and the audio disagree (a source shorter than the
 * snippet, a pitch shift), the renderer adjusts and keeps going until the file
 * is full.
 */
export interface SnippetPlan {
    source: number;
    /** Output length in samples, before the source or the file's end shortens it. */
    length: number;
    /** Overlap with the previous snippet, before clamping to their lengths. */
    xfade: number;
    reverse: boolean;
    /** Where in the source the snippet starts, as a fraction of the free range. */
    startFraction: number;
    /** −1…1, scaled by the loudness spread. */
    spread: number;
    /** −1…1, scaled by the detune amount. */
    detune: number;
    /** Tempo grid: whole steps. `length` is then the snippet's natural length, which Tape fits to them. */
    steps?: number;
}

export interface PlanSource {
    /** Frames at the render rate. */
    length: number;
    /** Left out of this batch (the pool's switch, or a no-derivatives source). */
    enabled: boolean;
}

/**
 * Picks snippets one at a time. Every snippet draws exactly seven numbers from
 * `rng`, whatever the settings, so changing one slider and rendering the same seed
 * again changes only what that slider controls.
 */
export class Planner {
    private readonly rng: Rng;
    private readonly settings: MangleSettings;
    private readonly sampleRate: number;
    private readonly counts: number[];
    private readonly baseWeights: number[];
    /** False when every source is off: `pickSource` then returns -1. */
    readonly hasSources: boolean;

    constructor(rng: Rng, sources: readonly PlanSource[], settings: MangleSettings, sampleRate: number) {
        this.rng = rng;
        this.settings = settings;
        this.sampleRate = sampleRate;
        this.counts = sources.map(() => 0);
        this.baseWeights = sources.map(s =>
            !s.enabled || s.length <= 0 ? 0 : settings.sourceMix === 'length' ? s.length : 1,
        );
        this.hasSources = this.baseWeights.some(w => w > 0);
    }

    /** The source draw on its own: the renderer uses it again for silence rerolls. */
    pickSource(rng: Rng = this.rng): number {
        const cap = this.settings.maxPerSource;
        let weights = this.baseWeights;
        if (cap > 0) {
            const capped = weights.map((w, i) => (this.counts[i] >= cap ? 0 : w));
            // Every source used up: the cap gives way rather than the file stopping short.
            if (capped.some(w => w > 0)) weights = capped;
        }
        return rng.pick(weights);
    }

    /** Counts the snippet against its source's cap. */
    commit(source: number): void {
        this.counts[source]++;
    }

    next(): SnippetPlan {
        const s = this.settings;
        const ms = this.sampleRate / 1000;
        const source = this.pickSource();
        // The grid draws the length the same way (one number), over the step range:
        // the nearest whole step count is the snippet's, and what is left over is
        // how much Tape speeds it up or slows it down to fit (within half a step).
        const stepMs = s.grid ? (barSeconds(s.bpm) * 1000) / STEPS_PER_BAR[s.division] : 0;
        const lengthMs = s.grid
            ? this.rng.logUniform((s.stepsMin - 0.5) * stepMs, (s.stepsMax + 0.5) * stepMs, s.bias)
            : this.rng.logUniform(s.snippetMinMs, s.snippetMaxMs, s.bias);
        const xfadeMs = this.rng.uniform(s.xfadeMinMs, s.xfadeMaxMs);
        const reverse = this.rng.next() < s.reverseProbability;
        const startFraction = this.rng.next();
        const spread = this.rng.uniform(-1, 1);
        const detune = this.rng.uniform(-1, 1);
        if (s.grid) {
            return {
                source,
                length: Math.max(1, Math.round(lengthMs * ms)),
                steps: Math.min(s.stepsMax, Math.max(s.stepsMin, Math.round(lengthMs / stepMs))),
                xfade: 0,
                reverse, startFraction, spread, detune,
            };
        }
        return {
            source,
            length: Math.max(1, Math.round(Math.min(lengthMs, (s.fillMode === 'count' ? OUTPUT_MAX_SECONDS : s.outputSeconds) * 1000) * ms)),
            xfade: Math.round(xfadeMs * ms),
            reverse,
            startFraction,
            spread,
            detune,
        };
    }
}
