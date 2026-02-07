import { Play, Square, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { MiniWaveform } from './MiniWaveform';
import type { Slot, FileRecord, TapeColor } from '../types';
import { useAudioPlayer } from '../contexts/AudioPlayerContext';

interface MiniSlotCardProps {
    slot: Slot;
    fileRecord: FileRecord | null;
    tapeColor: TapeColor;
    onRemove: () => void;
    onDrop: (files: FileList) => void;
    onDropInternal: (fileId: string, source: string, isDuplicate: boolean) => void;
    onClick: () => void;
}

export const MiniSlotCard = ({ slot, fileRecord, tapeColor, onRemove, onDrop, onDropInternal, onClick }: MiniSlotCardProps) => {
    const { play, stop, isPlaying, activeFileId } = useAudioPlayer();

    const isThisPlaying = isPlaying && activeFileId === fileRecord?.id;
    const currentVersion = fileRecord?.versions.find(v => v.id === fileRecord.currentVersionId);

    // Get color hex/class logic. We can reuse COLOR_MAP or just use CSS variables if set up.
    const [isDragOver, setIsDragOver] = useState(false);

    // Drag Handlers
    const handleDragStart = (e: React.DragEvent) => {
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
            e.dataTransfer.dropEffect = e.ctrlKey || e.altKey ? 'copy' : 'move';
            setIsDragOver(true);
        } else {
            e.dataTransfer.dropEffect = 'copy';
            setIsDragOver(!!e.dataTransfer.types.length); // Highlight if file drag
        }
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);

        const internalId = e.dataTransfer.getData('application/x-spotykach-file-id');
        if (internalId) {
            const source = e.dataTransfer.getData('application/x-spotykach-source');
            const isDuplicate = e.ctrlKey || e.altKey;

            onDropInternal(internalId, source, isDuplicate);
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
            draggable={!!fileRecord}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
            relative w-full h-full min-h-[50px] rounded-lg border bg-[#151515] 
            flex flex-col overflow-hidden group transition-all
            ${isDragOver ? 'border-synthux-blue bg-synthux-blue/10 scale-105 z-20 shadow-xl' : 'border-gray-800 hover:border-gray-500'}
            ${fileRecord ? 'cursor-grab active:cursor-grabbing' : 'opacity-80 hover:opacity-100 cursor-pointer'}
        `}>
            {fileRecord && currentVersion ? (
                <>
                    {/* Background Waveform Area */}
                    <div className="absolute inset-0 z-0 opacity-50">
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
                        <div className={`flex justify-between items-start transition-opacity duration-200 ${isThisPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
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

                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (confirm("Remove file from this tape slot?")) {
                                        onRemove();
                                    }
                                }}
                                className="p-1 rounded-full bg-black/60 hover:bg-red-500 text-gray-400 hover:text-white transition-colors"
                                title="Remove"
                            >
                                <Trash2 size={10} />
                            </button>
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
                            .group:hover .empty-plus {
                                color: ${getColorHex(tapeColor)} !important;
                                opacity: 1 !important;
                                text-shadow: 0 0 8px ${getColorHex(tapeColor)}40;
                            }
                        `}</style>
                        <span className="empty-plus transition-all duration-300">+</span>
                    </div>
                </div>
            )}
        </div>
    );
};
