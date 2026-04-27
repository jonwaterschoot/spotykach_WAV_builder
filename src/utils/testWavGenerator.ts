// dynamic utility imports

// Helper to write strings
function writeString(view: DataView, offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

export function generateTestWavWithMetadata(): Blob {
    const sampleRate = 48000;
    const numChannels = 2;
    const duration = 2.0;
    const numSamples = sampleRate * duration;
    const bitDepth = 16;
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = numSamples * blockAlign;

    // --- 1. Construct INFO Chunk (Metadata) ---
    // LIST <Size> INFO <Subchunks>
    const infoChunks = [
        { id: 'INAM', value: 'Metadata Test File' },
        { id: 'IART', value: 'Spotykach Builder' },
        { id: 'ICMT', value: 'UUID: 550e8400-e29b-41d4-a716-446655440000' }
    ];

    // We build the "Body" of the LIST chunk (starting with "INFO")
    const infoBytes: number[] = [];

    // "INFO"
    "INFO".split('').forEach(c => infoBytes.push(c.charCodeAt(0)));

    infoChunks.forEach(chunk => {
        // Subchunk ID
        chunk.id.split('').forEach(c => infoBytes.push(c.charCodeAt(0)));

        // Value must be null-terminated and even-aligned
        const valueBytes = chunk.value.split('').map(c => c.charCodeAt(0));
        valueBytes.push(0); // Null terminator

        const contentSize = valueBytes.length;
        const padding = contentSize % 2; // if odd, add 1 byte 

        // Size (Little Endian 32-bit) of CONTENT strings (including null)
        const size = contentSize;
        infoBytes.push(size & 0xFF, (size >> 8) & 0xFF, (size >> 16) & 0xFF, (size >> 24) & 0xFF);

        // Write Value
        infoBytes.push(...valueBytes);

        // Write Padding if needed (after value)
        // Note: The 'Size' field usually prevents reading the padding, but the chunk must be aligned.
        if (padding) infoBytes.push(0);
    });

    const listBodySize = infoBytes.length; // Size of INFO + Subchunks

    // --- 2. Construct CUE Chunk (Slices) ---
    // cue <Size> <NumCues> <CuePoints...>
    const cues = [
        { id: 1, pos: 24000 }, // 0.5s
        { id: 2, pos: 48000 }, // 1.0s
        { id: 3, pos: 72000 }, // 1.5s
    ];
    const numCues = cues.length;
    // Chunk Body: NumCues(4) + (NumCues * 24)
    const cueBodySize = 4 + (numCues * 24);

    // --- 3. Calculate Total RIFF Size ---
    // RIFF Header (4 "WAVE")
    // fmt (8 + 16)
    // data (8 + dataSize)
    // LIST (8 + listBodySize)
    // cue (8 + cueBodySize)

    const riffSize = 4 + (8 + 16) + (8 + dataSize) + (8 + listBodySize) + (8 + cueBodySize);

    const buffer = new ArrayBuffer(8 + riffSize);
    const view = new DataView(buffer);
    let offset = 0;

    // RIFF Header
    writeString(view, offset, 'RIFF'); offset += 4;
    view.setUint32(offset, riffSize, true); offset += 4;
    writeString(view, offset, 'WAVE'); offset += 4;

    // fmt Chunk
    writeString(view, offset, 'fmt '); offset += 4;
    view.setUint32(offset, 16, true); offset += 4;
    view.setUint16(offset, 1, true); offset += 2; // PCM
    view.setUint16(offset, numChannels, true); offset += 2;
    view.setUint32(offset, sampleRate, true); offset += 4;
    view.setUint32(offset, byteRate, true); offset += 4;
    view.setUint16(offset, blockAlign, true); offset += 2;
    view.setUint16(offset, bitDepth, true); offset += 2;

    // data Chunk (We will write header, then data further down)
    // Actually, writing order matters for some parsers, but RIFF allows any order.
    // Let's write Audio Data first for simplicity of offset tracking? 
    // No, let's keep chunks sequential.

    writeString(view, offset, 'data'); offset += 4;
    view.setUint32(offset, dataSize, true); offset += 4;

    // Generate Sine Wave
    for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        let amp = 0.5;
        // Mark Cues with Beeps
        if ((i > 24000 && i < 24500) || (i > 48000 && i < 48500) || (i > 72000 && i < 72500)) amp = 0.9;

        const sample = Math.sin(2 * Math.PI * 440 * t) * amp;
        const intSample = sample < 0 ? sample * 32768 : sample * 32767;

        // Left
        view.setInt16(offset, intSample, true); offset += 2;
        // Right
        view.setInt16(offset, intSample, true); offset += 2;
    }

    // LIST Chunk
    writeString(view, offset, 'LIST'); offset += 4;
    view.setUint32(offset, listBodySize, true); offset += 4;
    infoBytes.forEach(b => {
        view.setUint8(offset, b);
        offset++;
    });

    // CUE Chunk
    writeString(view, offset, 'cue '); offset += 4;
    view.setUint32(offset, cueBodySize, true); offset += 4;
    view.setUint32(offset, numCues, true); offset += 4;

    cues.forEach(cue => {
        view.setUint32(offset, cue.id, true); offset += 4; // ID
        view.setUint32(offset, cue.pos, true); offset += 4; // Position
        writeString(view, offset, 'data'); offset += 4; // Chunk ID "data"
        view.setUint32(offset, 0, true); offset += 4; // Chunk Start (0 = Start of Data Chunk Body?)
        // Spec: "Target Chunk Start" - The byte offset of the start of the Chunk containing the sample.
        // If 0, it means the start of the 'data' chunk BODY (after size). Or start of 'data' header?
        // Usually 0 if standard data chunk.

        view.setUint32(offset, 0, true); offset += 4; // Block Start
        view.setUint32(offset, cue.pos, true); offset += 4; // Sample Offset (Frame offset)
    });

    return new Blob([buffer], { type: 'audio/wav' });
}

export const downloadTestWav = async () => {
    const blob = generateTestWavWithMetadata();
    const { downloadBlob } = await import('./exportUtils');
    downloadBlob(blob, 'SPOTYKACH_METADATA_TEST.WAV');
};
