/**
 * The one way the app reaches the card. Export, the sync diff and device-change
 * detection talk to a `CardBackend` and stop caring which route is in use:
 *
 * - `FolderBackend` — the card reader, through the File System Access API. Reaches
 *   everything: slot WAVs, `config.txt`, `project.json`, README.
 * - `UsbBackend` — the Spotykach's rear USB. Reaches the 36 slot files, and on
 *   newer firmware `config.txt`, `README.md` and `SK/project.json`, so every member
 *   it may lack is optional.
 *
 * Slots are addressed by tape colour and slot number; the backend owns the
 * `SK/<T>/<N>.WAV` layout.
 */
import type { CardSnapshotSlot, TapeColor, WavMetadata } from '../../types';
import type { SlotFingerprint } from '../audio/slotFile';
import type { WriteCompare } from '../../utils/exportUtils';

export type CardKind = 'folder' | 'usb';

export interface CardInfo {
    kind: CardKind;
    /** What to call the card in the UI: the folder name, or the device. */
    label: string;
    /** USB only: HELLO reports the card size and free space. */
    totalKiB?: number;
    freeKiB?: number;
    /** USB only, from HELLO: the longest file the device holds, in frames. */
    maxFrames?: number;
}

/**
 * One occupied slot on the card, the same shape over either route. `listSlots()`
 * fills the listing fields; `readHeader()` adds the header fields. Nothing here
 * needs the audio.
 */
export interface SlotDescriptor {
    tape: TapeColor;
    slot: number;
    /** The file's name on the card, e.g. `1.WAV`. */
    fileName: string;
    size: number;
    /** Folder route only: USB has no timestamps. */
    lastModified?: number;
    /** USB only, from LIST: the device can load this file (48 kHz stereo float32). */
    loadable?: boolean;
    /** USB only, from LIST: cue points, before or after `data`. */
    cueCount?: number;

    /** True once `readHeader()` has filled the fields below. */
    headerRead: boolean;
    frames?: number;
    sampleRate?: number;
    /** Byte offset of the audio. Must be a multiple of 4 on the card. */
    dataOffset?: number;
    /** `INAM`, when the file has one. */
    name?: string;
    /** Our `ICMT` (id, hash, processing, tempo) and cue points, or null. */
    meta: WavMetadata | null;

    /**
     * The card file itself, when the route has it without a download (the folder
     * route). Absent over USB, where the bytes cost a `readFile()`.
     */
    file?: File;
}

export interface CardConfig {
    text: string;
    /** Where it was found: `SK/config.txt`, or a bare `config.txt` at the root. */
    location: 'root' | 'sk';
}

export interface WriteSlotOptions {
    /** How to decide that the slot already holds this blob. Default `content`. */
    compare?: WriteCompare;
    /**
     * For `content` over USB, where the card file can't be read cheaply: the slot
     * file's fingerprint, and what the project last wrote to this slot. The slot
     * holds `blob` when the device lists the same fingerprint and the snapshot says
     * it was written from the same audio. The folder route compares bytes instead.
     */
    expected?: { fingerprint: SlotFingerprint; audioHash: string | null; previous?: CardSnapshotSlot };
    /** 0–1. */
    onProgress?: (fraction: number) => void;
    signal?: AbortSignal;
}

/**
 * Files outside the slots, by `/`-separated path from the card root
 * (`README.md`, `SK/project.json`, `WAV_Builder/Projects/...`). Over USB (protocol
 * 1.2) only `README.md` and `SK/project.json`.
 */
export interface CardFileStore {
    /** USB only: the largest file the device takes, in bytes. */
    maxSize?: number;
    /** Null when the file is missing or unreadable. */
    read(path: string): Promise<File | null>;
    /** Creates folders on the way. True when it wrote, false when `compare` skipped it. */
    write(path: string, blob: Blob, compare?: WriteCompare): Promise<boolean>;
}

/** One slot a batch will write, for `checkSpace()`. */
export interface PlannedWrite {
    tape: TapeColor;
    slot: number;
    size: number;
}

export interface SpaceCheck {
    ok: boolean;
    freeKiB: number;
    /** The least free space the batch needs at any point, margins included. */
    neededKiB: number;
}

export interface CardBackend {
    readonly kind: CardKind;
    info(): Promise<CardInfo>;
    /** Every occupied slot, header fields not yet read. */
    listSlots(): Promise<SlotDescriptor[]>;
    /** One slot with its header fields. Null when the slot is empty. */
    readHeader(tape: TapeColor, slot: number): Promise<SlotDescriptor | null>;
    /** The whole file. Over USB this is a download. */
    readFile(tape: TapeColor, slot: number, onProgress?: (fraction: number) => void, signal?: AbortSignal): Promise<File>;
    /** USB only: pieces of a slot file, by byte offset, without downloading the rest. */
    readRanges?(tape: TapeColor, slot: number, ranges: { offset: number; length: number }[]): Promise<Uint8Array[]>;
    /** True when it wrote, false when `compare` found the slot already holds `blob`. */
    writeSlot(tape: TapeColor, slot: number, blob: Blob, options?: WriteSlotOptions): Promise<boolean>;
    deleteSlot(tape: TapeColor, slot: number): Promise<void>;
    /** USB only: whether a batch of writes fits on the card. The folder route can't read the card's free space. */
    checkSpace?(writes: PlannedWrite[]): Promise<SpaceCheck>;

    /** Create whatever the card needs before a build (the folder route's `SK/<T>` folders). */
    ensureLayout?(): Promise<void>;
    readConfig?(): Promise<CardConfig | null>;
    writeConfig?(text: string, compare?: WriteCompare): Promise<boolean>;
    files?: CardFileStore;
}

/** "Red3", the key the sync diff and the card snapshot use. */
export const slotKey = (tape: TapeColor, slot: number): string => `${tape}${slot}`;

/**
 * Every occupied slot, keyed by `slotKey`, with its header read unless
 * `listingIsEnough` says the listing already settles it (over USB: a slot that
 * matches the project's card snapshot needs no header read).
 */
export const readCardSlots = async (
    card: CardBackend,
    listingIsEnough?: (listed: SlotDescriptor) => boolean,
): Promise<Map<string, SlotDescriptor>> => {
    const slots = new Map<string, SlotDescriptor>();
    for (const listed of await card.listSlots()) {
        const desc = listingIsEnough?.(listed) ? listed : await card.readHeader(listed.tape, listed.slot);
        if (desc) slots.set(slotKey(desc.tape, desc.slot), desc);
    }
    return slots;
};

/** The slot's bytes: the file the descriptor already holds, or a `readFile()`. */
export const slotFile = (card: CardBackend, desc: SlotDescriptor): Promise<File> =>
    desc.file ? Promise.resolve(desc.file) : card.readFile(desc.tape, desc.slot);

/**
 * A card with nothing on it and no way to write. Stands in when the real card
 * can't be reached, so the sync modal can open and ask for it.
 */
export const unreachableCard: CardBackend = {
    kind: 'folder',
    info: async () => ({ kind: 'folder', label: 'No card' }),
    listSlots: async () => [],
    readHeader: async () => null,
    readFile: async () => { throw new Error('SD card not found.'); },
    writeSlot: async () => { throw new Error('SD card not found.'); },
    deleteSlot: async () => { throw new Error('SD card not found.'); },
};
