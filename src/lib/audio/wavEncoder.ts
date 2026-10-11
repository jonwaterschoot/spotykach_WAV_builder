import type { WavMetadata } from '../../types';
// Explicit extension so scripts/check-wav-header.mjs can import this file under plain Node.
import { assembleWav } from './wavHeader.ts';

export function encodeWAV(audioBuffer: AudioBuffer, metadata?: WavMetadata): Blob { // 32-bit float
    // Always stereo: a mono source is copied to both channels.
    const left = audioBuffer.getChannelData(0);
    const right = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : left;

    // Interleave, little-endian as RIFF requires
    const pcm = new ArrayBuffer(audioBuffer.length * 8);
    const view = new DataView(pcm);
    for (let i = 0, offset = 0; i < audioBuffer.length; i++, offset += 8) {
        view.setFloat32(offset, left[i], true);
        view.setFloat32(offset + 4, right[i], true);
    }

    // Header layout (LIST before data, cue after) lives in wavHeader.ts
    return assembleWav(pcm, metadata, audioBuffer.sampleRate);
}
