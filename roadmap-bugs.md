# Roadmap and bug tracking

> **The live list.** What is left before v4 ships, then the roadmap beyond it, then a short done/reviewed
> section that points at where the reasoning is kept.
>
> **v4 "Pervak" is one round from done.** The plan of record is [V4_PERVAK.md](V4_PERVAK.md) and the
> intent behind it is [UX_Overhaul.md](UX_Overhaul.md); both are **prepared for archiving** and move to
> `docs/archive/` when the editor round closes — see *Before the v4 documents move* below. The test pass
> itself is already archived, in full, as
> [docs/archive/v4-test-rounds.md](docs/archive/v4-test-rounds.md).
>
> *Last reconciled against the code: 2026-08-18, when the closed rounds were archived out of this file.*

---

## What is left before v4 ships

Ten test rounds between 2026-08-14 and 2026-08-18 raised **34 numbered findings across the five doors,
and all 34 are built and walked** — S1-8 was the last, built and approved on 2026-08-18. This is the
remainder: one round that was never run, and the paths no round ever touched.

| # | What | Where | State |
|---|---|---|---|
| **1** | **The editor round** — every edit function walked with a project behind it | `WaveformEditor` in Studio | 🔴 **the only thing blocking the release** |
| **2** | **Paths no round has ever exercised** — hardware, a second engine, the backup failure path | [below](#2-paths-no-round-has-ever-exercised) | 🟡 |
| **3** | **Browse on a real phone** — built in round 1, walked only on desktops | [below](#browse-on-a-real-phone--built-never-opened-on-one) | 🟡 not a blocker |

### 1. The editor round

**This is the last round of the v4 test pass and the biggest single piece of work left.** Every other
door is verified; Studio's *door* is verified; what has never been opened is **the editor with a project
behind it**.

**Why the two earlier passes don't stand in for it.** Browse round 3 walked every tool in the
Browse-hosted editor — trim/fade, automation, loop, EQ, pitch, limiter, normalize, cutter, slicer,
stereo — and all of them passed. The test pass's own round 3 then walked the same component in the
standalone `#/editor` door and found nothing either. **Neither host has a project behind it**, and
everything still unassessed is project-shaped.

**What only a project exercises:**

- [x] version history across saves — the first Studio save after the two-version collapse (locked decision 7);
- [x] assigning an edited file to a slot;
- [x] **save unique** and **save copy to pool**;
- [] **cleanup** — a project-wide action, and the reason the modal below was never reachable;
- [] the two shared-component changes from the Browse rounds as they land in Studio's tape editor: the
  editor's close button (R2-3) and its header/history layout (R3-2). `LooseFileEditor` renders the same
  `WaveformEditor`, so the shell change is confirmed in two hosts already — Studio is the third and the
  only one with a project;
- [] **how the two editor hosts should differ.** `#/editor` is a loose file that exits to the hub; Studio's
  tape editor is a slot that exits back to the grid. UX_Overhaul asked for a sketch of that split and
  never got one — the box is closed as a wireframe (2026-08-18), because the answer comes from walking
  the component with a project behind it, which is this round. **If anything about the split still feels
  wrong after the walk, that is a finding, not a drawing.**

**Two known symptoms to reproduce first, in this order:**

1. ~~**The play button can stick after apply and preview.**~~ **Found, fixed and walked 2026-08-18** —
   cause A under [Round 5](#round-5). Intermittent because it needed a preview playing when a new
   version landed, which is why the round had to be every edit function one at a time.
2. **The cleanup confirm modal renders off-screen.** Logged before cleanup moved; it is now reached from
   Project ▸ Advanced rather than the editor sidebar, so reproduce it from there.

**On the "possible overhaul" question.** Walk it before deciding. Two open items already point at the
editor and neither should be started ahead of the round: **auto-save replacing Save** (below) and
**non-destructive editing** (under [Under consideration](#under-consideration)) — the second is
explicitly not a v4 goal.

**Where findings go:** here, under a `### Round 5` heading, and into
[docs/archive/v4-test-rounds.md](docs/archive/v4-test-rounds.md) once they close.

### Round 5

#### Main view

- [x] **Player bug in main view** — playing a file from a tape slot or from the left column did not start
  playback; once it did start it answered neither the spacebar, nor the pause button on the playbar, nor
  the stop button in the left browser panel. **Fixed 2026-08-18 in
  [`src/contexts/AudioPlayerContext.tsx`](src/contexts/AudioPlayerContext.tsx), and walked in every
  situation the same day — play, pause, stop and the spacebar, from the tape slots, the left column and
  both player bars, in All Tapes and in a single tape. All correct; closed.** Three causes, all in the
  one file:
  - **The transport was gated behind a frame.** `stop()` and `pause()` never touched the audio element
    themselves — they handed a callback to `fadeOut`, and the actual `audio.pause()` only ran on the
    final frame of a 15 ms `requestAnimationFrame` chain. Frames stop landing whenever the main thread is
    busy (decoding a waveform, encoding a WAV) and stop altogether when the tab is hidden, so the pause
    could simply never arrive. Worse, every fresh call began with `clearFade()`, which **discarded the
    pending `audio.pause()`** — so pressing the button again actively kept the audio alive. The ramp is
    now cosmetic and the halt belongs to a `setTimeout`; `stop()`/`pause()` also set their state
    synchronously, so the button answers the click rather than the ramp.
  - **A missing blob failed silently.** `AudioVersion.blob` is `Blob | null` by design (missing or
    unreadable files), and `play()` returned on null with only a `console.warn` — after the fade-out had
    already stopped the previous file. Nothing played, and `isPlaying`/`activeFileId` were left pointing
    at the old file, so its card kept offering a STOP for audio that was no longer there. It now resets
    the transport and says what happened.
  - **Two `.catch` paths left `volume` at 0**, which would have made the *next* successful play silent.
- [x] **No player bar in a single tape view.** Added 2026-08-18. The bar was inline in `AllViewGrid`; it
  is now [`src/components/GlobalPlayerBar.tsx`](src/components/GlobalPlayerBar.tsx), used by both views.
  It is placed with `sticky bottom-4`, not `fixed`, so it rides the foot of the scroll column and
  inherits that column's width and left offset — which matters because the browser panel on the left is
  resizable and a `fixed` bar would have had to guess its width. "Last played file" moved into the
  player context (`lastActiveFileId`) so both bars still name the same file across a view switch.
- **On the spacebar:** there is no key handler for it and there should not be — the playbar's play/pause
  control is a real `<button>`, so once clicked it holds focus and the browser fires a click on Space.
  That is why it worked in All Tapes and not in a single tape: the behaviour follows the bar, and the
  single tape view had no bar. It should work in both now, but it is **focus-dependent by nature** — it
  acts on the last thing clicked. If a genuinely global "space always toggles the player" is wanted,
  that is a separate change and it would need to be reconciled with the editor's own Space handler in
  [`WaveformEditor.tsx`](src/components/WaveformEditor.tsx), which grabs and `preventDefault`s every
  Space while it is mounted.

#### Editor in Studio:
- 1. I make a trim, not applied yet, I click "save copy to pool": 
  - What I expect: modal asks "Apply Trim?" - trim / fade is, or is not applied and the original un-applied file remains open, while a copy gets saved in the pool. (a note in e.g. history can show that step)
  - What happens currently: Trim / fade is applied to current file + a trimmed copy is saved in the pool   

- 2. **Loop**
  - after clicking preview and auditioning the result, i want to apply; but a warning modal is shown asking me if i really want to switch tools or discard ... This is buggy behaviour. 
  - What I expect to happen: the loop as set and checked after auditioning with preview is applied

- 3. **EQ** 
  - ran into the not playing bug after doing this:
    - edit eq, click preview; without applying go to new tool, get the question do you want to discard or apply and switch; I chose apply and switch and in the new tool (pitch) the play button wa unavailable, still marked as pause. 
      - returning to EQ also showed the pre-applied window still in preview, with EQ having the marker in the tool slector headers.
     - I would expect since i had applied, that it wouldn't be in preview mode anymore, and that the applied step would just sit in the history as the last step, it did not really apply and the sound was back to pre-EQ in the Pitch window 


**All three built and walked 2026-08-18 — every edit tool exercised, no bugs or unexpected behaviour
left; closed.** The three reports share their plumbing: two of the causes are the shape the main-view
player bug had, a flag whose only reset path is an event that never arrives. In
[`WaveformEditor.tsx`](src/components/WaveformEditor.tsx) unless said otherwise.

- **A — the transport flag survived a reload, and nothing could clear it.** `isPlaying` was reset only
  by WaveSurfer's `'pause'` event, and that event does not come on either path that matters: the
  teardown clears `isMounted` *before* `destroy()`, and the handler is behind that guard; and
  `pause()` on an already-paused instance returns before emitting in both backends. `initEditor`'s own
  `setIsPlaying(false)` sat inside `if (wavesurfer.current)`, which the effect cleanup had already
  nulled — skipped exactly when it mattered. So the reload after an apply came up stuck: the button read
  PAUSE, and pressing it only re-ran the fade-out on an idle instance, which emitted nothing, for the
  rest of the session. There is one `resetTransportState()` now, called by everything that destroys or
  replaces the instance, and `handlePlayPause`/`triggerSafePause` ask the instance rather than the flag.
- **B — "Apply & Switch" ran the trim apply, whatever tool you were in.** The modal called
  `handleSave()`, which bakes region, fades and automation and nothing else — so answering it out of EQ
  wrote a version tagged `trimmed` with the EQ dropped, while the EQ controls stayed dirty behind it
  (hence the marker in the tool header and the preview still showing). Each tool has had its own apply
  all along; `applyActiveTool()` is the map to them, and `resetToolState()` puts the tool's controls
  back afterwards. That is item 3.
- **C — every preview `loadBlob` destroyed the trim region.** `'ready'` fires on each load and used to
  `clearRegions()` and hang a fresh full-width region across the *preview's* duration, so save, apply
  loop, save copy and save unique were all measuring the preview instead of the file — applying a loop
  after auditioning it trimmed a second time. The selection lives in a ref now and `getEditRegion()` is
  the only reader; a preview shows no region rather than a wrong one.
- **Item 2** — `handleApplyLoop` ended with `toggleTool(null)`, which re-ran the dirty check on the
  settings it had just applied and raised the "unsaved changes" modal *after* the work was done. It uses
  `executeToolSwitch(null)` now, like every other apply handler, and resets the loop's own params.
  `handleApplyStereoSplit` had the same line.
- **Item 1** — two separate faults. The button baked the pending trim/fade into the copy without asking;
  it now offers *Copy with edits* / *Copy original* / Cancel, and the open file is untouched either way.
  And [`handleSaveAsCopy`](src/App.tsx) pushed the copy's blob onto the **source** file as its new
  current version — asking for a copy silently applied the pending edit to the file you were editing.
  The history note now carries the source's own current audio, `currentVersionId` does not move, and the
  note is appended rather than prepended, because `versions[0]` is the original by contract
  ([utils/versionHistory.ts](src/utils/versionHistory.ts)) and prepending made the note *be* the
  original.
- **Also seen, not reported:** the pitch tool opened with no region when the switch rode on an apply
  (the blob-change reset clears what `executeToolSwitch` had just seeded); it re-seeds now.
- **Still true and worth a decision:** **ASSIGN TO TAPE** is `handleSave`, so pressing it while an EQ,
  limiter, pitch or cutter setting is pending writes a version without that setting and leaves the tool
  dirty. That is the same trap as B through a different button, and changing what ASSIGN bakes is a
  design call rather than a bug fix.

### 2. Paths no round has ever exercised

Not blockers on their own, but the list should shrink before the release is called done:

- **an engine without `showDirectoryPicker`** — the ZIP and file-input fallbacks from Phases 3 and 5;
- **the `move()` atomic swap on removable media** — known to be *rejected* somewhere real (C1-1), so if
  it never runs on a card either, every SD write is back on the plain path;
- **the workspace backup's failure path** — everything lands in one new folder and a write that dies
  part way removes it. That rollback is the whole point of the surface, and the only way to see it is a
  destination that runs out of room mid-write;
- **the Project Manager against a card that already carries projects** — the migration list;
- **the per-build SK-snapshot toggle**;
- **the auto-save loop under a real edit session** — bounded by the serialising guard, never measured;
- **the Pages build of texture 8** — S1-14's fix is verified in `dist`, but the deployed site is where
  that bug lived.

### Before the v4 documents move

The move itself is Phase 7, step 7.4 in [V4_PERVAK.md](V4_PERVAK.md). Everything still live in those two
files has been carried into this one, so the move is now mechanical:

- ✅ the test-pass record → [docs/archive/v4-test-rounds.md](docs/archive/v4-test-rounds.md);
- ✅ the deployment half of Appendix F → `docs/deployment_guidelines.md`, already a live document;
- ✅ open question 6 (preset & pack authoring) → answered, and the plan is
  [docs/presets-samples/submission-workflow.md](docs/presets-samples/submission-workflow.md);
- ✅ open question 7, the mirror-vocabulary rename, the SD-import compare view and the `config.txt`
  unknown-key question → all under [SD import / build](#sd-import--build) and
  [Settings, backup and project management](#settings-backup-and-project-management) below;
- ✅ **item O — the four wireframing boxes** → closed as built, 2026-08-18. Three shipped without a
  sketch and drawing them now would be documenting backwards; the fourth was answered by the submission
  workflow. The one live question underneath them — how the two editor hosts should differ — moved into
  the editor round above.

**Then:** `git mv V4_PERVAK.md UX_Overhaul.md docs/archive/`, update `docs/README.md` and
`docs/archive/README.md`, and this file plus [CHANGELOG.md](CHANGELOG.md) are the only live documents
again. Version-bump `package.json` when it ships.

*Seven source files carry comments naming `V4_PERVAK.md` or `UX_Overhaul.md` — `App.tsx`,
`ProjectSession.tsx`, `useAppMode.ts`, `newProject.ts`, `presetLoader.ts`, `versionHistory.ts` and
others. They cite the filename and never a path, so the move breaks nothing; they are pointers to the
reasoning and should stay.*

---

## Roadmap — beyond v4

### Editor

#### Stereo splitting

Expand with a better preview of both channels and the option to audition each.

- automate the stereo field
- widen / narrow
- mono the bass
- (merge / mix files — a new tool? a mixer?)

#### Auto-save replacing "Save" 🏗️

The wish is for auto-save to make **Save** obsolete. It can't do that on its own: taking the explicit
save away removes the only point at which the user decides a state is worth keeping, so it has to be
replaced by a way back.

- **Reversible actions (Ctrl-Z / Ctrl-Y) and a history panel** are the price of the feature, not a
  follow-up to it.
- **What gets recorded is the real question** — the same one the editor's history already answers
  in-session, collapsed to two versions on the way out (locked decision 7). **Non-destructive editing**
  under [Under consideration](#under-consideration) is the op-log shape that would make deep history
  affordable.
- **What exists today is a recovery copy, not this.** Settings promises exactly that and no more:
  *"Keep a recovery copy in this browser — so a closed tab or a crash doesn't lose the open project. It
  does not write to your workspace folder, since saving still does that. Turning this off deletes the
  copy."* **That wording is accurate and should not change until the feature does.**

Related: **History & trashcan** under [Under consideration](#under-consideration) is the same territory,
and the unsaved-changes guard built for S1-6 is the shape any answer here has to keep.

#### Unfinished edges of the unsaved-changes guard

From S1-6, and deliberately left outside it: **loading a different project** and **leaving for the hub**
could offer the same "save first" third button the new-project path now has, and the zip-import guard at
[App.tsx:399](src/App.tsx#L399) is still a bare `window.confirm` that proceeds whichever way it is
answered.

### SD import / build

#### Import new files only

An option to import **only new files** into the pool without touching or changing anything already there
— effectively an "import-only preset".

#### Visual feedback: Build vs Import

The "Import / Build SD" button fuses two different actions. Make the distinction clearer and visually
separate them. *(S1-7 gave every preset its own descriptive line and a "Writes to card" badge, which is
the wording half; the two actions still share one button.)*

#### Multiple projects on one card

`SK1/`, `SK2/`, … so a card can hold more than one set of 6×6 tapes. **Firmware question first** —
nothing in the app can make the device read `SK2/`, so the next step is the conversation with @Vlad, not
code. Feasibility: does a boot-time folder scan and a selection UI fit, and what is the ceiling?

**What the app would own if the answer is yes:** numbering and naming (build into `SK<n>/`, renumber to
close gaps, a per-folder title and summary — the notes field is the obvious source); a per-project
`config.txt`; and reading a card back, since `scanSKStructure` finds exactly one structure today.

**The wrinkle to decide early:** boot options — including "is the picker on at all" — have to live
somewhere the device reads *before* it knows which project you want. So the model is a **root
`config.txt` for the device plus an optional per-project one that overrides it**, and Config mode would
have to say clearly which one it is writing.

**Mechanical prerequisite:** `'SK'` is a hardcoded string in **13 places across 6 files**
(`exportUtils`, `importUtils`, `configFile`, `App.tsx`, `SetupWizard`) and would have to become a
parameter first — as one commit, the way `backupHandle → sdHandle` was done.

#### Does the device tolerate an unknown key/value pair?

Blocked on the hardware developer. The app preserves unknown keys through a round-trip either way (built
in Phase 5, and it matters because the field set is expected to grow), but **writing the project title
into `config.txt`** waits on this answer. The parser is strictly positional, so the title has to be a
key/value pair — a comment line would break the file.

#### SD card: prepare an empty project

Erase a card — warn first, show which project is currently on it, confirm it's safe. *(Formatting a card
from the browser is not possible; the Windows 32 GB limit can't be bypassed from here.)*

#### The SD-import compare view was never built

The per-slot comparison derived from the deleted `SyncDashboard`
(`git show 72c2893:src/components/SyncDashboard.tsx` — still the best App ↔ SD view the repo has ever
had). `ProjectManager`'s import button covers the case for now. **Only worth building when SD import
gets real use.**

### Settings, backup and project management

**Built in v4 Phase 7**, and summarised here because it is where a reader will look for it: one settings
surface owns the options in three tabs (Files / Look / System); auto-save exists and defaults on, with
serialised writes and an unsaved-exit warning when it is off; backup and sync left the Project Manager,
which is one list again with the card *read* path intact; and there is one explicit **workspace backup**
— a location picked every time, an itemised list with sizes shown before the picker opens, no default
destination, and one folder that is removed if the write fails partway.

Open:

- **A restore path.** The backup describes its contents and not how to put them back. Wanted: an "import
  workspace / restore" action in the app, and a new-computer setup section written into the `.txt` that
  ships inside the backup.
- **Suggest a backup now and then**, with an opt-out of the reminder.
- **One sync entry point survived.** The library → SD sync still has a button in `LibraryManager`
  (`onOpenLibrarySync`). Phase 7's table only covered the Project Manager, and workspace backup now
  covers the need — worth removing next time someone touches that file.
- **The mirror vocabulary is still in the types.** `status: 'synced' | 'local' | 'backup' | 'modified'`
  plus `.local`/`.backup`, kept because cards still carry projects that `scanProjects` merges. The dead
  states stopped *rendering* in Phase 7; the rename is still open, **as one mechanical commit**.

#### Project Manager overview

The list gets cleaner as a consequence of the above. Still open from the older draft, and worth
revisiting once the sync columns are gone:

- a "recent projects" list in the shape other apps use
- File ▸ Open / Save / Save As, rather than buttons scattered across the modal

### My library manager

- Default view is the first tab, Upload. Add a short info block explaining what this is: your local
  library, files stored here are copied into the workspace, you can also point at folders outside the
  workspace on local drives, and the point of it is a curated set you reuse on the Spotykach.

### Onboarding, news and guides

#### Browse on a real phone — built, never opened on one

The phone layout landed in round 1: the sources list becomes a drawer, the pool becomes a full-screen
sheet, the hero and rows shrink, and the hub tells phone-sized screens that Browse is the door that
works. **All four Browse rounds were walked on a desktop.** The drawer and the pool sheet have never been
touched on a touch screen, which is also where the round-1 decision to make the pen always-visible rather
than hover-only was aimed. Not a blocker — Browse is the only door that claims to work there — but it is
the one part of Browse still unverified. Tunnelling notes are in `docs/MOBILE_TESTING.private.md`
(gitignored).

*(Related, and already fixed: S1-15 — Tailwind v4 gates every `hover:` behind `@media (hover: hover)`, so
until 2026-08-18 all 333 hover rules were inert on a touchscreen machine.)*

#### Onboarding for newcomers

After "start new setup", show a welcome screen that says what the wizard is about to do. When creating a
first project, offer a blank project **or** a preset.

*(Currently one preset ships — the Hainbach project, all 36 slots occupied. A second, mixing samples from
several packs and deliberately leaving slots free for customisation, is worth building. **Explicitly not
a v4 blocker** — decided during the Preset → SD test round, 2026-08-16.)*

An interactive walkthrough — not a video — that steps through the app and explains features.

#### Projects and sample packs guide

Link the guide from the info section and embed it as HTML in the page, most likely as a new tab in the
existing help/info modal.

#### News

Now renders inline on the hub beneath the doors. The covering auto-open modal is gone.

### Under consideration

- **Preset & pack authoring — step 1 is the next real piece.** ✅ The *shape* was answered 2026-08-16 and
  the plan is [docs/presets-samples/submission-workflow.md](docs/presets-samples/submission-workflow.md):
  the app guides creation of both presets and packs and hands back the files; the submitter sends them
  over email or Discord (audio via WeTransfer or Drive); the maintainer commits them. No pull requests
  from strangers, no CI gate, no backend, no dedicated authoring surface. **Step 0 is built** — the
  Presets door says where presets come from and links the guide. **Step 1 is the highest-value piece
  left:** the settings-only export downloads a ZIP the guides don't mention, names every descriptor
  `"Untitled Project"`, derives no `requiredPacks` and checks nothing — so what the app hands a submitter
  today is not yet a submission. Step 2 is the same treatment for a sample pack, step 3 is naming a
  destination anywhere at all.
- **Project images** — attach an image to a project for visual identity, reused as the cover when the
  project is shared as a preset. Incorporating it in the sample manager up front would make it cheap
  later.
- **History & trashcan** — a trashcan for deleted files with restore, plus undo/redo for editor actions.
  Three icons: undo, redo, and a list of all actions. *(v4 caps persisted history at original + current,
  so this is about session memory and deletions, not version depth.)*
- **Non-destructive editing** — an ordered op log with parameters and ranges, rather than the flat
  `processing[]` tag set. A different data model, not an extension; the reasoning is Appendix E.3 of
  [V4_PERVAK.md](V4_PERVAK.md). **Explicitly not a v4 goal — don't let it creep in.**
- **Right-click context menu** for cards: edit, remove from slot, remove from project, delete, move to
  tape X, show in browser panel.
- **Offline sample packs** — download the GitHub packs instead of only streaming them.

### Long term (not in scope for now)

- **Desktop app** — Electron/PWA wrapper for native open/save dialogs and fully offline use.
- **Cloud sync** — Google Drive / Dropbox?
- **Mobile optimisation** — better tablet/phone layout. *(Not a priority given the interface's
  complexity.)* Touch support needs further testing, larger targets, and there are Firefox
  drag-and-drop issues on Windows and Android.

---

## Done / Reviewed

### The v4 test pass — 34 findings, ten rounds ✅ *(2026-08-14 → 2026-08-18)*

Archived in full: **[docs/archive/v4-test-rounds.md](docs/archive/v4-test-rounds.md)**. Browse over four
rounds (R1–R4, 15 findings), then Preset → SD (P1-1), Device Config (C1-1), the sample-row drag (D1-1),
Edit One File (no findings) and Studio (S1-1 … S1-15). All of it is built and walked. S1-8 was the last:
built, then walked in the build modal alongside S1-7 and approved, both on 2026-08-18.

Three are worth remembering, because in each the cause was not where it looked:

- **S1-15** — Tailwind v4 wraps every `hover:` in `@media (hover: hover)`, so 33KB of hover styling, 16%
  of the CSS, had been inert on touchscreen machines since the first commit. Fixed with one
  `@custom-variant hover (&:hover)` line in [src/index.css](src/index.css).
- **P1-1** — "Write to SD card" hydrated 36 files *before* opening the picker, so the click's transient
  activation had expired by the time the browser was asked for a dialog. The picker moved to the front
  and became its own explained step.
- **C1-1** — `move()` is on `FileSystemFileHandle.prototype` whether or not the runtime will honour it
  for a user-picked folder, so the feature test said yes and the write said no. The first real attempt
  is the feature test now, and a rejected swap no longer fails the write.

### v4 Pervak — the UX overhaul *(2026-08, phases 0–6)*

Full write-up in [V4_PERVAK.md](V4_PERVAK.md) until it moves to `docs/archive/`; short version of what
closed items that used to sit in this file:

- **"Adjust the current app vs. build a new one"** — settled as *restructure, don't rebuild*. The domain
  layer was already mode-agnostic; the shell was the only thing enforcing "zero → full pro setup".
- **The four user roles get their own access** — built as five hub doors with hash routing
  (`#/browse`, `#/presets`, `#/config`, `#/editor`, `#/studio`), all linkable, none demanding a
  workspace up front. Preset → SD turned out to be a fifth tier the original four-role sketch never
  named.
- **The casual browser** — `#/browse` browses packs, previews, pools a selection and downloads it as
  SK-ready files or an SD-ready 6×6, with no permission prompt anywhere in that path.
- **The hardware configurator** — `#/config` edits `config.txt` against a bare card or as a plain
  download, with no project. Unknown keys survive a round-trip, and the two slice-mode polyphony
  settings from the manual are first-class fields.
- **The single-file editor** — `#/editor` opens one file, edits it, and either downloads it or adds it
  to Browse's pool.
- **Editor cleanup column** — resolved by removing the entry: cleanup is a project-wide destructive
  action and had no business in one file's history sidebar. It lives in Project ▸ Advanced now.
- **Backups making builds slow and complex** — a default build used to write three copies of the same
  audio. It writes `SK/` and nothing else now; SK snapshots and the project-mirror-onto-card are
  opt-ins, both default off.
- **Interrupted writes could destroy the file being replaced** — writes are atomic (temp name, swap on
  clean close), and the size-only equality check is now an explicit content/size/always comparison per
  call site.
- **`.wav` as well as `.WAV`** — already correct in both export paths before v4 was written. SD writes
  are uppercase, single-file downloads lowercase, recent firmware accepts both. **Don't "fix" it.**
- **News on start** — the covering auto-open modal and its preference are gone; news renders inline.
- **Work folder and SD card under the settings icon** — asked for since v3, built in Phase 7.
- **Dead components removed** — `WelcomeScreen`, `SamplePackModal`, `SyncDashboard` (1002 lines, zero
  references), later `SyncOptionsModal` and `ProjectSyncModal`.
- **"Simplified export-only tool"** *(was in Long Term)* — superseded. Browse and Editor mode are that
  tool, and they are part of the app rather than a stripped-down copy of it.

### Earlier

See [CHANGELOG.md](CHANGELOG.md) for released work through 3.7.3, and
[docs/archive/sample_manager_planningnotes.md](docs/archive/sample_manager_planningnotes.md) for the
sample manager planning notes copied out of this file when that work landed in 2.0.1.
