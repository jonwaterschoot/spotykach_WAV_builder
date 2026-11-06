import { CREDIT_PREFIX, licenseStatement } from './licenses.ts';
import { archive } from './providers/archive.ts';
import { citizendj } from './providers/citizendj.ts';
import { commons } from './providers/commons.ts';
import { freesound } from './providers/freesound.ts';
import { nasa } from './providers/nasa.ts';
import { openverse } from './providers/openverse.ts';
import type { OnlineHit, OnlineProvider, ProviderId } from './types.ts';

/** In the order the panel lists them: the broadest keyless index first. */
export const PROVIDERS: OnlineProvider[] = [openverse, commons, archive, nasa, citizendj, freesound];

export const PROVIDERS_BY_ID = Object.fromEntries(PROVIDERS.map(p => [p.id, p])) as Record<ProviderId, OnlineProvider>;

/** Freesound included: it is skipped anyway while there is neither a key nor the proxy. */
export const DEFAULT_PROVIDERS: ProviderId[] = ['openverse', 'commons', 'archive', 'nasa', 'citizendj', 'freesound'];

/**
 * The archives there were before saved preferences recorded which ones a browser
 * had seen. Any other default archive is new to such a browser, and starts on.
 */
export const PROVIDERS_BEFORE_KNOWN: ProviderId[] = ['openverse', 'commons', 'archive', 'nasa', 'freesound'];

/** "Online · Freesound": the `origin` an imported sound carries. */
export const originFor = (hit: OnlineHit): string =>
    `Online · ${hit.via ?? PROVIDERS_BY_ID[hit.provider].label}`;

/**
 * The license text stored with an imported sound: the statement `classifyLicense`
 * reads, then the credit. The mangler copies the credit line into every result
 * that uses the sound, which is the attribution CC-BY asks for.
 */
export const licenseTextFor = (hit: OnlineHit): string => {
    const via = hit.via ? `${hit.via} via ${PROVIDERS_BY_ID[hit.provider].label}` : PROVIDERS_BY_ID[hit.provider].label;
    // One line, license URL included: `classifyLicense` skips it whole, so neither a
    // title nor a URL can be read as terms.
    const terms = hit.license.url ? `, ${hit.license.label} ${hit.license.url}` : '';
    // The archive's own suggested credit, on the same line so it is never read as terms.
    const asked = hit.credit ? `. ${hit.credit.replace(/\.$/, '')}` : '';
    return [
        licenseStatement(hit.license),
        `${CREDIT_PREFIX} "${hit.title}" by ${hit.author}, ${hit.pageUrl} (${via})${terms}${asked}`,
    ].join('\n');
};

/**
 * One sound can arrive twice: Openverse indexes Freesound and Commons, which are
 * also searched directly. The file URL is the same either way, so it is the key.
 */
export const dedupeKey = (hit: OnlineHit): string | null =>
    hit.url
        ? hit.url.split('?')[0].replace(/^https?:\/\//, '').replace(/\/transcoded\/(.+?)\/[^/]+$/, '/$1').toLowerCase()
        : null;

export * from './types.ts';
export * from './licenses.ts';
export { createBudget, type Budget, type BudgetState } from './budget.ts';
