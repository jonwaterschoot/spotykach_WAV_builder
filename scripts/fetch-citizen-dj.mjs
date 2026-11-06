#!/usr/bin/env node
/**
 * Snapshots the Library of Congress's Citizen DJ catalogue for the Online browser.
 *
 *   node scripts/fetch-citizen-dj.mjs        (npm run fetch:citizen-dj)
 *
 * Citizen DJ (https://citizen-dj.labs.loc.gov/) has no search API: its pages are
 * built from JSON in its GitHub repo, and that JSON isn't served with CORS. The
 * clips themselves are, from S3. So the catalogue is read here, once, and written
 * to src/online/data/citizendj.ts, which the provider loads on its first search.
 * Run it again when the project adds a collection; nothing depends on it at build.
 *
 * Per collection it reads:
 *   _use/<id>.md            rights, suggested credit, content warning, `active`
 *   _data/<id>.json         items and their segment clips (file name, start)
 *   data/metadata/<id>.json year, contributors and subjects per item
 * and sends a HEAD for every clip's WAV, for its size and from that its length.
 *
 * Needs Node 18+ (global fetch). Exits 1 if a collection can't be read.
 */

import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'https://raw.githubusercontent.com/LibraryOfCongress/citizen-dj/master';
const TREE = 'https://api.github.com/repos/LibraryOfCongress/citizen-dj/contents/_use';
const SITE = 'https://citizen-dj.labs.loc.gov';
const AUDIO = 'https://s3.amazonaws.com/citizen-dj-assets.labs.loc.gov/audio/samplepacks';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'online', 'data', 'citizendj.ts');
/** Every clip so far is 48 kHz, 16-bit stereo with a 44-byte header; checked per collection below. */
const BYTES_PER_SEC = 48000 * 2 * 2;
const HEADER = 44;

const getText = async url => {
    const res = await fetch(url, { headers: { 'User-Agent': 'wav-builder-snapshot' } });
    if (!res.ok) throw new Error(`${url} answered ${res.status}`);
    return res.text();
};
const getJson = async url => JSON.parse(await getText(url));

/** `key: "value"` and `key: value` lines of a Jekyll front matter. */
const frontMatter = md => {
    const block = /^---\n([\s\S]*?)\n---/.exec(md.replace(/\r\n/g, '\n'))?.[1] ?? '';
    const out = {};
    for (const line of block.split('\n')) {
        const m = /^([a-z_]+):\s*(.*)$/.exec(line);
        if (!m) continue;
        let v = m[2].trim();
        if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1).replace(/\\"/g, '"');
        out[m[1]] = v;
    }
    return out;
};

/**
 * A catalogue name → a name to show. The collections spell them five ways:
 * "Bellini, Vincenzo, 1801-1835." · "Apollo Quartet of Boston. prf" ·
 * "Akst, Harry -- Composer" · "Barlow, Roger, 1912-1990, direction." · "Carroll, Andrea (Speaker)".
 * Each step strips one trailing part; repeated until nothing changes.
 */
const cleanName = raw => {
    let n = raw.replace(/�/g, '').replace(/\s+--\s+.*$/, '').trim();
    for (let before = ''; before !== n;) {
        before = n;
        n = n
            .replace(/\.?\s*\b(prf|cnd|itr|ive|ivr|spk|voc|com|lyr|arr)\.?$/i, '')
            .replace(/(,\s*[a-z][a-z ]*)+\.?$/, '')
            .replace(/,\s*(ca\.\s*)?\d{4}\s*-\s*(\d{4})?\.?$/, '')
            .replace(/\s*\([^)]*\)$/, '')
            .replace(/[.,\s]+$/, '');
    }
    return n;
};

/** "Smith, Joe" → "Joe Smith"; group names stay as they are. */
const displayName = raw => {
    const n = cleanName(raw);
    const m = /^([^,]+),\s*([^,]+)$/.exec(n);
    return m ? `${m[2]} ${m[1]}` : n;
};

const tidy = raw => raw.replace(/<[^>]*>/g, '').replace(/�|<Ïh|\[sound recording\]/g, '').replace(/\s+/g, ' ').replace(/\s+([;:,])/g, '$1').trim();

const https = url => url.replace(/^http:\/\//, 'https://');
const pageFor = url => (url.startsWith('/') ? `${SITE}${url}` : https(url));

/** Runs `fn` over `list`, `n` at a time. */
const pool = async (list, n, fn) => {
    const out = new Array(list.length);
    let next = 0;
    await Promise.all(Array.from({ length: n }, async () => {
        while (next < list.length) {
            const i = next++;
            out[i] = await fn(list[i], i);
        }
    }));
    return out;
};

const sizeOf = async url => {
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const res = await fetch(url, { method: 'HEAD' });
            if (res.ok) return Number(res.headers.get('content-length')) || 0;
            if (res.status === 403 || res.status === 404) return 0;
        } catch { /* retried */ }
    }
    return 0;
};

/** The WAV's byte rate, from its first 44 bytes: guards the length sums above. */
const byteRateOf = async url => {
    const res = await fetch(url, { headers: { Range: 'bytes=0-43' } });
    const b = new Uint8Array(await res.arrayBuffer());
    const view = new DataView(b.buffer);
    const isPlain = String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(36, 40)) === 'data';
    return isPlain ? view.getUint32(28, true) : 0;
};

const ids = (await getJson(TREE)).map(f => f.name.replace(/\.md$/, ''));
const collections = [];
const clips = [];
let skippedClips = 0;

for (const id of ids) {
    const use = frontMatter(await getText(`${REPO}/_use/${id}.md`));
    if (use.active !== '1') {
        console.log(`[citizen-dj] ${id}: not active on the site, left out`);
        continue;
    }
    const data = await getJson(`${REPO}/_data/${id}.json`);
    const meta = await getJson(`${REPO}/data/metadata/${id}.json`);
    const col = meta.itemHeadings.reduce((acc, h, i) => ({ ...acc, [h]: i }), {});
    const contributorNames = meta.groups?.contributors ?? [];
    const subjectNames = meta.groups?.subjects ?? [];

    // An item's metadata, by its file name's stem and by its loc.gov id.
    const byKey = new Map();
    for (const row of meta.items) {
        const stem = String(row[col.filename] ?? '').replace(/\.[^.]+$/, '');
        const fromUrl = /\/item\/([^/]+)\/?$/.exec(row[col.url] ?? '')?.[1];
        if (stem) byKey.set(stem, row);
        if (fromUrl) byKey.set(fromUrl, row);
    }

    // Rights wording decides the license: public domain; cleared by the Library for
    // any reuse without being public domain (Tony Schwartz, MusicBox, dialects); or
    // free with credit to the owner (Joe Smith). Anything else stops the snapshot.
    const rights = use.rights ?? '';
    const needsCredit = /with proper attribution/i.test(rights);
    const kind = needsCredit ? 'by' : /public domain/i.test(rights) ? 'pd' : /free to use and reuse/i.test(rights) ? 'free' : null;
    if (!kind) throw new Error(`${id}: rights read neither as public domain nor as free to use; check them by hand`);
    const index = collections.length;
    collections.push({
        id,
        title: use.title,
        credit: use.credit,
        license: kind,
        warning: use.content_warning === '1',
        rights: tidy(use.rights ?? ''),
        useUrl: `${SITE}/${id}/use/`,
    });

    const first = data.items.find(i => i.clips?.length);
    const rate = first ? await byteRateOf(`${AUDIO}/${id}/${first.clips[0].filename}.wav`) : 0;
    if (rate && rate !== BYTES_PER_SEC) throw new Error(`${id}: clips are ${rate} bytes/s, not ${BYTES_PER_SEC}; update the length sum`);

    const rows = data.items.flatMap(item => {
        const m = byKey.get(item.id) ?? byKey.get(/\/([^/]+)\/?$/.exec(item.url ?? '')?.[1]);
        const people = (m?.[col.contributors] ?? []).map(i => contributorNames[i]).filter(Boolean).map(displayName);
        const subjects = (m?.[col.subjects] ?? []).map(i => subjectNames[i]).filter(Boolean);
        const year = Number(m?.[col.year]) || 0;
        return (item.clips ?? []).map(c => ({
            c: index,
            f: c.filename,
            t: tidy(item.title || c.filename),
            a: needsCredit ? 'Joe Smith' : [...new Set(people)].slice(0, 2).join(', '),
            s: subjects.join(', '),
            y: year,
            p: pageFor(item.url || `/items/${id}/${item.id}/`),
            ms: c.start,
        }));
    });

    const sizes = await pool(rows, 24, r => sizeOf(`${AUDIO}/${id}/${r.f}.wav`));
    rows.forEach((r, i) => {
        if (!sizes[i]) { skippedClips++; return; }
        clips.push([r.c, r.f, r.t, r.a, r.s, r.y, r.p, r.ms, sizes[i]]);
    });
    console.log(`[citizen-dj] ${id}: ${rows.length} clips (${use.title})`);
}

if (!collections.length) throw new Error('no collections read');

const snapshot = { fetched: new Date().toISOString().slice(0, 10), collections, clips };
const json = JSON.stringify(snapshot);
const ts = `/* Generated by scripts/fetch-citizen-dj.mjs on ${snapshot.fetched}. Don't edit; run it again. */
/* A string, not a literal: one JSON.parse is quicker to load and to type-check than ${clips.length} tuples. */
export const CITIZEN_DJ_JSON = ${JSON.stringify(json)};
`;
await writeFile(OUT, ts);
console.log(`[citizen-dj] ${collections.length} collections, ${clips.length} clips, ${skippedClips} missing on S3 left out → ${(ts.length / 1024).toFixed(0)} kB`);
