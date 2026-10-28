/**
 * How fast USB moves slot files, for the time estimates beside a transfer.
 *
 * Measured on firmware 1.4.0.b1, Windows, Oct 13 2026: Hainbach's Spotykach Tapes,
 * 36 slots, 286.5 MB in 10 min 16 s (477 KB/s; 413–501 KB/s per slot), plus about
 * 10 s to download the audio. Downloads off the device run at the same speed.
 */
export const USB_BYTES_PER_SECOND = 477 * 1024;

/** "45 s", "3 min 05 s". */
export const formatSeconds = (seconds: number): string => {
    const s = Math.max(1, Math.round(seconds));
    return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
};

/**
 * Seconds left in a transfer: this run's own pace once it has moved enough to go by,
 * the measured figure before that.
 */
export const usbSecondsLeft = (bytesLeft: number, bytesMoved: number, secondsSoFar: number): number => {
    const rate = bytesMoved > 256 * 1024 && secondsSoFar > 1 ? bytesMoved / secondsSoFar : USB_BYTES_PER_SECOND;
    return bytesLeft / rate;
};
