import type { LicenseFilter, OnlineLicense } from './licenses.ts';

/**
 * Online sources: open audio archives searched from the browser, no server of ours
 * in between. Each archive is a provider behind the one interface below, so the
 * search panel and the hosts never need to know which one a sound came from.
 *
 * Plan and API checks: docs/sample_mangler/online-sources-plan.md.
 */

export type ProviderId = 'openverse' | 'commons' | 'archive' | 'nasa' | 'freesound';

/** Longest sound the search asks for. `null` is any length. */
export type MaxLength = 30 | 120 | null;

export interface OnlineQuery {
    text: string;
    licenses: LicenseFilter[];
    maxSeconds: MaxLength;
}

export interface OnlineHit {
    /** `online/<provider>/<id>`: the row's path, and the pooled entry's `sourcePath`. */
    key: string;
    provider: ProviderId;
    /** Where an aggregator found it, e.g. "Freesound" for an Openverse hit. */
    via?: string;
    title: string;
    author: string;
    license: OnlineLicense;
    /** The human page for the sound: what a credit links to. */
    pageUrl: string;
    durationSec?: number;
    bytes?: number;
    /** The file to play and download. Absent until `expand` for an Archive item. */
    url?: string;
    /** "MP3", "WAV" … for the row. */
    format?: string;
    /** Where the archive says; lossless originals don't need one to be judged. */
    bitrateKbps?: number;
    /** Freesound, grouped by pack: how many more sounds its pack has that aren't listed. */
    morePackSounds?: number;
    /** An Archive item: a folder of tracks, listed by `expand`. */
    expandable?: boolean;
    /** The provider's own pointer for `expand`, e.g. NASA's asset list URL. */
    ref?: string;
}

export interface OnlinePage {
    hits: OnlineHit[];
    /** True when asking for the next page may give more. */
    hasMore: boolean;
    /** What the archive says it has in all, when it says. */
    total?: number;
}

export interface ProviderContext {
    signal?: AbortSignal;
    /** The user's own key, for the providers that need one. */
    apiKey?: string;
    /**
     * WAV Builder's own proxy (workers/online-proxy), which holds a shared key. Used
     * when there is no `apiKey`; a personal key always goes direct.
     */
    proxyUrl?: string;
    fetch?: typeof fetch;
}

export interface OnlineProvider {
    id: ProviderId;
    label: string;
    /** One line under the switch: what is in it. */
    blurb: string;
    homepage: string;
    needsKey: boolean;
    /** True when the shared proxy can stand in for a missing key. */
    proxyable?: boolean;
    /** What you get, in a line: format and bitrate of what is downloaded. */
    quality: string;
    /** The archive's own limits, in a line. */
    limitNote: string;
    /** Kept a little under the archive's own limits; see budget.ts. */
    limits: { perMinute: number; perDay: number };
    /** Through the shared proxy: this visitor's slice of one key shared by everyone. */
    sharedLimits?: { perMinute: number; perDay: number };
    /** `page` counts from 1. */
    search(query: OnlineQuery, page: number, ctx: ProviderContext): Promise<OnlinePage>;
    /** An expandable hit's playable files. */
    expand?(hit: OnlineHit, ctx: ProviderContext): Promise<OnlineHit[]>;
}

/** An HTTP answer that is the archive saying "slow down". */
export class RateLimitError extends Error {
    retryAfterSec: number;
    constructor(provider: string, retryAfterSec: number) {
        super(`${provider} asks to slow down. Try again in ${Math.ceil(retryAfterSec / 60)} min.`);
        this.retryAfterSec = retryAfterSec;
    }
}

/** Shared fetch: JSON, CORS, and 429 turned into a RateLimitError. */
export async function getJson<T>(url: string, label: string, ctx: ProviderContext): Promise<T> {
    const doFetch = ctx.fetch ?? fetch;
    const res = await doFetch(url, { mode: 'cors', signal: ctx.signal });
    if (res.status === 429) {
        const retry = Number(res.headers.get('retry-after'));
        throw new RateLimitError(label, Number.isFinite(retry) && retry > 0 ? retry : 60);
    }
    if (!res.ok) {
        // The proxy and Freesound both explain themselves in `detail`.
        const detail = await res.json().then((b: { detail?: unknown }) => (typeof b?.detail === 'string' ? b.detail : ''), () => '');
        if (res.status === 401 || res.status === 403) throw new Error(`${label} refused the request${detail ? `: ${detail}` : '. Check the key.'}`);
        throw new Error(`${label} answered ${res.status}${detail ? `: ${detail}` : ''}`);
    }
    return res.json() as Promise<T>;
}

/** Parts of a title that make bad file names: extensions, underscores, runs of space. */
export const tidyTitle = (raw: string): string => {
    const t = raw
        .replace(/^File:/, '')
        .replace(/\.(wav|mp3|ogg|oga|ogx|opus|flac|aiff?|m4a|webm)$/i, '')
        .replace(/_/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return t.length > 80 ? `${t.slice(0, 77)}…` : t || 'Untitled';
};

/** HTML out of a string: Commons sends its author as a link. */
export const stripHtml = (raw: string): string =>
    raw.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();

/** Formats WebAudio decodes everywhere. Ogg/Opus is left out: Safari may not. */
export const SAFE_FORMATS = new Set(['mp3', 'wav', 'flac', 'm4a', 'aac']);
/** Never shown: not audio we can decode at all. */
export const SKIP_FORMATS = new Set(['mid', 'midi', 'webm', 'mpg', 'mpeg4']);
