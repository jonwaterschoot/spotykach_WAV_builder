import React, { useRef, useState, useEffect } from 'react';

export interface AutomationPoint {
    id: string;
    time: number;
    value: number;
    selected: boolean;
}

interface PlayheadRulerProps {
    duration: number;
    currentTime: number;
    points: AutomationPoint[];
    onSeek: (time: number) => void;
    onPointsChange: (points: AutomationPoint[]) => void;
    className?: string;
}

export const PlayheadRuler: React.FC<PlayheadRulerProps> = ({
    duration,
    currentTime,
    points,
    onSeek,
    onPointsChange,
    className = ""
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
    const [draggingMarkerId, setDraggingMarkerId] = useState<string | null>(null);
    const [hoveredMarkerId, setHoveredMarkerId] = useState<string | null>(null);

    // Helpers
    const getXFromEvent = (e: MouseEvent | React.MouseEvent | React.TouchEvent) => {
        if (!containerRef.current) return 0;
        const rect = containerRef.current.getBoundingClientRect();
        let clientX;
        if ('touches' in e) { // TouchEvent
            // React.TouchEvent or Native TouchEvent? 
            // Global listener will get MouseEvent usually (unless touch specific)
            // For simplicity in global listener we assume MouseEvent for desktop usage primarily requested.
            // But if specific touch support needed we'd check properly.
            // Here we just handle MouseEvent for global.
            clientX = (e as any).touches ? (e as any).touches[0].clientX : (e as unknown as React.MouseEvent).clientX;
        } else {
            clientX = (e as React.MouseEvent).clientX;
        }
        return clientX - rect.left;
    };

    const getTimeFromX = (x: number) => {
        if (!containerRef.current || duration <= 0) return 0;
        const width = containerRef.current.offsetWidth;
        return (x / width) * duration;
    };

    // Global Drag Listeners
    useEffect(() => {
        const handleGlobalMove = (e: MouseEvent) => {
            if (!containerRef.current) return;
            const x = getXFromEvent(e);

            if (draggingMarkerId) {
                const t = Math.max(0, Math.min(duration, getTimeFromX(x)));
                const newPoints = points.map(p => p.id === draggingMarkerId ? { ...p, time: t } : p);
                onPointsChange(newPoints);
            } else if (isDraggingPlayhead) {
                const t = Math.max(0, Math.min(duration, getTimeFromX(x)));
                onSeek(t);
            }
        };

        const handleGlobalUp = () => {
            setIsDraggingPlayhead(false);
            setDraggingMarkerId(null);
        };

        if (isDraggingPlayhead || draggingMarkerId) {
            window.addEventListener('mousemove', handleGlobalMove);
            window.addEventListener('mouseup', handleGlobalUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleGlobalMove);
            window.removeEventListener('mouseup', handleGlobalUp);
        };
    }, [isDraggingPlayhead, draggingMarkerId, duration, points, onPointsChange, onSeek]);


    const handleMouseDown = (e: React.MouseEvent) => {
        if (!containerRef.current) return;

        const x = getXFromEvent(e);
        const width = containerRef.current.offsetWidth;
        const tolerance = 6;

        const hitMarker = points.find(p => {
            const px = (p.time / duration) * width;
            return Math.abs(px - x) < tolerance;
        });

        if (hitMarker) {
            e.stopPropagation();
            setDraggingMarkerId(hitMarker.id);

            if (e.shiftKey) {
                const newPoints = points.map(p => p.id === hitMarker.id ? { ...p, selected: !p.selected } : p);
                onPointsChange(newPoints);
            } else if (!hitMarker.selected) {
                const newPoints = points.map(p => ({ ...p, selected: p.id === hitMarker.id }));
                onPointsChange(newPoints);
            }
        } else {
            setIsDraggingPlayhead(true);
            const t = getTimeFromX(x);
            onSeek(t);
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        // Only for hover effects now
        if (!containerRef.current) return;
        const x = getXFromEvent(e);
        const width = containerRef.current.offsetWidth;
        const tolerance = 6;
        const hitMarker = points.find(p => {
            const px = (p.time / duration) * width;
            return Math.abs(px - x) < tolerance;
        });
        setHoveredMarkerId(hitMarker ? hitMarker.id : null);
    };

    const handleMouseLeave = () => {
        setHoveredMarkerId(null);
        // Dragging handled by global listener
    };

    // Format time helper
    const formatTime = (time: number) => {
        const m = Math.floor(time / 60);
        const s = Math.floor(time % 60);
        const ms = Math.floor((time % 1) * 10);
        return `${m}:${s.toString().padStart(2, '0')}.${ms}`;
    };

    const ticks = [];
    const step = duration > 10 ? 1 : 0.5;
    for (let i = 0; i <= duration; i += step) {
        ticks.push(i);
    }

    const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

    return (
        <div
            ref={containerRef}
            className={`relative h-6 bg-gray-900 border-b border-gray-800 cursor-pointer select-none ${className}`}
            style={{ overflowX: 'clip', overflowY: 'visible' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
        >
            {/* Ticks */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-50">
                {ticks.map(t => (
                    <div
                        key={t}
                        className="absolute top-0 bottom-0 text-[9px] text-gray-500 pl-1"
                        style={{ left: `${(t / duration) * 100}%` }}
                    >
                        {t % 5 === 0 ? <span className="absolute top-0">{t}s</span> : null}
                        <div className={`h-full border-l ${t % 1 === 0 ? 'h-3 border-gray-500' : 'h-1 border-gray-700'}`}></div>
                    </div>
                ))}
            </div>

            {/* Keyframe Markers */}
            {points.map(p => {
                const left = (p.time / duration) * 100;

                // Show line if hovered OR dragging OR selected
                // "The line should remain visble when it is selected"
                const isActive = hoveredMarkerId === p.id || draggingMarkerId === p.id || p.selected;

                // Color logic
                // Selected: Darker Orange (#CC4400)
                // Normal: Orange (#FF5500)
                const colorClass = p.selected ? 'border-t-[#CC4400]' : 'border-t-[#FF5500]';

                return (
                    <div
                        key={p.id}
                        // Centered alignment: -translate-x-1/2
                        className="absolute top-0 h-4 w-4 z-20 group -translate-x-1/2 flex flex-col items-center"
                        style={{ left: `${left}%` }}
                    >
                        {/* Marker Shape (Inverted Triangle) */}
                        {/* White Center? A small div inside? Or border trick? */}
                        {/* "I liked the white center for the selected keyframes" */}
                        <div className="relative">
                            <div
                                className={`w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] 
                                    ${colorClass}
                                    border-l-transparent border-r-transparent 
                                    transition-transform
                                    ${isActive ? 'scale-110' : ''}
                                `}
                            >
                                {/* White Dot Center Attempt? 
                                     Border shapes are hard to put content inside correctly centered.
                                     Overlaying a small white circle absolute positioned.
                                 */}
                            </div>
                            {p.selected && (
                                <div className="absolute top-0 left-1/2 -translate-x-1/2 -mt-[8px] w-1 h-1 bg-white rounded-full pointer-events-none"></div>
                            )}
                        </div>

                        {/* Dashed Line */}
                        {/* "Does not extend to the bottom? ... extend to full height?" */}
                        {/* User: "the line does not extend to the bottom" (complaint) */}
                        {/* "It should be striped/long dotted" */}
                        {/* "The line is quasi invisible due to being yellow. Lets change it to orange hues" */}
                        {/* We need it to go DOWN very far to cover waveform. 
                             Waveform is 256px. Ruler is 24px. 
                             Total height needed ~ 300px.
                         */}
                        {isActive && (
                            <div className="absolute top-2 w-px h-[300px] border-l border-dashed border-[#FF5500]/70 pointer-events-none"></div>
                        )}
                    </div>
                );
            })}

            {/* Playhead Indicator */}
            <div
                className="absolute top-0 bottom-0 w-0 z-10 pointer-events-none transition-all duration-75 ease-linear flex flex-col items-center -translate-x-1/2"
                style={{ left: `${progressPercent}%` }}
            >
                {/* Visual Triangle */}
                <div className="w-0 h-0 border-l-[6px] border-l-transparent border-t-[8px] border-t-red-500 border-r-[6px] border-r-transparent"></div>
                {/* Line */}
                <div className="w-0.5 h-full bg-red-500"></div>
            </div>

            {/* Time Display */}
            <div className="absolute right-2 top-0.5 text-[10px] font-mono text-red-400 font-bold pointer-events-none">
                {formatTime(currentTime)} / {formatTime(duration)}
            </div>
        </div>
    );
};
