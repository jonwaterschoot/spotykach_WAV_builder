export type TapeColor = 'Blue' | 'Green' | 'Pink' | 'Red' | 'Turquoise' | 'Yellow';

export const TAPE_COLORS: TapeColor[] = ['Blue', 'Green', 'Pink', 'Red', 'Turquoise', 'Yellow'];

export const COLOR_MAP: Record<TapeColor, string> = {
    Blue: 'bg-synthux-blue',
    Green: 'bg-synthux-green',
    Pink: 'bg-synthux-pink',
    Red: 'bg-synthux-red', // Brand Red
    Turquoise: 'bg-teal-400', // Keep or find brand match? User didn't specify. Keep teal-400 or match closest.
    Yellow: 'bg-synthux-yellow',
};

export interface AudioVersion {
    id: string; // uuid
    timestamp: number;
    description: string; // "Original", "Trimmed", "Faded", etc.
    blob: Blob;
    duration: number;
    processing?: ('normalized' | 'trimmed' | 'looped')[];
}

export interface FileRecord {
    id: string; // uuid
    name: string;
    originalName: string;
    versions: AudioVersion[];
    currentVersionId: string;
    isParked: boolean; // if false, implies it *might* be assigned, or just pending
}

// Tape Slots now just reference the FileID
export interface Slot {
    id: number; // 1-6
    fileId: string | null;
}

export interface Tape {
    color: TapeColor;
    slots: Slot[];
}

// Normalized State
export interface AppState {
    files: Record<string, FileRecord>;
    tapes: Record<TapeColor, Tape>;
}
