import { TAPE_COLORS, type AppState, type AudioVersion, type FileRecord } from '../types';
import { getInitialState } from '../utils/initialState';
import { GRID_CAPACITY } from '../utils/detachedState';
import { audioEngine } from '../lib/audio/audioEngine';
import { resolveAssetPath } from '../utils/assetUtils';
import { newId, sdPresetFor, type SubmissionDraft, type SubmissionFile } from './draft';

/**
 * The audio for one row, wherever it happens to live.
 *
 * A row the artist dropped in carries its blob. A row that references a published
 * pack does not, and never did: it is a *pointer*, and the audio behind it sits in
 * the sample bucket. Every other output copes with that by design — the archive
 * leaves those files out, the manifest entry omits them, the descriptor writes their
 * path — but a card is the one place the bytes are genuinely needed, so this is where
 * they are fetched.
 *
 * Missing this was silent and total: the empty placeholder blob failed to decode, the
 * file was skipped, and a preset built entirely from published packs produced an SK
 * folder with the right shape and nothing in it — no audio, and a README with no file
 * list and no licences, because those are read off the files that made it.
 */
const audioFor = async (file: SubmissionFile): Promise<Blob> => {
    if (file.blob && file.blob.size > 0) return file.blob;

    if (!file.sourceSamplePath) {
        throw new Error(`"${file.title}" has no audio and no source to fetch it from.`);
    }

    // A pooled sample remembers an absolute URL; one read from a descriptor remembers
    // the manifest's relative path. `resolveAssetPath` is idempotent over both.
    const response = await fetch(resolveAssetPath(file.sourceSamplePath), { mode: 'cors' });
    if (!response.ok) throw new Error(`Could not download "${file.title}" (${response.status}).`);
    return response.blob();
};

/** Matches the app's import naming: safe characters, no extension, uppercase. */
const toSlotName = (name: string) =>
    name
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-zA-Z0-9.\-_]/g, '')
        .replace(/\.[^/.]+$/, '')
        .toUpperCase();

/**
 * The draft, as a card.
 *
 * `buildDetachedState` is the right function for Browse — it autospreads a list
 * across the grid, which is exactly what a pool means. A draft with a preset means
 * something more specific: *this* sample in *that* slot, gaps included, and a list
 * cannot express a gap. So the tapes are filled by index here.
 *
 * The other difference is the audio. Browse's pool has already been through
 * `loadAndProcessAudio`; the draft holds the artist's own files, untouched, which
 * may be FLAC, may be 44.1 kHz, may be 24-bit. The card only reads 48 kHz WAV, so
 * every file is decoded and re-encoded on the way out — once, here, rather than
 * being stored converted and doubling what the draft costs in IndexedDB.
 */
export interface SDBuild {
    state: AppState;
    /** Titles that could not be gathered — named, so the artist knows which slots are empty. */
    missing: string[];
}

export const buildSDState = async (
    draft: SubmissionDraft,
    onProgress?: (message: string, percent: number) => void,
): Promise<SDBuild> => {
    const state = getInitialState();
    const missing: string[] = [];

    // Which layout goes on the card. With several presets over one pack the artist
    // picks; `sdPresetFor` falls back to the first that has anything in it.
    const preset = sdPresetFor(draft);
    const usesPreset = draft.wants.preset && !!preset?.slots.some(Boolean);

    // Which file goes where. With a preset that is the layout the artist built; with
    // no preset it is the first 36 in list order, which is what the pool's SD export
    // does and what someone who never opened the preset step expects.
    const placement: (string | null)[] = usesPreset && preset
        ? preset.slots.slice(0, GRID_CAPACITY)
        : draft.files.slice(0, GRID_CAPACITY).map(file => file.id);

    const needed = new Set(placement.filter((id): id is string => !!id));
    const wanted = draft.files.filter(file => needed.has(file.id));

    /** Draft row id → the file record built for it. */
    const recordIds = new Map<string, string>();

    for (let i = 0; i < wanted.length; i++) {
        const file = wanted[i];
        onProgress?.(
            `${file.blob && file.blob.size > 0 ? 'Converting' : 'Fetching'} ${file.title}…`,
            (i / Math.max(1, wanted.length)) * 60,
        );

        let blob: Blob;
        let duration = file.duration;
        try {
            const source = await audioFor(file);
            // The card reads 48 kHz WAV and nothing else, so everything is decoded and
            // re-encoded here rather than being stored converted and doubling what the
            // draft costs in IndexedDB.
            const processed = await audioEngine.loadAndProcessAudio(source);
            blob = processed.blob;
            duration = processed.buffer.duration;
        } catch (e) {
            // One unreachable file shouldn't cost the artist the other thirty-five. It
            // is left out of the card, the slot arrives empty — and it is *named*, so
            // nobody has to work out which of thirty-six is missing.
            console.warn(`[Submit] Could not prepare ${file.fileName} for the card`, e);
            missing.push(file.title || file.fileName);
            continue;
        }

        const fileId = newId();
        const versionId = newId();
        const version: AudioVersion = {
            id: versionId,
            timestamp: Date.now(),
            description: 'Original',
            blob,
            duration,
        };
        const record: FileRecord = {
            id: fileId,
            name: toSlotName(file.title) || `SAMPLE-${i + 1}`,
            originalName: file.fileName,
            versions: [version],
            currentVersionId: versionId,
            isParked: false,
            origin: file.origin,
            license: file.license,
            sourceSamplePath: file.sourceSamplePath,
        };

        state.files[fileId] = record;
        recordIds.set(file.id, fileId);
    }

    placement.forEach((rowId, index) => {
        if (!rowId) return;
        const fileId = recordIds.get(rowId);
        if (!fileId) return;
        const tape = state.tapes[TAPE_COLORS[Math.floor(index / 6)]];
        tape.slots[index % 6].fileId = fileId;
    });

    TAPE_COLORS.forEach((color, tapeIndex) => {
        const notes = preset?.tapeNotes[tapeIndex];
        if (notes) state.tapes[color].notes = notes;
    });
    if (preset?.projectNotes) state.projectNotes = preset.projectNotes;

    onProgress?.('Building the SK folder…', 65);
    return { state, missing };
};

/** How many slots the card will actually carry, before anything is built. */
export const sdSlotCount = (draft: SubmissionDraft): number => {
    const preset = sdPresetFor(draft);
    if (draft.wants.preset && preset?.slots.some(Boolean)) {
        return preset.slots.filter(Boolean).length;
    }
    return Math.min(draft.files.length, GRID_CAPACITY);
};
