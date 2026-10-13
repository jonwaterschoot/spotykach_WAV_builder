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
- **C, D:** not run yet.
