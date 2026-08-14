import type JSZip from 'jszip';
import { TAPE_COLORS } from '../types';
import type { AppState, ProjectConfig } from '../types';
import sdCardInstructions from '../../docs/how_to_copy_to_SDcard.md?raw';

// ==========================================
// SHARED HELPERS
// ==========================================

export interface ConfigSyncData {
    id: 'config';
    decision: 'keep_local' | 'use_backup' | 'skip' | 'export' | 'delete_local' | 'delete_backup';
    backupConfig?: ProjectConfig;
}

export type SlotSyncDecision = 'export' | 'skip' | 'delete' | 'keep_local' | 'use_backup' | 'delete_local' | 'delete_backup';

export interface ExportSDOptions {
    skMode: 'overwrite' | 'clean';
    /**
     * Copy the project source (project.json + Assets) onto the card alongside the
     * build. Off unless explicitly enabled — the card is a build target, not a
     * backup. Replaces `backupSKToProject`, which was declared here but never read.
     */
    mirrorProjectToSD?: boolean;
    workHandle?: FileSystemDirectoryHandle | null;
    projectName?: string;
    includeProject?: boolean;
    directWrite?: boolean;
    smartSync?: boolean;
    destinationHandle?: FileSystemDirectoryHandle;
    syncUserLibrary?: boolean;
    userLibrary?: import('../types').UserLibrary;
    syncDecisions?: Record<string, SlotSyncDecision> | Array<{ id: string, decision: SlotSyncDecision } | ConfigSyncData>;
    includeConfig?: boolean;
    forceOverwrite?: boolean;
    onConvert?: (blob: Blob, metadata?: import('../types').WavMetadata) => Promise<Blob>;
}

/**
 * The keys this build understands. Also the filter that decides what counts as an
 * *unknown* pair on the way in — matched case-insensitively by prefix, because the
 * format pads every key to 8 characters.
 */
export const KNOWN_CONFIG_KEYS = ['MID_CH_A', 'MID_CH_B', 'MID_PS_A', 'MID_PS_B', 'PRE_LOAD'] as const;

const isKnownConfigKey = (key: string): boolean =>
    KNOWN_CONFIG_KEYS.some(known => key.trim().toUpperCase().startsWith(known));

export const generateConfigText = (config: ProjectConfig): string => {
    const lines: string[] = [];
    const appendSetting = (key: string, value: any) => {
        lines.push(key.padEnd(8, ' ').substring(0, 8));
        let valStr = '0';
        if (value === true || value === '1' || value === 1) valStr = '1';
        else if (value === false || value === '0' || value === 0) valStr = '0';
        else if (value !== undefined && value !== null) valStr = value.toString();
        lines.push(valStr);
        lines.push(''); // Empty line separator
    };
    // Use defaults if missing (for older projects)
    appendSetting('mid_ch_a', config?.mid_ch_a ?? 1);
    appendSetting('mid_ch_b', config?.mid_ch_b ?? 2);
    appendSetting('mid_ps_a', config?.mid_ps_a ?? false);
    appendSetting('mid_ps_b', config?.mid_ps_b ?? false);
    appendSetting('pre_load', config?.pre_load ?? true);
    // Pairs a previous read didn't recognise, written back verbatim after the known
    // ones. A key that has since *become* known is dropped rather than emitted
    // twice — the field above is the current truth for it.
    for (const setting of config?.unknown ?? []) {
        if (!setting?.key || isKnownConfigKey(setting.key)) continue;
        appendSetting(setting.key.trim(), setting.value);
    }
    return lines.join('\n');
};

export const verifyProjectBlobs = async (state: AppState): Promise<Array<{ fileId: string; fileName: string; versionId: string; blobRef: string; reason: string }>> => {
    const unreadableFiles: Array<{ fileId: string; fileName: string; versionId: string; blobRef: string; reason: string }> = [];

    for (const [id, file] of Object.entries(state.files)) {
        for (const version of file.versions) {
            if (version.blob) {
                try {
                    // Quick check if blob is readable.
                    await version.blob.slice(0, 1).arrayBuffer();
                } catch (e: any) {
                    unreadableFiles.push({
                        fileId: id,
                        fileName: file.name || file.originalName || 'Unknown Audio',
                        versionId: version.id,
                        blobRef: version.blobRef || 'memory',
                        reason: e.message || 'File lock or read error',
                    });
                    break; // One failed version is enough to flag the file
                }
            }
        }
    }
    return unreadableFiles;
};

export const downloadBlob = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

// Suffix for the scratch file an atomic write goes through. Stays in the same
// directory as the target, because a swap can only happen within one directory.
const TEMP_WRITE_SUFFIX = '.wbtmp';

// `move()` renames/replaces within a directory. It ships in Chromium but is not
// in the DOM lib, hence the local shape.
type MovableFileHandle = FileSystemFileHandle & { move(newName: string): Promise<void> };

// Feature-detected once so unsupported engines fall back to writing in place.
const supportsHandleMove = (): boolean =>
    typeof (globalThis as { FileSystemFileHandle?: { prototype?: { move?: unknown } } })
        .FileSystemFileHandle?.prototype?.move === 'function';

// Byte-compare two blobs of equal size in chunks, so we never hold two full
// copies in memory. Used to decide whether a write can be skipped.
const blobsAreIdentical = async (a: Blob, b: Blob): Promise<boolean> => {
    if (a.size !== b.size) return false;
    const CHUNK = 1024 * 1024;
    for (let offset = 0; offset < a.size; offset += CHUNK) {
        const end = Math.min(offset + CHUNK, a.size);
        const [aBuf, bBuf] = await Promise.all([
            a.slice(offset, end).arrayBuffer(),
            b.slice(offset, end).arrayBuffer(),
        ]);
        const aBytes = new Uint8Array(aBuf);
        const bBytes = new Uint8Array(bBuf);
        for (let i = 0; i < aBytes.length; i++) {
            if (aBytes[i] !== bBytes[i]) return false;
        }
    }
    return true;
};

/**
 * How to decide whether an existing file already holds what we're about to write.
 *
 * - `content` — byte-compare when the sizes match. Correct everywhere, and the
 *   only safe choice for SD writes: two different WAVs of equal length are not
 *   the same file, which the old size-only check assumed.
 * - `size` — skip when the sizes match, without reading. Valid *only* where the
 *   filename already determines the content, e.g. `Assets/<versionId>.wav`, whose
 *   id is minted per version and never rewritten with different bytes. Avoids
 *   re-reading every asset on every project save.
 * - `always` — never skip.
 */
export type WriteCompare = 'content' | 'size' | 'always';

// Helper: Safely write a blob into a directory under `fileName`.
//
// The write is **atomic**: the bytes land in a temp file that is swapped onto the
// target name once it has closed cleanly. `createWritable()` on the target would
// expose a truncated or partial file if the write were interrupted — and the
// original is gone by then, which no amount of snapshotting recovers.
//
// Takes the parent directory rather than a file handle because a swap needs a
// sibling to swap with. File objects are buffered into memory first to prevent
// NotReadableError from OS-level file locks.
export const safeWriteBlob = async (
    dirHandle: FileSystemDirectoryHandle,
    fileName: string,
    blob: Blob,
    compare: WriteCompare = 'content'
): Promise<boolean> => {
    if (compare !== 'always') {
        try {
            const existingFile = await (await dirHandle.getFileHandle(fileName)).getFile();
            const same = compare === 'size'
                ? existingFile.size === blob.size
                : await blobsAreIdentical(existingFile, blob);
            if (same) return false; // Skipped
        } catch {
            // Doesn't exist or is unreadable — write it.
        }
    }

    let dataToWrite: Blob | ArrayBuffer = blob;
    if (blob instanceof File) {
        try {
            dataToWrite = await blob.arrayBuffer();
        } catch {
            console.error(`[SafeWrite] NotReadableError for ${fileName}. Ref:`, blob);
            throw new Error(`File "${fileName}" is unreadable. It may have been moved, deleted, or locked by another app.`);
        }
    }

    if (!supportsHandleMove()) {
        // No swap available: in-place write, i.e. the old behaviour.
        const target = await dirHandle.getFileHandle(fileName, { create: true });
        const w = await target.createWritable();
        await w.write(dataToWrite);
        await w.close();
        return true;
    }

    const tempName = `${fileName}${TEMP_WRITE_SUFFIX}`;
    try {
        const tempHandle = await dirHandle.getFileHandle(tempName, { create: true }) as MovableFileHandle;
        const w = await tempHandle.createWritable();
        await w.write(dataToWrite);
        await w.close();
        // Only now does the target change. move() replaces an existing destination.
        await tempHandle.move(fileName);
        return true; // Wrote
    } catch (e) {
        // Leave the original intact and take the scratch file with us.
        try { await dirHandle.removeEntry(tempName); } catch { /* already gone */ }
        throw e;
    }
};

// Generic recursive copy/sync (Additive)
export const syncDirectory = async (
    sourceRoot: FileSystemDirectoryHandle,
    targetRoot: FileSystemDirectoryHandle,
    dirName: string,
    onProgress?: (percent: number) => void
) => {
    try {
        const sourceDir = await sourceRoot.getDirectoryHandle(dirName);
        const targetDir = await targetRoot.getDirectoryHandle(dirName, { create: true });

        // Count items for simple progress
        let totalItems = 0;
        // @ts-ignore
        for await (const _ of sourceDir.values()) totalItems++;
        let processed = 0;

        // @ts-ignore
        for await (const [name, entry] of sourceDir.entries()) {
            processed++;
            if (onProgress && totalItems > 0) onProgress(processed / totalItems);

            if (entry.kind === 'file') {
                const sourceFileHandle = entry as FileSystemFileHandle;
                const sourceFile = await sourceFileHandle.getFile();

                let shouldCopy = true;
                try {
                    const targetFileHandle = await targetDir.getFileHandle(name);
                    const targetFile = await targetFileHandle.getFile();
                    // Compare Last Modified
                    if (targetFile.lastModified >= sourceFile.lastModified) {
                        shouldCopy = false; // Target is newer or same
                    }
                } catch (e) {
                    // Target doesn't exist
                }

                if (shouldCopy) {
                    await safeWriteBlob(targetDir, name, sourceFile);
                }

            } else if (entry.kind === 'directory') {
                // Recursive sync
                await syncDirectory(sourceDir, targetDir, name);
            }
        }
    } catch (e) {
        console.warn(`Sync failed for ${dirName} (Source might not exist)`, e);
    }
};

export const saveUserLibraryToDirectory = async (
    library: import('../types').UserLibrary,
    rootHandle: FileSystemDirectoryHandle,
    skipIds?: Set<string>,
    onProgress?: (msg: string) => void
) => {
    try {
        const userLibDir = await rootHandle.getDirectoryHandle('User_Library', { create: true });
        const files = Object.values(library.files);
        const expectedNames = new Set(files.filter(f => !skipIds?.has(f.id)).map(f => f.name));

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (skipIds?.has(file.id)) {
                onProgress?.(`Skipping missing file: ${file.name}`);
                continue;
            }

            const mainVerId = file.currentVersionId;
            const version = file.versions.find(v => v.id === mainVerId) || file.versions[0];

            if (version?.blob) {
                try {
                    await safeWriteBlob(userLibDir, file.name, version.blob);
                } catch (e) {
                    console.warn(`Failed to write library file: ${file.name}`, e);
                }
            }
            onProgress?.(`Saving Library: ${i + 1}/${files.length}`);
        }

        // Remove files that no longer exist in library state
        // @ts-ignore
        for await (const [name, entry] of userLibDir.entries()) {
            if (entry.kind !== 'file') continue;

            // Skip browser temporary files to prevent NoModificationAllowedError
            if (name.endsWith('.crswap') || name.endsWith('.tmp')) continue;

            if (!expectedNames.has(name)) {
                try {
                    await userLibDir.removeEntry(name);
                } catch (e) {
                    console.warn(`Failed to remove stale library file: ${name}`, e);
                }
            }
        }
    } catch (e) {
        console.error("Failed to save User Library to directory", e);
        throw e;
    }
};


// Clean Directory Helper (Recursive Delete Content)
export const cleanDirectory = async (rootHandle: FileSystemDirectoryHandle, dirName: string) => {
    try {
        // Try to get handle first to see if it exists
        await rootHandle.getDirectoryHandle(dirName);
        // Remove it
        await rootHandle.removeEntry(dirName, { recursive: true });
    } catch (e) {
        // Doesn't exist, all good
    }
};

// Clean Orphaned Assets Helper
export const getOrphanedAssets = async (rootHandle: FileSystemDirectoryHandle, projectName: string, activeFilesState: AppState['files']) => {
    try {
        const projectsHandle = await rootHandle.getDirectoryHandle('Projects', { create: false });
        const projectHandle = await projectsHandle.getDirectoryHandle(projectName, { create: false });
        const assetsHandle = await projectHandle.getDirectoryHandle('Assets', { create: false });

        const activeBlobNames = new Set<string>();
        for (const file of Object.values(activeFilesState)) {
            for (const version of file.versions) {
                activeBlobNames.add(`${version.id}.wav`);
            }
        }

        const orphans: { name: string, size: number }[] = [];
        // @ts-ignore
        for await (const [name, entry] of assetsHandle.entries()) {
            if (entry.kind === 'file' && name.endsWith('.wav')) {
                if (!activeBlobNames.has(name)) {
                    const file = await (entry as FileSystemFileHandle).getFile();
                    orphans.push({ name, size: file.size });
                }
            }
        }
        return orphans;
    } catch (e) {
        return [];
    }
};

export const cleanOrphanedAssets = async (rootHandle: FileSystemDirectoryHandle, projectName: string, activeFilesState: AppState['files'], onProgress?: (msg: string) => void) => {
    try {
        const projectsHandle = await rootHandle.getDirectoryHandle('Projects', { create: false });
        const projectHandle = await projectsHandle.getDirectoryHandle(projectName, { create: false });
        const assetsHandle = await projectHandle.getDirectoryHandle('Assets', { create: false });

        // Collect all active version blohrefs (which are filenames)
        const activeBlobNames = new Set<string>();
        for (const file of Object.values(activeFilesState)) {
            for (const version of file.versions) {
                activeBlobNames.add(`${version.id}.wav`);
            }
        }

        let removedCount = 0;
        // @ts-ignore
        for await (const [name, entry] of assetsHandle.entries()) {
            if (entry.kind === 'file' && name.endsWith('.wav')) {
                if (!activeBlobNames.has(name)) {
                    try {
                        onProgress?.(`Removing orphaned asset ${name}...`);
                        await assetsHandle.removeEntry(name);
                        removedCount++;
                    } catch (e) {
                        console.warn(`Failed to remove orphaned asset ${name}`, e);
                    }
                }
            }
        }
        if (removedCount > 0) {
            onProgress?.(`Cleaned ${removedCount} unused history file(s) from disk.`);
        }
    } catch (e) {
        // Assets folder might not exist, or permission error, ignore gracefully
        console.warn("Failed to clean orphaned assets from disk", e);
    }
};

const generateReadme = (state: AppState): string => {
    const dateStr = new Date().toISOString().split('T')[0];
    let content = `SPOTYKACH WAV BUILDER EXPORT
Date: ${dateStr}
App Version: ${__APP_VERSION__}

`;

    if (state.projectNotes) {
        content += `========================================================================
PROJECT NOTES
========================================================================
${state.projectNotes}

`;
    }

    // --- NEW: Tape Notes under Project Notes ---
    let hasTapeNotes = false;
    TAPE_COLORS.forEach(c => { if (state.tapes[c].notes) hasTapeNotes = true; });

    if (hasTapeNotes) {
        content += `------------------------------------------------------------------------
TAPE NOTES
------------------------------------------------------------------------
`;
        TAPE_COLORS.forEach(c => {
            const notes = state.tapes[c].notes;
            if (notes) {
                content += `[${c.toUpperCase()}]: ${notes}\n`;
            }
        });
        content += '\n';
    }

    content += `========================================================================
========================================================================
FOLDER STRUCTURE (STRICT MODE)
========================================================================
Files in the SK folder are renamed to 1.WAV ... 6.WAV based on their slot position.
This is required by the Spotykach firmware.

`;

    TAPE_COLORS.forEach(color => {
        const tape = state.tapes[color];
        const folderName = color.charAt(0).toUpperCase(); // B, G, P...
        const activeSlots = tape.slots.filter(s => s.fileId);

        if (activeSlots.length > 0 || tape.notes) {
            content += `[${color.toUpperCase()}] -> SK/${folderName}/\n`;
            // Tape notes already shown above in the Notes section, but keep them here too for folder context if desired?
            // User requested them under project notes, so I'll keep this section focused on the files.
            activeSlots.forEach(slot => {
                const file = state.files[slot.fileId!];
                content += `  Slot ${slot.id}: ${slot.id}.WAV  (Source: "${file?.originalName || file?.name || 'Unknown'}")\n`;
            });
            content += '\n';
        }
    });

    content += `
========================================================================
LEGAL / LICENSES
========================================================================
`;

    // 1. Gather all files actually used in tapes
    const usedFileIds = new Set<string>();
    TAPE_COLORS.forEach(c => {
        state.tapes[c].slots.forEach(s => {
            if (s.fileId) usedFileIds.add(s.fileId);
        });
    });

    // 2. Specific license and origin collection
    const licenses = new Set<string>();
    const origins = new Set<string>();

    usedFileIds.forEach(id => {
        const file = state.files[id];
        if (!file) return;

        let origin = file.origin;
        let license = file.license;

        // HEALING: Handle legacy/generic origins for the Hainbach pack specifically if metadata is missing
        const isHainbachPath = file.sourceSamplePath?.toLowerCase().includes('/hainbach/');
        if ((!origin || origin === 'Sample Pack') && isHainbachPath) {
            origin = "Hainbach's Spotykach Tapes";
            license = "free to use in your music, no reselling as part of sample pack or instrument.";
        }

        if (license) {
            const displayOrigin = origin && origin !== 'Sample Pack' ? origin : 'Hainbach\'s Spotykach Tapes';
            licenses.add(`[${displayOrigin}] ${license}`);
        }
        
        if (origin && origin !== 'Sample Pack') {
            origins.add(origin);
        } else if (isHainbachPath) {
            origins.add("Hainbach's Spotykach Tapes");
        } else {
            origins.add('Custom Upload / SK Import');
        }
    });

    if (licenses.size > 0) {
        content += "This project uses samples with the following licenses:\n\n";
        licenses.forEach(l => content += `${l}\n\n---\n\n`);
    } else {
        content += "No specific license information found for samples.\n";
    }

    if (origins.size > 0) {
        content += "\nSample Origins:\n";
        origins.forEach(o => content += `- ${o}\n`);
    }

    return content;
};


// ==========================================
// 1. PROJECT BACKUP (Full State)
// ==========================================

export const exportSaveState = async (
    state: AppState, 
    returnZip = false, 
    onProgress?: (msg: string | undefined, progress?: number) => void,
    settingsOnly = false
): Promise<JSZip | void> => {
    onProgress?.("Starting project backup...", 0);
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();

    if (settingsOnly) {
        onProgress?.("Generating project descriptor...", 10);
        const { buildDescriptorFromState } = await import('./projectDescriptorUtils');
        const { descriptor, customBlobs } = buildDescriptorFromState(state, { settingsOnly: true });

        zip.file("project-descriptor.json", JSON.stringify(descriptor, null, 2));

        const customAssetsFolder = zip.folder("custom_assets");
        if (customAssetsFolder) {
            for (const [blobRef, blob] of Object.entries(customBlobs)) {
                const filename = blobRef.split('/').pop();
                if (filename) {
                    customAssetsFolder.file(filename, blob);
                }
            }
        }
        onProgress?.("Saving metadata...", 20);
    } else {
        const serializedFiles: any = {};
        const blobsFolder = zip.folder("blobs");

        onProgress?.("Serializing file records...", 10);
        for (const [id, file] of Object.entries(state.files)) {
            serializedFiles[id] = {
                ...file,
                versions: file.versions.map(v => {
                    const blobName = `${v.id}.wav`;
                    if (blobsFolder && v.blob) {
                        try {
                            blobsFolder.file(blobName, v.blob);
                        } catch (e) {
                            console.warn(`[Export] Skipping unreadable blob for ${blobName}`);
                        }
                    }

                    return {
                        ...v,
                        blob: null,
                        blobRef: blobName
                    };
                })
            };
        }

        onProgress?.("Saving metadata...", 20);
        const serializedState = {
            files: serializedFiles,
            tapes: state.tapes,
            projectNotes: state.projectNotes,
            projectConfig: state.projectConfig, // Include project config
            metadata: {
                appName: "Spotykach WAV Builder",
                version: __APP_VERSION__,
                exportDate: new Date().toISOString()
            }
        };

        zip.file("project.json", JSON.stringify(serializedState, null, 2));
    }

    // Create notes.md if notes exist
    let notesContent = "";
    if (state.projectNotes) {
        notesContent += `# Project Notes\n\n${state.projectNotes}\n\n`;
    }
    TAPE_COLORS.forEach(color => {
        const tapeNotes = state.tapes[color]?.notes;
        if (tapeNotes) {
            notesContent += `## Tape ${color} Notes\n\n${tapeNotes}\n\n`;
        }
    });

    if (notesContent.trim() !== "") {
        zip.file("notes.md", notesContent);
    }

    if (returnZip) {
        onProgress?.("Project backup zip prepared for bundling.", 30);
        return zip;
    }

    onProgress?.("Generating final ZIP file...", 40);
    const content = await zip.generateAsync({ type: "blob" }, (metadata) => {
        onProgress?.(undefined, 40 + (metadata.percent * 0.6));
    });
    const dateStr = new Date().toISOString().split('T')[0];
    downloadBlob(content, `Spotykach_Project_${dateStr}.zip`);
    onProgress?.("Download started.", 100);
};


// ==========================================
// 2. SD CARD STRUCTURE (Strict)
// ==========================================

export const exportSDStructure = async (state: AppState, options: ExportSDOptions, onProgress?: (msg: string | undefined, progress?: number) => void) => {

    // A. DIRECT WRITE (FileSystem API)
    if (options.directWrite) {
        try {
            // @ts-ignore
            if (!('showDirectoryPicker' in window)) throw new Error("Browser not supported");

            let rootHandle = options.destinationHandle;
            if (!rootHandle) {
                onProgress?.("Requesting directory access...", 0);
                // @ts-ignore
                rootHandle = await window.showDirectoryPicker({ mode: 'readwrite', startIn: 'documents' });
            }

            if (!rootHandle) throw new Error("No destination selected");

            if (options.skMode === 'clean') {
                onProgress?.("Cleaning old Sync...", 5);
                await cleanDirectory(rootHandle, 'SK');
            }

            const skHandle = await rootHandle.getDirectoryHandle('SK', { create: true });

            // 1. Write Readme
            onProgress?.("Writing README.md...", 15);
            const readmeHandle = await rootHandle.getFileHandle('README.md', { create: true });
            const readmeWritable = await readmeHandle.createWritable();
            await readmeWritable.write(generateReadme(state));
            await readmeWritable.close();

            // 2. Config.txt Generation
            let configToUse: ProjectConfig | undefined = undefined;
            if (options.includeConfig !== false) {
                if (Array.isArray(options.syncDecisions)) {
                    const configEntry = options.syncDecisions.find(d => d.id === 'config') as ConfigSyncData | undefined;
                    if (configEntry && (configEntry.decision === 'keep_local' || configEntry.decision === 'use_backup' || configEntry.decision === 'export')) {
                        configToUse = configEntry.decision === 'use_backup' ? configEntry.backupConfig : state.projectConfig;
                    } else if (!configEntry && state.projectConfig) {
                        configToUse = state.projectConfig;
                    }
                } else if (options.syncDecisions?.['config']) {
                    const d = options.syncDecisions['config'];
                    if (d === 'export' || d === 'keep_local') {
                        configToUse = state.projectConfig;
                    }
                } else if (state.projectConfig) {
                    configToUse = state.projectConfig;
                }
            }

            if (configToUse) {
                const finalConfig = configToUse || state.projectConfig;
                if (finalConfig) {
                    onProgress?.("Writing config.txt...", 18);
                    const configText = generateConfigText(finalConfig);
                    await safeWriteBlob(skHandle, 'config.txt', new Blob([configText], { type: 'text/plain' }), options.forceOverwrite ? 'always' : 'content');
                }
            }

            // 3. Process Tapes
            let writtenCount = 0;
            let skippedCount = 0;
            const activeSlots = TAPE_COLORS.reduce((acc, c) => acc + state.tapes[c].slots.filter(s => s.fileId).length, 0);
            let processed = 0;

            for (const color of TAPE_COLORS) {
                const tape = state.tapes[color];
                const folderName = color.charAt(0).toUpperCase();
                const tapeHandle = await skHandle.getDirectoryHandle(folderName, { create: true });

                for (const slot of tape.slots) {
                    const slotRef = `${color}${slot.id}`;
                    let decision: SlotSyncDecision | undefined = undefined;

                    if (Array.isArray(options.syncDecisions)) {
                        decision = options.syncDecisions.find(d => d.id === slotRef)?.decision;
                    } else if (options.syncDecisions) {
                        decision = options.syncDecisions[slotRef];
                    } else if (!options.syncDecisions && slot.fileId) {
                        decision = 'export';
                    }

                    const fileName = `${slot.id}.WAV`;

                    if (decision === 'delete' || decision === 'delete_local') {
                        try { await tapeHandle.removeEntry(fileName); } catch (e) { }
                        continue;
                    }

                    if (decision === 'skip' || !slot.fileId || decision === 'delete_backup') {
                        if (slot.fileId) skippedCount++;
                        continue;
                    }

                    if (decision === 'export' || decision === 'keep_local' || decision === 'use_backup') {
                        const fileId = slot.fileId;
                        const file = state.files[fileId];
                        const version = file?.versions.find(v => v.id === file.currentVersionId);

                        if (version?.blob) {
                            processed++;
                            onProgress?.(`Writing ${color} Tape ${slot.id}...`, 20 + ((processed / Math.max(1, activeSlots)) * 50));
                            
                            let blobToWrite = version.blob;
                            if (options.onConvert && version.blob.type.startsWith('audio/')) {
                                onProgress?.(`Processing ${color} Tape ${slot.id} for Hardware...`);
                                try {
                                    const metadata: import('../types').WavMetadata = {
                                        id: file.id,
                                        processing: version.processing,
                                        tempo: file.metadata?.tempo,
                                        slicePoints: file.metadata?.slicePoints
                                    };
                                    blobToWrite = await options.onConvert(version.blob, metadata);
                                } catch (e) {
                                    console.error(`Failed to convert ${color} Tape ${slot.id} to WAV`, e);
                                    throw new Error(`Critical: Failed to convert ${color} Tape ${slot.id} for hardware. Export aborted to prevent incompatible files on SD.`);
                                }
                            }

                            const wrote = await safeWriteBlob(tapeHandle, fileName, blobToWrite, options.forceOverwrite ? 'always' : 'content');
                            if (wrote) writtenCount++; else skippedCount++;
                        }
                    }
                }
            }

            // 4. Project Identity
            onProgress?.("Writing project identity...", 80);
            const projectIdentity = {
                metadata: {
                    appName: "Spotykach WAV Builder",
                    version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0',
                    exportDate: new Date().toISOString(),
                    projectName: options.projectName
                },
                projectConfig: state.projectConfig,
                projectNotes: state.projectNotes,
                tapes: state.tapes,
                files: Object.entries(state.files).reduce((acc, [id, f]) => {
                    // Only include necessary metadata for identity/re-import
                    acc[id] = {
                        name: f.name,
                        originalName: f.originalName,
                        origin: f.origin,
                        license: f.license,
                        tags: f.tags,
                        sourceSamplePath: f.sourceSamplePath
                    };
                    return acc;
                }, {} as Record<string, any>)
            };
            const identityHandle = await skHandle.getFileHandle('project.json', { create: true });
            const identityWritable = await identityHandle.createWritable();
            await identityWritable.write(JSON.stringify(projectIdentity, null, 2));
            await identityWritable.close();

            // 5. Project source mirror — opt-in only (locked decision 6).
            if (options.mirrorProjectToSD && options.workHandle && options.projectName) {
                onProgress?.("Mirroring Project Source to card...", 85);
                try {
                    const wavBuilderDir = await rootHandle.getDirectoryHandle('WAV_Builder', { create: true });
                    const wbProjectsDir = await wavBuilderDir.getDirectoryHandle('Projects', { create: true });
                    const targetProjectDir = await wbProjectsDir.getDirectoryHandle(options.projectName, { create: true });
                    const sourceProjectsDir = await options.workHandle.getDirectoryHandle('Projects');
                    const sourceProjectDir = await sourceProjectsDir.getDirectoryHandle(options.projectName);

                    // Copy project.json
                    const sJson = await sourceProjectDir.getFileHandle('project.json');
                    await safeWriteBlob(targetProjectDir, 'project.json', await sJson.getFile());

                    // Copy Assets
                    try {
                        const sAssets = await sourceProjectDir.getDirectoryHandle('Assets');
                        const tAssets = await targetProjectDir.getDirectoryHandle('Assets', { create: true });
                        // @ts-ignore
                        for await (const [name, entry] of sAssets.entries()) {
                            if (entry.kind === 'file') {
                                const sf = await sAssets.getFileHandle(name);
                                await safeWriteBlob(tAssets, name, await sf.getFile());
                            }
                        }
                    } catch (e) { }
                } catch (e) {
                    console.warn("Project source mirror failed", e);
                }
            }

            onProgress?.(`Sync Complete: ${writtenCount} written, ${skippedCount} skipped.`, 100);

        } catch (e: any) {
            console.error("Direct Write Error:", e);
            throw e;
        }
        return;
    }

    // B. ZIP EXPORT
    onProgress?.("Preparing SD Card ZIP...", 0);
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    const skFolder = zip.folder("SK");
    if (!skFolder) throw new Error("Failed to create ZIP folder");

    zip.file("README.md", generateReadme(state));
    zip.file("INSTALL_INSTRUCTIONS.txt", sdCardInstructions);

    // Config.txt
    if (options.includeConfig !== false && state.projectConfig) {
        skFolder.file("config.txt", generateConfigText(state.projectConfig));
    }

    let filesAdded = 0;
    const totalSlots = TAPE_COLORS.reduce((acc, c) => acc + state.tapes[c].slots.filter(s => s.fileId).length, 0);

    for (const color of TAPE_COLORS) {
        const tape = state.tapes[color];
        const folderName = color.charAt(0).toUpperCase();
        const tapeFolder = skFolder.folder(folderName);

        if (tapeFolder) {
            for (const slot of tape.slots) {
                if (slot.fileId) {
                    const file = state.files[slot.fileId];
                    const version = file?.versions.find(v => v.id === file.currentVersionId);
                    if (version?.blob) {
                        let blobToWrite = version.blob;
                        if (options.onConvert && version.blob.type.startsWith('audio/')) {
                            onProgress?.(`Processing ${color} Tape ${slot.id} for Hardware...`);
                            try {
                                blobToWrite = await options.onConvert(version.blob);
                            } catch (e) {
                                console.error(`Failed to convert ${color} Tape ${slot.id} to WAV`, e);
                                throw new Error(`Critical: Failed to convert ${color} Tape ${slot.id} for hardware. Export aborted.`);
                            }
                        }
                        tapeFolder.file(`${slot.id}.WAV`, blobToWrite);
                        filesAdded++;
                        onProgress?.(`Adding ${color} Tape ${slot.id}...`, 10 + ((filesAdded / Math.max(1, totalSlots)) * 80));
                    }
                }
            }
        }
    }

    if (options.includeProject) {
        onProgress?.("Bundling Project Backup...", 90);
        const pZip = await exportSaveState(state, true) as JSZip;
        const backupBlob = await pZip.generateAsync({ type: "blob" });
        skFolder.folder("PROJECT_BACKUP")?.file("project_backup.zip", backupBlob);
    }

    const content = await zip.generateAsync({ type: "blob" }, (meta) => {
        onProgress?.("Compressing Final ZIP...", 95 + (meta.percent * 0.05));
    });
    const dStr = new Date().toISOString().split('T')[0];
    downloadBlob(content, `Spotykach_SD_${dStr}.zip`);
    onProgress?.("Done.", 100);
};

// ==========================================
// 3. FILES ONLY (Loose)
// ==========================================

export interface ExportFilesOptions {
    fileIds: string[];
    keepStructure?: boolean;
    onConvert?: (blob: Blob) => Promise<Blob>;
    /**
     * Replaces the default project README. A loose export isn't a project build —
     * Browse mode ships instructions for organising the files by hand instead of a
     * listing of a 6×6 grid the user never assembled.
     */
    readme?: string;
}

export const exportFilesOnly = async (state: AppState, options: ExportFilesOptions, onProgress?: (msg: string | undefined, progress?: number) => void) => {
    onProgress?.("Starting File Export...", 0);
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();

    // Add README
    onProgress?.("Adding Information...", 5);
    zip.file("README.md", options.readme ?? generateReadme(state)); // Don't mention project bundle in this context

    // Helper to find location
    const findFileLocation = (fileId: string): string | null => {
        for (const color of TAPE_COLORS) {
            if (state.tapes[color].slots.some(s => s.fileId === fileId)) {
                return color.charAt(0).toUpperCase(); // B, G, P...
            }
        }
        return null; // Unassigned
    };

    let count = 0;
    const total = options.fileIds.length;

    for (let i = 0; i < total; i++) {
        const fileId = options.fileIds[i];
        const file = state.files[fileId];
        if (!file) continue;

        const version = file.versions.find(v => v.id === file.currentVersionId);
        if (!version?.blob) continue;

        count++;
        // Progress from 10% to 60%
        const percent = 10 + ((i / total) * 50);
        onProgress?.(`Adding file ${i + 1}/${total}...`, percent);

        let folderName = '';
        if (options.keepStructure) {
            const tapLoc = findFileLocation(fileId);
            folderName = tapLoc ? tapLoc : 'POOL';
        }

        const targetFolder = folderName ? zip.folder(folderName) : zip;

        if (targetFolder) {
            // Naming Logic
            let baseName = file.name || file.originalName || `file_${fileId}`;
            // Sanitize extension
            baseName = baseName.replace(/\.wav$/i, '') + '.wav';

            let blobToWrite = version.blob;
            if (options.onConvert && version.blob.type.startsWith('audio/')) {
                onProgress?.(`Processing ${baseName} for Hardware...`);
                try {
                    blobToWrite = await options.onConvert(version.blob);
                } catch (e) {
                    console.error(`Failed to convert ${baseName} to WAV`, e);
                    throw new Error(`Critical: Failed to convert ${baseName} for hardware. Export aborted.`);
                }
            }

            targetFolder.file(baseName, blobToWrite);
        }
    }

    onProgress?.(`Processed ${count} files.`, 60);
    onProgress?.("Compressing ZIP...", 65);
    const content = await zip.generateAsync({ type: "blob" }, (metadata) => {
        // 65% to 95%
        onProgress?.(undefined, 65 + (metadata.percent * 0.3));
    });
    const dateStr = new Date().toISOString().split('T')[0];

    onProgress?.("Triggering Download...", 95);
    downloadBlob(content, `Spotykach_Selection_${dateStr}.zip`);
    onProgress?.("Done.", 100);
};


// ==========================================
// LEGACY / UTILS
// ==========================================

export const exportSingleTape = async (color: string, tape: any, files: Record<string, any>) => {
    // ... (Keep existing if needed for Single Tape view, updating to strict if required by user? 
    // For now, let's strictly name them too as it matches the "Tape" concept)
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    const folderName = color.charAt(0).toUpperCase();
    const tapeFolder = zip.folder(folderName);

    if (!tapeFolder) throw new Error("Zip Error");

    let count = 0;
    tape.slots.forEach((slot: any) => {
        if (slot.fileId && files[slot.fileId]) {
            const file = files[slot.fileId];
            const version = file.versions.find((v: any) => v.id === file.currentVersionId);
            if (version?.blob) {
                tapeFolder.file(`${slot.id}.WAV`, version.blob); // STRICT
                count++;
            }
        }
    });

    if (count === 0) throw new Error("Tape is empty");

    const content = await zip.generateAsync({ type: "blob" });

    downloadBlob(content, `${color}_Tape.zip`);
};

export const exportSingleFile = async (file: { versions: any[], currentVersionId: string, name?: string, originalName?: string }) => {
    const version = file.versions.find(v => v.id === file.currentVersionId);
    if (!version?.blob) {
        console.error("No blob found for file export");
        return;
    }

    // Sanitize name
    let fileName = file.name || file.originalName || 'export';
    if (!fileName.toLowerCase().endsWith('.wav')) fileName += '.wav';

    downloadBlob(version.blob, fileName);
};


// ==========================================
// 4. PROJECT MANAGEMENT (Local/SD)
// ==========================================

export const scanForProjects = async (rootHandle: FileSystemDirectoryHandle): Promise<import('../types').ProjectSummary[]> => {
    console.log(`[scanForProjects] Starting scan on root: ${rootHandle.name}`);
    const projects: import('../types').ProjectSummary[] = [];

    // Helper to scan a specific projects directory
    const scanDir = async (parentHandle: FileSystemDirectoryHandle, basePath: string) => {
        try {
            const projectsDir = await parentHandle.getDirectoryHandle('Projects', { create: false });
            console.log(`[scanForProjects] Found 'Projects' dir in ${parentHandle.name}`);

            // @ts-ignore
            for await (const [name, handle] of projectsDir.entries()) {
                if (name === '__MACOSX') continue;
                console.log(`[scanForProjects] Checking entry: ${name}, kind: ${handle.kind}`);
                if (handle.kind === 'directory') {
                    let hasMeta = false;
                    let fileCount = 0;
                    try {
                        let projectFileHandle: FileSystemFileHandle;
                        try {
                            projectFileHandle = await handle.getFileHandle('project-descriptor.json', { create: false });
                        } catch (e) {
                            projectFileHandle = await handle.getFileHandle('project.json', { create: false });
                        }
                        
                        // Basic validation that it's a project
                        hasMeta = true;
                        console.log(`[scanForProjects] Valid project structure found: ${name}`);

                        // Read meta and timestamp
                        let lastModified = 0;
                        let json: any = null;
                        try {
                            const file = await projectFileHandle.getFile();
                            lastModified = file.lastModified; // Fallback to file system time

                            const text = await file.text();
                            json = JSON.parse(text);
                            
                            // Support both legacy .files and descriptor .files structure
                            if (json.files) {
                                fileCount = Object.keys(json.files).length;
                            } else if (json.metadata && typeof json.metadata.fileCount === 'number') {
                                // Some descriptors might have a summary count
                                fileCount = json.metadata.fileCount;
                            }

                            // Prefer internal metadata timestamp if available
                            if (json.metadata && json.metadata.exportDate) {
                                const exportTime = new Date(json.metadata.exportDate).getTime();
                                if (!isNaN(exportTime)) {
                                    lastModified = exportTime;
                                }
                            }
                        } catch (e) { console.warn("Failed to read meta for " + name, e); }

                        projects.push({
                            name,
                            path: `${basePath}/${name}`,
                            hasMeta,
                            fileCount,
                            lastModified,
                            _rawData: json ? {
                                files: json.files || {},
                                tapes: json.tapes || {},
                                projectNotes: json.projectNotes,
                                projectConfig: {
                                    mid_ch_a: 1,
                                    mid_ch_b: 2,
                                    mid_ps_a: false,
                                    mid_ps_b: false,
                                    pre_load: true,
                                    ...(json.projectConfig || {})
                                }
                            } : undefined,
                        });
                    } catch (e) {
                        console.log(`[scanForProjects] '${name}' is not a project (no project.json)`);
                    }
                }
            }
        } catch (e) {
            console.log(`[scanForProjects] No 'Projects' dir found in ${parentHandle.name}`);
        }
    };

    // 1. Scan Root Projects
    await scanDir(rootHandle, 'Projects');

    // 2. Scan WAV_Builder/Projects (Standard SD Structure)
    try {
        const wbDir = await rootHandle.getDirectoryHandle('WAV_Builder', { create: false });
        console.log(`[scanForProjects] Found 'WAV_Builder' in root`);
        await scanDir(wbDir, 'WAV_Builder/Projects');
    } catch (e) {
        console.log(`[scanForProjects] No 'WAV_Builder' folder in root`);
    }

    console.log(`[scanForProjects] Scan complete. Found ${projects.length} projects.`);
    return projects.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
};

export const getActiveSKProject = async (rootHandle: FileSystemDirectoryHandle): Promise<string | null> => {
    try {
        // Try getting from SK folder
        let skHandle = rootHandle;
        if (rootHandle.name !== 'SK') {
            try {
                skHandle = await rootHandle.getDirectoryHandle('SK', { create: false });
            } catch (e) {
                console.log("[getActiveSKProject] No SK folder found at root.");
                return null;
            }
        }

        const jsonHandle = await skHandle.getFileHandle('project.json', { create: false });
        const file = await jsonHandle.getFile();
        const text = await file.text();
        const projectIdentity = JSON.parse(text);

        console.log("[getActiveSKProject] Found project.json:", projectIdentity?.metadata?.projectName);
        return projectIdentity?.metadata?.projectName || null;
    } catch (e) {
        console.log("[getActiveSKProject] Failed to read project.json:", e);
        return null;
    }
};

export const saveProjectToDirectory = async (state: AppState, rootHandle: FileSystemDirectoryHandle, onProgress?: (msg: string | undefined, progress?: number) => void, projectName?: string) => {
    onProgress?.("Saving Project...", 0);

    try {
        let targetHandle = rootHandle;

        // If projectName provided, save to Projects/{projectName}
        if (projectName) {
            onProgress?.(`Accessing Projects/${projectName}...`, 5);
            const projectsHandle = await rootHandle.getDirectoryHandle('Projects', { create: true });
            targetHandle = await projectsHandle.getDirectoryHandle(projectName, { create: true });
        }

        // 1. Write project.json
        onProgress?.("Writing project.json...", 10);
        const projectHandle = await targetHandle.getFileHandle('project.json', { create: true });

        // Prepare State for Save (serialize blobs?)
        // Mirroring exportSaveState: blobs go to "Assets" folder, JSON references them.

        const serializedFiles: any = {};
        const assetsPending: { id: string, blob: Blob }[] = [];

        onProgress?.("Preparing file records...", 20);
        for (const [id, file] of Object.entries(state.files)) {
            serializedFiles[id] = {
                ...file,
                versions: file.versions.map(v => {
                    if (v.blob) {
                        const blobName = `${v.id}.wav`;
                        // Debug: Check blob status
                        // console.log(`[Save] Queueing asset ${blobName}, Type: ${v.blob.type}, Size: ${v.blob.size}`);

                        try {
                            // Ensure it's readable by slicing it (creates a new blob/reference check)
                            // If it's a closed file handle, this might throw or return size 0?
                            // Actually, let's just push it, but if it fails later, we know which one.
                        } catch (e) {
                            console.error(`[Save] Blob verification failed for ${blobName}`, e);
                        }

                        assetsPending.push({ id: blobName, blob: v.blob });
                        return {
                            ...v,
                            blob: null,
                            blobRef: `Assets/${blobName}` // Relative path
                        };
                    }
                    return v;
                })
            };
        }

        const serializedState = {
            files: serializedFiles,
            tapes: state.tapes,
            projectNotes: state.projectNotes,
            projectConfig: state.projectConfig, // Fix: Include project config
            metadata: {
                appName: "Spotykach WAV Builder",
                version: "1.2.0",
                exportDate: new Date().toISOString(),
                projectName: projectName || "Untitled"
            }
        };

        // 1. Write project.json
        console.log(`[Save] Writing project.json for ${projectName}`);
        try {
            // Use 'as any' since some FileSystem API types are missing in older TypeScript DOM libs
            const writable = await (projectHandle as any).createWritable();
            await writable.write(JSON.stringify(serializedState, null, 2));
            await writable.close();
        } catch (e) {
            console.error('[Save] Failed to write project.json', e);
            throw e;
        }

        // 1.5 Write notes.md
        let notesContent = "";
        if (state.projectNotes) {
            notesContent += `# Project Notes\n\n${state.projectNotes}\n\n`;
        }
        TAPE_COLORS.forEach(color => {
            const tapeNotes = state.tapes[color]?.notes;
            if (tapeNotes) {
                notesContent += `## Tape ${color} Notes\n\n${tapeNotes}\n\n`;
            }
        });

        if (notesContent.trim() !== "") {
            try {
                const notesHandle = await targetHandle.getFileHandle('notes.md', { create: true });
                const notesWritable = await (notesHandle as any).createWritable();
                await notesWritable.write(notesContent);
                await notesWritable.close();
            } catch (e) {
                console.warn('[Save] Failed to write notes.md', e);
            }
        }

        // 2. Write Assets
        if (assetsPending.length > 0) {
            onProgress?.(`Saving ${assetsPending.length} assets...`, 30);
            const assetsHandle = await targetHandle.getDirectoryHandle('Assets', { create: true });

            for (const asset of assetsPending) {
                try {
                    // console.log(`[Save] Writing asset ${asset.id} (${asset.blob.size} bytes)`);
                    // 'size': the filename is a per-version uuid, so an existing file of
                    // the same size *is* this version. Saves re-reading every asset.
                    await safeWriteBlob(assetsHandle, asset.id, asset.blob, 'size');
                } catch (e: any) {
                    console.error(`[Save] Failed to write asset ${asset.id}`, e);
                    if (e.name === 'NotReadableError') {
                        console.warn(`[Save] Skipping unreadable asset ${asset.id}`);
                        continue;
                    }
                    console.error(`[Save] Asset Details - Type: ${asset.blob.type}, Size: ${asset.blob.size}`);
                    throw e; // Rethrow to stop save (or continue? keeping behavior strict for now)
                }
            }
        }

        onProgress?.("Project Saved Successfully!", 100);

    } catch (e: any) {
        console.error("Save Project Failed", e);
        if (e.name === 'NotAllowedError') {
            throw new Error("Write permission denied.");
        }
        throw e;
    }
};

export const loadProjectFromDirectory = async (projectName: string, rootHandle: FileSystemDirectoryHandle, onProgress?: (msg: string | undefined, progress?: number) => void): Promise<AppState> => {
    onProgress?.(`Loading Project ${projectName}...`, 0);

    try {
        const projectsHandle = await rootHandle.getDirectoryHandle('Projects', { create: false });
        const projectDirHandle = await projectsHandle.getDirectoryHandle(projectName, { create: false });

        // 1. Read project.json or project-descriptor.json
        onProgress?.("Reading project manifest...", 10);
        let text = '';
        let isDescriptor = false;
        try {
            const descHandle = await projectDirHandle.getFileHandle('project-descriptor.json', { create: false });
            text = await (await descHandle.getFile()).text();
            isDescriptor = true;
        } catch (e) {
            const projectFileHandle = await projectDirHandle.getFileHandle('project.json', { create: false });
            text = await (await projectFileHandle.getFile()).text();
        }

        let state: AppState;

        if (isDescriptor) {
            const { parseProjectDescriptor, hydrateDescriptor } = await import('./projectDescriptorUtils');
            const descriptor = parseProjectDescriptor(JSON.parse(text));
            
            // Read all custom blobs into memory for hydration
            const customAssets: Record<string, Blob> = {};
            try {
                const customDir = await projectDirHandle.getDirectoryHandle('custom_assets', { create: false });
                // @ts-ignore
                for await (const [name, entry] of customDir.entries()) {
                    if (entry.kind === 'file') {
                        const file = await (entry as FileSystemFileHandle).getFile();
                        customAssets[`custom_assets/${name}`] = file;
                    }
                }
            } catch (e) {
                // Ignore if no custom_assets directory
            }

            state = await hydrateDescriptor(descriptor, customAssets, (msg, pct) => {
                onProgress?.(msg, 10 + (pct * 0.8));
            });
        } else {
            state = JSON.parse(text);

            // Ensure projectConfig is complete with defaults for backward compatibility
            state.projectConfig = {
                mid_ch_a: 1,
                mid_ch_b: 2,
                mid_ps_a: false,
                mid_ps_b: false,
                pre_load: true,
                ...(state.projectConfig || {})
            } as ProjectConfig;
        }

        const missingAssets: NonNullable<AppState['loadIssues']>['missingAssets'] = state.loadIssues?.missingAssets || [];

        // 2. Rehydrate Blobs (only for legacy project.json)
        if (!isDescriptor) {
            onProgress?.("Loading Assets...", 20);
            let assetsHandle: FileSystemDirectoryHandle | null = null;
            try {
                assetsHandle = await projectDirHandle.getDirectoryHandle('Assets', { create: false });
            } catch (e) {
                console.warn("No Assets folder found, skipping blob rehydration.");
            }

            if (assetsHandle) {
                let totalFiles = Object.keys(state.files).length;
                let processed = 0;

                for (const [, fileRecord] of Object.entries(state.files)) {
                    processed++;
                    onProgress?.(`Loading assets for ${fileRecord.name}...`, 20 + ((processed / totalFiles) * 70));

                    fileRecord.versions = await Promise.all(fileRecord.versions.map(async (v: any) => {
                        if (v.blobRef && typeof v.blobRef === 'string') {
                            try {
                                const parts = v.blobRef.split('/');
                                const fileName = parts[parts.length - 1];

                                const fileHandle = await assetsHandle!.getFileHandle(fileName, { create: false });
                                const fileData = await fileHandle.getFile();
                                return { ...v, blob: fileData };
                            } catch (e: any) {
                                console.warn(`Asset file missing: ${v.blobRef}`, e);
                                missingAssets.push({
                                    fileId: fileRecord.id,
                                    fileName: fileRecord.name,
                                    versionId: v.id,
                                    blobRef: v.blobRef,
                                    reason: 'File missing from Assets folder.'
                                });
                            }
                        }
                        return v;
                    }));
                }
            }
        }

        if (missingAssets.length > 0) {
            state.loadIssues = {
                ...(state.loadIssues || {}),
                missingAssets,
            };
            onProgress?.(`Loaded with warnings: ${missingAssets.length} missing asset file(s).`, 98);
        } else if (state.loadIssues?.missingAssets?.length) {
            state.loadIssues = {
                ...state.loadIssues,
                missingAssets: [],
            };
        }

        onProgress?.("Project Loaded Successfully!", 100);
        return state;

    } catch (e: any) {
        console.error("Load Project Failed", e);
        throw new Error(`Failed to load project: ${e.message}`);
    }
};

export const deleteProject = async (rootHandle: FileSystemDirectoryHandle, projectName: string) => {
    const projectsHandle = await rootHandle.getDirectoryHandle('Projects', { create: false });
    await projectsHandle.removeEntry(projectName, { recursive: true });
};



export const duplicateProject = async (rootHandle: FileSystemDirectoryHandle, sourceName: string, newName: string) => {
    const projectsHandle = await rootHandle.getDirectoryHandle('Projects', { create: false });

    // 1. Get Source
    const sourceHandle = await projectsHandle.getDirectoryHandle(sourceName);

    // 2. Create Target
    const targetHandle = await projectsHandle.getDirectoryHandle(newName, { create: true });

    // 3. Copy Helpers
    const copyFile = async (src: FileSystemDirectoryHandle, dst: FileSystemDirectoryHandle, fileName: string) => {
        try {
            const h = await src.getFileHandle(fileName);
            const file = await h.getFile();
            const th = await dst.getFileHandle(fileName, { create: true });
            const w = await th.createWritable();
            await w.write(file);
            await w.close();
            return true;
        } catch (e) { return false; }
    };

    const copyDir = async (src: FileSystemDirectoryHandle, dst: FileSystemDirectoryHandle, dirName: string) => {
        try {
            const sDir = await src.getDirectoryHandle(dirName);
            const tDir = await dst.getDirectoryHandle(dirName, { create: true });
            // @ts-ignore
            for await (const [name, handle] of sDir.entries()) {
                if (handle.kind === 'file') {
                    await copyFile(sDir, tDir, name);
                }
            }
            return true;
        } catch (e) { return false; }
    };

    // 4. Copy Metadata
    let foundMeta = false;
    // Try Descriptor
    try {
        const jsonHandle = await sourceHandle.getFileHandle('project-descriptor.json');
        const file = await jsonHandle.getFile();
        const text = await file.text();
        const json = JSON.parse(text);
        if (json.name) json.name = newName;
        if (json.metadata) json.metadata.exportDate = new Date().toISOString();

        const jsonTarget = await targetHandle.getFileHandle('project-descriptor.json', { create: true });
        const writer = await jsonTarget.createWritable();
        await writer.write(JSON.stringify(json, null, 2));
        await writer.close();
        foundMeta = true;
    } catch (e) {}

    // Try Legacy JSON
    try {
        const jsonHandle = await sourceHandle.getFileHandle('project.json');
        const file = await jsonHandle.getFile();
        const text = await file.text();
        const json = JSON.parse(text);
        if (json.metadata) {
            json.metadata.projectName = newName;
            json.metadata.exportDate = new Date().toISOString();
        }

        const jsonTarget = await targetHandle.getFileHandle('project.json', { create: true });
        const writer = await jsonTarget.createWritable();
        await writer.write(JSON.stringify(json, null, 2));
        await writer.close();
        foundMeta = true;
    } catch (e) {}

    if (!foundMeta) {
        console.warn("No project metadata found to copy during duplication");
    }

    // 5. Assets
    await copyDir(sourceHandle, targetHandle, 'Assets');
    await copyDir(sourceHandle, targetHandle, 'custom_assets');
    
    // 6. Notes & Config
    await copyFile(sourceHandle, targetHandle, 'notes.md');
    await copyFile(sourceHandle, targetHandle, 'config.txt');
    await copyFile(sourceHandle, targetHandle, 'visual_settings.json');
};

export const renameProject = async (rootHandle: FileSystemDirectoryHandle, oldName: string, newName: string) => {
    const projectsHandle = await rootHandle.getDirectoryHandle('Projects', { create: false });
    
    // Use duplicate logic
    await duplicateProject(rootHandle, oldName, newName);
    
    // Delete source
    await projectsHandle.removeEntry(oldName, { recursive: true });
};

export const parseConfigText = (text: string): ProjectConfig | null => {
    try {
        const config: ProjectConfig = {
            mid_ch_a: 1,
            mid_ch_b: 2,
            mid_ps_a: false,
            mid_ps_b: false,
            pre_load: true
        };
        // Strictly positional: blank lines drop out and what remains is walked as
        // key/value pairs. An unknown key is still a *pair*, so it consumes two
        // lines like any other — skipping it silently would shift everything after
        // it. That is also why it can be carried through rather than dropped.
        const unknown: import('../types').UnknownConfigSetting[] = [];
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l !== '');
        for (let i = 0; i < lines.length; i += 2) {
            const rawKey = lines[i];
            const val = lines[i + 1];
            if (!rawKey || val === undefined) continue;

            const key = rawKey.toUpperCase();
            if (key.startsWith('MID_CH_A')) config.mid_ch_a = parseInt(val) || 1;
            else if (key.startsWith('MID_CH_B')) config.mid_ch_b = parseInt(val) || 2;
            else if (key.startsWith('MID_PS_A')) config.mid_ps_a = val === '1';
            else if (key.startsWith('MID_PS_B')) config.mid_ps_b = val === '1';
            else if (key.startsWith('PRE_LOAD')) config.pre_load = val === '1';
            else unknown.push({ key: rawKey, value: val });
        }
        // Left absent when there are none, so existing projects serialize and
        // compare exactly as they did before.
        if (unknown.length > 0) config.unknown = unknown;
        return config;
    } catch (e) {
        console.warn("Failed to parse config.txt", e);
        return null;
    }
};
