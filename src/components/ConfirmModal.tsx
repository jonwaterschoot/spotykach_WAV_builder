import { X, AlertTriangle } from 'lucide-react';

interface ConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: React.ReactNode;
    confirmLabel?: string;
    isDestructive?: boolean;
}

export const ConfirmModal = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmLabel = "Confirm",
    isDestructive = false
}: ConfirmModalProps) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-6 animate-in fade-in duration-200">
            <div className="bg-synthux-panel border border-gray-800 rounded-2xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="flex justify-between items-center p-6 border-b border-gray-800 bg-black/20">
                    <h3 className="text-xl font-bold text-white font-header flex items-center gap-2">
                        {isDestructive && <AlertTriangle size={20} className="text-synthux-orange" />}
                        {title}
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-800 rounded-full transition-colors text-gray-400 hover:text-white"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 font-body text-gray-300 leading-relaxed space-y-4">
                    {message}
                </div>

                {/* Actions */}
                <div className="p-6 pt-4 border-t border-gray-800 bg-gray-900/50 flex justify-end gap-3 transition-colors">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white font-bold text-sm transition-colors border border-transparent hover:border-gray-700"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => {
                            onConfirm();
                        }}
                        className={`px-6 py-2 rounded-lg text-white font-bold text-sm transition-all shadow-lg hover:scale-105 active:scale-95 ${isDestructive
                                ? 'bg-synthux-orange hover:bg-orange-600 shadow-orange-900/20'
                                : 'bg-synthux-blue hover:bg-blue-600 shadow-blue-900/20'
                            }`}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};
