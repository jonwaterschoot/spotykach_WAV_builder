import type { WavMetadata } from '../../types';

/**
 * The one place WAV Builder lays out a hardware WAV's chunks. Both encoders —
 * `encodeWAV` (editor, Browse, presets) and `convertAudioToWav` (ffmpeg export) —
 * build their bytes here, so they can't drift apart.
 *
 * Layout: RIFF/WAVE, `fmt `, `LIST/INFO` (IART, INAM, ITMP, ICMT), `data`, `cue `.
 *
 * - `LIST` sits before `data` so a 4 KB header read (the firmware's USB LIST, or
 *   our own) finds the name and our id without touching the audio. Release
 *   firmware skips chunks it doesn't know until it has `fmt ` and `data`, within
 *   its first 32 KB read, so this is safe there too.
 * - `cue ` stays after `data`: release firmware compares cue points found before
 *   `data` against a byte limit instead of frames.
 *
 * See docs/usbuploader/usb-transfer-plan.md and `npm run check:wav`.
 */

/** The firmware's `kMaxNameLength`: INAM bytes the USB LIST reports. */
export const MAX_INAM_BYTES = 64;

const SAMPLE_RATE = 48000;
const CHANNELS = 2;
const BYTES_PER_SAMPLE = 4;
const BLOCK_ALIGN = CHANNELS * BYTES_PER_SAMPLE;

const encoder = new TextEncoder();

/**
 * UTF-8 bytes of `text`, cut to at most `maxBytes` at a character boundary.
 * Same rule as `utf8Truncate()` in Vlad's uploader page, so a name cut by either
 * tool comes out the same.
 */
export function utf8Truncate(text: string, maxBytes: number): Uint8Array {
    let bytes = encoder.encode(text);
    while (bytes.length > maxBytes) {
        text = text.slice(0, -1);
        bytes = encoder.encode(text);
    }
    return bytes;
}

function ascii(view: DataView, offset: number, text: string) {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}

/**
 * One INFO sub-chunk: id, size, the bytes NUL-terminated, padded to even length.
 * `extraNuls` adds terminator bytes inside the size, which every reader strips.
 */
function infoSubChunk(id: string, value: Uint8Array, extraNuls = 0): Uint8Array {
    const size = value.length + 1 + extraNuls;
    const out = new Uint8Array(8 + size + (size % 2));
    const view = new DataView(out.buffer);
    ascii(view, 0, id);
    view.setUint32(4, size, true);
    out.set(value, 8);
    return out;
}

/** The `LIST/INFO` chunk, or an empty array when there is nothing to say. */
export function buildInfoChunk(metadata?: WavMetadata): Uint8Array {
    if (!metadata) return new Uint8Array(0);

    const artist = encoder.encode('Spotykach Builder');
    const subs: Uint8Array[] = [infoSubChunk('IART', artist)];

    const name = metadata.name ? utf8Truncate(metadata.name, MAX_INAM_BYTES) : null;
    if (name?.length) subs.push(infoSubChunk('INAM', name));

    if (metadata.tempo) subs.push(infoSubChunk('ITMP', encoder.encode(metadata.tempo.toString())));

    if (metadata.id || metadata.hash || metadata.processing || metadata.tempo) {
        const json = JSON.stringify({
            id: metadata.id,
            h: metadata.hash, // Shorten keys
            p: metadata.processing, // Processing flags
            t: metadata.tempo,
        });
        subs.push(infoSubChunk('ICMT', encoder.encode(json)));
    }

    // The audio must start on a multiple of 4 bytes. The firmware seeks to it and
    // f_reads straight into its buffer; FatFs then has the SD DMA write whole
    // sectors at buffer + (512 - start % 512), and libDaisy's SD_read hands that
    // address to the SDMMC IDMA as is. The IDMA needs it word-aligned: a start of
    // 2 mod 4 shifts every sample by two bytes, and the garbage floats (NaNs
    // among them) take down the whole audio engine. RIFF (12) + fmt (24) + data
    // header (8) is 44, so the LIST chunk must be a multiple of 4 too. Every
    // sub-chunk is even, so it is off by 2 at most: two more NULs in IART fix it.
    if ((12 + subs.reduce((n, s) => n + s.length, 0)) % 4 !== 0) {
        subs[0] = infoSubChunk('IART', artist, 2);
    }

    // Every sub-chunk is even, and so is "INFO": the body needs no pad byte.
    const bodySize = 4 + subs.reduce((n, s) => n + s.length, 0);
    const out = new Uint8Array(8 + bodySize);
    const view = new DataView(out.buffer);
    ascii(view, 0, 'LIST');
    view.setUint32(4, bodySize, true);
    ascii(view, 8, 'INFO');
    let offset = 12;
    for (const sub of subs) {
        out.set(sub, offset);
        offset += sub.length;
    }
    return out;
}

/** The `cue ` chunk for slice points in seconds, or an empty array when there are none. */
export function buildCueChunk(slicePoints: number[] | undefined, sampleRate = SAMPLE_RATE): Uint8Array {
    const points = slicePoints ?? [];
    if (points.length === 0) return new Uint8Array(0);

    const bodySize = 4 + points.length * 24;
    const out = new Uint8Array(8 + bodySize);
    const view = new DataView(out.buffer);
    ascii(view, 0, 'cue ');
    view.setUint32(4, bodySize, true);
    view.setUint32(8, points.length, true); // dwCuePoints

    points.forEach((point, index) => {
        const o = 12 + index * 24;
        view.setUint32(o, index + 1, true); // dwIdentifier
        view.setUint32(o + 4, 0, true); // dwPosition
        ascii(view, o + 8, 'data'); // fccChunk
        view.setUint32(o + 12, 0, true); // dwChunkStart
        view.setUint32(o + 16, 0, true); // dwBlockStart
        view.setUint32(o + 20, Math.round(point * sampleRate), true); // dwSampleOffset
    });
    return out;
}

export interface WavHeaderOptions {
    /** Stereo frames in the `data` chunk. */
    frames: number;
    sampleRate?: number;
    /** Bytes of the chunks written after `data` (the cue chunk), for the RIFF size. */
    trailingBytes?: number;
}

/**
 * Everything before the audio: RIFF/WAVE, `fmt ` (32-bit float, stereo), the
 * `LIST/INFO` chunk, and the `data` chunk header. The caller appends the
 * interleaved samples and then the cue chunk.
 */
export function buildWavHeader(metadata: WavMetadata | undefined, options: WavHeaderOptions): Uint8Array {
    const sampleRate = options.sampleRate ?? SAMPLE_RATE;
    const dataSize = options.frames * BLOCK_ALIGN;
    const info = buildInfoChunk(metadata);

    const headerSize = 12 + 24 + info.length + 8;
    const riffSize = headerSize - 8 + dataSize + (options.trailingBytes ?? 0);

    const out = new Uint8Array(headerSize);
    const view = new DataView(out.buffer);
    ascii(view, 0, 'RIFF');
    view.setUint32(4, riffSize, true);
    ascii(view, 8, 'WAVE');

    ascii(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // Plain WAVEFORMAT: the hardware rejects EXTENSIBLE
    view.setUint16(20, 3, true); // IEEE float
    view.setUint16(22, CHANNELS, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * BLOCK_ALIGN, true); // Byte rate
    view.setUint16(32, BLOCK_ALIGN, true);
    view.setUint16(34, BYTES_PER_SAMPLE * 8, true); // Bits per sample

    out.set(info, 36);

    const dataOffset = 36 + info.length;
    ascii(view, dataOffset, 'data');
    view.setUint32(dataOffset + 4, dataSize, true);
    return out;
}

/**
 * A complete hardware WAV from interleaved stereo float32 bytes. The samples are
 * passed through as a Blob part, not copied into a new buffer.
 */
export function assembleWav(pcm: BlobPart & { byteLength: number }, metadata?: WavMetadata, sampleRate = SAMPLE_RATE): Blob {
    const cue = buildCueChunk(metadata?.slicePoints, sampleRate);
    const header = buildWavHeader(metadata, {
        frames: Math.floor(pcm.byteLength / BLOCK_ALIGN),
        sampleRate,
        trailingBytes: cue.length,
    });
    return new Blob([header as BlobPart, pcm, cue as BlobPart], { type: 'audio/wav' });
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export interface WavHeaderInfo {
    /** Frames in `data`, when `fmt ` and `data` were both found. */
    frames?: number;
    /** From `fmt `, when found. */
    sampleRate?: number;
    /** Byte offset of the audio, when `data` was found. Must be a multiple of 4 on the card. */
    dataOffset?: number;
    /** Our `LIST/INFO` and `cue ` contents, or null when the file has none. */
    metadata: WavMetadata | null;
}

const decoder = new TextDecoder('utf-8');

function readId(view: DataView, offset: number): string {
    return String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));
}

/** A sub-chunk's text, trailing NULs dropped. */
function readText(bytes: Uint8Array): string {
    let end = bytes.length;
    while (end > 0 && bytes[end - 1] === 0) end--;
    return decoder.decode(bytes.subarray(0, end));
}

/**
 * Frame count, sample rate and our metadata (`ICMT` id/hash/processing/tempo,
 * `INAM` name, `ITMP`, cue points) from a WAV. Never reads the audio.
 *
 * `source` can be the whole file or part of one:
 * - the first few KB (a header read): `LIST` before `data` is found, and
 *   `frames` comes from the `data` size even though the audio isn't there;
 * - the bytes after the audio (the tail read for files written by 4.1.3 and
 *   earlier, with `LIST` after `data`): no RIFF header, so the walk starts at 0.
 */
export async function readWavHeaderInfo(source: Blob | ArrayBuffer): Promise<WavHeaderInfo> {
    const blob = source instanceof Blob ? source : new Blob([source]);
    const size = blob.size;
    const metadata: WavMetadata = {};
    let foundAny = false;
    let frames: number | undefined;
    let sampleRate: number | undefined;
    let dataOffset: number | undefined;
    let blockAlign = 0;

    let offset = 0;
    const start = new DataView(await blob.slice(0, 12).arrayBuffer());
    if (start.byteLength >= 12 && readId(start, 0) === 'RIFF') {
        if (readId(start, 8) !== 'WAVE') return { metadata: null };
        offset = 12;
    }

    while (offset + 8 <= size) {
        const header = new DataView(await blob.slice(offset, offset + 8).arrayBuffer());
        const chunkId = readId(header, 0);
        const chunkSize = header.getUint32(4, true);
        const next = offset + 8 + chunkSize + (chunkSize % 2);

        if (chunkId === 'data') {
            if (blockAlign) frames = Math.floor(chunkSize / blockAlign);
            dataOffset = offset + 8;
        } else if (chunkId === 'fmt ' || chunkId === 'LIST' || chunkId === 'cue ') {
            // A partial read can end inside a chunk: parse what is there.
            const body = new Uint8Array(await blob.slice(offset + 8, Math.min(offset + 8 + chunkSize, size)).arrayBuffer());
            const view = new DataView(body.buffer);

            if (chunkId === 'fmt ' && body.length >= 16) {
                sampleRate = view.getUint32(4, true);
                blockAlign = view.getUint16(12, true);
            } else if (chunkId === 'LIST' && body.length >= 4 && readId(view, 0) === 'INFO') {
                let sub = 4;
                while (sub + 8 <= body.length) {
                    const subId = readId(view, sub);
                    const subSize = view.getUint32(sub + 4, true);
                    const value = body.subarray(sub + 8, Math.min(sub + 8 + subSize, body.length));

                    if (subId === 'ICMT') {
                        try {
                            const payload = JSON.parse(readText(value));
                            if (payload.id) metadata.id = payload.id;
                            if (payload.h) metadata.hash = payload.h;
                            if (payload.p) metadata.processing = payload.p;
                            if (payload.t) metadata.tempo = payload.t;
                            foundAny = true;
                        } catch { /* not ours */ }
                    } else if (subId === 'ITMP') {
                        const t = parseFloat(readText(value));
                        if (!isNaN(t)) {
                            metadata.tempo = t;
                            foundAny = true;
                        }
                    } else if (subId === 'INAM' && metadata.name === undefined) {
                        // The first INAM wins, as on the firmware.
                        const name = readText(value);
                        if (name) {
                            metadata.name = name;
                            foundAny = true;
                        }
                    }
                    sub += 8 + subSize + (subSize % 2);
                }
            } else if (chunkId === 'cue ' && body.length >= 4) {
                const numPoints = view.getUint32(0, true);
                const points: number[] = [];
                // Sanity check numPoints to avoid infinite loops or memory issues
                const safeNumPoints = Math.min(numPoints, 100);
                for (let i = 0; i < safeNumPoints; i++) {
                    const record = 4 + i * 24;
                    if (record + 24 <= body.length) {
                        points.push(+(view.getUint32(record + 20, true) / SAMPLE_RATE).toFixed(3));
                    }
                }
                if (points.length > 0) {
                    metadata.slicePoints = points;
                    foundAny = true;
                }
            }
        }

        offset = next;
    }

    if (foundAny && frames !== undefined) metadata.frames = frames;
    return { frames, sampleRate, dataOffset, metadata: foundAny ? metadata : null };
}
