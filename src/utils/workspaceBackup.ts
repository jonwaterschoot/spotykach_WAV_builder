// Workspace backup — V4_PERVAK.md Phase 7, step 4.
//
// One explicit act, replacing the four implicit ones Phase 4 turned off. The user
// picks a folder at the moment of backing up; nothing is written until they do, and
// there is deliberately no remembered default location (Appendix D.3, "backup
// location is the user's choice", made literal).
//
// The survey runs first and is shown before anything is written, because the one
// thing the old sync UI never did was say what the total was made of.
//
// ⚠️ **The platform cannot tell us whether it will fit.** The File System Access API
// exposes no free-space figure for a picked directory, and
// `navigator.storage.estimate()` measures this origin's own quota, not the target
// drive. So there is no truthful "this won't fit" check to perform before the write.
// What we do instead: state the size plainly, and fail *cleanly* — the whole backup
// goes into one new folder, and if the write dies part way that folder is removed
// again, so a half-copy is never left looking like a backup.

import type { UserLibrary } from '../types';

/** One line in the "what this contains" list. */
export interface BackupItem {
    id: string;
    kind: 'project' | 'library' | 'settings' | 'card';
    label: string;
    detail: string;
    bytes: number;
    fileCount: number;
}

export interface WorkspaceSurvey {
    items: BackupItem[];
    totalBytes: number;
    totalFiles: number;
    /** Things the user should know before writing — unreadable folders, mostly. */
    warnings: string[];
}

export interface SurveyOptions {
    workHandle: FileSystemDirectoryHandle | null;
    sdHandle: FileSystemDirectoryHandle | null;
    /** Include the card's current `SK/` build. Off by default — it is rebuildable. */
    includeCard: boolean;
    userLibrary?: UserLibrary | null;
}

export interface BackupResult {
    folderName: string;
    filesWritten: number;
    bytesWritten: number;
}

export const formatBytes = (bytes: number): string => {
    if (bytes <= 0) return '0 B';
    const units = ['B', 'kB', 'MB', 'GB', 'TB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, i);
    return `${value >= 100 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
};

/** Total size and file count of a directory tree. */
const measureDirectory = async (dir: FileSystemDirectoryHandle): Promise<{ bytes: number; files: number }> => {
    let bytes = 0;
    let files = 0;
    for await (const [, entry] of dir.entries()) {
        if (entry.kind === 'file') {
            const file = await (entry as FileSystemFileHandle).getFile();
            bytes += file.size;
            files += 1;
        } else {
            const sub = await measureDirectory(entry as FileSystemDirectoryHandle);
            bytes += sub.bytes;
            files += sub.files;
        }
    }
    return { bytes, files };
};

/** Copy a directory tree. Returns what it wrote, so the caller can report progress. */
const copyDirectory = async (
    source: FileSystemDirectoryHandle,
    target: FileSystemDirectoryHandle,
    onFile: (name: string, bytes: number) => void
): Promise<void> => {
    for await (const [name, entry] of source.entries()) {
        if (entry.kind === 'file') {
            const file = await (entry as FileSystemFileHandle).getFile();
            const handle = await target.getFileHandle(name, { create: true });
            const writable = await handle.createWritable();
            await writable.write(file);
            await writable.close();
            onFile(name, file.size);
        } else {
            const subTarget = await target.getDirectoryHandle(name, { create: true });
            await copyDirectory(entry as FileSystemDirectoryHandle, subTarget, onFile);
        }
    }
};

/** The blob each library file would be backed up as — its current version. */
const currentLibraryBlobs = (library: UserLibrary | null | undefined): Array<{ name: string; blob: Blob }> => {
    if (!library?.files) return [];
    const out: Array<{ name: string; blob: Blob }> = [];
    for (const record of Object.values(library.files)) {
        const version = record.versions.find(v => v.id === record.currentVersionId) ?? record.versions[record.versions.length - 1];
        if (version?.blob) out.push({ name: record.name, blob: version.blob });
    }
    return out;
};

/**
 * Walk the sources and report what a backup would contain. Reads only — this is
 * what gets shown to the user before they choose a destination.
 */
export const surveyWorkspace = async (options: SurveyOptions): Promise<WorkspaceSurvey> => {
    const items: BackupItem[] = [];
    const warnings: string[] = [];
    const { workHandle, sdHandle, includeCard, userLibrary } = options;

    if (workHandle) {
        try {
            const projectsDir = await workHandle.getDirectoryHandle('Projects', { create: false });
            for await (const [name, entry] of projectsDir.entries()) {
                if (entry.kind !== 'directory') continue;
                const { bytes, files } = await measureDirectory(entry as FileSystemDirectoryHandle);
                items.push({
                    id: `project:${name}`,
                    kind: 'project',
                    label: name,
                    detail: `${files} ${files === 1 ? 'file' : 'files'}, including its Assets`,
                    bytes,
                    fileCount: files,
                });
            }
        } catch {
            warnings.push('No Projects folder found in the workspace — nothing to back up from it.');
        }

        try {
            const settings = await workHandle.getFileHandle('visual_settings.json', { create: false });
            const file = await settings.getFile();
            items.push({
                id: 'settings',
                kind: 'settings',
                label: 'Visual settings',
                detail: 'visual_settings.json',
                bytes: file.size,
                fileCount: 1,
            });
        } catch {
            // Never saved any; not worth a warning.
        }
    } else {
        warnings.push('No workspace folder is connected, so no projects can be included.');
    }

    const libraryBlobs = currentLibraryBlobs(userLibrary);
    if (libraryBlobs.length > 0) {
        const bytes = libraryBlobs.reduce((sum, f) => sum + f.blob.size, 0);
        items.push({
            id: 'library',
            kind: 'library',
            label: 'Your sample library',
            detail: `${libraryBlobs.length} ${libraryBlobs.length === 1 ? 'file' : 'files'}, written out as WAVs`,
            bytes,
            fileCount: libraryBlobs.length,
        });
    }

    if (includeCard && sdHandle) {
        try {
            const sk = await sdHandle.getDirectoryHandle('SK', { create: false });
            const { bytes, files } = await measureDirectory(sk);
            items.push({
                id: 'card',
                kind: 'card',
                label: `What is on the card (${sdHandle.name})`,
                detail: `The SK folder as it stands — ${files} ${files === 1 ? 'file' : 'files'}`,
                bytes,
                fileCount: files,
            });
        } catch {
            warnings.push('The card has no SK folder, so there is no build on it to include.');
        }
    }

    return {
        items,
        totalBytes: items.reduce((sum, i) => sum + i.bytes, 0),
        totalFiles: items.reduce((sum, i) => sum + i.fileCount, 0),
        warnings,
    };
};

const timestampFolderName = (): string => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `WAVbuilder-Backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
};

/** A name that isn't taken yet in `parent`. */
const uniqueFolderName = async (parent: FileSystemDirectoryHandle, base: string): Promise<string> => {
    let name = base;
    let counter = 2;
    for (;;) {
        try {
            await parent.getDirectoryHandle(name, { create: false });
            name = `${base}_${counter++}`;
        } catch {
            return name;
        }
    }
};

const manifestText = (survey: WorkspaceSurvey, folderName: string): string => {
    const lines = [
        'Spotykach WAV.builder — workspace backup',
        `Written ${new Date().toISOString()}`,
        `Folder: ${folderName}`,
        '',
        'Contents:',
        ...survey.items.map(i => `  - ${i.label} — ${i.fileCount} files, ${formatBytes(i.bytes)}`),
        '',
        `Total: ${survey.totalFiles} files, ${formatBytes(survey.totalBytes)}`,
        '',
        'Projects/  — copy back into your workspace folder to restore them.',
        'Library/   — your sample library, as plain WAVs. Re-import through the Library Manager.',
        'Card_SK/   — the SK folder as it was on the card, if it was included.',
        '',
        'Nothing here is compressed or transformed; every file is a plain copy.',
    ];
    return lines.join('\n');
};

/**
 * Write the backup.
 *
 * Everything goes into one new folder, so a failure part way can be undone by
 * removing it — the caller never has to reason about a partially-written backup
 * that looks complete. `onProgress` reports files rather than bytes, because a
 * byte-accurate progress bar over the FS Access API costs a second pass.
 */
export const runWorkspaceBackup = async (
    destination: FileSystemDirectoryHandle,
    options: SurveyOptions,
    survey: WorkspaceSurvey,
    onProgress?: (written: number, total: number, label: string) => void
): Promise<BackupResult> => {
    const folderName = await uniqueFolderName(destination, timestampFolderName());
    const root = await destination.getDirectoryHandle(folderName, { create: true });

    let filesWritten = 0;
    let bytesWritten = 0;
    const total = survey.totalFiles;
    const note = (label: string) => (_name: string, bytes: number) => {
        filesWritten += 1;
        bytesWritten += bytes;
        onProgress?.(filesWritten, total, label);
    };

    try {
        const includedProjects = new Set(
            survey.items.filter(i => i.kind === 'project').map(i => i.label)
        );
        if (options.workHandle && includedProjects.size > 0) {
            const sourceProjects = await options.workHandle.getDirectoryHandle('Projects', { create: false });
            const targetProjects = await root.getDirectoryHandle('Projects', { create: true });
            for (const name of includedProjects) {
                const source = await sourceProjects.getDirectoryHandle(name, { create: false });
                const target = await targetProjects.getDirectoryHandle(name, { create: true });
                await copyDirectory(source, target, note(name));
            }
        }

        if (survey.items.some(i => i.kind === 'settings') && options.workHandle) {
            const settings = await options.workHandle.getFileHandle('visual_settings.json', { create: false });
            const file = await settings.getFile();
            const handle = await root.getFileHandle('visual_settings.json', { create: true });
            const writable = await handle.createWritable();
            await writable.write(file);
            await writable.close();
            note('Visual settings')('visual_settings.json', file.size);
        }

        const libraryBlobs = currentLibraryBlobs(options.userLibrary);
        if (libraryBlobs.length > 0) {
            const libraryDir = await root.getDirectoryHandle('Library', { create: true });
            const used = new Set<string>();
            for (const { name, blob } of libraryBlobs) {
                // Library records are keyed by id, so two can legitimately share a name.
                let fileName = name;
                let counter = 2;
                while (used.has(fileName)) {
                    const dot = name.lastIndexOf('.');
                    fileName = dot > 0
                        ? `${name.slice(0, dot)}_${counter++}${name.slice(dot)}`
                        : `${name}_${counter++}`;
                }
                used.add(fileName);
                const handle = await libraryDir.getFileHandle(fileName, { create: true });
                const writable = await handle.createWritable();
                await writable.write(blob);
                await writable.close();
                note('Sample library')(fileName, blob.size);
            }
        }

        if (survey.items.some(i => i.kind === 'card') && options.sdHandle) {
            const sk = await options.sdHandle.getDirectoryHandle('SK', { create: false });
            const target = await root.getDirectoryHandle('Card_SK', { create: true });
            await copyDirectory(sk, target, note('Card'));
        }

        const manifest = await root.getFileHandle('BACKUP.txt', { create: true });
        const manifestWritable = await manifest.createWritable();
        await manifestWritable.write(manifestText(survey, folderName));
        await manifestWritable.close();

        return { folderName, filesWritten, bytesWritten };
    } catch (e) {
        // Roll the whole thing back. A partial copy that looks like a backup is worse
        // than no backup, and this is the only place that can know it is partial.
        try {
            await destination.removeEntry(folderName, { recursive: true });
        } catch (cleanupError) {
            console.warn('[Backup] Could not remove the partial backup folder', cleanupError);
            throw new Error(
                `The backup failed after ${filesWritten} of ${total} files, and the partial copy in "${folderName}" could not be removed. Delete that folder yourself before trying again. (${(e as Error).message})`
            );
        }
        throw new Error(
            `The backup failed after ${filesWritten} of ${total} files — the target may have run out of room. The partial copy has been removed. (${(e as Error).message})`
        );
    }
};
