# Online sources — maintenance notes

The sample browser's **Online** source searches open audio archives (Openverse, Wikimedia Commons, Internet Archive, NASA, Citizen DJ, Freesound) and adds results to whichever host the browser is in: Browse, Studio, or the Mangler's picker. Why and how it was decided: [online-sources-plan.md](online-sources-plan.md).

## Where things are

| What | Where |
| --- | --- |
| One module per archive | `src/online/providers/*.ts` |
| Provider interface, hit shape, shared fetch, size cap | `src/online/types.ts` |
| Provider list and defaults, stored license text, dedupe | `src/online/index.ts` |
| License spellings → chip and statement | `src/online/licenses.ts` |
| Picking a playable URL (Ogg/AIFF fallbacks), size check | `src/online/playable.ts` |
| Per-browser request budget | `src/online/budget.ts` |
| Search panel, archive list, dropped originals | `src/components/OnlineBrowser.tsx` |
| Wiring into the browser (Online group, play/import, multi-select) | `src/components/SampleBrowser.tsx` (`isOnlineSelected`, `onlineSample`, `importOnlineTo`) |
| AIFF → WAV for dropped Freesound originals | `src/lib/audio/aiff.ts` |
| Citizen DJ catalogue snapshot (generated, not linted) | `src/online/data/citizendj.ts`, written by `scripts/fetch-citizen-dj.mjs` (`npm run fetch:citizen-dj`) |
| Freesound proxy (Cloudflare Worker) | `workers/online-proxy/` (deploy steps in its README) |
| Checks | `npm run check:online`; add `-- --live` to hit the real APIs |

## Rules the code relies on

- **CORS on both the API and the file.** Every source must answer `Access-Control-Allow-Origin` for the search *and* the audio file, or WebAudio can't decode it. Check a new source with `curl -D - -H "Origin: https://example.org" <url>` on both.
- **Licenses.** Each hit's license becomes a statement plus a `Credit:` line (`licenseTextFor`). `classifyLicense` skips `Credit:` lines, so titles can't change a license level, and mangler results copy every credit line. ND and unknown licenses are never shown.
- **Keys.** A hit's `key` (`online/<provider>/<id>`) is its row path and the pooled entry's `sourcePath`. Changing the format breaks "already added" marks for sounds already pooled.
- **Citizen DJ is a snapshot.** It has no search API and its catalogue JSON has no CORS (only the S3 clips do), so `fetch-citizen-dj.mjs` reads the catalogue from its GitHub repo, HEADs every clip for its size, and writes one JSON string the provider parses on the first search. Lengths come from the size: the script stops if a collection's WAVs aren't 48 kHz 16-bit stereo. It also stops on rights it can't sort into public domain, "free to use" (LoC-cleared, not PD) or "with attribution" (Joe Smith); collections not `active` on the site are left out.
- **Licenses that aren't CC** carry their own `statement` (`OnlineLicense.statement`), worded so `classifyLicense` still reads the right level. `check:online` tests both Citizen DJ kinds.
- **New archives start on.** Saved preferences record `known` archives; a default archive missing from it is switched on. Browsers that saved before `known` existed are treated as having seen `PROVIDERS_BEFORE_KNOWN`.
- **Freesound fields** are listed twice, in `FIELDS` in `providers/freesound.ts` and in `workers/online-proxy/src/index.js`. Change both, then redeploy the Worker.

## Common changes

- **Add an archive:** write `providers/<name>.ts` implementing `OnlineProvider` (`search`, plus `expand` if a hit has no direct file URL), add it to `PROVIDERS` (and `DEFAULT_PROVIDERS`) in `index.ts`. `scripts/check-online.mjs --live` then searches it too; add license spellings it uses to the offline cases there.
- **Remove an archive:** take it out of `PROVIDERS`. Saved preferences ignore unknown ids.
- **Refresh Citizen DJ:** `npm run fetch:citizen-dj` (about 1.5 min, ~4,000 HEAD requests to S3), then `npm run check:online`, and commit the regenerated file.
- **Change limits:** `limits` and `sharedLimits` on each provider (counted in the browser), and `[[ratelimits]]` in `workers/online-proxy/wrangler.toml` (counted by Cloudflare).
- **Worker:** `cd workers/online-proxy`, then `npx wrangler@4 deploy` after any change to `src/index.js` or `wrangler.toml`. New key: `npx wrangler@4 secret put FREESOUND_KEY`. Another site domain: add it to `ALLOWED_ORIGINS`. The app's default Worker URL is `DEFAULT_PROXY_URL` in `OnlineBrowser.tsx`; `VITE_ONLINE_PROXY_URL` overrides it (`off` disables it).
- **Remove the feature:** delete `src/online/`, `OnlineBrowser.tsx`, `src/lib/audio/aiff.ts` and `scripts/check-online.mjs`, the Online group and the code named above in `SampleBrowser.tsx`, and the `check:online` script. Then `npx wrangler@4 delete` in `workers/online-proxy` and delete that folder. The per-sample `origin`/`license` on bulk imports (App, BrowseMode, MangleMode) and the `Credit:` handling are harmless to leave.

## Known limits and traps

- **Openverse:** anonymous visitors get at most 240 results per search, and its copy of Freesound dates from May 2024.
- **Internet Archive:** a wildcard containing `/` makes its search fail. CC licenses are therefore matched as exact URLs (`ccUrls` in `archive.ts`).
- **Freesound:** the search endpoint is `/apiv2/search/` (`search/text/` was retired in Nov 2025). Downloads are 128 kbps previews. Originals come through "Get original" on freesound.org and a drop back on the panel, matched by the `<id>__user__title.ext` file name.
- **Citizen DJ:** only its segment clips (4–34 s) are listed; its ~4,000 one-shots per collection are offsets into long sprite files (`data/sampledata/`) and aren't sliced. The project promised maintenance until about 2023; if the S3 bucket goes, `check:online --live` fails on its download.
- **NASA:** hits have no duration until their file is fetched, so the length filter can't hold them back.
- **AIFF:** only uncompressed AIFF/AIFC (`NONE`, `sowt`, `twos`) converts. Compressed AIFC is refused with a message.
- **Browser storage:** `localStorage` keys `wavbuilder_online_prefs`, `wavbuilder_freesound_key` and `wavbuilder_online_budget_<id>` (namespaced through `appStorage`).
