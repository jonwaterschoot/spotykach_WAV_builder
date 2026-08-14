import type { AppState } from '../types';
import { saveDirectoryHandle } from './storageUtils';

/** Matches App.tsx's rule, so a project made out here loads in there. */
export const sanitizeProjectName = (name: string): string =>
    name.trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9.\-_]/g, '');

/** Firefox and Safari have no File System Access API. The download exits still work. */
export const canPickFolder = (): boolean =>
    typeof window !== 'undefined' && 'showDirectoryPicker' in window;

export interface CreatedProject {
    projectName: string;
    workHandle: FileSystemDirectoryHandle;
}

/**
 * The upgrade path out of the project-free modes — V4_PERVAK.md, Phase 6, steps 2
 * and 6.
 *
 * Browse's selection pool and Editor's single file both end up here: a detached
 * `AppState` that exists only in memory becomes `Projects/<name>/` on a folder the
 * user picks *now*. That timing is the point (Appendix C.2, "permission follows
 * intent") — the mode asked for nothing until the user asked for a project.
 *
 * Returns `null` when the picker is dismissed, which is a normal outcome rather than
 * an error. Throws for a name that sanitises to nothing, or a browser with no picker.
 *
 * Locked decision 5 still holds: the stored *handle* is written so Studio can find
 * the project again, but the `app-state` IDB slot is never touched. Studio reads the
 * project back off disk like any other.
 */
export const createProjectFromState = async (
    state: AppState,
    rawName: string,
    onProgress?: (msg: string | undefined) => void,
): Promise<CreatedProject | null> => {
    const projectName = sanitizeProjectName(rawName);
    if (!projectName) throw new Error('That name has no usable characters.');
    if (!canPickFolder()) {
        throw new Error('This browser cannot open a folder — use the download instead.');
    }

    let workHandle: FileSystemDirectoryHandle;
    try {
        // Same picker id Studio's wizard uses, so it opens where the user keeps
        // their projects rather than at some default.
        workHandle = await window.showDirectoryPicker({ id: 'spotykach_work', mode: 'readwrite' });
    } catch {
        return null;
    }

    const { saveProjectToDirectory } = await import('./exportUtils');
    await saveProjectToDirectory(state, workHandle, msg => onProgress?.(msg), projectName);

    // A stored handle is a convenience; the project on disk is the real result, so a
    // failure here is not worth failing the whole operation over.
    await saveDirectoryHandle('work', workHandle).catch(e => {
        console.warn('Could not store the work folder handle', e);
    });
    localStorage.setItem('spotykach_current_project', projectName);

    return { projectName, workHandle };
};
