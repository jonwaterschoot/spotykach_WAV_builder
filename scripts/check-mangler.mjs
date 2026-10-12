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
    const { semitonesToPitchClasses } = await import('../src/lib/audio/pitch.ts');
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
    check(cues[0] === 0 && cues.length >= drums.snippets.length * 0.7, 'transient cues on a mangled drum loop', `${cues.length} cues, ${drums.snippets.length} snippets`);
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

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
