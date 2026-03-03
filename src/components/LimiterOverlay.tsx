import React, { useState, useCallback, useRef } from 'react';

interface LimiterOverlayProps {
    thresholdDb: number;
    onThresholdChange: (db: number) => void;
    width: number;
    height: number;
    vZoom: number;
    active: boolean;
}

export const LimiterOverlay: React.FC<LimiterOverlayProps> = ({
    thresholdDb,
    onThresholdChange,
    width,
    height,
    vZoom,
    active
}) => {
    const [isDragging, setIsDragging] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const centerY = height / 2;
    const amplitude = Math.pow(10, thresholdDb / 20);
    const topY = centerY - (amplitude * centerY * vZoom);
    const bottomY = centerY + (amplitude * centerY * vZoom);

    const handlePointerDown = (e: React.PointerEvent) => {
        if (!active) return;
        setIsDragging(true);
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!isDragging || !containerRef.current || !active) return;

        const rect = containerRef.current.getBoundingClientRect();
        const y = e.clientY - rect.top;

        // Calculate amplitude based on distance from center
        const offset = Math.abs(centerY - y);
        let newAmp = offset / (centerY * vZoom);

        // Clamp amplitude to 0..1 (0dB max for peak limiter)
        newAmp = Math.max(Math.pow(10, -48 / 20), Math.min(1, newAmp));

        const newDb = Math.round(20 * Math.log10(newAmp) * 2) / 2; // Step 0.5
        onThresholdChange(newDb);
    }, [isDragging, centerY, vZoom, active, onThresholdChange]);

    const handlePointerUp = (e: React.PointerEvent) => {
        setIsDragging(false);
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    };

    if (!active) return null;

    return (
        <div
            ref={containerRef}
            className="absolute inset-0 z-40 touch-none pointer-events-none"
            style={{ width, height }}
        >
            <div className="relative w-full h-full pointer-events-none">
                {/* Top Threshold Line */}
                <div
                    className={`absolute left-0 right-0 h-px border-t border-dashed border-red-500/80 pointer-events-auto cursor-ns-resize group ${isDragging ? 'opacity-100' : 'opacity-60 hover:opacity-100'}`}
                    style={{ top: topY }}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                >
                    <div className="absolute -top-3 left-4 px-1.5 py-0.5 bg-red-500 text-white text-[9px] font-bold rounded opacity-0 group-hover:opacity-100 transition-opacity">
                        {thresholdDb} dB
                    </div>
                    {/* Invisible Larger Grab Area */}
                    <div className="absolute -top-3 -bottom-3 left-0 right-0" />
                </div>

                {/* Bottom Threshold Line (Mirror) */}
                <div
                    className={`absolute left-0 right-0 h-px border-t border-dashed border-red-500/80 pointer-events-auto cursor-ns-resize group ${isDragging ? 'opacity-100' : 'opacity-60 hover:opacity-100'}`}
                    style={{ top: bottomY }}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                >
                    <div className="absolute -top-3 left-4 px-1.5 py-0.5 bg-red-500 text-white text-[9px] font-bold rounded opacity-0 group-hover:opacity-100 transition-opacity">
                        {thresholdDb} dB
                    </div>
                    {/* Invisible Larger Grab Area */}
                    <div className="absolute -top-3 -bottom-3 left-0 right-0" />
                </div>

                {/* Shaded Area outside threshold */}
                <div
                    className="absolute left-0 right-0 bg-red-500/10 pointer-events-none"
                    style={{ top: 0, height: Math.max(0, topY) }}
                />
                <div
                    className="absolute left-0 right-0 bg-red-500/10 pointer-events-none"
                    style={{ top: bottomY, bottom: 0 }}
                />
            </div>
        </div>
    );
};
