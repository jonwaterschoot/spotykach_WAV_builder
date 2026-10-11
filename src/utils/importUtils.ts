import type { AppState, TapeColor, FileRecord, AudioVersion, ProjectSummary } from '../types';
import { TAPE_COLORS } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { hashBlob } from './assetUtils';
import type { CardBackend, SlotDescriptor } from '../lib/card/cardBackend';
import { readCardSlots, slotFile } from '../lib/card/cardBackend';

export type ImportType =
    | 'PROJECT_BACKUP'
    | 'SD_STRUCTURE'
    | 'SD_WITH_BACKUP'
    | 'LOOSE_FILES'
    /**
     * A ZIP built by the Submit tool. Recognised so it can be *refused by name*
     * rather than falling through to the loose-file scanner, which would offer to
     * import somebody's submission as a heap of untitled samples.
     */
    | 'SUBMISSION_ARCHIVE'
    | 'UNKNOWN';

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
        const JSZip = (await import('jszip')).default;
        const zip = await JSZip.loadAsync(zipFile);
        
        const descriptorJson = zip.file("project-descriptor.json") || zip.file(Object.keys(zip.files).find(p => p.endsWith('/project-descriptor.json')) || '');
        const projectJson = zip.file("project.json") || zip.file(Object.keys(zip.files).find(p => p.endsWith('/project.json')) || '');

        if (descriptorJson) {
            onProgress?.('Parsing project descriptor...');
            const content = await descriptorJson.async("string");
            const { parseProjectDescriptor, hydrateDescriptor } = await import('./projectDescriptorUtils');
            const descriptor = parseProjectDescriptor(JSON.parse(content));

            // Extract custom blobs
            const customAssets: Record<string, Blob> = {};
            
            for (const [path, file] of Object.entries(zip.files)) {
                if (!file.dir && path.includes('custom_assets/')) {
                    // Normalize path to "custom_assets/filename.wav"
                    const parts = path.split('custom_assets/');
                    const assetName = parts[parts.length - 1];
                    const blob = await file.async("blob");
                    customAssets[`custom_assets/${assetName}`] = blob;
                }
            }

            return await hydrateDescriptor(descriptor, customAssets, (msg) => {
                onProgress?.(msg);
            });
        }

        if (projectJson) {
            onProgress?.('Parsing project data...');
            const content = await projectJson.async("string");
            const state = JSON.parse(content) as AppState;
            
            const prefix = projectJson.name.replace('project.json', '');
            const blobsPrefix = `${prefix}blobs/`;

            const totalFiles = Object.keys(state.files).length;
            let processed = 0;

            for (const fileId of Object.keys(state.files)) {
                const file = state.files[fileId];
                if (file && file.versions) { // Guard checks
                    for (const version of file.versions) {
                        const blobName = `${version.id}.wav`;
                        const blobFile = zip.file(`${blobsPrefix}${blobName}`) || zip.file(`blobs/${blobName}`);
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
            return state;
        }
        return null;
    } catch (e) {
        console.error("Failed to load project zip", e);
        return null;
    }
};

/** Cheap enough to run before anything else: reads the index, not the contents. */
const isSubmissionArchive = async (zipFile: File): Promise<boolean> => {
    try {
        const JSZip = (await import('jszip')).default;
        const zip = await JSZip.loadAsync(zipFile);
        return !!zip.file('submission.json');
    } catch {
        return false;
    }
};

export const analyzeImport = async (inputFiles: File[], onProgress?: (msg: string) => void): Promise<ImportAnalysis> => {
    // 1. Check for Single ZIP Project Backup
    if (inputFiles.length === 1 && inputFiles[0].name.endsWith('.zip')) {
        // Before anything else: a submission archive holds a descriptor and audio and
        // is not a project. Left to fall through, the loose-file scanner would happily
        // offer to import the pack as untitled samples.
        if (await isSubmissionArchive(inputFiles[0])) {
            return {
                type: 'SUBMISSION_ARCHIVE',
                summary: 'This ZIP was built by the Submit tool.',
            };
        }
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
    /** The card slot as listed, header read. */
    remote?: SlotDescriptor;
    /** The card file, when the route has it without a download (card reader). */
    remoteFile?: File;
    /** Our metadata from the card file's header (id, hash, name, frames), if any. */
    remoteMeta?: WavMetadata | null;
    /** How the card file was tied to the project file. Absent when nothing tied them. */
    match?: SlotMatch;
    /**
     * MATCH, but the card file's header is out of date: written by 4.1.3 or earlier
     * (no `ICMT.h`, `LIST` after the audio), or with its audio off a multiple of 4,
     * which the device can't play. Same audio, so not a conflict; a build should
     * still rewrite it once.
     */
    staleHeader?: boolean;
}

/**
 * The matching ladder, strongest first:
 * - `id`: `ICMT.id` is this slot's file record (MATCH, or CONFLICT when it changed)
 * - `hash`: `ICMT.h` is this slot's audio under another record (MATCH)
 * - `bytes`: the files are identical, no metadata needed (MATCH)
 * - `name`: only `INAM` and the length agree. Probably the same file, but left
 *   as a CONFLICT for the user to confirm
 */
export type SlotMatch = 'id' | 'hash' | 'bytes' | 'name';

/** Does a card file's INAM name this record? Compared after the same 64-byte cut. */
const sameName = (inam: string, file: FileRecord): boolean => {
    const decoder = new TextDecoder();
    return [file.originalName, file.name].some(n => !!n && decoder.decode(utf8Truncate(n, MAX_INAM_BYTES)) === inam);
};

/** Frames of a local version, when it is a 48 kHz WAV and so has the card's length. */
const localFrames = async (blob: Blob): Promise<number | undefined> => {
    const info = await readWavHeaderInfo(blob).catch(() => null);
    return info?.sampleRate === 48000 ? info.frames : undefined;
};

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
export interface DuplicateEntry {
    slotId: string;
    side: 'project' | 'sd';
    name: string;
}

export interface DuplicateGroup {
    hash: string;
    entries: DuplicateEntry[];
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
    config?: {
        status: SyncStatus;
        localConfig?: any;
        remoteConfigText?: string;
        location?: 'root' | 'sk';
    };
    duplicates: DuplicateGroup[];
    // Legacy support (optional, can simulate if needed or refactor consumers)
    newFiles: SyncDiffItemNew[];
    updatedFiles: SyncDiffItemUpdate[];
}



import type { WavMetadata } from '../types';
import { MAX_INAM_BYTES, readWavHeaderInfo, utf8Truncate } from '../lib/audio/wavHeader';

/**
 * Our metadata from a WAV: `ICMT` (id, hash, processing, tempo), `INAM` (name),
 * `ITMP`, cue points, and `frames`. Null when the file carries none of it.
 *
 * Takes a whole file or only part of one: the first few KB (a header read), or
 * the bytes after the audio (the tail read for files that keep `LIST` after
 * `data`). `LIST` is found wherever it sits.
 */
export const readWavMetadata = async (source: Blob | ArrayBuffer): Promise<WavMetadata | null> => {
    try {
        return (await readWavHeaderInfo(source)).metadata;
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
/**
 * Compares the project with the card. Runs on slot descriptors (header reads);
 * the card file's bytes are only fetched when nothing in its header ties it to
 * the project file, or when the diff has to hand the file over for an import.
 */
export const calculateSyncDiff = async (
    projectState: AppState,
    card: CardBackend
): Promise<SyncDiff> => {
    const cardConfig = await card.readConfig?.() ?? null;
    const cardSlots = await readCardSlots(card);
    const remoteBytes = new Map<string, Promise<File>>();
    const remoteFileOf = (slotId: string, desc: SlotDescriptor): Promise<File> => {
        if (!remoteBytes.has(slotId)) remoteBytes.set(slotId, slotFile(card, desc));
        return remoteBytes.get(slotId)!;
    };

    // hash → [{slotId, side, name}] — used for duplicate detection
    const hashRegistry = new Map<string, DuplicateEntry[]>();

    const registerHash = (hash: string, entry: DuplicateEntry) => {
        if (!hashRegistry.has(hash)) hashRegistry.set(hash, []);
        hashRegistry.get(hash)!.push(entry);
    };

    const diff: SyncDiff = {
        slots: {},
        summary: { matches: 0, conflicts: 0, localOnly: 0, remoteOnly: 0 },
        totalCount: 0,
        duplicates: [],
        newFiles: [],
        updatedFiles: [],
    };

    // 0. Compare Config
    const localConfig = projectState.projectConfig;
    const remoteConfigText = cardConfig?.text;
    const { generateConfigText } = await import('./exportUtils');

    let configStatus: SyncStatus = 'EMPTY';
    if (localConfig && remoteConfigText) {
        const localConfigText = generateConfigText(localConfig);
        configStatus = localConfigText.trim() === remoteConfigText.trim() ? 'MATCH' : 'CONFLICT';
    } else if (localConfig && !remoteConfigText) {
        configStatus = 'LOCAL_ONLY';
    } else if (!localConfig && remoteConfigText) {
        configStatus = 'REMOTE_ONLY';
    }

    diff.config = {
        status: configStatus,
        localConfig,
        remoteConfigText,
        location: cardConfig?.location
    };

    if (configStatus === 'MATCH') diff.summary.matches++;
    else if (configStatus === 'CONFLICT') diff.summary.conflicts++;
    else if (configStatus === 'LOCAL_ONLY') diff.summary.localOnly++;
    else if (configStatus === 'REMOTE_ONLY') diff.summary.remoteOnly++;

    for (const color of TAPE_COLORS) {
        const tape = projectState.tapes[color];

        for (const localSlot of tape.slots) { // Use for-of for async
            const index = localSlot.id - 1; // 0-indexed assumption from upstream logic
            const slotId = `${color}${localSlot.id}`;
            // The card slot, header already read: id, hash, name, frames. No audio is parsed.
            const remote = cardSlots.get(slotId);
            const localFile = localSlot.fileId ? projectState.files[localSlot.fileId] : undefined;

            let status: SyncStatus = 'EMPTY';

            const remoteMeta = remote?.meta ?? null;
            let match: SlotMatch | undefined;

            if (localFile && remote) {
                // Both exist - Compare
                const currentVer = localFile.versions.find(v => v.id === localFile.currentVersionId);

                let isMatch = false;
                // SHA-256 of the source version: what export writes into ICMT.h.
                const localHash = currentVer?.blob ? (currentVer.hash ?? await hashBlob(currentVer.blob)) : null;
                let remoteHash: string | null = null;

                if (remoteMeta?.id && localFile.id === remoteMeta.id) {
                    // 1. Same file record. It changed if processing, audio or length differ.
                    match = 'id';
                    const localProc = (currentVer?.processing || []).slice().sort();
                    const remoteProc = (remoteMeta.processing || []).slice().sort();
                    isMatch = JSON.stringify(localProc) === JSON.stringify(remoteProc);

                    if (isMatch && remoteMeta.hash && localHash) {
                        isMatch = remoteMeta.hash === localHash;
                    } else if (isMatch && currentVer?.blob) {
                        // Written by 4.1.3 or earlier, without a hash: compare lengths
                        // when both are known. File size would differ on header alone.
                        const frames = await localFrames(currentVer.blob);
                        if (frames !== undefined && remote.frames !== undefined) {
                            isMatch = frames === remote.frames;
                        }
                    }
                } else if (remoteMeta?.hash && localHash && remoteMeta.hash === localHash) {
                    // 2. Same audio under another record.
                    match = 'hash';
                    isMatch = true;
                } else if (currentVer?.blob) {
                    // 3–4. Nothing of ours ties them: compare the bytes. This matches a
                    // version that was itself imported from this card.
                    remoteHash = await hashBlob(await remoteFileOf(slotId, remote));
                    isMatch = localHash === remoteHash;
                    if (isMatch) {
                        match = 'bytes';
                    } else if (!remoteMeta?.id && remoteMeta?.name && sameName(remoteMeta.name, localFile)) {
                        // 3. Only INAM (Vlad's page, another tool). Probably the same file
                        // when the length agrees too; the user confirms.
                        const frames = await localFrames(currentVer.blob);
                        if (frames === undefined || remote.frames === undefined || frames === remote.frames) {
                            match = 'name';
                        }
                    }
                }
                // If no local blob at all, we cannot confirm a match

                // Register hashes for duplicate detection
                if (localHash) {
                    registerHash(localHash, { slotId, side: 'project', name: localFile.name ?? slotId });
                }

                // If it's a MATCH, we don't need to register the SD side separately for the same slotId
                // as it just adds redundant tags to the duplicates banner.
                // We only register the SD side if it's different (implies it won't be a MATCH/CONFLICT loop,
                // but usually this handles the REMOTE_ONLY case or actual CONFLICT content).
                if (!isMatch) {
                    // ICMT.h when present, so a card file lines up with the project version
                    // it was exported from; otherwise the bytes.
                    const rHash = remoteMeta?.hash ?? remoteHash ?? await hashBlob(await remoteFileOf(slotId, remote));
                    registerHash(rHash, { slotId, side: 'sd', name: remoteMeta?.name ?? remote.fileName });
                }

                if (isMatch) {
                    status = 'MATCH';
                    diff.summary.matches++;
                } else {
                    status = 'CONFLICT';
                    diff.summary.conflicts++;

                    diff.updatedFiles.push({
                        slot: slotId,
                        name: remoteMeta?.name ?? remote.fileName,
                        file: await remoteFileOf(slotId, remote),
                        existingFileId: localFile.id,
                        existingName: localFile.name,
                        size: remote.size
                    });
                }
            } else if (localFile && !remote) {
                status = 'LOCAL_ONLY';
                diff.summary.localOnly++;
            } else if (!localFile && remote) {
                status = 'REMOTE_ONLY';
                diff.summary.remoteOnly++;
                diff.newFiles.push({
                    slot: slotId,
                    name: remoteMeta?.name ?? remote.fileName,
                    file: await remoteFileOf(slotId, remote),
                    slotIndex: index,
                    color: color,
                    size: remote.size
                });
            }

            diff.slots[slotId] = {
                slotId,
                color,
                index,
                status,
                localFile,
                remote,
                remoteFile: remote?.file,
                remoteMeta,
                match,
                // `bytes` included: a slot imported from a 4.1.3 card matches its card file
                // byte for byte, and should still move to the current layout once.
                staleHeader: status === 'MATCH' && match !== 'name'
                    && (!remoteMeta?.hash || (remote?.dataOffset ?? 0) % 4 !== 0),
            };
        }
    }

    diff.totalCount = diff.newFiles.length + diff.updatedFiles.length;

    // ── Duplicate Detection ────────────────────────────────────────────────────
    // Also register LOCAL_ONLY and REMOTE_ONLY slots that weren't hashed above
    for (const [slotId, slotDiff] of Object.entries(diff.slots)) {
        if (slotDiff.status === 'LOCAL_ONLY' && slotDiff.localFile) {
            const ver = slotDiff.localFile.versions.find(v => v.id === slotDiff.localFile!.currentVersionId);
            if (ver?.blob) {
                const h = await hashBlob(ver.blob);
                // Only register if not already registered for this slotId+side
                const existing = hashRegistry.get(h);
                if (!existing?.find(e => e.slotId === slotId && e.side === 'project')) {
                    registerHash(h, { slotId, side: 'project', name: slotDiff.localFile.name ?? slotId });
                }
            }
        }
        if (slotDiff.status === 'REMOTE_ONLY' && slotDiff.remote) {
            const h = slotDiff.remoteMeta?.hash ?? await hashBlob(await remoteFileOf(slotId, slotDiff.remote));
            const existing = hashRegistry.get(h);
            if (!existing?.find(e => e.slotId === slotId && e.side === 'sd')) {
                registerHash(h, { slotId, side: 'sd', name: slotDiff.remoteMeta?.name ?? slotDiff.remote.fileName });
            }
        }
    }

    // Any hash with 2+ UNIQUE slot locations = duplicate
    // (If PR B1 and SD B1 have same audio, it's a MATCH, not a duplicate redundant file elsewhere)
    for (const [hash, entries] of hashRegistry.entries()) {
        const uniqueSlots = new Set(entries.map(e => e.slotId));
        if (uniqueSlots.size >= 2) {
            diff.duplicates.push({ hash, entries });
        }
    }

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
    card: CardBackend
): Promise<{ state: AppState, report: string } | null> => {
    const projectState = await loadProjectFromZip(backupFile);
    if (!projectState) return null;

    const diff = await calculateSyncDiff(projectState, card);
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

export const scanDeviceChanges = async (card: CardBackend): Promise<DeviceDiff | null> => {
    try {
        // 1. Read Project Manifest (folder route only: USB can't reach project.json)
        let projectIdentity: any = null;
        try {
            const file = await card.files?.read('SK/project.json');
            if (!file) throw new Error('No SK/project.json');
            projectIdentity = JSON.parse(await file.text());
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

        // 2. Scan the card's slots
        for (const desc of await card.listSlots()) {
            const { tape: color, slot: slotId } = desc;
            const file = await slotFile(card, desc);
            const lastModified = desc.lastModified ?? file.lastModified;

            // 3. Compare with Manifest
            // Manifest structure: tapes[color].slots[index].fileId
            // And files[fileId]
            const tape = projectIdentity.tapes?.[color];
            const slot = tape?.slots.find((s: any) => s.id === slotId);
            const originalFileId = slot?.fileId;

            if (!originalFileId) {
                // NEW FILE: this slot was supposed to be empty
                diff.newFiles.push({ slot: `${color}${slotId}`, file, color, slotId });
            } else if (lastModified > (exportDate + TOLERANCE)) {
                // SLOT WAS OCCUPIED and changed since the export
                diff.updatedFiles.push({ slot: `${color}${slotId}`, file, color, slotId, originalFileId });
            } else {
                diff.syncedFiles.push({ slot: `${color}${slotId}`, file, color, slotId, originalFileId });
            }
        }

        return diff;

    } catch (e) {
        console.error("Failed to scan device changes", e);
        return null;
    }
};
