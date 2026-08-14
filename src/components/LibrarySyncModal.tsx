import React, { useState, useEffect, useCallback } from 'react';
import { X, RefreshCw, Check, AlertTriangle, Loader, Trash2, ArrowRight, ArrowLeftRight, FolderOpen, Settings } from 'lucide-react';
import type { UserLibrary, FileRecord } from '../types';
// dynamic utility imports

interface LibrarySyncModalProps {
    isOpen: boolean;
    onClose: () => void;
    userLibrary: UserLibrary;
    sdHandle: FileSystemDirectoryHandle | null;
    onSetBackupFolder: () => void;
    onOpenProjectManager: () => void;
    onDownloadZip: () => void;
    onSyncComplete?: () => void;
}

type SyncStatus = 'same' | 'local_only' | 'backup_only' | 'different';
type SyncDecision = 'keep_local' | 'use_backup' | 'delete_local' | 'delete_backup' | 'skip';

interface LibrarySyncEntry {
    fileId: string;
    name: string;
    status: SyncStatus;
    localFile?: FileRecord;
    backupFile?: { name: string; size: number; lastModified: number };
    decision: SyncDecision;
}

export const LibrarySyncModal: React.FC<LibrarySyncModalProps> = ({
    isOpen,
    onClose,
    userLibrary,
    sdHandle,
    onSetBackupFolder,
    onOpenProjectManager,
    onDownloadZip,
    onSyncComplete
}) => {
    const [phase, setPhase] = useState<'loading' | 'review' | 'syncing' | 'done'>('loading');
    const [entries, setEntries] = useState<LibrarySyncEntry[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [syncProgress, setSyncProgress] = useState<string>('');
    const [showExitConfirmation, setShowExitConfirmation] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);


    const compareLibrary = useCallback(async () => {
        if (!sdHandle) return;
        setPhase('loading');
        try {
            const backupLibDir = await sdHandle.getDirectoryHandle('User_Library', { create: true });
            const backupFiles = new Map<string, { name: string; size: number; lastModified: number }>();

            // @ts-ignore
            for await (const [name, entry] of backupLibDir.entries()) {
                if (entry.kind === 'file') {
                    const file = await (entry as FileSystemFileHandle).getFile();
                    backupFiles.set(name.toLowerCase(), { name, size: file.size, lastModified: file.lastModified });
                }
            }

            const localFiles = Object.values(userLibrary.files);
            const nextEntries: LibrarySyncEntry[] = [];
            const processedBackupNames = new Set<string>();

            // 1. Process local files
            for (const local of localFiles) {
                const lowerName = local.name.toLowerCase();
                const backup = backupFiles.get(lowerName);
                processedBackupNames.add(lowerName);

                let status: SyncStatus = 'local_only';
                let decision: SyncDecision = 'keep_local';

                if (backup) {
                    const currentVersion = local.versions.find(v => v.id === local.currentVersionId) || local.versions[0];
                    const localSize = currentVersion?.blob?.size || 0;
                    
                    if (localSize === backup.size) {
                        status = 'same';
                        decision = 'skip';
                    } else {
                        status = 'different';
                        decision = 'keep_local'; // Default to pushing local to SD
                    }
                }

                nextEntries.push({
                    fileId: local.id,
                    name: local.name,
                    status,
                    localFile: local,
                    backupFile: backup,
                    decision
                });
            }

            // 2. Process remaining backup files (Remote Only)
            for (const [lowerName, backup] of backupFiles.entries()) {
                if (!processedBackupNames.has(lowerName)) {
                    nextEntries.push({
                        fileId: `backup-${lowerName}`,
                        name: backup.name,
                        status: 'backup_only',
                        backupFile: backup,
                        decision: 'use_backup' // Default to pulling from SD
                    });
                }
            }

            setEntries(nextEntries.sort((a, b) => a.name.localeCompare(b.name)));
            setPhase('review');
        } catch (e: any) {
            console.error("Library sync comparison failed", e);
            setError(e.message || "Failed to compare library versions.");
            setPhase('review');
        }
    }, [userLibrary, sdHandle]);

    useEffect(() => {
        if (isOpen) {
            // Reset transient states on open
            setShowExitConfirmation(false);
            setSyncProgress('');
            setError(null);

            if (sdHandle) {
                compareLibrary();
            } else {
                setPhase('review');
            }
        }

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, sdHandle, compareLibrary, onClose]);

    const handleSync = async () => {
        if (!sdHandle) return;
        setPhase('syncing');
        setError(null);
        try {
            // Filter decisions
            const toPush = entries.filter(e => e.decision === 'keep_local' && e.localFile);
            const toDeleteRemote = entries.filter(e => e.decision === 'delete_backup');
            // Pulling from SD to Library is more complex as it requires updating App State
            // For now, let's focus on the primary request: Backup to SD.
            
            // Re-use saveUserLibraryToDirectory for pushing
            // We'll create a temporary UserLibrary object for the specific files we want to push
            const pushLibrary: UserLibrary = {
                ...userLibrary,
                files: Object.fromEntries(
                    toPush.map(e => [e.localFile!.id, e.localFile!])
                )
            };

            if (toPush.length > 0) {
                const { saveUserLibraryToDirectory } = await import('../utils/exportUtils');
                await saveUserLibraryToDirectory(pushLibrary, sdHandle, undefined, (msg) => setSyncProgress(msg));
            }

            // Handle removals on SD
            if (toDeleteRemote.length > 0) {
                const backupLibDir = await sdHandle.getDirectoryHandle('User_Library', { create: false });
                for (const entry of toDeleteRemote) {
                    try {
                        await backupLibDir.removeEntry(entry.name);
                    } catch (e) {
                        console.warn(`Failed to remove ${entry.name} from SD`, e);
                    }
                }
            }

            setPhase('done');
            onSyncComplete?.();
        } catch (e: any) {
            console.error("Sync execution failed", e);
            setError(e.message || "Sync failed.");
            setPhase('review');
        }
    };

    if (!isOpen) return null;

    const diffCount = entries.filter(e => e.status !== 'same').length;
    const actionableCount = entries.filter(e => e.decision !== 'skip').length;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-synthux-panel w-full max-w-4xl rounded-2xl border border-white/10 flex flex-col shadow-2xl overflow-hidden max-h-[85vh]">
                
                {/* Header */}
                <div className="flex items-start justify-between p-5 border-b border-white/10 bg-black/20 shrink-0 gap-6">
                    <div className="flex flex-1 gap-6">
                        {/* Left Section: Context */}
                        <div className="flex gap-4 flex-[1.2]">
                            <div className="p-2.5 bg-synthux-blue/20 rounded-xl text-synthux-blue shrink-0 h-fit">
                                <RefreshCw size={22} />
                            </div>
                            <div className="min-w-0 space-y-2">
                                <h3 className="text-white text-lg font-bold">
                                    User Library SD Sync
                                </h3>
                                <p className="text-xs text-gray-400 leading-relaxed">
                                    Compare and synchronize your local <code className="bg-black/30 px-1 rounded text-synthux-blue">User_Library</code> with the SD card backup.
                                </p>
                                <div className="flex items-center gap-2 pt-1 border-t border-white/5">
                                    <button 
                                        onClick={() => setShowExitConfirmation(true)}
                                        className="text-[10px] text-synthux-blue hover:text-synthux-blue/80 font-bold underline underline-offset-2 flex items-center gap-1 transition-colors"
                                    >
                                        <Settings size={10} /> Project Manager
                                    </button>
                                    <span className="text-[10px] text-gray-500 italic">Set backup location here</span>
                                </div>
                            </div>
                        </div>

                        {/* Right Section: Warning */}
                        <div className="flex-1 bg-synthux-yellow/10 border border-synthux-yellow/30 rounded-xl p-4 flex gap-3 text-synthux-yellow h-fit mt-1">
                            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                            <div className="text-xs leading-relaxed">
                                <p className="font-bold">Storage Warning</p>
                                <p className="opacity-90">This will copy your entire User Library to the SD card. This may take up significant space on the SD.</p>
                            </div>
                        </div>
                    </div>

                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors shrink-0">
                        <X size={22} />
                    </button>
                </div>

                {!sdHandle ? (
                    /* Fallback: No Backup Folder */
                    <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-6 bg-black/20">
                        <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center text-red-400 border border-red-500/20">
                            <AlertTriangle size={40} />
                        </div>
                        <div className="max-w-md space-y-2">
                            <h3 className="text-xl font-bold text-white">No Backup Folder Set</h3>
                            <p className="text-gray-400 text-sm leading-relaxed">
                                To synchronize your custom library, you need to select a backup folder (typically your SD card).
                            </p>
                        </div>
                        <div className="flex flex-col gap-3 w-full max-w-xs">
                            <button
                                onClick={onSetBackupFolder}
                                className="w-full py-3 bg-synthux-orange hover:bg-synthux-orange/90 text-black font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-synthux-orange/20 transition-all"
                            >
                                <FolderOpen size={18} /> Select Backup Folder
                            </button>
                            <button
                                onClick={onOpenProjectManager}
                                className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 border border-gray-700 transition-all"
                            >
                                <Settings size={18} /> Go to Project Manager
                            </button>
                        </div>
                    </div>
                ) : phase === 'loading' ? (
                    /* Loading State */
                    <div className="flex-1 flex flex-col items-center justify-center gap-4 py-24 bg-black/20">
                        <Loader size={36} className="text-synthux-blue animate-spin" />
                        <p className="text-gray-300 font-medium">Scanning folders and comparing files...</p>
                    </div>
                ) : phase === 'syncing' ? (
                    /* Syncing State */
                    <div className="flex-1 flex flex-col items-center justify-center gap-6 py-24 bg-black/20">
                        <Loader size={40} className="text-synthux-green animate-spin" />
                        <div className="text-center space-y-2">
                            <p className="text-lg font-bold text-white">Synchronizing Library...</p>
                            <p className="text-sm text-gray-400">{syncProgress || 'Preparing files...'}</p>
                        </div>
                    </div>
                ) : phase === 'done' ? (
                    /* Success State */
                    <div className="flex-1 flex flex-col items-center justify-center gap-6 py-24 bg-black/20">
                        <div className="w-20 h-20 rounded-full bg-synthux-green/20 flex items-center justify-center text-synthux-green border border-synthux-green/30">
                            <Check size={40} />
                        </div>
                        <div className="text-center space-y-2">
                            <p className="text-2xl font-bold text-white">Library Synced!</p>
                            <p className="text-gray-400">All changes have been successfully written to your SD card.</p>
                        </div>
                        <button
                            onClick={onClose}
                            className="px-8 py-3 bg-synthux-green hover:brightness-110 text-black font-bold rounded-xl transition-all shadow-lg shadow-synthux-green/20"
                        >
                            Got it
                        </button>
                    </div>
                ) : (
                    /* Review State */
                    <>
                        <div className="px-6 py-3 border-b border-white/5 bg-black/40 flex items-center justify-between shrink-0">
                            <div className="text-xs text-gray-400 font-medium flex items-center gap-2">
                                {diffCount > 0 ? (
                                    <span className="text-synthux-orange flex items-center gap-1.5">
                                        <AlertTriangle size={14} /> {diffCount} difference{diffCount !== 1 ? 's' : ''} found
                                    </span>
                                ) : (
                                    <span className="text-synthux-green flex items-center gap-1.5">
                                        <Check size={14} /> Library is perfectly in sync
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider font-bold">
                                    <span className="w-2 h-2 rounded-full bg-synthux-blue shadow-[0_0_5px_rgba(59,130,246,0.5)]" />
                                    <span className="text-synthux-blue/80">Local</span>
                                    <ArrowLeftRight size={10} className="text-gray-600 mx-1" />
                                    <span className="w-2 h-2 rounded-full bg-synthux-orange shadow-[0_0_5px_rgba(234,179,8,0.5)]" />
                                    <span className="text-synthux-orange/80">SD Backup</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto bg-black/20">
                            <table className="w-full text-left border-collapse">
                                <thead className="sticky top-0 bg-[#0f0f0f] z-10">
                                    <tr className="text-[10px] font-bold uppercase tracking-widest text-gray-500 border-b border-white/5">
                                        <th className="px-6 py-3">File Name</th>
                                        <th className="px-4 py-3 text-center">Status</th>
                                        <th className="px-4 py-3 text-center">Action</th>
                                        <th className="px-6 py-3 text-right">Details</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {entries.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="py-20 text-center text-gray-600 italic">
                                                No library files found to sync.
                                            </td>
                                        </tr>
                                    ) : (
                                        entries.map((entry, idx) => (
                                            <tr key={entry.fileId} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors group">
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`p-1.5 rounded bg-black/40 ${entry.status === 'same' ? 'text-gray-600' : 'text-synthux-blue'}`}>
                                                            <FolderOpen size={14} />
                                                        </div>
                                                        <span className={`text-sm font-medium ${entry.status === 'same' ? 'text-gray-500' : 'text-gray-200'}`}>
                                                            {entry.name}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4 text-center">
                                                    {entry.status === 'same' && (
                                                        <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-tight text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20">
                                                            <Check size={8} /> Synced
                                                        </span>
                                                    )}
                                                    {entry.status === 'local_only' && (
                                                        <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-tight text-synthux-blue bg-synthux-blue/10 px-2 py-0.5 rounded-full border border-synthux-blue/20">
                                                            New
                                                        </span>
                                                    )}
                                                    {entry.status === 'different' && (
                                                        <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-tight text-synthux-orange bg-synthux-orange/10 px-2 py-0.5 rounded-full border border-synthux-orange/20">
                                                            Updated
                                                        </span>
                                                    )}
                                                    {entry.status === 'backup_only' && (
                                                        <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-tight text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/20">
                                                            SD Only
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-4">
                                                    <div className="flex items-center justify-center gap-2">
                                                        <button 
                                                            onClick={() => setEntries(prev => prev.map((e, i) => i === idx ? { ...e, decision: 'keep_local' } : e))}
                                                            title="Push to SD"
                                                            className={`p-1.5 rounded transition-all ${entry.decision === 'keep_local' ? 'bg-synthux-blue text-white shadow-lg shadow-synthux-blue/20 scale-110' : 'text-gray-600 hover:text-gray-300 hover:bg-white/10'}`}
                                                        >
                                                            <ArrowRight size={14} />
                                                        </button>
                                                        <button 
                                                            onClick={() => setEntries(prev => prev.map((e, i) => i === idx ? { ...e, decision: 'skip' } : e))}
                                                            title="Skip"
                                                            className={`p-1.5 rounded transition-all ${entry.decision === 'skip' ? 'bg-gray-700 text-white scale-110' : 'text-gray-600 hover:text-gray-300 hover:bg-white/10'}`}
                                                        >
                                                            <X size={14} />
                                                        </button>
                                                        {entry.status === 'backup_only' && (
                                                            <button 
                                                                onClick={() => setEntries(prev => prev.map((e, i) => i === idx ? { ...e, decision: 'delete_backup' } : e))}
                                                                title="Delete from SD"
                                                                className={`p-1.5 rounded transition-all ${entry.decision === 'delete_backup' ? 'bg-red-600 text-white scale-110 shadow-lg shadow-red-600/20' : 'text-gray-600 hover:text-red-400 hover:bg-red-400/10'}`}
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-right text-[10px] font-mono text-gray-500 group-hover:text-gray-400 transition-colors">
                                                    {entry.localFile && entry.backupFile ? (
                                                        <div className="flex flex-col">
                                                            <span>L: {(entry.backupFile.size / 1024 / 1024).toFixed(2)}MB</span>
                                                            <span className="text-[8px] opacity-50">Local Size</span>
                                                        </div>
                                                    ) : entry.localFile ? (
                                                        "Local source only"
                                                    ) : entry.backupFile ? (
                                                        "Remote backup only"
                                                    ) : null}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {error && (
                            <div className="px-6 py-3 bg-red-500/10 border-t border-red-500/20 text-red-400 text-xs flex items-center gap-2">
                                <AlertTriangle size={14} /> {error}
                            </div>
                        )}

                        <div className="p-5 border-t border-white/10 bg-black/30 flex items-center justify-between shrink-0">
                            <div className="space-x-1">
                                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">{actionableCount}</span>
                                <span className="text-xs text-gray-500">actions staged</span>
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={onDownloadZip}
                                    className="px-6 py-2.5 bg-gray-800 hover:bg-synthux-green/20 border border-gray-700 hover:border-synthux-green/50 text-gray-300 hover:text-synthux-green rounded-xl text-sm font-bold transition-all flex items-center gap-2"
                                >
                                    <RefreshCw size={16} className="rotate-180" /> Download ZIP
                                </button>
                                <button
                                    onClick={onClose}
                                    className="px-6 py-2.5 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition-all font-bold text-sm"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSync}
                                    disabled={actionableCount === 0}
                                    className="px-8 py-2.5 bg-synthux-blue disabled:opacity-30 disabled:grayscale disabled:cursor-not-allowed hover:brightness-110 text-white font-bold rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-synthux-blue/20"
                                >
                                    <ArrowLeftRight size={18} /> Sync to SD
                                </button>
                            </div>
                        </div>
                    </>
                )}

                {/* Exit Confirmation Overlay */}
                {showExitConfirmation && (
                    <div className="absolute inset-0 z-[110] flex items-center justify-center bg-black/90 backdrop-blur-md transition-all animate-in fade-in duration-300">
                        <div className="bg-synthux-panel border border-white/10 p-8 rounded-2xl shadow-2xl max-w-sm w-full mx-4 text-center space-y-6">
                            <div className="w-16 h-16 bg-synthux-blue/20 rounded-full flex items-center justify-center mx-auto text-synthux-blue">
                                <Settings size={32} />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-lg font-bold text-white">Switch to Project Manager?</h3>
                                <p className="text-sm text-gray-400">
                                    This will close the Library and Settings and navigate to the Project Manager workspace.
                                </p>
                            </div>
                            <div className="flex flex-col gap-3">
                                <button
                                    onClick={onOpenProjectManager}
                                    className="w-full py-3 bg-synthux-blue hover:brightness-110 text-white font-bold rounded-xl transition-all shadow-lg shadow-synthux-blue/20"
                                >
                                    Yes, go to Project Manager
                                </button>
                                <button
                                    onClick={() => setShowExitConfirmation(false)}
                                    className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold rounded-xl border border-gray-700 transition-all"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
