/**
 * The mangler's DSP, on plain `Float32Array`s so it runs in a worker
 * (`OfflineAudioContext` isn't available there) and under Node for the checks.
 * A stereo signal is always a `[left, right]` pair of equal length.
 */

export type Stereo = [Float32Array, Float32Array];

export const dbToGain = (db: number): number => Math.pow(10, db / 20);
export const gainToDb = (gain: number): number => (gain > 0 ? 20 * Math.log10(gain) : -Infinity);

/** A copy of `[start, start + length)`, clamped to the source. */
export function cut(source: Stereo, start: number, length: number): Stereo {
    const s = Math.max(0, Math.min(source[0].length, Math.floor(start)));
    const e = Math.max(s, Math.min(source[0].length, s + Math.floor(length)));
    return [source[0].slice(s, e), source[1].slice(s, e)];
}

export function reverseInPlace(signal: Stereo): void {
    signal[0].reverse();
    signal[1].reverse();
}

/** Equal-weight mono mix, for analysis. */
export function monoMix(signal: Stereo): Float32Array {
    const [l, r] = signal;
    if (l === r) return l;
    const out = new Float32Array(l.length);
    for (let i = 0; i < l.length; i++) out[i] = 0.5 * (l[i] + r[i]);
    return out;
}

/**
 * Plays `signal` `ratio` times faster (ratio 2 = an octave up, half the length),
 * by linear interpolation. Returns `outLength` samples, or as many as the input
 * allows.
 */
export function resample(signal: Stereo, ratio: number, outLength?: number): Stereo {
    const inLength = signal[0].length;
    if (Math.abs(ratio - 1) < 1e-9) {
        return outLength === undefined || outLength >= inLength
            ? signal
            : [signal[0].subarray(0, outLength), signal[1].subarray(0, outLength)];
    }
    const maxOut = Math.max(0, Math.floor((inLength - 1) / ratio) + 1);
    const n = Math.min(outLength ?? maxOut, maxOut);
    const out: Stereo = [new Float32Array(n), new Float32Array(n)];
    for (let ch = 0; ch < 2; ch++) {
        const src = signal[ch], dst = out[ch];
        for (let i = 0; i < n; i++) {
            const pos = i * ratio;
            const k = Math.floor(pos);
            const frac = pos - k;
            const next = k + 1 < inLength ? src[k + 1] : src[k];
            dst[i] = src[k] + (next - src[k]) * frac;
        }
    }
    return out;
}

/** Plain RMS in dBFS over both channels. −Infinity for silence. */
export function rmsDb(signal: Stereo): number {
    const [l, r] = signal;
    if (l.length === 0) return -Infinity;
    let sum = 0;
    for (let i = 0; i < l.length; i++) sum += l[i] * l[i] + r[i] * r[i];
    return gainToDb(Math.sqrt(sum / (2 * l.length)));
}

/**
 * RMS in dBFS over 50 ms blocks, leaving out blocks below `gateDb`, so a snippet
 * that is half silence is matched by its sound and not pulled up by the gap.
 * −Infinity when every block is gated.
 */
export function gatedRmsDb(signal: Stereo, sampleRate: number, gateDb = -60): number {
    const [l, r] = signal;
    const block = Math.max(1, Math.round(sampleRate * 0.05));
    const gate = dbToGain(gateDb) ** 2;
    let sum = 0;
    let count = 0;
    for (let start = 0; start < l.length; start += block) {
        const end = Math.min(l.length, start + block);
        let blockSum = 0;
        for (let i = start; i < end; i++) blockSum += l[i] * l[i] + r[i] * r[i];
        const meanSquare = blockSum / (2 * (end - start));
        if (meanSquare >= gate) {
            sum += blockSum;
            count += 2 * (end - start);
        }
    }
    return count ? gainToDb(Math.sqrt(sum / count)) : -Infinity;
}

export function applyGain(signal: Stereo, gain: number): void {
    if (gain === 1) return;
    for (const ch of signal) for (let i = 0; i < ch.length; i++) ch[i] *= gain;
}

/** Linear fades at both ends, each at most half the signal. */
export function declick(signal: Stereo, fadeSamples: number): void {
    const n = signal[0].length;
    const f = Math.min(Math.floor(fadeSamples), n >> 1);
    if (f <= 0) return;
    for (const ch of signal) {
        for (let i = 0; i < f; i++) {
            const g = (i + 0.5) / f;
            ch[i] *= g;
            ch[n - 1 - i] *= g;
        }
    }
}

/** Linear fade-out over the last `fadeSamples` of `[0, end)`. */
export function fadeOutTail(signal: Stereo, end: number, fadeSamples: number): void {
    const f = Math.min(Math.floor(fadeSamples), end);
    for (const ch of signal) {
        for (let i = 0; i < f; i++) ch[end - 1 - i] *= (i + 0.5) / f;
    }
}

/**
 * Writes `snippet` into `out` starting at `at`, crossfading its first `xfade`
 * samples with what is already there (equal-power: cos out, sin in, so the
 * loudness holds through the overlap). Writes no further than `out`'s length.
 * Returns where the snippet ends.
 */
export function joinInto(out: Stereo, snippet: Stereo, at: number, xfade: number): number {
    const capacity = out[0].length;
    const n = Math.min(snippet[0].length, capacity - at);
    const x = Math.min(xfade, n);
    for (let ch = 0; ch < 2; ch++) {
        const dst = out[ch], src = snippet[ch];
        for (let i = 0; i < x; i++) {
            const t = ((i + 0.5) / x) * (Math.PI / 2);
            dst[at + i] = dst[at + i] * Math.cos(t) + src[i] * Math.sin(t);
        }
        for (let i = x; i < n; i++) dst[at + i] = src[i];
    }
    return at + Math.max(0, n);
}

/**
 * Makes `[0, length)` loop: the `fade` samples rendered past `length` are
 * crossfaded into the start, so the end runs straight into sample 0. Same idea as
 * `audioProcessor.applyCrossfadeLoop`, with equal-power curves. Returns the
 * signal cut to `length`.
 */
export function loopCrossfade(signal: Stereo, length: number, fade: number): Stereo {
    const f = Math.min(fade, signal[0].length - length, length);
    for (let ch = 0; ch < 2; ch++) {
        const s = signal[ch];
        for (let i = 0; i < f; i++) {
            const t = ((i + 0.5) / f) * (Math.PI / 2);
            s[i] = s[i] * Math.sin(t) + s[length + i] * Math.cos(t);
        }
    }
    return [signal[0].slice(0, length), signal[1].slice(0, length)];
}

export function peak(signal: Stereo): number {
    let p = 0;
    for (const ch of signal) for (let i = 0; i < ch.length; i++) {
        const a = Math.abs(ch[i]);
        if (a > p) p = a;
    }
    return p;
}

/**
 * Brick-wall look-ahead limiter at `ceiling` (linear), linked across channels.
 * The gain each sample needs is min-filtered over ±`lookahead` and then averaged
 * over `lookahead`, which keeps every sample under the ceiling while the gain
 * ramps instead of jumping. Returns the deepest reduction in dB (≤ 0).
 */
export function limit(signal: Stereo, ceiling: number, lookahead: number): number {
    const [l, r] = signal;
    const n = l.length;
    const need = new Float32Array(n);
    let any = false;
    for (let i = 0; i < n; i++) {
        const a = Math.max(Math.abs(l[i]), Math.abs(r[i]));
        need[i] = a > ceiling ? ceiling / a : 1;
        if (a > ceiling) any = true;
    }
    if (!any) return 0;

    const L = Math.max(1, Math.floor(lookahead));
    // Sliding minimum over [i − L, i + L] (monotonic deque of indices).
    const minned = new Float32Array(n);
    const deque = new Int32Array(n);
    let head = 0, tail = 0, next = 0;
    for (let i = 0; i < n; i++) {
        const hi = Math.min(n - 1, i + L);
        for (; next <= hi; next++) {
            while (tail > head && need[deque[tail - 1]] >= need[next]) tail--;
            deque[tail++] = next;
        }
        while (deque[head] < i - L) head++;
        minned[i] = need[deque[head]];
    }

    // Moving average over L: still ≤ the need at every peak, since a peak's need
    // is in the min-window of every sample within L of it.
    const prefix = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + minned[i];
    let deepest = 1;
    const half = L >> 1;
    for (let i = 0; i < n; i++) {
        const lo = Math.max(0, i - half);
        const hi = Math.min(n, i - half + L);
        const g = Math.min(1, (prefix[hi] - prefix[lo]) / Math.max(1, hi - lo));
        l[i] *= g;
        r[i] *= g;
        if (g < deepest) deepest = g;
    }
    // Float rounding can leave a sample a hair over; settle those directly.
    for (let i = 0; i < n; i++) {
        if (Math.abs(l[i]) > ceiling) l[i] = Math.sign(l[i]) * ceiling;
        if (Math.abs(r[i]) > ceiling) r[i] = Math.sign(r[i]) * ceiling;
    }
    return gainToDb(deepest);
}
