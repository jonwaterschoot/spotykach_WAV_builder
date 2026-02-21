import { useState } from 'react';
import { RefreshCw, AlertTriangle, Check, HardDrive, FolderInput } from 'lucide-react';

interface SyncOptionsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (options: SyncOptions) => void;
    projectName: string;
}

export interface SyncOptions {
    skMode: 'overwrite' | 'clean';
    backupSKToProject: boolean;
}

export const SyncOptionsModal = ({ isOpen, onClose, onConfirm, projectName }: SyncOptionsModalProps) => {
    const [skMode, setSkMode] = useState<'overwrite' | 'clean'>('overwrite');
    const [backupSKToProject, setBackupSKToProject] = useState(true);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[110] p-4">
            <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">

                <div className="p-6 border-b border-white/10 bg-[#151515]">
                    <h2 className="text-xl font-bold text-white flex items-center gap-3">
                        <RefreshCw className="text-indigo-400" />
                        Sync "{projectName}" to SD Card
                    </h2>
                    <p className="text-gray-400 text-sm mt-1">
                        Configure how the project is written to the SD Card.
                    </p>
                </div>

                <div className="p-6 space-y-6">

                    {/* SK Folder Handling */}
                    <div className="space-y-3">
                        <label className="text-sm font-bold text-gray-300 uppercase tracking-wider block">
                            SK Folder (WAV Files)
                        </label>
                        <div className="grid grid-cols-1 gap-3">
                            <button
                                onClick={() => setSkMode('overwrite')}
                                className={`flex items-start gap-3 p-4 rounded-xl border text-left transition-all ${skMode === 'overwrite'
                                    ? 'bg-indigo-500/10 border-indigo-500/50 ring-1 ring-indigo-500/50'
                                    : 'bg-[#222] border-white/5 hover:bg-[#2a2a2a]'
                                    }`}
                            >
                                <div className={`mt-0.5 p-1 rounded-full ${skMode === 'overwrite' ? 'bg-indigo-500 text-white' : 'bg-gray-700 text-gray-400'}`}>
                                    <Check size={12} />
                                </div>
                                <div>
                                    <h3 className={`font-bold ${skMode === 'overwrite' ? 'text-indigo-300' : 'text-gray-300'}`}>Smart Overwrite</h3>
                                    <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                                        Updates changed files and adds new ones. Keeps existing files that haven't changed.
                                        <span className="block text-indigo-400/80 mt-1 font-medium">Fastest option.</span>
                                    </p>
                                </div>
                            </button>

                            <button
                                onClick={() => setSkMode('clean')}
                                className={`flex items-start gap-3 p-4 rounded-xl border text-left transition-all ${skMode === 'clean'
                                    ? 'bg-orange-500/10 border-orange-500/50 ring-1 ring-orange-500/50'
                                    : 'bg-[#222] border-white/5 hover:bg-[#2a2a2a]'
                                    }`}
                            >
                                <div className={`mt-0.5 p-1 rounded-full ${skMode === 'clean' ? 'bg-orange-500 text-white' : 'bg-gray-700 text-gray-400'}`}>
                                    <Check size={12} />
                                </div>
                                <div>
                                    <h3 className={`font-bold ${skMode === 'clean' ? 'text-orange-300' : 'text-gray-300'}`}>Clean Re-install</h3>
                                    <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                                        Deletes the entire Project folder on SD and rebuilds it.
                                        <span className="block text-orange-400/80 mt-1 font-medium">Use if experiencing glitches.</span>
                                    </p>
                                </div>
                            </button>
                        </div>
                    </div>

                    {/* Divider */}
                    <div className="h-px bg-white/5"></div>

                    {/* Backup Option */}
                    <div className="space-y-3">
                        <label className="text-sm font-bold text-gray-300 uppercase tracking-wider block">
                            Backup Options
                        </label>

                        <div
                            onClick={() => setBackupSKToProject(!backupSKToProject)}
                            className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${backupSKToProject
                                ? 'bg-[#222] border-indigo-500/30'
                                : 'bg-[#1a1a1a] border-white/5 opacity-70 hover:opacity-100'
                                }`}
                        >
                            <div className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center transition-colors ${backupSKToProject
                                ? 'bg-indigo-600 border-indigo-600 text-white'
                                : 'border-gray-600 bg-transparent'
                                }`}>
                                {backupSKToProject && <Check size={12} />}
                            </div>
                            <div className="flex-1">
                                <h3 className="font-bold text-gray-200 flex items-center gap-2">
                                    <FolderInput size={14} className="text-indigo-400" />
                                    Save SK Hardcopy to Project
                                </h3>
                                <p className="text-xs text-gray-500 mt-1">
                                    Saves a copy of the generated SK structure (WAV files) into your Project folder on the computer.
                                </p>
                                {backupSKToProject && (
                                    <div className="flex items-start gap-2 mt-2 text-[10px] text-yellow-500 bg-yellow-500/10 p-2 rounded">
                                        <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                                        <span>
                                            Warning: This duplicates audio data (~0.5GB). <br />
                                            May take +30-40s for large projects.
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                </div>

                <div className="p-6 border-t border-white/10 bg-[#151515] flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors font-medium text-sm"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => onConfirm({ skMode, backupSKToProject })}
                        className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg shadow-lg shadow-indigo-500/20 font-bold flex items-center gap-2 transition-all"
                    >
                        <HardDrive size={16} />
                        Start Sync
                    </button>
                </div>

            </div>
        </div>
    );
};
