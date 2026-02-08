import { Play, Square, Trash2, Repeat, Download, AlertTriangle, X, Edit3 } from 'lucide-react';
import { useState } from 'react';
import { MiniWaveform } from './MiniWaveform';
import type { Slot, FileRecord, TapeColor } from '../types';
import { useAudioPlayer } from '../contexts/AudioPlayerContext';

interface SlotCardProps {
    slot: Slot;
    fileRecord: FileRecord | null;
    tapeColor: TapeColor;
    isActive: boolean;
    onClick: () => void;
    onDrop: (files: FileList) => void;
    onDropInternal: (fileId: string, source: string, isDuplicate: boolean, sourceSlotId?: number, sourceSlotColor?: TapeColor) => void;
    onRemove: () => void;
    onDelete?: () => void;
    isDuplicate: boolean;
    onBulkAssign?: (targetSlotId: number, fileIds: string[], targetColor: TapeColor, sourceSlotKeys?: string[]) => void;
    isSelected: boolean;
    onSlotSelectionClick: (e: React.MouseEvent) => void;
    onToggleSlotSelection: () => void;
    onSlotDragStart?: (e: React.DragEvent) => void;
}

export const SlotCard = ({ slot, fileRecord, tapeColor, isActive, onClick, onDrop, onDropInternal, onRemove, onDelete, isDuplicate, onBulkAssign, isSelected, onToggleSlotSelection, onSlotDragStart }: SlotCardProps) => {
    const { play, stop, isPlaying, activeFileId, currentTime, duration, seek } = useAudioPlayer();

    // Check if this slot's file is currently playing
    const isThisPlaying = isPlaying && activeFileId === fileRecord?.id;
    const [isDragOver, setIsDragOver] = useState(false);

    const handleDragStart = (e: React.DragEvent) => {
        if (onSlotDragStart) {
            onSlotDragStart(e);
            return;
        }
        if (fileRecord) {
            e.dataTransfer.setData('application/x-spotykach-file-id', fileRecord.id);
            e.dataTransfer.setData('application/x-spotykach-source', 'slot');
            e.dataTransfer.setData('application/x-spotykach-slot-id', slot.id.toString());
            e.dataTransfer.effectAllowed = 'copyMove';
        } else {
            e.preventDefault();
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.types.includes('application/x-spotykach-file-id')) {
            // Check modifier keys for copy effect visual
            e.dataTransfer.dropEffect = e.ctrlKey || e.altKey ? 'copy' : 'move';
            setIsDragOver(true);
        } else {
            e.dataTransfer.dropEffect = 'copy';
            setIsDragOver(!!e.dataTransfer.types.length);
        }
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);

        const internalId = e.dataTransfer.getData('application/x-spotykach-file-id');
        const bulkData = e.dataTransfer.getData('application/x-spotykach-bulk-ids');
        const bulkSourceData = e.dataTransfer.getData('application/x-spotykach-bulk-source-slots');

        if (bulkData && onBulkAssign) {
            try {
                const fileIds = JSON.parse(bulkData) as string[];
                const sourceKeys = bulkSourceData ? JSON.parse(bulkSourceData) as string[] : undefined;

                if (Array.isArray(fileIds) && fileIds.length > 0) {
                    onBulkAssign(slot.id, fileIds, tapeColor, sourceKeys);
                    return;
                }
            } catch (e) {
                console.error("Failed to parse bulk drop", e);
            }
        }

        if (internalId) {
            const source = e.dataTransfer.getData('application/x-spotykach-source');
            const isDuplicate = e.ctrlKey || e.altKey;

            const sourceSlotIdStr = e.dataTransfer.getData('application/x-spotykach-slot-id');
            const sourceSlotId = sourceSlotIdStr ? parseInt(sourceSlotIdStr, 10) : undefined;
            const sourceSlotColor = e.dataTransfer.getData('application/x-spotykach-slot-color') as TapeColor | '';

            onDropInternal(internalId, source, isDuplicate, sourceSlotId, sourceSlotColor || undefined);
            return;
        }

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            onDrop(e.dataTransfer.files);
        }
    };

    const currentVersion = fileRecord?.versions.find(v => v.id === fileRecord.currentVersionId);
    // Helper to check for "Loop" in description
    const isLooped = currentVersion?.description?.toLowerCase().includes('loop');

    const tapeColorVar = `var(--color-synthux-${tapeColor.toLowerCase()})`;

    return (
        <div
            onClick={onClick}
            onDoubleClick={onClick}
            draggable={!!fileRecord}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
                relative aspect-square rounded-xl border-2 cursor-pointer transition-all duration-200
                flex flex-col group
                ${isDragOver ? 'bg-white/10 scale-105 z-20' : isActive ? 'bg-[#1a1a1a] shadow-xl scale-[1.02]' : 'border-gray-700 bg-[#151515] hover:border-gray-500'}
                ${fileRecord ? 'shadow-lg' : ''}
                ${isDuplicate ? '!border-orange-500/50 shadow-[0_0_10px_rgba(249,115,22,0.1)]' : ''}
                ${isSelected ? 'ring-2 ring-synthux-yellow' : ''}
            `}
            style={{
                borderColor: (isActive || isDragOver) ? tapeColorVar : (isSelected ? 'var(--color-synthux-yellow)' : undefined),
            }}
        >
            {/* Selection Checkbox - Only show if file exists */}
            {fileRecord && (
                <div
                    className={`absolute -top-3 -left-3 w-6 h-6 z-50 rounded-full border-2 flex items-center justify-center cursor-pointer transition-colors shadow-md ${isSelected ? 'bg-synthux-yellow border-white text-black' : 'bg-gray-800 border-gray-500 text-transparent hover:border-white'}`}
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggleSlotSelection();
                    }}
                >
                    <div className="w-2 h-2 bg-current rounded-full" />
                </div>
            )}
            {/* Duplicate Badge */}
            {isDuplicate && (
                <div className="absolute -top-2 -right-2 text-orange-400/80 z-40 bg-black/80 rounded-full p-1 border border-orange-500/30 shadow-sm" title="Duplicate File">
                    <AlertTriangle size={14} />
                </div>
            )}

            {/* Slot ID Badge */}
            <div className="absolute top-2 left-3 text-xs font-bold text-gray-600 z-10 pointer-events-none">
                {slot.id}
            </div>

            {fileRecord && currentVersion ? (
                <>
                    {/* Top: Mini Waveform Area */}
                    <div className="flex-1 w-full bg-black/20 flex items-center justify-center relative overflow-hidden rounded-t-lg">
                        <MiniWaveform
                            blob={currentVersion.blob}
                            width={200}
                            height={80}
                            color={isActive ? "#60a5fa" : "#9ca3af"}
                            className="w-full h-full p-4"
                            progress={isThisPlaying && duration > 0 ? currentTime / duration : 0}
                            onSeek={(p) => {
                                if (isThisPlaying && duration > 0) {
                                    seek(p * duration);
                                } else if (fileRecord) {
                                    play(fileRecord);
                                }
                            }}
                        />

                        {/* Version Badge (Top Right) */}
                        <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
                            {fileRecord.versions.length > 1 && (
                                <span className="px-1.5 py-0.5 bg-synthux-blue/20 rounded text-[9px] text-synthux-blue border border-synthux-blue/50 font-mono">
                                    v{fileRecord.versions.length}
                                </span>
                            )}
                            {isLooped && (
                                <span className="px-1.5 py-0.5 bg-green-900/40 rounded text-[9px] text-green-400 border border-green-700/50 font-bold uppercase tracking-wider flex items-center gap-1">
                                    <Repeat size={8} /> Loop
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Middle: Info */}
                    <div className="px-3 py-2 border-t border-gray-800 bg-[#1e1e1e] flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold truncate text-white mb-0.5" title={fileRecord.name}>
                                {fileRecord.name}
                            </div>
                            <div className="flex items-center text-[10px] text-gray-400 font-mono uppercase tracking-wider gap-2">
                                <span>{currentVersion.duration.toFixed(2)}s</span>
                                {/* Short Description if not default */}
                                {currentVersion.description &&
                                    currentVersion.description !== 'Original Upload' &&
                                    currentVersion.description !== 'Edited' &&
                                    !isLooped && (
                                        <span className="text-synthux-gold truncate max-w-[80px]">
                                            {currentVersion.description}
                                        </span>
                                    )}
                            </div>
                        </div>

                    </div>

                    {/* Bottom: Controls */}
                    <div className="flex items-center justify-between gap-1 px-2 py-2 bg-[#111] border-t border-gray-800 rounded-b-lg">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                if (isThisPlaying) stop();
                                else if (fileRecord) play(fileRecord);
                            }}
                            className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded transition-all active:scale-95 ${isThisPlaying
                                ? 'bg-synthux-blue text-white shadow-lg shadow-synthux-blue/20'
                                : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white'
                                } `}
                            title={isThisPlaying ? "Stop" : "Preview"}
                        >
                            {isThisPlaying ? <Square size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
                            <span className="text-[10px] font-bold uppercase">{isThisPlaying ? 'STOP' : 'PLAY'}</span>
                        </button>



                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                // Dynamic import to avoid circular dependency issues if any, or just direct use if Utils are clean
                                import('../utils/exportUtils').then(u => u.exportSingleFile(fileRecord));
                            }}
                            className="p-1.5 rounded bg-gray-900 text-gray-500 hover:bg-gray-800 hover:text-white transition-colors"
                            title="Download WAV"
                        >
                            <Download size={14} />
                        </button>





                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onClick();
                            }}
                            className="p-2 hover:bg-white/10 text-gray-500 hover:text-white rounded transition-colors"
                            title="Open Editor"
                        >
                            <Edit3 size={14} />
                        </button>

                        {/* Unassign (Move to Pool) */}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onRemove();
                            }}
                            className="p-2 hover:bg-synthux-yellow/20 text-gray-500 hover:text-synthux-yellow rounded transition-colors"
                            title="Remove from Slot (Move to Unassigned)"
                        >
                            <X size={14} />
                        </button>



                        {/* Perma Delete */}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete?.();
                            }}
                            className="p-2 hover:bg-red-500/20 text-gray-500 hover:text-red-500 rounded transition-colors"
                            title="Permanently Delete File"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                </>
            ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-600 gap-2 group-hover:scale-105 transition-transform">
                    {/* Reusing the styling logic from MiniSlotCard roughly */}
                    <style>{`
                        .group:hover .empty-plus-large {
                            color: #ffb900 !important;
                            opacity: 1 !important; 
                            text-shadow: 0 0 10px #ffb90060;
                        }
                    `}</style>
                    <div className="text-4xl font-light empty-plus-large transition-all duration-300" style={{ color: '#ffb900', opacity: 0.5 }}>+</div>
                    <div className="text-xs font-medium empty-plus-large transition-all duration-300" style={{ color: '#ffb900', opacity: 0.5 }}>Empty Slot</div>
                </div>
            )}
        </div>
    );
};
