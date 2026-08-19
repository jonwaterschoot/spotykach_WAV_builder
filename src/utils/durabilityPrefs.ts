// Durability preferences — the opt-ins that used to be unconditional behaviour.
//
// Locked decision 6: the SD card is a build target, not a backup. Before v4 a
// single hardware build produced three copies of the same audio:
//
//   1. SK/                                    — the build itself. Always on.
//   2. SD/WAV_Builder/Projects/<name>/        — the project source mirrored onto
//                                               the card. Now `mirrorProjectsToSD`.
//   3. Work/Projects/<name>/_sk_backups/<ts>/ — a snapshot of the card's SK
//                                               folder, five deep. Now `skSnapshots`.
//
// #2 and #3 both default OFF. Durability is handled where the risk actually is —
// see `safeWriteBlob`, which writes atomically — rather than by copying 36 WAVs
// twice more on every build.

import { appStorage } from './storageNamespace';

export interface DurabilityPrefs {
    /** Snapshot the card's SK folder into the project folder after a build. */
    skSnapshots: boolean;
    /** Keep a copy of the project source (project.json + Assets) on the SD card. */
    mirrorProjectsToSD: boolean;
    /**
     * Keep a crash-recovery snapshot of the open project in the browser's own
     * storage. Default ON — it is the only thing standing between a closed tab and
     * lost work, and unlike the two above it copies nothing onto anyone's disk.
     * Explicit save is still what writes the project folder.
     */
    autoSave: boolean;
    /**
     * Collapse each file's history to `[original, current]` when the project is
     * saved — the two-version rule, Appendix E.2. Default ON, which is what the app
     * did unconditionally before this was a preference.
     *
     * Turning it off means a save writes every step the editor committed, and the
     * history that used to be swept on the way to disk becomes Cleanup's job again.
     */
    collapseHistoryOnSave: boolean;
}

const KEYS: Record<keyof DurabilityPrefs, string> = {
    skSnapshots: 'spotykach_sk_snapshots',
    mirrorProjectsToSD: 'spotykach_sd_project_mirror',
    autoSave: 'spotykach_autosave',
    collapseHistoryOnSave: 'spotykach_collapse_history_on_save',
};

export const DURABILITY_DEFAULTS: DurabilityPrefs = {
    skSnapshots: false,
    mirrorProjectsToSD: false,
    autoSave: true,
    collapseHistoryOnSave: true,
};

const readFlag = (key: keyof DurabilityPrefs): boolean => {
    const raw = appStorage.getItem(KEYS[key]);
    // Absent means never chosen, which means the default — not `false` by accident.
    return raw === null ? DURABILITY_DEFAULTS[key] : raw === 'true';
};

export const getDurabilityPrefs = (): DurabilityPrefs => ({
    skSnapshots: readFlag('skSnapshots'),
    mirrorProjectsToSD: readFlag('mirrorProjectsToSD'),
    autoSave: readFlag('autoSave'),
    collapseHistoryOnSave: readFlag('collapseHistoryOnSave'),
});

/**
 * Read one preference at the moment it matters, rather than through a snapshot
 * taken at mount. The autosave loop needs this: flipping the switch in Settings
 * has to stop the next write, not the next reload.
 */
export const getDurabilityPref = (key: keyof DurabilityPrefs): boolean => readFlag(key);

export const setDurabilityPref = (key: keyof DurabilityPrefs, value: boolean): void => {
    appStorage.setItem(KEYS[key], String(value));
};
