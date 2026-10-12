import { classifyLicense, type LicenseClass, type LicenseLevel } from '../submission/licenses';
import { usedSources, type MangleRecipe, type RecipeSource } from './recipe';

/**
 * Licenses for the mangler. A result follows the sources it actually uses (the
 * dice may never have picked the strict one), and takes the strictest of them.
 * Decided Oct 11: a no-derivatives source blocks every save route.
 */

/** Files from the user's own disk: theirs, so no limits. */
export const LOCAL_ORIGINS = ['Local file', 'Local Folder'];

export const sourceLicense = (source: { origin: string; license?: string }): LicenseClass =>
    LOCAL_ORIGINS.includes(source.origin) && !source.license?.trim()
        ? { level: 'open', shareAlike: false, attribution: false }
        : classifyLicense(source.license);

const RANK: Record<LicenseLevel, number> = { open: 0, personal: 1, 'no-derivatives': 2 };

export const LEVEL_LABEL: Record<LicenseLevel, string> = {
    open: 'Open',
    personal: 'Personal use',
    'no-derivatives': 'No derivatives',
};

export interface ResultLicense {
    level: LicenseLevel;
    /** The sources that stop it being saved. Empty unless the level is no-derivatives. */
    blockedBy: RecipeSource[];
    /** Written into the saved file's record: level, then every source and its terms. */
    text: string;
}

const shortTerms = (license?: string) => {
    const first = (license ?? '').split('\n')[0].trim();
    return first.length > 80 ? `${first.slice(0, 77)}…` : first;
};

export function resultLicense(recipe: MangleRecipe): ResultLicense {
    const used = usedSources(recipe);
    let level: LicenseLevel = 'open';
    let shareAlike = false;
    const blockedBy: RecipeSource[] = [];
    for (const s of used) {
        const c = sourceLicense(s);
        if (RANK[c.level] > RANK[level]) level = c.level;
        if (c.shareAlike) shareAlike = true;
        if (c.level === 'no-derivatives') blockedBy.push(s);
    }

    const lines = [
        level === 'personal'
            ? 'Sample Mangler result. Personal use: fine in your own music, but do not redistribute it as a sample.'
            : level === 'open'
                ? 'Sample Mangler result. Credit the sources below where their licenses ask for it.'
                : 'Sample Mangler result. Uses a no-derivatives source and may not be shared.',
    ];
    if (shareAlike) lines.push('Share-alike: anything made from this carries the same terms as those sources.');
    lines.push('Sources:');
    for (const s of used) {
        const terms = shortTerms(s.license) || (LOCAL_ORIGINS.includes(s.origin) ? 'own file' : 'no license given');
        lines.push(`- ${s.name} (${s.origin}): ${terms}`);
    }
    return { level, blockedBy, text: lines.join('\n') };
}
