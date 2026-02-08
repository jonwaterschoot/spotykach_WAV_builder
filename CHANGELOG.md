# Changelog

## [0.1.1] - 2026-02-08

### Added
**Duplicate Management**:
    - **Visual Indicators**: Orange borders and alert icons highlight files used in multiple slots.
    - **Conflict Resolution**: Added a modal to resolve duplicates by keeping a specific slot or making all unique.
    - **Save Unique**: In the Audio Editor, duplicates now show a "Save Unique" button to create a forked copy instantly.

**File Management**:
    - **Deleting vs. removing logic** applied to browser, editor browser and tape views
    - **Unassign Action (X)**: move sample to the "Unassigned" pool 
    - **Delete Action (Trash)**: delete sample from the project and remove it from slots and project state.
    - **Confirmation Logic**: Delete action modals as a barrier to accidental deletion.

- **Smart Drag & Drop**:
    - **Single Slot Swap**: Dragging a file from one slot to another occupied slot now triggers a Swap.
    - **Bulk Conflict Resolution**: When dragging multiple files to occupied slots, a modal offers to Overwrite or Push to free slots.
    - **Touch Support**: Initial implementation of drag and drop for touch devices (polyfilled).

- **Bulk Selection**:
    - **Multi-Select**: Added ability to select multiple files in the browser (Shift/Ctrl + Click) and multiple slots in tape views.
    - **Batch Actions**: Perform Move, Delete, or Drag operations on all selected items simultaneously.

### UI/UX Refinements
- **Slot Cards**: tweaked various styles and added spacing for a cleaner look.
- **Button Styles**: with improved colors and hover effects
- **Improved Visuals**: Fixed card/modal clipping issues.
- **Tape View**: Relocated "Download Tape" button next to the tape title for easier access.
- **All View**: Made tape headers (icon and label) clickable to navigate directly to the specific tape view.
- **File Browser**: Aligned Play and Download buttons vertically in the expanded view for better accessibility.

### Changed
- **Exports**: Enforced uppercase `.WAV` extension for all single file downloads to match hardware requirements.

### Fixed

- **File Browser**: Fixed flickering issue when hovering over a file that is currently playing.
- **Import**: Fixed import failure for files with special characters by automatically sanitizing filenames.
- **Assets**: Renamed conflicting files in Jonwtr sample pack to remove special characters.


## [0.1.0] - 2026-02-07

### Added
- **Tape View**: Individual tape management with 6 slots.
- **All View**: Grid overview of all 6 tapes (36 slots total).
- **Waveform Editor**:
    - Normalize, Trim, Fade In/Out processing.
    - Version history with Restore and Delete capabilities.
    - Visual tags for applied effects (Normalized, Trimmed).
    - "Assign to Tape" functionality without creating duplicate files.
- **Sample Browser**:
    - Integrated "Synthux Horror" and "Jonwtr Explorations" sample packs.
    - Preview and Import functionality.
- **Export**:
    - Export single tape to Zip.
    - Export entire project to Zip (Backup).
    - Export structure for SD Card (direct file write simulation/instruction).
- **UI/UX**:
    - Dynamic Synthux theme colors for tapes.
    - Drag and Drop support for slots.
    - Responsive layout improvements.

### Fixed
- **Tape Icon**: Restored colored tape icon in headers.
- **Playback**: Improved audio engine playback stability.
- **Visuals**: Aligned Play buttons and icons across views.

