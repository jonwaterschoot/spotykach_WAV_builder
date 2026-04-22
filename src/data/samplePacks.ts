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

export interface SampleManifest {
    version: string;
    packs: SamplePack[];
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
 * Fetches the sample manifest and returns a list of normalized sample packs.
 */
export const fetchSampleManifest = async (): Promise<SamplePack[]> => {
    try {
        const response = await fetch(resolveAssetPath('/manifest.json'));
        if (!response.ok) throw new Error('Failed to fetch sample manifest');
        
        const manifest: SampleManifest = await response.json();
        return manifest.packs.map(normalizeSamplePack);
    } catch (error) {
        console.error('Error loading sample manifest:', error);
        return [];
    }
};

// We keep this exported for backward compatibility during the transition.
export const SAMPLE_PACKS: SamplePack[] = [];
