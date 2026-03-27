# Roadmap and bug tracking

> This file tracks active roadmap ideas, feature requests, and a done/reviewed archive at the bottom.

---

## Active Roadmap

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

### under consideration


---
- **Project Manager** Draft

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

- **Centralized Library Sync (v3.4.0)**: Migrated sync logic and modal to `App.tsx` for a unified experience across the app.
- **Loop Tool Finalization (v3.4.0)**: Added discard protection, auto-reset state, and a Preview/Edit toggle.
- **Playback Mutual Exclusion (v3.4.0)**: Prevented overlapping audio by stopping one playback stream when another starts.
- **SHA-256 Content Hashing (v3.3.0)**: Replaced size-only sync comparison with accurate bit-for-bit hashing.
- **Persistent Log Tracker (v3.3.1)**: Implemented `logs.txt` persistence and a dedicated Log Viewer modal.
- **SD Import Presets (v3.3.0)**: Standardized import workflows with selectable presets.
- **Notification Stacking (v3.3.1)**: Refactored toasts to stack vertically, preventing UI overlap.
