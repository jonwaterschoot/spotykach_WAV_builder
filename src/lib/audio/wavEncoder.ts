import type { WavMetadata } from '../../types';

export function encodeWAV(audioBuffer: AudioBuffer, metadata?: WavMetadata): Blob { // 32-bit float
    const numChannels = 2; // Always stereo
    const sampleRate = audioBuffer.sampleRate; // Use actual rate
    const format = 3; // IEEE Float
    const bitDepth = 32;

    // Interleave channels
    const length = audioBuffer.length * numChannels * 4; // 4 bytes per sample

    // --------------------------------------------------------------------------------
    // 1. Prepare Metadata Chunks
    // --------------------------------------------------------------------------------

    // LIST INFO Chunk
    const infoBytes: number[] = [];
    if (metadata) {
        const infoChunks: { id: string, value: string }[] = [];

        // IART (Artist) - Constant for now
        infoChunks.push({ id: 'IART', value: 'Spotykach Builder' });

        // INAM (Original Filename usually) - We don't have filename here easily, maybe pass it?
        // Let's settle on ICMT for JSON payload

        if (metadata.id || metadata.hash || metadata.processing) {
            const jsonPayload = JSON.stringify({
                id: metadata.id,
                h: metadata.hash, // Shorten keys
                p: metadata.processing // Processing flags
            });
            infoChunks.push({ id: 'ICMT', value: jsonPayload });
        }

        // Construct Body
        if (infoChunks.length > 0) {
            "INFO".split('').forEach(c => infoBytes.push(c.charCodeAt(0)));

            infoChunks.forEach(chunk => {
                chunk.id.split('').forEach(c => infoBytes.push(c.charCodeAt(0)));
                const valueBytes = chunk.value.split('').map(c => c.charCodeAt(0));
                valueBytes.push(0); // Null terminator
                const size = valueBytes.length;
                const padding = size % 2;

                infoBytes.push(size & 0xFF, (size >> 8) & 0xFF, (size >> 16) & 0xFF, (size >> 24) & 0xFF);
                infoBytes.push(...valueBytes);
                if (padding) infoBytes.push(0);
            });
        }
    }
    const listBodySize = infoBytes.length;
    const listChunkSize = listBodySize > 0 ? 8 + listBodySize + (listBodySize % 2) : 0;
    // ^ LIST (4) + Size (4) + Body + Pad

    // CUE Chunk (We don't support slices yet, placeholder logic)
    // TODO: Pass slices in metadata

    // --------------------------------------------------------------------------------
    // 2. Assemble File
    // --------------------------------------------------------------------------------

    // RIFF (12) + FMT (24) + DATA (8 + length) + LIST (listChunkSize)
    const riffSize = 4 + (8 + 16) + (8 + length) + listChunkSize;

    const buffer = new ArrayBuffer(8 + riffSize);
    const view = new DataView(buffer);
    let offset = 0;

    // RIFF identifier
    writeString(view, offset, 'RIFF'); offset += 4;
    // RIFF chunk length
    view.setUint32(offset, riffSize, true); offset += 4;
    // RIFF type
    writeString(view, offset, 'WAVE'); offset += 4;

    // format chunk identifier
    writeString(view, offset, 'fmt '); offset += 4;
    // format chunk length
    view.setUint32(offset, 16, true); offset += 4;
    // sample format (raw)
    view.setUint16(offset, format, true); offset += 2;
    // channel count
    view.setUint16(offset, numChannels, true); offset += 2;
    // sample rate
    view.setUint32(offset, sampleRate, true); offset += 4;
    // byte rate (sampleRate * blockAlign)
    view.setUint32(offset, sampleRate * numChannels * 4, true); offset += 4;
    // block align (channel count * bytes per sample)
    view.setUint16(offset, numChannels * 4, true); offset += 2;
    // bits per sample
    view.setUint16(offset, bitDepth, true); offset += 2;

    // data chunk identifier
    writeString(view, offset, 'data'); offset += 4;
    // data chunk length
    view.setUint32(offset, length, true); offset += 4;

    // Write interleaved data
    const left = audioBuffer.getChannelData(0);
    const right = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : left; // Duplicate mono

    for (let i = 0; i < audioBuffer.length; i++) {
        view.setFloat32(offset, left[i], true);
        offset += 4;
        view.setFloat32(offset, right[i], true);
        offset += 4;
    }

    // Create LIST Chunk
    if (listBodySize > 0) {
        writeString(view, offset, 'LIST'); offset += 4;
        view.setUint32(offset, listBodySize, true); offset += 4;

        infoBytes.forEach(b => {
            view.setUint8(offset, b);
            offset++;
        });

        if (listBodySize % 2 !== 0) {
            view.setUint8(offset, 0); offset++;
        }
    }

    return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}
