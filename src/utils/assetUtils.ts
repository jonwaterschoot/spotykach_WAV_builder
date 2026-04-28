/**
 * Utility to resolve asset paths for the application.
 */

// R2 Public URL for samples (Hardcoded fallback for reliability)
export const R2_SAMPLE_BASE_URL = 'https://pub-6649b937be6b4a8c9b92904c5ac392fc.r2.dev';

// Access import.meta.env safely
const getEnv = (key: string): string | undefined => {
    try {
        const val = (import.meta.env as any)[key];
        return val === '' ? undefined : val;
    } catch {
        return undefined;
    }
};

export const externalSampleAssetBaseUrl = (
    getEnv('VITE_SAMPLE_ASSET_BASE_URL') || 
    R2_SAMPLE_BASE_URL
).replace(/\/+$/, '');

const appBaseUrl = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
const absoluteUrlPattern = /^(?:[a-z]+:)?\/\//i;

/**
 * Resolves an asset path to its final URL.
 */
export const resolveAssetPath = (path: string): string => {
    if (!path) return '';
    if (absoluteUrlPattern.test(path)) return path;

    // Normalize path to start with /
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;

    // DETECT EXTERNAL R2 ASSETS
    // Any path that isn't a known internal asset or the root is treated as an R2 candidate.
    const internalPaths = [
        '/manifest.json', '/favicon.ico', '/vite.svg', '/assets', 
        '/img', '/vid', '/v2', '/ffmpeg-core', '/ffmpeg-worker', 
        '/spotykachtapeicon.svg', '/spotytape.svg', '/og-image.png',
        '/presets', '/news'
    ];
    
    const pathWithoutBase = (appBaseUrl && appBaseUrl !== '/' && normalizedPath.startsWith(appBaseUrl))
        ? normalizedPath.slice(appBaseUrl.length)
        : normalizedPath;

    const isInternal = internalPaths.some(p => pathWithoutBase.startsWith(p));
    
    // It's R2 if it's not internal, not the root, and looks like a deep path (e.g. /pack/file)
    const isR2 = !isInternal && pathWithoutBase !== '/' && (
        pathWithoutBase.startsWith('/samples/') || 
        pathWithoutBase.includes('/', 1)
    );

    if (isR2) {
        // Fallback to R2_SAMPLE_BASE_URL if the env-derived one is somehow empty
        const baseUrl = externalSampleAssetBaseUrl || R2_SAMPLE_BASE_URL;
        
        // Ensure the path includes the /samples/ prefix for R2 assets
        const r2Path = normalizedPath.startsWith('/samples/') 
            ? normalizedPath 
            : `/samples${normalizedPath}`;
            
        return `${baseUrl}${r2Path}`;
    }

    // INTERNAL ASSETS
    if (appBaseUrl && appBaseUrl !== '/' && normalizedPath.startsWith(appBaseUrl)) {
        return normalizedPath;
    }

    if (!appBaseUrl || appBaseUrl === '/') {
        return normalizedPath;
    }

    return `${appBaseUrl}${normalizedPath}`;
};

export const hashBlob = async (source: Blob | File): Promise<string> => {
    const buf = await source.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(digest))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
};
