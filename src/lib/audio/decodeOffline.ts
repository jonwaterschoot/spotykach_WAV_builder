/**
 * Decode audio for analysis (duration, peaks) without touching the sound card.
 *
 * A live `AudioContext` opens an output stream, and browsers cap how many can be
 * open: a preset drawing 36 mini waveforms at once, one context each, ran past it,
 * and Chrome reported "an error from the audio device" and the player went silent
 * until a reload. An `OfflineAudioContext` renders to memory only. The audio comes
 * back resampled to `sampleRate`; its duration doesn't change.
 */
export const decodeOffline = (data: ArrayBuffer, sampleRate = 48000): Promise<AudioBuffer> =>
    new OfflineAudioContext(1, 1, sampleRate).decodeAudioData(data);
