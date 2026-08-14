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

export interface DurabilityPrefs {
    /** Snapshot the card's SK folder into the project folder after a build. */
    skSnapshots: boolean;
    /** Keep a copy of the project source (project.json + Assets) on the SD card. */
    mirrorProjectsToSD: boolean;
}

const KEYS: Record<keyof DurabilityPrefs, string> = {
    skSnapshots: 'spotykach_sk_snapshots',
    mirrorProjectsToSD: 'spotykach_sd_project_mirror',
};

export const DURABILITY_DEFAULTS: DurabilityPrefs = {
    skSnapshots: false,
    mirrorProjectsToSD: false,
};

const readFlag = (key: keyof DurabilityPrefs): boolean => {
    try {
        const raw = localStorage.getItem(KEYS[key]);
        // Absent means never chosen, which means the default — not `false` by accident.
        return raw === null ? DURABILITY_DEFAULTS[key] : raw === 'true';
    } catch {
        return DURABILITY_DEFAULTS[key];
    }
};

export const getDurabilityPrefs = (): DurabilityPrefs => ({
    skSnapshots: readFlag('skSnapshots'),
    mirrorProjectsToSD: readFlag('mirrorProjectsToSD'),
});

export const setDurabilityPref = (key: keyof DurabilityPrefs, value: boolean): void => {
    try {
        localStorage.setItem(KEYS[key], String(value));
    } catch (e) {
        console.warn(`[Durability] Failed to persist ${key}`, e);
    }
};
