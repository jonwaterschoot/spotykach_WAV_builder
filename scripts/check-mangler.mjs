#!/usr/bin/env node
/**
 * Checks for the Sample Mangler engine (src/mangler, src/lib/audio/pitch.ts).
 *
 *   node scripts/check-mangler.mjs        (or: npm run check:mangler)
 *
 * Synthetic sources only, nothing to download. Covers: the same seed and settings
 * give bit-identical output, the file is exactly the asked length, cue points are
 * in order and capped at 255, peaks stay under −1 dBFS, YIN finds the notes of
 * plain tones and refuses noise, and moving one slider leaves the other dice alone.
 *
 * Needs Node 22.18+ / 23.6+ (imports the TypeScript sources directly via Node's
 * built-in type stripping). Exits 1 on any failure.
 */

import { createRng } from '../src/mangler/rng.ts';
import { DEFAULT_SETTINGS, PRESETS, sanitizeSettings, MAX_CUE_POINTS } from '../src/mangler/settings.ts';
import { render, MANGLE_SAMPLE_RATE as SR } from '../src/mangler/render.ts';
import { detectPitchYin, semitonesToNearestC, noteName } from '../src/lib/audio/pitch.ts';

let failures = 0;
const check = (ok, label, detail = '') => {
    console.log(`${ok ? '  ok ' : 'FAIL '} ${label}${detail ? `  (${detail})` : ''}`);
    if (!ok) failures++;
};
const section = title => console.log(`\n${title}`);

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------

const tone = (hz, seconds, shape = 'sine', amp = 0.5) => {
    const out = new Float32Array(Math.round(seconds * SR));
    for (let i = 0; i < out.length; i++) {
        const phase = (i * hz / SR) % 1;
        out[i] = amp * (shape === 'saw' ? 2 * phase - 1 : Math.sin(2 * Math.PI * phase));
    }
    return out;
};
const noise = (seconds, amp = 0.3, seed = 1) => {
    const rng = createRng(seed);
    const out = new Float32Array(Math.round(seconds * SR));
    for (let i = 0; i < out.length; i++) out[i] = amp * (rng.next() * 2 - 1);
    return out;
};
const mono = (signal, enabled = true) => ({ channels: [signal, signal], enabled });
const stereo = (l, r, enabled = true) => ({ channels: [l, r], enabled });

const sources = [
    stereo(tone(220, 3), tone(220, 3, 'sine', 0.4)),  // A3
    mono(noise(5)),
    mono(tone(146.83, 1, 'saw', 0.2)),                // D3, quiet
    mono(tone(1000, 0.05)),                           // shorter than most snippets
    mono(new Float32Array(2 * SR)),                   // silence
];

const sameArray = (a, b) => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
    return true;
};

// ---------------------------------------------------------------------------
// RNG
// ---------------------------------------------------------------------------

section('RNG');
{
    const a = createRng(42), b = createRng(42);
    const seqA = Array.from({ length: 100 }, () => a.next());
    const seqB = Array.from({ length: 100 }, () => b.next());
    check(seqA.every((v, i) => v === seqB[i]), 'same seed, same sequence');
    check(seqA.every(v => v >= 0 && v < 1), 'next() in [0, 1)');

    const r = createRng(7);
    const picks = Array.from({ length: 5000 }, () => r.logUniform(20, 10000));
    check(picks.every(v => v >= 20 && v <= 10000), 'logUniform stays in range');
    const under = picks.filter(v => v < Math.sqrt(20 * 10000)).length / picks.length;
    check(Math.abs(under - 0.5) < 0.05, 'logUniform: half the picks under the geometric mean', under.toFixed(3));

    const longBias = createRng(7);
    const biased = Array.from({ length: 5000 }, () => longBias.logUniform(20, 10000, 1));
    const biasedUnder = biased.filter(v => v < Math.sqrt(20 * 10000)).length / biased.length;
    check(biasedUnder < 0.3, 'bias +1 favours long snippets', biasedUnder.toFixed(3));

    const p = createRng(3);
    const counts = [0, 0, 0];
    for (let i = 0; i < 6000; i++) counts[p.pick([1, 2, 0])]++;
    check(counts[2] === 0 && Math.abs(counts[1] / counts[0] - 2) < 0.2, 'pick follows weights', counts.join('/'));
}

// ---------------------------------------------------------------------------
// Pitch
// ---------------------------------------------------------------------------

section('Pitch (YIN)');
for (const [hz, shape] of [[55, 'sine'], [110, 'saw'], [220, 'sine'], [261.63, 'saw'], [440, 'sine'], [880, 'saw'], [1600, 'sine']]) {
    const est = detectPitchYin(tone(hz, 0.5, shape), SR);
    const cents = est ? 1200 * Math.log2(est.frequency / hz) : NaN;
    check(est && Math.abs(cents) < 10 && est.confidence > 0.8,
        `${hz} Hz ${shape} → ${est ? `${est.frequency.toFixed(2)} Hz ${est.note}` : 'none'}`,
        est ? `${cents.toFixed(1)} ct, confidence ${est.confidence.toFixed(2)}` : '');
}
{
    const est = detectPitchYin(noise(0.5), SR);
    check(!est || est.confidence < 0.3, 'noise has no confident pitch', est ? est.confidence.toFixed(2) : 'none');
    check(detectPitchYin(tone(220, 0.05), SR) === null, 'under 80 ms gives no pitch');
    check(detectPitchYin(new Float32Array(SR), SR) === null, 'silence gives no pitch');
    check(Math.abs(semitonesToNearestC(220) - 3) < 1e-9, 'A3 → C is +3 st');
    check(Math.abs(semitonesToNearestC(261.6256)) < 1e-3, 'C4 → C is 0 st');
    check(Math.abs(semitonesToNearestC(146.832) + 2) < 1e-3, 'D3 → C is −2 st');
    check(noteName(220) === 'A3' && noteName(261.63) === 'C4', 'note names');
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

section('Render');
const settings = sanitizeSettings({ ...DEFAULT_SETTINGS, repitch: 'apply', pitchConfidence: 0.5 });
const t0 = performance.now();
const a = render(sources, settings, 12345);
const elapsed = performance.now() - t0;
const b = render(sources, settings, 12345);
const c = render(sources, settings, 54321);

check(sameArray(a.left, b.left) && sameArray(a.right, b.right), 'same seed and settings: bit-identical', `${elapsed.toFixed(0)} ms per 42 s render`);
check(JSON.stringify(a.snippets) === JSON.stringify(b.snippets), 'same seed: same snippet list');
check(!sameArray(a.left, c.left), 'another seed: another file');
check(a.left.length === 42 * SR && a.right.length === 42 * SR, 'exactly 42 s', `${a.left.length} frames`);
check(a.cuePoints[0] === 0, 'first cue at 0');
check(a.cuePoints.every((f, i) => i === 0 || f > a.cuePoints[i - 1]), 'cue points ascending', `${a.cuePoints.length} cues, ${a.snippets.length} snippets`);
check(a.cuePoints.every(f => f < a.left.length), 'cue points inside the file');

const ceiling = Math.pow(10, -1 / 20);
const peakOf = r => Math.max(...[r.left, r.right].map(ch => ch.reduce((m, v) => Math.max(m, Math.abs(v)), 0)));
check(peakOf(a) <= ceiling + 1e-6, 'peak at or under −1 dBFS', `${(20 * Math.log10(peakOf(a))).toFixed(2)} dBFS, limiter ${a.peakReductionDb.toFixed(1)} dB`);
check(!a.left.some(Number.isNaN) && !a.right.some(Number.isNaN), 'no NaN');

check(a.snippets.every(s => s.source !== 4 || s.rerolls === 5), 'silent source only used after 5 rerolls',
    `${a.snippets.filter(s => s.rerolls > 0).length} snippets rerolled`);
const fromSine = a.snippets.filter(s => s.source === 0 && s.pitch && s.pitch.confidence >= 0.5);
check(fromSine.length > 0 && fromSine.every(s => Math.abs(s.shift - s.pitch.toC) < 1e-9 && Math.abs(s.pitch.toC - 3) < 0.1),
    'apply: A3 snippets shifted +3 st to C', `${fromSine.length} snippets`);
check(a.snippets.some(s => s.source === 3), 'a source shorter than the snippet is still used');

// One slider moved, same seed: the dice for everything else stay put.
const moved = render(sources, { ...settings, reverseProbability: 0.9, skipSilence: false }, 12345);
const base = render(sources, { ...settings, skipSilence: false }, 12345);
const n = Math.min(moved.snippets.length, base.snippets.length);
const sameDice = moved.snippets.slice(0, n).every((s, i) =>
    s.source === base.snippets[i].source && s.sourceStart === base.snippets[i].sourceStart && s.length === base.snippets[i].length);
check(sameDice && moved.snippets.some((s, i) => i < n && s.reverse !== base.snippets[i].reverse),
    'reverse slider changes direction only', `${n} snippets compared`);

section('Presets and edges');
{
    const glitch = render(sources, sanitizeSettings({ ...DEFAULT_SETTINGS, ...PRESETS.Glitch, snippetMaxMs: 40 }), 1);
    check(glitch.cuesCapped && glitch.cuePoints.length === MAX_CUE_POINTS, `20–40 ms snippets: cues capped at ${MAX_CUE_POINTS}`, `${glitch.snippets.length} snippets`);

    const texture = render(sources, sanitizeSettings({ ...DEFAULT_SETTINGS, ...PRESETS.Texture, outputSeconds: 10, loop: true }), 2);
    check(texture.left.length === 10 * SR, 'loop: exactly the asked length');
    const seam = Math.abs(texture.left[texture.left.length - 1] - texture.left[0]);
    check(seam < 0.2, 'loop: end runs into the start', `jump ${seam.toFixed(4)}`);

    const short = render(sources, sanitizeSettings({ outputSeconds: 1, snippetMinMs: 5000, snippetMaxMs: 10000 }), 3);
    check(short.left.length === SR && short.snippets.length >= 1, 'snippets longer than the file are trimmed to it');

    const noCues = render(sources, sanitizeSettings({ outputSeconds: 5, cuePoints: false }), 4);
    check(noCues.cuePoints.length === 0, 'cue points off: none');

    const capped = render(sources, sanitizeSettings({ outputSeconds: 10, maxPerSource: 2, skipSilence: false }), 5);
    const perSource = [0, 0, 0, 0, 0];
    for (const s of capped.snippets) perSource[s.source]++;
    check(capped.left.length === 10 * SR, 'max per source: file still fills when the cap runs out', perSource.join('/'));

    const loud = { outputSeconds: 10, loudnessTargetDb: -6, loudnessSpreadDb: 12 };
    const limited = render(sources, sanitizeSettings(loud), 6);
    check(limited.peakReductionDb < 0 && peakOf(limited) <= ceiling + 1e-6, 'loud: limiter holds −1 dBFS',
        `reduction ${limited.peakReductionDb.toFixed(1)} dB`);
    const scaled = render(sources, sanitizeSettings({ ...loud, limiter: false }), 6);
    check(scaled.peakReductionDb < 0 && Math.abs(peakOf(scaled) - ceiling) < 1e-5, 'loud, no limiter: scaled to −1 dBFS');

    let threw = false;
    try { render(sources.map(s => ({ ...s, enabled: false })), settings, 1); } catch { threw = true; }
    check(threw, 'no enabled sources: refuses');

    const clamped = sanitizeSettings({ outputSeconds: 99, snippetMinMs: 5000, snippetMaxMs: 100, variations: 50, repitch: 'nope' });
    check(clamped.outputSeconds === 42 && clamped.snippetMinMs === 100 && clamped.snippetMaxMs === 5000
        && clamped.variations === 12 && clamped.repitch === DEFAULT_SETTINGS.repitch, 'settings sanitised');
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
