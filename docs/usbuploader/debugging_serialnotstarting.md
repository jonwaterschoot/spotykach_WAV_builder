# Debugging: transfer mode not starting

Oct 18, 2026 · Jon · Bay Mud's report on Discord (night of Oct 15–16).

**Status (Oct 21):** round 1 is in: Chrome's `requestMIDIAccess()` never returns on Bay Mud's PC, so the Spotykach is never asked to switch (see [Results](#results)). Round 2 is sent, results pending. The package fixes are open as PRs on Synthux's `uploader` branch: [#16](https://github.com/Synthux-Academy/Spotykach/pull/16) (time limits) and [#17](https://github.com/Synthux-Academy/Spotykach/pull/17) (diagnostics), see [Vlad's package and page](#vlads-package-and-page-web-on-the-synthux-uploader-branch).

## The report

- **Setup:** Windows 11, Chrome, Spotykach on firmware 1.4 beta, Zadig installed earlier for Daisy updates.
- **Symptom:** in Bay Mud's words, it "seems to be stuck" on "Switching to transfer mode" and "doesn't move from" there, on the official page (synthux-academy.github.io/Spotykach) and in WAV Builder and Mangler alike. MIDI permission was granted, Chrome never asked for the serial port, and the console showed no errors. How long Bay Mud waited isn't known.
- **Ruled out:** cables (C-to-A and C-to-C data cables), restarting Chrome and the PC, other apps (only Chrome and Discord open), site permissions (reset, nothing blocked).
- **Flashing works on that computer** (Daisy web programmer, Synthux uploader). That only proves the cable and port: flashing uses the DFU bootloader (`0483:DF11`, WebUSB, Zadig's WinUSB driver). Transfer mode needs two other paths: USB MIDI (`usbaudio`) for the switch, and the serial port (`usbser`) for the transfer.

## What we know

- **If it stayed on "Switching" for more than about 8 s, Web MIDI hung.** In `@synthuxacademy/spotykach-transfer` (and WAV Builder before 4.2.2), the reply wait gives up after 5 s with an error, and a missing port ends in the port picker or "Authorise port" 2.5 s later. Only `requestMIDIAccess()` and the MIDI ports' `open()` have no time limit, and a hang there leaves the console clean. Confirmed on Oct 20: the time limit fired at "MIDI access" (round 1).
- **The Spotykach is one Windows device that changes driver.** MIDI mode and transfer mode use the same `0483:5740` and serial number, so on every switch Windows swaps `usbaudio` for `usbser` on the same device entry (see the reference below). A machine where that swap fails would end at the serial step (an empty port picker, "Authorise port" or an error), not on "Switching".
- **Zadig is harmless when it's only on the bootloader** (`PID_DF11`). On `PID_5740` it would take the serial port away from `usbser`.
- **b1 and b2 are the same firmware.** `v1.4.0.b2` only corrects the version string (PR #14): b1 reports `1.3.1` in HELLO, b2 reports `1.4.0.b2`.
- **Not reproduced here:** the PC and the laptop both connect normally on b2.

## What the app does since 4.2.2

- `src/lib/usb/tracedConnect.ts` runs the package's connect steps itself, with time limits where they could hang: MIDI access 8 s (none while a permission prompt is open), switching 10 s, port open + HELLO 15 s. A failure names its step.
- Each step is logged as `[usb] …` in the console with its timing, including the MIDI permission, the Spotykach MIDI ports, the granted serial ports and serial connect events.
- *Copy diagnostics* (in the USB window, and wherever a USB error shows) copies the app version, browser and the timed steps. In the console: `skUsb.diagnostics()`.
- Since 4.2.3, the trace also records how a connection ended (Disconnect in the app, or the device or cable), a MIDI access that comes or fails after the time limit ("MIDI access came late, after N s" / "failed late"), and when the diagnostics were copied. A late line from an earlier attempt stays out of a newer trace.
- **Keep in step with the package:** `tracedConnect.ts` follows `connect()` and `authorizePort()` of `@synthuxacademy/spotykach-transfer` 1.0.1. When the package is updated, compare its connect steps and update ours to match.

## The message to send (round 1)

Written for Bay Mud (Oct 18). It also works as it is for anyone else with the same problem.

---

Hey! WAV Builder now records each step of the USB connection, so we can see exactly where it stops on your machine. When you have time:

**1. Firmware:** no need to reflash. Beta 1 and beta 2 run the same code (b2 only fixes the version number it reports), and the diagnostics show which one you have.

**2.** Close the Daisy programmer tab and anything that uses MIDI. Unplug the Spotykach, plug it straight into the computer (no hub), and let it start up as normal.

**3. Snapshot before.** Win+X ▸ *Terminal* (or *Windows PowerShell*), paste this one line, press Enter, and copy everything it prints. It only reads, it changes nothing, and it doesn't need admin rights:
```powershell
$os = Get-CimInstance Win32_OperatingSystem; "$($os.Caption) build $($os.BuildNumber)"; "Windows MIDI Service: " + $(try { (Get-Service midisrv -ErrorAction Stop).Status } catch { 'not installed' }); Get-PnpDevice | Where-Object { $_.InstanceId -match 'VID_0483' -or $_.FriendlyName -match 'Spotykach' } | ForEach-Object { [pscustomobject]@{ Status = $_.Status; Problem = $_.Problem; Class = $_.Class; Name = $_.FriendlyName; Driver = (Get-PnpDeviceProperty -InstanceId $_.InstanceId -KeyName DEVPKEY_Device_Service -ErrorAction SilentlyContinue).Data; Id = $_.InstanceId } } | Format-Table -AutoSize | Out-String -Width 220; "Zadig drivers:"; pnputil /enum-drivers | Select-String 'libwdi autogenerated'
```

**4. Connect.** Open https://jonwaterschoot.github.io/spotykach_WAV_builder/#/studio?usb=1 in Chrome and press **Ctrl+Shift+R** to load the new version (it should say 4.2.2). Click **USB** in the header, next to Import / Build. That connects straight away and opens a window with the status. Do the rings light up?

**5. Copy diagnostics.** Within about 30 s the window should stop with a message instead of spinning. Click **Copy diagnostics** and paste it here. If it connects, paste it anyway, then close the window and try an upload with Import / Build.
If it still spins after 30 s: F12 ▸ Console, type `[usb]` in the Filter box, and copy what's left.

**6. Snapshot after.** Without unplugging anything, go back to the terminal, press the Up arrow and Enter, and copy the output again.

**7.** If the rings stay lit afterwards, power-cycle the Spotykach.

If you're curious what we're looking for, the whole write-up is here: https://github.com/jonwaterschoot/spotykach_WAV_builder/blob/main/docs/usbuploader/debugging_serialnotstarting.md

Thanks a lot!

---

Notes on the message:

- The snippet has to stay on one line. A multi-line paste makes Windows Terminal ask "Paste anyway?" and leaves the last line waiting for another Enter.
- It uses plain `Get-PnpDevice`. `-PresentOnly:$false` returns only absent devices, so it hides the connected Spotykach.
- `?usb=1` turns USB transfer on and is remembered in that browser (`?usb=0` turns it off).

## Reading the results

A machine where it works (my PC, Oct 18, firmware b2): Windows 11 Home 26H2 build 26300, Windows MIDI Service running, Zadig drivers only for `PID_DF11`. Chrome and Edge both connect (Edge checked Oct 20).

My MIDI setup is not a plain Windows install, so it can differ from a tester's:

- **Windows MIDI Services App SDK Runtime and Tools 1.0.14-rc.1**, installed by hand on Mar 30, 2026 (Runtime, App SDK Runtime, Console, Settings app, PowerShell). Only the service (`midisrv`) is part of Windows: Microsoft has been switching it on in phases for 24H2 and 25H2 since Feb 2026. The SDK Runtime and Tools are a separate download. Chrome's Web MIDI uses the older Windows MIDI APIs, which go through the service, so it shouldn't need the SDK. That isn't verified.
- **Other MIDI software:** loopMIDI / teVirtualMIDI (with `loopMIDIBlockLegacy` and `rtpMIDIBlockLegacy`), the Midihub CDC driver and editor, and the GM DLS extension.

The snippet's Spotykach rows:

MIDI mode (before Connect):

```
OK      CM_PROB_NONE    MidiEndpoint   Spotykach                            SWD\MIDISRV\MIDIU_KSA_…
OK      CM_PROB_NONE    MEDIA          Spotykach                   usbaudio USB\VID_0483&PID_5740\336336683333
OK      CM_PROB_NONE    SoftwareDevice Spotykach                            SWD\MMDEVAPI\MIDIU_KSA_…_0_0
OK      CM_PROB_NONE    SoftwareDevice Spotykach                            SWD\MMDEVAPI\MIDIU_KSA_…_1_0
```

Transfer mode (connected, rings lit):

```
Unknown CM_PROB_PHANTOM MidiEndpoint   Spotykach                            SWD\MIDISRV\MIDIU_KSA_…
OK      CM_PROB_NONE    Ports          Serieel USB-apparaat (COM5) usbser   USB\VID_0483&PID_5740\336336683333
Unknown CM_PROB_PHANTOM SoftwareDevice Spotykach                            SWD\MMDEVAPI\MIDIU_KSA_…_0_0
Unknown CM_PROB_PHANTOM SoftwareDevice Spotykach                            SWD\MMDEVAPI\MIDIU_KSA_…_1_0
```

Its diagnostics, counted from sending the SysEx: the device replies after about 0.2 s, its MIDI ports go at about 0.3 s, and the serial port appears at about 1.2–1.5 s. Sometimes the reply is lost when the MIDI port goes first; the connect then waits out the 2 s reply timer and still succeeds.

## Possible outcomes

The test doesn't fix anything by itself. It tells us which of these cases we're in, so we can send one concrete fix instead of all of them.

| What the results show | Most likely cause | What we'd do |
|---|---|---|
| **It connects normally** | Something temporary: a stuck MIDI state, cleared by the replug or a restart | Nothing. If it ever stalls again, the time limits make it stop with a named step instead of staying on "Switching". |
| **Diagnostics stop at "MIDI access" or "Switching to transfer mode"**, the rings stay dark | Chrome can't reach the Spotykach's MIDI port: Windows MIDI Services, or another app holding the port | Find out whether it's Chrome, the Spotykach or the PC's MIDI setup: Edge, Chrome with the Spotykach unplugged, a list of MIDI software (round 2). Then see [Possible fixes](#possible-fixes). |
| **Rings light and the MIDI port goes, but no serial port.** The after snapshot still shows `MEDIA`/`usbaudio`, or `Ports` with a problem code such as `CM_PROB_FAILED_START` (Code 10) | Windows doesn't swap the driver properly on the Spotykach's one device entry | Remove the Spotykach's device entries (`pnputil /remove-device <id>` in an admin terminal, or Device Manager ▸ Uninstall device) and plug it back in. |
| **`5740` with `WinUSB` or `libusbK`, or `PID_5740` under "Zadig drivers"** | Zadig took the serial port | In Device Manager, uninstall that device with "Delete the driver" ticked and plug it back in, or use Zadig to put "USB Serial (CDC)" back on it. |
| **The serial port opens but HELLO fails** (the trace stops after "opening serial port") | Firmware or protocol | Report to Synthux with the trace. |
| **No `MEDIA` row in MIDI mode, or "Windows MIDI Service: not installed"** | A different MIDI setup from mine | Not a fault by itself; it helps explain the second row. |

## Results

### Round 1 (Bay Mud, Oct 20)

Windows 11 Home 25H2 build 26200, Chrome 155, WAV Builder 4.2.2. The rings stayed orange (normal reel mode) the whole time.

```
+0.00s connect
+0.34s serial ports granted to this site: none
+0.34s MIDI SysEx permission: granted
+8.35s MIDI access timed out
```

The before and after snapshots are identical. The Spotykach rows (IDs shortened) match my MIDI mode:

```
OK      CM_PROB_NONE    MidiEndpoint   Spotykach                            SWD\MIDISRV\MIDIU_KSA_…
OK      CM_PROB_NONE    MEDIA          Spotykach                   usbaudio USB\VID_0483&PID_5740\336F…
OK      CM_PROB_NONE    SoftwareDevice Spotykach                            SWD\MMDEVAPI\MIDIU_KSA_…_0_0
OK      CM_PROB_NONE    SoftwareDevice Spotykach                            SWD\MMDEVAPI\MIDIU_KSA_…_1_0
```

Phantom rows: the Daisy Bootloader and the STM32 DFU (flashing), a `COM16` (`usbser`) from another `5740` device with a different serial number, an older `5740` "USB Audio Device", and an unrelated `0483:A4D9` "RECODER". Zadig is only on `PID_DF11`.

What this tells us:

- **Second row of "Possible outcomes".** `requestMIDIAccess()` didn't settle within 8 s, with the permission already granted, so no prompt was waiting. No SysEx was sent, so the rings couldn't change. The original "stuck on Switching" was this same call: the package and the official page have no time limit on it, and their status says "Switching to transfer mode…" from the click on.
- **Windows sees the Spotykach as a working MIDI device.** So the problem lies between the browser and the Windows MIDI stack, not in the USB or driver layer.
- **Ruled out:** Zadig, the driver swap, HELLO and the firmware (none of them were reached), and `usbser` on that PC (COM16 worked once).
- **It has probably never worked on that PC:** his Spotykach's serial number has no phantom `Ports` row.
- **Not known yet:** whether it is Chrome or the whole PC, whether it needs the Spotykach plugged in, and whether MIDI access is slow or never comes. His MIDI setup may also differ from mine: a different Windows release, and maybe no SDK Runtime or virtual MIDI drivers.

## Round 2: the message to send

Written for Bay Mud (Oct 20). The three checks split the cases in [Possible fixes](#possible-fixes): Edge separates Chrome from the PC, unplugging separates the Spotykach from the PC's other MIDI devices, and the list shows what else is in the MIDI stack.

---

Thanks, that's exactly what we needed! It narrows it down a lot. Chrome never gets access to MIDI, so the Spotykach is never even asked to switch, which is why the rings stay orange. Your USB drivers and Zadig look fine. My setup (where it works) has some extra MIDI software that yours may not have, so here are three short checks to find out whether it's Chrome, the Spotykach or something else on the PC:

**1. Edge, Spotykach plugged in.** Open https://jonwaterschoot.github.io/spotykach_WAV_builder/#/studio?usb=1 in **Microsoft Edge**, click **USB** and allow MIDI when Edge asks. Click **Copy diagnostics** and paste it here. If it connects, you can use Edge for transfers for now. Close the window afterwards, and power-cycle the Spotykach if the rings stay lit.

**2. Chrome, Spotykach unplugged.** Unplug the Spotykach, open the same page in Chrome and click **USB**. Either a port picker opens (just close it) or the MIDI error comes back. Copy the diagnostics either way.

If you get the MIDI error in either check, wait about 30 seconds before you click **Copy diagnostics**. It then also shows whether MIDI access came late or never came.

**3. MIDI software.** In the terminal like last time, paste this one line and copy what it prints. It only reads: it lists installed programs with "MIDI" in their name and the names of your audio and MIDI devices, nothing else.
```powershell
"MIDI software:"; Get-ItemProperty HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*, HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*, HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\* -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -match 'MIDI' } | Sort-Object DisplayName -Unique | Format-Table DisplayName, DisplayVersion -AutoSize | Out-String -Width 200; "MIDI and audio devices:"; Get-PnpDevice -PresentOnly -Class MEDIA, MidiEndpoint -ErrorAction SilentlyContinue | Sort-Object Class, FriendlyName | Format-Table Class, Status, FriendlyName -AutoSize | Out-String -Width 200
```

So you know what you're sharing: the diagnostics hold the WAV Builder version, your browser version and the names of the MIDI ports the browser sees. Nothing needs admin rights, and there are no settings to change.

Thanks again!

---

Notes on the message:

- **Left out on purpose:** console code to paste (it's a habit people shouldn't learn, and the app's diagnostics already cover it), admin commands, driver changes, Chrome flags, and restarting the MIDI service or the PC (he already restarted the PC before round 1). All of that waits until a row below calls for it.
- **With the Spotykach unplugged,** a working MIDI access lists the browser's MIDI ports. The connect then finds no Spotykach port and opens the port picker, because the click still counts.
- **Send it once the late-MIDI logging is live.** Before that, the 30 s wait shows nothing new.
- **Snippet 3** shows names and versions only: no device IDs or serial numbers, no user or computer names. Tested on my PC (Oct 20).

## Possible fixes

### By outcome of round 2

| Edge | Chrome, unplugged | Most likely | On his side | On ours |
|---|---|---|---|---|
| Connects | (any) | Chrome only: his Chrome install or version | Use Edge for transfers for now. Update Chrome; try a new Chrome profile. | Add "try Edge" to the MIDI error. If it keeps happening, report to Chromium with both traces. |
| Times out | Times out too | The PC's MIDI stack: a MIDI driver or program from snippet 3, or Windows MIDI Services on 25H2 | Quit, then uninstall, the suspect MIDI software one at a time; run Windows Update. | Compare snippet 3 with my list. If it points at the in-box service, report it to the Windows MIDI Services GitHub with both traces. |
| Times out | Picker opens (MIDI works) | The Spotykach's own MIDI entry on his PC | Remove the Spotykach's device entries (Device Manager ▸ Uninstall device, or `pnputil /remove-device` as admin), then plug it back in. | None needed. |
| Connects | Picker opens | Something temporary, gone now | Nothing. | None needed. |

### WAV Builder

- **Hints in the MIDI access error:** "try Edge" and "close MIDI apps", plus whatever round 2 shows works. Also a short troubleshooting part in the USB window.
- **Record a late MIDI access:** done (Oct 20, in 4.2.3). A `requestMIDIAccess()` that settles after the 8 s limit adds "MIDI access came late, after N s" to the trace. The copied diagnostics end with "diagnostics copied", so no late line before it means nothing had come by then.
- **A switch that keeps going after its time limit:** `within()` stops waiting, but the package's `enterTransferMode()` keeps running. If its MIDI access comes late, it still sends the SysEx, and the Spotykach goes into transfer mode with nobody waiting (rings lit for up to a minute). Seen in a local test with an artificial 12 s MIDI delay (Oct 20). Harmless when MIDI access never comes, as on Bay Mud's PC. Fixed by #16: with the time limit inside the package, a late MIDI access sends nothing.
- **Once the package release has #16 and #17:** replace most of `tracedConnect.ts` with `connect({ onStep })` and `authorizePort({ onStep })`. Keep only what the package leaves out: the serial connect events and how a connection ended. Until then, keep `tracedConnect.ts` in step with the package (see above).

### Vlad's package and page (`web/` on the Synthux `uploader` branch)

Vlad read the proposal [below](#for-vlad-connect-diagnostics) and asked for PRs (Oct 21). Both target `uploader`, are tested in Node with a fake Web MIDI, and are not yet tried on the device:

- **[#16](https://github.com/Synthux-Academy/Spotykach/pull/16), the bug fix:** in `enterTransferMode()`, MIDI access gives up after 8 s (not while the permission prompt is open) and opening the MIDI ports after 5 s, each with an error that names the step. `index.html` then shows an error instead of "Switching to transfer mode…" forever.
- **[#17](https://github.com/Synthux-Academy/Spotykach/pull/17), the diagnostics** (builds on #16): an optional `onStep` on `connect()`, `authorizePort()`, `enterTransferMode()` and `handshake()`, with the step lines only, plus `[spotykach]` console lines and "Copy diagnostics" on the page's connect error.
- **Not needed now:** a separate USB identity for transfer mode in the firmware. That was only for the third row of "Possible outcomes", which didn't happen.

## For Vlad: connect diagnostics

Written for Vlad (Oct 20). Kept as the reasoning behind #16 and #17.

---

**Problem.** When `connect()` stalls, `web/index.html` shows "Switching to transfer mode…" and the console stays clean, so neither the user nor we can tell which step stopped. One Windows user was stuck there on the official page, in WAV Builder and in Mangler.

**What WAV Builder does since 4.2.2** ([tracedConnect.ts](../../src/lib/usb/tracedConnect.ts)). It runs the package's `connect()` steps in the same order with three additions. The first round of diagnostics showed the hang was in `requestMIDIAccess()`, before any SysEx was sent.

1. **Time limits** on the browser calls that have none of their own:
   - MIDI access: 8 s, with no limit while the permission prompt is open.
   - Switching (MIDI `open()` plus the reply): 10 s.
   - Serial port open plus HELLO: 15 s.

   A timeout names its step ("The browser didn't give access to MIDI within 8 s").
2. **One line per step,** timed from the click:
   - the serial ports already granted (VID:PID)
   - the MIDI permission state
   - the MIDI ports found (name, state)
   - SysEx sent, then the reply or the MIDI port disappearing
   - serial `connect`/`disconnect` events, the port wait and the picker
   - port open and HELLO (firmware, protocol)
   - how the connection ended: a Disconnect click, or the device or cable

   Each line also goes to the console with a prefix (`[usb]` for us; `[spotykach]` would match the package's own warnings).
3. **A "Copy diagnostics" button** next to the error. It copies the app version, the user agent and the lines.

**Suggested shape for the package.** An optional callback, e.g. `connect({ onStep: line => … })` and `authorizePort({ onStep })`, that changes nothing for callers who don't pass it. The time limits belong in the package. The log and the button belong in the page.

**Privacy.** Port names and VID:PID only: Web Serial doesn't expose serial numbers, and no file names are included. Nothing is sent anywhere; the user copies the text and pastes it into a report.

---

## Side issue: Simple Touch on my laptop

A different firmware (a Daisy Seed build on Simple Touch, printing over serial to a Pd patch) shows up as "USB Serial Device (COM15)" with Code 10 on the laptop, while the same board works on the PC. Cables, ports, a restart and Zadig didn't help. The Spotykach connects fine on that laptop, so it's not the laptop's serial driver in general, and probably unrelated to Bay Mud's problem. To try sometime: remove that board's `5740` entry (`pnputil /remove-device <id>`), plug it back in, and read the end of `C:\Windows\INF\setupapi.dev.log`.
