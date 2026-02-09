# Roadmap and bug tracking

For now I'm keeping a text file with the roadmap / feature ideas, and a bugtracking list here in this text file.

## bugs

- import issue loading on deck A failed, problem dissapeared on reboot

>Report by @Naenyn:
>"deck a loading happily now. I've noticed that one one file is bad and a load is attempted, that seems to kill that deck .. can no longer load anything until cycling power."


---

## new feature / new functions improvements ideas:

> I'd like to work on **export** and **history / trashcan** features first.


### Exporting / importing improvements

The current export functionality is a bit messy and could be improved.
We want to reorganize the import/export functionality.

A pop-up should appear when importing files, asking the user how to import the files.

It should inform the user they can import the whole content of the SK SD card, keeping the folder structure, or just a selection of files.

Before importing, the app should check if the files are already in the project and ask the user if they want to replace them.

The import modal should have a files from device or import files from SD card option. 

When the user ask to import a whole folder, the app checks the folder for the SK folder structure and as a standars imports them to the assigned slots, however before doing so the user can chack / uncheck the files and assign them to the unassigned pool.

Give the exported folders where applicable a name that is based on the date, in the future a project name could be added as well.

Number one priority is to make the SK folder structure and exported files adhere to the Spotykach firmware requirements.

SK/B/1.WAV
...
SK/Y/1.WAV
...
SK/G/1.WAV
...
SK/R/1.WAV
...
SK/P/1.WAV
...
SK/T/1.WAV
...



Export options should become a **modal** with the different options.

- **SD Card Export** - Spotykach file and folder structure
    - Straight to SD Card / Save for later upload
        - with option to also include the full project bundle
- **Files export**:
    - with or without SK folder structure
    - whereas file export does not rename and keeps the original file names
- **project bundle**
    - In all cases of project saving there should be an option to include/exclude version history files and sample pool files, this removing logic is is already going to be implemented in the project cleanup feature.
- **all exports should include a readme** with the available details in a human readable format.
    - when exports include files from the sample packs info about the pack and the appropriate licenses should be added to this readme

- Test the export functionality thoroughly by:
    - testing files on Spotykach
    - importing the exported files back into the app and checking if they are all there and correct.

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

### Project Manager
A dedicated interface for managing your local projects.
- **Save and load multiple projects** within the app with version history.
- **Cloud Sync?**
Optional integration with cloud storage (Google Drive/Dropbox) for project 

### Standalone Application
Make the app installable (PWA or Electron wrapper) for offline/desktop use.


### Rightclick context menu
For some places, like cardviews, with e.g. edit, remove from slot, remove from project, perma delete, move to tape x, move to tape y, etc., show file in browser panel


### Mobile Optimization
Improve touch targets and layout for tablet/phone usage.

**Touch support** / partially implemented
Needs further testing, but is functional on Android and Windows touchscreens.
- perhaps the editor should be made more touch friendly, e.g. larger buttons, more spacing between elements, etc.

