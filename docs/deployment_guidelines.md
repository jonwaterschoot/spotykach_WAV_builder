# Deployment & Asset Management Guidelines

How this app gets built, where it gets published, and how asset paths resolve once it is
sitting in a subdirectory. Rewritten 2026-08-14 during v4 Phase 7 — the previous version
documented `scripts/build-versioned-pages.mjs`, a build step that no longer exists, and a
sample host the app stopped using.

---

## 1. Builds

| Script | Base | For |
|---|---|---|
| `npm run build` | `/spotykach_WAV_builder/` | The real thing, published at the repo's Pages root. |
| `npm run build:local` | `/` | Serving `dist/` from a local static server or a custom domain root. |
| `npm run build:next` | `/spotykach_WAV_builder/next/` | A preview build, published alongside the real one. |

`--base` on the command line overrides [`vite.config.ts`](../vite.config.ts). `tsc -b` runs
first in all three, so a type error fails the build rather than shipping.

## 2. Publishing — one Pages source, subfolders inside it

Two branches **cannot** each publish to their own URL. The old v1/v2 setup was never two
branches; it was one `gh-pages` branch with subfolders, and that still works:

```bash
npm run deploy        # root
npm run deploy:next   # -> gh-pages/next/
```

`gh-pages -d dist --dest next` runs its delete glob with `cwd` set to the destination, so
`--dest next` only clears `next/`.

> [!IMPORTANT]
> **The trap runs the other way.** Deploying to root uses the default `remove: '.'` at the
> branch root, which wipes everything **including `next/`**. If you redeploy the stable app
> while a preview is live, redeploy `next` afterwards.

## 3. Storage namespacing — required, not optional

Root and `/next/` are **the same origin**, so without this both builds would read and write
the same IndexedDB — including `SpotykachDB`, which holds **live directory handles pointing at
the user's real work folder and SD card**. A preview build could destroy real project state on
a real disk.

[`src/utils/storageNamespace.ts`](../src/utils/storageNamespace.ts) is the single place every
DB name and localStorage key passes through. The namespace is derived once at module load:

1. `VITE_STORAGE_NS` if set at build time, else
2. the last path segment of `BASE_URL` when there is more than one — so
   `/spotykach_WAV_builder/next/` yields `next` with no extra configuration — else
3. empty.

An empty namespace leaves every name exactly as it was, which is the point: the production
build must keep reading the storage existing users already have. Only the preview moves, to
`SpotykachDB--next` and `next:spotykach_state`.

**If you add a new persisted key, route it through `appStorage` or `dbName`.** A raw
`localStorage.setItem` is a preview build reaching into production data.

A fork would not help — it is still `jonwaterschoot.github.io`, the same origin. Only a
different account or a custom domain isolates it.

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
- **The v1/v2 subdirectory deploys are retired.** [`public/v2/index.html`](../public/v2/index.html)
  is a redirect stub to the root and exists only so old links don't 404; `/v2` stays in
  `internalPaths` for the same reason. Legacy HTML moved into a subdirectory needed its
  root-relative `/assets/...` paths patched by hand — the reason `base` is set at build time
  now rather than assumed.
- **Samples used to live on GitHub Releases** (`samples-v1`). They are on R2 now.
