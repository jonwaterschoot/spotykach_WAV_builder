import JSZip from 'jszip';
import { TAPE_COLORS } from '../types';
import type { AppState } from '../types';

// Standard ZIP Export (Existing + Extras)
export const exportZip = async (state: AppState) => {
    const zip = new JSZip();
    const skFolder = zip.folder("SK");

    if (!skFolder) throw new Error("Failed to create root folder");

    // Export Tapes
    TAPE_COLORS.forEach(color => {
        const tape = state.tapes[color];
        const folderName = color.charAt(0).toUpperCase();
        const tapeFolder = skFolder.folder(folderName);

        if (tapeFolder) {
            tape.slots.forEach(slot => {
                if (slot.fileId) {
                    const fileRecord = state.files[slot.fileId];
                    if (fileRecord) {
                        const currentVersion = fileRecord.versions.find(v => v.id === fileRecord.currentVersionId);
                        if (currentVersion) {
                            tapeFolder.file(`${slot.id}.WAV`, currentVersion.blob);
                        }
                    }
                }
            });
        }
    });

    // Export Unused (Extras)
    const extrasFolder = skFolder.folder("EXTRAS");
    if (extrasFolder) {
        Object.values(state.files).forEach(file => {
            if (file.isParked) {
                const currentVersion = file.versions.find(v => v.id === file.currentVersionId);
                if (currentVersion) {
                    extrasFolder.file(`${file.name}.WAV`, currentVersion.blob);
                }
            }
        });
    }

    const content = await zip.generateAsync({ type: "blob" });
    downloadBlob(content, "SPOTYKACH_SD.zip");
};

// Save State Export (Project JSON + Source Files)
export const exportSaveState = async (state: AppState) => {
    const zip = new JSZip();

    // Save State Logic
    // We can't strict stringify state.files because it has Versions array with Blobs.
    // We need to serialize the structure and save blobs separately.

    // We can't strict stringify state.files because it has Versions array with Blobs.
    // We need to serialize the structure and save blobs separately.

    const serializedFiles: any = {};
    const blobsFolder = zip.folder("blobs");

    for (const [id, file] of Object.entries(state.files)) {
        serializedFiles[id] = {
            ...file,
            versions: file.versions.map(v => {
                // Save blob to zip
                const blobName = `${v.id}.wav`;
                if (blobsFolder) blobsFolder.file(blobName, v.blob);

                // Return version without blob, but with reference
                return {
                    ...v,
                    blob: null, // cleared
                    blobRef: blobName
                };
            })
        };
    }

    const serializedState = {
        files: serializedFiles,
        tapes: state.tapes
    };

    zip.file("project.json", JSON.stringify(serializedState, null, 2));

    const content = await zip.generateAsync({ type: "blob" });
    downloadBlob(content, "spotykach_project.zip");
};


// SD Card Export via File System Access API
// Note: browser support is limited (Chrome/Edge/Opera only)
// SD Card Export via File System Access API
// Note: browser support is limited (Chrome/Edge/Opera only)
export const exportToSDCard = async (state: AppState) => {
    if (!('showDirectoryPicker' in window)) {
        throw new Error("Your browser does not support writing directly to folders. Please use Export ZIP instead.");
    }

    // 1. Pick Root (SD Card)
    // This will throw AbortError if user cancels, which is fine to catch.
    const rootHandle = await (window as any).showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'documents'
    });

    // 2. Alert/Confirm handled by UI before calling this.

    // 3. Get/Create SK folder
    const skHandle = await rootHandle.getDirectoryHandle('SK', { create: true });

    // 4. Write Tapes
    for (const color of TAPE_COLORS) {
        const tape = state.tapes[color];
        const folderName = color.charAt(0).toUpperCase();
        const tapeHandle = await skHandle.getDirectoryHandle(folderName, { create: true });

        // Clear existing files?
        // "overwrite the actual files" - implues we just overwrite if collision, 
        // but the user might want a clean slate. 
        // Ideally we iterate slots 1-6 and write them. If slot is empty, we delete?
        // For safety let's just write what is assigned.

        for (const slot of tape.slots) {
            if (slot.fileId) {
                const fileRecord = state.files[slot.fileId];
                if (fileRecord) {
                    const currentVersion = fileRecord.versions.find(v => v.id === fileRecord.currentVersionId);
                    if (currentVersion) {
                        const fileHandle = await tapeHandle.getFileHandle(`${slot.id}.WAV`, { create: true });
                        const writable = await fileHandle.createWritable();
                        await writable.write(currentVersion.blob);
                        await writable.close();
                    }
                }
            }
        }
    }

    // 5. Write Extras?
    const extrasHandle = await skHandle.getDirectoryHandle('EXTRAS', { create: true });
    for (const file of Object.values(state.files)) {
        if (file.isParked) {
            const currentVersion = file.versions.find(v => v.id === file.currentVersionId);
            if (currentVersion) {
                const fileHandle = await extrasHandle.getFileHandle(`${file.name}.WAV`, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(currentVersion.blob);
                await writable.close();
            }
        }
    }
};


// Single File Export
export const exportSingleFile = (fileRecord: any) => {
    const currentVersion = fileRecord.versions.find((v: any) => v.id === fileRecord.currentVersionId);
    if (currentVersion && currentVersion.blob) {
        downloadBlob(currentVersion.blob, `${fileRecord.name}.wav`);
    } else {
        throw new Error("File data not available.");
    }
};

// Single Tape Export (Color Folder)
export const exportSingleTape = async (color: string, tape: any, files: Record<string, any>) => {
    const zip = new JSZip();
    const folderName = color.charAt(0).toUpperCase();
    const tapeFolder = zip.folder(folderName);

    if (!tapeFolder) {
        throw new Error("Failed to create zip folder.");
    }

    let count = 0;
    tape.slots.forEach((slot: any) => {
        if (slot.fileId && files[slot.fileId]) {
            const fileRecord = files[slot.fileId];
            const currentVersion = fileRecord.versions.find((v: any) => v.id === fileRecord.currentVersionId);
            if (currentVersion && currentVersion.blob) {
                tapeFolder.file(`${slot.id}.WAV`, currentVersion.blob);
                count++;
            }
        }
    });

    if (count === 0) {
        throw new Error("Tape is empty. Nothing to export.");
    }

    const content = await zip.generateAsync({ type: "blob" });
    downloadBlob(content, `${color.replace(/^\w/, (c) => c.toUpperCase())}_Tape.zip`);
};

// Helper
const downloadBlob = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};
