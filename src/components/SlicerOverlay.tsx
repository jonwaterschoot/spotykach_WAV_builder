import React, { useRef, useCallback, useState, useEffect } from 'react';
import { isCoarsePointer } from '../utils/touchGestures';

interface SlicerOverlayProps {
    points: number[]; // time positions in seconds
    duration: number;
    width: number;
    height: number;
    maxSlices: number;
    onPointsChange: (points: number[]) => void;
    active: boolean;
    activeSliceIdx?: number;
    onActiveSliceChange?: (idx: number) => void;
    hoveredMarkerIdx?: number | null;
    showAlways?: boolean;
    isLocked?: boolean;
}

const SlicerOverlay: React.FC<SlicerOverlayProps> = ({
    points,
    duration,
    width,
    height,
    maxSlices,
    onPointsChange,
    active,
    activeSliceIdx,
    onActiveSliceChange,
    hoveredMarkerIdx,
    showAlways = false,
    isLocked = false,
}) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const [dragIdx, setDragIdx] = useState<number | null>(null);
    const [hoverIdx, setHoverIdx] = useState<number | null>(null);
    const wasDragging = useRef(false);
    const grab = isCoarsePointer() ? 32 : 16;

    const timeToX = useCallback((t: number) => (t / duration) * width, [duration, width]);
    const xToTime = useCallback((x: number) => Math.max(0, Math.min(duration, (x / width) * duration)), [duration, width]);

    const getMouseX = useCallback((e: React.MouseEvent | MouseEvent) => {
        if (!svgRef.current) return 0;
        const rect = svgRef.current.getBoundingClientRect();
        return e.clientX - rect.left;
    }, []);

    // Double-click to add a slice point
    const handleDoubleClick = useCallback((e: React.MouseEvent) => {
        if (!active || isLocked) return;
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
        if (!active || isLocked) return;
        e.preventDefault();
        e.stopPropagation();
        setDragIdx(idx);
    }, [active]);

    // Global mouse move/up for dragging
    useEffect(() => {
        if (dragIdx === null) return;

        const handleMouseMove = (e: MouseEvent) => {
            wasDragging.current = true;
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
            setTimeout(() => {
                if (wasDragging.current) wasDragging.current = false;
            }, 50);
        };

        window.addEventListener('pointermove', handleMouseMove);
        window.addEventListener('pointerup', handleMouseUp);
        window.addEventListener('pointercancel', handleMouseUp);
        return () => {
            window.removeEventListener('pointermove', handleMouseMove);
            window.removeEventListener('pointerup', handleMouseUp);
            window.removeEventListener('pointercancel', handleMouseUp);
        };
    }, [dragIdx, points, getMouseX, xToTime, onPointsChange]);

    const handleSvgClick = useCallback((e: React.MouseEvent) => {
        if (!active || isLocked || wasDragging.current || !onActiveSliceChange) return;
        const x = getMouseX(e);
        const time = xToTime(x);

        let foundIdx = points.length;
        const sortedPts = [...points].sort((a, b) => a - b);
        for (let i = 0; i < sortedPts.length; i++) {
            if (time < sortedPts[i]) {
                foundIdx = i;
                break;
            }
        }
        onActiveSliceChange(foundIdx);
    }, [active, onActiveSliceChange, getMouseX, xToTime, points]);

    // Delete key removes hovered/closest point (simplified: remove last added)
    useEffect(() => {
        if (!active || isLocked) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.key === 'Delete' || e.key === 'Backspace') && points.length > 0) {
                // Remove last point as a simple UX
                e.preventDefault();
                onPointsChange(points.slice(0, -1));
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [active, isLocked, points, onPointsChange]);

    if ((!active && !showAlways) || width <= 0 || duration <= 0) return null;

    // Sorted points for rendering
    const sorted = [...points].sort((a, b) => a - b);

    const activeStart = activeSliceIdx === 0 ? 0 : (activeSliceIdx && sorted[activeSliceIdx - 1]) || 0;
    const activeEnd = activeSliceIdx !== undefined && activeSliceIdx < sorted.length ? sorted[activeSliceIdx] : duration;

    return (
        <svg
            ref={svgRef}
            className="absolute inset-0 z-20"
            width={width}
            height={height}
            style={{ pointerEvents: active ? 'auto' : 'none' }}
            onDoubleClick={handleDoubleClick}
            onClick={handleSvgClick}
        >
            {activeSliceIdx !== undefined && active && (
                <rect
                    x={timeToX(activeStart)}
                    y={0}
                    width={Math.max(0, timeToX(activeEnd) - timeToX(activeStart))}
                    height={height}
                    fill="rgba(248, 113, 113, 0.15)"
                    pointerEvents="none"
                />
            )}

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
                            stroke={(hoverIdx === idx || hoveredMarkerIdx === idx) ? "#ffffff" : "#f87171"}
                            strokeWidth={(hoverIdx === idx || hoveredMarkerIdx === idx) ? 3 : 2}
                            strokeDasharray={(hoverIdx === idx || hoveredMarkerIdx === idx) ? "0" : "4 2"}
                            opacity={(hoverIdx === idx || hoveredMarkerIdx === idx) ? 1 : 0.8}
                            className="transition-all duration-150"
                        />

                        {/* Drag handle (wider invisible area) */}
                        <rect
                            x={x - grab / 2}
                            y={0}
                            width={grab}
                            height={height}
                            fill="transparent"
                            style={{ cursor: 'ew-resize' }}
                            onPointerDown={(e) => handlePointMouseDown(e, idx)}
                            onMouseEnter={() => setHoverIdx(idx)}
                            onMouseLeave={() => setHoverIdx(null)}
                        />

                        {/* Slice number badge */}
                        <circle
                            cx={x}
                            cy={14}
                            r={9}
                            fill={(hoverIdx === idx || hoveredMarkerIdx === idx) ? "#7f1d1d" : "#dc2626"}
                            stroke={(hoverIdx === idx || hoveredMarkerIdx === idx) ? "#ffffff" : "#f87171"}
                            strokeWidth={1.5}
                            onMouseEnter={() => setHoverIdx(idx)}
                            onMouseLeave={() => setHoverIdx(null)}
                            style={{ cursor: 'pointer' }}
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

                        {/* Remove Marker Icon on Hover */}
                        {hoverIdx === idx && active && !isLocked && (
                            <g
                                style={{ cursor: 'pointer' }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const newPoints = points.filter((_, i) => i !== idx);
                                    onPointsChange(newPoints);
                                    setHoverIdx(null);
                                }}
                                onMouseEnter={() => setHoverIdx(idx)}
                            >
                                <circle
                                    cx={x + 10}
                                    cy={6}
                                    r={6}
                                    fill="#f87171"
                                    className="animate-in fade-in zoom-in duration-200"
                                />
                                <path
                                    d={`M${x + 8} ${4} L${x + 12} ${8} M${x + 12} 4 L${x + 8} 8`}
                                    stroke="white"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                />
                            </g>
                        )}

                        {/* Time label at bottom */}
                        <text
                            x={x}
                            y={height - 4}
                            textAnchor="middle"
                            fill="rgba(248,113,113,0.6)"
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
                fill="rgba(248,113,113,0.5)"
                fontSize="9"
                fontFamily="monospace"
                pointerEvents="none"
            >
                {sorted.length}/{maxSlices}
            </text>

            {/* The device plays these markers once Cue points is on in config.txt. */}
            {active && (
                <foreignObject x={0} y={0} width={width} height={height} className="pointer-events-none">
                    <div className="w-full h-full flex items-end justify-center p-2">
                        <div
                            className="flex items-center gap-1.5 px-2 py-1 rounded bg-black/60 border border-synthux-orange/40 backdrop-blur-sm pointer-events-auto cursor-help phone:hidden"
                            title="Spotykach plays these cue points when Cue points is set to Snap or Free for the deck in config.txt (firmware 1.3.0 and later). With the default, Ignore, the device slices as if there were none."
                        >
                            <span className="text-gray-300 font-bold text-[9px] uppercase tracking-wider">
                                Plays with Cue points on in config.txt
                            </span>
                        </div>
                    </div>
                </foreignObject>
            )}
        </svg>
    );
};

export default SlicerOverlay;
