# Changelog

## [3.6.2] - 2026-04-27

### Improved
- **Playhead Animation**: Enhanced the playhead smoothness in tape views (Single and All Tapes) by implementing a high-frequency `requestAnimationFrame` update loop, matching the visual performance of the main sample editor.
- **Global Modal Support**: Added universal `Escape` key support to close all modals and overlays, improving keyboard navigation and UX consistency.
- **Vite Build Optimization**: Refined the Vite configuration and build chunking strategy to improve loading times and production bundle efficiency.

### Fixed
- **Playhead Bounds**: Resolved an issue where the sample playhead in tape views could bleed into the padded margins of the card. The playhead is now strictly contained within the waveform content area.


## [3.6.1] - 2026-04-26

### Improved
- **Header & Navigation**: Streamlined the main header layout by reorganizing menu items for better accessibility and focus.
- **Onboarding Experience**: Refined the onboarding/welcome screen UI with improved typography and contrast for better readability.

### Fixed
- **Presets Panel**: Resolved an issue where preset cover images failed to load from Cloudflare R2 due to Cross-Origin Embedder Policy (COEP) restrictions. Added `crossOrigin="anonymous"` to ensure proper CORS/COEP compliance.

## [3.6.0] - 2026-04-23

### Added
- **Project Export & Presets Reform**:
    - **Automatic Project Loading**: Projects imported via ZIP now load automatically, featuring a "Discard Changes" safety check to prevent data loss.
    - **Community Presets**: Introduced a dedicated Presets system with a pre-populated `public/presets/` library for quick setup.
    - **Metadata Healing**: Implemented automated attribution and license verification during export, ensuring all samples have proper origin and license tags.
    - **Enhanced SD Export**: Organized the `SK/` folder structure to strictly follow firmware requirements, including centralized `config.txt` and `notes.md` placement.
    - **License Transparency**: Exported projects now include a detailed `README.md` with full sample attribution, license information, and usage instructions.
- **Documentation**:
    - Added [docs/how_to_copy_to_SDcard.md](./docs/how_to_copy_to_SDcard.md) with step-by-step instructions for hardware synchronization.

### Improved
- **Import/Export Logic**:
    - Synchronized project metadata during SD import/export to preserve file origins and license information.
    - Added support for `project-descriptor.json` for more robust project metadata handling in ZIP archives.
    - Improved path resolution in ZIP imports to handle nested folder structures more gracefully.
- **UI/UX**:
    - Refined the Project Manager with better feedback during duplication and renaming operations.
    - Standardized metadata display across the application for better license visibility.

## [3.5.0] - 2026-04-22

### Added
- **Cloudflare R2 Migration**:
    - Migrated sample and project hosting from GitHub Pages to Cloudflare R2 to overcome GitHub Pages storage limitations.
    - Added `manifest.json` for centralized metadata resolution and fetching of available community packs and project files.
    - Updated "Download Full Pack" links to fetch ZIP downloads directly from the R2 storage location.
- **Config Management**:
    - Added a `pre_load` toggle setting to the `config.txt` generation and parsing logic, accessible directly from the Config Modal UI.

### Improved
- **Sample Browser UI**:
    - Resolved TypeErrors occurring during bulk sample imports.
    - Standardized tape color indicators and improved the visual consistency of file selection borders.
    - Implemented robust CORS/COEP-compliant audio fetching for remote assets.

### Removed
- Removed locally hosted audio sample pack files (`public/samples/`) in favor of remote fetching, freeing up repository storage and speeding up build times.
>>>>>>> projectpreload

## [3.4.0] - 2026-03-27

### Added
- **Loop Tool Finalization**:
    - Implemented **Discard Protection**: The Loop tool now tracks user interaction (`hasLoopInteracted`) and integrates with the global "unsaved changes" warning system.
    - **Auto-Reset on Discard**: Canceling loop edits now automatically resets crossfade duration and "Fit-to-42s" mode for a clean state.
    - **Improved UI Workflow**: Replaced the static Preview button with a "Preview/Edit" toggle for more intuitive tool interaction.
- **Centralized Library Sync**:
    - Unified the "Library Sync" experience by migrating core logic and `LibrarySyncModal` into `App.tsx`.
    - Streamlined access from both `ProjectManager` and `LibraryManager` via centralized handlers.
- **Enhanced Help & Onboarding**:
    - Added a direct **Help Icon** to the Project Manager header for instant accessibility to documentation.
    - Updated help content with revised descriptions for "Build vs. Sync" and "Library" management concepts.

### Improved
- **Audio Playback Management**:
    - Implemented **Playback Mutual Exclusion**: Starting main waveform playback now automatically halts history version previews (and vice versa) to prevent overlapping audio streams.
- **Trim Tool Logic**:
    - Refined "Unsaved Changes" (dirty state) detection to distinguish between automatic 42s trims and manual user adjustments.
- **Normalize Tool UX**:
    - Added an informative note ("Normalization already applied") for files that have already been processed, improving feedback over simply disabling the button.
- **Browser Panel Layout**:
    - Optimized dense list views by repositioning action icons above tape labels, providing better readability for long names.

### Fixed
- **Cleanup & Maintenance**:
    - Removed obsolete **Fix Slots** functionality from the Project Manager.
    - Deleted unused `DeviceImportModal.tsx` component and its associated state/logic.
 
## [3.3.2] - 2026-03-25

### Added
- **Project Cleanup Enhancements**:
    - Simplified the "Project Cleanup" workflow by making **History Only** the default primary action.
    - Updated button labels to clearly clarify that **History Only** preserves the original version plus the latest step.
    - Refactored **Clean All** to include the original version in the deletion mapping for a more thorough project wipe.
    - Improved UI prominence by making the safest action ("History Only") the primary red button.
- **SK Backup Refinements**:
    - Added an explanatory section for SK Backups, detailing their purpose and local storage folder (`_sk_backups`).
    - Improved the backup list layout with better typography and icons.

### Fixed
- **Backup Date Bug**: Resolved an issue where SK Backups displayed "Invalid Date" by implementing a custom parser for folder-safe ISO timestamps.

## [3.3.1] - 2026-03-25

### Added
- **Persistent Log Tracker**: 
    - Introduced a dedicated logging service (`logger.ts`) that captures all system info, warnings, and errors.
    - Logs are persisted to `logs.txt` within the active project work folder.
    - Added a **Log Viewer Modal** with filtering and session export (.txt) capabilities.
    - Replaced the "Reset App" button in the sidebar with a **Logs** accessibility button.
- **Notification Stacking**:
    - Refactored the notification system to support a vertical stack of messages, preventing UI overlaps in the Waveform Editor.
    - Implemented React Portal-based rendering for notifications to ensure they always stay on the top layer.
    - Auto-logging: All toast notifications are now automatically mirrored to the system logs for auditability.

### Fixed
- **UI Overlap**: Resolved a regression where multiple tool messages and "Edit Saved" notifications would overlap and become unreadable.

## [3.3.0] - 2026-03-24

### Added
- **SD Import & Build Workflow Overhaul**:
    - Introduced **Import Presets**: "Standard import", "Merge into project", "Merge into project + Mirror", and "Custom" to standardize SD card synchronization.
    - Implemented a high-density UI for the SD Sync Modal with a 10-second auto-hide feature for the audio player.
    - Unified preset button layouts across Simple and Advanced views for better consistency.
    - Added clear visual feedback for destructive sync actions (trash icons and high-visibility red dashed borders).
    - Compacted the Build & Import modal layout, featuring a "Before & After" comparison view and streamlined header/footer.
    - Implemented **SHA-256 Hash Comparison**: Replaced the unreliable size-only sync diff fallback with a bit-for-bit SHA-256 content hash check, ensuring 100% accuracy in detecting file changes even for identical file sizes.
    - Introduced **Duplicate Group Detection**: Automatically identifies audio content that exists in multiple slots across both project and SD card.
    - Added **Duplicates Banner**: A highlights-aware, collapsible amber banner that lists redundant files with hover-to-highlight integration for the main slot grids.
- **Onboarding & Workflow Enhancements**:
    - Refined the setup flow: users can now enter a project title immediately after "Start New Setup" or "Skip Intro," bypassing the Project Manager to load directly into the Tapes view.
    - Enhanced "Resume Session" to skip the Project Manager and load the latest session automatically.
    - Integrated the **Core Concepts Explainer** into the Help section for easier accessibility.
- **Config & MIDI Management**:
    - Added "Save to SD" and "Download" buttons directly to the Config Modal.
    - Pre-populated the Config Modal with default presets for quicker setup.
    - Updated MIDI settings schema to include start/stop control toggles (`mid_ps_a`, `mid_ps_b`).
- **Slicer Tool Refinements**:
    - Slice points and state now persist across different tool edits.
    - Added global visibility toggles, slice locking, and snapping functionality for markers.

### Fixed
- **UI Stability**: Resolved layout collapse issues in the Cleanup Modal and fixed duplicate "Apply" buttons in the Pitch tool.
- **CORS & Assets**: Switched sample hosting to jsDelivr to resolve CORS issues and optimized file sizes to stay within CDN limits.
- **SD Sync Accuracy**: Fixed a bug where files of the same size were incorrectly marked as "Matched" (e.g., G4 collision) by implementing content hashing.
- **Project Structure**: Removed obsolete V1 routes and implemented redirects to ensure a seamless transition to the V2 application.

## [3.2.0] - 2026-03-18

### Changed
- **Unified Application Entry**: Removed the version picker and the legacy V1 application. The root URL now directly serves the latest (V2) application.
- **Legacy Redirects**: Implemented a transition layer that automatically redirects any requests for `/v2/` back to the root URL, preventing 404s for bookmarked users.
- **Build System Simplification**:
    - Removed `build:versioned` and associated scripts.
    - Standardized on the default Vite build process for deployment.
    - Cleaned up obsolete documentation and multi-version build logic from `package.json` and `README.md`.

## [3.1.2] - 2026-03-12

### Fixed
- **Sample Browser CORS Fix**: Resolved `TypeError: Failed to fetch` when importing samples from GitHub.
    - Switched default sample hosting to **jsDelivr CDN** to provide correct CORS headers.
    - Updated path resolution logic to preserve directory hierarchy, ensuring samples are correctly located without needing to flatten folder structures.

## [3.1.1] - 2026-03-04

### Added
- **config.txt Management System**: 
    - Dedicated modal for managing hardware configuration files (`config.txt`).
    - **MIDI Channel Assignment**: Independent sliders for Deck A and B channels (1-16).
    - **MIDI Transport Control**: Independent Start/Stop toggles for Deck A and B (`mid_ps_a`, `mid_ps_b`).
    - **Preset System**: Save/Load configuration presets to `localStorage`.
    - **Project Browser**: Load configuration directly from other project folders.
- **Hardware Synchronization**:
    - `config.txt` is now fully integrated into the **Push SK to SD** and **ZIP Export** workflows.
    - Two-way sync: Detects differences between local and hardware settings with Pull/Push options.
    - Added "Force Overwrite" option to export all project content regardless of diff status.

### Fixed
- **Sync Stability**: Resolved crash when loading/scanning older projects with missing or legacy configuration properties.
- **Project Manager Detection**: Improved sync status accuracy by including protocol-level configuration in the project comparison logic.

### Documentation
- Created [docs/configtxt/configtextsettings.md](./docs/configtxt/configtextsettings.md) with technical specifications for the Spotykach configuration format.


## [3.1.0] - 2026-03-04

### Added
- **Interactive Keyboard Slicer Map**:
    - Converted static modal into a **floatable, movable panel** using `react-rnd`.
    - Implemented **Click-to-Play**: Any key in the visual map now triggers its corresponding slice playback.
    - Added **Input Highlighting**: Keys now pulse and glow cyan when triggered via computer keyboard, MIDI notes (C1-G3), or mouse clicks.
- **Marker Removal**:
    - Added hover-based removal directly on the waveform (hover marker to reveal delete icon).
    - Added inspector-based removal (delete icons next to marker inputs).
- **Slicer UI Vertical Layout**: Reorganized Slicer controls into a two-row layout for better logical grouping of inspection and generation tools.

### Fixed
- **MIDI Auditioning Sync**: Refactored MIDI event listeners to use stable references, ensuring note mapping stays in sync after adding or removing markers.
- **WAV Export Marker Sorting**: Fixed an issue where markers were not always sorted chronologically in exported WAV files.
- **State Integrity**: Resolved a race condition where the slicer state could be mutated in-place during export.

### Documentation
- **WAV CUE Research**: Added comprehensive research and implementation notes for WAV slice markers (CUE chunks). See the [docs/WAV-CUE](./docs/WAV-CUE) folder for technical details, including:
    - [Slice Implementation Summary](./docs/WAV-CUE/slice_implementation_summary.md)
    - [WAV CUE Research & Instructions](./docs/WAV-CUE/wavcueinstructionsresearch.md)


## [3.0.0] - 2026-03-03

### Added
- **Major Waveform Editor Overhaul**: All tools are now consolidated into a single bar with contextual options appearing below. Resetting is now handled on a per-tool level.
- **New Tools**:
    - **EQ**: Basic 3-band 12dB controls with an advanced modal popup featuring 10-band 24dB precision.
    - **Limiter**: Toggle between **Auto** (basic upwards compression) and **Peak** (hard limiter with draggable waveform threshold).
    - **Cutter**: Erase audio segments by double-clicking to add regions, with 0-100ms fades to prevent clicks.
    - **Slicer**: Add up to 32 slice CUE points (Note: Implementation on Spotykach hardware pending).
    - **Stereo**: Split-view for stereo files with color-coded superimposed mode to visualize L/R differences.
- **Updated Tools**:
    - **Trim / Fades**: Enhanced precision for start/end points with automatic 42s limit logic and custom fade curves.
    - **Loop**: Create perfect loops with custom crossfades (includes logic to shorten result for seamless playback).
    - **Automation (Volume)**: Manual volume tweaking with optional normalization and a new visual dB scale guide.
    - **Normalize**: Added level selection options.

## [2.3.0] - 2026-02-28

### Added
- **SD Card Sync Enhancements**:
  - Added option to browse and reselect the SD card within the sync window.
  - Added "Clear All" for preset import options to allow selective file importing.
  - Implemented functionality to import only selected files to the project pool.
- **Onboarding & Setup Improvements**:
  - Added "Back" buttons to all onboarding steps for better navigation.
  - Implemented a "Resume" feature that detects previous work and warns about potential version conflicts.
  - Cleaned up onboarding UI by removing redundant style options and keeping essential toggles.
- **Sample Browser & Window Management**:
  - Implemented resizable and draggable functionality for the **Sample Browser** window using `react-rnd`.
  - Added a pencil (edit) icon to library files to quickly locate and highlight them in the manager.
  - Fixed resize handle overflow that caused unwanted scrollbars at viewport edges.
  - Improved action bar positioning to correctly overlay the component regardless of scroll state.
- **Advanced Search**:
  - Implemented "Advanced" search mode in the local folder browser with persistent filters and warnings.

### Fixed
- **Library Manager Stability**:
  - Implemented physical disk deletion sync to ensure deleted files are removed from the drive.
  - Added filtering to exclude temporary files (e.g., `.crswap`) and hidden system files from library scans.
  - Resolved "hang and rebuild loop" issues by memoizing handlers and adding mount guards.
  - Prevented autosave from writing missing file records back to disk.
- **Project Manager**: Fixed "Backup Modified" label incorrectly appearing when content was identical — now uses content-based comparison instead of timestamps.
- **UI/UX Refinements**:
  - Fixed recursive folder toggle logic to correctly traverse only downwards from the selected path.
  - Refined "Locate File" functionality in the Sample Browser with improved path matching and "locatePulse" animations.
  - Improved play button interaction on file rows to handle toggle play/pause state correctly.

## [2.2.0] - 2026-02-26

### Added
- **License Management**:
  - Added **WTFPL** (Do What The Fuck You Want To Public License) to the license preset list.
  - Implemented per-file and bulk license editing within the **Library Manager**.
  - Integrated `NotesEditor` for licensed fields in settings and management tabs.
  - Added auto-save mechanism for license fields with visual checkmark indicator.
- **Project Notes Improvements**:
  - Refined alignment of tape note previews for better vertical consistency.
  - Implemented logic to ensure the Project Notes window is fully visible on initial load.
  - Default state for tape notes in "All Tapes" view is now fully collapsed.
- **Browser & Preference Management**:
  - Added "Reset Browser Choice" option in settings and direct cogwheel link in browser header.
  - Integrated "Remember Choice" functionality with global browser settings.

### Fixed
- Resolved **white screen error** caused by named import mismatch for `BrowserChoiceModal`.
- Fixed JSX syntax errors and closing tag issues in `LibraryManager.tsx`.
- Resolved persistent "Missing Files Detected" notice by improving cleanup logic.
- Restored visibility of SD backup scan results and implemented direct recovery actions.

## [2.1.0] - 2026-02-24

### Major Feature: Visual Overhaul
- **Visual Settings Tab**: Added a dedicated Visual Settings modal featuring smooth animated transitions between various visual presets. Provides granular slider controls over visual elements like brightness, contrast, and inversion.
- **Texture Enhancements**: Introduced scrolling background textures in the Sample Pack Browser and granular noise textures in the Audio Editor to improve the app's aesthetic depth and contrast on main controls.
- **Interactive Video Background**: Integrated an interactive video loop into the Setup Wizard / Welcome screen with an easily accessible toggle for playing video sound.
- **Theme Improvements**: Refined the Setup Wizard with updated title gradients, button opacities, and adjusted the bottom button spacing to avoid Windows taskbar clipping.

### UI/UX Refinements
- **React Portal Integration**: Isolated the "Reset Visual Effects" button from global UI filters using a React Portal, ensuring it always remains visible. Repositioned Toast notifications to the top of the screen to prevent clipping and fixed portal rendering issues.
- **Player Bar**: Improved playback interaction (play/pause consistency via spacebar and clicks) and refined the progress bar styling throughout the All Tapes view using darker/lighter contrast hints.

## [2.0.1] - 2026-02-22

### Added
- **Sample Manager / Library Manager Overhaul**:
  - Added a **Review Import Batch** step before importing files into the user library.
  - Review supports:
    - temporary audition/preview playback,
    - removing files from the batch,
    - renaming display/filename before import,
    - assigning tags per-file and globally across the batch.
  - Added persistent batch processing logs with manual clear for debugging and user transparency.

- **WAV to FLAC Import Pipeline**:
  - Added stricter uncompressed WAV detection and conversion logic.
  - When conversion is enabled, qualifying WAV imports are converted and stored as `.flac`.
  - Improved conversion reliability by loading FFmpeg from local app assets first, with safe fallback behavior.

- **Scrub Preview Players**:
  - Added bottom scrub playback bars in:
    - Sample Pack Browser,
    - Review Import Batch,
    - Library Manager current-library section.
  - Enables precise auditioning and seeking before import/use.

- **Tagging and Search Improvements**:
  - Added tag filters to Sample Pack Browser (User Library view) and Library Manager.
  - Added selectable tag-pill filters.
  - Search now matches **partial tag text** and also **filenames**.

- **Library Editing Workflow**:
  - Redesigned "Your Current Library" into a two-column management layout:
    - left: clean selectable file list (selection, play, title, edit),
    - right: bulk editor for rename and tags.
  - Multi-select rename now auto-numbers titles (`Name 1`, `Name 2`, ...).
  - Renaming updates stored filenames (extension-aware) and syncs disk files in `User_Library`.

- **Project Load Diagnostics for Missing Assets**:
  - Missing asset errors are now captured as structured load issues.
  - Users receive a detailed modal showing:
    - affected file records,
    - assignment location (slot refs or unassigned pool),
    - missing version references.
  - Added one-click cleanup option to remove unrecoverable file records and clear dead slot references.
  - Added SD backup cross-reference and restore option:
    - checks backup project assets,
    - reports recoverable counts,
    - restores available missing assets from SD backup,
    - offers cleanup only for unresolved remainder.

- **Swap Sample Packs .wav files**: 
  - Swapped the files to the more compressed fileformat flac to save space.
    - Synthux horror samples pack
    - jonwtr samples

## [2.0.0] - 2026-02-22 - not integrated into /V1

### Big overhual of SD card import/export system

For now entering the main URL will first offer the option to run old V1 version. When picking the new version, V2, it will open the Setup Wizard, which will allow you to select a project or create a new one.

- **Project Manager**: Added a new Project Manager to manage multiple projects and their associated SD SK Folders.
  - unified import/export system with a Syncing logic.
  - Separate project syncing and Root SK folder syncing.

- **Main header**: now has the following buttons:
  - Import SD
  - Build SD
  - Save
  - New Project
  - Project Manager

### TODO
- debugging / testing various issues with the import/export system
- build a user library of samples, accesible from each project see the [roadmap](roadmap-bugs.md) for more details

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

