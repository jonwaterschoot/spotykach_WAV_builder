# Slice Cue Exchange: WAV.builder vs. Dirtywave M8

## 1. Binary Header Comparison of Provided Test Files

We inspected the two WAV files in [`docs/WAV-CUE/slice-cue/`](file:///c:/Users/jonwa/Documents/GitHub/spotykach_WAV_builder/docs/WAV-CUE/slice-cue/) alongside existing Spotykach test WAVs ([`2.WAV`](file:///c:/Users/jonwa/Documents/GitHub/spotykach_WAV_builder/docs/WAV-CUE/2.WAV), [`3.WAV`](file:///c:/Users/jonwa/Documents/GitHub/spotykach_WAV_builder/docs/WAV-CUE/3.WAV)).

### File A: [`mangle_20261014_1390987972.wav`](file:///c:/Users/jonwa/Documents/GitHub/spotykach_WAV_builder/docs/WAV-CUE/slice-cue/mangle_20261014_1390987972.wav) (Original Mangler Export)
* **File Size:** `3,840,144` bytes (10.0s stereo audio, `480,000` sample frames)
* **Chunk Order:** `RIFF` → `fmt ` → `LIST` (`INFO`) → `data` *(no `cue ` chunk was present in this specific file, likely exported with "Cue point at each snippet" toggled off)*
* **`fmt ` Chunk (16 bytes):**
  * `audioFormat`: `3` (**32-bit IEEE Float**)
  * `numChannels`: `2` (Stereo)
  * `sampleRate`: `48000` Hz
  * `byteRate`: `384000` (`blockAlign`: `8`, `bitsPerSample`: `32`)
* **`LIST` (`INFO`) Chunk (92 bytes, before `data`):**
  * `IART`: `"Spotykach Builder"`
  * `INAM`: `"mangle_20261014_1390987972"`
  * `ICMT`: `'{"p":["mangled"]}'`
* **`data` Chunk:** Offset `136` (`0x88`), size `3,840,000` bytes.
* **`cue ` Chunk (when present in WAV.builder exports, e.g. `2.WAV` / `3.WAV` / [`wavHeader.ts`](file:///c:/Users/jonwa/Documents/GitHub/spotykach_WAV_builder/src/lib/audio/wavHeader.ts)):**
  * Placed **after `data`**.
  * `dwIdentifier`: `1, 2, 3...` (1-based)
  * `dwPosition`: `0`
  * `fccChunk`: `'data'` (`0x64 0x61 0x74 0x61`)
  * `dwChunkStart`: `0`, `dwBlockStart`: `0`
  * `dwSampleOffset`: Frame index (`Math.round(seconds * 48000)`)
  * Max cue points allowed by Spotykach: `255` (`MAX_CUE_POINTS`).

---

### File B: [`MANGLE_20261014SLICED-M8.wav`](file:///c:/Users/jonwa/Documents/GitHub/spotykach_WAV_builder/docs/WAV-CUE/slice-cue/MANGLE_20261014SLICED-M8.wav) (Saved from Dirtywave M8)
* **File Size:** `1,920,442` bytes (same 10.0s stereo audio, `480,000` sample frames)
* **Chunk Order:** `RIFF` → `fmt ` → `data` → `cue ` (**no `LIST/INFO` chunk**)
* **`fmt ` Chunk (18 bytes):**
  * `audioFormat`: `1` (**16-bit Integer PCM** — M8 converted the 32-bit float audio to 16-bit signed integer on save!)
  * `numChannels`: `2` (Stereo)
  * `sampleRate`: `48000` Hz
  * `byteRate`: `192000` (`blockAlign`: `4`, `bitsPerSample`: `16`)
  * Extra 2 bytes at end of `fmt `: `00 00` (`cbSize = 0`)
* **`data` Chunk:** Offset `38` (`0x26`), size `1,920,000` bytes.
* **`cue ` Chunk (388 bytes, 16 slice points, at offset `1,920,046`):**
  * `dwIdentifier`: `0, 1, 2 ... 15` (0-based)
  * `dwPosition`: `0`
  * `fccChunk`: `'atad'` (`0x61 0x74 0x61 0x64` — M8's Teensy C++ firmware writes the 32-bit literal `'data'` in little-endian, which reverses the ASCII bytes to `'atad'`)
  * `dwChunkStart`: `0`, `dwBlockStart`: `0`
  * `dwSampleOffset`: Frame index (`0, 21437, 24541, 54260, ... 451071`)
  * **RIFF Size Quirk on M8:** M8 forgot to add the `cue ` chunk's 396 bytes (`8 + 388`) to the top-level `RIFF` header size (`1,920,038` instead of `1,920,434`). Our [`readWavHeaderInfo`](file:///c:/Users/jonwa/Documents/GitHub/spotykach_WAV_builder/src/lib/audio/wavHeader.ts#L241-L343) already uses `blob.size` rather than trusting `riffSize`, so WAV.builder reads M8 files without issue.

---

## 2. Why Slices Were Not Seen in the M8 (Root Causes)

Comparing the binary headers and cross-referencing third-party M8 sample tools (**DigiChain** and **chirashi**), there are **four specific differences** between WAV.builder's hardware WAV format and what the Dirtywave M8 expects:

| Feature | WAV.builder (Spotykach Format) | Dirtywave M8 Requirement | Impact on M8 |
| :--- | :--- | :--- | :--- |
| **1. Audio Format / Bit Depth** | **32-bit IEEE Float** (`audioFormat = 3`) | **8, 16, or 24-bit Integer PCM** (`audioFormat = 1`) | **Critical.** M8's sampler officially supports 8/16/24-bit PCM. 32-bit float files either fail to load or their metadata/chunks are not parsed properly until re-saved by M8 as 16-bit PCM. |
| **2. `LIST/INFO` Metadata Chunk** | Writes `LIST/INFO` (`IART`, `INAM`, `ITMP`, `ICMT`) **before `data`** | **No `LIST/INFO` chunk** (`RIFF` → `fmt ` → `data` → `cue `) | **Critical.** M8 has a strict sequential WAV parser that does not handle `LIST/INFO` chunks cleanly and can skip/abort cue parsing when unexpected chunks appear. |
| **3. Max Slice Count** | Up to **255** cues (`MAX_CUE_POINTS = 255`) | Up to **128** slices | **Moderate.** M8 supports a maximum of 128 slice markers (`01 FILE` slice mode maps slices starting at note `C-1`). Files with >128 cues can overflow or be ignored. |
| **4. Cue Point Fields (`dwIdentifier`, `dwPosition`, `fccChunk`)** | `id = 1..N`, `dwPosition = 0`, `fccChunk = 'data'` | Accepts `id = 0..N-1` or `1..N`, `dwPosition = 0` or `sampleOffset`, `fccChunk = 'data'` | **Compatible.** Both DigiChain (`id = 0..N-1, dwPosition = 0, fccChunk = 'data'`) and chirashi (`id = 1..N, dwPosition = sampleOffset, fccChunk = 'data'`) are confirmed working on M8. Setting `dwPosition = dwSampleOffset` (standard spec when no playlist chunk is used) maximizes compatibility across M8, DAWs, and Octatrack/MPC. |

*(Note: Furthermore, in the specific test file `mangle_20261014_1390987972.wav`, no `cue ` chunk was present in the file at all—likely because the "Cue point at each snippet" toggle was off when it was rendered, or it was exported via a path that stripped metadata).*

> [!TIP]
> **M8 Instrument Setting Reminder:** On the Dirtywave M8 itself, embedded WAV cue points are only active when the Sampler Instrument's **SLICE** parameter is set to **`01 FILE`** (or when opened in the M8 Sample Editor).

---

## 3. Can One File Serve Both Spotykach & M8?

Let's evaluate whether a single WAV file could work everywhere vs. having an M8 export toggle/option:

1. **Audio Bit Depth Conflict:**
   * **Spotykach hardware** specifically requires **48 kHz / 32-bit IEEE Float / Stereo** (`audioFormat = 3`) for SD card slots (`SK/<Tape>/<1..6>.WAV`) and USB transfer (`toSlotFile` rejects anything that isn't 48 kHz 32-bit float).
   * **Dirtywave M8** requires **16-bit or 24-bit Integer PCM** (`audioFormat = 1`).
2. **Metadata (`LIST/INFO`) Conflict:**
   * **Spotykach hardware** (and WAV.builder's fast USB/SD scanner) relies on `LIST/INFO` before `data` for `INAM` (display name on hardware/USB list), `ITMP` (tempo sync), and `ICMT` (project version/hash tracking).
   * **Dirtywave M8** prefers clean `fmt ` → `data` → `cue ` without `LIST/INFO`.

Because Spotykach requires **32-bit float + `LIST/INFO`** and M8 requires **16/24-bit integer PCM without `LIST/INFO`**, **a separate M8 export option or toggle is the cleanest, most reliable solution.**

---

## 4. Least-Intrusive Implementation Plan

As you noted, most Spotykach users won't need M8 export, and M8 users coming to the app (especially to **Sample Mangler**, **Browse**, or **Loose File Editor**) don't need Spotykach `SK/` links or `LIST/INFO` headers when downloading WAV files.

### A. Pure, Dependency-Free 16-bit PCM + Cue Encoder (`encodeWavM8` / `convertWavForM8`)
We can add a tiny, zero-dependency encoder in [`src/lib/audio/wavHeader.ts`](file:///c:/Users/jonwa/Documents/GitHub/spotykach_WAV_builder/src/lib/audio/wavHeader.ts) (or [`src/lib/audio/wavEncoder.ts`](file:///c:/Users/jonwa/Documents/GitHub/spotykach_WAV_builder/src/lib/audio/wavEncoder.ts)):
* **Format:** 48 kHz (or source rate), Stereo, **16-bit PCM (`audioFormat = 1`, 16-byte `fmt `)** — half the file size of 32-bit float (`1.92 MB` vs `3.84 MB` for 10s), fast to generate in-memory without FFmpeg.
* **Layout:** `RIFF/WAVE` → `fmt ` (16 bytes) → `data` (16-bit signed PCM) → `cue ` (if slice points exist). **No `LIST/INFO` chunk.**
* **Cue Chunk Details:**
  * Cap at **128 cue points** (`M8_MAX_CUES = 128`).
  * Ensure slice points are sorted ascending, deduplicated, and within `[0, frames)`.
  * Write `dwPosition = sampleOffset` and `dwSampleOffset = sampleOffset` (satisfies both strict RIFF readers and M8/Spotykach).
  * Write `fccChunk = 'data'`.

### B. Where to Place the UI Option (Least Intrusive Options)

We have two clean ways to expose this in the UI without cluttering the interface for Spotykach users:

#### Option 1: Lightweight "Download / Export Format" Toggle (Recommended)
* **In Sample Mangler ([`MangleMode.tsx`](file:///c:/Users/jonwa/Documents/GitHub/spotykach_WAV_builder/src/modes/MangleMode.tsx)):**
  * In the top header bar (or inside the `Project` / settings menu, or `Export` action menu on result cards and the `Kept` / `Selected` batch menu):
  * Add **"Download WAV (M8 / 16-bit PCM)"** (or a persistent toggle **"WAV download format: Spotykach (32-bit) / M8 (16-bit PCM)"** stored in `localStorage`).
  * If it's a persistent toggle in the Mangler's `File` settings group or top bar, clicking the single-click **Download WAV** icon on any result card—and batch downloading `Kept` / `Selected` results—will automatically download M8-ready 16-bit sliced WAVs!
  * Even better: in the `Kept (N)` / `Selected (N)` / `Export` dropdown menu (which currently only has *Save to user library*, *Add to Browse pool*, *New Studio project*, *Send to Spotykach*), we can add **"Download WAVs"** / **"Download for M8 (16-bit PCM)"** so M8 users can also batch-download their kept mangled loops in one click without needing Studio or Browse!
* **In Audio Editor ([`WaveformEditor.tsx`](file:///c:/Users/jonwa/Documents/GitHub/spotykach_WAV_builder/src/components/WaveformEditor.tsx) / [`EditorMode.tsx`](file:///c:/Users/jonwa/Documents/GitHub/spotykach_WAV_builder/src/modes/EditorMode.tsx)) & Browse ([`BrowseMode.tsx`](file:///c:/Users/jonwa/Documents/GitHub/spotykach_WAV_builder/src/modes/BrowseMode.tsx)):**
  * Optional: Respect the same toggle or offer a secondary item in the loose file download section so slices placed manually in the Waveform Editor can also be downloaded as 16-bit M8 WAVs.

#### Option 2: Dedicated Menu Item in Export Dropdowns Only
* Keep the main Download button as 32-bit float, and add **"Download for M8 (16-bit + cues)"** inside the Result Card's `Export` menu (`MangleMode.tsx`) and the `Kept` / `Selected` batch menu.

---

## 5. Verification Plan

1. **Unit / Script Check (`scripts/check-wav-header.mjs`):**
   * Verify that M8-encoded WAVs have:
     * `audioFormat === 1` (16-bit PCM), `fmt ` size `16`
     * No `LIST` chunk
     * `cue ` chunk immediately following `data`
     * Up to 128 sorted cue points with valid frame offsets
     * Exact `riffSize === file.size - 8`
   * Verify that `readWavHeaderInfo()` in WAV.builder can round-trip read both M8-saved WAVs (`MANGLE_20261014SLICED-M8.wav`) and our new M8 exports.
2. **Hardware Verification on Dirtywave M8:**
   * Export a mangled file with slices using the new M8 option, load it into an M8 Sampler instrument, set `SLICE` to `01 FILE`, and confirm all slice markers appear in the M8 Sample Editor.

---

## 6. What was built (unreleased)

Option 2, Sample Mangler only. The result card's download button still gives the Spotykach file.

* **Converter:** [`src/lib/audio/m8Wav.ts`](../../../src/lib/audio/m8Wav.ts), `toM8Wav(blob, cueFrames)`. It takes the stored 32-bit float result and writes `fmt ` (16 bytes, PCM 16-bit, same rate and channels), `data`, then `cue `. There is no `LIST`. Cues are sorted, deduplicated, kept inside the audio and capped at 128 (`M8_MAX_CUES`). Records copy the M8's own writer (ids from 0, `dwPosition` 0) except that `fccChunk` is spelled `data`. The frames come from `recipe.cuePoints`, so they are exact and don't go through seconds.
* **Mangler:** [`src/mangler/save.ts`](../../../src/mangler/save.ts) `resultsForM8()` returns one WAV, or a zip when there are several. [`MangleMode.tsx`](../../../src/modes/MangleMode.tsx) adds **Download for the M8 (16-bit, slices)** to a card's **Export** menu and to the **Kept** and **Selected** menus (those give a zip). It only shows standalone; inside Studio the mangler hands results to the project instead. Results that use a no-derivatives source are refused, the same as every other way out.
* **Checks:** `npm run check:wav` has a *Dirtywave M8 export* section covering layout, exact RIFF size, the cue cap/sort/dedupe, 16-bit sample accuracy, the read-back, refusing a file that's already 16-bit, and the M8-saved file's chunk order.

**Checked on the hardware (2026-10-18):** `M8TEST.wav` is the original mangle file converted with `toM8Wav`, carrying the 16 slices set on the M8. It loads on the M8 and its slices show with SLICE set to `01 FILE`. So the M8 accepts `fccChunk` spelled `data`. A result downloaded through **Download for the M8** in the mangler also loads with its slices.
