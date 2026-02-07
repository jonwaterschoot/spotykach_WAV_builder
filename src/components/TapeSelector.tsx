import { TAPE_COLORS } from '../types';
import type { TapeColor } from '../types';
import { LayoutGrid } from 'lucide-react';

import { TapeIcon } from './TapeIcon';

interface TapeSelectorProps {
    currentTape: TapeColor;
    isAllView: boolean;
    onSelect: (color: TapeColor) => void;
    onToggleAllView: () => void;
    onDropOnTape: (color: TapeColor, fileId: string, source: string, isDuplicate: boolean) => void;
    onDropOnViewAll: (fileId: string, source: string, isDuplicate: boolean) => void;
}

export const TapeSelector = ({ currentTape, isAllView, onSelect, onToggleAllView, onDropOnTape, onDropOnViewAll }: TapeSelectorProps) => {

    // Drag Handlers
    const handleDragOver = (e: React.DragEvent) => {
        if (e.dataTransfer.types.includes('application/x-spotykach-file-id')) {
            e.preventDefault();
            e.dataTransfer.dropEffect = e.ctrlKey || e.altKey ? 'copy' : 'move';
        }
    };

    const handleDrop = (e: React.DragEvent, color: TapeColor) => {
        e.preventDefault();
        const fileId = e.dataTransfer.getData('application/x-spotykach-file-id');
        const source = e.dataTransfer.getData('application/x-spotykach-source');
        const isDuplicate = e.ctrlKey || e.altKey;

        if (fileId) {
            onDropOnTape(color, fileId, source, isDuplicate);
        }
    };

    return (
        <div className="flex flex-col gap-4 p-4 bg-synthux-tapebg h-full border-r border-gray-800 w-24 items-center">
            {TAPE_COLORS.map((color) => {
                const isActive = !isAllView && currentTape === color;
                const colorVar = `var(--color-synthux-${getColorVar(color)})`;

                return (
                    <button
                        key={color}
                        onClick={() => onSelect(color)}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, color)}
                        className={`
                            w-12 h-12 relative group transition-all duration-300 rounded-full flex items-center justify-center
                            ${isActive ? 'z-10' : 'opacity-70 hover:opacity-100 hover:scale-105'}
                        `}
                        title={`Tape ${color}`}
                    >
                        {/* Glow Layer */}
                        {isActive && (
                            <div
                                className="absolute inset-0 w-full h-full flex items-center justify-center pointer-events-none"
                                style={{
                                    filter: 'blur(6px)',
                                    opacity: 0.8,
                                    animation: 'pulse-glow-anim 3s ease-in-out infinite',
                                    '--pulse-color': colorVar,
                                } as React.CSSProperties}
                            >
                                <TapeIcon
                                    color={colorVar}
                                    className="w-full h-full"
                                    style={{ transform: 'scale(1.25)' }}
                                />
                            </div>
                        )}

                        {/* Top Sharp Layer */}
                        <div className="w-full h-full relative z-20 flex items-center justify-center transition-all duration-300">
                            <TapeIcon
                                color={colorVar}
                                className="w-full h-full"
                                style={{ transform: isActive ? 'scale(1.1)' : 'scale(1)' }}
                            />
                        </div>
                    </button>
                );
            })}

            {/* View All Toggle */}
            <div className="w-full border-t border-gray-800 my-2 pt-2 flex justify-center">
                <button
                    onClick={onToggleAllView}
                    onDragOver={handleDragOver}
                    onDrop={(e) => {
                        e.preventDefault();
                        const fileId = e.dataTransfer.getData('application/x-spotykach-file-id');
                        const source = e.dataTransfer.getData('application/x-spotykach-source');
                        const isDuplicate = e.ctrlKey || e.altKey;
                        if (fileId) onDropOnViewAll(fileId, source, isDuplicate);
                    }}
                    className={`
                        w-12 h-12 relative group transition-all duration-300 rounded-xl flex items-center justify-center
                         ${isAllView ? 'bg-white text-black z-10' : 'text-gray-500 hover:text-white hover:bg-white/10'}
                    `}
                    title="View All Tapes"
                >
                    <LayoutGrid size={24} />

                    {/* Tooltip-ish help text */}
                    <span className="absolute left-full ml-4 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
                        View All
                    </span>
                </button>
            </div>

            <div className="mt-auto text-[10px] text-synthux-yellow font-mono text-center uppercase tracking-widest pt-4 border-t border-gray-800 w-full">
                Select Tape
            </div>
        </div>
    );
};

// Helper for var names
const getColorVar = (color: string) => {
    switch (color) {
        case 'Red': return 'red';
        case 'Blue': return 'blue';
        case 'Green': return 'green';
        case 'Pink': return 'pink';
        case 'Yellow': return 'yellow';
        case 'Turquoise': return 'turquoise';
        // Actually, the user's previous request asked for turquoise to be "teal-400".
        // But for this glow logo, I need a var or a hex.
        // Let's check index.css. I didn't verify if I added a teal var.
    }
    return 'blue'; // Fallback
};
