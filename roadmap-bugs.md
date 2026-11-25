# Roadmap and bugs

What's in progress, what's broken, and what's next. Finished work goes to [CHANGELOG.md](CHANGELOG.md). The detailed version of this list (until 2026-11-20) is in [docs/archive/roadmap-2026-11.md](docs/archive/roadmap-2026-11.md).

## Now

**USB**
- [ ] Device test round on firmware [1.4.1](https://github.com/Synthux-Academy/Spotykach/releases/tag/v1.4.1) (Nov 25, the first with `usb-transfer` on the device side too), one for both: `spotykach-transfer` 1.3.1 (the first on `usb-transfer`; pinned, local checks pass) and the `config.txt` fix. Connect, upload, download, `config.txt` over USB, then a USB build's `README.md` and `SK/project.json` in a card reader. → [device-test-plan.md, round 3](docs/usbuploader/device-test-plan.md#round-3-firmware-141-and-spotykach-transfer-131)
  - [x] Windows 11 (Nov 25): passed, `config.txt` applied on the device after a power cycle.
  - [ ] Linux: not run, the test laptop broke. One user reports the `dialout` fix works for them. Still open if a machine turns up: first **without** `dialout` (error names it, `UsbLinuxHelp` shows, its command and restart connect), then a first connect right after the switch (the ModemManager wait).
  - macOS: not tested, assumed to work unless reported
- [ ] Bay Mud: Edge connects, his Chrome never gets MIDI access. Next: a Chrome Guest window. → [debugging_serialnotstarting.md](docs/usbuploader/debugging_serialnotstarting.md#round-3-bay-mud-oct-28)
- [ ] Now that Spotykach [#21](https://github.com/Synthux-Academy/Spotykach/pull/21) and [#22](https://github.com/Synthux-Academy/Spotykach/pull/22) are merged, one PR each (proposed to Vlad Nov 24):
  - [ ] `usb-transfer`: macOS first HELLO, a ~1 s first try and a reopen in `handshake()`. Don't rename "no serial port granted…", our step pattern matches it. Remove `withHelloRetry` once published and tested on a Mac. → [debugging_mac_first_hello.md](docs/usbuploader/debugging_mac_first_hello.md#proposal-for-the-package)
  - [ ] `spotykach-transfer`: 4-byte alignment check in `checkUploadable`. Then ours in `usbBackend.validate` can go.
  - [ ] Optional, `usb-transfer`: serial plug and unplug events as `onStep` lines in `connect()`.
- [ ] The damaged SD card from the device tests: not reproduced. → [device-test-plan.md](docs/usbuploader/device-test-plan.md)

**Other**
- [ ] News: the cue point modes (Ignore / Snap / Free) with a demo video.
- [ ] Sample Mangler: the "Later" items and checks on a real phone. → [mangler-v2-plan.md](docs/sample_mangler/mangler-v2-plan.md)
- [ ] Code health: one item per session, from the list below.

## Bugs

- **ASSIGN TO TAPE** saves only the region, fades and automation. Pending EQ, limiter, pitch or cutter settings are lost and the tool stays marked unsaved. First decide what it should save.
- **Unsaved changes:** loading another project and leaving for the hub don't offer "save first". Zip import uses a bare `window.confirm` that imports whichever button is pressed.
- **Never tested:** browsers without `showDirectoryPicker`, `move()` on an SD card, the backup's rollback when the disk fills, and the Project Manager with a card that already has projects. Full list in the archive.

## Code health

Details and line references: [docs/optimization-plan.md](docs/optimization-plan.md). Best payoff first.

1. One `useEscapeKey` hook instead of 23 copies.
2. One ffmpeg instance instead of two. Not a straight move to module scope: one instance runs one `exec` at a time.
3. Byte and duration formatters: 12 versions that disagree. Merging them changes what users see, so decide the format first.
4. Four `sanitize*` functions. They name files on disk and the SD card, so compare them before merging.
5. `exportUtils.ts`, then `App.tsx`, never in one pass.
6. Lint: make `no-explicit-any`, `no-unused-vars` and `ban-ts-comment` warnings, so errors mean something.
7. The two ComparisonTables: share the preview logic and row layout. Low priority.
8. `usbSession.ts` says the USB package loads as its own chunk on connect. It doesn't: `manualChunks` puts it in `vendor`, and `slotFile.ts` imports it anyway. Fix the comment, or split it if the size matters. Low priority.

## Ideas

- **Editor:** stereo tools. Auto-save in place of Save, which needs undo and history first.
- **SD card:** import only new files. More than one project per card: ask Vlad first, and `'SK'` is hardcoded in 8 files. Project title in `config.txt`: waiting on whether the firmware accepts unknown keys. Prepare (erase) a card.
- **Backup and projects:** a restore path, a backup reminder, cleanup as presets, remove the library → SD sync button, rename the old mirror states, recent projects and a File menu.
- **Library:** an intro on the Upload tab.
- **Onboarding:** a welcome screen before the wizard, and a walkthrough of Studio based on [ManglerTour.tsx](src/mangler/ui/ManglerTour.tsx).
- **Maybe:** `presets[]` from `generate-manifest.mjs`, project images, trash and undo, non-destructive editing (a different data model), right-click menus on cards, offline sample packs.
- **Long term:** desktop app, cloud sync, Studio on phones.

## Settled, don't reopen

- **Filename case:** SD writes `1.WAV`, downloads are lowercase, and the firmware reads both.
- **Restructure, not rebuild:** decided in v4.
- **Cleanup** stays in Project ▸ Advanced, not in the editor.
- **No auto-deploy:** pushing to main doesn't publish; `npm run deploy` does. Reasons in [deployment_guidelines.md](docs/deployment_guidelines.md) §2.
- **`storageNamespace.ts` stays:** 41 call sites, and it keys the saved folder handles.
