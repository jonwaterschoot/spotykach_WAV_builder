# Spotykach WAV Slice Implementation Summary

This document describes how slice points (cue points) are embedded within WAV files created by the Spotykach Builder to ensure compatibility with the Spotykach hardware looper.

## WAV Chunk Structure

To support slices, we append a `cue ` chunk to the WAV file. This chunk follows the standard RIFF specification but is tailored for the looper's snapping mechanism.

### The `cue ` Chunk

The `cue ` chunk contains a list of cue points. Each point represents a slice position in the audio data.

- **Chunk ID**: `'cue '` (0x63 0x75 0x65 0x20)
- **Chunk Size**: `4 + (numSlices * 24)` bytes
- **Num Cue Points**: `dwCuePoints` (Uint32, little-endian)
- **Cue Point Records**: A list of 24-byte records.

### Tempo Information (ITMP)

To ensure the hardware looper can automatically sync to the file's tempo, the BPM is embedded in the `LIST INFO` chunk using the `ITMP` tag. 

- **Chunk ID**: `ITMP` (within `LIST INFO`)
- **Format**: String representation of the BPM (e.g., "120.0" or "128").
- **Behavior**: If present, the Spotykach hardware will prioritize this value over its sample-length-based tempo calculation.

Example `LIST INFO` Structure:
- `LIST` (size)
    - `INFO`
        - `ITMP` (size): "125.0"
        - `ICMT` (size): "{\"id\":\"...\",\"p\":[\"sliced\"],\"t\":125.0}"
- **Cue Point Records**: A list of 24-byte records.

### Cue Point Record (24 bytes)

Each slice is defined by a 24-byte record:

| Offset | Field | Type | Value | Description |
| :--- | :--- | :--- | :--- | :--- |
| 0 | `dwIdentifier` | Uint32 | `1, 2, 3...` | Unique sequential ID |
| 4 | `dwPosition` | Uint32 | `0` | No playlist chunk used |
| 8 | `fccChunk` | char[4] | `'data'` | Destination chunk |
| 12 | `dwChunkStart` | Uint32 | `0` | Byte offset of data chunk |
| 16 | `dwBlockStart` | Uint32 | `0` | Byte offset of sample block |
| 20 | `dwSampleOffset` | Uint32 | `N` | **Sample index of the slice** |

### Sample Offset Calculation

The `dwSampleOffset` is calculated based on the fixed sample rate of 48kHz:
`dwSampleOffset = round(timeInSeconds * 48000)`

## Implementation Example

If we have two slices at 0.5s and 1.25s:

1.  **Slice 1**: `round(0.5 * 48000) = 24000`
2.  **Slice 2**: `round(1.25 * 48000) = 60000`

The `cue ` chunk will have `dwCuePoints = 2` and two records with `dwSampleOffset` values 24000 and 60000 respectively.

## UI Indicators

The Spotykach Builder UI provides visual indicators for files with embedded slices or tempo:

- **[S] Badge**: Indicates the file contains embedded slice points in a `cue ` chunk.
- **[T] Badge**: Indicates the file has associated tempo (BPM) information in its metadata.

These badges appear on both the slot cards in the main editor and the file list in the Library Manager.

## Library Import Exception

When importing files into the curated library with "Convert to Lossless FLAC" enabled, the builder automatically detects `cue ` chunks. If slices are detected, the file **remains a WAV** to preserve the chunk data, as FLAC conversion would strip the looper-specific `cue ` information.
