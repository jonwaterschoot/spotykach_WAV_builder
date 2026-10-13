/* eslint-disable @typescript-eslint/no-explicit-any -- stand-in device link and folder handles */
/**
 * End-to-end: exportSDStructure and calculateSyncDiff over both routes, with slot
 * files from 4.2 (the package's encodeWav, identity in the card snapshot).
 *
 * Run through scripts/check-card-sync.mjs (it bundles this file). USB is the real
 * UsbBackend over a stand-in SkLink that keeps files in memory and checks uploads
 * with the package's own checkUploadable; the card reader is the real FolderBackend
 * over a folder on disk.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { checkUploadable, inspectWav, SLOT_LOADABLE, SLOT_OCCUPIED } from '@synthuxacademy/spotykach-transfer';
import { UsbBackend } from '../src/lib/usb/usbBackend';
import { FolderBackend } from '../src/lib/card/folderBackend';
import { exportSDStructure } from '../src/utils/exportUtils';
import { calculateSyncDiff } from '../src/utils/importUtils';
import { importedSnapshotSlot } from '../src/lib/card/cardSnapshot';
import { getInitialState } from '../src/utils/initialState';
import { assembleWav } from '../src/lib/audio/wavHeader';
import type { AppState, FileRecord } from '../src/types';

let failures = 0;
const check = (ok: boolean, label: string, detail = '') => {
    console.log(`${ok ? '  ok ' : 'FAIL '} ${label}${detail ? `  (${detail})` : ''}`);
    if (!ok) failures++;
};
(globalThis as any).window = { addEventListener() {}, removeEventListener() {} };

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const pcm = (seconds: number, hz: number) => {
    const frames = Math.round(seconds * 48000);
    const f = new Float32Array(frames * 2);
    for (let i = 0; i < frames; i++) { f[i * 2] = Math.sin(2 * Math.PI * hz * i / 48000) * 0.4; f[i * 2 + 1] = f[i * 2]; }
    return new Uint8Array(f.buffer);
};
let n = 0;
const record = (id: string, name: string, seconds: number, hz: number, slicePoints?: number[]): FileRecord => {
    const v = `${id}-v${++n}`;
    return {
        id, name: `${name.toLowerCase()}.wav`, originalName: `${name.toLowerCase()}.wav`, isParked: false, currentVersionId: v,
        versions: [{ id: v, timestamp: n, description: 'Original', blob: assembleWav(pcm(seconds, hz), { id, slicePoints }), duration: seconds }],
    } as FileRecord;
};
const project = (): AppState => {
    const s: any = getInitialState();
    s.files = {
        kick: record('kick', 'KICK', 1, 60, [0, 0.5]),
        pad: record('pad', 'PAD', 2, 220),
        long: record('long', 'LONG', 43, 110, [0, 20, 42.5]),
    };
    s.tapes.Blue.slots[0].fileId = 'kick';
    s.tapes.Blue.slots[1].fileId = 'pad';
    s.tapes.Blue.slots[2].fileId = 'long';
    return s;
};

const info = {
    protoMajor: 1, protoMinor: 0, tapes: 6, slots: 6, tapeNames: 'BGPRTY', maxChunk: 4096,
    maxFrames: 2016000, maxCues: 255, totalKiB: 16_000_000, freeKiB: 15_000_000, firmware: '1.3.1',
};
const device = () => {
    const files = new Map<string, Uint8Array>();
    const calls = { upload: 0, readSlot: 0, download: 0 };
    const link: any = {
        closed: false, onclose: null, info,
        async hello() { return info; },
        async list() {
            const out = [];
            for (let t = 0; t < 6; t++) for (let s = 0; s < 6; s++) {
                const f = files.get(`${t}:${s}`);
                const i = f ? inspectWav(f) : null;
                out.push({ tape: t, slot: s, flags: f ? SLOT_OCCUPIED | SLOT_LOADABLE : 0, fileSize: f?.length ?? 0,
                    frames: i?.frames ?? 0, sampleRate: i?.sampleRate ?? 0, cues: i?.cues.length ?? 0, channels: 2, bits: 32, name: i?.name ?? '' });
            }
            return out;
        },
        async readSlot(t: number, s: number, work: any) {
            calls.readSlot++;
            const f = files.get(`${t}:${s}`)!;
            return work(f.length, async (o: number, l: number) => f.slice(o, o + l));
        },
        async upload(t: number, s: number, bytes: Uint8Array) {
            const problems = checkUploadable(bytes, info);
            if (problems.length) throw new Error(problems.join(' '));
            calls.upload++;
            files.set(`${t}:${s}`, bytes);
        },
        async download(t: number, s: number) { calls.download++; return files.get(`${t}:${s}`)!; },
        async remove(t: number, s: number) { files.delete(`${t}:${s}`); },
        async request() { return new Uint8Array([0]); },
        async exit() {},
    };
    return { files, calls, backend: new UsbBackend({ link, info } as any) };
};

const build = async (state: AppState, card: any, events: any[] = []) =>
    exportSDStructure(state, { card, directWrite: true, skMode: 'overwrite', includeConfig: false, onSlot: e => events.push(e) });

// ---------------------------------------------------------------------------
// A disk-backed FileSystemDirectoryHandle for the card reader route
// ---------------------------------------------------------------------------

class FileH {
    kind = 'file' as const;
    constructor(public name: string, private p: string) {}
    async getFile() { const b = fs.readFileSync(this.p); return new File([b], this.name, { lastModified: fs.statSync(this.p).mtimeMs }); }
    async createWritable() {
        const chunks: Uint8Array[] = []; const p = this.p;
        return {
            async write(d: any) { chunks.push(d instanceof Blob ? new Uint8Array(await d.arrayBuffer()) : typeof d === 'string' ? new TextEncoder().encode(d) : new Uint8Array(d.buffer ?? d)); },
            async close() { fs.writeFileSync(p, Buffer.concat(chunks)); }, async truncate() {}, async seek() {},
        };
    }
    async move(dir: DirH, name: string) { fs.renameSync(this.p, path.join(dir.p, name)); }
    async queryPermission() { return 'granted'; }
}
class DirH {
    kind = 'directory' as const;
    constructor(public name: string, public p: string) { fs.mkdirSync(p, { recursive: true }); }
    private find(name: string) { return fs.readdirSync(this.p).find(n => n.toLowerCase() === name.toLowerCase()); }
    async getDirectoryHandle(name: string, o: any = {}) {
        const f = this.find(name);
        if (!f && !o.create) throw Object.assign(new Error('nf'), { name: 'NotFoundError' });
        return new DirH(f ?? name, path.join(this.p, f ?? name));
    }
    async getFileHandle(name: string, o: any = {}) {
        const f = this.find(name);
        if (!f) { if (!o.create) throw Object.assign(new Error('nf'), { name: 'NotFoundError' }); fs.writeFileSync(path.join(this.p, name), ''); }
        return new FileH(f ?? name, path.join(this.p, f ?? name));
    }
    async removeEntry(name: string) { const f = this.find(name); if (f) fs.rmSync(path.join(this.p, f), { recursive: true, force: true }); }
    async *entries(): AsyncGenerator<[string, any]> {
        for (const nm of fs.readdirSync(this.p)) { const q = path.join(this.p, nm); yield [nm, fs.statSync(q).isDirectory() ? new DirH(nm, q) : new FileH(nm, q)]; }
    }
    async *values() { for await (const [, h] of this.entries()) yield h; }
    async *keys() { for await (const [nm] of this.entries()) yield nm; }
    async queryPermission() { return 'granted'; }
    async requestPermission() { return 'granted'; }
}

// ---------------------------------------------------------------------------

const run = async () => {
    console.log('\nUSB: write, recognise, skip');
    let state = project();
    const usb = device();
    const events: any[] = [];
    const snapshot = (await build(state, usb.backend, events))!;
    check(usb.calls.upload === 3, 'first build uploads all three', String(usb.calls.upload));
    const stored = [...usb.files.values()].map(b => inspectWav(b)!);
    check(stored.every(w => w.dataOffset % 4 === 0 && w.sampleRate === 48000), 'slot files on the device are aligned 48 kHz float');
    check(stored.some(w => w.name === 'kick.wav' && w.cues.length === 2), 'KICK carries its name and 2 slices');
    const longEvent = events.find(e => e.slot === 'Blue3' && e.phase === 'done');
    check(longEvent?.cut?.fromFrames === 43 * 48000 && longEvent.cut.toFrames === 2016000, 'LONG (43 s) is cut to 2,016,000 frames, and the event says so', JSON.stringify(longEvent?.cut));
    check(stored.some(w => w.frames === 2016000 && w.cues.length === 2), "LONG's slice at 42.5 s is dropped");
    check(!!snapshot.slots.Blue1?.audioHash && snapshot.slots.Blue1.size !== undefined && snapshot.slots.Blue1.name === 'kick.wav', 'the snapshot records audio hash and fingerprint');
    state = { ...state, cardSnapshot: snapshot };

    usb.calls.readSlot = 0;
    let diff = await calculateSyncDiff(state, usb.backend);
    const m = (slot: string) => diff.slots[slot];
    check(['Blue1', 'Blue2', 'Blue3'].every(s => m(s).status === 'MATCH' && m(s).match === 'snapshot' && !m(s).staleHeader), 'the diff recognises all three by the snapshot', ['Blue1', 'Blue2', 'Blue3'].map(s => `${m(s).status}/${m(s).match}`).join(' '));
    check(usb.calls.readSlot === 0, 'without a single header read over USB', String(usb.calls.readSlot));

    usb.calls.upload = 0;
    await build(state, usb.backend);
    check(usb.calls.upload === 0, 'a second build skips all three (nothing sent)', String(usb.calls.upload));

    console.log('\nUSB: rename and edit');
    const renamed: AppState = { ...state, files: { ...state.files, pad: { ...state.files.pad, name: 'pad two.wav' } } };
    diff = await calculateSyncDiff(renamed, usb.backend);
    check(diff.slots.Blue2.status === 'MATCH' && diff.slots.Blue2.staleHeader === true && diff.slots.Blue2.match === 'snapshot',
        'renamed PAD: in sync, header update (not a conflict, nothing pooled)', `${diff.slots.Blue2.status} stale=${diff.slots.Blue2.staleHeader}`);
    const edited = record('kick', 'KICK', 1, 80, [0, 0.5]);
    const changed: AppState = { ...state, files: { ...state.files, kick: edited } };
    diff = await calculateSyncDiff(changed, usb.backend);
    check(diff.slots.Blue1.status === 'CONFLICT' && diff.slots.Blue1.ownOlderVersion === true && diff.slots.Blue1.match === 'snapshot', 'edited KICK audio: Changed, matched by snapshot');
    usb.calls.upload = 0;
    const snap2 = (await build(changed, usb.backend))!;
    check(usb.calls.upload === 1 && snap2.slots.Blue1.audioHash !== snapshot.slots.Blue1.audioHash, 'the build re-uploads only KICK, and the snapshot follows', String(usb.calls.upload));
    const renamedNow: AppState = { ...changed, files: { ...changed.files, pad: renamed.files.pad }, cardSnapshot: snap2 };
    usb.calls.upload = 0;
    const renamedSnap = (await build(renamedNow, usb.backend))!;
    check(usb.calls.upload === 1 && inspectWav(usb.files.get('0:1')!)?.name === 'pad two.wav', 'the build rewrites PAD under its new name', String(usb.calls.upload));
    diff = await calculateSyncDiff({ ...renamedNow, cardSnapshot: renamedSnap }, usb.backend);
    check(diff.slots.Blue2.status === 'MATCH' && !diff.slots.Blue2.staleHeader, 'and then it is in sync');

    console.log('\nUSB: a slot recorded on the device, imported into its slot');
    {
        const dev = device();
        dev.files.set('1:0', new Uint8Array(await assembleWav(pcm(1.5, 330)).arrayBuffer()));
        const empty: AppState = { ...project(), cardSnapshot: undefined };
        diff = await calculateSyncDiff(empty, dev.backend);
        const listed = diff.slots.Green1.remote;
        const file = await dev.backend.readFile('Green', 1);
        const recorded: FileRecord = { id: 'rec', name: '1.wav', originalName: '1.wav', isParked: false, currentVersionId: 'rec-v',
            versions: [{ id: 'rec-v', timestamp: 0, description: 'Imported', blob: file, duration: 1.5 }] } as FileRecord;
        const withRec: AppState = {
            ...empty,
            files: { ...empty.files, rec: recorded },
            cardSnapshot: { updatedAt: '', slots: { Green1: (await importedSnapshotSlot('rec', file, listed, 'usb'))! } },
        };
        withRec.tapes.Green.slots[0].fileId = 'rec';
        dev.calls.readSlot = 0;
        diff = await calculateSyncDiff(withRec, dev.backend);
        check(diff.slots.Green1.status === 'MATCH' && diff.slots.Green1.match === 'snapshot',
            'the import is recorded: the next diff ties it by the snapshot (no conflict, nothing pooled)', `${diff.slots.Green1.status}/${diff.slots.Green1.match}`);
        check(dev.calls.readSlot === 0, 'without a header read', String(dev.calls.readSlot));
        check(!diff.slots.Green1.staleHeader, 'no header update just to add the name "1.wav"');
        const named: AppState = { ...withRec, files: { ...withRec.files, rec: { ...recorded, name: 'field recording' } } };
        diff = await calculateSyncDiff(named, dev.backend);
        check(diff.slots.Green1.status === 'MATCH' && diff.slots.Green1.staleHeader === true, 'renamed in the app: a header update writes the name');
    }

    console.log('\nUSB: a preset write leaves the slots it does not fill');
    {
        const dev = device();
        const own = new Uint8Array(await assembleWav(pcm(1, 440)).arrayBuffer());
        dev.files.set('2:0', own);   // Pink 1, recorded on the device
        dev.files.set('0:0', own);   // Blue 1, which the preset fills
        await exportSDStructure({ ...project(), cardSnapshot: undefined }, { card: dev.backend, directWrite: true, skMode: 'overwrite', includeProject: false, includeConfig: false });
        check(dev.files.get('2:0') === own, 'Pink 1, not in the preset, is untouched');
        check(dev.files.get('0:0') !== own && dev.files.size === 4, 'Blue 1 is replaced, nothing else removed', String(dev.files.size));
    }

    console.log('\nUSB: a slot file from before 4.2');
    const legacy: AppState = { ...state, cardSnapshot: undefined };
    const oldKick = assembleWav(pcm(1, 60), { id: 'kick', hash: 'x', name: 'kick.wav', slicePoints: [0, 0.5] });
    usb.files.set('0:0', new Uint8Array(await oldKick.arrayBuffer()));
    usb.calls.readSlot = 0;
    diff = await calculateSyncDiff(legacy, usb.backend);
    check(diff.slots.Blue1.match === 'id' && usb.calls.readSlot > 0, 'without a snapshot, an ICMT slot file is matched by its id (header read)', `${diff.slots.Blue1.status}/${diff.slots.Blue1.match}`);

    console.log('\nCard reader');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cardsync-'));
    try {
        const reader = new FolderBackend(new DirH('card', dir) as any);
        let rstate = project();
        const rsnap = (await build(rstate, reader))!;
        rstate = { ...rstate, cardSnapshot: rsnap };
        const blue1 = fs.readFileSync(path.join(dir, 'SK', 'B', fs.readdirSync(path.join(dir, 'SK', 'B')).find(f => /^1\./i.test(f))!));
        check(inspectWav(new Uint8Array(blue1))?.name === 'kick.wav', 'the card reader writes the same slot files');
        diff = await calculateSyncDiff(rstate, reader);
        check(['Blue1', 'Blue2', 'Blue3'].every(s => diff.slots[s].status === 'MATCH' && diff.slots[s].match === 'snapshot'), 'the diff recognises them by the snapshot', ['Blue1', 'Blue2', 'Blue3'].map(s => `${diff.slots[s].status}/${diff.slots[s].match}`).join(' '));
        const again: any[] = [];
        await build(rstate, reader, again);
        check(again.filter(e => e.phase === 'skipped').length === 3 && !again.some(e => e.phase === 'done'), 'a second card-reader build skips all three', again.map(e => e.phase).join(','));

        // The device-test case: an older project against a card it wrote. Different id,
        // old header, same audio.
        const other = { ...project(), cardSnapshot: undefined };
        const reimported = record('new-id-for-pad', 'PAD', 2, 220);
        other.files = { ...other.files, 'new-id-for-pad': reimported };
        other.tapes.Blue.slots[1].fileId = 'new-id-for-pad';
        const oldPad = assembleWav(pcm(2, 220), { id: 'some-old-id', hash: 'old-whole-file-hash', name: 'pad.wav' });
        const bdir = path.join(dir, 'SK', 'B');
        const pad = fs.readdirSync(bdir).find(f => /^2\./i.test(f))!;
        fs.writeFileSync(path.join(bdir, pad), Buffer.from(await oldPad.arrayBuffer()));
        diff = await calculateSyncDiff(other, new FolderBackend(new DirH('card', dir) as any));
        check(diff.slots.Blue2.status === 'MATCH' && diff.slots.Blue2.match === 'audio' && diff.slots.Blue2.staleHeader === true,
            'same audio under an old header and another id: MATCH by audio, rewritten once (no conflict, no pool)', `${diff.slots.Blue2.status}/${diff.slots.Blue2.match}`);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }

    console.log(failures ? `\n${failures} failed` : '\nAll good');
    process.exit(failures ? 1 : 0);
};
run().catch(e => { console.error(e); process.exit(1); });
