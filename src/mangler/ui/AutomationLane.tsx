import React, { useRef, useState } from 'react';
import { LFO_PER_STEP, STEPS, autoAt, type AutoPoint } from '../sequence';

/**
 * One pattern's automation for a CC track: points over 16 steps, 0–127, drawn
 * as they will be sent. The same gestures as the editor's volume tool
 * (AutomationOverlay), on pointer events so they work on a touch screen:
 *
 * - double-click (double-tap) to add a point; on a point, to remove it;
 * - drag a point (and the others selected with it) to move it; Alt for free time,
 *   otherwise it snaps to quarter steps, where the messages go out;
 * - drag on an empty spot to select a box of points; Shift adds to the selection;
 * - Delete removes the selected points, the arrow keys nudge them.
 */

interface AutomationLaneProps {
    points: readonly AutoPoint[];
    /** Always called with the points sorted by `at`. */
    onChange: (points: AutoPoint[]) => void;
    width: number;
    height: number;
    smooth?: boolean;
    color: string;
    /** Step being heard in this pattern (0–16), or null. */
    playhead?: number | null;
    /**
     * The curve to draw, `pos` steps into the block, when it isn't these points
     * alone (connected automation runs in from the block before and on to the next).
     */
    curveAt?: (pos: number) => number | null;
}

const PAD = 4;
const DOUBLE_TAP_MS = 320;
const snapAt = (at: number) => Math.round(at * LFO_PER_STEP) / LFO_PER_STEP;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const AutomationLane: React.FC<AutomationLaneProps> = ({ points, onChange, width, height, smooth, color, playhead, curveAt }) => {
    const svg = useRef<SVGSVGElement>(null);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [box, setBox] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
    const [dragging, setDragging] = useState(false);
    const drag = useRef<{ kind: 'points' | 'box'; x0: number; y0: number; start: AutoPoint[]; sel: Set<number>; moved: boolean; shift: boolean } | null>(null);
    const lastTap = useRef<{ time: number; x: number; y: number } | null>(null);

    const xOf = (at: number) => (at / STEPS) * width;
    const yOf = (value: number) => PAD + (1 - value / 127) * (height - 2 * PAD);
    const atOf = (x: number) => clamp((x / width) * STEPS, 0, STEPS);
    const valueOf = (y: number) => clamp(Math.round((1 - (y - PAD) / (height - 2 * PAD)) * 127), 0, 127);

    const local = (e: React.PointerEvent) => {
        const r = svg.current!.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    /** Sorts the points, carrying the selection along. */
    const commit = (next: AutoPoint[], sel: Set<number>) => {
        const order = next.map((p, i) => ({ p, sel: sel.has(i) })).sort((a, b) => a.p.at - b.p.at);
        setSelected(new Set(order.flatMap((o, i) => (o.sel ? [i] : []))));
        onChange(order.map(o => o.p));
    };
    const hit = (x: number, y: number, touch: boolean) => {
        const reach = touch ? 14 : 8;
        let best = -1, bestD = Infinity;
        points.forEach((p, i) => {
            const d = Math.hypot(xOf(p.at) - x, yOf(p.value) - y);
            if (d <= reach && d < bestD) { best = i; bestD = d; }
        });
        return best;
    };

    const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        svg.current?.focus({ preventScroll: true });
        const { x, y } = local(e);
        const i = hit(x, y, e.pointerType === 'touch');
        const now = performance.now();
        const tap = lastTap.current;
        lastTap.current = { time: now, x, y };
        if (tap && now - tap.time < DOUBLE_TAP_MS && Math.hypot(tap.x - x, tap.y - y) < 12) {
            lastTap.current = null;
            if (i >= 0) {
                commit(points.filter((_, k) => k !== i), new Set());
            } else {
                const at = e.altKey ? atOf(x) : snapAt(atOf(x));
                commit([...points, { at, value: valueOf(y) }], new Set([points.length]));
            }
            return;
        }
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* still a click */ }
        if (i >= 0) {
            const sel = e.shiftKey ? new Set(selected) : selected.has(i) ? new Set(selected) : new Set([i]);
            if (e.shiftKey) { if (sel.has(i)) sel.delete(i); else sel.add(i); }
            setSelected(sel);
            drag.current = { kind: 'points', x0: x, y0: y, start: points.map(p => ({ ...p })), sel, moved: false, shift: e.shiftKey };
        } else {
            if (!e.shiftKey) setSelected(new Set());
            drag.current = { kind: 'box', x0: x, y0: y, start: [], sel: e.shiftKey ? new Set(selected) : new Set(), moved: false, shift: e.shiftKey };
        }
    };

    const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
        const d = drag.current;
        if (!d) return;
        const { x, y } = local(e);
        if (!d.moved && Math.hypot(x - d.x0, y - d.y0) < 3) return;
        d.moved = true;
        if (d.kind === 'box') {
            setBox({ x0: d.x0, y0: d.y0, x1: clamp(x, 0, width), y1: clamp(y, 0, height) });
            return;
        }
        if (!d.sel.size) return;
        setDragging(true);
        const dAt = ((x - d.x0) / width) * STEPS;
        const dV = -((y - d.y0) / (height - 2 * PAD)) * 127;
        const next = d.start.map((p, k) => {
            if (!d.sel.has(k)) return p;
            const raw = clamp(p.at + dAt, 0, STEPS);
            return { at: e.altKey ? raw : snapAt(raw), value: clamp(Math.round(p.value + dV), 0, 127) };
        });
        // Sort for drawing, keep the drag's own order in `start` so the selection stays put.
        const order = next.map((p, k) => ({ p, k })).sort((a, b) => a.p.at - b.p.at);
        setSelected(new Set(order.flatMap((o, i) => (d.sel.has(o.k) ? [i] : []))));
        onChange(order.map(o => o.p));
    };

    const onPointerUp = () => {
        const d = drag.current;
        drag.current = null;
        setDragging(false);
        if (d?.kind === 'box' && box) {
            const [x0, x1] = [Math.min(box.x0, box.x1), Math.max(box.x0, box.x1)];
            const [y0, y1] = [Math.min(box.y0, box.y1), Math.max(box.y0, box.y1)];
            const sel = new Set(d.sel);
            points.forEach((p, i) => {
                const px = xOf(p.at), py = yOf(p.value);
                if (px >= x0 && px <= x1 && py >= y0 && py <= y1) sel.add(i);
            });
            setSelected(sel);
        }
        setBox(null);
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (!selected.size) return;
        if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            commit(points.filter((_, i) => !selected.has(i)), new Set());
            return;
        }
        const big = e.shiftKey ? 10 : 1;
        const dV = e.key === 'ArrowUp' ? big : e.key === 'ArrowDown' ? -big : 0;
        const dAt = e.key === 'ArrowRight' ? 1 / LFO_PER_STEP : e.key === 'ArrowLeft' ? -1 / LFO_PER_STEP : 0;
        if (!dV && !dAt) return;
        e.preventDefault();
        commit(points.map((p, i) => (selected.has(i) ? { at: clamp(p.at + dAt, 0, STEPS), value: clamp(p.value + dV, 0, 127) } : p)), selected);
    };

    // The curve as it will be sent: sampled, so straight and smooth draw the same way.
    const valueAt = curveAt ?? ((pos: number) => autoAt(points, pos, smooth));
    const curve = points.length || (curveAt && curveAt(0) !== null)
        ? Array.from({ length: Math.ceil(width / 2) + 1 }, (_, j) => {
            const x = Math.min(width, j * 2);
            return `${x},${yOf(valueAt(atOf(x)) ?? 0)}`;
        }).join(' ')
        : '';

    return (
        <svg ref={svg} width={width} height={height} tabIndex={0}
            className="block rounded-sm bg-white/[0.03] touch-none outline-none focus-visible:ring-1 focus-visible:ring-white/30 cursor-crosshair"
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
            onKeyDown={onKeyDown} onContextMenu={e => e.preventDefault()}
            aria-label="Automation: double-click to add a point, drag to move, Delete to remove">
            {Array.from({ length: STEPS / 4 + 1 }, (_, b) => (
                <line key={b} x1={xOf(b * 4)} x2={xOf(b * 4)} y1={0} y2={height} stroke="rgba(255,255,255,0.08)" />
            ))}
            <line x1={0} x2={width} y1={yOf(64)} y2={yOf(64)} stroke="rgba(255,255,255,0.06)" strokeDasharray="2 3" />
            {curve && <polyline points={curve} fill="none" stroke={color} strokeWidth={1.5} />}
            {!points.length && (
                <text x={width / 2} y={height / 2} textAnchor="middle" dominantBaseline="middle" className="fill-gray-600 text-[9px]">
                    double-click to add
                </text>
            )}
            {points.map((p, i) => (
                <g key={i}>
                    <circle cx={xOf(p.at)} cy={yOf(p.value)} r={selected.has(i) ? 4 : 3}
                        fill={selected.has(i) ? '#fff' : color} stroke={selected.has(i) ? color : 'none'} strokeWidth={2} />
                    {dragging && selected.has(i) && (
                        <text x={clamp(xOf(p.at), 10, width - 10)} y={Math.max(9, yOf(p.value) - 7)} textAnchor="middle"
                            className="fill-white text-[8px] font-mono">{p.value}</text>
                    )}
                </g>
            ))}
            {playhead !== null && playhead !== undefined && (
                <line x1={xOf(playhead + 0.5)} x2={xOf(playhead + 0.5)} y1={0} y2={height} stroke="rgba(255,255,255,0.6)" />
            )}
            {box && (
                <rect x={Math.min(box.x0, box.x1)} y={Math.min(box.y0, box.y1)} width={Math.abs(box.x1 - box.x0)} height={Math.abs(box.y1 - box.y0)}
                    fill={`${color}22`} stroke={`${color}88`} strokeDasharray="2 2" />
            )}
        </svg>
    );
};
