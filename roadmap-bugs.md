# Roadmap and bug tracking

> This file tracks active roadmap ideas, feature requests, and a done/reviewed archive at the bottom.

---

WAV.builder: Add an option to import new files only into the pool without without touching / changing any files (acts as an “import‑only preset”).

Import workflow: When using the "Import / Build SD" button, make the distinction between Import and Build actions clearer and more visually separated.

Editor: 
- Stereo splitting: expand with a better preview of both channels and option to audit / preview both.
  - add an option to automate stereofield.
  - widen / narrow 
  - mono the bass
  - Option to merge / mix files (new tool? Mixer?)

---


SD card and workfolder changing location accessibility

Quick fix: add location to where the label "change" is in the project manager modal. ► change to "Change Location"

- next option: under the settings icon, add location settings for SD card and working folder.

---

## My library manager:
- default view is first tab Upload
  - upload tab: add a short info block about that this is your local library. Files stored here are copied into the workspace, note that you could also add folders outside the workspace from local drives, curated library allows to build a custom set for yourself that you like to reuse on Spotykach.

## onboarding and news section

### for newcomers: expand onboarding section
  - after clicking the start new setup button, the first screen should show a welcome screen where users ccan quickly see what the wizard will do; when creating the first project they can choose to create a blank project or use a preset. (currinetly only one preset: the Hainbach project organized by jonwtr, we'll create another with mixed samples from other packs and leave free spaces open for user customization, Hainbach pack is all 36 slots occupied)

Create a way that shows newcomers a quick live tutorial (not a video. something interactive that steps through the app and explains the features).

## Active Roadmap

---

### under consideration

- allow to add image to projects - could be useful for visual ident of projects , and as the cover used when shared as a preset; by already incorporating it in the sample manager we can integrate it upfront.

---
- **Project Manager** Draft

- This was the initial plan, but I already have tweaked the menu to some degree to make it more user friendly.
- Added a workspace changing option in the opening page

    - options on top, options bottom bar, ... to be streamlined.
    - I'm thinking about a open project file list like in a more standard menu like 'recent files' in other apps.
    - Menu bar: File -> Open Project, File -> Save Project, File -> Save Project As
    - File -> Open Project -> list of recent projects
    - File -> Save Project -> save current project
    - File -> Save Project As -> save current project as new project

- **History & Trashcan** *(under consideration)*
    - Dedicated trashcan for deleted files with Restore capability.
    - Undo/Redo for editor actions (Normalize, etc.) — where to put the buttons?
    - A set of three icons: undo (arrow left), redo (arrow right), list of all actions (list icon with clock).

- **Right-Click Context Menu**
    - For card views: Edit, Remove from slot, Remove from project, Perma delete, Move to Tape X, Show file in browser panel.

- **SD Card: Prepare empty project**
    - Erase SD card — warn the user, compare current content (show which project is on it), confirm it's safe to delete.
    - Format SD card? Can we bypass the Windows 32 GB limit?

- **Offline Sample Packs**
    - Allow downloading GitHub sample packs instead of only streaming them.

---

### Long Term (not in scope for now)

- **Desktop App**: Electron/PWA wrapper for native File > Open/Save dialogs and fully offline use.
- **Cloud Sync**: Google Drive/Dropbox integration?
- **Simplified export-only tool**: Stripped-down version with no project management — open a file, convert, download. One file at a time.
- **Mobile Optimization**: Improved layout for tablets/phones. *(Not a priority given interface complexity.)*
    - Touch support: further testing, larger touch targets, Firefox drag-and-drop issues on Windows & Android.

---

---

## Done / Reviewed

