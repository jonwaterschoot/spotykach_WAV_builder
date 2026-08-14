# v4 "Pervak" — Working Plan

> **Start here.** This is the plan of record for v4. Intent, personas and user journeys live in
> [UX_Overhaul.md](UX_Overhaul.md) — that document says *why*, this one says *what, in what order,
> and what's already decided*.
>
> **Codename:** Pervak (первак) — the first run off a still, the strong opening fraction. Fitting for
> a release whose premise is separating one muddled thing into clean tiers.
> **Branch:** `v4-pervak`.
> **Lineage:** v1 = browser-cache only · v2/v3 = the current workspace + projects model ·
> v4 = the tiered split below.

---

## Status

| Phase | | What | Deliverable |
|---|---|---|---|
| 0 | ✅ | Cleanup | 1002 lines of dead code removed |
| 1 | ✅ | Mode scaffold | Four doors on a landing screen |
| 2 | ✅ | Browse mode | Linkable sample library + selection pool, zero setup |
| 3 | ☐ | Preset → SD | Cold start → curated project on the card |
| 4 | ☐ | Backup & safety rework | SD card is a build target again |
| 5 | ☐ | Config mode | MIDI setup without the studio |
| 6 | ☐ | Editor mode + Studio extraction | `App.tsx` finally broken up |

**Verdict driving all of it: restructure, don't rebuild.** The domain layer (`exportUtils`,
`importUtils`, `projectDescriptorUtils`, `lib/audio`) is already mode-agnostic, and every major panel
is already a self-contained `isOpen`/`onClose` component. The only thing enforcing "zero → full pro
setup" is the shell in `App.tsx` — one 5656-line component and one boolean gate. That is the piece
to replace.

---

## Working method

**One phase per chat.** Open a new chat and say:

> Read `V4_PERVAK.md` and do Phase N.

The phase brief tells you which appendix to read first, so no chat needs the whole document. Then:

1. Read **Status** + **Locked decisions** + your **phase brief** + the appendix it points to.
2. Do the work. Verify with `npm run build` (runs `tsc -b` first).
3. Tick the box in Status, fill in **Outcome** on the phase, commit doc + code together.

**Locked decisions are not up for re-litigation** in a phase chat — they were settled with reasoning
recorded. If one turns out wrong, say so explicitly and change it here rather than working around it.

**Notes:** each phase has an empty notes block. Add anything there before starting a phase and it
gets picked up.

---

## Locked decisions

1. **Restructure, not rebuild.** The engine stays; the shell is replaced.
2. **Three tiers.** Browse (no project) · Preset → SD (no project ownership) · Studio (today's app).
3. **Permission follows intent.** No `showDirectoryPicker` until the moment of an actual write.
   Tiers 1–2 run with zero filesystem permission.
4. **Hash routing** (`#/browse`, `#/presets`, `#/studio`). No router dependency, no Pages 404 rewrite.
5. **Tiers 1–2 never write the global IDB state slot.** See Appendix A, blocker 3.
6. **The SD card is a build target, not a backup.** All mirroring becomes opt-in. Appendix D.
7. **Persisted history is exactly two versions:** original + current. Appendix E.
8. **`App.tsx` gets broken up last** (Phase 6), after the new structure has proven itself.
9. **Nothing goes live on Pages until storage keys are namespaced.** Appendix F.

---

## Phases

### Phase 0 — Cleanup ✅

**Outcome.** Deleted `WelcomeScreen` (60), `SamplePackModal` (514), `SyncDashboard` (428) — 1002
lines, zero references between them. `tsc -b && vite build` clean. Commit `07d088a`.

Why each was safe:
- `WelcomeScreen` — no onboarding content; the explainer slides live in
  [SetupWizard.tsx:26-100](src/components/SetupWizard.tsx#L26-L100), which is kept.
- `SamplePackModal` — superseded ancestor of `SampleBrowser`, already non-functional at runtime: it
  read `SAMPLE_PACKS`, now a permanently empty array ([samplePacks.ts:92](src/data/samplePacks.ts#L92)).
- `SyncDashboard` — genuinely good design, salvaged as a written reference in Appendix D rather than
  left dead in the tree.

---

### Phase 1 — Mode scaffold ✅

**Outcome.** New `src/shell/` — `useAppMode.ts`, `HubScreen.tsx`, `ModeRouter.tsx`, `AppShell.tsx`,
`escapeStack.ts`. `main.tsx` mounts `AppShell` instead of `App`. `tsc -b && vite build` clean, eslint
clean on the new files.

- **Routing.** `useAppMode` keeps `AppMode` in sync with `window.location.hash`; `#/browse` etc. are
  linkable and back/forward move between modes. Unrecognised hashes render the hub and get rewritten
  to `#/` with `replaceState`, so the URL never lies about what's on screen.
- **Studio is now lazy.** `ModeRouter` loads `App` through `React.lazy`, so the hub no longer pays for
  it — Vite split a 355 kB `App` chunk out of the entry bundle (entry is now 9.8 kB).
- **The wizard gate moved by construction, not by editing it.** `App` simply isn't mounted until a
  studio-ish mode is entered, so `isWelcomeActive` fires on entering Studio. The gate logic at
  `App.tsx` is untouched.
- **Escape stack introduced** (`shell/escapeStack.ts`): layers register with `useEscapeLayer`, the
  newest gets Escape first, `false` falls through to the layer below. The studio's 15-flag `if` chain
  became one layer instead of its own `window` listener — same order, same behaviour, no longer the
  only claimant on the key. New surfaces register their own layer rather than extending the chain.
- **News auto-open** is now gated on a module-level `hasCheckedNewsThisSession`, so it stays
  once-per-page-load now that Studio can mount more than once.
- **Two small additions to `App.tsx` beyond the listed touches:** an optional `onExitToHub` prop, and
  the button that calls it — in the header next to the logo, and pinned above the wizard (`z-[110]`),
  since the wizard covers everything and browser-back would otherwise be the only way out.

Deliberately deferred:

- **Leaving Studio unmounts it.** Re-entering re-boots from IndexedDB and offers the handle restore,
  so nothing is lost, but permission has to be re-granted per mount. Keeping Studio alive while
  hidden would violate locked decision 5; the real fix is the `ProjectSession` extraction in Phase 6.
- **Landing default** is always the hub (open question #1 unanswered). Remembering the last mode is a
  small change inside `useAppMode` when you decide.
- `browse` / `presets` / `config` / `editor` fall through to Studio in `ModeRouter` — one line each
  for the phase that lands them.

**Read first:** Appendix A (blockers 1, 4, 5, 7) and Appendix C (target architecture).

**Goal.** `AppMode` as first-class state + hash routing + a `HubScreen`. `studio` renders exactly
today's shell, wizard included. Nothing else changes yet.

**Why now.** Everything else depends on there being a third state. Today it's a binary: wizard *or*
studio ([App.tsx:4160/4191](src/App.tsx#L4160)).

**Touches.** New `src/shell/`. `App.tsx` only where the gate lives (~4158-4191) and the news effect
([App.tsx:714-725](src/App.tsx#L714-L725)).

**Steps.**
1. `useAppMode.ts` — mode state ↔ `window.location.hash`, back/forward safe.
2. `HubScreen.tsx` — four doors. No permission prompts, no project, no `showDirectoryPicker`.
3. `ModeRouter.tsx` — mount by mode. `studio` = today's shell verbatim.
4. Move the `SetupWizard` gate so it fires on **entering Studio**, not on app boot.
5. Re-key the news auto-open off `isWelcomeActive` — it will otherwise fire on every mode entry.

**Done when.** Landing on `#/` shows the hub; `#/studio` reaches today's app unchanged, wizard and
all; browser back/forward moves between modes; three doors still lead to Studio.

**Watch out for.** The ESC handler ([App.tsx:592-684](src/App.tsx#L592-L684)) is a hand-ordered `if`
chain over ~15 boolean flags. Don't extend it — modes need a view/overlay stack, and this is the
moment to introduce one.

**Notes.**
>
>

---

### Phase 2 — Browse mode ✅  *(Persona 1)*

**Outcome.** `#/browse` is its own mode. New `modes/BrowseMode.tsx`, `utils/detachedState.ts`,
`utils/newsFeed.ts`, `components/NewsArticle.tsx`, `shell/HubNews.tsx`. `tsc -b && vite build` clean,
eslint clean on every new/changed file. Entry bundle unchanged at 10.3 kB; `BrowseMode` is a 10.7 kB
lazy chunk, `HubNews` 3.3 kB.

- **`SampleBrowser` took a `mode: 'standalone' | 'project'` prop**, and the old
  `mode: 'global' | 'slot-selection'` was renamed `selectionMode` — two orthogonal things had one
  name. `userLibrary` / `projects` / `workHandle` / `onOpenLibraryManager` are all optional now, and
  standalone hides what needs a project: the Projects source, every "send to slot/tape" target, and
  the three Library Manager entry points.
- **`buildDetachedState(samples) → AppState`** ([detachedState.ts](src/utils/detachedState.ts)) is
  pure and synchronous — no IDB, no handles, autospread in list order, overflow past 36 parked. It
  also exports `slotLabelForIndex` and `GRID_CAPACITY`, which the pool UI reads. **Phase 3's
  `hydratePreset` should return this same value**, so step 1 there is mostly done.
- **The pool decodes on the way in.** `addToPool` fetches, runs `audioEngine.loadAndProcessAudio`,
  and keeps the resulting blob in component state. Object URLs the browser minted are revoked after
  the fetch. Rows carry a thin tape-coloured bar so the 6×6 grouping reads without counting.
- **"Added" marks come from the pool, not from a one-way set.** `SampleBrowser` gained an optional
  `addedPaths` prop that Browse derives from the live pool, so a mark survives switching packs and
  clears again when the entry is removed. The sample's `path` now rides along on both import
  callbacks to make that possible. *(Bug found in review: the bulk path never marked anything at all
  — only the single-file path did. Fixed for Studio too.)*
- **Two downloads that do different things:**
  - **SD card 6×6** — `exportSDStructure` ZIP. First 36, renamed to slots, `SK/` ready to copy.
  - **The files** — `exportFilesOnly`, *all* of them, **original filenames**, no 36 ceiling, with a
    checkbox for tape-folder grouping (`keepStructure`) and a purpose-written README. The default
    `generateReadme` describes a built 6×6 card, which is exactly what this export isn't, so
    `ExportFilesOptions` gained a `readme?: string` override.
  - `exportSingleFile` per pool row, unchanged.
  Progress runs through the existing `ExportProgressModal`.
- **News moved to the hub inline** and the auto-open path, `hasCheckedNewsThisSession` and
  `spotykach_show_news_on_start` are gone. `NewsModal` survives only as the Studio header button; the
  fetch and the markdown rendering were pulled into `newsFeed.ts` + `NewsArticle.tsx` so the two
  surfaces can't drift.

Two judgement calls that deviate from the brief, both deliberate:

- **No `onConvert` on either export**, contrary to step 5. Every pooled blob has already been through
  `audioEngine.loadAndProcessAudio`, and [`encodeWAV`](src/lib/audio/wavEncoder.ts) emits *exactly*
  what `convertAudioToWav` does — 48 kHz, stereo, 32-bit IEEE float, plain 16-byte `fmt `, no `fact`.
  Passing the hook would re-encode identical bytes and make the zero-setup tier pull ~30 MB of
  ffmpeg-wasm first. Studio still passes it, because Studio's files can be anything.
- **`includeConfig: false` on the SD ZIP.** A browse visitor has expressed no device settings, so the
  ZIP would carry `getInitialState()`'s defaults and silently overwrite the `config.txt` on their
  card. Config is Phase 5's job.

**Local folders stayed in standalone.** Mounting one calls `showDirectoryPicker({ mode: 'read' })`,
which reads against locked decision 3 — but it fires only on an explicit click, which is what
"permission follows intent" means, and Appendix B lists `LocalFolderBrowser` as a Tier-1 asset. The
"Done when" still holds: packs, preview, pool and both downloads need no prompt at all.

**One Studio-side fix rode along.** `handleBulkActionWithTarget` re-found the pack in `SAMPLE_PACKS`,
so bulk actions only ever worked for built-in packs and logged *"coming soon"* for the library and
project sources. It now reads the already-resolved `selectedPack`, so those bulk-import too.

**Read first:** Appendix B (Tier 1 row).

**Goal.** `SampleBrowser` full-screen under `#/browse` with no project, a selection pool, and two
download exits.

**Touches.** `SampleBrowser.tsx` props, new `modes/BrowseMode.tsx`, `HubScreen.tsx` (news section).

**Steps.**
1. Make `userLibrary` / `projects` / `workHandle` optional; add `mode: 'standalone' | 'project'` so
   "Send to Project" actions hide when there's no project.
2. Mount full-screen rather than inside the `Rnd` draggable window used at
   [App.tsx:5228](src/App.tsx#L5228).
3. **User library shown only when non-empty, read-only** (open question 3). Load it directly with
   `loadUserLibraryFromDB()` ([persistence.ts:64](src/utils/persistence.ts#L64)) — blobs are resident
   in its own IDB store, so no work folder and no permission prompt. No upload, no delete, no
   `LibraryManager` in standalone mode; those stay in Studio.
4. **`buildDetachedState(samples) → AppState`** — the pool's payload. Autospread across the 6×6 grid,
   drag to reorder. Never assigned to the live editor, never written to the global IDB slot
   (locked decision 5). Appendix C.3 already names this shape; **Phase 3's `hydratePreset` returns the
   same thing**, so build it here and Phase 3 inherits it.
5. Two download exits off the pool, both existing code fed by that `AppState`:
   - **SK-ready files** → `exportFilesOnly` ([exportUtils.ts:824](src/utils/exportUtils.ts#L824)) —
     ZIP, `keepStructure`, plus the `onConvert` hardware-conversion hook.
   - **SD-ready 6×6** → `exportSDStructure` ([exportUtils.ts:545](src/utils/exportUtils.ts#L545)).
   Single-file/single-tape downloads keep using `exportSingleFile` / `exportSingleTape`.
6. Hub news section (open question 1): news renders **beneath the doors on the hub**, not as a
   covering modal. Delete the `NewsModal` auto-open path and its `hasCheckedNewsThisSession` gate
   ([App.tsx:714-725](src/App.tsx#L714-L725)) along with the `spotykach_show_news_on_start`
   preference, rather than maintaining both routes.

**Done when.** A cold visitor can browse packs, preview, pool a selection, and download it in either
format without a single permission prompt; `#/browse` is shareable; the hub shows news inline.

**Deliberately out of scope** (Phase 6 — see its steps): "import into project" and "single-file edit
before download". Both cross into project ownership or the editor.

**Settled going in:** open questions 1, 3 and 5 — no calls left to make in this phase.

**Notes.**
> **Bulk download & scraping — no new exposure, and Cloudflare is the wrong layer to worry at.**
> Raised when Browse made pooling a whole pack one click. Nothing changed: `public/manifest.json`
> already lists every sample URL in plain text, the packs are published as free downloads, and
> `PresetsPanel` / the pack page already offer whole-ZIP links. Anyone wanting the lot would `curl`
> the manifest, not drive the UI. Cloudflare in front of R2 gives rate limiting and bot management if
> the rules are switched on, which caps abusive volume — it cannot make public URLs unscrapeable, and
> hotlink protection would break the app's own `mode: 'cors'` fetches. Treat it as a **licensing**
> question (the pack `license` string travels with every export and into the loose README) rather
> than a technical one. Only revisit if egress cost actually shows up.
>
> **Filename case needs no work.** SD writes are uppercase `${slot.id}.WAV`
> ([exportUtils.ts:629](src/utils/exportUtils.ts#L629), [790](src/utils/exportUtils.ts#L790),
> [922](src/utils/exportUtils.ts#L922)); single-file downloads are lowercase `.wav`
> ([exportUtils.ts:944](src/utils/exportUtils.ts#L944)). Recent SK firmware accepts both, so this is
> already correct in both places — don't "fix" it.
>

---

### Phase 3 — Preset → SD ☐  *(the headline flow)*

**Read first:** Appendix B (Tier 2 row) — both halves already exist.

**Goal.** Cold start → curated project on the SD card, with no work folder and no project created.

**Touches.** `handleLoadPreset` ([App.tsx:1238](src/App.tsx#L1238)), `PresetsPanel.tsx`.

**Steps.**
1. Split `handleLoadPreset` into three: `hydratePreset(entry) → AppState`,
   `adoptAsProject(state)` (today's behaviour, Tier 3), `writeToSD(state, sdHandle)` (new, Tier 2).
2. Add "Write to SD" to `PresetsPanel` beside "Load into App" / "SD ZIP".
3. `writeToSD` is a thin call into `exportSDStructure({ directWrite: true })` — it already takes a
   `destinationHandle` or opens its own picker
   ([exportUtils.ts:548-567](src/utils/exportUtils.ts#L548-L567)), and needs only `AppState`.

**Done when.** From a fresh browser profile: open app → presets → pick one → choose SD card → done.
No work folder, no project name, nothing written to the global IDB slot.

**Settled going in:** open question 2 — **always hydrate for card writes.** The prebuilt
`sdExportUrl` ZIP stays what it is today, a manual download link in `PresetsPanel`. Reasons: it is a
*download*, not a write, so using it would mean fetch → unzip (jszip is available) → write through
the SD handle, i.e. a second writer to maintain; a stale ZIP would silently produce a card that
differs from what the app builds; and once presets can be user-authored (open question 6) most
presets won't have one at all, so ZIP-first would only sometimes apply. Revisit only if hydration
measurably drags.

**Reuse note.** Phase 2 landed
[`buildDetachedState(samples) → AppState`](src/utils/detachedState.ts) — pure, synchronous, no IDB,
autospread across the 6×6 grid. `hydratePreset(entry)` should end in a call to it and hand the result
to the same `exportSDStructure`, so step 1 is mostly a matter of pulling the fetch-and-decode half out
of `handleLoadPreset`.

**Notes.**
>
>

---

### Phase 4 — Backup & safety rework ☐

**Read first:** Appendix D in full.

**Goal.** The SD card stops being a backup mirror. Builds stop copying 36 WAVs. Durability handled
where the risk actually is.

**Why here and not later.** Tier 2 has no work folder, so "mirror against the local copy" is
undefined in that mode. The assumption has to go before the tiers can be trusted.

**Steps.**
1. Rename `backupHandle` → `sdHandle` throughout (49 refs in `App.tsx`). Mechanical, no behaviour
   change.
2. Default `_sk_backups` off; opt-in per build.
3. Make SD-as-project-mirror an explicit setting, default off.
4. Atomic writes in [`safeWriteBlob`](src/utils/exportUtils.ts#L93) — temp name, swap on close.
5. Keep the SD **read** path for migration: "found N projects on this card, import them?"

**Done when.** A build with defaults writes only `SK/`, and an interrupted write can't destroy an
existing file.

**Notes.**
>
>

---

### Phase 5 — Config mode ☐  *(Persona 2)*

**Read first:** Appendix B (cross-tier section).

**Goal.** MIDI/device setup against a bare SD handle, no project, no studio.

**Touches.** `ConfigModal.tsx`, new `modes/ConfigMode.tsx`.

**Steps.**
1. Accept a null project — hold a `ProjectConfig` in local state.
2. `config.txt` import/export against a bare SD handle, via the existing pure functions
   `generateConfigText` / `parseConfigText`
   ([exportUtils.ts:35](src/utils/exportUtils.ts#L35), [exportUtils.ts:1445](src/utils/exportUtils.ts#L1445)).
3. With an SD handle present, offer to load the card's existing `config.txt`. With no workspace at
   all, just show the settings and offer a plain `config.txt` download — permission-free, consistent
   with Tiers 1–2.
4. **Preserve unknown key/value pairs on round-trip.** See the note below — this is the one real code
   change open question 4 implies.
5. Per-project config stays available in Studio. `spotykach_config_presets` (localStorage) already
   exists and is the natural mechanism — a project's config is a *saved preset you can apply*, while
   the file on the card is the device's truth.

**Settled going in:** open question 4 — device-scoped by default, per-project still allowed.

**Notes.**
> **The parser is strictly positional — a comment line would break it.** `parseConfigText`
> ([exportUtils.ts:1445](src/utils/exportUtils.ts#L1445)) drops blank lines and then walks two-line
> pairs (`i += 2`). A single stray line shifts every pair after it and the whole file misparses. So
> writing the project title as a comment is not safe; write it as a normal 8-char key + value pair —
> unknown keys are skipped harmlessly *because* they still consume two lines. The ask to the hardware
> developer is therefore the smaller one: **"does the device tolerate an unknown key/value pair?"**,
> not "please ignore a comment".
>
> **Round-tripping currently deletes fields we don't know.** `parseConfigText` returns a fixed
> five-field `ProjectConfig` and `generateConfigText` writes exactly those five
> ([exportUtils.ts:35](src/utils/exportUtils.ts#L35)). Since the field set is expected to grow, a
> `config.txt` written by newer firmware would come back stripped. Carry unrecognised pairs through
> untouched before this phase ships.

---

### Phase 6 — Editor mode + Studio extraction ☐  *(Persona 3, largest)*

**Read first:** Appendix E, then Appendix C §state separation.

**Goal.** Single-file editing without a project, and `App.tsx` finally broken up.

**Steps.**
1. Decouple `WaveformEditor` (4722 lines) from the on-disk project — `EditorSlot`, the version
   sidebar and the cleanup panel all assume one. Props are already file-shaped, so this is viable.
2. "Save as new project" as the upgrade path out of editor mode.
3. Implement the two-version rule (Appendix E) — collapse `versions[]` on save.
4. Extract `App.tsx` state into `session/ProjectSession.tsx`.
5. Cleanup becomes its own surface, out of the editor sidebar (per
   [UX_Overhaul.md](UX_Overhaul.md) §"Other UX thoughts").
6. **The two tier-crossing exits deferred from Phase 2** (open question 5), both of which need
   `ProjectSession` to exist first:
   - **"Import into project" from the Browse pool.** Needs a work folder chosen mid-flow with the
     selection surviving the permission prompt. The "temporary project in browser cache, save later"
     variant needs its *own* IDB slot — writing the global one violates locked decision 5.
   - **Single-file edit before download.** Editor mode opened on one pooled file, download as the
     only exit, plus a button to carry the edited file into a project.

**Notes.**
>
>

---

## Open questions

Questions 1–5 are **answered and folded into the phase briefs** — a phase chat reads its own brief and
doesn't need this section. Kept here for the reasoning. Question 6 is open.

1. **Landing default.** Hub for everyone, or remember the last mode and skip it on return?
   *Recommendation: hub on first visit, remembered mode after, hub always one click away.*
   → **Answer:** ✅
  - always hub by default, for everyone
  - hub can also become home of the news section, but displayed beneath the hub options instead as a covering modal on top.

   **Settled.** Always hub — which is already `useAppMode`'s behaviour, so no routing code changes.
   News moves inline onto the hub in **Phase 2**, and the modal auto-open path plus the
   `spotykach_show_news_on_start` preference get deleted rather than kept as a second route.

2. **Preset → SD without hydrating.** For presets with `sdExportUrl`, the prebuilt ZIP is far cheaper
   than hydrating 36 blobs and re-writing them. Prefer the ZIP when available, fall back to
   hydrate+write?
   → **Answer:** ✅
   - This implies also the conclusive way to save presets. 
     - building presets should be as simple as possible so that it might also become the way for external artists to build a preset, as well as allow users to create a shareable project containing their own samples.
     - we currently already have a way to handle this; should it be simplified, where are users able to create presets.
       - e.g. an external artist might be someone who needs more the import 36 files, rearrnage, add their info for the sample browser, and then the option to add tape names, and notes.
       - whereas regular users might prefer to take one of their projects and export that.
       - we could also "force" artists that want to submit sample packs and / or project presets to use the full app. Or make a fully separate page that uses specific fields to fill in per file, and leave room for the additional info.   

   **Settled, for the narrow question:** **always hydrate** for card writes; the ZIP stays a manual
   download. Reasoning in the Phase 3 brief — and the authoring answer above *supports* it, since
   user-authored presets won't have an `sdExportUrl` at all, making ZIP-first a path that only
   sometimes exists. **The authoring half moved to question 6**, since no phase covers it.

3. **Does Browse include the user library?** It's IDB-backed and project-independent, so it *can* be
   there — but it may muddy a "just show me the packs" tier.
   → **Answer:** ✅
   - including user library would need a local workspace / folder, wheras just browsing and downloading would just point to default download location, nothing else.
   - when a user has made projects before and hence already has a local workspace setup but chooses to go to the sample browser via the hub and a local library is present, we'd probably need to either include it, or tell them to go to the full app. Feels like we should include if it exists. Hence decision lands on: "Library shown only when non-empty."

   **Settled: shown when non-empty** — and it's cheaper than the answer assumes. The library needs
   **no workspace folder**: `UserLibrary` is `files: Record<string, FileRecord>`
   ([types.ts:59](src/types.ts#L59)) with blobs resident in its own `user-library` IDB store, separate
   from the `app-state` slot that locked decision 5 protects. Browse can list, preview and download
   from it with zero permission prompts. Read-only in standalone mode — upload/delete/`LibraryManager`
   stay in Studio, or Browse gains a write path into IDB.

4. **Config scope.** Device-level by default *(recommended)* or per-project?
   → **Answer:** ✅
   - if a project folder with SD card has been setup, we can ask the user to load that file, 
   - if no workspace has been setup, we just offer the settings and the download
   - in projects we still allow a per project config.txt, maybe we can write the title of the project into the txt file, I don't think it'll obstruct the reading on the hardware, and else we can ask the developer to add this as a comment to ignore on device.
   - we are expecting to get additional options in this file, so the amount of setable fields will grow.

   **Settled: device-scoped, per-project still allowed.** Two code facts shape the implementation,
   both written up in the Phase 5 notes: the parser is strictly positional so **the project title must
   be a key/value pair, not a comment**, and **unknown keys are currently dropped on round-trip** —
   which matters precisely because the field set is expected to grow. Open sub-point, low stakes: when
   a card's `config.txt` and a project's config disagree on build, the card is proposed as the
   device's truth and the project's config as an applicable preset.

5. **Tier upgrade prompts.** When a Tier-1 user selects 36 files, offer "make this a project"
   inline, or keep tiers strictly separate?
   → **Answer:** ✅
   - when in simple sample browser and user is selecting multiple files, we should keep a list or pool of added files, with an option to do:
     - **download -> as SK ready files** - ("big" change since a not so recent SK firmware update, it now also accepts small caps .wav and not just .WAV, file format still stands only extension has been added)
     - **download -> as SK SD Ready formatting** (autospread over 6x6 slots, with option to drag in list)
     - **import into project** -> will need the setup of local folder if none exists, needs to remeber the selected file after apointing the local folder, or we could make a temporary project in browser cache with option to save?
     - **Single file edit before download** -> open editor with only the option to download in editor a button could be used to allow taking the edited file into a project

   **Settled, split across two phases.** The pool and both **download** exits are Phase 2 — they're
   nearly free, because `exportFilesOnly` ([exportUtils.ts:824](src/utils/exportUtils.ts#L824)) and
   `exportSDStructure` ([exportUtils.ts:545](src/utils/exportUtils.ts#L545)) already do the work and
   only need an `AppState`. That shared requirement is the unlock: Phase 2 builds
   `buildDetachedState(samples)`, and Phase 3's `hydratePreset` returns the same thing.
   **"Import into project" and "single-file edit" move to Phase 6** — the first needs a work folder
   mid-flow (and its "temp project in cache" variant would need its own IDB slot to stay inside locked
   decision 5), the second needs `WaveformEditor` decoupled from the on-disk project.

6. **Preset & pack authoring — who makes them, and where?** *(new, from the answer to 2)* Presets
   should be simple enough that external artists can build one and users can turn their own samples
   into a shareable project. Three shapes were floated: force authors through the full app; extend
   Studio with a "export project as preset" path; or a dedicated authoring surface with per-file
   metadata fields plus tape names, notes and pack info.
   **Constraint to design around:** `manifest.json` is generated by `scripts/generate-manifest.mjs`,
   a repo-side script — so today "publishing" is a commit, not an upload. Without a backend, any
   authoring surface ends in a **submission bundle you commit**, not self-publishing. Sub-questions:
   what's the artist's minimum metadata set; do user-authored presets stay local/shareable-as-a-file
   or aim for the public manifest; and does authoring justify its own surface or ride on Studio's
   existing export?
   *Not blocking any current phase.* Decide before committing to a Phase 7.
   → **Answer:**


---
---

# Appendices — reference

## Appendix A — Entry flow & structural blockers

### A.1 What the entry flow does today

| Step | Where | Behaviour |
|---|---|---|
| App boots | [App.tsx:180](src/App.tsx#L180) | `isWelcomeActive = true` |
| Gate | [App.tsx:4160](src/App.tsx#L4160) | `isWelcomeActive && !workHandle` → `SetupWizard` full-screen, `z-[100]`. **Nothing else can render.** |
| Wizard | [SetupWizard.tsx:17](src/components/SetupWizard.tsx#L17) | `INTRO → EXPLAINER (5 slides) → SELECT_WORK → SELECT_BACKUP → PROJECT_TITLE` |
| Completion | [App.tsx:4162-4180](src/App.tsx#L4162-L4180) | Sets handles → `saveDirectoryHandle` → `handleSmartScan` → creates a project or opens Project Manager |
| Escape hatch | [App.tsx:4181](src/App.tsx#L4181) | `onSkip` → raw `window.confirm` → "browser cache mode". Undocumented, unbranded, still lands in the full pro workspace. |
| Main shell | [App.tsx:4191](src/App.tsx#L4191) | `TapeSelector` + header + `FileBrowser` + 6×6 grid — all assume a loaded project |

One door, demanding a work folder + SD card + project name before you see anything. Everything else
lives behind it as an overlay.

### A.2 Blockers, in rough order of severity

1. **The boolean gate.** [App.tsx:4160/4191](src/App.tsx#L4160) — wizard *or* studio, no third state.
2. **Monolithic shell.** 5656 lines, ~60 `useState`. Every handler is a closure inside the studio
   component; a browse-only mode can't reach `handleSampleImport` without the whole file.
3. **Global single-slot persistence.** [persistence.ts:36](src/utils/persistence.ts#L36) autosaves one
   `AppState`; [App.tsx:1212-1224](src/App.tsx#L1212-L1224) flags *any* state change as unsaved. A
   Tier-1/2 session touching `state` pollutes the studio's autosave and raises phantom warnings.
4. **Manual modal z-stack.** [App.tsx:592-684](src/App.tsx#L592-L684) — hand-ordered `if` chain over
   ~15 flags. Adding modes multiplies it.
5. **No routing.** No router dep; `base: '/spotykach_WAV_builder/'`. Deep links impossible, and
   shareable links are the point of a public browse tier.
6. **Permission demanded too early.** `showDirectoryPicker` fires at wizard step 3, before the user
   has seen anything.
7. **News modal auto-opens** keyed on `isWelcomeActive`
   ([App.tsx:714-725](src/App.tsx#L714-L725)) — will fire on every mode entry once the gate changes.

---

## Appendix B — Component inventory

### Tier 1: Browse — ~80% exists, wrong container

| Asset | Lines | State |
|---|---|---|
| [SampleBrowser.tsx](src/components/SampleBrowser.tsx) | 1193 | Remote packs, user library, project sources, custom folders, preview player, multi-select, bulk actions. **Recyclable core.** |
| [samplePacks.ts](src/data/samplePacks.ts) | 92 | `fetchSampleManifest()` — packs + presets from `public/manifest.json`. Zero project coupling. |
| [LocalFolderBrowser.tsx](src/components/LocalFolderBrowser.tsx) | 859 | OS folder tree. Needs a handle, not a project. |
| [exportSingleFile / exportSingleTape](src/utils/exportUtils.ts#L906) | — | Already download without touching a project. |

### Tier 2: Preset → SD — both halves already work

- [PresetsPanel.tsx](src/components/PresetsPanel.tsx) renders preset cards with cover art, pack
  badges, progress, and an "SD ZIP" download when `sdExportUrl` is set
  ([PresetsPanel.tsx:216](src/components/PresetsPanel.tsx#L216)).
- [exportSDStructure](src/utils/exportUtils.ts#L545) supports `directWrite` with a supplied
  `destinationHandle` **or its own picker**. Needs `AppState` + options — not a work folder, not a
  project name.

The blocker is `handleLoadPreset` ([App.tsx:1238](src/App.tsx#L1238)), which fuses five things:
fetch descriptor → hydrate blobs → dedupe name against `foundProjects` → write a local project →
adopt as current. The last three are Tier-3 concerns forced on a Tier-2 user.

### Tier 3: Studio

`App.tsx` shell, `TapeSelector`, `SlotGrid`/`SlotGrid6x6`/`AllViewGrid`, `FileBrowser`,
`ProjectManager`, `WaveformEditor`, sync/export modals. Keep all of it — extraction, not redesign.

### Cross-tier

- **`ConfigModal`** (461) takes `config`, `projects`, `currentProjectName`, `workHandle`, `sdHandle`,
  and reads/writes `config.txt` through two pure functions on `ProjectConfig`. Standalone config mode
  is nearly free.
- **`WaveformEditor`** (4722) is the hard one. Props are already file-shaped (`slot`, `versions`,
  `activeVersionId`, `onSave`), so single-file mode is viable — but `EditorSlot`, the version sidebar
  and the cleanup panel assume a project on disk. Phase 6.

### Verdict table

| Component | Verdict | Work needed |
|---|---|---|
| `exportUtils`, `importUtils`, `projectDescriptorUtils`, `lib/audio`, `persistence`, `storageUtils` | **Recycle as-is** | None. Already mode-agnostic. |
| `samplePacks.ts`, `assetUtils` | **Recycle as-is** | None. |
| `SampleBrowser` | **Recycle, loosen props** | Optional project props + `mode: 'standalone' \| 'project'`. |
| `PresetsPanel` | **Recycle, extend** | Add "Write to SD card". Promote from modal to view. |
| `ConfigModal` | **Refactor** | Accept null project; `config.txt` I/O against a bare SD handle. |
| `ProjectManager`, `SlotGrid*`, `TapeSelector`, `FileBrowser`, `AllViewGrid` | **Recycle in Studio** | Unchanged, just no longer the only shell. |
| `LibraryManager` | **Recycle, promote** | Largely project-independent already. |
| `WaveformEditor` | **Refactor in Phase 6** | Decouple `EditorSlot` + history sidebar from on-disk project. |
| `SetupWizard` | **Demote** | Keep the 5 explainer slides (good, reusable as in-context help). No longer the mandatory gate — Studio onboarding only. |
| `WelcomeScreen`, `SamplePackModal`, `SyncDashboard` | ✅ **Deleted** | Phase 0, commit `07d088a`. |

---

## Appendix C — Target architecture

### C.1 Mode as first-class state

```ts
type AppMode = 'hub' | 'browse' | 'presets' | 'config' | 'editor' | 'studio';
```

- `hub` — landing screen. Four doors, no permission prompts, no project.
- Each mode owns its shell. Only `studio` mounts the TapeSelector + grid.
- Mode ↔ URL hash, so `#/browse` and `#/presets` are shareable.

### C.2 Capability model, replacing "is the wizard done?"

| Capability | Needed by | Requested when |
|---|---|---|
| none | Browse (remote packs), Presets (preview) | never |
| SD write handle | Preset → SD, Config → SD | at the moment of writing |
| Work folder handle | Studio | on entering Studio |
| Both + project | Studio full sync | on first sync |

This is the single change that makes Tiers 1–2 possible: **permission follows intent.**

### C.3 State separation

- Extract a `ProjectSession` (state + handles + dirty tracking + project handlers) that only Studio
  mounts. Tiers 1–2 run without it and therefore *cannot* touch the global IDB slot.
- `hydratePreset()` returns a detached `AppState` used as a payload for SD writing — never assigned
  to the live editor unless explicitly adopted.

### C.4 File layout

```
src/
  shell/        AppShell.tsx, ModeRouter.tsx, useAppMode.ts, HubScreen.tsx, escapeStack.ts
  modes/        BrowseMode.tsx, PresetsMode.tsx, ConfigMode.tsx, EditorMode.tsx, StudioMode.tsx
  session/      ProjectSession.tsx   (the extracted App.tsx state + handlers)
  components/   (unchanged — now consumed by modes)
```

---

## Appendix D — Backup & durability

### D.1 Three different things are called "backup"

The root of the confusion, and why the flow feels heavy.

| # | What it is | Where | Cost |
|---|---|---|---|
| 1 | **`backupHandle` — which is just the SD card** | 49 refs in `App.tsx`; the UI that creates it says "Connect SD Card" ([SetupWizard.tsx:394](src/components/SetupWizard.tsx#L394)) | Pure naming confusion. The card is a *build target*. |
| 2 | **Projects mirrored onto the SD card** | [`scanProjects(local, backup)`](src/App.tsx#L1836) scans both, merges by name, tags `status: 'synced'\|'local'\|'backup'\|'modified'` + `.local`/`.backup` ([types.ts:111-113](src/types.ts#L111-L113)) | `ProjectSyncModal` (497) + `projectSyncUtils` (404) + `LibrarySyncModal` (501) + `calculateSyncDiff`/`applySyncDiff` exist to service this duality. |
| 3 | **`_sk_backups/` snapshots** | [App.tsx:296-337](src/App.tsx#L296-L337) — recursive copy of the whole SK folder into `Projects/<name>/_sk_backups/<timestamp>/`, rotating at 5 | Up to 36 WAVs copied *per build*, five deep. The "makes the process take longer" complaint, literally. |

### D.2 What stays basic — always available, no configuration

- Copy a **preset project to the SD card** (Tier 2)
- **Create or open a project from a preset**
- **Open an existing project**

Nothing there needs a mirror, a diff, or a snapshot.

### D.3 Target model

- **#1 → rename.** `backupHandle` → `sdHandle`. Mechanical; removes the app's own claim that the
  card is a backup.
- **#3 → default off**, opt-in per build. Already gated by `options.backupSKToProject`.
- **#2 → explicit opt-in.** "Also keep a copy of projects on the SD card", default off. With it off,
  `scanProjects` collapses to one source and the `status`/`.local`/`.backup` machinery evaporates.
- **Backup location is the user's choice** — an explicit action to a folder they pick, not an
  implicit consequence of having connected an SD card.

**Migration:** existing users have real projects on their cards. Keep the *read* path — "found N
projects on this card, import them?" — and drop only the automatic bidirectional mirror.

> **Design reference for the SD-import compare view.** The deleted `SyncDashboard.tsx` is the best
> App ↔ SD comparison in the repo's history, better than the current `ProjectSyncModal` +
> `SyncComparisonTable` path: per-slot rows with local and remote side by side, inline preview
> players on *both* sides, staged `PUSH`/`PULL`/`DELETE` with a pending count, single commit button.
> Start from it rather than from scratch:
>
> ```bash
> git show 72c2893:src/components/SyncDashboard.tsx
> ```
>
> It was written against the full bidirectional `SyncDiff` model. Under D.3 the SD becomes a build
> target, so the view is needed for **import only** — the `PUSH` column and the "move overwritten
> files to Pool" footer largely fall away.

### D.4 The actual data-loss risks

Mirroring exists to prevent losing work. It's an expensive, indirect answer. The two real risks have
targeted fixes:

**Interrupted writes.** `createWritable()` truncates the target the moment it opens, so an
interrupted or crashed write leaves a zero-length or partial file — the original is already gone.
Five SK snapshots don't help, because the file being destroyed is in `Assets/`, not `SK/`.
*Fix:* write to a temp name, swap on successful close. Highest-value durability change in the
codebase, and it's local to [`safeWriteBlob`](src/utils/exportUtils.ts#L93).

> Worth fixing while in there: `safeWriteBlob` skips the write when the existing file's **size**
> matches the new blob's ([exportUtils.ts:98](src/utils/exportUtils.ts#L98)). Two different WAVs of
> identical byte length are silently treated as identical. Harmless for `Assets/<versionId>.wav`
> (unique id per version, never rewritten with different content), potentially wrong for SD sync.

**A bad app update.** *Fix:* version the `project.json` schema and snapshot once on migration — not
continuous mirroring on every build.

---

## Appendix E — Version history

### E.1 How it works now

- Every edit appends to `FileRecord.versions[]` and becomes the new `currentVersionId`
  ([App.tsx:1983](src/App.tsx#L1983)). **Unbounded.**
- On save, every version's blob is written as its own `Assets/<versionId>.wav`
  ([exportUtils.ts:1108-1130](src/utils/exportUtils.ts#L1108-L1130)).
- All version blobs stay resident in `state.files[].versions[].blob`, and the whole `AppState` is
  autosaved to IndexedDB ([persistence.ts:36](src/utils/persistence.ts#L36)).

History depth multiplies **disk × memory × IDB** simultaneously. `CleanupModal` (766 lines) exists to
dig out from under this after the fact.

### E.2 v4 decision: original + current, nothing else

**Persisted history is exactly two versions per file:** the original (`versions[0]`) and the current
(`currentVersionId`). Everything between is dropped on save.

- Keep destructive bouncing — it *is* right for real audio processing.
- The editor may keep deeper undo **in session memory**; none of it is persisted.
- On save, collapse `versions[]` to `[original, current]` (a no-op when they're the same record).
  Reopening a project gives the file as saved, with no history.
- **Cleanup stops being a rescue operation** — the mess no longer accumulates by default.

Simpler than an N-step limit, and it removes the "how many steps?" setting entirely. The safety story
is "you can always get back to the original", which is what users actually want here.

### E.3 Why a sidecar model isn't a small step

`AudioVersion.processing[]` is a **flat set of tags on a whole version** — `'normalized' | 'trimmed' |
'looped' | 'eq' | 'limited' | 'cut' | 'sliced'` ([types.ts:20](src/types.ts#L20)). No parameters, no
time ranges, no ordering. `processing: ['normalized', 'cut']` can't reconstruct anything: it doesn't
say by how much, where, or in which order.

A real non-destructive model needs an **ordered op log**, each entry carrying at minimum:

- `type` — the operation
- `params` — gain in dB, fade curve and length, EQ bands, crossfade, limiter threshold…
- `range` — `{ start, end }` in seconds, since edits apply to *parts* of a file and stack on
  different regions
- `order` / `timestamp` — so overlapping edits on different regions resolve deterministically

A different data model, not an extension. Two details show its shape:
`WavMetadata.slicePoints: number[]` ([types.ts:51](src/types.ts#L51)) is already parameter-level
data, and slicing fans out to *multiple* files rather than one derived blob — so the log isn't a pure
linear chain either.

**Not a v4 goal.** Capturing op parameters opportunistically during Phase 6 is a free head start, but
it must not shape v4's design, and E.2 stands regardless.

---

## Appendix F — Testing & deployment

### F.1 Local — the only environment until v4 is stable

Two branches side by side, via worktree:

```bash
git worktree add ../spotykach-ux v4-pervak
cd ../spotykach-ux && npm install
npm run dev -- --port 5174
```

**Port is part of the origin**, so `localhost:5173` and `localhost:5174` get separate IndexedDB
automatically. Locally you're isolated for free.

### F.2 GitHub Pages — one publication source per repo

Two branches **cannot** each publish to their own URL. The old v1/v2 setup wasn't two branches — it
was one `gh-pages` branch with subfolders, and that still works:

```json
"build:next":  "tsc -b && vite build --base=/spotykach_WAV_builder/next/",
"deploy:next": "npm run build:next && gh-pages -d dist --dest next"
```

`--base` on the CLI overrides [vite.config.ts:13](vite.config.ts#L13), same as the existing
`build:local`. Verified in the installed source: the delete glob runs with `cwd` set to the
destination ([lib/index.js:183-186](node_modules/gh-pages/lib/index.js#L183-L186)), so `--dest next`
only clears `next/`.

> **The trap runs the other way.** Deploying main at root uses the default `remove: '.'` at branch
> root, which wipes everything **including `next/`**. If you redeploy stable while a preview is live,
> redeploy `next` afterwards.

### F.3 The blocker before anything goes live (locked decision 9)

Root and `/next/` are **the same origin**, so both builds read and write the same storage:

- `spotykach-wav-builder` — app state, user library, custom folders
  ([persistence.ts:4](src/utils/persistence.ts#L4))
- `SpotykachDB` — **saved directory handles**, pointing at the real work folder and SD card
  ([storageUtils.ts:2](src/utils/storageUtils.ts#L2))
- localStorage: `spotykach_state`, `spotykach_current_project`, `spotykach_user_library`,
  `spotykach_visual_filters`, `spotykach_config_presets`, `spotykach_custom_presets`,
  `spotykach_show_news_on_start`, `spotykach_emptySlotPreferredBrowser`

Since v4 deliberately changes persistence, a preview build could clobber real project state with live
filesystem handles attached. **Namespace the DB names and key prefix before any Pages deploy.** A
fork wouldn't help — it's still `jonwaterschoot.github.io`, same origin. Only a different account or
a custom domain would isolate it.

### F.4 Stale documentation

[docs/deployment_guidelines.md](docs/deployment_guidelines.md) describes
`scripts/build-versioned-pages.mjs` at length. **That script no longer exists** — `scripts/` holds
only `generate-manifest.mjs`, `normalize.py`, `collect-release-samples.ps1`. And
[public/v2/index.html](public/v2/index.html) is now just a redirect stub to root. Worth correcting
when Pages deployment comes back into play.
