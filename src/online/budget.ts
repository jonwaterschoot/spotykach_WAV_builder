/**
 * A request budget per provider, kept in this browser.
 *
 * The archives count requests per visitor (they come from the visitor's own
 * browser), and Openverse allows an anonymous visitor 20 a minute and 200 a day.
 * Counting here lets the panel say "12 searches left today" and stop before the
 * archive starts answering 429, rather than after.
 *
 * Timestamps of the last day's requests, one list per provider. Storage is passed
 * in so the check script can run it without a browser.
 */

export interface BudgetStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

export interface Limits { perMinute: number; perDay: number }

const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;

export interface BudgetState {
    usedMinute: number;
    usedDay: number;
    /** Seconds until the next request is allowed; 0 when one is. */
    waitSec: number;
}

export function createBudget(storage: BudgetStorage | null, now: () => number = Date.now) {
    const memory = new Map<string, number[]>();
    const keyFor = (id: string) => `wavbuilder_online_budget_${id}`;

    const read = (id: string): number[] => {
        if (!storage) return memory.get(id) ?? [];
        try {
            const parsed = JSON.parse(storage.getItem(keyFor(id)) ?? '[]');
            return Array.isArray(parsed) ? parsed.filter((t): t is number => typeof t === 'number') : [];
        } catch {
            return [];
        }
    };
    const write = (id: string, stamps: number[]) => {
        memory.set(id, stamps);
        try { storage?.setItem(keyFor(id), JSON.stringify(stamps)); } catch { /* memory still counts */ }
    };

    const state = (id: string, limits: Limits): BudgetState => {
        const t = now();
        const day = read(id).filter(s => t - s < DAY);
        const minute = day.filter(s => t - s < MINUTE);
        let waitSec = 0;
        if (day.length >= limits.perDay) waitSec = Math.ceil((day[0] + DAY - t) / 1000);
        else if (minute.length >= limits.perMinute) waitSec = Math.ceil((minute[0] + MINUTE - t) / 1000);
        return { usedMinute: minute.length, usedDay: day.length, waitSec };
    };

    return {
        state,
        /** Count one request, or say how long to wait. */
        take(id: string, limits: Limits): BudgetState {
            const s = state(id, limits);
            if (s.waitSec > 0) return s;
            const t = now();
            write(id, [...read(id).filter(x => t - x < DAY), t]);
            return { ...s, usedMinute: s.usedMinute + 1, usedDay: s.usedDay + 1 };
        },
        /** The archive said 429: treat the minute as spent. */
        exhaustMinute(id: string, limits: Limits) {
            const t = now();
            const stamps = read(id).filter(x => t - x < DAY);
            const missing = Math.max(0, limits.perMinute - stamps.filter(x => t - x < MINUTE).length);
            write(id, [...stamps, ...Array.from({ length: missing }, () => t)]);
        },
    };
}

export type Budget = ReturnType<typeof createBudget>;
