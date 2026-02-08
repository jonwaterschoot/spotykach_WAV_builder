import type { Slot, TapeColor, FileRecord } from '../types';
import { SlotCard } from './SlotCard';

interface SlotGridProps {
    slots: Slot[];
    files: Record<string, FileRecord>;
    tapeColor: TapeColor;
    activeSlotId: number | null;
    onSlotClick: (id: number) => void;
    onSlotDrop: (id: number, files: FileList) => void;
    onSlotDropInternal: (slotId: number, fileId: string, source: string, isDuplicate: boolean, sourceSlotId?: number, sourceSlotColor?: TapeColor) => void;
    onRemoveSlot: (slotId: number) => void;
    duplicates: Set<string>;
    onDeleteFile: (fileId: string) => void;
    onBulkAssign: (targetSlotId: number, fileIds: string[], targetColor?: TapeColor) => void;
    // Selection
    selectedSlots: Set<string>;
    onSlotSelectionClick: (color: TapeColor, slotId: number, e: React.MouseEvent) => void;
    onToggleSlotSelection: (color: TapeColor, slotId: number) => void;
    onSlotDragStart: (e: React.DragEvent, slotId: number, color: TapeColor) => void;
}

export const SlotGrid = ({ slots, files, tapeColor, activeSlotId, onSlotClick, onSlotDrop, onSlotDropInternal, onRemoveSlot, duplicates, onDeleteFile, onBulkAssign, selectedSlots, onSlotSelectionClick, onToggleSlotSelection, onSlotDragStart }: SlotGridProps) => {
    return (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6 p-6 w-full max-w-4xl mx-auto">
            {slots.map((slot) => {
                const fileRecord = slot.fileId ? files[slot.fileId] : null;
                const isDuplicate = slot.fileId ? duplicates.has(slot.fileId) : false;

                return (
                    <SlotCard
                        key={slot.id}
                        slot={slot}
                        fileRecord={fileRecord}
                        tapeColor={tapeColor}
                        isActive={activeSlotId === slot.id}
                        isDuplicate={isDuplicate}
                        onClick={() => onSlotClick(slot.id)}
                        onDrop={(files) => onSlotDrop(slot.id, files)}
                        onDropInternal={(fileId, source, isDuplicate, sourceSlotId, sourceSlotColor) => onSlotDropInternal(slot.id, fileId, source, isDuplicate, sourceSlotId, sourceSlotColor)}
                        onRemove={() => onRemoveSlot(slot.id)}
                        onDelete={() => slot.fileId && onDeleteFile(slot.fileId)}
                        onBulkAssign={onBulkAssign}
                        // Selection
                        isSelected={selectedSlots.has(`${tapeColor}-${slot.id}`)}
                        onSlotSelectionClick={(e) => onSlotSelectionClick(tapeColor, slot.id, e)}
                        onToggleSlotSelection={() => onToggleSlotSelection(tapeColor, slot.id)}
                        onSlotDragStart={(e) => onSlotDragStart(e, slot.id, tapeColor)}
                    />
                );
            })}
        </div>
    );
};
