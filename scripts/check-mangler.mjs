#!/usr/bin/env node
/**
 * Checks for the Sample Mangler engine (src/mangler).
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
import { detectPitchYin, semitonesToNearestC, noteName } from '../src/mangler/pitch.ts';

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

// Rests and soft parts: their own dice, so the picks stay put and old results too.
{
    const quiet = { ...settings, skipSilence: false, restProbability: 0.25, softProbability: 0.3, softMinDb: 6, softMaxDb: 18 };
    const r = render(sources, quiet, 12345);
    const m = Math.min(r.snippets.length, base.snippets.length);
    check(r.snippets.slice(0, m).every((s, i) =>
        s.source === base.snippets[i].source && s.sourceStart === base.snippets[i].sourceStart && s.length === base.snippets[i].length),
        'rests and soft parts: same picks as without', `${m} snippets compared`);
    const rests = r.snippets.filter(s => s.rest);
    const softs = r.snippets.filter(s => s.softDb);
    check(rests.length > 0 && softs.length > 0, 'some rests, some soft parts', `${rests.length} rests, ${softs.length} soft of ${r.snippets.length}`);
    check(softs.every(s => s.softDb <= -6 && s.softDb >= -18), 'soft parts within 6–18 dB down');
    // A rest is silent away from its crossfades.
    const silentInside = rests.every(s => {
        const from = s.outStart + s.xfade, to = s.outStart + s.length - Math.round(0.05 * SR);
        for (let i = from; i < to; i++) if (r.left[i] !== 0 || r.right[i] !== 0) return false;
        return true;
    });
    check(silentInside, 'rests are silent between their crossfades');
    const again = render(sources, quiet, 12345, { fixed: r.snippets });
    check(sameArray(again.left, r.left) && sameArray(again.right, r.right), 'rests and soft parts survive an edit (fixed)');
    const off = render(sources, { ...settings, skipSilence: false, softMinDb: 3, softMaxDb: 30 }, 12345);
    check(sameArray(off.left, base.left), 'at 0 %: bit-identical to a render without them');
}

// AD envelopes: dice of their own, an attack from silence, −60 dB at the decay's end.
{
    const { applyEnvelope } = await import('../src/mangler/render.ts');
    const ones = () => { const x = new Float32Array(SR).fill(1); return [x, x]; };
    const e = ones();
    applyEnvelope(e, { attackMs: 10, decayMs: 200, curve: 'exp' }, SR);
    const at = ms => e[0][Math.round(ms / 1000 * SR)];
    check(e[0][0] === 0 && Math.abs(at(10) - 1) < 1e-3, 'envelope: from silence to full over the attack');
    check(Math.abs(20 * Math.log10(at(210)) + 60) < 0.5, 'exp decay: −60 dB at the end of the decay', `${(20 * Math.log10(at(210))).toFixed(1)} dB`);
    const lin = ones();
    applyEnvelope(lin, { attackMs: 0, decayMs: 100, curve: 'linear' }, SR);
    check(lin[0][0] === 1 && Math.abs(lin[0][Math.round(0.05 * SR)] - 0.5) < 1e-3 && lin[0][Math.round(0.2 * SR)] === 0, 'linear: halfway at half the decay, then silent');

    const enveloped = { ...settings, skipSilence: false, envelope: true, attackMinMs: 0, attackMaxMs: 20, decayMinMs: 50, decayMaxMs: 400 };
    const r = render(sources, enveloped, 12345);
    const m = Math.min(r.snippets.length, base.snippets.length);
    check(r.snippets.slice(0, m).every((s, i) => s.source === base.snippets[i].source && s.sourceStart === base.snippets[i].sourceStart),
        'envelope: same picks as without');
    check(r.snippets.every(s => s.envelope && s.envelope.attackMs <= 20 && s.envelope.decayMs >= 50 && s.envelope.decayMs <= 400),
        'envelope: every snippet has one, inside the ranges');
    const again = render(sources, enveloped, 12345, { fixed: r.snippets });
    check(sameArray(again.left, r.left), 'envelope survives an edit (fixed)');
}

section('Editing (fixed snippets)');
{
    const again = render(sources, settings, 12345, { fixed: a.snippets });
    check(sameArray(again.left, a.left) && sameArray(again.right, a.right), 'every snippet fixed: bit-identical to the original');

    // Delete snippet 3: the rest fixed, the end refilled.
    const without = a.snippets.filter((_, i) => i !== 3);
    const deleted = render(sources, settings, 12345, { fixed: without });
    check(deleted.left.length === a.left.length, 'delete a snippet: still exactly 42 s');
    check(deleted.snippets.slice(0, without.length).every((s, i) =>
        s.sourceStart === without[i].sourceStart && s.source === without[i].source),
        'delete a snippet: the others keep their audio', `${deleted.snippets.length} snippets`);

    // Lock snippet 5, reroll the rest with another seed.
    const locked = a.snippets.map((s, i) => (i === 5 ? s : null));
    const rerolled = render(sources, settings, 999, { fixed: locked });
    check(rerolled.snippets[5].sourceStart === a.snippets[5].sourceStart && rerolled.snippets[0].sourceStart !== a.snippets[0].sourceStart,
        'lock one, reroll the rest');

    // Apply C to one suggested snippet.
    const suggest = sanitizeSettings({ ...settings, repitch: 'suggest' });
    const sug = render(sources, suggest, 77);
    const target = sug.snippets.findIndex(s => s.pitch && !s.toCApplied);
    const edited = sug.snippets.map((s, i) => (i === target ? { ...s, shift: s.shift + s.pitch.toC, toCApplied: true } : s));
    const applied = render(sources, suggest, 77, { fixed: edited });
    check(target >= 0 && applied.snippets[target].toCApplied && !sameArray(applied.left, sug.left),
        'suggest: applying C to one snippet changes the file', `snippet ${target + 1}`);

    let threw = false;
    try { render([sources[0]], settings, 1, { fixed: [{ ...a.snippets[0], source: 7 }] }); } catch { threw = true; }
    check(threw, 'a fixed snippet whose source is gone: refuses');
}

section('Snap and resampling');
{
    const zero = render(sources, sanitizeSettings({ ...settings, snapStart: 'zero', repitch: 'off', reverseProbability: 0 }), 8);
    const offZero = zero.snippets.filter(s => {
        const src = sources[s.source].channels;
        const i = s.sourceStart;
        const v = k => src[0][k] + src[1][k];
        return i + 1 < src[0].length && v(i) !== 0 && Math.sign(v(i)) === Math.sign(v(i + 1)) && Math.sign(v(i)) === Math.sign(v(i - 1) ?? v(i));
    });
    // Silence and tiny sources have no crossing within 5 ms; tones and noise do.
    const toneOnes = zero.snippets.filter(s => s.source <= 2);
    check(offZero.filter(s => s.source <= 2).length === 0, 'snap to zero: tone and noise snippets start on a crossing', `${toneOnes.length} checked`);

    // Clicks: a 1 s source of silence with a hit every 100 ms, so every 200 ms
    // search window holds one.
    const hits = new Float32Array(SR);
    for (let h = 0; h < 10; h++) for (let i = 0; i < 2000; i++) hits[h * 4800 + 1000 + i] = Math.sin(i * 0.3) * Math.exp(-i / 400);
    const onset = render([mono(hits)], sanitizeSettings({ outputSeconds: 3, snapStart: 'onset', skipSilence: false, snippetMinMs: 200, snippetMaxMs: 240, reverseProbability: 0, repitch: 'off' }), 3);
    const nearHit = onset.snippets.filter(s => {
        const phase = (s.sourceStart - 1000 + 4800) % 4800;
        return phase < 200 || phase > 4800 - 200;
    }).length;
    check(nearHit >= onset.snippets.length * 0.8, 'snap to onset: snippets start at a hit', `${nearHit} of ${onset.snippets.length}`);

    const { resampleSinc, resample } = await import('../src/mangler/dsp.ts');
    const sine = tone(1000, 0.5);
    const ideal = r => tone(1000 * r, 0.5).subarray(0, 4000);
    const err = (out, ref) => { let e = 0; for (let i = 500; i < 3500; i++) e = Math.max(e, Math.abs(out[i] - ref[i])); return e; };
    const r = Math.pow(2, -7 / 12);
    const sincErr = err(resampleSinc([sine, sine], r, 4000)[0], ideal(r));
    const linErr = err(resample([sine, sine], r, 4000)[0], ideal(r));
    check(sincErr < 1e-3 && sincErr < linErr, 'sinc: closer to the ideal tone than linear', `max error ${sincErr.toExponential(1)} vs ${linErr.toExponential(1)}`);
    const dc = resampleSinc([new Float32Array(2000).fill(0.5), new Float32Array(2000).fill(0.5)], 1.7, 600)[0];
    check(dc.slice(50, 550).every(v => Math.abs(v - 0.5) < 1e-5), 'sinc: DC passes unchanged');
}

section('Scales, pitch choices, transients');
{
    const { semitonesToPitchClasses } = await import('../src/mangler/pitch.ts');
    const { maskFromIntervals, SCALES, scalePitchClasses } = await import('../src/mangler/settings.ts');
    const major = maskFromIntervals(SCALES.find(sc => sc.name === 'Major').intervals);
    check(semitonesToPitchClasses(220, scalePitchClasses(2, major)) === 0, 'A is in D major: no shift');
    check(semitonesToPitchClasses(220, scalePitchClasses(6, major)) === -1, 'A in F# major: down to G# (ties go down)');
    check(Math.abs(semitonesToPitchClasses(300, scalePitchClasses(0, 1)) - semitonesToPitchClasses(300, [0])) < 1e-12, 'root only on C = to C');

    const inMinor = render(sources, sanitizeSettings({ ...settings, scaleRoot: 9, scaleMask: maskFromIntervals([0, 2, 3, 5, 7, 8, 10]) }), 12345);
    const aSnips = inMinor.snippets.filter(s => s.source === 0 && s.choice?.kind === 'scale');
    check(aSnips.length > 0 && aSnips.every(s => Math.abs(s.shift) < 0.1), 'apply with A minor: A3 snippets stay put', `${aSnips.length} snippets`);

    const { withChoice, detuneOf, choiceOf } = await import('../src/mangler/pitchChoice.ts');
    const sine = a.snippets.find(s => s.source === 0 && s.pitch);
    const toE = withChoice({ ...sine, detune: 0.5, shift: 0.5 + sine.pitch.toC }, { kind: 'note', pc: 4 }, settings);
    check(Math.abs(toE.shift - (0.5 - 5)) < 0.05 && toE.choice.kind === 'note', 'A3 to E: −5 st on top of the detune', toE.shift.toFixed(2));
    const old = { ...sine, detune: undefined, choice: undefined, toCApplied: true, shift: 1 + sine.pitch.toC };
    check(Math.abs(detuneOf(old) - 1) < 1e-9 && choiceOf(old)?.kind === 'note', 'old results: toCApplied reads as "to C"');
    const plain = withChoice({ ...sine, pitch: null }, { kind: 'st', st: 7 }, settings);
    check(plain.choice.kind === 'st', 'a plain shift works without a detected pitch');

    // Hits every 100 ms from 1000 on (built above for the onset snap).
    const { detectOnsets } = await import('../src/mangler/dsp.ts');
    const hitsTrack = new Float32Array(SR);
    for (let h = 0; h < 10; h++) for (let i = 0; i < 2000; i++) hitsTrack[h * 4800 + 1000 + i] = Math.sin(i * 0.3) * Math.exp(-i / 400);
    const found = detectOnsets([hitsTrack, hitsTrack], SR, { sensitivity: 0.5 });
    const onHit = found.filter(o => { const p = (o.frame - 1000 + 4800) % 4800; return p < 60 || p > 4800 - 60; });
    check(found.length >= 9 && found.length <= 11 && onHit.length === found.length, 'detectOnsets: one per hit', `${found.length} found`);
    const noiseOnsets = detectOnsets([noise(1), noise(1)], SR, { sensitivity: 0.5 });
    check(noiseOnsets.length <= 3, 'detectOnsets: steady noise has (almost) none', String(noiseOnsets.length));

    const drums = render([mono(hitsTrack)], sanitizeSettings({
        outputSeconds: 5, snapStart: 'onset', oneHit: true, skipSilence: false, snippetMinMs: 300, snippetMaxMs: 600,
        reverseProbability: 0, repitch: 'off', xfadeMinMs: 0, xfadeMaxMs: 2,
    }), 4);
    const longest = Math.max(...drums.snippets.map(s => s.length)) / SR * 1000;
    check(longest <= 110, 'one hit per snippet: no snippet runs into the next hit', `longest ${longest.toFixed(0)} ms`);

    const { transientCues, snippetCues } = await import('../src/mangler/recue.ts');
    const cues = transientCues([drums.left, drums.right], SR, 'normal');
    // One hit per snippet strips each hit's tail, so the snippets are as short as
    // the hits; "normal" keeps cues 60 ms apart, so it can't give one to each.
    const starts = drums.snippets.map(s => s.outStart + (s.xfade >> 1));
    // Snapped starts sit a few ms before the attack; the cues sit on it.
    const onStarts = cues.filter(c => starts.some(st => Math.abs(st - c) <= 0.005 * SR));
    const room = Math.min(drums.snippets.length, Math.floor(drums.left.length / (0.06 * SR)));
    check(cues[0] === 0 && onStarts.length >= cues.length * 0.9 && cues.length >= room * 0.5,
        'transient cues on a mangled drum loop: on the hits', `${cues.length} cues, ${onStarts.length} on snippet starts; room for ${room}`);
    const clicks = new Float32Array(42 * SR);
    for (let t = 1000; t < clicks.length - 200; t += 1440) for (let i = 0; i < 100; i++) clicks[t + i] = 0.8 * Math.exp(-i / 20) * (i % 2 ? 1 : -1);
    const dense = transientCues([clicks, clicks], SR, 'aggressive');
    check(dense.length <= MAX_CUE_POINTS && dense.every((f, i) => i === 0 || f > dense[i - 1]), 'transient cues: capped at 255, in order', `${dense.length} cues`);
    check(JSON.stringify(snippetCues(a.snippets, a.left.length)) === JSON.stringify(a.cuePoints), 'snippet cues match what a render writes');
}

section('Source parts and crop');
{
    // Two parts of the 5 s noise source: 1.0-1.5 s and 3.0-4.0 s.
    const parts = [[1 * SR, 1.5 * SR], [3 * SR, 4 * SR]];
    const partSources = [{ ...sources[1], regions: parts }];
    const partRender = render(partSources, sanitizeSettings({ outputSeconds: 10, snippetMinMs: 100, snippetMaxMs: 2000, repitch: 'off', snapStart: 'zero' }), 21);
    const inside = partRender.snippets.every(s => parts.some(([a, b]) => s.sourceStart >= a && s.sourceStart + s.sourceLength <= b));
    check(inside, 'parts: every snippet stays inside one part', `${partRender.snippets.length} snippets`);
    check(partRender.snippets.every(s => s.length <= SR), 'parts: a snippet longer than its part is cut to it');
    const both = new Set(partRender.snippets.map(s => (s.sourceStart < 2 * SR ? 0 : 1)));
    check(both.size === 2, 'parts: both parts are used');
    const whole = render([{ ...sources[1], regions: [] }], settings, 3);
    const plainSrc = render([sources[1]], settings, 3);
    check(sameArray(whole.left, plainSrc.left), 'no parts = the whole file, bit-identical');

    const { cropResult, clampCrop } = await import('../src/mangler/crop.ts');
    const crop = { start: 5 * SR, end: 20 * SR };
    const cropped = cropResult(a, crop);
    check(cropped.left.length === 15 * SR, 'crop: 5-20 s is 15 s');
    check(cropped.cuePoints[0] === 0 && cropped.cuePoints.slice(1).every(c => c > 0 && c < 15 * SR), 'crop: cues shifted, one at 0',
        `${cropped.cuePoints.length} cues`);
    check(Math.abs(cropped.left[0]) < 0.01 && Math.abs(cropped.left[cropped.left.length - 1]) < 0.01, 'crop: faded at the cut edges');
    check(cropped.left[1000] === a.left[5 * SR + 1000], 'crop: the audio inside is untouched');
    check(clampCrop({ start: 40 * SR, end: 99 * SR }, 42 * SR).end === 42 * SR && clampCrop({ start: 50 * SR, end: 60 * SR }, 42 * SR) === null,
        'crop: clamped to the file, null when nothing is left');
}

section('Fill by count');
{
    const byCount = sanitizeSettings({ ...settings, fillMode: 'count', snippetCount: 12 });
    const lengths = [1, 2, 3, 4].map(seedValue => {
        const out = render(sources, byCount, seedValue);
        check(out.snippets.length === 12 && out.cuePoints.length === 12, `seed ${seedValue}: exactly 12 snippets and cues`,
            `${(out.left.length / SR).toFixed(2)} s`);
        const last = out.snippets[11];
        check(out.left.length === last.outStart + last.length, `seed ${seedValue}: the file ends where the last snippet does`);
        return out.left.length;
    });
    check(new Set(lengths).size === 4, 'variations come out at different lengths');
    const again = render(sources, byCount, 1);
    check(again.left.length === lengths[0], 'count mode is seeded too');

    const tooMany = render(sources, sanitizeSettings({ fillMode: 'count', snippetCount: 100, snippetMinMs: 2000, snippetMaxMs: 4000 }), 5);
    check(tooMany.left.length === 42 * SR && tooMany.countCapped && tooMany.snippets.length < 100,
        'more than fits: stops at 42 s and says so', `${tooMany.snippets.length} snippets`);

    const looped = render(sources, sanitizeSettings({ ...byCount, loop: true, xfadeMaxMs: 200 }), 6);
    const unlooped = render(sources, sanitizeSettings({ ...byCount, loop: false, xfadeMaxMs: 200 }), 6);
    check(looped.left.length < unlooped.left.length && looped.left.length > unlooped.left.length * 0.75,
        'count + loop: the tail folds into the start', `${unlooped.left.length - looped.left.length} frames folded`);

    const fewer = render(sources, sanitizeSettings({ ...byCount, snippetCount: 11 }), 1, { fixed: render(sources, byCount, 1).snippets.slice(0, 11) });
    check(fewer.snippets.length === 11 && fewer.left.length < lengths[0], 'deleting in count mode shortens the file');
}

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

// ---------------------------------------------------------------------------
// Hits (spectral flux, bands, ends, classes)
// ---------------------------------------------------------------------------

section('Hits');
{
    const { detectHits } = await import('../src/mangler/hits.ts');
    const { fft } = await import('../src/mangler/fft.ts');

    // FFT against a plain DFT.
    const n = 64, re = new Float64Array(n), im = new Float64Array(n);
    const x = Array.from({ length: n }, (_, i) => Math.sin(i * 0.7) + 0.3 * Math.cos(i * 2.1));
    x.forEach((v, i) => { re[i] = v; });
    fft(re, im);
    let worst = 0;
    for (let k = 0; k < n; k++) {
        let r = 0, m = 0;
        for (let t = 0; t < n; t++) { r += x[t] * Math.cos(-2 * Math.PI * k * t / n); m += x[t] * Math.sin(-2 * Math.PI * k * t / n); }
        worst = Math.max(worst, Math.abs(r - re[k]), Math.abs(m - im[k]));
    }
    check(worst < 1e-9, 'FFT matches a plain DFT', worst.toExponential(1));

    const rng = createRng(99);
    const kick = (amp = 0.8) => Float32Array.from({ length: Math.round(0.35 * SR) }, (_, i) => {
        const t = i / SR, hz = 50 + 100 * Math.exp(-t * 30);
        return amp * Math.exp(-t * 9) * Math.sin(2 * Math.PI * (50 * t + (100 / 30) * (1 - Math.exp(-t * 30))) ) * (hz > 0 ? 1 : 0);
    });
    const hat = (amp = 0.5) => {
        let prev = 0;
        return Float32Array.from({ length: Math.round(0.05 * SR) }, (_, i) => {
            const w = rng.next() * 2 - 1, v = w - prev; prev = w; // first difference: bright
            return amp * Math.exp(-(i / SR) * 90) * v;
        });
    };
    const snare = (amp = 0.6) => Float32Array.from({ length: Math.round(0.2 * SR) }, (_, i) => {
        const t = i / SR;
        return amp * Math.exp(-t * 18) * (0.5 * Math.sin(2 * Math.PI * 190 * t) + 0.6 * (rng.next() * 2 - 1));
    });
    const place = (length, events) => {
        const out = new Float32Array(Math.round(length * SR));
        for (const [at, sound] of events) {
            const o = Math.round(at * SR);
            for (let i = 0; i < sound.length && o + i < out.length; i++) out[o + i] += sound[i];
        }
        return out;
    };

    // Kick, snare, hat, with silence between: four of each, half a second apart.
    const pattern = [];
    for (let bar = 0; bar < 4; bar++) {
        pattern.push([bar * 1.5 + 0.1, kick()], [bar * 1.5 + 0.6, snare()], [bar * 1.5 + 1.1, hat()]);
    }
    const drums = place(6.2, pattern);
    const found = detectHits([drums, drums], SR);
    const expected = pattern.map(([at]) => Math.round(at * SR)).sort((p, q) => p - q);
    const matched = expected.map(e => found.find(h => Math.abs(h.start - e) < 0.004 * SR));
    check(found.length === expected.length && matched.every(Boolean), 'every hit found, on time (±4 ms)',
        `${found.length} found of ${expected.length}`);
    const classOf = at => matched[expected.indexOf(Math.round(at * SR))]?.cls;
    const classes = pattern.map(([at, s]) => `${s.length === Math.round(0.35 * SR) ? 'k' : s.length === Math.round(0.2 * SR) ? 's' : 'h'}:${classOf(at)}`);
    check(classes.filter(c => c.startsWith('k')).every(c => c === 'k:low') && classes.filter(c => c.startsWith('h')).every(c => c === 'h:high'),
        'kicks are low, hats are high', [...new Set(classes)].join(' '));
    check(found.every(h => h.end - h.start < 0.45 * SR), 'each hit ends in its own decay, not at the next one',
        found.map(h => Math.round((h.end - h.start) / SR * 1000)).join(' ') + ' ms');

    // Loud hats every 125 ms with quiet kicks on the beat, slightly after.
    const busy = [];
    for (let i = 0; i < 16; i++) busy.push([0.05 + i * 0.125, hat(0.6)]);
    for (let i = 0; i < 4; i++) busy.push([0.115 + i * 0.5, kick(0.25)]);
    const mixed = place(2.2, busy);
    const busyHits = detectHits([mixed, mixed], SR, { minGapMs: 30 });
    const kicksFound = [0, 1, 2, 3].filter(i => busyHits.some(h => Math.abs(h.start - Math.round((0.115 + i * 0.5) * SR)) < 0.005 * SR)).length;
    check(kicksFound === 4, 'quiet kicks under loud hats: found', `${kicksFound}/4, ${busyHits.length} hits in all`);

    const steady = noise(3, 0.2, 5);
    check(detectHits([steady, steady], SR).length <= 1, 'steady noise: no hits');
    const quietPad = tone(220, 3, 'sine', 0.3);
    check(detectHits([quietPad, quietPad], SR).length <= 1, 'a held tone: at most its start');
    const silent = new Float32Array(SR);
    check(detectHits([silent, silent], SR).length === 0, 'silence: no hits');
}

// ---------------------------------------------------------------------------
// Tempo grid: exact length, cues on the lines, whole steps
// ---------------------------------------------------------------------------

section('Tempo grid');
{
    const gridded = sanitizeSettings({
        ...settings, skipSilence: false, grid: true, bpm: 123, division: '1/16', bars: 4, stepsMin: 1, stepsMax: 4,
    });
    const g = render(sources, gridded, 77);
    const barFrames = (240 / 123) * SR;
    const line = k => Math.round((k * barFrames) / 16);
    check(g.left.length === Math.round(4 * barFrames), 'exactly 4 bars at 123 bpm, to the frame', `${g.left.length} frames`);
    check(g.cuePoints.every(c => { const k = Math.round(c / (barFrames / 16)); return line(k) === c; }), 'every cue on a grid line', `${g.cuePoints.length} cues`);
    check(g.snippets.every(s => { const k0 = Math.round(s.outStart / (barFrames / 16)); const k1 = Math.round((s.outStart + s.length) / (barFrames / 16));
        return line(k0) === s.outStart && line(k1) === s.outStart + s.length && k1 - k0 >= 1 && k1 - k0 <= 4; }),
        'every snippet whole steps (1–4), line to line');
    check(g.snippets.every(s => s.xfade === 0), 'no crossfades on the grid');
    const off = render(sources, { ...gridded, grid: false }, 77);
    const plain = render(sources, { ...settings, skipSilence: false }, 77);
    check(sameArray(off.left, plain.left), 'grid off: the settings for it change nothing');

    const tape = render(sources, { ...gridded, gridFit: 'tape' }, 77);
    const cut = g;
    const n = Math.min(tape.snippets.length, cut.snippets.length);
    check(tape.snippets.slice(0, n).every((s, i) => s.length === cut.snippets[i].length && s.source === cut.snippets[i].source),
        'tape: same steps and sources as cut');
    check(tape.snippets.some(s => Math.abs(s.sourceLength - s.length) > 0.05 * s.length) && tape.snippets.every(s => s.sourceLength <= s.length * 1.6 + 2),
        'tape: snippets read longer or shorter, within half a step either way');

    const looped = render(sources, { ...gridded, loop: true, xfadeMaxMs: 40 }, 77);
    check(looped.left.length === g.left.length, 'loop on the grid: still exactly 4 bars');
    const edited = render(sources, gridded, 77, { fixed: g.snippets.slice().reverse() });
    check(edited.left.length === g.left.length && edited.cuePoints.every(c => line(Math.round(c / (barFrames / 16))) === c),
        'edited (reversed order): same length, cues still on the lines');
}

// ---------------------------------------------------------------------------
// Slices: a kit of slices sounds like the slices played one by one
// ---------------------------------------------------------------------------

section('Slices');
{
    const { renderSlice, sliceAsSnippet, snippetAsSlice } = await import('../src/mangler/slices.ts');
    const src = stereo(tone(220, 3), tone(330, 3, 'saw', 0.3));
    const specs = [
        { start: 0.1, end: 0.4 },
        { start: 1.0, end: 1.2, reverse: true, gainDb: -6 },
        { start: 2.0, end: 2.5, shift: 5, envelope: { attackMs: 5, decayMs: 100, curve: 'exp' } },
    ];
    const kitSettings = sanitizeSettings({
        fillMode: 'count', snippetCount: specs.length, xfadeMinMs: 0, xfadeMaxMs: 0, hardCuts: false,
        repitch: 'off', limiter: false, loop: false,
    });
    const kit = render([src], kitSettings, 1, { fixed: specs.map(s => sliceAsSnippet(s, 0, SR)) });
    let at = 0, worst = 0;
    for (const spec of specs) {
        const [l] = renderSlice(src.channels, SR, spec);
        for (let i = 0; i < l.length; i++) worst = Math.max(worst, Math.abs(kit.left[at + i] - l[i]));
        at += l.length;
    }
    check(kit.left.length === at && worst < 1e-6, 'a kit of slices = the slices one after another', `max diff ${worst.toExponential(1)}`);
    check(kit.cuePoints.length === specs.length, 'one cue per slice');
    const back = kit.snippets.map(sn => snippetAsSlice(sn, SR));
    check(back.every((b, i) => Math.abs(b.start - specs[i].start) < 1e-4 && Math.abs(b.end - specs[i].end) < 1e-4
        && !!b.reverse === !!specs[i].reverse && (b.shift ?? 0) === (specs[i].shift ?? 0)), 'snippet → slice keeps region, direction and shift');
    check(snippetAsSlice({ ...kit.snippets[0], rest: true }, SR) === null, 'a rest makes no slice');
}

// ---------------------------------------------------------------------------
// Sequencer: hits on the steps, exact length, folded tails
// ---------------------------------------------------------------------------

section('Sequencer');
{
    const seqMod = await import('../src/mangler/sequence.ts');
    const { newSequence, sequenceHits, sequenceFrames, mixSequence, sequenceCues, stepAt, maxChain } = seqMod;
    let n = 0;
    const seq = newSequence(() => `t${n++}`);
    seq.bpm = 125;
    seq.chain = ['A', 'B', 'A'];
    seq.tracks[0].sliceId = 'kick';
    [0, 4, 8, 12].forEach(s => { seq.tracks[0].patterns.A[s].on = true; });
    seq.tracks[0].patterns.B[0].on = true;
    seq.tracks[1].sliceId = 'hat';
    seq.tracks[1].patterns.A[2] = { on: true, velocity: 0.5, sliceId: 'open' };
    const hits = sequenceHits(seq, SR);
    check(hits.length === 4 + 1 + 4 + 2, 'hits follow the chain (A, B, A)', `${hits.length} hits`);
    seq.tracks[0].shift = 2;
    seq.tracks[0].patterns.A[4].shift = -5;
    check(sequenceHits(seq, SR).filter(h => h.track === 0).slice(0, 2).map(h => h.shift).join() === '2,-3', 'step pitch adds to the track shift');
    seq.tracks[0].shift = 0;
    check(hits.find(h => h.track === 1).sliceId === 'open' && hits.find(h => h.track === 1).gain === 0.5, 'slice lock and velocity on a step');
    const total = sequenceFrames(seq, SR);
    check(total === Math.round(3 * 16 * (60 / 125 / 4) * SR), 'exactly three bars at 125 bpm', `${total} frames`);
    seq.tracks[0].mute = true;
    check(sequenceHits(seq, SR).every(h => h.track === 1), 'a muted track is left out');
    seq.tracks[0].mute = false;
    seq.tracks[1].solo = true;
    check(sequenceHits(seq, SR).every(h => h.track === 1), 'with a solo, only the solo plays');
    seq.tracks[1].solo = false;

    seq.swing = 0.25;
    const step = (60 / 125 / 4) * SR;
    check(stepAt(seq, 2, SR) === Math.round(2 * step) && stepAt(seq, 3, SR) === Math.round(3 * step) + Math.round(0.25 * step),
        'swing moves only the odd sixteenths');
    seq.swing = 0;

    // A long tail on the last step folds into the start.
    const click = [new Float32Array(Math.round(step * 2)).fill(0.5), new Float32Array(Math.round(step * 2)).fill(0.5)];
    const last = [{ track: 0, step: 47, at: stepAt(seq, 47, SR), sliceId: 'x', gain: 1, shift: 0 }];
    const folded = mixSequence(last, () => click, total, true);
    const cut2 = mixSequence(last, () => click, total, false);
    check(folded[0][0] === 0.5 && cut2[0][0] === 0, 'a tail past the end folds into the start (or is cut)');
    const cues = sequenceCues(seq, hits, 'hits', SR);
    check(cues[0] === 0 && cues.every((c, i) => i === 0 || c > cues[i - 1]), 'cues at hits, in order, from 0');
    check(sequenceCues(seq, hits, 'bars', SR).length === 3 && sequenceCues(seq, hits, 'beats', SR).length === 12, 'cues per bar and per beat');
    check(maxChain(60) === 10 && maxChain(120) === 16, 'the chain fits 42 s', `${maxChain(60)} bars at 60 bpm`);
}

// ---------------------------------------------------------------------------
// Sequencer track kinds: cue tracks, scale lock, CC steps and LFOs
// ---------------------------------------------------------------------------

section('Sequencer: cues, scale, CC');
{
    const S = await import('../src/mangler/sequence.ts');
    const { maskFromIntervals } = await import('../src/mangler/settings.ts');
    let n = 0;
    const seq = S.newSequence(() => `t${n++}`);
    seq.chain = ['A'];

    // Cue track: C1 the first cue, D1 the third; past the last cue, nothing.
    const cueTrack = seq.tracks[0];
    cueTrack.kind = 'cue';
    cueTrack.cue = { kind: 'result', id: 'r1', name: 'kit', cues: [0, 0.5, 1.25, 2], duration: 3 };
    cueTrack.patterns.A[0] = { on: true, velocity: 1 };
    cueTrack.patterns.A[4] = { on: true, velocity: 1, note: S.CUE_BASE_NOTE + 2 };
    cueTrack.patterns.A[8] = { on: true, velocity: 1, note: S.CUE_BASE_NOTE + 3 };
    cueTrack.patterns.A[12] = { on: true, velocity: 1, note: S.CUE_BASE_NOTE + 9 };
    const cueHits = S.sequenceHits(seq, SR).filter(h => h.track === 0);
    const seg = h => { const p = S.parseCueSoundId(h.sliceId); return `${p.start}-${p.end}`; };
    check(cueHits.length === 3 && seg(cueHits[0]) === '0-0.5' && seg(cueHits[1]) === '1.25-2' && seg(cueHits[2]) === '2-3',
        'cue track: C1 the first cue, D1 the third, the last runs to the end, past the last nothing', cueHits.map(seg).join(' '));
    check(cueHits.every(h => h.shift === 0) && S.noteName(cueHits[1].note) === 'D1', 'cue notes pick, they don\'t repitch', S.noteName(cueHits[1].note));

    // Scale lock: C minor pentatonic, a step at +4 (E) snaps to Eb or F.
    seq.scale = { root: 0, mask: maskFromIntervals([0, 3, 5, 7, 10]) };
    const sliceTrack = seq.tracks[1];
    sliceTrack.sliceId = 'kick';
    sliceTrack.patterns.A[0] = { on: true, velocity: 1, shift: 4 };
    const free = S.sequenceHits(seq, SR).find(h => h.track === 1).shift;
    sliceTrack.scaleLock = true;
    const locked = S.sequenceHits(seq, SR).find(h => h.track === 1).shift;
    check(free === 4 && (locked === 3 || locked === 5), 'scale lock snaps the step to the scale, only when on', `+4 → ${locked}`);

    // CC steps: a value, a toggle, a momentary one with its release.
    const cc = seq.tracks[2];
    cc.kind = 'cc';
    cc.cc = { ...S.defaultCc(), cc: 22 };
    cc.midi = 'B';
    cc.patterns.A[0] = { on: true, velocity: 0.5 };
    let ctl = S.stepControls(seq, 0).filter(c => c.track === 2);
    check(ctl.length === 1 && ctl[0].cc === 22 && ctl[0].value === 64 && ctl[0].deck === 'B', 'CC step: its value on its deck', JSON.stringify(ctl[0]));
    cc.cc.cc = 85;
    check(S.stepControls(seq, 0).find(c => c.track === 2).value === 127, 'a toggle CC sends 127');
    cc.cc.cc = 102;
    ctl = S.stepControls(seq, 0).filter(c => c.track === 2);
    check(ctl.length === 2 && ctl[1].value === 0 && ctl[1].at > 0.5, 'a momentary CC lets go before an off step');
    check(S.sequenceHits(seq, SR).every(h => h.track !== 2), 'a CC track makes no sound');

    // LFO: four messages a step, inside min–max, the shape where it should be.
    cc.cc = { cc: 23, mode: 'lfo', lfo: { shape: 'saw', rateSteps: 16, min: 20, max: 100, phase: 0 } };
    const lfo = Array.from({ length: 16 }, (_, k) => S.stepControls(seq, k).filter(c => c.track === 2)).flat();
    check(lfo.length === 64 && lfo.every(c => c.value >= 20 && c.value <= 100) && lfo[0].value === 20 && lfo[63].value > 95,
        'LFO: four a step, inside its range, a saw rising over the bar', `${lfo[0].value}…${lfo[63].value}`);
    check(['sine', 'triangle', 'saw', 'square', 'random'].every(sh => [0, 0.25, 0.5, 0.75].every(p => { const v = S.lfoAt(sh, p); return v >= 0 && v <= 1; }))
        && S.lfoAt('random', 3.2, 1) === S.lfoAt('random', 3.7, 1), 'every LFO shape in 0–1; random holds within a cycle');

    // A deck track without a slice still plays (the deck makes the sound).
    const deckOnly = seq.tracks[3];
    deckOnly.midi = 'A';
    deckOnly.patterns.A[2] = { on: true, velocity: 0.8, shift: 7 };
    const dh = S.sequenceHits(seq, SR).find(h => h.track === 3);
    check(dh && dh.sliceId === null && dh.note === 67 && dh.deck === 'A', 'a deck-only step: note 67 for +7 st, no sound here');
}

// ---------------------------------------------------------------------------
// Synth: every generator, seeded, in range, the right class
// ---------------------------------------------------------------------------

section('Synth');
{
    const { synthesize, SYNTH_KINDS, GENERATORS, defaultRanges, MAX_SECONDS } = await import('../src/mangler/synth.ts');
    const { detectHits } = await import('../src/mangler/hits.ts');
    for (const kind of SYNTH_KINDS) {
        const ranges = defaultRanges(kind);
        const t0 = performance.now();
        const a = synthesize(kind, ranges, 42, SR);
        const ms = performance.now() - t0;
        const b = synthesize(kind, ranges, 42, SR);
        const c = synthesize(kind, ranges, 43, SR);
        const [l] = a.audio;
        let peak = 0, nan = false;
        for (const v of l) { peak = Math.max(peak, Math.abs(v)); if (Number.isNaN(v)) nan = true; }
        const inRange = GENERATORS[kind].params.every(q => a.values[q.key] >= ranges[q.key][0] - 1e-9 && a.values[q.key] <= ranges[q.key][1] + 1e-9);
        check(sameArray(l, b.audio[0]) && !sameArray(l, c.audio[0]) && !nan && peak > 0.8 && peak < 0.9 && l.length <= MAX_SECONDS * SR && inRange,
            `${kind}: same seed same take, another seed another, −1 dBFS, values in range`, `${(l.length / SR * 1000).toFixed(0)} ms, ${ms.toFixed(0)} ms to render`);
    }
    // The detector agrees with the drum classes.
    const cls = kind => { const x = synthesize(kind, defaultRanges(kind), 7, SR).audio; return detectHits(x, SR)[0]?.cls; };
    check(cls('kick') === 'low' && cls('hat') === 'high', 'a synth kick reads as low, a hat as high', `kick ${cls('kick')}, hat ${cls('hat')}, snare ${cls('snare')}`);
}

// ---------------------------------------------------------------------------
// Dice: rolls stay valid and in their bounds
// ---------------------------------------------------------------------------

section('Dice');
{
    const { rollGroup, rollAll, rollSteps, rollChain, rollSelection, rollRanges } = await import('../src/mangler/randomize.ts');
    const { GENERATORS, SYNTH_KINDS } = await import('../src/mangler/synth.ts');
    const r = createRng(2024);
    const rnd = () => r.next();
    let ok = true;
    for (let i = 0; i < 200; i++) {
        const s = rollAll(DEFAULT_SETTINGS, rnd);
        const again = sanitizeSettings(s);
        if (JSON.stringify(again) !== JSON.stringify(s)) ok = false;
        if (s.xfadeMaxMs > s.snippetMinMs / 2 + 1e-9 || s.snippetMaxMs < s.snippetMinMs) ok = false;
        if (s.outputSeconds !== DEFAULT_SETTINGS.outputSeconds || s.fillMode !== DEFAULT_SETTINGS.fillMode) ok = false;
    }
    check(ok, 'Surprise: 200 rolls, all valid, crossfades under half the shortest snippet, length kept');
    const shape = rollGroup('shape', rnd);
    check(!('outputSeconds' in shape) && !('loudnessTargetDb' in shape), 'a group roll touches only its group');
    const lows = Array.from({ length: 300 }, () => rollSteps('low', rnd));
    const onBeat = lows.filter(p => p[0].on).length, offBeat = lows.filter(p => p[1].on).length;
    check(onBeat === 300 && offBeat < 45, 'low patterns: always on the one, rarely off the beat', `${offBeat}/300 on step 2`);
    const chain = rollChain(6, ['A', 'C'], rnd);
    check(chain.length === 6 && chain.every(p => p === 'A' || p === 'C') && chain[0] === 'A', 'chain from the used patterns');
    const pool = [...Array(5)].map((_, i) => ({ id: `l${i}`, cls: 'low' })).concat([...Array(5)].map((_, i) => ({ id: `h${i}`, cls: 'high' })));
    const pickIds = rollSelection(pool, rnd);
    check(pickIds.length >= 4 && new Set(pickIds).size === pickIds.length && pickIds.some(id => id[0] === 'l') && pickIds.some(id => id[0] === 'h'),
        'slice selection: no repeats, both classes', pickIds.join(','));
    check(SYNTH_KINDS.every(k => {
        const rr = rollRanges(k, rnd);
        return GENERATORS[k].params.every(q => rr[q.key][0] >= q.min - 1e-9 && rr[q.key][1] <= q.max + 1e-9 && rr[q.key][0] <= rr[q.key][1]);
    }), 'synth ranges rolled inside every parameter\'s bounds');
}

// ---------------------------------------------------------------------------
// Projects: a zip round trip keeps every record and every byte
// ---------------------------------------------------------------------------

section('Projects');
{
    const { saveToZip, openFromZip } = await import('../src/mangler/project.ts');
    const bytesOf = async b => [...new Uint8Array(await b.arrayBuffer())].join();
    const src = { id: 's1', name: 'drums', origin: 'Local file', blob: new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/wav' }), duration: 4, enabled: true, addedAt: 1, regions: [[0, 1]] };
    const res = { id: 'r1', name: 'kit', blob: new Blob([new Uint8Array([9, 8, 7])], { type: 'audio/wav' }), duration: 1, recipe: { seed: 5, snippets: [] }, peaks: [0.5], kept: true, batchId: 1, createdAt: 2, kind: 'sequence', edited: true };
    const snap = {
        settings: DEFAULT_SETTINGS, sequence: { bpm: 99, swing: 0, chain: ['A'], tracks: [] },
        synth: { kind: 'fm', ranges: {}, count: 3 }, sources: [src], results: [res],
        slices: [{ id: 'x', name: 'hit', sourceId: 's1', sourceName: 'drums', origin: 'Local file', start: 0, end: 1, peaks: [], addedAt: 3 }],
    };
    const { blob, fileName } = await saveToZip('Set: one/two', snap);
    const { name, snapshot } = await openFromZip(blob);
    check(fileName === 'Set- one-two.mangler.zip' && name === 'Set- one-two', 'a safe name for the folder and the zip', fileName);
    check(await bytesOf(snapshot.sources[0].blob) === '1,2,3,4' && await bytesOf(snapshot.results[0].blob) === '9,8,7',
        'source and result audio come back byte for byte');
    check(JSON.stringify(snapshot.sources[0].regions) === '[[0,1]]' && snapshot.results[0].kind === 'sequence'
        && snapshot.slices[0].sourceId === 's1' && snapshot.sequence.bpm === 99 && snapshot.synth.kind === 'fm'
        && snapshot.settings.snippetMaxMs === DEFAULT_SETTINGS.snippetMaxMs, 'every record and setting comes back');
    let refused = false;
    try { await openFromZip(new Blob([new Uint8Array([80, 75, 5, 6, ...new Array(18).fill(0)])])); } catch { refused = true; }
    check(refused, 'a zip without mangler.json is refused');
}

// ---------------------------------------------------------------------------
// The engine stands alone: no imports from outside src/mangler, so it can
// become a package without untangling (mangler-v2-plan.md, "Packaging").
// ---------------------------------------------------------------------------

section('Engine boundary');
{
    const { readdirSync, readFileSync } = await import('node:fs');
    const dir = new URL('../src/mangler/', import.meta.url);
    // App glue: WAV encoding, saving, licences. These may reach into the app.
    const GLUE = new Set(['batch.ts', 'save.ts', 'license.ts', 'project.ts']);
    const outside = [];
    for (const name of readdirSync(dir).filter(n => n.endsWith('.ts') && !GLUE.has(n))) {
        const text = readFileSync(new URL(name, dir), 'utf8');
        // Import and export statements, and inline type imports: import('…').
        const paths = [
            ...text.matchAll(/^\s*(?:import|export)\s[^;]*?\sfrom\s+'([^']+)'/gm),
            ...text.matchAll(/\bimport\(\s*'([^']+)'\s*\)/g),
        ].map(m => m[1]);
        for (const path of paths) {
            if (!path.startsWith('./')) outside.push(`${name} → ${path}`);
        }
    }
    check(outside.length === 0, 'engine files import only from src/mangler', outside.join(', '));
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
