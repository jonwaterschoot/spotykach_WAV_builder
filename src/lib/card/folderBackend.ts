/**
 * The card reader route: a card (or any folder) the user picked through the File
 * System Access API. Slots live at `SK/<T>/<N>.WAV`, `T` being the tape colour's
 * initial. Writes go through `safeWriteBlob`, so they are atomic where the browser
 * allows it.
 */
import { TAPE_COLORS } from '../../types';
import type { TapeColor } from '../../types';
import { safeWriteBlob } from '../../utils/exportUtils';
import type { WriteCompare } from '../../utils/exportUtils';
import { readWavHeaderInfo } from '../audio/wavHeader';
import type { CardBackend, CardConfig, CardFileStore, CardInfo, SlotDescriptor, WriteSlotOptions } from './cardBackend';
import { slotKey } from './cardBackend';

const tapeFolder = (tape: TapeColor): string => tape.charAt(0).toUpperCase();
const slotFileName = (slot: number): string => `${slot}.WAV`;
const SLOT_FILE = /^(\d+)\.WAV$/i;

export class FolderBackend implements CardBackend {
    readonly kind = 'folder' as const;

    /**
     * The files the last `listSlots()` found, by `slotKey`. A `File` is a snapshot,
     * so header reads and hashes after a listing see exactly what was listed. Also
     * keeps the name as found (`01.wav`), which a fresh `<N>.WAV` lookup would miss.
     */
    private listed = new Map<string, File>();

    readonly root: FileSystemDirectoryHandle;

    constructor(root: FileSystemDirectoryHandle) {
        this.root = root;
    }

    async info(): Promise<CardInfo> {
        return { kind: 'folder', label: this.root.name };
    }

    private async skFolder(create: boolean): Promise<FileSystemDirectoryHandle | null> {
        try {
            return await this.root.getDirectoryHandle('SK', { create });
        } catch {
            return null; // No SK folder: an unbuilt card, or the SK folder itself was picked.
        }
    }

    private async tapeDir(tape: TapeColor, create: boolean): Promise<FileSystemDirectoryHandle | null> {
        const sk = await this.skFolder(create);
        if (!sk) return null;
        try {
            return await sk.getDirectoryHandle(tapeFolder(tape), { create });
        } catch {
            return null;
        }
    }

    private async slotFile(tape: TapeColor, slot: number): Promise<File | null> {
        const listed = this.listed.get(slotKey(tape, slot));
        if (listed) return listed;
        const dir = await this.tapeDir(tape, false);
        if (!dir) return null;
        try {
            return await (await dir.getFileHandle(slotFileName(slot))).getFile();
        } catch {
            return null;
        }
    }

    async listSlots(): Promise<SlotDescriptor[]> {
        this.listed.clear();
        const sk = await this.skFolder(false);
        if (!sk) return [];

        const slots: SlotDescriptor[] = [];
        for (const tape of TAPE_COLORS) {
            const found = new Map<number, File>();
            try {
                const dir = await sk.getDirectoryHandle(tapeFolder(tape), { create: false });
                for await (const [name, entry] of dir.entries()) {
                    const match = entry.kind === 'file' ? name.match(SLOT_FILE) : null;
                    if (match) found.set(parseInt(match[1]), await (entry as FileSystemFileHandle).getFile());
                }
            } catch {
                // Tape folder missing: no slots on this tape.
            }
            for (const [slot, file] of found) {
                this.listed.set(slotKey(tape, slot), file);
                slots.push({
                    tape,
                    slot,
                    fileName: file.name,
                    size: file.size,
                    lastModified: file.lastModified,
                    headerRead: false,
                    meta: null,
                    file,
                });
            }
        }
        return slots;
    }

    async readHeader(tape: TapeColor, slot: number): Promise<SlotDescriptor | null> {
        const file = await this.slotFile(tape, slot);
        if (!file) return null;
        const info = await readWavHeaderInfo(file).catch(() => null);
        return {
            tape,
            slot,
            fileName: file.name,
            size: file.size,
            lastModified: file.lastModified,
            headerRead: true,
            frames: info?.frames,
            sampleRate: info?.sampleRate,
            dataOffset: info?.dataOffset,
            name: info?.metadata?.name,
            meta: info?.metadata ?? null,
            file,
        };
    }

    async readFile(tape: TapeColor, slot: number, onProgress?: (fraction: number) => void): Promise<File> {
        const file = await this.slotFile(tape, slot);
        if (!file) throw new Error(`${tape} ${slot} is empty on the card.`);
        onProgress?.(1);
        return file;
    }

    async writeSlot(tape: TapeColor, slot: number, blob: Blob, options: WriteSlotOptions = {}): Promise<boolean> {
        options.signal?.throwIfAborted();
        const dir = await this.tapeDir(tape, true);
        if (!dir) throw new Error(`Could not open the ${tape} tape folder on the card.`);
        const wrote = await safeWriteBlob(dir, slotFileName(slot), blob, options.compare ?? 'content');
        this.listed.delete(slotKey(tape, slot));
        options.onProgress?.(1);
        return wrote;
    }

    async deleteSlot(tape: TapeColor, slot: number): Promise<void> {
        this.listed.delete(slotKey(tape, slot));
        const dir = await this.tapeDir(tape, false);
        if (!dir) return;
        await dir.removeEntry(slotFileName(slot));
    }

    /** `SK/` and one folder per tape, even for tapes the build leaves empty. */
    async ensureLayout(): Promise<void> {
        for (const tape of TAPE_COLORS) await this.tapeDir(tape, true);
    }

    /** `SK/config.txt` first, then a bare `config.txt` at the root. */
    async readConfig(): Promise<CardConfig | null> {
        const read = async (dir: FileSystemDirectoryHandle): Promise<string | null> => {
            try {
                return await (await dir.getFileHandle('config.txt', { create: false })).getFile().then(f => f.text());
            } catch {
                return null;
            }
        };
        const sk = await this.skFolder(false);
        const fromSK = sk ? await read(sk) : null;
        if (fromSK) return { text: fromSK, location: 'sk' };
        const fromRoot = await read(this.root);
        return fromRoot ? { text: fromRoot, location: 'root' } : null;
    }

    async writeConfig(text: string, compare: WriteCompare = 'content'): Promise<boolean> {
        return this.files.write('SK/config.txt', new Blob([text], { type: 'text/plain' }), compare);
    }

    readonly files: CardFileStore = {
        read: async (path) => {
            const parts = path.split('/');
            const name = parts.pop()!;
            try {
                let dir = this.root;
                for (const part of parts) dir = await dir.getDirectoryHandle(part, { create: false });
                return await (await dir.getFileHandle(name)).getFile();
            } catch {
                return null;
            }
        },
        write: async (path, blob, compare = 'content') => {
            const parts = path.split('/');
            const name = parts.pop()!;
            let dir = this.root;
            for (const part of parts) dir = await dir.getDirectoryHandle(part, { create: true });
            return safeWriteBlob(dir, name, blob, compare);
        },
    };
}
