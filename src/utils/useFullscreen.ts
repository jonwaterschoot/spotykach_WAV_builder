import { useCallback, useEffect, useState } from 'react';

/**
 * The page full screen, for phones above all: no address bar, no tabs, every
 * pixel for the app. Android, iPad and desktop browsers have the Fullscreen
 * API (Safari on iPad as webkit…); iPhone Safari has none for pages, so
 * `supported` is false there and the way in is Share › Add to Home Screen
 * (index.html marks the app capable of running stand-alone).
 */

type WebkitDocument = Document & {
    webkitFullscreenEnabled?: boolean;
    webkitFullscreenElement?: Element | null;
    webkitExitFullscreen?: () => Promise<void>;
};
type WebkitElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };

const doc = () => document as WebkitDocument;
const current = () => doc().fullscreenElement ?? doc().webkitFullscreenElement ?? null;

export const fullscreenSupported = (): boolean =>
    typeof document !== 'undefined' && !!(doc().fullscreenEnabled || doc().webkitFullscreenEnabled);

/** Opened from the home screen: already without the browser's bars. */
export const runningStandalone = (): boolean =>
    typeof window !== 'undefined'
    && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

export function useFullscreen() {
    const [active, setActive] = useState(() => typeof document !== 'undefined' && !!current());

    useEffect(() => {
        const sync = () => setActive(!!current());
        document.addEventListener('fullscreenchange', sync);
        document.addEventListener('webkitfullscreenchange', sync);
        return () => {
            document.removeEventListener('fullscreenchange', sync);
            document.removeEventListener('webkitfullscreenchange', sync);
        };
    }, []);

    /** In or out. Call straight from a click: browsers only allow it then. */
    const toggle = useCallback(async () => {
        try {
            if (current()) {
                await (document.exitFullscreen?.() ?? doc().webkitExitFullscreen?.());
            } else {
                const root = document.documentElement as WebkitElement;
                await (root.requestFullscreen?.({ navigationUI: 'hide' }) ?? root.webkitRequestFullscreen?.());
            }
        } catch (e) {
            console.warn('Full screen was refused', e);
        }
    }, []);

    return { supported: fullscreenSupported(), active, toggle };
}
