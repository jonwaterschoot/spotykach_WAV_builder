import type { AppState, FileRecord, TapeColor } from '../types';
import { TAPE_COLORS } from '../types';

// ==========================================
// TWO-WAY PROJECT SYNC UTILITY
// ==========================================

export type SyncDecision = 'keep_local' | 'use_backup' | 'skip' | 'delete_local' | 'delete_backup';

export interface SlotSyncEntry {
    tapeColor: TapeColor;
    slotId: number;
    slotLabel: string;

    // Local side
    localFileId: string | null;
    localFile: FileRecord | null;
    localCurrentBlob: Blob | null;
    localVersionCount: number;

    // Backup side
    backupFileId: string | null;
    backupFile: FileRecord | null;
    backupCurrentBlob: Blob | null;
    backupVersionCount: number;

    status: 'same' | 'local_only' | 'backup_only' | 'conflict';
    historyRisk: boolean; // true when using backup would destroy more local history

    decision: SyncDecision;
}

export interface NoteSyncEntry {
    id: 'project' | TapeColor | 'config';
    label: string;
    localNotes?: string;
    backupNotes?: string;
    localConfig?: any;
    backupConfig?: any;
    status: 'same' | 'conflict' | 'local_only' | 'backup_only';
    decision: SyncDecision;
}

/**
 * Load a project's full AppState from a directory handle, re-hydrating
 * blobs from the Assets/ subfolder.
 */
export const loadBackupProjectState = async (
    rootHandle: FileSystemDirectoryHandle,
    projectName: string
): Promise<AppState | null> => {
    try {
        // SD card structure: rootHandle/WAV_Builder/Projects/{name}/
        // Fallback (legacy/local backup): rootHandle/Projects/{name}/
        let projectHandle: FileSystemDirectoryHandle;
        try {
            const wavBuilderHandle = await rootHandle.getDirectoryHandle('WAV_Builder', { create: false });
            const projectsHandle = await wavBuilderHandle.getDirectoryHandle('Projects', { create: false });
            projectHandle = await projectsHandle.getDirectoryHandle(projectName, { create: false });
        } catch {
            // Fallback: try rootHandle/Projects/{name}/
            const projectsHandle = await rootHandle.getDirectoryHandle('Projects', { create: false });
            projectHandle = await projectsHandle.getDirectoryHandle(projectName, { create: false });
        }

        // Read project.json
        const jsonHandle = await projectHandle.getFileHandle('project.json', { create: false });
        const jsonFile = await jsonHandle.getFile();
        const jsonText = await jsonFile.text();
        const parsed = JSON.parse(jsonText);

        if (!parsed.files || !parsed.tapes) return null;

        // Re-hydrate blobs from Assets/
        let assetsHandle: FileSystemDirectoryHandle | null = null;
        try {
            assetsHandle = await projectHandle.getDirectoryHandle('Assets', { create: false });
        } catch {
            // no Assets folder
        }

        const hydratedFiles: Record<string, FileRecord> = {};
        for (const [id, fileData] of Object.entries(parsed.files as Record<string, any>)) {
            const hydratedVersions = await Promise.all(
                (fileData.versions || []).map(async (v: any) => {
                    let blob: Blob | null = null;
                    if (v.blobRef && assetsHandle) {
                        try {
                            // blobRef is like "Assets/uuid.wav" — extract filename
                            const blobName = v.blobRef.split('/').pop();
                            const blobHandle = await assetsHandle.getFileHandle(blobName, { create: false });
                            const blobFile = await blobHandle.getFile();
                            // Force safe copy
                            const ab = await blobFile.arrayBuffer();
                            blob = new Blob([ab], { type: 'audio/wav' });
                        } catch {
                            // blob file missing
                        }
                    } else if (v.blob) {
                        blob = v.blob;
                    }
                    return { ...v, blob };
                })
            );
            hydratedFiles[id] = {
                ...fileData,
                versions: hydratedVersions,
            } as FileRecord;
        }

        return {
            files: hydratedFiles,
            tapes: parsed.tapes,
            metadata: parsed.metadata,
            projectNotes: parsed.projectNotes,
            projectConfig: parsed.projectConfig,
        };
    } catch (e) {
        console.warn('[loadBackupProjectState] Failed', e);
        return null;
    }
};

/**
 * Compare local and backup AppState slot by slot, returning a diff entry per
 * slot that has any content on either side.
 */
export const compareProjectStates = (
    localState: AppState,
    backupState: AppState | null
): { slots: SlotSyncEntry[], notes: NoteSyncEntry[] } => {
    const entries: SlotSyncEntry[] = [];
    const noteEntries: NoteSyncEntry[] = [];

    const createNoteEntry = (
        id: NoteSyncEntry['id'],
        label: string,
        localN: string | undefined,
        backupN: string | undefined
    ): NoteSyncEntry | null => {
        const l = localN || undefined;
        const b = backupN || undefined;
        if (!l && !b) return null;
        let status: NoteSyncEntry['status'] = 'same';
        let decision: SyncDecision = 'skip';
        if (l && !b) { status = 'local_only'; decision = 'keep_local'; }
        else if (!l && b) { status = 'backup_only'; decision = 'use_backup'; }
        else if (l && b && l !== b) { status = 'conflict'; decision = 'keep_local'; }
        else { status = 'same'; decision = 'skip'; }

        return { id, label, localNotes: l, backupNotes: b, status, decision };
    };

    // 1. Compare Project Notes
    const projectNotesEntry = createNoteEntry('project', 'Project Notes', localState.projectNotes, backupState?.projectNotes);
    if (projectNotesEntry) noteEntries.push(projectNotesEntry);

    // 2. Compare Project Config
    const localConfig = localState.projectConfig;
    const backupConfig = backupState?.projectConfig;

    // Simple deep equals for config
    const configMatch = JSON.stringify(localConfig || {}) === JSON.stringify(backupConfig || {});
    let configStatus: 'same' | 'conflict' | 'local_only' | 'backup_only' = 'same';

    if (!localConfig && backupConfig) configStatus = 'backup_only';
    else if (localConfig && !backupConfig) configStatus = 'local_only';
    else if (!configMatch) configStatus = 'conflict';

    if (configStatus !== 'same' || localConfig || backupConfig) { // Only add if there's a difference or at least one exists
        noteEntries.push({
            id: 'config',
            label: 'Config Settings',
            localConfig,
            backupConfig,
            status: configStatus,
            decision: (configStatus === 'same') ? 'skip' : 'keep_local' // Default to keeping local config
        });
    }

    // 3. Compare Tape Slots and Notes
    for (const color of TAPE_COLORS) {
        const localTape = localState.tapes[color];
        const backupTape = backupState?.tapes[color];

        for (let i = 0; i < 6; i++) {
            const localSlot = localTape?.slots[i];
            const backupSlot = backupTape?.slots[i];

            const localFileId = localSlot?.fileId ?? null;
            const backupFileId = backupSlot?.fileId ?? null;

            const localFile = localFileId ? (localState.files[localFileId] ?? null) : null;
            // Try matching by original file id first, then by slot file map
            const backupFile = backupFileId ? (backupState?.files[backupFileId] ?? null) : null;

            // Both empty — skip row
            if (!localFile && !backupFile) continue;

            const localCurrentVersion = localFile?.versions.find(v => v.id === localFile.currentVersionId) ?? null;
            const backupCurrentVersion = backupFile?.versions.find(v => v.id === backupFile.currentVersionId) ?? null;

            const localVersionCount = localFile?.versions.length ?? 0;
            const backupVersionCount = backupFile?.versions.length ?? 0;

            // Determine status
            let status: SlotSyncEntry['status'];
            if (!localFile && backupFile) {
                status = 'backup_only';
            } else if (localFile && !backupFile) {
                status = 'local_only';
            } else {
                // Both have files — check if they're meaningful different
                // We compare: currentVersionId, file name, and version count
                const sameVersionId = localFile!.currentVersionId === backupFile!.currentVersionId;
                const sameName = localFile!.originalName === backupFile!.originalName;
                const sameVersionCount = localVersionCount === backupVersionCount;
                status = (sameVersionId && sameName && sameVersionCount) ? 'same' : 'conflict';
            }

            // History risk: using backup would result in fewer versions than local currently has
            const historyRisk = status === 'conflict' && localVersionCount > backupVersionCount;

            // Sensible default decision
            let decision: SyncDecision;
            if (status === 'same') {
                decision = 'skip';
            } else if (status === 'backup_only') {
                decision = 'use_backup'; // Default: pull from backup into local
            } else if (status === 'local_only') {
                decision = 'keep_local'; // Push to backup by default
            } else {
                decision = 'keep_local'; // Conflict — prefer local by default
            }

            entries.push({
                tapeColor: color,
                slotId: (localSlot?.id ?? backupSlot?.id ?? i + 1),
                slotLabel: `${color} ${i + 1}`,
                localFileId,
                localFile,
                localCurrentBlob: localCurrentVersion?.blob ?? null,
                localVersionCount,
                backupFileId,
                backupFile,
                backupCurrentBlob: backupCurrentVersion?.blob ?? null,
                backupVersionCount,
                status,
                historyRisk,
                decision,
            });
        }
        const tapeNotesEntry = createNoteEntry(color, `${color} Tape Notes`, localTape.notes, backupTape?.notes);
        if (tapeNotesEntry) noteEntries.push(tapeNotesEntry);
    }

    return { slots: entries, notes: noteEntries };
};

/**
 * Apply sync decisions to the local state, returning a new AppState.
 * `use_backup` entries replace (or clear) the local slot + FileRecord.
 * `keep_local` entries on local_only mean the file should also be written to backup (caller handles this).
 * `skip` entries are untouched.
 */
export const applyProjectSync = (
    localState: AppState,
    entries: SlotSyncEntry[],
    noteEntries: NoteSyncEntry[]
): AppState => {
    const newFiles = { ...localState.files };
    const newTapes = { ...localState.tapes } as Record<TapeColor, (typeof localState.tapes)[TapeColor]>;
    let newProjectNotes = localState.projectNotes;
    let newProjectConfig = localState.projectConfig;

    for (const color of TAPE_COLORS) {
        newTapes[color] = {
            ...newTapes[color],
            slots: [...newTapes[color].slots],
        };
    }

    for (const entry of entries) {
        if (entry.decision === 'skip') continue;

        const { tapeColor, slotId } = entry;
        const slotIndex = slotId - 1;

        if (entry.decision === 'use_backup') {
            if (entry.backupFile) {
                // Add/replace FileRecord from backup
                const newId = entry.backupFileId!;
                newFiles[newId] = entry.backupFile;
                // Remove the old local file if different
                if (entry.localFileId && entry.localFileId !== newId) {
                    delete newFiles[entry.localFileId];
                }
                newTapes[tapeColor].slots[slotIndex] = { id: slotId, fileId: newId };
            } else {
                // Backup is empty — clear the local slot
                if (entry.localFileId) {
                    newFiles[entry.localFileId] = { ...newFiles[entry.localFileId], isParked: true };
                }
                newTapes[tapeColor].slots[slotIndex] = { id: slotId, fileId: null };
            }
        } else if (entry.decision === 'delete_local') {
            // Remove local file and clear the slot
            if (entry.localFileId) {
                delete newFiles[entry.localFileId];
            }
            newTapes[tapeColor].slots[slotIndex] = { id: slotId, fileId: null };
        } else if (entry.decision === 'delete_backup') {
            // backup_only slot: keep the slot empty locally (it already is),
            // and writing stampedState to backup with null slot removes it from backup.
            // Nothing to do to newState — the slot is already null locally.
        }
        // 'keep_local': slot is already correct locally; caller writes identical state to backup.
    }

    for (const entry of noteEntries) {
        if (entry.decision === 'skip' || entry.decision === 'keep_local' || entry.decision === 'delete_backup') continue;

        if (entry.id === 'config') {
            if (entry.decision === 'use_backup') {
                newProjectConfig = entry.backupConfig;
            } else if (entry.decision === 'delete_local') {
                newProjectConfig = undefined;
            }
            continue; // Move to next entry
        }

        let valToSet: string | undefined = undefined;
        if (entry.decision === 'use_backup') valToSet = entry.backupNotes || undefined;
        else if (entry.decision === 'delete_local') valToSet = undefined;

        if (entry.id === 'project') {
            newProjectNotes = valToSet;
        } else {
            const color = entry.id as TapeColor;
            newTapes[color] = { ...newTapes[color], notes: valToSet };
        }
    }

    return { ...localState, files: newFiles, tapes: newTapes as AppState['tapes'], projectNotes: newProjectNotes, projectConfig: newProjectConfig };
};

/**
 * Lightweight content comparison of two parsed project.json objects.
 * Returns true if slot assignments, file metadata, and notes are identical.
 * Does NOT load blobs — only uses the JSON data already read during scan.
 */
export const quickCompareProjects = (
    localData: { files: Record<string, any>; tapes: Record<string, any>; projectNotes?: string; projectConfig?: any },
    backupData: { files: Record<string, any>; tapes: Record<string, any>; projectNotes?: string; projectConfig?: any }
): boolean => {
    // Compare project notes
    if ((localData.projectNotes || '') !== (backupData.projectNotes || '')) return false;

    // Compare project config
    if (JSON.stringify(localData.projectConfig || {}) !== JSON.stringify(backupData.projectConfig || {})) return false;

    // Compare each tape's slots and notes
    for (const color of TAPE_COLORS) {
        const localTape = localData.tapes[color];
        const backupTape = backupData.tapes[color];

        if (!localTape && !backupTape) continue;
        if (!localTape || !backupTape) return false;

        // Compare tape notes
        if ((localTape.notes || '') !== (backupTape.notes || '')) return false;

        // Compare slots (6 slots per tape)
        const localSlots = localTape.slots || [];
        const backupSlots = backupTape.slots || [];
        const maxSlots = Math.max(localSlots.length, backupSlots.length);

        for (let i = 0; i < maxSlots; i++) {
            const ls = localSlots[i];
            const bs = backupSlots[i];
            const localFid = ls?.fileId ?? null;
            const backupFid = bs?.fileId ?? null;

            // Both empty — same
            if (!localFid && !backupFid) continue;
            // One empty, one not — different
            if (!localFid || !backupFid) return false;

            // Compare file records
            const localFile = localData.files[localFid];
            const backupFile = backupData.files[backupFid];

            if (!localFile && !backupFile) continue;
            if (!localFile || !backupFile) return false;

            // Compare key content identifiers (same as compareProjectStates)
            if (localFile.currentVersionId !== backupFile.currentVersionId) return false;
            if (localFile.originalName !== backupFile.originalName) return false;
            if ((localFile.versions?.length ?? 0) !== (backupFile.versions?.length ?? 0)) return false;
        }
    }

    return true;
};
