import React from 'react';
import { X, AlertTriangle } from 'lucide-react';

interface MissingFilesWarningModalProps {
    isOpen: boolean;
    onClose: () => void;
    missingFiles: string[];
    onSaveAnyway: () => void;
}

export const MissingFilesWarningModal: React.FC<MissingFilesWarningModalProps> = ({
    isOpen,
    onClose,
    missingFiles,
    onSaveAnyway
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[10001]">
            <div className="bg-synthux-panel border border-synthux-red rounded-lg w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-white/5">
                    <div className="flex items-center gap-2 text-synthux-red font-bold">
                        <AlertTriangle size={20} />
                        <h2>Unreadable Audio Files Detected</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-white/10 rounded-md transition-colors text-gray-400 hover:text-white"
                        aria-label="Close"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 text-gray-300 text-sm overflow-y-auto custom-scrollbar">
                    <p className="mb-4">
                        We cannot read the audio data for the following files. This usually happens if the original source file on your computer was moved, deleted, or if browser permissions were revoked.
                    </p>
                    <ul className="list-disc pl-5 mb-4 text-white font-mono bg-black/30 p-3 rounded rounded-md max-h-40 overflow-y-auto custom-scrollbar">
                        {missingFiles.map((f, i) => (
                            <li key={i}>{f}</li>
                        ))}
                    </ul>
                    <p className="mb-2">
                        <strong>Options:</strong>
                    </p>
                    <ul className="list-disc pl-5 text-gray-400">
                        <li className="mb-1"><strong className="text-gray-200">Cancel:</strong> Stop saving so you can re-import or fix these files manually.</li>
                        <li><strong className="text-gray-200">Save Anyway:</strong> The project will be saved, but these audio buffers will be skipped and marked as missing upon reloading the project.</li>
                    </ul>
                </div>

                {/* Actions */}
                <div className="p-4 border-t border-white/5 flex justify-end gap-3 bg-black/20 rounded-b-lg">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-md font-medium text-gray-300 hover:text-white hover:bg-white/10 transition-colors border border-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => {
                            onSaveAnyway();
                            onClose();
                        }}
                        className="px-4 py-2 rounded-md font-medium text-white bg-synthux-red/80 hover:bg-synthux-red transition-colors focus:outline-none focus:ring-2 focus:ring-synthux-red"
                    >
                        Save Anyway
                    </button>
                </div>
            </div>
        </div>
    );
};
