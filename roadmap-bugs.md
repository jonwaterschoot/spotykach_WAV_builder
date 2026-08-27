# Roadmap and bug tracking

> **The live list.** What is still open, then the roadmap beyond v4. Nothing closed is kept here — it
> goes to [CHANGELOG.md](CHANGELOG.md) if it shipped, or to `docs/archive/` if it is reasoning worth
> keeping.
>
> **v4 "Pervak" is done.** Eleven test rounds, 38 findings, all built and walked — the full record is
> [docs/archive/v4-test-rounds.md](docs/archive/v4-test-rounds.md). The plan (`V4_PERVAK.md`) and the
> intent behind it (`UX_Overhaul.md`) moved to `docs/archive/` with the release. What v4 changed is in
> the [changelog](CHANGELOG.md).
>
> **The deployed site has been walked.** The two things a local `dist` could never answer — texture 8 on
> the Pages build, and the phone layout on an actual phone — were checked on the live site on
> 2026-08-19: the texture plays, and on the phone the hub, the Sample Browser, the sources drawer and
> the full-screen pool sheet all behave as they do on a desktop. Both left the open list.
>
> **`optimize` is in flight.** A branch for code health rather than features — nine commits so far,
> including fifteen genuine `rules-of-hooks` bugs in the editor overlays, five unused dependencies,
> and the last third-party request needed to render the page. What is left is ranked in
> [docs/optimization-plan.md](docs/optimization-plan.md); the summary lives under
> [Roadmap ▸ Code health](#code-health--the-optimize-branch).
>
> **The submission tool is in flight.** A sixth door, `#/submit`, on the `submission-tool` branch:
> a guided form that collects a whole sample pack or preset submission, checks it, and hands back a
> ZIP to send — replacing the step-by-step half of the submission guide, which is now a signpost. The
> plan and the decisions behind it are
> [docs/presets-samples/submission-tool-plan.md](docs/presets-samples/submission-tool-plan.md).
>
> *Last reconciled against the code: 2026-08-23.*

---

## Open

Nothing here blocks the release. These are the loose ends it ships with.

### 1. Paths no round has ever exercised

Open-ended by nature — each needs hardware, a second machine or a failure that has to be staged. Worth
shrinking over time; not worth holding a release for.

- **A browser without `showDirectoryPicker`** — the ZIP and file-input fallbacks.
- **The `move()` atomic swap on removable media.** Known to be *rejected* somewhere real (C1-1). If it
  never runs on a card either, every SD write is back on the plain path.
- **The workspace backup's failure path.** Everything lands in one new folder and a write that dies part
  way removes it. That rollback is the whole point of the surface, and the only way to see it is a
  destination that runs out of room mid-write.
- **The Project Manager against a card that already carries projects** — the migration list.
- **The per-build SK-snapshot toggle.**
- **The auto-save loop under a real edit session** — bounded by the serialising guard, never measured.
- **The two-version setting** (`collapseHistoryOnSave`, built 2026-08-19) — read by eye, not yet walked
  with a project behind it.
- **Cleanup with a project behind it.** The modal's own bug was found and fixed during Round 5; the
  full project-wide run has still only been read, not walked.

### 2. ASSIGN TO TAPE bakes the wrong thing

`ASSIGN TO TAPE` calls `handleSave`, which writes region, fades and automation and nothing else. Press it
with an EQ, limiter, pitch or cutter setting pending and you get a version without that setting, and the
tool stays dirty. Round 5 fixed the same trap on *Apply & Switch*; what ASSIGN should bake is a design
call, not a bug fix.

---

## Roadmap — beyond v4

### Code health — the `optimize` branch

Active work, not speculation: the branch exists and carries nine commits. Each item below has its
survey already done in [docs/optimization-plan.md](docs/optimization-plan.md) — measurements, file
and line references, and the reason it is shaped the way it is. Ranked by payoff against risk.
**Take one per session**; the plan says explicitly which ones cannot be batched.

**One `useEscapeKey` hook.** Eighteen components hand-roll the same keydown effect — check
`e.key === 'Escape'`, call `onClose`, remove the listener. About 100 lines, but the point is that
the pattern stops being re-implemented; three of the copies already carry lint findings. Best
payoff-to-risk on the list, and the failure mode (Escape stops closing a modal) is obvious the
moment you click it.

**One ffmpeg instance instead of two.** `useAudioConverter` does `useRef(new FFmpeg())`, so
[App.tsx](src/App.tsx) and [LibraryManager.tsx](src/components/LibraryManager.tsx) each download,
compile and hold the 32 MB wasm — confirmed in a console log showing the core load twice in one
session. **Not a straight hoist to module scope:** one instance cannot run two `exec` calls at
once, the log/progress listeners are registered inside `load()` and would accumulate, and the
progress state has to fan out to every mounted subscriber. Keep the hook's returned API identical
so neither call site changes.

**Four byte formatters that disagree** — `B/kB/MB/GB/TB` at one decimal, `B/KB/MB/GB` at two, and
always-MB twice over (byte-identical, in the two comparison tables). Same story for
`formatDuration` / `formatTime`, where one formats a timestamp and the other a duration under
near-identical names. ⚠️ **A decision, not a refactor:** standardising changes what users see
(`1.50 MB` → `1.5 MB`, and small files stop reading as `0.00 MB`).

**Three `sanitize*` functions**, two differing only in capitalisation — `sanitizeFilename`,
`sanitizeFileName`, `sanitizeProjectName`. ⚠️ These decide names written to the user's disk and SD
card, so diff the bodies before merging; the right fix may be better names rather than one
function.

**The two ComparisonTables.** `ExportComparisonTable` (200 lines) and `SyncComparisonTable` (143)
are the same component with different decision vocabularies, but they have genuinely diverged —
240 diff lines across 343. Extract the shared audio-preview logic and row layout rather than
attempting a generic merge. Low priority.

**`exportUtils.ts`, then `App.tsx`.** [App.tsx](src/App.tsx) is 5,805 lines and
[WaveformEditor.tsx](src/components/WaveformEditor.tsx) 5,058 — a quarter of `src/` between them,
and about half of all lint findings. **Do not attempt either in one pass.** Start with
[exportUtils.ts](src/utils/exportUtils.ts): pure functions, no JSX, a third the size, and its 27
exports have obvious pairs (`exportSDStructure` / `exportFilesOnly`, `exportSingleTape` /
`exportSingleFile`) where a shared directory-walk core probably hides.

**Make lint mean something again.** 339 problems, 303 of them errors — at that volume a new
violation is invisible, which is how fifteen hook bugs accumulated unnoticed. Demote
`no-explicit-any` (172), `no-unused-vars` (50) and `ban-ts-comment` (47) to warnings so `error`
means "something is broken". Five React findings survive triage as code-health rather than bugs
and are listed individually in the plan; the genuine one is
[SmartTagInput.tsx:49](src/components/SmartTagInput.tsx#L49), deriving suggestions in an effect
instead of during render.

### Editor

**Stereo tools.** Preview both channels and audition each separately. Then: automate the stereo field,
widen / narrow, mono the bass. *(Merging or mixing two files would be a new tool — or a mixer.)*

**Auto-save instead of Save** 🏗️ — the wish is for Save to become unnecessary. It cannot be done alone:
taking Save away removes the only moment the user says "this state is worth keeping", so **undo/redo and
a history panel are the price of the feature, not a follow-up.** What gets recorded is the real question,
and [non-destructive editing](#under-consideration) is the shape that would make deep history affordable.
*What exists today is a recovery copy, not this — and the Settings wording says exactly that. Don't
change the wording until the feature changes.*

**Finish the unsaved-changes guard.** Two paths still don't offer the "save first" third button that the
new-project path has: **loading a different project** and **leaving for the hub**. The zip-import guard at
[App.tsx:400](src/App.tsx#L400) is still a bare `window.confirm` that proceeds whichever way it is
answered.

**Decide what ASSIGN TO TAPE bakes** — see [Open ▸ 2](#2-assign-to-tape-bakes-the-wrong-thing).

### SD import / build

**Import new files only.** An import that adds to the pool and touches nothing already there.

**Split Build from Import.** One button does both. Separate them visually. *(Each preset already carries
its own line and a "Writes to card" badge — that was the wording half.)*

**More than one project per card** (`SK1/`, `SK2/`, …). **Firmware question first** — nothing in the app
can make the device read `SK2/`, so the next step is a conversation with @Vlad, not code: does a boot-time
folder scan and a picker fit, and what is the ceiling?

If the answer is yes, the app owns numbering and naming, a per-project `config.txt`, and reading a card
back (`scanSKStructure` finds exactly one structure today). **The wrinkle:** boot options — including
"is the picker on at all" — must live where the device reads them *before* it knows which project you
want, so the model is a root `config.txt` plus an optional per-project override, and Config mode has to
say which one it is writing. **Prerequisite:** `'SK'` is hardcoded in 15 places across 6 files and has to
become a parameter first, as one commit.

**Does the device tolerate an unknown key/value pair?** Blocked on the hardware developer. Unknown keys
already survive a round-trip either way, but **writing the project title into `config.txt`** waits on
this answer — the parser is strictly positional, so the title has to be a key/value pair and a comment
line would break the file.

**Prepare an empty card.** Erase a card: warn first, show which project is on it, confirm it's safe.
*(Formatting from the browser is not possible — the Windows 32 GB limit can't be bypassed from here.)*

**The App ↔ SD compare view.** The per-slot comparison from the deleted `SyncDashboard`
(`git show 72c2893:src/components/SyncDashboard.tsx` — still the best version of that view the repo has
ever had). The Project Manager's import button covers the case for now. **Only worth building when SD
import gets real use.**

### Settings, backup and project management

**A restore path.** The backup describes its contents but not how to put them back. Wanted: an "import
workspace / restore" action, and a new-computer setup section written into the `.txt` inside the backup.

**Suggest a backup now and then**, with an opt-out.

**Cleanup as named presets, not three verbs.** The footer's *Clean Custom* / *History Only* / *Clean All*
each say what they keep and what they free (`4 steps · 43.3 MB`) — right information, wrong shape: three
buttons side by side means reading all three before you can pick. Wanted: a list of presets you choose
from, with the manual selection as the escape hatch rather than a peer.

**Remove the last sync entry point.** The library → SD sync still has a button in `LibraryManager`
(`onOpenLibrarySync`). Workspace backup covers the need now — remove it next time someone touches that
file.

**Rename the mirror vocabulary.** `status: 'synced' | 'local' | 'backup' | 'modified'` plus
`.local`/`.backup` are still in the types, kept because cards still carry projects that `scanProjects`
merges. The dead states stopped rendering in v4; the rename is one mechanical commit.

**Project Manager overview** — a "recent projects" list in the shape other apps use, and File ▸ Open /
Save / Save As instead of buttons scattered across the modal.

### My library manager

The default view is the Upload tab and it explains nothing. Add a short intro: this is your local
library, files here are copied into the workspace, you can also point at folders outside it, and the
point is a curated set you reuse on the Spotykach.

### Onboarding and guides

**A welcome screen after "start new setup"**, saying what the wizard is about to do. When creating a
first project, offer a blank project **or** a preset.

**A second preset.** One ships today (Hainbach, all 36 slots full). A second that mixes several packs and
deliberately leaves slots free would show that a project is yours to change.

**An interactive walkthrough** — not a video. Step through the app and explain the features.

**Embed the projects and sample packs guide** in the app, as a tab in the existing help/info modal, and
link it from the info section.

### Under consideration

- **`generate-manifest.mjs` should emit the `presets[]` entry too.** The last piece of the submission
  work — step 4 of the now-archived
  [submission-workflow.md](docs/archive/submission-workflow.md). The script generates the `packs[]`
  entry from a pack folder; the `presets[]` entry beside it is still written by hand. The submission
  tool now hands the maintainer both as JSON, so this is a convenience for packs deployed without one,
  not a gap. *(Its frontmatter parser also breaks on a `key: |` block whose continuation lines contain
  a colon — which is why the tool emits single-line frontmatter and puts the long text in the body.)*
- **Project images** — attach an image to a project, reused as the cover when it is shared as a preset.
  Cheap now if the sample manager carries it from the start.
- **History & trashcan** — a trashcan for deleted files with restore, plus undo/redo. Three icons: undo,
  redo, and the list of actions. *(v4 caps persisted history at original + current, so this is session
  memory and deletions, not version depth.)*
- **Non-destructive editing** — an ordered op log with parameters and ranges instead of the flat
  `processing[]` tag set. A different data model, not an extension; the reasoning is Appendix E.3 of
  [docs/archive/V4_PERVAK.md](docs/archive/V4_PERVAK.md).
- **Right-click menu on cards** — edit, remove from slot, remove from project, delete, move to tape X,
  show in browser panel.
- **Offline sample packs** — download the GitHub packs instead of only streaming them.

### Long term

- **Desktop app** — Electron/PWA wrapper for native open/save dialogs and fully offline use.
- **Cloud sync** — Google Drive / Dropbox?
- **Mobile optimisation** — better tablet/phone layout. *(Not a priority given the interface's
  complexity.)* Touch needs larger targets and more testing, and there are Firefox drag-and-drop issues
  on Windows and Android.

---

## Settled — don't reopen

- **Filename case is already right.** SD writes are uppercase `1.WAV`, single-file downloads are
  lowercase, and recent firmware accepts both. It looks inconsistent and it isn't. Don't "fix" it.
- **Restructure, not rebuild.** The "should we start a new app?" question was settled in v4: the domain
  layer was already mode-agnostic and only the shell enforced "zero → full pro setup".
- **Cleanup does not belong in the editor.** It is a project-wide destructive action; it lives in
  Project ▸ Advanced, not in one file's history sidebar.
- **Non-destructive editing is a different data model, not an extension.** It stays under *Under
  consideration* until someone decides to build it deliberately.
- **No GitHub Actions deploy workflow.** Weighed on 2026-08-19 and declined: every merge would
  publish, ~100 MB of `public/` would move through CI per run, and the Pages source would have to
  leave the `gh-pages` branch — killing `npm run deploy` as a local escape hatch. The merge and the
  publish stay separate acts. A full build is ~29 s cold, ~5 s warm, so there is also **no such
  thing as a change too small to redeploy** and no asset-only fast path is wanted. Reasoning in
  [docs/deployment_guidelines.md](docs/deployment_guidelines.md) §2.
- **`storageNamespace.ts` stays as it is.** The namespace resolves to empty on the live site, so
  the derivation looks like dead code — it is not worth unpicking. 41 call sites across 10 files,
  and it is the boundary for `SpotykachDB`'s saved directory handles, so a mistake there changes
  real users' storage keys. The misleading comments were rewritten instead.

## Where the closed work went

- **What v4 changed** — [CHANGELOG.md](CHANGELOG.md), the 4.0.0 entry.
- **The test pass, all eleven rounds and 38 findings** —
  [docs/archive/v4-test-rounds.md](docs/archive/v4-test-rounds.md).
- **Why v4 was built the way it was** — [docs/archive/V4_PERVAK.md](docs/archive/V4_PERVAK.md) (the plan,
  the locked decisions, the appendices) and [docs/archive/UX_Overhaul.md](docs/archive/UX_Overhaul.md)
  (personas, journeys, intent).
- **Everything before v4** — [CHANGELOG.md](CHANGELOG.md) through 3.7.3, and
  [docs/archive/sample_manager_planningnotes.md](docs/archive/sample_manager_planningnotes.md) for the
  sample manager notes that shipped in 2.0.1.

*Seven source files carry comments naming `V4_PERVAK.md` or `UX_Overhaul.md`. They cite the filename and
never a path, so the move to `docs/archive/` broke nothing; they are pointers to the reasoning and should
stay.*
