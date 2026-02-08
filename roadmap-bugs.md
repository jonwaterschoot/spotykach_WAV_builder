# Roadmap and bug tracking

For now I'm keeping a text file with the roadmap / feature ideas, and a bugtracking list here in this text file.

## bugs

Touch support

adding touch support added conflicts: 
- the cards new select yellow border box prevents clicking on the card's plus sign to load an import 
- the yellow select box should only activate upon selecting the circle selector in the top left corner
- if a slot is empty, the select option should not be there
- on Win touchscreen dragging works, yet on android it doesn't seem to work. when dragging one or multiple selected files nothing happens, no highlighting of the drop zone, no nothing. 


- import issue loading on deck A failed, problem dissapeared on reboot

>Report by @Naenyn:
>"deck a loading happily now. I've noticed that one one file is bad and a load is attempted, that seems to kill that deck .. can no longer load anything until cycling power."


---

## new feature / functions ideas:

- keep a temporary trashcan for removed files, with a button to restore them, this should be a separate feature from the project cleanup feature

- **Project cleanup feature**: option to clean up the project by removing all files that are not used in any tape, and an option to only keep the original file but not keep the unused history files, only the files saved to the pool

- undo / redo functionality for all actions > keep a history of actions and allow to undo/redo them
    - where to put the undo/redo buttons?
    - where to give access to a list of all actions? > maybe an icon opens a modal with a list of all actions and the possibility to undo/redo them
    - so e.g. if I delete a file, I can undo it, if I then normalize a file, I can undo it, etc.
    - a set of three icons: undo(arrow left), redo(arrow right), and a list of all actions(list icon with a clock)

- **rightclick context menu**
    - for some places, like cardviews, with e.g. edit, remove from slot, remove from project, perma delete, move to tape x, move to tape y, etc., show file in browser panel

### Exporting

- give the exported folders where applicable a name that is based on the date, in the future a project name could be added

- Export options should become a **modal** with the different options.
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


## tablet Android and iPad support

...

## Roadmap readme - keep a short list of thease in the README.md

Future ideas and planned features:
-   **Multi-Project Support**: Save and load multiple projects within the app with version history.
-   **Shared Sample Pool**: A centralized pool of samples shared across different projects.
-   **Project Manager**: A dedicated interface for managing your local projects.
-   **Standalone Application**: Make the app installable (PWA or Electron wrapper) for offline/desktop use.
-   **Mobile Optimization**: Improve touch targets and layout for tablet/phone usage.
-   **Cloud Sync**: Optional integration with cloud storage (Google Drive/Dropbox) for project 