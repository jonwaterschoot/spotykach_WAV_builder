import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Combine, Loader, Maximize2, Minus, Play, Plus, Scissors, Square, Trash2, X } from 'lucide-react';
import { useEscapeLayer } from '../../shell/escapeStack';
import type { MangleSourceEntry } from '../../utils/persistence';
import type { RegionPlayback } from './useResultAudio';
import { formatSeconds } from './format';
import { MIN_PART, normaliseParts, type Part } from '../parts';
import type { Hit, HitClass } from '../hits';
import { findHits } from '../hitsClient';
import { renderSlice, slicePeaks, type SliceSpec } from '../slices';


interface SourcePartsModalProps {
    source: MangleSourceEntry;
    load: (id: string, blob: Blob) => Promise<AudioBuffer>;
    playRegion: (region: RegionPlayback, blob: Blob) => void;
    stop: () => void;
    playing: RegionPlayback | null;
    position: number | null;
    /** Absent (a result, not a pool source): hits only, no parts to keep. */
    onSave?: (parts: Part[]) => void;
    /** The hits (seconds), one after another with a cue at each, as a new result. */
    onKit: (hits: Part[]) => void;
    /** The hits into the slice pool, with their class and an outline for the tile. */
    onSlices: (items: { spec: SliceSpec; cls: HitClass; peaks: number[] }[]) => void;
    onClose: () => void;
}

/** The strip under the wave where hits are drawn and clicked. */
const LANE = 18;

type HitLevel = 'gentle' | 'normal' | 'aggressive';
const HIT_SENSITIVITY: Record<HitLevel, number> = { gentle: 0.25, normal: 0.55, aggressive: 0.85 };

const CLASS_COLOR: Record<HitClass, string> = { low: '#f58b44', mid: '#f5d544', high: '#4771f9' };
const CLASS_HINT: Record<HitClass, string> = {
    low: 'Low: kicks, toms, bass hits',
    mid: 'Mid: snares, claps, plucks',
    high: 'High: hats, shakers, clicks',
};

const EDGE_PX = 6;
const MAX_ZOOM = 128;
const HEIGHT = 200;

type Drag =
    | { kind: 'create'; anchor: number; x0: number; moved: boolean }
    | { kind: 'edge'; index: number; side: 0 | 1 }
    | { kind: 'move'; index: number; grab: number; x0: number; moved: boolean; original: Part };

/**
 * A source up close, to mark the parts the mangler may take snippets from.
 * Drag on the wave to add a part; drag a part's edge to resize it, its middle
 * to move it; click it to select. No parts means the whole file.
 */
export const SourcePartsModal: React.FC<SourcePartsModalProps> = ({
    source, load, playRegion, stop, playing, position, onSave, onKit, onSlices, onClose,
}) => {
    const [audio, setAudio] = useState<AudioBuffer | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [parts, setParts] = useState<Part[]>(() => source.regions ?? []);
    const [selected, setSelected] = useState<number | null>(null);
    // Hits, in frames of the decoded audio. Null until "Find hits".
    const [hits, setHits] = useState<Hit[] | null>(null);
    const [finding, setFinding] = useState(false);
    const [hitLevel, setHitLevel] = useState<HitLevel>('normal');
    const [tailDb, setTailDb] = useState(30);
    const [selectedHit, setSelectedHit] = useState<number | null>(null);
    const [list, setList] = useState<'parts' | 'hits'>('parts');
    const [zoom, setZoom] = useState(1);
    const [view, setView] = useState({ width: 0, scroll: 0 });
    const scrollRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const dragRef = useRef<Drag | null>(null);
    const previousZoom = useRef(zoom);
    const dialogRef = useRef<HTMLDivElement>(null);
    useEffect(() => { dialogRef.current?.focus(); }, []);
    const duration = audio?.duration ?? source.duration;
    const playingHere = playing?.resultId === source.id ? playing : null;

    useEscapeLayer(true, () => { stop(); onClose(); return true; });

    useEffect(() => {
        let alive = true;
        load(source.id, source.blob)
            .then(buffer => { if (alive) setAudio(buffer); })
            .catch(e => { console.error(e); if (alive) setError('This file could not be decoded.'); });
        return () => { alive = false; };
    }, [load, source.id, source.blob]);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const update = () => setView({ width: el.clientWidth, scroll: el.scrollLeft });
        update();
        const observer = new ResizeObserver(update);
        observer.observe(el);
        el.addEventListener('scroll', update, { passive: true });
        return () => { observer.disconnect(); el.removeEventListener('scroll', update); };
    }, []);

    useLayoutEffect(() => {
        const el = scrollRef.current;
        if (!el || previousZoom.current === zoom) return;
        const centre = (el.scrollLeft + el.clientWidth / 2) / (el.clientWidth * previousZoom.current);
        previousZoom.current = zoom;
        el.scrollLeft = Math.max(0, centre * el.clientWidth * zoom - el.clientWidth / 2);
    }, [zoom]);

    const totalPx = view.width * zoom;
    const timeAt = useCallback((clientX: number) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect || totalPx === 0) return 0;
        return Math.min(duration, Math.max(0, ((clientX - rect.left + view.scroll) / totalPx) * duration));
    }, [duration, totalPx, view.scroll]);
    const xOf = useCallback((t: number) => (t / duration) * totalPx - view.scroll, [duration, totalPx, view.scroll]);

    // Draw
    useEffect(() => {
        const canvas = canvasRef.current;
        const { width } = view;
        if (!canvas || width === 0) return;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(HEIGHT * dpr);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, width, HEIGHT);
        const mid = HEIGHT / 2;

        if (audio) {
            const l = audio.getChannelData(0);
            const r = audio.numberOfChannels > 1 ? audio.getChannelData(1) : l;
            const perPx = l.length / totalPx;
            const stride = Math.max(1, Math.floor(perPx / 64));
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            for (let x = 0; x < width; x++) {
                const from = Math.floor((view.scroll + x) * perPx);
                const to = Math.min(l.length, Math.max(from + 1, Math.floor((view.scroll + x + 1) * perPx)));
                let max = 0;
                for (let i = from; i < to; i += stride) max = Math.max(max, Math.abs(l[i]), Math.abs(r[i]));
                const a = Math.max(0.5, max * (HEIGHT - 10) / 2);
                ctx.fillRect(x, mid - a, 1, 2 * a);
            }
        }

        // With parts, what lies outside them is dimmed: it won't be used.
        if (parts.length) {
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            let cursor = 0;
            for (const [a, b] of [...parts, [duration, duration] as Part]) {
                const x0 = xOf(cursor), x1 = xOf(a);
                if (x1 > x0) ctx.fillRect(x0, 0, x1 - x0, HEIGHT);
                cursor = b;
            }
        }
        parts.forEach(([a, b], i) => {
            const x0 = xOf(a), x1 = xOf(b);
            const isSelected = i === selected;
            ctx.fillStyle = isSelected ? 'rgba(240,15,19,0.22)' : 'rgba(240,15,19,0.10)';
            ctx.fillRect(x0, 0, x1 - x0, HEIGHT);
            ctx.fillStyle = isSelected ? '#f00f13' : 'rgba(240,15,19,0.7)';
            ctx.fillRect(Math.round(x0), 0, isSelected ? 3 : 2, HEIGHT);
            ctx.fillRect(Math.round(x1) - (isSelected ? 3 : 2), 0, isSelected ? 3 : 2, HEIGHT);
            ctx.font = '10px ui-monospace, monospace';
            ctx.fillText(String(i + 1), x0 + 5, 12);
        });

        if (hits && audio) {
            const sr = audio.sampleRate;
            hits.forEach((h, i) => {
                const x0 = xOf(h.start / sr), x1 = Math.max(x0 + 1, xOf(h.end / sr));
                if (x1 < 0 || x0 > width) return;
                const isSelected = i === selectedHit;
                ctx.fillStyle = CLASS_COLOR[h.cls];
                ctx.globalAlpha = isSelected ? 0.35 : 0.12;
                ctx.fillRect(x0, 0, x1 - x0, HEIGHT - LANE);
                ctx.globalAlpha = isSelected ? 1 : 0.75;
                ctx.fillRect(x0, HEIGHT - LANE + 3, x1 - x0, LANE - 6);
                ctx.fillRect(Math.round(x0), 0, 1, HEIGHT - LANE);
                ctx.globalAlpha = 1;
            });
        }

        if (playingHere && position !== null) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(Math.round(xOf(position)), 0, 1, HEIGHT);
        }
    }, [audio, view, totalPx, parts, selected, duration, xOf, playingHere, position, hits, selectedHit]);

    const hit = (clientX: number): { index: number; side: 0 | 1 | null } | null => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return null;
        const x = clientX - rect.left;
        for (let i = parts.length - 1; i >= 0; i--) {
            const x0 = xOf(parts[i][0]), x1 = xOf(parts[i][1]);
            if (Math.abs(x - x0) <= EDGE_PX) return { index: i, side: 0 };
            if (Math.abs(x - x1) <= EDGE_PX) return { index: i, side: 1 };
            if (x > x0 && x < x1) return { index: i, side: null };
        }
        return null;
    };

    const hitAt = (clientX: number): number => {
        if (!hits || !audio) return -1;
        const t = timeAt(clientX) * audio.sampleRate;
        const slack = (EDGE_PX / Math.max(1, totalPx)) * audio.length;
        return hits.findIndex(h => t >= h.start - slack && t <= h.end + slack);
    };

    const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!audio) return;
        // The hit lane: select and play, never a drag.
        if (hits && e.nativeEvent.offsetY >= HEIGHT - LANE) {
            const i = hitAt(e.clientX);
            if (i >= 0) { setSelectedHit(i); setList('hits'); playHit(i); }
            return;
        }
        e.currentTarget.setPointerCapture(e.pointerId);
        const t = timeAt(e.clientX);
        const h = hit(e.clientX);
        if (h && h.side !== null) dragRef.current = { kind: 'edge', index: h.index, side: h.side };
        else if (h) dragRef.current = { kind: 'move', index: h.index, grab: t, x0: e.clientX, moved: false, original: parts[h.index] };
        else dragRef.current = { kind: 'create', anchor: t, x0: e.clientX, moved: false };
        if (h) setSelected(h.index);
    };

    const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const drag = dragRef.current;
        // Hits only (a result): no parts to draw, so a drag stays a click.
        if (!onSave && drag?.kind === 'create') return;
        const canvas = e.currentTarget;
        if (!drag) {
            const h = hit(e.clientX);
            canvas.style.cursor = h?.side !== null && h ? 'ew-resize' : h ? 'grab' : 'crosshair';
            return;
        }
        const t = timeAt(e.clientX);
        if (drag.kind === 'edge') {
            setParts(prev => prev.map((p, i) => {
                if (i !== drag.index) return p;
                return drag.side === 0 ? [Math.min(t, p[1] - MIN_PART), p[1]] : [p[0], Math.max(t, p[0] + MIN_PART)];
            }));
        } else if (drag.kind === 'move') {
            if (!drag.moved && Math.abs(e.clientX - drag.x0) < 3) return;
            drag.moved = true;
            const [a, b] = drag.original;
            const shift = Math.min(duration - b, Math.max(-a, t - drag.grab));
            setParts(prev => prev.map((p, i) => (i === drag.index ? [a + shift, b + shift] : p)));
        } else {
            if (!drag.moved && Math.abs(e.clientX - drag.x0) < 3) return;
            if (!drag.moved) {
                drag.moved = true;
                setParts(prev => [...prev, [drag.anchor, drag.anchor]]);
                setSelected(parts.length);
            }
            setParts(prev => {
                const next = [...prev];
                next[next.length - 1] = [Math.min(drag.anchor, t), Math.max(drag.anchor, t)];
                return next;
            });
        }
    };

    const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const drag = dragRef.current;
        dragRef.current = null;
        if (!drag || !audio) return;
        if (drag.kind === 'create' && !drag.moved) {
            // A click on the wave: listen from there.
            setSelected(null);
            playRegion({ resultId: source.id, index: -1, start: timeAt(e.clientX), end: duration, full: true }, source.blob);
            return;
        }
        // Tidy: merge overlaps, drop slivers, keep the selection on the same part.
        const keep = selected !== null ? parts[selected] : null;
        const tidy = normaliseParts(parts, duration);
        setParts(tidy);
        if (keep) {
            const at = tidy.findIndex(([a, b]) => a <= keep[0] + 1e-6 && b >= keep[1] - 1e-6);
            setSelected(at >= 0 ? at : null);
        }
    };

    const playPart = (i: number) => {
        const [a, b] = parts[i];
        playRegion({ resultId: source.id, index: i, start: a, end: b }, source.blob);
    };
    const hitSpan = (h: Hit): Part => [h.start / (audio?.sampleRate ?? 48000), h.end / (audio?.sampleRate ?? 48000)];
    const playHit = (i: number) => {
        if (!hits?.[i]) return;
        const [a, b] = hitSpan(hits[i]);
        playRegion({ resultId: source.id, index: 1000 + i, start: a, end: b }, source.blob);
    };
    const dropHit = (i: number) => {
        setHits(prev => prev && prev.filter((_, k) => k !== i));
        setSelectedHit(null);
    };
    /** One hit with the next: a flam, or an attack the detector split. */
    const mergeHit = (i: number) => {
        setHits(prev => {
            if (!prev || i + 1 >= prev.length) return prev;
            const merged = { ...prev[i], end: prev[i + 1].end, peakDb: Math.max(prev[i].peakDb, prev[i + 1].peakDb) };
            return [...prev.slice(0, i), merged, ...prev.slice(i + 2)];
        });
    };
    const detect = async () => {
        if (!audio || finding) return;
        setFinding(true);
        try {
            const l = audio.getChannelData(0);
            const r = audio.numberOfChannels > 1 ? audio.getChannelData(1) : l;
            const found = await findHits(l, r, audio.sampleRate, { sensitivity: HIT_SENSITIVITY[hitLevel], endDb: tailDb });
            setHits(found);
            setSelectedHit(null);
            setList('hits');
        } catch (e) {
            console.error(e);
            setError('The hit detector failed on this file.');
        } finally {
            setFinding(false);
        }
    };
    // Hits only (a result): what the dialog is for, so they are found as soon as it opens.
    const autoFound = useRef(false);
    useEffect(() => {
        if (onSave || !audio || autoFound.current) return;
        autoFound.current = true;
        void detect();
    }); // every render, until the audio is in; then once
    const hitsToSlices = () => {
        if (!audio || !hits?.length) return;
        const l = audio.getChannelData(0);
        const r = audio.numberOfChannels > 1 ? audio.getChannelData(1) : l;
        onSlices(hits.map(h => {
            const [start, end] = hitSpan(h);
            const spec: SliceSpec = { start, end };
            return { spec, cls: h.cls, peaks: slicePeaks(renderSlice([l, r], audio.sampleRate, spec)) };
        }));
    };
    /** The hits as parts: snippets then come only from the sounds, never the silence. */
    const hitsAsParts = () => {
        if (!hits?.length) return;
        const spans = hits.map(hitSpan);
        // Parts are at least 50 ms: a short hit borrows from the silence after it.
        const widened = spans.map(([a, b], i) => [a, Math.min(spans[i + 1]?.[0] ?? duration, Math.max(b, a + MIN_PART))] as Part);
        setParts(normaliseParts(widened, duration));
        setSelected(null);
        setList('parts');
    };

    const removePart = (i: number) => {
        setParts(prev => prev.filter((_, k) => k !== i));
        setSelected(null);
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
        if ((e.key === 'Delete' || e.key === 'Backspace') && list === 'hits' && selectedHit !== null) {
            e.preventDefault();
            dropHit(selectedHit);
        } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected !== null) {
            e.preventDefault();
            removePart(selected);
        }
        if (e.key === ' ') {
            e.preventDefault();
            if (playingHere) stop();
            else if (list === 'hits' && selectedHit !== null) playHit(selectedHit);
            else if (selected !== null) playPart(selected);
            else playRegion({ resultId: source.id, index: -1, start: 0, end: duration, full: true }, source.blob);
        }
    };

    const used = parts.reduce((sum, [a, b]) => sum + b - a, 0);

    return (
        <div className="fixed inset-0 z-[90] bg-black/75 flex items-center justify-center p-4 sm:p-8" onKeyDown={onKeyDown}>
            <div className="w-full max-w-6xl max-h-full flex flex-col rounded-xl border border-white/10 bg-synthux-panel shadow-2xl"
                tabIndex={-1} ref={dialogRef}>
                <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-white/10">
                    <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-bold uppercase tracking-widest text-synthux-red">{onSave ? 'Parts and hits' : 'Hits'}</div>
                        <div className="text-sm font-bold truncate">{source.name}</div>
                    </div>
                    <button onClick={() => { stop(); onClose(); }} className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/10" aria-label="Close">
                        <X size={18} />
                    </button>
                </div>

                <div className="shrink-0 flex flex-wrap items-center gap-2 px-4 py-2 text-[11px] text-gray-400">
                    <ToolButton title="Zoom out" onClick={() => setZoom(z => Math.max(1, z / 2))} disabled={zoom <= 1}><Minus size={13} /></ToolButton>
                    <ToolButton title="Zoom in" onClick={() => setZoom(z => Math.min(MAX_ZOOM, z * 2))} disabled={zoom >= MAX_ZOOM}><Plus size={13} /></ToolButton>
                    <ToolButton title="Fit the whole file" onClick={() => setZoom(1)} disabled={zoom === 1}><Maximize2 size={12} /></ToolButton>
                    <span className="font-mono w-10">{zoom}×</span>
                    <ToolButton title={playingHere ? 'Stop' : 'Play the whole file (Space)'}
                        onClick={() => (playingHere ? stop() : playRegion({ resultId: source.id, index: -1, start: 0, end: duration, full: true }, source.blob))}>
                        {playingHere ? <Square size={11} fill="currentColor" /> : <Play size={12} />}
                    </ToolButton>
                    <span className="ml-2">
                        {!onSave ? formatSeconds(duration) : parts.length
                            ? `${parts.length} part${parts.length === 1 ? '' : 's'} · ${formatSeconds(used)} of ${formatSeconds(duration)} in use`
                            : `No parts: the whole ${formatSeconds(duration)} is used`}
                    </span>
                    {parts.length > 0 && (
                        <button onClick={() => { setParts([]); setSelected(null); }}
                            className="ml-auto px-2 py-1 rounded border border-white/10 hover:text-white hover:bg-white/5">
                            Clear all (use the whole file)
                        </button>
                    )}
                </div>

                <div className="shrink-0 flex flex-wrap items-center gap-2 px-4 pb-2 text-[11px] text-gray-400">
                    <button onClick={detect} disabled={!audio || finding}
                        title="Find the hits: where each sound starts and where it has died away"
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-synthux-red/50 text-white hover:bg-synthux-red/20 disabled:opacity-40">
                        {finding ? <Loader size={12} className="animate-spin" /> : <Scissors size={12} />} {hits ? 'Find again' : 'Find hits'}
                    </button>
                    <select value={hitLevel} onChange={e => setHitLevel(e.target.value as HitLevel)} aria-label="Sensitivity"
                        title="Gentle: only the clearest hits. Aggressive: every small attack"
                        className="bg-black/40 border border-white/10 rounded px-1 py-1 text-gray-200">
                        <option value="gentle">Gentle</option>
                        <option value="normal">Normal</option>
                        <option value="aggressive">Aggressive</option>
                    </select>
                    <select value={tailDb} onChange={e => setTailDb(Number(e.target.value))} aria-label="Tail"
                        title="Where a hit ends: this far below its peak. What comes after, up to the next hit, is silence and is left out"
                        className="bg-black/40 border border-white/10 rounded px-1 py-1 text-gray-200">
                        <option value={20}>Short tails (−20 dB)</option>
                        <option value={30}>Tails to −30 dB</option>
                        <option value={45}>Long tails (−45 dB)</option>
                    </select>
                    {hits && (
                        <>
                            <span className="flex items-center gap-2 ml-1">
                                {hits.length} hit{hits.length === 1 ? '' : 's'}
                                {(['low', 'mid', 'high'] as const).map(c => (
                                    <span key={c} className="flex items-center gap-1" title={CLASS_HINT[c]}>
                                        <span className="inline-block h-2 w-2 rounded-sm" style={{ background: CLASS_COLOR[c] }} />
                                        {hits.filter(h => h.cls === c).length}
                                    </span>
                                ))}
                            </span>
                            <span className="ml-auto flex gap-2">
                                {onSave && <button onClick={hitsAsParts} disabled={!hits.length}
                                    title="Make the hits the parts: snippets then come only from the sounds, never the silence between them"
                                    className="px-2 py-1 rounded border border-white/10 hover:text-white hover:bg-white/5 disabled:opacity-40">
                                    Use as parts
                                </button>}
                                <button onClick={hitsToSlices} disabled={!hits.length}
                                    title="Keep every hit in the slice pool, to collect, audition and make kits from"
                                    className="px-2 py-1 rounded border border-white/10 hover:text-white hover:bg-white/5 disabled:opacity-40">
                                    To slices
                                </button>
                                <button onClick={() => { stop(); onKit(hits.map(hitSpan)); }} disabled={!hits.length}
                                    title="A new result: every hit once, in order, with a cue point at each, so the slice mode plays one sound per slice"
                                    className="px-2 py-1 rounded border border-synthux-red/50 text-white hover:bg-synthux-red/20 disabled:opacity-40">
                                    Make a kit
                                </button>
                            </span>
                        </>
                    )}
                </div>

                <div className="px-4">
                    <div
                        ref={scrollRef}
                        className="relative rounded bg-black/40 overflow-x-auto overflow-y-hidden pb-1
                            [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:bg-black/40 [&::-webkit-scrollbar-thumb]:bg-synthux-red/50
                            [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb:hover]:bg-synthux-red/80
                            [scrollbar-color:rgba(240,15,19,0.5)_rgba(0,0,0,0.4)]"
                        style={{ height: HEIGHT + 12 }}
                    >
                        <div style={{ width: `${zoom * 100}%`, height: 1 }} aria-hidden />
                        <canvas
                            ref={canvasRef}
                            style={{ height: HEIGHT, width: view.width || '100%' }}
                            className="sticky left-0 top-0 block -mt-px touch-none"
                            onPointerDown={onPointerDown}
                            onPointerMove={onPointerMove}
                            onPointerUp={onPointerUp}
                        />
                        {!audio && (
                            <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm gap-2">
                                {error ?? <><Loader size={16} className="animate-spin" /> Decoding…</>}
                            </div>
                        )}
                    </div>
                    <p className="mt-1 text-[10px] text-gray-500">
                        {onSave
                            ? <>Drag on the wave to add a part · drag an edge to resize, the middle to move · click the wave to listen from there ·
                                Delete removes the selected part · Space plays it{hits ? ' · click a hit in the strip under the wave to hear it' : ''}</>
                            : <>Click the wave to listen from there · click a hit in the strip under the wave to hear it · To slices and Make a kit
                                put this result in the source pool too (switched off), as the slices&apos; source</>}
                    </p>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto px-4 py-2">
                    {hits && (
                        <div className="flex gap-1 mb-2 text-[10px] font-bold uppercase tracking-widest">
                            {([['hits', `Hits (${hits.length})`], ...(onSave ? [['parts', `Parts (${parts.length})`] as const] : [])] as const).map(([id, label]) => (
                                <button key={id} onClick={() => setList(id)}
                                    className={`px-2 py-1 rounded ${list === id ? 'bg-synthux-red/80 text-white' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}>
                                    {label}
                                </button>
                            ))}
                        </div>
                    )}
                    {hits && list === 'hits' && (
                        <table className="w-full text-[11px] font-mono">
                            <tbody>
                                {hits.map((h, i) => {
                                    const [a, b] = hitSpan(h);
                                    const isPlaying = playingHere?.index === 1000 + i;
                                    return (
                                        <tr key={`${h.start}-${i}`} onClick={() => setSelectedHit(i)}
                                            className={`border-t border-white/5 cursor-pointer ${i === selectedHit ? 'bg-synthux-red/15' : 'hover:bg-white/[0.03]'}`}>
                                            <td className="px-2 py-1 text-gray-500 w-8">{i + 1}</td>
                                            <td className="px-2 py-1">{formatSeconds(a)}</td>
                                            <td className="px-2 py-1 text-gray-400">{Math.round((b - a) * 1000)} ms</td>
                                            <td className="px-2 py-1" title={`${CLASS_HINT[h.cls]} · centroid ${Math.round(h.centroid)} Hz`}>
                                                <span className="inline-flex items-center gap-1">
                                                    <span className="inline-block h-2 w-2 rounded-sm" style={{ background: CLASS_COLOR[h.cls] }} />{h.cls}
                                                </span>
                                            </td>
                                            <td className="px-2 py-1 text-gray-400 text-right">{Math.round(h.peakDb)} dB</td>
                                            <td className="px-2 py-1 w-24">
                                                <span className="flex justify-end gap-1">
                                                    <ToolButton title={isPlaying ? 'Stop' : 'Play this hit'}
                                                        onClick={() => (isPlaying ? stop() : playHit(i))}>
                                                        {isPlaying ? <Square size={10} fill="currentColor" /> : <Play size={11} />}
                                                    </ToolButton>
                                                    <ToolButton title="Merge with the next hit" onClick={() => mergeHit(i)} disabled={i + 1 >= hits.length}>
                                                        <Combine size={11} />
                                                    </ToolButton>
                                                    <ToolButton title="Drop this hit" onClick={() => dropHit(i)}>
                                                        <Trash2 size={11} />
                                                    </ToolButton>
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                    {(!hits || list === 'parts') && parts.length > 0 && (
                        <table className="w-full text-[11px] font-mono">
                            <tbody>
                                {parts.map(([a, b], i) => {
                                    const isPlaying = playingHere?.index === i;
                                    return (
                                        <tr key={i} onClick={() => setSelected(i)}
                                            className={`border-t border-white/5 cursor-pointer ${i === selected ? 'bg-synthux-red/15' : 'hover:bg-white/[0.03]'}`}>
                                            <td className="px-2 py-1 text-gray-500 w-8">{i + 1}</td>
                                            <td className="px-2 py-1">{formatSeconds(a)} – {formatSeconds(b)}</td>
                                            <td className="px-2 py-1 text-gray-400">{formatSeconds(b - a)}</td>
                                            <td className="px-2 py-1 w-16">
                                                <span className="flex justify-end gap-1">
                                                    <ToolButton title={isPlaying ? 'Stop' : 'Play this part'}
                                                        onClick={() => (isPlaying ? stop() : playPart(i))}>
                                                        {isPlaying ? <Square size={10} fill="currentColor" /> : <Play size={11} />}
                                                    </ToolButton>
                                                    <ToolButton title="Remove this part" onClick={() => removePart(i)}>
                                                        <Trash2 size={11} />
                                                    </ToolButton>
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                <div className="shrink-0 flex items-center justify-end gap-2 px-4 py-3 border-t border-white/10">
                    <button onClick={() => { stop(); onClose(); }}
                        className="px-4 py-1.5 rounded-full text-xs font-bold text-gray-300 border border-white/15 hover:bg-white/10">
                        {onSave ? 'Cancel' : 'Close'}
                    </button>
                    {onSave && <button onClick={() => { stop(); onSave(normaliseParts(parts, duration)); }} disabled={!audio}
                        className="px-4 py-1.5 rounded-full text-xs font-bold bg-synthux-red text-white hover:bg-synthux-red/80 disabled:opacity-40">
                        Save parts
                    </button>}
                </div>
            </div>
        </div>
    );
};

const ToolButton: React.FC<{ title: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }> = ({
    title, onClick, disabled, children,
}) => (
    <button onClick={e => { e.stopPropagation(); onClick(); }} disabled={disabled} title={title} aria-label={title}
        className="h-6 w-6 flex items-center justify-center rounded border border-white/10 text-gray-300
            hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed">
        {children}
    </button>
);
