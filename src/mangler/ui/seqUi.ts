import { useEffect, useRef, useState } from 'react';
import type { HitClass } from '../hits';
import type { MangleSliceEntry } from '../../utils/persistence';
import {
    CUE_BASE_NOTE, ROOT_NOTE, noteName, snapToScale,
    type PatternId, type SeqStep, type SeqTrack, type TrackKind,
} from '../sequence';

/**
 * What the sequencer's two step grids share (the pattern grid in the station
 * and the timeline's mini cells): colours, and what dragging a step does.
 */

export const CLASS_COLOR: Record<HitClass, string> = { low: '#f58b44', mid: '#f5d544', high: '#4771f9' };
export const CUE_COLOR = '#2dd4bf';
export const CC_COLOR = '#a78bfa';

export const CONNECT_HINT = 'Connect: the automation runs on from one bar to the next and from the end of the chain round to its start, '
    + 'instead of holding within each pattern. It follows the chain when bars move';

export const kindOf = (t: SeqTrack): TrackKind => t.kind ?? 'slice';

/** A track's colour: its slice's class, cue or CC. */
export const trackColor = (t: SeqTrack, sliceById: Map<string, MangleSliceEntry>) => {
    const kind = kindOf(t);
    if (kind === 'cue') return CUE_COLOR;
    if (kind === 'cc') return CC_COLOR;
    const cls = t.sliceId ? sliceById.get(t.sliceId)?.cls : undefined;
    return cls ? CLASS_COLOR[cls] : '#d1d5db';
};

/** A step's colour: its locked slice's class, or the track's. */
export const stepColor = (s: SeqStep, trackColour: string, sliceById: Map<string, MangleSliceEntry>) => {
    const cls = s.sliceId ? sliceById.get(s.sliceId)?.cls : undefined;
    return cls ? CLASS_COLOR[cls] : trackColour;
};

/** What dragging a step up and down sets, as picked in the station. */
export type DragEdit = 'velocity' | 'pitch' | 'chance';
/** What it sets on this track: CC steps set the value, a cue track's pitch picks the cue. */
export type DragWhat = 'velocity' | 'pitch' | 'cue' | 'value' | 'chance';

export const dragWhat = (track: SeqTrack, edit: DragEdit): DragWhat => {
    const kind = kindOf(track);
    if (edit === 'chance') return 'chance';
    if (kind === 'cc') return 'value';
    if (kind === 'cue' && edit === 'pitch') return 'cue';
    return edit;
};

/** Chance as shown: "50%", or nothing when the step always plays. */
export const chanceLabel = (s: SeqStep) => (s.chance !== undefined && s.chance < 1 ? `${Math.round(s.chance * 100)}%` : '');

interface DragState {
    key: string;
    y0: number;
    step: SeqStep;
    wasOn: boolean;
    moved: boolean;
    /** A finger: it has to hold still for a moment before a drag sets anything. */
    touch: boolean;
    /** The finger held still long enough: this drag edits the step, not the page's scroll. */
    held: boolean;
    /** The finger moved off before the hold: neither a drag nor a tap. */
    abandoned: boolean;
}

/** How long a finger holds a step still before dragging it sets a value; a quicker swipe scrolls. */
export const TOUCH_HOLD_MS = 200;
/** How far a finger may wander during the hold. */
const TOUCH_SLOP_PX = 8;

/**
 * The patch a vertical drag of `dy` pixels (up is positive) makes to a step, and
 * what its label says. 100 px is the whole range of velocity, value or chance;
 * 8 px a semitone or a cue. A dragged step is on.
 */
export function dragPatch(
    track: SeqTrack, what: DragWhat, from: SeqStep, dy: number, scale: { root: number; mask: number },
): { patch: Partial<SeqStep>; label: string } {
    if (what === 'velocity' || what === 'value') {
        const v = Math.min(1, Math.max(what === 'value' ? 0 : 0.05, Math.round((from.velocity + dy / 100) * 100) / 100));
        return { patch: { on: true, velocity: v }, label: what === 'value' ? String(Math.round(v * 127)) : `${Math.round(v * 100)}%` };
    }
    if (what === 'chance') {
        const c = Math.min(1, Math.max(0.05, Math.round(((from.chance ?? 1) + dy / 100) * 20) / 20));
        return { patch: { on: true, chance: c >= 1 ? undefined : c }, label: `${Math.round(c * 100)}% chance` };
    }
    if (what === 'cue') {
        const count = track.cue?.cues.length ?? 1;
        const note = Math.min(CUE_BASE_NOTE + count - 1, Math.max(CUE_BASE_NOTE, (from.note ?? CUE_BASE_NOTE) + Math.round(dy / 8)));
        return { patch: { on: true, note }, label: `cue ${note - CUE_BASE_NOTE + 1} · ${noteName(note)}` };
    }
    // Two octaves either way; with Scale on, scale notes only.
    let st = Math.min(24, Math.max(-24, (from.shift ?? 0) + Math.round(dy / 8)));
    if (track.scaleLock) st = snapToScale(ROOT_NOTE + track.shift + st, track.scale ?? scale) - ROOT_NOTE - track.shift;
    return { patch: { on: true, shift: st || undefined }, label: `${st > 0 ? '+' : ''}${st} st · ${noteName(Math.round(ROOT_NOTE + track.shift + st))}` };
}

/** Where a step lives: the pattern, the track and the step. */
export interface StepRef { pattern: PatternId; t: number; i: number }

/**
 * Click a step to switch it, drag it up or down to set what `what` says. One
 * drag at a time; `label` is the text to show on the step being dragged.
 */
export function useStepDrag(apply: (ref: StepRef, patch: Partial<SeqStep>) => void, scale: { root: number; mask: number }) {
    const drag = useRef<DragState | null>(null);
    const holdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const [label, setLabel] = useState<{ key: string; text: string } | null>(null);

    // Steps let a finger scroll the page (touch-action: pan), so a swipe over the grid
    // scrolls it. Once a step is held, this stops the scroll, so the drag sets its value.
    useEffect(() => {
        const block = (e: TouchEvent) => { if (drag.current?.held && e.cancelable) e.preventDefault(); };
        window.addEventListener('touchmove', block, { passive: false });
        return () => { window.removeEventListener('touchmove', block); clearTimeout(holdTimer.current); };
    }, []);

    const cancel = () => { clearTimeout(holdTimer.current); drag.current = null; setLabel(null); };

    const handlers = (key: string, ref: StepRef, track: SeqTrack, step: SeqStep, what: DragWhat) => ({
        onPointerDown: (e: React.PointerEvent) => {
            if (e.button !== 0) return;
            try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* no live pointer: still a click */ }
            const touch = e.pointerType === 'touch';
            drag.current = { key, y0: e.clientY, step, wasOn: step.on, moved: false, touch, held: !touch, abandoned: false };
            clearTimeout(holdTimer.current);
            if (touch) {
                holdTimer.current = setTimeout(() => {
                    const d = drag.current;
                    if (!d || d.key !== key || d.abandoned) return;
                    d.held = true;
                    // Grabbed: show what a drag would change, and a tick where the phone can.
                    setLabel({ key, text: dragPatch(track, what, d.step, 0, scale).label });
                    try { navigator.vibrate?.(8); } catch { /* not allowed: fine */ }
                }, TOUCH_HOLD_MS);
            }
        },
        onPointerMove: (e: React.PointerEvent) => {
            const d = drag.current;
            if (!d || d.key !== key || d.abandoned) return;
            const dy = d.y0 - e.clientY;
            if (!d.held) {
                // A finger that moves before the hold is scrolling (or sliding off): leave the step alone.
                if (Math.abs(dy) > TOUCH_SLOP_PX) { d.abandoned = true; clearTimeout(holdTimer.current); }
                return;
            }
            if (!d.moved && Math.abs(dy) < 4) return;
            d.moved = true;
            const { patch, label } = dragPatch(track, what, d.step, dy, scale);
            apply(ref, patch);
            setLabel({ key, text: label });
        },
        onPointerUp: () => {
            const d = drag.current;
            cancel();
            if (d && d.key === key && !d.moved && !d.abandoned) apply(ref, { on: !d.wasOn });
        },
        // The browser took the touch for a scroll.
        onPointerCancel: cancel,
    });

    return { handlers, label, cancel };
}
