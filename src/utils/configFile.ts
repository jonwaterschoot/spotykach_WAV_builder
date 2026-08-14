import type { ProjectConfig } from '../types';

/**
 * `config.txt` against a bare SD card — no project, no work folder, no state.
 *
 * The parsing and generating themselves already lived as pure functions in
 * `exportUtils` and stay there. What was missing was everything around them: the
 * card is only ever reached through `exportSDStructure`, which needs an `AppState`.
 * A device setting is not a project, so Config mode gets its own thin path here,
 * and Studio's `ConfigModal` uses the same one rather than keeping a second copy.
 */

/** What an unconfigured device is assumed to be running. */
export const defaultProjectConfig = (): ProjectConfig => ({
    mid_ch_a: 1,
    mid_ch_b: 2,
    mid_ps_a: false,
    mid_ps_b: false,
    pre_load: true,
});

/** Where a card's `config.txt` was found. `SK/` is where this app writes it. */
export type ConfigLocation = 'sk' | 'root';

export interface ReadConfigResult {
    config: ProjectConfig;
    location: ConfigLocation;
}

/** Picking a folder needs the File System Access API; Firefox and Safari have none. */
export const canPickCard = (): boolean =>
    typeof window !== 'undefined' && 'showDirectoryPicker' in window;

/**
 * Ask for the card. Returns `null` when the user dismisses the picker, which is a
 * normal outcome and not an error worth surfacing.
 *
 * `mode` follows the intent: reading the card asks only for read access, and the
 * write path upgrades through `ensureWritable` if and when it needs to.
 */
export const pickCard = async (
    mode: 'read' | 'readwrite' = 'readwrite',
): Promise<FileSystemDirectoryHandle | null> => {
    if (!canPickCard()) throw new Error('This browser cannot open a folder. Use the download instead.');
    try {
        // Same picker id the wizard uses for the card, so it opens where the user
        // last found it.
        return await window.showDirectoryPicker({ id: 'spotykach_backup', mode });
    } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return null;
        throw e;
    }
};

type PermissionCapableHandle = FileSystemDirectoryHandle & {
    queryPermission?: (d: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
    requestPermission?: (d: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
};

/** Upgrade a read-only handle to writable, prompting only when it isn't already. */
export const ensureWritable = async (handle: FileSystemDirectoryHandle): Promise<boolean> => {
    const h = handle as PermissionCapableHandle;
    if (!h.queryPermission) return true; // No permissions API — the write itself will tell us.
    if (await h.queryPermission({ mode: 'readwrite' }) === 'granted') return true;
    if (!h.requestPermission) return false;
    return await h.requestPermission({ mode: 'readwrite' }) === 'granted';
};

/**
 * Read the card's own settings. `SK/config.txt` first, then a bare `config.txt` at
 * the root — the same order and the same fallback `scanSKStructure` already uses,
 * so a user who picks the `SK` folder itself is not told there is nothing there.
 *
 * Returns `null` when the card carries no config at all.
 */
export const readConfigFromCard = async (
    handle: FileSystemDirectoryHandle,
): Promise<ReadConfigResult | null> => {
    const { parseConfigText } = await import('./exportUtils');

    const readFrom = async (
        dir: FileSystemDirectoryHandle,
        location: ConfigLocation,
    ): Promise<ReadConfigResult | null> => {
        try {
            const file = await (await dir.getFileHandle('config.txt', { create: false })).getFile();
            const config = parseConfigText(await file.text());
            return config ? { config, location } : null;
        } catch {
            return null; // Not there, or unreadable — the caller's other candidate may be.
        }
    };

    try {
        const sk = await handle.getDirectoryHandle('SK', { create: false });
        const fromSK = await readFrom(sk, 'sk');
        if (fromSK) return fromSK;
    } catch { /* No SK folder — an unbuilt card, or the SK folder itself was picked. */ }

    return readFrom(handle, 'root');
};

/**
 * Write the settings to `SK/config.txt` on the card, creating `SK/` if the card is
 * blank. `'always'` because the point of pressing the button is to overwrite what
 * the device currently has, and the write goes through `safeWriteBlob`, so an
 * interrupted one can't destroy the existing file.
 */
export const writeConfigToCard = async (
    handle: FileSystemDirectoryHandle,
    config: ProjectConfig,
): Promise<void> => {
    const { generateConfigText, safeWriteBlob } = await import('./exportUtils');
    const skHandle = await handle.getDirectoryHandle('SK', { create: true });
    const blob = new Blob([generateConfigText(config)], { type: 'text/plain' });
    await safeWriteBlob(skHandle, 'config.txt', blob, 'always');
};

/** The permission-free exit: a plain `config.txt` in the downloads folder. */
export const downloadConfig = async (config: ProjectConfig): Promise<void> => {
    const { generateConfigText, downloadBlob } = await import('./exportUtils');
    downloadBlob(new Blob([generateConfigText(config)], { type: 'text/plain' }), 'config.txt');
};

/** The permission-free way in: a `config.txt` the user hands over from a file input. */
export const readConfigFromFile = async (file: File): Promise<ProjectConfig | null> => {
    const { parseConfigText } = await import('./exportUtils');
    return parseConfigText(await file.text());
};

/**
 * Settings the user expressed, without the pairs that belong to whatever file this
 * config was read from. Saved presets are a user's own choices; unknown keys are
 * the device's, and travelling with a preset onto a different card would inject
 * settings that card never had.
 */
export const configWithoutUnknown = (config: ProjectConfig): ProjectConfig => {
    const copy: ProjectConfig = { ...config };
    delete copy.unknown;
    return copy;
};
