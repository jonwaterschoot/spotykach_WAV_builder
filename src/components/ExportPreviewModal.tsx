import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import type { SyncDiff, SyncSlotDiff } from '../utils/importUtils';
import {
    Check, X, Play, AlertTriangle,
    ArrowRight, ArrowLeft, Trash2, Archive, Loader,
    ArrowLeftRight, RefreshCw
} from 'lucide-react';
import { RiSdCardMiniLine } from 'react-icons/ri';
import { SlotGrid6x6, type SlotEntry, TAPE_LETTER } from './SlotGrid6x6';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SKPrimaryDecision = 'push_to_sk' | 'pull_to_slot' | 'delete_local' | 'delete_sk' | 'skip';

export type QuickPreset = 'import_only' | 'erase_replace' | 'merge' | 'custom';

export interface ExportOptions {
    preset: QuickPreset;
    moveDisplacedToPool: boolean;
    hardcopyBackup: boolean;
}

// Keep old shape for backward compat with exportSDStructure
export type LegacyDecision = 'export' | 'skip' | 'delete';

interface SlotRow {
    id: string;
    slot: string;
    tapeColor: string;
    slotNum: number;
    status: 'LOCAL_ONLY' | 'REMOTE_ONLY' | 'CONFLICT' | 'MATCH' | 'EMPTY';
    localName?: string;
    localBlob?: Blob | null;
    hardwareName?: string;
    hardwareBlob?: Blob | null;
    size: number;
    primary: SKPrimaryDecision;
    toPool: boolean; // can combine with push_to_sk (CONFLICT) or be standalone for REMOTE_ONLY
}

export interface ImportDecision {
    pullToSlot: boolean;  // ← pull SK file into matching local project slot
    toPool: boolean;      // 📥 send SK file to unassigned pool
    file: File | null;    // the actual SK File object
    color: string;        // tape color for slot assignment
    slotIndex: number;    // 1-6
}

interface ExportPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (
        decisions: Record<string, LegacyDecision>,
        options: ExportOptions & { skMode: 'overwrite' | 'clean'; backupSKToProject: boolean },
        importDecisions: Record<string, ImportDecision>
    ) => void;
    diff: SyncDiff;
    projectName?: string;
    defaultMode?: 'import' | 'push';
    onRefresh?: () => void;
    isRefreshing?: boolean;
    onChangeSDCard?: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TAPE_DOT_COLORS: Record<string, string> = {
    Blue: '#3b82f6', Green: '#22c55e', Pink: '#ec4899',
    Red: '#ef4444', Turquoise: '#06b6d4', Yellow: '#eab308',
};

function parseTapeColor(slotId: string) {
    const m = slotId.match(/^([A-Za-z]+)(\d+)$/);
    return m ? { color: m[1], num: parseInt(m[2]) } : { color: 'Gray', num: 0 };
}

function defaultPrimary(status: SlotRow['status'], preset: QuickPreset): SKPrimaryDecision {
    switch (preset) {
        case 'import_only': return status === 'REMOTE_ONLY' ? 'pull_to_slot' : 'skip';
        case 'erase_replace':
            if (status === 'LOCAL_ONLY' || status === 'CONFLICT') return 'push_to_sk';
            if (status === 'REMOTE_ONLY') return 'delete_sk';
            return 'skip';
        case 'merge':
            if (status === 'LOCAL_ONLY') return 'push_to_sk';
            if (status === 'REMOTE_ONLY') return 'pull_to_slot';
            return 'skip';
        default: return 'skip';
    }
}

function defaultToPool(status: SlotRow['status'], preset: QuickPreset): boolean {
    // "Erase & Replace" on a conflict: auto-save displaced SK file to pool
    return preset === 'erase_replace' && status === 'CONFLICT';
}

function syncMatchPreset(rows: SlotRow[], configStatus: SlotRow['status'] | undefined, configDecision: SKPrimaryDecision, preset: QuickPreset): boolean {
    const slotsMatch = rows.every(r =>
        r.primary === defaultPrimary(r.status, preset) &&
        r.toPool === defaultToPool(r.status, preset));

    if (!configStatus) return slotsMatch;

    // Config matches the preset's intended direction for that status
    const configMatch = configDecision === defaultPrimary(configStatus, preset);
    return slotsMatch && configMatch;
}

const PRIMARY_LABEL: Record<SKPrimaryDecision, string> = {
    delete_local: 'Delete local',
    push_to_sk: 'Push to SK →',
    pull_to_slot: '← Into slot',
    delete_sk: 'Delete SK',
    skip: 'Skip',
};

// ─── Component ────────────────────────────────────────────────────────────────

export const ExportPreviewModal: React.FC<ExportPreviewModalProps> = ({
    isOpen, onClose, onConfirm, diff, projectName, defaultMode = 'push',
    onRefresh, isRefreshing, onChangeSDCard
}) => {
    const initialPreset: QuickPreset = defaultMode === 'import' ? 'import_only' : 'erase_replace';

    const buildRows = useCallback((preset: QuickPreset): SlotRow[] => {
        const rows: SlotRow[] = [];
        Object.values(diff.slots).forEach((sd: SyncSlotDiff) => {
            const lf = sd.localFile;
            const lv = lf?.versions.find(v => v.id === lf.currentVersionId);
            const { color, num } = parseTapeColor(sd.slotId);
            const status = sd.status as SlotRow['status'];
            rows.push({
                id: sd.slotId, slot: sd.slotId,
                tapeColor: color, slotNum: num, status,
                localName: lf?.name,
                localBlob: lv?.blob || null,
                hardwareName: sd.remoteFile?.name,
                hardwareBlob: sd.remoteFile || null,  // File IS a Blob — use it directly
                size: lv?.blob?.size || sd.remoteFile?.size || 0,
                primary: defaultPrimary(status, preset),
                toPool: defaultToPool(status, preset),
            });
        });
        return rows.sort((a, b) => a.tapeColor.localeCompare(b.tapeColor) || a.slotNum - b.slotNum);
    }, [diff]);

    const [rows, setRows] = useState<SlotRow[]>(() => buildRows(initialPreset));
    const [showAll, setShowAll] = useState(false);
    const [hardcopyBackup, setHardcopyBackup] = useState(true);
    const [forceOverwrite, setForceOverwrite] = useState(false);
    const [isApplying, setIsApplying] = useState(false);

    // Config Sync State
    const [includeConfig, setIncludeConfig] = useState(true);
    const [configDecision, setConfigDecision] = useState<SKPrimaryDecision>(() => {
        if (!diff.config) return 'skip';
        return defaultPrimary(diff.config.status as any, initialPreset);
    });

    // Audio scrubbing player
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewLabel, setPreviewLabel] = useState('');
    const [activePreviewId, setActivePreviewId] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement>(null);

    const handlePreview = useCallback((blob: Blob | null, id: string, label: string) => {
        if (!blob) return;
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        if (activePreviewId === id) {
            audioRef.current?.pause();
            setPreviewUrl(null); setActivePreviewId(null); return;
        }
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url); setPreviewLabel(label); setActivePreviewId(id);
        setTimeout(() => { audioRef.current?.play().catch(() => { }); }, 30);
    }, [previewUrl, activePreviewId]);

    useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

    // Reset rows when diff changes
    useEffect(() => { setRows(buildRows(initialPreset)); }, [buildRows, initialPreset]);

    const setPrimary = useCallback((id: string, primary: SKPrimaryDecision) => {
        setRows(prev => prev.map(r => r.id === id ? { ...r, primary } : r));
    }, []);

    const togglePool = useCallback((id: string) => {
        setRows(prev => prev.map(r => r.id === id ? { ...r, toPool: !r.toPool } : r));
    }, []);

    const applyPreset = useCallback((preset: QuickPreset) => {
        if (preset === 'custom') {
            // "Clear All" logic: skip everything, no pool
            setRows(prev => prev.map(r => ({
                ...r,
                primary: 'skip' as const,
                toPool: false,
            })));
            setConfigDecision('skip');
            return;
        }
        setRows(prev => prev.map(r => ({
            ...r,
            primary: defaultPrimary(r.status, preset),
            toPool: defaultToPool(r.status, preset),
        })));

        if (diff.config) {
            setConfigDecision(defaultPrimary(diff.config.status as any, preset));
        }
    }, [diff.config]);

    const currentPreset: QuickPreset = useMemo(() => {
        const presets: QuickPreset[] = ['import_only', 'erase_replace', 'merge'];
        return presets.find(p => syncMatchPreset(rows, diff.config?.status as any, configDecision, p)) ?? 'custom';
    }, [rows, configDecision, diff.config]);

    const visibleRows = showAll ? rows : rows.filter(r => r.status !== 'MATCH' && r.status !== 'EMPTY');

    // Action count includes slot updates AND config sync if enabled and pending
    const configActionPending = includeConfig && configDecision !== 'skip';
    const actionCount = rows.filter(r => r.primary !== 'skip' || r.toPool).length + (configActionPending ? 1 : 0);

    // ── Drag state ────────────────────────────────────────────────────────────
    const [_dragSource, setDragSource] = useState<{ slotKey: string; prefix: 'PR' | 'SD' } | null>(null);
    const [poolDragOver, setPoolDragOver] = useState(false);

    const handleGridDrop = (droppedKey: string, droppedPrefix: string, targetPrefix: 'PR' | 'SD') => {
        if (droppedPrefix === targetPrefix) return; // same-side drop: ignore
        setRows(prev => prev.map(r => {
            const key = `${r.tapeColor}${r.slotNum}`;
            if (key !== droppedKey) return r;
            if (droppedPrefix === 'SD' && targetPrefix === 'PR') return { ...r, primary: 'pull_to_slot' as const };
            if (droppedPrefix === 'PR' && targetPrefix === 'SD') return { ...r, primary: 'push_to_sk' as const };
            return r;
        }));
        setDragSource(null);
    };

    const handlePoolDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setPoolDragOver(false);
        try {
            const { slotKey } = JSON.parse(e.dataTransfer.getData('text/plain'));
            setRows(prev => prev.map(r => `${r.tapeColor}${r.slotNum}` === slotKey ? { ...r, toPool: true } : r));
        } catch { /* ignore */ }
        setDragSource(null);
    };

    // ── Badge maps derived from rows ──────────────────────────────────────────
    const prBadges: Record<string, import('./SlotGrid6x6').SlotActionBadge> = {};
    const sdBadges: Record<string, import('./SlotGrid6x6').SlotActionBadge> = {};
    const prPoolFlags: Record<string, boolean> = {};
    const sdPoolFlags: Record<string, boolean> = {};
    rows.forEach(r => {
        const key = `${r.tapeColor}${r.slotNum}`;
        if (r.primary === 'push_to_sk') prBadges[key] = { label: '→ SD', bg: 'bg-indigo-500' };
        if (r.primary === 'delete_local') prBadges[key] = { label: '✕', bg: 'bg-red-600' };
        if (r.primary === 'pull_to_slot') sdBadges[key] = { label: '← PR', bg: 'bg-teal-600' };
        if (r.primary === 'delete_sk') sdBadges[key] = { label: '✕', bg: 'bg-red-600' };
        if (r.toPool) { prPoolFlags[key] = true; sdPoolFlags[key] = true; }
    });


    const handleConfirm = () => {
        setIsApplying(true);
        // Legacy push/delete decisions for exportSDStructure
        const legacyDecisions: Record<string, LegacyDecision> = {};
        // Import decisions for App.tsx to apply to project state
        const importDecisions: Record<string, ImportDecision> = {};
        rows.forEach(r => {
            if (r.primary === 'push_to_sk') legacyDecisions[r.id] = 'export';
            else if (r.primary === 'delete_sk') legacyDecisions[r.id] = 'delete';
            else legacyDecisions[r.id] = 'skip';

            if (r.primary === 'pull_to_slot' || r.toPool) {
                importDecisions[r.id] = {
                    pullToSlot: r.primary === 'pull_to_slot',
                    toPool: r.toPool,
                    file: r.hardwareBlob as File | null,
                    color: r.tapeColor,
                    slotIndex: r.slotNum,
                };
            }
        });
        onConfirm(legacyDecisions, {
            preset: currentPreset,
            moveDisplacedToPool: rows.some(r => r.toPool),
            hardcopyBackup,
            skMode: currentPreset === 'erase_replace' ? 'clean' : 'overwrite',
            backupSKToProject: hardcopyBackup,
            // Include config decision if enabled
            includeConfig: includeConfig,
            configDecision: configDecision,
            forceOverwrite: forceOverwrite,
        } as any, importDecisions);
        setIsApplying(false);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#121212] w-full max-w-5xl rounded-2xl border border-white/10 flex flex-col shadow-2xl overflow-hidden max-h-[90vh]">

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/10 bg-[#1a1a1a] shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-orange-500/20 rounded-xl">
                            <RiSdCardMiniLine size={22} className="text-orange-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">
                                {defaultMode === 'import' ? 'Import SK from SD' : 'Push SK to SD'}
                                {projectName && <span className="text-orange-300"> — {projectName}</span>}
                            </h2>
                            <p className="text-gray-400 text-sm flex items-center gap-2 mt-0.5">
                                <span className="text-indigo-300">Project</span>
                                <ArrowLeftRight size={12} className="text-gray-500" />
                                <RiSdCardMiniLine size={14} className="text-orange-400" />
                                <span className="text-orange-300">SK Hardware Folder</span>
                                {onChangeSDCard && (
                                    <button
                                        onClick={onChangeSDCard}
                                        className="ml-2 text-[10px] text-orange-400 hover:text-orange-300 underline font-bold uppercase tracking-wider"
                                    >
                                        Change
                                    </button>
                                )}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {onRefresh && (
                            <button
                                onClick={onRefresh}
                                disabled={isRefreshing}
                                className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
                                title="Rescan Device"
                            >
                                <RefreshCw size={22} className={isRefreshing ? "animate-spin" : ""} />
                            </button>
                        )}
                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white">
                            <X size={22} />
                        </button>
                    </div>
                </div>

                {/* Quick-Resolve Presets */}
                <div className="px-6 py-3 border-b border-white/5 bg-[#151515] shrink-0 flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mr-1">Sync mode:</span>
                        {([
                            ['import_only', 'Mirror SD → PR', 'bg-teal-700'],
                            ['erase_replace', 'Mirror PR → SD', 'bg-red-700'],
                            ['merge', 'Merge (manual conflicts)', 'bg-indigo-600'],
                        ] as [QuickPreset, string, string][]).map(([preset, label, color]) => (
                            <button key={preset} onClick={() => applyPreset(preset)}
                                className={[
                                    'px-3 py-1 rounded-full text-xs font-bold transition-all border',
                                    currentPreset === preset
                                        ? `${color} text-white border-transparent shadow-sm`
                                        : 'text-gray-400 border-white/10 hover:border-white/20 hover:text-white',
                                ].join(' ')}>
                                {label}
                            </button>
                        ))}
                        <button
                            onClick={() => applyPreset('custom')}
                            className={[
                                'px-3 py-1 rounded-full text-xs font-bold transition-all border',
                                currentPreset === 'custom'
                                    ? `bg-gray-700 text-white border-transparent`
                                    : 'text-gray-400 border-white/10 hover:border-white/20 hover:text-white',
                            ].join(' ')}
                            title="Reset all decisions to 'Skip'"
                        >
                            Clear All
                        </button>
                        {currentPreset === 'custom' && (
                            <span className="text-[10px] text-orange-400 italic px-2">Custom / Cleared</span>
                        )}
                    </div>
                    <div className="flex items-center gap-6">
                        <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer select-none hover:text-white group">
                            <input type="checkbox" checked={includeConfig} onChange={e => setIncludeConfig(e.target.checked)}
                                className="w-3.5 h-3.5 rounded border-gray-700 bg-gray-800 text-orange-500 focus:ring-0" />
                            <span className={includeConfig ? 'text-orange-400 font-bold' : ''}>Sync config.txt</span>
                        </label>
                        <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer select-none hover:text-white">
                            <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)}
                                className="w-3.5 h-3.5 rounded border-gray-700 bg-gray-800 text-indigo-500 focus:ring-0" />
                            Show all slots
                        </label>
                    </div>
                </div>

                {/* Dual slot grid visualizer */}
                {(() => {
                    const projectSlots: Record<string, SlotEntry> = {};
                    const sdSlots: Record<string, SlotEntry> = {};
                    rows.forEach(r => {
                        const key = `${r.tapeColor}${r.slotNum}`;
                        if (r.localBlob) projectSlots[key] = { slotKey: key, color: r.tapeColor, num: r.slotNum, blob: r.localBlob, name: r.localName };
                        if (r.hardwareBlob) sdSlots[key] = { slotKey: key, color: r.tapeColor, num: r.slotNum, blob: r.hardwareBlob, name: r.hardwareName };
                    });
                    return (
                        <div className="px-6 pt-4 pb-2 border-b border-white/5 bg-[#0f0f0f] shrink-0 flex flex-col gap-3">
                            {/* Side-by-side grids */}
                            <div className="flex gap-4">
                                <SlotGrid6x6
                                    slots={projectSlots}
                                    title="Project"
                                    prefix="PR"
                                    titleIcon={<span className="w-2 h-2 rounded-full bg-indigo-400" />}
                                    actionBadges={prBadges}
                                    poolFlags={prPoolFlags}
                                    draggable
                                    droppable
                                    onDragStart={(key, pfx) => setDragSource({ slotKey: key, prefix: pfx as 'PR' | 'SD' })}
                                    onDrop={(key, pfx) => handleGridDrop(key, pfx, 'PR')}
                                    className="flex-1"
                                />
                                <div className="flex items-center justify-center">
                                    <ArrowLeftRight size={16} className="text-gray-700" />
                                </div>
                                <SlotGrid6x6
                                    slots={sdSlots}
                                    title="SD Card — SK Folder"
                                    prefix="SD"
                                    titleIcon={<RiSdCardMiniLine size={12} className="text-orange-400" />}
                                    actionBadges={sdBadges}
                                    poolFlags={sdPoolFlags}
                                    draggable
                                    droppable
                                    onDragStart={(key, pfx) => setDragSource({ slotKey: key, prefix: pfx as 'PR' | 'SD' })}
                                    onDrop={(key, pfx) => handleGridDrop(key, pfx, 'SD')}
                                    className="flex-1"
                                />
                            </div>

                            {/* Pool zone */}
                            <div
                                className={`flex flex-col gap-2 border rounded-xl px-4 py-3 transition-colors ${poolDragOver
                                    ? 'border-teal-500/50 bg-teal-500/5'
                                    : 'border-white/8 bg-[#0a0a0a]'
                                    }`}
                                onDragOver={(e) => { e.preventDefault(); setPoolDragOver(true); }}
                                onDragLeave={() => setPoolDragOver(false)}
                                onDrop={handlePoolDrop}
                            >
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">📥 Pool</span>
                                    <span className="text-[9px] text-gray-700 normal-case">Drop files here to preserve in unassigned pool instead of deleting</span>
                                </div>
                                <div className="flex flex-wrap gap-1.5 min-h-[20px]">
                                    {rows.filter(r => r.toPool).map(r => {
                                        const hex = TAPE_DOT_COLORS[r.tapeColor] || '#888';
                                        const lbl = `${r.hardwareBlob ? 'SD' : 'PR'} ${TAPE_LETTER[r.tapeColor] || r.tapeColor[0]}${r.slotNum}`;
                                        return (
                                            <span
                                                key={r.id}
                                                className="flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-mono font-bold"
                                                style={{ borderColor: `${hex}50`, color: hex, background: `${hex}15` }}
                                            >
                                                {lbl}
                                                <button
                                                    onClick={() => togglePool(r.id)}
                                                    className="ml-0.5 opacity-60 hover:opacity-100 text-[10px] leading-none"
                                                    title="Remove from pool"
                                                >×</button>
                                            </span>
                                        );
                                    })}
                                    {rows.every(r => !r.toPool) && (
                                        <span className="text-[9px] text-gray-700 italic">empty — drag a slot here</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })()}

                {/* Table */}
                <div className="flex-1 overflow-y-auto">
                    <div className="grid grid-cols-[40px_1fr_80px_150px_1fr] gap-0 text-[10px] font-bold uppercase tracking-widest text-gray-500 px-4 py-2 border-b border-white/5 bg-[#0f0f0f] sticky top-0 z-10">
                        <div />
                        <div className="pl-2 flex items-center gap-1 text-indigo-300">● Project</div>
                        <div className="text-center">Status</div>
                        <div className="text-center">Decision</div>
                        <div className="flex items-center gap-1 justify-end pr-2 text-orange-300">
                            <RiSdCardMiniLine size={12} className="text-orange-400" /> SK Hardware
                        </div>
                    </div>

                    {visibleRows.length === 0 && (!diff.config || diff.config.status === 'MATCH' || !includeConfig) && (
                        <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-500">
                            <Check size={32} className="text-green-500" />
                            <p className="font-medium text-gray-300">Hardware matches project</p>
                            <p className="text-sm">Toggle "Show all slots" to review everything.</p>
                        </div>
                    )}

                    {/* Config Row */}
                    {diff.config && includeConfig && (showAll || diff.config.status !== 'MATCH') && (
                        <div className="grid grid-cols-[40px_1fr_80px_150px_1fr] gap-0 border-b border-white/5 bg-orange-500/5 hover:bg-orange-500/10 transition-colors">
                            <div className="flex flex-col items-center justify-center gap-1 py-3 border-r border-white/5">
                                <Archive size={14} className="text-orange-400" />
                            </div>
                            <div className="p-3 flex items-center gap-2 border-r border-white/5 min-w-0">
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs text-white font-bold truncate">config.txt</p>
                                    <p className="text-[10px] text-gray-500 mt-0.5">Project Settings</p>
                                </div>
                            </div>
                            <div className="flex items-center justify-center p-2 border-r border-white/5">
                                {diff.config.status === 'MATCH' && <span className="text-[8px] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1"><Check size={7} /> Sync</span>}
                                {diff.config.status === 'CONFLICT' && <span className="text-[8px] text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1"><AlertTriangle size={7} /> Conflict</span>}
                                {diff.config.status === 'LOCAL_ONLY' && <span className="text-[8px] text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1"><ArrowRight size={7} /> Local</span>}
                                {diff.config.status === 'REMOTE_ONLY' && <span className="text-[8px] text-orange-300 bg-orange-500/10 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1"><ArrowLeft size={7} /> SD only</span>}
                            </div>
                            <div className="flex flex-col items-center justify-center gap-1 p-2 border-r border-white/5">
                                {diff.config.status === 'MATCH' ? (
                                    <span className="text-[9px] text-green-500 font-bold flex items-center gap-1"><Check size={9} /> In sync</span>
                                ) : (
                                    <div className="flex items-center gap-0.5">
                                        <button onClick={() => setConfigDecision(prev => prev === 'push_to_sk' ? 'skip' : 'push_to_sk')}
                                            className={['p-1.5 rounded transition-all', configDecision === 'push_to_sk' ? 'bg-indigo-600 text-white shadow-sm scale-110' : 'text-gray-500 hover:text-gray-200 hover:bg-white/10'].join(' ')}>
                                            <ArrowRight size={12} />
                                        </button>
                                        <span className="text-gray-700 text-[10px] mx-0.5 select-none">|</span>
                                        <button onClick={() => setConfigDecision(prev => prev === 'pull_to_slot' ? 'skip' : 'pull_to_slot')}
                                            className={['p-1.5 rounded transition-all', configDecision === 'pull_to_slot' ? 'bg-teal-600 text-white shadow-sm scale-110' : 'text-gray-500 hover:text-gray-200 hover:bg-white/10'].join(' ')}>
                                            <ArrowLeft size={12} />
                                        </button>
                                    </div>
                                )}
                            </div>
                            <div className="p-3 flex items-center gap-2 min-w-0 flex-row-reverse">
                                <div className="flex-1 min-w-0 text-right">
                                    <p className="text-xs text-white font-medium truncate">config.txt</p>
                                    <p className="text-[10px] text-gray-500 mt-0.5">on SD Root</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {visibleRows.map(row => {
                        const dotColor = TAPE_DOT_COLORS[row.tapeColor] || '#888';
                        const isSame = row.status === 'MATCH' || row.status === 'EMPTY';

                        const canDeleteLocal = false; // safety: always disabled
                        const canPushRight = row.status === 'LOCAL_ONLY' || row.status === 'CONFLICT';
                        const canPullSlot = row.status === 'REMOTE_ONLY' || row.status === 'CONFLICT';
                        const canDeleteSK = row.status === 'REMOTE_ONLY' || row.status === 'CONFLICT';
                        // toPool can combine with push_to_sk (conflict) or standalone (remote_only)
                        const canToPool = row.status === 'REMOTE_ONLY' || row.status === 'CONFLICT';

                        // Primary icon button
                        const pBtn = (dec: SKPrimaryDecision, icon: React.ReactNode, enabled: boolean, activeColor: string) => {
                            const isActive = row.primary === dec;
                            return (
                                <button key={dec}
                                    onClick={() => enabled && setPrimary(row.id, isActive ? 'skip' : dec)}
                                    title={PRIMARY_LABEL[dec]}
                                    className={[
                                        'p-1.5 rounded transition-all',
                                        isActive
                                            ? `${activeColor} text-white shadow-sm scale-110`
                                            : enabled
                                                ? 'text-gray-500 hover:text-gray-200 hover:bg-white/10'
                                                : 'text-gray-700 opacity-25 cursor-default',
                                    ].join(' ')}>
                                    {icon}
                                </button>
                            );
                        };

                        // Build active label
                        const parts: string[] = [];
                        if (row.primary !== 'skip') parts.push(PRIMARY_LABEL[row.primary]);
                        if (row.toPool) parts.push('+ Pool');
                        const activeLabel = parts.length ? parts.join(' ') : 'Skip';


                        return (
                            <div key={row.id}
                                className={`grid grid-cols-[40px_1fr_80px_150px_1fr] gap-0 border-b border-white/5 hover:bg-white/[0.02] transition-colors ${isSame ? 'opacity-40' : ''}`}>

                                {/* Slot label */}
                                <div className="flex flex-col items-center justify-center gap-1 py-3 border-r border-white/5">
                                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: dotColor }} />
                                    <span className="text-[9px] text-gray-500 font-mono font-bold">{row.slotNum}</span>
                                </div>

                                {/* Project file + play */}
                                <div className="p-3 flex items-center gap-2 border-r border-white/5 min-w-0">
                                    {row.localBlob ? (
                                        <button
                                            onClick={() => handlePreview(row.localBlob!, `local-${row.id}`, `${row.slot} (Project)`)}
                                            className={`p-1.5 rounded-full shrink-0 transition-colors ${activePreviewId === `local-${row.id}` ? 'bg-indigo-500 text-white' : 'text-gray-500 hover:text-white hover:bg-white/10'}`}
                                        ><Play size={10} fill="currentColor" /></button>
                                    ) : (
                                        <div className="w-6 h-6 shrink-0" />
                                    )}
                                    {row.localName ? (
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs text-white font-medium truncate">{row.localName}</p>
                                            <p className="text-[10px] text-gray-500 mt-0.5">{(row.size / 1024 / 1024).toFixed(1)} MB</p>
                                        </div>
                                    ) : (
                                        <p className="text-xs text-gray-600 italic">—</p>
                                    )}
                                </div>

                                {/* Status badge */}
                                <div className="flex items-center justify-center p-2 border-r border-white/5">
                                    {row.status === 'MATCH' && <span className="text-[8px] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1"><Check size={7} /> Sync</span>}
                                    {row.status === 'EMPTY' && <span className="text-[8px] text-gray-500 bg-white/5 px-1.5 py-0.5 rounded-full font-bold">Empty</span>}
                                    {row.status === 'CONFLICT' && <span className="text-[8px] text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1"><AlertTriangle size={7} /> Conflict</span>}
                                    {row.status === 'LOCAL_ONLY' && <span className="text-[8px] text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1"><ArrowRight size={7} /> Local</span>}
                                    {row.status === 'REMOTE_ONLY' && <span className="text-[8px] text-orange-300 bg-orange-500/10 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1"><ArrowLeft size={7} /> SK only</span>}
                                </div>

                                {/* Decision icons: 🗑 → | ← 🗑 📥 */}
                                <div className="flex flex-col items-center justify-center gap-1 p-2 border-r border-white/5">
                                    {isSame ? (
                                        <span className="text-[9px] text-green-500 font-bold flex items-center gap-1"><Check size={9} /> In sync</span>
                                    ) : (
                                        <>
                                            <div className="flex items-center gap-0.5">
                                                {pBtn('delete_local', <Trash2 size={12} />, canDeleteLocal, 'bg-red-700')}
                                                {pBtn('push_to_sk', <ArrowRight size={12} />, canPushRight, 'bg-indigo-600')}
                                                <span className="text-gray-700 text-[10px] mx-0.5 select-none">|</span>
                                                {pBtn('pull_to_slot', <ArrowLeft size={12} />, canPullSlot, 'bg-teal-600')}
                                                {pBtn('delete_sk', <Trash2 size={12} />, canDeleteSK, 'bg-red-700')}
                                                {/* Archive/Pool: last, independent toggle */}
                                                <button
                                                    onClick={() => canToPool && togglePool(row.id)}
                                                    title="Also send SK file to pool"
                                                    className={[
                                                        'p-1.5 rounded transition-all ml-1',
                                                        canToPool
                                                            ? row.toPool
                                                                ? `bg-orange-600 text-white shadow-sm scale-110`
                                                                : 'text-gray-500 hover:text-gray-200 hover:bg-white/10'
                                                            : 'text-gray-700 opacity-25 cursor-default',
                                                    ].join(' ')}>
                                                    <Archive size={12} />
                                                </button>
                                            </div>
                                            <span className="text-[8px] text-gray-400 font-medium leading-none">
                                                {activeLabel}
                                            </span>
                                        </>
                                    )}
                                </div>

                                {/* SK/Hardware file + play */}
                                <div className="p-3 flex items-center gap-2 min-w-0 flex-row-reverse">
                                    {row.hardwareBlob ? (
                                        <button
                                            onClick={() => handlePreview(row.hardwareBlob!, `remote-${row.id}`, `${row.slot} (SK)`)}
                                            className={`p-1.5 rounded-full shrink-0 transition-colors ${activePreviewId === `remote-${row.id}` ? 'bg-orange-500 text-white' : 'text-gray-500 hover:text-white hover:bg-white/10'}`}
                                        ><Play size={10} fill="currentColor" /></button>
                                    ) : (
                                        <div className="w-6 h-6 shrink-0" />
                                    )}
                                    {row.hardwareName ? (
                                        <div className="flex-1 min-w-0 text-right">
                                            <p className="text-xs text-white font-medium truncate">{row.hardwareName}</p>
                                            <p className="text-[10px] text-gray-500 mt-0.5">on SK</p>
                                        </div>
                                    ) : (
                                        <p className="text-xs text-gray-600 italic text-right flex-1">—</p>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Scrubbing player */}
                {previewUrl && (
                    <div className="border-t border-white/10 bg-[#0a0a0a] px-6 py-2 flex items-center gap-3 shrink-0">
                        <span className="text-[10px] text-gray-400 truncate max-w-[180px]">{previewLabel}</span>
                        <audio
                            ref={audioRef}
                            src={previewUrl}
                            controls
                            autoPlay
                            onEnded={() => setActivePreviewId(null)}
                            className="h-7 flex-1 max-w-lg opacity-90 invert hue-rotate-180"
                            controlsList="nodownload noplaybackrate"
                        />
                    </div>
                )}

                {/* Footer */}
                <div className="p-5 border-t border-white/10 bg-[#1a1a1a] flex items-center justify-between gap-4 shrink-0 flex-wrap">
                    <div className="flex items-center gap-6">
                        <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer hover:text-white transition-colors select-none">
                            <input type="checkbox" checked={hardcopyBackup} onChange={e => setHardcopyBackup(e.target.checked)}
                                className="w-4 h-4 rounded border-gray-600 text-indigo-500 focus:ring-indigo-500 bg-black" />
                            Save hardcopy backup
                        </label>

                        <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer hover:text-orange-400 transition-colors select-none group">
                            <input type="checkbox" checked={forceOverwrite} onChange={e => setForceOverwrite(e.target.checked)}
                                className="w-4 h-4 rounded border-gray-600 text-orange-500 focus:ring-orange-500 bg-black" />
                            <span className={forceOverwrite ? "text-orange-400 font-bold" : ""}>Force Overwrite all SK files</span>
                            <AlertTriangle size={12} className={`opacity-50 group-hover:opacity-100 ${forceOverwrite ? 'text-orange-400 opacity-100' : ''}`} />
                        </label>
                    </div>

                    <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 hidden sm:block">
                            {actionCount > 0
                                ? <>{actionCount} slot{actionCount !== 1 ? 's' : ''} will be updated</>
                                : <span className="italic">No changes selected</span>}
                        </span>
                        <button onClick={onClose}
                            className="px-5 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors font-medium">
                            Cancel
                        </button>
                        <button
                            onClick={handleConfirm}
                            disabled={isApplying || actionCount === 0}
                            className="px-6 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-lg flex items-center gap-2 transition-colors"
                        >
                            {isApplying ? <Loader size={16} className="animate-spin" /> : <RiSdCardMiniLine size={16} />}
                            {isApplying ? 'Applying…' : `Apply (${actionCount})`}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
