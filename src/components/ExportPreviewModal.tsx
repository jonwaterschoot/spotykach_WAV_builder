import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import type { SyncDiff, SyncSlotDiff, DuplicateGroup } from '../utils/importUtils';
import {
    Check, X, Play, AlertTriangle,
    ArrowRight, ArrowLeft, Trash2, Archive, Loader,
    RefreshCw, Settings2, Copy,
    Save, Shield, Layers, ArrowDown, HardDrive
} from 'lucide-react';
import { RiSdCardMiniLine } from 'react-icons/ri';
import { SlotGrid6x6, type SlotEntry, type SlotActionBadge, TAPE_LETTER } from './SlotGrid6x6';
import type { SKPrimaryDecision, ExportOptions } from '../types';
import { getDurabilityPrefs } from '../utils/durabilityPrefs';

// ─── Types ────────────────────────────────────────────────────────────────────

export type QuickPreset = 'import_pool_only' | 'import_slots_pool' | 'import_merge_project' | 'import_sync_merge' | 'push_sync' | 'push_clean' | 'custom';

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
    toPool: boolean;
}

export interface ImportDecision {
    pullToSlot: boolean;
    toPool: boolean;
    file: File | null;
    color: string;
    slotIndex: number;
}

interface ExportPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (
        decisions: Record<string, LegacyDecision>,
        options: ExportOptions,
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

function defaultPrimary(status: SlotRow['status'], preset: QuickPreset, _mode: 'import' | 'push' = 'push'): SKPrimaryDecision {
    switch (preset) {
        case 'import_pool_only':
            return 'skip';
        case 'import_merge_project':
            // Merge SD into project: Pull SD to slots. Displaced project files will be pooled by defaultToPool.
            if (status === 'REMOTE_ONLY' || status === 'CONFLICT') return 'pull_to_slot';
            return 'skip';
        case 'import_sync_merge':
            if (status === 'REMOTE_ONLY' || status === 'CONFLICT') return 'pull_to_slot';
            if (status === 'LOCAL_ONLY') return 'push_to_sk';
            return 'skip';
        case 'push_clean':
            if (status === 'LOCAL_ONLY' || status === 'CONFLICT') return 'push_to_sk';
            if (status === 'REMOTE_ONLY') return 'delete_sk';
            return 'skip';
        case 'push_sync':
            if (status === 'LOCAL_ONLY' || status === 'CONFLICT') return 'push_to_sk';
            if (status === 'REMOTE_ONLY') return 'pull_to_slot';
            return 'skip';
        default: return 'skip';
    }
}

function defaultToPool(status: SlotRow['status'], preset: QuickPreset, _mode: 'import' | 'push' = 'push'): boolean {
    if (preset === 'import_pool_only') {
        // "Standard Import" = Pool incoming SD files only (no slot changes)
        return status === 'REMOTE_ONLY' || status === 'CONFLICT';
    }
    if (preset === 'import_merge_project' || preset === 'import_sync_merge') {
        // "Merge Import" & "Merge + Mirror" = Sync SD to Slots + Pool displaced PROJECT files
        return status === 'CONFLICT';
    }
    // Preservation by default: if we are overwriting a slot in Push Sync, pool the old file. 
    // Clean Mirror (push_clean) explicitly avoids pooling to match project exactly.
    return preset === 'push_sync' && status === 'CONFLICT';
}

function syncMatchPreset(rows: SlotRow[], configStatus: SlotRow['status'] | undefined, configDecision: SKPrimaryDecision, preset: QuickPreset): boolean {
    const slotsMatch = rows.every(r =>
        r.primary === defaultPrimary(r.status, preset) &&
        r.toPool === defaultToPool(r.status, preset));
    if (!configStatus) return slotsMatch;
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


// ─── DuplicatesBanner ─────────────────────────────────────────────────────────

const SIDE_COLOR: Record<DuplicateGroup['entries'][0]['side'], string> = {
    project: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    sd: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
};

const DuplicatesBanner: React.FC<{
    duplicates: DuplicateGroup[];
    hoveredSlotKey: string | null;
    onHoverSlot: (key: string | null) => void;
    onTrashSlot: (slotId: string, side: 'project' | 'sd') => void;
    isSlotTrashed: (slotId: string, side: 'project' | 'sd') => boolean;
}> = ({ duplicates, hoveredSlotKey, onHoverSlot, onTrashSlot, isSlotTrashed }) => {
    const [open, setOpen] = useState(false);
    if (!duplicates || duplicates.length === 0) return null;

    const totalFiles = duplicates.reduce((sum, g) => sum + g.entries.length, 0);

    return (
        <div className="mx-6 mt-4 rounded-xl border border-yellow-500/30 bg-yellow-500/5 overflow-hidden animate-in slide-in-from-top-2 duration-300 shrink-0">
            <button
                onClick={() => setOpen(v => !v)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-yellow-500/10 transition-colors"
            >
                <div className="p-1.5 bg-yellow-500/20 rounded-lg shrink-0">
                    <Copy size={13} className="text-yellow-400" />
                </div>
                <div className="flex-1 min-w-0">
                    <span className="text-[11px] font-black text-yellow-300 uppercase tracking-widest">
                        {duplicates.length} duplicate group{duplicates.length !== 1 ? 's' : ''} detected
                    </span>
                    <span className="text-[10px] text-yellow-500/70 ml-2 font-medium">
                        {totalFiles} slots share identical audio content
                    </span>
                </div>
                <span className="text-[10px] text-yellow-500/50 font-bold uppercase tracking-wider shrink-0">
                    {open ? 'Hide ▲' : 'Show ▼'}
                </span>
            </button>

            {open && (
                <div className="px-4 pb-4 flex flex-col gap-2 border-t border-yellow-500/10">
                    {duplicates.map((group, i) => (
                        <div key={group.hash} className="flex items-start gap-3 pt-2">
                            <span className="text-[9px] text-yellow-600 font-mono font-bold mt-1 shrink-0 w-4 text-right">
                                {i + 1}.
                            </span>
                            <div className="flex flex-wrap gap-1.5 flex-1">
                                {group.entries.map((entry, j) => {
                                    const isHovered = hoveredSlotKey === entry.slotId;
                                    const trashed = isSlotTrashed(entry.slotId, entry.side);
                                    return (
                                        <div key={`${entry.slotId}-${entry.side}-${j}`} className="relative group/tag">
                                            <span
                                                onMouseEnter={() => onHoverSlot(entry.slotId)}
                                                onMouseLeave={() => onHoverSlot(null)}
                                                className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-mono font-black cursor-pointer transition-all ${
                                                    isHovered
                                                        ? SIDE_COLOR[entry.side] + ' ring-2 ring-yellow-400/60 scale-110 brightness-125'
                                                        : SIDE_COLOR[entry.side]
                                                } ${trashed ? 'opacity-40 grayscale line-through' : ''}`}
                                            >
                                                <span className="opacity-50">{entry.side === 'project' ? 'PR' : 'SD'}</span>
                                                {' '}{entry.slotId}
                                                <span className="opacity-40 font-normal ml-1 truncate max-w-[80px]" title={entry.name}>
                                                    {entry.name}
                                                </span>
                                            </span>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onTrashSlot(entry.slotId, entry.side); }}
                                                className={`absolute -top-1 -right-1 p-0.5 rounded-full shadow-lg transition-all border ${
                                                    trashed 
                                                        ? 'bg-red-600 border-red-400 text-white opacity-100' 
                                                        : 'bg-white/10 border-white/20 text-white opacity-0 group-hover/tag:opacity-100 hover:bg-red-500'
                                                }`}
                                                title={trashed ? "Restore from trash" : "Mark this duplicate for removal"}
                                            >
                                                <Trash2 size={8} />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                            <span className="text-[8px] text-yellow-700 font-mono mt-1 shrink-0 hidden sm:block" title={`SHA-256: ${group.hash}`}>
                                #{group.hash.slice(0, 8)}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};


// ─── Component ────────────────────────────────────────────────────────────────

export const ExportPreviewModal: React.FC<ExportPreviewModalProps> = ({
    isOpen, onClose, onConfirm, diff, projectName, defaultMode = 'push',
    onRefresh, isRefreshing, onChangeSDCard
}) => {
    const [mode, setMode] = useState<'import' | 'push'>(defaultMode);

    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    const initialPreset: QuickPreset = mode === 'import' ? 'import_pool_only' : 'push_sync';


    const buildRows = useCallback((preset: QuickPreset, currentMode: 'import' | 'push'): SlotRow[] => {
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
                hardwareBlob: sd.remoteFile || null,
                size: lv?.blob?.size || sd.remoteFile?.size || 0,
                primary: defaultPrimary(status, preset, currentMode),
                toPool: defaultToPool(status, preset, currentMode),
            });
        });
        return rows.sort((a, b) => a.tapeColor.localeCompare(b.tapeColor) || a.slotNum - b.slotNum);
    }, [diff]);

    const [rows, setRows] = useState<SlotRow[]>(() => buildRows(initialPreset, mode));
    const [showAll, setShowAll] = useState(false);
    const [isApplying, setIsApplying] = useState(false);
    const [isAdvanced, setIsAdvanced] = useState(false);
    const [isCustomOverride, setIsCustomOverride] = useState(false);
    const [showConflictSummary, setShowConflictSummary] = useState(false);
    const [showFinalConfirmation, setShowFinalConfirmation] = useState(false);
    // Per-build opt-in, seeded from the saved preference (off by default).
    // Not persisted back — ticking it here is a decision about this build only.
    const [skSnapshot, setSkSnapshot] = useState(() => getDurabilityPrefs().skSnapshots);
    const [highlightedSlot, setHighlightedSlot] = useState<string | null>(null);
    const [hoveredSlotKey, setHoveredSlotKey] = useState<string | null>(null);
    const [showFuture, setShowFuture] = useState(false);

    // Unified preview state
    const [activePreviewBlob, setActivePreviewBlob] = useState<Blob | null>(null);
    const [activePreviewUrl, setActivePreviewUrl] = useState<string | null>(null);
    const [activePreviewLabel, setActivePreviewLabel] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const playerTimerRef = useRef<NodeJS.Timeout | null>(null);

    const clearPlayerTimer = useCallback(() => {
        if (playerTimerRef.current) {
            clearTimeout(playerTimerRef.current);
            playerTimerRef.current = null;
        }
    }, []);

    const startPlayerTimer = useCallback(() => {
        clearPlayerTimer();
        playerTimerRef.current = setTimeout(() => {
            setActivePreviewUrl(null);
            setActivePreviewLabel(null);
            setActivePreviewBlob(null);
        }, 10000);
    }, [clearPlayerTimer]);

    const handlePreview = (blob: Blob, label: string) => {
        clearPlayerTimer();
        if (activePreviewBlob === blob) {
            setActivePreviewBlob(null);
            if (activePreviewUrl) {
                URL.revokeObjectURL(activePreviewUrl);
                setActivePreviewUrl(null);
            }
            setActivePreviewLabel(null);
        } else {
            if (activePreviewUrl) URL.revokeObjectURL(activePreviewUrl);
            const url = URL.createObjectURL(blob);
            setActivePreviewBlob(blob);
            setActivePreviewUrl(url);
            setActivePreviewLabel(label);
            
            setTimeout(() => {
                if (audioRef.current) {
                    audioRef.current.load();
                    audioRef.current.play().catch(e => console.warn("Audio play failed:", e));
                }
            }, 10);
        }
    };

    // Clean up URLs
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            if (activePreviewUrl) URL.revokeObjectURL(activePreviewUrl);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [activePreviewUrl, isOpen, onClose]);

    const [configDecision, setConfigDecision] = useState<SKPrimaryDecision>(() => {
        if (!diff.config) return 'skip';
        return defaultPrimary(diff.config.status as any, initialPreset, mode);
    });

    const handleModeToggle = (m: 'import' | 'push') => {
        setMode(m);
    };

    const setPrimary = useCallback((id: string, primary: SKPrimaryDecision) => {
        setIsCustomOverride(false);
        setRows(prev => prev.map(r => r.id === id ? { ...r, primary } : r));
    }, []);

    const togglePool = useCallback((id: string) => {
        setIsCustomOverride(false);
        setRows(prev => prev.map(r => r.id === id ? { ...r, toPool: !r.toPool } : r));
    }, []);

    const applyPreset = useCallback((preset: QuickPreset) => {
        setIsCustomOverride(preset === 'custom');
        if (preset === 'custom') {
            setRows(prev => prev.map(r => ({ ...r, primary: 'skip' as const, toPool: false })));
            setConfigDecision('skip');
            return;
        }
        setRows(prev => prev.map(r => ({
            ...r,
            primary: defaultPrimary(r.status, preset, mode),
            toPool: defaultToPool(r.status, preset, mode),
        })));
        if (diff.config) {
            setConfigDecision(defaultPrimary(diff.config.status as any, preset, mode));
        }
    }, [diff.config, mode]);

    const currentPreset: QuickPreset = useMemo(() => {
        if (isCustomOverride) return 'custom';
        const presets: QuickPreset[] = mode === 'import' 
            ? ['import_pool_only', 'import_slots_pool', 'import_merge_project', 'import_sync_merge']
            : ['push_sync', 'push_clean'];
        return presets.find(p => syncMatchPreset(rows, diff.config?.status as any, configDecision, p)) ?? 'custom';
    }, [rows, configDecision, diff.config, mode, isCustomOverride]);

    const visibleRows = showAll ? rows : rows.filter(r => r.status !== 'MATCH' && r.status !== 'EMPTY');

    const configActionPending = configDecision !== 'skip';
    const actionCount = rows.filter(r => r.primary !== 'skip' || r.toPool).length + (configActionPending ? 1 : 0);

    // Push/push counts for Simple view summary
    const pushCount = rows.filter(r => r.primary === 'push_to_sk').length;
    const pullCount = rows.filter(r => r.primary === 'pull_to_slot').length;
    const deleteCount = rows.filter(r => r.primary === 'delete_sk' || r.primary === 'delete_local').length;

    const handleTrashSlot = useCallback((slotId: string, side: 'project' | 'sd') => {
        setIsCustomOverride(true);
        setRows(prev => prev.map(r => {
            if (r.id !== slotId) return r;
            if (side === 'project') {
                const wasTrashOrPull = r.primary === 'delete_local' || (r.status === 'CONFLICT' && r.primary === 'pull_to_slot');
                if (wasTrashOrPull) return { ...r, primary: 'skip' as const, toPool: false };

                // If conflict, resolving via trash means pulling SD version into the "freed" slot
                if (r.status === 'CONFLICT') return { ...r, primary: 'pull_to_slot' as const, toPool: true };
                return { ...r, primary: 'delete_local' as const };
            } else {
                const wasTrashOrPush = r.primary === 'delete_sk' || (r.status === 'CONFLICT' && r.primary === 'push_to_sk');
                if (wasTrashOrPush) return { ...r, primary: 'skip' as const, toPool: false };

                if (r.status === 'CONFLICT') return { ...r, primary: 'push_to_sk' as const, toPool: true };
                return { ...r, primary: 'delete_sk' as const };
            }
        }));
    }, []);

    const isSlotTrashed = useCallback((slotId: string, side: 'project' | 'sd') => {
        const row = rows.find(r => r.id === slotId);
        if (!row) return false;
        if (side === 'project') {
            return row.primary === 'delete_local' || (row.status === 'CONFLICT' && row.primary === 'pull_to_slot');
        } else {
            return row.primary === 'delete_sk' || (row.status === 'CONFLICT' && row.primary === 'push_to_sk');
        }
    }, [rows]);

    // ── Drag state ────────────────────────────────────────────────────────────
    const [_dragSource, setDragSource] = useState<{ slotKey: string; prefix: 'PR' | 'SD' } | null>(null);
    const [poolDragOver, setPoolDragOver] = useState(false);

    const handleGridDrop = (droppedKey: string, droppedPrefix: string, targetPrefix: 'PR' | 'SD') => {
        if (droppedPrefix === targetPrefix) return;
        setIsCustomOverride(false);
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
        setIsCustomOverride(false);
        try {
            const { slotKey } = JSON.parse(e.dataTransfer.getData('text/plain'));
            setRows(prev => prev.map(r => `${r.tapeColor}${r.slotNum}` === slotKey ? { ...r, toPool: true } : r));
        } catch { /* ignore */ }
        setDragSource(null);
    };

    const handleConfirm = () => {
        // If in Simple view, verify there are no unresolved conflicts
        if (!isAdvanced) {
            const hasConflicts = rows.some(r => r.status === 'CONFLICT' && r.primary === 'skip');
            if (hasConflicts) {
                setShowConflictSummary(true);
                return;
            }
        }
        
        setShowFinalConfirmation(true);
    };

    const proceedWithConfirm = () => {
        setIsApplying(true);
        setShowConflictSummary(false);
        const legacyDecisions: Record<string, LegacyDecision> = {};
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
        // Always include config decision
        if (configActionPending) {
            legacyDecisions['config'] = configDecision === 'push_to_sk' ? 'export' : 'skip';
        }
        onConfirm(legacyDecisions, {
            preset: currentPreset,
            moveDisplacedToPool: rows.some(r => r.toPool),
            skMode: currentPreset === 'push_clean' ? 'clean' : 'overwrite',
            configDecision,
            // Legacy fields App.tsx still reads
            includeConfig: true,
            forceOverwrite: true,
            skSnapshot,
        } as any, importDecisions);
        setIsApplying(false);
    };

    if (!isOpen) return null;

    // ── Shared: slot grid visualizer (BEFORE & AFTER) ─────────────────────────
    const projectSlots: Record<string, SlotEntry> = {};
    const sdSlots: Record<string, SlotEntry> = {};
    const afterProjectSlots: Record<string, SlotEntry> = {};
    const afterSdSlots: Record<string, SlotEntry> = {};
    
    // Dimming logic
    const dimmedProjectSlots: Record<string, boolean> = {};
    const dimmedSdSlots: Record<string, boolean> = {};
    const dimmedAfterProjectSlots: Record<string, boolean> = {};
    const dimmedAfterSdSlots: Record<string, boolean> = {};

    // Visual Indicator logic (Before side)
    const prIndicatorBorders: Record<string, { color: string, variant: 'dashed' | 'solid' }> = {};
    const sdIndicatorBorders: Record<string, { color: string, variant: 'dashed' | 'solid' }> = {};
    const prTrashFlags: Record<string, boolean> = {};
    const sdTrashFlags: Record<string, boolean> = {};
    const prPoolFlags: Record<string, boolean> = {};
    const sdPoolFlags: Record<string, boolean> = {};
    const prBadges: Record<string, SlotActionBadge> = {};
    const sdBadges: Record<string, SlotActionBadge> = {};

    rows.forEach(r => {
        const key = `${r.tapeColor}${r.slotNum}`;
        const isUntouched = r.status === 'MATCH' || r.status === 'EMPTY';

        // ── CURRENT (BEFORE) ──────────────────────────────────────────────────
        if (r.localBlob) {
            projectSlots[key] = { slotKey: key, color: r.tapeColor, num: r.slotNum, blob: r.localBlob, name: r.localName };
            if (isUntouched) dimmedProjectSlots[key] = true;
        }
        if (r.hardwareBlob) {
            sdSlots[key] = { slotKey: key, color: r.tapeColor, num: r.slotNum, blob: r.hardwareBlob, name: r.hardwareName };
            if (isUntouched) dimmedSdSlots[key] = true;
        }

        // ── FUTURE (AFTER) ────────────────────────────────────────────────────
        // Project side future
        let prAfterBlob = r.localBlob;
        let prAfterName = r.localName;
        if (r.primary === 'pull_to_slot') {
            prAfterBlob = r.hardwareBlob;
            prAfterName = r.hardwareName;
        } else if (r.primary === 'delete_local') {
            prAfterBlob = null;
            prAfterName = undefined;
        }
        if (prAfterBlob) {
            afterProjectSlots[key] = { slotKey: key, color: r.tapeColor, num: r.slotNum, blob: prAfterBlob, name: prAfterName };
            if (prAfterBlob === r.localBlob) dimmedAfterProjectSlots[key] = true;
        }

        // SD side future
        let sdAfterBlob = r.hardwareBlob;
        let sdAfterName = r.hardwareName;
        if (r.primary === 'push_to_sk') {
            sdAfterBlob = r.localBlob;
            sdAfterName = r.localName;
        } else if (r.primary === 'delete_sk') {
            sdAfterBlob = null;
            sdAfterName = undefined;
        }
        if (sdAfterBlob) {
            afterSdSlots[key] = { slotKey: key, color: r.tapeColor, num: r.slotNum, blob: sdAfterBlob, name: sdAfterName };
            if (sdAfterBlob === r.hardwareBlob) dimmedAfterSdSlots[key] = true;
        }

        // ── Visual Indicators (Current Grids Only) ───────────────────────────
        
        // 1. POOLED / COPIED (Orange/Green logic)
        if (r.toPool) {
            if (r.primary === 'pull_to_slot') {
                // Project slot is being updated from SD, and PR file is pooled
                prBadges[key] = { label: 'POOL', bg: 'bg-orange-600' };
                prPoolFlags[key] = true;
                prIndicatorBorders[key] = { color: 'border-orange-500', variant: 'dashed' };
                
                sdBadges[key] = { label: 'COPIED', bg: 'bg-green-600 text-white' };
                sdIndicatorBorders[key] = { color: 'border-orange-500', variant: 'dashed' };
            } else if (r.primary === 'skip' && mode === 'import') {
                // Import to Pool only (SD file is pooled, project stays same)
                sdBadges[key] = { label: 'COPIED', bg: 'bg-green-600 text-white' };
                sdPoolFlags[key] = true;
                sdIndicatorBorders[key] = { color: 'border-orange-500', variant: 'dashed' };
            } else if (r.primary === 'push_to_sk') {
                // Push to SD (already exists or conflict), SD file is pooled
                sdBadges[key] = { label: 'POOL', bg: 'bg-orange-600' };
                sdPoolFlags[key] = true;
                sdIndicatorBorders[key] = { color: 'border-orange-500', variant: 'dashed' };
            }
        }

        // Action-specific badges
        if (r.primary === 'push_to_sk' && !r.toPool) {
            prBadges[key] = { label: '→ SD', bg: 'bg-indigo-600' };
        } else if (r.primary === 'pull_to_slot' && !r.toPool) {
            sdBadges[key] = { label: '→ PR', bg: 'bg-orange-600' };
        }

        // 2. DELETE (Erased file gets icon, replacement gets red dashed border)
        if (r.primary === 'delete_sk' || (currentPreset === 'push_clean' && r.primary === 'push_to_sk' && r.status === 'CONFLICT')) {
            sdTrashFlags[key] = true;
            sdIndicatorBorders[key] = { color: 'border-red-500', variant: 'dashed' };
        } else if (r.primary === 'delete_local') {
            prTrashFlags[key] = true;
            prIndicatorBorders[key] = { color: 'border-red-500', variant: 'dashed' };
        }

        // 3. NEW (Green dashed border)
        if (r.status === 'LOCAL_ONLY' && r.primary === 'push_to_sk') {
            sdIndicatorBorders[key] = { color: 'border-green-500', variant: 'dashed' };
        } else if (r.status === 'REMOTE_ONLY' && r.primary === 'pull_to_slot') {
            prIndicatorBorders[key] = { color: 'border-green-500', variant: 'dashed' };
        }
    });

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#121212] w-full max-w-6xl rounded-2xl border border-white/10 flex flex-col shadow-2xl overflow-hidden max-h-[90vh]">

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/10 bg-[#1a1a1a] shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-indigo-500/20 rounded-xl">
                            <RiSdCardMiniLine size={22} className="text-indigo-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white leading-tight">
                                SD card SK/ Build & Import
                                {projectName && <span className="text-indigo-300 opacity-50 ml-2"> · {projectName}</span>}
                            </h2>
                            <div className="flex items-center gap-1 mt-2 p-0.5 bg-black/40 rounded-lg border border-white/5 w-fit">
                                <button 
                                    onClick={() => handleModeToggle('push')}
                                    className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${mode === 'push' ? 'bg-orange-600 text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}
                                >
                                    <ArrowRight size={11} /> Build SD
                                </button>
                                <button 
                                    onClick={() => handleModeToggle('import')}
                                    className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${mode === 'import' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}
                                >
                                    <ArrowLeft size={11} /> Import SD
                                </button>
                                {onChangeSDCard && (
                                    <button
                                        onClick={onChangeSDCard}
                                        className="ml-2 px-2 text-[9px] text-orange-400/60 hover:text-orange-300 underline font-bold uppercase tracking-widest"
                                    >
                                        Change SD
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {!isAdvanced && (
                            <button
                                onClick={() => setShowFuture(v => !v)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${showFuture ? 'bg-green-600/20 border-green-500/50 text-green-400' : 'border-white/10 text-gray-400 hover:text-white hover:border-white/20'}`}
                            >
                                {showFuture ? <X size={13} /> : <Check size={13} />}
                                {showFuture ? 'Hide Result' : 'Show Result'}
                            </button>
                        )}
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
                        <button
                            onClick={() => setIsAdvanced(v => !v)}
                            className={[
                                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all',
                                isAdvanced
                                    ? 'bg-white/10 border-white/20 text-white'
                                    : 'border-white/10 text-gray-400 hover:text-white hover:border-white/20',
                            ].join(' ')}
                        >
                            <Settings2 size={13} />
                            {isAdvanced ? 'Simple' : 'Advanced'}
                        </button>
                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white">
                            <X size={22} />
                        </button>
                    </div>
                </div>
                {/* ════ SHARED PRESETS HEADER ══════════════════════════════════ */}
                <div className="px-6 py-4 bg-[#111] border-b border-white/5 flex items-center justify-between gap-4 flex-wrap shrink-0">
                    <div className="flex items-center gap-2">
                        {mode === 'import' ? (
                            <>
                                <button onClick={() => applyPreset('import_pool_only')} className={`px-4 py-2 rounded-xl border text-[11px] font-black uppercase tracking-widest transition-all ${currentPreset === 'import_pool_only' ? 'bg-indigo-600 text-white border-transparent shadow-lg' : 'border-white/5 text-gray-500 hover:border-white/20'}`}>
                                    Standard Import
                                </button>
                                <button onClick={() => applyPreset('import_merge_project')} className={`px-4 py-2 rounded-xl border text-[11px] font-black uppercase tracking-widest transition-all ${currentPreset === 'import_merge_project' ? 'bg-indigo-600 text-white border-transparent shadow-lg' : 'border-white/5 text-gray-500 hover:border-white/20'}`}>
                                    Merge into Project
                                </button>
                                <button onClick={() => applyPreset('import_sync_merge')} className={`px-4 py-2 rounded-xl border text-[11px] font-black uppercase tracking-widest transition-all ${currentPreset === 'import_sync_merge' ? 'bg-indigo-600 text-white border-transparent shadow-lg' : 'border-white/5 text-gray-500 hover:border-white/20'}`}>
                                    Merge into Project + Mirror
                                </button>
                                <button onClick={() => applyPreset('custom')} className={`px-4 py-2 rounded-xl border text-[11px] font-black uppercase tracking-widest transition-all ${currentPreset === 'custom' ? 'bg-gray-700 text-white border-transparent' : 'border-white/5 text-gray-400 hover:border-white/10'}`}>
                                    Custom
                                </button>
                            </>
                        ) : (
                            <>
                                <button onClick={() => applyPreset('push_sync')} className={`px-4 py-2 rounded-xl border text-[11px] font-black uppercase tracking-widest transition-all ${currentPreset === 'push_sync' ? 'bg-orange-600 text-white border-transparent shadow-lg' : 'border-white/5 text-gray-500 hover:border-white/20'}`}>
                                    Standard Build
                                </button>
                                <button onClick={() => applyPreset('push_clean')} className={`px-4 py-2 rounded-xl border text-[11px] font-black uppercase tracking-widest transition-all ${currentPreset === 'push_clean' ? 'bg-orange-600 text-white border-transparent shadow-lg' : 'border-white/5 text-gray-500 hover:border-white/20'}`}>
                                    Clean Mirror
                                </button>
                                <button onClick={() => applyPreset('custom')} className={`px-4 py-2 rounded-xl border text-[11px] font-black uppercase tracking-widest transition-all ${currentPreset === 'custom' ? 'bg-gray-700 text-white border-transparent' : 'border-white/5 text-gray-400 hover:border-white/10'}`}>
                                    Custom
                                </button>
                            </>
                        )}
                    </div>
                    {isAdvanced && (
                        <div className="flex items-center gap-4 ml-auto">
                            <label className="flex items-center gap-1.5 cursor-pointer select-none group">
                                <input
                                    type="checkbox"
                                    checked={showAll}
                                    onChange={(e) => setShowAll(e.target.checked)}
                                    className="w-3.5 h-3.5 rounded bg-white/10 border-white/20 text-indigo-500 focus:ring-0 focus:ring-offset-0"
                                />
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none group-hover:text-white transition-colors">Show all slots</span>
                            </label>
                        </div>
                    )}
                </div>

                {/* Scrollable Content Wrapper */}
                <div className="flex-1 overflow-y-auto min-h-0 bg-[#0c0c0c] flex flex-col custom-scrollbar">

                <DuplicatesBanner
                    duplicates={diff.duplicates ?? []}
                    hoveredSlotKey={hoveredSlotKey}
                    onHoverSlot={setHoveredSlotKey}
                    onTrashSlot={handleTrashSlot}
                    isSlotTrashed={isSlotTrashed}
                />
                
                {diff.config?.location === 'root' && (
                    <div className="mx-6 mt-4 rounded-xl border border-orange-500/30 bg-orange-500/5 px-4 py-3 flex items-center gap-3 animate-in slide-in-from-top-2 duration-300">
                        <div className="p-1.5 bg-orange-500/20 rounded-lg shrink-0">
                            <AlertTriangle size={13} className="text-orange-400" />
                        </div>
                        <div className="flex-1">
                            <p className="text-[11px] font-black text-white uppercase tracking-wider">Legacy Config Location Detected</p>
                            <p className="text-[10px] text-gray-400 mt-0.5">Your config.txt is at the SD root. Building will move it to the SK/ folder for future firmware compatibility.</p>
                        </div>
                    </div>
                )}

                {/* ════ SIMPLE VIEW ════════════════════════════════════════════ */}
                {!isAdvanced && (
                    <div className="px-6 py-6 flex flex-col gap-8">
                        {/* CUSTOM MODE ADVICE */}
                        {currentPreset === 'custom' && (
                            <div className="flex items-center gap-6 px-6 py-4 bg-orange-500/5 border border-orange-500/20 rounded-2xl animate-in fade-in slide-in-from-top-4 duration-500">
                                <div className="p-2 bg-orange-500/20 rounded-xl text-orange-400 shrink-0">
                                    <Settings2 size={20} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-sm font-black text-white tracking-tight">Advanced View Required</h3>
                                    <p className="text-[11px] text-gray-400 truncate">
                                        Switch to Advanced mode to make custom changes to individual slots or use the Preservation Pool.
                                    </p>
                                </div>
                                <button 
                                    onClick={() => setIsAdvanced(true)}
                                    className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-[10px] font-black uppercase tracking-widest rounded-lg transition-all shadow-lg hover:-translate-y-0.5 shrink-0"
                                >
                                    Switch to Advanced
                                </button>
                            </div>
                        )}

                        {/* BEFORE SYNC */}
                        <div className="flex gap-4 items-stretch">
                            <SlotGrid6x6
                                slots={projectSlots}
                                title="Project (Before Sync)"
                                prefix="PR"
                                titleIcon={<div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
                                actionBadges={prBadges}
                                dimmedSlots={dimmedProjectSlots}
                                poolFlags={prPoolFlags}
                                trashFlags={prTrashFlags}
                                indicatorBorders={prIndicatorBorders}
                                hoveredSlotKey={hoveredSlotKey}
                                onHover={setHoveredSlotKey}
                                onPlay={handlePreview}
                                showPlayer={false}
                                className="flex-1 min-w-0"
                            />
                            <div className="flex flex-col items-center justify-center w-8 shrink-0">
                                {mode === 'push' ? (
                                    <ArrowRight size={24} className="text-orange-500/40 animate-pulse" strokeWidth={3} />
                                ) : (
                                    <ArrowLeft size={24} className="text-indigo-500/40 animate-pulse" strokeWidth={3} />
                                )}
                            </div>
                            <SlotGrid6x6
                                slots={sdSlots}
                                title="SD Card (Before Sync)"
                                prefix="SD"
                                titleIcon={<RiSdCardMiniLine size={12} className="text-orange-400" />}
                                actionBadges={sdBadges}
                                dimmedSlots={dimmedSdSlots}
                                poolFlags={sdPoolFlags}
                                trashFlags={sdTrashFlags}
                                indicatorBorders={sdIndicatorBorders}
                                hoveredSlotKey={hoveredSlotKey}
                                onHover={setHoveredSlotKey}
                                onPlay={handlePreview}
                                showPlayer={false}
                                className="flex-1 min-w-0"
                            />
                        </div>

                        {/* AFTER SYNC (Collapsible) */}
                        {showFuture && (
                            <div className="flex flex-col gap-3 border-t border-white/5 pt-6 mt-2">
                                <div className="flex gap-4 items-stretch opacity-90">
                                    <SlotGrid6x6
                                        slots={afterProjectSlots}
                                        title="Project (After Sync)"
                                        prefix="PR"
                                        titleIcon={<div className="w-1.5 h-1.5 rounded-full bg-green-500" />}
                                        dimmedSlots={dimmedAfterProjectSlots}
                                        hoveredSlotKey={hoveredSlotKey}
                                        onHover={setHoveredSlotKey}
                                        onPlay={handlePreview}
                                        showPlayer={false}
                                        className="flex-1 min-w-0"
                                    />
                                    <div className="flex flex-col items-center justify-center w-8 shrink-0">
                                        <Check size={24} className="text-green-500/40" strokeWidth={3} />
                                    </div>
                                    <SlotGrid6x6
                                        slots={afterSdSlots}
                                        title="SD Card (After Sync)"
                                        prefix="SD"
                                        titleIcon={<RiSdCardMiniLine size={12} className="text-green-400" />}
                                        dimmedSlots={dimmedAfterSdSlots}
                                        hoveredSlotKey={hoveredSlotKey}
                                        onHover={setHoveredSlotKey}
                                        onPlay={handlePreview}
                                        showPlayer={false}
                                        className="flex-1 min-w-0"
                                    />
                                </div>
                            </div>
                        )}

                    </div>
                )}

                {/* ════ ADVANCED VIEW ══════════════════════════════════════════ */}
                {isAdvanced && (
                    <>

                        {/* Dual slot grids — BEFORE & AFTER */}
                        <div className="px-6 py-6 border-b border-white/5 bg-[#0f0f0f] shrink-0 flex flex-col gap-6">
                            {/* BEFORE SYNC */}
                            <div className="flex gap-6 items-stretch">
                                <SlotGrid6x6
                                    slots={projectSlots}
                                    title="Project (Before Sync)"
                                    prefix="PR"
                                    titleIcon={<div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
                                    actionBadges={prBadges}
                                    poolFlags={prPoolFlags}
                                    trashFlags={prTrashFlags}
                                    indicatorBorders={prIndicatorBorders}
                                    dimmedSlots={dimmedProjectSlots}
                                    highlightedSlot={highlightedSlot}
                                    hoveredSlotKey={hoveredSlotKey}
                                    onHover={setHoveredSlotKey}
                                    onPlay={handlePreview}
                                    showPlayer={false}
                                    draggable
                                    droppable
                                    onDragStart={(key, pfx) => setDragSource({ slotKey: key, prefix: pfx as 'PR' | 'SD' })}
                                    onDrop={(key, pfx) => handleGridDrop(key, pfx, 'PR')}
                                    className="flex-1 min-w-0"
                                />
                                <div className="flex flex-col items-center justify-center w-8 shrink-0">
                                    {mode === 'push' ? (
                                        <ArrowRight size={24} className="text-orange-500/40" strokeWidth={3} />
                                    ) : (
                                        <ArrowLeft size={24} className="text-indigo-500/40" strokeWidth={3} />
                                    )}
                                </div>
                                <SlotGrid6x6
                                    slots={sdSlots}
                                    title="SD Card · SK (Before Sync)"
                                    prefix="SD"
                                    titleIcon={<RiSdCardMiniLine size={12} className="text-orange-400" />}
                                    actionBadges={sdBadges}
                                    poolFlags={sdPoolFlags}
                                    trashFlags={sdTrashFlags}
                                    indicatorBorders={sdIndicatorBorders}
                                    dimmedSlots={dimmedSdSlots}
                                    highlightedSlot={highlightedSlot}
                                    hoveredSlotKey={hoveredSlotKey}
                                    onHover={setHoveredSlotKey}
                                    onPlay={handlePreview}
                                    showPlayer={false}
                                    draggable
                                    droppable
                                    onDragStart={(key, pfx) => setDragSource({ slotKey: key, prefix: pfx as 'PR' | 'SD' })}
                                    onDrop={(key, pfx) => handleGridDrop(key, pfx, 'SD')}
                                    className="flex-1 min-w-0"
                                />
                            </div>

                            {/* AFTER SYNC */}
                            <div className="flex gap-6 items-stretch opacity-90">
                                <SlotGrid6x6
                                    slots={afterProjectSlots}
                                    title="Project (After Sync)"
                                    prefix="PR"
                                    titleIcon={<div className="w-1.5 h-1.5 rounded-full bg-green-500" />}
                                    dimmedSlots={dimmedAfterProjectSlots}
                                    hoveredSlotKey={hoveredSlotKey}
                                    onHover={setHoveredSlotKey}
                                    onPlay={handlePreview}
                                    showPlayer={false}
                                    className="flex-1 min-w-0"
                                />
                                <div className="flex flex-col items-center justify-center w-8 shrink-0">
                                    <Check size={24} className="text-green-500/40" strokeWidth={3} />
                                </div>
                                <SlotGrid6x6
                                    slots={afterSdSlots}
                                    title="SD Card (After Sync)"
                                    prefix="SD"
                                    titleIcon={<RiSdCardMiniLine size={12} className="text-green-400" />}
                                    dimmedSlots={dimmedAfterSdSlots}
                                    hoveredSlotKey={hoveredSlotKey}
                                    onHover={setHoveredSlotKey}
                                    onPlay={handlePreview}
                                    showPlayer={false}
                                    className="flex-1 min-w-0"
                                />
                            </div>
                        </div>

                            {/* Pool zone */}
                            <div
                                className={`flex flex-col gap-2 border rounded-xl px-4 py-3 transition-all ${poolDragOver
                                    ? 'border-orange-500 bg-orange-500/10 shadow-[0_0_20px_rgba(249,115,22,0.2)]'
                                    : 'border-white/8 bg-black/40'
                                    }`}
                                onDragOver={(e) => { e.preventDefault(); setPoolDragOver(true); }}
                                onDragLeave={() => setPoolDragOver(false)}
                                onDrop={handlePoolDrop}
                            >
                                <div className="flex items-center gap-2">
                                    <div className="p-1 bg-orange-500/20 rounded border border-orange-500/20">
                                        <Archive size={10} className="text-orange-400" />
                                    </div>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-orange-500">📥 Preservation Pool</span>
                                    <span className="text-[9px] text-[#555] normal-case ml-2 flex items-center gap-2 italic">
                                        Hover tags to highlight origin grid cells • Drag slots here to pool instead of deleting
                                    </span>
                                </div>
                                <div className="flex flex-wrap gap-2 min-h-[24px]">
                                    {rows.filter(r => r.toPool).map(r => {
                                        const hex = TAPE_DOT_COLORS[r.tapeColor] || '#888';
                                        const lbl = `${r.hardwareBlob ? 'SD' : 'PR'} ${TAPE_LETTER[r.tapeColor] || r.tapeColor[0]}${r.slotNum}`;
                                        const isHighlighted = highlightedSlot === r.slot;
                                        return (
                                            <span
                                                key={r.id}
                                                onMouseEnter={() => setHighlightedSlot(r.slot)}
                                                onMouseLeave={() => setHighlightedSlot(null)}
                                                className={`flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] font-mono font-black transition-all cursor-default ${isHighlighted ? 'scale-110 shadow-lg brightness-125 ring-2 ring-orange-500/50' : 'opacity-80'}`}
                                                style={{ borderColor: `${hex}60`, color: hex, background: `${hex}20` }}
                                            >
                                                {lbl}
                                                <button
                                                    onClick={() => togglePool(r.id)}
                                                    className="ml-1 opacity-40 hover:opacity-100 text-[12px] leading-none text-white/50 hover:text-white"
                                                    title="Remove from pool"
                                                >×</button>
                                            </span>
                                        );
                                    })}
                                    {rows.every(r => !r.toPool) && (
                                        <span className="text-[9px] text-gray-700 italic">No files currently pooled.</span>
                                    )}
                                </div>
                            </div>
                        
                        {/* Table Area — Now part of the main scroll flow */}
                        <div className="mt-4 pb-20">
                            <div className="grid grid-cols-[40px_1fr_80px_150px_1fr] gap-0 text-[10px] font-black uppercase tracking-widest text-[#555] px-4 py-2 border-y border-white/5 bg-[#0f0f0f] sticky top-0 z-30">
                                <div />
                                <div className="pl-2 flex items-center gap-1 text-indigo-300">● Project</div>
                                <div className="text-center">Status</div>
                                <div className="text-center">Decision</div>
                                <div className="flex items-center gap-1 justify-end pr-2 text-orange-300">
                                    <RiSdCardMiniLine size={12} className="text-orange-400" /> SK Hardware
                                </div>
                            </div>

                            {visibleRows.length === 0 && (diff.config?.status === 'MATCH' || !diff.config) && (
                                <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-500">
                                    <Check size={32} className="text-green-500" />
                                    <p className="font-medium text-gray-300">Hardware matches project</p>
                                    <p className="text-sm">Toggle "Show all slots" to review everything.</p>
                                </div>
                            )}

                            {/* Config Row — always visible (no includeConfig toggle) */}
                            {diff.config && (showAll || diff.config.status !== 'MATCH') && (
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
                                                <button onClick={() => { setIsCustomOverride(false); setConfigDecision(prev => prev === 'push_to_sk' ? 'skip' : 'push_to_sk'); }}
                                                    className={['p-1.5 rounded transition-all', configDecision === 'push_to_sk' ? 'bg-indigo-600 text-white shadow-sm scale-110' : 'text-gray-500 hover:text-gray-200 hover:bg-white/10'].join(' ')}>
                                                    <ArrowRight size={12} />
                                                </button>
                                                <span className="text-gray-700 text-[10px] mx-0.5 select-none">|</span>
                                                <button onClick={() => { setIsCustomOverride(false); setConfigDecision(prev => prev === 'pull_to_slot' ? 'skip' : 'pull_to_slot'); }}
                                                    className={['p-1.5 rounded transition-all', configDecision === 'pull_to_slot' ? 'bg-teal-600 text-white shadow-sm scale-110' : 'text-gray-500 hover:text-gray-200 hover:bg-white/10'].join(' ')}>
                                                    <ArrowLeft size={12} />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    <div className="p-3 flex items-center gap-2 min-w-0 flex-row-reverse">
                                        <div className="flex-1 min-w-0 text-right">
                                            <p className="text-xs text-white font-medium truncate">config.txt</p>
                                            <div className="flex flex-col items-end gap-1 mt-0.5">
                                                <p className="text-[10px] text-gray-500">on SD {diff.config.location === 'sk' ? 'SK folder' : 'Root'}</p>
                                                {diff.config.location === 'root' && (
                                                    <p className="text-[8px] text-orange-400 font-bold uppercase tracking-tight bg-orange-400/10 px-1.5 py-0.5 rounded flex items-center gap-1">
                                                        <AlertTriangle size={8} /> Old Location
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {visibleRows.map(row => {
                                const dotColor = TAPE_DOT_COLORS[row.tapeColor] || '#888';
                                const isSame = row.status === 'MATCH' || row.status === 'EMPTY';

                                const canDeleteLocal = isAdvanced;
                                const canPushRight = row.status === 'LOCAL_ONLY' || row.status === 'CONFLICT';
                                const canPullSlot = row.status === 'REMOTE_ONLY' || row.status === 'CONFLICT';
                                const canDeleteSK = row.status === 'REMOTE_ONLY' || row.status === 'CONFLICT';
                                const canToPool = row.status === 'REMOTE_ONLY' || row.status === 'CONFLICT';

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

                                const parts: string[] = [];
                                // If PR is trashed AND we are pulling from SD
                                if (row.primary === 'pull_to_slot' && row.status === 'CONFLICT') {
                                    parts.push('🗑️ Trashed & Imported');
                                } else if (row.primary === 'push_to_sk' && row.status === 'CONFLICT') {
                                    // If SD is trashed AND we are pushing from PR
                                    parts.push('🗑️ Trashed & Pushed');
                                } else if (row.primary !== 'skip') {
                                    parts.push(PRIMARY_LABEL[row.primary]);
                                }
                                if (row.toPool && row.primary !== 'pull_to_slot' && row.primary !== 'push_to_sk') parts.push('+ Pool');
                                const activeLabel = parts.length ? parts.join(' ') : 'Skip';

                                return (
                                    <div key={row.id}
                                        className={`grid grid-cols-[40px_1fr_80px_150px_1fr] gap-0 border-b border-white/5 hover:bg-white/[0.02] transition-colors ${isSame ? 'opacity-40' : ''}`}>

                                        <div className="flex flex-col items-center justify-center gap-1 py-3 border-r border-white/5">
                                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: dotColor }} />
                                            <span className="text-[9px] text-gray-500 font-mono font-bold">{row.slotNum}</span>
                                        </div>

                                        <div className="p-3 flex items-center gap-2 border-r border-white/5 min-w-0">
                                            {row.localBlob ? (
                                                <button
                                                    onClick={() => handlePreview(row.localBlob!, `${row.slot} (Project)`)}
                                                    className={`p-1.5 rounded-full shrink-0 transition-colors ${activePreviewBlob === row.localBlob ? 'bg-indigo-500 text-white' : 'text-gray-500 hover:text-white hover:bg-white/10'}`}
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

                                        <div className="flex items-center justify-center p-2 border-r border-white/5">
                                            {row.status === 'MATCH' && <span className="text-[8px] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1"><Check size={7} /> Sync</span>}
                                            {row.status === 'EMPTY' && <span className="text-[8px] text-gray-500 bg-white/5 px-1.5 py-0.5 rounded-full font-bold">Empty</span>}
                                            {row.status === 'CONFLICT' && <span className="text-[8px] text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1"><AlertTriangle size={7} /> Conflict</span>}
                                            {row.status === 'LOCAL_ONLY' && <span className="text-[8px] text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1"><ArrowRight size={7} /> Local</span>}
                                            {row.status === 'REMOTE_ONLY' && <span className="text-[8px] text-orange-300 bg-orange-500/10 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1"><ArrowLeft size={7} /> SK only</span>}
                                        </div>

                                        <div className="flex flex-col items-center justify-center gap-2 p-2 border-r border-white/5">
                                            {isSame ? (
                                                <span className="text-[9px] text-green-500 font-bold flex items-center gap-1"><Check size={9} /> In sync</span>
                                            ) : (
                                                <>
                                                    <div className="flex items-center gap-0.5">
                                                        {pBtn('delete_local', <Trash2 size={12} />, canDeleteLocal, 'bg-red-700')}
                                                        {pBtn('push_to_sk', <ArrowRight size={12} />, canPushRight, 'bg-indigo-600')}
                                                        <span className="text-gray-700 text-[10px] mx-0.5 select-none font-light">|</span>
                                                        {pBtn('pull_to_slot', <ArrowLeft size={12} />, canPullSlot, 'bg-teal-600')}
                                                        {pBtn('delete_sk', <Trash2 size={12} />, canDeleteSK, 'bg-red-700')}
                                                    </div>
                                                    
                                                    {canToPool && (
                                                        <button 
                                                            onClick={() => togglePool(row.id)}
                                                            className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[8px] font-black uppercase tracking-tighter transition-all border ${row.toPool ? 'bg-orange-600 border-transparent text-white shadow-md' : 'border-white/5 text-gray-500 hover:text-white hover:bg-white/5'}`}
                                                        >
                                                            <Archive size={10} /> 
                                                            {row.toPool ? (
                                                                row.primary === 'pull_to_slot' ? 'POOLING PR SLOT' : 'POOLING SD FILE'
                                                            ) : (
                                                                row.primary === 'pull_to_slot' ? 'MOVE PR -> POOL' : 'MOVE SD -> POOL'
                                                            )}
                                                        </button>
                                                    )}
                                                    
                                                    {!canToPool && (
                                                        <span className="text-[8px] text-gray-600 font-black uppercase tracking-widest mt-1">
                                                            {activeLabel}
                                                        </span>
                                                    )}
                                                </>
                                            )}
                                        </div>

                                        <div className="p-3 flex items-center gap-2 min-w-0 flex-row-reverse">
                                            {row.hardwareBlob ? (
                                                <button
                                                    onClick={() => handlePreview(row.hardwareBlob!, `${row.slot} (SK)`)}
                                                    className={`p-1.5 rounded-full shrink-0 transition-colors ${activePreviewBlob === row.hardwareBlob ? 'bg-orange-500 text-white' : 'text-gray-500 hover:text-white hover:bg-white/10'}`}
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
                    </>
                )}
            </div>

                {/* Unified Sleek Player Bar */}
                {activePreviewUrl && (
                    <div className="border-t border-white/5 bg-[#0a0a0a] px-6 py-2.5 flex items-center gap-4 shrink-0 transition-all animate-in slide-in-from-bottom-2 duration-300">
                        <div className="flex items-center gap-2 min-w-[200px] max-w-[300px]">
                            <div className="p-1 bg-indigo-500/10 rounded-md border border-indigo-500/20">
                                <Play size={10} className="text-indigo-400" fill="currentColor" />
                            </div>
                            <span className="text-[10px] font-bold text-gray-400 truncate tracking-tight">
                                {activePreviewLabel || 'Select a slot to preview audio'}
                            </span>
                        </div>
                        <audio
                            ref={audioRef}
                            src={activePreviewUrl}
                            controls
                            autoPlay
                            onPlay={clearPlayerTimer}
                            onPause={startPlayerTimer}
                            onEnded={startPlayerTimer}
                            className="h-7 flex-1 opacity-90 invert hue-rotate-180 grayscale contrast-150"
                            controlsList="nodownload noplaybackrate"
                        />
                    </div>
                )}

                {/* Footer */}
                <div className="p-5 border-t border-white/10 bg-[#1a1a1a] flex items-center justify-between gap-4 shrink-0 flex-wrap">
                    <div className="text-xs text-gray-500 hidden sm:flex items-center gap-4">
                        <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-md border border-white/5">
                            <Save size={12} className="text-indigo-400" />
                            <span className="text-[10px] font-bold text-indigo-300">Project will be saved before sync</span>
                        </div>
                        {actionCount > 0
                            ? <>{actionCount} slot{actionCount !== 1 ? 's' : ''} will be updated</>
                            : <span className="italic">No changes selected</span>}
                    </div>
                    <div className="flex items-center gap-3 ml-auto">
                        <button onClick={onClose}
                            className="px-5 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors font-medium">
                            Cancel
                        </button>
                        <button
                            onClick={handleConfirm}
                            disabled={isApplying || actionCount === 0}
                            className={`px-8 py-3 ${mode === 'push' ? 'bg-orange-600 hover:bg-orange-500 shadow-[0_8px_24px_rgba(249,115,22,0.3)]' : 'bg-indigo-600 hover:bg-indigo-500 shadow-[0_8px_24px_rgba(79,70,229,0.3)]'} disabled:opacity-40 disabled:cursor-not-allowed text-white font-black rounded-xl flex items-center gap-3 transition-all transform hover:-translate-y-0.5`}
                        >
                            {isApplying ? <Loader size={20} className="animate-spin" /> : 
                             (mode === 'push' ? <ArrowRight size={20} /> : <ArrowDown size={20} />)}
                            <div className="flex flex-col items-start leading-tight">
                                <span className="text-[13px] uppercase tracking-wider">
                                    {isApplying ? 'Processing…' : (
                                        mode === 'push' 
                                            ? (currentPreset === 'push_clean' ? 'Clean Mirror to SD' : 'Standard Build to SD')
                                            : (
                                                currentPreset === 'import_pool_only' ? 'Standard Import' :
                                                currentPreset === 'import_merge_project' ? 'Merge into Project' :
                                                currentPreset === 'import_sync_merge' ? 'Merge into Project + Mirror' :
                                                'Standard Import & Sync'
                                            )
                                    )}
                                </span>
                                {!isApplying && (
                                    <span className="text-[10px] opacity-70 font-bold uppercase italic">
                                        {currentPreset === 'custom' ? 'Apply Custom Changes' : 'Confirm Actions'}
                                    </span>
                                )}
                            </div>
                        </button>
                    </div>
                </div>
                {/* Conflict Summary Modal (Simple View Only) */}
                {showConflictSummary && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-md p-6">
                        <div className="bg-[#1a1a1a] border border-orange-500/40 rounded-3xl shadow-2xl max-w-lg w-full p-10 flex flex-col gap-8 animate-in fade-in zoom-in duration-300 text-center">
                            <div className="flex flex-col items-center gap-4 text-orange-400">
                                <AlertTriangle size={48} />
                                <div>
                                    <h3 className="text-2xl font-black text-white tracking-tight">Resolve Conflicts Manually</h3>
                                    <p className="text-sm opacity-60 font-medium mt-1">Some slots have different content on SD and Project. Switching to Advanced view to resolve.</p>
                                </div>
                            </div>
                            
                            <div className="flex flex-col gap-4">
                                <button 
                                    onClick={() => { setShowConflictSummary(false); setIsAdvanced(true); }}
                                    className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black shadow-lg transition-all transform hover:-translate-y-1 active:translate-y-0 uppercase tracking-widest text-[11px]"
                                >
                                    Open Advanced View
                                </button>
                                <button 
                                    onClick={() => setShowConflictSummary(false)}
                                    className="w-full py-2 text-gray-500 hover:text-gray-300 font-bold text-[10px] uppercase tracking-widest"
                                >
                                    Back
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Final Confirmation Modal */}
                {showFinalConfirmation && (
                    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/95 backdrop-blur-xl p-4">
                        <div className="bg-[#151515] border border-white/10 rounded-[2rem] shadow-[0_32px_120px_rgba(0,0,0,0.8)] max-w-md w-full p-10 flex flex-col gap-10 animate-in fade-in zoom-in duration-500">
                            <div className="text-center flex flex-col items-center gap-6">
                                <div className="p-6 bg-indigo-500/10 rounded-[1.5rem] border border-indigo-500/20 text-indigo-400">
                                    <Shield size={42} />
                                </div>
                                <div>
                                    <h3 className="text-2xl font-black text-white tracking-tight">Confirm Sync Actions</h3>
                                    <p className="text-gray-400 text-sm mt-3 leading-relaxed">
                                        You are about to modify your {projectName || 'Project'} and SD card.
                                    </p>
                                </div>
                            </div>

                            <div className="flex flex-col gap-3">
                                <div className="p-5 bg-white/[0.03] rounded-2xl border border-white/5 flex items-center justify-between group">
                                    <div className="flex items-center gap-4">
                                        <div className="p-2.5 bg-indigo-500/20 rounded-xl text-indigo-400">
                                            <HardDrive size={18} />
                                        </div>
                                        <div>
                                            <p className="text-white text-[13px] font-bold">Push to SD</p>
                                            <p className="text-[10px] text-gray-500 mt-0.5 uppercase tracking-wider font-medium">Slots to overwrite</p>
                                        </div>
                                    </div>
                                    <span className="text-2xl font-black text-white group-hover:text-indigo-400 transition-colors">{pushCount}</span>
                                </div>

                                <div className="p-5 bg-white/[0.03] rounded-2xl border border-white/5 flex items-center justify-between group">
                                    <div className="flex items-center gap-4">
                                        <div className="p-2.5 bg-teal-500/20 rounded-xl text-teal-400">
                                            <Layers size={18} />
                                        </div>
                                        <div>
                                            <p className="text-white text-[13px] font-bold">Import to Pool</p>
                                            <p className="text-[10px] text-gray-500 mt-0.5 uppercase tracking-wider font-medium">Displaced files preserved</p>
                                        </div>
                                    </div>
                                    <span className="text-2xl font-black text-white group-hover:text-teal-400 transition-colors">
                                        {rows.filter(r => r.toPool).length + pullCount}
                                    </span>
                                </div>

                                {deleteCount > 0 && currentPreset === 'push_clean' && (
                                    <div className="p-5 bg-red-500/5 rounded-2xl border border-red-500/10 flex items-center justify-between group">
                                        <div className="flex items-center gap-4">
                                            <div className="p-2.5 bg-red-500/20 rounded-xl text-red-500">
                                                <Trash2 size={18} />
                                            </div>
                                            <div>
                                                <p className="text-white text-[13px] font-bold">Permanent Removal</p>
                                                <p className="text-[10px] text-red-500/70 mt-0.5 uppercase tracking-wider font-medium">Files to be erased</p>
                                            </div>
                                        </div>
                                        <span className="text-2xl font-black text-red-500 transition-colors">{deleteCount}</span>
                                    </div>
                                )}

                                <button
                                    type="button"
                                    onClick={() => setSkSnapshot(v => !v)}
                                    className={`p-5 rounded-2xl border flex items-center justify-between gap-4 text-left transition-all ${skSnapshot
                                        ? 'bg-white/[0.03] border-amber-500/30'
                                        : 'bg-transparent border-white/5 hover:border-white/10'
                                        }`}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={`p-2.5 rounded-xl transition-colors ${skSnapshot ? 'bg-amber-500/20 text-amber-400' : 'bg-white/5 text-gray-600'}`}>
                                            <Shield size={18} />
                                        </div>
                                        <div>
                                            <p className="text-white text-[13px] font-bold">Snapshot card to project</p>
                                            <p className="text-[10px] text-gray-500 mt-0.5 uppercase tracking-wider font-medium">
                                                {skSnapshot ? 'Copies the whole SK folder, slower' : 'Off, builds write only SK/'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className={`w-11 h-6 rounded-full p-0.5 shrink-0 transition-colors ${skSnapshot ? 'bg-amber-500' : 'bg-white/10'}`}>
                                        <div className={`w-5 h-5 rounded-full bg-white transition-transform ${skSnapshot ? 'translate-x-5' : 'translate-x-0'}`} />
                                    </div>
                                </button>
                            </div>

                        <div className="flex flex-col gap-4">
                            <button 
                                onClick={proceedWithConfirm}
                                className="w-full py-6 bg-white text-black hover:bg-indigo-50 hover:text-indigo-600 rounded-3xl font-black shadow-[0_12px_48px_rgba(255,255,255,0.15)] transition-all transform hover:-translate-y-1 active:translate-y-0 uppercase tracking-[0.2em] text-[12px]"
                            >
                                Proceed & Build
                            </button>
                            <button 
                                onClick={() => setShowFinalConfirmation(false)}
                                className="w-full py-2 text-gray-500 hover:text-white font-bold text-[10px] uppercase tracking-widest transition-colors"
                            >
                                Back to review
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    </div>
    );
};
