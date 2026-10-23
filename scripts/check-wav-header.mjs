#!/usr/bin/env node
/**
 * Firmware-parity check for the WAV files WAV Builder writes to the card.
 *
 *   node scripts/check-wav-header.mjs        (or: npm run check:wav)
 *
 * Ports the Spotykach firmware's WAV parsing to JS and runs every encoder
 * output and test vector through it:
 *
 *   - release firmware: wav_header() + Card::read_audio() cue tail read
 *     (Synthux-Academy/Spotykach main @ 7da8061, src/memory/wav.cpp, src/hw/card.cpp)
 *   - uploader firmware: the same load path with its fixes, plus wav_info() /
 *     wav_cue_count() as used by the USB LIST command
 *     (uploader @ 550d80b, src/memory/wav.cpp, src/transfer/service.cpp)
 *
 * When upstream moves, re-port the functions below and update these commits
 * (see docs/usbuploader/usb-transfer-plan.md, "Tracking upstream").
 *
 * Needs Node 22.18+ / 23.6+ (imports src/lib/audio/wavEncoder.ts directly via
 * Node's built-in TypeScript type stripping). Exits 1 on any failure.
 */

// ---------------------------------------------------------------------------
// Firmware constants
// ---------------------------------------------------------------------------

const KCHUNK = 32768;           // Card::kChunk, both branches
const LIST_HEADER_READ = 4096;  // service.cpp kListHeaderRead
const LIST_TAIL_READ = 8192;    // service.cpp kListTailRead
const MAX_NAME_LENGTH = 64;     // service.cpp kMaxNameLength
const MAX_FILE_CUES = 255;      // config.h kMaxFileCuePoints (uploader)
// Deck buffer size passed as cue_limit / body_size. Assumed here; HELLO's
// max_frames reports the real figure. Only the cue-before-data vector depends on it.
const DECK_BODY_BYTES = 16 * 1024 * 1024;

// Phase 1 moved LIST before data in both encoders: an encoder that writes it
// after data again fails instead of warning.
const REQUIRE_LIST_BEFORE_DATA = true;

// ---------------------------------------------------------------------------
// Byte helpers. Reads past the end return 0, like a zero-filled card buffer.
// ---------------------------------------------------------------------------

const u8 = (b, o) => (o >= 0 && o < b.length ? b[o] : 0);
const u16 = (b, o) => u8(b, o) | (u8(b, o + 1) << 8);
const u32 = (b, o) => (u16(b, o) | (u16(b, o + 2) << 16)) >>> 0;
const fourcc = (b, o) => String.fromCharCode(u8(b, o), u8(b, o + 1), u8(b, o + 2), u8(b, o + 3));

/** f_lseek + f_read into a fixed-size buffer: returns { buf, got }. */
function readAt(file, offset, len) {
    const buf = new Uint8Array(len);
    const got = Math.max(0, Math.min(len, file.length - offset));
    if (got > 0) buf.set(file.subarray(offset, offset + got));
    return { buf, got };
}

// ---------------------------------------------------------------------------
// Release firmware (main @ 7da8061)
// ---------------------------------------------------------------------------

function mainReadCuePoints(b, limit, cursor, out) {
    const numPoints = u32(b, cursor);
    const count = Math.min(numPoints, 256);
    let added = 0;
    for (let i = 0; i < count; i++) {
        const point = u32(b, cursor + 24 + i * 24); // size_t is 32-bit on the Daisy
        if (point < limit) {
            out[i] = point; // stored at index i, not compacted
            added++;
        }
    }
    return added;
}

function mainFindCuePoints(b, limit, size, state) {
    let cursor = 0;
    while (cursor <= size) {
        const id = fourcc(b, cursor);
        const chunkSize = u32(b, cursor + 4);
        cursor += 8;
        if (id === 'cue ') state.count = mainReadCuePoints(b, limit, cursor, state.points);
        cursor += chunkSize + (chunkSize % 2);
    }
}

function mainWavHeader(b, size, cueLimit, state) {
    let cursor = 0;
    if (size < 12 || fourcc(b, cursor) !== 'RIFF') return null;
    cursor += 8;
    if (fourcc(b, cursor) !== 'WAVE') return null;
    cursor += 4;

    const h = {};
    let foundFmt = false, foundData = false;
    while (cursor <= size && !(foundFmt && foundData)) {
        const id = fourcc(b, cursor);
        const chunkSize = u32(b, cursor + 4);
        cursor += 8;
        if (id === 'fmt ' && chunkSize >= 16) {
            h.audioFormat = u16(b, cursor);
            h.channels = u16(b, cursor + 2);
            h.sampleRate = u32(b, cursor + 4);
            h.blockAlign = u16(b, cursor + 12);
            h.bitsPerSample = u16(b, cursor + 14);
            foundFmt = true;
        } else if (id === 'data') {
            h.dataSize = chunkSize;
            h.headerSize = cursor;
            cueLimit = Math.floor(chunkSize / (h.blockAlign || 1));
            foundData = true;
        } else if (id === 'cue ') {
            // Before "data" the limit is still the deck size in bytes: the bug uploader fixes.
            state.count = mainReadCuePoints(b, cueLimit, cursor, state.points);
        }
        cursor += chunkSize + (chunkSize % 2);
    }
    return foundFmt && foundData ? h : null;
}

/** Card::init_read_audio + read_audio on release firmware. */
function loadOnMain(file) {
    const state = { points: [], count: 0 };
    const { buf } = readAt(file, 0, KCHUNK);
    const h = mainWavHeader(buf, KCHUNK, DECK_BODY_BYTES, state);
    if (!h) return { ok: false, reason: 'wav_header() found no fmt/data in the first 32 KB' };
    if (!isLoadableHeader(h)) return { ok: false, reason: `format rejected (${describeFormat(h)})` };

    const audioSize = Math.min(DECK_BODY_BYTES, h.dataSize);
    const offset = Math.min(audioSize, Math.max(0, file.length - h.headerSize));
    const frames = Math.floor(offset * 0.125);

    // Release seeks to hdr_size + audio_size (unpadded) for the cue tail.
    const tail = readAt(file, h.headerSize + audioSize, KCHUNK);
    mainFindCuePoints(tail.buf, Math.floor(audioSize / 8), tail.got, state);
    const cues = state.points.slice(0, state.count);
    return { ok: true, frames, cues };
}

// ---------------------------------------------------------------------------
// Uploader firmware (uploader @ 550d80b)
// ---------------------------------------------------------------------------

function upReadCuePoints(b, size, limit, cursor) {
    const out = [];
    if (cursor + 4 > size) return out;
    const numPoints = u32(b, cursor);
    for (let i = 0; i < numPoints && out.length < MAX_FILE_CUES; i++) {
        const pointOffset = cursor + 4 + i * 24 + 20;
        if (pointOffset + 4 > size) break;
        const point = u32(b, pointOffset);
        if (point < limit) out.push(point);
    }
    return out.sort((a, b) => a - b);
}

function upFindCuePoints(b, limit, size, state) {
    let cursor = 0;
    while (cursor + 8 <= size) {
        const id = fourcc(b, cursor);
        const chunkSize = u32(b, cursor + 4);
        cursor += 8;
        if (id === 'cue ') state.cues = upReadCuePoints(b, size, limit, cursor);
        const next = cursor + chunkSize + (chunkSize % 2);
        if (next > size) break;
        cursor = next;
    }
}

function upWavHeader(b, size, cueLimit, state) {
    let cursor = 0;
    if (size < 12 || fourcc(b, cursor) !== 'RIFF') return null;
    cursor += 8;
    if (fourcc(b, cursor) !== 'WAVE') return null;
    cursor += 4;

    const h = {};
    let foundFmt = false, foundData = false;
    while (cursor + 8 <= size && !(foundFmt && foundData)) {
        const id = fourcc(b, cursor);
        const chunkSize = u32(b, cursor + 4);
        cursor += 8;
        if (id === 'fmt ' && chunkSize >= 16) {
            h.audioFormat = u16(b, cursor);
            h.channels = u16(b, cursor + 2);
            h.sampleRate = u32(b, cursor + 4);
            h.blockAlign = u16(b, cursor + 12);
            h.bitsPerSample = u16(b, cursor + 14);
            foundFmt = true;
        } else if (id === 'data') {
            h.dataSize = chunkSize;
            h.headerSize = cursor;
            if (foundFmt && h.blockAlign) cueLimit = Math.floor(chunkSize / h.blockAlign);
            foundData = true;
        } else if (id === 'cue ') {
            const limit = !foundData && foundFmt && h.blockAlign ? Math.floor(cueLimit / h.blockAlign) : cueLimit;
            state.cues = upReadCuePoints(b, size, limit, cursor);
        }
        const next = cursor + chunkSize + (chunkSize % 2);
        if (next > size) break;
        cursor = next;
    }
    return foundFmt && foundData ? h : null;
}

/** Card::init_read_audio + read_audio on uploader firmware. */
function loadOnUploader(file) {
    const state = { cues: [] };
    const { buf } = readAt(file, 0, KCHUNK);
    const h = upWavHeader(buf, KCHUNK, DECK_BODY_BYTES, state);
    if (!h) return { ok: false, reason: 'wav_header() found no fmt/data in the first 32 KB' };
    if (!isLoadableHeader(h)) return { ok: false, reason: `format rejected (${describeFormat(h)})` };

    const audioSize = Math.min(DECK_BODY_BYTES, h.dataSize);
    const offset = Math.min(audioSize, Math.max(0, file.length - h.headerSize));
    const frames = Math.floor(offset * 0.125);

    const tail = readAt(file, h.headerSize + h.dataSize + (h.dataSize % 2), KCHUNK);
    upFindCuePoints(tail.buf, frames, tail.got, state);
    return { ok: true, frames, cues: state.cues };
}

function readInfoName(b, cursor, end) {
    while (cursor + 8 <= end) {
        const subSize = u32(b, cursor + 4);
        if (fourcc(b, cursor) === 'INAM') {
            let length = Math.min(subSize, end - (cursor + 8), MAX_NAME_LENGTH);
            const name = b.slice(cursor + 8, cursor + 8 + length);
            while (length > 0 && name[length - 1] === 0) length--;
            return name.slice(0, length);
        }
        const next = cursor + 8 + subSize + (subSize % 2);
        if (next > end) break;
        cursor = next;
    }
    return null;
}

function wavInfo(b, size) {
    if (size < 12 || fourcc(b, 0) !== 'RIFF' || fourcc(b, 8) !== 'WAVE') return null;
    const info = { cueCount: 0, name: new Uint8Array(0) };
    let foundFmt = false;
    let cursor = 12;
    while (cursor + 8 <= size) {
        const id = fourcc(b, cursor);
        const chunkSize = u32(b, cursor + 4);
        const body = cursor + 8;
        if (id === 'fmt ' && chunkSize >= 16 && body + 16 <= size) {
            info.audioFormat = u16(b, body);
            info.channels = u16(b, body + 2);
            info.sampleRate = u32(b, body + 4);
            info.blockAlign = u16(b, body + 12);
            info.bitsPerSample = u16(b, body + 14);
            foundFmt = true;
        } else if (id === 'data') {
            info.dataOffset = body;
            info.dataSize = chunkSize;
            return foundFmt ? info : null;
        } else if (id === 'LIST' && body + 4 <= size && fourcc(b, body) === 'INFO') {
            const name = readInfoName(b, body + 4, Math.min(body + chunkSize, size));
            if (name) info.name = name;
        } else if (id === 'cue ' && body + 4 <= size) {
            info.cueCount = Math.min(u32(b, body), 0xffff);
        }
        const next = body + chunkSize + (chunkSize % 2);
        if (next > size) break;
        cursor = next;
    }
    return null;
}

function wavCueCount(b, size) {
    let cursor = 0;
    while (cursor + 8 <= size) {
        const chunkSize = u32(b, cursor + 4);
        if (fourcc(b, cursor) === 'cue ' && cursor + 12 <= size) return Math.min(u32(b, cursor + 8), 0xffff);
        const next = cursor + 8 + chunkSize + (chunkSize % 2);
        if (next > size) break;
        cursor = next;
    }
    return 0;
}

/** Service::_list_entry: what the USB LIST command reports for one slot. */
function listEntry(file) {
    let { buf, got } = readAt(file, 0, LIST_HEADER_READ);
    let info = wavInfo(buf, got);
    let usedFallback = false;
    if (!info && got === LIST_HEADER_READ) {
        // Large chunks before "data", look further
        ({ buf, got } = readAt(file, 0, KCHUNK));
        info = wavInfo(buf, got);
        usedFallback = true;
    }
    if (!info) return { parsed: false, loadable: false, usedFallback, name: new Uint8Array(0), cueCount: 0, frames: 0 };

    let cueCount = info.cueCount;
    const dataEnd = info.dataOffset + info.dataSize + (info.dataSize % 2);
    if (dataEnd < file.length) {
        const tail = readAt(file, dataEnd, LIST_TAIL_READ);
        cueCount = Math.max(cueCount, wavCueCount(tail.buf, tail.got));
    }
    const loadable = info.audioFormat === 3 && info.channels === 2 && info.sampleRate === 48000
        && info.bitsPerSample === 32 && info.blockAlign === 8 && info.dataSize > 0;
    return {
        parsed: true,
        loadable,
        usedFallback,
        frames: info.blockAlign ? Math.floor(info.dataSize / info.blockAlign) : 0,
        cueCount,
        name: info.name.slice(0, MAX_NAME_LENGTH),
    };
}

function isLoadableHeader(h) {
    return h.channels === 2 && h.bitsPerSample === 32 && h.sampleRate === 48000 && h.audioFormat === 3 && h.dataSize > 0;
}

function describeFormat(h) {
    return `format ${h.audioFormat}, ${h.channels} ch, ${h.sampleRate} Hz, ${h.bitsPerSample} bit`;
}

// ---------------------------------------------------------------------------
// WAV Builder side: structure, LIST/INFO reads (header and the plan's tail read)
// ---------------------------------------------------------------------------

/** Walks the whole file; returns chunk order and problems with the RIFF layout. */
function walkChunks(file) {
    const problems = [];
    const chunks = [];
    if (fourcc(file, 0) !== 'RIFF' || fourcc(file, 8) !== 'WAVE') return { chunks, problems: ['not RIFF/WAVE'] };
    if (u32(file, 4) !== file.length - 8) problems.push(`RIFF size ${u32(file, 4)} != file length - 8 (${file.length - 8})`);
    let cursor = 12;
    while (cursor + 8 <= file.length) {
        const id = fourcc(file, cursor);
        const size = u32(file, cursor + 4);
        chunks.push({ id, offset: cursor, size });
        cursor += 8 + size + (size % 2);
    }
    if (cursor !== file.length) problems.push(`chunks end at ${cursor}, file is ${file.length} bytes`);
    return { chunks, problems };
}

/** All LIST/INFO sub-chunks in [start, end), decoded as UTF-8 with trailing NULs dropped. */
function readInfo(file, start, end, { stopAtData }) {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const info = {};
    let cursor = start;
    while (cursor + 8 <= end) {
        const id = fourcc(file, cursor);
        const size = u32(file, cursor + 4);
        if (id === 'data' && stopAtData) break;
        if (id === 'LIST' && fourcc(file, cursor + 8) === 'INFO') {
            let sub = cursor + 12;
            const listEnd = Math.min(cursor + 8 + size, end);
            while (sub + 8 <= listEnd) {
                const subId = fourcc(file, sub);
                const subSize = u32(file, sub + 4);
                let bytes = file.slice(sub + 8, Math.min(sub + 8 + subSize, listEnd));
                let len = bytes.length;
                while (len > 0 && bytes[len - 1] === 0) len--;
                bytes = bytes.slice(0, len);
                try { info[subId] = decoder.decode(bytes); } catch { info[subId] = { invalidUtf8: bytes }; }
                sub += 8 + subSize + (subSize % 2);
            }
        }
        cursor += 8 + size + (size % 2);
    }
    return info;
}

/** USB header read: DOWNLOAD_READ offset 0, 4 KB. */
const infoFromHeaderRead = (file) => readInfo(file.subarray(0, LIST_HEADER_READ), 12, Math.min(LIST_HEADER_READ, file.length), { stopAtData: true });

/** The plan's legacy tail read: from 44 + frames * 8 to the end of the file. */
const infoFromTailRead = (file, frames) => readInfo(file, 44 + frames * 8, file.length, { stopAtData: false });

/** Same rule as utf8Truncate() in Vlad's web/index.html. */
function utf8Truncate(text, maxBytes) {
    const enc = new TextEncoder();
    let bytes = enc.encode(text);
    while (bytes.length > maxBytes) {
        text = text.slice(0, -1);
        bytes = enc.encode(text);
    }
    return bytes;
}

// ---------------------------------------------------------------------------
// Reference builder for the target layout (Phase 1 spec):
// RIFF/WAVE, fmt, LIST/INFO (IART, INAM, ITMP, ICMT), data, cue
// ---------------------------------------------------------------------------

function infoSubChunk(id, bytes, extraNuls = 0) {
    const size = bytes.length + 1 + extraNuls; // NUL-terminated
    const out = new Uint8Array(8 + size + (size % 2));
    out.set(new TextEncoder().encode(id), 0);
    new DataView(out.buffer).setUint32(4, size, true);
    out.set(bytes, 8);
    return out;
}

function concat(parts) {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
}

function chunk(id, body) {
    const out = new Uint8Array(8 + body.length + (body.length % 2));
    out.set(new TextEncoder().encode(id), 0);
    new DataView(out.buffer).setUint32(4, body.length, true);
    out.set(body, 8);
    return out;
}

function fmtChunk() {
    const body = new Uint8Array(16);
    const v = new DataView(body.buffer);
    v.setUint16(0, 3, true); v.setUint16(2, 2, true); v.setUint32(4, 48000, true);
    v.setUint32(8, 48000 * 8, true); v.setUint16(12, 8, true); v.setUint16(14, 32, true);
    return chunk('fmt ', body);
}

function listChunk({ name, tempo, icmt, padTo }) {
    const enc = new TextEncoder();
    const subs = [infoSubChunk('IART', enc.encode('Spotykach Builder'))];
    const nameBytes = name ? utf8Truncate(name, MAX_NAME_LENGTH) : null;
    if (nameBytes?.length) subs.push(infoSubChunk('INAM', nameBytes));
    if (tempo) subs.push(infoSubChunk('ITMP', enc.encode(String(tempo))));
    if (icmt) subs.push(infoSubChunk('ICMT', enc.encode(JSON.stringify(icmt))));
    if (padTo) subs.push(infoSubChunk('ISFT', new Uint8Array(padTo).fill(0x78)));
    // Keep the audio on a multiple of 4: two more NULs in IART, as wavHeader.ts does.
    if ((12 + subs.reduce((n, s) => n + s.length, 0)) % 4 !== 0) subs[0] = infoSubChunk('IART', enc.encode('Spotykach Builder'), 2);
    return chunk('LIST', concat([enc.encode('INFO'), ...subs]));
}

function cueChunk(points) {
    const body = new Uint8Array(4 + points.length * 24);
    const v = new DataView(body.buffer);
    v.setUint32(0, points.length, true);
    points.forEach((p, i) => {
        const o = 4 + i * 24;
        v.setUint32(o, i + 1, true);
        v.setUint32(o + 4, 0, true);
        body.set(new TextEncoder().encode('data'), o + 8);
        v.setUint32(o + 20, p, true);
    });
    return chunk('cue ', body);
}

function dataChunk(frames) {
    const body = new Uint8Array(frames * 8);
    const v = new DataView(body.buffer);
    for (let i = 0; i < frames; i++) {
        const s = Math.sin(i / 20) * 0.5;
        v.setFloat32(i * 8, s, true);
        v.setFloat32(i * 8 + 4, s, true);
    }
    return chunk('data', body);
}

function buildWav({ frames = 48000, list, cues = [], cueBeforeData = false }) {
    const parts = [fmtChunk()];
    if (list) parts.push(listChunk(list));
    if (cues.length && cueBeforeData) parts.push(cueChunk(cues));
    parts.push(dataChunk(frames));
    if (cues.length && !cueBeforeData) parts.push(cueChunk(cues));
    const body = concat(parts);
    const out = new Uint8Array(12 + body.length);
    out.set(new TextEncoder().encode('RIFF'), 0);
    new DataView(out.buffer).setUint32(4, 4 + body.length, true);
    out.set(new TextEncoder().encode('WAVE'), 8);
    out.set(body, 12);
    return out;
}

// ---------------------------------------------------------------------------
// Running the checks
// ---------------------------------------------------------------------------

let failures = 0;
let warnings = 0;

function report(title, file, expect) {
    const lines = [];
    const fails = [];
    const warns = [];
    const check = (cond, msg) => { if (!cond) fails.push(msg); };

    const { chunks, problems } = walkChunks(file);
    const order = chunks.map((c) => c.id.trim()).join(' > ');
    const dataIdx = chunks.findIndex((c) => c.id === 'data');
    const listIdx = chunks.findIndex((c) => c.id === 'LIST');
    const listBeforeData = listIdx >= 0 && listIdx < dataIdx;
    const headerBytes = dataIdx >= 0 ? chunks[dataIdx].offset + 8 : file.length;
    if (expect.structure !== false) problems.forEach((p) => fails.push(p));
    lines.push(`layout   ${order} · ${headerBytes} B before audio`);

    const main = loadOnMain(file);
    const up = loadOnUploader(file);
    const list = listEntry(file);
    const fmtLoad = (r) => (r.ok ? `loads · ${r.frames} frames · ${r.cues.length} cues` : `FAILS: ${r.reason}`);
    lines.push(`release  ${fmtLoad(main)}`);
    lines.push(`uploader ${fmtLoad(up)}`);

    let listName = '';
    let listNameValid = true;
    try { listName = new TextDecoder('utf-8', { fatal: true }).decode(list.name); } catch { listNameValid = false; }
    lines.push(`USB LIST ${list.parsed ? 'parsed' : 'not parsed'}${list.loadable ? ' · loadable' : ''}${list.usedFallback ? ' · needed 32 KB re-read' : ''}`
        + (list.parsed ? ` · ${list.frames} frames · ${list.cueCount} cues · name ${list.name.length ? JSON.stringify(listName) + ` (${list.name.length} B)` : '(none)'}` : ''));

    // Loading
    const loads = expect.loads ?? { main: true, uploader: true };
    check(main.ok === loads.main, `release firmware ${loads.main ? 'should load' : 'should reject'} this file`);
    check(up.ok === loads.uploader, `uploader firmware ${loads.uploader ? 'should load' : 'should reject'} this file`);
    if (expect.frames !== undefined) {
        if (main.ok) check(main.frames === expect.frames, `release frames ${main.frames} != ${expect.frames}`);
        if (up.ok) check(up.frames === expect.frames, `uploader frames ${up.frames} != ${expect.frames}`);
    }
    if (expect.cues !== undefined) {
        const want = expect.cues;
        if (main.ok) check(main.cues.length === (want.main ?? want), `release cue count ${main.cues.length} != ${want.main ?? want}`);
        if (up.ok) check(up.cues.length === (want.uploader ?? want), `uploader cue count ${up.cues.length} != ${want.uploader ?? want}`);
    }

    // USB LIST
    if (expect.listParsed !== undefined) check(list.parsed === expect.listParsed, `LIST parsed should be ${expect.listParsed}`);
    if (list.parsed) {
        if (expect.frames !== undefined) check(list.frames === expect.frames, `LIST frames ${list.frames} != ${expect.frames}`);
        if (expect.listCues !== undefined) check(list.cueCount === expect.listCues, `LIST cue count ${list.cueCount} != ${expect.listCues}`);
        check(list.loadable === (loads.uploader === true), `LIST loadable flag disagrees with the load path`);
        check(listNameValid, `LIST name is not valid UTF-8 (cut mid-character)`);
        check(list.name.length <= MAX_NAME_LENGTH, `LIST name longer than ${MAX_NAME_LENGTH} bytes`);
    }
    if (expect.name !== undefined) check(listName === expect.name, `LIST name ${JSON.stringify(listName)} != ${JSON.stringify(expect.name)}`);
    if (expect.fallback !== undefined) check(list.usedFallback === expect.fallback, `LIST ${expect.fallback ? 'should' : 'should not'} need the 32 KB re-read`);

    // Our metadata: header read for the new layout, tail read for the legacy one
    if (expect.icmt) {
        const frames = list.parsed ? list.frames : 0;
        const head = infoFromHeaderRead(file);
        const tail = infoFromTailRead(file, frames);
        const source = head.ICMT ? 'header read' : tail.ICMT ? 'tail read' : null;
        const raw = head.ICMT ?? tail.ICMT;
        lines.push(`ICMT     ${source ? `found by ${source}` : 'NOT FOUND'}`);
        check(source, 'ICMT not found by the 4 KB header read or the tail read');
        if (raw && typeof raw === 'string') {
            let parsed = null;
            try { parsed = JSON.parse(raw); } catch { fails.push('ICMT is not valid JSON'); }
            if (parsed) {
                for (const [k, v] of Object.entries(expect.icmt)) {
                    check(JSON.stringify(parsed[k]) === JSON.stringify(v), `ICMT.${k} ${JSON.stringify(parsed[k])} != ${JSON.stringify(v)}`);
                }
            }
        }
        if (expect.inam !== undefined) {
            check(head.INAM === expect.inam, `INAM from header read ${JSON.stringify(head.INAM)} != ${JSON.stringify(expect.inam)}`);
        }
    }

    // Layout rules from the plan
    // Audio must start on a multiple of 4: the SD DMA writes whole sectors into the
    // firmware's buffer at an offset set by the start, and needs it word-aligned.
    // Off by 2, every sample shifts by two bytes and the engine dies on the noise.
    if (dataIdx >= 0 && expect.unaligned !== true) {
        check(headerBytes % 4 === 0, `audio starts at byte ${headerBytes}, not a multiple of 4 (SD DMA misaligns, engine gets garbage)`);
    }
    if (expect.newLayout) {
        check(listBeforeData, 'LIST must come before data');
        check(headerBytes <= LIST_HEADER_READ, `header is ${headerBytes} B; keep it within the ${LIST_HEADER_READ} B LIST read`);
    }
    const cueIdx = chunks.findIndex((c) => c.id === 'cue ');
    if (expect.cueAfterData !== false && cueIdx >= 0) check(cueIdx > dataIdx, 'cue must come after data (release firmware bug)');
    if (expect.encoder && listIdx >= 0 && !listBeforeData) {
        const msg = 'LIST after data: USB LIST shows no name and needs a tail read for ICMT';
        if (REQUIRE_LIST_BEFORE_DATA) fails.push(msg); else warns.push(msg);
    }

    const status = fails.length ? 'FAIL' : warns.length ? 'warn' : ' ok ';
    console.log(`[${status}] ${title}`);
    for (const l of lines) console.log(`         ${l}`);
    for (const w of warns) console.log(`         warning: ${w}`);
    for (const f of fails) console.log(`         x ${f}`);
    failures += fails.length ? 1 : 0;
    warnings += warns.length ? 1 : 0;
}

// --- Real files: node scripts/check-wav-header.mjs D:/SK/B/1.WAV ... ---------

const fileArgs = process.argv.slice(2);
if (fileArgs.length) {
    const { readFileSync } = await import('node:fs');
    for (const path of fileArgs) {
        const file = new Uint8Array(readFileSync(path));
        const { chunks } = walkChunks(file);
        report(`${path} (${file.length} B)`, file, {});
        for (const c of chunks) console.log(`         chunk ${JSON.stringify(c.id)} at ${c.offset}, ${c.size} B`);
        const head = infoFromHeaderRead(file);
        if (Object.keys(head).length) console.log(`         INFO     ${JSON.stringify(head)}`);
    }
    process.exit(failures ? 1 : 0);
}

const ICMT = { id: '0b6f0c1e-6a43-4c1e-9d55-6f2f4b7e8a10', h: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', p: { normalize: true }, t: 120 };

// --- Target layout (what Phase 1 must produce) -----------------------------

console.log('\nTarget layout: fmt > LIST/INFO > data > cue\n');

report('ASCII name, tempo, ICMT, 3 cues', buildWav({
    frames: 48000, cues: [0, 12000, 24000],
    list: { name: 'kick.wav', tempo: 120, icmt: ICMT },
}), { newLayout: true, frames: 48000, cues: 3, listCues: 3, name: 'kick.wav', fallback: false, icmt: ICMT, inam: 'kick.wav' });

report('Non-ASCII name round-trips', buildWav({
    list: { name: 'Ø café 音.wav', icmt: ICMT },
}), { newLayout: true, frames: 48000, cues: 0, listCues: 0, name: 'Ø café 音.wav', icmt: ICMT, inam: 'Ø café 音.wav' });

{
    const longName = 'ab' + '音'.repeat(23); // 71 bytes; 64 falls inside a 3-byte character
    const cut = new TextDecoder().decode(utf8Truncate(longName, MAX_NAME_LENGTH));
    report(`71-byte name is cut at a character boundary (${new TextEncoder().encode(cut).length} B)`, buildWav({
        list: { name: longName, icmt: ICMT },
    }), { newLayout: true, frames: 48000, name: cut, icmt: ICMT, inam: cut });
}

report('No LIST, no cues', buildWav({}), { frames: 48000, cues: 0, listCues: 0, name: '' });

report(`${MAX_FILE_CUES} cues (kMaxFileCuePoints)`, buildWav({
    frames: 96000, cues: Array.from({ length: MAX_FILE_CUES }, (_, i) => i * 300),
    list: { name: 'many-cues.wav', icmt: ICMT },
}), { newLayout: true, frames: 96000, cues: MAX_FILE_CUES, listCues: MAX_FILE_CUES, name: 'many-cues.wav', icmt: ICMT });

// --- Edges that explain the plan's rules ------------------------------------

console.log('\nEdge cases (documenting firmware limits)\n');

report('6 KB LIST before data: LIST needs the 32 KB re-read', buildWav({
    list: { name: 'big-list.wav', icmt: ICMT, padTo: 6000 },
}), { frames: 48000, name: 'big-list.wav', fallback: true });

report('40 KB LIST before data: no firmware finds data', buildWav({
    list: { name: 'huge-list.wav', padTo: 40000 },
}), { loads: { main: false, uploader: false }, listParsed: false });

{
    const beyondDeck = Math.floor(DECK_BODY_BYTES / 8) + 1000; // past the deck in frames, inside it in bytes
    report('cue before data: release compares against bytes, uploader against frames', buildWav({
        cues: [1000, beyondDeck], cueBeforeData: true,
    }), { frames: 48000, cues: { main: 2, uploader: 1 }, cueAfterData: false });
}

// --- Real encoder output ----------------------------------------------------

console.log('\nEncoders\n');

const { encodeWAV } = await import('../src/lib/audio/wavEncoder.ts');

function fakeAudioBuffer(frames, channels) {
    const data = Array.from({ length: channels }, (_, c) => Float32Array.from({ length: frames }, (_, i) => Math.sin(i / (10 + c)) * 0.5));
    return { sampleRate: 48000, length: frames, numberOfChannels: channels, getChannelData: (c) => data[c] };
}

async function encoded(frames, channels, metadata) {
    return new Uint8Array(await encodeWAV(fakeAudioBuffer(frames, channels), metadata).arrayBuffer());
}

const encMeta = { id: ICMT.id, hash: ICMT.h, processing: ICMT.p, tempo: 120, slicePoints: [0, 0.25, 0.5], name: 'kick.wav' };

report('wavEncoder.ts: stereo, metadata, 3 slices', await encoded(48000, 2, encMeta),
    { encoder: true, newLayout: true, frames: 48000, cues: 3, listCues: 3, name: 'kick.wav', icmt: ICMT, inam: 'kick.wav' });

{
    const longName = 'ab' + '音'.repeat(23);
    const cut = new TextDecoder().decode(utf8Truncate(longName, MAX_NAME_LENGTH));
    report('wavEncoder.ts: 71-byte non-ASCII name', await encoded(4800, 2, { id: ICMT.id, name: longName }),
        { encoder: true, newLayout: true, frames: 4800, name: cut, icmt: { id: ICMT.id }, inam: cut });
}

// The file that broke the engine on hardware (Oct 11): its LIST put the audio at byte 234.
report('wavEncoder.ts: metadata of the Oct 11 card file whose audio started at byte 234',
    await encoded(4800, 2, { id: '8cda82fd-022c-41c2-8767-f7a493c32792', hash: '090f7cfa3038fcf54ecce48b02d382354883d573098c8c804bb14c2f652445bc', name: 'Acousmonium Piano' }),
    { encoder: true, newLayout: true, frames: 4800, name: 'Acousmonium Piano' });

{
    // Every name length, with and without tempo: the audio must always start on a multiple of 4.
    const bad = [];
    for (let len = 0; len <= 70; len++) {
        for (const tempo of [undefined, 120, 97.5]) {
            const wav = await encoded(16, 2, { id: ICMT.id, hash: ICMT.h, tempo, name: 'x'.repeat(len) });
            const { chunks } = walkChunks(wav);
            const data = chunks.find((c) => c.id === 'data');
            if ((data.offset + 8) % 4 !== 0) bad.push(`name ${len} B, tempo ${tempo}: audio at ${data.offset + 8}`);
        }
    }
    console.log(`[${bad.length ? 'FAIL' : ' ok '}] wavEncoder.ts: audio starts on a multiple of 4 for every name length 0–70`);
    for (const b of bad.slice(0, 5)) console.log(`         x ${b}`);
    failures += bad.length ? 1 : 0;
}

report('wavEncoder.ts: mono source', await encoded(24000, 1, { id: ICMT.id, slicePoints: [0.1] }),
    { encoder: true, frames: 24000, cues: 2, listCues: 2, icmt: { id: ICMT.id } }); // 0 added before the 0.1 s marker

report('wavEncoder.ts: no metadata', await encoded(4800, 2, undefined),
    { encoder: true, frames: 4800, cues: 0, listCues: 0, name: '' });

// useAudioConverter.ts is a React hook around ffmpeg-wasm and can't run here. It
// hands ffmpeg's raw f32le output to assembleWav(pcm, metadata, 48000), so that
// call stands in for it.
const { assembleWav, readWavHeaderInfo } = await import('../src/lib/audio/wavHeader.ts');
{
    const pcm = new Uint8Array(await encoded(48000, 2, undefined)).slice(44); // bare 44-byte header
    const wav = new Uint8Array(await assembleWav(pcm, encMeta, 48000).arrayBuffer());
    report('assembleWav (ffmpeg export path)', wav,
        { encoder: true, newLayout: true, frames: 48000, cues: 3, listCues: 3, name: 'kick.wav', icmt: ICMT, inam: 'kick.wav' });
}

// --- WAV Builder's own reader (readWavHeaderInfo) ---------------------------

console.log('\nReader (readWavHeaderInfo)\n');

function readerCheck(title, got, want) {
    const fails = [];
    for (const [k, v] of Object.entries(want)) {
        if (JSON.stringify(got[k]) !== JSON.stringify(v)) fails.push(`${k} ${JSON.stringify(got[k])} != ${JSON.stringify(v)}`);
    }
    console.log(`[${fails.length ? 'FAIL' : ' ok '}] ${title}`);
    for (const f of fails) console.log(`         x ${f}`);
    failures += fails.length ? 1 : 0;
}

{
    const wav = await encoded(48000, 2, encMeta);
    const whole = await readWavHeaderInfo(new Blob([wav]));
    readerCheck('whole file', { frames: whole.frames, ...whole.metadata },
        { frames: 48000, id: ICMT.id, hash: ICMT.h, name: 'kick.wav', tempo: 120, slicePoints: [0, 0.25, 0.5] });

    const head = await readWavHeaderInfo(wav.slice(0, LIST_HEADER_READ).buffer);
    readerCheck('4 KB header read (USB): id, hash, name and frames without the audio', { frames: head.frames, ...head.metadata },
        { frames: 48000, id: ICMT.id, hash: ICMT.h, name: 'kick.wav' });
}
{
    // A 4.1.3 file: LIST after data. The header read finds nothing; the tail read finds ICMT.
    const frames = 4800;
    const legacy = concat([buildWav({ frames }), listChunk({ tempo: 120, icmt: ICMT })]);
    new DataView(legacy.buffer).setUint32(4, legacy.length - 8, true);
    const head = await readWavHeaderInfo(legacy.slice(0, LIST_HEADER_READ).buffer);
    readerCheck('legacy file, header read: frames only, no metadata', { frames: head.frames, meta: head.metadata },
        { frames, meta: null });
    const tail = await readWavHeaderInfo(legacy.slice(44 + frames * 8).buffer);
    readerCheck('legacy file, tail read from 44 + frames × 8: ICMT found', { ...tail.metadata },
        { id: ICMT.id, hash: ICMT.h, tempo: 120 });
}

// --- Dirtywave M8 export (m8Wav.ts) ----------------------------------------
// Not for the card: the M8 sampler wants 16-bit PCM and no LIST. Shape checks
// against a file the M8 saved itself (docs/WAV-CUE/slice-cue/), not a firmware port.

console.log('\nDirtywave M8 export (toM8Wav)\n');

const { toM8Wav } = await import('../src/lib/audio/m8Wav.ts');
const chunkIds = (file) => walkChunks(file).chunks.map(c => c.id);
{
    const frames = 48000;
    const source = await encoded(frames, 2, encMeta);
    // Out of order, a repeat, one past the end, and more than the M8's 128.
    const cueFrames = [24000, 0, 12000, 12000, frames, ...Array.from({ length: 200 }, (_, i) => 100 + i)];
    const m8 = new Uint8Array(await (await toM8Wav(new Blob([source]), cueFrames)).arrayBuffer());
    const cueAt = 12 + 24 + 8 + frames * 4;
    const ids = [], offsets = [];
    for (let i = 0; i < u32(m8, cueAt + 8); i++) {
        ids.push(u32(m8, cueAt + 12 + i * 24));
        offsets.push(u32(m8, cueAt + 12 + i * 24 + 20));
    }
    const sorted = offsets.every((f, i) => i === 0 || f > offsets[i - 1]);
    readerCheck('16-bit PCM, fmt > data > cue, no LIST, RIFF size exact', {
        chunks: chunkIds(m8), problems: walkChunks(m8).problems, fmtSize: u32(m8, 16), format: u16(m8, 20), channels: u16(m8, 22),
        rate: u32(m8, 24), bits: u16(m8, 34), dataSize: u32(m8, 40),
    }, {
        chunks: ['fmt ', 'data', 'cue '], problems: [], fmtSize: 16, format: 1, channels: 2,
        rate: 48000, bits: 16, dataSize: frames * 4,
    });
    readerCheck('cues: at most 128, sorted, no repeats, inside the audio, ids from 0', {
        count: offsets.length, sorted, first: offsets.slice(0, 3), inside: offsets[offsets.length - 1] < frames, ids0: ids[0], idsLast: ids[ids.length - 1],
    }, { count: 128, sorted: true, first: [0, 100, 101], inside: true, ids0: 0, idsLast: 127 });

    // The samples: a float sine in, the same in 16 bits out.
    const dataAt = walkChunks(source).chunks.find(c => c.id === 'data').offset + 8;
    const f = new DataView(source.buffer, source.byteOffset + dataAt);
    const p = new DataView(m8.buffer, m8.byteOffset + 44);
    let worst = 0;
    for (let i = 0; i < 2000; i++) worst = Math.max(worst, Math.abs(f.getFloat32(i * 4, true) - p.getInt16(i * 2, true) / 32767));
    readerCheck('samples within one 16-bit step', { close: worst < 2 / 32767 }, { close: true });

    const back = await readWavHeaderInfo(new Blob([m8]));
    readerCheck('readWavHeaderInfo reads it back', { frames: back.frames, format: back.audioFormat, bits: back.bitsPerSample, cues: back.metadata?.slicePoints?.length },
        { frames, format: 1, bits: 16, cues: 128 });

    // Without cue frames: the file's own cue chunk.
    const own = new Uint8Array(await (await toM8Wav(new Blob([source]))).arrayBuffer());
    const ownBack = await readWavHeaderInfo(new Blob([own]));
    readerCheck("no cue frames given: the source's own cues", { cues: ownBack.metadata?.slicePoints }, { cues: [0, 0.25, 0.5] });

    let refused = false;
    try { await toM8Wav(new Blob([m8])); } catch { refused = true; }
    readerCheck('a 16-bit file is refused, not converted twice', { refused }, { refused: true });
}
{
    // The layout a sliced sample saved on the M8 has (its fmt is 18 bytes, and its RIFF size leaves out the cue chunk).
    const { readFileSync, existsSync } = await import('node:fs');
    const path = new URL('../docs/WAV-CUE/slice-cue/MANGLE_20261014SLICED-M8.wav', import.meta.url);
    if (existsSync(path)) {
        const device = new Uint8Array(readFileSync(path));
        const info = await readWavHeaderInfo(new Blob([device]));
        readerCheck('M8-saved file: the chunk order and format we copy', {
            chunks: chunkIds(device), format: info.audioFormat, bits: info.bitsPerSample, cues: info.metadata?.slicePoints?.length,
        }, { chunks: ['fmt ', 'data', 'cue '], format: 1, bits: 16, cues: 16 });
    }
}

console.log(`\n${failures ? `${failures} check(s) failed` : 'All checks passed'}${warnings ? `, ${warnings} warning(s)` : ''}.`);
process.exit(failures ? 1 : 0);
