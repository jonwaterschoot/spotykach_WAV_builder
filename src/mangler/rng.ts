/**
 * Seeded randomness for the mangler. Every pick goes through one of these, so the
 * same seed and settings always give the same file.
 */

export interface Rng {
    /** Uniform in [0, 1). */
    next(): number;
    /** Uniform in [min, max). */
    uniform(min: number, max: number): number;
    /**
     * Log-uniform in [min, max], so 20 ms – 10 s gives as many short snippets as
     * long ones. `bias` (−1 short … 0 even … +1 long) skews the pick.
     */
    logUniform(min: number, max: number, bias?: number): number;
    /** Index picked with probability proportional to `weights`. −1 when all are 0. */
    pick(weights: readonly number[]): number;
}

/** mulberry32: 32-bit state, fast, good enough for audio dice. */
export function createRng(seed: number): Rng {
    let state = seed >>> 0;
    const next = () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    return {
        next,
        uniform: (min, max) => min + (max - min) * next(),
        logUniform: (min, max, bias = 0) => {
            // Always one draw, whatever the bias, so moving the bias slider doesn't
            // shift every later pick.
            const u = Math.pow(next(), Math.pow(4, -bias));
            if (min <= 0 || max <= min) return Math.max(min, max);
            return Math.exp(Math.log(min) + u * (Math.log(max) - Math.log(min)));
        },
        pick: (weights) => {
            const r = next();
            let total = 0;
            for (const w of weights) total += Math.max(0, w);
            if (total <= 0) return -1;
            let acc = 0;
            for (let i = 0; i < weights.length; i++) {
                acc += Math.max(0, weights[i]);
                if (r * total < acc) return i;
            }
            return weights.length - 1;
        },
    };
}

/**
 * A seed for a sub-stream (one snippet's rerolls, say), so drawing more numbers
 * there never moves the main stream.
 */
export function deriveSeed(seed: number, ...parts: number[]): number {
    let h = seed >>> 0;
    for (const p of parts) {
        h = Math.imul(h ^ (p >>> 0), 0x9e3779b1) >>> 0;
        h ^= h >>> 16;
    }
    return h >>> 0;
}

/** A fresh random seed for the dice button. */
export const randomSeed = (): number => Math.floor(Math.random() * 4294967296) >>> 0;
