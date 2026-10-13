#!/usr/bin/env node
/**
 * Checks for slot files (src/lib/audio/slotFile.ts): what WAV Builder writes into
 * SK/<T>/<N>.WAV.
 *
 *   node scripts/check-slot-files.mjs        (or: npm run check:slots)
 *
 * Covers: the audio hash ignores the header (an old ICMT file and its slot file
 * hash the same), files over 42 s are cut and their late slice points dropped, the
 * fingerprint matches what the package's inspectWav (and so the device's LIST)
 * reports, encoding is deterministic, and the written files load on both firmware
 * ports in check-wav-header.mjs. Exits 1 on any failure.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectWav, checkUploadable } from '@synthuxacademy/spotykach-transfer';
import { assembleWav } from '../src/lib/audio/wavHeader.ts';
import { toSlotFile, audioHashOf, sameFingerprint, DEVICE_MAX_FRAMES } from '../src/lib/audio/slotFile.ts';

let failures = 0;
const check = (ok, label, detail = '') => {
    console.log(`${ok ? '  ok ' : 'FAIL '} ${label}${detail ? `  (${detail})` : ''}`);
    if (!ok) failures++;
};

/** Interleaved stereo float PCM, `seconds` long. */
const pcm = (seconds, hz = 220) => {
    const frames = Math.round(seconds * 48000);
    const f = new Float32Array(frames * 2);
    for (let i = 0; i < frames; i++) { f[i * 2] = Math.sin(2 * Math.PI * hz * i / 48000) * 0.5; f[i * 2 + 1] = -f[i * 2]; }
    return new Uint8Array(f.buffer);
};
const bytesOf = async blob => new Uint8Array(await blob.arrayBuffer());

console.log('\nSlot files');

// A project version as WAV Builder stored it: our header with ICMT, ITMP, IART.
const meta = { id: 'abc', hash: 'whole-file-hash', name: 'Kick è one.wav', tempo: 120, slicePoints: [0, 0.5, 1.5] };
const version = assembleWav(pcm(2), meta);
const slot = await toSlotFile(version, { name: meta.name, slicePoints: meta.slicePoints });
const slotBytes = await bytesOf(slot.blob);
const seen = inspectWav(slotBytes);

check(!!seen && seen.sampleRate === 48000 && seen.channels === 2 && seen.bitsPerSample === 32 && seen.audioFormat === 3, 'a slot file is 48 kHz stereo float');
check(seen?.dataOffset % 4 === 0, 'its audio starts 4-byte aligned', String(seen?.dataOffset));
check(seen?.name === 'Kick è one.wav' && JSON.stringify(seen.cues) === JSON.stringify([0, 24000, 72000]), 'name and cue points as asked', `${seen?.name} ${JSON.stringify(seen?.cues)}`);
check(checkUploadable(slotBytes, { maxFrames: DEVICE_MAX_FRAMES, maxCues: 255 }).length === 0, 'the package would upload it');
check(sameFingerprint(slot.fingerprint, { name: seen.name, size: slotBytes.length, frames: seen.frames, cues: seen.cues.length }), 'fingerprint = what inspectWav (the device LIST) reports', JSON.stringify(slot.fingerprint));
check(!slot.truncated && slot.sourceFrames === 96000, 'a 2 s file is not cut');

const again = await bytesOf((await toSlotFile(version, { name: meta.name, slicePoints: meta.slicePoints })).blob);
check(again.length === slotBytes.length && again.every((b, i) => b === slotBytes[i]), 'encoding is deterministic (same input, same bytes)');

const hVersion = await audioHashOf(version);
const hSlot = await audioHashOf(slot.blob);
check(!!hVersion && hVersion === hSlot, 'audio hash: the ICMT version and its slot file hash the same', hVersion?.slice(0, 12));
const renamed = await toSlotFile(version, { name: 'other.wav', slicePoints: [] });
check(await audioHashOf(renamed.blob) === hVersion && !sameFingerprint(renamed.fingerprint, slot.fingerprint), 'renamed or re-sliced: same audio hash, different fingerprint');
const other = assembleWav(pcm(2, 330), meta);
check(await audioHashOf(other) !== hVersion, 'different audio: different hash');

console.log('\nThe 42 s limit');
const long = assembleWav(pcm(43.5), { ...meta, slicePoints: [0, 10, 41.9, 42.5, 43] });
const cut = await toSlotFile(long, { name: 'long.wav', slicePoints: [0, 10, 41.9, 42.5, 43] });
const cutSeen = inspectWav(await bytesOf(cut.blob));
check(cut.truncated && cutSeen?.frames === DEVICE_MAX_FRAMES, 'a 43.5 s file is cut to exactly 2,016,000 frames', `${cutSeen?.frames}`);
check(JSON.stringify(cutSeen?.cues) === JSON.stringify([0, 480000, 2011200]), 'slice points past the cut are dropped', JSON.stringify(cutSeen?.cues));
check(await audioHashOf(long) === await audioHashOf(cut.blob), 'the long version and its cut slot file hash the same (both up to 42 s)');
const usbLimit = await toSlotFile(long, { maxFrames: 1_000_000 });
check(inspectWav(await bytesOf(usbLimit.blob))?.frames === 1_000_000, "a device's own maxFrames is honoured");

console.log('\nNot a 48 kHz float WAV');
let refused = false;
try { await toSlotFile(new Blob([new Uint8Array(100)])); } catch { refused = true; }
check(refused && await audioHashOf(new Blob([new Uint8Array(100)])) === null, 'refused, and no audio hash');

console.log('\nFirmware ports (check-wav-header.mjs)');
const dir = mkdtempSync(join(tmpdir(), 'slotfiles-'));
try {
    const paths = [];
    for (const [i, len] of [0, 1, 3, 7, 30, 63, 64, 70].entries()) {
        const s = await toSlotFile(version, { name: 'n'.repeat(len), slicePoints: [0, 1] });
        const p = join(dir, `s${i}.wav`);
        writeFileSync(p, await bytesOf(s.blob));
        paths.push(p);
    }
    const p = join(dir, 'cut.wav'); writeFileSync(p, await bytesOf(cut.blob)); paths.push(p);
    let out = '';
    let ok = true;
    try { out = execFileSync(process.execPath, [join(import.meta.dirname, 'check-wav-header.mjs'), ...paths], { encoding: 'utf8' }); }
    catch (e) { ok = false; out = e.stdout ?? String(e); }
    const loaded = (out.match(/release {2}loads/g) ?? []).length + (out.match(/uploader loads/g) ?? []).length;
    check(ok && loaded === paths.length * 2, `every slot file loads on release and uploader firmware (${paths.length} files)`, `${loaded}/${paths.length * 2}`);
} finally {
    rmSync(dir, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} failed` : '\nAll good');
process.exit(failures ? 1 : 0);
