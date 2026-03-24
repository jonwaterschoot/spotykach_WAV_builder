import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Settings, RefreshCw, AlertTriangle, X, Save, Trash2 } from 'lucide-react';
import type { VisualFilters } from '../types';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onResetApp: () => void;
    onResetEmptySlotBrowserPreference: () => void;
    visualFilters: VisualFilters;
    onUpdateVisualFilters: (filters: VisualFilters) => void;
    onSaveVisualSettings: () => void;
    currentProjectName?: string;
    onCleanupProject?: (options?: { removeUnusedFiles: boolean }) => void;
}

const TEXTURES = [
    'highrestexture_tapenoisevhs_whitetrans.png',
    'highrestexture_tapenoisevhs_whitetrans02.png',
    'highrestexture_tapenoisevhs_whitetrans03.png',
    'highrestexture_tapenoisevhs_whitetrans04.png',
    'highrestexture_tapenoisevhs.png',
    'vhs positive GIF by rotomangler.gif',
    'vintage vhs GIF by rotomangler.gif',
    'wavbuilderfullscreen_1.mp4'
];

const DONT_GIFS = [
    'vhs positive GIF by rotomangler.gif',
    'vintage vhs GIF by rotomangler.gif'
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
    isOpen,
    onClose,
    onResetApp,
    onResetEmptySlotBrowserPreference,
    visualFilters,
    onUpdateVisualFilters,
    onSaveVisualSettings,
    currentProjectName,
    onCleanupProject
}) => {
    const [pos, setPos] = useState({ x: -1, y: 64 }); // -1 uses default right:16
    const [isDragging, setIsDragging] = useState(false);
    const [customPresets, setCustomPresets] = useState<Record<string, Partial<VisualFilters>>>(() => {
        try {
            const saved = localStorage.getItem('spotykach_custom_presets');
            return saved ? JSON.parse(saved) : { '1': {}, '2': {}, '3': {} };
        } catch (e) { return { '1': {}, '2': {}, '3': {} }; }
    });
    const dragOffset = useRef({ x: 0, y: 0 });
    const animationFrameRef = useRef<number | null>(null);
    const specialModeRef = useRef<number | null>(null);
    const [activeSpecialMode, setActiveSpecialMode] = useState<'none' | 'crazy' | 'dont'>('none');
    const crazyBaseRef = useRef<VisualFilters | null>(null);
    const resetBtnPlaceholderRef = useRef<HTMLDivElement>(null);
    const [portalPos, setPortalPos] = useState({ top: 0, left: 0, width: 0 });

    // Sync portal position to placeholder
    useLayoutEffect(() => {
        if (!isOpen) return;

        const syncPosition = () => {
            if (resetBtnPlaceholderRef.current) {
                const rect = resetBtnPlaceholderRef.current.getBoundingClientRect();
                setPortalPos({
                    top: rect.top,
                    left: rect.left,
                    width: rect.width
                });
            }
        };

        syncPosition();

        // Update on window resize or scroll
        window.addEventListener('resize', syncPosition);
        window.addEventListener('scroll', syncPosition, true);

        return () => {
            window.removeEventListener('resize', syncPosition);
            window.removeEventListener('scroll', syncPosition, true);
        };
    }, [isOpen, pos, activeSpecialMode]); // Trigger on modal move or special mode changes

    useEffect(() => {
        return () => {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            if (specialModeRef.current) cancelAnimationFrame(specialModeRef.current);
        };
    }, []);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;
            setPos({
                x: e.clientX - dragOffset.current.x,
                y: e.clientY - dragOffset.current.y
            });
        };
        const handleMouseUp = () => {
            setIsDragging(false);
            document.body.style.userSelect = '';
        };

        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            document.body.style.userSelect = 'none';
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            document.body.style.userSelect = '';
        };
    }, [isDragging]);

    const handleMouseDown = (e: React.MouseEvent) => {
        const modal = (e.currentTarget as HTMLElement).closest('.settings-modal-card') as HTMLElement;
        const rect = modal.getBoundingClientRect();
        dragOffset.current = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
        setIsDragging(true);
    };

    const animateFilters = (target: VisualFilters, duration: number = 800) => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
        }

        const start = { ...visualFilters };
        const startTime = performance.now();

        const animate = (currentTime: number) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // easeOutCubic
            const easeProgress = 1 - Math.pow(1 - progress, 3);

            const interpolated: VisualFilters = {
                ...target,
                invert: start.invert + (target.invert - start.invert) * easeProgress,
                grayscale: start.grayscale + (target.grayscale - start.grayscale) * easeProgress,
                contrast: start.contrast + (target.contrast - start.contrast) * easeProgress,
                brightness: start.brightness + (target.brightness - start.brightness) * easeProgress,
                fontSize: start.fontSize + (target.fontSize - start.fontSize) * easeProgress,
                textureOpacity: start.textureOpacity + (target.textureOpacity - start.textureOpacity) * easeProgress,
                textureSize: target.textureSize || start.textureSize || 'cover',
                texturePosition: target.texturePosition || start.texturePosition || 'center'
            };

            onUpdateVisualFilters(interpolated);

            if (progress < 1) {
                animationFrameRef.current = requestAnimationFrame(animate);
            }
        };

        animationFrameRef.current = requestAnimationFrame(animate);
    };

    const handleFilterChange = (key: keyof VisualFilters, value: any) => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
        }
        if (activeSpecialMode !== 'none') setActiveSpecialMode('none');
        let finalValue = value;
        // Special logic for inversion slider jump
        if (key === 'invert' && typeof value === 'number') {
            if (value > 0.4 && value < 0.6) {
                finalValue = value < 0.5 ? 0.4 : 0.6;
            }
        }
        onUpdateVisualFilters({ ...visualFilters, [key]: finalValue });
    };

    const handleResetFilters = () => {
        applyPreset({});
    };

    const applyPreset = (preset: Partial<VisualFilters>) => {
        if (activeSpecialMode !== 'none') setActiveSpecialMode('none');
        animateFilters({
            invert: 0,
            grayscale: 0,
            contrast: 1,
            brightness: 1,
            textureOpacity: 0.05,
            fontSize: visualFilters.fontSize,
            textureImage: 'highrestexture_tapenoisevhs_whitetrans.png',
            textureSize: 'cover',
            texturePosition: 'center',
            ...preset
        });
    };

    const handleRandomize = () => {
        const randomFilters: VisualFilters = {
            invert: Math.random(),
            grayscale: Math.random(),
            contrast: 0.5 + Math.random() * 1.5,
            brightness: 0.5 + Math.random() * 1.5,
            textureOpacity: Math.random() * 0.5,
            fontSize: visualFilters.fontSize,
            textureImage: TEXTURES[Math.floor(Math.random() * TEXTURES.length)],
            textureSize: 'cover',
            texturePosition: 'center'
        };
        applyPreset(randomFilters);
    };

    const toggleCrazyMode = () => {
        if (activeSpecialMode === 'crazy') {
            setActiveSpecialMode('none');
        } else {
            setActiveSpecialMode('crazy');
            crazyBaseRef.current = { ...visualFilters };
        }
    };

    const toggleDontMode = () => {
        if (activeSpecialMode === 'dont') {
            setActiveSpecialMode('none');
        } else {
            setActiveSpecialMode('dont');
        }
    };

    useEffect(() => {
        if (activeSpecialMode === 'none') {
            if (specialModeRef.current) cancelAnimationFrame(specialModeRef.current);
            return;
        }

        let nextDontStep = 0;
        let nextFlickerBurst = 0;
        let flickerBurstEnd = 0;

        const loop = (time: number) => {
            if (activeSpecialMode === 'crazy' && crazyBaseRef.current) {
                const JITTER = 0.05;
                const SPEED = 500;
                const phase = time / SPEED;

                const jitter = (p: number, seed: number) =>
                    (Math.sin(p + seed) * JITTER);

                const pulsed: VisualFilters = {
                    ...crazyBaseRef.current,
                    invert: Math.max(0, Math.min(1, crazyBaseRef.current.invert + jitter(phase, 0))),
                    grayscale: Math.max(0, Math.min(1, crazyBaseRef.current.grayscale + jitter(phase * 0.8, 10))),
                    contrast: Math.max(0.5, Math.min(2, crazyBaseRef.current.contrast + jitter(phase * 0.7, 20))),
                    brightness: Math.max(0.5, Math.min(2, crazyBaseRef.current.brightness + jitter(phase * 0.9, 30))),
                    textureOpacity: Math.max(0, Math.min(0.5, crazyBaseRef.current.textureOpacity + jitter(phase * 0.5, 40))),
                };
                onUpdateVisualFilters(pulsed);
            }

            if (activeSpecialMode === 'dont') {
                const slowPhaseX = time / 5000;
                const slowPhaseY = time / 310000;
                const posX = 50 + Math.sin(slowPhaseX) * 10;
                const posY = 50 + Math.cos(slowPhaseY) * 10;

                if (time > nextDontStep) {
                    const stepDuration = 1500 + Math.random() * 2000; // Much slower opacity changes (was 800-2000)
                    nextDontStep = time + stepDuration;

                    onUpdateVisualFilters({
                        ...visualFilters,
                        textureImage: DONT_GIFS[Math.floor(Math.random() * DONT_GIFS.length)],
                        textureSize: '115% 115%',
                        textureOpacity: 0.05 + Math.random() * 0.1,
                        texturePosition: `${posX}% ${posY}%`
                    });
                } else {
                    let currentOpacity = visualFilters.textureOpacity;
                    let currentGrayscale = visualFilters.grayscale;

                    if (time > nextFlickerBurst) {
                        nextFlickerBurst = time + 2000 + Math.random() * 3000;
                        flickerBurstEnd = time + 200;
                    }

                    if (time < flickerBurstEnd) {
                        currentOpacity += (Math.random() - 0.1) * 0.05;
                        // Fast, jittery desaturation flicker
                        currentGrayscale = Math.random() > 0.5 ? 1 : 0.2;
                    } else {
                        // Reset desaturation when not flickering or use a slow drift?
                        // User said "animate the desaturation faster"
                        currentGrayscale = 0.5 + Math.sin(time / 200) * 0.5; // Fast sine oscillation
                    }

                    onUpdateVisualFilters({
                        ...visualFilters,
                        grayscale: currentGrayscale,
                        texturePosition: `${posX}% ${posY}%`,
                        textureOpacity: Math.max(0.01, Math.min(0.2, currentOpacity))
                    });
                }
            }

            specialModeRef.current = requestAnimationFrame(loop);
        };

        specialModeRef.current = requestAnimationFrame(loop);
        return () => {
            if (specialModeRef.current) cancelAnimationFrame(specialModeRef.current);
        };
    }, [activeSpecialMode, onUpdateVisualFilters, visualFilters]);

    const PRESETS = [
        { name: 'Default', filters: {} },
        { name: 'Contrast', filters: { contrast: 1.4, brightness: 1.1 } },
        { name: 'Inverted', filters: { invert: 1 } },
        { name: 'Ghost', filters: { invert: 0.8, grayscale: 1, contrast: 1.2, brightness: 1.2 } },
        {
            name: 'Old Tape',
            filters: {
                grayscale: 0.3,
                contrast: 1.2,
                textureOpacity: 0.35,
                textureImage: 'highrestexture_tapenoisevhs.png'
            }
        }
    ];

    const handleStoreCustom = (slot: string) => {
        const toSave = { ...visualFilters };
        const updated = { ...customPresets, [slot]: toSave };
        setCustomPresets(updated);
        localStorage.setItem('spotykach_custom_presets', JSON.stringify(updated));
    };

    const resetValue = (key: keyof VisualFilters) => {
        const defaults: VisualFilters = {
            invert: 0,
            grayscale: 0,
            contrast: 1,
            brightness: 1,
            textureOpacity: 0.05,
            fontSize: 1,
            textureImage: 'highrestexture_tapenoisevhs_whitetrans.png',
            textureSize: 'cover',
            texturePosition: 'center'
        };
        animateFilters({
            ...visualFilters,
            [key]: defaults[key]
        }, 800);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] bg-black/5 pointer-events-auto" onClick={onClose}>
            <div
                className="settings-modal-card fixed z-[61] bg-[#121212]/95 w-[320px] rounded-xl border border-white/10 flex flex-col shadow-2xl backdrop-blur-md max-h-[calc(100vh-80px)]"
                style={{
                    top: `${pos.y}px`,
                    left: pos.x !== -1 ? `${pos.x}px` : undefined,
                    right: pos.x === -1 ? '16px' : undefined,
                }}
                onClick={e => e.stopPropagation()}
            >
                <header
                    onMouseDown={handleMouseDown}
                    className="flex items-center justify-between p-3 border-b border-white/10 bg-[#1a1a1a] cursor-grab active:cursor-grabbing shrink-0 select-none"
                >
                    <div className="flex items-center gap-2">
                        <Settings size={16} className="text-gray-400" />
                        <h2 className="text-sm font-bold text-white uppercase tracking-tight">Settings</h2>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-md text-gray-500 hover:text-white transition-colors">
                        <X size={16} />
                    </button>
                </header>

                <div className="p-4 overflow-y-auto space-y-6 scrollbar-thin scrollbar-thumb-white/10">
                    {/* Presets */}
                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Quick Presets</h3>
                            <div className="flex gap-1">
                                <div className="flex gap-1 group/store">
                                    <span className="text-[8px] text-gray-500 font-bold uppercase self-center opacity-0 group-hover/store:opacity-100 transition-opacity mr-1">Store:</span>
                                    {[1, 2, 3].map(slot => (
                                        <button
                                            key={slot}
                                            onClick={() => handleStoreCustom(slot.toString())}
                                            className="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 text-[8px] font-bold text-amber-400 transition-all uppercase tracking-tight"
                                            title={`Store current settings as Custom C${slot}`}
                                        >
                                            S{slot}
                                        </button>
                                    ))}
                                </div>
                                <button
                                    onClick={onSaveVisualSettings}
                                    className="px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 hover:bg-indigo-500/20 text-[9px] font-bold text-indigo-400 transition-all uppercase tracking-tight flex items-center gap-1"
                                    title="Save visual settings to workspace folder"
                                >
                                    <Save size={10} />
                                    Save to Workspace
                                </button>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {PRESETS.map(p => (
                                <button
                                    key={p.name}
                                    onClick={() => applyPreset(p.filters)}
                                    className="px-2 py-1 rounded bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/20 text-[10px] font-bold text-gray-300 transition-all uppercase tracking-tight"
                                >
                                    {p.name}
                                </button>
                            ))}
                            <button
                                onClick={handleRandomize}
                                className="px-2 py-1 rounded bg-white/5 border border-white/5 hover:bg-green-500/20 hover:border-green-500/30 hover:text-green-400 text-[10px] font-bold text-gray-500 transition-all uppercase tracking-tight"
                            >
                                Random
                            </button>
                            <button
                                onClick={toggleCrazyMode}
                                className={`px-2 py-1 rounded border transition-all text-[10px] font-bold uppercase tracking-tight ${activeSpecialMode === 'crazy'
                                    ? 'bg-pink-500/40 border-pink-500 text-pink-200'
                                    : 'bg-white/5 border-white/5 text-gray-500 hover:bg-pink-500/20 hover:border-pink-500/30 hover:text-pink-400'
                                    }`}
                            >
                                Crazy
                            </button>
                            <button
                                onClick={toggleDontMode}
                                className={`px-2 py-1 rounded border transition-all text-[10px] font-bold uppercase tracking-tight ${activeSpecialMode === 'dont'
                                    ? 'bg-red-500/50 border-red-500 text-red-200'
                                    : 'bg-white/5 border-white/5 text-gray-500 hover:bg-red-500/20 hover:border-red-500/30 hover:text-red-400'
                                    }`}
                            >
                                Don't
                            </button>
                            {[1, 2, 3].map(slot => {
                                const preset = customPresets[slot.toString()];
                                const hasData = preset && Object.keys(preset).length > 0;
                                return (
                                    <button
                                        key={slot}
                                        onClick={() => hasData && applyPreset(preset)}
                                        className={`px-2 py-1 rounded border transition-all text-[10px] font-bold uppercase tracking-tight ${hasData
                                            ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 hover:bg-amber-500/30'
                                            : 'bg-white/5 border-white/5 text-gray-700 cursor-not-allowed'
                                            }`}
                                    >
                                        C{slot}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Master Reset Button (Portalled to avoid filters) */}
                    <div ref={resetBtnPlaceholderRef} className="h-[42px] w-full" />
                    {isOpen && document.getElementById('unfiltered-portal-root') && createPortal(
                        <button
                            onClick={handleResetFilters}
                            className="fixed py-2.5 bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-300 rounded-lg flex items-center justify-center gap-2 transition-all text-xs font-bold uppercase tracking-widest group shadow-lg z-[10001]"
                            style={{
                                top: portalPos.top,
                                left: portalPos.left,
                                width: portalPos.width,
                                pointerEvents: 'auto'
                            }}
                        >
                            <RefreshCw size={14} className="group-hover:rotate-180 transition-transform duration-500" />
                            Reset Visual Effects
                        </button>,
                        document.getElementById('unfiltered-portal-root')!
                    )}

                    {/* Visual Effects */}
                    <div className="space-y-4 pt-4 border-t border-white/5">
                        <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Filter Controls</h3>

                        <div className="grid gap-4">
                            {/* Inversion */}
                            <div className="space-y-1 group">
                                <div className="flex justify-between items-center text-[10px]">
                                    <div className="flex items-center gap-2">
                                        <span className="text-gray-400 group-hover:text-white transition-colors">Inversion</span>
                                        {visualFilters.invert > 0 && (
                                            <span className="text-[8px] text-yellow-500/60 uppercase tracking-tighter animate-pulse">
                                                Avoids gray zone (40-60%)
                                            </span>
                                        )}
                                    </div>
                                    <span className="text-white font-mono">{Math.round(visualFilters.invert * 100)}%</span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.01"
                                    value={visualFilters.invert}
                                    onDoubleClick={() => resetValue('invert')}
                                    onChange={(e) => handleFilterChange('invert', parseFloat(e.target.value))}
                                    className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                    title="Double click to reset"
                                />
                            </div>

                            {/* Desaturation */}
                            <div className="space-y-1 group">
                                <div className="flex justify-between items-center text-[10px]">
                                    <span className="text-gray-400 group-hover:text-white transition-colors">Desaturation</span>
                                    <span className="text-white font-mono">{Math.round(visualFilters.grayscale * 100)}%</span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.01"
                                    value={visualFilters.grayscale}
                                    onDoubleClick={() => resetValue('grayscale')}
                                    onChange={(e) => handleFilterChange('grayscale', parseFloat(e.target.value))}
                                    className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                    title="Double click to reset"
                                />
                            </div>

                            {/* Contrast */}
                            <div className="space-y-1 group">
                                <div className="flex justify-between items-center text-[10px]">
                                    <span className="text-gray-400 group-hover:text-white transition-colors">Contrast Boost</span>
                                    <span className="text-white font-mono">{visualFilters.contrast.toFixed(2)}x</span>
                                </div>
                                <input
                                    type="range"
                                    min="0.5"
                                    max="2"
                                    step="0.01"
                                    value={visualFilters.contrast}
                                    onDoubleClick={() => resetValue('contrast')}
                                    onChange={(e) => handleFilterChange('contrast', parseFloat(e.target.value))}
                                    className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                    title="Double click to reset"
                                />
                            </div>

                            {/* Brightness */}
                            <div className="space-y-1 group">
                                <div className="flex justify-between items-center text-[10px]">
                                    <span className="text-gray-400 group-hover:text-white transition-colors">Brightness</span>
                                    <span className="text-white font-mono">{visualFilters.brightness.toFixed(2)}x</span>
                                </div>
                                <input
                                    type="range"
                                    min="0.5"
                                    max="2"
                                    step="0.01"
                                    value={visualFilters.brightness}
                                    onDoubleClick={() => resetValue('brightness')}
                                    onChange={(e) => handleFilterChange('brightness', parseFloat(e.target.value))}
                                    className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                    title="Double click to reset"
                                />
                            </div>

                            {/* Font Size */}
                            <div className="space-y-1 group">
                                <div className="flex justify-between items-center text-[10px]">
                                    <span className="text-gray-400 group-hover:text-white transition-colors">UI Font Size</span>
                                    <span className="text-white font-mono">{Math.round(visualFilters.fontSize * 100)}%</span>
                                </div>
                                <input
                                    type="range"
                                    min="0.75"
                                    max="1.5"
                                    step="0.01"
                                    value={visualFilters.fontSize}
                                    onDoubleClick={() => resetValue('fontSize')}
                                    onChange={(e) => handleFilterChange('fontSize', parseFloat(e.target.value))}
                                    className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-indigo-400"
                                    title="Double click to reset"
                                />
                            </div>

                            {/* Texture Settings */}
                            <div className="space-y-3 pt-2">
                                <div className="flex justify-between items-center">
                                    <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Texture Image</h3>
                                    <div className="flex items-center gap-1.5">
                                        {TEXTURES.map((t, i) => (
                                            <button
                                                key={t}
                                                onClick={() => handleFilterChange('textureImage', t)}
                                                className={`w-4 h-4 rounded-full border transition-all ${visualFilters.textureImage === t
                                                    ? 'bg-white border-white scale-110'
                                                    : 'bg-white/10 border-white/20 hover:border-white/40'
                                                    }`}
                                                title={`Texture Variant ${i + 1}`}
                                            />
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-1 group">
                                    <div className="flex justify-between items-center text-[10px]">
                                        <span className="text-gray-400 group-hover:text-white transition-colors">Grain Intensity</span>
                                        <span className="text-white font-mono">{Math.round(visualFilters.textureOpacity * 100)}%</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0"
                                        max="0.5"
                                        step="0.01"
                                        value={visualFilters.textureOpacity}
                                        onDoubleClick={() => resetValue('textureOpacity')}
                                        onChange={(e) => handleFilterChange('textureOpacity', parseFloat(e.target.value))}
                                        className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-pink-500"
                                        title="Double click to reset"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Danger Zone */}
                    <div className="space-y-3 pt-4 border-t border-white/10">
                        <h3 className="text-[10px] font-bold text-amber-500/80 uppercase tracking-widest flex items-center gap-2">
                            <Settings size={12} /> Browser Preferences
                        </h3>
                        <button
                            onClick={onResetEmptySlotBrowserPreference}
                            className="w-full py-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-300 rounded-lg flex items-center justify-center gap-2 transition-colors text-xs font-bold"
                        >
                            <RefreshCw size={12} /> Reset Empty Slot Browser Choice
                        </button>
                        <p className="text-[9px] text-gray-600 text-center leading-tight px-2">
                            Clears the saved choice between App Sample Browser and OS Browser for empty tape slots.
                        </p>

                        <div className="pt-6 mt-6 border-t border-red-500/10 dark:border-red-500/20">
                            <h3 className="text-sm font-medium text-red-600 dark:text-red-400 mb-4 flex items-center gap-2">
                                <Trash2 size={16} />
                                Danger Zone
                            </h3>
                            
                            {currentProjectName && onCleanupProject && (
                        <div className="p-4 bg-red-900/10 border border-red-900/30 rounded-xl flex items-center justify-between">
                            <div>
                                <h4 className="font-bold text-red-400">Clean Up Active Project</h4>
                                <p className="text-sm text-gray-500 mt-1">Remove unused history versions and unused files to save space.</p>
                            </div>
                            <button
                                onClick={() => {
                                    onCleanupProject();
                                    onClose();
                                }}
                                className="px-4 py-2 bg-red-900/30 hover:bg-red-900/50 text-red-300 font-bold rounded-lg flex items-center gap-2 transition-colors border border-red-500/20"
                            >
                                Clean Up...
                            </button>
                        </div>
                            )}

                            <div className="flex items-center justify-between p-4 bg-red-50 dark:bg-red-500/10 rounded-lg mb-4">
                                <h3 className="text-[10px] font-bold text-red-500/70 uppercase tracking-widest flex items-center gap-2">
                                    <AlertTriangle size={12} /> Reset System
                                </h3>
                                <button
                                    onClick={onResetApp}
                                    className="w-full py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 rounded-lg flex items-center justify-center gap-2 transition-colors text-xs font-bold"
                                >
                                    <RefreshCw size={12} /> Reset Application
                                </button>
                                <p className="text-[9px] text-gray-600 text-center leading-tight px-2">
                                    Clears all browser data, projects, and settings. Use with care.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
