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
const loadTraced = () => import('./tracedConnect');

/** Starts loading the protocol code, so a later Authorise click doesn't wait on it. */
export const preloadUsb = () => {
    void loadLink();
    void loadTraced();
    void import('./usbBackend');
};

/** The steps of the last connect attempt, for "Copy diagnostics". */
let trace: string[] = [];
let traceStart = 0;
/** The step the last attempt reached, named for the UI. */
let currentStep: string | null = null;

/** The trace lines that start a step (`tracedConnect.ts`), and what to call it. */
const STEPS: [RegExp, string][] = [
    [/^serial ports granted/, 'Looking for a granted port'],
    [/^MIDI SysEx permission|^MIDI access/, 'MIDI access'],
    [/^sending SysEx/, 'Switching to transfer mode'],
    [/^waiting for the serial port/, 'Waiting for the serial port'],
    [/^showing the port picker/, 'Port picker'],
    [/^opening serial port/, 'Opening the serial port (HELLO)'],
];

const startTrace = (what: string) => {
    trace = [];
    traceStart = performance.now();
    currentStep = null;
    log(`${what} · ${new Date().toISOString()}`);
};

const log = (line: string) => {
    const seconds = ((performance.now() - traceStart) / 1000).toFixed(2);
    trace.push(`+${seconds}s ${line}`);
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
        startTrace('connect');
        const [link, { tracedConnect }] = await Promise.all([loadLink(), loadTraced()]);
        try {
            const backend = await adopt(await tracedConnect(log));
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
        startTrace('authorise port');
        const { tracedAuthorize } = await loadTraced();
        try {
            const backend = await adopt(await tracedAuthorize(log));
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
            ...(trace.length ? trace : ['No connect attempt yet.']),
        ].join('\n');
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
