# Debugging: transfer mode not starting

Oct 18, 2026 · Jon · Bay Mud's report on Discord (night of Oct 15–16), plus a related serial problem on my laptop.

## Bay Mud's report

- **Setup:** Windows 11, Chrome (up to date), Spotykach on firmware 1.4 beta. Bay Mud had just flashed it with the Daisy web programmer and had installed Zadig earlier for Daisy updates.
- **Symptom:** On the official page (synthux-academy.github.io/Spotykach), the spinner on "Switching to transfer mode" never stopped. WAV Builder and Mangler (USB turned on in settings) did the same. MIDI permission was granted, and Chrome never showed a serial-port picker. The console showed no errors.
- **Ruled out:**
  - Cables: USB C-to-A and C-to-C, both known data cables.
  - Restarting Chrome, and restarting the PC.
  - Other apps: only Chrome and Discord were open.
  - Site permissions: reset several times, nothing blocked. Resetting flash.daisy's permissions made that site ask again, but that permission is separate.
  - The USB connection itself: on the same computer, the Daisy web programmer and the Synthux firmware uploader both detect and flash the device. Flashing goes through the DFU bootloader (`0483:DF11`, WebUSB, the WinUSB driver from Zadig), though, so it doesn't exercise the two paths transfer mode needs: USB MIDI (`usbaudio`) and the serial port (`usbser`, `0483:5740`).
- **Unknown:**
  - whether the rings lit up (the device in transfer mode);
  - what Device Manager shows while it's stuck;
  - which device Zadig was used on;
  - the Windows build.
- **Status:** Bay Mud is using the SD card for now and is willing to test again.

## Related: Simple Touch serial on my laptop

The firmware is different (a Daisy Seed build on Simple Touch, printing over serial to a Pd patch). It shows up on Windows as the same kind of device, a Daisy CDC serial port with ID `0483:5740`.

- Flashing works.
- Device Manager shows "USB Serial Device (COM15)" with **Code 10** ("This device cannot start"). PowerShell says COM15 doesn't exist, so Windows never provides a usable port.
- VS Code and the Arduino IDE both fail to open it. Other cables and ports, a restart and Zadig didn't help.
- The same board and firmware work on the PC.
- Not tried yet: uninstalling the device in Device Manager, and updating Windows or the USB controller drivers.

## Findings so far

- **The endless spinner points at Web MIDI, not serial.** In `@synthuxacademy/spotykach-transfer`, every step after the MIDI step gives up on its own:
  - the SysEx request: at most 2 s + 3 s, then "didn't respond";
  - waiting for the port: 2.5 s, after which Chrome shows the port picker or the app shows "Authorise port";
  - HELLO: 5 s.

  Only `requestMIDIAccess` and the MIDI ports' `open()` have no timeout. A hang there also explains why the console stayed clean.
- **The device has one USB identity in both modes.** MIDI mode and transfer mode use the same `0483:5740` and the same serial number, so Windows swaps the driver on every switch (`usbaudio` ↔ `usbser`). On the PC, the Spotykach's device was last reinstalled on Oct 16 at 05:42, during the chat. Starting `usbser` for `0483:5740` is exactly what fails on the laptop.
- **Zadig on the PC is only bound to the bootloader** (`0483:DF11`), which is harmless. If Zadig were bound to `0483:5740`, no COM port would appear.

- **The firmware betas differ only in their version string.** `v1.4.0.b2` (Oct 14) is `v.1.4.0.b1` plus PR #14, which changes only `kFirmwareVersion`. In HELLO, b1 reports `1.3.1` and b2 reports `1.4.0.b2`. My test device reports `1.3.1`, so it runs b1, which works the same as b2 for this bug.

## Laptop test (Oct 18)

After a reboot, with the Spotykach connected:

1. MIDIberry lists the device as "Spotykach".
2. Mangler on the deployed WAV Builder connected and uploaded a file. Chrome showed the usual port picker, and connecting and disconnecting both worked.

**Result:** transfer mode works on the laptop. The laptop's Windows can start `usbser` for `0483:5740` for the Spotykach, so the Simple Touch's Code 10 is specific to that board or its firmware, not the laptop. Each board's serial number gives it its own entry in Device Manager, and that firmware has its own USB descriptors. The Simple Touch problem is probably unrelated to Bay Mud's, and we can't reproduce Bay Mud's problem here.

## Next

1. **Done (Oct 18, not yet deployed):** the spinner can't run forever any more.
   - `src/lib/usb/tracedConnect.ts` follows the package's `connect()` step by step and logs each step as `[usb] …` in the console.
   - Steps that could hang now have a time limit: MIDI access 8 s (none while a permission prompt is open), switching 10 s, port open + HELLO 15 s.
   - It also logs the MIDI SysEx permission, the Spotykach MIDI ports and their states, the serial ports already granted to the site, and serial connect/disconnect events.
   - If the switching step times out after the Spotykach MIDI port has disappeared, the device did switch, so it carries on and waits for the serial port.
   - After a failure, "Copy diagnostics" copies the app version, browser and the timed steps (`usbSession.diagnostics()`, or `skUsb.diagnostics()` in the console).
2. My own device is on b2 (Oct 18), and the dry run of the steps below passed.
3. SD and USB controls made clear (Oct 18, see `card-route-ui-plan.md`), and the steps below updated to match. Still to do: deploy, then send them to Bay Mud.
4. Optional, separately: the Simple Touch's Code 10 on the laptop. Remove its stale `5740` entry (`pnputil /remove-device`), plug it back in, and read the end of `C:\Windows\INF\setupapi.dev.log`.
## Retest steps for Bay Mud

Only send this once the diagnostics build is deployed: without it, step 4 has no "Copy diagnostics" button.

1. **Flash firmware 1.4.0 beta 2**, the same way as before. Download [spotykach_1.4.0.b2.bin](https://github.com/Synthux-Academy/Spotykach/releases/download/v1.4.0.b2/spotykach_1.4.0.b2.bin). Connect the rear USB-C port, hold Reset on the back for about 3 s until the lights under the bottom pads breathe white, and flash the file with the Daisy web programmer. b2 is b1 with only the version number corrected; it makes sure we both run the same build.
2. **Before testing:** close the Daisy web programmer tab and any app that uses MIDI (DAW, MIDI monitors). Unplug the Spotykach and plug it straight back into a USB port on the computer, not a hub.
3. **Connect:** open https://jonwaterschoot.github.io/spotykach_WAV_builder/#/studio?usb=1 in Chrome and reload it with Ctrl+Shift+R so you get the new build. The link opens Studio with USB transfer switched on (the same switch as Settings ▸ System ▸ USB transfer). Click **USB** in the header, next to Import / Build. That connects straight away and opens a window with the connection status. Note whether the rings on the Spotykach light up.
4. **Copy the diagnostics:** within about 30 s that window should stop with a message, and the step it stopped at, instead of spinning. Click "Copy diagnostics" in the window and paste the result. If it does connect, "Copy diagnostics" is next to Disconnect: paste that too, then close the window and try an upload with Import / Build.
   - If it still spins after 30 s, press F12 and open Console. Type `[usb]` in its Filter box, so only our lines are left, then select and copy those.
5. **Device Manager**, while it's stuck or right after: Win+X ▸ Device Manager ▸ View ▸ Show hidden devices. Screenshot these sections expanded: *Sound, video and game controllers*, *Ports (COM & LPT)*, *Universal Serial Bus devices* and *Universal Serial Bus controllers*. Any entry with a yellow mark: double-click it and copy the text under "Device status".
6. **Chrome's device log:** open `chrome://device-log` in a new tab right after an attempt and copy what's there.
7. **Two questions:**
   - Which device did you pick in Zadig, and which driver did you install (WinUSB, libusb…)?
   - Your Windows version: press Win+R, type `winver`, and send the line with the build number.
8. **If the rings stay lit** after all this, switch the Spotykach off and on to get it back to playing.
