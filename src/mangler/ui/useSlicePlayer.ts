import { useCallback, useEffect, useRef, useState } from 'react';
import { renderSlice, type SliceSpec } from '../slices';

/**
 * Plays one slice at a time, as it will sound in a kit: its source decoded (and
 * cached by `load`), then cut, shifted, reversed and enveloped by `renderSlice`.
 */
export function useSlicePlayer(load: (id: string, blob: Blob) => Promise<AudioBuffer>) {
    const contextRef = useRef<AudioContext | null>(null);
    const nodeRef = useRef<AudioBufferSourceNode | null>(null);
    const [playingId, setPlayingId] = useState<string | null>(null);

    const stop = useCallback(() => {
        const node = nodeRef.current;
        nodeRef.current = null;
        try { node?.stop(); } catch { /* already stopped */ }
        setPlayingId(null);
    }, []);

    const play = useCallback(async (id: string, sourceId: string, blob: Blob, spec: SliceSpec) => {
        stop();
        const decoded = await load(sourceId, blob);
        const l = decoded.getChannelData(0);
        const r = decoded.numberOfChannels > 1 ? decoded.getChannelData(1) : l;
        const [left, right] = renderSlice([l, r], decoded.sampleRate, spec);
        const context = (contextRef.current ??= new AudioContext({ sampleRate: decoded.sampleRate }));
        if (context.state === 'suspended') await context.resume();
        const buffer = context.createBuffer(2, left.length, decoded.sampleRate);
        buffer.copyToChannel(left as Float32Array<ArrayBuffer>, 0);
        buffer.copyToChannel(right as Float32Array<ArrayBuffer>, 1);
        const node = context.createBufferSource();
        node.buffer = buffer;
        node.connect(context.destination);
        node.onended = () => {
            if (nodeRef.current !== node) return;
            nodeRef.current = null;
            setPlayingId(null);
        };
        nodeRef.current = node;
        node.start();
        setPlayingId(id);
    }, [load, stop]);

    useEffect(() => () => {
        try { nodeRef.current?.stop(); } catch { /* fine */ }
        contextRef.current?.close().catch(() => undefined);
    }, []);

    return { play, stop, playingId };
}
