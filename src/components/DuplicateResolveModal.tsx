import { X, AlertTriangle, Copy } from 'lucide-react';
import type { TapeColor, FileRecord } from '../types';
import { TapeIcon } from './TapeIcon';

interface DuplicateLocation {
    slotId: number;
    color: TapeColor;
}

interface DuplicateResolveModalProps {
    duplicates: Map<string, DuplicateLocation[]>;
    files: Record<string, FileRecord>;
    onKeep: (fileId: string, location: DuplicateLocation) => void;
    onMakeUnique: (fileId: string) => void;
    onClose: () => void;
}

export const DuplicateResolveModal = ({ duplicates, files, onKeep, onMakeUnique, onClose }: DuplicateResolveModalProps) => {

    // Auto-close if no duplicates left
    if (duplicates.size === 0) {
        onClose();
        return null;
    }

    const getColorVar = (color: string) => {
        switch (color) {
            case 'Red': return 'var(--color-synthux-red)';
            case 'Blue': return 'var(--color-synthux-blue)';
            case 'Green': return 'var(--color-synthux-green)';
            case 'Pink': return 'var(--color-synthux-pink)';
            case 'Yellow': return 'var(--color-synthux-yellow)';
            case 'Turquoise': return 'var(--color-synthux-turquoise)';
            default: return 'var(--color-synthux-blue)';
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="w-full max-w-2xl bg-[#1a1a1a] border border-gray-700 rounded-2xl shadow-2xl flex flex-col max-h-[80vh] overflow-hidden">

                {/* Header */}
                <div className="p-6 border-b border-gray-700 flex items-center justify-between bg-[#222]">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-full bg-orange-500/20 text-orange-400">
                            <AlertTriangle size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">Resolve Duplicates</h2>
                            <p className="text-sm text-gray-400">The same file is assigned to multiple slots.</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-white rounded-full hover:bg-white/10 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Body - Scrollable List */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {Array.from(duplicates.entries()).map(([fileId, locations]) => {
                        const file = files[fileId];
                        if (!file) return null;

                        return (
                            <div key={fileId} className="bg-black/30 border border-gray-700 rounded-xl p-4 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                                {/* File Info */}
                                <div className="min-w-0 flex-1">
                                    <div className="font-bold text-white text-lg truncate" title={file.name}>{file.name}</div>
                                    <div className="text-xs text-gray-500 font-mono truncate">{file.originalName}</div>
                                    <div className="text-xs text-orange-400 mt-1 flex items-center gap-1">
                                        <AlertTriangle size={12} />
                                        Used in {locations.length} slots
                                    </div>
                                </div>

                                {/* Actions Column */}
                                <div className="flex flex-col gap-3 w-full md:w-auto">

                                    {/* Keep One Choice */}
                                    <div className="flex flex-col gap-1">
                                        <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Keep only:</span>
                                        <div className="flex flex-wrap gap-2">
                                            {locations.map((loc) => {
                                                const colorVar = getColorVar(loc.color);
                                                return (
                                                    <button
                                                        key={`${loc.color}-${loc.slotId}`}
                                                        onClick={() => onKeep(fileId, loc)}
                                                        className="flex items-center gap-2 pl-1 pr-3 py-1 bg-gray-800 border border-gray-600 rounded-full hover:border-white hover:bg-gray-700 transition-all group"
                                                        title={`Keep only slot ${loc.color} ${loc.slotId}`}
                                                    >
                                                        <div className="w-5 h-5">
                                                            <TapeIcon color={colorVar} className="w-full h-full" />
                                                        </div>
                                                        <span className="text-xs font-bold text-gray-300 group-hover:text-white">
                                                            {loc.slotId}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Make Unique */}
                                    <div className="flex flex-col gap-1">
                                        <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Or:</span>
                                        <button
                                            onClick={() => onMakeUnique(fileId)}
                                            className="flex items-center justify-center gap-2 px-3 py-2 bg-synthux-blue/20 text-synthux-blue border border-synthux-blue/50 rounded-lg hover:bg-synthux-blue hover:text-white transition-all text-xs font-bold uppercase"
                                        >
                                            <Copy size={14} />
                                            Make Each Unique
                                        </button>
                                    </div>

                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-700 bg-[#222] flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-bold text-gray-300 hover:text-white"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};
