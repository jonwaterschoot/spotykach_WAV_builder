# Roadmap and bug tracking

For now I'm keeping a text file with the roadmap / feature ideas, and a bugtracking list here in this text file.

## bugs

- when hovering a playing card in the file browser panel the card flickers between states, this in turn seems to make it harder to click the stop button
- the kalimba samples from jonwtr are rendering an import error, probably due to the file name containing special characters, check this, and fix it, and build in a rename function for files in the file browser when files with special characters are detected, and give a warning to the user.

- import issue loading on deck A failed ?
Report by @Naenyn:
"deck a loading happily now. I've noticed that one one file is bad and a load is attempted, that seems to kill that deck .. can no longer load anything until cycling power."

--

## new feature / functions ideas:

- clicking the tape icon and title of the tape in the all tapes view should open that specific tape view
- Add a function that detects when duplicates have been assigned to tape slots, and give a warning to the user.
    - could be done by marking them with a border and a small icon in the top right corner of the tape card
    - and a text box in the top of the screen that says "duplicates detected" with a button to remove them
- give the exported zip file a name that is based on the date, in the future a project name could be added

--

## tablet Android and iPad support

- the app should be optimized for tablet use with mobile browsers:
    - Android Chrome seemed to work well, but it did not allow drag and drop of files, not responsive to touch
    - adding drag and drop support for tablets, touch is not working yet
    - file support handling: to research how to handle files on android and ios devices
       - what happens with the local file system when the app is "installed" on a device?
       - 

## Roadmap readme - keep a short list of thease in the README.md

Future ideas and planned features:
-   **Multi-Project Support**: Save and load multiple projects within the app with version history.
-   **Shared Sample Pool**: A centralized pool of samples shared across different projects.
-   **Project Manager**: A dedicated interface for managing your local projects.
-   **Standalone Application**: Make the app installable (PWA or Electron wrapper) for offline/desktop use.
-   **Mobile Optimization**: Improve touch targets and layout for tablet/phone usage.
-   **Cloud Sync**: Optional integration with cloud storage (Google Drive/Dropbox) for project 