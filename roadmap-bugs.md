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

### Priority Features
- **Editor Improvements** 
    - **Audio Processor**:
        - add 3 band EQ (automated)
        - add limiter
    - **Cutting tool**:
        - Option to cut files and remove parts in the file (merge peices with fade, i'd rather not get into multiple tracks territory)
    - **Slicer tool**:
        - A slicer tool with up to 32 slices - to be implemented in furture SK firmware.
- **History & Trashcan**:
    - Dedicated trashcan for deleted files with Restore capability.
    - Undo/Redo for editor actions (Normalize, etc.).
    - cleanup of unused files in project (only keep original files, not history files)
- **Right-Click Context Menu**:
    - For quick actions (Edit, Move, Delete) on cards.

### Long Term

- **Desktop App**: Electron/PWA wrapper for offline use.
- **Cloud Sync**: Google Drive/Dropbox integration?
- **Mobile Optimization**: improved layout for tablets/phones.

----



# new features / new functions / improvements / ideas:

## prepare SD card for Spotykach with an empty project 
- Erase SD card - easy step , but we must warn the user that this will erase the SD card, compare what the current content is (which project, tell them it's safe to delete)
- format SD card ? can we do what Windows cannot (32GB limit) ? 

### Sync User Library ( almost done, need to check if it works properly)

Option to sync the user library to the SD card in the same way as the projects are synced. Though we must keep an eye on available space on the SD card. 

### Option to download sample packs from github

  **Offline Sample Packs**
    - [ ] **Download vs Stream**: Allow downloading GitHub sample packs 
    
---

## History / Trashcan

- Keep a temporary trashcan for removed files and an action history list, able to use ctrl+z / ctrl+y to undo/redo actions, and buttons in a main menu place?

- indexing (all) actions (how many actions should we keep in history? how to name them?)

- trashcan should be integrated, when throwing out a file we could undo even after using the full cleanup, or do we make this a clear destructive step.

- undo / redo functionality for all actions > keep a history of actions and allow to undo/redo them
    - where to put the undo/redo buttons?
    - where to give access to a list of all actions? > maybe an icon opens a modal with a list of all actions and the possibility to undo/redo them
    - so e.g. if I delete a file, I can undo it, if I then normalize a file, I can undo it, etc.
    - a set of three icons: undo(arrow left), redo(arrow right), and a list of all actions(list icon with a clock)

## Project cleanup feature
- option to clean up the project by removing all files that are not used in any tape, and an option to only keep the original file but not keep the unused history files, only the files saved to the pool

## Simplified editor / export to SD card only tool 

Option for people who do not want the syncing/project management features

A simplified version of the tool that only allows editing and exporting to a folder, without the syncing/project management features. This could be a separate tool, or a mode in the current tool.
- probably best quite literally a stripped down version of the current tool, with no project management features, and no syncing features, just the editor and the export to folder option
- on a 1 file per time base, easy access to just opening a file and doing the conversion to the needed output, user will only need to set the number, they can manually put it in the desired folder, or even just click download which moves it to standard downloads folder.

---



## Editor Improvements

### Automation tool
- snap to 0db while dragging, dragging with alt allows free movement

### UI improvements
- double clicking sliders to reset them to zero/standard value

### Audio Processor
- add 3 band EQ (automated)
- add limiter

### Cutting tool
- Option to cut files and remove parts in the file (merge peices with fade, i'd rather not get into multiple tracks territory)

### Slicer tool
A slicer tool with up to 32 slices
> about the slice points - we'll need to agree on convention. I'm thinking about CUE chunk of the header. Also the maximum number of slice points will be 32 - that's what Spotykach is prepared for.
> It would be also good to have this chunk prior to DATA chunk as currently once I find DATA, i'm not looking further.

## add info and meta data to  WAV files and project
- There will be a config file for spotykach which it will read for settings
- Wave files will have info and meta data written to them, slice info will be written to the CUE chunk of the header

### WAV file info

/ check what gets saved how to link w spotykach
- to do in colab with Vlad in terms of writing this info to header
- add slicer tool + tempo (+ bpm detection)
- INFO chunk with tempo information

> We want to be able to make slices using the web-tool by @Jon Waterschoot and read those in the slice mode. In this case, start position should snap to the defined points instead of default 1/8th step.
> To transfer the slice points to the Spotykach we’ll use CUE chunk of the WAV file header as described in RIFF specification. Considering there’s only a single DATA chunk in the file, the structure of the CUE chunk will be fairly simple.

### Spotykach config file config.txt

The file name is config.txt
Sitting on the root of SK.
The value is on the next line below the name.
Setting name is 8 chars. ASCII alphanumeric + underscores.
Setting value is 4 bytes. Numeric. Booleans as 0/1.
Newline by \n.

So far 3 settings are there:
mid_ch_a //MIDI channel deck A: 1...16
mid_ch_b //MIDI channel deck B: 1...16
mid_play //Whether MIDI Start/Stop respected: 0/1

Example file: public\config_examples\config.txt

```txt  
mid_ch_a
15

mid_ch_b
16

mid_play
1
```

## Standalone Application (Electron)
*   Wrap the app in Electron for native "File > Open/Save" dialogs.
*   completely offline mode, no connection to the internet needed


## other UI improvements

### Rightclick context menu
For some places, like cardviews, with e.g. edit, remove from slot, remove from project, perma delete, move to tape x, move to tape y, etc., show file in browser panel

### Mobile Optimization

As the interface has gotten more and more complex I'm not sure if this is still a realistic goal. 

Improve touch targets and layout for tablet/phone usage.

**Touch support** (Ongoing)

- Further testing needed on various devices.
- Editor UI improvements for touch (larger buttons, spacing).
- Firefox touch drag-and-drop issues (Windows & Android).

---

vvvvvvvv -- Done -- vvvvvvvv

## Notes tool (done)
- option to add notes to projects
- option to add notes to tapes
- add this summary into the readme of the project

## Change title of files (done)
- option to change the title of files (title and File Name? must check with id system)
action can be done by right clicking the file in the file browser panel, and by double clicking the title.
- can also be performed in the editor panel
- and in the single tape view. 


## User Sample Pool & Libraries (done)

Goal: Allow users to create their own "sample packs" and use them in all projects. Build a separate user sample pool that is not tied to any project. - this is the foundation for the "My Samples" tab in the sample browser.

### Sample Pack Browser will have this extra section after the built in sample packs: (done)

        Available Packs
        * Synthux Horror Sample Pack 2025
        * Jonwtr Explorations 
        * My Library
            - *Projects Samples* - standard collapsed
                - Option to open a section that shows all the projects samples in a dry expandable list (only samples from slots and unassigned, not the versions)
            - *Main User Library* is the users Curated List of samples 

### My Library Manager (done)    

    - A link in My Library opens the sample library manager:
        - user can get an overview of all the current files in the current project:
            - one section with the unassigned samples from the current active project
            - one section with the assigned samples from the current active project
            - The samples can be expanded to see the versions of the samples 
                - it is here that the user can copy individual samples to the user library.
                - option to set (new) title (only used in the new assigned user library, original files are not touched)
        - option to set a general licence and user / artist name for the User Library, standard assigned to each sample, can be changed on an individual level. (If the option ever comes that users share projects, the readme's will be able to use this info. This hooks into our already used system where we look at the license of the Sample packs.) 

