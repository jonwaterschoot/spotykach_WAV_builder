/**
 * Is this the card the project last wrote, and what changed on it since? Compares
 * the live header reads with the project's card snapshot (`AppState.cardSnapshot`),
 * the same way over either route. Neither route can read a card serial, so this
 * is a fingerprint (slot, `ICMT.id`, hash, frames), not a guarantee.
 */
import type { CardSnapshot } from '../../types';
import type { SlotDescriptor } from './cardBackend';

/**
 * Per slot, against the snapshot:
 * - `same`: the file the project wrote, unchanged
 * - `changed`: the project wrote this slot, the card now holds something else
 *   (re-saved on the device, another tool, another version)
 * - `new`: occupied, but the project never wrote it
 * - `removed`: the project wrote it, the slot is now empty
 */
export type SlotDrift = 'same' | 'changed' | 'new' | 'removed';

export interface SnapshotCheck {
    /**
     * - `no-snapshot`: the project never wrote a card
     * - `same`: every slot as the project left it
     * - `changed`: the same card, changed since
     * - `different-card`: most of the files the project wrote aren't there, or
     *   the card size differs (USB only). Ask before syncing
     */
    verdict: 'no-snapshot' | 'same' | 'changed' | 'different-card';
    /** Every slot that is in the snapshot or on the card, by slot key. */
    slots: Record<string, SlotDrift>;
    /** Slots the snapshot holds, and how many of them still carry the same file id. */
    written: number;
    stillThere: number;
}

export function checkCardSnapshot(
    snapshot: CardSnapshot | undefined,
    cardSlots: Map<string, SlotDescriptor>,
    totalKiB?: number,
): SnapshotCheck {
    const slots: Record<string, SlotDrift> = {};
    const entries = Object.entries(snapshot?.slots ?? {});
    let stillThere = 0;

    for (const [key, snap] of entries) {
        const desc = cardSlots.get(key);
        if (!desc) {
            slots[key] = 'removed';
            continue;
        }
        const meta = desc.meta;
        if (meta?.id !== snap.fileId) {
            slots[key] = 'changed';
            continue;
        }
        stillThere++;
        const sameHash = !snap.hash || meta.hash === snap.hash;
        const frames = desc.frames ?? meta.frames;
        const sameFrames = snap.frames === undefined || frames === undefined || frames === snap.frames;
        slots[key] = sameHash && sameFrames ? 'same' : 'changed';
    }
    for (const key of cardSlots.keys()) {
        if (!(key in slots)) slots[key] = 'new';
    }

    let verdict: SnapshotCheck['verdict'];
    if (!entries.length) verdict = 'no-snapshot';
    else if (totalKiB !== undefined && snapshot?.totalKiB !== undefined && totalKiB !== snapshot.totalKiB) verdict = 'different-card';
    // Most of what the project wrote is gone. One slot written and one replaced is
    // still the same card: too little to go on.
    else if (entries.length >= 2 && stillThere * 2 < entries.length) verdict = 'different-card';
    else verdict = Object.values(slots).every(d => d === 'same') ? 'same' : 'changed';

    return { verdict, slots, written: entries.length, stillThere };
}

/** One line for the UI, or null when there is nothing to say. */
export function describeSnapshotCheck(check: SnapshotCheck): string | null {
    const count = (drift: SlotDrift) => Object.values(check.slots).filter(d => d === drift).length;
    switch (check.verdict) {
        case 'no-snapshot':
        case 'same':
            return null;
        case 'different-card':
            if (check.stillThere * 2 >= check.written) return 'This looks like a different card: its size differs from the card this project last wrote.';
            return `This looks like a different card: ${check.written - check.stillThere} of the ${check.written} files this project last wrote aren't on it.`;
        case 'changed': {
            const parts = [
                count('changed') && `${count('changed')} changed`,
                count('new') && `${count('new')} added`,
                count('removed') && `${count('removed')} removed`,
            ].filter(Boolean);
            return `Changed on the card since this project last wrote it: ${parts.join(', ')}.`;
        }
    }
}
