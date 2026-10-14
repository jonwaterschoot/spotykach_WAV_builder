/// <reference lib="webworker" />
import { detectHits, type Hit, type HitOptions } from './hits.ts';

/** Finds the hits in one source off the main thread: two minutes take about a second. */

export interface HitsRequest {
    id: number;
    left: Float32Array;
    right: Float32Array;
    sampleRate: number;
    options: HitOptions;
}

export type HitsResponse = { id: number; hits: Hit[] } | { id: number; error: string };

self.onmessage = (event: MessageEvent<HitsRequest>) => {
    const { id, left, right, sampleRate, options } = event.data;
    let response: HitsResponse;
    try {
        response = { id, hits: detectHits([left, right], sampleRate, options) };
    } catch (error) {
        response = { id, error: error instanceof Error ? error.message : String(error) };
    }
    (self as unknown as DedicatedWorkerGlobalScope).postMessage(response);
};
