import { openDB } from 'idb';

const DB_NAME = 'spotykach-tags';
const DB_VERSION = 1;
const STORE_NAME = 'known-tags';

const initDB = async () => {
    return openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        },
    });
};

export const saveKnownTags = async (tags: string[]) => {
    try {
        const db = await initDB();
        // Keep them lowercased and deduped
        const cleanTags = Array.from(new Set(tags.map(t => t.trim().toLowerCase()).filter(Boolean)));
        await db.put(STORE_NAME, cleanTags, 'current');
    } catch (e) {
        console.error('Failed to save known tags to DB', e);
    }
};

export const loadKnownTags = async (): Promise<string[]> => {
    try {
        const db = await initDB();
        const data = await db.get(STORE_NAME, 'current');
        return data || [];
    } catch (e) {
        console.error('Failed to load known tags from DB', e);
        return [];
    }
};

// Helper: Given a list of new tags and the current known tags, returns a new merged array
export const mergeNewTags = (currentKnown: string[], newTags: string[]): string[] => {
    const cleanNew = newTags.map(t => t.trim().toLowerCase()).filter(Boolean);
    return Array.from(new Set([...currentKnown, ...cleanNew])).sort((a, b) => a.localeCompare(b));
};
