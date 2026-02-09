import { useEffect, useRef } from 'react';
import { CheckCircle, XCircle, Loader, Terminal, X } from 'lucide-react';

interface ExportProgressModalProps {
    isOpen: boolean;
    onClose: () => void;
    logs: string[];
    isComplete: boolean;
    error: string | null;
    successMessage?: string;
}

export const ExportProgressModal = ({ isOpen, onClose, logs, isComplete, error, successMessage }: ExportProgressModalProps) => {
    const logsEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom of logs
    useEffect(() => {
        logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[110] p-4">
            <div className="bg-synthux-panel border border-gray-800 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">

                {/* Header */}
                <div className="flex justify-between items-center p-6 border-b border-gray-800 bg-black/20">
                    <h2 className="text-xl font-bold text-white font-header flex items-center gap-3">
                        {isComplete ? (
                            error ? <XCircle className="text-red-500" /> : <CheckCircle className="text-synthux-action" />
                        ) : (
                            <Loader className="text-synthux-action animate-spin" />
                        )}
                        {isComplete ? (error ? 'Export Failed' : 'Export Complete') : 'Exporting...'}
                    </h2>
                    {isComplete && (
                        <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-full transition-colors text-gray-400 hover:text-white">
                            <X size={24} />
                        </button>
                    )}
                </div>

                {/* Content */}
                <div className="p-6 space-y-4">

                    {/* Status Message */}
                    {isComplete && !error && (
                        <div className="bg-synthux-action/10 border border-synthux-action/20 p-4 rounded-lg text-synthux-action text-center font-bold">
                            {successMessage || "Operation completed successfully."}
                        </div>
                    )}

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-lg text-red-400 text-center font-bold">
                            {error}
                        </div>
                    )}

                    {/* Log Window */}
                    <div className="bg-black/50 border border-gray-800 rounded-lg p-4 h-64 overflow-y-auto font-mono text-xs">
                        <div className="flex items-center gap-2 text-gray-500 mb-2 border-b border-gray-800 pb-2">
                            <Terminal size={12} />
                            <span>Process Log</span>
                        </div>
                        <div className="space-y-1">
                            {logs.map((log, i) => (
                                <div key={i} className="text-gray-300 break-all">
                                    <span className="text-gray-600 mr-2">{'>'}</span>
                                    {log}
                                </div>
                            ))}
                            <div ref={logsEndRef} />
                        </div>
                    </div>

                </div>

                {/* Footer Actions */}
                {isComplete && (
                    <div className="p-6 border-t border-gray-800 bg-black/20 flex justify-end">
                        <button
                            onClick={onClose}
                            className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors font-bold"
                        >
                            Close
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
