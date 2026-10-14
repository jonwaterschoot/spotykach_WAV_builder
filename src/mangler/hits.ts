import { attackStart, gainToDb, type Stereo } from './dsp.ts';
import { fft } from './fft.ts';

/**
 * Hits in a recording: where each sound starts, where it has died away, and
 * roughly what it is (low, mid, high). The second detector, after
 * `detectOnsets` in dsp.ts, for chopping percussion into clean slices.
 *
 * - Onsets from spectral flux (how much the spectrum grew since the last
 *   frame) in three bands, each scaled to its own level, so a kick under a
 *   hi-hat isn't drowned by it.
 * - A threshold that follows the moving median, so a busy passage needs a
 *   bigger jump than a quiet one.
 * - And a real rise: some band must get clearly louder than it was just
 *   before. Noise jitters in its spectrum from frame to frame, and that
 *   jitter is flux too; it never makes a band jump by several dB.
 * - Each onset moved back to the start of its attack, on a zero crossing.
 * - A hit ends where its level has fallen `endDb` below its peak, or at the
 *   next hit, whichever is first. What lies between is silence and is dropped.
 */

export type HitClass = 'low' | 'mid' | 'high';

export interface Hit {
    /** Frames: the attack, on a zero crossing. */
    start: number;
    /** Frames, exclusive: where it has died away, or the next hit starts. */
    end: number;
    /** Loudest 5 ms of the hit, dBFS. */
    peakDb: number;
    /** How clear the attack is (the novelty peak). For ranking. */
    strength: number;
    /** Spectral centroid of the attack, Hz. */
    centroid: number;
    cls: HitClass;
}

export interface HitOptions {
    from?: number;
    to?: number;
    /** 0 (only the clearest hits) … 1 (every small attack). Default 0.5. */
    sensitivity?: number;
    /** No two hits closer than this. Default 40 ms. */
    minGapMs?: number;
    /** A hit ends this far below its peak. Default 30 dB. */
    endDb?: number;
    /** Longest hit. Default 2 s. */
    maxHitMs?: number;
    /** Shortest hit kept. Default 20 ms. */
    minHitMs?: number;
    /** A hit must peak above this. Default −50 dBFS. */
    gateDb?: number;
}

const N = 1024;
const HOP = 256;
/** Band edges in Hz: low < 150 ≤ mid < 2000 ≤ high. */
const LOW_HZ = 150;
const HIGH_HZ = 2000;
/** Centroid thresholds for the class. */
const CLASS_LOW_HZ = 600;
const CLASS_HIGH_HZ = 4000;

const hann = (() => {
    const w = new Float64Array(N);
    for (let i = 0; i < N; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
    return w;
})();

const percentile = (values: Float64Array, p: number) => {
    if (values.length === 0) return 0;
    const sorted = Float64Array.from(values).sort();
    return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
};

/** Running median over ±`radius`, from a sorted window updated per step. */
function movingMedian(values: Float64Array, radius: number): Float64Array {
    const out = new Float64Array(values.length);
    const window: number[] = [];
    const insert = (v: number) => {
        let lo = 0, hi = window.length;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (window[mid] < v) lo = mid + 1; else hi = mid; }
        window.splice(lo, 0, v);
    };
    const remove = (v: number) => {
        let lo = 0, hi = window.length;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (window[mid] < v) lo = mid + 1; else hi = mid; }
        window.splice(lo, 1);
    };
    for (let i = 0; i < Math.min(values.length, radius); i++) insert(values[i]);
    for (let i = 0; i < values.length; i++) {
        if (i + radius < values.length) insert(values[i + radius]);
        if (i - radius - 1 >= 0) remove(values[i - radius - 1]);
        out[i] = window[window.length >> 1];
    }
    return out;
}

/** RMS of both channels over [a, b), clipped to the signal. */
function rms([l, r]: Stereo, a: number, b: number): number {
    const lo = Math.max(0, a), hi = Math.min(l.length, b);
    if (hi <= lo) return 0;
    let sum = 0;
    for (let i = lo; i < hi; i++) sum += l[i] * l[i] + r[i] * r[i];
    return Math.sqrt(sum / (2 * (hi - lo)));
}

export function detectHits(signal: Stereo, sampleRate: number, options: HitOptions = {}): Hit[] {
    const [l, r] = signal;
    const from = Math.max(0, Math.floor(options.from ?? 0));
    const to = Math.min(l.length, Math.floor(options.to ?? l.length));
    const sensitivity = Math.min(1, Math.max(0, options.sensitivity ?? 0.5));
    const gapFrames = Math.max(1, Math.round(((options.minGapMs ?? 40) / 1000) * sampleRate / HOP));
    const endDb = options.endDb ?? 30;
    const maxHit = Math.round(((options.maxHitMs ?? 2000) / 1000) * sampleRate);
    const minHit = Math.round(((options.minHitMs ?? 20) / 1000) * sampleRate);
    const gateDb = options.gateDb ?? -50;

    // Frame f looks at [from + f·HOP − N/2, from + f·HOP + N/2): centred on its hop.
    const frames = Math.floor((to - from) / HOP);
    if (frames < 4) return [];
    const binHz = sampleRate / N;
    const lowBin = Math.max(2, Math.round(LOW_HZ / binHz));
    const highBin = Math.round(HIGH_HZ / binHz);
    const topBin = Math.min(N / 2, Math.round(16000 / binHz));

    const flux = [new Float64Array(frames), new Float64Array(frames), new Float64Array(frames)];
    const bandDb = [new Float64Array(frames), new Float64Array(frames), new Float64Array(frames)];
    const power = [0, 0, 0];
    const centroid = new Float64Array(frames);
    const envDb = new Float64Array(frames);
    const re = new Float64Array(N), im = new Float64Array(N);
    let previous = new Float64Array(N / 2 + 1), current = new Float64Array(N / 2 + 1);

    for (let f = 0; f < frames; f++) {
        const centre = from + f * HOP;
        let energy = 0;
        for (let i = 0; i < N; i++) {
            const at = centre - N / 2 + i;
            const v = at >= 0 && at < l.length ? 0.5 * (l[at] + r[at]) : 0;
            re[i] = v * hann[i];
            im[i] = 0;
        }
        for (let i = centre; i < Math.min(l.length, centre + HOP); i++) {
            const v = 0.5 * (l[i] + r[i]);
            energy += v * v;
        }
        envDb[f] = gainToDb(Math.sqrt(energy / HOP));
        fft(re, im);
        let weighted = 0, total = 0;
        power[0] = power[1] = power[2] = 1e-12;
        for (let k = 1; k <= topBin; k++) {
            const mag = Math.hypot(re[k], im[k]);
            const band = k < lowBin ? 0 : k < highBin ? 1 : 2;
            current[k] = Math.log1p(100 * mag);
            weighted += k * binHz * mag;
            total += mag;
            power[band] += mag * mag;
            const rise = current[k] - previous[k];
            if (rise > 0) flux[band][f] += rise;
        }
        for (let b = 0; b < 3; b++) bandDb[b][f] = 10 * Math.log10(power[b]);
        centroid[f] = total > 0 ? weighted / total : 0;
        [previous, current] = [current, previous];
    }
    const binsIn = [lowBin - 1, highBin - lowBin, topBin - highBin + 1];
    for (let b = 0; b < 3; b++) for (let f = 0; f < frames; f++) flux[b][f] /= binsIn[b];
    // The first frame rises from nothing. At the start of the file that is an
    // attack (a file that opens on a hit); inside it, it is only where we began.
    if (from > 0) for (let b = 0; b < 3; b++) flux[b][0] = 0;

    // Each band against its own loud end, with a floor so an empty band isn't
    // blown up into noise.
    const scale = flux.map(band => percentile(band, 0.98));
    const floor = Math.max(...scale) * 0.15 + 1e-9;
    const novelty = new Float64Array(frames);
    for (let f = 0; f < frames; f++) {
        let max = 0, sum = 0;
        for (let b = 0; b < 3; b++) {
            const v = flux[b][f] / Math.max(scale[b], floor);
            max = Math.max(max, v);
            sum += v;
        }
        novelty[f] = 0.6 * max + 0.4 * (sum / 3);
    }

    const median = movingMedian(novelty, Math.round((0.15 * sampleRate) / HOP));
    const delta = 0.45 - 0.37 * sensitivity;
    // How much a band must rise over the 15 ms before: 12 dB strict … 4 dB sensitive.
    const riseDb = 12 - 8 * sensitivity;
    const before = Math.max(2, Math.round((0.015 * sampleRate) / HOP));
    const meanDb = (b: number, lo: number, hi: number) => {
        let sum = 0, n = 0;
        for (let k = Math.max(0, lo); k <= Math.min(frames - 1, hi); k++) { sum += Math.pow(10, bandDb[b][k] / 10); n++; }
        return n ? 10 * Math.log10(sum / n) : -120;
    };
    const rises = (f: number) => {
        const now = [0, 1, 2].map(b => meanDb(b, f, f + 1));
        const loudest = Math.max(...now);
        // The rising band must matter: not the splash of highs when a low sound is cut off.
        return now.some((level, b) => level >= loudest - 20 && level - meanDb(b, f - before - 1, f - 2) >= riseDb);
    };
    const peaks: { f: number; strength: number }[] = [];
    for (let f = 0; f < frames - 1; f++) {
        const v = novelty[f];
        if (v < median[f] + delta || v < 0.1) continue;
        let isPeak = true;
        for (let k = Math.max(0, f - 3); k <= Math.min(frames - 1, f + 3); k++) {
            if (novelty[k] > v || (novelty[k] === v && k < f)) { isPeak = false; break; }
        }
        if (!isPeak || !rises(f)) continue;
        // Loud enough somewhere in the next 20 ms.
        let loud = -Infinity;
        for (let k = f; k < Math.min(frames, f + 4); k++) loud = Math.max(loud, envDb[k]);
        if (loud < gateDb) continue;
        const prev = peaks[peaks.length - 1];
        if (prev && f - prev.f < gapFrames) {
            if (v > prev.strength) peaks.pop(); else continue;
        }
        peaks.push({ f, strength: v });
    }

    const hits: Hit[] = [];
    const attackFrames = Math.round((0.06 * sampleRate) / HOP);
    for (let p = 0; p < peaks.length; p++) {
        const { f, strength } = peaks[p];
        const centre = from + f * HOP;
        const start = Math.max(from, attackStart(signal, Math.max(from, centre - 2 * HOP), centre + HOP, sampleRate));
        const nextStart = p + 1 < peaks.length ? from + (peaks[p + 1].f - 2) * HOP : to;
        // A real attack is louder than what came just before it. The click of a
        // sound being cut off is not: after it there is less, not more.
        const ms = (x: number) => Math.round((x / 1000) * sampleRate);
        if (rms(signal, start, start + ms(10)) < 1.4 * rms(signal, start - ms(20), start)) continue;

        // Peak in the first 80 ms, then down `endDb` from it (held for two frames).
        const f0 = Math.max(0, Math.floor((start - from) / HOP));
        let peakDb = -Infinity, peakFrame = f0;
        for (let k = f0; k < Math.min(frames, f0 + Math.round((0.08 * sampleRate) / HOP)); k++) {
            if (envDb[k] > peakDb) { peakDb = envDb[k]; peakFrame = k; }
        }
        if (peakDb < gateDb) continue;
        let endFrame = frames;
        for (let k = peakFrame + 1; k < frames - 1; k++) {
            if (envDb[k] < peakDb - endDb && envDb[k + 1] < peakDb - endDb) { endFrame = k; break; }
        }
        let end = Math.min(to, from + endFrame * HOP, start + maxHit, Math.max(start + 1, nextStart));
        if (end <= start) continue;
        if (end - start < minHit) {
            if (nextStart - start < minHit) continue;
            end = start + minHit;
        }

        let weighted = 0, total = 0;
        for (let k = f0; k < Math.min(frames, f0 + attackFrames); k++) {
            const w = Math.pow(10, envDb[k] / 10);
            if (!Number.isFinite(w)) continue;
            weighted += centroid[k] * w;
            total += w;
        }
        const c = total > 0 ? weighted / total : 0;
        hits.push({
            start, end, peakDb, strength, centroid: c,
            cls: c < CLASS_LOW_HZ ? 'low' : c >= CLASS_HIGH_HZ ? 'high' : 'mid',
        });
    }
    return hits;
}
