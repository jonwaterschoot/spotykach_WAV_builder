import JSZip from 'jszip';
import type { AppState, TapeColor, FileRecord, AudioVersion, ProjectSummary } from '../types';
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

    // Found Projects
    projects?: ProjectSummary[];

    // For SD with Backup
    backupFile?: File;

    // For Loose Files
    files?: File[];
}

// Helper: Load Project from Zip
export const loadProjectFromZip = async (zipFile: File, onProgress?: (msg: string) => void): Promise<AppState | null> => {
    try {
        onProgress?.('Reading ZIP file...');
        const zip = await JSZip.loadAsync(zipFile);
        const projectJson = zip.file("project.json");

        if (projectJson) {
            onProgress?.('Parsing project data...');
            const content = await projectJson.async("string");
            const state = JSON.parse(content) as AppState;
            const blobsFolder = zip.folder("blobs");

            if (blobsFolder) {
                const totalFiles = Object.keys(state.files).length;
                let processed = 0;

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
                    processed++;
                    if (processed % 5 === 0 || processed === totalFiles) {
                        onProgress?.(`Loading audio blobs... (${processed}/${totalFiles})`);
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

export const analyzeImport = async (inputFiles: File[], onProgress?: (msg: string) => void): Promise<ImportAnalysis> => {
    // 1. Check for Single ZIP Project Backup
    if (inputFiles.length === 1 && inputFiles[0].name.endsWith('.zip')) {
        const state = await loadProjectFromZip(inputFiles[0], onProgress);
        if (state) {
            return {
                type: 'PROJECT_BACKUP',
                summary: `Found Project Backup (v${state.metadata?.version || 'Unknown'}) with ${Object.keys(state.files).length} files.`,
                projectState: state
            };
        }
    }

    onProgress?.('Scanning files structure...');


    // 2. Check for SK Structure (Folder Drag/Drop)
    const structureMap: any = {};
    let foundStructure = false;
    let foundBackupZip: File | undefined;

    // Filter to find "SK/" folder first
    const skFiles = inputFiles.filter(f => {
        const path = f.webkitRelativePath || f.name;
        // Check if file is INSIDE "SK/" folder
        // path example: "SD_CARD/SK/Red/1.WAV" or just "SK/Red/1.WAV"
        return path.includes('/SK/') || path.startsWith('SK/');
    });

    const targetFiles = skFiles.length > 0 ? skFiles : inputFiles;
    const isStrictSK = skFiles.length > 0;

    for (const file of targetFiles) {
        const path = (file.webkitRelativePath || file.name);

        // Detect Backup Zip in structure (If we are in strict mode, look for backup anywhere or just root?)
        // Let's keep looking for backup zip generally
        if (file.name === 'project_backup.zip' || path.includes('/project_backup.zip')) {
            foundBackupZip = file;
        }

        const upperPath = path.toUpperCase();
        const parts = upperPath.split('/');

        // Structure parsing:
        // Standard: [ROOT, Color, File] -> Length 3
        // Strict SK: [ROOT, SK, Color, File] -> Length 4
        // We need to find the "Color" folder.

        // Find index of Tape Color in path
        let colorIndex = -1;
        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            if (part.length === 1 && TAPE_COLORS.some(c => c.charAt(0) === part.charAt(0))) {
                colorIndex = i;
                break;
            }
            // Also check full names "RED", "BLUE"
            if (TAPE_COLORS.includes(part as any)) {
                colorIndex = i;
                break;
            }
        }

        if (colorIndex !== -1) {
            const fileName = parts[parts.length - 1]; // "1.WAV"
            const colorPart = parts[colorIndex]; // "R" or "RED"

            // Validate Parent is Color
            const matchedColor = TAPE_COLORS.find(c => c.charAt(0) === colorPart.charAt(0));

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

        const summaryPrefix = isStrictSK ? "Found Active Project (SK/)" : "Found SD Card Structure";

        if (foundBackupZip) {
            return {
                type: 'SD_WITH_BACKUP',
                summary: `${summaryPrefix} (${count} files) AND a Backup.`,
                structureMap,
                backupFile: foundBackupZip
            };
        }

        return {
            type: 'SD_STRUCTURE',
            summary: `${summaryPrefix} with ${count} assigned files.`,
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
export type SyncStatus = 'MATCH' | 'CONFLICT' | 'LOCAL_ONLY' | 'REMOTE_ONLY' | 'EMPTY';

export interface SyncSlotDiff {
    slotId: string; // "Red1", "Blue2"
    color: TapeColor;
    index: number; // 0-5
    status: SyncStatus;
    localFile?: FileRecord;
    remoteFile?: File; // Raw file from SD
}

// Legacy Interface Support (to prevent build break until consumers are updated)
export interface SyncDiffItemNew {
    slot: string;
    name: string;
    file: File;
    slotIndex: number;
    color: TapeColor;
    size: number;
}
export interface SyncDiffItemUpdate {
    slot: string;
    name: string;
    file: File;
    existingFileId: string;
    existingName: string;
    size: number;
}

// Diff Types for Device Scanning
export interface DeviceFileChange {
    slot: string; // e.g. "A1"
    file: File;
    color?: import('../types').TapeColor;
    slotId?: number;
    // For Modified:
    originalFileId?: string;
    // For New:
    // ... just slot and file
}

export interface DeviceDiff {
    newFiles: DeviceFileChange[];
    updatedFiles: DeviceFileChange[];
}
export interface SyncDiff {
    slots: Record<string, SyncSlotDiff>;
    summary: {
        matches: number;
        conflicts: number;
        localOnly: number;
        remoteOnly: number;
    };
    totalCount: number; // For legacy check
    // Legacy support (optional, can simulate if needed or refactor consumers)
    newFiles: SyncDiffItemNew[];
    updatedFiles: SyncDiffItemUpdate[];
}



import type { WavMetadata } from '../types';

// Helper: Parse WAV Metadata (LIST INFO)
export const readWavMetadata = async (file: File): Promise<WavMetadata | null> => {
    try {
        const metadata: WavMetadata = {};
        let foundAny = false;

        // 1. Read RIFF header
        const headerBlob = file.slice(0, 12);
        const headerBuffer = await headerBlob.arrayBuffer();
        if (headerBuffer.byteLength < 12) return null;
        const headerView = new DataView(headerBuffer);

        const riff = String.fromCharCode(headerView.getUint8(0), headerView.getUint8(1), headerView.getUint8(2), headerView.getUint8(3));
        const wave = String.fromCharCode(headerView.getUint8(8), headerView.getUint8(9), headerView.getUint8(10), headerView.getUint8(11));

        if (riff !== 'RIFF' || wave !== 'WAVE') return null;

        // 2. Iterate through chunks
        let offset = 12;
        const fileSize = file.size;

        while (offset < fileSize - 8) {
            const chunkHeaderBlob = file.slice(offset, offset + 8);
            const chunkHeaderBuffer = await chunkHeaderBlob.arrayBuffer();
            if (chunkHeaderBuffer.byteLength < 8) break;
            const view = new DataView(chunkHeaderBuffer);

            const chunkId = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
            const chunkSize = view.getUint32(4, true);

            // Skip huge DATA chunks immediately without reading them
            if (chunkId === 'data') {
                offset += 8 + chunkSize + (chunkSize % 2);
                continue;
            }

            // Read interested chunks
            if (chunkId === 'LIST' || chunkId === 'cue ') {
                const bodyBlob = file.slice(offset + 8, offset + 8 + chunkSize);
                const bodyBuffer = await bodyBlob.arrayBuffer();
                const bodyView = new DataView(bodyBuffer);

                if (chunkId === 'LIST') {
                    const listType = String.fromCharCode(bodyView.getUint8(0), bodyView.getUint8(1), bodyView.getUint8(2), bodyView.getUint8(3));
                    if (listType === 'INFO') {
                        let subOffset = 4;
                        while (subOffset < chunkSize - 8) {
                            const subId = String.fromCharCode(bodyView.getUint8(subOffset), bodyView.getUint8(subOffset + 1), bodyView.getUint8(subOffset + 2), bodyView.getUint8(subOffset + 3));
                            const subSize = bodyView.getUint32(subOffset + 4, true);

                            if (subId === 'ICMT') {
                                let value = '';
                                for (let i = 0; i < subSize; i++) {
                                    const charCode = bodyView.getUint8(subOffset + 8 + i);
                                    if (charCode !== 0) value += String.fromCharCode(charCode);
                                }
                                try {
                                    const payload = JSON.parse(value);
                                    if (payload.id) metadata.id = payload.id;
                                    if (payload.h) metadata.hash = payload.h;
                                    if (payload.p) metadata.processing = payload.p;
                                    if (payload.t) metadata.tempo = payload.t;
                                    foundAny = true;
                                } catch (e) { }
                            } else if (subId === 'ITMP') {
                                let value = '';
                                for (let i = 0; i < subSize; i++) {
                                    const charCode = bodyView.getUint8(subOffset + 8 + i);
                                    if (charCode !== 0) value += String.fromCharCode(charCode);
                                }
                                const t = parseFloat(value);
                                if (!isNaN(t)) {
                                    metadata.tempo = t;
                                    foundAny = true;
                                }
                            }
                            subOffset += 8 + subSize + (subSize % 2);
                        }
                    }
                } else if (chunkId === 'cue ') {
                    const numPoints = bodyView.getUint32(0, true);
                    const points: number[] = [];
                    // Sanity check numPoints to avoid infinite loops or memory issues
                    const safeNumPoints = Math.min(numPoints, 100);
                    for (let i = 0; i < safeNumPoints; i++) {
                        const cueRecordOffset = 4 + (i * 24);
                        if (cueRecordOffset + 24 <= chunkSize) {
                            const sampleOffset = bodyView.getUint32(cueRecordOffset + 20, true);
                            points.push(+(sampleOffset / 48000).toFixed(3));
                        }
                    }
                    if (points.length > 0) {
                        metadata.slicePoints = points;
                        foundAny = true;
                    }
                }
            }

            offset += 8 + chunkSize + (chunkSize % 2);
        }

        return foundAny ? metadata : null;
    } catch (e) {
        console.warn('Failed to parse WAV metadata', e);
    }
    return null;
};

// Helper: Check for CUE chunk (Robust version)
export const detectCueChunk = async (file: File): Promise<boolean> => {
    try {
        let offset = 12;
        const fileSize = file.size;

        while (offset < fileSize - 8) {
            const headerBlob = file.slice(offset, offset + 8);
            const headerBuffer = await headerBlob.arrayBuffer();
            if (headerBuffer.byteLength < 8) break;
            const view = new DataView(headerBuffer);

            const chunkId = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
            const chunkSize = view.getUint32(4, true);

            if (chunkId === 'cue ') return true;
            offset += 8 + chunkSize + (chunkSize % 2);
        }
    } catch (e) {
        console.warn('Failed to detect cue chunk', e);
    }
    return false;
};


// 1. Calculate Diff
export const calculateSyncDiff = async (
    projectState: AppState,
    structureMap: { [key in TapeColor]?: { [slotId: number]: File } }
): Promise<SyncDiff> => {
    const diff: SyncDiff = {
        slots: {},
        summary: { matches: 0, conflicts: 0, localOnly: 0, remoteOnly: 0 },
        totalCount: 0,
        newFiles: [],
        updatedFiles: []
    };

    for (const color of TAPE_COLORS) {
        const tape = projectState.tapes[color];
        const remoteTape = structureMap[color] || {};

        for (const localSlot of tape.slots) { // Use for-of for async
            const index = localSlot.id - 1; // 0-indexed assumption from upstream logic
            const slotId = `${color}${localSlot.id}`;
            const remoteFile = remoteTape[localSlot.id];
            const localFile = localSlot.fileId ? projectState.files[localSlot.fileId] : undefined;

            let status: SyncStatus = 'EMPTY';

            if (localFile && remoteFile) {
                // Both exist - Compare
                const currentVer = localFile.versions.find(v => v.id === localFile.currentVersionId);

                // Read Metadata from Remote File
                const remoteMeta = await readWavMetadata(remoteFile);

                let isMatch = false;

                // 1. Check Metadata UUID
                if (remoteMeta?.id && localFile.id === remoteMeta.id) {
                    // UUID Match! Check for content changes.
                    isMatch = true;

                    // A. Compare Processing Flags (e.g. Normalized, Faded)
                    const localProc = (currentVer?.processing || []).slice().sort();
                    const remoteProc = (remoteMeta.processing || []).slice().sort();

                    if (JSON.stringify(localProc) !== JSON.stringify(remoteProc)) {
                        isMatch = false; // Processing differs -> Update available
                    }

                    // B. Compare Size (Fallback for re-encodes without flag changes)
                    if (isMatch && remoteFile.size !== currentVer?.blob?.size) {
                        isMatch = false;
                    }
                } else {
                    // No metadata or ID mismatch
                    // Fallback to strict Size check
                    if (currentVer && currentVer.blob && currentVer.blob.size === remoteFile.size) {
                        isMatch = true;
                    }
                }

                if (isMatch) {
                    status = 'MATCH';
                    diff.summary.matches++;
                } else {
                    status = 'CONFLICT';
                    diff.summary.conflicts++;

                    diff.updatedFiles.push({
                        slot: slotId,
                        name: remoteFile.name,
                        file: remoteFile,
                        existingFileId: localFile.id,
                        existingName: localFile.name,
                        size: remoteFile.size
                    });
                }
            } else if (localFile && !remoteFile) {
                status = 'LOCAL_ONLY';
                diff.summary.localOnly++;
            } else if (!localFile && remoteFile) {
                status = 'REMOTE_ONLY';
                diff.summary.remoteOnly++;
                diff.newFiles.push({
                    slot: slotId,
                    name: remoteFile.name,
                    file: remoteFile,
                    slotIndex: index,
                    color: color,
                    size: remoteFile.size
                });
            }

            diff.slots[slotId] = {
                slotId,
                color,
                index,
                status,
                localFile,
                remoteFile
            };
        }
    }

    diff.totalCount = diff.newFiles.length + diff.updatedFiles.length;

    return diff;
};



// 2. Apply Diff
export type SyncDecision = 'overwrite' | 'skip' | 'keep_both';

export const applySyncDiff = async (
    projectState: AppState,
    diff: SyncDiff,
    decisions: Record<string, SyncDecision> = {},
    onProgress?: (msg: string) => void
): Promise<AppState> => {

    // Process New Files
    for (const item of diff.newFiles) {
        // Default decision is overwrite/import if not specified
        const decision = decisions[item.slot] || 'overwrite';

        if (decision === 'skip') {
            onProgress?.(`Skipping new file: ${item.name}`);
            continue;
        }

        onProgress?.(`Importing new file: ${item.name} into ${item.slot}...`);

        const arrayBuffer = await item.file.arrayBuffer();
        const safeBlob = new Blob([arrayBuffer], { type: item.file.type });

        const newFileId = uuidv4();
        // Create File Record
        const newFile: FileRecord = {
            id: newFileId,
            name: item.name,
            originalName: item.file.name,
            versions: [{
                id: uuidv4(),
                timestamp: Date.now(),
                description: 'Imported from SD (New)',
                blob: safeBlob,
                duration: 0 // Will be updated on load or separate process
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
        const decision = decisions[item.slot] || 'overwrite';

        if (decision === 'skip') {
            onProgress?.(`Skipping update for ${item.slot}`);
            continue;
        }

        onProgress?.(`Syncing update: ${item.name} for ${item.slot} (${decision})...`);

        const arrayBuffer = await item.file.arrayBuffer();
        const safeBlob = new Blob([arrayBuffer], { type: item.file.type });

        if (decision === 'keep_both') {
            const newFileId = uuidv4();
            const newFile: FileRecord = {
                id: newFileId,
                name: item.name + " (Sync)",
                originalName: item.file.name,
                versions: [{
                    id: uuidv4(),
                    timestamp: Date.now(),
                    description: 'Imported from SD (Sync Conflict)',
                    blob: safeBlob,
                    duration: 0
                }],
                currentVersionId: '',
                isParked: true, // PARKED
                origin: 'SD Card'
            };
            newFile.currentVersionId = newFile.versions[0].id;
            projectState.files[newFileId] = newFile;
            onProgress?.(`  -> Imported as separate parked file.`);
            continue;
        }

        // Default: Add Version to Existing File
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

// Helper for Legacy Wrapper
export const restoreProjectAndSync = async (
    backupFile: File,
    structureMap: { [key in TapeColor]?: { [slotId: number]: File } }
): Promise<{ state: AppState, report: string } | null> => {
    const projectState = await loadProjectFromZip(backupFile);
    if (!projectState) return null;

    const diff = await calculateSyncDiff(projectState, structureMap);
    const finalState = await applySyncDiff(projectState, diff); // Uses defaults

    return {
        state: finalState,
        report: `Sync Complete: Updated ${diff.updatedFiles.length} files, Added ${diff.newFiles.length} new files.`
    };
};
// ==========================================
// DEVICE SYNC (SK Folder Scanning)
// ==========================================

export interface DeviceDiff {
    projectId: string; // From project.json in SK
    projectName: string;
    newFiles: DeviceFileChange[];
    updatedFiles: DeviceFileChange[];
    syncedFiles: DeviceFileChange[];
}

export const scanDeviceChanges = async (skHandle: FileSystemDirectoryHandle): Promise<DeviceDiff | null> => {
    try {
        // 1. Read Project Manifest
        let projectIdentity: any = null;
        try {
            const jsonHandle = await skHandle.getFileHandle('project.json');
            const file = await jsonHandle.getFile();
            const text = await file.text();
            projectIdentity = JSON.parse(text);
        } catch (e) {
            console.warn("No project.json found in SK folder. Cannot verify device changes.");
            return null;
        }

        if (!projectIdentity || !projectIdentity.metadata) return null;

        const diff: DeviceDiff = {
            projectId: projectIdentity.metadata.projectName, // Using name as ID for now
            projectName: projectIdentity.metadata.projectName,
            newFiles: [],
            updatedFiles: [],
            syncedFiles: []
        };

        const exportDate = new Date(projectIdentity.metadata.exportDate).getTime();
        const TOLERANCE = 2000; // 2 seconds tolerance

        // 2. Scan SK Folders
        for (const color of TAPE_COLORS) {
            const folderName = color.charAt(0).toUpperCase(); // "R", "B"
            try {
                const tapeHandle = await skHandle.getDirectoryHandle(folderName);
                // @ts-ignore
                for await (const [name, entry] of tapeHandle.entries()) {
                    if (entry.kind === 'file' && name.toUpperCase().endsWith('.WAV')) {
                        const match = name.match(/^(\d+)\.WAV$/i);
                        if (match) {
                            const slotId = parseInt(match[1]);
                            const fileHandle = entry as FileSystemFileHandle;
                            const file = await fileHandle.getFile();

                            // 3. Compare with Manifest
                            // Manifest structure: tapes[color].slots[index].fileId
                            // And files[fileId]

                            const tape = projectIdentity.tapes[color];
                            const slot = tape?.slots.find((s: any) => s.id === slotId);
                            const originalFileId = slot?.fileId;

                            // Check if this slot was supposed to be empty
                            if (!originalFileId) {
                                // NEW FILE
                                diff.newFiles.push({
                                    slot: `${color}${slotId}`,
                                    file,
                                    color,
                                    slotId
                                });
                            } else {
                                // SLOT WAS OCCUPIED
                                // Check if modified
                                // Logic: If file.lastModified > exportDate -> Modified
                                if (file.lastModified > (exportDate + TOLERANCE)) {
                                    diff.updatedFiles.push({
                                        slot: `${color}${slotId}`,
                                        file,
                                        color,
                                        slotId,
                                        originalFileId
                                    });
                                } else {
                                    diff.syncedFiles.push({
                                        slot: `${color}${slotId}`,
                                        file,
                                        color,
                                        slotId,
                                        originalFileId
                                    });
                                }
                            }
                        }
                    }
                }
            } catch (e) {
                // Folder might not exist, skip
            }
        }

        return diff;

    } catch (e) {
        console.error("Failed to scan device changes", e);
        return null;
    }
};

/**
 * Scans the root SD handle for the 'SK' folder and reads its Tape structure.
 * This ensures we iterate correctly using the master TAPE_COLORS.
 */
export const scanSKStructure = async (rootHandle: FileSystemDirectoryHandle): Promise<{ [key in TapeColor]?: { [slotId: number]: File } }> => {
    const structureMap: { [key in TapeColor]?: { [slotId: number]: File } } = {};

    try {
        const skRoot = await rootHandle.getDirectoryHandle('SK', { create: false });

        for (const color of TAPE_COLORS) {
            const letter = color.charAt(0).toUpperCase();
            structureMap[color] = {};

            try {
                const tapeDir = await skRoot.getDirectoryHandle(letter, { create: false });

                // @ts-ignore
                for await (const [name, entry] of tapeDir.entries()) {
                    if (entry.kind === 'file' && name.toUpperCase().endsWith('.WAV')) {
                        const match = name.match(/^(\d+)\.WAV$/i);
                        if (match) {
                            structureMap[color]![parseInt(match[1])] = await (entry as FileSystemFileHandle).getFile();
                        }
                    }
                }
            } catch (e) {
                // Tape folder missing, safe to skip
            }
        }
    } catch (e) {
        // SK folder entirely missing, return empty structure map
    }

    return structureMap;
};
