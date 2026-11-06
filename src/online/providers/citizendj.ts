import type { OnlineLicense } from '../licenses.ts';
import type { OnlineHit, OnlineProvider } from '../types.ts';

/**
 * Citizen DJ, a Library of Congress Labs project: free-to-use recordings from the
 * Library's collections (Edison, the National Jukebox, the Free Music Archive,
 * dialect and field recordings, interviews, government films), already cut into
 * clips of 4 to 34 seconds.
 *
 * It has no search API, and its catalogue JSON isn't served with CORS, so the
 * catalogue is a snapshot (src/online/data/citizendj.ts, written by
 * scripts/fetch-citizen-dj.mjs), loaded on the first search and searched here.
 * The clips themselves come from its S3 bucket, which sends CORS.
 */

const AUDIO = 'https://s3.amazonaws.com/citizen-dj-assets.labs.loc.gov/audio/samplepacks';
const PAGE = 30;
/** 48 kHz, 16-bit stereo, 44-byte header: the snapshot checks every collection is. */
const BYTES_PER_SEC = 48000 * 2 * 2;

type Kind = 'pd' | 'free' | 'by';

interface Collection {
    id: string;
    title: string;
    /** The credit line the collection suggests. */
    credit: string;
    license: Kind;
    /** The Library's note on historical content applies. */
    warning: boolean;
    rights: string;
    useUrl: string;
}

/** [collection, file, title, author, subjects, year, page, startMs, bytes] */
type Clip = [number, string, string, string, string, number, string, number, number];

interface Snapshot { fetched: string; collections: Collection[]; clips: Clip[] }

/**
 * The statement each kind is stored with. Written so `classifyLicense` reads the
 * right level: "public domain" for the two free kinds, "CC BY" terms for Joe Smith,
 * and "no attribution" wherever credit is only asked for.
 */
const licenseFor = (c: Collection): OnlineLicense => {
    switch (c.license) {
        case 'pd':
            return { filter: 'pd', label: 'Public domain', url: c.useUrl };
        case 'free':
            return {
                filter: 'pd',
                label: 'Free to use (LoC)',
                url: c.useUrl,
                statement: 'Free to use (LoC): the Library of Congress clears it for any reuse, commercial included, without asking, as with public domain. No attribution required.',
            };
        case 'by':
            return {
                filter: 'by',
                label: 'Free with credit',
                url: c.useUrl,
                statement: 'Free with credit: free to use, including commercially, with attribution to the copyright owner, Joe Smith (terms like CC BY).',
            };
    }
};

/** Lower case, no accents: "Palmée" is found by "palmee". */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

interface Entry { clip: Clip; title: string; rest: string }

let loaded: Promise<{ snapshot: Snapshot; entries: Entry[] }> | null = null;

/** The snapshot, parsed once and kept for the page's life. */
const load = () => (loaded ??= import('../data/citizendj.ts').then(({ CITIZEN_DJ_JSON }) => {
    const snapshot = JSON.parse(CITIZEN_DJ_JSON) as Snapshot;
    const entries = snapshot.clips.map(clip => ({
        clip,
        title: fold(clip[2]),
        rest: fold([clip[3], clip[4], snapshot.collections[clip[0]].title, clip[5] || ''].join(' ')),
    }));
    return { snapshot, entries };
}).catch(e => { loaded = null; throw e; }));

const stamp = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const toHit = (clip: Clip, collections: Collection[]): OnlineHit => {
    const [ci, file, title, author, , year, page, startMs, bytes] = clip;
    const c = collections[ci];
    return {
        key: `online/citizendj/${file}`,
        provider: 'citizendj',
        via: c.title,
        // Clips of one recording share its title; where it starts tells them apart.
        title: `${title} @ ${stamp(startMs)}`,
        author: author || 'Library of Congress',
        license: licenseFor(c),
        pageUrl: page,
        url: `${AUDIO}/${c.id}/${file}.wav`,
        format: 'WAV',
        lossless: true,
        bytes,
        durationSec: Math.max(0, bytes - 44) / BYTES_PER_SEC,
        year: year || undefined,
        credit: c.credit,
        notice: c.warning ? 'Historical recording: may contain language or views that are offensive today.' : undefined,
    };
};

export const citizendj: OnlineProvider = {
    id: 'citizendj',
    label: 'Citizen DJ',
    blurb: 'Library of Congress recordings cut into clips: Edison cylinders, the National Jukebox (pre-1923 blues, jazz, opera, popular), Free Music Archive tracks, dialect and field recordings, interviews, government films. All free to use.',
    homepage: 'https://citizen-dj.labs.loc.gov/',
    needsKey: false,
    quality: '16-bit 48 kHz stereo WAV, as Citizen DJ cut it: clips of 4 to 34 seconds.',
    limitNote: 'None. The catalogue comes with WAV Builder, so a search sends no request; only a clip you play or add is downloaded.',
    notice: 'The Jukebox recordings are historical and may contain language or views that are offensive today; the Library asks they be used with respect. The Joe Smith interviews need a credit to Joe Smith.',
    limits: { perMinute: 600, perDay: 100_000 },

    async search(query, page) {
        const { snapshot, entries } = await load();
        const words = fold(query.text).split(/\s+/).filter(Boolean);
        const allowed = new Set(snapshot.collections.map((c, i) => (query.licenses.includes(licenseFor(c).filter) ? i : -1)));
        const maxBytes = query.maxSeconds ? query.maxSeconds * 1.05 * BYTES_PER_SEC + 44 : Infinity;

        // Every word somewhere; recordings whose title has them all come first.
        const inTitle: Clip[] = [];
        const elsewhere: Clip[] = [];
        for (const e of entries) {
            if (!allowed.has(e.clip[0]) || e.clip[8] > maxBytes) continue;
            if (!words.every(w => e.title.includes(w) || e.rest.includes(w))) continue;
            (words.every(w => e.title.includes(w)) ? inTitle : elsewhere).push(e.clip);
        }
        const found = [...inTitle, ...elsewhere];
        const from = (page - 1) * PAGE;
        return {
            hits: found.slice(from, from + PAGE).map(c => toHit(c, snapshot.collections)),
            hasMore: from + PAGE < found.length,
            total: found.length,
        };
    },
};

/** For the checks: the snapshot as the provider reads it. */
export const loadCitizenDj = async () => (await load()).snapshot;
