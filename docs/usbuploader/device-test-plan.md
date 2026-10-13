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

-- testing:

- I made a project in WAVbuilder, engaged the sync. It wrote the files to the usb connected SK sd.

- Recorded a slot on device, imported over USB.

- Device was now supposedly in sync.

- Filled a new slot in the app, went to build and saw that pushing the one changed file meant: 2 slots to override, one to import to pool. In other words, the former imported file was going to overwrite the file recorded on device and import / pool that file.
→ in this case you'd want to know that the file has not changed, only that the app is adding info to the header
→I went ahead and synced, allowing the standard pooling import.

Log
16:58:42 Syncing usbtransfer1310: 3 slots via USB
16:58:48 ↓ Green 1 1.wav 2.7 MB in 5.8 s (482 KB/s)
16:59:17 ↑ Blue 4 MINI-KALIMBA-DRY 13.3 MB in 28.4 s (479 KB/s)
16:59:23 ↑ Green 1 1.wav 2.7 MB in 6.1 s (455 KB/s)
16:59:23 Sync complete.

- Disconnect usb mode to play on device, the new sample plays normally on SK.

- change a file in app, overwrite preperation detects and suggest correct operation
> 1 card file leaves its slot
> 1 of them is kept nowhere — read this before you build
> Gone for good — not kept anywhere
> Blue4
> Mini Kalimba Dry
> Import them to the pool first

Log
17:09:49 Syncing usbtransfer1310: 1 slot via USB
17:09:58 ↑ Blue 4 MINI-KALIMBA-DRY 4.5 MB in 9.3 s (496 KB/s)
17:09:58 Sync complete.

→ load imported file on deck A on SK: file plays normally
  → interesting remark here: the device still has the old sample on buffer / deck B from last play
    - i consider this a good thing

- want to start the operation of downloading a previously synced file with cue's, i now notice in the overview that the renaming of the files i did before ever syncing to the card are not the same, so sample on SK holds the original name.

- i want to import a sliced file into the pool to check its content, the custom import screen grays out all options on the SD side
  → also unable to drag the slot to preservation pool in custom view 


- in a new wavbuilder project i can import and delete a file 

Log
17:24:21 Syncing import-cued: 2 slots via USB
17:24:26 ↓ Blue 1 Organic Drums 2.0 MB in 4.3 s (481 KB/s)
17:24:26 × Blue 2 removed from the card
17:24:26 Sync complete.

→ The imported file name is "Organic Drums", not the renamed "Organic Drums_sliced" 
→ CUE points did survive, file plays normally in app
→ the deleted file is gone, slot is shown as free on SK

- updating a slot on the app (move a file from slot B1 to B3), engage overwrite to perform pulling cable

> Push to SD Slots to overwrite 1
> Import to Pool Displaced files preserved 0
> 1 file removed from the card Not kept in the pool — gone for good 1 Blue3 Radiophonic 1

Sync failed:
Connection to Spotykach lost. (upload at byte 2752512, attempt 1: Connection to Spotykach lost.)

Blue 3
Organic Drums
4.1 MB
failed
Log
17:40:14 Syncing import-cued: 1 slot via USB
17:40:19 Error: Connection to Spotykach lost. (upload at byte 2752512, attempt 1: Connection to Spotykach lost.)

→ original file in slot B3 still plays on SK


## B. Same card, card reader

10. Put the card in the computer, open the build/sync preview without `?usb=1`: the slots pushed in A show as in sync.

→ everything normal

## C. Release firmware (1.3.1)

11. Flash 1.3.1, insert the card from A and B: every slot loads and plays clean, slices present.
12. Open WAV Builder with `?usb=0` (the flag is remembered per browser): no USB controls anywhere.

- http://localhost:5173/#/studio still shows usb controls, but obviously they do not work

- Files from the previous tests all work


## D. Older cards

13. A card written by WAV Builder 4.1.3 (the live site) on firmware 1.4.0.b1: listed over USB with names and matched to the project (this uses the tail read for the old layout).

Round 2 (ready: the slot-file change is built, `a70bad7`) repeats A–D now that card files are written by the package's `encodeWav` ("Card identity without `ICMT`" in [usb-transfer-plan.md](usb-transfer-plan.md)), plus one more check: a project ZIP saved by 4.1.3 imports with its ids, slots and slices.

## Results, round 1 (Oct 13)

- **A (USB, 1.4.0.b1): passed.** A8: pulling the cable mid-transfer stops with "Connection to Spotykach lost"; the slot keeps its old file.
- **B (card reader): blocked.** After round A, Windows 11 refuses the SD card in two card readers ("file or directory is corrupt and unreadable"); Spotykach still reads it. The app doesn't write the SD card's file system over USB (the device does), so this is either power cut mid-write (cable pulled while the device writes, if USB powers it) or firmware. Next: read-only `chkdsk`, then repeat A step by step on a spare SD card, checking it in Windows after each step, and report the step that breaks it to Synthux.
- **Finding (read-only check of the SD card, Oct 13):** FAT32 is valid, but FAT entries 0–1435 are zero in both FAT copies, so clusters 2–1435 count as free. That range held the folders (root, `SK`, the tape folders), `README.MD` and `config.txt`, which Windows then refuses; Spotykach still reads them. All 9 slot files, `MEM` and `project.json` sit beyond cluster 1435 and are intact. The range is where the old versions of the 9 pushed slots lived; every USB push deletes the old file. Hypothesis: the device rewrites FAT sectors with wrong contents when freeing clusters. To prove: repeat on a freshly formatted SD card and check the FAT after each of these: push into an empty slot, push over an existing slot, USB delete, a device save over a slot on 1.4.0.b1, and the same save on 1.3.1. Evidence: an 80 MB read-only copy of the start of the volume.
- **Repro on a fresh 16 GB SD card (8 KB clusters, firmware 1.4.0.b1, USB power only), checked with `sd-evidence/check-sd-fat.mjs` after each step: not reproduced.** All intact after: first start in the device, USB push into an empty slot (creates `SK` and the tape folder), USB push replacing a slot file, USB delete, device save into an empty slot, device save over an occupied slot, cable pulled during a download then a device save, cable pulled during an upload then a device save. Not run: the same on 1.3.1. Differences from the damaged card: 64 GB with 32 KB clusters, formatted with a separate tool, nine replaced slots whose old files lay in the first clusters, and Windows had it mounted without a clean eject. Status: unexplained; the evidence image stays in `Documents/GitHub/sd-evidence`.
- **C, D:** not run yet.

## Results, round 2 (Oct 13)

- **A: passed**, with four findings, fixed in the build after this round:
  - A slot recorded on the device and imported into its own slot came back as a conflict on the next build: overwrite it, and import it to the pool again. The import recorded nothing in the card snapshot, and over USB the diff can't compare the bytes. Now the import records the slot like a write (`importedSnapshotSlot`), so the next build sees it in sync. A recording without a name isn't rewritten just to add the file name ("1.wav") the project gave it; once it's renamed in the app, the next build writes the name.
  - When the audio is the same and only the name or slices changed, the preview now says **Sync · header update**: the file is rewritten in place and nothing is pooled. Before, a rename showed as Changed.
  - Renames in the app never reached the card: the slot name came from `originalName` (the name at import) before `name`. Now from `name`. Downloads keep the card's name, so "Organic Drums" vs "Organic Drums_sliced" follows from the same cause.
  - Custom view: a slot in sync couldn't be copied to the pool (all SD actions disabled). Now **Move SD → Pool** works on in-sync slots. Dragging an SD slot onto the pool zone is still to be checked on the device.
  - A8 (cable pulled mid-push): passed, the slot keeps its old file.
- **B: passed.**
- **C: passed.** C12 isn't a bug: `?usb=1` is remembered in this browser, so the controls stay until `?usb=0`. Step 12 should read: open WAV Builder with `?usb=0`.
- **D:** not run yet.
