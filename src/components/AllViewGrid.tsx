import { TAPE_COLORS } from '../types';
import type { AppState, TapeColor } from '../types';
import { MiniSlotCard } from './MiniSlotCard';
import { TapeIcon } from './TapeIcon';

interface AllViewGridProps {
    tapes: AppState['tapes'];
    files: AppState['files'];
    onRemoveSlot: (slotId: number) => void;
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
                                                onRemove={() => onRemoveSlot(slot.id)}
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
        </div>
    );
};
