# Roadmap and bugs

What's in progress, what's broken, and what's next. Finished work goes to [CHANGELOG.md](CHANGELOG.md). The detailed version of this list (until 2026-11-20) is in [docs/archive/roadmap-2026-11.md](docs/archive/roadmap-2026-11.md).

## Now

**USB**
- [ ] Device test round on firmware [1.4.1](https://github.com/Synthux-Academy/Spotykach/releases/tag/v1.4.1) (Nov 25, the first with `usb-transfer` on the device side too), one for both: `spotykach-transfer` 1.3.1 (the first on `usb-transfer`; pinned, local checks pass) and the `config.txt` fix. Connect, upload, download, `config.txt` over USB, then a USB build's `README.md` and `SK/project.json` in a card reader. → [device-test-plan.md, round 3](docs/usbuploader/device-test-plan.md#round-3-firmware-141-and-spotykach-transfer-131)
  - [x] Windows 11 (Nov 25): passed, `config.txt` applied on the device after a power cycle.
  - [ ] Linux: not run, the test laptop broke. One user reports the `dialout` fix works for them. Still open if a machine turns up: first **without** `dialout` (error names it, `UsbLinuxHelp` shows, its command and restart connect), then a first connect right after the switch (the ModemManager wait).
  - macOS: not tested, assumed to work unless reported
- [ ] Bay Mud: Edge connects, his Chrome never gets MIDI access. Next: a Chrome Guest window. → [debugging_serialnotstarting.md](docs/usbuploader/debugging_serialnotstarting.md#round-3-bay-mud-oct-28)
- [ ] Upstream PRs to `usb-transfer`, sent to Vlad Nov 26. Both bump js to 1.2.0: the second to merge takes 1.3.0.
  - [ ] [#2](https://github.com/Synthux-Academy/usb-transfer/pull/2) macOS first HELLO: a ~1 s first try, then a reopen in `handshake()`. CI passes. → [debugging_mac_first_hello.md](docs/usbuploader/debugging_mac_first_hello.md#proposal-for-the-package)
  - [ ] [#3](https://github.com/Synthux-Academy/usb-transfer/pull/3) serial plug and unplug events as `onStep` lines in `connect()`. Optional. CI passes.
  - [ ] When merged and published to npm: `spotykach-transfer` takes `usb-transfer` `^1.1.0`, so `npm update @synthuxacademy/usb-transfer` here picks it up without a new `spotykach-transfer`. Check `package-lock.json` shows the new version, then `npm run check:wav`.
  - [ ] After #3 is in: remove `withSerialEvents` in [usbSession.ts](src/lib/usb/usbSession.ts), or every event shows twice in diagnostics.
  - [ ] After #2 is in: ask a Mac user to connect once, first click, and send Copy diagnostics. If it connects in about 3 s with "no answer to the first HELLO … reopening the port", remove `withHelloRetry` in [usbSession.ts](src/lib/usb/usbSession.ts). Don't rename "no serial port granted…" upstream, our step pattern matches it.
  - [ ] Ask Vlad to bump the `lib/usb-transfer` submodule in Spotykach, so the Manager page gets both too.
  - [x] Not proposed: a 4-byte alignment check in `spotykach-transfer`'s `checkUploadable`. Firmware 1.4.0 and later play misaligned audio (`Card::_read_from`), and USB uploads need 1.4.0. Ours in `usbBackend.validate` is removed (Nov 25).
- [ ] The damaged SD card from the device tests: not reproduced. → [device-test-plan.md](docs/usbuploader/device-test-plan.md)

**Import and export** → [import-export-plan.md](docs/import-export-plan.md), decisions taken Nov 26
- [ ] 1. Names and words: downloads named after the project, the Export window's three choices (project file, SD card folder, audio files), Import and Export in the Project menu. Done on `feature/export-names-and-words` (stacked on `fix/unsaved-assign-escape`). Tested Nov 26: the project file's and SD card folder's names, and a project file imported back with an edited library sample (the edit came back; names and history didn't, which step 2 fixes). Still to test: the audio and tape downloads, Save in Browser Cache Mode.
- [ ] 2. One project file and one importer: every old format reads back, the name comes from inside, the import saves like any project.
- [ ] 3. Compare on a name clash: identical, or a summary with Import as a new project and Replace.
- [ ] 4. Browser Cache Mode: say the work lives in this browser only, offer to move it to a work folder.
- [ ] 5. Delete the unreachable ImportModal path.

**Other**
- [ ] Click-test branch `fix/unsaved-assign-escape`, then merge: Save first on the hub arrow, opening a project and zip import; a zip of an existing project; Assign's "Apply or discard first" for each tool and a Mangler take; Escape on every modal; the unsaved-changes text.
- [ ] News: the cue point modes (Ignore / Snap / Free) with a demo video.
- [ ] Sample Mangler: the "Later" items and checks on a real phone. → [mangler-v2-plan.md](docs/sample_mangler/mangler-v2-plan.md)
- [ ] Code health: one item per session, from the list below.

## Bugs

- **Saves after a zip import don't stick.** The import leaves `project-descriptor.json` in the project folder, saves write `project.json`, and the loader reads the descriptor first. Fixed by step 2 of the import/export plan.
- **Auto-save's recovery copy never comes back with a project folder connected.** Returning to Studio or restoring a session reloads the project from the folder over it, so the setting's promise ("a closed tab or a crash doesn't lose the open project") doesn't hold. Decide: offer to recover when the browser copy is newer than the folder.
- **Import and export:** a Full Backup Bundle imports with its audio missing, settings-only exports drop edits to library samples, and imports take the zip's filename as the project name. → [What breaks](docs/import-export-plan.md#what-breaks)
- **Never tested:** browsers without `showDirectoryPicker`, `move()` on an SD card, the backup's rollback when the disk fills, and the Project Manager with a card that already has projects. Full list in the archive.

## Code health

Details and line references: [docs/optimization-plan.md](docs/optimization-plan.md). Best payoff first.

1. Delete `HelpModal.tsx`: nothing imports it, and it holds the last copied Escape listener.
2. One ffmpeg instance instead of two. Not a straight move to module scope: one instance runs one `exec` at a time.
3. Byte and duration formatters: 12 versions that disagree. Merging them changes what users see, so decide the format first.
4. Four `sanitize*` functions. They name files on disk and the SD card, so compare them before merging.
5. `exportUtils.ts`, then `App.tsx`, never in one pass.
6. Lint: make `no-explicit-any`, `no-unused-vars` and `ban-ts-comment` warnings, so errors mean something.
7. The two ComparisonTables: share the preview logic and row layout. Low priority.
8. `usbSession.ts` says the USB package loads as its own chunk on connect. It doesn't: `manualChunks` puts it in `vendor`, and `slotFile.ts` imports it anyway. Fix the comment, or split it if the size matters. Low priority.

## Ideas

- **Editor:** stereo tools. Auto-save in place of Save, which needs undo and history first. Where a file came from (its pack, an import, a card) in an info block, in the header or above History.
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
- **Import and export (Nov 26):** a project file carries the original and the current version of each file, Replace on import overwrites after a confirmation, audio files stay an export choice, Browser Cache Mode warns and offers a work folder, and presets are made only through Prepare a submission. → [Decisions](docs/import-export-plan.md#decisions-2026-11-26)
