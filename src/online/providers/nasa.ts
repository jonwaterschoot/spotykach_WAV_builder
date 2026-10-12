import type { OnlineLicense } from '../licenses.ts';
import { getJson, tidyTitle, type OnlineHit, type OnlineProvider } from '../types.ts';

/**
 * NASA's image and video library, audio only: mission recordings, launches,
 * podcasts. NASA media is not copyrighted (its media guidelines ask only that NASA
 * isn't shown endorsing anything), so every hit is public domain.
 *
 * A search hit points at a `collection.json` listing its files; that list is
 * fetched when the hit is played or added, not for every row.
 */

const API = 'https://images-api.nasa.gov/search';
const PAGE = 30;

const LICENSE: OnlineLicense = {
    filter: 'pd',
    label: 'Public domain (NASA)',
    url: 'https://www.nasa.gov/nasa-brand-center/images-and-media/',
};

interface NasaItem {
    href: string;
    data: { nasa_id: string; title?: string; center?: string; photographer?: string; secondary_creator?: string }[];
}
interface NasaSearch { collection: { items: NasaItem[]; metadata?: { total_hits: number }; links?: { rel: string }[] } }

/** The asset list sends `http://`; this page is https. */
const https = (url: string) => url.replace(/^http:\/\//, 'https://');

export const nasa: OnlineProvider = {
    id: 'nasa',
    label: 'NASA',
    blurb: 'Mission audio, launches, space sounds; public domain',
    homepage: 'https://images.nasa.gov/',
    needsKey: false,
    limits: { perMinute: 30, perDay: 1000 },

    async search(query, page, ctx) {
        // NASA media is all public domain: nothing to show without that chip.
        if (!query.licenses.includes('pd')) return { hits: [], hasMore: false, total: 0 };
        const params = new URLSearchParams({
            q: query.text,
            media_type: 'audio',
            page: String(page),
            page_size: String(PAGE),
        });
        const data = await getJson<NasaSearch>(`${API}?${params}`, 'NASA', ctx);
        const hits: OnlineHit[] = data.collection.items.map(item => {
            const d = item.data[0];
            return {
                key: `online/nasa/${d.nasa_id}`,
                provider: 'nasa',
                title: tidyTitle(d.title || d.nasa_id),
                author: d.photographer || d.secondary_creator || (d.center ? `NASA ${d.center}` : 'NASA'),
                license: LICENSE,
                pageUrl: `https://images.nasa.gov/details/${encodeURIComponent(d.nasa_id)}`,
                // No `url` yet: `expand` reads it off the asset list.
                ref: https(item.href),
            };
        });
        return {
            hits,
            hasMore: !!data.collection.links?.some(l => l.rel === 'next'),
            total: data.collection.metadata?.total_hits,
        };
    },

    async expand(hit, ctx) {
        const assets = hit.ref
            ?? `https://images-assets.nasa.gov/audio/${hit.key.slice('online/nasa/'.length)}/collection.json`;
        const files = (await getJson<string[]>(assets, 'NASA', ctx)).map(https);
        // Smallest decent MP3 first; the original is sometimes a 200 MB WAV.
        const pick = files.find(f => f.endsWith('~128k.mp3'))
            ?? files.find(f => f.endsWith('~orig.mp3'))
            ?? files.find(f => /\.(mp3|m4a|wav)$/i.test(f));
        if (!pick) return [];
        return [{ ...hit, url: pick, format: (pick.split('.').pop() || '').toUpperCase() }];
    },
};
