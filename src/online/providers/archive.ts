import { fromCcUrl, type LicenseFilter, type OnlineLicense } from '../licenses.ts';
import { getJson, tidyTitle, type OnlineHit, type OnlineProvider } from '../types.ts';

/**
 * The Internet Archive: Advanced Search for items, the Metadata API for an item's
 * files. Both answer CORS, and so does the download node a file redirects to.
 *
 * An item is a folder (an album, a session, one long recording), so a hit is
 * expandable and its tracks are listed on demand. The license is the uploader's
 * claim: items without a `licenseurl` are never asked for, and collections with
 * known murky rights (the 78 rpm transfers) are left out.
 */

const SEARCH = 'https://archive.org/advancedsearch.php';
const METADATA = 'https://archive.org/metadata/';
const PAGE = 30;

/**
 * A wildcard with a slash in it makes the Archive's search fail outright, so CC
 * licenses are named as exact URLs: every version, both schemes. Only the public
 * domain ones can be a wildcard (`zero`, `mark` and the retired `licenses/publicdomain`).
 */
const ccUrls = (...codes: string[]) => codes.flatMap(code =>
    ['1.0', '2.0', '2.5', '3.0', '4.0'].flatMap(v =>
        ['http', 'https'].map(scheme => `"${scheme}://creativecommons.org/licenses/${code}/${v}/"`)));

const LICENSE_QUERY: Record<LicenseFilter, string> = {
    pd: 'licenseurl:*publicdomain*',
    by: `licenseurl:(${ccUrls('by').join(' OR ')})`,
    'by-sa': `licenseurl:(${ccUrls('by-sa').join(' OR ')})`,
    nc: `licenseurl:(${ccUrls('by-nc', 'by-nc-sa').join(' OR ')})`,
};

/**
 * Murky rights (the 78 rpm transfers, old-time radio), and audiobooks and podcasts:
 * a full-text "bell" otherwise lists sermons and LibriVox chapters first.
 */
const EXCLUDED_COLLECTIONS = ['georgeblood', '78rpm', 'oldtimeradio', 'librivoxaudio', 'podcasts'];

/** Lucene's syntax characters out of what the user typed. */
const cleanText = (raw: string) => raw.replace(/[+\-!(){}[\]^"~*?:\\/&|]/g, ' ').replace(/\s+/g, ' ').trim();

const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

interface IaDoc {
    identifier: string;
    title?: string | string[];
    creator?: string | string[];
    licenseurl?: string | string[];
    item_size?: number;
}
interface IaSearch { response: { numFound: number; start: number; docs: IaDoc[] } }

interface IaFile {
    name: string;
    source?: string;
    format?: string;
    original?: string;
    length?: string;
    size?: string;
    title?: string;
}
interface IaMetadata { files?: IaFile[]; metadata?: { title?: string | string[]; creator?: string | string[] } }

/** "123.4", "02:03" or "1:02:03" → seconds. */
export const parseLength = (raw?: string): number | undefined => {
    if (!raw) return undefined;
    if (raw.includes(':')) {
        const s = raw.split(':').reduce((acc, part) => acc * 60 + Number(part), 0);
        return Number.isFinite(s) ? s : undefined;
    }
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : undefined;
};

const extOf = (name: string) => (name.split('.').pop() || '').toLowerCase();
const AUDIO = new Set(['mp3', 'wav', 'flac', 'ogg', 'aif', 'aiff', 'm4a']);

const downloadUrl = (id: string, name: string) =>
    `https://archive.org/download/${encodeURIComponent(id)}/${name.split('/').map(encodeURIComponent).join('/')}`;

export const archive: OnlineProvider = {
    id: 'archive',
    label: 'Internet Archive',
    blurb: 'Field recordings, radio, long sessions; folders of tracks',
    homepage: 'https://archive.org/details/audio',
    needsKey: false,
    limits: { perMinute: 30, perDay: 2000 },

    async search(query, page, ctx) {
        const text = cleanText(query.text);
        const licenses = query.licenses.map(l => LICENSE_QUERY[l]).join(' OR ');
        const q = [
            // Title and subject only. Full text matches any description that mentions
            // the word once, and those items outnumber the recordings of the thing.
            text ? `(title:(${text}) OR subject:(${text}))` : '',
            'mediatype:audio',
            `(${licenses})`,
            ...EXCLUDED_COLLECTIONS.map(c => `-collection:${c}`),
        ].filter(Boolean).join(' AND ');
        const params = new URLSearchParams({ q, rows: String(PAGE), page: String(page), output: 'json' });
        for (const f of ['identifier', 'title', 'creator', 'licenseurl', 'item_size']) params.append('fl[]', f);

        const data = await getJson<IaSearch>(`${SEARCH}?${params}`, 'Internet Archive', ctx);
        const hits: OnlineHit[] = [];
        for (const d of data.response.docs) {
            const license = fromCcUrl(first(d.licenseurl));
            if (!license || !query.licenses.includes(license.filter)) continue;
            hits.push({
                key: `online/archive/${d.identifier}`,
                provider: 'archive',
                title: tidyTitle(first(d.title) || d.identifier),
                author: first(d.creator) || 'Unknown',
                license,
                pageUrl: `https://archive.org/details/${encodeURIComponent(d.identifier)}`,
                bytes: d.item_size,
                expandable: true,
            });
        }
        const { numFound, start } = data.response;
        return { hits, hasMore: start + data.response.docs.length < numFound, total: numFound };
    },

    async expand(hit, ctx) {
        const id = hit.key.slice('online/archive/'.length);
        const data = await getJson<IaMetadata>(`${METADATA}${encodeURIComponent(id)}`, 'Internet Archive', ctx);
        const files = (data.files ?? []).filter(f => AUDIO.has(extOf(f.name)));
        const originals = files.filter(f => f.source === 'original');

        const tracks: { file: IaFile; lengthFrom: IaFile }[] = [];
        for (const o of originals.length > 0 ? originals : files) {
            const ext = extOf(o.name);
            if (ext === 'mp3' || ext === 'wav' || ext === 'flac') {
                // A small MP3 beats a 100 MB WAV for a sampler that keeps 42 s.
                const mp3 = ext !== 'mp3' ? files.find(f => f.original === o.name && extOf(f.name) === 'mp3') : undefined;
                tracks.push({ file: mp3 ?? o, lengthFrom: o });
            } else {
                const mp3 = files.find(f => f.original === o.name && extOf(f.name) === 'mp3');
                if (mp3) tracks.push({ file: mp3, lengthFrom: o });
            }
        }

        const license: OnlineLicense = hit.license;
        return tracks.slice(0, 200).map(({ file, lengthFrom }) => ({
            key: `online/archive/${id}/${file.name}`,
            provider: 'archive' as const,
            title: tidyTitle(file.title || lengthFrom.title || file.name.split('/').pop() || file.name),
            author: hit.author,
            license,
            pageUrl: hit.pageUrl,
            durationSec: parseLength(file.length ?? lengthFrom.length),
            bytes: file.size ? Number(file.size) : undefined,
            url: downloadUrl(id, file.name),
            format: extOf(file.name).toUpperCase(),
        }));
    },
};
