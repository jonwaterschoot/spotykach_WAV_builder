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

Only send this once the diagnostics build is deployed: without it, step 5 has no "Copy diagnostics" button.

1. **Flash firmware 1.4.0 beta 2**, the same way as before. Download [spotykach_1.4.0.b2.bin](https://github.com/Synthux-Academy/Spotykach/releases/download/v1.4.0.b2/spotykach_1.4.0.b2.bin). Connect the rear USB-C port, hold Reset on the back for about 3 s until the lights under the bottom pads breathe white, and flash the file with the Daisy web programmer. b2 is b1 with only the version number corrected; it makes sure we both run the same build.
2. **Before testing:** close the Daisy web programmer tab and any app that uses MIDI (DAW, MIDI monitors). Unplug the Spotykach and plug it straight back into a USB port on the computer, not a hub. Let it start up and play as normal.
3. **Snapshot before connecting:** press Win+X, choose *Terminal* (or *Windows PowerShell*), paste the snippet below (it's one long line), press Enter and copy everything it prints. It only reads; nothing is changed, and no admin rights are needed.
4. **Connect:** open https://jonwaterschoot.github.io/spotykach_WAV_builder/#/studio?usb=1 in Chrome and reload it with Ctrl+Shift+R so you get the new build. The link opens Studio with USB transfer switched on (the same switch as Settings ▸ System ▸ USB transfer). Click **USB** in the header, next to Import / Build. That connects straight away and opens a window with the connection status. Note whether the rings on the Spotykach light up.
5. **Copy the diagnostics:** within about 30 s that window should stop with a message, and the step it stopped at, instead of spinning. Click "Copy diagnostics" in the window and paste the result. If it does connect, "Copy diagnostics" is next to Disconnect: paste that too, then close the window and try an upload with Import / Build.
   - If it still spins after 30 s, press F12 and open Console. Type `[usb]` in its Filter box, so only our lines are left, then select and copy those.
6. **Snapshot after:** without unplugging anything, run the same snippet again in the terminal (press the Up arrow, then Enter) and copy the output.
7. **If the rings stay lit** after all this, switch the Spotykach off and on to get it back to playing.

The snippet (PowerShell). Keep it on one line: a multi-line paste makes Windows Terminal ask "Paste anyway?" and leaves the last line waiting for another Enter.

```powershell
$os = Get-CimInstance Win32_OperatingSystem; "$($os.Caption) build $($os.BuildNumber)"; "Windows MIDI Service: " + $(try { (Get-Service midisrv -ErrorAction Stop).Status } catch { 'not installed' }); Get-PnpDevice | Where-Object { $_.InstanceId -match 'VID_0483' -or $_.FriendlyName -match 'Spotykach' } | ForEach-Object { [pscustomobject]@{ Status = $_.Status; Problem = $_.Problem; Class = $_.Class; Name = $_.FriendlyName; Driver = (Get-PnpDeviceProperty -InstanceId $_.InstanceId -KeyName DEVPKEY_Device_Service -ErrorAction SilentlyContinue).Data; Id = $_.InstanceId } } | Format-Table -AutoSize | Out-String -Width 220; "Zadig drivers:"; pnputil /enum-drivers | Select-String 'libwdi autogenerated'
```

What the two snapshots tell us (for us, not for Bay Mud):

- **Windows build and the MIDI service:** whether the machine runs Windows MIDI Services (`midisrv`), like my PC.
- **Every device Windows has seen for the Daisy's USB ID** (`0483`), and every Spotykach MIDI endpoint, present or not. For each: status, problem code, class and the driver it got.
  - In MIDI mode the Spotykach shows as `MEDIA` with driver `usbaudio` and status OK (checked on my PC, Oct 18), plus its MIDI endpoints. In transfer mode the same `5740` entry should turn into `Ports` with driver `usbser` and status OK.
  - A `5740` entry with `WinUSB` or `libusbK` as its driver means Zadig took over the serial port.
  - A problem code such as `CM_PROB_FAILED_START` (Code 10) means the driver didn't start, like the Simple Touch on my laptop.
  - Comparing the before and after snapshots shows whether the switch happened at all.
- **Zadig drivers:** which USB IDs Zadig made drivers for. `PID_DF11` (the bootloader) is normal. `PID_5740` is the suspect.

This replaces the Device Manager screenshots, `chrome://device-log` and the Zadig and `winver` questions of the earlier version. If the snapshots point somewhere specific, ask for those afterwards.

### Reference: a machine where it works (my PC, Oct 18, firmware b2)

Windows 11 Home build 26300, Windows MIDI Service running, Zadig drivers only for `PID_DF11`. The rows that matter (Daisy bootloader and Simple Touch rows left out):

MIDI mode (playing, before Connect):

```
OK      CM_PROB_NONE    MidiEndpoint   Spotykach                            SWD\MIDISRV\MIDIU_KSA_…
OK      CM_PROB_NONE    MEDIA          Spotykach                   usbaudio USB\VID_0483&PID_5740\336336683333
OK      CM_PROB_NONE    SoftwareDevice Spotykach                            SWD\MMDEVAPI\MIDIU_KSA_…_0_0
OK      CM_PROB_NONE    SoftwareDevice Spotykach                            SWD\MMDEVAPI\MIDIU_KSA_…_1_0
```

Transfer mode (connected in WAV Builder, rings lit):

```
Unknown CM_PROB_PHANTOM MidiEndpoint   Spotykach                            SWD\MIDISRV\MIDIU_KSA_…
OK      CM_PROB_NONE    Ports          Serieel USB-apparaat (COM5) usbser   USB\VID_0483&PID_5740\336336683333
Unknown CM_PROB_PHANTOM SoftwareDevice Spotykach                            SWD\MMDEVAPI\MIDIU_KSA_…_0_0
Unknown CM_PROB_PHANTOM SoftwareDevice Spotykach                            SWD\MMDEVAPI\MIDIU_KSA_…_1_0
```

The same entry (`5740` plus the device's serial number) switches from `MEDIA`/`usbaudio` to `Ports`/`usbser`, and the MIDI endpoints go absent. In the diagnostics for that connect, the device replied after 0.22 s, its MIDI ports went at 0.30 s, and the serial port appeared at 1.47 s (all counted from sending the SysEx).

How to read Bay Mud's output against this:

- **Still `MEDIA`/`usbaudio` after Connect (rings lit or not):** Windows didn't switch drivers, or the device didn't switch.
- **`Ports` with a problem code:** `usbser` was picked but didn't start.
- **`5740` with `WinUSB` or `libusbK`:** Zadig's driver.
- **No `MEDIA` row at all in MIDI mode, only MIDI endpoints:** a different MIDI setup from mine. Compare the Windows MIDI Service line.
