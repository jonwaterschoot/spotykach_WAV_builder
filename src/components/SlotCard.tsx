import { Play, Square, Trash2, Repeat, Download } from 'lucide-react';
import { MiniWaveform } from './MiniWaveform';
import type { Slot, FileRecord } from '../types';
import { useAudioPlayer } from '../contexts/AudioPlayerContext';

interface SlotCardProps {
    slot: Slot;
    fileRecord: FileRecord | null;
    isActive: boolean;
    onClick: () => void;
    onDrop: (files: FileList) => void;
    onDropInternal: (fileId: string, source: string, isDuplicate: boolean) => void;
    onRemove: () => void;
}

export const SlotCard = ({ slot, fileRecord, isActive, onClick, onDrop, onDropInternal, onRemove }: SlotCardProps) => {
    const { play, stop, isPlaying, activeFileId } = useAudioPlayer();

    // Check if this slot's file is currently playing
    const isThisPlaying = isPlaying && activeFileId === fileRecord?.id;
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
            // Check modifier keys for copy effect visual
            e.dataTransfer.dropEffect = e.ctrlKey || e.altKey ? 'copy' : 'move';
        } else {
            e.dataTransfer.dropEffect = 'copy';
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

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

    const currentVersion = fileRecord?.versions.find(v => v.id === fileRecord.currentVersionId);
    // Helper to check for "Loop" in description
    const isLooped = currentVersion?.description?.toLowerCase().includes('loop');

    return (
        <div
            onClick={onClick}
            draggable={!!fileRecord}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className={`
        relative aspect-square rounded-xl border-2 cursor-pointer transition-all duration-200
        flex flex-col overflow-hidden group
        ${isActive ? 'border-synthux-blue bg-[#1a1a1a] shadow-xl scale-[1.02]' : 'border-gray-700 bg-[#151515] hover:border-gray-500'}
        ${fileRecord ? 'shadow-lg' : ''}
      `}
        >
            {/* Slot ID Badge */}
            <div className="absolute top-2 left-3 text-xs font-bold text-gray-600 z-10 pointer-events-none">
                {slot.id}
            </div>

            {fileRecord && currentVersion ? (
                <>
                    {/* Top: Mini Waveform Area */}
                    <div className="flex-1 w-full bg-black/20 flex items-center justify-center relative overflow-hidden">
                        <MiniWaveform
                            blob={currentVersion.blob}
                            width={200}
                            height={80}
                            color={isActive ? "#60a5fa" : "#9ca3af"}
                            className="w-full h-full p-4"
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
                    <div className="px-3 py-2 border-t border-gray-800 bg-[#1e1e1e]">
                        <div className="text-sm font-bold truncate text-white mb-0.5" title={fileRecord.name}>
                            {fileRecord.name}
                        </div>
                        <div className="flex justify-between items-center text-[10px] text-gray-400 font-mono uppercase tracking-wider">
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

                    {/* Bottom: Controls */}
                    <div className="flex items-center justify-between px-2 py-2 bg-[#111] border-t border-gray-800">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                if (isThisPlaying) stop();
                                else if (fileRecord) play(fileRecord);
                            }}
                            className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded transition-all active:scale-95 ${isThisPlaying
                                ? 'bg-synthux-blue text-white shadow-lg shadow-synthux-blue/20'
                                : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white'
                                }`}
                            title={isThisPlaying ? "Stop" : "Preview"}
                        >
                            {isThisPlaying ? <Square size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
                            <span className="text-[10px] font-bold uppercase">{isThisPlaying ? 'STOP' : 'PLAY'}</span>
                        </button>

                        <div className="w-px h-4 bg-gray-800 mx-2"></div>

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

                        <div className="w-px h-4 bg-gray-800 mx-2"></div>

                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                if (confirm("Remove file from this tape slot? (File remains in pool)")) {
                                    onRemove();
                                }
                            }}
                            className="p-1.5 rounded bg-gray-900 text-gray-500 hover:bg-red-900/50 hover:text-red-400 transition-colors"
                            title="Remove from Tape"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                </>
            ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-600 gap-2">
                    <div className="text-2xl opacity-20">+</div>
                    <div className="text-xs font-medium opacity-50">Empty Slot</div>
                </div>
            )}
        </div>
    );
};
