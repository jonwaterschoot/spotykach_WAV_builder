import {
    loadBrowsePoolFromDB, loadUserLibraryFromDB, saveBrowsePoolToDB, saveUserLibraryToDB,
    type BrowsePoolEntry, type MangleResultEntry,
} from '../utils/persistence';
import type { DetachedSample } from '../utils/detachedState';
import type { FileRecord, UserLibrary } from '../types';
import { resultLicense } from './license';

/**
 * The mangler's ways out besides a download: Browse's pool, Studio's user
 * library, and (through `buildDetachedState`) a new Studio project. All three go
 * through IndexedDB or a folder the user picks at that moment; the mangler holds
 * no folder permission of its own.
 */

export const RESULT_ORIGIN = 'Sample Mangler';

const newId = () =>
    typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2, 15);

/** Appends to Browse's temporary pool, which can already build an SK folder. */
export async function addResultsToBrowsePool(results: MangleResultEntry[]): Promise<void> {
    const pool = await loadBrowsePoolFromDB();
    const added: BrowsePoolEntry[] = results.map(r => ({
        id: newId(),
        name: r.name,
        fileName: `${r.name}.wav`,
        duration: r.duration,
        originalDuration: r.duration,
        origin: RESULT_ORIGIN,
        license: resultLicense(r.recipe).text,
        original: r.blob,
        current: r.blob,
    }));
    await saveBrowsePoolToDB([...pool, ...added]);
}

/**
 * Adds the results to Studio's user library store. Studio reads the store when it
 * mounts and writes `pendingDiskWrite` records into `User_Library/` on its next
 * autosave. The library folder is keyed by file name, so names are made unique.
 * Returns the names used.
 */
export async function saveResultsToLibrary(results: MangleResultEntry[]): Promise<string[]> {
    const library: UserLibrary = (await loadUserLibraryFromDB()) ?? { files: {}, metadata: {} };
    const taken = new Set(Object.values(library.files).map(f => f.name.toLowerCase()));
    const names: string[] = [];

    for (const r of results) {
        let fileName = `${r.name}.wav`;
        for (let n = 2; taken.has(fileName.toLowerCase()); n++) fileName = `${r.name}-${n}.wav`;
        taken.add(fileName.toLowerCase());

        const id = newId();
        const versionId = newId();
        const record: FileRecord = {
            id,
            name: fileName,
            originalName: fileName,
            versions: [{
                id: versionId,
                timestamp: r.createdAt,
                description: 'Original',
                blob: r.blob,
                duration: r.duration,
            }],
            currentVersionId: versionId,
            isParked: true,
            origin: RESULT_ORIGIN,
            license: resultLicense(r.recipe).text,
            tags: ['mangled'],
            metadata: { slicePoints: r.recipe.cuePoints.map(f => f / 48000) },
            pendingDiskWrite: true,
        };
        library.files[id] = record;
        names.push(fileName);
    }

    await saveUserLibraryToDB(library);
    return names;
}

/** The shape `buildDetachedState` lays out on the grid, for a new project. */
export const resultsAsDetached = (results: MangleResultEntry[]): DetachedSample[] =>
    results.map(r => ({
        name: r.name,
        fileName: `${r.name}.wav`,
        blob: r.blob,
        duration: r.duration,
        origin: RESULT_ORIGIN,
        license: resultLicense(r.recipe).text,
    }));
