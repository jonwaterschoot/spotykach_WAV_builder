import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AudioWaveform, Check, ChevronDown, ChevronLeft, ChevronUp, Database, Download, FilePlus,
  FileStack, FolderPlus, GripVertical, HardDrive, Layers, Loader, Pause, Play, Trash2, Upload, X,
} from 'lucide-react';
import { audioEngine } from '../lib/audio/audioEngine';
import {
  buildDetachedState, slotLabelForIndex, tapeForIndex, GRID_CAPACITY, type DetachedSample,
} from '../utils/detachedState';
import { useEscapeLayer } from '../shell/escapeStack';
import {
  clearBrowsePoolFromDB, loadBrowsePoolCopiesFromDB, loadBrowsePoolFromDB, loadUserLibraryFromDB,
  saveBrowsePoolCopiesToDB, saveBrowsePoolToDB,
} from '../utils/persistence';
import { ConfirmModal } from '../components/ConfirmModal';
import { ExportProgressModal } from '../components/ExportProgressModal';
import { Toast } from '../components/Toast';
import { useToasts } from '../shell/useToasts';
import { appStorage } from '../utils/storageNamespace';
import { ProjectNameModal } from '../components/modals/ProjectNameModal';
import { WorkspaceChoiceModal } from '../components/modals/WorkspaceChoiceModal';
import { ProjectCreatedModal } from '../shell/ProjectCreatedModal';
import { canPickFolder, ensureWorkspacePermission } from '../utils/newProject';
import { getDirectoryHandle } from '../utils/storageUtils';
import { isSampleDrag } from '../utils/dragTypes';
import { COLOR_MAP, TAPE_COLORS } from '../types';
import type { AppState, UserLibrary } from '../types';

const SampleBrowser = React.lazy(() =>
  import('../components/SampleBrowser').then(m => ({ default: m.SampleBrowser }))
);

// The editor is the heaviest thing Browse can open — wavesurfer, the processor, the
// overlays. Lazy so a visit that never edits anything never downloads it.
const LooseFileEditor = React.lazy(() =>
  import('./EditorMode').then(m => ({ default: m.LooseFileEditor }))
);

/** A pooled sample: decoded, belonging to no project, kept in this browser. */
interface PoolItem extends DetachedSample {
  id: string;
  /** The browser's own key for this sample, so the pool can mark it as taken. */
  sourcePath?: string;
  /** An edit has been applied since it was pooled — the row says so. */
  edited?: boolean;
  /** The file as it was pooled. `blob` is the current version; this is the other one. */
  originalBlob: Blob;
  originalDuration: number;
}

/** How long a change waits before the pool is written back. */
const POOL_SAVE_DEBOUNCE_MS = 600;

/** Whether the export block under the pool is unfolded. Remembered between visits. */
const EXPORTS_OPEN_KEY = 'browse_exports_open';

/**
 * What the pool will try to decode off the desktop.
 *
 * The extension list is the fallback, not the test: a WAV dragged out of some file
 * managers arrives with an empty `type`, and refusing it because the OS declined to
 * guess would be the app's fault, not the file's. Anything that gets past this and
 * still can't be decoded is counted and reported.
 */
const AUDIO_EXTENSIONS = /\.(wav|mp3|flac|aiff?|ogg|oga|m4a|aac|opus|webm)$/i;
const isAudioFile = (file: File) => file.type.startsWith('audio/') || AUDIO_EXTENSIONS.test(file.name);

/** True only for a drag carrying files from outside the page, not a pool row being reordered. */
const isFileDrag = (e: React.DragEvent) => Array.from(e.dataTransfer?.types || []).includes('Files');

/**
 * What the pool column will take from a drag it didn't start: files off the desktop,
 * or sample rows out of the browser beside it. `null` is a pool row being reordered,
 * which the rows handle themselves.
 */
const dropKind = (e: React.DragEvent): 'files' | 'samples' | null =>
  isFileDrag(e) ? 'files' : isSampleDrag(e) ? 'samples' : null;

const newId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2, 15);

const formatDuration = (seconds: number) => {
  if (!seconds || !isFinite(seconds)) return '--';
  return `${seconds.toFixed(1)}s`;
};

const stripExtension = (name: string) => name.replace(/\.[^/.]+$/, '');

/** The file's own name at the source, so a loose export hands back what the user recognises. */
const fileNameFromSource = (url: string, fallback: string) => {
  if (url.startsWith('blob:')) return fallback;
  try {
    const last = url.split(/[?#]/)[0].split('/').pop();
    return last ? decodeURIComponent(last) : fallback;
  } catch {
    return fallback;
  }
};

/**
 * The README that ships with the loose download.
 *
 * `generateReadme` describes a built 6×6 card, which is exactly what this export
 * isn't — so it would tell the reader their files are somewhere they aren't.
 */
const buildLooseReadme = (items: PoolItem[], sortedIntoTapes: boolean): string => {
  const date = new Date().toISOString().split('T')[0];
  const credits = items
    .map(item => `- ${stripExtension(item.fileName || item.name)}.wav${item.origin ? `  (${item.origin})` : ''}`)
    .join('\n');

  // Grouped by origin, not flattened into one set: a selection drawn from two packs
  // produced two licences run together as if they were a single statement, with no
  // way to tell which belonged to whom. Same `[origin] → licence` shape `generateReadme`
  // uses for a built card.
  const byOrigin = new Map<string, Set<string>>();
  items.forEach(item => {
    if (!item.license) return;
    const origin = item.origin || 'Unknown origin';
    const licenses = byOrigin.get(origin) ?? new Set<string>();
    licenses.add(item.license);
    byOrigin.set(origin, licenses);
  });

  const usageContext = Array.from(byOrigin.entries())
    .map(([origin, licenses]) =>
      Array.from(licenses).map(license => `- [${origin}]  →  ${license}`).join('\n'))
    .join('\n');

  return `# Spotykach loose file export

Date: ${date}
Files: ${items.length}

## What these are

Every file here is already in the format the Spotykach firmware reads:
**48 kHz · stereo · 32-bit float WAV**. You do not need to convert anything.

Names are the originals, so you can still tell what is what.

## What they are not

They are **not** organised for the hardware. The device reads a fixed structure
with fixed names:

\`\`\`
SK/
  B/   1.WAV … 6.WAV      Blue tape
  G/   1.WAV … 6.WAV      Green tape
  P/   1.WAV … 6.WAV      Pink tape
  R/   1.WAV … 6.WAV      Red tape
  T/   1.WAV … 6.WAV      Turquoise tape
  Y/   1.WAV … 6.WAV      Yellow tape
\`\`\`

To use these on the device: create that structure on the card, copy in the files
you want, and rename each one to its slot number. Recent firmware accepts both
\`.WAV\` and \`.wav\`.

${sortedIntoTapes
      ? 'This ZIP is already grouped into tape folders (B/G/P/R/T/Y, plus POOL for\nanything past the 36 slots). The names inside them still need changing to\n1.WAV … 6.WAV.'
      : 'This ZIP is a flat list, with no tape folders. Tick "Sort this ZIP into tape\nfolders", under the "Download the files" button in Browse, if you would rather\nhave the grouping done for you.'}

Want none of this by hand? Use **Download SD card 6×6** in Browse, which builds
the whole \`SK/\` folder ready to copy, or open Studio for a full project.

## Files
${credits}
${usageContext ? `\n## Usage context\n\nOne line per pack. Each licence covers only the files credited to that pack above.\n\n${usageContext}\n` : ''}`;
};

interface BrowseModeProps {
  onExitToHub: () => void;
  /** Offered after the pool becomes a project. Absent when the shell gave no route. */
  onEnterStudio?: () => void;
  /**
   * The pack page's "use the preset" link. The id names the preset to open on;
   * the pool survives the trip, so this is a plain route and not a warning.
   */
  onEnterPresets?: (presetId?: string) => void;
}

/**
 * Tier 1 — the browse-only surface at `#/browse`.
 *
 * No project, no work folder, no permission prompt: samples are fetched, decoded
 * into memory and collected in a pool. The two exits are downloads, built by
 * handing `buildDetachedState(pool)` to the exporters Studio already uses. Nothing
 * here writes IndexedDB's app-state slot (locked decision 5) — the pool lives and
 * dies with the mode.
 */
export const BrowseMode: React.FC<BrowseModeProps> = ({ onExitToHub, onEnterStudio, onEnterPresets }) => {
  const [pool, setPool] = useState<PoolItem[]>([]);
  const [isPoolOpen, setIsPoolOpen] = useState(false);
  const [userLibrary, setUserLibrary] = useState<UserLibrary | undefined>(undefined);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [sortLooseIntoTapes, setSortLooseIntoTapes] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [createdProject, setCreatedProject] = useState<string | null>(null);

  // The workspace step between the name and the picker — round 4. `pendingName` is
  // the project waiting on that answer; `knownWorkspace` is the folder the app has
  // already stored, read for its name without asking for permission.
  const [pendingName, setPendingName] = useState<string | null>(null);
  const [knownWorkspace, setKnownWorkspace] = useState<FileSystemDirectoryHandle | null>(null);

  const [exportLogs, setExportLogs] = useState<string[]>([]);
  const [exportProgress, setExportProgress] = useState<number | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportComplete, setIsExportComplete] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [showExportProgress, setShowExportProgress] = useState(false);

  // Auditioning a pooled file. There is one player in this mode and it belongs to the
  // browser: a pool row asks for its blob, and the request comes back with the
  // transport bar, the scrubber, the name and locate that the browser's own rows get.
  const [playRequest, setPlayRequest] =
    useState<{ key: string; name: string; blob: Blob; nonce: number } | null>(null);
  const [playingPoolId, setPlayingPoolId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const nonceRef = useRef(0);

  /** The pool row to scroll to and glow, when locate points here. */
  const [locatedPoolId, setLocatedPoolId] = useState<string | null>(null);
  const poolListRef = useRef<HTMLDivElement | null>(null);

  // Files arriving straight from the desktop, by button or by drop.
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isAddingFiles, setIsAddingFiles] = useState(false);
  /** What is currently hovering the column, if anything — it decides what the overlay says. */
  const [dropOver, setDropOver] = useState<'files' | 'samples' | null>(null);
  // `dragleave` fires for every child the pointer crosses, so the highlight is kept
  // on a depth count rather than on the last event to arrive.
  const dragDepth = useRef(0);

  /**
   * A drag of sample rows, in flight.
   *
   * The count is state because the overlay says it; the commit is a ref because the
   * drop handler must read it in the same tick it fires, before `dragend` clears it.
   * See `onSampleDrag` in `SampleBrowser` for why the payload is a thunk.
   */
  const [sampleDragCount, setSampleDragCount] = useState(0);
  const sampleDragCommit = useRef<null | (() => Promise<void>)>(null);
  const [isDroppingSamples, setIsDroppingSamples] = useState(false);

  /**
   * The export block is folded away by choice, and the choice is remembered.
   *
   * It is four buttons, a checkbox and three paragraphs at the foot of a column whose
   * actual content is the list above it. Collapsing hands that space back without
   * hiding anything the user hasn't chosen to hide.
   */
  const [exportsOpen, setExportsOpen] = useState(() => appStorage.getItem(EXPORTS_OPEN_KEY) !== '0');

  const toggleExports = useCallback(() => {
    setExportsOpen(prev => {
      appStorage.setItem(EXPORTS_OPEN_KEY, prev ? '0' : '1');
      return !prev;
    });
  }, []);

  const { toasts, showToast, removeToast } = useToasts();

  const poolRef = useRef<PoolItem[]>(pool);
  poolRef.current = pool;

  /**
   * Projects this pool has been copied into — R2-9.
   *
   * A record, not a link: see `saveBrowsePoolCopiesToDB`. Persisted, because the pool
   * itself now survives a refresh and a warning that evaporates on the reload is a
   * warning that is missing exactly when it matters.
   */
  const [copiedInto, setCopiedInto] = useState<string[]>([]);

  /** True once the mount-time read of the pool store has resolved. */
  const [isHydrated, setIsHydrated] = useState(false);
  const isSavingPoolRef = useRef(false);
  const pendingPoolRef = useRef<PoolItem[] | null>(null);

  // The library is IDB-resident with its own store, so reading it costs no folder
  // and no prompt. Shown read-only, and only when the visitor actually has one.
  useEffect(() => {
    let cancelled = false;
    loadUserLibraryFromDB()
      .then(library => {
        if (cancelled || !library || Object.keys(library.files || {}).length === 0) return;
        setUserLibrary(library);
      })
      .catch(e => console.warn('Could not read user library', e));
    return () => { cancelled = true; };
  }, []);

  // ──────────────────────────────────────────────────────────────────────────
  // The pool survives the mode — R2-4
  //
  // It used to be React state that lived and died with `BrowseMode`, so leaving for
  // the hub and coming back emptied it, and a refresh took the edit history with it.
  // It now has its own IDB store, namespaced like every other store, so a preview
  // build never shares a pool with the live app. The `app-state` slot is still
  // untouched — locked decision 5 stands.
  // ──────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    loadBrowsePoolFromDB()
      .then(entries => {
        if (cancelled || entries.length === 0) return;
        // Anything added while the read was in flight wins — the restore is what
        // must not clobber, which is the trap auto-save hit in Phase 7.
        setPool(prev => (prev.length > 0 ? prev : entries.map(entry => ({
          id: entry.id,
          name: entry.name,
          fileName: entry.fileName,
          blob: entry.current,
          originalBlob: entry.original,
          duration: entry.duration,
          originalDuration: entry.originalDuration ?? entry.duration,
          origin: entry.origin,
          license: entry.license,
          sourceSamplePath: entry.sourceSamplePath,
          sourcePath: entry.sourcePath,
          edited: entry.edited,
        }))));
        setIsPoolOpen(true);
      })
      .catch(e => console.warn('Could not read the temporary pool', e))
      .finally(() => { if (!cancelled) setIsHydrated(true); });
    return () => { cancelled = true; };
  }, []);

  // Read for its `name` only. A stored handle costs no permission to look at, which
  // is what lets Browse say "you already have a workspace" without becoming a mode
  // that holds one.
  useEffect(() => {
    let cancelled = false;
    getDirectoryHandle('work')
      .then(handle => { if (!cancelled) setKnownWorkspace(handle); })
      .catch(e => console.warn('Could not read the stored workspace handle', e));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadBrowsePoolCopiesFromDB()
      .then(names => { if (!cancelled && names.length > 0) setCopiedInto(names); })
      .catch(e => console.warn('Could not read where the pool was copied', e));
    return () => { cancelled = true; };
  }, []);

  /** One write, followed by whatever arrived while it was running. */
  const runPoolSave = useCallback(async (snapshot: PoolItem[]) => {
    isSavingPoolRef.current = true;
    try {
      if (snapshot.length === 0) {
        await clearBrowsePoolFromDB();
      } else {
        await saveBrowsePoolToDB(snapshot.map(item => ({
          id: item.id,
          name: item.name,
          fileName: item.fileName,
          duration: item.duration || 0,
          originalDuration: item.originalDuration,
          origin: item.origin,
          license: item.license,
          sourceSamplePath: item.sourceSamplePath,
          sourcePath: item.sourcePath,
          edited: item.edited,
          original: item.originalBlob,
          current: item.blob,
        })));
      }
    } finally {
      isSavingPoolRef.current = false;
    }
    const queued = pendingPoolRef.current;
    if (queued) {
      pendingPoolRef.current = null;
      void runPoolSave(queued);
    }
  }, []);

  /**
   * Gated on the mount-time load, so the empty initial state can never overwrite the
   * snapshot it is about to be replaced by. Writes are serialised for the same reason
   * auto-save serialises its own: every entry carries two audio blobs, so a slow
   * write must not be overtaken by the next one.
   */
  useEffect(() => {
    if (!isHydrated) return;
    const timer = setTimeout(() => {
      if (isSavingPoolRef.current) {
        pendingPoolRef.current = pool;
        return;
      }
      void runPoolSave(pool);
    }, POOL_SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [pool, isHydrated, runPoolSave]);

  useEscapeLayer(true, () => {
    // The editor sits on top and handles its own Escape; don't close the pool under it.
    if (editingId) return false;
    if (isPoolOpen) {
      setIsPoolOpen(false);
      return true;
    }
    return false;
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Pool
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * The browser hands us a URL — a remote asset path, or an object URL it minted
   * for a blob it already holds. Either way we fetch, decode to the 48 kHz WAV the
   * hardware wants, and keep the result in memory.
   */
  const addToPool = useCallback(async (
    url: string,
    name: string,
    origin?: string,
    license?: string,
    sourcePath?: string,
  ): Promise<string> => {
    const isObjectUrl = url.startsWith('blob:');
    try {
      const response = await fetch(url, { mode: 'cors' });
      if (!response.ok) throw new Error(`Download failed (${response.status})`);
      const blob = await response.blob();
      const { buffer, blob: processedBlob } = await audioEngine.loadAndProcessAudio(blob);

      // Minted up front rather than inside the updater, so the caller can hand this
      // entry straight to the editor — that is what the browser row's pen does.
      const id = newId();
      setPool(prev => [...prev, {
        id,
        name,
        fileName: fileNameFromSource(url, name),
        blob: processedBlob,
        originalBlob: processedBlob,
        duration: buffer.duration,
        originalDuration: buffer.duration,
        origin,
        license,
        sourceSamplePath: isObjectUrl ? undefined : url,
        sourcePath,
      }]);
      setIsPoolOpen(true);
      return id;
    } catch (e) {
      console.error(`Could not add ${name} to the pool`, e);
      throw e;
    } finally {
      if (isObjectUrl) URL.revokeObjectURL(url);
    }
  }, []);

  const addManyToPool = useCallback(async (
    samples: { url: string, name: string, path?: string }[],
    origin?: string,
    license?: string,
  ) => {
    for (const sample of samples) {
      try {
        await addToPool(sample.url, sample.name, origin, license, sample.path);
      } catch {
        // One bad sample shouldn't abandon the rest of the selection.
      }
    }
  }, [addToPool]);

  /**
   * Files off the desktop, by the header's button or by a drop on the column.
   *
   * Mounting a folder through "Local folders" was the only way in for a file that
   * isn't in a pack, which is a lot of ceremony for the three loops someone dragged
   * out of their DAW. This asks for nothing: a file input and a drop target both hand
   * back `File` objects, which `addToPool` already knows how to take through an object
   * URL, and nothing about the folder they came from is retained or accessible.
   *
   * One summary at the end rather than a toast per file: adding eight files should
   * not cost eight dismissals.
   */
  const addLocalFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;

    const audio = files.filter(isAudioFile);
    const skipped = files.length - audio.length;

    if (audio.length === 0) {
      showToast(
        skipped === 1
          ? 'That file is not audio this browser can read.'
          : 'None of those files are audio this browser can read.',
        'warning'
      );
      return;
    }

    setIsAddingFiles(true);
    let added = 0;
    let failed = 0;
    for (const file of audio) {
      const url = URL.createObjectURL(file);
      try {
        // 'Local file' rather than a path: this is the whole provenance there is, and
        // it is what the loose export's credits will say beside the name.
        await addToPool(url, file.name, 'Local file');
        added += 1;
      } catch {
        failed += 1; // `addToPool` logged it and revoked the URL.
      }
    }
    setIsAddingFiles(false);

    const ignored = skipped + failed;
    if (added === 0) {
      showToast('Nothing could be decoded from those files.', 'error');
      return;
    }
    showToast(
      `Added ${added} file${added === 1 ? '' : 's'} to the pool${ignored > 0 ? `, ${ignored} skipped` : ''}.`,
      ignored > 0 ? 'warning' : 'success'
    );
  }, [addToPool, showToast]);

  const handleFilePick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    // Cleared so picking the same file twice in a row still fires a change event.
    e.target.value = '';
    void addLocalFiles(picked);
  }, [addLocalFiles]);

  /**
   * Sample rows let go over the pool — the same import the row's button does, asked
   * for with the hand. The browser kept the payload; all that crossed the boundary
   * was a marker type, so this is where the object URLs are finally minted.
   */
  const commitSampleDrop = useCallback(async () => {
    const commit = sampleDragCommit.current;
    sampleDragCommit.current = null;
    if (!commit) return;

    setIsDroppingSamples(true);
    try {
      await commit();
    } catch (e) {
      console.error('Could not add the dropped samples', e);
      showToast('Those samples could not be added to the pool.', 'error');
    } finally {
      setIsDroppingSamples(false);
    }
  }, [showToast]);

  const handleColumnDrop = useCallback((e: React.DragEvent) => {
    const kind = dropKind(e);
    if (!kind) return; // A pool row being reordered; the list handles its own.
    e.preventDefault();
    dragDepth.current = 0;
    setDropOver(null);

    if (kind === 'samples') {
      void commitSampleDrop();
      return;
    }

    // A dropped folder arrives as one entry with no type, so it would otherwise be
    // reported as a file that isn't audio. Browse has a door for folders already.
    const droppedFolder = Array.from(e.dataTransfer.items || [])
      .some(item => item.kind === 'file' && item.webkitGetAsEntry?.()?.isDirectory);
    const files = Array.from(e.dataTransfer.files || []);

    if (droppedFolder) {
      showToast('Folders are skipped here. Open one through “Local folders” on the left.', 'warning');
      void addLocalFiles(files.filter(isAudioFile));
      return;
    }
    void addLocalFiles(files);
  }, [addLocalFiles, showToast, commitSampleDrop]);

  /**
   * The whole mode tolerates a sample drag, so the cursor never wears the "forbidden"
   * sign on its way to the pool.
   *
   * There is no third state in HTML5 drag and drop: an element that doesn't
   * `preventDefault` its `dragover` gets `no-drop` under the pointer, and a
   * `dropEffect` of `'none'` draws the same thing. So the mode as a whole accepts the
   * drag and does nothing with it, and the pool stays the only place that *looks*
   * like a target — it is the thing that lights up green and counts what is coming.
   *
   * Deliberately narrowed to our own drag: a file dragged in from the desktop still
   * gets the browser's default treatment everywhere except the pool column.
   */
  const tolerateSampleDrag = useCallback((e: React.DragEvent) => {
    if (!isSampleDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  /**
   * Let go short of the pool. Nothing is imported — `commitSampleDrop` has already
   * taken the payload if the drop was over the column, and this only stops the event
   * from reaching the page underneath.
   */
  const swallowStraySampleDrop = useCallback((e: React.DragEvent) => {
    if (!isSampleDrag(e)) return;
    e.preventDefault();
  }, []);

  /**
   * A sample drag beginning or ending in the browser beside us.
   *
   * The pool is opened on the way in: it is the only target, and a drag towards a
   * column that isn't on screen has nowhere to land.
   */
  const handleSampleDrag = useCallback((drag: { count: number; commit: () => Promise<void> } | null) => {
    sampleDragCommit.current = drag?.commit ?? null;
    setSampleDragCount(drag?.count ?? 0);
    if (drag) {
      setIsPoolOpen(true);
      return;
    }
    // Dragend, dropped or not — the highlight must not outlive the drag.
    dragDepth.current = 0;
    setDropOver(null);
  }, []);

  // ──────────────────────────────────────────────────────────────────────────
  // Auditioning what's in the pool
  // ──────────────────────────────────────────────────────────────────────────

  /** The browser's key for a pooled blob — no row of its own owns this path. */
  const poolPlayKey = (id: string) => `pool:${id}`;

  /**
   * Ask the browser to play this entry as it now stands. Repeating the request for
   * the entry already loaded is how play/pause toggles, which is why the nonce
   * matters: without it a second click on the same row is the same object and the
   * browser never hears about it.
   */
  const requestPoolPlay = useCallback((item: PoolItem) => {
    nonceRef.current += 1;
    setPlayRequest({
      key: poolPlayKey(item.id),
      name: item.name,
      blob: item.blob,
      nonce: nonceRef.current,
    });
  }, []);

  /** The blob behind the request is gone or replaced; the player must let go of it. */
  const dropPlayRequestFor = useCallback((id: string) => {
    setPlayRequest(prev => (prev && prev.key === poolPlayKey(id) ? null : prev));
  }, []);

  /**
   * What the one player is on. A key with our prefix is a pool row; anything else is
   * one of the browser's own sources, which means no pool row is playing.
   */
  const handlePlaybackChange = useCallback((key: string | null, playing: boolean) => {
    const id = key?.startsWith('pool:') ? key.slice('pool:'.length) : null;
    setPlayingPoolId(id);
    setIsPlaying(playing);
  }, []);

  /**
   * Locate, arriving from the browser's player. Two cases share this door: a file
   * playing from one of the browser's own sources that also happens to be pooled,
   * and a pooled blob we asked the browser to play, whose only home is the pool.
   */
  const locateInPool = useCallback((key: string) => {
    const id = key.startsWith('pool:')
      ? key.slice('pool:'.length)
      : poolRef.current.find(item => item.sourcePath === key)?.id;
    if (!id) return;
    setIsPoolOpen(true);
    setLocatedPoolId(id);
  }, []);

  useEffect(() => {
    if (!locatedPoolId) return;
    poolListRef.current
      ?.querySelector(`[data-pool-id="${locatedPoolId}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const timer = setTimeout(() => setLocatedPoolId(null), 4000);
    return () => clearTimeout(timer);
  }, [locatedPoolId]);

  const removeFromPool = (id: string) => {
    dropPlayRequestFor(id);
    setPool(prev => prev.filter(item => item.id !== id));
  };

  /**
   * The pen on a browser row — Phase 7, step 5, open item G.
   *
   * The editor already opened over Browse, but only from a pool row: trimming one
   * sample meant first building a selection, which is a concept the user hadn't
   * asked for. The pen pools the file *and* opens the editor on it in one step, so
   * an applied edit lands somewhere that already has endings — both downloads and
   * "import into a project" keep working, with no second set of exits to maintain.
   */
  const editFromBrowser = useCallback(async (
    url: string,
    name: string,
    origin?: string,
    license?: string,
    sourcePath?: string,
  ) => {
    const id = await addToPool(url, name, origin, license, sourcePath);
    setEditingId(id);
  }, [addToPool]);

  /**
   * Single-file edit before download — open question 5's fourth exit.
   *
   * The editor opens over Browse rather than routing to `#/editor`, so the rest of
   * the pool survives the trip. Applied edits come back through `onEdited` and
   * replace the pooled blob in place, which means both downloads below pick up the
   * edit with no "keep this?" step to forget.
   */
  const editingItem = useMemo(
    () => pool.find(item => item.id === editingId) ?? null,
    [pool, editingId]
  );

  const applyEdit = useCallback((id: string, blob: Blob, duration: number, name: string) => {
    // The player is holding an object URL for the blob this replaces. Retracting the
    // request drops it; the next play on this row mints a fresh one for the new blob.
    dropPlayRequestFor(id);
    setPool(prev => prev.map(item => (
      item.id === id ? { ...item, blob, duration, name, edited: true } : item
    )));
  }, [dropPlayRequestFor]);

  /** One file straight out of the pool — no ZIP, no grid. */
  const downloadOne = async (item: PoolItem) => {
    const { exportSingleFile } = await import('../utils/exportUtils');
    await exportSingleFile({
      versions: [{ id: item.id, blob: item.blob }],
      currentVersionId: item.id,
      name: stripExtension(item.fileName || item.name),
    });
  };

  const movePoolItem = (from: number, to: number) => {
    setPool(prev => {
      if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  /**
   * What the browser should show as already taken. Derived from the pool rather
   * than from a one-way "I imported this" set, so the mark survives switching packs
   * and disappears again when the entry is removed here.
   */
  const pooledPaths = useMemo(
    () => new Set(pool.map(item => item.sourcePath).filter((p): p is string => !!p)),
    [pool]
  );

  // ──────────────────────────────────────────────────────────────────────────
  // Downloads — both are `buildDetachedState` plus an existing exporter
  // ──────────────────────────────────────────────────────────────────────────

  const runExport = async (
    label: string,
    run: (state: AppState, onProgress: (msg: string | undefined, progress?: number) => void) => Promise<void>
  ) => {
    if (poolRef.current.length === 0 || isExporting) return;

    setShowExportProgress(true);
    setIsExporting(true);
    setIsExportComplete(false);
    setExportError(null);
    setExportProgress(0);
    setExportLogs([label]);

    const onProgress = (msg: string | undefined, progress?: number) => {
      if (msg) setExportLogs(prev => (prev[prev.length - 1] === msg ? prev : [...prev, msg]));
      if (typeof progress === 'number') setExportProgress(progress);
    };

    try {
      await run(buildDetachedState(poolRef.current), onProgress);
      setExportProgress(100);
    } catch (e) {
      console.error(e);
      setExportError(e instanceof Error ? e.message : 'Export failed.');
    } finally {
      setIsExporting(false);
      setIsExportComplete(true);
    }
  };

  /**
   * Neither export passes `onConvert`.
   *
   * Studio needs that hook because its files can be anything a project ever picked
   * up. Here every pooled blob has already been through `audioEngine.loadAndProcessAudio`
   * on the way in, and `encodeWAV` emits exactly what `convertAudioToWav` does —
   * 48 kHz, stereo, 32-bit IEEE float, plain 16-byte `fmt ` chunk, no `fact`. Running
   * ffmpeg-wasm over it would re-encode identical bytes and make a tier whose whole
   * premise is "no setup" pull ~30 MB of wasm first.
   */

  /** Everything in the pool, original names, no 36-slot ceiling. */
  const downloadLooseFiles = () => runExport('Building loose files…', async (state, onProgress) => {
    const { exportFilesOnly } = await import('../utils/exportUtils');
    // The grid renames files to their slot; a loose export shouldn't. `originalName`
    // carries the source filename, and exportFilesOnly appends the extension itself.
    const named: AppState = {
      ...state,
      files: Object.fromEntries(
        Object.entries(state.files).map(([id, file]) => [
          id,
          { ...file, name: stripExtension(file.originalName || file.name) },
        ])
      ),
    };
    await exportFilesOnly(named, {
      fileIds: Object.keys(named.files),
      keepStructure: sortLooseIntoTapes,
      readme: buildLooseReadme(poolRef.current, sortLooseIntoTapes),
    }, onProgress);
  });

  /** The first 36, laid out and renamed exactly as the firmware reads them. */
  const downloadSDStructure = () => runExport('Building SD card structure…', async (state, onProgress) => {
    const { exportSDStructure } = await import('../utils/exportUtils');
    await exportSDStructure(state, {
      skMode: 'overwrite',
      directWrite: false,
      includeProject: false,
      // A browse visitor has no device settings to express, and a defaults
      // config.txt on the card would quietly overwrite theirs. Config is Phase 5.
      includeConfig: false,
    }, onProgress);
  });

  /**
   * The third exit — open question 5's "import into project".
   *
   * It reuses the same `buildDetachedState(pool)` the two downloads use, so the
   * project gets exactly the layout the "Download SD card 6×6" preview showed. The
   * work folder is chosen here, mid-flow: the pool is React state in this component,
   * so it survives the picker without any handoff, and nothing was asked of the user
   * until they asked for a project.
   *
   * The "temporary project in browser cache, save later" variant from the answer is
   * deliberately not built — it would need its own IDB slot to stay inside locked
   * decision 5, and this path makes it unnecessary.
   */
  const importIntoProject = async (
    rawName: string,
    existingWorkspace?: FileSystemDirectoryHandle | null,
  ) => {
    if (poolRef.current.length === 0) return;

    setShowExportProgress(true);
    setIsExporting(true);
    setIsExportComplete(false);
    setExportError(null);
    setExportProgress(null);
    setExportLogs(['Creating project…']);

    try {
      const { createProjectFromState } = await import('../utils/newProject');
      const created = await createProjectFromState(
        buildDetachedState(poolRef.current),
        rawName,
        msg => { if (msg) setExportLogs(prev => (prev[prev.length - 1] === msg ? prev : [...prev, msg])); },
        existingWorkspace,
      );

      if (!created) {
        setShowExportProgress(false); // Picker dismissed — nothing happened.
        return;
      }
      setExportProgress(100);
      setShowExportProgress(false);
      setCreatedProject(created.projectName);

      // The pool stays. Emptying it here would take away the surface the user was
      // working on because they asked for a copy of it — so instead it remembers,
      // and the panel says the copy is not a link.
      setCopiedInto(prev => {
        const next = prev.includes(created.projectName) ? prev : [...prev, created.projectName];
        void saveBrowsePoolCopiesToDB(next);
        return next;
      });
    } catch (e) {
      console.error(e);
      setExportError(e instanceof Error ? e.message : 'Could not create the project.');
    } finally {
      setIsExporting(false);
      setIsExportComplete(true);
    }
  };

  /**
   * "Use your workspace" — the path that skips the picker entirely.
   *
   * `ensureWorkspacePermission` is the first await after the click on purpose: the
   * browser's permission prompt needs that click's activation, and anything awaited
   * before it spends the activation and makes the prompt fail silently.
   */
  const useKnownWorkspace = async () => {
    if (!knownWorkspace || !pendingName) return;
    const name = pendingName;
    const granted = await ensureWorkspacePermission(knownWorkspace);
    if (!granted) {
      setExportError('Permission to your workspace folder was refused, so nothing was written.');
      setShowExportProgress(true);
      setIsExportComplete(true);
      return;
    }
    setPendingName(null);
    await importIntoProject(name, knownWorkspace);
  };

  const pickAnotherWorkspace = async () => {
    if (!pendingName) return;
    const name = pendingName;
    setPendingName(null);
    await importIntoProject(name);
  };

  const overflowCount = Math.max(0, pool.length - GRID_CAPACITY);
  const poolSummary = useMemo(() => {
    if (pool.length === 0) return 'Nothing selected yet';
    const total = pool.reduce((acc, item) => acc + (item.duration || 0), 0);
    return `${pool.length} file${pool.length === 1 ? '' : 's'} · ${formatDuration(total)}`;
  }, [pool]);

  return (
    // `dvh` where it exists: a phone's address bar eats into `100vh`, which puts the
    // preview bar under it and leaves the page scrolling by exactly that much.
    <div
      className="h-screen supports-[height:100dvh]:h-[100dvh] w-full flex flex-col bg-synthux-main text-white overflow-hidden"
      onDragOver={tolerateSampleDrag}
      onDrop={swallowStraySampleDrop}
    >

      {/*
        * Mode bar. The border spans the window; its contents share the content
        * row's ceiling below, so the pool toggle stays over the pool column on a
        * very wide monitor instead of drifting off to the far edge.
        */}
      <div className="shrink-0 flex items-center justify-between gap-2 sm:gap-4 px-3 sm:px-4 py-2 border-b border-white/10 bg-synthux-panel
        w-full max-w-[2200px] mx-auto">
        <button
          onClick={onExitToHub}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-bold uppercase tracking-widest
            text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <ChevronLeft size={14} /> Hub
        </button>

        <div className="min-w-0 text-center">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-synthux-green">Browse</span>
          <span className="hidden sm:inline text-[11px] text-gray-500 ml-3">
            Preview, collect, download. No folder is opened and no permission is asked.
          </span>
        </div>

        <button
          onClick={() => setIsPoolOpen(v => !v)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-colors border ${
            isPoolOpen
              ? 'bg-synthux-green/20 border-synthux-green/50 text-synthux-green'
              : 'bg-black/40 border-white/10 text-gray-300 hover:text-white hover:border-white/30'
          }`}
        >
          <Layers size={14} />
          <span className="hidden xs:inline">Temporary pool</span>
          <span className="xs:hidden">Pool</span>
          <span className="px-1.5 py-0.5 rounded-full bg-black/50 text-[10px] font-mono">{pool.length}</span>
        </button>
      </div>

      {/*
        * Capped, not stretched. Past roughly 2200px the sample rows turn into
        * metre-wide bands of empty space with a filename at one end and a button at
        * the other, which is the one thing a 4K monitor makes worse.
        */}
      <div className="flex-1 flex min-h-0 w-full max-w-[2200px] mx-auto">
        {/* The browser itself — full-screen here, rather than the draggable window Studio uses. */}
        <div className="flex-1 min-w-0">
          <Suspense fallback={
            <div className="h-full w-full flex items-center justify-center text-gray-500">
              <Loader size={20} className="animate-spin" />
            </div>
          }>
            <SampleBrowser
              isOpen
              mode="standalone"
              onClose={onExitToHub}
              // `addToPool` returns the new entry's id (the pen below needs it); the
              // browser only cares that the import resolved.
              onImport={async (...args) => { await addToPool(...args); }}
              onEditSample={editFromBrowser}
              // Tier 1 → tier 2. Nothing to tear down: the pool is in IDB and the
              // route is a hash, so coming back lands on the same pack.
              onOpenPreset={onEnterPresets ? (preset) => onEnterPresets(preset.id) : undefined}
              onSampleDrag={handleSampleDrag}
              hostPlayback={playRequest}
              onPlaybackChange={handlePlaybackChange}
              onLocateInPool={locateInPool}
              // The editor opens over Browse with a transport of its own.
              forceStop={!!editingId}
              addedPaths={pooledPaths}
              userLibrary={userLibrary}
              onRemoteBulkImport={(samples, _target, origin, license) => addManyToPool(samples, origin, license)}
              onImportToPool={async (files) => {
                for (const { file, path } of files) {
                  const url = URL.createObjectURL(file);
                  try {
                    await addToPool(url, file.name, 'Local Folder', undefined, path);
                  } catch {
                    // addToPool logs and revokes; keep going through the batch.
                  }
                }
              }}
            />
          </Suspense>
        </div>

        {/*
          * The temporary pool. A column on a desktop, the whole screen on a phone:
          * at 400px it is wider than the window it would sit beside, so below `md`
          * it takes over — its own X and Escape are the ways back.
          */}
        {isPoolOpen && (
          <aside
            // `md:relative` rather than `md:static`: the drop overlay below is absolute
            // against this column, and a static ancestor would let it escape the page.
            className={`fixed inset-0 z-40 w-full md:relative md:z-auto md:w-[400px] xl:w-[440px]
              shrink-0 border-l bg-synthux-panel flex flex-col transition-colors
              ${dropOver ? 'border-synthux-green' : 'border-white/10'}`}
            onDragEnter={e => {
              const kind = dropKind(e);
              if (!kind) return;
              e.preventDefault();
              dragDepth.current += 1;
              setDropOver(kind);
            }}
            onDragOver={e => {
              if (!dropKind(e)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
            }}
            onDragLeave={e => {
              if (!dropKind(e)) return;
              dragDepth.current -= 1;
              if (dragDepth.current <= 0) {
                dragDepth.current = 0;
                setDropOver(null);
              }
            }}
            onDrop={handleColumnDrop}
          >
            <div className="shrink-0 flex items-start justify-between gap-2 p-4 border-b border-white/10">
              <div className="min-w-0">
                <h2 className="text-sm font-bold flex items-center gap-2">
                  <Layers size={15} className="text-synthux-green" /> Temporary pool
                </h2>
                <p className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-1.5">
                  {isDroppingSamples && <Loader size={10} className="animate-spin text-synthux-green" />}
                  {isDroppingSamples ? 'Adding the dropped samples…' : poolSummary}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {/*
                  * Files straight off the desktop. Beside "Empty pool" because they are
                  * the two things you can do to the pool as a whole, and the pool is the
                  * one surface that has always been fillable only from somewhere else.
                  */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isAddingFiles}
                  className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider
                    text-synthux-green hover:bg-synthux-green/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Add audio files from your computer, or drop them anywhere on this column"
                >
                  {isAddingFiles
                    ? <Loader size={12} className="animate-spin" />
                    : <FilePlus size={12} />}
                  Add files
                </button>
                {/*
                  * The way out. A refresh used to be it — the pool is now kept, so
                  * this is the only thing that empties it, and it says so.
                  */}
                {pool.length > 0 && (
                  <button
                    onClick={() => setConfirmClear(true)}
                    className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Empty the pool and forget its edits"
                  >
                    Empty pool
                  </button>
                )}
                <button
                  onClick={() => setIsPoolOpen(false)}
                  className="p-1 rounded text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
                  title="Hide selection"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,.wav,.mp3,.flac,.aif,.aiff,.ogg,.m4a"
              multiple
              onChange={handleFilePick}
              className="hidden"
            />

            {/* Only while a drag is actually over the column, so it never sits in the way. */}
            {dropOver && (
              <div className="absolute inset-2 z-50 rounded-xl border-2 border-dashed border-synthux-green
                bg-synthux-green/10 backdrop-blur-[1px] flex flex-col items-center justify-center gap-2
                pointer-events-none text-synthux-green">
                {dropOver === 'samples' ? <Layers size={26} /> : <Upload size={26} />}
                <span className="text-xs font-bold">
                  {dropOver === 'samples'
                    ? `Drop to add ${sampleDragCount} ${sampleDragCount === 1 ? 'sample' : 'samples'} to the pool`
                    : 'Drop to add to the pool'}
                </span>
                <span className="text-[10px] opacity-70">Converted to SK-ready WAV as they land</span>
              </div>
            )}

            <div ref={poolListRef} className="flex-1 overflow-y-auto p-2 min-h-0">
              {pool.length === 0 ? (
                <p className="p-4 text-xs text-gray-500 leading-relaxed">
                  Add samples from the browser — the button on a row, or <span className="text-synthux-green font-bold">drag the rows
                  over here</span>, a whole selection at once — and they collect here, ready to download or turn
                  into a project. Files from your computer land here too: use <span className="text-synthux-green font-bold">Add files</span> above,
                  or drop them anywhere on this column. The first 36 spread across the
                  6&nbsp;×&nbsp;6 grid in this order, and you can drag to rearrange.
                </p>
              ) : (
                <ul className="space-y-1">
                  {pool.map((item, index) => {
                    const slot = slotLabelForIndex(index);
                    const tape = tapeForIndex(index);
                    const isLocated = locatedPoolId === item.id;
                    const isPlayingThis = playingPoolId === item.id && isPlaying;
                    return (
                      <li
                        key={item.id}
                        data-pool-id={item.id}
                        style={isLocated ? { animation: 'locatePulse 2s ease-in-out infinite' } : undefined}
                        draggable
                        onDragStart={() => setDragIndex(index)}
                        // Files from the desktop, and samples from the browser, pass
                        // straight through to the column's own drop target; marking a row
                        // as the insertion point would promise a placement the drop
                        // doesn't honour — both land at the end of the pool.
                        onDragOver={(e) => {
                          if (dropKind(e)) return;
                          e.preventDefault();
                          setDropIndex(index);
                        }}
                        onDragEnd={() => { setDragIndex(null); setDropIndex(null); }}
                        onDrop={(e) => {
                          if (dropKind(e)) return;
                          e.preventDefault();
                          if (dragIndex !== null) movePoolItem(dragIndex, index);
                          setDragIndex(null);
                          setDropIndex(null);
                        }}
                        className={`group relative flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-md border overflow-hidden
                          transition-colors cursor-grab active:cursor-grabbing ${
                          dropIndex === index && dragIndex !== null && dragIndex !== index
                            ? 'border-synthux-green bg-synthux-green/10'
                            : isLocated
                              ? 'border-synthux-orange bg-synthux-orange/10'
                              : 'border-white/5 bg-black/20 hover:bg-white/5'
                        } ${dragIndex === index ? 'opacity-40' : ''}`}
                      >
                        {/* Tape colour, so the grouping reads at a glance without counting rows. */}
                        <span
                          aria-hidden
                          className={`absolute left-0 top-0 bottom-0 w-1 ${tape ? COLOR_MAP[tape] : 'bg-gray-700'}`}
                        />
                        <GripVertical size={13} className="shrink-0 text-gray-600 group-hover:text-gray-400" />
                        <span className={`shrink-0 w-8 text-center px-1 py-0.5 rounded text-[9px] font-mono font-bold ${
                          slot ? 'bg-white/10 text-gray-300' : 'bg-black/50 text-gray-600'
                        }`}>
                          {slot || 'POOL'}
                        </span>
                        <button
                          onClick={() => requestPoolPlay(item)}
                          className={`shrink-0 w-7 h-7 flex items-center justify-center rounded-full border transition-all ${
                            isPlayingThis
                              ? 'bg-synthux-yellow border-synthux-yellow text-black scale-105'
                              : 'bg-black/50 border-white/10 text-gray-400 hover:text-white hover:border-white/30'
                          }`}
                          title={isPlayingThis ? 'Pause' : 'Listen to this file as it stands. It plays in the bar below'}
                        >
                          {isPlayingThis
                            ? <Pause size={11} fill="currentColor" />
                            : <Play size={11} fill="currentColor" className="ml-0.5" />}
                        </button>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[11px] font-mono truncate text-gray-200">{item.name}</span>
                          <span className="block text-[9px] text-gray-600 truncate">
                            {item.edited && <span className="text-synthux-pink font-bold">Edited · </span>}
                            {formatDuration(item.duration || 0)}{item.origin ? ` · ${item.origin}` : ''}
                          </span>
                        </span>
                        <button
                          onClick={() => setEditingId(item.id)}
                          className={`shrink-0 p-1 rounded transition-colors ${
                            item.edited
                              ? 'text-synthux-pink bg-synthux-pink/10 hover:bg-synthux-pink/20'
                              : 'text-gray-600 hover:text-synthux-pink hover:bg-synthux-pink/10'
                          }`}
                          title={item.edited
                            ? 'Edited since it was pooled. Open the editor again'
                            : 'Edit this file. Saved edits go straight back into the pool'}
                        >
                          <AudioWaveform size={12} />
                        </button>
                        <button
                          onClick={() => downloadOne(item)}
                          className="shrink-0 p-1 rounded text-gray-600 hover:text-synthux-blue hover:bg-synthux-blue/10 transition-colors"
                          title="Download this file"
                        >
                          <Download size={12} />
                        </button>
                        <button
                          onClick={() => removeFromPool(item.id)}
                          className="shrink-0 p-1 rounded text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Remove from selection"
                        >
                          <Trash2 size={12} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="shrink-0 border-t border-white/10">
              <button
                onClick={toggleExports}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-[10px] font-bold
                  uppercase tracking-widest text-gray-500 hover:text-gray-200 hover:bg-white/5 transition-colors"
                title={exportsOpen ? 'Fold this away and give the list the room' : 'Show the downloads and the project exit'}
              >
                <span className="flex items-center gap-2">
                  <Download size={12} /> Downloads &amp; export
                </span>
                <span className="flex items-center gap-2">
                  {!exportsOpen && pool.length > 0 && (
                    <span className="normal-case tracking-normal text-gray-600">{pool.length} ready</span>
                  )}
                  {exportsOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                </span>
              </button>
            </div>

            {exportsOpen && (
            <div className="shrink-0 p-3 pt-0 space-y-2">
              <button
                onClick={downloadSDStructure}
                disabled={pool.length === 0 || isExporting}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-synthux-green/40 bg-synthux-green/10
                  text-synthux-green text-left transition-all hover:bg-synthux-green/20 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <HardDrive size={16} className="shrink-0" />
                <span className="min-w-0">
                  <span className="block text-xs font-bold">Download SD card 6×6</span>
                  <span className="block text-[10px] opacity-70">
                    Full <span className="font-mono">SK/</span> folder, renamed to slots, ready to copy and play
                  </span>
                </span>
              </button>

              {overflowCount > 0 && (
                <p className="text-[10px] text-synthux-yellow/80 leading-relaxed pl-1">
                  The card build takes the first 36, so {overflowCount} more {overflowCount === 1 ? 'is' : 'are'} in
                  the loose download below.
                </p>
              )}

              {/*
                * Button and checkbox share one bordered block: the grouping option is the
                * loose download's alone, and sitting loose underneath both buttons it read
                * as if it also applied to the SD build, which it never did.
                */}
              <div className="rounded-lg border border-synthux-blue/40 bg-synthux-blue/10 overflow-hidden">
                <button
                  onClick={downloadLooseFiles}
                  disabled={pool.length === 0 || isExporting}
                  className="w-full flex items-center gap-3 px-3 py-2.5
                    text-synthux-blue text-left transition-all hover:bg-synthux-blue/20 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <FileStack size={16} className="shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-xs font-bold">Download the files</span>
                    <span className="block text-[10px] opacity-70">
                      All {pool.length || ''} of them, original names, SK-ready WAV
                    </span>
                  </span>
                </button>

                <label className="flex items-center gap-2 px-3 py-2 border-t border-synthux-blue/20 cursor-pointer group select-none">
                  <span className={`w-3.5 h-3.5 shrink-0 rounded-[3px] border flex items-center justify-center transition-colors ${
                    sortLooseIntoTapes
                      ? 'bg-synthux-blue border-synthux-blue'
                      : 'bg-black/40 border-gray-700 group-hover:border-gray-500'
                  }`}>
                    {sortLooseIntoTapes && <Check size={9} className="text-black stroke-[4]" />}
                  </span>
                  <input
                    type="checkbox"
                    checked={sortLooseIntoTapes}
                    onChange={(e) => setSortLooseIntoTapes(e.target.checked)}
                    className="sr-only"
                  />
                  <span className="text-[10px] text-gray-500 group-hover:text-gray-300 transition-colors">
                    Sort this ZIP into tape folders ({TAPE_COLORS.map(c => c.charAt(0)).join('/')})
                  </span>
                </label>
              </div>

              <p className="flex items-start gap-1.5 text-[10px] text-gray-600 leading-relaxed pt-1">
                <Download size={11} className="shrink-0 mt-0.5" />
                Both go to your browser's downloads folder. No permission, nothing written to your drive.
              </p>

              {canPickFolder() && (
                <>
                  <div className="h-px bg-white/10 my-1" />
                  <button
                    onClick={() => setNameModalOpen(true)}
                    disabled={pool.length === 0 || isExporting}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-synthux-yellow/40 bg-synthux-yellow/10
                      text-synthux-yellow text-left transition-all hover:bg-synthux-yellow/20 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <FolderPlus size={16} className="shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-xs font-bold">Import into a project</span>
                      <span className="block text-[10px] opacity-70">
                        The whole pool, layout kept, on a folder you pick, then carry on in Studio
                      </span>
                    </span>
                  </button>
                </>
              )}

              {/*
                * R2-9, and the whole of it. The copy is one-way and finished: the
                * project is folders on disk, this is blobs in a browser store, and
                * nothing reconciles them. Saying so here is cheaper and more honest
                * than a link that would have to hold a directory handle Browse
                * refuses to ask for.
                */}
              {copiedInto.length > 0 && (
                <p className="flex items-start gap-1.5 text-[10px] text-synthux-yellow/80 leading-relaxed pt-2 border-t border-white/5">
                  <FolderPlus size={11} className="shrink-0 mt-0.5" />
                  <span>
                    Copied into Studio as{' '}
                    {copiedInto.map((name, i) => (
                      <React.Fragment key={name}>
                        {i > 0 && ', '}
                        <span className="font-mono text-synthux-yellow">{name}</span>
                      </React.Fragment>
                    ))}
                    . <span className="text-gray-500">
                      That copy and this pool are not linked, so changes here don't reach the project,
                      and saving again makes another new project.
                    </span>
                  </span>
                </p>
              )}

              {/*
                * Where the files actually live. Permanent, not a toast: it is the one
                * thing about the pool that isn't visible on screen, and the last clause
                * is the honest part — eviction is neither preventable nor detectable
                * from here, so nothing above should read as a promise.
                */}
              <p className="flex items-start gap-1.5 text-[10px] text-gray-600 leading-relaxed pt-2 border-t border-white/5">
                <Database size={11} className="shrink-0 mt-0.5" />
                <span>
                  The pool is kept in this browser's storage. It survives a refresh and leaving
                  for the hub. It is gone if you clear this site's data, and your browser may
                  evict it on its own. Download or import anything you want to keep.
                </span>
              </p>
            </div>
            )}
          </aside>
        )}
      </div>

      {editingItem && (
        <Suspense fallback={
          <div className="fixed inset-0 z-[80] bg-synthux-main flex items-center justify-center text-gray-500">
            <Loader size={20} className="animate-spin" />
          </div>
        }>
          <LooseFileEditor
            // Remount on a different pool entry rather than reusing the editor's state.
            key={editingItem.id}
            file={{
              name: editingItem.fileName || editingItem.name,
              blob: editingItem.blob,
              duration: editingItem.duration,
              origin: editingItem.origin,
              license: editingItem.license,
              sourceSamplePath: editingItem.sourceSamplePath,
              // Both versions the pool holds, so a second visit to an edited entry
              // shows the real original beside the edit instead of the edit alone,
              // wearing the original's name.
              originalBlob: editingItem.originalBlob,
              originalDuration: editingItem.originalDuration,
            }}
            subtitle={`Editing ${editingItem.name}. "Save to temporary pool" puts the edit back in the pool, where the downloads and "Import into a project" pick it up.`}
            onEdited={({ blob, duration, name }) => applyEdit(editingItem.id, blob, duration, name)}
            onClose={() => setEditingId(null)}
          />
        </Suspense>
      )}

      <ExportProgressModal
        isOpen={showExportProgress}
        onClose={() => setShowExportProgress(false)}
        logs={exportLogs}
        isComplete={isExportComplete}
        error={exportError}
        progress={exportProgress !== null ? exportProgress : undefined}
      />

      <ProjectNameModal
        isOpen={nameModalOpen}
        onClose={() => setNameModalOpen(false)}
        // The name no longer runs straight into the OS folder dialog — the workspace
        // step below explains what that folder is before anything is picked.
        onConfirm={(name) => setPendingName(name)}
        title="Import into a project"
        initialValue="New Project"
        placeholder="Project name…"
        confirmLabel="Continue"
      />

      <WorkspaceChoiceModal
        isOpen={pendingName !== null}
        onClose={() => setPendingName(null)}
        projectName={pendingName || ''}
        existing={knownWorkspace}
        onUseExisting={useKnownWorkspace}
        onPickFolder={pickAnotherWorkspace}
        // Only when there is nothing set up yet; with a workspace already known the
        // wizard has nothing left to ask. The pool survives the detour — R2-4.
        onRunSetup={knownWorkspace || !onEnterStudio ? undefined : () => {
          setPendingName(null);
          onEnterStudio();
        }}
      />

      <ProjectCreatedModal
        projectName={createdProject}
        onDismiss={() => setCreatedProject(null)}
        onEnterStudio={onEnterStudio}
      />

      <ConfirmModal
        isOpen={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={() => {
          setConfirmClear(false);
          setPlayRequest(null);
          setPool([]);
        }}
        title="Empty the temporary pool?"
        message={`All ${pool.length} ${pool.length === 1 ? 'file' : 'files'} leave the pool, and any edits you made to them are forgotten. Files you have already downloaded or imported into a project are not affected.`}
        confirmLabel="Empty it"
        isDestructive
      />

      <Toast toasts={toasts} onRemove={removeToast} />
    </div>
  );
};

export default BrowseMode;
