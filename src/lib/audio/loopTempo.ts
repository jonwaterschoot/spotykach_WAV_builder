/**
 * Tempo helpers for the editor's Loop tool: read a BPM from a file name, estimate
 * one from the audio, and do the bar arithmetic.
 *
 * The loop that gets written is the selection minus its crossfade: the tail is
 * folded over the head (see `applyCrossfadeLoop`). So a loop of N bars needs a
 * selection of N bars plus the crossfade. `selectionFor()` and `loopBars()` are
 * where that sum lives.
 *
 * No imports, so `scripts/check-loop-tempo.mjs` can run it straight from Node.
 */

export const LOOP_BPM_MIN = 40;
export const LOOP_BPM_MAX = 300;

/** One bar of 4/4, in seconds. */
export const barSeconds = (bpm: number) => 240 / bpm;
export const beatSeconds = (bpm: number) => 60 / bpm;

/** The selection that loops to exactly `bars` bars, once the crossfade is folded in. */
export const selectionFor = (bars: number, bpm: number, crossfade: number) => bars * barSeconds(bpm) + crossfade;

/** How many bars a selection loops to (fractional). */
export const loopBars = (selection: number, bpm: number, crossfade: number) =>
    Math.max(0, selection - crossfade) / barSeconds(bpm);

/** A tempo as people write it: whole when it is within a hair of whole, else one decimal. */
export const tidyBpm = (bpm: number) => {
    const whole = Math.round(bpm);
    return Math.abs(bpm - whole) < 0.06 ? whole : Math.round(bpm * 10) / 10;
};

/**
 * A BPM written in a file name: "SEQ_120BPM_4BARS", "loop 92 bpm", "bpm-174".
 * Null when there is none in range.
 */
export function bpmFromName(name: string | undefined | null): number | null {
    if (!name) return null;
    const patterns = [/(\d{2,3}(?:[.,]\d+)?)\s*[-_ ]?\s*bpm/i, /bpm\s*[-_ ]?\s*(\d{2,3}(?:[.,]\d+)?)/i];
    for (const re of patterns) {
        const m = name.match(re);
        if (!m) continue;
        const bpm = parseFloat(m[1].replace(',', '.'));
        if (bpm >= LOOP_BPM_MIN && bpm <= LOOP_BPM_MAX) return bpm;
    }
    return null;
}

/**
 * The tempo a selection of `seconds` would have as a whole number of bars, picking
 * the bar count that lands closest to `near` (or to 120 with nothing to go on).
 * This is "my selection is a loop: what tempo is it?".
 */
export function bpmFromLength(seconds: number, near?: number | null): { bpm: number; bars: number } | null {
    if (!(seconds > 0)) return null;
    const target = near && near > 0 ? near : 120;
    let best: { bpm: number; bars: number } | null = null;
    let bestScore = Infinity;
    // Quarter bars count too, so a one-beat or half-bar selection still answers.
    for (let quarters = 1; quarters <= 4 * 64; quarters++) {
        const bars = quarters / 4;
        const bpm = (bars * 240) / seconds;
        if (bpm < LOOP_BPM_MIN || bpm > LOOP_BPM_MAX) continue;
        // Prefer whole bars, and powers of two a little: that is what loops are.
        const shape = Number.isInteger(bars) ? (Number.isInteger(Math.log2(bars)) ? 0 : 0.03) : 0.12;
        const score = Math.abs(Math.log2(bpm / target)) + shape;
        if (score < bestScore) { bestScore = score; best = { bpm, bars }; }
    }
    return best;
}

/**
 * If `seconds` is within 1.5 % of a whole number of bars at `bpm`, the tempo that
 * makes it exactly that many bars. Loops are usually cut to the bar, so this
 * turns an estimate of 119.6 for an 8.00 s file into the 120 it is.
 */
export function fitTempoToLength(bpm: number, seconds: number): { bpm: number; bars: number } | null {
    const bars = (seconds * bpm) / 240;
    const whole = Math.round(bars);
    if (whole < 1 || Math.abs(bars - whole) / whole > 0.015) return null;
    return { bpm: (whole * 240) / seconds, bars: whole };
}

export interface TempoEstimate {
    bpm: number;
    /** 0 … 1: how clearly the pulse stands out. Under ~0.15 is a guess. */
    confidence: number;
}

/**
 * Estimates the tempo of `channels[from, to)` (frames) from the periodicity of its
 * attacks. Onset strength is the rise in log energy of the pre-emphasised signal
 * every 5 ms; its autocorrelation is read at each candidate beat and its multiples
 * (a comb, so the bar and the eighth both vote), weighted toward 120 to settle
 * double/half ambiguity the way most people would.
 *
 * Works on drums and anything with clear attacks. Pads and drones have no pulse
 * to find; their confidence comes out low.
 */
export function estimateTempo(
    channels: readonly Float32Array[], sampleRate: number, from = 0, to = channels[0]?.length ?? 0,
): TempoEstimate | null {
    if (!channels.length) return null;
    // At most 30 s from the middle: enough to lock on, and quick.
    const maxFrames = Math.round(sampleRate * 30);
    if (to - from > maxFrames) {
        const mid = (from + to) >> 1;
        from = mid - (maxFrames >> 1);
        to = from + maxFrames;
    }
    const hop = Math.max(1, Math.round(sampleRate * 0.005));
    const hopSec = hop / sampleRate;
    const frames = Math.floor((to - from) / hop) - 1;
    if (frames * hopSec < 1.5) return null;

    // Onset strength.
    const env = new Float32Array(frames);
    for (let f = 0; f < frames; f++) {
        const a = from + f * hop;
        let e = 0;
        for (const ch of channels) {
            let prev = a > 0 ? ch[a - 1] : 0;
            for (let i = a; i < a + hop * 2 && i < to; i++) {
                const d = ch[i] - prev; // pre-emphasis: attacks over sustain
                prev = ch[i];
                e += d * d;
            }
        }
        env[f] = Math.log(1e-10 + e);
    }
    const rise = new Float32Array(frames);
    for (let f = 1; f < frames; f++) rise[f] = Math.max(0, env[f] - env[f - 1]);
    // Smoothed over ±10 ms. Raw, each attack is one frame wide and lands on the 5 ms
    // grid with rounding jitter, so a tempo whose beat happens to be a whole number
    // of frames lines up better than its neighbours and wins (124 read as 99).
    const KERNEL = [1, 2, 3, 2, 1];
    const nov = new Float32Array(frames);
    let mean = 0;
    for (let f = 0; f < frames; f++) {
        let s = 0;
        for (let k = 0; k < KERNEL.length; k++) {
            const i = f + k - 2;
            if (i >= 0 && i < frames) s += rise[i] * KERNEL[k];
        }
        nov[f] = s / 9;
        mean += nov[f];
    }
    mean /= frames;
    for (let f = 0; f < frames; f++) nov[f] -= mean;

    // Autocorrelation up to four beats at the slowest tempo.
    const maxLag = Math.min(frames - 1, Math.ceil((4 * 60) / (LOOP_BPM_MIN + 10) / hopSec) + 2);
    const ac = new Float32Array(maxLag + 1);
    for (let lag = 0; lag <= maxLag; lag++) {
        let s = 0;
        for (let f = 0; f + lag < frames; f++) s += nov[f] * nov[f + lag];
        ac[lag] = s / (frames - lag);
    }
    if (!(ac[0] > 0)) return null;
    const acAt = (lag: number) => {
        if (lag >= maxLag) return 0;
        const i = Math.floor(lag), t = lag - i;
        return ac[i] * (1 - t) + ac[i + 1] * t;
    };

    const comb = (bpm: number) => {
        const lag = 60 / bpm / hopSec;
        return acAt(lag) + 0.5 * acAt(2 * lag) + 0.33 * acAt(3 * lag) + 0.5 * acAt(4 * lag) + 0.25 * acAt(lag / 2);
    };
    const prior = (bpm: number) => Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.9) ** 2);

    let best = 0, bestScore = -Infinity;
    for (let bpm = 60; bpm <= 200; bpm += 0.1) {
        const s = comb(bpm) * prior(bpm);
        if (s > bestScore) { bestScore = s; best = bpm; }
    }
    // Refine to 0.01 around the winner.
    for (let bpm = best - 0.1; bpm <= best + 0.1; bpm += 0.01) {
        const s = comb(bpm) * prior(bpm);
        if (s > bestScore) { bestScore = s; best = bpm; }
    }
    const confidence = Math.max(0, Math.min(1, acAt(60 / best / hopSec) / ac[0]));
    return { bpm: best, confidence };
}

/** Evenly spaced marker times (seconds, from 0) for a loop of `length` seconds; 0 itself excluded. */
export function gridMarkers(length: number, step: number): number[] {
    const out: number[] = [];
    if (!(step > 0)) return out;
    for (let k = 1; k * step < length - 0.001; k++) out.push(+(k * step).toFixed(6));
    return out;
}

/** The fades BPM Sync offers, as fractions of a beat: 1/32, 1/16, 1/8 and 1/4 notes. */
export const SYNC_FADES = [
    { label: '1/32', perBeat: 8 },
    { label: '1/16', perBeat: 4 },
    { label: '1/8', perBeat: 2 },
    { label: '1/4', perBeat: 1 },
] as const;

/**
 * A loop of exactly `length` frames from `[start, start + length)`, its seam
 * smoothed without leaving the grid: the last `fade` frames blend (equal power)
 * into the audio that led into `start` in the source. At the wrap the loop has
 * become what came just before its first beat, so it runs on into that beat as
 * the recording did, and the downbeat itself is left untouched.
 *
 * The fade needs that much audio before `start`; it is cut to what there is (none
 * at the head of a file) and to half the loop.
 */
export function loopWithPreRoll(
    channels: readonly Float32Array[], start: number, length: number, fade: number,
): Float32Array[] {
    const f = Math.max(0, Math.min(Math.round(fade), start, length >> 1));
    return channels.map(ch => {
        const out = ch.slice(start, start + length);
        const base = out.length - f;
        for (let i = 0; i < f; i++) {
            // Ends exactly on the pre-roll: the last frame is the one before `start`.
            const t = ((i + 1) / f) * (Math.PI / 2);
            out[base + i] = out[base + i] * Math.cos(t) + ch[start - f + i] * Math.sin(t);
        }
        return out;
    });
}
