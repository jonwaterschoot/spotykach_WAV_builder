import { GRID_CAPACITY } from '../utils/detachedState';
import { licenseStatement } from './licenses';
import { isOwnFile, ownFiles, type SubmissionDraft, type SubmissionFile } from './draft';

/**
 * The hardware's per-sample ceiling. Audio past this is ignored by the firmware —
 * the file is still perfectly valid, and the editor still shows all of it, so this
 * is a warning and never a rejection.
 */
export const HARDWARE_MAX_SECONDS = 42;

/** What the firmware will accept as a slot name once the app has sanitized it. */
const sanitizeSlotName = (name: string) =>
    name.trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9.\-_]/g, '').replace(/\.[^/.]+$/, '');

/**
 * How small a sample pack may be.
 *
 * Not a technical limit — one sample deploys as happily as fifty. It is about what a
 * pack *is*: a page in the browser with cover art, a bio, links and a licence, which
 * three sounds cannot fill without looking like a mistake. Ten is the point where a
 * pack reads as a pack.
 *
 * The number also draws the line the whole tool turns on. Below it, the honest answer
 * is usually not "a smaller pack" but "this isn't a pack" — see `PACK_MINIMUM_HINT`.
 */
export const PACK_MINIMUM_SAMPLES = 10;

/**
 * How large before it is worth a conversation.
 *
 * A warning, never a refusal. Three hundred good sounds are a gift, but they are also
 * a browser page nobody scrolls, a normalization run measured in hours, and a decision
 * about categories that is better made before the audio is sent than after. The three
 * packs shipping today hold 26, 29 and 36.
 */
export const PACK_MAXIMUM_SAMPLES = 100;

export type IssueLevel = 'warn' | 'error';

export interface FileIssue {
    level: IssueLevel;
    /** Short enough to sit in a table cell. */
    label: string;
    detail: string;
}

/**
 * Everything wrong with one file, in the words the artist needs.
 *
 * `duplicates` is passed in rather than recomputed per row: a collision is a
 * property of the set, and asking each file about it would be quadratic over a
 * pack that is allowed to hold three hundred of them.
 */
export const issuesForFile = (
    file: SubmissionFile,
    duplicateTitles: Set<string>,
): FileIssue[] => {
    const issues: FileIssue[] = [];

    if (file.duration > HARDWARE_MAX_SECONDS) {
        issues.push({
            level: 'warn',
            label: 'over 42s',
            detail:
                `${file.duration.toFixed(1)}s. The hardware plays the first ${HARDWARE_MAX_SECONDS} ` +
                'seconds; the rest is ignored. Users can still pick a different part of it in the editor, ' +
                'so long files are welcome — this is only so you know what the device does with them.',
        });
    }

    if (!sanitizeSlotName(file.title)) {
        issues.push({
            level: 'error',
            label: 'no usable name',
            detail:
                'Nothing survives once this title is reduced to the characters the firmware allows. ' +
                'Give it a name with letters or numbers in it.',
        });
    }

    if (duplicateTitles.has(file.title.trim().toLowerCase())) {
        issues.push({
            level: 'warn',
            label: 'duplicate title',
            detail:
                'Another file in this pack has the same title. They will be told apart by their ' +
                'category, but two identical names in the browser are hard to choose between.',
        });
    }

    return issues;
};

/** Titles held by more than one file, lowercased for comparison. */
export const duplicateTitleSet = (files: SubmissionFile[]): Set<string> => {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    files.forEach(file => {
        const key = file.title.trim().toLowerCase();
        if (!key) return;
        if (seen.has(key)) duplicates.add(key);
        seen.add(key);
    });
    return duplicates;
};

/** One line on the review step's checklist. */
export interface Requirement {
    id: string;
    label: string;
    ok: boolean;
    /** Blocks the download when false. Warnings don't. */
    required: boolean;
    /** Which step to send them back to. */
    step: number;
    hint?: string;
}

/**
 * What the submission still needs.
 *
 * Ordered as the form is, so "fix the first red one" walks the artist forward
 * rather than bouncing them around. Nothing here fires while a step is being filled
 * in — this is read by step 6 and nowhere else, which is why the earlier steps can
 * stay quiet and let someone type in whatever order suits them.
 */
export const requirementsFor = (draft: SubmissionDraft): Requirement[] => {
    const { wants, files, details, license } = draft;
    const requirements: Requirement[] = [];
    const filled = (value: string) => value.trim().length > 0;

    if (wants.pack) {
        // Counted over the artist's own rows: a draft holding nothing but samples
        // borrowed from published packs is a preset, not a pack, however full the
        // list looks.
        const own = ownFiles(draft);
        requirements.push({
            id: 'files',
            label: 'At least one audio file of your own',
            ok: own.length > 0,
            required: true,
            step: 2,
            hint: own.length === 0 && files.length > 0
                ? 'Every file here comes from a pack that is already in the app. Add your own audio, or turn the sample pack off on step 1 and submit this as a preset.'
                : undefined,
        });
        requirements.push({
            id: 'pack-minimum',
            label: `At least ${PACK_MINIMUM_SAMPLES} samples`,
            ok: own.length === 0 || own.length >= PACK_MINIMUM_SAMPLES,
            required: true,
            step: 2,
            hint: own.length > 0 && own.length < PACK_MINIMUM_SAMPLES
                ? `${own.length} of ${PACK_MINIMUM_SAMPLES}. A pack gets its own page — cover, bio, links — and that many sounds cannot fill one. Add more, or see the note on step 1 about sharing a preset directly instead of publishing a pack.`
                : undefined,
        });
        requirements.push({
            id: 'pack-maximum',
            label: `Under ${PACK_MAXIMUM_SAMPLES} samples`,
            ok: own.length <= PACK_MAXIMUM_SAMPLES,
            required: false,
            step: 2,
            hint: own.length > PACK_MAXIMUM_SAMPLES
                ? `${own.length} is a lot to browse, to normalize and to categorise. Nothing stops you sending it — worth a word in the notes about how you would like it split, or trimming to the strongest ${PACK_MAXIMUM_SAMPLES}.`
                : undefined,
        });
        requirements.push({
            id: 'names',
            label: 'Every file has a usable title',
            ok: files.every(f => sanitizeSlotName(f.title)),
            required: true,
            step: 2,
        });
        requirements.push({
            id: 'pack-name',
            label: 'Pack name and id',
            ok: filled(details.name) && filled(details.id),
            required: true,
            step: 3,
        });
    }

    requirements.push({
        id: 'artist',
        label: 'Artist name',
        ok: filled(details.artist),
        required: true,
        step: 3,
    });
    requirements.push({
        id: 'short',
        label: 'Short description',
        ok: filled(details.shortDescription),
        required: true,
        step: 3,
        hint: 'One or two sentences — this is the line on the catalogue card.',
    });
    requirements.push({
        id: 'full',
        label: 'Full description',
        ok: filled(details.fullDescription),
        required: false,
        step: 3,
        hint: 'Shown in the pack’s info panel. Worth writing, not required.',
    });

    if (wants.pack) {
        requirements.push({
            id: 'cover',
            label: 'Cover image',
            ok: !!details.cover,
            required: false,
            step: 3,
            hint: 'Without one the pack shows as a plain card until artwork is supplied.',
        });
    }

    requirements.push({
        id: 'links',
        label: 'At least one link',
        ok:
            Object.values(draft.links.handles).some(h => h.trim()) ||
            filled(draft.links.website) ||
            draft.links.custom.some(c => c.label.trim() && c.url.trim()),
        required: false,
        step: 4,
        hint: 'How people find you from inside the app.',
    });

    requirements.push({
        id: 'license',
        label: 'Licence',
        ok: filled(licenseStatement(license.choice, license.custom)),
        required: true,
        step: 5,
        hint: license.choice === 'custom' ? 'Custom terms need to be written out.' : undefined,
    });

    if (wants.preset) {
        // Presets worth checking: named, or with something in their slots. A blank one
        // sitting at the end of the list is the "add another" affordance, not an error.
        const presets = draft.presets.filter(p => p.name.trim() || p.slots.some(Boolean));

        if (presets.length === 0) {
            requirements.push({
                id: 'preset-any',
                label: 'A preset with something in it',
                ok: false,
                required: true,
                step: 5,
                hint: 'You asked to send a preset on step 1. Name one and put a sample in a slot, or untick it there.',
            });
        }

        // The architecture, stated as a check.
        //
        // A published preset points at published audio: the descriptor holds paths, not
        // blobs, and the app resolves them against the sample bucket. So a slot holding
        // a sound of the artist's own only resolves if that sound is *also* being
        // published as part of a pack. Without this the preset built cleanly, validated
        // cleanly, and arrived with holes in exactly the slots the artist cared most
        // about.
        const ownInSlots = presets
            .flatMap(p => p.slots)
            .map(id => (id ? files.find(file => file.id === id) : undefined))
            .filter((file): file is SubmissionFile => !!file && isOwnFile(file));

        if (ownInSlots.length > 0) {
            requirements.push({
                id: 'preset-needs-pack',
                label: 'Your own samples are published with the preset',
                ok: wants.pack,
                required: true,
                step: 1,
                hint: wants.pack
                    ? undefined
                    : `${ownInSlots.length} slot${ownInSlots.length === 1 ? '' : 's'} use audio of your own. A preset can only point at sounds that are published, so those have to travel as a sample pack — tick it on step 1. If you would rather not publish them, share the preset directly instead: Studio’s Export makes a backup ZIP that carries the audio with it.`,
            });
        }

        // One pair of checks per preset. The label carries the name because with three
        // in the list, "Preset name" on its own says nothing about which.
        presets.forEach((p, index) => {
            const shown = p.name.trim() || `Preset ${index + 1}`;
            const usedSlots = p.slots.filter(Boolean).length;

            requirements.push({
                id: `preset-name-${p.id}`,
                label: presets.length > 1 ? `${shown} — name` : 'Preset name',
                ok: filled(p.name),
                required: true,
                step: 5,
                hint: filled(p.name) ? undefined : 'An unnamed preset has no id to be filed under.',
            });
            requirements.push({
                id: `preset-slots-${p.id}`,
                label: presets.length > 1
                    ? `${shown} — slots (${usedSlots}/${GRID_CAPACITY})`
                    : `Slots filled (${usedSlots}/${GRID_CAPACITY})`,
                ok: usedSlots > 0,
                required: true,
                step: 5,
                hint:
                    usedSlots > 0 && usedSlots < GRID_CAPACITY
                        ? 'Empty slots are allowed — they arrive on the card as empty slots.'
                        : undefined,
            });
        });

        // Two presets filed under one id would overwrite each other, in the archive
        // and in `public/presets/`. The tool disambiguates on the way out, but a name
        // collision almost always means two things the artist thinks are different.
        const names = presets.map(p => p.name.trim().toLowerCase()).filter(Boolean);
        requirements.push({
            id: 'preset-names-distinct',
            label: 'Preset names are different from each other',
            ok: new Set(names).size === names.length,
            required: false,
            step: 5,
            hint: new Set(names).size === names.length
                ? undefined
                : 'Two presets share a name. They will be filed under different ids anyway, but nobody browsing them will be able to tell which is which.',
        });
    }

    return requirements;
};

export const blockingRequirements = (draft: SubmissionDraft): Requirement[] =>
    requirementsFor(draft).filter(r => r.required && !r.ok);

/**
 * What a step's mark in the rail should say.
 *
 * `done`    — this step has everything it needs.
 * `missing` — it was walked past and something required is still absent.
 * `empty`   — nothing has been put into it yet, and nobody has been asked to.
 */
export type StepState = 'done' | 'missing' | 'empty';

/**
 * Per-step completion, read off the content rather than off the position.
 *
 * The rail used to tick every step behind the current one, which meant clicking
 * through to step 3 without typing a word produced two green checks and a form that
 * looked finished. A tick has to mean *this step has what it needs* or it means
 * nothing at all — and a step walked past with a hole in it is worth saying so
 * about, quietly, rather than either lying about it or waiting until step 6.
 */
export const stepStates = (draft: SubmissionDraft): Record<number, StepState> => {
    const requirements = requirementsFor(draft);
    const requiredFor = (step: number) => requirements.filter(r => r.step === step && r.required);
    const optionalFor = (step: number) => requirements.filter(r => r.step === step && !r.required);

    /** Walked past, so a hole in it is something the artist has already skipped. */
    const seen = (step: number) => draft.step > step;

    const fromRequirements = (step: number, hasSubstance: boolean): StepState => {
        const required = requiredFor(step);
        if (required.length > 0) {
            if (required.every(r => r.ok)) return 'done';
            return seen(step) && hasSubstance ? 'missing' : 'empty';
        }
        // Steps that ask for nothing mandatory — Links — are done once they hold
        // something, and never wrong for holding nothing.
        return optionalFor(step).some(r => r.ok) ? 'done' : 'empty';
    };

    const hasFiles = draft.files.length > 0;
    const details = draft.details;
    const detailsTouched = !!(details.artist || details.name || details.shortDescription || details.fullDescription);

    /**
     * Step 2 has required entries only while the pack half is on. A preset-only
     * submission still needs samples to put in slots, so the floor is the same
     * either way and the requirement list alone would call an empty step finished.
     */
    const audioState = (): StepState => {
        if (!hasFiles) return seen(2) ? 'missing' : 'empty';
        const state = fromRequirements(2, true);
        return state === 'empty' ? 'done' : state;
    };

    return {
        // Step 1 is answered from the first render: the defaults are a real answer,
        // and the only way to make it unanswered is to untick all three.
        1: (draft.wants.pack || draft.wants.preset || draft.wants.sd) ? 'done' : 'missing',
        // Step 2 always needs audio, whether or not the pack half asked for it — a
        // preset with no samples in it is not a preset.
        2: audioState(),
        3: fromRequirements(3, detailsTouched),
        4: fromRequirements(4, true),
        5: fromRequirements(5, true),
        // The destination. Nothing is filled in here that the checklist above it
        // doesn't already account for.
        6: 'empty',
    };
};
