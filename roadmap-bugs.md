# Roadmap and bug tracking

> Active roadmap ideas, feature requests and bugs, with a done/reviewed archive at the bottom.
>
> **While v4 "Pervak" is in flight**, the phase plan lives in [V4_PERVAK.md](V4_PERVAK.md) and the
> intent behind it in [UX_Overhaul.md](UX_Overhaul.md). Anything below that says *"→ v4 Phase N"* is
> tracked there, not here. When v4 ships, both documents move to `docs/archive/` and **this file plus
> [CHANGELOG.md](CHANGELOG.md) go back to being the only live documents** — see
> [docs/README.md](docs/README.md).
>
> *Last reconciled against the code: 2026-08-14, after v4 Phase 6.*

---

## In flight — v4 Pervak

The UX overhaul that used to be described here as an open choice is decided and largely built. The hub
now has five doors — Browse, Preset → SD, Device Config, Edit One File, Studio — each of which runs
with only the permission it actually needs.

What is left is collected in the **Open items** section at the top of [V4_PERVAK.md](V4_PERVAK.md).
The three that block a release:

- **Storage keys are not namespaced.** A preview build on GitHub Pages shares an origin with the live
  app and would read and write real project state, including saved directory handles. Nothing goes on
  Pages until this is fixed.
- **Phases 4–6 were never verified in a browser.** Build and types are clean; no path was exercised
  against a real SD card or folder picker.
- **No functional pass over the five doors**, and the editor's known bugs are unassessed.

The rest of the v4 close-out — settings, backup, the browser's pen icon, the test pass — is
**Phase 7** in that document.

---

## Editor

### Stereo splitting

Expand with a better preview of both channels and the option to audition each.

- automate the stereo field
- widen / narrow
- mono the bass
- (merge / mix files — a new tool? a mixer?)

### Cleanup confirm modal glitches out of sight

The confirmation inside the cleanup flow renders off-screen. **First thing to reproduce in the v4
Phase 6 test pass**, since cleanup moved to Project ▸ Advanced and the modal is now reached from a
different place than when this was logged.

### Editor bug sweep

Deeper round of testing on the editor specifically, after the five hub doors are walked. Findings go
here as they are found. → v4 Phase 7, step 6.

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

All of this is **v4 Phase 7**, steps 1–4. Summarised here because it is where a reader will look for
it:

- One settings surface owns the options — auto-save, folder locations, history & cleanup, backup.
- **Auto-save doesn't exist yet** (`saveStateToDB` has no callers). It gets built, defaults on, and is
  toggleable; with it off, leaving Studio for the hub warns about unsaved work. That warning is
  missing today regardless of the setting.
- Backup and sync leave the Project Manager. The card's *read* path stays — projects found on a card
  can still be imported.
- One explicit **workspace backup** replaces them: user picks a location every time, sees an itemised
  list of what it contains with sizes, no default destination.

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
