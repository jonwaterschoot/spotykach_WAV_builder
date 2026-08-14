import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AudioWaveform, Check, ChevronLeft, Download, FileStack, FolderPlus, GripVertical, HardDrive,
  Layers, Loader, Trash2, X,
} from 'lucide-react';
import { audioEngine } from '../lib/audio/audioEngine';
import {
  buildDetachedState, slotLabelForIndex, tapeForIndex, GRID_CAPACITY, type DetachedSample,
} from '../utils/detachedState';
import { useEscapeLayer } from '../shell/escapeStack';
import { loadUserLibraryFromDB } from '../utils/persistence';
import { ExportProgressModal } from '../components/ExportProgressModal';
import { ProjectNameModal } from '../components/modals/ProjectNameModal';
import { ProjectCreatedModal } from '../shell/ProjectCreatedModal';
import { canPickFolder } from '../utils/newProject';
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

/** A pooled sample: decoded, resident in memory, belonging to no project. */
interface PoolItem extends DetachedSample {
  id: string;
  /** The browser's own key for this sample, so the pool can mark it as taken. */
  sourcePath?: string;
}

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
    .map(item => `- ${stripExtension(item.fileName || item.name)}.wav${item.origin ? `  —  ${item.origin}` : ''}`)
    .join('\n');

  const licenses = Array.from(new Set(items.map(i => i.license).filter(Boolean)));

  return `# Spotykach — loose file export

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
      ? 'This ZIP is already grouped into tape folders (B/G/P/R/T/Y, plus POOL for\nanything past the 36 slots) — the names inside them still need changing to\n1.WAV … 6.WAV.'
      : 'This ZIP is a flat list — no tape folders. Tick "Sort into tape folders" in\nBrowse if you would rather have the grouping done for you.'}

Want none of this by hand? Use **Download SD card 6×6** in Browse, which builds
the whole \`SK/\` folder ready to copy, or open Studio for a full project.

## Files
${credits}
${licenses.length > 0 ? `\n## Usage context\n${licenses.map(l => `- ${l}`).join('\n')}\n` : ''}`;
};

interface BrowseModeProps {
  onExitToHub: () => void;
  /** Offered after the pool becomes a project. Absent when the shell gave no route. */
  onEnterStudio?: () => void;
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
export const BrowseMode: React.FC<BrowseModeProps> = ({ onExitToHub, onEnterStudio }) => {
  const [pool, setPool] = useState<PoolItem[]>([]);
  const [isPoolOpen, setIsPoolOpen] = useState(false);
  const [userLibrary, setUserLibrary] = useState<UserLibrary | undefined>(undefined);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [sortLooseIntoTapes, setSortLooseIntoTapes] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [createdProject, setCreatedProject] = useState<string | null>(null);

  const [exportLogs, setExportLogs] = useState<string[]>([]);
  const [exportProgress, setExportProgress] = useState<number | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportComplete, setIsExportComplete] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [showExportProgress, setShowExportProgress] = useState(false);

  const poolRef = useRef<PoolItem[]>(pool);
  poolRef.current = pool;

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
  ) => {
    const isObjectUrl = url.startsWith('blob:');
    try {
      const response = await fetch(url, { mode: 'cors' });
      if (!response.ok) throw new Error(`Download failed (${response.status})`);
      const blob = await response.blob();
      const { buffer, blob: processedBlob } = await audioEngine.loadAndProcessAudio(blob);

      setPool(prev => [...prev, {
        id: newId(),
        name,
        fileName: fileNameFromSource(url, name),
        blob: processedBlob,
        duration: buffer.duration,
        origin,
        license,
        sourceSamplePath: isObjectUrl ? undefined : url,
        sourcePath,
      }]);
      setIsPoolOpen(true);
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

  const removeFromPool = (id: string) => setPool(prev => prev.filter(item => item.id !== id));

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
    setPool(prev => prev.map(item => (
      item.id === id ? { ...item, blob, duration, name } : item
    )));
  }, []);

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
  const importIntoProject = async (rawName: string) => {
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
      );

      if (!created) {
        setShowExportProgress(false); // Picker dismissed — nothing happened.
        return;
      }
      setExportProgress(100);
      setShowExportProgress(false);
      setCreatedProject(created.projectName);
    } catch (e) {
      console.error(e);
      setExportError(e instanceof Error ? e.message : 'Could not create the project.');
    } finally {
      setIsExporting(false);
      setIsExportComplete(true);
    }
  };

  const overflowCount = Math.max(0, pool.length - GRID_CAPACITY);
  const poolSummary = useMemo(() => {
    if (pool.length === 0) return 'Nothing selected yet';
    const total = pool.reduce((acc, item) => acc + (item.duration || 0), 0);
    return `${pool.length} file${pool.length === 1 ? '' : 's'} · ${formatDuration(total)}`;
  }, [pool]);

  return (
    <div className="h-screen w-full flex flex-col bg-synthux-main text-white overflow-hidden">

      {/* Mode bar */}
      <div className="shrink-0 flex items-center justify-between gap-4 px-4 py-2 border-b border-white/10 bg-synthux-panel">
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
            Preview, collect, download. Nothing is written to your drive.
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
          Selection
          <span className="px-1.5 py-0.5 rounded-full bg-black/50 text-[10px] font-mono">{pool.length}</span>
        </button>
      </div>

      <div className="flex-1 flex min-h-0">
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
              onImport={addToPool}
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

        {/* Selection pool */}
        {isPoolOpen && (
          <aside className="w-[340px] shrink-0 border-l border-white/10 bg-synthux-panel flex flex-col">
            <div className="shrink-0 flex items-start justify-between gap-2 p-4 border-b border-white/10">
              <div className="min-w-0">
                <h2 className="text-sm font-bold flex items-center gap-2">
                  <Layers size={15} className="text-synthux-green" /> Selection pool
                </h2>
                <p className="text-[11px] text-gray-500 mt-0.5">{poolSummary}</p>
              </div>
              <div className="flex items-center gap-1">
                {pool.length > 0 && (
                  <button
                    onClick={() => setPool([])}
                    className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    Clear
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

            <div className="flex-1 overflow-y-auto p-2 min-h-0">
              {pool.length === 0 ? (
                <p className="p-4 text-xs text-gray-500 leading-relaxed">
                  Add samples from the browser and they collect here. The first 36 spread across the
                  6&nbsp;×&nbsp;6 grid in this order — drag to rearrange.
                </p>
              ) : (
                <ul className="space-y-1">
                  {pool.map((item, index) => {
                    const slot = slotLabelForIndex(index);
                    const tape = tapeForIndex(index);
                    return (
                      <li
                        key={item.id}
                        draggable
                        onDragStart={() => setDragIndex(index)}
                        onDragOver={(e) => { e.preventDefault(); setDropIndex(index); }}
                        onDragEnd={() => { setDragIndex(null); setDropIndex(null); }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (dragIndex !== null) movePoolItem(dragIndex, index);
                          setDragIndex(null);
                          setDropIndex(null);
                        }}
                        className={`group relative flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-md border overflow-hidden
                          transition-colors cursor-grab active:cursor-grabbing ${
                          dropIndex === index && dragIndex !== null && dragIndex !== index
                            ? 'border-synthux-green bg-synthux-green/10'
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
                        <span className="min-w-0 flex-1">
                          <span className="block text-[11px] font-mono truncate text-gray-200">{item.name}</span>
                          <span className="block text-[9px] text-gray-600 truncate">
                            {formatDuration(item.duration || 0)}{item.origin ? ` · ${item.origin}` : ''}
                          </span>
                        </span>
                        <button
                          onClick={() => setEditingId(item.id)}
                          className="shrink-0 p-1 rounded text-gray-600 hover:text-synthux-pink hover:bg-synthux-pink/10 transition-colors"
                          title="Edit this file"
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

            <div className="shrink-0 p-3 border-t border-white/10 space-y-2">
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
                    Full <span className="font-mono">SK/</span> folder, renamed to slots — copy and play
                  </span>
                </span>
              </button>

              {overflowCount > 0 && (
                <p className="text-[10px] text-synthux-yellow/80 leading-relaxed pl-1">
                  The card build takes the first 36 — {overflowCount} more {overflowCount === 1 ? 'is' : 'are'} in
                  the loose download below.
                </p>
              )}

              <button
                onClick={downloadLooseFiles}
                disabled={pool.length === 0 || isExporting}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-synthux-blue/40 bg-synthux-blue/10
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

              <label className="flex items-center gap-2 pl-1 cursor-pointer group select-none">
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
                  Sort into tape folders ({TAPE_COLORS.map(c => c.charAt(0)).join('/')})
                </span>
              </label>

              <p className="flex items-start gap-1.5 text-[10px] text-gray-600 leading-relaxed pt-1">
                <Download size={11} className="shrink-0 mt-0.5" />
                Both go to your browser's downloads folder — no permission, nothing written to your drive.
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
                        Keeps the layout, on a folder you pick — then carry on in Studio
                      </span>
                    </span>
                  </button>
                </>
              )}
            </div>
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
            }}
            subtitle={`Editing ${editingItem.name} from your selection — applied edits go back into the pool, and both downloads pick them up.`}
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
        onConfirm={importIntoProject}
        title="Import into a project"
        initialValue="New Project"
        placeholder="Project name…"
        confirmLabel="Choose folder & create"
      />

      <ProjectCreatedModal
        projectName={createdProject}
        onDismiss={() => setCreatedProject(null)}
        onEnterStudio={onEnterStudio}
      />
    </div>
  );
};

export default BrowseMode;
