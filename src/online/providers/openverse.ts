import { fromCcCode, type LicenseFilter } from '../licenses.ts';
import { getJson, SKIP_FORMATS, tidyTitle, type OnlineHit, type OnlineProvider } from '../types.ts';

/**
 * Openverse (WordPress): one index over many CC audio archives. At CC0 it is in
 * practice Freesound's previews plus Wikimedia, without a Freesound key.
 *
 * Anonymous: 20 requests a minute, 200 a day, 20 results a page, and no further
 * than page 12 (240 results) of any search.
 */

const API = 'https://api.openverse.org/v1/audio/';

/** Openverse's own license codes per chip. ND codes are never asked for. */
const CODES: Record<LicenseFilter, string[]> = {
    pd: ['cc0', 'pdm'],
    by: ['by'],
    'by-sa': ['by-sa'],
    nc: ['by-nc', 'by-nc-sa', 'sampling+', 'nc-sampling+'],
};

const SOURCE_LABELS: Record<string, string> = {
    freesound: 'Freesound',
    wikimedia_audio: 'Wikimedia Commons',
    jamendo: 'Jamendo',
    ccmixter: 'ccMixter',
};

interface OvResult {
    id: string;
    title: string | null;
    foreign_landing_url: string;
    url: string;
    creator: string | null;
    license: string;
    license_version: string | null;
    license_url: string | null;
    source: string;
    filesize: number | null;
    filetype: string | null;
    duration: number | null;
}

interface OvPage {
    result_count: number;
    page_count: number;
    page: number;
    results: OvResult[];
}

export const openverse: OnlineProvider = {
    id: 'openverse',
    label: 'Openverse',
    blurb: 'Freesound and Wikimedia sounds, one index, no key',
    homepage: 'https://openverse.org/',
    needsKey: false,
    limits: { perMinute: 18, perDay: 190 },

    async search(query, page, ctx) {
        const params = new URLSearchParams({
            q: query.text,
            license: query.licenses.flatMap(l => CODES[l]).join(','),
            page_size: '20',
            page: String(page),
        });
        // Openverse's own buckets: shortest < 30 s, short 30 s – 2 min.
        if (query.maxSeconds === 30) params.set('length', 'shortest');
        else if (query.maxSeconds === 120) params.set('length', 'shortest,short');

        const data = await getJson<OvPage>(`${API}?${params}`, 'Openverse', ctx);
        const hits: OnlineHit[] = [];
        for (const r of data.results) {
            const format = (r.filetype || r.url.split('?')[0].split('.').pop() || '').toLowerCase();
            if (SKIP_FORMATS.has(format)) continue;
            const license = fromCcCode(r.license, r.license_version ?? undefined, r.license_url ?? undefined);
            if (!license || !query.licenses.includes(license.filter)) continue;
            hits.push({
                key: `online/openverse/${r.id}`,
                provider: 'openverse',
                via: SOURCE_LABELS[r.source] ?? r.source,
                title: tidyTitle(r.title || r.url.split('/').pop() || ''),
                author: r.creator || 'Unknown',
                license,
                pageUrl: r.foreign_landing_url,
                durationSec: r.duration ? r.duration / 1000 : undefined,
                bytes: r.filesize ?? undefined,
                url: r.url,
                format: format.toUpperCase(),
            });
        }
        return { hits, hasMore: data.page < data.page_count, total: data.result_count };
    },
};
