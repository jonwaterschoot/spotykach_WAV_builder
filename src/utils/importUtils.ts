import { TAPE_COLORS } from '../types';
import type { AppState, TapeColor, AudioVersion, FileRecord } from '../types';
import { audioEngine } from '../lib/audio/audioEngine';

// Map single letter to full color name (B -> Blue, etc)
const FOLDER_MAP: Record<string, TapeColor> = {
    B: 'Blue',
    G: 'Green',
    P: 'Pink',
    R: 'Red',
    T: 'Turquoise',
    Y: 'Yellow'
};

const generateId = () => crypto.randomUUID();

// Helper to sanitize filenames (remove special chars)
export const sanitizeFilename = (name: string): string => {
    // Keep alpha-numeric, dot, dash, underscore. Replace others with underscore.
    // Also remove multiple underscores if generated.
    let sanitized = name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    // Remove duplicate underscores
    sanitized = sanitized.replace(/__+/g, '_');
    // Remove leading/trailing underscores (before extension)
    // We want to preserve extension if present in input (but name here might be just base name depending on usage)
    // If name has extension, we should be careful.
    // Let's assume input is full filename.
    return sanitized;
};

export const parseImportFiles = async (
    files: FileList,
    onProgress: (current: number, total: number) => void
): Promise<Partial<AppState>> => {
    const fileArray = Array.from(files);


    // 1. SMART IMPORT CHECK: Look for project.json
    const projectJsonFile = fileArray.find(f => f.name === 'project.json' || f.webkitRelativePath.endsWith('project.json'));

    if (projectJsonFile) {
        try {
            const text = await projectJsonFile.text();
            const projectState = JSON.parse(text) as { files: Record<string, FileRecord>, tapes: any };
            const blobMap: Record<string, Blob> = {};

            // Index all blobs by their relative path (or filename if flat)
            // The export references blobs as `blobs/ID.wav` or similar.
            // We need to match whatever the export wrote.
            // Export writes: blobsFolder.file(blobName, v.blob) where blobName is `${v.id}.wav`
            // So we look for files in `blobs/` directory.

            for (const f of fileArray) {
                // If it's a blob file
                if (f.name.endsWith('.wav')) {
                    // We map by filename (e.g. "abc-123.wav") because that's what blobRef likely holds?
                    // Let's check exportUtils: `blobRef: blobName` -> `${v.id}.wav`
                    // So we key by the filename.
                    blobMap[f.name] = f;
                }
            }

            // Reconstruct Files with Blobs
            const reconstructedFiles: Record<string, FileRecord> = {};
            let processed = 0;

            for (const [fileId, fileRec] of Object.entries(projectState.files)) {
                processed++;
                onProgress(processed, Object.keys(projectState.files).length);

                const versions: AudioVersion[] = [];
                for (const v of fileRec.versions) {
                    const blobName = (v as any).blobRef; // Using implicit any for the property added during export
                    let blob = blobMap[blobName];

                    if (!blob) {
                        // Fallback: maybe it's just the id?
                        // If not found, we can't play it.
                        console.warn(`Missing blob for version ${v.id} (${blobName})`);
                        continue;
                    }

                    // Convert File to ArrayBuffer/AudioBuffer if needed?
                    // The app expects `blob` property to be a Blob. File is a Blob.
                    // But we might need to process it if we want `duration`.
                    // The exported JSON *should* have duration.
                    // We assume `blob` property in state is `Blob`.

                    versions.push({
                        ...v,
                        blob: blob
                    });
                }

                if (versions.length > 0) {
                    reconstructedFiles[fileId] = {
                        ...fileRec,
                        versions: versions,
                        // Ensure currentVersionId points to something valid
                        currentVersionId: versions.find(v => v.id === fileRec.currentVersionId) ? fileRec.currentVersionId : versions[0].id
                    };
                }
            }

            // Convert restored tapes to assignment structure for App.tsx
            const restoredAssignments: Record<TapeColor, { slotId: number; fileId: string }[]> = {
                Blue: [], Green: [], Pink: [], Red: [], Turquoise: [], Yellow: []
            };

            Object.entries(projectState.tapes).forEach(([color, tape]: [string, any]) => {
                if (restoredAssignments[color as TapeColor]) {
                    // Extract assignments from the restored state
                    tape.slots.forEach((s: any) => {
                        if (s.fileId) {
                            restoredAssignments[color as TapeColor].push({
                                slotId: s.id,
                                fileId: s.fileId
                            });
                        }
                    });
                }
            });

            return {
                files: reconstructedFiles,
                tapes: restoredAssignments as any
            };

        } catch (e) {
            console.error("Failed to parse project.json", e);
            // Fallthrough to standard import? Or fail?
            // If project.json exists but fails, better to alert user.
            throw new Error("Invalid Project File");
        }
    }

    // 2. STANDARD FOLDER IMPORT (Fallback)
    const newFiles: Record<string, FileRecord> = {};
    const newTapeAssignments: Record<TapeColor, { slotId: number; fileId: string }[]> = {
        Blue: [], Green: [], Pink: [], Red: [], Turquoise: [], Yellow: []
    };

    // Auto-assignment counters (1-based)
    const nextSlotIndex: Record<TapeColor, number> = {
        Blue: 1, Green: 1, Pink: 1, Red: 1, Turquoise: 1, Yellow: 1
    };

    const audioFiles = fileArray.filter(f => f.type.includes('audio') || f.name.toLowerCase().endsWith('.wav'));

    for (let i = 0; i < audioFiles.length; i++) {
        const file = audioFiles[i];
        onProgress(i + 1, audioFiles.length);

        const pathParts = file.webkitRelativePath.split('/');
        // Check if it's imported from export folder 'EXTRAS'
        const isExtras = pathParts.some(p => p === 'EXTRAS');

        // Attempt to identify slot placement
        let color: TapeColor | undefined;
        let slotId: number | undefined;

        if (!isExtras && pathParts.length >= 2) {
            const folderName = pathParts[pathParts.length - 2].toUpperCase();

            // Resolve Folder Color
            if (TAPE_COLORS.includes(folderName as any)) {
                color = folderName as TapeColor;
            } else if (FOLDER_MAP[folderName]) {
                color = FOLDER_MAP[folderName];
            }

            if (color) {
                // Check filename for Explicit Number (e.g. "01_kick.wav")
                const fileName = pathParts[pathParts.length - 1];
                const match = fileName.match(/^(\d+)/);

                if (match) {
                    slotId = parseInt(match[1]);
                } else {
                    // Auto-Assign to next available slot
                    slotId = nextSlotIndex[color];
                    nextSlotIndex[color]++;
                }
            }
        }

        try {
            const { buffer, blob } = await audioEngine.loadAndProcessAudio(file);
            const fileId = generateId();
            const versionId = generateId();

            const version: AudioVersion = {
                id: versionId,
                timestamp: Date.now(),
                description: 'Original Import',
                blob,
                duration: buffer.duration
            };

            const safeName = sanitizeFilename(file.name);

            const record: FileRecord = {
                id: fileId,
                name: safeName.toUpperCase().replace(/\.[^/.]+$/, ""),
                originalName: file.name, // Keep original filename for reference? Or sanitize this too? Let's keep original for provenance.
                versions: [version],
                currentVersionId: versionId,
                isParked: !color || !slotId // Park if we couldn't determine a slot
            };

            newFiles[fileId] = record;

            if (color && slotId && slotId >= 1 && slotId <= 6) {
                newTapeAssignments[color].push({ slotId, fileId });
            }

        } catch (e) {
            console.error(`Failed to process ${file.name}`, e);
        }
    }

    return {
        files: newFiles,
        tapes: newTapeAssignments as any // App.tsx logic will merge these
    };
};
