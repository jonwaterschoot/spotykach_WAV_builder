// Storage namespacing — the single place every DB name and localStorage key in
// the app passes through.
//
// **On the live site the namespace is always empty**, so every name is exactly
// what it was before v4 — which is the point: the published build must keep
// reading the storage existing users already have. Nothing here changes any key
// unless someone deliberately publishes a second build.
//
// The mechanism exists because GitHub Pages serves one origin per repo. A second
// build at a subpath — `/spotykach_WAV_builder/preview/`, say — would share
// `jonwaterschoot.github.io` with the real app, and therefore share IndexedDB and
// localStorage. That includes `SpotykachDB`, which holds *live directory handles*
// pointing at the user's real work folder and SD card, so a second build could
// write over real project state on a real disk. There is no such build today (the
// v4 `/next/` preview deploy was dropped), but this is the seatbelt if one ever
// returns.
//
// The namespace is derived once, at module load:
//
//   1. `VITE_STORAGE_NS` if set at build time — explicit, wins over everything.
//   2. Otherwise the last path segment of `BASE_URL` when there is more than one,
//      so a subpath build namespaces itself with no extra configuration.
//   3. Otherwise empty — the live site, and dev.

const segmentNamespace = (): string => {
    const base = import.meta.env.BASE_URL || '/';
    const segments = base.split('/').filter(Boolean);
    // '/' → [] · '/spotykach_WAV_builder/' → ['spotykach_WAV_builder'] (the repo
    // root, not a namespace) · '/spotykach_WAV_builder/preview/' → ['…','preview'].
    return segments.length > 1 ? segments[segments.length - 1] : '';
};

const explicitNamespace = (): string => {
    const raw = import.meta.env.VITE_STORAGE_NS;
    return typeof raw === 'string' ? raw.trim() : '';
};

/** '' on the live site; a subpath segment only if a second build is ever published. */
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
