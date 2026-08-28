import { openDB, deleteDB } from 'idb';
import type { AppState } from '../types';
import { dbName } from './storageNamespace';

const DB_NAME = dbName('spotykach-wav-builder');
const DB_VERSION = 5;
const STORE_NAME = 'app-state';
const USER_LIBRARY_STORE = 'user-library';
const CUSTOM_FOLDERS_STORE = 'custom-folders';
const BROWSE_POOL_STORE = 'browse-pool';
const SUBMISSION_STORE = 'submission-draft';

const initDB = async () => {
    return openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
            if (!db.objectStoreNames.contains(USER_LIBRARY_STORE)) {
                db.createObjectStore(USER_LIBRARY_STORE);
            }
            if (!db.objectStoreNames.contains(CUSTOM_FOLDERS_STORE)) {
                db.createObjectStore(CUSTOM_FOLDERS_STORE);
            }
            if (!db.objectStoreNames.contains(BROWSE_POOL_STORE)) {
                db.createObjectStore(BROWSE_POOL_STORE);
            }
            if (!db.objectStoreNames.contains(SUBMISSION_STORE)) {
                db.createObjectStore(SUBMISSION_STORE);
            }
        },
    });
};

export const clearState = async () => {
    try {
        await deleteDB(DB_NAME);
        window.location.reload();
    } catch (e) {
        console.error("Failed to clear DB", e);
        alert("Failed to clear data.");
    }
};

export const saveStateToDB = async (state: AppState) => {
    try {
        const db = await initDB();
        await db.put(STORE_NAME, state, 'current');
    } catch (e) {
        console.error('Failed to save state to DB', e);
    }
};

/**
 * Drop the auto-save snapshot.
 *
 * Called when auto-save is switched off: leaving the last snapshot behind would
 * mean a later session silently restoring a state the user stopped consenting to
 * have saved. The projects on disk are untouched — this is only the IDB slot.
 */
export const clearStateFromDB = async () => {
    try {
        const db = await initDB();
        await db.delete(STORE_NAME, 'current');
    } catch (e) {
        console.error('Failed to clear state slot', e);
    }
};

export const loadStateFromDB = async (): Promise<AppState | null> => {
    try {
        const db = await initDB();
        return (await db.get(STORE_NAME, 'current')) || null;
    } catch (e) {
        console.error('Failed to load state from DB', e);
        return null;
    }
};

export const saveUserLibraryToDB = async (library: import('../types').UserLibrary) => {
    try {
        const db = await initDB();
        await db.put(USER_LIBRARY_STORE, library, 'current');
    } catch (e) {
        console.error('Failed to save user library to DB', e);
    }
};

export const loadUserLibraryFromDB = async (): Promise<import('../types').UserLibrary | null> => {
    try {
        const db = await initDB();
        return (await db.get(USER_LIBRARY_STORE, 'current')) || null;
    } catch (e) {
        console.error('Failed to load user library from DB', e);
        return null;
    }
};

/**
 * One entry of Browse mode's temporary pool — R2-4.
 *
 * Its own store, not the `app-state` slot: locked decision 5 says the project-free
 * tiers must not write that slot, and Browse still doesn't. The pool used to be
 * React state that died with the mode, so leaving for the hub emptied it.
 *
 * `original` as well as `current`, which is the same two-version rule the rest of
 * the app follows: an edit replaces `current` and leaves the file as it was pooled
 * still recoverable.
 */
export interface BrowsePoolEntry {
    id: string;
    name: string;
    fileName?: string;
    duration: number;
    /** Optional: entries written before the editor needed the original's length. */
    originalDuration?: number;
    origin?: string;
    license?: string;
    sourceSamplePath?: string;
    sourcePath?: string;
    edited?: boolean;
    original: Blob;
    current: Blob;
}

/**
 * Enough to mention the pool without reading it.
 *
 * Studio only wants to say "there is a pool and it has N files in it". Reading the
 * entries to count them would materialise every blob in the store — up to two per
 * file — for a number, so the number is written alongside them instead.
 */
export interface BrowsePoolSummary {
    count: number;
    /** Seconds across the whole pool. */
    duration: number;
}

export const saveBrowsePoolToDB = async (entries: BrowsePoolEntry[]) => {
    try {
        const db = await initDB();
        await db.put(BROWSE_POOL_STORE, entries, 'current');
        const summary: BrowsePoolSummary = {
            count: entries.length,
            duration: entries.reduce((acc, entry) => acc + (entry.duration || 0), 0),
        };
        await db.put(BROWSE_POOL_STORE, summary, 'summary');
    } catch (e) {
        console.error('Failed to save the temporary pool to DB', e);
    }
};

export const loadBrowsePoolSummaryFromDB = async (): Promise<BrowsePoolSummary | null> => {
    try {
        const db = await initDB();
        return (await db.get(BROWSE_POOL_STORE, 'summary')) || null;
    } catch (e) {
        console.error('Failed to read the temporary pool summary', e);
        return null;
    }
};

export const loadBrowsePoolFromDB = async (): Promise<BrowsePoolEntry[]> => {
    try {
        const db = await initDB();
        return (await db.get(BROWSE_POOL_STORE, 'current')) || [];
    } catch (e) {
        console.error('Failed to load the temporary pool from DB', e);
        return [];
    }
};

/**
 * The projects this pool has been copied into — R2-9, the whole of it.
 *
 * Not a link. Copying the pool into a project is a one-way export through
 * `createProjectFromState`, and the two have nothing to say to each other
 * afterwards: the pool is blobs in IndexedDB, the project is folders behind a
 * permission Browse deliberately never holds. This is the record that the copy
 * happened, so the panel can say so and say plainly that it is not a link.
 *
 * Kept beside the pool rather than inside it because it describes the selection as
 * a whole, and because it must outlive individual entries being removed.
 */
export const saveBrowsePoolCopiesToDB = async (projectNames: string[]) => {
    try {
        const db = await initDB();
        await db.put(BROWSE_POOL_STORE, projectNames, 'copied-into');
    } catch (e) {
        console.error('Failed to record where the pool was copied', e);
    }
};

export const loadBrowsePoolCopiesFromDB = async (): Promise<string[]> => {
    try {
        const db = await initDB();
        return (await db.get(BROWSE_POOL_STORE, 'copied-into')) || [];
    } catch (e) {
        console.error('Failed to read where the pool was copied', e);
        return [];
    }
};

/** Emptying the pool forgets where it was copied too — a new pool, a new history. */
export const clearBrowsePoolFromDB = async () => {
    try {
        const db = await initDB();
        await db.delete(BROWSE_POOL_STORE, 'current');
        await db.delete(BROWSE_POOL_STORE, 'copied-into');
        await db.delete(BROWSE_POOL_STORE, 'summary');
    } catch (e) {
        console.error('Failed to clear the temporary pool', e);
    }
};

/**
 * The submission draft — the one long-lived thing the submit tool owns.
 *
 * Kept here rather than in localStorage because a draft carries blobs: the audio
 * the artist dropped in, and the cover image. It is written on a debounce as the
 * form is filled, and read once on mount, so a closed tab costs nothing. Cleared
 * only when the artist says so, or when a submission is finished and dismissed.
 *
 * Deliberately typed as `unknown` at this layer: the shape belongs to the tool
 * (`src/submission/draft.ts`), and persistence has no business knowing it. What
 * this module guarantees is that whatever went in comes back out, blobs intact.
 */
export const saveSubmissionDraftToDB = async (draft: unknown) => {
    try {
        const db = await initDB();
        await db.put(SUBMISSION_STORE, draft, 'current');
    } catch (e) {
        console.error('Failed to save the submission draft', e);
    }
};

export const loadSubmissionDraftFromDB = async <T = unknown>(): Promise<T | null> => {
    try {
        const db = await initDB();
        return (await db.get(SUBMISSION_STORE, 'current')) || null;
    } catch (e) {
        console.error('Failed to load the submission draft', e);
        return null;
    }
};

export const clearSubmissionDraftFromDB = async () => {
    try {
        const db = await initDB();
        await db.delete(SUBMISSION_STORE, 'current');
        await db.delete(SUBMISSION_STORE, 'handoff');
    } catch (e) {
        console.error('Failed to clear the submission draft', e);
    }
};

/**
 * A one-shot parcel from another mode — Studio's export modal, or Browse's pool.
 *
 * Separate from the draft itself because a handoff must not silently overwrite work
 * in progress: the tool reads this slot on arrival, asks what to do when a draft is
 * already open, and deletes the parcel either way. Nothing else ever reads it.
 */
export const saveSubmissionHandoffToDB = async (handoff: unknown) => {
    try {
        const db = await initDB();
        await db.put(SUBMISSION_STORE, handoff, 'handoff');
    } catch (e) {
        console.error('Failed to hand off to the submission tool', e);
    }
};

export const takeSubmissionHandoffFromDB = async <T = unknown>(): Promise<T | null> => {
    try {
        const db = await initDB();
        const parcel = (await db.get(SUBMISSION_STORE, 'handoff')) || null;
        if (parcel) await db.delete(SUBMISSION_STORE, 'handoff');
        return parcel;
    } catch (e) {
        console.error('Failed to read the submission handoff', e);
        return null;
    }
};

export interface CustomFolderRecord {
    id: string;
    name: string;
    handle: FileSystemDirectoryHandle;
}

export const saveCustomFoldersToDB = async (folders: CustomFolderRecord[]) => {
    try {
        const db = await initDB();
        await db.put(CUSTOM_FOLDERS_STORE, folders, 'current');
    } catch (e) {
        console.error('Failed to save custom folders to DB', e);
    }
};

export const loadCustomFoldersFromDB = async (): Promise<CustomFolderRecord[]> => {
    try {
        const db = await initDB();
        const data = await db.get(CUSTOM_FOLDERS_STORE, 'current');
        return data || [];
    } catch (e) {
        console.error('Failed to load custom folders from DB', e);
        return [];
    }
};
