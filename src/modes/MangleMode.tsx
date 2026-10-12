import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown, ChevronLeft, ChevronRight, Dices, Download, Loader, Lock, Pause, Play, Plus, Star, Trash2,
  Unlock, X,
} from 'lucide-react';
import { useEscapeLayer } from '../shell/escapeStack';
import { useToasts } from '../shell/useToasts';
import { Toast } from '../components/Toast';
import { useAudioPlayer } from '../contexts/AudioPlayerContext';
import { appStorage } from '../utils/storageNamespace';
import {
  deleteMangleResultsFromDB, deleteMangleSourcesFromDB, loadMangleResultsFromDB, loadMangleSourcesFromDB,
  putMangleResultToDB, putMangleSourceToDB,
} from '../utils/persistence';
import type { MangleResultEntry, MangleSourceEntry } from '../utils/persistence';
import type { FileRecord } from '../types';
import { runBatch, resultToWav, type BatchHandle } from '../mangler/batch';
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
  phase: 'decoding' | 'rendering';
  total: number;
  /** Per variation, 0–1. */
  progress: number[];
  decodeDone: number;
  decodeTotal: number;
}

interface MangleModeProps {
  onExitToHub: () => void;
}

/**
 * Sample Mangler at `#/mangle`: random snippets from a pool of sources, joined
 * into one file of up to 42 s. No project and no folder: the pool and the results
 * live in IndexedDB until a result is saved. See docs/sample_mangler.
 */
export const MangleMode: React.FC<MangleModeProps> = ({ onExitToHub }) => {
  const [sources, setSources] = useState<MangleSourceEntry[]>([]);
  const [results, setResults] = useState<MangleResultEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [settings, setSettings] = useState<MangleSettings>(loadSettings);
  const [{ seed, locked }, setSeedState] = useState(loadSeed);
  const [batch, setBatch] = useState<BatchState | null>(null);
  const [adding, setAdding] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const batchRef = useRef<BatchHandle | null>(null);

  const { toasts, showToast, removeToast } = useToasts();
  const player = useAudioPlayer();

  useEscapeLayer(true, () => {
    onExitToHub();
    return true;
  });

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

  const toggleSource = useCallback((entry: MangleSourceEntry) => {
    const next = { ...entry, enabled: !entry.enabled };
    setSources(prev => prev.map(s => (s.id === entry.id ? next : s)));
    putMangleSourceToDB(next).catch(e => console.error(e));
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

    const handle = runBatch(
      enabledSources.map(s => ({ id: s.id, blob: s.blob })),
      batchSettings,
      seeds,
      {
        onDecodeProgress: (done, total) =>
          setBatch(prev => (prev ? { ...prev, decodeDone: done, decodeTotal: total } : prev)),
        onProgress: (index, fraction) =>
          setBatch(prev => {
            if (!prev) return prev;
            const progress = [...prev.progress];
            progress[index] = fraction;
            return { ...prev, phase: 'rendering', progress };
          }),
        onResult: async (_index, result) => {
          let name = resultName(result.seed);
          for (let n = 2; taken.has(name); n++) name = `${resultName(result.seed)}-${n}`;
          taken.add(name);
          const entry: MangleResultEntry = {
            id: newId(),
            name,
            blob: resultToWav(result, name),
            duration: result.left.length / result.sampleRate,
            recipe: recipeFromResult(result, batchSettings, recipeSources),
            peaks: waveformPeaks(result.left, result.right),
            kept: false,
            batchId,
            createdAt: Date.now(),
          };
          try {
            await putMangleResultToDB(entry);
          } catch (e) {
            console.error(e);
            showToast('Could not store a result (storage full?). It is shown but will not survive a reload.', 'error');
          }
          setResults(prev => sortResults([...prev, entry]));
        },
        onDone: () => {
          batchRef.current = null;
          setBatch(null);
          if (!locked) setSeedState({ seed: randomSeed(), locked: false });
        },
        onError: (message) => {
          batchRef.current?.cancel();
          batchRef.current = null;
          setBatch(null);
          showToast(message, 'error');
        },
      },
    );
    batchRef.current = handle;
    setBatch({
      handle,
      phase: 'decoding',
      total: count,
      progress: Array(count).fill(0),
      decodeDone: 0,
      decodeTotal: enabledSources.length,
    });
  }, [enabledSources, results, settings, seed, locked, player, showToast]);

  const cancelBatch = useCallback(() => {
    batchRef.current?.cancel();
    batchRef.current = null;
    setBatch(null);
    showToast('Stopped. Results that had finished are kept in the list.', 'info');
  }, [showToast]);

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
    setResults(prev => prev.filter(r => r.id !== id));
    deleteMangleResultsFromDB([id]);
  }, [player]);

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
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Source pool</h2>
            <button
              onClick={() => inputRef.current?.click()}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold text-synthux-red
                border border-synthux-red/40 hover:bg-synthux-red/10 transition-colors"
            >
              <Plus size={12} /> Add files
            </button>
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
                  Picking from the sample packs comes next.
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
                      <span className="block truncate text-[10px] text-gray-500">{s.origin}</span>
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
                : `Rendering ${batch.progress.filter(p => p >= 1).length} of ${batch.total}…`}
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
                      </div>
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
                    <IconButton title="Download WAV" onClick={() => downloadBlob(r.blob, `${r.name}.wav`)}
                      className="text-gray-400 hover:text-white">
                      <Download size={15} />
                    </IconButton>
                    <IconButton title="Discard" onClick={() => discard(r.id)} className="text-gray-500 hover:text-synthux-red">
                      <Trash2 size={15} />
                    </IconButton>
                  </div>

                  <ResultWaveform
                    peaks={r.peaks}
                    boundaries={r.recipe.snippets.map(s => (s.outStart + (s.xfade >> 1)) / frames)}
                    progress={player.activeFileId === r.id ? progressOf(r.id) : null}
                    onSeek={player.activeFileId === r.id ? f => player.seek(f * player.duration) : undefined}
                  />

                  <button onClick={() => setExpanded(isOpen ? null : r.id)}
                    className="mt-2 flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300">
                    {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    Snippets{pitched ? ` · ${pitched} with a pitch` : ''}
                  </button>
                  {isOpen && <SnippetTable entry={r} />}
                </article>
              );
            })}
          </div>

          <div className="shrink-0 px-4 py-2 border-t border-white/10 flex items-center gap-3 text-[10px] text-gray-500">
            <span>
              {results.length} result{results.length === 1 ? '' : 's'} · {results.filter(r => r.kept).length} kept ·{' '}
              {(resultsBytes / 1024 / 1024).toFixed(0)} MB in browser storage
            </span>
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

      <Toast toasts={toasts} onRemove={removeToast} />
    </div>
  );
};

const Group: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <fieldset className="space-y-3 rounded-lg border border-white/5 bg-white/[0.02] p-3">
    <legend className="px-1 text-[10px] font-bold uppercase tracking-widest text-gray-500">{title}</legend>
    {children}
  </fieldset>
);

const IconButton: React.FC<{ title: string; onClick: () => void; className: string; children: React.ReactNode }> = ({
  title, onClick, className, children,
}) => (
  <button onClick={onClick} title={title} aria-label={title}
    className={`shrink-0 h-8 w-8 flex items-center justify-center rounded-md hover:bg-white/5 transition-colors ${className}`}>
    {children}
  </button>
);

/** Every snippet of one result: where it came from and what was done to it. */
const SnippetTable: React.FC<{ entry: MangleResultEntry }> = ({ entry }) => {
  const { recipe } = entry;
  const sr = 48000;
  return (
    <div className="mt-2 max-h-64 overflow-y-auto rounded border border-white/5">
      <table className="w-full text-[10px] font-mono">
        <thead className="sticky top-0 bg-synthux-panel text-gray-500">
          <tr className="text-left">
            <th className="px-2 py-1 font-normal">#</th>
            <th className="px-2 py-1 font-normal">at</th>
            <th className="px-2 py-1 font-normal">source</th>
            <th className="px-2 py-1 font-normal text-right">length</th>
            <th className="px-2 py-1 font-normal text-right">gain</th>
            <th className="px-2 py-1 font-normal">dir</th>
            <th className="px-2 py-1 font-normal">pitch</th>
          </tr>
        </thead>
        <tbody className="text-gray-300">
          {recipe.snippets.map((s, i) => (
            <tr key={i} className="border-t border-white/5">
              <td className="px-2 py-0.5 text-gray-600">{i + 1}</td>
              <td className="px-2 py-0.5 text-gray-500">{(s.outStart / sr).toFixed(2)}</td>
              <td className="px-2 py-0.5 truncate max-w-[10rem]" title={recipe.sources[s.source]?.name}>
                {recipe.sources[s.source]?.name ?? '?'}
              </td>
              <td className="px-2 py-0.5 text-right">{formatMs((s.length / sr) * 1000)}</td>
              <td className="px-2 py-0.5 text-right">{Number.isFinite(s.measuredDb) ? formatDb(s.gainDb) : 'silent'}</td>
              <td className="px-2 py-0.5">{s.reverse ? '◀' : '▶'}</td>
              <td className="px-2 py-0.5">
                {s.pitch
                  ? `${s.pitch.note} (${Math.round(s.pitch.confidence * 100)}%) → C ${formatSt(s.pitch.toC)}`
                  : <span className="text-gray-600">no pitch</span>}
                {Math.abs(s.shift) > 0.01 && <span className="text-synthux-yellow"> · shifted {formatSt(s.shift)}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default MangleMode;
