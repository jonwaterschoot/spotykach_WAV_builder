import type { Hit, HitOptions } from './hits.ts';
import type { HitsRequest, HitsResponse } from './hits.worker.ts';

/**
 * The page's side of the hit worker. One worker, started on first use; requests
 * are answered in turn. The channel data is copied, so the caller's buffer stays
 * usable (the copy is transferred, not copied again).
 */

let worker: Worker | null = null;
let nextId = 1;
const waiting = new Map<number, { resolve: (hits: Hit[]) => void; reject: (e: Error) => void }>();

function start(): Worker {
    if (worker) return worker;
    worker = new Worker(new URL('./hits.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<HitsResponse>) => {
        const msg = event.data;
        const job = waiting.get(msg.id);
        if (!job) return;
        waiting.delete(msg.id);
        if ('error' in msg) job.reject(new Error(msg.error)); else job.resolve(msg.hits);
    };
    worker.onerror = (event) => {
        for (const job of waiting.values()) job.reject(new Error(event.message || 'The hit detector stopped.'));
        waiting.clear();
        worker?.terminate();
        worker = null;
    };
    return worker;
}

export function findHits(left: Float32Array, right: Float32Array, sampleRate: number, options: HitOptions = {}): Promise<Hit[]> {
    const id = nextId++;
    const l = left.slice();
    const r = right === left ? l : right.slice();
    const request: HitsRequest = { id, left: l, right: r, sampleRate, options };
    return new Promise((resolve, reject) => {
        waiting.set(id, { resolve, reject });
        start().postMessage(request, r === l ? [l.buffer] : [l.buffer, r.buffer]);
    });
}
