import {
    clearSubmissionDraftFromDB, loadSubmissionDraftFromDB, saveSubmissionDraftToDB,
} from '../utils/persistence';
import { GRID_CAPACITY } from '../utils/detachedState';

/**
 * The submission draft — everything the tool collects, in one serializable object.
 *
 * Blobs are held inline rather than by reference. That is what makes the draft
 * survivable: IndexedDB stores them structurally, so a closed tab comes back with
 * the audio still there, and the tool never has to ask the artist to find their
 * folder a second time. It also means the draft is large, which is why it is
 * written on a debounce and never to localStorage.
 *
 * Nothing here leaves the machine. The draft is read to build the ZIP the artist
 * downloads and sends themselves.
 */
export const DRAFT_SCHEMA = 'spotykach-submission/1' as const;

/** What the artist said they were sending, on step 1. */
export interface SubmissionWants {
    /** A sample pack for the browser. The default, and off only for preset-only. */
    pack: boolean;
    /** A 36-slot preset. Optional beside a pack; the whole submission without one. */
    preset: boolean;
    /** A ready-to-copy SK/ folder for the artist's own card. Not part of the submission. */
    sd: boolean;
}

/** One audio file in the draft. */
export interface SubmissionFile {
    id: string;
    /** The name at the source, extension and all — what the artist recognises. */
    fileName: string;
    /** What the app will show. Derived from `fileName`, editable in place. */
    title: string;
    /** The subfolder it came from, or `General`. Becomes the browser's category. */
    category: string;
    duration: number;
    /** Bytes. Shown because the artist has to send this much audio by link. */
    size: number;
    blob: Blob;
    /**
     * Set when the row came from a pack already in the app rather than off the disk
     * — the preset-only case. Such a file is referenced, never re-submitted.
     */
    /**
     * The pack's *display name*, for credits — "Hainbach's Spotykach Tapes".
     *
     * Not an id, however much it looks like one in some rows. See `originId`.
     */
    origin?: string;
    /**
     * The pack's id, as `manifest.json` spells it — `hainbach-tapes`.
     *
     * Resolved from `sourceSamplePath` rather than taken from a label, because the
     * path is the only thing guaranteed exact. This is what `samplePackId` and
     * `requiredPacks` are built from; `origin` is what a reader sees.
     */
    originId?: string;
    license?: string;
    sourceSamplePath?: string;
}

/** A file that couldn't be used, kept so the review step can name it. */
export interface RejectedFile {
    fileName: string;
    reason: string;
}

/** The cover image, held decoded enough to check its shape. */
export interface SubmissionCover {
    fileName: string;
    type: string;
    width: number;
    height: number;
    blob: Blob;
}

/** One `label + url` row for a platform the table doesn't list. */
export interface CustomLink {
    id: string;
    label: string;
    url: string;
}

export interface SubmissionDetails {
    /** Slug used for the folder, the manifest id and the R2 path. */
    id: string;
    name: string;
    artist: string;
    shortDescription: string;
    fullDescription: string;
    /** While true, the id keeps following the name. The first manual edit ends that. */
    idFollowsName: boolean;
    cover?: SubmissionCover;
}

export interface SubmissionLinks {
    /** Platform id → whatever was typed, usually a bare username. */
    handles: Record<string, string>;
    website: string;
    custom: CustomLink[];
}

export interface SubmissionLicense {
    /** A key from `LICENSE_CHOICES`, or `custom`. */
    choice: string;
    /** Free text, used only when `choice` is `custom`. */
    custom: string;
}

export interface SubmissionPreset {
    /**
     * This row's identity within the draft, not the id it is published under.
     *
     * The published id is derived from the name (see `presetIdFor`) and changes when
     * the name does, which is fine for a filename and useless as a React key or as
     * the thing the SD builder points at.
     */
    id: string;
    name: string;
    description: string;
    /**
     * Artwork for this preset's card, when it has its own.
     *
     * Optional at every level — see `coverFollowsPack`.
     */
    cover?: SubmissionCover;
    /**
     * While true, this preset shows the *submitted pack's* cover.
     *
     * Only ever the pack in this submission. A preset built on Hainbach's pack does
     * not get to wear Hainbach's artwork: the image is a credit as much as a
     * decoration, and borrowing one would put somebody else's work above a layout
     * they had no hand in. With nothing uploaded, the card falls back to a gradient.
     */
    coverFollowsPack: boolean;
    /**
     * While true, the description mirrors the pack's short description.
     *
     * A preset built on a pack is usually described by the same sentence, and asking
     * for it twice gets either a copy-paste or a blank. The first manual edit ends
     * the mirroring, the same way the pack id stops following the pack name.
     */
    descriptionFollowsPack: boolean;
    /** 36 entries, each a `SubmissionFile` id or null. Index 0–5 is Blue 1–6, etc. */
    slots: (string | null)[];
    /** Per-tape notes, in `TAPE_COLORS` order. Carried through from a handoff. */
    tapeNotes: (string | undefined)[];
    projectNotes: string;
}

export interface SubmissionDraft {
    schema: typeof DRAFT_SCHEMA;
    updatedAt: number;
    /** Which step the artist was on. Restored so a reopened draft resumes in place. */
    step: number;
    wants: SubmissionWants;
    files: SubmissionFile[];
    rejected: RejectedFile[];
    details: SubmissionDetails;
    links: SubmissionLinks;
    license: SubmissionLicense;
    /**
     * Zero or more presets over the same pack.
     *
     * An artist submitting twenty sounds may well want two layouts — one built from
     * their own pack, one mixing it with packs already in the app — and the
     * expensive half of a submission is the audio, which both share. Sending two
     * archives to get two presets would ship the same twenty files twice.
     *
     * Always holds at least one entry, blank if nothing has been done to it, so the
     * list UI has something to draw and the common single-preset case never has to
     * press "add" first.
     */
    presets: SubmissionPreset[];
    /** Which preset the SK-folder build uses. Falls back to the first with slots. */
    sdPresetId?: string;
    /** Anything the artist wants to tell the maintainer, verbatim, in SUBMISSION.md. */
    notes: string;
    /**
     * How the audio ZIP names its files.
     *
     * `original` hands back exactly what was dropped, which is what a maintainer
     * wants and what the artist recognises. `title` uses the titles from step 2 —
     * for the artist who renamed everything here and wants that work back out, to
     * use in a DAW or another sampler.
     */
    audioNaming: 'original' | 'title';
}


export const newId = (): string => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        try {
            return crypto.randomUUID();
        } catch {
            // Fall through — some browsers expose randomUUID only on secure origins.
        }
    }
    return Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
};

export const emptyPreset = (): SubmissionPreset => ({
    id: newId(),
    name: '',
    description: '',
    descriptionFollowsPack: true,
    coverFollowsPack: true,
    slots: Array(GRID_CAPACITY).fill(null),
    tapeNotes: Array(6).fill(undefined),
    projectNotes: '',
});

export const emptyDraft = (): SubmissionDraft => ({
    schema: DRAFT_SCHEMA,
    updatedAt: Date.now(),
    step: 1,
    wants: { pack: true, preset: false, sd: false },
    files: [],
    rejected: [],
    details: {
        id: '',
        name: '',
        artist: '',
        shortDescription: '',
        fullDescription: '',
        idFollowsName: true,
    },
    links: { handles: {}, website: '', custom: [] },
    license: { choice: 'cc-by-4.0', custom: '' },
    presets: [emptyPreset()],
    notes: '',
    audioNaming: 'original',
});

/**
 * `Dust & Tape Loops` → `dust-tape-loops`.
 *
 * The same shape `generate-manifest.mjs` derives from a folder name, so the id the
 * artist sees here is the id the maintainer's script would have produced anyway.
 * ASCII only: this becomes a path in the R2 bucket and a key in `manifest.json`.
 */
export const slugify = (value: string): string =>
    value
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48);

/**
 * `Roaring_Drone_C3.wav` → `Roaring Drone C3`.
 *
 * Deliberately the app's own rule, not a prettier one: what the artist sees in this
 * column is exactly what the Sample Browser will show if they leave it alone.
 */
export const titleFromFileName = (fileName: string): string =>
    fileName
        .replace(/\.[^/.]+$/, '')
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

/**
 * Whose audio is this?
 *
 * The draft holds two kinds of row and the difference decides almost everything
 * downstream. A row with no `sourceSamplePath` is **the artist's own**: it has to
 * travel, it goes in the archive, and it becomes an entry in the new pack. A row
 * that has one points at audio **already published** in the app — pooled from
 * Hainbach's pack in Browse, or read out of an exported preset — and must not be
 * sent anywhere. Re-uploading it would ask the maintainer to deploy the same file
 * twice under a second name, and the preset would end up depending on the copy
 * rather than on the pack everyone already has.
 *
 * A preset is free to mix the two, and most interesting ones will: some of the
 * artist's own sounds, some from packs that are already there.
 */
export const isOwnFile = (file: SubmissionFile): boolean => !file.sourceSamplePath;

/** The rows that are actually being submitted. */
export const ownFiles = (draft: SubmissionDraft): SubmissionFile[] => draft.files.filter(isOwnFile);

/** The rows that point at packs already in the app. */
export const referencedFiles = (draft: SubmissionDraft): SubmissionFile[] =>
    draft.files.filter(file => !isOwnFile(file));

/** A draft is worth restoring only if something was actually put into it. */
export const isDraftEmpty = (draft: SubmissionDraft): boolean =>
    draft.files.length === 0 &&
    !draft.details.name &&
    !draft.details.artist &&
    !draft.details.shortDescription &&
    !draft.details.fullDescription &&
    !draft.presets.some(preset => preset.name || preset.slots.some(Boolean)) &&
    !draft.notes;

/**
 * Bring a stored draft up to the current shape.
 *
 * A draft can sit in IndexedDB across app updates, so every field is filled from
 * the empty draft rather than trusted. A draft written by a schema we don't know is
 * discarded rather than half-read — there is no upgrade path worth writing for a
 * form that takes ten minutes to fill in again, and a half-read one would lie.
 */
export const reviveDraft = (raw: unknown): SubmissionDraft | null => {
    if (!raw || typeof raw !== 'object') return null;
    const stored = raw as Partial<SubmissionDraft>;
    if (stored.schema !== DRAFT_SCHEMA) return null;

    const base = emptyDraft();

    /**
     * Drafts written before presets became a list hold a single `preset` object.
     * They are worth carrying rather than discarding: this is somebody's afternoon.
     */
    const legacy = (stored as unknown as { preset?: Partial<SubmissionPreset> }).preset;
    const rawPresets = Array.isArray(stored.presets)
        ? stored.presets
        : legacy ? [legacy] : [];

    const presets: SubmissionPreset[] = (rawPresets.length ? rawPresets : [{}]).map(raw => {
        const blank = emptyPreset();
        const slots = Array.isArray(raw?.slots) ? raw.slots : blank.slots;
        return {
            ...blank,
            ...raw,
            id: raw?.id || blank.id,
            // Length is load-bearing — the grid indexes into it without checking.
            slots: Array.from({ length: GRID_CAPACITY }, (_, i) => slots[i] ?? null),
            tapeNotes: Array.from({ length: 6 }, (_, i) => raw?.tapeNotes?.[i]),
        };
    });

    return {
        ...base,
        ...stored,
        schema: DRAFT_SCHEMA,
        wants: { ...base.wants, ...stored.wants },
        files: Array.isArray(stored.files) ? stored.files : [],
        rejected: Array.isArray(stored.rejected) ? stored.rejected : [],
        details: { ...base.details, ...stored.details },
        links: {
            ...base.links,
            ...stored.links,
            handles: { ...(stored.links?.handles || {}) },
            custom: Array.isArray(stored.links?.custom) ? stored.links.custom : [],
        },
        license: { ...base.license, ...stored.license },
        presets,
    };
};

/** The preset the SK build is pointed at, or the first that has anything in it. */
export const sdPresetFor = (draft: SubmissionDraft): SubmissionPreset | undefined =>
    draft.presets.find(preset => preset.id === draft.sdPresetId)
    || draft.presets.find(preset => preset.slots.some(Boolean))
    || draft.presets[0];

export const loadDraft = async (): Promise<SubmissionDraft | null> =>
    reviveDraft(await loadSubmissionDraftFromDB());

export const saveDraft = async (draft: SubmissionDraft): Promise<void> =>
    saveSubmissionDraftToDB({ ...draft, updatedAt: Date.now() });

export const discardDraft = clearSubmissionDraftFromDB;

// ──────────────────────────────────────────────────────────────────────────────
// The draft, as it travels inside the archive
// ──────────────────────────────────────────────────────────────────────────────

/**
 * `submission.json`, written into every archive the tool builds.
 *
 * Without it the archive is a one-way door: an artist who cleared their browser, or
 * moved to another machine, or wants to change one title six months later, has the
 * ZIP in their hand and no way back into the form that made it. The metadata is
 * already in there in three machine-readable shapes — none of which can be read
 * *back*, because each is a projection of the draft rather than the draft itself.
 *
 * So the draft goes in too, without its blobs: every audio file is already in the
 * archive under `audio/`, and each row remembers where. Reading it back is a matter
 * of pairing the two up.
 */
export const ARCHIVE_SCHEMA = 'spotykach-submission-archive/1' as const;

/** A file row as it appears in `submission.json` — no blob, plus where to find one. */
export type ArchivedFile = Omit<SubmissionFile, 'blob'> & {
    /**
     * Path inside the archive, e.g. `audio/Drones/Roaring.wav`. Absent for a row
     * that points at a published pack: that audio is not in here and must not be.
     */
    archivePath?: string;
};

/** A preset as it appears in `submission.json` — no blob, plus where to find one. */
export type ArchivedPreset = Omit<SubmissionPreset, 'cover'> & {
    coverPath?: string;
    /** What the artist called it. The path is named after the preset, which is not. */
    coverFileName?: string;
    coverWidth?: number;
    coverHeight?: number;
    coverType?: string;
};

export interface ArchivedDraft
    extends Omit<SubmissionDraft, 'files' | 'details' | 'presets' | 'schema'> {
    presets: ArchivedPreset[];
    schema: typeof ARCHIVE_SCHEMA;
    /** The app version that wrote it, for a human reading a puzzling archive. */
    appVersion?: string;
    files: ArchivedFile[];
    details: Omit<SubmissionDetails, 'cover'> & {
        /** The cover's filename inside the archive, when one was supplied. */
        coverPath?: string;
        /** What the artist called it, which the archive's own name discards. */
        coverFileName?: string;
        coverWidth?: number;
        coverHeight?: number;
        coverType?: string;
    };
}

/** Strip the blobs and record where each one went. */
export const toArchivedDraft = (
    draft: SubmissionDraft,
    archivePaths: Map<string, string>,
    coverPath?: string,
    /** Preset row id → where its own cover landed in the archive. */
    presetCoverPaths?: Map<string, string>,
): ArchivedDraft => ({
    ...draft,
    schema: ARCHIVE_SCHEMA,
    presets: draft.presets.map(preset => {
        const { cover, ...rest } = preset;
        return {
            ...rest,
            coverPath: presetCoverPaths?.get(preset.id),
            coverFileName: cover?.fileName,
            coverWidth: cover?.width,
            coverHeight: cover?.height,
            coverType: cover?.type,
        };
    }),
    appVersion: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : undefined,
    // The blob is deliberately dropped: it is already in the archive, under the path
    // recorded here. Keeping it would double the size of the JSON and of nothing else.
    files: draft.files.map(file => ({
        id: file.id,
        fileName: file.fileName,
        title: file.title,
        category: file.category,
        duration: file.duration,
        size: file.size,
        origin: file.origin,
        originId: file.originId,
        license: file.license,
        sourceSamplePath: file.sourceSamplePath,
        archivePath: archivePaths.get(file.id),
    })),
    details: {
        id: draft.details.id,
        name: draft.details.name,
        artist: draft.details.artist,
        shortDescription: draft.details.shortDescription,
        fullDescription: draft.details.fullDescription,
        idFollowsName: draft.details.idFollowsName,
        coverPath,
        coverFileName: draft.details.cover?.fileName,
        coverWidth: draft.details.cover?.width,
        coverHeight: draft.details.cover?.height,
        coverType: draft.details.cover?.type,
    },
});

/**
 * Put the blobs back.
 *
 * `readBlob` is handed a path and returns what is at it, or `undefined` — a row
 * whose audio has gone missing comes back as a row with nothing to play rather than
 * disappearing, because the artist should be told which file to find again.
 */
/**
 * The archive's presets, rebuilt with their covers and never returning an empty list.
 */
const presetsFromArchive = (
    archived: ArchivedDraft,
    readBlob: (path: string) => Blob | undefined,
): SubmissionPreset[] => {
    const rows: ArchivedPreset[] = archived.presets?.length ? archived.presets : [];
    const presets = rows.map(raw => {
        const blank = emptyPreset();
        const cover = raw?.coverPath ? readBlob(raw.coverPath) : undefined;
        return {
            ...blank,
            ...raw,
            id: raw?.id || blank.id,
            slots: Array.from({ length: GRID_CAPACITY }, (_, i) => raw?.slots?.[i] ?? null),
            tapeNotes: Array.from({ length: 6 }, (_, i) => raw?.tapeNotes?.[i]),
            cover: cover && raw?.coverPath
                ? {
                    fileName: raw.coverFileName || raw.coverPath,
                    type: raw.coverType || cover.type || 'image/jpeg',
                    width: raw.coverWidth || 0,
                    height: raw.coverHeight || 0,
                    blob: cover,
                }
                : undefined,
        };
    });
    return presets.length ? presets : [emptyPreset()];
};

export const fromArchivedDraft = (
    archived: ArchivedDraft,
    readBlob: (path: string) => Blob | undefined,
): SubmissionDraft => {
    const base = emptyDraft();
    const cover = archived.details.coverPath ? readBlob(archived.details.coverPath) : undefined;

    return {
        ...base,
        ...archived,
        schema: DRAFT_SCHEMA,
        updatedAt: Date.now(),
        wants: { ...base.wants, ...archived.wants },
        files: (archived.files || []).map(({ archivePath, ...rest }) => ({
            ...rest,
            blob: (archivePath ? readBlob(archivePath) : undefined) || new Blob(),
        })),
        rejected: Array.isArray(archived.rejected) ? archived.rejected : [],
        details: {
            ...base.details,
            id: archived.details.id || '',
            name: archived.details.name || '',
            artist: archived.details.artist || '',
            shortDescription: archived.details.shortDescription || '',
            fullDescription: archived.details.fullDescription || '',
            idFollowsName: !!archived.details.idFollowsName,
            cover: cover && archived.details.coverPath
                ? {
                    fileName: archived.details.coverFileName || archived.details.coverPath,
                    type: archived.details.coverType || cover.type || 'image/jpeg',
                    width: archived.details.coverWidth || 0,
                    height: archived.details.coverHeight || 0,
                    blob: cover,
                }
                : undefined,
        },
        links: {
            ...base.links,
            ...archived.links,
            handles: { ...(archived.links?.handles || {}) },
            custom: Array.isArray(archived.links?.custom) ? archived.links.custom : [],
        },
        license: { ...base.license, ...archived.license },
        // The list never comes back empty: with none at all there is nothing for step 5
        // to draw and nothing to press "add" on. Typed as the archive's own shape —
        // mixing in an `emptyPreset()` here would widen the element and hide
        // `coverPath`, which is the whole reason this branch reads what it reads.
        presets: presetsFromArchive(archived, readBlob),
        // Back where they were, not at the beginning.
        step: Math.min(6, Math.max(1, archived.step || 1)),
    };
};
