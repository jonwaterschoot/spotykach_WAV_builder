# Plan: one way into Import / Build, SD and USB as info

Oct 18, 2026 · Jon · to do before Bay Mud's retest (see `debugging_serialnotstarting.md`), so the steps we send match the site.

## Problem

With USB transfer on, Studio's header has two controls for the same job:

- **SD | USB switch** (`openCardRoute()` in `src/App.tsx`). It sets the route, connects USB straight away, and opens `CardRouteDialog`, which offers Build to the card, Import into this project, Import into a new project, Choose slots… and, for an empty project, the whole card into it.
- **Import / Build** (`handleOpenSyncModal('push')`). It opens the Build & Import modal (`ExportPreviewModal`), which has Build SD / Import SD tabs and its own Card reader | USB bar (`CardSourceBar`) with Connect, Authorise port and Disconnect.

Users can't tell which one to click to upload, build or import. Both have the actions, and connecting can happen in either.

## Target

- **Import / Build is the only way in to building and importing.** Whatever the route dialog offered either moves into the Build & Import modal or is dropped.
- **Clicking SD or USB picks the route and opens an info dialog, with no build or import actions.** It may still connect, because that's part of picking the route.
  - **USB dialog:**
    - Connection status: connecting, connected (firmware, free space, slots in use), the error with its step, Authorise port, Try again, Disconnect, Copy diagnostics.
    - What USB reaches: the 36 slot files only. `config.txt`, `README.md` (the notes), `SK/project.json`, the project copy and the SK backup need the card reader. A preset's `config.txt` settings don't reach the device over USB.
    - Cables and ports: a good data cable straight into a USB-A port, no hubs, front USB-C ports can be half speed.
    - Transfer mode: the rings light up and audio is muted until you disconnect (or press Play A/B on the device).
    - Windows: close apps that hold the Spotykach MIDI port.
    - Speed: about 35 s per full slot each way. For a full rebuild the card reader is faster.
    - If it doesn't connect: what each error means, and what to try (another port, close MIDI apps, power cycle if the rings stay lit, Copy diagnostics).
    - A one-line pointer: "Build and import with Import / Build."
  - **SD dialog:**
    - Status: whether a card folder is picked and reachable (name, slots in use), or missing (re-checked every 2 s, as now), or none picked.
    - Pick card (or Change card): **pick the card itself, not a folder on it** (the drive root that holds `SK`).
    - A short formatting note: FAT32, with cards over 32 GB needing a tool, linking to the Formatting Guide in Help.
    - The same pointer to Import / Build.
- **One source for the info text.** The USB list in `CardSourceBar`'s "?" panel and the dialog say the same things. Put the info in one component (for example `UsbRouteInfo` / `ReaderRouteInfo`) used by both, so they can't drift apart.

## Steps

1. **Move the route dialog's actions into the Build & Import modal**, or decide to drop them:
   - "Import into a new project" (whole card, no review) and "Choose slots…": `importCardIntoNewProject(true | false)` in `App.tsx`. Suggestion: an "Into a new project…" choice on the modal's Import SD tab.
   - The empty-project shortcut (`importWholeCardHere`, preset `import_merge_project`): can be applied automatically when the modal opens on Import with an empty project, as `startFromCardRoute('import')` already does.
   - "Build to the card" and "Import into this project" are already the modal's two tabs, so nothing to move.
2. **Turn `CardRouteDialog` into the info dialog:**
   - Remove `onBuild`, `onImportHere`, `onImportWholeHere`, `onImportWholeNew`, `onChooseSlotsNew` and the "What do you want to do?" section.
   - Keep the status block, Connect / Authorise / Try again, Copy diagnostics and Pick card.
   - Add Disconnect while connected.
   - Add the info sections above.
   - Consider renaming it, for example `CardRouteInfoDialog`.
3. **Share the info text** between the dialog and `CardSourceBar`'s help panel. Also give the reader side a "?" panel in the modal, which has none today.
4. **Clean up `App.tsx`:**
   - Remove `startFromCardRoute` and `importWholeCardHere`, or move them to wherever step 1 puts them.
   - Check that `openCardRoute` still connects USB on the click (the port picker needs that click).
   - Remove the `usbSlots` effect if the dialog no longer shows the slot count. Suggestion: keep it, it shows the card is readable.
5. **Help text:**
   - Update `AboutHelpModal.tsx`'s USB Transfer section to the new flow (the "Studio: switch the card to USB in the header, then build…" paragraph).
   - Point the firmware link to b2, here and in `USB_FIRMWARE` in `src/lib/usb/flag.ts` (both still point to `v.1.4.0.b1`).
6. **Mangler (`src/mangler/ui/CardDialog.tsx`):** that dialog is a send action, so it keeps its own route choice. Check that its USB status, errors and Copy diagnostics match the new info dialog, and reuse the info component for its help if it fits.
7. **Bay Mud's retest steps** (`debugging_serialnotstarting.md`, step 3 and 4): change them to the new flow. Clicking USB connects and shows the status, and Copy diagnostics sits in that dialog.

## Open questions

- **With USB transfer off,** the header shows only "Import / Build SD" (when a card folder is picked) and no SD button. Should the SD info dialog be reachable without USB too, since the formatting note and "pick the card itself" help everyone? Suggestion: yes, but as a separate small step, not part of this change.
- **Does clicking SD or USB while the Build & Import modal is open** change the route there too? It does today, through `handleCardSourceChange`. Keep it.
- **Where "Into a new project" lives:** in the modal's Import tab (suggested), or in the Project menu as "New project from card".

## Done when

- The header has one place to build or import, and the SD and USB dialogs have no build or import buttons.
- USB: click USB → it connects → the dialog shows the status and info → close → Import / Build works over USB.
- SD: click SD → the dialog shows whether the card is there and lets you pick it → Import / Build works with the reader.
- Import into a new project (whole card, and choose slots) still works from its new place.
- `npx tsc -b` and `npx eslint` pass, and the steps above have been run once in the dev server with the Spotykach on b2.

## Status (Oct 18)

Steps 1–7 are in the code. What went where:

- `CardRouteDialog` is now `CardRouteInfoDialog`: status, Connect / Authorise / Try again / Disconnect, Copy diagnostics, Pick / Change card, the info, and the pointer to Import / Build.
- The info text lives in `CardRouteInfo.tsx` (`UsbRouteInfo`, `ReaderRouteInfo`). The dialog, the modal's "?" panel (now on both routes) and the Mangler's card dialog all use it.
- "Into a new project" (Whole card, Choose slots…) is on the modal's Import tab.
- Import / Build opens on Import with "Merge into project" when the project is empty. The no-review "whole card into this empty project" is gone: that preset plus Apply does the same.
- A failed connect also says which step it stopped at (`UsbState.step`).
- The firmware links point to b2 (`USB_FIRMWARE`).

Still to do: the dev-server run with the Spotykach on b2. The USB-off SD dialog (first open question) is not part of this change.
