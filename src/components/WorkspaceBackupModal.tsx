import React, { useCallback, useEffect, useState } from 'react';
import { X, Shield, FolderOpen, AlertTriangle, Check, Loader, HardDrive } from 'lucide-react';
import { RiSdCardMiniLine } from 'react-icons/ri';
import type { UserLibrary } from '../types';
import {
    surveyWorkspace,
    runWorkspaceBackup,
    formatBytes,
    type WorkspaceSurvey,
    type BackupResult,
} from '../utils/workspaceBackup';
import { useEscapeLayer } from '../shell/escapeStack';

/**
 * Workspace backup — Phase 7, step 4.
 *
 * Deliberately one act rather than four. The screen shows what the backup contains
 * *before* asking for a destination, and it does not pretend to know whether the
 * target has room — the File System Access API cannot tell it. It says the size, and
 * it fails cleanly.
 */
interface WorkspaceBackupModalProps {
    isOpen: boolean;
    onClose: () => void;
    workHandle: FileSystemDirectoryHandle | null;
    sdHandle: FileSystemDirectoryHandle | null;
    userLibrary?: UserLibrary | null;
}

const KIND_ICON: Record<string, React.ReactNode> = {
    project: <FolderOpen size={14} className="text-indigo-400" />,
    library: <HardDrive size={14} className="text-teal-400" />,
    settings: <Shield size={14} className="text-gray-400" />,
    card: <RiSdCardMiniLine size={14} className="text-orange-400" />,
};

export const WorkspaceBackupModal: React.FC<WorkspaceBackupModalProps> = ({
    isOpen,
    onClose,
    workHandle,
    sdHandle,
    userLibrary,
}) => {
    const [includeCard, setIncludeCard] = useState(false);
    const [survey, setSurvey] = useState<WorkspaceSurvey | null>(null);
    const [phase, setPhase] = useState<'surveying' | 'review' | 'writing' | 'done' | 'failed'>('surveying');
    const [progress, setProgress] = useState<{ written: number; total: number; label: string } | null>(null);
    const [result, setResult] = useState<BackupResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    const canPickFolder = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

    // The survey runs on open and again whenever the card checkbox changes. It only
    // ever writes state from the async continuation — the 'surveying' phase is the
    // initial state (the modal is mounted fresh each time it is opened) and the
    // checkbox handler puts it back, so nothing is set synchronously in the effect.
    const refreshSurvey = useCallback(async () => {
        try {
            const next = await surveyWorkspace({ workHandle, sdHandle, includeCard, userLibrary });
            setSurvey(next);
            setError(null);
            setPhase('review');
        } catch (e) {
            setError((e as Error).message);
            setPhase('failed');
        }
    }, [workHandle, sdHandle, includeCard, userLibrary]);

    useEffect(() => {
        if (!isOpen) return;
        // A one-shot async read of an external system (the filesystem) whose result
        // lands in state — the case the rule can't distinguish from a render loop.
        // Nothing is set synchronously here; see the note above.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void refreshSurvey();
    }, [isOpen, refreshSurvey]);

    const handleToggleCard = (next: boolean) => {
        setIncludeCard(next);
        setPhase('surveying');
    };

    // A layer rather than its own window listener, so Escape closes *this* and not
    // also whatever studio panel the shell's chain thinks is topmost. Mid-write it
    // consumes the key without acting — cancelling a half-written backup by reflex
    // is exactly the thing this surface exists to avoid.
    useEscapeLayer(isOpen, () => {
        if (phase !== 'writing') onClose();
        return true;
    });

    const handleBackUp = async () => {
        if (!survey || survey.totalFiles === 0) return;
        let destination: FileSystemDirectoryHandle;
        try {
            // The location is chosen here and only here — never remembered, never
            // defaulted. Appendix D.3.
            destination = await window.showDirectoryPicker({ mode: 'readwrite', id: 'wavbuilder-backup' });
        } catch {
            return; // Cancelled the picker; not an error.
        }

        setPhase('writing');
        setProgress({ written: 0, total: survey.totalFiles, label: 'Starting…' });
        try {
            const written = await runWorkspaceBackup(
                destination,
                { workHandle, sdHandle, includeCard, userLibrary },
                survey,
                (w, t, label) => setProgress({ written: w, total: t, label })
            );
            setResult(written);
            setPhase('done');
        } catch (e) {
            setError((e as Error).message);
            setPhase('failed');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#121212] w-full max-w-2xl rounded-2xl border border-white/10 flex flex-col shadow-2xl overflow-hidden max-h-[85vh]">
                <header className="flex items-center justify-between p-5 border-b border-white/10 bg-[#1a1a1a] shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-teal-500/20 rounded-xl">
                            <Shield size={20} className="text-teal-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white">Back up your workspace</h2>
                            <p className="text-gray-500 text-xs">One copy, to a folder you choose. Nothing is written until you pick one.</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={phase === 'writing'}
                        className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        <X size={20} />
                    </button>
                </header>

                <div className="p-5 overflow-y-auto space-y-4">
                    {phase === 'surveying' && (
                        <div className="flex items-center gap-3 text-gray-400 text-sm py-8 justify-center">
                            <Loader size={16} className="animate-spin" /> Working out what you have…
                        </div>
                    )}

                    {phase === 'writing' && progress && (
                        <div className="space-y-3 py-6">
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-white font-medium flex items-center gap-2">
                                    <Loader size={14} className="animate-spin" /> {progress.label}
                                </span>
                                <span className="text-gray-500 font-mono text-xs">{progress.written} / {progress.total}</span>
                            </div>
                            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-teal-500 transition-[width] duration-200"
                                    style={{ width: `${progress.total ? (progress.written / progress.total) * 100 : 0}%` }}
                                />
                            </div>
                            <p className="text-[10px] text-gray-600">
                                Leave this open until it finishes. If it fails part way, the partial folder is removed.
                            </p>
                        </div>
                    )}

                    {phase === 'done' && result && (
                        <div className="py-6 space-y-3 text-center">
                            <Check size={32} className="text-teal-400 mx-auto" />
                            <p className="text-white font-medium">Backed up.</p>
                            <p className="text-gray-500 text-sm">
                                {result.filesWritten} files, {formatBytes(result.bytesWritten)}, into{' '}
                                <span className="font-mono text-gray-300">{result.folderName}</span>
                            </p>
                        </div>
                    )}

                    {phase === 'failed' && (
                        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex gap-3">
                            <AlertTriangle size={18} className="text-red-400 shrink-0 mt-0.5" />
                            <p className="text-sm text-red-300">{error}</p>
                        </div>
                    )}

                    {phase === 'review' && survey && (
                        <>
                            {survey.warnings.map(w => (
                                <div key={w} className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex gap-2.5 text-xs text-amber-300">
                                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                                    {w}
                                </div>
                            ))}

                            {survey.items.length === 0 ? (
                                <p className="text-gray-500 text-sm py-6 text-center">
                                    There is nothing to back up yet: no projects, no library.
                                </p>
                            ) : (
                                <div className="rounded-lg border border-white/10 overflow-hidden">
                                    {survey.items.map(item => (
                                        <div
                                            key={item.id}
                                            className="flex items-center gap-3 px-4 py-2.5 border-b border-white/5 last:border-b-0 bg-white/[0.02]"
                                        >
                                            <span className="shrink-0">{KIND_ICON[item.kind]}</span>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm text-white truncate">{item.label}</p>
                                                <p className="text-[10px] text-gray-500 truncate">{item.detail}</p>
                                            </div>
                                            <span className="text-xs font-mono text-gray-400 shrink-0">{formatBytes(item.bytes)}</span>
                                        </div>
                                    ))}
                                    <div className="flex items-center justify-between px-4 py-2.5 bg-white/5 border-t border-white/10">
                                        <span className="text-xs font-bold text-gray-300 uppercase tracking-widest">Total</span>
                                        <span className="text-sm font-mono text-white">
                                            {survey.totalFiles} files · {formatBytes(survey.totalBytes)}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {sdHandle && (
                                <label className="flex items-start gap-3 p-3 rounded-lg border border-white/5 bg-white/[0.02] cursor-pointer hover:border-white/15 transition-colors">
                                    <input
                                        type="checkbox"
                                        checked={includeCard}
                                        onChange={e => handleToggleCard(e.target.checked)}
                                        className="mt-0.5 rounded border-gray-600 bg-black/40 text-teal-500 focus:ring-teal-500 focus:ring-offset-0 w-3.5 h-3.5"
                                    />
                                    <span>
                                        <span className="text-xs text-gray-300 font-medium">Also include what is on the card</span>
                                        <span className="block text-[10px] text-gray-600 mt-0.5">
                                            The <span className="font-mono">SK/</span> folder as it stands on {sdHandle.name}. Off by default, since a build can be made again from the project.
                                        </span>
                                    </span>
                                </label>
                            )}

                            {/* The honest note about size. */}
                            <p className="text-[10px] text-gray-600 leading-relaxed">
                                The browser cannot tell this app how much free space the folder you pick has. That
                                figure simply isn't available to a web page. Check the size above against the target
                                yourself, especially if it is an SD card. If the write runs out of room part way, the
                                partial folder is deleted rather than left looking like a backup.
                            </p>
                        </>
                    )}
                </div>

                <footer className="p-4 border-t border-white/10 bg-[#1a1a1a] flex justify-between items-center gap-3 shrink-0">
                    <span className="text-[10px] text-gray-600">
                        {phase === 'review' && survey && survey.totalFiles > 0 && 'You pick the destination in the next step.'}
                    </span>
                    <div className="flex gap-2">
                        <button
                            onClick={onClose}
                            disabled={phase === 'writing'}
                            className="px-4 py-2 text-sm text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
                        >
                            {phase === 'done' ? 'Close' : 'Cancel'}
                        </button>
                        {(phase === 'review' || phase === 'failed') && (
                            <button
                                onClick={handleBackUp}
                                disabled={!canPickFolder || !survey || survey.totalFiles === 0}
                                title={canPickFolder ? undefined : 'This browser cannot write to a folder you pick. Chrome or Edge can.'}
                                className="px-5 py-2 bg-teal-600 hover:bg-teal-500 disabled:bg-white/5 disabled:text-gray-600 disabled:cursor-not-allowed text-white text-sm font-bold rounded-lg flex items-center gap-2 transition-colors"
                            >
                                <FolderOpen size={15} />
                                {phase === 'failed' ? 'Choose a folder and retry' : 'Choose a folder and back up'}
                            </button>
                        )}
                    </div>
                </footer>
            </div>
        </div>
    );
};
