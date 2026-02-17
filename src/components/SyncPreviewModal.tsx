import { useState, useMemo } from 'react';
import type { SyncDiff, SyncDecision } from '../utils/importUtils';
import { RefreshCw } from 'lucide-react';
import { SyncComparisonTable, type SyncItem } from './SyncComparisonTable';

interface SyncPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (decisions: Record<string, SyncDecision>) => void;
    diff: SyncDiff;
}

export const SyncPreviewModal = ({ isOpen, onClose, onConfirm, diff }: SyncPreviewModalProps) => {
    const [decisions, setDecisions] = useState<Record<string, SyncDecision>>({});

    const items: SyncItem[] = useMemo(() => {
        const list: SyncItem[] = [];

        // New Files
        diff.newFiles.forEach(f => {
            list.push({
                id: f.slot,
                file: f.file,
                type: 'new',
                slot: f.slot,
                sourceName: f.name,
                size: f.size,
                decision: decisions[f.slot] || 'overwrite'
            });
        });

        // Updates
        diff.updatedFiles.forEach(f => {
            list.push({
                id: f.slot,
                file: f.file,
                type: 'update',
                slot: f.slot,
                sourceName: f.name,
                targetName: f.existingName,
                size: f.size,
                decision: decisions[f.slot] || 'overwrite'
            });
        });

        return list;
    }, [diff, decisions]);

    const handleDecisionChange = (id: string, decision: SyncItem['decision']) => {
        setDecisions(prev => ({ ...prev, [id]: decision }));
    };

    const handleConfirm = () => {
        onConfirm(decisions);
    };

    if (!isOpen) return null;

    const count = items.filter(i => (decisions[i.id] || 'overwrite') !== 'skip').length;

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[110] p-4">
            <div className="bg-synthux-panel border border-gray-800 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200 lg:h-[80vh]">

                <div className="p-6 border-b border-gray-800 bg-black/20">
                    <h2 className="text-xl font-bold text-white font-header flex items-center gap-3">
                        <RefreshCw className="text-purple-400" />
                        Confirm Sync
                    </h2>
                    <p className="text-gray-400 text-xs mt-1">
                        Review incoming files and choose how to handle conflicts.
                    </p>
                </div>

                <div className="flex-1 overflow-y-auto p-0 bg-black/30">
                    {items.length > 0 ? (
                        <SyncComparisonTable
                            items={items}
                            onDecisionChange={handleDecisionChange}
                        />
                    ) : (
                        <div className="text-center text-gray-500 py-20">
                            No changes detected. Project is up to date.
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-gray-800 bg-black/20 flex justify-between items-center bg-synthux-panel">
                    <div className="text-xs text-gray-500">
                        {items.length} differences found.
                    </div>
                    <div className="flex gap-3">
                        <button onClick={onClose} className="px-4 py-2 hover:bg-gray-800 text-gray-400 hover:text-white rounded-lg transition-colors text-sm font-bold">
                            Cancel
                        </button>
                        <button
                            onClick={handleConfirm}
                            disabled={count === 0}
                            className={`px-6 py-2 rounded-lg transition-all font-bold flex items-center gap-2 ${count === 0
                                ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                                : 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-500/20'
                                }`}
                        >
                            <RefreshCw size={16} />
                            {count > 0 ? `Sync ${count} Files` : 'Nothing to Sync'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
