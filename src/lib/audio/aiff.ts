/**
 * AIFF → WAV, byte for byte, so Chrome and Firefox can decode it.
 *
 * WebAudio decodes AIFF in Safari only. Freesound originals are often AIFF, and a
 * downloaded original is the point of having it, so it is rewritten as WAV before
 * anything decodes it. Same samples, same rate and depth: AIFF stores big-endian
 * PCM (and AIFC `sowt` little-endian), WAV little-endian, so this is a header and
 * a byte swap. Compressed AIFC (anything but NONE/sowt/twos) is refused.
 */

const tag = (v: DataView, at: number) =>
    String.fromCharCode(v.getUint8(at), v.getUint8(at + 1), v.getUint8(at + 2), v.getUint8(at + 3));

/** The 80-bit IEEE 754 extended float AIFF keeps its sample rate in. */
const readExtended = (v: DataView, at: number): number => {
    const exp = v.getUint16(at) & 0x7fff;
    const hi = v.getUint32(at + 2);
    const lo = v.getUint32(at + 6);
    if (exp === 0 && hi === 0 && lo === 0) return 0;
    return (hi * 2 ** 32 + lo) * 2 ** (exp - 16383 - 63);
};

/** True for a FORM/AIFF or FORM/AIFC file, by its first twelve bytes. */
export const isAiff = (bytes: ArrayBuffer): boolean => {
    if (bytes.byteLength < 12) return false;
    const v = new DataView(bytes);
    return tag(v, 0) === 'FORM' && (tag(v, 8) === 'AIFF' || tag(v, 8) === 'AIFC');
};

export interface AiffInfo { channels: number; sampleRate: number; bitDepth: number; frames: number }

/** The AIFF rewritten as a PCM WAV, or null when it isn't one this can read. */
export function aiffToWav(bytes: ArrayBuffer): { wav: ArrayBuffer; info: AiffInfo } | null {
    if (!isAiff(bytes)) return null;
    const v = new DataView(bytes);
    const isAifc = tag(v, 8) === 'AIFC';

    let info: AiffInfo | null = null;
    let littleEndian = false;
    let dataStart = -1;
    let dataLength = 0;

    for (let at = 12; at + 8 <= v.byteLength;) {
        const id = tag(v, at);
        const size = v.getUint32(at + 4);
        const body = at + 8;
        if (id === 'COMM') {
            info = {
                channels: v.getUint16(body),
                frames: v.getUint32(body + 2),
                bitDepth: v.getUint16(body + 6),
                sampleRate: readExtended(v, body + 8),
            };
            if (isAifc && size >= 22) {
                const compression = tag(v, body + 18);
                if (compression === 'sowt') littleEndian = true;
                else if (compression !== 'NONE' && compression !== 'twos') return null;
            }
        } else if (id === 'SSND') {
            const offset = v.getUint32(body);
            dataStart = body + 8 + offset;
            dataLength = Math.min(size - 8 - offset, v.byteLength - dataStart);
        }
        at = body + size + (size % 2); // chunks are padded to even lengths
    }
    if (!info || dataStart < 0 || !info.channels || !info.sampleRate) return null;
    if (![8, 16, 24, 32].includes(info.bitDepth)) return null;

    const bytesPerSample = info.bitDepth / 8;
    const frameBytes = bytesPerSample * info.channels;
    const length = Math.min(dataLength, info.frames * frameBytes);
    const wav = new ArrayBuffer(44 + length);
    const w = new DataView(wav);
    const writeTag = (at: number, s: string) => { for (let i = 0; i < 4; i++) w.setUint8(at + i, s.charCodeAt(i)); };

    writeTag(0, 'RIFF');
    w.setUint32(4, 36 + length, true);
    writeTag(8, 'WAVE');
    writeTag(12, 'fmt ');
    w.setUint32(16, 16, true);
    w.setUint16(20, 1, true); // PCM
    w.setUint16(22, info.channels, true);
    w.setUint32(24, Math.round(info.sampleRate), true);
    w.setUint32(28, Math.round(info.sampleRate) * frameBytes, true);
    w.setUint16(32, frameBytes, true);
    w.setUint16(34, info.bitDepth, true);
    writeTag(36, 'data');
    w.setUint32(40, length, true);

    const src = new Uint8Array(bytes, dataStart, length);
    const dst = new Uint8Array(wav, 44, length);
    if (bytesPerSample === 1) {
        // AIFF 8-bit is signed, WAV 8-bit unsigned.
        for (let i = 0; i < length; i++) dst[i] = (src[i] + 128) & 0xff;
    } else if (littleEndian) {
        dst.set(src);
    } else {
        for (let i = 0; i < length; i += bytesPerSample) {
            for (let b = 0; b < bytesPerSample; b++) dst[i + b] = src[i + bytesPerSample - 1 - b];
        }
    }
    return { wav, info };
}
