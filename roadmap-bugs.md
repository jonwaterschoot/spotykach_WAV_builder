# Roadmap and bug tracking

> Active roadmap ideas, feature requests and bugs, with a done/reviewed archive at the bottom.
>
> **While v4 "Pervak" is in flight**, the phase plan lives in [V4_PERVAK.md](V4_PERVAK.md) and the
> intent behind it in [UX_Overhaul.md](UX_Overhaul.md). Anything below that says *"→ v4 Phase N"* is
> tracked there, not here. When v4 ships, both documents move to `docs/archive/` and **this file plus
> [CHANGELOG.md](CHANGELOG.md) go back to being the only live documents** — see
> [docs/README.md](docs/README.md).
>
> *Last reconciled against the code: 2026-08-17, after the Studio round — every file reference in
> **Round 4 — Studio, first pass** below was checked against the source that day.*

---

## In flight — v4 Pervak

The UX overhaul that used to be described here as an open choice is decided and built. The hub has five
doors — Browse, Preset → SD, Device Config, Edit One File, Studio — each running with only the
permission it actually needs.

**Phase 7 closed everything except step 6, the test pass, which is the only thing blocking the
release.** Its state is the table below. Anything not about the test pass is in the **Open items**
section at the top of [V4_PERVAK.md](V4_PERVAK.md).

---

## Round 4 — Studio, first pass 🔧 *(2026-08-17, 2 of 14 built)*

**The last door, walked for the first time.** Fourteen findings, none of them a blocker: nothing here
stops Studio working, and no ✅ elsewhere is put in doubt. They are ordinary rough edges, so each one
below is written to be picked up on its own — what is wrong, where it lives, and what closing it means.

**What this round did *not* cover.** Two things were deliberately left out and each wants a pass of its
own, described under **Not this round** at the end of this section:

- **the editor's remaining faults with a project behind them** — the [editor bug sweep](#editor-bug-sweep),
  which needs every edit function walked one at a time (a play button that can stick after apply and
  preview is the known example);
- **auto-save replacing "save"**, which is a design question, not a fix.

Legend as elsewhere in this file: 🐞 a fault · ✂️ wording · 🏗️ needs a decision before it can be built.

### The list

Each row is meant to be a session on its own. **The three 🏗️ rows need an answer before code**, so don't
start them cold; the rest are described well enough below to open the file and go.

| # | What | Where | Type |
|---|---|---|---|
| **S1-1** | A project opens on one tape, not all six | `App.tsx` | ✂️ ✅ |
| **S1-2** | "Select All" never becomes "Deselect All" (two buttons) | `FileBrowser.tsx` | ✂️ ✅ |
| **S1-3** | Compact rows are fully outlined; want a coloured left border | `FileBrowser.tsx` | ✂️ |
| **S1-4** | The pool has no sorting — alphabetical / by tape, reversible | `FileBrowser.tsx` | 🏗️ |
| **S1-5** | The Sample Browser entry is a bare folder icon; want "Browse +" | `FileBrowser.tsx` | ✂️ |
| **S1-6** | New project doesn't warn about unsaved changes | `App.tsx` | 🐞 |
| **S1-7** | Import presets don't say which of them also write the card | `ExportPreviewModal.tsx` | ✂️ |
| **S1-8** | Clean Mirror doesn't show what it deletes | `ExportPreviewModal.tsx` | 🐞 |
| **S1-9** | Files and System explainers too small to read | `SettingsModal.tsx` | ✂️ |
| **S1-10** | "Reset Visual Effects" lags the window, loses contrast | `SettingsModal.tsx` | 🐞 |
| **S1-11** | Presets and Custom Stored split across the panel | `SettingsModal.tsx` | 🏗️ |
| **S1-12** | Slider reset is double-click only, undiscoverable | `SettingsModal.tsx` | ✂️ |
| **S1-13** | Brightness capped at 2× | `SettingsModal.tsx` | ✂️ |
| **S1-14** | Texture 8 (the mp4) dead on Pages — **cause found** | `App.tsx` | 🐞 |

**Cheapest first, if that matters:** S1-13 and S1-14 are one line each, S1-14 with the fix already
identified. S1-5 and S1-12 are small and local (S1-1 and S1-2 were, and are built). S1-8 is the largest
piece of real work here and the only one that changes what a destructive action does.

### The default view

#### S1-1 — A project opens on one tape instead of all six ✂️ ✅ *built*

Opening a project landed on the single-tape view, so the first thing seen was a sixth of the project.
The all-tapes grid is the overview, and is now what a project opens on.

**The open question is decided: always the entry, never remembered.** Remembering would have meant
persisting the choice — Studio is lazy-mounted per hub visit, so nothing survives leaving the door
anyway — and it would have bought a preference for something that is not one. The single-tape view is
where you go to work on one of the six, and picking that tape is how you say so; there is no state worth
carrying between projects, only a place you were left standing in the last one.

So the default at [App.tsx:124](src/App.tsx#L124) is `'all'`, and every path that makes a *different*
project the live one sets it back:

- **`handleLoadProject`** — opening from the project manager, from a zip import, and the auto-restore on
  entry, which all route through it;
- **`handleCreateEmptyProject`** — six empty tapes are exactly what a new project has to show;
- **`adoptPresetAsProject`** — a preset fills all six, so all six are shown;
- **`handleRestoreAndSync`** — a restore replaces the whole project and lands like an open.

**Renaming and Save-As deliberately don't.** Neither opens anything — you are still in the project you
were working on — so throwing you out of your tape there would be the same rudeness in the other
direction.

### The left pool column — `FileBrowser.tsx`

#### S1-2 — "Select All" doesn't become "Deselect All" ✂️ ✅ *built and walked 2026-08-17*

Once everything was selected the control still said *Select All* and did nothing visible. Both buttons now
flip — the assigned list ([FileBrowser.tsx:480](src/components/FileBrowser.tsx#L480)) and the pool
([FileBrowser.tsx:539](src/components/FileBrowser.tsx#L539)) — on the Library Manager's pattern, with the
`title` tooltip flipping alongside the label.

**Each button only ever owns its own section.** The selection is one set shared by both lists, so
*Deselect All* in the pool removes the pool's ids and leaves an assigned selection standing, exactly as
*Select All* only ever added its own. That is why the flip is per-section state
([FileBrowser.tsx:333-334](src/components/FileBrowser.tsx#L333-L334)) and not one "everything is selected"
flag.

**An empty section never says *Deselect All*.** `[].every()` is true, so without the length guard an
empty pool would offer to deselect nothing.

Fixed alongside: the Library Manager said *Unselect* where this now says *Deselect*
([LibraryManager.tsx:1499](src/components/LibraryManager.tsx#L1499)). One word for one control.

#### S1-3 — Compact rows wear a full outline ✂️

In the minified view every row is ringed by a thin coloured border, which at that density is noise. A
coloured **left** border says the same thing and leaves the row quiet.

`borderClass` at [FileBrowser.tsx:651](src/components/FileBrowser.tsx#L651), applied only when
`isMinified && location`.

#### S1-4 — The pool has no sorting 🏗️

Wanted, and reversible: **alphabetical** (numbers first, then A–Z) and **by tape**. Two open points
before it can be built — whether the chosen sort is remembered, and what it means for drag-reordering,
since a sorted list and a hand-ordered one can't both be the truth at once.

#### S1-5 — The way into the Sample Browser is just a folder ✂️

The plain folder icon ([FileBrowser.tsx:445](src/components/FileBrowser.tsx#L445), `FolderOpen`) doesn't
say that it *adds* anything. Wanted: a **Browse + icon** — a plus inside the folder — with the word
beside it rather than an icon alone.

### New project

#### S1-6 — Creating a new project doesn't warn about unsaved changes 🐞

A new project replaces the open one with no question asked. The import path already does this correctly
— *"…has unsaved changes. Save before importing a new project?"*
([App.tsx:387](src/App.tsx#L387)) — so the guard exists and the new-project path simply doesn't call it.

Auto-save makes this less likely to lose anything, but not impossible (it is off by default for some,
and the recovery copy is browser-local), so the warning is wanted regardless.

### Import and build to SD — `ExportPreviewModal.tsx`

#### S1-7 — The import presets don't say which of them touch the card ✂️

Three import presets sit in one row ([ExportPreviewModal.tsx:705-713](src/components/ExportPreviewModal.tsx#L705-L713))
and nothing distinguishes *reads the card* from *reads the card and then writes it*.

- **"Standard Import" → "Import to pool"** — say the destination, not the tier.
- Each preset states plainly whether it only brings files in (pool, or merged into the project) or
  **also builds onto the card** — which is what *Merge into Project + Mirror* does and never announces.

#### S1-8 — Clean Mirror doesn't show what it deletes 🐞

The most destructive preset on the build side ([ExportPreviewModal.tsx:723](src/components/ExportPreviewModal.tsx#L723),
`push_clean`) makes the card match the project exactly — and the preview doesn't list what that removes.

- **The deletions have to appear in the preview**, named, before the write.
- **Offer to import them into the project pool first**, so "clean" isn't the only way out. Note that
  `push_clean` deliberately skips pooling today ([ExportPreviewModal.tsx:106](src/components/ExportPreviewModal.tsx#L106)),
  so this is a change of behaviour and not just a change of wording.
- **Count the moves.** Where clean mirror shifts a file between slots rather than deleting it, that is a
  move and should be counted and shown as one.

### Settings — `SettingsModal.tsx`

#### S1-9 — The Files and System explainers are too small to read ✂️

Every setting on the first and last tabs carries a small-text explainer that isn't readable at its size.
Either shorten them and set them larger, or move the full text behind an info icon that expands it —
possibly both, a short readable line with the long version on the icon.

#### S1-10 — "Reset Visual Effects" lags the window and can lose contrast 🐞

The button is portalled out of the panel to escape the render filters
([SettingsModal.tsx:553-568](src/components/SettingsModal.tsx#L553-L568)) and positioned with `fixed` plus
a measured `portalPos`. Two consequences:

- **It travels slower than the window.** Dragging the panel disconnects it, and on first opening the Look
  tab it visibly floats into place — the measurement is chasing the layout instead of following it.
- **Its colours can become unreadable**, since the effects it resets are exactly what it sits over.

Two questions to settle together: whether the button can genuinely be placed above the render effects,
and — if not — whether hard black-and-white is the honest answer for a control that must stay legible
whatever the filters are doing.

#### S1-11 — Quick Presets and Custom Stored are one idea split across the panel 🏗️

The named presets sit at the top and the `C1 C2 C3` store buttons at the bottom, so which slot is
*saved* and which is merely *selected* is guesswork.

- **Two labelled sections** — *Presets* and *Custom stored* — instead of two ends of the panel.
- **Highlight the active preset.**
- **Presets** get an icon marking that their settings have been altered, and a reset back to the preset.
- **Custom** get a save icon, since saving is what they are for.

*One note from the round is an unfinished sentence — "after changing a preset: clicking" — and is
recorded here rather than guessed at. It needs a line from the test session before it can be built.*

#### S1-12 — Sliders reset by double-click, which nothing says ✂️

`onDoubleClick={() => resetValue(...)}` with the hint only in a `title` tooltip
([SettingsModal.tsx:651-654](src/components/SettingsModal.tsx#L651-L654)). Wanted: a small circular reset
icon next to each slider's title. The behaviour exists; only its affordance is missing.

#### S1-13 — Brightness stops at 2× ✂️

`max="2"` at [SettingsModal.tsx:648](src/components/SettingsModal.tsx#L648). Raise it — 3× was the
suggestion. A one-line change; worth a look at whether the other filter ranges deserve the same question.

#### S1-14 — Texture 8, the video, is dead on the Pages build 🐞 *(cause found)*

The mp4 texture works locally and not on the deployed site, and the reason is a hardcoded path:

```
<source src="/vid/wavbuilderfullscreen_1.mp4" type="video/mp4" />
```

[App.tsx:5348](src/App.tsx#L5348). Every other asset goes through `resolveAssetPath`, including the
`--master-texture-image` line eleven lines apart in the same feature
([App.tsx:560](src/App.tsx#L560)) — so on Pages, where the app is served under a base path, this single
absolute URL resolves off the site root and 404s. The file itself is committed
(`public/vid/wavbuilderfullscreen_1.mp4`).

**Fix: wrap it in `resolveAssetPath`.** Then check whether anything else hardcodes a leading `/` asset
path the same way, since the local build hides this class of bug completely.

### Not this round — two passes of their own

#### Auto-save replacing "save" 🏗️ *decide before building*

The wish is for auto-save to make **Save** obsolete. It can't do that on its own: taking the explicit
save away removes the only point at which the user currently decides that a state is worth keeping, so
it has to be replaced by a way back.

- **Reversible actions (Ctrl-Z / Ctrl-Y) and a history panel** are the price of the feature, not a
  follow-up to it.
- **What gets recorded is the real question.** Same question the editor's history already raises, where
  it is harder — **R3-1** below settled it there (in-session depth, collapsed to two versions on the way
  out), and **Non-destructive editing** under [Under consideration](#under-consideration) is the op-log
  shape that would make deep history affordable.
- **What exists today is a recovery copy, not this.** Settings currently promises exactly that and no
  more: *"Keep a recovery copy in this browser — so a closed tab or a crash doesn't lose the open
  project. It does not write to your workspace folder, since saving still does that. Turning this off
  deletes the copy."* That wording is accurate and should not change until the feature does.

Related: **S1-6** stays wanted whatever is decided here, and **History & trashcan** under
[Under consideration](#under-consideration) is the same territory.

#### The editor, function by function 🐞 *next testing round*

Not opened in this round. The [editor bug sweep](#editor-bug-sweep) is where it belongs: every edit
function walked one at a time, with a project behind it, hunting the intermittent faults — the known one
being **the play button becoming stuck after apply and preview**. Findings go there, or as a `Round 5`
heading here if the round turns up more than the sweep covers.

---

## The v4 test pass

Phase 7, step 6 in [V4_PERVAK.md](V4_PERVAK.md) — the last thing blocking the release.

### Where it stands

| Door | Rounds | Verdict |
|---|---|---|
| **Browse Samples** (`#/browse`) | 4 | ✅ **Verified on a desktop.** 15 numbered findings raised and closed. The phone layout is the one part never opened on a phone. **Three Browse-side additions of 2026-08-16 are unwalked** — see *Between rounds — the pool became fillable*. The pack→preset link and the row drag were both walked. |
| **Preset → SD** (`#/presets`) | 1 | ✅ **Verified on a desktop.** One blocker found and closed (P1-1 — the write could never open the picker). Card write with its warnings, and the ZIP download, both walked. |
| **Device Config** (`#/config`) | 1 | ✅ **Verified on a desktop.** One blocker found and closed (C1-1 — the atomic swap rejected the write). All four buttons walked: read, write, open `config.txt`, download `config.txt`. There is no ZIP here and none is wanted — it is one text file. |
| **Edit One File** (`#/editor`) | 1 | ✅ **Verified on a desktop.** No findings — the door's own entry, its DOWNLOAD exit and its ADD TO POOL exit all behave. Anything still wrong in the editor is a general editor matter, not this door's; it belongs to the [editor bug sweep](#editor-bug-sweep). |
| **Studio** | 1 | 🔧 **Walked on a desktop, 2026-08-17. Fourteen findings, all open, none a blocker** — the list is **Round 4 — Studio, first pass**, at the top of this file. **The editor with a project behind it was not opened**, so the [editor bug sweep](#editor-bug-sweep) is still the rest of this door — and so are the four Browse-side changes listed below. |

Plus, from [V4_PERVAK.md](V4_PERVAK.md)'s unverified list and untouched by any round so far: the workspace
backup's **failure path** (never run), the Project Manager against **a card that already has projects**,
the atomic `move()` swap on removable media, the SK-snapshot toggle, the auto-save loop under a real
session, and any engine without `showDirectoryPicker`.

### What the Browse rounds changed outside Browse

Five surfaces were touched by findings that began in Browse. **Four are still unwalked in Studio**,
and each is a place where a Browse fix could have broken it:

- **The editor's close button** (R2-3) — shared with Studio's tape editor.
- **The editor's header and history layout** (R3-2) — same component, a structural change.

  *Both were exercised a second time by round 3's Edit One File walk — `LooseFileEditor` renders the
  same `WaveformEditor`, so the shell change is now confirmed in two hosts. Studio's is the third and
  the only one with a project behind it.*
- **Studio's boot** (R4-4) — a session whose folder permission is still live now restores itself
  instead of showing the setup wizard. This changes how Studio opens for *everyone*, not just the
  Browse path.
- **The Project Manager** (R2-9) — one inert row when a temporary pool exists.
- ~~**`createProjectFromState`** (R4-2)~~ — **closed by round 3.** The worry was that `#/editor`
  called it too and had not been opened since the parameter was added. It doesn't: the door's second
  exit is ADD TO POOL, and `BrowseMode` is now the function's only caller
  ([newProject.ts:54](src/utils/newProject.ts#L54)) — a path Browse round 4 walked.

### Round 1 — Preset → SD ✅ *(2026-08-16)*

One finding, raised and closed. **Re-walked after the fix and signed off**: the card write goes
through with its warnings behaving, and the ZIP download works. The door is done for v4.

Two things deliberately not held against it. **A second preset** — one mixing packs and leaving slots
free — is still worth building and is *not* a release blocker; it stays on the list under
[Onboarding, news and guides](#onboarding-for-newcomers). **An engine without `showDirectoryPicker`**
is a different code path from the ZIP button and remains unwalked, as it was before this round.

#### P1-1 — "Write to SD card" could never open the picker 🐞 ✅ *built*

Clicking it showed *"Failed to execute 'showDirectoryPicker' on 'Window': Must be handling a user
gesture to show a file picker."* — the whole tier's only exit, dead on the first click.

The order was the bug. `handleWriteToSD` ran `hydratePreset` first — 36 files off the network — and
only then called `writeToSD`, which is where `exportSDStructure` opens its picker. By that point the
click's transient activation had expired (Chrome gives it about five seconds) and the browser
refused the dialog. The same call worked in Studio only because a connected card meant no picker was
ever opened.

So the picker moved to the front, and since it now has to be its own deliberate step, it says what
it is for:

- **`SDCardWriteModal`** (`src/components/modals/SDCardWriteModal.tsx`) sits between the button and
  the picker, saying the only two things that can go wrong: **pick the card itself, not a folder on
  it** (`SK/` is written inside whatever is chosen), and an existing `SK/` is written through. A
  first draft explained the download, the conversion, the `README.md` and the rename convention as
  well — cut back, since this is a dialog and not the documentation.
- **The picker is the first thing awaited** in the modal's click handler, so the activation is still
  live. `PresetsPanel` owns it now, and hands the chosen root down to the runner as a third
  argument — `PresetsMode` and `App` both pass it on as `destinationHandle`, so `exportSDStructure`
  never opens a second one.
- **An `SK/` already on the card gets a second question**, after the pick and before the write:
  overwrite, or cancel and rename it (`SK_1`, `SK_myContent`) so the module stops reading it.
- **A card the app already holds is offered, never used silently.** Studio's `sdHandle` appears as
  "Use the connected card"; `ensureWritable` runs inside that click, since `requestPermission` needs
  the gesture just as much as the picker does.
- Browsers with no `showDirectoryPicker` are untouched — no card to pick, so the ZIP path runs
  straight through as before. That engine is still unwalked (see the unverified list above).

### Round 2 — Device Config ✅ *(2026-08-16)*

One finding, raised and closed. **Re-walked after the fix and signed off**: all four buttons do what
they say — read from card, write to card, open a `config.txt` from disk, download one. The door is
done for v4.

**No ZIP fallback exists for this door and none should** — `config.txt` is a single text file, so
"Download config.txt" *is* the no-picker path, and it and the file input are now both walked. What
that does **not** cover is an engine without `showDirectoryPicker`: these two buttons were exercised
in Chromium, where the card buttons sit beside them. The layout that hides those two and promotes the
download remains unwalked, as it was before this round.

#### C1-1 — "Write to card" died on the atomic swap 🐞 ✅ *built*

*"Failed to execute 'move' on 'FileSystemFileHandle': The object can not be modified in this way."* —
the bytes were written, the swap onto `config.txt` was refused, and `safeWriteBlob` rethrew, so the
whole write reported failure. The first real exercise of the Phase 4 swap, and it went straight to
the case the feature test can't see.

`move()` shipped for the origin-private file system first and for user-picked folders later, as a
separate feature; the method is on `FileSystemFileHandle.prototype` either way, so
`supportsHandleMove()` said yes and the runtime said no. Nothing observable tells the two apart in
advance.

- **The first real attempt is now the feature test.** A rejected `move()` latches
  `handleMoveRejected` for the session, so a 36-file card write doesn't pay for a doomed temp copy of
  every file. A one-off rejection — a destination locked by another app — costs the rest of the
  session its swap, which is the cheaper of the two mistakes.
- **A rejected swap no longer fails the write.** The bytes are already on the card and complete, so
  they are copied onto the target in place and the scratch file is removed only once *that* has
  closed cleanly. Still ahead of the plain path: if the copy is interrupted, the whole file is in
  `<name>.wbtmp`.
- **A failure *before* the swap still throws**, with the target untouched and the scratch file
  removed, exactly as before.

Two consequences for the unverified list: the swap is now known to be rejected somewhere real, so
"the atomic `move()` swap on removable media" is worth walking on an actual card — and if the swap
never runs there either, every SD write is back to the plain path, which is what the fallback is for.

### Between rounds — the pool became fillable ✅ *(2026-08-16, mostly unwalked)*

Not a finding; a change made while the editor's exits were being reworked, and it needs a pass of
its own before Browse's ✅ still means what it says. **The first bullet was walked from the editor
side in round 3; the three Browse-side ones below it still haven't been.**

- **`#/editor`'s second exit is the pool, not a project.** "Save as project" landed the user in
  Studio with a one-file project. It is now **ADD TO POOL**, writing Browse's own store, with a
  modal offering to open Browse. Pressing it again updates the same entry. ✅ *walked 2026-08-17.*
- **The pool takes files from the desktop.** "Add files" in the pool header opens a file input, and
  the whole column is a drop target. Both go through `loadAndProcessAudio`, so what lands is the
  48 kHz WAV the hardware reads. Dropped folders are refused with a pointer at "Local folders";
  non-audio is counted and reported in one summary rather than a toast per file.
- **The export block folds away**, remembered in namespaced localStorage, so a long pool gets the
  column back.
- **Browse has toasts now** (`useToasts`), which it had no need for until files could fail to decode.

Worth walking: a drop of mixed formats, a drop of a folder, the same file twice, and whether row
reordering still behaves while a file drag crosses the list.

### Between rounds — a pack page points at its preset ✅ *(2026-08-16, walked in both hosts)*

Also not a finding. The pack page offered the ZIP and nothing else, so the one pack that already
exists as a finished card was reachable only by knowing the Presets door was there.

- **"Want this pack in a ready-to-go format for SK? Use the preset."** sits under the ZIP, drawn only
  when a preset's own `requiredPacks` names the open pack — no new manifest field, and it can never
  appear for the library, a project's samples or a mounted folder.
- **The two hosts mean different things by it**, so it is a callback and not a route. Browse leaves
  for `#/presets?preset=<id>`; Studio closes the browser window first and opens its own presets
  panel — which is not cosmetic, since that modal is `z-50` against the browser window's `z-[70]` and
  would otherwise open underneath it. Either way the named card is scrolled to and ringed for six
  seconds; nothing is run, and the card's own buttons are still the only way in.
- **Mode hashes carry query params now** (`hashForMode` / `paramsFromHash`), which is how the id
  survives the trip. `modeFromHash` already stopped at the `?`, so routing is unchanged.
- **The ZIP button says what it is** — "Dry file list · all 36 files, one folder, FLAC format",
  counted and typed from the pack's own sample list rather than written into the button. It is also
  the plain statement of what the preset beside it does differently.
- Fixed in passing: a pack whose links are all ZIPs used to render an empty "Connections" heading.

**Walked in Browse and in Studio on 2026-08-16 — links and wording confirmed in both.** This does
*not* promote Studio's row in the table above: one path through the sample browser was opened, not
the door. Unwalked here: a pack with no preset (the link should be absent), and the phone layout,
which shares Browse's standing exemption.

### Between rounds — sample rows drag into the pool ✅ *(2026-08-17, walked)*

Built after the pack→preset link. **Walked the same day**: the drag, the multi-selection and the
pool opening itself all behave. One finding, raised and closed — the cursor, below.

- **The rows are draggable**, one or many. A drag begun on a selected row carries the whole
  selection, in the order it was selected — the same order and the same import the bulk menu
  already produced; a drag begun on any other row carries just that row. Two or more get a count
  chip under the cursor instead of the one row the browser happened to snapshot.
- **The payload never touches the `DataTransfer`.** A sample's audio is a blob, and object URLs
  minted at dragstart would leak on every drag that ended nowhere. What crosses is a marker MIME
  type (`application/x-spotykach-samples`, new module `src/utils/dragTypes.ts`); the real payload is
  a thunk handed to the host through `onSampleDrag`, and the URLs are minted inside it when a drop
  actually lands.
- **The pool opens itself** when a drag starts, since it is the only target, and the drop overlay
  says how many are about to land. Dropping on a pool *row* is the same as dropping on the column —
  both land at the end, and neither pretends to insert at that position.
- `handleBulkActionWithTarget` was split: `importPathsTo(paths, target)` is now the one path both
  the menu and the drop go through.

Still worth walking, none of it covered by the pass above: a drag from the Curated Library and from
a mounted folder (both are blob-backed, so they exercise the late object URL), a drag begun after
switching packs (the selection resets, so it should carry one row), and whether pool-row reordering
still behaves while a sample drag crosses the list.

#### D1-1 — the cursor said "forbidden" all the way to the pool 🐞 ✅ *built*

Everywhere except the pool column the pointer wore the `no-drop` sign, which reads as *this drag
cannot work* for the whole width of the screen you have to cross to reach the target.

HTML5 drag and drop has no third state: an element that doesn't `preventDefault` its `dragover`
gets that cursor, and a `dropEffect` of `'none'` draws exactly the same thing. So the mode's root
now accepts the drag and does nothing with it — the cursor stays a copy cursor throughout, and the
pool remains the only thing that *looks* like a target, since it is the only one that lights up
green and counts what is coming.

Narrowed to our own drag type on purpose. A file dragged in from the desktop still gets the
browser's default treatment outside the pool column — **including the old hazard that dropping one
on the page navigates away from the app**. Left alone as a separate question, not folded into a
cursor fix.

**Not built, deliberately:** the same drag in Studio. Its browser is a floating window over a grid
that takes project files (`application/x-spotykach-file-id`), not pack samples, so a drop there
would have to import first and assign second — a different feature. Studio's browser simply doesn't
subscribe, and its rows stay undraggable. **`LocalFolderBrowser` rows are also still undraggable** —
mounted folders have their own list component, untouched by this.

### Round 3 — Edit One File ✅ *(2026-08-17)*

**No findings.** The door works as expected, first walk, nothing to fix — the only one of the three so
far that didn't open with a blocker. The entry takes a file from disk, the editor comes up on it, and
both exits do what they say: **DOWNLOAD** hands back the SK-ready WAV, **ADD TO POOL** writes Browse's
store and offers the trip to Browse, with a second press updating the same entry rather than adding a
duplicate. The door is done for v4.

Two things this round settles beyond the door itself:

- **`createProjectFromState`'s second caller doesn't exist.** Listed above as an unwalked consequence
  of R4-2 on the assumption that `#/editor` still called it — it doesn't, and hasn't since the exit
  became ADD TO POOL. Struck from that list.
- **The shared editor shell has now been seen in two hosts.** R2-3's close button and R3-2's header
  are the same `WaveformEditor` here as in Browse, and they behave the same. Studio's tape editor is
  still the third host and still unwalked.

**What this round can't stand in for:** anything the editor only does with a project behind it —
version history across saves, assigning to a slot, "save unique", "save copy to pool", cleanup. Every
outstanding editor complaint is one of those *general* editor matters rather than a fault of this
door, and they belong to the [editor bug sweep](#editor-bug-sweep), to be walked when the test pass
reaches Studio.

### Round 4 — Studio 🔧 *(2026-08-17)*

**Walked, and its fourteen findings are kept at the top of this file** rather than here — they are the
only open work in the test pass, so they sit where they can be picked up rather than at the bottom of a
history. See **Round 4 — Studio, first pass**.

Nothing there is a blocker and nothing there disturbs a ✅ above. What it does *not* close is the door:
the editor with a project behind it was never opened, which is the [editor bug sweep](#editor-bug-sweep)
and the next round.

### Next round

**The editor, function by function** — every edit tool walked with a project behind it, which is the one
host the sweep has never had. Findings go to the sweep, or under a new `### Round 5` heading here if the
round turns up more than the sweep covers.

---

## Closed test rounds — Browse ✅ *(2026-08-14 → 2026-08-15)*

Kept for the reasoning. **Nothing below is open** — the two things these rounds raised that are still
outstanding were filed where the work belongs, not left here: the workspace backup's missing restore
path and backup reminder are under
[Settings, backup and project management](#settings-backup-and-project-management), and the untested
phone layout is under [Onboarding, news and guides](#onboarding-news-and-guides).

### Round 1 — workspace backup ✅ *(2026-08-14)*

Written to a folder on a card. The folder was right and the `.txt` describing its contents was there.
Two things it doesn't answer — **no restore path**, and **nothing ever suggests making a backup**.
Both written up under [Settings, backup and project management](#settings-backup-and-project-management)
below, since that is where the work belongs.

### Round 1 — Sample Browser ✅

All six built 2026-08-15. Verified on a desktop browser across rounds 2–4; **the phone layout below has
still never been opened on a phone** — see [Onboarding, news and guides](#onboarding-news-and-guides).

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
  because the pool's own "Import into a project" already carries the whole selection. It has since
  gone from the standalone `#/editor` door too, replaced by **ADD TO POOL**.
- **The pool column is wider (400px)** and every row has a play button that auditions the blob as it
  currently stands — the only way to hear an edit without reopening the editor. The two players stop
  each other.
- **Locate points at the pool too** — the browser's locate reveals the file where it came from and,
  when it is also pooled, opens the pool and glows the row.

**Superseded by round 2:** the pool's own play button now drives the main player bar rather than a
second `<audio>` (R2-1), and the pool is no longer memory-only (R2-4).

### Round 2 — Sample Browser, walked in a browser ✅ *(2026-08-15)*

Nine items, **all closed**. R2-1 through R2-8 were built as written; **R2-9 turned out not to be a
feature at all** — see below.

---

#### R2-1 — One player, not two 🐞 ✅ *built*

*Playing a file from the temporary pool should show in the main player bar.* Only the browser's own
rows drove the scrub bar; a pool row played with no scrubber, no name, no locate.

The cause was round 1 giving the pool its own `<audio>` element and a two-way handshake —
`onPreviewPlay` + `forceStop` — to stop the two players talking over each other. The second player is
gone rather than the bar duplicated:

- `SampleBrowser` takes a **`hostPlayback`** prop — `{ key, name, blob, nonce }` — and routes it
  through its own `handlePlay` as a virtual sample, so a pool row gets the bar, the scrubber, the name
  and locate for free. `nonce` is bumped per click, which is what makes a second click on the same row
  arrive at all and toggle play/pause.
- **`onPlaybackChange(key, playing)`** hands the row its play state back. Keys are `pool:<id>`, so the
  browser's own paths can never collide with them.
- `hostPlayback = null` means *stop*: Browse retracts the request when an edit replaces the blob or the
  entry is removed, so a stale object URL is never played and the next play mints a fresh one.
- Locate on a host blob has nowhere in the column to jump to, so `playingSampleOrigin` is left null and
  the whole of locate becomes `onLocateInPool` — which now accepts a `pool:` key as well as a source
  path, and reveals the pool row either way.
- `onPreviewPlay`, `togglePoolPreview`, `dropPreviewOf`, `previewUrlRef` and the second `<audio>` are
  all gone. **`forceStop` stayed**: Studio uses it (`App.tsx`) for "the editor is open and owns the
  audio", which is a one-way signal and not part of the handshake. Browse now raises it too, so opening
  the editor over Browse stops the browser's player as well as the pool's used to be stopped.

#### R2-2 — Show that a pool entry has been edited ✅ *built*

`PoolItem` has an `edited` flag, set in `applyEdit`. The row's editor button is accented pink and
persistently tinted when it's true, and the second line leads with **Edited ·** before duration and
origin.

#### R2-3 — The editor's two green buttons ✅ *built*

The close button is now always **CLOSE** with an X, always visually secondary — the green/check DONE
state is gone. "You are safe to leave" is the commit button's signal and it already gives it. As
flagged, this changes Studio's tape editor too, since it is the same button.

#### R2-4 — Persist the temporary pool 🏗️ ✅ *built (decided 2026-08-15: persist)*

The pool used to be React state that lived and died with the mode, so leaving for the hub or refreshing
emptied it and took the edit history with it. It now survives both.

- **Its own IndexedDB store** — `browse-pool` in `spotykach-wav-builder`, DB version 4. Not the
  app-state slot: locked decision 5 stands and Studio's state is untouched. It goes through
  `dbName()` like every other store, so a preview build never shares a pool with the live app.
- **`original + current` per entry.** `PoolItem` carries `originalBlob` alongside `blob`; the store
  writes both. Same two-version rule as the rest of the app, and the thing R2-9 would build on.
- **Restored on mount**, and the restore refuses to clobber: anything added while the read was in
  flight wins. Writes are gated on the load resolving and serialised behind a 600 ms debounce, the same
  shape as Phase 7's auto-save, because every entry carries two audio blobs.
- **"Clear" is now "Empty pool"**, behind a confirm that says what goes: the files leave and their
  edits are forgotten, downloads and imported projects are untouched.
- **A permanent line on the pool panel** says where the files live — this browser's storage, survives a
  refresh and the trip to the hub, gone if site data is cleared, and the browser may evict it on its
  own. No promise beyond that, because eviction is neither preventable nor detectable from here.
- The exit-to-hub path was re-read: Browse never had a leaving warning, so there was nothing claiming
  work would be lost. The editor's discard warning is about unsaved *editor* changes and already says
  that anything saved to the pool stays.

#### R2-5 — The UPPERCASE warning is wrong ✂️ ✅ *built*

All three copies — [docs/how_to_copy_to_SDcard.md](docs/how_to_copy_to_SDcard.md) (which ships verbatim
as `INSTALL_INSTRUCTIONS.txt`), `AboutHelpModal` and `HelpModal` — now say the app writes uppercase and
recent firmware accepts either case, with `B/1.WAV` and `B/1.wav` both shown.

#### R2-6 — The loose download's README must credit per pack ✅ *built*

`buildLooseReadme` groups licences by origin into a `Map` instead of flattening them into one `Set`,
and prints `- [origin] → licence` per pack, with a line saying each licence covers only the files
credited to that pack above. Same shape `generateReadme` uses for a built card.

#### R2-7 — The tape-folder checkbox belongs to one button ✂️ ✅ *built*

The checkbox now lives inside a bordered block with the "Download the files" button and nothing else,
reads **"Sort this ZIP into tape folders"**, and the loose README's sentence about it points at its new
home instead of its old position.

#### R2-8 — The sources column leads with its least obvious source ✅ *built*

- Column order is now **Built-in Packs → Projects (Studio only) → Curated Library → Local Folders**.
- The tag filter *input* is Studio-only, per the recommendation: standalone keeps the chips, which
  describe the list rather than asking the user to type at it. Studio keeps both — there the list is
  the user's own managed library with a Library Manager behind it.
- A line under Curated says where the collection comes from, worded per host: read-only in standalone,
  "add and tag them in the Library Manager" in Studio.

#### R2-9 — Link the pool to the workspace 🏗️ ✅ *resolved 2026-08-15: there is no link, only a label*

**The item dissolved on contact with the code.** `createProjectFromState`
([newProject.ts:34](src/utils/newProject.ts#L34)) already opens `showDirectoryPicker({ id:
'spotykach_work' })` — *the same picker id Studio's wizard uses* — then stores the work handle and sets
`spotykach_current_project`. So "save the pool into the workspace" is what **"Import into a project"
has always done**. The only thing the item proposed adding on top — writing to the workspace *without*
a picker — needs Browse to hold a persistent readwrite directory handle, which is precisely what tier 1
refuses (Appendix C.2, "permission follows intent"), and would not survive a reload anyway; that is why
`handleRestoreSession` exists.

Decided, and built: **lose the link.** Reasons beyond "keep it simple":

- v4 has already deleted this exact shape twice — `SyncDashboard` (1002 lines) and `ProjectSyncModal`
  (497 lines). A live pool ↔ project link is a third sync surface.
- `buildDetachedState` assigns files to slots **by array index**
  ([detachedState.ts:77](src/utils/detachedState.ts#L77)). A round-trip through the pool would silently
  reorder someone's grid and drop notes, tape names, per-file metadata and config on the way.
- The feature sets are asymmetric in Studio's favour, so any shared record would be lossy in one
  direction only.

What shipped instead, which is all R2-9 ever needed to be:

- **A persisted record of the copy.** `copied-into` in the pool's own store, so the note survives the
  refresh that makes it matter. The pool panel reads *"Copied into Studio as X. That copy and this pool
  are not linked — changes here don't reach the project, and saving again makes another new project."*
- **The pool is not emptied by the copy.** Taking away the surface someone was working on because they
  asked for a copy of it is the surprise the item warned about.
- **One inert row in the Project Manager**, above the list, only while the pool is non-empty:
  "Temporary pool — N files kept in this browser's storage, from Browse", marked *not a project*, not
  selectable, with no action on it. It reads a small `summary` key rather than the entries, so
  mentioning the pool never loads its audio. No navigation on it either — routing to `#/browse` from
  inside Studio would go around App's unsaved-changes guard.

**Not built, and no longer wanted:** a "Save into the workspace" button, a pool-shaped project type, and
any notification in Studio beyond that one row.

<details>
<summary>The original design pass, kept for the reasoning</summary>



**What the link is.** One direction only, for now: *pool → workspace*. The pool already has an
"Import into a project" exit that creates a whole new project; this is the smaller, later act of a
visitor who has since been to Studio and now has a workspace. Reading a workspace project back *into*
the pool is not part of this — the browser can already open a project as a source.

**The trigger.** A third button on the pool panel, visible only when a work folder is known:
**"Save into the workspace"**. Not automatic, not a prompt on arrival. The pool is a scratch surface
and the whole reason it reads as safe is that it never acts on its own.

**What it writes.** The pool becomes a project folder like any other, through the same
`createProjectFromState(buildDetachedState(pool), name)` path "Import into a project" uses — the
difference is only that the destination is the known workspace rather than a picker. Which means: no
new on-disk format, no second thing for the Project Manager to understand, and the two-version rule
applies to `originalBlob + blob` exactly as it does to a project's files.

**What happens to the pool afterwards** — *the pool stays*. Deleting it on save would be the surprise
the item warns about: the user asked to save a copy somewhere, not to have the surface they were
working on emptied. Instead each saved entry is marked, and the panel's header says where the copy
went. If the pool is edited afterwards the mark goes stale, which is honest — the mark says "this was
saved", not "this is in sync". A second save is a second project, or an overwrite the user confirms by
name; **it must never silently update the earlier one**, because the pool has no idea what the project
has done since.

**The notification.** The existing `ProjectCreatedModal` is the right surface and already handles the
one thing that matters — offering the trip to Studio. It needs one extra line naming the workspace
folder the project landed in, since unlike the picker flow the user never chose it in the moment.

**The Project Manager's half.** A project created this way is an ordinary project on disk and should
not be labelled as special. What the item actually asked for — the Manager listing the pool with where
it currently lives — is a different, smaller thing: **one row above the project list, present only
while the pool is non-empty**, reading "Temporary pool — N files, kept in this browser" with a link
into Browse. It is not a project, it is not selectable as one, and saying so plainly is the point.

**Open, and the reason to build this after a round 3:** whether a visitor who reaches Studio should be
*told* their pool is still there. A pool sitting in storage that nothing ever mentions again is a
quiet way to lose work; a banner in Studio about a browse-mode scratch pool is noise. Decide that with
the round-3 walk in hand, not before. *(Answered above: the inert Project Manager row, nothing louder.)*

</details>

---

### Round 3 — the Browse editor, walked in a browser ✅ *(2026-08-15)*

**Every editor tool passed.** Trim/fade, automation, loop, EQ, pitch, limiter, normalize, cutter,
slicer, stereo — all behave as intended in the Browse-hosted editor. Two things came out of it, both
built the same day and confirmed in round 4's walk.

#### R3-1 — The history panel called the edit "Original" ✅ *built*

Reopening an edited pool entry showed a single history row labelled **Original** that was actually the
latest version. Two separate causes, and the answer to "are they deleted or just not shown" is *both*:

- **In session they really were deleted.** `handleSave` ran `collapseFileVersions` on *every* commit
  ([EditorMode.tsx](src/modes/EditorMode.tsx)), so the loose editor never held more than two versions
  even with the editor open — giving up the in-session depth that
  [versionHistory.ts:9-12](src/utils/versionHistory.ts#L9-L12) explicitly allows.
- **Across reopens the original was never passed in.** `recordFromLooseFile` built one version out of
  `file.blob` — the *current* blob — and hardcoded `description: 'Original'`.

Fixed on both counts, and the data for it already existed: R2-4 gave the pool `original + current` the
day before.

- `LooseFile` takes an optional `originalBlob`/`originalDuration`; Browse passes both. When they differ
  from the current blob the editor opens on a real `[Original, Current]` pair, so stepping back to the
  file as pooled works after a reopen.
- **Depth is in-session, collapsed on the way out** — the shape Appendix E.2 describes. Every step is
  kept while the editor lives; `collapseFileVersions` still runs at the project exit, and the pool only
  ever receives one blob against the original it already holds. Nothing past two versions reaches disk
  or IndexedDB.

**Considered and rejected: a checkbox to persist every step.** It breaks the locked two-version cap, and
the cost is real — 48 kHz stereo 32-bit float is ~375 KB *per second*, so the 37 s file in the test
screenshot is 14 MB and a full pool is already ~1 GB at two versions. Growing the store we had just
warned the user may be evicted, in order to hold intermediate states, is the wrong trade. If depth
across sessions is wanted later, the shape is the op log in Appendix E.3 (**Non-destructive editing**,
under consideration) — parameters are bytes, not megabytes.

#### R3-2 — The editor header didn't span the modal ✅ *built*

The header lived *inside* the editor column with the history sidebar as its sibling, so the modal's
close ✕ sat to the **left** of a whole panel — the one control that should be furthest top-right was
neither. The modal shell is now a column: header full width with the ✕ at its right end, and the two
columns share the space beneath it. Same blast radius as R2-3 — this is Studio's tape editor too.

---

### Round 4 — pool → project, walked in a browser ✅ *(2026-08-15)*

**The walkthrough passed**, and so did the re-walk of the four fixes it produced — which is what closed
Browse. What came out of it is all one thing: *"Import into a project" is where a browse visitor becomes
a Studio user, and it was treating that as a file operation.*

Two of the four reach outside Browse and are **not** verified there: **R4-4 changes how Studio boots for
every session**, and R4-2 added a parameter to `createProjectFromState`, which the standalone `#/editor`
door also calls — it defaults to the old behaviour, but that host has not been opened since.
(R4-1's `buildDetachedState` is Browse's alone, so it reaches nothing else.)

#### R4-1 — The project didn't inherit the pool's edits ✅ *built*

`buildDetachedState` built one version per file, always described `'Original'` — so an entry edited in
Browse arrived in the project as a single version, the edit wearing the original's name, with no way
back. The same lie R3-1 fixed inside the editor, one layer further out.

`DetachedSample` now takes `originalBlob`/`originalDuration`, and `PoolItem` already had both. When
they differ from the current blob the record is built as `[Original, Edited]` with `currentVersionId`
on the edit. This adds *history*, not depth — it is exactly the pair the project would have collapsed
to anyway. Every export resolves `currentVersionId`, so the two downloads are unaffected.

**Consequence worth knowing:** an edited file now writes two WAVs into `Assets/`, not one. That is the
two-version rule working as designed, and Cleanup sweeps orphans.

#### R4-2 — The picker was asking for a workspace without saying so ✅ *built*

"Import into a project" went straight to `showDirectoryPicker`. But that folder is not a destination —
it is the **workspace**, the single most consequential choice in the app, and it was being made inside
an OS dialog with no explanation and no way to know one had already been made. A returning user was
quietly invited to start a second workspace beside their first.

New `WorkspaceChoiceModal` between the name and the picker. It names the decision, and:

- **When a workspace is already known**, it says so by folder name and offers **"Use your workspace"** —
  which skips the picker entirely. "Choose a different folder" stays as the deliberate alternative,
  and says plainly that it becomes the workspace from now on.
- **When there is none**, it explains what the folder will become before opening the picker.

`createProjectFromState` takes an optional workspace handle; omitted still means "ask". The reused
handle needs its permission back, which is what `ensureWorkspacePermission` is for — and it must be
the **first `await` after the click**, because `requestPermission` needs that click's transient
activation and any earlier await spends it.

#### R4-3 — Offer the setup walkthrough at that moment ✅ *built*

Someone choosing their workspace for the first time is exactly who Studio's setup wizard is for, so the
step offers **"Walk me through setup instead"**. Only when there is no workspace yet — with one already
known the wizard has nothing left to ask. The pool survives the detour, which is a payoff of R2-4:
before it, sending someone to Studio mid-selection would have emptied their pool.

#### R4-4 — Landing on the setup screen instead of the project ✅ *built*

After creating the project, "Open Studio" showed the **setup wizard** — asking the user to re-announce
a decision made seconds earlier, with the project they had just asked for behind it.

The wizard is right for someone who has to *grant* something: `requestPermission` needs a user gesture,
which is what its Restore button provides. But arriving from Browse the permission is already granted,
and `queryPermission` needs no gesture — so a still-granted handle now restores itself and goes
straight to the loaded project. A reload drops permission back to `prompt`, where this does nothing and
the wizard behaves exactly as before.

Two supporting changes: `useProjectSession` exposes **`isRestoreResolved`**, so the shell can tell
"nothing stored" from "still looking"; and the wizard is held behind a spinner until that question is
answered, or it would flash a setup screen at someone who has a workspace.

---

## Editor

### Stereo splitting

Expand with a better preview of both channels and the option to audition each.

- automate the stereo field
- widen / narrow
- mono the bass
- (merge / mix files — a new tool? a mixer?)

### Cleanup confirm modal glitches out of sight

The confirmation inside the cleanup flow renders off-screen. **Not reachable from Browse** — cleanup is
a project-wide action and lives in Project ▸ Advanced — so round 3 could not touch it. Still the first
thing to reproduce when the test pass reaches Studio, and it is now reached from a different place than
when this was logged.

### Editor bug sweep

**Half done, and this is where the editor's remaining bugs live — it is now the next testing round.**
The Studio walk of 2026-08-17 covered the door and not the editor inside it, so this is what is left of
Studio and of the test pass. Browse round 3 walked every tool in the *Browse-hosted* editor — trim/fade, automation, loop, EQ, pitch, limiter, normalize, cutter,
slicer, stereo — and all of them passed; the test pass's own round 3 then walked the same component
in the standalone `#/editor` door and found nothing either. **Neither host has a project behind it**,
which is the whole of what is left: version history across saves, assignment to a slot, "save unique"
and "save copy to pool", cleanup, and the two shared-component changes (R2-3, R3-2) as they land in
Studio's tape editor.

**The known symptom to reproduce first:** the play button can become **stuck after apply and preview** —
intermittent, which is why the round has to be every edit function one at a time rather than a sweep of
the ones that look suspect. The cleanup confirm modal above is the second thing to reproduce, and it is
now reached from a different place than when it was logged.

Findings go under **The v4 test pass** above as they are found.

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

Open:

- **A restore path** *(round 1)*. The backup describes its contents and not how to put them back.
  Wanted: an "import workspace / restore" action in the app, and a new-computer setup section written
  into the `.txt` that ships inside the backup.
- **Suggest a backup now and then** *(round 1)*, with an opt-out of the reminder.
- **The backup's failure path has never run.** Everything lands in one new folder and a write that dies
  part way removes it — that rollback is the whole point of the surface, and the only way to see it is a
  destination that runs out of room mid-write.
- **One sync entry point survived.** The library → SD sync still has a button in `LibraryManager`
  (`onOpenLibrarySync`). Phase 7's table only covered the Project Manager, and workspace backup now
  covers the need — worth removing next time someone touches that file.
- **The mirror vocabulary is still in the types.** `status: 'synced' | 'local' | 'backup' | 'modified'`
  plus `.local`/`.backup`, kept because cards still carry projects that `scanProjects` merges. The dead
  states stopped *rendering* in Phase 7; the rename is still open, as one mechanical commit.

### Project Manager overview

The list itself gets cleaner as a consequence of the above. Still open from the older draft, and worth
revisiting once the sync columns are gone:

- a "recent projects" list in the shape other apps use
- File ▸ Open / Save / Save As, rather than buttons scattered across the modal

---

## My library manager

- Default view is the first tab, Upload. Add a short info block explaining what this is: your local
  library, files stored here are copied into the workspace, you can also point at folders outside the
  workspace on local drives, and the point of it is a curated set you reuse on the Spotykach.

---

## Onboarding, news and guides

### Browse on a real phone — built, never opened on one

The phone layout landed in round 1: the sources list becomes a drawer, the pool becomes a full-screen
sheet, the hero and rows shrink, and the hub tells phone-sized screens that Browse is the door that
works. **All four Browse rounds were walked on a desktop.** The drawer and the pool sheet have never
been touched on a touch screen, which is also where the round-1 decision to make the pen always-visible
rather than hover-only was aimed. Not a blocker for the release — Browse is the only door that claims to
work there — but it is the one part of Browse still unverified. Tunnelling notes for testing on a real
device are in `docs/MOBILE_TESTING.private.md` (gitignored).

### Onboarding for newcomers

After "start new setup", show a welcome screen that says what the wizard is about to do. When creating
a first project, offer a blank project **or** a preset.

*(Currently one preset ships — the Hainbach project, all 36 slots occupied. A second, mixing samples
from several packs and deliberately leaving slots free for customisation, is worth building.
**Explicitly not a v4 blocker** — decided during the Preset → SD test round, 2026-08-16.)*

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
- **Preset & pack authoring** — ✅ **answered 2026-08-16**, and the plan is
  [docs/presets-samples/submission-workflow.md](docs/presets-samples/submission-workflow.md).
  **The app guides the creation** of both presets and packs and hands back the files; the submitter
  sends them over email or Discord (audio via WeTransfer or Drive); the maintainer commits them. No
  pull requests from strangers, no CI gate, no backend — the volume doesn't justify any of it.
  Closes open question 6 in [V4_PERVAK.md](V4_PERVAK.md).
  **Step 0 is built** — the Presets door now says where presets come from and links the guide. **Step 1
  is the next piece and the highest-value one:** the settings-only export downloads a ZIP the guides
  don't mention, names every descriptor `"Untitled Project"`, derives no `requiredPacks` and checks
  nothing — so what the app hands a submitter today is not yet a submission. Step 2 is the same
  treatment for a sample pack, step 3 is naming a destination anywhere at all.
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
- **Work folder and SD card under the settings icon** — asked for since v3, built in Phase 7, step 1.
  The inline "Change" in the Project Manager header stayed; a setting is a second entry, not a
  replacement.
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
