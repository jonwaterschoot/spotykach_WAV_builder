import { appStorage } from '../../utils/storageNamespace';
import { VARIATIONS_MAX } from '../settings';

/**
 * Phone mode: the same mangler with smaller limits, for a tab that gets a few
 * hundred MB at most. Sources are decoded to mono (the output stays stereo), the
 * decode cache holds a minute instead of five, and a click renders fewer
 * variations. Output stays 48 kHz: a lower rate would move cue points and
 * transients, so a recipe would not render the same on a desktop.
 *
 * On by itself on a small device; the header switch overrides it either way.
 */

export interface DeviceLimits {
    /** Decode sources to mono, halving what a batch holds. */
    mono: boolean;
    /** Seconds of decoded sources kept between batches. */
    cacheSeconds: number;
    /** Above this many seconds of switched-on sources, the pool warns. */
    poolWarnSeconds: number;
    variationsMax: number;
}

export const DESKTOP_LIMITS: DeviceLimits = {
    mono: false, cacheSeconds: 300, poolWarnSeconds: 600, variationsMax: VARIATIONS_MAX,
};

export const PHONE_LIMITS: DeviceLimits = {
    mono: true, cacheSeconds: 60, poolWarnSeconds: 120, variationsMax: 4,
};

const KEY = 'mangler_phone_mode';

/** 4 GB or less, or a touch screen narrower than a tablet. */
export function looksLikePhone(): boolean {
    try {
        const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
        if (memory !== undefined && memory <= 4) return true;
        return window.matchMedia('(pointer: coarse) and (max-width: 820px)').matches;
    } catch {
        return false;
    }
}

/** The stored choice, or the guess when there is none. */
export function loadPhoneMode(): boolean {
    try {
        const stored = appStorage.getItem(KEY);
        if (stored === '1') return true;
        if (stored === '0') return false;
    } catch { /* no storage: guess */ }
    return looksLikePhone();
}

export function savePhoneMode(on: boolean) {
    try { appStorage.setItem(KEY, on ? '1' : '0'); } catch { /* not remembered */ }
}
