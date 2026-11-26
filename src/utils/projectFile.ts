import type JSZip from 'jszip';
import type { AppState, AudioVersion, FileRecord } from '../types';
import { TAPE_COLORS } from '../types';
import { completeProjectConfig } from './configText';
import { collapseVersionHistory } from './versionHistory';
import { externalSampleAssetBaseUrl, R2_SAMPLE_BASE_URL, resolveAssetPath, toSampleKey } from './assetUtils';
import type { ProjectDescriptor } from './projectDescriptorUtils';

/*
 * A project folder, and the project file that carries one between computers.
 *
 * `Projects/<name>/`, as `saveProjectToDirectory` writes it:
 *   project.json      files, tapes, notes, device settings; `metadata.projectName`
 *   notes.md          the notes again, to read outside the app
 *   Assets/<id>.wav   the audio, one file per version
 *
 * The project file is that folder zipped as `<name>/…`, with each file's history cut
 * to its original and current version. Made without sample-library audio, a version
 * that is an unedited library file stores its pack path (`samplePath`) instead of an
 * asset, and loading downloads it.
 *
 * Everything reads through a `ProjectReader`, so a folder on disk and a folder in a
 * zip load the same way, and so do the older exports: a Project Manager zip
 * (`project-descriptor.json` and `custom_assets/`) and a Full Backup Bundle
 * (`project.json` and `blobs/`).
 */

/** A file at a path inside a project folder, such as `Assets/<id>.wav`; null when it isn't there. */
export type ProjectReader = (path: string) => Promise<File | null>;

type MissingAsset = NonNullable<NonNullable<AppState['loadIssues']>['missingAssets']>[number];

const cleanPath = (path: string): string =>
    path.split(/[\\/]/).filter(part => part && part !== '.' && part !== '..').join('/');

const mimeType = (name: string): string => {
    const ext = name.split('.').pop()?.toLowerCase();
    return ext === 'wav' ? 'audio/wav' : ext === 'json' ? 'application/json' : '';
};

/** A project folder on disk. */
export const folderReader = (dir: FileSystemDirectoryHandle): ProjectReader => async (path) => {
    const parts = cleanPath(path).split('/');
    const name = parts.pop();
    if (!name) return null;
    try {
        let folder = dir;
        for (const part of parts) folder = await folder.getDirectoryHandle(part);
        return await (await folder.getFileHandle(name)).getFile();
    } catch {
        return null;
    }
};

/** A project folder inside a zip. `prefix` is its path, such as `Serpentinelore/`, or '' at the root. */
export const zipReader = (zip: JSZip, prefix: string): ProjectReader => {
    // A zip made by hand can spell the folder `assets/`.
    const byLowerCase = new Map(Object.keys(zip.files).map(p => [p.toLowerCase(), p]));
    return async (path) => {
        const clean = cleanPath(path);
        if (!clean) return null;
        const full = prefix + clean;
        const key = zip.files[full] ? full : byLowerCase.get(full.toLowerCase());
        const entry = key ? zip.files[key] : undefined;
        if (!entry || entry.dir) return null;
        const name = clean.split('/').pop()!;
        return new File([await entry.async('arraybuffer')], name, { type: mimeType(name), lastModified: entry.date?.getTime() });
    };
};

// ==========================================
// WRITING
// ==========================================

const onSampleBucket = (url: string): boolean =>
    [externalSampleAssetBaseUrl, R2_SAMPLE_BASE_URL].some(base => url.startsWith(`${base}/samples/`));

/**
 * The pack path (`/Hainbach/MASSIVE.flac`) of a built-in sample-library file, which
 * an import can download again. Null for anything else a file can come from: an
 * archive search, a local folder, an object URL, another project.
 */
export const librarySamplePath = (source?: string): string | null => {
    if (!source) return null;
    if (/^https?:\/\//i.test(source)) return onSampleBucket(source) ? toSampleKey(source) : null;
    // The portable spelling presets store. `blob:` and `project:` sources have a scheme.
    if (!source.startsWith('/') || source.startsWith('//') || source.includes(':')) return null;
    return onSampleBucket(resolveAssetPath(source)) ? source : null;
};

const notesMarkdown = (state: AppState): string | null => {
    let text = state.projectNotes ? `# Project Notes\n\n${state.projectNotes}\n\n` : '';
    for (const color of TAPE_COLORS) {
        const notes = state.tapes[color]?.notes;
        if (notes) text += `## Tape ${color} Notes\n\n${notes}\n\n`;
    }
    return text.trim() ? text : null;
};

export interface SerializedProject {
    /** project.json */
    json: string;
    /** notes.md, or null without notes. */
    notes: string | null;
    /** The audio for `Assets/`. */
    assets: Array<{ name: string; blob: Blob }>;
}

/**
 * A project as its folder holds it. Every version with audio becomes
 * `Assets/<versionId>.wav`, except, with `libraryAudio: false`, a file's original when
 * it is an unedited library sample: that one stores its `samplePath` instead.
 */
export const serializeProject = (
    state: AppState,
    projectName: string | undefined,
    options: { libraryAudio?: boolean } = {},
): SerializedProject => {
    const assets: SerializedProject['assets'] = [];
    const files: Record<string, FileRecord> = {};

    for (const [id, file] of Object.entries(state.files)) {
        const samplePath = options.libraryAudio === false ? librarySamplePath(file.sourceSamplePath) : null;
        files[id] = {
            ...file,
            versions: file.versions.map((v, index) => {
                if (!v.blob) return v;
                // The original is the library file as the Sample Browser converted it on
                // the way in. Any edit is a later version, and always packed.
                if (samplePath && index === 0 && !v.processing?.length) {
                    return { ...v, blob: null, blobRef: undefined, samplePath };
                }
                const name = `${v.id}.wav`;
                assets.push({ name, blob: v.blob });
                return { ...v, blob: null, blobRef: `Assets/${name}`, samplePath: undefined };
            }),
        };
    }

    const project = {
        files,
        tapes: state.tapes,
        projectNotes: state.projectNotes,
        projectConfig: state.projectConfig,
        cardSnapshot: state.cardSnapshot,
        metadata: {
            appName: 'Spotykach WAV Builder',
            version: '1.2.0',
            exportDate: new Date().toISOString(),
            projectName: projectName || 'Untitled',
        },
    };
    return { json: JSON.stringify(project, null, 2), notes: notesMarkdown(state), assets };
};

/**
 * The project file: `<name>/project.json`, `notes.md` and `Assets/`, each file cut to
 * its original and current version. Without `libraryAudio`, unedited library
 * samples go as their pack path and the import downloads them.
 */
export const buildProjectFile = async (
    state: AppState,
    projectName: string,
    options: { libraryAudio: boolean },
    onProgress?: (msg: string, percent?: number) => void,
): Promise<Blob> => {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    const folder = zip.folder(projectName)!;
    const { json, notes, assets } = serializeProject(collapseVersionHistory(state), projectName, options);

    folder.file('project.json', json);
    if (notes) folder.file('notes.md', notes);
    // Blobs, not their bytes: JSZip reads each one as it writes it, so a big project
    // isn't held in memory twice. WAV barely compresses, so it's stored, which is quick.
    for (const asset of assets) folder.file(`Assets/${asset.name}`, asset.blob, { compression: 'STORE' });
    return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }, meta => onProgress?.('Zipping…', meta.percent));
};

// ==========================================
// READING
// ==========================================

export type ProjectManifest =
    | { kind: 'project'; data: AppState; name?: string; modified: number }
    | { kind: 'descriptor'; data: ProjectDescriptor; name?: string; modified: number };

const isProject = (data: unknown): data is AppState => {
    const d = data as Partial<AppState> | null;
    return !!d && typeof d.files === 'object' && d.files !== null && typeof d.tapes === 'object' && d.tapes !== null
        && Object.values(d.files).every(f => Array.isArray((f as FileRecord | null)?.versions));
};

/** A name worth keeping: not empty, and not the placeholder an unnamed save writes. */
const properName = (name: unknown): string | undefined => {
    const trimmed = typeof name === 'string' ? name.trim() : '';
    return trimmed && !/^untitled( project)?$/i.test(trimmed) ? trimmed : undefined;
};

/**
 * What a project folder describes itself with: `project.json`, or the
 * `project-descriptor.json` an import from before the project file left. Null when
 * it holds neither; throws when the one it holds can't be read.
 */
export const readManifest = async (read: ProjectReader): Promise<ProjectManifest | null> => {
    const [projectFile, descriptorFile] = await Promise.all([read('project.json'), read('project-descriptor.json')]);

    // Such an import left the descriptor, and saving it wrote project.json beside it.
    // Whichever was written last is the project.
    if (descriptorFile && (!projectFile || descriptorFile.lastModified > projectFile.lastModified)) {
        const { parseProjectDescriptor } = await import('./projectDescriptorUtils');
        const data = parseProjectDescriptor(JSON.parse(await descriptorFile.text()));
        return { kind: 'descriptor', data, name: properName(data.name), modified: descriptorFile.lastModified };
    }
    if (!projectFile) return null;

    const data: unknown = JSON.parse(await projectFile.text());
    if (!isProject(data)) throw new Error("project.json doesn't describe a project.");
    return { kind: 'project', data, name: properName(data.metadata?.projectName), modified: projectFile.lastModified };
};

/** A manifest from its JSON alone, told apart by content: a dropped `project.json` or descriptor. */
export const manifestFromJson = async (text: string): Promise<ProjectManifest> => {
    const data: unknown = JSON.parse(text);
    if (isProject(data)) return { kind: 'project', data, name: properName(data.metadata?.projectName), modified: 0 };
    const { parseProjectDescriptor } = await import('./projectDescriptorUtils');
    const descriptor = parseProjectDescriptor(data);
    return { kind: 'descriptor', data: descriptor, name: properName(descriptor.name), modified: 0 };
};

/** A converted library sample, as the Sample Browser converts one on the way in. */
const downloadLibrarySample = async (samplePath: string): Promise<Blob> => {
    const response = await fetch(resolveAssetPath(samplePath), { mode: 'cors' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const { audioEngine } = await import('../lib/audio/audioEngine');
    return (await audioEngine.loadAndProcessAudio(await response.blob())).blob;
};

/** Where a version's audio can be: its `blobRef`, then `Assets/`, then a Full Backup Bundle's `blobs/`. */
export const readVersionAudio = async (v: AudioVersion, read: ProjectReader): Promise<File | null> => {
    const base = v.blobRef?.split(/[\\/]/).pop();
    for (const path of new Set([v.blobRef, base && `Assets/${base}`, base && `blobs/${base}`])) {
        const file = path ? await read(path) : null;
        if (file) return file;
    }
    return null;
};

const withAudio = (v: AudioVersion, blob: Blob, downloaded: boolean): AudioVersion => {
    const next: AudioVersion = { ...v, blob };
    delete next.samplePath;
    // A download is this computer's conversion of the library file, not the bytes the
    // hash was taken from.
    if (downloaded) delete next.hash;
    return next;
};

export interface LoadProjectOptions {
    onProgress?: (msg: string, percent: number) => void;
    /** Downloads and converts one library sample. Tests pass their own. */
    fetchSample?: (samplePath: string) => Promise<Blob>;
}

/**
 * The project with its audio. A version whose audio can't be found or downloaded
 * keeps `blob: null` and is listed in `loadIssues.missingAssets`.
 */
export const loadProject = async (
    manifest: ProjectManifest,
    read: ProjectReader,
    options: LoadProjectOptions = {},
): Promise<AppState> => {
    const { onProgress, fetchSample = downloadLibrarySample } = options;

    if (manifest.kind === 'descriptor') {
        const { hydrateDescriptor } = await import('./projectDescriptorUtils');
        const customAssets: Record<string, Blob> = {};
        for (const entry of Object.values(manifest.data.files)) {
            if (!entry.blobRef || customAssets[entry.blobRef]) continue;
            const blob = await read(entry.blobRef);
            if (blob) customAssets[entry.blobRef] = blob;
        }
        return hydrateDescriptor(manifest.data, customAssets, (msg, pct) => onProgress?.(msg, 10 + pct * 0.8));
    }

    const state = manifest.data;
    state.projectConfig = completeProjectConfig(state.projectConfig);

    const missing: MissingAsset[] = [];
    const loadVersion = async (file: FileRecord, v: AudioVersion): Promise<AudioVersion> => {
        // Nothing was stored for it.
        if (!v.blobRef && !v.samplePath) return v;
        const asset = await readVersionAudio(v, read);
        if (asset) return withAudio(v, asset, false);
        if (v.samplePath) {
            try {
                return withAudio(v, await fetchSample(v.samplePath), true);
            } catch (e) {
                const why = e instanceof Error ? e.message : String(e);
                missing.push({
                    fileId: file.id, fileName: file.name, versionId: v.id, blobRef: v.samplePath,
                    reason: `Not downloaded from the sample library (${why}). It downloads when the project opens online.`,
                });
                return v;
            }
        }
        missing.push({ fileId: file.id, fileName: file.name, versionId: v.id, blobRef: v.blobRef!, reason: 'File missing from Assets folder.' });
        return v;
    };

    const files = Object.values(state.files);
    for (const [i, file] of files.entries()) {
        onProgress?.(`Loading assets for ${file.name}...`, 20 + (i / files.length) * 70);
        file.versions = await Promise.all(file.versions.map(v => loadVersion(file, v)));
    }

    if (missing.length) state.loadIssues = { ...state.loadIssues, missingAssets: missing };
    else if (state.loadIssues?.missingAssets?.length) state.loadIssues = { ...state.loadIssues, missingAssets: [] };
    return state;
};

// ==========================================
// IMPORT
// ==========================================

const MANIFEST_NAMES = ['project.json', 'project-descriptor.json'];

/** `Serpentinelore-SK_2026-11-26 (1).zip` → `Serpentinelore`: what the download's name added, taken off. */
const nameFromZipFile = (fileName: string): string =>
    fileName
        .replace(/\.zip$/i, '')
        .replace(/\s*\(\d+\)$/, '')
        .replace(/_\d{4}-\d{2}-\d{2}$/, '')
        .replace(/-(SK|audio)$/i, '')
        .trim();

export interface ZippedProject {
    /** The name inside the project; else its folder's; else the zip's, without the date. */
    name: string;
    manifest: ProjectManifest;
    read: ProjectReader;
}

/**
 * The project in a zip, from whichever export made it: a project file, a Project
 * Manager zip, a Full Backup Bundle, an SD card folder with the project in
 * `WAV_Builder/Projects/`, or an older one with `SK/PROJECT_BACKUP/project_backup.zip`.
 * Null when it holds none. Reads only the manifest: `loadProject` reads the audio.
 */
export const findProjectInZip = async (zip: JSZip, zipFileName: string): Promise<ZippedProject | null> => {
    const folders = new Set<string>();
    for (const [path, entry] of Object.entries(zip.files)) {
        if (entry.dir || path.startsWith('__MACOSX/')) continue;
        const slash = path.lastIndexOf('/');
        const folder = path.slice(0, slash + 1);
        // SK/project.json names the project that built the card; it isn't one.
        if (MANIFEST_NAMES.includes(path.slice(slash + 1).toLowerCase()) && !/(^|\/)SK\/$/i.test(folder)) {
            folders.add(folder);
        }
    }

    // The shallowest first: the project file's own folder before anything inside it.
    for (const folder of [...folders].sort((a, b) => a.split('/').length - b.split('/').length)) {
        const read = zipReader(zip, folder);
        try {
            const manifest = await readManifest(read);
            if (!manifest) continue;
            const name = manifest.name ?? folder.split('/').filter(Boolean).pop() ?? nameFromZipFile(zipFileName);
            return { manifest, read, name: name || 'Imported-project' };
        } catch (e) {
            console.warn(`[findProjectInZip] No project in "${folder || '/'}"`, e);
        }
    }

    // An SD card folder from before the project file nests a Full Backup Bundle.
    const JSZipClass = (await import('jszip')).default;
    for (const [path, entry] of Object.entries(zip.files)) {
        if (entry.dir || !/\.zip$/i.test(path) || path.startsWith('__MACOSX/')) continue;
        try {
            const found = await findProjectInZip(await JSZipClass.loadAsync(await entry.async('arraybuffer')), zipFileName);
            if (found) return found;
        } catch (e) {
            console.warn(`[findProjectInZip] Couldn't open "${path}"`, e);
        }
    }
    return null;
};
