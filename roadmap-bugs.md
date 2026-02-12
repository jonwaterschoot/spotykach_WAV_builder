# Roadmap and bug tracking

For now I'm keeping a text file with the roadmap / feature ideas, and a bugtracking list here in this text file.

## bugs

- import issue loading on deck A failed, problem dissapeared on reboot

>Report by @Naenyn:
>"deck a loading happily now. I've noticed that one one file is bad and a load is attempted, that seems to kill that deck .. can no longer load anything until cycling power."


---

## new feature / new functions improvements ideas:






### History / Trashcan
Keep a temporary trashcan for removed files and history list, with a button to restore them, this should be a separate feature from the project cleanup feature.

- **Project cleanup feature**: option to clean up the project by removing all files that are not used in any tape, and an option to only keep the original file but not keep the unused history files, only the files saved to the pool

- undo / redo functionality for all actions > keep a history of actions and allow to undo/redo them
    - where to put the undo/redo buttons?
    - where to give access to a list of all actions? > maybe an icon opens a modal with a list of all actions and the possibility to undo/redo them
    - so e.g. if I delete a file, I can undo it, if I then normalize a file, I can undo it, etc.
    - a set of three icons: undo(arrow left), redo(arrow right), and a list of all actions(list icon with a clock)

___

### File handling
**Shared Sample Pool**: A centralized pool of samples shared across different projects.

### Project Manager & Data Persistence

Currently, the app uses **IndexedDB** for storage. Resetting the app wipes this data. We need a more robust solution.

**Phase 1: Internal Project Manager (Web-Friendly)**
*   Store *multiple* projects in IndexedDB (e.g., "Techno Set", "Ambient Jams").
*   Allow instant switching between projects.
*   "Backup All" feature to download a single file containing all local projects.

**Phase 2: Standalone Application (Electron)**
*   Wrap the app in Electron for native "File > Open/Save" dialogs.
*   Direct file system access (no storage limits, drag-and-drop to specific folders).
*   Best for power users.



### Rightclick context menu
For some places, like cardviews, with e.g. edit, remove from slot, remove from project, perma delete, move to tape x, move to tape y, etc., show file in browser panel


### Mobile Optimization
Improve touch targets and layout for tablet/phone usage.

**Touch support** (Ongoing)
- Further testing needed on various devices.
- Editor UI improvements for touch (larger buttons, spacing).
- Firefox touch drag-and-drop issues (Windows & Android).

