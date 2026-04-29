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

    const convertAudioToWav = async (inputBlob: Blob): Promise<Blob> => {
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
            const fileSize = 36 + dataSize;

            const buffer = new ArrayBuffer(44 + dataSize);
            const view = new DataView(buffer);

            // "RIFF"
            view.setUint8(0, 0x52); view.setUint8(1, 0x49); view.setUint8(2, 0x46); view.setUint8(3, 0x46);
            // File size
            view.setUint32(4, fileSize, true);
            // "WAVE"
            view.setUint8(8, 0x57); view.setUint8(9, 0x41); view.setUint8(10, 0x56); view.setUint8(11, 0x45);
            // "fmt "
            view.setUint8(12, 0x66); view.setUint8(13, 0x6D); view.setUint8(14, 0x74); view.setUint8(15, 0x20);
            // Subchunk1Size (16 for standard PCM/Float without extensible)
            view.setUint32(16, 16, true);
            // AudioFormat (3 for IEEE Float)
            view.setUint16(20, 3, true);
            // NumChannels (2)
            view.setUint16(22, 2, true);
            // SampleRate (48000)
            view.setUint32(24, 48000, true);
            // ByteRate (SampleRate * NumChannels * BitsPerSample/8)
            view.setUint32(28, 48000 * 2 * 4, true);
            // BlockAlign (NumChannels * BitsPerSample/8)
            view.setUint16(32, 8, true);
            // BitsPerSample (32)
            view.setUint16(34, 32, true);
            // "data"
            view.setUint8(36, 0x64); view.setUint8(37, 0x61); view.setUint8(38, 0x74); view.setUint8(39, 0x61);
            // Subchunk2Size (data size)
            view.setUint32(40, dataSize, true);

            // Write raw PCM data after the 44-byte header
            new Uint8Array(buffer).set(pcmData, 44);

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
