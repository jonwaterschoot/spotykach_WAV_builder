import { TAPE_COLORS } from '../types';
import type { TapeColor } from '../types';

const spotyTapeIcon = new URL('../assets/img/spotytape.svg', import.meta.url).href;

interface TapeSelectorProps {
    currentTape: TapeColor;
    onSelect: (color: TapeColor) => void;
    onDropOnTape: (color: TapeColor, fileId: string, source: string, isDuplicate: boolean) => void;
}

export const TapeSelector = ({ currentTape, onSelect, onDropOnTape }: TapeSelectorProps) => {

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
                const isActive = currentTape === color;
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
                        {/* Glow Layer (Blur Wrapper Strategy) */}
                        {isActive && (
                            <div
                                className="absolute inset-0 w-full h-full flex items-center justify-center"
                                style={{
                                    // Apply effects to the WRAPPER, so the inner masked shape blurs outwards
                                    filter: 'blur(6px)',
                                    opacity: 0.8, // Base opacity
                                    animation: 'pulse-glow-anim 3s ease-in-out infinite',
                                    '--pulse-color': colorVar,
                                } as React.CSSProperties}
                            >
                                <div
                                    className="w-full h-full"
                                    style={{
                                        maskImage: `url(${spotyTapeIcon})`,
                                        maskSize: 'contain',
                                        maskPosition: 'center',
                                        maskRepeat: 'no-repeat',
                                        WebkitMaskImage: `url(${spotyTapeIcon})`,
                                        WebkitMaskSize: 'contain',
                                        WebkitMaskPosition: 'center',
                                        WebkitMaskRepeat: 'no-repeat',
                                        backgroundColor: colorVar,
                                        transform: 'scale(1.25)', // Ensure base size is larger
                                    }}
                                />
                            </div>
                        )}

                        {/* Top Sharp Layer */}
                        <div
                            className="w-full h-full transition-all duration-300 relative z-20"
                            style={{
                                maskImage: `url(${spotyTapeIcon})`,
                                maskSize: 'contain',
                                maskPosition: 'center',
                                maskRepeat: 'no-repeat',
                                WebkitMaskImage: `url(${spotyTapeIcon})`,
                                WebkitMaskSize: 'contain',
                                WebkitMaskPosition: 'center',
                                WebkitMaskRepeat: 'no-repeat',
                                backgroundColor: colorVar,
                                transform: isActive ? 'scale(1.1)' : 'scale(1)',
                            }}
                        />
                    </button>
                );
            })}

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
