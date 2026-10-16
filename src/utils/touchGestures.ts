import { useEffect, useRef, type RefObject } from 'react';

/** A finger, not a mouse: the screens where handles need room for a fingertip. */
export const isCoarsePointer = () =>
    typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;

/** A two-finger gesture, measured from where it started. */
export interface TwoFingerFrame {
    /** Spread between the fingers now over at the start, per axis. 1 when that axis started too narrow to read. */
    scaleX: number;
    scaleY: number;
    /** The point between the fingers, client px. */
    midX: number;
    midY: number;
}

export interface TwoFingerHandlers {
    /** The second finger is down. `midX`/`midY` is the start point. */
    onStart: (start: TwoFingerFrame) => void;
    /** At most once a frame while both fingers move. */
    onMove: (frame: TwoFingerFrame) => void;
    onEnd?: () => void;
}

/** Below this spread an axis is taken as not pinched (two fingers side by side zoom only one way). */
const MIN_SPAN = 40;
const TAP_MS = 300;
const TAP_SLOP = 12;
const DOUBLE_TAP_GAP = 30;

/** The nearest ancestor that scrolls vertically, which a two-finger drag up or down scrolls. */
const scrollParentY = (el: HTMLElement | null): HTMLElement | null => {
    for (let p = el?.parentElement; p; p = p.parentElement) {
        const oy = getComputedStyle(p).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p;
    }
    return document.scrollingElement as HTMLElement | null;
};

/**
 * Touch on a wave: one finger belongs to the tools, two to the view.
 *
 * The element should be `touch-none`, so the browser leaves every finger to us.
 * Listeners sit in the capture phase, ahead of everything inside: once a second
 * finger lands, no finger's moves reach the wave's own handlers (a trim handle
 * the first finger grabbed stays put), and the second finger never reaches them
 * at all. The first finger's up still goes through, so whatever it started ends.
 * A two-finger drag up or down scrolls the page or panel around the wave.
 *
 * Also: a double tap reaches the wave as a `dblclick` where the second tap
 * landed (browsers don't send one for touch reliably), and a click straight
 * after a gesture is dropped.
 */
export function useTwoFingerGesture(ref: RefObject<HTMLElement | null>, handlers: TwoFingerHandlers) {
    const handlersRef = useRef(handlers);
    useEffect(() => { handlersRef.current = handlers; });

    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        /** Touch pointers down, and whether their down reached the wave. */
        const fingers = new Map<number, { x: number; y: number; passed: boolean }>();
        let gesture: {
            span: { x: number; y: number };
            mid: { x: number; y: number };
            scroller: HTMLElement | null;
            scrollTop: number;
        } | null = null;
        /** Fingers stay held back until all of them are up, so the last one can't scrub. */
        let holding = false;
        let lastGestureEnd = 0;
        let frame = 0;
        let tap: { id: number; x: number; y: number; t: number } | null = null;
        let lastTap: { x: number; y: number; t: number } | null = null;

        const measure = (): TwoFingerFrame | null => {
            const [a, b] = [...fingers.values()];
            if (!a || !b) return null;
            return {
                scaleX: Math.abs(a.x - b.x),
                scaleY: Math.abs(a.y - b.y),
                midX: (a.x + b.x) / 2,
                midY: (a.y + b.y) / 2,
            };
        };

        const block = (e: Event) => {
            e.stopPropagation();
            if (e.cancelable) e.preventDefault();
        };

        const onDown = (e: PointerEvent) => {
            if (e.pointerType !== 'touch') return;
            if (fingers.size >= 1 || holding) {
                fingers.set(e.pointerId, { x: e.clientX, y: e.clientY, passed: false });
                block(e);
                tap = null;
                if (fingers.size === 2 && !gesture) {
                    const m = measure()!;
                    const scroller = scrollParentY(el);
                    gesture = {
                        span: { x: m.scaleX, y: m.scaleY },
                        mid: { x: m.midX, y: m.midY },
                        scroller,
                        scrollTop: scroller?.scrollTop ?? 0,
                    };
                    holding = true;
                    handlersRef.current.onStart({ scaleX: 1, scaleY: 1, midX: m.midX, midY: m.midY });
                }
                return;
            }
            fingers.set(e.pointerId, { x: e.clientX, y: e.clientY, passed: true });
            tap = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp };
        };

        const onMove = (e: PointerEvent) => {
            const f = fingers.get(e.pointerId);
            if (!f) return;
            f.x = e.clientX;
            f.y = e.clientY;
            if (tap?.id === e.pointerId && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > TAP_SLOP) tap = null;
            if (!holding) return;
            block(e);
            if (!gesture || frame) return;
            frame = requestAnimationFrame(() => {
                frame = 0;
                const m = gesture && measure();
                if (!gesture || !m) return;
                const scaleX = gesture.span.x >= MIN_SPAN ? Math.max(m.scaleX, 1) / gesture.span.x : 1;
                const scaleY = gesture.span.y >= MIN_SPAN ? Math.max(m.scaleY, 1) / gesture.span.y : 1;
                if (gesture.scroller) gesture.scroller.scrollTop = gesture.scrollTop - (m.midY - gesture.mid.y);
                handlersRef.current.onMove({ scaleX, scaleY, midX: m.midX, midY: m.midY });
            });
        };

        const onUp = (e: PointerEvent) => {
            const f = fingers.get(e.pointerId);
            if (!f) return;
            fingers.delete(e.pointerId);
            if (!f.passed) block(e);
            if (gesture && fingers.size < 2) {
                gesture = null;
                lastGestureEnd = e.timeStamp;
                handlersRef.current.onEnd?.();
            }
            if (fingers.size === 0) holding = false;

            // A tap: the second one close behind the first makes a double tap.
            const wasTap = e.type === 'pointerup' && tap?.id === e.pointerId && e.timeStamp - tap.t < TAP_MS;
            tap = null;
            if (!wasTap) return;
            const now = { x: e.clientX, y: e.clientY, t: e.timeStamp };
            if (lastTap && now.t - lastTap.t < TAP_MS && Math.hypot(now.x - lastTap.x, now.y - lastTap.y) < DOUBLE_TAP_GAP) {
                lastTap = null;
                const target = e.target instanceof Element ? e.target : el;
                // After this up's click: the order a mouse's double-click has.
                setTimeout(() => target.dispatchEvent(new MouseEvent('dblclick', {
                    bubbles: true, cancelable: true, composed: true, clientX: now.x, clientY: now.y, detail: 2,
                })));
            } else {
                lastTap = now;
            }
        };

        // A touch's own dblclick (where a browser sends one) would come twice with ours.
        let lastPointerType = '';
        const notePointer = (e: PointerEvent) => { lastPointerType = e.pointerType; };
        const onDblClick = (e: MouseEvent) => {
            if (e.isTrusted && lastPointerType === 'touch') block(e);
        };
        const onClick = (e: MouseEvent) => {
            if (lastPointerType === 'touch' && e.timeStamp - lastGestureEnd < 400) block(e);
        };

        const opts = { capture: true, passive: false } as const;
        el.addEventListener('pointerdown', notePointer, opts);
        el.addEventListener('pointerdown', onDown, opts);
        el.addEventListener('pointermove', onMove, opts);
        el.addEventListener('pointerup', onUp, opts);
        el.addEventListener('pointercancel', onUp, opts);
        el.addEventListener('dblclick', onDblClick, opts);
        el.addEventListener('click', onClick, opts);
        return () => {
            cancelAnimationFrame(frame);
            el.removeEventListener('pointerdown', notePointer, opts);
            el.removeEventListener('pointerdown', onDown, opts);
            el.removeEventListener('pointermove', onMove, opts);
            el.removeEventListener('pointerup', onUp, opts);
            el.removeEventListener('pointercancel', onUp, opts);
            el.removeEventListener('dblclick', onDblClick, opts);
            el.removeEventListener('click', onClick, opts);
        };
    }, [ref]);
}
