# WAV.builder tutorial — recording outline

Target: **20–30 min**, built from separate chapter recordings. Each chapter stands on its own
(own setup, own take, own title card), so chapters can be re-recorded or reordered without
touching the rest. Budgets add up to ~28 min; the ones marked *(trim)* are where to cut for ~22.

The thread through the whole video: **the app started as a one-file converter, grew into
Studio, and was split into doors so you can do one job without setting up the whole thing.**
Every door chapter ends on one line: *"…and this same thing lives inside Studio as …"*

Setups: **DEV** = overhead on Spotykach · **SCR** = screen capture · **FACE** = talking head (optional).
Reuse = existing footage that already covers it reasonably (`CT` = chaoticTour nest,
`PM` = premangler nest, sequence timecodes).

---

## Before every recording
- One headline sentence per chapter, said cleanly at the start. It becomes the chapter title,
  the montage material, and keeps you on topic.
- Demo state ready *before* record: folders prepared, card in, Spotykach on, fresh project or a
  known one. (Most of the dead time in the old takes is "I should have prepared this".)
- OBS: **display capture, not window capture**: file pickers and permission dialogs didn't
  show up in the old takes.
- Don't explain how the app *used to* work (backups, old sync, history). Only what's there now.
  The one exception is ch. 1: one sentence on the old setup wizard, because it's why the doors exist.

---

## 0 · Cold open — 0:30 · DEV
A short jam on Spotykach, then record a snippet and save it to a slot (Red 3).
This snippet comes back in ch. 9.
Reuse: CT before 05:36 (jam) + CT 05:36–05:59.

## 1 · What it is and why — 1:30 · FACE/SCR
- Spotykach reads samples from SD: **6 tapes × 6 slots**, max **42 s**, strict format
  (48 kHz stereo WAV), strict folders `SK/B/1.WAV`…
- Started as a converter for exactly that: saving a file called `1.WAV`, all caps, on Windows
  was surprisingly fiddly. (Spotykach reads lowercase `.wav` now too.)
- Grew into Studio. Up to v3, a setup wizard asked for a work folder, an SD card and a project
  name before you could even hear a sample → v4 split it into a hub with doors.
- Free, in the browser (Chrome/Edge), nothing uploaded. Open source, contributions welcome.
Reuse: CT 05:59–06:32, CT 07:09–07:37.

## 2 · How the device handles files — 1:30 · DEV
- Tap+Play to enter the card view, choose tape (colour) and slot, Play loads into the buffer.
- Alt+Play saves the buffer. Bright = filled, dim = free.
- Words used from here on: **sample · pack · preset · project**.
Reuse: PM 01:08–03:52 (cleanest take), PM 03:52–04:23 (folder structure).

## 3 · The hub — 1:00 · SCR
Six doors in three groups, plus Submit. Each door is a link you can share; four need no setup.
Show the overlap map on screen:

| Door | Needs | Also inside Studio as |
|---|---|---|
| Browse Samples | nothing | the sample browser |
| Preset to SD Card | the card | Project Manager ▸ presets |
| Edit One File | nothing | the waveform editor |
| Device Config | card, or nothing | config.txt per project |
| Studio | a work folder | — |
| Sample Mangler | nothing | editor tool + "mangle" from a slot |
| Submit a pack | nothing | Export ▸ prepare submission |

## 4 · Browse Samples — 2:30 · SCR
- The packs (Hainbach, Synthux horror, your Explorations), audition, add to pool.
- Every pack has its own link: copy one, show it opening straight on that pack.
- Pool → download as a card-ready 6×6 or as loose files. Works on a phone.
- The pool lives in the browser, so treat it as temporary. Keep it by handing the whole pool
  to a new Studio project in one click.
- Open archives: Openverse, Wikimedia, Internet Archive, NASA, Freesound; license filter;
  every sound keeps its credit. *(Skip the API-key story.)*
Reuse: PM 26:03–27:02, PM 35:06–36:44, CT 15:38–16:13.

## 5 · Preset to SD Card — 1:30 · SCR + DEV
- A ready-made 36-slot set, written to the card in one step (or over USB, or as a ZIP).
- Demo with the Hainbach tapes: the 36 samples Hainbach gave us, in my own sorting across the 6×6.
- Shows what it replaces on the card and can save that first.
- Preset vs. project: a preset is someone else's project you can load into Studio, to swap
  files or leave a few slots free.
Reuse: CT 19:27–21:11, PM 28:10–28:44.

## 6 · Edit One File — 2:00 *(trim)* · SCR
- The original job of the app: one file in, Spotykach-ready file out.
- One real job instead of a tour: a sample with a nasty bit in it, tamed with volume
  automation or by pitch-shifting just that section. Trim to the 42 s line, normalize, done.
  This is what you'd otherwise export to a DAW or Audacity for, and then import again.
- Name the rest in passing: loop, EQ, cutter, stereo split, **slicer → cue points → slice mode
  on the device**. Say the cues only steer slicing with *Cue points* on **Snap** (ch. 7).
- Destructive, but the original is kept.
- Out: download, or send it to the Browse pool.
Reuse: PM 32:35–34:13, CT 12:15–12:50.

## 7 · Device Config — 1:00 · SCR
- `config.txt`: MIDI channels, preload on boot, MIDI transport, slice polyphony, grit mix at
  power-on (firmware 1.4.0+).
- **Cue points**, per deck: Ignore (the default; slices as if the sample had none), Snap, Free.
  Set it to **Snap** here, on screen: ch. 6's slicer and ch. 10's Mangler both depend on it.
- Write to card or download; Spotykach picks it up at the next reboot. Studio stores one per project.
Reuse: PM 29:17–31:03 (good as is).

## 8 · Studio — 5:00 *(trim)* · SCR
- Work folder, Project Manager (several projects instead of several cards).
- All-tapes view vs. tape view, the pool, notes per project and per tape.
- Filling slots: drag in, file picker, sample browser, online sources, other projects.
- **Import / Build**: the preview shows what happens to every slot before anything is written.
Reuse: CT 07:37–09:56, CT 11:05–12:15, CT 14:26–14:52, CT 17:20–17:51.

## 9 · Round trip + USB — 2:30 · DEV + SCR
- Pull the cold-open snippet from the device into the project. Card reader *or* USB.
- USB: firmware 1.4.0, on by default, plug straight into a USB-A port.
  ~35 s per slot, so good for one file and slow for a full card (~10 min).
  `config.txt` goes over USB too.
Reuse: CT 24:00–25:30, CT 10:36–11:05.

## 10 · Sample Mangler — 4:00 *(trim)* · SCR + DEV
- Open on the origin: showing Spotykach to a friend, who asked if I had a sample made of lots
  of short snippets. That's what it makes: random snippets from a pool → one 42 s file with a
  cue per snippet. Slice mode jumps between them with *Cue points* on Snap (ch. 7).
- Feed it (packs, own files, archives, the card) → ranges → dice/seed → keep the good ones.
- Licenses follow the snippets.
- DEV shot: record your own voice on a phone and mangle it there (phone layout, quality toggle).
- Drum/FM synth takes, slices, the sequencer, LFOs and automation; MIDI clock, notes and CC
  to Spotykach or other gear.
- Out: download (also for the M8, which reads the same slice points), pool, Studio library,
  a new Studio project, or straight to a slot over USB. Also inside Studio's editor under *Tools*.
- Option: use the Claude design promo (1:41) as the intro of this chapter and keep the
  live part to the device payoff.
Reuse: CT 22:48–24:00, CT 26:03–26:53, CT 27:29–28:53, CT 28:53–30:43, CT 32:34–34:06.

## 11 · Submit a pack — 2:30 · SCR
- Why: almost every pack in the app came from someone sending it in.
- Pack vs. preset. At least 10 files; 36 fills a preset.
- Drop a folder: subfolders become categories, file names become titles. 42 s warnings,
  fix in the editor.
- Details, links, licence, preset slots → download the zip → send via WeTransfer/Drive.
- Also reachable from the Browse pool and Studio's Export.
Reuse: PM 51:28–54:31, PM 57:06–58:55, PM 01:00:28–01:04:38. *(PM 41:00–51:21 is the
"eight minutes of pure nonsense", skip.)*

## 12 · Outro — 0:45 · FACE/DEV
- Free, Chrome/Edge, link. Details in About & Help, new features in the news on the hub.
- Synthux Discord (@jonwtr), "tell me what sucks". Open source: the licence lets you reuse any
  part, or rip it apart as a case study.
- Thanks: Synthux and Roey, Vlad for the firmware (and for accepting the PRs), the testers and
  everyone who sent in samples.
- "Keep on looping, we'll meet at the playground carousel." Back into the jam.
Reuse: CT 34:08 (first lines), CT 36:17–36:40 ("Thanks for watching. Or scrubbing.").

---

## Inserts to make in Claude design (same style as the Mangler promo)
- Title card per chapter (red poster card, chapter number + door name).
- The overlap table from ch. 3 as an animated diagram.
- `SK/` folder structure diagram (ch. 1–2).
- Lower-thirds for door URLs (`…/#/browse`, `#/presets`, `#/mangle`, …).
