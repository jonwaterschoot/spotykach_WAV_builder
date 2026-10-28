/**
 * The one USB connection the app holds: the sync modal's USB source and
 * `window.skUsb` share it, so they never fight over the serial port.
 *
 * Small on purpose: the protocol code (the `@synthuxacademy/spotykach-transfer` package, `usbBackend.ts`) is imported
 * only when a connection is made, so it stays a separate chunk.
 */
import { useSyncExternalStore } from 'react';
import type { CardInfo } from '../card/cardBackend';
import type { UsbBackend } from './usbBackend';

export type UsbStatus =
    /** Not connected. */
    | 'idle'
    | 'connecting'
    /**
     * The device may be waiting in transfer mode (rings lit) for this browser to
     * be granted its serial port, which needs a fresh click: "Authorise port".
     */
    | 'needs-authorization'
    | 'connected'
    | 'error';

export interface UsbState {
    status: UsbStatus;
    backend: UsbBackend | null;
    /** From HELLO: firmware, card size and free space. */
    info: CardInfo | null;
    /** Why the last attempt failed, or why the connection was lost. */
    error: string | null;
    /** The connect step that failed ("Switching to transfer mode"), with `error`. */
    step: string | null;
}

let state: UsbState = { status: 'idle', backend: null, info: null, error: null, step: null };
const listeners = new Set<() => void>();

const set = (next: Partial<UsbState>) => {
    state = { ...state, ...next };
    listeners.forEach(l => l());
};

const loadLink = () => import('@synthuxacademy/spotykach-transfer');

/** Starts loading the protocol code, so a later Authorise click doesn't wait on it. */
export const preloadUsb = () => {
    void loadLink();
    void import('./usbBackend');
};

/** The steps of the last connect attempt, for "Copy diagnostics". */
let trace: string[] = [];
let traceStart = 0;
/** Counts attempts, so a late line from an earlier one stays out of the trace. */
let attempt = 0;
/** The step the last attempt reached, named for the UI. */
let currentStep: string | null = null;

/** The package's `onStep` lines that start a step, and what to call it. */
const STEPS: [RegExp, string][] = [
    [/serial port (already )?granted/, 'Looking for a granted port'],
    [/^MIDI (permission|access|ports)/, 'MIDI access'],
    [/^sending SysEx/, 'Switching to transfer mode'],
    [/^waiting for the serial port/, 'Waiting for the serial port'],
    [/^showing the port picker/, 'Port picker'],
    [/^opening the serial port/, 'Opening the serial port (HELLO)'],
];

type SerialEvents = {
    addEventListener(type: string, listener: (e: Event) => void): void;
    removeEventListener(type: string, listener: (e: Event) => void): void;
};

/**
 * Runs `connect` with the serial port's plug and unplug events in the trace too:
 * they show when the device switched, which the package's steps can't see.
 */
const withSerialEvents = async <T>(trace: (line: string) => void, connect: () => Promise<T>): Promise<T> => {
    const serial = (navigator as unknown as { serial?: SerialEvents }).serial;
    const onEvent = (e: Event) => {
        const info = (e.target as unknown as { getInfo?: () => { usbVendorId?: number; usbProductId?: number } }).getInfo?.() ?? {};
        const hex = (n?: number) => n === undefined ? '?' : n.toString(16).padStart(4, '0');
        trace(`serial ${e.type} ${hex(info.usbVendorId)}:${hex(info.usbProductId)}`);
    };
    serial?.addEventListener('connect', onEvent);
    serial?.addEventListener('disconnect', onEvent);
    try {
        return await connect();
    } finally {
        serial?.removeEventListener('connect', onEvent);
        serial?.removeEventListener('disconnect', onEvent);
    }
};

/** Starts a new trace; the returned function logs to it, and only while it's the latest. */
const startTrace = (what: string): ((line: string) => void) => {
    trace = [];
    traceStart = performance.now();
    currentStep = null;
    const id = ++attempt;
    log(`${what} · ${new Date().toISOString()}`);
    return line => { if (id === attempt) log(line); };
};

const elapsed = () => `+${((performance.now() - traceStart) / 1000).toFixed(2)}s`;

const log = (line: string) => {
    trace.push(`${elapsed()} ${line}`);
    const step = STEPS.find(([pattern]) => pattern.test(line));
    if (step) currentStep = step[1];
    console.info(`[usb] ${line}`);
};

const endTrace = (error: unknown) => {
    if (!error) log('connected');
    else log(`failed: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`);
};

const adopt = async (connection: import('@synthuxacademy/spotykach-transfer').Connection): Promise<UsbBackend> => {
    const { UsbBackend } = await import('./usbBackend');
    const backend = new UsbBackend(connection);
    backend.ondisconnect = (error) => {
        if (state.backend !== backend) return;
        log(`connection ended by the device or the cable: ${error.message}`);
        set({ status: 'idle', backend: null, info: null, error: `Spotykach disconnected: ${error.message}`, step: null });
    };
    set({ status: 'connected', backend, info: await backend.info(), error: null, step: null });
    return backend;
};

export const usbSession = {
    get state(): UsbState {
        return state;
    },

    subscribe(listener: () => void): () => void {
        listeners.add(listener);
        return () => listeners.delete(listener);
    },

    /**
     * SysEx to transfer mode, the serial port, HELLO. Run it from a click: on first
     * use the browser asks for the port, and only within a few seconds of one.
     */
    async connect(): Promise<UsbBackend | null> {
        if (state.backend?.connected) return state.backend;
        if (state.status === 'connecting') return null;
        set({ status: 'connecting', error: null, step: null });
        const attemptLog = startTrace('connect');
        const link = await loadLink();
        try {
            const backend = await adopt(await withSerialEvents(attemptLog, () => link.connect({ onStep: attemptLog })));
            endTrace(null);
            return backend;
        } catch (e) {
            endTrace(e);
            const message = e instanceof Error ? e.message : String(e);
            const waiting = e instanceof link.NeedsAuthorizationError || e instanceof link.MidiPortNotFoundError;
            set({ status: waiting ? 'needs-authorization' : 'error', error: message, step: waiting ? null : currentStep });
            return null;
        }
    },

    /** The browser's port picker. Must run straight from a click. */
    async authorize(): Promise<UsbBackend | null> {
        set({ status: 'connecting', error: null, step: null });
        const attemptLog = startTrace('authorise port');
        const link = await loadLink();
        try {
            const backend = await adopt(await withSerialEvents(attemptLog, () => link.authorizePort({ onStep: attemptLog })));
            endTrace(null);
            return backend;
        } catch (e) {
            endTrace(e);
            // Picker closed without a choice: the device may still be waiting.
            const cancelled = e instanceof DOMException && e.name === 'NotFoundError';
            set({
                status: 'needs-authorization',
                error: cancelled
                    ? 'No port selected. If the rings on Spotykach are lit, click Authorise port and select it.'
                    : e instanceof Error ? e.message : String(e),
                step: cancelled ? null : currentStep,
            });
            return null;
        }
    },

    /** The last connect attempt, step by step, with the browser and app version. */
    diagnostics(): string {
        return [
            `WAV Builder ${typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '?'}`,
            navigator.userAgent,
            `status: ${state.status}${state.error ? ` (${state.error})` : ''}`,
            '',
            // When it was copied: a step that hasn't answered by then still hadn't
            ...(trace.length ? [...trace, `${elapsed()} diagnostics copied`] : ['No connect attempt yet.']),
        ].join('\n');
    },

    /**
     * A line in the current trace, for what happens after the connect (a write and
     * how it ended), so "Copy diagnostics" reports it too.
     */
    note(line: string): void {
        log(line);
    },

    /** EXIT: the device goes back to MIDI and plays again. */
    async disconnect(): Promise<void> {
        const backend = state.backend;
        if (backend) log('disconnected from the app (EXIT sent)');
        set({ status: 'idle', backend: null, info: null, error: null, step: null });
        await backend?.close().catch(() => {});
    },

    /** HELLO again, for the free space after a batch. */
    async refreshInfo(): Promise<void> {
        if (!state.backend?.connected) return;
        try {
            set({ info: await state.backend.info() });
        } catch {
            // A lost connection reports itself through `ondisconnect`.
        }
    },
};

export const useUsbSession = (): UsbState =>
    useSyncExternalStore(usbSession.subscribe, () => state);
