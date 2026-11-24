# Spotykach USB transfer: where the protocol comes from

The protocol code is the npm package [`@synthuxacademy/spotykach-transfer`](https://www.npmjs.com/package/@synthuxacademy/spotykach-transfer), maintained by Synthux next to the firmware (`web/spotykach-transfer` in [Synthux-Academy/Spotykach](https://github.com/Synthux-Academy/Spotykach)). WAV Builder keeps no copy of it.

| | |
| --- | --- |
| Package | `1.2.0`, pinned exactly in `package.json` |
| Next | 1.3.1, once [Spotykach #22](https://github.com/Synthux-Academy/Spotykach/pull/22) is published. 1.3.0 is the first on `usb-transfer`, but it drops `fresh` (see below) |
| Protocol | 1.x (the package's major version follows it; `connect()` refuses another major) |
| Firmware | 1.4.x. The `v141` branch ([Spotykach #21](https://github.com/Synthux-Academy/Spotykach/pull/21)) moves the firmware's transport to `usb-transfer` too |

The pin is exact so that a new package version comes in only through a deliberate bump, with the checks below. `npm update` doesn't move it.

## Three layers

**[`usb-transfer`](https://github.com/Synthux-Academy/usb-transfer)** (npm `@synthuxacademy/usb-transfer`, since November 2026): the transport, shared with other Synthux devices. A C++ half for the firmware (`lib/usb-transfer` in the Spotykach repo) and a JS half.
- Frames (12-byte header, CRC32), the base commands and statuses, the error classes
- The SysEx switch over Web MIDI, with time limits on MIDI access and opening
- Finding the granted port, waiting for the new one, the port picker, opening with retries (24 attempts for a fresh port on Linux, past ModemManager)
- HELLO and the protocol check, keep-alive, retries after a lost or broken frame
- The `onStep` lines, and `defineDevice(spec)`: a device brings its USB IDs, MIDI name, magic, status texts and `Link` subclass

**`spotykach-transfer`**: what is Spotykach's own.
- `DEVICE` (`0483:5740`, `"SK"`, protocol 1.2) and `SkLink`: LIST, upload, download, remove, `config.txt`, small text files
- `parseConfig` / `formatConfig`, `inspectWav`, `checkUploadable`, `encodeWav`, `convertAudio`
- `connect` / `handshake` / `authorizePort` with `DEVICE` filled in

**WAV Builder** imports only `spotykach-transfer`, never `usb-transfer`.

**Changing the protocol side:** don't patch it here. Transport fixes go to `usb-transfer` (its `test/run.sh`). Spotykach-specific ones go to `web/spotykach-transfer` in the Spotykach repo (`tests/transfer/run.sh`, which loads `usb-transfer` from the `lib/usb-transfer` submodule: move that too when a fix needs a newer one). Then bump here.

## Files

- `usbBackend.ts`: `CardBackend` over the package's `SkLink`. LIST, a 4 KB header read plus a tail read (for our `ICMT` on files from 4.1.3 and earlier), upload checks, free space.
- `usbSession.ts`: one connection shared by the UI and the console; loads the package only when connecting.
- `flag.ts`: the Settings switch (`useUsbTransferEnabled`, `setUsbTransferEnabled`), and `?usb=1` / `?usb=0`.
- `devConsole.ts`: `window.skUsb` for hardware tests.

## What WAV Builder adds on top

| | Where it lives | Stays? |
| --- | --- | --- |
| macOS HELLO retry: a second plain `connect()` when the first HELLO goes unanswered (`withHelloRetry` in `usbSession.ts`) | here | No: proposed for `usb-transfer`'s `handshake()`. Remove ours once that is published and tested on a Mac. [Proposal](../../../docs/usbuploader/debugging_mac_first_hello.md#proposal-for-the-package) |
| Alignment check: `usbBackend.validate` refuses audio that doesn't start on a 4-byte boundary (misaligned audio: noise, then a dead engine) | here | No: proposed for `checkUploadable`. The package's `encodeWav` always aligns, but its check lets other files through |
| `ICMT` tail read, for our id and hash in files from 4.1.3 and earlier | here | Yes: `ICMT` is WAV Builder's own |
| Diagnostics: the trace, step names matched from `onStep` text, serial plug and unplug events, "Copy diagnostics" | here | Yes. The plug and unplug lines could also go upstream as `onStep` lines (optional) |

Uploads take files WAV Builder already encoded, with our `ICMT` (id, hash) before the audio. The package's `checkUploadable` checks format, length and cue count.

## Bumping the package

1. Read the package diff, and `usb-transfer`'s if its version moved.
2. Step names: the `STEPS` patterns in `usbSession.ts` still match the package's `onStep` lines (a renamed line silently loses the step name in errors).
3. Fixes listed above as moving upstream: remove ours only once the published package has them.
4. `npm run check:wav`. If the firmware's `wav.cpp` or `service.cpp` changed, re-port them and update the commits pinned in `scripts/check-wav-header.mjs`.
5. Device test on Windows, macOS and Linux: connect, upload, download, `config.txt`. → [device-test-plan.md](../../../docs/usbuploader/device-test-plan.md)
6. Update the table at the top.
