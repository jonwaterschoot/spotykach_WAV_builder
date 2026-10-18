import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AudioWaveform, Briefcase, CheckSquare, ChevronDown, Drum, FolderOpen, Grid2x2, Import, Maximize, Minimize, Search, Usb, ChevronLeft, ChevronRight, Dices, Download, FolderPlus, Library, Loader, Lock, Package,
  Crop as CropIcon, HelpCircle, Pause, Pencil, Play, ListMusic, Plus, RefreshCw, Scissors, SlidersHorizontal, Smartphone, Square, Star, HardDrive, Share, Tag, Trash2, Waves, Undo2, Unlock, X, ZoomIn,
} from 'lucide-react';
import { ConfirmModal } from '../components/ConfirmModal';
import { ExportProgressModal } from '../components/ExportProgressModal';
import { ProjectNameModal } from '../components/modals/ProjectNameModal';
import { WorkspaceChoiceModal } from '../components/modals/WorkspaceChoiceModal';
import { ProjectCreatedModal } from '../shell/ProjectCreatedModal';
import { canPickFolder, ensureWorkspacePermission } from '../utils/newProject';
import { getDirectoryHandle, saveDirectoryHandle } from '../utils/storageUtils';
import { listFolderProjects, openFromFolder, openFromZip, saveToFolder, saveToZip, type ManglerSnapshot, type ProjectInfo } from '../mangler/project';
import { ProjectDialog } from '../mangler/ui/ProjectDialog';
import { CardDialog, type CardItem } from '../mangler/ui/CardDialog';
import { usbTransferSupported, useUsbTransferEnabled } from '../lib/usb/flag';
import { runningStandalone, useFullscreen } from '../utils/useFullscreen';
import { buildDetachedState, GRID_CAPACITY } from '../utils/detachedState';
import { LEVEL_LABEL, isLocalOrigin, resultLicense, sourceLicense } from '../mangler/license';
import type { LicenseLevel } from '../submission/licenses';
import { addResultsToBrowsePool, resultsAsDetached, resultsAsProjectFiles, resultsForM8, saveResultsToLibrary } from '../mangler/save';
import { useEscapeLayer } from '../shell/escapeStack';
import { useToasts } from '../shell/useToasts';
import { Toast } from '../components/Toast';
import { useAudioPlayer } from '../contexts/AudioPlayerContext';
import { appStorage } from '../utils/storageNamespace';
import {
  clearMangleStores, deleteMangleResultsFromDB, replaceMangleStores, deleteMangleSlicesFromDB, deleteMangleSourcesFromDB, loadMangleResultsFromDB,
  loadMangleSlicesFromDB, loadMangleSourcesFromDB, putMangleSlicesToDB,
  loadUserLibraryFromDB, putMangleResultDiskBacked, putMangleResultToDB, putMangleSourceDiskBacked, putMangleSourceToDB,
} from '../utils/persistence';
import type { MangleResultEntry, MangleSliceEntry, MangleSourceEntry } from '../utils/persistence';
import type { FileRecord, UserLibrary } from '../types';

const SampleBrowser = React.lazy(() =>
  import('../components/SampleBrowser').then(m => ({ default: m.SampleBrowser })),
);
const LooseFileEditor = React.lazy(() =>
  import('./EditorMode').then(m => ({ default: m.LooseFileEditor })),
);

/** The editor's commit button, when it edits a slice: the edit replaces the slice's sound. */
const SLICE_COMMIT_LABELS: CommitLabels = {
  clean: 'SAVED TO THE SLICE',
  dirty: 'REPLACE THE SLICE',
  hint: 'Replace the slice with these edits: everything that plays it (the sequencer, kits) gets the new sound',
  cleanToast: 'The slice already has these edits',
};

/** The editor's commit button, when its edits come back to the mangler as a new result. */
const MANGLER_COMMIT_LABELS: CommitLabels = {
  clean: 'SAVED TO MANGLER',
  dirty: 'SAVE AS NEW RESULT',
  hint: 'Save these edits as a new result in the mangler (the original stays as it is)',
  cleanToast: 'Already saved to the mangler',
};
import { runBatch, resultToWav, setDecodeLimits, wavWithCues, type BatchHandle, type BatchSource } from '../mangler/batch';
import { applyEnvelope, type MangleResult, type PitchChoice, type SnippetEnvelope, type SnippetInfo } from '../mangler/render';
import { withChoice } from '../mangler/pitchChoice';
import { CUE_LEVELS, snippetCues, transientCues, type CueLevel } from '../mangler/recue';
import { NOTE_NAMES } from '../mangler/pitch';
import { SnippetTable } from '../mangler/ui/SnippetTable';
import { SourcePartsModal } from '../mangler/ui/SourcePartsModal';
import type { Part } from '../mangler/parts';
import { ScrubBar } from '../mangler/ui/ScrubBar';
import { clampCrop, cropAudio, cropResult, type Crop } from '../mangler/crop';
import { readWavHeaderInfo } from '../lib/audio/wavHeader';
import { M8_MAX_CUES } from '../lib/audio/m8Wav';
import type { CommitLabels } from '../components/WaveformEditor';
import { formatDb, formatSeconds } from '../mangler/ui/format';
import { useResultAudio } from '../mangler/ui/useResultAudio';
import { recipeFromResult, resultName, usedSources, waveformPeaks, type RecipeSource } from '../mangler/recipe';
import { deriveSeed, randomSeed } from '../mangler/rng';
import {
  DEFAULT_SETTINGS, MAX_CUE_POINTS, OUTPUT_MAX_SECONDS, PRESETS, sanitizeSettings, type MangleSettings,
} from '../mangler/settings';
import { Segmented } from '../mangler/ui/Sliders';
import { ScrubNumber } from '../components/ScrubNumber';
import { SettingsPanel } from '../mangler/ui/SettingsPanel';
import { SlicePool } from '../mangler/ui/SlicePool';
import { SequencerStation } from '../mangler/ui/SequencerStation';
import { SynthStation, type SynthTake } from '../mangler/ui/SynthStation';
import { GENERATORS, defaultRanges, synthesize, type SynthKind, type SynthRanges } from '../mangler/synth';
import { useSequencePlayer } from '../mangler/ui/useSequencePlayer';
import { useUndoable } from '../mangler/ui/useUndoable';
import { useMidiFollow, useMidiLink } from '../mangler/ui/useMidiLink';
import {
  DEFAULT_PATTERNS, MASTER_MAX_DB, MASTER_MIN_DB, MAX_TRACKS, PATTERNS, withAllPatterns, masterGain, maxChain, mixSequence, newSequence, parseCueSoundId, pruneSequence, sequenceCues, sequenceFrames, sequenceHits,
  type CueSound, type PatternId, type SeqCues, type SeqHit, type Sequence,
} from '../mangler/sequence';
import { dbToGain, limit, type Stereo } from '../mangler/dsp';
import { useSlicePlayer } from '../mangler/ui/useSlicePlayer';
import { rollAll, rollInStyle, unlocked, type DiceGroup } from '../mangler/randomize';
import { renderSlice, sliceAsSnippet, slicePeaks, snippetAsSlice, type SliceSpec } from '../mangler/slices';
import type { HitClass } from '../mangler/hits';
import { DRUM_VOICES } from '../mangler/drumPresets';
import { DESKTOP_LIMITS, PHONE_LIMITS, loadPhoneMode, savePhoneMode } from '../mangler/ui/phoneMode';
import { ResultWaveform } from '../mangler/ui/ResultWaveform';
import { ManglerTour } from '../mangler/ui/ManglerTour';

const SETTINGS_KEY = 'mangler_settings';
const PLAY_MODE_KEY = 'mangler_play_mode';
const SR = 48000;

/**
 * What a click on a snippet or the waveform plays. Full: from there to the end.
 * Fades: the snippet with its crossfades in and out. Cue: only what lies
 * between two cue points, which is what the hardware's slice mode plays.
 */
type PlayMode = 'full' | 'fades' | 'cue';

type Pane = 'sources' | 'settings' | 'results';

/** What a source is, for the pool's filter. */
type SourceKind = 'files' | 'packs' | 'project' | 'synth' | 'made';
const SOURCE_KINDS: { id: SourceKind; label: string; hint: string }[] = [
  { id: 'files', label: 'Files', hint: 'Your own files' },
  { id: 'packs', label: 'Packs', hint: 'From the sample packs and online sources' },
  { id: 'project', label: 'Project', hint: "The open Studio project's files" },
  { id: 'synth', label: 'Synth', hint: 'Synth takes' },
  { id: 'made', label: 'Made here', hint: 'Results and slices put back in the pool' },
];
const STYLE_KEY = 'mangler_style';
const LOCKS_KEY = 'mangler_dice_locks';
const DICE_GROUPS: readonly DiceGroup[] = ['shape', 'tempo', 'loudness', 'envelope', 'pitch', 'file'];

/** The pool's own tags: typed filters kept, each on or off. */
interface PoolTag { text: string; on: boolean }
const POOL_TAGS_KEY = 'mangler_pool_tags';
const loadPoolTags = (): PoolTag[] => {
  try {
    const raw = JSON.parse(appStorage.getItem(POOL_TAGS_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter(t => typeof t?.text === 'string').map(t => ({ text: t.text, on: !!t.on })) : [];
  } catch {
    return [];
  }
};
const sourceKind = (s: MangleSourceEntry): SourceKind =>
  s.sourceSamplePath?.startsWith('project:') ? 'project'
    : s.origin === 'Synth' ? 'synth'
      : s.origin === 'Sample Mangler' || s.origin.startsWith('Slice of') ? 'made'
        : isLocalOrigin(s.origin) ? 'files'
          : 'packs';

/**
 * The stations in the top bar. Mangle is the sources, settings and results;
 * Slices the slice pool. The sequencer and the synth join them later.
 */
export type Station = 'mangle' | 'slices' | 'sequence' | 'synth';
const STATIONS: readonly Station[] = ['mangle', 'slices', 'sequence', 'synth'];
const SYNTH_KEY = 'mangler_synth';

/** The synth's generator and its ranges per generator, as last left. */
const loadSynth = (): { kind: SynthKind; ranges: Partial<Record<SynthKind, SynthRanges>>; count: number } => {
  try {
    const s = JSON.parse(appStorage.getItem(SYNTH_KEY) ?? 'null');
    if (s && s.kind in GENERATORS) return { kind: s.kind, ranges: s.ranges ?? {}, count: Number(s.count) || 4 };
  } catch { /* defaults */ }
  return { kind: 'kick', ranges: {}, count: 4 };
};
const SEQUENCE_KEY = 'mangler_sequence';

/** The stored sequence, if it still has the shape this version expects. */
/** A sequence from storage or a project, if it has the shape this version expects. */
const validSequence = (input: unknown): Sequence | null => {
  try {
    const s = input as Sequence | null;
    if (!s || !Array.isArray(s.tracks) || !Array.isArray(s.chain) || !s.tracks.length) return null;
    // Tracks saved with A–D only get empty steps for the patterns added since.
    const tracks = s.tracks.map(withAllPatterns);
    if (tracks.some(tr => !tr) || !s.chain.every(p => PATTERNS.includes(p))) return null;
    const used = Math.max(DEFAULT_PATTERNS, ...s.chain.map(p => PATTERNS.indexOf(p) + 1));
    return {
      ...s,
      bpm: Math.min(240, Math.max(40, Number(s.bpm) || 120)),
      swing: Math.min(0.5, Math.max(0, Number(s.swing) || 0)),
      masterDb: Math.min(MASTER_MAX_DB, Math.max(MASTER_MIN_DB, Number(s.masterDb) || 0)),
      chain: s.chain.slice(0, maxChain(s.bpm)),
      tracks: (tracks as Sequence['tracks']).slice(0, MAX_TRACKS),
      // At least the patterns the chain plays.
      patternCount: Math.min(PATTERNS.length, Math.max(used, Math.round(Number(s.patternCount)) || DEFAULT_PATTERNS)),
    };
  } catch {
    return null;
  }
};
const loadSequence = (): Sequence | null => {
  try {
    return validSequence(JSON.parse(appStorage.getItem(SEQUENCE_KEY) ?? 'null'));
  } catch {
    return null;
  }
};
const PROJECT_KEY = 'mangler_project_name';
const STATION_KEY = 'mangler_station';
const POOL_SORT_KEY = 'mangler_pool_sort';
type PoolSort = 'newest' | 'oldest' | 'name';
const POOL_SORTS: { id: PoolSort; label: string }[] = [
  { id: 'newest', label: 'Newest' }, { id: 'oldest', label: 'Oldest' }, { id: 'name', label: 'A–Z' },
];

/**
 * A column that is always shown on a wide screen, and only when picked below lg.
 * Literal class names, so Tailwind sees them.
 */
const SHOWN = { flex: 'flex', block: 'block' } as const;
const HIDDEN_BELOW_LG = { flex: 'hidden lg:flex', block: 'hidden lg:block' } as const;
const paneClass = (pane: Pane, active: Pane, display: 'flex' | 'block') =>
  (pane === active ? SHOWN : HIDDEN_BELOW_LG)[display];

/** Where the file starts in the full render's frames (non-zero once cropped). */
const offsetOf = (r: MangleResultEntry) => r.recipe.crop?.start ?? 0;

/** Where a snippet takes over: the middle of its incoming crossfade. */
const snippetCue = (s: SnippetInfo) => s.outStart + (s.xfade >> 1);

/** The snippet under a point of the file (0-1): the last one started by then. */
const snippetAt = (r: MangleResultEntry, fraction: number) => {
  const frame = fraction * r.duration * SR + offsetOf(r);
  let index = 0;
  r.recipe.snippets.forEach((s, i) => { if (snippetCue(s) <= frame) index = i; });
  return index;
};

const loadPlayMode = (): PlayMode => {
  const saved = appStorage.getItem(PLAY_MODE_KEY);
  return saved === 'full' || saved === 'fades' || saved === 'cue' ? saved : 'fades';
};
const SEED_KEY = 'mangler_seed';
/** Set once the guide has been seen, so it opens by itself only on the first visit. */
const TOUR_KEY = 'mangler_tour_seen';

const newId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2, 15);

const stripExtension = (name: string) => name.replace(/\.[^/.]+$/, '');

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

/** A typed result name made fit for a file name: no spaces, nothing a file system refuses. */
const cleanResultName = (raw: string) =>
  raw.trim().replace(/\.wav$/i, '').replace(/\s+/g, '_').replace(/[\\/:*?"<>|]/g, '').slice(0, 64);

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

/** One of the open project's files, offered to the source pool. */
export interface StudioSourceFile {
  /** FileRecord id and current version id: together they say whether it changed. */
  fileId: string;
  versionId: string;
  name: string;
  blob: Blob;
  duration: number;
  origin?: string;
  license?: string;
}

/**
 * Set when the mangler runs inside Studio, over the open project. Its sources come
 * from the project's slots and pool, and its results go back into the project, so
 * the routes that leave (Browse pool, user library, new project) are left out.
 */
export interface StudioLink {
  projectName?: string | null;
  /** Slots first, in tape order, then the rest of the pool. */
  files: StudioSourceFile[];
  /** The empty slot it was opened from, e.g. "Red 3". The next result added goes there. */
  targetLabel?: string;
  onAddToProject: (files: FileRecord[]) => void;
}

/** A pool entry's `sourceSamplePath` when it came from a project file (one version of it). */
const projectKey = (f: Pick<StudioSourceFile, 'fileId' | 'versionId'>) => `project:${f.fileId}:${f.versionId}`;

interface MangleModeProps {
  onExitToHub: () => void;
  onEnterStudio?: () => void;
  onEnterBrowse?: () => void;
  studio?: StudioLink;
  /** Open on this station (Studio's empty slot: Synth), whatever was open last. */
  initialStation?: Station;
}

/** A save waiting on the user: which results, and where to. */
type PendingSave = { route: 'library' | 'pool'; results: MangleResultEntry[] };

/**
 * Sample Mangler at `#/mangle`: random snippets from a pool of sources, joined
 * into one file of up to 42 s. No project and no folder: the pool and the results
 * live in IndexedDB until a result is saved. See docs/sample_mangler.
 */
export const MangleMode: React.FC<MangleModeProps> = ({ onExitToHub, onEnterStudio, onEnterBrowse, studio, initialStation }) => {
  const [sources, setSources] = useState<MangleSourceEntry[]>([]);
  /** The sources now, including one added in this same click (state catches up on the next render). */
  const sourcesRef = useRef(sources);
  useEffect(() => { sourcesRef.current = sources; }, [sources]);
  const [results, setResults] = useState<MangleResultEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [settings, setSettings] = useState<MangleSettings>(loadSettings);
  /** The preset the dice stay near (null: anything), and the groups they leave alone. Both remembered. */
  const [style, setStyle] = useState<string | null>(() => {
    const name = appStorage.getItem(STYLE_KEY);
    return name && PRESETS[name] ? name : null;
  });
  useEffect(() => { if (style) appStorage.setItem(STYLE_KEY, style); else appStorage.removeItem(STYLE_KEY); }, [style]);
  const [diceLocks, setDiceLocks] = useState<DiceGroup[]>(() => {
    try {
      const raw = JSON.parse(appStorage.getItem(LOCKS_KEY) ?? '[]');
      return Array.isArray(raw) ? raw.filter((g): g is DiceGroup => DICE_GROUPS.includes(g)) : [];
    } catch {
      return [];
    }
  });
  useEffect(() => { appStorage.setItem(LOCKS_KEY, JSON.stringify(diceLocks)); }, [diceLocks]);
  // Phone mode: smaller limits (see mangler/ui/phoneMode.ts). Guessed until switched.
  const [phoneMode, setPhoneMode] = useState(loadPhoneMode);
  const limits = phoneMode ? PHONE_LIMITS : DESKTOP_LIMITS;
  useEffect(() => { setDecodeLimits(limits); }, [limits]);
  const togglePhoneMode = () => setPhoneMode(on => { savePhoneMode(!on); return !on; });
  /** What a click renders: the setting, capped in phone mode. */
  const variationCount = Math.min(settings.variations, limits.variationsMax);
  const [{ seed, locked }, setSeedState] = useState(loadSeed);
  const [batch, setBatch] = useState<BatchState | null>(null);
  const [adding, setAdding] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  /** Select mode: tick results to send just those somewhere, instead of every starred one. */
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const toggleSelected = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(() => !appStorage.getItem(TOUR_KEY));
  /** Below lg, one column at a time: the bottom bar picks it. */
  const [pane, setPane] = useState<Pane>('sources');
  const [station, setStation] = useState<Station>(() => {
    if (initialStation) return initialStation;
    const stored = appStorage.getItem(STATION_KEY) as Station | null;
    return stored && STATIONS.includes(stored) ? stored : 'mangle';
  });
  // The sequence keeps an undo history of the station's edits; tempo from a clock and pruning go around it.
  const sequenceHistory = useUndoable<Sequence>(() => loadSequence() ?? newSequence(newId));
  const { value: sequence, set: setSequence, reset: resetSequence } = sequenceHistory;
  /** One pattern looping instead of the chain: how it plays, not part of the sequence (nor its undo). */
  const [loopPattern, setLoopPattern] = useState<PatternId | null>(null);
  const playedSequence = useMemo(() => (loopPattern ? { ...sequence, chain: [loopPattern] } : sequence), [sequence, loopPattern]);
  const [synth, setSynth] = useState(loadSynth);
  useEffect(() => { appStorage.setItem(SYNTH_KEY, JSON.stringify(synth)); }, [synth]);
  const [takes, setTakes] = useState<SynthTake[]>([]);
  const [synthesizing, setSynthesizing] = useState(false);
  const takeCounter = useRef<Partial<Record<SynthKind, number>>>({});
  useEffect(() => { appStorage.setItem(SEQUENCE_KEY, JSON.stringify(sequence)); }, [sequence]);
  useEffect(() => { appStorage.setItem(STATION_KEY, station); }, [station]);
  const [slices, setSlices] = useState<MangleSliceEntry[]>([]);
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
  /** A result just made elsewhere (a kit): scrolled to and lit up for a moment. */
  const [flashId, setFlashId] = useState<string | null>(null);
  useEffect(() => {
    if (!flashId) return;
    const frame = requestAnimationFrame(() =>
      document.getElementById(`result-${flashId}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
    const timer = setTimeout(() => setFlashId(null), 2500);
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); };
  }, [flashId]);
  const [playMode, setPlayMode] = useState<PlayMode>(loadPlayMode);
  const [recueing, setRecueing] = useState<string | null>(null);
  /** The source whose parts are being chosen. */
  const [partsFor, setPartsFor] = useState<string | null>(null);
  /** A result open in the hits dialog (the scissors on its card). */
  const [hitsFor, setHitsFor] = useState<MangleResultEntry | null>(null);
  /** Crop mode on one result: the kept stretch, 0–1 of the file as it is now. */
  const [cropEdit, setCropEdit] = useState<{ id: string; range: [number, number] } | null>(null);
  /** The result open in the editor, and the copy its saves go to. */
  const [editing, setEditing] = useState<MangleResultEntry | null>(null);
  /** A slice open in the editor: its sound as it plays now, as a WAV. */
  const [editingSlice, setEditingSlice] = useState<{ id: string; name: string; blob: Blob; duration: number; license?: string } | null>(null);
  const editedCopyRef = useRef<string | null>(null);
  const region = useResultAudio();
  const slicePlayer = useSlicePlayer(region.load);
  const stopSlice = slicePlayer.stop;
  useEffect(() => { stopSlice(); }, [station, stopSlice]);

  // ---------------------------------------------------------------------------
  // Sequencer
  // ---------------------------------------------------------------------------

  /**
   * What a sequencer sound id stands for: a slice of a pool source, or a cue's
   * segment of a result or a source (cue tracks). The audio it is cut from, and
   * where it came from, for licences.
   */
  const soundOf = useCallback((id: string): {
    spec: SliceSpec; ownerId: string; blob: Blob; origin: RecipeSource;
  } | null => {
    const cue = parseCueSoundId(id);
    if (cue?.kind === 'result') {
      const r = results.find(x => x.id === cue.id);
      if (!r) return null;
      const license = resultLicense(r.recipe);
      return {
        spec: { start: cue.start, end: cue.end }, ownerId: r.id, blob: r.blob,
        origin: { id: r.id, name: r.name, origin: 'Sample Mangler', license: license.text, licenseLevel: license.level },
      };
    }
    if (cue?.kind === 'source') {
      const s = sources.find(x => x.id === cue.id);
      return s ? {
        spec: { start: cue.start, end: cue.end }, ownerId: s.id, blob: s.blob,
        origin: { id: s.id, name: s.name, origin: s.origin, license: s.license, licenseLevel: s.licenseLevel },
      } : null;
    }
    const sl = slices.find(x => x.id === id);
    const s = sl && sources.find(x => x.id === sl.sourceId);
    return sl && s ? {
      spec: sl, ownerId: s.id, blob: s.blob,
      origin: { id: s.id, name: s.name, origin: s.origin, license: s.license, licenseLevel: s.licenseLevel },
    } : null;
  }, [results, sources, slices]);

  /** A sound as it is now, plus a track's shift and playback envelope: what the sequencer keys its buffers on. */
  const sequenceKey = useCallback((id: string, shift: number, env?: SnippetEnvelope) => {
    const snd = soundOf(id);
    if (!snd) return null;
    const { spec } = snd;
    return JSON.stringify([id, snd.ownerId, snd.blob.size, spec.start, spec.end, spec.reverse ?? false, (spec.shift ?? 0) + shift,
      spec.gainDb ?? 0, spec.envelope ?? null, env ?? null]);
  }, [soundOf]);

  /** The sound as the sequencer plays it: the slice (with its own envelope), shifted, then the track's envelope on top. */
  const sequenceAudio = useCallback(async (id: string, shift: number, env?: SnippetEnvelope): Promise<Stereo | null> => {
    const snd = soundOf(id);
    if (!snd) return null;
    const decoded = await region.load(snd.ownerId, snd.blob);
    const l = decoded.getChannelData(0);
    const r = decoded.numberOfChannels > 1 ? decoded.getChannelData(1) : l;
    const audio = renderSlice([l, r], decoded.sampleRate, { ...snd.spec, shift: (snd.spec.shift ?? 0) + shift || undefined });
    if (env) applyEnvelope(audio, env, decoded.sampleRate);
    return audio;
  }, [soundOf, region]);

  /** Cue points of the pool's own files (a WAV with cues), read from their headers once. */
  const [sourceCues, setSourceCues] = useState<Record<string, number[]>>({});
  useEffect(() => {
    const todo = sources.filter(s => !(s.id in sourceCues));
    if (todo.length === 0) return;
    let alive = true;
    Promise.all(todo.map(async s => {
      try { return [s.id, (await readWavHeaderInfo(s.blob)).metadata?.slicePoints ?? []] as const; } catch { return [s.id, []] as const; }
    })).then(found => { if (alive) setSourceCues(prev => ({ ...prev, ...Object.fromEntries(found) })); });
    return () => { alive = false; };
  }, [sources, sourceCues]);

  /** What a cue track can play: results (they all have cues) and pool files with cue points. */
  const cueSounds = useMemo<CueSound[]>(() => [
    ...results.filter(r => r.recipe.cuePoints.length >= 2).map(r => ({
      kind: 'result' as const, id: r.id, name: r.name, cues: r.recipe.cuePoints.map(c => c / SR), duration: r.duration,
    })),
    ...sources.filter(s => (sourceCues[s.id]?.length ?? 0) >= 2).map(s => ({
      kind: 'source' as const, id: s.id, name: s.name, cues: [...sourceCues[s.id]].sort((a, b) => a - b), duration: s.duration,
    })),
  ], [results, sources, sourceCues]);

  const midi = useMidiLink();
  const sequencer = useSequencePlayer(sequenceKey, sequenceAudio, midi.hooks);
  const follow = useMidiFollow(midi.input, midi.enabled && midi.settings.follow, {
    start: fromStart => { void sequencer.startExternal(fromStart); },
    step: sequencer.externalStep,
    stop: sequencer.stop,
    onTempo: bpm => setSequence(s => (Math.abs(s.bpm - bpm) >= 0.5 ? { ...s, bpm } : s)),
  });
  const { update: updateSequencer, stop: stopSequencer } = sequencer;
  // The player plays the chain, or the looped pattern (it keeps its place in the bar when that changes).
  useEffect(() => { updateSequencer(playedSequence); }, [playedSequence, updateSequencer, sequenceKey]);
  useEffect(() => { if (station !== 'sequence') stopSequencer(); }, [station, stopSequencer]);
  /** The list as last rendered, for async work that must not act on a stale copy. */
  const resultsRef = useRef(results);
  useEffect(() => { resultsRef.current = results; }, [results]);

  const inputRef = useRef<HTMLInputElement>(null);
  const batchRef = useRef<BatchHandle | null>(null);

  const { toasts, showToast, removeToast } = useToasts();
  const player = useAudioPlayer();

  useEscapeLayer(!pickerOpen && !tourOpen, () => {
    onExitToHub();
    return true;
  });
  useEscapeLayer(pickerOpen, () => {
    setPickerOpen(false);
    return true;
  });

  const closeTour = useCallback(() => {
    appStorage.setItem(TOUR_KEY, '1');
    setTourOpen(false);
  }, []);
  /** The tour's target in view: the Mangle station, and on a phone its pane. */
  const tourStep = useCallback((target?: string) => {
    if (target === 'stations') return;
    setStation('mangle');
    if (target === 'sources' || target === 'settings') setPane(target);
    else if (target) setPane('results');
  }, []);

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
    Promise.all([loadMangleSourcesFromDB(), loadMangleResultsFromDB(), loadMangleSlicesFromDB()]).then(([s, r, sl]) => {
      if (!alive) return;
      setSources([...s].sort((a, b) => a.addedAt - b.addedAt));
      setResults(sortResults(r));
      // Slices whose source has left the pool can never play again (older versions
      // left them behind when a source was removed): they go, and so does what the
      // sequencer still holds of them or of results and files that are gone.
      const sourceIds = new Set(s.map(x => x.id));
      const orphans = sl.filter(x => !sourceIds.has(x.sourceId)).map(x => x.id);
      const kept = sl.filter(x => sourceIds.has(x.sourceId));
      if (orphans.length) {
        deleteMangleSlicesFromDB(orphans);
        showToast(`${orphans.length} slice${orphans.length === 1 ? '' : 's'} whose source had left the pool ${orphans.length === 1 ? 'was' : 'were'} removed`, 'info');
      }
      setSlices([...kept].sort((a, b) => a.addedAt - b.addedAt));
      const sliceIds = new Set(kept.map(x => x.id));
      const owners = new Set([...sourceIds, ...r.map(x => x.id)]);
      setSequence(seq => {
        const goneSlices = new Set<string>();
        const goneOwners = new Set<string>();
        for (const track of seq.tracks) {
          if (track.sliceId && !sliceIds.has(track.sliceId)) goneSlices.add(track.sliceId);
          if (track.cue && !owners.has(track.cue.id)) goneOwners.add(track.cue.id);
          for (const steps of Object.values(track.patterns)) {
            for (const st of steps) if (st.sliceId && !sliceIds.has(st.sliceId)) goneSlices.add(st.sliceId);
          }
        }
        return goneSlices.size || goneOwners.size ? pruneSequence(seq, goneSlices, goneOwners) : seq;
      });
      setLoaded(true);
    });
    return () => { alive = false; };
  }, [showToast, setSequence]);

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
  useEffect(() => { appStorage.setItem(PLAY_MODE_KEY, playMode); }, [playMode]);
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
      // A download is held in memory; the stored copy lives on disk.
      entry.blob = await putMangleSourceDiskBacked(entry);
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

  /*
   * The pool's filter: what the list shows, and what its checkbox, bin, dice and
   * Generate act on. Kinds and tags are toggles: a source shows when it is of a
   * kind that is on (none on: any kind) and matches a tag that is on (none on:
   * any), and the text being typed. Enter makes the text a tag; tags are kept.
   */
  const [poolQuery, setPoolQuery] = useState('');
  const [poolKindsOn, setPoolKindsOn] = useState<ReadonlySet<SourceKind>>(new Set());
  const [poolTags, setPoolTags] = useState<PoolTag[]>(loadPoolTags);
  useEffect(() => { appStorage.setItem(POOL_TAGS_KEY, JSON.stringify(poolTags)); }, [poolTags]);
  const shownSources = useMemo(() => {
    const q = poolQuery.trim().toLowerCase();
    const tagsOn = poolTags.filter(t => t.on).map(t => t.text.toLowerCase());
    const matches = (s: MangleSourceEntry, text: string) => s.name.toLowerCase().includes(text) || s.origin.toLowerCase().includes(text);
    return sources.filter(s => (poolKindsOn.size === 0 || poolKindsOn.has(sourceKind(s)))
      && (tagsOn.length === 0 || tagsOn.some(text => matches(s, text)))
      && (!q || matches(s, q)));
  }, [sources, poolQuery, poolKindsOn, poolTags]);
  /**
   * How the list is sorted: newest first by default. Only the list: Generate
   * takes the sources in the order they were added, so a seed stays a seed.
   */
  const [poolSort, setPoolSort] = useState<PoolSort>(() => {
    const stored = appStorage.getItem(POOL_SORT_KEY) as PoolSort | null;
    return stored && POOL_SORTS.some(o => o.id === stored) ? stored : 'newest';
  });
  useEffect(() => { appStorage.setItem(POOL_SORT_KEY, poolSort); }, [poolSort]);
  const listedSources = useMemo(() => {
    if (poolSort === 'oldest') return shownSources;
    if (poolSort === 'newest') return [...shownSources].reverse();
    return [...shownSources].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  }, [shownSources, poolSort]);
  const addPoolTag = () => {
    const text = poolQuery.trim();
    if (!text) return;
    setPoolTags(prev => [...prev.filter(t => t.text.toLowerCase() !== text.toLowerCase()), { text, on: true }]);
    setPoolQuery('');
  };
  const poolKinds = useMemo(() => SOURCE_KINDS.filter(k => sources.some(s => sourceKind(s) === k.id)), [sources]);

  /** Switch these sources on or off (the rest stay as they are). */
  const setSourcesEnabled = useCallback((ids: Set<string>, enabled: (id: string) => boolean) => {
    setSources(prev => prev.map(s => {
      if (!ids.has(s.id) || s.enabled === enabled(s.id)) return s;
      const next = { ...s, enabled: enabled(s.id) };
      putMangleSourceToDB(next).catch(e => console.error(e));
      return next;
    }));
  }, []);
  const setAllSources = useCallback((enabled: boolean) => {
    setSourcesEnabled(new Set(shownSources.map(s => s.id)), () => enabled);
  }, [shownSources, setSourcesEnabled]);
  /** Dice: a random few of the shown sources on, the others shown off. */
  const rollSources = useCallback(() => {
    const ids = shownSources.map(s => s.id);
    if (ids.length < 2) return;
    const want = 1 + Math.floor(Math.random() * Math.min(ids.length - 1, Math.max(2, Math.ceil(ids.length / 2))));
    const on = new Set([...ids].sort(() => Math.random() - 0.5).slice(0, want));
    setSourcesEnabled(new Set(ids), id => on.has(id));
    showToast(`${on.size} of ${ids.length} sources on`, 'info');
  }, [shownSources, setSourcesEnabled, showToast]);

  /**
   * What hangs on removed sources goes with them: the slices cut from them, and
   * the sequencer's uses of both (a track's slice, a step's lock, a cue track on
   * one of the files). Results made from them stay: they are audio of their own.
   */
  const forgetSources = useCallback((ids: ReadonlySet<string>) => {
    const goneSlices = slices.filter(s => ids.has(s.sourceId)).map(s => s.id);
    if (goneSlices.length) {
      setSlices(prev => prev.filter(s => !ids.has(s.sourceId)));
      deleteMangleSlicesFromDB(goneSlices);
    }
    setSequence(seq => pruneSequence(seq, new Set(goneSlices), ids));
    return goneSlices.length;
  }, [slices, setSequence]);

  const removeSource = useCallback((id: string) => {
    if (player.activeFileId === id) player.stop();
    setSources(prev => prev.filter(s => s.id !== id));
    deleteMangleSourcesFromDB([id]);
    const slicesGone = forgetSources(new Set([id]));
    if (slicesGone) showToast(`${slicesGone} slice${slicesGone === 1 ? '' : 's'} cut from it went too`, 'info');
  }, [player, forgetSources, showToast]);

  /** The header's delete: every switched-on source, so select-all then delete clears the pool. */
  const [confirmRemoveEnabled, setConfirmRemoveEnabled] = useState(false);
  const removeEnabledSources = useCallback(() => {
    const ids = new Set(shownSources.filter(s => s.enabled).map(s => s.id));
    if (ids.size === 0) return;
    if (player.activeFileId && ids.has(player.activeFileId)) player.stop();
    setSources(prev => prev.filter(s => !ids.has(s.id)));
    deleteMangleSourcesFromDB([...ids]);
    const slicesGone = forgetSources(ids);
    showToast(`${ids.size} source${ids.size === 1 ? '' : 's'} removed from the pool${slicesGone ? `, and ${slicesGone} slice${slicesGone === 1 ? '' : 's'} cut from them` : ''}`, 'success');
  }, [shownSources, player, forgetSources, showToast]);

  /** What the next batch uses: switched on, and shown by the pool's filter. */
  const enabledSources = useMemo(() => shownSources.filter(s => s.enabled), [shownSources]);
  const hiddenEnabled = useMemo(() => sources.filter(s => s.enabled).length - enabledSources.length, [sources, enabledSources]);
  const enabledSeconds = useMemo(() => enabledSources.reduce((sum, s) => sum + s.duration, 0), [enabledSources]);

  /**
   * Inside Studio: the project's files into the pool, switched on, and every other
   * source switched off (not removed, so its parts and the results made from it
   * survive). A file edited in Studio since it was added comes in as a new source,
   * and its old version is one of the "others".
   */
  const studioFiles = studio?.files;
  const studioProjectName = studio?.projectName;
  const fillFromProject = useCallback(async () => {
    if (!studioFiles) return;
    if (studioFiles.length === 0) {
      showToast('The project has no files yet. Add sources with Packs or Files.', 'info');
      return;
    }
    const keys = new Set(studioFiles.map(projectKey));
    const have = new Set(sources.map(s => s.sourceSamplePath));
    const now = Date.now();
    const added: MangleSourceEntry[] = studioFiles
      .filter(f => !have.has(projectKey(f)))
      .map((f, i) => ({
        id: newId(),
        name: f.name,
        origin: f.origin || (studioProjectName ? `Project ${studioProjectName}` : 'Project'),
        license: f.license,
        sourceSamplePath: projectKey(f),
        blob: f.blob,
        duration: f.duration,
        enabled: true,
        addedAt: now + i,
      }));
    let switchedOff = 0;
    const changed: MangleSourceEntry[] = [];
    const kept = sources.map(s => {
      const enabled = !!s.sourceSamplePath && keys.has(s.sourceSamplePath);
      if (s.enabled === enabled) return s;
      if (!enabled) switchedOff++;
      const next = { ...s, enabled };
      changed.push(next);
      return next;
    });
    setSources([...kept, ...added]);
    try {
      await Promise.all([...changed, ...added].map(putMangleSourceToDB));
    } catch (e) {
      console.error(e);
      showToast('Could not store the project files (storage full?). They are in the pool until a reload.', 'error');
    }
    const parts = [
      added.length ? `${added.length} added` : `all ${studioFiles.length} already in the pool`,
      switchedOff ? `${switchedOff} other source${switchedOff === 1 ? '' : 's'} switched off` : '',
    ].filter(Boolean);
    showToast(`From the project: ${parts.join(', ')}`, 'success');
  }, [studioFiles, studioProjectName, sources, showToast]);

  // Opening from Studio fills the pool once, as soon as the stored pool has loaded.
  const autoFilled = useRef(false);
  useEffect(() => {
    if (!loaded || !studioFiles || autoFilled.current) return;
    autoFilled.current = true;
    fillFromProject();
  }, [loaded, studioFiles, fillFromProject]);

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

  /**
   * Stores a result and swaps its audio for the stored copy, which the browser keeps
   * on disk instead of in memory. The entry is not in the list yet when this runs,
   * so changing it here is safe.
   */
  const storeEntry = useCallback(async (entry: MangleResultEntry) => {
    try {
      entry.blob = await putMangleResultDiskBacked(entry);
    } catch (e) {
      console.error(e);
      showToast('Could not store a result (storage full?). It is shown but will not survive a reload.', 'error');
    }
  }, [showToast]);

  /** A new name for a seed, not taken by any result in the list. */
  const freshName = (seedValue: number, taken: Set<string>, s?: MangleSettings) => {
    const base = resultName(seedValue, new Date(), s?.grid ? s : undefined);
    let name = base;
    for (let n = 2; taken.has(name); n++) name = `${base}-${n}`;
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
      setSequence(seq => pruneSequence(seq, new Set(), new Set(unkept)));
    }

    const count = variationCount;
    // The first variation uses the seed on screen, so typing one in reproduces it.
    const seeds = Array.from({ length: count }, (_, i) => (i === 0 ? seed : deriveSeed(seed, 0x5eed, i)));
    const batchId = Date.now();
    const batchSettings = settings;
    const recipeSources: RecipeSource[] = enabledSources.map(s => ({
      id: s.id, name: s.name, origin: s.origin, license: s.license, licenseLevel: s.licenseLevel,
    }));
    const taken = new Set(results.filter(r => r.kept).map(r => r.name));

    startJob({
      label: `Rendering ${count} variation${count === 1 ? '' : 's'}`,
      sources: enabledSources.map(s => ({ id: s.id, blob: s.blob, regions: s.regions })),
      settings: batchSettings,
      seeds,
      onResult: async (result) => {
        const entry = makeEntry(result, batchSettings, recipeSources, {
          name: freshName(result.seed, taken, batchSettings), kept: false, batchId,
        });
        await storeEntry(entry);
        setResults(prev => sortResults([...prev, entry]));
      },
      onDone: () => { if (!locked) setSeedState({ seed: randomSeed(), locked: false }); },
    });
  }, [enabledSources, results, settings, variationCount, seed, locked, player, region, showToast, startJob, makeEntry, storeEntry, setSequence]);

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
      const entry = sourcesRef.current.find(s => s.id === rs.id);
      return { id: rs.id, blob: entry?.blob ?? null, enabled: entry?.enabled ?? false, regions: entry?.regions };
    }), [sources]); // eslint-disable-line react-hooks/exhaustive-deps -- a new function per pool change, for its users' deps

  /**
   * Settings of an old recipe. Results from before sinc was the default keep the
   * linear resampler, and those from before the flux detector keep the old one.
   */
  const recipeSettings = (r: MangleResultEntry) => sanitizeSettings({
    ...r.recipe.settings,
    resampler: r.recipe.settings.resampler ?? 'linear',
    detector: r.recipe.settings.detector ?? 'energy',
  });

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
    options: { locked?: number[]; crop?: Crop | null } = {},
  ) => {
    if (batchRef.current || r.edited) return;
    const locked = 'locked' in options ? options.locked : r.locked;
    // undefined keeps the crop, null drops it.
    const crop = options.crop === undefined ? r.recipe.crop : options.crop ?? undefined;
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
      onResult: async (full) => {
        // The same stretch as before, if it was cropped (clamped to a shorter render).
        const kept = crop ? clampCrop(crop, full.left.length) : null;
        const result = kept ? cropResult(full, kept) : full;
        let entry = makeEntry(result, editSettings, r.recipe.sources, {
          id: r.id, name: r.name, kept: r.kept, batchId: r.batchId, createdAt: r.createdAt, locked,
        });
        if (kept) entry = { ...entry, recipe: { ...entry.recipe, crop: kept } };
        // Cues found at the hits are found again on the edited audio.
        const level = r.recipe.cueSource;
        if (level && level !== 'snippets') {
          const cuePoints = transientCues([result.left, result.right], SR, level);
          entry = {
            ...entry,
            blob: wavWithCues(result.left, result.right, cuePoints, r.name),
            recipe: { ...entry.recipe, cuePoints, cuesCapped: false, cueSource: level },
          };
        }
        await storeEntry(entry);
        region.forget(r.id);
        setUndo(prev => ({ ...prev, [r.id]: r }));
        setResults(prev => prev.map(x => (x.id === r.id ? entry : x)));
      },
    });
  }, [missingFor, player, region, showToast, sourcesFor, startJob, makeEntry, storeEntry]);

  /**
   * A kit: sounds one after another, each as it is, with a cue point at each, so
   * the slice mode plays one sound per slice. From a source's hits or from
   * slices in the pool. Made like any result (all snippets fixed), so the snippet
   * list can reorder, drop or repitch them afterwards.
   */
  const makeKit = useCallback((items: { sourceId: string; spec: SliceSpec }[], label: string) => {
    if (batchRef.current || items.length === 0) return;
    const usable = items.filter(it => sourcesRef.current.some(s => s.id === it.sourceId));
    if (usable.length < items.length) {
      showToast(`${items.length - usable.length} left out: their source has left the pool`, 'warning');
    }
    const list = usable.slice(0, MAX_CUE_POINTS);
    if (usable.length > list.length) showToast(`Only the first ${MAX_CUE_POINTS} fit`, 'warning');
    if (list.length === 0) return;
    const ids = [...new Set(list.map(it => it.sourceId))];
    const recipeSources: RecipeSource[] = ids.map(id => {
      const s = sourcesRef.current.find(x => x.id === id)!;
      return { id, name: s.name, origin: s.origin, license: s.license, licenseLevel: s.licenseLevel };
    });
    const fixed: SnippetInfo[] = list.map(it => sliceAsSnippet(it.spec, ids.indexOf(it.sourceId), SR));
    const kitSettings = sanitizeSettings({
      ...DEFAULT_SETTINGS, fillMode: 'count', snippetCount: fixed.length,
      xfadeMinMs: 0, xfadeMaxMs: 0, hardCuts: false, loop: false, repitch: 'off', detuneSt: 0,
      restProbability: 0, softProbability: 0, envelope: false, cuePoints: true, variations: 1,
    });
    const base = `kit_${label.replace(/[^\w-]+/g, '_').slice(0, 40)}`;
    const taken = new Set(results.map(r => r.name));
    let name = base;
    for (let n = 2; taken.has(name); n++) name = `${base}-${n}`;
    setPane('results');
    setStation('mangle');
    startJob({
      label: `Making a kit of ${fixed.length} sound${fixed.length === 1 ? '' : 's'}`,
      sources: sourcesFor(recipeSources),
      settings: kitSettings,
      seeds: [randomSeed()],
      fixed,
      onResult: async (result) => {
        // Kept: made on purpose, so the next batch doesn't clear it.
        const entry = makeEntry(result, kitSettings, recipeSources, { name, kept: true, batchId: Date.now() });
        await storeEntry(entry);
        setResults(prev => sortResults([...prev, entry]));
        setFlashId(entry.id);
        showToast(`${name} is ready in Results: save it, edit it, or use it as a source`, 'success');
      },
    });
  }, [results, showToast, sourcesFor, startJob, makeEntry, storeEntry]);

  // ---------------------------------------------------------------------------
  // Slice pool
  // ---------------------------------------------------------------------------

  /** Into the pool; the entries as stored (none when storing failed). */
  const addSlices = useCallback(async (items: Omit<MangleSliceEntry, 'id' | 'addedAt'>[]): Promise<MangleSliceEntry[]> => {
    if (items.length === 0) return [];
    const now = Date.now();
    const entries: MangleSliceEntry[] = items.map((item, i) => ({ ...item, id: newId(), addedAt: now + i }));
    try {
      await putMangleSlicesToDB(entries);
    } catch (e) {
      console.error(e);
      showToast('Could not store the slices (storage full?)', 'error');
      return [];
    }
    setSlices(prev => [...prev, ...entries]);
    showToast(`${entries.length} slice${entries.length === 1 ? '' : 's'} added to the slice pool`, 'success');
    return entries;
  }, [showToast]);

  const deleteSlices = useCallback((ids: string[]) => {
    if (slicePlayer.playingId && ids.includes(slicePlayer.playingId)) slicePlayer.stop();
    const gone = new Set(ids);
    setSlices(prev => prev.filter(s => !gone.has(s.id)));
    deleteMangleSlicesFromDB(ids);
    // A sound saved from the editor for a deleted slice goes too, unless another slice plays it.
    const kept = slices.filter(s => !gone.has(s.id));
    const orphans = sources.filter(s => s.forSlice && gone.has(s.forSlice) && !kept.some(k => k.sourceId === s.id)).map(s => s.id);
    if (orphans.length) {
      const drop = new Set(orphans);
      setSources(prev => prev.filter(s => !drop.has(s.id)));
      sourcesRef.current = sourcesRef.current.filter(s => !drop.has(s.id));
      deleteMangleSourcesFromDB(orphans);
    }
  }, [slicePlayer, slices, sources]);

  const playSlice = useCallback((slice: MangleSliceEntry) => {
    const source = sources.find(s => s.id === slice.sourceId);
    if (!source) return;
    player.stop();
    region.stop();
    slicePlayer.play(slice.id, source.id, source.blob, slice)
      .catch(e => { console.error(e); showToast('Could not play this slice', 'error'); });
  }, [sources, player, region, slicePlayer, showToast]);

  /** Snippets of a result into the pool, as they sound there; rests are skipped. */
  const snippetsToSlices = useCallback(async (r: MangleResultEntry, indices: number[]) => {
    const buffer = await region.load(r.id, r.blob).catch(() => null);
    const offset = offsetOf(r);
    const items: Omit<MangleSliceEntry, 'id' | 'addedAt'>[] = [];
    for (const i of [...indices].sort((a, b) => a - b)) {
      const sn = r.recipe.snippets[i];
      const spec = sn ? snippetAsSlice(sn, SR) : null;
      const rs = sn ? r.recipe.sources[sn.source] : undefined;
      if (!sn || !spec || !rs) continue;
      let peaks: number[] = [];
      if (buffer) {
        const l = buffer.getChannelData(0);
        const rr = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : l;
        const a = Math.max(0, sn.outStart - offset), b = Math.min(l.length, a + sn.length);
        if (b > a) peaks = slicePeaks([l.subarray(a, b), rr.subarray(a, b)]);
      }
      items.push({ ...spec, name: `${r.name} #${i + 1}`, sourceId: rs.id, sourceName: rs.name, origin: rs.origin, license: rs.license, peaks });
    }
    if (items.length === 0) {
      showToast('Rests have no sound to keep', 'info');
      return;
    }
    await addSlices(items);
  }, [region, addSlices, showToast]);

  const availableSources = useMemo(() => new Set(sources.map(s => s.id)), [sources]);

  /** Audio made here back into the source pool, switched on, to mangle again. */
  const addBlobSource = useCallback(async (
    blob: Blob, name: string, origin: string, license: string | undefined, licenseLevel: LicenseLevel,
    extra: Partial<MangleSourceEntry> = {},
  ) => {
    const entry: MangleSourceEntry = {
      id: newId(), name, origin, license, licenseLevel, blob, duration: await probeDuration(blob), enabled: true, addedAt: Date.now(),
      ...extra,
    };
    entry.blob = await putMangleSourceDiskBacked(entry);
    sourcesRef.current = [...sourcesRef.current, entry];
    setSources(prev => [...prev, entry]);
    return entry;
  }, []);

  /**
   * A result's place in the pool, for slices and kits cut from it: the one it has,
   * or a new one, switched off so the next batch stays as it was.
   */
  const sourceOfResult = useCallback(async (r: MangleResultEntry) => {
    const have = sourcesRef.current.find(s => s.fromResult === r.id);
    if (have) return have;
    const license = resultLicense(r.recipe);
    return addBlobSource(r.blob, r.name, 'Sample Mangler', license.text, license.level, { fromResult: r.id, enabled: false });
  }, [addBlobSource]);

  /** Hits from the dialog into the slice pool, cut from `source`. */
  const hitsToSlices = useCallback((source: MangleSourceEntry, items: { spec: SliceSpec; cls: HitClass; peaks: number[] }[]) => {
    const have = slices.filter(s => s.sourceId === source.id).length;
    addSlices(items.map((it, i) => ({
      ...it.spec, name: `${source.name} ${have + i + 1}`, sourceId: source.id, sourceName: source.name,
      origin: source.origin, license: source.license, cls: it.cls, peaks: it.peaks,
    })));
  }, [slices, addSlices]);

  const resultToSource = useCallback(async (r: MangleResultEntry) => {
    const license = resultLicense(r.recipe);
    if (license.level === 'no-derivatives') return;
    try {
      await addBlobSource(r.blob, r.name, 'Sample Mangler', license.text, license.level, { fromResult: r.id });
      showToast(`${r.name} is in the source pool`, 'success');
    } catch (e) {
      console.error(e);
      showToast(`Could not add ${r.name} as a source`, 'error');
    }
  }, [addBlobSource, showToast]);

  /** Each slice rendered (shift, direction, gain, envelope) as its own short file. */
  const slicesToSources = useCallback(async (list: MangleSliceEntry[]) => {
    let added = 0;
    for (const s of list) {
      const source = sources.find(x => x.id === s.sourceId);
      if (!source) continue;
      try {
        const decoded = await region.load(source.id, source.blob);
        const l = decoded.getChannelData(0);
        const r = decoded.numberOfChannels > 1 ? decoded.getChannelData(1) : l;
        const [a, b] = renderSlice([l, r], decoded.sampleRate, s);
        await addBlobSource(wavWithCues(a, b, [], s.name), s.name, `Slice of ${source.name}`, source.license, sourceLicense(source).level);
        added++;
      } catch (e) {
        console.error('Mangler: could not add a slice as a source', e);
      }
    }
    const missed = list.length - added;
    showToast(`${added} slice${added === 1 ? '' : 's'} added to the source pool${missed ? ` (${missed} left out: source gone)` : ''}`,
      added ? 'success' : 'error');
  }, [sources, region, addBlobSource, showToast]);

  /** A change to one slice; its outline is drawn again from the new sound. */
  const updateSlice = useCallback(async (id: string, patch: Partial<SliceSpec> & { name?: string }) => {
    const current = slices.find(s => s.id === id);
    if (!current) return;
    let next: MangleSliceEntry = { ...current, ...patch };
    const source = sources.find(x => x.id === next.sourceId);
    if (source && Object.keys(patch).some(k => k !== 'name')) {
      try {
        const decoded = await region.load(source.id, source.blob);
        const l = decoded.getChannelData(0);
        const r = decoded.numberOfChannels > 1 ? decoded.getChannelData(1) : l;
        next = { ...next, peaks: slicePeaks(renderSlice([l, r], decoded.sampleRate, next)) };
      } catch { /* keep the old outline */ }
    }
    setSlices(prev => prev.map(s => (s.id === id ? next : s)));
    putMangleSlicesToDB([next]).catch(e => console.error(e));
  }, [slices, sources, region]);

  /** The whole chain as a result: mixed, limited, with cues. Listed but not re-rollable. */
  const renderSequence = useCallback(async (seq: Sequence, cueMode: SeqCues, fold: boolean) => {
    // Steps for a Spotykach deck without a slice have no sound of their own here.
    const hits = sequenceHits(seq, SR).filter((h): h is SeqHit & { sliceId: string } => !!h.sliceId);
    if (hits.length === 0) {
      showToast('Nothing to render: switch on some steps on tracks with a slice', 'info');
      return;
    }
    try {
      const audio = new Map<string, Stereo | null>();
      for (const h of hits) {
        const key = sequenceKey(h.sliceId, h.shift, h.env);
        if (key && !audio.has(key)) audio.set(key, await sequenceAudio(h.sliceId, h.shift, h.env));
      }
      const total = sequenceFrames(seq, SR);
      const mix = mixSequence(hits, h => (h.sliceId ? audio.get(sequenceKey(h.sliceId, h.shift, h.env) ?? '') ?? null : null), total, fold);
      // The main volume, then the limiter.
      if (seq.masterDb) { const g = masterGain(seq); for (const ch of mix) for (let i = 0; i < ch.length; i++) ch[i] *= g; }
      const reduction = limit(mix, dbToGain(-1), Math.round(0.005 * SR));
      const allCues = sequenceCues(seq, hits, cueMode, SR);
      const cuePoints = allCues.slice(0, MAX_CUE_POINTS);
      // Each hit as a snippet: the list shows them, licenses follow them, and they can go back to the slice pool.
      // Where every hit came from (a pool source, or a result for a cue track), so licences follow them.
      const recipeSources: RecipeSource[] = [];
      const snippets: SnippetInfo[] = hits.flatMap(h => {
        const snd = soundOf(h.sliceId);
        const a = audio.get(sequenceKey(h.sliceId, h.shift, h.env) ?? '');
        if (!snd || !a) return [];
        let index = recipeSources.findIndex(rs => rs.id === snd.origin.id);
        if (index < 0) index = recipeSources.push(snd.origin) - 1;
        return [{
          // The track's envelope stands in for the slice's when it has one (the list shows one envelope per snippet).
          ...sliceAsSnippet({ ...snd.spec, shift: (snd.spec.shift ?? 0) + h.shift || undefined, envelope: h.env ?? snd.spec.envelope }, index, SR),
          outStart: h.at, length: a[0].length, gainDb: (snd.spec.gainDb ?? 0) + 20 * Math.log10(Math.max(1e-6, h.gain)),
        }];
      });
      const taken = new Set(results.map(r => r.name));
      const base = `seq_${Math.round(seq.bpm * 10) / 10}bpm_${seq.chain.length}bars_${seq.chain.join('')}`;
      let name = base;
      for (let n = 2; taken.has(name); n++) name = `${base}-${n}`;
      const entry: MangleResultEntry = {
        id: newId(),
        name,
        blob: wavWithCues(mix[0], mix[1], cuePoints, name),
        duration: total / SR,
        recipe: {
          seed: 0,
          settings: sanitizeSettings({ ...DEFAULT_SETTINGS, grid: true, bpm: seq.bpm, division: '1/16', bars: seq.chain.length }),
          sources: recipeSources,
          snippets,
          cuePoints,
          cuesCapped: allCues.length > cuePoints.length,
          peakReductionDb: reduction,
        },
        peaks: waveformPeaks(mix[0], mix[1]),
        kept: true,
        batchId: Date.now(),
        createdAt: Date.now(),
        edited: true,
        kind: 'sequence',
      };
      await storeEntry(entry);
      setResults(prev => sortResults([...prev, entry]));
      sequencer.stop();
      setStation('mangle');
      setPane('results');
      setFlashId(entry.id);
      showToast(`${name} is ready in Results`, 'success');
    } catch (e) {
      console.error(e);
      showToast('Could not render the sequence', 'error');
    }
  }, [results, soundOf, sequenceKey, sequenceAudio, storeEntry, sequencer, showToast]);

  /** A sequencer sound (a slice, or a cue's segment) at a shift, as the sequencer plays it. */
  const auditionSound = useCallback(async (id: string, shift: number, env?: SnippetEnvelope) => {
    player.stop();
    region.stop();
    const audio = await sequenceAudio(id, shift, env).catch(() => null);
    if (audio) await slicePlayer.playAudio(id, audio, SR);
  }, [player, region, sequenceAudio, slicePlayer]);

  const lockedFixed = (r: MangleResultEntry) =>
    r.recipe.snippets.map((s, i) => (r.locked?.includes(i) ? s : null));

  /** "Same seed": the sliders as they are now, locked snippets kept. */
  const rerender = useCallback((r: MangleResultEntry) => {
    editResult(r, lockedFixed(r), settings, 'Re-rendering with the current settings');
  }, [editResult, settings]);

  /** Puts the snippets in a new order (old indices); locks follow their snippets. */
  const reorder = useCallback((r: MangleResultEntry, order: number[], label: string) => {
    const fixed = order.map(i => r.recipe.snippets[i]);
    const wasLocked = new Set(r.locked ?? []);
    const locked = order.map((old, now) => (wasLocked.has(old) ? now : -1)).filter(i => i >= 0);
    editResult(r, fixed, recipeSettings(r), label, { locked });
  }, [editResult]);

  /**
   * By length, the rest move up and the end is refilled; by count, the file
   * simply gets shorter (one snippet fewer is the new count).
   */
  const deleteSnippets = useCallback((r: MangleResultEntry, indices: number[]) => {
    const gone = new Set(indices);
    const order = r.recipe.snippets.map((_, i) => i).filter(i => !gone.has(i));
    if (order.length === 0) return;
    const label = indices.length === 1 ? `Removing snippet ${indices[0] + 1}` : `Removing ${indices.length} snippets`;
    const base = recipeSettings(r);
    if (base.fillMode !== 'count') {
      reorder(r, order, label);
      return;
    }
    const fixed = order.map(i => r.recipe.snippets[i]);
    const wasLocked = new Set(r.locked ?? []);
    const locked = order.map((old, now) => (wasLocked.has(old) ? now : -1)).filter(i => i >= 0);
    editResult(r, fixed, { ...base, snippetCount: order.length }, label, { locked });
  }, [reorder, editResult]);

  /** Sets the pitch of the given snippets: own, the scale, a note, or a shift. */
  const setPitch = useCallback((r: MangleResultEntry, indices: number[], choice: PitchChoice | undefined) => {
    const targets = new Set(indices);
    const editSettings = recipeSettings(r);
    const fixed = r.recipe.snippets.map((s, i) => (targets.has(i) ? withChoice(s, choice, editSettings) : s));
    const label = !choice ? 'Back to the original pitch'
      : choice.kind === 'scale' ? 'Moving to the scale'
        : choice.kind === 'note' ? `Moving to ${NOTE_NAMES[choice.pc]}` : `Shifting ${choice.st > 0 ? '+' : ''}${choice.st} st`;
    editResult(r, fixed, editSettings, indices.length > 1 ? `${label} (${indices.length} snippets)` : label);
  }, [editResult]);

  /** Merges snippets with the one before each (no cue point between), or splits them again. */
  const joinSnippets = useCallback((r: MangleResultEntry, indices: number[], joined: boolean) => {
    const targets = new Set(indices.filter(i => i > 0));
    if (targets.size === 0) return;
    const fixed = r.recipe.snippets.map((s, i) => {
      if (!targets.has(i)) return s;
      const rest = { ...s };
      delete rest.joined;
      return joined ? { ...rest, joined: true } : rest;
    });
    const n = targets.size + 1;
    editResult(r, fixed, recipeSettings(r), joined ? `Merging ${n} snippets into one slice` : `Splitting ${n} snippets`);
  }, [editResult]);

  /**
   * Moves the snippets in `indices` to the row they were dropped on, together and
   * in their own order: after that row when dragged down, before it when up.
   */
  const moveSnippets = useCallback((r: MangleResultEntry, indices: number[], to: number) => {
    const moving = [...new Set(indices)].sort((a, b) => a - b);
    const set = new Set(moving);
    const rest = r.recipe.snippets.map((_, i) => i).filter(i => !set.has(i));
    const down = to > moving[0];
    const at = rest.filter(i => (down ? i <= to : i < to)).length;
    const order = [...rest.slice(0, at), ...moving, ...rest.slice(at)];
    if (order.every((old, now) => old === now)) return;
    reorder(r, order, moving.length === 1
      ? `Moving snippet ${moving[0] + 1}`
      : `Moving ${moving.length} snippets together`);
  }, [reorder]);

  const lockSnippets = useCallback((r: MangleResultEntry, indices: number[], lock: boolean) => {
    const current = new Set(r.locked ?? []);
    for (const i of indices) if (lock) current.add(i); else current.delete(i);
    const next = { ...r, locked: current.size ? [...current].sort((a, b) => a - b) : undefined };
    setResults(prev => prev.map(x => (x.id === r.id ? next : x)));
    putMangleResultToDB(next).catch(e => console.error(e));
  }, []);

  /**
   * Keeps only `range` (0–1 of the file as it is now). Cut from the audio there
   * is, so no source is needed; the recipe remembers it against the full render.
   */
  const applyCrop = useCallback(async (r: MangleResultEntry, range: [number, number]) => {
    if (batchRef.current) return;
    try {
      const buffer = await region.load(r.id, r.blob);
      const left = buffer.getChannelData(0);
      const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
      const local = clampCrop({ start: range[0] * left.length, end: range[1] * left.length }, left.length);
      if (!local || (local.start === 0 && local.end === left.length)) { setCropEdit(null); return; }
      const base = r.recipe.crop?.start ?? 0;
      const cropped = cropAudio([left, right], r.recipe.cuePoints, local, SR);
      const level = r.recipe.cueSource;
      const cuePoints = level && level !== 'snippets'
        ? transientCues(cropped.channels, SR, level)
        : cropped.cuePoints;
      const entry: MangleResultEntry = {
        ...r,
        blob: wavWithCues(cropped.channels[0], cropped.channels[1], cuePoints, r.name),
        duration: cropped.channels[0].length / SR,
        peaks: waveformPeaks(cropped.channels[0], cropped.channels[1]),
        recipe: { ...r.recipe, cuePoints, crop: { start: base + local.start, end: base + local.end } },
      };
      region.stop();
      region.forget(r.id);
      await storeEntry(entry);
      setUndo(prev => ({ ...prev, [r.id]: r }));
      setResults(prev => prev.map(x => (x.id === r.id ? entry : x)));
      setCropEdit(null);
      showToast(`Cropped to ${formatSeconds(entry.duration)}`, 'success');
    } catch (e) {
      console.error(e);
      showToast('Could not crop this result', 'error');
    }
  }, [region, storeEntry, showToast]);

  /** Back to the full length: a re-render with every snippet as it is and no crop. */
  const resetCrop = useCallback((r: MangleResultEntry) => {
    editResult(r, r.recipe.snippets, recipeSettings(r), 'Restoring the full length', { crop: null });
  }, [editResult]);

  /**
   * The editor saved: its version becomes (or updates) a copy next to the
   * original, marked edited. Cue points are read back from the WAV it wrote.
   */
  const saveEditedCopy = useCallback(async (from: MangleResultEntry, blob: Blob, duration: number) => {
    const id = editedCopyRef.current ?? newId();
    editedCopyRef.current = id;
    try {
      region.forget(id);
      const buffer = await region.load(id, blob);
      const left = buffer.getChannelData(0);
      const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
      const header = await readWavHeaderInfo(blob).catch(() => null);
      const cuePoints = (header?.metadata?.slicePoints ?? []).map(t => Math.round(t * SR));
      const list = resultsRef.current;
      const existing = list.find(x => x.id === id);
      const taken = new Set(list.filter(x => x.id !== id).map(x => x.name));
      let name = existing?.name ?? `${from.name}-edit`;
      for (let n = 2; !existing && taken.has(name); n++) name = `${from.name}-edit-${n}`;
      {
        const entry: MangleResultEntry = {
          id,
          name,
          blob,
          duration: duration || left.length / SR,
          recipe: { ...from.recipe, cuePoints, cueSource: undefined, crop: undefined },
          peaks: waveformPeaks(left, right),
          kept: true,
          batchId: from.batchId,
          createdAt: existing?.createdAt ?? Date.now(),
          edited: true,
        };
        await storeEntry(entry);
        setResults(prev => sortResults(prev.some(x => x.id === id) ? prev.map(x => (x.id === id ? entry : x)) : [...prev, entry]));
      }
    } catch (e) {
      console.error(e);
      showToast('Could not bring the edit back into the mangler', 'error');
    }
  }, [region, storeEntry, showToast]);

  /** A slice into the editor: rendered as it sounds (shift, direction, gain, envelope), to edit and save back. */
  const openSliceEditor = useCallback(async (id: string) => {
    const sl = slices.find(x => x.id === id);
    const source = sl && sources.find(x => x.id === sl.sourceId);
    if (!sl || !source) { showToast('This slice can\'t be edited: its source has left the pool', 'error'); return; }
    try {
      region.stop();
      if (player.isPlaying) player.pause();
      const decoded = await region.load(source.id, source.blob);
      const l = decoded.getChannelData(0);
      const r = decoded.numberOfChannels > 1 ? decoded.getChannelData(1) : l;
      const [a, b] = renderSlice([l, r], decoded.sampleRate, sl);
      setEditingSlice({ id, name: sl.name, blob: wavWithCues(a, b, [], sl.name), duration: a.length / decoded.sampleRate, license: source.license });
    } catch (e) {
      console.error(e);
      showToast('Could not open the slice in the editor', 'error');
    }
  }, [slices, sources, region, player, showToast]);

  /**
   * The editor's save for a slice: the edited sound goes in the pool (switched off,
   * marked as this slice's), and the slice becomes all of it, with its shift,
   * direction, gain and envelope baked in. A sound saved for this slice before,
   * used by nothing else, makes way for the new one.
   */
  const saveEditedSlice = useCallback(async (id: string, blob: Blob) => {
    const sl = slices.find(x => x.id === id);
    if (!sl) return;
    try {
      // Its licence comes from the source it was cut from: without it, nothing to go on.
      const before = sources.find(x => x.id === sl.sourceId);
      if (!before) { showToast("Not saved: the slice's source has left the pool", 'error'); return; }
      const source = await addBlobSource(blob, `${sl.name} (edited)`, `Slice of ${sl.sourceName}`, before.license,
        sourceLicense(before).level, { enabled: false, forSlice: id });
      const decoded = await region.load(source.id, source.blob);
      const l = decoded.getChannelData(0);
      const r = decoded.numberOfChannels > 1 ? decoded.getChannelData(1) : l;
      const next: MangleSliceEntry = {
        ...sl, sourceId: source.id, sourceName: source.name, start: 0, end: decoded.duration,
        shift: undefined, reverse: undefined, gainDb: undefined, envelope: undefined,
        peaks: slicePeaks([l, r]),
      };
      setSlices(prev => prev.map(x => (x.id === id ? next : x)));
      await putMangleSlicesToDB([next]);
      // The sound saved at this slice's last edit, if nothing else plays it.
      if (before.forSlice === id && !slices.some(x => x.id !== id && x.sourceId === before.id)) {
        setSources(prev => prev.filter(x => x.id !== before.id));
        sourcesRef.current = sourcesRef.current.filter(x => x.id !== before.id);
        deleteMangleSourcesFromDB([before.id]);
        region.forget(before.id);
      }
      showToast(`${sl.name}: replaced with the edit`, 'success');
    } catch (e) {
      console.error(e);
      showToast('Could not save the edit to the slice', 'error');
    }
  }, [slices, sources, addBlobSource, region, showToast]);

  const openEditor = useCallback((r: MangleResultEntry) => {
    region.stop();
    if (player.isPlaying) player.pause();
    editedCopyRef.current = null;
    setEditing(r);
  }, [region, player]);

  /** New cue points for a result, the audio untouched: at the snippets, or at the hits. */
  const recue = useCallback(async (r: MangleResultEntry, level: 'snippets' | CueLevel) => {
    if (batchRef.current || recueing) return;
    setRecueing(r.id);
    try {
      const buffer = await region.load(r.id, r.blob);
      const left = buffer.getChannelData(0);
      const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
      const cuePoints = level === 'snippets'
        ? snippetCues(r.recipe.snippets, left.length)
        : transientCues([left, right], SR, level);
      const entry: MangleResultEntry = {
        ...r,
        blob: wavWithCues(left, right, cuePoints, r.name),
        recipe: {
          ...r.recipe,
          cuePoints,
          cuesCapped: level === 'snippets' && r.recipe.snippets.length > cuePoints.length,
          cueSource: level === 'snippets' ? undefined : level,
        },
      };
      if (player.activeFileId === r.id) player.stop();
      await storeEntry(entry);
      setUndo(prev => ({ ...prev, [r.id]: r }));
      setResults(prev => prev.map(x => (x.id === r.id ? entry : x)));
      showToast(level === 'snippets'
        ? `${cuePoints.length} cue points, one per snippet`
        : `${cuePoints.length} cue points at the hits`, 'success');
    } catch (e) {
      console.error(e);
      showToast('Could not find the cue points', 'error');
    } finally {
      setRecueing(null);
    }
  }, [recueing, region, player, storeEntry, showToast]);

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
    const count = variationCount;
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
          name: freshName(result.seed, taken, batchSettings), kept: false, batchId, locked: r.locked,
        });
        await storeEntry(entry);
        setResults(prev => sortResults([...prev, entry]));
      },
    });
  }, [missingFor, settings, variationCount, results, showToast, sourcesFor, startJob, makeEntry, storeEntry]);

  /** The result's WAV with another `INAM` name: the audio and cue points stay. */
  const wavNamed = useCallback(async (r: MangleResultEntry, name: string) => {
    const buffer = await region.load(r.id, r.blob);
    const left = buffer.getChannelData(0);
    const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
    return wavWithCues(left, right, r.recipe.cuePoints, name);
  }, [region]);

  /** A new name for a result, on its card and in the WAV it saves as. */
  const renameResult = useCallback(async (r: MangleResultEntry, raw: string) => {
    const name = cleanResultName(raw);
    if (!name || name === r.name) return;
    if (resultsRef.current.some(x => x.id !== r.id && x.name === name)) {
      showToast(`Another result is called ${name}`, 'info');
      return;
    }
    try {
      const entry: MangleResultEntry = { ...r, name, blob: await wavNamed(r, name) };
      await storeEntry(entry);
      setResults(prev => prev.map(x => (x.id === r.id ? { ...entry, kept: x.kept } : x)));
    } catch (e) {
      console.error(e);
      showToast(`Could not rename ${r.name}`, 'error');
    }
  }, [wavNamed, storeEntry, showToast]);

  const undoEdit = useCallback(async (r: MangleResultEntry) => {
    const previous = undo[r.id];
    if (!previous) return;
    if (player.activeFileId === r.id) player.stop();
    region.stop();
    region.forget(r.id);
    // A rename since the edit stays.
    const restored = previous.name === r.name
      ? { ...previous, kept: r.kept }
      : { ...previous, kept: r.kept, name: r.name, blob: await wavNamed(previous, r.name) };
    await storeEntry(restored);
    setResults(prev => prev.map(x => (x.id === r.id ? restored : x)));
    setUndo(prev => {
      const next = { ...prev };
      delete next[r.id];
      return next;
    });
  }, [undo, player, region, storeEntry, wavNamed]);

  /** Plays snippet `index` the way the play mode says. */
  const playSnippet = useCallback((r: MangleResultEntry, index: number) => {
    const s = r.recipe.snippets[index];
    if (!s) return;
    if (player.isPlaying) player.pause();
    const next = r.recipe.snippets[index + 1];
    const offset = r.recipe.crop?.start ?? 0;
    const fileEnd = r.duration * SR;
    const [start, end] = (playMode === 'full'
      ? [snippetCue(s) - offset, fileEnd]
      : playMode === 'fades'
        ? [s.outStart - offset, s.outStart + s.length - offset]
        : [snippetCue(s) - offset, next ? snippetCue(next) - offset : fileEnd]
    ).map(f => Math.max(0, Math.min(fileEnd, f)));
    if (end - start < 1) return; // cropped out
    region.playRegion({ resultId: r.id, index, start: start / SR, end: end / SR, full: playMode === 'full' }, r.blob);
  }, [player, region, playMode]);

  /** The play button: the whole file, pausing and resuming where it left off. */
  const togglePlay = useCallback((r: MangleResultEntry) => {
    if (player.isPlaying) player.pause();
    const here = region.playing?.resultId === r.id ? region.playing : null;
    if (here?.full) { region.pause(); return; }
    const from = region.paused?.resultId === r.id ? region.paused.position : 0;
    region.playRegion({ resultId: r.id, index: -1, start: from >= r.duration - 0.05 ? 0 : from, end: r.duration, full: true }, r.blob);
  }, [player, region]);

  /** A click on the waveform at `fraction`, the way the play mode says. */
  const playAt = useCallback((r: MangleResultEntry, fraction: number) => {
    setExpanded(r.id); // so the list can show where this is
    if (playMode === 'fades') {
      playSnippet(r, snippetAt(r, fraction));
      return;
    }
    if (player.isPlaying) player.pause();
    const end = r.duration;
    if (playMode === 'full') {
      region.playRegion({ resultId: r.id, index: -1, start: fraction * end, end, full: true }, r.blob);
      return;
    }
    // Cue: between the cue points around the click (which may be hits, not snippets).
    const frame = fraction * end * SR;
    const cues = r.recipe.cuePoints.length ? r.recipe.cuePoints : [0];
    let k = 0;
    cues.forEach((c, i) => { if (c <= frame) k = i; });
    const stop = cues[k + 1] !== undefined ? cues[k + 1] / SR : end;
    region.playRegion({ resultId: r.id, index: -1, start: cues[k] / SR, end: stop }, r.blob);
  }, [player, region, playMode, playSnippet]);

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
    setSequence(seq => pruneSequence(seq, new Set(), new Set([id])));
  }, [player, region, setSequence]);

  const clearUnkept = useCallback(() => {
    const ids = results.filter(r => !r.kept).map(r => r.id);
    if (player.activeFileId && ids.includes(player.activeFileId)) player.stop();
    setResults(prev => prev.filter(r => r.kept));
    deleteMangleResultsFromDB(ids);
    setSequence(seq => pruneSequence(seq, new Set(), new Set(ids)));
  }, [results, player, setSequence]);

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

  /** Saved means worth keeping here too. */
  const markKept = useCallback((list: MangleResultEntry[]) => {
    const ids = new Set(list.map(r => r.id));
    setResults(prev => prev.map(r => (ids.has(r.id) && !r.kept ? { ...r, kept: true } : r)));
    for (const r of list) if (!r.kept) putMangleResultToDB({ ...r, kept: true }).catch(console.error);
  }, []);

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
      markKept(list);
    } catch (e) {
      console.error(e);
      showToast(e instanceof Error ? e.message : 'Could not save', 'error');
    }
  }, [pendingSave, showToast, markKept]);

  /** Inside Studio: straight into the project. The first one fills the slot it was opened from. */
  const studioTarget = studio?.targetLabel;
  const onAddToProject = studio?.onAddToProject;
  const addToProject = useCallback((list: MangleResultEntry[]) => {
    const ok = savable(list);
    if (!ok.length || !onAddToProject) return;
    onAddToProject(resultsAsProjectFiles(ok));
    markKept(ok);
    const rest = ok.length - (studioTarget ? 1 : 0);
    showToast([
      studioTarget ? `${ok[0].name} is in ${studioTarget}` : '',
      rest ? `${rest} file${rest === 1 ? '' : 's'} added to the project pool` : '',
    ].filter(Boolean).join('; '), 'success');
  }, [savable, onAddToProject, studioTarget, markKept, showToast]);

  // ---------------------------------------------------------------------------
  // Synth
  // ---------------------------------------------------------------------------

  const synthRanges = synth.ranges[synth.kind] ?? defaultRanges(synth.kind);

  /** Takes one at a time, with a breath between, so a phone stays responsive. */
  const generateTakes = useCallback(async () => {
    if (synthesizing) return;
    setSynthesizing(true);
    const count = Math.min(synth.count, limits.variationsMax);
    const made: SynthTake[] = [];
    for (let i = 0; i < count; i++) {
      const seedValue = randomSeed();
      const { values, audio } = synthesize(synth.kind, synthRanges, seedValue, SR);
      const n = (takeCounter.current[synth.kind] ?? 0) + 1;
      takeCounter.current[synth.kind] = n;
      made.push({
        id: newId(), name: `${GENERATORS[synth.kind].label.toLowerCase()} ${n}`, kind: synth.kind, seed: seedValue, values, audio,
        peaks: slicePeaks(audio),
      });
      setTakes(prev => [...made.slice(-1), ...prev]);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    setSynthesizing(false);
  }, [synthesizing, synth, synthRanges, limits.variationsMax]);

  const takeBlob = (t: SynthTake) => wavWithCues(t.audio[0], t.audio[1], [], t.name);

  /** A take as a small source of its own. Switched off when it only backs a slice. */
  const takeSource = useCallback((t: SynthTake, enabled: boolean) =>
    addBlobSource(takeBlob(t), t.name, 'Synth', undefined, 'open', { enabled, synth: { kind: t.kind, seed: t.seed, values: t.values } }),
  [addBlobSource]);

  const takesToSlices = useCallback(async (list: SynthTake[]) => {
    const items: Omit<MangleSliceEntry, 'id' | 'addedAt'>[] = [];
    for (const t of list) {
      const source = await takeSource(t, false);
      items.push({
        start: 0, end: t.audio[0].length / SR, name: t.name, sourceId: source.id, sourceName: source.name, origin: 'Synth',
        cls: GENERATORS[t.kind].cls, peaks: t.peaks,
      });
    }
    await addSlices(items);
  }, [takeSource, addSlices]);

  /**
   * A drum preset loaded with an empty slice pool: the synth makes a sound per
   * voice (kick, snare, hats …), each a slice; their ids in voice order.
   */
  const drumKitSlices = useCallback(async (): Promise<(string | null)[]> => {
    const items: Omit<MangleSliceEntry, 'id' | 'addedAt'>[] = [];
    for (const v of DRUM_VOICES) {
      const seedValue = randomSeed();
      const { values, audio } = synthesize(v.kind, { ...defaultRanges(v.kind), ...v.ranges }, seedValue, SR);
      const n = (takeCounter.current[v.kind] ?? 0) + 1;
      takeCounter.current[v.kind] = n;
      const take: SynthTake = { id: newId(), name: `${v.name.toLowerCase()} ${n}`, kind: v.kind, seed: seedValue, values, audio, peaks: slicePeaks(audio) };
      const source = await takeSource(take, false);
      items.push({
        start: 0, end: audio[0].length / SR, name: take.name, sourceId: source.id, sourceName: source.name, origin: 'Synth',
        cls: v.cls, peaks: take.peaks,
      });
      // A breath between, so a phone stays responsive.
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    const entries = await addSlices(items);
    return DRUM_VOICES.map((_, i) => entries[i]?.id ?? null);
  }, [takeSource, addSlices]);

  const takesToSources = useCallback(async (list: SynthTake[]) => {
    for (const t of list) await takeSource(t, true);
    showToast(`${list.length} take${list.length === 1 ? '' : 's'} added to the source pool`, 'success');
  }, [takeSource, showToast]);

  /** A take as a result: the save routes, the editor and Studio slots then work as for any result. */
  const takeResult = useCallback(async (t: SynthTake): Promise<MangleResultEntry> => {
    const taken = new Set(resultsRef.current.map(r => r.name));
    let name = t.name.replace(/\s+/g, '_');
    for (let n = 2; taken.has(name); n++) name = `${t.name.replace(/\s+/g, '_')}-${n}`;
    const entry: MangleResultEntry = {
      id: newId(), name, blob: takeBlob(t), duration: t.audio[0].length / SR,
      recipe: { seed: t.seed, settings: DEFAULT_SETTINGS, sources: [], snippets: [], cuePoints: [], cuesCapped: false, peakReductionDb: 0 },
      peaks: waveformPeaks(t.audio[0], t.audio[1]), kept: true, batchId: Date.now(), createdAt: Date.now(), edited: true, kind: 'synth',
    };
    await storeEntry(entry);
    setResults(prev => sortResults([...prev, entry]));
    return entry;
  }, [storeEntry]);

  /** Pool sources that are a kept result (put in the pool, or starred there). */
  const keptSourceIds = useMemo(() => {
    const kept = results.filter(r => r.kept);
    const ids = new Set(kept.map(r => r.id));
    const out = new Set(kept.map(r => r.fromSource).filter((id): id is string => !!id));
    for (const s of sources) if (s.fromResult && ids.has(s.fromResult)) out.add(s.id);
    return out;
  }, [results, sources]);

  /**
   * The pool's star: the source's result kept (or not), or, if it has none, the
   * file taken as it is into the results, starred: 48 kHz WAV, its own cue points.
   */
  const starSource = useCallback(async (s: MangleSourceEntry) => {
    const linked = resultsRef.current.find(r => r.id === s.fromResult || r.fromSource === s.id);
    if (linked) { toggleKeep(linked); return; }
    if (s.duration > OUTPUT_MAX_SECONDS + 0.05) {
      showToast(`${s.name} is longer than ${OUTPUT_MAX_SECONDS} s, a slot's limit: mangle it, or cut parts and slices from it`, 'info');
      return;
    }
    try {
      const decoded = await region.load(s.id, s.blob);
      const l = decoded.getChannelData(0);
      const r = decoded.numberOfChannels > 1 ? decoded.getChannelData(1) : l;
      const taken = new Set(resultsRef.current.map(x => x.name));
      const base = s.name.replace(/\s+/g, '_');
      let name = base;
      for (let n = 2; taken.has(name); n++) name = `${base}-${n}`;
      const cuePoints = (sourceCues[s.id] ?? []).map(t => Math.round(t * SR));
      const entry: MangleResultEntry = {
        id: newId(), name, blob: wavWithCues(l, r, cuePoints, name), duration: l.length / SR,
        recipe: {
          seed: 0, settings: DEFAULT_SETTINGS, snippets: [], cuePoints, cuesCapped: false, peakReductionDb: 0,
          sources: [{ id: s.id, name: s.name, origin: s.origin, license: s.license, licenseLevel: s.licenseLevel }],
        },
        peaks: waveformPeaks(l, r), kept: true, batchId: Date.now(), createdAt: Date.now(), edited: true, kind: 'file', fromSource: s.id,
      };
      await storeEntry(entry);
      setResults(prev => sortResults([...prev, entry]));
      showToast(`${s.name} is kept: in Results`, 'success');
    } catch (e) {
      console.error(e);
      showToast(`Could not keep ${s.name}`, 'error');
    }
  }, [region, sourceCues, storeEntry, toggleKeep, showToast]);

  const takesToResults = useCallback(async (list: SynthTake[]) => {
    for (const t of list) await takeResult(t);
    showToast(`${list.length} take${list.length === 1 ? '' : 's'} in Mangle › Results`, 'success');
  }, [takeResult, showToast]);

  const takeToSlot = useCallback(async (t: SynthTake) => {
    addToProject([await takeResult(t)]);
  }, [takeResult, addToProject]);

  // ---------------------------------------------------------------------------
  // The mangler as a whole: start fresh (and, below, save and open)
  // ---------------------------------------------------------------------------

  const [projectMenu, setProjectMenu] = useState(false);
  const fullscreen = useFullscreen();
  const [confirmFresh, setConfirmFresh] = useState(false);
  useEscapeLayer(projectMenu, () => { setProjectMenu(false); return true; });
  const projectMenuRef = useRef<HTMLDivElement>(null);
  // A click anywhere else closes it.
  useEffect(() => {
    if (!projectMenu) return;
    const away = (e: PointerEvent) => { if (!projectMenuRef.current?.contains(e.target as Node)) setProjectMenu(false); };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [projectMenu]);

  /** Everything emptied: sources, results (kept ones too), slices, synth takes, the sequence. Settings stay. */
  const startFresh = useCallback(async () => {
    player.stop();
    region.stop();
    sequencer.stop();
    try {
      await clearMangleStores();
    } catch (e) {
      console.error(e);
      showToast('Could not clear the stored pools', 'error');
      return;
    }
    setSources([]);
    setResults([]);
    setSlices([]);
    setTakes([]);
    setUndo({});
    setExpanded(null);
    resetSequence(newSequence(newId));
    setProjectName(null);
    showToast('Started fresh: sources, results, slices and the sequence are empty', 'success');
  }, [player, region, sequencer, showToast, resetSequence]);

  /** The project last saved or opened: Save writes to it again. */
  const [projectName, setProjectName] = useState<string | null>(() => appStorage.getItem(PROJECT_KEY));
  useEffect(() => {
    if (projectName) appStorage.setItem(PROJECT_KEY, projectName); else appStorage.removeItem(PROJECT_KEY);
  }, [projectName]);
  const [projectDialog, setProjectDialog] = useState<'save' | 'open' | null>(null);
  /**
   * The Spotykach's card, over USB or in a card reader (standalone only: Studio has its own):
   * results sent into slots, or slots imported as sources.
   */
  const [card, setCard] = useState<{ mode: 'send'; items: CardItem[] } | { mode: 'import' } | null>(null);
  const usbEnabled = useUsbTransferEnabled() && usbTransferSupported() && !studio;
  const cardEnabled = !studio && (usbEnabled || canPickFolder());
  const sendToCard = (list: MangleResultEntry[]) => {
    const items = list.filter(r => resultLicense(r.recipe).level !== 'no-derivatives')
      .map(r => ({ name: r.name, blob: r.blob, cues: r.recipe.cuePoints.map(f => f / SR) }));
    if (!items.length) return;
    player.stop(); region.stop(); sequencer.stop();
    setCard({ mode: 'send', items });
  };
  /** Where results can go from here (standalone): one card's Export menu, and the Kept and Selected menus. */
  const exportItems = (list: MangleResultEntry[]) => [
    { label: 'Save to the user library', icon: <Library size={13} />, onClick: () => requestSave('library', list) },
    { label: 'Add to the Browse pool', icon: <Waves size={13} />, onClick: () => requestSave('pool', list) },
    { label: list.length === 1 ? 'New Studio project with it' : 'New Studio project with them', icon: <FolderPlus size={13} />, onClick: () => startProject(list) },
    ...(cardEnabled ? [{ label: 'Send to Spotykach (USB or SD card)', icon: <Usb size={13} />, onClick: () => sendToCard(list) }] : []),
    { label: list.length === 1 ? 'Download for the M8 (16-bit, slices)' : 'Download for the M8 (zip, 16-bit, slices)', icon: <Download size={13} />, onClick: () => void downloadForM8(list) },
  ];
  /** A group of results (kept, or selected): out of the mangler, or back into the source pool. */
  const groupItems = (list: MangleResultEntry[]) => [
    ...(studio
      ? [{ label: 'Add to project', icon: <Plus size={13} />, onClick: () => addToProject(list) }]
      : exportItems(list)),
    { label: 'Into the source pool', icon: <Import size={13} />, onClick: () => { for (const r of list) void resultToSource(r); } },
  ];
  /** Slot files from the card, into the source pool: the user's own, cue points in the file. */
  const importFromCard = async (files: { file: File; tape: string; slot: number }[]) => {
    for (const { file, tape, slot } of files) {
      // Slot files are named by number; the sample's own name is in its INAM.
      const header = await readWavHeaderInfo(file).catch(() => null);
      await addBlobSource(file, header?.metadata?.name?.trim() || `${tape} ${slot}`, `Spotykach card · ${tape} ${slot}`, undefined, 'open');
    }
    showToast(`${files.length} slot file${files.length === 1 ? '' : 's'} in the source pool`, 'success');
  };
  const [projectBusy, setProjectBusy] = useState<string | null>(null);
  const [folderProjects, setFolderProjects] = useState<ProjectInfo[] | null>(null);

  const snapshot = (): ManglerSnapshot => ({ settings, sequence, synth, sources, results, slices });

  /**
   * The workspace with write permission: the stored one (asked again after a
   * reload), or one picked now and stored, the same one Studio uses. Call first
   * in a click handler: the permission prompt needs that click.
   */
  const workspaceForWriting = async (): Promise<FileSystemDirectoryHandle | null> => {
    if (knownWorkspace) return (await ensureWorkspacePermission(knownWorkspace)) ? knownWorkspace : null;
    try {
      const picked = await (window as Window & { showDirectoryPicker: (o: object) => Promise<FileSystemDirectoryHandle> })
        .showDirectoryPicker({ mode: 'readwrite', id: 'wavbuilder-work' });
      await saveDirectoryHandle('work', picked);
      setKnownWorkspace(picked);
      return picked;
    } catch {
      return null; // dismissed
    }
  };

  const saveProjectFolder = async (name: string) => {
    const ws = await workspaceForWriting();
    if (!ws) return;
    setProjectBusy('Saving…');
    try {
      const saved = await saveToFolder(ws, name, snapshot(), (done, total) => setProjectBusy(`Saving… ${done} of ${total} files`));
      setProjectName(saved);
      setProjectDialog(null);
      showToast(`Saved to ${ws.name}/Mangler/${saved}`, 'success');
    } catch (e) {
      console.error(e);
      showToast(`Could not save: ${e instanceof Error ? e.message : e}`, 'error');
    } finally {
      setProjectBusy(null);
    }
  };

  const saveProjectZip = async (name: string) => {
    setProjectBusy('Packing the zip…');
    try {
      const { blob, fileName } = await saveToZip(name, snapshot());
      downloadBlob(blob, fileName);
      setProjectName(name.trim());
      setProjectDialog(null);
    } catch (e) {
      console.error(e);
      showToast('Could not pack the project', 'error');
    } finally {
      setProjectBusy(null);
    }
  };

  /** Save: to the same project on the workspace when there is one, else the dialog. */
  const saveProject = async () => {
    setProjectMenu(false);
    if (!projectName || !canPickFolder() || !knownWorkspace) { setProjectDialog('save'); return; }
    await saveProjectFolder(projectName);
  };

  const listProjects = async () => {
    const ws = await workspaceForWriting();
    if (!ws) return;
    setFolderProjects(await listFolderProjects(ws));
  };

  /** An opened project replaces everything the mangler holds. */
  const applySnapshot = async (name: string, snap: ManglerSnapshot) => {
    player.stop();
    region.stop();
    sequencer.stop();
    const stored = await replaceMangleStores(snap.sources, snap.results, snap.slices);
    setSources([...stored.sources].sort((a, b) => a.addedAt - b.addedAt));
    setResults(sortResults(stored.results));
    setSlices([...snap.slices].sort((a, b) => a.addedAt - b.addedAt));
    setSettings(sanitizeSettings(snap.settings));
    resetSequence(validSequence(snap.sequence) ?? newSequence(newId));
    if (snap.synth?.kind) setSynth(snap.synth);
    setTakes([]);
    setUndo({});
    setExpanded(null);
    setProjectName(name);
    setProjectDialog(null);
    showToast(`Opened ${name}: ${stored.sources.length} sources, ${stored.results.length} results, ${snap.slices.length} slices`, 'success');
  };

  const openProjectFolder = async (name: string) => {
    const ws = await workspaceForWriting();
    if (!ws) return;
    setProjectBusy('Opening…');
    try {
      await applySnapshot(name, await openFromFolder(ws, name));
    } catch (e) {
      console.error(e);
      showToast(`Could not open ${name}: ${e instanceof Error ? e.message : e}`, 'error');
    } finally {
      setProjectBusy(null);
    }
  };

  const openProjectZip = async (file: File) => {
    setProjectBusy('Opening…');
    try {
      const { name, snapshot: snap } = await openFromZip(file);
      await applySnapshot(name, snap);
    } catch (e) {
      console.error(e);
      showToast(`Could not open the zip: ${e instanceof Error ? e.message : e}`, 'error');
    } finally {
      setProjectBusy(null);
    }
  };

  const downloadResult = useCallback((r: MangleResultEntry) => {
    if (savable([r]).length) downloadBlob(r.blob, `${r.name}.wav`);
  }, [savable]);

  /** The Dirtywave M8 reads 16-bit PCM without our LIST chunk: a converted copy, the result stays as it is. */
  const downloadForM8 = useCallback(async (list: MangleResultEntry[]) => {
    const ok = savable(list);
    if (!ok.length) return;
    try {
      const { blob, fileName } = await resultsForM8(ok);
      downloadBlob(blob, fileName);
      if (ok.some(r => r.recipe.cuePoints.length > M8_MAX_CUES)) showToast(`The M8 takes ${M8_MAX_CUES} slices: the rest are left out`, 'info');
    } catch (e) {
      console.error(e);
      showToast(`Could not make the M8 file: ${e instanceof Error ? e.message : e}`, 'error');
    }
  }, [savable, showToast]);

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
  /** The ticked results still in the list (a discarded one drops out by itself). */
  const selectedResults = useMemo(() => results.filter(r => selectedIds.has(r.id)), [results, selectedIds]);

  const resultsBytes = useMemo(() => results.reduce((sum, r) => sum + r.blob.size, 0), [results]);
  const busy = batch !== null;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      className="h-screen supports-[height:100dvh]:h-[100dvh] w-full flex flex-col bg-synthux-main text-white overflow-hidden"
      onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={e => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={e => {
        e.preventDefault();
        setDragging(false);
        addFiles(Array.from(e.dataTransfer.files ?? []));
      }}
    >
      {/* Full-width bar; its contents line up with the content frame below (1920 px). */}
      <div className="shrink-0 flex items-center justify-between gap-4 px-[max(1rem,calc((100%-1920px)/2+1rem))] py-2 border-b border-white/10 bg-synthux-panel">
        <button
          onClick={onExitToHub}
          className="flex items-center gap-1.5 px-1.5 sm:px-2.5 py-1.5 rounded-md text-xs font-bold uppercase tracking-widest
            text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <ChevronLeft size={14} /> <span className="hidden sm:inline">{studio ? 'Studio' : 'Hub'}</span>
        </button>
        <div className="min-w-0 flex items-center gap-3">
          <span className="hidden md:inline text-xs font-bold uppercase tracking-[0.2em] text-synthux-red">Sample Mangler</span>
          <nav data-tour="stations" className="flex rounded-md border border-white/10 overflow-hidden" aria-label="Stations">
            {([
              ['mangle', <Dices size={13} />, 'Mangle', 'Sources, settings and results'],
              ['slices', <Grid2x2 size={13} />, 'Slices', 'The slice pool: single sounds to collect and make kits from'],
              ['sequence', <Drum size={13} />, 'Sequence', 'A step sequencer for the slices: patterns A–D, a chain, up to 8 tracks'],
              ['synth', <AudioWaveform size={13} />, 'Synth', 'Drums, percussion and FM sounds, made from ranges like the mangler'],
            ] as const).map(([id, icon, label, hint]) => (
              <button key={id} onClick={() => setStation(id)} aria-pressed={station === id} title={hint}
                className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest transition-colors
                  ${station === id ? 'bg-synthux-red/80 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                {icon} <span className="hidden sm:inline">{label}</span>
                {id === 'slices' && slices.length > 0 && <span className="font-mono text-[10px] opacity-80">{slices.length}</span>}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-1">
        <div className="relative" ref={projectMenuRef}>
          <button
            onClick={() => setProjectMenu(o => !o)}
            aria-expanded={projectMenu}
            className="flex items-center gap-1.5 px-1.5 sm:px-2.5 py-1.5 rounded-md text-xs font-bold uppercase tracking-widest
              text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            title="The whole mangler: start fresh, save it, open a saved one"
          >
            <FolderOpen size={14} /> <span className="hidden sm:inline max-w-[10rem] truncate normal-case tracking-normal">{projectName ?? (studio ? 'Mangler' : 'Project')}</span> <ChevronDown size={12} />
          </button>
          {projectMenu && (
            <div className="absolute right-0 top-full mt-1 z-[60] w-64 rounded-lg border border-white/15 bg-synthux-panel shadow-2xl p-1 text-[12px]">
              <button onClick={saveProject} disabled={busy || !!projectBusy}
                className="w-full text-left px-3 py-2 rounded hover:bg-white/5 disabled:opacity-40">
                <span className="block font-bold text-gray-100">Save{projectName ? ` ${projectName}` : '…'}</span>
                <span className="block text-[10px] text-gray-500">
                  {projectName && knownWorkspace ? `Again, to ${knownWorkspace.name}/Mangler` : 'Pools, results, slices, sequence and settings, together'}
                </span>
              </button>
              <button onClick={() => { setProjectMenu(false); setProjectDialog('save'); }} disabled={busy || !!projectBusy}
                className="w-full text-left px-3 py-2 rounded hover:bg-white/5 disabled:opacity-40">
                <span className="block font-bold text-gray-100">Save as…</span>
                <span className="block text-[10px] text-gray-500">Another name, or a .mangler.zip</span>
              </button>
              <button onClick={() => { setProjectMenu(false); setFolderProjects(null); setProjectDialog('open'); }} disabled={busy || !!projectBusy}
                className="w-full text-left px-3 py-2 rounded hover:bg-white/5 disabled:opacity-40">
                <span className="block font-bold text-gray-100">Open…</span>
                <span className="block text-[10px] text-gray-500">From the workspace or a .mangler.zip</span>
              </button>
              <div className="my-1 border-t border-white/10" />
              <button onClick={() => { setProjectMenu(false); setConfirmFresh(true); }} disabled={busy}
                className="w-full text-left px-3 py-2 rounded hover:bg-white/5 disabled:opacity-40">
                <span className="block font-bold text-gray-100">Start fresh</span>
                <span className="block text-[10px] text-gray-500">Empty every pool: sources, results, slices, sequence</span>
              </button>
            </div>
          )}
        </div>
        {!runningStandalone() && (
          <button
            onClick={() => (fullscreen.supported
              ? void fullscreen.toggle()
              : showToast('This browser has no full screen for pages (iPhone Safari). Share › Add to Home Screen opens WAV Builder without the browser bars.', 'info'))}
            aria-pressed={fullscreen.active}
            className={`flex items-center gap-1.5 px-1.5 sm:px-2.5 py-1.5 rounded-md text-xs font-bold uppercase tracking-widest transition-colors
              ${fullscreen.active ? 'text-white bg-white/10' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
            title={fullscreen.active ? 'Leave full screen (Esc)' : 'Full screen: no address bar or tabs, every pixel for the mangler'}
          >
            {fullscreen.active ? <Minimize size={14} /> : <Maximize size={14} />}
            <span className="hidden md:inline">{fullscreen.active ? 'Exit' : 'Full'}</span>
          </button>
        )}
        <button
          onClick={togglePhoneMode}
          aria-pressed={phoneMode}
          className={`flex items-center gap-1.5 px-1.5 sm:px-2.5 py-1.5 rounded-md text-xs font-bold uppercase tracking-widest transition-colors
            ${phoneMode ? 'text-white bg-synthux-red/30' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
          title={phoneMode
            ? 'Phone mode: mono sources, a smaller pool and fewer variations per click. Click for the full limits'
            : 'Full limits. Click for phone mode: mono sources, a smaller pool and fewer variations, for a tab with little memory'}
        >
          <Smartphone size={14} /> <span className="hidden sm:inline">Phone</span>
        </button>
        <button
          onClick={() => setTourOpen(true)}
          className="flex items-center gap-1.5 px-1.5 sm:px-2.5 py-1.5 rounded-md text-xs font-bold uppercase tracking-widest
            text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          title="A short guide to the order of operations"
        >
          <HelpCircle size={14} /> <span className="hidden sm:inline">Guide</span>
        </button>
        </div>
      </div>

      {/* Every station in one frame: on a wide screen the far side stays within reach. */}
      <div className="flex-1 min-h-0 w-full max-w-[1920px] mx-auto flex flex-col min-[1921px]:border-x border-white/10">
      {station === 'synth' && (
        <div className="flex-1 min-h-0">
          <SynthStation
            kind={synth.kind}
            onKind={kind => setSynth(s => ({ ...s, kind }))}
            ranges={synthRanges}
            onRanges={ranges => setSynth(s => ({ ...s, ranges: { ...s.ranges, [s.kind]: ranges } }))}
            onResetRanges={() => setSynth(s => ({ ...s, ranges: { ...s.ranges, [s.kind]: undefined } }))}
            count={synth.count}
            maxCount={Math.min(8, limits.variationsMax)}
            onCount={count => setSynth(s => ({ ...s, count }))}
            generating={synthesizing}
            onGenerate={generateTakes}
            takes={takes}
            playingId={slicePlayer.playingId}
            onPlay={t => { player.stop(); region.stop(); slicePlayer.playAudio(t.id, t.audio, SR); }}
            onStop={slicePlayer.stop}
            onToSlices={takesToSlices}
            onToSources={takesToSources}
            onToResults={takesToResults}
            slotLabel={studio?.targetLabel}
            onToSlot={studio ? takeToSlot : undefined}
            onDiscard={ids => setTakes(prev => prev.filter(t => !ids.includes(t.id)))}
          />
        </div>
      )}

      {station === 'sequence' && (
        <div className="flex-1 min-h-0">
          <SequencerStation
            seq={sequence}
            onChange={sequenceHistory.edit}
            loop={loopPattern}
            onLoop={setLoopPattern}
            history={{ undo: sequenceHistory.undo, redo: sequenceHistory.redo, canUndo: sequenceHistory.canUndo, canRedo: sequenceHistory.canRedo }}
            slices={slices}
            available={availableSources}
            playing={sequencer.playing}
            step={sequencer.step}
            busy={busy}
            onPlay={() => {
              player.stop(); region.stop(); slicePlayer.stop();
              if (midi.enabled && midi.settings.follow) void sequencer.startExternal(true); else void sequencer.start();
            }}
            onStop={sequencer.stop}
            onAudition={(id, shift, env) => { void auditionSound(id, shift, env); }}
            onEditSlice={openSliceEditor}
            onDrumKit={drumKitSlices}
            onRender={(cueMode, fold) => renderSequence(sequence, cueMode, fold)}
            newId={newId}
            cueSounds={cueSounds}
            link={{
              supported: midi.supported, enabled: midi.enabled, error: midi.error, ports: midi.ports,
              settings: midi.settings, setSettings: midi.setSettings, enable: midi.enable,
              following: sequencer.following, tempo: follow.tempo,
            }}
          />
        </div>
      )}

      {station === 'slices' && (
        <div className="flex-1 min-h-0">
          <SlicePool
            slices={slices}
            available={availableSources}
            playingId={slicePlayer.playingId}
            busy={busy}
            onPlay={playSlice}
            onStop={slicePlayer.stop}
            onDelete={deleteSlices}
            onToSources={slicesToSources}
            onUpdate={updateSlice}
            onEdit={slice => { void openSliceEditor(slice.id); }}
            onKit={list => makeKit(list.map(s => ({ sourceId: s.sourceId, spec: s })), list.length === 1 ? list[0].name : 'slices')}
          />
        </div>
      )}

      {station === 'mangle' && <>
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(240px,300px)_minmax(260px,320px)_1fr]">

        {/* Source pool */}
        <section data-tour="sources" className={`min-h-0 ${paneClass('sources', pane, 'flex')} flex-col lg:border-r border-white/10`}>
          {/*
            * Wraps: in Studio a third button (Project) makes the row wider than the
            * column, and the buttons then take a line of their own.
            */}
          <div className="shrink-0 px-4 pt-4 pb-2 flex flex-wrap items-center gap-y-2">
            <label className="flex items-center gap-2 cursor-pointer whitespace-nowrap" title="Switch every source on or off">
              <input
                type="checkbox"
                checked={shownSources.length > 0 && shownSources.every(s => s.enabled)}
                ref={el => { if (el) el.indeterminate = shownSources.some(s => s.enabled) && !shownSources.every(s => s.enabled); }}
                onChange={e => setAllSources(e.target.checked)}
                disabled={shownSources.length === 0}
                className="accent-synthux-red h-3.5 w-3.5 cursor-pointer disabled:cursor-default"
              />
              <h2 className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Source pool</h2>
            </label>
            <button
              onClick={rollSources}
              disabled={shownSources.length < 2}
              className="ml-1 p-1 rounded text-gray-500 hover:text-synthux-red hover:bg-white/5 transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
              title="Dice: switch on a random few of the sources shown, and the others off"
            >
              <Dices size={13} />
            </button>
            <button
              onClick={() => setConfirmRemoveEnabled(true)}
              disabled={!shownSources.some(s => s.enabled)}
              className="mr-auto p-1 rounded text-gray-500 hover:text-synthux-red hover:bg-white/5 transition-colors
                disabled:opacity-25 disabled:cursor-not-allowed disabled:hover:text-gray-500 disabled:hover:bg-transparent"
              title={`Remove the switched-on sources shown (${shownSources.filter(s => s.enabled).length}) from the pool`}
            >
              <Trash2 size={13} />
            </button>
            <div className="ml-auto flex items-center gap-1.5">
              {studio && (
                <button
                  onClick={fillFromProject}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold text-synthux-red
                    border border-synthux-red/40 hover:bg-synthux-red/10 transition-colors"
                  title="Add the project's slot and pool files to the pool, and switch every other source off"
                >
                  <Briefcase size={12} /> Project
                </button>
              )}
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
              {cardEnabled && (
                <button
                  onClick={() => { player.stop(); region.stop(); sequencer.stop(); setCard({ mode: 'import' }); }}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold text-synthux-orange
                    border border-synthux-orange/40 hover:bg-synthux-orange/10 transition-colors"
                  title="Import slot files from the Spotykach: over USB or from its SD card"
                >
                  <HardDrive size={12} /> Card
                </button>
              )}
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
          {sources.length > 0 && (
            <div className="shrink-0 px-4 pb-2 space-y-1.5 text-[10px]">
              <div className="flex items-center gap-1.5">
              <label className="min-w-0 flex-1 flex items-center gap-1 px-2 py-1 rounded-md border border-white/10 bg-black/30 text-gray-400"
                title="Filters as you type; Enter keeps it as a tag">
                <Search size={11} />
                <input value={poolQuery} onChange={e => setPoolQuery(e.target.value)} placeholder="Filter by name or origin (Enter: tag)"
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPoolTag(); } }}
                  className="min-w-0 flex-1 bg-transparent text-[11px] text-gray-200 placeholder:text-gray-600 focus:outline-none" />
                {poolQuery && <>
                  <button onClick={addPoolTag} title="Keep as a tag" aria-label="Keep as a tag" className="hover:text-white"><Tag size={11} /></button>
                  <button onClick={() => setPoolQuery('')} aria-label="Clear the filter" className="hover:text-white"><X size={11} /></button>
                </>}
              </label>
              <select value={poolSort} onChange={e => setPoolSort(e.target.value as PoolSort)} aria-label="Sort the pool"
                title="The list's order (Generate always takes the sources in the order they were added)"
                className="shrink-0 bg-black/30 border border-white/10 rounded-md px-1 py-1 text-[11px] text-gray-300">
                {POOL_SORTS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
              </div>
              {(poolKinds.length > 1 || poolTags.length > 0) && (
                <div className="flex flex-wrap gap-1">
                  <button onClick={() => { setPoolKindsOn(new Set()); setPoolTags(prev => prev.map(t => ({ ...t, on: false }))); }}
                    title="Every source: all filters off"
                    className={`px-1.5 py-0.5 rounded border transition-colors ${poolKindsOn.size === 0 && !poolTags.some(t => t.on) ? 'bg-synthux-red/80 border-transparent text-white' : 'border-white/10 text-gray-400 hover:text-white'}`}>
                    All <span className="font-mono opacity-70">{sources.length}</span>
                  </button>
                  {poolKinds.length > 1 && poolKinds.map(k => {
                    const on = poolKindsOn.has(k.id);
                    return (
                      <button key={k.id} aria-pressed={on} title={`${k.hint}: ${on ? 'click to hide' : 'click to show (with the others on)'}`}
                        onClick={() => setPoolKindsOn(prev => { const next = new Set(prev); if (on) next.delete(k.id); else next.add(k.id); return next; })}
                        className={`px-1.5 py-0.5 rounded border transition-colors ${on ? 'bg-synthux-red/80 border-transparent text-white' : 'border-white/10 text-gray-400 hover:text-white'}`}>
                        {k.label} <span className="font-mono opacity-70">{sources.filter(s => sourceKind(s) === k.id).length}</span>
                      </button>
                    );
                  })}
                  {poolTags.map(t => (
                    <span key={t.text} className={`flex items-center rounded border transition-colors ${t.on ? 'bg-synthux-blue/30 border-synthux-blue/60 text-white' : 'border-dashed border-white/15 text-gray-400'}`}>
                      <button aria-pressed={t.on} onClick={() => setPoolTags(prev => prev.map(x => (x.text === t.text ? { ...x, on: !x.on } : x)))}
                        title={`Tag "${t.text}": ${t.on ? 'on' : 'off'}`} className="flex items-center gap-0.5 pl-1.5 py-0.5 hover:text-white">
                        <Tag size={9} /> {t.text}
                      </button>
                      <button onClick={() => setPoolTags(prev => prev.filter(x => x.text !== t.text))} title="Remove the tag" aria-label={`Remove the tag ${t.text}`}
                        className="px-1 py-0.5 text-gray-500 hover:text-synthux-red"><X size={9} /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

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

            {sources.length > 0 && shownSources.length === 0 && (
              <p className="px-2 py-4 text-center text-[11px] text-gray-500">Nothing matches the filter.</p>
            )}
            <ul className="space-y-1">
              {listedSources.map(s => {
                const playing = player.activeFileId === s.id && player.isPlaying;
                const active = player.activeFileId === s.id;
                const partCount = s.regions?.length ?? 0;
                return (
                  <li key={s.id} className={`rounded-md hover:bg-white/5 ${active ? 'bg-white/[0.04]' : ''} ${s.enabled ? '' : 'opacity-45'}`}>
                  <div className="group flex items-center gap-2 px-2 py-1.5">
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
                    <button
                      onClick={() => { if (player.isPlaying) player.pause(); setPartsFor(s.id); }}
                      className={`shrink-0 flex items-center gap-0.5 rounded px-1 text-[10px] ${partCount
                        ? 'text-synthux-red border border-synthux-red/40'
                        : 'text-gray-600 hover:text-white opacity-0 group-hover:opacity-100 focus:opacity-100'}`}
                      title={partCount ? `${partCount} part${partCount === 1 ? '' : 's'} chosen: snippets only come from there` : 'Choose the parts of this file to use'}
                    >
                      <Scissors size={11} />{partCount > 0 && partCount}
                    </button>
                    <span className="shrink-0 text-[10px] font-mono text-gray-500 tabular-nums">{formatSeconds(s.duration)}</span>
                    {(() => {
                      const kept = keptSourceIds.has(s.id);
                      return (
                        <button onClick={() => void starSource(s)} aria-pressed={kept}
                          className={`shrink-0 ${kept ? 'text-synthux-yellow' : 'text-gray-600 hover:text-synthux-yellow opacity-0 group-hover:opacity-100 focus:opacity-100'}`}
                          title={kept ? 'Kept: in the results\' Kept list. Click to unkeep' : 'Keep this file as it is: into the results, starred'}>
                          <Star size={12} fill={kept ? 'currentColor' : 'none'} />
                        </button>
                      );
                    })()}
                    <button
                      onClick={() => removeSource(s.id)}
                      className="shrink-0 text-gray-600 hover:text-synthux-red opacity-0 group-hover:opacity-100 focus:opacity-100"
                      title="Remove from the pool"
                    >
                      <X size={13} />
                    </button>
                  </div>
                  {active && (
                    <ScrubBar position={player.currentTime} duration={player.duration || s.duration} onSeek={t => player.seek(t)} />
                  )}
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
            {hiddenEnabled > 0 && <span className="text-gray-600"> · {hiddenEnabled} switched on but filtered out</span>}
            {enabledSeconds > limits.poolWarnSeconds && (
              <span className="block text-synthux-yellow mt-0.5">
                Over {formatSeconds(limits.poolWarnSeconds)}{phoneMode ? ' (phone mode)' : ''}: decoding this much may run the tab out of memory.
              </span>
            )}
          </div>
        </section>

        {/* Settings */}
        <section data-tour="settings" className={`min-h-0 ${paneClass('settings', pane, 'block')} overflow-y-auto lg:border-r border-white/10 px-4 py-4 space-y-4`}>
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Settings</h2>
            <select
              value={style ?? ''}
              onChange={e => {
                const name = e.target.value;
                if (name === '__default') {
                  // Every setting back to its default, but the variations and locked groups.
                  const defaults: Partial<MangleSettings> = { ...DEFAULT_SETTINGS };
                  delete defaults.variations;
                  setSettings(prev => sanitizeSettings({ ...prev, ...unlocked(defaults, diceLocks) }));
                  setStyle(null);
                } else if (PRESETS[name]) {
                  updateMany(unlocked(PRESETS[name], diceLocks));
                  setStyle(name);
                } else {
                  setStyle(null);
                }
              }}
              title={style
                ? `Style: ${style}. Its settings are set, and the dice next to it stay near them`
                : 'Pick a preset: its settings are set, and the dice then stay near them. Locked groups keep theirs'}
              className={`min-w-0 max-w-[9rem] bg-black/40 border rounded px-1.5 py-1 text-[11px] ${style ? 'border-synthux-red/50 text-white' : 'border-white/10 text-gray-300'}`}
            >
              <option value="">Any style</option>
              {Object.keys(PRESETS).map(name => <option key={name} value={name}>{name}</option>)}
              <option value="__default">Defaults</option>
            </select>
            <button onClick={() => setSettings(prev => rollInStyle(prev, style ? PRESETS[style] : null, Math.random, diceLocks))}
              title={style
                ? `Dice: roll within the ${style} style (its settings stay near the preset; locked groups stay)`
                : 'Dice: roll every group of settings (the fill, the length and locked groups stay)'}
              className="ml-1 p-1.5 rounded-md border border-synthux-red/40 text-synthux-red hover:bg-synthux-red/10 transition-colors">
              <Dices size={13} />
            </button>
            {style && (
              <button onClick={() => setSettings(prev => rollAll(prev, Math.random, diceLocks))}
                title="Dice: anything, ignoring the style (locked groups stay)"
                className="p-1.5 rounded-md border border-white/10 text-[10px] font-bold text-gray-400 hover:text-synthux-red hover:bg-white/5 transition-colors">
                <Dices size={11} className="inline -mt-0.5" /> All
              </button>
            )}
          </div>

          <SettingsPanel settings={settings} onChange={updateMany} storageKey="mangler_groups" className="space-y-3"
            locked={diceLocks} style={style ? PRESETS[style] : null}
            onLock={(g, on) => setDiceLocks(prev => (on ? [...prev.filter(x => x !== g), g] : prev.filter(x => x !== g)))} />
        </section>

        {/* Generate + results (min-w-0: a grid column otherwise never gets narrower than its content) */}
        <section className={`min-h-0 min-w-0 ${paneClass('results', pane, 'flex')} flex-col`}>
          {/* On a phone Generate lives in the bottom bar (on every pane), so this is two short rows. */}
          <div data-tour="generate" className="shrink-0 px-4 py-2 lg:py-3 border-b border-white/10 flex flex-wrap items-center gap-x-4 gap-y-2">
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

            <label className="flex items-center gap-2 text-[11px] text-gray-400" title="How many takes one Generate makes, each with its own seed. Drag the field or use its arrows">
              Variations
              <ScrubNumber value={variationCount} min={1} max={limits.variationsMax} step={1} width="w-[3.75rem]" ariaLabel="Variations"
                onChange={v => update('variations', v)} />
            </label>

            <Segmented label="Click plays" value={playMode} onChange={setPlayMode}
              options={[{ value: 'full', label: 'Full' }, { value: 'fades', label: 'Fades' }, { value: 'cue', label: 'Cue' }]}
              hint="Full: from there to the end. Fades: the snippet with its crossfades. Cue: only what lies between two cue points, as the slice mode plays it" />

            <div className="ml-auto hidden lg:flex items-center gap-2">
              {busy ? (
                <button onClick={cancelBatch}
                  className="flex items-center gap-2 px-4 h-10 rounded-full text-sm font-bold border border-white/20
                    text-gray-300 hover:bg-white/10">
                  <X size={15} /> Stop
                </button>
              ) : (
                <button onClick={() => { setPane('results'); generate(); }} disabled={enabledSources.length === 0}
                  className="flex items-center gap-2 px-5 h-10 rounded-full text-sm font-bold bg-synthux-red text-white
                    shadow-lg shadow-synthux-red/30 hover:scale-105 active:scale-95 transition-all
                    disabled:opacity-40 disabled:hover:scale-100 disabled:cursor-not-allowed">
                  <Dices size={16} /> Generate {variationCount}
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

          {/*
            * The results as a whole, on top where the eye is: what is kept and where it
            * can go (one menu), clearing the rest, and the storage they take.
            */}
          {results.length > 0 && (
            <div data-tour="save" className="shrink-0 px-4 py-1.5 border-b border-white/10 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
              <span>
                {results.length} result{results.length === 1 ? '' : 's'} ·{' '}
                <span className={keptResults.length ? 'text-synthux-yellow' : ''}>{keptResults.length} kept</span>
              </span>
              {selecting ? (
                <>
                  <ActionMenu
                    label={`Selected (${selectedResults.length})`}
                    icon={<CheckSquare size={12} />}
                    disabled={selectedResults.length === 0}
                    title={selectedResults.length ? 'Where the selected results go' : 'Tick results on their cards'}
                    items={groupItems(selectedResults)}
                  />
                  <button onClick={() => setSelectedIds(new Set(results.map(r => r.id)))}
                    className="px-2 py-0.5 rounded border border-white/10 text-gray-300 hover:text-white hover:bg-white/5">All</button>
                  <button onClick={() => setSelectedIds(new Set())} disabled={selectedResults.length === 0}
                    className="px-2 py-0.5 rounded border border-white/10 text-gray-300 hover:text-white hover:bg-white/5 disabled:opacity-40">None</button>
                  <button onClick={() => { setSelecting(false); setSelectedIds(new Set()); }}
                    className="px-2 py-0.5 rounded border border-synthux-blue/50 text-synthux-blue hover:bg-synthux-blue/10">Done</button>
                </>
              ) : (
                <>
                  <ActionMenu
                    label={`Kept (${keptResults.length})`}
                    icon={<Star size={12} />}
                    disabled={keptResults.length === 0}
                    title={keptResults.length ? 'Where the kept results go' : 'Keep results (the star on a card) to save, send or reuse them together'}
                    items={groupItems(keptResults)}
                  />
                  <button onClick={() => setSelecting(true)} title="Tick results to save, send or reuse just those"
                    className="flex items-center gap-1 px-2 py-0.5 rounded border border-white/10 text-gray-300 hover:text-white hover:bg-white/5">
                    <CheckSquare size={12} /> Select
                  </button>
                </>
              )}
              {results.some(r => !r.kept) && !busy && (
                <button onClick={clearUnkept} title="Discard every result without a star"
                  className="flex items-center gap-1 px-2 py-0.5 rounded border border-white/10 text-gray-300 hover:text-white hover:bg-white/5">
                  <Trash2 size={12} /> Clear unkept
                </button>
              )}
              <span className="ml-auto" title="Results are kept in this browser until cleared">
                {(resultsBytes / 1024 / 1024).toFixed(0)} MB stored
              </span>
            </div>
          )}

          {/* Cards stop at a readable width on wide screens and shrink with the window. */}
          <div data-tour="results" className="flex-1 min-h-0 min-w-0 overflow-y-auto p-4 space-y-3 [&>article]:max-w-[1400px]">
            {loaded && results.length === 0 && !batch && (
              <p className="text-sm text-gray-500 text-center mt-16 leading-relaxed">
                Set the ranges, then Generate. Each variation uses the same settings with its own seed.
                <br />Star the ones you like: unstarred results are cleared when the next batch starts.
              </p>
            )}

            {results.map(r => {
              const frames = Math.max(1, r.duration * SR);
              const offset = offsetOf(r);
              const used = usedSources(r.recipe);
              const pitched = r.recipe.snippets.filter(s => s.pitch).length;
              const isOpen = expanded === r.id;
              const license = resultLicense(r.recipe);
              const blocked = license.level === 'no-derivatives';
              const zoom = zooms[r.id];
              const regionHere = region.playing?.resultId === r.id ? region.playing : null;
              const pausedHere = region.paused?.resultId === r.id ? region.paused : null;
              const playingFull = !!regionHere?.full;
              const total = r.duration || 1;
              const progress = regionHere && region.position !== null
                ? region.position / total
                : pausedHere ? pausedHere.position / total : null;
              // The row to show: the one playing, following the playhead when playing through.
              const activeIndex = regionHere && !regionHere.full && regionHere.index >= 0
                ? regionHere.index
                : progress !== null ? snippetAt(r, progress) : -1;
              // Tint a bounded region while it plays, else the hovered row.
              const hovered = hover?.id === r.id ? r.recipe.snippets[hover.index] : undefined;
              const highlight: [number, number] | null = regionHere && !regionHere.full
                ? [regionHere.start / total, regionHere.end / total]
                : hovered ? [(hovered.outStart - offset) / frames, (hovered.outStart + hovered.length - offset) / frames] : null;
              const transient = !!r.recipe.cueSource && r.recipe.cueSource !== 'snippets';
              const cropping = cropEdit?.id === r.id ? cropEdit : null;
              return (
                <article key={r.id} id={`result-${r.id}`}
                  className={`min-w-0 rounded-xl border p-3 bg-synthux-panel/80 transition-shadow
                    ${r.kept ? 'border-synthux-yellow/40' : 'border-white/10'} ${flashId === r.id ? 'ring-2 ring-synthux-red shadow-lg shadow-synthux-red/20' : ''}
                    ${selecting && selectedIds.has(r.id) ? 'ring-2 ring-synthux-blue' : ''}`}>
                  {/* On a phone the buttons go to a line of their own, together. */}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-2">
                    {selecting && (
                      <button onClick={() => toggleSelected(r.id)}
                        title={selectedIds.has(r.id) ? 'Selected' : 'Select'} aria-pressed={selectedIds.has(r.id)}
                        className={`h-8 w-8 shrink-0 flex items-center justify-center rounded-md
                          ${selectedIds.has(r.id) ? 'text-synthux-blue' : 'text-gray-500 hover:text-white'}`}>
                        {selectedIds.has(r.id) ? <CheckSquare size={18} /> : <Square size={18} />}
                      </button>
                    )}
                    <button
                      onClick={() => togglePlay(r)}
                      className="h-8 w-8 shrink-0 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
                      title={playingFull ? 'Pause' : pausedHere ? 'Resume' : 'Play'}
                    >
                      {playingFull ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
                    </button>
                    <div className="min-w-0 flex-1 basis-40">
                      <div className="text-xs font-bold truncate flex items-center gap-1.5">
                        <ResultName name={r.name} disabled={busy} onRename={name => renameResult(r, name)} />
                        {r.kind ? (
                          <span className="shrink-0 px-1 rounded border border-synthux-blue/50 text-synthux-blue text-[9px] uppercase tracking-wider font-normal"
                            title={r.kind === 'sequence' ? 'Rendered from the sequencer: change it there and render again' : r.kind === 'file' ? 'A pool file, kept as it is' : 'A synth take'}>
                            {r.kind === 'file' ? 'pool file' : r.kind}
                          </span>
                        ) : r.edited && (
                          <span className="shrink-0 px-1 rounded border border-synthux-pink/40 text-synthux-pink text-[9px] uppercase tracking-wider font-normal"
                            title="Changed in the editor: play, crop, re-cue and save it, but its snippets can't be edited any more">
                            edited
                          </span>
                        )}
                        {r.recipe.crop && (
                          <span className="shrink-0 px-1 rounded border border-synthux-yellow/40 text-synthux-yellow/90 text-[9px] uppercase tracking-wider font-normal"
                            title={`Cropped to ${formatSeconds(r.duration)}`}>
                            cropped
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-gray-500 truncate">
                        {formatSeconds(r.duration)} · {r.recipe.snippets.length} snippets
                        {r.recipe.countCapped ? ` (of ${r.recipe.settings.snippetCount}: 42 s reached)` : ''} · {r.recipe.cuePoints.length} cues
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
                    {/* One line, never wrapped: when it runs short the seed gives way (truncated), not the trash can. */}
                    <div className="flex items-center justify-end gap-0.5 ml-auto min-w-0 max-w-full">
                    {!r.kind && (
                    <button onClick={() => applySeed(r.recipe.seed)}
                      className="min-w-[2.5rem] shrink max-w-[6.5rem] truncate font-mono text-[10px] text-gray-500 hover:text-white px-1.5 py-0.5 rounded border border-white/10"
                      title="Use this seed for the next batch">
                      {r.recipe.seed}
                    </button>
                    )}
                    <IconButton title={r.kept ? 'Kept: survives the next batch' : 'Keep'} onClick={() => toggleKeep(r)}
                      className={r.kept ? 'text-synthux-yellow' : 'text-gray-500 hover:text-synthux-yellow'}>
                      <Star size={15} fill={r.kept ? 'currentColor' : 'none'} />
                    </IconButton>
                    <IconButton title="Find its hits: slices and kits straight from this result" onClick={() => { player.stop(); region.stop(); setHitsFor(r); }}
                      className="text-gray-400 hover:text-synthux-red">
                      <Scissors size={15} />
                    </IconButton>
                    <IconButton title="Download WAV" onClick={() => downloadResult(r)} disabled={blocked}
                      className="text-gray-400 hover:text-white">
                      <Download size={15} />
                    </IconButton>
                    {studio ? (
                      <button onClick={() => addToProject([r])} disabled={blocked}
                        title={studio.targetLabel ? `Put it in slot ${studio.targetLabel}` : 'Add it to the project pool'}
                        className="shrink-0 h-8 flex items-center gap-1 px-2 rounded-md text-[11px] font-bold text-synthux-orange
                          border border-synthux-orange/40 hover:bg-synthux-orange/10 transition-colors
                          disabled:opacity-25 disabled:cursor-not-allowed">
                        <Plus size={13} /> {studio.targetLabel ?? 'Project'}
                      </button>
                    ) : (
                      <ActionMenu
                        label="Export"
                        icon={<Share size={13} />}
                        disabled={blocked}
                        align="right"
                        title={blocked ? 'Uses a no-derivatives source: it stays here' : 'Out of the mangler: Studio, Browse, the Spotykach, the M8. The Kept menu does every starred result at once'}
                        tone="plain"
                        labelClassName="max-sm:hidden"
                        items={exportItems([r])}
                      />
                    )}
                    <IconButton title={blocked ? 'Uses a no-derivatives source: it stays here' : 'Into the source pool, to mangle again'}
                      onClick={() => resultToSource(r)} disabled={blocked} className="text-gray-400 hover:text-white">
                      <Import size={15} />
                    </IconButton>
                    <IconButton title="Discard" onClick={() => discard(r.id)} className="text-gray-500 hover:text-synthux-red">
                      <Trash2 size={15} />
                    </IconButton>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1 mb-1.5 text-[10px] [&>*]:whitespace-nowrap">
                    {!r.edited && (
                      <CardAction onClick={() => rerender(r)} disabled={busy} icon={<RefreshCw size={11} />}
                        title="Render this seed again with the sliders as they are now (locked snippets stay)">
                        Same seed, current settings
                      </CardAction>
                    )}
                    {undo[r.id] && (
                      <CardAction onClick={() => undoEdit(r)} disabled={busy} icon={<Undo2 size={11} />}
                        title="Back to the version before the last edit">
                        Undo
                      </CardAction>
                    )}
                    <label className="flex items-center gap-1 px-2 py-0.5 rounded border border-white/10 text-gray-400"
                      title="Where the cue points go. The audio stays the same; only the WAV's cue list changes">
                      Cues
                      {recueing === r.id && <Loader size={10} className="animate-spin" />}
                      <select
                        value={r.recipe.cueSource ?? 'snippets'}
                        disabled={busy || recueing !== null}
                        onChange={e => recue(r, e.target.value as 'snippets' | CueLevel)}
                        className="bg-transparent text-gray-200 text-[10px] cursor-pointer disabled:cursor-not-allowed"
                      >
                        <option value="snippets" className="bg-synthux-panel" disabled={r.edited}>at snippets</option>
                        {CUE_LEVELS.map(l => (
                          <option key={l.value} value={l.value} className="bg-synthux-panel">at hits: {l.label.toLowerCase()}</option>
                        ))}
                      </select>
                    </label>
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
                    {cropping ? (
                      <>
                        <CardAction onClick={() => applyCrop(r, cropping.range)} disabled={busy} active icon={<CropIcon size={11} />}
                          title="Keep only the stretch between the yellow handles">
                          Apply crop ({formatSeconds((cropping.range[1] - cropping.range[0]) * r.duration)})
                        </CardAction>
                        <CardAction onClick={() => setCropEdit(null)} icon={<X size={11} />} title="Leave crop mode">
                          Cancel
                        </CardAction>
                      </>
                    ) : (
                      <CardAction
                        onClick={() => {
                          setZooms(prev => (prev[r.id] !== undefined ? prev : { ...prev, [r.id]: 1 }));
                          setCropEdit({ id: r.id, range: [0, 1] });
                        }}
                        disabled={busy}
                        icon={<CropIcon size={11} />}
                        title="Keep only part of the file. Edits later on keep the same stretch"
                      >
                        Crop
                      </CardAction>
                    )}
                    {r.recipe.crop && !r.edited && !cropping && (
                      <CardAction onClick={() => resetCrop(r)} disabled={busy} icon={<Undo2 size={11} />}
                        title="Render the full length again (needs the sources in the pool)">
                        Full length
                      </CardAction>
                    )}
                    <CardAction onClick={() => openEditor(r)} disabled={busy} icon={<Pencil size={11} />}
                      title="Open a copy in the audio editor (trim, fade, EQ, slices…). Saving there adds an edited copy here; this one stays editable">
                      Editor
                    </CardAction>
                  </div>

                  <ResultWaveform
                    peaks={r.peaks}
                    audio={zoom !== undefined ? region.decoded[r.id] : undefined}
                    cues={r.recipe.cuePoints.map(f => f / frames)}
                    edges={transient && !r.edited ? r.recipe.snippets.map(s => (snippetCue(s) - offset) / frames) : undefined}
                    fades={r.edited ? [] : r.recipe.snippets.filter(s => s.xfade > 0)
                      .map(s => [(s.outStart - offset) / frames, (s.outStart + s.xfade - offset) / frames] as [number, number])}
                    progress={progress}
                    playedFrom={regionHere && !regionHere.full ? regionHere.start / total : 0}
                    highlight={highlight}
                    zoom={zoom}
                    onZoom={z => setZooms(prev => ({ ...prev, [r.id]: z }))}
                    onPick={f => playAt(r, f)}
                    crop={cropping?.range ?? null}
                    onCropChange={range => setCropEdit({ id: r.id, range: [Math.max(0, range[0]), Math.min(1, range[1])] })}
                  />

                  {r.edited ? (
                    <p className="mt-2 text-[10px] text-gray-500">
                      {r.kind === 'synth'
                        ? <>A synth take: make more in <button onClick={() => setStation('synth')} className="underline hover:text-white">Synth</button>.</>
                        : r.kind === 'file'
                        ? <>A file from the source pool, kept as it is. Generate to mangle it.</>
                        : r.kind === 'sequence'
                        ? <>Rendered from the sequencer: change the pattern in <button onClick={() => setStation('sequence')} className="underline hover:text-white">Sequence</button> and render again.</>
                        : <>Edited in the editor, so its snippets can't be changed here. The original result is still editable.</>}
                    </p>
                  ) : (
                  <button onClick={() => setExpanded(isOpen ? null : r.id)}
                    className="mt-2 flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300">
                    {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    Snippets{pitched ? ` · ${pitched} with a pitch` : ''}
                  </button>
                  )}
                  {isOpen && !r.edited && (
                    <SnippetTable
                      entry={r}
                      busy={busy}
                      activeIndex={activeIndex}
                      playingIndex={regionHere ? regionHere.index : -1}
                      onPlay={i => playSnippet(r, i)}
                      onHover={i => setHover(i === null ? null : { id: r.id, index: i })}
                      onDelete={indices => deleteSnippets(r, indices)}
                      onMove={(indices, to) => moveSnippets(r, indices, to)}
                      onToggleLock={i => toggleLock(r, i)}
                      onLock={(indices, lock) => lockSnippets(r, indices, lock)}
                      crop={r.recipe.crop}
                      onPitch={(indices, choice) => setPitch(r, indices, choice)}
                      onReroll={() => rerollUnlocked(r)}
                      variations={variationCount}
                      onToSlices={indices => snippetsToSlices(r, indices)}
                      onJoin={(indices, joined) => joinSnippets(r, indices, joined)}
                    />
                  )}
                </article>
              );
            })}
          </div>

        </section>
      </div>

      {/* Phone and narrow windows: one column at a time, and Generate (or Stop) from any of them. */}
      <nav className="lg:hidden shrink-0 flex items-center border-t border-white/10 bg-synthux-panel pr-2 pb-[env(safe-area-inset-bottom)]">
        {([
          ['sources', <Waves size={18} />, 'Sources', `${enabledSources.length}/${sources.length}`],
          ['settings', <SlidersHorizontal size={18} />, 'Settings', ''],
          ['results', <ListMusic size={18} />, 'Results', busy ? '…' : String(results.length)],
        ] as const).map(([id, icon, label, count]) => (
          <button key={id} onClick={() => setPane(id)} aria-pressed={pane === id}
            className={`flex-1 min-w-0 flex flex-col items-center gap-0.5 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors
              ${pane === id ? 'text-synthux-red' : 'text-gray-500 hover:text-white'}`}>
            {icon}
            <span className="truncate max-w-full">{label}{count && <span className="ml-1 font-mono normal-case text-gray-500">{count}</span>}</span>
          </button>
        ))}
        {busy ? (
          <button onClick={cancelBatch} title="Stop the batch"
            className="shrink-0 flex items-center gap-1.5 px-3 h-10 rounded-full text-xs font-bold border border-white/20 text-gray-300 hover:bg-white/10">
            <X size={14} /> Stop
          </button>
        ) : (
          <button onClick={() => { setPane('results'); generate(); }} disabled={enabledSources.length === 0}
            title={enabledSources.length ? `Generate ${variationCount} variation${variationCount === 1 ? '' : 's'}` : 'Switch on a source first'}
            className="shrink-0 flex items-center gap-1.5 px-3.5 h-10 rounded-full text-xs font-bold bg-synthux-red text-white
              shadow-lg shadow-synthux-red/30 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
            <Dices size={15} /> <span className="max-[379px]:hidden">Generate</span> {variationCount}
          </button>
        )}
      </nav>
      </>}
      </div>

      {tourOpen && <ManglerTour onClose={closeTour} onStep={tourStep} />}

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
                      try { await addFromUrl(sample.url, sample.name, sample.origin || origin, sample.license ?? license, sample.path); } catch { /* next */ }
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

      {partsFor && (() => {
        const source = sources.find(x => x.id === partsFor);
        if (!source) return null;
        return (
          <SourcePartsModal
            source={source}
            load={region.load}
            playRegion={region.playRegion}
            stop={region.stop}
            playing={region.playing}
            position={region.position}
            onClose={() => setPartsFor(null)}
            onKit={hits => { setPartsFor(null); makeKit(hits.map(([start, end]) => ({ sourceId: source.id, spec: { start, end } })), source.name); }}
            onSlices={items => hitsToSlices(source, items)}
            onSave={(parts: Part[]) => {
              const next = { ...source, regions: parts.length ? parts : undefined };
              setSources(prev => prev.map(x => (x.id === source.id ? next : x)));
              putMangleSourceToDB(next).catch(e => console.error(e));
              setPartsFor(null);
              showToast(parts.length
                ? `${source.name}: ${parts.length} part${parts.length === 1 ? '' : 's'} in use`
                : `${source.name}: the whole file is in use`, 'success');
            }}
          />
        );
      })()}

      {hitsFor && (
        <SourcePartsModal
          source={{ id: hitsFor.id, name: hitsFor.name, origin: 'Sample Mangler', blob: hitsFor.blob, duration: hitsFor.duration, enabled: false, addedAt: hitsFor.createdAt }}
          load={region.load}
          playRegion={region.playRegion}
          stop={region.stop}
          playing={region.playing}
          position={region.position}
          onClose={() => setHitsFor(null)}
          onKit={async hits => {
            const r = hitsFor;
            setHitsFor(null);
            const source = await sourceOfResult(r);
            makeKit(hits.map(([start, end]) => ({ sourceId: source.id, spec: { start, end } })), r.name);
          }}
          onSlices={async items => hitsToSlices(await sourceOfResult(hitsFor), items)}
        />
      )}

      {editing && (
        <Suspense fallback={
          <div className="fixed inset-0 z-[80] bg-synthux-main flex items-center justify-center text-gray-500">
            <Loader size={20} className="animate-spin" />
          </div>
        }>
          <LooseFileEditor
            key={editing.id}
            file={{
              name: `${editing.name}.wav`,
              blob: editing.blob,
              duration: editing.duration,
              origin: 'Sample Mangler',
              license: resultLicense(editing.recipe).text,
              metadata: { slicePoints: editing.recipe.cuePoints.map(f => f / SR), name: editing.name },
            }}
            subtitle={`Editing a copy of ${editing.name}. "Save as new result" puts it next to the original in the mangler.`}
            commitLabels={MANGLER_COMMIT_LABELS}
            destination="the mangler"
            noMangler
            onEdited={({ blob, duration }) => saveEditedCopy(editing, blob, duration)}
            onClose={() => { setEditing(null); editedCopyRef.current = null; }}
          />
        </Suspense>
      )}

      {editingSlice && (
        <Suspense fallback={null}>
          <LooseFileEditor
            key={`slice-${editingSlice.id}`}
            file={{
              name: `${editingSlice.name}.wav`,
              blob: editingSlice.blob,
              duration: editingSlice.duration,
              origin: 'Sample Mangler',
              license: editingSlice.license,
              metadata: { name: editingSlice.name },
            }}
            subtitle={`Editing the slice ${editingSlice.name}. "Replace the slice" makes it this sound; its source stays as it is.`}
            commitLabels={SLICE_COMMIT_LABELS}
            destination="the slice"
            noMangler
            onEdited={({ blob }) => saveEditedSlice(editingSlice.id, blob)}
            onClose={() => setEditingSlice(null)}
          />
        </Suspense>
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

      {card && (
        <CardDialog
          mode={card.mode}
          items={card.mode === 'send' ? card.items : undefined}
          onClose={() => setCard(null)}
          onSent={where => showToast(`Sent to ${where.join(', ')} on the Spotykach`, 'success')}
          onImport={importFromCard}
        />
      )}

      {projectDialog && (
        <ProjectDialog
          mode={projectDialog}
          canFolder={canPickFolder()}
          workspaceName={knownWorkspace?.name ?? null}
          defaultName={projectName ?? `mangler ${new Date().toISOString().slice(0, 10)}`}
          busy={projectBusy}
          projects={folderProjects}
          onListProjects={listProjects}
          onSaveFolder={saveProjectFolder}
          onSaveZip={saveProjectZip}
          onOpenFolder={openProjectFolder}
          onOpenZip={openProjectZip}
          onClose={() => setProjectDialog(null)}
        />
      )}

      <ConfirmModal
        isOpen={confirmFresh}
        onClose={() => setConfirmFresh(false)}
        onConfirm={() => { setConfirmFresh(false); startFresh(); }}
        title="Start fresh"
        message={`This empties the source pool (${sources.length}), the results (${results.length}, kept ones too), the slice pool (${slices.length}), the synth takes and the sequence. Settings stay. Save it as a project first (Project › Save) if you want to come back to it.`}
        confirmLabel="Empty everything"
        isDestructive
      />

      <ConfirmModal
        isOpen={confirmRemoveEnabled}
        onClose={() => setConfirmRemoveEnabled(false)}
        onConfirm={() => { setConfirmRemoveEnabled(false); removeEnabledSources(); }}
        title="Remove the switched-on sources"
        message={`${shownSources.filter(s => s.enabled).length} source${shownSources.filter(s => s.enabled).length === 1 ? '' : 's'} will be removed from the pool${shownSources.length < sources.length ? ' (only those the filter shows)' : ''}, with the slices cut from them and their place in the sequencer. Results made from them are kept.`}
        confirmLabel="Remove"
        isDestructive
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

/** A button with a short menu under it; a click elsewhere or Escape closes it. */
const ActionMenu: React.FC<{
  label: string; icon: React.ReactNode; title: string; disabled?: boolean;
  items: { label: string; icon: React.ReactNode; onClick: () => void }[];
  /** Which edge the menu lines up with. */
  align?: 'left' | 'right';
  /** yellow: the Kept menu; plain: a card's own buttons. */
  tone?: 'yellow' | 'plain';
  /** Classes for the label, e.g. to show only the icon on a narrow screen. */
  labelClassName?: string;
}> = ({ label, icon, title, disabled, items, align = 'left', tone = 'yellow', labelClassName }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEscapeLayer(open, () => { setOpen(false); return true; });
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)} disabled={disabled} title={title} aria-expanded={open}
        className={`flex items-center gap-1 rounded border disabled:border-white/10 disabled:text-gray-600 disabled:hover:bg-transparent disabled:cursor-default ${tone === 'yellow'
          ? 'px-2 py-0.5 border-synthux-yellow/40 text-synthux-yellow hover:bg-synthux-yellow/10'
          : 'h-8 px-2 text-[11px] font-bold border-white/10 text-gray-300 hover:text-white hover:bg-white/5'}`}>
        {icon} <span className={labelClassName}>{label}</span> <ChevronDown size={12} />
      </button>
      {open && (
        <div className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} top-full mt-1 z-40 min-w-[220px] py-1 rounded-lg border border-white/10 bg-synthux-panel shadow-2xl`}>
          {items.map(it => (
            <button key={it.label} onClick={() => { setOpen(false); it.onClick(); }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-200 hover:bg-white/10">
              <span className="text-gray-400">{it.icon}</span> {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const IconButton: React.FC<{
  title: string; onClick: () => void; className: string; children: React.ReactNode; disabled?: boolean;
}> = ({ title, onClick, className, children, disabled }) => (
  <button onClick={onClick} title={title} aria-label={title} disabled={disabled}
    className={`shrink-0 h-8 w-8 flex items-center justify-center rounded-md hover:bg-white/5 transition-colors
      disabled:opacity-25 disabled:cursor-not-allowed ${className}`}>
    {children}
  </button>
);

/** A result's name: click it to type a new one. Enter or leaving the field keeps it, Esc doesn't. */
const ResultName: React.FC<{ name: string; disabled?: boolean; onRename: (name: string) => void }> = ({ name, disabled, onRename }) => {
  const [draft, setDraft] = useState<string | null>(null);
  // Enter closes the field, and the blur that may follow must not rename again.
  const open = useRef(false);
  if (draft === null) {
    return (
      <button onClick={() => { open.current = true; setDraft(name); }} disabled={disabled} title="Rename"
        className="min-w-0 truncate text-left rounded hover:bg-white/5 hover:text-white disabled:cursor-default disabled:hover:bg-transparent">
        {name}
      </button>
    );
  }
  const done = (keep: boolean) => {
    if (!open.current) return;
    open.current = false;
    if (keep) onRename(draft);
    setDraft(null);
  };
  return (
    <input autoFocus value={draft} maxLength={64} aria-label="Result name"
      onFocus={e => e.currentTarget.select()}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => done(true)}
      onKeyDown={e => {
        if (e.key === 'Enter') done(true);
        else if (e.key === 'Escape') { e.stopPropagation(); done(false); }
      }}
      className="min-w-0 flex-1 bg-black/40 border border-white/20 rounded px-1 text-xs font-bold text-white outline-none focus:border-synthux-blue" />
  );
};

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

export default MangleMode;
