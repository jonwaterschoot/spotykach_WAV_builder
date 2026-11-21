#!/usr/bin/env node
/**
 * Checks for the Loop tool's tempo helpers (src/lib/audio/loopTempo.ts).
 *
 *   node scripts/check-loop-tempo.mjs        (or: npm run check:loop-tempo)
 *
 * Synthetic drum patterns only. Covers: BPMs read from file names, the bar sums
 * with the crossfade folded in, tempo from a selection's length, and the estimate
 * landing on the right tempo (or its double or half) for straight, syncopated and
 * swung patterns, with noise refused as low confidence.
 *
 * Needs Node 22.18+ / 23.6+ (type stripping). Exits 1 on any failure.
 */

import {
    bpmFromName, bpmFromLength, estimateTempo, fitTempoToLength, gridMarkers, loopBars, loopWithPreRoll, selectionFor, tidyBpm,
} from '../src/lib/audio/loopTempo.ts';

let failures = 0;
const check = (ok, label, detail = '') => {
    console.log(`${ok ? '  ok ' : 'FAIL '} ${label}${detail ? `  (${detail})` : ''}`);
    if (!ok) failures++;
};
const section = title => console.log(`\n${title}`);
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const SR = 48000;

/** A drum pattern: 16 steps per bar, `steps` = { kick, snare, hat } arrays of step indices. */
function pattern(bpm, bars, steps, { swing = 0, seed = 1 } = {}) {
    const len = Math.round(bars * 240 / bpm * SR);
    const out = new Float32Array(len);
    let s = seed;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;
    const step = 60 / bpm / 4;
    const hit = (t, kind) => {
        const at = Math.round(t * SR);
        const dur = Math.round((kind === 'kick' ? 0.25 : kind === 'snare' ? 0.15 : 0.04) * SR);
        for (let i = 0; i < dur && at + i < len; i++) {
            const env = Math.exp(-i / (dur / 5));
            const x = kind === 'kick' ? Math.sin(2 * Math.PI * (55 + 80 * Math.exp(-i / 2000)) * i / SR)
                : kind === 'snare' ? 0.6 * rnd() + 0.3 * Math.sin(2 * Math.PI * 190 * i / SR)
                : 0.3 * rnd();
            out[at + i] += x * env * 0.7;
        }
    };
    for (let b = 0; b < bars; b++) {
        for (const [kind, list] of Object.entries(steps)) {
            for (const k of list) {
                const sw = k % 2 === 1 ? swing * step : 0;
                hit((b * 16 + k) * step + sw, kind);
            }
        }
    }
    return out;
}

const FOUR = { kick: [0, 4, 8, 12], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] };
const BREAK = { kick: [0, 6, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] };
const HOUSE16 = { kick: [0, 4, 8, 12], snare: [4, 12], hat: [...Array(16).keys()] };

section('File names');
check(bpmFromName('SEQ_120BPM_4BARS_ABCD') === 120, 'SEQ_120BPM_4BARS_ABCD → 120');
check(bpmFromName('loop 92 bpm.wav') === 92, 'loop 92 bpm → 92');
check(bpmFromName('break_bpm-174') === 174, 'break_bpm-174 → 174');
check(bpmFromName('pad_87.5bpm') === 87.5, 'pad_87.5bpm → 87.5');
check(bpmFromName('kick 909') === null, 'no bpm in "kick 909"');
check(bpmFromName('2bpm') === null, 'out of range ignored');

section('Bar sums');
check(near(selectionFor(4, 120, 0.2), 8.2, 1e-9), '4 bars @120 + 0.2 s fade = 8.2 s selection');
check(near(loopBars(8.2, 120, 0.2), 4, 1e-9), '8.2 s selection, 0.2 s fade = 4 bars');
check(tidyBpm(119.97) === 120 && tidyBpm(121.43) === 121.4, 'tidyBpm');
check(JSON.stringify(gridMarkers(2, 0.5)) === '[0.5,1,1.5]', 'grid markers exclude 0 and the end');

section('Tempo from length');
{
    const a = bpmFromLength(8);
    check(a && a.bars === 4 && near(a.bpm, 120, 1e-9), '8 s → 4 bars @ 120', JSON.stringify(a));
    const b = bpmFromLength(8, 60);
    check(b && b.bars === 2 && near(b.bpm, 60, 1e-9), '8 s near 60 → 2 bars @ 60', JSON.stringify(b));
    const c = bpmFromLength(1.9);
    check(c && c.bars === 1 && near(c.bpm, 126.3, 0.1), '1.9 s → 1 bar @ 126.3', JSON.stringify(c));
    const d = fitTempoToLength(119.6, 8);
    check(d && d.bars === 4 && near(d.bpm, 120, 1e-9), 'estimate 119.6 on an 8 s file fits 4 bars @ 120', JSON.stringify(d));
    check(fitTempoToLength(110, 8) === null, '110 on 8 s is not a whole number of bars');
}

section('Tempo estimate');
for (const [name, bpm, steps, opts] of [
    ['four-on-floor', 120, FOUR, {}],
    ['four-on-floor', 128, FOUR, {}],
    ['breakbeat', 90, BREAK, {}],
    ['breakbeat', 174, BREAK, {}],
    ['16th hats', 124, HOUSE16, {}],
    ['swung', 96, BREAK, { swing: 0.33 }],
    ['slow', 72, FOUR, {}],
]) {
    const sig = pattern(bpm, 4, steps, opts);
    const t0 = performance.now();
    const est = estimateTempo([sig], SR);
    const ms = performance.now() - t0;
    // Double or half is the octave ambiguity every tempo tracker has (174 drum and
    // bass is also 87 half-time); the editor offers ×2 / ÷2 for it. Anything else fails.
    const octave = est && (near(est.bpm * 2, bpm, 1) || near(est.bpm / 2, bpm, 1));
    check(est && (near(est.bpm, bpm, 1) || octave), `${name} @ ${bpm}${octave ? ' (octave)' : ''}`, est ? `${est.bpm.toFixed(2)} bpm, conf ${est.confidence.toFixed(2)}, ${ms.toFixed(0)} ms` : 'null');
}
{
    const noise = new Float32Array(SR * 6);
    let s = 7;
    for (let i = 0; i < noise.length; i++) noise[i] = (((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 2 - 1) * 0.3;
    const est = estimateTempo([noise], SR);
    check(!est || est.confidence < 0.15, 'white noise is low confidence', est ? `conf ${est.confidence.toFixed(2)}` : 'null');
    check(estimateTempo([new Float32Array(SR)], SR) === null, 'under 1.5 s: no estimate');
}

section('Fade into the downbeat (BPM Sync)');
{
    // A 220.5 Hz tone: cut 1 s from 0.5 s with a 20 ms fade; the wrap must be seamless.
    const tone = new Float32Array(SR * 2);
    for (let i = 0; i < tone.length; i++) tone[i] = Math.sin(2 * Math.PI * 220.5 * i / SR);
    const start = SR / 2, length = SR, fade = Math.round(0.02 * SR);
    const [out] = loopWithPreRoll([tone], start, length, fade);
    check(out.length === length, 'exactly the asked length', `${out.length}`);
    check(out[0] === tone[start] && out[length - fade - 1] === tone[start + length - fade - 1], 'head and body untouched');
    // At the wrap the last sample is (nearly) the one before the start: the step is one sample's worth.
    const step = Math.abs(out[0] - out[length - 1]);
    const natural = Math.abs(tone[start] - tone[start - 1]);
    check(step < natural * 1.5, 'no jump at the wrap', `step ${step.toFixed(4)}, natural ${natural.toFixed(4)}`);
    const [none] = loopWithPreRoll([tone], 0, length, fade);
    check(none.every((v, i) => v === tone[i]), 'no audio before the start: no fade');
    const [unchanged] = loopWithPreRoll([tone], start, length, 0);
    check(unchanged.every((v, i) => v === tone[start + i]), 'fade 0 is a plain cut');
}

console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
