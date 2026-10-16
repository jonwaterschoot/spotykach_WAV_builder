import { useCallback, useState } from 'react';

/**
 * A value with undo and redo, for the sequencer. `edit` is the user's change
 * and goes in the history; changes within `mergeMs` of each other (a drag, a
 * scrub) merge into one step. `set` changes it without a step (a clock's tempo,
 * letting go of a removed slice), `reset` starts a new history (a project
 * opened, a fresh start). In memory only.
 */

const LIMIT = 100;

interface History<T> {
    past: T[];
    present: T;
    future: T[];
    /** When the last edit went in, to merge the next one into it. 0: don't. */
    lastEdit: number;
}

export function useUndoable<T>(init: () => T, mergeMs = 400) {
    const [h, setH] = useState<History<T>>(() => ({ past: [], present: init(), future: [], lastEdit: 0 }));

    const edit = useCallback((update: (value: T) => T) => setH(h => {
        const next = update(h.present);
        if (next === h.present) return h;
        const now = performance.now();
        const merge = h.lastEdit > 0 && now - h.lastEdit < mergeMs;
        return { past: merge ? h.past : [...h.past, h.present].slice(-LIMIT), present: next, future: [], lastEdit: now };
    }), [mergeMs]);

    const set = useCallback((update: T | ((value: T) => T)) => setH(h => {
        const next = typeof update === 'function' ? (update as (value: T) => T)(h.present) : update;
        return next === h.present ? h : { ...h, present: next, lastEdit: 0 };
    }), []);

    const reset = useCallback((value: T) => setH({ past: [], present: value, future: [], lastEdit: 0 }), []);

    const undo = useCallback(() => setH(h => (h.past.length
        ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future], lastEdit: 0 }
        : h)), []);

    const redo = useCallback(() => setH(h => (h.future.length
        ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1), lastEdit: 0 }
        : h)), []);

    return { value: h.present, edit, set, reset, undo, redo, canUndo: h.past.length > 0, canRedo: h.future.length > 0 };
}
