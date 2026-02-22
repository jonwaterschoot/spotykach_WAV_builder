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

    const convertWavToFlac = async (wavBlob: Blob, _fileName: string): Promise<Blob> => {
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

    return {
        isLoaded,
        progress,
        isConverting,
        convertWavToFlac,
        load
    };
};
