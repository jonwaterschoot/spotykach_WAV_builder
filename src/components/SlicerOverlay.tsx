import React, { useRef, useCallback, useState, useEffect } from 'react';

interface SlicerOverlayProps {
    points: number[]; // time positions in seconds
    duration: number;
    width: number;
    height: number;
    maxSlices: number;
    onPointsChange: (points: number[]) => void;
    active: boolean;
}

const SlicerOverlay: React.FC<SlicerOverlayProps> = ({
    points,
    duration,
    width,
    height,
    maxSlices,
    onPointsChange,
    active,
}) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const [dragIdx, setDragIdx] = useState<number | null>(null);

    const timeToX = useCallback((t: number) => (t / duration) * width, [duration, width]);
    const xToTime = useCallback((x: number) => Math.max(0, Math.min(duration, (x / width) * duration)), [duration, width]);

    const getMouseX = useCallback((e: React.MouseEvent | MouseEvent) => {
        if (!svgRef.current) return 0;
        const rect = svgRef.current.getBoundingClientRect();
        return e.clientX - rect.left;
    }, []);

    // Double-click to add a slice point
    const handleDoubleClick = useCallback((e: React.MouseEvent) => {
        if (!active) return;
        if (points.length >= maxSlices) return;
        e.preventDefault();
        e.stopPropagation();
        const x = getMouseX(e);
        const time = xToTime(x);
        const newPoints = [...points, time].sort((a, b) => a - b);
        onPointsChange(newPoints);
    }, [active, points, maxSlices, getMouseX, xToTime, onPointsChange]);

    // Start dragging a slice point
    const handlePointMouseDown = useCallback((e: React.MouseEvent, idx: number) => {
        if (!active) return;
        e.preventDefault();
        e.stopPropagation();
        setDragIdx(idx);
    }, [active]);

    // Global mouse move/up for dragging
    useEffect(() => {
        if (dragIdx === null) return;

        const handleMouseMove = (e: MouseEvent) => {
            const x = getMouseX(e);
            const time = xToTime(x);
            const newPoints = [...points];
            newPoints[dragIdx] = time;
            // Keep sorted
            newPoints.sort((a, b) => a - b);
            onPointsChange(newPoints);
        };

        const handleMouseUp = () => {
            setDragIdx(null);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [dragIdx, points, getMouseX, xToTime, onPointsChange]);

    // Delete key removes hovered/closest point (simplified: remove last added)
    useEffect(() => {
        if (!active) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.key === 'Delete' || e.key === 'Backspace') && points.length > 0) {
                // Remove last point as a simple UX
                e.preventDefault();
                onPointsChange(points.slice(0, -1));
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [active, points, onPointsChange]);

    if (!active || width <= 0 || duration <= 0) return null;

    // Sorted points for rendering
    const sorted = [...points].sort((a, b) => a - b);

    return (
        <svg
            ref={svgRef}
            className="absolute inset-0 z-20"
            width={width}
            height={height}
            style={{ pointerEvents: active ? 'auto' : 'none' }}
            onDoubleClick={handleDoubleClick}
        >
            {sorted.map((time, idx) => {
                const x = timeToX(time);
                const sliceNum = idx + 1;

                return (
                    <g key={idx}>
                        {/* Slice line */}
                        <line
                            x1={x}
                            y1={0}
                            x2={x}
                            y2={height}
                            stroke="#22d3ee"
                            strokeWidth={2}
                            strokeDasharray="4 2"
                            opacity={0.8}
                        />

                        {/* Drag handle (wider invisible area) */}
                        <rect
                            x={x - 6}
                            y={0}
                            width={12}
                            height={height}
                            fill="transparent"
                            style={{ cursor: 'ew-resize' }}
                            onMouseDown={(e) => handlePointMouseDown(e, idx)}
                        />

                        {/* Slice number badge */}
                        <circle
                            cx={x}
                            cy={14}
                            r={9}
                            fill="#0891b2"
                            stroke="#22d3ee"
                            strokeWidth={1.5}
                        />
                        <text
                            x={x}
                            y={18}
                            textAnchor="middle"
                            fill="white"
                            fontSize="9"
                            fontWeight="bold"
                            fontFamily="monospace"
                            pointerEvents="none"
                        >
                            {sliceNum}
                        </text>

                        {/* Time label at bottom */}
                        <text
                            x={x}
                            y={height - 4}
                            textAnchor="middle"
                            fill="rgba(34,211,238,0.6)"
                            fontSize="8"
                            fontFamily="monospace"
                            pointerEvents="none"
                        >
                            {time.toFixed(2)}s
                        </text>
                    </g>
                );
            })}

            {/* Slice count indicator */}
            <text
                x={width - 8}
                y={14}
                textAnchor="end"
                fill="rgba(34,211,238,0.5)"
                fontSize="9"
                fontFamily="monospace"
                pointerEvents="none"
            >
                {sorted.length}/{maxSlices}
            </text>

            {/* Slicer Not Implemented Banner */}
            <foreignObject x={0} y={0} width={width} height={height} className="pointer-events-none">
                <div
                    className="w-full h-full flex items-center justify-center p-4"
                >
                    <div className="bg-cyan-950/80 border border-cyan-500/50 backdrop-blur-md px-8 py-4 rounded-2xl shadow-2xl shadow-cyan-900/20 flex flex-col items-center gap-2 pointer-events-auto">
                        <div className="w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center border border-cyan-500/30">
                            <svg
                                width="20"
                                height="20"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="text-cyan-400 rotate-90"
                            >
                                <circle cx="6" cy="6" r="3" />
                                <circle cx="6" cy="18" r="3" />
                                <line x1="20" y1="4" x2="8.12" y2="15.88" />
                                <line x1="14.47" y1="14.48" x2="20" y2="20" />
                                <line x1="8.12" y1="8.12" x2="12" y2="12" />
                            </svg>
                        </div>
                        <span className="text-cyan-400 font-black uppercase tracking-[0.2em] text-sm text-center">
                            not implemented on Spotykach yet
                        </span>
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20">
                            <svg
                                width="10"
                                height="10"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="text-cyan-400"
                            >
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="8" x2="12" y2="12" />
                                <line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                            <span className="text-cyan-400/80 font-bold text-[9px] uppercase tracking-wider">
                                Marker editing only
                            </span>
                        </div>
                    </div>
                </div>
            </foreignObject>
        </svg>
    );
};

export default SlicerOverlay;
