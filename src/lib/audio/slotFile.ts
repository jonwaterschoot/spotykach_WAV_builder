/**
 * Slot files: what WAV Builder writes into `SK/<T>/<N>.WAV`, over USB and through
 * the card reader alike.
 *
 * Written by the Spotykach transfer package's own `encodeWav` (48 kHz stereo float,
 * `INAM` name, cue points, audio 4-byte aligned), so WAV Builder and Synthux's page
 * write the same format. Nothing of ours goes into the file: which project file a
 * slot holds is kept in the project's card snapshot, and recognised by the slot's
 * fingerprint (name, size, frames, cue count), which the device's slot list
 * reports without reading the file.
 *
 * Plan: docs/usbuploader/usb-transfer-plan.md, "Card identity without ICMT".
 */
import { encodeWav, inspectWav } from '@synthuxacademy/spotykach-transfer';
import { readWavHeaderInfo } from './wavHeader.ts';

/** 42 s at 48 kHz: what the device's deck holds. Over USB, HELLO's `maxFrames` is the real figure. */
export const DEVICE_MAX_FRAMES = 2016000;
/** The device reads at most this many cue points from a file. */
export const DEVICE_MAX_CUES = 255;
const SAMPLE_RATE = 48000;
const BLOCK = 8; // stereo float32

/** What the slot list says about a slot, and what we compare with the card snapshot. */
export interface SlotFingerprint {
    /** `INAM` as written (the package cuts it to 64 bytes), empty when none. */
    name: string;
    size: number;
    frames: number;
    cues: number;
}

export interface SlotFile {
    blob: Blob;
    fingerprint: SlotFingerprint;
    /** True when the source was longer than the device holds and was cut. */
    truncated: boolean;
    /** Frames before the cut. */
    sourceFrames: number;
}

export const sameFingerprint = (a: SlotFingerprint | undefined, b: SlotFingerprint | undefined): boolean =>
    !!a && !!b && a.size === b.size && a.frames === b.frames && a.cues === b.cues && a.name === b.name;

const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');

/**
 * The audio of a 48 kHz stereo float WAV: its `data` bytes, at most `maxFrames`.
 * Null for anything else (another rate or format needs converting first).
 */
const pcmOf = async (wav: Blob, maxFrames: number): Promise<{ bytes: Uint8Array; frames: number; sourceFrames: number } | null> => {
    const info = await readWavHeaderInfo(wav).catch(() => null);
    if (!info || info.dataOffset === undefined || info.frames === undefined) return null;
    if (info.sampleRate !== SAMPLE_RATE || info.channels !== 2 || info.bitsPerSample !== 32 || info.audioFormat !== 3) return null;
    const frames = Math.min(info.frames, maxFrames);
    const bytes = new Uint8Array(await wav.slice(info.dataOffset, info.dataOffset + frames * BLOCK).arrayBuffer());
    return { bytes, frames: Math.floor(bytes.length / BLOCK), sourceFrames: info.frames };
};

/**
 * SHA-256 of the audio alone, as far as the device plays it (the first `maxFrames`).
 * The header doesn't count, so the same sound has the same hash whichever tool wrote
 * the file. Null when the WAV isn't 48 kHz stereo float.
 */
export const audioHashOf = async (wav: Blob, maxFrames = DEVICE_MAX_FRAMES): Promise<string | null> => {
    const pcm = await pcmOf(wav, maxFrames);
    if (!pcm) return null;
    return hex(await crypto.subtle.digest('SHA-256', pcm.bytes as BufferSource));
};

/**
 * A slot file from a 48 kHz stereo float WAV (a project version, or what Studio's
 * conversion made of one). Cut at `maxFrames`; slice points past the cut, and past
 * the device's 255, are dropped.
 */
export const toSlotFile = async (
    wav: Blob,
    { name = '', slicePoints = [], maxFrames = DEVICE_MAX_FRAMES }: { name?: string; slicePoints?: number[]; maxFrames?: number } = {},
): Promise<SlotFile> => {
    const pcm = await pcmOf(wav, maxFrames);
    if (!pcm) throw new Error('Not a 48 kHz stereo float WAV; convert it before writing it to a slot.');

    // An aligned copy: the data chunk may sit at any byte offset in the source.
    const interleaved = new Float32Array(pcm.frames * 2);
    new Uint8Array(interleaved.buffer).set(pcm.bytes.subarray(0, pcm.frames * BLOCK));
    const left = new Float32Array(pcm.frames);
    const right = new Float32Array(pcm.frames);
    for (let i = 0; i < pcm.frames; i++) {
        left[i] = interleaved[i * 2];
        right[i] = interleaved[i * 2 + 1];
    }

    const cues = [...new Set(slicePoints.map(s => Math.round(s * SAMPLE_RATE)))]
        .filter(f => f >= 0 && f < pcm.frames)
        .sort((a, b) => a - b)
        .slice(0, DEVICE_MAX_CUES);

    const bytes = encodeWav({ left, right, cues, name });
    const written = inspectWav(bytes);
    return {
        blob: new Blob([bytes as BlobPart], { type: 'audio/wav' }),
        fingerprint: {
            name: written?.name ?? '',
            size: bytes.length,
            frames: written?.frames ?? pcm.frames,
            cues: written?.cues.length ?? cues.length,
        },
        truncated: pcm.sourceFrames > pcm.frames,
        sourceFrames: pcm.sourceFrames,
    };
};

/** Seconds, for messages: "42.3 s". */
export const framesToSeconds = (frames: number) => `${(frames / SAMPLE_RATE).toFixed(1)} s`;
