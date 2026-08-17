# Submission workflow — where it stands and where it should go

*Written 2026-08-16, against the code as it is on `v4-pervak`. §1–2 are findings; §3 onward is the
plan, revised the same day against the answer to open question 6.*

This is the answer to **open question 6** in [V4_PERVAK.md](../../V4_PERVAK.md) — *preset & pack
authoring: who makes them, and where.*

> **The answer, given 2026-08-16:** neither pull requests nor a backend. **The app guides the
> creation** of both presets and sample packs, collects everything a submission needs, and hands back
> files to download. The submitter sends those over email or Discord — audio through WeTransfer or
> Drive, since it is too big to attach — and **the maintainer implements them in the app.** Deliberately
> sized to the reality that neither presets nor packs are expected to arrive in volume.

The consequence: **the app is the form.** No issue templates, no CI gate, no upload. What has to be
true is that a submission arrives *complete* — because the cost of an incomplete one is a
back-and-forth over Discord, and that is now the only channel there is.

---

## 1. What exists today

**Two guides, both good, neither wrong about anything except the app's own behaviour:**

| Document | Audience |
|---|---|
| [docs/presets-samples/README.md](README.md) | Guest artists (sample packs) and users (presets). Concepts, hardware limits, metadata needed, a submission template. |
| [public/presets/README.md](../../public/presets/README.md) | Maintainers. Descriptor schema, manifest entries, R2 deployment, the normalization scripts. |

Both are linked from inside the app, in `AboutHelpModal`'s contribute tab, alongside
[scripts/normalize-audio.md](../../scripts/normalize-audio.md).

**The pipeline behind them is entirely manual and entirely maintainer-run:**

```
artist/user  →  (no named channel)  →  maintainer
                                       ├─ normalize.py            audio → -1 dB FLAC, sanitized names
                                       ├─ write README frontmatter id, name, description, license, links
                                       ├─ generate-manifest.mjs   → a packs[] snippet to paste
                                       ├─ upload to R2            samples/<pack-id>/*, samples/<pack-id>.zip
                                       ├─ hand-write presets[]    id, name, description, requiredPacks,
                                       │                          descriptorPath, coverImage, sdExportUrl
                                       └─ commit + push           GitHub Pages rebuilds
```

One preset ships (`hainbach-tapes-preset`) against three packs (`hainbach-tapes`, `synthux-horror`,
`jonwtr-explorations`). The intention is many more, from people who are not the maintainer.

---

## 2. What is actually in the way

Found by reading the export path against the two guides. Each is small; together they are the reason a
submission cannot arrive ready to merge.

1. **There is no channel.** The guide says beautifully what to prepare and never once says *where to
   send it*. No `.github/ISSUE_TEMPLATE`, no address, no form. Everything below is downstream of this
   one.
2. **"Settings-Only Preset (JSON)" downloads a ZIP.**
   [`exportSaveState`](../../src/utils/exportUtils.ts#L637) names it `Spotykach_Project_<date>.zip`,
   holding `project-descriptor.json`. Both guides tell the submitter to "locate the downloaded
   `project-descriptor.json`" — which is inside an archive they were never told to open.
3. **Every exported descriptor is called "Untitled Project".**
   [`buildDescriptorFromState`](../../src/utils/projectDescriptorUtils.ts#L252) takes `name` and
   `description`, and [App](../../src/App.tsx#L4891) passes neither, so `name` falls to its
   `'Untitled Project'` default and `description` is absent. The maintainer hand-edits both, on every
   submission.
4. **`requiredPacks` is derivable and never derived.** The manifest entry needs it; the descriptor
   already knows it, in every file's `samplePackId`. Today it is reconstructed by hand from a JSON file
   the submitter didn't open.
5. **No cover image travels with a preset**, though `PresetManifestEntry.coverImage` exists and the
   door renders it — so a submitted preset is a grey card until the maintainer supplies art.
6. **Nothing checks a descriptor before it is submitted.** A `samplePath` that doesn't match anything
   in `manifest.json` hydrates to an empty slot; the Preset door reports it politely at the end
   (*"3 samples could not be downloaded"*) and writes a card with holes in it. Cheapest place to catch
   that is the moment of export, while the author is still there to fix it.
7. **`generate-manifest.mjs` generates the `packs[]` entry only.** The `presets[]` entry — the one a
   user submission actually needs — is the one still written by hand.

---

## 3. The distinction the plan turns on

**Presets and sample packs have completely different physics, and lumping them together is what makes
the workflow feel hard.**

| | 🎛️ Preset | 📦 Sample pack |
|---|---|---|
| What it is | ~20 KB of JSON | hundreds of MB of audio |
| Where it lives | `public/presets/*.json`, in the repo | Cloudflare R2 |
| Processing needed | none | normalize, FLAC-encode, rename, cover art, ZIP |
| Can the app produce the whole submission? | **Yes** — descriptor plus manifest entry, complete | **No** — it can produce the metadata; the audio travels separately |
| Review needed | does it resolve, is it any good | plus licensing, quality, legal |

Both end at the same place — **a maintainer commit** — so both get the same treatment: the app collects
what a submission needs and hands back a small set of files. The difference is only what those files
are, and whether audio has to travel beside them.

- **A preset submission is complete in the browser.** Descriptor plus a ready-to-paste `presets[]`
  entry, ~20 KB, attachable to a Discord message.
- **A pack submission is metadata plus a link.** The app can collect artist, description, links,
  license, categories and the file list, and emit the README frontmatter
  [`generate-manifest.mjs`](../../scripts/generate-manifest.mjs) already expects — but the audio goes
  by WeTransfer or Drive, and normalization stays a maintainer step.

Everything below follows from that.

---

## 4. The plan, in steps that each stand alone

### Step 0 — say it in the app, where presets are *(small, do it now)*

The Preset → SD door shows one card in a mostly empty screen and says *"1 preset available"*. It never
says where presets come from or that yours could be here. Add a panel under the cards, in the empty
space:

- where these come from — built by the community from the shared packs;
- **make your own** — build a project in Studio, export it as a preset; two lines, not the manual;
- a link to [the submission guide](README.md), the same URL `AboutHelpModal` already uses.

A signpost, not a form: the Preset door is a no-project tier and authoring needs Studio. It costs one
component and starts collecting the interest that justifies the rest. **Built 2026-08-16.**

### Step 1 — make the preset export submittable *(the highest-value fix)*

§2 items 2–5, all one small change to the same path — and under this answer they are the whole
preset workflow, since what the app hands back *is* the submission:

- Ask for **name and description** in the export modal's preset tab, defaulting to the project name,
  and pass them through to `buildDescriptorFromState` — which has taken both parameters all along.
- **Emit a `.json` file**, not a dated ZIP, when the settings-only export has no packed audio (the
  common case), named after the preset: `hainbach-tapes.json`, the name it needs to be given anyway.
  Keep the ZIP for the case that genuinely carries blobs.
- **Derive `requiredPacks`** from the descriptor's `samplePackId` values and emit the
  **ready-to-paste `presets[]` entry** beside it, complete but for `coverImage` and `sdExportUrl`.
- **Check it before it downloads** — every `samplePath` resolves against the loaded manifest, slots are
  1–6 across the six colours, no entry carries both `samplePath` and `blobRef`. Warn in the modal while
  the author is still there, rather than discovering it when the card comes out with holes in it.

After this a preset submission is: two small files, attached to a message. The maintainer renames one,
pastes the other.

### Step 2 — the same thing for a sample pack

A guided form — a modal, most likely reached from the same places as the guide — that collects exactly
what [§ Pack Metadata Required](README.md#-pack-metadata-required) lists: artist, short description,
full bio, links, license, cover image, categories. It hands back the **README frontmatter block**
`generate-manifest.mjs` already expects, and a short `SUBMISSION.md` naming what still has to travel
separately.

The audio does not pass through the app — the artist sends a WeTransfer or Drive link. But the metadata
that always arrives half-complete over Discord arrives whole, in the shape the maintainer's own script
consumes. Optionally, and only if it proves worth it: let the artist drop their folder in so the app can
list the files, read durations, and flag anything over 42 s — read-only, no permission prompt beyond the
picker, and the same `LocalFolderBrowser` machinery Browse already has.

### Step 3 — say where to send it, once

Neither guide names a destination. Whatever it is — an address, a Discord channel, a link — it belongs
in the guide, in the app's contribute tab, in the Presets door panel from step 0, and at the end of both
step 1 and step 2's flows. One string, four places; the app should read it from one constant.

### Step 4 — one command for the maintainer side

Extend [`generate-manifest.mjs`](../../scripts/generate-manifest.mjs) to emit the `presets[]` entry too,
so both halves of a `manifest.json` update come out of the same script. Small, and it closes §2 item 7.

### Not planned

- **An authoring surface for people who have never used the app** — the third shape floated in open
  question 6. Steps 1 and 2 cover the artist who has a folder of audio and the user who has a project;
  a from-scratch builder answers a question nobody has asked yet.
- **CI validation and issue forms** — considered and dropped with the answer. Volume doesn't justify
  them, and step 1's in-app check catches the same class of error earlier.

---

## 5. What this does not solve

- **Publishing is still a commit.** Every submission ends at the maintainer, by design. If that becomes
  the bottleneck, that is the signal to revisit — not a reason to build for it now.
- **Presets referencing custom, non-pack samples** are a hybrid: a preset submission that is really a
  pack submission wearing a hat. Step 1's check should spot the `blobRef` entries and say so plainly —
  *"this preset carries its own audio, so it needs a pack submission too."*
- **No moderation model.** Who says yes, on what grounds, and what happens to a preset whose pack is
  later pulled. Worth a paragraph in the guide before the second submission arrives, not the tenth.
