import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Decoded results, and playback of one region of one of them: a snippet from the
 * snippet list, or the one under the cursor in the zoomed waveform. Separate
 * from the app's player, which plays whole files and can't stop at a point.
 * The two never play at once: the host stops one when the other starts.
 */

export interface RegionPlayback {
    resultId: string;
    /** Snippet index, or −1 for a free region. */
    index: number;
    start: number;
    end: number;
}

const CACHE = 3;
const FADE = 0.005;

export function useResultAudio() {
    const contextRef = useRef<AudioContext | null>(null);
    const nodeRef = useRef<{ source: AudioBufferSourceNode; gain: GainNode } | null>(null);
    const startedRef = useRef(0);
    const rafRef = useRef<number | null>(null);
    const [decoded, setDecoded] = useState<Record<string, AudioBuffer>>({});
    const decodedRef = useRef(decoded);
    decodedRef.current = decoded;
    const pendingRef = useRef(new Map<string, Promise<AudioBuffer>>());
    const [playing, setPlaying] = useState<RegionPlayback | null>(null);
    /** Seconds into the result while a region plays. */
    const [position, setPosition] = useState<number | null>(null);

    const context = () => (contextRef.current ??= new AudioContext());

    const load = useCallback((id: string, blob: Blob): Promise<AudioBuffer> => {
        const hit = decodedRef.current[id];
        if (hit) return Promise.resolve(hit);
        const pending = pendingRef.current.get(id);
        if (pending) return pending;
        const job = blob.arrayBuffer()
            .then(bytes => context().decodeAudioData(bytes))
            .then(buffer => {
                setDecoded(prev => {
                    const keys = Object.keys(prev).filter(k => k !== id);
                    const next: Record<string, AudioBuffer> = {};
                    for (const k of keys.slice(-(CACHE - 1))) next[k] = prev[k];
                    next[id] = buffer;
                    return next;
                });
                return buffer;
            })
            .finally(() => pendingRef.current.delete(id));
        pendingRef.current.set(id, job);
        return job;
    }, []);

    /** Drops a decoded copy, e.g. after an edit replaced the result's audio. */
    const forget = useCallback((id: string) => {
        setDecoded(prev => {
            if (!prev[id]) return prev;
            const next = { ...prev };
            delete next[id];
            return next;
        });
    }, []);

    const stop = useCallback(() => {
        const node = nodeRef.current;
        nodeRef.current = null;
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        setPlaying(null);
        setPosition(null);
        if (!node) return;
        const now = context().currentTime;
        node.gain.gain.cancelScheduledValues(now);
        node.gain.gain.setValueAtTime(node.gain.gain.value, now);
        node.gain.gain.linearRampToValueAtTime(0, now + FADE);
        node.source.stop(now + FADE + 0.01);
    }, []);

    /** Plays `[start, end)` seconds of a result. The same region again stops it. */
    const playRegion = useCallback(async (region: RegionPlayback, blob: Blob) => {
        if (playing && playing.resultId === region.resultId && playing.index === region.index && region.index >= 0) {
            stop();
            return;
        }
        stop();
        const buffer = await load(region.resultId, blob);
        const ctx = context();
        if (ctx.state === 'suspended') await ctx.resume();

        const start = Math.max(0, Math.min(buffer.duration, region.start));
        const duration = Math.max(0.01, Math.min(buffer.duration, region.end) - start);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const gain = ctx.createGain();
        source.connect(gain).connect(ctx.destination);
        const now = ctx.currentTime;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(1, now + FADE);
        gain.gain.setValueAtTime(1, now + Math.max(FADE, duration - FADE));
        gain.gain.linearRampToValueAtTime(0, now + duration);
        source.start(now, start, duration);
        const node = { source, gain };
        nodeRef.current = node;
        startedRef.current = now;
        setPlaying({ ...region, start, end: start + duration });

        source.onended = () => {
            if (nodeRef.current !== node) return;
            nodeRef.current = null;
            if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
            setPlaying(null);
            setPosition(null);
        };
        const tick = () => {
            if (nodeRef.current !== node) return;
            setPosition(start + Math.min(duration, ctx.currentTime - startedRef.current));
            rafRef.current = requestAnimationFrame(tick);
        };
        tick();
    }, [load, playing, stop]);

    useEffect(() => () => {
        nodeRef.current?.source.stop();
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        contextRef.current?.close().catch(() => undefined);
    }, []);

    return { decoded, load, forget, playing, position, playRegion, stop };
}
