import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { AppState } from '../types';
import { getInitialState } from '../utils/initialState';
import { getDirectoryHandle } from '../utils/storageUtils';
import { logger } from '../utils/logger';

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
  const [currentProjectName, setCurrentProjectName] = useState<string | undefined>(
    () => localStorage.getItem('spotykach_current_project') || undefined
  );
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isEditorDirty, setIsEditorDirty] = useState(false);

  const projectRootHandleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const isFirstRender = useRef(true);
  const isSystemUpdate = useRef(false);

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
      localStorage.setItem('spotykach_current_project', currentProjectName);
    } else {
      localStorage.removeItem('spotykach_current_project');
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
          return;
        }
        const savedLS = localStorage.getItem('spotykach_state');
        if (!savedLS) return;
        try {
          const parsed = JSON.parse(savedLS);
          if (parsed.files && parsed.tapes) applySystemUpdate(parsed);
        } catch (e) {
          console.error(e);
        }
      });
    });

    return () => { cancelled = true; };
  }, [applySystemUpdate]);

  // Handles persist across sessions but their permission does not, so they are only
  // offered here — `handleRestoreSession` in the shell does the asking.
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
