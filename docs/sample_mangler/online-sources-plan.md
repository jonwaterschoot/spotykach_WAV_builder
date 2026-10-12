# WAV Builder — Online sources plan

Oct 12, 2026 · Jon · for the sample browser and the Sample Mangler, based on the research note of Oct 11 and live checks of each API on Oct 12

## Summary

Add a fourth group to the sample browser's source column, **Online**, with one search panel in our own UI that queries open audio archives and lists the results like pack rows: preview, add to the mangle pool, import. The first version needs no keys, no sign-in and no server of our own.

- **Start with three keyless sources:** Openverse, Wikimedia Commons and the Internet Archive. All three were checked from a browser origin on Oct 12: the search API *and* the audio file both send `Access-Control-Allow-Origin: *`, so a static GitHub Pages app can search, preview and decode them in WebAudio directly. NASA's media library works the same way and is a cheap fourth.
- **Rate limits are per user, for free.** The requests come from each visitor's own browser, so Openverse's anonymous cap (20/min, 200/day) applies per visitor, not to the app. No proxy is needed for the keyless sources.
- **Default to CC0 and public domain.** The license filter starts on *CC0 + public domain only*. CC-BY and CC-BY-SA can be switched on; the mangler's existing `classifyLicense` already treats them as *open* with attribution and share-alike carried into the result. NC stays off by default.
- **Keys come later, per user.** Freesound is the best sample library but needs a key, allows one key per app and forbids sharing it. The cleanest first step is "paste your own Freesound key" in settings. A Cloudflare Worker (or an OAuth sign-in for original WAV/FLAC files) is a later, separate decision.
- **Every online sample keeps its credit.** Origin, author, license and the page URL go into the sample's record, so attribution travels into mangler results, the Browse pool and exported packs.

## Status (Oct 12, 2026)

Phases 1–3 are built on `feat/sample-mangler`: Openverse, Commons, Archive, NASA, and Freesound with the user's own key.

| Part | Where |
| --- | --- |
| Provider interface, shared fetch, rate errors | `src/online/types.ts` |
| One module per archive | `src/online/providers/*.ts` |
| License spellings → chip and statement | `src/online/licenses.ts` |
| Registry, origin, stored license text, dedupe | `src/online/index.ts` |
| Request budget per provider (localStorage) | `src/online/budget.ts` |
| Search panel | `src/components/OnlineBrowser.tsx` |
| "Online" group, play/import/edit with per-sample URL, origin, license | `src/components/SampleBrowser.tsx` |
| Credit lines skipped by `classifyLicense`, copied into mangler results | `src/submission/licenses.ts`, `src/mangler/license.ts` |
| Checks: `npm run check:online` (offline), `node scripts/check-online.mjs --live` | `scripts/check-online.mjs` |

Things the live tests changed from the plan below:

- **Archive license queries use exact URLs.** A wildcard with a slash in it (`licenseurl:*licenses/by/*`) makes the Archive's search fail outright, so CC licenses are listed as exact URLs (every version, http and https). Public domain stays a wildcard.
- **Archive searches title and subject only, without audiobooks and podcasts.** Full text put sermons and LibriVox chapters first for "bell"; title/subject without `librivoxaudio` and `podcasts` lists bell recordings.
- **Freesound's search endpoint is `/apiv2/search/`.** `search/text/` was deprecated in November 2025. The key goes in the `token` query parameter, which needs no preflight.
- **Openverse length buckets:** `shortest` is under 30 s, `short` 30 s – 2 min. The panel's "≤ 30 s" and "≤ 2 min" map onto them.

Verified in Chrome against the dev server: search across all four keyless archives, preview, add to the Browse pool, expand an Archive item and add a track to the mangle pool, and generate a batch from online sources.

Not done yet: multi-select and drag for online rows (one row at a time for now), and everything under "Later".

## What was checked (Oct 12, 2026)

Each row was tested with an `Origin` header from a non-app domain. "File CORS" means a ranged GET on an actual audio URL from the search results, following redirects.

| Source | Key | Search CORS | File CORS | Limits seen | Verdict |
| --- | --- | --- | --- | --- | --- |
| Openverse `api.openverse.org/v1/audio/` | No | `*` | `*` (Freesound CDN, Wikimedia) | Headers: `anon_burst 20/min`, `anon_sustained 200/day` | **Use** |
| Wikimedia Commons `commons.wikimedia.org/w/api.php` with `origin=*` | No | `*`, preflight allows `Api-User-Agent` | `*` (`upload.wikimedia.org`) | None in headers; be polite, send `Api-User-Agent` | **Use** |
| Internet Archive `archive.org/advancedsearch.php`, `/metadata/{id}` | No | `*` | `*` on the 302 and on the `*.archive.org` node it redirects to | None in headers | **Use** |
| NASA `images-api.nasa.gov/search?media_type=audio` | No | `*` | `*` (`images-assets.nasa.gov`; the asset list returns `http://`, rewrite to `https://`) | None in headers | Use (small, mostly speech/mission audio) |
| Freesound `freesound.org/apiv2/` | Yes | `*` (401 without key) | `*` on `cdn.freesound.org` previews | 60/min, 2000/day per key | Phase 2, user's own key |
| Europeana `api.europeana.eu/record/v2/search.json` | Yes (free) | `*` | Varies per provider | — | Later; sample results with `TYPE:SOUND` were *In Copyright* and had no direct file link |
| xeno-canto `xeno-canto.org/api/3/` | Yes (per member) | Origin echoed | — | — | Later, and NC only |
| Library of Congress `loc.gov/audio/?fo=json` | No | 403 (bot wall) | — | — | Skip for now |
| ccMixter `ccmixter.org/api/query` | No | No CORS header | — | — | Skip (would need a proxy) |

Things the checks turned up that the plan has to handle:

- **Openverse's CC0 audio is mostly Freesound.** A CC0/PDM search for "rain" gave 240 hits, all Freesound `-hq.mp3` previews. Jamendo and ccMixter gave 0 at CC0. So Openverse is in practice "Freesound CC0 previews plus Wikimedia, without a key", which is a very good deal.
- **Openverse also returns `.mid` files.** Filter on `filetype` and drop anything we cannot decode.
- **Commons search returns everything, license included.** Of three "rain" results, two were CC BY-SA 4.0 and one CC0. The license is in `extmetadata.LicenseShortName`, so filter client-side. Commons also returns many Lingua Libre word recordings (`LL-Q…`), which we may want to hide.
- **Commons and Openverse overlap.** Openverse indexes `wikimedia_audio`. Dedupe by file URL when both are on.
- **Internet Archive filters on license server-side.** `licenseurl:*publicdomain*` with `subject:"field recording"` gave 26,666 audio items (Radio Aporee among them). Items can be long: a CC0 "rain" item was 90 minutes. Show the size before download and pick the smallest playable derivative (an MP3 is usually there).

## User flow

1. **Browser → Online.** A new group in the source column, below Built-in Packs. It lists the providers with a switch each (Openverse, Commons, Archive, NASA; Freesound appears greyed with "Add your key" until a key is set).
2. **Search.** The main panel shows a search field and filter chips: license (*CC0/PD* · *+BY* · *+BY-SA* · *+NC*), max length (default 60 s, since the mangler and Spotykach work within 42 s), format, and provider. Results merge into one list, each row showing the provider, length, license badge and author.
3. **Preview.** Plays through the existing `AudioPlayerContext`, streaming from the remote URL. Nothing is stored yet.
4. **Use it.** "Add to mangle pool" or "Import" fetches the file once, decodes it with `audioEngine.loadAndProcessAudio`, and stores it the way local imports are stored. From then on it is a normal source and needs no network.
5. **Credit.** The row's info popover and the stored record show the author, license and a link back to the page.

## Architecture

### Provider interface

One small module per source under `src/online/` (name to fit the codebase), all behind one interface, so the browser and the mangler never know which archive they are talking to:

```ts
interface OnlineProvider {
    id: 'openverse' | 'commons' | 'archive' | 'nasa' | 'freesound';
    label: string;
    needsKey: boolean;
    search(q: OnlineQuery, signal: AbortSignal): Promise<OnlinePage>;
    /** Resolve a playable file URL; Archive needs a metadata call to pick a file. */
    resolve(hit: OnlineHit): Promise<{ url: string; bytes?: number }>;
}

interface OnlineHit {
    provider: OnlineProvider['id'];
    id: string;
    title: string;
    author: string;
    license: string;        // written so classifyLicense reads it correctly, e.g. "CC-BY-SA 4.0"
    licenseUrl?: string;
    pageUrl: string;        // the human page, for credit
    durationSec?: number;
    previewUrl?: string;
}
```

- The **license string** is built from the provider's license code (`cc0`, `pdm`, `by-sa` …) into the same wording as `LICENSE_CHOICES`, so `classifyLicense` in `src/submission/licenses.ts` sorts it without new rules. Public Domain Mark needs a check: "public domain" already matches *open*.
- **Origin** on the imported sample is `"Online · Openverse"`, `"Online · Commons"` and so on, so `sourceLicense` in `src/mangler/license.ts` never mistakes it for a local file.
- The record gains `author` and `pageUrl` (or they go into the license text as a second line, which `shortTerms` already cuts off). The mangler's result license lists them per used source.

### Searching

- **One query, fanned out.** The panel sends the query to each enabled provider in parallel, shows each provider's results as they arrive, and pages per provider ("more from Archive").
- **Client-side budget.** A token bucket per provider, sized below its limit (Openverse: 15/min, 150/day), stored in `localStorage`. When it runs low the provider's switch says so instead of the API returning 429s. Openverse's `x-ratelimit-available-*` headers can correct the local count.
- **Cache.** Cache search pages for a session (`sessionStorage`, keyed by provider + query + filters) so flipping filters back and forth costs nothing.
- **Debounce.** Search on Enter or after a pause, never per keystroke, given 200 calls a day.

### Fetching files

- **Size cap.** Read `Content-Length` (or Archive's `size` from metadata) before downloading. Refuse above ~50 MB with a message; offer to take a shorter derivative when there is one.
- **Format.** Prefer MP3 or WAV/FLAC where available. Commons serves many files as Ogg, which Safari may not decode; Commons also keeps MP3 transcodes, so fall back to those (verify the transcode URL pattern when implementing).
- **Long files.** A 90-minute Archive item is fine to stream for preview but too big to decode whole. For the mangler, a later step could fetch a byte range of an MP3 and decode that part only.

## Licenses

The existing three levels hold. What changes is where the license text comes from and the default filter:

| Filter chip | Includes | Mangler level |
| --- | --- | --- |
| **CC0 / PD** (on by default) | CC0, Public Domain Mark, PD | Open, no credit needed (credit anyway as a courtesy) |
| **+ BY** | CC-BY | Open, credit required; travels into the result text |
| **+ BY-SA** | CC-BY-SA | Open with share-alike; the result says so |
| **+ NC** (off by default) | CC-BY-NC, BY-NC-SA | Personal use; Submit a Pack refuses it |
| never shown | Anything ND, no license, "In Copyright" | — |

- **Internet Archive licenses are the uploader's claim.** Use only items with a `licenseurl`, and exclude collections with known murky rights (the 78 rpm transfers, `georgeblood`). Say on the row that the license is as stated by the uploader.
- **Freesound terms.** API use is free for non-commercial apps; commercial use is negotiated. WAV Builder is free, so the free tier fits. Sounds must be used under their own CC licenses, which the license field already covers.

## Implementation plan

**Phase 1 — Openverse only (proves the whole path)**

1. Provider interface, Openverse provider, license mapping to our wording.
2. "Online" group in `SampleBrowser`'s source column and a search panel in the list area, with license and length filters.
3. Preview through the existing player; import and add-to-pool through the existing import path, with the new origin and credit fields.
4. Rate budget and session cache.

**Phase 2 — Commons, Archive, NASA**

5. Commons provider (`origin=*`, `Api-User-Agent: WAVBuilder/<version> (<repo url>)`, client-side license filter, hide `LL-Q` by default, Ogg→MP3 fallback).
6. Archive provider (server-side `licenseurl` filter, collection exclusions, metadata call to pick a file, size cap).
7. NASA provider (https rewrite).
8. Dedupe across providers by file URL.

**Phase 3 — Freesound with the user's own key**

9. Settings field "Freesound API key", stored in this browser only, with a link to Freesound's key page. Freesound then appears as a provider (search all CC licenses, not only CC0, plus its tag and duration filters, previews only).

**Later, separately decided**

- A Cloudflare Worker that holds one Freesound key and enforces a per-visitor cap, so visitors need no key. This means running a server and accepting Freesound's one-key-per-app limits for every user combined.
- Freesound OAuth sign-in for original WAV/FLAC/AIFF files instead of MP3 previews. Needs the Worker for the token exchange (the client secret cannot live in the page).
- Europeana and xeno-canto, each with a user-supplied key.

## Open questions

- **Where does the panel live in the mangler?** The mangler hosts `SampleBrowser` in picker mode, so it gets the Online group for free. Should online results there be add-to-pool only (no import)?
- **Preview without CORS on a future source.** An `<audio>` element plays without CORS but WebAudio decoding needs it. Every source above passes; any new one must be checked the same way first.
- **Openverse registration.** Registered clients get somewhat higher limits, but the credentials would be public in a static app. Stay anonymous unless the per-visitor limit turns out to bite.
- **Is "Online" the right group name** alongside Built-in Packs, Projects, Curated Library and Local Folders?

## Sources

- Live checks against each API on Oct 12, 2026 (headers and sample responses as described above)
- [Freesound API terms of use](https://freesound.org/help/tos_api/)
- [Wikimedia User-Agent policy](https://foundation.wikimedia.org/wiki/Policy:User-Agent_policy) (browser clients send `Api-User-Agent`)
- xeno-canto API v3 key requirement: [xeno-canto-api-ts README](https://github.com/JoeSiu/xeno-canto-api-ts/blob/main/README.md), [suwo docs](https://docs.ropensci.org/suwo/reference/query_xenocanto.html)
- The Oct 11 research note (Openverse terms, Europeana parameters, Pixabay/BBC exclusions)
