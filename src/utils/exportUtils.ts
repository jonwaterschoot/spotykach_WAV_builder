import JSZip from 'jszip';
import { TAPE_COLORS } from '../types';
import type { AppState } from '../types';

// ==========================================
// SHARED HELPERS
// ==========================================

// ==========================================
// SHARED HELPERS
// ==========================================

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

// Helper: Safely write a blob to a file handle. Checks size to skip redundant writes,
// and buffers File objects into memory to prevent NotReadableError due to file locks.
export const safeWriteBlob = async (fileHandle: FileSystemFileHandle, blob: Blob) => {
    let shouldWrite = true;
    try {
        const existingFile = await fileHandle.getFile();
        if (existingFile.size === blob.size) {
            shouldWrite = false;
        }
    } catch (e) {
        // Doesn't exist, proceed
    }

    if (shouldWrite) {
        let dataToWrite: Blob | ArrayBuffer = blob;
        if (blob instanceof File) {
            try {
                dataToWrite = await blob.arrayBuffer();
            } catch (e) {
                console.warn(`[SafeWrite] Failed to buffer file into memory`, e);
            }
        }
        // @ts-ignore
        const w = await fileHandle.createWritable();
        await w.write(dataToWrite);
        await w.close();
        return true; // Wrote
    }
    return false; // Skipped
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
                    const targetFileHandle = await targetDir.getFileHandle(name, { create: true });
                    await safeWriteBlob(targetFileHandle, sourceFile);
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
    onProgress?: (msg: string) => void
) => {
    try {
        const userLibDir = await rootHandle.getDirectoryHandle('User_Library', { create: true });
        const files = Object.values(library.files);
        const expectedNames = new Set(files.map(f => f.name));

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const mainVerId = file.currentVersionId;
            const version = file.versions.find(v => v.id === mainVerId) || file.versions[0];

            if (version?.blob) {
                try {
                    const fileHandle = await userLibDir.getFileHandle(file.name, { create: true });
                    await safeWriteBlob(fileHandle, version.blob);
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
            if (tape.notes) {
                content += `  Notes:\n    ${tape.notes.split('\n').join('\n    ')}\n\n`;
            }
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

    // specific license collection
    const licenses = new Set<string>();
    const origins = new Set<string>();

    Object.values(state.files).forEach(file => {
        // Check if file is used in any slot? Or just mention all files in project?
        // Let's mention all files that are relevant (assigned or if bundling project)
        // For SD export, we usually care about assigned files.
        // But checking every file in state is safer for attribution.
        if (file.license) licenses.add(`${file.origin ? `[${file.origin}] ` : ''}${file.license}`);
        if (file.origin) origins.add(file.origin);
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

export const exportSaveState = async (state: AppState, returnZip = false, onProgress?: (msg: string | undefined, progress?: number) => void): Promise<JSZip | void> => {
    onProgress?.("Starting project backup...", 0);
    const zip = new JSZip();

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
                        // In some browsers, adding an unreadable blob to jszip can crash or hang later
                        // So we wrap it in case the user forces an export despite warnings
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
        metadata: {
            appName: "Spotykach WAV Builder",
            version: __APP_VERSION__,
            exportDate: new Date().toISOString()
        }
    };

    zip.file("project.json", JSON.stringify(serializedState, null, 2));

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

export interface ExportSDOptions {
    includeProject: boolean; // Keeping for backward compat, but effectively true
    directWrite: boolean;
    smartSync?: boolean; // Used for "Overwrite" mode
    destinationHandle?: FileSystemDirectoryHandle;
    // New Options
    skMode?: 'overwrite' | 'clean';
    syncUserLibrary?: boolean;
    userLibrary?: import('../types').UserLibrary; // Passed from App state
    backupSKToProject?: boolean;
    workHandle?: FileSystemDirectoryHandle | null; // Needed for internal backup
    projectName?: string; // Needed for folder naming
    syncDecisions?: Record<string, 'export' | 'skip' | 'delete'>; // New decision map
}

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

            // 1. CLEAN RE-INSTALL?
            if (options.skMode === 'clean') {
                onProgress?.("Cleaning old Sync...", 5);
                await cleanDirectory(rootHandle, 'SK');
            }

            onProgress?.("Creating/Accessing SK folder...", 10);

            // Access 'SK' subdirectory.
            let skHandle = await rootHandle.getDirectoryHandle('SK', { create: true });

            // SMART SYNC MANIFEST (Only if Overwrite mode)
            let manifest: Record<string, Record<number, string>> = {};
            // Initialize manifest structure for all colors
            TAPE_COLORS.forEach(c => manifest[c] = {});

            if (options.smartSync && options.skMode !== 'clean') {
                try {
                    const manifestHandle = await skHandle.getFileHandle('export_manifest.json', { create: false });
                    const file = await manifestHandle.getFile();
                    const text = await file.text();
                    const loaded = JSON.parse(text);
                    TAPE_COLORS.forEach(c => {
                        if (loaded[c]) manifest[c] = loaded[c];
                    });
                    onProgress?.("Smart Sync: Manifest loaded.", 10);
                } catch (e) {
                    onProgress?.("Smart Sync: No previous manifest found.", 10);
                }
            }

            // Write Readme
            onProgress?.("Writing README.md...", 15);
            const readmeHandle = await rootHandle.getFileHandle('README.md', { create: true });
            const readmeWritable = await readmeHandle.createWritable();
            await readmeWritable.write(generateReadme(state)); // Bundle info is separate now
            await readmeWritable.close();

            // 2. WRITE SK FOLDER (WAVs)
            let skippedCount = 0;
            let writtenCount = 0;
            const totalActiveSlots = TAPE_COLORS.reduce((acc, color) => {
                return acc + state.tapes[color].slots.filter(s => s.fileId).length;
            }, 0);
            let processedSlots = 0;

            const skBlobs: { name: string, blob: Blob }[] = []; // Collect for Hardcopy

            for (const color of TAPE_COLORS) {
                const tape = state.tapes[color];
                const folderName = color.charAt(0).toUpperCase();
                const activeSlots = tape.slots.filter(s => s.fileId);

                let tapeHandle: FileSystemDirectoryHandle;
                try {
                    tapeHandle = await skHandle.getDirectoryHandle(folderName, { create: true });
                } catch (e) {
                    continue;
                }

                // 2.a Sweep Orphaned Files (Perfect Mirroring)
                if (options.skMode !== 'clean' && !options.syncDecisions) {
                    try {
                        // @ts-ignore
                        for await (const [name, entry] of tapeHandle.entries()) {
                            if (entry.kind === 'file' && name.toUpperCase().endsWith('.WAV')) {
                                const match = name.match(/^(\d+)\.WAV$/i);
                                if (match) {
                                    const slotId = parseInt(match[1]);
                                    const slot = tape.slots.find(s => s.id === slotId);
                                    if (!slot || !slot.fileId) {
                                        // Empty slot in project, but file exists on hardware!
                                        await tapeHandle.removeEntry(name);
                                        if (manifest[color] && manifest[color][slotId]) {
                                            delete manifest[color][slotId];
                                        }
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        // Ignore sweeping errors
                    }
                }

                if (activeSlots.length === 0) continue;

                onProgress?.(`Processing Tape ${color}...`, 20 + ((processedSlots / Math.max(1, totalActiveSlots)) * 40));

                for (const slot of tape.slots) {
                    const slotRef = `${color}${slot.id}`;
                    const decision = options.syncDecisions?.[slotRef];
                    const fileName = `${slot.id}.WAV`;

                    // Handle Explicit Deletes from Sync Dashboard
                    if (decision === 'delete') {
                        onProgress?.(`  -> Removing ${fileName} from Hardware`, 20 + ((processedSlots / totalActiveSlots) * 40));
                        try {
                            await tapeHandle.removeEntry(fileName);
                        } catch (e) {
                            // File didn't exist anyway or we don't have permission.
                        }
                        if (manifest[color] && manifest[color][slot.id]) {
                            delete manifest[color][slot.id];
                        }
                        continue;
                    }

                    // Handle Explicit Skips
                    if (decision === 'skip') {
                        skippedCount++;
                        continue;
                    }

                    // Process Local Files (Export)
                    // If decision is defined and it's 'export', or if no explicit decisions are given (fallback)
                    const shouldExport = (!options.syncDecisions) || (options.syncDecisions && decision === 'export');

                    if (slot.fileId && state.files[slot.fileId] && shouldExport) {
                        processedSlots++;
                        const progressBase = 20 + ((processedSlots / totalActiveSlots) * 40);

                        const file = state.files[slot.fileId];
                        const version = file.versions.find(v => v.id === file.currentVersionId);

                        if (version?.blob) {
                            try {
                                // Try to read a tiny slice to verify it's valid before writing
                                await version.blob.slice(0, 1).arrayBuffer();
                            } catch (e) {
                                console.warn(`[Export] Skipping unreadable blob for ${fileName}`);
                                // We could optionally mark it as missing here or notify the user
                                continue;
                            }

                            // Collect for hardcopy


                            // Check Smart Sync (If no explicit decision forced us here)
                            const previousVersionId = manifest[color]?.[slot.id];
                            const currentVersionId = file.currentVersionId;

                            // If we don't have explicit decisions, fallback to smart sync logic
                            if (!options.syncDecisions && options.smartSync && options.skMode !== 'clean' && previousVersionId === currentVersionId) {
                                skippedCount++;
                                continue;
                            }

                            onProgress?.(`  -> Writing ${fileName}`, progressBase);
                            try {
                                const fileHandle = await tapeHandle.getFileHandle(fileName, { create: true });
                                await safeWriteBlob(fileHandle, version.blob);

                                // Collect for hardcopy
                                if (options.backupSKToProject) {
                                    skBlobs.push({ name: `${folderName}/${fileName}`, blob: version.blob });
                                }
                            } catch (e) {
                                console.error(`[Export] Failed to write ${fileName}`, e);
                                // Skip manifest update if write fails
                                continue;
                            }

                            // Update Manifest
                            if (!manifest[color]) manifest[color] = {};
                            manifest[color][slot.id] = currentVersionId;
                            writtenCount++;
                        }
                    }
                }
            }

            // Write Manifest (Old Smart Sync logic)
            if (options.smartSync) {
                onProgress?.("Updating Sync Manifest...", 60);
                const manifestHandle = await skHandle.getFileHandle('export_manifest.json', { create: true });
                const writable = await manifestHandle.createWritable();
                await writable.write(JSON.stringify(manifest, null, 2));
                await writable.close();
            }

            // Write Project Identity Manifest (For Device Sync / Re-Import)
            // This allows us to know:
            // 1. What Project this SK folder belongs to.
            // 2. What the expected state was (to detect new/changed files).
            const projectIdentity = {
                metadata: {
                    appName: "Spotykach WAV Builder",
                    version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0',
                    exportDate: new Date().toISOString(),
                    projectName: options.projectName
                },
                projectNotes: state.projectNotes,
                tapes: state.tapes,
                files: Object.entries(state.files).reduce((acc, [id, f]) => {
                    const currentVer = f.versions.find(v => v.id === f.currentVersionId);
                    acc[id] = {
                        id: f.id,
                        originalName: f.originalName,
                        currentVersionId: f.currentVersionId,
                        // Add Metadata for Robust Comparison
                        size: currentVer?.blob?.size || 0,
                        timestamp: currentVer?.timestamp || 0
                    };
                    return acc;
                }, {} as any)
            };

            try {
                const identityHandle = await skHandle.getFileHandle('project.json', { create: true });
                const writable = await identityHandle.createWritable();
                await writable.write(JSON.stringify(projectIdentity, null, 2));
                await writable.close();
            } catch (e) {
                console.warn("Failed to write project.json identity to SK folder", e);
            }

            // 3. COPY SOURCE TO WAV_BUILDER (Backup Logic)
            if (options.workHandle && options.projectName) {
                onProgress?.("Backing up Project Source...", 65);
                try {
                    // Structure: SD_ROOT/WAV_Builder/Projects/{ProjectName}
                    const wavBuilderDir = await rootHandle.getDirectoryHandle('WAV_Builder', { create: true });
                    const wbProjectsDir = await wavBuilderDir.getDirectoryHandle('Projects', { create: true });
                    const targetProjectDir = await wbProjectsDir.getDirectoryHandle(options.projectName, { create: true });

                    // Uses syncDirectory to copy from Work/Projects/{ProjectName} to SD/WAV_Builder/Projects/{ProjectName}
                    // We need the Work Handle for the SPECIFIC PROJECT.
                    // Access: workHandle/Projects/ProjectName
                    const sourceProjectsDir = await options.workHandle.getDirectoryHandle('Projects');
                    const sourceProjectDir = await sourceProjectsDir.getDirectoryHandle(options.projectName);

                    // Manual Sync for robustness (generic syncDirectory might be failing on root files?)
                    // 1. Copy project.json
                    try {
                        const sourceJson = await sourceProjectDir.getFileHandle('project.json');
                        const sourceFile = await sourceJson.getFile();
                        const targetJson = await targetProjectDir.getFileHandle('project.json', { create: true });
                        const writable = await targetJson.createWritable();
                        await writable.write(sourceFile);
                        await writable.close();
                        onProgress?.("Synced project.json", 70);
                    } catch (e) {
                        console.error("Failed to sync project.json to SD", e);
                    }

                    // 2. Copy Assets Folder
                    try {
                        const sourceAssets = await sourceProjectDir.getDirectoryHandle('Assets');
                        const targetAssets = await targetProjectDir.getDirectoryHandle('Assets', { create: true });

                        // Manual Sync for Assets
                        // @ts-ignore
                        let assetCount = 0;
                        // @ts-ignore
                        for await (const [name, entry] of sourceAssets.entries()) {
                            if (entry.kind === 'file') {
                                try {
                                    const sourceFileHandle = await sourceAssets.getFileHandle(name);
                                    const sourceFile = await sourceFileHandle.getFile();

                                    if (sourceFile.size === 0) {
                                        console.warn(`[Sync] Skipping 0kb source file: ${name}`);
                                        continue;
                                    }

                                    const targetFileHandle = await targetAssets.getFileHandle(name, { create: true });

                                    // Check if target exists and is same size/newer?
                                    // For now, let's force overwrite or check size
                                    try {
                                        const existing = await targetFileHandle.getFile();
                                        if (existing.size === sourceFile.size && existing.lastModified >= sourceFile.lastModified) {
                                            // Skip if identical
                                            continue;
                                        }
                                    } catch (e) { /* doesn't exist */ }

                                    const writable = await (targetFileHandle as any).createWritable();
                                    await writable.write(sourceFile);
                                    await writable.close();
                                    // console.log(`[Sync] Copied ${name} (${sourceFile.size} bytes)`);
                                    assetCount++;
                                    onProgress?.(`Syncing Asset ${assetCount}...`, 75);
                                } catch (fileErr) {
                                    console.error(`[Sync] Failed to copy asset ${name}`, fileErr);
                                }
                            }
                        }
                    } catch (e) {
                        // No assets, ignore
                    }

                } catch (e) {
                    console.error("Source Backup Failed", e);
                    onProgress?.("Source Backup Failed (Check Console)", 80);
                }
            }

            // 4. SYNC USER LIBRARY (Optional)
            // 4. SYNC USER LIBRARY (Optional - from IndexedDB object)
            if (options.syncUserLibrary && options.userLibrary) {
                onProgress?.("Syncing User Library...", 80);
                try {
                    const wavBuilderDir = await rootHandle.getDirectoryHandle('WAV_Builder', { create: true });
                    const userLibDir = await wavBuilderDir.getDirectoryHandle('User_Library', { create: true });

                    const libFiles = Object.values(options.userLibrary.files);
                    for (let i = 0; i < libFiles.length; i++) {
                        const file = libFiles[i];
                        const mainVerId = file.currentVersionId;
                        const version = file.versions.find(v => v.id === mainVerId) || file.versions[0];
                        if (version?.blob) {
                            const fileHandle = await userLibDir.getFileHandle(file.name, { create: true });
                            await safeWriteBlob(fileHandle, version.blob);
                        }
                        onProgress?.(`Syncing User Library: ${file.name}`, 80 + ((i / libFiles.length) * 10));
                    }
                } catch (e) {
                    console.error("User Library Sync Failed", e);
                }
            } else if (options.syncUserLibrary && options.workHandle) {
                onProgress?.("Syncing User Library (Legacy)...", 80);
                try {
                    const wavBuilderDir = await rootHandle.getDirectoryHandle('WAV_Builder', { create: true });
                    await syncDirectory(options.workHandle, wavBuilderDir, 'User_Library', (p) => {
                        onProgress?.("Syncing User Library...", 80 + (p * 10));
                    });
                } catch (e) {
                    // Ignore
                }
            }

            // 5. HARDCOPY SK TO PROJECT (Optional)
            if (options.backupSKToProject && options.workHandle && options.projectName && skBlobs.length > 0) {
                onProgress?.("Creating SK Hardcopy in Project...", 90);
                // Target: Work/Projects/{Name}/SK_Hardcopy
                // Also: SD/WAV_Builder/Projects/{Name}/SK_Hardcopy (Synced via step 3? No, step 3 happened before)
                // If we want it on SD backup too, we should write it to Work FIRST, then Step 3.
                // OR write to both.
                // Logic says: "User opts to build extra hardcopy... standard is this ALSO gets built into workfolder."
                // So default is Workfolder. The copy on SD should probably exist too?
                // The sync (Step 3) happened at 65%. If we write to Work NOW, it's not on SD until next sync.
                // Suggestion: Write to Work Folder. If user wants it on SD, they need to sync again?
                // OR: Write to Work Folder, then write to SD Project folder manually.

                try {
                    const projectsHandle = await options.workHandle.getDirectoryHandle('Projects');
                    const projectDir = await projectsHandle.getDirectoryHandle(options.projectName);
                    const hardcopyDir = await projectDir.getDirectoryHandle('SK_Hardcopy', { create: true });

                    // Write blobs
                    let hcCount = 0;
                    for (const item of skBlobs) {
                        // item.name is "B/1.WAV"
                        const [folder, file] = item.name.split('/');
                        const folderHandle = await hardcopyDir.getDirectoryHandle(folder, { create: true });
                        const fileHandle = await folderHandle.getFileHandle(file, { create: true });
                        await safeWriteBlob(fileHandle, item.blob);
                        hcCount++;
                        onProgress?.(`Writing Hardcopy ${hcCount}/${skBlobs.length}`, 90 + ((hcCount / skBlobs.length) * 10));
                    }

                    // Also write to SD backup location if it exists
                    try {
                        const wavBuilderDir = await rootHandle.getDirectoryHandle('WAV_Builder');
                        const wbProjectsDir = await wavBuilderDir.getDirectoryHandle('Projects');
                        const targetProjectDir = await wbProjectsDir.getDirectoryHandle(options.projectName);
                        const targetHardcopyDir = await targetProjectDir.getDirectoryHandle('SK_Hardcopy', { create: true });

                        // Quick copy since we have blobs
                        for (const item of skBlobs) {
                            const [folder, file] = item.name.split('/');
                            const folderHandle = await targetHardcopyDir.getDirectoryHandle(folder, { create: true });
                            const fileHandle = await folderHandle.getFileHandle(file, { create: true });
                            await safeWriteBlob(fileHandle, item.blob);
                        }
                    } catch (e) {
                        // Ignore SD write failure
                    }

                } catch (e) {
                    console.error("Hardcopy creation failed", e);
                }
            }


            const summary = `Sync Complete: Updated ${writtenCount}, Skipped ${skippedCount}.`;
            onProgress?.(summary, 100);
            return;

        } catch (e: any) {
            console.error("Direct Write Error:", e);
            if (e.name === 'NotAllowedError' || e.message.includes('read-only')) {
                throw new Error("System blocked write access. Please use Zip Export.");
            }
            throw e;
        }
    }


    // B. DOWNLOAD ZIP
    onProgress?.("Preparing SD Card ZIP...", 0);
    const zip = new JSZip();
    const skFolder = zip.folder("SK");
    if (!skFolder) throw new Error("Failed to create zip");

    // README
    onProgress?.("Adding README...", 5);
    zip.file("README.md", generateReadme(state));

    // Tapes
    let filesAdded = 0;
    TAPE_COLORS.forEach(color => {
        const tape = state.tapes[color];
        const folderName = color.charAt(0).toUpperCase();

        const activeSlots = tape.slots.filter(s => s.fileId);
        if (activeSlots.length > 0) {

            const tapeFolder = skFolder.folder(folderName);

            if (tapeFolder) {
                tape.slots.forEach(slot => {
                    if (slot.fileId) {
                        const file = state.files[slot.fileId];
                        const version = file.versions.find(v => v.id === file.currentVersionId);
                        if (version?.blob) {
                            tapeFolder.file(`${slot.id}.WAV`, version.blob);
                            filesAdded++;
                            onProgress?.(`Adding Tape ${color}...`, 5 + (Math.min(filesAdded, 50))); // Rough progress up to 50ish
                        }
                    }
                });
            }
        }
    });

    // Project Bundle
    if (options.includeProject) {
        onProgress?.("Bundling Project Backup...", 60);
        // Map 0-100 to 60-70
        const projectZip = await exportSaveState(state, true, (msg, p) => {
            const mapped = p !== undefined ? 60 + (p * 0.1) : undefined;
            onProgress?.(msg ? `  [Backup] ${msg}` : undefined, mapped);
        }) as JSZip;
        const backupFolder = skFolder.folder("PROJECT_BACKUP");

        onProgress?.("Compressing Backup...", 70);
        const backupBlob = await projectZip.generateAsync({ type: "blob" });
        backupFolder?.file("project_backup.zip", backupBlob);
    }

    onProgress?.("Combining and Compressing Final ZIP...", 75);
    // 75 to 100
    const content = await zip.generateAsync({ type: "blob" }, (metadata) => {
        onProgress?.(undefined, 75 + (metadata.percent * 0.25));
    });
    const dateStr = new Date().toISOString().split('T')[0];

    onProgress?.("Triggering Download...", 100);
    downloadBlob(content, `Spotykach_SD_${dateStr}.zip`);
    onProgress?.("Done.", 100);
};


// ==========================================
// 3. FILES ONLY (Loose)
// ==========================================

export const exportFilesOnly = async (state: AppState, options: { keepStructure: boolean; fileIds: string[] }, onProgress?: (msg: string | undefined, progress?: number) => void) => {
    onProgress?.("Starting File Export...", 0);
    const zip = new JSZip();

    // Add README
    onProgress?.("Adding Information...", 5);
    zip.file("README.md", generateReadme(state)); // Don't mention project bundle in this context

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

            targetFolder.file(baseName, version.blob);
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
                console.log(`[scanForProjects] Checking entry: ${name}, kind: ${handle.kind}`);
                if (handle.kind === 'directory') {
                    let hasMeta = false;
                    let fileCount = 0;
                    try {
                        const projectFileHandle = await handle.getFileHandle('project.json', { create: false });
                        // Basic validation that it's a project
                        hasMeta = true;
                        console.log(`[scanForProjects] Valid project structure found: ${name}`);

                        // Read meta and timestamp
                        let lastModified = 0;
                        try {
                            const file = await projectFileHandle.getFile();
                            lastModified = file.lastModified; // Fallback to file system time

                            const text = await file.text();
                            const json = JSON.parse(text);
                            if (json.files) fileCount = Object.keys(json.files).length;

                            // Prefer internal metadata timestamp if available
                            if (json.metadata && json.metadata.exportDate) {
                                const exportTime = new Date(json.metadata.exportDate).getTime();
                                if (!isNaN(exportTime)) {
                                    lastModified = exportTime;
                                }
                            }
                        } catch (e) { console.warn("Failed to read project.json meta", e); }

                        projects.push({
                            name,
                            path: `${basePath}/${name}`, // This might need adjustment based on how path is used
                            hasMeta,
                            fileCount,
                            lastModified
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
                    const fileHandle = await assetsHandle.getFileHandle(asset.id, { create: true });
                    await safeWriteBlob(fileHandle, asset.blob);
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

        // 1. Read project.json
        onProgress?.("Reading project.json...", 10);
        const projectFileHandle = await projectDirHandle.getFileHandle('project.json', { create: false });
        const file = await projectFileHandle.getFile();
        const text = await file.text();
        const state: AppState = JSON.parse(text);
        const missingAssets: NonNullable<AppState['loadIssues']>['missingAssets'] = [];

        // 2. Rehydrate Blobs
        onProgress?.("Loading Assets...", 20);
        let assetsHandle: FileSystemDirectoryHandle | null = null;
        try {
            assetsHandle = await projectDirHandle.getDirectoryHandle('Assets', { create: false });
        } catch (e) {
            console.warn("No Assets folder found, skipping blob rehydration.");
        }

        if (assetsHandle) {
            // Pre-fetch all asset files? Or on demand?
            // Let's iterate the files once.
            // Actually, we can just get them by name as needed.

            let totalFiles = Object.keys(state.files).length;
            let processed = 0;

            for (const [, fileRecord] of Object.entries(state.files)) {
                processed++;
                onProgress?.(`Loading assets for ${fileRecord.name}...`, 20 + ((processed / totalFiles) * 70));

                fileRecord.versions = await Promise.all(fileRecord.versions.map(async (v: any) => {
                    // If it has a blobRef, load it
                    if (v.blobRef && typeof v.blobRef === 'string') {
                        try {
                            // path is "Assets/filename.wav"
                            const parts = v.blobRef.split('/');
                            const fileName = parts[parts.length - 1];

                            const fileHandle = await assetsHandle!.getFileHandle(fileName, { create: false });
                            const fileData = await fileHandle.getFile(); // Returns File which is a Blob
                            return { ...v, blob: fileData };
                        } catch (e) {
                            const errMsg = e instanceof Error ? e.message : String(e);
                            console.warn(`Failed to load asset ${v.blobRef}`, e);
                            missingAssets.push({
                                fileId: fileRecord.id,
                                fileName: fileRecord.name,
                                versionId: v.id || 'unknown',
                                blobRef: v.blobRef,
                                reason: errMsg,
                            });
                            return { ...v, blob: null }; // Explicitly mark missing blob
                        }
                    }
                    return v;
                }));

                // Fix types if needed (cast to AudioVersion)
            }
        }

        if (missingAssets.length > 0) {
            state.loadIssues = {
                ...(state.loadIssues || {}),
                missingAssets,
            };
            onProgress?.(`Loaded with warnings: ${missingAssets.length} missing asset file(s).`, 98);
        } else if (state.loadIssues?.missingAssets?.length) {
            // Clear stale runtime warnings if project.json carried old in-memory state by mistake.
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

export const renameProject = async (rootHandle: FileSystemDirectoryHandle, oldName: string, newName: string) => {
    let projectsHandle: FileSystemDirectoryHandle;

    // Try to find 'Projects' directly (Work Folder style)
    try {
        projectsHandle = await rootHandle.getDirectoryHandle('Projects', { create: false });
    } catch (e) {
        // Not found, try 'WAV_Builder/Projects' (SD Card style)
        try {
            const wavBuilder = await rootHandle.getDirectoryHandle('WAV_Builder', { create: false });
            projectsHandle = await wavBuilder.getDirectoryHandle('Projects', { create: false });
        } catch (e2) {
            console.error("Could not find Projects directory in root or WAV_Builder");
            throw new Error("Projects folder not found");
        }
    }

    // 1. Get Source
    const sourceHandle = await projectsHandle.getDirectoryHandle(oldName);

    // 2. Create Target
    const targetHandle = await projectsHandle.getDirectoryHandle(newName, { create: true });

    // 3. Copy Content (files only for now, projects are shallow structured: project.json + Assets folder)

    // Copy project.json
    try {
        const jsonHandle = await sourceHandle.getFileHandle('project.json');
        const file = await jsonHandle.getFile();
        const jsonTarget = await targetHandle.getFileHandle('project.json', { create: true });
        const writer = await jsonTarget.createWritable();
        await writer.write(file);
        await writer.close();
    } catch (e) {
        console.warn("No project.json found in source to rename");
    }

    // Copy Assets
    try {
        const assetsSource = await sourceHandle.getDirectoryHandle('Assets');
        const assetsTarget = await targetHandle.getDirectoryHandle('Assets', { create: true });

        // @ts-ignore
        for await (const [name, handle] of assetsSource.entries()) {
            if (handle.kind === 'file') {
                const file = await handle.getFile();
                const targetFile = await assetsTarget.getFileHandle(name, { create: true });
                const writer = await targetFile.createWritable();
                await writer.write(file);
                await writer.close();
            }
        }
    } catch (e) {
        console.warn("No Assets folder found to copy");
    }

    // 4. Delete Old
    await projectsHandle.removeEntry(oldName, { recursive: true });
};

export const duplicateProject = async (rootHandle: FileSystemDirectoryHandle, sourceName: string, newName: string) => {
    const projectsHandle = await rootHandle.getDirectoryHandle('Projects', { create: false });

    // 1. Get Source
    const sourceHandle = await projectsHandle.getDirectoryHandle(sourceName);

    // 2. Create Target
    const targetHandle = await projectsHandle.getDirectoryHandle(newName, { create: true });

    // 3. Copy Content

    // Copy project.json
    try {
        const jsonHandle = await sourceHandle.getFileHandle('project.json');
        const file = await jsonHandle.getFile();

        // Update Project Name in JSON
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
    } catch (e) {
        console.warn("No project.json found in source to copy");
    }

    // Copy Assets
    try {
        const assetsSource = await sourceHandle.getDirectoryHandle('Assets');
        const assetsTarget = await targetHandle.getDirectoryHandle('Assets', { create: true });

        // @ts-ignore
        for await (const [name, handle] of assetsSource.entries()) {
            if (handle.kind === 'file') {
                const file = await handle.getFile();
                const targetFile = await assetsTarget.getFileHandle(name, { create: true });
                const writer = await targetFile.createWritable();
                await writer.write(file);
                await writer.close();
            }
        }
    } catch (e) {
        console.warn("No Assets folder found to copy");
    }
};
