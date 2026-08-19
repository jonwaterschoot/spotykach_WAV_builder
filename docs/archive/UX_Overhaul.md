# Spotykach UX Overhaul & Wireflow Roadmap

This document outlines the high-level wireflows, user journeys, and potential UX directions for the Spotykach app. The goal is to figure out the optimal user experience by sketching out how different types of users interact with the app.

> **🗄️ Archived 2026-08-19, when v4 shipped.** Everything this document asked for is built, and the app
> was walked door by door afterwards. **It is the record of the intent, not a live list** — what is still
> open lives in [roadmap-bugs.md](../../roadmap-bugs.md), and what shipped is in
> [CHANGELOG.md](../../CHANGELOG.md).
>
> **This is the intent document — the *why*.** Personas, journeys and the UX thinking behind v4 live
> here. The implementation plan built from it is [V4_PERVAK.md](V4_PERVAK.md) — phase checklist,
> decisions already locked, and the codebase analysis behind them.

> **Status, 2026-08-18 — where this document and the built app disagree.** Phases 0–6 are in, Phase 7's
> code is in, and nine of the ten test rounds are closed. Each disagreement below is settled; none of
> them is work waiting to be done.
>
> - **Four personas, five doors.** The hub ships Browse, **Preset → SD**, Device Config, Edit One File
>   and Studio. Preset → SD became the headline flow and has no persona written for it below.
> - **§"Other UX thoughts" on backups is answered in full.** ✅ A default build writes `SK/` and nothing
>   else (Phase 4), and Phase 7 took the controls off the screen as well: the Project Manager is one
>   list of projects with a card *read* path, and "backup" is one explicit act with a location picked
>   every time. The two halves of the complaint — it takes longer, and it is visually complex — are both
>   closed.
> - **§"Other UX thoughts" on cleaning projects is answered.** Persisted history is now exactly two
>   versions, original + current, collapsed on save — so the mess no longer accumulates and cleanup
>   stopped being a rescue operation. It also left the editor's right-hand sidebar and became its own
>   entry under Project ▸ Advanced, which is the separation asked for below.
> - **§4's "config.txt is maybe not a necessity per project?"** — answered: device-scoped by default,
>   per-project still allowed.
> - **The four wireframing boxes at the bottom are closed as built, 2026-08-18.** ✅ Three shipped
>   without ever being sketched, and drawing them now would be documenting backwards — the
>   Home/Dashboard box *is* the five-door hub, the browser-to-grid box *is* the temporary pool, and the
>   guest-artist box was answered in writing by
>   [docs/presets-samples/submission-workflow.md](../presets-samples/submission-workflow.md). The
>   fourth — independent editor vs Studio's tape editor — is not a drawing debt either: it is a question
>   the editor round answers by walking the component with a project behind it, and it lives there in
>   [roadmap-bugs.md](../../roadmap-bugs.md). **Nothing in this document is open.**
> - **Preset → SD has no persona here**, and is not getting one. It became the headline flow — a cold
>   start to a curated card — and writing a persona for something already built and verified would be
>   documenting backwards. Recorded as discrepancy 1 in [V4_PERVAK.md](V4_PERVAK.md).

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

> ✅ **Closed as built, 2026-08-18.** All four are settled — three by what shipped, one by a written
> answer. No sketch is owed on any of them: drawing a screen that has already been built and walked
> would be documenting backwards, the same reason Preset → SD is not getting a persona. The one live
> question underneath these boxes — how the two editor hosts should differ — is carried by the editor
> round in [roadmap-bugs.md](../../roadmap-bugs.md), not by a wireframe.

- [x] Sketch the **"Home/Dashboard"** screen (deciding between starting in the Browser, the Editor, or a Project Hub based on user intent).
      *Shipped unsketched as the hub — five doors with hash routing, news inline beneath them.*
      **Closed as built.** The decision this box existed to make — Browser, Editor or Project Hub — was
      made and shipped: all of them, behind a hub.
- [x] Sketch the **"Independent Audio Editor"** view vs. the **"Slot Manager Editor"** view.
      *Shipped unsketched as `#/editor` and Studio's tape editor — the same `WaveformEditor` in two
      hosts, with different exits. **Closed as a wireframe.** The live half — how the two hosts should
      actually differ — is the editor round's to answer, since that round is the first time the
      component is walked with a project behind it. Tracked there, in
      [roadmap-bugs.md](../../roadmap-bugs.md).*
- [x] Sketch the **"Browser to Grid"** batch workflow.
      *Shipped unsketched as the temporary pool: bulk actions, drag from the sample rows, and
      "import into a project". **Closed as built.***
- [x] Sketch the **"Guest Artist Pack"** discovery and loading flow.
      *Answered rather than sketched — the app is the form and the channel stays human. **Closed.** See
      [docs/presets-samples/submission-workflow.md](../presets-samples/submission-workflow.md).*
