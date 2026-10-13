# USB transfer: device test plan

Round 1 tests the `feat/usb-transfer` branch after the switch to `@synthuxacademy/spotykach-transfer` (commit `e1696e7`). Write the result after each step: ok, or what happened.

## Builds

| What | Build | Where |
| --- | --- | --- |
| Firmware with USB transfer | `v.1.4.0.b1` (uploader `67168e0`) | `spotykach_1.4.0.b1.bin` on the Spotykach releases page |
| Release firmware | `v1.3.1` (`bdc0f77`) | `spotykach_1.3.1.bin`, same page |
| WAV Builder | `feat/usb-transfer` | `npm run dev`, open `http://localhost:5173/?usb=1` in Chrome or Edge |
| WAV Builder, live | 4.1.3 | the public site, for the old-card test only |

Before starting: back up the SD card (copy the whole `SK` folder), close any DAW (on Windows only one app can open the MIDI port), use a USB data cable on the rear port.

## A. USB transfer (firmware 1.4.0.b1)

1. Connect from the app. First time: the browser asks for the serial port. The app shows the firmware version and free space.
2. List a card with a mix of slots: files WAV Builder wrote, a slot recorded on the device, empty slots. Names, lengths and slice counts look right; recorded slots show no name.
3. Push one slot. It plays clean on the device (no burst of noise, no muting), with its slices.
4. Push the same slot again: skipped, nothing sent.
5. Change the file (trim it) and push: rewritten, plays the new version.
6. Download a slot into the project: same audio, name and slices.
7. Delete a slot.
8. Pull the cable halfway through a push: the app says the connection is lost; after reconnecting, the slot still holds the old file.
9. Disconnect from the app: the device leaves transfer mode and plays again.

## B. Same card, card reader

10. Put the card in the computer, open the build/sync preview without `?usb=1`: the slots pushed in A show as in sync.

## C. Release firmware (1.3.1)

11. Flash 1.3.1, insert the card from A and B: every slot loads and plays clean, slices present.
12. Open WAV Builder without `?usb=1`: no USB controls anywhere.

## D. Older cards

13. A card written by WAV Builder 4.1.3 (the live site) on firmware 1.4.0.b1: listed over USB with names and matched to the project (this uses the tail read for the old layout).

Round 2 repeats A–D once card files are written by the package's `encodeWav` ("Card identity without `ICMT`" in [usb-transfer-plan.md](usb-transfer-plan.md)), plus one more check: a project ZIP saved by 4.1.3 imports with its ids, slots and slices.

## Results, round 1 (Oct 13)

- **A (USB, 1.4.0.b1): passed.** A8: pulling the cable mid-transfer stops with "Connection to Spotykach lost"; the slot keeps its old file.
- **B (card reader): blocked.** After round A, Windows 11 refuses the SD card in two card readers ("file or directory is corrupt and unreadable"); Spotykach still reads it. The app doesn't write the SD card's file system over USB (the device does), so this is either power cut mid-write (cable pulled while the device writes, if USB powers it) or firmware. Next: read-only `chkdsk`, then repeat A step by step on a spare SD card, checking it in Windows after each step, and report the step that breaks it to Synthux.
- **Finding (read-only check of the SD card, Oct 13):** FAT32 is valid, but FAT entries 0–1435 are zero in both FAT copies, so clusters 2–1435 count as free. That range held the folders (root, `SK`, the tape folders), `README.MD` and `config.txt`, which Windows then refuses; Spotykach still reads them. All 9 slot files, `MEM` and `project.json` sit beyond cluster 1435 and are intact. The range is where the old versions of the 9 pushed slots lived; every USB push deletes the old file. Hypothesis: the device rewrites FAT sectors with wrong contents when freeing clusters. To prove: repeat on a freshly formatted SD card and check the FAT after each of these: push into an empty slot, push over an existing slot, USB delete, a device save over a slot on 1.4.0.b1, and the same save on 1.3.1. Evidence: an 80 MB read-only copy of the start of the volume.
- **Repro on a fresh 16 GB SD card (8 KB clusters, firmware 1.4.0.b1, USB power only), checked with `sd-evidence/check-sd-fat.mjs` after each step: not reproduced.** All intact after: first start in the device, USB push into an empty slot (creates `SK` and the tape folder), USB push replacing a slot file, USB delete, device save into an empty slot, device save over an occupied slot, cable pulled during a download then a device save, cable pulled during an upload then a device save. Not run: the same on 1.3.1. Differences from the damaged card: 64 GB with 32 KB clusters, formatted with a separate tool, nine replaced slots whose old files lay in the first clusters, and Windows had it mounted without a clean eject. Status: unexplained; the evidence image stays in `Documents/GitHub/sd-evidence`.
- **C, D:** not run yet.
