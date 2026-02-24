import { useState, useEffect } from 'react';
import { Play, Pause } from 'lucide-react';
import { TAPE_COLORS } from '../types';
import type { AppState, TapeColor } from '../types';
import { MiniSlotCard } from './MiniSlotCard';
import { TapeIcon } from './TapeIcon';
import { useAudioPlayer } from '../contexts/AudioPlayerContext';

interface AllViewGridProps {
    tapes: AppState['tapes'];
    files: AppState['files'];
    onRemoveSlot: (slotId: number, color: TapeColor) => void;
    onSlotDrop: (slotId: number, files: FileList, color: typeof TAPE_COLORS[number]) => void;
    onSlotDropInternal: (slotId: number, fileId: string, source: string, isDuplicate: boolean, color: typeof TAPE_COLORS[number], sourceSlotId?: number, sourceSlotColor?: TapeColor) => void;
    onSlotClick: (slotId: number, color: typeof TAPE_COLORS[number]) => void;
    onTapeHeaderClick: (color: typeof TAPE_COLORS[number]) => void;
    duplicates: Map<string, any[]>;
    onDeleteFile: (fileId: string) => void;
    onBulkAssign: (targetSlotId: number, fileIds: string[], targetColor: TapeColor, sourceSlotKeys?: string[]) => void;
    // Selection
    selectedSlots: Set<string>;
    onSlotSelectionClick: (slotId: number, color: TapeColor, e: React.MouseEvent) => void;
    onToggleSlotSelection: (slotId: number, color: TapeColor) => void;
    onSlotDragStart: (e: React.DragEvent, slotId: number, color: TapeColor) => void;
}

export const AllViewGrid = ({ tapes, files, onRemoveSlot, onSlotDrop, onSlotDropInternal, onSlotClick, onTapeHeaderClick, duplicates, onDeleteFile, onBulkAssign, selectedSlots, onSlotSelectionClick, onToggleSlotSelection, onSlotDragStart }: AllViewGridProps) => {
    const { isPlaying, activeFileId, play, pause, currentTime, duration, seek } = useAudioPlayer();

    // Retain last played file for player bar
    const [lastActiveFileId, setLastActiveFileId] = useState<string | null>(null);
    useEffect(() => {
        if (activeFileId) {
            setLastActiveFileId(activeFileId);
        }
    }, [activeFileId]);

    const displayFileId = activeFileId || lastActiveFileId;
    const activeFile = displayFileId ? files[displayFileId] : null;

    const getColorVar = (color: string) => {
        switch (color) {
            case 'Red': return 'red';
            case 'Blue': return 'blue';
            case 'Green': return 'green';
            case 'Pink': return 'pink';
            case 'Yellow': return 'yellow';
            case 'Turquoise': return 'turquoise';
            default: return 'blue';
        }
    };

    return (
        <div className="w-full h-full p-4 md:p-6 relative z-10 flex flex-col overflow-hidden">
            <div className="flex-1 flex flex-col gap-2 min-h-0">
                {TAPE_COLORS.map((color) => {
                    const tape = tapes[color];
                    const colorVar = `var(--color-synthux-${getColorVar(color)})`;

                    return (
                        <div key={color} className="flex-1 min-h-[60px] flex flex-col md:flex-row gap-2 items-center p-2 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors group/tape-row">

                            {/* Tape Label Column */}
                            <button
                                onClick={() => onTapeHeaderClick(color)}
                                className="w-24 flex-shrink-0 flex items-center gap-3 md:flex-col md:items-center md:gap-2 cursor-pointer hover:bg-white/10 rounded-lg p-1 transition-colors group/header"
                                title={`Open ${color} Tape View`}
                            >
                                <div className="w-8 h-8 md:w-10 md:h-10 group-hover/header:scale-110 transition-transform">
                                    <TapeIcon color={colorVar} className="w-full h-full" />
                                </div>
                                <span style={{ color: colorVar }} className="text-xs font-bold uppercase tracking-wider group-hover/header:brightness-125 transition-all">{color}</span>
                            </button>

                            {/* Slots Grid for this Tape */}
                            <div className="flex-1 w-full h-full grid grid-cols-6 gap-2">
                                {tape.slots.map((slot) => {
                                    const file = slot.fileId ? files[slot.fileId] : null;
                                    const isDuplicate = slot.fileId ? duplicates.has(slot.fileId) : false;

                                    return (
                                        <div key={slot.id} className="h-full">
                                            <MiniSlotCard
                                                slot={slot}
                                                fileRecord={file}
                                                tapeColor={color}
                                                isDuplicate={isDuplicate}
                                                onRemove={() => onRemoveSlot(slot.id, color)}
                                                onDelete={() => slot.fileId && onDeleteFile(slot.fileId)}
                                                onDrop={(files) => onSlotDrop(slot.id, files, color)}
                                                onDropInternal={(fileId, source, isDuplicate, sourceSlotId, sourceSlotColor) => onSlotDropInternal(slot.id, fileId, source, isDuplicate, color, sourceSlotId, sourceSlotColor)}
                                                onClick={() => onSlotClick(slot.id, color)}
                                                onBulkAssign={onBulkAssign}
                                                // Selection
                                                isSelected={selectedSlots.has(`${color}-${slot.id}`)}
                                                onSlotSelectionClick={(e) => onSlotSelectionClick(slot.id, color, e)}
                                                onToggleSlotSelection={() => onToggleSlotSelection(slot.id, color)}
                                                onSlotDragStart={(e) => onSlotDragStart(e, slot.id, color)}
                                            />
                                        </div>
                                    );
                                })}
                            </div>

                        </div>
                    );
                })}
            </div>

            {/* Global Player Bar */}
            <div className="mt-4 p-3 bg-gray-900 border border-gray-800 rounded-xl flex items-center justify-between gap-4 flex-shrink-0">
                <div className="flex items-center gap-3 w-full">
                    <button
                        onClick={() => {
                            if (isPlaying && activeFile?.id === activeFileId) pause();
                            else if (activeFile) play(activeFile);
                        }}
                        disabled={!activeFile}
                        className={`p-3 rounded-full transition-colors flex-shrink-0 ${activeFile && isPlaying && activeFile?.id === activeFileId ? 'bg-gray-700 text-white hover:bg-gray-600' : activeFile ? 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white' : 'bg-gray-900/50 text-gray-700 cursor-not-allowed'}`}
                        title={isPlaying && activeFile?.id === activeFileId ? "Pause" : "Play"}
                    >
                        {isPlaying && activeFile?.id === activeFileId ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                    </button>
                    <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-sm font-bold text-gray-300 truncate" title={activeFile ? activeFile.name : 'No file selected'}>
                            {activeFile ? activeFile.name : 'No file selected'}
                        </span>
                        {activeFile && (
                            <div className="flex items-center gap-3 mt-1 w-full">
                                <span className="text-[10px] text-gray-400 font-mono min-w-[30px] text-right">
                                    {Math.floor(currentTime || 0)}s
                                </span>
                                <input
                                    type="range"
                                    min={0}
                                    max={duration || 0}
                                    value={currentTime || 0}
                                    disabled={!activeFile || duration <= 0}
                                    onChange={(e) => {
                                        if (duration > 0) {
                                            seek(Number(e.target.value));
                                        }
                                    }}
                                    className="flex-1 accent-gray-300 disabled:opacity-40"
                                />
                                <span className="text-[10px] text-gray-400 font-mono min-w-[30px]">
                                    {Math.floor(duration || 0)}s
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
