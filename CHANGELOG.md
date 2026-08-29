# Changelog

## [4.1.1] - 2026-08-29

**The guide was behind the one door that asks for a folder first.** About & Help lived in Studio, so
the three things a first-time visitor most needs — what this app is, how to format a card, how to
send in a pack — were only reachable after committing to a work folder. They open from the hub header
now, and from inside the submission tool. Both stay lazy, so nothing above the fold pays for them.

**And a one-line CSS bug that made "fixed to the viewport" mean "fixed to the page".** It only showed
where the page itself scrolls, which is why it survived four versions of an app that was all
full-height modes until the hub arrived.

### Added
- **A Guide button in the hub header and in the submission tool's mode bar**, plus a "read the guide"
  panel on step 1 beside a placeholder for the walkthrough video. Set `SUBMISSION_VIDEO_ID` in
  [src/data/links.ts](src/data/links.ts) to publish it: it renders as a click-to-play facade against
  youtube-nocookie, so no third-party request is made unless someone asks for the video.
- **The four submission screenshots**, as WebP — full-window captures of a dark UI over a noise
  texture, roughly the worst case for PNG, at ~60 kB each against ~700 kB. Shots are
  click-to-enlarge now: one letterboxed into the modal reads at about 600px wide.
- **A news item for the submission tool**, now the featured post.

### Changed
- **Core Concepts said "Build vs. Sync"** and described a two-way mirror v4 removed. It says Build vs.
  Backup, with a Saving row covering explicit save against the browser-storage auto-save.
- **One news reader instead of two.** The hub's news layout and the modal's were separate
  implementations of the same reading; both use `NewsReader` now — index at the top as a list of
  lines rather than a grid of bordered cards, full article below. The image belongs to the article, so
  every post that has one shows it, not only the pinned one.

### Fixed
- **`#root` carried `filter: invert(0) grayscale(0) contrast(1) brightness(1)`.** An identity filter
  changes nothing on screen but still makes its element the containing block for every
  `position: fixed` descendant — so app-wide "fixed to the viewport" meant "fixed to `#root`", which
  is `min-height: 100vh` and grows with content. Invisible on the `h-screen` modes, where the two are
  the same box; on the hub, where the page scrolls, the help modal centred itself in the whole
  document and the texture stretched to match. The filter is composed in
  [src/App.tsx](src/App.tsx) now and collapses to `none` at rest, with `isolation: isolate` keeping
  the stacking context it used to provide, so the `mix-blend-mode` texture layers blend against the
  same backdrop as before.

---

## [4.1.0] - 2026-08-29

**A submission tool, for the few people who need one.** Almost everything in this app arrived because
somebody sent in a sample pack or a preset, and until now that meant reading a 175-line guide, copying
a template into a Discord message and filling it in from memory — after which the maintainer
translated the result into the JSON the app actually reads. The translation step is where things went
missing. `#/submit` now does the collecting and the checking while the author is still there to fix
what it finds, and hands back one archive to send. Nothing is uploaded and no account exists: the
audio still travels by a WeTransfer or Drive link, as it always did.

**Nothing changes for everyone else.** This is a sixth door most visitors will never open — the packs
and the presets it produces are the part they see. It knows what the rest of the app knows, though: a
pool assembled in Browse and a project open in Studio are both already a submission in everything but
name, so both can be sent straight into it, and an artist can build the `SK/` folder for their own
card from the same draft — the best check there is on a pack, and previously something only a Studio
user could do.

### Added
- **Submit mode (`#/submit`)** — a six-step guided form: what you're sending, the audio, the details,
  links, licence and preset, then review and send. Reached from a new hub door, from Browse's pool,
  from Studio's Export modal, from the Preset door and from the help modal's contribute tab.
- **The draft survives everything.** Held in a new IndexedDB store with its blobs, written on a
  debounce from the first keystroke. Closing the tab mid-way loses nothing, which matters more here
  than anywhere else in the app.
- **Folders come in as folders.** Drop or pick one and subfolder names become the browser's
  categories, titles are derived from filenames and editable in place, and durations are read on the
  way in. Files over 42 seconds are flagged and allowed; anything that can't be decoded is *named*,
  not counted.
- **Username in, URL out.** Eleven platforms — Bandcamp, SoundCloud, Spotify, YouTube, Instagram,
  Patreon, GitHub, Mastodon, X, TikTok, Discord — each take a bare handle and build the address. A
  pasted URL is unwrapped rather than refused.
- **A licence menu instead of a text box.** CC0, CC-BY, CC-BY-SA, CC-BY-NC, the usual sample-pack
  terms, or your own wording — each carrying the full statement that ends up on the pack's page.
- **The outputs a maintainer would otherwise write by hand:** the `packs[]` entry with its sample
  paths, `README.md` frontmatter for `generate-manifest.mjs`, the preset descriptor, the `presets[]`
  entry with `requiredPacks` derived, a `SUBMISSION.md` covering letter, and the cover image.
- **Send to the submission tool** in Browse's pool panel, and **Prepare a submission** in Studio's
  Export modal — both hand the files across without a download-and-re-upload round trip.
- **One download, with everything in it.** "Send the audio separately" used to mean finding the folder
  again, zipping it by hand and hoping the subfolders survived. The tool now builds a single archive —
  the details, the licence, the preset and `audio/` with the categories as folders — to put on
  WeTransfer or Drive and send as a link. The audio goes in untouched, so the maintainer normalizes
  from the masters, and filenames can be either the originals or the titles typed in step 2, for an
  artist who wants their renamed files back to use elsewhere.
- **The archive reopens.** It carries a `submission.json` holding the draft itself, so dropping the
  ZIP back on step 2 restores the entire form — files, titles, categories, details, links, licence,
  preset, notes, and the step you were on. Everything else in the archive is a projection of the draft
  and could never be read back, which made the download a one-way door. Restoring over work in
  progress asks first.
- **A preset can mix its own samples with packs already in the app.** Samples pooled in Browse arrive
  as *references*: marked as such in the file list and in the 6×6 grid, kept out of the archive, and
  pointed at where they already live, so nothing is deployed twice. `requiredPacks` follows from
  whatever ends up in the slots.
- **A preset can carry its own image**, in three levels: its own, the submitted pack's cover, or
  nothing. Presets built on packs **already in the app never inherit their artwork** — an image is a
  credit as much as a decoration, and hanging somebody else's photograph over a layout they had no
  hand in claims something untrue on both sides.
- **Unillustrated presets get a gradient of their own**, keyed to the preset id and drawn from the six
  tape colours. Every one used to show the same violet wash, so a list of three read as one thing
  repeated.
- **Preset slots drag**, the way Studio's grids do: onto an empty slot it moves, onto a filled one the
  two swap so nothing is destroyed, and Ctrl or Alt copies — one sound under two fingers without four
  trips through the picker.
- **Preset notes, written in the tool.** The general note and one per tape, in the app's own
  `NotesEditor`, so an artist who never opened Studio can write the half of a preset that isn't the
  grid. The fields were always in the format and always survived a Studio handoff — there was just no
  way to fill them in from here.
- **A signpost for the thing this tool is wrong for.** Sending a project to one person needs no
  submission, no licence and nobody's permission — Studio's Export and Import already do it. Step 1
  says so, rather than letting someone fill in a bio to reach a friend.
- **Browse a folder instead of taking all of it.** The same folder tree the Sample Browser uses for
  local folders, so an artist with a drive full of recordings can listen and pick forty rather than
  submitting four hundred.
- **Play and edit from the file list.** Rows audition through the app's own transport and open in the
  app's own editor. An applied edit *is* the submission from that point, and is what the SK folder is
  built from.
- **One player bar for the whole tool** — the app's `GlobalPlayerBar`, sticky above the step footer,
  with its interactive timeline. Everything lands there: rows in the pack, and files auditioned out of
  a folder before they are picked. Leaving the tool stops playback.
- **A shareable link to a single pack.** `#/browse?pack=<id>` opens the Sample Browser on that pack,
  with a **Copy link to this pack** button on its page. Which pack was open used to be internal state
  the URL never mentioned, so an artist had no way to send anyone to their own work.

- **`npm run submission -- <archive.zip>`** — a maintainer-side importer. It reads a submission
  archive, runs fourteen checks against the live manifest (every `samplePath` resolves, `requiredPacks`
  matches the slots, no `blobRef` in a published preset, slots are 1–6 across six colours, cover files
  exist, ids are free), prints the plan, and writes nothing until asked. `--apply` copies descriptors
  and covers into `public/presets/` and merges the entries into `public/manifest.json` — preserving its
  indentation and CRLF so the diff is the change and nothing else. `--normalize` runs `normalize.py`
  once per category folder, reassembles the output, and verifies the produced filenames against the
  paths the submission promised. Everything R2-bound is assembled in a working folder beside the
  archive — outside the repo, in a tree that mirrors the bucket, so publishing a pack is dragging one
  folder in rather than working out where each file goes.

### Changed
- **The submission guide is a signpost now.** `docs/presets-samples/README.md` keeps what is true
  before you open the tool — pack versus preset, the 42-second and 36-slot limits, what to have ready
  — and drops both step-by-step sections and the copy-paste template, which the form has replaced. Two
  places stating the same fields was one place too many.
- **The Preset door's contribute panel** offers the tool first and the guide second.
- **The Preset door says why it has no "Load into App".** Adopting a preset as a project needs a work
  folder to save into and a project list to name against, and this tier deliberately has neither — so
  the absence looked like a missing button rather than a decision. Its info strip now names Studio as
  where a preset goes to be kept and changed.
- **The maintainer guide was rewritten** around the submission archive. It described exporting from
  Studio and hand-writing the manifest entry, which the tool has done for you since; it now covers
  what is in an archive, what to verify before trusting a descriptor, and the split between files that
  are committed (preset descriptors and covers) and files that are uploaded (pack audio and covers).
- **Sample packs have a size band: 10 to 100.** Ten is required — a pack gets its own page, and three
  sounds cannot fill one. A hundred is a warning, not a refusal. Below the floor the tool offers the
  route it was quietly hiding: Studio's full backup ZIP carries audio inside the file, so a preset
  built around a few personal recordings can be shared directly rather than published.
- **A submission can carry several presets over one pack.** Step 5 became a list — add, name, fill,
  write notes, remove. The archive emits one descriptor per preset under `presets/` plus a single
  `preset-entries.json`, each preset works out its own `requiredPacks`, and the SK build asks which
  layout goes on the card. The alternative was two submissions carrying the same audio twice.
- **A preset using your own audio now requires the pack half.** A published preset holds paths, not
  audio, so a slot pointing at an unpublished sound resolved to nothing — the preset validated cleanly
  and arrived with holes in exactly the slots the artist cared most about.
- **Every route into the tool starts at step 1.** Arriving from Browse's pool or Studio's Export used
  to skip to the file list, which left the pack-or-preset choice made silently on the visitor's
  behalf. A Studio project now arrives with the preset half pre-ticked and the question still asked.
- **A preset's description defaults to its pack's**, and says so, until the first edit — the same way
  the pack id follows the pack name. A preset built on a pack is usually described by the same
  sentence, and asking twice got either a paste or a blank.

### Fixed
- **`requiredPacks` held pack names where ids belong.** `SampleBrowser` hands a pooled sample its
  pack's *display name* — right for a credit, wrong for `samplePackId` — and both were filled from
  that one field, so a preset built from Browse declared `"Hainbach's Spotykach Tapes"` as a
  dependency and no manifest has a pack by that name. Rows now carry the display name and the id
  separately, and the id is resolved from `samplePath` against the manifest, which is the only value
  guaranteed exact. Drafts and archives made before the distinction are repaired when they are
  opened, and the maintainer script names this case specifically instead of reporting a missing pack.
- **The SK folder came out empty for a preset built from published packs.** Those rows are *pointers* —
  their audio lives in the sample bucket, not in the draft — so the empty placeholder blob failed to
  decode, every file was skipped, and the card got the right folders with nothing in them. It took the
  README down with it: the file list and the licences are read off the files that made it, which is
  why the export also claimed no licence information existed. The SK build now downloads published
  samples as it goes, and names anything it could not fetch instead of dropping it silently.
- **The SK README credits each slot.** The origin sits on the same line as the file it belongs to, so a
  card built from three packs no longer lists its licences in one place and its filenames in another.
  "No specific license information found" now distinguishes an empty card from files that genuinely
  carry no licence.
- **Cover previews went blank under StrictMode.** The preview URL was minted in a `useMemo` and
  revoked by an effect — but a memo is not recomputed on StrictMode's second mount while the effect's
  cleanup runs on the first, so the `<img>` was left pointing at a URL that had already been revoked
  (`ERR_FILE_NOT_FOUND`, dev only). Creating and revoking now happen in the same effect, so neither
  can outlive the other. Affected both the pack cover and, once it existed, the preset cover.
- **Preset artwork survives a reopened archive.** The image went into the ZIP correctly and was never
  asked for on the way back out, so restoring a draft returned every field except the one that had
  taken a decision. The reader now requests each preset's cover alongside the audio and the pack
  cover, artwork is written for every preset holding some rather than only the submittable ones — a
  half-built second layout keeps its image — and covers carry the artist's own filename across the
  trip instead of the archive's generated one.
- **Deployed sample paths now hyphenate the way `normalize.py` does.** The tool wrote
  `/pack/Roaring Drone.flac` while normalization produces `Roaring-Drone.flac`, so any sample with a
  space in its name would have deployed to a path nothing pointed at — and the preset built on it
  would have resolved to nothing, months later, with no obvious cause.
- **A submission archive dropped into project import is now refused by name.** It used to unpack any
  ZIP straight into `Projects/<name>/` and only then try to load it, so the wrong archive left a
  folder of someone else's files on disk and a bare "Failed to load project". Both import routes now
  look before they write, say plainly that a submission is not a project, and point at the two exits:
  the Submit tool to carry on with it, Export → Project Preset to share a project with someone.
- **The step rail ticks what is done, not what is behind you.** It marked every step before the
  current one complete, so clicking through to step 3 without typing a word showed two green checks
  and a form that looked finished. A tick now means the step has what it needs; a step walked past
  with a hole in it shows an amber mark instead of waiting until the review page to mention it.
- **A loaded preset's samples showed as un-added in the Sample Browser.** The same file reaches the
  app under three spellings — the absolute R2 URL the manifest resolves to, the portable relative
  path a submitted preset stores, and the hostname baked into `hainbach-tapes.json` years ago. All
  three fetch correctly, because `resolveAssetPath` accepts all three, but the browser's
  already-added check compared them as strings and saw three unrelated values. A new `toSampleKey`
  in `assetUtils` collapses them, and both sides of the comparison go through it. Local folder
  paths are deliberately left alone, so folder browsing keeps comparing the keys it built.
- **A pack page repeated its preset offer once per preset.** Every preset naming the pack in
  `requiredPacks` got the same "this pack already spread across the 6×6 grid" card — true of the
  preset built *from* the pack, false of one that merely borrows a few sounds from it, and read as a
  duplicate either way. The two are now told apart by whether a preset requires this pack alone: the
  ready-made one keeps the offer, the rest become a quiet "Also used in" list that names the other
  packs they mix with. Both still open their own preset, which is what the repeated card obscured.

---

## [4.0.1] - 2026-08-22

**Housekeeping, with three real bugs in it.** Nothing here changes what the app does — it is the
first pass of a code-health branch. Two things are visible to you anyway.

**The editor could drop into its error screen.** Three overlays — automation, fades and the loop
preview — called React hooks after an early return, on values that change while the editor is
open. Picking the automation tool, loading audio, or starting a loop preview could each take the
hook count from zero to seven between renders, which React answers by throwing. It surfaced as the
editor being replaced by the fallback screen rather than as anything obviously broken. Fifteen
violations, all fixed.

**Nothing is fetched from a third party to draw the page any more.** The fonts came from Google
Fonts on every load, before anything rendered, for every visitor — which sent each visitor's IP to
Google whether or not they ever touched a sample. They are self-hosted now, under the SIL Open
Font License, and the page paints without two DNS and TLS round-trips to a third party first. The
ffmpeg core likewise loads from this site instead of falling back to a CDN. Sample and preset
packs still come from Cloudflare R2, and still only when you choose to download one.

### Fixed
- **Fifteen `rules-of-hooks` violations** across `AutomationOverlay`, `FadeOverlay` and
  `LoopOverlay`. Guards now sit below the hook declarations; the automation overlay's effects gate
  on `active` internally, so an inactive overlay still attaches no window listeners.
- **A stray vertical divider** floating to the right of the Buy Me a Coffee button, left behind
  when the QR code it used to separate was removed.
- **The ffmpeg CDN fallback ran a different build** than the local one — pinned to core `0.12.6`
  against a vendored `0.12.10` — so a failed local load silently switched binaries. Moot now that
  the fallback is gone, but it was wrong for as long as it existed.

### Changed
- **Fonts are self-hosted** from `public/fonts/`. Google's unicode-range subsetting is kept, so a
  browser still downloads only the subsets it needs — about 50 KB in practice.
- **The ffmpeg core loads only from this origin.** If the site can serve the app it can serve the
  core, so the CDN fallback was covering a deploy error at the cost of a permanent third-party
  contact. Its 20-second load timeout is gone too: with no second attempt behind it, the timeout
  was the only thing that could fail a legitimately slow download of a 32 MB file.
- **The coffee button uses the app's own header font** rather than pulling a fourth family from
  Google for one line of text.
- **Credits name what actually built this** — set up in Google Antigravity, continued with Claude
  Code in VS Code.

### Removed
- **Five dependencies nothing imported**, and 108 transitive packages with them: `@ffmpeg/core`
  (62 MB, never imported — `public/ffmpeg-core/` is a hand copy of its build), `@aws-sdk/client-s3`
  (left from a sample host the app no longer uses), `dotenv`, `@types/jszip` and `@types/uuid`.
- **`InfoModal.tsx`** — 170 lines, unreferenced since the About/Help modals were unified, and
  carrying its own stale copy of the credits.
- **The `/v2` redirect stub and the `/next` preview-deploy scripts.** Neither was in use; `/v2`
  now returns a 404 by choice, and no `next/` directory ever existed on the deployed branch.

### Documentation
- **The deploy workflow is in the README.** Pushing to `main` does not publish — `npm run deploy`
  does. It was previously only in `CONTRIBUTING.md`, which is easy to miss when the question is
  "why is the site not updating".
- **A privacy section**, saying plainly what leaves the browser and when.
- **[docs/optimization-plan.md](docs/optimization-plan.md)** — the ranked plan for the rest of this
  work, with the survey already done, plus what was deliberately decided against.

---

## [4.0.0 "Pervak"] - 2026-08-19

**The app used to be one door.** A setup wizard demanded a work folder, an SD card and a project name
before you could see anything at all, whether you had come to build a full six-tape project or just to
listen to a few samples. **It is now five doors, and four of them need no setup whatsoever.**

*Named for первак, the first run off a still, the strong opening fraction. Fitting for a release whose
premise is separating one muddled thing into clean tiers.*

### The five doors

| | What it is for | What it asks of you |
|---|---|---|
| **Browse** `#/browse` | Listen to the sample packs, collect what you like, download it | Nothing |
| **Preset → SD** `#/presets` | Pick a ready-made project, write it to a card, done | The card |
| **Config** `#/config` | Edit the device's `config.txt` | The card, or nothing at all |
| **Edit one file** `#/editor` | Open a file, edit it, download it | Nothing |
| **Studio** `#/studio` | The full app: projects, six tapes, the workspace | A work folder |

Each door is a real link you can bookmark or share, each loads only what it needs, and **nothing asks for
a folder until the moment something is actually written.**

### The short version of everything else

- **You can start with nothing.** No wizard, no folder, no project. Browse, preview, pool a selection and
  download it as SK-ready files or a card-ready 6×6, with no permission prompt anywhere in that path.
  Your own files go in too, dropped on the column or added from the pool header, converted as they land.
- **Cold start to a loaded card.** Preset → SD is pick a preset, pick the card, done. No work folder, no
  project created. Browsers without a directory picker get a ZIP rather than a dead end.
- **The SD card is a build target, not a backup.** A build used to write three copies of the same audio.
  With defaults it writes `SK/` and nothing else; the other two are opt-ins, off by default.
- **There is one backup, and it is deliberate.** Workspace backup goes to a folder you pick each time,
  shows exactly what it contains and what it weighs before it opens the picker, and removes its own
  folder if the write dies partway.
- **Auto-save actually exists.** The function was there and nothing ever called it. A closed tab or a
  crash no longer costs you the open project.
- **The Project Manager is a list of projects again**, not a two-column mirror with a sync column down
  the middle. Building to a card and importing a project from one both stay; the push-mirror, its badges
  and its modals are gone.
- **Settings is where options live**, in three tabs (Files / Look / System), instead of controls
  scattered across the Project Manager header, the build dialog and the editor sidebar.
- **The card can't be surprised any more.** Before a build, the preview names every file that is about to
  leave the card, deleted *or* overwritten, and offers to import them into the pool first.
- **Writes can no longer destroy what they were replacing.** Every write goes to a temp name and is
  swapped in only after the stream closes cleanly.
- **Hover works again.** All 333 hover rules in the app, 16% of the stylesheet, had been silently skipped
  on touchscreen machines since the very first commit.

Everything below is the same release in more detail. The full functional test pass that produced most of
the *Fixed* list is archived at [docs/archive/v4-test-rounds.md](docs/archive/v4-test-rounds.md), and the
reasoning behind the restructure is at [docs/archive/V4_PERVAK.md](docs/archive/V4_PERVAK.md).

---

### Added
- **A hub with five doors**, each linkable (`#/browse`, `#/presets`, `#/config`, `#/editor`,
  `#/studio`) and each loading only what it needs. Permission follows intent: nothing asks for
  a folder until the moment of an actual write.
- **Browse.** The sample packs, previewable, with a selection pool, and two downloads off it:
  SD-ready 6×6, or all the files under their original names. No permission prompt anywhere in
  that path. Your own library appears too, read-only, when it isn't empty. **Files from your
  own computer go in as well**, through "Add files" in the pool header or by dropping them on
  the column, converted to SK-ready WAV as they land. The export block under the pool folds
  away when the list needs the room, and stays folded until you unfold it.
- **Preset → SD.** Cold start to a curated project on the card: pick a preset, pick the card,
  done. No work folder, no project created. Browsers without a directory picker get a ZIP
  instead of a dead end.
- **Config.** MIDI and device setup against a bare card, with no project and no studio. Two
  settings the app never had (`slc_mn_a` / `slc_mn_b`, polyphony in Slice mode per deck) are
  now first-class, and **settings this build doesn't recognise survive a round-trip** instead
  of being silently stripped, shown in a "Kept from the file" section rather than hidden.
- **Editor.** Edit one file with no project at all, then download it or add it to the Browse
  pool, where a whole set becomes a card. It also opens over Browse, from a pool row or
  straight from a sample row.
- **Import into a project** from the Browse pool: the folder is picked at that moment and
  nothing that already exists is disturbed.
- **Workspace backup.** One explicit act, to a folder you pick each time, showing exactly what
  it contains and what it weighs before writing anything.
- **Auto-save**, which genuinely did not exist before: the function was there and nothing ever
  called it. A crash or a closed tab no longer costs the open project.
- News moved onto the hub, beneath the doors, instead of a modal covering the app on start.
- **The Preset door says where presets come from.** A line under the cards explains that they are
  projects built in Studio and shared, with a link to the submission guide.
- **Sample rows drag into the pool.** The row's button still works; a drag is the same act
  performed where you are looking. A drag begun on a selected row takes **the whole selection** and
  says so under the cursor; one begun anywhere else takes that row. The pool opens itself when the
  drag starts, so there is always somewhere to let go, and it says how many are about to land.
- **A pack page points at its preset.** Under a pack's ZIP: "Want this pack in a ready-to-go format
  for SK? Use the preset." It is matched from the preset's own `requiredPacks`, so nothing new goes in
  the manifest. Browse routes to `#/presets?preset=…` and Studio swaps the browser window for its
  presets panel; either way the card it means is scrolled to and ringed on arrival.
- **The pack ZIP says what it is.** "Dry file list · all N files, one folder, FLAC format", read off
  the pack's own file list rather than written into the button, so it is also the plain statement of
  what the preset beside it does differently.
- **A player bar in single-tape view.** It only ever existed in All Tapes; both views share one bar
  now, and the name of the last played file follows you across a view switch.

### Changed
- **The SD card is a build target, not a backup.** A build used to write three copies of the
  same audio; with defaults it now writes `SK/` and nothing else. The other two are opt-ins in
  Settings, off by default.
- **The Project Manager is a list of projects**, not a two-column mirror with a sync column
  down the middle. Building to the card and importing a project found on one both stay; the
  push-mirror, its badges and its modals are gone.
- **Settings is where options live.** Locations, auto-save, backup, history and cleanup, in
  three tabs, instead of scattered across the Project Manager header and a build dialog.
- **History is two versions per file by default**, the original and the current one, with
  everything between dropped on save. It is a setting now (Settings ▸ Files ▸ History & cleanup)
  rather than a rule the app applied without asking, and the Cleanup screen shows which way it is
  set instead of asserting it.
- **Cleanup says what each option costs.** Every option carries what it will free and how many steps
  it drops (`4 steps · 43.3 MB`), and the destructive ones ask before they run.
- Cleanup moved out of the editor's version sidebar, because a project-wide destructive action does
  not belong in one file's history panel.
- **A project opens on all six tapes**, not on one of them. The grid is the overview, so it is
  what you land on: every time a project is opened, created, restored or taken over from a
  preset, and not remembered from wherever you were standing in the last one. Picking a tape is
  still how you get to a single one; renaming or saving-as the project you are already in leaves
  you where you were.
- **The Registry sorts.** A–Z, by tape, or as added, each reversible, from one control in the
  browser header. A–Z puts numbers first and reads `10` as ten, not as one-zero; by tape runs
  tape then slot, and falls back to A–Z in the pool, where nothing has a tape yet. *As added* is
  the order files arrived in and is still the default, so no list rearranges itself until you ask
  it to. The choice is remembered on your machine, not in the project.
- **The way into the Sample Browser says what it does.** The Registry header's plain folder icon is
  now a folder with a plus in it, with the word *Browse* beside it, because the control adds files
  and a bare folder never said so.
- **Settings can be read.** Every explainer on the Files and System tabs was set at a size below the
  one at which the text can be read at all, and several ran to four lines of it. They are larger now
  and cut to the one sentence that answers the question, with the full wording behind an info icon
  that opens it in place. Nothing was shortened away: what the icon opens is the text that was
  there. The Danger Zone's explainer had a second problem. Its heading, a full-width button and its
  paragraph were three things in one row, squeezing all of them. It reads down the page now.
- **Presets and the three custom slots are two labelled sections** at the top of the Look tab,
  instead of named presets at one end of the panel and the `C1 C2 C3` they store into at the other,
  with the store buttons hidden behind a hover on the word *Store:*. Each slot is one control: the
  name puts the look on, the disk icon beside it saves the current look into that slot, and an empty
  slot says *empty*. **The live preset is highlighted**, and moving a slider off it marks it as
  changed and grows a way straight back to it. Which one is live is worked out from the look itself,
  so a preset restored from a previous session lights up correctly on open.
- **Every filter slider has a reset button** next to its name. Double-clicking a slider has always
  reset it and nothing but a tooltip ever said so; the double-click still works. The button greys out
  when that slider is already at its default, so the panel also says which of them have been touched.
- **Brightness and contrast go to 3×**, where both used to stop at 2×, which was not far enough to be
  useful on a bright screen.

### Fixed
- **The build preview says what leaves the SD card, and offers to keep it.** Clean Mirror makes the
  card match the project exactly, and what that removed was said only with a red trash badge on a grid
  cell: the confirmation counted none of it, and a card file being *overwritten*, destroyed just as
  surely as a deleted one, was counted nowhere at all. Every file leaving the card is now named
  before the write, in the plain view as well as the slot list and the final confirmation, and **one
  button imports them into the pool first**, so "clean" is no longer the only way out of it. A file
  the project simply moves to another slot is shown as a move: the card keeps that audio, and the
  preview no longer calls it a loss.
- **The player would not answer the buttons.** Playing a file from a tape slot or the left column
  could fail to start, and once started it answered neither the spacebar, nor pause, nor stop, for
  the rest of the session. The stop and pause commands were being handed to an animation frame that
  simply never arrived when the main thread was busy or the tab was hidden, and pressing the button
  again actively cancelled the pause that was still pending. The fade is decoration now; the halt is
  immediate. A file whose audio has gone missing also says so instead of failing in silence and
  leaving a STOP button pointing at nothing.
- **The editor applied the wrong tool.** Answering "Apply & Switch" ran the trim apply whatever tool
  you were actually in, so leaving EQ that way wrote a version with the EQ thrown away, while the EQ
  controls stayed dirty behind it and the preview kept showing. Each tool applies itself now.
- **Applying a loop after auditioning it raised a warning about unsaved changes**, after the work had
  already been done. Same for stereo split.
- **Auditioning an edit destroyed your selection.** Every preview quietly replaced the trim region
  with a full-width one across the preview's own length, so save, save copy, save unique and apply
  loop were all measuring the preview instead of the file. Applying a loop after previewing it
  trimmed the audio a second time.
- **"Save copy to pool" changed the file you were editing.** It baked a pending trim into the open
  file without asking, *and* wrote the copy's audio back onto the source as its new current version.
  It offers *Copy with edits* / *Copy original* / Cancel now, and the open file is untouched either
  way.
- **The editor's play button could stick on PAUSE after an apply**, dead for the rest of the session.
- **The cleanup confirmation flashed and vanished**, which read as a modal rendering off-screen. It
  was closing itself one frame after it opened.
- **"Reset Visual Effects" trailed the panel and could become unreadable.** The button has to be drawn
  outside the app's visual filters, since it is what turns them off and a CSS filter traps everything
  inside it, so it is drawn separately and told where to sit. It was also set to animate any
  property that changed, which included the position it was being told: it arrived 150ms late,
  trailing behind a dragged panel and sliding in from the corner of the screen when the tab was first
  opened. It lands where it is put now, and follows the panel through scrolling and reflow as well as
  dragging. Its fill was translucent, which meant it borrowed its background from the filtered panel
  underneath: at full inversion, pale text on a pale ground. It is opaque.
- **The video texture (texture 8) never worked on the published site.** Its file was requested from the
  root of the domain rather than from the app's own address, so it worked when run locally and 404d
  everywhere else. Every other asset in the app already resolved its path properly, including the one
  eleven lines away in the same feature.
- **"New Fresh Project" replaced the open project without asking.** Every neighbouring path (loading a
  project, leaving for the hub, changing the work folder) already warned about unsaved
  changes; the one menu item that creates a project on top of yours did not. It asks now, before
  the name is typed. The dialog also gained the answer it never had: **save the open project first,
  then start the new one**, alongside going ahead without saving and cancelling. It waits for the
  save to actually reach disk, so a save stopped by missing files leaves the open project where it
  is instead of replacing it anyway.
- **Nothing in the app reacted to hover on a touchscreen machine.** Tailwind v4 only applies
  `hover:` styles when the browser says the primary pointer can hover, and a touchscreen laptop
  says it cannot, even when you are driving it with a mouse. All 333 hover rules, 16% of the
  stylesheet, were being skipped: buttons stayed grey, rows never lit, and the only hover left
  working anywhere was the `+` on an empty slot, which is hand-written CSS rather than a utility.
  Hover now applies wherever there is a pointer to do it.
- **"Write to SD card" in Preset → SD could never open the picker.** The preset's audio was
  downloaded first and the card asked for afterwards, by which time the click that could open a
  file picker had expired, and Chrome refused it outright. The card is now chosen *before* anything
  downloads, from a step that says the two things that matter: pick the card itself, not a folder
  on it. Picking a card that already holds an `SK/` asks once more before overwriting it.
- **Interrupted writes can no longer destroy the file they were replacing.** Writes go to a
  temp name and are swapped in only after the stream closes cleanly. Where the browser refuses
  the swap (it is a newer, separate feature for folders you pick, and no feature test can see
  the difference) the file is written the plain way instead of the write failing.
- **Two files of identical byte length are no longer assumed identical.** SD writes now compare
  content; the cheap size check is kept only where the filename determines the content.
- **Hydrated preset audio could skip conversion entirely.** A bucket answering
  `application/octet-stream` produced blobs that failed every `audio/` check downstream, which
  would have written FLAC bytes into a file called `1.WAV`.
- **Bulk actions only ever worked for built-in packs**, logging "coming soon" for the library
  and project sources.
- **The preview bar's locate button did nothing outside a mounted folder.**
- Bulk imports never marked anything as added; only single-file imports did.
- Cards using the older bare `Projects/` layout listed projects whose import button threw.
- The preset panel's progress bar had markup and state but nothing ever wrote to it.

### Internal
- Storage keys and database names are namespaced per build, so a preview deploy can never
  reach the real app's data, or the live directory handles pointing at a real disk.
- `App.tsx`'s session state moved out into `session/ProjectSession.tsx`; the project-free modes
  are separate modules that never import `App.tsx` at all.
- 1002 lines of dead code removed in the first pass; `SyncOptionsModal` and `ProjectSyncModal`
  followed as their reasons for existing went away.
- The five `config.txt` defaults were spelled out in six places and are now defined once.
- **Eleven test rounds over the five doors, 38 findings, all built and walked.** The record is
  [docs/archive/v4-test-rounds.md](docs/archive/v4-test-rounds.md).
- The v4 plan and intent documents are archived at
  [docs/archive/V4_PERVAK.md](docs/archive/V4_PERVAK.md) and
  [docs/archive/UX_Overhaul.md](docs/archive/UX_Overhaul.md); `roadmap-bugs.md` and this file are the
  live documents again.

## [3.7.3] - 2026-06-30

### Added
- **Developer Resource Linking in App**:
    - Embedded a quick-access "App Maintainer & Developer Resources" directory inside the Help modal, linking presets upload guides, scripts documentation, and JSON schema specs together.
- **Copy-to-Clipboard Functionality**:
    - Integrated a monospace checklist submission template equipped with a visual "Copy" action button and success micro-animations.

### Improved
- **Documentation Restructuring**:
    - Centralized user/artist instructions by renaming and organizing `docs/submittingpresets/` into `/docs/presets-samples/`.
    - Consolidated developer-oriented, normalization, manifest generation, and zipping scripts under `public/presets/README.md`.
- **Media Guides in App**:
    - Embedded screenshot and video walkthrough guides inside the "Sample & Preset Guide" Help modal, stacking them vertically with ratio constraints to prevent UI cropping.

## [3.7.2] - 2026-05-20

### Added
- **SD Card Backup Restore**:
    - Integrated automated project importing directly from SD card backups inside the Project Manager, allowing users to restore missing workspace projects with one click.
- **Embedded WAV Metadata**:
    - Embedded UUIDs, processing details (`IART`, `ITMP`, `ICMT` tags), and slice points (`cue ` chunks) directly inside exported hardware-compatible WAV files to enable smarter, faster duplicate detection and sync workflows.

### Improved
- **SD Card Duplicate & Sync Detection**:
    - Upgraded duplicate detection to first leverage embedded UUID metadata in WAV headers for instant, overhead-free sync checks.
    - Improved same-content comparison to fall back on robust SHA-256 bit-for-bit content comparison when UUIDs are absent.
- **News Dashboard UI**:
    - Expanded news item list and featured news card heights from `160px` to `320px` in the News modal, significantly improving readability and space for updates.
- **Cache-Busting for News**:
    - Appended dynamic timestamp queries (`?t=Date.now()`) to news manifest fetch requests to bypass browser caches and force immediate update retrieval.

### Fixed
- **Visual Duplicate Borders in All Tapes**:
    - Corrected a bug where duplicate/conflicting files in the All Tapes grid view were not highlighted with an orange border. Aligned the visual styling to match the single tape view.

## [3.7.1] - 2026-05-09

### Added
- **Support & Community Integration**:
    - Integrated a dedicated **Buy Me a Coffee** support button in the About modal to support development.
    - Updated community links to point directly to the **Synthux Academy** community join page.

### Improved
- **Modal Consolidation**:
    - Merged the **About** and **Help** modals into a single, unified `AboutHelpModal` with a tabbed interface for better navigation.
    - Switched the Buy Me a Coffee widget to a high-performance **CSS-only implementation**, resolving security (COEP) and loading issues associated with external scripts.
    - Optimized the QR code rendering by embedding the logo as a base64 data URI, ensuring 100% offline reliability.

### Fixed
- **Build Integrity**: Resolved TypeScript compilation errors related to unused hooks in the new modal component.

## [3.7.0] - 2026-04-29

### Added
- **Portable Export Module**: 
    - Introduced a dedicated "Portable SK Folder" export that automatically bundles hardware-compatible `SK/` structures and `INSTALL_INSTRUCTIONS.txt`.
    - Integrated documentation directly into ZIP exports to guide users through SD card preparation.
- **Project Preset Sharing**: 
    - Added support for "Settings-Only" JSON presets, enabling lightweight sharing of project configurations that reference cloud-hosted (R2) samples.
    - Added "Full Backup" ZIP export for bundling local audio assets with project state.

### Improved
- **Export Workflow UI**:
    - Refactored `ExportModal` into a modular, tabbed interface for clearer separation between hardware preparation, preset sharing, and raw file downloads.
    - Moved the "Export" entry point into the "Project" dropdown to reduce header clutter and group related actions.
    - Added prominent instructional alerts in the export interface to guide users toward the primary "Build SD" hardware workflow.
- **Navigation Components**: 
    - Enhanced the `Dropdown` component with support for dividers and category headers.
- **Project Content**:
    - Updated official Hainbach preset pack links to resolve formatting issues and ensure hardware compatibility.

## [3.6.3] - 2026-04-28

### Added
- **News System**:
    - Integrated a dynamic, markdown-powered News Modal to keep users updated on development progress, tutorials, and new sample releases.
    - Implemented a manifest-driven architecture (`news-manifest.json`) for automatic content delivery and "New" badge alerts.
    - Enhanced readability with a clean, typography-focused layout (via `@tailwindcss/typography`).
    - Added smart UI features including a collapsing header on scroll, "Back to Top" navigation, and featured/pinned update blocks.
    - Added a dedicated "News" entry point in the main header with unread notification state.

### Improved
- **Global UI**: Refined modal backdrop treatments and scroll behavior consistency across high-density information views.
- **Project Setup**: Streamlined the transition from the Setup Wizard to the main application with automatic unread news checking.


## [3.6.2] - 2026-04-27

### Improved
- **Playhead Animation**: Enhanced the playhead smoothness in tape views (Single and All Tapes) by implementing a high-frequency `requestAnimationFrame` update loop, matching the visual performance of the main sample editor.
- **Global Modal Support**: Added universal `Escape` key support to close all modals and overlays, improving keyboard navigation and UX consistency.
- **Vite Build Optimization**: Refined the Vite configuration and build chunking strategy to improve loading times and production bundle efficiency.

### Fixed
- **Project Creation**: Resolved a `ReferenceError: saveProjectToDirectory is not defined` that prevented creating new fresh projects or cloning projects. This issue was caused by missing dynamic imports in the project management handlers.
- **Playhead Bounds**: Resolved an issue where the sample playhead in tape views could bleed into the padded margins of the card. The playhead is now strictly contained within the waveform content area.


## [3.6.1] - 2026-04-26

### Improved
- **Header & Navigation**: Streamlined the main header layout by reorganizing menu items for better accessibility and focus.
- **Onboarding Experience**: Refined the onboarding/welcome screen UI with improved typography and contrast for better readability.

### Fixed
- **Presets Panel**: Resolved an issue where preset cover images failed to load from Cloudflare R2 due to Cross-Origin Embedder Policy (COEP) restrictions. Added `crossOrigin="anonymous"` to ensure proper CORS/COEP compliance.

## [3.6.0] - 2026-04-23

### Added
- **Project Export & Presets Reform**:
    - **Automatic Project Loading**: Projects imported via ZIP now load automatically, featuring a "Discard Changes" safety check to prevent data loss.
    - **Community Presets**: Introduced a dedicated Presets system with a pre-populated `public/presets/` library for quick setup.
    - **Metadata Healing**: Implemented automated attribution and license verification during export, ensuring all samples have proper origin and license tags.
    - **Enhanced SD Export**: Organized the `SK/` folder structure to strictly follow firmware requirements, including centralized `config.txt` and `notes.md` placement.
    - **License Transparency**: Exported projects now include a detailed `README.md` with full sample attribution, license information, and usage instructions.
- **Documentation**:
    - Added [docs/how_to_copy_to_SDcard.md](./docs/how_to_copy_to_SDcard.md) with step-by-step instructions for hardware synchronization.

### Improved
- **Import/Export Logic**:
    - Synchronized project metadata during SD import/export to preserve file origins and license information.
    - Added support for `project-descriptor.json` for more robust project metadata handling in ZIP archives.
    - Improved path resolution in ZIP imports to handle nested folder structures more gracefully.
- **UI/UX**:
    - Refined the Project Manager with better feedback during duplication and renaming operations.
    - Standardized metadata display across the application for better license visibility.

## [3.5.0] - 2026-04-22

### Added
- **Cloudflare R2 Migration**:
    - Migrated sample and project hosting from GitHub Pages to Cloudflare R2 to overcome GitHub Pages storage limitations.
    - Added `manifest.json` for centralized metadata resolution and fetching of available community packs and project files.
    - Updated "Download Full Pack" links to fetch ZIP downloads directly from the R2 storage location.
- **Config Management**:
    - Added a `pre_load` toggle setting to the `config.txt` generation and parsing logic, accessible directly from the Config Modal UI.

### Improved
- **Sample Browser UI**:
    - Resolved TypeErrors occurring during bulk sample imports.
    - Standardized tape color indicators and improved the visual consistency of file selection borders.
    - Implemented robust CORS/COEP-compliant audio fetching for remote assets.

### Removed
- Removed locally hosted audio sample pack files (`public/samples/`) in favor of remote fetching, freeing up repository storage and speeding up build times.
## [3.4.1] - 2026-04-14

### Fixed
- config.txt location was set to root folder instead of SK folder
- download button worked, but save to SD was only saving to project folder not to the SD card
- changes applied to all appropriate files where the function is called

## [3.4.0] - 2026-03-27

### Added
- **Loop Tool Finalization**:
    - Implemented **Discard Protection**: The Loop tool now tracks user interaction (`hasLoopInteracted`) and integrates with the global "unsaved changes" warning system.
    - **Auto-Reset on Discard**: Canceling loop edits now automatically resets crossfade duration and "Fit-to-42s" mode for a clean state.
    - **Improved UI Workflow**: Replaced the static Preview button with a "Preview/Edit" toggle for more intuitive tool interaction.
- **Centralized Library Sync**:
    - Unified the "Library Sync" experience by migrating core logic and `LibrarySyncModal` into `App.tsx`.
    - Streamlined access from both `ProjectManager` and `LibraryManager` via centralized handlers.
- **Enhanced Help & Onboarding**:
    - Added a direct **Help Icon** to the Project Manager header for instant accessibility to documentation.
    - Updated help content with revised descriptions for "Build vs. Sync" and "Library" management concepts.

### Improved
- **Audio Playback Management**:
    - Implemented **Playback Mutual Exclusion**: Starting main waveform playback now automatically halts history version previews (and vice versa) to prevent overlapping audio streams.
- **Trim Tool Logic**:
    - Refined "Unsaved Changes" (dirty state) detection to distinguish between automatic 42s trims and manual user adjustments.
- **Normalize Tool UX**:
    - Added an informative note ("Normalization already applied") for files that have already been processed, improving feedback over simply disabling the button.
- **Browser Panel Layout**:
    - Optimized dense list views by repositioning action icons above tape labels, providing better readability for long names.

### Fixed
- **Cleanup & Maintenance**:
    - Removed obsolete **Fix Slots** functionality from the Project Manager.
    - Deleted unused `DeviceImportModal.tsx` component and its associated state/logic.
 
## [3.3.2] - 2026-03-25

### Added
- **Project Cleanup Enhancements**:
    - Simplified the "Project Cleanup" workflow by making **History Only** the default primary action.
    - Updated button labels to clearly clarify that **History Only** preserves the original version plus the latest step.
    - Refactored **Clean All** to include the original version in the deletion mapping for a more thorough project wipe.
    - Improved UI prominence by making the safest action ("History Only") the primary red button.
- **SK Backup Refinements**:
    - Added an explanatory section for SK Backups, detailing their purpose and local storage folder (`_sk_backups`).
    - Improved the backup list layout with better typography and icons.

### Fixed
- **Backup Date Bug**: Resolved an issue where SK Backups displayed "Invalid Date" by implementing a custom parser for folder-safe ISO timestamps.

## [3.3.1] - 2026-03-25

### Added
- **Persistent Log Tracker**: 
    - Introduced a dedicated logging service (`logger.ts`) that captures all system info, warnings, and errors.
    - Logs are persisted to `logs.txt` within the active project work folder.
    - Added a **Log Viewer Modal** with filtering and session export (.txt) capabilities.
    - Replaced the "Reset App" button in the sidebar with a **Logs** accessibility button.
- **Notification Stacking**:
    - Refactored the notification system to support a vertical stack of messages, preventing UI overlaps in the Waveform Editor.
    - Implemented React Portal-based rendering for notifications to ensure they always stay on the top layer.
    - Auto-logging: All toast notifications are now automatically mirrored to the system logs for auditability.

### Fixed
- **UI Overlap**: Resolved a regression where multiple tool messages and "Edit Saved" notifications would overlap and become unreadable.

## [3.3.0] - 2026-03-24

### Added
- **SD Import & Build Workflow Overhaul**:
    - Introduced **Import Presets**: "Standard import", "Merge into project", "Merge into project + Mirror", and "Custom" to standardize SD card synchronization.
    - Implemented a high-density UI for the SD Sync Modal with a 10-second auto-hide feature for the audio player.
    - Unified preset button layouts across Simple and Advanced views for better consistency.
    - Added clear visual feedback for destructive sync actions (trash icons and high-visibility red dashed borders).
    - Compacted the Build & Import modal layout, featuring a "Before & After" comparison view and streamlined header/footer.
    - Implemented **SHA-256 Hash Comparison**: Replaced the unreliable size-only sync diff fallback with a bit-for-bit SHA-256 content hash check, ensuring 100% accuracy in detecting file changes even for identical file sizes.
    - Introduced **Duplicate Group Detection**: Automatically identifies audio content that exists in multiple slots across both project and SD card.
    - Added **Duplicates Banner**: A highlights-aware, collapsible amber banner that lists redundant files with hover-to-highlight integration for the main slot grids.
- **Onboarding & Workflow Enhancements**:
    - Refined the setup flow: users can now enter a project title immediately after "Start New Setup" or "Skip Intro," bypassing the Project Manager to load directly into the Tapes view.
    - Enhanced "Resume Session" to skip the Project Manager and load the latest session automatically.
    - Integrated the **Core Concepts Explainer** into the Help section for easier accessibility.
- **Config & MIDI Management**:
    - Added "Save to SD" and "Download" buttons directly to the Config Modal.
    - Pre-populated the Config Modal with default presets for quicker setup.
    - Updated MIDI settings schema to include start/stop control toggles (`mid_ps_a`, `mid_ps_b`).
- **Slicer Tool Refinements**:
    - Slice points and state now persist across different tool edits.
    - Added global visibility toggles, slice locking, and snapping functionality for markers.

### Fixed
- **UI Stability**: Resolved layout collapse issues in the Cleanup Modal and fixed duplicate "Apply" buttons in the Pitch tool.
- **CORS & Assets**: Switched sample hosting to jsDelivr to resolve CORS issues and optimized file sizes to stay within CDN limits.
- **SD Sync Accuracy**: Fixed a bug where files of the same size were incorrectly marked as "Matched" (e.g., G4 collision) by implementing content hashing.
- **Project Structure**: Removed obsolete V1 routes and implemented redirects to ensure a seamless transition to the V2 application.

## [3.2.0] - 2026-03-18

### Changed
- **Unified Application Entry**: Removed the version picker and the legacy V1 application. The root URL now directly serves the latest (V2) application.
- **Legacy Redirects**: Implemented a transition layer that automatically redirects any requests for `/v2/` back to the root URL, preventing 404s for bookmarked users.
- **Build System Simplification**:
    - Removed `build:versioned` and associated scripts.
    - Standardized on the default Vite build process for deployment.
    - Cleaned up obsolete documentation and multi-version build logic from `package.json` and `README.md`.

## [3.1.2] - 2026-03-12

### Fixed
- **Sample Browser CORS Fix**: Resolved `TypeError: Failed to fetch` when importing samples from GitHub.
    - Switched default sample hosting to **jsDelivr CDN** to provide correct CORS headers.
    - Updated path resolution logic to preserve directory hierarchy, ensuring samples are correctly located without needing to flatten folder structures.

## [3.1.1] - 2026-03-04

### Added
- **config.txt Management System**: 
    - Dedicated modal for managing hardware configuration files (`config.txt`).
    - **MIDI Channel Assignment**: Independent sliders for Deck A and B channels (1-16).
    - **MIDI Transport Control**: Independent Start/Stop toggles for Deck A and B (`mid_ps_a`, `mid_ps_b`).
    - **Preset System**: Save/Load configuration presets to `localStorage`.
    - **Project Browser**: Load configuration directly from other project folders.
- **Hardware Synchronization**:
    - `config.txt` is now fully integrated into the **Push SK to SD** and **ZIP Export** workflows.
    - Two-way sync: Detects differences between local and hardware settings with Pull/Push options.
    - Added "Force Overwrite" option to export all project content regardless of diff status.

### Fixed
- **Sync Stability**: Resolved crash when loading/scanning older projects with missing or legacy configuration properties.
- **Project Manager Detection**: Improved sync status accuracy by including protocol-level configuration in the project comparison logic.

### Documentation
- Created [docs/configtxt/configtextsettings.md](./docs/configtxt/configtextsettings.md) with technical specifications for the Spotykach configuration format.


## [3.1.0] - 2026-03-04

### Added
- **Interactive Keyboard Slicer Map**:
    - Converted static modal into a **floatable, movable panel** using `react-rnd`.
    - Implemented **Click-to-Play**: Any key in the visual map now triggers its corresponding slice playback.
    - Added **Input Highlighting**: Keys now pulse and glow cyan when triggered via computer keyboard, MIDI notes (C1-G3), or mouse clicks.
- **Marker Removal**:
    - Added hover-based removal directly on the waveform (hover marker to reveal delete icon).
    - Added inspector-based removal (delete icons next to marker inputs).
- **Slicer UI Vertical Layout**: Reorganized Slicer controls into a two-row layout for better logical grouping of inspection and generation tools.

### Fixed
- **MIDI Auditioning Sync**: Refactored MIDI event listeners to use stable references, ensuring note mapping stays in sync after adding or removing markers.
- **WAV Export Marker Sorting**: Fixed an issue where markers were not always sorted chronologically in exported WAV files.
- **State Integrity**: Resolved a race condition where the slicer state could be mutated in-place during export.

### Documentation
- **WAV CUE Research**: Added comprehensive research and implementation notes for WAV slice markers (CUE chunks). See the [docs/WAV-CUE](./docs/WAV-CUE) folder for technical details, including:
    - [Slice Implementation Summary](./docs/WAV-CUE/slice_implementation_summary.md)
    - [WAV CUE Research & Instructions](./docs/WAV-CUE/wavcueinstructionsresearch.md)


## [3.0.0] - 2026-03-03

### Added
- **Major Waveform Editor Overhaul**: All tools are now consolidated into a single bar with contextual options appearing below. Resetting is now handled on a per-tool level.
- **New Tools**:
    - **EQ**: Basic 3-band 12dB controls with an advanced modal popup featuring 10-band 24dB precision.
    - **Limiter**: Toggle between **Auto** (basic upwards compression) and **Peak** (hard limiter with draggable waveform threshold).
    - **Cutter**: Erase audio segments by double-clicking to add regions, with 0-100ms fades to prevent clicks.
    - **Slicer**: Add up to 32 slice CUE points (Note: Implementation on Spotykach hardware pending).
    - **Stereo**: Split-view for stereo files with color-coded superimposed mode to visualize L/R differences.
- **Updated Tools**:
    - **Trim / Fades**: Enhanced precision for start/end points with automatic 42s limit logic and custom fade curves.
    - **Loop**: Create perfect loops with custom crossfades (includes logic to shorten result for seamless playback).
    - **Automation (Volume)**: Manual volume tweaking with optional normalization and a new visual dB scale guide.
    - **Normalize**: Added level selection options.

## [2.3.0] - 2026-02-28

### Added
- **SD Card Sync Enhancements**:
  - Added option to browse and reselect the SD card within the sync window.
  - Added "Clear All" for preset import options to allow selective file importing.
  - Implemented functionality to import only selected files to the project pool.
- **Onboarding & Setup Improvements**:
  - Added "Back" buttons to all onboarding steps for better navigation.
  - Implemented a "Resume" feature that detects previous work and warns about potential version conflicts.
  - Cleaned up onboarding UI by removing redundant style options and keeping essential toggles.
- **Sample Browser & Window Management**:
  - Implemented resizable and draggable functionality for the **Sample Browser** window using `react-rnd`.
  - Added a pencil (edit) icon to library files to quickly locate and highlight them in the manager.
  - Fixed resize handle overflow that caused unwanted scrollbars at viewport edges.
  - Improved action bar positioning to correctly overlay the component regardless of scroll state.
- **Advanced Search**:
  - Implemented "Advanced" search mode in the local folder browser with persistent filters and warnings.

### Fixed
- **Library Manager Stability**:
  - Implemented physical disk deletion sync to ensure deleted files are removed from the drive.
  - Added filtering to exclude temporary files (e.g., `.crswap`) and hidden system files from library scans.
  - Resolved "hang and rebuild loop" issues by memoizing handlers and adding mount guards.
  - Prevented autosave from writing missing file records back to disk.
- **Project Manager**: Fixed "Backup Modified" label incorrectly appearing when content was identical — now uses content-based comparison instead of timestamps.
- **UI/UX Refinements**:
  - Fixed recursive folder toggle logic to correctly traverse only downwards from the selected path.
  - Refined "Locate File" functionality in the Sample Browser with improved path matching and "locatePulse" animations.
  - Improved play button interaction on file rows to handle toggle play/pause state correctly.

## [2.2.0] - 2026-02-26

### Added
- **License Management**:
  - Added **WTFPL** (Do What The Fuck You Want To Public License) to the license preset list.
  - Implemented per-file and bulk license editing within the **Library Manager**.
  - Integrated `NotesEditor` for licensed fields in settings and management tabs.
  - Added auto-save mechanism for license fields with visual checkmark indicator.
- **Project Notes Improvements**:
  - Refined alignment of tape note previews for better vertical consistency.
  - Implemented logic to ensure the Project Notes window is fully visible on initial load.
  - Default state for tape notes in "All Tapes" view is now fully collapsed.
- **Browser & Preference Management**:
  - Added "Reset Browser Choice" option in settings and direct cogwheel link in browser header.
  - Integrated "Remember Choice" functionality with global browser settings.

### Fixed
- Resolved **white screen error** caused by named import mismatch for `BrowserChoiceModal`.
- Fixed JSX syntax errors and closing tag issues in `LibraryManager.tsx`.
- Resolved persistent "Missing Files Detected" notice by improving cleanup logic.
- Restored visibility of SD backup scan results and implemented direct recovery actions.

## [2.1.0] - 2026-02-24

### Major Feature: Visual Overhaul
- **Visual Settings Tab**: Added a dedicated Visual Settings modal featuring smooth animated transitions between various visual presets. Provides granular slider controls over visual elements like brightness, contrast, and inversion.
- **Texture Enhancements**: Introduced scrolling background textures in the Sample Pack Browser and granular noise textures in the Audio Editor to improve the app's aesthetic depth and contrast on main controls.
- **Interactive Video Background**: Integrated an interactive video loop into the Setup Wizard / Welcome screen with an easily accessible toggle for playing video sound.
- **Theme Improvements**: Refined the Setup Wizard with updated title gradients, button opacities, and adjusted the bottom button spacing to avoid Windows taskbar clipping.

### UI/UX Refinements
- **React Portal Integration**: Isolated the "Reset Visual Effects" button from global UI filters using a React Portal, ensuring it always remains visible. Repositioned Toast notifications to the top of the screen to prevent clipping and fixed portal rendering issues.
- **Player Bar**: Improved playback interaction (play/pause consistency via spacebar and clicks) and refined the progress bar styling throughout the All Tapes view using darker/lighter contrast hints.

## [2.0.1] - 2026-02-22

### Added
- **Sample Manager / Library Manager Overhaul**:
  - Added a **Review Import Batch** step before importing files into the user library.
  - Review supports:
    - temporary audition/preview playback,
    - removing files from the batch,
    - renaming display/filename before import,
    - assigning tags per-file and globally across the batch.
  - Added persistent batch processing logs with manual clear for debugging and user transparency.

- **WAV to FLAC Import Pipeline**:
  - Added stricter uncompressed WAV detection and conversion logic.
  - When conversion is enabled, qualifying WAV imports are converted and stored as `.flac`.
  - Improved conversion reliability by loading FFmpeg from local app assets first, with safe fallback behavior.

- **Scrub Preview Players**:
  - Added bottom scrub playback bars in:
    - Sample Pack Browser,
    - Review Import Batch,
    - Library Manager current-library section.
  - Enables precise auditioning and seeking before import/use.

- **Tagging and Search Improvements**:
  - Added tag filters to Sample Pack Browser (User Library view) and Library Manager.
  - Added selectable tag-pill filters.
  - Search now matches **partial tag text** and also **filenames**.

- **Library Editing Workflow**:
  - Redesigned "Your Current Library" into a two-column management layout:
    - left: clean selectable file list (selection, play, title, edit),
    - right: bulk editor for rename and tags.
  - Multi-select rename now auto-numbers titles (`Name 1`, `Name 2`, ...).
  - Renaming updates stored filenames (extension-aware) and syncs disk files in `User_Library`.

- **Project Load Diagnostics for Missing Assets**:
  - Missing asset errors are now captured as structured load issues.
  - Users receive a detailed modal showing:
    - affected file records,
    - assignment location (slot refs or unassigned pool),
    - missing version references.
  - Added one-click cleanup option to remove unrecoverable file records and clear dead slot references.
  - Added SD backup cross-reference and restore option:
    - checks backup project assets,
    - reports recoverable counts,
    - restores available missing assets from SD backup,
    - offers cleanup only for unresolved remainder.

- **Swap Sample Packs .wav files**: 
  - Swapped the files to the more compressed fileformat flac to save space.
    - Synthux horror samples pack
    - jonwtr samples

## [2.0.0] - 2026-02-22 - not integrated into /V1

### Big overhual of SD card import/export system

For now entering the main URL will first offer the option to run old V1 version. When picking the new version, V2, it will open the Setup Wizard, which will allow you to select a project or create a new one.

- **Project Manager**: Added a new Project Manager to manage multiple projects and their associated SD SK Folders.
  - unified import/export system with a Syncing logic.
  - Separate project syncing and Root SK folder syncing.

- **Main header**: now has the following buttons:
  - Import SD
  - Build SD
  - Save
  - New Project
  - Project Manager

### TODO
- debugging / testing various issues with the import/export system
- build a user library of samples, accesible from each project see the [roadmap](roadmap-bugs.md) for more details

## [1.1.6] - 2026-02-17

### Fixed
- **Unassign Slot Bug**: Fixed a critical issue where unassigning a slot in "All Tapes" view or specific contexts would incorrectly remove the file from the **Blue** tape instead of the target tape. The removal logic now explicitly respects the target tape color.

### Improved
- **Smart Export Folder**: The export logic now intelligently detects if the user selected a folder named `SK`. If so, it writes directly to it instead of creating a nested `SK/SK` structure.

## [1.1.5] - 2026-02-16

### Fixed
- **Audio Pitch Issue**: Users reported hearing a pitch shift on macOS when editing. Resolved a critical issue where editing 44.1kHz audio (common on many systems) resulted in high-pitched playback and incorrect speed.
    - **WAV Headers**: The encoder now correctly writes the actual sample rate of the audio data instead of hardcoding 48kHz.
    - **Automatic Resampling**: The Waveform Editor now automatically checks regarding audio sample rates and resamples non-48kHz audio to the project standard (48kHz) before saving.
    - **Robust Architecture**: Implemented a centralized `toWav` method in the audio processor to ensure all future features automatically benefit from these safety checks.

## [1.1.4] - 2026-02-15

### Fixed
- **Smart Sync Export Crash**: Resolved a "Permission denied" error during export by correctly cloning file data into memory during the sync process. Previously, the app held references to files on the SD card which could become invalid or locked, causing the export to fail when trying to read them.

## [1.1.3] - 2026-02-15

### Added
- **Sync Preview**: A new confirmation modal appears before running "Restore & Sync", showing a summary of new files and updated versions found on the SD card.
- **Sync Progress**: Visual feedback during the sync process using the standard task progress interface.

## [1.1.2] - 2026-02-15

### Added
- **Smart Sync**:
    - **Backup Detection**: Automatically detects `project_backup.zip` when importing an SD card folder structure.
    - **Restore & Sync**: New workflow to restore the project state from backup AND synchronize any new recordings or changes found on the SD card (based on file size comparison).
    - **Logic**: Prevents "blind overwrite" of new recordings when restoring a backup, and prevents "loss of project context" when importing only audio files.

## [1.1.1] - 2026-02-15

### Improved
- **Preview Behavior**:
    - **Refresh Logic**: "Preview" buttons now act as a "Refresh" trigger when active, allowing parameter updates without stopping playback.
    - **Pause Support**: Users can now pause the preview using the main transport controls.
    - **Visuals**: Added a "Refresh" icon with a spin animation.

### Fixed
- **Export Polish**:
    - **Progress Bar**: Restored visibility of the green progress bar (`bg-synthux-action`).
    - **Logs**: Reduced log spam by hiding redundant text messages during export.
    - **CSS**: Fixed a syntax error in `index.css` causing build warnings.

## [1.1.0] - 2026-02-14

### Major Feature: Volume Automation
- **Keyframe System**: Added a professional volume automation overlay. Users can now add, move, and delete points to create precise volume fades and curves over time.
- **Interactive Overlay**: 
    - Click line to add points.
    - Drag points to adjust time/volume.
    - Double-click waveform to add point and **auto-enable** the panel.
- **Controls**: Smooth/Linear toggle, value sliders, and dedicated delete buttons.

### Added
- **Loop Preview**:
    - **Gapless Looping**: Implemented native browser looping for "Preview Loop" to eliminate the audible JS-latency gap.
    - **Crossfade Controls**: Dedicated slider for loop crossfade duration.
- **Smart Sync**:
    - **Incremental SD Export**: Tracks file versions to only write changed files to the SD card, significantly speeding up exports.
- **Sample Packs**:
    - Added **Vinyl Crackle** (11 samples) and **Foley** (5 samples) categories to the **Jonwtr Explorations** pack.
- **Export**:
    - **Progress Feedback**: Added a visual progress bar and percentage indicator during ZIP generation and file processing, providing real-time feedback for long export operations.

### Fixed
- **Data Integrity (Critical)**:
    - **Export Clicks**: Fixed an off-by-one error in the trimmer logic (`audioProcessor.ts`) that caused a single sample of silence (click) at the end of exported WAV files.
- **UX**:
    - **Tooltips**: Comprehensive tooltips added for all editor buttons and toggles.
    - **Layout**: Improved alignment of Automation and Loop panels in the top toolbar.
- **Playback**:
    - Fixed sticky playback state when triggering processing actions.

## [1.0.2] - 2026-02-12

### Changed
- **About Modal**:
    - Updated audio specification to **32-bit** (from 16-bit).
    - Added **Browser Compatibility** section clarifying support for Chromium, Safari, and Firefox.
- **Export Modal**:
    - "Write Directly to SD Card" option is now visible but **disabled** on unsupported browsers (Firefox, Safari), with an explanatory warning, instead of being hidden.

### Documentation
- Updated README within exported ZIPs to reflect version 1.0.2.

## [1.0.1] - 2026-02-12

### Added
- **Export Modal**: Added "Manual Export" mode for mobile devices. Allowing exporting single files but converted to the 1.WAV, 2.WAV, etc. format.

### Fixed
- **Export Modal**: Added scrollbar and max-height to support smaller screens (UI Overflow).


## [1.0.0] - 2026-02-09

### Major Release
- **Import/Export Overhaul**:
    - Complete restructuring of Import and Export flows.
    - Support for SD Card Structure imports (drag & drop folders).
    - Enhanced Export options (Project Backup vs SD Card Structure).
    - **Mobile Support**: Added "Manual Export" mode and Android error handling.
    - Dedicated Import/Export Modals with clear analysis.
- **Reset Application**:
    - Added "Reset Application" functionality (accessible via Tape Selector or Info Modal).
    - Clears all local data (IndexedDB & LocalStorage) for a fresh state.
- **Help & Documentation**:
    - Added comprehensive Help Modal (?) with guides on SD Card Structure, Firmware usage, and Troubleshooting.
    - Added Info Modal (i) with app details and credits.

## [0.2.2] - 2026-02-09

### Improved
- **Touch Support**:
    - Confirmed working on Windows Touch (Asus ProArt PX13) and Android (OnePlus Pro 10).
    - Fixed issues with drop zones not highlighting on mobile by implementing a JSON-over-Text payload system.
    - **Note**: The layout is still optimized for Desktop; phone usage is possible but cramped.
    - **Android Caveat**: Android OS often dumps exported folder structures into device-specific paths on SD cards rather than the root.

### Fixed
- **Mobile Drag**: Fixed "Drag starts but drop fails" loop on Android.
- **Audio Editor**: Fixed touch handles accumulating state and becoming unresponsive.

### UI/UX Refinements

- various small tweaks, e.g. color of the highlighted borders of cards following the theme of the tape.

### Documentation
- **Info Modal**: Updated the "Desktop Only" warning to a softer "Desktop Recommended" message, acknowledging Beta mobile support.
- **Main README**: Synced the Roadmap section with your latest updates in roadmap-bugs.md, prioritizing Export and Trashcan features.

## [0.2.1] - 2026-02-08

### Added
- **Selection Workflow**:
    - **Exclusive Selection**: Selection is now exclusively triggered by clicking the dedicated circle/checkbox on the card, separating it from the "Open Editor" action.
    - **Clear on Move**: Selection state is automatically cleared after a successful bulk move operation.

- **Editor Access**:
    - **Direct Open**: Clicking the main body of a file card (Single or Double Click/Tap) now opens the Audio Editor immediately.
    - **Edit Icon**: Added a specific "Edit" (pencil) button to both Tape and All views for explicit editor access.

- **Bulk Interaction**:
    - **Move vs Copy**: Dragging multiple files slots now defaults to "Move" (clearing source) instead of "Copy".
    - **Touch Improvements (Trial)**: Enhanced touch event handling for better drag-and-drop and tap responsiveness on mobile devices.

## [0.2.0] - 2026-02-08

### Added
**Duplicate Management**:
    - **Visual Indicators**: Orange borders and alert icons highlight files used in multiple slots.
    - **Conflict Resolution**: Added a modal to resolve duplicates by keeping a specific slot or making all unique.
    - **Save Unique**: In the Audio Editor, duplicates now show a "Save Unique" button to create a forked copy instantly.

**File Management**:
    - **Deleting vs. removing logic** applied to browser, editor browser and tape views
    - **Unassign Action (X)**: move sample to the "Unassigned" pool 
    - **Delete Action (Trash)**: delete sample from the project and remove it from slots and project state.
    - **Confirmation Logic**: Delete action modals as a barrier to accidental deletion.

- **Smart Drag & Drop**:
    - **Single Slot Swap**: Dragging a file from one slot to another occupied slot now triggers a Swap.
    - **Bulk Conflict Resolution**: When dragging multiple files to occupied slots, a modal offers to Overwrite or Push to free slots.
    - **Touch Support**: Initial implementation of drag and drop for touch devices (polyfilled).

- **Bulk Selection**:
    - **Multi-Select**: Added ability to select multiple files in the browser (Shift/Ctrl + Click) and multiple slots in tape views.
    - **Batch Actions**: Perform Move, Delete, or Drag operations on all selected items simultaneously.

### UI/UX Refinements
- **Slot Cards**: tweaked various styles and added spacing for a cleaner look.
- **Button Styles**: with improved colors and hover effects
- **Improved Visuals**: Fixed card/modal clipping issues.
- **Tape View**: Relocated "Download Tape" button next to the tape title for easier access.
- **All View**: Made tape headers (icon and label) clickable to navigate directly to the specific tape view.
- **File Browser**: Aligned Play and Download buttons vertically in the expanded view for better accessibility.

### Changed
- **Exports**: Enforced uppercase `.WAV` extension for all single file downloads to match hardware requirements.

### Fixed

- **File Browser**: Fixed flickering issue when hovering over a file that is currently playing.
- **Import**: Fixed import failure for files with special characters by automatically sanitizing filenames.
- **Assets**: Renamed conflicting files in Jonwtr sample pack to remove special characters.


## [0.1.0] - 2026-02-07

### Added
- **Tape View**: Individual tape management with 6 slots.
- **All View**: Grid overview of all 6 tapes (36 slots total).
- **Waveform Editor**:
    - Normalize, Trim, Fade In/Out processing.
    - Version history with Restore and Delete capabilities.
    - Visual tags for applied effects (Normalized, Trimmed).
    - "Assign to Tape" functionality without creating duplicate files.
- **Sample Browser**:
    - Integrated "Synthux Horror" and "Jonwtr Explorations" sample packs.
    - Preview and Import functionality.
- **Export**:
    - Export single tape to Zip.
    - Export entire project to Zip (Backup).
    - Export structure for SD Card (direct file write simulation/instruction).
- **UI/UX**:
    - Dynamic Synthux theme colors for tapes.
    - Drag and Drop support for slots.
    - Responsive layout improvements.

### Fixed
- **Tape Icon**: Restored colored tape icon in headers.
- **Playback**: Improved audio engine playback stability.
- **Visuals**: Aligned Play buttons and icons across views.

