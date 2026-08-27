import { fetchSampleManifest } from '../data/samplePacks';
import { toManifestPath } from './outputs';
import type { SubmissionFile } from './draft';

/**
 * Which published pack a sample actually belongs to.
 *
 * A row that came from Browse's pool remembers its pack as a *display name* —
 * "Hainbach's Spotykach Tapes" — because that is what `SampleBrowser` hands over,
 * and that is the right thing for a credit line. It is the wrong thing for
 * `samplePackId` and `requiredPacks`, which are ids, and the two were being filled
 * from the same field. The result validated cleanly all the way to a maintainer,
 * whose manifest then had no pack called "Hainbach's Spotykach Tapes" in it.
 *
 * The `samplePath` is the one thing that is always exact — it is what the app
 * fetches — so the pack is resolved from that rather than from any label. This also
 * repairs drafts and archives made before the distinction existed.
 */
export interface PackLookup {
    /** `/Hainbach/Roaring-Drone.flac` → `hainbach-tapes`. */
    idForPath: (samplePath: string) => string | undefined;
    /** `hainbach-tapes` → `Hainbach's Spotykach Tapes`, for credits. */
    nameForId: (packId: string) => string | undefined;
}

export const loadPackLookup = async (): Promise<PackLookup> => {
    const { packs } = await fetchSampleManifest();

    const byPath = new Map<string, string>();
    const names = new Map<string, string>();

    packs.forEach(pack => {
        names.set(pack.id, pack.name);
        // `fetchSampleManifest` resolves paths to absolute URLs on the way in, so both
        // sides are normalized back to the manifest's own form before comparing.
        pack.samples.forEach(sample => byPath.set(toManifestPath(sample.path), pack.id));
    });

    return {
        idForPath: samplePath => byPath.get(toManifestPath(samplePath)),
        nameForId: packId => names.get(packId),
    };
};

/** True for a row that points at published audio but doesn't know which pack. */
export const needsPackId = (file: SubmissionFile): boolean =>
    !!file.sourceSamplePath && !file.originId;

/**
 * Fill in `originId` wherever it can be worked out.
 *
 * Returns the same array when nothing changed, so a caller can use identity to
 * decide whether the draft is worth writing back.
 */
export const resolvePackIds = (files: SubmissionFile[], lookup: PackLookup): SubmissionFile[] => {
    let changed = false;

    const resolved = files.map(file => {
        if (!needsPackId(file)) return file;
        const packId = lookup.idForPath(file.sourceSamplePath!);
        if (!packId) return file;
        changed = true;
        return {
            ...file,
            originId: packId,
            // The label follows the manifest too, so a credit written months ago
            // still names the pack the way its page does.
            origin: lookup.nameForId(packId) || file.origin,
        };
    });

    return changed ? resolved : files;
};
