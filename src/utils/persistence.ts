import { openDB, deleteDB } from 'idb';
import type { AppState } from '../types';

const DB_NAME = 'spotykach-wav-builder';
const STORE_NAME = 'app-state';

const initDB = async () => {
    return openDB(DB_NAME, 1, {
        upgrade(db) {
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
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
