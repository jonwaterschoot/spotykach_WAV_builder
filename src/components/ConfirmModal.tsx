import { X, AlertTriangle } from 'lucide-react';
import { useEscapeKey } from '../shell/escapeStack';

interface ConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    onDiscard?: () => void;
    title: string;
    message: React.ReactNode;
    confirmLabel?: string;
    discardLabel?: string;
    /** The way out that isn't the confirm. "Cancel" is wrong after the deed is done. */
    cancelLabel?: string;
    isDestructive?: boolean;
    showCancel?: boolean;
    /** Room for three buttons with long labels side by side. */
    wide?: boolean;
}

export const ConfirmModal = ({
    isOpen,
    onClose,
    onConfirm,
    onDiscard,
    title,
    message,
    confirmLabel = "Confirm",
    discardLabel = "Discard",
    cancelLabel = "Cancel",
    isDestructive = false,
    showCancel = true,
    wide = false,
}: ConfirmModalProps) => {
    useEscapeKey(onClose, isOpen);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-6 animate-in fade-in duration-200">
            <div className={`bg-synthux-panel border border-gray-800 rounded-2xl w-full ${wide ? 'max-w-lg' : 'max-w-md'} max-h-full overflow-y-auto overflow-x-hidden shadow-2xl flex flex-col animate-in zoom-in-95 duration-200`}>

                {/* Header */}
                <div className="flex justify-between items-center gap-4 p-6 border-b border-gray-800 bg-black/20">
                    <h3 className="min-w-0 text-xl font-bold text-white font-header flex items-center gap-2 [overflow-wrap:anywhere]">
                        {isDestructive && <AlertTriangle size={20} className="text-synthux-orange" />}
                        {title}
                    </h3>
                    <button
                        onClick={onClose}
                        className="shrink-0 p-2 hover:bg-gray-800 rounded-full transition-colors text-gray-400 hover:text-white"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 font-body text-gray-300 leading-relaxed space-y-4 [overflow-wrap:anywhere]">
                    {message}
                </div>

                {/* Actions */}
                <div className="p-6 pt-4 border-t border-gray-800 bg-gray-900/50 flex flex-wrap justify-end gap-3 transition-colors">
                    {onDiscard && (
                        <button
                            onClick={onDiscard}
                            className="whitespace-nowrap px-4 py-2 hover:bg-red-900/30 rounded-lg text-red-400 hover:text-red-300 font-bold text-sm transition-colors border border-transparent hover:border-red-900 mr-auto"
                        >
                            {discardLabel}
                        </button>
                    )}
                    {showCancel && (
                        <button
                            onClick={onClose}
                            className="whitespace-nowrap px-4 py-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white font-bold text-sm transition-colors border border-transparent hover:border-gray-700"
                        >
                            {cancelLabel}
                        </button>
                    )}
                    <button
                        onClick={() => {
                            onConfirm();
                        }}
                        className={`whitespace-nowrap px-6 py-2 rounded-lg text-white font-bold text-sm transition-all shadow-lg hover:scale-105 active:scale-95 ${isDestructive
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
