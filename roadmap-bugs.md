# Roadmap and bug tracking

For now I'm keeping a text file with the roadmap / feature ideas, and a bugtracking list here in this text file.

## bugs

Possibly solved with v 1.1.5
- pitch seems off after tweaking a sample with trim or normalize tool. Reported on OSX. One user with Chrome, another with Brave.
Is this related to the tweak we tried for eleminating the gap during loop playback?
---

- import issue loading on deck A failed, problem dissapeared on reboot

>Report by @Naenyn:
>"deck a loading happily now. I've noticed that one one file is bad and a load is attempted, that seems to kill that deck .. can no longer load anything until cycling power."


---

## new features / new functions / improvements / ideas:

### import / export
- version number in export readme file text not auto updating
- upon import as soon as we start checking the content of the folder , and immediatly when we start importing/reading the zip file we should show a progress, as now it can feel like nothing is happening after user clicks 

- conflict resolving: a (different) project is open in the browser, we import a project from sd card, we detect a conflict, what should happen? 

I suggest to build a comparison table with audio preview, to allow user to decide what to do with each file, this can be used in the other direction as well. This feature is best using terms like sync. It should show basic info about the files, like name, size, duration, and a preview of the audio.

- what data can we store in the files we rename to 1.WAV, 2.WAV, etc. and still want to keep their file history. What if it was recorded on SK and has no info, the user should be able to add a name and a description to the file, and this should be stored in the file or our index , and also in the project folder, in a separate file, e.g. project.json, or something similar. 
- export: when using export to SD card or separate export, use a comparison table with audio preview, to allow user to decide what to do with each file

- project backup: when exporting a project backup, and one is already made/present in the project folder, ask user what to do with it. - overwrite, rename, or cancel? Or we immediatly start implementing project backup v2 with the idea of using multiple projects? Still when it's the "same" project we need a way to distinguish between different versions of the project. 

### History / Trashcan
- Keep a temporary trashcan for removed files and an action history list, able to use ctrl+z / ctrl+y to undo/redo actions, and buttons in a main menu place?

- indexing (all) actions (how many actions should we keep in history? how to name them?)

- trashcan should be integrated, when throwing out a file we could undo even after using the full cleanup, or do we make this a clear destructive step.

- undo / redo functionality for all actions > keep a history of actions and allow to undo/redo them
    - where to put the undo/redo buttons?
    - where to give access to a list of all actions? > maybe an icon opens a modal with a list of all actions and the possibility to undo/redo them
    - so e.g. if I delete a file, I can undo it, if I then normalize a file, I can undo it, etc.
    - a set of three icons: undo(arrow left), redo(arrow right), and a list of all actions(list icon with a clock)

- **Project cleanup feature**: option to clean up the project by removing all files that are not used in any tape, and an option to only keep the original file but not keep the unused history files, only the files saved to the pool

### File handling
**Shared Sample Pool**: A centralized pool of samples shared across different projects. option to save files to the sample browser with descriptions and a way to export/download - should be clear that these live outside the project folder, but are not a part of the online browser, hence where do we store these? 
    - we make folder structure on the SD card: /SPOTYKACH_USER_SAMPLES/ and /SPOTYKACH_PROJECTS/ 
- unassigned samples in the sample browser should be clearly marked as such, and we should be able to assign them to a project, or delete them, or move them to the user samples folder 
- when saving a project or exporting we allow the user to select which files to include, and we show a preview of the files to be included, with the option to deselect them, remove, move to user samples, or keep in project folder, etc. 

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


### Automation tool
- snap to 0db while dragging, dragging with alt allows free movement

### UI improvements
- double clicking sliders to reset them to zero/standard value

### Audio Processor
- add 3 band EQ (automated)

### Slicer tool
A slicer tool with up to 32 slices
> about the slice points - we'll need to agree on convention. I'm thinking about CUE chunk of the header. Also the maximum number of slice points will be 32 - that's what Spotykach is prepared for.
> It would be also good to have this chunk prior to DATA chunk as currently once I find DATA, i'm not looking further.


### add info and meta data to WAV files
- add slicer tool + tempo (+ bpm detection)
- INFO chunk with tempo information

> We want to be able to make slices using the web-tool by @Jon Waterschoot and read those in the slice mode. In this case, start position should snap to the defined points instead of default 1/8th step.
> To transfer the slice points to the Spotykach we’ll use CUE chunk of the WAV file header as described in RIFF specification. Considering there’s only a single DATA chunk in the file, the structure of the CUE chunk will be fairly simple.

### Rightclick context menu
For some places, like cardviews, with e.g. edit, remove from slot, remove from project, perma delete, move to tape x, move to tape y, etc., show file in browser panel

### Mobile Optimization
Improve touch targets and layout for tablet/phone usage.

**Touch support** (Ongoing)
- Further testing needed on various devices.
- Editor UI improvements for touch (larger buttons, spacing).
- Firefox touch drag-and-drop issues (Windows & Android).

