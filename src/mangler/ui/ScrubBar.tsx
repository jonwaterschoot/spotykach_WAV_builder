import React, { useRef } from 'react';
import { formatSeconds } from './format';

interface ScrubBarProps {
    /** Seconds. */
    position: number;
    duration: number;
    onSeek: (seconds: number) => void;
}

/** A thin playhead bar under a source while it plays: click or drag to move. */
export const ScrubBar: React.FC<ScrubBarProps> = ({ position, duration, onSeek }) => {
    const barRef = useRef<HTMLDivElement>(null);
    const seekTo = (clientX: number) => {
        const rect = barRef.current?.getBoundingClientRect();
        if (!rect || duration <= 0) return;
        onSeek(Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * duration);
    };
    const fraction = duration > 0 ? Math.min(1, position / duration) : 0;

    return (
        <div className="flex items-center gap-2 pl-6 pr-1 pb-1 text-[9px] font-mono text-gray-500">
            <div
                ref={barRef}
                role="slider"
                aria-label="Playback position"
                aria-valuemin={0}
                aria-valuemax={Math.round(duration)}
                aria-valuenow={Math.round(position)}
                tabIndex={0}
                onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); seekTo(e.clientX); }}
                onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) seekTo(e.clientX); }}
                onKeyDown={e => {
                    if (e.key === 'ArrowRight') onSeek(Math.min(duration, position + 2));
                    if (e.key === 'ArrowLeft') onSeek(Math.max(0, position - 2));
                }}
                className="relative flex-1 h-3 cursor-pointer group focus:outline-none"
            >
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-white/10" />
                <div className="absolute left-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-synthux-red"
                    style={{ width: `${fraction * 100}%` }} />
                <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-2.5 w-2.5 rounded-full bg-white
                    shadow group-focus-visible:ring-2 group-focus-visible:ring-synthux-red"
                    style={{ left: `${fraction * 100}%` }} />
            </div>
            <span className="shrink-0 tabular-nums">{formatSeconds(position)} / {formatSeconds(duration)}</span>
        </div>
    );
};
