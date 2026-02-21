import React from 'react';
import { Settings, RefreshCw, AlertTriangle, HardDrive, Folder, Save } from 'lucide-react';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    workFolderName: string | null;
    backupFolderName: string | null;
    onSetWorkFolder: () => void;
    onSetBackupFolder: () => void;
    onResetApp: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
    isOpen,
    onClose,
    workFolderName,
    backupFolderName,
    onSetWorkFolder,
    onSetBackupFolder,
    onResetApp
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#121212] w-full max-w-md rounded-2xl border border-white/10 flex flex-col shadow-2xl">

                <header className="flex items-center justify-between p-6 border-b border-white/10 bg-[#1a1a1a]">
                    <div className="flex items-center gap-3">
                        <Settings size={20} className="text-gray-400" />
                        <h2 className="text-lg font-bold text-white">Settings</h2>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white">
                        <span className="sr-only">Close</span>
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </header>

                <div className="p-6 space-y-8">

                    {/* Storage Configuration */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Storage Locations</h3>

                        {/* Work Folder */}
                        <div className="p-4 rounded-lg border border-white/10 bg-white/5 space-y-3">
                            <div className="flex items-center gap-3 text-indigo-300">
                                <Folder size={18} />
                                <span className="font-medium">Primary Work Folder</span>
                            </div>
                            <div className="text-sm text-gray-400 pl-8">
                                {workFolderName ? (
                                    <span className="text-white font-mono break-all">{workFolderName}</span>
                                ) : (
                                    <span className="italic opacity-50">Not Set (Temporary Mode)</span>
                                )}
                            </div>
                            <button
                                onClick={onSetWorkFolder}
                                className="w-full mt-2 py-2 px-4 rounded bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 text-sm font-medium transition-colors border border-indigo-500/30"
                            >
                                {workFolderName ? "Change Work Folder" : "Set Work Folder"}
                            </button>
                        </div>

                        {/* Backup Folder */}
                        <div className="p-4 rounded-lg border border-white/10 bg-white/5 space-y-3">
                            <div className="flex items-center gap-3 text-pink-300">
                                <HardDrive size={18} />
                                <span className="font-medium">Backup / Sync Folder</span>
                            </div>
                            <div className="text-sm text-gray-400 pl-8">
                                {backupFolderName ? (
                                    <span className="text-white font-mono break-all">{backupFolderName}</span>
                                ) : (
                                    <span className="italic opacity-50">Not Configured</span>
                                )}
                            </div>
                            <button
                                onClick={onSetBackupFolder}
                                className="w-full mt-2 py-2 px-4 rounded bg-pink-500/10 hover:bg-pink-500/20 text-pink-400 text-sm font-medium transition-colors border border-pink-500/30"
                            >
                                {backupFolderName ? "Change Backup Folder" : "Set Backup Folder"}
                            </button>
                        </div>
                    </div>

                    {/* Danger Zone */}
                    <div className="space-y-4 pt-6 border-t border-white/10">
                        <h3 className="text-sm font-bold text-red-500 uppercase tracking-wider flex items-center gap-2">
                            <AlertTriangle size={14} /> Danger Zone
                        </h3>
                        <button
                            onClick={onResetApp}
                            className="w-full p-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-500 rounded-lg flex items-center justify-center gap-2 transition-colors"
                        >
                            <RefreshCw size={16} /> Reset Application
                        </button>
                        <p className="text-xs text-gray-600 text-center">
                            Clears all browser data, settings, and cached projects.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
