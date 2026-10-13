/**
 * Licenses as the online archives report them, turned into the wording the rest
 * of the app reads.
 *
 * Every archive spells a license its own way: Openverse sends `by-sa` + `3.0`,
 * Commons sends `cc-by-sa-4.0` or "Public domain", the Internet Archive and
 * Freesound send the Creative Commons URL. They all end up as one `OnlineLicense`,
 * and its `statement` is written so `classifyLicense` (src/submission/licenses.ts)
 * sorts it into the right level without new rules.
 */

/** What the filter chips choose between. ND never gets this far. */
export type LicenseFilter = 'pd' | 'by' | 'by-sa' | 'nc';

export const LICENSE_FILTERS: { id: LicenseFilter; label: string; title: string }[] = [
    { id: 'pd', label: 'CC0 / PD', title: 'Public domain and CC0: no limits, no credit needed' },
    { id: 'by', label: '+ BY', title: 'CC-BY: any use, credit the author' },
    { id: 'by-sa', label: '+ BY-SA', title: 'CC-BY-SA: credit the author; what you make carries the same license' },
    { id: 'nc', label: '+ NC', title: 'Non-commercial: fine in music you give away, not in music you sell' },
];

export const DEFAULT_LICENSE_FILTERS: LicenseFilter[] = ['pd'];

export interface OnlineLicense {
    filter: LicenseFilter;
    /** Short name for the badge, e.g. "CC BY-SA 4.0". */
    label: string;
    url?: string;
}

const PD_LABELS: Record<string, string> = {
    zero: 'CC0 1.0',
    mark: 'Public Domain Mark 1.0',
};

/** "by-nc-sa" + "4.0" → the license, or null for ND and anything unknown. */
export function fromCcCode(code: string, version?: string, url?: string): OnlineLicense | null {
    const c = code.toLowerCase().replace(/^cc[- ]?/, '').trim();
    const v = version ? ` ${version}` : '';
    if (c === '0' || c === 'zero' || c === 'cc0') return { filter: 'pd', label: `CC0${v || ' 1.0'}`, url };
    if (c === 'pdm' || c === 'mark') return { filter: 'pd', label: `Public Domain Mark${v || ' 1.0'}`, url };
    // `pd`, and CC's retired `licenses/publicdomain/` dedication (still on old Archive items).
    if (c === 'pd' || c === 'publicdomain') return { filter: 'pd', label: 'Public domain', url };
    if (c.startsWith('sampling')) return { filter: 'nc', label: `Sampling+${v}`, url };

    const parts = c.split('-');
    if (!parts.includes('by')) return null;
    if (parts.includes('nd')) return null;
    const filter: LicenseFilter = parts.includes('nc') ? 'nc' : parts.includes('sa') ? 'by-sa' : 'by';
    return { filter, label: `CC ${parts.join('-').toUpperCase()}${v}`, url };
}

/** A creativecommons.org URL → the license, or null. */
export function fromCcUrl(raw: string | undefined | null): OnlineLicense | null {
    if (!raw) return null;
    const url = raw.trim();
    const m = /creativecommons\.org\/(licenses|publicdomain)\/([a-z+-]+)(?:\/([\d.]+))?/i.exec(url);
    if (!m) return null;
    const normalized = url.replace(/^http:/, 'https:');
    if (m[1].toLowerCase() === 'publicdomain') {
        const kind = m[2].toLowerCase();
        if (!PD_LABELS[kind]) return null;
        return { filter: 'pd', label: PD_LABELS[kind], url: normalized };
    }
    return fromCcCode(m[2], m[3], normalized);
}

/**
 * Commons' own spellings: `License` is a code (`cc-by-sa-4.0`, `cc0`, `pd`), with
 * `LicenseShortName` ("Public domain") and `LicenseUrl` as fallbacks.
 */
export function fromCommons(code?: string, shortName?: string, url?: string): OnlineLicense | null {
    const byUrl = fromCcUrl(url);
    if (byUrl) return byUrl;
    const c = (code ?? '').toLowerCase();
    if (c === 'cc0') return { filter: 'pd', label: 'CC0 1.0', url };
    if (c === 'pd' || c.startsWith('pd-') || /public domain/i.test(shortName ?? '')) {
        return { filter: 'pd', label: 'Public domain', url };
    }
    const m = /^cc-([a-z-]+?)-([\d.]+)$/.exec(c);
    if (m) return fromCcCode(m[1], m[2], url);
    return null;
}

/**
 * The line `classifyLicense` reads. Same sentences as `LICENSE_CHOICES` where one
 * exists, so a pack and an online sound with the same license read the same.
 */
export function licenseStatement(l: OnlineLicense): string {
    switch (l.filter) {
        case 'pd':
            return `${l.label}: public domain. No attribution required.`;
        case 'by':
            return `${l.label}: free to use, including commercially, with attribution.`;
        case 'by-sa':
            return `${l.label}: free to use with attribution; derivatives share the same license.`;
        case 'nc':
            return l.label.startsWith('Sampling+')
                ? `${l.label}: may be sampled; not to be redistributed as is.`
                : `${l.label}: non-commercial use only, with attribution.`;
    }
}

/**
 * The prefix of the credit line under the statement. `classifyLicense` skips such
 * lines, so a title or a name ("SA Recordings", "personal use only") can never
 * change the level.
 */
export const CREDIT_PREFIX = 'Credit:';
