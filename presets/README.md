# Preset Descriptors

This directory contains in-app project preset descriptor JSON files (`project-descriptor.json` schema v1.0).

## Schema

```json
{
  "schema": "spotykach-project/1.0",
  "name": "My Preset Name",
  "description": "Short description shown in the Presets panel.",
  "tapes": {
    "Blue":      { "slots": [{ "id": 1, "fileId": "uuid-1" }, { "id": 2, "fileId": null }, { "id": 3, "fileId": null }, { "id": 4, "fileId": null }, { "id": 5, "fileId": null }, { "id": 6, "fileId": null }], "notes": "" },
    "Green":     { "slots": [{ "id": 1, "fileId": null }, { "id": 2, "fileId": null }, { "id": 3, "fileId": null }, { "id": 4, "fileId": null }, { "id": 5, "fileId": null }, { "id": 6, "fileId": null }], "notes": "" },
    "Pink":      { "slots": [{ "id": 1, "fileId": null }, { "id": 2, "fileId": null }, { "id": 3, "fileId": null }, { "id": 4, "fileId": null }, { "id": 5, "fileId": null }, { "id": 6, "fileId": null }], "notes": "" },
    "Red":       { "slots": [{ "id": 1, "fileId": null }, { "id": 2, "fileId": null }, { "id": 3, "fileId": null }, { "id": 4, "fileId": null }, { "id": 5, "fileId": null }, { "id": 6, "fileId": null }], "notes": "" },
    "Turquoise": { "slots": [{ "id": 1, "fileId": null }, { "id": 2, "fileId": null }, { "id": 3, "fileId": null }, { "id": 4, "fileId": null }, { "id": 5, "fileId": null }, { "id": 6, "fileId": null }], "notes": "" },
    "Yellow":    { "slots": [{ "id": 1, "fileId": null }, { "id": 2, "fileId": null }, { "id": 3, "fileId": null }, { "id": 4, "fileId": null }, { "id": 5, "fileId": null }, { "id": 6, "fileId": null }], "notes": "" }
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

## Usage

1. Author a `.json` file following the schema above.
2. Save it here as e.g. `my-preset.json`.
3. Open `public/manifest.json` and add an entry to the `presets` array:

```json
{
  "id": "my-preset",
  "name": "My Preset Name",
  "description": "Short description.",
  "coverImage": "/Hainbach/Hainbach.jpg",
  "requiredPacks": ["hainbach-tapes"],
  "descriptorPath": "/presets/my-preset.json",
  "sdExportUrl": "https://pub-6649b937be6b4a8c9b92904c5ac392fc.r2.dev/presets/my-preset-SD.zip"
}
```

> `sdExportUrl` is optional — only add it once you've manually built the SD-ready ZIP and uploaded it to R2.

4. Commit and deploy. The preset will appear in the app's Presets panel automatically.

## Notes

- `fileId` values in the descriptor are stable UUIDs you choose — they must match the `tapes[color].slots[].fileId` references.
- `samplePath` must match a path in the manifest's `packs[].samples[].path` field (or any valid R2 path).
- Only `samplePath` OR `blobRef` should be set per file entry, not both.
