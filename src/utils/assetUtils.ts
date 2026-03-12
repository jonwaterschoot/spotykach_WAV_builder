/**
 * Utility to resolve asset paths for the application.
 * Handles both external sample assets (from GitHub Releases) 
 * and internal assets (videos, images) that need base path prefixing.
 */

// External sample asset base URL (e.g., pointing to GitHub Releases or CDN)
// We default to jsDelivr which supports CORS and preserves the repository structure.
const DEFAULT_SAMPLE_BASE_URL = 'https://cdn.jsdelivr.net/gh/jonwaterschoot/spotykach_WAV_builder@main/public';
const externalSampleAssetBaseUrl = (import.meta.env.VITE_SAMPLE_ASSET_BASE_URL || DEFAULT_SAMPLE_BASE_URL).replace(/\/+$/, '');

// Internal application base URL (provided by Vite)
const appBaseUrl = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');

const absoluteUrlPattern = /^(?:[a-z]+:)?\/\//i;
const audioSamplePathPattern = /\/samples\/.+\.(?:wav|flac)$/i;

/**
 * Resolves an asset path to its final URL.
 * 
 * 1. Absolute URLs are returned as-is.
 * 2. Audio samples (/samples/...) are resolved against VITE_SAMPLE_ASSET_BASE_URL (or jsDelivr) if set.
 * 3. Other relative paths are prefixed with the app's BASE_URL (e.g. for /vid/, /assets/).
 * 
 * @param path The relative path to the asset (e.g., "/vid/video.mp4" or "/samples/kick.wav")
 * @returns The resolved URL
 */
export const resolveAssetPath = (path: string): string => {
    if (!path) return '';

    // 1. If it's already an absolute URL, return it
    if (absoluteUrlPattern.test(path)) {
        return path;
    }

    // 2. Specialized handling for audio samples (external hosting)
    // We check this BEFORE early-returning for appBaseUrl to handle cases where 
    // the path is already prefixed but needs redirection to external storage.
    if (audioSamplePathPattern.test(path)) {
        if (externalSampleAssetBaseUrl) {
            // Prepend the external base URL to the relative path (preserving folder hierarchy)
            const normalizedPath = path.startsWith('/') ? path : `/${path}`;
            return `${externalSampleAssetBaseUrl}${normalizedPath}`;
        }
    }

    // 3. Prevent double-prefixing for non-sample assets
    // If it already starts with appBaseUrl (and appBaseUrl isn't just /), return it
    if (appBaseUrl && appBaseUrl !== '/' && path.startsWith(appBaseUrl)) {
        return path;
    }

    // 4. General internal assets (handle subdirectories like /v2/)
    // Ensure the path starts with a slash for consistent joining
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;

    // If we're at the root, just return the path
    if (!appBaseUrl || appBaseUrl === '/') {
        return normalizedPath;
    }

    // Otherwise prefix with base URL
    return `${appBaseUrl}${normalizedPath}`;
};
