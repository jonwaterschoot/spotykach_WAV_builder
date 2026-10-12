/**
 * Spotykach USB transfer protocol v1: the SysEx that switches the device into
 * transfer mode, the Web Serial port, frames, CRC-32 and the commands.
 *
 * Ported from `web/index.html` on the firmware's `uploader` branch (MIT, Synthux
 * Academy); the upstream commit and protocol version are pinned in `PROTOCOL.md`.
 * A protocol change should touch only this file and `usbBackend.ts`.
 */

export const USB_VENDOR_ID = 0x0483;
export const USB_PRODUCT_ID = 0x5740;
export const PROTO_MAJOR = 1;

const SYSEX_ENTER = [0xF0, 0x7D, 0x53, 0x4B, 0x01, 0xF7];
const HEADER_SIZE = 12;
const MAX_PAYLOAD = 32768 + 16;
const RESPONSE_FLAG = 0x80;
const FRAME_ERROR_TYPE = 0x80;

export const CMD = {
    hello: 0x01,
    ping: 0x02,
    list: 0x03,
    uploadBegin: 0x10,
    uploadData: 0x11,
    uploadCommit: 0x12,
    uploadAbort: 0x13,
    downloadOpen: 0x20,
    downloadRead: 0x21,
    downloadClose: 0x22,
    remove: 0x30,
    exit: 0x7F,
} as const;

export const STATUS = {
    ok: 0,
    badFrame: 1,
    unknownCmd: 2,
    badState: 3,
    badArg: 4,
    noCard: 5,
    io: 6,
    notFound: 7,
    noSpace: 8,
    tooLarge: 9,
    badOffset: 10,
    badCrc: 11,
    badFormat: 12,
} as const;

const STATUS_TEXT = [
    'OK',
    'Transfer error (corrupted frame). Please retry.',
    "Spotykach doesn't know this command. Update its firmware.",
    'Spotykach is busy with another operation.',
    'Invalid request.',
    'SD card not available. Check the card and reconnect.',
    'SD card read/write error.',
    'The slot is empty.',
    'Not enough free space on the SD card.',
    'File is too large.',
    'Transfer got out of sync. Please retry.',
    'Upload was corrupted (checksum mismatch). Please retry.',
    'Spotykach rejected the file format.',
];

/** LIST entry flags. */
export const SLOT_OCCUPIED = 1 << 0;
export const SLOT_LOADABLE = 1 << 1;
export const SLOT_PARSED = 1 << 2;

const isWindows = typeof navigator !== 'undefined' && /Win/.test(navigator.platform);
const isLinux = typeof navigator !== 'undefined' && /Linux/.test(navigator.platform) && !/Android/.test(navigator.userAgent);
const RELEASE_PORT_HINT = isWindows ? ' On Windows, close other apps (e.g. your DAW) that use its MIDI port.' : '';

/** The device answered with a status other than OK. */
export class DeviceError extends Error {
    readonly status: number;
    constructor(status: number, message?: string) {
        super(message || STATUS_TEXT[status] || `Spotykach error ${status}.`);
        this.status = status;
    }
}

export class TimeoutError extends Error {
    /** What had arrived when the request gave up, for the console. */
    readonly detail: string;
    constructor(detail: string) {
        super("Spotykach didn't respond in time.");
        this.detail = detail;
    }
}

/** First use on this computer: Chrome needs a click to grant the serial port. Call `authorizePort()` from one. */
export class NeedsAuthorizationError extends Error {
    constructor() {
        super('Select Spotykach in the browser\'s port picker. This is needed only once per computer.');
    }
}

/**
 * No Spotykach MIDI port. Either it isn't connected, or it is already in transfer
 * mode (rings lit, MIDI port gone) from an attempt whose port picker was closed.
 */
export class MidiPortNotFoundError extends Error {
    constructor() {
        super('Spotykach MIDI port not found. Is it connected through the rear USB-C port?' + RELEASE_PORT_HINT
            + ' If its rings are already lit for transfer, select it in the port picker (Authorise port).');
    }
}

// ---------------------------------------------------------------------------
// CRC-32 (IEEE 802.3, same as zlib)
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        t[i] = c >>> 0;
    }
    return t;
})();

/** Pass the previous result as `crc` to continue over more bytes. */
export function crc32(data: Uint8Array, crc = 0): number {
    crc = ~crc >>> 0;
    for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
    return ~crc >>> 0;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Replies
// ---------------------------------------------------------------------------

export interface HelloInfo {
    protoMajor: number;
    protoMinor: number;
    tapes: number;
    slots: number;
    /** `BGPRTY`. */
    tapeNames: string;
    maxChunk: number;
    /** The deck buffer length; longer files are truncated on load. */
    maxFrames: number;
    maxCues: number;
    totalKiB: number;
    freeKiB: number;
    firmware: string;
}

export interface ListEntry {
    /** 0–5, index into `tapeNames`. */
    tape: number;
    /** 0–5. */
    slot: number;
    flags: number;
    fileSize: number;
    /** 0 when the header didn't parse. */
    frames: number;
    sampleRate: number;
    cues: number;
    channels: number;
    bits: number;
    /** `INAM`, empty when the file has none. */
    name: string;
}

export interface TransferOptions {
    /** 0–1. */
    onProgress?: (fraction: number) => void;
    signal?: AbortSignal;
}

interface Pending {
    type: number;
    seq: number;
    resolve: (payload: Uint8Array) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setInterval>;
}

/*
DOWNLOAD_READ asks for an absolute offset and length, so it can be repeated safely.
On macOS the serial tty can drop bytes of large bursts when Chrome doesn't drain it
fast enough, so the read size adapts: halve on a lost reply and stay below the size
that failed; probe that size again only after a long run of clean reads.
*/
const MIN_READ_CHUNK = 1024;
const GROW_AFTER = 8;
const PROBE_AFTER = 64;
const MAX_FAILURES_IN_ROW = 8;
const READ_CHUNK_KEY = 'spotykach.readChunk';

/** The read size that worked last time on this computer, so a download doesn't start by losing replies. */
function loadReadChunk(maxChunk: number): number {
    try {
        const saved = parseInt(localStorage.getItem(READ_CHUNK_KEY) ?? '', 10);
        if (saved >= MIN_READ_CHUNK) return Math.min(saved, maxChunk);
    } catch { /* storage blocked */ }
    return maxChunk;
}

function saveReadChunk(chunk: number) {
    try {
        localStorage.setItem(READ_CHUNK_KEY, String(chunk));
    } catch { /* storage blocked */ }
}

const slotArgs = (tape: number, slot: number) => new Uint8Array([tape, slot, 0, 0]);

// ---------------------------------------------------------------------------
// Link
// ---------------------------------------------------------------------------

/**
 * One open serial connection to a Spotykach in transfer mode. Requests run
 * strictly one at a time; multi-request operations (an upload, a download)
 * also run one at a time, through `exclusive()`.
 */
export class SkLink {
    readonly port: SerialPort;
    /** Called once when the connection is lost (not on `close()`). */
    onclose: ((error: Error) => void) | null = null;
    closed = false;

    private rx = new Uint8Array(0);
    private lastRxMs = 0;
    private lastTxMs = 0;
    private seq = 0;
    private pending: Pending | null = null;
    private requestLock: Promise<unknown> = Promise.resolve();
    private opLock: Promise<unknown> = Promise.resolve();
    private ops = 0;
    private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
    private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    private pingTimer: ReturnType<typeof setInterval> | null = null;
    private readonly onSerialDisconnect = (e: Event) => {
        if (e.target === this.port) this.shutdown(new Error('Spotykach disconnected.'));
    };

    private constructor(port: SerialPort) {
        this.port = port;
    }

    /** Opens the port, retrying while the device is still enumerating. Doesn't talk to it yet. */
    static async open(port: SerialPort): Promise<SkLink> {
        const link = new SkLink(port);
        for (let attempt = 0; ; attempt++) {
            try {
                await port.open({ baudRate: 115200, bufferSize: 65536 });
                break;
            } catch (e) {
                if (attempt >= 7) {
                    throw new Error("Can't open the Spotykach serial port. Is another tab or app using it?"
                        + (isLinux ? " On Linux, add your user to the 'dialout' group (or 'uucp' on Arch) and log in again." : ''),
                    { cause: e });
                }
                await sleep(250);
            }
        }
        link.writer = port.writable!.getWriter();
        link.reader = port.readable!.getReader();
        navigator.serial?.addEventListener('disconnect', link.onSerialDisconnect);
        void link.readLoop();
        return link;
    }

    private async readLoop() {
        try {
            while (this.reader) {
                const { value, done } = await this.reader.read();
                if (done) break;
                if (value && value.length) this.append(value);
            }
        } catch { /* device went away */ }
        this.shutdown(new Error('Connection to Spotykach lost.'));
    }

    private append(bytes: Uint8Array) {
        this.lastRxMs = performance.now();
        const merged = new Uint8Array(this.rx.length + bytes.length);
        merged.set(this.rx);
        merged.set(bytes, this.rx.length);
        this.rx = merged;
        while (this.rx.length >= HEADER_SIZE) {
            // Bytes before a magic are dropped, which also resyncs after garbage.
            if (this.rx[0] !== 0x53 || this.rx[1] !== 0x4B) { this.rx = this.rx.subarray(1); continue; }
            const dv = new DataView(this.rx.buffer, this.rx.byteOffset);
            const len = dv.getUint32(4, true);
            if (len > MAX_PAYLOAD) { this.rx = this.rx.subarray(1); continue; }
            if (this.rx.length < HEADER_SIZE + len) break;
            const frame = this.rx.slice(0, HEADER_SIZE + len);
            this.rx = this.rx.slice(HEADER_SIZE + len);
            const crc = crc32(frame.subarray(HEADER_SIZE), crc32(frame.subarray(2, 8)));
            if (crc !== dv.getUint32(8, true)) { this.fail(new DeviceError(STATUS.badFrame)); continue; }
            this.deliver(frame[2], frame[3], frame.subarray(HEADER_SIZE));
        }
    }

    private deliver(type: number, seq: number, payload: Uint8Array) {
        const p = this.pending;
        if (!p) return;
        if (type === FRAME_ERROR_TYPE) { this.fail(new DeviceError(payload[0] ?? STATUS.badFrame)); return; }
        if (type !== (p.type | RESPONSE_FLAG) || seq !== p.seq) return; // a late reply to a request we gave up on
        this.pending = null;
        clearInterval(p.timer);
        p.resolve(payload);
    }

    /** What had arrived when a request timed out: tells a silent device apart from bytes lost on the way. */
    private rxState(): string {
        const rx = this.rx;
        if (rx.length < HEADER_SIZE) return `${rx.length} bytes pending`;
        const dv = new DataView(rx.buffer, rx.byteOffset);
        const magic = rx[0] === 0x53 && rx[1] === 0x4B;
        return `${rx.length} of ${HEADER_SIZE + dv.getUint32(4, true)} bytes of a ${magic ? '' : 'misaligned '}frame type 0x${rx[2].toString(16)} seq ${rx[3]} pending`;
    }

    /** Drops partially received data, e.g. before retrying a request. */
    private resync() {
        this.rx = new Uint8Array(0);
    }

    private fail(error: Error) {
        const p = this.pending;
        if (!p) return;
        this.pending = null;
        clearInterval(p.timer);
        p.reject(error);
    }

    private shutdown(error: Error) {
        if (this.closed) return;
        this.closed = true;
        this.stopKeepAlive();
        navigator.serial?.removeEventListener('disconnect', this.onSerialDisconnect);
        this.fail(error);
        this.onclose?.(error);
    }

    /** Closes the port without telling the device; `exit()` does both. */
    async close() {
        this.closed = true;
        this.stopKeepAlive();
        navigator.serial?.removeEventListener('disconnect', this.onSerialDisconnect);
        this.fail(new Error('Disconnected.'));
        const reader = this.reader;
        this.reader = null;
        try { await reader?.cancel(); } catch { /* already gone */ }
        try { reader?.releaseLock(); } catch { /* already gone */ }
        try { this.writer?.releaseLock(); } catch { /* already gone */ }
        try { await this.port.close(); } catch { /* already gone */ }
    }

    /**
     * One request and its reply payload (status byte included). Throws a
     * `DeviceError` on a status other than OK.
     *
     * `stallMs`: give up early once a reply has started arriving and then stops.
     */
    request(type: number, payload: Uint8Array = new Uint8Array(0), timeout = 5000, stallMs = 0): Promise<Uint8Array> {
        const run = () => this.send(type, payload, timeout, stallMs);
        const result = this.requestLock.then(run, run);
        this.requestLock = result.catch(() => {});
        return result;
    }

    private async send(type: number, payload: Uint8Array, timeout: number, stallMs: number): Promise<Uint8Array> {
        if (this.closed || !this.writer) throw new Error('Not connected to Spotykach.');
        this.seq = (this.seq + 1) & 0xff;
        const seq = this.seq;
        const frame = new Uint8Array(HEADER_SIZE + payload.length);
        const dv = new DataView(frame.buffer);
        frame[0] = 0x53;
        frame[1] = 0x4B;
        frame[2] = type;
        frame[3] = seq;
        dv.setUint32(4, payload.length, true);
        frame.set(payload, HEADER_SIZE);
        dv.setUint32(8, crc32(payload, crc32(frame.subarray(2, 8))), true);

        const response = new Promise<Uint8Array>((resolve, reject) => {
            const start = performance.now();
            const timer = setInterval(() => {
                const now = performance.now();
                const stalled = stallMs > 0 && this.rx.length > 0 && now - this.lastRxMs > stallMs;
                if (stalled || now - start > timeout) {
                    this.fail(new TimeoutError(`request 0x${type.toString(16)} seq ${seq}: ${this.rxState()}`));
                }
            }, 50);
            this.pending = { type, seq, resolve, reject, timer };
        });
        this.lastTxMs = performance.now();
        await this.writer.write(frame);
        const reply = await response;
        if (reply[0] !== STATUS.ok) throw new DeviceError(reply[0]);
        return reply;
    }

    /** Runs `work` with no other operation in between, e.g. a whole upload. */
    exclusive<T>(work: () => Promise<T>): Promise<T> {
        const run = async () => {
            this.ops++;
            try {
                return await work();
            } finally {
                this.ops--;
            }
        };
        const result = this.opLock.then(run, run);
        this.opLock = result.catch(() => {});
        return result;
    }

    /**
     * PING every 2 s while nothing else is talking: the device leaves transfer
     * mode after 10 s without a valid frame.
     */
    startKeepAlive() {
        this.stopKeepAlive();
        this.pingTimer = setInterval(() => {
            if (this.closed || this.ops > 0 || this.pending) return;
            if (performance.now() - this.lastTxMs < 2000) return;
            this.request(CMD.ping).catch(() => {});
        }, 500);
    }

    private stopKeepAlive() {
        if (this.pingTimer) clearInterval(this.pingTimer);
        this.pingTimer = null;
    }

    // -----------------------------------------------------------------------
    // Commands
    // -----------------------------------------------------------------------

    /** Also resets the device's session to idle, so it never runs inside another operation. */
    async hello(): Promise<HelloInfo> {
        const p = await this.exclusive(() => this.request(CMD.hello));
        const dv = new DataView(p.buffer, p.byteOffset, p.byteLength);
        const fwLength = p[34];
        return {
            protoMajor: p[1],
            protoMinor: p[2],
            tapes: p[3],
            slots: p[4],
            tapeNames: new TextDecoder().decode(p.subarray(5, 11)),
            maxChunk: dv.getUint32(14, true),
            maxFrames: dv.getUint32(18, true),
            maxCues: dv.getUint16(22, true),
            totalKiB: dv.getUint32(26, true),
            freeKiB: dv.getUint32(30, true),
            firmware: new TextDecoder().decode(p.subarray(35, 35 + fwLength)),
        };
    }

    /** All 36 slots, empty ones included (flag bit 0 clear). */
    list(): Promise<ListEntry[]> {
        return this.exclusive(async () => {
            const p = await this.request(CMD.list, undefined, 15000);
            const dv = new DataView(p.buffer, p.byteOffset, p.byteLength);
            const decoder = new TextDecoder();
            const count = p[1];
            const slots: ListEntry[] = [];
            let o = 2;
            for (let i = 0; i < count; i++) {
                const nameLength = p[o + 3];
                slots.push({
                    tape: p[o],
                    slot: p[o + 1],
                    flags: p[o + 2],
                    fileSize: dv.getUint32(o + 4, true),
                    frames: dv.getUint32(o + 8, true),
                    sampleRate: dv.getUint32(o + 12, true),
                    cues: dv.getUint16(o + 16, true),
                    channels: p[o + 18],
                    bits: p[o + 19],
                    name: decoder.decode(p.subarray(o + 20, o + 20 + nameLength)),
                });
                o += 20 + nameLength;
            }
            return slots;
        });
    }

    /**
     * Writes `bytes` to the slot: `<N>.tmp`, then CRC check, header check and
     * rename on the device, so the old slot survives a failed upload.
     */
    upload(tape: number, slot: number, bytes: Uint8Array, maxChunk: number, options: TransferOptions = {}): Promise<void> {
        return this.exclusive(async () => {
            const { onProgress, signal } = options;
            signal?.throwIfAborted();
            const begin = new Uint8Array(12);
            const dv = new DataView(begin.buffer);
            begin.set(slotArgs(tape, slot));
            dv.setUint32(4, bytes.length, true);
            dv.setUint32(8, crc32(bytes), true);
            await this.request(CMD.uploadBegin, begin, 10000);
            try {
                for (let offset = 0; offset < bytes.length; offset += maxChunk) {
                    signal?.throwIfAborted();
                    const chunk = bytes.subarray(offset, Math.min(offset + maxChunk, bytes.length));
                    const payload = new Uint8Array(4 + chunk.length);
                    new DataView(payload.buffer).setUint32(0, offset, true);
                    payload.set(chunk, 4);
                    await this.request(CMD.uploadData, payload, 10000);
                    onProgress?.((offset + chunk.length) / bytes.length);
                }
                signal?.throwIfAborted();
                await this.request(CMD.uploadCommit, undefined, 10000);
            } catch (e) {
                if (!this.closed) {
                    try { await this.request(CMD.uploadAbort); } catch { /* the device drops the temp file on exit anyway */ }
                }
                throw e;
            }
        });
    }

    /**
     * Opens the slot for reading, hands `work` its size and a range reader, and
     * closes it again. Reads retry with a shrinking size when replies get lost.
     */
    readSlot<T>(tape: number, slot: number, maxChunk: number,
        work: (size: number, read: (offset: number, length: number, options?: TransferOptions) => Promise<Uint8Array>) => Promise<T>): Promise<T> {
        return this.exclusive(async () => {
            const open = await this.request(CMD.downloadOpen, slotArgs(tape, slot));
            const size = new DataView(open.buffer, open.byteOffset).getUint32(4, true);
            try {
                return await work(size, (offset, length, options) => this.readRange(offset, length, maxChunk, options));
            } finally {
                if (!this.closed) {
                    try { await this.request(CMD.downloadClose); } catch { /* next HELLO resets the session */ }
                }
            }
        });
    }

    /** The whole slot, byte-exact. */
    download(tape: number, slot: number, maxChunk: number, options: TransferOptions = {}): Promise<Uint8Array> {
        return this.readSlot(tape, slot, maxChunk, (size, read) => read(0, size, options));
    }

    private async readRange(start: number, length: number, maxChunk: number, options: TransferOptions = {}): Promise<Uint8Array> {
        const { onProgress, signal } = options;
        const out = new Uint8Array(length);
        let chunk = loadReadChunk(maxChunk);
        let ceiling = chunk; // largest read size not known to fail
        let clean = 0;
        let failures = 0;
        let failuresInRow = 0;
        for (let done = 0; done < length;) {
            signal?.throwIfAborted();
            const size = Math.min(chunk, length - done);
            const args = new Uint8Array(8);
            const dv = new DataView(args.buffer);
            dv.setUint32(0, start + done, true);
            dv.setUint32(4, size, true);
            let p: Uint8Array;
            try {
                p = await this.request(CMD.downloadRead, args, 1500, 300);
            } catch (e) {
                const retriable = e instanceof TimeoutError || (e instanceof DeviceError && e.status === STATUS.badFrame);
                const detail = `read at byte ${start + done}, ${size} bytes: ${e instanceof TimeoutError ? e.detail : (e as Error).message}`;
                console.warn(`[usb] ${detail}`);
                failures++;
                if (!retriable || this.closed || ++failuresInRow > MAX_FAILURES_IN_ROW) {
                    if (e instanceof Error) e.message += ` (${detail})`;
                    throw e;
                }
                this.resync();
                ceiling = Math.max(MIN_READ_CHUNK, chunk >> 1);
                chunk = ceiling;
                clean = 0;
                continue;
            }
            out.set(p.subarray(4, 4 + size), done);
            done += size;
            onProgress?.(done / length);
            failuresInRow = 0;
            clean++;
            if (chunk < ceiling && clean >= GROW_AFTER) {
                chunk = Math.min(ceiling, chunk << 1);
                clean = 0;
            } else if (chunk === ceiling && ceiling < maxChunk && clean >= PROBE_AFTER) {
                ceiling = Math.min(maxChunk, ceiling << 1);
                chunk = ceiling;
                clean = 0;
            }
        }
        // Small reads (headers) say nothing about the size that works.
        if (length >= maxChunk) saveReadChunk(ceiling);
        if (failures) console.info(`[usb] ${failures} lost replies, finished with ${chunk} byte reads`);
        return out;
    }

    async remove(tape: number, slot: number): Promise<void> {
        await this.exclusive(() => this.request(CMD.remove, slotArgs(tape, slot)));
    }

    /** Back to MIDI. Best effort: the device also leaves after 10 s of silence. */
    async exit(): Promise<void> {
        this.stopKeepAlive();
        if (!this.closed) {
            try { await this.request(CMD.exit, undefined, 1000); } catch { /* timeout takes over */ }
        }
        this.onclose = null;
        await this.close();
    }
}

// ---------------------------------------------------------------------------
// Entering transfer mode
// ---------------------------------------------------------------------------

export const isUsbTransferSupported = (): boolean =>
    typeof navigator !== 'undefined' && 'serial' in navigator && 'requestMIDIAccess' in navigator;

/** The serial port this browser already has permission for, if the device is in transfer mode. */
export async function grantedPort(): Promise<SerialPort | null> {
    const ports = await navigator.serial?.getPorts() ?? [];
    return ports.find(p => {
        const i = p.getInfo();
        return i.usbVendorId === USB_VENDOR_ID && i.usbProductId === USB_PRODUCT_ID;
    }) ?? null;
}

async function waitForPort(timeoutMs: number): Promise<SerialPort | null> {
    const start = performance.now();
    while (performance.now() - start < timeoutMs) {
        const port = await grantedPort();
        if (port) return port;
        await sleep(250);
    }
    return null;
}

/**
 * Sends the enter SysEx to the Spotykach USB MIDI port and waits for the reply.
 * No reply means the firmware has no USB transfer (release firmware ignores
 * SysEx), but only after a second try: on the first use in a page the ports open
 * lazily, and a reply can come before the input listens. A MIDI port that
 * disappears meanwhile means the device did switch and its reply was lost.
 */
export async function enterTransferMode(): Promise<void> {
    let access: MIDIAccess;
    try {
        access = await navigator.requestMIDIAccess({ sysex: true });
    } catch (e) {
        throw new Error('MIDI access was denied. Spotykach is switched to transfer mode through MIDI SysEx, so please allow it.', { cause: e });
    }
    const match = (port: MIDIPort) => /spotykach/i.test(port.name || '');
    const outputs = [...access.outputs.values()].filter(match);
    const inputs = [...access.inputs.values()].filter(match);
    if (!outputs.length) {
        throw new MidiPortNotFoundError();
    }
    const output = outputs[0];

    // Open both ends before sending, so the reply can't arrive before anyone listens.
    try {
        await Promise.all([output.open(), ...inputs.map(i => i.open())]);
    } catch (e) {
        throw new Error("Can't open the Spotykach MIDI port." + RELEASE_PORT_HINT, { cause: e });
    }

    let status: number | null = null;
    let replied: (status: number) => void = () => {};
    inputs.forEach(input => {
        input.onmidimessage = (e: MIDIMessageEvent) => {
            const d = e.data;
            if (d && d.length === 7 && d[0] === 0xF0 && d[1] === 0x7D && d[2] === 0x53 && d[3] === 0x4B && d[4] === 0x02) {
                status = d[5];
                replied(d[5]);
            }
        };
    });
    const switched = () => output.state === 'disconnected';

    try {
        for (let attempt = 0; attempt < 2 && status === null; attempt++) {
            if (switched()) return;
            try {
                output.send(SYSEX_ENTER);
            } catch (e) {
                if (switched()) return;
                throw new Error("Can't send to the Spotykach MIDI port." + RELEASE_PORT_HINT, { cause: e });
            }
            await new Promise<void>(resolve => {
                const timer = setTimeout(resolve, attempt === 0 ? 2000 : 3000);
                replied = () => { clearTimeout(timer); resolve(); };
            });
        }
    } finally {
        inputs.forEach(i => { i.onmidimessage = null; });
    }

    if (status === null) {
        if (switched()) return;
        throw new Error("Spotykach didn't respond. Its firmware may not support USB transfer yet." + RELEASE_PORT_HINT);
    }
    if (status === 1) throw new Error('Spotykach is busy (loading, saving or recording). Finish that and try again.');
    if (status === 2) throw new Error('No SD card found in Spotykach.');
    if (status !== 0) throw new Error(`Spotykach refused transfer mode (${status}).`);
}

export interface Connection {
    link: SkLink;
    hello: HelloInfo;
}

/** Opens the port and checks HELLO; refuses another protocol major version. */
async function handshake(port: SerialPort): Promise<Connection> {
    const link = await SkLink.open(port);
    try {
        const hello = await link.hello();
        if (hello.protoMajor !== PROTO_MAJOR) {
            await link.exit();
            throw new Error(`Spotykach uses transfer protocol ${hello.protoMajor}.${hello.protoMinor}; WAV Builder supports ${PROTO_MAJOR}.x. Update WAV Builder or the firmware.`);
        }
        console.info(`[usb] connected: firmware ${hello.firmware}, protocol ${hello.protoMajor}.${hello.protoMinor}`);
        link.startKeepAlive();
        return { link, hello };
    } catch (e) {
        await link.close();
        throw e;
    }
}

/**
 * Connects to a Spotykach: reuses a port that's already in transfer mode (e.g.
 * after a reload), otherwise sends the SysEx and waits for the serial port.
 * On first use, when the click that started this has expired, throws
 * `NeedsAuthorizationError`; call `authorizePort()` from a fresh click.
 */
export async function connect(): Promise<Connection> {
    if (!isUsbTransferSupported()) {
        throw new Error('USB transfer needs Web Serial and Web MIDI: use a Chromium-based browser (Chrome, Edge, Opera) on a computer.');
    }

    const existing = await grantedPort();
    if (existing) {
        try {
            return await handshake(existing);
        } catch {
            // Not in transfer mode after all (a stale grant): switch it.
        }
    }

    try {
        await enterTransferMode();
    } catch (e) {
        // Possibly already in transfer mode with a port this browser hasn't been granted yet.
        if (e instanceof MidiPortNotFoundError && navigator.userActivation?.isActive) {
            try {
                return await authorizePort();
            } catch {
                throw e;
            }
        }
        throw e;
    }
    const port = await waitForPort(2500);
    if (port) return handshake(port);

    // The Connect click still counts as a user gesture for about 5 s.
    if (navigator.userActivation?.isActive) return authorizePort();
    throw new NeedsAuthorizationError();
}

/** Shows Chrome's port picker; must run from a click. The device waits up to 60 s for the first frame. */
export async function authorizePort(): Promise<Connection> {
    const port = await navigator.serial!.requestPort({ filters: [{ usbVendorId: USB_VENDOR_ID, usbProductId: USB_PRODUCT_ID }] });
    return handshake(port);
}
