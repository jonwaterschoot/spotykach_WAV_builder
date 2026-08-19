import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { AppState } from '../types';
import { getInitialState } from '../utils/initialState';
import { getDirectoryHandle } from '../utils/storageUtils';
import { logger } from '../utils/logger';
import { appStorage } from '../utils/storageNamespace';
import { getDurabilityPref } from '../utils/durabilityPrefs';

/** Long enough that dragging a slider doesn't write 40 snapshots, short enough
 *  that "the tab crashed" costs seconds of work rather than minutes. */
const AUTOSAVE_DEBOUNCE_MS = 3000;

/** The two handles the session can hold, as they come back from `SpotykachDB`. */
export interface RestorableHandles {
  work: FileSystemDirectoryHandle;
  backup: FileSystemDirectoryHandle | null;
}

export interface ProjectSession {
  // ── The project itself ────────────────────────────────────────────────────
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;

  // ── Handles ───────────────────────────────────────────────────────────────
  workHandle: FileSystemDirectoryHandle | null;
  setWorkHandle: Dispatch<SetStateAction<FileSystemDirectoryHandle | null>>;
  sdHandle: FileSystemDirectoryHandle | null;
  setSdHandle: Dispatch<SetStateAction<FileSystemDirectoryHandle | null>>;
  /**
   * `workHandle` as a ref. Async work started before a re-render would otherwise
   * close over a stale handle; the ref always reads current.
   */
  projectRootHandleRef: MutableRefObject<FileSystemDirectoryHandle | null>;
  /**
   * Handles found in IndexedDB on mount, not yet re-permissioned. Read-only from
   * outside: the session finds them, the shell asks the user for permission back.
   */
  restorableHandles: RestorableHandles | null;
  /**
   * True once the lookup above has finished, whether or not it found anything. The
   * shell needs "nothing stored" and "still looking" to be different answers before
   * it decides between the setup wizard and a silent restore.
   */
  isRestoreResolved: boolean;

  // ── Identity ──────────────────────────────────────────────────────────────
  currentProjectName: string | undefined;
  setCurrentProjectName: Dispatch<SetStateAction<string | undefined>>;

  // ── Dirty tracking ────────────────────────────────────────────────────────
  hasUnsavedChanges: boolean;
  setHasUnsavedChanges: Dispatch<SetStateAction<boolean>>;
  isEditorDirty: boolean;
  setIsEditorDirty: Dispatch<SetStateAction<boolean>>;
  /**
   * Exempt the next state change from the dirty flag.
   *
   * Loading a project, hydrating from IndexedDB and background hashing all write
   * `state` without the user having changed anything, and none of them should light
   * up the Save button. Call immediately before the `setState` in question.
   */
  markSystemUpdate: () => void;
  /** `markSystemUpdate` and `setState` in one, which is how it is used most often. */
  applySystemUpdate: (next: SetStateAction<AppState>) => void;
}

/**
 * The project session — V4_PERVAK.md, Appendix C.3.
 *
 * Everything a loaded project consists of: its state, the two directory handles,
 * its name and whether it differs from disk. Only Studio calls this hook. The
 * project-free modes never import it, which is what makes locked decision 5 —
 * "tiers 1-2 must not write the global IDB slot" — structural rather than a rule
 * someone has to remember.
 *
 * What deliberately stayed in App.tsx: the ~60 pieces of view state (which modal is
 * open, which tape is showing, where the notes window was dragged to) and the
 * handlers that operate on them. Those are the studio shell's business, not the
 * session's, and moving them here would just relabel the same file.
 */
export function useProjectSession(): ProjectSession {
  const [state, setState] = useState<AppState>(getInitialState);
  const [workHandle, setWorkHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [sdHandle, setSdHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [restorableHandles, setRestorableHandles] = useState<RestorableHandles | null>(null);
  /** True once the mount-time handle lookup has finished, found or not. */
  const [isRestoreResolved, setIsRestoreResolved] = useState(false);
  const [currentProjectName, setCurrentProjectName] = useState<string | undefined>(
    () => appStorage.getItem('spotykach_current_project') || undefined
  );
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isEditorDirty, setIsEditorDirty] = useState(false);
  /** True once the mount-time IDB load has resolved — see the auto-save effect. */
  const [isHydrated, setIsHydrated] = useState(false);

  const projectRootHandleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const isFirstRender = useRef(true);
  const isSystemUpdate = useRef(false);
  const isAutoSaving = useRef(false);
  const pendingSnapshot = useRef<AppState | null>(null);

  /** One auto-save, followed by whatever arrived while it was running. */
  const runAutoSave = useCallback(async (snapshot: AppState) => {
    isAutoSaving.current = true;
    try {
      const { saveStateToDB } = await import('../utils/persistence');
      await saveStateToDB(snapshot);
    } finally {
      isAutoSaving.current = false;
    }
    const queued = pendingSnapshot.current;
    if (queued) {
      pendingSnapshot.current = null;
      // Still wanted? The switch may have been flipped mid-write.
      if (getDurabilityPref('autoSave')) void runAutoSave(queued);
    }
  }, []);

  const markSystemUpdate = useCallback(() => {
    isSystemUpdate.current = true;
  }, []);

  const applySystemUpdate = useCallback((next: SetStateAction<AppState>) => {
    isSystemUpdate.current = true;
    setState(next);
  }, []);

  // Which project is current survives a reload; the project's *contents* do not,
  // and are read back off disk.
  useEffect(() => {
    if (currentProjectName) {
      appStorage.setItem('spotykach_current_project', currentProjectName);
    } else {
      appStorage.removeItem('spotykach_current_project');
    }
  }, [currentProjectName]);

  useEffect(() => {
    projectRootHandleRef.current = workHandle;
  }, [workHandle]);

  useEffect(() => {
    logger.setWorkHandle(workHandle);
  }, [workHandle]);

  /**
   * Dirty tracking.
   *
   * Declared before the load effect below on purpose: on mount this one runs first
   * and burns `isFirstRender`, so the hydrating `setState` that follows is caught by
   * the `isSystemUpdate` branch rather than by the first-render one.
   */
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (isSystemUpdate.current) {
      isSystemUpdate.current = false;
      return;
    }
    setHasUnsavedChanges(true);
  }, [state]);

  // Whatever the last session left in IndexedDB, with the pre-IDB localStorage copy
  // as a fallback for sessions old enough to predate it.
  useEffect(() => {
    let cancelled = false;

    import('../utils/persistence').then(({ loadStateFromDB }) => {
      loadStateFromDB().then(saved => {
        if (cancelled) return;
        if (saved) {
          applySystemUpdate(saved);
          setIsHydrated(true);
          return;
        }
        const savedLS = appStorage.getItem('spotykach_state');
        if (!savedLS) {
          setIsHydrated(true);
          return;
        }
        try {
          const parsed = JSON.parse(savedLS);
          if (parsed.files && parsed.tapes) applySystemUpdate(parsed);
        } catch (e) {
          console.error(e);
        }
        setIsHydrated(true);
      }).catch(() => { if (!cancelled) setIsHydrated(true); });
    });

    return () => { cancelled = true; };
  }, [applySystemUpdate]);

  /**
   * Auto-save — Phase 7, step 2.
   *
   * The `app-state` slot was read on mount and never written by anything, so until
   * now closing the tab lost whatever had not been saved to disk. This writes it
   * back, debounced, and deliberately writes *only* the IDB slot: a real save to the
   * project folder runs the two-version collapse and rewrites assets, which is not
   * something to do on a timer behind the user's back. Explicit save still owns the
   * disk; this owns "the tab crashed".
   *
   * Gated on `isHydrated` so the initial empty state can never overwrite the
   * snapshot it is about to be replaced by, and the preference is read per run so
   * turning it off in Settings stops the very next write.
   *
   * **`AppState` carries the audio**, so a snapshot is not small — up to 36 files
   * × 2 versions once the two-version rule has run. The debounce alone would still
   * let a slow write be overtaken by the next one, so writes are serialised: while
   * one is in flight the newest state waits in `pendingSnapshot` and goes out when
   * the current write lands. Under continuous editing that self-limits to one write
   * per write-duration instead of building a queue.
   */
  useEffect(() => {
    if (!isHydrated) return;
    if (!getDurabilityPref('autoSave')) return;

    const timer = setTimeout(() => {
      if (isAutoSaving.current) {
        pendingSnapshot.current = state;
        return;
      }
      void runAutoSave(state);
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [state, isHydrated, runAutoSave]);

  // Handles persist across sessions but their permission does not, so they are only
  // offered here — `handleRestoreSession` in the shell does the asking.
  //
  // `isRestoreResolved` flips either way, found or not. Without it the shell cannot
  // tell "there is nothing stored" from "the lookup hasn't finished", and it needs
  // that difference to decide whether to show the setup wizard or wait for a restore.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const savedWork = await getDirectoryHandle('work');
        const savedBackup = await getDirectoryHandle('sd');
        if (!cancelled && savedWork) {
          setRestorableHandles({ work: savedWork, backup: savedBackup });
        }
      } catch (e) {
        console.error('Error loading handles', e);
      } finally {
        if (!cancelled) setIsRestoreResolved(true);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  return {
    state,
    setState,
    workHandle,
    setWorkHandle,
    sdHandle,
    setSdHandle,
    projectRootHandleRef,
    restorableHandles,
    isRestoreResolved,
    currentProjectName,
    setCurrentProjectName,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    isEditorDirty,
    setIsEditorDirty,
    markSystemUpdate,
    applySystemUpdate,
  };
}
