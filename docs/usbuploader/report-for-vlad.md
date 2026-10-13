Hi Vlad, here are results from testing USB transfer with WAV Builder (firmware v.1.4.0.b1, Windows 11, Chrome, spotykach-transfer 1.0.1, slot files from your `encodeWav`).

**What works well**
- A 36-slot preset (286.5 MB) wrote in 10 min 16 s at 477 KB/s. Downloads from the device run at the same speed.
- Pulling the cable mid-upload leaves the slot with its old file, every time.
- Files written over USB load and play on 1.3.1 too.

**1. The device sometimes drops off USB after a corrupted request**
A 12-slot upload (94.8 MB) logged 24 of these:
```
upload at byte 6979584, attempt 1: Spotykach received a corrupted request (the request stopped arriving). Please retry.
```
Usually the resend succeeds. But twice in about four runs, Spotykach left USB while the chunk was being resent, and went back to playing on its own:
```
upload at byte 2686976, attempt 1: Spotykach received a corrupted request (the request stopped arriving). Please retry.
upload at byte 2686976, attempt 2: The device has been lost.
```
It happened on two different SD cards, and the computer and the cable weren't touched. Details, cable and port tests and a suggestion (the 10 s idle timeout) in #15.

**And two small PRs on `uploader`**
- #13: spotykach-transfer hides the real error when the serial port fails (`e.message +=` throws on a DOMException). Tested in WAV Builder.
- #14: HELLO reports firmware 1.3.1 on the 1.4.0.b1 beta.

I can send the full console logs and per-slot timings if they help.
