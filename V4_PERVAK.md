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

## Open items — everything still on the table

*Added 2026-08-14, after Phase 6. Extracted from the six phase outcomes, the appendices,
[UX_Overhaul.md](UX_Overhaul.md) and [roadmap-bugs.md](roadmap-bugs.md). This section is the one place
that says what is **not** done; the phase briefs below say what is.*

### Blocking a v4 release

| # | Item | Source | Where it lands |
|---|---|---|---|
| A | ~~**Storage keys are not namespaced.**~~ ✅ **Done 2026-08-14.** `utils/storageNamespace.ts` is the one place every DB name and localStorage key passes through. Root derives `''` and stays byte-identical for existing users; `/next/` derives `next`. `build:next` / `deploy:next` added. Verified against both bundles. | Locked decision 9, Appendix F.3 | Done |
| B | **What Phases 4–7 built has been verified in a browser everywhere except Studio.** Types, build and lint are clean; four of the five doors are now walked as well — see C. What is unverified is what only Studio does, plus the hardware paths listed under it. | Phase 4, 5, 6, 7 outcomes | Phase 7, step 6 — **the only work left** |
| C | ◐ **The functional pass over the five doors is four-fifths done.** **Browse, Preset → SD, Device Config and Edit One File are each verified on a desktop** (2026-08-14 → 17), which raised and closed 18 numbered findings between them — 15 in Browse, plus P1-1, C1-1 and D1-1; Edit One File raised none — logged in [roadmap-bugs.md](roadmap-bugs.md) ▸ *The v4 test pass*. **Studio has not been walked**, it is the door the other four changed things inside, and the editor's known bugs are still unassessed — they are all project-shaped, so they surface there. | New, this round | Phase 7, step 6 |

**Still unverified**, from the four outcomes plus what the Browse rounds added:

- `move()`-based atomic swap on removable media · the per-build SK-snapshot toggle · the first Studio
  save after the two-version collapse · **the auto-save loop under a real edit session** (bounded by
  the serialising guard, not measured) · **a workspace backup onto a real card, including one that runs
  out of room mid-write** — the cleanup path is the whole point of that surface and has never run ·
  **the Project Manager against a card that already carries projects** (the migration list) · any
  engine without `showDirectoryPicker`.
- **Added by the Browse rounds, and none of it walked in Studio:** the shared editor's close
  button and header layout (Studio's tape editor is the same component — the standalone `#/editor`
  door is now a confirmed second host, Studio is the third) · **Studio's boot**, which now
  restores a still-permitted session instead of showing the setup wizard — this changes how Studio opens
  for every user, not just the Browse path · the Project Manager's temporary-pool row.
- **Browse on a phone.** The layout exists and all four rounds were walked on a desktop.

**Verified and struck:** Browse's "Import into a project" · the pen on a browser row · Config mode's
card read/write and its file input *(round 2)* · `#/editor`'s "Add to pool" *(round 3)* · the optional
workspace parameter on `createProjectFromState`, whose second caller turned out not to exist —
`BrowseMode` is the only one *(round 3)*.

### Open, not blocking

| # | Item | Source | Status |
|---|---|---|---|
| D | ~~**`saveStateToDB` has no callers.**~~ ✅ **Wired up.** Auto-save writes the `app-state` slot on a 3 s trailing debounce, gated on the mount-time load having resolved, with writes serialised so a slow one can't be overtaken. Default on, in Settings; turning it off drops the slot. The back-to-hub button now routes through the unsaved check. | Phase 6 note, [persistence.ts](src/utils/persistence.ts) | Done |
| E | ~~**Backup and sync still live in the Project Manager.**~~ ✅ **Removed.** Sync ↕ Backup ×3, Sync Lib, Delete from SD Backup, the rename-on-the-drive prompt, both backup badges, the save-before-sync banner, and `ProjectSyncModal` (497 lines) with them. | New, this round | Done |
| F | ~~**No workspace-level backup exists.**~~ ✅ **Built.** `utils/workspaceBackup.ts` + `WorkspaceBackupModal`, in Settings ▸ Files. Itemised survey before any write, destination picked each time, whole-folder rollback on failure. | New, this round + D.3 | Done |
| G | ~~**The editor can only be reached from the pool.**~~ ✅ **A pen on the sample row** pools the file and opens the editor on it in one step. | New, this round | Done |
| H | **The mirror vocabulary survives in the types.** `status: 'synced'\|'local'\|'backup'\|'modified'` + `.local`/`.backup` are still there, because existing cards still carry projects that `scanProjects` merges. **Phase 7 took the recommended half:** the dead states are no longer *rendered* — the Project Manager reads only "in the workspace" vs "only on the card". Renaming the vocabulary is still open, as one mechanical commit. | D.3, deferred by Phase 4, 6 *and* 7 | A mechanical rename, whenever |
| I | **The SD-import compare view was not built** — the `SyncDashboard`-derived per-slot view. `ProjectManager`'s import button covers the case for now. | Phase 4, "deliberately not built" | Only when SD import gets real use |
| J | ~~**Open question 6 — preset & pack authoring.**~~ ✅ **Answered 2026-08-16.** The app guides the creation of presets and packs and hands back files; the submitter sends them over email or Discord; the maintainer commits them. No PRs, no CI, no backend, no authoring surface. Plan and findings: [docs/presets-samples/submission-workflow.md](docs/presets-samples/submission-workflow.md) — step 0 built, **step 1 (make the preset export actually submittable) is the next piece.** | Open questions | Answered; step 1 is post-v4 work |
| K | **Open question 7 — multiple projects per card (`SK1/`, `SK2/`).** Firmware question first. `'SK'` is hardcoded in 13 places across 6 files and would need to become a parameter before any feature work. | Open questions | Blocked on @Vlad |
| L | **Does the device tolerate an unknown key/value pair?** The app now preserves them either way; writing the *project title* into `config.txt` waits on this answer. | Phase 5 notes | Blocked on the hardware developer |
| M | **Non-destructive editing / op log.** `AudioVersion.processing[]` is a flat tag set and a real model is a different data model, not an extension. | Appendix E.3 | **Explicitly not a v4 goal.** Don't let it creep in |
| N | ~~**Docs are scattered and partly stale.**~~ ✅ **Done.** `docs/README.md` indexes everything with a status; `docs/deployment_guidelines.md` was rewritten — builds, Pages publishing, storage namespacing, asset resolution — with Appendix F.2/F.3 folded in so the deployment story survives this file being archived, and the stale material kept as clearly-labelled history. `CHANGELOG.md` has v4 as one Unreleased entry. | Appendix F.4 + new, this round | Done |
| O | **UX_Overhaul's four wireframing boxes are unchecked** — hub, independent editor, browser-to-grid, guest-artist flow. Three of the four were built without ever being sketched; the fourth (guest artist) is open question 6. | [UX_Overhaul.md](UX_Overhaul.md) §"Next Steps" | **Needs your call** — close three as built, or say what a sketch would still change |

### Discrepancies between the documents

Found by reading the two plans against each other and against the code. Each is a place where a
document says something the codebase no longer agrees with.

1. **Four personas, five doors.** UX_Overhaul names four user journeys; the hub ships five —
   **Preset → SD is a tier the persona document never describes.** It is the headline flow and has no
   persona written for it.
2. ~~**The backup complaint is only half answered.**~~ ✅ **Answered in full by Phase 7, step 3.** Phase 4
   fixed the *build*; step 3 fixed the *screen*. The Project Manager is a list of projects, and the
   only card language left on it is the build and the import path. One leftover, deliberately: the
   library→SD sync still has an entry point in `LibraryManager` (`onOpenLibrarySync`). Step 3's table
   only covered the Project Manager, and workspace backup now covers the need — worth removing when
   someone touches `LibraryManager` next.
3. **Appendix A blocker 3 is stale.** It describes `persistence.ts:36` as autosaving one `AppState`.
   Phase 6 established that function has no callers. Corrected inline below.
4. ~~**roadmap-bugs still frames the overhaul as an open choice.**~~ ✅ **Fixed** by the 2026-08-14
   rewrite of that file; it now records locked decision 1 as settled, in its Done section.
5. ~~**roadmap-bugs still lists resolved work as open.**~~ ✅ **Fixed** by the same rewrite. Both the
   editor's clean-history column and ".wav as well as .WAV" are in its Done section — the latter with
   **"don't 'fix' it"** attached, which is the part that had to survive.
6. **UX_Overhaul §4 asks "config.txt is maybe not a necessity per project?"** — answered by open
   question 4 (device-scoped by default, per-project still allowed) and built in Phase 5. The answer
   was never folded back into the persona document.

---

## Status

| Phase | | What | Deliverable |
|---|---|---|---|
| 0 | ✅ | Cleanup | 1002 lines of dead code removed |
| 1 | ✅ | Mode scaffold | Doors on a landing screen (four then, five now) |
| 2 | ✅ | Browse mode | Linkable sample library + selection pool, zero setup |
| 3 | ✅ | Preset → SD | Cold start → curated project on the card |
| 4 | ✅ | Backup & safety rework | SD card is a build target again |
| 5 | ✅ | Config mode | MIDI setup without the studio |
| 6 | ✅ | Editor mode + Studio extraction | Edit one file with no project; the session leaves `App.tsx` |
| 7 | ◐ | Close-out | Settings owns the options, backup is one explicit act — **steps 1–5 and 7 in; step 6, the test pass, is four doors of five through** |

**The six build phases are in, and Phase 7's code is in.** Locked decision 9 is closed. What is
left before v4 ships is **step 6 — the browser and hardware pass** — plus open questions 6 and 7,
neither of which blocks a release. Of the items above only B and C still block.

**Step 6, as of 2026-08-17:** four doors are walked and verified on a desktop — Browse over four
rounds, then Preset → SD, Device Config and Edit One File over one each. The first two of those three
each opened with a blocker and closed it; Edit One File raised nothing. **Studio is the last door**,
and it is also where every deferred item now points: the shared editor shell, the boot change, the
Project Manager's pool row, the first save after the two-version collapse, and the editor's own bug
sweep. The rounds are logged in [roadmap-bugs.md](roadmap-bugs.md) under *The v4 test pass*, which is
now the live record of that work — this file only says what is left.

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
eslint clean on every new/changed file, and the whole flow walked by hand in the browser. Entry bundle
unchanged at 10.3 kB; `BrowseMode` is a 13.8 kB lazy chunk, `HubNews` 3.3 kB.
Commits `6c5461b`, `3911788`, `9e6a677`.

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

**Two Studio-side fixes rode along**, both bugs that predate v4:

- `handleBulkActionWithTarget` re-found the pack in `SAMPLE_PACKS`, so bulk actions only ever worked
  for built-in packs and logged *"coming soon"* for the library and project sources. It now reads the
  already-resolved `selectedPack`, so those bulk-import too.
- **The preview bar's locate button did nothing outside a mounted folder** — it only set
  `locateFilePath`, a `LocalFolderBrowser` prop. The source a sample was played from is now captured
  at play time (`playingSampleOrigin`) rather than searched for by path afterwards, which would be
  ambiguous across two folders with the same relative path. Locate reopens that source, scrolls the
  row to centre and leaves it on the shared `locatePulse` glow until clicked, matching
  `LocalFolderBrowser` and `LibraryManager`.

**Still blocked for deploy.** Locked decision 9 is untouched: Browse writes no storage, but Studio
shares the origin, so `#/browse` can't go up on Pages until the DB names and key prefix are
namespaced. Appendix F.3.

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

### Phase 3 — Preset → SD ✅  *(the headline flow)*

**Outcome.** `#/presets` is its own mode. New `utils/presetLoader.ts`, `modes/PresetsMode.tsx`;
`PresetsPanel` gained the same `mode: 'standalone' | 'project'` split `SampleBrowser` took in Phase 2.
`tsc -b && vite build` clean, eslint clean on every new/changed file. Entry bundle 10.6 kB;
`PresetsMode` is a 2.8 kB lazy chunk and `PresetsPanel` 9.6 kB.

- **`handleLoadPreset` split into three, and only Studio does all three.** `hydratePreset(entry)`
  and `writeToSD(state, options)` are shared and live in
  [presetLoader.ts](src/utils/presetLoader.ts); `adoptPresetAsProject(state, name)` — dedupe the
  name, write the project folder, take it over as current — stayed in `App.tsx`, because every line
  of it is Tier-3 by definition. Tier 2 calls the first and the third and never touches `App.tsx`.
- **`hydratePreset` returns `{ state, name }`, not a bare `AppState`.** The descriptor's own `name`
  is what a project made from the preset gets called, and nothing else on the way out carries it —
  `AppState` has no name field. The alternative was falling back to the manifest's `entry.name`,
  which is usually but not always the same string.
- **It does *not* end in `buildDetachedState`**, contrary to the reuse note below. A preset
  descriptor carries **explicit slot assignments** — that's most of what a preset *is* — and
  `buildDetachedState` autospreads in list order, so routing through it would discard the author's
  layout. What the note was actually after still holds: `hydrateDescriptor` already returns exactly
  the same detached `AppState`, so one payload shape still feeds one exporter, and Phase 2's pool and
  Phase 3's presets hand `exportSDStructure` the identical thing.
- **Conversion goes through `audioEngine`, not ffmpeg — but unlike Phase 2 it is genuinely needed.**
  A pooled sample was decoded on the way in; a hydrated preset blob is whatever R2 served, normally
  FLAC. `writeToSD` passes `onConvert: toHardwareWav`, so `exportSDStructure` converts each file as
  it writes it — one decode resident at a time rather than 36 — and the tier still pulls no
  ffmpeg-wasm. Studio's own export keeps `convertAudioToWav`, because its files can be anything.
- **Bug found on the way: hydrated blobs could have skipped conversion entirely.**
  `hydrateDescriptor` typed its blobs from the response's `content-type` header, unconditionally. A
  bucket answering `application/octet-stream` produces a blob that fails every
  `type.startsWith('audio/')` check downstream — including `exportSDStructure`'s `onConvert` gate,
  which would then have written FLAC bytes into a file called `1.WAV`. The header is now trusted only
  when it names an audio type, otherwise the extension decides
  ([projectDescriptorUtils.ts:132](src/utils/projectDescriptorUtils.ts#L132)). This was latent on
  Studio's ffmpeg path too.
- **A ZIP fallback where there's no picker.** `exportSDStructure`'s direct write needs
  `showDirectoryPicker`, which Firefox and Safari don't have. `PresetsMode` checks once and flips the
  button to "Build SD ZIP" — same hydrate, same tree, `directWrite: false` — instead of leaving the
  headline flow at a dead end on two of three engines.
- **`includeConfig` left at its default**, which writes `config.txt` only when the hydrated state
  actually carries a `projectConfig`. A preset that expresses no device settings leaves what's on the
  card alone. Same conclusion as Phase 2, reached without needing the explicit `false`.
- **The panel's progress bar now moves.** It already had the markup and a `loadProgress` state that
  nothing ever wrote to — `onLoadPreset` had no progress channel. Both runners now take one, scaled
  55/45 between fetching the audio and writing it.
- **Studio got the same button.** "To SD card" sits beside "Load into App" and writes to the
  connected `backupHandle` when there is one, asking for a card when there isn't. It leaves `state`
  and `isProcessing` alone, so writing a preset to the card doesn't disturb the open project.

Deliberately not built:

- **No "adopt this as a project" in standalone.** That's the tier boundary — it needs a work folder,
  a name and the global IDB slot. The hub's Studio door is one click away.
- **No preview/audition in Tier 2.** A preset is 36 files; auditioning them is what Browse is for.
  Revisit if presets grow past a handful and choosing between them gets hard.

**Storage untouched, same as Browse.** `#/presets` reads the manifest and writes only to the card the
user picks. Locked decision 9 still gates any Pages deploy — Studio shares the origin. Appendix F.3.

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

### Phase 4 — Backup & safety rework ✅

**Outcome.** New `utils/durabilityPrefs.ts`; `SyncOptionsModal.tsx` deleted (148 lines, zero
references). `tsc -b && vite build` clean; no new eslint errors on any changed file, and
`exportUtils.ts` went from 58 to 54.

- **A build with defaults now writes `SK/` and nothing else.** It used to write three copies of the
  same audio. The other two are off unless asked for.
- **Two of the three "backups" were never gated at all** — Appendix D.3 said #3 was "already gated by
  `options.backupSKToProject`", and that was wrong three ways: the flag was declared in
  `ExportSDOptions` but **read nowhere**; `createSKBackup` ran unconditionally on every hardware sync;
  and the only UI that set it, `SyncOptionsModal` (default *on*), was never imported by anything.
  `ExportPreviewModal` passed `false` and even that was ignored. So this phase built the gates rather
  than flipping defaults. D.3 has been corrected below.
- **A third uncontrolled copy the appendix didn't count.** `exportSDStructure`'s "Source Backup" step
  copied `project.json` **and all of `Assets/`** onto the card on every direct write, gated only on
  `workHandle && projectName`. That is D.1 #2, and it is where most of the extra time went. It is now
  `options.mirrorProjectToSD`, off by default.
- **The two opt-ins live in `durabilityPrefs.ts`**, `spotykach_sk_snapshots` and
  `spotykach_sd_project_mirror`, both default `false`, both surfaced in `SettingsModal` under
  "Backup & Durability". An absent key reads as the default rather than as `false`, so the meaning
  doesn't change if a default ever does. The SK snapshot additionally gets a **per-build** toggle in
  the build confirmation, seeded from the preference and deliberately *not* written back — ticking it
  for one build is not a change of policy. `ExportOptions.backupSKToProject` → `skSnapshot`.

**`safeWriteBlob` is the real durability change, and its signature moved.** It now takes
`(dirHandle, fileName, blob, compare)` instead of `(fileHandle, blob, force)` — a swap needs a sibling
to swap with, so it needs the parent directory. All six call sites had it in scope.

- **Atomic.** Bytes go to `<name>.wbtmp` and are swapped onto the target with `FileSystemFileHandle
  .move()` only after the stream closes cleanly. An interrupted write can no longer destroy the file
  it was replacing. `move()` is feature-detected; engines without it fall back to today's in-place
  write, which costs nothing since they have no `showDirectoryPicker` either.
  **Amended after Config round 2 (C1-1).** The feature test was not enough: `move()` is on the
  prototype in every Chromium because it shipped for the OPFS first, and on a user-picked folder it
  can still reject with `InvalidModificationError`, which is exactly what a real card write did. The
  first attempt is now the test — a rejection latches for the session, and the write falls back to
  copying the completed scratch file onto the target in place rather than failing.
- **The size-equality bug is fixed, but not by always byte-comparing.** The fourth argument is now an
  explicit `WriteCompare`: `'content'` byte-compares when sizes match (the default, and the only safe
  choice for SD writes), `'size'` keeps the cheap check where the *filename determines the content*,
  `'always'` never skips. `Assets/<versionId>.wav` uses `'size'` — the id is minted per version and
  never rewritten with different bytes, so byte-comparing every asset on every project save would
  have been a straight regression for no correctness gain. SD tape writes use `'content'`.
- **Stray `.wbtmp` files are inert and self-healing.** Only a hard crash leaves one; `scanSKStructure`
  matches `/^(\d+)\.WAV$/i` and `getOrphanedAssets` matches `.wav`, so neither sees them, and the next
  write of that same file reuses the temp name.

**The migration read path needed one fix to actually work.** `scanForProjects` reads *both*
`WAV_Builder/Projects/` and a bare `Projects/` at the card root, but `handleImportBackupProject` only
ever looked in `WAV_Builder/`. Cards with the older layout listed projects whose import button threw
`NotFoundError`. It now tries both, and copies through `safeWriteBlob` instead of raw `createWritable`.
Nothing else was needed: turning the mirror off doesn't touch scanning, so SD-only projects still
appear in `ProjectManager` with their import button.

**`backupHandle` → `sdHandle`** across `App.tsx` and four components (95 occurrences with its
derivatives — `handleSetBackupFolder`, `onChangeBackupFolder`, `backupDir`, `backupProjects`).
**The IDB key stays `'backup'`**: `storageUtils` now speaks `'work' | 'sd'` and maps `'sd' → 'backup'`
in one place, because renaming the stored key would silently orphan every existing user's saved card
handle. The `status: 'synced'|'local'|'backup'|'modified'` vocabulary and the `use_backup`/
`delete_backup` sync decisions were left alone — that is the mirror machinery of D.3 #2, a separate
concern from the handle, and renaming it would have buried this diff.

Deliberately not built:

- **The `SyncDashboard`-derived import compare view** (the D.3 design reference). The existing
  `ProjectManager` import button already covers "found N projects on this card, import them?", which
  is what step 5 asked for. A per-slot compare view is worth building when SD import gets real use.
- **`status`/`.local`/`.backup` collapsing.** D.3 predicts the machinery "evaporates" once the mirror
  is off. It doesn't, yet — with the mirror off the card simply stops *gaining* copies; existing cards
  still carry projects that must be scanned and merged. The collapse belongs with the `ProjectSession`
  extraction in Phase 6.

**Not verified in a browser.** The build and types are clean and the reasoning above is from reading
the code, but nothing here was exercised against a real SD card — in particular the `move()` swap on
removable media and the per-build toggle. Worth one hardware pass before this ships.

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

### Phase 5 — Config mode ✅  *(Persona 2)*

**Outcome.** `#/config` is its own mode. New `utils/configFile.ts`, `components/ConfigForm.tsx`,
`modes/ConfigMode.tsx`; `ConfigModal` became a Studio-shaped container around the shared form.
`tsc -b && vite build` clean, eslint clean on every new/changed file. Entry bundle 10.9 kB;
`ConfigMode` is a 6.3 kB lazy chunk and `ConfigForm` a 14.6 kB chunk shared with `ConfigModal`
(itself down to 4.2 kB from 14.4 kB).

- **`ConfigModal` was split rather than made conditional.** Phases 2 and 3 loosened a component's
  props with `mode: 'standalone' | 'project'`; that doesn't work here, because the Studio surface is
  an `Rnd` draggable window *from its outermost element inward* — a standalone view can't be the same
  component with a flag. So the fields and the presets moved to `ConfigForm`, which both tiers render,
  and each container keeps its own chrome and its own I/O buttons. The field set is expected to grow;
  one copy of it was the point.
- **The card I/O moved out of the component into [`configFile.ts`](src/utils/configFile.ts)** —
  `readConfigFromCard`, `writeConfigToCard`, `downloadConfig`, `readConfigFromFile`, `pickCard`,
  `ensureWritable`. `generateConfigText`/`parseConfigText` stayed where they were; what was missing
  was never the parsing but everything around it, since the only existing route to the card was
  `exportSDStructure`, which needs an `AppState`. A device setting is not a project.
- **Reading follows `scanSKStructure`'s existing order:** `SK/config.txt` first, then a bare
  `config.txt` at the root. The fallback matters for a user who picks the `SK` folder itself rather
  than the card root, which is otherwise a silent "no config found". Writing is always `SK/config.txt`
  and goes through `safeWriteBlob(..., 'always')`, so the overwrite the button promises is what
  happens, atomically (Phase 4).
- **Unknown key/value pairs now survive a round-trip** (step 4, and the one real code change here).
  `ProjectConfig` gained `unknown?: Array<{key, value}>`; `parseConfigText` collects every pair it
  doesn't recognise, `generateConfigText` writes them back verbatim after the ones it knows. The
  field is left *absent* when there are none, so existing projects serialize byte-identically and
  `calculateSyncDiff`'s config comparison ([importUtils.ts:550](src/utils/importUtils.ts#L550)) is
  unaffected. A key that has since *become* known is dropped from `unknown` rather than emitted
  twice. Verified by bundling the two functions and running them over firmware-shaped files: known
  keys read, unknown kept and written after the known ones, second pass identical, output stable,
  pair structure intact, a five-key file gaining the two new settings at their defaults, and a
  pre-change config object still writing valid pairs.
- **The field set grew during the phase, which is the premise confirmed.** The manual documents two
  settings the app never had: `slc_mn_a` / `slc_mn_b`, *disable polyphony in Slice mode* per deck
  (`0`/`1`, default `0`). They're now first-class fields with their own section in `ConfigForm`,
  labelled the way the file states them — the toggle means "polyphony disabled", so the UI can't
  disagree with the manual. Absent from an older card's file they read as off, and they're written
  on the way out, so a card built by the previous firmware gains them at their documented defaults.
  Adding them cost one line in the type, two in each of the parser and generator, and one UI block —
  which is what the round-trip work was for. Any user who had already read a card with a newer
  firmware's `slc_mn_*` would have had them preserved as unknown pairs and now gets them promoted to
  real controls, since a now-known key is dropped from `unknown` rather than written twice.
- **`DEFAULT_PROJECT_CONFIG` is now the one definition.** The five defaults were spelled out in six
  places — `initialState`, two backward-compatibility fills in `exportUtils`, the parser's starting
  point, the factory presets, Config mode. Adding two fields would have meant editing all six and
  finding out at runtime if one was missed, so they all spread a single const in
  [types.ts](src/types.ts) instead. The next firmware setting is one line there.
- **The unrecognised pairs are shown, not hidden.** A "Kept from the file" section lists them
  read-only. Silently carrying settings the user can't see would be its own kind of surprise, and it
  makes "this app is older than your firmware" legible.
- **Presets and unknown pairs are kept apart.** Saving a preset strips `unknown`; applying one keeps
  the current `unknown`. A preset is the choices a user expressed; unknown pairs belong to whichever
  file they were read from, and carrying them onto a different card would inject settings that card
  never had.
- **No picker, no dead end** — same conclusion as Phase 3. Firefox and Safari get the whole surface
  through "Open config.txt" (a file input) and "Download config.txt", which is also the answer for
  "no workspace at all" (step 3). The download is the primary action there; on Chromium it sits
  beside the card buttons.
- **Studio gained "Read from card"** when an SD handle is connected — the other direction of the same
  helper, and the mechanism behind open question 4's sub-point that *the card is the device's truth*.

Deliberately not built:

- **The project title is not written into `config.txt`.** The notes below settle *how* it would be
  written (an 8-char key/value pair, never a comment) but not *whether* the device tolerates an
  unknown pair — that's still a question for the hardware developer. The round-trip work above is the
  mechanism it would need, so this is one `appendSetting` call once the answer comes back.
- **Config mode never touches stored handles.** It picks the card each visit rather than restoring
  the saved one from `SpotykachDB`, exactly as Tier 2 does. Restoring would mean a permission prompt
  on entry for a mode that might only want the download.

**Storage untouched, same as Browse and Presets.** The mode holds its `ProjectConfig` in component
state for the length of the visit and writes only to the card the user picks; `spotykach_config_presets`
is the one localStorage key it touches, and it already existed. Locked decision 9 still gates any Pages
deploy. Appendix F.3.

**Not verified in a browser.** Types, build and lint are clean, and the round-trip functions were
executed directly (above) — but the card paths, the read/write permission upgrade and the file input
were not exercised against real hardware. Same standing caveat as Phase 4; worth one pass together.

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
>
> ✅ **Done** — `ProjectConfig.unknown`, absent when empty so nothing else changes shape. See the
> Outcome. **Still open for the hardware developer:** does the device tolerate an unknown key/value
> pair? The app now preserves them either way; writing the *project title* as one waits on that answer.
>
> **The documented field set**, from the manual — `config.txt` at the root of the `SK` folder. All of
> it is implemented as of Phase 5; keep this table in step when the firmware adds a row.
>
> | Setting | Key | Values | Default |
> |---|---|---|---|
> | Deck A MIDI channel | `mid_ch_a` | 1–16 | 1 |
> | Deck B MIDI channel | `mid_ch_b` | 1–16 | 2 |
> | Start/Stop deck A from MIDI | `mid_ps_a` | 0 / 1 | 0 |
> | Start/Stop deck B from MIDI | `mid_ps_b` | 0 / 1 | 0 |
> | Enable/disable pre-loading | `pre_load` | 0 / 1 | 1 |
> | Disable polyphony in Slice mode, deck A | `slc_mn_a` | 0 / 1 | 0 |
> | Disable polyphony in Slice mode, deck B | `slc_mn_b` | 0 / 1 | 0 |
>
> The app's own default for `mid_ps_a`/`mid_ps_b` matches the manual (`0`), and
> `DEFAULT_PROJECT_CONFIG` ([types.ts](src/types.ts)) is the one place that says so.

---

### Phase 6 — Editor mode + Studio extraction ✅  *(Persona 3, largest)*

**Outcome.** `#/editor` is its own mode and the hub has five doors. New
`modes/EditorMode.tsx`, `session/ProjectSession.tsx`, `utils/versionHistory.ts`, `utils/newProject.ts`,
`shell/useToasts.ts`, `shell/ProjectCreatedModal.tsx`. `tsc -b && vite build` clean; eslint clean on
every new file and no new error in the changed ones. Entry bundle 11.7 kB; `EditorMode` is a 9.0 kB
lazy chunk that pulls the existing `WaveformEditor` chunk, `BrowseMode` 16.8 kB. All six steps landed.

**Verified in a browser, except the Studio half** *(updated 2026-08-17)*. The three paths this phase
left open have been walked one by one: Browse's "Import into a project" in Browse round 4, and
editor-mode "Add to pool" — which replaced "Save as project", see the note under Phase 6, step 2 — in
the test pass's round 3, with no findings. **The first Studio save after this change (the collapse)
is the one still standing**, and it waits on the Studio walk like everything else project-shaped.

**Read first:** Appendix E, then Appendix C §state separation.

**Goal.** Single-file editing without a project, and `App.tsx` finally broken up.

**Steps.**
1. Decouple `WaveformEditor` (4722 lines) from the on-disk project — `EditorSlot`, the version
   sidebar and the cleanup panel all assume one. Props are already file-shaped, so this is viable.
2. ~~"Save as new project" as the upgrade path out of editor mode.~~ Built, then replaced by
   "Add to pool" — see the note below.
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
> **The editor's second exit is the pool, not a project (2026-08-16).** Step 2 shipped as "Save as
> project": a folder picker, and the user landed in Studio with a one-file project — the heaviest
> surface in the app for a file that needs thirty-five more beside it before a card means anything.
> The door that already collects loose files and turns a handful of them into an `SK/` folder is
> Browse, so the standalone editor now writes into Browse's pool store (R2-4) and offers to open
> that door. Nothing about it needs a permission: the pool is IndexedDB, and the `app-state` slot
> locked decision 5 protects is still untouched. Pressing it again updates the same entry rather
> than pooling a second copy. The project exit is not gone, it moved to where the pool is: Browse's
> "Import into a project" carries the whole selection.
>
> **The commit button yields to the exit that matters (same round).** In the loose editor the green
> settled-state button dominated a screen whose actual point is the download. It now goes quiet
> (`commitCleanTone="quiet"`) once there is nothing left to bake, and `transportActions` is handed
> the editor's own `commitClean` so the download can take the filled treatment at exactly that
> moment — and *not* before, because both exits write the committed version and would otherwise
> invite a click that silently drops the edit still on screen. Studio's hosting is unchanged.
>
> **`WaveformEditor` was already 90% decoupled.** Every project-shaped prop bar one was optional
> and already guarded at its use site — `onDeleteVersion`, `onAssignVersion`, `onMoveVersionToPool`,
> `onSaveUnique`, `onRenameFile`, `tapeColor`. Only `onSaveAsCopy` was required, and only two things
> actually *spoke* the grid's vocabulary: the commit button's label and its toast. Those moved behind
> a `commitLabels` prop rather than a `standalone` boolean — a flag would have put the mode's wording
> inside the component, which is what Phase 5 had to undo for `ConfigModal`. A `transportActions` slot
> lets a host add its own exits to the transport bar. Net: ~40 lines changed in a 4722-line file.
>
> **The editor opens over Browse, not by routing to `#/editor`.** Switching mode would unmount
> `BrowseMode` and take the rest of the pool with it. As an overlay the pool survives, and applied
> edits go straight back into the pooled item through an `onEdited` callback rather than a "keep
> this?" button — so both downloads pick the edit up and closing the editor can never drop work. Same
> component, two hosts.
>
> **The two-version rule lives in `saveProjectToDirectory`,** the single choke point all seven save
> paths funnel through. `collapseVersionHistory` is pure and returns its argument unchanged when
> there is nothing to drop, so an already-collapsed project allocates nothing. The live state is then
> collapsed to match with `setState(prev => collapseVersionHistory(prev))` — applied to `prev` rather
> than to the returned state, so an edit made *during* the save isn't rolled back. In editor mode the
> collapse happens on every applied edit instead: there is no save boundary to defer to, and it makes
> the sidebar read as "Original / Edited", which is the safety story E.2 exists to tell.
>
> ⚠️ **`saveStateToDB` has no callers.** [persistence.ts:36](src/utils/persistence.ts#L36) is
> exported and never invoked from anywhere in `src/`. The `app-state` IDB slot is *read* on mount and
> never written, which means **Appendix E.1's "the whole `AppState` is autosaved to IndexedDB" is
> stale**, and locked decision 5 has been guarding a slot nothing writes. This doesn't change the
> decision — a future autosave would want the guarantee — but it does mean the memory half of E.1's
> "disk × memory × IDB" was really only disk × memory. Worth deciding deliberately: either wire the
> autosave up (now cheap, since the two-version rule caps what it would store) or delete the function.
>
> **`ProjectSession` took the session, not the shell.** Appendix C.3's list — state, handles, dirty
> tracking, project handlers — splits cleanly in three parts, and only two of them belong together.
> The hook owns the project state, both directory handles, the project name, dirty tracking, and the
> five effects that maintain them (the localStorage identity, the `workHandle` ref, the dirty watcher,
> the initial IDB load, the stored-handle lookup). `isSystemUpdate.current = true`, poked bare at
> seven call sites, became `markSystemUpdate()`. What stayed in `App.tsx` is the ~60 pieces of view
> state and the handlers over them: which modal is open, which tape is showing, where the notes window
> was dragged to. Moving those would relabel the file rather than separate anything, and App went
> 5718 → 5675 lines, which is the honest measure of that. **The guarantee C.3 wanted already held
> without any of this** — the project-free modes are separate modules that never import `App.tsx`,
> and Studio is lazy-loaded only for `#/studio`. The extraction is for legibility; the isolation was
> structural from Phase 1.
>
> **Cleanup's new home is Project ▸ Advanced.** It was already reachable from Settings and the Project
> Manager; the editor sidebar was a third entry, and the wrong one — a project-wide destructive action
> inside one file's history panel. The `onCleanupProject` prop left `WaveformEditor` entirely. The
> modal's explainer now says saving already collapses history, so what is left for it is the leftovers
> the rule can't reach: orphaned disk assets, unwanted files, old SD backups.
>
> **Both upgrade paths are one function.** `createProjectFromState` in
> [newProject.ts](src/utils/newProject.ts) is what Browse's "Import into a project" and Editor's "Save
> as project" both call: pick the folder *now* (Appendix C.2), write `Projects/<name>/`, store the
> work handle so Studio can find it. It writes the stored handle and `spotykach_current_project` —
> the only durable state either mode touches — and never the `app-state` slot. `ProjectCreatedModal`
> then *offers* Studio rather than jumping there, since Studio wants a permission back.
>
> **"Temporary project in browser cache, save later" was not built.** Question 5 floated it as the
> variant for a Browse user with no folder set up. It would need its own IDB slot to stay inside
> locked decision 5 — and the pool is already React state that survives the folder picker without any
> handoff, so the mid-flow pick the variant existed to avoid turned out not to need avoiding.

---

### Phase 7 — Close-out ◐  *(settings, backup, and the test pass)*

**Outcome — steps 1–5 and 7 landed 2026-08-14. Step 6 has not been run.** New
`utils/storageNamespace.ts`, `utils/workspaceBackup.ts`, `components/WorkspaceBackupModal.tsx`;
`ProjectSyncModal.tsx` deleted (497 lines, unreferenced once the push half went). `tsc -b &&
vite build` clean; every new file eslint-clean, and no file gained an error — `App.tsx` went
82 → 79 and `App.tsx` itself 5675 → 5581 lines.

- **Storage namespacing came first, out of order, because it blocks a deploy and nothing else
  blocks it.** One module, two IDB names and all 18 localStorage sites. The derivation is
  `VITE_STORAGE_NS` → last `BASE_URL` segment when there is more than one → `''`. The `''` case
  is the important one: **the production build's names stay byte-identical**, so no existing
  user loses anything. Confirmed by reading both built bundles, not by reasoning about them.
- **Auto-save had to be built before it could be a setting**, as the brief predicted. Two
  things the brief didn't have: `AppState` **carries the audio blobs**, so a snapshot is not
  cheap the way "just the IDB slot" implies — writes are therefore serialised, with the newest
  state waiting in a ref while one is in flight, which self-limits to one write per
  write-duration instead of building a queue. And the effect is gated on the mount-time load
  having resolved, or the initial empty state would overwrite the snapshot it is about to be
  replaced by. **Its real cost has not been measured** — the guard bounds it, that is all.
- **The unsaved-exit warning says something different depending on the setting.** With
  auto-save on, "these will be lost" is a lie the app can be caught in — the work is in the
  recovery slot, it just isn't in the project folder. Two messages, one condition.
- **Step 3 removed more than it changed.** The two-column mirror became one list. `ProjectSyncModal`
  lost its only caller and went the way `SyncOptionsModal` went in Phase 4. On open item H the
  recommended half was taken: dead states stop rendering, the type keeps its four values, and
  the rename stays a separate mechanical commit.
- **Workspace backup is honest about the thing it cannot do.** There is no free-space figure
  available for a picked directory — `storage.estimate()` measures this origin, not the target
  — so the surface says so in as many words rather than implying a check. What it does instead
  is fail cleanly: everything lands in one new folder, and a write that dies part way removes
  that folder, because a half-copy that looks like a backup is worse than no backup. If even
  the cleanup fails, the error names the folder to delete by hand.
- **Settings got tabs at exactly the threshold the brief named.** Locations, auto-save, backup
  and cleanup moved in; that is seven sections, so: Files / Look / System. Cleanup left the
  Danger Zone on the way — since the two-version rule it only removes leftovers, which makes it
  housekeeping, not a destructive act.
- **The pen reads as "pool this, edited".** Recommendation taken: an edit from a browser row
  adds the file to the pool and opens the editor on it, so there is no second set of endings to
  maintain — both downloads and "import into a project" already work on pooled entries.
- **One thing outside the plan, and worth it.** `FileSystemDirectoryHandle`'s async iterators
  are declared once in `vite-env.d.ts` instead of `@ts-ignore`d at ~20 call sites, so new code
  can walk a directory without suppressing the type checker. It immediately caught a real
  narrowing gap in `scanForProjects` that the suppression had been hiding.

**Not verified in a browser** — the standing caveat from Phases 4, 5 and 6, now with more in it.
See the unverified list at the top of this file; the backup failure path in particular has never
run.

**Read first:** the **Open items** section at the top of this file, then Appendix D.

**Goal.** Finish what Phase 4 started. Options stop being scattered across the Project Manager and the
build dialog and live in one settings surface; "backup" stops meaning four things and becomes one
explicit act the user initiates; and the whole of v4 gets its first real test.

**Why it's one phase.** Steps 1–4 are the same change seen from four sides — the app currently has no
single place that answers "what does this tool do with my files, and when". Splitting them would mean
touching `SettingsModal` and `ProjectManager` three times over.

---

#### Step 1 — Settings becomes the home for options

Today's `SettingsModal` (763 lines) is visual filters, quick presets, one "Backup & Durability" block
added in Phase 4, and a danger zone. It is the right container; it just isn't where anything else
lives yet.

Moves in:

- **Auto-save** (step 2).
- **Locations** — work folder and SD card. These sit in the Project Manager header today
  ([ProjectManager.tsx:393-407](src/components/ProjectManager.tsx#L393-L407)), and roadmap-bugs has
  been asking for them under the settings icon since v3. Leave the inline "Change" where it is; a
  setting is a second entry, not a replacement.
- **History & cleanup** — `CleanupModal` is reachable from Settings and the Project Manager already
  (Phase 6 removed the third entry, in the editor sidebar). This is where the "what does cleanup
  remove" copy belongs, now that the two-version rule means cleanup only ever deals with leftovers.
- **Workspace backup** (step 4).

**Watch out for.** `SettingsModal` is already close to being three screens in one. If the section list
passes ~6, give it tabs before adding the seventh — the same call `AboutHelpModal` already made.

#### Step 2 — Auto-save as a real setting

**The premise needs correcting before it can be built: there is no auto-save.** `saveStateToDB`
([persistence.ts:36](src/utils/persistence.ts#L36)) is exported and never called; the `app-state` IDB
slot is read on mount and never written. Projects reach disk only through explicit saves and
`ProjectManager`'s save-before-sync guard
([ProjectManager.tsx:123-131](src/components/ProjectManager.tsx#L123-L131)). So this step **builds**
the feature; "toggle it in settings, on by default" is the second half of it.

- **What auto-save saves — two candidates, and they are different promises.** Writing `project.json`
  through `saveProjectToDirectory` is a real save to the user's disk: durable, but it also runs the
  two-version collapse and writes assets, so it is not free. Writing the `app-state` IDB slot is cheap
  and crash-proof but invisible in the user's folder. *Recommendation: the IDB slot, debounced* — it
  is what that slot exists for, and it makes "the tab crashed" survivable without surprising anyone's
  disk. Explicit save stays the thing that writes the project.
- **Default on**, with its key alongside the two in [durabilityPrefs.ts](src/utils/durabilityPrefs.ts)
  — same absent-means-default reading, so changing a default later doesn't rewrite anyone's choice.
- **When it's off, exiting to the hub must warn.** It doesn't today: the header's back button calls
  `onExitToHub` directly ([App.tsx:4214-4218](src/App.tsx#L4214-L4218)) with no unsaved check, while
  `handleWithUnsavedCheck` ([App.tsx:700-712](src/App.tsx#L700-L712)) already exists and already knows
  to stay quiet for an empty project. Route the button through it. **Worth doing whether or not
  auto-save lands** — leaving Studio unmounts it, so that warning is missing right now.

#### Step 3 — Strip backup and sync out of the Project Manager

*What was already done, what is still there, what goes.*

**Already done (Phase 4).** Builds no longer copy: `SK/` and nothing else, with `skSnapshots` and
`mirrorProjectsToSD` as default-off opt-ins in Settings. `backupHandle` → `sdHandle`. Writes are
atomic. `SyncOptionsModal` deleted.

**Still there — all of it in [ProjectManager.tsx](src/components/ProjectManager.tsx):**

| What | Where | Verdict |
|---|---|---|
| "Sync ↕ Backup" / "Sync to Backup", three variants | [543](src/components/ProjectManager.tsx#L543), [568](src/components/ProjectManager.tsx#L568), [582](src/components/ProjectManager.tsx#L582) | **Remove.** The push half of the mirror locked decision 6 retired. |
| "Sync Lib" — library → SD | [410-416](src/components/ProjectManager.tsx#L410-L416) → `LibrarySyncModal` (501 lines) | **Remove from here.** The library belongs in the workspace backup (step 4), not on a card. |
| "Delete from SD Backup" | [629-633](src/components/ProjectManager.tsx#L629-L633) | **Remove.** Deleting from a card the app no longer writes to is a file-manager job. |
| "Rename synced project? Also rename it on the backup drive" | [185-258](src/components/ProjectManager.tsx#L185-L258) | **Remove** with the mirror. |
| Badges "Backup Synced" / "Backup Modified" | [506-553](src/components/ProjectManager.tsx#L506-L553) | **Remove.** They describe a mirror that no longer runs. |
| The auto-save-before-sync banner | [113-131](src/components/ProjectManager.tsx#L113-L131) | **Remove** with its trigger; the guard itself folds into step 2. |
| **"Import" a project found on the card** | [588-598](src/components/ProjectManager.tsx#L588-L598) | **Keep.** D.3's migration path, and the reason the read side survives at all. |
| **"Import Sync" — device changes back into the project** | [352](src/components/ProjectManager.tsx#L352) | **Keep.** Reading the card is not mirroring it. |
| **"Hardware Synced" badge** | [519](src/components/ProjectManager.tsx#L519) | **Keep.** That one describes the build, which is still a real relationship. |

**The vocabulary question (open item H).** D.3 predicted `status: 'synced'|'local'|'backup'|'modified'`
and `.local`/`.backup` would evaporate once the mirror was off; Phases 4 and 6 both found they don't,
because existing cards still carry projects that have to be scanned and merged. What actually happens
is that it *shrinks*: with the push half gone, `'synced'` and `'modified'` stop being reachable for new
work and the live distinction collapses to **"in the workspace" vs "only on the card, importable"**.
Decide here whether to rename now or only stop *rendering* the dead states. *Recommendation: stop
rendering first, rename in a separate mechanical commit* — the Phase 4 `backupHandle → sdHandle`
pattern, which is what kept that diff readable.

**Done when.** The Project Manager reads as a list of projects with an import path for cards, and the
word "backup" appears in it zero times.

#### Step 4 — Workspace backup, as one explicit act

Replaces everything step 3 removes, and it is deliberately *one* thing rather than four.

- **Scope: the whole workspace.** Projects, the user library, and optionally the card's current
  contents. Not a per-project mirror.
- **No default location, ever.** The user picks a folder at the moment of backing up, and nothing is
  written until they do. D.3's "backup location is the user's choice", made literal.
- **Show what it contains before writing** — an itemised list with per-item sizes: projects (n, with
  their assets), library (n files), history leftovers, the SD snapshot if included. The user should be
  able to see what the total is made of, which is the one thing the old sync UI never showed.
- **Size check — with a platform constraint to be honest about.** ⚠️ **The File System Access API
  cannot report free space on a picked directory.** `navigator.storage.estimate()` measures the
  origin's own quota, not the target drive, so there is no truthful "this won't fit" *before* the
  write. What is achievable: compute the backup's size by walking the sources, state it plainly beside
  a reminder of typical card sizes, and fail gracefully mid-write — clean up the partial copy and say
  "the target ran out of room after N files" rather than throwing. Say that in the UI rather than
  implying a check the platform can't perform. (SD cards are the case that makes this matter: a
  workspace with history and a custom library will outgrow a small card.)
- **Where it lives.** Settings ▸ Backup & Durability, beside the two existing opt-ins — where a user
  who just turned `mirrorProjectsToSD` off will go looking for what replaced it.

**Reuse.** The deleted `SyncDashboard` (`git show 72c2893:src/components/SyncDashboard.tsx`) is still
the best per-item comparison view in the repo's history, and the itemised list is the same shape.
`LibrarySyncModal`'s file-walking is the other half — if step 3 removes its entry point, salvage the
walk rather than the modal.

#### Step 5 — Edit one file straight from the browser

The editor already opens over Browse and applied edits go back into the pool
([BrowseMode.tsx:558](src/modes/BrowseMode.tsx#L558)) — but **only from a pool row**. A user who wants
to trim one sample has to add it to a selection first, which is a concept they never asked for.

- A **pen icon on the sample row** in `SampleBrowser`, beside preview. It decodes that one file and
  opens the same `LooseFileEditor` overlay the pool rows use.
- **Decide where the edit lands when the file was never pooled.** *Recommendation: applying an edit
  adds it to the pool as an edited entry* — then both downloads and "import into a project" keep
  working with no second set of endings, and the pen reads as "pool this, edited".
- Studio's `SampleBrowser` wants the same affordance eventually, but that is a different host with a
  project behind it. Standalone first.

#### Step 6 — The test pass ◐ *in progress*

**The live record is [roadmap-bugs.md](roadmap-bugs.md) ▸ *The v4 test pass*** — findings, round by
round, and a table of which doors are through. Phase 7 is where this document stops being the place
things get written down, so nothing below is repeated there.

Two rounds, in this order:

1. **The five doors, cold.** A fresh browser profile through Browse, Presets, Config, Editor and
   Studio, plus every path in the unverified list at the top of this file. Real SD card, real folder
   picker, Chromium *and* one engine without `showDirectoryPicker` — the ZIP and file-input fallbacks
   from Phases 3 and 5 have never been exercised.
   **Browse: done** (four rounds, 2026-08-14 → 15, 20 findings raised and closed). **Preset → SD and
   Device Config: done** (2026-08-16, one blocker each — P1-1, C1-1). Editor and Studio left, plus the
   engine without `showDirectoryPicker`.
2. **The editor, deeply.** Starting points from roadmap-bugs: the cleanup confirm modal glitching out
   of sight, and stereo splitting.
   **Partly done:** every tool passed in the *Browse-hosted* editor in round 3. Neither starting point
   was reachable there — cleanup is a project action, so both still need Studio.

**One thing the rounds changed about this step.** Findings from Browse repeatedly landed in components
Studio shares — the waveform editor twice, the Project Manager, and Studio's own boot sequence. Walking
the remaining doors is therefore also a regression pass over those, not only a first look at them.

#### Step 7 — Retire the v4 documents

The end state: **[roadmap-bugs.md](roadmap-bugs.md) and [CHANGELOG.md](CHANGELOG.md) are the only live
documents**, as they were before v4.

1. ✅ `roadmap-bugs.md` rewritten against the overhaul — obsolete items retired to its Done section,
   the rest regrouped. Done 2026-08-14, alongside this section.
2. ✅ `docs/README.md` — an index of every documentation file with its status, and `docs/archive/`
   for what has stopped being true. Done 2026-08-14.
3. ✅ v4 written up in `CHANGELOG.md` as **one** `[4.0.0 "Pervak"] - Unreleased` entry, not seven.
   Version-bump `package.json` when it actually ships.
4. Move `V4_PERVAK.md` and `UX_Overhaul.md` into `docs/archive/` **once v4 ships**, not before — the
   appendices are still the only written record of why several of these decisions went the way they
   did, and Phase 7 is being run out of this file. **The deployment half of Appendix F is already
   safe**: F.2 and F.3 were folded into `docs/deployment_guidelines.md`, which is a live document.
5. ✅ `docs/deployment_guidelines.md` rewritten — builds, Pages publishing with the `next/` subfolder
   and its wipe-order trap, storage namespacing, asset resolution. The stale `build-versioned-pages.mjs`
   and GitHub-Releases-samples material is kept as a clearly-labelled historical section, because the
   reasoning still explains why `resolveAssetPath` checks external before local. The
   `public/v2/index.html` redirect stub **stays as-is** — it costs nothing, `/v2` is still in
   `assetUtils`'s `internalPaths` for it, and removing it would 404 old links.

**Done when.** The five doors all work on real hardware; the Project Manager says nothing about
backups; one settings screen answers "what does this app do with my files"; and this file is ready to
move into `docs/archive/`.

**Notes.**
>
>

---

## Open questions

Questions 1–5 are **answered and folded into the phase briefs** — a phase chat reads its own brief and
doesn't need this section. Kept here for the reasoning. **Questions 6 and 7 are open**, and neither
blocks a phase: 6 needs a product decision, 7 needs an answer from the firmware side first.

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

   ✅ **All four exits are in** as of Phase 6. The "temp project in cache" variant was dropped rather
   than built: the pool is React state that survives the folder picker untouched, so the mid-flow
   pick it existed to avoid turned out not to need avoiding.

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
   → **Answer:** ✅ *(2026-08-16)* **The app guides the creation; the channel stays human; the
   maintainer commits.** Neither of the two ambitious shapes: no pull requests from strangers with a CI
   gate, and no backend or self-publishing. The app collects everything a submission needs — for a
   preset *and* for a sample pack — and hands back files to download; the submitter sends them over
   email or Discord, audio through WeTransfer or Drive; the maintainer implements them. Sized
   deliberately to the expectation that neither presets nor packs arrive in volume.
   **The consequence is that the app is the form**, so what it hands back has to be complete —
   which today it is not: the settings-only export downloads an unmentioned ZIP, names every descriptor
   `"Untitled Project"` and derives no `requiredPacks`. Findings and the staged plan are in
   [docs/presets-samples/submission-workflow.md](docs/presets-samples/submission-workflow.md); its
   step 0, a signpost on the Preset door, is built. **No dedicated authoring surface** is planned.

7. **Multiple projects on one card — `SK1/`, `SK2/`, …?** *(new, from the community thread, 2026-08-14)*
   Today a card holds exactly one set of 6×6 tapes, so swapping projects means rebuilding the card.
   The proposal: let the device scan for numbered SK folders at boot and offer a picker — six slots
   is probably already enough for "swap between sets", two rows of six if it's cheap.

   **This is a firmware question first.** Nothing in the app can make the device read `SK2/`. The ask
   to @Vlad is feasibility: does a boot-time folder scan and a selection UI fit, and what's the
   ceiling? Practical usefulness is worth asking the wider group in the same breath — it may turn out
   people simply carry a second card.

   **What WAV.builder would own if the answer is yes:**
   - **Numbering and naming** — build a project into `SK<n>/` rather than `SK/`, renumber to close
     gaps, and keep a per-folder title plus a short summary (the notes field is already there and is
     the obvious source).
   - **A per-project `config.txt`**, for a project that wants its own MIDI setup.
   - **Reading a card back** — `scanSKStructure` currently finds one structure; multi-project cards
     mean listing what's on the card before importing.

   **The wrinkle worth deciding early, and it lands on Phase 5's surface:** a per-project config can't
   be the only config. Boot options — including "is the project picker on at all" — have to live
   somewhere the device reads *before* it knows which project you want. So the model is a **root
   `config.txt` for the device, plus an optional per-project one that overrides it**, which is exactly
   question 4's "device-scoped by default, per-project still allowed" pushed one level further. Config
   mode would then edit two things and needs to say clearly which one it is writing.

   **What already helps:** Phase 5 made unknown key/value pairs survive a round-trip, so a config file
   carrying keys this build doesn't know — a boot-loader toggle, say — isn't stripped by editing it.
   Against that, `'SK'` is a **hardcoded string in 13 places across 6 files** (`exportUtils`,
   `importUtils`, `configFile`, `App.tsx`, `SetupWizard`), so "which SK folder" would first have to
   become a parameter threaded through the export and scan paths. Worth doing as one mechanical change
   *before* any feature work, the way Phase 4 did `backupHandle → sdHandle`.

   *Not blocking any current phase.* **Next step is the conversation, not code** — and if it stalls,
   forking the Spotykach firmware repo to see what a boot-time scan would actually take is a
   reasonable way to answer the feasibility half ourselves.
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
3. **Global single-slot persistence.** ~~[persistence.ts:36](src/utils/persistence.ts#L36) autosaves
   one `AppState`~~ — **correction (Phase 6): `saveStateToDB` has no callers.** The slot is *read* on
   mount and never written, so there is no autosave. What is true is the second half:
   [the dirty watcher](src/session/ProjectSession.tsx) flags *any* state change as unsaved, so a
   Tier-1/2 session touching `state` would still raise phantom warnings. The blocker was real; the
   mechanism named was not. See open item D.
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
  is nearly free. ✅ Phase 5 — and it was, once the fields came out into `ConfigForm`; the modal is an
  `Rnd` window from its outermost element inward, so a `mode` prop couldn't have done it.
- **`WaveformEditor`** (4722) is the hard one. Props are already file-shaped (`slot`, `versions`,
  `activeVersionId`, `onSave`), so single-file mode is viable — but `EditorSlot`, the version sidebar
  and the cleanup panel assume a project on disk. ✅ Phase 6 — and it turned out not to be the hard
  one: the sidebar was already fully guarded, the cleanup panel left the component altogether, and
  ~40 lines of change did it. The estimate was wrong in the useful direction.

### Verdict table

| Component | Verdict | Work needed |
|---|---|---|
| `exportUtils`, `importUtils`, `projectDescriptorUtils`, `lib/audio`, `persistence`, `storageUtils` | **Recycle as-is** | None. Already mode-agnostic. |
| `samplePacks.ts`, `assetUtils` | **Recycle as-is** | None. |
| `SampleBrowser` | **Recycle, loosen props** | Optional project props + `mode: 'standalone' \| 'project'`. |
| `PresetsPanel` | **Recycle, extend** | Add "Write to SD card". Promote from modal to view. |
| `ConfigModal` | ✅ **Split** | Phase 5. Fields + presets → `ConfigForm` (shared); card I/O → `utils/configFile.ts`. The modal is now just Studio's container around them. |
| `ProjectManager`, `SlotGrid*`, `TapeSelector`, `FileBrowser`, `AllViewGrid` | **Recycle in Studio** | Unchanged, just no longer the only shell. |
| `LibraryManager` | **Recycle, promote** | Largely project-independent already. |
| `WaveformEditor` | ✅ **Loosen props** | Phase 6. `onSaveAsCopy` optional, `onCleanupProject` gone, grid wording behind `commitLabels`, host exits via `transportActions`. Consumed by `modes/EditorMode.tsx`. |
| `SetupWizard` | **Demote** | Keep the 5 explainer slides (good, reusable as in-context help). No longer the mandatory gate — Studio onboarding only. |
| `WelcomeScreen`, `SamplePackModal`, `SyncDashboard` | ✅ **Deleted** | Phase 0, commit `07d088a`. |
| `SyncOptionsModal` | ✅ **Deleted** | Phase 4. Unreferenced, and its only content was a default-*on* version of the switch Phase 4 turns off. |

---

## Appendix C — Target architecture

### C.1 Mode as first-class state

```ts
type AppMode = 'hub' | 'browse' | 'presets' | 'config' | 'editor' | 'studio';
```

- `hub` — landing screen. Five doors as of Phase 6, no permission prompts, no project.
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
  shell/        AppShell.tsx, ModeRouter.tsx, useAppMode.ts, HubScreen.tsx, HubNews.tsx,
                escapeStack.ts, useToasts.ts, ProjectCreatedModal.tsx
  modes/        BrowseMode.tsx, PresetsMode.tsx, ConfigMode.tsx, EditorMode.tsx
  session/      ProjectSession.tsx   (the project state, handles and dirty tracking)
  components/   (unchanged — now consumed by modes)
```

As built. Two departures from the sketch, both in Phase 6: **there is no `StudioMode.tsx`** — Studio
*is* `App.tsx`, lazily imported by the router, and wrapping it in a one-line file would buy nothing;
and `ProjectSession` holds the session's *state*, not its handlers, which stayed in the shell. See
the Phase 6 notes.

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
  card is a backup. ✅ Phase 4 — the IDB key stays `'backup'`, mapped in `storageUtils`.
- **#3 → default off**, opt-in per build. ~~Already gated by `options.backupSKToProject`.~~
  **Correction (Phase 4): it was gated by nothing.** `backupSKToProject` was declared in
  `ExportSDOptions` and read nowhere; `createSKBackup` ran on every hardware sync regardless; the one
  UI that set it was never mounted. ✅ Now `ExportOptions.skSnapshot` + `durabilityPrefs`.
- **#2 → explicit opt-in.** "Also keep a copy of projects on the SD card", default off.
  ✅ Phase 4 as `ExportSDOptions.mirrorProjectToSD`. **Also ungated before this** — it was
  `exportSDStructure`'s "Source Backup" step, conditional only on having a work folder and a project
  name. The prediction that `scanProjects` then "collapses to one source and the
  `status`/`.local`/`.backup` machinery evaporates" **did not hold**: cards that already carry
  projects still have to be scanned and merged, so the machinery stays until Phase 6.
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
✅ **Phase 4** — `.wbtmp` + `FileSystemFileHandle.move()`, feature-detected, with an in-place fallback
for the engines that have the method and reject the call (C1-1).

> Worth fixing while in there: `safeWriteBlob` skips the write when the existing file's **size**
> matches the new blob's ([exportUtils.ts:98](src/utils/exportUtils.ts#L98)). Two different WAVs of
> identical byte length are silently treated as identical. Harmless for `Assets/<versionId>.wav`
> (unique id per version, never rewritten with different content), potentially wrong for SD sync.
>
> ✅ **Phase 4**, and the parenthetical is why it isn't just "always byte-compare": the fourth
> argument is now an explicit `WriteCompare`. SD writes use `'content'`; `Assets/` keeps `'size'`,
> since re-reading every asset on every save would cost real time for no correctness gain.

**A bad app update.** *Fix:* version the `project.json` schema and snapshot once on migration — not
continuous mirroring on every build.

---

## Appendix E — Version history

### E.1 How it works now

*(How it worked before Phase 6. E.2 is now implemented — see the Phase 6 notes.)*

- Every edit appends to `FileRecord.versions[]` and becomes the new `currentVersionId`
  (`handleSaveFile` in App.tsx). **Unbounded.**
- On save, every version's blob is written as its own `Assets/<versionId>.wav`
  ([exportUtils.ts:1108-1130](src/utils/exportUtils.ts#L1108-L1130)).
- All version blobs stay resident in `state.files[].versions[].blob`.
- ~~and the whole `AppState` is autosaved to IndexedDB~~ — **this was never true.**
  `saveStateToDB` ([persistence.ts:36](src/utils/persistence.ts#L36)) has no callers anywhere in
  `src/`; the `app-state` slot is read on mount and never written. Found in Phase 6.

History depth therefore multiplies **disk × memory** — not IDB. `CleanupModal` (766 lines) existed to
dig out from under this after the fact; since Phase 6 the mess no longer accumulates, and what it is
for is the leftovers the rule can't reach.

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

*Phase 6 did not take that head start.* Nothing in the editor's tools was changed to record its
parameters — the phase was already the largest, and E.3's point stands that a half-captured op log is
no closer to a real one. `AudioVersion.processing[]` is still a flat tag set. The obvious place to
start when someone does want this is the `meta` object built in each of `WaveformEditor`'s ~14 apply
handlers, which already carries `slicePoints` and `tempo` and is the one thing every operation
touches.

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
  `spotykach_emptySlotPreferredBrowser`, and from Phase 4 `spotykach_sk_snapshots` +
  `spotykach_sd_project_mirror`. (`spotykach_show_news_on_start` was deleted in Phase 2.)

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

**Tracked as Phase 7, step 7.** The file is classified 🟡 *partly stale* in
[docs/README.md](docs/README.md) — its asset-path section is still accurate, so the choice is repair
the second half or fold the first half elsewhere and archive it.
