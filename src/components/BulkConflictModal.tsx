import { AlertTriangle, X, CornerDownRight } from 'lucide-react';

interface BulkConflictModalProps {
    count: number;
    onOverwrite: () => void;
    onFillEmpty: () => void;
    onCancel: () => void;
}

export const BulkConflictModal = ({ count, onOverwrite, onFillEmpty, onCancel }: BulkConflictModalProps) => {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-[#1a1a1a] border border-orange-500/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="p-6 bg-gradient-to-b from-orange-500/10 to-transparent border-b border-white/5">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-orange-500/20 rounded-full">
                            <AlertTriangle className="text-orange-500" size={24} />
                        </div>
                        <h2 className="text-xl font-bold text-white tracking-tight">Assignment Conflict</h2>
                    </div>
                    <p className="text-gray-400 text-sm leading-relaxed">
                        The slots you are dropping into are already occupied. <span className="text-white font-bold">{count} file{count !== 1 ? 's' : ''}</span> would be overwritten.
                    </p>
                </div>

                {/* Actions */}
                <div className="p-4 flex flex-col gap-3">

                    {/* Option 1: Overwrite */}
                    <button
                        onClick={onOverwrite}
                        className="group flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/5 hover:bg-orange-500/10 hover:border-orange-500/30 transition-all text-left"
                    >
                        <div className="p-2 bg-white/5 rounded-lg group-hover:bg-orange-500/20 transition-colors">
                            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white">
                                <span>•</span>
                            </div>
                            <div className="w-0.5 h-8 bg-white/20 my-1 self-center" />
                            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white">
                                <span>L</span>
                            </div>
                        </div>
                        <div className="flex-1">
                            <div className="text-white font-bold text-sm mb-0.5">Overwrite Existing</div>
                            <div className="text-xs text-gray-500">Replace current files (they will be parked).</div>
                        </div>
                    </button>

                    {/* Option 2: Fill Empty (Push) */}
                    <button
                        onClick={onFillEmpty}
                        className="group flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/5 hover:bg-emerald-500/10 hover:border-emerald-500/30 transition-all text-left"
                    >
                        <div className="p-2 bg-white/5 rounded-lg group-hover:bg-emerald-500/20 transition-colors">
                            <CornerDownRight className="text-gray-400 group-hover:text-emerald-500" size={20} />
                        </div>
                        <div className="flex-1">
                            <div className="text-white font-bold text-sm mb-0.5">Push to Free Slots</div>
                            <div className="text-xs text-gray-500">Skip occupied slots and find next available spaces.</div>
                        </div>
                    </button>

                    {/* Cancel */}
                    <button
                        onClick={onCancel}
                        className="mt-2 w-full py-3 px-4 rounded-xl text-xs font-bold uppercase tracking-wider text-gray-500 hover:text-white hover:bg-white/5 transition-colors flex items-center justify-center gap-2"
                    >
                        <X size={14} /> Cancel
                    </button>

                </div>
            </div>
        </div>
    );
};
