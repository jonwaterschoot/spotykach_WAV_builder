import React from 'react';
import { X } from 'lucide-react';

interface KeyboardSlicerModalProps {
    isOpen: boolean;
    onClose: () => void;
    layout: 'QWERTY' | 'AZERTY';
    onLayoutChange: (layout: 'QWERTY' | 'AZERTY') => void;
    onPlaySlice: (idx: number) => void;
    activeSliceIdx: number;
    triggeredSliceIdx: number | null;
}

export const KeyboardSlicerModal: React.FC<KeyboardSlicerModalProps> = ({ isOpen, onClose, layout, onLayoutChange, onPlaySlice, activeSliceIdx, triggeredSliceIdx }) => {
    if (!isOpen) return null;

    const QWERTY_ROWS = [
        ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
        ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
        ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
        ['Z', 'X', 'C']
    ];

    const AZERTY_ROWS = [
        ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
        ['A', 'Z', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
        ['Q', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
        ['W', 'X', 'C']
    ];

    const rows = layout === 'QWERTY' ? QWERTY_ROWS : AZERTY_ROWS;
    let sliceCounter = 1;

    return (
        <div className="bg-[#1a1a1a] border border-gray-700 rounded-2xl shadow-2xl w-full h-full flex flex-col overflow-hidden relative group">
            {/* Draggable Header Background */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-cyan-500 drag-handle cursor-move z-10"></div>

            <div className="flex items-center justify-between p-3 border-b border-gray-800 shrink-0 drag-handle cursor-move bg-black/20">
                <div className="flex items-center gap-2">
                    <h2 className="text-sm font-black text-white uppercase tracking-wider">Keyboard Map</h2>
                    <div className="flex bg-black/40 p-0.5 rounded border border-gray-800 ml-2">
                        {(['QWERTY', 'AZERTY'] as const).map(l => (
                            <button
                                key={l}
                                onClick={() => onLayoutChange(l)}
                                className={`px-2 py-0.5 rounded-[3px] text-[9px] font-black uppercase transition-colors ${layout === l ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-900/40' : 'text-gray-500 hover:text-gray-300'
                                    }`}
                            >
                                {l}
                            </button>
                        ))}
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors pointer-events-auto"
                >
                    <X size={16} />
                </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1">
                <div className="flex flex-col gap-2.5 items-center">
                    {rows.map((row, rowIdx) => (
                        <div key={rowIdx} className="flex gap-1.5 justify-center" style={{ marginLeft: `${rowIdx * 12}px` }}>
                            {row.map((key) => {
                                const currentSliceIdx = sliceCounter++ - 1;
                                const isTriggered = triggeredSliceIdx === currentSliceIdx;
                                const isActive = activeSliceIdx === currentSliceIdx;

                                return (
                                    <div key={key} className="flex flex-col items-center gap-1">
                                        <button
                                            onClick={() => onPlaySlice(currentSliceIdx)}
                                            className={`w-10 h-10 border-2 rounded-lg flex items-center justify-center font-black text-sm transition-all duration-75 relative group/key
                                                ${isTriggered
                                                    ? 'bg-cyan-500 border-cyan-300 text-white scale-95 shadow-[0_0_15px_rgba(34,211,238,0.6)]'
                                                    : isActive
                                                        ? 'bg-cyan-900/30 border-cyan-500/50 text-cyan-400'
                                                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'
                                                }`}
                                        >
                                            {key}
                                            {isTriggered && (
                                                <span className="absolute inset-0 rounded-lg animate-ping bg-cyan-400/20 pointer-events-none"></span>
                                            )}
                                        </button>
                                        <div className={`text-[8px] font-black uppercase tracking-tighter ${isTriggered ? 'text-cyan-300' : isActive ? 'text-cyan-500' : 'text-gray-600'}`}>
                                            SL {currentSliceIdx + 1}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>

                <div className="mt-4 p-2.5 bg-cyan-900/10 border border-cyan-500/20 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse"></div>
                        <h3 className="text-cyan-500 font-black uppercase tracking-widest text-[9px]">MIDI & KEYBOARD SYNC</h3>
                    </div>
                    <p className="text-gray-500 text-[10px] font-medium leading-relaxed">
                        Trigger slices with keys or MIDI notes (C1-G3). Map reflects active playback.
                    </p>
                </div>
            </div>
        </div>
    );
};
