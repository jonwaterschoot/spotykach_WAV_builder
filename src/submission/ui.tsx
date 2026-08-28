import React from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { ACCENTS, type ChoiceAccent } from './accents';

/**
 * The form primitives the six steps share.
 *
 * Small on purpose. The app has no form library and no design system beyond its
 * Tailwind palette, and six steps each spelling out the same label/input/hint stack
 * is how a form drifts — one step with a `mb-4`, another with `mb-3`, and a
 * placeholder colour that changed once and never propagated.
 */

export const StepHeading: React.FC<{ title: string; children?: React.ReactNode }> = ({ title, children }) => (
    <div className="mb-6">
        <h2 className="text-xl font-bold tracking-tight font-header">{title}</h2>
        {children && <p className="mt-2 text-sm text-gray-400 leading-relaxed max-w-2xl">{children}</p>}
    </div>
);

interface FieldProps {
    label: string;
    hint?: React.ReactNode;
    /** Shown beside the label, in the muted style — "optional", a counter, a slug. */
    aside?: React.ReactNode;
    required?: boolean;
    children: React.ReactNode;
}

export const Field: React.FC<FieldProps> = ({ label, hint, aside, required, children }) => (
    <label className="block mb-5">
        <span className="flex items-baseline justify-between gap-3 mb-1.5">
            <span className="text-xs font-bold uppercase tracking-widest text-gray-400">
                {label}
                {required && <span className="text-synthux-orange ml-1">*</span>}
            </span>
            {aside && <span className="text-[11px] text-gray-600 font-mono truncate">{aside}</span>}
        </span>
        {children}
        {hint && <span className="block mt-1.5 text-xs text-gray-500 leading-relaxed">{hint}</span>}
    </label>
);

const INPUT_CLASS =
    'w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white ' +
    'placeholder:text-gray-600 focus:outline-none focus:border-synthux-green/60 transition-colors';

export const TextInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({ className, ...props }) => (
    <input type="text" {...props} className={`${INPUT_CLASS} ${className || ''}`} />
);

export const TextArea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = ({ className, ...props }) => (
    <textarea {...props} className={`${INPUT_CLASS} resize-y leading-relaxed ${className || ''}`} />
);

/**
 * A checkbox that is a whole card — step 1's three choices, and the licence list.
 * Its accent arrives as finished class strings; see `accents.ts` for why.
 */
interface ChoiceCardProps {
    checked: boolean;
    onChange: () => void;
    title: string;
    /** `radio` draws a dot and never unchecks by itself; `checkbox` draws a tick. */
    kind?: 'checkbox' | 'radio';
    disabled?: boolean;
    accent?: ChoiceAccent;
    children?: React.ReactNode;
    footer?: React.ReactNode;
}

export const ChoiceCard: React.FC<ChoiceCardProps> = ({
    checked, onChange, title, kind = 'checkbox', disabled, accent = ACCENTS.green, children, footer,
}) => (
    <button
        type="button"
        role={kind === 'radio' ? 'radio' : 'checkbox'}
        aria-checked={checked}
        disabled={disabled}
        onClick={onChange}
        className={`w-full text-left rounded-xl border p-4 transition-all duration-150
            ${checked ? `${accent.border} bg-white/[0.04]` : 'border-white/10 bg-synthux-panel/60 hover:border-white/25'}
            ${disabled ? 'opacity-40 cursor-not-allowed' : ''}
            focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40`}
    >
        <span className="flex items-start gap-3">
            <span
                className={`mt-0.5 shrink-0 w-4 h-4 border flex items-center justify-center
                    ${kind === 'radio' ? 'rounded-full' : 'rounded'}
                    ${checked ? accent.marker : 'border-white/30'}`}
            >
                {checked && (
                    kind === 'radio'
                        ? <span className="w-1.5 h-1.5 rounded-full bg-black" />
                        : <svg viewBox="0 0 12 12" className="w-3 h-3 text-black" aria-hidden>
                            <path d="M2 6.5 L4.5 9 L10 3" fill="none" stroke="currentColor" strokeWidth="2"
                                strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                )}
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-white">{title}</span>
                {children && <span className="block mt-1 text-xs text-gray-400 leading-relaxed">{children}</span>}
                {footer}
            </span>
        </span>
    </button>
);

/** A quiet aside: something worth knowing that isn't wrong. */
export const Note: React.FC<{ children: React.ReactNode; tone?: 'info' | 'warn' }> = ({ children, tone = 'info' }) => (
    <div
        className={`flex gap-3 rounded-lg border p-3 text-xs leading-relaxed
            ${tone === 'warn'
                ? 'border-synthux-yellow/30 bg-synthux-yellow/5 text-synthux-yellow-light'
                : 'border-white/10 bg-white/[0.02] text-gray-400'}`}
    >
        {tone === 'warn'
            ? <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            : <Info size={15} className="shrink-0 mt-0.5 text-gray-500" />}
        <div className="min-w-0">{children}</div>
    </div>
);

/** The panel every step's content sits in, so widths and padding match. */
export const StepPanel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="max-w-3xl">{children}</div>
);
