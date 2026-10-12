import React, { useEffect, useRef } from 'react';

interface ResultWaveformProps {
    peaks: number[];
    /** Snippet starts, 0–1 of the file. */
    boundaries: number[];
    /** Playhead, 0–1, or null when this result isn't playing. */
    progress: number | null;
    onSeek?: (fraction: number) => void;
    height?: number;
}

/**
 * A result's outline with a tick at every snippet start. Drawn from stored peaks,
 * so a list of 16 MB results never decodes one just to show it.
 */
export const ResultWaveform: React.FC<ResultWaveformProps> = ({ peaks, boundaries, progress, onSeek, height = 56 }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const draw = () => {
            const dpr = window.devicePixelRatio || 1;
            const width = canvas.clientWidth;
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(height * dpr);
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            ctx.scale(dpr, dpr);
            ctx.clearRect(0, 0, width, height);

            ctx.strokeStyle = 'rgba(255,255,255,0.10)';
            ctx.lineWidth = 1;
            for (const b of boundaries) {
                const x = Math.round(b * width) + 0.5;
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, height);
                ctx.stroke();
            }

            const mid = height / 2;
            const played = progress === null ? 0 : progress * width;
            const barWidth = width / Math.max(1, peaks.length);
            peaks.forEach((p, i) => {
                const x = i * barWidth;
                const h = Math.max(1, p * (height - 4));
                ctx.fillStyle = x < played ? '#f00f13' : 'rgba(255,255,255,0.55)';
                ctx.fillRect(x, mid - h / 2, Math.max(1, barWidth - 0.5), h);
            });

            if (progress !== null) {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(Math.round(played), 0, 1, height);
            }
        };
        draw();
        const observer = new ResizeObserver(draw);
        observer.observe(canvas);
        return () => observer.disconnect();
    }, [peaks, boundaries, progress, height]);

    return (
        <canvas
            ref={canvasRef}
            style={{ height }}
            className={`w-full block rounded bg-black/30 ${onSeek ? 'cursor-pointer' : ''}`}
            onClick={e => {
                if (!onSeek) return;
                const rect = e.currentTarget.getBoundingClientRect();
                onSeek(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)));
            }}
        />
    );
};
