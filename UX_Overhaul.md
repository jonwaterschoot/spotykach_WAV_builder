# Spotykach UX Overhaul & Wireflow Roadmap

This document outlines the high-level wireflows, user journeys, and potential UX directions for the Spotykach app. The goal is to figure out the optimal user experience by sketching out how different types of users interact with the app.

> **This is the intent document — the *why*.** Personas, journeys and open UX thinking live here.
> The implementation plan built from it is [V4_PERVAK.md](V4_PERVAK.md) — phase checklist, decisions
> already locked, and the codebase analysis behind them. Start there for any build work.

## Design Direction
We have two main paths to consider for achieving the best UX:
1. **Iterative Molding:** Mold and adapt the existing UI elements to adhere to these new workflows.
2. **Ground-up Remake:** Redesign the interface from scratch, utilizing the existing app's core functionality but reimagining the presentation based on the varied user needs.

---

## Target User Personas & User Journeys

To ensure the app caters to its diverse audience, we need to design wireflows for several distinct user journeys:

1. **The Sample Browser** - Focuses on finding, previewing, and downloading samples without touching a project.
2. **The Hardware Configurator** - Focuses on quickly adjusting MIDI channels and device settings.
3. **The Audio Editor** - Focuses on dropping in a single file to tweak (trim, normalize) without getting bogged down by the 6x6 grid.
4. **The Power User** - Focuses on the full Project and Slot Manager, loading 36-file Sample Packs, and managing projects (creating, reloading, altering).


### 1. The Sample Browser (Sample Browsing & Custom Downloading)
- **Goal 1:** Browsing **individual samples**
  -Quickly find and download specific samples without needing to build a full project or interface with the 6x6 grid.
  - **Workflow:** 
    - Open app -> Navigate to Browser -> Search/Filter samples -> Select individual or grouped files -> Download/Export. option to download sorted files into a SK ready folder; or individual original files
- **Goal 2:** Browsing **(artist) sample packs**
  - Browse, listen to, download, without needing to load the full project workspace. A direct access for users outside the current editor and project manager modals.
  - **Workflow:**
    - Open app -> Navigate to Browser -> Browse Packs -> Search/Filter packs -> Select pack -> Download/Export. option to download sorted files into a SK ready folder; or individual original files

- **Key UX Need:** A streamlined browser view that doesn't force the user into the project management or slot management screens.

General option here to create a project in "power user" mode - which means the current project manager/slot manager workflow 

### 2. The Hardware Configurator (Device Settings & MIDI)
- **Goal:** Set up their physical Spotykach hardware to listen to specific MIDI channels and adjust other device-level configurations.
- **Workflow:** 
  - Open app -> Go directly to Settings/Config -> Adjust MIDI channels and device preferences -> Save/Export config to SD card.
- **Key UX Need:** A prominent, easy-to-access settings area that isn't buried underneath audio editing tools.
  - Consist of the current config.txt modal, option to save this config to a project, and import/export config file.

### 3. The Audio Editor (Single File Tweaking)
- **Goal:** Use the audio editing tools on single files without needing to engage with the full slot manager.
- **Workflow:** 
  - Open app -> Drag & Drop file (or select from browser) -> Open Audio Editor -> Trim, normalize, apply effects -> Save/Export.
- **Key UX Need:** An independent Audio Editor module or a way to bypass the 6x6 grid when only a single file needs processing.
- Accesible also from sample browser, edit file in editor without project, once there same simplified editor with simplified saave/axport options. (Option to save as a new project)

### 4. The Power User (Full Slot Manager)
- **Goal:** Build full banks of 36 samples, organize them meticulously, and prepare them for the hardware.
- **Workflow:** 
  - Open app -> Project Manager -> Create New/Load Project -> Browse Samples -> Map to 6x6 Grid -> Build & Export to SD.
- **Key UX Need:** A robust, drag-and-drop friendly 6x6 grid UI and clear visualization of all slots.
- Here, we do want a fully integrated view of all SK slots, projects, settings, and a way to move between them with ease.   
- config.txt is maybe not a necessity per project?

## Other UX thoughts

- Backups + Current flow for importing and exporting SD card is more complex
  - because we're making backups of of the projects as well, this both makes the process take longer and gives a layer of visual complexity to read as a user
  - We could give users the option to do this "blind" - without seeing what it does, or to trigger it manually.
- Cleaning of projects functionality is linked to this
  - option to clean a project was made from the need to get rid of the destructive workflow where each edit is saved as a new file. While keeping the original and e.g. a history can be beneficial, it does create a lot of files, so an option to "clean" - remove originals and backups - is a nice feature to have. This function should probably be its own tab or clearly separated. Atm we have a side bar on the right in the editor showing the history and a clening option.
---

## Project Management & Sample Packs

Project management is the core of the experience for Power Users and those working with predefined packs. The UX must handle the following smoothly:

### Core Project Actions
- **Create / Reload / Copy / Alter:** Users need a centralized Project Manager (potentially a "Recent Files" or "Dashboard" style view) to easily duplicate projects, alter them without destroying the original, or load previous setups.

### Sample Packs & Artist Integrations
- **Loading Packs:** Users should be able to load an entire existing Sample Pack directly into the 6x6 slots >> import from browser, where the (simple) browser opens within the current Project Manager.
- **Guest Artist Packs:** Guest artists will provide complete sets of 36 files. The UI should accommodate artists having *multiple* packs available.
- **UI Treatment:** A dedicated "Packs" section in the browser, showing cover art or artist info, with an "Import to Grid" button.

### Advanced Browser Actions
- **Batch Processing to Grid:** The browser must still handle individual files gracefully while offering bulk actions. For example, a user should be able to select multiple files and click "Send to Project", where the app automatically sorts them into the next available empty slots in the 6x6 grid.

---

## Next Steps for Wireframing
- [ ] Sketch the **"Home/Dashboard"** screen (deciding between starting in the Browser, the Editor, or a Project Hub based on user intent).
- [ ] Sketch the **"Independent Audio Editor"** view vs. the **"Slot Manager Editor"** view.
- [ ] Sketch the **"Browser to Grid"** batch workflow.
- [ ] Sketch the **"Guest Artist Pack"** discovery and loading flow.
