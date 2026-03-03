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

    // 3-Band EQ using BiquadFilters (Low Shelf 300Hz, Mid Peaking 1kHz, High Shelf 4kHz)
    async applyEQ(buffer: AudioBuffer, lowGain: number, midGain: number, highGain: number): Promise<AudioBuffer> {
        // Skip if all bands are at 0 (no change)
        if (lowGain === 0 && midGain === 0 && highGain === 0) return buffer;

        const offlineCtx = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
        const source = offlineCtx.createBufferSource();
        source.buffer = buffer;

        // Low Shelf — 300Hz
        const lowShelf = offlineCtx.createBiquadFilter();
        lowShelf.type = 'lowshelf';
        lowShelf.frequency.value = 300;
        lowShelf.gain.value = lowGain;

        // Mid Peaking — 1kHz, Q=1.0
        const midPeak = offlineCtx.createBiquadFilter();
        midPeak.type = 'peaking';
        midPeak.frequency.value = 1000;
        midPeak.Q.value = 1.0;
        midPeak.gain.value = midGain;

        // High Shelf — 4kHz
        const highShelf = offlineCtx.createBiquadFilter();
        highShelf.type = 'highshelf';
        highShelf.frequency.value = 4000;
        highShelf.gain.value = highGain;

        // Chain: source → low → mid → high → destination
        source.connect(lowShelf);
        lowShelf.connect(midPeak);
        midPeak.connect(highShelf);
        highShelf.connect(offlineCtx.destination);

        source.start();
        return await offlineCtx.startRendering();
    }

    // Flexible N-Band EQ using peaking filters (standard for graphic EQs)
    async applyAdvancedEQ(buffer: AudioBuffer, bands: { freq: number, gain: number }[]): Promise<AudioBuffer> {
        if (bands.every(b => b.gain === 0)) return buffer;

        const offlineCtx = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
        const source = offlineCtx.createBufferSource();
        source.buffer = buffer;

        let lastNode: AudioNode = source;

        for (const band of bands) {
            if (band.gain === 0) continue;
            const filter = offlineCtx.createBiquadFilter();
            filter.type = 'peaking';
            filter.frequency.value = band.freq;
            filter.Q.value = 1.41; // Typical Q for 1-octave bands
            filter.gain.value = band.gain;
            lastNode.connect(filter);
            lastNode = filter;
        }

        lastNode.connect(offlineCtx.destination);
        source.start();
        return await offlineCtx.startRendering();
    }

    // Limiter using DynamicsCompressorNode with makeup gain
    async applyLimiter(buffer: AudioBuffer, ceiling: number = -0.3, threshold: number = -6): Promise<AudioBuffer> {
        const offlineCtx = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
        const source = offlineCtx.createBufferSource();
        source.buffer = buffer;

        // Compressor configured as limiter (high ratio, fast attack)
        const compressor = offlineCtx.createDynamicsCompressor();
        compressor.threshold.value = threshold;
        compressor.knee.value = 0;        // Hard knee for limiting
        compressor.ratio.value = 20;      // Aggressive ratio
        compressor.attack.value = 0.003;  // 3ms attack
        compressor.release.value = 0.05;  // 50ms release

        // Makeup gain to reach ceiling
        const makeupGain = offlineCtx.createGain();
        const makeupDb = ceiling - threshold;
        makeupGain.gain.value = Math.pow(10, makeupDb / 20);

        // Chain: source → compressor → makeup → destination
        source.connect(compressor);
        compressor.connect(makeupGain);
        makeupGain.connect(offlineCtx.destination);

        source.start();
        return await offlineCtx.startRendering();
    }

    // Hard Limiter / Clipper (cuts off everything above threshold without makeup gain)
    async applyHardLimiter(buffer: AudioBuffer, thresholdDb: number): Promise<AudioBuffer> {
        const sampleRate = buffer.sampleRate;
        const length = buffer.length;
        const channels = buffer.numberOfChannels;
        const thresholdAmp = Math.pow(10, thresholdDb / 20);

        const newBuffer = new AudioBuffer({ length, numberOfChannels: channels, sampleRate });

        for (let c = 0; c < channels; c++) {
            const oldData = buffer.getChannelData(c);
            const newData = newBuffer.getChannelData(c);

            for (let i = 0; i < length; i++) {
                const sample = oldData[i];
                if (sample > thresholdAmp) {
                    newData[i] = thresholdAmp;
                } else if (sample < -thresholdAmp) {
                    newData[i] = -thresholdAmp;
                } else {
                    newData[i] = sample;
                }
            }
        }

        return newBuffer;
    }

    // Cut regions from buffer and merge remaining pieces with crossfade
    async cutAndMerge(
        buffer: AudioBuffer,
        regionsToRemove: { start: number; end: number }[],
        crossfade: number = 0.01 // seconds
    ): Promise<AudioBuffer> {
        if (regionsToRemove.length === 0) return buffer;

        const sr = buffer.sampleRate;
        const channels = buffer.numberOfChannels;

        // Sort regions by start time and validate no overlaps
        const sorted = [...regionsToRemove].sort((a, b) => a.start - b.start);
        for (let i = 1; i < sorted.length; i++) {
            if (sorted[i].start < sorted[i - 1].end) {
                throw new Error('Cut regions must not overlap');
            }
        }

        // Build "keep" segments (the parts between cuts)
        const keeps: { start: number; end: number }[] = [];
        let cursor = 0;
        for (const region of sorted) {
            const rStart = Math.max(0, Math.round(region.start * sr));
            const rEnd = Math.min(buffer.length, Math.round(region.end * sr));
            if (cursor < rStart) {
                keeps.push({ start: cursor, end: rStart });
            }
            cursor = rEnd;
        }
        if (cursor < buffer.length) {
            keeps.push({ start: cursor, end: buffer.length });
        }

        if (keeps.length === 0) {
            throw new Error('Cannot remove all audio');
        }

        // Calculate crossfade in samples
        const xfadeSamples = Math.round(crossfade * sr);

        // Calculate total output length
        let totalLength = 0;
        for (const k of keeps) {
            totalLength += (k.end - k.start);
        }
        // Subtract overlap from crossfades between segments
        totalLength -= xfadeSamples * Math.max(0, keeps.length - 1);
        totalLength = Math.max(1, totalLength);

        // Create output buffer
        const ctx = new OfflineAudioContext(channels, totalLength, sr);
        const outBuffer = ctx.createBuffer(channels, totalLength, sr);

        // Copy segments with crossfade
        let writePos = 0;
        for (let ch = 0; ch < channels; ch++) {
            const inputData = buffer.getChannelData(ch);
            const outputData = outBuffer.getChannelData(ch);
            writePos = 0;

            for (let si = 0; si < keeps.length; si++) {
                const seg = keeps[si];
                const segLen = seg.end - seg.start;

                for (let i = 0; i < segLen; i++) {
                    const sampleIdx = seg.start + i;
                    let sample = inputData[sampleIdx];

                    // Fade out at end of segment (if not last segment)
                    if (si < keeps.length - 1 && i >= segLen - xfadeSamples) {
                        const fadePos = i - (segLen - xfadeSamples);
                        const fadeOut = 1 - (fadePos / xfadeSamples);
                        sample *= fadeOut;
                    }

                    // Fade in at start of segment (if not first segment)
                    if (si > 0 && i < xfadeSamples) {
                        const fadeIn = i / xfadeSamples;
                        sample *= fadeIn;
                    }

                    const outIdx = writePos + i;
                    if (outIdx < totalLength) {
                        // Add (for crossfade overlap regions, this blends the two)
                        outputData[outIdx] += sample;
                    }
                }

                // Move write position, overlapping by crossfade amount
                writePos += segLen;
                if (si < keeps.length - 1) {
                    writePos -= xfadeSamples;
                }
            }
        }

        return outBuffer;
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

    freqToNote(freq: number): string {
        if (freq <= 0) return "";
        const notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
        const halfStepsFromA4 = Math.round(12 * Math.log2(freq / 440));
        const midiNumber = halfStepsFromA4 + 69;
        const noteIndex = midiNumber % 12;
        const octave = Math.floor(midiNumber / 12) - 1;
        return notes[noteIndex] + octave;
    }

    // Pitch Detection using Autocorrelation (simplified)
    async detectPitch(buffer: AudioBuffer, startSec: number, endSec: number): Promise<{ frequency: number; confidence: number }> {
        const sr = buffer.sampleRate;
        const start = Math.floor(startSec * sr);
        const end = Math.ceil(endSec * sr);
        const data = buffer.getChannelData(0).subarray(start, end);

        if (data.length < 1024) return { frequency: 0, confidence: 0 };

        // Auto-correlation
        const size = Math.min(data.length, 2048);
        const rms = Math.sqrt(data.reduce((acc, val) => acc + val * val, 0) / data.length);
        if (rms < 0.01) return { frequency: 0, confidence: 0 }; // Too quiet

        let bestOffset = -1;
        let bestCorrelation = 0;

        for (let offset = Math.floor(sr / 1000); offset < Math.floor(sr / 50); offset++) {
            let correlation = 0;
            for (let i = 0; i < size - offset; i++) {
                correlation += Math.abs(data[i] - data[i + offset]);
            }
            correlation = 1 - (correlation / (size - offset));
            if (correlation > bestCorrelation) {
                bestCorrelation = correlation;
                bestOffset = offset;
            }
        }

        if (bestOffset === -1) return { frequency: 0, confidence: 0 };
        return { frequency: sr / bestOffset, confidence: bestCorrelation };
    }

    // High quality pitch shifting using Resampling (ASETRATE style)
    // NOTE: This changes length. For a real DAW pitch shift (preserving length), 
    // a Phase Vocoder or SOLA would be needed. 
    // However, for Waveform Editing, "Resample Pitch" is often what's wanted for a vintage feel.
    // High quality pitch shifting using Resampling (ASETRATE style)
    // NOTE: This changes length. For a real DAW pitch shift (preserving length), 
    // a Phase Vocoder or SOLA would be needed. 
    // However, for Waveform Editing, "Resample Pitch" is often what's wanted for a vintage feel.
    async applyPitchShift(buffer: AudioBuffer, semitones: number): Promise<AudioBuffer> {
        const ratio = Math.pow(2, semitones / 12);

        // We resample to standard rate but play at speed, OR we keep rate and resample the data.
        // To maintain the user's expected duration in the editor (which uses buffer.duration),
        // we should keep the same sample rate but change the data points.

        const offlineCtx = new OfflineAudioContext(
            buffer.numberOfChannels,
            Math.floor(buffer.length / ratio),
            buffer.sampleRate
        );
        const source = offlineCtx.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = ratio;
        source.connect(offlineCtx.destination);
        source.start(0);

        return await offlineCtx.startRendering();
    }

    /**
     * applyPitchShiftToRange
     * Resamples a specific range within a buffer and merges it with the original prefix/suffix.
     * Uses crossfades at boundaries to ensure smooth transitions.
     */
    async applyPitchShiftToRange(
        buffer: AudioBuffer,
        startSec: number,
        endSec: number,
        semitones: number,
        crossfadeMs: number = 20
    ): Promise<AudioBuffer> {
        if (semitones === 0) return buffer;
        const sr = buffer.sampleRate;
        const fadeLen = Math.floor((crossfadeMs / 1000) * sr);

        // 1. Extract the segment and resample it
        const startIdx = Math.floor(startSec * sr);
        const endIdx = Math.ceil(endSec * sr);
        const segmentLen = endIdx - startIdx;

        if (segmentLen <= 0) return buffer;

        // Extract segment
        const segmentBuffer = new AudioBuffer({
            numberOfChannels: buffer.numberOfChannels,
            length: segmentLen,
            sampleRate: sr
        });
        for (let c = 0; c < buffer.numberOfChannels; c++) {
            segmentBuffer.copyToChannel(buffer.getChannelData(c).slice(startIdx, endIdx), c);
        }

        const resampledSegment = await this.applyPitchShift(segmentBuffer, semitones);

        // 2. Prep boundaries
        const prefixLen = Math.max(0, startIdx);
        const suffixStart = Math.min(buffer.length, endIdx);
        const suffixLen = buffer.length - suffixStart;

        // 3. Assemble final buffer with crossfades
        // Total length = prefix + resampled + suffix
        // We'll overlap the resampled segment with prefix and suffix over fadeLen
        const finalLength = prefixLen + resampledSegment.length + suffixLen;
        const finalBuffer = new AudioBuffer({
            numberOfChannels: buffer.numberOfChannels,
            length: finalLength,
            sampleRate: sr
        });

        for (let c = 0; c < buffer.numberOfChannels; c++) {
            const finalData = finalBuffer.getChannelData(c);
            const originalData = buffer.getChannelData(c);
            const resampledData = resampledSegment.getChannelData(c);

            // Current write position in finalData
            let currentWritePos = 0;

            // Copy Prefix (minus fade region)
            const prefixCopyLen = Math.max(0, prefixLen - fadeLen);
            if (prefixCopyLen > 0) {
                finalData.set(originalData.subarray(0, prefixCopyLen), currentWritePos);
                currentWritePos += prefixCopyLen;
            }

            // Crossfade 1: Prefix End -> Resampled Start
            // This happens if there's a prefix AND a resampled segment
            if (prefixLen > 0 && resampledData.length > 0) {
                const actualFade1 = Math.min(fadeLen, prefixLen, resampledData.length);
                for (let i = 0; i < actualFade1; i++) {
                    const alpha = i / actualFade1;
                    const origSample = originalData[prefixLen - actualFade1 + i];
                    const resampledSample = resampledData[i];
                    finalData[currentWritePos + i] = origSample * (1 - alpha) + resampledSample * alpha;
                }
                currentWritePos += actualFade1;
            } else if (resampledData.length > 0 && prefixLen === 0) {
                // If no prefix, just copy the start of resampled segment (up to fadeLen)
                // This handles the case where the pitched segment starts at the beginning of the file
                const copyLen = Math.min(fadeLen, resampledData.length);
                finalData.set(resampledData.subarray(0, copyLen), currentWritePos);
                currentWritePos += copyLen;
            }


            // Copy body of resampled segment (not involved in crossfades)
            const resampledBodyStart = Math.min(resampledData.length, Math.max(0, fadeLen)); // Start after potential fade-in
            const resampledBodyEnd = Math.max(resampledBodyStart, resampledData.length - fadeLen); // End before potential fade-out
            if (resampledBodyEnd > resampledBodyStart) {
                finalData.set(resampledData.subarray(resampledBodyStart, resampledBodyEnd), currentWritePos);
                currentWritePos += (resampledBodyEnd - resampledBodyStart);
            }

            // Crossfade 2: Resampled End -> Suffix Start
            // This happens if there's a suffix AND a resampled segment
            if (suffixLen > 0 && resampledData.length > 0) {
                const actualFade2 = Math.min(fadeLen, suffixLen, resampledData.length);
                const resampledFadeOutStartIdx = resampledData.length - actualFade2;
                for (let i = 0; i < actualFade2; i++) {
                    const alpha = i / actualFade2;
                    const resampledSample = resampledData[resampledFadeOutStartIdx + i];
                    const suffixSample = originalData[suffixStart + i];
                    finalData[currentWritePos + i] = resampledSample * (1 - alpha) + suffixSample * alpha;
                }
                currentWritePos += actualFade2;
            } else if (resampledData.length > 0 && suffixLen === 0) {
                // If no suffix, just copy the end of resampled segment (up to fadeLen)
                // This handles the case where the pitched segment ends at the end of the file
                const copyLen = Math.min(fadeLen, resampledData.length);
                finalData.set(resampledData.subarray(resampledData.length - copyLen), currentWritePos);
                currentWritePos += copyLen;
            }

            // Copy rest of suffix (minus fade region)
            const suffixCopyStart = Math.max(0, fadeLen); // Start after potential fade-in
            if (suffixLen > suffixCopyStart) {
                finalData.set(originalData.subarray(suffixStart + suffixCopyStart), currentWritePos);
                currentWritePos += (suffixLen - suffixCopyStart);
            }
        }

        return finalBuffer;
    }

    async applyMultiPitchShift(
        buffer: AudioBuffer,
        regions: { id: string; start: number; end: number; semitones: number }[],
        crossfadeMs: number = 20
    ): Promise<{ buffer: AudioBuffer; previewRegions: { id: string; start: number; end: number; semitones: number }[] }> {
        if (regions.length === 0) return { buffer, previewRegions: [] };

        // Sort regions by start time
        const sortedRegions = [...regions]
            .filter(r => r.semitones !== 0) // Only process regions that actually change pitch
            .sort((a, b) => a.start - b.start);

        if (sortedRegions.length === 0) return { buffer, previewRegions: [] };

        const sr = buffer.sampleRate;
        const fadeLen = Math.floor((crossfadeMs / 1000) * sr);

        // 1. Extract all segments (original and pitched)
        const segmentMeta: { buffer: AudioBuffer; regionId?: string; semitones: number }[] = [];
        let lastBufferEndIdx = 0;

        for (const region of sortedRegions) {
            const startIdx = Math.floor(region.start * sr);
            const endIdx = Math.ceil(region.end * sr);

            // Original segment before this region
            if (startIdx > lastBufferEndIdx) {
                const len = startIdx - lastBufferEndIdx;
                const orig = new AudioBuffer({ numberOfChannels: buffer.numberOfChannels, length: len, sampleRate: sr });
                for (let c = 0; c < buffer.numberOfChannels; c++) {
                    orig.getChannelData(c).set(buffer.getChannelData(c).subarray(lastBufferEndIdx, startIdx));
                }
                segmentMeta.push({ buffer: orig, semitones: 0 });
            }

            // The Pitched segment
            const tuneLen = endIdx - startIdx;
            if (tuneLen > 0) {
                const tuneSeg = new AudioBuffer({ numberOfChannels: buffer.numberOfChannels, length: tuneLen, sampleRate: sr });
                for (let c = 0; c < buffer.numberOfChannels; c++) {
                    tuneSeg.getChannelData(c).set(buffer.getChannelData(c).subarray(startIdx, endIdx));
                }
                const pitched = await this.applyPitchShift(tuneSeg, region.semitones);
                segmentMeta.push({ buffer: pitched, regionId: region.id, semitones: region.semitones });
            }

            lastBufferEndIdx = endIdx;
        }

        // Final original segment
        if (lastBufferEndIdx < buffer.length) {
            const len = buffer.length - lastBufferEndIdx;
            const last = new AudioBuffer({ numberOfChannels: buffer.numberOfChannels, length: len, sampleRate: sr });
            for (let c = 0; c < buffer.numberOfChannels; c++) {
                last.getChannelData(c).set(buffer.getChannelData(c).subarray(lastBufferEndIdx));
            }
            segmentMeta.push({ buffer: last, semitones: 0 });
        }

        // 2. Concatenate with crossfades
        const numJoins = segmentMeta.length - 1;
        const totalRawLen = segmentMeta.reduce((acc, s) => acc + s.buffer.length, 0);
        const finalLength = Math.max(1, totalRawLen - (numJoins * fadeLen));

        const finalBuffer = new AudioBuffer({
            numberOfChannels: buffer.numberOfChannels,
            length: finalLength,
            sampleRate: sr
        });

        const previewRegions: { id: string; start: number; end: number; semitones: number }[] = [];
        let writeOffset = 0;

        for (let i = 0; i < segmentMeta.length; i++) {
            const seg = segmentMeta[i];
            const isFirst = i === 0;
            const segLen = seg.buffer.length;

            // Track where this segment starts and ends in the NEW buffer
            if (seg.regionId) {
                const actualStart = isFirst ? 0 : writeOffset - fadeLen;
                previewRegions.push({
                    id: seg.regionId,
                    start: actualStart / sr,
                    end: (actualStart + segLen) / sr,
                    semitones: seg.semitones
                });
            }

            for (let c = 0; c < buffer.numberOfChannels; c++) {
                const segData = seg.buffer.getChannelData(c);
                const finalData = finalBuffer.getChannelData(c);

                if (!isFirst && fadeLen > 0 && writeOffset >= fadeLen) {
                    const actualFade = Math.min(fadeLen, segLen);
                    for (let j = 0; j < actualFade; j++) {
                        const alpha = j / actualFade;
                        const prevSample = finalData[writeOffset - fadeLen + j];
                        const currSample = segData[j];
                        finalData[writeOffset - fadeLen + j] = prevSample * (1 - alpha) + currSample * alpha;
                    }
                    if (segLen > actualFade) {
                        finalData.set(segData.subarray(actualFade), writeOffset - fadeLen + actualFade);
                    }
                } else {
                    finalData.set(segData, writeOffset);
                }
            }

            if (!isFirst) {
                writeOffset += (segLen - fadeLen);
            } else {
                writeOffset += segLen;
            }
        }

        return { buffer: finalBuffer, previewRegions };
    }

    // Robust export method: Enforces 48kHz and encodes
    async toWav(buffer: AudioBuffer, metadata?: any): Promise<Blob> {
        let processed = buffer;
        if (processed.sampleRate !== 48000) {
            processed = await this.resample(processed, 48000);
        }
        return encodeWAV(processed, metadata);
    }

    async splitToChannels(buffer: AudioBuffer): Promise<{ left: AudioBuffer, right: AudioBuffer | null }> {
        const sr = buffer.sampleRate;
        const leftData = buffer.getChannelData(0);
        const leftBuffer = new AudioBuffer({ length: buffer.length, numberOfChannels: 1, sampleRate: sr });
        leftBuffer.copyToChannel(leftData, 0);

        let rightBuffer: AudioBuffer | null = null;
        if (buffer.numberOfChannels > 1) {
            const rightData = buffer.getChannelData(1);
            rightBuffer = new AudioBuffer({ length: buffer.length, numberOfChannels: 1, sampleRate: sr });
            rightBuffer.copyToChannel(rightData, 0);
        }

        return { left: leftBuffer, right: rightBuffer };
    }
}

export const audioProcessor = new Processor();
