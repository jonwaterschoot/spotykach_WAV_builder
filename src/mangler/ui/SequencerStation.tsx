import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Cable, ChevronDown, ChevronUp, Copy, Dices, Eraser, ListMusic, Loader, Minus, Music, PenLine, Pencil, Play, Plus, Redo2, Repeat, Square, Trash2, Undo2, X } from 'lucide-react';
import type { MidiPort, MidiSettings } from './useMidiLink';
import { pickAny, rollAutomation, rollCcSteps, rollCueSteps, rollLfo, rollSteps } from '../randomize';
import { ScrubNumber } from '../../components/ScrubNumber';
import type { MangleSliceEntry } from '../../utils/persistence';
import { NOTE_NAMES } from '../pitch';
import { ATTACK_MAX_MS, DECAY_MAX_MS, DECAY_MIN_MS, SCALES, maskFromIntervals, scaleName } from '../settings';
import type { SnippetEnvelope } from '../render';
import {
    CUE_BASE_NOTE, LFO_PER_STEP, MASTER_MAX_DB, MASTER_MIN_DB, MAX_TRACKS, PATTERNS, ROOT_NOTE, SK_CCS, STEPS, VELOCITIES, patternsOf,
    autoAt, ccInfo, cueSoundId, defaultCc, emptySteps, lfoAt, lockToScale, maxChain, newTrack, noteName, snapToScale, trackAutoAt, trackCcKind, trackScale,
    type CcMode, type CueSound, type LfoShape, type PatternId, type SeqCues, type SeqStep, type SeqTrack, type Sequence, type TrackKind,
} from '../sequence';
import { SequenceTimeline, type TimelineView } from './SequenceTimeline';
import { CC_COLOR, CONNECT_HINT, chanceLabel, dragWhat, kindOf, stepColor, trackColor, useStepDrag, type DragEdit, type StepRef } from './seqUi';
import { formatSeconds } from './format';
import {
    DEFAULT_DENSITY, DENSITY_LABELS, DENSITY_MAX, DENSITY_MIN, DRUM_GENRES, DRUM_PRESETS, DRUM_VOICES, EMPTY_PRESET, PRESET_BARS,
    matchSlices, presetById, presetHits, presetTracks, withPresetDensity,
} from '../drumPresets';

/**
 * The step sequencer: patterns A–D of 16 steps, a chain that plays them in
 * order, and up to 8 tracks of three kinds:
 *
 * - Slice: a slice from the pool, each step its own velocity and pitch (snapped
 *   to the scale when the track's Scale is on).
 * - Cue: a result or a pool file with cue points; each step's note picks a cue
 *   (C1 the first). The note doesn't repitch: it chooses the segment.
 * - CC: one of the Spotykach's MIDI CCs, a value per step, an LFO or drawn
 *   automation, sent over the Link to deck A or B.
 *
 * Click a step to switch it; drag it up or down for its velocity, pitch, cue,
 * CC value or chance; right-click (or long-press) it for its options. Under the
 * grid, the timeline (SequenceTimeline.tsx) shows the whole chain; on a phone
 * the two take turns. Lives in the browser: Render makes a result of the chain.
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
    /** Plays a sound id (a slice, or a cue's segment) at a shift, with a track's playback envelope. */
    onAudition: (soundId: string, shift: number, env?: SnippetEnvelope) => void;
    /** Open a slice in the editor; its save replaces the slice's sound everywhere. */
    onEditSlice: (sliceId: string) => void;
    /** A drum preset loaded with no slices to play: the synth makes one per voice; their ids, in voice order. */
    onDrumKit: () => Promise<(string | null)[]>;
    onRender: (cues: SeqCues, fold: boolean) => void;
    newId: () => string;
    /** Looping one pattern instead of the chain (a playback setting, not part of the sequence), or null. */
    loop: PatternId | null;
    onLoop: (pattern: PatternId | null) => void;
    /** Undo and redo of the station's edits (Ctrl+Z, Ctrl+Shift+Z or Ctrl+Y). */
    history: { undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean };
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

const LFO_RATES: { steps: number; label: string }[] = [
    { steps: 2, label: '1/8' }, { steps: 4, label: '1 beat' }, { steps: 8, label: '2 beats' },
    { steps: 16, label: '1 bar' }, { steps: 32, label: '2 bars' }, { steps: 64, label: '4 bars' },
];
const CHROMATIC = maskFromIntervals([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

const cueKey = (c: Pick<CueSound, 'kind' | 'id'>) => `${c.kind}:${c.id}`;
const CHANCES = [1, 0.75, 0.5, 0.25] as const;

export const SequencerStation: React.FC<SequencerStationProps> = ({
    seq, onChange, slices, available, cueSounds, playing, step, busy, onPlay, onStop, onAudition, onEditSlice, onDrumKit, onRender, newId, link, history, loop, onLoop,
}) => {
    // Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, unless a field is being typed in (it has its own undo).
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
            const el = e.target as HTMLElement | null;
            if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
            const key = e.key.toLowerCase();
            if (key === 'z' && !e.shiftKey) { e.preventDefault(); history.undo(); }
            else if ((key === 'z' && e.shiftKey) || key === 'y') { e.preventDefault(); history.redo(); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [history]);
    const [linkOpen, setLinkOpen] = useState(false);
    const linked = link.enabled && !!link.settings.outputId;
    const [edit, setEdit] = useState<PatternId>('A');
    const [cues, setCues] = useState<SeqCues>('hits');
    const [fold, setFold] = useState(true);
    const [menu, setMenu] = useState<(StepRef & { x: number; y: number }) | null>(null);
    /** A track's playback envelope, open in its popover. */
    const [envMenu, setEnvMenu] = useState<{ t: number; x: number; y: number } | null>(null);
    /** What dragging a step up and down sets: velocity, pitch (a cue on cue tracks) or chance. CC steps set the value for the first two. */
    const [dragEdits, setDragEdits] = useState<DragEdit>('velocity');
    /** The track the timeline's Notes, lane and Automation follow: the last one touched. */
    const [activeId, setActiveId] = useState<string | null>(null);
    const [view, setView] = useState<TimelineView>('steps');
    /** The chain position last picked in the timeline. */
    const [focus, setFocus] = useState(0);
    const [folded, setFolded] = useState(false);
    /** On a phone the pattern grid and the timeline take turns. */
    const [phoneView, setPhoneView] = useState<'pattern' | 'timeline'>('pattern');
    /** On a phone the header folds to the essentials (play, undo, the patterns) until opened. */
    const [headerOpen, setHeaderOpen] = useState(false);
    /** A group of header controls: a row of its own on a phone, items in the one row from md. */
    const group = 'flex flex-wrap items-center gap-x-3 gap-y-2 max-md:w-full max-md:border-t max-md:border-white/5 max-md:pt-2';
    const [presetsOpen, setPresetsOpen] = useState(false);
    const [density, setDensity] = useState(DEFAULT_DENSITY);
    /** The preset last loaded and its tracks (by voice), so density and the next preset carry on with them. */
    const [loaded, setLoaded] = useState<{ presetId: string; trackIds: string[] } | null>(null);
    const [kitBusy, setKitBusy] = useState(false);
    useEffect(() => {
        if (!menu) return;
        const close = () => setMenu(null);
        window.addEventListener('scroll', close, true);
        return () => window.removeEventListener('scroll', close, true);
    }, [menu]);

    const sliceById = new Map(slices.map(s => [s.id, s]));
    /** Outputs other than the Spotykach's, by name, for tracks that go to another device. */
    const otherOutputs = [...new Set(link.ports.outputs.filter(p => p.id !== link.settings.outputId).map(p => p.name))];
    const playable = (id: string | null | undefined) => {
        const s = id ? sliceById.get(id) : undefined;
        return !!s && available.has(s.sourceId);
    };
    const bars = seq.chain.length;
    const seconds = bars * (240 / seq.bpm);
    // The step under the playhead, when the chain is on the pattern being edited.
    const played = loop ? [loop] : seq.chain;
    const playingHere = step !== null && played[Math.floor(step / STEPS)] === edit ? step % STEPS : null;
    const inUse = patternsOf(seq);
    /** Edit a pattern; a loop follows it, so what you hear is what you edit. */
    const pick = (p: PatternId) => { setEdit(p); if (loop && loop !== p) onLoop(p); };
    // A pattern dropped from the end (or undone) is no longer editable: edit the last one left.
    if (!inUse.includes(edit)) setEdit(inUse[inUse.length - 1]);
    /** One more pattern, empty, and edit it. */
    const addPattern = () => {
        if (inUse.length >= PATTERNS.length) return;
        const p = PATTERNS[inUse.length];
        onChange(seq => ({ ...seq, patternCount: patternsOf(seq).length + 1 }));
        pick(p);
    };
    /** The last pattern goes (cleared, so adding it again starts empty); not while the chain plays it. */
    const last = inUse[inUse.length - 1];
    const lastInChain = seq.chain.includes(last);
    const removePattern = () => {
        if (inUse.length <= 1 || lastInChain) return;
        onChange(seq => ({
            ...seq,
            patternCount: patternsOf(seq).length - 1,
            tracks: seq.tracks.map(tr => withAuto({ ...tr, patterns: { ...tr.patterns, [last]: emptySteps() } }, last, null)),
        }));
        if (loop === last) onLoop(null);
    };
    const scale = seq.scale ?? { root: 0, mask: CHROMATIC };

    const setTrack = (t: number, patch: Partial<SeqTrack>) =>
        onChange(seq => ({ ...seq, tracks: seq.tracks.map((x, i) => (i === t ? { ...x, ...patch } : x)) }));
    const setStep = ({ pattern, t, i: s }: StepRef, patch: Partial<SeqStep>) => onChange(seq => ({
        ...seq,
        tracks: seq.tracks.map((x, i) => (i !== t ? x : {
            ...x,
            patterns: { ...x.patterns, [pattern]: x.patterns[pattern].map((st, k) => (k === s ? { ...st, ...patch } : st)) },
        })),
    }));
    const cells = useStepDrag(setStep, seq.scale ?? { root: 0, mask: CHROMATIC });
    const active = Math.max(0, seq.tracks.findIndex(tr => tr.id === activeId));
    const setCc = (t: number, patch: Partial<NonNullable<SeqTrack['cc']>>) =>
        onChange(seq => ({ ...seq, tracks: seq.tracks.map((x, i) => (i === t ? { ...x, cc: { ...(x.cc ?? defaultCc()), ...patch } } : x)) }));
    const used = (p: PatternId) => seq.tracks.some(t => t.patterns[p].some(s => s.on) || !!t.cc?.auto?.[p]);
    /** A CC track's automation for pattern `to`: a copy of `from`'s (nothing when it has none). */
    const withAuto = (tr: SeqTrack, to: PatternId, from: PatternId | null): SeqTrack => {
        if (!tr.cc?.auto) return tr;
        const src = from ? tr.cc.auto[from] : undefined;
        return { ...tr, cc: { ...tr.cc, auto: { ...tr.cc.auto, [to]: src?.map(pt => ({ ...pt })) } } };
    };
    const clearPattern = (p: PatternId) => onChange(seq => ({
        ...seq, tracks: seq.tracks.map(tr => withAuto({ ...tr, patterns: { ...tr.patterns, [p]: emptySteps() } }, p, null)),
    }));
    const copyPattern = (from: PatternId, to: PatternId) => onChange(seq => ({
        ...seq, tracks: seq.tracks.map(tr => withAuto({ ...tr, patterns: { ...tr.patterns, [to]: tr.patterns[from].map(s => ({ ...s })) } }, to, from)),
    }));
    /** Open the timeline on a track's automation (on a phone, switch to it). */
    const editAutomation = (t: number) => { setActiveId(seq.tracks[t]?.id ?? null); setView('auto'); setFolded(false); setPhoneView('timeline'); };

    /** A slice for a track: the class it already has, or any. */
    const rollSlice = (current: string | null) => {
        const cls = current ? sliceById.get(current)?.cls : undefined;
        const pool = slices.filter(s => available.has(s.sourceId) && (!cls || s.cls === cls));
        return pickAny(pool)?.id ?? current;
    };
    /** Dice for one track's steps, after its kind: slice (by class), cue (random cues), CC (values, a new LFO, new automation). */
    const rollFor = (tr: SeqTrack): SeqTrack => {
        const kind = kindOf(tr);
        if (kind === 'cc') {
            const cc = tr.cc ?? defaultCc();
            if (cc.mode === 'lfo') return { ...tr, cc: { ...cc, lfo: rollLfo() } };
            if (cc.mode === 'auto') return { ...tr, cc: { ...cc, auto: { ...cc.auto, [edit]: rollAutomation() } } };
            return { ...tr, patterns: { ...tr.patterns, [edit]: rollCcSteps() } };
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

    /**
     * A drum preset: seven tracks over patterns A–D, chained A B C D (CC tracks
     * stay, as room allows). Slices: those of the preset loaded before (still
     * there), or ones from the pool that fit; an empty pool gets a synth kit.
     */
    const loadPreset = async (presetId: string, kit?: (string | null)[]) => {
        const preset = presetById(presetId);
        if (!preset || (kitBusy && !kit)) return;
        const before = loaded ? loaded.trackIds.map(id => seq.tracks.find(tr => tr.id === id)) : [];
        const pool = slices.filter(s => available.has(s.sourceId));
        let matched: (string | null)[];
        if (kit) matched = kit;
        else if (pool.length) matched = matchSlices(pool);
        else {
            setKitBusy(true);
            try { matched = await onDrumKit(); } finally { setKitBusy(false); }
        }
        const tracks = presetTracks(preset, density, newId, v => {
            const kept = before[v]?.sliceId;
            return !kit && kept && playable(kept) ? kept : matched[v] ?? null;
        });
        onChange(seq => ({
            ...seq,
            patternCount: Math.max(PRESET_BARS, patternsOf(seq).length),
            chain: PATTERNS.slice(0, Math.min(PRESET_BARS, maxChain(seq.bpm))),
            tracks: [...tracks, ...seq.tracks.filter(tr => kindOf(tr) === 'cc')].slice(0, MAX_TRACKS),
        }));
        setLoaded({ presetId, trackIds: tracks.map(tr => tr.id) });
        pick('A');
    };
    const loadedPreset = loaded && seq.tracks.some(tr => loaded.trackIds.includes(tr.id))
        ? presetById(loaded.presetId) ?? null : null;
    /** Density: which weights play; redrawn live over the loaded preset's tracks (patterns A–D). Not over the empty one: nothing to redraw, only what was programmed. */
    const changeDensity = (d: number) => {
        setDensity(d);
        if (!loaded || !loadedPreset || loadedPreset === EMPTY_PRESET) return;
        onChange(seq => ({
            ...seq,
            tracks: seq.tracks.map(tr => {
                const v = loaded.trackIds.indexOf(tr.id);
                return v < 0 ? tr : withPresetDensity(tr, loadedPreset, v, d);
            }),
        }));
    };
    /**
     * A fresh synth kit, a sound per voice: onto the loaded preset's tracks
     * (their steps stay), or with none loaded, onto the empty one.
     */
    const newKit = async () => {
        if (kitBusy) return;
        setKitBusy(true);
        let kit: (string | null)[];
        try { kit = await onDrumKit(); } finally { setKitBusy(false); }
        if (!kit.some(Boolean)) return;
        if (!loaded || !loadedPreset) { await loadPreset(EMPTY_PRESET.id, kit); return; }
        onChange(seq => ({
            ...seq,
            tracks: seq.tracks.map(tr => {
                const id = kit[loaded.trackIds.indexOf(tr.id)];
                return id ? { ...tr, sliceId: id } : tr;
            }),
        }));
    };

    const changeKind = (t: number, kind: TrackKind) => onChange(seq => ({
        ...seq,
        tracks: seq.tracks.map((tr, i) => {
            if (i !== t) return tr;
            if (kind === 'cc') return { ...tr, kind, cc: tr.cc ?? defaultCc(), midi: tr.port ? tr.midi : tr.midi ?? 'A' };
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
        <div className="h-full min-h-0 flex flex-col" onClick={() => { setMenu(null); setEnvMenu(null); }}>
            {/*
              * The header. Always: transport, the pattern being edited and its loop. The rest
              * comes in groups; on a phone they fold away under More, a row each when open,
              * and from md they all flow in one wrapping row.
              */}
            <div className="shrink-0 flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 md:py-3 border-b border-white/10 text-[11px] text-gray-400">
                <div className="flex items-center gap-2 min-w-0 max-md:w-full">
                    <button onClick={() => (playing ? onStop() : onPlay())}
                        title={playing ? 'Stop' : link.settings.follow && link.enabled ? 'Arm: the incoming clock plays it (Start, or just ticks)' : 'Play the chain, looping'}
                        className={`h-9 w-9 shrink-0 flex items-center justify-center rounded-full transition-colors
                            ${playing ? 'bg-synthux-red text-white' : 'bg-white/10 hover:bg-white/20 text-white'}`}>
                        {playing ? <Square size={13} fill="currentColor" /> : <Play size={15} className="ml-0.5" />}
                    </button>
                    <span className="shrink-0 flex rounded-md border border-white/10 overflow-hidden">
                        <button onClick={history.undo} disabled={!history.canUndo} title="Undo (Ctrl+Z): the last change, a dice roll too" aria-label="Undo"
                            className="px-2 py-1.5 hover:text-white hover:bg-white/5 disabled:opacity-30"><Undo2 size={13} /></button>
                        <button onClick={history.redo} disabled={!history.canRedo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo"
                            className="px-2 py-1.5 border-l border-white/10 hover:text-white hover:bg-white/5 disabled:opacity-30"><Redo2 size={13} /></button>
                    </span>
                    <span className="min-w-0 flex flex-wrap items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.02] px-1.5 py-1">
                        <span className="hidden md:inline pl-0.5">Pattern</span>
                        <span className="flex flex-wrap rounded-md border border-white/10 overflow-hidden">
                            {inUse.map(p => (
                                <button key={p} onClick={() => pick(p)} title={`Edit pattern ${p}`}
                                    className={`relative ${inUse.length > 8 ? 'px-1.5' : 'px-2.5'} py-1 font-bold transition-colors
                                        ${edit === p ? 'bg-synthux-red/80 text-white' : 'hover:text-white hover:bg-white/5'}`}>
                                    {p}
                                    {used(p) && <span className="absolute top-0.5 right-0.5 h-1 w-1 rounded-full bg-current" />}
                                </button>
                            ))}
                        </span>
                        <button onClick={() => onLoop(loop ? null : edit)} aria-pressed={!!loop}
                            title={loop ? `Looping pattern ${loop}: click to play the chain again` : `Loop pattern ${edit} instead of the chain (it follows the pattern you edit)`}
                            className={`flex items-center gap-1 px-2 py-1 rounded border ${loop ? 'border-synthux-green/60 text-synthux-green bg-synthux-green/10' : 'border-white/10 hover:text-white hover:bg-white/5'}`}>
                            <Repeat size={11} /> <span className="hidden md:inline">Loop</span>{loop ? ` ${loop}` : ''}
                        </button>
                    </span>
                    {/* A phone: the rest folds away; this stays in the same corner, open or folded. */}
                    <button onClick={() => setHeaderOpen(o => !o)} aria-expanded={headerOpen}
                        title={headerOpen ? 'Fold the header to play, undo and the patterns' : 'Pattern tools, tempo, volume, swing, scale, presets, the Link, render…'}
                        className={`md:hidden ml-auto shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-md border font-bold transition-colors
                            ${headerOpen ? 'border-synthux-red/60 bg-synthux-red/10 text-white' : 'border-white/10 hover:text-white hover:bg-white/5'}`}>
                        {headerOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />} {headerOpen ? 'Less' : 'More'}
                    </button>
                </div>

                {/* md:contents: from md these groups are items of the row above; on a phone, a column under it. */}
                <div className={`${headerOpen ? 'flex' : 'hidden'} md:contents w-full flex-col gap-2`}>
                    {/* What can be done to the pattern being edited. */}
                    <span className={`${group} gap-x-1.5`} title={`Pattern ${edit}: add or remove patterns, roll, clear, copy`}>
                        <span className="flex">
                            <button onClick={addPattern} disabled={inUse.length >= PATTERNS.length}
                                title={inUse.length >= PATTERNS.length ? `At most ${PATTERNS.length} patterns` : `Add pattern ${PATTERNS[inUse.length]} (empty) and edit it`}
                                aria-label="Add a pattern"
                                className="px-1.5 py-1 rounded-l border border-white/10 hover:text-white hover:bg-white/5 disabled:opacity-30"><Plus size={12} /></button>
                            <button onClick={removePattern} disabled={inUse.length <= 1 || lastInChain}
                                title={lastInChain ? `Pattern ${last} is in the chain: take it out there first` : `Remove pattern ${last} (its steps and automation are cleared)`}
                                aria-label="Remove the last pattern"
                                className="px-1.5 py-1 rounded-r border border-l-0 border-white/10 hover:text-white hover:bg-white/5 disabled:opacity-30"><Minus size={12} /></button>
                        </span>
                        <button onClick={rollPattern}
                            title={`Dice: a new pattern ${edit} on every track that has something to play (CC LFOs get a new LFO, automation new points)`}
                            className="flex items-center gap-1 px-2 py-1 rounded border border-white/10 hover:text-synthux-red hover:bg-white/5">
                            <Dices size={11} /> Roll
                        </button>
                        <button onClick={() => clearPattern(edit)} title={`Clear pattern ${edit}: every track's steps and automation`}
                            className="flex items-center gap-1 px-2 py-1 rounded border border-white/10 hover:text-white hover:bg-white/5">
                            <Eraser size={11} /> Clear
                        </button>
                        <span className="flex items-center gap-1" title={`Copy pattern ${edit} (steps and automation) over another`}>
                            <Copy size={11} /> to
                            {inUse.length <= 4 ? inUse.filter(p => p !== edit).map(p => (
                                <button key={p} onClick={() => copyPattern(edit, p)}
                                    className="w-6 py-0.5 rounded border border-white/10 font-bold hover:text-white hover:bg-white/5">{p}</button>
                            )) : (
                                <select value="" aria-label={`Copy pattern ${edit} to`} className={select}
                                    onChange={e => { if (e.target.value) copyPattern(edit, e.target.value as PatternId); }}>
                                    <option value="">…</option>
                                    {inUse.filter(p => p !== edit).map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                            )}
                        </span>
                    </span>

                    {/* Tempo, main volume, swing: fields to drag (or tap to type), no sliders. */}
                    <span className={group}>
                        <label className="flex items-center gap-1.5">
                            Tempo
                            <ScrubNumber value={seq.bpm} min={40} max={240} step={0.5} unit="bpm" width="w-[5.5rem]" ariaLabel="Tempo"
                                onChange={v => onChange(seq => ({ ...seq, bpm: v, chain: seq.chain.slice(0, maxChain(v)) }))} />
                        </label>
                        <label className="flex items-center gap-1.5" title="Main volume: every track, live and in the render (the limiter keeps the render under −1 dBFS)">
                            Vol
                            <ScrubNumber value={seq.masterDb ?? 0} min={MASTER_MIN_DB} max={MASTER_MAX_DB} step={0.5} unit="dB" width="w-[4.75rem]" ariaLabel="Main volume in dB"
                                onChange={v => onChange(seq => ({ ...seq, masterDb: v || undefined }))} />
                        </label>
                        <label className="flex items-center gap-1.5" title="How late every second sixteenth comes">
                            Swing
                            <ScrubNumber value={Math.round(seq.swing * 100)} min={0} max={50} step={1} unit="%" width="w-[4rem]" ariaLabel="Swing"
                                onChange={v => onChange(seq => ({ ...seq, swing: v / 100 }))} />
                        </label>
                    </span>

                    {/* How the steps are edited. */}
                    <span className={group}>
                        <span className="flex items-center gap-1.5" title="What dragging a step up or down sets. On cue tracks Pitch picks the cue; CC steps set their value unless it is Chance">
                            Drag
                            <span className="flex rounded-md border border-white/10 overflow-hidden">
                                {(['velocity', 'pitch', 'chance'] as const).map(m => (
                                    <button key={m} onClick={() => setDragEdits(m)}
                                        className={`px-2 py-1 transition-colors ${dragEdits === m ? 'bg-synthux-red/80 text-white' : 'hover:text-white hover:bg-white/5'}`}>
                                        {m === 'velocity' ? 'Velocity' : m === 'pitch' ? 'Pitch' : 'Chance'}
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
                            <select value={scaleName(scale.mask) ?? ''} aria-label="Scale" className={`${select} max-w-[9rem]`}
                                onChange={e => {
                                    const preset = SCALES.find(sc => sc.name === e.target.value);
                                    if (preset) onChange(seq => ({ ...seq, scale: { root: seq.scale?.root ?? 0, mask: maskFromIntervals(preset.intervals) } }));
                                }}>
                                {scaleName(scale.mask) === null && <option value="">Custom</option>}
                                {SCALES.map(sc => <option key={sc.name} value={sc.name}>{sc.name}</option>)}
                            </select>
                        </span>
                    </span>

                    {/* Where it comes from and where it goes: presets, the Link, the render. */}
                    <span className={`${group} md:ml-auto`}>
                        <button onClick={e => { e.stopPropagation(); setPresetsOpen(o => !o); }} aria-expanded={presetsOpen}
                            title="Drum presets: TouchPlaited's patterns, with a density control. With an empty slice pool the synth makes the kit"
                            className={`flex items-center gap-1.5 px-2 py-1 rounded border transition-colors
                                ${presetsOpen ? 'border-synthux-red/60 text-white' : 'border-white/10 hover:text-white hover:bg-white/5'}`}>
                            <ListMusic size={12} /> Presets
                        </button>
                        <button onClick={e => { e.stopPropagation(); setLinkOpen(o => !o); }}
                            title="Link to a Spotykach over MIDI: clock, Start / Stop, notes for its decks, and CC tracks"
                            className={`flex items-center gap-1.5 px-2 py-1 rounded border transition-colors
                                ${linked ? 'border-synthux-green/50 text-synthux-green' : 'border-white/10 hover:text-white hover:bg-white/5'}`}>
                            <Cable size={12} /> Link
                            {link.following && <span className="font-mono text-[10px]">{link.tempo ? `${link.tempo} bpm` : 'waiting'}</span>}
                        </button>
                        <span className="flex items-center gap-2 max-md:w-full">
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
                                title={`Render the whole chain (${bars} bar${bars === 1 ? '' : 's'}, ${formatSeconds(seconds)}) as a result (Mangle › Results). MIDI-only steps and CC tracks are not in it`}
                                className="max-md:ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold bg-synthux-red text-white hover:bg-synthux-red/80 disabled:opacity-40">
                                <Music size={12} /> Render
                                <span className="font-normal opacity-80">· {bars} bar{bars === 1 ? '' : 's'}</span>
                            </button>
                        </span>
                    </span>
                </div>
            </div>

            {presetsOpen && (
                <PresetPanel density={density} onDensity={changeDensity} loaded={loadedPreset?.id ?? null} busy={kitBusy}
                    emptyPool={!slices.some(s => available.has(s.sourceId))}
                    onLoad={id => { void loadPreset(id); }} onNewKit={() => { void newKit(); }} onClose={() => setPresetsOpen(false)} />
            )}
            {linkOpen && <LinkPanel link={link} onClose={() => setLinkOpen(false)} />}

            {/* A phone has room for one: the pattern grid or the timeline. */}
            <div className="md:hidden shrink-0 flex px-4 pt-2 text-[11px]">
                <span className="flex flex-1 rounded-md border border-white/10 overflow-hidden">
                    {(['pattern', 'timeline'] as const).map(v => (
                        <button key={v} onClick={() => setPhoneView(v)}
                            className={`flex-1 px-2 py-1.5 ${phoneView === v ? 'bg-synthux-red/80 text-white' : 'text-gray-400 hover:text-white'}`}>
                            {v === 'pattern' ? `Pattern ${edit}` : 'Timeline'}
                        </button>
                    ))}
                </span>
            </div>

            {/* Tracks */}
            {/* overscroll-contain: a swipe down over the steps at the top doesn't reload the page. */}
            <div className={`flex-1 min-h-0 overflow-y-auto overscroll-y-contain p-4 space-y-2 ${phoneView === 'timeline' ? 'hidden md:block' : ''}`}>
                {slices.length === 0 && cueSounds.length === 0 && (
                    <p className="text-[11px] text-gray-500">
                        Slice tracks play slices (Slices, or <em>To slices</em> from the hits or a result&apos;s snippets); cue tracks play a result
                        or a file with cue points. CC tracks need neither: they drive a Spotykach over the Link.
                    </p>
                )}
                {seq.tracks.map((track, t) => {
                    const kind = kindOf(track);
                    const color = trackColor(track, sliceById);
                    const cc = track.cc ?? defaultCc();
                    const ccKind = trackCcKind(track);
                    const auditionId = kind === 'cue' ? (track.cue ? cueSoundId(track.cue, 0) : null) : kind === 'slice' ? track.sliceId : null;
                    return (
                        <div key={track.id} onPointerDownCapture={() => { if (activeId !== track.id) setActiveId(track.id); }}
                            className={`flex flex-wrap lg:flex-nowrap items-center gap-2 rounded-lg border bg-white/[0.02] p-2
                                ${t === active ? 'border-white/20' : 'border-white/5'}`}>
                            <div className="flex flex-col gap-1 min-w-0 w-full lg:w-[22rem] shrink-0">
                                <div className="flex items-center gap-1 min-w-0">
                                <button onClick={() => auditionId && onAudition(auditionId, kind === 'slice' ? track.shift : 0, track.env)}
                                    disabled={!auditionId || (kind === 'slice' && !playable(track.sliceId))}
                                    title={kind === 'cue' ? 'Hear the first cue' : 'Hear the track\'s slice'}
                                    className="h-7 w-7 shrink-0 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30">
                                    <Play size={11} className="ml-px" />
                                </button>
                                <input value={track.name} onChange={e => setTrack(t, { name: e.target.value })} aria-label="Track name"
                                    onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur(); }}
                                    placeholder={`Track ${t + 1}`} maxLength={24} title="The track's name: click to rename"
                                    className="w-24 min-w-0 shrink bg-transparent border border-transparent hover:border-white/10 focus:border-white/20 text-[11px] font-bold
                                        text-gray-200 placeholder:text-gray-600 focus:outline-none focus:bg-black/40 rounded px-1 py-0.5" />
                                <select value={kind} onChange={e => changeKind(t, e.target.value as TrackKind)} aria-label="Track kind"
                                    title="Slice: a slice from the pool. Cue: a sample's cue points, one per step. CC: a Spotykach control over the Link"
                                    className={`${select} w-14 font-bold`} style={{ color }}>
                                    <option value="slice">Slice</option>
                                    <option value="cue">Cue</option>
                                    <option value="cc">CC</option>
                                </select>
                                <span className="ml-auto" />
                                <select value={track.port ? `port:${track.port.name}` : track.midi ?? ''}
                                    onChange={e => {
                                        const v = e.target.value;
                                        if (v.startsWith('port:')) setTrack(t, { port: { name: v.slice(5), channel: track.port?.channel ?? 1 }, midi: undefined });
                                        else setTrack(t, { port: undefined, midi: (v || (kind === 'cc' ? 'A' : undefined)) as 'A' | 'B' | undefined });
                                    }}
                                    title={kind === 'cc' ? 'Where this CC goes: a Spotykach deck (its channel), or another MIDI device'
                                        : 'Send this track\'s steps as MIDI notes (over the Link): to a Spotykach deck, or another MIDI device'}
                                    aria-label="MIDI destination"
                                    className={`${track.port ? 'w-24 truncate' : 'w-12'} bg-black/40 border rounded px-0.5 py-1 text-[10px] font-bold
                                        ${track.midi || track.port ? 'border-synthux-green/50 text-synthux-green' : 'border-white/10 text-gray-500'}`}>
                                    {kind !== 'cc' && <option value="">SK –</option>}
                                    <option value="A">SK A</option>
                                    <option value="B">SK B</option>
                                    <optgroup label={otherOutputs.length || track.port ? 'Other MIDI devices' : 'Other devices: connect MIDI (Link)'}>
                                        {track.port && !otherOutputs.includes(track.port.name) && (
                                            <option value={`port:${track.port.name}`}>{track.port.name} (not connected)</option>
                                        )}
                                        {otherOutputs.map(name => <option key={name} value={`port:${name}`}>{name}</option>)}
                                    </optgroup>
                                </select>
                                {track.port && (
                                    <select value={track.port.channel} aria-label="MIDI channel" title="The device's MIDI channel"
                                        onChange={e => setTrack(t, { port: { ...track.port!, channel: Number(e.target.value) } })}
                                        className="w-14 bg-black/40 border border-synthux-green/50 rounded px-0.5 py-1 text-[10px] font-bold text-synthux-green">
                                        {Array.from({ length: 16 }, (_, i) => <option key={i} value={i + 1}>ch {i + 1}</option>)}
                                    </select>
                                )}
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
                                    <button onClick={() => track.sliceId && onEditSlice(track.sliceId)} disabled={!playable(track.sliceId)}
                                        title="Open the track's slice in the editor: its save replaces the slice's sound (everywhere it plays)"
                                        aria-label="Edit the slice" className={`${iconButton} disabled:opacity-30`}><Pencil size={12} /></button>
                                    <button onClick={() => onChange(seq => ({
                                        ...seq,
                                        tracks: seq.tracks.map((tr, i) => (i !== t ? tr : tr.scaleLock ? { ...tr, scaleLock: undefined } : lockToScale(tr, trackScale(seq, tr)))),
                                    }))} aria-pressed={!!track.scaleLock}
                                        title={`Scale: lock this track's step pitches to ${NOTE_NAMES[trackScale(seq, track).root]} ${scaleName(trackScale(seq, track).mask) ?? 'custom'}`
                                            + `${track.scale ? ' (its own scale)' : ''}; notes outside it move to the nearest scale note`}
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
                                    {track.port ? (
                                        <span className="flex items-center gap-1 min-w-0 flex-1 text-[10px] text-gray-400" title="Any CC number, 0–127: see the device's MIDI chart">
                                            CC
                                            <ScrubNumber value={cc.cc} min={0} max={127} step={1} width="w-[4.2rem]" ariaLabel="CC number"
                                                onChange={v => setCc(t, { cc: v })} />
                                        </span>
                                    ) : (
                                        <select value={cc.cc} aria-label="CC" className={`${select} min-w-0 flex-1`}
                                            onChange={e => setCc(t, { cc: Number(e.target.value) })}>
                                            {!SK_CCS.some(c => c.cc === cc.cc) && <option value={cc.cc}>CC {cc.cc}</option>}
                                            {(['value', 'momentary', 'toggle'] as const).map(k => (
                                                <optgroup key={k} label={k === 'value' ? 'Values' : k === 'momentary' ? 'On while held' : 'Toggles (a tap)'}>
                                                    {SK_CCS.filter(c => c.kind === k).map(c => <option key={c.cc} value={c.cc}>{c.cc} {c.name}</option>)}
                                                </optgroup>
                                            ))}
                                        </select>
                                    )}
                                    <span className="flex rounded border border-white/10 overflow-hidden text-[10px]">
                                        {(['steps', 'lfo', 'auto'] as const).map((m: CcMode) => (
                                            <button key={m} onClick={() => setCc(t, { mode: m })} disabled={m !== 'steps' && ccKind !== 'value'}
                                                title={m === 'lfo' ? 'An LFO over the chain (value CCs only)'
                                                    : m === 'auto' ? 'Automation drawn per pattern, in the timeline (value CCs only)' : 'A value per step'}
                                                className={`px-1.5 py-0.5 disabled:opacity-30 ${cc.mode === m ? 'bg-synthux-red/80 text-white' : 'text-gray-400 hover:text-white'}`}>
                                                {m === 'lfo' ? 'LFO' : m === 'auto' ? 'Auto' : 'Steps'}
                                            </button>
                                        ))}
                                    </span>
                                </>}

                                {kind !== 'cc' && (
                                    <button onClick={e => { e.stopPropagation(); setMenu(null); setEnvMenu(m => (m?.t === t ? null : { t, x: e.clientX, y: e.clientY })); }}
                                        aria-pressed={!!track.env}
                                        title={track.env
                                            ? `Playback envelope: attack ${Math.round(track.env.attackMs)} ms, decay ${Math.round(track.env.decayMs)} ms (${track.env.curve}). The slice stays as it is`
                                            : 'Playback envelope (attack, decay) for this track, on top of the sound; the slice stays as it is'}
                                        className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${track.env ? 'border-synthux-orange/60 text-synthux-orange' : 'border-white/10 text-gray-500 hover:text-white'}`}>
                                        AD
                                    </button>
                                )}
                                <button onClick={() => rollTrack(t)}
                                    title={kind === 'cc' ? (cc.mode === 'lfo' ? 'Dice: a new LFO' : `Dice: new values for pattern ${edit}`)
                                        : kind === 'cue' ? `Dice: a new pattern ${edit} of random cues` : `Dice: a new pattern ${edit} for this track, after its slice (kicks on the beat, hats busier)`}
                                    aria-label="Roll the track's steps" className={iconButton}><Dices size={12} className="rotate-45" /></button>
                                </div>
                            </div>

                            {kind === 'cc' && cc.mode === 'lfo' ? (
                                <LfoEditor lfo={cc.lfo} onChange={lfo => setCc(t, { lfo })} />
                            ) : kind === 'cc' && cc.mode === 'auto' ? (
                                <AutoPreview
                                    valueAt={pos => (cc.connect && seq.chain.includes(edit)
                                        ? trackAutoAt(seq, track, seq.chain.indexOf(edit) * STEPS + pos)
                                        : autoAt(cc.auto?.[edit], pos, cc.smooth))}
                                    has={!!cc.auto?.[edit]?.length || (!!cc.connect && Object.values(cc.auto ?? {}).some(p => p?.length))}
                                    smooth={cc.smooth} connect={cc.connect} pattern={edit} playing={playingHere}
                                    onEdit={() => editAutomation(t)}
                                    onSmooth={() => setCc(t, { smooth: !cc.smooth || undefined })}
                                    onConnect={() => setCc(t, { connect: !cc.connect || undefined })} />
                            ) : (
                                <div className="grid grid-cols-16 gap-0.5 flex-1 min-w-[16rem]">
                                    {track.patterns[edit].map((s, i) => {
                                        const lockedSlice = s.sliceId ? sliceById.get(s.sliceId) : undefined;
                                        const cueIndex = (s.note ?? CUE_BASE_NOTE) - CUE_BASE_NOTE;
                                        const fill = kind === 'cc' && ccKind !== 'value' ? 1 : s.velocity;
                                        // What the step's label says: its chance while dragging chance, else a pitch, a cue, a CC value.
                                        const label = !s.on ? '' : dragEdits === 'chance' ? chanceLabel(s)
                                            : kind === 'cue' ? String(cueIndex + 1)
                                                : kind === 'cc' ? (ccKind === 'value' ? String(Math.round(s.velocity * 127)) : '')
                                                    : s.shift ? `${s.shift > 0 ? '+' : ''}${s.shift}` : '';
                                        const what = dragWhat(track, dragEdits);
                                        const key = `${t}:${i}`;
                                        return (
                                            <button key={i}
                                                {...cells.handlers(key, { pattern: edit, t, i }, track, s, what)}
                                                onClick={e => e.stopPropagation()}
                                                onContextMenu={e => {
                                                    // A long press on a phone: the menu, not a toggle on release.
                                                    e.preventDefault(); e.stopPropagation(); cells.cancel();
                                                    setMenu({ pattern: edit, t, i, x: e.clientX, y: e.clientY });
                                                }}
                                                title={s.on
                                                    ? `${kind === 'cc' ? `Value ${Math.round(s.velocity * 127)}` : `Velocity ${Math.round(s.velocity * 100)}%`}`
                                                    + (kind === 'cue' ? ` · cue ${cueIndex + 1} (${noteName(s.note ?? CUE_BASE_NOTE)})` : '')
                                                    + (kind === 'slice' && s.shift ? ` · ${s.shift > 0 ? '+' : ''}${s.shift} st` : '')
                                                    + (chanceLabel(s) ? ` · ${chanceLabel(s)} chance` : '')
                                                    + (lockedSlice ? ` · ${lockedSlice.name}` : '')
                                                    + `. Drag up or down for its ${what}; right-click for more`
                                                    : `Click to switch on, or drag to set its ${what}`}
                                                aria-pressed={s.on}
                                                className={`relative h-8 rounded-sm border overflow-hidden touch-pan-y select-none [-webkit-touch-callout:none] transition-colors
                                                    ${i % 4 === 0 ? 'border-white/20' : 'border-white/5'}
                                                    ${playingHere === i ? 'ring-1 ring-white' : ''}
                                                    ${s.on ? 'bg-white/[0.08]' : 'bg-white/[0.04] hover:bg-white/10'}`}>
                                                {/* Velocity (or the CC value) as the fill height, chance as how solid it is, so both read at a glance. */}
                                                {s.on && <span className="absolute inset-x-0 bottom-0"
                                                    style={{ height: `${Math.round(fill * 100)}%`, background: stepColor(s, color, sliceById), opacity: 0.3 + 0.7 * (s.chance ?? 1) }} />}
                                                {s.on && chanceLabel(s) && (
                                                    <span className="absolute right-0 top-0 h-0 w-0 border-l-[5px] border-l-transparent border-t-[5px] border-t-white/70" />
                                                )}
                                                {label && (
                                                    <span className="absolute inset-x-0 top-0 text-[8px] leading-tight font-mono font-bold text-white mix-blend-difference">{label}</span>
                                                )}
                                                {lockedSlice && <span className="absolute inset-x-0 bottom-0.5 mx-auto h-1 w-1 rounded-full bg-black/70" />}
                                                {cells.label?.key === key && (
                                                    <span className="absolute left-1/2 -translate-x-1/2 -top-0.5 px-1 rounded bg-black text-[9px] font-mono text-white whitespace-nowrap z-10">
                                                        {cells.label.text}
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
                    <span className="ml-auto text-gray-500 pointer-coarse:hidden">Click a step to switch it · drag it up or down · right-click for its options</span>
                    <span className="ml-auto text-gray-500 hidden pointer-coarse:inline">Tap a step to switch it · hold it a moment, then drag up or down · long-press for its options · swipe to scroll</span>
                </div>
            </div>

            <SequenceTimeline
                seq={seq} onChange={onChange} setStep={setStep} sliceById={sliceById}
                edit={edit} focus={focus} loop={loop}
                onPick={ci => { setFocus(ci); const p = seq.chain[ci]; if (p) pick(p); }}
                active={active} onActive={t => setActiveId(seq.tracks[t]?.id ?? null)}
                view={view} onView={setView}
                step={step} dragEdit={dragEdits} scale={scale}
                onMenu={(ref, x, y) => setMenu({ ...ref, x, y })}
                onPreview={(ti, v) => {
                    const tr = seq.tracks[ti];
                    if (tr?.kind === 'cue') { if (tr.cue && v < tr.cue.cues.length) onAudition(cueSoundId(tr.cue, v), 0, tr.env); }
                    else if (tr && playable(tr.sliceId)) onAudition(tr.sliceId!, tr.shift + v, tr.env);
                }}
                folded={folded} onFold={setFolded}
                // Docked (tablet and up) at the height the timeline keeps itself (--tl-h); on a phone it takes the screen.
                className={`${phoneView === 'timeline' ? 'flex flex-1' : 'hidden md:flex'} md:flex-none md:h-[var(--tl-h)] md:max-h-[85vh]`}
            />

            {menu && (() => {
                const track = seq.tracks[menu.t];
                const s = track?.patterns[menu.pattern][menu.i];
                if (!track || !s) return null;
                return (
                    <StepMenu
                        x={menu.x} y={menu.y} track={track} step={s} index={menu.i} pattern={menu.pattern} scale={scale} sliceOptions={sliceOptions}
                        onChange={patch => setStep(menu, patch)}
                        onAudition={onAudition}
                        onClose={() => setMenu(null)}
                    />
                );
            })()}

            {envMenu && seq.tracks[envMenu.t] && (() => {
                const t = envMenu.t;
                const track = seq.tracks[t];
                const soundId = kindOf(track) === 'cue' ? (track.cue ? cueSoundId(track.cue, 0) : null) : playable(track.sliceId) ? track.sliceId : null;
                return (
                    <EnvMenu x={envMenu.x} y={envMenu.y} name={track.name} env={track.env}
                        onChange={env => setTrack(t, { env })}
                        onPlay={soundId ? env => onAudition(soundId, kindOf(track) === 'slice' ? track.shift : 0, env) : undefined}
                        onEditSlice={kindOf(track) === 'slice' && track.sliceId && playable(track.sliceId) ? () => { setEnvMenu(null); onEditSlice(track.sliceId!); } : undefined}
                        onClose={() => setEnvMenu(null)} />
                );
            })()}
        </div>
    );
};

// ---------------------------------------------------------------------------
// Playback envelope
// ---------------------------------------------------------------------------

const DEFAULT_ENV: SnippetEnvelope = { attackMs: 2, decayMs: 300, curve: 'exp' };

/** An envelope's gain, 0–1, `ms` after the start (as applyEnvelope shapes it). */
const envGain = (env: SnippetEnvelope, ms: number) => {
    if (ms < env.attackMs) {
        const u = ms / Math.max(1e-6, env.attackMs);
        return env.curve === 'exp' ? (1 - Math.exp(-5 * u)) / (1 - Math.exp(-5)) : u;
    }
    const d = (ms - env.attackMs) / Math.max(1, env.decayMs);
    return env.curve === 'exp' ? Math.pow(10, -3 * d) : Math.max(0, 1 - d);
};

/**
 * A track's playback envelope: attack and decay on top of the sound when it is
 * rendered to play (live, in the render, auditions). The slice itself is not
 * changed; to change its audio, open it in the editor.
 */
const EnvMenu: React.FC<{
    x: number; y: number; name: string; env: SnippetEnvelope | undefined;
    onChange: (env: SnippetEnvelope | undefined) => void;
    onPlay?: (env: SnippetEnvelope | undefined) => void;
    onEditSlice?: () => void;
    onClose: () => void;
}> = ({ x, y, name, env, onChange, onPlay, onEditSlice, onClose }) => {
    const span = env ? env.attackMs + env.decayMs * 1.15 : 1;
    const shape = env
        ? Array.from({ length: 81 }, (_, j) => `${(j / 80) * 100},${30 - envGain(env, (j / 80) * span) * 27 - 1.5}`).join(' ')
        : '';
    const row = 'flex items-center justify-between gap-2';
    return createPortal(
        <div className="fixed z-[200] w-72 max-w-[calc(100vw-16px)] rounded-lg border border-white/15 bg-synthux-panel shadow-2xl p-2.5 space-y-2 text-[11px] text-gray-300"
            // Inline: a page-wide rule makes body's children position: relative, which beats the class.
            style={{ position: 'fixed', left: Math.max(8, Math.min(x, window.innerWidth - 296)), top: Math.max(8, Math.min(y, window.innerHeight - 300)) }}
            onClick={e => e.stopPropagation()} onContextMenu={e => e.preventDefault()}>
            <div className="flex items-center justify-between">
                <span className="font-bold text-gray-100">{name} · playback envelope</span>
                <button onClick={onClose} className="text-gray-500 hover:text-white" aria-label="Close"><X size={12} /></button>
            </div>
            <label className={`${row} cursor-pointer`}>
                <span>Envelope</span>
                <input type="checkbox" checked={!!env} onChange={e => onChange(e.target.checked ? DEFAULT_ENV : undefined)} className="accent-synthux-red h-3.5 w-3.5" />
            </label>
            {env && <>
                <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-12 w-full rounded-sm bg-white/[0.04]" aria-hidden>
                    <polyline points={shape} fill="none" stroke="#f58b44" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
                    <line x1={(env.attackMs / span) * 100} x2={(env.attackMs / span) * 100} y1={0} y2={30} stroke="rgba(255,255,255,0.15)" vectorEffect="non-scaling-stroke" />
                </svg>
                <div className={row}>
                    Attack
                    <ScrubNumber value={Math.round(env.attackMs)} min={0} max={ATTACK_MAX_MS} unit="ms" width="w-[5.5rem]" ariaLabel="Attack in ms"
                        onChange={v => onChange({ ...env, attackMs: v })} />
                </div>
                <div className={row}>
                    Decay
                    <ScrubNumber value={Math.round(env.decayMs)} min={DECAY_MIN_MS} max={DECAY_MAX_MS} scale="log" unit="ms" width="w-[5.5rem]" ariaLabel="Decay in ms"
                        onChange={v => onChange({ ...env, decayMs: v })} />
                </div>
                <div className={row}>
                    Curve
                    <span className="flex rounded-md border border-white/10 overflow-hidden">
                        {(['exp', 'linear'] as const).map(c => (
                            <button key={c} onClick={() => onChange({ ...env, curve: c })}
                                className={`px-2 py-0.5 ${env.curve === c ? 'bg-synthux-red/80 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                                {c === 'exp' ? 'Exp' : 'Linear'}
                            </button>
                        ))}
                    </span>
                </div>
            </>}
            <div className="flex items-center gap-1.5">
                {onPlay && (
                    <button onClick={() => onPlay(env)} title="Hear the track's sound with this envelope"
                        className="flex items-center gap-1 px-2 py-1 rounded bg-white/10 hover:bg-white/20"><Play size={10} /> Hear it</button>
                )}
                {onEditSlice && (
                    <button onClick={onEditSlice} title="Change the slice's audio itself, in the editor: its save replaces the slice"
                        className="flex items-center gap-1 px-2 py-1 rounded border border-white/15 hover:bg-white/10"><Pencil size={10} /> Edit the slice</button>
                )}
            </div>
            <p className="text-[10px] leading-snug text-gray-500">
                On top of the sound&apos;s own envelope, for this track only: live, in the render and when you audition. The slice stays as it is.
            </p>
        </div>,
        document.body,
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
    x: number; y: number; track: SeqTrack; step: SeqStep; index: number; pattern: PatternId;
    scale: { root: number; mask: number };
    sliceOptions: React.ReactNode;
    onChange: (patch: Partial<SeqStep>) => void;
    onAudition: (soundId: string, shift: number, env?: SnippetEnvelope) => void;
    onClose: () => void;
}> = ({ x, y, track, step, index, pattern, scale, sliceOptions, onChange, onAudition, onClose }) => {
    const kind = kindOf(track);
    const cc = track.cc ?? defaultCc();
    const ccKind = trackCcKind(track);
    const ccName = track.port ? `CC ${cc.cc}` : `${cc.cc} ${ccInfo(cc.cc).name}`;
    const note = step.note ?? CUE_BASE_NOTE;
    const sounding = ROOT_NOTE + track.shift + (step.shift ?? 0);
    const snapped = track.scaleLock ? snapToScale(Math.round(sounding), track.scale ?? scale) : Math.round(sounding);
    return createPortal(
        <div className="fixed z-[200] w-80 max-w-[calc(100vw-16px)] rounded-lg border border-white/15 bg-synthux-panel shadow-2xl p-2.5 space-y-2 text-[11px] text-gray-300"
            // Inline: a page-wide rule makes body's children position: relative, which beats the class.
            style={{ position: 'fixed', left: Math.max(8, Math.min(x, window.innerWidth - 328)), top: Math.max(8, Math.min(y, window.innerHeight - 260)) }}
            onClick={e => e.stopPropagation()} onContextMenu={e => e.preventDefault()}>
            <div className="flex items-center justify-between">
                <span className="font-bold text-gray-100">{track.name} · {pattern} step {index + 1}</span>
                <button onClick={onClose} className="text-gray-500 hover:text-white" aria-label="Close"><X size={12} /></button>
            </div>
            <button onClick={() => onChange({ on: !step.on })}
                className={`w-full px-2 py-1 rounded border ${step.on ? 'border-synthux-red/50 text-white' : 'border-white/10 hover:bg-white/5'}`}>
                {step.on ? 'Switch off' : 'Switch on'}
            </button>

            {kind === 'cc' ? (
                ccKind === 'value' ? (
                    <div className="flex items-center justify-between gap-2">
                        <span>{ccName}</span>
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

            {!(kind === 'cc' && cc.mode !== 'steps') && (
                <div className="flex items-center gap-1" title="How likely the step plays, drawn afresh each time round (live, in the render and over MIDI)">
                    Chance
                    {CHANCES.map(c => (
                        <button key={c} onClick={() => onChange({ on: true, chance: c >= 1 ? undefined : c })}
                            className={`px-1.5 py-0.5 rounded border ${(step.chance ?? 1) === c ? 'bg-synthux-red/80 text-white border-transparent' : 'border-white/10 hover:bg-white/5'}`}>
                            {Math.round(c * 100)}
                        </button>
                    ))}
                    <span className="ml-auto" />
                    <ScrubNumber value={Math.round((step.chance ?? 1) * 100)} min={5} max={100} step={5} unit="%" width="w-[3.9rem]" ariaLabel="Step chance"
                        onChange={v => onChange({ on: true, chance: v >= 100 ? undefined : v / 100 })} />
                </div>
            )}

            {kind === 'slice' && <>
                <div className="flex items-center justify-between gap-2">
                    Pitch
                    <span className="flex items-center gap-1.5">
                        <ScrubNumber value={step.shift ?? 0} min={-24} max={24} step={1} unit="st" width="w-[5rem]" ariaLabel="Step pitch"
                            onChange={v => onChange({ on: true, shift: v || undefined })} />
                        <span className="w-[6ch] font-mono text-gray-400 whitespace-nowrap" title={track.scaleLock ? 'Snapped to the scale' : 'The note it plays'}>
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
                        <button onClick={() => track.cue && onAudition(cueSoundId(track.cue, note - CUE_BASE_NOTE), 0, track.env)}
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

/** A CC track's automation for the pattern being edited, as sent; it is drawn in the timeline. */
const AutoPreview: React.FC<{
    /** The value `pos` steps into this pattern (where it first plays, when connected). */
    valueAt: (pos: number) => number | null; has: boolean;
    smooth?: boolean; connect?: boolean; pattern: PatternId; playing: number | null;
    onEdit: () => void; onSmooth: () => void; onConnect: () => void;
}> = ({ valueAt, has, smooth, connect, pattern, playing, onEdit, onSmooth, onConnect }) => {
    const n = STEPS * LFO_PER_STEP;
    const line = has
        ? Array.from({ length: n + 1 }, (_, j) => `${(j / n) * 100},${30 - ((valueAt(j / LFO_PER_STEP) ?? 0) / 127) * 28 - 1}`).join(' ')
        : '';
    return (
        <div className="flex-1 min-w-[16rem] flex items-center gap-2 text-[10px] text-gray-400">
            <button onClick={onEdit} title={`Draw pattern ${pattern}'s automation in the timeline`}
                className="relative h-8 flex-1 min-w-[8rem] rounded-sm bg-white/[0.04] hover:bg-white/[0.07] overflow-hidden">
                <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
                    {line && <polyline points={line} fill="none" stroke={CC_COLOR} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />}
                    {playing !== null && <line x1={((playing + 0.5) / STEPS) * 100} x2={((playing + 0.5) / STEPS) * 100} y1={0} y2={30}
                        stroke="rgba(255,255,255,0.6)" vectorEffect="non-scaling-stroke" />}
                </svg>
                {!line && <span className="relative text-gray-500">No automation in {pattern}: click to draw it</span>}
            </button>
            <button onClick={onSmooth} aria-pressed={!!smooth} title="Curves between the points instead of straight lines"
                className={`px-1.5 py-0.5 rounded border ${smooth ? 'border-synthux-blue/60 text-synthux-blue' : 'border-white/10 hover:text-white'}`}>Smooth</button>
            <button onClick={onConnect} aria-pressed={!!connect} title={CONNECT_HINT}
                className={`px-1.5 py-0.5 rounded border ${connect ? 'border-synthux-blue/60 text-synthux-blue' : 'border-white/10 hover:text-white'}`}>Connect</button>
            <button onClick={onEdit} title="Draw it in the timeline" className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-white/10 hover:text-white hover:bg-white/5">
                <PenLine size={11} /> Draw
            </button>
        </div>
    );
};

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
// Drum presets
// ---------------------------------------------------------------------------

/** TouchPlaited's patterns by genre: a click loads one; density redraws the loaded one live. */
const PresetPanel: React.FC<{
    density: number; onDensity: (d: number) => void;
    /** The preset whose tracks are in the sequence, or null. */
    loaded: string | null;
    /** The synth is making a kit. */
    busy: boolean;
    emptyPool: boolean;
    onLoad: (id: string) => void;
    /** A fresh synth kit for the loaded preset's tracks. */
    onNewKit: () => void;
    onClose: () => void;
}> = ({ density, onDensity, loaded, busy, emptyPool, onLoad, onNewKit, onClose }) => {
    const [genre, setGenre] = useState(() => DRUM_PRESETS.find(p => p.id === loaded)?.genre ?? DRUM_GENRES[0]);
    return (
        <div className="shrink-0 border-b border-white/10 bg-black/20 px-4 py-3 text-[11px] text-gray-300 space-y-2.5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-gray-100">Drum presets <span className="font-normal text-gray-500">· TouchPlaited&apos;s patterns</span></span>
                <button onClick={onClose} className="text-gray-500 hover:text-white" aria-label="Close"><X size={12} /></button>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="flex rounded-md border border-white/10 overflow-hidden">
                    {DRUM_GENRES.map(g => (
                        <button key={g} onClick={() => setGenre(g)}
                            className={`px-2.5 py-1 font-bold uppercase tracking-wider transition-colors ${genre === g ? 'bg-synthux-red/80 text-white' : 'hover:text-white hover:bg-white/5'}`}>
                            {g}
                        </button>
                    ))}
                </span>
                <label className="flex items-center gap-2" title="Which weights play, as on TouchPlaited: 1 only the backbone (weight 4), 4 every ghost too">
                    Density
                    <input type="range" min={DENSITY_MIN} max={DENSITY_MAX} step={1} value={density}
                        onChange={e => onDensity(Number(e.target.value))} className="w-24 accent-synthux-red" aria-label="Density" />
                    <span className="font-mono text-gray-200 w-[6.5rem]">{density} · {DENSITY_LABELS[density]}</span>
                </label>
                <span className="flex items-center gap-1.5 sm:ml-auto">
                    <button onClick={() => onLoad(EMPTY_PRESET.id)} disabled={busy} aria-pressed={loaded === EMPTY_PRESET.id}
                        title="Clear: the seven drum tracks with empty patterns A–D, to program yourself (their slices stay). Undo takes it back"
                        className={`flex items-center gap-1 px-2 py-1 rounded border disabled:opacity-40 transition-colors
                            ${loaded === EMPTY_PRESET.id ? 'border-synthux-red/60 text-white' : 'border-white/10 hover:text-white hover:bg-white/5'}`}>
                        <Eraser size={11} /> Clear patterns
                    </button>
                    <button onClick={onNewKit} disabled={busy}
                        title={loaded ? 'Render a new kit with the synth: a sound per track, into the slice pool; the steps stay'
                            : 'Render a new kit with the synth and load it on the seven drum tracks, patterns empty'}
                        className="flex items-center gap-1 px-2 py-1 rounded border border-synthux-orange/50 text-synthux-orange hover:bg-synthux-orange/10 disabled:opacity-40">
                        {busy ? <Loader size={11} className="animate-spin" /> : <Dices size={11} />} {busy ? 'Making a kit…' : 'Render new kit'}
                    </button>
                </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
                {DRUM_PRESETS.filter(p => p.genre === genre).map(p => (
                    <button key={p.id} onClick={() => onLoad(p.id)} disabled={busy} aria-pressed={loaded === p.id}
                        title={`Load ${p.name}: 7 tracks, patterns A–D chained (${presetHits(p, density)} hits at density ${density}). Undo takes it back`}
                        className={`px-2.5 py-1 rounded border font-bold disabled:opacity-40 transition-colors
                            ${loaded === p.id ? 'bg-synthux-red/80 text-white border-transparent' : 'border-white/10 hover:text-white hover:bg-white/5'}`}>
                        {p.name}
                    </button>
                ))}
            </div>
            <p className="text-[10px] leading-snug text-gray-500">
                A preset becomes seven tracks ({DRUM_VOICES.map(v => v.name).join(', ')}) over patterns A–D, chained A B C D; CC tracks stay.
                {emptyPool
                    ? ' The slice pool is empty: the synth makes a kit for it, a sound per track, into the pool.'
                    : ' Each track takes a slice from the pool whose name or class fits; the next preset keeps those.'}
                {' '}Density redraws the loaded preset&apos;s steps live (edits to A–D on its tracks are redrawn too).
                {' '}<em>Render new kit</em> gives the tracks new synth sounds and keeps their steps; <em>Clear patterns</em> empties A–D and keeps the sounds.
            </p>
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
                {link.ports.outputs.some(p => p.id !== link.settings.outputId) && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1" title="Other devices that get the clock and Start / Stop too, while the sequencer leads">
                        Clock also to
                        {[...new Set(link.ports.outputs.filter(p => p.id !== link.settings.outputId).map(p => p.name))].map(name => (
                            <label key={name} className="flex items-center gap-1 cursor-pointer">
                                <input type="checkbox" className="accent-synthux-red" checked={link.settings.clockTo.includes(name)}
                                    disabled={!link.settings.sendClock || link.settings.follow}
                                    onChange={e => link.setSettings(s => ({
                                        ...s, clockTo: e.target.checked ? [...s.clockTo, name] : s.clockTo.filter(n => n !== name),
                                    }))} />
                                {name}
                            </label>
                        ))}
                    </div>
                )}
                <p className="text-[10px] leading-snug text-gray-500">
                    Any track can also go to another MIDI device: pick it in the track&apos;s <em>SK</em> menu, under <em>Other MIDI devices</em>,
                    and set its channel; a CC track then takes any CC number.
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
