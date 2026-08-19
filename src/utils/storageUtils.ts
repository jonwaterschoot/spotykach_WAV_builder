import { dbName } from './storageNamespace';

// Namespaced per build — a preview deploy must never reach the real work folder
// and SD card handles stored here. Locked decision 9, Appendix F.3.
const DB_NAME = dbName('SpotykachDB');
const STORE_NAME = 'handles';
const DB_VERSION = 1;

// The SD card handle has been stored under the key 'backup' since v2. v4 renamed
// the concept — the card is a build target, not a backup — but the stored key has
// to stay as-is or every existing user silently loses their saved card handle.
// Callers speak 'sd'; only this mapping knows the legacy name.
export type HandleKey = 'work' | 'sd';
const storageKey = (key: HandleKey): string => (key === 'sd' ? 'backup' : key);

export const initDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
    });
};

export const saveDirectoryHandle = async (key: HandleKey, handle: FileSystemDirectoryHandle): Promise<void> => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(handle, storageKey(key));

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
};

export const getDirectoryHandle = async (key: HandleKey): Promise<FileSystemDirectoryHandle | null> => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(storageKey(key));

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const result = request.result;
            resolve(result instanceof FileSystemDirectoryHandle ? result : null);
        };
    });
};

export const clearDirectoryHandle = async (key: HandleKey): Promise<void> => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(storageKey(key));

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
};
