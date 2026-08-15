import { TAPE_COLORS } from '../types';
import type { AppState, AudioVersion, FileRecord, TapeColor } from '../types';
import { getInitialState } from './initialState';

/**
 * A sample that exists only in memory — no project, no file record, no IDB slot.
 *
 * This is the payload shape shared by the tiers that have no project: Browse's
 * selection pool (Phase 2) and, from Phase 3, `hydratePreset`. Both hand the
 * resulting `AppState` straight to `exportFilesOnly` / `exportSDStructure`.
 */
export interface DetachedSample {
    /** Reused as the FileRecord id when supplied, so callers can keep stable keys. */
    id?: string;
    /** Display name. Becomes the uppercase slot name on the grid. */
    name: string;
    /**
     * The file's own name at its source, extension and all. Kept on `originalName`
     * so a loose export can hand back what the user recognises rather than a
     * slot-shaped rename. Falls back to `name`.
     */
    fileName?: string;
    blob: Blob;
    duration?: number;
    origin?: string;
    license?: string;
    sourceSamplePath?: string;
    /**
     * The file before any edit, when the caller kept it. Browse's pool has held both
     * versions since R2-4, and dropping the original on the way into a project meant
     * the edit arrived there labelled "Original" with no way back — the same lie the
     * editor's history panel used to tell.
     */
    originalBlob?: Blob;
    originalDuration?: number;
}

const SLOTS_PER_TAPE = 6;

/** 6 tapes × 6 slots. Samples past this land in the pool, unassigned. */
export const GRID_CAPACITY = TAPE_COLORS.length * SLOTS_PER_TAPE;

/** Which tape a pool position lands on, or `null` once the grid is full. */
export const tapeForIndex = (index: number): TapeColor | null => {
    if (index < 0 || index >= GRID_CAPACITY) return null;
    return TAPE_COLORS[Math.floor(index / SLOTS_PER_TAPE)];
};

/** `0 → "B1"`, `6 → "G1"`, … `null` once the grid is full. */
export const slotLabelForIndex = (index: number): string | null => {
    const color = tapeForIndex(index);
    if (!color) return null;
    return `${color.charAt(0).toUpperCase()}${(index % SLOTS_PER_TAPE) + 1}`;
};

const newId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        try {
            return crypto.randomUUID();
        } catch {
            // Fall through to the non-crypto id below.
        }
    }
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

/** Matches App.tsx's import naming: safe characters, no extension, uppercase. */
const toSlotName = (name: string) =>
    name
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-zA-Z0-9.\-_]/g, '')
        .replace(/\.[^/.]+$/, '')
        .toUpperCase();

/**
 * Builds a throwaway `AppState` from an ordered list of samples, autospread across
 * the 6×6 grid in list order (Blue 1-6, Green 1-6, …).
 *
 * Deliberately pure and synchronous: it never touches IndexedDB, never becomes the
 * live editor state, and holds no handles. Locked decision 5 — tiers 1-2 must not
 * write the global state slot — holds by construction as long as the caller only
 * feeds the result to an exporter.
 */
export const buildDetachedState = (samples: DetachedSample[]): AppState => {
    const state = getInitialState();

    samples.forEach((sample, index) => {
        const fileId = sample.id || newId();
        const versionId = newId();

        const version: AudioVersion = {
            id: versionId,
            timestamp: Date.now(),
            description: sample.originalBlob && sample.originalBlob !== sample.blob ? 'Edited' : 'Original',
            blob: sample.blob,
            duration: sample.duration ?? 0,
        };

        // `[original, current]` when the caller kept both — exactly the two-version
        // rule the project would have collapsed to anyway, so this adds history
        // without adding depth.
        const versions: AudioVersion[] = sample.originalBlob && sample.originalBlob !== sample.blob
            ? [{
                id: newId(),
                timestamp: Date.now(),
                description: 'Original',
                blob: sample.originalBlob,
                duration: sample.originalDuration ?? 0,
            }, version]
            : [version];

        const record: FileRecord = {
            id: fileId,
            name: toSlotName(sample.name) || `SAMPLE-${index + 1}`,
            originalName: sample.fileName || sample.name,
            versions,
            currentVersionId: versionId,
            isParked: index >= GRID_CAPACITY,
            origin: sample.origin,
            license: sample.license,
            sourceSamplePath: sample.sourceSamplePath,
        };

        state.files[fileId] = record;

        if (index < GRID_CAPACITY) {
            const tape = state.tapes[TAPE_COLORS[Math.floor(index / SLOTS_PER_TAPE)]];
            tape.slots[index % SLOTS_PER_TAPE].fileId = fileId;
        }
    });

    return state;
};
