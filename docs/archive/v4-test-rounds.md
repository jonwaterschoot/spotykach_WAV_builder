# v4 "Pervak" — the test pass, round by round

> **Archived record, not guidance.** This is the full write-up of Phase 7 step 6 — the functional pass
> over the five hub doors — moved out of [roadmap-bugs.md](../../roadmap-bugs.md) on 2026-08-18 so that
> file could go back to being a short list of what is left. **The test pass is complete**: Round 5, the
> editor with a project behind it, was added on 2026-08-19 when it closed.
>
> **The deployed site was walked on 2026-08-19**, after the release, on a desktop and on an Android
> phone — the two things a local `dist` could not answer. Texture 8 plays on the Pages build (S1-14),
> and on the phone the hub, the Sample Browser, the sources drawer and the full-screen pool sheet all
> behaved as they do on a desktop. Neither raised a finding, and both left
> [roadmap-bugs.md](../../roadmap-bugs.md). Three shots from the phone walk are in the v4 news article.
>
> **Eleven rounds between 2026-08-14 and 2026-08-19 raised 38 numbered findings** — R1-x through R4-x in
> Browse, P1-1, C1-1, D1-1, S1-1…S1-15, and Round 5's four — **and all of them are built and walked**.
> Everything below is closed.
>
> Kept for the reasoning: several findings turned on a cause that was not where it looked — Tailwind v4's
> hover gate (S1-15), a transient-activation expiry (P1-1), a `move()` that exists but is refused
> (C1-1), and a transport flag whose only reset was an event that never fired (Round 5) — and those are
> worth being able to find again.

**Legend:** 🐞 a fault · ✂️ wording · 🏗️ needed a decision before it could be built.

**The doors, and how they came out:**

| Door | Rounds | Verdict |
|---|---|---|
| **Browse Samples** (`#/browse`) | 4 | ✅ Verified on a desktop, and on an Android phone after the release. 15 findings. |
| **Preset → SD** (`#/presets`) | 1 | ✅ Verified on a desktop. One blocker (P1-1). |
| **Device Config** (`#/config`) | 1 | ✅ Verified on a desktop. One blocker (C1-1). |
| **Edit One File** (`#/editor`) | 1 | ✅ Verified on a desktop. No findings. |
| **Studio** | 1 | ✅ Verified on a desktop. 15 findings, none a blocker, all built and walked. |
| **The editor with a project** | 1 | ✅ Round 5, the last one. Four findings — the main-view player and three editor reports — all built and walked. |

---

## Closed test rounds — Browse ✅ *(2026-08-14 → 2026-08-15)*

Kept for the reasoning. **Nothing below is open** — the two things these rounds raised that are still
outstanding were filed where the work belongs, not left here: the workspace backup's missing restore
path and backup reminder are under
[Settings, backup and project management](../../roadmap-bugs.md#settings-backup-and-project-management). The phone
layout was the other, and it closed on 2026-08-19 when the live site was walked on an Android phone.

### Round 1 — workspace backup ✅ *(2026-08-14)*

Written to a folder on a card. The folder was right and the `.txt` describing its contents was there.
Two things it doesn't answer — **no restore path**, and **nothing ever suggests making a backup**.
Both written up under [Settings, backup and project management](../../roadmap-bugs.md#settings-backup-and-project-management)
below, since that is where the work belongs.

### Round 1 — Sample Browser ✅

All six built 2026-08-15. Verified on a desktop browser across rounds 2–4, and **the phone layout below
was walked on an Android phone on 2026-08-19**, on the live site: the hub sends a phone to Browse, the
sources drawer and the full-screen pool sheet were both opened, and everything behaved as it does on a
desktop.

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

All three copies — [docs/how_to_copy_to_SDcard.md](../how_to_copy_to_SDcard.md) (which ships verbatim
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
([newProject.ts:34](../../src/utils/newProject.ts#L34)) already opens `showDirectoryPicker({ id:
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
  ([detachedState.ts:77](../../src/utils/detachedState.ts#L77)). A round-trip through the pool would silently
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
  ([EditorMode.tsx](../../src/modes/EditorMode.tsx)), so the loose editor never held more than two versions
  even with the editor open — giving up the in-session depth that
  [versionHistory.ts:9-12](../../src/utils/versionHistory.ts#L9-L12) explicitly allows.
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

## Preset → SD, Device Config, Edit One File ✅ *(2026-08-16 → 2026-08-17)*

### Round 1 — Preset → SD ✅ *(2026-08-16)*

One finding, raised and closed. **Re-walked after the fix and signed off**: the card write goes
through with its warnings behaving, and the ZIP download works. The door is done for v4.

Two things deliberately not held against it. **A second preset** — one mixing packs and leaving slots
free — is still worth building and is *not* a release blocker; it stays on the list under
[Onboarding, news and guides](../../roadmap-bugs.md#onboarding-for-newcomers). **An engine without `showDirectoryPicker`**
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
door, and they belong to the [editor round](../../roadmap-bugs.md#1-the-editor-round), to be walked when the test pass
reaches Studio.

### Round 4 — Studio ✅ *(2026-08-17 → 18)*

**Walked, and its fifteen findings are written up in full in the section below** — *Round 4 — Studio,
first pass*. Nothing there was a blocker and nothing there disturbed a ✅ above. What it did *not* close
is the door: the editor with a project behind it was never opened, which is the editor round and is live
in [roadmap-bugs.md](../../roadmap-bugs.md).

---

## Studio, in detail ✅ *(2026-08-17 → 18, 14 of 15 closed)*

**The last door, walked for the first time.** Fourteen findings, none of them a blocker: nothing here
stops Studio working, and no ✅ elsewhere is put in doubt. They are ordinary rough edges, so each one
below is written to be picked up on its own — what is wrong, where it lives, and what closing it means.

**A fifteenth arrived mid-round.** S1-15 was found while walking S1-5 — it is not a Studio finding at
all but an app-wide one, and the only item here that was ever invisible in a browser on a desktop
machine. It is kept in this round because this is where it surfaced.

**All fifteen were built by 2026-08-18.** **S1-8** was the last and the largest — the pool-first offer,
counting moves as moves and the simple view's grids all closed on that date, and the build modal was
then walked over S1-8 and S1-7 together and approved.

**What this round did *not* cover.** Two things were deliberately left out and each wants a pass of its
own. Both are live in [roadmap-bugs.md](../../roadmap-bugs.md):

- **the editor's remaining faults with a project behind them** — the [editor round](../../roadmap-bugs.md#1-the-editor-round),
  which needs every edit function walked one at a time (a play button that can stick after apply and
  preview is the known example);
- **auto-save replacing "save"**, which is a design question, not a fix.

### The list

Each row is meant to be a session on its own. **The 🏗️ rows need an answer before code**, so don't
start them cold; the rest are described well enough below to open the file and go. Of the three, S1-4
and S1-11 are answered and built — the auto-save question is what is left.

| # | What | Where | Type |
|---|---|---|---|
| **S1-1** | A project opens on one tape, not all six | `App.tsx` | ✂️ ✅ |
| **S1-2** | "Select All" never becomes "Deselect All" (two buttons) | `FileBrowser.tsx` | ✂️ ✅ |
| **S1-3** | Compact rows are fully outlined; want a coloured left border | `FileBrowser.tsx` | ✂️ ✅ |
| **S1-4** | The pool has no sorting — alphabetical / by tape, reversible | `FileBrowser.tsx` | 🏗️ ✅ |
| **S1-5** | The Sample Browser entry is a bare folder icon; want "Browse +" | `FileBrowser.tsx` | ✂️ ✅ |
| **S1-6** | New project doesn't warn about unsaved changes | `App.tsx` | 🐞 ✅ |
| **S1-7** | Import presets don't say which of them also write the card | `ExportPreviewModal.tsx` | ✂️ ✅ |
| **S1-8** | Clean Mirror doesn't show what it deletes | `ExportPreviewModal.tsx` | 🐞 ✅ |
| **S1-9** | Files and System explainers too small to read | `SettingsModal.tsx` | ✂️ ✅ |
| **S1-10** | "Reset Visual Effects" lags the window, loses contrast | `SettingsModal.tsx` | 🐞 ✅ |
| **S1-11** | Presets and Custom Stored split across the panel | `SettingsModal.tsx` | 🏗️ ✅ |
| **S1-12** | Slider reset is double-click only, undiscoverable | `SettingsModal.tsx` | ✂️ ✅ |
| **S1-13** | Brightness capped at 2× | `SettingsModal.tsx` | ✂️ ✅ |
| **S1-14** | Texture 8 (the mp4) dead on Pages | `App.tsx` | 🐞 ✅ |
| **S1-15** | **Every hover state in the app is dead on a touchscreen machine** | `index.css` | 🐞 ✅ |

**S1-8 was the last of this round to close**, and it was always the largest piece of real work here —
the only one that changes what a destructive action does. The six `SettingsModal.tsx` rows were closed
together on 2026-08-18, since they all sat in one file and three of them (S1-11, S1-12, S1-13) turned
out to want the same constants.

### The default view

#### S1-1 — A project opens on one tape instead of all six ✂️ ✅ *built*

Opening a project landed on the single-tape view, so the first thing seen was a sixth of the project.
The all-tapes grid is the overview, and is now what a project opens on.

**The open question is decided: always the entry, never remembered.** Remembering would have meant
persisting the choice — Studio is lazy-mounted per hub visit, so nothing survives leaving the door
anyway — and it would have bought a preference for something that is not one. The single-tape view is
where you go to work on one of the six, and picking that tape is how you say so; there is no state worth
carrying between projects, only a place you were left standing in the last one.

So the default at [App.tsx:124](../../src/App.tsx#L124) is `'all'`, and every path that makes a *different*
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
flip — the assigned list ([FileBrowser.tsx:480](../../src/components/FileBrowser.tsx#L480)) and the pool
([FileBrowser.tsx:539](../../src/components/FileBrowser.tsx#L539)) — on the Library Manager's pattern, with the
`title` tooltip flipping alongside the label.

**Each button only ever owns its own section.** The selection is one set shared by both lists, so
*Deselect All* in the pool removes the pool's ids and leaves an assigned selection standing, exactly as
*Select All* only ever added its own. That is why the flip is per-section state
([FileBrowser.tsx:333-334](../../src/components/FileBrowser.tsx#L333-L334)) and not one "everything is selected"
flag.

**An empty section never says *Deselect All*.** `[].every()` is true, so without the length guard an
empty pool would offer to deselect nothing.

Fixed alongside: the Library Manager said *Unselect* where this now says *Deselect*
([LibraryManager.tsx:1499](../../src/components/LibraryManager.tsx#L1499)). One word for one control.

#### S1-3 — Compact rows wear a full outline ✂️ ✅ *built and walked 2026-08-17*

In the minified view every row was ringed by a thin coloured border, which at that density is noise. The
tape colour now sits on the **left edge** alone — 2px — and the rest of the row is the same quiet
`border-gray-700` every other assigned row wears
([FileBrowser.tsx:654-660](../../src/components/FileBrowser.tsx#L654-L660)).

`getBorderColor` became `getLeftBorderColor` ([FileBrowser.tsx:350](../../src/components/FileBrowser.tsx#L350))
and returns `border-l-*` classes. It has no other caller, so nothing else changed colour: the full-mode
tape badge is `getLabelStyle`'s, untouched.

**The class names have to be written out, one per tape.** Tailwind v4 only generates what it finds
literally in the source, so deriving `border-l-synthux-blue` from `border-blue` at runtime would have
produced a class with no CSS behind it. Verified in the built stylesheet — all seven are there.

**Hover had to let go of the border on these rows.** `hover:border-gray-500` sets all four sides, and a
pseudo-class outranks a plain side utility, so hovering a striped row would have wiped the tape colour
for as long as the pointer sat on it. Compact rows now answer the pointer with `hover:bg-gray-700` only;
every other row keeps the border hover it had. Selection and the duplicate ring still read correctly —
side utilities are emitted after the all-side ones, and the duplicate's `!border-orange-500` is
`!important` and still wins, which is what a duplicate should do.

#### S1-4 — The pool has no sorting 🏗️ ✅ *built and walked 2026-08-17*

Three sorts, one control, both lists: **A–Z**, **By tape**, **As added** — each reversible
([FileBrowser.tsx:536-556](../../src/components/FileBrowser.tsx#L536-L556)). The control is a `Dropdown` in
the Registry header beside the compact toggle, wearing the sort it is in and lit blue whenever the lists
are in anything other than the order the files arrived in
([FileBrowser.tsx:445-452](../../src/components/FileBrowser.tsx#L445-L452)).

**The two open points, answered.**

*Drag-reordering* — there was never any to lose. The pool has no hand-ordering and never had: a row's
drag carries it to a slot, and the list has always been `Object.values(state.files)`, the order files
arrived in. So manual sorting isn't dropped so much as named — it is **As added**, the third mode, and
the default, so no one's list reorders itself until they ask. A real drag-to-arrange order would be its
own item, with its own persisted field; nothing here forecloses it.

*Remembered* — yes, per browser, in `spotykach_registry_sort` through `appStorage`
([FileBrowser.tsx:16-38](../../src/components/FileBrowser.tsx#L16-L38)). One choice that follows you across
projects and survives reload. It stays out of `project.json` deliberately: a view setting shouldn't mark
a project dirty or travel to someone else's machine with the files.

**One order governs the whole Registry, not just the pool** — "by tape" means nothing in a list of
unassigned files, so a pool-only control would have offered two modes where the ask was three. Assigned
sorts by tape then slot; the pool, where every file ties at *no tape*, falls through to A–Z inside that
same mode ([FileBrowser.tsx:134-150](../../src/components/FileBrowser.tsx#L134-L150)).

**"Numbers first, then A–Z" is one call, not two passes.** `localeCompare` with `numeric: true` collates
digits ahead of letters *and* puts `10` after `2` ([FileBrowser.tsx:42-44](../../src/components/FileBrowser.tsx#L42-L44)),
which is both halves of the ask — a plain `<` would have filed `10.wav` before `2.wav`.

**Selection had to follow the eye.** Shift-ranges and the arrow keys walk `getVisibleFiles`, which was
building its own unsorted list; it now returns the two sorted lists concatenated
([FileBrowser.tsx:165-171](../../src/components/FileBrowser.tsx#L165-L171)), so shift-clicking two rows selects
what sits between them on screen rather than what sat between them before the sort.

Fixed alongside: `getFileLocation` scanned all six tapes for every row on every render. Both the label
and the tape rank now come from one `Map` built when the tapes change
([FileBrowser.tsx:122-132](../../src/components/FileBrowser.tsx#L122-L132)).

#### S1-5 — The way into the Sample Browser is just a folder ✂️ ✅ *built and walked 2026-08-18*

The plain folder icon doesn't say that it *adds* anything. Wanted: a **Browse + icon** — a plus inside
the folder — with the word beside it rather than an icon alone.

`FolderOpen` became `FolderPlus`, and the button now carries the word
([FileBrowser.tsx:562-570](../../src/components/FileBrowser.tsx#L562-L570)). It keeps the quiet grey it had and
the orange it turns on hover, so it still reads as one of the three header controls rather than a call to
action shouting over the Registry name. The tooltip says where the files land — *"Browse Sample Packs —
add files to the Registry"* — because the button's own word can only carry so much.

**The label is the only thing on that row that can't shrink**, so the control cluster is now `shrink-0`
and its gap tightened from `gap-2` to `gap-1.5`. The panel's floor is 288px
([FileBrowser.tsx:93](../../src/components/FileBrowser.tsx#L93)); measured in the app, the button is 78px and
the cluster 140px, up from about 100px. Without `shrink-0` the flex row would have squeezed the word
instead of the text beside *Registry*.

**The 40px comes out of the left column, and one line there now wraps.** Both the project name and the
workspace path are already `truncate` ([FileBrowser.tsx:520](../../src/components/FileBrowser.tsx#L520),
[526](../../src/components/FileBrowser.tsx#L526)), so the normal header is unchanged. The odd one out is the
*"All imported files."* fallback shown only when there is neither a project nor a workspace
([FileBrowser.tsx:531-535](../../src/components/FileBrowser.tsx#L531-L535)) — it has no `truncate` and now sets
on two lines, taking the header from 67px to 82px. Left as is: the state is static, so nothing jitters,
`min-h-[60px]` was always a minimum, and truncating that line would read *"All imported fi…"*, which is
worse than a second line. Shortening the wording would fix it and is a copy decision, not this item's.

`FolderOpen` has no other caller in this file, so the swap touched nothing else.

*Driven in Chrome against the dev server:* the button reads `⊞ BROWSE` in the header, turns orange on
hover with the folder-plus icon following, and opens the Sample Browser on click.

**Walking this is what turned up S1-15.** The hover above fired under automation and not on the machine
it was walked on — which turned out to be nothing to do with this button, and true of every hover in the
app. It is written up as its own item; the orange described here only actually arrives once that fix is
in.

### New project

#### S1-6 — Creating a new project doesn't warn about unsaved changes 🐞 ✅ *built and walked 2026-08-18*

**"New Fresh Project" in the Project menu replaced the open project with no question asked.** The guard
existed — `checkUnsavedChanges` ([App.tsx:732](../../src/App.tsx#L732)) — and every neighbouring path called
it: loading a project, leaving for the hub, changing the work folder, and even *creating* an empty
project from the Project Manager ([App.tsx:5067](../../src/App.tsx#L5067)). The one entry point that didn't
was the menu item most likely to be used ([App.tsx:4468](../../src/App.tsx#L4468)).

**The guard now asks before the name, not after**, so nothing is typed for a project that gets
cancelled.

**It also offers the third answer the old dialog couldn't.** `checkUnsavedChanges` was a
`window.confirm`, which has room for two outcomes: lose the work or stay put. Saving first — the thing
anyone in that dialog actually wants — meant closing it, hitting Save, and starting again. It is now the
app's own `ConfirmModal`, which already had a three-button shape (`onDiscard` off to the left in red,
then cancel, then the primary), and the primary is **Save "<name>" first**, with *New project without
saving* as the red one. `confirmAction` didn't pass `onDiscard` through, so that was wired up.

- **The save option is opt-in per call site** (`offerSave`), and only appears when there is a work
  folder *and* a project name to save into. Without those, `executeSaveProject` starts prompting for a
  name of its own ([App.tsx:2737](../../src/App.tsx#L2737)), which is not what "save first" should mean in a
  dialog about something else. The two new-project paths ask for it; loading, exiting to the hub and
  changing the work folder keep the two outcomes they had, in the new dialog.
- **"Save first" waits for the save to land.** A save can stop short — missing assets put the resolver
  up instead of writing ([App.tsx:2352](../../src/App.tsx#L2352)), and a write can fail — and going ahead
  then would destroy exactly what was just asked to be kept. `executeSaveProject` and
  `handleSaveProject` now return whether the project reached disk; on false the new project isn't
  created and a toast says so.

The auto-save wording is unchanged and still branches on the preference: with auto-save on, the work is
in the browser's recovery slot and only the folder on disk is behind, and the dialog says that rather
than claiming a loss.

**Not done here:** loading a different project and leaving for the hub could offer the same "save
first", and the zip-import guard at [App.tsx:399](../../src/App.tsx#L399) is still a separate `window.confirm`
that proceeds whichever way it is answered. Both are outside this item.

### Import and build to SD — `ExportPreviewModal.tsx`

#### S1-7 — The import presets don't say which of them touch the card ✂️ ✅ *built 2026-08-18, not yet walked*

Three import presets sat in one row as label-only buttons, and nothing distinguished *reads the card*
from *reads the card and then writes it*. The behaviour lived entirely in two switch statements,
`defaultPrimary` ([ExportPreviewModal.tsx:69-91](../../src/components/ExportPreviewModal.tsx#L69-L91)) and
`defaultToPool` ([:93-107](../../src/components/ExportPreviewModal.tsx#L93-L107)).

**The whole difference was one line** — `if (status === 'LOCAL_ONLY') return 'push_to_sk';`. *Merge into
Project + Mirror* pushes every slot-only project file to the card, and the word *Mirror* was the only
warning, on a button under an **Import SD** tab with a left-pointing arrow and indigo styling.

**It reached further than the item said.** `applyPreset` runs the same function over `diff.config`
([:374-376](../../src/components/ExportPreviewModal.tsx#L374-L376)), so with a `config.txt` that exists only in
the project, that preset writes the firmware config to the card too.

**Every preset now carries its own line, and a badge marks the one that writes.** A `PRESET_META` table
holds the name, the sentence under it, and a `writesToCard` flag; a small `PresetButton` renders all of
them in both modes:

- **Import to pool** — *SD files land in the pool. Slots and card unchanged.*
- **Merge into project** — *SD files fill the slots; anything they displace goes to the pool. Card
  unchanged.*
- **Merge into project + mirror** — *Same, then writes your slot-only files back to the card.*, with an
  orange **Writes to card** badge.

The badge is rendered only in import mode. In **Build SD** writing is the whole point and a badge on
every button would be noise — it exists because in import mode the write is the surprise.

**The push presets got the descriptive line too**, since a row of two-line and one-line buttons side by
side reads as broken. Their names are unchanged; *Clean Mirror*'s line says card-only files are deleted,
which is wording only and does not close **S1-8**.

**The names were duplicated as literals in the confirm button** ([:1276-1283](../../src/components/ExportPreviewModal.tsx#L1276-L1283)),
so a rename could have left the two disagreeing. Both now read `PRESET_META`.

**`import_slots_pool` is gone.** It was in the type and in the list `currentPreset` scans, but had no
button and no case in either switch, so it computed to "everything skipped, nothing pooled". Since
`setPrimary` clears `isCustomOverride`, hand-editing decisions back to nothing could settle on it — no
preset button lit, and the confirm button falling through to `'Standard Import & Sync'`, a name that
existed nowhere else in the app.

**Walked and approved 2026-08-18**, in the session that walked S1-8 — one modal, both findings. The
layout was the open question: four 210px buttons in import mode inside a `max-w-6xl` modal. It holds.

#### S1-8 — Clean Mirror doesn't show what it deletes 🐞 ✅ *(built 2026-08-18, in two sittings)*

The most destructive preset on the build side (`push_clean`) makes the card match the project exactly
— and the preview didn't list what that removes.

- **The deletions have to appear in the preview**, named, before the write. *Done: the slot list and the
  confirmation first, the simple view's own panel second.*
- **Offer to import them into the project pool first**, so "clean" isn't the only way out. Note that
  `push_clean` deliberately skipped pooling, so this is a change of behaviour and not just a change of
  wording. *Done — as preset state, which is the part that needed care.*
- **Count the moves.** Where clean mirror shifts a file between slots rather than deleting it, that is a
  move and should be counted and shown as one. *Done, off the hashes the duplicates banner already has.*

**Walked and approved 2026-08-18**, in the same session as S1-7 — one modal, both findings. `tsc`,
`eslint` (the file's seven errors are all pre-existing) and the production build are clean too.

##### The confirmation counted nothing ✅ *built 2026-08-18, found while walking S1-7*

**Walking S1-7 in Build SD turned up a worse case than "doesn't list them": it didn't count them
either.** A card holding `1.WAV` in B1 against a project holding `DRAINPIPE-UZ` there is a `CONFLICT`,
so Clean Mirror pushes the project file over it — and `defaultToPool` returns false for `push_clean` on
purpose, so the card's copy is not pooled. It is destroyed. The confirmation modal said **Push to SD 3,
Import to Pool 0** and showed no removal panel at all.

**Two rules had drifted apart.** The grid badge already treated that overwrite as a removal and drew the
red trash on SD B1, but `deleteCount` only matched `delete_sk` — so the grid said "this file dies" and
the dialog said nothing. There is now one `isCardRemoval(row, preset)` and both read it.

- **It checks `!r.toPool`**, which the badge rule never did. `toPool` carries `file: r.hardwareBlob`
  ([ExportPreviewModal.tsx:567](../../src/components/ExportPreviewModal.tsx#L567)) — it is the *card's* copy
  that gets preserved — so a pooled conflict is not a loss and should not be counted as one.
- **The panel names the files**, slot and filename, under a heading that counts them: *"1 file removed
  from the card / not kept in the pool — gone for good"*.
- **It is no longer gated to `push_clean`.** A `delete_sk` set by hand in Advanced view is the same
  loss, and used to be invisible for the same reason.
- **Project-side deletes got their own panel.** `delete_local` was being added into the same number as
  card deletions, which are not the same event.

##### The slot list didn't say it either ✅ *built 2026-08-18*

**The same row in Advanced view gave no sign the card's file was going.** `1.WAV` sat under **SK
Hardware** in plain white with *on SK* beneath it, next to a blue push arrow — the same as any other
push.

**The wording existed and was unreachable.** `activeLabel` has said `🗑️ Trashed & Pushed` for a
conflicting push all along, but it only renders in the `!canToPool` branch, and `canToPool` is true for
exactly the rows that can be trashed — `REMOTE_ONLY` and `CONFLICT`. The pool button took its place, so
the one label that named the deletion could never appear on a row that had one. It was also wrong when
it did: any conflicting push claimed "Trashed", including one whose card copy was being pooled. Both now
read `isCardRemoval`.

A removal is marked three ways in the list, so it survives a scan:

- **the row carries a red wash**, which is what makes it findable without reading;
- **the filename is struck through** and *on SK* becomes a red **Deleted from card**;
- **the decision column adds `🗑 SD file deleted`** under the buttons, next to the *Move SD → Pool*
  button that avoids it.

**Pooling the file clears all three at once**, since `isCardRemoval` checks `!r.toPool` — so the row
answers the question the pool button asks.

##### The pool-first offer ✅ *built 2026-08-18*

**"Clean" is no longer the only way out.** The panel that names the doomed files carries one button —
*Import them to the pool first* — in both places they are named: the simple view's panel and the final
confirmation. It flips `toPool` on exactly the rows classed as destroyed
([ExportPreviewModal.tsx:681](../../src/components/ExportPreviewModal.tsx#L681)), so the card is still
made to match the project and the copies land in the pool as parked `SK Import` files. **"First" is
literal**: `App.tsx`'s import phase reads the blobs off the card before the export phase runs, and it is
the export phase that `skMode: 'clean'` wipes `SK/` in.

**It had to be preset state, not a hand edit.** `toPool` is part of what `syncMatchPreset` compares, so
setting it row by row drops `currentPreset` to `'custom'` — and `proceedWithConfirm` reads
`currentPreset === 'push_clean' ? 'clean' : 'overwrite'`. Pooling the files by hand would therefore have
quietly stopped the build being a mirror at all. The offer is a `rescueBeforeClean` flag that
`defaultToPool` answers to ([:111](../../src/components/ExportPreviewModal.tsx#L111)), so Clean Mirror
stays lit and stays clean with the pooling folded into the preset. Pressing any preset button clears it;
*Undo — let them go* puts it back.

##### Moves counted as moves ✅ *built 2026-08-18*

**A file that only changes slot was being reported as destroyed.** The card holds `1.WAV` in B1, the
project holds the same audio in G2, Clean Mirror deletes B1 and writes G2. Nothing is lost — the file
moved — and the preview called it gone for good.

`buildCardMoves` ([:156](../../src/components/ExportPreviewModal.tsx#L156)) answers where a removed
file's audio is once the write finishes, and it costs nothing extra: `diff.duplicates` is already hashed
for the duplicates banner. A slot holds that audio afterwards if the project pushes it there, or if the
card's own copy is left alone — so "moved to where the project put it" and "a second copy on the card
survives" both come out as moves. Where it is neither, the file really is gone and still says so.

Moves read amber everywhere the red used to be: an amber `→ G2` badge on the SD grid, an amber row wash
and *Moves to G2* in the slot list, and their own tile in the confirmation — *"Same audio, new slot —
the card keeps it"*.

##### The simple view says it in words ✅ *built 2026-08-18*

**The simple view is the one most people will use, and it said all of this with a red trash badge on a
6×6 grid cell.** It now carries a panel above the grids
([:408](../../src/components/ExportPreviewModal.tsx#L408)) naming every file that leaves the card, in
three groups: gone for good, moved and where it lands, kept in the pool. The pool-first button sits in
the first group, an undo in the third.

**It stays quiet when nothing is at risk.** Standard Build pools displaced files by default, and a panel
on every ordinary build is noise, so it renders only when something is destroyed, something moves, or
the offer has been taken — the last so that the rescue stays visible after it lands.

##### Two rules that were quietly wrong ✅ *fixed with the rest*

- **`isCardRemoval` was gated to `push_clean`**, and `currentPreset` falls to `'custom'` the moment one
  row is hand-edited. Touching a single unrelated row in Advanced therefore took the red wash off every
  *other* row while their decisions stayed exactly as they were. The gate is gone
  ([:135](../../src/components/ExportPreviewModal.tsx#L135)): a conflicting push with nothing pooled is
  the same loss whichever button is lit.
- **`delete_sk` with the pool button on counted as a loss.** It is the opposite — the card's copy is
  read into the pool and *then* the slot is cleared, which is exactly what the new offer does. It now
  classes as pooled, wears the POOL badge in the grids, and reads *Into the pool, off the card* in the
  list.

**One rule, four surfaces.** `isCardRemoval` says a file leaves its slot; `cardFate`
([:181](../../src/components/ExportPreviewModal.tsx#L181)) says what becomes of it — `destroyed`,
`moved` or `pooled` — and the grids, the slot list, the panel and the confirmation all read that one
answer. Keeping those in step is the whole finding: the original S1-8 was two of them disagreeing.

The classification was also exercised against the real source before it was walked — the helper block
pulled out of the file, transpiled and run over nine cases, including *both copies are being wiped, so
neither is a move* and *the duplicate exists but is not being pushed, so it is still a loss*. That
harness was not kept; the repo has no test runner, and inventing one was not this finding's job.

### Settings — `SettingsModal.tsx`

#### S1-9 — The Files and System explainers are too small to read ✂️ ✅ *built and walked 2026-08-18*

**Both of the offered answers, since the item allowed both: a short line at a readable size, with the
long version on an icon.** Every explainer on Files and System was `text-[9px]` grey and several ran to
four lines of it. They are `text-[11px]` now, cut to the one sentence that answers the question, with an
ⓘ that expands the rest in place. One `Explainer` component
([SettingsModal.tsx:125](../../src/components/SettingsModal.tsx#L125)) carries all of them, so the size is set
once rather than eleven times.

- **Nothing was rewritten away.** What the icon opens is the wording that was already there. That
  matters most for auto-save, where **Auto-save replacing "save"**, under *Not this round*,
  records that the current text is accurate and should not change until the feature does — so it is
  split at its first full stop, not edited.
- **The toggle rows had to come apart to allow it.** An ⓘ inside the `<button>` that carries the whole
  row is a button inside a button. The switch and its title are the button now; the explainer is a
  sibling beneath it, indented to the same column, and clicking the text expands rather than toggles.
- **The Danger Zone's explainer was unreadable for its layout as much as its size.** Its heading, a
  `w-full` button and its paragraph were three children of one `flex items-center justify-between`
  row, which put a full-width button and a paragraph side by side and squeezed both. It reads down the
  page now ([SettingsModal.tsx:1108](../../src/components/SettingsModal.tsx#L1108)).

The type around them went up where it shared the problem: a location's name and the folder under it,
and the title on each toggle, are 12px and 11px rather than 11px and 10px.

#### S1-10 — "Reset Visual Effects" lags the window and can lose contrast 🐞 ✅ *built and walked 2026-08-18*

**Both questions the item asked came back no, and both had a cause that wasn't where it looked.**

**Can the button genuinely be placed above the render effects? No — not while it is inside `#root`.**
`#root` carries the master filter ([index.css:254](../../src/index.css#L254)), and a CSS `filter` makes its
element the containing block for every `fixed` descendant. Nothing inside the panel can escape the
effects that button exists to reset, whatever z-index it is given. The portal is not a workaround, it
is the only way, and it stays.

**What made it float was not the measuring.** The button was `transition-all`, so `top`, `left` and
`width` — the three properties the portal sets from the measurement — were animated properties. Every
measurement was correct and arrived on time; the button then took 150ms to walk to it. Dragging the
panel left it trailing by exactly that, and on first open it slid in from the top-left corner because
`portalPos` starts at `{0, 0, 0}`. It transitions colour only now and lands where it is put.

**The measuring was wrong too, just not visibly.** It ran from a dependency list — modal position, tab,
special mode — which named some of the reasons the placeholder moves and missed the rest: the panel
scrolling internally, or a preset chip growing a reset button and rewrapping the row above it, which is
new in S1-11 below. It follows the placeholder every frame instead, while the Look tab is open, and
only writes state when the rect actually changed, so it doesn't re-render on its own
([SettingsModal.tsx:282](../../src/components/SettingsModal.tsx#L282)).

**Is hard black-and-white the honest answer for the contrast? No — being opaque is.** The fill was
`bg-indigo-500/20`: 20% alpha, compositing over whatever the *filtered* panel behind it had become. Push
inversion to 100% and it was pale indigo text on a pale indigo ground. The button is outside the filter,
so it needs no monochrome discipline — it only needed to stop borrowing its background from the thing it
resets. Solid `indigo-600` with white text (6.4:1) and a dark ring, legible over anything, and still the
app's palette ([SettingsModal.tsx:817](../../src/components/SettingsModal.tsx#L817)).

#### S1-11 — Quick Presets and Custom Stored are one idea split across the panel 🏗️ ✅ *built and walked 2026-08-18*

**Two labelled sections, *Presets* and *Custom stored*, adjacent at the top of the Look tab.** The
`S1 S2 S3` store buttons are gone from the header — they hid behind a hover on a label reading
"Store:", at the opposite end of the panel from the `C1 C2 C3` they wrote to, which is most of why the
split read as guesswork. Each custom slot is one chip now: the name applies it, the disk icon beside it
stores over it, and an empty slot says *empty* and refuses the apply
([SettingsModal.tsx:734](../../src/components/SettingsModal.tsx#L734)).

- **The active preset is highlighted** — in both sections, from the same rule.
- **A modified preset carries an amber dot and grows a ↺** back to it, which is the item's "icon marking
  that their settings have been altered, and a reset back to the preset". Custom slots get the same,
  since they are altered the same way.
- **Which one is live is derived, not remembered.** `exactPresetId` compares the current filters against
  every preset and every stored slot ([SettingsModal.tsx:590](../../src/components/SettingsModal.tsx#L590)),
  so a look restored from storage on open — or one reached by dragging sliders onto a preset's values —
  still lights the right chip, with no state to go stale. The remembered id only answers for the
  modified state: the preset the look *came from* and has since moved off.
- **Font size is not part of the comparison**, because it was never part of a preset — `applyPreset` has
  always carried the current font size through.
- **Random, Crazy and Don't sit under the presets rather than among them.** They are moods: they set no
  named state to come back to, so they clear the highlight instead of taking it.

*The round's unfinished note — "after changing a preset: clicking" — was a remnant, not a request, and
is dropped.*

#### S1-12 — Sliders reset by double-click, which nothing says ✂️ ✅ *built and walked 2026-08-18*

**A small circular ↺ next to each slider's name, as asked.** The double-click stays and is now the
second way rather than the only one, and the `title` says which slider it resets rather than just
"Double click to reset".

**The button greys out when the slider is already at its default**, so it answers a question the panel
couldn't answer before: which of these six have been touched. The six sliders were six near-identical
blocks of JSX; they are one `FilterSlider`
([SettingsModal.tsx:164](../../src/components/SettingsModal.tsx#L164)), declared at module scope so that a
render mid-drag doesn't hand React a new component type and remount the input under the pointer.

#### S1-13 — Brightness stops at 2× ✂️ ✅ *built and walked 2026-08-18*

**Brightness goes to 3×, and contrast with it.** They are the same kind of multiplier over the same old
0.5–2 range, and the question the item asks about the other ranges answers itself for the rest:
inversion and desaturation are proportions that cap themselves at 100%, font size is bounded by what the
layout survives, and grain past 50% buries the UI it sits over. Those four keep their bounds.

**It was not a one-line change, because the bounds existed in three places.** The sliders had them as
literals, Crazy mode clamped to its own copy (`Math.min(2, …)`, which would have pinned the new range
back to the old one the moment Crazy was toggled), and the reset defaults were a fourth copy of the
default object. There is one `FILTER_RANGES` and one `DEFAULT_FILTERS` now
([SettingsModal.tsx:68-97](../../src/components/SettingsModal.tsx#L68-L97)), and everything reads them.
**Random deliberately does not**: it keeps the old 0.5–2 band, because it should land somewhere usable
rather than at the far end of 3×.

#### S1-14 — Texture 8, the video, is dead on the Pages build 🐞 ✅ *built and walked 2026-08-18*

**Wrapped in `resolveAssetPath`, and the sweep the item asked for came back with nothing else.**
Confirmed in the built bundle: both call sites for that file — this one and the `SetupWizard` one that
was already correct — now emit `At("/vid/wavbuilderfullscreen_1.mp4")` under the base path.

**The class of bug is narrower than it looked, and worth writing down.** A leading-slash asset path is
only broken when it reaches the DOM as a *JSX attribute*. In CSS, Vite rebases `url(/…)` against `base`
at build time, so the two remaining hardcoded ones — the `--master-texture-image` default in
[index.css:71](../../src/index.css#L71) and the Tailwind arbitrary `bg-[url('/img/…')]` in
[Dropdown.tsx:59](../../src/components/Dropdown.tsx#L59) — come out of the build as
`/spotykach_WAV_builder/img/…` and are correct on Pages. Checked in `dist`, not assumed. A sweep of
every `src=`, `href=`, `poster=`, `fetch(` and `new URL(` in `src/` found no other offender, so
App.tsx was the only one.

##### The round, walked ✅ *2026-08-18*

**All six walked on a desktop, and none of them turned anything up.** `tsc`, `eslint` (the file's two
remaining errors are both pre-existing and untouched — it had seven before this round) and the
production build are clean, and S1-14 was verified in the built bundle as well as in the browser.

**Two things a build could never have answered, and the walk did**: the reset button tracks the panel
while it is dragged, and the modified dot appears when the sliders move off a preset and not otherwise.

**The Pages build itself waited for a machine, and got one.** S1-14's fix was verified in `dist` — both
call sites emit the path under the base — but the deployed site is where that bug lived. It was loaded
there on 2026-08-19 and texture 8 plays, which is the last word on it.

### Found mid-round — app-wide

#### S1-15 — Every hover state in the app is dead on a touchscreen machine 🐞 ✅ *built and walked 2026-08-18*

Noticed while walking S1-5: the new Browse button didn't light up on hover. It wasn't the button.
**Nothing in the app was reacting to hover**, and had never been, on that machine.

**Tailwind v4 wraps the `hover` variant in `@media (hover: hover)`.** Where v3 emitted a plain `:hover`
rule, v4 emits one that only applies when the browser reports the *primary* pointer can hover. A
Windows touchscreen laptop reports `hover: none` even when it is being driven by a mouse — so the media
query never matches and the whole block is skipped. Measured in the built stylesheet: the app has **333
hover rules, and every one of them that Tailwind generates — all but the hand-written scrollbar-thumb
rule — sat inside the gate. 33KB, 16% of the CSS, inert.** `group-hover:` is gated the same way.

**The tell was the one hover that still worked** — the middle `+` on an empty slot in single-tape view.
It is the only hover in the app that isn't a Tailwind utility: hand-written CSS injected in a `<style>`
tag ([MiniSlotCard.tsx:347-353](../../src/components/MiniSlotCard.tsx#L347-L353)), so nothing gates it. The
same element also carries `group-hover:scale-110`
([MiniSlotCard.tsx:341](../../src/components/MiniSlotCard.tsx#L341)) — a real utility — which is why the `+`
would glow and change colour but never grow. One element, both behaviours, the gate visible between them.

**Reproduced and fixed under Chrome with touch emulation**, driving the real app:

| | `matchMedia('(hover: hover)')` | Browse button on hover |
|---|---|---|
| Desktop pointer | `true` | grey → orange |
| Touch device | `false` | **no change at all** |
| Touch device, after the fix | `false` | grey → orange |

The fix is one line in [src/index.css](../../src/index.css), `@custom-variant hover (&:hover)`, which redefines
the variant to the ungated form the styling was always written against.

**This was never a regression.** The project was born on Tailwind v4 (`ac1db25`, 2026-02-06), so these
hover states have been dead on hover-less devices since the first commit — invisible to anyone testing
on a desktop, which is why four rounds of walking never caught it.

**What it costs, since v4's gate exists for a reason.** On genuine touch use a tap can leave an element
stuck in its hover look until you tap elsewhere. Accepted deliberately: this is a desktop studio tool
whose affordances lean on hover throughout, and a hybrid touchscreen laptop — common in this audience —
is exactly the machine that loses all of them. If sticky hover becomes a real complaint, the narrower
form is to gate on `(pointer: fine)` instead, which gives a mouse its hover without giving a finger one.

---

## Round 5 — the editor with a project behind it ✅ *(2026-08-18 → 2026-08-19)*

**The eleventh round, and the last one.** Added here 2026-08-19, when it closed. Everything in this
section was open in [roadmap-bugs.md](../../roadmap-bugs.md) as *the only thing blocking the release*.

Two earlier passes had walked the same `WaveformEditor` component — Browse round 3 in the Browse-hosted
editor, and the test pass's own round 3 in the standalone `#/editor` door — and both came back clean.
**Neither host has a project behind it**, and everything the round found was project-shaped: version
history across saves, assigning to a slot, save unique, save copy to pool, cleanup.

Two symptoms were known going in and both were reproduced first:

1. **The play button could stick after apply and preview.** Cause A below. Intermittent because it needed
   a preview playing when a new version landed — which is why the round had to walk every edit function
   one at a time.
2. **The cleanup confirm modal appeared to render off-screen.** It never was. `CleanupModal`'s reset and
   its Escape handler shared one effect that listed `confirmAction` in its deps, so pressing a cleanup
   button set the confirmation, re-ran the effect, and the effect's own `setConfirmAction(null)` closed
   it a frame later. That flash is what looked like an off-screen modal. Split into two effects: the
   reset belongs to the modal opening, the key handler is the only part that needs to know which layer
   is on top.

### Main view — the player

**Playing a file from a tape slot or from the left column did not start playback; once it did start it
answered neither the spacebar, nor the pause button on the playbar, nor the stop button in the left
browser panel.** Fixed 2026-08-18 in
[`src/contexts/AudioPlayerContext.tsx`](../../src/contexts/AudioPlayerContext.tsx) and walked the same day
in every situation — play, pause, stop and the spacebar, from the tape slots, the left column and both
player bars, in All Tapes and in a single tape. Three causes, all in the one file:

- **The transport was gated behind a frame.** `stop()` and `pause()` never touched the audio element
  themselves — they handed a callback to `fadeOut`, and the actual `audio.pause()` only ran on the final
  frame of a 15 ms `requestAnimationFrame` chain. Frames stop landing whenever the main thread is busy
  (decoding a waveform, encoding a WAV) and stop altogether when the tab is hidden, so the pause could
  simply never arrive. Worse, every fresh call began with `clearFade()`, which **discarded the pending
  `audio.pause()`** — so pressing the button again actively kept the audio alive. The ramp is cosmetic
  now and the halt belongs to a `setTimeout`; `stop()`/`pause()` also set their state synchronously, so
  the button answers the click rather than the ramp.
- **A missing blob failed silently.** `AudioVersion.blob` is `Blob | null` by design (missing or
  unreadable files), and `play()` returned on null with only a `console.warn` — after the fade-out had
  already stopped the previous file. Nothing played, and `isPlaying`/`activeFileId` were left pointing at
  the old file, so its card kept offering a STOP for audio that was no longer there. It resets the
  transport and says what happened.
- **Two `.catch` paths left `volume` at 0**, which would have made the *next* successful play silent.

**No player bar in a single tape view.** Added 2026-08-18. The bar was inline in `AllViewGrid`; it is now
[`src/components/GlobalPlayerBar.tsx`](../../src/components/GlobalPlayerBar.tsx), used by both views. It is
placed with `sticky bottom-4`, not `fixed`, so it rides the foot of the scroll column and inherits that
column's width and left offset — which matters because the browser panel on the left is resizable and a
`fixed` bar would have had to guess its width. "Last played file" moved into the player context
(`lastActiveFileId`) so both bars still name the same file across a view switch.

**On the spacebar:** there is no key handler for it and there should not be — the playbar's play/pause
control is a real `<button>`, so once clicked it holds focus and the browser fires a click on Space. That
is why it worked in All Tapes and not in a single tape: the behaviour follows the bar, and the single
tape view had no bar. It works in both now, but it is **focus-dependent by nature** — it acts on the last
thing clicked. A genuinely global "space always toggles the player" is a separate change, and would have
to be reconciled with the editor's own Space handler in
[`WaveformEditor.tsx`](../../src/components/WaveformEditor.tsx), which grabs and `preventDefault`s every
Space while it is mounted.

### Editor in Studio — three reports

As reported:

1. **Save copy to pool baked a pending edit.** With a trim made but not applied, "save copy to pool"
   applied the trim to the open file *and* saved a trimmed copy. Expected: an "Apply trim?" question, the
   open file left as it was, and a copy in the pool.
2. **Loop.** After previewing and auditioning a loop, applying it raised a "switch tools or discard?"
   warning instead of just applying.
3. **EQ.** Preview an EQ, switch tool without applying, answer "apply and switch" — the play button in
   the new tool (pitch) was dead and stuck reading PAUSE, the EQ still showed as previewing with its
   marker in the tool header, and the sound in pitch was back to pre-EQ. Nothing had actually applied.

**All three built and walked 2026-08-18 — every edit tool exercised, no bugs or unexpected behaviour
left.** The three share their plumbing: two of the causes are the shape the main-view player bug had, a
flag whose only reset path is an event that never arrives. In
[`WaveformEditor.tsx`](../../src/components/WaveformEditor.tsx) unless said otherwise.

- **A — the transport flag survived a reload, and nothing could clear it.** `isPlaying` was reset only by
  WaveSurfer's `'pause'` event, and that event does not come on either path that matters: the teardown
  clears `isMounted` *before* `destroy()`, and the handler is behind that guard; and `pause()` on an
  already-paused instance returns before emitting in both backends. `initEditor`'s own
  `setIsPlaying(false)` sat inside `if (wavesurfer.current)`, which the effect cleanup had already
  nulled — skipped exactly when it mattered. So the reload after an apply came up stuck: the button read
  PAUSE, and pressing it only re-ran the fade-out on an idle instance, which emitted nothing, for the
  rest of the session. There is one `resetTransportState()` now, called by everything that destroys or
  replaces the instance, and `handlePlayPause`/`triggerSafePause` ask the instance rather than the flag.
- **B — "Apply & Switch" ran the trim apply, whatever tool you were in.** The modal called
  `handleSave()`, which bakes region, fades and automation and nothing else — so answering it out of EQ
  wrote a version tagged `trimmed` with the EQ dropped, while the EQ controls stayed dirty behind it
  (hence the marker in the tool header and the preview still showing). Each tool has had its own apply
  all along; `applyActiveTool()` is the map to them, and `resetToolState()` puts the tool's controls back
  afterwards. That is report 3.
- **C — every preview `loadBlob` destroyed the trim region.** `'ready'` fires on each load and used to
  `clearRegions()` and hang a fresh full-width region across the *preview's* duration, so save, apply
  loop, save copy and save unique were all measuring the preview instead of the file — applying a loop
  after auditioning it trimmed a second time. The selection lives in a ref now and `getEditRegion()` is
  the only reader; a preview shows no region rather than a wrong one.
- **Report 2** — `handleApplyLoop` ended with `toggleTool(null)`, which re-ran the dirty check on the
  settings it had just applied and raised the "unsaved changes" modal *after* the work was done. It uses
  `executeToolSwitch(null)` now, like every other apply handler, and resets the loop's own params.
  `handleApplyStereoSplit` had the same line.
- **Report 1** — two separate faults. The button baked the pending trim/fade into the copy without
  asking; it offers *Copy with edits* / *Copy original* / Cancel now, and the open file is untouched
  either way. And [`handleSaveAsCopy`](../../src/App.tsx) pushed the copy's blob onto the **source** file
  as its new current version — asking for a copy silently applied the pending edit to the file you were
  editing. The history note now carries the source's own current audio, `currentVersionId` does not move,
  and the note is appended rather than prepended, because `versions[0]` is the original by contract
  ([utils/versionHistory.ts](../../src/utils/versionHistory.ts)) and prepending made the note *be* the
  original.
- **Also seen, not reported:** the pitch tool opened with no region when the switch rode on an apply (the
  blob-change reset clears what `executeToolSwitch` had just seeded); it re-seeds now.

### What the round left behind

Two things came out of it that are not bugs, and both stayed live in
[roadmap-bugs.md](../../roadmap-bugs.md):

- **ASSIGN TO TAPE is `handleSave`**, so pressing it with an EQ, limiter, pitch or cutter setting pending
  writes a version without that setting and leaves the tool dirty. Same trap as cause B through a
  different button, and changing what ASSIGN bakes is a design call rather than a bug fix.
- **How the two editor hosts should differ.** `#/editor` is a loose file that exits to the hub; Studio's
  tape editor is a slot that exits back to the grid. UX_Overhaul asked for a sketch of that split and
  never got one — the box was closed as a wireframe on 2026-08-18 because the answer comes from walking
  the component with a project behind it. The walk raised nothing about the split, so it is a roadmap
  item rather than a finding.
