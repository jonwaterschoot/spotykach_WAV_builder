import type { FileRecord } from '../types';
import type { SubmissionFile } from './draft';

/**
 * A draft row, dressed as a `FileRecord` so the app's own transport will play it.
 *
 * `AudioPlayerContext` takes a `FileRecord` and finds the blob on its current
 * version — a shape the draft has no reason to store, since nothing here has
 * version history. Building one on demand is cheaper than either duplicating the
 * player or widening its contract, and it means auditioning a submission behaves
 * exactly like auditioning anything else: one audio element for the whole app, the
 * same 15 ms fades, and starting a second file stops the first.
 *
 * The id is the draft row's, so `activeFileId` compares directly against it.
 */
export const asPlayableRecord = (file: SubmissionFile): FileRecord => ({
    id: file.id,
    name: file.title || file.fileName,
    originalName: file.fileName,
    currentVersionId: file.id,
    isParked: false,
    origin: file.origin,
    license: file.license,
    versions: [{
        id: file.id,
        timestamp: 0,
        description: 'Original',
        blob: file.blob,
        duration: file.duration,
    }],
});
