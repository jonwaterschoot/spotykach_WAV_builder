import React, { useState } from 'react';
import { Play, Pause } from 'lucide-react';

// ─── Constants ─────────────────────────────────────────────────────────────────

export const TAPE_COLORS = ['Blue', 'Green', 'Pink', 'Red', 'Turquoise', 'Yellow'] as const;
export type TapeColor = typeof TAPE_COLORS[number];

export const TAPE_HEX: Record<string, string> = {
    Blue: '#3b82f6', Green: '#22c55e', Pink: '#ec4899',
    Red: '#ef4444', Turquoise: '#14b8a6', Yellow: '#eab308',
};

export const TAPE_LETTER: Record<string, string> = {
    Blue: 'B', Green: 'G', Pink: 'P', Red: 'R', Turquoise: 'T', Yellow: 'Y',
};

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface SlotEntry {
    slotKey: string;
    color: string;
    num: number;
    blob: Blob | null;
    name?: string;
}

export interface SlotActionBadge {
    label: string;
    /** tailwind bg class e.g. 'bg-indigo-500' */
    bg: string;
}

interface SlotGrid6x6Props {
    slots: Record<string, SlotEntry>;
    title: string;
    titleIcon?: React.ReactNode;
    className?: string;
    /** "PR" or "SD" — prepended to cell labels */
    prefix?: string;
    /** Per-slot action badge shown on occupied cells */
    actionBadges?: Record<string, SlotActionBadge>;
    /** Per-slot pool flag — shows 📥 indicator */
    poolFlags?: Record<string, boolean>;
    /** Enable drag from occupied cells */
    draggable?: boolean;
    /** Enable drop onto this grid */
    droppable?: boolean;
    /** Fires when drag starts from a slot */
    onDragStart?: (slotKey: string, prefix: string) => void;
    /** Fires when a slot from another grid is dropped on this grid */
    onDrop?: (draggedKey: string, draggedPrefix: string) => void;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export const SlotGrid6x6: React.FC<SlotGrid6x6Props> = ({
    slots, title, titleIcon, className = '',
    prefix = '',
    actionBadges = {},
    poolFlags = {},
    draggable = false,
    droppable = false,
    onDragStart,
    onDrop,
}) => {
    const [activeBlob, setActiveBlob] = useState<Blob | null>(null);
    const [activeUrl, setActiveUrl] = useState<string | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);

    const handlePlay = (blob: Blob | null) => {
        if (!blob) return;
        if (activeUrl) URL.revokeObjectURL(activeUrl);
        if (activeBlob === blob) { setActiveBlob(null); setActiveUrl(null); return; }
        const url = URL.createObjectURL(blob);
        setActiveBlob(blob);
        setActiveUrl(url);
    };

    const handleDragStart = (e: React.DragEvent, slotKey: string) => {
        e.dataTransfer.setData('text/plain', JSON.stringify({ slotKey, prefix }));
        e.dataTransfer.effectAllowed = 'move';
        onDragStart?.(slotKey, prefix);
    };

    const handleDragOver = (e: React.DragEvent) => {
        if (!droppable) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setIsDragOver(true);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        if (!droppable) return;
        try {
            const { slotKey: draggedKey, prefix: draggedPrefix } = JSON.parse(e.dataTransfer.getData('text/plain'));
            if (draggedPrefix !== prefix) onDrop?.(draggedKey, draggedPrefix);
        } catch { /* ignore */ }
    };

    return (
        <div className={`flex flex-col gap-2 ${className}`}>
            {/* Header */}
            <div className="flex items-center gap-2 px-1">
                {titleIcon}
                <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">{title}</span>
                {prefix && (
                    <span className="text-[9px] font-mono font-bold text-gray-600 bg-white/5 px-1.5 py-0.5 rounded">
                        {prefix}
                    </span>
                )}
            </div>

            {/* Grid panel */}
            <div
                className={`bg-[#0d0d0d] border rounded-xl p-2.5 shadow-inner transition-colors ${isDragOver ? 'border-white/30 bg-white/[0.03]' : 'border-white/8'
                    }`}
                onDragOver={handleDragOver}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
            >
                <div className="grid grid-cols-6 gap-1">
                    {TAPE_COLORS.map(color =>
                        [1, 2, 3, 4, 5, 6].map(num => {
                            const slotKey = `${color}${num}`;
                            const entry = slots[slotKey];
                            const hex = TAPE_HEX[color];
                            const cellLabel = prefix
                                ? `${prefix} ${TAPE_LETTER[color]}${num}`
                                : `${TAPE_LETTER[color]}${num}`;
                            const isPlaying = entry?.blob != null && activeBlob === entry.blob;
                            const badge = actionBadges[slotKey];
                            const inPool = poolFlags[slotKey];

                            if (!entry || !entry.blob) {
                                return (
                                    <div
                                        key={slotKey}
                                        className="flex items-center gap-1 px-1.5 py-1 rounded border-l-2 opacity-20"
                                        style={{ borderLeftColor: hex }}
                                        title={cellLabel}
                                    >
                                        <div className="w-1.5 h-1.5 shrink-0 rounded-full" style={{ background: hex }} />
                                        <span className="text-[9px] font-mono font-bold leading-none" style={{ color: hex }}>
                                            {TAPE_LETTER[color]}{num}
                                        </span>
                                    </div>
                                );
                            }

                            return (
                                <div
                                    key={slotKey}
                                    className="relative group"
                                    draggable={draggable}
                                    onDragStart={draggable ? (e) => handleDragStart(e, slotKey) : undefined}
                                    style={{ cursor: draggable ? 'grab' : 'default' }}
                                >
                                    <button
                                        onClick={() => handlePlay(entry.blob)}
                                        className={`flex items-center gap-1 px-1.5 py-1 rounded border-l-2 w-full transition-all text-left ${isPlaying ? 'ring-1 ring-white/20' : ''
                                            }`}
                                        style={{
                                            borderLeftColor: hex,
                                            background: isPlaying ? `${hex}28` : `${hex}12`,
                                        }}
                                        title={entry.name || cellLabel}
                                    >
                                        {isPlaying
                                            ? <Pause size={8} fill="currentColor" className="shrink-0" style={{ color: hex }} />
                                            : <Play size={8} fill="currentColor" className="shrink-0 opacity-60" style={{ color: hex }} />
                                        }
                                        <span className="text-[9px] font-mono font-bold leading-none truncate" style={{ color: hex }}>
                                            {cellLabel}
                                        </span>
                                        {inPool && <span className="ml-auto text-[8px] leading-none">📥</span>}
                                    </button>

                                    {/* Action badge */}
                                    {badge && (
                                        <span
                                            className={`absolute -top-1.5 -right-1 ${badge.bg} text-white text-[7px] font-bold px-1 py-px rounded leading-none z-10 pointer-events-none`}
                                        >
                                            {badge.label}
                                        </span>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Scrubbing player — always visible */}
                <div className="mt-2 pt-2 border-t border-white/8">
                    {activeUrl ? (
                        <audio
                            key={activeUrl}
                            src={activeUrl}
                            controls
                            autoPlay
                            className="h-7 w-full opacity-90 invert hue-rotate-180"
                            controlsList="nodownload noplaybackrate"
                            onEnded={() => { setActiveBlob(null); setActiveUrl(null); }}
                        />
                    ) : (
                        <div className="h-7 w-full rounded bg-white/[0.03] flex items-center justify-center">
                            <span className="text-[9px] text-gray-700 uppercase tracking-widest font-mono select-none">no file selected</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
