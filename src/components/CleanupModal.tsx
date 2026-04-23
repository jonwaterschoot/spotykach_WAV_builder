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
}

const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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
        <div className="bg-[#1a1a1e] border border-white/10 p-3 rounded-2xl flex items-center gap-4 animate-in slide-in-from-bottom-2 duration-300 shadow-2xl">
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

    useEffect(() => {
        if (isOpen) {
            resetToDefault();
            setConfirmAction(null);
        }
    }, [isOpen, assignedFiles, unassignedPool]);

    const { totalSavings, totalFilesToDelete, totalVersionsToDelete } = useMemo(() => {
        let savings = 0;
        let filesToDelete = 0;
        let versionsToDelete = 0;

        if (confirmAction === 'history') {
            [...assignedFiles, ...unassignedPool].forEach(f => {
                const sorted = [...f.versions].sort((a, b) => a.timestamp - b.timestamp);
                const originalId = sorted[0]?.id;
                const toClean = f.versions.filter(v => v.id !== f.currentVersionId && v.id !== originalId);
                toClean.forEach(v => {
                    savings += (v.blob?.size || 0);
                    versionsToDelete++;
                });
            });
        } else if (confirmAction === 'all') {
            unassignedPool.forEach(f => {
                savings += f.totalSize;
                filesToDelete++;
            });
            assignedFiles.forEach(f => {
                const toClean = f.versions.filter(v => v.id !== f.currentVersionId);
                toClean.forEach(v => {
                    savings += (v.blob?.size || 0);
                    versionsToDelete++;
                });
            });
        } else {
            // Custom or preview mode
            [...assignedFiles, ...unassignedPool].forEach(f => {
                if (selectedFilesForDeletion.has(f.id)) {
                    savings += f.totalSize;
                    filesToDelete++;
                } else {
                    const selected = selectedVersionsForDeletion[f.id];
                    if (selected) {
                        f.versions.forEach(v => {
                            if (selected.has(v.id)) {
                                savings += (v.blob?.size || 0);
                                versionsToDelete++;
                            }
                        });
                    }
                }
            });
        }
        
        // Add orphaned assets to savings
        if (orphanedAssets) {
            orphanedAssets.forEach((o: { name: string, size: number }) => {
                savings += o.size;
            });
        }

        return { totalSavings: savings, totalFilesToDelete: filesToDelete, totalVersionsToDelete: versionsToDelete };
    }, [confirmAction, selectedFilesForDeletion, selectedVersionsForDeletion, assignedFiles, unassignedPool]);

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
            <div className={`bg-white/5 border border-white/5 rounded-2xl overflow-hidden transition-all hover:bg-white/[0.08] ${isFileSelected ? 'ring-1 ring-red-500/30' : ''}`}>
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
            <div className="bg-synthux-panel border border-gray-700 rounded-[24px] shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col h-[80vh] min-h-[600px] max-h-[95vh] relative">
                
                {/* Header */}
                <div className="px-8 py-6 border-b border-gray-800 flex items-center justify-between bg-synthux-panel shrink-0">
                    <div className="flex items-center gap-5">
                        <div className="p-4 bg-red-500/20 text-red-500 rounded-3xl shadow-lg ring-1 ring-red-500/20">
                            <Trash2 size={32} strokeWidth={2.5} />
                        </div>
                        <div>
                            <h2 className="text-3xl font-black text-white tracking-tight leading-none uppercase italic">Project Cleanup</h2>
                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.3em] mt-2 flex items-center gap-2">
                                <RotateCcw size={10} /> {currentProjectName || "Active Project"}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-12 h-12 flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/5 rounded-2xl transition-all">
                        <X size={28} />
                    </button>
                </div>

                {/* Body with Static Texture */}
                <div className="flex-1 relative overflow-hidden bg-synthux-main noise-texture group/body">
                    <div className="absolute inset-0 overflow-y-auto custom-scrollbar p-8 space-y-8 pb-32">
                        
                        {/* Explainer and lists follow... */}

                        {/* Prominent Explainer */}
                        <div className="bg-synthux-blue/5 border border-synthux-blue/20 rounded-[24px] p-7 flex gap-5 shadow-2xl shadow-synthux-blue/5">
                            <div className="p-4 bg-synthux-blue/20 text-synthux-blue rounded-2xl shrink-0 h-fit">
                                <Info size={32} />
                            </div>
                            <div className="space-y-2">
                                <h4 className="text-sm font-black uppercase text-synthux-blue italic tracking-widest">Standard Protocol</h4>
                                <p className="text-xs text-gray-400 leading-relaxed font-medium">
                                    Standard cleanup preserves the <span className="text-white font-black underline decoration-synthux-blue decoration-4 underline-offset-4">Original</span> file and the <span className="text-white font-black underline decoration-synthux-blue decoration-4 underline-offset-4">Latest Saved Step</span> for every file. 
                                    <br/><br/>
                                    Intermediate history versions of both assigned and unused pool files are marked for removal to free up memory.
                                </p>
                            </div>
                        </div>

                        {/* Stats */}
                        <div className="grid grid-cols-3 gap-6">
                            <div className="bg-white/5 border border-white/5 p-6 rounded-[32px] text-center group">
                                <div className="text-3xl font-black text-white tracking-tighter leading-none">{unassignedPool.length}</div>
                                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-2 opacity-60">Unassigned</div>
                            </div>
                            <div className="bg-white/5 border border-white/5 p-6 rounded-[32px] text-center group">
                                <div className="text-3xl font-black text-white tracking-tighter leading-none">{assignedFiles.length}</div>
                                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-2 opacity-60">Modified</div>
                            </div>
                            <div className="bg-red-500/5 border border-red-500/10 p-6 rounded-[32px] text-center ring-1 ring-red-500/20 shadow-lg shadow-red-500/5">
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
                                
                                <div className="bg-red-500/5 border border-red-500/10 rounded-[24px] p-5 flex gap-4">
                                    <div className="p-3 bg-red-500/20 text-red-500 rounded-xl shrink-0 h-fit">
                                        <Skull size={20} />
                                    </div>
                                    <div className="space-y-1">
                                        <h4 className="text-[11px] font-black uppercase text-red-500 tracking-wider">Lingering Data Detected</h4>
                                        <p className="text-[10px] text-gray-500 leading-relaxed font-medium">
                                            The following files exist in the project folder but are no longer referenced by any project record. They will be deleted upon confirmation.
                                        </p>
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
                                <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 flex gap-4">
                                    <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                                        <RotateCcw size={16} className="text-gray-500" />
                                    </div>
                                    <div className="text-[11px] text-gray-500 leading-relaxed italic">
                                        These are full project snapshots automatically saved to the <span className="text-gray-400 font-mono">_sk_backups</span> folder in your project directory. 
                                        They act as safety nets for complete project restoration.
                                    </div>
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
                    <div className="flex gap-3">
                        <button onClick={() => setConfirmAction('custom')} disabled={totalSavings === 0} className="px-6 py-4 bg-white/5 hover:bg-white/10 text-white text-[11px] font-black rounded-2xl border border-white/10 disabled:opacity-20 transition-all uppercase tracking-widest">
                            <span className="block opacity-40 text-[9px] mb-0.5 tracking-tight">Manual Selection</span>
                            Clean Custom
                        </button>
                        <button onClick={() => setConfirmAction('history')} className="px-10 py-4 bg-red-600 hover:bg-red-500 text-white text-[11px] font-black rounded-2xl shadow-xl shadow-red-600/20 transition-all uppercase tracking-widest group">
                            <span className="block opacity-70 text-[9px] mb-0.5 tracking-tight group-hover:opacity-100 transition-opacity">Keep original + current verison</span>
                            History Only
                        </button>
                        <button onClick={() => setConfirmAction('all')} className="px-8 py-4 bg-white/5 hover:bg-red-900/40 text-red-500 text-[11px] font-black rounded-2xl border border-red-500/20 transition-all uppercase tracking-widest group">
                            <span className="block opacity-60 text-[9px] mb-0.5 tracking-tight group-hover:opacity-100 transition-opacity">Delete history + original</span>
                            <span className="flex items-center gap-2 justify-center">
                                <Trash2 size={14} className="group-hover:scale-110 transition-transform" /> Clean All
                            </span>
                        </button>
                    </div>
                </div>

                {/* Confirmation Overlay at Modal Level */}
                {confirmAction && (
                    <div className="absolute inset-0 z-[110] bg-[#0c0c0e]/95 flex flex-col items-center justify-center p-8 text-center animate-in zoom-in-95 duration-200 backdrop-blur-sm">
                        <div className="w-24 h-24 rounded-full bg-red-500/20 text-red-500 flex items-center justify-center mb-6 ring-2 ring-red-500/30 shadow-2xl shadow-red-500/10">
                            <Skull size={48} />
                        </div>
                        <h3 className="text-3xl font-black text-white uppercase italic tracking-tight mb-4">Are you sure?</h3>
                        <div className="max-w-md space-y-4 mb-10">
                            <p className="text-gray-400 text-sm leading-relaxed text-center">
                                You are about to permanently destroy <span className="text-red-500 font-bold">{totalFilesToDelete} files</span> and <span className="text-red-500 font-bold">{totalVersionsToDelete} history steps</span>.
                            </p>
                            <div className="p-6 bg-red-500/5 border border-red-500/20 rounded-[32px] text-[11px] text-red-300 text-left font-medium leading-relaxed">
                                <div className="flex gap-4">
                                    <AlertTriangle size={20} className="shrink-0 text-red-500" />
                                    <div>
                                        This action is <span className="text-white font-bold underline decoration-red-500/50 decoration-2 underline-offset-4">unrecoverable</span> within the project database. 
                                        <br/><br/>
                                        While files may still exist in your OS Trash, the project will no longer recognize or link them.
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="flex flex-col gap-3 w-full max-w-[320px]">
                            <button 
                                onClick={handleExecuteCleanup}
                                className="w-full py-6 bg-red-600 hover:bg-red-400 text-white font-black rounded-2xl shadow-2xl shadow-red-600/30 uppercase tracking-[0.2em] transition-all text-sm active:scale-95"
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
