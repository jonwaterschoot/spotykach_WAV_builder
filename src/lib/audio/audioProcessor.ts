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
        const length = endSample - startSample;

        if (length <= 0) return buffer;

        const newBuffer = new AudioBuffer({ length, numberOfChannels: buffer.numberOfChannels, sampleRate });

        for (let c = 0; c < buffer.numberOfChannels; c++) {
            const data = buffer.getChannelData(c).subarray(startSample, endSample);
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
}

export const audioProcessor = new Processor();
