import { useCallback, useEffect, useRef, useState } from 'react';
import type { Stereo } from '../dsp';
import type { SnippetEnvelope } from '../render';
import {
    STEPS, masterGain, sequenceFrames, sequenceSounds, stepAt, stepControls, stepHits, stepFrames,
    type SeqControl, type SeqHit, type Sequence,
} from '../sequence';

/**
 * Plays a sequence live, looping the chain. A look-ahead scheduler: every 25 ms
 * it books the steps of the next 120 ms on the audio clock, so timing holds even
 * when the page is busy. It reads the sequence afresh for every step, so edits,
 * tempo and swing changes are heard on the next step.
 *
 * Slices are rendered once per sound (`keyFor`: the slice as it is now, plus the
 * track's shift and playback envelope) and kept; a step whose sound isn't ready
 * yet is skipped.
 *
 * Two clocks: its own (`start`), or one from outside (`startExternal`, then
 * `externalStep` on every sixteenth of an incoming MIDI clock). Either way each
 * step is also reported (`onStep`), with its time on the MIDI clock, so a MIDI
 * link can send notes and clock from the same timing.
 */

const LOOKAHEAD = 0.12;
const TICK_MS = 25;
/** Room for an incoming MIDI tick to be scheduled: it arrives a little late. */
const EXTERNAL_LATENCY = 0.02;

export interface StepEvent {
    /** Global step within the chain. */
    step: number;
    /** On `performance.now()`'s clock: what Web MIDI's `send` takes. */
    perfMs: number;
    /** The same step without swing, for a steady MIDI clock. */
    gridPerfMs: number;
    /** Length of a sixteenth, ms. */
    stepMs: number;
    hits: Omit<SeqHit, 'at'>[];
    /** CC tracks' messages in this step. */
    controls: SeqControl[];
}

export interface SequencerHooks {
    onStep?: (e: StepEvent) => void;
    onStart?: (perfMs: number) => void;
    onStop?: () => void;
}

export function useSequencePlayer(
    keyFor: (sliceId: string, shift: number, env?: SnippetEnvelope) => string | null,
    render: (sliceId: string, shift: number, env?: SnippetEnvelope) => Promise<Stereo | null>,
    hooks: SequencerHooks = {},
) {
    const contextRef = useRef<AudioContext | null>(null);
    const seqRef = useRef<Sequence | null>(null);
    const buffers = useRef(new Map<string, AudioBuffer | 'pending' | null>());
    const voices = useRef(new Set<AudioBufferSourceNode>());
    const timer = useRef<ReturnType<typeof setInterval> | null>(null);
    const uiTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
    /** External clock: the next step to play, and when the last one came. */
    const external = useRef<{ k: number; lastPerf: number | null } | null>(null);
    const [playing, setPlaying] = useState(false);
    /** Following an outside clock rather than our own. */
    const [following, setFollowing] = useState(false);
    /** The step being heard (global, within the chain), for the grid's playhead. */
    const [step, setStep] = useState<number | null>(null);

    const keyRef = useRef(keyFor);
    const renderRef = useRef(render);
    const hooksRef = useRef(hooks);
    useEffect(() => { keyRef.current = keyFor; renderRef.current = render; hooksRef.current = hooks; }, [keyFor, render, hooks]);

    const masterRef = useRef<GainNode | null>(null);
    const context = () => (contextRef.current ??= new AudioContext({ sampleRate: 48000 }));
    /** Every voice goes through it, so the main volume moves at once, not on the next step. */
    const master = (ctx: AudioContext) => {
        if (!masterRef.current) {
            masterRef.current = ctx.createGain();
            masterRef.current.connect(ctx.destination);
            masterRef.current.gain.value = seqRef.current ? masterGain(seqRef.current) : 1;
        }
        return masterRef.current;
    };
    const toPerf = (ctx: AudioContext, t: number) => performance.now() + (t - ctx.currentTime) * 1000;

    /** Starts rendering a sound if it isn't there yet. */
    const ensure = useCallback((sliceId: string, shift: number, env?: SnippetEnvelope): AudioBuffer | null => {
        const key = keyRef.current(sliceId, shift, env);
        if (!key) return null;
        const have = buffers.current.get(key);
        if (have instanceof AudioBuffer) return have;
        if (have === undefined) {
            buffers.current.set(key, 'pending');
            renderRef.current(sliceId, shift, env).then(audio => {
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
        for (const { sliceId, shift, env } of sequenceSounds(seq)) ensure(sliceId, shift, env);
    }, [ensure]);

    const update = useCallback((seq: Sequence) => {
        seqRef.current = seq;
        const node = masterRef.current;
        if (node && contextRef.current) node.gain.setTargetAtTime(masterGain(seq), contextRef.current.currentTime, 0.02);
        prepare(seq);
    }, [prepare]);

    /** Books one step at audio time `at`: its sounds, the playhead, and the step event. */
    const play = useCallback((ctx: AudioContext, s: Sequence, w: number, at: number, gridAt: number, stepSec: number) => {
        const hits = stepHits(s, w);
        for (const hit of hits) {
            if (!hit.sliceId) continue;
            const buffer = ensure(hit.sliceId, hit.shift, hit.env);
            if (!buffer || hit.gain <= 0) continue;
            const source = ctx.createBufferSource();
            const gain = ctx.createGain();
            source.buffer = buffer;
            gain.gain.value = hit.gain;
            source.connect(gain).connect(master(ctx));
            source.onended = () => voices.current.delete(source);
            voices.current.add(source);
            source.start(Math.max(ctx.currentTime, at));
        }
        const ui = setTimeout(() => { uiTimers.current.delete(ui); setStep(w); }, Math.max(0, (at - ctx.currentTime) * 1000));
        uiTimers.current.add(ui);
        hooksRef.current.onStep?.({
            step: w, perfMs: toPerf(ctx, at), gridPerfMs: toPerf(ctx, gridAt), stepMs: stepSec * 1000, hits,
            controls: stepControls(s, w),
        });
    }, [ensure]);

    const stop = useCallback(() => {
        const was = timer.current !== null || external.current !== null;
        if (timer.current) clearInterval(timer.current);
        timer.current = null;
        external.current = null;
        for (const v of voices.current) { try { v.stop(); } catch { /* done */ } }
        voices.current.clear();
        for (const t of uiTimers.current) clearTimeout(t);
        uiTimers.current.clear();
        setPlaying(false);
        setFollowing(false);
        setStep(null);
        if (was) hooksRef.current.onStop?.();
    }, []);

    const start = useCallback(async () => {
        const seq = seqRef.current;
        if (!seq || timer.current || external.current) return;
        const ctx = context();
        if (ctx.state === 'suspended') await ctx.resume();
        prepare(seq);
        let k = 0;
        let next = ctx.currentTime + 0.08;
        hooksRef.current.onStart?.(toPerf(ctx, next));
        const tick = () => {
            const s = seqRef.current;
            if (!s) return;
            const total = s.chain.length * STEPS;
            while (next < ctx.currentTime + LOOKAHEAD) {
                const w = k % total;
                const sr = ctx.sampleRate;
                const swingSec = (stepAt(s, w, sr) - Math.round(w * stepFrames(s.bpm, sr))) / sr;
                play(ctx, s, w, next, next - swingSec, stepFrames(s.bpm, sr) / sr);
                // The next step's time from this tempo and swing: changes land on the next step.
                const end = w + 1 === total ? sequenceFrames(s, sr) : stepAt(s, w + 1, sr);
                next += (end - stepAt(s, w, sr)) / sr;
                k = w + 1;
            }
        };
        tick();
        timer.current = setInterval(tick, TICK_MS);
        setPlaying(true);
    }, [prepare, play]);

    /** Waits for `externalStep`: an outside clock drives the steps (MIDI Start, Continue). */
    const startExternal = useCallback(async (fromStart = true) => {
        const seq = seqRef.current;
        if (!seq) return;
        if (timer.current) stop();
        const ctx = context();
        if (ctx.state === 'suspended') await ctx.resume();
        prepare(seq);
        external.current = { k: fromStart ? 0 : external.current?.k ?? 0, lastPerf: null };
        setPlaying(true);
        setFollowing(true);
    }, [prepare, stop]);

    /**
     * One sixteenth of the outside clock (every 6th MIDI clock tick), arrived at
     * `perfMs`. Odd steps are swung by the step length measured between ticks.
     */
    const externalStep = useCallback((perfMs: number) => {
        const ext = external.current;
        const s = seqRef.current;
        if (!ext || !s) return;
        const ctx = context();
        const stepSec = ext.lastPerf !== null ? Math.max(0.02, (perfMs - ext.lastPerf) / 1000) : 60 / s.bpm / 4;
        ext.lastPerf = perfMs;
        const total = s.chain.length * STEPS;
        const w = ext.k % total;
        const grid = ctx.currentTime + Math.max(0, (perfMs - performance.now()) / 1000) + EXTERNAL_LATENCY;
        play(ctx, s, w, grid + (w % 2 === 1 ? s.swing * stepSec : 0), grid, stepSec);
        ext.k = w + 1;
    }, [play]);

    /** A changed slice must be rendered again: drop what was made from the old one. */
    const forget = useCallback(() => { buffers.current.clear(); }, []);

    useEffect(() => () => {
        stop();
        contextRef.current?.close().catch(() => undefined);
    }, [stop]);

    return { playing, following, step, start, startExternal, externalStep, stop, update, forget };
}
