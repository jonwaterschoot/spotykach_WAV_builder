import JSZip from 'jszip';
import type { AppState, TapeColor } from '../types';
import { TAPE_COLORS } from '../types';

export type ImportType = 'PROJECT_BACKUP' | 'SD_STRUCTURE' | 'LOOSE_FILES' | 'UNKNOWN';

export interface ImportAnalysis {
    type: ImportType;
    summary: string;

    // For Project Backup
    projectState?: AppState;

    // For SD Structure
    structureMap?: {
        [key in TapeColor]?: { [slotId: number]: File }
    };

    // For Loose Files
    files?: File[];
}

export const analyzeImport = async (inputFiles: File[]): Promise<ImportAnalysis> => {
    // 1. Check for Single ZIP Project Backup
    if (inputFiles.length === 1 && inputFiles[0].name.endsWith('.zip')) {
        try {
            const zip = await JSZip.loadAsync(inputFiles[0]);

            // A. Check for project.json (Full Backup)
            const projectJson = zip.file("project.json");
            if (projectJson) {
                const content = await projectJson.async("string");
                const state = JSON.parse(content) as AppState;

                // We might need to hydrate blobs if they are separate? 
                // In our exportSaveState, we separate blobs.
                // We need to re-attach blobs from zip to the state.files.

                const blobsFolder = zip.folder("blobs");
                if (blobsFolder) {
                    for (const fileId of Object.keys(state.files)) {
                        const file = state.files[fileId];
                        for (const version of file.versions) {
                            // If we exported with "blobRef", look it up
                            // The current exportSaveState stores blobs in 'blobs/' and puts valid refs in project.json?
                            // Actually, let's look at exportUtils.ts again. 
                            // It does: blobsFolder.file(blobName, v.blob);
                            // And v.blob is null in json.

                            const blobName = `${version.id}.wav`;
                            const blobFile = blobsFolder.file(blobName);
                            if (blobFile) {
                                version.blob = await blobFile.async("blob");
                            }
                        }
                    }
                }

                return {
                    type: 'PROJECT_BACKUP',
                    summary: `Found Project Backup (v${state.metadata?.version || 'Unknown'}) with ${Object.keys(state.files).length} files.`,
                    projectState: state
                };
            }

            // B. Check for SD Structure in ZIP?
            // TODO: recursive scan of zip for SK/B/1.WAV etc.

        } catch (e) {
            console.warn("Failed to parse ZIP", e);
        }
    }

    // 2. Check for project.json in file list (Folder Drag/Drop or Select)
    const projectFile = inputFiles.find(f => f.name === 'project.json');
    if (projectFile) {
        // We need the blobs folder too. 
        // Logic for folder import is tricky with flat FileList unless we use webkitRelativePath.
        // Let's assume for now valid "Project Restore" comes primarily from the ZIP we generate.
    }

    // 3. Check for SK Structure (Folder Drag/Drop)
    // We look for files with paths like "SK/B/1.WAV" or just "B/1.WAV"
    const structureMap: any = {};
    let foundStructure = false;

    for (const file of inputFiles) {
        const path = (file.webkitRelativePath || file.name).toUpperCase();
        // Regex for SK/Color/Number.wav or Color/Number.wav
        // Colors: B, G, P, R, Y, T, W (Turquoise/White? T is Turquoise? Wait, let's check TAPE_COLORS)
        // In types.ts/TAPE_COLORS.

        // Let's do a looser check: Parent folder is a Color initial?
        const parts = path.split('/');
        if (parts.length >= 2) {
            const fileName = parts[parts.length - 1];
            const parent = parts[parts.length - 2];

            // Check if parent matches a tape color initial
            const colorCode = parent.charAt(0).toUpperCase();



            // We need to look up TAPE_COLORS dynamically or hardcode mapping if standard.
            // Let's infer from TAPE_COLORS.
            const matchedColor = TAPE_COLORS.find(c => c.charAt(0).toUpperCase() === colorCode);

            if (matchedColor) {
                // Check if file is Number.wav
                const match = fileName.match(/^(\d+)\.WAV$/i);
                if (match) {
                    const slotId = parseInt(match[1]);
                    if (!structureMap[matchedColor]) structureMap[matchedColor] = {};
                    structureMap[matchedColor][slotId] = file;
                    foundStructure = true;
                }
            }
        }
    }

    if (foundStructure) {
        let count = 0;
        Object.values(structureMap).forEach((slots: any) => count += Object.keys(slots).length);
        return {
            type: 'SD_STRUCTURE',
            summary: `Found SD Card Structure with ${count} assigned files.`,
            structureMap
        };
    }

    // 4. Default: Loose Files
    const audioFiles = inputFiles.filter(f => f.type.startsWith('audio/') || f.name.toLowerCase().endsWith('.wav') || f.name.toLowerCase().endsWith('.mp3'));

    if (audioFiles.length > 0) {
        return {
            type: 'LOOSE_FILES',
            summary: `Found ${audioFiles.length} audio files.`,
            files: audioFiles
        };
    }

    return { type: 'UNKNOWN', summary: 'No recognizable audio or project files found.' };
};

// ==========================================
// STATE PROCESSORS
// ==========================================

import { v4 as uuidv4 } from 'uuid';

export const processAudioFiles = (files: File[]): Record<string, import('../types').FileRecord> => {
    const newFiles: Record<string, import('../types').FileRecord> = {};
    for (const file of files) {
        if (file.type.startsWith('audio/') || file.name.endsWith('.wav') || file.name.endsWith('.mp3')) {
            const id = uuidv4();
            newFiles[id] = {
                id,
                name: file.name,
                originalName: file.name,
                versions: [{
                    id: uuidv4(),
                    timestamp: Date.now(),
                    description: 'Original Import',
                    blob: file,
                    duration: 0
                }],
                currentVersionId: '',
                isParked: true
            };
            newFiles[id].currentVersionId = newFiles[id].versions[0].id;
        }
    }
    return newFiles;
};

export const processSDStructure = (
    structureMap: { [key in TapeColor]?: { [slotId: number]: File } },
    currentFiles: Record<string, import('../types').FileRecord>,
    currentTapes: Record<TapeColor, import('../types').Tape>
) => {
    // 1. Flatten all files from structure
    const allFiles: File[] = [];
    Object.values(structureMap).forEach((slots: any) => {
        Object.values(slots).forEach((f: any) => allFiles.push(f));
    });

    // 2. Create File Records
    const newFiles: Record<string, import('../types').FileRecord> = {};
    const fileIdMap = new Map<File, string>();

    for (const file of allFiles) {
        const id = uuidv4();
        fileIdMap.set(file, id);
        newFiles[id] = {
            id,
            name: file.name,
            originalName: file.name,
            versions: [{
                id: uuidv4(),
                timestamp: Date.now(),
                description: 'Imported from SD',
                blob: file,
                duration: 0
            }],
            currentVersionId: '',
            isParked: false // Assigned immediately
        };
        newFiles[id].currentVersionId = newFiles[id].versions[0].id;
    }

    // 3. Merge Files
    const nextFiles = { ...currentFiles, ...newFiles };
    const nextTapes = { ...currentTapes };

    // 4. Update Slots
    for (const color of TAPE_COLORS) {
        const tapeFiles = (structureMap as any)[color];
        if (tapeFiles) {
            for (const [slotIdStr, file] of Object.entries(tapeFiles)) {
                const slotId = parseInt(slotIdStr);
                const fileId = fileIdMap.get(file as File);

                if (fileId) {
                    const tape = nextTapes[color];
                    nextTapes[color] = {
                        ...tape,
                        slots: tape.slots.map(s => s.id === slotId ? { ...s, fileId } : s)
                    };
                }
            }
        }
    }

    return { files: nextFiles, tapes: nextTapes };
};
