import JSZip from 'jszip';
import { TAPE_COLORS } from '../types';
import type { AppState } from '../types';

// ==========================================
// SHARED HELPERS
// ==========================================

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

const generateReadme = (state: AppState, includeBundle: boolean): string => {
    const dateStr = new Date().toISOString().split('T')[0];
    let content = `SPOTYKACH WAV BUILDER EXPORT
Date: ${dateStr}
App Version: ${__APP_VERSION__}

========================================================================
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

        if (activeSlots.length > 0) {
            content += `[${color.toUpperCase()}] -> SK/${folderName}/\n`;
            activeSlots.forEach(slot => {
                const file = state.files[slot.fileId!];
                content += `  Slot ${slot.id}: ${slot.id}.WAV  (Source: "${file?.originalName || file?.name || 'Unknown'}")\n`;
            });
            content += '\n';
        }
    });

    if (includeBundle) {
        content += `
========================================================================
PROJECT BACKUP
========================================================================
A full project backup (project.json + source files) is included in the 
"SK/PROJECT_BACKUP" folder. 
You can import this folder back into the app to restore your work.
`;
    }

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
                if (blobsFolder) blobsFolder.file(blobName, v.blob);

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
        metadata: {
            appName: "Spotykach WAV Builder",
            version: __APP_VERSION__,
            exportDate: new Date().toISOString()
        }
    };

    zip.file("project.json", JSON.stringify(serializedState, null, 2));

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

export const exportSDStructure = async (state: AppState, options: { includeProject: boolean; directWrite: boolean; smartSync?: boolean }, onProgress?: (msg: string | undefined, progress?: number) => void) => {



    // ... (rest of file) ...

    // A. DIRECT WRITE (FileSystem API)
    if (options.directWrite) {
        try {
            // @ts-ignore
            if (!('showDirectoryPicker' in window)) throw new Error("Browser not supported");

            onProgress?.("Requesting directory access...", 0);
            // @ts-ignore
            const rootHandle = await window.showDirectoryPicker({ mode: 'readwrite', startIn: 'documents' });

            onProgress?.("Creating SK folder...", 5);
            const skHandle = await rootHandle.getDirectoryHandle('SK', { create: true });

            // SMART SYNC MANIFEST
            let manifest: Record<string, Record<number, string>> = {};
            // Initialize manifest structure for all colors
            TAPE_COLORS.forEach(c => manifest[c] = {});

            if (options.smartSync) {
                try {
                    const manifestHandle = await skHandle.getFileHandle('export_manifest.json', { create: false });
                    const file = await manifestHandle.getFile();
                    const text = await file.text();
                    const loaded = JSON.parse(text);
                    // Merge loaded manifest (basic validation)
                    TAPE_COLORS.forEach(c => {
                        if (loaded[c]) manifest[c] = loaded[c];
                    });
                    onProgress?.("Smart Sync: Manifest loaded.", 10);
                } catch (e) {
                    onProgress?.("Smart Sync: No previous manifest found (Full Export).", 10);
                }
            }

            // Write Readme (Always overwrite for now to keep date current, or could skip if unchanged content?)
            // Let's always write README as it's fast and contains "Date".
            onProgress?.("Writing README.md...", 15);
            const readmeHandle = await rootHandle.getFileHandle('README.md', { create: true });
            const readmeWritable = await readmeHandle.createWritable();
            await readmeWritable.write(generateReadme(state, options.includeProject));
            await readmeWritable.close();

            // Write Tapes
            let skippedCount = 0;
            let writtenCount = 0;

            const totalActiveSlots = TAPE_COLORS.reduce((acc, color) => {
                return acc + state.tapes[color].slots.filter(s => s.fileId).length;
            }, 0);
            let processedSlots = 0;


            for (const color of TAPE_COLORS) {
                const tape = state.tapes[color];
                const folderName = color.charAt(0).toUpperCase();

                // Check if tape has content
                const activeSlots = tape.slots.filter(s => s.fileId);
                // If no active slots, we usually do nothing. 
                // TODO: Should we delete files that were removed? 
                // For now, let's focus on writing/updating. 
                // Strict sync (deleting orphans) is riskier for user data on SD unless requested.

                if (activeSlots.length === 0) continue;

                onProgress?.(`Processing Tape ${color}...`, 20 + ((processedSlots / totalActiveSlots) * 50));
                const tapeHandle = await skHandle.getDirectoryHandle(folderName, { create: true });

                for (const slot of tape.slots) {
                    if (slot.fileId && state.files[slot.fileId]) {

                        processedSlots++;
                        const progressBase = 20 + ((processedSlots / totalActiveSlots) * 50);

                        const file = state.files[slot.fileId];
                        const version = file.versions.find(v => v.id === file.currentVersionId);

                        if (version?.blob) {
                            // Check Smart Sync
                            const previousVersionId = manifest[color]?.[slot.id];
                            const currentVersionId = file.currentVersionId;

                            // If Smart Sync is ON and versions match, SKIP
                            if (options.smartSync && previousVersionId === currentVersionId) {
                                skippedCount++;
                                continue;
                            }

                            // STRICT NAMING: 1.WAV, 2.WAV...
                            const fileName = `${slot.id}.WAV`;
                            onProgress?.(`  -> Writing ${fileName}`, progressBase);
                            const fileHandle = await tapeHandle.getFileHandle(fileName, { create: true });
                            const writable = await fileHandle.createWritable();
                            await writable.write(version.blob);
                            await writable.close();

                            // Update Manifest
                            if (!manifest[color]) manifest[color] = {};
                            manifest[color][slot.id] = currentVersionId;
                            writtenCount++;
                        }
                    }
                }
            }

            // Write Manifest
            if (options.smartSync) {
                onProgress?.("Updating Smart Sync Manifest...", 75);
                const manifestHandle = await skHandle.getFileHandle('export_manifest.json', { create: true });
                const writable = await manifestHandle.createWritable();
                await writable.write(JSON.stringify(manifest, null, 2));
                await writable.close();
            }

            // Write Project Bundle
            if (options.includeProject) {
                // TODO: Smart sync for project bundle? 
                // The project file almost certainly changed if we are here.
                onProgress?.("Creating Project Backup Bundle...", 80);
                const backupHandle = await skHandle.getDirectoryHandle('PROJECT_BACKUP', { create: true });

                onProgress?.("Generating Backup ZIP...", 85);
                // Map sub-progress 0-100 to 85-95
                const zip = await exportSaveState(state, true, (msg, p) => {
                    const mapped = p !== undefined ? 85 + (p * 0.1) : undefined;
                    onProgress?.(msg ? `  [Backup] ${msg}` : undefined, mapped);
                }) as JSZip;

                onProgress?.("Writing Backup ZIP to disk...", 95);
                const content = await zip.generateAsync({ type: "blob" });
                const backupFileHandle = await backupHandle.getFileHandle('project_backup.zip', { create: true });
                const w = await backupFileHandle.createWritable();
                await w.write(content);
                await w.close();
            }

            const summary = options.smartSync
                ? `Sync Complete: Updated ${writtenCount}, Skipped ${skippedCount}.`
                : "SD Card Export Complete.";
            onProgress?.(summary, 100);
            return;

        } catch (e: any) {
            console.error("Direct Write Error:", e);
            // Check for specific error types
            if (e.name === 'NotAllowedError' || e.message.includes('read-only')) {
                throw new Error("System blocked write access. Please use Zip Export.");
            }
            throw e; // Re-throw other errors
        }
    }

    // B. DOWNLOAD ZIP
    onProgress?.("Preparing SD Card ZIP...", 0);
    const zip = new JSZip();
    const skFolder = zip.folder("SK");
    if (!skFolder) throw new Error("Failed to create zip");

    // README
    onProgress?.("Adding README...", 5);
    zip.file("README.md", generateReadme(state, options.includeProject));

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
    zip.file("README.md", generateReadme(state, false)); // Don't mention project bundle in this context

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

