# Roadmap and bug tracking

> This file tracks active roadmap ideas, feature requests, and a done/reviewed archive at the bottom.

---

## Active Roadmap

### Priority Features

- **Save project notes and comments per tape** (stored in `project.json`).
- **link a folder on your drive** and or build your unique library of samples in the app. 


---


TLDR; the app is a tool for creating and managing the samples on the Spotykach SD card. 
GO beyond the 6x6 grid and 36 slots. And store multiple projects on the SD card. Spotykach can only load one project at a time. Use the app to prepare the SD card with the desired project before inserting it into the Spotykach hardware.

The main restriction for the hardware is that it needs the files in a specific folder structure on the SD card. e.g. SK/B/1.WAV, SK/G/2.WAV, etc. in the root of the SD card, with the WAV files saved as 32-bit float files and allcaps filename extension. 

Hence it is not possible to just drag and drop files onto the SD card folders. You can use this app to prepare the SD card with the desired project before inserting it into the Spotykach hardware.

This WAV.builder web app is a tool for creating and managing the samples on the Spotykach SD card. 

Spotykach can load and save samples from the SD card. Files are stored in a specific folder structure on the SD card of 6 x 6 = 36 slots. 
6 tapes with 6 slots each. 
Each tape has 6 slots. 

The primary goal of this app is to help in converting samples from the user's computer to the Spotykach SD card. 

But it can also be used to organize the samples saved on the SD card via the Spotykach hardware. 

We organize our samples in projects. A project is a collection of tapes. A tape is a collection of 6 slots. Each slot can hold a sample. Each sample is a WAV file.
//



- **Editor & Tooling Overhaul**
    - **General UX & Workflow**
        - [x] **Clarify Destructive Workflow**: Help text in the editor panel explaining that edits save to the slot, not the original file.
        - [x] **Editor Start State**: Default to no active tool when opening the editor instead of the Trim tool.
        - [x] **Closing Flow**: 
            - Add a "Done" button after saving an edit to provide a clear exit path.
            - Prompt to save if leaving a tool with unsaved edits (except on "Reset").
        - [x] **History List**: 
            - Move to the **right side** of the editor panel.
            - Offer expanded vs. cleaner collapsed views.
            - Visual differentiation from main screen cards.
    - **Global Tool Behaviors**
        - [x] **Status Indicators**: 
            - Blinking dot only while editing; disappears after save.
            - Standardize "Dotted" indicator: ignore tools if no changes were made.
        - [x] **Reset Logic**: 
            - Standardize as "Reset Tool" button for all tools; performs an actual reset to the initial state; disabled if no changes.
    - **Specific Tool Enhancements**
        - [x] **Automation**: 
            - Snap to 0 dB while dragging (hold Alt for free movement); hide 0 dB line/points if nothing has changed.
        - [x] **Cutter Refinement**: 
            - Mark cut joint with a single red line in preview; "Tweak Cuts" button (replaces "Preview" after render) to return to edit state using temporary files.
        - [x] **Slicer Refinement**: 
            - Persistent state across different edits; lock slices toggle; snap to slices; option to show markers during other tools.

        - [x] **Project Cleanup**: Stabilized layout and height for the cleanup modal. Keep original files and purge unused history.

- **History & Trashcan** *(under consideration)*
    - Dedicated trashcan for deleted files with Restore capability.
    - Undo/Redo for editor actions (Normalize, etc.) — where to put the buttons?
    - A set of three icons: undo (arrow left), redo (arrow right), list of all actions (list icon with clock).

- **Right-Click Context Menu**
    - For card views: Edit, Remove from slot, Remove from project, Perma delete, Move to Tape X, Show file in browser panel.

- **SD Card: Prepare empty project**
    - Erase SD card — warn the user, compare current content (show which project is on it), confirm it's safe to delete.
    - Format SD card? Can we bypass the Windows 32 GB limit?

- [x] **SD Card Sync User Library**: Synchronize user library to SD card with selective import/mirroring options.

- **Offline Sample Packs**
    - Allow downloading GitHub sample packs instead of only streaming them.


- **Simplify / improve sync modals**

In general the sync modals are too complex. 
We have a modal for the project manager and a modal for the SD card import / build. 
They are too similar and confusing. Yet we need to keep the distinction between the two. 
Where applicable we should use the same UI patterns. 

    - options on top, options bottom bar, ... to be fixed.
    - perhaps putting the sync backup to be a standard background task, that is only shown when using a advanced sync view.
    - this could put more focus on the simple sync view and the process of building the SD card.
    - I'm thinking about a open project file list like in a more standard menu like 'recent files' in other apps.
    - Menu bar: File -> Open Project, File -> Save Project, File -> Save Project As
    - File -> Open Project -> list of recent projects
    - File -> Save Project -> save current project
    - File -> Save Project As -> save current project as new project

Project Manager:
info text explaining sync, the ? help modal currently reads:
Build vs. Sync
Build for SD exports your project into the hardware folder structure. Sync copies files between your work folder and the SD card. These are two different operations.

We'll update that text to read: 
Build for SD exports your project into the hardware folder structure. Sync copies a backup of the full project folder between your work folder and the SD card. These are two different operations.

Then we'll update the project manager to include this help text explainer.

The simplified sync view should show a shortlist

The active project should move to the top of the list in both views.

The simpler project view: 
- performing a sync of the active project to the SD card does not trigger the SK build process.
- the button should reflect this action, e.g. "Sync Project".
- for the project manager we can use a collapse / expand button to show / hide the advanced sync view. per project

#### General sync build:

local workfolder:
 - projects
 - sample library
 - sample packs (optional download from github)

SD card:
 - projects backupcopy
 - custom sample library copy = optional

in the SD card Root folder:
 - SK build triggers:
    - config.txt
    - project.json
    - sample library
    - not the sample packs (optional download from github)

A simplified sync view should perform default sync actions, while an advanced sync view should allow for more granular control.

ATM we have a project manager and a build sd modal, looking similar, doing partly the same things, but not exactly the same. 

Maybe we could keep the current advanced views, but by default just show the simple sync view, and hide the advanced view, until the user clicks on "advanced view".

Simple sync view: just gives a quick overview of what will be synced to the SD card, and a button to start the sync. A warning of what will be overwritten should be shown.

Advanced sync view for both project manager and SD import / build modals: 
- the current "advanced sync" view, but with a more clear layout and more streamlined options.
  - we have options on top, options at the bottom, let's unify those in a single options bar.
  - the sync backup could be a standard background task, that is only shwon when using a advanced sync view.


Current SD card import / build modal:
- on top checkbox config.txt
- on the bottom is "save hardcopy backup" checkbox
- on the bottom is Force overwrite checkbox.

This is confusing. Let's make it more clear.
- writing config txt, is default, only included in the overview list, not a checkbox
- hardcopy backup is unclear, let's not do this save to SD, only local:
    - it would make sense if one could easily read or move SK folders, but at the moment we can't do that on the hardware.
    - what we can do is make a hardcopy SK folder in the local project folder; we do this without user interaction, it's just a backup. When the project is saved, duplicated, etc, it should not trigger this action. The default action will by a pure copy of the build SD action. When a new build is performed, the old SK folder will be moved to a backup folder, with a timestamp.
    - in the Clean project modal, we should also have an option to clean up the SK folders. 
    - We also keep track of the maximum amount of timestamped SK folders to be kept. 5 is the default, when the limit is reached, the oldest timestamped SK folder will be removed.  
    - in advanced view we should have an option to manually remove timestamped SK folders, change the behaviour, a collapsed section. With the default being: saving a backup SK folder, and keeping the last 5 timestamped SK folders. Option to change the backup number and uncheck the copy SK folder option. 

- Force overwrite checkbox: 
    - Should be off by default, but explained more clearly:
    - default is:
        - trigger warning conflict, and ask user what to do. 
        - leave occupied slots on the sd card not present in the current project untouched. 
    - when checked: overwrite and keep untouched slots on the sd card not present in the current project. 
    - another option here should be to clear occupied slots on the sd card not present in the current project. 
    - these actions should trigger the correct (icon) changes in the overview list

- to avoid conflicts, save project should be performed before build SD card action. The user should be warned if the project has not been saved. But the simplified view should just show that by default the project will be saved first

- **import export projects** 
  - import from SDcard (the app is currently already scanning the SD card for projects)
  - import from (shared) zip file -> new option in the project manager
  - export to (shared) zip file -> new option in the project manager should trigger a download of the full current project folder as a zip file. This zip file should be named after the current project name.


- **Example project**
    - Add an example project to the app.
        - populate with some samples
        - make use of sample pack, (create new samples)
        - use tapes as categories, 3 files per tape
            - use the notes feature to clarify, 
                - notes per tape to add categories titles and explainer of the used samples.
                - general notes that describe the content of this project
        - categories: Textures, Percussion, Bass, ... (6 categories)
        - what's a good title for this example project?

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

- **Project Cleanup** — purge unused assets while maintaining layout stability.

- **Onboarding Tweaks** — bypass project manager, resume directly to tapes, and project title entry step.

- **config.txt** — integrated sync, download buttons, and MIDI start/stop control.

- **Slicer & Editor refinements** — persistent state, snapping, and UI layout optimizations.

- **Double-click sliders** to reset to zero/default value.
