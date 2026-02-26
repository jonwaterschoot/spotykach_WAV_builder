import { useState, useMemo, useEffect } from 'react';
import { TAPE_COLORS, COLOR_MAP } from '../types';
import type { SyncDiff, SyncStatus } from '../utils/importUtils';
import { AlertTriangle, ArrowRight, ArrowLeft, Trash2, Check, RefreshCw, X, HardDrive, Smartphone, Save, Play, Pause } from 'lucide-react';

export type SyncActionType = 'PUSH' | 'PULL' | 'DELETE';

export interface StagedAction {
    type: SyncActionType;
    slotId: string;
    description: string;
    archiveBehavior: 'AUTO' | 'ARCHIVE' | 'DELETE';
}

interface PlayerState {
    url: string;
    slotId: string;
    side: 'LOCAL' | 'REMOTE';
    isPlaying: boolean;
    currentTime: number;
    duration: number;
}

interface SyncDashboardProps {
    isOpen: boolean;
    onClose: () => void;
    diff: SyncDiff;
    onCommit: (actions: StagedAction[], moveOldToPool: boolean) => Promise<void>;
}

export const SyncDashboard = ({ isOpen, onClose, diff, onCommit }: SyncDashboardProps) => {
    const [filter, setFilter] = useState<'ALL' | 'CONFLICTS' | 'CHANGES'>('ALL');
    const [moveOldToPool, setMoveOldToPool] = useState(true);
    const [stagedActions, setStagedActions] = useState<Record<string, StagedAction>>({});
    const [isCommitting, setIsCommitting] = useState(false);

    // Player State
    const [player, setPlayer] = useState<PlayerState | null>(null);
    const audioRef = useState(new Audio())[0];

    // Cleanup player on unmount/close
    // Cleanup player on unmount/close
    useEffect(() => {
        const updateTime = () => setPlayer(p => p ? { ...p, currentTime: audioRef.currentTime } : null);
        const updateDuration = () => setPlayer(p => p ? { ...p, duration: audioRef.duration } : null);
        const handleEnded = () => setPlayer(p => p ? { ...p, isPlaying: false } : null);

        audioRef.addEventListener('timeupdate', updateTime);
        audioRef.addEventListener('loadedmetadata', updateDuration);
        audioRef.addEventListener('ended', handleEnded);

        return () => {
            audioRef.pause();
            audioRef.src = '';
            audioRef.removeEventListener('timeupdate', updateTime);
            audioRef.removeEventListener('loadedmetadata', updateDuration);
            audioRef.removeEventListener('ended', handleEnded);
        };
    }, []);

    const togglePlay = (slotId: string, side: 'LOCAL' | 'REMOTE', blob: Blob | File) => {
        if (player?.slotId === slotId && player.side === side) {
            if (player.isPlaying) {
                audioRef.pause();
                setPlayer({ ...player, isPlaying: false });
            } else {
                audioRef.play().catch(e => console.error(e));
                setPlayer({ ...player, isPlaying: true });
            }
        } else {
            // New Track
            const url = URL.createObjectURL(blob);
            audioRef.src = url;
            audioRef.play().catch(e => console.error(e));
            // Reset state for new track
            setPlayer({ url, slotId, side, isPlaying: true, currentTime: 0, duration: 0 });
        }
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const time = Number(e.target.value);
        audioRef.currentTime = time;
        setPlayer(prev => prev ? { ...prev, currentTime: time } : null);
    };

    const formatTime = (t: number) => {
        if (!t) return '0:00';
        const m = Math.floor(t / 60);
        const s = Math.floor(t % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    if (!isOpen) return null;

    const toggleAction = (slotId: string, type: SyncActionType, description: string) => {
        setStagedActions(prev => {
            const next = { ...prev };
            // If clicking same action, toggle off
            if (next[slotId]?.type === type) {
                delete next[slotId];
            } else {
                next[slotId] = { type, slotId, description, archiveBehavior: 'AUTO' };
            }
            return next;
        });
    };

    const handleCommit = async () => {
        setIsCommitting(true);
        try {
            await onCommit(Object.values(stagedActions), moveOldToPool);
            setStagedActions({});
        } finally {
            setIsCommitting(false);
        }
    };

    const filteredSlots = useMemo(() => {
        return Object.values(diff.slots).filter(slot => {
            if (filter === 'ALL') return true;
            if (filter === 'CONFLICTS') return slot.status === 'CONFLICT';
            if (filter === 'CHANGES') return slot.status !== 'MATCH' && slot.status !== 'EMPTY';
            return true;
        }).sort((a, b) => {
            const colorOrder = TAPE_COLORS.indexOf(a.color) - TAPE_COLORS.indexOf(b.color);
            if (colorOrder !== 0) return colorOrder;
            return a.index - b.index;
        });
    }, [diff, filter]);

    const getStatusIcon = (status: SyncStatus) => {
        switch (status) {
            case 'MATCH': return <Check size={16} className="text-green-500" />;
            case 'CONFLICT': return <AlertTriangle size={16} className="text-orange-500" />;
            case 'LOCAL_ONLY': return <ArrowRight size={16} className="text-blue-400" />;
            case 'REMOTE_ONLY': return <ArrowLeft size={16} className="text-pink-400" />;
            case 'EMPTY': return <span className="text-gray-600">-</span>;
        }
    };

    const getRowBg = (status: SyncStatus, staged?: StagedAction) => {
        if (staged) {
            switch (staged.type) {
                case 'PUSH': return 'bg-blue-500/20 border-blue-500/40';
                case 'PULL': return 'bg-pink-500/20 border-pink-500/40';
                case 'DELETE': return 'bg-red-500/20 border-red-500/40';
            }
        }
        switch (status) {
            case 'CONFLICT': return 'bg-orange-500/10 border-orange-500/20';
            case 'LOCAL_ONLY': return 'bg-blue-500/5 border-blue-500/10';
            case 'REMOTE_ONLY': return 'bg-pink-500/5 border-pink-500/10';
            default: return 'border-white/5 hover:bg-white/5';
        }
    };

    const counts = useMemo(() => {
        const slots = Object.values(diff.slots);
        return {
            ALL: slots.length,
            CHANGES: slots.filter(s => s.status !== 'MATCH' && s.status !== 'EMPTY').length,
            CONFLICTS: slots.filter(s => s.status === 'CONFLICT').length
        };
    }, [diff]);

    const stagedCount = Object.keys(stagedActions).length;

    // Exemption Counter
    const exemptions = Object.values(stagedActions).filter(a => {
        if (moveOldToPool && a.archiveBehavior === 'DELETE') return true;
        if (!moveOldToPool && a.archiveBehavior === 'ARCHIVE') return true;
        return false;
    }).length;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#121212] w-full max-w-6xl h-[90vh] rounded-2xl border border-white/10 flex flex-col shadow-2xl overflow-hidden">

                {/* HEAD */}
                <header className="flex items-center justify-between p-6 border-b border-white/10 bg-[#1a1a1a]">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg">
                            <RefreshCw size={24} className="text-white" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-white">Sync Manager</h2>
                            <p className="text-gray-400 text-sm flex items-center gap-2">
                                <Smartphone size={14} /> App <span className="text-gray-600 px-1">↔</span> <HardDrive size={14} /> SD Card
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="flex bg-black/40 rounded-lg p-1 border border-white/10">
                            {(['ALL', 'CHANGES', 'CONFLICTS'] as const).map(f => (
                                <button
                                    key={f}
                                    onClick={() => setFilter(f)}
                                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${filter === f ? 'bg-white/10 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                                >
                                    {f.charAt(0) + f.slice(1).toLowerCase()}
                                    {f !== 'ALL' && counts[f] > 0 && (
                                        <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${filter === f ? 'bg-white/20 text-white' : 'bg-white/10 text-gray-400'}`}>
                                            {counts[f]}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>

                        <div className="h-8 w-px bg-white/10 mx-2"></div>

                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors">
                            <X size={24} />
                        </button>
                    </div>
                </header>

                {/* CONTENT */}
                <div className="flex-1 overflow-y-auto p-6 space-y-2">
                    {/* Header Row */}
                    <div className="grid grid-cols-[60px_1fr_100px_1fr_100px] gap-4 px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider sticky top-0 bg-[#121212] z-10 border-b border-white/10 mb-2">
                        <div>Slot</div>
                        <div>Local (App)</div>
                        <div className="text-center">Status</div>
                        <div className="text-right">Remote (SD)</div>
                        <div className="text-right">Actions</div>
                    </div>

                    {filteredSlots.map(slot => {
                        const staged = stagedActions[slot.slotId];
                        return (
                            <div key={slot.slotId} className={`grid grid-cols-[60px_1fr_100px_1fr_100px] gap-4 px-4 py-3 rounded-lg border items-center transition-colors ${getRowBg(slot.status, staged)}`}>

                                {/* Slot ID */}
                                <div className="flex items-center gap-2">
                                    <div className={`w-3 h-3 rounded-full ${COLOR_MAP[slot.color]}`}></div>
                                    <span className="font-mono text-sm font-bold text-gray-300">{slot.color.charAt(0)}{slot.index}</span>
                                </div>

                                {/* Local File */}
                                <div className="min-w-0 flex items-center gap-2 group/local">
                                    {/* Play Button */}
                                    {slot.localFile && (
                                        <button
                                            onClick={() => {
                                                if (slot.localFile?.versions[0].blob) {
                                                    togglePlay(slot.slotId, 'LOCAL', slot.localFile.versions[0].blob);
                                                }
                                            }}
                                            className={`p-1 rounded-full ${player?.slotId === slot.slotId && player.side === 'LOCAL' && player.isPlaying ? 'text-green-400 bg-white/10' : 'text-gray-600 hover:text-white group-hover/local:text-gray-400'}`}
                                        >
                                            {player?.slotId === slot.slotId && player.side === 'LOCAL' && player.isPlaying ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
                                        </button>
                                    )}

                                    {slot.localFile ? (
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-sm font-medium text-white truncate">{slot.localFile.name}</span>
                                            <span className="text-xs text-gray-500">{slot.localFile.versions[0].blob ? (slot.localFile.versions[0].blob.size / 1024).toFixed(1) : '0'} KB</span>
                                        </div>
                                    ) : (
                                        <span className="text-gray-700 text-sm italic ml-6">Empty</span>
                                    )}
                                </div>

                                {/* Status Icon */}
                                <div className="flex justify-center">
                                    {staged ? (
                                        <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase flex items-center gap-1
                                            ${staged.type === 'PUSH' ? 'bg-blue-500 text-black' :
                                                staged.type === 'PULL' ? 'bg-pink-500 text-black' : 'bg-red-500 text-white'}`}>
                                            {staged.type}
                                        </div>
                                    ) : (
                                        getStatusIcon(slot.status)
                                    )}
                                </div>

                                {/* Remote File */}
                                <div className="min-w-0 text-right flex items-center justify-end gap-2 group/remote">
                                    {slot.remoteFile ? (
                                        <div className="flex flex-col items-end min-w-0">
                                            <span className="text-sm font-medium text-white truncate">{slot.remoteFile.name}</span>
                                            <span className="text-xs text-gray-500">{(slot.remoteFile.size / 1024).toFixed(1)} KB</span>
                                            {slot.status === 'CONFLICT' && (
                                                <span className="text-[10px] text-orange-400 font-bold">UPDATED</span>
                                            )}
                                        </div>
                                    ) : (
                                        <span className="text-gray-700 text-sm italic mr-6">Empty</span>
                                    )}

                                    {/* Play Button */}
                                    {slot.remoteFile && (
                                        <button
                                            onClick={() => togglePlay(slot.slotId, 'REMOTE', slot.remoteFile!)}
                                            className={`p-1 rounded-full ${player?.slotId === slot.slotId && player.side === 'REMOTE' && player.isPlaying ? 'text-green-400 bg-white/10' : 'text-gray-600 hover:text-white group-hover/remote:text-gray-400'}`}
                                        >
                                            {player?.slotId === slot.slotId && player.side === 'REMOTE' && player.isPlaying ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
                                        </button>
                                    )}
                                </div>

                                {/* Actions */}
                                <div className="flex items-center justify-end gap-1">
                                    {/* Push Button */}
                                    {slot.localFile && (
                                        <button
                                            onClick={() => toggleAction(slot.slotId, 'PUSH', `Push ${slot.localFile!.name}`)}
                                            className={`p-1.5 rounded transition-colors ${staged?.type === 'PUSH' ? 'bg-blue-500 text-white' : 'hover:bg-blue-500/20 text-gray-500 hover:text-blue-400'}`}
                                            title="Push to SD"
                                        >
                                            <ArrowRight size={16} />
                                        </button>
                                    )}
                                    {/* Pull Button */}
                                    {slot.remoteFile && (
                                        <button
                                            onClick={() => toggleAction(slot.slotId, 'PULL', `Pull ${slot.remoteFile!.name}`)}
                                            className={`p-1.5 rounded transition-colors ${staged?.type === 'PULL' ? 'bg-pink-500 text-white' : 'hover:bg-pink-500/20 text-gray-500 hover:text-pink-400'}`}
                                            title="Pull to App"
                                        >
                                            <ArrowLeft size={16} />
                                        </button>
                                    )}
                                    {/* Delete Button */}
                                    {(slot.localFile || slot.remoteFile) && (
                                        <button
                                            onClick={() => toggleAction(slot.slotId, 'DELETE', 'Clear Slot')}
                                            className={`p-1.5 rounded transition-colors ml-1 ${staged?.type === 'DELETE' ? 'bg-red-500 text-white' : 'hover:bg-red-500/20 text-gray-600 hover:text-red-400'}`}
                                            title="Clear Slot"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        )
                    })}

                    {filteredSlots.length === 0 && (
                        <div className="text-center py-20 text-gray-600">
                            <Check size={48} className="mx-auto mb-4 opacity-20" />
                            <p>No items match the filter.</p>
                        </div>
                    )}
                </div>

                {/* PLAYER BAR */}
                {player && (
                    <div className="bg-[#121212] border-t border-white/10 p-4 flex items-center gap-4 transition-all">
                        {/* Play/Pause */}
                        <button
                            onClick={() => {
                                if (player.isPlaying) {
                                    audioRef.pause();
                                    setPlayer({ ...player, isPlaying: false });
                                } else {
                                    audioRef.play();
                                    setPlayer({ ...player, isPlaying: true });
                                }
                            }}
                            className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:bg-gray-200 transition-colors"
                        >
                            {player.isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                        </button>

                        <div className="flex-1 flex flex-col justify-center gap-1">
                            {/* Info */}
                            <div className="flex justify-between text-xs text-gray-400 font-mono">
                                <span>{player.side === 'LOCAL' ? 'App File' : 'SD Card File'}</span>
                                <span>{formatTime(player.currentTime)} / {formatTime(player.duration)}</span>
                            </div>

                            {/* Scrubber */}
                            <input
                                type="range"
                                min={0}
                                max={player.duration || 100}
                                value={player.currentTime || 0}
                                onChange={handleSeek}
                                className="w-full h-1.5 bg-white/20 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:scale-125 transition-all"
                            />
                        </div>
                    </div>
                )}

                {/* FOOTER */}
                <footer className="p-6 border-t border-white/10 bg-[#1a1a1a] flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer hover:text-white transition-colors">
                            <input
                                type="checkbox"
                                checked={moveOldToPool}
                                onChange={(e) => setMoveOldToPool(e.target.checked)}
                                className="rounded bg-white/10 border-white/20 text-indigo-500 focus:ring-offset-0 focus:ring-indigo-500"
                            />
                            Move overwritten files to Pool / Backup
                        </label>
                        {exemptions > 0 && (
                            <span className="text-xs font-bold text-orange-400 bg-orange-500/10 px-2 py-1 rounded">
                                {exemptions} Exception{exemptions !== 1 ? 's' : ''}
                            </span>
                        )}
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="text-sm font-medium text-gray-400">
                            {stagedCount === 0 ? 'No actions pending' : `${stagedCount} action${stagedCount !== 1 ? 's' : ''} pending`}
                        </div>
                        <button
                            onClick={handleCommit}
                            disabled={stagedCount === 0 || isCommitting}
                            className={`px-8 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-all shadow-lg 
                                ${stagedCount > 0 ? 'bg-green-600 hover:bg-green-500 text-white shadow-green-600/20' : 'bg-gray-800 text-gray-500 cursor-not-allowed'}
                            `}
                        >
                            {isCommitting ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                            {isCommitting ? 'Synching...' : 'Sync Now'}
                        </button>
                    </div>
                </footer>

            </div>
        </div>
    );
};
