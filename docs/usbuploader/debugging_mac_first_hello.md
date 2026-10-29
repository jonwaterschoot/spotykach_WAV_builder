# Debugging: first HELLO unanswered on macOS

Firmware 1.4.0, `@synthuxacademy/spotykach-transfer` 1.2.0. Separate from [transfer mode not starting](debugging_serialnotstarting.md), which is Web MIDI on one Windows PC.

## The report

A Mac user (macOS Sequoia, Chrome 156, Spotykach on USB-C straight into the Mac), on the official Manager:

- **Chrome:** every first Connect switches the device (rings lit) and ends in "Spotykach didn't respond in time." Clicking Connect again right after the error connects.
- **Edge:** the first Connect seemed to do nothing, and the second showed the port picker and connected. That first click was the first-use grant: the click had expired by the time the port appeared, so the page asked for another one. Expected behaviour.

"Didn't respond in time" is the `TimeoutError` from `SkLink.request()`, so the failing step is HELLO in `handshake()`. MIDI, the switch and opening the port all worked.

## The trace

WAV Builder 4.3.2, same Mac, the port already granted. Since 4.3.1 WAV Builder retries a connect once on a `TimeoutError` (`withHelloRetry` in [usbSession.ts](../../src/lib/usb/usbSession.ts)) and logs the error's `detail`:

```
WAV Builder 4.3.2
Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36
status: connected

+0.00s connect · 2026-10-29T14:28:58.903Z
+0.08s no serial port granted to this site yet
+0.08s MIDI permission: granted
+0.70s MIDI ports: input "Spotykach" (connected), output "Spotykach" (connected)
+0.70s sending SysEx: enter transfer mode
+1.34s reply: OK
+1.34s waiting for the serial port
+2.13s serial connect 0483:5740
+2.35s opening the serial port and sending HELLO
+7.38s no answer to HELLO: TimeoutError: Spotykach didn't respond in time. (request 0x1 seq 1: 0 bytes pending), trying again
+7.38s serial port already granted to this site
+7.38s opening the serial port and sending HELLO
+10.25s HELLO: firmware 1.4.0, protocol 1.2
+10.42s connected
```

Windows 11, Chrome 156 (my PC), for comparison:

```
+1.94s serial connect 0483:5740
+2.13s opening the serial port and sending HELLO
+2.17s HELLO: firmware 1.4.0, protocol 1.2
```

The same user's first connect on WAV Builder went through the port picker (first-use grant) and its HELLO was answered. So were the Edge connects in the report, also after the picker.

## What it tells us

- **Nothing comes back from the first HELLO:** "0 bytes pending" for 5 s, not a partial or corrupt frame. Either the device never got the frame, or its reply never reached the host.
- **It isn't timing alone.** HELLO went out 0.22 s after the port appeared on the Mac and 0.19 s after on Windows, where it's answered in 40 ms. What the working cases share is a second open: after the timeout (close, reopen, HELLO), or after the port picker.
- **The retry works but is slow:** 5 s waiting for the first HELLO, then 2.9 s until the second is answered. The trace doesn't separate the reopen from the HELLO; `SkLink.open()` retrying every 250 ms while macOS releases the port would explain most of it.
- **"no serial port granted to this site yet" is misleading:** this connect used a granted port. The line comes from `grantedPort()` while the device is still in MIDI mode, when the port doesn't exist yet.

Open question: why the first frame after the first open is lost on macOS. A guess: the line state (DTR, line coding) that Chrome sets on open arrives while the CDC RX isn't armed yet, or the first OUT packet arrives before `SetReceiveCallback` in `Link::start()`. Not verified.

## Proposal for the package

In `handshake()`:

1. Send the first HELLO with a short timeout, ~1 s. A HELLO is normally answered within 40–200 ms.
2. On a `TimeoutError` with 0 bytes received, close the link, reopen the port and send HELLO again with the normal timeout. HELLO resets the session, so a second one is safe.

A Mac then connects in about 3 s instead of failing the first click (or taking 10 s with WAV Builder's workaround).

And for diagnostics:

- `web/index.html`: put a `TimeoutError`'s `detail` in Copy diagnostics, and log `navigator.serial` connect and disconnect events, like WAV Builder.
- `connect()`: change "no serial port granted to this site yet" to something like "no granted port present (yet)".

If the cause turns out to be in the firmware, the package retry can stay as a safety net.
