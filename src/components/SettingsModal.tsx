import React, { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Settings, RefreshCw, AlertTriangle, X, Save, Trash2, Shield, FolderOpen, History, Info, RotateCcw } from 'lucide-react';
import { RiSdCardMiniLine } from 'react-icons/ri';
import type { VisualFilters } from '../types';
import { getDurabilityPrefs, setDurabilityPref, type DurabilityPrefs } from '../utils/durabilityPrefs';
import { appStorage } from '../utils/storageNamespace';

/**
 * Settings — Phase 7, step 1.
 *
 * The app had no single place that answered "what does this tool do with my files,
 * and when": locations lived in the Project Manager header, durability in a build
 * dialog, cleanup in three places. They live here now.
 *
 * That took the section count past six, which is where the brief said to give it
 * tabs rather than a seventh scroll — the same call `AboutHelpModal` already made.
 * Three tabs, split by what the user came to change: their **files**, the **look**
 * of the app, and the **system** underneath it.
 */
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
    // ── Locations, moved out of the Project Manager header ────────────────────
    workHandle?: FileSystemDirectoryHandle | null;
    sdHandle?: FileSystemDirectoryHandle | null;
    onChangeWorkFolder?: () => void;
    onChangeSDFolder?: () => void;
    /** Opens the workspace backup surface — the one explicit act of step 4. */
    onOpenWorkspaceBackup?: () => void;
}

type SettingsTab = 'files' | 'look' | 'system';

const TABS: Array<{ id: SettingsTab; label: string }> = [
    { id: 'files', label: 'Files' },
    { id: 'look', label: 'Look' },
    { id: 'system', label: 'System' },
];

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

/**
 * The filter defaults, once. `applyPreset`, `resetValue` and the "is this slider at its
 * default" test each carried their own copy of this object before.
 */
const DEFAULT_FILTERS: VisualFilters = {
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

/**
 * Slider bounds, once - read by the sliders themselves, by Crazy mode's clamps and by
 * the reset buttons. They had drifted into three separate sets of literals.
 *
 * S1-13: brightness stopped at 2x, which isn't far enough on a bright screen; it goes to
 * 3x, and contrast with it, since they are the same kind of multiplier over the same old
 * range. The others were asked the same question and keep their bounds: inversion and
 * desaturation are proportions and cap themselves at 100%, font size is bounded by what
 * the layout survives, and grain past 50% buries the UI it sits over.
 */
const FILTER_RANGES = {
    invert: { min: 0, max: 1, step: 0.01 },
    grayscale: { min: 0, max: 1, step: 0.01 },
    contrast: { min: 0.5, max: 3, step: 0.01 },
    brightness: { min: 0.5, max: 3, step: 0.01 },
    fontSize: { min: 0.75, max: 1.5, step: 0.01 },
    textureOpacity: { min: 0, max: 0.5, step: 0.01 },
} as const;

type FilterKey = keyof typeof FILTER_RANGES;

const clampTo = (key: FilterKey, value: number) =>
    Math.max(FILTER_RANGES[key].min, Math.min(FILTER_RANGES[key].max, value));

/** Everything a preset carries. Font size is deliberately not one of them. */
const PRESET_KEYS: Array<keyof VisualFilters> = [
    'invert', 'grayscale', 'contrast', 'brightness', 'textureOpacity',
    'textureImage', 'textureSize', 'texturePosition'
];

const nearly = (a: number, b: number) => Math.abs(a - b) < 0.005;

const filtersMatch = (a: VisualFilters, b: VisualFilters) => PRESET_KEYS.every(key => {
    const av = a[key], bv = b[key];
    if (typeof av === 'number' && typeof bv === 'number') return nearly(av, bv);
    return (av ?? '') === (bv ?? '');
});

/**
 * S1-9 - every explainer on Files and System was 9px grey, which is under the size at
 * which the text can be read at all, and several of them ran to four lines of it. They
 * are 11px now and cut to the one line that answers the question, with the rest behind
 * the info icon. Nothing was rewritten away: what the icon opens is the wording that
 * was already there.
 */
const Explainer: React.FC<{ short: React.ReactNode; more?: React.ReactNode; className?: string }> = ({ short, more, className = '' }) => {
    const [open, setOpen] = useState(false);
    return (
        <div className={className}>
            <p className="text-[11px] text-gray-400 leading-snug">
                {short}
                {more && (
                    <button
                        type="button"
                        onClick={() => setOpen(o => !o)}
                        aria-expanded={open}
                        title={open ? 'Hide the detail' : 'More about this'}
                        className={`ml-1.5 inline-flex align-[-3px] w-[15px] h-[15px] items-center justify-center rounded-full border transition-colors ${open
                            ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300'
                            : 'border-white/15 text-gray-500 hover:border-indigo-400/60 hover:text-indigo-300'
                            }`}
                    >
                        <Info size={9} />
                    </button>
                )}
            </p>
            {more && open && (
                <p className="text-[11px] text-gray-400 leading-snug mt-2 pl-2 border-l-2 border-indigo-500/30">
                    {more}
                </p>
            )}
        </div>
    );
};

/**
 * S1-12 - the sliders reset on double-click and nothing but a `title` tooltip said so.
 * Each carries a small circular reset next to its name now; the double-click stays, and
 * the button greys out when the slider is already at its default, so it also reads as
 * "this one hasn't been touched".
 *
 * Lives out here rather than inside `SettingsModal` so that a render mid-drag doesn't
 * hand React a new component type and remount the input under the pointer.
 */
const FilterSlider: React.FC<{
    label: string;
    value: number;
    range: { min: number; max: number; step: number };
    display: string;
    accent?: string;
    isDefault: boolean;
    note?: React.ReactNode;
    onChange: (value: number) => void;
    onReset: () => void;
}> = ({ label, value, range, display, accent = 'accent-indigo-500', isDefault, note, onChange, onReset }) => (
    <div className="space-y-1 group">
        <div className="flex justify-between items-center text-[10px] gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-gray-400 group-hover:text-white transition-colors">{label}</span>
                <button
                    type="button"
                    onClick={onReset}
                    disabled={isDefault}
                    aria-label={`Reset ${label}`}
                    title={isDefault ? `${label} is at its default` : `Reset ${label} to its default`}
                    className={`shrink-0 w-[15px] h-[15px] rounded-full border flex items-center justify-center transition-colors ${isDefault
                        ? 'border-white/5 text-gray-700 cursor-default'
                        : 'border-white/20 text-gray-400 hover:border-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/15'
                        }`}
                >
                    <RotateCcw size={8} />
                </button>
                {note}
            </div>
            <span className="text-white font-mono shrink-0">{display}</span>
        </div>
        <input
            type="range"
            min={range.min}
            max={range.max}
            step={range.step}
            value={value}
            onDoubleClick={onReset}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className={`w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer ${accent}`}
            title={`Double-click to reset ${label}`}
        />
    </div>
);

export const SettingsModal: React.FC<SettingsModalProps> = ({
    isOpen,
    onClose,
    onResetApp,
    onResetEmptySlotBrowserPreference,
    visualFilters,
    onUpdateVisualFilters,
    onSaveVisualSettings,
    currentProjectName,
    onCleanupProject,
    workHandle,
    sdHandle,
    onChangeWorkFolder,
    onChangeSDFolder,
    onOpenWorkspaceBackup,
}) => {
    const [pos, setPos] = useState({ x: -1, y: 64 }); // -1 uses default right:16
    const [isDragging, setIsDragging] = useState(false);
    const [activeTab, setActiveTab] = useState<SettingsTab>('files');

    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    const [customPresets, setCustomPresets] = useState<Record<string, Partial<VisualFilters>>>(() => {
        try {
            const saved = appStorage.getItem('spotykach_custom_presets');
            return saved ? JSON.parse(saved) : { '1': {}, '2': {}, '3': {} };
        } catch (e) { return { '1': {}, '2': {}, '3': {} }; }
    });
    /** Which preset the current look was last applied from - S1-11. */
    const [activePreset, setActivePreset] = useState<string | null>(null);
    /** True while `animateFilters` is mid-flight, so a preset isn't called modified in transit. */
    const [isAnimating, setIsAnimating] = useState(false);
    const [durability, setDurability] = useState<DurabilityPrefs>(() => getDurabilityPrefs());
    const toggleDurability = (key: keyof DurabilityPrefs) => {
        setDurability(prev => {
            const next = { ...prev, [key]: !prev[key] };
            setDurabilityPref(key, next[key]);
            return next;
        });
    };

    const dragOffset = useRef({ x: 0, y: 0 });
    const animationFrameRef = useRef<number | null>(null);
    const specialModeRef = useRef<number | null>(null);
    const [activeSpecialMode, setActiveSpecialMode] = useState<'none' | 'crazy' | 'dont'>('none');
    const crazyBaseRef = useRef<VisualFilters | null>(null);
    const resetBtnPlaceholderRef = useRef<HTMLDivElement>(null);
    const [portalPos, setPortalPos] = useState({ top: 0, left: 0, width: 0 });

    /**
     * S1-10 - where the reset button lives, and why it has to be measured.
     *
     * It cannot simply sit in the panel: `#root` carries the master filter, and a CSS
     * filter makes its element the containing block for every fixed descendant. Nothing
     * inside the panel can escape the effects that button exists to reset. So it is
     * portalled to `#unfiltered-portal-root`, a sibling of `#root`, and its position has
     * to be told to it.
     *
     * That position used to come from a dependency list - modal position, tab, special
     * mode - which named some of the reasons the placeholder moves and missed the rest
     * (the panel scrolling internally, a preset chip growing a reset button and rewrapping
     * the row above it). It follows the placeholder every frame instead, while the Look
     * tab is open. One rect read per frame, and the state is only written when the rect
     * actually changed, so this doesn't re-render on its own.
     */
    useLayoutEffect(() => {
        if (!isOpen || activeTab !== 'look') return;

        let frame = 0;
        const follow = () => {
            const el = resetBtnPlaceholderRef.current;
            if (el) {
                const rect = el.getBoundingClientRect();
                setPortalPos(prev => (
                    prev.top === rect.top && prev.left === rect.left && prev.width === rect.width
                        ? prev
                        : { top: rect.top, left: rect.left, width: rect.width }
                ));
            }
            frame = requestAnimationFrame(follow);
        };
        follow();

        return () => cancelAnimationFrame(frame);
    }, [isOpen, activeTab]);

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

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };

        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            document.body.style.userSelect = 'none';
        }

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('keydown', handleKeyDown);
            document.body.style.userSelect = '';
        };
    }, [isDragging, isOpen, onClose]);

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
        setIsAnimating(true);

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
            } else {
                animationFrameRef.current = null;
                setIsAnimating(false);
            }
        };

        animationFrameRef.current = requestAnimationFrame(animate);
    };

    const handleFilterChange = (key: keyof VisualFilters, value: any) => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
            setIsAnimating(false);
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

    /** What a preset resolves to: the defaults, the preset on top, font size left alone. */
    const resolvePreset = (preset: Partial<VisualFilters>): VisualFilters => ({
        ...DEFAULT_FILTERS,
        fontSize: visualFilters.fontSize,
        ...preset
    });

    const handleResetFilters = () => {
        // The same act as clicking Default, so it lights the same chip.
        applyPreset({}, 'Default');
    };

    const applyPreset = (preset: Partial<VisualFilters>, id: string | null = null) => {
        if (activeSpecialMode !== 'none') setActiveSpecialMode('none');
        setActivePreset(id);
        animateFilters(resolvePreset(preset));
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
        // Random deliberately stays inside the old 0.5-2x band rather than the widened
        // slider range: it should land somewhere usable, not at the far end of 3x.
        applyPreset(randomFilters, null);
    };

    const toggleCrazyMode = () => {
        if (activeSpecialMode === 'crazy') {
            setActiveSpecialMode('none');
        } else {
            setActiveSpecialMode('crazy');
            setActivePreset(null);
            crazyBaseRef.current = { ...visualFilters };
        }
    };

    const toggleDontMode = () => {
        if (activeSpecialMode === 'dont') {
            setActiveSpecialMode('none');
        } else {
            setActiveSpecialMode('dont');
            setActivePreset(null);
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
                    invert: clampTo('invert', crazyBaseRef.current.invert + jitter(phase, 0)),
                    grayscale: clampTo('grayscale', crazyBaseRef.current.grayscale + jitter(phase * 0.8, 10)),
                    contrast: clampTo('contrast', crazyBaseRef.current.contrast + jitter(phase * 0.7, 20)),
                    brightness: clampTo('brightness', crazyBaseRef.current.brightness + jitter(phase * 0.9, 30)),
                    textureOpacity: clampTo('textureOpacity', crazyBaseRef.current.textureOpacity + jitter(phase * 0.5, 40)),
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
        appStorage.setItem('spotykach_custom_presets', JSON.stringify(updated));
    };

    const resetValue = (key: keyof VisualFilters) => {
        animateFilters({
            ...visualFilters,
            [key]: DEFAULT_FILTERS[key]
        }, 800);
    };

    /** A slider already at its default has nothing to reset, and its button says so. */
    const isAtDefault = (key: FilterKey) => nearly(visualFilters[key] as number, DEFAULT_FILTERS[key] as number);

    /**
     * S1-11 - which chip is live. The exact match is derived from the filters rather than
     * remembered, so a look restored from storage, or one reached by dragging sliders onto
     * a preset's values, still lights the right chip. `activePreset` only has the answer to
     * itself once the filters have moved off it - and that is the modified state.
     */
    const exactPresetId = useMemo(() => {
        for (const p of PRESETS) if (filtersMatch(visualFilters, resolvePreset(p.filters))) return p.name;
        for (const slot of ['1', '2', '3']) {
            const stored = customPresets[slot];
            if (stored && Object.keys(stored).length > 0 && filtersMatch(visualFilters, resolvePreset(stored))) return `custom:${slot}`;
        }
        return null;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visualFilters, customPresets]);

    useEffect(() => {
        if (exactPresetId) setActivePreset(exactPresetId);
    }, [exactPresetId]);

    /** The preset the look came from and has since been edited away from. */
    const modifiedPresetId = (!exactPresetId && !isAnimating && activeSpecialMode === 'none') ? activePreset : null;

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] bg-black/5 pointer-events-auto" onClick={onClose}>
            <div
                className="settings-modal-card fixed z-[61] bg-[#121212]/95 w-[360px] rounded-xl border border-white/10 flex flex-col shadow-2xl backdrop-blur-md max-h-[calc(100vh-80px)]"
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

                {/* TABS — the section list passed six once locations, auto-save, backup and
                    cleanup moved in here, which is the point at which the brief said to stop
                    stacking and start splitting. */}
                <div className="flex border-b border-white/10 bg-[#161616] shrink-0">
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-widest transition-colors ${activeTab === tab.id
                                ? 'text-white border-b-2 border-indigo-500 bg-white/[0.03]'
                                : 'text-gray-600 hover:text-gray-300 border-b-2 border-transparent'
                                }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                <div className="p-4 overflow-y-auto space-y-6 scrollbar-thin scrollbar-thumb-white/10">
                    {activeTab === 'look' && (<>
                    {/* S1-11 — the named presets and the C1–C3 stores used to sit at opposite
                        ends of the panel, and the store buttons hid behind a hover on a label
                        reading "Store:", so nothing said which slot was saved and which was
                        merely selected. Two labelled sections now, each showing which of its
                        slots is live, and each saying out loud what its icon does. */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Presets</h3>
                            <button
                                onClick={onSaveVisualSettings}
                                className="px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 hover:bg-indigo-500/20 text-[9px] font-bold text-indigo-400 transition-colors uppercase tracking-tight flex items-center gap-1"
                                title="Save the current look into the open project's folder"
                            >
                                <Save size={10} />
                                Save to Workspace
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {PRESETS.map(p => {
                                const isActive = exactPresetId === p.name || modifiedPresetId === p.name;
                                const isModified = modifiedPresetId === p.name;
                                return (
                                    <div
                                        key={p.name}
                                        className={`flex items-stretch rounded border overflow-hidden transition-colors ${isActive
                                            ? 'bg-indigo-500/25 border-indigo-500/60'
                                            : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/20'
                                            }`}
                                    >
                                        <button
                                            onClick={() => applyPreset(p.filters, p.name)}
                                            title={isModified ? `${p.name}, with changes on top of it` : `Apply ${p.name}`}
                                            className={`px-2 py-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-tight transition-colors ${isActive ? 'text-indigo-100' : 'text-gray-300'}`}
                                        >
                                            {p.name}
                                            {isModified && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />}
                                        </button>
                                        {isModified && (
                                            <button
                                                onClick={() => applyPreset(p.filters, p.name)}
                                                aria-label={`Reset to ${p.name}`}
                                                title={`Back to ${p.name} – the sliders have moved off it`}
                                                className="px-1.5 flex items-center border-l border-indigo-500/40 text-amber-300 hover:bg-amber-500/20 transition-colors"
                                            >
                                                <RotateCcw size={10} />
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        {/* Random, Crazy and Don't are moods rather than presets — they set no
                            named state to return to — so they sit under the presets, not among them. */}
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                            <button
                                onClick={handleRandomize}
                                className="px-2 py-1 rounded bg-white/5 border border-white/5 hover:bg-green-500/20 hover:border-green-500/30 hover:text-green-400 text-[10px] font-bold text-gray-500 transition-colors uppercase tracking-tight"
                            >
                                Random
                            </button>
                            <button
                                onClick={toggleCrazyMode}
                                className={`px-2 py-1 rounded border transition-colors text-[10px] font-bold uppercase tracking-tight ${activeSpecialMode === 'crazy'
                                    ? 'bg-pink-500/40 border-pink-500 text-pink-200'
                                    : 'bg-white/5 border-white/5 text-gray-500 hover:bg-pink-500/20 hover:border-pink-500/30 hover:text-pink-400'
                                    }`}
                            >
                                Crazy
                            </button>
                            <button
                                onClick={toggleDontMode}
                                className={`px-2 py-1 rounded border transition-colors text-[10px] font-bold uppercase tracking-tight ${activeSpecialMode === 'dont'
                                    ? 'bg-red-500/50 border-red-500 text-red-200'
                                    : 'bg-white/5 border-white/5 text-gray-500 hover:bg-red-500/20 hover:border-red-500/30 hover:text-red-400'
                                    }`}
                            >
                                Don't
                            </button>
                        </div>
                    </div>

                    {/* Custom stored — the same three slots that used to be S1/S2/S3 at the top
                        and C1/C2/C3 at the bottom of the same panel. One chip each: the name
                        applies it, the disk stores over it. */}
                    <div className="space-y-2">
                        <h3 className="text-[10px] font-bold text-amber-500/80 uppercase tracking-widest">Custom stored</h3>
                        <div className="flex flex-wrap gap-1.5">
                            {['1', '2', '3'].map(slot => {
                                const stored = customPresets[slot];
                                const hasData = !!stored && Object.keys(stored).length > 0;
                                const id = `custom:${slot}`;
                                const isActive = exactPresetId === id || modifiedPresetId === id;
                                const isModified = modifiedPresetId === id;
                                return (
                                    <div
                                        key={slot}
                                        className={`flex items-stretch rounded border overflow-hidden transition-colors ${isActive
                                            ? 'bg-amber-500/30 border-amber-400/70'
                                            : hasData
                                                ? 'bg-amber-500/15 border-amber-500/30'
                                                : 'bg-white/5 border-white/5'
                                            }`}
                                    >
                                        <button
                                            onClick={() => hasData && applyPreset(stored, id)}
                                            disabled={!hasData}
                                            title={hasData ? `Apply custom C${slot}` : `C${slot} is empty – store the current look with the disk icon`}
                                            className={`px-2 py-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-tight transition-colors ${hasData
                                                ? (isActive ? 'text-amber-100' : 'text-amber-300 hover:bg-amber-500/20')
                                                : 'text-gray-600 cursor-not-allowed'
                                                }`}
                                        >
                                            C{slot}
                                            {!hasData && <span className="font-normal normal-case tracking-normal text-gray-700">empty</span>}
                                            {isModified && <span className="w-1.5 h-1.5 rounded-full bg-amber-200 shrink-0" />}
                                        </button>
                                        {isModified && (
                                            <button
                                                onClick={() => applyPreset(stored, id)}
                                                aria-label={`Reset to C${slot}`}
                                                title={`Back to C${slot} – the sliders have moved off it`}
                                                className="px-1.5 flex items-center border-l border-amber-400/50 text-amber-100 hover:bg-amber-500/25 transition-colors"
                                            >
                                                <RotateCcw size={10} />
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleStoreCustom(slot)}
                                            aria-label={`Store the current look in C${slot}`}
                                            title={hasData ? `Overwrite C${slot} with the current look` : `Store the current look in C${slot}`}
                                            className={`px-1.5 flex items-center border-l transition-colors ${hasData
                                                ? 'border-amber-500/30 text-amber-400/70 hover:bg-amber-500/25 hover:text-amber-100'
                                                : 'border-white/10 text-gray-500 hover:bg-white/10 hover:text-white'
                                                }`}
                                        >
                                            <Save size={10} />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                        <p className="text-[10px] text-gray-600 leading-snug">
                            The disk icon writes the look you are looking at into that slot. The name puts it back on.
                        </p>
                    </div>

                    {/* Master reset. Portalled out of the filtered `#root` — see the effect
                        above for why it has to be. Two things made it hard to use there:

                        it was `transition-all`, so `top`/`left`/`width` were animated
                        properties. Dragging the panel left it trailing behind by the
                        transition's duration, and on first open it slid in from 0,0. It
                        transitions colour only now, and lands where it is put;

                        and its fill was `bg-indigo-500/20`, 20% alpha over whatever the
                        filtered panel behind it had become. Push inversion to 100% and it was
                        pale indigo text on a pale indigo panel. Hard black-and-white would
                        have fixed that, but it isn't what was wrong: being translucent was.
                        The fill is opaque now, so the button carries its own contrast whatever
                        the effects underneath it are doing, and stays in the app's palette. */}
                    <div ref={resetBtnPlaceholderRef} className="h-[42px] w-full" />
                    {isOpen && activeTab === 'look' && document.getElementById('unfiltered-portal-root') && createPortal(
                        <button
                            onClick={handleResetFilters}
                            className="fixed py-2.5 bg-indigo-600 hover:bg-indigo-500 border border-indigo-300/60 text-white rounded-lg flex items-center justify-center gap-2 transition-colors text-xs font-bold uppercase tracking-widest group shadow-lg ring-1 ring-black/60 z-[10001]"
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
                            <FilterSlider
                                label="Inversion"
                                value={visualFilters.invert}
                                range={FILTER_RANGES.invert}
                                display={`${Math.round(visualFilters.invert * 100)}%`}
                                isDefault={isAtDefault('invert')}
                                onChange={(v) => handleFilterChange('invert', v)}
                                onReset={() => resetValue('invert')}
                                note={visualFilters.invert > 0 ? (
                                    <span className="text-[8px] text-yellow-500/60 uppercase tracking-tighter animate-pulse">
                                        Avoids gray zone (40-60%)
                                    </span>
                                ) : undefined}
                            />

                            <FilterSlider
                                label="Desaturation"
                                value={visualFilters.grayscale}
                                range={FILTER_RANGES.grayscale}
                                display={`${Math.round(visualFilters.grayscale * 100)}%`}
                                isDefault={isAtDefault('grayscale')}
                                onChange={(v) => handleFilterChange('grayscale', v)}
                                onReset={() => resetValue('grayscale')}
                            />

                            <FilterSlider
                                label="Contrast Boost"
                                value={visualFilters.contrast}
                                range={FILTER_RANGES.contrast}
                                display={`${visualFilters.contrast.toFixed(2)}x`}
                                isDefault={isAtDefault('contrast')}
                                onChange={(v) => handleFilterChange('contrast', v)}
                                onReset={() => resetValue('contrast')}
                            />

                            <FilterSlider
                                label="Brightness"
                                value={visualFilters.brightness}
                                range={FILTER_RANGES.brightness}
                                display={`${visualFilters.brightness.toFixed(2)}x`}
                                isDefault={isAtDefault('brightness')}
                                onChange={(v) => handleFilterChange('brightness', v)}
                                onReset={() => resetValue('brightness')}
                            />

                            <FilterSlider
                                label="UI Font Size"
                                value={visualFilters.fontSize}
                                range={FILTER_RANGES.fontSize}
                                display={`${Math.round(visualFilters.fontSize * 100)}%`}
                                accent="accent-indigo-400"
                                isDefault={isAtDefault('fontSize')}
                                onChange={(v) => handleFilterChange('fontSize', v)}
                                onReset={() => resetValue('fontSize')}
                            />

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
                                <FilterSlider
                                    label="Grain Intensity"
                                    value={visualFilters.textureOpacity}
                                    range={FILTER_RANGES.textureOpacity}
                                    display={`${Math.round(visualFilters.textureOpacity * 100)}%`}
                                    accent="accent-pink-500"
                                    isDefault={isAtDefault('textureOpacity')}
                                    onChange={(v) => handleFilterChange('textureOpacity', v)}
                                    onReset={() => resetValue('textureOpacity')}
                                />
                            </div>
                        </div>
                    </div>

                    </>)}

                    {activeTab === 'files' && (<>
                    {/* Locations — moved here from the Project Manager header, where
                        roadmap-bugs has been asking for them since v3. The inline "Change"
                        there stays; a setting is a second entry, not a replacement. */}
                    <div className="space-y-3">
                        <h3 className="text-[10px] font-bold text-indigo-400/80 uppercase tracking-widest flex items-center gap-2">
                            <FolderOpen size={12} /> Locations
                        </h3>
                        {([
                            {
                                label: 'Workspace folder',
                                detail: 'Where your projects and their assets live.',
                                more: 'Each project folder and its Assets are read from and written to here. Picking a different folder leaves the old one exactly as it is – nothing is moved or copied across.',
                                handle: workHandle,
                                onChange: onChangeWorkFolder,
                                empty: 'Not connected',
                            },
                            {
                                label: 'SD card',
                                detail: 'The build target. Nothing is written to it unless you build.',
                                more: 'Reading from the card – existing projects, presets, config.txt – never needs a build. A build writes SK/, plus whatever you have turned on under Copies onto the SD card below.',
                                handle: sdHandle,
                                onChange: onChangeSDFolder,
                                empty: 'Not connected',
                            },
                        ]).map(({ label, detail, more, handle, onChange, empty }) => (
                            <div key={label} className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-[12px] font-bold text-gray-300">{label}</p>
                                    {onChange && (
                                        <button
                                            onClick={onChange}
                                            className="text-[11px] text-indigo-400 hover:underline shrink-0"
                                        >
                                            {handle ? 'Change' : 'Choose'}
                                        </button>
                                    )}
                                </div>
                                <p className={`text-[11px] mt-0.5 font-mono truncate ${handle ? 'text-white' : 'text-gray-600 italic'}`}>
                                    {handle ? handle.name : empty}
                                </p>
                                <Explainer className="mt-1.5" short={detail} more={more} />
                            </div>
                        ))}
                    </div>

                    {/* Auto-save. The full wording is the one roadmap-bugs asks to keep as it
                        stands until the feature changes, so it is split, not rewritten: the
                        first sentence is the line, the whole of it is behind the icon. */}
                    <div className="space-y-3 pt-4 border-t border-white/10">
                        <h3 className="text-[10px] font-bold text-teal-400/80 uppercase tracking-widest flex items-center gap-2">
                            <Save size={12} /> Auto-save
                        </h3>
                        <div className={`rounded-lg border transition-colors ${durability.autoSave
                            ? 'bg-teal-500/10 border-teal-500/30'
                            : 'bg-white/[0.02] border-white/5'
                            }`}>
                            <button
                                type="button"
                                onClick={() => toggleDurability('autoSave')}
                                className="w-full px-3 pt-3 pb-1.5 text-left flex items-center gap-3"
                            >
                                <div className={`w-8 h-[18px] rounded-full p-0.5 shrink-0 transition-colors ${durability.autoSave ? 'bg-teal-500' : 'bg-white/10'}`}>
                                    <div className={`w-[14px] h-[14px] rounded-full bg-white transition-transform ${durability.autoSave ? 'translate-x-[14px]' : 'translate-x-0'}`} />
                                </div>
                                <p className={`text-[12px] font-bold ${durability.autoSave ? 'text-teal-300' : 'text-gray-400'}`}>
                                    Keep a recovery copy in this browser
                                </p>
                            </button>
                            <Explainer
                                className="pr-3 pb-3 pl-[56px]"
                                short="So a closed tab or a crash doesn’t lose the open project."
                                more={<>Keep a recovery copy in this browser – so a closed tab or a crash doesn’t
                                    lose the open project. It does <em>not</em> write to your workspace folder,
                                    since saving still does that. Turning this off deletes the copy.</>}
                            />
                        </div>
                    </div>

                    {/* Workspace backup */}
                    <div className="space-y-3 pt-4 border-t border-white/10">
                        <h3 className="text-[10px] font-bold text-teal-400/80 uppercase tracking-widest flex items-center gap-2">
                            <Shield size={12} /> Workspace backup
                        </h3>
                        <Explainer
                            short="One copy of everything, into a folder you pick at the moment you back up."
                            more="Everything means your projects, their assets and your sample library. There is no remembered location and nothing is written until you choose one."
                        />
                        {onOpenWorkspaceBackup && (
                            <button
                                onClick={onOpenWorkspaceBackup}
                                className="w-full py-2.5 bg-teal-500/15 hover:bg-teal-500/25 border border-teal-500/30 text-teal-300 rounded-lg flex items-center justify-center gap-2 transition-colors text-xs font-bold"
                            >
                                <Shield size={13} /> Back up now…
                            </button>
                        )}
                    </div>

                    {/* History & cleanup */}
                    <div className="space-y-3 pt-4 border-t border-white/10">
                        <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                            <History size={12} /> History &amp; cleanup
                        </h3>
                        {/* The two-version rule was stated here as a fact of the app. It is a
                            preference now, so the sentence that described it became the switch
                            that controls it, in the same shape as the other durability toggles. */}
                        <div className={`rounded-lg border transition-colors ${durability.collapseHistoryOnSave
                            ? 'bg-teal-500/10 border-teal-500/30'
                            : 'bg-white/[0.02] border-white/5'
                            }`}>
                            <button
                                type="button"
                                onClick={() => toggleDurability('collapseHistoryOnSave')}
                                className="w-full px-3 pt-3 pb-1.5 text-left flex items-center gap-3"
                            >
                                <div className={`w-8 h-[18px] rounded-full p-0.5 shrink-0 transition-colors ${durability.collapseHistoryOnSave ? 'bg-teal-500' : 'bg-white/10'}`}>
                                    <div className={`w-[14px] h-[14px] rounded-full bg-white transition-transform ${durability.collapseHistoryOnSave ? 'translate-x-[14px]' : 'translate-x-0'}`} />
                                </div>
                                <p className={`text-[12px] font-bold ${durability.collapseHistoryOnSave ? 'text-teal-300' : 'text-gray-400'}`}>
                                    Saving keeps only the original and the current version
                                </p>
                            </button>
                            <Explainer
                                className="pr-3 pb-3 pl-[56px]"
                                short={durability.collapseHistoryOnSave
                                    ? 'The steps in between are dropped, so history never piles up.'
                                    : 'Every step you commit is written and kept, so history piles up.'}
                                more={<>The editor keeps full undo while it is open either way – this is
                                    only about what reaches the disk. On, a saved project holds two versions
                                    of each file and cleanup is left with the leftovers. Off, nothing is
                                    dropped on your behalf and cleanup is how history comes back down.</>}
                            />
                        </div>
                        <Explainer
                            short="Cleanup is for what saving can’t reach: assets nothing points at any more, unused files, old SD snapshots."
                            more="Saving never removes a file or an asset from disk – only history. A version that was dropped leaves its asset behind, and pool files you no longer want and old SD snapshots were never saving’s to touch, so all of it is swept from here."
                        />
                        {currentProjectName && onCleanupProject ? (
                            <button
                                onClick={() => { onCleanupProject(); onClose(); }}
                                className="w-full py-2.5 bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 text-gray-300 rounded-lg flex items-center justify-center gap-2 transition-colors text-xs font-bold"
                            >
                                <Trash2 size={13} /> Clean up “{currentProjectName}”…
                            </button>
                        ) : (
                            <p className="text-[11px] text-gray-600 italic">Open a project to clean it up.</p>
                        )}
                    </div>

                    {/* Copies onto the SD card */}
                    <div className="space-y-3 pt-4 border-t border-white/10">
                        <h3 className="text-[10px] font-bold text-orange-400/80 uppercase tracking-widest flex items-center gap-2">
                            <RiSdCardMiniLine size={12} /> Copies onto the SD card
                        </h3>
                        <Explainer
                            short={<>The card is a build target, not a backup: with both of these off, a build writes only <span className="font-mono text-gray-500">SK/</span>.</>}
                        />

                        {([
                            {
                                key: 'skSnapshots' as const,
                                title: 'Snapshot card to project',
                                detail: 'After each build, copy the card’s SK folder into the project.',
                                more: 'It lands in _sk_backups/ and the last 5 are kept. That duplicates up to 36 WAVs on every build.',
                            },
                            {
                                key: 'mirrorProjectsToSD' as const,
                                title: 'Keep project copies on SD',
                                detail: 'Mirror project.json and Assets/ onto the card, next to the build.',
                                more: 'Reading existing copies off a card always works, with or without this – it only decides whether a build puts fresh ones there.',
                            },
                        ]).map(({ key, title, detail, more }) => (
                            <div
                                key={key}
                                className={`rounded-lg border transition-colors ${durability[key]
                                    ? 'bg-teal-500/10 border-teal-500/30'
                                    : 'bg-white/[0.02] border-white/5'
                                    }`}
                            >
                                <button
                                    type="button"
                                    onClick={() => toggleDurability(key)}
                                    className="w-full px-3 pt-3 pb-1.5 text-left flex items-center gap-3"
                                >
                                    <div className={`w-8 h-[18px] rounded-full p-0.5 shrink-0 transition-colors ${durability[key] ? 'bg-teal-500' : 'bg-white/10'}`}>
                                        <div className={`w-[14px] h-[14px] rounded-full bg-white transition-transform ${durability[key] ? 'translate-x-[14px]' : 'translate-x-0'}`} />
                                    </div>
                                    <p className={`text-[12px] font-bold ${durability[key] ? 'text-teal-300' : 'text-gray-400'}`}>{title}</p>
                                </button>
                                <Explainer className="pr-3 pb-3 pl-[56px]" short={detail} more={more} />
                            </div>
                        ))}
                    </div>
                    </>)}

                    {activeTab === 'system' && (<>
                    <div className="space-y-3">
                        <h3 className="text-[10px] font-bold text-amber-500/80 uppercase tracking-widest flex items-center gap-2">
                            <Settings size={12} /> Browser Preferences
                        </h3>
                        <button
                            onClick={onResetEmptySlotBrowserPreference}
                            className="w-full py-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-300 rounded-lg flex items-center justify-center gap-2 transition-colors text-xs font-bold"
                        >
                            <RefreshCw size={12} /> Reset Empty Slot Browser Choice
                        </button>
                        <Explainer
                            short="Clears the saved choice for empty tape slots."
                            more="The next empty slot you fill will ask again whether to use the app’s own Sample Browser or your operating system’s file picker, instead of going straight to whichever one you told it to remember."
                        />
                    </div>

                    {/* Danger zone. The reset used to sit inside a `flex items-center
                        justify-between` row together with its own heading and its explainer,
                        which put a full-width button and a paragraph side by side and squeezed
                        both — the explainer here was unreadable for its layout as much as its
                        size. It reads down the page now. */}
                    <div className="space-y-3 pt-4 border-t border-red-500/20">
                        <h3 className="text-[10px] font-bold text-red-500/80 uppercase tracking-widest flex items-center gap-2">
                            <AlertTriangle size={12} /> Danger zone
                        </h3>
                        {/* Cleanup used to sit here too. It is a housekeeping action, not a
                            destructive one — since the two-version rule it only ever removes
                            leftovers — so it lives under Files ▸ History & cleanup now. */}
                        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 space-y-3">
                            <button
                                onClick={onResetApp}
                                className="w-full py-2 bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 rounded-lg flex items-center justify-center gap-2 transition-colors text-xs font-bold"
                            >
                                <Trash2 size={13} /> Reset Application
                            </button>
                            <Explainer
                                short="Clears the projects and settings this browser is holding."
                                more={<>The saved state and the folder permissions go with it, and the app
                                    reloads from nothing. Files already written to your workspace folder or an
                                    SD card are <em>not</em> touched – this only clears what the browser was
                                    keeping.</>}
                            />
                        </div>
                    </div>
                    </>)}
                </div>
            </div>
        </div>
    );
};
