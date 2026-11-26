# Import and export plan

How a project leaves WAV Builder and comes back: what exists, what breaks, and the plan for
one project file and one importer. Written 2026-11-26, with Jon's decisions from the same day.

Code references are to branch `fix/unsaved-assign-escape`; line numbers drift, function names
don't.

---

## What exists

As surveyed on Nov 26, before step 1.

### Exports

| Where | What's inside | Filename |
|---|---|---|
| Project ▸ Advanced ▸ Export Portable & Presets ▸ Portable SK Folder | The SK folder and instructions. "Include Project Bundle Backup" adds `SK/PROJECT_BACKUP/project_backup.zip`, a zip inside the zip | `Spotykach_SD_<date>.zip` |
| same ▸ Project Preset ▸ Settings-Only Preset | `project-descriptor.json`: library samples as references, your own audio (current version) in `custom_assets/` | `Spotykach_Project_<date>.zip` |
| same ▸ Project Preset ▸ Full Backup Bundle | `project.json`, every version's audio in `blobs/` | `Spotykach_Project_<date>.zip` |
| same ▸ Custom Files | Chosen files as WAVs, in SK folders or one folder | `Spotykach_Selection_<date>.zip` |
| same ▸ Prepare a submission | Opens the Submit tool | none |
| Project Manager ▸ download button on a row | `<name>/project-descriptor.json` and audio. The footer's "Settings-Only ZIP" checkbox switches every row to library references | `<name>.zip` |
| Save in Browser Cache Mode | `confirm("Download Project Backup?")`, then the Full Backup Bundle | `Spotykach_Project_<date>.zip` |
| Tape header | One tape's WAVs | `<color>_Tape.zip` |

Code: [`ExportModal.tsx`](../src/components/ExportModal.tsx),
[`exportSaveState`](../src/utils/exportUtils.ts#L567),
[`exportSDStructure`](../src/utils/exportUtils.ts#L778),
[`handleExportZip`](../src/App.tsx#L601),
[`buildDescriptorFromState`](../src/utils/projectDescriptorUtils.ts#L252).

### Imports

- **Project Manager ▸ Import from Zip** ([`handleImportZip`](../src/App.tsx#L437)): any zip with
  `project.json` or `project-descriptor.json`. The files are copied as they are into
  `Projects/<name>/`, named after the zip's single top folder, else after the zip's filename.
  Since Nov 26 it asks to save first, and asks for a new name when the project exists.
- **Project Manager ▸ Found on the card ▸ Import to workspace**: copies
  `WAV_Builder/Projects/<name>/` from the card.
- **Presets panel**: an official preset becomes a new project.
- **Import / Build SD ▸ import**: the card's slots into the open project. Not part of this plan.
- **ImportModal** ([`handleImportFiles`](../src/App.tsx#L4380),
  [`analyzeImport`](../src/utils/importUtils.ts#L128),
  [`loadProjectFromZip`](../src/utils/importUtils.ts#L48)): restore a backup, read an SD
  folder, add files to the pool. Unreachable: nothing has clicked its file input since
  release 2.0.1.

---

## What breaks

From reading the code, not reproduced.

1. **Imports are named after the file.** Zips from the Export window have no top folder, so the
   project becomes `Spotykach_Project_2026-11-26`.
2. **A Full Backup Bundle imports with every file missing.** Its audio is in `blobs/`, and
   [`loadProjectFromDirectory`](../src/utils/exportUtils.ts#L1572) reads `Assets/` only.
3. **The SK zip's project backup can't be imported.** It's a zip inside the zip, and the
   importer doesn't open it.
4. **Settings-only exports drop edits to library samples.** A library file goes out as a
   reference to its original even when its current version is an edit
   ([`buildDescriptorFromState`](../src/utils/projectDescriptorUtils.ts#L277)). "Settings-only"
   also isn't: your own audio is packed.
5. **Saves after a zip import don't stick.** The import leaves `project-descriptor.json` in the
   folder, saves write `project.json`, and the loader reads the descriptor first.
6. **The Project Manager's "Settings-Only ZIP" checkbox** changes what every row's download
   button makes, and nothing on the button says so.
7. **Browser Cache Mode can download a backup but can't import one**, and its Save falls back
   to `prompt()` and `confirm()`.
8. **A project exported and imported back isn't recognised as the same project.** The only
   answer to a name clash is a new name.
9. **The words are for developers.** User text names Cloudflare R2 and
   `project-descriptor.json`, and "Project Preset" is offered for sharing and backups, which
   is the submission tool's job.

---

## Decisions (2026-11-26)

1. **History:** a project file carries the original and the current version of each file, the
   two-version rule ([`collapseVersionHistory`](../src/utils/versionHistory.ts)). That's the
   default. Offer the whole history only if someone asks for it.
2. **Replace on import:** overwrite the existing project after a confirmation.
3. **Audio files** stay an export choice.
4. **Browser Cache Mode:** say plainly that the work lives in this browser only, and offer to
   move it into a work folder.

Also agreed:

- Presets are for the official library only, made through Prepare a submission. They aren't
  offered as a way to share a project or back it up.
- No "R2", "descriptor" or "settings-only" in anything a user reads.
- Every download name starts with the project name.

---

## The plan

### Export: three choices

Project ▸ Export… opens one window with three choices.

| Choice | For | Filename |
|---|---|---|
| **Project file** | Opening the project on another computer, or a copy to keep | `<Project>_<date>.zip` |
| **SD card folder** | The SK folder, files renamed to the slots the Spotykach reads. Copy its contents to the card's root. | `<Project>-SK_<date>.zip` |
| **Audio files** | Chosen files as WAVs, in SK folders or one folder | `<Project>-audio_<date>.zip` |

The project file gets one option in step 2, **Include sample-library audio**, off by default:
"Library samples download again when the project opens with internet. Turn this on for a
computer without internet." Until then it carries all audio: leaving library audio out today
means a reference to the library original, which loses an edit (problem 4).

The SD card folder loses "Include Project Bundle Backup" (step 1). From step 2, whether the
project travels with it follows the Settings preference that mirrors projects to the card: the
zip then holds
`WAV_Builder/Projects/<Project>/`, where Build SD writes the mirror
([`exportSDStructure`](../src/utils/exportUtils.ts#L994)) and the Project Manager finds it. A
zip and a direct write give the same card.

Prepare a submission becomes a line under the choices: "Making a preset for the official
library? Prepare a submission." The separate preset download goes.

### The project file

- **The project folder, zipped:** `<Project>/project.json`, `<Project>/Assets/` and the notes,
  the layout [`saveProjectToDirectory`](../src/utils/exportUtils.ts#L1371) writes on disk.
  History is collapsed to original and current (decision 1).
- **The name is inside:** `project.json` carries the project's name, so an import doesn't
  depend on the filename.
- **Library references:** with library audio left out, a version that is the unedited library
  file is stored as a reference, its pack and path (the file record's `origin` and
  `sourceSamplePath`). An edited version is always packed, which fixes problem 4. Loading
  fetches references the way [`hydrateDescriptor`](../src/utils/projectDescriptorUtils.ts#L108)
  does.
- `project-descriptor.json` stays the preset format, for the submission tool and the Presets
  panel only.

### Import: one importer

Project ▸ Import project file… and Project Manager ▸ Import from Zip run the same importer:

1. **Read the zip into a project in memory**, whatever the format: the new project file, a
   Project Manager zip (descriptor and `custom_assets/`), a Full Backup Bundle (`project.json`
   and `blobs/`), or an SK zip with `PROJECT_BACKUP/project_backup.zip` inside.
   `loadProjectFromZip` already reads the descriptor and `blobs/` layouts.
2. **Take the name from inside the file.** The filename is the fallback.
3. **If that name exists, compare** (next section).
4. **Save it with `saveProjectToDirectory`**, like any project, and open it. The folder is then
   in the normal format, which fixes problems 1, 2, 3 and 5 for new imports.

Folders imported before this still hold a `project-descriptor.json`. A save removes it once
`project.json` is written, so problem 5 ends for them too.

### Name clash: compare, then choose

Compare slot by slot using the SHA-256 the versions already store (`hash`, `audioHash` in
[`types.ts`](../src/types.ts#L71)), plus the notes and the config. A library original that
came as a reference is compared by its pack path: the import converted it on this computer,
so its bytes can differ from the exporter's.

- **Identical:** "Already in your workspace, identical." Open it, or Cancel.
- **Different:** one summary line, for example "3 slots differ: B2, G5, P1. Notes differ."
  - **Import as a new project:** the name prompt, as now.
  - **Replace <Project>:** a confirmation that names what goes, then the old folder is deleted
    and the import written, so the two never mix (decision 2).
  - **Cancel.**
- Merging slot by slot can come later, reusing the card sync's comparison grid
  (`SlotGrid6x6`, `SyncComparisonTable`).

### Browser Cache Mode

- The setup wizard's Skip replaces its `confirm()` with a short screen: "Your work lives in this
  browser only. Clearing browser data deletes it." with **Choose a work folder** and
  **Continue in the browser**.
- Save, Export and Import in this mode show the same note with **Move to a work folder**: pick a
  folder, name the project, and the open project is saved there as a project. Connecting a
  folder today drops the project name and the unsaved flag
  ([`handleSetWorkFolder`](../src/App.tsx#L2223)), which leaves the work behind.
- Export works in this mode, as a download. Import needs a work folder, through the same move.

### Menu and names

- **Project menu:** New Fresh Project, Clone Project, Project Manager, **Import project file…**,
  **Export…**, Presets, then Advanced ▸ Clean Up Project. Export leaves Advanced.
- **Project Manager:** Import from Zip stays and runs the importer. A row's download makes the
  project file. The Settings-Only checkbox goes.
- **Names:** every download starts with the project name. In Browser Cache Mode without a
  name: `Untitled-project`. A tape: `<Project>-<color>-tape_<date>.zip`.

---

## Steps

Each lands as its own commit and is click-tested on its own.

1. **Names and words.** Filenames from the project name. The Export window gets the three
   choices and plain text, the Project Preset tab goes, and Prepare a submission stays as a
   line. Import and Export move into the Project menu. The Settings-Only checkbox goes.
   Click-test: every download's name, the Export window, the Project menu.

   **Done on `feature/export-names-and-words`** (`ddc76fe`, `ee8fea0`, `c4e5bfc`, `70b924a`),
   not click-tested yet. Where it went past or short of the step:
   - The project file is the Project Manager's zip (descriptor and `custom_assets/`), now always
     with all audio and the current version of each file. The library option and the
     original-plus-current history come with step 2's format.
   - From step 4: Browser Cache Mode's Save downloads the project file instead of the Full
     Backup Bundle, so Import can read it back. Its `confirm()` stays until step 4.
   - From step 5: `exportSaveState` (the Full Backup Bundle and the SK zip's nested backup) is
     deleted. Nothing called it any more.
   - The user library's zip (`Spotykach_Library_<date>.zip`) and the card dialog's backups keep
     their names: they aren't project downloads.
   - [public/presets/README.md](../public/presets/README.md) §6 now makes a preset from your own
     project through Prepare a submission.
2. **The project file and the importer.** Export writes the project file. The importer reads
   every format, takes the name from inside and saves like a project. A save removes a stale
   `project-descriptor.json`. Fixes problems 1 to 5.
   Click-test: export and import on the same computer and another one, with and without
   library audio; an old Full Backup Bundle, an old Project Manager zip, an SK zip with its
   backup; a project with an edited library sample.

   **Done on `feature/project-file`** (`07773b6`, `f143b2e`, `d55b55f`, `229e73d`), stacked on
   step 1's branch, not click-tested yet. `npm run check:project-file` runs the round trips and
   the old formats in node. Where it went past or short of the step:
   - Folders and zips load through one reader,
     [`projectFile.ts`](../src/utils/projectFile.ts), and `saveProjectToDirectory` writes
     through its `serializeProject`, so the folder and the project file can't drift apart.
   - With both manifests in one folder, the newer one loads. A folder already saved after an
     old import opens its save before the next save removes the descriptor. Clone copies only
     the manifest that loads.
   - The old import's `custom_assets/` stays after that save: the open project may still play
     audio from it. Nothing reads it afterwards, and Clean Up doesn't remove it yet.
   - Library references are only for the built-in packs on the sample bucket
     ([`librarySamplePath`](../src/utils/projectFile.ts)). Archive search results, local
     folders and other projects' files are always packed.
   - A library sample is downloaded and converted on the importing computer, so its bytes can
     differ from the exporter's (the decoder and the sample rate) and its stored hash is
     dropped. A download that fails keeps the version's `samplePath`, the file is listed as
     missing, and the next load tries again. `samplePath` can therefore be in a saved folder
     too.
   - The Project Manager's row download makes the project file with the default, library
     samples by reference.
   - The SK zip carries the project in `WAV_Builder/Projects/<Project>/` when Settings ▸ Keep
     project copies on SD is on, as planned. The project as last saved, as the card reader
     build copies it.
   - From step 5: `buildDescriptorFromState` is deleted. Nothing called it after the export
     moved to the project file.
   - A name clash still asks for a new name. Compare and Replace are step 3.
3. **Compare on a name clash.** Identical, or the summary with Import as a new project and
   Replace.
   Click-test: the same project re-imported, one with a changed slot, Replace.

   **Done on `feature/import-compare`** (`edac51a`), stacked on step 2's branch, not
   click-tested yet. In [`projectCompare.ts`](../src/utils/projectCompare.ts), with cases in
   `npm run check:project-file`. Where it went past or short of the step:
   - Cheapest test first, per slot: between two project files the same version id is the same
     audio (an edit makes a new version), so an unchanged project compares without reading
     audio. Then library originals by pack path, then stored hashes, then the audio's own
     hash.
   - A slot also differs when its file's name, slices or tempo differ. Names and tempo only
     between two project files: an old Project Manager zip has library names and no tempo.
   - The pool is compared by file id.
   - Identical and open in the studio: the dialog says so, with OK only.
   - Replace names the card snapshots (`_sk_backups/`) that go with the old folder, and the
     open project's unsaved changes when it's the one replaced. It reads the import in full,
     library downloads too, before deleting anything. If the old folder can't be deleted
     completely (a file open in another app), the import goes in under a new name, so the two
     still don't mix.
   - After Replace the folder takes the import's spelling of the name: `song` replacing `Song`
     is saved as `song`.
4. **Browser Cache Mode.** The wizard's screen, the note on Save, Export and Import, and Move to
   a work folder.
   Click-test: Skip in the wizard, then Move to a work folder with unsaved work.

   **Done on `feature/browser-mode`** (`77ac812`, `4203bfe`), stacked on step 3's branch, not
   click-tested yet. Where it went past or short of the step:
   - The note also comes up wherever a work folder gets connected without one (Project
     Manager, New Fresh Project, Clone, Settings, a card import into a new project), with
     Connect without it beside Move.
   - After a move for an import, Import project file is a button of its own: the file picker
     needs a fresh click.
   - With nothing to keep, there's no note: Save says "Nothing to save yet", connecting just
     connects, and Import asks for a work folder first.
   - Save with a work folder but no project open (as after Connect without it) asks for a name
     in the app's dialog instead of `prompt()`, and refuses a name another project has. The
     other half of problem 7.
   - The move saves the open project and then opens it from the folder, so what's in the studio
     is what's on disk.
   - No lasting "browser only" mark in the header: the note shows where it matters.
5. **Delete the unreachable path.** ImportModal, `handleImportFiles`, `analyzeImport` and what
   only they use, `loadProjectFromZip` too: step 2's importer reads its formats without it.

---

## Not in this plan

- Auto-save's recovery copy, which never comes back with a project folder connected. It's in
  the roadmap's Bugs.
- Card import and Build SD.
- The Mangler's own project files (`.mangler.zip`).
