import { fromCcUrl } from '../licenses.ts';
import { getJson, tidyTitle, type OnlineHit, type OnlineProvider, type ProviderContext } from '../types.ts';

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
 * The API gives 128 kbps MP3 previews; the original needs a Freesound sign-in.
 * Rather than an OAuth flow, a row links to the sound's download page on
 * freesound.org (the user signs in there), and the downloaded file, named
 * `<id>__<user>__<title>.<ext>`, is recognised when dropped back on the panel.
 *
 * License filtering is done here rather than in the query: Freesound's license
 * names in filters are not documented with an example, and a wrong guess would be
 * a failed search instead of a shorter list.
 */

const API = 'https://freesound.org/apiv2/';
/** Also the proxy's FIELDS (workers/online-proxy/src/index.js); keep the two alike. */
const FIELDS = 'id,name,username,license,duration,url,previews,n_from_same_pack,type,filesize,samplerate,bitdepth,channels';

interface FsSound {
    id: number;
    name: string;
    username: string;
    license: string;
    duration: number;
    url: string;
    previews?: Record<string, string>;
    n_from_same_pack?: number;
    type?: string;
    filesize?: number;
    samplerate?: number;
    bitdepth?: number;
    channels?: number;
}
interface FsPage { count: number; next: string | null; results: FsSound[] }

/** Direct with the user's key, else through the proxy. `path` is e.g. `search/` or `sounds/123/`. */
const endpoint = (path: string, params: URLSearchParams, ctx: ProviderContext): string => {
    if (ctx.apiKey) {
        params.set('token', ctx.apiKey);
        return `${API}${path}?${params}`;
    }
    if (ctx.proxyUrl) {
        // The proxy adds the key and fixes `fields` itself.
        const route = path === 'search/' ? 'search' : `sound/${/^sounds\/(\d+)\/$/.exec(path)?.[1]}`;
        return `${ctx.proxyUrl.replace(/\/+$/, '')}/freesound/${route}?${params}`;
    }
    throw new Error('Freesound needs your API key.');
};

/** A sound as a hit, or null when its license isn't one the app takes. */
const toHit = (s: FsSound): OnlineHit | null => {
    const license = fromCcUrl(s.license);
    const preview = s.previews?.['preview-hq-mp3'];
    if (!license || !preview) return null;
    return {
        key: `online/freesound/${s.id}`,
        provider: 'freesound',
        title: tidyTitle(s.name),
        author: s.username.replace(/^@/, ''),
        license,
        pageUrl: s.url,
        durationSec: s.duration,
        url: preview,
        format: 'MP3',
        bitrateKbps: 128,
        isPreview: true,
        morePackSounds: s.n_from_same_pack || undefined,
        // Absent through a proxy deployed before these fields were passed on.
        original: s.type
            ? { format: s.type.toUpperCase(), bytes: s.filesize, sampleRate: s.samplerate, bitDepth: s.bitdepth || undefined, channels: s.channels }
            : undefined,
        freesoundId: s.id,
    };
};

export const freesound: OnlineProvider = {
    id: 'freesound',
    label: 'Freesound',
    blurb: 'The big sample library, all of it and up to date',
    homepage: 'https://freesound.org/',
    needsKey: true,
    proxyable: true,
    quality: '128 kbps MP3 previews. Each row says what the original is; "Get original" downloads it from freesound.org (sign in there), and dropping that file here adds it with its credit.',
    limitNote: 'Own key: 60 searches a minute, 2000 a day. Shared key: a few a minute, 100 a day per visitor.',
    limits: { perMinute: 55, perDay: 1900 },
    sharedLimits: { perMinute: 10, perDay: 100 },

    async search(query, page, ctx) {
        const params = new URLSearchParams({
            query: query.text,
            fields: FIELDS,
            page_size: '50',
            page: String(page),
            // One sound per pack: an ungrouped "kick" gave five kicks from one pack
            // on the first page. The rest of a pack is a link away on its page.
            group_by_pack: '1',
        });
        if (query.maxSeconds) params.set('filter', `duration:[0 TO ${query.maxSeconds}]`);

        const data = await getJson<FsPage>(endpoint('search/', params, ctx), 'Freesound', ctx);
        const hits = data.results
            .map(toHit)
            .filter((h): h is OnlineHit => !!h && query.licenses.includes(h.license.filter));
        return { hits, hasMore: !!data.next, total: data.count };
    },
};

/** One sound by id: for a downloaded original whose search result isn't on screen. */
export async function lookupFreesound(id: number, ctx: ProviderContext): Promise<OnlineHit | null> {
    const data = await getJson<FsSound>(endpoint(`sounds/${id}/`, new URLSearchParams({ fields: FIELDS }), ctx), 'Freesound', ctx);
    return toHit(data);
}

/**
 * The sound's download link on freesound.org. Signed in there, it downloads the
 * original; signed out, Freesound asks to sign in first and comes back.
 */
export const freesoundDownloadUrl = (hit: OnlineHit): string | null =>
    hit.freesoundId ? `${hit.pageUrl.replace(/\/+$/, '')}/download/` : null;

/** `398494__anthousai__wind-chimes-single-01.wav` → 398494. Null for other names. */
export const freesoundIdFromFileName = (name: string): number | null => {
    const m = /^(\d+)__[^_].*\.[a-z0-9]+$/i.exec(name.split(/[\\/]/).pop() || '');
    return m ? Number(m[1]) : null;
};
