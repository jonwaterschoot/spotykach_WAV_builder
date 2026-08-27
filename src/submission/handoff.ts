import { TAPE_COLORS, type AppState } from '../types';
import { saveSubmissionHandoffToDB } from '../utils/persistence';
import { GRID_CAPACITY } from '../utils/detachedState';
import {
    emptyPreset, newId, titleFromFileName, type SubmissionDraft, type SubmissionFile,
} from './draft';

/**
 * The parcel one mode leaves for the submission tool.
 *
 * Browse's pool and a Studio project both already hold exactly what step 2 asks
 * for, and asking someone to export their project and drop the file back into the
 * same app would be the app failing to talk to itself. So they write this, change
 * the hash, and the tool picks it up on arrival.
 *
 * It goes through IndexedDB rather than through props or a context because the two
 * ends never exist at once: `ModeRouter` unmounts Studio to mount the tool. Blobs
 * survive that trip in IDB and would not survive a query string.
 */
export interface SubmissionHandoff {
    source: 'pool' | 'studio';
    files: SubmissionFile[];
    /** 36 entries of `SubmissionFile.id`, when the sender had a layout worth keeping. */
    slots?: (string | null)[];
    tapeNotes?: (string | undefined)[];
    projectNotes?: string;
    /** The project or pool name, offered as a starting point for the pack's name. */
    suggestedName?: string;
}

/**
 * Fold a parcel into whatever draft was already there.
 *
 * The rule: **files are added, typed text is never overwritten.** Someone who has
 * spent ten minutes on a bio and then sends a second folder over from Browse should
 * get their files, not a blank form. An empty draft is the easy case and takes the
 * parcel's suggestions wholesale.
 */
export const applyHandoff = (draft: SubmissionDraft, handoff: SubmissionHandoff): SubmissionDraft => {
    const existingKeys = new Set(draft.files.map(file => `${file.fileName}:${file.size}`));
    // Same name and same size twice is the same file arriving twice — someone
    // pressing the button in Browse a second time, most likely.
    const incoming = handoff.files.filter(file => !existingKeys.has(`${file.fileName}:${file.size}`));
    const files = [...draft.files, ...incoming];

    /*
     * A parcel's layout fills the *first* preset, and only if it is untouched.
     *
     * A project arriving from Studio is one layout, and it belongs in the slot the
     * artist is looking at. Landing it on a preset they had already filled in — or
     * adding a second one they never asked for — would both be surprises.
     */
    const [first, ...rest] = draft.presets.length ? draft.presets : [emptyPreset()];
    const takesLayout = !!handoff.slots && first.slots.every(slot => !slot);

    return {
        ...draft,
        files,
        details: {
            ...draft.details,
            name: draft.details.name || handoff.suggestedName || '',
        },
        presets: [
            {
                ...first,
                slots: takesLayout
                    ? Array.from({ length: GRID_CAPACITY }, (_, i) => handoff.slots?.[i] ?? null)
                    : first.slots,
                name: first.name || (handoff.source === 'studio' ? handoff.suggestedName || '' : ''),
                tapeNotes: first.tapeNotes.some(Boolean)
                    ? first.tapeNotes
                    : handoff.tapeNotes || first.tapeNotes,
                projectNotes: first.projectNotes || handoff.projectNotes || '',
            },
            ...rest,
        ],
        // A project arriving from Studio is a layout, so the preset half is the reason
        // it came. The pack half stays at its default so the choice is still made
        // rather than assumed - some projects are worth sharing as a layout only.
        wants: handoff.source === 'studio'
            ? { ...draft.wants, preset: true }
            : draft.wants,
        // Step 1, not step 2.
        //
        // It skipped ahead at first, on the reasoning that the parcel had answered the
        // question already. It hadn't: a project can become a pack, a preset, or both,
        // and dropping someone straight into a file list they did not assemble left the
        // most consequential choice in the tool made silently on their behalf. Everyone
        // walks the same line of questions, whichever door they came through.
        step: 1,
    };
};

/**
 * Studio's side: a live project, flattened into rows the tool understands.
 *
 * The current version of each file, not the original — a project's files have been
 * trimmed, EQ'd and pitched on purpose, and the pre-edit version is not what anyone
 * means by "submit this". Parked files come too: they are part of the pack even
 * when they didn't make the grid.
 */
export const handoffFromAppState = async (
    state: AppState,
    projectName: string,
): Promise<SubmissionHandoff> => {
    const files: SubmissionFile[] = [];
    /** Project file id → the row id we minted for it. */
    const idMap = new Map<string, string>();

    for (const [fileId, record] of Object.entries(state.files)) {
        const version =
            record.versions.find(v => v.id === record.currentVersionId) ?? record.versions[0];
        if (!version?.blob) continue;

        const rowId = newId();
        idMap.set(fileId, rowId);

        const fileName = record.originalName || `${record.name}.wav`;
        files.push({
            id: rowId,
            fileName,
            title: titleFromFileName(fileName),
            category: 'General',
            duration: version.duration || 0,
            size: version.blob.size,
            blob: version.blob,
            origin: record.origin,
            license: record.license,
            sourceSamplePath: record.sourceSamplePath,
        });
    }

    const slots: (string | null)[] = [];
    const tapeNotes: (string | undefined)[] = [];
    TAPE_COLORS.forEach(color => {
        const tape = state.tapes[color];
        tapeNotes.push(tape?.notes);
        for (let slot = 1; slot <= 6; slot++) {
            const fileId = tape?.slots?.find(s => s.id === slot)?.fileId;
            slots.push((fileId && idMap.get(fileId)) || null);
        }
    });

    return {
        source: 'studio',
        files,
        slots,
        tapeNotes,
        projectNotes: state.projectNotes,
        suggestedName: projectName,
    };
};

/** Leave the parcel. The caller changes the hash; the tool takes it from there. */
export const sendToSubmissionTool = async (handoff: SubmissionHandoff): Promise<void> =>
    saveSubmissionHandoffToDB(handoff);
