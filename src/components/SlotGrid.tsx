import type { Slot, TapeColor, FileRecord } from '../types';
import { SlotCard } from './SlotCard';

interface SlotGridProps {
    slots: Slot[];
    files: Record<string, FileRecord>;
    tapeColor: TapeColor;
    activeSlotId: number | null;
    onSlotClick: (id: number) => void;
    onSlotDrop: (id: number, files: FileList) => void;
    onSlotDropInternal: (slotId: number, fileId: string, source: string, isDuplicate: boolean) => void;
    onRemoveSlot: (slotId: number) => void;
}

export const SlotGrid = ({ slots, files, tapeColor, activeSlotId, onSlotClick, onSlotDrop, onSlotDropInternal, onRemoveSlot }: SlotGridProps) => {
    return (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6 p-6 w-full max-w-4xl mx-auto">
            {slots.map((slot) => {
                const fileRecord = slot.fileId ? files[slot.fileId] : null;
                return (
                    <SlotCard
                        key={slot.id}
                        slot={slot}
                        fileRecord={fileRecord}
                        tapeColor={tapeColor}
                        isActive={activeSlotId === slot.id}
                        onClick={() => onSlotClick(slot.id)}
                        onDrop={(files) => onSlotDrop(slot.id, files)}
                        onDropInternal={(fileId, source, isDuplicate) => onSlotDropInternal(slot.id, fileId, source, isDuplicate)}
                        onRemove={() => onRemoveSlot(slot.id)}
                    />
                );
            })}
        </div>
    );
};
