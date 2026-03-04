# WAV Slice Points — Developer Integration Spec
## For: React/Tailwind Web App → Spotykach Hardware Looper

---

## Context

The webapp already exports **48kHz / 32-bit float / Stereo .WAV** files (max ~42 seconds).  
The slice point tool is already built and supports **up to 32 slice markers**.  
The user may also optionally enter a **BPM value**.

This task is to **embed slice points into the WAV file's `cue` chunk** on export,  
so the Spotykach hardware looper can read them and snap start positions to those points.

No other chunks are required by the hardware. Do not add `smpl` or `acid` chunks  
unless separately requested — keep the implementation focused on what Spotykach reads.

---

## What Needs to Be Added to the WAV Export

When exporting, after the existing `data` chunk, append a **`cue ` chunk** containing  
all defined slice positions as cue points.

---

## WAV File Structure (after this change)
```
RIFF
  └── fmt
  └── data        ← already exists
  └── cue         ← ADD THIS
```

Update the RIFF chunk size in bytes 4–7 to reflect the added chunk.

---

## `cue ` Chunk Specification

### Chunk Header

| Field       | Size | Value                          |
|-------------|------|--------------------------------|
| Chunk ID    | 4    | ASCII `cue ` (note the space)  |
| Chunk Size  | 4    | `4 + (numSlices × 24)` bytes   |
| dwCuePoints | 4    | Number of slice points (1–32)  |

### Cue Point Record (24 bytes, repeated per slice)

| Field           | Size | Value                                      |
|-----------------|------|--------------------------------------------|
| `dwIdentifier`  | 4    | Unique ID per point: `1, 2, 3 …`           |
| `dwPosition`    | 4    | **Set to `0`** (no playlist chunk present) |
| `fccChunk`      | 4    | ASCII `data`                               |
| `dwChunkStart`  | 4    | `0` (single data chunk, no wave list)      |
| `dwBlockStart`  | 4    | `0` (uncompressed PCM)                     |
| `dwSampleOffset`| 4    | **Sample index of the slice point** ← this is the actual position |

> ⚠️ `dwPosition` must be `0` when there is no playlist chunk.  
> The actual slice position lives in `dwSampleOffset`.

---

## Calculating `dwSampleOffset`
```
dwSampleOffset = timeInSeconds × 48000
```

**Examples:**

| Slice time | dwSampleOffset        |
|------------|-----------------------|
| 0.000s     | 0                     |
| 0.500s     | 24000                 |
| 1.000s     | 48000                 |
| 4.250s     | 204000                |

> The byte offset within the data chunk is `dwSampleOffset × 8`  
> (32-bit float = 4 bytes × 2 channels = 8 bytes per sample frame)  
> but you do **not** need to write byte offsets into the cue chunk — sample index is correct.

---

## Word Alignment

After writing the `cue ` chunk, check if its total byte size is **odd**.  
If so, append one `0x00` padding byte.  
**Do not include the padding byte in the chunk's own size field**,  
but **do** include it when calculating the total RIFF size.

---

## RIFF Size Update

After appending the `cue ` chunk (and any padding):
```
bytes[4–7] = (total file size) - 8
```

Write this as a **little-endian uint32**.

---

## Validation Before Writing

- Slice positions must be **sorted ascending**
- All positions must be **within file bounds** (≤ total sample count)
- IDs must be **sequential starting at 1**
- Max **32 cue points**
- Reject or clamp any position at exactly the file end

---

## BPM Field

The user can enter an optional BPM in the webapp UI. **Store it for potential future use**  
but do not embed it in the WAV file at this stage — the Spotykach developer has not  
requested it and no target chunk has been specified for it yet.

---

## Testing

| Test                                      | Expected result                        |
|-------------------------------------------|----------------------------------------|
| Export with 1 slice point                 | cue chunk with 1 record                |
| Export with 32 slice points               | cue chunk with 32 records              |
| Open in Ableton Live / DAW                | Markers appear at correct positions    |
| Load on Spotykach hardware                | Start position snaps to slice points   |
| Slice at 0s (beginning of file)           | `dwSampleOffset` = 0, exports cleanly  |

---

## Summary of Key Rules

1. Use `cue ` chunk only (4-byte ID with trailing space)
2. `dwPosition` = `0` always — slice position goes in `dwSampleOffset`
3. `fccChunk` = `data`, `dwChunkStart` = `0`, `dwBlockStart` = `0`
4. Sample index = `seconds × 48000` (integer)
5. Update RIFF size after appending
6. Word-align with `0x00` pad byte if chunk size is odd