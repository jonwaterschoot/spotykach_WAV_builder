# Changelog

## [1.0.1] - 2026-02-12

### Added
- **Export Modal**: Added "Manual Export" mode for mobile devices. Allowing exporting single files but converted to the 1.WAV, 2.WAV, etc. format.

### Fixed
- **Export Modal**: Added scrollbar and max-height to support smaller screens (UI Overflow).


## [1.0.0] - 2026-02-09

### Major Release
- **Import/Export Overhaul**:
    - Complete restructuring of Import and Export flows.
    - Support for SD Card Structure imports (drag & drop folders).
    - Enhanced Export options (Project Backup vs SD Card Structure).
    - **Mobile Support**: Added "Manual Export" mode and Android error handling.
    - Dedicated Import/Export Modals with clear analysis.
- **Reset Application**:
    - Added "Reset Application" functionality (accessible via Tape Selector or Info Modal).
    - Clears all local data (IndexedDB & LocalStorage) for a fresh state.
- **Help & Documentation**:
    - Added comprehensive Help Modal (?) with guides on SD Card Structure, Firmware usage, and Troubleshooting.
    - Added Info Modal (i) with app details and credits.

## [0.2.2] - 2026-02-09

### Improved
- **Touch Support**:
    - Confirmed working on Windows Touch (Asus ProArt PX13) and Android (OnePlus Pro 10).
    - Fixed issues with drop zones not highlighting on mobile by implementing a JSON-over-Text payload system.
    - **Note**: The layout is still optimized for Desktop; phone usage is possible but cramped.
    - **Android Caveat**: Android OS often dumps exported folder structures into device-specific paths on SD cards rather than the root.

### Fixed
- **Mobile Drag**: Fixed "Drag starts but drop fails" loop on Android.
- **Audio Editor**: Fixed touch handles accumulating state and becoming unresponsive.

### UI/UX Refinements

- various small tweaks, e.g. color of the highlighted borders of cards following the theme of the tape.

### Documentation
- **Info Modal**: Updated the "Desktop Only" warning to a softer "Desktop Recommended" message, acknowledging Beta mobile support.
- **Main README**: Synced the Roadmap section with your latest updates in roadmap-bugs.md, prioritizing Export and Trashcan features.

## [0.2.1] - 2026-02-08

### Added
- **Selection Workflow**:
    - **Exclusive Selection**: Selection is now exclusively triggered by clicking the dedicated circle/checkbox on the card, separating it from the "Open Editor" action.
    - **Clear on Move**: Selection state is automatically cleared after a successful bulk move operation.

- **Editor Access**:
    - **Direct Open**: Clicking the main body of a file card (Single or Double Click/Tap) now opens the Audio Editor immediately.
    - **Edit Icon**: Added a specific "Edit" (pencil) button to both Tape and All views for explicit editor access.

- **Bulk Interaction**:
    - **Move vs Copy**: Dragging multiple files slots now defaults to "Move" (clearing source) instead of "Copy".
    - **Touch Improvements (Trial)**: Enhanced touch event handling for better drag-and-drop and tap responsiveness on mobile devices.

## [0.2.0] - 2026-02-08

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

