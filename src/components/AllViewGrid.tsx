import { ChevronDown, ChevronUp, ChevronRight, FileEdit } from 'lucide-react';
import { TAPE_COLORS } from '../types';
import type { AppState, TapeColor } from '../types';
import { MiniSlotCard } from './MiniSlotCard';
import { TapeIcon } from './TapeIcon';
import { GlobalPlayerBar } from './GlobalPlayerBar';
import { NotesEditor } from './NotesEditor';

interface AllViewGridProps {
    tapes: AppState['tapes'];
    files: AppState['files'];
    onRemoveSlot: (slotId: number, color: TapeColor) => void;
    onSlotDrop: (slotId: number, files: FileList, color: typeof TAPE_COLORS[number]) => void;
    onSlotDropInternal: (slotId: number, fileId: string, source: string, isDuplicate: boolean, color: typeof TAPE_COLORS[number], sourceSlotId?: number, sourceSlotColor?: TapeColor) => void;
    onSlotClick: (slotId: number, color: typeof TAPE_COLORS[number]) => void;
    onTapeHeaderClick: (color: typeof TAPE_COLORS[number]) => void;
    duplicates: Set<string>;
    onDeleteFile: (fileId: string) => void;
    onBulkAssign: (targetSlotId: number, fileIds: string[], targetColor: TapeColor, sourceSlotKeys?: string[]) => void;
    // Selection
    selectedSlots: Set<string>;
    onSlotSelectionClick: (slotId: number, color: TapeColor, e: React.MouseEvent) => void;
    onToggleSlotSelection: (slotId: number, color: TapeColor) => void;
    onSlotDragStart: (e: React.DragEvent, slotId: number, color: TapeColor) => void;
    noteStates: Record<TapeColor, 'collapsed' | 'preview' | 'expanded'>;
    setNoteStates: React.Dispatch<React.SetStateAction<Record<TapeColor, 'collapsed' | 'preview' | 'expanded'>>>;
    onTapeNoteChange: (color: TapeColor, note: string) => void;
    onRenameFile?: (fileId: string, newName: string) => void;
    missingFileIds?: Set<string>;
}

export const AllViewGrid = ({
    tapes, files, onRemoveSlot, onSlotDrop, onSlotDropInternal,
    onSlotClick, onTapeHeaderClick, duplicates, onDeleteFile,
    onBulkAssign, selectedSlots, onSlotSelectionClick,
    onToggleSlotSelection, onSlotDragStart,
    noteStates, setNoteStates, onTapeNoteChange,
    onRenameFile, missingFileIds
}: AllViewGridProps) => {
    const toggleRowNote = (color: TapeColor) => {
        setNoteStates(prev => {
            const current = prev[color];
            const next = current === 'collapsed' ? 'preview' : current === 'preview' ? 'expanded' : 'collapsed';
            return { ...prev, [color]: next };
        });
    };

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
        <div className="w-full h-full p-4 md:p-6 relative z-10 flex flex-col">
            <div className="flex-1 flex flex-col gap-2 min-h-0 pr-2 pb-20">
                {TAPE_COLORS.map((color) => {
                    const tape = tapes[color];
                    const colorVar = `var(--color-synthux-${getColorVar(color)})`;
                    const nState = noteStates[color];
                    const hasNotes = !!tape.notes && tape.notes.trim() !== '';

                    return (
                        <div key={color} className={`flex flex-col p-2 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors group/tape-row ${nState === 'expanded' ? 'flex-none' : 'flex-1 min-h-[60px]'}`}>

                            {/* Main Row Elements */}
                            <div className="flex flex-col md:flex-row gap-2 items-center w-full flex-1">
                                {/* Tape Label Column */}
                                <div className="w-28 flex-shrink-0 flex items-center justify-between group/header">
                                    <button
                                        onClick={() => onTapeHeaderClick(color)}
                                        className="flex flex-col items-center gap-2 cursor-pointer hover:bg-white/10 rounded-lg p-1 transition-colors flex-1"
                                        title={`Open ${color} Tape View`}
                                    >
                                        <div className="w-8 h-8 md:w-10 md:h-10 group-hover/header:scale-110 transition-transform">
                                            <TapeIcon color={colorVar} className="w-full h-full" />
                                        </div>
                                        <span style={{ color: colorVar }} className="text-xs font-bold uppercase tracking-wider group-hover/header:brightness-125 transition-all">{color}</span>
                                    </button>

                                    <button
                                        onClick={() => {
                                            if (!hasNotes) {
                                                setNoteStates(prev => ({ ...prev, [color]: prev[color] === 'expanded' ? 'collapsed' : 'expanded' }));
                                            } else {
                                                toggleRowNote(color);
                                            }
                                        }}
                                        className="p-1 text-gray-400 hover:text-white transition-colors h-full flex items-center justify-center"
                                        title={hasNotes ? "Toggle Notes for this Tape" : "Add Note for this Tape"}
                                    >
                                        {!hasNotes ? <FileEdit size={14} /> : nState === 'collapsed' ? <ChevronRight size={16} /> : nState === 'preview' ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                                    </button>
                                </div>

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
                                                    isMissing={slot.fileId && missingFileIds ? missingFileIds.has(slot.fileId) : false}
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
                                                    onRenameFile={onRenameFile}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Notes Area */}
                            {(hasNotes || nState === 'expanded') && nState !== 'collapsed' && (
                                <div className={`mt-2 border-t border-white/10 pt-2 px-2 text-gray-300 text-sm transition-all ${nState === 'preview' ? 'overflow-hidden max-h-8 whitespace-nowrap text-ellipsis text-gray-400 text-xs cursor-pointer hover:bg-white/5 rounded mx-[-8px] px-4' : 'overflow-visible flex-1'}`}
                                    onClick={() => {
                                        if (nState === 'preview') {
                                            setNoteStates(prev => ({ ...prev, [color]: 'expanded' }));
                                        }
                                    }}
                                >
                                    {nState === 'preview' ? tape.notes!.split('\n').filter(l => l.trim() !== '')[0]?.replace(/^#\s*/, '') : (
                                        <NotesEditor
                                            value={tape.notes || ''}
                                            onChange={(val) => onTapeNoteChange(color, val)}
                                            minHeight="100px"
                                            initialEdit={!hasNotes}
                                        />
                                    )}
                                </div>
                            )}

                        </div>
                    );
                })}
            </div>

            {/* Global Player Bar - Floating at the bottom */}
            <GlobalPlayerBar files={files} className="sticky bottom-4 md:bottom-6 z-[60] mt-4" />
        </div>
    );
};
