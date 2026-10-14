import { useCallback, useEffect, useRef, useState } from 'react';
import type { Stereo } from '../dsp';
import { STEPS, sequenceFrames, stepAt, stepHits, type Sequence } from '../sequence';

/**
 * Plays a sequence live, looping the chain. A look-ahead scheduler: every 25 ms
 * it books the steps of the next 120 ms on the audio clock, so timing holds even
 * when the page is busy. It reads the sequence afresh for every step, so edits,
 * tempo and swing changes are heard on the next step.
 *
 * Slices are rendered once per sound (`keyFor`: the slice as it is now, plus the
 * track's shift) and kept; a step whose sound isn't ready yet is skipped.
 */

const LOOKAHEAD = 0.12;
const TICK_MS = 25;

export function useSequencePlayer(
    keyFor: (sliceId: string, shift: number) => string | null,
    render: (sliceId: string, shift: number) => Promise<Stereo | null>,
) {
    const contextRef = useRef<AudioContext | null>(null);
    const seqRef = useRef<Sequence | null>(null);
    const buffers = useRef(new Map<string, AudioBuffer | 'pending' | null>());
    const voices = useRef(new Set<AudioBufferSourceNode>());
    const timer = useRef<ReturnType<typeof setInterval> | null>(null);
    const uiTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
    const [playing, setPlaying] = useState(false);
    /** The step being heard (global, within the chain), for the grid's playhead. */
    const [step, setStep] = useState<number | null>(null);

    const keyRef = useRef(keyFor);
    const renderRef = useRef(render);
    useEffect(() => { keyRef.current = keyFor; renderRef.current = render; }, [keyFor, render]);

    const context = () => (contextRef.current ??= new AudioContext({ sampleRate: 48000 }));

    /** Starts rendering a sound if it isn't there yet. */
    const ensure = useCallback((sliceId: string, shift: number): AudioBuffer | null => {
        const key = keyRef.current(sliceId, shift);
        if (!key) return null;
        const have = buffers.current.get(key);
        if (have instanceof AudioBuffer) return have;
        if (have === undefined) {
            buffers.current.set(key, 'pending');
            renderRef.current(sliceId, shift).then(audio => {
                if (!audio) { buffers.current.set(key, null); return; }
                const ctx = context();
                const buffer = ctx.createBuffer(2, audio[0].length, ctx.sampleRate);
                buffer.copyToChannel(audio[0] as Float32Array<ArrayBuffer>, 0);
                buffer.copyToChannel(audio[1] as Float32Array<ArrayBuffer>, 1);
                buffers.current.set(key, buffer);
            }).catch(() => buffers.current.set(key, null));
        }
        return null;
    }, []);

    /** Every sound the sequence uses, rendered ahead so the first loop isn't patchy. */
    const prepare = useCallback((seq: Sequence) => {
        for (const track of seq.tracks) {
            for (const steps of Object.values(track.patterns)) {
                for (const s of steps) {
                    const id = s.on ? s.sliceId ?? track.sliceId : null;
                    if (id) ensure(id, track.shift);
                }
            }
        }
    }, [ensure]);

    const update = useCallback((seq: Sequence) => {
        seqRef.current = seq;
        prepare(seq);
    }, [prepare]);

    const stop = useCallback(() => {
        if (timer.current) clearInterval(timer.current);
        timer.current = null;
        for (const v of voices.current) { try { v.stop(); } catch { /* done */ } }
        voices.current.clear();
        for (const t of uiTimers.current) clearTimeout(t);
        uiTimers.current.clear();
        setPlaying(false);
        setStep(null);
    }, []);

    const start = useCallback(async () => {
        const seq = seqRef.current;
        if (!seq || timer.current) return;
        const ctx = context();
        if (ctx.state === 'suspended') await ctx.resume();
        prepare(seq);
        let k = 0;
        let next = ctx.currentTime + 0.08;
        const tick = () => {
            const s = seqRef.current;
            if (!s) return;
            const total = s.chain.length * STEPS;
            while (next < ctx.currentTime + LOOKAHEAD) {
                const w = k % total;
                for (const hit of stepHits(s, w)) {
                    const buffer = ensure(hit.sliceId, hit.shift);
                    if (!buffer || hit.gain <= 0) continue;
                    const source = ctx.createBufferSource();
                    const gain = ctx.createGain();
                    source.buffer = buffer;
                    gain.gain.value = hit.gain;
                    source.connect(gain).connect(ctx.destination);
                    source.onended = () => voices.current.delete(source);
                    voices.current.add(source);
                    source.start(Math.max(ctx.currentTime, next));
                }
                const at = next;
                const ui = setTimeout(() => { uiTimers.current.delete(ui); setStep(w); }, Math.max(0, (at - ctx.currentTime) * 1000));
                uiTimers.current.add(ui);
                // The next step's time from this tempo and swing: changes land on the next step.
                const sr = ctx.sampleRate;
                const end = w + 1 === total ? sequenceFrames(s, sr) : stepAt(s, w + 1, sr);
                next += (end - stepAt(s, w, sr)) / sr;
                k = w + 1;
            }
        };
        tick();
        timer.current = setInterval(tick, TICK_MS);
        setPlaying(true);
    }, [ensure, prepare]);

    /** A changed slice must be rendered again: drop what was made from the old one. */
    const forget = useCallback(() => { buffers.current.clear(); }, []);

    useEffect(() => () => {
        stop();
        contextRef.current?.close().catch(() => undefined);
    }, [stop]);

    return { playing, step, start, stop, update, forget };
}
