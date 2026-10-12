import { fromCcUrl } from '../licenses.ts';
import { getJson, tidyTitle, type OnlineHit, type OnlineProvider } from '../types.ts';

/**
 * Freesound, with the user's own API key. One key per app and no sharing it, so
 * the app ships none: each user pastes theirs (freesound.org/apiv2/apply), and it
 * stays in their browser. 60 requests a minute, 2000 a day, per key.
 *
 * Previews only (128 kbps MP3). The original WAV/FLAC needs an OAuth sign-in,
 * which needs a server for the token exchange; see the plan's "Later".
 *
 * License filtering is done here rather than in the query: Freesound's license
 * names in filters are not documented with an example, and a wrong guess would be
 * a failed search instead of a shorter list.
 */

const API = 'https://freesound.org/apiv2/search/';

interface FsSound {
    id: number;
    name: string;
    username: string;
    license: string;
    duration: number;
    url: string;
    previews?: Record<string, string>;
}
interface FsPage { count: number; next: string | null; results: FsSound[] }

export const freesound: OnlineProvider = {
    id: 'freesound',
    label: 'Freesound',
    blurb: 'The big sample library; needs your own free API key',
    homepage: 'https://freesound.org/',
    needsKey: true,
    limits: { perMinute: 55, perDay: 1900 },

    async search(query, page, ctx) {
        if (!ctx.apiKey) throw new Error('Freesound needs your API key.');
        const params = new URLSearchParams({
            query: query.text,
            token: ctx.apiKey,
            fields: 'id,name,username,license,duration,url,previews',
            page_size: '50',
            page: String(page),
        });
        if (query.maxSeconds) params.set('filter', `duration:[0 TO ${query.maxSeconds}]`);

        const data = await getJson<FsPage>(`${API}?${params}`, 'Freesound', ctx);
        const hits: OnlineHit[] = [];
        for (const s of data.results) {
            const license = fromCcUrl(s.license);
            if (!license || !query.licenses.includes(license.filter)) continue;
            const url = s.previews?.['preview-hq-mp3'];
            if (!url) continue;
            hits.push({
                key: `online/freesound/${s.id}`,
                provider: 'freesound',
                title: tidyTitle(s.name),
                author: s.username,
                license,
                pageUrl: s.url,
                durationSec: s.duration,
                url,
                format: 'MP3',
            });
        }
        return { hits, hasMore: !!data.next, total: data.count };
    },
};
