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

const SINC_ZEROS = 12;
const SINC_STEPS = 512; // table points per zero crossing

/**
 * The windowed sinc kernel K(u) = sinc(u) × Blackman(u / zeros) for u in
 * [0, zeros], tabulated once, so the resampler does no trig per tap.
 */
const SINC_TABLE = (() => {
    const table = new Float32Array(SINC_ZEROS * SINC_STEPS + 2);
    for (let i = 0; i < table.length; i++) {
        const u = i / SINC_STEPS;
        const w = Math.min(1, u / SINC_ZEROS);
        const window = 0.42 + 0.5 * Math.cos(Math.PI * w) + 0.08 * Math.cos(2 * Math.PI * w);
        const arg = Math.PI * u;
        table[i] = (u === 0 ? 1 : Math.sin(arg) / arg) * Math.max(0, window);
    }
    return table;
})();

/**
 * Same as `resample`, by windowed sinc (Blackman, 12 zero crossings each side).
 * Shifting up, the kernel widens to low-pass at the new Nyquist, so the highs
 * fold back as little as they can; shifting down, it keeps the top end that
 * linear interpolation smears. Weights are normalised, so DC passes unchanged.
 */
export function resampleSinc(signal: Stereo, ratio: number, outLength?: number): Stereo {
    const inLength = signal[0].length;
    if (Math.abs(ratio - 1) < 1e-9) return resample(signal, 1, outLength);
    const maxOut = Math.max(0, Math.floor((inLength - 1) / ratio) + 1);
    const n = Math.min(outLength ?? maxOut, maxOut);
    const cutoff = Math.min(1, 1 / ratio);
    const half = Math.ceil(SINC_ZEROS / cutoff);
    const scale = cutoff * SINC_STEPS;
    const limit = SINC_ZEROS * SINC_STEPS;
    const out: Stereo = [new Float32Array(n), new Float32Array(n)];
    const [l, r] = signal;
    const [outL, outR] = out;

    for (let i = 0; i < n; i++) {
        const pos = i * ratio;
        const centre = Math.floor(pos);
        const lo = Math.max(0, centre - half + 1);
        const hi = Math.min(inLength - 1, centre + half);
        let total = 0, sumL = 0, sumR = 0;
        for (let k = lo; k <= hi; k++) {
            const t = Math.abs(pos - k) * scale;
            if (t >= limit) continue;
            const j = t | 0;
            const weight = SINC_TABLE[j] + (SINC_TABLE[j + 1] - SINC_TABLE[j]) * (t - j);
            total += weight;
            sumL += l[k] * weight;
            sumR += r[k] * weight;
        }
        const norm = total !== 0 ? 1 / total : 0;
        outL[i] = sumL * norm;
        outR[i] = sumR * norm;
    }
    return out;
}

/**
 * The zero crossing nearest `at` within `radius` frames (on the mono mix), or
 * `at` itself when there is none. Of the two samples around a crossing, the one
 * closer to zero.
 */
export function nearestZeroCrossing(signal: Stereo, at: number, radius: number): number {
    const [l, r] = signal;
    const n = l.length;
    const v = (i: number) => l[i] + r[i];
    for (let d = 0; d <= radius; d++) {
        for (const i of d === 0 ? [at] : [at - d, at + d]) {
            if (i < 0 || i + 1 >= n) continue;
            const a = v(i), b = v(i + 1);
            if (a === 0) return i;
            if ((a < 0) !== (b < 0)) return Math.abs(a) <= Math.abs(b) ? i : i + 1;
        }
    }
    return at;
}

/**
 * The strongest attack in `[from, from + window)`: the biggest rise of a 2.5 ms
 * energy envelope, moved back to just before it and onto a zero crossing.
 * `from` when nothing in the window rises clearly (a pad, a drone).
 */
export function findOnset(signal: Stereo, from: number, window: number, sampleRate: number): number {
    const [l, r] = signal;
    const frame = Math.max(16, Math.round(sampleRate * 0.0025));
    const end = Math.min(l.length, from + window);
    const frames = Math.floor((end - from) / frame);
    if (frames < 3) return from;

    const energy = new Float64Array(frames);
    let mean = 0;
    for (let f = 0; f < frames; f++) {
        let e = 0;
        for (let i = from + f * frame, stop = i + frame; i < stop; i++) e += l[i] * l[i] + r[i] * r[i];
        energy[f] = e / frame;
        mean += energy[f];
    }
    mean /= frames;

    let best = -1, bestRise = 0;
    for (let f = 1; f < frames; f++) {
        const rise = energy[f] - energy[f - 1];
        if (rise > bestRise) { bestRise = rise; best = f; }
    }
    // A clear attack: the jump is at least the window's mean energy, and not silence.
    if (best < 0 || bestRise < mean || energy[best] < 1e-7) return from;
    const at = from + (best - 1) * frame;
    return nearestZeroCrossing(signal, at, Math.round(sampleRate * 0.001));
}

export interface OnsetOptions {
    from?: number;
    to?: number;
    /** 0 (only the clearest hits) … 1 (every small attack). */
    sensitivity?: number;
    /** No two onsets closer than this. */
    minGapMs?: number;
}

export interface Onset {
    frame: number;
    /** How sharp the attack is: the rise in log energy. For ranking. */
    strength: number;
}

/**
 * Attacks in a signal: where the energy of its first difference (which leans on
 * the highs, where hits live) rises sharply over ~10 ms, against a threshold
 * that follows the local average, so a busy passage needs a bigger jump than a
 * quiet one. Each onset sits just before its rise, on a zero crossing.
 */
export function detectOnsets(signal: Stereo, sampleRate: number, options: OnsetOptions = {}): Onset[] {
    const [l, r] = signal;
    const hop = 256;
    const wanted = Math.max(0, options.from ?? 0);
    // Two frames of pre-roll, so a hit right at `from` has history to rise from.
    const from = Math.max(1, wanted - 2 * hop);
    const to = Math.min(l.length, options.to ?? l.length);
    const sensitivity = Math.min(1, Math.max(0, options.sensitivity ?? 0.5));
    const frames = Math.floor((to - from) / hop);
    if (frames < 4) return [];

    const logEnergy = new Float64Array(frames);
    for (let f = 0; f < frames; f++) {
        let e = 0;
        for (let i = from + f * hop, stop = i + hop; i < stop; i++) {
            const d = (l[i] + r[i]) - (l[i - 1] + r[i - 1]);
            e += d * d;
        }
        logEnergy[f] = Math.log10(e / hop + 1e-10);
    }

    // Rise over two frames, so a slightly soft attack still counts.
    const rise = new Float64Array(frames);
    for (let f = 2; f < frames; f++) rise[f] = Math.max(0, logEnergy[f] - 0.5 * (logEnergy[f - 1] + logEnergy[f - 2]));

    // 1.0 is a 10 dB jump. Sensitive finds 3 dB ones; strict wants 15 dB.
    const delta = 1.5 - 1.2 * sensitivity;
    const gap = Math.max(1, Math.round(((options.minGapMs ?? 50) / 1000) * sampleRate / hop));
    const span = 10;
    const floor = -6.5; // about −65 dBFS on the difference signal: silence has no hits

    const onsets: Onset[] = [];
    let last = -Infinity;
    for (let f = 2; f < frames; f++) {
        if (rise[f] <= 0 || logEnergy[f] < floor) continue;
        let isPeak = true;
        for (let k = Math.max(2, f - 3); k <= Math.min(frames - 1, f + 3); k++) {
            if (rise[k] > rise[f] || (rise[k] === rise[f] && k < f)) { isPeak = false; break; }
        }
        if (!isPeak) continue;
        let mean = 0, n = 0;
        for (let k = Math.max(2, f - span); k <= Math.min(frames - 1, f + span); k++) { mean += rise[k]; n++; }
        mean /= Math.max(1, n);
        if (rise[f] < delta * 0.5 + mean) continue;
        if (f - last < gap) {
            // Too close: keep the sharper of the two.
            const prev = onsets[onsets.length - 1];
            if (prev && rise[f] > prev.strength) onsets.pop(); else continue;
        }
        const at = attackStart(signal, from + Math.max(0, f - 2) * hop, from + (f + 1) * hop, sampleRate);
        if (at < wanted) continue;
        onsets.push({ frame: at, strength: rise[f] });
        last = f;
    }
    return onsets;
}

/**
 * Where an attack found somewhere in `[lo, hi)` really begins: the first sample
 * over a fifth of the peak just after it, less half a millisecond, on a zero
 * crossing at or before that point.
 */
function attackStart(signal: Stereo, lo: number, hi: number, sampleRate: number): number {
    const [l, r] = signal;
    const end = Math.min(l.length, hi + 256);
    let peakValue = 0;
    for (let i = lo; i < end; i++) peakValue = Math.max(peakValue, Math.abs(l[i] + r[i]));
    let first = lo;
    for (let i = lo; i < end; i++) {
        if (Math.abs(l[i] + r[i]) >= peakValue * 0.2) { first = i; break; }
    }
    let at = Math.max(lo, first - Math.round(sampleRate * 0.0005));
    // Back to the last zero crossing, so the cut starts clean.
    const v = (i: number) => l[i] + r[i];
    for (let i = at; i > Math.max(1, at - Math.round(sampleRate * 0.002)); i--) {
        if (v(i) === 0 || (v(i) < 0) !== (v(i - 1) < 0)) { at = i; break; }
    }
    return at;
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
