import { createContext } from 'react';

/**
 * How tightly the mangler's controls are laid out. Compact puts a slider, its
 * label and its value on one row; a range keeps its two fields above the track,
 * since the track shows where the range sits. Set by `SettingsPanel`.
 */
export type Density = 'normal' | 'compact';

export const DensityContext = createContext<Density>('normal');
