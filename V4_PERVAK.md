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
| 1 | ☐ | Mode scaffold | Four doors on a landing screen |
| 2 | ☐ | Browse mode | Linkable sample library, zero setup |
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

### Phase 1 — Mode scaffold ☐

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

### Phase 2 — Browse mode ☐  *(Persona 1)*

**Read first:** Appendix B (Tier 1 row).

**Goal.** `SampleBrowser` full-screen under `#/browse` with no project.

**Touches.** `SampleBrowser.tsx` props, new `modes/BrowseMode.tsx`.

**Steps.**
1. Make `userLibrary` / `projects` / `workHandle` optional; add `mode: 'standalone' | 'project'` so
   "Send to Project" actions hide when there's no project.
2. Mount full-screen rather than inside the `Rnd` draggable window used at
   [App.tsx:5228](src/App.tsx#L5228).
3. Downloads via existing `exportSingleFile` / `exportSingleTape` — no new export logic.
4. Add the "SK-ready folder vs. original files" download choice from
   [UX_Overhaul.md](UX_Overhaul.md) §1.

**Done when.** A cold visitor can browse packs, preview, and download without a single permission
prompt, and `#/browse` is shareable.

**Open question this phase must settle:** does Browse include the user library? (Open questions, #3.)

**Notes.**
>
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

**Open question this phase must settle:** prefer the prebuilt `sdExportUrl` ZIP over hydrating 36
blobs when it exists? (Open questions, #2.)

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

**Open question this phase must settle:** device-scoped or project-scoped by default?
(Open questions, #4 — recommendation is device-scoped.)

**Notes.**
>
>

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

**Notes.**
>
>

---

## Open questions — need your call

Answer inline; a phase chat will read these.

1. **Landing default.** Hub for everyone, or remember the last mode and skip it on return?
   *Recommendation: hub on first visit, remembered mode after, hub always one click away.*
   → **Answer:**

2. **Preset → SD without hydrating.** For presets with `sdExportUrl`, the prebuilt ZIP is far cheaper
   than hydrating 36 blobs and re-writing them. Prefer the ZIP when available, fall back to
   hydrate+write?
   → **Answer:**

3. **Does Browse include the user library?** It's IDB-backed and project-independent, so it *can* be
   there — but it may muddy a "just show me the packs" tier.
   → **Answer:**

4. **Config scope.** Device-level by default *(recommended)* or per-project?
   → **Answer:**

5. **Tier upgrade prompts.** When a Tier-1 user selects 36 files, offer "make this a project"
   inline, or keep tiers strictly separate?
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
  shell/        AppShell.tsx, ModeRouter.tsx, useAppMode.ts, HubScreen.tsx
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
