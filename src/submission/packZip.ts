import { licenseStatement } from './licenses';
import {
    buildPackEntry, buildPackReadme, buildPresetDescriptor, buildPresetEntry,
    buildSubmissionMarkdown, coverExtension, presetIdsFor, submittablePresets,
} from './outputs';
import {
    ownFiles, slugify, toArchivedDraft, type SubmissionDraft, type SubmissionFile,
} from './draft';

/**
 * The download. Singular.
 *
 * There were two at first — a few kilobytes of metadata to attach to a message, and
 * the audio to send by link — on the theory that the small half should arrive
 * complete even if the large half went astray. In practice it just made two things
 * to keep track of, two things to lose, and a submission that could arrive half
 * present. One archive goes on WeTransfer or Drive, one link goes in the message.
 *
 * **The artist's audio goes in exactly as it was dropped.** No re-encoding, for
 * three reasons: it is the master the maintainer normalizes from, transcoding a
 * gigabyte in a browser tab is a bad idea, and a 24-bit WAV re-encoded to 32-bit
 * float is larger and no better. The FLAC conversion that saves space in the app is
 * a deployment step and belongs there.
 *
 * **Samples borrowed from packs already in the app are not in here.** They are
 * referenced by the preset where they already live — see `isOwnFile`.
 */

/** Strip anything a filesystem or a ZIP index will object to. */
const safeFileName = (name: string): string =>
    name
        .replace(/[\\/:*?"<>|]+/g, '-')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120) || 'sample';

const extensionOf = (fileName: string): string => {
    const match = fileName.match(/\.([a-z0-9]+)$/i);
    return match ? match[1].toLowerCase() : 'wav';
};

/**
 * What one file is called inside the archive.
 *
 * The extension always comes from the source: renaming a FLAC to `.wav` because the
 * artist typed a title without one would produce a file that lies about itself and
 * that half their tools would refuse to open.
 */
export const archiveNameFor = (file: SubmissionFile, naming: 'original' | 'title'): string => {
    if (naming === 'original') return safeFileName(file.fileName);
    const title = safeFileName(file.title.replace(/\.[^/.]+$/, ''));
    return `${title}.${extensionOf(file.fileName)}`;
};

/**
 * Where it sits. Categories are folders, because that is how the app reads them back
 * and how the artist arranged them in the first place.
 */
const archivePathFor = (file: SubmissionFile, naming: 'original' | 'title'): string => {
    const category = (file.category || 'General').trim();
    const name = archiveNameFor(file, naming);
    return category && category !== 'General'
        ? `audio/${safeFileName(category)}/${name}`
        : `audio/${name}`;
};

export interface SubmissionArchive {
    blob: Blob;
    fileName: string;
    /** Audio files that made it in. */
    count: number;
}

/**
 * Everything, in one archive.
 *
 * `STORE` rather than `DEFLATE`: audio does not compress — a WAV loses perhaps 2% —
 * and deflating a gigabyte of it costs minutes of a blocked tab to save nothing. The
 * handful of text files are trivial either way.
 */
export const buildSubmissionArchive = async (
    draft: SubmissionDraft,
    onProgress?: (message: string, percent: number) => void,
): Promise<SubmissionArchive> => {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    const packId =
        draft.details.id || slugify(draft.details.name) || slugify(draft.presets[0]?.name || '') || 'submission';

    // --- The audio, first, so its paths can be recorded ------------------------
    // Two files with the same name in the same category would silently overwrite
    // each other inside the ZIP, and the artist would never know which one survived.
    // Rare with original names, easy to cause by renaming two titles the same.
    const taken = new Set<string>();
    const uniquePath = (path: string): string => {
        if (!taken.has(path)) {
            taken.add(path);
            return path;
        }
        const dot = path.lastIndexOf('.');
        const stem = dot > 0 ? path.slice(0, dot) : path;
        const extension = dot > 0 ? path.slice(dot) : '';
        for (let n = 2; ; n++) {
            const candidate = `${stem}-${n}${extension}`;
            if (!taken.has(candidate)) {
                taken.add(candidate);
                return candidate;
            }
        }
    };

    /** Row id → where its audio landed, so `submission.json` can pair them back up. */
    const archivePaths = new Map<string, string>();
    const audio = ownFiles(draft);
    let count = 0;
    audio.forEach((file, index) => {
        if (!file.blob || file.blob.size === 0) return;
        onProgress?.(`Packing ${file.title}…`, (index / Math.max(1, audio.length)) * 70);
        const path = uniquePath(archivePathFor(file, draft.audioNaming));
        zip.file(path, file.blob);
        archivePaths.set(file.id, path);
        count++;
    });

    // --- The covering letter and the machine-readable halves -------------------
    zip.file('SUBMISSION.md', buildSubmissionMarkdown(draft));

    if (draft.wants.pack) {
        zip.file('README.md', buildPackReadme(draft));
        zip.file('manifest-entry.json', JSON.stringify(buildPackEntry(draft), null, 2));
    }

    const license = licenseStatement(draft.license.choice, draft.license.custom);
    zip.file(
        'LICENSE.txt',
        `${draft.details.name.trim() || packId}\n` +
        `${draft.details.artist.trim() ? `by ${draft.details.artist.trim()}\n` : ''}` +
        `\n${license || 'No licence stated.'}\n`,
    );

    let coverPath: string | undefined;
    if (draft.details.cover) {
        const extension = draft.details.cover.fileName.split('.').pop()?.toLowerCase() || 'jpg';
        coverPath = `cover.${extension}`;
        zip.file(coverPath, draft.details.cover.blob);
    }

    /*
     * One descriptor per preset, under `presets/`, and one array of manifest entries.
     *
     * A folder rather than the root: a submission carrying three layouts over the
     * same pack would otherwise scatter three near-identically-named JSON files
     * among the metadata, and the maintainer copies `presets/` across wholesale.
     */
    const presets = submittablePresets(draft);
    const ids = presetIdsFor(draft);

    /** Preset row id → where its own artwork landed, so the archive can be reopened. */
    const presetCoverPaths = new Map<string, string>();

    /*
     * Artwork for *every* preset holding some, not only the ones being submitted.
     *
     * A half-built second layout — an image chosen, nothing named yet — is still in
     * `submission.json` and still comes back on reopening, so its image has to be in
     * here too or the round-trip quietly loses the one part that took a decision.
     * Only artwork the artist gave *this* preset: one showing the pack's cover carries
     * no file of its own, because its entry points at the pack's image, which is in
     * this archive once and used twice.
     */
    draft.presets.forEach(preset => {
        if (!preset.cover) return;
        const name = ids.get(preset.id) || preset.id;
        const path = `presets/${name}-cover.${coverExtension(preset.cover.fileName)}`;
        zip.file(path, preset.cover.blob);
        presetCoverPaths.set(preset.id, path);
    });

    if (presets.length) {
        presets.forEach(preset => {
            const id = ids.get(preset.id)!;
            zip.file(`presets/${id}.json`, JSON.stringify(buildPresetDescriptor(draft, preset), null, 2));
        });
        zip.file(
            'preset-entries.json',
            JSON.stringify(presets.map(p => buildPresetEntry(draft, p, ids.get(p.id))), null, 2),
        );
    }

    /*
     * The way back in.
     *
     * Everything else in this archive is a *projection* of the draft — the manifest
     * entry, the README frontmatter, the descriptor — and none of them can be read
     * back into the form that made them. Without this the archive is a one-way door:
     * an artist who cleared their browser, changed machine, or wants to fix one title
     * six months from now has the ZIP in their hand and no way to reopen it.
     */
    zip.file(
        'submission.json',
        JSON.stringify(toArchivedDraft(draft, archivePaths, coverPath, presetCoverPaths), null, 2),
    );

    onProgress?.('Writing the archive…', 75);
    const blob = await zip.generateAsync(
        { type: 'blob', compression: 'STORE' },
        metadata => onProgress?.('Writing the archive…', 75 + metadata.percent * 0.25),
    );

    return { blob, fileName: `${packId}-submission.zip`, count };
};
