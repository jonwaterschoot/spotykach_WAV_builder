import React, { useState, useMemo } from 'react';
import { X, ArrowDown, FolderInput, AlertTriangle, FileAudio, CheckSquare, Square, RefreshCw, Check, ArrowRight } from 'lucide-react';
import type { DeviceDiff, DeviceFileChange } from '../utils/importUtils';
import type { AppState, FileRecord } from '../types';

interface DeviceImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    diff: DeviceDiff | null;
    projectState: AppState;
    onImport: (selectedFiles: DeviceFileChange[]) => Promise<void>;
}

export const DeviceImportModal: React.FC<DeviceImportModalProps> = ({
    isOpen,
    onClose,
    diff,
    projectState,
    onImport
}) => {
    const [selectedSlots, setSelectedSlots] = useState<Set<string>>(new Set());
    const [isImporting, setIsImporting] = useState(false);

    // Initial selection - select all by default
    React.useEffect(() => {
        if (isOpen && diff) {
            const allSlots = new Set<string>();
            diff.newFiles.forEach(f => allSlots.add(f.slot));
            diff.updatedFiles.forEach(f => allSlots.add(f.slot));
            setSelectedSlots(allSlots);
        }
    }, [isOpen, diff]);

    const allChanges = useMemo(() => {
        if (!diff) return [];
        // Combine and sort by slot (A1, A2, B1...)
        const combined = [...diff.updatedFiles.map(f => ({ ...f, type: 'modified' as const })),
        ...diff.newFiles.map(f => ({ ...f, type: 'new' as const }))];

        return combined.sort((a, b) => {
            // Simple localeCompare works for A1 vs B1, but A1 vs A10 needs numeric aware sort if needed
            // Standard localeCompare with numeric: true handles A1, A2, A10 correctly
            return a.slot.localeCompare(b.slot, undefined, { numeric: true });
        });
    }, [diff]);

    const handleToggle = (slot: string) => {
        const newSet = new Set(selectedSlots);
        if (newSet.has(slot)) {
            newSet.delete(slot);
        } else {
            newSet.add(slot);
        }
        setSelectedSlots(newSet);
    };

    const handleToggleAll = () => {
        if (selectedSlots.size === allChanges.length) {
            setSelectedSlots(new Set());
        } else {
            const newSet = new Set<string>();
            allChanges.forEach(f => newSet.add(f.slot));
            setSelectedSlots(newSet);
        }
    };

    const handleConfirmImport = async () => {
        setIsImporting(true);
        const filesToImport = allChanges.filter(f => selectedSlots.has(f.slot));
        await onImport(filesToImport);
        setIsImporting(false);
        onClose();
    };

    if (!isOpen || !diff) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-[#121212] w-full max-w-4xl rounded-2xl border border-white/10 flex flex-col shadow-2xl overflow-hidden max-h-[85vh] relative">

                {/* HEADER */}
                <header className="flex items-center justify-between p-6 border-b border-white/10 bg-[#1a1a1a] shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-500/20 rounded-xl">
                            <FolderInput size={24} className="text-blue-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">Import Device Changes</h2>
                            <p className="text-gray-400 text-sm">
                                Review and merge changes detected on the SD card.
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </header>

                {/* SUMMARY BAR */}
                <div className="flex items-center justify-between px-6 py-3 bg-[#181818] border-b border-white/5 shrink-0 text-sm">
                    <div className="flex gap-4">
                        <div className="flex items-center gap-2 text-green-400">
                            <AlertTriangle size={14} />
                            <span className="font-bold">{diff.newFiles.length} New</span>
                        </div>
                        <div className="flex items-center gap-2 text-yellow-400">
                            <RefreshCw size={14} />
                            <span className="font-bold">{diff.updatedFiles.length} Modified</span>
                        </div>
                    </div>
                    <button
                        onClick={handleToggleAll}
                        className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
                    >
                        {selectedSlots.size === allChanges.length ? <CheckSquare size={16} /> : <Square size={16} />}
                        <span>{selectedSlots.size === allChanges.length ? "Deselect All" : "Select All"}</span>
                    </button>
                </div>

                {/* LIST CONTENT */}
                <div className="flex-1 overflow-y-auto bg-[#0f0f0f] p-4">
                    <div className="space-y-2">
                        {allChanges.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-48 text-gray-500">
                                <Check size={48} className="mb-2 opacity-50" />
                                <p>No changes detected.</p>
                            </div>
                        ) : allChanges.map((change) => {
                            const isMod = change.type === 'modified';
                            const originalFile = isMod && 'originalFileId' in change && change.originalFileId
                                ? (projectState as AppState).files[change.originalFileId as string]
                                : null;

                            const isSelected = selectedSlots.has(change.slot);

                            return (
                                <div
                                    key={change.slot}
                                    className={`relative group flex items-stretch gap-4 p-3 rounded-lg border transition-all cursor-pointer ${isSelected
                                        ? 'bg-blue-500/5 border-blue-500/30'
                                        : 'bg-[#151515] border-white/5 hover:bg-white/5'
                                        }`}
                                    onClick={() => handleToggle(change.slot)}
                                >
                                    {/* CHECKBOX */}
                                    <div className={`flex items-center justify-center w-8 shrink-0 ${isSelected ? 'text-blue-400' : 'text-gray-600'}`}>
                                        {isSelected ? <CheckSquare size={20} /> : <Square size={20} />}
                                    </div>

                                    {/* ICON */}
                                    <div className="flex items-center justify-center">
                                        <div className={`p-2 rounded-lg ${isMod ? "bg-yellow-500/10 text-yellow-400" : "bg-green-500/10 text-green-400"}`}>
                                            <FileAudio size={20} />
                                        </div>
                                    </div>

                                    {/* COMPARISON GRID */}
                                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">

                                        {/* LEFT: PROJECT STATE */}
                                        <div className="flex flex-col justify-center min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="font-mono text-xs font-bold text-gray-500 px-1.5 py-0.5 bg-white/10 rounded">
                                                    {change.slot}
                                                </span>
                                                <span className="text-xs text-gray-500 uppercase tracking-wider font-bold">Project Version</span>
                                            </div>
                                            <div className="font-medium text-gray-300 truncate">
                                                {originalFile ? originalFile.originalName : <span className="text-gray-600 italic">Empty Slot</span>}
                                            </div>
                                            {originalFile && (
                                                <div className="text-[10px] text-gray-600 mt-0.5">
                                                    {(originalFile.versions[originalFile.versions.length - 1]?.blob.size / 1024).toFixed(1) || '0'} KB
                                                </div>
                                            )}
                                        </div>

                                        {/* RIGHT: DEVICE STATE */}
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="text-gray-600">
                                                <ArrowRight size={16} />
                                            </div>
                                            <div className="flex flex-col justify-center min-w-0 flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${isMod ? "text-yellow-500 bg-yellow-500/10" : "text-green-500 bg-green-500/10"}`}>
                                                        {isMod ? "Modified" : "New File"}
                                                    </span>
                                                    <span className="text-[10px] text-gray-500">Device Version</span>
                                                </div>
                                                <div className="font-medium text-white truncate break-all">
                                                    {change.file.name}
                                                </div>
                                                <div className="flex items-center gap-3 mt-0.5 text-[10px] text-gray-500">
                                                    <span>{(change.file.size / 1024).toFixed(1)} KB</span>
                                                    <span>•</span>
                                                    <span>{new Date(change.file.lastModified).toLocaleString()}</span>
                                                </div>
                                            </div>
                                        </div>

                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* FOOTER */}
                <div className="p-6 border-t border-white/10 bg-[#1a1a1a] flex justify-between items-center shrink-0">
                    <div className="text-sm text-gray-500">
                        Select files to import into your project.
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            disabled={isImporting}
                            className="px-4 py-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleConfirmImport}
                            disabled={selectedSlots.size === 0 || isImporting}
                            className={`px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all ${isImporting ? "pl-4 pr-6" : ""}`}
                        >
                            {isImporting ? <RefreshCw size={18} className="animate-spin" /> : <ArrowDown size={18} />}
                            {isImporting ? "Importing..." : `Import ${selectedSlots.size} Items`}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
