import { useCallback, useEffect, useState } from 'react';

/**
 * The app's top-level surfaces. Only `studio` mounts the project workspace;
 * every other mode runs without a project and without filesystem permission.
 * See V4_PERVAK.md, Appendix C.
 */
export type AppMode = 'hub' | 'browse' | 'presets' | 'config' | 'editor' | 'studio';

const MODES: readonly AppMode[] = ['hub', 'browse', 'presets', 'config', 'editor', 'studio'];

const isAppMode = (value: string): value is AppMode => (MODES as readonly string[]).includes(value);

/** `#/browse?foo` → `browse`. Anything unrecognised (including empty) → `hub`. */
export const modeFromHash = (hash: string): AppMode => {
  const segment = hash.replace(/^#\/?/, '').split(/[/?]/)[0].toLowerCase();
  if (!segment) return 'hub';
  return isAppMode(segment) ? segment : 'hub';
};

export const hashForMode = (mode: AppMode): string => (mode === 'hub' ? '#/' : `#/${mode}`);

/**
 * Mode state kept in sync with `window.location.hash`, so modes are linkable and
 * browser back/forward moves between them. No router dependency: hash routing
 * needs no server rewrite, which matters on GitHub Pages.
 */
export function useAppMode() {
  const [mode, setModeState] = useState<AppMode>(() => modeFromHash(window.location.hash));

  useEffect(() => {
    const onHashChange = () => setModeState(modeFromHash(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // A hash we don't recognise renders the hub, so rewrite the URL to match what's
  // on screen. replaceState keeps it out of the history stack.
  useEffect(() => {
    const raw = window.location.hash;
    if (raw && raw !== '#/' && modeFromHash(raw) === 'hub') {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/`);
    }
  }, []);

  const setMode = useCallback((next: AppMode) => {
    const nextHash = hashForMode(next);
    const currentHash = window.location.hash;
    // Assigning an identical hash fires no hashchange event, so settle state here.
    if (currentHash === nextHash || (next === 'hub' && currentHash === '')) {
      setModeState(next);
      return;
    }
    window.location.hash = nextHash;
  }, []);

  return { mode, setMode };
}
