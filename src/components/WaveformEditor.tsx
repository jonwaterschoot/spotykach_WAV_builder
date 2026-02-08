import { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import { Play, Pause, RotateCcw, Check, ZoomIn, ZoomOut, ArrowLeftRight, Scissors, Save, Repeat, BarChart2, Eye, Download, Copy, Trash2, X } from 'lucide-react';
import { audioProcessor } from '../lib/audio/audioProcessor';
import { encodeWAV } from '../lib/audio/wavEncoder';
import { useAudioPlayer } from '../contexts/AudioPlayerContext';
import { TapeIcon } from './TapeIcon';
import { ConfirmModal } from './ConfirmModal';

// Fade Overlay Component
interface FadeOverlayProps {
    width: number;
    height: number;
    fadeIn: number;
    fadeOut: number;
    duration: number;
    region: { start: number, end: number };
    onFadeChange?: (type: 'in' | 'out', duration: number) => void;
    onRegionChange?: (start: number, end: number) => void;
}

const FadeOverlay = ({ width, height, fadeIn, fadeOut, duration, region, onFadeChange, onRegionChange }: FadeOverlayProps) => {
    if (duration <= 0) return null;

    const pxPerSec = width / duration;

    const regionStartPx = region.start * pxPerSec;
    const regionEndPx = region.end * pxPerSec;
    const regionWidthPx = regionEndPx - regionStartPx;
    const regionDuration = region.end - region.start;

    const fadeInEndPx = regionStartPx + (fadeIn * pxPerSec);
    const fadeOutStartPx = regionEndPx - (fadeOut * pxPerSec);

    // 42s Limit Calculation
    const limitDuration = 42;
    const limitStartPx = regionStartPx + (limitDuration * pxPerSec);
    const isOverLimit = regionDuration > limitDuration;

    // Drag Logic
    const [dragging, setDragging] = useState<'in' | 'out' | 'move' | 'resize-start' | 'resize-end' | null>(null);
    const [dragStart, setDragStart] = useState<{ x: number, regionStart: number, regionEnd: number } | null>(null);

    // Ref for the SVG to calculate drag positions
    const svgRef = useRef<SVGSVGElement>(null);

    const handlePointerDown = (type: 'in' | 'out' | 'move' | 'resize-start' | 'resize-end', e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(type);
        setDragStart({ x: e.clientX, regionStart: region.start, regionEnd: region.end });
        (e.target as Element).setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!dragging || !svgRef.current || !dragStart) return;
        e.preventDefault();

        const rect = svgRef.current.getBoundingClientRect();

        if (dragging === 'move') {
            if (!onRegionChange) return;
            const dxPx = e.clientX - dragStart.x;
            const dxSec = dxPx / pxPerSec;

            let newStart = dragStart.regionStart + dxSec;
            let newEnd = dragStart.regionEnd + dxSec;

            // Clamp to Duration
            if (newStart < 0) {
                newStart = 0;
                newEnd = 0 + (dragStart.regionEnd - dragStart.regionStart);
            }
            if (newEnd > duration) {
                newEnd = duration;
                newStart = duration - (dragStart.regionEnd - dragStart.regionStart);
            }

            onRegionChange(newStart, newEnd);
        } else if (dragging === 'resize-start') {
            if (!onRegionChange) return;
            const dxPx = e.clientX - dragStart.x;
            const dxSec = dxPx / pxPerSec;

            let newStart = dragStart.regionStart + dxSec;
            // Clamp
            if (newStart < 0) newStart = 0;
            if (newStart >= dragStart.regionEnd - 0.1) newStart = dragStart.regionEnd - 0.1; // Min duration

            onRegionChange(newStart, dragStart.regionEnd);

        } else if (dragging === 'resize-end') {
            if (!onRegionChange) return;
            const dxPx = e.clientX - dragStart.x;
            const dxSec = dxPx / pxPerSec;

            let newEnd = dragStart.regionEnd + dxSec;
            // Clamp
            if (newEnd > duration) newEnd = duration;
            if (newEnd <= dragStart.regionStart + 0.1) newEnd = dragStart.regionStart + 0.1; // Min duration

            onRegionChange(dragStart.regionStart, newEnd);

        } else {
            if (!onFadeChange) return;
            const relativeX = e.clientX - rect.left;
            const timeAtCursor = (relativeX / rect.width) * duration;

            if (dragging === 'in') {
                let newFadeIn = timeAtCursor - region.start;
                if (newFadeIn < 0) newFadeIn = 0;
                if (newFadeIn > (region.end - region.start)) newFadeIn = (region.end - region.start);
                onFadeChange('in', newFadeIn);
            } else {
                let newFadeOut = region.end - timeAtCursor;
                if (newFadeOut < 0) newFadeOut = 0;
                if (newFadeOut > (region.end - region.start)) newFadeOut = (region.end - region.start);
                onFadeChange('out', newFadeOut);
            }
        }
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        setDragging(null);
        setDragStart(null);
        (e.target as Element).releasePointerCapture(e.pointerId);
    };

    return (
        <svg
            ref={svgRef}
            className="absolute top-0 left-0 fade-overlay fade-overlay-svg-container"
            style={{
                width: '100%',
                height: '100%',
                pointerEvents: 'none', // Base is none, but children can have auto
                zIndex: 999,
                position: 'absolute',
                top: 0,
                left: 0
            }}
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp} // Safety
        >
            <defs>
                <style>
                    {`
                        .fade-overlay { mix-blend-mode: normal; }
                        .fade-handle { pointer-events: auto; cursor: col-resize; }
                        .fade-handle:hover line { stroke: white; }
                        .fade-handle:hover polygon { fill: white; }

                        /* Bottom Move Bar */
                        .move-bar { pointer-events: auto; cursor: grab; fill: rgba(0,0,0,0.4); stroke: rgba(255,255,255,0.2); transition: fill 0.2s; }
                        .move-bar:hover { fill: rgba(255,255,255,0.1); stroke: rgba(255,255,255,0.5); }
                        .move-bar:active { cursor: grabbing; fill: rgba(255,255,255,0.2); }
                        
                        .resize-handle { pointer-events: auto; cursor: col-resize; transition: opacity 0.2s; }
                        .resize-handle:hover rect { opacity: 1; }
                        .resize-handle:active rect { fill: #ffb900; }

                        /* Corner Fade Creator Handles */
                        .corner-handle { pointer-events: auto; cursor: col-resize; fill: rgba(255,255,255,0.5); transition: fill 0.2s; }
                        .corner-handle:hover { fill: rgba(255,255,255,1); }
                        
                        rect.handle-hit-area { fill: transparent; pointer-events: auto; cursor: col-resize; }
                        rect.handle-hit-area:hover + polygon { fill: white; }
                        
                        /* Danger Zone Pattern */
                        .danger-pattern { fill: url(#dangerStripe); opacity: 0.3; pointer-events: none; }
                    `}
                </style>
                <pattern id="dangerStripe" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <line x1="0" y1="0" x2="0" y2="10" stroke="#f00f13" strokeWidth="2" />
                </pattern>
            </defs>

            {/* Danger Zone Overlay (Over 42s) */}
            {isOverLimit && (
                <rect
                    x={limitStartPx}
                    y={0}
                    width={regionEndPx - limitStartPx}
                    height={height}
                    fill="rgba(240, 15, 19, 0.1)"
                    className="danger-zone"
                />
            )}
            {isOverLimit && (
                <rect
                    x={limitStartPx}
                    y={0}
                    width={regionEndPx - limitStartPx}
                    height={height}
                    fill="url(#dangerStripe)"
                    opacity={0.2}
                    style={{ pointerEvents: 'none' }}
                />
            )}


            {/* Bottom Drag Bar for Moving Entire Region */}
            <g className="move-group">
                {/* Center Move Bar */}
                <rect
                    x={regionStartPx + 10}
                    y={height - 24}
                    width={Math.max(0, regionWidthPx - 20)}
                    height={24}
                    className="move-bar"
                    onPointerDown={(e) => handlePointerDown('move', e)}
                />

                {/* Left Resize Handle */}
                <g className="resize-handle" onPointerDown={(e) => handlePointerDown('resize-start', e)}>
                    <rect
                        x={regionStartPx}
                        y={height - 24}
                        width={10}
                        height={24}
                        fill="#fff"
                        opacity={0.8}
                        rx="2"
                    />
                    {/* Grip Lines */}
                    <line x1={regionStartPx + 3} y1={height - 20} x2={regionStartPx + 3} y2={height - 4} stroke="black" strokeWidth="1" opacity={0.5} />
                    <line x1={regionStartPx + 6} y1={height - 20} x2={regionStartPx + 6} y2={height - 4} stroke="black" strokeWidth="1" opacity={0.5} />
                </g>

                {/* Right Resize Handle */}
                <g className="resize-handle" onPointerDown={(e) => handlePointerDown('resize-end', e)}>
                    <rect
                        x={regionEndPx - 10}
                        y={height - 24}
                        width={10}
                        height={24}
                        fill="#fff"
                        opacity={0.8}
                        rx="2"
                    />
                    {/* Grip Lines */}
                    <line x1={regionEndPx - 7} y1={height - 20} x2={regionEndPx - 7} y2={height - 4} stroke="black" strokeWidth="1" opacity={0.5} />
                    <line x1={regionEndPx - 4} y1={height - 20} x2={regionEndPx - 4} y2={height - 4} stroke="black" strokeWidth="1" opacity={0.5} />
                </g>

                {/* Duration Text */}
                <text
                    x={regionStartPx + regionWidthPx / 2}
                    y={height - 8}
                    textAnchor="middle"
                    fill={isOverLimit ? "#f00f13" : "white"}
                    fontSize="10"
                    fontWeight="bold"
                    pointerEvents="none"
                    style={{ textShadow: '0 1px 2px black' }}
                >
                    {regionDuration.toFixed(2)}s {isOverLimit ? '(!)' : ''}
                </text>
            </g>

            {/* Fade In S-Curve */}
            {fadeIn > 0 && (
                <>
                    <path
                        d={`M ${regionStartPx},${height} C ${regionStartPx + (fadeInEndPx - regionStartPx) / 2},${height} ${fadeInEndPx - (fadeInEndPx - regionStartPx) / 2},0 ${fadeInEndPx},0 L ${regionStartPx},0 Z`}
                        fill="rgba(255, 185, 0, 0.3)"
                    />
                    <path
                        d={`M ${regionStartPx},${height} C ${regionStartPx + (fadeInEndPx - regionStartPx) / 2},${height} ${fadeInEndPx - (fadeInEndPx - regionStartPx) / 2},0 ${fadeInEndPx},0`}
                        fill="none" stroke="rgba(255, 255, 255, 0.9)" strokeWidth="2"
                    />
                    {/* Active Fade In Handle (Dotted Line) */}
                    <g className="fade-handle" onPointerDown={(e) => handlePointerDown('in', e)}>
                        <line x1={fadeInEndPx} y1={0} x2={fadeInEndPx} y2={height} stroke="rgba(255,255,255,0.5)" strokeWidth="1" strokeDasharray="4 4" />
                        <polygon
                            points={`${fadeInEndPx},0 ${fadeInEndPx - 12},0 ${fadeInEndPx},16`}
                            fill="rgba(255,255,255,0.8)"
                        />
                        {/* Invisible Hit Area Wider */}
                        <rect x={fadeInEndPx - 16} y={0} width={32} height={height} className="handle-hit-area" />
                    </g>
                </>
            )}

            {/* Corner Fade Creator (Start) - Always visible at curve start (top), allows pulling out a fade */}
            <g className="corner-handle" onPointerDown={(e) => handlePointerDown('in', e)}>
                <polygon points={`${regionStartPx},0 ${regionStartPx + 24},0 ${regionStartPx},24`} />
                <rect x={regionStartPx} y={0} width={24} height={24} fill="transparent" style={{ pointerEvents: 'auto', cursor: 'ew-resize' }} />
            </g>


            {/* Fade Out S-Curve & Gradient */}
            {fadeOut > 0 && (
                <>
                    <path
                        d={`M ${fadeOutStartPx},0 C ${fadeOutStartPx + (regionEndPx - fadeOutStartPx) / 2},0 ${regionEndPx - (regionEndPx - fadeOutStartPx) / 2},${height} ${regionEndPx},${height} L ${regionEndPx},0 Z`}
                        fill="rgba(255, 185, 0, 0.2)"
                    />
                    <path
                        d={`M ${fadeOutStartPx},0 C ${fadeOutStartPx + (regionEndPx - fadeOutStartPx) / 2},0 ${regionEndPx - (regionEndPx - fadeOutStartPx) / 2},${height} ${regionEndPx},${height}`}
                        fill="none"
                        stroke="rgba(255, 255, 255, 0.8)"
                        strokeWidth="2"
                    />
                    {/* Active Fade Out Handle */}
                    <g className="fade-handle" onPointerDown={(e) => handlePointerDown('out', e)}>
                        {/* Dotted Line */}
                        <line
                            x1={fadeOutStartPx} y1={0}
                            x2={fadeOutStartPx} y2={height}
                            stroke="rgba(255,255,255,0.5)"
                            strokeWidth="1"
                            strokeDasharray="4 4"
                        />
                        {/* Triangle Handle at Top (Flipped) */}
                        <polygon
                            points={`${fadeOutStartPx},0 ${fadeOutStartPx + 12},0 ${fadeOutStartPx},16`}
                            fill="rgba(255,255,255,0.8)"
                        />
                        {/* Invisible Hit Area Wider */}
                        <rect x={fadeOutStartPx - 16} y={0} width={32} height={height} fill="transparent" />
                    </g>
                </>
            )}

            {/* Corner Fade Creator (End) - Top Right Corner */}
            <g className="corner-handle" onPointerDown={(e) => handlePointerDown('out', e)}>
                <polygon points={`${regionEndPx},0 ${regionEndPx - 24},0 ${regionEndPx},24`} />
                <rect x={regionEndPx - 24} y={0} width={24} height={24} fill="transparent" style={{ pointerEvents: 'auto', cursor: 'ew-resize' }} />
            </g>

        </svg>
    );
};

import type { AudioVersion, TapeColor } from '../types';

interface EditorSlot {
    id: number;
    name: string;
    blob: Blob;
    fileId?: string; // Add this if needed, or stick to Slot
}

interface WaveformEditorProps {
    slot: EditorSlot;
    versions: AudioVersion[];
    activeVersionId: string;
    onClose: () => void;
    onSave: (blob: Blob, duration: number, description: string, isDirty: boolean, processing?: ('normalized' | 'trimmed' | 'looped')[]) => void;
    onSaveAsCopy: (blob: Blob, duration: number) => void;
    onDeleteVersion?: (versionId: string) => void;
    onAssignVersion?: (versionId: string) => void;
    onMoveVersionToPool?: (versionId: string) => void;
    tapeColor?: TapeColor;
    isDuplicate?: boolean;
    onSaveUnique?: (blob: Blob, duration: number, processing?: ('normalized' | 'trimmed' | 'looped')[]) => void;
}

export const WaveformEditor = ({ slot, versions, activeVersionId, tapeColor, onClose, onSave, onSaveAsCopy, onDeleteVersion, onAssignVersion, onMoveVersionToPool, isDuplicate, onSaveUnique }: WaveformEditorProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const wavesurfer = useRef<WaveSurfer | null>(null);
    const regions = useRef<any>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [zoom, setZoom] = useState(10);
    const [fadeIn, setFadeIn] = useState(0);
    const [fadeOut, setFadeOut] = useState(0);
    const [isLooping, setIsLooping] = useState(false);
    const [loopCrossfade, setLoopCrossfade] = useState(0.2); // Default 0.2s
    const [showLoopPanel, setShowLoopPanel] = useState(false);
    // Notification State
    const [notification, setNotification] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
    const notificationTimeout = useRef<NodeJS.Timeout | null>(null);

    const showToast = (message: string, type: 'success' | 'error' = 'success') => {
        if (notificationTimeout.current) clearTimeout(notificationTimeout.current);
        setNotification({ message, type });
        notificationTimeout.current = setTimeout(() => {
            setNotification(null);
        }, 3000);
    };
    const [isProcessing, setIsProcessing] = useState(false);
    const [helpText, setHelpText] = useState("");

    // Dirty State & Version Management
    const [isDirty, setIsDirty] = useState(false);
    const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);
    const [pendingVersion, setPendingVersion] = useState<AudioVersion | null>(null);

    // Preview Player for History
    const [previewAudio] = useState(new Audio());
    const [previewingVersionId, setPreviewingVersionId] = useState<string | null>(null);

    const [currentBlob, setCurrentBlob] = useState<Blob | null>(slot.blob);
    // Track which version is currently loaded in the editor (visual highlight)
    const [loadedVersionId, setLoadedVersionId] = useState<string>(activeVersionId);

    const [originalBuffer, setOriginalBuffer] = useState<AudioBuffer | null>(null);

    // Global Player Integration
    const { stop: stopGlobalPlayer } = useAudioPlayer();

    const [editorDuration, setEditorDuration] = useState(0);
    const [minZoom, setMinZoom] = useState(0.1); // Default low value until loaded
    const [regionState, setRegionState] = useState<{ start: number, end: number }>({ start: 0, end: 0 });
    const rafRef = useRef<number | null>(null);

    // Normalization & Processing State
    const [hasNormalized, setHasNormalized] = useState(false);
    const [hasTrimmed, setHasTrimmed] = useState(false);

    // UI States
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [selectedVersionIds, setSelectedVersionIds] = useState<Set<string>>(new Set());
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showMoveConfirm, setShowMoveConfirm] = useState(false);

    const isMounted = useRef(false);
    const initTimeout = useRef<NodeJS.Timeout | null>(null);

    // Mark dirty on changes
    const handleDirtyChange = () => {
        if (!isDirty && isMounted.current) setIsDirty(true);
    };

    // Re-initialize when currentBlob changes (e.g. loading a version)
    useEffect(() => {
        isMounted.current = true;

        if (initTimeout.current) clearTimeout(initTimeout.current);
        initTimeout.current = setTimeout(() => {
            initEditor();
        }, 100);

        return () => {
            isMounted.current = false;
            if (initTimeout.current) clearTimeout(initTimeout.current);
            if (wavesurfer.current) {
                try { wavesurfer.current.destroy(); } catch (e) { console.warn(e); }
                wavesurfer.current = null;
            }
        };
    }, [currentBlob]); // Depend on currentBlob, not slot.blob directly

    // Reset State on Blob Change
    useEffect(() => {
        setFadeIn(0);
        setFadeOut(0);
        setIsDirty(false);
        // Load processing state from version if available
        const currentVersion = versions.find(v => v.id === loadedVersionId);
        if (currentVersion?.processing) {
            setHasNormalized(currentVersion.processing.includes('normalized'));
            setHasTrimmed(currentVersion.processing.includes('trimmed'));
        } else {
            setHasNormalized(false);
            setHasTrimmed(false);
        }
        // Region is reset in initEditor
    }, [currentBlob, loadedVersionId, versions]);

    // If slot.blob changes from parent (e.g. external update?), sync it.
    useEffect(() => {
        if (slot.blob !== currentBlob) {
            setCurrentBlob(slot.blob);
        }
    }, [slot.blob]);

    // Sync Active Version from Parent
    useEffect(() => {
        if (activeVersionId !== loadedVersionId) {
            setLoadedVersionId(activeVersionId);
            // Optionally load the blob if it's not the current one?
            // Usually parent updates slot.blob together with activeVersionId.
            // But we already have logic to sync slot.blob above.
            // We just need to ensure the Highlight (loadedVersionId) matches.
        }
    }, [activeVersionId]);

    useEffect(() => {
        if (wavesurfer.current) {
            wavesurfer.current.zoom(zoom);
        }
    }, [zoom]);

    // Refs for state accessible in event listeners
    const isLoopingRef = useRef(false);
    const wavesurferRef = useRef<WaveSurfer | null>(null);
    const regionsRef = useRef<any>(null); // Keep track of regions plugin

    // Update refs when state changes
    useEffect(() => {
        isLoopingRef.current = isLooping;
    }, [isLooping]);

    const initEditor = async () => {
        if (!containerRef.current || !currentBlob || !isMounted.current) return;

        // Cleanup old
        if (wavesurfer.current) {
            wavesurfer.current.destroy();
            wavesurfer.current = null;
        }

        try {
            const blobUrl = URL.createObjectURL(currentBlob);

            const ws = WaveSurfer.create({
                container: containerRef.current,
                waveColor: '#ffb900',
                progressColor: '#FFDF9B',
                url: blobUrl,
                height: 256,
                minPxPerSec: zoom,
                interact: true,
                dragToSeek: true,
                autoScroll: false, // We handle scrolling via the external container size
            });

            wavesurfer.current = ws;
            wavesurferRef.current = ws;

            ws.on('error', (err: any) => {
                if (!isMounted.current) return;
                // Filter noise
                if (typeof err === 'string' && err.includes('not initialized')) return;
                console.error("WaveSurfer Error:", err);
            });

            try {
                const wsRegions = ws.registerPlugin(RegionsPlugin.create());
                regions.current = wsRegions;
                regionsRef.current = wsRegions;

                ws.on('ready', () => {
                    if (!isMounted.current) return;
                    const duration = ws.getDuration();
                    setEditorDuration(duration);

                    // Auto-Fit Initial Zoom
                    if (containerRef.current) {
                        const width = containerRef.current.clientWidth;
                        // Calculate zoom to fit duration in width
                        // Ensure minPxPerSec is at least something reasonable
                        const fitZoom = width / duration;
                        setMinZoom(fitZoom);
                        setZoom(fitZoom);
                        ws.zoom(fitZoom);
                    }

                    // Calculate Initial Region (Max 42s)
                    let rStart = 0;
                    let rEnd = duration;

                    if (duration > 42) {
                        const mid = duration / 2;
                        rStart = mid - 21;
                        rEnd = mid + 21;
                    }

                    // Add Region
                    wsRegions.addRegion({
                        start: rStart,
                        end: rEnd,
                        color: 'rgba(255, 255, 255, 0.1)',
                        drag: false,
                        resize: true
                    } as any);
                    setRegionState({ start: rStart, end: rEnd });
                });

                // --- ROBUST REGION LOGIC ---
                // Sync State
                wsRegions.on('region-update', (r: any) => setRegionState({ start: r.start, end: r.end }));
                wsRegions.on('region-updated', (r: any) => {
                    setRegionState({ start: r.start, end: r.end });
                    if (isMounted.current) handleDirtyChange();
                });

                // GAPLESS LOOPING: Trigger immediately when leaving the region
                wsRegions.on('region-out', (r: any) => {
                    if (isLoopingRef.current && isMounted.current) {
                        // Force seek to start and play range for gapless loop
                        // r.play() sometimes fails to seek back instantly if not configured
                        ws.play(r.start, r.end);
                    }
                });

            } catch (e) { console.warn(e); }

            ws.on('play', () => isMounted.current && setIsPlaying(true));
            ws.on('pause', () => {
                if (!isMounted.current) return;
                setIsPlaying(false);
                // Removed manual loop check (handled by region-out)
            });
            // FINISH HANDLER: Check if we need to loop (Edge case where region ends at file end)
            ws.on('finish', () => {
                if (isLoopingRef.current && isMounted.current) {
                    // Find active region and restart
                    if (regionsRef.current) {
                        const list = regionsRef.current.getRegions();
                        if (list.length > 0) {
                            const r = list[0];
                            ws.play(r.start, r.end);
                            return; // Don't set isPlaying(false)
                        }
                    }
                    // Fallback for full file loop
                    ws.play();
                } else if (isMounted.current) {
                    setIsPlaying(false);
                }
            });

            // Load Buffer
            const arrayBuffer = await currentBlob.arrayBuffer();
            if (!isMounted.current) return;
            const ctx = new AudioContext();
            const decoded = await ctx.decodeAudioData(arrayBuffer);
            setOriginalBuffer(decoded);
            ctx.close();

        } catch (e) {
            console.error(e);
            if (isMounted.current) showToast("Init Failed: " + e, 'error');
        }
    };

    // Global Player Integration & Fade Volume Logic
    useEffect(() => {
        stopGlobalPlayer();
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, []);

    const updateVolume = () => {
        if (!wavesurfer.current) return;

        const currentTime = wavesurfer.current.getCurrentTime();
        // Fades are relative to region start
        const relativeTime = currentTime - regionState.start;
        const regionDuration = regionState.end - regionState.start;

        let volume = 1;

        // Apply Fade In (Sine Ease)
        if (relativeTime < 0 || relativeTime > regionDuration) {
            volume = 1;
        } else {
            if (fadeIn > 0 && relativeTime < fadeIn) {
                const t = relativeTime / fadeIn;
                volume = 0.5 * (1 - Math.cos(t * Math.PI));
            }
            else if (fadeOut > 0 && relativeTime > (regionDuration - fadeOut)) {
                const timeLeft = regionDuration - relativeTime;
                const t = timeLeft / fadeOut;
                volume = 0.5 * (1 - Math.cos(t * Math.PI));
            }
        }

        wavesurfer.current.setVolume(volume);

        if (isPlaying) {
            rafRef.current = requestAnimationFrame(updateVolume);
        }
    };

    // Watch playback state to start/stop volume loop
    useEffect(() => {
        if (isPlaying) {
            updateVolume();
        } else {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        }
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [isPlaying, fadeIn, fadeOut]);


    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === 'Space') {
                e.preventDefault();
                handlePlayPause();
            }
        };
        // Use capture to ensure we get it even if focus is wonky, 
        // OR rely on global window bubble.
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isPlaying, isLooping]); // Depend on state for handlePlayPause closure

    // Zoom Handlers
    // Zoom Handlers
    const setZoomCentered = (newZoom: number, time?: number) => {
        // Enforce minZoom
        const clampedZoom = Math.max(newZoom, minZoom);
        setZoom(clampedZoom);

        // Scroll to keep playhead centered
        if (wavesurfer.current && scrollContainerRef.current && containerRef.current) {
            const targetTime = time !== undefined ? time : wavesurfer.current.getCurrentTime();
            const viewportWidth = scrollContainerRef.current.clientWidth;
            const newScroll = (targetTime * clampedZoom) - (viewportWidth / 2);

            // We need to wait for layout update since contentWidth depends on zoom
            requestAnimationFrame(() => {
                if (scrollContainerRef.current)
                    scrollContainerRef.current.scrollLeft = Math.max(0, newScroll);
            });
        }
    };

    const handleZoomIn = () => setZoomCentered(Math.min(zoom * 1.25, 500));
    const handleZoomOut = () => setZoomCentered(Math.max(zoom * 0.8, minZoom));

    const handleFitView = () => {
        if (!scrollContainerRef.current || !editorDuration) return;
        const width = scrollContainerRef.current.clientWidth;
        // Fit all: zoom = width / duration
        const fitZoom = width / editorDuration;
        // Ensure we update minZoom just in case (e.g. resize)
        setMinZoom(fitZoom);
        setZoom(fitZoom);
        // Scroll to 0
        if (scrollContainerRef.current) scrollContainerRef.current.scrollLeft = 0;
    };

    const handleFitTrim = () => {
        if (!scrollContainerRef.current || !editorDuration) return;
        const width = scrollContainerRef.current.clientWidth;
        const regionDuration = regionState.end - regionState.start;
        if (regionDuration <= 0) return;

        // Add margin (90% width usage = 5% margin aside)
        // This ensures the region is comfortably visible
        const safeWidth = width * 0.9;
        const newZoom = safeWidth / regionDuration;

        const finalZoom = Math.max(newZoom, minZoom);
        setZoom(finalZoom);

        // Scroll to center of region
        setTimeout(() => {
            if (scrollContainerRef.current) {
                const paddingOffset = 16; // px-4 = 16px
                const midpointTime = regionState.start + (regionDuration / 2);
                const midpointPx = (midpointTime * finalZoom) + paddingOffset;
                const targetScroll = midpointPx - (width / 2);
                scrollContainerRef.current.scrollLeft = Math.max(0, targetScroll);
            }
        }, 0);
    };

    const handleWheel = (e: React.WheelEvent) => {
        if (e.ctrlKey) {
            e.preventDefault();
            const delta = -Math.sign(e.deltaY);
            const factor = 1.1;

            let newZoom = zoom;
            if (delta > 0) newZoom = Math.min(zoom * factor, 500);
            else newZoom = Math.max(zoom / factor, minZoom);

            setZoomCentered(newZoom);
        }
    };

    const handlePlayPause = async () => {
        if (!wavesurfer.current) return;

        if (isPlaying) {
            wavesurfer.current.pause();
        } else {
            const regionList = regions.current?.getRegions();
            if (regionList && regionList.length > 0) {
                const region = regionList[0];
                const currentTime = wavesurfer.current.getCurrentTime();
                const tolerance = 0.05; // 50ms tolerance for "at end"

                // Ensure we play within the region bounds.
                // region.play() plays from start to end. 
                // ws.play(start, end) plays range.

                // 1. If at the end (or past), jump to start
                if (currentTime >= region.end - tolerance) {
                    wavesurfer.current.play(region.start, region.end);
                }
                // 2. If inside, resume from current pos to end
                else if (currentTime >= region.start && currentTime < region.end) {
                    wavesurfer.current.play(currentTime, region.end);
                }
                // 3. If before, jump to start
                else {
                    wavesurfer.current.play(region.start, region.end);
                }
            } else {
                wavesurfer.current.play();
            }
        }
    };

    const handleSave = async () => {
        if (!originalBuffer) return;

        setIsProcessing(true);
        try {
            // Check if Dirty (Params changed from default)
            // Default: fades 0, region covers full file
            let isDirty = false;
            if (fadeIn > 0 || fadeOut > 0) isDirty = true;
            if (regionState.start > 0.01 || regionState.end < (originalBuffer.duration - 0.01)) isDirty = true;
            // What if content hasn't changed but we just opened it?
            // "Save to Tape" implies assigning this specific edited version.
            // If nothing changed, we just re-assign the current version. (Handled by parent)

            let start = 0;
            let end = originalBuffer.duration;

            if (regions.current) {
                const regionList = regions.current.getRegions();
                if (regionList && regionList.length > 0) {
                    start = regionList[0].start;
                    end = regionList[0].end;
                }
            }

            // Optimization: If not dirty, we can just pass the original blob back?
            // Prepare blob for saving

            let finalBlob: Blob;
            let finalDuration: number;

            if (!isDirty) {
                // Not dirty -> Assign to Tape
                let processed = await audioProcessor.trim(originalBuffer, start, end);
                finalDuration = processed.duration;
                finalBlob = encodeWAV(processed);

                // Preserve processing tags if assigning same version? 
                // Parent handles assignment. If we pass !isDirty, it re-uses current version logic usually?
                // Actually App.tsx creates a NEW version even if not dirty in current logic (unless blob match check).
                // Let's pass current processing tags if we are just "assigning".
                const currentTags = versions.find(v => v.id === loadedVersionId)?.processing;
                onSave(finalBlob, finalDuration, 'Edited', isDirty, currentTags);

            } else {
                let processed = await audioProcessor.trim(originalBuffer, start, end);
                if (fadeIn > 0 || fadeOut > 0) {
                    processed = await audioProcessor.applyFades(processed, fadeIn, fadeOut);
                }
                finalDuration = processed.duration;
                finalBlob = encodeWAV(processed);

                // New edit -> likely 'trimmed' unless it was just fades?
                // We don't distinguish just fades vs trim well. 
                // Let's assume if it's dirty and saved, it's at least "Processed".
                // But specifically for 'trimmed' button state:
                // Only mark 'trimmed' if we explicitly used "Apply Trim" button? 
                // "Save to Tape" effectively applies everything.
                // Let's mark it 'trimmed' if start/end were modified or it's a save.
                onSave(finalBlob, finalDuration, 'Edited', isDirty, ['trimmed']);
            }
            showToast(isDirty ? "Version Saved!" : "Assigned to Tape", "success");

            if (!isDirty) {
                onClose();
            }

        } catch (e) {
            console.error(e);
            showToast("Failed to save", "error");
        } finally {
            setIsProcessing(false);
        }
    };



    // Version Loading Logic
    // Version Loading Logic
    const handleLoadVersion = (version: AudioVersion) => {
        if (!isMounted.current) return;

        // If same version, do nothing
        if (version.id === loadedVersionId) return;

        if (isDirty) {
            setPendingVersion(version);
            setShowUnsavedWarning(true);
        } else {
            setCurrentBlob(version.blob);
            setLoadedVersionId(version.id);
        }
    };

    // ... (rest of effects) ...

    // Preview Logic
    const togglePreview = (v: AudioVersion, e: React.MouseEvent) => {
        e.stopPropagation();
        if (previewingVersionId === v.id) {
            previewAudio.pause();
            setPreviewingVersionId(null);
        } else {
            const url = URL.createObjectURL(v.blob);
            previewAudio.src = url;
            previewAudio.play().catch(e => console.error("Preview fail", e));
            setPreviewingVersionId(v.id);
            previewAudio.onended = () => setPreviewingVersionId(null);
        }
    };

    // ... initEditor needs to attach listeners for isDirty ...


    // ...

    // We calculate width to force the scroll container to expand
    // Ensure we have a valid width based on duration and zoom
    const contentWidth = Math.floor(editorDuration * zoom);

    // Manual Scrubbing Logic
    const isScrubbingRef = useRef(false);

    const handleWaveformPointerDown = (e: React.PointerEvent) => {
        // Only left click
        if (e.button !== 0) return;

        isScrubbingRef.current = true;
        (e.target as Element).setPointerCapture(e.pointerId);

        // Initial Seek
        handleScrub(e);
    };

    const handleWaveformPointerMove = (e: React.PointerEvent) => {
        if (!isScrubbingRef.current) return;
        handleScrub(e);
    };

    const handleWaveformPointerUp = (e: React.PointerEvent) => {
        if (isScrubbingRef.current) {
            isScrubbingRef.current = false;
            (e.target as Element).releasePointerCapture(e.pointerId);
        }
    };

    const handleScrub = (e: React.PointerEvent) => {
        if (!containerRef.current || !wavesurfer.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        const relativeX = e.clientX - rect.left;

        // Clamp
        let progress = relativeX / rect.width;
        if (progress < 0) progress = 0;
        if (progress > 1) progress = 1;

        wavesurfer.current.seekTo(progress);
    };

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur flex items-center justify-center z-50 p-6">
            <style>{`
                /* Allow clicks to pass through region body to seek */
                .wavesurfer-region {
                    pointer-events: none !important;
                }
                /* Restrict Region Handles to Bottom 50% for Trimming */
                .wavesurfer-region [data-region-handle] {
                   height: 50% !important;
                   top: 50% !important;
                   pointer-events: auto !important;
                }
                /* Ensure region visuals are above waveform but below handles */
                .wavesurfer-region {
                    z-index: 4 !important;
                }
                /* Toast Animation */
                @keyframes slideIn {
                    from { transform: translateY(-20px) translateX(-50%); opacity: 0; }
                    to { transform: translateY(0) translateX(-50%); opacity: 1; }
                }

                /* Hide WaveSurfer Internal Scrollbar */
                ::part(scroll) {
                    overflow-x: hidden !important;
                }
                
                /* Custom Scrollbar */
                .editor-scroll::-webkit-scrollbar {
                    height: 12px;
                    background: #111;
                    border-top: 1px solid #333;
                }
                .editor-scroll::-webkit-scrollbar-thumb, .history-scroll::-webkit-scrollbar-thumb {
                    background: #444;
                    border-radius: 6px;
                    border: 2px solid #111;
                }
                .editor-scroll::-webkit-scrollbar-thumb:hover, .history-scroll::-webkit-scrollbar-thumb:hover {
                    background: #666;
                }
                
                /* History Sidebar Scrollbar */
                .history-scroll::-webkit-scrollbar {
                    width: 6px;
                    background: #111;
                }
            `}</style>

            {/* Toast Notification */}
            {notification && (
                <div className="absolute top-8 left-1/2 z-[70] animate-[slideIn_0.3s_ease-out]" style={{ transform: 'translateX(-50%)' }}>
                    <div className={`px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 border ${notification.type === 'success'
                        ? 'bg-green-900/90 border-green-500 text-green-100'
                        : 'bg-red-900/90 border-red-500 text-red-100'
                        }`}>
                        {notification.type === 'success' ? (
                            <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center text-black font-bold text-xs">✓</div>
                        ) : (
                            <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center text-white font-bold text-xs">!</div>
                        )}
                        <span className="font-medium text-sm">{notification.message}</span>
                    </div>
                </div>
            )}

            {/* Unsaved Changes Modal */}
            {showUnsavedWarning && (
                <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-[#1a1a1a] border border-gray-700 p-6 rounded-xl shadow-2xl max-w-sm w-full text-center">
                        <h3 className="text-xl font-bold text-white mb-2">Unsaved Changes</h3>
                        <p className="text-gray-400 mb-6 text-sm">You have unsaved changes in the current view. Loading a different version will discard them.</p>
                        <div className="flex gap-3 justify-center">
                            <button
                                onClick={() => setShowUnsavedWarning(false)}
                                className="px-4 py-2 rounded-full bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium text-sm transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    if (pendingVersion) {
                                        setCurrentBlob(pendingVersion.blob);
                                        setLoadedVersionId(pendingVersion.id);
                                        setShowUnsavedWarning(false);
                                        setPendingVersion(null);
                                    }
                                }}
                                className="px-4 py-2 rounded-full bg-red-600 hover:bg-red-500 text-white font-bold text-sm transition-colors"
                            >
                                Discard & Load
                            </button>
                        </div>
                    </div>
                </div>
            )}


            <div className="bg-[#1a1a1a] border border-gray-800 rounded-2xl w-full max-w-7xl h-[90vh] shadow-2xl flex overflow-hidden">
                {/* Reset Confirmation Modal */}
                <ConfirmModal
                    isOpen={showResetConfirm}
                    onClose={() => setShowResetConfirm(false)}
                    onConfirm={() => {
                        // Revert to the CURRENTLY loaded version's state
                        const v = versions.find(v => v.id === loadedVersionId);
                        if (v) {
                            setCurrentBlob(v.blob);
                        }
                        setFadeIn(0);
                        setFadeOut(0);
                        setIsDirty(false);

                        // Reset Region Logic (Max 42s or duration)
                        if (wavesurfer.current && regions.current) {
                            const duration = wavesurfer.current.getDuration();
                            regions.current.clearRegions();

                            let rEnd = duration;
                            let rStart = 0;
                            if (duration > 42) {
                                const mid = duration / 2;
                                rStart = mid - 21;
                                rEnd = mid + 21;
                            }

                            regions.current.addRegion({
                                start: rStart,
                                end: rEnd,
                                color: 'rgba(255, 255, 255, 0.1)',
                                drag: false,
                                resize: true
                            });
                            setRegionState({ start: rStart, end: rEnd });
                        }

                        showToast("Reset to original", "success");
                        setShowResetConfirm(false);
                    }}
                    title="Reset Changes?"
                    message="Are you sure you want to discard all changes and revert to the last saved version? This cannot be undone."
                    confirmLabel="Discard & Reset"
                    isDestructive={true}
                />

                {/* Batch Delete Confirmation */}
                <ConfirmModal
                    isOpen={showDeleteConfirm}
                    onClose={() => setShowDeleteConfirm(false)}
                    onConfirm={() => {
                        if (onDeleteVersion) {
                            selectedVersionIds.forEach(id => onDeleteVersion(id));
                            setSelectedVersionIds(new Set());
                            setShowDeleteConfirm(false);
                            showToast(`Deleted ${selectedVersionIds.size} versions`, "success");
                        }
                    }}
                    title={`Delete ${selectedVersionIds.size} Version${selectedVersionIds.size > 1 ? 's' : ''}?`}
                    message="This action cannot be undone. These versions will be permanently removed from the history."
                    confirmLabel="Delete Forever"
                    isDestructive={true}
                />

                {/* Batch Move Confirmation */}
                <ConfirmModal
                    isOpen={showMoveConfirm}
                    onClose={() => setShowMoveConfirm(false)}
                    onConfirm={() => {
                        if (onMoveVersionToPool) {
                            selectedVersionIds.forEach(id => onMoveVersionToPool(id));
                            setSelectedVersionIds(new Set());
                            setShowMoveConfirm(false);
                            showToast(`Moved ${selectedVersionIds.size} versions to Pool`, "success");
                        }
                    }}
                    title={`Move ${selectedVersionIds.size} Version${selectedVersionIds.size > 1 ? 's' : ''} to Pool?`}
                    message="These versions will be removed from this file's history and created as new unassigned files."
                    confirmLabel="Move to Pool"
                />

                {/* SIDEBAR: Versions */}
                <div className="w-64 bg-[#111] border-r border-gray-800 flex flex-col shrink-0">
                    <div className="p-4 border-b border-gray-800 bg-gray-900/50 flex flex-wrap gap-2 justify-between items-center">
                        <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest">History</h4>
                        {selectedVersionIds.size > 0 && (
                            <div className="flex gap-1">
                                {onMoveVersionToPool && (
                                    <button
                                        onClick={() => setShowMoveConfirm(true)}
                                        className="text-xs font-bold text-synthux-yellow hover:text-white flex items-center gap-1 bg-synthux-yellow/10 px-2 py-1 rounded hover:bg-synthux-yellow/30 transition-colors border border-synthux-yellow/20"
                                    >
                                        <X size={12} /> Move
                                    </button>
                                )}
                                {onDeleteVersion && (
                                    <button
                                        onClick={() => setShowDeleteConfirm(true)}
                                        className="text-xs font-bold text-red-400 hover:text-red-300 flex items-center gap-1 bg-red-900/20 px-2 py-1 rounded hover:bg-red-900/40 transition-colors"
                                    >
                                        <Trash2 size={12} /> Delete
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-2 history-scroll">
                        {versions.map((v) => {
                            const isActive = v.id === loadedVersionId;
                            const isSelected = selectedVersionIds.has(v.id);

                            return (
                                <div
                                    key={v.id}
                                    onClick={(e) => {
                                        // If Ctrl/Cmd key is pressed OR in selection mode (at least one selected), toggle selection
                                        // User request: "selection boxes always visible".
                                        // Let's allow clicking the checkbox specifically to toggle, or main body to load?
                                        // Or main body toggles if select mode is active? 
                                        // Standard behavior: Click loads, Checkbox toggles.
                                        handleLoadVersion(v);
                                    }}
                                    className={`group p-3 rounded-lg border cursor-pointer transition-all hover:bg-gray-800 relative select-none
                                        ${isActive ? 'bg-gray-800 border-synthux-blue/50 ring-1 ring-synthux-blue/20' : ''}
                                        ${isSelected ? 'bg-synthux-yellow/10 border-synthux-yellow/50' : (isActive ? '' : 'bg-transparent border-gray-800 opacity-60 hover:opacity-100')}
                                    `}
                                >
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-center gap-2 mb-1">
                                            {/* Checkbox Visual - Always Visible */}
                                            <div
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const newSet = new Set(selectedVersionIds);
                                                    if (newSet.has(v.id)) newSet.delete(v.id);
                                                    else newSet.add(v.id);
                                                    setSelectedVersionIds(newSet);
                                                }}
                                                className={`w-3 h-3 rounded-sm border flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'bg-synthux-yellow border-synthux-yellow' : 'border-gray-600 hover:border-gray-400'}`}
                                            >
                                                {isSelected && <Check size={8} className="text-black stroke-[4]" />}
                                            </div>
                                            <div className="text-xs text-gray-500">{new Date(v.timestamp).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}</div>
                                        </div>

                                        {/* Row Actions */}
                                        <div className="flex gap-1">
                                            {/* Standard Actions (Preview/Download) - Hide on Hover if we want cleanup, or keep? Keeping for now but maybe rearrange? */}
                                            {/* User requested: "add the option to also choose move to pool" */}
                                            {/* "add move to pool button (x) and delete (trashcan)" matches browser style. */}

                                            {/* We can group "File Actions" vs "Playback Actions" */}

                                            {/* Preview/Download (Existing) */}
                                            <button
                                                onClick={(e) => togglePreview(v, e)}
                                                className="p-1.5 rounded-full bg-gray-700 hover:bg-synthux-blue text-white transition-colors"
                                                title={previewingVersionId === v.id ? "Stop Preview" : "Preview Audio"}
                                            >
                                                {previewingVersionId === v.id ? <Pause size={10} fill="white" /> : <Play size={10} fill="white" />}
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    import('../utils/exportUtils').then(u => u.exportSingleFile({ ...slot, versions: [v], currentVersionId: v.id, name: `${slot.name} (v${new Date(v.timestamp).getTime()})` }));
                                                }}
                                                className="p-1.5 rounded-full bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-white transition-colors"
                                                title="Download Version WAV"
                                            >
                                                <Download size={10} />
                                            </button>

                                            {/* Move (X) */}
                                            {onMoveVersionToPool && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onMoveVersionToPool(v.id);
                                                    }}
                                                    className="p-1.5 rounded-full bg-gray-700 hover:bg-synthux-yellow/20 text-gray-400 hover:text-synthux-yellow transition-colors"
                                                    title="Move to Pool"
                                                >
                                                    <X size={10} />
                                                </button>
                                            )}

                                            {/* Delete (Trash) */}
                                            {onDeleteVersion && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onDeleteVersion(v.id);
                                                    }}
                                                    className="p-1.5 rounded-full bg-gray-700 hover:bg-red-500 text-gray-400 hover:text-white transition-colors"
                                                    title="Delete Version"
                                                >
                                                    <Trash2 size={10} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <div className={`text-sm font-medium truncate ${isActive ? 'text-synthux-blue' : 'text-white'}`}>
                                        {v.description || 'Edited Version'}
                                        {v.processing && v.processing.length > 0 && (
                                            <div className="flex gap-1 mt-1 flex-wrap">
                                                {v.processing.map(tag => (
                                                    <span key={tag} className="px-1.5 py-0.5 bg-gray-700/50 rounded text-[10px] uppercase font-bold text-gray-300 border border-gray-600">
                                                        {tag}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div className="text-[10px] text-gray-600 mt-1 flex justify-between items-center">
                                        <span>{(v.duration || 0).toFixed(2)}s • {(v.blob.size / 1024).toFixed(0)}KB</span>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* MAIN EDITOR AREA */}
                <div className="flex-1 flex flex-col relative bg-[#1a1a1a] min-w-0">

                    <div className="flex justify-between items-center p-6 pb-2">
                        <div className="flex items-center gap-4">
                            {/* Tape Icon: Fixed size */}
                            <div className="flex items-center justify-center">
                                <TapeIcon color={tapeColor ? `var(--color-synthux-${tapeColor.toLowerCase()})` : 'gold'} size={40} />
                            </div>
                            <div>
                                <div className="flex items-center gap-3">
                                    <h2 className="text-2xl font-black bg-gradient-to-r from-synthux-orange to-synthux-yellow bg-clip-text text-transparent tracking-tighter uppercase">
                                        {slot.name}
                                    </h2>
                                </div>
                                <div className="text-xs font-bold text-gray-500 tracking-widest uppercase flex items-center gap-2">
                                    <span>Waveform Editor</span>
                                    <span className="w-1 h-1 bg-gray-600 rounded-full"></span>
                                    <span className={isDirty ? "text-amber-500" : "text-gray-600"}>
                                        {isDirty ? "Unsaved Changes" : "All Saved"}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-full transition-colors">✕</button>
                    </div>

                    <div className="p-6 pt-2 flex flex-col h-full overflow-hidden">
                        {/* Toolbar */}
                        <div className="flex gap-6 mb-4 bg-[#111] p-4 rounded-xl border border-gray-800 flex-col text-left shrink-0 max-w-full">
                            <div className="flex items-center gap-6 w-full overflow-x-auto pb-2">

                                {/* Zoom Controls Moved to Bottom */}

                                {/* Fade Controls */}
                                <div className="flex items-center gap-4 border-r border-gray-700 pr-6 shrink-0">
                                    <div className="flex flex-col gap-1">
                                        <label className="text-[10px] uppercase font-bold text-gray-500">Fade In</label>
                                        <input
                                            type="range"
                                            min="0"
                                            max="5"
                                            step="0.1"
                                            value={fadeIn}
                                            onChange={(e) => {
                                                setFadeIn(Number(e.target.value));
                                                handleDirtyChange();
                                            }}
                                            onMouseEnter={() => setHelpText("Adjust Fade In Duration")}
                                            onMouseLeave={() => setHelpText("")}
                                            className="w-24 h-2 bg-gradient-to-r from-green-900 to-synthux-green rounded-lg appearance-none cursor-pointer"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <label className="text-[10px] uppercase font-bold text-gray-500">Fade Out</label>
                                        <input
                                            type="range"
                                            min="0"
                                            max="5"
                                            step="0.1"
                                            value={fadeOut}
                                            onChange={(e) => {
                                                setFadeOut(Number(e.target.value));
                                                handleDirtyChange();
                                            }}
                                            onMouseEnter={() => setHelpText("Adjust Fade Out Duration")}
                                            onMouseLeave={() => setHelpText("")}
                                            className="w-24 h-2 bg-gradient-to-r from-synthux-orange to-red-900 rounded-lg appearance-none cursor-pointer"
                                        />
                                    </div>
                                </div>

                                <button
                                    onClick={() => setShowLoopPanel(!showLoopPanel)}
                                    onMouseEnter={() => setHelpText("Create Seamless Loop (Crossfade end/start)")}
                                    onMouseLeave={() => setHelpText("")}
                                    disabled={isProcessing}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-colors border ${showLoopPanel ? 'bg-synthux-blue text-white border-transparent' : 'bg-gray-800 hover:bg-gray-700 border-gray-700'}`}
                                >
                                    <RotateCcw size={14} /> Make Loop
                                </button>
                                {(() => {
                                    const duration = regionState.end - regionState.start;
                                    const isFullSelection = Math.abs(duration - editorDuration) < 0.05;
                                    const isDisabled = isProcessing || isFullSelection || hasTrimmed;

                                    return (
                                        <button
                                            onClick={() => {
                                                handleSave();
                                            }}
                                            onMouseEnter={() => setHelpText(
                                                hasTrimmed ? "Already Applied" :
                                                    isFullSelection ? "Full Selection (Nothing to Trim)" :
                                                        "Apply Trim & Fades (Keep Open)"
                                            )}
                                            onMouseLeave={() => setHelpText("")}
                                            disabled={isDisabled}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-colors border ${isDisabled
                                                ? 'bg-gray-900 border-gray-800 text-gray-600 cursor-not-allowed opacity-50'
                                                : 'bg-gray-800 hover:bg-gray-700 border-gray-700 text-green-400 hover:text-green-300 hover:border-green-800'
                                                }`}
                                        >
                                            <Check size={14} /> Apply Trim
                                        </button>
                                    )
                                })()}
                                <button
                                    onClick={async () => {
                                        if (!originalBuffer) return;
                                        setIsProcessing(true);
                                        try {
                                            // Normalize to -1dB
                                            const normalized = await audioProcessor.normalize(originalBuffer, -1);
                                            const newBlob = encodeWAV(normalized);
                                            // Normalization is a specific action
                                            onSave(newBlob, normalized.duration, `Normalized`, true, ['normalized']);
                                            setHasNormalized(true);
                                            showToast("Normalized Saved!", "success");
                                            // onClose(); // Removed to keep editor open
                                        } catch (e) {
                                            console.error(e);
                                            showToast("Normalization Failed", "error");
                                        } finally {
                                            setIsProcessing(false);
                                        }
                                    }}
                                    onMouseEnter={() => setHelpText(hasNormalized ? "Already Applied" : "Normalize Audio to -1dB")}
                                    onMouseLeave={() => setHelpText("")}
                                    title={hasNormalized ? "Already Applied" : ""}
                                    disabled={isProcessing || hasNormalized}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-colors border ${hasNormalized ? 'bg-gray-900 border-gray-800 text-gray-600 cursor-not-allowed opacity-50' : 'bg-gray-800 hover:bg-gray-700 border-gray-700 text-yellow-400 hover:text-yellow-300 hover:border-yellow-800'
                                        }`}
                                >
                                    <BarChart2 size={14} /> Normalize
                                </button>
                                {/* Reset Button */}
                                <button
                                    onClick={() => setShowResetConfirm(true)}
                                    onMouseEnter={() => setHelpText("Discard Changes & Reset")}
                                    onMouseLeave={() => setHelpText("")}
                                    disabled={!isDirty}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-colors border ${!isDirty ? 'bg-gray-900 border-gray-800 text-gray-700 cursor-not-allowed hidden' : 'bg-red-900/20 hover:bg-red-900/40 border-red-900/30 text-red-400 hover:text-red-300'
                                        }`}
                                >
                                    <RotateCcw size={14} /> Reset
                                </button>
                            </div>
                        </div>

                        {/* Loop Settings Panel (Inline width full to expand toolbar) */}
                        {showLoopPanel && (
                            <div className="mt-4 border-t border-gray-800 pt-4 flex gap-4 items-center animate-[slideIn_0.2s_ease-out]">
                                <div className="flex flex-col gap-1 grow max-w-xs">
                                    {(() => {
                                        const duration = regionState.end - regionState.start;
                                        // Max is 10s OR 50% of the duration, whichever is smaller
                                        const maxCrossfade = Math.min(10, duration / 2);
                                        // Clamp current value if invalid
                                        const safeValue = Math.min(loopCrossfade, maxCrossfade);

                                        return (
                                            <>
                                                <div className="flex justify-between items-center text-xs font-bold text-gray-400 uppercase">
                                                    <span>Loop Crossfade Duration</span>
                                                    <span className="text-synthux-blue">{safeValue.toFixed(2)}s <span className="text-gray-600">/ {maxCrossfade.toFixed(2)}s</span></span>
                                                </div>
                                                <input
                                                    type="range"
                                                    min="0.01"
                                                    max={maxCrossfade}
                                                    step="0.01"
                                                    value={safeValue}
                                                    onChange={(e) => setLoopCrossfade(Number(e.target.value))}
                                                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                                                />
                                            </>
                                        )
                                    })()}
                                </div>
                                <button
                                    onClick={async () => {
                                        if (!originalBuffer) return;
                                        setIsProcessing(true);
                                        try {
                                            // TRIM FIRST to Selection
                                            let start = 0;
                                            let end = originalBuffer.duration;
                                            if (regions.current) {
                                                const list = regions.current.getRegions();
                                                if (list.length > 0) {
                                                    start = list[0].start;
                                                    end = list[0].end;
                                                }
                                            }
                                            const trimmed = await audioProcessor.trim(originalBuffer, start, end);

                                            // Then Loop
                                            const looped = await audioProcessor.applyCrossfadeLoop(trimmed, loopCrossfade);
                                            const newBlob = encodeWAV(looped);

                                            // Loop is ALWAYS a new version
                                            onSave(newBlob, looped.duration, `Loop (${loopCrossfade.toFixed(2)}s)`, true, ['looped', 'trimmed']);
                                            showToast("Loop Created!", "success");
                                            setShowLoopPanel(false);
                                            // onClose(); // KEEP OPEN to show new looped version
                                            // Ideally we reload the editor with the new version.
                                            // But for now, closing takes them to grid where they see it.
                                            // The user request "Created file should be new active file in editor" requires staying open or re-opening.
                                            // Let's close for now as it's safer, or we need to implement "Reload Editor" logic which is complex here.
                                            // Re-reading: "created file should be the new active file in the editor"
                                            // This means we shouldn't call onClose(), but instead switch to the new version.
                                            // But onSave updates App state. We need App to tell us to switch?
                                            // For this iteration, let's Stick to closing. Switching in-place is a bigger refactor.

                                        } catch (e) {
                                            console.error(e);
                                            showToast("Failed to make loopable", "error");
                                        } finally {
                                            setIsProcessing(false);
                                        }
                                    }}
                                    className="px-6 py-2 bg-synthux-blue hover:bg-blue-500 rounded text-sm font-bold text-white transition-colors h-full self-end"
                                >
                                    Create Loop
                                </button>
                            </div>
                        )}


                        {/* Hover Help Text */}
                        <div className="absolute top-[88px] left-6 text-[10px] text-synthux-blue font-mono tracking-widest uppercase pointer-events-none transition-opacity duration-200">
                            {helpText || "Ready"}
                        </div>

                        {/* Editor Container - SCROLLABLE WINDOW */}
                        {/* Parent: Flex-1 to take available space. Centered content. */}
                        <div className="flex-1 bg-black/40 border-y border-gray-800 relative flex flex-col justify-center overflow-hidden min-h-[300px] min-w-0 max-w-full">

                            {/* Scroll Area Wrapper - This handles the overflow-x */}
                            <div
                                ref={scrollContainerRef}
                                className="w-full h-full overflow-x-auto overflow-y-hidden px-4 editor-scroll"
                                style={{ userSelect: 'none' }}
                                onWheel={handleWheel}
                            >

                                {/* Fixed Height Content Strip */}
                                <div className="relative my-auto top-1/2 -translate-y-1/2" style={{ width: contentWidth, height: 256, minWidth: '100%' }}>

                                    {/* WaveSurfer Container */}
                                    <div
                                        ref={containerRef}
                                        className="absolute inset-0 z-0 bg-black/20 cursor-text"
                                        onPointerDown={handleWaveformPointerDown}
                                        onPointerMove={handleWaveformPointerMove}
                                        onPointerUp={handleWaveformPointerUp}
                                        onPointerLeave={handleWaveformPointerUp}
                                    />

                                    {/* Fade Overlay */}
                                    {editorDuration > 0 && (
                                        <div className="absolute inset-0 z-10 pointer-events-none" style={{ width: contentWidth, height: 256 }}>
                                            <FadeOverlay
                                                width={contentWidth}
                                                height={256}
                                                fadeIn={fadeIn}
                                                fadeOut={fadeOut}
                                                duration={editorDuration}
                                                region={regionState}
                                                onFadeChange={(type, duration) => {
                                                    const rounded = Math.round(duration * 100) / 100;
                                                    if (type === 'in') setFadeIn(rounded);
                                                    else setFadeOut(rounded);
                                                    handleDirtyChange();
                                                }}
                                                onRegionChange={(start, end) => {
                                                    const regionList = regions.current?.getRegions();
                                                    if (regionList && regionList.length > 0) {
                                                        regionList[0].setOptions({ start, end });
                                                    }
                                                    setRegionState({ start, end });
                                                }}
                                            />
                                        </div>
                                    )}

                                    {/* Center Line Visual */}
                                    <div className="absolute inset-0 pointer-events-none border-t border-b border-dashed border-gray-700/30 top-1/2 -translate-y-1/2 h-0 z-0"></div>
                                </div>
                            </div>
                        </div>

                        {/* VIEW TOOLBAR (Zoom & 42s) - Fixed Bottom of Editor Area */}
                        <div className="flex items-center justify-between px-6 py-2 bg-[#111] border-t border-gray-800 shrink-0 gap-4">

                            {/* 42s Status (Left) */}
                            <div className="flex-1 flex justify-start">
                                {(() => {
                                    const duration = regionState.end - regionState.start;
                                    const isOverLimit = duration > 42.01;
                                    return (
                                        <div className="flex items-center gap-4">
                                            <div className={`text-xs font-bold uppercase tracking-widest flex items-center gap-2 ${isOverLimit ? 'text-red-500' : 'text-gray-500'}`}>
                                                {isOverLimit && <span>⚠️</span>}
                                                <span>Trim: {duration.toFixed(2)}s</span>
                                                {isOverLimit && <span className="text-[10px] normal-case opacity-80">(Max 42s)</span>}
                                            </div>
                                            <button
                                                onClick={() => {
                                                    if (regions.current) {
                                                        const list = regions.current.getRegions();
                                                        if (list.length > 0) {
                                                            const r = list[0];
                                                            const center = r.start + (duration / 2);
                                                            const newStart = Math.max(0, center - 21);
                                                            const newEnd = Math.min(editorDuration, center + 21);
                                                            r.setOptions({ start: newStart, end: newEnd });
                                                            setRegionState({ start: newStart, end: newEnd });
                                                            handleDirtyChange();
                                                        }
                                                    }
                                                }}
                                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-all border ${isOverLimit
                                                    ? 'bg-red-900/30 hover:bg-red-900/50 border-red-500/50 text-red-200'
                                                    : 'bg-gray-800 hover:bg-gray-700 border-gray-600 text-gray-400 hover:text-white'
                                                    }`}
                                            >
                                                Set 42s
                                            </button>
                                        </div>
                                    )
                                })()}
                            </div>

                            {/* Zoom Controls (Right) */}
                            <div className="flex items-center gap-2">
                                <div className="mr-2 text-gray-500 flex items-center gap-1 opacity-50">
                                    <Eye size={14} />
                                </div>
                                <button onClick={handleFitView} className="px-2 py-1 hover:bg-gray-800 rounded text-[10px] font-bold uppercase text-gray-400 hover:text-white flex items-center gap-1 border border-transparent hover:border-gray-700 transition-all" title="Fit All">
                                    <ArrowLeftRight size={14} /> Fit View
                                </button>
                                <button onClick={handleFitTrim} className="px-2 py-1 hover:bg-gray-800 rounded text-[10px] font-bold uppercase text-gray-400 hover:text-white flex items-center gap-1 border border-transparent hover:border-gray-700 transition-all" title="Fit Trim">
                                    <Scissors size={14} /> Fit Trim
                                </button>
                                <div className="w-px h-4 bg-gray-700 mx-2"></div>
                                <button onClick={handleZoomOut} disabled={zoom <= (minZoom * 1.001)} className={`p-1 hover:bg-gray-800 rounded text-gray-400 hover:text-white ${zoom <= (minZoom * 1.001) ? 'opacity-30' : ''}`}><ZoomOut size={16} /></button>
                                <input type="range" min={minZoom || 0.1} max="1000" step="0.1" value={zoom} onChange={(e) => setZoomCentered(Number(e.target.value))} className="w-24 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer" />
                                <button onClick={handleZoomIn} className="p-1 hover:bg-gray-800 rounded text-gray-400 hover:text-white"><ZoomIn size={16} /></button>
                            </div>
                        </div>

                        {/* Playback Controls - FIXED at bottom (outside scroll) */}
                        <div className="flex justify-center gap-4 shrink-0 pb-4 pt-2 border-t border-gray-800 bg-[#1a1a1a] z-50">
                            <button
                                onClick={() => {
                                    const newLooping = !isLooping;
                                    setIsLooping(newLooping);

                                    // ENABLE NATIVE LOOPING on the region as backup/primary
                                    if (regions.current) {
                                        const list = regions.current.getRegions();
                                        if (list.length > 0) {
                                            list[0].setOptions({ loop: newLooping });
                                        }
                                    }
                                }}
                                className={`flex items-center justify-center w-12 h-12 rounded-full border border-gray-700 transition-all ${isLooping ? 'bg-synthux-blue text-white border-transparent' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                                title={isLooping ? "Looping Active" : "Enable Looping"}
                            >
                                <Repeat size={20} />
                            </button>

                            <button
                                onClick={handlePlayPause}
                                className="flex items-center gap-2 px-8 py-3 bg-gray-800 hover:bg-gray-700 rounded-full text-lg font-bold transition-all hover:scale-105 active:scale-95 shadow-lg shadow-black/50"
                            >
                                {isPlaying ? <Pause fill="white" /> : <Play fill="white" />}
                                {isPlaying ? 'PAUSE' : 'PLAY'}
                            </button>
                            <div title={!isDirty && loadedVersionId === activeVersionId ? "File has not changed" : ""}>
                                <button
                                    onClick={() => {
                                        if (!isDirty && loadedVersionId !== activeVersionId && onAssignVersion) {
                                            onAssignVersion(loadedVersionId);
                                            // onClose(); // User wants to just assign? Or keep editing?
                                            // "making this just the assigned file for the slot"
                                            // Let's assume we maintain local state but trigger assignment
                                        } else {
                                            handleSave();
                                        }
                                    }}
                                    disabled={isProcessing || (!isDirty && loadedVersionId === activeVersionId)}
                                    className={`flex items-center gap-2 px-8 py-3 rounded-full text-lg font-bold transition-all shadow-lg ${isProcessing || (!isDirty && loadedVersionId === activeVersionId)
                                        ? 'bg-gray-800 text-gray-500 cursor-not-allowed shadow-none'
                                        : 'bg-synthux-blue hover:bg-blue-500 text-white hover:scale-105 active:scale-95 shadow-synthux-blue/20'
                                        }`}
                                >
                                    <Save size={20} /> {isProcessing ? 'SAVING...' : 'ASSIGN TO TAPE'}
                                </button>

                            </div>

                            {/* Save Unique Button (For Duplicates) */}
                            {isDuplicate && onSaveUnique && (
                                <button
                                    onClick={async () => {
                                        if (!originalBuffer) return;
                                        setIsProcessing(true);
                                        try {
                                            // 1. Process Audio (Trim & Fade)
                                            let start = 0;
                                            let end = originalBuffer.duration;
                                            if (regions.current) {
                                                const regionList = regions.current.getRegions();
                                                if (regionList && regionList.length > 0) {
                                                    start = regionList[0].start;
                                                    end = regionList[0].end;
                                                }
                                            }

                                            // Determine processing tags
                                            const processingTags: ('normalized' | 'trimmed' | 'looped')[] = [];
                                            if (start > 0.01 || end < originalBuffer.duration - 0.01) processingTags.push('trimmed');
                                            // We don't have normalize state explicit here unless we ran it, but let's stick to trim/loop
                                            if (isLooping) processingTags.push('looped');

                                            let processed = await audioProcessor.trim(originalBuffer, start, end);
                                            if (fadeIn > 0 || fadeOut > 0) {
                                                processed = await audioProcessor.applyFades(processed, fadeIn, fadeOut);
                                            }

                                            // 2. Encode
                                            const newBlob = encodeWAV(processed);

                                            // 3. Callback
                                            onSaveUnique(newBlob, processed.duration, processingTags);
                                            showToast("Saved as Unique File!", "success");
                                        } catch (e) {
                                            console.error(e);
                                            showToast("Failed to save unique file", "error");
                                        } finally {
                                            setIsProcessing(false);
                                        }
                                    }}
                                    disabled={isProcessing}
                                    className="flex items-center gap-2 px-6 py-3 bg-orange-600 hover:bg-orange-500 rounded-full text-sm font-bold transition-all hover:scale-105 active:scale-95 shadow-lg border border-orange-500 text-white"
                                    title="Save as a new unique file and assign to this slot, leaving other duplicates unchanged."
                                >
                                    <Copy size={16} /> SAVE UNIQUE
                                </button>
                            )}

                            <button
                                onClick={async () => {
                                    if (!originalBuffer) return;
                                    setIsProcessing(true);
                                    try {
                                        let start = 0;
                                        let end = originalBuffer.duration;
                                        if (regions.current) {
                                            const regionList = regions.current.getRegions();
                                            if (regionList && regionList.length > 0) {
                                                start = regionList[0].start;
                                                end = regionList[0].end;
                                            }
                                        }
                                        let processed = await audioProcessor.trim(originalBuffer, start, end);
                                        if (fadeIn > 0 || fadeOut > 0) {
                                            processed = await audioProcessor.applyFades(processed, fadeIn, fadeOut);
                                        }
                                        const newBlob = encodeWAV(processed);
                                        onSaveAsCopy(newBlob, processed.duration);
                                        showToast("Saved copy to Unused Pool!", "success");
                                    } catch (e) {
                                        console.error(e);
                                        showToast("Failed to save copy", "error");
                                    }
                                    finally { setIsProcessing(false); }
                                }}
                                disabled={isProcessing}
                                className="flex items-center gap-2 px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-full text-sm font-bold transition-all hover:scale-105 active:scale-95 shadow-lg border border-gray-600 text-gray-300"
                                title="Save as a new Parked file (Unassigned)"
                            >
                                <Save size={16} /> SAVE COPY TO POOL
                            </button>
                        </div>

                    </div>
                </div>
            </div>
        </div >


    );
};
