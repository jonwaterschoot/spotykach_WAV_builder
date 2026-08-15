# Roadmap and bug tracking

> Active roadmap ideas, feature requests and bugs, with a done/reviewed archive at the bottom.
>
> **While v4 "Pervak" is in flight**, the phase plan lives in [V4_PERVAK.md](V4_PERVAK.md) and the
> intent behind it in [UX_Overhaul.md](UX_Overhaul.md). Anything below that says *"→ v4 Phase N"* is
> tracked there, not here. When v4 ships, both documents move to `docs/archive/` and **this file plus
> [CHANGELOG.md](CHANGELOG.md) go back to being the only live documents** — see
> [docs/README.md](docs/README.md).
>
> *Last reconciled against the code: 2026-08-15, during the Phase 7 test pass.*

---

## In flight — v4 Pervak

The UX overhaul that used to be described here as an open choice is decided and largely built. The hub
now has five doors — Browse, Preset → SD, Device Config, Edit One File, Studio — each of which runs
with only the permission it actually needs.

What is left is collected in the **Open items** section at the top of [V4_PERVAK.md](V4_PERVAK.md).
Phase 7 closed everything except **step 6, the test pass** — which is now the only thing blocking the
release:

- ✅ **Storage keys are namespaced** per build, so a preview on GitHub Pages no longer shares state
  with the live app. The production bundle's names are unchanged, so no existing user loses handles.
- **Phases 4–7 have not been verified in a browser**, apart from what the test pass has reached. Build
  and types are clean; most paths have never been exercised against a real SD card or folder picker.
- **Four of the five doors have had no functional pass.** Browse has had one round; Presets, Config,
  Editor and Studio have had none, and the editor's known bugs are unassessed.

---

## The v4 test pass

Phase 7, step 6 in [V4_PERVAK.md](V4_PERVAK.md) — the last thing blocking the release. Findings land
here, round by round.

### Round 1 — workspace backup ✅ *(2026-08-14)*

Written to a folder on a card. The folder was right and the `.txt` describing its contents was there.
Two things it doesn't answer — **no restore path**, and **nothing ever suggests making a backup**.
Both written up under [Settings, backup and project management](#settings-backup-and-project-management)
below, since that is where the work belongs.

### Round 1 — Sample Browser ✅ built, needs re-testing

All six built 2026-08-15; **none of it has been used on real hardware or a real phone.**

- **Max width on very large monitors** — Browse caps its content at 2200px and centres it.
- **A mobile version of the samples page** — the sources list becomes a drawer, the pool becomes a
  full-screen sheet, the hero and rows shrink, and the hub says on phone-sized screens that Browse
  is the door that works and the other four are desktop-only.
- **The pen now says "Edit"**, is always visible rather than hover-only (a hover affordance is
  unreachable on a touch screen), and the two row actions share one grid cell so a source offering
  both can't push the add button onto a second line.
- **One name for the pool.** It was "Selection pool", "Selection" and "APPLY EDIT" for the same
  thing; it is "temporary pool" everywhere now. Opened from Browse, the editor commits with
  **SAVE TO TEMPORARY POOL** and offers **DOWNLOAD** — "Save as project" is gone from that host,
  because the pool's own "Import into a project" already carries the whole selection. The standalone
  `#/editor` door is unchanged.
- **The pool column is wider (400px)** and every row has a play button that auditions the blob as it
  currently stands — the only way to hear an edit without reopening the editor. The two players stop
  each other.
- **Locate points at the pool too** — the browser's locate reveals the file where it came from and,
  when it is also pooled, opens the pool and glows the row.

Still on the list: the drawer and the pool sheet on a real phone.

### Round 2 — Sample Browser, walked in a browser *(2026-08-15)*

Nine items, none built. **R2-1 is the only defect**; the rest are the surface not yet saying what it
means, plus one piece of architecture (R2-4, decided — the pool gets persisted) that R2-9 waits on.
Every item below is self-contained: pick one, read the lines it points at, build it, commit it.

Suggested order — the first four are an hour of work between them and clear the noise, then the two
that change how a screen reads, then the big one:
**R2-5 → R2-7 → R2-6 → R2-2 → R2-1 → R2-3 → R2-8 → R2-4 → R2-9.**

---

#### R2-1 — One player, not two 🐞

*Playing a file from the temporary pool should show in the main player bar.* Today only the browser's
own rows drive the scrub bar; a pool row plays with no scrubber, no name, no locate. Play/pause on the
row works, which is the half that should be kept.

The cause is that round 1 gave the pool its own `<audio>` element ([BrowseMode.tsx:152](src/modes/BrowseMode.tsx#L152))
and then needed a two-way handshake — `onPreviewPlay` + `forceStop` — to stop the two players talking
over each other. **The fix is to delete the second player**, not to duplicate the bar:

- Hand the blob *into* the browser instead. A new optional prop on `SampleBrowser` — a play request
  (`{ key, name, blob }`) that it routes through its existing `handlePlay` as a virtual sample
  ([SampleBrowser.tsx:585](src/components/SampleBrowser.tsx#L585)) — gets the bar, the scrubber, the
  name and locate for free.
- The pool row needs the playing state back, so pair it with `onPlaybackChange(key, playing)`.
- `onPreviewPlay`/`forceStop`, `togglePoolPreview`, `dropPreviewOf` and the `previewUrlRef`
  bookkeeping in BrowseMode all go away with it. Net less code than there is now.
- Keep: the object URL must still be re-minted when an edit replaces a pooled blob.

#### R2-2 — Show that a pool entry has been edited

An edited entry looks exactly like an untouched one. Add an `edited` flag to `PoolItem`, set it in
`applyEdit` ([BrowseMode.tsx:371](src/modes/BrowseMode.tsx#L371)), and accent the row's editor button
when it's true — plus a word in the row's second line, which currently shows duration and origin.

#### R2-3 — The editor's two green buttons

"SAVED TO POOL" and "DONE" sit side by side, both green, both with a check, meaning different things.
Scrap the DONE state: the close button at [WaveformEditor.tsx:4479](src/components/WaveformEditor.tsx#L4479)
should always read **CLOSE** with an X and stay visually secondary. The "you are safe to leave" signal
is the commit button's job, and it already does it.

**Note:** that button is shared with Studio's tape editor, so this changes both. That reads like an
improvement in both — but it is the one item here that touches a surface outside Browse.

#### R2-4 — Persist the temporary pool 🏗️ *(decided 2026-08-15: persist)*

Today it doesn't survive anything: leaving for the hub and coming back, or refreshing, empties the
pool and loses the edit history with it. That was deliberate — the pool is React state that lives and
dies with the mode, which is what let Browse write nothing at all. **Decided: persist it**, so
revisiting Browse from anywhere in the hub finds the selection where it was left.

- **Its own IndexedDB store.** Not the app-state slot — locked decision 5 stays intact and Studio's
  state is untouched. Namespaced through `storageNamespace.ts` like every other store, so a preview
  build never shares a pool with the live app.
- **Store `original + current` per entry**, not just the current blob. That keeps the edit history the
  round-2 note asked about, and it is the same two-version rule the rest of the app follows.
- **Restored on mount.** Careful with the same trap auto-save hit in Phase 7: don't let an empty
  initial state write over the snapshot it is about to be replaced by.
- **"Clear" becomes the way out**, not a refresh — reword it to say what it clears.
- **Say where the files live.** A permanent line on the pool panel: kept in this browser's storage,
  survives a refresh, gone if site data is cleared or the browser evicts it. We can neither prevent
  eviction nor detect it, so the wording should not promise otherwise.
- With this in, **the leaving warning is no longer needed** — but the exit-to-hub path should be
  re-read to make sure it doesn't still claim work will be lost.

#### R2-5 — The UPPERCASE warning is wrong ✂️

`INSTALL_INSTRUCTIONS.txt` in the SD download is [docs/how_to_copy_to_SDcard.md](docs/how_to_copy_to_SDcard.md)
verbatim, and line 67 still says *"⚠️ Folder and File names must be UPPERCASE."* Recent firmware
accepts `B/1.wav` and `B/1.WAV` alike as long as the contents are right — this is already recorded as
settled in the Done section below, so the doc is simply stale. Same sentence is repeated in
[AboutHelpModal.tsx:359](src/components/AboutHelpModal.tsx#L359) and
[HelpModal.tsx:188](src/components/HelpModal.tsx#L188); fix all three to say the app writes uppercase
and the firmware accepts either.

#### R2-6 — The loose download's README must credit per pack

Picking from two packs produces a "Usage context" section that lists both licences with no indication
of which belongs to whom — one CC-BY 4.0 and one WTFPL, run together as if they were a single
statement. `buildLooseReadme` ([BrowseMode.tsx:65](src/modes/BrowseMode.tsx#L65)) flattens
`items.map(i => i.license)` into a `Set` and drops the origin on the floor. Group by origin and print
`[pack / artist] → licence`, the way `generateReadme` already does at
[exportUtils.ts:509](src/utils/exportUtils.ts#L509).

#### R2-7 — The tape-folder checkbox belongs to one button ✂️

"Sort into tape folders" sits below both download buttons ([BrowseMode.tsx:793](src/modes/BrowseMode.tsx#L793)),
so it reads as applying to the SD build as well — which it doesn't. Move it inside the "Download the
files" block, visually bound to that button alone. The loose README refers to it by position too
([BrowseMode.tsx:106](src/modes/BrowseMode.tsx#L106)) — update that sentence with it.

#### R2-8 — The sources column leads with its least obvious source

Curated Library is first *and* carries a filter field, which makes the most prominent thing in the
column the one whose origin is unexplained and whose contents can't be changed from here. Local
Folders, by contrast, earns a place — mounting a folder for a quick browse is exactly what this
surface is for.

- Reorder the column: built-in packs first, then Curated Library and Local Folders at the bottom
  ([SampleBrowser.tsx:761](src/components/SampleBrowser.tsx#L761) onwards).
- Drop the tag filter *input* from Curated. **Decide:** the tag chips too, or just the text field —
  and does this apply in Studio, where the same list is the user's own managed library with a
  Library Manager behind it? Recommendation: standalone only, text field only.
- Add one line under Curated saying where the collection comes from.

#### R2-9 — Link the pool to the workspace 🏗️ *(design; build after R2-4)*

With R2-4 decided as *persist*, this is live. If someone has been to Studio, the pool and the
workspace can know about each other: saving the temporary pool into the workspace, and the Project
Manager listing it with where it currently lives — "still in this browser's storage" or similar. Needs
its own design pass before any code, in particular what notification makes the link legible rather
than surprising, and what happens to the pool once it has been saved into a workspace.

---

## Editor

### Stereo splitting

Expand with a better preview of both channels and the option to audition each.

- automate the stereo field
- widen / narrow
- mono the bass
- (merge / mix files — a new tool? a mixer?)

### Cleanup confirm modal glitches out of sight

The confirmation inside the cleanup flow renders off-screen. **First thing to reproduce when the test
pass reaches the editor**, since cleanup moved to Project ▸ Advanced and the modal is now reached from
a different place than when this was logged.

### Editor bug sweep

Deeper round of testing on the editor specifically, after the five hub doors are walked. Findings go
under **The v4 test pass** above as they are found.

---

## SD import / build

### Import new files only

An option to import **only new files** into the pool without touching or changing anything already
there — effectively an "import-only preset".

### Visual feedback: Build vs Import

The "Import / Build SD" button fuses two different actions. Make the distinction clearer and visually
separate them.

### Multiple projects on one card

`SK1/`, `SK2/`, … so a card can hold more than one set of 6×6 tapes. **Firmware question first** —
nothing in the app can make the device read `SK2/`. Written up as open question 7 in
[V4_PERVAK.md](V4_PERVAK.md), including what the app would own if the answer is yes and the fact that
`'SK'` is a hardcoded string in 13 places across 6 files.

### SD card: prepare an empty project

Erase a card — warn first, show which project is currently on it, confirm it's safe. *(Formatting a
card from the browser is not possible; the Windows 32 GB limit can't be bypassed from here.)*

---

## Settings, backup and project management

**v4 Phase 7, steps 1–4 — built 2026-08-14**, and all of it still waiting on the test pass above.
Summarised here because it is where a reader will look for it:

- ✅ One settings surface owns the options — auto-save, folder locations, history & cleanup, backup —
  in three tabs, Files / Look / System.
- ✅ Auto-save, which genuinely had no callers before. Defaults on, toggleable, writes serialised so a
  snapshot carrying audio blobs can't pile up, and gated on the mount-time load resolving. With it
  off, leaving Studio for the hub warns about unsaved work.
- ✅ Backup and sync left the Project Manager, which is one list again. The card's *read* path stays —
  projects found on a card can still be imported.
- ✅ One explicit **workspace backup**: a location picked every time, an itemised list with sizes
  shown before the picker opens, no default destination, and one folder that is removed if the write
  fails partway.

Open, from the round 1 backup test:

- **A restore path.** The backup describes its contents and not how to put them back. Wanted: an
  "import workspace / restore" action in the app, and a new-computer setup section written into the
  `.txt` that ships inside the backup.
- **Suggest a backup now and then**, with an opt-out of the reminder.

### Project Manager overview

The list itself gets cleaner as a consequence of the above. Still open from the older draft, and worth
revisiting once the sync columns are gone:

- a "recent projects" list in the shape other apps use
- File ▸ Open / Save / Save As, rather than buttons scattered across the modal

### Locations

Work folder and SD card locations under the settings icon, in addition to the inline "Change" in the
Project Manager header. → v4 Phase 7, step 1.

---

## My library manager

- Default view is the first tab, Upload. Add a short info block explaining what this is: your local
  library, files stored here are copied into the workspace, you can also point at folders outside the
  workspace on local drives, and the point of it is a curated set you reuse on the Spotykach.

---

## Onboarding, news and guides

### Onboarding for newcomers

After "start new setup", show a welcome screen that says what the wizard is about to do. When creating
a first project, offer a blank project **or** a preset.

*(Currently one preset ships — the Hainbach project, all 36 slots occupied. A second, mixing samples
from several packs and deliberately leaving slots free for customisation, is worth building.)*

An interactive walkthrough — not a video — that steps through the app and explains features.

### Projects and sample packs guide

Link the guide from the info section and embed it as HTML in the page, most likely as a new tab in the
existing help/info modal.

### News

Now renders inline on the hub beneath the doors. The covering auto-open modal is gone.

---

## Under consideration

- **Project images** — attach an image to a project for visual identity, reused as the cover when the
  project is shared as a preset. Incorporating it in the sample manager up front would make it
  cheap later.
- **Preset & pack authoring** — who makes presets and where. Three shapes floated: force authors
  through the full app; a "export project as preset" path in Studio; or a dedicated authoring surface
  with per-file metadata, tape names, notes and pack info. **Constraint:** `manifest.json` is generated
  by a repo-side script, so without a backend, publishing is a commit, not an upload. Written up as
  open question 6 in [V4_PERVAK.md](V4_PERVAK.md); needs a product decision.
- **History & trashcan** — a trashcan for deleted files with restore, plus undo/redo for editor
  actions. A set of three icons: undo, redo, and a list of all actions. *(Note: v4 caps persisted
  history at original + current, so this is about session memory and deletions, not version depth.)*
- **Non-destructive editing** — an ordered op log with parameters and ranges, rather than the flat
  `processing[]` tag set. A different data model, not an extension; the reasoning is Appendix E.3 of
  [V4_PERVAK.md](V4_PERVAK.md). **Explicitly not a v4 goal.**
- **Right-click context menu** for cards: edit, remove from slot, remove from project, delete, move to
  tape X, show in browser panel.
- **Offline sample packs** — download the GitHub packs instead of only streaming them.

---

## Long term (not in scope for now)

- **Desktop app** — Electron/PWA wrapper for native open/save dialogs and fully offline use.
- **Cloud sync** — Google Drive / Dropbox?
- **Mobile optimisation** — better tablet/phone layout. *(Not a priority given the interface's
  complexity.)* Touch support needs further testing, larger targets, and there are Firefox
  drag-and-drop issues on Windows and Android.

---
---

## Done / Reviewed

### v4 Pervak — the UX overhaul *(2026-08, phases 0–6)*

Full write-up in [V4_PERVAK.md](V4_PERVAK.md); short version of what closed items that used to sit in
this file:

- **"Adjust the current app vs. build a new one"** — settled as *restructure, don't rebuild*. The
  domain layer was already mode-agnostic; the shell was the only thing enforcing "zero → full pro
  setup". Locked decision 1.
- **The four user roles get their own access** — built as five hub doors with hash routing
  (`#/browse`, `#/presets`, `#/config`, `#/editor`, `#/studio`), all linkable, none demanding a
  workspace up front. Preset → SD turned out to be a fifth tier the original four-role sketch didn't
  name.
- **The casual browser** — `#/browse` browses packs, previews, pools a selection and downloads it as
  SK-ready files or an SD-ready 6×6, with no permission prompt anywhere in that path.
- **The hardware configurator** — `#/config` edits `config.txt` against a bare card or as a plain
  download, with no project. Unknown keys written by newer firmware now survive a round-trip instead
  of being silently dropped, and the two slice-mode polyphony settings from the manual are first-class
  fields.
- **The single-file editor** — `#/editor` opens one file, edits it and downloads it, with "save as a
  new project" as the upgrade path.
- **Editor cleanup column** — *"clean history column is on the right, clean button sits where the X
  normally is"*. Resolved by removing the entry: cleanup is a project-wide destructive action and had
  no business in one file's history sidebar. It now lives in Project ▸ Advanced, reachable from
  Settings and the Project Manager.
- **Backups making builds slow and complex** — a default build used to write three copies of the same
  audio. It now writes `SK/` and nothing else; the SK snapshots and the project-mirror-onto-card are
  opt-ins, both default off. Two of the three "backups" turned out never to have been gated at all.
- **Interrupted writes could destroy the file being replaced** — writes are now atomic (temp name,
  swap on clean close), and the size-only equality check that could treat two different WAVs as
  identical is now an explicit content/size/always comparison per call site.
- **`.wav` as well as `.WAV`** — already correct in both export paths before v4 was written. SD writes
  are uppercase, single-file downloads lowercase, recent firmware accepts both. **Don't "fix" it.**
- **News on start** — the covering auto-open modal and its preference are gone; news renders inline on
  the hub.
- **Dead components removed** — `WelcomeScreen`, `SamplePackModal`, `SyncDashboard` (1002 lines, zero
  references), later `SyncOptionsModal`. `SyncDashboard`'s design survives as a written reference in
  Appendix D of [V4_PERVAK.md](V4_PERVAK.md); it is still the best App ↔ SD comparison view the repo
  has had, and the workspace-backup list in Phase 7 starts from it.
- **"Simplified export-only tool"** *(was in Long Term)* — superseded. Browse and Editor mode are that
  tool, and they are part of the app rather than a stripped-down copy of it.

### Earlier

See [CHANGELOG.md](CHANGELOG.md) for released work through 3.7.3, and
[docs/archive/sample_manager_planningnotes.md](docs/archive/sample_manager_planningnotes.md) for the
sample manager planning notes that were copied out of this file when that work landed in 2.0.1.
