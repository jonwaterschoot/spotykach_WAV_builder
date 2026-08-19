import type { AppState, FileRecord } from '../types';
import { getDurabilityPref } from './durabilityPrefs';

/**
 * The two-version rule — V4_PERVAK.md, Appendix E.2.
 *
 * Persisted history is exactly the original (`versions[0]`) and the current version
 * (`currentVersionId`). Everything in between is dropped when the project is saved.
 *
 * Why here and not on every editor commit: history depth multiplies disk × memory ×
 * IDB at once, and the editor is allowed deeper undo *in session*. Collapsing at the
 * save boundary keeps that in-session depth while making sure nothing between the
 * two survives to disk, to the IDB autosave, or to the next time the project opens.
 *
 * Everything below returns the argument unchanged when there is nothing to drop, so
 * a save on an already-collapsed project allocates nothing and keeps React's
 * identity checks quiet.
 */

/** Versions dropped from one record by a collapse. 0 when it is already collapsed. */
export const droppedVersionCount = (file: FileRecord): number =>
    Math.max(0, (file.versions?.length ?? 0) - collapsedVersionCount(file));

const collapsedVersionCount = (file: FileRecord): number => {
    const versions = file.versions ?? [];
    if (versions.length === 0) return 0;
    const current = resolveCurrent(file);
    return current && current.id !== versions[0].id ? 2 : 1;
};

/**
 * The version `currentVersionId` names. Falls back to the newest record when the id
 * dangles — a dangling id is a bug elsewhere, but losing the user's latest audio to
 * it would be the worse outcome.
 */
const resolveCurrent = (file: FileRecord) => {
    const versions = file.versions ?? [];
    if (versions.length === 0) return undefined;
    return versions.find(v => v.id === file.currentVersionId) ?? versions[versions.length - 1];
};

/** `[original, current]`, or just `[original]` when they are the same record. */
export const collapseFileVersions = (file: FileRecord): FileRecord => {
    const versions = file.versions ?? [];
    if (versions.length <= 1) return file;

    const original = versions[0];
    const current = resolveCurrent(file)!;

    const kept = current.id === original.id ? [original] : [original, current];
    if (kept.length === versions.length) return file;

    return {
        ...file,
        versions: kept,
        // Repairs a dangling id in passing, so the record we persist is self-consistent.
        currentVersionId: current.id,
    };
};

/**
 * The whole project collapsed. Pure: no IDB, no handles, no blob work — the dropped
 * versions' blobs simply stop being referenced, and their `Assets/<id>.wav` files on
 * disk become orphans for Cleanup to sweep.
 */
export const collapseVersionHistory = (state: AppState): AppState => {
    let changed = false;
    const files: Record<string, FileRecord> = {};

    for (const [id, file] of Object.entries(state.files)) {
        const collapsed = collapseFileVersions(file);
        if (collapsed !== file) changed = true;
        files[id] = collapsed;
    }

    return changed ? { ...state, files } : state;
};

/**
 * What the save path calls, and the only thing in this file that reads anything: the
 * two-version rule is a preference now (`collapseHistoryOnSave`, default on), so a
 * save made with it off writes the whole history it was handed.
 *
 * Read at the moment it matters rather than from a snapshot taken at mount, for the
 * same reason the autosave loop does it that way — flipping the switch in Settings has
 * to change the next save, not the next reload.
 *
 * The pure `collapseVersionHistory` above stays available for callers that mean the
 * rule itself rather than the save path; `LooseFileEditor` handing one blob to the
 * Browse pool is one, since the pool's shape only ever holds original and current.
 */
export const collapseVersionHistoryOnSave = (state: AppState): AppState =>
    getDurabilityPref('collapseHistoryOnSave') ? collapseVersionHistory(state) : state;

/** Total versions a collapse would drop across the project. */
export const totalDroppedVersions = (state: AppState): number =>
    Object.values(state.files).reduce((acc, file) => acc + droppedVersionCount(file), 0);
