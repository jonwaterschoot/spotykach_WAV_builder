import React, { useState } from 'react';
import { Play, Pause, Archive, Trash2 } from 'lucide-react';

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
    /** Per-slot pool flag — shows indicator */
    poolFlags?: Record<string, boolean>;
    /** Per-slot trash/delete flag — shows indicator */
    trashFlags?: Record<string, boolean>;
    showPlayer?: boolean;
    /** Per-slot custom indicator borders { variant: 'dashed'|'solid', color: 'border-red-500'|... } */
    indicatorBorders?: Record<string, { color: string, variant: 'solid' | 'dashed' }>;
    /** Per-slot dimming flag — for untouched files */
    dimmedSlots?: Record<string, boolean>;
    /** Optional slot key to highlight (e.g. on pool hover) */
    highlightedSlot?: string | null;
    /** External hover state from another grid */
    hoveredSlotKey?: string | null;
    /** Fires when hovering over a slot */
    onHover?: (slotKey: string | null) => void;
    /** Enable drag from occupied cells */
    draggable?: boolean;
    /** Enable drop onto this grid */
    droppable?: boolean;
    /** Fires when drag starts from a slot */
    onDragStart?: (slotKey: string, prefix: string) => void;
    /** Fires when a slot from another grid is dropped on this grid */
    onDrop?: (draggedKey: string, draggedPrefix: string) => void;
    /** Fires when a cell's play button is clicked */
    onPlay?: (blob: Blob, label: string) => void;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export const SlotGrid6x6: React.FC<SlotGrid6x6Props> = ({
    slots, title, titleIcon, className = '',
    prefix = '',
    actionBadges = {},
    poolFlags = {},
    trashFlags = {},
    indicatorBorders = {},
    dimmedSlots = {},
    highlightedSlot = null,
    hoveredSlotKey = null,
    onHover,
    draggable = false,
    droppable = false,
    onDragStart,
    onDrop,
    onPlay,
    showPlayer = true
}) => {
    const [activeBlob, setActiveBlob] = useState<Blob | null>(null);
    const [activeUrl, setActiveUrl] = useState<string | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);

    const handlePlay = (blob: Blob | null, label: string) => {
        if (!blob) return;
        if (onPlay) {
            onPlay(blob, label);
            return;
        }
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
                            const isTrashed = trashFlags[slotKey];
                            const ib = indicatorBorders[slotKey];
                            const isDimmed = dimmedSlots[slotKey];
                            const isHighlighted = highlightedSlot === slotKey;
                            const isHovered = hoveredSlotKey === slotKey;

                            if (!entry || !entry.blob) {
                                return (
                                    <div
                                        key={slotKey}
                                        className={`flex items-center gap-1 px-1.5 py-2 h-[26px] rounded border-l-2 opacity-10 grayscale-[0.8] transition-all bg-white/[0.02] ${isHighlighted || isHovered ? 'opacity-100 scale-105 ring-2 ring-indigo-500/50 bg-indigo-500/5 z-20 shadow-lg' : ''} ${ib?.variant === 'dashed' ? `${ib.color} border-dashed border-2 opacity-50` : ''}`}
                                        onMouseEnter={() => onHover?.(slotKey)}
                                        onMouseLeave={() => onHover?.(null)}
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
                                    className={`relative group transition-all ${isHighlighted || isHovered ? 'scale-110 z-20' : ''}`}
                                    draggable={draggable}
                                    onDragStart={draggable ? (e) => handleDragStart(e, slotKey) : undefined}
                                    onMouseEnter={() => onHover?.(slotKey)}
                                    onMouseLeave={() => onHover?.(null)}
                                    style={{ cursor: draggable ? 'grab' : 'default' }}
                                >
                                    <button
                                        onClick={() => handlePlay(entry.blob, entry.name || cellLabel)}
                                        className={`flex items-center gap-1 px-1.5 py-2 h-[26px] rounded-lg border-l-4 w-full transition-all text-left ${isPlaying ? 'ring-1 ring-white/20' : ''
                                            } ${isHighlighted || isHovered ? 'ring-2 ring-indigo-500 bg-indigo-500/10 shadow-[0_4px_12px_rgba(99,102,241,0.3)]' : ''} ${isDimmed && !isHighlighted && !isHovered ? 'opacity-[0.25] grayscale-[0.5]' : ''} ${ib?.variant === 'dashed' ? `border-dashed ${ib.color} border-2` : ''}`}
                                        style={{
                                            borderLeftColor: hex,
                                            background: isPlaying ? `${hex}28` : (isHighlighted || isHovered ? `${hex}22` : `${hex}12`),
                                        }}
                                        title={entry.name || cellLabel}
                                    >
                                        {isPlaying
                                            ? <Pause size={8} fill="currentColor" className="shrink-0" style={{ color: hex }} />
                                            : <Play size={8} fill="currentColor" className="shrink-0 opacity-60" style={{ color: hex }} />
                                        }
                                        <span className="text-[10px] font-mono font-bold leading-none truncate" style={{ color: hex }}>
                                            {cellLabel}
                                        </span>
                                        <div className="ml-auto flex items-center gap-1">
                                            {inPool && (
                                                <div className="p-1 bg-orange-600 border border-orange-400 rounded shadow-[0_0_8px_rgba(249,115,22,0.5)] flex items-center justify-center">
                                                    <Archive size={8} className="text-white" />
                                                </div>
                                            )}
                                            {isTrashed && (
                                                <div className="p-1 bg-red-600 border border-red-400 rounded shadow-[0_0_8px_rgba(239,68,68,0.5)] flex items-center justify-center">
                                                    <Trash2 size={8} className="text-white" />
                                                </div>
                                            )}
                                        </div>
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

                {/* Scrubbing player — optional */}
                {showPlayer && (
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
                )}
            </div>
        </div>
    );
};
