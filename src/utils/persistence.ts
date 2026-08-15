import { openDB, deleteDB } from 'idb';
import type { AppState } from '../types';
import { dbName } from './storageNamespace';

const DB_NAME = dbName('spotykach-wav-builder');
const DB_VERSION = 4;
const STORE_NAME = 'app-state';
const USER_LIBRARY_STORE = 'user-library';
const CUSTOM_FOLDERS_STORE = 'custom-folders';
const BROWSE_POOL_STORE = 'browse-pool';

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
    origin?: string;
    license?: string;
    sourceSamplePath?: string;
    sourcePath?: string;
    edited?: boolean;
    original: Blob;
    current: Blob;
}

export const saveBrowsePoolToDB = async (entries: BrowsePoolEntry[]) => {
    try {
        const db = await initDB();
        await db.put(BROWSE_POOL_STORE, entries, 'current');
    } catch (e) {
        console.error('Failed to save the temporary pool to DB', e);
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

export const clearBrowsePoolFromDB = async () => {
    try {
        const db = await initDB();
        await db.delete(BROWSE_POOL_STORE, 'current');
    } catch (e) {
        console.error('Failed to clear the temporary pool', e);
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
