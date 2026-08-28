# The submission tool — a plan

*Branch `submission-tool`, written 2026-08-23 — and built the same day. Phases A–G are all in;
what follows is the plan as agreed, kept as the record of why the tool has the shape it has.*

This supersedes steps 1–3 of [submission-workflow.md](../archive/submission-workflow.md) by building the thing
those steps described separately: **one guided surface that collects a whole submission and hands back
files.** The physics that document identified do not change — a pack is hundreds of megabytes that
travel by link, a preset is twenty kilobytes that travel attached, and both end at a maintainer
commit. What changes is that the artist stops reading a 175-line guide and fills in a form instead.

**Not built, and deliberately:** accounts, uploads, a backend, moderation. No audio leaves the machine.
The tool is a very good form with a validator attached.

---

## 1. What the tool is

A sixth mode at `#/submit`, alongside `browse`, `presets`, `config`, `editor` and `studio` — the same
tier shape as the rest: no project, no work folder, no permission prompt until something is written.

It is a **draft**, not a session. Everything the artist types is persisted to IndexedDB under a new
`submission-draft` store, so closing the tab mid-way loses nothing — which matters more here than
anywhere else in the app, because filling in a bio and eleven links is the longest typing anyone does
in this app.

### The two things it produces

| | 📦 Sample pack — **the default** | 🎛️ Preset — **optional** |
|---|---|---|
| Ceiling | none; 50, 100, 300 files | exactly 36 (6 tapes × 6) |
| Lands in | the app's Sample Browser, once approved | the Preset door **and** the pack's page |
| Tool hands back | `README.md` frontmatter + `manifest-entry.json` + `SUBMISSION.md` | `<preset-id>.json` descriptor + a ready-to-paste `presets[]` entry |
| Audio travels | by WeTransfer/Drive link, separately | doesn't — it references pack samples |

Plus a third output that is neither, offered whenever the selection is ≤36 or the artist picks 36 of a
larger set: **a ready-to-copy `SK/` folder**, built by the `exportSDStructure` the Preset door already
uses. That is for the artist who wants to hear their own pack on hardware before submitting it — the
best possible check on a pack, and currently something only a Studio user can do.

---

## 2. Where it is reached from

Five entry points, one constant, no duplication of the explanation.

1. **A hub door** — a sixth card, "Submit a Pack", making the grid 3×2. *(Decided 2026-08-23.)*
2. **Browse → the pool's export block.** "Send this pool to the submission tool." The pool is already
   in IndexedDB; the tool reads that store directly and the navigation is a hash change.
3. **Studio → the Export modal, preset tab.** Writes the current project into the draft store, then
   routes to `#/submit`. This is how a 36-slot project becomes a preset submission.
4. **The Preset door's contribute panel** — where step 0 already put a link to the guide.
5. **The help modal's contribute tab** — same.

Entry points 2 and 3 answer *"it should also be possible to export a studio or temporary pool to this
tool."* Both arrive **at step 1**, with the files already in the draft.

They skipped to step 2 at first, on the reasoning that the parcel had answered step 1's question
already. *(Revised 2026-08-23.)* It hadn't: a project can become a pack, a preset, or both, and
dropping someone straight into a file list they did not assemble left the most consequential choice
in the tool made silently on their behalf. Everyone walks the same line of questions, whichever door
they came through — step 1 simply says how many files are already waiting. A Studio project arrives
with the preset half pre-ticked, since a layout is what it is; the pack half stays at its default so
that choice is still made rather than assumed.

---

## 3. The flow

Six steps, a rail down the left, each one leaveable and returnable. Nothing is required until the
review step says what is missing.

### Step 1 — What are you sending?

Pack (checked by default), preset (optional), SD folder (optional, capped at 36). One screen, three
checkboxes, a sentence each.

**The pack can be unchecked.** *(Decided 2026-08-23.)* A Spotykach owner who arranged 36 slots out of
packs already in the app has something worth sharing and no audio to send — that is a preset-only
submission, and refusing it would turn away the exact person the Studio handoff is built for. What
changes when the pack is off: step 2 becomes read-only (the slots come from the preset, not from a
folder), step 3 asks for the preset's details rather than a pack's, and the review step drops the
"send the audio separately" line because there is no audio to send.

### Step 2 — The audio

Three ways in, all local:

- **drop a folder or files** onto the panel — the same decode path Browse's pool uses;
- **pick a folder** via `showDirectoryPicker`, read-only, so subfolder names survive as categories;
- **from the pool / from a project**, when arriving from entry point 2 or 3;
- **drop an exported project** — a settings-only `.json` descriptor or the `.zip` around one, read
  through the same descriptor parser the app already uses. *(Decided 2026-08-23.)* Someone who
  exported a preset last month, or who works on two machines, rebuilds nothing;
- **browse a folder and pick**, in the same `LocalFolderBrowser` tree the Sample Browser uses for
  local folders. *(Added 2026-08-23, on walking the built step.)* Taking a whole folder suits the
  artist whose folder *is* the pack; an artist with a drive full of recordings needs to listen before
  choosing, and forty out of four hundred is not a drag-and-drop.

What it shows per file: name, the title the app will derive from it, category (from the subfolder),
duration, and a flag. What it flags:

- **over 42 s** — allowed, and warned, in exactly the words the guide uses: the hardware plays the
  first 42 seconds and the editor still shows the rest;
- **not decodable** — counted and named, not silently dropped;
- **duplicate names** across categories, which collide when flattened;
- **a name that sanitizes to nothing**, which becomes an unnamed slot.

Titles are editable in place — that replaces the guide's *"if you have specific titles filenames
cannot represent, include a text file list."*

**Rows play and rows edit.** Auditioning runs through `AudioPlayerContext`, the app's own single
transport, so a submission behaves like anything else in the app and a second file stops the first;
editing opens `LooseFileEditor`, the same one Browse's pool uses. Neither is decoration — nobody
should submit a pack they have not listened to, and the commonest fix (silence at the top, a tail
that runs long) is one the editor already does. An applied edit replaces the file in the draft: it
is what gets submitted and what the SK folder is built from.

**One transport, one bar.** The first build drew two: an inline scrubber under whichever row was
playing, and nothing at all for a file auditioned out of the folder tree. Both were already going
through the same single `AudioPlayerContext` — the split existed only in the drawing, and the half
with no controls was the one doing the most work. There is now one `GlobalPlayerBar`, the app's own,
sticky above the step footer, with its interactive timeline. A file being previewed out of a folder
is not a draft row, so step 2 hands its record up to the shell under a `preview:` id that cannot
light up a row. Leaving the tool pauses it: the transport is shared with every other mode, and a
sample left running would follow the visitor to the hub with nothing on screen to stop it.

**The list is not a scroller.** It sat in a fixed-height box at first, which put a second scrollbar
inside the page's and made a hundred files feel like a peephole. The failure summary sits *above* the
list for the same reason: nine files that did not make it, reported under a hundred and eleven that
did, is a report nobody reaches.

### Step 3 — Who you are, and what this is

Artist/moniker, pack name, pack id (slugged live from the name, editable, checked against the ids
already in `manifest.json`), short description, full bio, cover image (dropped locally, previewed at
the hero's aspect ratio, warned if portrait or under 1200 px).

### Step 4 — Links

The part the guide gets most wrong today, by asking for full URLs. **Username in, URL out**: a table
of platforms — Bandcamp, SoundCloud, Instagram, YouTube, GitHub, Patreon, Spotify, Mastodon, X,
TikTok, Discord — each a single field taking `jonwtr`, expanded by a template. Website and any number
of custom `label + url` rows for everything else. Pasting a full URL into a username field is detected
and unwrapped rather than rejected.

### Step 5 — Licence, and the preset

Licence: CC0, CC-BY 4.0, CC-BY-SA 4.0, CC-BY-NC 4.0, "free for music, no resale as samples", and
**Custom** with a free-text box. Whatever is chosen is written into both the frontmatter and the
`SUBMISSION.md`, in full text, so the maintainer never has to ask what "custom" meant.

The preset half, when step 1 asked for one: name, description, the 36 slots laid out on the familiar
6×6 grid, **the notes**, and the checks the workflow document's step 1 specified —

- every `samplePath` resolves,
- slots are 1–6 across six colours,
- no entry carries both `samplePath` and `blobRef`,
- and the hybrid case called out plainly: *this preset carries its own audio, so it needs a pack
  submission too* — which here is not a dead end, because the pack half is the same draft.

**Artwork, in three levels.** *(Added 2026-08-24.)* A preset's own image; failing that the *submitted*
pack's cover; failing that a gradient keyed to the preset's id and drawn from the six tape colours, so
a list of unillustrated presets still reads as a list of different things. The middle level is
deliberately narrow: a preset built on packs already in the app does **not** inherit their covers.
Artwork is a credit as much as a decoration, and hanging Hainbach's photograph over somebody else's
layout would claim something untrue in both directions. `presetCoverPath` is the single place that
resolves the three, so the manifest entry, the archive and the editor's preview cannot disagree.

**Slots drag.** *(Added 2026-08-23.)* The same rules the grids in Studio follow, because a 6×6 grid
that looks like Studio's and does not behave like it is worse than one that looks different: onto an
empty slot it moves and leaves the source empty, onto a filled one the two swap, so a drag never
destroys anything, and Ctrl or Alt copies instead — which is how one sound ends up under two fingers,
a normal thing to want on this device and four clicks away in the picker. The drag carries its own
MIME marker rather than Studio's `application/x-spotykach-file-id`: those drags hold a project file
id and a slot here holds a draft row id, so accepting one would resolve to nothing. Touch works
without extra code, since `main.tsx` installs the `mobile-drag-drop` polyfill globally.

**Notes, written here.** *(Added 2026-08-23.)* A preset is a layout *and* what the artist has to say
about it — which tape is which, what to reach for, how it was meant to be played. Both halves have
always been part of the format (`projectNotes`, and a `notes` on each of the six tapes) and both
survived a Studio handoff, but an artist who never opened Studio had no way to write either: the
fields existed and were permanently empty for exactly the people this tool was built for. The step
now carries the app's own `NotesEditor` — one for the preset, one per tape behind an accordion — so
the markdown behaves the same and what is typed here renders in the project view when someone loads
it. They are reproduced in `SUBMISSION.md` too, being the half of a preset that a JSON diff makes
invisible.

### Step 6 — Review and send

A checklist of what is complete and what is not, then **one download**:

```
<pack-id>-submission.zip
├── SUBMISSION.md           the covering letter: who, what, what is reused, what is missing
├── submission.json         the draft itself, so the archive can be reopened here
├── README.md               frontmatter generate-manifest.mjs already parses
├── manifest-entry.json     the packs[] entry, samples[] included
├── LICENSE.txt             the chosen terms, in full
├── <preset-id>.json        the descriptor            (when a preset was made)
├── preset-entry.json       the presets[] entry       (when a preset was made)
├── cover.<ext>             (when one was given)
└── audio/                  the artist's own files, categories as folders
    ├── Drones/…
    └── …
```

**One download, not two.** *(Revised 2026-08-23, on walking the built step.)* It started as two — a
few kilobytes of metadata to attach to a message, and the audio to send by link — on the reasoning
that the small half should arrive complete even if the large half went astray. That bought nothing:
it made two things to keep track of, two things to lose, and a submission that could arrive half
present. One archive goes on WeTransfer or Drive; one link goes in the message. A preset-only
submission has no `audio/` at all and is small enough to attach directly.

**The archive reopens.** *(Added 2026-08-23.)* Everything else in it is a *projection* of the draft —
the manifest entry, the README frontmatter, the descriptor — and none of them can be read back into
the form that made them, so without `submission.json` the download was a one-way door: an artist who
cleared their browser, changed machine, or wanted to fix one title six months later had the ZIP in
hand and no way in. It carries the draft with the blobs stripped and each row's path inside the
archive recorded, so dropping the ZIP on step 2 pairs the two back up and restores the whole form —
including which step they were on. A dropped `.zip` is sniffed rather than asked about: a
`submission.json` inside means this, a `project-descriptor.json` means a settings-only export.
Restoring over work in progress asks first.

Filenames inside `audio/` are the artist's originals or the titles they typed here, chosen at the
download — the second option being for the artist who renamed everything in step 2 and wants that
work back out, to use in a DAW or another sampler. The extension always follows the source file: a
FLAC renamed `.wav` would lie about itself.

Then **where to send it** — Discord handle and mailto, both from `src/data/links.ts`, the mailto's
subject prefilled with the pack name.

---

## 3b. Two kinds of row, and why the difference runs through everything

*(Settled 2026-08-23, answering "how are we handling presets made with mixed samples?")*

A draft holds two kinds of file, told apart by whether the row carries a `sourceSamplePath`:

| | **The artist's own** | **Already published** |
|---|---|---|
| Where it came from | a folder, a card, a Studio project | Browse's pool, or an exported preset |
| Goes in `audio/` | yes | **no** |
| Listed in `packs[].samples` | yes | no — it is already in the manifest under its own pack |
| In the preset descriptor | `samplePath` pointing at where it *will* be | `samplePath` pointing at where it *is* |
| Counts toward the download size | yes | no |

**A preset may freely mix the two, and the good ones will** — some of the artist's own sounds, some
from packs that are already there. `requiredPacks` is derived from whatever ends up in the slots, so
a preset that draws on Hainbach's pack and the artist's own declares both without anyone typing a
list.

Getting a published sample into a draft goes through Browse: pool the samples, press *Send to the
submission tool*. It cannot be a file picker, because the row has to be **the published file**, not a
copy of it — a copy would ask the maintainer to deploy audio everyone already has, under a second
name, and the preset would then depend on the copy. Step 2 says this and links to Browse.

The distinction is visible rather than implicit: borrowed rows carry a link mark and the pack they
came from, their slots are marked in the 6×6 grid, they cannot be opened in the editor (editing one
would quietly make it the artist's own), and the step 2 summary counts them separately. The review
step's "at least one audio file" requirement counts *own* rows only — a draft holding nothing but
borrowed samples is a preset, however full the list looks, and it says so.

---

---

## 4. Build order

Each phase compiles, ships and is worth having on its own.

| | Phase | What lands |
|---|---|---|
| **A** | Route and shell | `#/submit`, the hub door, the six-step rail, the draft store, an empty flow that persists |
| **B** | Step 2, the audio | drop/pick/decode, the file table, the four flags, inline title editing |
| **C** | Steps 3–4 | details, cover, the username→URL link table |
| **D** | Step 5 | licence, the preset grid, the four descriptor checks |
| **E** | Step 6 | the ZIP, the frontmatter, the manifest entries, the SD folder, the send panel |
| **F** | The other four doors in | Browse pool handoff, Studio export-modal handoff, Preset panel, help modal |
| **G** | The documents | rewrite the guide against the tool that now exists |

### What it reuses rather than rebuilds

`buildDetachedState` (pool → `AppState`), `exportSDStructure` and `exportFilesOnly`,
`buildDescriptorFromState` — finally passed the `name` and `description` it has always accepted —
`audioEngine.loadAndProcessAudio` for decode, `ExportProgressModal`, `Toast`/`useToasts`,
`ConfirmModal`, `escapeStack`, `SmartTagInput` for categories, and the mode-bar/panel styling every
other door already wears. The genuinely new code is the form state, the validators, the link table and
the output writers.

---

## 5. The documents, after

- **[README.md](README.md)** — **deleted, replaced by a stub.** *(Decided 2026-08-23.)* Everything
  it teaches, the tool now asks for at the moment it is needed, and a second copy of the same fields
  is a second copy to keep true. What remains is a short page: what a pack is, what a preset is, the
  two hardware numbers (42 s, 36 slots), a link to `#/submit`, and a link to the maintainer docs.
  `SUBMISSION_GUIDE_URL` keeps pointing at it, so nothing that links to the guide breaks.
- **[submission-workflow.md](../archive/submission-workflow.md)** — steps 0–3 are then built. It becomes a record
  rather than a plan, so it moves to `docs/archive/`, with step 4 (the maintainer-side
  `generate-manifest.mjs` extension) carried forward to the roadmap.
- **[roadmap-bugs.md](../../roadmap-bugs.md)** — the "preset & pack authoring" entry closes; what is
  left of step 4 replaces it.
- **[CHANGELOG.md](../../CHANGELOG.md)** — one entry, on release.

---

---

## 5b. What the tool made necessary elsewhere

**A pack needs an address.** *(Added 2026-08-23.)* The tool tells an artist their pack will be
browsable in the app, which was true, and that they could send people to it, which was not: which
pack the Sample Browser had open was internal state and the URL never said so. `#/browse?pack=<id>`
now opens the browser on one pack — read once at mount, and again when the manifest lands, since a
deep link routinely names a pack that had not arrived yet — with a **Copy link to this pack** button
on the pack's own page. It always points at `#/browse`, whichever host the browser is mounted in: a
link handed to a stranger has to land somewhere that exists without a work folder.

The full-pack **download** already existed, as a `links[]` entry pointing at a ZIP on R2 — which
means it is a permalink but a maintainer has to upload it. That stays as it is; the tool's own
archive is the artist's copy, built on the spot, and the two do not need to be the same file.

---

## 5c. Not built here, and signposted instead

**Sending a project to one person.** Submitting means review, deployment, and a pack published under
the artist's name for everyone; sending a project to a friend is a different act, needs nobody's
permission, and already works — Studio's Export gives a settings-only `.json` (tiny, if both people
have the same packs) or a full backup `.zip` (carries the audio), and the other person uses Import.
It had no signpost, so someone who only wanted to reach a friend was about to fill in a licence and a
bio to do it. Step 1 now says so plainly and sends them back to Studio. *(Added 2026-08-23.)*

---

## 5d. Submission archive vs. shared project — the mix-up, handled

*(Settled 2026-08-23, after a submission archive was dropped into Studio's project import.)*

The tool grew out of the question "how do people share a project?", and the two acts stayed close
enough to be confused: both end in a ZIP holding a descriptor and some audio. They are not the same
thing, and the app now says so rather than failing.

| | **Share a project** | **Submit a pack** |
|---|---|---|
| Who it is for | one person, or your own second machine | everyone, via the app's catalogue |
| Needs permission | no | yes — review, then deployment |
| Built by | Studio ▸ Export ▸ Project Preset | the Submit tool |
| Opened by | Studio ▸ Import | the Submit tool's audio step |
| The audio inside | project-ready, 48 kHz WAV | the artist's masters, untouched |
| The paths inside | resolve today | resolve *after* the pack is deployed |

**They stay separate, and the mix-up is caught by name.** The deciding argument is the last row: a
submission's descriptor points at where the audio *will* live once a maintainer has published it, so
a project extracted from one would open with samples that resolve to nothing. Offering to extract it
would produce a broken project and call it a feature.

What was happening instead was worse: `handleImportProjectZip` unpacked *any* ZIP straight into
`Projects/<name>/` and only then tried to load it, so the wrong archive left a folder of somebody
else's files on disk and a bare "Failed to load project". Now both import routes look before they
write —

- **Studio ▸ Project Manager ▸ import from ZIP** checks for `submission.json` first, refuses by name,
  writes nothing, and offers a button through to `#/submit`. A ZIP with no `project.json` or
  `project-descriptor.json` is turned away too, instead of being unpacked hopefully.
- **The Import window** gained a `SUBMISSION_ARCHIVE` analysis type, so a submission dropped there is
  named rather than falling through to the loose-file scanner — which would otherwise have offered to
  import somebody's whole pack as a heap of untitled samples.

Both messages say the same two things: *to carry on with the submission, drop this in the Submit
tool*, and *to share a project, use Export → Project Preset*. One wrong turn, two named exits.

---

## 5e. How big is a pack, and what happens to the sounds that don't fill one

*(Settled 2026-08-23, working through the mixed-content scenarios.)*

**The architectural fact everything follows from:** a published preset holds *paths*, not audio. The
descriptor is resolved against the sample bucket at load time, so **every sound a published preset
uses must itself be published in a pack.** There is no third place for audio to live. The format has a
`blobRef` for audio carried inside a ZIP, but a preset served from `public/presets/` has no ZIP around
it, so that door is closed for anything published.

**The band: 10 to 100.** Ten is required, a hundred is a warning.

- **Ten** is not a technical limit — one sample deploys as happily as fifty. It is what a pack *is*: a
  page with cover art, a bio, links and a licence, which three sounds cannot fill without looking like
  a mistake. The three packs shipping today hold 26, 29 and 36, so the floor is well clear of reality.
- **A hundred** is a conversation, not a refusal. Three hundred good sounds are a gift and also a page
  nobody scrolls, a normalization run measured in hours, and a categorisation decision better made
  before the audio is sent than after. The warning asks for a word in the notes rather than fewer files.

### The scenarios, and what the tool now does

**A preset drawing on existing packs, plus a few new sounds of my own.** The commonest shape that does
not fit, and the one that was silently broken: the descriptor gave those slots a path into a pack that
was never being submitted, so the preset validated cleanly and arrived with holes in exactly the slots
the artist cared most about. It is now a required check — *your own samples are published with the
preset* — that fails unless the pack half is on. Under the ten-sample floor, step 1 says so at the
moment the choice is made, and offers the two real answers:

1. **grow the pack** to ten and submit both together, or
2. **don't publish at all** — Studio's Export → *Full Backup Bundle (ZIP)* carries the audio inside
   the file, and whoever receives it opens it with Import. No submission, no review, no licence. For a
   preset built around a few personal recordings this is usually the better answer, and it was
   invisible.

That second route is the point of the fork. The tool's job is not to talk everyone into publishing.

**A pack of twenty, plus two presets — one from my own sounds, one mixed.** *(Built 2026-08-23.)* The
draft holds a list of presets rather than one, because the expensive half of a submission is the audio
and both layouts share it — two submissions would ship the same twenty files twice. Step 5 is an
accordion: add, name, fill, write notes, remove. The archive emits `presets/<id>.json` per preset plus
one `preset-entries.json`, ids are disambiguated on the way out so two unnamed presets cannot
overwrite each other, and the SK build asks which layout goes on the card. Each preset works out its
own `requiredPacks`, so the mixed one declares Hainbach's pack and the other doesn't.

**Mixed slots within one preset.** Fully supported and visible — borrowed slots carry a link mark and
name their pack, are kept out of the archive, and `requiredPacks` derives from whatever ends up in the
slots. See §3b.

---

## 6. Known limits, stated up front

- **Publishing is still a commit.** Unchanged, and still by design.
- **The SK build needs a connection when the preset borrows.** Samples referenced from published packs
  are downloaded as the card is assembled — they are pointers in the draft, and the card is the one
  output that needs the actual bytes. Anything unreachable leaves its slot empty and is named.
- **Normalization stays a maintainer step.** The tool warns about durations and never re-encodes what
  it hands back. The one exception is the SK folder, which must be 48 kHz WAV because that is all the
  firmware reads — converted at the moment of export, for the ≤36 files that go on the card.
- **The archive is built in memory.** A browser holds the whole ZIP before it can hand it over, so a
  very large pack can fail on a machine that is short of room. It fails with a message that says so
  and suggests zipping the folder from the drive instead, which is what the artist did before.
- **The cover image is validated, not processed.** No resizing in-browser.
- **No moderation model.** Still worth a paragraph in the guide before the second submission arrives.
