import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Trash2, AlertTriangle, X, ChevronRight, Play, Pause, RotateCcw, Volume2, Info, Skull, Folder, ScrollText } from 'lucide-react';
import type { FileRecord, TapeColor, Tape, AudioVersion } from '../types';

interface CleanupModalProps {
    isOpen: boolean;
    onClose: () => void;
    files: Record<string, FileRecord>;
    tapes: Record<TapeColor, Tape>;
    currentProjectName?: string;
    onConfirm: (deleteFileIds: string[], deleteVersionIds: Record<string, string[]>) => void;
    orphanedAssets?: { name: string, size: number }[];
    skBackups?: { timestamp: string; sizeBytes: number }[];
    onDeleteSKBackup?: (timestamp: string) => void;
    skBackupLimit?: number;
    /**
     * The `collapseHistoryOnSave` preference, mirrored read-only. What this screen has
     * left to do depends entirely on it, so it says which way it is set rather than
     * describing one of the two worlds and hoping you are in it.
     */
    collapseHistoryOnSave?: boolean;
}

const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/** "9 files · 12 steps", naming only the halves that are not zero. */
const previewCount = (p: { files: number; versions: number }) => {
    const parts: string[] = [];
    if (p.files) parts.push(`${p.files} file${p.files === 1 ? '' : 's'}`);
    if (p.versions) parts.push(`${p.versions} step${p.versions === 1 ? '' : 's'}`);
    return parts.join(' · ') || 'nothing';
};

const formatDuration = (seconds: number) => {
    if (!seconds || seconds <= 0) return '??:??';
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
};

const parseBackupTimestamp = (ts: string) => {
    // Converts YYYY-MM-DDTHH-mm-ss-msZ to YYYY-MM-DDTHH:mm:ss.msZ
    const iso = ts.replace(/(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, '$1:$2:$3.$4Z');
    const date = new Date(iso);
    return isNaN(date.getTime()) ? null : date;
};

const EXPLAINER_TONES = {
    blue: {
        on: 'bg-synthux-blue/20 border-synthux-blue/50 text-synthux-blue',
        off: 'border-white/15 text-gray-500 hover:border-synthux-blue/60 hover:text-synthux-blue',
        rule: 'border-synthux-blue/30',
    },
    red: {
        on: 'bg-red-500/20 border-red-500/50 text-red-300',
        off: 'border-white/15 text-gray-500 hover:border-red-400/60 hover:text-red-300',
        rule: 'border-red-500/30',
    },
} as const;

/**
 * Borrowed wholesale from the Settings panel: the one line that answers the question stays
 * on screen at a size that can be read, and the rest waits behind the info dot. Cleanup was
 * carrying several paragraphs of 10px grey that nobody was going to get through. None of the
 * wording is gone - what the dot opens is the text that used to be sitting there uninvited.
 */
const Explainer: React.FC<{
    short: React.ReactNode;
    more?: React.ReactNode;
    tone?: keyof typeof EXPLAINER_TONES;
    className?: string;
}> = ({ short, more, tone = 'blue', className = '' }) => {
    const [open, setOpen] = useState(false);
    const t = EXPLAINER_TONES[tone];
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
                        className={`ml-1.5 inline-flex align-[-3px] w-[15px] h-[15px] items-center justify-center rounded-full border transition-colors ${open ? t.on : t.off}`}
                    >
                        <Info size={9} />
                    </button>
                )}
            </p>
            {more && open && (
                <p className={`text-[11px] text-gray-400 leading-snug mt-2 pl-2 border-l-2 ${t.rule}`}>
                    {more}
                </p>
            )}
        </div>
    );
};

interface SelectionDotProps {
    isSelected: boolean;
    isDisabled?: boolean;
    isOriginal?: boolean;
    onClick?: () => void;
}

const SelectionDot: React.FC<SelectionDotProps> = ({ isSelected, isOriginal, isDisabled, onClick }) => (
    <button 
        onClick={(e) => { e.stopPropagation(); !isDisabled && onClick?.(); }}
        disabled={isDisabled}
        className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${
            isDisabled ? 'bg-gray-800 opacity-20' : 
            isSelected ? 'bg-red-500 shadow-lg shadow-red-500/10' : 'border-2 border-white/10 hover:border-white/30'
        }`}
    >
        {isSelected && !isDisabled && (
            isOriginal ? <AlertTriangle size={10} className="text-white fill-current" /> : <Trash2 size={10} className="text-white fill-current" />
        )}
    </button>
);

interface GlobalPlayerProps {
    playingVersion: AudioVersion | null;
    isPlaying: boolean;
    togglePlay: () => void;
    onClose: () => void;
}

const FloatingPlayer: React.FC<GlobalPlayerProps> = ({ playingVersion, isPlaying, togglePlay, onClose }) => {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [progress, setProgress] = useState(0);
    const [url, setUrl] = useState<string | null>(null);

    useEffect(() => {
        if (playingVersion?.blob) {
            const newUrl = URL.createObjectURL(playingVersion.blob);
            setUrl(newUrl);
            return () => {
                URL.revokeObjectURL(newUrl);
            };
        } else {
            setUrl(null);
        }
    }, [playingVersion]);

    useEffect(() => {
        if (audioRef.current && url) {
            if (isPlaying) {
                audioRef.current.play().catch(console.error);
            } else {
                audioRef.current.pause();
            }
        }
    }, [isPlaying, url]);

    const handleTimeUpdate = () => {
        if (audioRef.current) {
            setProgress((audioRef.current.currentTime / audioRef.current.duration) * 100);
        }
    };

    if (!playingVersion) return null;

    return (
        <div className="bg-[#1a1a1e] border border-white/10 p-3 rounded-xl flex items-center gap-4 animate-in slide-in-from-bottom-2 duration-300 shadow-2xl">
            <button 
                onClick={togglePlay}
                className="w-10 h-10 rounded-xl bg-synthux-yellow text-black flex items-center justify-center shrink-0 shadow-lg shadow-synthux-yellow/10"
            >
                {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />}
            </button>
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1.5">
                    <div className="text-[11px] font-black text-white truncate uppercase tracking-wider">{playingVersion.description || "Auditioning"}</div>
                    <div className="text-[10px] font-mono text-gray-500">{audioRef.current ? formatDuration(audioRef.current.currentTime) : '0:00'}</div>
                </div>
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div 
                        className="h-full bg-synthux-yellow rounded-full transition-all duration-100" 
                        style={{ width: `${progress}%` }}
                    />
                </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-white transition-colors">
                <X size={20} />
            </button>
            <audio 
                ref={audioRef} 
                src={url || undefined} 
                onTimeUpdate={handleTimeUpdate} 
                onEnded={() => togglePlay()}
                hidden 
            />
        </div>
    );
};

export const CleanupModal: React.FC<CleanupModalProps> = ({
    isOpen,
    onClose,
    files,
    tapes,
    currentProjectName,
    onConfirm,
    orphanedAssets = [],
    skBackups = [],
    onDeleteSKBackup,
    skBackupLimit = 5,
    collapseHistoryOnSave,
}) => {
    const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

    const [selectedFilesForDeletion, setSelectedFilesForDeletion] = useState<Set<string>>(new Set());
    const [selectedVersionsForDeletion, setSelectedVersionsForDeletion] = useState<Record<string, Set<string>>>({});
    const [playingVersion, setPlayingVersion] = useState<AudioVersion | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [confirmAction, setConfirmAction] = useState<'custom' | 'history' | 'all' | null>(null);

    const { assignedFiles, unassignedPool } = useMemo(() => {
        const usedMap = new Map<string, { color: TapeColor, index: number }[]>();
        Object.entries(tapes).forEach(([color, tape]) => {
            tape.slots.forEach((slot, idx) => {
                if (slot.fileId) {
                    const list = usedMap.get(slot.fileId) || [];
                    list.push({ color: color as TapeColor, index: idx + 1 });
                    usedMap.set(slot.fileId, list);
                }
            });
        });

        const assigned: (FileRecord & { totalSize: number, mappings: { color: TapeColor, index: number }[] })[] = [];
        const unassigned: (FileRecord & { totalSize: number, mappings: { color: TapeColor, index: number }[] })[] = [];

        Object.values(files).forEach(file => {
            const mappings = usedMap.get(file.id) || [];
            const isUsed = mappings.length > 0;
            const totalSize = file.versions.reduce((acc, v) => acc + (v.blob?.size || 0), 0);
            const record = { ...file, totalSize, mappings };

            if (isUsed) {
                if (file.versions.length > 1) assigned.push(record);
            } else {
                unassigned.push(record);
            }
        });

        return { assignedFiles: assigned, unassignedPool: unassigned };
    }, [files, tapes]);

    const resetToDefault = () => {
        setSelectedFilesForDeletion(new Set());
        const vMap: Record<string, Set<string>> = {};
        [...assignedFiles, ...unassignedPool].forEach(file => {
            const sorted = [...file.versions].sort((a, b) => a.timestamp - b.timestamp);
            const originalId = sorted[0]?.id;
            const latestId = file.currentVersionId;
            
            const erasable = file.versions.filter(v => v.id !== latestId && v.id !== originalId);
            if (erasable.length > 0) {
                vMap[file.id] = new Set(erasable.map(v => v.id));
            }
        });
        setSelectedVersionsForDeletion(vMap);
    };

    /**
     * The reset and the Escape handler used to share one effect that listed `confirmAction`
     * in its deps - so pressing a cleanup button set the confirmation, re-ran the effect,
     * and the effect's own `setConfirmAction(null)` closed it again a frame later. That is
     * the flash: the overlay mounted, unmounted, and left you back on the list. The reset
     * belongs to the modal opening and to nothing else, so it gets its own effect; only the
     * key handler needs to know which layer is on top.
     */
    useEffect(() => {
        if (!isOpen) return;
        resetToDefault();
        setConfirmAction(null);
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            // App keeps a global Escape stack that would close the whole modal underneath
            // us, so the confirmation swallows the key rather than letting it through.
            if (confirmAction) {
                e.stopPropagation();
                setConfirmAction(null);
            } else {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [isOpen, confirmAction, onClose]);

    /**
     * What each of the three buttons would take, all three costed at once.
     *
     * This used to compute only the option being confirmed, which meant the footer could
     * not say what any of them cost until after you had already pressed one — you chose
     * first and found out second. Costing all three is the same walk over the same files.
     */
    const previews = useMemo(() => {
        const everyFile = [...assignedFiles, ...unassignedPool];
        const blank = () => ({ files: 0, versions: 0, bytes: 0 });

        const custom = blank();
        everyFile.forEach(f => {
            if (selectedFilesForDeletion.has(f.id)) {
                custom.files++;
                custom.bytes += f.totalSize;
            } else {
                const selected = selectedVersionsForDeletion[f.id];
                if (selected) {
                    f.versions.forEach(v => {
                        if (selected.has(v.id)) {
                            custom.versions++;
                            custom.bytes += (v.blob?.size || 0);
                        }
                    });
                }
            }
        });

        const history = blank();
        everyFile.forEach(f => {
            const sorted = [...f.versions].sort((a, b) => a.timestamp - b.timestamp);
            const originalId = sorted[0]?.id;
            f.versions
                .filter(v => v.id !== f.currentVersionId && v.id !== originalId)
                .forEach(v => {
                    history.versions++;
                    history.bytes += (v.blob?.size || 0);
                });
        });

        const all = blank();
        unassignedPool.forEach(f => {
            all.files++;
            all.bytes += f.totalSize;
        });
        assignedFiles.forEach(f => {
            f.versions
                .filter(v => v.id !== f.currentVersionId)
                .forEach(v => {
                    all.versions++;
                    all.bytes += (v.blob?.size || 0);
                });
        });

        // Orphans are swept by `cleanOrphanedAssets` on every confirm, whichever button
        // you pressed, so they are part of all three figures. Their *count* used to be
        // left out while their bytes were counted, which is how a confirmation could read
        // "0 files" and still free megabytes.
        (orphanedAssets ?? []).forEach(o => {
            [custom, history, all].forEach(p => {
                p.files++;
                p.bytes += o.size;
            });
        });

        return { custom, history, all };
    }, [assignedFiles, unassignedPool, selectedFilesForDeletion, selectedVersionsForDeletion, orphanedAssets]);

    const { totalSavings, totalFilesToDelete, totalVersionsToDelete } = useMemo(() => {
        // No confirmation open means the footer is previewing the custom selection, which
        // is what the Est. Saving card has always shown.
        const active = previews[confirmAction ?? 'custom'];
        const savings = active.bytes;
        const filesToDelete = active.files;
        const versionsToDelete = active.versions;
        
        return { totalSavings: savings, totalFilesToDelete: filesToDelete, totalVersionsToDelete: versionsToDelete };
    }, [previews, confirmAction]);

    const toggleFileDeletion = (fileId: string) => {
        const next = new Set(selectedFilesForDeletion);
        if (next.has(fileId)) next.delete(fileId);
        else next.add(fileId);
        setSelectedFilesForDeletion(next);
    };

    const toggleVersionDeletion = (fileId: string, versionId: string) => {
        const nextMap = { ...selectedVersionsForDeletion };
        const nextSet = new Set(nextMap[fileId] || []);
        if (nextSet.has(versionId)) nextSet.delete(versionId);
        else nextSet.add(versionId);
        nextMap[fileId] = nextSet;
        setSelectedVersionsForDeletion(nextMap);
    };

    const selectAllInCategory = (files: any[], deleteFile: boolean) => {
        const nextFiles = new Set(selectedFilesForDeletion);
        const nextVersions = { ...selectedVersionsForDeletion };
        files.forEach(f => {
            if (deleteFile) nextFiles.add(f.id);
            const sorted = [...f.versions].sort((a, b) => a.timestamp - b.timestamp);
            const originalId = sorted[0]?.id;
            const erasable = f.versions.filter((v: any) => v.id !== f.currentVersionId && v.id !== originalId);
            nextVersions[f.id] = new Set(erasable.map((v: any) => v.id));
        });
        setSelectedFilesForDeletion(nextFiles);
        setSelectedVersionsForDeletion(nextVersions);
    };

    const deselectAllInCategory = (files: any[]) => {
        const nextFiles = new Set(selectedFilesForDeletion);
        const nextVersions = { ...selectedVersionsForDeletion };
        files.forEach(f => {
            nextFiles.delete(f.id);
            delete nextVersions[f.id];
        });
        setSelectedFilesForDeletion(nextFiles);
        setSelectedVersionsForDeletion(nextVersions);
    };

    const playVersion = (v: AudioVersion) => {
        if (playingVersion?.id === v.id) {
            setIsPlaying(!isPlaying);
        } else {
            setPlayingVersion(v);
            setIsPlaying(true);
        }
    };

    /**
     * All three buttons opened an identical "are you sure", which gave you the counts but
     * never said which of the three you had pressed - the one thing worth confirming.
     */
    const CONFIRM_COPY = {
        custom: 'Deletes exactly what you ticked in the lists above.',
        history: 'Keeps the original and the current step of every file; everything in between goes.',
        all: 'Keeps only the current step of files on a tape, and deletes the unused pool outright.',
    } as const;

    const handleExecuteCleanup = () => {
        if (!confirmAction) return;

        if (confirmAction === 'history') {
            const vMap: Record<string, string[]> = {};
            [...assignedFiles, ...unassignedPool].forEach(f => {
                const toClean = f.versions.filter(v => v.id !== f.currentVersionId && f.versions[0] && v.id !== f.versions[0].id);
                if (toClean.length > 0) vMap[f.id] = toClean.map(v => v.id);
            });
            onConfirm([], vMap);
        } else if (confirmAction === 'all') {
            const vMap: Record<string, string[]> = {};
            assignedFiles.forEach(f => {
                const toClean = f.versions.filter(v => v.id !== f.currentVersionId);
                if (toClean.length > 0) vMap[f.id] = toClean.map(v => v.id);
            });
            onConfirm(unassignedPool.map(f => f.id), vMap);
        } else {
            const versionMap: Record<string, string[]> = {};
            Object.entries(selectedVersionsForDeletion).forEach(([fid, vset]: [string, Set<string>]) => {
                if (vset.size > 0) versionMap[fid] = Array.from(vset);
            });
            onConfirm(Array.from(selectedFilesForDeletion), versionMap);
        }
        setConfirmAction(null);
    };

    const FileRow = ({ file, isUnassigned }: { file: any, isUnassigned: boolean }) => {
        const isFileSelected = selectedFilesForDeletion.has(file.id);
        const isExpanded = expandedFiles.has(file.id);

        const { versionsToDeleteCount, sizeToDelete } = useMemo(() => {
            if (isFileSelected) return { versionsToDeleteCount: file.versions.length, sizeToDelete: file.totalSize };
            const selected = selectedVersionsForDeletion[file.id];
            if (!selected) return { versionsToDeleteCount: 0, sizeToDelete: 0 };
            let size = 0;
            file.versions.forEach((v: any) => {
                if (selected.has(v.id)) size += (v.blob?.size || 0);
            });
            return { versionsToDeleteCount: selected.size, sizeToDelete: size };
        }, [isFileSelected, file, selectedVersionsForDeletion]);
        
        return (
            <div className={`bg-white/5 border border-white/5 rounded-lg overflow-hidden transition-all hover:bg-white/[0.08] ${isFileSelected ? 'ring-1 ring-red-500/30' : ''}`}>
                <div className="p-3 flex items-center justify-between cursor-pointer" onClick={() => {
                    const next = new Set(expandedFiles);
                    if (next.has(file.id)) next.delete(file.id);
                    else next.add(file.id);
                    setExpandedFiles(next);
                }}>
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                        {isUnassigned ? (
                            <SelectionDot isSelected={isFileSelected} onClick={() => toggleFileDeletion(file.id)} />
                        ) : (
                            <div className="w-5 h-5 flex items-center justify-center text-white/20">
                                <Volume2 size={12} />
                            </div>
                        )}
                        <div className="min-w-0">
                            <div className={`text-sm font-bold truncate flex items-center gap-2 transition-colors ${isFileSelected ? 'text-red-500' : 'text-white'}`}>
                                {file.name}
                                {isFileSelected && <span className="text-[8px] text-red-500 font-black uppercase tracking-widest px-1 bg-red-500/10 rounded">Purge All</span>}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 mt-0.5 font-mono">
                                <span className="text-[10px] text-gray-500">{formatSize(file.totalSize)}</span>
                                <span className="text-[10px] text-gray-500">• {file.versions.length} Steps</span>
                                {!isFileSelected && versionsToDeleteCount > 0 && (
                                    <span className="text-[9px] text-red-500 font-bold uppercase tracking-tighter bg-red-500/5 px-1.5 rounded flex items-center gap-1 leading-none py-1">
                                        <Trash2 size={8} /> {versionsToDeleteCount} Versions / {formatSize(sizeToDelete)} will be deleted
                                    </span>
                                )}
                                <div className="flex items-center gap-1 ml-1">
                                    {file.mappings.map((m: any, i: number) => (
                                        <span key={i} className="px-1 py-0.5 rounded font-bold uppercase tracking-tighter text-[9px]" style={{ backgroundColor: `var(--color-synthux-${m.color.toLowerCase()})15`, color: `var(--color-synthux-${m.color.toLowerCase()})` }}>{m.color} {m.index}</span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                    <ChevronRight size={16} className={`text-gray-600 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                </div>
                
                {isExpanded && (
                    <div className="px-5 pb-5 pt-1 space-y-1.5 bg-black/40 border-t border-white/5 animate-in fade-in duration-300">
                        {(() => {
                            const sortedByTime = [...file.versions].sort((a: AudioVersion, b: AudioVersion) => a.timestamp - b.timestamp);
                            if (sortedByTime.length === 0) return null;

                            const original = sortedByTime[0];
                            const latest = file.versions.find((v: AudioVersion) => v.id === file.currentVersionId) || sortedByTime[sortedByTime.length - 1];
                            
                            const history = file.versions
                                .filter((v: AudioVersion) => v.id !== latest.id && v.id !== original.id)
                                .sort((a: AudioVersion, b: AudioVersion) => b.timestamp - a.timestamp);
                            
                            const renderV = (v: AudioVersion, type: 'latest' | 'history' | 'original') => {
                                const isSelected = isFileSelected || selectedVersionsForDeletion[file.id]?.has(v.id);
                                const isLatest = type === 'latest';
                                const isOriginal = type === 'original';
                                
                                return (
                                    <div key={v.id} className={`flex items-center justify-between p-2 rounded-xl transition-colors group/v ${type === 'history' ? 'ml-6 bg-white/[0.03] hover:bg-white/[0.08]' : 'bg-white/5 hover:bg-white/10'} ${isOriginal ? 'ring-1 ring-red-500/10' : ''}`}>
                                        <div className="flex items-center gap-3 flex-1 min-w-0 pr-4">
                                            {isLatest ? (
                                                <div className="w-5 h-5 flex items-center justify-center text-white/10">
                                                    <RotateCcw size={10} />
                                                </div>
                                            ) : (
                                                <SelectionDot 
                                                    isSelected={isSelected} 
                                                    isOriginal={isOriginal}
                                                    onClick={() => toggleVersionDeletion(file.id, v.id)}
                                                />
                                            )}
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <div className={`text-[12px] font-bold truncate transition-colors ${isSelected ? 'text-red-500' : 'text-gray-200'}`}>
                                                        {v.description || "Unlabeled Step"}
                                                    </div>
                                                    {isOriginal && <AlertTriangle size={10} className="text-red-500" />}
                                                    {isOriginal && <span className="text-[8px] font-black text-red-500 px-1 rounded uppercase tracking-tighter">Original</span>}
                                                    {isLatest && <span className="text-[8px] font-black text-synthux-yellow px-1 rounded uppercase tracking-tighter">Active Slot</span>}
                                                </div>
                                                <div className="text-[9px] text-gray-600 font-mono mt-0.5 italic">
                                                    {formatSize(v.blob?.size || 0)} • {formatDuration(v.duration)} • {new Date(v.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                                                </div>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); playVersion(v); }}
                                            className={`w-8 h-8 rounded-lg transition-all flex items-center justify-center ${playingVersion?.id === v.id ? 'bg-synthux-yellow text-black shadow-lg shadow-synthux-yellow/10' : 'bg-white/5 text-gray-500 hover:text-white'}`}
                                        >
                                            {(playingVersion?.id === v.id && isPlaying) ? <Pause size={14} /> : <Play size={14} />}
                                        </button>
                                    </div>
                                );
                            };

                            return (
                                <>
                                    {renderV(latest, 'latest')}
                                    {history.map((v: AudioVersion) => renderV(v, 'history'))}
                                    {original.id !== latest.id && renderV(original, 'original')}
                                </>
                            );
                        })()}
                    </div>
                )}
            </div>
        );
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-synthux-panel border border-gray-700 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col h-[80vh] min-h-[600px] max-h-[95vh] relative">
                
                {/* Header */}
                <div className="px-8 py-6 border-b border-gray-800 flex items-center justify-between bg-synthux-panel shrink-0">
                    <div className="flex items-center gap-5">
                        <div className="p-4 bg-red-500/20 text-red-500 rounded-xl shadow-lg ring-1 ring-red-500/20">
                            <Trash2 size={32} strokeWidth={2.5} />
                        </div>
                        <div>
                            <h2 className="text-3xl font-black text-white tracking-tight leading-none uppercase italic">Project Cleanup</h2>
                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.3em] mt-2 flex items-center gap-2">
                                <RotateCcw size={10} /> {currentProjectName || "Active Project"}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-12 h-12 flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/5 rounded-lg transition-all">
                        <X size={28} />
                    </button>
                </div>

                {/* Body with Static Texture */}
                <div className="flex-1 relative overflow-hidden bg-synthux-main noise-texture group/body">
                    <div className="absolute inset-0 overflow-y-auto custom-scrollbar p-8 space-y-8 pb-32">
                        
                        {/* Explainer and lists follow... */}

                        {/* Prominent Explainer */}
                        <div className="bg-synthux-blue/5 border border-synthux-blue/20 rounded-xl p-6 flex gap-5 shadow-2xl shadow-synthux-blue/5">
                            {/* Was a large Info glyph, which now collides with the info dot the
                                explainer carries - the panel keeps its mark, not a second one. */}
                            <div className="p-3.5 bg-synthux-blue/20 text-synthux-blue rounded-lg shrink-0 h-fit">
                                <Trash2 size={28} />
                            </div>
                            <div className="space-y-2 min-w-0">
                                <h4 className="text-sm font-black uppercase text-synthux-blue italic tracking-widest">What cleanup does</h4>
                                <Explainer
                                    short={<>Every file keeps its <span className="text-white font-black">original</span> and its <span className="text-white font-black">latest saved step</span>. The steps in between are what gets freed.</>}
                                    more={<>This applies to files on a tape and to files sitting in the unused pool alike. Beyond history, this screen is also the only way to reach the leftovers: orphaned assets on disk, pool files you no longer want, and old SK backups.</>}
                                />
                                {typeof collapseHistoryOnSave === 'boolean' && (
                                    <div className={`mt-3 flex items-start gap-3 rounded-lg border px-3.5 py-2.5 ${collapseHistoryOnSave
                                        ? 'border-teal-500/25 bg-teal-500/[0.07]'
                                        : 'border-amber-500/25 bg-amber-500/[0.07]'
                                        }`}>
                                        <div className={`mt-0.5 w-8 h-[18px] rounded-full p-0.5 shrink-0 ${collapseHistoryOnSave ? 'bg-teal-500' : 'bg-white/15'}`}>
                                            <div className={`w-[14px] h-[14px] rounded-full bg-white ${collapseHistoryOnSave ? 'translate-x-[14px]' : 'translate-x-0'}`} />
                                        </div>
                                        <p className={`text-[11px] leading-snug min-w-0 ${collapseHistoryOnSave ? 'text-teal-200/90' : 'text-amber-200/90'}`}>
                                            {collapseHistoryOnSave ? (
                                                <><span className="font-black">Saving already does this.</span> There is usually little history left to reclaim here — the leftovers below are the point.</>
                                            ) : (
                                                <><span className="font-black">Saving is keeping every step.</span> History piles up until you clear it here.</>
                                            )}
                                            <span className="block text-[10px] opacity-60 mt-1">Settings ▸ Files ▸ History &amp; cleanup</span>
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Stats */}
                        <div className="grid grid-cols-3 gap-6">
                            <div className="bg-white/5 border border-white/5 p-5 rounded-xl text-center group">
                                <div className="text-3xl font-black text-white tracking-tighter leading-none">{unassignedPool.length}</div>
                                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-2 opacity-60">Unassigned</div>
                            </div>
                            <div className="bg-white/5 border border-white/5 p-5 rounded-xl text-center group">
                                <div className="text-3xl font-black text-white tracking-tighter leading-none">{assignedFiles.length}</div>
                                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-2 opacity-60">Modified</div>
                            </div>
                            <div className="bg-red-500/5 border border-red-500/10 p-5 rounded-xl text-center ring-1 ring-red-500/20 shadow-lg shadow-red-500/5">
                                <div className="text-3xl font-black text-red-500 tracking-tighter leading-none">{formatSize(totalSavings)}</div>
                                <div className="text-[10px] font-bold text-red-500/60 uppercase tracking-widest mt-2">Est. Saving</div>
                            </div>
                        </div>

                        {/* SECTIONS */}
                        {assignedFiles.length > 0 && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between px-2">
                                    <h3 className="text-xs font-black text-gray-500 uppercase tracking-[0.3em]">Assigned to Tape</h3>
                                    <div className="flex gap-4">
                                        <button onClick={() => selectAllInCategory(assignedFiles, false)} className="text-[10px] font-black text-white/30 hover:text-synthux-orange uppercase tracking-widest transition-colors">All</button>
                                        <button onClick={() => deselectAllInCategory(assignedFiles)} className="text-[10px] font-black text-white/30 hover:text-synthux-orange uppercase tracking-widest transition-colors">None</button>
                                        <button onClick={resetToDefault} className="text-[10px] font-black text-synthux-blue hover:text-white uppercase tracking-widest transition-colors">Default</button>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    {assignedFiles.map(file => <FileRow key={file.id} file={file} isUnassigned={false} />)}
                                </div>
                            </div>
                        )}

                        {unassignedPool.length > 0 && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between px-2">
                                    <h3 className="text-xs font-black text-gray-500 uppercase tracking-[0.3em]">Unassigned Pool</h3>
                                    <div className="flex gap-4">
                                        <button onClick={() => selectAllInCategory(unassignedPool, true)} className="text-[10px] font-black text-white/30 hover:text-synthux-orange uppercase tracking-widest transition-colors">All</button>
                                        <button onClick={() => deselectAllInCategory(unassignedPool)} className="text-[10px] font-black text-white/30 hover:text-synthux-orange uppercase tracking-widest transition-colors">None</button>
                                        <button onClick={resetToDefault} className="text-[10px] font-black text-synthux-blue hover:text-white uppercase tracking-widest transition-colors">Default</button>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    {unassignedPool.map(file => <FileRow key={file.id} file={file} isUnassigned={true} />)}
                                </div>
                            </div>
                        )}

                        {orphanedAssets && orphanedAssets.length > 0 && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between px-2">
                                    <div className="flex items-center gap-3">
                                        <h3 className="text-xs font-black text-red-500/60 uppercase tracking-[0.3em]">Orphaned Disk Assets</h3>
                                        <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-[9px] text-red-500 font-mono">{orphanedAssets.length} files</span>
                                    </div>
                                </div>
                                
                                <div className="bg-red-500/5 border border-red-500/10 rounded-xl p-5 flex gap-4">
                                    <div className="p-3 bg-red-500/20 text-red-500 rounded-xl shrink-0 h-fit">
                                        <Skull size={20} />
                                    </div>
                                    <div className="space-y-1 min-w-0">
                                        <h4 className="text-[11px] font-black uppercase text-red-500 tracking-wider">Left behind on disk</h4>
                                        <Explainer
                                            tone="red"
                                            short={<>These files sit in the project folder, but nothing in the project points at them any more.</>}
                                            more={<>They go with whichever button you confirm below - there is no way to keep them from this screen. Nothing the project is still using can appear in this list.</>}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                                    {orphanedAssets.map((asset: { name: string, size: number }) => (
                                        <div key={asset.name} className="flex items-center justify-between bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3 group">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center text-red-500/40">
                                                    <Trash2 size={14} />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="text-[12px] font-bold text-gray-300 truncate">{asset.name}</div>
                                                    <div className="text-[9px] text-gray-600 font-mono">{formatSize(asset.size)}</div>
                                                </div>
                                            </div>
                                            <div className="text-[8px] font-black text-red-500/40 uppercase tracking-tighter border border-red-500/10 px-1.5 py-0.5 rounded">Orphan</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* SK Backups Section */}
                        {(skBackups.length > 0 || onDeleteSKBackup) && (
                            <div className="space-y-4 pt-4 border-t border-white/5">
                                <div className="flex items-center justify-between px-2">
                                    <div className="flex items-center gap-3">
                                        <h3 className="text-xs font-black text-white/40 uppercase tracking-[0.3em]">SK Backups</h3>
                                        <span className="px-2 py-0.5 rounded-full bg-white/5 text-[9px] text-gray-500 font-mono">{skBackups.length} / {skBackupLimit} kept</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-[9px] text-gray-600 font-bold uppercase tracking-widest bg-white/5 px-2 py-1 rounded-lg">
                                        <Folder size={10} /> Local Storage
                                    </div>
                                </div>

                                {/* Explainer for Backups */}
                                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 flex gap-4">
                                    <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                                        <RotateCcw size={16} className="text-gray-500" />
                                    </div>
                                    <Explainer
                                        className="min-w-0"
                                        short={<>Whole-project snapshots, written automatically to <span className="text-gray-300 font-mono">_sk_backups</span> in your project folder.</>}
                                        more={<>They are the safety net for restoring a project outright, and the three cleanup buttons below never touch them. Delete them one at a time here; the oldest drops off on its own once the kept count is reached.</>}
                                    />
                                </div>

                                {skBackups.length === 0 ? (
                                    <p className="text-[11px] text-gray-600 italic px-2">No SK backups found for this project.</p>
                                ) : (
                                    <div className="space-y-2">
                                        {[...skBackups]
                                            .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
                                            .map(bk => {
                                                const date = parseBackupTimestamp(bk.timestamp);
                                                return (
                                                    <div key={bk.timestamp} className="flex items-center justify-between bg-white/5 border border-white/5 rounded-xl px-4 py-3 group/bk hover:bg-white/[0.08] transition-colors">
                                                        <div className="flex items-center gap-4">
                                                            <div className="w-10 h-10 rounded-xl bg-black/40 flex items-center justify-center text-gray-600">
                                                                <ScrollText size={18} />
                                                            </div>
                                                            <div>
                                                                <p className="text-xs text-white font-black tracking-tight">
                                                                    {date ? date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : "Unknown Snapshot"}
                                                                </p>
                                                                <div className="flex items-center gap-2 mt-0.5">
                                                                    <span className="text-[10px] text-gray-500 font-mono uppercase tracking-tighter">{formatSize(bk.sizeBytes)}</span>
                                                                    <span className="text-[10px] text-gray-700">•</span>
                                                                    <span className="text-[10px] text-gray-600 font-mono">{bk.timestamp.split('T')[0]}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        {onDeleteSKBackup && (
                                                            <button
                                                                onClick={() => onDeleteSKBackup(bk.timestamp)}
                                                                className="p-3 bg-white/0 hover:bg-red-500/10 rounded-xl text-gray-600 hover:text-red-400 transition-all active:scale-95"
                                                                title="Delete this SK backup"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Fixed Player inside Body bounds */}
                    <div className="absolute inset-x-0 bottom-6 px-6 pointer-events-none z-20">
                        <div className="pointer-events-auto max-w-sm mx-auto">
                            <FloatingPlayer 
                                playingVersion={playingVersion} 
                                isPlaying={isPlaying} 
                                togglePlay={() => setIsPlaying(!isPlaying)} 
                                onClose={() => { setPlayingVersion(null); setIsPlaying(false); }}
                            />
                        </div>
                    </div>
                </div>


                {/* Footer */}
                <div className="p-8 border-t border-gray-800 bg-synthux-panel flex items-center justify-between shrink-0 gap-4 z-50">
                    <button onClick={onClose} className="px-6 py-4 text-xs font-black text-gray-500 hover:text-white uppercase tracking-[0.2em] transition-all">Cancel</button>
                    <div className="flex gap-3 flex-1 min-w-0">
                        {/* Each button now carries what it costs, so the three can be compared
                            before one is pressed rather than after. */}
                        <button onClick={() => setConfirmAction('custom')} disabled={previews.custom.bytes === 0} className="flex-1 px-4 py-3 bg-white/5 hover:bg-white/10 text-white text-[11px] font-black rounded-lg border border-white/10 disabled:opacity-20 transition-all uppercase tracking-widest">
                            <span className="block opacity-50 text-[10px] mb-0.5 tracking-tight normal-case">What you ticked</span>
                            Clean Custom
                            <span className="block mt-1 text-[10px] font-bold normal-case tracking-normal text-white/50">
                                {previewCount(previews.custom)} · {formatSize(previews.custom.bytes)}
                            </span>
                        </button>
                        <button onClick={() => setConfirmAction('history')} className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-500 text-white text-[11px] font-black rounded-lg shadow-xl shadow-red-600/20 transition-all uppercase tracking-widest group">
                            <span className="block opacity-70 text-[10px] mb-0.5 tracking-tight normal-case group-hover:opacity-100 transition-opacity">Keeps original + current</span>
                            History Only
                            <span className="block mt-1 text-[10px] font-bold normal-case tracking-normal text-white/70">
                                {previewCount(previews.history)} · {formatSize(previews.history.bytes)}
                            </span>
                        </button>
                        <button onClick={() => setConfirmAction('all')} className="flex-1 px-4 py-3 bg-white/5 hover:bg-red-900/40 text-red-500 text-[11px] font-black rounded-lg border border-red-500/20 transition-all uppercase tracking-widest group">
                            <span className="block opacity-60 text-[10px] mb-0.5 tracking-tight normal-case group-hover:opacity-100 transition-opacity">Keeps current only</span>
                            <span className="flex items-center gap-2 justify-center">
                                <Trash2 size={14} className="group-hover:scale-110 transition-transform" /> Clean All
                            </span>
                            <span className="block mt-1 text-[10px] font-bold normal-case tracking-normal text-red-500/60">
                                {previewCount(previews.all)} · {formatSize(previews.all.bytes)}
                            </span>
                        </button>
                    </div>
                </div>

                {/* Confirmation Overlay at Modal Level */}
                {confirmAction && (
                    <div className="absolute inset-0 z-[110] bg-[#0c0c0e]/95 flex flex-col items-center justify-center p-8 text-center animate-in zoom-in-95 duration-200 backdrop-blur-sm overflow-y-auto custom-scrollbar">
                        <div className="w-24 h-24 rounded-full bg-red-500/20 text-red-500 flex items-center justify-center mb-6 ring-2 ring-red-500/30 shadow-2xl shadow-red-500/10">
                            <Skull size={48} />
                        </div>
                        <h3 className="text-3xl font-black text-white uppercase italic tracking-tight mb-3">Are you sure?</h3>
                        <p className="text-[15px] text-red-300 font-bold leading-snug mb-6 max-w-lg">{CONFIRM_COPY[confirmAction]}</p>
                        <div className="max-w-lg w-full space-y-5 mb-10">
                            {/* The counts were a 14px sentence with the numbers set inline, which
                                put the one thing worth checking at the size of everything else.
                                They read as figures now, in the same language as the modal's own
                                stat cards. */}
                            <div className="grid grid-cols-3 gap-3">
                                {([
                                    [String(totalFilesToDelete), 'Files'],
                                    [String(totalVersionsToDelete), 'History steps'],
                                    [formatSize(totalSavings), 'Freed'],
                                ] as const).map(([value, label]) => (
                                    <div key={label} className="bg-red-500/[0.07] border border-red-500/20 rounded-xl px-2 py-4">
                                        <div className="text-2xl font-black text-red-500 tracking-tighter leading-none tabular-nums whitespace-nowrap">{value}</div>
                                        <div className="text-[10px] font-bold text-red-500/60 uppercase tracking-widest mt-2">{label}</div>
                                    </div>
                                ))}
                            </div>
                            <div className="p-5 bg-red-500/5 border border-red-500/20 rounded-xl text-left">
                                <div className="flex gap-4">
                                    <AlertTriangle size={20} className="shrink-0 text-red-500 mt-px" />
                                    <Explainer
                                        tone="red"
                                        className="min-w-0"
                                        short={<span className="text-[13px] text-red-100 font-bold">The project cannot undo this.</span>}
                                        more={<>The project database keeps no record of what was removed. The files may still turn up in your OS Trash, but the project will not recognise or re-link them.</>}
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="flex flex-col gap-3 w-full max-w-[320px]">
                            <button 
                                onClick={handleExecuteCleanup}
                                className="w-full py-5 bg-red-600 hover:bg-red-400 text-white font-black rounded-lg shadow-2xl shadow-red-600/30 uppercase tracking-[0.2em] transition-all text-sm active:scale-95"
                            >
                                Destroy Permanently
                            </button>
                            <button 
                                onClick={() => setConfirmAction(null)}
                                className="w-full py-4 text-[10px] font-black text-gray-400 hover:text-white uppercase tracking-[0.3em] transition-all"
                            >
                                <X size={12} className="inline mr-2" /> Back to Safety
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
