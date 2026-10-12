/**
 * USB transfer is experimental until the firmware that supports it is released.
 * `?usb=1` turns it on for this browser, `?usb=0` turns it off again.
 */
const KEY = 'wavbuilder.usbTransfer';

/** `?usb=` before the `#`, or inside the hash route (`#/studio?usb=1`). */
function usbParam(): string | null {
    const fromSearch = new URLSearchParams(window.location.search).get('usb');
    if (fromSearch !== null) return fromSearch;
    const hash = window.location.hash;
    const q = hash.indexOf('?');
    return q < 0 ? null : new URLSearchParams(hash.slice(q + 1)).get('usb');
}

export function isUsbTransferEnabled(): boolean {
    const param = usbParam();
    try {
        if (param === '1') localStorage.setItem(KEY, '1');
        else if (param === '0') localStorage.removeItem(KEY);
        return localStorage.getItem(KEY) === '1';
    } catch {
        return param === '1';
    }
}
