import React, { useRef, useCallback, useState, useEffect } from 'react';

export interface CutRegion {
    id: string;
    start: number; // seconds
    end: number;   // seconds
    selected: boolean;
}

interface CutterOverlayProps {
    regions: CutRegion[];
    duration: number;
    width: number;
    height: number;
    onRegionsChange: (regions: CutRegion[]) => void;
    active: boolean; // only interactive when cutter panel is on
}

const CutterOverlay: React.FC<CutterOverlayProps> = ({
    regions,
    duration,
    width,
    height,
    onRegionsChange,
    active,
}) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const [dragState, setDragState] = useState<{
        type: 'create' | 'move' | 'resize-start' | 'resize-end';
        regionId?: string;
        startX: number;
        startTime: number;
        originalRegion?: CutRegion;
    } | null>(null);

    const timeToX = useCallback((t: number) => (t / duration) * width, [duration, width]);
    const xToTime = useCallback((x: number) => Math.max(0, Math.min(duration, (x / width) * duration)), [duration, width]);

    const getMouseX = useCallback((e: React.MouseEvent | MouseEvent) => {
        if (!svgRef.current) return 0;
        const rect = svgRef.current.getBoundingClientRect();
        return e.clientX - rect.left;
    }, []);

    // Generate unique ID
    const genId = () => `cut-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;

    // Double-click to create a new cut region (default 0.5s wide)
    const handleDoubleClick = useCallback((e: React.MouseEvent) => {
        if (!active) return;
        e.preventDefault();
        e.stopPropagation();
        const x = getMouseX(e);
        const time = xToTime(x);
        const halfWidth = 0.25; // 0.25s on each side
        const newRegion: CutRegion = {
            id: genId(),
            start: Math.max(0, time - halfWidth),
            end: Math.min(duration, time + halfWidth),
            selected: true,
        };
        // Deselect others, add new
        const updated = regions.map(r => ({ ...r, selected: false }));
        updated.push(newRegion);
        onRegionsChange(updated);
    }, [active, getMouseX, xToTime, duration, regions, onRegionsChange]);

    // Click to select/deselect
    const handleRegionClick = useCallback((e: React.MouseEvent, regionId: string) => {
        if (!active) return;
        e.stopPropagation();
        const updated = regions.map(r => ({
            ...r,
            selected: r.id === regionId ? !r.selected : false,
        }));
        onRegionsChange(updated);
    }, [active, regions, onRegionsChange]);

    // Click on background to deselect all
    const handleBackgroundClick = useCallback((_e: React.MouseEvent) => {
        if (!active) return;
        // Only deselect if not double-clicking
        const updated = regions.map(r => ({ ...r, selected: false }));
        onRegionsChange(updated);
    }, [active, regions, onRegionsChange]);

    // Start drag for creating or resizing
    const handleEdgeMouseDown = useCallback((e: React.MouseEvent, regionId: string, edge: 'start' | 'end') => {
        if (!active) return;
        e.preventDefault();
        e.stopPropagation();
        const region = regions.find(r => r.id === regionId);
        if (!region) return;
        setDragState({
            type: edge === 'start' ? 'resize-start' : 'resize-end',
            regionId,
            startX: getMouseX(e),
            startTime: edge === 'start' ? region.start : region.end,
            originalRegion: { ...region },
        });
    }, [active, regions, getMouseX]);

    const handleBodyMouseDown = useCallback((e: React.MouseEvent, regionId: string) => {
        if (!active) return;
        e.preventDefault();
        e.stopPropagation();
        const region = regions.find(r => r.id === regionId);
        if (!region) return;
        // Select this region
        const updated = regions.map(r => ({ ...r, selected: r.id === regionId }));
        onRegionsChange(updated);
        setDragState({
            type: 'move',
            regionId,
            startX: getMouseX(e),
            startTime: region.start,
            originalRegion: { ...region },
        });
    }, [active, regions, getMouseX, onRegionsChange]);

    // Global mouse move/up for drag
    useEffect(() => {
        if (!dragState) return;

        const handleMouseMove = (e: MouseEvent) => {
            if (!svgRef.current || !dragState.originalRegion) return;
            const currentX = getMouseX(e);
            const dx = currentX - dragState.startX;
            const dt = (dx / width) * duration;
            const orig = dragState.originalRegion;

            let updated: CutRegion[];
            switch (dragState.type) {
                case 'resize-start': {
                    const newStart = Math.max(0, Math.min(orig.end - 0.05, orig.start + dt));
                    updated = regions.map(r =>
                        r.id === dragState.regionId ? { ...r, start: newStart, selected: true } : r
                    );
                    break;
                }
                case 'resize-end': {
                    const newEnd = Math.min(duration, Math.max(orig.start + 0.05, orig.end + dt));
                    updated = regions.map(r =>
                        r.id === dragState.regionId ? { ...r, end: newEnd, selected: true } : r
                    );
                    break;
                }
                case 'move': {
                    const segLen = orig.end - orig.start;
                    let newStart = orig.start + dt;
                    newStart = Math.max(0, Math.min(duration - segLen, newStart));
                    updated = regions.map(r =>
                        r.id === dragState.regionId ? { ...r, start: newStart, end: newStart + segLen, selected: true } : r
                    );
                    break;
                }
                default:
                    return;
            }
            onRegionsChange(updated);
        };

        const handleMouseUp = () => {
            setDragState(null);
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

    if (!active || width <= 0 || duration <= 0) return null;

    return (
        <svg
            ref={svgRef}
            className="absolute inset-0 z-20"
            width={width}
            height={height}
            style={{ pointerEvents: active ? 'auto' : 'none' }}
            onClick={handleBackgroundClick}
            onDoubleClick={handleDoubleClick}
        >
            {/* Striped pattern for cut regions */}
            <defs>
                <pattern id="cutStripes" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
                    <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(239,68,68,0.3)" strokeWidth="4" />
                </pattern>
            </defs>

            {regions.map((region) => {
                const x = timeToX(region.start);
                const w = timeToX(region.end) - x;
                const isSelected = region.selected;

                return (
                    <g key={region.id}>
                        {/* Cut region background */}
                        <rect
                            x={x}
                            y={0}
                            width={Math.max(2, w)}
                            height={height}
                            fill="url(#cutStripes)"
                            stroke={isSelected ? '#ef4444' : '#dc2626'}
                            strokeWidth={isSelected ? 2 : 1}
                            opacity={isSelected ? 0.9 : 0.6}
                            style={{ cursor: 'move' }}
                            onMouseDown={(e) => handleBodyMouseDown(e, region.id)}
                            onClick={(e) => handleRegionClick(e, region.id)}
                        />

                        {/* Red overlay */}
                        <rect
                            x={x}
                            y={0}
                            width={Math.max(2, w)}
                            height={height}
                            fill="rgba(239,68,68,0.15)"
                            pointerEvents="none"
                        />

                        {/* Left edge handle */}
                        <rect
                            x={x - 3}
                            y={0}
                            width={6}
                            height={height}
                            fill={isSelected ? '#ef4444' : '#dc2626'}
                            opacity={0.8}
                            style={{ cursor: 'ew-resize' }}
                            onMouseDown={(e) => handleEdgeMouseDown(e, region.id, 'start')}
                        />

                        {/* Right edge handle */}
                        <rect
                            x={x + w - 3}
                            y={0}
                            width={6}
                            height={height}
                            fill={isSelected ? '#ef4444' : '#dc2626'}
                            opacity={0.8}
                            style={{ cursor: 'ew-resize' }}
                            onMouseDown={(e) => handleEdgeMouseDown(e, region.id, 'end')}
                        />

                        {/* "CUT" label */}
                        {w > 30 && (
                            <text
                                x={x + w / 2}
                                y={16}
                                textAnchor="middle"
                                fill="#ef4444"
                                fontSize="10"
                                fontWeight="bold"
                                fontFamily="monospace"
                                letterSpacing="2"
                                pointerEvents="none"
                            >
                                ✂ CUT
                            </text>
                        )}

                        {/* Duration label */}
                        {w > 50 && (
                            <text
                                x={x + w / 2}
                                y={height - 6}
                                textAnchor="middle"
                                fill="rgba(239,68,68,0.7)"
                                fontSize="9"
                                fontFamily="monospace"
                                pointerEvents="none"
                            >
                                {(region.end - region.start).toFixed(2)}s
                            </text>
                        )}
                    </g>
                );
            })}
        </svg>
    );
};

export default CutterOverlay;
