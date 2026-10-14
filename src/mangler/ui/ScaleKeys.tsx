import React from 'react';
import { NOTE_NAMES } from '../pitch';

interface ScaleKeysProps {
    /** 0 = C … 11 = B. */
    root: number;
    /** 12-bit mask relative to the root. */
    mask: number;
    onChange: (mask: number) => void;
    disabled?: boolean;
}

const WHITE = [0, 2, 4, 5, 7, 9, 11];
/** Black keys and the white key they sit after. */
const BLACK: [number, number][] = [[1, 0], [3, 1], [6, 3], [8, 4], [10, 5]];
const KEY_W = 18;

/**
 * One octave of keys showing the scale. Click a key to put it in or take it
 * out; the root (ringed) always stays in.
 */
export const ScaleKeys: React.FC<ScaleKeysProps> = ({ root, mask, onChange, disabled }) => {
    const inScale = (pc: number) => !!(mask & (1 << ((pc - root + 12) % 12)));
    const toggle = (pc: number) => {
        const bit = (pc - root + 12) % 12;
        if (bit === 0 || disabled) return;
        onChange(mask ^ (1 << bit));
    };
    const tone = (pc: number, black: boolean) => {
        const on = inScale(pc);
        if (pc === root) return 'bg-synthux-red border-synthux-red';
        if (on) return black ? 'bg-synthux-red/70 border-synthux-red/80' : 'bg-synthux-red/40 border-synthux-red/60';
        return black ? 'bg-neutral-800 border-black' : 'bg-neutral-200 border-neutral-400';
    };

    return (
        <div className={`relative select-none ${disabled ? 'opacity-40' : ''}`} style={{ width: WHITE.length * KEY_W, height: 46 }}>
            {WHITE.map((pc, i) => (
                <button key={pc} type="button" onClick={() => toggle(pc)} disabled={disabled}
                    title={`${NOTE_NAMES[pc]}${pc === root ? ' (root)' : inScale(pc) ? ': in the scale' : ''}`}
                    aria-pressed={inScale(pc)}
                    className={`absolute top-0 h-full rounded-b border ${tone(pc, false)} ${pc === root || disabled ? 'cursor-default' : 'cursor-pointer'}`}
                    style={{ left: i * KEY_W, width: KEY_W - 1 }}>
                    <span className={`absolute bottom-0.5 inset-x-0 text-center text-[8px] ${inScale(pc) ? 'text-white' : 'text-neutral-500'}`}>
                        {NOTE_NAMES[pc]}
                    </span>
                </button>
            ))}
            {BLACK.map(([pc, after]) => (
                <button key={pc} type="button" onClick={() => toggle(pc)} disabled={disabled}
                    title={`${NOTE_NAMES[pc]}${pc === root ? ' (root)' : inScale(pc) ? ': in the scale' : ''}`}
                    aria-pressed={inScale(pc)}
                    className={`absolute top-0 rounded-b border z-10 ${tone(pc, true)} ${pc === root || disabled ? 'cursor-default' : 'cursor-pointer'}`}
                    style={{ left: (after + 1) * KEY_W - KEY_W * 0.32, width: KEY_W * 0.62, height: 28 }} />
            ))}
        </div>
    );
};
