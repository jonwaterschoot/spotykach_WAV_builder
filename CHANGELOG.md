# Changelog

## [1.1.6] - 2026-02-17

### Fixed
- **Unassign Slot Bug**: Fixed a critical issue where unassigning a slot in "All Tapes" view or specific contexts would incorrectly remove the file from the **Blue** tape instead of the target tape. The removal logic now explicitly respects the target tape color.

### Improved
- **Smart Export Folder**: The export logic now intelligently detects if the user selected a folder named `SK`. If so, it writes directly to it instead of creating a nested `SK/SK` structure.

## [1.1.5] - 2026-02-16

### Fixed
- **Audio Pitch Issue**: Users reported hearing a pitch shift on macOS when editing. Resolved a critical issue where editing 44.1kHz audio (common on many systems) resulted in high-pitched playback and incorrect speed.
    - **WAV Headers**: The encoder now correctly writes the actual sample rate of the audio data instead of hardcoding 48kHz.
    - **Automatic Resampling**: The Waveform Editor now automatically checks regarding audio sample rates and resamples non-48kHz audio to the project standard (48kHz) before saving.
    - **Robust Architecture**: Implemented a centralized `toWav` method in the audio processor to ensure all future features automatically benefit from these safety checks.

## [1.1.4] - 2026-02-15

### Fixed
- **Smart Sync Export Crash**: Resolved a "Permission denied" error during export by correctly cloning file data into memory during the sync process. Previously, the app held references to files on the SD card which could become invalid or locked, causing the export to fail when trying to read them.

## [1.1.3] - 2026-02-15

### Added
- **Sync Preview**: A new confirmation modal appears before running "Restore & Sync", showing a summary of new files and updated versions found on the SD card.
- **Sync Progress**: Visual feedback during the sync process using the standard task progress interface.

## [1.1.2] - 2026-02-15

### Added
- **Smart Sync**:
    - **Backup Detection**: Automatically detects `project_backup.zip` when importing an SD card folder structure.
    - **Restore & Sync**: New workflow to restore the project state from backup AND synchronize any new recordings or changes found on the SD card (based on file size comparison).
    - **Logic**: Prevents "blind overwrite" of new recordings when restoring a backup, and prevents "loss of project context" when importing only audio files.

## [1.1.1] - 2026-02-15

### Improved
- **Preview Behavior**:
    - **Refresh Logic**: "Preview" buttons now act as a "Refresh" trigger when active, allowing parameter updates without stopping playback.
    - **Pause Support**: Users can now pause the preview using the main transport controls.
    - **Visuals**: Added a "Refresh" icon with a spin animation.

### Fixed
- **Export Polish**:
    - **Progress Bar**: Restored visibility of the green progress bar (`bg-synthux-action`).
    - **Logs**: Reduced log spam by hiding redundant text messages during export.
    - **CSS**: Fixed a syntax error in `index.css` causing build warnings.

## [1.1.0] - 2026-02-14

### Major Feature: Volume Automation
- **Keyframe System**: Added a professional volume automation overlay. Users can now add, move, and delete points to create precise volume fades and curves over time.
- **Interactive Overlay**: 
    - Click line to add points.
    - Drag points to adjust time/volume.
    - Double-click waveform to add point and **auto-enable** the panel.
- **Controls**: Smooth/Linear toggle, value sliders, and dedicated delete buttons.

### Added
- **Loop Preview**:
    - **Gapless Looping**: Implemented native browser looping for "Preview Loop" to eliminate the audible JS-latency gap.
    - **Crossfade Controls**: Dedicated slider for loop crossfade duration.
- **Smart Sync**:
    - **Incremental SD Export**: Tracks file versions to only write changed files to the SD card, significantly speeding up exports.
- **Sample Packs**:
    - Added **Vinyl Crackle** (11 samples) and **Foley** (5 samples) categories to the **Jonwtr Explorations** pack.
- **Export**:
    - **Progress Feedback**: Added a visual progress bar and percentage indicator during ZIP generation and file processing, providing real-time feedback for long export operations.

### Fixed
- **Data Integrity (Critical)**:
    - **Export Clicks**: Fixed an off-by-one error in the trimmer logic (`audioProcessor.ts`) that caused a single sample of silence (click) at the end of exported WAV files.
- **UX**:
    - **Tooltips**: Comprehensive tooltips added for all editor buttons and toggles.
    - **Layout**: Improved alignment of Automation and Loop panels in the top toolbar.
- **Playback**:
    - Fixed sticky playback state when triggering processing actions.

## [1.0.2] - 2026-02-12

### Changed
- **About Modal**:
    - Updated audio specification to **32-bit** (from 16-bit).
    - Added **Browser Compatibility** section clarifying support for Chromium, Safari, and Firefox.
- **Export Modal**:
    - "Write Directly to SD Card" option is now visible but **disabled** on unsupported browsers (Firefox, Safari), with an explanatory warning, instead of being hidden.

### Documentation
- Updated README within exported ZIPs to reflect version 1.0.2.

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

