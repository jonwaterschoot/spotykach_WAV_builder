import { useState, useRef } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL, fetchFile } from '@ffmpeg/util';

export const useAudioConverter = () => {
    const [isLoaded, setIsLoaded] = useState(false);
    const [progress, setProgress] = useState(0);
    const [isConverting, setIsConverting] = useState(false);
    const ffmpegRef = useRef(new FFmpeg());
    const loadPromiseRef = useRef<Promise<void> | null>(null);

    const load = async () => {
        if (isLoaded) return;
        if (loadPromiseRef.current) return loadPromiseRef.current;

        const base = import.meta.env.BASE_URL || '/';
        const withBase = (path: string) => `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
        const localCoreBaseURL = withBase('ffmpeg-core');
        const localWorkerURL = withBase('ffmpeg-worker/worker.js');
        const cdnBaseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm';
        const ffmpeg = ffmpegRef.current;
        const loadTimeoutMs = 20000;

        ffmpeg.on('log', ({ message }) => {
            console.log('[FFmpeg Log]', message);
        });

        ffmpeg.on('progress', ({ progress }) => {
            const p = Math.round(progress * 100);
            setProgress(p);
        });

        loadPromiseRef.current = (async () => {
            const loadWithTimeout = async (
                config: { coreURL: string; wasmURL: string; classWorkerURL?: string; workerURL?: string },
                sourceLabel: string
            ) => {
                const controller = new AbortController();
                const timeoutId = window.setTimeout(() => controller.abort(), loadTimeoutMs);
                try {
                    await ffmpeg.load(config, { signal: controller.signal });
                    console.log(`[FFmpeg] Loaded ${sourceLabel} core.`);
                } finally {
                    window.clearTimeout(timeoutId);
                }
            };

            try {
                console.log('[FFmpeg] Cross-Origin Isolated:', window.crossOriginIsolated);
                console.log('[FFmpeg] Initializing with local assets:', localCoreBaseURL);

                try {
                    await loadWithTimeout({
                        coreURL: `${localCoreBaseURL}/ffmpeg-core.js`,
                        wasmURL: `${localCoreBaseURL}/ffmpeg-core.wasm`,
                        classWorkerURL: localWorkerURL,
                    }, 'local');
                } catch (localErr) {
                    console.warn('[FFmpeg] Local core load failed, falling back to CDN:', localErr);
                    console.log('[FFmpeg] Initializing with CDN assets:', cdnBaseURL);
                    await loadWithTimeout({
                        coreURL: await toBlobURL(`${cdnBaseURL}/ffmpeg-core.js`, 'text/javascript'),
                        wasmURL: await toBlobURL(`${cdnBaseURL}/ffmpeg-core.wasm`, 'application/wasm'),
                        classWorkerURL: localWorkerURL,
                    }, 'CDN');
                }

                console.log('[FFmpeg] Core loaded successfully.');
                setIsLoaded(true);
            } catch (err) {
                console.error('[FFmpeg] Failed to load:', err);
                throw err;
            } finally {
                loadPromiseRef.current = null;
            }
        })();

        return loadPromiseRef.current;
    };

    const convertWavToFlac = async (wavBlob: Blob): Promise<Blob> => {
        if (!isLoaded) {
            await load();
        }

        const ffmpeg = ffmpegRef.current;
        setIsConverting(true);
        setProgress(0);

        try {
            const inputName = 'input.wav';
            const outputName = 'output.flac';

            await ffmpeg.writeFile(inputName, await fetchFile(wavBlob));

            // Max compression level 8
            await ffmpeg.exec([
                '-i', inputName,
                '-c:a', 'flac',
                '-compression_level', '8',
                outputName
            ]);

            const data = await ffmpeg.readFile(outputName);
            // Copy exact bytes to avoid including unrelated memory from the backing buffer.
            const dataArray = data as Uint8Array;
            const exact = new Uint8Array(dataArray.byteLength);
            exact.set(dataArray);
            return new Blob([exact], { type: 'audio/flac' });
        } catch (error) {
            console.error('Conversion failed', error);
            throw error;
        } finally {
            setIsConverting(false);
        }
    };

    const convertAudioToWav = async (inputBlob: Blob, metadata?: import('../types').WavMetadata): Promise<Blob> => {
        if (!isLoaded) {
            await load();
        }

        const ffmpeg = ffmpegRef.current;
        setIsConverting(true);
        setProgress(0);

        try {
            const inputName = 'input_tmp';
            const outputName = 'output.raw';

            await ffmpeg.writeFile(inputName, await fetchFile(inputBlob));

            // Extract raw PCM 32-bit float (little-endian), 48kHz, Stereo
            // We use raw format (-f f32le) to bypass FFmpeg's WAV muxer, which
            // forces WAVEFORMATEXTENSIBLE and 'fact' chunks that the hardware rejects.
            await ffmpeg.exec([
                '-i', inputName,
                '-f', 'f32le',
                '-ar', '48000',
                '-ac', '2',
                outputName
            ]);

            const pcmData = await ffmpeg.readFile(outputName) as Uint8Array;
            const dataSize = pcmData.length;

            // 1. Prepare Metadata Chunks
            const infoBytes: number[] = [];
            if (metadata) {
                const infoChunks: { id: string, value: string }[] = [];

                infoChunks.push({ id: 'IART', value: 'Spotykach Builder' });

                if (metadata.tempo) {
                    infoChunks.push({ id: 'ITMP', value: metadata.tempo.toString() });
                }

                if (metadata.id || metadata.hash || metadata.processing || metadata.tempo) {
                    const jsonPayload = JSON.stringify({
                        id: metadata.id,
                        h: metadata.hash,
                        p: metadata.processing,
                        t: metadata.tempo
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

            // CUE Chunk
            const cuePoints: number[] = metadata?.slicePoints || [];
            const cueBodySize = cuePoints.length > 0 ? 4 + (cuePoints.length * 24) : 0;
            const cueChunkSize = cuePoints.length > 0 ? 8 + cueBodySize : 0;

            // RIFF size
            // RIFF (12) + FMT (24) + DATA (8 + dataSize) + LIST (listChunkSize) + CUE (cueChunkSize)
            const riffSize = 4 + 24 + (8 + dataSize) + listChunkSize + cueChunkSize;

            const buffer = new ArrayBuffer(8 + riffSize);
            const view = new DataView(buffer);
            let offset = 0;

            const writeString = (str: string) => {
                for (let i = 0; i < str.length; i++) {
                    view.setUint8(offset + i, str.charCodeAt(i));
                }
                offset += str.length;
            };

            // "RIFF"
            writeString('RIFF');
            // File size
            view.setUint32(offset, riffSize, true); offset += 4;
            // "WAVE"
            writeString('WAVE');
            // "fmt "
            writeString('fmt ');
            // Subchunk1Size (16 for standard PCM/Float without extensible)
            view.setUint32(offset, 16, true); offset += 4;
            // AudioFormat (3 for IEEE Float)
            view.setUint16(offset, 3, true); offset += 2;
            // NumChannels (2)
            view.setUint16(offset, 2, true); offset += 2;
            // SampleRate (48000)
            view.setUint32(offset, 48000, true); offset += 4;
            // ByteRate (SampleRate * NumChannels * BitsPerSample/8)
            view.setUint32(offset, 48000 * 2 * 4, true); offset += 4;
            // BlockAlign (NumChannels * BitsPerSample/8)
            view.setUint16(offset, 8, true); offset += 2;
            // BitsPerSample (32)
            view.setUint16(offset, 32, true); offset += 2;
            // "data"
            writeString('data');
            // Subchunk2Size (data size)
            view.setUint32(offset, dataSize, true); offset += 4;

            // Write raw PCM data after the header
            new Uint8Array(buffer).set(pcmData, offset);
            offset += dataSize;

            // Write LIST Chunk
            if (listBodySize > 0) {
                writeString('LIST');
                view.setUint32(offset, listBodySize, true); offset += 4;

                infoBytes.forEach(b => {
                    view.setUint8(offset, b);
                    offset++;
                });

                if (listBodySize % 2 !== 0) {
                    view.setUint8(offset, 0); offset++;
                }
            }

            // Write CUE Chunk
            if (cuePoints.length > 0) {
                writeString('cue ');
                view.setUint32(offset, cueBodySize, true); offset += 4;
                view.setUint32(offset, cuePoints.length, true); offset += 4;

                cuePoints.forEach((point, index) => {
                    const id = index + 1;
                    const sampleOffset = Math.round(point * 48000);

                    view.setUint32(offset, id, true); offset += 4;
                    view.setUint32(offset, 0, true); offset += 4;
                    writeString('data');
                    view.setUint32(offset, 0, true); offset += 4;
                    view.setUint32(offset, 0, true); offset += 4;
                    view.setUint32(offset, sampleOffset, true); offset += 4;
                });
            }

            return new Blob([buffer], { type: 'audio/wav' });
        } catch (error) {
            console.error('WAV Conversion failed', error);
            throw error;
        } finally {
            setIsConverting(false);
        }
    };

    return {
        isLoaded,
        progress,
        isConverting,
        convertWavToFlac,
        convertAudioToWav,
        load
    };
};
