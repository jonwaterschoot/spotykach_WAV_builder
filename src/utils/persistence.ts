import { openDB, deleteDB } from 'idb';
import type { AppState } from '../types';

const DB_NAME = 'spotykach-wav-builder';
const DB_VERSION = 2;
const STORE_NAME = 'app-state';
const USER_LIBRARY_STORE = 'user-library';

const initDB = async () => {
    return openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
            if (!db.objectStoreNames.contains(USER_LIBRARY_STORE)) {
                db.createObjectStore(USER_LIBRARY_STORE);
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
