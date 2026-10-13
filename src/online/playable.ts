import { PROVIDERS_BY_ID } from './index.ts';
import { MAX_DOWNLOAD_BYTES, type OnlineHit } from './types.ts';

/**
 * From a search hit to a file this browser can play and the host can download.
 * Shared by the row buttons and the multi-select import, so both refuse the same
 * files for the same reasons. Browser-only (it asks the browser about Ogg).
 */

/** A hit with a URL settled, ready for the player or the host's import. */
export type PlayableHit = OnlineHit & { url: string };

export const MAX_BYTES = MAX_DOWNLOAD_BYTES;

/**
 * Commons' Ogg through Openverse arrives as the original. Where this browser can't
 * play Ogg (Safari), take Commons' own MP3 transcode of it instead.
 */
const canPlay = (mime: string) => {
    try { return typeof Audio !== 'undefined' && new Audio().canPlayType(mime) !== ''; } catch { return false; }
};
const canPlayOgg = canPlay('audio/ogg; codecs="vorbis"');
/** Chrome and Firefox can't decode AIFF; Safari can. */
const canPlayAiff = canPlay('audio/aiff') || canPlay('audio/x-aiff');

/** False for a file this browser can't decode, by its extension. */
const playableHere = (url: string) => {
    const ext = (url.split('?')[0].split('.').pop() || '').toLowerCase();
    if (ext === 'ogg' || ext === 'oga' || ext === 'ogx' || ext === 'opus') return canPlayOgg;
    if (ext === 'aif' || ext === 'aiff') return canPlayAiff;
    return true;
};
export const browserUrl = (url: string) => {
    if (canPlayOgg) return url;
    const m = /^(https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/)(?!transcoded\/)(.+\/([^/]+\.(?:ogg|oga|ogx|opus)))$/i.exec(url);
    return m ? `${m[1]}transcoded/${m[2]}/${m[3]}.mp3` : url;
};

/** What `expand` found for a hit without a URL of its own, for this page's life. */
const resolved = new Map<string, Partial<OnlineHit> & { url: string }>();

/** A settled URL for a hit: its own, or the first file `expand` lists. Null when there is none. */
export async function resolveHit(hit: OnlineHit): Promise<PlayableHit | null> {
    if (hit.url) {
        // The archive's own fallback copy first; for Openverse's Commons Ogg, the transcode.
        if (hit.altUrl && !playableHere(hit.url)) return { ...hit, url: hit.altUrl, format: 'MP3', lossless: false, bytes: undefined };
        return { ...hit, url: browserUrl(hit.url) };
    }
    const cached = resolved.get(hit.key);
    if (cached) return { ...hit, ...cached };
    const provider = PROVIDERS_BY_ID[hit.provider];
    if (!provider.expand) return null;
    const first = (await provider.expand(hit, {})).find(f => f.url);
    if (!first?.url) return null;
    const settled = { url: browserUrl(first.url), format: first.format, bytes: first.bytes, durationSec: first.durationSec, bitrateKbps: first.bitrateKbps };
    resolved.set(hit.key, settled);
    return { ...hit, ...settled };
}

export const isTooBig = (hit: OnlineHit) => !!hit.bytes && hit.bytes > MAX_BYTES;
