import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import { Play, Pause, RotateCcw, Check, ZoomIn, ZoomOut, ArrowLeftRight, Scissors, Save, Repeat, BarChart2, Eye, EyeOff, Lock, Unlock, Magnet, Download, Copy, Trash2, X, Activity, PlusCircle, Sliders, RefreshCw, Maximize2, Minimize2, Music, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Keyboard } from 'lucide-react';
import { Rnd } from 'react-rnd';
import { audioProcessor } from '../lib/audio/audioProcessor';
import { encodeWAV } from '../lib/audio/wavEncoder';
import { v4 as uuidv4 } from 'uuid';
import { useAudioPlayer } from '../contexts/AudioPlayerContext';
import { TapeIcon } from './TapeIcon';
import { ConfirmModal } from './ConfirmModal';
import { AutomationOverlay } from './AutomationOverlay';
import type { AutomationPoint } from './AutomationOverlay';
import { PlayheadRuler } from './PlayheadRuler';
import CutterOverlay from './CutterOverlay';
import type { CutRegion } from './CutterOverlay';
import SlicerOverlay from './SlicerOverlay';
import PitchOverlay from './PitchOverlay';
import type { PitchRegion } from './PitchOverlay';
import { DbScale } from './DbScale';
import { readWavMetadata } from '../utils/importUtils';
import { LimiterOverlay } from './LimiterOverlay';
import { KeyboardSlicerModal } from './KeyboardSlicerModal';

// Fade Overlay Component
interface FadeOverlayProps {
    width: number;
    height: number;
    fadeIn: number;
    fadeOut: number;
    duration: number;
    region: { start: number, end: number };
    onFadeChange?: (type: 'in' | 'out', duration: number) => void;
    active?: boolean;
    onRegionChange?: (start: number, end: number) => void;
}

const FadeOverlay = ({ width, height, fadeIn, fadeOut, duration, region, active = true, onFadeChange, onRegionChange }: FadeOverlayProps) => {
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
        if (!active) return;
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

// Custom BPM Input Component
const BpmInput = ({ value, onChange }: { value: number | null, onChange: (val: number | null) => void }) => {
    const [isDragging, setIsDragging] = useState(false);
    const startY = useRef(0);
    const startVal = useRef(0);

    const handleMouseDown = (e: React.MouseEvent) => {
        // Only start dragging if not strictly clicking the input to type (optional refinement)
        // For now, allow drag from anywhere in the component
        if (e.button !== 0) return;
        setIsDragging(true);
        startY.current = e.clientY;
        startVal.current = value ?? 120;
    };

    useEffect(() => {
        if (!isDragging) return;
        const handleMouseMove = (e: MouseEvent) => {
            const deltaY = startY.current - e.clientY;
            const newVal = Math.max(1, startVal.current + Math.floor(deltaY / 2)); // Dynamic sensing
            onChange(newVal);
        };
        const handleMouseUp = () => setIsDragging(false);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, onChange]);

    return (
        <div
            className={`flex items-center gap-1.5 bg-black/40 border border-gray-800 px-2 py-1 rounded transition-all select-none
                ${isDragging ? 'border-synthux-turquoise/60 ring-1 ring-synthux-turquoise/20' : 'hover:border-gray-700'}
            `}
            onMouseDown={handleMouseDown}
            style={{ cursor: isDragging ? 'ns-resize' : 'default' }}
        >
            <div className="flex flex-col gap-0.5">
                <div className="text-[9px] uppercase font-black text-gray-500 leading-none">BPM</div>
                <input
                    type="text"
                    value={value ?? ''}
                    placeholder="---"
                    className="bg-transparent text-synthux-turquoise text-xs font-black w-10 text-center focus:outline-none pointer-events-auto"
                    onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9.]/g, '');
                        onChange(val === '' ? null : parseFloat(val));
                    }}
                    onFocus={(e) => {
                        if (value === null) onChange(120);
                        setTimeout(() => e.target.select(), 10);
                    }}
                    onKeyDown={(e) => {
                        if (['ArrowUp', 'ArrowRight'].includes(e.key)) {
                            e.preventDefault();
                            onChange((value ?? 120) + 1);
                        } else if (['ArrowDown', 'ArrowLeft'].includes(e.key)) {
                            e.preventDefault();
                            onChange(Math.max(1, (value ?? 120) - 1));
                        }
                    }}
                />
            </div>
            <div className="flex flex-col -gap-0.5 opacity-30 hover:opacity-100 transition-opacity">
                <button onMouseDown={(e) => e.stopPropagation()} onClick={() => onChange((value ?? 120) + 1)} className="hover:text-synthux-turquoise"><ChevronUp size={12} /></button>
                <button onMouseDown={(e) => e.stopPropagation()} onClick={() => onChange(Math.max(1, (value ?? 120) - 1))} className="hover:text-synthux-turquoise"><ChevronDown size={12} /></button>
            </div>
        </div>
    );
};

import type { AudioVersion, TapeColor, WavMetadata } from '../types';

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
    onSave: (blob: Blob, duration: number, description: string, isDirty: boolean, processing?: ('normalized' | 'trimmed' | 'looped' | 'eq' | 'limited' | 'cut' | 'sliced')[]) => void;
    onSaveAsCopy: (blob: Blob, duration: number, createdId: string) => void;
    onDeleteVersion?: (versionId: string) => void;
    onAssignVersion?: (versionId: string) => void;
    onCleanupProject?: (options?: { removeUnusedFiles: boolean }) => void;
    onMoveVersionToPool?: (versionId: string) => void;
    tapeColor?: TapeColor;
    isDuplicate?: boolean;
    onSaveUnique?: (blob: Blob, duration: number, processing: ('normalized' | 'trimmed' | 'looped')[], createdId: string) => void;
    metadata?: WavMetadata;
    onRenameFile?: (fileId: string, newName: string) => void;
    onDirtyStateChange?: (isDirty: boolean) => void;
    showToast: (message: string, type?: 'success' | 'error' | 'warning') => void;
}

export const WaveformEditor = ({ slot, versions, activeVersionId, tapeColor, onClose, onSave, onSaveAsCopy, onDeleteVersion, onAssignVersion, onCleanupProject, onMoveVersionToPool, isDuplicate, onSaveUnique, metadata, onRenameFile, onDirtyStateChange, showToast }: WaveformEditorProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const wavesurfer = useRef<WaveSurfer | null>(null);
    const regions = useRef<any>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [zoom, setZoom] = useState(10);
    const [vZoom, setVZoom] = useState(1); // Vertical Zoom (Visual Gain)
    const [fadeIn, setFadeIn] = useState(0);
    const [fadeOut, setFadeOut] = useState(0);
    const [isLooping, setIsLooping] = useState(false);
    const [loopCrossfade, setLoopCrossfade] = useState(0.2); // Default 0.2s

    const [isProcessing, setIsProcessing] = useState(false);
    const [helpText, setHelpText] = useState("");
    const [showDbScale, setShowDbScale] = useState(true);
    const [viewportWidth, setViewportWidth] = useState(0);

    // Dirty State & Version Management
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
    const [currentTime, setCurrentTime] = useState(0); // Added for Ruler
    const [minZoom, setMinZoom] = useState(0.1); // Default low value until loaded
    const [regionState, setRegionState] = useState<{ start: number, end: number }>({ start: 0, end: 0 });
    const rafRef = useRef<number | null>(null);

    // Normalization & Processing State
    const [hasNormalized, setHasNormalized] = useState(false);
    const [normalizationLevel, setNormalizationLevel] = useState<number>(-1);
    const [hasTrimmed, setHasTrimmed] = useState(false);

    // Automation State (New)
    const [automationPoints, setAutomationPoints] = useState<AutomationPoint[]>([]);
    const [smooth, setSmooth] = useState(false);

    // EQ State
    const [eqLow, setEqLow] = useState(0);
    const [eqMid, setEqMid] = useState(0);
    const [eqHigh, setEqHigh] = useState(0);
    const [isAdvancedEQ, setIsAdvancedEQ] = useState(false);
    const [advancedEQBands, setAdvancedEQBands] = useState<number[]>(new Array(10).fill(0));
    const [showAdvancedEQModal, setShowAdvancedEQModal] = useState(false);
    const [advancedEQPos, setAdvancedEQPos] = useState({ x: 20, y: 100 });
    const [draggingSliderIdx, setDraggingSliderIdx] = useState<number | null>(null);
    const [eqNormalize, setEqNormalize] = useState(false);
    const [automationNormalize, setAutomationNormalize] = useState(false);
    const ADVANCED_EQ_FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
    const [isPreviewingEQ, setIsPreviewingEQ] = useState(false);

    const [limiterCeiling, setLimiterCeiling] = useState(-0.3);
    const [limiterThreshold, setLimiterThreshold] = useState(-6);
    const [limiterMode, setLimiterMode] = useState<'compressor' | 'peak'>('compressor');
    const [isPreviewingLimiter, setIsPreviewingLimiter] = useState(false);

    // Cutter State
    const [cutRegions, setCutRegions] = useState<CutRegion[]>([]);
    const [cutCrossfade, setCutCrossfade] = useState(0.01);
    const [isPreviewingCut, setIsPreviewingCut] = useState(false);

    // Pitch State
    const [pitchSemitones, setPitchSemitones] = useState(0);
    const [detectedPitch, setDetectedPitch] = useState<number | null>(null);
    const [pitchRegions, setPitchRegions] = useState<PitchRegion[]>([]);
    const [previewPitchRegions, setPreviewPitchRegions] = useState<PitchRegion[]>([]);
    const [previewDuration, setPreviewDuration] = useState<number | null>(null);
    const lastSelectedPitchId = useRef<string | null>(null);
    const prevPitchRegionsRef = useRef<PitchRegion[]>([]);
    const [slicePoints, setSlicePoints] = useState<number[]>([]);
    const [initialSlicePoints, setInitialSlicePoints] = useState<number[]>([]);
    const [tempo, setTempo] = useState<number | null>(null);
    const [initialTempo, setInitialTempo] = useState<number | null>(null);
    const [activeSliceIdx, setActiveSliceIdx] = useState<number>(0);
    const [isSlicerLocked, setIsSlicerLocked] = useState(false);
    const [showGlobalSlices, setShowGlobalSlices] = useState(false);
    const [snapToSlices, setSnapToSlices] = useState(false);
    const [customSliceCount, setCustomSliceCount] = useState<number>(32);
    const [keyboardLayout, setKeyboardLayout] = useState<'QWERTY' | 'AZERTY'>('QWERTY');
    const [showKeyboardMapModal, setShowKeyboardMapModal] = useState(false);
    const [hoveredMarkerIdx, setHoveredMarkerIdx] = useState<number | null>(null);
    const [triggeredSliceIdx, setTriggeredSliceIdx] = useState<number | null>(null);
    const [keyboardSlicerPos, setKeyboardSlicerPos] = useState({ x: 100, y: 100 });
    const triggeredSliceTimeout = useRef<NodeJS.Timeout | null>(null);

    // Active Tool (for toolbar UI — only one expanded at a time)
    type ToolId = 'trim' | 'automation' | 'loop' | 'eq' | 'limiter' | 'normalize' | 'cutter' | 'slicer' | 'pitch' | 'stereo' | null;
    const [activeTool, setActiveTool] = useState<ToolId>(null);
    const [pendingTool, setPendingTool] = useState<ToolId | undefined>(undefined);
    const [isHistoryExpanded, setIsHistoryExpanded] = useState(true);
    const [stereoSplitView, setStereoSplitView] = useState(false);
    const [internalMetadata, setInternalMetadata] = useState<WavMetadata | null>(metadata || null);

    // Individual Tool Dirty States
    // NOTE: Normalize and Loop tools use an instant-apply pattern (click Apply → new version created).
    // They do NOT participate in the cross-tool dirty warning — only tools with pending/unapplied
    // state (trim, automation, EQ, limiter, pitch, cutter, slicer) are tracked here.
    const isTrimDirty = fadeIn > 0 || fadeOut > 0 || regionState.start > 0.01 || regionState.end < ((originalBuffer?.duration || 0) - 0.01);
    const isAutomationDirty = automationPoints.length > 0 && (
        automationPoints.length !== 2 
        || automationPoints[0].value !== 1 
        || automationPoints[1].value !== 1
        || automationPoints[0].time !== 0
        || Math.abs(automationPoints[1].time - (originalBuffer?.duration || 0)) > 0.01
    );
    const isEqDirty = eqLow !== 0 || eqMid !== 0 || eqHigh !== 0 || (isAdvancedEQ && advancedEQBands.some(v => v !== 0));
    const isLimiterDirty = limiterThreshold !== -6 || limiterCeiling !== -0.3;
    const isPitchDirty = pitchRegions.some(r => r.semitones !== 0);
    const isCutterDirty = cutRegions.length > 0;
    const isSlicerDirty = slicePoints.length !== (initialSlicePoints?.length || 0) || slicePoints.some((p, i) => Math.abs(p - (initialSlicePoints?.[i] || 0)) > 0.001) || tempo !== initialTempo;

    // Calculated Dirty State
    const isDirty = useMemo(() => {
        if (!originalBuffer) return false;
        return isTrimDirty || isAutomationDirty || isEqDirty || isLimiterDirty || isPitchDirty || isCutterDirty || isSlicerDirty;
    }, [isTrimDirty, isAutomationDirty, isEqDirty, isLimiterDirty, isPitchDirty, isCutterDirty, isSlicerDirty, originalBuffer]);

    // Report Dirty State to Parent — use a ref so that the effect only fires when isDirty changes,
    // regardless of whether the parent provides a new function reference on each render.
    const onDirtyStateChangeRef = useRef(onDirtyStateChange);
    useEffect(() => { onDirtyStateChangeRef.current = onDirtyStateChange; }, [onDirtyStateChange]);
    useEffect(() => {
        onDirtyStateChangeRef.current?.(isDirty);
    }, [isDirty]);


    // Sync individual show states with activeTool
    const toggleTool = (tool: ToolId) => {
        const next = activeTool === tool ? null : tool;

        // Check if the CURRENT tool is dirty
        let currentToolIsDirty = false;
        if (activeTool === 'trim') currentToolIsDirty = isTrimDirty;
        else if (activeTool === 'automation') currentToolIsDirty = isAutomationDirty;
        else if (activeTool === 'eq') currentToolIsDirty = isEqDirty;
        else if (activeTool === 'limiter') currentToolIsDirty = isLimiterDirty;
        else if (activeTool === 'pitch') currentToolIsDirty = isPitchDirty;
        else if (activeTool === 'cutter') currentToolIsDirty = isCutterDirty;
        else if (activeTool === 'slicer') currentToolIsDirty = isSlicerDirty;
        // Normalize and Loop: instant-apply, no pending dirty state to warn about

        if (currentToolIsDirty && activeTool !== null) {
            setPendingTool(next);
            return;
        }
        executeToolSwitch(next);
    };

    const executeToolSwitch = (next: ToolId) => {
        setActiveTool(next);

        // Auto-create automation points when toggling on
        if (next === 'automation' && automationPoints.length === 0) {
            setAutomationPoints([
                { id: 'start', time: 0, value: 1, selected: false },
                { id: 'end', time: editorDuration, value: 1, selected: false }
            ]);
        }

        // Auto-create 15% middle selection for Pitch Tool
        if (next === 'pitch' && pitchRegions.length === 0 && editorDuration > 0) {
            const start = editorDuration * 0.425; // Middle 15% (0.5 - 0.075)
            const end = editorDuration * 0.575;
            setPitchRegions([{
                id: `pitch-init`,
                start,
                end,
                semitones: 0,
                selected: true
            }]);
        }
    };

    const handleDiscardChanges = async () => {
        setFadeIn(0);
        setFadeOut(0);
        if (originalBuffer) {
            setRegionState({ start: 0, end: originalBuffer.duration });
        }
        setAutomationPoints([]);
        setEqLow(0);
        setEqMid(0);
        setEqHigh(0);
        setAdvancedEQBands(new Array(10).fill(0));
        setLimiterThreshold(-6);
        setLimiterCeiling(-0.3);
        setNormalizationLevel(-1); // Reset normalize tool state
        setCutRegions([]);
        if (initialSlicePoints) setSlicePoints([...initialSlicePoints]);
        
        setIsPreviewing(false);
        setIsPreviewingEQ(false);
        setIsPreviewingLimiter(false);
        setIsPreviewingCut(false);
        setIsPreviewingLoop(false);

        if (currentBlob && wavesurfer.current) {
            setIsPlaying(false);
            await wavesurfer.current.loadBlob(currentBlob);
        }

        if (pendingTool !== undefined) {
            executeToolSwitch(pendingTool);
        }
        setPendingTool(undefined);
    };


    // Playhead Seeking State
    // const [seekHover, setSeekHover] = useState<{ x: number, time: number } | null>(null);

    // Legacy Volume Selection (Removed)
    // const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
    // const [volumeGain, setVolumeGain] = useState(0); 

    // UI States

    const [selectedVersionIds, setSelectedVersionIds] = useState<Set<string>>(new Set());
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showMoveConfirm, setShowMoveConfirm] = useState(false);
    const [isPreviewing, setIsPreviewing] = useState(false);
    const [isPreviewingLoop, setIsPreviewingLoop] = useState(false);

    const isMounted = useRef(false);
    const initTimeout = useRef<NodeJS.Timeout | null>(null);
    const playbackStartTimeRef = useRef(0);
    const isPausingRef = useRef(false);
    const pauseTimeRef = useRef(0);
    const pauseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const [isPausing, setIsPausing] = useState(false);

    // Mark dirty on changes (deprecated logic, isDirty is now dynamic)
    const handleDirtyChange = () => {
        // Obsolete
    };

    // Rename state
    const [isRenaming, setIsRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState("");

    const handleRenameSubmit = () => {
        if (renameValue.trim() && renameValue !== slot.name && onRenameFile && slot.fileId) {
            onRenameFile(slot.fileId, renameValue.trim());
        }
        setIsRenaming(false);
    };

    const handleRenameKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleRenameSubmit();
        if (e.key === 'Escape') setIsRenaming(false);
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
        // Automation reset handled above
        // Load processing state from version if available
        const currentVersion = versions.find(v => v.id === loadedVersionId);
        if (currentVersion?.processing) {
            setHasNormalized(currentVersion.processing.includes('normalized'));
            setHasTrimmed(currentVersion.processing.includes('trimmed'));
        } else {
            setHasNormalized(false);
            setHasTrimmed(false);
        }

        // Clear tool states on blob change
        setPitchRegions([]);
        setPreviewPitchRegions([]);
        setIsPreviewing(false);
        setPreviewDuration(null);
        setSlicePoints([]);
        setCutRegions([]);
        setAutomationPoints([]);
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
        }
    }, [activeVersionId]);

    // Robust Trim Region Visibility Sync
    useEffect(() => {
        if (regions.current) {
            const list = regions.current.getRegions();
            const r = list.find((reg: any) => reg.id === 'trim-region');
            if (r) {
                if (activeTool === 'trim') {
                    r.setOptions({
                        color: 'rgba(255, 255, 255, 0.1)',
                        resize: true,
                        drag: true,
                        loop: isLooping // Restore region loop if tool active
                    });
                } else {
                    r.setOptions({
                        color: 'transparent',
                        resize: false,
                        drag: false,
                        loop: false // Disable region loop when switching tools
                    });
                }
            }
        }
    }, [activeTool, editorDuration, isLooping]);

    useEffect(() => {
        if (wavesurfer.current) {
            wavesurfer.current.zoom(zoom);
        }
    }, [zoom]);

    useEffect(() => {
        if (wavesurfer.current) {
            wavesurfer.current.setOptions({ barHeight: vZoom });
        }
    }, [vZoom]);

    useEffect(() => {
        if (wavesurfer.current) {
            const isStereo = (originalBuffer?.numberOfChannels || 0) > 1;
            const inStereoTool = activeTool === 'stereo';

            if (inStereoTool && isStereo) {
                const options = [
                    { waveColor: 'rgba(0, 163, 255, 0.5)', progressColor: '#00A3FF', overlay: !stereoSplitView }, // L - Blue
                    { waveColor: 'rgba(255, 185, 0, 0.5)', progressColor: '#FFB900', overlay: !stereoSplitView }  // R - Yellow
                ];
                wavesurfer.current.setOptions({ splitChannels: options as any });
            } else {
                wavesurfer.current.setOptions({
                    splitChannels: false as any,
                    waveColor: 'rgba(255, 185, 0, 0.5)',
                    progressColor: '#FFDF9B'
                });
            }
        }
    }, [activeTool, stereoSplitView, originalBuffer]);


    // Handle container resize to update minZoom and potentially adjust current zoom
    useEffect(() => {
        if (!scrollContainerRef.current) return;

        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (entry && editorDuration > 0) {
                const newWidth = entry.contentRect.width;
                const newFitZoom = (newWidth - 16) / editorDuration;

                setMinZoom(newFitZoom);
                setViewportWidth(newWidth);

                // If we were at "Fit View" (using old minZoom), sync with the new one
                setZoom(prevZoom => {
                    // Check if current zoom is within 5% of previous minZoom to assume it was "fitted"
                    const wasFitted = Math.abs(prevZoom - minZoom) < (minZoom * 0.05);
                    if (wasFitted || prevZoom < newFitZoom) {
                        return newFitZoom;
                    }
                    return prevZoom;
                });
            }
        });

        observer.observe(scrollContainerRef.current);
        return () => observer.disconnect();
    }, [editorDuration, minZoom]);

    // Refs for state accessible in event listeners
    const isLoopingRef = useRef(false);
    const activeToolRef = useRef<ToolId>(activeTool);
    const wavesurferRef = useRef<WaveSurfer | null>(null);
    const regionsRef = useRef<any>(null); // Keep track of regions plugin

    // Update refs when state changes
    useEffect(() => {
        isLoopingRef.current = isLooping;
    }, [isLooping]);

    useEffect(() => {
        activeToolRef.current = activeTool;
    }, [activeTool]);

    // Sync slices and tempo from metadata when tool opened or version changed
    useEffect(() => {
        if (activeTool === 'slicer' || activeVersionId) {
            const metaSlices = (internalMetadata || metadata)?.slicePoints || [];
            const metaTempo = (internalMetadata || metadata)?.tempo || null;

            setSlicePoints([...metaSlices]);
            setInitialSlicePoints([...metaSlices]);
            setTempo(metaTempo);
            setInitialTempo(metaTempo);
        }
    }, [activeTool, activeVersionId, metadata?.slicePoints, internalMetadata?.slicePoints, metadata?.tempo, internalMetadata?.tempo]);

    const initEditor = async () => {
        if (!containerRef.current || !currentBlob || !isMounted.current) return;

        // Extract metadata from blob if possible
        if (currentBlob instanceof File || currentBlob instanceof Blob) {
            const file = currentBlob instanceof File ? currentBlob : new File([currentBlob], 'temp.wav', { type: 'audio/wav' });
            const meta = await readWavMetadata(file);
            if (meta) {
                setInternalMetadata(meta);
            }
        }

        // Cleanup old
        if (wavesurfer.current) {
            wavesurfer.current.destroy();
            wavesurfer.current = null;
            setIsPlaying(false);
        }

        try {
            const blobUrl = URL.createObjectURL(currentBlob);

            const ws = WaveSurfer.create({
                container: containerRef.current,
                waveColor: 'rgba(255, 185, 0, 0.5)', // More transparent yellow
                progressColor: '#FFDF9B',
                url: blobUrl,
                height: 256,
                minPxPerSec: zoom,
                interact: true,
                dragToSeek: true, // Allow seeking on drag, disable region creation via dragging
                autoScroll: false,
                hideScrollbar: true,
                barHeight: vZoom,
                splitChannels: (activeTool === 'stereo' && (originalBuffer?.numberOfChannels || 0) > 1) ? [
                    { waveColor: 'rgba(0, 163, 255, 0.5)', progressColor: '#00A3FF', overlay: !stereoSplitView },
                    { waveColor: 'rgba(255, 185, 0, 0.5)', progressColor: '#FFB900', overlay: !stereoSplitView }
                ] as any : false,
            });


            wavesurfer.current = ws;
            wavesurferRef.current = ws;

            ws.on('error', (err: any) => {
                if (!isMounted.current) return;
                if (typeof err === 'string' && err.includes('not initialized')) return;
                console.error("WaveSurfer Error:", err);
            });

            ws.on('timeupdate', (time) => {
                if (isMounted.current) setCurrentTime(time);
            });

            // Disable dragSelection to prevent manual region creation
            const wsRegions = ws.registerPlugin(RegionsPlugin.create());
            regions.current = wsRegions;
            regionsRef.current = wsRegions;

            ws.on('ready', () => {
                if (!isMounted.current) return;
                const duration = ws.getDuration();
                setEditorDuration(duration);

                // Auto-Fit Initial Zoom
                if (scrollContainerRef.current) {
                    const width = scrollContainerRef.current.clientWidth;
                    const fitZoom = (width - 16) / duration;
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

                // Clear any existing regions before adding default
                wsRegions.clearRegions();

                // Add Trim Region
                wsRegions.addRegion({
                    id: 'trim-region',
                    start: rStart,
                    end: rEnd,
                    color: 'rgba(255, 255, 255, 0.1)',
                    drag: false,
                    resize: true // Keep resize enabled for the main trim tool
                });
                setRegionState({ start: rStart, end: rEnd });
            });


            // --- ROBUST REGION LOGIC ---
            // Sync State
            wsRegions.on('region-update', (r: any) => {
                if (r.id === 'trim-region') {
                    setRegionState({ start: r.start, end: r.end });
                }
            });

            wsRegions.on('region-updated', (r: any) => {
                if (r.id === 'trim-region') {
                    setRegionState({ start: r.start, end: r.end });
                    if (isMounted.current) handleDirtyChange();
                } else {
                    // Volume Selection Deprecated
                    // Automation handled via overlay
                }
            });

            // Clear selection on background click (handled by interaction handler below or WaveSurfer default?)
            // WaveSurfer default interaction handles seek.
            // We need to listen to 'interaction' to clear volume selection if strictly outside.
            // Implementation: If we start a new region drag, 'region-created' fires.
            ws.on('interaction', () => {
                // If we just clicked (not dragged), we might want to clear selection?
                // Actually, dragging creates a region. Clicking moves playhead.
                // If we click elsewhere, we should probably deselect volume region?
                // Let's rely on manual "Cancel" or creating a new one for now to be safe.
                // But user said: "just clicking in the waveform changes the playhead position."
                // So we should probably clear selection if they click away.
            });

            wsRegions.on('region-created', (r: any) => {
                if (r.id !== 'trim-region') {
                    // Deprecated: Remove immediately if created by mistake
                    r.remove();
                }
            });


            // GAPLESS LOOPING: Trigger immediately when leaving the region
            wsRegions.on('region-out', (r: any) => {
                // Only force loop to region start if TRIM TOOL is active
                if (r.id === 'trim-region' && isLoopingRef.current && isMounted.current && activeToolRef.current === 'trim') {
                    // Force seek to start and play range for gapless loop
                    ws.play(r.start, r.end);
                }
            });



            ws.on('play', () => {
                if (isMounted.current) {
                    playbackStartTimeRef.current = performance.now();
                    setIsPlaying(true);
                }
            });
            ws.on('pause', () => {
                if (!isMounted.current) return;
                setIsPlaying(false);
            });
            // FINISH HANDLER: Check if we need to loop (Edge case where region ends at file end)
            ws.on('finish', () => {
                if (isLoopingRef.current && isMounted.current) {
                    // If TRIM tool is active, loop the region
                    if (activeToolRef.current === 'trim' && regionsRef.current) {
                        const list = regionsRef.current.getRegions();
                        const trimRegion = list.find((r: any) => r.id === 'trim-region');

                        if (trimRegion) {
                            ws.play(trimRegion.start, trimRegion.end);
                            return;
                        }
                    }
                    // Otherwise (or fallback), loop full file
                    ws.play(0);
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

        // Micro-Fade In (15ms) to prevent clicks
        const timeSinceStart = (performance.now() - playbackStartTimeRef.current) / 1000;
        if (timeSinceStart < 0.015) {
            volume *= (timeSinceStart / 0.015);
        }

        // Micro-Fade Out (10ms) to prevent pops on pause
        if (isPausingRef.current) {
            const timeSincePause = (performance.now() - pauseTimeRef.current) / 1000;
            const fadeDuration = 0.010; // 10ms
            const progress = Math.max(0, 1 - (timeSincePause / fadeDuration));
            volume *= progress;

            if (progress <= 0) {
                wavesurfer.current.pause();
                isPausingRef.current = false;
                setIsPausing(false);
                if (pauseTimeoutRef.current) {
                    clearTimeout(pauseTimeoutRef.current);
                    pauseTimeoutRef.current = null;
                }
                return;
            }
        }

        wavesurfer.current.setVolume(volume);

        if (isPlaying || isPausingRef.current) {
            rafRef.current = requestAnimationFrame(updateVolume);
        }
    };

    // Watch playback state to start/stop volume loop
    useEffect(() => {
        if (isPlaying || isPausing) {
            updateVolume();
        } else {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        }
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [isPlaying, isPausing, fadeIn, fadeOut]);



    // Auto-Loop Switch Logic
    useEffect(() => {
        if (activeTool === 'loop' && !isLooping) {
            setIsLooping(true);
            if (regions.current) {
                const list = regions.current.getRegions();
                if (list.length > 0) {
                    list[0].setOptions({ loop: true });
                }
            }
        }
    }, [activeTool]);


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
    const setZoomCentered = (newZoom: number, targetPx?: number) => {
        if (!scrollContainerRef.current || !wavesurfer.current) return;

        const clampedZoom = Math.max(newZoom, minZoom);
        const oldZoom = zoom;
        const scrollContainer = scrollContainerRef.current;
        const viewportWidth = scrollContainer.clientWidth;

        // Determine the point we want to keep fixed in the viewport
        // targetPx is the absolute pixel position across the whole contentWidth
        let fixedAbsPx: number;
        if (targetPx !== undefined) {
            fixedAbsPx = targetPx;
        } else {
            // Default: center of the current viewport
            fixedAbsPx = scrollContainer.scrollLeft + (viewportWidth / 2);
            // If playhead is visible, maybe center on playhead instead?
            // Actually, centering on viewport is more standard for slider zoom.
            const playheadPx = wavesurfer.current.getCurrentTime() * oldZoom;
            const isPlayheadVisible = playheadPx >= scrollContainer.scrollLeft && playheadPx <= (scrollContainer.scrollLeft + viewportWidth);
            if (isPlayheadVisible) {
                fixedAbsPx = playheadPx;
            }
        }

        // Calculate where that fixed point is relative to the viewport left edge
        const viewportRelativeOffset = fixedAbsPx - scrollContainer.scrollLeft;

        // Apply new zoom
        setZoom(clampedZoom);

        // Calculate new absolute pixel position for the same time point
        const timeAtFixedPoint = fixedAbsPx / oldZoom;
        const newAbsPx = timeAtFixedPoint * clampedZoom;

        // Adjust scroll to keep the relative offset the same
        const newScrollLeft = newAbsPx - viewportRelativeOffset;

        requestAnimationFrame(() => {
            if (scrollContainerRef.current) {
                scrollContainerRef.current.scrollLeft = Math.max(0, newScrollLeft);
            }
        });
    };

    const handleZoomIn = () => setZoomCentered(Math.min(zoom * 1.25, 500));
    const handleZoomOut = () => setZoomCentered(Math.max(zoom * 0.8, minZoom));

    const handleFitView = () => {
        if (!scrollContainerRef.current || !editorDuration) return;
        const width = scrollContainerRef.current.clientWidth;
        // Fit all: zoom = width / editorDuration
        const fitZoom = (width - 16) / editorDuration; // -16 for px-2 padding
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

        // Add margin (90% usable width = 5% margin aside)
        // This ensures the region is comfortably visible
        const safeWidth = (width - 16) * 0.9;
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

    const triggerSafePause = useCallback((callback?: () => void) => {
        if (pauseTimeoutRef.current) {
            clearTimeout(pauseTimeoutRef.current);
            pauseTimeoutRef.current = null;
        }

        if (!wavesurfer.current) {
            if (callback) callback();
            return;
        }

        if (isPlaying) {
            if (isPausingRef.current) return;
            setIsPausing(true);
            isPausingRef.current = true;
            pauseTimeRef.current = performance.now();

            pauseTimeoutRef.current = setTimeout(() => {
                pauseTimeoutRef.current = null;
                if (callback) callback();
            }, 20); // 10ms fade + 10ms buffer
        } else {
            if (callback) callback();
        }
    }, [isPlaying]);

    const handleWheel = (e: React.WheelEvent) => {
        if (e.ctrlKey) {
            e.preventDefault();
            const delta = -Math.sign(e.deltaY);
            const factor = 1.1;

            let newZoom = zoom;
            if (delta > 0) newZoom = Math.min(zoom * factor, 1200); // Increased max zoom
            else newZoom = Math.max(zoom / factor, minZoom);

            if (scrollContainerRef.current) {
                const rect = scrollContainerRef.current.getBoundingClientRect();
                const mouseIdx = e.clientX - rect.left;
                const absolutePx = scrollContainerRef.current.scrollLeft + mouseIdx;
                setZoomCentered(newZoom, absolutePx);
            } else {
                setZoomCentered(newZoom);
            }
        }
    };

    const handlePlayPause = async () => {
        if (!wavesurfer.current) return;

        if (isPlaying) {
            if (isPausingRef.current) return;
            setIsPausing(true);
            isPausingRef.current = true;
            pauseTimeRef.current = performance.now();
        } else {
            // Cancel any pending pause
            if (pauseTimeoutRef.current) {
                clearTimeout(pauseTimeoutRef.current);
                pauseTimeoutRef.current = null;
            }
            setIsPausing(false);
            isPausingRef.current = false;
            const regionList = regions.current?.getRegions();
            const trimRegion = regionList?.find((r: any) => r.id === 'trim-region');

            // Only bind playback to trim region if the TRIM TOOL is active
            if (activeTool === 'trim' && trimRegion) {
                const currentTime = wavesurfer.current.getCurrentTime();
                const tolerance = 0.05;

                if (currentTime >= trimRegion.end - tolerance) {
                    wavesurfer.current.play(trimRegion.start, trimRegion.end);
                }
                else if (currentTime >= trimRegion.start && currentTime < trimRegion.end) {
                    wavesurfer.current.play(currentTime, trimRegion.end);
                }
                else {
                    wavesurfer.current.play(trimRegion.start, trimRegion.end);
                }
            } else {
                // Regular playback (full file)
                wavesurfer.current.play();
            }
        }
    };

    // Automation Handlers
    const handleApplyAutomation = async () => {
        if (!originalBuffer || automationPoints.length === 0) return;
        setIsProcessing(true);
        try {
            let processed = await audioProcessor.applyEnvelope(originalBuffer, automationPoints, smooth);

            if (automationNormalize) {
                processed = await audioProcessor.normalize(processed);
            }

            const meta = { ...(metadata || {}), slicePoints, tempo: tempo || undefined, id: metadata?.id || slot.fileId || uuidv4(), processing: ['normalized'] };
            const newBlob = encodeWAV(processed, meta);
            onSave(newBlob, processed.duration, "Automation Applied", true, ['normalized']);

            setAutomationPoints([
                { id: 'start', time: 0, value: 1, selected: false },
                { id: 'end', time: editorDuration, value: 1, selected: false }
            ]);

            // NEW: Close tool and reset preview state
            setActiveTool(null);
            setIsPreviewing(false);
            if (wavesurfer.current && isPlaying) {
                wavesurfer.current.pause();
                setIsPlaying(false);
            }

            showToast("Automation Applied & Tool Reset", "success");
        } catch (e) {
            console.error(e);
            showToast("Failed to apply automation", "error");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleResetAutomation = async () => {
        setAutomationPoints([
            { id: 'start', time: 0, value: 1, selected: false },
            { id: 'end', time: editorDuration, value: 1, selected: false }
        ]);

        if (isPreviewing && currentBlob && wavesurfer.current) {
            setIsPlaying(false);
            setIsPreviewing(false);
            await wavesurfer.current.loadBlob(currentBlob);
        }
        handleDirtyChange();
        showToast("Automation Reset", "success");
    };

    // EQ Handlers
    const handlePreviewEQ = async () => {
        if (!originalBuffer || !wavesurfer.current) return;
        try {
            setIsProcessing(true);
            let processed = isAdvancedEQ
                ? await audioProcessor.applyAdvancedEQ(originalBuffer, ADVANCED_EQ_FREQS.map((f, i) => ({ freq: f, gain: advancedEQBands[i] })))
                : await audioProcessor.applyEQ(originalBuffer, eqLow, eqMid, eqHigh);

            if (eqNormalize) {
                processed = await audioProcessor.normalize(processed);
            }

            const meta = { ...(metadata || {}), slicePoints, tempo: tempo || undefined, id: metadata?.id || slot.fileId || uuidv4() };
            const newBlob = await audioProcessor.toWav(processed, meta);
            triggerSafePause(async () => {
                if (wavesurfer.current) {
                    await wavesurfer.current.loadBlob(newBlob);
                    wavesurfer.current.play();
                }
            });
            setIsPreviewingEQ(true);
            showToast("Previewing EQ...", "success");
        } catch (e) {
            console.error(e);
            showToast("Failed to preview EQ", "error");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleApplyEQ = async () => {
        if (!originalBuffer) return;
        const hasChanges = isAdvancedEQ
            ? advancedEQBands.some(v => v !== 0)
            : (eqLow !== 0 || eqMid !== 0 || eqHigh !== 0);

        if (!hasChanges) {
            showToast("No EQ changes to apply", "error");
            return;
        }
        setIsProcessing(true);
        try {
            let processed = isAdvancedEQ
                ? await audioProcessor.applyAdvancedEQ(originalBuffer, ADVANCED_EQ_FREQS.map((f, i) => ({ freq: f, gain: advancedEQBands[i] })))
                : await audioProcessor.applyEQ(originalBuffer, eqLow, eqMid, eqHigh);

            if (eqNormalize) {
                processed = await audioProcessor.normalize(processed);
            }

            const desc = isAdvancedEQ
                ? `Advanced EQ (10 bands)`
                : `EQ (L:${eqLow > 0 ? '+' : ''}${eqLow} M:${eqMid > 0 ? '+' : ''}${eqMid} H:${eqHigh > 0 ? '+' : ''}${eqHigh})`;

            const meta = { ...(metadata || {}), slicePoints, tempo: tempo || undefined, id: metadata?.id || slot.fileId || uuidv4(), processing: ['eq' as const] };
            const newBlob = encodeWAV(processed, meta);
            onSave(newBlob, processed.duration, desc, true, ['eq']);

            setEqLow(0); setEqMid(0); setEqHigh(0);
            setAdvancedEQBands(new Array(10).fill(0));
            setActiveTool(null);
            setIsPreviewingEQ(false);
            setHasNormalized(false);
            showToast("EQ Applied!", "success");
        } catch (e) {
            console.error(e);
            showToast("Failed to apply EQ", "error");
        } finally {
            setIsProcessing(false);
        }
    };


    const handleSliderPointerDown = (idx: number, e: React.PointerEvent) => {
        setDraggingSliderIdx(idx);
        (e.target as Element).setPointerCapture(e.pointerId);
    };

    const handleSliderPointerMove = (idx: number, e: React.PointerEvent) => {
        if (draggingSliderIdx !== idx) return;

        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const y = e.clientY - rect.top;
        const height = rect.height;

        // Map Y position (0 to height) to dB (+24 to -24)
        // Y=0 is +24dB, Y=height is -24dB
        let rawVal = 24 - (y / height) * 48;
        let val = Math.round(rawVal * 2) / 2; // Step 0.5
        val = Math.max(-24, Math.min(24, val));

        const newBands = [...advancedEQBands];
        newBands[idx] = val;
        setAdvancedEQBands(newBands);
        handleDirtyChange();
    };

    const handleSliderPointerUp = () => {
        setDraggingSliderIdx(null);
    };

    const handleResetEQ = () => {
        setEqLow(0); setEqMid(0); setEqHigh(0);
        setAdvancedEQBands(new Array(10).fill(0));
        setIsAdvancedEQ(false);
        setIsPreviewingEQ(false);
        if (isPreviewingEQ && currentBlob && wavesurfer.current) {
            setIsPlaying(false);
            wavesurfer.current.loadBlob(currentBlob);
        }
    };

    // Limiter Handlers
    const handlePreviewLimiter = async () => {
        if (!originalBuffer || !wavesurfer.current) return;
        try {
            setIsProcessing(true);
            const processed = limiterMode === 'peak'
                ? await audioProcessor.applyHardLimiter(originalBuffer, limiterThreshold)
                : await audioProcessor.applyLimiter(originalBuffer, limiterCeiling, limiterThreshold);

            const meta = { ...(metadata || {}), slicePoints, tempo: tempo || undefined, id: metadata?.id || slot.fileId || uuidv4() };
            const newBlob = await audioProcessor.toWav(processed, meta);
            triggerSafePause(async () => {
                if (wavesurfer.current) {
                    await wavesurfer.current.loadBlob(newBlob);
                    wavesurfer.current.play();
                }
            });
            setIsPreviewingLimiter(true);
            showToast(`Previewing ${limiterMode === 'peak' ? 'Peak Limiter' : 'Limiter'}...`, "success");
        } catch (e) {
            console.error(e);
            showToast("Failed to preview Limiter", "error");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleApplyLimiter = async () => {
        if (!originalBuffer) return;
        setIsProcessing(true);
        try {
            const processed = limiterMode === 'peak'
                ? await audioProcessor.applyHardLimiter(originalBuffer, limiterThreshold)
                : await audioProcessor.applyLimiter(originalBuffer, limiterCeiling, limiterThreshold);

            const desc = limiterMode === 'peak'
                ? `Peak Limited (${limiterThreshold}dB)`
                : `Limited (T:${limiterThreshold}dB C:${limiterCeiling}dB)`;

            const meta = { ...(metadata || {}), slicePoints, tempo: tempo || undefined, id: metadata?.id || slot.fileId || uuidv4(), processing: ['limited'] };
            const newBlob = encodeWAV(processed, meta);
            onSave(newBlob, processed.duration, desc, true, ['limited']);

            setLimiterThreshold(-6); setLimiterCeiling(-0.3);
            setActiveTool(null);
            setIsPreviewingLimiter(false);
            setHasNormalized(false);
            showToast("Limiter Applied!", "success");
        } catch (e) {
            console.error(e);
            showToast("Failed to apply Limiter", "error");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleApplyNormalization = async (level: number = -1) => {
        if (!originalBuffer) return;
        triggerSafePause(async () => {
            setIsProcessing(true);
            try {
                // Normalize to -1dB
                const normalized = await audioProcessor.normalize(originalBuffer, level);
                const meta = { ...(metadata || {}), slicePoints, tempo: tempo || undefined, id: metadata?.id || slot.fileId || uuidv4(), processing: ['normalized'] };
                const newBlob = await audioProcessor.toWav(normalized, meta);
                // Normalization is a specific action
                onSave(newBlob, normalized.duration, `Normalized (${level}dB)`, true, ['normalized']);
                setHasNormalized(true);
                setActiveTool(null);
                showToast(`Normalized to ${level}dB!`, "success");
            } catch (e) {
                console.error(e);
                showToast("Normalization Failed", "error");
            } finally {
                setIsProcessing(false);
            }
        });
    };



    // Cutter Handlers
    const handlePreviewCut = async () => {
        if (!originalBuffer || !wavesurfer.current || cutRegions.length === 0) return;
        try {
            setIsProcessing(true);
            const regionsToRemove = cutRegions.map(r => ({ start: r.start, end: r.end }));
            const processed = await audioProcessor.cutAndMerge(originalBuffer, regionsToRemove, cutCrossfade);
            const meta = { ...(metadata || {}), slicePoints, tempo: tempo || undefined, id: metadata?.id || slot.fileId || uuidv4() };
            const newBlob = await audioProcessor.toWav(processed, meta);
            triggerSafePause(async () => {
                if (wavesurfer.current) {
                    await wavesurfer.current.loadBlob(newBlob);
                    wavesurfer.current.play();
                }
            });
            setIsPreviewingCut(true);
            showToast("Previewing Cut...", "success");
        } catch (e) {
            console.error(e);
            showToast("Failed to preview cut", "error");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleApplyCut = async () => {
        if (!originalBuffer || cutRegions.length === 0) return;
        setIsProcessing(true);
        try {
            const regionsToRemove = cutRegions.map(r => ({ start: r.start, end: r.end }));
            
            // Recalculate slice points across cuts
            let newSlicePoints = [...slicePoints];
            const sortedRegions = [...regionsToRemove].sort((a,b) => a.start - b.start);
            newSlicePoints = newSlicePoints.map(p => {
                let shift = 0;
                let isInsideCut = false;
                for (const r of sortedRegions) {
                    if (p > r.start && p < r.end) isInsideCut = true;
                    if (p >= r.end) shift += (r.end - r.start);
                }
                return isInsideCut ? -1 : p - shift; 
            }).filter(p => p !== -1);

            const processed = await audioProcessor.cutAndMerge(originalBuffer, regionsToRemove, cutCrossfade);
            const meta = { ...(metadata || {}), slicePoints: newSlicePoints, tempo: tempo || undefined, id: metadata?.id || slot.fileId || uuidv4(), processing: ['cut'] };
            const newBlob = encodeWAV(processed, meta);

            const removedDuration = cutRegions.reduce((sum, r) => sum + (r.end - r.start), 0);
            onSave(newBlob, processed.duration, `Cut (${cutRegions.length} region${cutRegions.length > 1 ? 's' : ''}, -${removedDuration.toFixed(1)}s)`, true, ['cut']);

            setCutRegions([]);
            setActiveTool(null);
            setIsPreviewingCut(false);
            setHasNormalized(false);
            showToast("Cut Applied!", "success");
        } catch (e) {
            console.error(e);
            showToast("Failed to apply cut", "error");
        } finally {
            setIsProcessing(false);
        }
    };



    // Slicer Handlers
    const handleAutoSlice = (count: number) => {
        if (editorDuration <= 0 || count < 1) return;
        const step = editorDuration / (count + 1);
        const points: number[] = [];
        for (let i = 1; i <= count; i++) {
            points.push(+(step * i).toFixed(3));
        }
        setSlicePoints(points);
        handleDirtyChange();
    };

    const handleApplySlicer = async () => {
        if (!originalBuffer) return;
        // Save slice markers and tempo into metadata — doesn't modify audio
        setIsProcessing(true);
        try {
            const currentPoints = [...slicePoints].sort((a, b) => a - b);
            const meta: WavMetadata = {
                ...(internalMetadata || metadata || {}),
                id: (internalMetadata || metadata)?.id || slot.fileId || uuidv4(),
                processing: Array.from(new Set([...((internalMetadata || metadata)?.processing || []), 'sliced'])),
                slicePoints: currentPoints,
                tempo: tempo || undefined,
            };
            const newBlob = encodeWAV(originalBuffer, meta);
            onSave(newBlob, originalBuffer.duration, `Sliced (${currentPoints.length} markers)${tempo ? ` @ ${tempo}BPM` : ''}`, true, meta.processing as any);

            // AFTER saving, the current state is the "initial" one for the NEXT edit session
            setInitialSlicePoints(currentPoints);
            setSlicePoints(currentPoints); // Ensure state is sorted too
            setInitialTempo(tempo);

            showToast("Slicer Settings Saved!", "success");
        } catch (e) {
            console.error(e);
            showToast("Failed to save slicer settings", "error");
        } finally {
            setIsProcessing(false);
        }
    };



    const handleClearAllSlices = () => {
        setSlicePoints([]);
    };

    const handleRemoveSliceMarker = (idx: number) => {
        setSlicePoints(prev => prev.filter((_, i) => i !== idx));
        handleDirtyChange();
    };

    useEffect(() => {
        if (activeSliceIdx > slicePoints.length) {
            setActiveSliceIdx(slicePoints.length);
        }
    }, [slicePoints.length, activeSliceIdx]);

    const playSliceByIndex = useCallback((idx: number) => {
        if (!wavesurfer.current || editorDuration <= 0) return;
        if (idx < 0 || idx > slicePoints.length) return; // Note: if slicePoints = N, there are N+1 slices (0 to N)
        setActiveSliceIdx(idx);

        const start = idx === 0 ? 0 : slicePoints[idx - 1];
        const end = idx < slicePoints.length ? slicePoints[idx] : editorDuration;

        wavesurfer.current.play(start, end);
        setIsPlaying(true);

        // Highlight for Map
        if (triggeredSliceTimeout.current) clearTimeout(triggeredSliceTimeout.current);
        setTriggeredSliceIdx(idx);
        triggeredSliceTimeout.current = setTimeout(() => {
            setTriggeredSliceIdx(null);
        }, 300);
    }, [editorDuration, slicePoints]);

    const handlePlaySlice = () => {
        playSliceByIndex(activeSliceIdx);
    };

    // Refs for stable event listeners (Keyboard, MIDI) — declared after functions they reference
    const slicePointsRef = useRef<number[]>(slicePoints);
    const playSliceByIndexRef = useRef<(idx: number) => void>(playSliceByIndex);

    useEffect(() => { slicePointsRef.current = slicePoints; }, [slicePoints]);
    useEffect(() => { playSliceByIndexRef.current = playSliceByIndex; }, [playSliceByIndex]);

    // Keyboard Auditioning
    useEffect(() => {
        if (activeTool !== 'slicer') return;

        const QWERTY_MAP = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', 'a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'z', 'x', 'c'];
        const AZERTY_MAP = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'a', 'z', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', 'q', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'w', 'x', 'c'];

        // Also support Numpad keys 1-9

        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if focus is in an input field (so typing name or BPM doesn't trigger slices)
            if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;

            const key = e.key.toLowerCase();
            const map = keyboardLayout === 'QWERTY' ? QWERTY_MAP : AZERTY_MAP;
            const idx = map.indexOf(key);

            if (idx !== -1 && idx <= slicePointsRef.current.length) {
                e.preventDefault();
                playSliceByIndexRef.current(idx);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeTool, keyboardLayout]);

    // MIDI Auditioning
    useEffect(() => {
        if (activeTool !== 'slicer') return;

        const activeInputs = new Set<any>();
        let isCanceled = false;

        const onMIDIMessage = (message: any) => {
            const [command, note, velocity] = message.data;

            // Note On for any channel (144 to 159). Also ensure velocity > 0
            if (command >= 144 && command <= 159 && velocity > 0) {
                // Map Note 36 (C1) through 67 (G3) to slice index 0-31
                const idx = note - 36;
                if (idx >= 0 && idx <= 31 && idx <= slicePointsRef.current.length) {
                    playSliceByIndexRef.current(idx);
                }
            }
        };

        if (navigator.requestMIDIAccess) {
            navigator.requestMIDIAccess().then((access) => {
                if (isCanceled) return;

                // Bind to all existing inputs
                access.inputs.forEach((input: any) => {
                    input.addEventListener('midimessage', onMIDIMessage);
                    activeInputs.add(input);
                });

                // Handle hot-plugged devices
                access.onstatechange = (e: any) => {
                    const port = e.port;
                    if (port.type === 'input') {
                        if (port.state === 'connected') {
                            port.addEventListener('midimessage', onMIDIMessage);
                            activeInputs.add(port);
                        } else {
                            port.removeEventListener('midimessage', onMIDIMessage);
                            activeInputs.delete(port);
                        }
                    }
                };
            }).catch((err) => console.error("MIDI Request Error:", err));
        }

        return () => {
            isCanceled = true;
            activeInputs.forEach((input) => {
                input.removeEventListener('midimessage', onMIDIMessage);
            });
        };
    }, [activeTool]);

    const handleSliceMarkerChange = (idx: number, newValue: number) => {
        if (isNaN(newValue) || newValue < 0 || newValue > editorDuration) return;

        setSlicePoints(prev => {
            const newPoints = [...prev];
            newPoints[idx] = newValue;
            newPoints.sort((a, b) => a - b);
            return newPoints;
        });
        handleDirtyChange();
    };

    // Sync pitchSemitones with selected region
    useEffect(() => {
        if (activeTool === 'pitch' && !isPreviewing) {
            const selected = pitchRegions.find(r => r.selected);
            if (selected) {
                // Only update if the value is different to avoid recursive loops
                if (selected.semitones !== pitchSemitones || selected.id !== lastSelectedPitchId.current) {
                    setPitchSemitones(selected.semitones);
                    lastSelectedPitchId.current = selected.id;
                }
            } else {
                lastSelectedPitchId.current = null;
            }
        }
    }, [pitchRegions, activeTool, isPreviewing]);

    // Auto-clear detected pitch if region bounds change
    useEffect(() => {
        if (activeTool === 'pitch') {
            const hasChangedBounds = pitchRegions.some(r => {
                const prev = prevPitchRegionsRef.current.find(p => p.id === r.id);
                return prev && (prev.start !== r.start || prev.end !== r.end);
            });

            if (hasChangedBounds) {
                setPitchRegions(prev => prev.map(r => {
                    const old = prevPitchRegionsRef.current.find(p => p.id === r.id);
                    if (old && (old.start !== r.start || old.end !== r.end)) {
                        return { ...r, detectedNote: undefined, detectedFreq: undefined, confidence: undefined };
                    }
                    return r;
                }));
            }
            prevPitchRegionsRef.current = pitchRegions;
        }
    }, [pitchRegions, activeTool]);

    const handlePitchSliderChange = (val: number) => {
        setPitchSemitones(val);
        setPitchRegions(prev => prev.map(r => r.selected ? { ...r, semitones: val } : r));
        handleDirtyChange();
    };

    const handleDetectPitch = async () => {
        if (!originalBuffer) return;

        // Find active region or use whole file
        const activeRegion = pitchRegions.find(r => r.selected);
        const start = activeRegion ? activeRegion.start : 0;
        const end = activeRegion ? activeRegion.end : editorDuration;

        setIsProcessing(true);
        try {
            const { frequency, confidence } = await audioProcessor.detectPitch(originalBuffer, start, end);
            setDetectedPitch(frequency);

            if (activeRegion && frequency > 0) {
                const note = audioProcessor.freqToNote(frequency);
                setPitchRegions(prev => prev.map(r => r.id === activeRegion.id ? {
                    ...r,
                    detectedFreq: frequency,
                    detectedNote: note,
                    confidence: confidence
                } : r));

                if (confidence > 0.7) {
                    showToast(`Detected: ${note} (${frequency.toFixed(1)} Hz) - ${Math.round(confidence * 100)}% confidence`, "success");
                } else {
                    showToast(`Uncertain detection: ${frequency.toFixed(1)} Hz (${Math.round(confidence * 100)}%)`, "warning");
                }
            } else if (frequency > 0) {
                const note = audioProcessor.freqToNote(frequency);
                showToast(`Detected (Global): ${note} (${frequency.toFixed(1)} Hz)`, "success");
            } else {
                showToast("No clear pitch detected in selection", "warning");
            }
        } catch (e) {
            console.error(e);
            showToast("Pitch detection failed", "error");
        } finally {
            setIsProcessing(false);
        }
    };

    const handlePreviewPitch = async () => {
        if (!originalBuffer || !wavesurfer.current) return;
        setIsProcessing(true);
        try {
            const { buffer: processed, previewRegions } = await audioProcessor.applyMultiPitchShift(originalBuffer, pitchRegions);
            const blob = await audioProcessor.toWav(processed);
            if (wavesurfer.current) {
                wavesurfer.current.pause();
                await wavesurfer.current.loadBlob(blob);
                wavesurfer.current.play();
            }
            setPreviewPitchRegions(previewRegions.map(r => ({ ...r, selected: false })));
            setPreviewDuration(processed.duration);
            setIsPreviewing(true);
            showToast("Previewing Pitch...", "success");
        } catch (e) {
            console.error(e);
            showToast("Pitch preview failed", "error");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleApplyPitch = async () => {
        if (!originalBuffer) return;

        setIsProcessing(true);
        try {
            const { buffer: processed } = await audioProcessor.applyMultiPitchShift(originalBuffer, pitchRegions);

            const newId = uuidv4();
            const meta = { ...(metadata || {}), slicePoints, tempo: tempo || undefined, id: newId, processing: ['normalized'] };
            const newBlob = encodeWAV(processed, meta);

            const numRegions = pitchRegions.filter(r => r.semitones !== 0).length;
            onSave(newBlob, processed.duration, `Pitch Tuning (${numRegions} regions)`, true, ['normalized']);

            setPitchSemitones(0);
            setDetectedPitch(null);
            setPitchRegions([]);
            setPreviewPitchRegions([]);
            setPreviewDuration(null);
            setIsPreviewing(false);
            setActiveTool(null);
            showToast("Pitch Tuning Applied!", "success");
        } catch (e) {
            console.error(e);
            showToast("Failed to apply pitch shift", "error");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleResetPitch = async () => {
        if (!originalBuffer || !wavesurfer.current) return;

        // If we were previewing, we need to reload the original buffer
        if (isPreviewing) {
            const blob = await audioProcessor.toWav(originalBuffer, metadata);
            setIsPlaying(false);
            await wavesurfer.current.loadBlob(blob);
            setIsPreviewing(false);
            setPreviewPitchRegions([]);
            setPreviewDuration(null);
            showToast("Preview Cancelled", "success");
        } else {
            // If not previewing, just deselect all or similar? 
            // The user wants Reset to go back to before preview.
            // If they aren't previewing, maybe it just closes the tool? 
            // Let's keep it simple: Reset = cancel preview.
        }
    };

    const handleSelectAllPitch = () => {
        setPitchRegions([{
            id: 'pitch-all',
            start: 0,
            end: editorDuration,
            semitones: 0,
            selected: true
        }]);
    };

    const handlePreviewAutomation = async () => {
        if (!originalBuffer || !wavesurfer.current) return;

        try {
            setIsProcessing(true);
            let processed = await audioProcessor.applyEnvelope(originalBuffer, automationPoints, smooth);

            if (automationNormalize) {
                processed = await audioProcessor.normalize(processed);
            }

            const meta = { ...(metadata || {}), slicePoints, tempo: tempo || undefined, id: metadata?.id || slot.fileId || uuidv4() };
            const newBlob = await audioProcessor.toWav(processed, meta);

            await wavesurfer.current.loadBlob(newBlob);
            wavesurfer.current.play();
            setIsPreviewing(true);
            showToast("Previewing changes... (Click again to stop)", "success");
        } catch (e) {
            console.error(e);
            showToast("Failed to preview", "error");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleSplitStereo = async (side: 'L' | 'R' | 'both') => {
        if (!originalBuffer) return;
        setIsProcessing(true);
        try {
            const { left, right } = await audioProcessor.splitToChannels(originalBuffer);
            if (side === 'L' || side === 'both') {
                const blob = await audioProcessor.toWav(left);
                onSave(blob, left.duration, "Channel Left", true, ['normalized' as any]);
            }
            if ((side === 'R' || side === 'both') && right) {
                const blob = await audioProcessor.toWav(right);
                onSave(blob, right.duration, "Channel Right", true, ['normalized' as any]);
            }
            showToast("Channels saved to pool", "success");
            toggleTool(null);
        } catch (e) {
            console.error(e);
            showToast("Failed to split channels", "error");
        } finally {
            setIsProcessing(false);
        }
    };

    const handlePreviewLoop = async () => {
        if (!originalBuffer || !wavesurfer.current) return;

        // Always regenerate (Refresh behavior)
        /*
        if (isPreviewingLoop) {
            if (currentBlob) await wavesurfer.current.loadBlob(currentBlob);
            // Disable Loop
            const media = wavesurfer.current.getMediaElement();
            if (media) media.loop = false;
            setIsPreviewingLoop(false);
            return;
        }
        */

        setIsProcessing(true);
        try {
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

            let looped = await audioProcessor.applyCrossfadeLoop(trimmed, loopCrossfade);
            const meta = { ...(metadata || {}), slicePoints, tempo: tempo || undefined, id: metadata?.id || slot.fileId || uuidv4(), processing: ['trimmed', 'looped'] };
            const newBlob = await audioProcessor.toWav(looped, meta);

            await wavesurfer.current.loadBlob(newBlob);

            // Enable Gapless Loop
            const media = wavesurfer.current.getMediaElement();
            if (media) media.loop = true;

            wavesurfer.current.play();
            setIsPreviewingLoop(true);
            showToast("Previewing Loop... (Click again to stop)", "success");
        } catch (e) {
            console.error(e);
            showToast("Failed to preview loop", "error");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleApplyLoop = async () => {
        if (!originalBuffer || !wavesurfer.current) return;
        setIsProcessing(true);
        try {
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
            const looped = await audioProcessor.applyCrossfadeLoop(trimmed, loopCrossfade);
            
            // Recalculate slice points for trim
            const newSlicePoints = slicePoints.filter(p => p >= start && p <= end).map(p => p - start);
            const meta = { ...(metadata || {}), slicePoints: newSlicePoints, tempo: tempo || undefined, id: metadata?.id || slot.fileId || uuidv4(), processing: ['trimmed', 'looped'] };
            const newBlob = encodeWAV(looped, meta);

            onSave(newBlob, looped.duration, `Loop (${loopCrossfade.toFixed(2)}s xfade)`, true, ['looped']);

            setIsPreviewingLoop(false);
            setHasNormalized(false);
            toggleTool(null);
            showToast("Loop Applied!", "success");
        } catch (e) {
            console.error(e);
            showToast("Failed to apply loop", "error");
        } finally {
            setIsProcessing(false);
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
            if (automationPoints.length > 0) isDirty = true;
            if (regionState.start > 0.01 || regionState.end < (originalBuffer.duration - 0.01)) isDirty = true;
            if (eqLow !== 0 || eqMid !== 0 || eqHigh !== 0) isDirty = true;
            if (activeTool === 'limiter' && (limiterThreshold !== -6 || limiterCeiling !== -0.3)) isDirty = true;
            if (cutRegions.length > 0) isDirty = true;
            if (slicePoints.length > 0) isDirty = true;
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

            // Apply Volume Automation first (on full buffer)
            let bufferToProcess = originalBuffer;
            if (automationPoints.length > 0) {
                bufferToProcess = await audioProcessor.applyEnvelope(originalBuffer, automationPoints, smooth);
            }

            let finalBlob: Blob;
            let finalDuration: number;

            if (!isDirty) {
                // Not dirty -> Assign to Tape
                let processed = await audioProcessor.trim(bufferToProcess, start, end);
                finalDuration = processed.duration;
                // Preserve metadata and recalculate slice points for trim
                const newSlicePoints = slicePoints.filter(p => p >= start && p <= end).map(p => p - start);
                const meta = { ...(metadata || {}), slicePoints: newSlicePoints, tempo: tempo || undefined, id: metadata?.id || slot.fileId || uuidv4() };
                finalBlob = await audioProcessor.toWav(processed, meta);

                // Preserve processing tags if assigning same version? 
                // Parent handles assignment. If we pass !isDirty, it re-uses current version logic usually?
                // Actually App.tsx creates a NEW version even if not dirty in current logic (unless blob match check).
                // Let's pass current processing tags if we are just "assigning".
                const currentTags = versions.find(v => v.id === loadedVersionId)?.processing;
                onSave(finalBlob, finalDuration, 'Edited', isDirty, currentTags);

            } else {
                let processed = await audioProcessor.trim(bufferToProcess, start, end);
                if (fadeIn > 0 || fadeOut > 0) {
                    processed = await audioProcessor.applyFades(processed, fadeIn, fadeOut);
                }
                finalDuration = processed.duration;
                
                // Preserve metadata and recalculate slice points for trim
                const newSlicePoints = slicePoints.filter(p => p >= start && p <= end).map(p => p - start);
                const meta = { ...(metadata || {}), slicePoints: newSlicePoints, tempo: tempo || undefined, id: metadata?.id || slot.fileId || uuidv4(), processing: ['trimmed'] };
                finalBlob = await audioProcessor.toWav(processed, meta);

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
            if (v.blob) {
                const url = URL.createObjectURL(v.blob);
                previewAudio.src = url;
                previewAudio.play().catch(e => console.error("Preview fail", e));
                setPreviewingVersionId(v.id);
                previewAudio.onended = () => setPreviewingVersionId(null);
            } else {
                showToast("Cannot preview: audio file missing", "error");
                setPreviewingVersionId(null);
            }
        }
    };

    // ... initEditor needs to attach listeners for isDirty ...


    // ...

    // We calculate width to force the scroll container to expand
    // Ensure we have a valid width based on duration and zoom
    const contentWidth = Math.max(viewportWidth, editorDuration * zoom);

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
        if (!containerRef.current || !wavesurfer.current || !scrollContainerRef.current) return;

        const rect = scrollContainerRef.current.getBoundingClientRect();
        const localX = e.clientX - rect.left;
        const totalX = scrollContainerRef.current.scrollLeft + localX;

        // Use contentWidth as the true pixel width for mapping (WaveSurfer stretches to viewport if smaller)
        let progress = totalX / contentWidth;
        if (progress < 0) progress = 0;
        if (progress > 1) progress = 1;

        wavesurfer.current.seekTo(progress);
    };

    const handleEditorScroll = () => {
        if (!scrollContainerRef.current || !wavesurfer.current) return;
        const scrollLeft = scrollContainerRef.current.scrollLeft;

        // Sync WaveSurfer internal scroll with main scrollbar
        // In v7, the scrollable element is in the shadow DOM, accessible via renderer.scrollContainer
        const shadowScroll = (wavesurfer.current as any).renderer?.scrollContainer;
        if (shadowScroll) {
            shadowScroll.scrollLeft = scrollLeft;
        } else {
            // Fallback for different versions or if renderer is not directly exposed
            const wrapper = wavesurfer.current.getWrapper();
            if (wrapper) {
                const s = wrapper.shadowRoot?.querySelector('[part="scroll"]');
                if (s) (s as HTMLElement).scrollLeft = scrollLeft;
                else wrapper.scrollLeft = scrollLeft;
            }
        }
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

                /* Trim Region Visibility Control */
                .hide-trim-regions .wavesurfer-region {
                    opacity: 0 !important;
                    pointer-events: none !important;
                    visibility: hidden !important;
                }
                .show-trim-regions .wavesurfer-region {
                    opacity: 1 !important;
                    pointer-events: auto !important;
                    visibility: visible !important;
                }
            `}</style>



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


            <div className={`bg-[#1a1a1a] border border-gray-800 rounded-2xl w-full max-w-[1440px] h-[95vh] shadow-2xl flex flex-row-reverse overflow-hidden noise-texture ${activeTool === 'trim' ? 'show-trim-regions' : 'hide-trim-regions'}`}>


                {/* Tool Switch Confirmation */}
                <ConfirmModal
                    isOpen={pendingTool !== undefined}
                    onClose={() => setPendingTool(undefined)}
                    onConfirm={() => {
                        handleSave();
                        if (pendingTool !== undefined) {
                            executeToolSwitch(pendingTool);
                        }
                        setPendingTool(undefined);
                    }}
                    onDiscard={handleDiscardChanges}
                    title="Unsaved Changes"
                    message="You have unsaved changes. Do you want to apply them before switching tools?"
                    confirmLabel="Apply & Switch"
                    discardLabel="Discard"
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
                <div className={`bg-[#111] border-l border-gray-800 flex flex-col shrink-0 transition-all duration-300 ${isHistoryExpanded ? 'w-64' : 'w-16 items-center'}`}>
                    <div className="p-4 border-b border-gray-800 bg-gray-900/50 flex flex-wrap gap-2 justify-between items-center relative overflow-hidden w-full">
                        <div className="flex items-center gap-2 w-full justify-between">
                            <div className="flex items-center gap-2">
                                <button onClick={() => setIsHistoryExpanded(!isHistoryExpanded)} className="text-gray-500 hover:text-white transition-colors select-none" title={isHistoryExpanded ? "Collapse History" : "Expand History"}>
                                    {isHistoryExpanded ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                                </button>
                                {isHistoryExpanded && <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">History</h4>}
                            </div>
                            {isHistoryExpanded && onCleanupProject && (
                                <button
                                    onClick={() => onCleanupProject()}
                                    className="px-2 py-1.5 hover:bg-red-500/10 rounded flex items-center gap-1.5 text-gray-400 hover:text-red-400 font-bold text-xs uppercase tracking-wider transition-colors tooltip-trigger"
                                    title="Clean Up Project History"
                                >
                                    <Trash2 size={13} strokeWidth={2.5} />
                                    <span>Clean</span>
                                </button>
                            )}
                        </div>
                        {isHistoryExpanded && selectedVersionIds.size > 0 && (
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
                    <div className={`flex-1 overflow-y-auto p-2 space-y-2 history-scroll w-full ${!isHistoryExpanded && 'flex flex-col items-center'}`}>
                        {[...versions].sort((a,b) => b.timestamp - a.timestamp).map((v) => {
                            const isActive = v.id === loadedVersionId;
                            const isSelected = selectedVersionIds.has(v.id);

                            if (!isHistoryExpanded) {
                                return (
                                    <div
                                        key={v.id}
                                        onClick={() => handleLoadVersion(v)}
                                        className={`w-10 h-10 shrink-0 rounded-full border border-gray-800 flex items-center justify-center cursor-pointer transition-all hover:bg-gray-800 relative
                                            ${isActive ? 'bg-synthux-blue text-white border-synthux-blue' : 'bg-[#1a1a1a] text-gray-500'}
                                            ${isSelected ? 'ring-2 ring-synthux-yellow border-synthux-yellow' : ''}
                                        `}
                                        title={`${new Date(v.timestamp).toLocaleString(undefined, { timeStyle: 'short' })} - ${v.description || 'Edited Version'}`}
                                    >
                                        <span className="text-[10px] font-bold uppercase select-none">{v.id.substring(v.id.length - 2)}</span>
                                        {isActive && <div className="absolute -top-0 -right-0 w-3 h-3 bg-synthux-blue rounded-full border-2 border-[#111]" />}
                                    </div>
                                );
                            }

                            return (
                                <div
                                    key={v.id}
                                    onClick={() => {
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
                                                    onClick={(_e) => {
                                                        _e.stopPropagation();
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
                                        <span>{(v.duration || 0).toFixed(2)}s • {v.blob ? (v.blob.size / 1024).toFixed(0) : '0'}KB</span>
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
                                    {isRenaming ? (
                                        <input
                                            autoFocus
                                            type="text"
                                            value={renameValue}
                                            onChange={e => setRenameValue(e.target.value)}
                                            onBlur={handleRenameSubmit}
                                            onKeyDown={handleRenameKeyDown}
                                            className="text-2xl font-black bg-[#111] text-white tracking-tighter uppercase border border-synthux-yellow rounded outline-none px-2 py-0"
                                        />
                                    ) : (
                                        <h2
                                            className="text-2xl font-black bg-gradient-to-r from-synthux-orange to-synthux-yellow bg-clip-text text-transparent tracking-tighter uppercase cursor-text hover:opacity-80 transition-opacity"
                                            onDoubleClick={(e) => {
                                                e.stopPropagation();
                                                setRenameValue(slot.name);
                                                setIsRenaming(true);
                                            }}
                                            title="Double click to rename"
                                        >
                                            {slot.name}
                                        </h2>
                                    )}
                                </div>
                                <div className="text-xs font-bold text-gray-500 tracking-widest uppercase flex items-center gap-2">
                                    <span>Waveform Editor</span>
                                    <span className="w-1 h-1 bg-gray-600 rounded-full"></span>
                                    <span className={isDirty ? "text-amber-500" : "text-gray-600"}>
                                        {isDirty ? "Unsaved Changes" : "All Saved"}
                                    </span>
                                </div>
                                <div className="text-[10px] text-gray-500 max-w-sm mt-1 leading-[1.2]">
                                    Note: Edits save to this slot's history. The original file is not altered until export.
                                </div>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-full transition-colors">✕</button>
                    </div>

                    {/* Editor Helpers */}

                    <div className="p-6 pt-2 flex flex-col h-full overflow-hidden">
                        {/* Toolbar Container */}
                        <div className="flex flex-col mb-4 bg-[#111] relative z-20 p-4 rounded-xl border border-gray-800 shrink-0 max-w-full">

                            {/* Top Bar: Label + Buttons + Reset */}
                            <div className="flex items-center gap-4 w-full">
                                {/* Label */}
                                <div className="flex items-center gap-3 text-[10px] font-bold uppercase text-gray-500 tracking-wider shrink-0 whitespace-nowrap"
                                    onMouseEnter={() => setHelpText("Global Edit Controls")}
                                    onMouseLeave={() => setHelpText("")}>
                                    <Sliders size={12} className="text-gray-500" /> Main Controls
                                </div>

                                <div className="h-6 w-px bg-gray-800/50 shrink-0"></div>

                                {/* Tool Buttons - Scrollable if needed */}
                                <div className="flex-1 flex items-center gap-1 overflow-x-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent py-1">
                                    {[
                                        { 
                                            id: 'trim' as const, label: 'Trim/Fade', icon: <Scissors size={13} />, color: 'green', activeColor: 'bg-synthux-green', textColor: 'text-synthux-green', 
                                            hasContent: isTrimDirty
                                        },
                                        { 
                                            id: 'automation' as const, label: 'Automation', icon: <Activity size={13} />, color: 'orange', activeColor: 'bg-orange-500', textColor: 'text-orange-400', 
                                            hasContent: isAutomationDirty
                                        },
                                        { 
                                            id: 'loop' as const, label: 'Loop', icon: <Repeat size={13} />, color: 'blue', activeColor: 'bg-synthux-blue', textColor: 'text-synthux-blue', 
                                            hasContent: false // Loops are immediately applied
                                        },
                                        { 
                                            id: 'eq' as const, label: 'EQ', icon: <BarChart2 size={13} />, color: 'purple', activeColor: 'bg-purple-500', textColor: 'text-purple-400', 
                                            hasContent: isEqDirty
                                        },
                                        { 
                                            id: 'pitch' as const, label: 'Pitch', icon: <Music size={13} />, color: 'blue', activeColor: 'bg-synthux-blue', textColor: 'text-synthux-blue', 
                                            hasContent: isPitchDirty
                                        },
                                        { 
                                            id: 'limiter' as const, label: 'Limiter', icon: <Sliders size={13} />, color: 'red', activeColor: 'bg-red-500', textColor: 'text-red-400', 
                                            hasContent: isLimiterDirty
                                        },
                                        { 
                                            id: 'normalize' as const, label: 'Normalize', icon: <BarChart2 size={13} />, color: 'yellow', activeColor: 'bg-synthux-yellow', textColor: 'text-synthux-yellow', 
                                            hasContent: false // Normalize is immediately applied
                                        },
                                        { 
                                            id: 'cutter' as const, label: 'Cutter', icon: <Scissors size={13} />, color: 'amber', activeColor: 'bg-amber-500', textColor: 'text-amber-400', 
                                            hasContent: isCutterDirty
                                        },
                                        { 
                                            id: 'slicer' as const, label: 'Slicer', icon: <Scissors size={13} className="rotate-90" />, color: 'cyan', activeColor: 'bg-cyan-500', textColor: 'text-cyan-400', 
                                            hasContent: isSlicerDirty
                                        },
                                        { 
                                            id: 'stereo' as const, label: 'Stereo', icon: <ArrowLeftRight size={13} />, color: 'purple', activeColor: 'bg-purple-500', textColor: 'text-purple-400', 
                                            hasContent: false
                                        },
                                    ].map(tool => (
                                        <button
                                            key={tool.id}
                                            onClick={() => toggleTool(tool.id)}
                                            onMouseEnter={() => setHelpText(`${activeTool === tool.id ? 'Close' : 'Open'} ${tool.label}`)}
                                            onMouseLeave={() => setHelpText("")}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap border ${activeTool === tool.id
                                                ? `${tool.activeColor} text-white border-transparent shadow-lg shadow-${tool.color}-500/20`
                                                : tool.hasContent
                                                    ? `bg-gray-800/80 ${tool.textColor} border-gray-700 hover:border-${tool.color}-800`
                                                    : 'bg-gray-800/50 text-gray-500 border-gray-800/50 hover:bg-gray-800 hover:text-gray-300 hover:border-gray-700'
                                                }`}
                                        >
                                            {tool.icon}
                                            {tool.label}
                                            {tool.hasContent && activeTool !== tool.id && (
                                                <span className={`w-1.5 h-1.5 rounded-full ${tool.activeColor} animate-pulse`}></span>
                                            )}
                                        </button>
                                    ))}
                                </div>

                            </div>

                            {/* Expanded Tool Panel */}
                            {activeTool && (
                                <div className="border-t border-gray-800 pt-2 pb-1 mt-1 overflow-x-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">

                                    {/* Trim / Fade Panel */}
                                    {activeTool === 'trim' && (
                                        <div className="flex items-center gap-3 min-w-max">
                                            <div className="flex items-center gap-4 bg-black/40 p-1.5 rounded-lg border border-gray-800">
                                                <div className="flex flex-col gap-1">
                                                    <div className="flex justify-between items-center text-[10px] uppercase font-bold text-gray-500 min-w-[6rem]">
                                                        <label>Fade In</label>
                                                        <span className="text-synthux-green">{fadeIn.toFixed(1)}s</span>
                                                    </div>
                                                    <input
                                                        type="range" min="0" max="5" step="0.1" value={fadeIn}
                                                        onChange={(e) => { setFadeIn(Number(e.target.value)); handleDirtyChange(); }}
                                                        onMouseEnter={() => setHelpText("Adjust Fade In Duration")}
                                                        onMouseLeave={() => setHelpText("")}
                                                        className="w-24 h-2 bg-gradient-to-r from-green-900 to-synthux-green rounded-lg appearance-none cursor-pointer"
                                                    />
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                    <div className="flex justify-between items-center text-[10px] uppercase font-bold text-gray-500 min-w-[6rem]">
                                                        <label>Fade Out</label>
                                                        <span className="text-synthux-orange">{fadeOut.toFixed(1)}s</span>
                                                    </div>
                                                    <input
                                                        type="range" min="0" max="5" step="0.1" value={fadeOut}
                                                        onChange={(e) => { setFadeOut(Number(e.target.value)); handleDirtyChange(); }}
                                                        onMouseEnter={() => setHelpText("Adjust Fade Out Duration")}
                                                        onMouseLeave={() => setHelpText("")}
                                                        className="w-24 h-2 bg-gradient-to-r from-synthux-orange to-red-900 rounded-lg appearance-none cursor-pointer"
                                                    />
                                                </div>
                                            </div>

                                            <div className="h-6 w-px bg-gray-800"></div>

                                            <div className="flex items-center gap-2">
                                                {(() => {
                                                    const duration = regionState.end - regionState.start;
                                                    const isFullSelection = Math.abs(duration - editorDuration) < 0.05;
                                                    const hasFades = fadeIn > 0 || fadeOut > 0;
                                                    const isDisabled = isProcessing || (isFullSelection && !hasFades) || hasTrimmed;
                                                    const buttonText = hasFades ? "Apply Trim / Fade" : "Apply Trim";

                                                    return (
                                                        <button
                                                            onClick={() => {
                                                                if (wavesurfer.current && isPlaying) {
                                                                    wavesurfer.current.pause();
                                                                    setIsPlaying(false);
                                                                }
                                                                handleSave();
                                                            }}
                                                            disabled={isDisabled}
                                                            className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-colors border ${isDisabled
                                                                ? 'bg-gray-900 border-gray-800 text-gray-600 cursor-not-allowed opacity-50'
                                                                : 'bg-gray-800 hover:bg-gray-700 border-gray-700 text-green-400 hover:text-green-300 hover:border-green-800'
                                                                }`}
                                                        >
                                                            <Check size={12} /> {buttonText}
                                                        </button>
                                                    )
                                                })()}
                                                <button onClick={() => { setFadeIn(0); setFadeOut(0); if (originalBuffer) setRegionState({ start: 0, end: originalBuffer.duration }); handleDirtyChange(); }}
                                                    disabled={!isTrimDirty}
                                                    className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-colors ${!isTrimDirty ? 'opacity-50 cursor-not-allowed bg-gray-900 text-gray-600 border border-gray-800' : 'bg-gray-800 hover:bg-red-900/50 text-red-400 border border-transparent hover:border-red-900/30'}`}
                                                    onMouseEnter={() => setHelpText("Reset Trim & Fades")}
                                                    onMouseLeave={() => setHelpText("")}
                                                ><RotateCcw size={12} /> Reset Tool</button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Normalize Panel */}
                                    {activeTool === 'normalize' && (
                                        <div className="flex items-center gap-3 min-w-max">
                                            <div className="bg-black/40 px-3 py-1.5 rounded-lg border border-gray-800 flex items-center gap-4">
                                                <div className="flex flex-col">
                                                    <div className="text-[10px] uppercase font-bold text-gray-500">Target Peak</div>
                                                    <div className="flex items-center gap-1.5 mt-1">
                                                        {[
                                                            { label: '-1 dB', value: -1 },
                                                            { label: '0 dB', value: 0 },
                                                            { label: 'Custom', value: 'custom' }
                                                        ].map(opt => (
                                                            <button
                                                                key={opt.label}
                                                                onClick={() => setNormalizationLevel(opt.value === 'custom' ? -6 : opt.value as number)}
                                                                className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${(opt.value === 'custom' ? ![-1, 0].includes(normalizationLevel) : normalizationLevel === opt.value)
                                                                    ? 'bg-yellow-500 text-black'
                                                                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                                                                    }`}
                                                            >
                                                                {opt.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>

                                                {![-1, 0].includes(normalizationLevel) && (
                                                    <div className="flex flex-col gap-1 min-w-[6rem] border-l border-gray-800 pl-4 ml-1">
                                                        <div className="flex justify-between items-center text-[10px] uppercase font-bold text-gray-500">
                                                            <span>Level</span>
                                                            <span className="text-yellow-500">{normalizationLevel}dB</span>
                                                        </div>
                                                        <input
                                                            type="range" min="-24" max="0" step="0.5"
                                                            value={normalizationLevel}
                                                            onChange={(e) => setNormalizationLevel(Number(e.target.value))}
                                                            className="w-24 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-yellow-500"
                                                        />
                                                    </div>
                                                )}
                                            </div>

                                            <div className="h-6 w-px bg-gray-800"></div>

                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => handleApplyNormalization(normalizationLevel)}
                                                    disabled={isProcessing || hasNormalized}
                                                    className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-colors border ${hasNormalized ? 'bg-gray-900 border-gray-800 text-gray-600 cursor-not-allowed opacity-50' : 'bg-gray-800 hover:bg-gray-700 border-gray-700 text-yellow-400 hover:text-yellow-300 hover:border-yellow-800'
                                                        }`}
                                                >
                                                    <BarChart2 size={12} /> {hasNormalized ? "Normalized" : "Normalize"}
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Volume Automation Panel */}
                                    {activeTool === 'automation' && (
                                        <div className="flex items-center gap-3 min-w-max">
                                            {/* Point Volume Controls */}
                                            <div className="flex items-center gap-4 bg-black/40 p-1.5 rounded-lg border border-gray-800">
                                                <div className="flex flex-col gap-1 min-w-[8rem]">
                                                    <div className="flex justify-between items-center text-[10px] uppercase font-bold text-gray-500">
                                                        <span>Point Volume</span>
                                                        {(() => {
                                                            const selected = automationPoints.filter(p => p.selected);
                                                            if (selected.length === 0) return <span className="text-gray-600">-</span>;
                                                            const val = selected[0].value;
                                                            const db = val > 0 ? 20 * Math.log10(val) : -Infinity;
                                                            const dbStr = db === -Infinity ? '-∞' : db.toFixed(1);
                                                            return (
                                                                <span className={val > 1 ? "text-green-400" : val < 1 ? "text-red-400" : "text-gray-400"}>
                                                                    {dbStr} dB
                                                                </span>
                                                            );
                                                        })()}
                                                    </div>
                                                    <input
                                                        type="range" min="0" max="3.981" step="0.01"
                                                        disabled={!automationPoints.some(p => p.selected)}
                                                        value={(() => {
                                                            const selected = automationPoints.filter(p => p.selected);
                                                            return selected.length > 0 ? selected[0].value : 1.0;
                                                        })()}
                                                        onChange={(e) => {
                                                            const newVal = Number(e.target.value);
                                                            setAutomationPoints(automationPoints.map(p => p.selected ? { ...p, value: newVal } : p));
                                                            handleDirtyChange();
                                                        }}
                                                        onDoubleClick={() => {
                                                            setAutomationPoints(automationPoints.map(p => p.selected ? { ...p, value: 1.0 } : p));
                                                            handleDirtyChange();
                                                        }}
                                                        onMouseEnter={() => setHelpText("Adjust Selected Point Value (DBL-Click to Reset)")}
                                                        onMouseLeave={() => setHelpText("")}
                                                        className={`w-32 h-2 rounded-lg appearance-none cursor-pointer ${automationPoints.some(p => p.selected) ? 'bg-gray-700 accent-synthux-orange' : 'bg-gray-800 opacity-50 cursor-not-allowed'}`}
                                                    />
                                                </div>

                                                {/* Point action buttons */}
                                                <div className="flex items-center gap-1">
                                                    {(() => {
                                                        const hasPointAtPlayhead = automationPoints.some(p => Math.abs(p.time - currentTime) < 0.001);
                                                        return (
                                                            <button onClick={() => {
                                                                if (hasPointAtPlayhead) return;
                                                                const id = `pt-${Date.now()}`;
                                                                setAutomationPoints(prev => [
                                                                    ...prev.map(p => ({ ...p, selected: false })),
                                                                    { id, time: currentTime, value: 1.0, selected: true }
                                                                ]);
                                                                handleDirtyChange();
                                                            }}
                                                                title={hasPointAtPlayhead ? "Already Added" : "add point at playhead"}
                                                                disabled={hasPointAtPlayhead}
                                                                className={`p-1.5 rounded transition-colors ${hasPointAtPlayhead ? 'bg-gray-800 text-gray-600 cursor-not-allowed opacity-50' : 'bg-gray-800 hover:bg-synthux-orange text-gray-400 hover:text-white'}`}
                                                                onMouseEnter={() => setHelpText(hasPointAtPlayhead ? "Already Added" : "Add Point at Playhead")}
                                                                onMouseLeave={() => setHelpText("")}
                                                            ><PlusCircle size={14} /></button>
                                                        );
                                                    })()}

                                                    <button onClick={() => {
                                                        setAutomationPoints(automationPoints.filter(p => !p.selected || p.id === 'start' || p.id === 'end'));
                                                        handleDirtyChange();
                                                    }}
                                                        className="p-1.5 rounded bg-gray-800 hover:bg-red-600 text-gray-400 hover:text-white transition-colors"
                                                        onMouseEnter={() => setHelpText("Delete Selected Points")}
                                                        onMouseLeave={() => setHelpText("")}
                                                    ><Trash2 size={14} /></button>

                                                    <button onClick={() => setSmooth(!smooth)}
                                                        className={`p-1.5 rounded transition-colors ${smooth ? 'bg-synthux-orange text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                                                        onMouseEnter={() => setHelpText(smooth ? "Disable Smooth Curves" : "Enable Smooth Curves")}
                                                        onMouseLeave={() => setHelpText("")}
                                                    ><Activity size={14} /></button>
                                                </div>
                                            </div>

                                            <div className="h-6 w-px bg-gray-800"></div>

                                            <div className="flex items-center gap-3 bg-black/40 p-2 rounded-lg border border-gray-800">
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="checkbox"
                                                        id="automation-normalize"
                                                        checked={automationNormalize}
                                                        onChange={(e) => setAutomationNormalize(e.target.checked)}
                                                        className="w-3 h-3 accent-synthux-yellow"
                                                    />
                                                    <label htmlFor="automation-normalize" className="text-[10px] font-bold uppercase text-gray-500 cursor-pointer select-none">
                                                        Normalize
                                                    </label>
                                                </div>
                                            </div>

                                            <div className="h-6 w-px bg-gray-800"></div>

                                            {/* Scale Help Text & Toggle */}
                                            <div className="flex items-center gap-3 bg-black/40 px-3 py-1.5 rounded-lg border border-gray-800 group relative">
                                                <div className="flex flex-col">
                                                    <div className="text-[9px] uppercase font-bold text-gray-500 leading-tight">Scale Info</div>
                                                    <div className="text-[10px] text-gray-400 leading-tight max-w-[120px]">
                                                        Left scale is Volume. Right is Waveform.
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => setShowDbScale(!showDbScale)}
                                                    className={`px-2 py-1 rounded text-[9px] font-bold uppercase transition-colors border ${showDbScale
                                                        ? 'bg-synthux-yellow/10 border-synthux-yellow/30 text-synthux-yellow hover:bg-synthux-yellow/20'
                                                        : 'bg-gray-800 border-gray-700 text-gray-500 hover:text-gray-300'
                                                        }`}
                                                >
                                                    {showDbScale ? "Hide Waveform Scale" : "Show Waveform Scale"}
                                                </button>
                                            </div>

                                            <div className="h-6 w-px bg-gray-800"></div>

                                            {/* Automation Actions */}
                                            <div className="flex items-center gap-2">
                                                <button onClick={handlePreviewAutomation}
                                                    className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-colors ${isPreviewing ? 'bg-synthux-blue text-white hover:bg-red-500' : 'bg-gray-800 hover:bg-synthux-blue text-white'}`}
                                                    onMouseEnter={() => setHelpText(isPreviewing ? "Refresh Preview" : "Hear Automation Effect")}
                                                    onMouseLeave={() => setHelpText("")}
                                                >
                                                    {isPreviewing ? <RefreshCw size={12} /> : <Play size={12} />}
                                                    {isPreviewing ? "Refresh" : "Preview"}
                                                </button>
                                                <button onClick={handleApplyAutomation}
                                                    className="flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider bg-gray-800 hover:bg-green-600 text-green-400 hover:text-white border border-green-900/50 transition-colors"
                                                    onMouseEnter={() => setHelpText("Apply Changes & Bake Audio")}
                                                    onMouseLeave={() => setHelpText("")}
                                                ><Check size={12} /> Apply</button>
                                                <button onClick={handleResetAutomation}
                                                    disabled={!isAutomationDirty}
                                                    className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-colors ${!isAutomationDirty ? 'opacity-50 cursor-not-allowed bg-gray-900 text-gray-600 border border-gray-800' : 'bg-gray-800 hover:bg-red-900/50 text-red-400 border border-transparent hover:border-red-900/30'}`}
                                                    onMouseEnter={() => setHelpText("Clear All Automation")}
                                                    onMouseLeave={() => setHelpText("")}
                                                ><RotateCcw size={12} /> Reset Tool</button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Loop Settings Panel */}
                                    {activeTool === 'loop' && (
                                        <div className="flex items-center gap-3 min-w-max">
                                            <div className="flex items-center gap-4 bg-black/40 p-1.5 rounded-lg border border-gray-800">
                                                <div className="flex flex-col gap-1 min-w-[12rem]">
                                                    {(() => {
                                                        const dur = regionState.end - regionState.start;
                                                        const maxCrossfade = Math.min(10, dur / 2);
                                                        const safeValue = Math.min(loopCrossfade, maxCrossfade);
                                                        return (
                                                            <>
                                                                <div className="flex justify-between items-center text-[10px] uppercase font-bold text-gray-500">
                                                                    <span>Loop Crossfade</span>
                                                                    <span className="text-synthux-blue">{safeValue.toFixed(2)}s <span className="text-gray-600">/ {maxCrossfade.toFixed(2)}s</span></span>
                                                                </div>
                                                                <input
                                                                    type="range" min="0" max={maxCrossfade} step="0.01" value={safeValue}
                                                                    onChange={(e) => { setLoopCrossfade(Number(e.target.value)); handleDirtyChange(); }}
                                                                    onDoubleClick={() => { setLoopCrossfade(0.2); handleDirtyChange(); }}
                                                                    onMouseEnter={() => setHelpText("Set Loop Crossfade Duration (DBL-Click to Reset)")}
                                                                    onMouseLeave={() => setHelpText("")}
                                                                    className="w-40 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-400"
                                                                />
                                                            </>
                                                        );
                                                    })()}
                                                </div>
                                            </div>

                                            <div className="h-6 w-px bg-gray-800"></div>

                                            <div className="flex items-center gap-2">
                                                <button onClick={handlePreviewLoop}
                                                    className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-colors ${isPreviewingLoop ? 'bg-synthux-blue text-white hover:bg-red-500' : 'bg-gray-800 hover:bg-synthux-blue text-white'}`}
                                                    onMouseEnter={() => setHelpText(isPreviewingLoop ? "Refresh Loop Preview" : "Preview Loop")}
                                                    onMouseLeave={() => setHelpText("")}
                                                >
                                                    {isPreviewingLoop ? <RefreshCw size={12} /> : <Play size={12} />}
                                                    {isPreviewingLoop ? "Refresh" : "Preview"}
                                                </button>
                                                <button onClick={handleApplyLoop}
                                                    className="flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider bg-gray-800 hover:bg-green-600 text-green-400 hover:text-white border border-green-900/50 transition-colors"
                                                    onMouseEnter={() => setHelpText("Apply Loop Crossfade")}
                                                    onMouseLeave={() => setHelpText("")}
                                                ><Check size={12} /> Apply</button>
                                                <button onClick={() => {
                                                    if (isPreviewingLoop && wavesurfer.current && currentBlob) {
                                                        wavesurfer.current.loadBlob(currentBlob);
                                                        setIsPreviewingLoop(false);
                                                    }
                                                    setLoopCrossfade(0.2);
                                                    handleDirtyChange();
                                                }}
                                                    disabled={loopCrossfade === 0.2}
                                                    className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-colors ${loopCrossfade === 0.2 ? 'opacity-50 cursor-not-allowed bg-gray-900 text-gray-600 border border-gray-800' : 'bg-gray-800 hover:bg-red-900/50 text-red-400 border border-transparent hover:border-red-900/30'}`}
                                                    onMouseEnter={() => setHelpText("Reset Loop Settings")}
                                                    onMouseLeave={() => setHelpText("")}
                                                ><RotateCcw size={12} /> Reset Tool</button>
                                            </div>
                                        </div>
                                    )}

                                    {/* EQ Panel */}
                                    {activeTool === 'eq' && (
                                        <div className="flex items-center gap-3 min-w-max">
                                            <div className="flex items-center gap-4 bg-black/40 p-1.5 rounded-lg border border-gray-800">
                                                {isAdvancedEQ ? (
                                                    <div className="flex items-center gap-3 px-2">
                                                        <div className="flex flex-col gap-0.5">
                                                            <div className="text-[10px] uppercase font-bold text-gray-500">Advanced EQ</div>
                                                            <div className="text-[9px] text-purple-400 font-bold uppercase tracking-widest animate-pulse">10-Band Mode Active</div>
                                                        </div>
                                                        <button
                                                            onClick={() => setShowAdvancedEQModal(true)}
                                                            className="px-2 py-1 bg-purple-900/40 hover:bg-purple-800/60 border border-purple-700/50 rounded text-[9px] font-bold text-purple-300 uppercase tracking-widest transition-colors flex items-center gap-1.5"
                                                        >
                                                            <Sliders size={10} /> Open Sliders
                                                        </button>
                                                    </div>
                                                ) : (
                                                    [
                                                        { label: 'Low', value: eqLow, setter: setEqLow, hint: 'Low Shelf (300Hz)' },
                                                        { label: 'Mid', value: eqMid, setter: setEqMid, hint: 'Mid Peak (1kHz)' },
                                                        { label: 'High', value: eqHigh, setter: setEqHigh, hint: 'High Shelf (4kHz)' },
                                                    ].map(band => (
                                                        <div key={band.label} className="flex flex-col gap-1 min-w-[5rem]">
                                                            <div className="flex justify-between items-center text-[10px] uppercase font-bold text-gray-500">
                                                                <label>{band.label}</label>
                                                                <span className={band.value > 0 ? "text-green-400" : band.value < 0 ? "text-red-400" : "text-gray-500"}>
                                                                    {band.value > 0 ? '+' : ''}{band.value}dB
                                                                </span>
                                                            </div>
                                                            <input
                                                                type="range" min="-12" max="12" step="0.5" value={band.value}
                                                                onChange={(e) => { band.setter(Number(e.target.value)); handleDirtyChange(); }}
                                                                onDoubleClick={() => { band.setter(0); handleDirtyChange(); }}
                                                                onMouseEnter={() => setHelpText(`${band.hint} (DBL-Click to Reset)`)}
                                                                onMouseLeave={() => setHelpText("")}
                                                                className="w-20 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-400"
                                                            />
                                                        </div>
                                                    ))
                                                )}

                                                {!isAdvancedEQ && (
                                                    <button
                                                        onClick={() => setEqNormalize(!eqNormalize)}
                                                        className={`flex flex-col items-center gap-0.5 group px-2 border-l border-gray-800 ml-1 ${eqNormalize ? 'text-synthux-green' : 'text-gray-500'}`}
                                                        onMouseEnter={() => setHelpText("Normalize before EQ")}
                                                        onMouseLeave={() => setHelpText("")}
                                                    >
                                                        <div className="text-[8px] uppercase font-bold group-hover:text-synthux-green transition-colors">Norm</div>
                                                        <div className={`p-1 rounded ${eqNormalize ? 'bg-synthux-green/20' : 'bg-gray-800'} transition-colors`}>
                                                            <Maximize2 size={12} />
                                                        </div>
                                                    </button>
                                                )}

                                                {!isAdvancedEQ && (
                                                    <div className="h-6 w-px bg-gray-800 mx-1"></div>
                                                )}

                                                {!isAdvancedEQ && (
                                                    <button
                                                        onClick={() => {
                                                            setIsAdvancedEQ(true);
                                                            setShowAdvancedEQModal(true);
                                                        }}
                                                        className="flex flex-col items-center gap-0.5 group px-2"
                                                        onMouseEnter={() => setHelpText("Open 10-Band Advanced EQ")}
                                                        onMouseLeave={() => setHelpText("")}
                                                    >
                                                        <div className="text-[8px] uppercase font-bold text-gray-600 group-hover:text-purple-400">Advanced</div>
                                                        <div className="p-1 rounded bg-gray-800 group-hover:bg-purple-900/40 text-gray-500 group-hover:text-purple-400 transition-colors">
                                                            <Maximize2 size={12} />
                                                        </div>
                                                    </button>
                                                )}
                                            </div>

                                            <div className="h-6 w-px bg-gray-800"></div>

                                            <div className="flex items-center gap-2">
                                                <button onClick={handlePreviewEQ}
                                                    disabled={!isAdvancedEQ && eqLow === 0 && eqMid === 0 && eqHigh === 0}
                                                    className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-colors ${isPreviewingEQ ? 'bg-purple-500 text-white hover:bg-red-500' : (!isAdvancedEQ && eqLow === 0 && eqMid === 0 && eqHigh === 0) ? 'bg-gray-900 text-gray-600 cursor-not-allowed' : 'bg-gray-800 hover:bg-purple-500 text-white'}`}
                                                    onMouseEnter={() => setHelpText(isPreviewingEQ ? "Refresh Preview" : "Hear EQ Effect")}
                                                    onMouseLeave={() => setHelpText("")}
                                                >
                                                    {isPreviewingEQ ? <RefreshCw size={12} /> : <Play size={12} />}
                                                    {isPreviewingEQ ? "Refresh" : "Preview"}
                                                </button>
                                                <button onClick={handleApplyEQ}
                                                    disabled={!isAdvancedEQ && eqLow === 0 && eqMid === 0 && eqHigh === 0}
                                                    className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-colors border ${(!isAdvancedEQ && eqLow === 0 && eqMid === 0 && eqHigh === 0) ? 'bg-gray-900 border-gray-800 text-gray-600 cursor-not-allowed' : 'bg-gray-800 hover:bg-green-600 text-green-400 hover:text-white border-green-900/50'}`}
                                                    onMouseEnter={() => setHelpText("Apply EQ & Create Version")}
                                                    onMouseLeave={() => setHelpText("")}
                                                ><Check size={12} /> Apply</button>
                                                <button onClick={handleResetEQ}
                                                    disabled={!isEqDirty}
                                                    className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-colors ${!isEqDirty ? 'opacity-50 cursor-not-allowed bg-gray-900 text-gray-600 border border-gray-800' : 'bg-gray-800 hover:bg-red-900/50 text-red-400 border border-transparent hover:border-red-900/30'}`}
                                                    onMouseEnter={() => setHelpText("Reset EQ Settings")}
                                                    onMouseLeave={() => setHelpText("")}
                                                ><RotateCcw size={12} /> Reset Tool</button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Limiter Panel */}
                                    {activeTool === 'limiter' && (
                                        <div className="flex items-center gap-3 min-w-max">
                                            <div className="flex items-center gap-1 bg-black/40 p-1 rounded-lg border border-gray-800">
                                                <button
                                                    onClick={() => setLimiterMode('compressor')}
                                                    className={`px-2 py-1 rounded text-[10px] font-bold uppercase transition-colors ${limiterMode === 'compressor' ? 'bg-red-500 text-white' : 'text-gray-500 hover:bg-gray-800'}`}
                                                    onMouseEnter={() => setHelpText("Auto Limiter: Acts like an upward compressor, pushing volume up towards the ceiling.")}
                                                    onMouseLeave={() => setHelpText("")}
                                                >Auto</button>
                                                <button
                                                    onClick={() => setLimiterMode('peak')}
                                                    className={`px-2 py-1 rounded text-[10px] font-bold uppercase transition-colors ${limiterMode === 'peak' ? 'bg-red-500 text-white' : 'text-gray-500 hover:bg-gray-800'}`}
                                                    onMouseEnter={() => setHelpText("Peak Limiter: Cuts off any volume over the threshold. No makeup gain.")}
                                                    onMouseLeave={() => setHelpText("")}
                                                >Peak</button>
                                            </div>

                                            <div className="flex items-center gap-4 bg-black/40 p-1.5 rounded-lg border border-gray-800">
                                                <div className="flex flex-col gap-1 min-w-[7rem]">
                                                    <div className="flex justify-between items-center text-[10px] uppercase font-bold text-gray-500">
                                                        <label>{limiterMode === 'peak' ? 'Limit' : 'Threshold'}</label>
                                                        <span className="text-red-400">{limiterThreshold}dB</span>
                                                    </div>
                                                    <input type="range" min="-24" max="0" step="0.5" value={limiterThreshold}
                                                        onChange={(e) => { setLimiterThreshold(Number(e.target.value)); handleDirtyChange(); }}
                                                        onDoubleClick={() => { setLimiterThreshold(-6); handleDirtyChange(); }}
                                                        onMouseEnter={() => setHelpText(limiterMode === 'peak' ? "Peak Threshold (DBL-Click to Reset)" : "Limiter Threshold (DBL-Click to Reset)")}
                                                        onMouseLeave={() => setHelpText("")}
                                                        className="w-24 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-red-400"
                                                    />
                                                </div>

                                                {limiterMode === 'compressor' && (
                                                    <div className="flex flex-col gap-1 min-w-[7rem]">
                                                        <div className="flex justify-between items-center text-[10px] uppercase font-bold text-gray-500">
                                                            <label>Ceiling</label>
                                                            <span className="text-red-400">{limiterCeiling.toFixed(1)}dB</span>
                                                        </div>
                                                        <input type="range" min="-3" max="0" step="0.1" value={limiterCeiling}
                                                            onChange={(e) => { setLimiterCeiling(Number(e.target.value)); handleDirtyChange(); }}
                                                            onDoubleClick={() => { setLimiterCeiling(-0.3); handleDirtyChange(); }}
                                                            onMouseEnter={() => setHelpText("Limiter Output Ceiling (DBL-Click to Reset)")}
                                                            onMouseLeave={() => setHelpText("")}
                                                            className="w-24 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-red-400"
                                                        />
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <button onClick={handlePreviewLimiter}
                                                    className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-colors ${isPreviewingLimiter ? 'bg-red-500 text-white hover:bg-gray-800' : 'bg-gray-800 hover:bg-red-500 text-white'}`}
                                                    onMouseEnter={() => setHelpText(isPreviewingLimiter ? "Stop Preview" : "Hear Limiter Effect")}
                                                    onMouseLeave={() => setHelpText("")}
                                                >
                                                    {isPreviewingLimiter ? <Pause size={12} /> : <Play size={12} />}
                                                    {isPreviewingLimiter ? "Stop" : "Preview"}
                                                </button>
                                                <button onClick={handleApplyLimiter}
                                                    className="flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider bg-gray-800 hover:bg-green-600 text-green-400 hover:text-white transition-colors border border-green-900/50"
                                                    onMouseEnter={() => setHelpText("Apply Limiter & Create Version")}
                                                    onMouseLeave={() => setHelpText("")}
                                                ><Check size={12} /> Apply</button>
                                                <button onClick={() => { setLimiterThreshold(-6); setLimiterCeiling(-0.3); if (isPreviewingLimiter && wavesurfer.current && currentBlob) { wavesurfer.current.loadBlob(currentBlob); setIsPreviewingLimiter(false); } handleDirtyChange(); }}
                                                    disabled={!isLimiterDirty}
                                                    className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-colors ${!isLimiterDirty ? 'opacity-50 cursor-not-allowed bg-gray-900 text-gray-600 border border-gray-800' : 'bg-gray-800 hover:bg-red-900/50 text-red-400 border border-transparent hover:border-red-900/30'}`}
                                                    onMouseEnter={() => setHelpText("Reset Limiter Settings")}
                                                    onMouseLeave={() => setHelpText("")}
                                                ><RotateCcw size={12} /> Reset Tool</button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Cutter Panel */}
                                    {activeTool === 'cutter' && (
                                        <div className="flex items-center gap-3 min-w-max">
                                            <div className="flex items-center gap-4 bg-black/40 p-1.5 rounded-lg border border-gray-800">
                                                <div className="flex flex-col gap-0.5 min-w-[6rem]">
                                                    <div className="text-[10px] uppercase font-bold text-gray-500">Regions</div>
                                                    <div className="text-xs font-bold text-amber-400">
                                                        {cutRegions.length} cut{cutRegions.length !== 1 ? 's' : ''}
                                                        {cutRegions.length > 0 && (
                                                            <span className="text-gray-500 ml-1">(-{cutRegions.reduce((s, r) => s + (r.end - r.start), 0).toFixed(2)}s)</span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex flex-col gap-1 min-w-[6rem]">
                                                    <div className="flex justify-between items-center text-[10px] uppercase font-bold text-gray-500">
                                                        <label>Crossfade</label>
                                                        <span className="text-amber-400">{(cutCrossfade * 1000).toFixed(0)}ms</span>
                                                    </div>
                                                    <input type="range" min="0" max="0.1" step="0.001" value={cutCrossfade}
                                                        onChange={(e) => setCutCrossfade(Number(e.target.value))}
                                                        onDoubleClick={() => setCutCrossfade(0.01)}
                                                        onMouseEnter={() => setHelpText("Crossfade at cut seams (DBL-Click to Reset)")}
                                                        onMouseLeave={() => setHelpText("")}
                                                        className="w-20 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-amber-400"
                                                    />
                                                </div>
                                                <div className="text-[9px] text-gray-600 max-w-[100px] leading-tight">
                                                    Double-click waveform to add. Drag edges.
                                                </div>
                                            </div>

                                            <div className="h-6 w-px bg-gray-800"></div>

                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => {
                                                        if (isPreviewingCut && currentBlob && wavesurfer.current) {
                                                            wavesurfer.current.loadBlob(currentBlob);
                                                            setIsPreviewingCut(false);
                                                        } else {
                                                            handlePreviewCut();
                                                        }
                                                    }}
                                                    disabled={cutRegions.length === 0}
                                                    className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-colors ${isPreviewingCut ? 'bg-amber-500 text-white hover:bg-amber-600' : cutRegions.length === 0 ? 'bg-gray-900 text-gray-600 cursor-not-allowed' : 'bg-gray-800 hover:bg-amber-500 text-white'}`}
                                                    onMouseEnter={() => setHelpText(isPreviewingCut ? "Return to editing cuts" : "Hear Result After Cuts")}
                                                    onMouseLeave={() => setHelpText("")}
                                                >
                                                    {isPreviewingCut ? <Scissors size={12} /> : <Play size={12} />}
                                                    {isPreviewingCut ? "Tweak Cuts" : "Preview"}
                                                </button>
                                                <button onClick={handleApplyCut} disabled={cutRegions.length === 0}
                                                    className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-colors border ${cutRegions.length === 0 ? 'bg-gray-900 border-gray-800 text-gray-600 cursor-not-allowed' : 'bg-gray-800 hover:bg-green-600 text-green-400 hover:text-white border-green-900/50'}`}
                                                    onMouseEnter={() => setHelpText("Apply Cuts & Create Version")}
                                                    onMouseLeave={() => setHelpText("")}
                                                ><Check size={12} /> Apply</button>
                                                <button onClick={() => { setCutRegions([]); setCutCrossfade(0.01); if (isPreviewingCut && wavesurfer.current && currentBlob) { wavesurfer.current.loadBlob(currentBlob); setIsPreviewingCut(false); } handleDirtyChange(); }}
                                                    disabled={!isCutterDirty}
                                                    className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-colors ${!isCutterDirty ? 'opacity-50 cursor-not-allowed bg-gray-900 text-gray-600 border border-gray-800' : 'bg-gray-800 hover:bg-red-900/50 text-red-400 border border-transparent hover:border-red-900/30'}`}
                                                    onMouseEnter={() => setHelpText("Clear All Cut Regions")}
                                                    onMouseLeave={() => setHelpText("")}
                                                ><RotateCcw size={12} /> Reset Tool</button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Slicer Panel */}
                                    {activeTool === 'slicer' && (
                                        <div className="flex flex-col gap-2 min-w-max">
                                            {/* Row 1: Inspector & Primary Actions */}
                                            <div className="flex items-center gap-3">
                                                {/* Active Slice Inspector */}
                                                <div className="flex items-center gap-3 bg-black/40 p-1.5 rounded-lg border border-gray-800">
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            onClick={() => setActiveSliceIdx(Math.max(0, activeSliceIdx - 1))}
                                                            disabled={activeSliceIdx === 0}
                                                            className="p-1 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-400 hover:text-white transition-colors"
                                                        >
                                                            <ChevronDown size={14} className="rotate-90" />
                                                        </button>
                                                        <div className="flex flex-col gap-0.5 min-w-[3.5rem] items-center">
                                                            <div className="text-[10px] uppercase font-bold text-gray-500">Slice</div>
                                                            <div className="text-xs font-bold text-cyan-400">{activeSliceIdx + 1}</div>
                                                        </div>
                                                        <button
                                                            onClick={() => setActiveSliceIdx(Math.min(slicePoints.length, activeSliceIdx + 1))}
                                                            disabled={activeSliceIdx === slicePoints.length}
                                                            className="p-1 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-400 hover:text-white transition-colors"
                                                        >
                                                            <ChevronDown size={14} className="-rotate-90" />
                                                        </button>
                                                    </div>

                                                    <button
                                                        onClick={handlePlaySlice}
                                                        className="flex items-center justify-center w-8 h-8 rounded-full bg-cyan-900/40 hover:bg-cyan-600 text-cyan-400 hover:text-white border border-cyan-500/30 transition-colors"
                                                        title="Play Slice"
                                                    >
                                                        <Play size={14} className="ml-0.5" />
                                                    </button>

                                                    <div className="flex items-center gap-4 ml-2">
                                                        {/* Start Marker */}
                                                        <div className="flex flex-col gap-0.5 text-center">
                                                            <div className="text-[9px] uppercase font-bold text-gray-500">
                                                                {activeSliceIdx === 0 ? 'Start' : `M${activeSliceIdx}`}
                                                            </div>
                                                            <div className="flex items-center gap-1">
                                                                {activeSliceIdx === 0 ? (
                                                                    <div className="text-xs font-bold text-gray-400 w-12 bg-gray-900/50 rounded py-0.5 text-center">0.000</div>
                                                                ) : (
                                                                    <>
                                                                        <input
                                                                            type="text"
                                                                            value={slicePoints[activeSliceIdx - 1]?.toFixed(3) || ''}
                                                                            onChange={(e) => handleSliceMarkerChange(activeSliceIdx - 1, parseFloat(e.target.value))}
                                                                            className="w-12 text-center bg-gray-800 text-cyan-400 text-xs font-bold py-0.5 rounded focus:outline-none focus:ring-1 focus:ring-cyan-500"
                                                                        />
                                                                        <button
                                                                            onClick={() => handleRemoveSliceMarker(activeSliceIdx - 1)}
                                                                            onMouseEnter={() => setHoveredMarkerIdx(activeSliceIdx - 1)}
                                                                            onMouseLeave={() => setHoveredMarkerIdx(null)}
                                                                            className="p-1 rounded hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition-colors"
                                                                            title="Remove Marker"
                                                                        >
                                                                            <X size={10} />
                                                                        </button>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <span className="text-gray-600 text-xs font-bold">-</span>
                                                        {/* End Marker */}
                                                        <div className="flex flex-col gap-0.5 text-center">
                                                            <div className="text-[9px] uppercase font-bold text-gray-500">
                                                                {activeSliceIdx === slicePoints.length ? 'End' : `M${activeSliceIdx + 1}`}
                                                            </div>
                                                            <div className="flex items-center gap-1">
                                                                {activeSliceIdx === slicePoints.length ? (
                                                                    <div className="text-xs font-bold text-gray-400 w-12 bg-gray-900/50 rounded py-0.5 text-center">{editorDuration.toFixed(3)}</div>
                                                                ) : (
                                                                    <>
                                                                        <input
                                                                            type="text"
                                                                            value={slicePoints[activeSliceIdx]?.toFixed(3) || ''}
                                                                            onChange={(e) => handleSliceMarkerChange(activeSliceIdx, parseFloat(e.target.value))}
                                                                            className="w-12 text-center bg-gray-800 text-cyan-400 text-xs font-bold py-0.5 rounded focus:outline-none focus:ring-1 focus:ring-cyan-500"
                                                                        />
                                                                        <button
                                                                            onClick={() => handleRemoveSliceMarker(activeSliceIdx)}
                                                                            onMouseEnter={() => setHoveredMarkerIdx(activeSliceIdx)}
                                                                            onMouseLeave={() => setHoveredMarkerIdx(null)}
                                                                            className="p-1 rounded hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition-colors"
                                                                            title="Remove Marker"
                                                                        >
                                                                            <X size={10} />
                                                                        </button>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="h-6 w-px bg-gray-800 mx-1"></div>

                                                <div className="flex items-center gap-1 bg-black/40 p-1.5 rounded-lg border border-gray-800">
                                                    <button 
                                                        onClick={() => setIsSlicerLocked(!isSlicerLocked)}
                                                        className={`p-1.5 rounded transition-colors ${isSlicerLocked ? 'bg-red-900/40 text-red-500 hover:text-red-400' : 'bg-gray-800 text-gray-500 hover:text-gray-300'}`}
                                                        title={isSlicerLocked ? "Unlock Slices" : "Lock Slices"}
                                                    >
                                                        {isSlicerLocked ? <Lock size={12} /> : <Unlock size={12} />}
                                                    </button>
                                                    <button 
                                                        onClick={() => setShowGlobalSlices(!showGlobalSlices)}
                                                        className={`p-1.5 rounded transition-colors ${showGlobalSlices ? 'bg-blue-900/40 text-blue-400 hover:text-blue-300' : 'bg-gray-800 text-gray-500 hover:text-gray-300'}`}
                                                        title="Show Slices in All Tools"
                                                    >
                                                        {showGlobalSlices ? <Eye size={12} /> : <EyeOff size={12} />}
                                                    </button>
                                                    <button 
                                                        onClick={() => setSnapToSlices(!snapToSlices)}
                                                        className={`p-1.5 rounded transition-colors ${snapToSlices ? 'bg-synthux-blue/40 text-synthux-blue hover:text-blue-400' : 'bg-gray-800 text-gray-500 hover:text-gray-300'}`}
                                                        title="Snap Edits to Slices"
                                                    >
                                                        <Magnet size={12} />
                                                    </button>
                                                </div>

                                                <div className="h-6 w-px bg-gray-800 mx-1"></div>

                                                <div className="flex items-center gap-2">
                                                    <button onClick={handleApplySlicer}
                                                        className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-colors border ${JSON.stringify([...slicePoints].sort()) === JSON.stringify([...initialSlicePoints].sort())
                                                            ? 'bg-gray-800 hover:bg-gray-700 text-gray-400 border-gray-700/50'
                                                            : 'bg-green-900/40 hover:bg-green-600 text-green-400 hover:text-white border-green-500/30'
                                                            }`}
                                                        onMouseEnter={() => setHelpText("Save Slice Markers to Metadata")}
                                                        onMouseLeave={() => setHelpText("")}
                                                    >
                                                        <Check size={12} />
                                                        Save to File
                                                        {JSON.stringify([...slicePoints].sort()) !== JSON.stringify([...initialSlicePoints].sort()) && (
                                                            <span className="text-[8px] opacity-70 ml-1">(not saved)</span>
                                                        )}
                                                    </button>

                                                    <button onClick={() => { setSlicePoints(initialSlicePoints || []); setTempo(initialTempo); handleDirtyChange(); }}
                                                        disabled={!isSlicerDirty}
                                                        className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-colors ${!isSlicerDirty ? 'opacity-50 cursor-not-allowed bg-gray-900 text-gray-600 border border-gray-800' : 'bg-gray-800 hover:bg-red-900/50 text-red-400 border border-transparent hover:border-red-900/30'}`}
                                                        onMouseEnter={() => setHelpText("Revert to file's original slices")}
                                                        onMouseLeave={() => setHelpText("")}
                                                    ><RotateCcw size={12} /> Reset Tool</button>

                                                    <button onClick={handleClearAllSlices}
                                                        className="flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider bg-gray-800 hover:bg-red-900/50 text-red-400 transition-colors"
                                                        onMouseEnter={() => setHelpText("Remove All Slice Markers")}
                                                        onMouseLeave={() => setHelpText("")}
                                                    ><Trash2 size={12} /> Remove All</button>
                                                </div>
                                            </div>

                                            {/* Row 2: Generation & Formatting */}
                                            <div className="flex items-center gap-3">
                                                <div className="flex items-center gap-4 bg-black/40 p-1.5 rounded-lg border border-gray-800">
                                                    <div className="flex flex-col gap-0.5 min-w-[5rem]">
                                                        <div className="text-[10px] uppercase font-bold text-gray-500">Markers</div>
                                                        <div className="text-xs font-bold text-cyan-400">{slicePoints.length} / 32</div>
                                                    </div>

                                                    <div className="h-6 w-px bg-gray-800"></div>

                                                    <BpmInput value={tempo} onChange={setTempo} />

                                                    <div className="h-6 w-px bg-gray-800"></div>

                                                    <div className="flex items-center gap-1">
                                                        <div className="text-[9px] uppercase font-bold text-gray-600 mr-2">Auto-Slice:</div>
                                                        {[4, 8, 16, 32].map(n => (
                                                            <button key={n} onClick={() => handleAutoSlice(n - 1)}
                                                                className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${slicePoints.length === n - 1 ? 'bg-cyan-600 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white'}`}
                                                                onMouseEnter={() => setHelpText(`Auto-divide into ${n} slices`)}
                                                                onMouseLeave={() => setHelpText("")}
                                                            >{n}</button>
                                                        ))}
                                                        <div className="flex items-center gap-1 pl-2 ml-1 border-l border-gray-700">
                                                            <input
                                                                type="number"
                                                                min="1" max="32"
                                                                value={customSliceCount}
                                                                onChange={(e) => setCustomSliceCount(Math.min(32, Math.max(1, parseInt(e.target.value) || 1)))}
                                                                className="w-10 bg-gray-900 border border-gray-700 text-cyan-400 text-[10px] font-bold py-1 px-1 rounded text-center focus:outline-none focus:border-cyan-500"
                                                            />
                                                            <button
                                                                onClick={() => handleAutoSlice(customSliceCount - 1)}
                                                                className="px-2 py-1 rounded text-[10px] font-bold bg-gray-800 hover:bg-cyan-600 text-cyan-400 hover:text-white transition-colors"
                                                                onMouseEnter={() => setHelpText(`Auto-divide into ${customSliceCount} slices`)}
                                                                onMouseLeave={() => setHelpText("")}
                                                            >
                                                                Slice
                                                            </button>
                                                        </div>
                                                    </div>

                                                    <div className="h-6 w-px bg-gray-800 mx-2"></div>

                                                    <button
                                                        onClick={() => setShowKeyboardMapModal(true)}
                                                        className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold bg-gray-800 hover:bg-gray-700 text-gray-400 transition-colors"
                                                        onMouseEnter={() => setHelpText("View Keyboard Map")}
                                                        onMouseLeave={() => setHelpText("")}
                                                    >
                                                        <Keyboard size={12} /> Map
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    {/* Pitch Panel */}
                                    {activeTool === 'pitch' && (
                                        <div className="flex items-center gap-3 min-w-max">
                                            <div className="flex items-center gap-4 bg-black/40 p-1.5 rounded-lg border border-gray-800">
                                                <div className="flex flex-col gap-0.5 min-w-[7rem]">
                                                    <div className="text-[10px] uppercase font-bold text-gray-500">Semitones</div>
                                                    <div className="text-xs font-bold text-synthux-blue">
                                                        {pitchSemitones > 0 ? '+' : ''}{pitchSemitones} ST
                                                    </div>
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                    <input type="range" min="-12" max="12" step="1" value={pitchSemitones}
                                                        onChange={(e) => handlePitchSliderChange(parseInt(e.target.value))}
                                                        onDoubleClick={() => setPitchSemitones(0)}
                                                        onMouseEnter={() => setHelpText("Pitch Shift in Semitones (DBL-Click to Reset)")}
                                                        onMouseLeave={() => setHelpText("")}
                                                        className="w-32 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-synthux-blue"
                                                    />
                                                </div>
                                                <div className="text-[9px] text-gray-600 max-w-[100px] leading-tight">
                                                    Shift pitch up/down. Detection uses current region.
                                                </div>
                                            </div>

                                            <div className="h-6 w-px bg-gray-800"></div>

                                            <div className="flex items-center gap-2">
                                                <button onClick={handleSelectAllPitch} disabled={isPreviewing}
                                                    className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-colors ${isPreviewing ? 'bg-gray-900 text-gray-700 cursor-not-allowed' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'}`}
                                                    onMouseEnter={() => setHelpText("Select entire waveform for pitching")}
                                                    onMouseLeave={() => setHelpText("")}
                                                >
                                                    <Maximize2 size={12} /> All
                                                </button>

                                                <div className="h-4 w-px bg-gray-700 mx-1"></div>

                                                <button onClick={isPreviewing ? handleResetPitch : handlePreviewPitch} disabled={isProcessing || (pitchRegions.length === 0 && !isPreviewing)}
                                                    className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-colors ${isProcessing || (pitchRegions.length === 0 && !isPreviewing) ? 'bg-gray-900 text-gray-700 cursor-not-allowed' : (isPreviewing ? 'bg-synthux-blue text-white hover:bg-red-500' : 'bg-gray-800 hover:bg-synthux-blue text-white')}`}
                                                    onMouseEnter={() => setHelpText(isPreviewing ? "Stop Preview & Restore Selections" : "Preview pitch changes")}
                                                    onMouseLeave={() => setHelpText("")}
                                                >
                                                    {isPreviewing ? <Pause size={12} /> : <Play size={12} />}
                                                    {isPreviewing ? "Stop" : "Preview"}
                                                </button>

                                                <button onClick={handleApplyPitch} disabled={pitchRegions.length === 0 || isProcessing}
                                                    className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-all border ${pitchRegions.length === 0 || isProcessing ? 'bg-gray-900 border-gray-800 text-gray-700 cursor-not-allowed' : 'bg-synthux-blue/20 hover:bg-synthux-blue text-synthux-blue hover:text-white border-synthux-blue/30'}`}
                                                    onMouseEnter={() => setHelpText("Apply all pitch tunings to file")}
                                                    onMouseLeave={() => setHelpText("")}
                                                >
                                                    <Check size={12} /> Apply
                                                </button>

                                                <button onClick={() => { setPitchRegions([]); setPitchSemitones(0); if (isPreviewing) handleResetPitch(); handleDirtyChange(); }}
                                                    disabled={!isPitchDirty}
                                                    className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-colors ${!isPitchDirty ? 'opacity-50 cursor-not-allowed bg-gray-900 text-gray-600 border border-gray-800' : 'bg-gray-800 hover:bg-red-900/50 text-red-400 border border-transparent hover:border-red-900/30'}`}
                                                    onMouseEnter={() => setHelpText("Reset Pitch Tool")}
                                                    onMouseLeave={() => setHelpText("")}
                                                ><RotateCcw size={12} /> Reset Tool</button>


                                                <div className="h-4 w-px bg-gray-700 mx-1"></div>

                                                <button onClick={handleDetectPitch} disabled={isProcessing || isPreviewing}
                                                    className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-colors ${isProcessing || isPreviewing ? 'bg-gray-900 text-gray-700 cursor-not-allowed' : 'bg-gray-800 hover:bg-synthux-blue hover:text-white text-gray-400'}`}
                                                    onMouseEnter={() => setHelpText("Detect pitch of selected region")}
                                                    onMouseLeave={() => setHelpText("")}
                                                >
                                                    <Activity size={12} className={isProcessing ? 'animate-pulse' : ''} />
                                                    {detectedPitch ? `${detectedPitch.toFixed(1)} Hz` : 'Detect'}
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Stereo Panel */}
                                    {activeTool === 'stereo' && (
                                        <div className="flex items-center gap-3 min-w-max">
                                            <div className="flex items-center gap-4 bg-black/40 p-1.5 rounded-lg border border-gray-800">
                                                <div className="flex flex-col gap-0.5 min-w-[7rem]">
                                                    <div className="text-[10px] uppercase font-bold text-gray-500">Channels</div>
                                                    <div className="text-xs font-bold text-purple-400">
                                                        {originalBuffer?.numberOfChannels || 1} Channel(s)
                                                    </div>
                                                </div>
                                                <div className="text-[9px] text-gray-600 max-w-[150px] leading-tight">
                                                    Split stereo into mono versions or keep specific sides.
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => setStereoSplitView(!stereoSplitView)}
                                                    disabled={!originalBuffer || originalBuffer.numberOfChannels <= 1}
                                                    className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-all border ${!originalBuffer || originalBuffer.numberOfChannels <= 1
                                                        ? 'bg-gray-900 border-gray-800 text-gray-700 cursor-not-allowed'
                                                        : stereoSplitView
                                                            ? 'bg-synthux-blue/20 border-synthux-blue text-synthux-blue shadow-lg shadow-blue-500/10'
                                                            : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-300'
                                                        }`}
                                                    onMouseEnter={() => setHelpText(stereoSplitView ? "Superimpose channels (Merged View)" : "Split channels vertically (Stacked View)")}
                                                    onMouseLeave={() => setHelpText("")}
                                                >
                                                    {stereoSplitView ? <Maximize2 size={12} /> : <Minimize2 size={12} />}
                                                    {stereoSplitView ? "STACKED" : "MERGED"}
                                                </button>
                                            </div>

                                            <div className="h-6 w-px bg-gray-800"></div>


                                            <div className="flex items-center gap-2">
                                                <button onClick={() => handleSplitStereo('L')}
                                                    className="flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider bg-[#00A3FF]/20 border border-[#00A3FF]/30 text-[#00A3FF] hover:bg-[#00A3FF] hover:text-white transition-all shadow-lg shadow-blue-500/10"
                                                    onMouseEnter={() => setHelpText("Save Left Channel to Pool")}
                                                    onMouseLeave={() => setHelpText("")}
                                                >L</button>
                                                <button onClick={() => handleSplitStereo('R')}
                                                    disabled={originalBuffer?.numberOfChannels === 1}
                                                    className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-all border ${originalBuffer?.numberOfChannels === 1
                                                        ? 'bg-gray-900 border-gray-800 text-gray-700 cursor-not-allowed'
                                                        : 'bg-[#FFB900]/20 border border-[#FFB900]/30 text-[#FFB900] hover:bg-[#FFB900] hover:text-black shadow-lg shadow-yellow-500/10'
                                                        }`}
                                                    onMouseEnter={() => setHelpText("Save Right Channel to Pool")}
                                                    onMouseLeave={() => setHelpText("")}
                                                >R</button>
                                                <button onClick={() => handleSplitStereo('both')}
                                                    disabled={originalBuffer?.numberOfChannels === 1}
                                                    className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-colors border ${originalBuffer?.numberOfChannels === 1 ? 'bg-gray-900 border-gray-800 text-gray-700 cursor-not-allowed' : 'bg-gray-800 hover:bg-green-600 text-green-400 hover:text-white border-green-900/50'}`}
                                                    onMouseEnter={() => setHelpText("Save Both Channels Separately")}
                                                    onMouseLeave={() => setHelpText("")}
                                                ><Check size={12} /> Split Both</button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Hover Help Text */}

                        <div className="absolute top-[88px] left-6 text-[10px] text-synthux-blue font-mono tracking-widest uppercase pointer-events-none transition-opacity duration-200">
                            {helpText || "Ready"}
                        </div>

                        {/* Editor Container - SCROLLABLE WINDOW */}
                        {/* Parent: Flex-1 to take available space. Centered content. */}
                        <div className="flex-1 bg-[#111] border-y border-gray-800 relative z-20 flex flex-col justify-center overflow-hidden min-h-[350px] min-w-0 max-w-full">

                            {/* Scroll Area Wrapper - This handles the overflow-x */}
                            <div
                                ref={scrollContainerRef}
                                className="w-full h-full overflow-x-auto overflow-y-hidden editor-scroll"
                                style={{ userSelect: 'none' }}
                                onWheel={handleWheel}
                                onScroll={handleEditorScroll}
                            >

                                {/* Fixed Height Content Strip with Ruler */}
                                <div className="relative my-auto top-1/2 -translate-y-1/2 flex flex-col" style={{ width: contentWidth }}>

                                    {/* Playhead Ruler - Always visible seeking */}
                                    <PlayheadRuler
                                        duration={editorDuration}
                                        currentTime={currentTime}
                                        points={automationPoints}
                                        onSeek={(t) => {
                                            if (wavesurfer.current) wavesurfer.current.seekTo(t / editorDuration);
                                        }}
                                        onPointsChange={(pts) => {
                                            setAutomationPoints(pts);
                                            handleDirtyChange();
                                        }}
                                        className="w-full z-30"
                                    />

                                    {/* Waveform Area */}
                                    <div className="relative" style={{ height: 256 }}>
                                        {/* WaveSurfer Sticky Window */}
                                        <div
                                            className="sticky left-0 h-full z-0 overflow-hidden pointer-events-none"
                                            style={{ width: viewportWidth }}
                                        >
                                            {/* dB Scale Background Overlay - Now inside sticky window with viewportWidth */}
                                            {showDbScale && <DbScale width={viewportWidth} height={256} vZoom={vZoom} />}

                                            <div
                                                ref={containerRef}
                                                className="w-full h-full bg-black/20 cursor-text touch-none pointer-events-auto"
                                                onPointerDown={handleWaveformPointerDown}
                                                onPointerMove={handleWaveformPointerMove}
                                                onPointerUp={handleWaveformPointerUp}
                                                onPointerLeave={handleWaveformPointerUp}
                                            />
                                        </div>

                                        {/* Automation Overlay (New) */}
                                        <AutomationOverlay
                                            points={automationPoints}
                                            duration={editorDuration}
                                            width={contentWidth}
                                            height={256}
                                            active={activeTool === 'automation'}
                                            onPointsChange={(pts) => {
                                                setAutomationPoints(pts);
                                                handleDirtyChange();
                                                // Auto-enable panel if adding points
                                                if (pts.length > 0 && activeTool !== 'automation') {
                                                    setActiveTool('automation');
                                                }
                                            }}
                                            onSeek={(t) => {
                                                if (wavesurfer.current) wavesurfer.current.setTime(t);
                                            }}
                                            smooth={smooth}
                                            snapPoints={slicePoints}
                                            snapToSlices={snapToSlices}
                                        />

                                        {/* Cutter Overlay */}
                                        <CutterOverlay
                                            regions={cutRegions}
                                            duration={editorDuration}
                                            width={contentWidth}
                                            height={256}
                                            onRegionsChange={(updated) => {
                                                setCutRegions(updated);
                                                handleDirtyChange();
                                            }}
                                            active={activeTool === 'cutter'}
                                            isPreviewing={isPreviewingCut}
                                            snapPoints={slicePoints}
                                            snapToSlices={snapToSlices}
                                        />

                                        {/* Slicer Overlay */}
                                        <SlicerOverlay
                                            points={slicePoints}
                                            duration={editorDuration}
                                            width={contentWidth}
                                            height={256}
                                            maxSlices={100}
                                            onPointsChange={(points) => {
                                                setSlicePoints(points);
                                                handleDirtyChange();
                                            }}
                                            active={activeTool === 'slicer'}
                                            activeSliceIdx={activeSliceIdx}
                                            onActiveSliceChange={setActiveSliceIdx}
                                            hoveredMarkerIdx={hoveredMarkerIdx}
                                            showAlways={showGlobalSlices}
                                            isLocked={isSlicerLocked}
                                        />

                                        {/* Pitch Selection Overlay */}
                                        <PitchOverlay
                                            regions={pitchRegions}
                                            duration={isPreviewing && previewDuration ? previewDuration : editorDuration}
                                            width={contentWidth}
                                            height={256}
                                            onRegionsChange={setPitchRegions}
                                            active={activeTool === 'pitch'}
                                            currentPitch={pitchSemitones}
                                            isPreviewing={isPreviewing && activeTool === 'pitch'}
                                            previewRegions={previewPitchRegions}
                                        />

                                        {/* Limiter Overlay (New) */}
                                        <LimiterOverlay
                                            thresholdDb={limiterThreshold}
                                            onThresholdChange={(db) => {
                                                setLimiterThreshold(db);
                                                handleDirtyChange();
                                            }}
                                            width={contentWidth}
                                            height={256}
                                            vZoom={vZoom}
                                            active={activeTool === 'limiter' && limiterMode === 'peak'}
                                        />

                                        {/* Fade Overlay - PLACED LAST FOR MAX Z-INDEX PRIORITY */}
                                        {activeTool === 'trim' && editorDuration > 0 && (
                                            <div className="absolute inset-0 z-50 pointer-events-none" style={{ width: contentWidth, height: 256 }}>
                                                <FadeOverlay
                                                    width={contentWidth}
                                                    height={256}
                                                    fadeIn={fadeIn}
                                                    fadeOut={fadeOut}
                                                    duration={editorDuration}
                                                    region={regionState}
                                                    active={activeTool === 'trim'}
                                                    onFadeChange={(type, duration) => {
                                                        if (activeTool !== 'trim') return;
                                                        const rounded = Math.round(duration * 100) / 100;
                                                        if (type === 'in') setFadeIn(rounded);
                                                        else setFadeOut(rounded);
                                                        if (hasTrimmed) setHasTrimmed(false);
                                                        handleDirtyChange();
                                                    }}
                                                    onRegionChange={(start, end) => {
                                                        if (activeTool !== 'trim') return;
                                                        const regionList = regions.current?.getRegions();
                                                        if (regionList && regionList.length > 0) {
                                                            regionList[0].setOptions({ start, end });
                                                        }
                                                        setRegionState({ start, end });
                                                        if (hasTrimmed) setHasTrimmed(false);
                                                    }}
                                                />
                                            </div>
                                        )}
                                        {/* Center Line Visual */}
                                        <div className="absolute inset-0 pointer-events-none border-t border-b border-dashed border-gray-700/30 top-1/2 -translate-y-1/2 h-0 z-0"></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* VIEW TOOLBAR (Zoom & 42s) - Fixed Bottom of Editor Area */}
                        <div className="flex items-center justify-between px-6 py-2 bg-[#111] border-t border-gray-800 shrink-0 gap-4">

                            {/* 42s Status (Left) */}
                            <div className="flex-1 flex justify-start">
                                {(() => {
                                    const duration = regionState.end - regionState.start;
                                    const isTrimOverLimit = duration > 42.01;
                                    const isFileOverLimit = editorDuration > 42.01;

                                    // Always show if it's a long file OR we're in the trim tool
                                    const showStatus = isFileOverLimit || activeTool === 'trim';

                                    // Explicitly safe if we are in the trim tool and within limit
                                    const isSafe = activeTool === 'trim' && !isTrimOverLimit;

                                    // Show warning if the TRIM is over 42s OR if the FILE is over 42s (but we're not in the "safe" trim view)
                                    const showWarning = isTrimOverLimit || (isFileOverLimit && activeTool !== 'trim');

                                    if (!showStatus) return null;

                                    return (
                                        <div className="flex items-center gap-4">
                                            <div className={`text-xs font-bold uppercase tracking-widest flex items-center gap-2 ${showWarning ? 'text-red-500' : isSafe ? 'text-green-500' : 'text-gray-500'}`}>
                                                {showWarning && <span>⚠️</span>}
                                                {isSafe && <span>✅</span>}
                                                <span>Trim: {duration.toFixed(2)}s</span>
                                                {isSafe && <span className="text-[10px] normal-case opacity-80">(Safe)</span>}
                                                {isFileOverLimit && !isTrimOverLimit && activeTool !== 'trim' && <span className="text-[10px] normal-case opacity-80">(File: {editorDuration.toFixed(2)}s)</span>}
                                                {isTrimOverLimit && <span className="text-[10px] normal-case opacity-80">(Max 42s)</span>}
                                            </div>
                                            {activeTool === 'trim' && (
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
                                                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-all border ${isTrimOverLimit
                                                        ? 'bg-red-900/30 hover:bg-red-900/50 border-red-500/50 text-red-200'
                                                        : 'bg-gray-800 hover:bg-gray-700 border-gray-600 text-gray-400 hover:text-white'
                                                        }`}
                                                >
                                                    Set 42s
                                                </button>
                                            )}
                                        </div>
                                    )
                                })()}
                            </div>

                            {/* Zoom Controls (Right) */}
                            <div className="flex items-center gap-2">
                                {/* Vertical Zoom (Visual Gain) */}
                                <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-900/50 rounded-lg border border-gray-800/50 mr-1" title="Vertical Zoom (Amplitude)">
                                    <Activity size={12} className="text-gray-500" />
                                    <input
                                        type="range"
                                        min="0.5"
                                        max="15"
                                        step="0.1"
                                        value={vZoom}
                                        onChange={(e) => setVZoom(Number(e.target.value))}
                                        onDoubleClick={() => setVZoom(1.0)}
                                        onMouseEnter={() => setHelpText("Vertical Zoom / Gain (DBL-Click to Reset)")}
                                        onMouseLeave={() => setHelpText("")}
                                        className="w-[150px] h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-synthux-blue"
                                    />
                                    <button
                                        onClick={() => setVZoom(1.0)}
                                        className="p-1 hover:bg-gray-800 rounded text-gray-400 hover:text-white transition-colors ml-1"
                                        title="Fit Vertically"
                                    >
                                        <Maximize2 size={12} />
                                    </button>
                                </div>

                                <button
                                    onClick={() => setShowDbScale(!showDbScale)}
                                    className={`mr-2 flex items-center gap-1 transition-all ${showDbScale ? 'text-synthux-yellow opacity-100' : 'text-gray-500 opacity-50'}`}
                                    title={showDbScale ? "Hide dB Scale" : "Show dB Scale"}
                                    onMouseEnter={() => setHelpText(showDbScale ? "Hide dB Scale Overlay" : "Show dB Scale Overlay")}
                                    onMouseLeave={() => setHelpText("")}
                                >
                                    <Eye size={14} />
                                </button>
                                <button onClick={handleFitView} className="px-2 py-1 hover:bg-gray-800 rounded text-[10px] font-bold uppercase text-gray-400 hover:text-white flex items-center gap-1 border border-transparent hover:border-gray-700 transition-all" title="Fit All">
                                    <ArrowLeftRight size={14} /> Fit View
                                </button>
                                <button onClick={handleFitTrim} className="px-2 py-1 hover:bg-gray-800 rounded text-[10px] font-bold uppercase text-gray-400 hover:text-white flex items-center gap-1 border border-transparent hover:border-gray-700 transition-all" title="Fit Trim">
                                    <Scissors size={14} /> Fit Trim
                                </button>
                                <div className="w-px h-4 bg-gray-700 mx-2"></div>
                                <button onClick={handleZoomOut} disabled={zoom <= (minZoom * 1.001)} className={`p-1 hover:bg-gray-800 rounded text-gray-400 hover:text-white ${zoom <= (minZoom * 1.001) ? 'opacity-30' : ''}`}><ZoomOut size={16} /></button>
                                <input
                                    type="range" min={minZoom || 0.1} max="1000" step="0.1" value={zoom}
                                    onChange={(e) => setZoomCentered(Number(e.target.value))}
                                    onDoubleClick={() => setZoomCentered(minZoom)}
                                    className="w-[150px] h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                                />
                                <button onClick={handleZoomIn} className="p-1 hover:bg-gray-800 rounded text-gray-400 hover:text-white"><ZoomIn size={16} /></button>
                            </div>
                        </div>

                        {/* Playback Controls - FIXED at bottom (outside scroll) */}
                        <div className="flex flex-col shrink-0 border-t border-gray-800 bg-[#1a1a1a] z-50 transition-all duration-200">



                            <div className="flex justify-center gap-4 pb-4 pt-2">
                                <button
                                    onClick={() => {
                                        const newLooping = !isLooping;
                                        setIsLooping(newLooping);

                                        // Only set region loop if TRIM TOOL is active
                                        if (activeTool === 'trim' && regions.current) {
                                            const list = regions.current.getRegions();
                                            const trimRegion = list.find((r: any) => r.id === 'trim-region');
                                            if (trimRegion) {
                                                trimRegion.setOptions({ loop: newLooping });
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
                                    className="flex items-center gap-2 px-6 h-12 bg-gray-800 hover:bg-gray-700 rounded-full text-base font-bold transition-all hover:scale-105 active:scale-95 shadow-lg shadow-black/50"
                                >
                                    {isPlaying ? <Pause fill="white" size={18} /> : <Play fill="white" size={18} />}
                                    {isPlaying ? 'PAUSE' : 'PLAY'}
                                </button>
                                <div title={!isDirty && loadedVersionId === activeVersionId ? "File is assigned and up to date" : "Bake changes and assign to tape"}>
                                    <button
                                        onClick={() => {
                                            if (!isDirty && loadedVersionId !== activeVersionId && onAssignVersion) {
                                                onAssignVersion(loadedVersionId);
                                            } else {
                                                if (wavesurfer.current && isPlaying) {
                                                    wavesurfer.current.pause();
                                                    setIsPlaying(false);
                                                }
                                                handleSave();
                                            }
                                        }}
                                        disabled={isProcessing}
                                        className={`flex items-center gap-2 px-6 h-12 rounded-full text-base font-bold transition-all shadow-lg ${
                                            isProcessing 
                                                ? 'bg-gray-800 text-gray-500 cursor-not-allowed shadow-none'
                                                : (!isDirty && loadedVersionId === activeVersionId)
                                                    ? 'bg-green-600/90 hover:bg-green-600 text-white shadow-green-900/40'
                                                    : 'bg-synthux-blue hover:bg-blue-500 text-white hover:scale-105 active:scale-95 shadow-synthux-blue/20'
                                        }`}
                                    >
                                        {isProcessing ? <RefreshCw className="animate-spin" size={18} /> : (!isDirty && loadedVersionId === activeVersionId) ? <Check size={18} /> : <Save size={18} />}
                                        {isProcessing ? 'SAVING...' : (!isDirty && loadedVersionId === activeVersionId) ? 'ASSIGNED' : 'ASSIGN TO TAPE'}
                                    </button>
                                </div>

                                <button
                                    onClick={onClose}
                                    className={`flex items-center gap-2 px-6 h-12 rounded-full text-base font-bold transition-all shadow-lg border ${
                                        isDirty 
                                            ? 'bg-gray-800 hover:bg-gray-700 text-gray-500 border-transparent hover:border-gray-500' 
                                            : (!isDirty && (loadedVersionId === activeVersionId || activeVersionId === (versions?.[0]?.id || '')))
                                                ? 'bg-green-600 hover:bg-green-500 text-white border-transparent hover:scale-105 active:scale-95 shadow-green-900/50'
                                                : 'bg-gray-800 hover:bg-gray-700 text-gray-400 border-transparent hover:border-gray-500'
                                    }`}
                                    title={isDirty ? "Close without saving" : "Close Editor"}
                                >
                                    {(!isDirty && (loadedVersionId === activeVersionId || activeVersionId === (versions?.[0]?.id || ''))) ? <Check size={18} /> : <X size={18} />}
                                    {(!isDirty && (loadedVersionId === activeVersionId || activeVersionId === (versions?.[0]?.id || ''))) ? 'DONE' : 'CLOSE'}
                                </button>

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
                                                const newId = uuidv4();
                                                const newSlicePoints = slicePoints.filter(p => p >= start && p <= end).map(p => p - start);
                                                const meta = { ...(metadata || {}), slicePoints: newSlicePoints, tempo: tempo || undefined, id: newId, processing: processingTags };
                                                const newBlob = encodeWAV(processed, meta);

                                                // 3. Callback
                                                onSaveUnique(newBlob, processed.duration, processingTags, newId);
                                                showToast("Saved as Unique File!", "success");
                                            } catch (e) {
                                                console.error(e);
                                                showToast("Failed to save unique file", "error");
                                            } finally {
                                                setIsProcessing(false);
                                            }
                                        }}
                                        disabled={isProcessing}
                                        className="flex items-center gap-2 px-6 h-12 bg-orange-600 hover:bg-orange-500 rounded-full text-sm font-bold transition-all hover:scale-105 active:scale-95 shadow-lg border border-orange-500 text-white"
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
                                            const newId = uuidv4();
                                            const newSlicePoints = slicePoints.filter(p => p >= start && p <= end).map(p => p - start);
                                            const meta = { ...(metadata || {}), slicePoints: newSlicePoints, tempo: tempo || undefined, id: newId };
                                            const newBlob = encodeWAV(processed, meta);
                                            onSaveAsCopy(newBlob, processed.duration, newId);
                                            showToast("Saved copy to Unused Pool!", "success");
                                        } catch (e) {
                                            console.error(e);
                                            showToast("Failed to save copy", "error");
                                        }
                                        finally { setIsProcessing(false); }
                                    }}
                                    disabled={isProcessing}
                                    className="flex items-center gap-2 px-6 h-12 bg-gray-700 hover:bg-gray-600 rounded-full text-sm font-bold transition-all hover:scale-105 active:scale-95 shadow-lg border border-gray-600 text-gray-300"
                                    title="Save as a new Parked file (Unassigned)"
                                >
                                    <Save size={16} /> SAVE COPY TO POOL
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Advanced EQ Modal */}
            {
                showAdvancedEQModal && (
                    <Rnd
                        size={{ width: 600, height: 400 }}
                        position={advancedEQPos}
                        onDragStop={(_, d) => setAdvancedEQPos({ x: d.x, y: d.y })}
                        minWidth={550}
                        minHeight={350}
                        enableResizing={false}
                        dragHandleClassName="drag-handle"
                        className="z-[100]"
                        bounds="window"
                    >
                        <div className="bg-[#1a1a1a] border border-gray-700 rounded-2xl p-4 w-full h-full shadow-2xl relative overflow-hidden flex flex-col">
                            {/* Background Decoration */}
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500 drag-handle cursor-move"></div>

                            <div className="flex justify-between items-start mb-2 drag-handle cursor-move">
                                <div>
                                    <h3 className="text-xl font-black bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent uppercase tracking-tighter leading-tight">Advanced 10-Band EQ</h3>
                                    <p className="text-gray-400 text-[10px] font-bold uppercase tracking-[0.1em] mt-0.5 flex items-center gap-1.5 focus:outline-none">
                                        <Activity size={12} className="text-purple-500" /> Surgical Frequency Control • ±24dB
                                    </p>
                                </div>
                                <button
                                    onClick={() => setShowAdvancedEQModal(false)}
                                    className="p-1.5 bg-gray-800/50 hover:bg-gray-800 rounded-full transition-colors text-gray-400 hover:text-white pointer-events-auto"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            <div className="flex justify-between items-center h-56 gap-0.5 mb-4 bg-black/40 p-3 rounded-xl border border-gray-800/50 relative">
                                {/* DB Scale Background */}
                                <div className="absolute left-1 inset-y-4 flex flex-col justify-between text-[11px] font-mono text-gray-600 pointer-events-none pr-1 border-r border-gray-800/30">
                                    <span>+24</span>
                                    <span className="text-gray-500">0</span>
                                    <span>-24</span>
                                </div>

                                {ADVANCED_EQ_FREQS.map((freq, i) => (
                                    <div key={freq} className="flex-1 flex flex-col items-center h-full group pointer-events-none">
                                        <div
                                            className="flex-1 w-full flex flex-col items-center relative mb-2 pointer-events-auto cursor-ns-resize"
                                            onPointerDown={(e) => handleSliderPointerDown(i, e)}
                                            onPointerMove={(e) => handleSliderPointerMove(i, e)}
                                            onPointerUp={handleSliderPointerUp}
                                            onPointerLeave={handleSliderPointerUp}
                                        >
                                            {/* Interaction Logic Slider */}
                                            <div className="w-1 h-full bg-gray-900 rounded-full relative overflow-hidden flex flex-col justify-center pointer-events-none">
                                                {/* Track Gradient */}
                                                <div
                                                    className="absolute left-0 right-0 transition-all duration-75 rounded-full"
                                                    style={{
                                                        height: `${Math.abs(advancedEQBands[i]) / 48 * 100}%`,
                                                        bottom: advancedEQBands[i] >= 0 ? '50%' : `${50 - (Math.abs(advancedEQBands[i]) / 48 * 100)}%`,
                                                        backgroundColor: advancedEQBands[i] > 0 ? 'var(--color-synthux-green, #10b981)' : 'var(--color-synthux-orange, #f59e0b)',
                                                        boxShadow: `0 0 10px ${advancedEQBands[i] > 0 ? 'rgba(16, 185, 129, 0.4)' : 'rgba(245, 158, 11, 0.4)'}`
                                                    }}
                                                />
                                                {/* Zero Line */}
                                                <div className="absolute top-1/2 left-0 right-0 h-px bg-gray-700 z-0"></div>
                                            </div>

                                            {/* Custom Handle Visual */}
                                            <div
                                                className="absolute w-4 h-2 bg-white rounded-sm shadow-lg z-20 pointer-events-none transition-all duration-75 border border-gray-400"
                                                style={{
                                                    bottom: `${(advancedEQBands[i] + 24) / 48 * 100}%`,
                                                    transform: 'translateY(50%)'
                                                }}
                                            />
                                        </div>

                                        <div className="text-[11px] font-black text-gray-500 uppercase tracking-tighter group-hover:text-purple-400 transition-colors">
                                            {freq >= 1000 ? `${freq / 1000}k` : freq}
                                        </div>
                                        <div className={`text-[10px] font-mono mt-0.5 font-bold ${advancedEQBands[i] > 0 ? 'text-green-400' : advancedEQBands[i] < 0 ? 'text-red-400' : 'text-gray-600'}`}>
                                            {advancedEQBands[i] > 0 ? '+' : ''}{advancedEQBands[i].toFixed(1)}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="flex flex-col gap-3 mt-auto">
                                <div className="flex justify-between items-center bg-black/20 p-2 rounded-xl border border-white/5">
                                    <div className="flex items-center gap-1.5">
                                        <button
                                            onClick={() => { setIsAdvancedEQ(false); setShowAdvancedEQModal(false); }}
                                            className="px-2.5 py-1.5 bg-gray-800/80 hover:bg-gray-700 text-purple-400 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors border border-purple-500/20 flex items-center gap-1.5"
                                            title="Back to Basic 3-Band EQ"
                                        >
                                            <Minimize2 size={12} /> BASIC
                                        </button>
                                        <button
                                            onClick={() => setEqNormalize(!eqNormalize)}
                                            className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border flex items-center gap-1.5 ${eqNormalize ? 'bg-synthux-green/20 border-synthux-green text-synthux-green shadow-lg shadow-green-900/10' : 'bg-gray-800/80 border-gray-700 text-gray-400 hover:text-gray-300'}`}
                                        >
                                            <Maximize2 size={12} /> NORMALIZE
                                        </button>
                                        <button
                                            onClick={() => { setAdvancedEQBands(new Array(10).fill(0)); handleDirtyChange(); }}
                                            className="px-2.5 py-1.5 bg-gray-800/80 hover:bg-gray-700 text-gray-400 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors border border-gray-700"
                                        >
                                            RESET
                                        </button>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={handlePreviewEQ}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${isPreviewingEQ ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20' : 'bg-gray-800/80 hover:bg-purple-600 text-white border border-gray-700'}`}
                                        >
                                            {isPreviewingEQ ? <RefreshCw size={12} className="animate-spin" /> : <Play size={12} fill="currentColor" />}
                                            PREVIEW
                                        </button>
                                        <button
                                            onClick={() => { handleApplyEQ(); setShowAdvancedEQModal(false); }}
                                            className="flex items-center gap-1.5 px-4 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition-all shadow-lg shadow-green-900/20"
                                        >
                                            <Check size={14} strokeWidth={3} /> APPLY
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Rnd>
                )
            }

            {/* Keyboard Slicer Map Panel */}
            {showKeyboardMapModal && (
                <Rnd
                    size={{ width: 550, height: 320 }}
                    position={keyboardSlicerPos}
                    onDragStop={(_, d) => setKeyboardSlicerPos({ x: d.x, y: d.y })}
                    minWidth={500}
                    minHeight={300}
                    enableResizing={false}
                    dragHandleClassName="drag-handle"
                    className="z-[200]"
                    bounds="window"
                >
                    <KeyboardSlicerModal
                        isOpen={showKeyboardMapModal}
                        onClose={() => setShowKeyboardMapModal(false)}
                        layout={keyboardLayout}
                        onLayoutChange={setKeyboardLayout}
                        onPlaySlice={playSliceByIndex}
                        activeSliceIdx={activeSliceIdx}
                        triggeredSliceIdx={triggeredSliceIdx}
                    />
                </Rnd>
            )}
        </div>
    );
};
