# USB transfer speed

Where the time goes in a USB transfer, and what could make it faster. Researched Oct 13, 2026 against the `uploader` branch (firmware 1.3.1, protocol 1.0) and `@synthuxacademy/spotykach-transfer` 1.0.1.

**Short version:** nothing on the WAV Builder side would make a real difference. The only big win is pipelining, which is a firmware and package change (protocol 1.1) and Vlad's call.

## Measured

On Windows, Oct 12 (see [usb-transfer-plan.md](usb-transfer-plan.md)): uploads at 460–481 KB/s, a download at 470 KB/s. So a full 42 s slot (16.1 MB) takes about 34 s, and 36 full slots about 20 minutes.

## Where the time goes

Each 32 KB chunk is one request followed by a wait for the reply ("lockstep", spec §5.5). At 470 KB/s that is about 70 ms per chunk. The split below is estimated from the code, not timed:

| Part | Time | Why |
|---|---|---|
| USB Full Speed data | ≥ 27 ms | Hardware limit of the rear port, about 1.2 MB/s |
| SD bus | ≥ 21 ms | `Card::recognize()` in `src/hw/card.cpp`: `BITS_1`, `MEDIUM_SLOW` (12.5 MHz), about 1.5 MB/s raw |
| Round trip, rest | ~10–20 ms | USB idles while the SD works, and the other way round |
| CRC, twice, in software | ~1 ms | Negligible |

Downloads and uploads run at the same rate, which fits: both pay for the USB and the SD in turn.

### WAV Builder side

Already done, and the biggest savings: unchanged slots are skipped, slots are recognised from LIST plus the card snapshot (no downloads to hash), and header reads are skipped when LIST is enough. The package opens the port with a 64 KB buffer, and its CRC and copies cost well under a second per file. Nothing left worth changing.

### 4-bit SD is not possible

The SD data lines are fixed MCU pins, on Seed pins D1–D4. Spotykach uses three of them for other things (`src/hw/hardware.cpp`):

| Seed pin | MCU pin | SD function | Spotykach uses it for |
|---|---|---|---|
| D4 | PC8 | D0 | SD (1-bit data) |
| D3 | PC9 | D1 | Clock input |
| D2 | PC10 | D2 | Boot button |
| D1 | PC11 | D3 | Gate A input |
| D5 / D6 | PD2 / PC12 | CMD / CLK | SD |

libDaisy's default is `FAST` and `BITS_4`, so both settings were chosen on purpose. The code doesn't say why the clock is at half the standard rate. It has been there since the first commit; the reason (traces, problem cards) is a question for Vlad.

## Firmware options

| Change | Size | Gain (est.) | Full slot |
|---|---|---|---|
| Now | | | ~34 s |
| SD clock to `STANDARD` 25 MHz | One line | ~1.15× | ~29 s |
| SD clock to `FAST` 50 MHz | One line | ~1.25× | ~27 s |
| Pipelining (protocol 1.1) | Medium: firmware and package | ~1.7–1.8× | ~19–20 s |
| 64 KB chunks | Small, tied to `Card::kChunk` | ~1.1× | ~31 s |
| Hardware CRC unit | Small | ~1–2% | |
| Load 16/24-bit WAVs, convert on the device | Big: the loader changes | 2× / 1.33× fewer bytes | Design change |

With pipelining in place, a faster SD clock adds almost nothing: the USB link becomes the limit.

## Pipelining

Today the browser sends a chunk and waits for the reply, so the USB link and the SD card take turns:

```
USB:  [send 1]          [send 2]          [send 3]
SD:           [write 1]         [write 2]         [write 3]
```

Pipelined, the browser sends the next chunk without waiting, so the SD writes one chunk while the next one arrives:

```
USB:  [send 1][send 2][send 3][send 4]
SD:           [write 1][write 2][write 3][write 4]
```

A chunk then costs as long as the slower stage (USB, about 30 ms), not both added up (about 70 ms).

What it takes:

- **Uploads:** the device already fills its receive buffer from the USB interrupt (`rx_callback` in `src/transfer/link.cpp`) while the main loop runs `f_write`. The buffer holds one frame, and the protocol says one request in flight. It needs a two-frame buffer and a rule that allows two chunks in flight.
- **Downloads:** the device reads the next chunk from the card while the last one is still being sent. That needs a second TX buffer.
- **Errors are the hard part.** With two chunks in flight, a lost reply leaves it unclear which chunk arrived. Every `UPLOAD_DATA` reply already carries the device's offset, which answers that, so most of the groundwork is there.
- Announce it as protocol 1.1 in HELLO, so pages that only speak 1.0 keep working. WAV Builder then only bumps the package.

## Decision (Oct 13, 2026)

Not pursued for now:

- The real-world gain is small. A sync only writes the slots that changed, and the card reader stays the recommended route for full rebuilds.
- It changes Vlad's firmware and package together, on an unreleased branch that is still changing. Upstream changes only when essential ([PROTOCOL.md](../../src/lib/usb/PROTOCOL.md)).

Next step: share the summary with Vlad and ask (1) whether he plans 1.1 pipelining and would take a PR, and (2) whether `MEDIUM_SLOW` is deliberate. If he wants a PR, work in a separate session in the Spotykach fork, on a branch off `uploader`. `tests/transfer/run.sh` runs the protocol on the host (firmware code against the JS package), so dropped replies can be tested without flashing. Test on hardware last, on Windows and ideally macOS.
