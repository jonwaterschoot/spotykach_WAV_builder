# Spotykach USB transfer: where the protocol comes from

The protocol code is the npm package [`@synthuxacademy/spotykach-transfer`](https://www.npmjs.com/package/@synthuxacademy/spotykach-transfer), maintained by Synthux next to the firmware (`web/spotykach-transfer` in [Synthux-Academy/Spotykach](https://github.com/Synthux-Academy/Spotykach)). WAV Builder keeps no copy of it.

| | |
| --- | --- |
| Package | `^1.0.1` in `package.json` |
| Protocol | 1.x (the package's major version follows it; `connect()` refuses another major) |
| Firmware | `uploader` branch, first release with USB transfer |

**Changing the protocol side:** don't patch it here. Fork the Spotykach repo, change `web/spotykach-transfer` (with its tests, `tests/transfer/run.sh`), and open a PR there, so firmware and web change together. Then bump the package here.

## Files

- `usbBackend.ts`: `CardBackend` over the package's `SkLink`. LIST, a 4 KB header read plus a tail read (for our `ICMT` on files from 4.1.3 and earlier), upload checks, free space.
- `usbSession.ts`: one connection shared by the UI and the console; loads the package only when connecting.
- `flag.ts`: the Settings switch (`useUsbTransferEnabled`, `setUsbTransferEnabled`), and `?usb=1` / `?usb=0`.
- `devConsole.ts`: `window.skUsb` for hardware tests.

## What WAV Builder adds on top

- Uploads take files WAV Builder already encoded, with our `ICMT` (id, hash) before the audio. The package's `checkUploadable` checks format, length and cue count; `usbBackend.validate` also refuses audio that doesn't start on a 4-byte boundary, which the package doesn't check because its own `encodeWav` always aligns.
