import { encodeWAV } from '../lib/audio/wavEncoder';
import { audioProcessor } from '../lib/audio/audioProcessor';
import type { MangleRequest, MangleResponse } from './mangle.worker';
import { MANGLE_SAMPLE_RATE, type MangleResult, type MangleSource, type SnippetInfo } from './render';
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

/** Phone mode sets these (see `ui/phoneMode.ts`). */
const limits = { mono: false, cacheSeconds: 300 };

/** Mono decoding and the cache size. A change empties the cache. */
export function setDecodeLimits(next: { mono: boolean; cacheSeconds: number }) {
    if (next.mono !== limits.mono) cache.clear();
    limits.mono = next.mono;
    limits.cacheSeconds = next.cacheSeconds;
}

/** Both channels mixed into one: half the memory of a stereo source. */
const toMono = (buffer: AudioBuffer): AudioBuffer => {
    if (buffer.numberOfChannels === 1) return buffer;
    const mono = new AudioBuffer({ length: buffer.length, numberOfChannels: 1, sampleRate: buffer.sampleRate });
    const out = mono.getChannelData(0);
    const scale = 1 / buffer.numberOfChannels;
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
        const data = buffer.getChannelData(ch);
        for (let i = 0; i < out.length; i++) out[i] += data[i] * scale;
    }
    return mono;
};

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
    if (limits.mono) buffer = toMono(buffer);
    cache.set(id, buffer);
    let held = [...cache.values()].reduce((sum, b) => sum + b.duration, 0);
    for (const [key, b] of cache) {
        if (held <= limits.cacheSeconds || key === id) break;
        cache.delete(key);
        held -= b.duration;
    }
    return buffer;
}

/** Copies, so the cache survives the transfer. Mono passes one array twice. */
const toSource = (buffer: AudioBuffer, enabled: boolean, regions?: [number, number][]): MangleSource => {
    const left = buffer.getChannelData(0).slice();
    const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1).slice() : left;
    const frames = regions?.map(([a, b]) => [Math.round(a * MANGLE_SAMPLE_RATE), Math.round(b * MANGLE_SAMPLE_RATE)] as [number, number]);
    return { channels: [left, right], enabled, regions: frames?.length ? frames : undefined };
};

export interface BatchSource {
    id: string;
    /** Null for a source that has left the pool: kept as a placeholder so indexes line up. */
    blob: Blob | null;
    /** May new snippets be drawn from it. Default true. A fixed snippet may use any source. */
    enabled?: boolean;
    /** Seconds: the parts new snippets may come from. */
    regions?: [number, number][];
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
    fixed?: (SnippetInfo | null)[],
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
            const { id, blob, enabled = true, regions } = sources[i];
            try {
                if (!blob) throw new Error('Source no longer in the pool');
                decoded.push(toSource(await decode(id, blob), enabled, regions));
            } catch (e) {
                console.error('Mangler: could not decode a source', e);
                // Keep the indexes lined up with the recipe; the planner skips it.
                decoded.push({ channels: [new Float32Array(0), new Float32Array(0)], enabled: false });
            }
        }
        if (cancelled) return;
        if (!decoded.some(s => s.enabled) && !fixed?.some(Boolean)) {
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
        const request: MangleRequest = { type: 'render', batchId, sources: decoded, settings, seeds, fixed };
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

/** The same audio with other cue points: a re-cue rewrites the WAV, not the sound. */
export function wavWithCues(left: Float32Array, right: Float32Array, cuePoints: number[], name: string): Blob {
    const buffer = new AudioBuffer({ length: left.length, numberOfChannels: 2, sampleRate: MANGLE_SAMPLE_RATE });
    buffer.copyToChannel(left as Float32Array<ArrayBuffer>, 0);
    buffer.copyToChannel(right as Float32Array<ArrayBuffer>, 1);
    return encodeWAV(buffer, {
        name,
        slicePoints: cuePoints.map(f => f / MANGLE_SAMPLE_RATE),
        processing: ['mangled'],
    });
}
