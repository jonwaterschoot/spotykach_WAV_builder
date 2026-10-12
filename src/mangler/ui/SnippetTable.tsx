import React, { useEffect, useRef, useState } from 'react';
import { Dices, GripVertical, Lock, Play, Square, Trash2, Unlock } from 'lucide-react';
import { NOTE_NAMES } from '../../lib/audio/pitch';
import type { MangleResultEntry } from '../../utils/persistence';
import type { PitchChoice } from '../render';
import { choiceFromKey, choiceKey, choiceOf, offsetFor } from '../pitchChoice';
import { sanitizeSettings, scaleName } from '../settings';
import { formatDb, formatMs, formatSt } from './format';

interface SnippetTableProps {
    entry: MangleResultEntry;
    busy: boolean;
    /** The row the snippet player is on (follows the playhead in Full mode), or −1. */
    activeIndex: number;
    /** The row whose own region is playing: its button shows Stop. */
    playingIndex: number;
    onPlay: (index: number) => void;
    onHover: (index: number | null) => void;
    onDelete: (index: number) => void;
    onMove: (from: number, to: number) => void;
    onToggleLock: (index: number) => void;
    onPitch: (indices: number[], choice: PitchChoice | undefined) => void;
    onReroll: () => void;
    variations: number;
}

const SR = 48000;

/** Every snippet of one result: where it came from, what was done to it, and the edits. */
export const SnippetTable: React.FC<SnippetTableProps> = ({
    entry, busy, activeIndex, playingIndex, onPlay, onHover, onDelete, onMove, onToggleLock, onPitch, onReroll, variations,
}) => {
    const { recipe } = entry;
    // Old recipes lack the scale fields; sanitising fills them with "root only, C".
    const settings = sanitizeSettings(recipe.settings);
    const locked = new Set(entry.locked ?? []);
    const threshold = settings.pitchConfidence;
    const scaleLabel = `${NOTE_NAMES[settings.scaleRoot]} ${scaleName(settings.scaleMask) ?? 'custom'}`;
    const confident = recipe.snippets
        .map((s, i) => (s.pitch && choiceOf(s)?.kind !== 'scale' && s.pitch.confidence >= threshold ? i : -1))
        .filter(i => i >= 0);

    const listRef = useRef<HTMLDivElement>(null);
    const [dragFrom, setDragFrom] = useState<number | null>(null);
    const [dropAt, setDropAt] = useState<number | null>(null);

    // Keep the row being played in view.
    useEffect(() => {
        if (activeIndex < 0) return;
        const row = listRef.current?.querySelector<HTMLElement>(`[data-row="${activeIndex}"]`);
        row?.scrollIntoView({ block: 'nearest' });
    }, [activeIndex]);

    return (
        <div className="mt-2">
            <div className="flex flex-wrap items-center gap-1.5 mb-1.5 text-[10px] text-gray-500">
                {confident.length > 0 && (
                    <TableAction onClick={() => onPitch(confident, { kind: 'scale' })} disabled={busy}
                        title={`Move every snippet with a pitch confidence of ${Math.round(threshold * 100)}% or more to the nearest note of ${scaleLabel}`}>
                        All confident to {scaleLabel} ({confident.length})
                    </TableAction>
                )}
                {locked.size > 0 && (
                    <TableAction onClick={onReroll} disabled={busy}
                        title="New variations that keep the locked snippets where they are and roll the rest, with the current settings">
                        <Dices size={11} /> Reroll the rest ×{variations} ({locked.size} locked)
                    </TableAction>
                )}
                <span className="ml-auto">Drag ⋮⋮ to reorder · lock to keep in a reroll · edits undo once</span>
            </div>
            <div ref={listRef} className="max-h-72 overflow-y-auto rounded border border-white/5" onMouseLeave={() => onHover(null)}>
                <table className="w-full text-[10px] font-mono">
                    <thead className="sticky top-0 bg-synthux-panel text-gray-500 z-10">
                        <tr className="text-left">
                            <th className="w-4" aria-label="Reorder" />
                            <th className="px-1 py-1 font-normal w-6" aria-label="Play" />
                            <th className="px-2 py-1 font-normal">#</th>
                            <th className="px-2 py-1 font-normal">at</th>
                            <th className="px-2 py-1 font-normal">source</th>
                            <th className="px-2 py-1 font-normal text-right">length</th>
                            <th className="px-2 py-1 font-normal text-right">gain</th>
                            <th className="px-2 py-1 font-normal" title="Direction: forwards or reversed">dir</th>
                            <th className="px-2 py-1 font-normal">detected</th>
                            <th className="px-2 py-1 font-normal">pitch</th>
                            <th className="px-1 py-1 font-normal" aria-label="Actions" />
                        </tr>
                    </thead>
                    <tbody className="text-gray-300">
                        {recipe.snippets.map((s, i) => {
                            const isActive = activeIndex === i;
                            const isPlaying = playingIndex === i;
                            const isLocked = locked.has(i);
                            const choice = choiceOf(s);
                            const scaleOffset = s.pitch ? offsetFor({ kind: 'scale' }, s, settings) : null;
                            const dropHere = dragFrom !== null && dropAt === i && dropAt !== dragFrom;
                            return (
                                <tr key={i} data-row={i}
                                    onMouseEnter={() => onHover(i)}
                                    onDragOver={e => { if (dragFrom !== null) { e.preventDefault(); setDropAt(i); } }}
                                    onDrop={e => {
                                        e.preventDefault();
                                        if (dragFrom !== null && dragFrom !== i) onMove(dragFrom, i);
                                        setDragFrom(null);
                                        setDropAt(null);
                                    }}
                                    className={`border-t group ${dropHere
                                        ? dragFrom! < i ? 'border-b-2 border-b-synthux-red border-t-white/5' : 'border-t-2 border-t-synthux-red'
                                        : 'border-white/5'}
                                        ${dragFrom === i ? 'opacity-40' : ''}
                                        ${isActive ? 'bg-synthux-red/15' : isLocked ? 'bg-synthux-yellow/5' : 'hover:bg-white/[0.03]'}`}>
                                    <td className="pl-1">
                                        <span
                                            draggable={!busy}
                                            onDragStart={e => {
                                                e.dataTransfer.effectAllowed = 'move';
                                                e.dataTransfer.setData('text/plain', String(i));
                                                setDragFrom(i);
                                            }}
                                            onDragEnd={() => { setDragFrom(null); setDropAt(null); }}
                                            title="Drag to move this snippet"
                                            className={`flex text-gray-600 ${busy ? 'opacity-30' : 'cursor-grab hover:text-white active:cursor-grabbing'}`}>
                                            <GripVertical size={11} />
                                        </span>
                                    </td>
                                    <td className="px-1 py-0.5">
                                        <button onClick={() => onPlay(i)} title={isPlaying ? 'Stop' : 'Play this snippet'}
                                            className={`h-5 w-5 flex items-center justify-center rounded ${isPlaying ? 'text-synthux-red' : 'text-gray-500 hover:text-white'}`}>
                                            {isPlaying ? <Square size={10} fill="currentColor" /> : <Play size={11} />}
                                        </button>
                                    </td>
                                    <td className="px-2 py-0.5 text-gray-600">{i + 1}</td>
                                    <td className="px-2 py-0.5 text-gray-500">{(s.outStart / SR).toFixed(2)}</td>
                                    <td className="px-2 py-0.5 truncate max-w-[9rem]" title={recipe.sources[s.source]?.name}>
                                        {recipe.sources[s.source]?.name ?? '?'}
                                    </td>
                                    <td className="px-2 py-0.5 text-right">{formatMs((s.length / SR) * 1000)}</td>
                                    <td className="px-2 py-0.5 text-right">{Number.isFinite(s.measuredDb) ? formatDb(s.gainDb) : 'silent'}</td>
                                    <td className="px-2 py-0.5 text-gray-400" title={s.reverse ? 'Reversed' : 'Forwards'}>{s.reverse ? '←' : '→'}</td>
                                    <td className="px-2 py-0.5 whitespace-nowrap">
                                        {s.pitch
                                            ? <span title={`${s.pitch.frequency.toFixed(1)} Hz`}>{s.pitch.note} <span className="text-gray-500">{Math.round(s.pitch.confidence * 100)}%</span></span>
                                            : <span className="text-gray-600">no pitch</span>}
                                    </td>
                                    <td className="px-2 py-0.5 whitespace-nowrap">
                                        <select
                                            value={choiceKey(choice)}
                                            disabled={busy}
                                            onChange={e => onPitch([i], choiceFromKey(e.target.value))}
                                            title="Where this snippet's pitch goes (on top of any random detune)"
                                            className={`bg-transparent border rounded px-0.5 py-0 text-[10px] font-mono cursor-pointer disabled:cursor-not-allowed
                                                ${choice ? 'border-synthux-yellow/40 text-synthux-yellow' : 'border-white/10 text-gray-400'}`}
                                        >
                                            <option value="own" className="bg-synthux-panel">own</option>
                                            {s.pitch && (
                                                <optgroup label="Nearest note" className="bg-synthux-panel">
                                                    <option value="scale">scale ({scaleLabel}) {scaleOffset !== null ? formatSt(scaleOffset) : ''}</option>
                                                    {NOTE_NAMES.map((n, pc) => {
                                                        const off = offsetFor({ kind: 'note', pc }, s, settings);
                                                        return <option key={n} value={`note:${pc}`}>→ {n} {off !== null ? formatSt(off) : ''}</option>;
                                                    })}
                                                </optgroup>
                                            )}
                                            <optgroup label="Shift" className="bg-synthux-panel">
                                                {[12, 7, 5, 4, 3, 2, 1, -1, -2, -3, -4, -5, -7, -12].map(st => (
                                                    <option key={st} value={`st:${st}`}>{st > 0 ? '+' : '−'}{Math.abs(st)} st</option>
                                                ))}
                                            </optgroup>
                                        </select>
                                        {Math.abs(s.shift) > 0.01 && <span className="text-synthux-yellow ml-1">{formatSt(s.shift)}</span>}
                                    </td>
                                    <td className="px-1 py-0.5">
                                        <span className="flex items-center justify-end gap-0.5">
                                            <RowButton onClick={() => onToggleLock(i)} title={isLocked ? 'Unlock' : 'Lock: keep this snippet in a reroll'}
                                                className={isLocked ? 'text-synthux-yellow' : 'text-gray-600 hover:text-white'}>
                                                {isLocked ? <Lock size={11} /> : <Unlock size={11} />}
                                            </RowButton>
                                            <RowButton onClick={() => onDelete(i)} disabled={busy || recipe.snippets.length < 2}
                                                title="Remove this snippet; the rest move up and the end is refilled"
                                                className="text-gray-600 hover:text-synthux-red">
                                                <Trash2 size={11} />
                                            </RowButton>
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const TableAction: React.FC<{ onClick: () => void; title: string; children: React.ReactNode; disabled?: boolean }> = ({
    onClick, title, children, disabled,
}) => (
    <button onClick={onClick} disabled={disabled} title={title}
        className="flex items-center gap-1 px-2 py-0.5 rounded border border-white/10 text-gray-400 hover:text-white hover:bg-white/5
            disabled:opacity-30 disabled:cursor-not-allowed">
        {children}
    </button>
);

const RowButton: React.FC<{
    onClick: () => void; title: string; className: string; children: React.ReactNode; disabled?: boolean;
}> = ({ onClick, title, className, children, disabled }) => (
    <button onClick={onClick} title={title} aria-label={title} disabled={disabled}
        className={`h-5 w-5 flex items-center justify-center rounded hover:bg-white/10 disabled:opacity-25 disabled:cursor-not-allowed ${className}`}>
        {children}
    </button>
);
