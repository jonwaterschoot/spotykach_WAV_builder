# Submitting a sample pack or a preset

**The app has a tool for this.** Open the WAV Builder and take the **Submit a Pack** door — or go
straight to <https://jonwaterschoot.github.io/spotykach_WAV_builder/#/submit>.

It asks for everything a submission needs, one thing at a time, and hands you a small ZIP to send.
Nothing is uploaded: the tool runs entirely in your browser, and the audio travels separately by a
link you choose.

> This page used to be a 175-line manual. Everything it explained, the tool now asks for at the moment
> it matters, so keeping a second copy here only created two things to keep true. What is left is what
> is worth knowing *before* you start.

---

## The two kinds of contribution

| | 📦 **Sample pack** | 🎛️ **Project preset** |
| :--- | :--- | :--- |
| What it is | A library of your audio, in the app's Sample Browser | A saved layout: which sample sits in which slot |
| How many files | **No limit.** 50, 100, 300 — users pick what they want | **36 at most** — 6 tapes × 6 slots, matching the hardware |
| Who it's for | Artists with sounds to share. You don't need the device | People who own a Spotykach and built something worth passing on |
| Needs | Your audio, some words about it, and a licence | Packs already in the app, or a pack you're submitting alongside |

A preset can be built on the pack you are submitting, on packs already in the app, or on both. The
tool works out which packs it depends on for you.

## The two numbers the hardware imposes

- **42 seconds per sample.** The device plays the first 42 seconds and ignores the rest. Longer files
  are still welcome — the editor shows all of a file, so users can pick a different part of it.
- **36 slots.** Six colour decks (Blue, Green, Pink, Red, Turquoise, Yellow), six slots each. This is a
  ceiling on *presets* only, never on a pack.

## What to have ready

Not required to start — the tool saves your draft as you go, so you can leave and come back.

- **Your audio**, as WAV or FLAC at the best quality you have. 24-bit WAV is ideal. Normalization and
  conversion are done for you.
- **Subfolders**, if you want categories. Folder names become the category chips in the browser. No
  folders means everything lands under *General*.
- **A short description** for the catalogue card, and a longer one for the pack's page.
- **A licence.** The tool offers CC0, CC-BY, CC-BY-SA, CC-BY-NC, the usual sample-pack terms, or your
  own wording.
- **A cover image**, landscape, 1200×800 or larger — it runs as a wide banner across the pack's page.
- **Your links.** Just usernames; the tool builds the addresses.

## What the tool hands you

**One archive.** The details, the file list, the licence, the preset if you made one, and your audio
under `audio/` with your categories as folders. Put it on WeTransfer, Drive or Dropbox and send the
link. Nothing is uploaded from the app, so the link has to come from you — a preset-only submission
carries no audio and is small enough to attach to a message directly.

Optionally, a second: an `SK/` folder for your own card, so you can hear the pack on the hardware
before you send it. That one is yours and is not part of the submission.

**Keep the archive.** Drop it back into the tool on any machine and the whole form comes back — files,
details, licence, preset and all. That is how you pick a submission up again after clearing your
browser, or change one title later.

## Sharing with one person instead

If you just want to send a project to a friend, you don't need any of this. Open it in Studio, use
**Export** — the settings-only `.json` if you both have the same packs, the full backup `.zip` if it
uses sounds you recorded — and they open it with **Import**. No submission, no review, no licence to
choose.

## What happens after you send it

Send both to **`jonwtr` on Discord** — the easiest route, and the best place to ask a question before
you start — or by email to the address the tool shows you.

The maintainer then normalizes the audio, deploys it, and adds the entry to the app's catalogue.
Expect a reply rather than silence.

---

## Video walk-through

* [Spotykach WAV Builder video demo](https://www.youtube.com/watch?v=X2KiL52vBNM)

## For maintainers

Deploying a submission, writing manifest entries, and running the audio scripts:

* [Preset upload & integration guide](../../public/presets/README.md)
* [Audio normalization & compression scripts](../../scripts/normalize-audio.md)
* [How the tool was built and why](submission-tool-plan.md)
