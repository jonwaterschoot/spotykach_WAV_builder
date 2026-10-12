import { fromCcUrl, type LicenseFilter, type OnlineLicense } from '../licenses.ts';
import { getJson, LOSSLESS_FORMATS, MAX_DOWNLOAD_BYTES, tidyTitle, type OnlineHit, type OnlineProvider } from '../types.ts';

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
    quality: "Lossless when it fits: the item's FLAC copy, or the original WAV, up to 60 MB. Otherwise its MP3 copy.",
    limitNote: 'No published cap; kept to 30 searches a minute.',
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
        const sizeOf = (f: IaFile) => (f.size ? Number(f.size) : undefined);
        const fits = (f: IaFile) => (sizeOf(f) ?? 0) <= MAX_DOWNLOAD_BYTES;

        // Per uploaded track, the best copy that fits: lossless first, smallest first
        // (the Archive's FLAC of a WAV is about a third of it), else the MP3. Not AIFF:
        // WebAudio reads it in Safari only.
        const tracks: { file: IaFile; original: IaFile; alt?: IaFile }[] = [];
        for (const o of originals.length > 0 ? originals : files) {
            const copies = [o, ...files.filter(f => f.original === o.name)];
            const lossless = copies
                .filter(f => (extOf(f.name) === 'flac' || extOf(f.name) === 'wav') && fits(f))
                .sort((x, y) => (sizeOf(x) ?? 0) - (sizeOf(y) ?? 0))[0];
            const mp3 = copies.find(f => extOf(f.name) === 'mp3');
            // An Ogg upload is already lossy; its MP3 would be a second lossy encode. Take
            // the Ogg, with the MP3 as `altUrl` for browsers that can't play Ogg (Safari).
            const ogg = extOf(o.name) === 'ogg' && fits(o) ? o : undefined;
            const pick = lossless ?? ogg ?? mp3;
            if (pick) tracks.push({ file: pick, original: o, alt: pick === ogg ? mp3 : undefined });
        }

        const license: OnlineLicense = hit.license;
        return tracks.slice(0, 200).map(({ file, original, alt }) => {
            const format = extOf(file.name);
            return {
                // Keyed by the uploaded track, whichever copy is fetched.
                key: `online/archive/${id}/${original.name}`,
                provider: 'archive' as const,
                title: tidyTitle(file.title || original.title || original.name.split('/').pop() || original.name),
                author: hit.author,
                license,
                pageUrl: hit.pageUrl,
                durationSec: parseLength(file.length ?? original.length),
                bytes: sizeOf(file),
                url: downloadUrl(id, file.name),
                altUrl: alt ? downloadUrl(id, alt.name) : undefined,
                format: format.toUpperCase(),
                lossless: LOSSLESS_FORMATS.has(format),
                // Said only when what is fetched isn't the upload itself.
                original: file === original ? undefined : { format: extOf(original.name).toUpperCase(), bytes: sizeOf(original) },
            };
        });
    },
};
