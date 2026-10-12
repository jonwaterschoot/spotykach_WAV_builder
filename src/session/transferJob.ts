/**
 * One sync run between the project and the card, slot by slot, for the transfer
 * window: what is queued, running, done or skipped, by bytes, with a log.
 */
import { useCallback, useRef, useState } from 'react';

export type TransferDirection = 'up' | 'down' | 'delete';
export type TransferStatus = 'queued' | 'active' | 'done' | 'skipped' | 'failed' | 'cancelled';

export interface TransferItem {
    /** "Blue2" */
    slot: string;
    name: string;
    direction: TransferDirection;
    /** Expected size; replaced by the real one once known. */
    bytes: number;
    status: TransferStatus;
    /** 0–1 while active. */
    fraction: number;
    startedAt?: number;
    finishedAt?: number;
}

export interface TransferJob {
    title: string;
    route: 'usb' | 'reader';
    items: TransferItem[];
    log: { at: number; text: string; tone?: 'ok' | 'warn' | 'error' }[];
    startedAt: number;
    finishedAt?: number;
    error?: string;
    cancelled?: boolean;
}

/** Bytes moved so far, counting the running item's fraction. Skipped items count as done. */
export const jobBytes = (job: TransferJob) => {
    let done = 0;
    let total = 0;
    let moved = 0;
    for (const item of job.items) {
        if (item.direction === 'delete') continue;
        total += item.bytes;
        if (item.status === 'done') { done += item.bytes; moved += item.bytes; }
        else if (item.status === 'skipped') done += item.bytes;
        else if (item.status === 'active') { done += item.bytes * item.fraction; moved += item.bytes * item.fraction; }
    }
    return { done, total, moved };
};

/** Seconds left at the rate so far, or null before there is a rate to go by. */
export const jobSecondsLeft = (job: TransferJob, now: number): number | null => {
    const { done, total, moved } = jobBytes(job);
    const elapsed = (now - job.startedAt) / 1000;
    if (moved < 64 * 1024 || elapsed < 2) return null;
    return Math.max(0, (total - done) / (moved / elapsed));
};

export function useTransferJob() {
    const [job, setJob] = useState<TransferJob | null>(null);
    const controller = useRef<AbortController | null>(null);

    const log = useCallback((text: string, tone?: 'ok' | 'warn' | 'error') => {
        setJob(j => j && { ...j, log: [...j.log, { at: Date.now(), text, tone }] });
    }, []);

    /** Starts a job and returns the signal that Cancel aborts. */
    const start = useCallback((title: string, route: 'usb' | 'reader', items: Omit<TransferItem, 'status' | 'fraction'>[]) => {
        controller.current = new AbortController();
        setJob({
            title, route,
            items: items.map(i => ({ ...i, status: 'queued', fraction: 0 })),
            log: [{ at: Date.now(), text: `${title}: ${items.length} slot${items.length === 1 ? '' : 's'} via ${route === 'usb' ? 'USB' : 'the card reader'}` }],
            startedAt: Date.now(),
        });
        return controller.current.signal;
    }, []);

    const update = useCallback((slot: string, direction: TransferDirection, patch: Partial<TransferItem>) => {
        setJob(j => j && {
            ...j,
            items: j.items.map(i => i.slot === slot && i.direction === direction ? { ...i, ...patch } : i),
        });
    }, []);

    const finish = useCallback((error?: string) => {
        const cancelled = !!controller.current?.signal.aborted;
        setJob(j => j && {
            ...j,
            finishedAt: Date.now(),
            error: cancelled ? undefined : error,
            cancelled,
            // The running one failed or was cancelled; the rest never ran. On success,
            // anything still queued was left alone by the build.
            items: j.items.map(i => {
                if (i.status === 'active') return { ...i, status: cancelled ? 'cancelled' : error ? 'failed' : 'done', fraction: 1 };
                if (i.status === 'queued') return { ...i, status: cancelled || error ? 'cancelled' : 'skipped' };
                return i;
            }),
        });
        controller.current = null;
    }, []);

    const cancel = useCallback(() => controller.current?.abort(), []);
    const close = useCallback(() => setJob(null), []);

    return { job, start, update, log, finish, cancel, close };
}
