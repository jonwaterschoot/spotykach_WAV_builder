# USB transfer: device test plan

Round 1 tests the `feat/usb-transfer` branch after the switch to `@synthuxacademy/spotykach-transfer` (commit `e1696e7`). Write the result after each step: ok, or what happened.

**Current round:** [Round 3](#round-3-firmware-141-and-spotykach-transfer-131), firmware 1.4.1 with `spotykach-transfer` 1.3.1. Rounds 1 and 2 (Oct 13, beta firmware) stay below for their results.

## Builds

| What | Build | Where |
| --- | --- | --- |
| Firmware with USB transfer | `v.1.4.0.b1` (uploader `67168e0`) | `spotykach_1.4.0.b1.bin` on the Spotykach releases page |
| Release firmware | `v1.3.1` (`bdc0f77`) | `spotykach_1.3.1.bin`, same page |
| WAV Builder | `feat/usb-transfer` | `npm run dev`, open `http://localhost:5173/` in Chrome or Edge, turn on Settings ▸ System ▸ USB transfer |
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

10. Put the card in the computer, open the build/sync preview on the card reader: the slots pushed in A show as in sync.

→ everything normal

## C. Release firmware (1.3.1)

11. Flash 1.3.1, insert the card from A and B: every slot loads and plays clean, slices present.
12. Turn USB transfer off in Settings ▸ System: no USB controls anywhere, without a reload. Turn it on again: the confirm window links to the firmware.

- http://localhost:5173/#/studio still shows usb controls, but obviously they do not work

- Files from the previous tests all work


## D. Older cards

13. A card written by WAV Builder 4.1.3 (the live site) on firmware 1.4.0.b1: listed over USB with names and matched to the project (this uses the tail read for the old layout).

Round 2 (ready: the slot-file change is built, `a70bad7`) repeats A–D now that card files are written by the package's `encodeWav` ("Card identity without `ICMT`" in [usb-transfer-plan.md](usb-transfer-plan.md)), plus one more check: a project ZIP saved by 4.1.3 imports with its ids, slots and slices.

## E. Preset → SD over USB (firmware 1.4.0.b1)

USB transfer on in Settings ▸ System. Hub ▸ Starter Presets ▸ Write to SD card ▸ **Over USB**.

14. Connect from the dialog. The grid shows the preset's slots: filled (grey), replaced (red, listed by name and size), the rest left alone.
15. With a few occupied slots in the preset's range: **Save these N first** downloads a ZIP laid out as `SK/<T>/<n>.WAV` with a README naming each slot. Copying its `SK/` onto the card through a card reader puts them back.
16. Write Free the Rhythm (12 slots), then Hainbach's Spotykach Tapes (36). Each slot plays on the device, with its slices; slots outside the preset still hold what they held.
17. **Copy timings** at the end and paste them here: total time, KB/s, per-slot seconds. These replace the estimate in the dialog (470 KB/s, about 35 s per full slot).
18. Stop halfway, and pull the cable halfway on another run: the slot being written keeps its old file; the slots before it hold the preset.
19. **Done, let Spotykach play**: the device leaves transfer mode.

### Results, E (Oct 13, 18:43–18:54)

- **15:** the ZIP of the replaced slots downloaded in good shape.
- **16 (Hainbach's Spotykach Tapes, 36 slots): passed, the device plays the samples.** Total 10 min 26 s: about 10 s to fetch the audio, then 286.5 MB written in 10 min 16 s (477 KB/s). Per slot 413–501 KB/s, 2.6–29.3 s; 17 s on average. Slowest: Pink 5 and 6 (413 and 424 KB/s). Time follows the bytes: a full 42 s slot (16.1 MB) takes about 34 s.
- **HELLO reports firmware 1.3.1** on the 1.4.0.b1 beta. To tell Synthux.
- **Follow-ups, built:** the dialog lists the steps (done, now, to do), the elapsed time and the time left (from this run's own pace, 17 s per slot before the first one is done), and the slots finished so far. The estimate before writing is the measured 17 s per slot, with the full-length worst case beside it. "Let Spotykach play" now leaves the dialog open with the report (clicked too early on this run, which closed it); the report also goes to the browser console.
- **16 (Free the Rhythm, 12 slots), 19:09–19:11: failed at Green 3 (slot 9), nothing touched.** 8 slots written, 57.2 MB in 2 min 05 s (469 KB/s, 444–499 per slot). The serial port's write failed and the connection ended. The real error was hidden: the transfer package (1.0.1) appends its detail with `e.message += …`, which throws on the browser's DOMException ("Cannot set property message … only a getter"). The original is the `[spotykach] upload at byte …` warning in the console. Cause still open: a USB reset on the Windows side (power saving on the hub or port), or the device dropping off. To check: that console line, whether Spotykach restarted, and whether Green 3 still plays its old file.
- **Built after this run:** the backend turns the getter TypeError into "The USB connection to Spotykach failed". The dialog keeps its slot count when the connection drops (it showed "9 of 0"), and offers **Continue / Reconnect and continue (N left)**, which writes only the slots the interrupted run didn't finish. To report to Synthux: the `e.message +=` in `_sendChunk` and `_readRange`.
- **After the failure:** Green 3–6 still held the Hainbach files, so the failed slot kept its old file. Spotykach left transfer mode by itself and played again: the device ended the session, not the cable.
- **16 again (Free the Rhythm), 19:35–19:38: passed.** 12 slots, 94.8 MB in 3 min 29 s (466 KB/s). The console showed **24 resent chunks**: "Spotykach received a corrupted request (the request stopped arriving)", spread over most slots. The package resends those and they cost little speed (Green 1 at 370 KB/s, Green 2 at 419), but they show frames from the computer reaching the device cut short. The failed run was probably one of these that the device didn't recover from. For Synthux, with the console log: frequency, firmware 1.4.0.b1 (HELLO says 1.3.1), Windows.
- **Studio, the same preset loaded as a project:** over USB, slots written by the preset show "Same name?". A preset write keeps no card snapshot, and USB can't compare content without a download. Expected; the card reader route matches them by audio.
- **App bugs found on the way, fixed:** (1) the first load of a preset in Studio broke playback ("The AudioContext encountered an error from the audio device", ×10) until a reload: every mini waveform opened its own `AudioContext` and never closed it, 36 at once. They decode offline now (`decodeOffline`), as does the duration read in preset hydration. (2) "Failed to set the 'volume' property … 7.943": the play/stop fade took progress from the frame's timestamp, which can be before the fade started, so it went negative. Clamped.
- **18 and Continue, another SD card, 19:54–20:02: passed.** Cable pulled during Blue 3: "Connection to Spotykach lost". Reconnect and continue wrote on from Blue 3. During Green 4 the connection dropped by itself; Reconnect and continue again finished the last 3. All 12 slots written once, 94.8 MB in 3 min 25 s of writing (474 KB/s), 9 min 04 s with the pauses.
- **How the device drops by itself**, now in the console: `upload at byte 2686976, attempt 1: Spotykach received a corrupted request (the request stopped arriving)`, then on the resend `attempt 2: The device has been lost.` A short frame arrives, and during the resend Spotykach leaves USB (and plays again). Seen on two cards, so not the card. The main finding for Synthux.
- **Polish after this run:** a failed write's step reads "Stopped at Green 4 · 9 of 12 written", and the error no longer repeats the package's "(upload at byte …)" detail, which stays in the console.
- **Cables and ports, Free the Rhythm (94.8 MB), stalls counted in the console:**

  | Connection | Stalls | Session lost | Speed |
  |---|---|---|---|
  | Hub, C-to-A | 24, 25 | 2 of ~5 runs | 466–477 KB/s |
  | Front USB-C, two C-to-C cables | 9, 3 | no | 229–231 KB/s |
  | Front USB-A, three C-to-A cables | 4, 1, 22 | no | 440–469 KB/s |

  The count varies run to run with nothing changed (1, then 22, same cable and port), so cable and port don't explain the stalls; they come in bursts, sometimes twice at the same offset. Session losses only seen through the hub (few runs). The front USB-C port runs at half speed with either cable. One C-to-A cable that passes a data tester made Spotykach's LEDs flicker. Advice for now: a direct USB-A port, a known-good cable.
- **Reported upstream (Oct 13):** issue Synthux-Academy/Spotykach#15 (stalls; the 10 s idle timeout ends the session when a resend stalls too), PR #13 (spotykach-transfer hides serial errors; tested in WAV Builder), PR #14 (HELLO firmware version).

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
- **C: passed.** C12 isn't a bug: `?usb=1` is remembered in this browser, so the controls stay until `?usb=0`. Since then the switch is in Settings ▸ System, with a confirm window that links to the firmware.
- **D:** not run yet.

## Round 3: firmware 1.4.1 and spotykach-transfer 1.3.1

Both sides of the connection now run the shared `usb-transfer` code: the device since firmware 1.4.1, WAV Builder since `spotykach-transfer` 1.3.1. One round covers that and the `config.txt` fix. Windows 11 and Linux; macOS not tested, assumed to work unless reported.

| What | Build | Where |
| --- | --- | --- |
| Firmware | `v1.4.1` | `spotykach_1.4.1.bin` on the [release page](https://github.com/Synthux-Academy/Spotykach/releases/tag/v1.4.1) |
| WAV Builder | `main` with the uncommitted 1.3.1 pin, `USB_FIRMWARE` 1.4.1 and the `config.txt` fix | `npm run dev`, `http://localhost:5173/` in Chrome or Edge |

Before starting: back up the SD card's `SK` folder, close any DAW, use a direct USB-A port and a known-good cable on the rear port (the hub gave the most stalls in round 1).

### F. Windows 11

20. Connect. HELLO reports **1.4.1** (on the beta it said 1.3.1). Copy diagnostics: each step has its name.
21. A1–A9 on a card with written, recorded and empty slots: list, push, push again (skipped), trim and push, download, delete, cable pulled mid-push (slot keeps its old file), disconnect (device plays again).
22. `config.txt` over USB: read it, change a setting, write it, read it back. Then the case the `config.txt` fix is for.
23. A build over USB writes `README.md` and `SK/project.json`. Then the card in a card reader: both are there and readable, and the slots show as in sync (B10).
24. Preset over USB, Free the Rhythm (E16, 12 slots). Copy timings: KB/s and the stall count in the console, against round 1 (466–477 KB/s; 1–25 stalls on a direct port). The device's transport code is new, so a change either way is worth noting.
25. The firmware texts say 1.4.1 and the link opens the 1.4.1 page: Settings ▸ System ▸ USB transfer, the card route info, Help ▸ USB Transfer.


First connect:
```
WAV Builder 4.5.0
Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36
status: connected

+0.00s connect · 2026-11-25T14:10:48.134Z
+0.04s no serial port granted to this site yet
+0.04s MIDI permission: granted
+0.33s MIDI ports: input "Spotykach" (connected), output "Spotykach" (connected)
+0.33s sending SysEx: enter transfer mode
+0.55s reply: OK
+0.55s waiting for the serial port
+2.34s serial connect 0483:5740
+2.35s opening the serial port and sending HELLO
+2.41s HELLO: firmware 1.4.1, protocol 1.2
+2.44s connected
+5.83s diagnostics copied
```

syncing:
```
Log
15:14:22 Syncing Free the Rhythm - a short selection of the existing packs: 24 slots via USB
15:14:27 ↓ Blue 1 MASSIVE.flac 2.2 MB in 4.2 s (540 KB/s)
15:14:32 ↓ Green 1 Uher-Tape-Beat.flac 2.4 MB in 4.7 s (529 KB/s)
15:15:01 ↓ Green 2 NKT_Arhythmic.flac 15.4 MB in 29.4 s (535 KB/s)
15:15:22 ↓ Green 3 drainpipeUZ.flac 11.2 MB in 21.3 s (538 KB/s)
15:15:34 ↓ Pink 1 mangle_120bpm_8bars_20261014_2859440479 5.9 MB in 11.2 s (536 KB/s)
15:16:01 ↓ Pink 2 mangle_20261016_1555324201-4-edit 14.2 MB in 27.2 s (536 KB/s)
15:16:14 ↓ Pink 3 3.wav 6.9 MB in 13.2 s (536 KB/s)
15:16:44 ↓ Pink 4 mangle_20261016_833095640 15.4 MB in 29.3 s (537 KB/s)
15:17:13 ↓ Pink 5 mangle_20261031_748075934 15.4 MB in 29.2 s (540 KB/s)
15:17:21 ↓ Red 1 mangle_20261016_1555324201-2-edit 4.0 MB in 7.8 s (531 KB/s)
15:17:50 ↓ Red 2 mangle_20261018_2485805664 15.4 MB in 29.4 s (535 KB/s)
15:18:18 ↓ Red 3 3.wav 14.5 MB in 27.7 s (535 KB/s)
15:18:47 ↓ Red 4 mangle_20261019_2972497450 15.4 MB in 28.8 s (546 KB/s)
15:18:54 ↓ Turquoise 1 mangle_20261023_3940864540 3.7 MB in 6.9 s (547 KB/s)
15:19:01 ↓ Turquoise 2 mangle_20261023_766375893 3.7 MB in 6.9 s (548 KB/s)
15:19:07 ↓ Turquoise 3 mangle_20261023_1455983751 3.7 MB in 6.8 s (549 KB/s)
15:19:14 ↓ Turquoise 4 mangle_20261023_1620326247 3.7 MB in 6.8 s (549 KB/s)
15:19:16 ↓ Turquoise 5 5.wav 0.9 MB in 1.8 s (540 KB/s)
15:19:18 ↓ Turquoise 6 Turquoise_5-edit 0.9 MB in 1.8 s (541 KB/s)
15:19:20 ↓ Yellow 1 Turquoise_5-edit 0.9 MB in 1.8 s (538 KB/s)
15:19:28 ↑ Blue 1 MASSIVE.flac 3.7 MB in 8.1 s (470 KB/s)
15:19:34 ↑ Green 1 Uher-Tape-Beat.flac 2.4 MB in 5.4 s (459 KB/s)
15:20:06 ↑ Green 2 NKT_Arhythmic.flac 15.4 MB in 32.5 s (485 KB/s)
15:20:06 Green 2: 93.3 s, cut to 42.0 s on the card (the device plays no more). The project keeps the whole file.
15:20:30 ↑ Green 3 drainpipeUZ.flac 11.2 MB in 23.6 s (486 KB/s)
15:20:30 Sync complete.
```
--



### G. Linux

26. **Without** `dialout` (or `uucp` on Arch): connect. After about 6 s the error names `dialout`, and the panel with the `usermod` command and Copy shows under it. Follow it as a user would: copy, paste, restart.
27. After the restart, the first connect right after the switch: it connects. In Copy diagnostics, note how long "Opening the serial port" took (a few seconds is ModemManager's probe, waited out).
28. A quick push and a download (A3, A6), and a disconnect (A9).

### Results, round 3

- **F (Windows 11, Chrome): passed**, F20–F25. HELLO reports 1.4.1. Downloads 529–549 KB/s, uploads 459–486 KB/s, up from 466–477 in round 1.
- **F22 (`config.txt` over USB): passed on the device.** Written over USB, applied after a power cycle (deck B: MIDI start/stop off, one slice at a time on). Two findings, fixed during the round:
  - A read or write over USB showed only a 3-second status line. Now it's also a line in Copy diagnostics and in the Logs window, failures included.
  - Nothing on screen said the file waits for a power cycle, and leaving USB mode reads like it should apply it. After a write, a note stays under the USB status, through Disconnect, until the next USB action.
  - Also: the open diagnostics view showed "diagnostics copied" as its last line, with the time counting up. That line is now added only when copying.
- **G (Linux): not run**, the test laptop is broken. The `dialout` fix has one user's report that it works on their machine; that stands in for G26–G28 for now.
