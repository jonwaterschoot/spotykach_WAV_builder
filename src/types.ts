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
}

export interface WavMetadata {
    id?: string; // UUID from file header (ICMT)
    hash?: string; // Content hash for change detection
    tempo?: number; // BPM
    processing?: string[]; // Flags like ["NORMALIZED", "FADED"]
    slicePoints?: number[]; // Time in seconds
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

export interface ProjectConfig {
    mid_ch_a: number; // 1-16
    mid_ch_b: number; // 1-16
    mid_ps_a: boolean; // Start/stop deck A from MIDI
    mid_ps_b: boolean; // Start/stop deck B from MIDI
    pre_load: boolean; // Enable/disable pre-loading
    slc_mn_a: boolean; // Disable polyphony in Slice mode, deck A
    slc_mn_b: boolean; // Disable polyphony in Slice mode, deck B
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
};

// Normalized State
export interface AppState {
    files: Record<string, FileRecord>;
    tapes: Record<TapeColor, Tape>;
    projectNotes?: string;
    metadata?: Record<string, any>;
    projectConfig?: ProjectConfig;
    userLibrary?: UserLibrary;
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
