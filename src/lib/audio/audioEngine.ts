import { encodeWAV } from './wavEncoder';

export class AudioEngine {
    private audioContext: AudioContext;

    constructor() {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    async loadAndProcessAudio(file: Blob): Promise<{ buffer: AudioBuffer; blob: Blob }> {
        const arrayBuffer = await file.arrayBuffer();
        const originalBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

        // Resample to 48kHz if needed, and ensure Stereo
        let processedBuffer = originalBuffer;
        if (originalBuffer.sampleRate !== 48000 || originalBuffer.numberOfChannels !== 2) {
            processedBuffer = await this.resampleTo48kStereo(originalBuffer);
        }

        const blob = encodeWAV(processedBuffer);
        return { buffer: processedBuffer, blob };
    }

    private async resampleTo48kStereo(sourceBuffer: AudioBuffer): Promise<AudioBuffer> {
        const targetSampleRate = 48000;
        const channels = 2;
        const duration = sourceBuffer.duration;

        // Create OfflineAudioContext
        const validLength = Math.ceil(duration * targetSampleRate);
        const offlineCtx = new OfflineAudioContext(channels, validLength, targetSampleRate);

        // Create Source
        const source = offlineCtx.createBufferSource();
        source.buffer = sourceBuffer;
        source.connect(offlineCtx.destination);
        source.start(0);

        // Render
        return await offlineCtx.startRendering();
    }
}

export const audioEngine = new AudioEngine();
