# Roadmap and bug tracking

> This file tracks active roadmap ideas, feature requests, and a done/reviewed archive at the bottom.

---

## Active Roadmap

---

### Done / Reviewed (2026-03-25)

- [x] **Notification Overlap Fix**: Resolved issue where tool messages and "Edit Saved" notifications would overlap. Refactored to a vertical stacking system.
- [x] **Persistent Log Tracker**: 
    - Added `logger.ts` and `logs.txt` persistence in the work folder.
    - Added Log Viewer modal with filter and export features.
    - Replaced "Reset App" button with "Logs" button in the sidebar.

---

- **Project Manager** Draft

    - options on top, options bottom bar, ... to be streamlined.
    - I'm thinking about a open project file list like in a more standard menu like 'recent files' in other apps.
    - Menu bar: File -> Open Project, File -> Save Project, File -> Save Project As
    - File -> Open Project -> list of recent projects
    - File -> Save Project -> save current project
    - File -> Save Project As -> save current project as new project

info text explaining sync, the ? help modal currently reads:
Build vs. Sync
Build for SD exports your project into the hardware folder structure. Sync copies files between your work folder and the SD card. These are two different operations.

We'll update that text to read: 
Build for SD exports your project into the hardware folder structure. Sync copies a backup of the full project folder between your work folder and the SD card. These are two different operations.

----

### under consideration

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

### Long Term (not in scope for now)

- **Desktop App**: Electron/PWA wrapper for native File > Open/Save dialogs and fully offline use.
- **Cloud Sync**: Google Drive/Dropbox integration?
- **Simplified export-only tool**: Stripped-down version with no project management — open a file, convert, download. One file at a time.
- **Mobile Optimization**: Improved layout for tablets/phones. *(Not a priority given interface complexity.)*
    - Touch support: further testing, larger touch targets, Firefox drag-and-drop issues on Windows & Android.

---

