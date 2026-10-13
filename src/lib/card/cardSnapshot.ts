/**
 * Is this the card the project last wrote, and what changed on it since? Compares
 * the live header reads with the project's card snapshot (`AppState.cardSnapshot`),
 * the same way over either route. Neither route can read a card serial, so this
 * is a fingerprint (slot, `ICMT.id`, hash, frames), not a guarantee.
 */
import type { CardSnapshot, CardSnapshotSlot } from '../../types';
import type { SlotDescriptor } from './cardBackend';
import { audioHashOf, sameFingerprint, type SlotFingerprint } from '../audio/slotFile';
import { readWavHeaderInfo } from '../audio/wavHeader';

/**
 * What a slot reports about itself without its audio: name, size, frames, cue count.
 * Over USB the slot list has all four; over the card reader frames and cues need the
 * header read. Undefined while frames aren't known.
 */
export const listedFingerprint = (desc: SlotDescriptor): SlotFingerprint | undefined =>
    desc.frames === undefined ? undefined : {
        name: desc.name ?? desc.meta?.name ?? '',
        size: desc.size,
        frames: desc.frames,
        cues: desc.cueCount ?? desc.meta?.slicePoints?.length ?? 0,
    };

/** The fingerprint the project wrote, on snapshots from 4.2 on. */
export const snapshotFingerprint = (snap: CardSnapshotSlot | undefined): SlotFingerprint | undefined =>
    snap && snap.size !== undefined && snap.frames !== undefined
        ? { name: snap.name ?? '', size: snap.size, frames: snap.frames, cues: snap.cues ?? 0 }
        : undefined;

/**
 * The snapshot entry for a card file imported into its own slot: the project now
 * holds what the card does, as if it had written it. Without it, the next diff can't
 * tie the two over USB and offers to overwrite the slot and pool the same file.
 * `listed` is the slot as the diff saw it; the file's header stands in without it.
 */
export const importedSnapshotSlot = async (
    fileId: string, file: Blob, listed: SlotDescriptor | undefined, via: CardSnapshotSlot['via'],
): Promise<CardSnapshotSlot | undefined> => {
    let fingerprint = listed && listedFingerprint(listed);
    if (!fingerprint) {
        const header = await readWavHeaderInfo(file).catch(() => null);
        if (header?.frames === undefined) return undefined;
        fingerprint = { name: header.metadata?.name ?? '', size: file.size, frames: header.frames, cues: header.metadata?.slicePoints?.length ?? 0 };
    }
    const audioHash = await audioHashOf(file);
    if (!audioHash) return undefined;
    return { fileId, audioHash, ...fingerprint, writtenAt: new Date().toISOString(), via };
};

/** The slot still holds the file the project last wrote there. */
export const slotMatchesSnapshot = (desc: SlotDescriptor, snap: CardSnapshotSlot | undefined): boolean =>
    sameFingerprint(listedFingerprint(desc), snapshotFingerprint(snap));

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
        // From 4.2: the fingerprint the device lists, no id inside the file.
        if (snapshotFingerprint(snap)) {
            if (slotMatchesSnapshot(desc, snap)) { stillThere++; slots[key] = 'same'; }
            else slots[key] = 'changed';
            continue;
        }
        // Snapshots from before 4.2: our ICMT id and hash inside the slot file.
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
