// Explicit extension so scripts/check-wav-header.mjs can import this file under plain Node.
import { readWavHeaderInfo } from './wavHeader.ts';

/**
 * A WAV for the Dirtywave M8's sampler, made from one of ours. The Spotykach
 * file can't serve both: the M8 reads integer PCM, not 32-bit float, and wants
 * nothing but `fmt `, `data` and `cue `.
 *
 * Layout: RIFF/WAVE, `fmt ` (16-bit PCM, plain 16-byte WAVEFORMAT), `data`, `cue `.
 * No `LIST/INFO`: the M8 shows the file name, and our id and hash only matter to
 * the Spotykach. Sample rate and channel count are kept.
 *
 * Cue records follow the M8's own writer (a sliced sample saved on the device):
 * ids from 0, dwPosition 0, offsets in frames. fccChunk is spelled 'data'; the
 * M8 itself writes the bytes reversed ('atad') and reads ours fine (checked on
 * the device).
 * On the M8, set the sampler's SLICE to 01 FILE to play them.
 *
 * See docs/WAV-CUE/slice-cue/sliceM8.md and `npm run check:wav`.
 */

/** The M8 maps slices to notes and stops at 128. */
export const M8_MAX_CUES = 128;

function ascii(view: DataView, offset: number, text: string) {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}

/** Sorted, whole, inside the audio, no repeats, from 0 (as the M8 saves them), at most 128. */
export function m8CueFrames(cueFrames: number[], frames: number): number[] {
    const inside = cueFrames.map(Math.round).filter(f => f >= 0 && f < frames);
    if (inside.length === 0) return [];
    return [...new Set([0, ...inside])].sort((a, b) => a - b).slice(0, M8_MAX_CUES);
}

function m8CueChunk(points: number[]): Uint8Array {
    if (points.length === 0) return new Uint8Array(0);
    const bodySize = 4 + points.length * 24;
    const out = new Uint8Array(8 + bodySize);
    const view = new DataView(out.buffer);
    ascii(view, 0, 'cue ');
    view.setUint32(4, bodySize, true);
    view.setUint32(8, points.length, true); // dwCuePoints
    points.forEach((frame, index) => {
        const o = 12 + index * 24;
        view.setUint32(o, index, true); // dwIdentifier
        view.setUint32(o + 4, 0, true); // dwPosition
        ascii(view, o + 8, 'data'); // fccChunk
        view.setUint32(o + 12, 0, true); // dwChunkStart
        view.setUint32(o + 16, 0, true); // dwBlockStart
        view.setUint32(o + 20, frame, true); // dwSampleOffset
    });
    return out;
}

/**
 * Our 32-bit float WAV as a 16-bit PCM M8 WAV. `cueFrames` are the slice points
 * in frames; without them the file's own cue chunk is used (read back from
 * seconds, so it can be a frame or so off).
 */
export async function toM8Wav(wav: Blob, cueFrames?: number[]): Promise<Blob> {
    const info = await readWavHeaderInfo(wav);
    const { audioFormat, bitsPerSample, channels, sampleRate, dataOffset, frames } = info;
    if (audioFormat !== 3 || bitsPerSample !== 32 || !channels || !sampleRate || dataOffset === undefined || frames === undefined) {
        throw new Error('Not a 32-bit float WAV');
    }

    const samples = frames * channels;
    const float = new DataView(await wav.slice(dataOffset, dataOffset + samples * 4).arrayBuffer());
    const dataSize = samples * 2;
    const pcm = new ArrayBuffer(dataSize + (dataSize % 2)); // Odd only for mono with an odd frame count
    const out = new DataView(pcm);
    for (let i = 0; i < samples; i++) {
        const s = Math.max(-1, Math.min(1, float.getFloat32(i * 4, true) || 0)); // NaN to silence
        out.setInt16(i * 2, Math.round(s < 0 ? s * 32768 : s * 32767), true);
    }

    const points = m8CueFrames(cueFrames ?? (info.metadata?.slicePoints ?? []).map(t => t * sampleRate), frames);
    const cue = m8CueChunk(points);

    const header = new Uint8Array(44);
    const view = new DataView(header.buffer);
    ascii(view, 0, 'RIFF');
    view.setUint32(4, 36 + pcm.byteLength + cue.length, true);
    ascii(view, 8, 'WAVE');
    ascii(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // Integer PCM
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * channels * 2, true); // Byte rate
    view.setUint16(32, channels * 2, true); // Block align
    view.setUint16(34, 16, true); // Bits per sample
    ascii(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    return new Blob([header as BlobPart, pcm, cue as BlobPart], { type: 'audio/wav' });
}
