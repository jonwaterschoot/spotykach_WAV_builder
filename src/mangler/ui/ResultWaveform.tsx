import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Maximize2, Minus, Plus } from 'lucide-react';

interface ResultWaveformProps {
    /** Stored outline, used until (or unless) the decoded audio is there. */
    peaks: number[];
    /** Decoded audio, for detail when zoomed in. */
    audio?: AudioBuffer;
    /** Snippet starts, 0–1 of the file. */
    boundaries: number[];
    /** Playhead, 0–1, or null when nothing in this result plays. */
    progress: number | null;
    /** A span to tint, 0–1: the snippet playing or hovered. */
    highlight?: [number, number] | null;
    /** Click, as a fraction of the whole file. */
    onPick?: (fraction: number) => void;
    /** 1 = the whole file fits. Shows the zoom bar and a taller wave when set. */
    zoom?: number;
    onZoom?: (zoom: number) => void;
    height?: number;
}

export const MAX_ZOOM = 64;

/**
 * A result's waveform with a tick at every snippet start.
 *
 * Only the visible slice is drawn: the canvas is the width of the view and sits
 * still while a spacer as wide as the zoomed file scrolls under it, so zooming
 * to 64× never asks for a canvas wider than browsers allow.
 */
export const ResultWaveform: React.FC<ResultWaveformProps> = ({
    peaks, audio, boundaries, progress, highlight, onPick, zoom, onZoom, height = 56,
}) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [view, setView] = useState({ width: 0, scroll: 0 });
    const zoomed = zoom !== undefined;
    const z = zoom ?? 1;
    const h = zoomed ? Math.max(height, 160) : height;
    const previousZoom = useRef(z);

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

    // Zooming keeps the middle of the view where it was.
    useLayoutEffect(() => {
        const el = scrollRef.current;
        if (!el || previousZoom.current === z) return;
        const centre = (el.scrollLeft + el.clientWidth / 2) / (el.clientWidth * previousZoom.current);
        previousZoom.current = z;
        el.scrollLeft = Math.max(0, centre * el.clientWidth * z - el.clientWidth / 2);
    }, [z]);

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

        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1;
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.font = '9px ui-monospace, monospace';
        const labelEvery = Math.max(1, Math.ceil(28 / Math.max(1, total / Math.max(1, boundaries.length))));
        boundaries.forEach((b, i) => {
            const x = Math.round(toX(b)) + 0.5;
            if (x < -1 || x > width + 1) return;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
            if (zoomed && i % labelEvery === 0) ctx.fillText(String(i + 1), x + 2, 10);
        });

        const played = progress === null ? -Infinity : toX(progress);
        const column = (x: number, amp: number) => {
            const a = Math.max(0.5, amp * (h - 6) / 2);
            ctx.fillStyle = x < played ? '#f00f13' : 'rgba(255,255,255,0.55)';
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
    }, [view, peaks, audio, boundaries, progress, highlight, z, h, zoomed]);

    const setZoom = (next: number) => onZoom?.(Math.min(MAX_ZOOM, Math.max(1, next)));

    return (
        <div>
            {zoomed && (
                <div className="flex items-center gap-1 mb-1 text-[10px] text-gray-500">
                    <ZoomButton title="Zoom out" onClick={() => setZoom(z / 2)} disabled={z <= 1}><Minus size={12} /></ZoomButton>
                    <ZoomButton title="Zoom in" onClick={() => setZoom(z * 2)} disabled={z >= MAX_ZOOM}><Plus size={12} /></ZoomButton>
                    <ZoomButton title="Fit the whole file" onClick={() => setZoom(1)} disabled={z === 1}><Maximize2 size={11} /></ZoomButton>
                    <span className="font-mono ml-1 tabular-nums">{z}×</span>
                    {!audio && z > 1 && <span className="ml-2">loading detail…</span>}
                    <span className="ml-auto">Click a snippet to play it</span>
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
                    style={{ height: h, width: view.width || '100%' }}
                    className={`sticky left-0 top-0 block -mt-px ${onPick ? 'cursor-pointer' : ''}`}
                    onClick={e => {
                        if (!onPick) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = e.clientX - rect.left + view.scroll;
                        onPick(Math.min(1, Math.max(0, x / (view.width * z))));
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
