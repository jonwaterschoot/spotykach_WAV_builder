import { encodeWAV } from './wavEncoder';

export class Processor {
    // No context needed for direct buffer manipulation

    async applyFades(buffer: AudioBuffer, fadeInDuration: number, fadeOutDuration: number): Promise<AudioBuffer> {
        const channels = buffer.numberOfChannels;
        const length = buffer.length;
        const sampleRate = buffer.sampleRate;

        // Clone buffer efficiently
        const newBuffer = new AudioBuffer({ length, numberOfChannels: channels, sampleRate });

        for (let c = 0; c < channels; c++) {
            const data = buffer.getChannelData(c);
            const newData = newBuffer.getChannelData(c);
            newData.set(data);

            // Apply Fade In
            const fadeInSamples = Math.floor(fadeInDuration * sampleRate);
            for (let i = 0; i < fadeInSamples && i < length; i++) {
                newData[i] *= (i / fadeInSamples); // Linear fade
            }

            // Apply Fade Out
            const fadeOutSamples = Math.floor(fadeOutDuration * sampleRate);
            const startFadeOut = length - fadeOutSamples;
            for (let i = 0; i < fadeOutSamples && (startFadeOut + i) < length; i++) {
                const idx = startFadeOut + i;
                if (idx >= 0) {
                    newData[idx] *= (1 - (i / fadeOutSamples));
                }
            }
        }

        return newBuffer;
    }

    // Crossfades the end of the buffer mixed into the start
    // Returns a slightly shorter buffer (original length - crossfadeDuration)
    async applyCrossfadeLoop(buffer: AudioBuffer, crossfadeDuration: number): Promise<AudioBuffer> {
        const sampleRate = buffer.sampleRate;
        const fadeSamples = Math.floor(crossfadeDuration * sampleRate);
        const length = buffer.length;

        if (fadeSamples >= length / 2) return buffer; // Too short to loop

        const newLength = length - fadeSamples;
        const newBuffer = new AudioBuffer({ length: newLength, numberOfChannels: buffer.numberOfChannels, sampleRate });

        for (let c = 0; c < buffer.numberOfChannels; c++) {
            const data = buffer.getChannelData(c);
            const newData = newBuffer.getChannelData(c);

            // Copy the main body (excluding the fade tail)
            newData.set(data.subarray(0, newLength));

            // Mix tail into head
            const tail = data.subarray(newLength, length);

            for (let i = 0; i < fadeSamples; i++) {
                // Linear Crossfade: Head fades IN (0 to 1), Tail fades OUT (1 to 0) ?
                // Actually for a seamless loop, we want the Transition from End -> Start to be smooth.
                // So at the very start of the file, we want it to sound like the end of the file.
                // So we mix the End (Tail) into the Start (Head).
                // Usually: Start[i] = Start[i] * (i / fadeLen) + Tail[i] * (1 - i / fadeLen)
                // At i=0: Start is 0, Tail is 1. (We hear the tail).
                // At i=fadeLen: Start is 1, Tail is 0. (We hear the start).
                // This makes the seam invisible because the Start *becomes* the continuation of the Tail.

                const gainHead = i / fadeSamples;
                const gainTail = 1 - gainHead;

                newData[i] = (newData[i] * gainHead) + (tail[i] * gainTail);
            }
        }

        return newBuffer;
    }

    // Simple trim
    async trim(buffer: AudioBuffer, start: number, end: number): Promise<AudioBuffer> {
        const sampleRate = buffer.sampleRate;
        const startSample = Math.floor(start * sampleRate);
        const endSample = Math.ceil(end * sampleRate);

        // Clamp to valid range to prevent off-by-one errors (trailing zeros)
        const safeStart = Math.max(0, Math.min(buffer.length, startSample));
        const safeEnd = Math.max(0, Math.min(buffer.length, endSample));
        const length = safeEnd - safeStart;

        if (length <= 0) return buffer;

        const newBuffer = new AudioBuffer({ length, numberOfChannels: buffer.numberOfChannels, sampleRate });

        for (let c = 0; c < buffer.numberOfChannels; c++) {
            const data = buffer.getChannelData(c).subarray(safeStart, safeEnd);
            newBuffer.getChannelData(c).set(data);
        }

        return newBuffer;
    }
    async normalize(buffer: AudioBuffer, targetDb: number = -1): Promise<AudioBuffer> {
        const offlineCtx = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
        const source = offlineCtx.createBufferSource();
        source.buffer = buffer;

        // Calculate peak amplitude
        let maxAmp = 0;
        for (let i = 0; i < buffer.numberOfChannels; i++) {
            const data = buffer.getChannelData(i);
            for (let j = 0; j < data.length; j++) {
                const abs = Math.abs(data[j]);
                if (abs > maxAmp) maxAmp = abs;
            }
        }

        // Calculate gain
        // targetDb = 20 * log10(targetAmp) => targetAmp = 10^(targetDb/20)
        const targetAmp = Math.pow(10, targetDb / 20);

        // If silence, do nothing
        if (maxAmp === 0) return buffer;

        const gainValue = targetAmp / maxAmp;

        // Apply gain
        const gainNode = offlineCtx.createGain();
        gainNode.gain.value = gainValue;

        source.connect(gainNode);
        gainNode.connect(offlineCtx.destination);

        source.start();
        return await offlineCtx.startRendering();
    }

    // Apply gain to a specific range with smoothing at boundaries
    async applyGain(buffer: AudioBuffer, start: number, end: number, gainDb: number, smoothingMs: number = 20): Promise<AudioBuffer> {
        // Convert smoothing to samples
        const sampleRate = buffer.sampleRate;
        const smoothSamples = Math.floor((smoothingMs / 1000) * sampleRate);
        const startSample = Math.floor(start * sampleRate);
        const endSample = Math.ceil(end * sampleRate);
        const gainValue = Math.pow(10, gainDb / 20);

        const newBuffer = new AudioBuffer({
            length: buffer.length,
            numberOfChannels: buffer.numberOfChannels,
            sampleRate: buffer.sampleRate
        });

        for (let c = 0; c < buffer.numberOfChannels; c++) {
            const oldData = buffer.getChannelData(c);
            const newData = newBuffer.getChannelData(c);
            newData.set(oldData);

            // Calculate actual range
            const safeStart = Math.max(0, startSample);
            const safeEnd = Math.min(buffer.length, endSample);

            // 1. Full Gain Range
            for (let i = safeStart; i < safeEnd; i++) {
                // Determine gain multiplier for this sample
                let multiplier = gainValue;

                // Apply Ramp UP at Start
                // If we are within the first 'smoothSamples' of the selection
                if (i < safeStart + smoothSamples) {
                    const progress = (i - safeStart) / smoothSamples;
                    // Interpolate from 1.0 (original) to gainValue
                    // Linear ramp for now (could be cosine)
                    multiplier = 1.0 + (gainValue - 1.0) * progress;
                }

                // Apply Ramp DOWN at End
                // If we are within the last 'smoothSamples' of the selection
                if (i > safeEnd - smoothSamples) {
                    const progress = (safeEnd - i) / smoothSamples; // 1 at end start, 0 at very end
                    // Interpolate from 1.0 (original) to gainValue (backwards)
                    multiplier = 1.0 + (gainValue - 1.0) * progress;
                }

                newData[i] *= multiplier;
            }
        }
        return newBuffer;
    }

    // Apply complex volume envelope defined by keyframes
    async applyEnvelope(buffer: AudioBuffer, points: { time: number, value: number }[], smoothing: boolean = true): Promise<AudioBuffer> {
        const sampleRate = buffer.sampleRate;
        const length = buffer.length;
        const channels = buffer.numberOfChannels;

        const newBuffer = new AudioBuffer({ length, numberOfChannels: channels, sampleRate });

        // Sort points by time
        const sortedPoints = [...points].sort((a, b) => a.time - b.time);

        for (let c = 0; c < channels; c++) {
            const originalData = buffer.getChannelData(c);
            const newData = newBuffer.getChannelData(c);

            // If no points, copy original
            if (sortedPoints.length === 0) {
                newData.set(originalData);
                continue;
            }

            // 1. Before first point: Apply constant gain of first point 
            let currentSample = 0;
            const first = sortedPoints[0];
            const firstSample = Math.floor(first.time * sampleRate);
            const firstGain = first.value;

            for (let i = 0; i < firstSample && i < length; i++) {
                newData[i] = originalData[i] * firstGain;
            }
            currentSample = firstSample;

            // 2. Between points
            for (let p = 0; p < sortedPoints.length - 1; p++) {
                const p1 = sortedPoints[p];
                const p2 = sortedPoints[p + 1];

                const startSamp = Math.floor(p1.time * sampleRate);
                const endSamp = Math.floor(p2.time * sampleRate);

                if (endSamp <= startSamp) continue;

                const g1 = p1.value;
                const g2 = p2.value;
                const duration = endSamp - startSamp;

                for (let i = startSamp; i < endSamp && i < length; i++) {
                    const progress = (i - startSamp) / duration;
                    let gain = 0;
                    if (smoothing) {
                        // Cosine interpolation
                        const mu = (1 - Math.cos(progress * Math.PI)) / 2;
                        gain = g1 * (1 - mu) + g2 * mu;
                    } else {
                        // Linear
                        gain = g1 + (g2 - g1) * progress;
                    }
                    newData[i] = originalData[i] * gain;
                }
                currentSample = endSamp;
            }

            // 3. After last point
            const last = sortedPoints[sortedPoints.length - 1];
            const lastGain = last.value;
            for (let i = currentSample; i < length; i++) {
                newData[i] = originalData[i] * lastGain;
            }
        }

        return newBuffer;
    }
    async resample(buffer: AudioBuffer, targetSampleRate: number): Promise<AudioBuffer> {
        if (buffer.sampleRate === targetSampleRate) {
            return buffer;
        }

        const offlineCtx = new OfflineAudioContext(buffer.numberOfChannels, Math.ceil(buffer.duration * targetSampleRate), targetSampleRate);
        const source = offlineCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(offlineCtx.destination);
        source.start(0);

        return await offlineCtx.startRendering();
    }


    // Robust export method: Enforces 48kHz and encodes
    async toWav(buffer: AudioBuffer, metadata?: any): Promise<Blob> {
        let processed = buffer;
        if (processed.sampleRate !== 48000) {
            processed = await this.resample(processed, 48000);
        }
        return encodeWAV(processed, metadata);
    }
}

export const audioProcessor = new Processor();
