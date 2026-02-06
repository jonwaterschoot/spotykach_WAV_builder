import { TAPE_COLORS } from '../types';
import type { AppState, Tape, Slot } from '../types';

const createEmptySlot = (id: number): Slot => ({
    id,
    fileId: null,
});

const createTape = (color: keyof AppState['tapes']): Tape => ({
    color: color as any,
    slots: Array.from({ length: 6 }, (_, i) => createEmptySlot(i + 1)),
});

export const getInitialState = (): AppState => {
    const tapes = TAPE_COLORS.reduce((acc, color) => {
        acc[color] = createTape(color as any);
        return acc;
    }, {} as Record<string, Tape>);

    return {
        files: {},
        tapes: tapes as Record<keyof AppState['tapes'], Tape>,
    };
};
