import type { AppState } from '../types';
import type { PresetManifestEntry } from '../data/samplePacks';
import { resolveAssetPath } from './assetUtils';

/** `(message, 0–100)` — the same shape `hydrateDescriptor` already reports in. */
export type PresetProgress = (msg: string, pct: number) => void;

export interface HydratedPreset {
    /**
     * A detached `AppState`: files, slots and notes, holding no handles and never
     * written to the global IDB slot. Locked decision 5 holds as long as the caller
     * only hands it to an exporter — adopting it as the live project is a separate,
     * explicit step that only Studio takes.
     */
    state: AppState;
    /** The descriptor's own name — what a project made from this preset gets called. */
    name: string;
}

/**
 * Everything a preset needs before it can be written or adopted: fetch the
 * descriptor, then pull down the audio it points at.
 *
 * This is the first of the three pieces `handleLoadPreset` used to fuse together
 * (V4_PERVAK.md, Phase 3). It deliberately stops before any of the project-shaped
 * work — no name dedupe, no folder write, no `setState`. Tier 2 needs none of it.
 */
export const hydratePreset = async (
    entry: PresetManifestEntry,
    onProgress?: PresetProgress,
): Promise<HydratedPreset> => {
    onProgress?.('Reading preset…', 0);

    // `fetchSampleManifest` already resolves this, but resolving twice is a no-op
    // and callers holding a raw manifest entry shouldn't have to know that.
    const response = await fetch(resolveAssetPath(entry.descriptorPath));
    if (!response.ok) throw new Error(`Failed to fetch preset descriptor: HTTP ${response.status}`);

    const { parseProjectDescriptor, hydrateDescriptor } = await import('./projectDescriptorUtils');
    const descriptor = parseProjectDescriptor(await response.json());
    const state = await hydrateDescriptor(descriptor, undefined, onProgress);

    return { state, name: descriptor.name || entry.name || 'Preset' };
};

/**
 * One sample, decoded and re-encoded as the firmware wants it: 48 kHz, stereo,
 * 32-bit IEEE float WAV.
 *
 * Studio converts through ffmpeg-wasm (`useAudioConverter`) because a project's
 * files can be anything it ever picked up. A preset's files are always sample-pack
 * audio, and `audioProcessor.toWav` emits exactly the same bytes — so the tier whose
 * premise is "no setup" doesn't pull ~30 MB of wasm to get them. Same call Browse
 * makes on the way into its pool, and the same one Studio makes on import.
 *
 * Passed to `exportSDStructure` as `onConvert`, so files convert one at a time as
 * they're written rather than all 36 sitting decoded in memory at once.
 */
export const toHardwareWav = async (blob: Blob): Promise<Blob> => {
    const { audioEngine } = await import('../lib/audio/audioEngine');
    const { blob: processed } = await audioEngine.loadAndProcessAudio(blob);
    return processed;
};

/** Direct writing needs the File System Access API; Firefox and Safari have no picker. */
export const canWriteToSDDirectly = (): boolean =>
    typeof window !== 'undefined' && 'showDirectoryPicker' in window;

export interface WriteToSDOptions {
    /** Written into `SK/project.json` so the card says what's on it. */
    projectName?: string;
    /** A card the caller already holds. Omitted, `exportSDStructure` opens its own picker. */
    destinationHandle?: FileSystemDirectoryHandle;
    /** Fallback for browsers without a directory picker: build the same tree as a ZIP. */
    asZip?: boolean;
}

/**
 * The Tier-2 exit: an `AppState` straight onto the card, no project in between.
 *
 * A thin call into `exportSDStructure`, which already takes a `destinationHandle`
 * or opens its own picker — the permission prompt therefore fires at the moment of
 * the write and nowhere earlier (locked decision 3).
 *
 * `includeConfig` is left at its default, which writes `config.txt` only when the
 * state actually carries a `projectConfig`. A preset that expresses no device
 * settings leaves whatever is on the card alone; config is Phase 5's surface.
 */
export const writeToSD = async (
    state: AppState,
    options: WriteToSDOptions = {},
    onProgress?: (msg: string | undefined, progress?: number) => void,
): Promise<void> => {
    const { exportSDStructure } = await import('./exportUtils');
    await exportSDStructure(state, {
        skMode: 'overwrite',
        directWrite: !options.asZip,
        destinationHandle: options.destinationHandle,
        projectName: options.projectName,
        includeProject: false,
        onConvert: toHardwareWav,
    }, onProgress);
};

/** How many slots a hydrate left empty, so a caller can say so instead of writing a quiet gap. */
export const missingAssetCount = (state: AppState): number =>
    state.loadIssues?.missingAssets?.length ?? 0;
