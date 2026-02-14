import React, { useRef, useState, useEffect } from 'react';

export interface AutomationPoint {
    id: string;
    time: number;
    value: number; // 0.0 to 2.0 (1.0 = Unity Gain)
    selected: boolean;
}

interface AutomationOverlayProps {
    points: AutomationPoint[];
    duration: number;
    width: number;
    height: number;
    onPointsChange: (points: AutomationPoint[]) => void;
    onSeek: (time: number) => void;
    smooth?: boolean;
}

export const AutomationOverlay: React.FC<AutomationOverlayProps> = ({
    points,
    duration,
    width,
    height,
    onPointsChange,
    onSeek,
    smooth = false
}) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const [draggingPointId, setDraggingPointId] = useState<string | null>(null);
    const [dragStart, setDragStart] = useState<{ x: number, y: number } | null>(null);
    const [selectionBox, setSelectionBox] = useState<{ x: number, y: number, w: number, h: number } | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [hoveredSegmentId, setHoveredSegmentId] = useState<string | null>(null);

    // Store initial state for group dragging
    const initialPointsRef = useRef<AutomationPoint[]>([]);

    const PADDING_PERCENT = 0.2;
    const WORKABLE_PERCENT = 0.6;

    const COLOR_MAIN = "#FF5500";
    const COLOR_SELECTED = "#CC4400";
    const COLOR_SEGMENT = "#FF5500";
    const COLOR_SEGMENT_SELECTED = "#CC4400";

    // Helpers
    const timeToX = (time: number) => (time / duration) * width;
    const xToTime = (x: number) => (x / width) * duration;

    const paddingPx = height * PADDING_PERCENT;
    const workableHeight = height * WORKABLE_PERCENT;

    const valueToY = (val: number) => {
        const normalized = val / 2.0;
        return (height - paddingPx) - (normalized * workableHeight);
    };

    const yToValue = (y: number) => {
        const relativeY = (height - paddingPx) - y;
        const normalized = relativeY / workableHeight;
        return Math.max(0, Math.min(2.0, normalized * 2.0));
    };

    const sortedPoints = [...points].sort((a, b) => a.time - b.time);

    // Global Drag Listeners
    useEffect(() => {
        const handleGlobalMove = (e: MouseEvent) => {
            if (!svgRef.current) return;
            const rect = svgRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            if (dragStart && !isDragging) {
                if (Math.abs(x - dragStart.x) > 2 || Math.abs(y - dragStart.y) > 2) {
                    setIsDragging(true);
                }
            }

            if (isDragging) {
                if (draggingPointId && dragStart) {
                    const dx = x - dragStart.x;
                    const dy = y - dragStart.y;

                    const dt = xToTime(dx);
                    const dVal = - (dy / workableHeight) * 2.0;

                    const newPoints = initialPointsRef.current.map(initialPoint => {
                        if (initialPoint.selected) {
                            let newTime = Math.max(0, Math.min(duration, initialPoint.time + dt));
                            let newValue = Math.max(0, Math.min(2.0, initialPoint.value + dVal));

                            // Snap to other points (Merging)
                            const SNAP_THRESHOLD_PX = 10;
                            const others = initialPointsRef.current.filter(p => !p.selected);

                            // Find closest snap target
                            let closest = null;
                            let minDist = Infinity;

                            for (const other of others) {
                                const distPx = Math.abs(timeToX(newTime) - timeToX(other.time));
                                if (distPx < SNAP_THRESHOLD_PX && distPx < minDist) {
                                    minDist = distPx;
                                    closest = other;
                                }
                            }

                            if (closest) {
                                newTime = closest.time;
                                // Optional: Snap value too? Maybe not.
                            }

                            return {
                                ...initialPoint,
                                time: newTime,
                                value: newValue
                            }
                        }
                        return initialPoint;
                    });

                    onPointsChange(newPoints);

                } else if (selectionBox && dragStart) {
                    const curX = Math.max(0, Math.min(width, x));
                    const curY = Math.max(0, Math.min(height, y));

                    setSelectionBox({
                        x: Math.min(dragStart.x, curX),
                        y: Math.min(dragStart.y, curY),
                        w: Math.abs(curX - dragStart.x),
                        h: Math.abs(curY - dragStart.y)
                    });
                }
            }
        };

        const handleGlobalUp = (e: MouseEvent) => {
            if (!svgRef.current) return;

            // Finalize Box Selection
            if (selectionBox && isDragging) {
                const box = selectionBox;
                const newPoints = points.map(p => {
                    const px = timeToX(p.time);
                    const py = valueToY(p.value);
                    const inside = px >= box.x && px <= box.x + box.w && py >= box.y && py <= box.y + box.h;
                    return { ...p, selected: inside };
                });
                onPointsChange(newPoints);
            } else if (isDragging && draggingPointId) {
                // Cleanup Merged Points (Duplicates)
                // Filter out non-selected duplicates that clash with selected ones? 
                // Or just unique by Time?
                // If two points have exact same time, keep the SELECTED one? or keep ONE.

                // Strategy: Group by time. If group > 1, keep the one that was just dragged (selected).
                // If both selected, keep one.

                const uniquePoints: AutomationPoint[] = [];
                const seenTimes = new Set<string>(); // Use string key for float precision safety? Or fixed?

                // Sort by selection (selected first) so we keep them? 
                // Actually if we merge A onto B, we want A (selected) to replace B.

                // Sort: Selected first.
                const sorted = [...points].sort((a, b) => (a.selected === b.selected ? 0 : a.selected ? -1 : 1));

                for (const p of sorted) {
                    const key = p.time.toFixed(4); // 4 decimals precision
                    if (!seenTimes.has(key)) {
                        seenTimes.add(key);
                        uniquePoints.push(p);
                    }
                }

                if (uniquePoints.length < points.length) {
                    onPointsChange(uniquePoints);
                }

            } else if (!isDragging && dragStart && !draggingPointId && !selectionBox) { // Was Click
                const rect = svgRef.current.getBoundingClientRect();
                const x = e.clientX - rect.left;
                onSeek(xToTime(x));
            }

            setDraggingPointId(null);
            setSelectionBox(null);
            setDragStart(null);
            setIsDragging(false);
        };

        if (dragStart) {
            window.addEventListener('mousemove', handleGlobalMove);
            window.addEventListener('mouseup', handleGlobalUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleGlobalMove);
            window.removeEventListener('mouseup', handleGlobalUp);
        };
    }, [dragStart, isDragging, draggingPointId, selectionBox, points, duration, width, height, workableHeight, onPointsChange, onSeek]);


    // Keyboard Nudge logic preserved...
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const selectedPoints = points.filter(p => p.selected);
            if (selectedPoints.length === 0) return;
            if (e.target instanceof HTMLInputElement) return;

            let dTime = 0;
            let dValue = 0;
            const shift = e.shiftKey ? 10 : 1;

            switch (e.key) {
                case 'ArrowUp': dValue = 0.01 * shift; break;
                case 'ArrowDown': dValue = -0.01 * shift; break;
                case 'ArrowLeft': dTime = -0.01 * shift; break;
                case 'ArrowRight': dTime = 0.01 * shift; break;
                case 'Delete':
                case 'Backspace':
                    const remaining = points.filter(p => !p.selected);
                    onPointsChange(remaining);
                    return;
                default: return;
            }

            if (dTime !== 0 || dValue !== 0) {
                e.preventDefault();
                const newPoints = points.map(p => {
                    if (p.selected) {
                        return {
                            ...p,
                            time: Math.max(0, Math.min(duration, p.time + dTime)),
                            value: Math.max(0, Math.min(2.0, p.value + dValue))
                        };
                    }
                    return p;
                });
                onPointsChange(newPoints);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [points, duration, onPointsChange]);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!svgRef.current) return;
        const rect = svgRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const relY = y / height;
        if (relY < PADDING_PERCENT || relY > (1 - PADDING_PERCENT)) return;

        if (!e.shiftKey) {
            onPointsChange(points.map(p => ({ ...p, selected: false })));
        }

        setSelectionBox({ x, y, w: 0, h: 0 });
        setDragStart({ x, y });
        setIsDragging(false);
    };

    const handlePointMouseDown = (e: React.MouseEvent, pointId: string) => {
        e.stopPropagation();
        const rect = svgRef.current!.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        initialPointsRef.current = JSON.parse(JSON.stringify(points));

        const point = points.find(p => p.id === pointId);
        if (!point) return;

        setDraggingPointId(pointId);
        setDragStart({ x, y });
        setIsDragging(false); // Reset dragging state, wait for move

        if (e.shiftKey) {
            const newPoints = points.map(p => p.id === pointId ? { ...p, selected: !p.selected } : p);
            onPointsChange(newPoints);
            initialPointsRef.current = newPoints; // Update initial ref for immediate drag
        } else if (!point.selected) {
            const newPoints = points.map(p => ({ ...p, selected: p.id === pointId }));
            onPointsChange(newPoints);
            initialPointsRef.current = newPoints; // Update initial ref for immediate drag
        }
    };

    const handleSegmentMouseDown = (e: React.MouseEvent, p1Id: string | null, p2Id: string | null) => {
        e.stopPropagation();
        const rect = svgRef.current!.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        initialPointsRef.current = JSON.parse(JSON.stringify(points));

        const leaderId = p1Id || p2Id!;
        setDraggingPointId(leaderId);
        setDragStart({ x, y });
        setIsDragging(false);

        const idsToSelect: string[] = [];
        if (p1Id) idsToSelect.push(p1Id);
        if (p2Id) idsToSelect.push(p2Id);

        if (e.shiftKey) {
            const newPoints = points.map(p => idsToSelect.includes(p.id) ? { ...p, selected: true } : p);
            onPointsChange(newPoints);
            initialPointsRef.current = newPoints; // Update initial ref
        } else {
            const newPoints = points.map(p => ({ ...p, selected: idsToSelect.includes(p.id) }));
            onPointsChange(newPoints);
            initialPointsRef.current = newPoints; // Update initial ref
        }
    };

    const handleDoubleClick = (e: React.MouseEvent) => {
        if (!svgRef.current) return;
        const rect = svgRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const relY = y / height;
        if (relY < PADDING_PERCENT || relY > (1 - PADDING_PERCENT)) return;

        const t = xToTime(x);
        const val = yToValue(y);

        const newPoint: AutomationPoint = {
            id: Math.random().toString(36).substr(2, 9),
            time: t,
            value: val,
            selected: true
        };

        const newPoints = points.map(p => ({ ...p, selected: false })).concat(newPoint);
        onPointsChange(newPoints);
    };

    const renderLines = () => {
        if (sortedPoints.length === 0) return null;
        const lines = [];
        const first = sortedPoints[0];
        if (first.time > 0) {
            const startY = valueToY(first.value);
            const endX = timeToX(first.time);
            const endY = startY;
            const isHovered = hoveredSegmentId === 'start';
            const isSelected = first.selected;

            lines.push(
                <g key="start-segment"
                    onMouseEnter={() => setHoveredSegmentId('start')}
                    onMouseLeave={() => setHoveredSegmentId(null)}
                >
                    <line x1={0} y1={startY} x2={endX} y2={endY}
                        stroke={isSelected ? COLOR_SEGMENT_SELECTED : COLOR_SEGMENT}
                        strokeWidth={isHovered ? "4" : "2"} strokeOpacity="0.8"
                    />
                    <line x1={0} y1={startY} x2={endX} y2={endY}
                        stroke="transparent" strokeWidth="15"
                        onMouseDown={(e) => handleSegmentMouseDown(e, null, first.id)}
                        className="cursor-pointer"
                    />
                </g>
            );
        }

        for (let i = 0; i < sortedPoints.length - 1; i++) {
            const p1 = sortedPoints[i];
            const p2 = sortedPoints[i + 1];
            const x1 = timeToX(p1.time);
            const y1 = valueToY(p1.value);
            const x2 = timeToX(p2.time);
            const y2 = valueToY(p2.value);

            const isSegmentSelected = p1.selected && p2.selected;
            const segId = `seg-${p1.id}`;
            const isHovered = hoveredSegmentId === segId;

            if (smooth) {
                // S-Curve using cubic bezier
                // Control points: 50% of the way horizontally, flat Y
                const cx1 = x1 + (x2 - x1) * 0.5;
                const cy1 = y1;
                const cx2 = x1 + (x2 - x1) * 0.5;
                const cy2 = y2;
                const pathData = `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;

                lines.push(
                    <g key={segId}
                        onMouseEnter={() => setHoveredSegmentId(segId)}
                        onMouseLeave={() => setHoveredSegmentId(null)}
                    >
                        <path d={pathData}
                            stroke={isSegmentSelected ? COLOR_SEGMENT_SELECTED : COLOR_SEGMENT}
                            strokeWidth={isHovered ? "4" : (isSegmentSelected ? "3" : "2")}
                            strokeOpacity="0.8"
                            fill="none"
                        />
                        <path d={pathData}
                            stroke="transparent" strokeWidth="15"
                            onMouseDown={(e) => handleSegmentMouseDown(e, p1.id, p2.id)}
                            className="cursor-pointer"
                            fill="none"
                        />
                    </g>
                );
            } else {
                lines.push(
                    <g key={segId}
                        onMouseEnter={() => setHoveredSegmentId(segId)}
                        onMouseLeave={() => setHoveredSegmentId(null)}
                    >
                        <line x1={x1} y1={y1} x2={x2} y2={y2}
                            stroke={isSegmentSelected ? COLOR_SEGMENT_SELECTED : COLOR_SEGMENT}
                            strokeWidth={isHovered ? "4" : (isSegmentSelected ? "3" : "2")}
                            strokeOpacity="0.8"
                        />
                        <line x1={x1} y1={y1} x2={x2} y2={y2}
                            stroke="transparent" strokeWidth="15"
                            onMouseDown={(e) => handleSegmentMouseDown(e, p1.id, p2.id)}
                            className="cursor-pointer"
                        />
                    </g>
                );
            }
        }

        const last = sortedPoints[sortedPoints.length - 1];
        if (last.time < duration) {
            const startX = timeToX(last.time);
            const startY = valueToY(last.value);
            const isHovered = hoveredSegmentId === 'end';
            const isSelected = last.selected;

            lines.push(
                <g key="end-segment"
                    onMouseEnter={() => setHoveredSegmentId('end')}
                    onMouseLeave={() => setHoveredSegmentId(null)}
                >
                    <line x1={startX} y1={startY} x2={width} y2={startY}
                        stroke={isSelected ? COLOR_SEGMENT_SELECTED : COLOR_SEGMENT}
                        strokeWidth={isHovered ? "4" : "2"} strokeOpacity="0.8"
                    />
                    <line x1={startX} y1={startY} x2={width} y2={startY}
                        stroke="transparent" strokeWidth="15"
                        onMouseDown={(e) => handleSegmentMouseDown(e, last.id, null)}
                        className="cursor-pointer"
                    />
                </g>
            );
        }
        return lines;
    };

    return (
        <svg
            ref={svgRef}
            width={width}
            height={height}
            className="absolute top-0 left-0 z-20 overflow-visible"
            onDoubleClick={handleDoubleClick}
            // Global listeners handle moves/ups. We just need MouseDown.
            onMouseDown={handleMouseDown}
            style={{
                pointerEvents: 'none',
                userSelect: 'none'
            }}
        >
            <defs>
                <clipPath id="workable-clip">
                    <rect x="0" y={height * PADDING_PERCENT} width={width} height={height * (1 - 2 * PADDING_PERCENT)} />
                </clipPath>
            </defs>

            <rect
                x={0}
                y={height * PADDING_PERCENT}
                width={width}
                height={height * (1 - 2 * PADDING_PERCENT)}
                fill="transparent"
                style={{ pointerEvents: 'all' }}
            />

            <line
                x1="0" y1={valueToY(1.0)}
                x2={width} y2={valueToY(1.0)}
                stroke="rgba(255,255,255,0.2)"
                strokeDasharray="4 4"
                strokeWidth="1"
                pointerEvents="none"
            />

            <g style={{ pointerEvents: 'all' }}>
                {renderLines()}
            </g>

            <g style={{ pointerEvents: 'all' }}>
                {points.map(p => (
                    <g key={p.id} transform={`translate(${timeToX(p.time)}, ${valueToY(p.value)})`}>
                        <circle
                            r="12"
                            fill="transparent"
                            onMouseDown={(e) => handlePointMouseDown(e, p.id)}
                            className="cursor-pointer"
                        />
                        <circle
                            r={p.selected ? 6 : 4}
                            fill={p.selected ? "#FFFFFF" : COLOR_MAIN} // White center if selected (Or just white fill with colored stroke?) "I liked the white center"
                            // If selected: Fill White, Stroke Dark Orange
                            // If normal: Fill Orange, Stroke None
                            stroke={p.selected ? COLOR_SELECTED : "transparent"}
                            strokeWidth={p.selected ? "3" : "0"}
                            pointerEvents="none"
                        />
                    </g>
                ))}
            </g>

            {/* Selection Box */}
            {selectionBox && (
                <rect
                    x={selectionBox.x}
                    y={selectionBox.y}
                    width={selectionBox.w}
                    height={selectionBox.h}
                    fill={`${COLOR_MAIN}20`}
                    stroke={`${COLOR_MAIN}80`}
                    strokeDasharray="2 2"
                    pointerEvents="none"
                />
            )}
        </svg>
    );
};
