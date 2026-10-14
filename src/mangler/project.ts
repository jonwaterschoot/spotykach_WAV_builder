import JSZip from 'jszip';
import type { MangleResultEntry, MangleSliceEntry, MangleSourceEntry } from '../utils/persistence';
import type { Sequence } from './sequence';
import type { MangleSettings } from './settings';
import type { SynthKind, SynthRanges } from './synth';

/**
 * A mangler project: everything the mangler holds, saved together so it can be
 * put away and opened again. On a workspace folder (`Mangler/<name>/`) where the
 * browser can write folders, or as one `.mangler.zip` anywhere else.
 *
 *   mangler.json   settings, sequence, synth ranges, and every source, result
 *                  and slice record (audio replaced by a file path)
 *   sources/       the source files as they were added
 *   results/       the results' WAVs
 *
 * Slices hold no audio: they point at sources, so they need nothing more.
 */

export const PROJECT_FORMAT = 'wavbuilder-mangler';
export const PROJECT_VERSION = 1;
export const PROJECTS_DIR = 'Mangler';

export interface ManglerSnapshot {
    settings: MangleSettings;
    sequence: Sequence;
    synth: { kind: SynthKind; ranges: Partial<Record<SynthKind, SynthRanges>>; count: number };
    sources: MangleSourceEntry[];
    results: MangleResultEntry[];
    slices: MangleSliceEntry[];
}

interface Manifest extends Omit<ManglerSnapshot, 'sources' | 'results'> {
    format: typeof PROJECT_FORMAT;
    version: number;
    name: string;
    savedAt: number;
    sources: (Omit<MangleSourceEntry, 'blob'> & { file: string })[];
    results: (Omit<MangleResultEntry, 'blob'> & { file: string })[];
}

export interface ProjectInfo {
    name: string;
    savedAt: number;
    sources: number;
    results: number;
    slices: number;
}

/** A name that is safe as a folder and a file name everywhere. */
export const projectFileName = (name: string) =>
    name.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').slice(0, 80) || 'mangler';

/** The type a file had, from its extension: a blob from a zip has none. */
const mimeOf = (path: string) => {
    const ext = path.match(/.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
    return ({ wav: 'audio/wav', mp3: 'audio/mpeg', flac: 'audio/flac', ogg: 'audio/ogg', aif: 'audio/aiff', aiff: 'audio/aiff', m4a: 'audio/mp4' } as Record<string, string>)[ext ?? ''] ?? '';
};

const extensionOf = (entry: MangleSourceEntry) => {
    const fromName = (entry.blob as File).name?.match(/\.[a-z0-9]{2,5}$/i)?.[0];
    if (fromName) return fromName.toLowerCase();
    const t = entry.blob.type;
    return t.includes('wav') ? '.wav' : t.includes('mpeg') ? '.mp3' : t.includes('flac') ? '.flac' : t.includes('ogg') ? '.ogg' : t.includes('aiff') ? '.aiff' : '.audio';
};

function manifestOf(name: string, snap: ManglerSnapshot): { manifest: Manifest; files: [string, Blob][] } {
    const files: [string, Blob][] = [];
    const sources = snap.sources.map(s => {
        const file = `sources/${s.id}${extensionOf(s)}`;
        files.push([file, s.blob]);
        const { blob: _blob, ...rest } = s;
        void _blob;
        return { ...rest, file };
    });
    const results = snap.results.map(r => {
        const file = `results/${r.id}.wav`;
        files.push([file, r.blob]);
        const { blob: _blob, ...rest } = r;
        void _blob;
        return { ...rest, file };
    });
    return {
        manifest: {
            format: PROJECT_FORMAT, version: PROJECT_VERSION, name, savedAt: Date.now(),
            settings: snap.settings, sequence: snap.sequence, synth: snap.synth, slices: snap.slices,
            sources, results,
        },
        files,
    };
}

async function snapshotOf(manifest: Manifest, read: (path: string) => Promise<Blob | null>): Promise<ManglerSnapshot> {
    if (manifest.format !== PROJECT_FORMAT) throw new Error('This is not a mangler project.');
    if (manifest.version > PROJECT_VERSION) throw new Error('This project was saved by a newer WAV Builder.');
    const sources: MangleSourceEntry[] = [];
    for (const { file, ...s } of manifest.sources) {
        const blob = await read(file);
        if (blob) sources.push({ ...s, blob });
    }
    const results: MangleResultEntry[] = [];
    for (const { file, ...r } of manifest.results) {
        const blob = await read(file);
        if (blob) results.push({ ...r, blob });
    }
    return { settings: manifest.settings, sequence: manifest.sequence, synth: manifest.synth, slices: manifest.slices ?? [], sources, results };
}

const infoOf = (m: Manifest): ProjectInfo => ({
    name: m.name, savedAt: m.savedAt, sources: m.sources.length, results: m.results.length, slices: m.slices?.length ?? 0,
});

// ---------------------------------------------------------------------------
// Workspace folder
// ---------------------------------------------------------------------------

async function writeFile(dir: FileSystemDirectoryHandle, path: string, data: Blob | string) {
    const parts = path.split('/');
    let here = dir;
    for (const part of parts.slice(0, -1)) here = await here.getDirectoryHandle(part, { create: true });
    const handle = await here.getFileHandle(parts[parts.length - 1], { create: true });
    const writable = await handle.createWritable();
    await writable.write(data);
    await writable.close();
}

/**
 * Saves into `Mangler/<name>/` on the workspace, replacing what was there under
 * that name. The caller has the folder's permission already.
 */
export async function saveToFolder(
    workspace: FileSystemDirectoryHandle, rawName: string, snap: ManglerSnapshot, onProgress?: (done: number, total: number) => void,
): Promise<string> {
    const name = projectFileName(rawName);
    const root = await workspace.getDirectoryHandle(PROJECTS_DIR, { create: true });
    // Start clean, so files of removed sources and results don't linger.
    try { await root.removeEntry(name, { recursive: true }); } catch { /* new project */ }
    const dir = await root.getDirectoryHandle(name, { create: true });
    const { manifest, files } = manifestOf(name, snap);
    for (let i = 0; i < files.length; i++) {
        onProgress?.(i, files.length);
        await writeFile(dir, files[i][0], files[i][1]);
    }
    await writeFile(dir, 'mangler.json', JSON.stringify(manifest));
    onProgress?.(files.length, files.length);
    return name;
}

/** The projects on the workspace, newest first. */
export async function listFolderProjects(workspace: FileSystemDirectoryHandle): Promise<ProjectInfo[]> {
    let root: FileSystemDirectoryHandle;
    try { root = await workspace.getDirectoryHandle(PROJECTS_DIR); } catch { return []; }
    const out: ProjectInfo[] = [];
    for await (const entry of root.values()) {
        if (entry.kind !== 'directory') continue;
        try {
            const file = await (await (entry as FileSystemDirectoryHandle).getFileHandle('mangler.json')).getFile();
            const manifest = JSON.parse(await file.text()) as Manifest;
            if (manifest.format === PROJECT_FORMAT) out.push(infoOf(manifest));
        } catch { /* not a project */ }
    }
    return out.sort((a, b) => b.savedAt - a.savedAt);
}

export async function openFromFolder(workspace: FileSystemDirectoryHandle, name: string): Promise<ManglerSnapshot> {
    const dir = await (await workspace.getDirectoryHandle(PROJECTS_DIR)).getDirectoryHandle(name);
    const manifest = JSON.parse(await (await (await dir.getFileHandle('mangler.json')).getFile()).text()) as Manifest;
    return snapshotOf(manifest, async path => {
        try {
            const parts = path.split('/');
            let here = dir;
            for (const part of parts.slice(0, -1)) here = await here.getDirectoryHandle(part);
            return await (await here.getFileHandle(parts[parts.length - 1])).getFile();
        } catch {
            return null;
        }
    });
}

// ---------------------------------------------------------------------------
// Zip (anywhere: phones, Firefox, Safari)
// ---------------------------------------------------------------------------

export async function saveToZip(rawName: string, snap: ManglerSnapshot): Promise<{ blob: Blob; fileName: string }> {
    const name = projectFileName(rawName);
    const zip = new JSZip();
    const { manifest, files } = manifestOf(name, snap);
    zip.file('mangler.json', JSON.stringify(manifest));
    // Audio is already compressed or close to noise: storing is as good as deflating, and quicker.
    // As bytes: JSZip reads a Blob only where it can detect one (not in Node, where the checks run).
    for (const [path, blob] of files) zip.file(path, await blob.arrayBuffer(), { compression: 'STORE' });
    const bytes = await zip.generateAsync({ type: 'arraybuffer' });
    return { blob: new Blob([bytes], { type: 'application/zip' }), fileName: `${name}.mangler.zip` };
}

export async function openFromZip(file: Blob): Promise<{ name: string; snapshot: ManglerSnapshot }> {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const json = zip.file('mangler.json');
    if (!json) throw new Error('No mangler.json in this zip: it is not a mangler project.');
    const manifest = JSON.parse(await json.async('string')) as Manifest;
    const snapshot = await snapshotOf(manifest, async path => {
        const entry = zip.file(path);
        if (!entry) return null;
        return new Blob([await entry.async('arraybuffer')], { type: mimeOf(path) });
    });
    return { name: manifest.name, snapshot };
}
