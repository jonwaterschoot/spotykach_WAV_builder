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
import { snapshotFingerprint } from '../card/cardSnapshot';
import { sameFingerprint, type SlotFingerprint } from '../audio/slotFile';
import { CMD, SLOT_LOADABLE, SLOT_OCCUPIED, checkUploadable } from '@synthuxacademy/spotykach-transfer';
import type { Connection, DeviceInfo, SkLink, SlotEntry } from '@synthuxacademy/spotykach-transfer';

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
    hello: DeviceInfo;
    /** Called once when the device goes away (unplugged, left transfer mode). */
    ondisconnect: ((error: Error) => void) | null = null;

    /** The last LIST, by `slotKey`, empty slots included. */
    private entries = new Map<string, SlotEntry>();
    private listed = false;
    private headers = new Map<string, SlotDescriptor>();
    private readonly onBeforeUnload = () => {
        // Best effort; the device's 10 s timeout covers a lost EXIT.
        if (!this.link.closed) this.link.request(CMD.exit).catch(() => {});
    };

    constructor({ link, info }: Connection) {
        this.link = link;
        this.hello = info;
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

    private async entry(tape: TapeColor, slot: number): Promise<SlotEntry | null> {
        if (!this.listed) await this.listSlots();
        const e = this.entries.get(slotKey(tape, slot));
        return e && (e.flags & SLOT_OCCUPIED) ? e : null;
    }

    private describe(tape: TapeColor, slot: number, e: SlotEntry): SlotDescriptor {
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
            maxFrames: this.hello.maxFrames,
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

        const { head, tail } = await this.link.readSlot(this.tapeIndex(tape), this.deviceSlot(slot), async (size, read) => {
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

    async readFile(tape: TapeColor, slot: number, onProgress?: (fraction: number) => void, signal?: AbortSignal): Promise<File> {
        signal?.throwIfAborted();
        if (!(await this.entry(tape, slot))) throw new Error(`${tape} ${slot} is empty on the card.`);
        const bytes = await this.link.download(this.tapeIndex(tape), this.deviceSlot(slot), { onProgress, signal }).catch(unmask);
        return new File([toBuffer(bytes)], slotFileName(slot), { type: 'audio/wav' });
    }

    async readRanges(tape: TapeColor, slot: number, ranges: { offset: number; length: number }[]): Promise<Uint8Array[]> {
        if (!(await this.entry(tape, slot))) throw new Error(`${tape} ${slot} is empty on the card.`);
        return this.link.readSlot(this.tapeIndex(tape), this.deviceSlot(slot), async (size, read) => {
            const pieces: Uint8Array[] = [];
            for (const { offset, length } of ranges) {
                pieces.push(offset < size ? await read(offset, Math.min(length, size - offset)) : new Uint8Array(0));
            }
            return pieces;
        }).catch(unmask);
    }

    async writeSlot(tape: TapeColor, slot: number, blob: Blob, options: WriteSlotOptions = {}): Promise<boolean> {
        const { compare = 'content', onProgress, signal, expected } = options;
        signal?.throwIfAborted();
        // Walks the chunk headers only, so `cue ` after the audio is counted too.
        const info = await readWavHeaderInfo(blob);

        if (compare !== 'always') {
            const existing = await this.entry(tape, slot);
            if (existing && await this.holds(tape, slot, existing, blob, info, compare, expected)) {
                onProgress?.(1);
                return false;
            }
        }

        const bytes = new Uint8Array(await blob.arrayBuffer());
        this.validate(tape, slot, bytes, info);
        await this.link.upload(this.tapeIndex(tape), this.deviceSlot(slot), bytes, { onProgress, signal }).catch(unmask);

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

    /**
     * What the device would reject or play wrong, with a message that says why.
     * Format, length and cue count are the package's `checkUploadable` (the same
     * check `upload()` runs); the alignment check is ours: our files carry `ICMT`
     * before the audio, which the package's own `encodeWav` never writes.
     */
    private validate(tape: TapeColor, slot: number, bytes: Uint8Array, info: WavHeaderInfo) {
        const where = `${tape} ${slot}`;
        const problems = checkUploadable(bytes, this.hello);
        if (problems.length > 0) {
            throw new Error(`${where}: ${problems.join(' ')} Export it from WAV Builder first.`);
        }
        if (info.dataOffset !== undefined && info.dataOffset % 4 !== 0) {
            // The SD DMA can't read misaligned audio: noise, then a dead engine.
            throw new Error(`${where}: the audio starts at byte ${info.dataOffset}, which Spotykach can't play. Re-export the file.`);
        }
    }

    /**
     * Whether the slot already holds `blob`, without downloading it. `content`
     * compares our `ICMT` (id, hash, processing) and the frame count from a header
     * read; a blob without our id and hash is always written.
     */
    private async holds(
        tape: TapeColor, slot: number, existing: SlotEntry, blob: Blob, info: WavHeaderInfo,
        compare: 'content' | 'size', expected?: WriteSlotOptions['expected'],
    ): Promise<boolean> {
        if (existing.fileSize !== blob.size) return false;
        if (compare === 'size') return true;
        if (expected) {
            // Slot files from 4.2 carry no id. The device lists the same fingerprint as the
            // new file, and the project last wrote this slot from the same audio.
            const listed: SlotFingerprint = { name: existing.name, size: existing.fileSize, frames: existing.frames, cues: existing.cues };
            const previous = expected.previous;
            return sameFingerprint(listed, expected.fingerprint)
                && !!expected.audioHash && previous?.audioHash === expected.audioHash
                && sameFingerprint(listed, snapshotFingerprint(previous));
        }
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

/**
 * The transfer package (1.0.1) appends its detail with `e.message += …`. When the
 * browser's serial port itself fails, `e` is a DOMException whose `message` can't be
 * set, and what comes out is a TypeError about a getter. The real error is in the
 * console (`[spotykach] upload at byte …`); say what it means instead.
 */
const unmask = (e: unknown): never => {
    if (e instanceof TypeError && /getter/.test(e.message)) {
        throw new Error('The USB connection to Spotykach failed (the serial port reported an error). Reconnect to continue.', { cause: e });
    }
    throw e;
};

/** A fresh `ArrayBuffer` holding exactly these bytes. */
const toBuffer = (bytes: Uint8Array): ArrayBuffer =>
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
