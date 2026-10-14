import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Cable, Copy, Dices, Eraser, Minus, Music, Play, Plus, Square, Trash2, X } from 'lucide-react';
import type { MidiPort, MidiSettings } from './useMidiLink';
import { pickAny, rollChain, rollCcSteps, rollCueSteps, rollLfo, rollSteps } from '../randomize';
import { ScrubNumber } from '../../components/ScrubNumber';
import type { MangleSliceEntry } from '../../utils/persistence';
import type { HitClass } from '../hits';
import { NOTE_NAMES } from '../pitch';
import { SCALES, maskFromIntervals, scaleName } from '../settings';
import {
    CUE_BASE_NOTE, LFO_PER_STEP, MAX_TRACKS, PATTERNS, ROOT_NOTE, SK_CCS, STEPS, VELOCITIES,
    ccInfo, cueSoundId, defaultCc, emptySteps, lfoAt, maxChain, newTrack, noteName, snapToScale,
    type CueSound, type LfoShape, type PatternId, type SeqCues, type SeqStep, type SeqTrack, type Sequence, type TrackKind,
} from '../sequence';
import { formatSeconds } from './format';

/**
 * The step sequencer: patterns A–D of 16 steps, a chain that plays them in
 * order, and up to 8 tracks of three kinds:
 *
 * - Slice: a slice from the pool, each step its own velocity and pitch (snapped
 *   to the scale when the track's Scale is on).
 * - Cue: a result or a pool file with cue points; each step's note picks a cue
 *   (C1 the first). The note doesn't repitch: it chooses the segment.
 * - CC: one of the Spotykach's MIDI CCs, a value per step or an LFO, sent over
 *   the Link to deck A or B.
 *
 * Click a step to switch it; drag it up or down for its velocity, pitch, cue
 * or CC value; right-click (or long-press) it for its options. Lives in the
 * browser: Render makes a result of the whole chain.
 */

interface SequencerStationProps {
    seq: Sequence;
    /** Changes go through an updater, so quick clicks build on each other. */
    onChange: (update: (seq: Sequence) => Sequence) => void;
    slices: MangleSliceEntry[];
    /** Ids of the sources still in the pool. */
    available: Set<string>;
    /** What a cue track can play: results and pool files with cue points. */
    cueSounds: CueSound[];
    playing: boolean;
    /** Global step being heard, or null. */
    step: number | null;
    busy: boolean;
    onPlay: () => void;
    onStop: () => void;
    /** Plays a sound id (a slice, or a cue's segment) at a shift. */
    onAudition: (soundId: string, shift: number) => void;
    onRender: (cues: SeqCues, fold: boolean) => void;
    newId: () => string;
    /** The MIDI link to a Spotykach (see useMidiLink.ts). */
    link: {
        supported: boolean;
        enabled: boolean;
        error: string | null;
        ports: { inputs: MidiPort[]; outputs: MidiPort[] };
        settings: MidiSettings;
        setSettings: (update: (s: MidiSettings) => MidiSettings) => void;
        enable: () => void;
        /** Following an outside clock: its tempo, once measured. */
        following: boolean;
        tempo: number | null;
    };
}

const CLASS_COLOR: Record<HitClass, string> = { low: '#f58b44', mid: '#f5d544', high: '#4771f9' };
const CUE_COLOR = '#2dd4bf';
const CC_COLOR = '#a78bfa';
const LFO_RATES: { steps: number; label: string }[] = [
    { steps: 2, label: '1/8' }, { steps: 4, label: '1 beat' }, { steps: 8, label: '2 beats' },
    { steps: 16, label: '1 bar' }, { steps: 32, label: '2 bars' }, { steps: 64, label: '4 bars' },
];
const CHROMATIC = maskFromIntervals([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

const cueKey = (c: Pick<CueSound, 'kind' | 'id'>) => `${c.kind}:${c.id}`;
const kindOf = (t: SeqTrack): TrackKind => t.kind ?? 'slice';

export const SequencerStation: React.FC<SequencerStationProps> = ({
    seq, onChange, slices, available, cueSounds, playing, step, busy, onPlay, onStop, onAudition, onRender, newId, link,
}) => {
    const [linkOpen, setLinkOpen] = useState(false);
    const linked = link.enabled && !!link.settings.outputId;
    const [edit, setEdit] = useState<PatternId>('A');
    const [cues, setCues] = useState<SeqCues>('hits');
    const [fold, setFold] = useState(true);
    const [menu, setMenu] = useState<{ track: number; step: number; x: number; y: number } | null>(null);
    /** What dragging a step up and down sets: velocity, or pitch (a cue on cue tracks). CC tracks always set the value. */
    const [dragEdits, setDragEdits] = useState<'velocity' | 'pitch'>('velocity');
    /** A step being dragged: where it started, and whether it has moved (a click otherwise). */
    const drag = useRef<{ t: number; i: number; y0: number; velocity: number; shift: number; note: number; wasOn: boolean; moved: boolean } | null>(null);
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
    const scale = seq.scale ?? { root: 0, mask: CHROMATIC };

    const setTrack = (t: number, patch: Partial<SeqTrack>) =>
        onChange(seq => ({ ...seq, tracks: seq.tracks.map((x, i) => (i === t ? { ...x, ...patch } : x)) }));
    const setStep = (t: number, s: number, patch: Partial<SeqStep>) => onChange(seq => ({
        ...seq,
        tracks: seq.tracks.map((x, i) => (i !== t ? x : {
            ...x,
            patterns: { ...x.patterns, [edit]: x.patterns[edit].map((st, k) => (k === s ? { ...st, ...patch } : st)) },
        })),
    }));
    const setCc = (t: number, patch: Partial<NonNullable<SeqTrack['cc']>>) =>
        onChange(seq => ({ ...seq, tracks: seq.tracks.map((x, i) => (i === t ? { ...x, cc: { ...(x.cc ?? defaultCc()), ...patch } } : x)) }));
    const used = (p: PatternId) => seq.tracks.some(t => t.patterns[p].some(s => s.on));

    /** A slice for a track: the class it already has, or any. */
    const rollSlice = (current: string | null) => {
        const cls = current ? sliceById.get(current)?.cls : undefined;
        const pool = slices.filter(s => available.has(s.sourceId) && (!cls || s.cls === cls));
        return pickAny(pool)?.id ?? current;
    };
    /** Dice for one track's steps, after its kind: slice (by class), cue (random cues), CC (values or a new LFO). */
    const rollFor = (tr: SeqTrack): SeqTrack => {
        const kind = kindOf(tr);
        if (kind === 'cc') {
            const cc = tr.cc ?? defaultCc();
            return cc.mode === 'lfo'
                ? { ...tr, cc: { ...cc, lfo: rollLfo() } }
                : { ...tr, patterns: { ...tr.patterns, [edit]: rollCcSteps() } };
        }
        if (kind === 'cue') return tr.cue ? { ...tr, patterns: { ...tr.patterns, [edit]: rollCueSteps(tr.cue.cues.length) } } : tr;
        const sliceId = tr.sliceId ?? rollSlice(null);
        const cls = sliceId ? sliceById.get(sliceId)?.cls : undefined;
        return { ...tr, sliceId, patterns: { ...tr.patterns, [edit]: rollSteps(cls) } };
    };
    const rollTrack = (t: number) => onChange(seq => ({ ...seq, tracks: seq.tracks.map((tr, i) => (i === t ? rollFor(tr) : tr)) }));
    /** Dice for the pattern: every track that has something to play. */
    const rollPattern = () => onChange(seq => ({
        ...seq,
        tracks: seq.tracks.map(tr => (kindOf(tr) === 'slice' && !tr.sliceId) || (kindOf(tr) === 'cue' && !tr.cue) ? tr : rollFor(tr)),
    }));

    const changeKind = (t: number, kind: TrackKind) => onChange(seq => ({
        ...seq,
        tracks: seq.tracks.map((tr, i) => {
            if (i !== t) return tr;
            if (kind === 'cc') return { ...tr, kind, cc: tr.cc ?? defaultCc(), midi: tr.midi ?? 'A' };
            if (kind === 'cue') return { ...tr, kind, cue: tr.cue ?? cueSounds[0] };
            return { ...tr, kind: undefined };
        }),
    }));

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

    const select = 'bg-black/40 border border-white/10 rounded px-1 py-1 text-[11px] text-gray-200';
    const iconButton = 'p-1 rounded text-gray-500 hover:text-synthux-red hover:bg-white/5';

    return (
        <div className="h-full min-h-0 flex flex-col" onClick={() => setMenu(null)}>
            {/* Transport, patterns, scale, chain, render */}
            <div className="shrink-0 flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 border-b border-white/10 text-[11px] text-gray-400">
                <button onClick={() => (playing ? onStop() : onPlay())}
                    title={playing ? 'Stop' : link.settings.follow && link.enabled ? 'Arm: the incoming clock plays it (Start, or just ticks)' : 'Play the chain, looping'}
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
                        className="w-20 accent-synthux-red" aria-label="Swing" />
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

                <span className="flex items-center gap-2" title="What dragging a step up or down sets. On cue tracks Pitch picks the cue; CC steps always set the value">
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

                <span className="flex items-center gap-1.5" title="The scale tracks with Scale on snap their step pitches to (playback and MIDI notes alike)">
                    Scale
                    <select value={scale.root} aria-label="Scale root" className={select}
                        onChange={e => onChange(seq => ({ ...seq, scale: { ...(seq.scale ?? { root: 0, mask: CHROMATIC }), root: Number(e.target.value) } }))}>
                        {NOTE_NAMES.map((n, pc) => <option key={n} value={pc}>{n}</option>)}
                    </select>
                    <select value={scaleName(scale.mask) ?? ''} aria-label="Scale" className={select}
                        onChange={e => {
                            const preset = SCALES.find(sc => sc.name === e.target.value);
                            if (preset) onChange(seq => ({ ...seq, scale: { root: seq.scale?.root ?? 0, mask: maskFromIntervals(preset.intervals) } }));
                        }}>
                        {scaleName(scale.mask) === null && <option value="">Custom</option>}
                        {SCALES.map(sc => <option key={sc.name} value={sc.name}>{sc.name}</option>)}
                    </select>
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
                    <button onClick={() => onChange(seq => ({ ...seq, chain: rollChain(seq.chain.length, PATTERNS.filter(p => seq.tracks.some(t => t.patterns[p].some(s => s.on)))) }))}
                        disabled={seq.chain.length <= 1}
                        title="Dice: rearrange the chain from the patterns that have steps"
                        className="p-1 rounded border border-white/10 hover:text-synthux-red hover:bg-white/5 disabled:opacity-30"><Dices size={11} /></button>
                    <button onClick={() => onChange(seq => ({ ...seq, chain: seq.chain.slice(0, -1) }))} disabled={seq.chain.length <= 1}
                        title="Drop the last pattern from the chain"
                        className="p-1 rounded border border-white/10 hover:bg-white/5 disabled:opacity-30"><Minus size={11} /></button>
                    <span className="ml-1 font-mono text-gray-500">{bars} bar{bars === 1 ? '' : 's'} · {formatSeconds(seconds)}</span>
                </span>

                <button onClick={e => { e.stopPropagation(); setLinkOpen(o => !o); }}
                    title="Link to a Spotykach over MIDI: clock, Start / Stop, notes for its decks, and CC tracks"
                    className={`flex items-center gap-1.5 px-2 py-1 rounded border transition-colors
                        ${linked ? 'border-synthux-green/50 text-synthux-green' : 'border-white/10 hover:text-white hover:bg-white/5'}`}>
                    <Cable size={12} /> Link
                    {link.following && <span className="font-mono text-[10px]">{link.tempo ? `${link.tempo} bpm` : 'waiting'}</span>}
                </button>

                <span className="flex items-center gap-2 ml-auto">
                    <select value={cues} onChange={e => setCues(e.target.value as SeqCues)} aria-label="Cue points"
                        title="Where the rendered file gets its cue points" className={select}>
                        <option value="hits">Cues at hits</option>
                        <option value="beats">Cues per beat</option>
                        <option value="bars">Cues per bar</option>
                    </select>
                    <label className="flex items-center gap-1 cursor-pointer" title="Tails past the end come back in at the start, so the loop has no gap or cut">
                        <input type="checkbox" checked={fold} onChange={e => setFold(e.target.checked)} className="accent-synthux-red" />
                        Loop tails
                    </label>
                    <button onClick={() => onRender(cues, fold)} disabled={busy}
                        title="Render the whole chain as a result (Mangle › Results). MIDI-only steps and CC tracks are not in it"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold bg-synthux-red text-white hover:bg-synthux-red/80 disabled:opacity-40">
                        <Music size={12} /> Render
                    </button>
                </span>
            </div>

            {linkOpen && <LinkPanel link={link} onClose={() => setLinkOpen(false)} />}

            {/* Tracks */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2">
                {slices.length === 0 && cueSounds.length === 0 && (
                    <p className="text-[11px] text-gray-500">
                        Slice tracks play slices (Slices, or <em>To slices</em> from the hits or a result&apos;s snippets); cue tracks play a result
                        or a file with cue points. CC tracks need neither: they drive a Spotykach over the Link.
                    </p>
                )}
                {seq.tracks.map((track, t) => {
                    const kind = kindOf(track);
                    const own = track.sliceId ? sliceById.get(track.sliceId) : undefined;
                    const color = kind === 'cue' ? CUE_COLOR : kind === 'cc' ? CC_COLOR : own?.cls ? CLASS_COLOR[own.cls] : '#d1d5db';
                    const cc = track.cc ?? defaultCc();
                    const ccKind = ccInfo(cc.cc).kind;
                    const auditionId = kind === 'cue' ? (track.cue ? cueSoundId(track.cue, 0) : null) : kind === 'slice' ? track.sliceId : null;
                    return (
                        <div key={track.id} className="flex flex-wrap lg:flex-nowrap items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] p-2">
                            <div className="flex flex-col gap-1 min-w-0 w-full lg:w-[22rem] shrink-0">
                                <div className="flex items-center gap-1 min-w-0">
                                <button onClick={() => auditionId && onAudition(auditionId, kind === 'slice' ? track.shift : 0)}
                                    disabled={!auditionId || (kind === 'slice' && !playable(track.sliceId))}
                                    title={kind === 'cue' ? 'Hear the first cue' : 'Hear the track\'s slice'}
                                    className="h-7 w-7 shrink-0 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30">
                                    <Play size={11} className="ml-px" />
                                </button>
                                <input value={track.name} onChange={e => setTrack(t, { name: e.target.value })} aria-label="Track name"
                                    className="w-16 min-w-0 bg-transparent text-[11px] font-bold text-gray-200 focus:outline-none focus:bg-black/40 rounded px-1" />
                                <select value={kind} onChange={e => changeKind(t, e.target.value as TrackKind)} aria-label="Track kind"
                                    title="Slice: a slice from the pool. Cue: a sample's cue points, one per step. CC: a Spotykach control over the Link"
                                    className={`${select} w-14 font-bold`} style={{ color }}>
                                    <option value="slice">Slice</option>
                                    <option value="cue">Cue</option>
                                    <option value="cc">CC</option>
                                </select>
                                <span className="ml-auto" />
                                <select value={track.midi ?? ''} onChange={e => setTrack(t, { midi: (e.target.value || (kind === 'cc' ? 'A' : undefined)) as 'A' | 'B' | undefined })}
                                    title={kind === 'cc' ? 'The deck (its MIDI channel) this CC goes to' : 'Send this track\'s steps to a Spotykach deck as MIDI notes (over the Link)'}
                                    aria-label="Spotykach deck"
                                    className={`w-12 bg-black/40 border rounded px-0.5 py-1 text-[10px] font-bold ${track.midi ? 'border-synthux-green/50 text-synthux-green' : 'border-white/10 text-gray-500'}`}>
                                    {kind !== 'cc' && <option value="">SK –</option>}
                                    <option value="A">SK A</option>
                                    <option value="B">SK B</option>
                                </select>
                                <button onClick={() => setTrack(t, { mute: !track.mute })} title="Mute"
                                    className={`w-6 py-0.5 rounded text-[10px] font-bold border ${track.mute ? 'bg-synthux-yellow/80 text-black border-transparent' : 'border-white/10 text-gray-400 hover:text-white'}`}>M</button>
                                <button onClick={() => setTrack(t, { solo: !track.solo })} title="Solo"
                                    className={`w-6 py-0.5 rounded text-[10px] font-bold border ${track.solo ? 'bg-synthux-green/80 text-black border-transparent' : 'border-white/10 text-gray-400 hover:text-white'}`}>S</button>
                                </div>
                                <div className="flex items-center gap-1 min-w-0">

                                {kind === 'slice' && <>
                                    <select value={track.sliceId ?? ''} onChange={e => setTrack(t, { sliceId: e.target.value || null })}
                                        aria-label="Slice" className={`${select} min-w-0 flex-1`}>
                                        <option value="">— slice —</option>
                                        {sliceOptions}
                                    </select>
                                    <button onClick={() => setTrack(t, { sliceId: rollSlice(track.sliceId) })}
                                        title="Dice: another slice of the same class" aria-label="Roll the slice" className={iconButton}><Dices size={12} /></button>
                                    <button onClick={() => setTrack(t, { scaleLock: !track.scaleLock || undefined })} aria-pressed={!!track.scaleLock}
                                        title={`Scale: snap this track's step pitches to ${NOTE_NAMES[scale.root]} ${scaleName(scale.mask) ?? 'custom'}`}
                                        className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${track.scaleLock ? 'border-synthux-blue/60 text-synthux-blue' : 'border-white/10 text-gray-500 hover:text-white'}`}>
                                        Scale
                                    </button>
                                </>}

                                {kind === 'cue' && (
                                    <select value={track.cue ? cueKey(track.cue) : ''} aria-label="Cue sample" className={`${select} min-w-0 flex-1`}
                                        onChange={e => setTrack(t, { cue: cueSounds.find(c => cueKey(c) === e.target.value) })}>
                                        <option value="">— sample with cues —</option>
                                        {cueSounds.map(c => <option key={cueKey(c)} value={cueKey(c)}>{c.name} ({c.cues.length} cues)</option>)}
                                    </select>
                                )}

                                {kind === 'cc' && <>
                                    <select value={cc.cc} aria-label="CC" className={`${select} min-w-0 flex-1`}
                                        onChange={e => setCc(t, { cc: Number(e.target.value) })}>
                                        {(['value', 'momentary', 'toggle'] as const).map(k => (
                                            <optgroup key={k} label={k === 'value' ? 'Values' : k === 'momentary' ? 'On while held' : 'Toggles (a tap)'}>
                                                {SK_CCS.filter(c => c.kind === k).map(c => <option key={c.cc} value={c.cc}>{c.cc} {c.name}</option>)}
                                            </optgroup>
                                        ))}
                                    </select>
                                    <span className="flex rounded border border-white/10 overflow-hidden text-[10px]">
                                        {(['steps', 'lfo'] as const).map(m => (
                                            <button key={m} onClick={() => setCc(t, { mode: m })} disabled={m === 'lfo' && ccKind !== 'value'}
                                                title={m === 'lfo' ? 'An LFO over the chain (value CCs only)' : 'A value per step'}
                                                className={`px-1.5 py-0.5 disabled:opacity-30 ${cc.mode === m ? 'bg-synthux-red/80 text-white' : 'text-gray-400 hover:text-white'}`}>
                                                {m === 'lfo' ? 'LFO' : 'Steps'}
                                            </button>
                                        ))}
                                    </span>
                                </>}

                                <button onClick={() => rollTrack(t)}
                                    title={kind === 'cc' ? (cc.mode === 'lfo' ? 'Dice: a new LFO' : `Dice: new values for pattern ${edit}`)
                                        : kind === 'cue' ? `Dice: a new pattern ${edit} of random cues` : `Dice: a new pattern ${edit} for this track, after its slice (kicks on the beat, hats busier)`}
                                    aria-label="Roll the track's steps" className={iconButton}><Dices size={12} className="rotate-45" /></button>
                                </div>
                            </div>

                            {kind === 'cc' && cc.mode === 'lfo' ? (
                                <LfoEditor lfo={cc.lfo} onChange={lfo => setCc(t, { lfo })} />
                            ) : (
                                <div className="grid grid-cols-16 gap-0.5 flex-1 min-w-[16rem]">
                                    {track.patterns[edit].map((s, i) => {
                                        const lockedSlice = s.sliceId ? sliceById.get(s.sliceId) : undefined;
                                        const c = lockedSlice?.cls ? CLASS_COLOR[lockedSlice.cls] : color;
                                        const cueIndex = (s.note ?? CUE_BASE_NOTE) - CUE_BASE_NOTE;
                                        const fill = kind === 'cc' && ccKind !== 'value' ? 1 : s.velocity;
                                        // What the step's label says: a pitch, a cue, a CC value.
                                        const label = !s.on ? '' : kind === 'cue' ? String(cueIndex + 1)
                                            : kind === 'cc' ? (ccKind === 'value' ? String(Math.round(s.velocity * 127)) : '')
                                                : s.shift ? `${s.shift > 0 ? '+' : ''}${s.shift}` : '';
                                        const what = kind === 'cc' ? 'value' : kind === 'cue' && dragEdits === 'pitch' ? 'cue' : dragEdits;
                                        return (
                                            <button key={i}
                                                onClick={e => e.stopPropagation()}
                                                onPointerDown={e => {
                                                    if (e.button !== 0) return;
                                                    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* no live pointer: still a click */ }
                                                    drag.current = { t, i, y0: e.clientY, velocity: s.velocity, shift: s.shift ?? 0, note: s.note ?? CUE_BASE_NOTE, wasOn: s.on, moved: false };
                                                }}
                                                onPointerMove={e => {
                                                    const d = drag.current;
                                                    if (!d || d.t !== t || d.i !== i) return;
                                                    const dy = d.y0 - e.clientY;
                                                    if (!d.moved && Math.abs(dy) < 4) return;
                                                    d.moved = true;
                                                    if (what === 'velocity' || what === 'value') {
                                                        // 100 px is the whole range; a dragged step is on.
                                                        const v = Math.min(1, Math.max(what === 'value' ? 0 : 0.05, Math.round((d.velocity + dy / 100) * 100) / 100));
                                                        setStep(t, i, { on: true, velocity: v });
                                                        setDragLabel({ t, i, text: what === 'value' ? String(Math.round(v * 127)) : `${Math.round(v * 100)}%` });
                                                    } else if (what === 'cue') {
                                                        // 8 px a cue, C1 the first.
                                                        const count = track.cue?.cues.length ?? 1;
                                                        const note = Math.min(CUE_BASE_NOTE + count - 1, Math.max(CUE_BASE_NOTE, d.note + Math.round(dy / 8)));
                                                        setStep(t, i, { on: true, note });
                                                        setDragLabel({ t, i, text: `cue ${note - CUE_BASE_NOTE + 1} · ${noteName(note)}` });
                                                    } else {
                                                        // 8 px a semitone, two octaves either way; with Scale on, scale notes only.
                                                        let st = Math.min(24, Math.max(-24, d.shift + Math.round(dy / 8)));
                                                        if (track.scaleLock) st = snapToScale(ROOT_NOTE + track.shift + st, scale) - ROOT_NOTE - track.shift;
                                                        setStep(t, i, { on: true, shift: st || undefined });
                                                        setDragLabel({ t, i, text: `${st > 0 ? '+' : ''}${st} st · ${noteName(Math.round(ROOT_NOTE + track.shift + st))}` });
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
                                                    ? `${kind === 'cc' ? `Value ${Math.round(s.velocity * 127)}` : `Velocity ${Math.round(s.velocity * 100)}%`}`
                                                    + (kind === 'cue' ? ` · cue ${cueIndex + 1} (${noteName(s.note ?? CUE_BASE_NOTE)})` : '')
                                                    + (kind === 'slice' && s.shift ? ` · ${s.shift > 0 ? '+' : ''}${s.shift} st` : '')
                                                    + (lockedSlice ? ` · ${lockedSlice.name}` : '')
                                                    + `. Drag up or down for its ${what}; right-click for more`
                                                    : `Click to switch on, or drag to set its ${what}`}
                                                aria-pressed={s.on}
                                                className={`relative h-8 rounded-sm border overflow-hidden touch-none transition-colors
                                                    ${i % 4 === 0 ? 'border-white/20' : 'border-white/5'}
                                                    ${playingHere === i ? 'ring-1 ring-white' : ''}
                                                    ${s.on ? 'bg-white/[0.08]' : 'bg-white/[0.04] hover:bg-white/10'}`}>
                                                {/* Velocity (or the CC value) as the fill height, so it reads at a glance. */}
                                                {s.on && <span className="absolute inset-x-0 bottom-0" style={{ height: `${Math.round(fill * 100)}%`, background: c }} />}
                                                {label && (
                                                    <span className="absolute inset-x-0 top-0 text-[8px] leading-tight font-mono font-bold text-white mix-blend-difference">{label}</span>
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
                            )}

                            {/* A fixed width, so every track's steps line up whatever its kind. */}
                            <div className="flex items-center justify-end gap-1.5 shrink-0 lg:w-[12.5rem]">
                                {kind !== 'cc' && (
                                    <ScrubNumber value={track.volumeDb} min={-36} max={12} step={0.5} unit="dB" width="w-[5rem]" ariaLabel="Track volume"
                                        onChange={v => setTrack(t, { volumeDb: v })} />
                                )}
                                {kind === 'slice' && (
                                    <ScrubNumber value={track.shift} min={-24} max={24} step={0.5} unit="st" width="w-[5rem]" ariaLabel="Track shift"
                                        onChange={v => setTrack(t, { shift: v })} />
                                )}
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
                    <button onClick={rollPattern}
                        title={`Dice: a new pattern ${edit} on every track that has something to play (CC LFOs get a new LFO)`}
                        className="flex items-center gap-1 px-2 py-1 rounded border border-white/10 hover:text-synthux-red hover:bg-white/5">
                        <Dices size={11} /> Roll {edit}
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
                    <span className="ml-auto text-gray-500">Click a step to switch it · drag it up or down · right-click or long-press for its options</span>
                </div>
            </div>

            {menu && (() => {
                const track = seq.tracks[menu.track];
                const s = track?.patterns[edit][menu.step];
                if (!track || !s) return null;
                return (
                    <StepMenu
                        x={menu.x} y={menu.y} track={track} step={s} index={menu.step} scale={scale} sliceOptions={sliceOptions}
                        onChange={patch => setStep(menu.track, menu.step, patch)}
                        onAudition={onAudition}
                        onClose={() => setMenu(null)}
                    />
                );
            })()}
        </div>
    );
};

// ---------------------------------------------------------------------------
// Step menu
// ---------------------------------------------------------------------------

/**
 * A step's options, after the track's kind. In a portal on the page itself: a
 * fixed element inside the mangler would be placed relative to a transformed
 * ancestor, off screen.
 */
const StepMenu: React.FC<{
    x: number; y: number; track: SeqTrack; step: SeqStep; index: number;
    scale: { root: number; mask: number };
    sliceOptions: React.ReactNode;
    onChange: (patch: Partial<SeqStep>) => void;
    onAudition: (soundId: string, shift: number) => void;
    onClose: () => void;
}> = ({ x, y, track, step, index, scale, sliceOptions, onChange, onAudition, onClose }) => {
    const kind = kindOf(track);
    const cc = track.cc ?? defaultCc();
    const ccKind = ccInfo(cc.cc).kind;
    const note = step.note ?? CUE_BASE_NOTE;
    const sounding = ROOT_NOTE + track.shift + (step.shift ?? 0);
    const snapped = track.scaleLock ? snapToScale(Math.round(sounding), scale) : Math.round(sounding);
    return createPortal(
        <div className="fixed z-[200] w-60 rounded-lg border border-white/15 bg-synthux-panel shadow-2xl p-2.5 space-y-2 text-[11px] text-gray-300"
            // Inline: a page-wide rule makes body's children position: relative, which beats the class.
            style={{ position: 'fixed', left: Math.max(8, Math.min(x, window.innerWidth - 250)), top: Math.max(8, Math.min(y, window.innerHeight - 220)) }}
            onClick={e => e.stopPropagation()} onContextMenu={e => e.preventDefault()}>
            <div className="flex items-center justify-between">
                <span className="font-bold text-gray-100">{track.name} · step {index + 1}</span>
                <button onClick={onClose} className="text-gray-500 hover:text-white" aria-label="Close"><X size={12} /></button>
            </div>
            <button onClick={() => onChange({ on: !step.on })}
                className={`w-full px-2 py-1 rounded border ${step.on ? 'border-synthux-red/50 text-white' : 'border-white/10 hover:bg-white/5'}`}>
                {step.on ? 'Switch off' : 'Switch on'}
            </button>

            {kind === 'cc' ? (
                ccKind === 'value' ? (
                    <div className="flex items-center justify-between gap-2">
                        <span>{cc.cc} {ccInfo(cc.cc).name}</span>
                        <ScrubNumber value={Math.round(step.velocity * 127)} min={0} max={127} step={1} width="w-[4.5rem]" ariaLabel="CC value"
                            onChange={v => onChange({ on: true, velocity: v / 127 })} />
                    </div>
                ) : (
                    <p className="text-gray-500">{ccInfo(cc.cc).name}: {ccKind === 'toggle' ? 'a tap (127) on this step' : '127 on this step, 0 before the next off step'}.</p>
                )
            ) : (
                <div className="flex items-center gap-1">
                    Velocity
                    {VELOCITIES.map(v => (
                        <button key={v} onClick={() => onChange({ on: true, velocity: v })}
                            className={`px-1.5 py-0.5 rounded border ${step.on && step.velocity === v ? 'bg-synthux-red/80 text-white border-transparent' : 'border-white/10 hover:bg-white/5'}`}>
                            {Math.round(v * 100)}
                        </button>
                    ))}
                </div>
            )}

            {kind === 'slice' && <>
                <div className="flex items-center justify-between gap-2">
                    Pitch
                    <span className="flex items-center gap-1.5">
                        <ScrubNumber value={step.shift ?? 0} min={-24} max={24} step={1} unit="st" width="w-[5rem]" ariaLabel="Step pitch"
                            onChange={v => onChange({ on: true, shift: v || undefined })} />
                        <span className="font-mono text-gray-400" title={track.scaleLock ? 'Snapped to the scale' : 'The note it plays'}>
                            {noteName(snapped)}{track.scaleLock && snapped !== Math.round(sounding) ? ' ♮' : ''}
                        </span>
                    </span>
                </div>
                <label className="flex items-center gap-1">
                    Slice
                    <select value={step.sliceId ?? ''} onChange={e => onChange({ on: true, sliceId: e.target.value || undefined })}
                        className="min-w-0 flex-1 bg-black/40 border border-white/10 rounded px-1 py-0.5 text-gray-200">
                        <option value="">the track&apos;s</option>
                        {sliceOptions}
                    </select>
                </label>
            </>}

            {kind === 'cue' && (
                <label className="flex items-center gap-1">
                    Cue
                    <select value={note} onChange={e => onChange({ on: true, note: Number(e.target.value) })}
                        className="min-w-0 flex-1 bg-black/40 border border-white/10 rounded px-1 py-0.5 text-gray-200">
                        {(track.cue?.cues ?? [0]).map((at, i) => (
                            <option key={i} value={CUE_BASE_NOTE + i}>{i + 1} · {noteName(CUE_BASE_NOTE + i)} · {at.toFixed(2)} s</option>
                        ))}
                    </select>
                    {track.cue && (
                        <button onClick={() => track.cue && onAudition(cueSoundId(track.cue, note - CUE_BASE_NOTE), 0)}
                            title="Hear this cue" className="p-1 rounded bg-white/10 hover:bg-white/20"><Play size={10} /></button>
                    )}
                </label>
            )}
        </div>,
        document.body,
    );
};

// ---------------------------------------------------------------------------
// LFO editor
// ---------------------------------------------------------------------------

const LfoEditor: React.FC<{
    lfo: NonNullable<SeqTrack['cc']>['lfo'];
    onChange: (lfo: NonNullable<SeqTrack['cc']>['lfo']) => void;
}> = ({ lfo, onChange }) => {
    // A bar of it, four points a step, as it will be sent.
    const points = Array.from({ length: STEPS * LFO_PER_STEP + 1 }, (_, j) => {
        const v = lfoAt(lfo.shape, j / LFO_PER_STEP / Math.max(1, lfo.rateSteps) + lfo.phase);
        const value = lfo.min + (lfo.max - lfo.min) * v;
        return `${(j / (STEPS * LFO_PER_STEP)) * 100},${30 - (value / 127) * 28 - 1}`;
    }).join(' ');
    const select = 'bg-black/40 border border-white/10 rounded px-1 py-0.5 text-[10px] text-gray-200';
    return (
        <div className="flex-1 min-w-[16rem] flex flex-wrap items-center gap-2 text-[10px] text-gray-400">
            <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-8 flex-1 min-w-[8rem] rounded-sm bg-white/[0.04]" aria-hidden>
                <polyline points={points} fill="none" stroke={CC_COLOR} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
            </svg>
            <select value={lfo.shape} onChange={e => onChange({ ...lfo, shape: e.target.value as LfoShape })} aria-label="LFO shape" className={select}>
                {(['sine', 'triangle', 'saw', 'square', 'random'] as const).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={lfo.rateSteps} onChange={e => onChange({ ...lfo, rateSteps: Number(e.target.value) })} aria-label="LFO rate" className={select}
                title="One cycle takes this long">
                {LFO_RATES.map(r => <option key={r.steps} value={r.steps}>{r.label}</option>)}
            </select>
            <span className="flex items-center gap-1" title="The range it sweeps, 0–127">
                <ScrubNumber value={lfo.min} min={0} max={lfo.max} step={1} width="w-[3.8rem]" ariaLabel="LFO minimum" onChange={v => onChange({ ...lfo, min: v })} />
                –
                <ScrubNumber value={lfo.max} min={lfo.min} max={127} step={1} width="w-[3.8rem]" ariaLabel="LFO maximum" onChange={v => onChange({ ...lfo, max: v })} />
            </span>
            <span className="flex items-center gap-1" title="Where in its cycle it starts">
                phase
                <ScrubNumber value={Math.round(lfo.phase * 100)} min={0} max={99} step={1} unit="%" width="w-[4rem]" ariaLabel="LFO phase"
                    onChange={v => onChange({ ...lfo, phase: v / 100 })} />
            </span>
        </div>
    );
};

// ---------------------------------------------------------------------------
// Link panel
// ---------------------------------------------------------------------------

const LinkPanel: React.FC<{ link: SequencerStationProps['link']; onClose: () => void }> = ({ link, onClose }) => (
    <div className="shrink-0 border-b border-white/10 bg-black/20 px-4 py-3 text-[11px] text-gray-300 grid gap-x-6 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3 items-start"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
            <span className="font-bold text-gray-100">Spotykach link (MIDI)</span>
            <button onClick={onClose} className="text-gray-500 hover:text-white" aria-label="Close"><X size={12} /></button>
        </div>
        {!link.supported ? (
            <p className="text-gray-500">This browser has no Web MIDI. Chrome or Edge on a computer have it.</p>
        ) : !link.enabled ? (
            <>
                <p className="text-gray-500">Plug the Spotykach in over USB (or a MIDI interface on its TRS jack), then connect.</p>
                <button onClick={link.enable} className="w-full px-3 py-1.5 rounded bg-synthux-red text-white font-bold hover:bg-synthux-red/80">Connect MIDI</button>
            </>
        ) : (
            <>
                <label className="flex items-center justify-between gap-2">
                    Send to
                    <select value={link.settings.outputId ?? ''} onChange={e => link.setSettings(s => ({ ...s, outputId: e.target.value || null }))}
                        className="min-w-0 flex-1 max-w-[12rem] bg-black/40 border border-white/10 rounded px-1 py-1 text-gray-200">
                        <option value="">— nothing —</option>
                        {link.ports.outputs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                </label>
                <label className="flex items-center justify-between gap-2">
                    Listen to
                    <select value={link.settings.inputId ?? ''} onChange={e => link.setSettings(s => ({ ...s, inputId: e.target.value || null }))}
                        className="min-w-0 flex-1 max-w-[12rem] bg-black/40 border border-white/10 rounded px-1 py-1 text-gray-200">
                        <option value="">— nothing —</option>
                        {link.ports.inputs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                </label>
                <div className="flex rounded-md border border-white/10 overflow-hidden" title="Who keeps time">
                    {([
                        ['lead', 'Lead: send clock', 'The sequencer is the master: clock and Start / Stop go out with it'],
                        ['follow', 'Follow its clock', 'The Spotykach (or another master) keeps time: tempo, Start, Stop and Continue come in'],
                        ['none', 'No clock', 'Only notes and CCs go out'],
                    ] as const).map(([id, label, hint]) => {
                        const on = id === 'lead' ? link.settings.sendClock && !link.settings.follow : id === 'follow' ? link.settings.follow : !link.settings.sendClock && !link.settings.follow;
                        return (
                            <button key={id} title={hint}
                                onClick={() => link.setSettings(s => ({ ...s, sendClock: id === 'lead', follow: id === 'follow' }))}
                                className={`flex-1 px-1.5 py-1 ${on ? 'bg-synthux-red/80 text-white' : 'hover:bg-white/5'}`}>{label}</button>
                        );
                    })}
                </div>
                <div className="flex items-center gap-3">
                    {(['A', 'B'] as const).map(d => (
                        <label key={d} className="flex items-center gap-1">
                            Deck {d} channel
                            <select value={d === 'A' ? link.settings.channelA : link.settings.channelB}
                                onChange={e => link.setSettings(s => ({ ...s, [d === 'A' ? 'channelA' : 'channelB']: Number(e.target.value) }))}
                                className="bg-black/40 border border-white/10 rounded px-1 py-0.5 text-gray-200">
                                {Array.from({ length: 16 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
                            </select>
                        </label>
                    ))}
                </div>
                <p className="text-[10px] leading-snug text-gray-500">
                    Route a slice or cue track to a deck with its <em>SK</em> menu: each step plays that deck, note 60 plus the step&apos;s pitch
                    (a cue track sends its cue&apos;s note, C1 up). CC tracks drive the deck&apos;s controls: position, size, envelope, pitch, mix,
                    grit, flux… On the Spotykach, set the clock source to MIDI to follow the sequencer; Start / Stop play the decks only where
                    config.txt allows it. Sending a sample over USB switches it out of MIDI until that is done.
                </p>
            </>
        )}
        {link.error && <p className="text-synthux-red">{link.error}</p>}
    </div>
);
