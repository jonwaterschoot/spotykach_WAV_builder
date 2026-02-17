# Import/Export & Data Management Reform Plan

This document outlines the plan for reforming the import/export functions, project management, and data persistence layers of the application.

## 1. Import & Export Workflow

### Improvements
- **Progress Indication**: Implement a progress bar that appears immediately when the user initiates an import (reading zip, checking folder content) to prevent the "nothing is happening" feeling.
- **Version Control**: Ensure the version number in the export `README.txt` updates automatically.
- **Detailed Export**: When exporting to SD card or a separate location, present a **Comparison Table** (Sync Interface) similar to the import flow.

### Conflict Resolution (Sync Flow)
- **Scenario**: Importing a project from SD card while a different project (or different version) is open in the browser.
- **Solution**: dedicated **Sync/Comparison Interface**.
    - **Visuals**: A comparison table showing files on the SD card vs. files in the Browser.
    - **Data Points**: Filename, Size, Duration, Audio Preview.
    - **Actions**: Allow the user to decide per file:
        - *Overwrite* (Import/Export)
        - *Rename* (Keep both)
        - *Skip* (Do nothing)
    - **Directionality**: This interface should be used for both Import (SD -> Browser) and Export (Browser -> SD).

## 2. File Handling & History

### Metadata & Renaming
- **Problem**: Renaming files to `1.WAV`, `2.WAV` (required for hardware) loses the original filename and history.
- **Solution**: 
    - Maintain an index (e.g., `project.json` or within IndexedDB) that maps `1.WAV` to its original metadata (Original Name, Description, Source, Edits).
    - Allow users to add Name/Description to files recorded on the hardware (which lack info).
    - Store this metadata in the project folder (e.g., `project.json`) so it persists across exports/imports.

### Undo/Redo & History (Trashcan)
- **Global History**: Maintain a list of all actions (Delete, Normalize, Trim, etc.).
- **UI Controls**:
    - **Undo/Redo Buttons**: Permanent UI elements (e.g., Arrows).
    - **History List**: A button (Clock/List icon) that opens a modal showing the action log, allowing users to jump to a specific state or undo specific actions.
- **Integrated Trashcan**:
    - Deleted files go to a temporary "Trashcan" state rather than being immediately destroyed.
    - Allow "Undo Delete" even after a "Full Cleanup" command (until a final permanent delete confirmation).

## 3. Project Management

### Project Cleanup
- **Feature**: "Clean Project"
    - **Option A (Standard)**: Remove files not used in any Tape.
    - **Option B (Strict)**: Keep only the original source file; discard unused history/processed versions (only keep files actively saved to the Pool/Tape).

### Project Backup
- **Conflict Handling**: When backing up a project that already exists:
    - Prompt the user: *Overwrite*, *Rename*, or *Cancel*.
    - Future proofing: Distinguish between different "versions" of the same project (Timestamping or Versioning).

## 4. Shared Sample Pool

- **Concept**: A centralized pool of samples (`/SPOTYKACH_USER_SAMPLES/`) separate from specific projects.
- **Storage**:
    - **SD Card Structure**:
        - `/SPOTYKACH_USER_SAMPLES/` (Shared)
        - `/SPOTYKACH_PROJECTS/` (Project specific)
- **Browser Integration**:
    - Clearly distinguish "Unassigned" samples in the browser.
    - Options to:
        - Assign to current Project.
        - Move to User Samples (Shared Pool).
        - Delete.
- **Exporting samples**: When saving/exporting a project, allow selecting which files to include via the Comparison/Preview table.

## 5. Data Persistence Roadmap

Currently using **IndexedDB**. Hard reset wipes data.

### Phase 1: Internal Project Manager (Web-Friendly)
Target: Robust IndexedDB implementation.
- **Multi-Project Support**: Store multiple named projects (e.g., "Techno Set", "Ambient Jams") in IndexedDB.
- **Switching**: Instant switching between stored projects.
- **Backup All**: Feature to download a single backup file containing *all* local projects for safekeeping.

### Phase 2: Standalone Application (Electron)
Target: Native Desktop Experience.
- **Architecture**: Wrap app in Electron.
- **Native I/O**: Use native "File > Open/Save" dialogs.
- **Direct FS Access**: Read/Write directly to disk/SD card without browser sandbox limits.
- **Drag-and-Drop**: Support dropping files directly to specific folders on the OS.
