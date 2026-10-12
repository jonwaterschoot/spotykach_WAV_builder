/** Parts of a source, in seconds, as stored on it: where new snippets may come from. */
export type Part = [number, number];

/** Shorter than this, a part is a slip of the mouse. */
export const MIN_PART = 0.05;

/** Sorted and merged, each at least 50 ms, inside the file. */
export function normaliseParts(parts: Part[], duration: number): Part[] {
    const sorted = parts
        .map(([a, b]) => [Math.max(0, Math.min(a, b)), Math.min(duration, Math.max(a, b))] as Part)
        .filter(([a, b]) => b - a >= MIN_PART)
        .sort((x, y) => x[0] - y[0]);
    const merged: Part[] = [];
    for (const p of sorted) {
        const last = merged[merged.length - 1];
        if (last && p[0] <= last[1]) last[1] = Math.max(last[1], p[1]);
        else merged.push([...p] as Part);
    }
    return merged;
}

