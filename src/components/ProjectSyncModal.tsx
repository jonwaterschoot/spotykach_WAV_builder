import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    X, AlertTriangle, Play, Loader, Check, ArrowLeftRight,
    ArrowRight, ArrowLeft, RefreshCw, Trash2
} from 'lucide-react';
import { RiSdCardMiniLine } from 'react-icons/ri';
import type { AppState } from '../types';
import type {
    SlotSyncEntry,
    NoteSyncEntry,
    SyncDecision,
} from '../utils/projectSyncUtils';

// Color dot map
const TAPE_DOT_COLORS: Record<string, string> = {
    Blue: '#3b82f6',
    Green: '#22c55e',
    Pink: '#ec4899',
    Red: '#ef4444',
    Turquoise: '#06b6d4',
    Yellow: '#eab308',
};

interface ProjectSyncModalProps {
    projectName: string;
    localState: AppState;
    backupHandle: FileSystemDirectoryHandle;
    onApply: (newState: AppState) => Promise<void>;
    onClose: () => void;
    onChangeSDCard?: () => void;
}

type Phase = 'loading' | 'review' | 'applying' | 'done';

export const ProjectSyncModal: React.FC<ProjectSyncModalProps> = ({
    projectName,
    localState,
    backupHandle,
    onApply,
    onClose,
    onChangeSDCard
}) => {
    const [phase, setPhase] = useState<Phase>('loading');
    const [entries, setEntries] = useState<SlotSyncEntry[]>([]);
    const [noteEntries, setNoteEntries] = useState<NoteSyncEntry[]>([]);
    const [backupState, setBackupState] = useState<AppState | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [showAll, setShowAll] = useState(false);
    const [applyError, setApplyError] = useState<string | null>(null);

    // Audio preview
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewLabel, setPreviewLabel] = useState<string>('');
    const [activePreviewKey, setActivePreviewKey] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement>(null);

    // Load and compare on mount
    useEffect(() => {
        const run = async () => {
            try {
                const { loadBackupProjectState, compareProjectStates } = await import('../utils/projectSyncUtils');
                const bs = await loadBackupProjectState(backupHandle, projectName);
                setBackupState(bs);
                const { slots, notes } = compareProjectStates(localState, bs);
                setEntries(slots);
                setNoteEntries(notes);
                setPhase('review');
            } catch (e: any) {
                setLoadError(e.message ?? 'Unknown error loading backup');
                setPhase('review');
            }
        };
        run();
    }, []);

    const setDecision = useCallback((idx: number, decision: SyncDecision) => {
        setEntries(prev => prev.map((e, i) => i === idx ? { ...e, decision } : e));
    }, []);

    const setNoteDecision = useCallback((idx: number, decision: SyncDecision) => {
        setNoteEntries(prev => prev.map((e, i) => i === idx ? { ...e, decision } : e));
    }, []);

    const handlePreview = useCallback((blob: Blob | null, key: string, label: string) => {
        if (!blob) return;
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        if (activePreviewKey === key) {
            // Toggle off
            if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; }
            setPreviewUrl(null);
            setActivePreviewKey(null);
            return;
        }
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        setPreviewLabel(label);
        setActivePreviewKey(key);
        setTimeout(() => { if (audioRef.current) audioRef.current.play().catch(() => { }); }, 50);
    }, [previewUrl, activePreviewKey]);

    // Cleanup URL on unmount
    useEffect(() => {
        return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
    }, [previewUrl]);

    const handleApply = async () => {
        setPhase('applying');
        try {
            const { applyProjectSync } = await import('../utils/projectSyncUtils');
            const newState = applyProjectSync(localState, entries, noteEntries);
            await onApply(newState);
            setPhase('done');
        } catch (e: any) {
            setApplyError(e.message ?? 'Apply failed');
            setPhase('review');
        }
    };

    const hasRisk = entries.some(e => e.historyRisk && e.decision === 'use_backup');
    const visibleEntries = showAll ? entries : entries.filter(e => e.status !== 'same');
    const visibleNoteEntries = showAll ? noteEntries : noteEntries.filter(e => e.status !== 'same');
    const diffCount = entries.filter(e => e.status !== 'same').length + noteEntries.filter(e => e.status !== 'same').length;
    const actionableCount = entries.filter(e => e.decision !== 'skip').length + noteEntries.filter(e => e.decision !== 'skip').length;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#121212] w-full max-w-5xl rounded-2xl border border-white/10 flex flex-col shadow-2xl overflow-hidden max-h-[90vh]">

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/10 bg-[#1a1a1a] shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-indigo-500/20 rounded-xl">
                            <ArrowLeftRight size={22} className="text-indigo-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">Project Sync</h2>
                            <p className="text-gray-400 text-sm flex items-center gap-2 mt-0.5">
                                <RiSdCardMiniLine size={14} className="text-orange-400" />
                                <span>Syncing with SD Card Backup</span>
                                {backupHandle && (
                                    <span className="text-[10px] bg-orange-500/10 px-1.5 py-0.5 rounded text-orange-300 font-mono">
                                        {backupHandle.name}
                                    </span>
                                )}
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
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white">
                        <X size={22} />
                    </button>
                </div>

                {/* PHASE: LOADING */}
                {phase === 'loading' && (
                    <div className="flex-1 flex flex-col items-center justify-center gap-4 py-24">
                        <Loader size={36} className="text-indigo-400 animate-spin" />
                        <p className="text-gray-300">Loading and comparing project versions…</p>
                    </div>
                )}

                {/* PHASE: DONE */}
                {phase === 'done' && (
                    <div className="flex-1 flex flex-col items-center justify-center gap-4 py-24">
                        <div className="p-4 bg-green-500/20 rounded-full">
                            <Check size={36} className="text-green-400" />
                        </div>
                        <p className="text-xl font-bold text-white">Sync Complete</p>
                        <p className="text-gray-400">The project has been synchronized successfully.</p>
                        <button onClick={onClose} className="mt-4 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg">
                            Close
                        </button>
                    </div>
                )}

                {/* PHASE: APPLYING */}
                {phase === 'applying' && (
                    <div className="flex-1 flex flex-col items-center justify-center gap-4 py-24">
                        <Loader size={36} className="text-indigo-400 animate-spin" />
                        <p className="text-gray-300">Applying sync decisions…</p>
                    </div>
                )}

                {/* PHASE: REVIEW */}
                {(phase === 'review' || phase === 'applying') && phase !== 'applying' && (
                    <>
                        {/* Sub-header: stats + controls */}
                        <div className="px-6 py-3 border-b border-white/5 bg-[#151515] shrink-0 flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3 text-sm">
                                {loadError ? (
                                    <span className="text-red-400 flex items-center gap-1"><AlertTriangle size={14} /> {loadError}</span>
                                ) : backupState ? (
                                    <>
                                        <span className="text-gray-400">{diffCount} difference{diffCount !== 1 ? 's' : ''} detected</span>
                                        {diffCount === 0 && <span className="text-green-400 flex items-center gap-1"><Check size={12} /> Projects are in sync</span>}
                                    </>
                                ) : (
                                    <span className="text-yellow-400 flex items-center gap-1"><AlertTriangle size={14} /> No backup found — syncing will create one</span>
                                )}
                            </div>
                            <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer select-none hover:text-white">
                                <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)}
                                    className="w-3.5 h-3.5 rounded border-gray-700 bg-gray-800 text-indigo-500 focus:ring-0" />
                                Show all slots
                            </label>
                        </div>

                        {/* History risk warning */}
                        {hasRisk && (
                            <div className="px-6 py-3 bg-amber-500/10 border-b border-amber-500/20 shrink-0 flex items-start gap-3">
                                <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
                                <div className="text-sm">
                                    <p className="text-amber-300 font-bold">Version history at risk</p>
                                    <p className="text-amber-400/80 mt-0.5">
                                        One or more slots marked "Use Backup" have <strong>more version history locally</strong> than in the backup.
                                        Applying will permanently discard those extra local versions. Consider exporting a ZIP backup first.
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Comparison table */}
                        <div className="flex-1 overflow-y-auto">
                            {/* Table header */}
                            <div className="grid grid-cols-[40px_1fr_80px_120px_1fr] gap-0 text-[10px] font-bold uppercase tracking-widest text-gray-500 px-4 py-2 border-b border-white/5 bg-[#0f0f0f] sticky top-0 z-10">
                                <div />
                                <div className="flex items-center gap-1 pl-2"><span className="text-indigo-300">● Work Folder</span></div>
                                <div className="text-center">Status</div>
                                <div className="text-center">Decision</div>
                                <div className="flex items-center gap-1 justify-end pr-2"><RiSdCardMiniLine size={12} className="text-orange-400" /><span className="text-orange-300">SD Backup</span></div>
                            </div>

                            {visibleEntries.length === 0 && visibleNoteEntries.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-500">
                                    <Check size={32} className="text-green-500" />
                                    <p className="font-medium text-gray-300">All slots and notes are identical</p>
                                    <p className="text-sm">Toggle "Show all slots" to review everything.</p>
                                </div>
                            )}

                            {/* NOTE ENTRIES */}
                            {visibleNoteEntries.map((entry) => {
                                const realIdx = noteEntries.indexOf(entry);
                                const dotColor = entry.id === 'project' ? '#fff' : TAPE_DOT_COLORS[entry.id] || '#888';

                                const canDeleteLocal = entry.status === 'local_only' || entry.status === 'conflict';
                                const canPushRight = entry.status === 'local_only' || entry.status === 'conflict';
                                const canPullLeft = entry.status === 'backup_only' || entry.status === 'conflict';
                                const canDeleteBackup = entry.status === 'backup_only' || entry.status === 'conflict';

                                const DECISION_LABEL: Record<string, string> = {
                                    delete_local: 'Delete local',
                                    keep_local: 'Push to SD →',
                                    use_backup: '← Pull from SD',
                                    delete_backup: 'Delete on SD',
                                    skip: 'Skip',
                                };

                                const iconBtn = (decision: SyncDecision, icon: React.ReactNode, enabled: boolean, activeColor: string) => {
                                    const isActive = entry.decision === decision;
                                    return (
                                        <button
                                            onClick={() => enabled && setNoteDecision(realIdx, decision)}
                                            title={DECISION_LABEL[decision]}
                                            className={['p-1.5 rounded transition-all', isActive ? `${activeColor} text-white shadow-sm scale-110` : enabled ? 'text-gray-500 hover:text-gray-300 hover:bg-white/10' : 'text-gray-700 cursor-default opacity-40'].join(' ')}
                                        >{icon}</button>
                                    );
                                };

                                return (
                                    <div key={`note-${entry.id}`} className={`grid grid-cols-[40px_1fr_80px_120px_1fr] gap-0 border-b border-white/5 hover:bg-white/[0.02] transition-colors ${entry.id === 'config' ? 'bg-indigo-500/5' : 'bg-blue-500/5'}`}>
                                        <div className="flex flex-col items-center justify-center gap-1 py-3 border-r border-white/5">
                                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: dotColor }} />
                                        </div>
                                        <div className="p-3 flex flex-col justify-center border-r border-white/5 min-w-0">
                                            <p className="text-xs text-white font-medium truncate">{entry.label}</p>
                                            <p className="text-[10px] text-gray-500 mt-0.5 truncate">
                                                {entry.id === 'config'
                                                    ? (entry.localConfig ? `CH: ${entry.localConfig.mid_ch_a}/${entry.localConfig.mid_ch_b}` : 'No Config')
                                                    : (entry.localNotes ? 'Has Notes' : 'Empty')}
                                            </p>
                                        </div>
                                        <div className="flex items-center justify-center p-2 border-r border-white/5">
                                            {entry.status === 'same' && <span className="text-[8px] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1"><Check size={7} /> Same</span>}
                                            {entry.status === 'conflict' && <span className="text-[8px] text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1"><RefreshCw size={7} /> Conflict</span>}
                                            {entry.status === 'local_only' && <span className="text-[8px] text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1"><ArrowRight size={7} /> New</span>}
                                            {entry.status === 'backup_only' && <span className="text-[8px] text-orange-300 bg-orange-500/10 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1"><ArrowLeft size={7} /> SD only</span>}
                                        </div>
                                        <div className="flex flex-col items-center justify-center gap-1 p-2 border-r border-white/5">
                                            <div className="flex items-center gap-0.5">
                                                {iconBtn('delete_local', <Trash2 size={12} />, canDeleteLocal, 'bg-red-600')}
                                                {iconBtn('keep_local', <ArrowRight size={12} />, canPushRight, 'bg-indigo-600')}
                                                <span className="text-gray-700 text-[10px] mx-0.5 select-none">|</span>
                                                {iconBtn('use_backup', <ArrowLeft size={12} />, canPullLeft, 'bg-orange-600')}
                                                {iconBtn('delete_backup', <Trash2 size={12} />, canDeleteBackup, 'bg-red-600')}
                                            </div>
                                            <span className="text-[8px] text-gray-400 font-medium leading-none">{DECISION_LABEL[entry.decision] ?? 'Skip'}</span>
                                        </div>
                                        <div className="p-3 flex flex-col justify-center min-w-0 text-right">
                                            <p className="text-xs text-white font-medium truncate">{entry.label}</p>
                                            <p className="text-[10px] text-gray-500 mt-0.5 truncate">
                                                {entry.id === 'config'
                                                    ? (entry.backupConfig ? `CH: ${entry.backupConfig.mid_ch_a}/${entry.backupConfig.mid_ch_b}` : 'No Config')
                                                    : (entry.backupNotes ? 'Has Notes' : 'Empty')}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}

                            {visibleEntries.map((entry) => {
                                const realIdx = entries.indexOf(entry);
                                const localKey = `local-${entry.tapeColor}-${entry.slotId}`;
                                const backupKey = `backup-${entry.tapeColor}-${entry.slotId}`;
                                const dotColor = TAPE_DOT_COLORS[entry.tapeColor] || '#888';

                                // Which decisions make sense for this status
                                const canDeleteLocal = entry.status === 'local_only' || entry.status === 'conflict';
                                const canPushRight = entry.status === 'local_only' || entry.status === 'conflict';
                                const canPullLeft = entry.status === 'backup_only' || entry.status === 'conflict';
                                const canDeleteBackup = entry.status === 'backup_only' || entry.status === 'conflict';

                                const DECISION_LABEL: Record<string, string> = {
                                    delete_local: 'Delete local',
                                    keep_local: 'Push to SD →',
                                    use_backup: '← Pull from SD',
                                    delete_backup: 'Delete on SD',
                                    skip: 'Skip',
                                };

                                // Icon button factory
                                const iconBtn = (
                                    decision: SyncDecision,
                                    icon: React.ReactNode,
                                    enabled: boolean,
                                    activeColor: string,
                                ) => {
                                    const isActive = entry.decision === decision;
                                    return (
                                        <button
                                            onClick={() => enabled && setDecision(realIdx, decision)}
                                            title={DECISION_LABEL[decision]}
                                            className={[
                                                'p-1.5 rounded transition-all',
                                                isActive
                                                    ? `${activeColor} text-white shadow-sm scale-110`
                                                    : enabled
                                                        ? 'text-gray-500 hover:text-gray-300 hover:bg-white/10'
                                                        : 'text-gray-700 cursor-default opacity-40',
                                            ].join(' ')}
                                        >
                                            {icon}
                                        </button>
                                    );
                                };

                                return (
                                    <div key={`${entry.tapeColor}-${entry.slotId}`}
                                        className={`grid grid-cols-[40px_1fr_80px_120px_1fr] gap-0 border-b border-white/5 hover:bg-white/[0.02] transition-colors ${entry.historyRisk && entry.decision === 'use_backup' ? 'bg-amber-500/5' : ''}`}>

                                        {/* Slot label */}
                                        <div className="flex flex-col items-center justify-center gap-1 py-3 border-r border-white/5">
                                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: dotColor }} />
                                            <span className="text-[9px] text-gray-500 font-mono font-bold">{entry.slotId}</span>
                                        </div>

                                        {/* Local file + play */}
                                        <div className="p-3 flex items-center gap-2 border-r border-white/5 min-w-0">
                                            {entry.localCurrentBlob && (
                                                <button
                                                    onClick={() => handlePreview(entry.localCurrentBlob, localKey, `${entry.slotLabel} (Local)`)}
                                                    className={`p-1.5 rounded-full shrink-0 transition-colors ${activePreviewKey === localKey ? 'bg-indigo-500 text-white' : 'text-gray-500 hover:text-white hover:bg-white/10'}`}
                                                ><Play size={10} fill="currentColor" /></button>
                                            )}
                                            {entry.localFile ? (
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs text-white font-medium truncate">{entry.localFile.originalName || entry.localFile.name}</p>
                                                    <p className="text-[10px] text-gray-500 mt-0.5">{entry.localVersionCount}v</p>
                                                    {entry.historyRisk && entry.decision === 'use_backup' && (
                                                        <span className="mt-1 inline-flex items-center gap-1 text-[9px] text-amber-400 bg-amber-500/10 px-1 py-0.5 rounded font-bold">
                                                            <AlertTriangle size={7} /> Risk
                                                        </span>
                                                    )}
                                                </div>
                                            ) : (
                                                <p className="text-xs text-gray-600 italic">—</p>
                                            )}
                                        </div>

                                        {/* Status badge */}
                                        <div className="flex items-center justify-center p-2 border-r border-white/5">
                                            {entry.status === 'same' && <span className="text-[8px] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1"><Check size={7} /> Same</span>}
                                            {entry.status === 'conflict' && <span className="text-[8px] text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1"><RefreshCw size={7} /> Conflict</span>}
                                            {entry.status === 'local_only' && <span className="text-[8px] text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1"><ArrowRight size={7} /> Local</span>}
                                            {entry.status === 'backup_only' && <span className="text-[8px] text-orange-300 bg-orange-500/10 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1"><ArrowLeft size={7} /> SD only</span>}
                                        </div>

                                        {/* Decision icon picker — centre column */}
                                        <div className="flex flex-col items-center justify-center gap-1 p-2 border-r border-white/5">
                                            <div className="flex items-center gap-0.5">
                                                {iconBtn('delete_local', <Trash2 size={12} />, canDeleteLocal, 'bg-red-600')}
                                                {iconBtn('keep_local', <ArrowRight size={12} />, canPushRight, 'bg-indigo-600')}
                                                <span className="text-gray-700 text-[10px] mx-0.5 select-none">|</span>
                                                {iconBtn('use_backup', <ArrowLeft size={12} />, canPullLeft, 'bg-orange-600')}
                                                {iconBtn('delete_backup', <Trash2 size={12} />, canDeleteBackup, 'bg-red-600')}
                                            </div>
                                            <span className="text-[8px] text-gray-400 font-medium leading-none">
                                                {DECISION_LABEL[entry.decision] ?? 'Skip'}
                                            </span>
                                        </div>

                                        {/* SD/Backup file + play */}
                                        <div className="p-3 flex items-center gap-2 min-w-0 flex-row-reverse">
                                            {entry.backupCurrentBlob && (
                                                <button
                                                    onClick={() => handlePreview(entry.backupCurrentBlob, backupKey, `${entry.slotLabel} (Backup)`)}
                                                    className={`p-1.5 rounded-full shrink-0 transition-colors ${activePreviewKey === backupKey ? 'bg-orange-500 text-white' : 'text-gray-500 hover:text-white hover:bg-white/10'}`}
                                                ><Play size={10} fill="currentColor" /></button>
                                            )}
                                            {entry.backupFile ? (
                                                <div className="flex-1 min-w-0 text-right">
                                                    <p className="text-xs text-white font-medium truncate">{entry.backupFile.originalName || entry.backupFile.name}</p>
                                                    <p className="text-[10px] text-gray-500 mt-0.5">{entry.backupVersionCount}v</p>
                                                </div>
                                            ) : (
                                                <p className="text-xs text-gray-600 italic text-right flex-1">—</p>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Bottom: audio player + footer */}
                        {previewUrl && (
                            <div className="border-t border-white/10 bg-[#0a0a0a] px-6 py-2 flex items-center gap-3 shrink-0">
                                <span className="text-[10px] text-gray-400 truncate max-w-[180px]">{previewLabel}</span>
                                <audio
                                    ref={audioRef}
                                    src={previewUrl}
                                    controls
                                    autoPlay
                                    className="h-7 flex-1 max-w-lg opacity-90 invert hue-rotate-180"
                                    controlsList="nodownload noplaybackrate"
                                />
                            </div>
                        )}

                        {/* Apply error */}
                        {applyError && (
                            <div className="px-6 py-2 bg-red-500/10 border-t border-red-500/20 text-sm text-red-400 shrink-0">
                                {applyError}
                            </div>
                        )}

                        {/* Footer */}
                        <div className="p-5 border-t border-white/10 bg-[#1a1a1a] flex items-center justify-between shrink-0">
                            <div className="text-sm text-gray-500">
                                {actionableCount > 0
                                    ? <>{actionableCount} slot{actionableCount !== 1 ? 's' : ''} will be updated</>
                                    : <span className="italic">No changes selected</span>}
                            </div>
                            <div className="flex gap-3">
                                <button onClick={onClose} className="px-5 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors font-medium">
                                    Cancel
                                </button>
                                <button
                                    onClick={handleApply}
                                    disabled={actionableCount === 0}
                                    className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-lg flex items-center gap-2 transition-colors"
                                >
                                    <ArrowLeftRight size={16} />
                                    Apply Sync ({actionableCount})
                                </button>
                            </div>
                        </div>
                    </>
                )}

                {/* Applying overlay (shown on top of review) */}
                {phase === 'applying' && (
                    <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-4 z-10 rounded-2xl">
                        <Loader size={36} className="text-indigo-400 animate-spin" />
                        <p className="text-gray-300 font-medium">Applying sync decisions…</p>
                    </div>
                )}
            </div>
        </div>
    );
};
