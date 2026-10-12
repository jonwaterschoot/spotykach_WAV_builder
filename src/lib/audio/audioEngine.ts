import type { WavMetadata } from '../../types';
import { readWavHeaderInfo } from './wavHeader';


export class AudioEngine {
    private audioContext: AudioContext;

    constructor() {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    /**
     * Decodes any audio to a 48 kHz WAV. Without `metadata`, a WAV source keeps its
     * slice points (`cue `), tempo and name (`INAM`): decoding drops every chunk, and
     * a card file pulled back in must not lose its slices. Not its id: the caller
     * makes a new record, and the header id must be that record's.
     */
    async loadAndProcessAudio(file: Blob, metadata?: WavMetadata): Promise<{ buffer: AudioBuffer; blob: Blob }> {
        if (!metadata) {
            const source = (await readWavHeaderInfo(file).catch(() => null))?.metadata;
            if (source && (source.slicePoints?.length || source.tempo || source.name)) {
                metadata = { slicePoints: source.slicePoints, tempo: source.tempo, name: source.name };
            }
        }
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
        const blob = await audioProcessor.toWav(processedBuffer, metadata);

        return { buffer: processedBuffer, blob };
    }
}

export const audioEngine = new AudioEngine();
