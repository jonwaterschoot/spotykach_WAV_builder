# Maintainer guide — publishing presets and packs

> [!NOTE]
> **This is the maintainer's side.** Artists don't read this — they use the
> [submission tool](../../docs/presets-samples/README.md) at `#/submit`, which produces the archive
> §1 unpacks. Audio processing is in [scripts/normalize-audio.md](../../scripts/normalize-audio.md).

## Start here

**Make a working folder outside the repo and drop the ZIP into it.** One folder per submission,
anywhere you like — `~/spotykach-imports/dust-loops/`, a scratch folder on the desktop, it does not
matter. It only has to be *not* the repo, because everything that lands in it is bound for Cloudflare
R2 and none of it is ever committed.

```
~/spotykach-imports/dust-loops/
└── dust-loops-submission.zip        ← paste it here, then point the script at it
```

Then, from the repo:

```bash
npm run submission -- ~/spotykach-imports/dust-loops/dust-loops-submission.zip
```

That checks and prints; it writes nothing. Add `--apply` when you believe it, and `--normalize` if
the submission carries audio. Afterwards the working folder looks like this:

```
~/spotykach-imports/dust-loops/
├── dust-loops-submission.zip
├── originals/                       the artist's masters — keep them, upload nothing from here
│   ├── Drones/Roaring Drone.wav
│   └── Perc/Tap.wav
└── upload-to-R2/
    └── samples/                     ← drag THIS into the bucket root, and you are done
        ├── dust-loops/
        │   ├── Drones/Roaring-Drone.flac
        │   ├── Perc/Tap.flac
        │   └── cover.png
        └── dust-loops.zip           the "Download Full Pack" button
```

`upload-to-R2/samples/` mirrors the bucket's own layout, so there is no point at which you have to
work out where a file goes. Drag the `samples` folder in and every path resolves.

### Everything else goes straight into the repo

The script writes these itself; you review them with `git diff` and commit:

| | |
|---|---|
| `public/presets/<preset-id>.json` | the descriptor |
| `public/presets/<preset-id>-cover.png` | a preset's own artwork |
| `public/manifest.json` | the `packs[]` and `presets[]` entries |

**The divide is decided by path**, in [`resolveAssetPath`](../../src/utils/assetUtils.ts): anything
starting `/presets`, `/img`, `/news` (and a handful more) is served from this repo — **everything else
is R2**. So `/presets/x-cover.png` is a file you commit, and `/dust-loops/cover.png` is a file you
upload. That is the whole rule.

### A preset-only submission uploads nothing

No audio, so no `originals/` and no `upload-to-R2/`. The script says so, and the entire job is the
three repo files above. That is the walk to do first.

---

## 1. Publishing a submission archive

```bash
npm run submission -- <working-folder>/<name>-submission.zip                        # check only
npm run submission -- <working-folder>/<name>-submission.zip --apply                # write it
npm run submission -- <working-folder>/<name>-submission.zip --apply --normalize    # …and convert the audio
```

| Flag | |
|---|---|
| `--apply` | write the changes. Without it nothing is touched. |
| `--normalize` | run `normalize.py` over the staged audio and verify the result |
| `--force` | replace manifest entries whose id already exists |
| `--stage <dir>` | put `originals/` and `upload-to-R2/` somewhere other than beside the ZIP |

It prints who sent what and where everything will land, runs every check in §1.3 against the live
`manifest.json`, and shows exactly which files it would write. `--apply` copies the descriptors and
covers into `public/presets/`, merges the entries into `public/manifest.json` — backing it up first,
and matching its existing indentation and line endings so the diff is the change and nothing else —
and stages any audio.

**It refuses to write anything while a check is failing.** Warnings do not block; failures do.

The rest of this section is what the script is doing, for when it reports something and you want to
know why, or when a submission is odd enough to want doing by hand.

### 1.1 — the shape of an archive

A submission arrives as one ZIP, `<pack-id>-submission.zip`, built by the tool. What is inside
depends on what was submitted:

| File | When |
|---|---|
| `SUBMISSION.md` | always — **read this first** |
| `submission.json` | always — the artist's working copy. **Nothing to deploy; ignore it.** |
| `LICENSE.txt` | always |
| `audio/…` | a pack was submitted, with the categories as folders |
| `README.md` | a pack was submitted — frontmatter for `generate-manifest.mjs` |
| `manifest-entry.json` | a pack was submitted — the ready-to-paste `packs[]` entry |
| `cover.<ext>` | the pack has cover art |
| `presets/<preset-id>.json` | one per preset |
| `presets/<preset-id>-cover.<ext>` | a preset has artwork of *its own* |
| `preset-entries.json` | one or more presets — the ready-to-paste `presets[]` entries |

**A preset-only submission has no `audio/`, no `README.md` and no `manifest-entry.json`** — it adds
no new sounds, only a layout over packs that are already published.

### 1.2 — read `SUBMISSION.md`

It names the artist, what they are sending, the licence, which packs the presets depend on, any
samples reused from published packs, files over 42 seconds, anything the tool could not read, and
whatever the artist wanted to tell you. It is generated from the same draft as everything else in the
archive, so it cannot disagree with the files beside it.

### 1.3 — check the descriptor before you trust it

For each `presets/<preset-id>.json`:

- **Every `samplePath` must exist.** Cross-check each one against `packs[].samples[].path` in
  `public/manifest.json`. A path that matches nothing hydrates to an empty slot and the app reports it
  politely at the end of a load, which is far too late.
- **`requiredPacks` in `preset-entries.json` must list every pack those paths belong to.** The tool
  derives this, so it is usually right; it is wrong if the artist hand-edited the JSON.
- **No entry may carry both `samplePath` and `blobRef`.** A `blobRef` in a *published* preset resolves
  to nothing — audio inside a ZIP has no ZIP around it once the descriptor is served on its own.
- **Slots are 1–6 across the six colours**, `fileId`s resolve into `files`.

### 1.4 — copy the files in

```bash
# The descriptor — the filename must match descriptorPath in the entry.
cp presets/<preset-id>.json  public/presets/<preset-id>.json

# Its artwork, if the preset brought its own. Committed, not uploaded:
# /presets/… resolves to this repo, not to R2.
cp presets/<preset-id>-cover.png  public/presets/<preset-id>-cover.png
```

A preset whose `coverImage` points at `/<pack-id>/cover.jpg` is reusing the **pack's** art — there is
no separate file for it, and it works as soon as that pack is deployed. A preset with no `coverImage`
at all is intentional: the Preset door draws a gradient keyed to its id.

### 1.5 — paste the manifest entries

Open `public/manifest.json` and append:

- every object in `preset-entries.json` to the `presets` array;
- the object in `manifest-entry.json` to the `packs` array, if a pack came too.

The entries are complete except for `sdExportUrl`, which is yours to add if you build one (§2).

### 1.6 — verify locally, then commit

```bash
npm run dev
```

Open the **Preset → SD** door and confirm: the card appears, its artwork is right, the description
reads well, and **Load** hydrates every slot. Watch the console for missing-asset warnings — that is
step 2's check, run for real. Then commit `public/manifest.json`, `public/presets/<preset-id>.json`
and the cover, and push. Pages rebuilds.

> [!TIP]
> **Renaming a preset id after publishing breaks any link anyone has shared** — `#/presets?preset=<id>`
> and `#/browse?pack=<id>` are both public URLs. Settle the id before it ships.

---

## 2. Optional — a pre-built SD ZIP

Gives the preset's card a **Download SD ZIP** button for people who would rather not build one.

1. Load the preset in the app, then **Export ▸ Portable SK Folder ▸ Download**. (The submitting artist
   can also build this from the tool's last step, but yours is built from what you actually published.)
2. Upload to R2 as `presets/<preset-id>-SD.zip`.
3. Add `"sdExportUrl": "https://pub-6649b937be6b4a8c9b92904c5ac392fc.r2.dev/presets/<preset-id>-SD.zip"`
   to the preset's manifest entry.

---

## 3. Publishing a pack's audio

Only when the archive contains `audio/`.

### Prerequisites

Python 3, FFmpeg on `PATH`, and `pip install pydub mutagen`.

### Step 1 — normalize

```bash
python scripts/normalize.py "path/to/audio" "Artist Name"
```

Peaks to −1 dB, converts to `.flac`, replaces spaces with hyphens, and writes `title`/`artist` tags.
Output lands in a `normalized/` folder beside the source.

> [!WARNING]
> **`normalize.py` is not recursive.** It globs one directory, so a pack whose categories are folders
> comes out having processed *nothing* — and says `Found 0 files...` while looking like a success.
> `npm run submission -- … --apply --normalize` runs it once per folder and reassembles the output
> into `upload-to-R2/samples/<pack-id>/` with the categories intact, then checks every path in
> `manifest-entry.json` against the files that actually came out. Doing it by hand means one run per
> category folder.

The renaming is why that last check matters: the submission's sample paths were written before
normalization happened. The tool sanitizes them the same way in advance, but any file you rename
yourself will not match.

> The submitted audio is the artist's **master**, deliberately untouched by the tool — this is the
> step that changes it. Keep the originals until the pack is live.

### Step 2 — stage the folder

A folder named for the pack id, holding the normalized `.flac` files with their category subfolders
intact, the cover as `cover.jpg`, and the archive's `README.md` at its root.

### Step 3 — regenerate or trust the entry

`manifest-entry.json` is already complete, and its sample paths assume the filenames survive
normalization and gain a `.flac` extension. If you renamed anything, regenerate instead:

```bash
node scripts/generate-manifest.mjs "path/to/<pack-id>"
```

> [!WARNING]
> `generate-manifest.mjs` emits the `packs[]` entry only, never `presets[]`. Its frontmatter parser
> also mis-reads a `key: |` block whose continuation lines contain a colon, which is why the tool
> writes single-line frontmatter and puts long text in the body.

### Step 4 — upload and deploy

With `--normalize`, all of this is already assembled: drag `upload-to-R2/samples/` into the bucket
root and the `.flac` files, the cover and the full-pack ZIP all land where the manifest expects them.

By hand, the same thing spelled out:

- The `.flac` files to `samples/<pack-id>/` on R2, categories intact.
- The cover to `samples/<pack-id>/cover.jpg`.
- A zip of that folder to `samples/<pack-id>.zip` — this is the **Download Full Pack** button.
- Paste the `packs[]` entry into `public/manifest.json`, commit, push.

---

## 4. The descriptor schema (`spotykach-project/1.0`)

```json
{
  "schema": "spotykach-project/1.0",
  "name": "My Preset Name",
  "description": "Short description shown in the Presets panel.",
  "tapes": {
    "Blue":      { "slots": [{ "id": 1, "fileId": "uuid-1" }, { "id": 2, "fileId": null }], "notes": "" },
    "Green":     { "slots": [], "notes": "" },
    "Pink":      { "slots": [], "notes": "" },
    "Red":       { "slots": [], "notes": "" },
    "Turquoise": { "slots": [], "notes": "" },
    "Yellow":    { "slots": [], "notes": "" }
  },
  "files": {
    "uuid-1": {
      "originalName": "Roaring Drone.flac",
      "origin": "hainbach-tapes",
      "samplePackId": "hainbach-tapes",
      "samplePath": "/Hainbach/Roaring-Drone.flac",
      "license": "free to use in your music, no reselling as part of sample pack or instrument.",
      "tags": ["drone"],
      "slicePoints": []
    }
  },
  "projectNotes": "Optional notes visible in the app.",
  "projectConfig": {
    "mid_ch_a": 1, "mid_ch_b": 2,
    "mid_ps_a": false, "mid_ps_b": false,
    "pre_load": true
  }
}
```

Every tape carries six slots in the real thing; two are shown above for brevity.

- `fileId`s are arbitrary but must match the references in `tapes[color].slots[].fileId`.
- `samplePath` must match a `packs[].samples[].path` in the manifest.
- Set `samplePath` **or** `blobRef`, never both — and `blobRef` only inside a ZIP, never in a
  published preset.
- `notes` on a tape and `projectNotes` on the project both render in the app and in an SD export's
  `README.md`.

## 5. The manifest entry (`presets[]`)

```json
{
  "id": "hainbach-tapes-preset",
  "name": "Hainbach's Spotykach Tapes",
  "description": "A dark ambient layout using Hainbach's roaring drones and bells.",
  "coverImage": "/presets/hainbach-tapes-preset-cover.jpg",
  "requiredPacks": ["hainbach-tapes"],
  "descriptorPath": "/presets/hainbach-tapes.json",
  "sdExportUrl": "https://pub-6649b937be6b4a8c9b92904c5ac392fc.r2.dev/presets/hainbach-tapes-SD.zip"
}
```

| Field | |
|---|---|
| `id` | Unique, and **public** — it appears in shareable links. |
| `requiredPacks` | Pack ids the descriptor's `samplePath`s belong to. Shown as badges. |
| `descriptorPath` | `/presets/<file>.json` in this repo. |
| `coverImage` | `/presets/…` (this repo) for a preset's own art, `/<pack-id>/cover.jpg` (R2) when it reuses the pack's, or omit for a gradient. |
| `sdExportUrl` | Optional. Absent hides the **Download SD ZIP** button. |

---

## 6. Adding a preset by hand

Without a submission — your own project, straight out of Studio.

1. **Export ▸ Project Preset ▸ Settings-Only Preset (JSON)**, which carries slots, config and notes.
2. Rename it to `<preset-id>.json` and put it in `public/presets/`.
3. Write the `presets[]` entry yourself (§5) and add it to `public/manifest.json`.
4. Verify and commit as in §1 step 5.

Studio's **Export ▸ Prepare a submission** does the same work through the tool instead, and hands back
a complete entry with `requiredPacks` already derived — usually less effort than doing it by hand.
