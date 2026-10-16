import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

/**
 * A number field you can drag. Press and drag (up or right raises it, Shift for
 * fine steps) to scrub the value; a click without a drag puts the caret in to type.
 * On a touch screen a vertical swipe scrolls the page instead, so a finger scrubs sideways.
 * The arrows step once, and keep stepping while held. Arrow keys work when typing.
 *
 * `scale: 'log'` is for wide ranges (milliseconds from 20 to 10 000): each pixel
 * moves the value by a ratio, not an amount, so it is as easy to set 30 as 3000.
 */

interface ScrubNumberProps {
    value: number;
    onChange: (value: number) => void;
    min: number;
    max: number;
    step?: number;
    scale?: 'linear' | 'log';
    /** Shown after the number while not typing, e.g. "ms". */
    unit?: string;
    /** Digits after the point. Default: from `step`. */
    decimals?: number;
    disabled?: boolean;
    ariaLabel?: string;
    /** Tailwind width class for the field. */
    width?: string;
    onHover?: (hovering: boolean) => void;
}

const DRAG_THRESHOLD = 3;
/** Pixels of drag per step (linear), or per doubling (log). */
const LINEAR_PX = 4;
const LOG_PX_PER_DOUBLING = 80;

export function ScrubNumber({
    value, onChange, min, max, step = 1, scale = 'linear', unit, decimals, disabled, ariaLabel, width = 'w-16', onHover,
}: ScrubNumberProps) {
    const places = decimals ?? Math.max(0, (String(step).split('.')[1] ?? '').length);
    const clamp = (v: number) => {
        const stepped = Math.round(v / step) * step;
        return Math.min(max, Math.max(min, +stepped.toFixed(places)));
    };

    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState('');
    const [dragging, setDragging] = useState(false);
    const input = useRef<HTMLInputElement>(null);
    const drag = useRef<{ x: number; y: number; start: number; moved: boolean } | null>(null);
    const repeat = useRef<{ timeout?: ReturnType<typeof setTimeout>; interval?: ReturnType<typeof setInterval> }>({});
    // The held arrow reads the latest value, not the one it was pressed on.
    const valueRef = useRef(value);
    useEffect(() => { valueRef.current = value; }, [value]);

    useEffect(() => () => { clearTimeout(repeat.current.timeout); clearInterval(repeat.current.interval); }, []);

    const nudge = (direction: 1 | -1, fine = false) => {
        const v = valueRef.current;
        if (scale === 'log') {
            const next = clamp(Math.max(v, direction > 0 ? step : 0) * Math.pow(2, direction * (fine ? 0.05 : 0.25)));
            // Near the bottom a ratio rounds back to the same value: take one step instead.
            onChange(next === v ? clamp(v + direction * step) : next);
        } else onChange(clamp(v + direction * step));
    };

    const onPointerDown = (e: React.PointerEvent<HTMLInputElement>) => {
        if (disabled || editing || e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, y: e.clientY, start: value, moved: false };
    };

    const onPointerMove = (e: React.PointerEvent<HTMLInputElement>) => {
        const d = drag.current;
        if (!d) return;
        const delta = (e.clientX - d.x) - (e.clientY - d.y);
        if (!d.moved && Math.abs(delta) < DRAG_THRESHOLD) return;
        if (!d.moved) { d.moved = true; setDragging(true); }
        const fine = e.shiftKey ? 0.2 : 1;
        const next = scale === 'log'
            // From 0 (a crossfade) the first doubling starts at one step.
            ? Math.max(d.start, step) * Math.pow(2, (delta * fine) / LOG_PX_PER_DOUBLING)
            : d.start + Math.round((delta * fine) / LINEAR_PX) * step;
        onChange(clamp(next));
    };

    const onPointerUp = (e: React.PointerEvent<HTMLInputElement>) => {
        const d = drag.current;
        drag.current = null;
        setDragging(false);
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
        if (d && !d.moved) {
            // A click: type a value.
            setDraft(value.toFixed(places));
            setEditing(true);
            requestAnimationFrame(() => { input.current?.focus(); input.current?.select(); });
        }
    };

    const commit = () => {
        const parsed = parseFloat(draft.replace(',', '.'));
        if (Number.isFinite(parsed)) onChange(clamp(parsed));
        setEditing(false);
    };

    const startRepeat = (direction: 1 | -1) => {
        if (disabled) return;
        nudge(direction);
        repeat.current.timeout = setTimeout(() => {
            repeat.current.interval = setInterval(() => nudge(direction), 60);
        }, 350);
    };
    const stopRepeat = () => {
        clearTimeout(repeat.current.timeout);
        clearInterval(repeat.current.interval);
    };

    const shown = editing ? draft : `${value.toFixed(places)}${unit ? ` ${unit}` : ''}`;

    return (
        <div
            className={`group inline-flex items-stretch rounded-md border bg-gray-900 transition-colors ${width}
                ${dragging ? 'border-synthux-red' : 'border-gray-700 hover:border-gray-500'} ${disabled ? 'opacity-40' : ''}`}
            onMouseEnter={() => onHover?.(true)}
            onMouseLeave={() => onHover?.(false)}
        >
            <input
                ref={input}
                type="text"
                inputMode="decimal"
                aria-label={ariaLabel}
                disabled={disabled}
                readOnly={!editing}
                value={shown}
                onChange={e => setDraft(e.target.value)}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={() => { drag.current = null; setDragging(false); }}
                onBlur={() => { if (editing) commit(); }}
                onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); commit(); input.current?.blur(); }
                    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setEditing(false); input.current?.blur(); }
                    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                        e.preventDefault();
                        nudge(e.key === 'ArrowUp' ? 1 : -1, e.shiftKey);
                        setEditing(false);
                    }
                }}
                className={`min-w-0 flex-1 bg-transparent px-1.5 py-1 text-center text-[11px] font-bold tabular-nums text-synthux-red
                    focus:outline-none select-none touch-pan-y ${editing ? 'cursor-text' : 'cursor-ew-resize'}`}
                title={editing ? undefined : 'Drag to change, click to type'}
            />
            <div className="flex flex-col border-l border-gray-700 group-hover:border-gray-500 transition-colors">
                {([1, -1] as const).map(direction => (
                    <button
                        key={direction}
                        type="button"
                        tabIndex={-1}
                        disabled={disabled || (direction === 1 ? value >= max : value <= min)}
                        aria-label={direction === 1 ? 'Increase' : 'Decrease'}
                        onPointerDown={e => { e.preventDefault(); startRepeat(direction); }}
                        onPointerUp={stopRepeat}
                        onPointerLeave={stopRepeat}
                        className="flex-1 px-0.5 flex items-center justify-center text-gray-500 hover:text-white hover:bg-synthux-red/60
                            disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-500 transition-colors
                            first:rounded-tr-md last:rounded-br-md"
                    >
                        {direction === 1 ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                    </button>
                ))}
            </div>
        </div>
    );
}
