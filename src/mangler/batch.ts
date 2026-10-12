import { encodeWAV } from '../lib/audio/wavEncoder';
import { audioProcessor } from '../lib/audio/audioProcessor';
import type { MangleRequest, MangleResponse } from './mangle.worker';
import { MANGLE_SAMPLE_RATE, type MangleResult, type MangleSource } from './render';
import type { MangleSettings } from './settings';

/**
 * The main thread's half of a batch: decode the sources, hand them to a worker,
 * turn each rendered variation into a WAV. Decoding stays here because
 * `decodeAudioData` needs an AudioContext, which workers don't have.
 */

let context: AudioContext | null = null;
const audioContext = () => (context ??= new AudioContext());

/**
 * The last few decoded sources, so a reroll doesn't decode the pool again. Held
 * as AudioBuffers; each batch gets copies, because the worker takes ownership of
 * what it is sent.
 */
const cache = new Map<string, AudioBuffer>();
const CACHE_SECONDS = 300;

async function decode(id: string, blob: Blob): Promise<AudioBuffer> {
    const hit = cache.get(id);
    if (hit) {
        cache.delete(id);
        cache.set(id, hit); // most recent last
        return hit;
    }
    let buffer = await audioContext().decodeAudioData(await blob.arrayBuffer());
    if (buffer.sampleRate !== MANGLE_SAMPLE_RATE) {
        buffer = await audioProcessor.resample(buffer, MANGLE_SAMPLE_RATE);
    }
    cache.set(id, buffer);
    let held = [...cache.values()].reduce((sum, b) => sum + b.duration, 0);
    for (const [key, b] of cache) {
        if (held <= CACHE_SECONDS || key === id) break;
        cache.delete(key);
        held -= b.duration;
    }
    return buffer;
}

/** Copies, so the cache survives the transfer. Mono passes one array twice. */
const toSource = (buffer: AudioBuffer, enabled: boolean): MangleSource => {
    const left = buffer.getChannelData(0).slice();
    const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1).slice() : left;
    return { channels: [left, right], enabled };
};

export interface BatchSource {
    id: string;
    blob: Blob;
}

export interface BatchHandlers {
    onDecodeProgress?: (done: number, total: number) => void;
    onProgress?: (index: number, fraction: number) => void;
    onResult: (index: number, result: MangleResult) => void | Promise<void>;
    onDone: () => void;
    onError: (message: string) => void;
}

export interface BatchHandle {
    cancel: () => void;
}

let nextBatchId = 1;

/**
 * Renders `seeds.length` variations. Results arrive one at a time, in order.
 * `cancel` terminates the worker; anything already delivered stays delivered.
 */
export function runBatch(
    sources: BatchSource[], settings: MangleSettings, seeds: number[], handlers: BatchHandlers,
): BatchHandle {
    const batchId = nextBatchId++;
    let worker: Worker | null = null;
    let cancelled = false;
    // Results are handled one after another, so a slow save never reorders them.
    let queue: Promise<void> = Promise.resolve();

    (async () => {
        const decoded: MangleSource[] = [];
        for (let i = 0; i < sources.length; i++) {
            if (cancelled) return;
            handlers.onDecodeProgress?.(i, sources.length);
            try {
                decoded.push(toSource(await decode(sources[i].id, sources[i].blob), true));
            } catch (e) {
                console.error('Mangler: could not decode a source', e);
                // Keep the indexes lined up with the recipe; the planner skips it.
                decoded.push({ channels: [new Float32Array(0), new Float32Array(0)], enabled: false });
            }
        }
        if (cancelled) return;
        if (!decoded.some(s => s.enabled)) {
            handlers.onError('None of the sources could be decoded.');
            return;
        }

        worker = new Worker(new URL('./mangle.worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = (event: MessageEvent<MangleResponse>) => {
            const msg = event.data;
            if (msg.batchId !== batchId || cancelled) return;
            if (msg.type === 'progress') handlers.onProgress?.(msg.index, msg.fraction);
            else if (msg.type === 'result') queue = queue.then(() => handlers.onResult(msg.index, msg.result));
            else if (msg.type === 'error') { handlers.onError(msg.message); worker?.terminate(); }
            else if (msg.type === 'done') { queue.then(handlers.onDone); worker?.terminate(); }
        };
        worker.onerror = (event) => {
            handlers.onError(event.message || 'The mangle worker stopped.');
            worker?.terminate();
        };

        const transfer = new Set<ArrayBuffer>();
        for (const s of decoded) for (const ch of s.channels) transfer.add(ch.buffer as ArrayBuffer);
        const request: MangleRequest = { type: 'render', batchId, sources: decoded, settings, seeds };
        worker.postMessage(request, [...transfer]);
    })().catch(e => handlers.onError(e instanceof Error ? e.message : String(e)));

    return {
        cancel: () => {
            cancelled = true;
            worker?.terminate();
        },
    };
}

/** The rendered audio as the hardware's WAV, with a cue point per snippet. */
export function resultToWav(result: MangleResult, name: string): Blob {
    const buffer = new AudioBuffer({
        length: result.left.length,
        numberOfChannels: 2,
        sampleRate: result.sampleRate,
    });
    buffer.copyToChannel(result.left as Float32Array<ArrayBuffer>, 0);
    buffer.copyToChannel(result.right as Float32Array<ArrayBuffer>, 1);
    return encodeWAV(buffer, {
        name,
        slicePoints: result.cuePoints.map(f => f / result.sampleRate),
        processing: ['mangled'],
    });
}
