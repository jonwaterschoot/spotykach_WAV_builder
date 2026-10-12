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
}

let state: UsbState = { status: 'idle', backend: null, info: null, error: null };
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

const adopt = async (connection: import('@synthuxacademy/spotykach-transfer').Connection): Promise<UsbBackend> => {
    const { UsbBackend } = await import('./usbBackend');
    const backend = new UsbBackend(connection);
    backend.ondisconnect = (error) => {
        if (state.backend !== backend) return;
        set({ status: 'idle', backend: null, info: null, error: `Spotykach disconnected: ${error.message}` });
    };
    set({ status: 'connected', backend, info: await backend.info(), error: null });
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
        set({ status: 'connecting', error: null });
        const link = await loadLink();
        try {
            return await adopt(await link.connect());
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            const waiting = e instanceof link.NeedsAuthorizationError || e instanceof link.MidiPortNotFoundError;
            set({ status: waiting ? 'needs-authorization' : 'error', error: message });
            return null;
        }
    },

    /** The browser's port picker. Must run straight from a click. */
    async authorize(): Promise<UsbBackend | null> {
        set({ status: 'connecting', error: null });
        const link = await loadLink();
        try {
            return await adopt(await link.authorizePort());
        } catch (e) {
            // Picker closed without a choice: the device may still be waiting.
            const cancelled = e instanceof DOMException && e.name === 'NotFoundError';
            set({
                status: 'needs-authorization',
                error: cancelled
                    ? 'No port selected. If the rings on Spotykach are lit, click Authorise port and select it.'
                    : e instanceof Error ? e.message : String(e),
            });
            return null;
        }
    },

    /** EXIT: the device goes back to MIDI and plays again. */
    async disconnect(): Promise<void> {
        const backend = state.backend;
        set({ status: 'idle', backend: null, info: null, error: null });
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
