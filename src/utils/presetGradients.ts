/**
 * The fallback artwork: a gradient, chosen by the preset's own id.
 *
 * In `utils/` rather than beside the submission tool because both ends need it — the
 * tool, to show an artist what their card will look like, and the Preset door, to
 * draw it.
 *
 * Every unillustrated preset used to draw the same violet-to-indigo wash, so a list
 * of three read as one thing repeated. These are keyed to the id instead, which is
 * stable across edits and reloads — the card someone recognises today looks the same
 * tomorrow — and drawn from the six tape colours the device itself is painted in,
 * so an absent image still looks like it belongs to this app rather than like a
 * placeholder nobody replaced.
 *
 * The pairs are written out because Tailwind scans source text for class names and
 * never sees an interpolated one. Same rule the hub's doors follow.
 */
const GRADIENTS: readonly string[] = [
    'from-synthux-blue/30 to-indigo-900/40',
    'from-synthux-green/25 to-emerald-900/40',
    'from-synthux-pink/25 to-fuchsia-900/40',
    'from-synthux-red/25 to-rose-900/40',
    'from-synthux-turquoise/25 to-cyan-900/40',
    'from-synthux-yellow/25 to-amber-900/40',
];

/**
 * A stable index from an arbitrary id.
 *
 * Not a hash anybody should rely on — it only has to spread six ways and give the
 * same answer twice. `>>> 0` keeps it unsigned so the modulo can't come back negative
 * on an id that happens to overflow into the sign bit.
 */
const bucket = (seed: string, count: number): number => {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = (Math.imul(hash, 31) + seed.charCodeAt(i)) >>> 0;
    }
    return hash % count;
};

/** Tailwind `from-…`/`to-…` classes for a preset with no image of its own. */
export const presetGradient = (id: string): string =>
    GRADIENTS[bucket(id || 'preset', GRADIENTS.length)];
