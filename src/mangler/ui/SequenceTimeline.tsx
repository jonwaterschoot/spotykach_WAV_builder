import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Dices, Minus, Move, Plus, X, ZoomIn, ZoomOut } from 'lucide-react';
import { appStorage } from '../../utils/storageNamespace';
import type { MangleSliceEntry } from '../../utils/persistence';
import { rollChain } from '../randomize';
import {
    CUE_BASE_NOTE, LFO_PER_STEP, ROOT_NOTE, STEPS, patternsOf,
    ccInfo, defaultCc, lfoAt, lockToScale, maxChain, noteName, snapToScale, trackAutoAt, trackCcKind, trackScale,
    type AutoPoint, type PatternId, type SeqStep, type SeqTrack, type Sequence,
} from '../sequence';
import { NOTE_NAMES } from '../pitch';
import { SCALES, maskFromIntervals, scaleName } from '../settings';
import { AutomationLane } from './AutomationLane';
import { formatSeconds } from './format';
import { CC_COLOR, CONNECT_HINT, chanceLabel, dragWhat, kindOf, stepColor, trackColor, useStepDrag, type DragEdit, type StepRef } from './seqUi';

/**
 * The timeline under the pattern grid: the whole chain as blocks, one per bar,
 * scrolling sideways. Drag a block by its handle to move it (Alt to copy it),
 * click it to edit its pattern above, cycle its letter, remove it.
 *
 * Three views, as in a DAW's clip editor:
 * - Steps: every track, a mini cell per step, editable like the grid above;
 * - Notes: the active track as a piano roll (a slice track's pitches, a cue
 *   track's cues);
 * - Automation: the active CC track's automation, a lane per block.
 *
 * Under Steps and Notes, a lane of lollipops shows the active track's velocity,
 * pitch or chance per step; drag across it to draw them.
 *
 * A block edits its pattern: the same pattern elsewhere in the chain changes too.
 *
 * Size: drag its top edge to make it taller (the rows grow with it), zoom the
 * steps wider or narrower with the magnifiers or Ctrl + wheel. Both remembered.
 */

export type TimelineView = 'steps' | 'notes' | 'auto';
type LaneMode = 'velocity' | 'pitch' | 'chance';

interface SequenceTimelineProps {
    seq: Sequence;
    onChange: (update: (seq: Sequence) => Sequence) => void;
    setStep: (ref: StepRef, patch: Partial<SeqStep>) => void;
    sliceById: Map<string, MangleSliceEntry>;
    edit: PatternId;
    /** The chain position last picked, -1 for none. */
    focus: number;
    /** A pattern looping instead of the chain, or null. */
    loop?: PatternId | null;
    onPick: (chainIndex: number) => void;
    active: number;
    onActive: (t: number) => void;
    view: TimelineView;
    onView: (view: TimelineView) => void;
    /** Global step being heard, or null. */
    step: number | null;
    dragEdit: DragEdit;
    scale: { root: number; mask: number };
    onMenu: (ref: StepRef, x: number, y: number) => void;
    /** Hear the active track at a row of the piano roll: a slice track's pitch, a cue track's cue. */
    onPreview?: (t: number, value: number) => void;
    folded: boolean;
    onFold: (folded: boolean) => void;
    className?: string;
}

const BLOCK_GAP = 10;
const LABEL_W = 92;
/** Step widths the zoom goes through, px. */
const ZOOMS = [6, 8, 10, 12, 16, 20, 26, 32];
const MIN_H = 120;
/** The blocks row and the scroller's padding, under the header. */
const CHROME_H = 40;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const SIZE_KEY = 'mangler_timeline_size';
const loadSize = (): { height: number; cell: number } => {
    try {
        const s = JSON.parse(appStorage.getItem(SIZE_KEY) ?? 'null');
        return { height: clamp(Number(s?.height) || 300, MIN_H, 2000), cell: ZOOMS.includes(s?.cell) ? s.cell : 12 };
    } catch { return { height: 300, cell: 12 }; }
};

export const SequenceTimeline: React.FC<SequenceTimelineProps> = ({
    seq, onChange, setStep, sliceById, edit, focus, loop = null, onPick, active, onActive, view, onView, step, dragEdit, scale, onMenu, onPreview, folded, onFold, className = '',
}) => {
    const [lane, setLane] = useState<LaneMode>('velocity');
    const [laneLabel, setLaneLabel] = useState<string | null>(null);
    const [move, setMove] = useState<{ from: number; to: number } | null>(null);
    const header = useRef<HTMLDivElement>(null);
    const scroller = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState(loadSize);
    useEffect(() => { appStorage.setItem(SIZE_KEY, JSON.stringify(size)); }, [size]);
    const resize = useRef<{ y0: number; h0: number } | null>(null);
    /** The scroller's height, so the rows can grow into it. */
    const [bodyH, setBodyH] = useState(260);
    useEffect(() => {
        const el = scroller.current;
        if (!el) return;
        const ro = new ResizeObserver(() => setBodyH(el.clientHeight));
        ro.observe(el);
        return () => ro.disconnect();
    }, [folded]);
    // Ctrl + wheel zooms the steps (a native listener: React's wheel listener can't stop the page zooming).
    useEffect(() => {
        const el = scroller.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            if (!e.ctrlKey) return;
            e.preventDefault();
            setSize(s => ({ ...s, cell: ZOOMS[clamp(ZOOMS.indexOf(s.cell) + (e.deltaY < 0 ? 1 : -1), 0, ZOOMS.length - 1)] }));
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, [folded]);
    const zoom = (d: 1 | -1) => setSize(s => ({ ...s, cell: ZOOMS[clamp(ZOOMS.indexOf(s.cell) + d, 0, ZOOMS.length - 1)] }));

    // Geometry: the zoom sets the step width, the height the rows'.
    const CELL = size.cell;
    const STRIDE = CELL + 1;
    const BLOCK_W = STEPS * STRIDE - 1;
    const BLOCK_STRIDE = BLOCK_W + BLOCK_GAP;
    const room = Math.max(60, bodyH - CHROME_H);
    const LANE_H = clamp(Math.round(room * 0.22), 40, 110);
    const ROW_H = clamp(Math.floor((room - LANE_H) / Math.max(1, seq.tracks.length)) - 4, 12, 36);
    const AUTO_H = clamp(room - 8, 80, 1200);
    /** Which block and step an x inside the blocks row falls on, or null between blocks. */
    const cellAt = (x: number, blocks: number) => {
        const ci = Math.floor(x / BLOCK_STRIDE);
        const xi = x - ci * BLOCK_STRIDE;
        if (ci < 0 || ci >= blocks || xi > BLOCK_W) return null;
        return { ci, i: clamp(Math.floor(xi / STRIDE), 0, STEPS - 1) };
    };
    const notesDrag = useRef<{ ci: number; i: number; row: number; wasOn: boolean; moved: boolean } | null>(null);
    const cells = useStepDrag(setStep, scale);

    const track: SeqTrack | undefined = seq.tracks[active] ?? seq.tracks[0];
    const t = seq.tracks[active] ? active : 0;
    const kind = track ? kindOf(track) : 'slice';
    const cc = track?.cc ?? defaultCc();
    const valueCc = track ? trackCcKind(track) === 'value' : true;
    const ccName = track?.port ? `CC ${cc.cc}` : `${cc.cc} ${ccInfo(cc.cc).name}`;
    // A view the active track can't show falls back to Steps.
    const shown: TimelineView = view === 'notes' && kind === 'cc' ? 'steps' : view === 'auto' && kind !== 'cc' ? 'steps' : view;
    const laneMode: LaneMode = lane === 'pitch' && kind === 'cc' ? 'velocity' : lane;
    const limit = maxChain(seq.bpm);
    // Where the playhead is: its bar in the chain, or, looping one pattern, the picked bar of it (else its first).
    const loopBlock = loop ? (seq.chain[focus] === loop ? focus : seq.chain.indexOf(loop)) : -1;
    const playingAt = step === null ? null
        : loop ? (loopBlock >= 0 ? { ci: loopBlock, i: step % STEPS } : null)
            : { ci: Math.floor(step / STEPS), i: step % STEPS };

    const setChain = (update: (chain: PatternId[]) => PatternId[]) => onChange(seq => ({ ...seq, chain: update(seq.chain) }));
    const setAuto = (p: PatternId, points: AutoPoint[]) => onChange(seq => ({
        ...seq,
        tracks: seq.tracks.map((tr, i) => {
            if (i !== t) return tr;
            const c = tr.cc ?? defaultCc();
            return { ...tr, cc: { ...c, auto: { ...c.auto, [p]: points.length ? points : undefined } } };
        }),
    }));
    const setCc = (patch: Partial<NonNullable<SeqTrack['cc']>>) =>
        onChange(seq => ({ ...seq, tracks: seq.tracks.map((tr, i) => (i === t ? { ...tr, cc: { ...(tr.cc ?? defaultCc()), ...patch } } : tr)) }));

    // ---- Block moves --------------------------------------------------------

    const blockIndexAt = (clientX: number) => {
        const r = header.current?.getBoundingClientRect();
        if (!r) return 0;
        return clamp(Math.floor((clientX - r.left - 8) / BLOCK_STRIDE), 0, seq.chain.length - 1); // 8: the row's pl-2
    };
    const grip = (ci: number) => ({
        onPointerDown: (e: React.PointerEvent) => {
            if (e.button !== 0) return;
            e.stopPropagation();
            try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* still a click */ }
            setMove({ from: ci, to: ci });
        },
        onPointerMove: (e: React.PointerEvent) => {
            if (move?.from === ci) setMove({ from: ci, to: blockIndexAt(e.clientX) });
        },
        onPointerUp: (e: React.PointerEvent) => {
            if (!move || move.from !== ci) return;
            const { from, to } = move;
            setMove(null);
            const copy = e.altKey && seq.chain.length < limit;
            if (from === to && !copy) return;
            setChain(chain => {
                const next = [...chain];
                const p = copy ? chain[from] : next.splice(from, 1)[0];
                next.splice(copy ? to + 1 : to, 0, p);
                return next;
            });
            onPick(copy ? to + 1 : to);
        },
        onPointerCancel: () => setMove(null),
        onClick: (e: React.MouseEvent) => e.stopPropagation(),
    });

    // ---- Rows -----------------------------------------------------------------

    const row = (key: string, label: React.ReactNode, height: number, block: (p: PatternId, ci: number) => React.ReactNode,
        props: React.HTMLAttributes<HTMLDivElement> = {}, labelProps: React.HTMLAttributes<HTMLDivElement> = {}) => (
        <div key={key} className="flex items-stretch">
            <div {...labelProps}
                className={`sticky left-0 z-10 shrink-0 flex items-center gap-1 px-2 text-[10px] text-gray-400 border-r border-white/10 ${labelProps.className ?? ''}`}
                style={{ width: LABEL_W, height, background: 'var(--color-synthux-panel)' }}>
                {label}
            </div>
            <div {...props} className={`flex pl-2 ${props.className ?? ''}`} style={{ gap: BLOCK_GAP, ...props.style }}>
                {seq.chain.map((p, ci) => (
                    <div key={ci} className="relative shrink-0" style={{ width: BLOCK_W, height }}>{block(p, ci)}</div>
                ))}
            </div>
        </div>
    );

    const blocksRow = (
        <div className="flex items-stretch">
            <div className="sticky left-0 z-10 shrink-0 border-r border-white/10" style={{ width: LABEL_W, background: 'var(--color-synthux-panel)' }} />
            <div ref={header} className="flex pl-2 pb-1" style={{ gap: BLOCK_GAP }}>
                {seq.chain.map((p, ci) => {
                    const here = playingAt?.ci === ci;
                    const target = move && move.to === ci && move.from !== ci;
                    return (
                        <div key={ci} onClick={() => onPick(ci)} title={`Bar ${ci + 1}: pattern ${p}. Click to edit it above`}
                            className={`shrink-0 flex items-center gap-1 h-6 px-1 rounded border text-[10px] cursor-pointer transition-colors
                                ${ci === focus ? 'border-synthux-red/70 bg-synthux-red/15' : p === edit ? 'border-white/25 bg-white/[0.06]' : 'border-white/10 hover:bg-white/5'}
                                ${move?.from === ci ? 'opacity-50' : ''} ${target ? 'ring-1 ring-synthux-red' : ''}`}
                            style={{ width: BLOCK_W }}>
                            <span {...grip(ci)} title="Drag to move this bar (Alt: copy it)"
                                className="p-0.5 text-gray-500 hover:text-white cursor-grab active:cursor-grabbing touch-none"><Move size={10} /></span>
                            <span className={`font-mono font-bold ${here ? 'text-synthux-red' : 'text-gray-400'}`}>{ci + 1}</span>
                            {patternsOf(seq).length <= 4 ? (
                                <button onClick={e => { e.stopPropagation(); setChain(chain => chain.map((x, k) => (k === ci ? patternsOf(seq)[(patternsOf(seq).indexOf(x) + 1) % patternsOf(seq).length] : x))); }}
                                    title={`Cycle the pattern ${patternsOf(seq).join(' → ')}`}
                                    className={`px-1.5 rounded border font-bold font-mono text-gray-100 hover:bg-white/10 ${loop === p ? 'border-synthux-green/70' : 'border-white/15'}`}>{p}</button>
                            ) : (
                                <select value={p} onClick={e => e.stopPropagation()} aria-label={`Bar ${ci + 1}'s pattern`} title="The pattern this bar plays"
                                    onChange={e => { const v = e.target.value as PatternId; setChain(chain => chain.map((x, k) => (k === ci ? v : x))); }}
                                    className={`bg-black/40 border rounded px-0.5 font-bold font-mono text-gray-100 ${loop === p ? 'border-synthux-green/70' : 'border-white/15'}`}>
                                    {patternsOf(seq).map(x => <option key={x} value={x}>{x}</option>)}
                                </select>
                            )}
                            <span className="ml-auto" />
                            <button onClick={e => { e.stopPropagation(); setChain(chain => chain.filter((_, k) => k !== ci)); onPick(Math.max(0, Math.min(ci, seq.chain.length - 2))); }}
                                disabled={seq.chain.length <= 1} title="Remove this bar from the chain"
                                className="p-0.5 text-gray-600 hover:text-synthux-red disabled:opacity-20"><X size={10} /></button>
                        </div>
                    );
                })}
            </div>
        </div>
    );

    /** A CC track running an LFO or automation: its curve in the block, as sent. */
    const curveIn = (tr: SeqTrack, ci: number, h: number) => {
        const c = tr.cc ?? defaultCc();
        const n = STEPS * LFO_PER_STEP;
        const pts = Array.from({ length: n + 1 }, (_, j) => {
            const pos = j / LFO_PER_STEP;
            const v = c.mode === 'lfo'
                ? c.lfo.min + (c.lfo.max - c.lfo.min) * lfoAt(c.lfo.shape, (ci * STEPS + pos) / Math.max(1, c.lfo.rateSteps) + c.lfo.phase)
                : trackAutoAt(seq, tr, ci * STEPS + pos);
            return v === null ? null : `${(j / n) * BLOCK_W},${h - 1 - (v / 127) * (h - 2)}`;
        });
        if (pts.some(x => x === null)) return <div className="absolute inset-0 rounded-sm bg-white/[0.03]" />;
        return (
            <svg width={BLOCK_W} height={h} className="absolute inset-0 rounded-sm bg-white/[0.03]" aria-hidden>
                <polyline points={pts.join(' ')} fill="none" stroke={CC_COLOR} strokeWidth={1.2} />
            </svg>
        );
    };

    const trackLabel = (tr: SeqTrack, ti: number) => (
        <>
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: trackColor(tr, sliceById) }} />
            <span className={`truncate ${ti === t ? 'text-white font-bold' : ''}`}>{tr.name}</span>
            {tr.mute && <span className="ml-auto text-synthux-yellow">M</span>}
        </>
    );

    const stepsRows = seq.tracks.map((tr, ti) => {
        const colour = trackColor(tr, sliceById);
        const curve = kindOf(tr) === 'cc' && tr.cc && tr.cc.mode !== 'steps';
        return row(tr.id, trackLabel(tr, ti), ROW_H, (p, ci) => curve ? curveIn(tr, ci, ROW_H) : (
            <div className="grid h-full" style={{ gridTemplateColumns: `repeat(${STEPS}, ${CELL}px)`, gap: 1 }}>
                {tr.patterns[p].map((s, i) => {
                    const key = `${ci}:${ti}:${i}`;
                    const fill = kindOf(tr) === 'cc' && trackCcKind(tr) !== 'value' ? 1 : s.velocity;
                    const here = playingAt?.ci === ci && playingAt.i === i;
                    return (
                        <button key={i} {...cells.handlers(key, { pattern: p, t: ti, i }, tr, s, dragWhat(tr, dragEdit))}
                            onClick={e => e.stopPropagation()}
                            onContextMenu={e => { e.preventDefault(); e.stopPropagation(); cells.cancel(); onMenu({ pattern: p, t: ti, i }, e.clientX, e.clientY); }}
                            title={s.on ? `${tr.name}, bar ${ci + 1} step ${i + 1}${chanceLabel(s) ? ` · ${chanceLabel(s)} chance` : ''}` : undefined}
                            className={`relative rounded-[1px] overflow-hidden touch-none ${i % 4 === 0 ? 'bg-white/[0.09]' : 'bg-white/[0.045]'} hover:bg-white/15
                                ${here ? 'ring-1 ring-white' : ''}`}>
                            {s.on && <span className="absolute inset-x-0 bottom-0"
                                style={{ height: `${Math.max(25, Math.round(fill * 100))}%`, background: stepColor(s, colour, sliceById), opacity: 0.35 + 0.65 * (s.chance ?? 1) }} />}
                            {cells.label?.key === key && (
                                <span className="absolute left-1/2 -translate-x-1/2 -top-0.5 px-1 rounded bg-black text-[9px] font-mono text-white whitespace-nowrap z-10">{cells.label.text}</span>
                            )}
                        </button>
                    );
                })}
            </div>
        ), {}, { onClick: () => onActive(ti), className: 'cursor-pointer hover:text-white' });
    });

    // ---- Notes (piano roll of the active track) ----------------------------------

    /** The active slice track's scale, and how its notes sit in it: Free shows every row, Lock only the scale's. */
    const ownScale = !!track?.scale;
    const sc = track ? trackScale(seq, track) : { root: 0, mask: 0xfff };
    const setScale = (next: { root: number; mask: number }) => onChange(seq => (seq.tracks[t]?.scale
        ? { ...seq, tracks: seq.tracks.map((tr, i) => (i === t ? { ...tr, scale: next } : tr)) }
        : { ...seq, scale: next }));
    const setLocked = (lock: boolean) => onChange(seq => ({
        ...seq,
        tracks: seq.tracks.map((tr, i) => (i !== t ? tr : lock ? lockToScale(tr, trackScale(seq, tr)) : { ...tr, scaleLock: undefined })),
    }));
    const setOwnScale = (own: boolean) => onChange(seq => ({
        ...seq,
        tracks: seq.tracks.map((tr, i) => (i !== t ? tr : own ? { ...tr, scale: trackScale(seq, tr) } : { ...tr, scale: undefined })),
    }));

    const notesRows = (() => {
        if (!track || kind === 'cc') return null;
        const isCue = kind === 'cue';
        const cueCount = isCue ? Math.max(1, track.cue?.cues.length ?? 1) : 0;
        const locked = !isCue && !!track.scaleLock;
        const base = Math.round(ROOT_NOTE + track.shift);
        const noteOf = (v: number) => (isCue ? CUE_BASE_NOTE + v : base + v);
        const inScale = (v: number) => isCue || snapToScale(noteOf(v), sc) === noteOf(v);
        // Where a step sits: its cue, or its pitch (snapped when locked, as it plays).
        const pitchOf = (s: SeqStep) => (isCue ? (s.note ?? CUE_BASE_NOTE) - CUE_BASE_NOTE
            : locked ? snapToScale(base + (s.shift ?? 0), sc) - base : s.shift ?? 0);
        // Rows, top down: a slice track's pitches (±12 at least, out to the notes in use; the scale's only when
        // locked), or a cue track's cues.
        let hi: number, lo: number;
        if (isCue) { hi = cueCount - 1; lo = 0; } else {
            const used = seq.chain.flatMap(p => track.patterns[p].filter(s => s.on).map(pitchOf));
            hi = clamp(Math.max(12, ...used), 12, 24);
            lo = clamp(Math.min(-12, ...used), -24, -12);
        }
        const vals: number[] = [];
        for (let v = hi; v >= lo; v--) if (!locked || inScale(v)) vals.push(v);
        const rows = vals.length;
        const NOTE_H = clamp(Math.floor((room - LANE_H - 8) / rows), 6, 24);
        const height = rows * NOTE_H;
        const patchFor = (v: number): Partial<SeqStep> => (isCue ? { on: true, note: CUE_BASE_NOTE + v } : { on: true, shift: v || undefined });
        const rowAt = (e: React.PointerEvent) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            return clamp(Math.floor((e.clientY - r.top) / NOTE_H), 0, rows - 1);
        };
        const pc = (n: number) => ((n % 12) + 12) % 12;
        const black = (n: number) => [1, 3, 6, 8, 10].includes(pc(n));
        const colour = trackColor(track, sliceById);
        const named = NOTE_H >= 9;
        const font = clamp(NOTE_H - 2, 6, 10);

        // A piano down the side: each key keeps its name and its colour, also when the scale folds the rows.
        const keys = (
            <div className="relative w-full h-full">
                {vals.map((v, r) => {
                    const n = noteOf(v);
                    const out = !inScale(v);
                    return isCue ? (
                        <span key={v} className="absolute right-0 flex items-center font-mono leading-none text-gray-500"
                            style={{ top: r * NOTE_H, height: NOTE_H, fontSize: font }}>{v + 1}</span>
                    ) : (
                        <button key={v} onClick={() => onPreview?.(t, v)} title={`${noteName(n)}${out ? ' (outside the scale)' : ''}: click to hear it`}
                            className={`absolute inset-x-0 flex items-center font-mono leading-none rounded-r-[2px] border-b border-black/60
                                ${black(n) ? 'justify-start pl-1' : 'justify-end pr-1'}`}
                            style={{
                                top: r * NOTE_H, height: NOTE_H, fontSize: font,
                                // A black key as on a keyboard: dark, with the white keys' edge showing on the right.
                                background: black(n) ? 'linear-gradient(to right, #2b2b30 0 66%, #d4d4d8 66% 100%)' : '#d4d4d8',
                                color: black(n) ? '#d4d4d8' : '#18181b',
                                opacity: out ? 0.4 : 1, fontWeight: pc(n) === 0 ? 700 : 400,
                            }}>
                            {(named || pc(n) === 0) && noteName(n)}
                        </button>
                    );
                })}
            </div>
        );

        return row('notes', keys, height, (p, ci) => (
            <div className="absolute inset-0 touch-none cursor-crosshair"
                onPointerDown={e => {
                    if (e.button !== 0) return;
                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    const i = clamp(Math.floor((e.clientX - r.left) / STRIDE), 0, STEPS - 1);
                    const rr = rowAt(e);
                    const s = track.patterns[p][i];
                    const wasOn = s.on && pitchOf(s) === vals[rr];
                    try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* still a click */ }
                    notesDrag.current = { ci, i, row: rr, wasOn, moved: false };
                    if (!wasOn) setStep({ pattern: p, t, i }, patchFor(vals[rr]));
                }}
                onPointerMove={e => {
                    const d = notesDrag.current;
                    if (!d || d.ci !== ci) return;
                    const rr = rowAt(e);
                    if (rr === d.row) return;
                    d.row = rr; d.moved = true;
                    setStep({ pattern: p, t, i: d.i }, patchFor(vals[rr]));
                }}
                onPointerUp={() => {
                    const d = notesDrag.current;
                    notesDrag.current = null;
                    if (d && d.ci === ci && d.wasOn && !d.moved) setStep({ pattern: p, t, i: d.i }, { on: false });
                }}
                onPointerCancel={() => { notesDrag.current = null; }}
                onContextMenu={e => {
                    e.preventDefault();
                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    onMenu({ pattern: p, t, i: clamp(Math.floor((e.clientX - r.left) / STRIDE), 0, STEPS - 1) }, e.clientX, e.clientY);
                }}>
                {/* Rows shaded as the keys: white, black, C a touch lighter; outside the scale (Free) hatched. */}
                {vals.map((v, r) => {
                    const n = noteOf(v);
                    return (
                        <div key={v} className={`absolute inset-x-0 ${isCue ? 'bg-white/[0.04]' : black(n) ? 'bg-black/30' : pc(n) === 0 ? 'bg-white/[0.09]' : 'bg-white/[0.05]'}`}
                            style={{
                                top: r * NOTE_H, height: NOTE_H - 1,
                                backgroundImage: inScale(v) ? undefined : 'repeating-linear-gradient(135deg, rgba(0,0,0,0.45) 0 3px, transparent 3px 6px)',
                            }} />
                    );
                })}
                {Array.from({ length: STEPS / 4 }, (_, b) => (
                    <div key={b} className="absolute inset-y-0 w-px bg-white/10" style={{ left: b * 4 * STRIDE - 1 }} />
                ))}
                {playingAt?.ci === ci && <div className="absolute inset-y-0 bg-white/15" style={{ left: playingAt.i * STRIDE, width: CELL }} />}
                {track.patterns[p].map((s, i) => {
                    if (!s.on) return null;
                    const v = pitchOf(s);
                    const r = vals.indexOf(v);
                    if (r < 0) return null;
                    const out = !inScale(v);
                    return (
                        <div key={i} title={isCue ? `cue ${v + 1}` : `${noteName(noteOf(v))}${out ? ' (outside the scale)' : ''}`}
                            className={`absolute rounded-[2px] pointer-events-none border overflow-hidden flex items-center justify-center font-mono leading-none text-black/80
                                ${out ? 'border-synthux-red' : 'border-black/40'}`}
                            style={{
                                left: i * STRIDE, top: r * NOTE_H, width: CELL, height: NOTE_H - 1, fontSize: clamp(NOTE_H - 3, 6, 9),
                                background: stepColor(s, colour, sliceById), opacity: 0.35 + 0.65 * s.velocity,
                            }}>
                            {named && CELL >= 16 && (isCue ? v + 1 : noteName(noteOf(v)))}
                        </div>
                    );
                })}
            </div>
        ));
    })();

    // ---- Lollipop lane: velocity, pitch or chance of the active track ------------

    const laneRow = (() => {
        if (!track || (kind === 'cc' && cc.mode !== 'steps')) return null;
        const colour = trackColor(track, sliceById);
        const cueCount = Math.max(1, track.cue?.cues.length ?? 1);
        const pitchMode = laneMode === 'pitch';
        /** A step's value on the lane, 0–1 from the bottom; pitch from the middle for a slice. */
        const valueOf = (s: SeqStep) => laneMode === 'chance' ? s.chance ?? 1
            : !pitchMode ? s.velocity
                : kind === 'cue' ? ((s.note ?? CUE_BASE_NOTE) - CUE_BASE_NOTE) / Math.max(1, cueCount - 1)
                    : 0.5 + (s.shift ?? 0) / 48;
        const base = pitchMode && kind === 'slice' ? 0.5 : 0;
        const y = (v: number) => LANE_H - 2 - v * (LANE_H - 4);
        const paint = (e: React.PointerEvent) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const at = cellAt(e.clientX - r.left - 8, seq.chain.length); // 8: the row's pl-2
            if (!at) return;
            const p = seq.chain[at.ci];
            const s = track.patterns[p][at.i];
            if (!s.on) return;
            const u = clamp(1 - (e.clientY - r.top - 2) / (LANE_H - 4), 0, 1);
            let patch: Partial<SeqStep>, text: string;
            if (laneMode === 'chance') {
                const c = Math.max(0.05, Math.round(u * 20) / 20);
                patch = { chance: c >= 1 ? undefined : c }; text = `${Math.round(c * 100)}% chance`;
            } else if (!pitchMode) {
                const v = kind === 'cc' ? Math.round(u * 127) / 127 : Math.max(0.05, Math.round(u * 100) / 100);
                patch = { velocity: v }; text = kind === 'cc' ? `value ${Math.round(v * 127)}` : `${Math.round(v * 100)}%`;
            } else if (kind === 'cue') {
                const idx = Math.round(u * (cueCount - 1));
                patch = { note: CUE_BASE_NOTE + idx }; text = `cue ${idx + 1}`;
            } else {
                let st = clamp(Math.round((u - 0.5) * 48), -24, 24);
                if (track.scaleLock) st = snapToScale(ROOT_NOTE + track.shift + st, sc) - ROOT_NOTE - track.shift;
                patch = { shift: st || undefined }; text = `${st > 0 ? '+' : ''}${st} st · ${noteName(Math.round(ROOT_NOTE + track.shift + st))}`;
            }
            setStep({ pattern: p, t, i: at.i }, patch);
            setLaneLabel(`${at.ci + 1}.${at.i + 1}  ${text}`);
        };
        const label = (
            <span className="flex flex-col leading-tight">
                <span className="text-gray-300">{laneMode === 'chance' ? 'Chance' : pitchMode ? (kind === 'cue' ? 'Cue' : 'Pitch') : kind === 'cc' ? 'Value' : 'Velocity'}</span>
                <span className="font-mono text-[9px] text-synthux-red truncate">{laneLabel ?? track.name}</span>
            </span>
        );
        return row('lane', label, LANE_H, (p, ci) => (
            <svg width={BLOCK_W} height={LANE_H} className="absolute inset-0 rounded-sm bg-white/[0.03] pointer-events-none" aria-hidden>
                <line x1={0} x2={BLOCK_W} y1={y(base)} y2={y(base)} stroke="rgba(255,255,255,0.12)" />
                {playingAt?.ci === ci && <rect x={playingAt.i * STRIDE} y={0} width={CELL} height={LANE_H} fill="rgba(255,255,255,0.08)" />}
                {track.patterns[p].map((s, i) => {
                    if (!s.on) return null;
                    const cx = i * STRIDE + CELL / 2;
                    const v = clamp(valueOf(s), 0, 1);
                    return (
                        <g key={i}>
                            <line x1={cx} x2={cx} y1={y(base)} y2={y(v)} stroke={stepColor(s, colour, sliceById)} strokeWidth={1.5} />
                            <circle cx={cx} cy={y(v)} r={2.5} fill={stepColor(s, colour, sliceById)} />
                        </g>
                    );
                })}
            </svg>
        ), {
            className: 'touch-none cursor-ns-resize',
            onPointerDown: e => {
                if (e.button !== 0) return;
                try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* still a click */ }
                paint(e);
            },
            // Pressed (a mouse button, a finger, a pen): paint on.
            onPointerMove: e => { if (e.buttons & 1) paint(e); },
            onPointerUp: () => setLaneLabel(null),
            onPointerCancel: () => setLaneLabel(null),
        });
    })();

    // ---- Automation -----------------------------------------------------------

    const autoRows = (() => {
        if (!track || kind !== 'cc') return null;
        if (cc.mode !== 'auto') {
            return (
                <div className="flex items-center gap-3 px-3 py-4 text-[11px] text-gray-400" style={{ marginLeft: LABEL_W }}>
                    {valueCc ? <>
                        {track.name} runs {cc.mode === 'lfo' ? 'an LFO' : 'steps'}.
                        <button onClick={() => setCc({ mode: 'auto' })}
                            className="px-2 py-1 rounded border border-white/15 text-gray-200 hover:bg-white/10">Draw automation instead</button>
                    </> : <>{ccName} is a switch: automation is for value CCs. Use steps for it.</>}
                </div>
            );
        }
        const label = (
            <span className="flex flex-col h-full justify-between py-1 font-mono text-[9px] text-gray-500 w-full">
                <span className="text-right">127</span>
                <span className="text-gray-300 font-sans text-[10px] truncate">{ccName}{cc.connect ? ' · connected' : ''}</span>
                <span className="text-right">0</span>
            </span>
        );
        return row('auto', label, AUTO_H, (p, ci) => (
            <AutomationLane points={cc.auto?.[p] ?? []} onChange={pts => setAuto(p, pts)} width={BLOCK_W} height={AUTO_H}
                smooth={cc.smooth} color={CC_COLOR} playhead={playingAt?.ci === ci ? playingAt.i : null}
                curveAt={cc.connect ? pos => trackAutoAt(seq, track, ci * STEPS + pos) : undefined} />
        ));
    })();

    const tab = (id: TimelineView, label: string, disabled: boolean, hint: string) => (
        <button key={id} onClick={() => onView(id)} disabled={disabled} title={hint}
            className={`px-2 py-1 disabled:opacity-30 ${shown === id ? 'bg-synthux-red/80 text-white' : 'hover:text-white hover:bg-white/5'}`}>{label}</button>
    );
    const bars = seq.chain.length;

    return (
        <div className={`relative flex-col min-h-0 border-t border-white/10 bg-black/25 ${className}`} onClick={e => e.stopPropagation()}
            style={{ '--tl-h': folded ? 'auto' : `${size.height}px` } as React.CSSProperties}>
            {/* The top edge: drag to make the timeline taller or shorter, double-click for the default. */}
            {!folded && (
                <div className="hidden md:block absolute inset-x-0 -top-1 h-2 z-20 cursor-ns-resize touch-none hover:bg-synthux-red/40"
                    title="Drag to resize the timeline (double-click: default)"
                    onPointerDown={e => {
                        if (e.button !== 0) return;
                        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* still a click */ }
                        resize.current = { y0: e.clientY, h0: size.height };
                    }}
                    onPointerMove={e => {
                        const r = resize.current;
                        if (r) setSize(s => ({ ...s, height: clamp(r.h0 + r.y0 - e.clientY, MIN_H, Math.round(window.innerHeight * 0.85)) }));
                    }}
                    onPointerUp={() => { resize.current = null; }}
                    onPointerCancel={() => { resize.current = null; }}
                    onDoubleClick={() => setSize(s => ({ ...s, height: 300 }))} />
            )}
            <div className="shrink-0 flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2 text-[11px] text-gray-400">
                <span className="font-bold text-gray-200">Timeline</span>
                <span className="flex rounded-md border border-white/10 overflow-hidden">
                    {tab('steps', 'Steps', false, 'Every track, a mini cell per step')}
                    {tab('notes', 'Notes', kind === 'cc', 'The active track as a piano roll: pitches, or a cue track\'s cues')}
                    {tab('auto', 'Automation', kind !== 'cc', 'The active CC track\'s automation, drawn per pattern')}
                </span>
                <select value={t} onChange={e => onActive(Number(e.target.value))} aria-label="Active track"
                    className="bg-black/40 border border-white/10 rounded px-1 py-1 text-[11px] text-gray-200 max-w-[9rem]">
                    {seq.tracks.map((tr, i) => <option key={tr.id} value={i}>{tr.name}</option>)}
                </select>
                {shown !== 'auto' && laneRow && (
                    <span className="flex items-center gap-1.5" title="The lane under the steps: drag across it to draw the active track's values">
                        Lane
                        <span className="flex rounded-md border border-white/10 overflow-hidden">
                            {(['velocity', 'pitch', 'chance'] as const).map(m => (
                                <button key={m} onClick={() => setLane(m)} disabled={m === 'pitch' && kind === 'cc'}
                                    className={`px-2 py-1 disabled:opacity-30 ${laneMode === m ? 'bg-white/15 text-white' : 'hover:text-white hover:bg-white/5'}`}>
                                    {m === 'velocity' ? (kind === 'cc' ? 'Value' : 'Velocity') : m === 'pitch' ? (kind === 'cue' ? 'Cue' : 'Pitch') : 'Chance'}
                                </button>
                            ))}
                        </span>
                    </span>
                )}
                {shown === 'notes' && kind === 'slice' && track && <>
                    <span className="flex items-center gap-1.5">
                        Scale
                        <span className="flex rounded-md border border-white/10 overflow-hidden">
                            <button onClick={() => setLocked(false)} aria-pressed={!track.scaleLock}
                                title="Free: every note, the ones outside the scale hatched"
                                className={`px-2 py-1 ${!track.scaleLock ? 'bg-white/15 text-white' : 'hover:text-white hover:bg-white/5'}`}>Free</button>
                            <button onClick={() => setLocked(true)} aria-pressed={!!track.scaleLock}
                                title="Lock: only the scale's notes; notes outside it move to the nearest scale note"
                                className={`px-2 py-1 ${track.scaleLock ? 'bg-synthux-blue/70 text-white' : 'hover:text-white hover:bg-white/5'}`}>Lock</button>
                        </span>
                        <select value={sc.root} aria-label="Scale root" onChange={e => setScale({ ...sc, root: Number(e.target.value) })}
                            className="bg-black/40 border border-white/10 rounded px-1 py-1 text-[11px] text-gray-200">
                            {NOTE_NAMES.map((n, i) => <option key={n} value={i}>{n}</option>)}
                        </select>
                        <select value={scaleName(sc.mask) ?? ''} aria-label="Scale"
                            onChange={e => { const preset = SCALES.find(x => x.name === e.target.value); if (preset) setScale({ ...sc, mask: maskFromIntervals(preset.intervals) }); }}
                            className="bg-black/40 border border-white/10 rounded px-1 py-1 text-[11px] text-gray-200 max-w-[9rem]">
                            {scaleName(sc.mask) === null && <option value="">Custom</option>}
                            {SCALES.map(x => <option key={x.name} value={x.name}>{x.name}</option>)}
                        </select>
                        <span className="flex rounded-md border border-white/10 overflow-hidden" title="Whose scale this is: the whole sequence's, or this track's own">
                            <button onClick={() => setOwnScale(false)} aria-pressed={!ownScale}
                                className={`px-2 py-1 ${!ownScale ? 'bg-white/15 text-white' : 'hover:text-white hover:bg-white/5'}`}>All tracks</button>
                            <button onClick={() => setOwnScale(true)} aria-pressed={ownScale}
                                className={`px-2 py-1 ${ownScale ? 'bg-white/15 text-white' : 'hover:text-white hover:bg-white/5'}`}>This track</button>
                        </span>
                    </span>
                </>}
                {shown === 'auto' && cc.mode === 'auto' && <>
                    <button onClick={() => setCc({ smooth: !cc.smooth || undefined })} aria-pressed={!!cc.smooth}
                        title="Curves between the points instead of straight lines"
                        className={`px-2 py-1 rounded border ${cc.smooth ? 'border-synthux-blue/60 text-synthux-blue' : 'border-white/10 hover:text-white'}`}>Smooth</button>
                    <button onClick={() => setCc({ connect: !cc.connect || undefined })} aria-pressed={!!cc.connect} title={CONNECT_HINT}
                        className={`px-2 py-1 rounded border ${cc.connect ? 'border-synthux-blue/60 text-synthux-blue' : 'border-white/10 hover:text-white'}`}>Connect</button>
                    <span className="hidden lg:inline text-gray-500">Double-click adds a point (on a point: removes it) · drag to move, Alt for free time · drag on empty to select · Delete</span>
                </>}
                <span className="flex items-center gap-1 ml-auto">
                    <button onClick={() => zoom(-1)} disabled={size.cell === ZOOMS[0]} title="Narrower steps (Ctrl + wheel)" aria-label="Zoom out"
                        className="p-1 rounded border border-white/10 hover:bg-white/5 disabled:opacity-30"><ZoomOut size={11} /></button>
                    <button onClick={() => zoom(1)} disabled={size.cell === ZOOMS[ZOOMS.length - 1]} title="Wider steps (Ctrl + wheel)" aria-label="Zoom in"
                        className="p-1 rounded border border-white/10 hover:bg-white/5 disabled:opacity-30"><ZoomIn size={11} /></button>
                </span>
                <span className="flex items-center gap-1" title="The chain: one block per bar">
                    <button onClick={() => setChain(chain => [...chain, chain[chain.length - 1]])} disabled={bars >= limit}
                        title={`Add a bar to the chain (at most ${limit} at this tempo: 42 s)`}
                        className="p-1 rounded border border-white/10 hover:bg-white/5 disabled:opacity-30"><Plus size={11} /></button>
                    <button onClick={() => setChain(chain => rollChain(chain.length, patternsOf(seq).filter(p => seq.tracks.some(tr => tr.patterns[p].some(s => s.on)))))}
                        disabled={bars <= 1} title="Dice: rearrange the chain from the patterns that have steps"
                        className="p-1 rounded border border-white/10 hover:text-synthux-red hover:bg-white/5 disabled:opacity-30"><Dices size={11} /></button>
                    <button onClick={() => setChain(chain => chain.slice(0, -1))} disabled={bars <= 1} title="Drop the last bar"
                        className="p-1 rounded border border-white/10 hover:bg-white/5 disabled:opacity-30"><Minus size={11} /></button>
                    <span className="ml-1 font-mono text-gray-500">{bars} bar{bars === 1 ? '' : 's'} · {formatSeconds(bars * (240 / seq.bpm))}</span>
                </span>
                <button onClick={() => onFold(!folded)} title={folded ? 'Show the timeline' : 'Fold the timeline'}
                    className="hidden md:block p-1 rounded text-gray-500 hover:text-white hover:bg-white/5">
                    {folded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
            </div>

            {!folded && (
                <div ref={scroller} className="flex-1 min-h-0 overflow-auto pb-3">
                    <div className="min-w-max space-y-1 pr-4">
                        {blocksRow}
                        {shown === 'steps' && stepsRows}
                        {shown === 'notes' && notesRows}
                        {shown === 'auto' && autoRows}
                        {shown !== 'auto' && laneRow}
                    </div>
                </div>
            )}
        </div>
    );
};
