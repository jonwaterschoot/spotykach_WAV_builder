# Optimization Plan

Working plan for the `optimize` branch. Written 2026-08-20.

The goal is threefold and in priority order: **fewer lines** (dedupe, delete dead paths),
**less confusion for future work** (obsolete comments, stale docs, misleading names), and
**no avoidable privacy or security surface**. It exists because AI-assisted development tends
to grow a codebase past the size it needs, and that is hard to judge from inside.

Each task below carries the measurements already taken, so picking one up does not mean
re-deriving the survey. **Ranked by payoff per unit of risk.** Land each as its own commit;
they are independent unless stated.

---

## Already done on this branch

| Commit | What |
|---|---|
| `c6da548` | `/next` preview scripts and `/v2` redirect stub retired; deploy documented in README |
| `be32596` | **15 `rules-of-hooks` bugs** — three editor overlays called hooks after an early return |
| `333cc3e` | 7 `let`→`const`; `public/` excluded from linting |
| `dd1a08c` | 5 unused deps removed (108 transitive); ffmpeg CDN pin aligned |
| `185d2ac` | Coffee button uses `--font-header`, dropping a Google Fonts `@import` |
| `4d8a1b4` | Stray divider left behind when the coffee QR code was removed |
| `9c69f8e` | jsdelivr ffmpeg fallback deleted — core loads from our own origin |
| `3d5a34f` | Fonts self-hosted; ffmpeg load timeout dropped; dead `InfoModal.tsx` deleted |

Verified by Jon: editor overlays (automation tool, audio load, loop preview) and a
WAV→FLAC library conversion, both clean in the console.

---

## 1. ffmpeg singleton

**Payoff: high. Risk: medium — needs a concurrency guard, not just a move.**

### The finding

`useAudioConverter` does `useRef(new FFmpeg())`, so every component calling the hook gets its
own instance. Two call sites exist:

- [`src/App.tsx:137`](../src/App.tsx#L137) — `const { convertAudioToWav } = useAudioConverter()`
- [`src/components/LibraryManager.tsx:175`](../src/components/LibraryManager.tsx#L175) — `const { convertWavToFlac, isLoaded, load } = useAudioConverter()`

Both were observed loading in one session: the console showed
`[FFmpeg] Core loaded successfully.` twice. That is the 32 MB wasm downloaded, compiled and
held in memory **twice**.

### Why it is not a straight move to module scope

Three things break if you only hoist `new FFmpeg()`:

1. **Concurrency.** One ffmpeg.wasm instance cannot run two `exec` calls at once. Today the two
   instances are independent, so a conversion in App and one in LibraryManager can overlap
   safely. A shared instance needs the calls serialized — a module-level promise chain
   (`queue = queue.then(task)`) is enough and keeps the public API async either way.
2. **Listener registration.** `ffmpeg.on('log')` and `ffmpeg.on('progress')` are registered
   inside `load()` ([`useAudioConverter.ts:29-36`](../src/utils/useAudioConverter.ts#L29-L36)).
   Register them once at instance creation instead, or they accumulate.
3. **Per-hook React state.** `isLoaded`, `progress` and `isConverting` are `useState` inside the
   hook. With one shared instance the progress events must fan out to every mounted subscriber —
   a module-level `Set<(p: number) => void>`, subscribed on mount and unsubscribed on unmount.

### Shape

Keep the hook's returned API **identical** so neither call site changes. Module scope holds the
instance, the load promise, the subscriber set and the exec queue; the hook becomes a thin React
binding over them.

### Verify

Convert in Library Manager and trigger a WAV conversion from the main app **in the same
session**. Expect one `Core loaded successfully.` instead of two, and correct progress in both
places.

---

## 2. `useEscapeKey` hook

**Payoff: high. Risk: low. Probably the best ratio on this list.**

**18 components** each hand-roll the same effect — add a `keydown` listener, check
`e.key === 'Escape'`, call `onClose`, remove it on cleanup:

```
AboutHelpModal   ConfigModal        ConfirmModal      ExportModal
ExportPreviewModal  FileBrowser     HelpModal         LibraryManager
LibrarySyncModal    LogModal        MiniSlotCard      MissingFilesResolver
ProjectManager      SettingsModal   SlotCard          WaveformEditor
modals/MissingFilesWarningModal     modals/ProjectNameModal
```

At ~6 lines each that is roughly 100 lines, but the real gain is that the pattern stops being
re-implemented — three of these already carry `react-hooks` lint findings (see §7), and each
copy is a chance to forget the cleanup.

Extract `useEscapeKey(onClose: () => void, enabled = true)` into `src/utils/`. Convert in small
batches and click each modal; the failure mode (Escape stops closing something) is obvious but
only shows up at runtime.

---

## 3. Consolidate the formatters

**Payoff: medium. Risk: low, but it is a cosmetic behaviour change — not a pure refactor.**

Four byte formatters exist and **they do not agree**:

| Where | Behaviour |
|---|---|
| [`workspaceBackup.ts:53`](../src/utils/workspaceBackup.ts#L53) `formatBytes` | `B/kB/MB/GB/TB`, integer at ≥100, else 1 decimal. **Exported — the best of the four** |
| [`CleanupModal.tsx:24`](../src/components/CleanupModal.tsx#L24) `formatSize` | `B/KB/MB/GB`, 2 decimals trimmed |
| [`ExportComparisonTable.tsx:54`](../src/components/ExportComparisonTable.tsx#L54) `formatSize` | Always MB, 2 decimals |
| [`SyncComparisonTable.tsx:53`](../src/components/SyncComparisonTable.tsx#L53) `formatSize` | Byte-identical to the above |

Standardising on `formatBytes` changes displayed strings (`1.50 MB` → `1.5 MB`, and small files
stop reading as `0.00 MB`). That is an improvement, but it is a visible change — decide it
deliberately rather than calling it a refactor.

Time formatting is duplicated the same way: `formatDuration` in
[`CleanupModal.tsx:40`](../src/components/CleanupModal.tsx#L40) and
[`BrowseMode.tsx:84`](../src/modes/BrowseMode.tsx#L84), `formatTime` in
[`LogModal.tsx:42`](../src/components/LogModal.tsx#L42) and
[`PlayheadRuler.tsx:138`](../src/components/PlayheadRuler.tsx#L138). Check whether the two
`formatTime`s mean the same thing before merging — one formats a **timestamp**, the other a
**duration**, which is a naming problem as much as a duplication one.

Suggested home: `src/utils/format.ts`.

---

## 4. The three `sanitize*` functions

**Payoff: low lines, high clarity. Risk: medium — touches filenames on disk.**

Three near-identical name sanitizers with three different names and three different scopes:

- [`App.tsx:73`](../src/App.tsx#L73) `sanitizeFilename` (module-local)
- [`LibraryManager.tsx:347`](../src/components/LibraryManager.tsx#L347) `sanitizeFileName` (component-local, and the site of the `no-control-regex` lint finding — that regex strip is deliberate and wants an `eslint-disable` with a reason)
- [`newProject.ts:6`](../src/utils/newProject.ts#L6) `sanitizeProjectName` (exported)

`sanitizeFilename` vs `sanitizeFileName` differing only in capitalisation is exactly the
"misleading names" problem. **Diff their bodies before merging** — these decide names written to
the user's disk and SD card, so a behaviour change here is not cosmetic. If they genuinely
differ, the fix may be better names rather than one function.

---

## 5. The two ComparisonTables

**Payoff: medium. Risk: medium. Do this one last, or not at all.**

[`ExportComparisonTable.tsx`](../src/components/ExportComparisonTable.tsx) (200 lines) and
[`SyncComparisonTable.tsx`](../src/components/SyncComparisonTable.tsx) (143 lines) are the same
component with different item types and decision vocabularies (`export|skip|delete` vs
`overwrite|skip|keep_both`). `diff` is 240 lines across 343 — they have genuinely diverged.

A full merge needs generics over the decision type and is probably not worth it. **Extract the
shared parts instead**: the audio preview play/stop logic and the row layout. The `formatSize`
duplication is covered by §3 regardless.

---

## 6. `App.tsx` and `exportUtils.ts`

**Payoff: unknown until surveyed. Risk: high. Needs its own session.**

[`App.tsx`](../src/App.tsx) is **5,805 lines** and [`WaveformEditor.tsx`](../src/components/WaveformEditor.tsx)
is **5,058** — together a quarter of the 42,880-line `src/` tree. Between them and
[`exportUtils.ts`](../src/utils/exportUtils.ts) (1,630) they hold about half of all lint findings.

Do **not** attempt these in one pass. A generic name-frequency scan produces only noise (the top
hits are locals like `file`, `tape`, `next`). Instead pick a seam and follow it:

- `exportUtils.ts` exports **27 symbols**, many pairs sharing shape — `exportSDStructure` /
  `exportFilesOnly`, `exportSingleTape` / `exportSingleFile`, `saveProjectToDirectory` /
  `loadProjectFromDirectory` / `duplicateProject`. Directory-walk and `safeWriteBlob` call
  patterns are the likely shared core.
- `App.tsx` is a component, so the tractable move is extracting cohesive state groups into hooks
  or a session module — `src/session/ProjectSession.tsx` already exists as precedent.

Start with `exportUtils.ts`: it is pure functions with no JSX, so the changes are testable by
reading, and it is a third the size.

---

## 7. Lint baseline

**Payoff: makes every future change legible. Risk: none.**

Currently **339 problems (303 errors)**, down from 362/325. At that volume a new violation is
invisible — which is how 15 hook bugs accumulated unnoticed.

Five React findings survive triage as code-health rather than bugs, deliberately left for a
decision:

- [`SmartTagInput.tsx:49`](../src/components/SmartTagInput.tsx#L49) — derives suggestions in an effect instead of during render. **The genuine one**; costs a render pass and a frame of stale suggestions
- [`LogModal.tsx:17`](../src/components/LogModal.tsx#L17), [`modals/ProjectNameModal.tsx:28`](../src/components/modals/ProjectNameModal.tsx#L28) — resetting state on open; the idiomatic fix is a `key` prop
- [`CleanupModal.tsx:181`](../src/components/CleanupModal.tsx#L181) — reads `audioRef.current` during render; works only because `progress` state re-renders alongside it

The bulk is `no-explicit-any` (172), `no-unused-vars` (50) and `ban-ts-comment` (47). Clearing
those costs more than it returns at this size. **Demote all three to warnings** in
[`eslint.config.js`](../eslint.config.js) so `error` means "something is broken" and the count
becomes small enough to notice.

The 47 `@ts-ignore`s are also a map of where the types stopped describing reality — a seam with
proven yield, since ~20 File System Access suppressions were already replaced by one declaration
in [`vite-env.d.ts`](../src/vite-env.d.ts).

---

## Decided against

- **A GitHub Actions Pages workflow.** Every merge would publish, ~100 MB through CI per run,
  and the Pages source would move off the `gh-pages` branch, killing the local deploy escape
  hatch. Full build is ~29 s cold / ~5 s warm. See `deployment_guidelines.md` §2.
- **An asset-only deploy fast path.** Would save ~25 s and cost a second deploy path to remember.
- **Removing the storage-namespace derivation** in [`storageNamespace.ts`](../src/utils/storageNamespace.ts).
  41 call sites across 10 files, and it guards `SpotykachDB`'s saved directory handles. The
  comments were rewritten instead; the code stays as a seatbelt.

---

## Standing rules

- One concern per commit, each independently revertable.
- Prefer provable deletions (*nothing imports this*) over refactors needing judgement.
- `npm run build` must stay clean; lint count must not rise.
- Say plainly which changes need a click-test — the editor, the modals and the ffmpeg path
  cannot be verified from a build.
- **Publishing is manual.** Merging to `main` does not update the live site; `npm run deploy` does.
