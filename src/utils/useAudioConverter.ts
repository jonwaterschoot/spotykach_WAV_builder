import { useState, useRef } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { assembleWav } from '../lib/audio/wavHeader';

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
        // The core is served from our own origin (public/ffmpeg-core/, a copy of
        // @ffmpeg/core@0.12.10's umd build). There is deliberately no CDN fallback:
        // the app itself comes from this origin, so an origin that can serve the
        // bundle can serve the core too. The only case a fallback covered was the
        // vendored file being missing or corrupt — a deploy error, better seen than
        // masked by quietly running a differently-built binary from a third party.
        const localCoreBaseURL = withBase('ffmpeg-core');
        const localWorkerURL = withBase('ffmpeg-worker/worker.js');
        const ffmpeg = ffmpegRef.current;

        ffmpeg.on('log', ({ message }) => {
            console.log('[FFmpeg Log]', message);
        });

        ffmpeg.on('progress', ({ progress }) => {
            const p = Math.round(progress * 100);
            setProgress(p);
        });

        loadPromiseRef.current = (async () => {
            try {
                console.log('[FFmpeg] Cross-Origin Isolated:', window.crossOriginIsolated);
                console.log('[FFmpeg] Initializing with local assets:', localCoreBaseURL);

                // No abort timeout. The core is a 32 MB same-origin download, and a
                // fetch still running after twenty seconds is slow, not hung — the
                // old timeout mostly punished bad connections. The browser's own
                // network timeouts are the right judge of a dead request.
                await ffmpeg.load({
                    coreURL: `${localCoreBaseURL}/ffmpeg-core.js`,
                    wasmURL: `${localCoreBaseURL}/ffmpeg-core.wasm`,
                    classWorkerURL: localWorkerURL,
                });

                console.log('[FFmpeg] Loaded local core.');
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
            // Whole frames only: a stray partial frame would break block alignment.
            const frames = Math.floor(pcmData.length / 8);

            // A copy, as in convertWavToFlac: only these bytes, never the backing buffer.
            const pcm = pcmData.slice(0, frames * 8);

            // Header layout (LIST before data, cue after) lives in wavHeader.ts
            return assembleWav(pcm, metadata, 48000);
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
