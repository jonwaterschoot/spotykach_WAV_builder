import type { SyncDiff as SyncDiffType } from '../utils/importUtils';
import { RefreshCw } from 'lucide-react';

interface SyncPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    diff: SyncDiffType;
}

export interface SyncDiff {
    newFiles: { slot: string, name: string }[];
    updatedFiles: { slot: string, name: string }[];
    totalCount: number;
}

export const SyncPreviewModal = ({ isOpen, onClose, onConfirm, diff }: SyncPreviewModalProps) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[110] p-4">
            <div className="bg-synthux-panel border border-gray-800 rounded-2xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">

                <div className="p-6 border-b border-gray-800 bg-black/20">
                    <h2 className="text-xl font-bold text-white font-header flex items-center gap-3">
                        <RefreshCw className="text-purple-400" />
                        Confirm Sync
                    </h2>
                    <p className="text-gray-400 text-xs mt-1">Review changes before applying.</p>
                </div>

                <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                    <div className="flex gap-4">
                        <div className="flex-1 bg-green-500/10 border border-green-500/20 p-3 rounded-lg text-center">
                            <div className="text-2xl font-bold text-green-400">{diff.newFiles.length}</div>
                            <div className="text-xs text-green-300/70 uppercase font-bold tracking-wider">New Files</div>
                        </div>
                        <div className="flex-1 bg-blue-500/10 border border-blue-500/20 p-3 rounded-lg text-center">
                            <div className="text-2xl font-bold text-blue-400">{diff.updatedFiles.length}</div>
                            <div className="text-xs text-blue-300/70 uppercase font-bold tracking-wider">Updates</div>
                        </div>
                    </div>

                    {diff.newFiles.length > 0 && (
                        <div>
                            <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">New Recordings</h4>
                            <div className="space-y-1">
                                {diff.newFiles.map((f, i) => (
                                    <div key={i} className="flex items-center gap-2 text-sm text-gray-300 bg-black/30 p-2 rounded">
                                        <span className="text-green-400 font-mono text-xs px-1.5 py-0.5 bg-green-900/30 rounded">{f.slot}</span>
                                        <span className="truncate">{f.name}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {diff.updatedFiles.length > 0 && (
                        <div>
                            <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Updated Versions</h4>
                            <div className="space-y-1">
                                {diff.updatedFiles.map((f, i) => (
                                    <div key={i} className="flex items-center gap-2 text-sm text-gray-300 bg-black/30 p-2 rounded">
                                        <span className="text-blue-400 font-mono text-xs px-1.5 py-0.5 bg-blue-900/30 rounded">{f.slot}</span>
                                        <span className="truncate">{f.name}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {diff.totalCount === 0 && (
                        <div className="text-center text-gray-500 py-8">
                            No changes detected. Project is up to date.
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-gray-800 bg-black/20 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 hover:bg-gray-800 text-gray-400 hover:text-white rounded-lg transition-colors text-sm font-bold">
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors font-bold flex items-center gap-2"
                    >
                        <RefreshCw size={16} />
                        Sync {diff.totalCount} Changes
                    </button>
                </div>
            </div>
        </div>
    );
};
