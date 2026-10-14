import React, { useMemo, useState } from 'react';
import { Import, Package, Play, Search, Square, Trash2 } from 'lucide-react';
import { ScrubNumber } from '../../components/ScrubNumber';
import type { MangleSliceEntry } from '../../utils/persistence';
import type { HitClass } from '../hits';
import { sliceFrames, type SliceSpec } from '../slices';
import { ATTACK_MAX_MS, DECAY_MAX_MS, DECAY_MIN_MS } from '../settings';
import { formatMs } from './format';

/**
 * The slice pool: single sounds kept from hits and snippets, as tiles. Click to
 * select (Shift for a range, Ctrl/Cmd to add), the play button or a double click
 * to listen. The selection, in the order shown, becomes a kit.
 */

interface SlicePoolProps {
    slices: MangleSliceEntry[];
    /** Ids of the sources still in the pool: a slice of a removed one can't play. */
    available: Set<string>;
    playingId: string | null;
    busy: boolean;
    onPlay: (slice: MangleSliceEntry) => void;
    onStop: () => void;
    onDelete: (ids: string[]) => void;
    onKit: (slices: MangleSliceEntry[]) => void;
    /** Each slice as its own file in the source pool, to mangle again. */
    onToSources: (slices: MangleSliceEntry[]) => void;
    /** A change to one slice: how it sounds, or its name. */
    onUpdate: (id: string, patch: Partial<SliceSpec> & { name?: string }) => void;
}

const SR = 48000;

const CLASS_COLOR: Record<HitClass, string> = { low: '#f58b44', mid: '#f5d544', high: '#4771f9' };
type Filter = 'all' | HitClass | 'other';

export const SlicePool: React.FC<SlicePoolProps> = ({
    slices, available, playingId, busy, onPlay, onStop, onDelete, onKit, onToSources, onUpdate,
}) => {
    const [filter, setFilter] = useState<Filter>('all');
    const [query, setQuery] = useState('');
    const [selection, setSelection] = useState<Set<string>>(new Set());
    const [anchor, setAnchor] = useState<number | null>(null);

    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        return slices.filter(s =>
            (filter === 'all' || (filter === 'other' ? !s.cls : s.cls === filter))
            && (!q || s.name.toLowerCase().includes(q) || s.sourceName.toLowerCase().includes(q)));
    }, [slices, filter, query]);
    const selected = shown.filter(s => selection.has(s.id));
    const counts = useMemo(() => ({
        all: slices.length,
        low: slices.filter(s => s.cls === 'low').length,
        mid: slices.filter(s => s.cls === 'mid').length,
        high: slices.filter(s => s.cls === 'high').length,
        other: slices.filter(s => !s.cls).length,
    }), [slices]);

    const click = (e: React.MouseEvent, index: number) => {
        const id = shown[index].id;
        if (e.shiftKey && anchor !== null) {
            const [a, b] = [Math.min(anchor, index), Math.max(anchor, index)];
            setSelection(new Set(shown.slice(a, b + 1).map(s => s.id)));
            return;
        }
        setAnchor(index);
        if (e.ctrlKey || e.metaKey) {
            setSelection(prev => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id); else next.add(id);
                return next;
            });
        } else {
            setSelection(new Set([id]));
        }
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.target instanceof HTMLInputElement) return;
        if ((e.key === 'Delete' || e.key === 'Backspace') && selected.length) {
            e.preventDefault();
            onDelete(selected.map(s => s.id));
            setSelection(new Set());
        } else if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            setSelection(new Set(shown.map(s => s.id)));
        } else if (e.key === ' ' && selected[0]) {
            e.preventDefault();
            if (playingId) onStop(); else onPlay(selected[0]);
        } else if (e.key === 'Escape' && selection.size) {
            e.stopPropagation();
            setSelection(new Set());
        }
    };

    return (
        <div className="h-full min-h-0 flex flex-col focus:outline-none" tabIndex={0} onKeyDown={onKeyDown}>
            <div className="shrink-0 flex flex-wrap items-center gap-2 px-4 py-3 border-b border-white/10 text-[11px] text-gray-400">
                <div className="flex rounded-md border border-white/10 overflow-hidden">
                    {(['all', 'low', 'mid', 'high', 'other'] as const).map(f => (
                        <button key={f} onClick={() => setFilter(f)}
                            title={f === 'other' ? 'Slices from snippets, without a hit class' : undefined}
                            className={`flex items-center gap-1 px-2 py-1 transition-colors ${filter === f ? 'bg-synthux-red/80 text-white' : 'hover:text-white hover:bg-white/5'}`}>
                            {f !== 'all' && f !== 'other' && <span className="inline-block h-2 w-2 rounded-sm" style={{ background: CLASS_COLOR[f] }} />}
                            {f} <span className="font-mono text-[10px] opacity-70">{counts[f]}</span>
                        </button>
                    ))}
                </div>
                <label className="flex items-center gap-1 px-2 py-1 rounded-md border border-white/10 bg-black/30">
                    <Search size={11} />
                    <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Name or source"
                        className="w-32 bg-transparent text-gray-200 placeholder:text-gray-600 focus:outline-none" />
                </label>
                {selected.length === 0 && slices.length > 0 && (
                    <span className="ml-auto text-gray-500">
                        Select slices to make a kit (it lands in Mangle › Results) or to use them as sources
                    </span>
                )}
                {selected.length > 0 && (
                    <span className="flex flex-wrap items-center gap-2 ml-auto">
                        <span className="text-gray-300">{selected.length} selected</span>
                        <button onClick={() => onKit(selected)} disabled={busy}
                            title="A new result: the selected slices one after another, in the order shown, with a cue at each"
                            className="flex items-center gap-1 px-2 py-1 rounded border border-synthux-red/50 text-white hover:bg-synthux-red/20 disabled:opacity-40">
                            <Package size={11} /> Make a kit
                        </button>
                        <button onClick={() => onToSources(selected)}
                            title="Each selected slice as its own file in the source pool (Mangle), to mangle again"
                            className="flex items-center gap-1 px-2 py-1 rounded border border-white/10 hover:text-white hover:bg-white/5">
                            <Import size={11} /> To sources
                        </button>
                        <button onClick={() => { onDelete(selected.map(s => s.id)); setSelection(new Set()); }}
                            title="Remove the selected slices from the pool (Delete)"
                            className="flex items-center gap-1 px-2 py-1 rounded border border-white/10 hover:text-synthux-red hover:bg-white/5">
                            <Trash2 size={11} /> Delete
                        </button>
                        <button onClick={() => setSelection(new Set())} className="px-2 py-1 rounded border border-white/10 hover:text-white hover:bg-white/5">
                            Clear
                        </button>
                    </span>
                )}
            </div>

            <div className="flex-1 min-h-0 flex flex-col md:flex-row">
            <div className="flex-1 min-h-0 overflow-y-auto p-4">
                {slices.length === 0 ? (
                    <div className="max-w-md mx-auto mt-12 text-center text-sm text-gray-500 space-y-2">
                        <p className="text-gray-300 font-bold">No slices yet</p>
                        <p>
                            Open a source with the scissors, <em>Find hits</em>, then <em>To slices</em>. Or select snippets in a
                            result&apos;s list and choose <em>To slices</em>.
                        </p>
                        <p>Slices keep how they sounded (shift, direction, gain, envelope). Select some and make a kit of them.</p>
                    </div>
                ) : (
                    <div className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(9rem,1fr))]">
                        {shown.map((s, i) => {
                            const missing = !available.has(s.sourceId);
                            const isSelected = selection.has(s.id);
                            const isPlaying = playingId === s.id;
                            return (
                                <div key={s.id}
                                    onClick={e => click(e, i)}
                                    onDoubleClick={() => !missing && onPlay(s)}
                                    className={`group relative rounded-lg border p-2 cursor-pointer select-none transition-colors
                                        ${isSelected ? 'border-synthux-red/70 bg-synthux-red/10' : 'border-white/10 bg-synthux-panel/80 hover:border-white/25'}`}>
                                    <div className="flex items-center gap-1.5">
                                        <button onClick={e => { e.stopPropagation(); if (isPlaying) onStop(); else onPlay(s); }}
                                            disabled={missing} title={missing ? 'Its source has left the pool' : isPlaying ? 'Stop' : 'Play'}
                                            className="h-6 w-6 shrink-0 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30">
                                            {isPlaying ? <Square size={9} fill="currentColor" /> : <Play size={10} className="ml-px" />}
                                        </button>
                                        <span className="min-w-0 flex-1 truncate text-[11px] font-bold" title={s.name}>{s.name}</span>
                                        {s.cls && <span className="inline-block h-2 w-2 rounded-sm shrink-0" title={s.cls} style={{ background: CLASS_COLOR[s.cls] }} />}
                                    </div>
                                    <svg viewBox={`0 0 ${s.peaks.length} 20`} preserveAspectRatio="none" className="mt-1.5 w-full h-8" aria-hidden>
                                        {s.peaks.map((p, k) => (
                                            <rect key={k} x={k} width={0.8} y={10 - Math.max(0.3, p * 10)} height={Math.max(0.6, p * 20)}
                                                fill={missing ? '#555' : s.cls ? CLASS_COLOR[s.cls] : '#bbb'} opacity={0.8} />
                                        ))}
                                    </svg>
                                    <div className="mt-1 flex items-center gap-1 text-[10px] text-gray-500 font-mono">
                                        <span>{formatMs((sliceFrames(s, SR) / SR) * 1000)}</span>
                                        {s.reverse && <span title="Reversed">←</span>}
                                        {!!s.shift && <span title="Shifted">{s.shift > 0 ? '+' : ''}{Math.round(s.shift * 10) / 10} st</span>}
                                        {s.envelope && <span title="Envelope">AD</span>}
                                        <span className={`ml-auto truncate max-w-[50%] ${missing ? 'text-synthux-red' : ''}`}
                                            title={missing ? `${s.sourceName} has left the source pool` : s.sourceName}>
                                            {missing ? 'source gone' : s.sourceName}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
            {selected.length === 1 && (
                <SliceEditor key={selected[0].id} slice={selected[0]} missing={!available.has(selected[0].sourceId)}
                    playing={playingId === selected[0].id} onPlay={() => onPlay(selected[0])} onStop={onStop}
                    onUpdate={patch => onUpdate(selected[0].id, patch)} />
            )}
            </div>
        </div>
    );
};

/**
 * One slice up close: its name and how it sounds. Every change is kept at once
 * and the tile redraws; play to hear it.
 */
const SliceEditor: React.FC<{
    slice: MangleSliceEntry;
    missing: boolean;
    playing: boolean;
    onPlay: () => void;
    onStop: () => void;
    onUpdate: (patch: Partial<SliceSpec> & { name?: string }) => void;
}> = ({ slice, missing, playing, onPlay, onStop, onUpdate }) => {
    const [name, setName] = useState(slice.name);
    const env = slice.envelope;
    const row = 'flex items-center justify-between gap-2 text-[11px]';
    return (
        <aside className="shrink-0 md:w-72 border-t md:border-t-0 md:border-l border-white/10 p-4 space-y-3 overflow-y-auto">
            <div className="flex items-center gap-2">
                <button onClick={() => (playing ? onStop() : onPlay())} disabled={missing}
                    title={playing ? 'Stop' : 'Play (Space)'}
                    className="h-8 w-8 shrink-0 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30">
                    {playing ? <Square size={11} fill="currentColor" /> : <Play size={12} className="ml-0.5" />}
                </button>
                <input value={name} onChange={e => setName(e.target.value)}
                    onBlur={() => { if (name.trim() && name !== slice.name) onUpdate({ name: name.trim() }); }}
                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    aria-label="Slice name"
                    className="min-w-0 flex-1 bg-black/40 border border-white/10 rounded px-2 py-1 text-xs font-bold text-gray-100" />
            </div>
            <p className="text-[10px] text-gray-500">
                {slice.sourceName} · {slice.start.toFixed(3)}–{slice.end.toFixed(3)} s
            </p>
            <div className={row} title="Semitones; the slice gets shorter going up, as on tape">
                <span className="text-gray-400">Shift</span>
                <ScrubNumber value={slice.shift ?? 0} min={-24} max={24} step={0.5} unit="st" width="w-[5.5rem]" ariaLabel="Shift in semitones"
                    onChange={v => onUpdate({ shift: v || undefined })} />
            </div>
            <div className={row} title="Gain on top of how it was kept">
                <span className="text-gray-400">Gain</span>
                <ScrubNumber value={Math.round((slice.gainDb ?? 0) * 10) / 10} min={-36} max={24} step={0.5} unit="dB" width="w-[5.5rem]" ariaLabel="Gain in dB"
                    onChange={v => onUpdate({ gainDb: v || undefined })} />
            </div>
            <label className={`${row} cursor-pointer`}>
                <span className="text-gray-400">Reversed</span>
                <input type="checkbox" checked={!!slice.reverse} onChange={e => onUpdate({ reverse: e.target.checked || undefined })}
                    className="accent-synthux-red h-3.5 w-3.5" />
            </label>
            <label className={`${row} cursor-pointer`}>
                <span className="text-gray-400">Envelope</span>
                <input type="checkbox" checked={!!env}
                    onChange={e => onUpdate({ envelope: e.target.checked ? { attackMs: 2, decayMs: 300, curve: 'exp' } : undefined })}
                    className="accent-synthux-red h-3.5 w-3.5" />
            </label>
            {env && <>
                <div className={row}>
                    <span className="text-gray-400">Attack</span>
                    <ScrubNumber value={Math.round(env.attackMs)} min={0} max={ATTACK_MAX_MS} unit="ms" width="w-[5.5rem]" ariaLabel="Attack in ms"
                        onChange={v => onUpdate({ envelope: { ...env, attackMs: v } })} />
                </div>
                <div className={row}>
                    <span className="text-gray-400">Decay</span>
                    <ScrubNumber value={Math.round(env.decayMs)} min={DECAY_MIN_MS} max={DECAY_MAX_MS} scale="log" unit="ms" width="w-[5.5rem]" ariaLabel="Decay in ms"
                        onChange={v => onUpdate({ envelope: { ...env, decayMs: v } })} />
                </div>
                <div className={row}>
                    <span className="text-gray-400">Curve</span>
                    <span className="flex rounded-md border border-white/10 overflow-hidden">
                        {(['exp', 'linear'] as const).map(c => (
                            <button key={c} onClick={() => onUpdate({ envelope: { ...env, curve: c } })}
                                className={`px-2 py-0.5 ${env.curve === c ? 'bg-synthux-red/80 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                                {c === 'exp' ? 'Exp' : 'Linear'}
                            </button>
                        ))}
                    </span>
                </div>
            </>}
            {missing && <p className="text-[10px] text-synthux-red">Its source has left the pool: it can&apos;t play or go into a kit.</p>}
        </aside>
    );
};
