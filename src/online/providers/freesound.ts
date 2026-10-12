import { fromCcUrl } from '../licenses.ts';
import { getJson, tidyTitle, type OnlineHit, type OnlineProvider } from '../types.ts';

/**
 * Freesound, two ways in:
 *
 * - **The user's own key** (freesound.org/apiv2/apply), kept in their browser and
 *   sent straight to Freesound. Their own 60 a minute and 2000 a day.
 * - **WAV Builder's proxy** (workers/online-proxy) when they have none. It holds
 *   one key for everybody, so each visitor gets a small slice (`sharedLimits`).
 *
 * One key per app and no sharing it, which is why the app itself ships none.
 *
 * Previews only (128 kbps MP3). The original WAV/FLAC needs a Freesound sign-in
 * (OAuth), which needs a server for the token exchange; see the plan's "Later".
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
    n_from_same_pack?: number;
}
interface FsPage { count: number; next: string | null; results: FsSound[] }

export const freesound: OnlineProvider = {
    id: 'freesound',
    label: 'Freesound',
    blurb: 'The big sample library, all of it and up to date',
    homepage: 'https://freesound.org/',
    needsKey: true,
    proxyable: true,
    quality: '128 kbps MP3 previews. The original WAV/FLAC needs a Freesound sign-in, not built yet.',
    limitNote: 'Own key: 60 searches a minute, 2000 a day. Shared key: a few a minute, 100 a day per visitor.',
    limits: { perMinute: 55, perDay: 1900 },
    sharedLimits: { perMinute: 10, perDay: 100 },

    async search(query, page, ctx) {
        const params = new URLSearchParams({
            query: query.text,
            fields: 'id,name,username,license,duration,url,previews,n_from_same_pack',
            page_size: '50',
            page: String(page),
            // One sound per pack: an ungrouped "kick" gave five kicks from one pack
            // on the first page. The rest of a pack is a link away on its page.
            group_by_pack: '1',
        });
        if (query.maxSeconds) params.set('filter', `duration:[0 TO ${query.maxSeconds}]`);

        let url: string;
        if (ctx.apiKey) {
            params.set('token', ctx.apiKey);
            url = `${API}?${params}`;
        } else if (ctx.proxyUrl) {
            // The proxy adds the key and fixes `fields` itself.
            url = `${ctx.proxyUrl.replace(/\/+$/, '')}/freesound/search?${params}`;
        } else {
            throw new Error('Freesound needs your API key.');
        }

        const data = await getJson<FsPage>(url, 'Freesound', ctx);
        const hits: OnlineHit[] = [];
        for (const s of data.results) {
            const license = fromCcUrl(s.license);
            if (!license || !query.licenses.includes(license.filter)) continue;
            const preview = s.previews?.['preview-hq-mp3'];
            if (!preview) continue;
            hits.push({
                key: `online/freesound/${s.id}`,
                provider: 'freesound',
                title: tidyTitle(s.name),
                author: s.username,
                license,
                pageUrl: s.url,
                durationSec: s.duration,
                url: preview,
                format: 'MP3',
                bitrateKbps: 128,
                morePackSounds: s.n_from_same_pack || undefined,
            });
        }
        return { hits, hasMore: !!data.next, total: data.count };
    },
};
