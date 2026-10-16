import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Maximize2, Minus, Plus } from 'lucide-react';
import { appStorage } from '../../utils/storageNamespace';

interface ResultWaveformProps {
    /** Stored outline, used until (or unless) the decoded audio is there. */
    peaks: number[];
    /** Decoded audio, for detail when zoomed in. */
    audio?: AudioBuffer;
    /** Cue points, 0–1 of the file. Red when zoomed. */
    cues: number[];
    /** Snippet starts, 0–1, drawn faintly where they aren't also cues (after a re-cue). */
    edges?: number[];
    /** Crossfade zones, 0–1: tinted orange so the overlaps show. */
    fades?: [number, number][];
    /** Playhead, 0–1, or null when nothing in this result plays. */
    progress: number | null;
    /** Where playback started, 0–1: only `[playedFrom, progress]` is coloured as played. */
    playedFrom?: number;
    /** A span to tint, 0–1: the snippet playing or hovered. */
    highlight?: [number, number] | null;
    /** Click, as a fraction of the whole file. */
    onPick?: (fraction: number) => void;
    /** 1 = the whole file fits. Shows the zoom bar and a taller wave when set. */
    zoom?: number;
    onZoom?: (zoom: number) => void;
    /**
     * Crop mode: the kept stretch, 0–1. Outside it is dimmed; its two handles
     * drag, and a drag elsewhere marks a new stretch. Clicks don't play.
     */
    crop?: [number, number] | null;
    onCropChange?: (crop: [number, number]) => void;
    height?: number;
}

export const MAX_ZOOM = 64;

/** The zoomed wave's height, set with Alt+scroll and shared by every result. */
const WAVE_HEIGHT_KEY = 'mangler_wave_height';
const WAVE_HEIGHT_MIN = 96;
const WAVE_HEIGHT_MAX = 600;
const clampHeight = (h: number) => Math.round(Math.min(WAVE_HEIGHT_MAX, Math.max(WAVE_HEIGHT_MIN, h)));
const loadHeight = () => {
    const saved = Number(appStorage.getItem(WAVE_HEIGHT_KEY));
    return saved ? clampHeight(saved) : 160;
};
const GAIN_MIN = 0.5;
const GAIN_MAX = 15;

/**
 * A result's waveform with a tick at every snippet start.
 *
 * Only the visible slice is drawn: the canvas is the width of the view and sits
 * still while a spacer as wide as the zoomed file scrolls under it, so zooming
 * to 64× never asks for a canvas wider than browsers allow.
 */
export const ResultWaveform: React.FC<ResultWaveformProps> = ({
    peaks, audio, cues, edges, fades, progress, playedFrom = 0, highlight, onPick, zoom, onZoom, crop, onCropChange,
    height = 56,
}) => {
    const cropDrag = useRef<{ side: 0 | 1 } | { anchor: number } | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [view, setView] = useState({ width: 0, scroll: 0 });
    const zoomed = zoom !== undefined;
    const z = zoom ?? 1;
    const [zoomedHeight, setZoomedHeight] = useState(loadHeight);
    /** Amplitude zoom (Shift+scroll), as in the editor. */
    const [gain, setGain] = useState(1);
    const h = zoomed ? Math.max(height, zoomedHeight) : height;
    const previousZoom = useRef(z);
    /** Set by Ctrl+scroll: the file fraction to keep under the pointer, `offset` px from the view's left. */
    const zoomAnchor = useRef<{ fraction: number; offset: number } | null>(null);

    useEffect(() => {
        appStorage.setItem(WAVE_HEIGHT_KEY, String(zoomedHeight));
    }, [zoomedHeight]);

    // Track the view's width and scroll position.
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

    // Zooming keeps the middle of the view where it was, or with Ctrl+scroll the
    // point under the pointer.
    useLayoutEffect(() => {
        const el = scrollRef.current;
        if (!el || previousZoom.current === z) return;
        const anchor = zoomAnchor.current ?? {
            fraction: (el.scrollLeft + el.clientWidth / 2) / (el.clientWidth * previousZoom.current),
            offset: el.clientWidth / 2,
        };
        zoomAnchor.current = null;
        previousZoom.current = z;
        el.scrollLeft = Math.max(0, anchor.fraction * el.clientWidth * z - anchor.offset);
    }, [z]);

    /*
     * Modifier + scroll over the wave, as in the editor:
     *   Ctrl  → horizontal zoom, anchored at the pointer
     *   Alt   → wave height
     *   Shift → amplitude zoom
     * On a compact card any of them opens the zoomed view first. Browsers turn
     * Shift+wheel into a horizontal scroll (deltaX), so read whichever axis moved.
     */
    const handleWheel = (e: WheelEvent) => {
        if (!onZoom || (!e.ctrlKey && !e.altKey && !e.shiftKey)) return;
        const raw = e.deltaY || e.deltaX;
        if (!raw) return;
        e.preventDefault();
        const factor = raw < 0 ? 1.1 : 1 / 1.1;
        if (e.ctrlKey) {
            const el = scrollRef.current;
            const next = Math.round(Math.min(MAX_ZOOM, Math.max(1, z * factor)) * 100) / 100;
            if (el && next !== z) {
                const offset = e.clientX - el.getBoundingClientRect().left;
                zoomAnchor.current = { fraction: (el.scrollLeft + offset) / (el.clientWidth * z), offset };
            }
            onZoom(next);
            return;
        }
        if (!zoomed) onZoom(1);
        if (e.altKey) setZoomedHeight(v => clampHeight(v * factor));
        else setGain(g => Math.round(Math.min(GAIN_MAX, Math.max(GAIN_MIN, g * factor)) * 100) / 100);
    };
    // The listener is bound once (non-passive, to stop the page scrolling); it calls the current handler.
    const handleWheelRef = useRef(handleWheel);
    useEffect(() => { handleWheelRef.current = handleWheel; });
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => handleWheelRef.current(e);
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, []);

    // Follow the playhead when it leaves the view.
    useEffect(() => {
        const el = scrollRef.current;
        if (!el || progress === null || z <= 1) return;
        const x = progress * el.clientWidth * z;
        if (x < el.scrollLeft || x > el.scrollLeft + el.clientWidth - 8) {
            el.scrollLeft = Math.max(0, x - el.clientWidth * 0.1);
        }
    }, [progress, z]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const { width, scroll } = view;
        if (!canvas || width === 0) return;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(h * dpr);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, width, h);

        const total = width * z; // px for the whole file
        const toX = (fraction: number) => fraction * total - scroll;
        const mid = h / 2;

        if (highlight) {
            const x0 = toX(highlight[0]), x1 = toX(highlight[1]);
            ctx.fillStyle = 'rgba(240,15,19,0.14)';
            ctx.fillRect(x0, 0, Math.max(1, x1 - x0), h);
        }

        // Crossfades: an orange swell across each overlap.
        for (const [f0, f1] of fades ?? []) {
            const x0 = toX(f0), x1 = toX(f1);
            if (x1 < 0 || x0 > width || x1 - x0 < 1.5) continue;
            const gradient = ctx.createLinearGradient(x0, 0, x1, 0);
            gradient.addColorStop(0, 'rgba(245,139,68,0.04)');
            gradient.addColorStop(0.5, 'rgba(245,139,68,0.32)');
            gradient.addColorStop(1, 'rgba(245,139,68,0.04)');
            ctx.fillStyle = gradient;
            ctx.fillRect(x0, 0, x1 - x0, h);
        }

        ctx.lineWidth = 1;
        const cueSet = new Set(cues.map(c => Math.round(c * total)));
        if (edges) {
            ctx.strokeStyle = 'rgba(255,255,255,0.10)';
            ctx.setLineDash([2, 3]);
            for (const e of edges) {
                const x = Math.round(toX(e)) + 0.5;
                if (x < -1 || x > width + 1 || cueSet.has(Math.round(e * total))) continue;
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, h);
                ctx.stroke();
            }
            ctx.setLineDash([]);
        }

        ctx.strokeStyle = zoomed ? 'rgba(240,15,19,0.85)' : 'rgba(255,255,255,0.12)';
        ctx.fillStyle = zoomed ? 'rgba(255,120,120,0.9)' : 'rgba(255,255,255,0.35)';
        ctx.font = '9px ui-monospace, monospace';
        const labelEvery = Math.max(1, Math.ceil(28 / Math.max(1, total / Math.max(1, cues.length))));
        cues.forEach((c, i) => {
            const x = Math.round(toX(c)) + 0.5;
            if (x < -1 || x > width + 1) return;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
            if (zoomed && i % labelEvery === 0) ctx.fillText(String(i + 1), x + 2, 10);
        });

        const played = progress === null ? -Infinity : toX(progress);
        const playStart = progress === null ? Infinity : toX(playedFrom);
        const column = (x: number, amp: number) => {
            const a = Math.max(0.5, Math.min(1, amp * gain) * (h - 6) / 2);
            ctx.fillStyle = x >= playStart && x < played ? '#f00f13' : 'rgba(255,255,255,0.55)';
            ctx.fillRect(x, mid - a, 1, 2 * a);
        };

        if (audio && z > 1) {
            // Per pixel, from the audio itself.
            const l = audio.getChannelData(0);
            const r = audio.numberOfChannels > 1 ? audio.getChannelData(1) : l;
            const perPx = l.length / total;
            const stride = Math.max(1, Math.floor(perPx / 64));
            for (let x = 0; x < width; x++) {
                const from = Math.floor((scroll + x) * perPx);
                const to = Math.min(l.length, Math.max(from + 1, Math.floor((scroll + x + 1) * perPx)));
                let max = 0;
                for (let i = from; i < to; i += stride) {
                    const v = Math.max(Math.abs(l[i]), Math.abs(r[i]));
                    if (v > max) max = v;
                }
                column(x, max);
            }
        } else {
            for (let x = 0; x < width; x++) {
                const f0 = (scroll + x) / total, f1 = (scroll + x + 1) / total;
                const p0 = Math.floor(f0 * peaks.length), p1 = Math.max(p0 + 1, Math.ceil(f1 * peaks.length));
                let max = 0;
                for (let p = p0; p < p1 && p < peaks.length; p++) if (peaks[p] > max) max = peaks[p];
                column(x, max);
            }
        }

        if (progress !== null) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(Math.round(played), 0, 1, h);
        }

        if (crop) {
            const x0 = toX(crop[0]), x1 = toX(crop[1]);
            ctx.fillStyle = 'rgba(0,0,0,0.65)';
            ctx.fillRect(0, 0, Math.max(0, Math.min(width, x0)), h);
            if (x1 < width) ctx.fillRect(Math.max(0, x1), 0, width - Math.max(0, x1), h);
            ctx.fillStyle = '#ffb900';
            for (const x of [x0, x1]) {
                ctx.fillRect(Math.round(x) - 1, 0, 3, h);
                ctx.fillRect(Math.round(x) - 5, mid - 10, 11, 20);
            }
        }
    }, [view, peaks, audio, cues, edges, fades, progress, playedFrom, highlight, z, h, zoomed, crop, gain]);

    const fractionAt = (clientX: number, el: HTMLElement) => {
        const rect = el.getBoundingClientRect();
        return Math.min(1, Math.max(0, (clientX - rect.left + view.scroll) / (view.width * z)));
    };

    const setZoom = (next: number) => onZoom?.(Math.min(MAX_ZOOM, Math.max(1, next)));

    return (
        <div>
            {zoomed && (
                <div className="flex items-center gap-1 mb-1 text-[10px] text-gray-500">
                    <ZoomButton title="Zoom out" onClick={() => setZoom(z / 2)} disabled={z <= 1}><Minus size={12} /></ZoomButton>
                    <ZoomButton title="Zoom in" onClick={() => setZoom(z * 2)} disabled={z >= MAX_ZOOM}><Plus size={12} /></ZoomButton>
                    <ZoomButton title="Fit the whole file" onClick={() => setZoom(1)} disabled={z === 1}><Maximize2 size={11} /></ZoomButton>
                    <span className="font-mono ml-1 tabular-nums"
                        title="Ctrl+scroll zooms, Alt+scroll sets the height, Shift+scroll the amplitude">
                        {Number.isInteger(z) ? z : z.toFixed(1)}×{gain !== 1 && ` · amp ${gain.toFixed(1)}×`}
                    </span>
                    {!audio && z > 1 && <span className="ml-2">loading detail…</span>}
                    <span className="ml-auto">{crop
                        ? 'Drag the yellow handles (or across the wave) to set what stays'
                        : 'Red lines are cue points · orange is crossfade · click to play'}</span>
                </div>
            )}
            <div
                ref={scrollRef}
                className={`relative rounded bg-black/30 overflow-y-hidden ${zoomed ? 'overflow-x-auto pb-1' : 'overflow-x-hidden'}
                    [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:bg-black/40 [&::-webkit-scrollbar-track]:rounded
                    [&::-webkit-scrollbar-thumb]:bg-synthux-red/50 [&::-webkit-scrollbar-thumb]:rounded
                    [&::-webkit-scrollbar-thumb:hover]:bg-synthux-red/80 [scrollbar-color:rgba(240,15,19,0.5)_rgba(0,0,0,0.4)]`}
                style={{ height: h + (zoomed ? 12 : 0) }}
            >
                <div style={{ width: `${z * 100}%`, height: 1 }} aria-hidden />
                <canvas
                    ref={canvasRef}
                    // 100%, not the measured px: a fixed width would hold the view open
                    // and it could never shrink with the window. The bitmap follows `view`.
                    style={{ height: h, width: '100%' }}
                    className={`sticky left-0 top-0 block -mt-px touch-none ${crop ? 'cursor-ew-resize' : onPick ? 'cursor-pointer' : ''}`}
                    onPointerDown={e => {
                        if (!crop || !onCropChange) return;
                        e.currentTarget.setPointerCapture(e.pointerId);
                        const f = fractionAt(e.clientX, e.currentTarget);
                        const px = (g: number) => g * view.width * z - view.scroll;
                        const x = px(f);
                        if (Math.abs(x - px(crop[0])) <= 8) cropDrag.current = { side: 0 };
                        else if (Math.abs(x - px(crop[1])) <= 8) cropDrag.current = { side: 1 };
                        else cropDrag.current = { anchor: f };
                    }}
                    onPointerMove={e => {
                        const drag = cropDrag.current;
                        if (!drag || !crop || !onCropChange) return;
                        const f = fractionAt(e.clientX, e.currentTarget);
                        if ('side' in drag) {
                            onCropChange(drag.side === 0 ? [Math.min(f, crop[1] - 0.001), crop[1]] : [crop[0], Math.max(f, crop[0] + 0.001)]);
                        } else {
                            onCropChange([Math.min(drag.anchor, f), Math.max(drag.anchor, f) + 0.0005]);
                        }
                    }}
                    onPointerUp={() => { cropDrag.current = null; }}
                    onClick={e => {
                        if (crop || !onPick) return;
                        onPick(fractionAt(e.clientX, e.currentTarget));
                    }}
                />
            </div>
        </div>
    );
};

const ZoomButton: React.FC<{ title: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }> = ({
    title, onClick, disabled, children,
}) => (
    <button onClick={onClick} disabled={disabled} title={title} aria-label={title}
        className="h-6 w-6 flex items-center justify-center rounded border border-white/10 text-gray-300
            hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed">
        {children}
    </button>
);
