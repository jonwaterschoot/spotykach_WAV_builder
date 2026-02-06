export function encodeWAV(audioBuffer: AudioBuffer): Blob { // 32-bit float
    const numChannels = 2; // Always stereo
    const sampleRate = 48000; // Always 48kHz
    const format = 3; // IEEE Float
    const bitDepth = 32;

    // Interleave channels
    const length = audioBuffer.length * numChannels * 4; // 4 bytes per sample
    const buffer = new ArrayBuffer(44 + length);
    const view = new DataView(buffer);

    // RIFF identifier
    writeString(view, 0, 'RIFF');
    // RIFF chunk length
    view.setUint32(4, 36 + length, true);
    // RIFF type
    writeString(view, 8, 'WAVE');
    // format chunk identifier
    writeString(view, 12, 'fmt ');
    // format chunk length
    view.setUint32(16, 16, true);
    // sample format (raw)
    view.setUint16(20, format, true);
    // channel count
    view.setUint16(22, numChannels, true);
    // sample rate
    view.setUint32(24, sampleRate, true);
    // byte rate (sampleRate * blockAlign)
    view.setUint32(28, sampleRate * numChannels * 4, true);
    // block align (channel count * bytes per sample)
    view.setUint16(32, numChannels * 4, true);
    // bits per sample
    view.setUint16(34, bitDepth, true);
    // data chunk identifier
    writeString(view, 36, 'data');
    // data chunk length
    view.setUint32(40, length, true);

    // Write interleaved data
    const left = audioBuffer.getChannelData(0);
    const right = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : left; // Duplicate mono

    let offset = 44;
    for (let i = 0; i < audioBuffer.length; i++) {
        view.setFloat32(offset, left[i], true);
        offset += 4;
        view.setFloat32(offset, right[i], true);
        offset += 4;
    }

    return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}
