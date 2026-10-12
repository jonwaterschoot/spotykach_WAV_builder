/// <reference lib="webworker" />
import { render, type MangleResult, type MangleSource } from './render.ts';
import type { MangleSettings } from './settings.ts';

/**
 * Renders a batch of variations off the main thread. The sources arrive once per
 * batch (transferred, not copied); each result goes back as soon as it's done,
 * so the first variation can be played while the rest render. To cancel, the
 * page terminates the worker.
 */

export interface MangleRequest {
    type: 'render';
    batchId: number;
    sources: MangleSource[];
    settings: MangleSettings;
    seeds: number[];
}

export type MangleResponse =
    | { type: 'progress'; batchId: number; index: number; fraction: number }
    | { type: 'result'; batchId: number; index: number; result: MangleResult }
    | { type: 'error'; batchId: number; message: string }
    | { type: 'done'; batchId: number };

const post = (message: MangleResponse, transfer: Transferable[] = []) =>
    (self as unknown as DedicatedWorkerGlobalScope).postMessage(message, transfer);

self.onmessage = (event: MessageEvent<MangleRequest>) => {
    const { batchId, sources, settings, seeds } = event.data;
    try {
        seeds.forEach((seed, index) => {
            const result = render(sources, settings, seed, fraction =>
                post({ type: 'progress', batchId, index, fraction }));
            post({ type: 'result', batchId, index, result }, [result.left.buffer, result.right.buffer]);
        });
        post({ type: 'done', batchId });
    } catch (error) {
        post({ type: 'error', batchId, message: error instanceof Error ? error.message : String(error) });
    }
};
