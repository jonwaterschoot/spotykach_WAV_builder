import React, { useEffect, useState, useMemo } from 'react';

interface MiniWaveformProps {
    blob?: Blob;
    buffer?: AudioBuffer; // optimization: pass buffer if already available
    width?: number;
    height?: number;
    color?: string;
    className?: string; // Add className prop
    progress?: number; // 0 to 1
    onSeek?: (progress: number) => void;
}

export const MiniWaveform = ({ blob, buffer: propBuffer, width = 100, height = 40, color = "#4ade80", className = "", progress = 0, onSeek }: MiniWaveformProps) => {
    const [peaks, setPeaks] = useState<number[]>([]);
    const containerRef = React.useRef<HTMLDivElement>(null);
    const isScrubbing = React.useRef(false);

    useEffect(() => {
        let mounted = true;

        const load = async () => {
            if (peaks.length > 0 && !blob && !propBuffer) return; // already loaded or nothing to load

            let buffer = propBuffer;

            if (!buffer && blob) {
                // Decode blob
                try {
                    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
                    const arrayBuffer = await blob.arrayBuffer();
                    buffer = await ctx.decodeAudioData(arrayBuffer);
                } catch (e) {
                    console.error("Failed to decode for mini waveform", e);
                    return;
                }
            }

            if (!buffer || !mounted) return;

            // Extract Peaks
            const channelData = buffer.getChannelData(0); // Use first channel

            const newPeaks: number[] = [];

            // We want roughly 'width' bars.
            // But for a smooth look, maybe we do line path?
            // Let's do a bar look or a mirrored path. mirrored path looks pro.

            const samplesToProcess = width; // e.g. 50 points
            const blockSize = Math.floor(channelData.length / samplesToProcess);

            for (let i = 0; i < samplesToProcess; i++) {
                let max = 0;
                const start = i * blockSize;
                const end = start + blockSize;

                // Optimize: don't loop everything if huge file
                // Just take max of a subsample or stride
                const stride = Math.max(1, Math.floor((end - start) / 10)); // sample 10 points per block

                for (let j = start; j < end; j += stride) {
                    const val = Math.abs(channelData[j]);
                    if (val > max) max = val;
                }
                newPeaks.push(max);
            }

            if (mounted) setPeaks(newPeaks);
        };

        load();

        return () => { mounted = false; };
    }, [blob, propBuffer, width]);

    // Render SVG Path
    const pathData = useMemo(() => {
        if (peaks.length === 0) return "";

        // Mirror view: center line is height / 2.
        // max amplitude 1 draws to 0 and height.

        const centerY = height / 2;

        // Let's simply draw lines for bars? or a polygon?
        // Polygon is nicer.

        let path = `M 0 ${centerY} `;

        // Top half
        peaks.forEach((peak, i) => {
            const x = (i / peaks.length) * width;
            const y = centerY - (peak * centerY * 0.9); // scale down slightly
            path += `L ${x} ${y} `;
        });

        // Right edge center
        path += `L ${width} ${centerY} `;

        // Bottom half (mirror)
        for (let i = peaks.length - 1; i >= 0; i--) {
            const peak = peaks[i];
            const x = (i / peaks.length) * width;
            const y = centerY + (peak * centerY * 0.9);
            path += `L ${x} ${y} `;
        }

        path += "Z";
        return path;

    }, [peaks, width, height]);

    const handlePointerDown = (e: React.PointerEvent) => {
        if (!onSeek || !containerRef.current) return;
        e.stopPropagation(); // Prevent parent drag/click interference
        isScrubbing.current = true;
        (e.target as Element).setPointerCapture(e.pointerId);
        handleScrub(e);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isScrubbing.current) return;
        handleScrub(e);
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (isScrubbing.current) {
            isScrubbing.current = false;
            (e.target as Element).releasePointerCapture(e.pointerId);
        }
    };

    const handleScrub = (e: React.PointerEvent) => {
        if (!containerRef.current || !onSeek) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const p = Math.max(0, Math.min(1, x / rect.width));
        onSeek(p);
    };

    return (
        <div
            ref={containerRef}
            className={`flex items-center justify-center opacity-80 relative ${className} ${onSeek ? 'cursor-ew-resize' : ''}`}
            style={{ width, height }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onClick={(e) => e.stopPropagation()} // Prevent opening editor on click
        >
            {peaks.length > 0 ? (
                <>
                    <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="pointer-events-none">
                        <path d={pathData} fill={color} />
                    </svg>
                    {/* Playhead */}
                    {progress > 0 && (
                        <div
                            className="absolute top-0 bottom-0 w-[2px] bg-white shadow-[0_0_4px_rgba(0,0,0,0.5)] pointer-events-none transition-all duration-75"
                            style={{ left: `${progress * 100}%` }}
                        />
                    )}
                </>
            ) : (
                <div className="w-full h-[1px] bg-gray-700 animate-pulse"></div>
            )}
        </div>
    );
};
