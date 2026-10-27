/**
 * USB transfer, on by default since firmware 1.4.0. Turned off in Settings ▸ System,
 * or with `?usb=0` (`?usb=1` turns it on again). Only the off choice is stored, so a
 * browser that turned it on during the beta (stored '1') stays on.
 */
import { useSyncExternalStore } from 'react';

const KEY = 'wavbuilder.usbTransfer';

/** The firmware release that has USB transfer. */
export const USB_FIRMWARE = {
    version: '1.4.0',
    url: 'https://www.synthux.academy/firmware/spotykach/spotykach/v1.4.0',
};

/** Web Serial: Chrome, Edge and Opera on desktop. */
export const usbTransferSupported = (): boolean => typeof navigator !== 'undefined' && 'serial' in navigator;

/** `?usb=` before the `#`, or inside the hash route (`#/studio?usb=1`). */
function usbParam(): string | null {
    const fromSearch = new URLSearchParams(window.location.search).get('usb');
    if (fromSearch !== null) return fromSearch;
    const hash = window.location.hash;
    const q = hash.indexOf('?');
    return q < 0 ? null : new URLSearchParams(hash.slice(q + 1)).get('usb');
}

let fallback = true;
const listeners = new Set<() => void>();

export function isUsbTransferEnabled(): boolean {
    const param = usbParam();
    try {
        if (param === '1') localStorage.removeItem(KEY);
        else if (param === '0') localStorage.setItem(KEY, '0');
        return localStorage.getItem(KEY) !== '0';
    } catch {
        return param === '1' || (param === null && fallback);
    }
}

export function setUsbTransferEnabled(on: boolean): void {
    fallback = on;
    try {
        if (on) localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, '0');
    } catch { /* storage blocked: kept for this session only */ }
    // A `?usb=` still in the address would override the choice on the next read.
    const url = new URL(window.location.href);
    if (url.searchParams.has('usb')) {
        url.searchParams.delete('usb');
        window.history.replaceState(window.history.state, '', url);
    }
    const q = url.hash.indexOf('?');
    if (q >= 0) {
        const params = new URLSearchParams(url.hash.slice(q + 1));
        if (params.has('usb')) {
            params.delete('usb');
            const rest = params.toString();
            url.hash = url.hash.slice(0, q) + (rest ? `?${rest}` : '');
            window.history.replaceState(window.history.state, '', url);
        }
    }
    listeners.forEach(l => l());
}

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
};

/** The flag, re-rendering when Settings changes it. */
export const useUsbTransferEnabled = (): boolean => useSyncExternalStore(subscribe, isUsbTransferEnabled);
