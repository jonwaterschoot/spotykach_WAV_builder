/**
 * Sample-accurate loop playback for the editor.
 *
 * WaveSurfer plays through an <audio> element, and looping that from JavaScript
 * restarts the region whenever a `timeupdate` happens to notice the end has
 * passed: late by a different amount every pass, then a seek. Even
 * `media.loop = true` leaves the browser a small, uneven gap at the wrap.
 *
 * Here the loop is an `AudioBufferSourceNode` with `loop`, `loopStart` and
 * `loopEnd`: the audio thread wraps on the exact sample, with no JavaScript in the
 * way. WaveSurfer is left to draw; the editor moves its cursor from `position()`.
 */
export class LoopPlayer {
    private ctx: AudioContext | null = null;
    private source: AudioBufferSourceNode | null = null;
    private gain: GainNode | null = null;
    private buffer: AudioBuffer | null = null;
    private loopStart = 0;
    private loopEnd = 0;
    /** Context time and buffer position of the last anchor: position() counts from here. */
    private anchorTime = 0;
    private anchorPos = 0;
    /**
     * True from the moment play() is called, not once the context has resumed:
     * the editor must be able to tell, synchronously, that the looper owns the
     * transport. A stop() during the resume cancels the start (the token moves on).
     */
    private active = false;
    private token = 0;

    get isPlaying() { return this.active; }

    private context(): AudioContext {
        if (!this.ctx || this.ctx.state === 'closed') this.ctx = new AudioContext();
        return this.ctx;
    }

    /** Snap to whole samples, so what is heard is what gets cut. */
    private snap(t: number) {
        const rate = this.buffer?.sampleRate ?? 48000;
        return Math.round(t * rate) / rate;
    }

    /** Plays `buffer` from `offset`, wrapping `[loopStart, loopEnd)` until stopped. */
    async play(buffer: AudioBuffer, loopStart: number, loopEnd: number, offset = loopStart) {
        this.release(0);
        const token = ++this.token;
        this.active = true;

        this.buffer = buffer;
        this.loopStart = this.snap(Math.max(0, loopStart));
        this.loopEnd = this.snap(Math.min(buffer.duration, loopEnd));
        if (this.loopEnd - this.loopStart < 0.005) { this.loopStart = 0; this.loopEnd = buffer.duration; }
        // Before the loop, play in to it (the node only wraps at loopEnd); past it, start over.
        const start = offset >= 0 && offset < this.loopEnd ? this.snap(offset) : this.loopStart;
        this.anchorPos = start;

        const ctx = this.context();
        if (ctx.state === 'suspended') {
            try { await ctx.resume(); } catch { /* the start below still tries */ }
        }
        if (token !== this.token) return;

        const gain = ctx.createGain();
        gain.connect(ctx.destination);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.loopStart = this.loopStart;
        source.loopEnd = this.loopEnd;
        source.connect(gain);

        // A 5 ms ramp in on the first start only: the wrap itself stays untouched.
        const now = ctx.currentTime;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(1, now + 0.005);
        source.start(now, start);

        this.source = source;
        this.gain = gain;
        this.anchorTime = now;
    }

    /** Moves the loop points while playing; the audio thread picks them up on its next block. */
    setLoop(loopStart: number, loopEnd: number) {
        if (!this.active || !this.buffer) return;
        const start = this.snap(Math.max(0, loopStart));
        const end = this.snap(Math.min(this.buffer.duration, loopEnd));
        if (end - start < 0.005) return;
        if (Math.abs(start - this.loopStart) < 1e-6 && Math.abs(end - this.loopEnd) < 1e-6) return;
        this.reanchor();
        this.loopStart = start;
        this.loopEnd = end;
        if (this.source) {
            this.source.loopStart = start;
            this.source.loopEnd = end;
        }
        // Past the new end the node wraps straight to the start.
        if (this.anchorPos >= end) this.anchorPos = start;
    }

    /** Jumps to `time` (a click on the wave), keeping the loop. */
    seek(time: number) {
        if (!this.active || !this.buffer) return;
        void this.play(this.buffer, this.loopStart, this.loopEnd, time);
    }

    /** Where in the buffer the audio is now, in seconds. */
    position(): number {
        if (!this.source || !this.ctx) return this.anchorPos;
        const pos = this.anchorPos + (this.ctx.currentTime - this.anchorTime);
        if (pos < this.loopEnd) return pos;
        const len = this.loopEnd - this.loopStart;
        return this.loopStart + ((pos - this.loopEnd) % len);
    }

    private reanchor() {
        if (!this.ctx || !this.source) return;
        this.anchorPos = this.position();
        this.anchorTime = this.ctx.currentTime;
    }

    /** Level from the editor's fades. Smoothed over a few ms so a frame step doesn't click. */
    setVolume(v: number) {
        if (!this.gain || !this.ctx) return;
        this.gain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.003);
    }

    /** Stops, fading out over `fade` seconds (10 ms by default) so it doesn't pop. */
    stop(fade = 0.01) {
        this.token++;
        this.active = false;
        this.release(fade);
    }

    private release(fade: number) {
        const source = this.source, gain = this.gain, ctx = this.ctx;
        if (!source || !gain || !ctx) return;
        this.reanchor();
        this.source = null;
        this.gain = null;
        const now = ctx.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(0, now + fade);
        source.onended = () => { source.disconnect(); gain.disconnect(); };
        try { source.stop(now + fade + 0.005); } catch { /* already stopped */ }
    }

    dispose() {
        this.stop(0);
        void this.ctx?.close().catch(() => { /* already closed */ });
        this.ctx = null;
        this.buffer = null;
    }
}
