import {
    loadBrowsePoolFromDB, loadUserLibraryFromDB, saveBrowsePoolToDB, saveUserLibraryToDB,
    type BrowsePoolEntry, type MangleResultEntry,
} from '../utils/persistence';
import type { DetachedSample } from '../utils/detachedState';
import type { FileRecord, UserLibrary } from '../types';
import { resultLicense } from './license';
import { toM8Wav } from '../lib/audio/m8Wav';
import JSZip from 'jszip';

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

/**
 * Results as files of the project open in Studio, when the mangler runs inside it.
 * Parked: the host decides which one, if any, goes into a slot. Named the way
 * Studio names an import (upper case, no extension).
 */
export const resultsAsProjectFiles = (results: MangleResultEntry[]): FileRecord[] =>
    results.map(r => {
        const id = newId();
        const versionId = newId();
        return {
            id,
            name: r.name.toUpperCase(),
            originalName: `${r.name}.wav`,
            versions: [{
                id: versionId,
                timestamp: Date.now(),
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
        };
    });

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

/**
 * Results as Dirtywave M8 WAVs (16-bit PCM, a cue point per slice): one result
 * is its WAV, more are a zip of them.
 */
export async function resultsForM8(results: MangleResultEntry[]): Promise<{ blob: Blob; fileName: string }> {
    const wavs = await Promise.all(results.map(r => toM8Wav(r.blob, r.recipe.cuePoints)));
    if (results.length === 1) return { blob: wavs[0], fileName: `${results[0].name}.wav` };

    const zip = new JSZip();
    const taken = new Set<string>();
    results.forEach((r, i) => {
        let fileName = `${r.name}.wav`;
        for (let n = 2; taken.has(fileName.toLowerCase()); n++) fileName = `${r.name}-${n}.wav`;
        taken.add(fileName.toLowerCase());
        zip.file(fileName, wavs[i]);
    });
    return { blob: await zip.generateAsync({ type: 'blob' }), fileName: `mangler-m8-${results.length}.zip` };
}
