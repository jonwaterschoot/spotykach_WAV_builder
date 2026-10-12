#!/usr/bin/env node
/**
 * Checks for the online sources (src/online).
 *
 *   node scripts/check-online.mjs           offline: licenses, credit lines, budget
 *   node scripts/check-online.mjs --live    also searches each keyless archive
 *
 * Offline covers: every archive's license spelling lands on the right chip, ND
 * never gets through, the stored text classifies at the right level in the mangler
 * (and a title can't change that), and the request budget stops and recovers.
 *
 * --live spends a few requests per archive (Openverse allows 200 a day): one
 * search each, one Archive and one NASA expand, and a 2-byte read of a file from
 * each to prove it downloads. Freesound is skipped unless FREESOUND_KEY is set.
 *
 * Needs Node 22.18+ / 23.6+ (type stripping). Exits 1 on any failure.
 */

import { fromCcCode, fromCcUrl, fromCommons } from '../src/online/licenses.ts';
import { PROVIDERS, licenseTextFor, dedupeKey, originFor } from '../src/online/index.ts';
import { resultLicense } from '../src/mangler/license.ts';
import { freesoundIdFromFileName } from '../src/online/providers/freesound.ts';
import { aiffToWav, isAiff } from '../src/lib/audio/aiff.ts';
import { createBudget } from '../src/online/budget.ts';
import { parseLength } from '../src/online/providers/archive.ts';
import { classifyLicense } from '../src/submission/licenses.ts';

let failures = 0;
const check = (ok, label, detail = '') => {
    console.log(`${ok ? '  ok ' : 'FAIL '} ${label}${detail ? `  (${detail})` : ''}`);
    if (!ok) failures++;
};
const section = title => console.log(`\n${title}`);

// ---------------------------------------------------------------------------
section('License spellings');
// ---------------------------------------------------------------------------

const cases = [
    ['openverse cc0', fromCcCode('cc0', '1.0'), 'pd'],
    ['openverse pdm', fromCcCode('pdm', '1.0'), 'pd'],
    ['openverse by', fromCcCode('by', '4.0'), 'by'],
    ['openverse by-sa', fromCcCode('by-sa', '3.0'), 'by-sa'],
    ['openverse by-nc-sa', fromCcCode('by-nc-sa', '4.0'), 'nc'],
    ['openverse by-nd', fromCcCode('by-nd', '4.0'), null],
    ['openverse by-nc-nd', fromCcCode('by-nc-nd', '4.0'), null],
    ['url zero', fromCcUrl('http://creativecommons.org/publicdomain/zero/1.0/'), 'pd'],
    ['url mark', fromCcUrl('https://creativecommons.org/publicdomain/mark/1.0/'), 'pd'],
    ['url by', fromCcUrl('https://creativecommons.org/licenses/by/4.0/'), 'by'],
    ['url by-nc', fromCcUrl('http://creativecommons.org/licenses/by-nc/3.0/'), 'nc'],
    ['url sampling+', fromCcUrl('http://creativecommons.org/licenses/sampling+/1.0/'), 'nc'],
    ['url by-nd', fromCcUrl('https://creativecommons.org/licenses/by-nd/4.0/'), null],
    ['url other site', fromCcUrl('https://example.com/licenses/by/4.0/'), null],
    ['commons cc-by-sa-4.0', fromCommons('cc-by-sa-4.0', 'CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-sa/4.0'), 'by-sa'],
    ['commons cc0', fromCommons('cc0', 'CC0'), 'pd'],
    ['commons pd', fromCommons('pd', 'Public domain'), 'pd'],
    ['commons PD-old by short name', fromCommons(undefined, 'Public domain'), 'pd'],
    ['commons gfdl', fromCommons('gfdl', 'GFDL'), null],
];
for (const [label, got, want] of cases) {
    check((got?.filter ?? null) === want, label, `got ${got?.filter ?? 'null'}${got ? `, "${got.label}"` : ''}`);
}

// ---------------------------------------------------------------------------
section('Stored text classifies at the right level');
// ---------------------------------------------------------------------------

const hit = (license, title = 'Bell', author = 'Someone') => ({
    key: 'online/openverse/x', provider: 'openverse', via: 'Freesound',
    title, author, license, pageUrl: 'https://freesound.org/s/1/', url: 'https://cdn.freesound.org/previews/1/1-hq.mp3',
});
const level = h => classifyLicense(licenseTextFor(h));

check(level(hit(fromCcCode('cc0', '1.0'))).level === 'open', 'CC0 is open');
check(!level(hit(fromCcCode('cc0', '1.0'))).attribution, 'CC0 needs no credit');
check(level(hit(fromCcCode('by', '4.0'))).level === 'open' && level(hit(fromCcCode('by', '4.0'))).attribution, 'BY is open, with credit');
check(level(hit(fromCcCode('by-sa', '4.0'))).shareAlike, 'BY-SA carries share-alike');
check(level(hit(fromCcCode('by-nc', '4.0'))).level === 'personal', 'BY-NC is personal use');
check(level(hit(fromCcUrl('http://creativecommons.org/licenses/sampling+/1.0/'))).level === 'personal', 'Sampling+ is personal use');

const sneaky = hit(fromCcCode('cc0', '1.0'), 'No derivatives, personal use only, NC', 'SA Recordings');
const s = level(sneaky);
check(s.level === 'open' && !s.shareAlike, 'a title or author cannot change the level', JSON.stringify(s));
check(licenseTextFor(sneaky).split('\n')[1].startsWith('Credit: "'), 'credit line is the second line');

{
    // A mangler result made from a CC0 and a BY-SA sound: open, share-alike, and
    // the BY-SA author credited by name in the text written into the file's record.
    const bySa = hit(fromCcCode('by-sa', '4.0'), 'Church bell', 'Adrian Tync');
    const recipe = {
        sources: [
            { id: 'a', name: 'Bell', origin: originFor(hit(fromCcCode('cc0', '1.0'))), license: licenseTextFor(hit(fromCcCode('cc0', '1.0'))) },
            { id: 'b', name: 'Church bell', origin: originFor(bySa), license: licenseTextFor(bySa) },
        ],
        snippets: [{ source: 0 }, { source: 1 }],
    };
    const r = resultLicense(recipe);
    check(r.level === 'open' && /Share-alike/.test(r.text), 'a CC0 + BY-SA result is open and share-alike');
    check(/Credit: "Church bell" by Adrian Tync, https:\/\/freesound\.org/.test(r.text), 'the result credits the BY-SA author', r.text.split('\n').find(l => l.includes('Adrian')) ?? '');
}

check(
    dedupeKey({ url: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/1/10/Bell.ogg/Bell.ogg.mp3' })
        === dedupeKey({ url: 'https://upload.wikimedia.org/wikipedia/commons/1/10/Bell.ogg?utm_source=x' }),
    'a Commons transcode and its original are one sound',
);
check(parseLength('02:03') === 123 && parseLength('1:00:00') === 3600 && parseLength('12.5') === 12.5, 'Archive lengths parse');

// ---------------------------------------------------------------------------
section('Freesound originals: file names and AIFF');
// ---------------------------------------------------------------------------

check(freesoundIdFromFileName('398494__anthousai__wind-chimes-single-01.wav') === 398494, 'a Freesound download name gives its id');
check(freesoundIdFromFileName('C:\\Downloads\\398494__anthousai__wind chimes (1).aiff') === 398494, 'also with a path and a browser-added (1)');
check(freesoundIdFromFileName('kick_01.wav') === null && freesoundIdFromFileName('2024__.wav') === null, 'other names are not taken for one');

{
    // AIFF/AIFC with known samples → WAV with the same samples, little-endian.
    const aiff = ({ bits, channels = 2, rate = 48000, aifc = null, samples }) => {
        const bytesPer = bits / 8;
        const frames = samples.length / channels;
        const pcm = Buffer.alloc(samples.length * bytesPer);
        samples.forEach((v, i) => {
            if (aifc === 'sowt') pcm.writeIntLE(v, i * bytesPer, bytesPer);
            else pcm.writeIntBE(v, i * bytesPer, bytesPer);
        });
        const ext = Buffer.alloc(10);
        let exp = 16383 + 63, m = BigInt(rate);
        while (!(m & (1n << 63n))) { m <<= 1n; exp--; }
        ext.writeUInt16BE(exp, 0); ext.writeBigUInt64BE(m, 2);
        const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
        const u16 = n => { const b = Buffer.alloc(2); b.writeUInt16BE(n); return b; };
        const commBody = Buffer.concat([u16(channels), u32(frames), u16(bits), ext, ...(aifc ? [Buffer.from(aifc), Buffer.from([0, 0])] : [])]);
        const comm = Buffer.concat([Buffer.from('COMM'), u32(commBody.length), commBody]);
        const ssnd = Buffer.concat([Buffer.from('SSND'), u32(8 + pcm.length), u32(0), u32(0), pcm]);
        const body = Buffer.concat([Buffer.from(aifc ? 'AIFC' : 'AIFF'), comm, ssnd]);
        const file = Buffer.concat([Buffer.from('FORM'), u32(body.length), body]);
        return file.buffer.slice(file.byteOffset, file.byteOffset + file.length);
    };
    const readWav = (wav, bits) => {
        const v = new DataView(wav);
        const out = [];
        for (let at = 44; at < wav.byteLength; at += bits / 8) {
            out.push(bits === 16 ? v.getInt16(at, true) : (v.getUint8(at) | (v.getUint8(at + 1) << 8) | (v.getInt8(at + 2) << 16)));
        }
        return { channels: v.getUint16(22, true), rate: v.getUint32(24, true), bits: v.getUint16(34, true), samples: out };
    };
    for (const [label, opts] of [
        ['16-bit AIFF', { bits: 16, samples: [0, 1, -1, 32767, -32768, 1234] }],
        ['24-bit AIFF', { bits: 24, rate: 96000, samples: [0, 1, -1, 8388607, -8388608, 123456] }],
        ['16-bit AIFC sowt', { bits: 16, rate: 44100, aifc: 'sowt', samples: [5, -5, 300, -300] }],
    ]) {
        const src = aiff(opts);
        const out = aiffToWav(src);
        const w = out && readWav(out.wav, opts.bits);
        check(isAiff(src) && !!w && w.rate === (opts.rate ?? 48000) && w.bits === opts.bits && w.channels === 2
            && JSON.stringify(w.samples) === JSON.stringify(opts.samples), `${label} → WAV, same samples`, w ? JSON.stringify(w.samples) : 'null');
    }
    check(aiffToWav(aiff({ bits: 16, aifc: 'ima4', samples: [0, 0] })) === null, 'compressed AIFC is refused');
}

// ---------------------------------------------------------------------------
section('Budget');
// ---------------------------------------------------------------------------

{
    let t = 1_000_000;
    const store = new Map();
    const budget = createBudget({ getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }, () => t);
    const limits = { perMinute: 3, perDay: 5 };
    const taken = [1, 2, 3].map(() => budget.take('x', limits).waitSec);
    check(taken.every(w => w === 0), 'three in a minute are allowed');
    const fourth = budget.take('x', limits);
    check(fourth.waitSec > 0 && fourth.waitSec <= 60, 'the fourth waits for the minute', `${fourth.waitSec}s`);
    t += 61_000;
    check(budget.take('x', limits).waitSec === 0 && budget.take('x', limits).waitSec === 0, 'a minute later two more');
    const sixth = budget.take('x', limits);
    check(sixth.waitSec > 3600, 'then the day is spent', `${sixth.waitSec}s`);
    t += 24 * 3600_000;
    check(budget.take('x', limits).waitSec === 0, 'and comes back a day later');
    check(budget.state('y', limits).usedDay === 0, 'providers count separately');
}

// ---------------------------------------------------------------------------
if (process.argv.includes('--live')) {
    section('Live (spends a few requests per archive)');
    const query = { text: 'bell', licenses: ['pd', 'by', 'by-sa'], maxSeconds: 120 };
    const ctx = { apiKey: process.env.FREESOUND_KEY };

    const fetchable = async url => {
        const res = await fetch(url, { headers: { Range: 'bytes=0-1' }, redirect: 'follow' });
        return res.ok;
    };

    for (const p of PROVIDERS) {
        if (p.needsKey && !ctx.apiKey) { console.log(`  --   ${p.label}: skipped, no key`); continue; }
        try {
            const page = await p.search(query, 1, ctx);
            check(page.hits.length > 0, `${p.label}: search finds sounds`, `${page.hits.length} kept, total ${page.total ?? '?'}`);
            const bad = page.hits.filter(h => !h.key || !h.pageUrl || !h.license || !query.licenses.includes(h.license.filter));
            check(bad.length === 0, `${p.label}: every hit has key, page, allowed license`, bad[0]?.key ?? '');
            const tooLong = page.hits.filter(h => h.durationSec && h.durationSec > 120.5);
            check(tooLong.length === 0 || p.id === 'openverse', `${p.label}: length filter holds`, tooLong[0] ? `${tooLong[0].durationSec}s` : '');

            let playable = page.hits.find(h => h.url);
            if (!playable && p.expand) {
                for (const h of page.hits.slice(0, 5)) {
                    const files = await p.expand(h, ctx);
                    if (files.length > 0) { playable = files[0]; break; }
                }
                check(!!playable, `${p.label}: expand lists a file`, playable ? `${playable.format}, ${playable.durationSec ?? '?'}s` : '');
            }
            if (playable) check(await fetchable(playable.url), `${p.label}: the file downloads`, playable.url.slice(0, 90));
            if (p.id === 'archive') {
                // A Radio Aporee item with a 17 MB WAV upload, a 5 MB FLAC copy and an MP3.
                const [track] = await p.expand({ ...page.hits[0], key: 'online/archive/aporee_26426_30516', pageUrl: 'https://archive.org/details/aporee_26426_30516' }, ctx);
                check(track?.format === 'FLAC' && track.lossless && track.original?.format === 'WAV',
                    'Internet Archive: takes the FLAC copy over the WAV upload and the MP3', track ? `${track.format}, ${track.bytes} bytes, original ${track.original?.format}` : 'nothing');
            }
            if (p.id === 'openverse') {
                const fs = page.hits.filter(h => h.via === 'Freesound');
                check(fs.length === 0 || fs.every(h => h.isPreview && h.freesoundId && h.original?.format), 'Openverse: Freesound hits say preview, id and original', fs[0] ? `${fs[0].original?.format} ${fs[0].original?.sampleRate ?? ''}` : 'none in this search');
            }
        } catch (e) {
            check(false, `${p.label}: search`, String(e));
        }
    }
}

console.log(failures ? `\n${failures} failed` : '\nAll good');
process.exit(failures ? 1 : 0);
