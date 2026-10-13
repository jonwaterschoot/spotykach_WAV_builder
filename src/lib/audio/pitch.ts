/**
 * YIN pitch detection (de Cheveigné & Kawahara, 2002) with a confidence figure,
 * for deciding whether a snippet can be retuned without guessing.
 *
 * Plain array math, no Web Audio, so it runs in a worker and under Node.
 * `audioProcessor.detectPitch` (AMDF, no confidence) stays for the editor's hint
 * until that switches over.
 */

export interface PitchEstimate {
    /** Hz. */
    frequency: number;
    /** 0–1: share of voiced frames × (1 − median aperiodicity). */
    confidence: number;
    /** Note name with octave, e.g. `D#3`. */
    note: string;
    /** Distance from the nearest equal-tempered note, −50…+50. */
    cents: number;
}

export interface YinOptions {
    minFrequency?: number;
    maxFrequency?: number;
    /** Frames with aperiodicity below this count as voiced. */
    threshold?: number;
    /** Upper bound on analysed frames, spread evenly over the signal. */
    maxFrames?: number;
}

/** Shorter than this, there are too few periods for a usable estimate. */
export const MIN_PITCH_SECONDS = 0.08;

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Fractional MIDI note: 69 = A4 = 440 Hz, 60 = C4. */
export const frequencyToMidi = (hz: number): number => 69 + 12 * Math.log2(hz / 440);

export function noteName(hz: number): string {
    const midi = Math.round(frequencyToMidi(hz));
    return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

/**
 * Semitones (with cents) that move `hz` onto the nearest C, between −6 and +6,
 * so no snippet moves more than half an octave.
 */
export function semitonesToNearestC(hz: number): number {
    const fromC = ((frequencyToMidi(hz) % 12) + 12) % 12;
    return fromC <= 6 ? -fromC : 12 - fromC;
}

/**
 * Semitones (with cents) that move `hz` onto the nearest of `pitchClasses`
 * (0 = C … 11 = B), between −6 and +6. With `[0]` this is `semitonesToNearestC`.
 * Ties go down. 0 when the list is empty.
 */
export function semitonesToPitchClasses(hz: number, pitchClasses: readonly number[]): number {
    const fromC = ((frequencyToMidi(hz) % 12) + 12) % 12;
    let best = 0;
    let bestDistance = Infinity;
    for (const pc of pitchClasses) {
        // The shift onto this pitch class, wrapped into [−6, 6).
        let d = (((pc - fromC) % 12) + 12) % 12;
        if (d >= 6) d -= 12;
        if (Math.abs(d) < bestDistance - 1e-9 || (Math.abs(Math.abs(d) - bestDistance) < 1e-9 && d < best)) {
            best = d;
            bestDistance = Math.abs(d);
        }
    }
    return bestDistance === Infinity ? 0 : best;
}

/**
 * One frame's period by YIN. `frame` holds `window + maxTau` samples.
 * Returns the period in samples and the aperiodicity (the normalised difference
 * at that period: 0 is perfectly periodic, 1 is noise).
 */
function yinFrame(
    frame: Float32Array, window: number, minTau: number, maxTau: number, threshold: number,
    diff: Float32Array,
): { tau: number; aperiodicity: number } | null {
    // Difference function
    for (let tau = 1; tau <= maxTau; tau++) {
        let sum = 0;
        for (let j = 0; j < window; j++) {
            const d = frame[j] - frame[j + tau];
            sum += d * d;
        }
        diff[tau] = sum;
    }

    // Cumulative mean normalised difference
    diff[0] = 1;
    let running = 0;
    for (let tau = 1; tau <= maxTau; tau++) {
        running += diff[tau];
        diff[tau] = running > 0 ? (diff[tau] * tau) / running : 1;
    }

    // First dip under the threshold, walked down to its minimum; else the global minimum.
    let best = -1;
    for (let tau = minTau; tau <= maxTau; tau++) {
        if (diff[tau] < threshold) {
            while (tau + 1 <= maxTau && diff[tau + 1] < diff[tau]) tau++;
            best = tau;
            break;
        }
    }
    if (best === -1) {
        let min = Infinity;
        for (let tau = minTau; tau <= maxTau; tau++) {
            if (diff[tau] < min) { min = diff[tau]; best = tau; }
        }
    }
    if (best <= 0) return null;

    // Parabolic interpolation around the dip
    let tau = best;
    if (best > minTau && best < maxTau) {
        const a = diff[best - 1], b = diff[best], c = diff[best + 1];
        const denom = a - 2 * b + c;
        if (denom > 0) tau = best + (0.5 * (a - c)) / denom;
    }
    return { tau, aperiodicity: Math.max(0, diff[best]) };
}

const median = (values: number[]): number => {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * Pitch of a mono signal, or null when it is too short, silent, or has no
 * voiced frames. Runs at half the sample rate: 2 kHz is the top of the range, so
 * nothing is lost, and the difference function costs a quarter.
 */
export function detectPitchYin(
    signal: Float32Array, sampleRate: number, options: YinOptions = {},
): PitchEstimate | null {
    const { minFrequency = 40, maxFrequency = 2000, threshold = 0.15, maxFrames = 8 } = options;
    if (signal.length < sampleRate * MIN_PITCH_SECONDS) return null;

    // Halve the rate with a two-tap average (a gentle low-pass, enough below 2 kHz).
    const rate = sampleRate / 2;
    const half = new Float32Array(signal.length >> 1);
    for (let i = 0; i < half.length; i++) half[i] = 0.5 * (signal[2 * i] + signal[2 * i + 1]);

    const minTau = Math.max(2, Math.floor(rate / maxFrequency));
    const maxTau = Math.ceil(rate / minFrequency);
    const window = 1024;
    let frameLength = window + maxTau;
    let usedMaxTau = maxTau;
    if (half.length < frameLength) {
        // Short snippet: give up the lowest notes rather than the whole estimate.
        usedMaxTau = Math.floor(half.length / 2);
        frameLength = Math.min(half.length, window + usedMaxTau);
        if (usedMaxTau <= minTau * 2) return null;
    }
    const usedWindow = frameLength - usedMaxTau;

    const span = half.length - frameLength;
    const hop = window / 2;
    const frameCount = Math.max(1, Math.min(maxFrames, Math.floor(span / hop) + 1));
    const diff = new Float32Array(usedMaxTau + 1);

    const voicedFreqs: number[] = [];
    const voicedAperiodicity: number[] = [];
    let analysed = 0;
    for (let f = 0; f < frameCount; f++) {
        const start = frameCount === 1 ? 0 : Math.round((f * span) / (frameCount - 1));
        const frame = half.subarray(start, start + frameLength);

        // A silent frame says nothing about pitch; leave it out of the share too.
        let energy = 0;
        for (let i = 0; i < usedWindow; i++) energy += frame[i] * frame[i];
        if (energy / usedWindow < 1e-7) continue;
        analysed++;

        const result = yinFrame(frame, usedWindow, minTau, usedMaxTau, threshold, diff);
        if (result && result.aperiodicity < threshold) {
            voicedFreqs.push(rate / result.tau);
            voicedAperiodicity.push(result.aperiodicity);
        }
    }
    if (analysed === 0 || voicedFreqs.length === 0) return null;

    const frequency = median(voicedFreqs);
    const confidence = (voicedFreqs.length / analysed) * (1 - median(voicedAperiodicity));
    const midi = frequencyToMidi(frequency);
    return {
        frequency,
        confidence,
        note: noteName(frequency),
        cents: Math.round((midi - Math.round(midi)) * 100),
    };
}
