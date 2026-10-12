import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown, ChevronLeft, ChevronRight, Dices, Download, FolderPlus, Layers, Library, Loader, Lock, Package,
  Pause, Play, Plus, RefreshCw, Square, Star, Trash2, Undo2, Unlock, X, ZoomIn,
} from 'lucide-react';
import { ConfirmModal } from '../components/ConfirmModal';
import { ExportProgressModal } from '../components/ExportProgressModal';
import { ProjectNameModal } from '../components/modals/ProjectNameModal';
import { WorkspaceChoiceModal } from '../components/modals/WorkspaceChoiceModal';
import { ProjectCreatedModal } from '../shell/ProjectCreatedModal';
import { canPickFolder, ensureWorkspacePermission } from '../utils/newProject';
import { getDirectoryHandle } from '../utils/storageUtils';
import { buildDetachedState, GRID_CAPACITY } from '../utils/detachedState';
import { LEVEL_LABEL, resultLicense, sourceLicense } from '../mangler/license';
import { addResultsToBrowsePool, resultsAsDetached, saveResultsToLibrary } from '../mangler/save';
import { useEscapeLayer } from '../shell/escapeStack';
import { useToasts } from '../shell/useToasts';
import { Toast } from '../components/Toast';
import { useAudioPlayer } from '../contexts/AudioPlayerContext';
import { appStorage } from '../utils/storageNamespace';
import {
  deleteMangleResultsFromDB, deleteMangleSourcesFromDB, loadMangleResultsFromDB, loadMangleSourcesFromDB,
  loadUserLibraryFromDB, putMangleResultToDB, putMangleSourceToDB,
} from '../utils/persistence';
import type { MangleResultEntry, MangleSourceEntry } from '../utils/persistence';
import type { FileRecord, UserLibrary } from '../types';

const SampleBrowser = React.lazy(() =>
  import('../components/SampleBrowser').then(m => ({ default: m.SampleBrowser })),
);
import { runBatch, resultToWav, type BatchHandle, type BatchSource } from '../mangler/batch';
import type { MangleResult, SnippetInfo } from '../mangler/render';
import { useResultAudio } from '../mangler/ui/useResultAudio';
import { recipeFromResult, resultName, usedSources, waveformPeaks, type RecipeSource } from '../mangler/recipe';
import { deriveSeed, randomSeed } from '../mangler/rng';
import {
  DEFAULT_SETTINGS, OUTPUT_MAX_SECONDS, PRESETS, SNIPPET_MAX_MS, SNIPPET_MIN_MS, VARIATIONS_MAX, XFADE_MAX_MS,
  sanitizeSettings, type MangleSettings,
} from '../mangler/settings';
import { RangeSlider, Segmented, Slider, Toggle } from '../mangler/ui/Sliders';
import { ResultWaveform } from '../mangler/ui/ResultWaveform';

const SETTINGS_KEY = 'mangler_settings';
const SEED_KEY = 'mangler_seed';
/** About 230 MB decoded. Above it the batch still runs, with a warning. */
const POOL_WARN_SECONDS = 600;

const newId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2, 15);

const stripExtension = (name: string) => name.replace(/\.[^/.]+$/, '');

const formatMs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)} s` : `${Math.round(ms)} ms`);
const formatSeconds = (s: number) =>
  s >= 60 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : `${s.toFixed(1)} s`;
const formatDb = (db: number) => `${db > 0 ? '+' : ''}${db.toFixed(db % 1 ? 1 : 0)} dB`;
const formatSt = (st: number) => `${st > 0 ? '+' : ''}${st.toFixed(Math.abs(st) < 10 ? 1 : 0)} st`;

/** The global player plays FileRecords; a one-version record is all it needs. */
const playable = (id: string, name: string, blob: Blob, duration: number): FileRecord => ({
  id,
  name,
  originalName: name,
  versions: [{ id, timestamp: 0, description: 'Original', blob, duration }],
  currentVersionId: id,
  isParked: false,
});

const loadSettings = (): MangleSettings => {
  try {
    return sanitizeSettings(JSON.parse(appStorage.getItem(SETTINGS_KEY) ?? 'null'));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
};

const loadSeed = (): { seed: number; locked: boolean } => {
  try {
    const saved = JSON.parse(appStorage.getItem(SEED_KEY) ?? 'null');
    if (saved && Number.isFinite(saved.seed)) return { seed: saved.seed >>> 0, locked: !!saved.locked };
  } catch { /* fall through */ }
  return { seed: randomSeed(), locked: false };
};

const sortResults = (results: MangleResultEntry[]) =>
  [...results].sort((a, b) => b.batchId - a.batchId || a.createdAt - b.createdAt);

/** Decodes once on the way in: the length for the row, and a check that it is audio at all. */
let probeContext: AudioContext | null = null;
const probeDuration = async (blob: Blob): Promise<number> => {
  probeContext ??= new AudioContext();
  const buffer = await probeContext.decodeAudioData(await blob.arrayBuffer());
  return buffer.duration;
};

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

interface BatchState {
  handle: BatchHandle;
  /** What the bar says while rendering. */
  label: string;
  phase: 'decoding' | 'rendering';
  total: number;
  /** Per variation, 0–1. */
  progress: number[];
  decodeDone: number;
  decodeTotal: number;
}

interface MangleModeProps {
  onExitToHub: () => void;
  onEnterStudio?: () => void;
  onEnterBrowse?: () => void;
}

/** A save waiting on the user: which results, and where to. */
type PendingSave = { route: 'library' | 'pool'; results: MangleResultEntry[] };

/**
 * Sample Mangler at `#/mangle`: random snippets from a pool of sources, joined
 * into one file of up to 42 s. No project and no folder: the pool and the results
 * live in IndexedDB until a result is saved. See docs/sample_mangler.
 */
export const MangleMode: React.FC<MangleModeProps> = ({ onExitToHub, onEnterStudio, onEnterBrowse }) => {
  const [sources, setSources] = useState<MangleSourceEntry[]>([]);
  const [results, setResults] = useState<MangleResultEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [settings, setSettings] = useState<MangleSettings>(loadSettings);
  const [{ seed, locked }, setSeedState] = useState(loadSeed);
  const [batch, setBatch] = useState<BatchState | null>(null);
  const [adding, setAdding] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [userLibrary, setUserLibrary] = useState<UserLibrary | undefined>(undefined);
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null);
  const [pooledPrompt, setPooledPrompt] = useState<number | null>(null);

  // New-project flow, the same three steps as Browse's "Import into a project".
  const [projectResults, setProjectResults] = useState<MangleResultEntry[] | null>(null);
  const [pendingName, setPendingName] = useState<string | null>(null);
  const [knownWorkspace, setKnownWorkspace] = useState<FileSystemDirectoryHandle | null>(null);
  const [createdProject, setCreatedProject] = useState<string | null>(null);
  const [exportLogs, setExportLogs] = useState<string[]>([]);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportDone, setExportDone] = useState(false);
  const [showExport, setShowExport] = useState(false);

  /** Zoom per result; absent means the compact waveform. */
  const [zooms, setZooms] = useState<Record<string, number>>({});
  /** The version before the last edit, per result. In memory only: one step back. */
  const [undo, setUndo] = useState<Record<string, MangleResultEntry>>({});
  const [hover, setHover] = useState<{ id: string; index: number } | null>(null);
  const region = useResultAudio();

  const inputRef = useRef<HTMLInputElement>(null);
  const batchRef = useRef<BatchHandle | null>(null);

  const { toasts, showToast, removeToast } = useToasts();
  const player = useAudioPlayer();

  useEscapeLayer(!pickerOpen, () => {
    onExitToHub();
    return true;
  });
  useEscapeLayer(pickerOpen, () => {
    setPickerOpen(false);
    return true;
  });

  // The picker shows the user library read-only when there is one; the project
  // flow offers the stored workspace by name. Neither asks for permission here.
  useEffect(() => {
    let alive = true;
    loadUserLibraryFromDB().then(lib => { if (alive && lib) setUserLibrary(lib); });
    getDirectoryHandle('work')
      .then(handle => { if (alive) setKnownWorkspace(handle); })
      .catch(e => console.warn('Could not read the stored workspace handle', e));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    Promise.all([loadMangleSourcesFromDB(), loadMangleResultsFromDB()]).then(([s, r]) => {
      if (!alive) return;
      setSources([...s].sort((a, b) => a.addedAt - b.addedAt));
      setResults(sortResults(r));
      setLoaded(true);
    });
    return () => { alive = false; };
  }, []);

  // The app's player and the snippet player never play at once.
  const stopRegion = region.stop;
  useEffect(() => { if (player.isPlaying) stopRegion(); }, [player.isPlaying, stopRegion]);

  // A zoomed waveform draws from the decoded audio.
  const loadAudio = region.load;
  useEffect(() => {
    for (const id of Object.keys(zooms)) {
      const r = results.find(x => x.id === id);
      if (r) loadAudio(id, r.blob).catch(e => console.error('Mangler: could not decode a result', e));
    }
  }, [zooms, results, loadAudio]);

  useEffect(() => { appStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }, [settings]);
  useEffect(() => { appStorage.setItem(SEED_KEY, JSON.stringify({ seed, locked })); }, [seed, locked]);

  // Leaving mid-batch stops the worker; what has already arrived is stored.
  useEffect(() => () => batchRef.current?.cancel(), []);

  const update = useCallback(<K extends keyof MangleSettings>(key: K, value: MangleSettings[K]) => {
    setSettings(prev => sanitizeSettings({ ...prev, [key]: value }));
  }, []);
  const updateMany = useCallback((patch: Partial<MangleSettings>) => {
    setSettings(prev => sanitizeSettings({ ...prev, ...patch }));
  }, []);

  // ---------------------------------------------------------------------------
  // Source pool
  // ---------------------------------------------------------------------------

  const addFiles = useCallback(async (files: File[]) => {
    const audio = files.filter(f => f.type.startsWith('audio/') || /\.(wav|mp3|flac|aiff?|ogg|m4a)$/i.test(f.name));
    if (audio.length === 0) return;
    setAdding(n => n + audio.length);
    let failed = 0;
    for (const file of audio) {
      try {
        const duration = await probeDuration(file);
        const entry: MangleSourceEntry = {
          id: newId(),
          name: stripExtension(file.name),
          origin: 'Local file',
          blob: file,
          duration,
          enabled: true,
          addedAt: Date.now(),
        };
        await putMangleSourceToDB(entry);
        setSources(prev => [...prev, entry]);
      } catch (e) {
        console.error('Mangler: could not add', file.name, e);
        failed++;
      } finally {
        setAdding(n => n - 1);
      }
    }
    if (failed) showToast(`${failed} file${failed > 1 ? 's' : ''} could not be decoded`, 'error');
  }, [showToast]);

  /** The picker's add button: a pack sample (URL) or a file from a local folder (object URL). */
  const addFromUrl = useCallback(async (
    url: string, name: string, origin?: string, license?: string, sourcePath?: string,
  ) => {
    const isObjectUrl = url.startsWith('blob:');
    setAdding(n => n + 1);
    try {
      const response = await fetch(url, { mode: 'cors' });
      if (!response.ok) throw new Error(`Download failed (${response.status})`);
      const blob = await response.blob();
      const duration = await probeDuration(blob);
      const entry: MangleSourceEntry = {
        id: newId(),
        name: stripExtension(name),
        origin: origin || 'Sample pack',
        license,
        sourceSamplePath: sourcePath ?? (isObjectUrl ? undefined : url),
        blob,
        duration,
        enabled: true,
        addedAt: Date.now(),
      };
      await putMangleSourceToDB(entry);
      setSources(prev => [...prev, entry]);
    } catch (e) {
      console.error('Mangler: could not add', name, e);
      showToast(`Could not add ${name}`, 'error');
      throw e;
    } finally {
      setAdding(n => n - 1);
      if (isObjectUrl) URL.revokeObjectURL(url);
    }
  }, [showToast]);

  const pooledPaths = useMemo(
    () => new Set(sources.map(s => s.sourceSamplePath).filter((p): p is string => !!p)),
    [sources],
  );

  const toggleSource = useCallback((entry: MangleSourceEntry) => {
    const next = { ...entry, enabled: !entry.enabled };
    setSources(prev => prev.map(s => (s.id === entry.id ? next : s)));
    putMangleSourceToDB(next).catch(e => console.error(e));
  }, []);

  const setAllSources = useCallback((enabled: boolean) => {
    setSources(prev => prev.map(s => {
      if (s.enabled === enabled) return s;
      const next = { ...s, enabled };
      putMangleSourceToDB(next).catch(e => console.error(e));
      return next;
    }));
  }, []);

  const removeSource = useCallback((id: string) => {
    if (player.activeFileId === id) player.stop();
    setSources(prev => prev.filter(s => s.id !== id));
    deleteMangleSourcesFromDB([id]);
  }, [player]);

  const enabledSources = useMemo(() => sources.filter(s => s.enabled), [sources]);
  const enabledSeconds = useMemo(() => enabledSources.reduce((sum, s) => sum + s.duration, 0), [enabledSources]);

  // ---------------------------------------------------------------------------
  // Batches
  // ---------------------------------------------------------------------------

  /**
   * One worker job: a batch from the Generate button, or an edit of a result.
   * One at a time; the bar above the results shows it and Stop cancels it.
   */
  const startJob = useCallback((job: {
    label: string;
    sources: BatchSource[];
    settings: MangleSettings;
    seeds: number[];
    fixed?: (SnippetInfo | null)[];
    onResult: (result: MangleResult, index: number) => Promise<void>;
    onDone?: () => void;
  }) => {
    const count = job.seeds.length;
    const handle = runBatch(job.sources, job.settings, job.seeds, {
      onDecodeProgress: (done, total) =>
        setBatch(prev => (prev ? { ...prev, decodeDone: done, decodeTotal: total } : prev)),
      onProgress: (index, fraction) =>
        setBatch(prev => {
          if (!prev) return prev;
          const progress = [...prev.progress];
          progress[index] = fraction;
          return { ...prev, phase: 'rendering', progress };
        }),
      onResult: (index, result) => job.onResult(result, index),
      onDone: () => {
        batchRef.current = null;
        setBatch(null);
        job.onDone?.();
      },
      onError: (message) => {
        batchRef.current?.cancel();
        batchRef.current = null;
        setBatch(null);
        showToast(message, 'error');
      },
    }, job.fixed);
    batchRef.current = handle;
    setBatch({
      handle,
      label: job.label,
      phase: 'decoding',
      total: count,
      progress: Array(count).fill(0),
      decodeDone: 0,
      decodeTotal: job.sources.length,
    });
  }, [showToast]);

  /** A stored result from a render. */
  const makeEntry = useCallback((
    result: MangleResult, batchSettings: MangleSettings, recipeSources: RecipeSource[],
    meta: { id?: string; name: string; kept: boolean; batchId: number; createdAt?: number; locked?: number[] },
  ): MangleResultEntry => ({
    id: meta.id ?? newId(),
    name: meta.name,
    blob: resultToWav(result, meta.name),
    duration: result.left.length / result.sampleRate,
    recipe: recipeFromResult(result, batchSettings, recipeSources),
    peaks: waveformPeaks(result.left, result.right),
    kept: meta.kept,
    batchId: meta.batchId,
    createdAt: meta.createdAt ?? Date.now(),
    locked: meta.locked?.length ? meta.locked : undefined,
  }), []);

  const storeEntry = useCallback(async (entry: MangleResultEntry) => {
    try {
      await putMangleResultToDB(entry);
    } catch (e) {
      console.error(e);
      showToast('Could not store a result (storage full?). It is shown but will not survive a reload.', 'error');
    }
  }, [showToast]);

  /** A new name for a seed, not taken by any result in the list. */
  const freshName = (seedValue: number, taken: Set<string>) => {
    let name = resultName(seedValue);
    for (let n = 2; taken.has(name); n++) name = `${resultName(seedValue)}-${n}`;
    taken.add(name);
    return name;
  };

  const generate = useCallback(async () => {
    if (batchRef.current) return;
    if (enabledSources.length === 0) {
      showToast('Add a source to the pool first, or switch one on', 'info');
      return;
    }

    // Unkept results from the last batch make room for this one.
    const unkept = results.filter(r => !r.kept).map(r => r.id);
    if (unkept.length) {
      if (player.activeFileId && unkept.includes(player.activeFileId)) player.stop();
      region.stop();
      await deleteMangleResultsFromDB(unkept);
      setResults(prev => prev.filter(r => r.kept));
    }

    const count = settings.variations;
    // The first variation uses the seed on screen, so typing one in reproduces it.
    const seeds = Array.from({ length: count }, (_, i) => (i === 0 ? seed : deriveSeed(seed, 0x5eed, i)));
    const batchId = Date.now();
    const batchSettings = settings;
    const recipeSources: RecipeSource[] = enabledSources.map(s => ({
      id: s.id, name: s.name, origin: s.origin, license: s.license,
    }));
    const taken = new Set(results.filter(r => r.kept).map(r => r.name));

    startJob({
      label: `Rendering ${count} variation${count === 1 ? '' : 's'}`,
      sources: enabledSources.map(s => ({ id: s.id, blob: s.blob })),
      settings: batchSettings,
      seeds,
      onResult: async (result) => {
        const entry = makeEntry(result, batchSettings, recipeSources, {
          name: freshName(result.seed, taken), kept: false, batchId,
        });
        await storeEntry(entry);
        setResults(prev => sortResults([...prev, entry]));
      },
      onDone: () => { if (!locked) setSeedState({ seed: randomSeed(), locked: false }); },
    });
  }, [enabledSources, results, settings, seed, locked, player, region, showToast, startJob, makeEntry, storeEntry]);

  // ---------------------------------------------------------------------------
  // Editing a result
  // ---------------------------------------------------------------------------

  /**
   * The pool entries a result was made from, in its recipe's order. A source
   * that has left the pool comes back as a placeholder; a snippet that needs it
   * makes the render refuse with a message.
   */
  const sourcesFor = useCallback((recipeSources: RecipeSource[]): BatchSource[] =>
    recipeSources.map(rs => {
      const entry = sources.find(s => s.id === rs.id);
      return { id: rs.id, blob: entry?.blob ?? null, enabled: entry?.enabled ?? false };
    }), [sources]);

  /** Settings of an old recipe. Results from before sinc was the default keep the linear resampler. */
  const recipeSettings = (r: MangleResultEntry) =>
    sanitizeSettings({ ...r.recipe.settings, resampler: r.recipe.settings.resampler ?? 'linear' });

  const missingFor = useCallback((r: MangleResultEntry, fixed: (SnippetInfo | null)[]) => {
    const needed = new Set(fixed.filter((f): f is SnippetInfo => !!f).map(f => f.source));
    return r.recipe.sources.filter((rs, i) => needed.has(i) && !sources.some(s => s.id === rs.id));
  }, [sources]);

  /**
   * Renders `r` again with some snippets fixed and replaces it in place. The old
   * version stays one Undo away.
   */
  const editResult = useCallback((
    r: MangleResultEntry, fixed: (SnippetInfo | null)[], editSettings: MangleSettings, label: string,
    locked: number[] | undefined = r.locked,
  ) => {
    if (batchRef.current) return;
    const missing = missingFor(r, fixed);
    if (missing.length) {
      showToast(`Can't edit: ${missing.map(m => m.name).join(', ')} is no longer in the source pool`, 'error');
      return;
    }
    if (player.activeFileId === r.id) player.stop();
    region.stop();
    startJob({
      label,
      sources: sourcesFor(r.recipe.sources),
      settings: editSettings,
      seeds: [r.recipe.seed],
      fixed,
      onResult: async (result) => {
        const entry = makeEntry(result, editSettings, r.recipe.sources, {
          id: r.id, name: r.name, kept: r.kept, batchId: r.batchId, createdAt: r.createdAt, locked,
        });
        await storeEntry(entry);
        region.forget(r.id);
        setUndo(prev => ({ ...prev, [r.id]: r }));
        setResults(prev => prev.map(x => (x.id === r.id ? entry : x)));
      },
    });
  }, [missingFor, player, region, showToast, sourcesFor, startJob, makeEntry, storeEntry]);

  const lockedFixed = (r: MangleResultEntry) =>
    r.recipe.snippets.map((s, i) => (r.locked?.includes(i) ? s : null));

  /** "Same seed": the sliders as they are now, locked snippets kept. */
  const rerender = useCallback((r: MangleResultEntry) => {
    editResult(r, lockedFixed(r), settings, 'Re-rendering with the current settings');
  }, [editResult, settings]);

  const deleteSnippet = useCallback((r: MangleResultEntry, index: number) => {
    const fixed = r.recipe.snippets.filter((_, i) => i !== index);
    const locked = r.locked?.filter(i => i !== index).map(i => (i > index ? i - 1 : i));
    editResult(r, fixed, recipeSettings(r), `Removing snippet ${index + 1}`, locked);
  }, [editResult]);

  /** Moves the given snippets onto C, or back off it. */
  const setToC = useCallback((r: MangleResultEntry, indices: number[], on: boolean) => {
    const targets = new Set(indices);
    const fixed = r.recipe.snippets.map((s, i) => {
      if (!targets.has(i) || !s.pitch || !!s.toCApplied === on) return s;
      return { ...s, shift: s.shift + (on ? s.pitch.toC : -s.pitch.toC), toCApplied: on };
    });
    editResult(r, fixed, recipeSettings(r), on ? 'Moving to C' : 'Back to the original pitch');
  }, [editResult]);

  const toggleLock = useCallback((r: MangleResultEntry, index: number) => {
    const current = new Set(r.locked ?? []);
    if (current.has(index)) current.delete(index); else current.add(index);
    const next = { ...r, locked: current.size ? [...current].sort((a, b) => a - b) : undefined };
    setResults(prev => prev.map(x => (x.id === r.id ? next : x)));
    putMangleResultToDB(next).catch(e => console.error(e));
  }, []);

  /** New variations around the locked snippets, with the current settings. */
  const rerollUnlocked = useCallback((r: MangleResultEntry) => {
    if (batchRef.current || !r.locked?.length) return;
    const fixed = lockedFixed(r);
    const missing = missingFor(r, fixed);
    if (missing.length) {
      showToast(`Can't reroll: ${missing.map(m => m.name).join(', ')} is no longer in the source pool`, 'error');
      return;
    }
    const count = settings.variations;
    const base = randomSeed();
    const seeds = Array.from({ length: count }, (_, i) => deriveSeed(base, 0x10c6, i));
    const batchId = Date.now();
    const batchSettings = settings;
    const taken = new Set(results.map(x => x.name));
    startJob({
      label: `Rerolling around ${r.locked.length} locked snippet${r.locked.length === 1 ? '' : 's'}`,
      sources: sourcesFor(r.recipe.sources),
      settings: batchSettings,
      seeds,
      fixed,
      onResult: async (result) => {
        const entry = makeEntry(result, batchSettings, r.recipe.sources, {
          name: freshName(result.seed, taken), kept: false, batchId, locked: r.locked,
        });
        await storeEntry(entry);
        setResults(prev => sortResults([...prev, entry]));
      },
    });
  }, [missingFor, settings, results, showToast, sourcesFor, startJob, makeEntry, storeEntry]);

  const undoEdit = useCallback(async (r: MangleResultEntry) => {
    const previous = undo[r.id];
    if (!previous) return;
    if (player.activeFileId === r.id) player.stop();
    region.stop();
    region.forget(r.id);
    const restored = { ...previous, kept: r.kept };
    await storeEntry(restored);
    setResults(prev => prev.map(x => (x.id === r.id ? restored : x)));
    setUndo(prev => {
      const next = { ...prev };
      delete next[r.id];
      return next;
    });
  }, [undo, player, region, storeEntry]);

  /** Plays one snippet, start to end, with the snippet player. */
  const playSnippet = useCallback((r: MangleResultEntry, index: number) => {
    const s = r.recipe.snippets[index];
    if (!s) return;
    if (player.isPlaying) player.pause();
    const sr = 48000;
    region.playRegion({ resultId: r.id, index, start: s.outStart / sr, end: (s.outStart + s.length) / sr }, r.blob);
  }, [player, region]);

  /** The snippet under a point of the file (0-1): the last one started by then. */
  const snippetAt = (r: MangleResultEntry, fraction: number) => {
    const frame = fraction * r.duration * 48000;
    let index = 0;
    r.recipe.snippets.forEach((s, i) => { if (s.outStart + (s.xfade >> 1) <= frame) index = i; });
    return index;
  };

    const cancelBatch = useCallback(() => {
    region.stop();
    batchRef.current?.cancel();
    batchRef.current = null;
    setBatch(null);
    showToast('Stopped. Results that had finished are kept in the list.', 'info');
  }, [showToast, region]);

  // ---------------------------------------------------------------------------
  // Results
  // ---------------------------------------------------------------------------

  const toggleKeep = useCallback((entry: MangleResultEntry) => {
    const next = { ...entry, kept: !entry.kept };
    setResults(prev => prev.map(r => (r.id === entry.id ? next : r)));
    putMangleResultToDB(next).catch(e => console.error(e));
  }, []);

  const discard = useCallback((id: string) => {
    if (player.activeFileId === id) player.stop();
    if (region.playing?.resultId === id) region.stop();
    setResults(prev => prev.filter(r => r.id !== id));
    deleteMangleResultsFromDB([id]);
  }, [player, region]);

  const clearUnkept = useCallback(() => {
    const ids = results.filter(r => !r.kept).map(r => r.id);
    if (player.activeFileId && ids.includes(player.activeFileId)) player.stop();
    setResults(prev => prev.filter(r => r.kept));
    deleteMangleResultsFromDB(ids);
  }, [results, player]);

  const applySeed = useCallback((value: number) => {
    setSeedState({ seed: value >>> 0, locked: true });
    showToast(`Seed ${value} is set and locked`, 'info');
  }, [showToast]);

  // ---------------------------------------------------------------------------
  // Saving
  // ---------------------------------------------------------------------------

  /** Results that may leave: anything using a no-derivatives source stays here. */
  const savable = useCallback((list: MangleResultEntry[]) => {
    const ok = list.filter(r => resultLicense(r.recipe).level !== 'no-derivatives');
    const refused = list.length - ok.length;
    if (refused) {
      showToast(`${refused} result${refused > 1 ? 's use' : ' uses'} a no-derivatives source and can't be saved`, 'error');
    }
    return ok;
  }, [showToast]);

  const requestSave = useCallback((route: PendingSave['route'], list: MangleResultEntry[]) => {
    const ok = savable(list);
    if (ok.length) setPendingSave({ route, results: ok });
  }, [savable]);

  const confirmSave = useCallback(async () => {
    if (!pendingSave) return;
    const { route, results: list } = pendingSave;
    setPendingSave(null);
    try {
      if (route === 'pool') {
        await addResultsToBrowsePool(list);
        setPooledPrompt(list.length);
      } else {
        const names = await saveResultsToLibrary(list);
        showToast(names.length === 1
          ? `Saved to the user library as ${names[0]}`
          : `${names.length} files saved to the user library`, 'success');
      }
      // Saved means worth keeping here too.
      const ids = new Set(list.map(r => r.id));
      setResults(prev => prev.map(r => (ids.has(r.id) && !r.kept ? { ...r, kept: true } : r)));
      for (const r of list) if (!r.kept) putMangleResultToDB({ ...r, kept: true }).catch(console.error);
    } catch (e) {
      console.error(e);
      showToast(e instanceof Error ? e.message : 'Could not save', 'error');
    }
  }, [pendingSave, showToast]);

  const downloadResult = useCallback((r: MangleResultEntry) => {
    if (savable([r]).length) downloadBlob(r.blob, `${r.name}.wav`);
  }, [savable]);

  const startProject = useCallback((list: MangleResultEntry[]) => {
    const ok = savable(list).slice(0, GRID_CAPACITY);
    if (ok.length === 0) return;
    if (!canPickFolder()) {
      showToast('Creating a project needs Chrome or Edge (folder access). Download the WAVs instead.', 'error');
      return;
    }
    if (list.length > GRID_CAPACITY) showToast(`A project holds ${GRID_CAPACITY} files; the first ${GRID_CAPACITY} go in`, 'info');
    setProjectResults(ok);
  }, [savable, showToast]);

  const createProject = useCallback(async (rawName: string, workspace?: FileSystemDirectoryHandle | null) => {
    const list = projectResults;
    if (!list?.length) return;
    setShowExport(true);
    setExportDone(false);
    setExportError(null);
    setExportLogs(['Creating project…']);
    try {
      const { createProjectFromState } = await import('../utils/newProject');
      const created = await createProjectFromState(
        buildDetachedState(resultsAsDetached(list)),
        rawName,
        msg => { if (msg) setExportLogs(prev => (prev[prev.length - 1] === msg ? prev : [...prev, msg])); },
        workspace,
      );
      if (!created) {
        setShowExport(false); // Picker dismissed: nothing happened.
        return;
      }
      setShowExport(false);
      setProjectResults(null);
      setCreatedProject(created.projectName);
    } catch (e) {
      console.error(e);
      setExportError(e instanceof Error ? e.message : 'Could not create the project.');
    } finally {
      setExportDone(true);
    }
  }, [projectResults]);

  /** `ensureWorkspacePermission` first: the prompt needs this click's activation. */
  const continueInKnownWorkspace = async () => {
    if (!knownWorkspace || !pendingName) return;
    const name = pendingName;
    const granted = await ensureWorkspacePermission(knownWorkspace);
    setPendingName(null);
    if (!granted) {
      setExportError('Permission to your workspace folder was refused, so nothing was written.');
      setShowExport(true);
      setExportDone(true);
      return;
    }
    await createProject(name, knownWorkspace);
  };

  const pickAnotherWorkspace = async () => {
    if (!pendingName) return;
    const name = pendingName;
    setPendingName(null);
    await createProject(name);
  };

  const keptResults = useMemo(() => results.filter(r => r.kept), [results]);

  const progressOf = (id: string) =>
    player.activeFileId === id && player.duration > 0 ? player.currentTime / player.duration : null;

  const resultsBytes = useMemo(() => results.reduce((sum, r) => sum + r.blob.size, 0), [results]);
  const busy = batch !== null;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      className="h-screen w-full flex flex-col bg-synthux-main text-white overflow-hidden"
      onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={e => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={e => {
        e.preventDefault();
        setDragging(false);
        addFiles(Array.from(e.dataTransfer.files ?? []));
      }}
    >
      <div className="shrink-0 flex items-center justify-between gap-4 px-4 py-2 border-b border-white/10 bg-synthux-panel">
        <button
          onClick={onExitToHub}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-bold uppercase tracking-widest
            text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <ChevronLeft size={14} /> Hub
        </button>
        <div className="min-w-0 text-center">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-synthux-red">Sample Mangler</span>
          <span className="hidden md:inline text-[11px] text-gray-500 ml-3">
            Random snippets from your sources, joined into one file of up to 42 s.
          </span>
        </div>
        <span className="w-16" aria-hidden />
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-[minmax(240px,300px)_minmax(260px,320px)_1fr]">

        {/* Source pool */}
        <section className="min-h-0 flex flex-col border-r border-white/10">
          <div className="shrink-0 px-4 pt-4 pb-2 flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer" title="Switch every source on or off">
              <input
                type="checkbox"
                checked={sources.length > 0 && enabledSources.length === sources.length}
                ref={el => { if (el) el.indeterminate = enabledSources.length > 0 && enabledSources.length < sources.length; }}
                onChange={e => setAllSources(e.target.checked)}
                disabled={sources.length === 0}
                className="accent-synthux-red h-3.5 w-3.5 cursor-pointer disabled:cursor-default"
              />
              <h2 className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Source pool</h2>
            </label>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPickerOpen(true)}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold text-white
                  bg-synthux-red/80 hover:bg-synthux-red transition-colors"
                title="Pick from the sample packs"
              >
                <Package size={12} /> Packs
              </button>
              <button
                onClick={() => inputRef.current?.click()}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold text-synthux-red
                  border border-synthux-red/40 hover:bg-synthux-red/10 transition-colors"
                title="Add audio files from your computer"
              >
                <Plus size={12} /> Files
              </button>
            </div>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="audio/*,.wav,.mp3,.flac,.aif,.aiff,.ogg,.m4a"
              className="sr-only"
              onChange={e => {
                addFiles(Array.from(e.target.files ?? []));
                e.target.value = '';
              }}
            />
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2">
            {loaded && sources.length === 0 && adding === 0 && (
              <button
                onClick={() => inputRef.current?.click()}
                className="w-full mt-2 rounded-xl border-2 border-dashed border-white/15 p-6 text-center
                  hover:border-white/30 hover:bg-white/[0.03] transition-colors"
              >
                <span className="block text-sm font-bold mb-1">Drop audio files here</span>
                <span className="block text-[11px] text-gray-500 leading-relaxed">
                  Or click to choose. WAV, MP3, FLAC, AIFF: anything the browser can decode.
                  Use Packs above to pick from the sample packs.
                </span>
              </button>
            )}

            <ul className="space-y-1">
              {sources.map(s => {
                const playing = player.activeFileId === s.id && player.isPlaying;
                return (
                  <li key={s.id}
                    className={`group flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/5 ${s.enabled ? '' : 'opacity-45'}`}>
                    <input
                      type="checkbox"
                      checked={s.enabled}
                      onChange={() => toggleSource(s)}
                      title={s.enabled ? 'In the next batch' : 'Left out of the next batch'}
                      className="accent-synthux-red h-3.5 w-3.5 shrink-0 cursor-pointer"
                    />
                    <button
                      onClick={() => player.play(playable(s.id, s.name, s.blob, s.duration))}
                      className="shrink-0 text-gray-400 hover:text-white"
                      title={playing ? 'Pause' : 'Preview'}
                    >
                      {playing ? <Pause size={13} /> : <Play size={13} />}
                    </button>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs" title={s.name}>{s.name}</span>
                      <span className="flex items-center gap-1.5 text-[10px] text-gray-500 min-w-0">
                        <span className="truncate">{s.origin}</span>
                        <LicenseBadge level={sourceLicense(s).level} terms={s.license} />
                      </span>
                    </span>
                    <span className="shrink-0 text-[10px] font-mono text-gray-500 tabular-nums">{formatSeconds(s.duration)}</span>
                    <button
                      onClick={() => removeSource(s.id)}
                      className="shrink-0 text-gray-600 hover:text-synthux-red opacity-0 group-hover:opacity-100 focus:opacity-100"
                      title="Remove from the pool"
                    >
                      <X size={13} />
                    </button>
                  </li>
                );
              })}
              {adding > 0 && (
                <li className="flex items-center gap-2 px-2 py-1.5 text-xs text-gray-500">
                  <Loader size={12} className="animate-spin" /> Adding {adding}…
                </li>
              )}
            </ul>
          </div>

          <div className="shrink-0 px-4 py-2 border-t border-white/10 text-[10px] text-gray-500">
            {enabledSources.length} of {sources.length} in use · {formatSeconds(enabledSeconds)}
            {enabledSeconds > POOL_WARN_SECONDS && (
              <span className="block text-synthux-yellow mt-0.5">
                Over 10 minutes: decoding this much may run the tab out of memory.
              </span>
            )}
          </div>
        </section>

        {/* Settings */}
        <section className="min-h-0 overflow-y-auto border-r border-white/10 px-4 py-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Settings</h2>
            <select
              value=""
              onChange={e => {
                const name = e.target.value;
                if (name === '__default') setSettings({ ...DEFAULT_SETTINGS, variations: settings.variations });
                else if (PRESETS[name]) updateMany(PRESETS[name]);
              }}
              className="bg-black/40 border border-white/10 rounded px-2 py-1 text-[11px] text-gray-300"
            >
              <option value="" disabled>Preset…</option>
              {Object.keys(PRESETS).map(name => <option key={name} value={name}>{name}</option>)}
              <option value="__default">Defaults</option>
            </select>
          </div>

          <Group title="Shape">
            <Slider label="Output length" min={1} max={OUTPUT_MAX_SECONDS} value={settings.outputSeconds}
              onChange={v => update('outputSeconds', v)} format={v => `${v} s`}
              hint="The hardware plays the first 42 s of a file" />
            <RangeSlider label="Snippet length" min={SNIPPET_MIN_MS} max={SNIPPET_MAX_MS} scale="log"
              low={settings.snippetMinMs} high={settings.snippetMaxMs}
              onChange={(lo, hi) => updateMany({ snippetMinMs: lo, snippetMaxMs: hi })} format={formatMs} />
            <Slider label="Bias" min={-1} max={1} step={0.05} value={settings.bias}
              onChange={v => update('bias', v)}
              format={v => (Math.abs(v) < 0.025 ? 'even' : v < 0 ? `short ${Math.round(-v * 100)}%` : `long ${Math.round(v * 100)}%`)}
              hint="Skews the pick inside the snippet length range" />
            <RangeSlider label="Crossfade" min={0} max={XFADE_MAX_MS} scale="cubic"
              low={settings.xfadeMinMs} high={settings.xfadeMaxMs}
              onChange={(lo, hi) => updateMany({ xfadeMinMs: lo, xfadeMaxMs: hi })} format={formatMs}
              hint="Equal-power, at most half the shorter of the two snippets" />
            <Toggle label="Hard cuts (leave clicks in)" checked={settings.hardCuts}
              onChange={v => update('hardCuts', v)}
              hint="Off adds a 2 ms fade at each snippet edge" />
            <Segmented label="Snippet start" value={settings.snapStart} onChange={v => update('snapStart', v)}
              options={[{ value: 'off', label: 'Anywhere' }, { value: 'zero', label: 'Zero' }, { value: 'onset', label: 'Transient' }]}
              hint="Zero: on a zero crossing, so hard cuts don't click. Transient: on the strongest attack in the first half second" />
            <Slider label="Reverse" min={0} max={100} value={Math.round(settings.reverseProbability * 100)}
              onChange={v => update('reverseProbability', v / 100)} format={v => `${v}%`}
              hint="Chance that a snippet plays backwards" />
          </Group>

          <Group title="Loudness">
            <Slider label="Target (RMS)" min={-30} max={-6} value={settings.loudnessTargetDb}
              onChange={v => update('loudnessTargetDb', v)} format={v => `${v} dBFS`} />
            <Slider label="Spread" min={0} max={12} step={0.5} value={settings.loudnessSpreadDb}
              onChange={v => update('loudnessSpreadDb', v)} format={v => `± ${v} dB`}
              hint="Random deviation from the target, for dynamics on purpose" />
            <Slider label="Max boost" min={0} max={36} value={settings.maxBoostDb}
              onChange={v => update('maxBoostDb', v)} format={v => `${v} dB`}
              hint="Stops near-silent snippets being pulled up into hiss" />
            <Toggle label="Skip silence" checked={settings.skipSilence} onChange={v => update('skipSilence', v)}
              hint="Redraws a snippet that is quieter than the threshold (up to 5 times)" />
            <Slider label="Silence threshold" min={-70} max={-30} value={settings.silenceThresholdDb}
              onChange={v => update('silenceThresholdDb', v)} format={v => `${v} dBFS`}
              disabled={!settings.skipSilence} />
            <Toggle label="Limiter at −1 dBFS" checked={settings.limiter} onChange={v => update('limiter', v)}
              hint="Off scales the whole file down instead when it peaks over −1 dBFS" />
          </Group>

          <Group title="Pitch">
            <Segmented label="Repitch to C" value={settings.repitch} onChange={v => update('repitch', v)}
              options={[{ value: 'off', label: 'Off' }, { value: 'suggest', label: 'Suggest' }, { value: 'apply', label: 'Apply' }]}
              hint="Suggest only detects and lists; Apply shifts every snippet with a clear pitch to the nearest C" />
            <Slider label="Pitch confidence" min={0} max={1} step={0.05} value={settings.pitchConfidence}
              onChange={v => update('pitchConfidence', v)} format={v => v.toFixed(2)}
              disabled={settings.repitch !== 'apply'}
              hint="Below this a snippet keeps its own pitch" />
            <Slider label="Random detune" min={0} max={12} step={0.5} value={settings.detuneSt}
              onChange={v => update('detuneSt', v)} format={v => (v ? `± ${v} st` : 'off')} />
            <Segmented label="Resampling" value={settings.resampler} onChange={v => update('resampler', v)}
              options={[{ value: 'sinc', label: 'Clean' }, { value: 'linear', label: 'Lo-fi' }]}
              hint="Clean (windowed sinc) keeps the highs on big shifts; Lo-fi (linear) is duller and grittier" />
          </Group>

          <Group title="Sources and file">
            <Segmented label="Source mix" value={settings.sourceMix} onChange={v => update('sourceMix', v)}
              options={[{ value: 'even', label: 'Even' }, { value: 'length', label: 'By length' }]}
              hint="Even: every source equally likely. By length: longer files are picked more" />
            <Slider label="Max per source" min={0} max={50} value={settings.maxPerSource}
              onChange={v => update('maxPerSource', v)} format={v => (v === 0 ? 'no limit' : String(v))} />
            <Toggle label="Cue point at each snippet" checked={settings.cuePoints} onChange={v => update('cuePoints', v)}
              hint="So the slice mode jumps between snippets. At most 255" />
            <Toggle label="Loop the file" checked={settings.loop} onChange={v => update('loop', v)}
              hint="Crossfades the end into the start" />
          </Group>
        </section>

        {/* Generate + results */}
        <section className="min-h-0 flex flex-col">
          <div className="shrink-0 px-4 py-3 border-b border-white/10 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-gray-400">Seed</span>
              <input
                value={seed}
                onChange={e => {
                  const v = Number(e.target.value.replace(/\D/g, ''));
                  if (Number.isFinite(v)) setSeedState({ seed: Math.min(v, 4294967295) >>> 0, locked: true });
                }}
                className="w-28 bg-black/40 border border-white/10 rounded px-2 py-1 font-mono text-xs"
                title="The first variation of the next batch uses this seed"
              />
              <button onClick={() => setSeedState({ seed: randomSeed(), locked })}
                className="p-1 text-gray-400 hover:text-white" title="Roll a new seed">
                <Dices size={15} />
              </button>
              <button onClick={() => setSeedState({ seed, locked: !locked })}
                className={`p-1 ${locked ? 'text-synthux-yellow' : 'text-gray-500 hover:text-white'}`}
                title={locked ? 'Locked: the seed stays after a batch' : 'Unlocked: a new seed after every batch'}>
                {locked ? <Lock size={14} /> : <Unlock size={14} />}
              </button>
            </div>

            <div className="w-40">
              <Slider label="Variations" min={1} max={VARIATIONS_MAX} value={settings.variations}
                onChange={v => update('variations', v)} format={String} />
            </div>

            <div className="ml-auto flex items-center gap-2">
              {busy ? (
                <button onClick={cancelBatch}
                  className="flex items-center gap-2 px-4 h-10 rounded-full text-sm font-bold border border-white/20
                    text-gray-300 hover:bg-white/10">
                  <X size={15} /> Stop
                </button>
              ) : (
                <button onClick={generate} disabled={enabledSources.length === 0}
                  className="flex items-center gap-2 px-5 h-10 rounded-full text-sm font-bold bg-synthux-red text-white
                    shadow-lg shadow-synthux-red/30 hover:scale-105 active:scale-95 transition-all
                    disabled:opacity-40 disabled:hover:scale-100 disabled:cursor-not-allowed">
                  <Dices size={16} /> Generate {settings.variations}
                </button>
              )}
            </div>
          </div>

          {batch && (
            <div className="shrink-0 px-4 py-2 border-b border-white/10 text-[11px] text-gray-400 flex items-center gap-3">
              <Loader size={13} className="animate-spin text-synthux-red" />
              {batch.phase === 'decoding'
                ? `Decoding sources ${Math.min(batch.decodeDone + 1, batch.decodeTotal)} of ${batch.decodeTotal}…`
                : batch.total > 1
                  ? `${batch.label}: ${batch.progress.filter(p => p >= 1).length} of ${batch.total} done…`
                  : `${batch.label}…`}
              <div className="flex-1 flex gap-1">
                {batch.progress.map((p, i) => (
                  <div key={i} className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full bg-synthux-red transition-[width]" style={{ width: `${p * 100}%` }} />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
            {loaded && results.length === 0 && !batch && (
              <p className="text-sm text-gray-500 text-center mt-16 leading-relaxed">
                Set the ranges, then Generate. Each variation uses the same settings with its own seed.
                <br />Star the ones you like: unstarred results are cleared when the next batch starts.
              </p>
            )}

            {results.map(r => {
              const playing = player.activeFileId === r.id && player.isPlaying;
              const frames = Math.max(1, r.duration * 48000);
              const used = usedSources(r.recipe);
              const pitched = r.recipe.snippets.filter(s => s.pitch).length;
              const isOpen = expanded === r.id;
              const license = resultLicense(r.recipe);
              const blocked = license.level === 'no-derivatives';
              const zoom = zooms[r.id];
              const regionHere = region.playing?.resultId === r.id ? region.playing : null;
              const total = r.duration || 1;
              const progress = player.activeFileId === r.id
                ? progressOf(r.id)
                : regionHere && region.position !== null ? region.position / total : null;
              const marked = regionHere && regionHere.index >= 0
                ? regionHere.index
                : hover?.id === r.id ? hover.index : -1;
              const markedSnippet = marked >= 0 ? r.recipe.snippets[marked] : null;
              return (
                <article key={r.id}
                  className={`rounded-xl border p-3 bg-synthux-panel/80 ${r.kept ? 'border-synthux-yellow/40' : 'border-white/10'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <button
                      onClick={() => player.play(playable(r.id, r.name, r.blob, r.duration))}
                      className="h-8 w-8 shrink-0 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
                      title={playing ? 'Pause' : 'Play'}
                    >
                      {playing ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold truncate">{r.name}</div>
                      <div className="text-[10px] text-gray-500 truncate">
                        {r.recipe.snippets.length} snippets · {r.recipe.cuePoints.length} cues
                        {r.recipe.cuesCapped ? ' (capped)' : ''} · {used.length} source{used.length === 1 ? '' : 's'}
                        {r.recipe.peakReductionDb < -0.5 ? ` · limited ${formatDb(r.recipe.peakReductionDb)}` : ''}
                        {' '}<LicenseBadge level={license.level} terms={license.text} />
                      </div>
                      {blocked && (
                        <div className="text-[10px] text-synthux-red truncate">
                          Can't be saved: uses {license.blockedBy.map(b => b.name).join(', ')} (no derivatives)
                        </div>
                      )}
                    </div>
                    <button onClick={() => applySeed(r.recipe.seed)}
                      className="shrink-0 font-mono text-[10px] text-gray-500 hover:text-white px-1.5 py-0.5 rounded border border-white/10"
                      title="Use this seed for the next batch">
                      {r.recipe.seed}
                    </button>
                    <IconButton title={r.kept ? 'Kept: survives the next batch' : 'Keep'} onClick={() => toggleKeep(r)}
                      className={r.kept ? 'text-synthux-yellow' : 'text-gray-500 hover:text-synthux-yellow'}>
                      <Star size={15} fill={r.kept ? 'currentColor' : 'none'} />
                    </IconButton>
                    <IconButton title="Download WAV" onClick={() => downloadResult(r)} disabled={blocked}
                      className="text-gray-400 hover:text-white">
                      <Download size={15} />
                    </IconButton>
                    <IconButton title="Save to the Studio user library" onClick={() => requestSave('library', [r])}
                      disabled={blocked} className="text-gray-400 hover:text-synthux-yellow">
                      <Library size={15} />
                    </IconButton>
                    <IconButton title="Add to the Browse pool" onClick={() => requestSave('pool', [r])}
                      disabled={blocked} className="text-gray-400 hover:text-synthux-green">
                      <Layers size={15} />
                    </IconButton>
                    <IconButton title="New Studio project with this file" onClick={() => startProject([r])}
                      disabled={blocked} className="text-gray-400 hover:text-synthux-orange">
                      <FolderPlus size={15} />
                    </IconButton>
                    <IconButton title="Discard" onClick={() => discard(r.id)} className="text-gray-500 hover:text-synthux-red">
                      <Trash2 size={15} />
                    </IconButton>
                  </div>

                  <div className="flex items-center gap-1 mb-1.5 text-[10px]">
                    <CardAction onClick={() => rerender(r)} disabled={busy} icon={<RefreshCw size={11} />}
                      title="Render this seed again with the sliders as they are now (locked snippets stay)">
                      Same seed, current settings
                    </CardAction>
                    {undo[r.id] && (
                      <CardAction onClick={() => undoEdit(r)} disabled={busy} icon={<Undo2 size={11} />}
                        title="Back to the version before the last edit">
                        Undo
                      </CardAction>
                    )}
                    <CardAction
                      onClick={() => setZooms(prev => {
                        const next = { ...prev };
                        if (next[r.id] !== undefined) delete next[r.id]; else next[r.id] = 4;
                        return next;
                      })}
                      active={zoom !== undefined}
                      icon={<ZoomIn size={11} />}
                      title="A taller waveform you can zoom into, with snippet numbers"
                    >
                      Zoom
                    </CardAction>
                  </div>

                  <ResultWaveform
                    peaks={r.peaks}
                    audio={zoom !== undefined ? region.decoded[r.id] : undefined}
                    boundaries={r.recipe.snippets.map(s => (s.outStart + (s.xfade >> 1)) / frames)}
                    progress={progress}
                    highlight={markedSnippet
                      ? [markedSnippet.outStart / frames, (markedSnippet.outStart + markedSnippet.length) / frames]
                      : null}
                    zoom={zoom}
                    onZoom={z => setZooms(prev => ({ ...prev, [r.id]: z }))}
                    onPick={f => {
                      // The whole file playing: seek it. Otherwise play the snippet clicked.
                      if (player.activeFileId === r.id && player.isPlaying) player.seek(f * player.duration);
                      else playSnippet(r, snippetAt(r, f));
                    }}
                  />

                  <button onClick={() => setExpanded(isOpen ? null : r.id)}
                    className="mt-2 flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300">
                    {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    Snippets{pitched ? ` · ${pitched} with a pitch` : ''}
                  </button>
                  {isOpen && (
                    <SnippetTable
                      entry={r}
                      busy={busy}
                      playingIndex={regionHere ? regionHere.index : -1}
                      onPlay={i => playSnippet(r, i)}
                      onHover={i => setHover(i === null ? null : { id: r.id, index: i })}
                      onDelete={i => deleteSnippet(r, i)}
                      onToggleLock={i => toggleLock(r, i)}
                      onToggleC={(i, on) => setToC(r, [i], on)}
                      onAllToC={indices => setToC(r, indices, true)}
                      onReroll={() => rerollUnlocked(r)}
                      variations={settings.variations}
                    />
                  )}
                </article>
              );
            })}
          </div>

          <div className="shrink-0 px-4 py-2 border-t border-white/10 flex items-center gap-3 text-[10px] text-gray-500">
            <span>
              {results.length} result{results.length === 1 ? '' : 's'} · {results.filter(r => r.kept).length} kept ·{' '}
              {(resultsBytes / 1024 / 1024).toFixed(0)} MB in browser storage
            </span>
            {keptResults.length > 0 && (
              <span className="flex items-center gap-1 ml-2">
                <span className="text-gray-400">Kept:</span>
                <FooterButton onClick={() => requestSave('library', keptResults)} icon={<Library size={12} />}>
                  Save to library
                </FooterButton>
                <FooterButton onClick={() => requestSave('pool', keptResults)} icon={<Layers size={12} />}>
                  Browse pool
                </FooterButton>
                <FooterButton onClick={() => startProject(keptResults)} icon={<FolderPlus size={12} />}>
                  New project
                </FooterButton>
              </span>
            )}
            {results.some(r => !r.kept) && !busy && (
              <button onClick={clearUnkept} className="ml-auto text-gray-400 hover:text-white underline-offset-2 hover:underline">
                Clear unkept
              </button>
            )}
          </div>
        </section>
      </div>

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 border-4 border-dashed border-synthux-red/60 bg-synthux-red/5
          flex items-center justify-center text-lg font-bold">
          Drop to add to the source pool
        </div>
      )}

      {pickerOpen && (
        <div className="fixed inset-0 z-[70] bg-black/70 flex flex-col p-4 sm:p-8">
          <div className="flex-1 min-h-0 flex flex-col rounded-xl overflow-hidden border border-white/10 bg-synthux-browsebg shadow-2xl">
            <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-2 border-b border-white/10 bg-synthux-panel">
              <span className="text-[11px] text-gray-400">
                <span className="font-bold uppercase tracking-widest text-synthux-red mr-3">Add to mangle pool</span>
                {sources.length} source{sources.length === 1 ? '' : 's'} in the pool
                {adding > 0 && <span className="ml-2 inline-flex items-center gap-1"><Loader size={11} className="animate-spin" /> adding {adding}…</span>}
              </span>
              <button onClick={() => setPickerOpen(false)}
                className="px-4 py-1.5 rounded-full text-xs font-bold bg-synthux-red text-white hover:bg-synthux-red/80">
                Done
              </button>
            </div>
            <div className="flex-1 min-h-0 relative flex flex-col">
              <Suspense fallback={
                <div className="h-full flex items-center justify-center text-gray-500"><Loader size={20} className="animate-spin" /></div>
              }>
                <SampleBrowser
                  isOpen
                  mode="picker"
                  addLabel="Add to mangle pool"
                  addedLabel="In mangle pool"
                  onClose={() => setPickerOpen(false)}
                  onImport={addFromUrl}
                  addedPaths={pooledPaths}
                  userLibrary={userLibrary}
                  onRemoteBulkImport={async (samples, _target, origin, license) => {
                    for (const sample of samples) {
                      try { await addFromUrl(sample.url, sample.name, origin, license, sample.path); } catch { /* next */ }
                    }
                  }}
                  onImportToPool={async (files) => {
                    for (const { file, path } of files) {
                      try { await addFromUrl(URL.createObjectURL(file), file.name, 'Local Folder', undefined, path); } catch { /* next */ }
                    }
                  }}
                />
              </Suspense>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={pendingSave !== null}
        onClose={() => setPendingSave(null)}
        onConfirm={confirmSave}
        title={pendingSave?.route === 'library' ? 'Save to the user library' : 'Add to the Browse pool'}
        message={pendingSave && (
          <span className="space-y-2 block">
            <span className="block">
              {pendingSave.results.length === 1 ? <strong>{pendingSave.results[0].name}</strong> : `${pendingSave.results.length} results`}
              {pendingSave.route === 'library'
                ? " will be added to the user library. Studio copies it into User_Library/ in your work folder the next time it opens."
                : " will be added to Browse's temporary pool, where you can build an SK/ folder or a project from it."}
            </span>
            {pendingSave.route === 'library' && (
              <span className="block text-synthux-yellow">
                Close Studio in any other tab first: while it is open it writes its own copy of the library
                over this one.
              </span>
            )}
            {pendingSave.results.some(r => resultLicense(r.recipe).level === 'personal') && (
              <span className="block text-gray-400">
                Some of it is built from personal-use samples: fine in your own music, but not to be shared as a sample.
                The license note travels with the file.
              </span>
            )}
          </span>
        )}
        confirmLabel={pendingSave?.route === 'library' ? 'Save' : 'Add'}
      />

      <ConfirmModal
        isOpen={pooledPrompt !== null}
        onClose={() => setPooledPrompt(null)}
        onConfirm={() => { setPooledPrompt(null); onEnterBrowse?.(); }}
        title="Added to the Browse pool"
        message={`${pooledPrompt === 1 ? 'The result is' : `${pooledPrompt} results are`} in the temporary pool. Open Browse to download it as an SK/ folder or import it into a project.`}
        confirmLabel={onEnterBrowse ? 'Open Browse' : 'Got it'}
        cancelLabel="Stay here"
        showCancel={!!onEnterBrowse}
      />

      <ProjectNameModal
        isOpen={projectResults !== null && pendingName === null && !showExport}
        onClose={() => setProjectResults(null)}
        onConfirm={(name) => setPendingName(name)}
        title={`New project with ${projectResults?.length ?? 0} file${projectResults?.length === 1 ? '' : 's'}`}
        initialValue="Mangled"
        placeholder="Project name…"
        confirmLabel="Continue"
      />

      <WorkspaceChoiceModal
        isOpen={pendingName !== null}
        onClose={() => { setPendingName(null); setProjectResults(null); }}
        projectName={pendingName || ''}
        existing={knownWorkspace}
        onUseExisting={continueInKnownWorkspace}
        onPickFolder={pickAnotherWorkspace}
        onRunSetup={knownWorkspace || !onEnterStudio ? undefined : () => {
          setPendingName(null);
          onEnterStudio();
        }}
      />

      <ExportProgressModal
        isOpen={showExport}
        onClose={() => { setShowExport(false); setProjectResults(null); }}
        logs={exportLogs}
        isComplete={exportDone}
        error={exportError}
      />

      <ProjectCreatedModal
        projectName={createdProject}
        onDismiss={() => setCreatedProject(null)}
        onEnterStudio={onEnterStudio}
      />

      <Toast toasts={toasts} onRemove={removeToast} />
    </div>
  );
};

const LicenseBadge: React.FC<{ level: keyof typeof LEVEL_LABEL; terms?: string }> = ({ level, terms }) => {
  if (level === 'open') return null;
  const tone = level === 'no-derivatives'
    ? 'text-synthux-red border-synthux-red/40'
    : 'text-synthux-yellow/90 border-synthux-yellow/30';
  return (
    <span title={terms || LEVEL_LABEL[level]}
      className={`shrink-0 inline-block px-1 rounded border text-[9px] uppercase tracking-wider leading-[14px] ${tone}`}>
      {LEVEL_LABEL[level]}
    </span>
  );
};

const FooterButton: React.FC<{ onClick: () => void; icon: React.ReactNode; children: React.ReactNode }> = ({
  onClick, icon, children,
}) => (
  <button onClick={onClick}
    className="flex items-center gap-1 px-2 py-0.5 rounded border border-white/10 text-gray-300 hover:text-white hover:bg-white/5">
    {icon} {children}
  </button>
);

const Group: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <fieldset className="space-y-3 rounded-lg border border-white/5 bg-white/[0.02] p-3">
    <legend className="px-1 text-[10px] font-bold uppercase tracking-widest text-gray-500">{title}</legend>
    {children}
  </fieldset>
);

const IconButton: React.FC<{
  title: string; onClick: () => void; className: string; children: React.ReactNode; disabled?: boolean;
}> = ({ title, onClick, className, children, disabled }) => (
  <button onClick={onClick} title={title} aria-label={title} disabled={disabled}
    className={`shrink-0 h-8 w-8 flex items-center justify-center rounded-md hover:bg-white/5 transition-colors
      disabled:opacity-25 disabled:cursor-not-allowed ${className}`}>
    {children}
  </button>
);

const CardAction: React.FC<{
  onClick: () => void; icon: React.ReactNode; title: string; children: React.ReactNode;
  disabled?: boolean; active?: boolean;
}> = ({ onClick, icon, title, children, disabled, active }) => (
  <button onClick={onClick} disabled={disabled} title={title}
    className={`flex items-center gap-1 px-2 py-0.5 rounded border transition-colors disabled:opacity-30 disabled:cursor-not-allowed
      ${active ? 'border-synthux-red/60 text-white bg-synthux-red/20' : 'border-white/10 text-gray-400 hover:text-white hover:bg-white/5'}`}>
    {icon} {children}
  </button>
);

interface SnippetTableProps {
  entry: MangleResultEntry;
  busy: boolean;
  playingIndex: number;
  onPlay: (index: number) => void;
  onHover: (index: number | null) => void;
  onDelete: (index: number) => void;
  onToggleLock: (index: number) => void;
  onToggleC: (index: number, on: boolean) => void;
  onAllToC: (indices: number[]) => void;
  onReroll: () => void;
  variations: number;
}

/** Every snippet of one result: where it came from, what was done to it, and the edits. */
const SnippetTable: React.FC<SnippetTableProps> = ({
  entry, busy, playingIndex, onPlay, onHover, onDelete, onToggleLock, onToggleC, onAllToC, onReroll, variations,
}) => {
  const { recipe } = entry;
  const sr = 48000;
  const locked = new Set(entry.locked ?? []);
  const threshold = recipe.settings.pitchConfidence ?? 0.8;
  const confident = recipe.snippets
    .map((s, i) => (s.pitch && !s.toCApplied && s.pitch.confidence >= threshold ? i : -1))
    .filter(i => i >= 0);

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-1.5 mb-1.5 text-[10px] text-gray-500">
        {confident.length > 0 && (
          <CardAction onClick={() => onAllToC(confident)} disabled={busy} icon={<span className="font-bold">C</span>}
            title={`Move every snippet with a pitch confidence of ${Math.round(threshold * 100)}% or more to the nearest C`}>
            All confident to C ({confident.length})
          </CardAction>
        )}
        {locked.size > 0 && (
          <CardAction onClick={onReroll} disabled={busy} icon={<Dices size={11} />}
            title="New variations that keep the locked snippets where they are and roll the rest, with the current settings">
            Reroll the rest ×{variations} ({locked.size} locked)
          </CardAction>
        )}
        <span className="ml-auto">Lock snippets to keep them in a reroll · edits can be undone once</span>
      </div>
      <div className="max-h-72 overflow-y-auto rounded border border-white/5" onMouseLeave={() => onHover(null)}>
        <table className="w-full text-[10px] font-mono">
          <thead className="sticky top-0 bg-synthux-panel text-gray-500 z-10">
            <tr className="text-left">
              <th className="px-1 py-1 font-normal w-6" aria-label="Play" />
              <th className="px-2 py-1 font-normal">#</th>
              <th className="px-2 py-1 font-normal">at</th>
              <th className="px-2 py-1 font-normal">source</th>
              <th className="px-2 py-1 font-normal text-right">length</th>
              <th className="px-2 py-1 font-normal text-right">gain</th>
              <th className="px-2 py-1 font-normal" title="Direction: forwards or reversed">dir</th>
              <th className="px-2 py-1 font-normal">pitch</th>
              <th className="px-1 py-1 font-normal" aria-label="Actions" />
            </tr>
          </thead>
          <tbody className="text-gray-300">
            {recipe.snippets.map((s, i) => {
              const isPlaying = playingIndex === i;
              const isLocked = locked.has(i);
              return (
                <tr key={i} onMouseEnter={() => onHover(i)}
                  className={`border-t border-white/5 group ${isPlaying ? 'bg-synthux-red/15' : isLocked ? 'bg-synthux-yellow/5' : 'hover:bg-white/[0.03]'}`}>
                  <td className="px-1 py-0.5">
                    <button onClick={() => onPlay(i)} title={isPlaying ? 'Stop' : 'Play this snippet'}
                      className={`h-5 w-5 flex items-center justify-center rounded ${isPlaying ? 'text-synthux-red' : 'text-gray-500 hover:text-white'}`}>
                      {isPlaying ? <Square size={10} fill="currentColor" /> : <Play size={11} />}
                    </button>
                  </td>
                  <td className="px-2 py-0.5 text-gray-600">{i + 1}</td>
                  <td className="px-2 py-0.5 text-gray-500">{(s.outStart / sr).toFixed(2)}</td>
                  <td className="px-2 py-0.5 truncate max-w-[10rem]" title={recipe.sources[s.source]?.name}>
                    {recipe.sources[s.source]?.name ?? '?'}
                  </td>
                  <td className="px-2 py-0.5 text-right">{formatMs((s.length / sr) * 1000)}</td>
                  <td className="px-2 py-0.5 text-right">{Number.isFinite(s.measuredDb) ? formatDb(s.gainDb) : 'silent'}</td>
                  <td className="px-2 py-0.5 text-gray-400" title={s.reverse ? 'Reversed' : 'Forwards'}>{s.reverse ? '←' : '→'}</td>
                  <td className="px-2 py-0.5">
                    {s.pitch
                      ? `${s.pitch.note} (${Math.round(s.pitch.confidence * 100)}%) → C ${formatSt(s.pitch.toC)}`
                      : <span className="text-gray-600">no pitch</span>}
                    {Math.abs(s.shift) > 0.01 && <span className="text-synthux-yellow"> · shifted {formatSt(s.shift)}</span>}
                  </td>
                  <td className="px-1 py-0.5">
                    <span className="flex items-center justify-end gap-0.5">
                      {s.pitch && (
                        <RowButton onClick={() => onToggleC(i, !s.toCApplied)} disabled={busy}
                          title={s.toCApplied ? 'Back to its own pitch' : `Move to C (${formatSt(s.pitch.toC)})`}
                          className={s.toCApplied ? 'text-synthux-yellow' : 'text-gray-500 hover:text-white'}>
                          <span className="font-bold text-[10px]">C</span>
                        </RowButton>
                      )}
                      <RowButton onClick={() => onToggleLock(i)} title={isLocked ? 'Unlock' : 'Lock: keep this snippet in a reroll'}
                        className={isLocked ? 'text-synthux-yellow' : 'text-gray-600 hover:text-white'}>
                        {isLocked ? <Lock size={11} /> : <Unlock size={11} />}
                      </RowButton>
                      <RowButton onClick={() => onDelete(i)} disabled={busy || recipe.snippets.length < 2}
                        title="Remove this snippet; the rest move up and the end is refilled"
                        className="text-gray-600 hover:text-synthux-red">
                        <Trash2 size={11} />
                      </RowButton>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const RowButton: React.FC<{
  onClick: () => void; title: string; className: string; children: React.ReactNode; disabled?: boolean;
}> = ({ onClick, title, className, children, disabled }) => (
  <button onClick={onClick} title={title} aria-label={title} disabled={disabled}
    className={`h-5 w-5 flex items-center justify-center rounded hover:bg-white/10 disabled:opacity-25 disabled:cursor-not-allowed ${className}`}>
    {children}
  </button>
);

export default MangleMode;
