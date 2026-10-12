# Spotykach USB transfer: upstream pin

The code in this folder speaks the protocol from the Spotykach firmware's `uploader` branch.

| | |
| --- | --- |
| Repository | https://github.com/Synthux-Academy/Spotykach (MIT) |
| Branch | `uploader` |
| Ported from | `550d80b61043a25e83d90c6a7ec294f28c665286` (`web/index.html`, `docs/usb-transfer.md`, `src/transfer/protocol.h`) |
| Protocol | 1.0 (`kProtoMajor = 1`, `kProtoMinor = 0`); WAV Builder accepts major 1 only |
| Firmware version string | `1.3.1` (unchanged until the first release with transfer mode) |
| Release firmware checked | `main` `7da80618c7e051189c575e766ff40594e622e910` |

Before each USB work session, check whether the branch moved:

```sh
git ls-remote https://github.com/Synthux-Academy/Spotykach.git refs/heads/uploader
```

If it did, diff `docs/usb-transfer.md`, `src/transfer/protocol.h` and `web/index.html` against the pinned commit, and update this file.

## Files

- `skLink.ts`: SysEx enter, serial port, frames, CRC-32, commands, the download retry logic. Ported from the uploader page (`Link`, `hello`, `list`, `upload`, `download`, `enterTransferMode`).
- `usbBackend.ts`: `CardBackend` over the link. LIST, 4 KB header read plus tail read, upload validation, free-space check.
- `flag.ts`: `?usb=1` / `?usb=0`.
- `devConsole.ts`: `window.skUsb` for hardware tests while the UI doesn't exist yet.

## Differences from the uploader page

- `readSlot()` reads any byte ranges inside one DOWNLOAD_OPEN/CLOSE, so a header read costs two small reads instead of a download.
- HELLO and every multi-request operation run through `exclusive()`: HELLO resets the device session, so it must not land in the middle of an upload.
- Keep-alive PING only after 2 s without any request, not on a fixed timer.
- Small reads (headers) don't save the adaptive read size; only reads of at least `max_chunk` do.
- Uploads take files WAV Builder already encoded; nothing is decoded or re-encoded here. They are checked first: 48 kHz, audio on a multiple of 4 bytes, at most `max_frames` frames and `max_cues` cue points.
