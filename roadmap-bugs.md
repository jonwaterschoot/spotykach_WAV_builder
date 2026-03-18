# Roadmap and bug tracking

> This file tracks active roadmap ideas, feature requests, and a done/reviewed archive at the bottom.

---

## Active Roadmap

### Priority Features

- **Onboarding**
    - Make an extra step explaining what a "project" is, ask to set a project name, then go straight into the tapes view instead of the project manager.
    - A project is the ..., tapes are ... and contain 6 slots ...

- **Editor UX**
    - Confusion about the destructive workflow — make it clearer to users.
    - After an edit is saved to the slot, add a "Done" button to close the editor instead of only the X in the top corner.
    - History list: offer expanded view vs. cleaner collapsed list; differentiate more from the cards in the main screen's left column.
    - **Automation tool**: snap to 0 dB while dragging; hold Alt to allow free movement.

- **Project Cleanup**
    - Option to clean up the project: remove all files not used in any tape, keep only the original file and not unused history files.
    - *(Full Undo/Redo history is considered too complex to implement properly. Cleanup is the priority.)*

- **History & Trashcan** *(under consideration)*
    - Dedicated trashcan for deleted files with Restore capability.
    - Undo/Redo for editor actions (Normalize, etc.) — where to put the buttons?
    - A set of three icons: undo (arrow left), redo (arrow right), list of all actions (list icon with clock).

- **Right-Click Context Menu**
    - For card views: Edit, Remove from slot, Remove from project, Perma delete, Move to Tape X, Show file in browser panel.

- **SD Card: Prepare empty project**
    - Erase SD card — warn the user, compare current content (show which project is on it), confirm it's safe to delete.
    - Format SD card? Can we bypass the Windows 32 GB limit?

- **config.txt download**
    - Option to download the config.txt and send it straight to the SD card without a full sync.

- **Sync User Library**
    - Option to sync the user library to the SD card the same way projects are synced. Keep an eye on available SD card space. *(Almost done — needs final testing.)*

- **Offline Sample Packs**
    - Allow downloading GitHub sample packs instead of only streaming them.

---

### Long Term

- **Desktop App**: Electron/PWA wrapper for native File > Open/Save dialogs and fully offline use.
- **Cloud Sync**: Google Drive/Dropbox integration?
- **Simplified export-only tool**: Stripped-down version with no project management — open a file, convert, download. One file at a time.
- **Mobile Optimization**: Improved layout for tablets/phones. *(Not a priority given interface complexity.)*
    - Touch support: further testing, larger touch targets, Firefox drag-and-drop issues on Windows & Android.

---

## Done / Reviewed

- **Waveform Editor tools**
    - **EQ**: 3-band EQ implemented; 10-band advanced EQ also added.
    - **Limiter**: Auto and peak limiter added.
    - **Cutter**: Option to cut files and remove parts (merge pieces with crossfade).
    - **Slicer**: Up to 32 slices with keyboard/MIDI auditioning. *(Not yet implemented on Spotykach hardware.)*
        - Slice points written to the CUE chunk of the WAV file header (per spec from Vlad).
        - Maximum 32 slice points. CUE chunk placed before DATA chunk.

- **config.txt** — integrated and synced with the project.
    ```
    mid_ch_a   // MIDI channel deck A: 1–16
    mid_ch_b   // MIDI channel deck B: 1–16
    mid_ps_a   // MIDI Start/Stop deck A: 0/1
    mid_ps_b   // MIDI Start/Stop deck B: 0/1
    ```
    File lives at `SK/config.txt`. Setting name is 8 chars, value on next line, newline by `\n`.

- **WAV file metadata** — INFO chunk with tempo info; CUE chunk for slice points (collaboration with Vlad).

- **Notes tool** — Notes per project and per tape, saved in `project.json`.

- **Rename files** — Change title via right-click in browser panel, double-click on title, editor panel, or single tape view.

- **User Sample Pool & Library**
    - Users can build a personal sample library independent of any project.
    - Sample browser has a "My Library" section with Project Samples and Main User Library.
    - Library Manager: overview of assigned/unassigned samples, copy to library, set title/license/artist name.

- **Double-click sliders** to reset to zero/default value.
