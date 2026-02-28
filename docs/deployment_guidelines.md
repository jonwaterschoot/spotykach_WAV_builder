# Deployment & Asset Management Guidelines

This document provides a technical overview of the asset path resolution system and the pitfalls encountered during the versioned deployment (v1/v2) of the Spotykach WAV Builder. Use this as a reference for future developers or AI agents.

## 1. Asset Path Resolution Architecture

We use a unified utility, `src/utils/assetUtils.ts`, to resolve all paths. This is critical because the app is deployed in subdirectories (e.g., `/spotykach_WAV_builder/v2/`).

### Key Principles:
- **Absolute URLs**: Handled as-is (e.g., `https://...`).
- **External Samples**: Paths matching `/samples/*.flac` are redirected to GitHub Releases (`samples-v1`).
- **Subdirectory Assets**: Visual assets (textures, videos) are prefixed with `import.meta.env.BASE_URL`.
- **Idempotency**: `resolveAssetPath` checks if a path is already resolved to prevent "double-prefixing" errors.

> [!IMPORTANT]
> Always use `resolveAssetPath(path)` for local assets. Avoid hardcoded string concatenation like `` `${imgPath}${filename}` ``.

## 2. The Build Pipeline Pitfalls

The `scripts/build-versioned-pages.mjs` script performs post-build surgery on the JS chunks.

### What went wrong (and how it was fixed):
1. **Regex Over-Aggression**: 
   - *Problem*: Initial regex was too strict (`^/samples/`), missing paths that Vite had already prefixed.
   - *Fix*: Broadened regex to match `*/samples/*` anywhere in the string.
2. **Path Mangling (Filename-only)**:
   - *Problem*: When `SAMPLE_ASSET_BASE_URL` was missing, the script replaced full valid paths with just the leaf filename, breaking absolute resolution.
   - *Fix*: Added a check to skip rewriting if the base URL is empty.
3. **Internal vs External Logic**:
   - *Problem*: Redirection to GitHub Releases was being bypassed because the logic for base URL prefixing came first.
   - *Fix*: External sample detection must always take precedence over local prefixing.

## 3. Legacy Migration (v1)

When moving a legacy site into a subdirectory:
- **Hardcoded Roots**: Legacy HTML often has root-relative paths like `/assets/...`.
- **Fix**: These must be manually or programmatically patched to `/v1/assets/...` to match the new host structure.

## 4. Deployment Size Management

- To prevent GitHub Pages from hitting limits (previously **1.2GB**), audio files are pruned from the `dist` folder after the build.
- The build script uses `removeAudioFilesRecursively` to ensure the final bundle only contains UI code (~68MB), while samples are fetched on-demand from GitHub Releases.

---
**Current Stable Version**: 2.3.0
**Primary Asset URL**: [GitHub Releases - samples-v1](https://github.com/jonwaterschoot/spotykach_WAV_builder/releases/tag/samples-v1)
