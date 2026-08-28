/**
 * Accent colours for `ChoiceCard`, as finished class strings.
 *
 * Kept out of `ui.tsx` because that file exports components and nothing else —
 * a module that mixes components with constants loses fast refresh for every
 * component in it.
 *
 * The pairs are written out rather than composed from a colour name because
 * Tailwind scans source text for class names and never sees an interpolated one:
 * `border-${accent}/60` compiles to nothing at all. Same rule the hub's doors follow.
 */
export interface ChoiceAccent {
    /** Applied to the card when checked. */
    border: string;
    /** Applied to the tick/dot box when checked. */
    marker: string;
}

export const ACCENTS: Record<'green' | 'orange' | 'blue' | 'pink', ChoiceAccent> = {
    green: { border: 'border-synthux-green/60', marker: 'bg-synthux-green border-synthux-green' },
    orange: { border: 'border-synthux-orange/60', marker: 'bg-synthux-orange border-synthux-orange' },
    blue: { border: 'border-synthux-blue/60', marker: 'bg-synthux-blue border-synthux-blue' },
    pink: { border: 'border-synthux-pink/60', marker: 'bg-synthux-pink border-synthux-pink' },
};
