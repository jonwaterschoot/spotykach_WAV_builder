import type { TapeColor } from '../types';
import { TAPE_COLORS } from '../types';
import { completeProjectConfig } from './configText';
import { hashBlob } from './assetUtils';
import { librarySamplePath, readVersionAudio, type ProjectManifest, type ProjectReader } from './projectFile';

/*
 * Whether a project file holds the project already in the work folder: what an
 * import with a taken name finds out before it replaces that project or goes in
 * beside it (step 3 of docs/import-export-plan.md). Reads the two manifests, and
 * audio only where they don't settle it.
 */

/** A project to compare: its manifest, and where its audio is read from. */
export interface ProjectSide {
    manifest: ProjectManifest;
    read: ProjectReader;
}

export interface ProjectDifference {
    /** Slots whose audio, name or slices differ, as "B2", in tape order. */
    slots: string[];
    /** Files in no slot that one side has and the other hasn't, or has changed. */
    pool: number;
    /** The project's notes or a tape's. */
    notes: boolean;
    /** The config.txt settings. */
    config: boolean;
}

/** One file, as either kind of manifest describes it. */
interface Comparable {
    name: string;
    /**
     * project.json only: a version id names one version's audio for good, because an
     * edit makes a new version. An old Project Manager zip numbers its own.
     */
    versionId?: string;
    /** The pack path, when the current version is an unedited library sample. */
    libraryPath?: string;
    /** SHA-256 of the current version, when the manifest stored one. */
    hash?: string;
    slicePoints: string;
    tempo?: number;
    /** The current version's audio. */
    audio: () => Promise<Blob | null>;
}

type Tapes = Partial<Record<TapeColor, { slots?: Array<{ id: number; fileId: string | null }>; notes?: string }>>;

const comparables = ({ manifest, read }: ProjectSide): Map<string, Comparable> => {
    const files = new Map<string, Comparable>();
    if (manifest.kind === 'project') {
        for (const [id, file] of Object.entries(manifest.data.files)) {
            const versions = file.versions ?? [];
            const current = versions.find(v => v.id === file.currentVersionId) ?? versions[versions.length - 1];
            if (!current) continue;
            // As the project file decides what to leave out (projectFile.ts).
            const unedited = current === versions[0] && !current.processing?.length;
            files.set(id, {
                name: file.name,
                versionId: current.id,
                libraryPath: unedited ? librarySamplePath(file.sourceSamplePath) ?? current.samplePath : undefined,
                hash: current.hash,
                slicePoints: JSON.stringify(file.metadata?.slicePoints ?? []),
                tempo: file.metadata?.tempo,
                audio: () => readVersionAudio(current, read),
            });
        }
    } else {
        for (const [id, entry] of Object.entries(manifest.data.files)) {
            files.set(id, {
                name: entry.originalName,
                libraryPath: librarySamplePath(entry.samplePath) ?? undefined,
                slicePoints: JSON.stringify(entry.slicePoints ?? []),
                audio: async () => (entry.blobRef ? read(entry.blobRef) : null),
            });
        }
    }
    return files;
};

/**
 * Cheapest test first. A library sample downloaded on another computer converts to
 * other bytes, which is why its pack path decides before any hash.
 */
const sameAudio = async (a: Comparable, b: Comparable, bothProjects: boolean): Promise<boolean> => {
    if (bothProjects && a.versionId === b.versionId) return true;
    if (a.libraryPath && b.libraryPath) return a.libraryPath === b.libraryPath;
    if (a.hash && b.hash) return a.hash === b.hash;
    const [x, y] = await Promise.all([a.audio(), b.audio()]);
    if (!x || !y || x.size !== y.size) return false;
    const [hx, hy] = await Promise.all([a.hash ?? hashBlob(x), b.hash ?? hashBlob(y)]);
    return hx === hy;
};

const sameFile = async (a: Comparable, b: Comparable, bothProjects: boolean): Promise<boolean> => {
    // An old Project Manager zip has each file under its library name, and no tempo.
    if (bothProjects && (a.name !== b.name || a.tempo !== b.tempo)) return false;
    if (a.slicePoints !== b.slicePoints) return false;
    return sameAudio(a, b, bothProjects);
};

const slotFile = (tapes: Tapes, color: TapeColor, slot: number): string | null =>
    tapes[color]?.slots?.find(s => s.id === slot)?.fileId ?? null;

const notesOf = ({ manifest }: ProjectSide): string => {
    const tapes = manifest.data.tapes as Tapes;
    return [manifest.data.projectNotes, ...TAPE_COLORS.map(c => tapes[c]?.notes)].map(n => (n ?? '').trim()).join('\n\u0000');
};

/** Key order and left-out defaults don't make two configs differ. */
const configOf = ({ manifest }: ProjectSide): string => {
    const config = completeProjectConfig(manifest.data.projectConfig) as unknown as Record<string, unknown>;
    return JSON.stringify(Object.keys(config).sort().map(key => [key, config[key]]));
};

/** How the project in `there` differs from the one in `here`. */
export const compareProjects = async (
    here: ProjectSide,
    there: ProjectSide,
    onProgress?: (msg: string) => void,
): Promise<ProjectDifference> => {
    const a = comparables(here);
    const b = comparables(there);
    const bothProjects = here.manifest.kind === 'project' && there.manifest.kind === 'project';
    const tapesA = here.manifest.data.tapes as Tapes;
    const tapesB = there.manifest.data.tapes as Tapes;

    const slots: string[] = [];
    const slottedA = new Set<string>();
    const slottedB = new Set<string>();
    for (const color of TAPE_COLORS) {
        for (let slot = 1; slot <= 6; slot++) {
            const idA = slotFile(tapesA, color, slot);
            const idB = slotFile(tapesB, color, slot);
            if (idA) slottedA.add(idA);
            if (idB) slottedB.add(idB);
            const fileA = idA ? a.get(idA) : undefined;
            const fileB = idB ? b.get(idB) : undefined;
            if (!fileA && !fileB) continue;
            onProgress?.(`Comparing ${color} ${slot}…`);
            if (!fileA || !fileB || !(await sameFile(fileA, fileB, bothProjects))) slots.push(`${color[0]}${slot}`);
        }
    }

    // The pool: files in no slot, paired by id.
    const poolB = new Set([...b.keys()].filter(id => !slottedB.has(id)));
    let pool = 0;
    for (const id of [...a.keys()].filter(id => !slottedA.has(id))) {
        const fileB = poolB.delete(id) ? b.get(id) : undefined;
        if (!fileB || !(await sameFile(a.get(id)!, fileB, bothProjects))) pool++;
    }
    pool += poolB.size;

    return { slots, pool, notes: notesOf(here) !== notesOf(there), config: configOf(here) !== configOf(there) };
};

export const isIdentical = (d: ProjectDifference): boolean => !d.slots.length && !d.pool && !d.notes && !d.config;

/** "3 slots differ: B2, G5, P1. The notes differ." Empty when identical. */
export const describeDifference = (d: ProjectDifference): string => {
    const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
    return [
        d.slots.length ? `${count(d.slots.length, 'slot differs', 'slots differ')}: ${d.slots.join(', ')}.` : '',
        d.pool ? `${count(d.pool, 'pool file differs', 'pool files differ')}.` : '',
        d.notes ? 'The notes differ.' : '',
        d.config ? 'The device settings differ.' : '',
    ].filter(Boolean).join(' ');
};
