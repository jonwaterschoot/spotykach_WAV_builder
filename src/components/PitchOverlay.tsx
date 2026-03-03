import React, { useRef, useCallback, useState, useEffect } from 'react';

export interface PitchRegion {
    id: string;
    start: number; // seconds
    end: number;   // seconds
    semitones: number;
    selected: boolean;
    detectedNote?: string;
    detectedFreq?: number;
    confidence?: number;
}

interface PitchOverlayProps {
    regions: PitchRegion[];
    duration: number;
    width: number;
    height: number;
    onRegionsChange: (regions: PitchRegion[]) => void;
    active: boolean; // only interactive when pitch panel is on
    currentPitch: number;
    isPreviewing?: boolean;
    previewRegions?: PitchRegion[];
}

const PitchOverlay: React.FC<PitchOverlayProps> = ({
    regions,
    duration,
    width,
    height,
    onRegionsChange,
    active,
    currentPitch,
    isPreviewing = false,
    previewRegions = [],
}) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const [dragState, setDragState] = useState<{
        type: 'move' | 'resize-start' | 'resize-end' | 'joint-resize';
        regionIds: string[]; // Support multiple for joint drag
        startX: number;
        startTime: number;
        originalRegions?: { [id: string]: PitchRegion };
    } | null>(null);
    const [hasDragged, setHasDragged] = useState(false);
    const [hoveredEdge, setHoveredEdge] = useState<{
        regionId: string;
        edge: 'start' | 'end';
        zone: 'left' | 'middle' | 'right';
    } | null>(null);
    const lastInteractionTime = useRef(0);

    const timeToX = useCallback((t: number) => (t / duration) * width, [duration, width]);
    const xToTime = useCallback((x: number) => Math.max(0, Math.min(duration, (x / width) * duration)), [duration, width]);

    const getMouseX = useCallback((e: React.MouseEvent | MouseEvent) => {
        if (!svgRef.current) return 0;
        const rect = svgRef.current.getBoundingClientRect();
        return e.clientX - rect.left;
    }, []);

    // Generate unique ID
    const genId = () => `pitch-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;

    // Double-click to create a new pitch region (default 0.5s wide)
    const handleDoubleClick = useCallback((e: React.MouseEvent) => {
        if (!active) return;
        e.preventDefault();
        e.stopPropagation();
        const x = getMouseX(e);
        const time = xToTime(x);
        const halfWidth = 0.25;
        const newRegion: PitchRegion = {
            id: genId(),
            start: Math.max(0, time - halfWidth),
            end: Math.min(duration, time + halfWidth),
            semitones: currentPitch,
            selected: true,
        };
        // Deselect others, add new
        const updated = regions.map(r => ({ ...r, selected: false }));
        updated.push(newRegion);
        onRegionsChange(updated);
    }, [active, getMouseX, xToTime, duration, regions, onRegionsChange]);

    // Click to select/deselect
    const handleRegionClick = useCallback((e: React.MouseEvent, regionId: string) => {
        if (!active || hasDragged) return;
        // If we just interacted with the mouse down (within 200ms), don't toggle here
        if (Date.now() - lastInteractionTime.current < 200) return;

        e.stopPropagation();
        const updated = regions.map(r => ({
            ...r,
            selected: r.id === regionId ? !r.selected : false,
        }));
        onRegionsChange(updated);
    }, [active, regions, onRegionsChange, hasDragged]);

    // Click on background to deselect all
    const handleBackgroundClick = useCallback((e: React.MouseEvent) => {
        if (!active) return;
        // Only deselect if exactly hitting the background (SVG element)
        if (e.target !== e.currentTarget) return;
        const updated = regions.map(r => ({ ...r, selected: false }));
        onRegionsChange(updated);
    }, [active, regions, onRegionsChange]);

    // Start drag
    const handleEdgeMouseDown = useCallback((e: React.MouseEvent, regionId: string, edge: 'start' | 'end') => {
        if (!active) return;
        e.preventDefault();
        e.stopPropagation();

        const x = getMouseX(e);
        const region = regions.find(r => r.id === regionId);
        if (!region) return;

        // Hit testing for joint edges (22.5px tri-zone: 7.5px L, 7.5px Middle, 7.5px R)
        const edgeX = timeToX(edge === 'start' ? region.start : region.end);
        const dx = x - edgeX;

        // Determine if we are hitting a joint edge with better tolerance
        let jointRegion: PitchRegion | undefined;
        if (edge === 'start') {
            jointRegion = regions.find(r => r.id !== regionId && Math.abs(timeToX(r.end) - edgeX) < 5);
        } else {
            jointRegion = regions.find(r => r.id !== regionId && Math.abs(timeToX(r.start) - edgeX) < 5);
        }

        let type: 'resize-start' | 'resize-end' | 'joint-resize' = edge === 'start' ? 'resize-start' : 'resize-end';
        const ids = [regionId];
        const originals: { [id: string]: PitchRegion } = { [regionId]: { ...region } };

        // 3-way check (Tri-zone)
        if (jointRegion && Math.abs(dx) <= 7.5) {
            // Joint zone (Middle 15px total, +/- 7.5px)
            type = 'joint-resize';
            ids.push(jointRegion.id);
            originals[jointRegion.id] = { ...jointRegion };
        }

        // Force selection
        const updated = regions.map(r => ({
            ...r,
            selected: ids.includes(r.id) ? true : (e.shiftKey ? r.selected : false)
        }));
        onRegionsChange(updated);
        lastInteractionTime.current = Date.now();

        setDragState({
            type,
            regionIds: ids,
            startX: x,
            startTime: edge === 'start' ? region.start : region.end,
            originalRegions: originals,
        });
    }, [active, regions, getMouseX, timeToX, onRegionsChange]);

    const handleBodyMouseDown = useCallback((e: React.MouseEvent, regionId: string) => {
        if (!active) return;
        e.preventDefault();
        e.stopPropagation();
        const region = regions.find(r => r.id === regionId);
        if (!region) return;

        // Force selection immediately
        const updated = regions.map(r => ({
            ...r,
            selected: r.id === regionId ? true : (e.shiftKey ? r.selected : false)
        }));
        onRegionsChange(updated);
        lastInteractionTime.current = Date.now();

        setDragState({
            type: 'move',
            regionIds: [regionId],
            startX: getMouseX(e),
            startTime: region.start,
            originalRegions: { [regionId]: { ...region } },
        });
    }, [active, regions, getMouseX, onRegionsChange]);

    // Global mouse move/up for drag
    useEffect(() => {
        if (!dragState) return;

        const handleMouseMove = (e: MouseEvent) => {
            if (!svgRef.current || !dragState.originalRegions) return;
            const currentX = getMouseX(e);
            const dx = currentX - dragState.startX;
            const dt = (dx / width) * duration;

            let updated = [...regions];

            if (dragState.type === 'move') {
                const regionId = dragState.regionIds[0];
                const orig = dragState.originalRegions[regionId];
                if (!orig) return;

                const sorted = [...regions].sort((a, b) => a.start - b.start);
                const rIdx = sorted.findIndex(r => r.id === regionId);
                const prev = rIdx > 0 ? sorted[rIdx - 1] : null;
                const next = rIdx < sorted.length - 1 ? sorted[rIdx + 1] : null;

                const segLen = orig.end - orig.start;
                const minStart = prev ? prev.end : 0;
                const maxStart = next ? next.start - segLen : duration - segLen;

                let newStart = orig.start + dt;
                newStart = Math.max(minStart, Math.min(maxStart, newStart));
                updated = regions.map(r =>
                    r.id === regionId ? { ...r, start: newStart, end: newStart + segLen, selected: true } : r
                );
            } else if (dragState.type === 'resize-start' || dragState.type === 'resize-end') {
                const regionId = dragState.regionIds[0];
                const orig = dragState.originalRegions[regionId];
                if (!orig) return;

                const sorted = [...regions].sort((a, b) => a.start - b.start);
                const rIdx = sorted.findIndex(r => r.id === regionId);

                if (dragState.type === 'resize-start') {
                    const prev = rIdx > 0 ? sorted[rIdx - 1] : null;
                    const minStart = prev ? prev.end : 0;
                    const newStart = Math.max(minStart, Math.min(orig.end - 0.05, orig.start + dt));
                    updated = regions.map(r =>
                        r.id === regionId ? { ...r, start: newStart, selected: true } : r
                    );
                } else {
                    const next = rIdx < sorted.length - 1 ? sorted[rIdx + 1] : null;
                    const maxEnd = next ? next.start : duration;
                    const newEnd = Math.min(maxEnd, Math.max(orig.start + 0.05, orig.end + dt));
                    updated = regions.map(r =>
                        r.id === regionId ? { ...r, end: newEnd, selected: true } : r
                    );
                }
            } else if (dragState.type === 'joint-resize') {
                // Determine which is left and which is right
                const regionIds = dragState.regionIds;
                const r1 = dragState.originalRegions[regionIds[0]];
                const r2 = dragState.originalRegions[regionIds[1]];
                if (!r1 || !r2) return;

                const leftRegion = r1.end <= r2.start + 0.01 ? r1 : r2;
                const rightRegion = leftRegion.id === r1.id ? r2 : r1;

                // Shared boundary: leftRegion.end and rightRegion.start
                const newSharedTime = leftRegion.end + dt;

                // Clamp: must be > leftRegion.start and < rightRegion.end
                const clampedTime = Math.max(leftRegion.start + 0.05, Math.min(rightRegion.end - 0.05, newSharedTime));

                updated = regions.map(r => {
                    if (r.id === leftRegion.id) return { ...r, end: clampedTime, selected: true };
                    if (r.id === rightRegion.id) return { ...r, start: clampedTime, selected: true };
                    return r;
                });
            }

            if (!hasDragged) setHasDragged(true);
            onRegionsChange(updated);
        };

        const handleMouseUp = () => {
            setDragState(null);
            // We'll reset hasDragged in a timeout to let the click event fire first
            setTimeout(() => setHasDragged(false), 50);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [dragState, regions, duration, width, getMouseX, onRegionsChange]);

    // Delete key removes selected regions
    useEffect(() => {
        if (!active) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                const hasSelected = regions.some(r => r.selected);
                if (hasSelected) {
                    e.preventDefault();
                    onRegionsChange(regions.filter(r => !r.selected));
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [active, regions, onRegionsChange]);

    if (!active && !isPreviewing) return null;
    const displayRegions = isPreviewing ? previewRegions : regions;

    return (
        <svg
            ref={svgRef}
            className={`absolute inset-0 z-20 ${isPreviewing ? 'pointer-events-none' : ''}`}
            width={width}
            height={height}
            style={{ pointerEvents: (active && !isPreviewing) ? 'auto' : 'none' }}
            onClick={handleBackgroundClick}
            onDoubleClick={handleDoubleClick}
        >
            {displayRegions.map((region) => {
                const x = timeToX(region.start);
                const w = timeToX(region.end) - x;
                const isSelected = region.selected && !isPreviewing;

                return (
                    <g key={region.id} className={isPreviewing ? 'opacity-60' : ''}>
                        {/* Pitch region background */}
                        <rect
                            x={x}
                            y={0}
                            width={Math.max(2, w)}
                            height={height}
                            fill={isSelected ? 'rgba(56,189,248,0.3)' : 'rgba(56,189,248,0.15)'}
                            stroke={isSelected ? '#38bdf8' : '#0ea5e9'}
                            strokeWidth={isSelected ? 2 : 1}
                            strokeDasharray={isPreviewing ? "4 4" : "0"}
                            style={{ cursor: isPreviewing ? 'default' : 'move' }}
                            onMouseDown={(e) => !isPreviewing && handleBodyMouseDown(e, region.id)}
                            onClick={(e) => {
                                if (isPreviewing) return;
                                // If we just finished a drag, don't toggle
                                if (hasDragged) return;
                                handleRegionClick(e, region.id);
                            }}
                        />

                        {/* Joint Edge Hit Zones (Overlapping slightly for ease) */}
                        {!isPreviewing && (
                            <>
                                {(() => {
                                    const edgeX = x;
                                    const hasNeighborStart = regions.some(r => r.id !== region.id && Math.abs(timeToX(r.end) - edgeX) < 5);
                                    if (!hasNeighborStart) {
                                        return (
                                            <rect
                                                x={edgeX - 15}
                                                y={0}
                                                width={30}
                                                height={height}
                                                fill="transparent"
                                                style={{ cursor: 'col-resize' }}
                                                onMouseDown={(e) => handleEdgeMouseDown(e, region.id, 'start')}
                                                onMouseEnter={() => setHoveredEdge({ regionId: region.id, edge: 'start', zone: 'middle' })}
                                                onMouseLeave={() => setHoveredEdge(null)}
                                            />
                                        );
                                    }
                                    return (
                                        <>
                                            {/* We only draw Middle and Right zones for the start edge of a shared boundary.
                                                The Left zone is drawn by the neighbor's end edge. */}
                                            <rect
                                                x={edgeX - 7.5}
                                                y={0}
                                                width={15}
                                                height={height}
                                                fill="transparent"
                                                style={{ cursor: 'col-resize' }}
                                                onMouseDown={(e) => handleEdgeMouseDown(e, region.id, 'start')}
                                                onMouseEnter={() => setHoveredEdge({ regionId: region.id, edge: 'start', zone: 'middle' })}
                                                onMouseLeave={() => setHoveredEdge(null)}
                                            />
                                            <rect
                                                x={edgeX + 7.5}
                                                y={0}
                                                width={15}
                                                height={height}
                                                fill="transparent"
                                                style={{ cursor: 'e-resize' }}
                                                onMouseDown={(e) => handleEdgeMouseDown(e, region.id, 'start')}
                                                onMouseEnter={() => setHoveredEdge({ regionId: region.id, edge: 'start', zone: 'right' })}
                                                onMouseLeave={() => setHoveredEdge(null)}
                                            />
                                        </>
                                    );
                                })()}
                            </>
                        )}

                        {/* Hover Highlight Start & Handle */}
                        {hoveredEdge?.regionId === region.id && hoveredEdge?.edge === 'start' && !dragState && (
                            <g pointerEvents="none">
                                <rect
                                    x={x + (hoveredEdge.zone === 'left' ? -22.5 : hoveredEdge.zone === 'middle' ? -7.5 : 0)}
                                    y={0}
                                    width={hoveredEdge.zone === 'middle' && !regions.some(r => r.id !== region.id && Math.abs(timeToX(r.end) - x) < 5) ? 30 : 15}
                                    height={height}
                                    fill="white"
                                    opacity={0.3}
                                    transform={hoveredEdge.zone === 'middle' && !regions.some(r => r.id !== region.id && Math.abs(timeToX(r.end) - x) < 5) ? `translate(-7.5, 0)` : ''}
                                />
                                <rect
                                    x={x + (hoveredEdge.zone === 'left' ? -16 : hoveredEdge.zone === 'middle' ? -1 : 6.5)}
                                    y={height / 2 - 8}
                                    width={2}
                                    height={16}
                                    fill="white"
                                    rx="1"
                                />
                            </g>
                        )}

                        {/* Visual Handle (The blue line) */}
                        {!isPreviewing && (
                            <rect
                                x={x - 1}
                                y={0}
                                width={2}
                                height={height}
                                fill={isSelected ? '#38bdf8' : '#0ea5e9'}
                                opacity={0.8}
                                pointerEvents="none"
                            />
                        )}

                        {/* Joint Edge Hit Zones - Right (Overlapping) */}
                        {!isPreviewing && (
                            <>
                                {(() => {
                                    const edgeX = x + w;
                                    const hasNeighborEnd = regions.some(r => r.id !== region.id && Math.abs(timeToX(r.start) - edgeX) < 5);
                                    if (!hasNeighborEnd) {
                                        return (
                                            <rect
                                                x={edgeX - 15}
                                                y={0}
                                                width={30}
                                                height={height}
                                                fill="transparent"
                                                style={{ cursor: 'col-resize' }}
                                                onMouseDown={(e) => handleEdgeMouseDown(e, region.id, 'end')}
                                                onMouseEnter={() => setHoveredEdge({ regionId: region.id, edge: 'end', zone: 'middle' })}
                                                onMouseLeave={() => setHoveredEdge(null)}
                                            />
                                        );
                                    }
                                    return (
                                        <>
                                            {/* For a shared boundary where this is the left neighbor, 
                                                we only draw the Left zone. Middle and Right are drawn by the right neighbor's start edge. */}
                                            <rect
                                                x={edgeX - 15}
                                                y={0}
                                                width={15}
                                                height={height}
                                                fill="transparent"
                                                style={{ cursor: 'w-resize' }}
                                                onMouseDown={(e) => handleEdgeMouseDown(e, region.id, 'end')}
                                                onMouseEnter={() => setHoveredEdge({ regionId: region.id, edge: 'end', zone: 'left' })}
                                                onMouseLeave={() => setHoveredEdge(null)}
                                            />
                                        </>
                                    );
                                })()}
                            </>
                        )}

                        {/* Hover Highlight End & Handle */}
                        {hoveredEdge?.regionId === region.id && hoveredEdge?.edge === 'end' && !dragState && (
                            <g pointerEvents="none">
                                <rect
                                    x={x + w + (hoveredEdge.zone === 'left' ? -15 : hoveredEdge.zone === 'middle' ? -7.5 : 7.5)}
                                    y={0}
                                    width={hoveredEdge.zone === 'middle' && !regions.some(r => r.id !== region.id && Math.abs(timeToX(r.start) - (x + w)) < 5) ? 30 : 15}
                                    height={height}
                                    fill="white"
                                    opacity={0.3}
                                    transform={hoveredEdge.zone === 'middle' && !regions.some(r => r.id !== region.id && Math.abs(timeToX(r.start) - (x + w)) < 5) ? `translate(-7.5, 0)` : ''}
                                />
                                <rect
                                    x={x + w + (hoveredEdge.zone === 'left' ? -8.5 : hoveredEdge.zone === 'middle' ? -1 : 6.5)}
                                    y={height / 2 - 8}
                                    width={2}
                                    height={16}
                                    fill="white"
                                    rx="1"
                                />
                            </g>
                        )}

                        {/* Visual Handle - Right */}
                        {!isPreviewing && (
                            <rect
                                x={x + w - 1}
                                y={0}
                                width={2}
                                height={height}
                                fill={isSelected ? '#38bdf8' : '#0ea5e9'}
                                opacity={0.8}
                                pointerEvents="none"
                            />
                        )}

                        {/* "PITCH" label */}
                        {w > 40 && (
                            <text
                                x={x + w / 2}
                                y={16}
                                textAnchor="middle"
                                fill={isPreviewing ? "#999" : "#38bdf8"}
                                fontSize="10"
                                fontWeight="bold"
                                fontFamily="monospace"
                                letterSpacing="1"
                                pointerEvents="none"
                            >
                                {isPreviewing ? 'PREVIEW' : `PITCH ${region.semitones > 0 ? '+' : ''}${region.semitones}st`}
                            </text>
                        )}
                        {/* Detected Note */}
                        {region.detectedNote && (
                            <text
                                x={x + w / 2}
                                y={64}
                                textAnchor="middle"
                                fill="#a5f3fc"
                                className="text-[12px] font-mono font-bold select-none pointer-events-none"
                                style={{ textShadow: '0 1px 3px black' }}
                            >
                                {region.detectedNote}
                            </text>
                        )}

                        {/* Freq label */}
                        {region.detectedFreq && w > 60 && (
                            <text
                                x={x + w / 2}
                                y={78}
                                textAnchor="middle"
                                fill="#67e8f9"
                                className="text-[9px] font-mono select-none pointer-events-none"
                                opacity="0.8"
                            >
                                {region.detectedFreq.toFixed(1)}Hz {region.confidence ? `(${Math.round(region.confidence * 100)}%)` : ''}
                            </text>
                        )}

                        {/* Confidence indicator (Circle) */}
                        {region.confidence !== undefined && (
                            <g transform={`translate(${x + w / 2 - 40}, 12)`} opacity="0.8">
                                <circle
                                    r="6"
                                    fill={region.confidence > 0.7 ? "#22c55e" : "#f59e0b"}
                                    stroke="rgba(0,0,0,0.5)"
                                    strokeWidth="1"
                                />
                            </g>
                        )}
                        {isPreviewing && w > 40 && (
                            <text
                                x={x + w / 2}
                                y={30}
                                textAnchor="middle"
                                fill="#38bdf8"
                                fontSize="10"
                                fontWeight="bold"
                                fontFamily="monospace"
                                pointerEvents="none"
                            >
                                {region.semitones > 0 ? '+' : ''}{region.semitones}st
                            </text>
                        )}

                        {/* Duration label */}
                        {w > 50 && (
                            <text
                                x={x + w / 2}
                                y={height - 6}
                                textAnchor="middle"
                                fill={isPreviewing ? "rgba(153,153,153,0.7)" : "rgba(56,189,248,0.7)"}
                                fontSize="9"
                                fontFamily="monospace"
                                pointerEvents="none"
                            >
                                {region.detectedNote ? (
                                    <tspan fill="#fff" fontWeight="bold">{region.detectedNote} </tspan>
                                ) : null}
                                {(region.end - region.start).toFixed(2)}s
                            </text>
                        )}

                        {/* Delete Button (Trash Icon) */}
                        {isSelected && !isPreviewing && !dragState?.regionIds.includes(region.id) && (
                            <g
                                transform={`translate(${x + w / 2 - 10}, 32)`}
                                className="cursor-pointer transition-all hover:scale-110"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onRegionsChange(regions.filter(r => r.id !== region.id));
                                }}
                            >
                                <rect width="20" height="20" rx="4" fill="#0ea5e9" opacity="0.9" pointerEvents="all" />
                                <path
                                    d="M7 8h6M8 8v7a1 1 0 001 1h2a1 1 0 001-1V8M9 6h2"
                                    stroke="white"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    fill="none"
                                    pointerEvents="none"
                                />
                            </g>
                        )}
                    </g>
                );
            })}
        </svg>
    );
};

export default PitchOverlay;
