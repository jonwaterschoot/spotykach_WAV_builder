import { resolveAssetPath } from '../utils/assetUtils';

export interface Sample {
    name: string;
    path: string;
    category?: string;
    tags?: string[];
}

export interface SamplePack {
    id: string;
    name: string;
    description: string;
    license?: string;
    links?: { label: string; url: string }[];
    coverImage?: string;
    samples: Sample[];
}

/** A single entry in the manifest's presets[] array */
export interface PresetManifestEntry {
    id: string;
    name: string;
    description: string;
    coverImage?: string;
    /** Pack ids from manifest.json — used for UI badge display */
    requiredPacks: string[];
    /** Relative path to the in-app descriptor JSON (served from public/presets/) */
    descriptorPath: string;
    /**
     * Optional direct R2 URL to a manually built SD-ready ZIP.
     * When present the PresetsPanel shows a "Download SD ZIP" button.
     * When absent the button is hidden.
     */
    sdExportUrl?: string;
}

export interface SampleManifest {
    version: string;
    packs: SamplePack[];
    presets?: PresetManifestEntry[];
}

/**
 * Normalizes a SamplePack by resolving all its internal asset paths.
 */
export const normalizeSamplePack = (pack: SamplePack): SamplePack => ({
    ...pack,
    coverImage: pack.coverImage ? resolveAssetPath(pack.coverImage) : undefined,
    links: pack.links?.map(link => ({
        ...link,
        url: resolveAssetPath(link.url)
    })),
    samples: pack.samples.map(sample => ({
        ...sample,
        path: resolveAssetPath(sample.path)
    }))
});

/**
 * Fetches the sample manifest and returns normalized packs and preset entries.
 */
export const fetchSampleManifest = async (): Promise<{
    packs: SamplePack[];
    presets: PresetManifestEntry[];
}> => {
    try {
        const response = await fetch('/manifest.json');
        if (!response.ok) throw new Error('Failed to fetch sample manifest');

        const manifest: SampleManifest = await response.json();

        // Normalize cover images on preset entries too
        const presets: PresetManifestEntry[] = (manifest.presets || []).map(p => ({
            ...p,
            coverImage: p.coverImage ? resolveAssetPath(p.coverImage) : undefined,
        }));

        return {
            packs: manifest.packs.map(normalizeSamplePack),
            presets,
        };
    } catch (error) {
        console.error('Error loading sample manifest:', error);
        return { packs: [], presets: [] };
    }
};

// We keep this exported for backward compatibility during the transition.
export const SAMPLE_PACKS: SamplePack[] = [];
