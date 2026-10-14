import React, { useEffect, useRef, useState } from 'react';
import { Copy, Eraser, Minus, Music, Play, Plus, Square, Trash2, X } from 'lucide-react';
import { ScrubNumber } from '../../components/ScrubNumber';
import type { MangleSliceEntry } from '../../utils/persistence';
import type { HitClass } from '../hits';
import {
    MAX_TRACKS, PATTERNS, STEPS, VELOCITIES, emptySteps, maxChain, newTrack,
    type PatternId, type SeqCues, type SeqStep, type Sequence,
} from '../sequence';
import { formatSeconds } from './format';

/**
 * The step sequencer: patterns A–D of 16 steps, a chain that plays them in
 * order, and up to 8 tracks that each play a slice from the pool. Click a step
 * to switch it; right-click (or long-press) it for its velocity and a slice of
 * its own. Lives in the browser: Render makes a result of the whole chain.
 */

interface SequencerStationProps {
    seq: Sequence;
    /** Changes go through an updater, so quick clicks build on each other. */
    onChange: (update: (seq: Sequence) => Sequence) => void;
    slices: MangleSliceEntry[];
    /** Ids of the sources still in the pool. */
    available: Set<string>;
    playing: boolean;
    /** Global step being heard, or null. */
    step: number | null;
    busy: boolean;
    onPlay: () => void;
    onStop: () => void;
    onAudition: (sliceId: string, shift: number) => void;
    onRender: (cues: SeqCues, fold: boolean) => void;
    newId: () => string;
}

const CLASS_COLOR: Record<HitClass, string> = { low: '#f58b44', mid: '#f5d544', high: '#4771f9' };

export const SequencerStation: React.FC<SequencerStationProps> = ({
    seq, onChange, slices, available, playing, step, busy, onPlay, onStop, onAudition, onRender, newId,
}) => {
    const [edit, setEdit] = useState<PatternId>('A');
    const [cues, setCues] = useState<SeqCues>('hits');
    const [fold, setFold] = useState(true);
    const [menu, setMenu] = useState<{ track: number; step: number; x: number; y: number } | null>(null);
    /** What dragging a step up and down sets. */
    const [dragEdits, setDragEdits] = useState<'velocity' | 'pitch'>('velocity');
    /** A step being dragged: where it started, and whether it has moved (a click otherwise). */
    const drag = useRef<{ t: number; i: number; y0: number; velocity: number; shift: number; wasOn: boolean; moved: boolean } | null>(null);
    const [dragLabel, setDragLabel] = useState<{ t: number; i: number; text: string } | null>(null);
    useEffect(() => {
        if (!menu) return;
        const close = () => setMenu(null);
        window.addEventListener('scroll', close, true);
        return () => window.removeEventListener('scroll', close, true);
    }, [menu]);

    const sliceById = new Map(slices.map(s => [s.id, s]));
    const playable = (id: string | null | undefined) => {
        const s = id ? sliceById.get(id) : undefined;
        return !!s && available.has(s.sourceId);
    };
    const bars = seq.chain.length;
    const seconds = bars * (240 / seq.bpm);
    const limit = maxChain(seq.bpm);
    // The step under the playhead, when the chain is on the pattern being edited.
    const playingHere = step !== null && seq.chain[Math.floor(step / STEPS)] === edit ? step % STEPS : null;

    const setTrack = (t: number, patch: Partial<Sequence['tracks'][number]>) =>
        onChange(seq => ({ ...seq, tracks: seq.tracks.map((x, i) => (i === t ? { ...x, ...patch } : x)) }));
    const setStep = (t: number, s: number, patch: Partial<SeqStep>) => onChange(seq => ({
        ...seq,
        tracks: seq.tracks.map((x, i) => (i !== t ? x : {
            ...x,
            patterns: { ...x.patterns, [edit]: x.patterns[edit].map((st, k) => (k === s ? { ...st, ...patch } : st)) },
        })),
    }));
    const used = (p: PatternId) => seq.tracks.some(t => t.patterns[p].some(s => s.on));

    const sliceOptions = (
        <>
            {(['low', 'mid', 'high', undefined] as const).map(cls => {
                const group = slices.filter(s => s.cls === cls);
                if (!group.length) return null;
                return (
                    <optgroup key={cls ?? 'other'} label={cls ?? 'other'}>
                        {group.map(s => (
                            <option key={s.id} value={s.id} disabled={!available.has(s.sourceId)}>{s.name}</option>
                        ))}
                    </optgroup>
                );
            })}
        </>
    );

    if (slices.length === 0) {
        return (
            <div className="max-w-md mx-auto mt-16 px-4 text-center text-sm text-gray-500 space-y-2">
                <p className="text-gray-300 font-bold">The sequencer plays slices</p>
                <p>
                    Make some first: open a source with the scissors, <em>Find hits</em> and <em>To slices</em>, or pick snippets
                    in a result and choose <em>To slices</em>. Then each track here plays one of them.
                </p>
            </div>
        );
    }

    return (
        <div className="h-full min-h-0 flex flex-col" onClick={() => setMenu(null)}>
            {/* Transport, patterns, chain, render */}
            <div className="shrink-0 flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 border-b border-white/10 text-[11px] text-gray-400">
                <button onClick={() => (playing ? onStop() : onPlay())}
                    title={playing ? 'Stop' : 'Play the chain, looping'}
                    className={`h-9 w-9 flex items-center justify-center rounded-full transition-colors
                        ${playing ? 'bg-synthux-red text-white' : 'bg-white/10 hover:bg-white/20 text-white'}`}>
                    {playing ? <Square size={13} fill="currentColor" /> : <Play size={15} className="ml-0.5" />}
                </button>
                <label className="flex items-center gap-2">
                    Tempo
                    <ScrubNumber value={seq.bpm} min={40} max={240} step={0.5} unit="bpm" width="w-[5.5rem]" ariaLabel="Tempo"
                        onChange={v => onChange(seq => ({ ...seq, bpm: v, chain: seq.chain.slice(0, maxChain(v)) }))} />
                </label>
                <label className="flex items-center gap-2" title="How late every second sixteenth comes">
                    Swing
                    <input type="range" min={0} max={50} value={Math.round(seq.swing * 100)}
                        onChange={e => onChange(seq => ({ ...seq, swing: Number(e.target.value) / 100 }))}
                        className="w-24 accent-synthux-red" aria-label="Swing" />
                    <span className="font-mono w-8 text-gray-200">{Math.round(seq.swing * 100)}%</span>
                </label>

                <span className="flex items-center gap-2">
                    Pattern
                    <span className="flex rounded-md border border-white/10 overflow-hidden">
                        {PATTERNS.map(p => (
                            <button key={p} onClick={() => setEdit(p)} title={`Edit pattern ${p}`}
                                className={`relative px-2.5 py-1 font-bold transition-colors ${edit === p ? 'bg-synthux-red/80 text-white' : 'hover:text-white hover:bg-white/5'}`}>
                                {p}
                                {used(p) && <span className="absolute top-0.5 right-0.5 h-1 w-1 rounded-full bg-current" />}
                            </button>
                        ))}
                    </span>
                </span>

                <span className="flex items-center gap-2" title="What dragging a step up or down sets">
                    Drag
                    <span className="flex rounded-md border border-white/10 overflow-hidden">
                        {(['velocity', 'pitch'] as const).map(m => (
                            <button key={m} onClick={() => setDragEdits(m)}
                                className={`px-2 py-1 transition-colors ${dragEdits === m ? 'bg-synthux-red/80 text-white' : 'hover:text-white hover:bg-white/5'}`}>
                                {m === 'velocity' ? 'Velocity' : 'Pitch'}
                            </button>
                        ))}
                    </span>
                </span>

                <span className="flex items-center gap-1 flex-wrap" title="The order the patterns play in. Click one to cycle it A → B → C → D">
                    Chain
                    {seq.chain.map((p, i) => {
                        const here = step !== null && Math.floor(step / STEPS) === i;
                        return (
                            <button key={i}
                                onClick={() => onChange(seq => ({ ...seq, chain: seq.chain.map((x, k) => (k === i ? PATTERNS[(PATTERNS.indexOf(x) + 1) % 4] : x)) }))}
                                className={`w-6 py-0.5 rounded border font-bold font-mono transition-colors
                                    ${here ? 'border-synthux-red bg-synthux-red/30 text-white' : 'border-white/10 hover:bg-white/5 text-gray-300'}`}>
                                {p}
                            </button>
                        );
                    })}
                    <button onClick={() => onChange(seq => ({ ...seq, chain: [...seq.chain, seq.chain[seq.chain.length - 1]] }))}
                        disabled={seq.chain.length >= limit} title={`Add a pattern to the chain (at most ${limit} at this tempo: 42 s)`}
                        className="p-1 rounded border border-white/10 hover:bg-white/5 disabled:opacity-30"><Plus size={11} /></button>
                    <button onClick={() => onChange(seq => ({ ...seq, chain: seq.chain.slice(0, -1) }))} disabled={seq.chain.length <= 1}
                        title="Drop the last pattern from the chain"
                        className="p-1 rounded border border-white/10 hover:bg-white/5 disabled:opacity-30"><Minus size={11} /></button>
                    <span className="ml-1 font-mono text-gray-500">{bars} bar{bars === 1 ? '' : 's'} · {formatSeconds(seconds)}</span>
                </span>

                <span className="flex items-center gap-2 ml-auto">
                    <select value={cues} onChange={e => setCues(e.target.value as SeqCues)} aria-label="Cue points"
                        title="Where the rendered file gets its cue points"
                        className="bg-black/40 border border-white/10 rounded px-1 py-1 text-gray-200">
                        <option value="hits">Cues at hits</option>
                        <option value="beats">Cues per beat</option>
                        <option value="bars">Cues per bar</option>
                    </select>
                    <label className="flex items-center gap-1 cursor-pointer" title="Tails past the end come back in at the start, so the loop has no gap or cut">
                        <input type="checkbox" checked={fold} onChange={e => setFold(e.target.checked)} className="accent-synthux-red" />
                        Loop tails
                    </label>
                    <button onClick={() => onRender(cues, fold)} disabled={busy}
                        title="Render the whole chain as a result (Mangle › Results)"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold bg-synthux-red text-white hover:bg-synthux-red/80 disabled:opacity-40">
                        <Music size={12} /> Render
                    </button>
                </span>
            </div>

            {/* Tracks */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2">
                {seq.tracks.map((track, t) => {
                    const own = track.sliceId ? sliceById.get(track.sliceId) : undefined;
                    const color = own?.cls ? CLASS_COLOR[own.cls] : '#d1d5db';
                    return (
                        <div key={track.id} className="flex flex-wrap lg:flex-nowrap items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] p-2">
                            <div className="flex items-center gap-1.5 min-w-0 w-full lg:w-[19rem] shrink-0">
                                <button onClick={() => track.sliceId && onAudition(track.sliceId, track.shift)} disabled={!playable(track.sliceId)}
                                    title="Hear the track's slice" className="h-7 w-7 shrink-0 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30">
                                    <Play size={11} className="ml-px" />
                                </button>
                                <input value={track.name} onChange={e => setTrack(t, { name: e.target.value })} aria-label="Track name"
                                    className="w-20 min-w-0 bg-transparent text-[11px] font-bold text-gray-200 focus:outline-none focus:bg-black/40 rounded px-1" />
                                <select value={track.sliceId ?? ''} onChange={e => setTrack(t, { sliceId: e.target.value || null })}
                                    aria-label="Slice" className="min-w-0 flex-1 bg-black/40 border border-white/10 rounded px-1 py-1 text-[11px] text-gray-200">
                                    <option value="">— slice —</option>
                                    {sliceOptions}
                                </select>
                                <button onClick={() => setTrack(t, { mute: !track.mute })} title="Mute"
                                    className={`w-6 py-0.5 rounded text-[10px] font-bold border ${track.mute ? 'bg-synthux-yellow/80 text-black border-transparent' : 'border-white/10 text-gray-400 hover:text-white'}`}>M</button>
                                <button onClick={() => setTrack(t, { solo: !track.solo })} title="Solo"
                                    className={`w-6 py-0.5 rounded text-[10px] font-bold border ${track.solo ? 'bg-synthux-green/80 text-black border-transparent' : 'border-white/10 text-gray-400 hover:text-white'}`}>S</button>
                            </div>

                            <div className="grid grid-cols-16 gap-0.5 flex-1 min-w-[16rem]">
                                {track.patterns[edit].map((s, i) => {
                                    const lockedSlice = s.sliceId ? sliceById.get(s.sliceId) : undefined;
                                    const c = lockedSlice?.cls ? CLASS_COLOR[lockedSlice.cls] : color;
                                    return (
                                        <button key={i}
                                            onClick={e => e.stopPropagation()}
                                            onPointerDown={e => {
                                                if (e.button !== 0) return;
                                                e.currentTarget.setPointerCapture(e.pointerId);
                                                drag.current = { t, i, y0: e.clientY, velocity: s.velocity, shift: s.shift ?? 0, wasOn: s.on, moved: false };
                                            }}
                                            onPointerMove={e => {
                                                const d = drag.current;
                                                if (!d || d.t !== t || d.i !== i) return;
                                                const dy = d.y0 - e.clientY;
                                                if (!d.moved && Math.abs(dy) < 4) return;
                                                d.moved = true;
                                                if (dragEdits === 'velocity') {
                                                    // 100 px is the whole range; a dragged step is on.
                                                    const v = Math.min(1, Math.max(0.05, Math.round((d.velocity + dy / 100) * 100) / 100));
                                                    setStep(t, i, { on: true, velocity: v });
                                                    setDragLabel({ t, i, text: `${Math.round(v * 100)}%` });
                                                } else {
                                                    // 8 px a semitone, two octaves either way.
                                                    const st = Math.min(24, Math.max(-24, d.shift + Math.round(dy / 8)));
                                                    setStep(t, i, { on: true, shift: st || undefined });
                                                    setDragLabel({ t, i, text: `${st > 0 ? '+' : ''}${st} st` });
                                                }
                                            }}
                                            onPointerUp={() => {
                                                const d = drag.current;
                                                drag.current = null;
                                                setDragLabel(null);
                                                if (d && !d.moved) setStep(t, i, { on: !d.wasOn });
                                            }}
                                            onPointerCancel={() => { drag.current = null; setDragLabel(null); }}
                                            onContextMenu={e => {
                                                // A long press on a phone: the menu, not a toggle on release.
                                                e.preventDefault(); e.stopPropagation(); drag.current = null; setDragLabel(null);
                                                setMenu({ track: t, step: i, x: e.clientX, y: e.clientY });
                                            }}
                                            title={s.on
                                                ? `Velocity ${Math.round(s.velocity * 100)}%${s.shift ? ` · ${s.shift > 0 ? '+' : ''}${s.shift} st` : ''}${lockedSlice ? ` · ${lockedSlice.name}` : ''}. Drag up or down for ${dragEdits}; right-click for more`
                                                : `Click to switch on, or drag to set its ${dragEdits}`}
                                            aria-pressed={s.on}
                                            className={`relative h-8 rounded-sm border overflow-hidden touch-none transition-colors
                                                ${i % 4 === 0 ? 'border-white/20' : 'border-white/5'}
                                                ${playingHere === i ? 'ring-1 ring-white' : ''}
                                                ${s.on ? 'bg-white/[0.08]' : 'bg-white/[0.04] hover:bg-white/10'}`}>
                                            {/* Velocity as the fill height, so it reads at a glance. */}
                                            {s.on && <span className="absolute inset-x-0 bottom-0" style={{ height: `${Math.round(s.velocity * 100)}%`, background: c }} />}
                                            {s.on && !!s.shift && (
                                                <span className="absolute inset-x-0 top-0 text-[8px] leading-tight font-mono font-bold text-white mix-blend-difference">
                                                    {s.shift > 0 ? '+' : ''}{s.shift}
                                                </span>
                                            )}
                                            {lockedSlice && <span className="absolute inset-x-0 bottom-0.5 mx-auto h-1 w-1 rounded-full bg-black/70" />}
                                            {dragLabel?.t === t && dragLabel.i === i && (
                                                <span className="absolute left-1/2 -translate-x-1/2 -top-0.5 px-1 rounded bg-black text-[9px] font-mono text-white whitespace-nowrap z-10">
                                                    {dragLabel.text}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                                <ScrubNumber value={track.volumeDb} min={-36} max={12} step={0.5} unit="dB" width="w-[5rem]" ariaLabel="Track volume"
                                    onChange={v => setTrack(t, { volumeDb: v })} />
                                <ScrubNumber value={track.shift} min={-24} max={24} step={0.5} unit="st" width="w-[5rem]" ariaLabel="Track shift"
                                    onChange={v => setTrack(t, { shift: v })} />
                                <button onClick={() => onChange(seq => ({ ...seq, tracks: seq.tracks.filter((_, i) => i !== t) }))} disabled={seq.tracks.length <= 1}
                                    title="Remove the track" className="p-1 rounded text-gray-500 hover:text-synthux-red disabled:opacity-30">
                                    <Trash2 size={13} />
                                </button>
                            </div>
                        </div>
                    );
                })}

                <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-gray-400">
                    <button onClick={() => onChange(seq => ({ ...seq, tracks: [...seq.tracks, newTrack(newId(), `Track ${seq.tracks.length + 1}`)] }))}
                        disabled={seq.tracks.length >= MAX_TRACKS}
                        className="flex items-center gap-1 px-2 py-1 rounded border border-white/10 hover:text-white hover:bg-white/5 disabled:opacity-30">
                        <Plus size={11} /> Track
                    </button>
                    <button onClick={() => onChange(seq => ({ ...seq, tracks: seq.tracks.map(tr => ({ ...tr, patterns: { ...tr.patterns, [edit]: emptySteps() } })) }))}
                        className="flex items-center gap-1 px-2 py-1 rounded border border-white/10 hover:text-white hover:bg-white/5">
                        <Eraser size={11} /> Clear {edit}
                    </button>
                    <span className="flex items-center gap-1">
                        <Copy size={11} /> Copy {edit} to
                        {PATTERNS.filter(p => p !== edit).map(p => (
                            <button key={p}
                                onClick={() => onChange(seq => ({
                                    ...seq,
                                    tracks: seq.tracks.map(tr => ({ ...tr, patterns: { ...tr.patterns, [p]: tr.patterns[edit].map(s => ({ ...s })) } })),
                                }))}
                                className="w-6 py-0.5 rounded border border-white/10 font-bold hover:text-white hover:bg-white/5">{p}</button>
                        ))}
                    </span>
                    <span className="ml-auto text-gray-500">Click a step to switch it · drag it up or down for its velocity or pitch · right-click or long-press for more</span>
                </div>
            </div>

            {menu && (() => {
                const s = seq.tracks[menu.track]?.patterns[edit][menu.step];
                if (!s) return null;
                return (
                    <div className="fixed z-[95] w-56 rounded-lg border border-white/15 bg-synthux-panel shadow-2xl p-2 space-y-2 text-[11px] text-gray-300"
                        style={{ left: Math.min(menu.x, window.innerWidth - 240), top: Math.min(menu.y, window.innerHeight - 160) }}
                        onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <span className="font-bold">{seq.tracks[menu.track].name} · step {menu.step + 1}</span>
                            <button onClick={() => setMenu(null)} className="text-gray-500 hover:text-white" aria-label="Close"><X size={12} /></button>
                        </div>
                        <div className="flex items-center gap-1">
                            Velocity
                            {VELOCITIES.map(v => (
                                <button key={v} onClick={() => setStep(menu.track, menu.step, { on: true, velocity: v })}
                                    className={`px-1.5 py-0.5 rounded border ${s.on && s.velocity === v ? 'bg-synthux-red/80 text-white border-transparent' : 'border-white/10 hover:bg-white/5'}`}>
                                    {Math.round(v * 100)}
                                </button>
                            ))}
                        </div>
                        <div className="flex items-center gap-1">
                            Pitch
                            <ScrubNumber value={s.shift ?? 0} min={-24} max={24} step={1} unit="st" width="w-[5rem]" ariaLabel="Step pitch"
                                onChange={v => setStep(menu.track, menu.step, { on: true, shift: v || undefined })} />
                        </div>
                        <label className="flex items-center gap-1">
                            Slice
                            <select value={s.sliceId ?? ''} onChange={e => setStep(menu.track, menu.step, { on: true, sliceId: e.target.value || undefined })}
                                className="min-w-0 flex-1 bg-black/40 border border-white/10 rounded px-1 py-0.5 text-gray-200">
                                <option value="">the track&apos;s</option>
                                {sliceOptions}
                            </select>
                        </label>
                    </div>
                );
            })()}
        </div>
    );
};
