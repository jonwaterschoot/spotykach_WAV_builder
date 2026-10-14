# Sample Mangler v2 — plan

Oct 14, 2026 · Jon · follows `sample-mangler-plan.md` (Phases 0–7, done)

## Summary

The mangler grows from "random snippets into one file" into a small sampling workstation: chop sources into clean hits, keep slices in a pool, shape them with AD envelopes, lay them out on a tempo grid or in a 4-pattern step sequencer, and add synthesized drums and FM sounds. It also has to work on a phone.

- **One settings panel, two hosts (done).** The editor's Mangle tool had its own, shorter list of sliders. Both now use `src/mangler/ui/SettingsPanel.tsx`, so every setting exists in both and new ones land in both.
- **No npm package yet.** The engine is already one module (`src/mangler/`) that both hosts import. The copy was in the UI, and that is fixed. A package pays off only when a second app uses the engine (see Packaging).
- **Layout before features.** Six new features won't fit a column of sliders. First a workspace with stations (Sources, Mangle, Slices, Sequencer, Synth) and a results tray, which on a phone shows one station at a time.
- **Slices are the backbone.** Chopping, the tempo grid, the sequencer and the synth all produce or use slices. The slice pool comes before the sequencer and the synth.
- **A phone mode through less memory, not lower quality.** Mono sources, 16-bit storage, fewer variations, and results kept as recipes instead of 16 MB WAVs. Output stays 48 kHz.

## 1. Settings parity (done Oct 14)

| Setting | Full Mangler | Editor tool, before | Editor tool, now |
| --- | --- | --- | --- |
| Fill by length / count | yes | length only | yes |
| Output length, snippet length, crossfade | yes | yes | yes |
| Bias | yes | no | yes |
| Hard cuts, start on, one hit, reverse | yes | yes | yes |
| Loudness target, spread, max boost | yes | no | yes |
| Skip silence + threshold, limiter | yes | no | yes |
| Repitch, scale, confidence, detune, resampling | yes | Suggest only, fixed | yes |
| Cue points | yes | always on | yes |
| Loop | yes | yes | yes |
| Source mix, max per source | yes | — | hidden (one source) |
| Variations | generate bar | — | hidden (one take) |

How it works now:

- `SettingsPanel` takes `settings`, `onChange(patch)`, and `hide` (fields a host leaves out). Groups (Shape, Loudness, Pitch, File) fold, and a folded group shows a one-line summary (`42 s · 150 ms–2 s · rev 25%`). The fold state is remembered per host (`mangler_groups`, `editor_mangle_groups`).
- The editor flows the groups into as many 17 rem columns as fit (CSS columns, so a short group leaves no gap under it), with Loudness and Pitch folded at first. Rows wrap instead of overflowing: in a narrow column a number field goes under its label, and a segmented control under its name (fixed Oct 14, after the number fields ran out of their columns at some widths). Hints go to the editor's help line (`onHint`); the full Mangler uses tooltips.
- The editor keeps its length per file: it starts at the file's own length and isn't stored with the other settings. Its stored settings (`editor_mangle_settings`) are now the full set; old stored subsets read fine, since `sanitizeSettings` fills in the rest.
- The ranges in both hosts now have drag-to-change number fields (the editor had them, the full Mangler didn't).

## 2. Packaging

**Question:** should the mangler be a linked package instead of a copy?

**Answer:** there is no copy of the engine. `src/mangler/` (rng, plan, dsp, render, worker, settings, recipe) is imported by both hosts. Its only dependency outside the folder is `src/lib/audio/pitch.ts`. The glue (`batch.ts` for WAV encoding, `save.ts`, `license.ts`) depends on the app, as it should. The duplication was the two settings UIs, now one.

An npm package (an npm workspace, `packages/mangler-core`) would add a build step, versioning and a second `package.json`, for one consumer. It becomes worth it when:

- a second app uses the engine (a standalone phone PWA, a plugin, a CLI that batch-mangles folders), or
- the engine goes to the Spotykach repo or the transfer package (not planned: see the "PRs minimal" rule).

**To keep that door open at no cost now:**

- [ ] Move `pitch.ts` (or the YIN part) into `src/mangler/`, so the engine folder has no imports from outside it. The editor's pitch overlay imports it from there.
- [ ] Keep React, IndexedDB and `AudioBuffer` out of the engine files. A check script (like `check:mangler`) fails on an import from outside the folder.
- [ ] New engines (chop, AD, grid, sequencer render, synth) follow the same rule: pure functions on `Float32Array`, run in the worker.

## 3. Layout

The full Mangler is three columns (sources, settings, results), desktop only. The editor tool is a row under the waveform. With chopping, a slice pool, a grid, a sequencer and a synth, both need to change.

### Stations

**Station menu at the top.** Like the editor's tool menu (`EditorToolPicker`): a bar at the top names the open station and opens a grouped menu of all of them. The main stations (Mangle, Slices, Sequence) stay visible as buttons when there is room; the rest live in the menu. On a narrow screen the bar shows only the open station and the menu. A dot marks a station with unsaved work, as in the editor.

The full Mangler becomes a workspace with five stations and a results tray (drawn here as a side rail; in practice the top bar described above):

```
┌──────────┬───────────────────────────────────────────────┐
│ Sources  │  station controls      │  station canvas       │
│ Mangle   │  (folding groups with  │  (waveforms, results, │
│ Slices   │   summaries, basic     │   slice grid, step    │
│ Sequence │   first, "More" for    │   grid, synth scope)  │
│ Synth    │   the rest)            │                       │
├──────────┴───────────────────────────────────────────────┤
│ Results tray: kept results · play · save · to slices     │
└──────────────────────────────────────────────────────────┘
```

| Station | Controls | Canvas |
| --- | --- | --- |
| Sources | Picker, local files, include switches | Source waveform with parts and detected hits |
| Mangle | `SettingsPanel` + generate | Results, as now |
| Slices | Filter, tags, AD defaults | The slice pool as a grid of tiles (tap to play) |
| Sequence | Tempo, swing, pattern chain | 16-step grid, one row per track, A/B/C/D |
| Synth | Generator type, parameter ranges, dice | Waveform of the last few renders, "to slices" |

- **Folding groups everywhere.** The `SettingsPanel` pattern (header, summary when folded, remembered state) is the one control layout for every station. Each group shows its main controls; the rest sit behind "More".
- **The results tray** is shared by all stations: a mangled file, a sequenced loop and a synth hit all end up there and save the same way.
- **The editor tool** keeps its row layout but gets the stations that make sense on one file (Mangle, Chop, later AD and Synth for an empty slot) as a second-level menu inside the Mangler tool, built the same way as the station bar.

### Phone

- One station at a time, with the stations as a bottom bar and the results tray as a sheet that slides up.
- Controls full width, groups folded by default. Slider thumbs 24 px, rows at least 40 px high.
- **Compact controls (done Oct 14, desktop too).** Not slider *or* number, but both with less room: a single slider puts label, track and value on one row when the row is at least 20 rem wide (a container query), and gives the track its own row when narrower, so it never gets too short to use. A range keeps its two number fields above the track, since the track shows where the range sits. Groups are spaced tighter. `SettingsPanel` sets this through `density` (`compact` by default; `normal` is the old layout).
- The snippet table becomes a list of cards (number, source, length, play, menu). Drag to reorder with a handle, through `mobile-drag-drop`, which the app already uses.
- Waveforms: pinch to zoom, tap to play, long press for the menu.
- The hub door loses `desktopOnly` once this works.

## 4. Phone mode (memory)

Today's budget, from the first plan: 384 KB per second of decoded stereo float, 10 minutes of sources is about 230 MB, and 12 results are another 190 MB. A phone tab gets far less.

| Measure | Saves | Cost |
| --- | --- | --- |
| Decode sources to mono on a phone | ½ of source memory | Stereo sources lose width (the output is still stereo) |
| Keep decoded sources as Int16, convert to float per snippet in the worker | ½ again | A conversion per snippet, small |
| Pool cap: 2 min on a phone, 10 on desktop | Bounds the worst case | A warning when exceeded |
| Variations: 1–4 on a phone (default 2), rendered one at a time | Peak worker memory | Fewer takes per click |
| Results kept as recipe + peaks; render the audio when played or saved | 16 MB per result | A short wait on play (the render is fast and deterministic) |
| Synth: render one hit at a time, short lengths (max 4 s per hit), no oversampling on a phone | CPU and peak memory | Slightly more aliasing on bright FM sounds |
| Store result audio as 16-bit PCM when it has to be kept (edited results) | ½ | Slightly lower resolution, inaudible here |

- **Not a lower sample rate.** Rendering at 24 kHz would move zero crossings, onsets and cue points, so a recipe made on the phone would not render the same on desktop. Output stays 48 kHz.
- **Not a lossy format for working audio.** Opus or AAC through `AudioEncoder` saves the most space but needs a decode for every play and doesn't exist in every phone browser. Worth it only for storing sources, later.
- **Detection:** phone mode when `navigator.deviceMemory` is 4 or less, or on a coarse pointer with a narrow screen; a switch in the header overrides it. The same mode is useful on a weak laptop.
- Recipes as the stored form help desktop too: the results pool shrinks from gigabytes to kilobytes.

## 5. New features

### 5.1 Chop and transient detection v2

Today: `detectOnsets` in `dsp.ts` (energy-based), used for "snippet start: transient", "one hit per snippet" and re-cueing.

- **Detector:** spectral flux on a short FFT (1024 / hop 256) with an adaptive threshold (moving median + k). Three bands (low, mid, high), so a kick under a hi-hat isn't missed. Each onset is moved back to the energy minimum or zero crossing just before it, so the attack stays whole.
- **Hit end:** where the envelope falls a set amount (−30 dB by default) below the hit's peak, or the next onset, whichever is first. Hold time so short tails aren't cut.
- **Strip silence:** everything between a hit's end and the next onset is dropped. Leading silence of the source too.
- **Chop:** a source becomes a list of hits, shown on the source waveform (the parts modal gets a "Hits" layer). Each hit can be kept, merged with the next, or dropped, then sent to the slice pool. Settings: sensitivity, min gap, end threshold, max hit length.
- **Hit class:** low / mid / high from the spectral centroid, and "pitched" when YIN is confident. Used to sort slices and to fill a drum kit in the sequencer.
- The mangler keeps using the same detector, so "one hit per snippet" gets better too.

### 5.2 AD envelopes

- Per snippet: attack (0–500 ms) and decay (10 ms – ∞, ∞ meaning no decay), and a curve (linear, exponential). Applied after the gain, before the join.
- In the settings: AD ranges like the other ranges, so the dice pick per snippet. Off by default, so old recipes render the same.
- In the snippet list and on a slice: an editable AD per item, drawn over its waveform.
- `SnippetInfo` gets `attackMs` and `decayMs`; missing fields mean "none", so stored recipes stay valid.

### 5.3 Slice pool

- A new IndexedDB store, `mangle-slices`. A slice from a source is a reference (source id, region, reverse, shift, gain, AD), not audio, so it costs bytes. A synth slice stores its generator settings and seed, and so is also tiny.
- Slices come from: chopping a source, a result's snippet ("to slices", one or all), and the synth.
- The Slices station: a grid of tiles with a mini waveform, tap to play, tags, class (low/mid/high), filter and search, select many.
- **Out of the pool:** a "kit file", the selected slices one after another with a cue at each, which is exactly what Spotykach's slice mode plays. Or into the sequencer.
- Licences follow the slice: a slice from an ND source carries that level, as results do now.

### 5.4 Tempo grid

- Settings: tempo (40–240 BPM), grid (1/4, 1/8, 1/16, triplets), and length in bars, as long as it fits 42 s.
- Snippet length becomes a range of grid steps instead of milliseconds. A snippet's cue sits exactly on a grid line; its crossfade lies before the line, not across it.
- The file length is exact to the frame: `round(bars × beats × 60 / bpm × 48000)`. With "Loop the file", the tail folds into the head, so the length doesn't change and the loop is seamless.
- Two ways to fit a snippet to its steps: **Cut** (the default: take exactly that many frames from the source) and **Tape** (resample it to fit, which changes the pitch). A time-stretch that keeps pitch is out of scope, as in the first plan.
- Snap the cut to a transient (5.1), so a grid cut starts on a hit.
- **For the user only.** Spotykach reads no tempo, neither from `config.txt` nor from the WAV (confirmed Oct 14). The grid makes files that loop cleanly at a known tempo when played as a plain loop; nothing about the tempo is written into the file. The tempo and bar count go into the recipe and the file name (`mangle_120bpm_4bars_…`).

### 5.5 Step sequencer (A/B/C/D)

- 4 patterns (A–D) of 16 steps, and a chain (e.g. `A A B A`, up to 16 entries).
- Tracks: 4 to start, 8 at most. Each track plays slices from the pool: one slice for the track, or a different one per step (slice lock). Per step: on/off, velocity, and later probability and ratchet.
- Per track: volume, pitch (semitones), AD (5.2), reverse, mute and solo.
- Tempo and swing are shared with the tempo grid (5.4).
- **Playback:** Web Audio with a look-ahead scheduler, so it can be heard while editing. Sources are decoded into the slice cache once.
- **Render:** the same pattern rendered offline in the worker, to the exact length of the chain. Out as a result, with cues at each step that has a hit, each bar, or each pattern (a choice). The result goes to the tray and is saved like any other.
- Stored per sequence in IndexedDB; a sequence references slices, so deleting a slice in use asks first.
- **Browser only (decided Oct 14).** The sequencer is a tool inside the session, not something Spotykach plays. Its only way to the hardware is a rendered result. If it proves useful, a sequence could later be exported and imported as JSON or text.

### 5.6 Synth

Seeded generators, like the mangler: each parameter is a range and the dice pick inside it, so "Generate 8" gives eight different kicks, and any one can be made again from its seed.

| Generator | Built from | Main ranges |
| --- | --- | --- |
| Kick | Sine with a pitch envelope, click, drive | Start / end pitch, pitch decay, amp decay, click, drive |
| Snare | Tone + filtered noise | Tone pitch, noise colour, snap, decay |
| Hat / cymbal | Six detuned squares or noise, band-passed | Metal, brightness, decay (closed / open) |
| Clap | Noise bursts with spacing, reverb tail | Bursts, spread, tail |
| Tom / perc | Modal resonator (a few tuned modes) | Pitch, material, decay |
| FM | 2 or 4 operators, ratios, indices, envelopes | Ratios (harmonic / free), index, feedback, envelope shapes |
| Noise texture | Filtered noise with a moving filter | Colour, sweep, length |

- Rendered in the worker at 48 kHz, as pure array math (like the rest of the engine).
- Each render goes to the slice pool or the source pool (so it can be mangled), or straight to the tray.
- A synth slice stores generator + settings + seed, not audio.
- **Phone cost.** Kicks, snares and hats are cheap (a few oscillators and a filter per sample). FM with 4 operators and feedback, and the modal resonator, cost more; on a phone they render one at a time with a progress bar and no oversampling. Start with the cheap generators and measure before adding the heavy ones.

## Order

Each phase is usable on its own.

**Phase 1 — Parity (done)**

- [x] `SettingsPanel` shared by both hosts, folding groups with summaries
- [x] Editor tool: every setting except source mix, max per source and variations
- [x] Rows wrap instead of overflowing; editor groups flow in columns
- [x] Compact density: one row per slider where it fits, ranges keep fields + track

**Phase 2 — Workspace and phone mode**

- [x] Engine folder self-contained: `pitch.ts` moved to `src/mangler/`; `check:mangler` fails on an engine import from outside the folder (glue: `batch.ts`, `save.ts`, `license.ts`)
- [ ] Station bar with the results tray. Moved to Phase 4: a menu with one station in it is noise. It lands with the Slices station, the second one
- [x] ~~Results as recipe + peaks~~ Changed (Oct 14): results and pack downloads are stored, then their blob is swapped for the copy read back from IndexedDB, which the browser keeps on disk. Same memory saving, without re-decoding every source to play a result, and it keeps working when a source has left the pool
- [x] Phone mode (`ui/phoneMode.ts`): mono decoding, a 1 min decode cache, pool warning at 2 min, at most 4 variations. On by itself at ≤ 4 GB or a narrow touch screen; the header's phone button overrides it
- [ ] Int16 sources: later, if phones still run out. It needs the engine to read Int16, which touches every cut
- [x] Phone layout: below `lg`, one column at a time (Sources, Settings, Results) from a bottom bar; Generate jumps to Results; result cards wrap their buttons
- [x] Hub door: `desktopOnly` dropped, "Works on a phone"

**Added Oct 14 — Rests and soft parts** (Loudness group)

- [x] *Rests*: a chance (0–50 %) that a snippet is silence of its own length. Its cue point stays, so on the hardware it is an empty slice
- [x] *Soft parts*: a chance (0–100 %) that a snippet is turned down, by an amount picked between *Softer by* min and max (1–40 dB, default 6–18)
- [x] Their own dice per position (`deriveSeed(seed, 0x50f7, index)`): turning them on changes no other pick, and at 0 % a render is bit-identical to before. Stored on the snippet (`rest`, `softDb`), so edits keep them. The list shows "rest" or the gain with the soft part in blue
- [x] In both hosts, through `SettingsPanel`; checks in `check:mangler`

**Phase 3 — Chop**

- [x] `hits.ts` (with a small radix-2 FFT in `fft.ts`): spectral flux in three bands, each scaled to its own loud end; a moving-median threshold; and a real rise (some band ≥ 8 dB over the 15 ms before, within 20 dB of the loudest band), so noise jitter and the click of a sound being cut off are not hits. Each hit is checked in the samples (louder after than before), moved back to its attack on a zero crossing, ends where it has fallen 30 dB (or at the next hit), and is classed low / mid / high by its centroid. Runs in its own worker (`hits.worker.ts`, `hitsClient.ts`): about 0.6 s per two minutes of audio
- [x] Checks in `check:mangler`: 12 of 12 hits on time (±4 ms), kicks low and hats high, quiet kicks under loud hats found, none in steady noise, a held tone or silence, the FFT against a plain DFT
- [x] The parts modal is now *Parts and hits*: *Find hits* (gentle / normal / aggressive, tails to −20 / −30 / −45 dB), a coloured lane under the wave (click to hear a hit), a list to play, merge or drop hits, then *Use as parts* (snippets only from the hits, never the silence) or *Make a kit*
- [x] *Make a kit*: a new result (kept) with every hit once, in order, a cue at each, made with all snippets fixed, so the snippet list can reorder, drop or repitch them. Named `kit_<source>`
- [x] *One hit per snippet* uses the new detector and also ends a snippet where its hit has died away, so no silent tail comes along. Re-cue at hits uses it too. A `detector` setting keeps the old one for results made before (`recipeSettings` reads a missing one as `energy`)
- [ ] Later: hits stored on the source, so dropping and merging survive closing the modal (comes naturally with the slice pool)
- [ ] Later: Chop in the editor's Mangle tool

**Phase 4 — Slices and AD**

- [ ] `mangle-slices` store and the Slices station
- [ ] To slices: from hits, from a result's snippets
- [ ] AD in the engine, in settings (ranges), in the snippet list and on slices
- [ ] Kit file out of selected slices

**Phase 5 — Tempo grid**

- [ ] Tempo, grid, bars; snippet lengths in steps; exact loop length; Cut / Tape

**Phase 6 — Sequencer**

- [ ] Patterns A–D, chain, tracks, slice lock, velocity
- [ ] Live playback; offline render to a result with cues

**Phase 7 — Synth**

- [ ] Kick, snare, hat, clap first; then tom/perc, FM, noise
- [ ] To slices / sources / tray
- [ ] Empty slot → Synth: make a hit for that slot

## Decided Oct 14

- **Tempo:** Spotykach reads none, from `config.txt` or the file. The tempo grid is a convenience for plain loops (5.4).
- **Sequencer:** lives only in the browser session; out to the hardware only as a rendered result. A JSON or text format may come later (5.5).
- **Phone:** the full tool with smaller limits and compact controls (section 3, Phone), not a separate lite tool.
- **Synth:** fine as a start; watch its CPU and memory on a phone (5.6).
- **Tools menu:** a station bar at the top like the editor's tool menu, main stations always shown (section 3).
- **Synth for an empty slot:** yes. The empty-slot choice gets a Synth option that opens the Synth station for that slot; the hit goes straight into the slot (Phase 7).
- **Compact controls:** everywhere, both hosts (done, see Phone).
