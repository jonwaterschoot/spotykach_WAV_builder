

export class AudioEngine {
    private audioContext: AudioContext;

    constructor() {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    async loadAndProcessAudio(file: Blob): Promise<{ buffer: AudioBuffer; blob: Blob }> {
        const arrayBuffer = await file.arrayBuffer();
        const originalBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

        // Resample/Encode logic
        // We use the shared processor.
        const { audioProcessor } = await import('./audioProcessor');

        let processedBuffer = originalBuffer;

        // Check if resampling is needed for the BUFFER (for return value)
        if (processedBuffer.sampleRate !== 48000) {
            processedBuffer = await audioProcessor.resample(processedBuffer, 48000);
        }

        // Encode to WAV (using buffer that is now guaranteed 48k)
        const blob = await audioProcessor.toWav(processedBuffer);

        return { buffer: processedBuffer, blob };
    }
}

export const audioEngine = new AudioEngine();
