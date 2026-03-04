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
    sourceFileId?: string; // NEW: Source project file ID
    sourceVersionId?: string; // NEW: Source project version ID
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

// Normalized State
export interface AppState {
    files: Record<string, FileRecord>;
    tapes: Record<TapeColor, Tape>;
    projectNotes?: string;
    metadata?: {
        appName: string;
        version: string;
        exportDate: string;
    };
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
    _rawData?: { files: Record<string, any>; tapes: Record<string, any>; projectNotes?: string }; // Transient: for content-based sync comparison
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
