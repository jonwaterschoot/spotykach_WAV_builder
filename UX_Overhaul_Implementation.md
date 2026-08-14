# v4 "Pervak" — Implementation Outline

> **Codename:** Pervak (первак) — the first run off a still, the strong opening fraction.
> Fitting for a release whose premise is separating one muddled thing into clean tiers.
> Branch: `v4-pervak`.
>
> Version lineage, for context: **v1** = browser-cache only, **v2/v3** = the current workspace +
> projects model, **v4** = the tiered split described here.

Companion to [UX_Overhaul.md](UX_Overhaul.md). That document defines *what* the personas need.
This one maps it onto the **code that exists today**: what blocks it, what can be recycled as-is,
what has to be split, and in what order to do it.

**Verdict up front: restructure, don't rebuild.** The domain layer (`exportUtils`, `importUtils`,
`projectDescriptorUtils`, `lib/audio`) is already mode-agnostic, and every major panel is already a
self-contained `isOpen`/`onClose` component. The only thing that actually enforces "zero → full pro
setup" is the **shell in `App.tsx`** — one 5656-line component and one boolean gate. That is the
piece to replace.

---

## 1. What the entry flow actually does today

| Step | Where | Behaviour |
|---|---|---|
| App boots | [App.tsx:180](src/App.tsx#L180) | `isWelcomeActive = true` |
| Gate | [App.tsx:4160](src/App.tsx#L4160) | `isWelcomeActive && !workHandle` → renders `SetupWizard` full-screen, `z-[100]`. **Nothing else can render.** |
| Wizard | [SetupWizard.tsx:17](src/components/SetupWizard.tsx#L17) | `INTRO → EXPLAINER (5 slides) → SELECT_WORK → SELECT_BACKUP → PROJECT_TITLE` |
| Completion | [App.tsx:4162-4180](src/App.tsx#L4162-L4180) | Sets both handles → `saveDirectoryHandle` → `handleSmartScan` → either creates a project or opens Project Manager |
| Escape hatch | [App.tsx:4181](src/App.tsx#L4181) | `onSkip` → a raw `window.confirm` → "browser cache mode". Undocumented, unbranded, and still lands you in the full pro workspace. |
| Main shell | [App.tsx:4191](src/App.tsx#L4191) | `TapeSelector` sidebar + header + `FileBrowser` + 6×6 grid — all assume a loaded project |

So there is exactly **one** door, and it demands a work folder + (optional) SD card + a project name
before you see anything. Everything else — browsing, presets, config, the editor — lives behind that
door as an overlay.

---

## 2. Inventory against the three target tiers

The user goal is three clearly separated entry points:

- **Tier 1 — Browse.** Samples and packs, preview, download. No project, no folder permission.
- **Tier 2 — Preset → SD.** Pick a curated project, write it to the SD card. No project ownership.
- **Tier 3 — Studio.** The current full workspace.

### Tier 1: Browse — ~80% exists, wrong container

| Asset | Lines | State |
|---|---|---|
| [SampleBrowser.tsx](src/components/SampleBrowser.tsx) | 1193 | The whole browser: remote packs, user library, project sources, custom folders, preview player, multi-select, bulk actions. **Recyclable core.** |
| [samplePacks.ts](src/data/samplePacks.ts) | 92 | `fetchSampleManifest()` — packs + presets from `public/manifest.json`. Zero project coupling. **Use as-is.** |
| [LocalFolderBrowser.tsx](src/components/LocalFolderBrowser.tsx) | 859 | OS folder tree. Needs a handle but not a project. **Use as-is.** |
| [exportSingleFile / exportSingleTape](src/utils/exportUtils.ts#L906) | — | Already download without touching a project. **Use as-is.** |
| [SamplePackModal.tsx](src/components/SamplePackModal.tsx) | 514 | **Dead code** — zero imports. Superseded by SampleBrowser. Delete or harvest its card layout. |

Blockers: `SampleBrowser` is opened only from `showSampleBrowser` inside the shell
([App.tsx:5228](src/App.tsx#L5228)), rendered inside an `Rnd` draggable window, and its props require
`userLibrary`, `projects`, `currentFiles`, `workHandle`. All are satisfiable with empty defaults —
they just aren't optional yet.

### Tier 2: Preset → SD — the flow exists, but is misrouted

This is the highest-value, lowest-cost win, because both halves already work:

- [PresetsPanel.tsx](src/components/PresetsPanel.tsx) already renders preset cards with cover art,
  pack badges, progress, **and** a "SD ZIP" direct download when `sdExportUrl` is set
  ([PresetsPanel.tsx:216](src/components/PresetsPanel.tsx#L216)).
- [exportSDStructure](src/utils/exportUtils.ts#L545) supports `directWrite` with either a supplied
  `destinationHandle` **or its own picker** ([exportUtils.ts:548-567](src/utils/exportUtils.ts#L548-L567)).
  It needs `AppState` + options — **not** a work folder, not a project name.

The blocker is `handleLoadPreset` ([App.tsx:1238](src/App.tsx#L1238)). It does five things in one:
fetch descriptor → hydrate blobs → dedupe a name against `foundProjects` → **write a local project to
`workHandle`** → load into the live editor as the current project. Steps 3–5 are Tier-3 concerns
forced onto a Tier-2 user.

**Fix:** split it into `hydratePreset(entry) → AppState` and give it two consumers:
`adoptAsProject(state)` (Tier 3, today's behaviour) and `writeToSD(state, sdHandle)` (Tier 2, new —
a thin call into the existing `exportSDStructure`). No new export logic is needed.

### Tier 3: Studio — exists, needs to become one mode among several

`App.tsx` shell, `TapeSelector`, `SlotGrid`/`SlotGrid6x6`/`AllViewGrid`, `FileBrowser`,
`ProjectManager`, `WaveformEditor`, sync/export modals. Keep all of it. The work here is extraction,
not redesign.

### Cross-tier: Config & Editor (personas 2 and 3)

- [ConfigModal.tsx](src/components/ConfigModal.tsx) (461 lines) takes `config`, `projects`,
  `currentProjectName`, `workHandle`, `sdHandle`. It reads/writes `config.txt` via
  `generateConfigText`/`parseConfigText` ([exportUtils.ts:35](src/utils/exportUtils.ts#L35),
  [exportUtils.ts:1445](src/utils/exportUtils.ts#L1445)) — both pure functions on `ProjectConfig`.
  Standalone config mode is nearly free: hold a `ProjectConfig` in local state, write straight to an
  SD handle. This answers the open question in UX_Overhaul.md ("config.txt is maybe not a necessity
  per project?") — **make it device-scoped by default, project-scoped as an override.**
- [WaveformEditor.tsx](src/components/WaveformEditor.tsx) (4722 lines) is the hard one. Its props are
  already file-shaped (`slot`, `versions`, `activeVersionId`, `onSave`, …) rather than
  project-shaped, so a single-file mode is viable — but `EditorSlot`, the version-history sidebar and
  the cleanup panel assume a project on disk. **Defer to a later phase.** Tier-1 users get
  "download original" now; "edit without a project" comes after the shell split.

---

## 3. Structural conflicts (the actual blockers)

These are what stop the tiered model, in rough order of severity.

1. **The boolean gate.** [App.tsx:4160/4191](src/App.tsx#L4160) is a binary: wizard *or* studio.
   There is no third state. Needs to become a mode enum.
2. **Monolithic shell.** `App.tsx` is 5656 lines with ~60 `useState` hooks. Every handler — preset
   loading, library scanning, sample import, SD sync — is a closure inside the studio component. A
   browse-only mode cannot reach `handleSampleImport` without dragging in the whole file.
3. **Global single-slot persistence.** [persistence.ts:36](src/utils/persistence.ts#L36) autosaves
   one `AppState` to IDB, and [App.tsx:1212-1224](src/App.tsx#L1212-L1224) flags *any* state change as
   unsaved. A Tier-1 or Tier-2 session that touches `state` will pollute the studio's autosave and
   raise phantom "unsaved changes" warnings. **Tier 1/2 must never write the global state slot.**
4. **Manual modal z-stack.** The ESC handler at [App.tsx:592-684](src/App.tsx#L592-L684) is a
   hand-ordered `if` chain over ~15 boolean flags. Adding modes multiplies this. Replace with a
   view/overlay stack.
5. **No routing.** No router dependency; `vite.config.ts` sets `base: '/spotykach_WAV_builder/'` for
   GitHub Pages. Deep links to Browse/Presets/Config are impossible today — and shareable links are
   the whole point of a public browser tier. **Hash routing is the cheap correct answer** (`#/browse`,
   `#/presets`, `#/studio`); no server config, no 404 rewrite needed on Pages.
6. **Permission demanded too early.** `showDirectoryPicker` fires in wizard step 3, before the user
   has seen anything. Tiers 1–2 must run with **no** filesystem permission until the moment of an
   actual write.
7. **News modal auto-opens** keyed on `isWelcomeActive` ([App.tsx:714-725](src/App.tsx#L714-L725)) —
   will fire on every mode entry once the gate changes.

---

## 4. Recycle / refactor / retire

| Component | Verdict | Work needed |
|---|---|---|
| `exportUtils`, `importUtils`, `projectDescriptorUtils`, `lib/audio`, `persistence`, `storageUtils` | **Recycle as-is** | None. Already mode-agnostic. |
| `samplePacks.ts`, `assetUtils` | **Recycle as-is** | None. |
| `SampleBrowser` | **Recycle, loosen props** | Make `userLibrary`/`projects`/`workHandle` optional; add `mode: 'standalone' \| 'project'` to hide "Send to Project" actions when there is no project. |
| `PresetsPanel` | **Recycle, extend** | Add "Write to SD card" alongside "Load into App" / "SD ZIP". Promote from modal to a view. |
| `ConfigModal` | **Refactor** | Accept a null project; add import/export `config.txt` against a bare SD handle. |
| `ProjectManager`, `SlotGrid*`, `TapeSelector`, `FileBrowser`, `AllViewGrid` | **Recycle inside Studio mode** | Unchanged behaviour, just no longer the only shell. |
| `LibraryManager` | **Recycle, promote** | Already largely project-independent; belongs to Browse as much as Studio. |
| `WaveformEditor` | **Refactor later** | Decouple `EditorSlot` + history sidebar from on-disk project. Phase 5. |
| `SetupWizard` | **Demote** | Keep the 5 explainer slides (they're good, and reusable as in-context help). Stop using it as the mandatory gate; it becomes the *Studio* onboarding path only. |
| `WelcomeScreen` (60 lines) | **Retire → harvest** | Dead code, zero imports. Its 3-mode `onSelectMode('LOCAL'\|'SD'\|'BROWSER')` shape is close to the new mode picker — harvest the idea, delete the file. |
| `SamplePackModal` (514), `SyncDashboard` (428) | **Retire** | Both dead code, zero imports. ~940 lines removed before the refactor starts. |

---

## 5. Target architecture

### 5.1 Mode as first-class state

```ts
type AppMode = 'hub' | 'browse' | 'presets' | 'config' | 'editor' | 'studio';
```

- `hub` — the new landing screen. Four doors, no permission prompts, no project.
- Each mode owns its shell (header + content). Only `studio` mounts the TapeSelector + grid.
- Mode ↔ URL hash, so `#/browse` and `#/presets` are shareable.

### 5.2 Capability model instead of "is the wizard done?"

Replace the `isWelcomeActive && !workHandle` gate with capabilities requested **on demand**:

| Capability | Needed by | Requested when |
|---|---|---|
| none | Browse (remote packs), Presets (preview) | never |
| SD write handle | Preset → SD, Config → SD | at the moment of writing |
| Work folder handle | Studio | on entering Studio |
| Both + project | Studio full sync/backup | on first sync |

This is the single change that makes Tiers 1–2 possible: **permission follows intent.**

### 5.3 State separation

- Extract a `ProjectSession` (state + handles + dirty tracking + project handlers) that only Studio
  mounts. Tier 1/2 run without it and therefore cannot touch the global IDB slot.
- `hydratePreset()` returns a detached `AppState` used as a *payload* for SD writing — never assigned
  to the live editor unless the user explicitly adopts it.

### 5.4 Suggested file layout

```
src/
  shell/        AppShell.tsx, ModeRouter.tsx, useAppMode.ts, HubScreen.tsx
  modes/        BrowseMode.tsx, PresetsMode.tsx, ConfigMode.tsx, EditorMode.tsx, StudioMode.tsx
  session/      ProjectSession.tsx  (the extracted App.tsx state + handlers)
  components/   (unchanged — now consumed by modes)
```

---

## 6. Phased plan

Each phase is independently shippable and leaves the app working.

**Phase 0 — Cleanup (low risk, do first)** ✅ *done*
Deleted `WelcomeScreen` (60), `SamplePackModal` (514), `SyncDashboard` (428) — 1002 lines, zero
references between them. Notes on why each was safe:
- `WelcomeScreen` — no onboarding content; the explainer slides live in
  [SetupWizard.tsx:26-100](src/components/SetupWizard.tsx#L26-L100), which is kept.
- `SamplePackModal` — superseded ancestor of `SampleBrowser`, and already non-functional: it read
  `SAMPLE_PACKS`, now a permanently empty array ([samplePacks.ts:92](src/data/samplePacks.ts#L92)).
- `SyncDashboard` — genuinely good design, salvaged as a reference in §8.3 rather than kept in tree.

**Phase 1 — Mode scaffold**
Add `AppMode` + hash routing + `HubScreen`. `studio` renders exactly today's shell, wizard included.
Nothing else changes yet; the wizard now fires on *entering Studio* rather than on app boot.
*Deliverable: four doors on the landing screen, three of them still leading to Studio.*

**Phase 2 — Browse mode (Persona 1)**
Loosen `SampleBrowser` props, mount it full-screen under `#/browse` with no project. Downloads via
the existing `exportSingleFile`/`exportSingleTape`. Add the "SK-ready folder vs. original files"
download choice from UX_Overhaul.md §1.
*Deliverable: a browsable, linkable sample library with zero setup.*

**Phase 3 — Preset → SD (the headline flow)**
Split `handleLoadPreset` into `hydratePreset` + `adoptAsProject` + `writeToSD`. Add "Write to SD" to
`PresetsPanel`, calling `exportSDStructure({ directWrite: true })` with a just-picked handle.
*Deliverable: cold start → curated project on the SD card, no work folder, no project ever created.*

**Phase 4 — Backup & safety rework** (see §8 — prerequisite for the tier split, not a follow-up)
Rename `backupHandle` → `sdHandle`. Make SD-as-project-mirror opt-in. Default `_sk_backups` off.
Replace continuous mirroring with targeted durability (atomic writes + explicit user-placed backups).
*Deliverable: the SD card is a build target again, and builds stop copying 36 WAVs each time.*

**Phase 5 — Config mode (Persona 2)**
`ConfigMode` over a bare SD handle with `config.txt` import/export. Decide device-scoped vs.
project-scoped defaults.
*Deliverable: MIDI setup without entering the studio.*

**Phase 6 — Editor mode + Studio extraction (Persona 3, largest)**
Decouple `WaveformEditor` from the on-disk project for single-file editing, with "save as new
project" as the upgrade path. In parallel, extract `App.tsx` state into `ProjectSession`. Fold the
backup/cleanup rework from UX_Overhaul.md §"Other UX thoughts" in here — cleanup becomes its own
surface rather than an editor sidebar.

**Ordering note:** Phases 1–3 deliver the separation the overhaul is actually about. Phase 6 is where
the 5656-line file finally gets broken up — deliberately *last*, so the risky refactor happens after
the new structure has proven itself, not before.

---

## 7. Open decisions

1. **Landing default.** Hub screen for everyone, or remember the last mode and skip the hub on
   return? (Recommend: hub on first visit, remembered mode after — with the hub always one click away.)
2. **Preset → SD without hydrating audio.** For presets with `sdExportUrl`, downloading the prebuilt
   ZIP is far cheaper than hydrating 36 blobs and re-writing them. Should "Write to SD" prefer the
   ZIP path when available, and fall back to hydrate+write otherwise?
3. **Does Browse mode need the user library?** It's IDB-backed and project-independent, so it *can*
   be there — but it may muddy a "just show me the packs" tier.
4. **Config scope.** Device-level by default (recommended) or per-project, given §"Power User" flags
   it as maybe unnecessary per project.
5. **Tier upgrade prompts.** When a Tier-1 user selects 36 files, do we offer "make this a project"
   inline, or keep the tiers strictly separate?

---

## 8. Backup & durability rework

### 8.1 Three different things are called "backup"

This is the root of the confusion, and the reason the flow feels heavy.

| # | What it is | Where | Cost |
|---|---|---|---|
| 1 | **`backupHandle` — which is just the SD card** | 49 refs in `App.tsx`; the UI that creates it says "Connect SD Card" ([SetupWizard.tsx:394](src/components/SetupWizard.tsx#L394)) | Pure naming confusion. The card is a *build target*, not a backup. |
| 2 | **Projects mirrored onto the SD card** | [`scanProjects(local, backup)`](src/App.tsx#L1836) scans both, merges by name, tags `status: 'synced'\|'local'\|'backup'\|'modified'` + `.local`/`.backup` ([types.ts:111-113](src/types.ts#L111-L113)) | `ProjectSyncModal` (497) + `projectSyncUtils` (404) + `LibrarySyncModal` (501) + `calculateSyncDiff`/`applySyncDiff` all exist to service this duality. |
| 3 | **`_sk_backups/` snapshots** | [App.tsx:296-337](src/App.tsx#L296-L337) — recursive copy of the whole SK folder into `Projects/<name>/_sk_backups/<timestamp>/`, rotating at 5 | Up to 36 WAVs copied *per build*, five deep. This is the "makes the process take longer" complaint, literally. |

### 8.2 What stays basic (always available, no configuration)

- Copy a **preset project to the SD card** (Tier 2)
- **Create or open a project from a preset**
- **Open an existing project**

Nothing in that list requires a mirror, a diff, or a snapshot.

### 8.3 Target model

- **#1 → rename.** `backupHandle` → `sdHandle` throughout. Mechanical, no behaviour change, removes
  the app's own claim that the card is a backup.
- **#3 → default off**, opt-in per build. Already gated by `options.backupSKToProject`, so this is
  nearly free and returns the build time immediately.
- **#2 → explicit opt-in.** "Also keep a copy of projects on the SD card" becomes a setting, default
  off. With it off, `scanProjects` collapses to one source and the `status`/`.local`/`.backup`
  machinery largely evaporates.
- **Backup location is the user's choice.** A backup is an explicit action to a folder they pick —
  not an implicit consequence of having connected an SD card.

**Why this is a prerequisite, not a follow-up:** Tier 2 has no work folder at all. A user going
preset → SD card has nothing to mirror against, so the diff concept is *undefined* in that mode.
The "SD == backup mirror" assumption has to go before the tiers can exist.

**Migration:** existing users have real projects on their cards. Keep the *read* path — "found N
projects on this card, import them?" — and drop only the automatic bidirectional mirror.

> **Design reference for the SD-import compare view.** The deleted `SyncDashboard.tsx` (removed in
> Phase 0) is the best interaction model in the repo's history for App ↔ SD comparison, better than
> the current `ProjectSyncModal` + `SyncComparisonTable` path: per-slot rows with local and remote
> side by side, an inline preview player on *both* sides, staged `PUSH`/`PULL`/`DELETE` actions with
> a pending count, and a single commit button. Start from it rather than from scratch:
>
> ```bash
> git show 72c2893:src/components/SyncDashboard.tsx
> ```
>
> Note it was written against the full bidirectional `SyncDiff` model. Under §8.3 the SD becomes a
> build target, so the compare view is needed for **import only** — the `PUSH` column and the
> "move overwritten files to Pool" footer option largely fall away.

### 8.4 Addressing the actual data-loss risks

The mirroring exists to prevent losing work. It's an expensive and indirect answer. The two real
risks have targeted fixes:

**Interrupted writes.** `createWritable()` truncates the target the moment it opens, so an
interrupted or crashed write leaves a zero-length or partial file — the original is already gone.
Keeping five SK snapshots doesn't help, because the file being destroyed is in `Assets/`, not `SK/`.
*Fix:* write to a temp name, then swap on successful close. This is the single highest-value
durability change and it's local to [`safeWriteBlob`](src/utils/exportUtils.ts#L93).

> Related, worth fixing while in there: `safeWriteBlob` skips the write when the existing file's
> **size** matches the new blob's ([exportUtils.ts:98](src/utils/exportUtils.ts#L98)). Two different
> WAVs of identical byte length are silently treated as identical. Harmless for `Assets/<versionId>.wav`
> (unique id per version, never rewritten with different content), potentially wrong for SD sync.

**A bad app update.** *Fix:* version the `project.json` schema and take a one-time snapshot on
migration — not continuous mirroring on every build.

---

## 9. Version history: bounded, session-scoped

### 9.1 How it works now

- Every edit appends to `FileRecord.versions[]` and becomes the new `currentVersionId`
  ([App.tsx:1983](src/App.tsx#L1983)). **Unbounded.**
- On save, every version's blob is written as its own `Assets/<versionId>.wav`
  ([exportUtils.ts:1108-1130](src/utils/exportUtils.ts#L1108-L1130)).
- All version blobs stay resident in `state.files[].versions[].blob`, and the whole `AppState` is
  autosaved to IndexedDB ([persistence.ts:36](src/utils/persistence.ts#L36)).

So history depth multiplies **disk × memory × IDB** simultaneously. The `CleanupModal` (766 lines)
exists to dig out from under this after the fact.

### 9.2 v4 decision: original + current, nothing else

**Persisted history is exactly two versions per file:** the original (`versions[0]`) and the current
(`currentVersionId`). Everything in between is dropped on save.

- Keep destructive bouncing — it *is* the right approach for real audio processing.
- The editor may keep deeper undo **in session memory**; none of it is persisted.
- On save, collapse `versions[]` to `[original, current]` (a no-op when they're the same record).
  Reopening a project gives you the file as saved, with no history.
- **Cleanup stops being a rescue operation.** The mess no longer accumulates by default, so
  `CleanupModal` becomes a rarely-needed tool rather than damage control. Per UX_Overhaul.md it also
  moves out of the editor sidebar into its own surface.

This is simpler than an N-step limit and removes the "how many steps?" setting entirely. The safety
story is "you can always get back to the original", which is what users actually want from this.

### 9.3 Why a sidecar model isn't a small step

Worth recording so it doesn't get mistaken for a quick win later. `AudioVersion.processing[]` is a
**flat set of tags on a whole version** — `'normalized' | 'trimmed' | 'looped' | 'eq' | 'limited' |
'cut' | 'sliced'` ([types.ts:20](src/types.ts#L20)). It carries no parameters, no time ranges, and
no ordering. `processing: ['normalized', 'cut']` cannot reconstruct anything: it doesn't say by how
much, where, or in which order.

A real sidecar/non-destructive model needs an **ordered op log**, where each entry carries at
minimum:

- `type` — the operation
- `params` — gain in dB, fade curve and length, EQ bands, crossfade, limiter threshold…
- `range` — `{ start, end }` in seconds, since edits apply to *parts* of a file and stack on
  different regions
- `order` / `timestamp` — so overlapping edits on different regions resolve deterministically

That's a different data model, not an extension of the current one. Two existing details show the
shape it would take: `WavMetadata.slicePoints: number[]` ([types.ts:51](src/types.ts#L51)) is
already parameter-level data, and slicing fans out to *multiple* files rather than producing one
derived blob — so the log isn't a pure linear chain either.

**Not a v4 goal.** If op parameters get captured opportunistically while the editor is being touched
in Phase 6, that's a free head start — but it should not shape v4's design, and the two-version rule
above stands regardless.
