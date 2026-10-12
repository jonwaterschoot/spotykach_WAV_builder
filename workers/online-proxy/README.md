# WAV Builder online proxy

A Cloudflare Worker that lets every WAV Builder visitor search Freesound without a key of their own. It holds WAV Builder's one Freesound API key as a secret and forwards the app's searches with it. Audio previews don't pass through it; they come straight from Freesound's CDN.

Background: [docs/sample_mangler/online-sources-plan.md](../../docs/sample_mangler/online-sources-plan.md).

## What it guards

| Guard | Where | What it stops |
| --- | --- | --- |
| Origin check | `ALLOWED_ORIGINS` in `wrangler.toml` | Other sites using your quota |
| Fixed parameters and `fields`, at most 50 results a page | `src/index.js` | Using the key for anything but search |
| 15 searches a minute per IP | `[[ratelimits]]` in `wrangler.toml` | A runaway loop or a script |
| 10 a minute, 100 a day per visitor | The app (`sharedLimits` in `src/online/providers/freesound.ts`) | One visitor eating the day |
| 60 a minute, 2000 a day for the key | Freesound itself | Everything else: past it, Freesound answers 429 and the app says "limit reached" |

A visitor who pastes their own key in the app skips the proxy and gets the full 2000 a day for themselves.

## One-time setup

You need a Cloudflare account (the one with R2 is fine) and a Freesound account.

1. **Get the Freesound key.** Sign in at <https://freesound.org/apiv2/apply> and fill in:
   - *Name:* `WAV Builder`
   - *URL:* `https://jonwaterschoot.github.io/spotykach_WAV_builder/`
   - *Callback URL:* leave empty (only used for OAuth, which this doesn't do)
   - *Description:* something like "Free browser tool for the Spotykach sampler. Search previews through a Cloudflare Worker with per-visitor limits; non-commercial."
   - Tick the terms and submit. The new row's **Client secret/Api key** column is the key. Keep it out of the repo.

2. **Log in to Cloudflare from this folder** (opens a browser once):

   ```sh
   cd workers/online-proxy
   npx wrangler@4 login
   ```

3. **Store the key as a secret** (it asks for the value; paste the key):

   ```sh
   npx wrangler@4 secret put FREESOUND_KEY
   ```

   If it asks whether to create the Worker first, say yes.

4. **Deploy:**

   ```sh
   npx wrangler@4 deploy
   ```

   It prints the Worker's URL, e.g. `https://wavbuilder-online.<your-subdomain>.workers.dev`.

5. **Check it:** open `<that URL>/health` in a browser. It should say `{"ok":true,"freesoundKey":true}`.

6. **The app already points at it.** The live URL, `https://wavbuilder-online.jonwtr.workers.dev`, is built into `src/components/OnlineBrowser.tsx` (`DEFAULT_PROXY_URL`), the same way the R2 address is built in. The URL is no secret; only the Freesound key is, and it stays in the Worker. To build against another Worker, set `VITE_ONLINE_PROXY_URL` in `.env`; set it to `off` to build without the proxy.

## Local testing

```sh
cd workers/online-proxy
echo FREESOUND_KEY=<your key> > .dev.vars      # gitignored
npx wrangler@4 dev --port 8787
```

and start the app with `VITE_ONLINE_PROXY_URL=http://localhost:8787 npm run dev`. The dev server's origin has to be in `ALLOWED_ORIGINS` (5173 and 4173 are).

## Changing things later

- **Another domain for the app:** add it to `ALLOWED_ORIGINS` and `npx wrangler@4 deploy`.
- **A new key:** `npx wrangler@4 secret put FREESOUND_KEY` again. No redeploy needed.
- **Usage:** the Cloudflare dashboard → Workers → wavbuilder-online → Metrics shows requests per day. The free plan allows 100,000 a day; Freesound's 2000 a day is the real ceiling.
- **Logs while testing:** `npx wrangler@4 tail` streams live requests.
