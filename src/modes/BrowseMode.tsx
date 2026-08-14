import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft, Download, GripVertical, HardDrive, Layers, Loader, Package, Trash2, X,
} from 'lucide-react';
import { audioEngine } from '../lib/audio/audioEngine';
import { buildDetachedState, slotLabelForIndex, GRID_CAPACITY, type DetachedSample } from '../utils/detachedState';
import { useEscapeLayer } from '../shell/escapeStack';
import { loadUserLibraryFromDB } from '../utils/persistence';
import { ExportProgressModal } from '../components/ExportProgressModal';
import type { UserLibrary } from '../types';

const SampleBrowser = React.lazy(() =>
  import('../components/SampleBrowser').then(m => ({ default: m.SampleBrowser }))
);

/** A pooled sample: decoded, resident in memory, belonging to no project. */
interface PoolItem extends DetachedSample {
  id: string;
}

const newId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2, 15);

const formatDuration = (seconds: number) => {
  if (!seconds || !isFinite(seconds)) return '--';
  return `${seconds.toFixed(1)}s`;
};

interface BrowseModeProps {
  onExitToHub: () => void;
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
export const BrowseMode: React.FC<BrowseModeProps> = ({ onExitToHub }) => {
  const [pool, setPool] = useState<PoolItem[]>([]);
  const [isPoolOpen, setIsPoolOpen] = useState(false);
  const [userLibrary, setUserLibrary] = useState<UserLibrary | undefined>(undefined);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

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
  const addToPool = useCallback(async (url: string, name: string, origin?: string, license?: string) => {
    const isObjectUrl = url.startsWith('blob:');
    try {
      const response = await fetch(url, { mode: 'cors' });
      if (!response.ok) throw new Error(`Download failed (${response.status})`);
      const blob = await response.blob();
      const { buffer, blob: processedBlob } = await audioEngine.loadAndProcessAudio(blob);

      setPool(prev => [...prev, {
        id: newId(),
        name,
        blob: processedBlob,
        duration: buffer.duration,
        origin,
        license,
        sourceSamplePath: isObjectUrl ? undefined : url,
      }]);
      setIsPoolOpen(true);
    } catch (e) {
      console.error(`Could not add ${name} to the pool`, e);
      throw e;
    } finally {
      if (isObjectUrl) URL.revokeObjectURL(url);
    }
  }, []);

  const addManyToPool = useCallback(async (samples: { url: string, name: string }[], origin?: string, license?: string) => {
    for (const sample of samples) {
      try {
        await addToPool(sample.url, sample.name, origin, license);
      } catch {
        // One bad sample shouldn't abandon the rest of the selection.
      }
    }
  }, [addToPool]);

  const removeFromPool = (id: string) => setPool(prev => prev.filter(item => item.id !== id));

  /** One file straight out of the pool — no ZIP, no grid. */
  const downloadOne = async (item: PoolItem) => {
    const { exportSingleFile } = await import('../utils/exportUtils');
    await exportSingleFile({
      versions: [{ id: item.id, blob: item.blob }],
      currentVersionId: item.id,
      name: item.name,
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

  // ──────────────────────────────────────────────────────────────────────────
  // Downloads — both are `buildDetachedState` plus an existing exporter
  // ──────────────────────────────────────────────────────────────────────────

  const runExport = async (
    label: string,
    run: (
      state: ReturnType<typeof buildDetachedState>,
      onProgress: (msg: string | undefined, progress?: number) => void
    ) => Promise<void>
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
  const downloadLooseFiles = () => runExport('Building SK-ready files…', async (state, onProgress) => {
    const { exportFilesOnly } = await import('../utils/exportUtils');
    await exportFilesOnly(state, {
      fileIds: Object.keys(state.files),
      keepStructure: true,
    }, onProgress);
  });

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
              userLibrary={userLibrary}
              onRemoteBulkImport={(samples, _target, origin, license) => addManyToPool(samples, origin, license)}
              onImportToPool={async (files) => {
                for (const { file } of files) {
                  const url = URL.createObjectURL(file);
                  try {
                    await addToPool(url, file.name, 'Local Folder');
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
                        className={`group flex items-center gap-2 px-2 py-1.5 rounded-md border transition-colors cursor-grab active:cursor-grabbing ${
                          dropIndex === index && dragIndex !== null && dragIndex !== index
                            ? 'border-synthux-green bg-synthux-green/10'
                            : 'border-white/5 bg-black/20 hover:bg-white/5'
                        } ${dragIndex === index ? 'opacity-40' : ''}`}
                      >
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
              {overflowCount > 0 && (
                <p className="text-[10px] text-synthux-yellow/80 leading-relaxed">
                  {overflowCount} file{overflowCount === 1 ? '' : 's'} past the 36 slots — they'll land in
                  the loose-files ZIP, but not on the SD structure.
                </p>
              )}

              <button
                onClick={downloadLooseFiles}
                disabled={pool.length === 0 || isExporting}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-synthux-blue/40 bg-synthux-blue/10
                  text-synthux-blue text-left transition-all hover:bg-synthux-blue/20 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Package size={16} className="shrink-0" />
                <span className="min-w-0">
                  <span className="block text-xs font-bold">Download SK-ready files</span>
                  <span className="block text-[10px] opacity-70">ZIP, grouped by tape, hardware WAV</span>
                </span>
              </button>

              <button
                onClick={downloadSDStructure}
                disabled={pool.length === 0 || isExporting}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-synthux-green/40 bg-synthux-green/10
                  text-synthux-green text-left transition-all hover:bg-synthux-green/20 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <HardDrive size={16} className="shrink-0" />
                <span className="min-w-0">
                  <span className="block text-xs font-bold">Download SD card 6×6</span>
                  <span className="block text-[10px] opacity-70">ZIP with the full SK/ folder, ready to copy</span>
                </span>
              </button>

              <p className="flex items-start gap-1.5 text-[10px] text-gray-600 leading-relaxed pt-1">
                <Download size={11} className="shrink-0 mt-0.5" />
                Both go to your browser's downloads folder. Want to write to the card directly, or keep a
                project? That's Studio.
              </p>
            </div>
          </aside>
        )}
      </div>

      <ExportProgressModal
        isOpen={showExportProgress}
        onClose={() => setShowExportProgress(false)}
        logs={exportLogs}
        isComplete={isExportComplete}
        error={exportError}
        progress={exportProgress !== null ? exportProgress : undefined}
      />
    </div>
  );
};

export default BrowseMode;
