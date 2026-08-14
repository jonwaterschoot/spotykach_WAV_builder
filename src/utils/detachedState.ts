import { TAPE_COLORS } from '../types';
import type { AppState, AudioVersion, FileRecord } from '../types';
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
    name: string;
    blob: Blob;
    duration?: number;
    origin?: string;
    license?: string;
    sourceSamplePath?: string;
}

const SLOTS_PER_TAPE = 6;

/** 6 tapes × 6 slots. Samples past this land in the pool, unassigned. */
export const GRID_CAPACITY = TAPE_COLORS.length * SLOTS_PER_TAPE;

/** `0 → "B1"`, `6 → "G1"`, … `null` once the grid is full. */
export const slotLabelForIndex = (index: number): string | null => {
    if (index < 0 || index >= GRID_CAPACITY) return null;
    const color = TAPE_COLORS[Math.floor(index / SLOTS_PER_TAPE)];
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
            description: 'Original',
            blob: sample.blob,
            duration: sample.duration ?? 0,
        };

        const record: FileRecord = {
            id: fileId,
            name: toSlotName(sample.name) || `SAMPLE-${index + 1}`,
            originalName: sample.name,
            versions: [version],
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
