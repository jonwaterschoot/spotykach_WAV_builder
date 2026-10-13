/**
 * The licence menu.
 *
 * A short list rather than a text box, because "what licence?" answered freely
 * produces things like *"free to use"* — which reads as permission and settles
 * nothing about resale, attribution or commercial work. Each entry here carries the
 * full statement that gets written into the pack's README and into the app's pack
 * card, so what the user of a sample eventually reads is a sentence someone chose,
 * not a phrase someone typed.
 *
 * `custom` is kept for the artist whose terms genuinely aren't on the list, and its
 * text is required before the submission is complete.
 */
export interface LicenseChoice {
    id: string;
    /** The short name, shown on the pack card. */
    label: string;
    /** The one-line statement written into the outputs. */
    statement: string;
    /** What it means in plain words, under the radio button. */
    summary: string;
    url?: string;
}

export const LICENSE_CHOICES: LicenseChoice[] = [
    {
        id: 'cc0',
        label: 'CC0 1.0',
        statement: 'CC0 1.0 — dedicated to the public domain. No attribution required.',
        summary: 'Anyone can do anything with these, forever, without crediting you.',
        url: 'https://creativecommons.org/publicdomain/zero/1.0/',
    },
    {
        id: 'cc-by-4.0',
        label: 'CC-BY 4.0',
        statement: 'CC-BY 4.0 — free to use, including commercially, with attribution.',
        summary: 'Any use, including in music that is sold, as long as you are credited.',
        url: 'https://creativecommons.org/licenses/by/4.0/',
    },
    {
        id: 'cc-by-sa-4.0',
        label: 'CC-BY-SA 4.0',
        statement: 'CC-BY-SA 4.0 — free to use with attribution; derivatives share the same licence.',
        summary: 'As CC-BY, but anything built from these carries the same terms.',
        url: 'https://creativecommons.org/licenses/by-sa/4.0/',
    },
    {
        id: 'cc-by-nc-4.0',
        label: 'CC-BY-NC 4.0',
        statement: 'CC-BY-NC 4.0 — non-commercial use only, with attribution.',
        summary: 'Fine in music given away or shared; not in music that is sold.',
        url: 'https://creativecommons.org/licenses/by-nc/4.0/',
    },
    {
        id: 'music-no-resale',
        label: 'Free for music, no resale',
        statement:
            'Free to use in your own music, commercial or not. Not to be resold, redistributed or ' +
            'included in another sample pack.',
        summary: 'The usual sample-pack terms: make what you like, don’t sell the samples on.',
    },
    {
        id: 'custom',
        label: 'Custom',
        statement: '',
        summary: 'Your own terms, written out in full below.',
    },
];

export const LICENSES_BY_ID: Record<string, LicenseChoice> =
    Object.fromEntries(LICENSE_CHOICES.map(l => [l.id, l]));

/** The statement that goes into the outputs — the custom text when that's the choice. */
export const licenseStatement = (choice: string, custom: string): string => {
    if (choice === 'custom') return custom.trim();
    return LICENSES_BY_ID[choice]?.statement || '';
};

/**
 * How far a sample may travel once it is cut up and reused — what the Sample
 * Mangler needs to know about each source.
 *
 * - `open`: CC0, CC-BY, CC-BY-SA, WTFPL. No limits; attribution and SA carry over.
 * - `personal`: usable in your own music, not to be passed on as a sample
 *   (`music-no-resale`, NC, "no resale", "not to be redistributed").
 * - `no-derivatives`: may not be modified at all, so a result using it can't be saved.
 */
export type LicenseLevel = 'open' | 'personal' | 'no-derivatives';

export interface LicenseClass {
    level: LicenseLevel;
    /** Share-alike: a result carries the same terms. */
    shareAlike: boolean;
    /** Credit required. */
    attribution: boolean;
}

/**
 * Sorts free license text into a level. Pack licenses are stored as text (the
 * statements above, or custom terms), so this reads words, and when in doubt it
 * answers `personal`, never `open`. Empty text is the caller's call: a local file
 * is the user's own, a pack with no terms is not.
 */
export function classifyLicense(text: string | undefined | null): LicenseClass {
    // A "Credit:" line names a title and an author (online sounds carry one, see
    // src/online/licenses.ts). Their words are not terms, and "SA Recordings" must
    // not read as share-alike.
    const t = (text ?? '')
        .split('\n')
        .filter(line => !/^\s*credit:/i.test(line))
        .join('\n')
        .toLowerCase();
    const shareAlike = /(^|[^a-z])sa([^a-z]|$)|share[- ]?alike|same licen[cs]e/.test(t);
    const attribution = /cc[- ]?by|attribution|credit/.test(t) && !/no attribution/.test(t);

    if (/(^|[^a-z])nd([^a-z]|$)|no[- ]?deriv|noderiv|no modification|not be modified|may not (be )?(modif|alter|remix)/.test(t)) {
        return { level: 'no-derivatives', shareAlike, attribution };
    }
    if (/(^|[^a-z])nc([^a-z]|$)|non-?commercial|no[- ]?resal|no[- ]?resell|not (to )?be (re)?sold|resold|redistribut|personal use/.test(t)) {
        return { level: 'personal', shareAlike, attribution };
    }
    if (/cc0|public domain|cc[- ]?by|creative commons attribution|wtfpl|do what the f/.test(t)) {
        return { level: 'open', shareAlike, attribution };
    }
    return { level: 'personal', shareAlike, attribution };
}
