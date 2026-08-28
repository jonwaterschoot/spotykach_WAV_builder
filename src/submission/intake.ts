import { TAPE_COLORS } from '../types';
import { parseProjectDescriptor, type ProjectDescriptor } from '../utils/projectDescriptorUtils';
import type { BrowsePoolEntry } from '../utils/persistence';
import {
    ARCHIVE_SCHEMA, fromArchivedDraft, newId, titleFromFileName, type ArchivedDraft,
    type RejectedFile, type SubmissionCover, type SubmissionDraft, type SubmissionFile,
    type SubmissionPreset,
} from './draft';

/**
 * Getting audio into the draft.
 *
 * The one rule the whole module follows: **the artist's file goes in untouched.**
 * Browse decodes and re-encodes on the way into its pool because everything it does
 * next is playback and slot exports. Here the blob is what will eventually be sent
 * to a maintainer over WeTransfer, and re-encoding a 12 MB FLAC into a 60 MB float
 * WAV to store in IndexedDB would be both wasteful and a lie about what was
 * submitted. Duration is read by decoding into a throwaway context; nothing is kept
 * from that decode but the number.
 */

const AUDIO_EXTENSIONS = /\.(wav|mp3|flac|aiff?|ogg|oga|m4a|aac|opus|webm)$/i;

export const isAudioFile = (file: { name: string; type?: string }): boolean =>
    (file.type || '').startsWith('audio/') || AUDIO_EXTENSIONS.test(file.name);

const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|avif)$/i;

export const isImageFile = (file: { name: string; type?: string }): boolean =>
    (file.type || '').startsWith('image/') || IMAGE_EXTENSIONS.test(file.name);

/** A file plus where it sat in the dropped folder, which is where categories come from. */
export interface IntakeEntry {
    file: File;
    /** `Drones/Roaring.wav`, or just `Roaring.wav` at the root. */
    relativePath: string;
}

/**
 * The subfolder a file came from, flattened to one level.
 *
 * `generate-manifest.mjs` uses `path.dirname` and keeps nested paths whole, which
 * would produce categories like `Drones/Long`. The browser's category filter is a
 * flat list of chips, so the deepest folder wins and the rest is dropped — which is
 * also what someone organising `Pack/Drones/Long/x.wav` almost certainly means.
 */
export const categoryFromPath = (relativePath: string): string => {
    const parts = relativePath.split('/').filter(Boolean);
    parts.pop();
    return parts.length ? parts[parts.length - 1] : 'General';
};

let durationContext: AudioContext | null = null;

/**
 * One context for the whole intake, not one per file.
 *
 * A folder of three hundred samples opened three hundred `AudioContext`s under the
 * per-file approach, and browsers cap them — somewhere past the limit every
 * remaining file failed to decode and was reported as corrupt, which it wasn't.
 */
const durationOf = async (blob: Blob): Promise<number> => {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return 0;
    if (!durationContext || durationContext.state === 'closed') durationContext = new Ctx();
    const decoded = await durationContext.decodeAudioData(await blob.arrayBuffer());
    return decoded.duration;
};

/** Let the shared decode context go once an intake is finished. */
export const releaseIntakeResources = () => {
    durationContext?.close().catch(() => { /* already closing — nothing to do */ });
    durationContext = null;
};

export interface IntakeResult {
    files: SubmissionFile[];
    rejected: RejectedFile[];
}

/**
 * Decode-check a batch and turn it into draft rows.
 *
 * Anything that fails to decode is *named*, not counted: "4 files were skipped"
 * sends the artist back to a folder of three hundred to work out which four, and
 * the answer is usually one obvious thing — an .m4a from a phone, a sidecar file
 * with an audio extension — that they can fix in a second if told.
 */
export const intakeAudio = async (
    entries: IntakeEntry[],
    onProgress?: (done: number, total: number, name: string) => void,
): Promise<IntakeResult> => {
    const files: SubmissionFile[] = [];
    const rejected: RejectedFile[] = [];

    for (let i = 0; i < entries.length; i++) {
        const { file, relativePath } = entries[i];
        onProgress?.(i, entries.length, file.name);

        if (!isAudioFile(file)) {
            rejected.push({ fileName: relativePath, reason: 'Not an audio file.' });
            continue;
        }

        try {
            const duration = await durationOf(file);
            files.push({
                id: newId(),
                fileName: file.name,
                title: titleFromFileName(file.name),
                category: categoryFromPath(relativePath),
                duration,
                size: file.size,
                blob: file,
            });
        } catch {
            rejected.push({
                fileName: relativePath,
                reason: 'This browser could not decode it. It may be a format it doesn’t support, or the file may be damaged.',
            });
        }
    }

    onProgress?.(entries.length, entries.length, '');
    return { files, rejected };
};

// ──────────────────────────────────────────────────────────────────────────────
// The three ways in
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Walk a `DataTransfer`, following folders where the browser allows it.
 *
 * `webkitGetAsEntry` is non-standard and universally implemented, and it is the only
 * way a *dropped* folder yields its contents — `dataTransfer.files` flattens a
 * folder drop to nothing at all. Where it is missing the plain file list is used,
 * which loses subfolder categories but never loses files.
 */
export const entriesFromDataTransfer = async (dt: DataTransfer): Promise<IntakeEntry[]> => {
    const items = Array.from(dt.items || []);
    const canWalk = items.length > 0 && typeof items[0].webkitGetAsEntry === 'function';

    if (!canWalk) {
        return Array.from(dt.files || []).map(file => ({ file, relativePath: file.name }));
    }

    const roots = items
        .map(item => item.webkitGetAsEntry())
        .filter((entry): entry is FileSystemEntry => !!entry);

    const collected: IntakeEntry[] = [];

    const readFile = (entry: FileSystemFileEntry, prefix: string) =>
        new Promise<void>(resolve => {
            entry.file(
                file => {
                    collected.push({ file, relativePath: prefix ? `${prefix}/${file.name}` : file.name });
                    resolve();
                },
                () => resolve(),
            );
        });

    // `readEntries` returns a page at a time and signals the end with an empty page,
    // so a folder of 300 files needs the loop — a single call reads about 100.
    const readDirectory = async (entry: FileSystemDirectoryEntry, prefix: string) => {
        const reader = entry.createReader();
        for (;;) {
            const batch = await new Promise<FileSystemEntry[]>(resolve => {
                reader.readEntries(resolve, () => resolve([]));
            });
            if (batch.length === 0) return;
            for (const child of batch) await walk(child, prefix);
        }
    };

    const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
        const path = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isFile) return readFile(entry as FileSystemFileEntry, prefix);
        if (entry.isDirectory) return readDirectory(entry as FileSystemDirectoryEntry, path);
    };

    // The dropped folder's own name is not part of the path: dropping `MyPack/` should
    // give categories `Drones` and `Perc`, not `MyPack/Drones`.
    for (const root of roots) {
        if (root.isDirectory) {
            await readDirectory(root as FileSystemDirectoryEntry, '');
        } else {
            await walk(root, '');
        }
    }

    return collected;
};

/** The same walk over a picked directory handle, where the API is available. */
export const entriesFromDirectoryHandle = async (
    handle: FileSystemDirectoryHandle,
): Promise<IntakeEntry[]> => {
    const collected: IntakeEntry[] = [];

    const walk = async (dir: FileSystemDirectoryHandle, prefix: string) => {
        // `entries()` is an async iterator on the handle at runtime; the lib types
        // describe it loosely enough that the destructured entry arrives as the base
        // `FileSystemHandle`, so the file branch is narrowed by hand.
        const iterable = dir as unknown as {
            entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
        };
        for await (const [name, entry] of iterable.entries()) {
            const path = prefix ? `${prefix}/${name}` : name;
            if (entry.kind === 'file') {
                collected.push({
                    file: await (entry as FileSystemFileHandle).getFile(),
                    relativePath: path,
                });
            } else {
                await walk(entry as FileSystemDirectoryHandle, path);
            }
        }
    };

    await walk(handle, '');
    return collected;
};

/** `<input type="file" webkitdirectory>` — the fallback where no picker exists. */
export const entriesFromInput = (fileList: FileList): IntakeEntry[] =>
    Array.from(fileList).map(file => ({
        file,
        // `webkitRelativePath` starts at the chosen folder itself, which is the same
        // level a drop discards — so drop it here too and the categories match.
        relativePath: (file.webkitRelativePath || file.name).split('/').slice(1).join('/') || file.name,
    }));

// ──────────────────────────────────────────────────────────────────────────────
// From inside the app
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Browse's pool, straight across.
 *
 * The pool holds processed 48 kHz WAV rather than the artist's original file — it
 * has to, because everything the pool does is playback and slot export. That is
 * still exactly what should be submitted from here: these are files the artist
 * assembled *in the app*, often edited there, and the edited version is the one
 * they mean. The originals in the pool are the pre-edit versions, not the source.
 */
export const filesFromPool = (entries: BrowsePoolEntry[]): SubmissionFile[] =>
    entries.map(entry => ({
        id: entry.id || newId(),
        fileName: entry.fileName || `${entry.name}.wav`,
        title: entry.name,
        category: 'General',
        duration: entry.duration || 0,
        size: entry.current?.size || 0,
        blob: entry.current,
        origin: entry.origin,
        license: entry.license,
        sourceSamplePath: entry.sourceSamplePath,
    }));

export interface DescriptorIntake {
    files: SubmissionFile[];
    preset: Pick<SubmissionPreset, 'name' | 'description' | 'slots' | 'tapeNotes' | 'projectNotes'>;
    /** How many slots the descriptor actually filled — worth reporting. */
    filledSlots: number;
    /** Pack ids the descriptor referenced — what `requiredPacks` will say. */
    requiredPacks: string[];
    rejected: RejectedFile[];
}

/**
 * A settings-only export, read back into a draft.
 *
 * Two shapes arrive here: the bare `.json` descriptor, and the `.zip` the app
 * currently produces around one. Entries that reference a pack come back as rows
 * with no blob to send — they are already published audio, and re-submitting it
 * would be asking the maintainer to deploy it twice. Entries that carry their own
 * audio come back with the blob from `custom_assets/`, because those genuinely do
 * need to travel.
 */
export const intakeDescriptorFile = async (file: File): Promise<DescriptorIntake> => {
    let descriptor: ProjectDescriptor;
    const customBlobs: Record<string, Blob> = {};

    if (/\.zip$/i.test(file.name) || file.type === 'application/zip') {
        const JSZip = (await import('jszip')).default;
        const zip = await JSZip.loadAsync(file);
        const descriptorEntry =
            zip.file('project-descriptor.json') ||
            zip.file(/project-descriptor\.json$/)[0];
        if (!descriptorEntry) {
            throw new Error(
                'That ZIP holds no project-descriptor.json. A full project backup can’t be read here — ' +
                'export it again as a settings-only preset.',
            );
        }
        descriptor = parseProjectDescriptor(JSON.parse(await descriptorEntry.async('string')));

        const assets = zip.folder('custom_assets');
        if (assets) {
            const reads: Promise<void>[] = [];
            assets.forEach((relativePath, entry) => {
                if (entry.dir) return;
                reads.push(
                    entry.async('blob').then(blob => {
                        customBlobs[`custom_assets/${relativePath}`] = blob;
                    }),
                );
            });
            await Promise.all(reads);
        }
    } else {
        descriptor = parseProjectDescriptor(JSON.parse(await file.text()));
    }

    const rejected: RejectedFile[] = [];
    const requiredPacks = new Set<string>();
    /** Descriptor file id → the row we made for it, so the slots can point at rows. */
    const idMap = new Map<string, string>();
    const files: SubmissionFile[] = [];

    for (const [descriptorId, entry] of Object.entries(descriptor.files)) {
        const blob = entry.blobRef ? customBlobs[entry.blobRef] : undefined;

        if (entry.blobRef && !blob) {
            rejected.push({
                fileName: entry.originalName,
                reason: 'This slot carries its own audio, and the file wasn’t in the export. Add it from your folder.',
            });
            continue;
        }

        if (entry.samplePackId) requiredPacks.add(entry.samplePackId);

        const rowId = newId();
        idMap.set(descriptorId, rowId);
        files.push({
            id: rowId,
            fileName: entry.originalName,
            title: titleFromFileName(entry.originalName),
            category: 'General',
            // The descriptor keeps no durations; the 42 s check runs on what it can
            // measure, and a pack sample has already passed it once on the way in.
            duration: 0,
            size: blob?.size || 0,
            blob: blob || new Blob(),
            origin: entry.origin || entry.samplePackId,
            license: entry.license,
            sourceSamplePath: entry.samplePath,
        });
    }

    const slots: (string | null)[] = [];
    const tapeNotes: (string | undefined)[] = [];
    TAPE_COLORS.forEach(color => {
        const tape = descriptor.tapes[color];
        tapeNotes.push(tape?.notes);
        for (let slot = 1; slot <= 6; slot++) {
            const fileId = tape?.slots?.find(s => s.id === slot)?.fileId;
            slots.push((fileId && idMap.get(fileId)) || null);
        }
    });

    return {
        files,
        filledSlots: slots.filter(Boolean).length,
        preset: {
            name: descriptor.name === 'Untitled Project' ? '' : descriptor.name,
            description: descriptor.description || '',
            slots,
            tapeNotes,
            projectNotes: descriptor.projectNotes || '',
        },
        requiredPacks: [...requiredPacks],
        rejected,
    };
};

/**
 * A submission archive the tool built earlier, read back into a whole draft.
 *
 * The counterpart to `submission.json` — see `toArchivedDraft`. Everything comes
 * back: the details, the links, the licence, the titles and categories, the preset
 * with its slots and its notes, and the audio, paired up by the paths recorded when
 * the archive was written.
 *
 * Rows whose audio is missing from the archive are kept and *named*, not dropped.
 * Two ways that happens and only one is a fault: a row that references a published
 * pack was never meant to carry audio, and a file that has genuinely gone missing is
 * something the artist has to be told about rather than left to discover at the end.
 */
export const intakeSubmissionArchive = async (
    file: File,
): Promise<{ draft: SubmissionDraft; missing: string[] }> => {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(file);

    const entry = zip.file('submission.json');
    if (!entry) {
        throw new Error(
            'That ZIP has no submission.json, so it was not built by this tool. Drop a folder of audio ' +
            'in instead, or an exported project.',
        );
    }

    const archived = JSON.parse(await entry.async('string')) as ArchivedDraft;
    if (archived?.schema !== ARCHIVE_SCHEMA) {
        throw new Error(
            `That archive was written in a format this build does not know (${archived?.schema || 'unmarked'}).`,
        );
    }

    // Read every blob the draft will ask for, up front. `fromArchivedDraft` is
    // synchronous by design — it is the same function the draft store round-trips
    // through — so the asynchronous half has to finish first.
    // Every path the draft will reach for. Missing one here is silent and total: the
    // blob simply is not in the map, `readBlob` returns undefined, and the field comes
    // back empty as though it had never been filled in — which is exactly how preset
    // artwork went missing on the first round-trip that carried any.
    const wanted = new Set<string>();
    (archived.files || []).forEach(row => { if (row.archivePath) wanted.add(row.archivePath); });
    (archived.presets || []).forEach(row => { if (row.coverPath) wanted.add(row.coverPath); });
    if (archived.details?.coverPath) wanted.add(archived.details.coverPath);

    const blobs = new Map<string, Blob>();
    const missing: string[] = [];
    await Promise.all([...wanted].map(async path => {
        const zipped = zip.file(path);
        if (!zipped) {
            missing.push(path);
            return;
        }
        blobs.set(path, await zipped.async('blob'));
    }));

    return { draft: fromArchivedDraft(archived, path => blobs.get(path)), missing };
};

// ──────────────────────────────────────────────────────────────────────────────
// Cover art
// ──────────────────────────────────────────────────────────────────────────────

/** The cover's shape, read once so step 3 can say what's wrong with it. */
export const readCover = (file: File): Promise<SubmissionCover> =>
    new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve({
                fileName: file.name,
                type: file.type || 'image/jpeg',
                width: img.naturalWidth,
                height: img.naturalHeight,
                blob: file,
            });
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('That image could not be read.'));
        };
        img.src = url;
    });

/** What the guide asks for: landscape, and wide enough for the hero banner. */
export const coverWarnings = (cover: SubmissionCover): string[] => {
    const warnings: string[] = [];
    if (cover.height > cover.width) {
        warnings.push('This is portrait. The pack page shows it as a wide hero banner, so it will be cropped hard.');
    }
    if (cover.width < 1200) {
        warnings.push(`It is ${cover.width}px wide. 1200px or more keeps it sharp on the banner.`);
    }
    return warnings;
};
