import React, { useContext } from 'react';
import { DensityContext } from './density';

/**
 * The mangler's sliders. Native range inputs, so keyboard and screen readers get
 * the real thing; the two-handle version stacks two inputs on one track and lets
 * only the thumbs take the pointer.
 */

const STEPS = 1000;

/** `cubic` is for ranges that start at 0 (crossfades): fine at the bottom, coarse at the top. */
type Scale = 'linear' | 'log' | 'cubic';

const toPosition = (value: number, min: number, max: number, scale: Scale) => {
    if (scale === 'log') return (Math.log(value / min) / Math.log(max / min)) * STEPS;
    const t = (value - min) / (max - min);
    return (scale === 'cubic' ? Math.cbrt(t) : t) * STEPS;
};

const fromPosition = (pos: number, min: number, max: number, scale: Scale, step?: number) => {
    const t = pos / STEPS;
    const raw = scale === 'log' ? min * Math.pow(max / min, t)
        : min + (scale === 'cubic' ? t * t * t : t) * (max - min);
    if (step) return Math.round(raw / step) * step;
    if (raw === 0) return 0;
    // Log and cubic scales: keep about two significant digits, so 1234 ms reads 1200.
    const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(1e-9, Math.abs(raw)))) - 1);
    return Math.round(raw / magnitude) * magnitude;
};

const THUMB = `appearance-none bg-transparent pointer-events-none
  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:pointer-events-auto
  [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:rounded-full
  [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer
  [&::-webkit-slider-thumb]:shadow-[0_0_0_3px_rgba(0,0,0,0.6)]
  [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5
  [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-0
  [&::-moz-range-thumb]:cursor-pointer
  focus:outline-none focus-visible:[&::-webkit-slider-thumb]:ring-2 focus-visible:[&::-webkit-slider-thumb]:ring-synthux-red`;

interface FieldProps {
    label: string;
    readout: React.ReactNode;
    hint?: string;
    children: React.ReactNode;
}

const Field: React.FC<FieldProps> = ({ label, readout, hint, children }) => {
    const compact = useContext(DensityContext) === 'compact';
    return (
    <div className={compact ? 'space-y-0.5' : 'space-y-1.5'} title={hint}>
        {/* Wraps instead of overflowing: in a narrow column the readout goes under the label. */}
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 text-[11px]">
            <span className="text-gray-400">{label}</span>
            <Readout value={readout} />
        </div>
        {children}
    </div>
    );
};

const Readout = ({ value }: { value: React.ReactNode }) => (typeof value === 'string'
    ? <span className="font-mono text-gray-200 tabular-nums text-right whitespace-nowrap justify-self-end">{value}</span>
    : <>{value}</>);

interface RangeSliderProps {
    label: string;
    min: number;
    max: number;
    low: number;
    high: number;
    onChange: (low: number, high: number) => void;
    format: (value: number) => string;
    scale?: Scale;
    step?: number;
    hint?: string;
    /** Replaces the text readout, e.g. with editable fields. */
    readout?: React.ReactNode;
}

export const RangeSlider: React.FC<RangeSliderProps> = ({
    label, min, max, low, high, onChange, format, scale = 'linear', step, hint, readout,
}) => {
    const lowPos = toPosition(low, min, max, scale);
    const highPos = toPosition(high, min, max, scale);
    const value = (pos: number) => Math.min(max, Math.max(min, fromPosition(pos, min, max, scale, step)));

    return (
        <Field label={label} readout={readout ?? (low === high ? format(low) : `${format(low)} – ${format(high)}`)} hint={hint}>
            <div className="relative h-4">
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-white/10" />
                <div
                    className="absolute top-1/2 -translate-y-1/2 h-1 rounded-full bg-synthux-red/70"
                    style={{ left: `${(lowPos / STEPS) * 100}%`, right: `${100 - (highPos / STEPS) * 100}%` }}
                />
                <input
                    type="range" min={0} max={STEPS} value={lowPos} aria-label={`${label}, minimum`}
                    onChange={e => onChange(Math.min(value(Number(e.target.value)), high), high)}
                    className={`absolute inset-0 w-full h-4 ${THUMB}`}
                />
                <input
                    type="range" min={0} max={STEPS} value={highPos} aria-label={`${label}, maximum`}
                    onChange={e => onChange(low, Math.max(value(Number(e.target.value)), low))}
                    className={`absolute inset-0 w-full h-4 ${THUMB}`}
                />
            </div>
        </Field>
    );
};

interface SliderProps {
    label: string;
    min: number;
    max: number;
    value: number;
    onChange: (value: number) => void;
    format: (value: number) => string;
    step?: number;
    hint?: string;
    disabled?: boolean;
    /** Replaces the text readout, e.g. with an editable field. */
    readout?: React.ReactNode;
}

export const Slider: React.FC<SliderProps> = ({ label, min, max, value, onChange, format, step = 1, hint, disabled, readout }) => {
    const compact = useContext(DensityContext) === 'compact';
    const input = (
        <input
            type="range" min={min} max={max} step={step} value={value} disabled={disabled} aria-label={label}
            onChange={e => onChange(Number(e.target.value))}
            className="w-full h-4 accent-synthux-red cursor-pointer disabled:cursor-not-allowed"
        />
    );
    // Compact: label, slider and value on one row when the row is 20rem wide or more;
    // narrower, the slider gets its own row so it stays long enough to use.
    if (compact) return (
        <div className={`@container text-[11px] ${disabled ? 'opacity-40' : ''}`} title={hint}>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-0.5 items-center
                @min-[20rem]:grid-cols-[minmax(0,6.5rem)_minmax(3rem,1fr)_minmax(5rem,auto)]">
                <span className="text-gray-400 leading-tight">{label}</span>
                <span className="justify-self-end @min-[20rem]:col-start-3 @min-[20rem]:row-start-1">
                    <Readout value={readout ?? format(value)} />
                </span>
                <span className="col-span-2 @min-[20rem]:col-span-1 @min-[20rem]:col-start-2 @min-[20rem]:row-start-1 flex">
                    {input}
                </span>
            </div>
        </div>
    );
    return (
        <div className={disabled ? 'opacity-40' : undefined}>
            <Field label={label} readout={readout ?? format(value)} hint={hint}>{input}</Field>
        </div>
    );
};

interface ToggleProps {
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    hint?: string;
}

export const Toggle: React.FC<ToggleProps> = ({ label, checked, onChange, hint }) => (
    <label className="flex items-center justify-between gap-3 text-[11px] text-gray-400 cursor-pointer" title={hint}>
        <span>{label}</span>
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
            className="accent-synthux-red h-3.5 w-3.5 cursor-pointer" />
    </label>
);

interface SegmentedProps<T extends string> {
    label: string;
    options: readonly { value: T; label: string }[];
    value: T;
    onChange: (value: T) => void;
    hint?: string;
}

export function Segmented<T extends string>({ label, options, value, onChange, hint }: SegmentedProps<T>) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px]" title={hint}>
            <span className="text-gray-400">{label}</span>
            <div className="flex rounded-md border border-white/10 overflow-hidden">
                {options.map(o => (
                    <button
                        key={o.value}
                        onClick={() => onChange(o.value)}
                        className={`px-2 py-1 transition-colors ${o.value === value
                            ? 'bg-synthux-red/80 text-white'
                            : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                    >
                        {o.label}
                    </button>
                ))}
            </div>
        </div>
    );
}
