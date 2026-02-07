import { TAPE_COLORS } from '../types';
import type { AppState } from '../types';
import { MiniSlotCard } from './MiniSlotCard';
import { TapeIcon } from './TapeIcon';

interface AllViewGridProps {
    tapes: AppState['tapes'];
    files: AppState['files'];
    onRemoveSlot: (slotId: number) => void;
    onSlotDrop: (slotId: number, files: FileList, color: typeof TAPE_COLORS[number]) => void;
    onSlotDropInternal: (slotId: number, fileId: string, source: string, isDuplicate: boolean, color: typeof TAPE_COLORS[number]) => void;
    onSlotClick: (slotId: number, color: typeof TAPE_COLORS[number]) => void;
}

export const AllViewGrid = ({ tapes, files, onRemoveSlot, onSlotDrop, onSlotDropInternal, onSlotClick }: AllViewGridProps) => {

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
                        <div key={color} className="flex-1 min-h-[60px] flex flex-col md:flex-row gap-2 items-center p-2 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors">

                            {/* Tape Label Column */}
                            <div className="w-24 flex-shrink-0 flex items-center gap-3 md:flex-col md:items-center md:gap-2">
                                <div className="w-8 h-8 md:w-10 md:h-10">
                                    <TapeIcon color={colorVar} className="w-full h-full" />
                                </div>
                                <span style={{ color: colorVar }} className="text-xs font-bold uppercase tracking-wider">{color}</span>
                            </div>

                            {/* Slots Grid for this Tape */}
                            <div className="flex-1 w-full h-full grid grid-cols-6 gap-2">
                                {tape.slots.map((slot) => {
                                    const file = slot.fileId ? files[slot.fileId] : null;
                                    return (
                                        <div key={slot.id} className="h-full">
                                            <MiniSlotCard
                                                slot={slot}
                                                fileRecord={file}
                                                tapeColor={color}
                                                onRemove={() => onRemoveSlot(slot.id)}
                                                onDrop={(files) => onSlotDrop(slot.id, files, color)}
                                                onDropInternal={(fileId, source, isDuplicate) => onSlotDropInternal(slot.id, fileId, source, isDuplicate, color)}
                                                onClick={() => onSlotClick(slot.id, color)}
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
