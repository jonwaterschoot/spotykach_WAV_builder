export type TapeColor = 'Blue' | 'Green' | 'Pink' | 'Red' | 'Turquoise' | 'Yellow';

export const TAPE_COLORS: TapeColor[] = ['Blue', 'Green', 'Pink', 'Red', 'Turquoise', 'Yellow'];

export const COLOR_MAP: Record<TapeColor, string> = {
    Blue: 'bg-synthux-blue',
    Green: 'bg-synthux-green',
    Pink: 'bg-synthux-pink',
    Red: 'bg-synthux-red', // Brand Red
    Turquoise: 'bg-synthux-turquoise',
    Yellow: 'bg-synthux-yellow',
};

export interface AudioVersion {
    id: string; // uuid
    timestamp: number;
    description: string; // "Original", "Trimmed", "Faded", etc.
    blob: Blob | null; // Changed to allow null if file is missing/unreadable
    duration: number;
    processing?: ('normalized' | 'trimmed' | 'looped' | 'eq' | 'limited' | 'cut' | 'sliced')[];
    blobRef?: string; // Optional path reference used during load/save
    hash?: string; // SHA-256 content hash for duplicate detection
}

export interface FileRecord {
    id: string; // uuid
    name: string;
    originalName: string;
    versions: AudioVersion[];
    currentVersionId: string;
    isParked: boolean; // if false, implies it *might* be assigned, or just pending
    origin?: string; // e.g., "Sample Pack Name"
    license?: string; // e.g., "CC-BY 4.0"
    tags?: string[]; // User tags for filtering/organization
    metadata?: WavMetadata;
    sourceFileId?: string; // Source project file ID
    sourceVersionId?: string; // Source project version ID
    /**
     * Relative path within the R2 bucket, e.g. "/Hainbach/Roaring-Drone.flac".
     * Set by hydrateDescriptor when loading a preset or settings-only ZIP.
     * Used by buildDescriptorFromState to omit the blob on settings-only re-export.
     */
    sourceSamplePath?: string;
    /**
     * Added to the user library from outside Studio (the Sample Mangler writes the
     * IDB store, not the folder). Studio's folder sync writes it to `User_Library/`
     * instead of marking it missing, and clears the flag once it is on disk.
     */
    pendingDiskWrite?: boolean;
}

export interface WavMetadata {
    id?: string; // UUID from file header (ICMT)
    hash?: string; // Content hash for change detection
    tempo?: number; // BPM
    processing?: string[]; // Flags like ["NORMALIZED", "FADED"]
    slicePoints?: number[]; // Time in seconds
    name?: string; // Original file name (INAM). Written at export, read back from any WAV
    frames?: number; // Frames in `data`. Read only; the encoders take it from the audio
}

/** What WAV Builder last wrote to one card slot. */
export interface CardSnapshotSlot {
    fileId: string;
    /**
     * SHA-256 of the whole source version (`ICMT.h` on slot files written before 4.2).
     * Ties the slot to the version when `audioHashOf` can't read it (FLAC, 44.1 kHz).
     */
    hash?: string;
    /** SHA-256 of the version's audio alone, up to the device's limit (`audioHashOf`). */
    audioHash?: string;
    frames?: number;
    /**
     * The slot file's fingerprint as written: `INAM`, file size and cue count (with
     * `frames`). What the device's slot list reports, so a slot can be recognised as
     * the file the project wrote without reading it. Absent on snapshots from before 4.2.
     */
    name?: string;
    size?: number;
    cues?: number;
    writtenAt: string; // ISO date
    via: 'reader' | 'usb';
}

/**
 * The card as WAV Builder last left it, keyed by slot ("Red1"). USB can't reach
 * `SK/project.json`, so the project keeps its own record of the card. Updated on
 * every export; compared with live header reads to spot changes made elsewhere.
 */
export interface CardSnapshot {
    updatedAt: string; // ISO date
    slots: Record<string, CardSnapshotSlot>;
    /** Card size from the last USB write (HELLO). A different size is a different card. */
    totalKiB?: number;
}

export interface UserLibraryMetadata {
    artist?: string;
    license?: string;
}

export interface UserLibrary {
    files: Record<string, FileRecord>;
    metadata: UserLibraryMetadata;
}

// Tape Slots now just reference the FileID
export interface Slot {
    id: number; // 1-6
    fileId: string | null;
}

export interface Tape {
    color: TapeColor;
    slots: Slot[];
    notes?: string;
}

/** One raw `config.txt` key/value pair this build has no field for. */
export interface UnknownConfigSetting {
    key: string;
    value: string;
}

/**
 * `cue_sm_*`, as the firmware's `Config::CueSizeMode` numbers it. Only matters for a
 * sample with more than one cue point.
 * - 0 ignore: cue points play no part; the deck slices as it would without them.
 * - 1 snap: start snaps to a cue point, size snaps to cue points too (ALT frees it).
 * - 2 free: start snaps to a cue point, size is free (ALT snaps it).
 */
export type CueSizeMode = 0 | 1 | 2;

export interface ProjectConfig {
    mid_ch_a: number; // 1-16
    mid_ch_b: number; // 1-16
    mid_ps_a: boolean; // Start/stop deck A from MIDI
    mid_ps_b: boolean; // Start/stop deck B from MIDI
    pre_load: boolean; // Enable/disable pre-loading
    slc_mn_a: boolean; // Disable polyphony in Slice mode, deck A
    slc_mn_b: boolean; // Disable polyphony in Slice mode, deck B
    /**
     * How a sample's own cue points steer start and size, per deck. Beta, so
     * opt-in: absent means the line is left out of config.txt and the device runs
     * its own default (ignore). Present, even as 0, means it is written.
     */
    cue_sm_a?: CueSizeMode;
    cue_sm_b?: CueSizeMode;
    grt_mx_a: number; // Grit mix at power-on, 0-10 (tenths), deck A. Firmware 1.4.0+
    grt_mx_b: number; // Same, deck B
    /**
     * Pairs read from a `config.txt` that this build doesn't recognise — newer
     * firmware settings, most likely. Carried through untouched and written back
     * after the known keys, so a round-trip through the app can't silently strip
     * settings it was never taught about. Absent when there were none.
     */
    unknown?: UnknownConfigSetting[];
}

/**
 * The device's own defaults, per the manual's config.txt table.
 *
 * The single definition: everywhere that used to spell these out — the initial
 * state, two backward-compatibility fills in `exportUtils`, the parser's starting
 * point, Config mode — spreads this instead, so adding the next firmware setting
 * is one line here rather than a hunt through six files.
 */
export const DEFAULT_PROJECT_CONFIG: ProjectConfig = {
    mid_ch_a: 1,
    mid_ch_b: 2,
    mid_ps_a: false,
    mid_ps_b: false,
    pre_load: true,
    slc_mn_a: false,
    slc_mn_b: false,
    grt_mx_a: 3,
    grt_mx_b: 3,
};

// Normalized State
export interface AppState {
    files: Record<string, FileRecord>;
    tapes: Record<TapeColor, Tape>;
    projectNotes?: string;
    metadata?: Record<string, any>;
    projectConfig?: ProjectConfig;
    userLibrary?: UserLibrary;
    cardSnapshot?: CardSnapshot;
    loadIssues?: {
        missingAssets?: Array<{
            fileId: string;
            fileName: string;
            versionId: string;
            blobRef: string;
            reason: string;
        }>;
    };
}

export interface ProjectSummary {
    name: string;
    path: string; // e.g. "Projects/MySong"
    hasMeta: boolean; // found project.json
    fileCount: number;
    files?: FileRecord[]; // Changed from File[] to allow strict typing if needed
    lastModified?: number;
    meta?: AppState['metadata'];
    status?: 'synced' | 'local' | 'backup' | 'modified'; // NEW: Sync status
    local?: ProjectSummary;
    backup?: ProjectSummary;
    _rawData?: { files: Record<string, any>; tapes: Record<string, any>; projectNotes?: string; projectConfig?: ProjectConfig }; // Transient: for content-based sync comparison
}

export interface VisualFilters {
    invert: number;
    grayscale: number;
    contrast: number;
    brightness: number;
    textureOpacity: number;
    fontSize: number;
    /** Multiplier on every corner radius; 0 is square, 1 is the stock look. Absent in older saves. */
    cornerRadius?: number;
    textureImage: string;
    textureSize: string;
    texturePosition?: string;
}

// ─── Sync & Export Types ──────────────────────────────────────────────────────

export type ConflictMode = 'manual' | 'overwrite_keep' | 'overwrite_clear';

export type SKPrimaryDecision = 'push_to_sk' | 'pull_to_slot' | 'delete_local' | 'delete_sk' | 'skip';

export interface ExportOptions {
    preset: 'import_only' | 'erase_replace' | 'merge' | 'custom';
    moveDisplacedToPool: boolean;
    conflictMode: ConflictMode;
    /** 'clean' (Clean Mirror) overwrites everything WAV Builder owns without comparing; it deletes nothing else. */
    skMode: 'overwrite' | 'clean';
    configDecision: SKPrimaryDecision;
    includeConfig: boolean;
    forceOverwrite: boolean;
    /**
     * Per-build opt-in: snapshot the card's SK folder into the project folder
     * (`_sk_backups/<timestamp>/`). Seeded from the saved durability preference,
     * which defaults off. Replaces `backupSKToProject`, which nothing ever read.
     */
    skSnapshot: boolean;
}
