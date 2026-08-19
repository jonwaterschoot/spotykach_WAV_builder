# Deployment & Asset Management Guidelines

How this app gets built, where it gets published, and how asset paths resolve once it is
sitting in a subdirectory. Rewritten 2026-08-14 during v4 Phase 7; revised 2026-08-19 when the
`/next/` preview deploy and the `/v2` redirect stub were removed.

---

## 1. Builds

| Script | Base | For |
|---|---|---|
| `npm run build` | `/spotykach_WAV_builder/` | The real thing, published at the repo's Pages root. |
| `npm run build:local` | `/` | Serving `dist/` from a local static server or a custom domain root. |

`--base` on the command line overrides [`vite.config.ts`](../vite.config.ts). `tsc -b` runs
first in both, so a type error fails the build rather than shipping.

## 2. Publishing — manual, from your machine

There is no Actions workflow. **Pushing to `main` does not update the live site.** The site is
published only when you run the deploy script locally:

```bash
npm run deploy        # predeploy runs `npm run build`, then gh-pages -d dist
```

That builds into `dist/` and pushes it to the `gh-pages` branch, which is the Pages source. The
full cycle is about half a minute, so there is no such thing as a change too small to redeploy —
adding one image to a news article is the same `npm run deploy` as a release.

The usual sequence: work on a branch, `npm run build` locally to check it, merge to `main` when
it is ready, then `npm run deploy`. The merge and the deploy are separate acts on purpose — main
can be ahead of the live site, and that is fine.

> [!NOTE]
> **Deploy publishes your working tree, not `main`.** `gh-pages -d dist` ships whatever the build
> just produced, including uncommitted edits. Commit first, so what is live matches what is in git.

On Windows, if PowerShell blocks the script, use `npm.cmd run deploy`.

**Deploying is deliberately a decision, not automatic.** An Actions workflow was considered and
turned down: it would publish on every merge to `main`, push ~100 MB through CI each run, and
require switching the Pages source away from the `gh-pages` branch. For a project this size the
manual step is cheaper than the machinery.

## 3. Storage namespacing — a seatbelt, currently idle

**On the live site the namespace is empty and every storage key is unchanged.** This section is
about what would happen if a second build were ever published, not about anything running today.

GitHub Pages serves one origin per repo, so a second build at a subpath would share
`jonwaterschoot.github.io` with the real app — the same IndexedDB, including `SpotykachDB`, which
holds **live directory handles pointing at the user's real work folder and SD card**. A second
build could destroy real project state on a real disk.

[`src/utils/storageNamespace.ts`](../src/utils/storageNamespace.ts) is the single place every DB
name and localStorage key passes through. The namespace is derived once at module load:

1. `VITE_STORAGE_NS` if set at build time, else
2. the last path segment of `BASE_URL` when there is more than one — so a subpath build
   namespaces itself with no extra configuration — else
3. empty, which is the live site and dev.

**If you add a new persisted key, route it through `appStorage` or `dbName`.** That is the part
that still matters day to day: `appStorage` is also where private-mode and quota-exceeded throws
get swallowed, so a raw `localStorage.setItem` is a bug even with one build published.

A fork would not isolate anything — it is still `jonwaterschoot.github.io`, the same origin. Only
a different account or a custom domain would.

## 4. Asset path resolution

All paths go through [`src/utils/assetUtils.ts`](../src/utils/assetUtils.ts), because the app
is deployed in a subdirectory.

- **Absolute URLs** are handled as-is.
- **Samples live on Cloudflare R2**, not in the repo and not on GitHub Releases. Any path that
  isn't a known internal asset and looks like a deep path is resolved against
  `VITE_SAMPLE_ASSET_BASE_URL`, falling back to the hardcoded `R2_SAMPLE_BASE_URL`. A
  `/samples/` prefix is added when it isn't already there.
- **Internal assets** (textures, video, `manifest.json`, `presets/`, `news/`, the ffmpeg core)
  are prefixed with `import.meta.env.BASE_URL`.
- **Idempotency:** `resolveAssetPath` checks whether a path already carries the base, so it
  can be called twice without double-prefixing.

> [!IMPORTANT]
> Always use `resolveAssetPath(path)` for local assets. Never concatenate
> `` `${imgPath}${filename}` `` by hand.

If you add a new folder under `public/`, add it to `internalPaths` in `assetUtils.ts` — a deep
path that isn't listed there is treated as an R2 sample and sent to the bucket.

## 5. Deployment size

Audio is not in the bundle. Samples are fetched on demand from R2, which is what keeps the
published site well inside Pages' limits. If you find yourself adding audio to `public/`,
that is the thing to reconsider rather than the size limit.

---

## Historical notes

Kept because the reasoning still explains shapes in the code, not because any of it runs.

- **`scripts/build-versioned-pages.mjs` is gone.** It did post-build surgery on the JS chunks
  to rewrite sample paths. Three bugs it went through — a regex that only matched `^/samples/`
  and missed paths Vite had already prefixed; replacing a full path with just the leaf filename
  when the base URL was empty; and local prefixing running before external detection — are all
  now structurally impossible, because resolution happens once at runtime in `assetUtils.ts`
  instead of by rewriting built output. **External detection taking precedence over local
  prefixing is still the rule**, and is why the R2 branch comes first in `resolveAssetPath`.
- **The v1/v2 subdirectory deploys are gone.** `public/v2/index.html` was a redirect stub kept so
  old bookmarks wouldn't 404; it and its `/v2` entry in `internalPaths` were deleted
  2026-08-19, and `/v2` now 404s by choice. Legacy HTML moved into a subdirectory needed its root-relative
  `/assets/...` paths patched by hand — the reason `base` is set at build time now rather than
  assumed.
- **The `/next/` preview deploy never shipped.** v4 added `build:next` / `deploy:next` to publish a
  second build alongside the real one; the idea was dropped in favour of branch-then-merge, the
  scripts were removed 2026-08-19, and no `next/` directory was ever created on `gh-pages`. The
  namespacing in `storageNamespace.ts` is what survives it, kept as a seatbelt (section 3).
- **Samples used to live on GitHub Releases** (`samples-v1`). They are on R2 now.
