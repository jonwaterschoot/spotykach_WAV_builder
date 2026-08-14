import { openDB, deleteDB } from 'idb';
import type { AppState } from '../types';
import { dbName } from './storageNamespace';

const DB_NAME = dbName('spotykach-wav-builder');
const DB_VERSION = 3;
const STORE_NAME = 'app-state';
const USER_LIBRARY_STORE = 'user-library';
const CUSTOM_FOLDERS_STORE = 'custom-folders';

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
