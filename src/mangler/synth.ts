import type { Stereo } from './dsp.ts';
import type { HitClass } from './hits.ts';
import { createRng } from './rng.ts';

/**
 * The synth: drums, percussion and FM sounds from a few oscillators, noise and
 * filters, as plain array math at 48 kHz. Like the mangler, every parameter is a
 * range and the dice pick a value in it per take, so "Generate 8" gives eight
 * different kicks and any take can be made again from its seed.
 *
 * Cheap on purpose: no oversampling, at most 4 s per hit, mono (sent out as two
 * equal channels). A phone renders them one at a time.
 */

export type SynthKind = 'kick' | 'snare' | 'hat' | 'clap' | 'perc' | 'fm' | 'noise';

export interface SynthParam {
    key: string;
    label: string;
    min: number;
    max: number;
    /** Wide ranges in Hz or ms pick log-uniformly. */
    log?: boolean;
    unit: string;
    /** The default range. */
    range: [number, number];
    hint: string;
}

export interface SynthGenerator {
    label: string;
    /** Where its hits go in the slice pool's filter. */
    cls: HitClass;
    params: SynthParam[];
}

const p = (key: string, label: string, min: number, max: number, unit: string, range: [number, number], hint: string, log = false): SynthParam =>
    ({ key, label, min, max, unit, range, hint, log });

export const GENERATORS: Record<SynthKind, SynthGenerator> = {
    kick: {
        label: 'Kick', cls: 'low',
        params: [
            p('startHz', 'Start pitch', 60, 400, 'Hz', [120, 220], 'Where the pitch sweep starts', true),
            p('endHz', 'End pitch', 25, 90, 'Hz', [40, 60], 'Where it settles: the note of the kick', true),
            p('sweepMs', 'Sweep', 5, 200, 'ms', [20, 60], 'How fast the pitch falls', true),
            p('decayMs', 'Decay', 80, 2000, 'ms', [250, 700], 'How long it rings, to −60 dB', true),
            p('click', 'Click', 0, 1, '', [0.1, 0.5], 'A short noise tick on the attack'),
            p('drive', 'Drive', 0, 1, '', [0, 0.4], 'Soft clipping: rounder, then dirtier'),
        ],
    },
    snare: {
        label: 'Snare', cls: 'mid',
        params: [
            p('toneHz', 'Tone', 120, 400, 'Hz', [170, 240], 'The drum body', true),
            p('toneMix', 'Tone / noise', 0, 1, '', [0.3, 0.6], 'More body or more wires'),
            p('noiseHz', 'Brightness', 1500, 14000, 'Hz', [4000, 9000], 'Low-pass on the noise', true),
            p('snap', 'Snap', 0, 1, '', [0.3, 0.7], 'A sharp extra burst on the attack'),
            p('decayMs', 'Decay', 50, 800, 'ms', [120, 280], 'How long it rings, to −60 dB', true),
        ],
    },
    hat: {
        label: 'Hat', cls: 'high',
        params: [
            p('brightHz', 'Brightness', 3000, 14000, 'Hz', [6000, 9000], 'High-pass: thinner and brighter going up', true),
            p('metal', 'Metal', 0, 1, '', [0.4, 0.8], 'Square-wave cluster (808 style) against plain noise'),
            p('decayMs', 'Decay', 15, 1500, 'ms', [30, 120], 'Closed (short) to open (long)', true),
        ],
    },
    clap: {
        label: 'Clap', cls: 'mid',
        params: [
            p('bursts', 'Hands', 1, 6, '', [3, 4], 'How many claps make up one'),
            p('spreadMs', 'Spread', 3, 30, 'ms', [7, 14], 'Time between them'),
            p('tailMs', 'Tail', 40, 800, 'ms', [120, 300], 'The room after them', true),
            p('colorHz', 'Colour', 500, 4000, 'Hz', [900, 1600], 'Band-pass centre', true),
        ],
    },
    perc: {
        label: 'Perc', cls: 'mid',
        params: [
            p('pitchHz', 'Pitch', 50, 1200, 'Hz', [100, 400], 'The lowest mode: toms low, blocks and bells high', true),
            p('material', 'Material', 0, 1, '', [0.2, 0.8], 'Harmonic (string, bar) to inharmonic (membrane, metal)'),
            p('decayMs', 'Decay', 30, 3000, 'ms', [150, 600], 'How long it rings, to −60 dB', true),
            p('strike', 'Strike', 0, 1, '', [0.2, 0.6], 'Noise in the attack: soft mallet to hard stick'),
        ],
    },
    fm: {
        label: 'FM', cls: 'mid',
        params: [
            p('carrierHz', 'Pitch', 30, 2000, 'Hz', [80, 600], 'The carrier', true),
            p('ratio', 'Ratio', 0.25, 8, '', [0.5, 4], 'Modulator against carrier pitch', true),
            p('harmonic', 'Harmonic', 0, 1, '', [0.5, 1], 'Chance the ratio snaps to a half step (0.5, 1, 1.5 …): tonal rather than clangy'),
            p('index', 'Index', 0, 20, '', [1, 8], 'Modulation depth: how bright and metallic'),
            p('feedback', 'Feedback', 0, 1, '', [0, 0.4], 'The modulator modulating itself: towards noise'),
            p('indexMs', 'Index decay', 10, 4000, 'ms', [60, 600], 'How fast the brightness fades', true),
            p('attackMs', 'Attack', 0, 500, 'ms', [0, 10], 'Rise from silence'),
            p('decayMs', 'Decay', 50, 4000, 'ms', [200, 1500], 'How long it rings, to −60 dB', true),
        ],
    },
    noise: {
        label: 'Noise', cls: 'high',
        params: [
            p('fromHz', 'Filter from', 100, 16000, 'Hz', [400, 4000], 'Low-pass at the start', true),
            p('toHz', 'Filter to', 100, 16000, 'Hz', [400, 8000], 'Low-pass at the end: a sweep', true),
            p('q', 'Resonance', 0.5, 12, '', [0.7, 3], 'A whistle at the cutoff', true),
            p('lengthMs', 'Length', 100, 4000, 'ms', [500, 2000], 'How long', true),
            p('attackMs', 'Attack', 0, 2000, 'ms', [5, 300], 'Rise from silence'),
        ],
    },
};

export const SYNTH_KINDS = Object.keys(GENERATORS) as SynthKind[];
export const MAX_SECONDS = 4;

export type SynthRanges = Record<string, [number, number]>;

export const defaultRanges = (kind: SynthKind): SynthRanges =>
    Object.fromEntries(GENERATORS[kind].params.map(q => [q.key, [...q.range] as [number, number]]));

/** One value per parameter, in the generator's order, so a seed always gives the same take. */
export function pickValues(kind: SynthKind, ranges: SynthRanges, seed: number): Record<string, number> {
    const rng = createRng(seed);
    const out: Record<string, number> = {};
    for (const q of GENERATORS[kind].params) {
        const [lo, hi] = ranges[q.key] ?? q.range;
        const a = Math.max(q.min, Math.min(lo, hi)), b = Math.min(q.max, Math.max(lo, hi));
        out[q.key] = q.log && a > 0 ? rng.logUniform(a, b) : rng.uniform(a, b);
    }
    return out;
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

/** −60 dB after `ms`: the gain at sample i. */
const decayGain = (i: number, ms: number, sr: number) => Math.pow(10, (-3 * i) / Math.max(1, (ms / 1000) * sr));

/** RBJ biquad, in place. Coefficients may be moved per block with `set`. */
class Biquad {
    private b0 = 1; private b1 = 0; private b2 = 0; private a1 = 0; private a2 = 0;
    private x1 = 0; private x2 = 0; private y1 = 0; private y2 = 0;
    set(type: 'lp' | 'hp' | 'bp', hz: number, q: number, sr: number) {
        const w = (2 * Math.PI * Math.min(hz, sr * 0.45)) / sr;
        const cos = Math.cos(w), alpha = Math.sin(w) / (2 * q);
        let b0: number, b1: number, b2: number;
        if (type === 'lp') { b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = b0; }
        else if (type === 'hp') { b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = b0; }
        else { b0 = alpha; b1 = 0; b2 = -alpha; }
        const a0 = 1 + alpha;
        this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0;
        this.a1 = (-2 * cos) / a0; this.a2 = (1 - alpha) / a0;
        return this;
    }
    run(x: number): number {
        const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
        this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
        return y;
    }
}

/** Peak to −1 dBFS, and a 2 ms fade at the end so a cut tail doesn't click. */
function finish(x: Float32Array, sr: number): Stereo {
    let peak = 0;
    for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
    const gain = peak > 0 ? 0.891 / peak : 0;
    const fade = Math.min(x.length, Math.round(0.002 * sr));
    for (let i = 0; i < x.length; i++) {
        const tail = x.length - i <= fade ? (x.length - i) / fade : 1;
        x[i] *= gain * tail;
    }
    return [x, x];
}

const lengthFor = (ms: number, sr: number) => Math.round(Math.min(MAX_SECONDS * 1000, Math.max(20, ms)) / 1000 * sr);

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

function kick(v: Record<string, number>, sr: number, seed: number): Stereo {
    const n = lengthFor(v.decayMs * 1.05 + 10, sr);
    const x = new Float32Array(n);
    const rng = createRng(seed ^ 0x5eed);
    const tau = v.sweepMs / 1000 / 3;
    const drive = 1 + v.drive * 8;
    const norm = Math.tanh(drive);
    let phase = 0;
    for (let i = 0; i < n; i++) {
        const t = i / sr;
        const hz = v.endHz + (v.startHz - v.endHz) * Math.exp(-t / tau);
        phase += (2 * Math.PI * hz) / sr;
        let y = Math.sin(phase) * decayGain(i, v.decayMs, sr);
        y += v.click * (rng.next() * 2 - 1) * Math.exp(-t / 0.0015);
        x[i] = Math.tanh(y * drive) / norm;
    }
    return finish(x, sr);
}

function snare(v: Record<string, number>, sr: number, seed: number): Stereo {
    const n = lengthFor(v.decayMs * 1.1 + 10, sr);
    const x = new Float32Array(n);
    const rng = createRng(seed ^ 0x54a2);
    const lp = new Biquad().set('lp', v.noiseHz, 0.7, sr);
    const hp = new Biquad().set('hp', 900, 0.7, sr);
    const snapHp = new Biquad().set('hp', 3000, 0.7, sr);
    let phase = 0;
    for (let i = 0; i < n; i++) {
        const t = i / sr;
        phase += (2 * Math.PI * v.toneHz * (1 + 0.4 * Math.exp(-t / 0.012))) / sr;
        const tone = Math.sin(phase) * decayGain(i, v.decayMs * 0.6, sr);
        const w = rng.next() * 2 - 1;
        const noise = lp.run(hp.run(w)) * decayGain(i, v.decayMs, sr);
        const snap = snapHp.run(w) * Math.exp(-t / 0.006) * v.snap;
        x[i] = v.toneMix * tone + (1 - v.toneMix) * noise * 1.6 + snap;
    }
    return finish(x, sr);
}

/** The 808's six square waves, tuned in its odd ratios. */
const METAL = [205.3, 304.4, 369.6, 522.7, 540.0, 800.0];

function hat(v: Record<string, number>, sr: number, seed: number): Stereo {
    const n = lengthFor(v.decayMs * 1.1 + 5, sr);
    const x = new Float32Array(n);
    const rng = createRng(seed ^ 0x4a7);
    const bp = new Biquad().set('bp', 10000, 0.9, sr);
    const hp = new Biquad().set('hp', v.brightHz, 0.7, sr);
    const phases = METAL.map(() => rng.next());
    for (let i = 0; i < n; i++) {
        let sq = 0;
        for (let k = 0; k < METAL.length; k++) {
            phases[k] = (phases[k] + METAL[k] / sr) % 1;
            sq += phases[k] < 0.5 ? 1 : -1;
        }
        const src = v.metal * (sq / METAL.length) + (1 - v.metal) * (rng.next() * 2 - 1);
        x[i] = hp.run(bp.run(src)) * decayGain(i, v.decayMs, sr);
    }
    return finish(x, sr);
}

function clap(v: Record<string, number>, sr: number, seed: number): Stereo {
    const bursts = Math.max(1, Math.round(v.bursts));
    const lastAt = (bursts - 1) * v.spreadMs;
    const n = lengthFor(lastAt + v.tailMs * 1.1 + 10, sr);
    const x = new Float32Array(n);
    const rng = createRng(seed ^ 0xc1a9);
    const bp = new Biquad().set('bp', v.colorHz, 1.4, sr);
    // Each hand a little off the grid, so it sounds like people.
    const starts = Array.from({ length: bursts }, (_, k) => (k * v.spreadMs + (k ? (rng.next() - 0.5) * v.spreadMs * 0.4 : 0)) / 1000);
    for (let i = 0; i < n; i++) {
        const t = i / sr;
        let env = 0;
        for (const s of starts) if (t >= s) env = Math.max(env, Math.exp(-(t - s) / 0.006));
        if (t >= lastAt / 1000) env = Math.max(env, 0.35 * decayGain(i - Math.round((lastAt / 1000) * sr), v.tailMs, sr));
        x[i] = bp.run(rng.next() * 2 - 1) * env;
    }
    return finish(x, sr);
}

const HARMONIC = [1, 2, 3, 4, 5];
const MEMBRANE = [1, 1.593, 2.136, 2.296, 2.653];

function perc(v: Record<string, number>, sr: number, seed: number): Stereo {
    const n = lengthFor(v.decayMs * 1.05 + 10, sr);
    const x = new Float32Array(n);
    const rng = createRng(seed ^ 0x9e2c);
    const hp = new Biquad().set('hp', Math.min(8000, v.pitchHz * 4), 0.7, sr);
    const ratios = HARMONIC.map((h, k) => h + (MEMBRANE[k] - h) * v.material);
    const phases = ratios.map(() => 0);
    for (let i = 0; i < n; i++) {
        let y = 0;
        for (let k = 0; k < ratios.length; k++) {
            const hz = v.pitchHz * ratios[k];
            if (hz > sr * 0.45) continue;
            phases[k] += (2 * Math.PI * hz) / sr;
            y += (Math.sin(phases[k]) / (k + 1)) * decayGain(i, v.decayMs / (1 + k * 0.6), sr);
        }
        y += v.strike * hp.run(rng.next() * 2 - 1) * Math.exp(-(i / sr) / 0.004);
        x[i] = y;
    }
    return finish(x, sr);
}

function fm(v: Record<string, number>, sr: number, seed: number): Stereo {
    const n = lengthFor(v.attackMs + v.decayMs * 1.05 + 10, sr);
    const x = new Float32Array(n);
    const rng = createRng(seed ^ 0xf3);
    // Harmonic: the ratio snaps to the nearest half, which keeps the sound tonal.
    const ratio = rng.next() < v.harmonic ? Math.max(0.5, Math.round(v.ratio * 2) / 2) : v.ratio;
    const attack = Math.round((v.attackMs / 1000) * sr);
    let pc = 0, pm = 0, prev = 0;
    for (let i = 0; i < n; i++) {
        pm += (2 * Math.PI * v.carrierHz * ratio) / sr;
        const mod = Math.sin(pm + v.feedback * 2.5 * prev);
        prev = mod;
        const index = v.index * decayGain(i, v.indexMs, sr);
        pc += (2 * Math.PI * v.carrierHz) / sr;
        const amp = i < attack ? i / attack : decayGain(i - attack, v.decayMs, sr);
        x[i] = Math.sin(pc + index * mod) * amp;
    }
    return finish(x, sr);
}

function noise(v: Record<string, number>, sr: number, seed: number): Stereo {
    const n = lengthFor(v.lengthMs, sr);
    const x = new Float32Array(n);
    const rng = createRng(seed ^ 0x2015e);
    const lp = new Biquad();
    const attack = Math.max(1, Math.round((Math.min(v.attackMs, v.lengthMs * 0.9) / 1000) * sr));
    for (let i = 0; i < n; i++) {
        if (i % 64 === 0) {
            const u = i / n;
            lp.set('lp', v.fromHz * Math.pow(v.toHz / v.fromHz, u), v.q, sr);
        }
        const env = Math.min(1, i / attack) * Math.min(1, (n - i) / (0.05 * sr));
        x[i] = lp.run(rng.next() * 2 - 1) * env;
    }
    return finish(x, sr);
}

const RENDER: Record<SynthKind, (v: Record<string, number>, sr: number, seed: number) => Stereo> = {
    kick, snare, hat, clap, perc, fm, noise,
};

/** A take: the values picked for this seed, and its sound. */
export function synthesize(kind: SynthKind, ranges: SynthRanges, seed: number, sampleRate: number):
    { values: Record<string, number>; audio: Stereo } {
    const values = pickValues(kind, ranges, seed);
    return { values, audio: RENDER[kind](values, sampleRate, seed) };
}
