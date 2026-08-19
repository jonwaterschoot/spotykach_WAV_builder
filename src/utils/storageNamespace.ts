// Storage namespacing — locked decision 9, Appendix F.3.
//
// GitHub Pages publishes one origin per repo, so a preview build at
// `/spotykach_WAV_builder/next/` shares `jonwaterschoot.github.io` with the real
// app at `/spotykach_WAV_builder/`. Same origin means the same IndexedDB and the
// same localStorage — including `SpotykachDB`, which holds *live directory
// handles* pointing at the user's real work folder and SD card. A preview build
// could therefore write over real project state, on real disks.
//
// Every DB name and every localStorage key in the app goes through this module.
// The namespace is derived once, at module load:
//
//   1. `VITE_STORAGE_NS` if set at build time — explicit, wins over everything.
//   2. Otherwise the last path segment of `BASE_URL` when there is more than one,
//      so `/spotykach_WAV_builder/next/` → `next` without any extra configuration.
//   3. Otherwise empty.
//
// **An empty namespace leaves every name exactly as it was before v4**, which is
// the point: the production build must keep reading the storage existing users
// already have. Only the preview build moves.

const segmentNamespace = (): string => {
    const base = import.meta.env.BASE_URL || '/';
    const segments = base.split('/').filter(Boolean);
    // '/' → [] · '/spotykach_WAV_builder/' → ['spotykach_WAV_builder'] (the repo
    // root, not a namespace) · '/spotykach_WAV_builder/next/' → ['…','next'].
    return segments.length > 1 ? segments[segments.length - 1] : '';
};

const explicitNamespace = (): string => {
    const raw = import.meta.env.VITE_STORAGE_NS;
    return typeof raw === 'string' ? raw.trim() : '';
};

/** '' for the production build; e.g. 'next' for a preview deploy. */
export const STORAGE_NAMESPACE: string = explicitNamespace() || segmentNamespace();

/** Namespace an IndexedDB database name. */
export const dbName = (name: string): string =>
    STORAGE_NAMESPACE ? `${name}--${STORAGE_NAMESPACE}` : name;

/** Namespace a localStorage key. */
export const storageKey = (key: string): string =>
    STORAGE_NAMESPACE ? `${STORAGE_NAMESPACE}:${key}` : key;

// A namespaced façade over localStorage. Call sites keep their literal key —
// `appStorage.getItem('spotykach_state')` reads the same as it always did — and
// the prefix is applied in exactly one place. Also swallows the private-mode /
// quota-exceeded throws that the raw API can produce.
export const appStorage = {
    getItem(key: string): string | null {
        try {
            return localStorage.getItem(storageKey(key));
        } catch {
            return null;
        }
    },
    setItem(key: string, value: string): void {
        try {
            localStorage.setItem(storageKey(key), value);
        } catch (e) {
            console.warn(`[Storage] Failed to write ${key}`, e);
        }
    },
    removeItem(key: string): void {
        try {
            localStorage.removeItem(storageKey(key));
        } catch (e) {
            console.warn(`[Storage] Failed to remove ${key}`, e);
        }
    },
};
