import { TAPE_COLORS } from '../types';
import type { PresetManifestEntry, Sample, SamplePack } from '../data/samplePacks';
import type { ProjectDescriptor, DescriptorFileEntry } from '../utils/projectDescriptorUtils';
import { DISCORD_HANDLE, submissionEmail } from '../data/links';
import { licenseStatement } from './licenses';
import { buildLinkEntries, isHandleOnly, PLATFORMS_BY_ID } from './platforms';
import {
    ownFiles, referencedFiles, slugify, type SubmissionDraft, type SubmissionFile,
    type SubmissionPreset,
} from './draft';
import { toSampleKey } from '../utils/assetUtils';

/**
 * What the tool hands back.
 *
 * Every function here is pure and synchronous but for the ZIP: given a draft, it
 * produces the exact text or JSON a maintainer would otherwise have written by hand.
 * That is the whole point of the tool — the guide used to ask an artist to fill in a
 * template, which a maintainer then translated into these shapes, and the
 * translation step is where things went missing.
 */

/** The extension every sample ends up with: `normalize.py` writes FLAC. */
const DEPLOYED_EXTENSION = 'flac';

/**
 * `Roaring Drone.wav` → `Roaring-Drone.flac`, the name after normalization.
 *
 * The hyphen matters. `scripts/normalize.py` replaces spaces on its way to FLAC, for
 * URL-friendly names in the bucket, so a path written here with the space still in it
 * describes a file that will never exist — and the preset built on it resolves to
 * nothing, months later, with no obvious cause. The archive keeps the artist's own
 * filenames; only the *deployed* path is sanitized, and only the same way.
 */
const deployedFileName = (fileName: string): string =>
    `${fileName.replace(/\.[^/.]+$/, '').replace(/ /g, '-')}.${DEPLOYED_EXTENSION}`;

/**
 * Where a sample will live in the bucket.
 *
 * Mirrors `scanSamples` in `generate-manifest.mjs` exactly — `/<pack-id>/<relative
 * path>` — so if the maintainer runs that script over the delivered folder instead
 * of pasting this entry, both produce the same paths.
 */
export const deployedPath = (packId: string, file: SubmissionFile): string => {
    const folder = file.category && file.category !== 'General' ? `${file.category}/` : '';
    return `/${packId}/${folder}${deployedFileName(file.fileName)}`;
};

/**
 * `https://pub-….r2.dev/samples/Hainbach/x.flac` → `/Hainbach/x.flac`.
 *
 * A sample pooled in Browse remembers where it was fetched from, which is a
 * resolved absolute URL; a sample read out of an exported preset remembers the
 * relative path the manifest uses. Both mean the same file, and a descriptor that
 * shipped the absolute one would hard-code today's bucket into a preset that
 * outlives it. `resolveAssetPath` puts the prefix back at load time.
 */
export const toManifestPath = (path: string): string => {
    if (!path) return path;
    const key = toSampleKey(path);
    // A descriptor's `samplePath` is fed to `resolveAssetPath`, which only treats a
    // rooted path as an R2 candidate — so this one adds the slash `toSampleKey`
    // deliberately leaves off.
    return key.startsWith('/') ? key : `/${key}`;
};

/** The pack's `description`, which in this schema carries the whole text. */
const packDescription = (draft: SubmissionDraft): string => {
    const short = draft.details.shortDescription.trim();
    const full = draft.details.fullDescription.trim();
    if (!full) return short;
    if (!short) return full;
    return `${short}\n\n${full}`;
};

/** The `packs[]` entry, complete but for the cover image's final filename. */
export const buildPackEntry = (draft: SubmissionDraft): SamplePack => {
    const packId = draft.details.id || slugify(draft.details.name) || 'untitled-pack';

    // Only the artist's own audio. A row borrowed from a published pack is already
    // in the manifest under its own pack's id, and listing it again here would
    // deploy a second copy that nothing points at.
    const samples: Sample[] = ownFiles(draft).map(file => ({
        name: file.title.trim(),
        path: deployedPath(packId, file),
        category: file.category || 'General',
    }));

    const entry: SamplePack = {
        id: packId,
        name: draft.details.name.trim(),
        description: packDescription(draft),
        license: licenseStatement(draft.license.choice, draft.license.custom),
        samples,
    };

    if (draft.details.cover) {
        entry.coverImage = `/${packId}/cover.${coverExtension(draft.details.cover.fileName)}`;
    }

    const links = buildLinkEntries(draft.links.handles, draft.links.website, draft.links.custom)
        // Discord is a handle, not an address. It belongs in SUBMISSION.md, where the
        // maintainer reads it, not in a manifest entry that renders it as a link.
        .filter(link => link.label !== PLATFORMS_BY_ID.discord.label);
    if (links.length) entry.links = links;

    return entry;
};

/**
 * The preset's description, falling back to the pack's.
 *
 * The field on step 5 shows the pack's short description while nothing has been
 * typed over it, so the outputs have to resolve it the same way — otherwise the
 * artist reads one sentence on screen and submits an empty string.
 */
export const presetDescriptionFor = (draft: SubmissionDraft, preset: SubmissionPreset): string => {
    const own = preset.description.trim();
    if (own) return own;
    return preset.descriptionFollowsPack ? draft.details.shortDescription.trim() : '';
};

/** The id the preset is filed under, derived from its name the same way packs are. */
export const presetIdFor = (draft: SubmissionDraft, preset: SubmissionPreset): string => {
    const base = slugify(preset.name) || draft.details.id || 'untitled';
    return base.endsWith('-preset') ? base : `${base}-preset`;
};

/**
 * Every preset's published id, made unique.
 *
 * Two unnamed presets over the same pack both slug to `<pack-id>-preset`, and the
 * second would overwrite the first in the archive and in `public/presets/`. Rare and
 * silent, which is the worst combination.
 */
export const presetIdsFor = (draft: SubmissionDraft): Map<string, string> => {
    const taken = new Set<string>();
    const ids = new Map<string, string>();
    draft.presets.forEach(preset => {
        const base = presetIdFor(draft, preset);
        let id = base;
        for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
        taken.add(id);
        ids.set(preset.id, id);
    });
    return ids;
};

/**
 * The descriptor, built from the draft rather than from a live `AppState`.
 *
 * `buildDescriptorFromState` exists and is the right function for Studio, but the
 * draft is not an `AppState` — its rows may reference packs that aren't loaded, and
 * its slots are an array rather than six tapes. Round-tripping through a synthetic
 * `AppState` to reach the same JSON would be more code, not less.
 */
export const buildPresetDescriptor = (
    draft: SubmissionDraft,
    preset: SubmissionPreset,
): ProjectDescriptor => {
    const packId = draft.details.id || slugify(draft.details.name);
    const byId = new Map(draft.files.map(file => [file.id, file]));

    const files: Record<string, DescriptorFileEntry> = {};
    const used = new Set(preset.slots.filter((id): id is string => !!id));

    used.forEach(id => {
        const file = byId.get(id);
        if (!file) return;

        const entry: DescriptorFileEntry = {
            originalName: file.fileName,
            license: file.license || licenseStatement(draft.license.choice, draft.license.custom),
        };

        // A row that already points at published audio keeps that reference. A row
        // from the artist's own folder points at where its audio *will* be once the
        // pack is deployed — which is why a preset can only ship after its pack does.
        if (file.sourceSamplePath) {
            // `samplePackId` is an id and `origin` is a label. Filling both from the
            // same field is what put "Hainbach's Spotykach Tapes" into requiredPacks,
            // where a maintainer's manifest has no such pack. `originId` is resolved
            // from the path — see `packLookup.ts` — and only falls back when the
            // manifest could not be reached.
            entry.origin = file.origin;
            entry.samplePackId = file.originId || file.origin;
            entry.samplePath = toManifestPath(file.sourceSamplePath);
        } else if (packId) {
            entry.origin = packId;
            entry.samplePackId = packId;
            entry.samplePath = deployedPath(packId, file);
        }

        files[id] = entry;
    });

    const tapes = {} as ProjectDescriptor['tapes'];
    TAPE_COLORS.forEach((color, tapeIndex) => {
        tapes[color] = {
            slots: Array.from({ length: 6 }, (_, slotIndex) => ({
                id: slotIndex + 1,
                fileId: preset.slots[tapeIndex * 6 + slotIndex] ?? null,
            })),
            notes: preset.tapeNotes[tapeIndex],
        };
    });

    return {
        schema: 'spotykach-project/1.0',
        name: preset.name.trim() || draft.details.name.trim() || 'Untitled Project',
        description: presetDescriptionFor(draft, preset) || undefined,
        tapes,
        files,
        projectNotes: preset.projectNotes.trim() || undefined,
    };
};

/**
 * Which packs the preset needs, derived rather than asked for.
 *
 * §2 item 4 of the workflow document: the descriptor has always known this, in every
 * file's `samplePackId`, and it was reconstructed by hand from a JSON file the
 * submitter never opened.
 */
export const requiredPacksFor = (draft: SubmissionDraft, preset: SubmissionPreset): string[] => {
    const descriptor = buildPresetDescriptor(draft, preset);
    const packs = new Set<string>();
    Object.values(descriptor.files).forEach(entry => {
        if (entry.samplePackId) packs.add(entry.samplePackId);
    });
    return [...packs];
};

/** Every pack any of the presets leans on, for the covering letter's summary. */
export const allRequiredPacks = (draft: SubmissionDraft): string[] => {
    const packs = new Set<string>();
    draft.presets.forEach(preset => requiredPacksFor(draft, preset).forEach(id => packs.add(id)));
    return [...packs];
};

/** `cover.jpg` → `jpg`, for a path that has to name the format it holds. */
export const coverExtension = (fileName: string): string =>
    fileName.split('.').pop()?.toLowerCase() || 'jpg';

/**
 * Where a preset's artwork will live, or nothing at all.
 *
 * Three levels, in order:
 *
 * 1. **Its own image**, when the artist gave this preset one.
 * 2. **The submitted pack's image** — and only that one. A preset built on packs
 *    already in the app does *not* inherit their covers: artwork is a credit as much
 *    as a decoration, and hanging Hainbach's photograph over somebody else's layout
 *    would claim something untrue on both sides.
 * 3. **Nothing**, which the Preset door draws as a gradient keyed to the preset's own
 *    id — so a list of unillustrated presets still looks like a list of different
 *    things.
 */
export const presetCoverPath = (
    draft: SubmissionDraft,
    preset: SubmissionPreset,
    id: string,
): string | undefined => {
    if (preset.cover) return `/presets/${id}-cover.${coverExtension(preset.cover.fileName)}`;

    if (preset.coverFollowsPack && draft.wants.pack && draft.details.cover) {
        const packId = draft.details.id || slugify(draft.details.name);
        if (packId) return `/${packId}/cover.${coverExtension(draft.details.cover.fileName)}`;
    }

    return undefined;
};

/** The `presets[]` entry — everything but the SD ZIP's URL. */
export const buildPresetEntry = (
    draft: SubmissionDraft,
    preset: SubmissionPreset,
    id = presetIdFor(draft, preset),
): PresetManifestEntry => ({
    id,
    name: preset.name.trim(),
    description: presetDescriptionFor(draft, preset),
    requiredPacks: requiredPacksFor(draft, preset),
    descriptorPath: `/presets/${id}.json`,
    coverImage: presetCoverPath(draft, preset, id),
});

/** Presets worth emitting: named, or with something in their slots. */
export const submittablePresets = (draft: SubmissionDraft): SubmissionPreset[] =>
    draft.wants.preset
        ? draft.presets.filter(preset => preset.name.trim() || preset.slots.some(Boolean))
        : [];

// ──────────────────────────────────────────────────────────────────────────────
// The two documents
// ──────────────────────────────────────────────────────────────────────────────

/** Frontmatter values are read to end-of-line, so a newline in one would split it. */
const oneLine = (value: string): string => value.replace(/\s*\n+\s*/g, ' ').trim();

/**
 * The pack folder's `README.md`.
 *
 * Shaped for `generate-manifest.mjs`: `---` frontmatter of `key: value` pairs and a
 * `# Links` section of `- Label: url`. Deliberately all single-line — the script's
 * `key: |` block form stops at the first continuation line containing a colon, and a
 * description that mentions a URL contains several. The long text lives in the body
 * below, where a human reads it and no parser has to.
 */
export const buildPackReadme = (draft: SubmissionDraft): string => {
    const packId = draft.details.id || slugify(draft.details.name) || 'untitled-pack';
    const license = licenseStatement(draft.license.choice, draft.license.custom);
    const links = buildLinkEntries(draft.links.handles, draft.links.website, draft.links.custom)
        .filter(link => link.label !== PLATFORMS_BY_ID.discord.label);

    const lines = [
        '---',
        `id: ${packId}`,
        `name: ${oneLine(draft.details.name)}`,
        `artist: ${oneLine(draft.details.artist)}`,
        `description: ${oneLine(draft.details.shortDescription)}`,
        `license: ${oneLine(license)}`,
        '---',
        '',
        `# ${draft.details.name.trim() || packId}`,
        '',
        draft.details.fullDescription.trim() || draft.details.shortDescription.trim(),
        '',
    ];

    if (links.length) {
        lines.push('# Links', '');
        links.forEach(link => lines.push(`- ${link.label}: ${link.url}`));
        lines.push('');
    }

    lines.push(
        '# License',
        '',
        license || '_Not stated._',
        '',
    );

    return lines.join('\n');
};

const formatBytes = (bytes: number): string => {
    if (!bytes) return '—';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit++;
    }
    return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
};

/**
 * `SUBMISSION.md` — the half a machine doesn't read.
 *
 * It exists because a ZIP of JSON arriving in a Discord message says nothing about
 * who sent it, what is still coming, or what the artist wanted. This is the covering
 * letter, written from the draft so it can't disagree with the files beside it.
 */
export const buildSubmissionMarkdown = (draft: SubmissionDraft): string => {
    const { details, wants } = draft;
    const own = ownFiles(draft);
    const borrowed = referencedFiles(draft);
    const totalBytes = own.reduce((sum, file) => sum + file.size, 0);
    const longFiles = own.filter(file => file.duration > 42);
    const categories = [...new Set(own.map(file => file.category || 'General'))];
    const license = licenseStatement(draft.license.choice, draft.license.custom);
    const discord = (draft.links.handles.discord || '').trim();
    const links = buildLinkEntries(draft.links.handles, draft.links.website, draft.links.custom);
    const presets = submittablePresets(draft);
    const ids = presetIdsFor(draft);

    const parts: string[] = [
        `# Submission — ${details.name.trim() || presets[0]?.name.trim() || 'untitled'}`,
        '',
        `Built with the Spotykach WAV Builder submission tool on ${new Date().toISOString().split('T')[0]}.`,
        '',
        '| | |',
        '|---|---|',
        `| **Artist** | ${details.artist.trim() || '_not given_'} |`,
        `| **Sending** | ${[wants.pack && 'sample pack', wants.preset && 'preset'].filter(Boolean).join(' + ') || '—'} |`,
    ];

    if (wants.pack) {
        parts.push(
            `| **Pack id** | \`${details.id || slugify(details.name)}\` |`,
            `| **New files** | ${own.length} in ${categories.length} categor${categories.length === 1 ? 'y' : 'ies'}, ${formatBytes(totalBytes)} |`,
        );
    }
    if (borrowed.length) {
        parts.push(`| **Reused from existing packs** | ${borrowed.length} (referenced, not attached) |`);
    }
    if (presets.length === 1) {
        parts.push(
            `| **Preset** | ${presets[0].name.trim() || '_unnamed_'} (\`${ids.get(presets[0].id)}\`) |`,
            `| **Slots filled** | ${presets[0].slots.filter(Boolean).length} of 36 |`,
        );
    } else if (presets.length > 1) {
        parts.push(`| **Presets** | ${presets.length} |`);
    }
    if (presets.length) {
        parts.push(
            `| **Required packs** | ${allRequiredPacks(draft).map(p => `\`${p}\``).join(', ') || '—'} |`,
        );
    }
    parts.push(`| **Licence** | ${license || '_not stated_'} |`, '');

    if (wants.pack && own.length) {
        parts.push(
            '## The audio is in this archive',
            '',
            `\`audio/\` holds all ${own.length} new file${own.length === 1 ? '' : 's'} — ${formatBytes(totalBytes)} — ` +
            'with the categories as folders. Nothing has been re-encoded: these are the masters to ' +
            'normalize from.',
            '',
            `Filenames are the **${draft.audioNaming === 'title' ? 'titles given below' : 'artist’s original filenames'}**.`,
            '',
        );
    }

    if (borrowed.length) {
        parts.push(
            '## Samples reused from packs already in the app',
            '',
            'These are **not** in this archive and must not be deployed again — the preset references ' +
            'them where they already live. Listed so the dependency is visible.',
            '',
            '| Sample | Pack | Path |',
            '|---|---|---|',
            ...borrowed.map(file =>
                `| ${file.title} | \`${file.origin || '?'}\` | \`${toManifestPath(file.sourceSamplePath || '')}\` |`,
            ),
            '',
        );
    }

    if (details.cover) {
        parts.push(
            '## Cover',
            '',
            `\`${details.cover.fileName}\` — ${details.cover.width}×${details.cover.height}, in this archive as \`cover\`.`,
            '',
        );
    } else if (wants.pack) {
        parts.push(
            '## Cover',
            '',
            '_None supplied._ The pack will show as a plain card until artwork arrives.',
            '',
        );
    }

    parts.push('## Reaching me', '');
    if (discord) parts.push(`- **Discord:** ${discord}`);
    links
        .filter(link => link.label !== PLATFORMS_BY_ID.discord.label)
        .forEach(link => parts.push(`- **${link.label}:** ${link.url}`));
    if (!discord && links.length === 0) parts.push('_No links given._');
    parts.push('');

    if (draft.notes.trim()) {
        parts.push('## Notes from the artist', '', draft.notes.trim(), '');
    }

    // Each preset, with its notes reproduced so they can be read without opening a
    // descriptor. They are the half of a preset that a JSON diff makes invisible.
    presets.forEach(preset => {
        const id = ids.get(preset.id);
        const filled = preset.slots.filter(Boolean).length;
        const packs = requiredPacksFor(draft, preset);

        parts.push(
            `## Preset — ${preset.name.trim() || '_unnamed_'}`,
            '',
            `\`${id}.json\` · ${filled} of 36 slots · needs ${packs.map(p => `\`${p}\``).join(', ') || '—'}`,
            '',
        );

        const description = presetDescriptionFor(draft, preset).trim();
        if (description) parts.push(description, '');

        // Says which of the three levels this preset landed on, because the answer
        // decides whether there is a file to deploy or only a path to reuse.
        if (preset.cover) {
            parts.push(
                `_Artwork:_ \`presets/${id}-cover.${coverExtension(preset.cover.fileName)}\` ` +
                `(${preset.cover.width}×${preset.cover.height}), in this archive.`,
                '',
            );
        } else if (presetCoverPath(draft, preset, id || '')) {
            parts.push('_Artwork:_ the pack’s cover, reused. Nothing extra to deploy.', '');
        } else {
            parts.push('_Artwork:_ none — the Preset door draws a gradient for it.', '');
        }

        const presetNotes = preset.projectNotes.trim();
        if (presetNotes) parts.push('**Notes**', '', presetNotes, '');

        TAPE_COLORS.forEach((color, i) => {
            const note = (preset.tapeNotes[i] || '').trim();
            if (note) parts.push(`**${color} tape**`, '', note, '');
        });
    });

    if (longFiles.length) {
        parts.push(
            '## Files over 42 seconds',
            '',
            'Submitted knowingly — the hardware plays the first 42 seconds and users can pick a ' +
            'different part in the editor.',
            '',
            ...longFiles.map(file => `- \`${file.fileName}\` — ${file.duration.toFixed(1)}s`),
            '',
        );
    }

    if (draft.rejected.length) {
        parts.push(
            '## Files the tool could not read',
            '',
            ...draft.rejected.map(entry => `- \`${entry.fileName}\` — ${entry.reason}`),
            '',
        );
    }

    if (wants.pack && own.length) {
        parts.push(
            '## File list',
            '',
            'Paths are where each sample lands in the bucket after normalization to FLAC.',
            '',
            '| Title | Category | Source file | Length |',
            '|---|---|---|---|',
            ...own.map(file =>
                `| ${file.title} | ${file.category || 'General'} | \`${file.fileName}\` | ` +
                `${file.duration ? `${file.duration.toFixed(1)}s` : '—'} |`,
            ),
            '',
        );
    }

    parts.push(
        '## For the maintainer',
        '',
        '- `audio/` — the new samples, unmodified, categories as folders.',
        '- `submission.json` — the artist’s own working copy, so they can reopen this archive in the ' +
        'submission tool and change something. Nothing to deploy; ignore it.',
        '- `manifest-entry.json` — the `packs[]` entry, ready to paste. Sample paths assume the ' +
        'filenames are kept and the audio is normalized to `.flac`.',
        '- `README.md` — the same metadata as pack-folder frontmatter, for `generate-manifest.mjs`.',
    );
    if (presets.length) {
        parts.push(
            `- \`presets/\` — ${presets.length === 1 ? 'the descriptor' : `${presets.length} descriptors`}, ` +
            'for `public/presets/`.',
            '- `preset-entries.json` — the `presets[]` entries. `coverImage` and `sdExportUrl` are still ' +
            'yours to fill in.',
        );
    }
    parts.push(
        '',
        '---',
        '',
        `Sent to \`${DISCORD_HANDLE}\` on Discord, or ${submissionEmail()}.`,
        '',
    );

    return parts.join('\n');
};

/** The tool's own download, kept out of `exportUtils` — nothing else needs it. */
export const downloadBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    // Revoked on the next tick: revoking synchronously beats the download to the URL
    // in Safari, and the click has only queued the fetch at this point.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** Handle-only platforms render as text; everything else is a link. */
export const linkHref = (platformId: string, url: string): string | undefined =>
    isHandleOnly(platformId) ? undefined : url;
