import { fromCommons } from '../licenses.ts';
import { getJson, SAFE_FORMATS, SKIP_FORMATS, stripHtml, tidyTitle, type OnlineHit, type OnlineProvider } from '../types.ts';

/**
 * Wikimedia Commons, through the Action API. `origin=*` is what makes it answer a
 * page on another domain; `Api-User-Agent` is how a browser client says who it is
 * (the browser will not let it set User-Agent), and Commons' preflight allows it.
 *
 * Commons has no license filter in search, so the page asks for 50 and keeps the
 * ones the chips allow. Lingua Libre's word recordings (`LL-Q…`) are hidden: they
 * are tens of thousands of single spoken words.
 */

const API = 'https://commons.wikimedia.org/w/api.php';
const USER_AGENT = 'WAVBuilder/4 (https://github.com/jonwaterschoot/spotykach_WAV_builder)';
const PAGE = 50;

interface Derivative { src: string; type: string; transcodekey?: string }
interface VideoInfo {
    url: string;
    descriptionurl: string;
    size: number;
    mime: string;
    duration?: number;
    derivatives?: Derivative[];
    extmetadata?: Record<string, { value: unknown }>;
}
interface CommonsAnswer {
    continue?: { gsroffset: number };
    query?: { searchinfo?: { totalhits: number }; pages: { title: string; index?: number; videoinfo?: VideoInfo[] }[] };
}

const meta = (v: VideoInfo, k: string): string | undefined => {
    const value = v.extmetadata?.[k]?.value;
    return value == null ? undefined : String(value);
};

/** The original when every browser decodes it, else Commons' own MP3 transcode. */
const playable = (v: VideoInfo): { url: string; format: string } => {
    const ext = (v.url.split('?')[0].split('.').pop() || '').toLowerCase();
    const clean = v.url.split('?')[0];
    if (SAFE_FORMATS.has(ext)) return { url: clean, format: ext.toUpperCase() };
    const mp3 = v.derivatives?.find(d => d.transcodekey === 'mp3' || d.type.startsWith('audio/mpeg'));
    if (mp3) return { url: mp3.src.split('?')[0], format: 'MP3' };
    return { url: clean, format: ext.toUpperCase() };
};

export const commons: OnlineProvider = {
    id: 'commons',
    label: 'Wikimedia Commons',
    blurb: 'Field recordings, instruments, voices; many need credit',
    homepage: 'https://commons.wikimedia.org/wiki/Category:Audio_files',
    needsKey: false,
    limits: { perMinute: 30, perDay: 2000 },

    async search(query, page, ctx) {
        const params = new URLSearchParams({
            action: 'query',
            format: 'json',
            formatversion: '2',
            origin: '*',
            generator: 'search',
            gsrnamespace: '6',
            gsrsearch: `${query.text} filetype:audio`,
            gsrlimit: String(PAGE),
            gsroffset: String((page - 1) * PAGE),
            prop: 'videoinfo',
            viprop: 'url|size|mime|extmetadata|derivatives',
            viextmetadatafilter: 'License|LicenseShortName|LicenseUrl|Artist|ObjectName',
        });
        const doFetch = ctx.fetch ?? fetch;
        const data = await getJson<CommonsAnswer>(`${API}?${params}`, 'Commons', {
            ...ctx,
            // `Api-User-Agent` on every call; the shared helper has no headers.
            fetch: (url, init) => doFetch(url, { ...init, headers: { 'Api-User-Agent': USER_AGENT } }),
        });

        const pages = [...(data.query?.pages ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
        const hits: OnlineHit[] = [];
        for (const p of pages) {
            const v = p.videoinfo?.[0];
            if (!v || /^File:LL-Q\d/.test(p.title)) continue;
            const ext = (v.url.split('?')[0].split('.').pop() || '').toLowerCase();
            if (SKIP_FORMATS.has(ext) || !v.mime.startsWith('audio') && v.mime !== 'application/ogg') continue;
            if (query.maxSeconds && v.duration && v.duration > query.maxSeconds) continue;
            const license = fromCommons(meta(v, 'License'), meta(v, 'LicenseShortName'), meta(v, 'LicenseUrl'));
            if (!license || !query.licenses.includes(license.filter)) continue;
            const file = playable(v);
            hits.push({
                key: `online/commons/${encodeURIComponent(p.title)}`,
                provider: 'commons',
                title: tidyTitle(stripHtml(meta(v, 'ObjectName') || p.title)),
                author: stripHtml(meta(v, 'Artist') || '') || 'Unknown',
                license,
                pageUrl: v.descriptionurl,
                durationSec: v.duration,
                // Only the original's size is given. A transcode is smaller, and judging
                // it by a 100 MB WAV would refuse a 2 MB MP3.
                bytes: file.url === v.url.split('?')[0] ? v.size : undefined,
                url: file.url,
                format: file.format,
            });
        }
        return { hits, hasMore: !!data.continue, total: data.query?.searchinfo?.totalhits };
    },
};
