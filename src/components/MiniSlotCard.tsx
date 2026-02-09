import { Play, Square, Trash2, AlertTriangle, X, Edit3 } from 'lucide-react';
import { useState } from 'react';
import { MiniWaveform } from './MiniWaveform';
import type { Slot, FileRecord, TapeColor } from '../types';
import { useAudioPlayer } from '../contexts/AudioPlayerContext';

interface MiniSlotCardProps {
    slot: Slot;
    fileRecord: FileRecord | null;
    tapeColor: TapeColor;
    onRemove: () => void;
    onDelete?: () => void;
    onDrop: (files: FileList) => void;
    onDropInternal: (fileId: string, source: string, isDuplicate: boolean, sourceSlotId?: number, sourceSlotColor?: TapeColor) => void;
    onClick: () => void;
    isDuplicate?: boolean;
    onBulkAssign?: (targetSlotId: number, fileIds: string[], targetColor: TapeColor, sourceSlotKeys?: string[]) => void;
    isSelected: boolean;
    onSlotSelectionClick: (e: React.MouseEvent) => void;
    onToggleSlotSelection: () => void;
    onSlotDragStart?: (e: React.DragEvent) => void;
}

export const MiniSlotCard = ({ slot, fileRecord, tapeColor, onRemove, onDelete, onDrop, onDropInternal, onClick, isDuplicate, onBulkAssign, isSelected, onToggleSlotSelection, onSlotDragStart }: MiniSlotCardProps) => {
    const { play, stop, isPlaying, activeFileId } = useAudioPlayer();

    const isThisPlaying = isPlaying && activeFileId === fileRecord?.id;
    const currentVersion = fileRecord?.versions.find(v => v.id === fileRecord.currentVersionId);

    // Get color hex/class logic. We can reuse COLOR_MAP or just use CSS variables if set up.
    const [isDragOver, setIsDragOver] = useState(false);

    // Selection style
    const selectionClass = isSelected ? 'ring-2 ring-white z-10' : '';

    // Drag Handlers
    const handleDragStart = (e: React.DragEvent) => {
        if (onSlotDragStart) {
            onSlotDragStart(e);
            return;
        }
        if (fileRecord) {
            e.dataTransfer.setData('application/x-spotykach-file-id', fileRecord.id);
            e.dataTransfer.setData('text/plain', fileRecord.id); // Polyfill Fallback
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
        // Allow if custom type exists OR if text/plain (polyfill fallback)
        if (e.dataTransfer.types.includes('application/x-spotykach-file-id') ||
            e.dataTransfer.types.includes('text/plain')) {

            e.dataTransfer.dropEffect = e.ctrlKey || e.altKey ? 'copy' : 'move';
            if (!isDragOver) setIsDragOver(true);
        } else {
            e.dataTransfer.dropEffect = 'copy';
            setIsDragOver(!!e.dataTransfer.types.length); // Highlight if file drag
        }
    };

    const handleDragEnter = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.types.includes('application/x-spotykach-file-id') ||
            e.dataTransfer.types.includes('text/plain')) {
            setIsDragOver(true);
        }
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        // prevent flickering when hovering over children
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setIsDragOver(false);
        }
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);

        // Parse Data
        let internalId = e.dataTransfer.getData('application/x-spotykach-file-id');
        let source = e.dataTransfer.getData('application/x-spotykach-source');
        let bulkData = e.dataTransfer.getData('application/x-spotykach-bulk-ids');
        let bulkSourceData = e.dataTransfer.getData('application/x-spotykach-bulk-source-slots');
        let sourceSlotIdStr = e.dataTransfer.getData('application/x-spotykach-slot-id');
        let sourceSlotColor = e.dataTransfer.getData('application/x-spotykach-slot-color') as TapeColor | '';

        // Polyfill Fallback: Try parsing text/plain as JSON
        if (!internalId) {
            const textData = e.dataTransfer.getData('text/plain');
            if (textData) {
                try {
                    const json = JSON.parse(textData);
                    if (json.id) {
                        internalId = json.id;
                        source = json.source;
                        if (json.bulkIds) bulkData = JSON.stringify(json.bulkIds);
                        if (json.bulkSourceKeys) bulkSourceData = JSON.stringify(json.bulkSourceKeys);
                        if (json.slotId) sourceSlotIdStr = json.slotId.toString();
                        if (json.slotColor) sourceSlotColor = json.slotColor;
                    } else {
                        internalId = textData;
                    }
                } catch (err) {
                    internalId = textData;
                }
            }
        }

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
            const isDuplicate = e.ctrlKey || e.altKey;
            const sourceSlotId = sourceSlotIdStr ? parseInt(sourceSlotIdStr, 10) : undefined;
            onDropInternal(internalId, source, isDuplicate, sourceSlotId, sourceSlotColor || undefined);
            return;
        }

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            onDrop(e.dataTransfer.files);
        }
    };

    // Dynamic color class for hover text on empty slot
    // We'll use style since Tailwind classes need safelisting or complete map
    const getColorHex = (c: TapeColor) => {
        switch (c) {
            case 'Blue': return '#00aaff';
            case 'Green': return '#00ff00';
            case 'Pink': return '#ff00ff';
            case 'Red': return '#f00f13';
            case 'Turquoise': return '#00ffff';
            case 'Yellow': return '#ffb900'; // Synthux Yellow
            default: return '#fff';
        }
    };

    return (
        <div
            onClick={onClick}
            onDoubleClick={onClick}
            draggable={!!fileRecord}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            style={{ touchAction: 'none' }}
            className={`
            relative w-full h-full min-h-[50px] rounded-lg border bg-[#151515] 
            flex flex-col group transition-all
            ${isDragOver ? 'border-synthux-blue bg-synthux-blue/10 scale-105 z-20 shadow-xl' : 'border-gray-800 hover:border-gray-500'}
            ${fileRecord ? 'cursor-grab active:cursor-grabbing' : 'opacity-80 hover:opacity-100 cursor-pointer'}
            ${fileRecord && isDuplicate ? '!border-orange-500/50' : ''}
            ${selectionClass}
        `}
        >
            {/* Selection Checkbox (Touch Target) - Only show if file exists */}
            {fileRecord && (
                <div
                    className={`absolute -top-1 -left-1 w-4 h-4 z-20 rounded-full border flex items-center justify-center cursor-pointer transition-colors ${isSelected ? 'bg-synthux-yellow border-white text-black' : 'bg-gray-800 border-gray-600 text-transparent hover:border-gray-400'}`}
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggleSlotSelection();
                    }}
                >
                    <div className="w-1.5 h-1.5 bg-current rounded-full" />
                </div>
            )}
            {fileRecord && currentVersion ? (
                <>
                    {/* Duplicate Icon */}
                    {isDuplicate && (
                        <div className="absolute -top-1.5 -right-1.5 z-30 text-orange-400/80 bg-black/50 rounded-full p-0.5 border border-orange-500/30 shadow-sm">
                            <AlertTriangle size={8} />
                        </div>
                    )}
                    {/* Background Waveform Area */}
                    <div className="absolute inset-0 z-0 opacity-50 overflow-hidden rounded-lg">
                        <MiniWaveform
                            blob={currentVersion.blob}
                            width={100}
                            height={60}
                            color={isThisPlaying ? "#ffffff" : "#6b7280"} // White if playing, gray otherwise
                            className="w-full h-full p-2"
                        />
                    </div>

                    {/* Content Overlay */}
                    <div className="relative z-10 flex flex-col justify-between h-full p-2 bg-gradient-to-t from-black/80 to-transparent">

                        {/* Top Row: Play & Trash (Hidden until hover unless playing) */}
                        <div className={`flex justify - between items - start transition - opacity duration - 200 ${isThisPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} `}>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (isThisPlaying) stop();
                                    else play(fileRecord);
                                }}
                                className="p-1 rounded-full bg-black/60 hover:bg-white text-white hover:text-black transition-colors"
                                title={isThisPlaying ? "Stop" : "Play"}
                            >
                                {isThisPlaying ? <Square size={10} fill="currentColor" /> : <Play size={10} fill="currentColor" />}
                            </button>

                            <div className="flex items-center gap-1">
                                {/* Edit */}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onClick();
                                    }}
                                    className="p-1 rounded-full bg-black/60 hover:bg-white text-white hover:text-black transition-colors"
                                    title="Edit"
                                >
                                    <Edit3 size={10} />
                                </button>
                                {/* Unassign */}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onRemove();
                                    }}
                                    className="p-1 rounded-full bg-black/60 hover:bg-synthux-yellow/20 text-gray-400 hover:text-synthux-yellow transition-colors"
                                    title="Unassign"
                                >
                                    <X size={10} />
                                </button>
                                {/* Delete */}
                                {onDelete && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onDelete();
                                        }}
                                        className="p-1 rounded-full bg-black/60 hover:bg-red-500 text-gray-400 hover:text-white transition-colors"
                                        title="Delete Permanently"
                                    >
                                        <Trash2 size={10} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Bottom Row: Filename */}
                        <div className="mt-auto pt-2">
                            <div className="text-[9px] font-bold text-gray-300 truncate" title={fileRecord.name}>
                                {fileRecord.name}
                            </div>
                        </div>
                    </div>
                </>
            ) : (
                // Empty State
                <div className="flex items-center justify-center h-full group-hover:scale-110 transition-transform">
                    <div
                        className="text-2xl font-light transition-colors duration-300"
                        style={{ color: '#ffb900', opacity: 0.5 }}
                    >
                        {/* We use specific style injection for hover to override opacity and color */}
                        <style>{`
        .group: hover.empty - plus {
        color: ${getColorHex(tapeColor)} !important;
        opacity: 1!important;
        text - shadow: 0 0 8px ${getColorHex(tapeColor)} 40;
    }
    `}</style>
                        <span className="empty-plus transition-all duration-300">+</span>
                    </div>
                </div>
            )}
        </div>
    );
};
