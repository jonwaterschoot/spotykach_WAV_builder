/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_SAMPLE_ASSET_BASE_URL?: string;
  /**
   * Overrides the storage namespace derived from BASE_URL. See
   * `src/utils/storageNamespace.ts` and locked decision 9 — a preview build must
   * not share IndexedDB (or its saved directory handles) with the real app.
   */
  readonly VITE_STORAGE_NS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  showDirectoryPicker(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>;
}

/**
 * The File System Access API's async iterators, which TypeScript's DOM lib still
 * doesn't declare. The codebase reaches for them at ~20 call sites and had been
 * `@ts-ignore`-ing each one; declared once here instead, so new code can iterate a
 * directory without suppressing the type checker.
 */
interface FileSystemDirectoryHandle {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
  values(): AsyncIterableIterator<FileSystemHandle>;
  keys(): AsyncIterableIterator<string>;
}
