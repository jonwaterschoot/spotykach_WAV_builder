import JSZip from 'jszip';
import type { AppState, TapeColor, FileRecord, AudioVersion } from '../types';
import { TAPE_COLORS } from '../types';
import { v4 as uuidv4 } from 'uuid';

export type ImportType = 'PROJECT_BACKUP' | 'SD_STRUCTURE' | 'SD_WITH_BACKUP' | 'LOOSE_FILES' | 'UNKNOWN';

export interface ImportAnalysis {
    type: ImportType;
    summary: string;

    // For Project Backup
    projectState?: AppState;

    // For SD Structure
    structureMap?: {
        [key in TapeColor]?: { [slotId: number]: File }
    };

    // For SD with Backup
    backupFile?: File;

    // For Loose Files
    files?: File[];
}

// Helper: Load Project from Zip
export const loadProjectFromZip = async (zipFile: File): Promise<AppState | null> => {
    try {
        const zip = await JSZip.loadAsync(zipFile);
        const projectJson = zip.file("project.json");

        if (projectJson) {
            const content = await projectJson.async("string");
            const state = JSON.parse(content) as AppState;
            const blobsFolder = zip.folder("blobs");

            if (blobsFolder) {
                for (const fileId of Object.keys(state.files)) {
                    const file = state.files[fileId];
                    if (file && file.versions) { // Guard checks
                        for (const version of file.versions) {
                            const blobName = `${version.id}.wav`;
                            const blobFile = blobsFolder.file(blobName);
                            if (blobFile) {
                                version.blob = await blobFile.async("blob");
                            }
                        }
                    }
                }
            }
            return state;
        }
        return null;
    } catch (e) {
        console.error("Failed to load project zip", e);
        return null;
    }
};

export const analyzeImport = async (inputFiles: File[]): Promise<ImportAnalysis> => {
    // 1. Check for Single ZIP Project Backup
    if (inputFiles.length === 1 && inputFiles[0].name.endsWith('.zip')) {
        const state = await loadProjectFromZip(inputFiles[0]);
        if (state) {
            return {
                type: 'PROJECT_BACKUP',
                summary: `Found Project Backup (v${state.metadata?.version || 'Unknown'}) with ${Object.keys(state.files).length} files.`,
                projectState: state
            };
        }
    }

    // 2. Check for SK Structure (Folder Drag/Drop)
    const structureMap: any = {};
    let foundStructure = false;
    let foundBackupZip: File | undefined;

    for (const file of inputFiles) {
        const path = (file.webkitRelativePath || file.name);

        // Detect Backup Zip in structure
        if (file.name === 'project_backup.zip' || path.includes('/project_backup.zip') || path.includes('\\project_backup.zip')) {
            foundBackupZip = file;
        }

        const upperPath = path.toUpperCase();
        const parts = upperPath.split('/');

        // Looser check: Parent folder is a Color initial?
        if (parts.length >= 2) {
            const fileName = parts[parts.length - 1];
            const parent = parts[parts.length - 2];
            const colorCode = parent.charAt(0).toUpperCase();

            const matchedColor = TAPE_COLORS.find(c => c.charAt(0).toUpperCase() === colorCode);

            if (matchedColor) {
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

        if (foundBackupZip) {
            return {
                type: 'SD_WITH_BACKUP',
                summary: `Found SD Card Structure (${count} files) AND a Project Backup.`,
                structureMap,
                backupFile: foundBackupZip
            };
        }

        return {
            type: 'SD_STRUCTURE',
            summary: `Found SD Card Structure with ${count} assigned files.`,
            structureMap
        };
    }

    // 3. Default: Loose Files
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

export const processAudioFiles = (files: File[]): Record<string, FileRecord> => {
    const newFiles: Record<string, FileRecord> = {};
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
    currentFiles: Record<string, FileRecord>,
    currentTapes: Record<TapeColor, import('../types').Tape>
) => {
    const allFiles: File[] = [];
    Object.values(structureMap).forEach((slots: any) => {
        Object.values(slots).forEach((f: any) => allFiles.push(f));
    });

    const newFiles: Record<string, FileRecord> = {};
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
            isParked: false
        };
        newFiles[id].currentVersionId = newFiles[id].versions[0].id;
    }

    const nextFiles = { ...currentFiles, ...newFiles };
    const nextTapes = { ...currentTapes };

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

// 1. Calculate Diff
export interface SyncDiff {
    newFiles: { slot: string, name: string, file: File, slotIndex: number, color: TapeColor }[];
    updatedFiles: { slot: string, name: string, file: File, existingFileId: string }[];
    totalCount: number;
}

export const calculateSyncDiff = (
    projectState: AppState,
    structureMap: { [key in TapeColor]?: { [slotId: number]: File } }
): SyncDiff => {
    const diff: SyncDiff = { newFiles: [], updatedFiles: [], totalCount: 0 };

    for (const color of TAPE_COLORS) {
        const tapeFiles = (structureMap as any)[color];
        if (!tapeFiles) continue;

        for (const [slotIdStr, fileUnsafe] of Object.entries(tapeFiles)) {
            const file = fileUnsafe as File;
            const slotId = parseInt(slotIdStr);
            const tape = projectState.tapes[color];
            const slotIndex = tape.slots.findIndex(s => s.id === slotId);

            if (slotIndex === -1) continue;

            const slot = tape.slots[slotIndex];
            const existingFileId = slot.fileId;
            const existingFile = existingFileId ? projectState.files[existingFileId] : null;

            if (existingFile) {
                // Check if different
                const currentVer = existingFile.versions.find(v => v.id === existingFile.currentVersionId);
                // Strict equality check on size for now
                if (currentVer && currentVer.blob && currentVer.blob.size === file.size) {
                    continue; // Skip identical
                }

                diff.updatedFiles.push({
                    slot: `${color}${slotId}`,
                    name: file.name,
                    file,
                    existingFileId: existingFileId as string
                });
            } else {
                diff.newFiles.push({
                    slot: `${color}${slotId}`,
                    name: file.name,
                    file,
                    slotIndex,
                    color
                });
            }
        }
    }
    diff.totalCount = diff.newFiles.length + diff.updatedFiles.length;
    return diff;
};

// 2. Apply Diff
export const applySyncDiff = async (
    projectState: AppState,
    diff: SyncDiff,
    onProgress?: (msg: string) => void
): Promise<AppState> => {

    // Process New Files
    for (const item of diff.newFiles) {
        onProgress?.(`Importing new file: ${item.name} into ${item.slot}...`);

        const arrayBuffer = await item.file.arrayBuffer();
        const safeBlob = new Blob([arrayBuffer], { type: item.file.type });

        const newFileId = uuidv4();
        const newFile: FileRecord = {
            id: newFileId,
            name: item.file.name,
            originalName: item.file.name,
            versions: [{
                id: uuidv4(),
                timestamp: Date.now(),
                description: 'Imported from SD (New)',
                blob: safeBlob,
                duration: 0
            }],
            currentVersionId: '',
            isParked: false,
            origin: 'SD Card'
        };
        newFile.currentVersionId = newFile.versions[0].id; // Set current
        projectState.files[newFileId] = newFile;
        // Update Slot
        const tape = projectState.tapes[item.color];
        if (tape.slots[item.slotIndex]) {
            tape.slots[item.slotIndex].fileId = newFileId;
        }
    }

    // Process Updates
    for (const item of diff.updatedFiles) {
        onProgress?.(`Syncing update: ${item.name} for ${item.slot}...`);

        const arrayBuffer = await item.file.arrayBuffer();
        const safeBlob = new Blob([arrayBuffer], { type: item.file.type });

        const fileRecord = projectState.files[item.existingFileId];
        if (fileRecord) {
            const newVerId = uuidv4();
            const newVer: AudioVersion = {
                id: newVerId,
                timestamp: Date.now(),
                description: 'Synced from SD (Hardware)',
                blob: safeBlob,
                duration: 0
            };
            fileRecord.versions.push(newVer);
            fileRecord.currentVersionId = newVerId;
        }
    }

    return projectState;
};

export const restoreProjectAndSync = async (
    backupFile: File,
    structureMap: { [key in TapeColor]?: { [slotId: number]: File } }
): Promise<{ state: AppState, report: string } | null> => {
    // Legacy wrapper if needed, or we can remove/refactor
    const projectState = await loadProjectFromZip(backupFile);
    if (!projectState) return null;

    const diff = calculateSyncDiff(projectState, structureMap);
    const finalState = await applySyncDiff(projectState, diff);

    return {
        state: finalState,
        report: `Sync Complete: Updated ${diff.updatedFiles.length} files, Added ${diff.newFiles.length} new files.`
    };
};
