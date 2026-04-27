import type { AppState, FileRecord, AudioVersion, TapeColor, WavMetadata } from '../types';
import { TAPE_COLORS } from '../types';
import { resolveAssetPath } from './assetUtils';

// ==========================================
// PROJECT DESCRIPTOR SCHEMA v1.0
// ==========================================
// A lightweight JSON format that describes a Spotykach project's slot
// assignments and metadata without embedding audio blobs.
//
// Used by:
//   - Built-in preset projects (public/presets/*.json)
//   - Settings-only shareable ZIPs (import/export without packing sample-pack audio)
//
// Schema identifier: "spotykach-project/1.0"
// ==========================================

export interface DescriptorFileEntry {
    /** Display name of the original file */
    originalName: string;
    /**
     * Human-readable origin label, e.g. "hainbach-tapes".
     * Matches the `id` of a SamplePack in manifest.json.
     */
    origin?: string;
    /** Pack id from manifest.json — used for UI display */
    samplePackId?: string;
    /**
     * Relative path within the R2 bucket, e.g. "/Hainbach/Roaring-Drone.flac".
     * When present, the hydrator fetches the audio from resolveAssetPath(samplePath).
     */
    samplePath?: string;
    /**
     * Path within the ZIP archive, e.g. "custom_assets/{versionId}.wav".
     * Used for custom (non-sample-pack) files packed into a shareable ZIP.
     */
    blobRef?: string;
    /** Slice point times in seconds, re-attached to FileRecord.metadata on hydration */
    slicePoints?: number[];
    tags?: string[];
    license?: string;
}

export interface DescriptorTapeEntry {
    slots: Array<{ id: number; fileId: string | null }>;
    notes?: string;
}

export interface ProjectDescriptor {
    schema: 'spotykach-project/1.0';
    name: string;
    description?: string;
    tapes: Record<TapeColor, DescriptorTapeEntry>;
    files: Record<string, DescriptorFileEntry>;
    projectNotes?: string;
    projectConfig?: AppState['projectConfig'];
}

// ==========================================
// PARSE
// ==========================================

/**
 * Validate and cast an unknown JSON value to a ProjectDescriptor.
 * Throws a descriptive error if the schema is unrecognised or required
 * fields are missing.
 */
export const parseProjectDescriptor = (json: unknown): ProjectDescriptor => {
    if (typeof json !== 'object' || json === null) {
        throw new Error('Invalid project descriptor: expected an object.');
    }
    const d = json as Record<string, unknown>;
    if (d['schema'] !== 'spotykach-project/1.0') {
        throw new Error(
            `Unknown project descriptor schema: "${d['schema']}". ` +
            `Expected "spotykach-project/1.0".`
        );
    }
    if (!d['tapes'] || typeof d['tapes'] !== 'object') {
        throw new Error('Invalid project descriptor: missing "tapes" field.');
    }
    if (!d['files'] || typeof d['files'] !== 'object') {
        throw new Error('Invalid project descriptor: missing "files" field.');
    }
    return d as unknown as ProjectDescriptor;
};

// ==========================================
// HYDRATE
// ==========================================

export type HydrateProgress = (msg: string, progress: number) => void;

/**
 * Hydrate a ProjectDescriptor into a live AppState by fetching audio blobs.
 *
 * Resolution order per file:
 *   1. `samplePath`  → fetch from R2 via resolveAssetPath()
 *   2. `blobRef`     → look up in the provided `customAssets` map (from a ZIP)
 *   3. Neither       → blob stays null, entry added to loadIssues
 *
 * Slice points stored in the descriptor are re-attached to FileRecord.metadata.
 *
 * @param descriptor  - Parsed project descriptor
 * @param customAssets - Optional map of blobRef → Blob for packed custom files
 * @param onProgress  - Optional progress callback (message, 0–100)
 */
export const hydrateDescriptor = async (
    descriptor: ProjectDescriptor,
    customAssets?: Record<string, Blob>,
    onProgress?: HydrateProgress,
): Promise<AppState> => {
    const fileEntries = Object.entries(descriptor.files);
    const totalFiles = fileEntries.length;
    const hydratedFiles: Record<string, FileRecord> = {};
    const missingAssets: NonNullable<AppState['loadIssues']>['missingAssets'] = [];

    for (let i = 0; i < fileEntries.length; i++) {
        const [fileId, entry] = fileEntries[i];
        const progressPct = Math.round((i / Math.max(1, totalFiles)) * 80);
        onProgress?.(`Fetching "${entry.originalName}"…`, progressPct);

        let blob: Blob | null = null;

        // 1. Sample pack path → R2 fetch
        if (entry.samplePath) {
            try {
                const url = resolveAssetPath(entry.samplePath);
                const response = await fetch(url);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const buffer = await response.arrayBuffer();
                const mime = response.headers.get('content-type') || guessMimeFromPath(entry.samplePath);
                blob = new Blob([buffer], { type: mime });
            } catch (e: any) {
                console.warn(`[hydrateDescriptor] Failed to fetch "${entry.samplePath}":`, e.message);
                missingAssets.push({
                    fileId,
                    fileName: entry.originalName,
                    versionId: `${fileId}_v1`,
                    blobRef: entry.samplePath,
                    reason: e.message || 'Fetch failed',
                });
            }
        }

        // 2. Custom asset from ZIP
        if (!blob && entry.blobRef && customAssets?.[entry.blobRef]) {
            blob = customAssets[entry.blobRef];
        }

        // 3. Still nothing → record as missing
        if (!blob && !entry.samplePath) {
            missingAssets.push({
                fileId,
                fileName: entry.originalName,
                versionId: `${fileId}_v1`,
                blobRef: entry.blobRef ?? '(unknown)',
                reason: 'No source path or blob available',
            });
        }

        // Best-effort duration decode
        let duration = 0;
        if (blob) {
            duration = await getAudioDuration(blob);
        }

        const versionId = `${fileId}_v1`;
        const version: AudioVersion = {
            id: versionId,
            timestamp: Date.now(),
            description: 'Original',
            blob,
            duration,
            blobRef: entry.samplePath ?? entry.blobRef,
        };

        // Re-attach slice points from descriptor
        const metadata: WavMetadata | undefined =
            entry.slicePoints && entry.slicePoints.length > 0
                ? { slicePoints: entry.slicePoints }
                : undefined;

        const fileRecord: FileRecord = {
            id: fileId,
            name: entry.originalName,
            originalName: entry.originalName,
            versions: [version],
            currentVersionId: versionId,
            isParked: false,
            origin: entry.origin,
            license: entry.license,
            tags: entry.tags,
            metadata,
            // Store source path so settings-only re-export can omit the blob
            sourceSamplePath: entry.samplePath,
        };

        hydratedFiles[fileId] = fileRecord;
    }

    onProgress?.('Building project…', 90);

    // Build tapes — always produce all 6 slots per tape
    const tapes = {} as AppState['tapes'];
    for (const color of TAPE_COLORS) {
        const dt = descriptor.tapes[color];
        const slots = Array.from({ length: 6 }, (_, idx) => {
            const ds = dt?.slots?.find(s => s.id === idx + 1);
            return { id: idx + 1, fileId: ds?.fileId ?? null };
        });
        tapes[color] = { color, slots, notes: dt?.notes };
    }

    onProgress?.('Done.', 100);

    return {
        files: hydratedFiles,
        tapes,
        projectNotes: descriptor.projectNotes,
        projectConfig: descriptor.projectConfig,
        loadIssues: missingAssets.length > 0 ? { missingAssets } : undefined,
    };
};

// ==========================================
// BUILD DESCRIPTOR FROM STATE
// ==========================================

/**
 * Build a ProjectDescriptor from a live AppState.
 *
 * In settings-only mode:
 *   - Files with a `sourceSamplePath` stored on the record → descriptor reference only
 *     (samplePackId + samplePath, no blob packed).
 *   - Files without a source path (custom uploads) → blob packed into custom_assets/.
 *
 * In full mode:
 *   - All files packed as usual (caller uses exportSaveState for full ZIP).
 *   - This function is mainly used for the settings-only path.
 *
 * @returns `descriptor` and `customBlobs` (map of blobRef → Blob to pack in ZIP).
 */
export const buildDescriptorFromState = (
    state: AppState,
    options: {
        settingsOnly: boolean;
        name?: string;
        description?: string;
    }
): { descriptor: ProjectDescriptor; customBlobs: Record<string, Blob> } => {
    const customBlobs: Record<string, Blob> = {};
    const files: Record<string, DescriptorFileEntry> = {};

    for (const [fileId, rec] of Object.entries(state.files)) {
        const currentVersion =
            rec.versions.find(v => v.id === rec.currentVersionId) ?? rec.versions[0];

        const sourceSamplePath = rec.sourceSamplePath;

        const entry: DescriptorFileEntry = {
            originalName: rec.originalName || rec.name,
            origin: rec.origin,
            tags: rec.tags,
            license: rec.license,
            slicePoints: rec.metadata?.slicePoints,
        };

        if (options.settingsOnly && rec.origin && sourceSamplePath) {
            // Sample-pack file with known source path → descriptor reference, no blob
            entry.samplePackId = rec.origin;
            entry.samplePath = sourceSamplePath;
        } else if (currentVersion?.blob) {
            // Custom file, or sample-pack file where path is unknown → pack the blob
            const blobRef = `custom_assets/${currentVersion.id}.wav`;
            entry.blobRef = blobRef;
            customBlobs[blobRef] = currentVersion.blob;
        }

        files[fileId] = entry;
    }

    // Build tape entries
    const tapes = {} as ProjectDescriptor['tapes'];
    for (const color of TAPE_COLORS) {
        const tape = state.tapes[color];
        tapes[color] = {
            slots: tape.slots.map(s => ({ id: s.id, fileId: s.fileId })),
            notes: tape.notes,
        };
    }

    const descriptor: ProjectDescriptor = {
        schema: 'spotykach-project/1.0',
        name: options.name || 'Untitled Project',
        description: options.description,
        tapes,
        files,
        projectNotes: state.projectNotes,
        projectConfig: state.projectConfig,
    };

    return { descriptor, customBlobs };
};

// ==========================================
// HELPERS
// ==========================================

/** Guess MIME type from file extension (for R2 responses that don't set Content-Type). */
const guessMimeFromPath = (path: string): string => {
    const ext = path.split('.').pop()?.toLowerCase();
    switch (ext) {
        case 'flac': return 'audio/flac';
        case 'wav':  return 'audio/wav';
        case 'mp3':  return 'audio/mpeg';
        case 'ogg':  return 'audio/ogg';
        case 'aiff':
        case 'aif':  return 'audio/aiff';
        default:     return 'audio/flac';
    }
};

/**
 * Decode a blob with AudioContext to get its duration in seconds.
 * Returns 0 on failure (e.g. format not supported by the browser).
 */
const getAudioDuration = async (blob: Blob): Promise<number> => {
    try {
        const Ctx = window.AudioContext || (window as any).webkitAudioContext;
        if (!Ctx) return 0;
        const ctx = new Ctx();
        const buffer = await blob.arrayBuffer();
        const decoded = await ctx.decodeAudioData(buffer);
        const dur = decoded.duration;
        await ctx.close();
        return dur;
    } catch {
        return 0;
    }
};
