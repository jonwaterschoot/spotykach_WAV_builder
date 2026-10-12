/**
 * The USB route: a Spotykach in transfer mode on its rear USB port. Reaches the
 * 36 slot files only (no `config.txt`, no `project.json`).
 *
 * Reading is split in two tiers. `listSlots()` is one LIST (names, lengths, cue
 * counts, no audio). `readHeader()` reads the first 4 KB plus the chunks after
 * the audio, which is enough for our `ICMT` id and hash, also on files written by
 * 4.1.3 and earlier (`LIST` after `data`). Only `readFile()` downloads the audio.
 */
import { TAPE_COLORS } from '../../types';
import type { TapeColor } from '../../types';
import { readWavHeaderInfo } from '../audio/wavHeader';
import type { WavHeaderInfo } from '../audio/wavHeader';
import type { CardBackend, CardInfo, PlannedWrite, SlotDescriptor, SpaceCheck, WriteSlotOptions } from '../card/cardBackend';
import { slotKey } from '../card/cardBackend';
import { CMD, SLOT_LOADABLE, SLOT_OCCUPIED } from './skLink';
import type { Connection, HelloInfo, ListEntry, SkLink } from './skLink';

/** The device's own LIST read: covers our `LIST` chunk (about 300 bytes) with room to spare. */
const HEADER_READ = 4096;
/** Where the firmware stops looking for `data`. */
const MAX_HEADER_READ = 32768;
/** Tail chunks are `LIST` (legacy files) and `cue ` (255 points is 6 KB); anything bigger isn't ours. */
const MAX_TAIL_READ = 65536;
/** Per file on top of its size: cluster rounding and the directory entry. */
const SPACE_MARGIN_KIB = 64;

const SAMPLE_RATE = 48000;

const slotFileName = (slot: number): string => `${slot}.wav`;

export class UsbBackend implements CardBackend {
    readonly kind = 'usb' as const;
    readonly link: SkLink;
    /** From the last HELLO: limits, firmware version, card space. */
    hello: HelloInfo;
    /** Called once when the device goes away (unplugged, left transfer mode). */
    ondisconnect: ((error: Error) => void) | null = null;

    /** The last LIST, by `slotKey`, empty slots included. */
    private entries = new Map<string, ListEntry>();
    private listed = false;
    private headers = new Map<string, SlotDescriptor>();
    private readonly onBeforeUnload = () => {
        // Best effort; the device's 10 s timeout covers a lost EXIT.
        if (!this.link.closed) this.link.request(CMD.exit).catch(() => {});
    };

    constructor({ link, hello }: Connection) {
        this.link = link;
        this.hello = hello;
        link.onclose = (error) => {
            window.removeEventListener('beforeunload', this.onBeforeUnload);
            this.ondisconnect?.(error);
        };
        window.addEventListener('beforeunload', this.onBeforeUnload);
    }

    get connected(): boolean {
        return !this.link.closed;
    }

    /** Sends EXIT (the device goes back to MIDI) and closes the port. */
    async close(): Promise<void> {
        window.removeEventListener('beforeunload', this.onBeforeUnload);
        await this.link.exit();
    }

    // -----------------------------------------------------------------------
    // Addressing
    // -----------------------------------------------------------------------

    /** The device's tape index, by the colour's letter in HELLO's `BGPRTY`. */
    private tapeIndex(tape: TapeColor): number {
        const index = this.hello.tapeNames.indexOf(tape.charAt(0).toUpperCase());
        if (index < 0) throw new Error(`Spotykach has no ${tape} tape.`);
        return index;
    }

    private tapeColor(index: number): TapeColor | null {
        const letter = this.hello.tapeNames.charAt(index);
        return TAPE_COLORS.find(c => c.charAt(0).toUpperCase() === letter) ?? null;
    }

    /** Our slots are 1–6, the device's 0–5. */
    private deviceSlot(slot: number): number {
        if (slot < 1 || slot > this.hello.slots) throw new Error(`Slot ${slot} doesn't exist on Spotykach.`);
        return slot - 1;
    }

    private async entry(tape: TapeColor, slot: number): Promise<ListEntry | null> {
        if (!this.listed) await this.listSlots();
        const e = this.entries.get(slotKey(tape, slot));
        return e && (e.flags & SLOT_OCCUPIED) ? e : null;
    }

    private describe(tape: TapeColor, slot: number, e: ListEntry): SlotDescriptor {
        return {
            tape,
            slot,
            fileName: slotFileName(slot),
            size: e.fileSize,
            loadable: (e.flags & SLOT_LOADABLE) !== 0,
            cueCount: e.cues,
            headerRead: false,
            frames: e.frames || undefined,
            sampleRate: e.sampleRate || undefined,
            name: e.name || undefined,
            meta: null,
        };
    }

    // -----------------------------------------------------------------------
    // CardBackend
    // -----------------------------------------------------------------------

    async info(): Promise<CardInfo> {
        this.hello = await this.link.hello();
        return {
            kind: 'usb',
            label: `Spotykach (firmware ${this.hello.firmware || 'unknown'})`,
            totalKiB: this.hello.totalKiB,
            freeKiB: this.hello.freeKiB,
        };
    }

    async listSlots(): Promise<SlotDescriptor[]> {
        const entries = await this.link.list();
        this.entries.clear();
        this.headers.clear();
        const slots: SlotDescriptor[] = [];
        for (const e of entries) {
            const tape = this.tapeColor(e.tape);
            if (!tape) continue;
            const slot = e.slot + 1;
            this.entries.set(slotKey(tape, slot), e);
            if (e.flags & SLOT_OCCUPIED) slots.push(this.describe(tape, slot, e));
        }
        this.listed = true;
        return slots;
    }

    async readHeader(tape: TapeColor, slot: number): Promise<SlotDescriptor | null> {
        const key = slotKey(tape, slot);
        const cached = this.headers.get(key);
        if (cached) return cached;
        const e = await this.entry(tape, slot);
        if (!e) return null;

        const { head, tail } = await this.link.readSlot(this.tapeIndex(tape), this.deviceSlot(slot), this.hello.maxChunk, async (size, read) => {
            let head = await readWavHeaderInfo(toBuffer(await read(0, Math.min(HEADER_READ, size)))).catch(() => null);
            if (head && head.dataOffset === undefined && size > HEADER_READ) {
                // Chunks before `data` bigger than 4 KB: read as far as the firmware does.
                head = await readWavHeaderInfo(toBuffer(await read(0, Math.min(MAX_HEADER_READ, size)))).catch(() => null);
            }
            // After the audio: `cue `, and `LIST` on files from 4.1.3 and earlier.
            let tail: WavHeaderInfo | null = null;
            const tailStart = head?.dataEnd;
            if (tailStart !== undefined && tailStart < size && size - tailStart <= MAX_TAIL_READ) {
                tail = await readWavHeaderInfo(toBuffer(await read(tailStart, size - tailStart))).catch(() => null);
            }
            return { head, tail };
        });

        const meta = head?.metadata || tail?.metadata
            ? { ...tail?.metadata, ...head?.metadata }
            : null;
        if (meta && head?.frames !== undefined) meta.frames = head.frames;
        const desc: SlotDescriptor = {
            ...this.describe(tape, slot, e),
            headerRead: true,
            frames: head?.frames ?? (e.frames || undefined),
            sampleRate: head?.sampleRate ?? (e.sampleRate || undefined),
            dataOffset: head?.dataOffset,
            name: meta?.name ?? (e.name || undefined),
            meta,
        };
        this.headers.set(key, desc);
        return desc;
    }

    async readFile(tape: TapeColor, slot: number, onProgress?: (fraction: number) => void): Promise<File> {
        if (!(await this.entry(tape, slot))) throw new Error(`${tape} ${slot} is empty on the card.`);
        const bytes = await this.link.download(this.tapeIndex(tape), this.deviceSlot(slot), this.hello.maxChunk, { onProgress });
        return new File([toBuffer(bytes)], slotFileName(slot), { type: 'audio/wav' });
    }

    async writeSlot(tape: TapeColor, slot: number, blob: Blob, options: WriteSlotOptions = {}): Promise<boolean> {
        const { compare = 'content', onProgress, signal } = options;
        signal?.throwIfAborted();
        // Walks the chunk headers only, so `cue ` after the audio is counted too.
        const info = await readWavHeaderInfo(blob);
        this.validate(tape, slot, blob, info);

        if (compare !== 'always') {
            const existing = await this.entry(tape, slot);
            if (existing && await this.holds(tape, slot, existing, blob, info, compare)) {
                onProgress?.(1);
                return false;
            }
        }

        const bytes = new Uint8Array(await blob.arrayBuffer());
        await this.link.upload(this.tapeIndex(tape), this.deviceSlot(slot), bytes, this.hello.maxChunk, { onProgress, signal });

        // What LIST would now say, without paying for a LIST.
        this.headers.delete(slotKey(tape, slot));
        this.entries.set(slotKey(tape, slot), {
            tape: this.tapeIndex(tape),
            slot: this.deviceSlot(slot),
            flags: SLOT_OCCUPIED | SLOT_LOADABLE,
            fileSize: blob.size,
            frames: info.frames ?? 0,
            sampleRate: info.sampleRate ?? SAMPLE_RATE,
            cues: info.metadata?.slicePoints?.length ?? 0,
            channels: 2,
            bits: 32,
            name: info.metadata?.name ?? '',
        });
        await this.refreshSpace();
        return true;
    }

    async deleteSlot(tape: TapeColor, slot: number): Promise<void> {
        await this.link.remove(this.tapeIndex(tape), this.deviceSlot(slot));
        this.headers.delete(slotKey(tape, slot));
        this.entries.delete(slotKey(tape, slot));
        await this.refreshSpace();
    }

    /**
     * Walks the batch in order: the device needs room for the new file while the
     * old one still exists, and gets the old one's space back after the rename.
     */
    async checkSpace(writes: PlannedWrite[]): Promise<SpaceCheck> {
        await this.refreshSpace();
        if (!this.listed) await this.listSlots();
        const kib = (bytes: number) => Math.ceil(bytes / 1024);
        const sizes = new Map<string, number>();
        for (const [key, e] of this.entries) if (e.flags & SLOT_OCCUPIED) sizes.set(key, e.fileSize);

        let used = 0;
        let neededKiB = 0;
        for (const w of writes) {
            const key = slotKey(w.tape, w.slot);
            const newKiB = kib(w.size) + SPACE_MARGIN_KIB;
            neededKiB = Math.max(neededKiB, used + newKiB);
            const oldKiB = sizes.has(key) ? kib(sizes.get(key)!) + SPACE_MARGIN_KIB : 0;
            used += newKiB - oldKiB;
            sizes.set(key, w.size);
        }
        return { ok: neededKiB <= this.hello.freeKiB, freeKiB: this.hello.freeKiB, neededKiB };
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private async refreshSpace() {
        try {
            this.hello = await this.link.hello();
        } catch {
            // Keep the last numbers; the next request will report a lost connection.
        }
    }

    /** What the device would reject or play wrong, with a message that says why. */
    private validate(tape: TapeColor, slot: number, blob: Blob, info: WavHeaderInfo) {
        const where = `${tape} ${slot}`;
        if (info.dataOffset === undefined || info.frames === undefined) {
            throw new Error(`${where}: not a WAV file Spotykach can read.`);
        }
        // The device's is_loadable(): exactly 48 kHz stereo 32-bit float, format 3.
        const loadable = info.audioFormat === 3 && info.channels === 2 && info.sampleRate === SAMPLE_RATE
            && info.bitsPerSample === 32 && info.blockAlign === 8 && info.frames > 0;
        if (!loadable) {
            const kind = info.audioFormat === 3 ? 'float' : info.audioFormat === 1 ? 'integer PCM' : info.audioFormat === 0xFFFE ? 'extensible' : `format ${info.audioFormat}`;
            throw new Error(`${where}: ${info.sampleRate} Hz, ${info.channels} ch, ${info.bitsPerSample}-bit ${kind}. `
                + 'Spotykach loads 48 kHz stereo 32-bit float only; export it from WAV Builder first.');
        }
        if (info.dataOffset % 4 !== 0) {
            // The SD DMA can't read misaligned audio: noise, then a dead engine.
            throw new Error(`${where}: the audio starts at byte ${info.dataOffset}, which Spotykach can't play. Re-export the file.`);
        }
        if (info.frames > this.hello.maxFrames) {
            const seconds = (this.hello.maxFrames / SAMPLE_RATE).toFixed(0);
            throw new Error(`${where}: longer than the ${seconds} s Spotykach can hold.`);
        }
        const cues = info.metadata?.slicePoints?.length ?? 0;
        if (cues > this.hello.maxCues) {
            throw new Error(`${where}: ${cues} slice points; Spotykach takes at most ${this.hello.maxCues}.`);
        }
        if (blob.size > this.hello.maxFrames * 8 + 65536) {
            throw new Error(`${where}: the file is too large for Spotykach.`);
        }
    }

    /**
     * Whether the slot already holds `blob`, without downloading it. `content`
     * compares our `ICMT` (id, hash, processing) and the frame count from a header
     * read; a blob without our id and hash is always written.
     */
    private async holds(tape: TapeColor, slot: number, existing: ListEntry, blob: Blob, info: WavHeaderInfo, compare: 'content' | 'size'): Promise<boolean> {
        if (existing.fileSize !== blob.size) return false;
        if (compare === 'size') return true;
        const ours = info.metadata;
        if (!ours?.id || !ours.hash) return false;
        const theirs = (await this.readHeader(tape, slot))?.meta;
        return !!theirs
            && theirs.id === ours.id
            && theirs.hash === ours.hash
            && theirs.frames === info.frames
            && JSON.stringify(theirs.processing ?? []) === JSON.stringify(ours.processing ?? []);
    }
}

/** A fresh `ArrayBuffer` holding exactly these bytes. */
const toBuffer = (bytes: Uint8Array): ArrayBuffer =>
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
