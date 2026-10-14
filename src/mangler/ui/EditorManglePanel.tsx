import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Dices, ExternalLink, Loader, RotateCcw, Square, Undo2 } from 'lucide-react';
import { encodeWAV } from '../../lib/audio/wavEncoder';
import { appStorage } from '../../utils/storageNamespace';
import { runBatch, type BatchHandle } from '../batch';
import { withChoice } from '../pitchChoice';
import { recipeFromResult, type MangleRecipe, type RecipeSource } from '../recipe';
import { randomSeed } from '../rng';
import { DEFAULT_SETTINGS, MAX_CUE_POINTS, OUTPUT_MAX_SECONDS, PRESETS, sanitizeSettings, type MangleSettings } from '../settings';
import { MANGLE_SAMPLE_RATE as SR, type MangleResult, type PitchChoice, type SnippetInfo } from '../render';
import { SnippetTable } from './SnippetTable';
import { SettingsPanel } from './SettingsPanel';
import { rollAll } from '../randomize';

/**
 * The mangler as one of the editor's tools: random snippets of the open file only,
 * joined into a new take. A take plays in the editor's waveform; Apply makes it the
 * file's next version. Mixing in other sounds is the full Mangler's job.
 *
 * The take keeps its recipe, so its snippets can be listed and edited like a
 * result in the full Mangler: played one by one, removed, moved, locked,
 * repitched. Each edit renders the take again and can be undone once.
 */

/** Only one source here: these make no sense. */
const HIDDEN = ['sourceMix', 'maxPerSource', 'variations'] as const;

const SETTINGS_KEY = 'editor_mangle_settings';
const LIST_OPEN_KEY = 'editor_mangle_list_open';

/** A take and how it was made. */
interface Take {
    recipe: MangleRecipe;
    locked?: number[];
    blob: Blob;
    duration: number;
    description: string;
}

/** Where a snippet takes over: the middle of its incoming crossfade. */
const snippetCue = (s: SnippetInfo) => s.outStart + (s.xfade >> 1);

const loadSettings = (): MangleSettings => {
    try {
        return sanitizeSettings(JSON.parse(appStorage.getItem(SETTINGS_KEY) ?? 'null'));
    } catch {
        return DEFAULT_SETTINGS;
    }
};

/** One source, one take: no mixing, no per-source cap. The length is the take's own. */
const fullSettings = (settings: MangleSettings, outputSeconds: number): MangleSettings => sanitizeSettings({
    ...settings,
    outputSeconds,
    maxPerSource: 0,
    variations: 1,
});

/**
 * A take made of the slicer's slices: one snippet per slice, in order, as they
 * are (no crossfade, no gain, no declick), and as many as there are slices, so
 * deleting one makes the take shorter instead of refilling it.
 */
const slicesAsSnippets = (points: number[], seconds: number): SnippetInfo[] => {
    const total = Math.round(seconds * SR);
    const bounds = [...new Set([0, ...points.map(t => Math.round(t * SR)).filter(f => f > 0 && f < total), total])]
        .sort((a, b) => a - b);
    return bounds.slice(0, -1)
        .map((start, i) => ({ start, length: bounds[i + 1] - start }))
        .filter(b => b.length >= 2)
        .map(({ start, length }) => ({
            source: 0, sourceStart: start, sourceLength: length, outStart: 0, length, xfade: 0,
            reverse: false, measuredDb: 0, gainDb: 0, pitch: null, shift: 0, rerolls: 0,
        }));
};

const sliceSettings = (count: number): MangleSettings => sanitizeSettings({
    ...DEFAULT_SETTINGS,
    fillMode: 'count',
    snippetCount: count,
    xfadeMinMs: 0,
    xfadeMaxMs: 0,
    hardCuts: true,
    loop: false,
    limiter: false,
    repitch: 'off',
    detuneSt: 0,
    maxPerSource: 0,
    cuePoints: true,
    variations: 1,
});

const heading = 'text-[10px] font-bold uppercase tracking-widest text-gray-500';

interface EditorManglePanelProps {
    /** The file's current audio: the only source. */
    blob: Blob | null;
    /** Changes with the version, so the decode cache never serves an old one. */
    sourceKey: string;
    sourceSeconds: number;
    /** Written into the take's WAV, so it stays the same file on the card. */
    fileId?: string;
    name: string;
    /** A take is loaded in the waveform and not applied yet. */
    hasTake: boolean;
    disabled: boolean;
    /** `cues` in seconds: drawn on the waveform while the take is loaded. */
    onTake: (blob: Blob, duration: number, description: string, cues: number[]) => void;
    onApply: () => void;
    onDiscard: () => void;
    /** The full Mangler, over the whole project. */
    onOpenFullMangler?: () => void;
    /** Slice markers (seconds) sent over from the Slicer: made into a take once, per `key`. */
    importSlices?: { points: number[]; key: number } | null;
    onImportUsed?: () => void;
    /** The editor's playhead, seconds, and whether it is moving: the list follows it. */
    playhead: number;
    isPlaying: boolean;
    /** Plays `[start, end)` seconds of the take in the editor's waveform. */
    onAudition: (start: number, end: number) => void;
    onStopAudition: () => void;
    /** Marks a stretch of the waveform (a hovered snippet), or clears it. */
    onHighlight: (range: [number, number] | null) => void;
    setHelpText: (text: string) => void;
    showToast: (message: string, type?: 'success' | 'error' | 'warning') => void;
}

export function EditorManglePanel({
    blob, sourceKey, sourceSeconds, fileId, name, hasTake, disabled,
    onTake, onApply, onDiscard, onOpenFullMangler, importSlices, onImportUsed, playhead, isPlaying, onAudition, onStopAudition, onHighlight,
    setHelpText, showToast,
}: EditorManglePanelProps) {
    const [settings, setSettings] = useState<MangleSettings>(loadSettings);
    // The take's length is the file's own until changed: the tool reworks this sound, it doesn't stretch it.
    const [seconds, setSeconds] = useState(() => Math.min(OUTPUT_MAX_SECONDS, Math.max(1, Math.round(sourceSeconds * 10) / 10)));
    const [rendering, setRendering] = useState<number | null>(null);
    const batch = useRef<BatchHandle | null>(null);
    const [take, setTake] = useState<Take | null>(null);
    /** The take before the last edit: one step back. */
    const [undo, setUndo] = useState<Take | null>(null);
    const [auditioning, setAuditioning] = useState<number | null>(null);
    const [listOpen, setListOpen] = useState(() => appStorage.getItem(LIST_OPEN_KEY) !== '0');

    // Applied or discarded by the editor: the take (and its undo) are gone.
    useEffect(() => {
        if (!hasTake) { setTake(null); setUndo(null); }
    }, [hasTake]);
    useEffect(() => { if (!isPlaying) setAuditioning(null); }, [isPlaying]);
    useEffect(() => () => onHighlight(null), [onHighlight]);
    useEffect(() => {
        try { appStorage.setItem(LIST_OPEN_KEY, listOpen ? '1' : '0'); } catch { /* not remembered */ }
    }, [listOpen]);

    useEffect(() => {
        try { appStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* not remembered, still works */ }
    }, [settings]);
    useEffect(() => () => batch.current?.cancel(), []);

    // The length belongs to this file, not to the remembered settings.
    const update = (patch: Partial<MangleSettings>) => {
        if (patch.outputSeconds !== undefined) setSeconds(patch.outputSeconds);
        setSettings(prev => sanitizeSettings({ ...prev, ...patch, outputSeconds: prev.outputSeconds }));
    };

    const toWav = useCallback((result: MangleResult): Blob => {
        const buffer = new AudioBuffer({ length: result.left.length, numberOfChannels: 2, sampleRate: result.sampleRate });
        buffer.copyToChannel(result.left as Float32Array<ArrayBuffer>, 0);
        buffer.copyToChannel(result.right as Float32Array<ArrayBuffer>, 1);
        return encodeWAV(buffer, {
            id: fileId,
            name,
            slicePoints: result.cuePoints.map(f => f / result.sampleRate),
            processing: ['mangled'],
        });
    }, [fileId, name]);

    const recipeSources = useMemo((): RecipeSource[] => [{ id: sourceKey, name, origin: 'editor' }], [sourceKey, name]);

    const publish = (t: Take) => {
        setTake(t);
        onTake(t.blob, t.duration, t.description, t.recipe.cuePoints.map(f => f / SR));
    };

    /**
     * Renders a take. With `fixed`, the snippets in it stay as they are and only the
     * empty places are drawn: that is how the list edits one. An edit can be undone.
     */
    const renderTake = (settings: MangleSettings, seed: number, options: {
        fixed?: (SnippetInfo | null)[]; locked?: number[]; edit?: boolean;
    } = {}) => {
        if (!blob || rendering !== null) return;
        const before = take;
        setRendering(0);
        onStopAudition();
        batch.current = runBatch([{ id: sourceKey, blob }], settings, [seed], {
            onProgress: (_i, fraction) => setRendering(fraction),
            onResult: (_i, result) => {
                setUndo(options.edit ? before : null);
                publish({
                    recipe: recipeFromResult(result, settings, recipeSources),
                    locked: options.locked?.length ? options.locked : undefined,
                    blob: toWav(result),
                    duration: result.left.length / result.sampleRate,
                    description: `Mangled (${result.snippets.length} snippets)`,
                });
            },
            onDone: () => { batch.current = null; setRendering(null); },
            onError: (message) => {
                batch.current = null;
                setRendering(null);
                showToast(`Mangle failed: ${message}`, 'error');
            },
        }, options.fixed);
    };

    const mangle = () => renderTake(fullSettings(settings, seconds), randomSeed());

    /** The take again with its snippets in this order (old indices); locks follow their snippets. */
    const reorder = (order: number[]) => {
        if (!take) return;
        const { recipe } = take;
        const wasLocked = new Set(take.locked ?? []);
        renderTake(recipe.settings, recipe.seed, {
            fixed: order.map(i => recipe.snippets[i]),
            locked: order.map((old, now) => (wasLocked.has(old) ? now : -1)).filter(i => i >= 0),
            edit: true,
        });
    };

    /**
     * A random take: the rest move up and the end is refilled. A take of slices
     * (count mode) just gets shorter.
     */
    const deleteSnippets = (indices: number[]) => {
        if (!take) return;
        const { recipe } = take;
        const gone = new Set(indices);
        const order = recipe.snippets.map((_, i) => i).filter(i => !gone.has(i));
        if (!order.length) return;
        if (recipe.settings.fillMode !== 'count') { reorder(order); return; }
        const wasLocked = new Set(take.locked ?? []);
        renderTake({ ...recipe.settings, snippetCount: order.length }, recipe.seed, {
            fixed: order.map(i => recipe.snippets[i]),
            locked: order.map((old, now) => (wasLocked.has(old) ? now : -1)).filter(i => i >= 0),
            edit: true,
        });
    };

    /** Moves the snippets together, in their own order: after the drop row going down, before it going up. */
    const moveSnippets = (indices: number[], to: number) => {
        if (!take) return;
        const moving = [...new Set(indices)].sort((a, b) => a - b);
        const set = new Set(moving);
        const rest = take.recipe.snippets.map((_, i) => i).filter(i => !set.has(i));
        const at = rest.filter(i => (to > moving[0] ? i <= to : i < to)).length;
        const order = [...rest.slice(0, at), ...moving, ...rest.slice(at)];
        if (!order.every((old, now) => old === now)) reorder(order);
    };

    const setPitch = (indices: number[], choice: PitchChoice | undefined) => {
        if (!take) return;
        const { recipe } = take;
        const targets = new Set(indices);
        renderTake(recipe.settings, recipe.seed, {
            fixed: recipe.snippets.map((sn, i) => (targets.has(i) ? withChoice(sn, choice, recipe.settings) : sn)),
            locked: take.locked,
            edit: true,
        });
    };

    /** Locks change nothing audible, so they are not an edit: no render, no undo step. */
    const lock = (indices: number[], on: boolean) => {
        if (!take) return;
        const current = new Set(take.locked ?? []);
        for (const i of indices) if (on) current.add(i); else current.delete(i);
        setTake({ ...take, locked: current.size ? [...current].sort((a, b) => a - b) : undefined });
    };

    /** A new take around the locked snippets, with the sliders as they are now. */
    const rerollRest = () => {
        const held = take?.locked;
        if (!take || !held?.length) return;
        renderTake(fullSettings(settings, seconds), randomSeed(), {
            fixed: take.recipe.snippets.map((sn, i) => (held.includes(i) ? sn : null)),
            locked: held,
            edit: true,
        });
    };

    // Slices from the Slicer: one take of them, as they are, then the list edits it.
    const importKey = importSlices?.key;
    useEffect(() => {
        if (!importSlices || !blob) return;
        onImportUsed?.();
        if (sourceSeconds > OUTPUT_MAX_SECONDS) {
            showToast(`The Mangler works up to ${OUTPUT_MAX_SECONDS} s; trim the file first`, 'warning');
            return;
        }
        let fixed = slicesAsSnippets(importSlices.points, sourceSeconds);
        if (fixed.length > MAX_CUE_POINTS) {
            showToast(`Only the first ${MAX_CUE_POINTS} slices fit`, 'warning');
            fixed = fixed.slice(0, MAX_CUE_POINTS);
        }
        renderTake(sliceSettings(fixed.length), randomSeed(), { fixed });
        // Once per send, whatever else changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [importKey]);

    const undoEdit = () => {
        if (!undo || rendering !== null) return;
        onStopAudition();
        setUndo(null);
        publish(undo);
    };

    /** Plays one snippet, crossfades and all; the same row again stops it. */
    const audition = (index: number) => {
        const sn = take?.recipe.snippets[index];
        if (!take || !sn) return;
        if (auditioning === index && isPlaying) {
            onStopAudition();
            setAuditioning(null);
            return;
        }
        setAuditioning(index);
        onAudition(sn.outStart / SR, Math.min(take.duration, (sn.outStart + sn.length) / SR));
    };

    const cancel = () => {
        batch.current?.cancel();
        batch.current = null;
        setRendering(null);
    };

    const hint = (text: string) => ({ onMouseEnter: () => setHelpText(text), onMouseLeave: () => setHelpText('') });
    const busy = disabled || rendering !== null;

    // The row under the playhead while it plays. The table is memoised on it, so
    // a moving playhead redraws it only when it crosses into another snippet.
    const activeIndex = useMemo(() => {
        if (!take || !isPlaying) return -1;
        const frame = playhead * SR;
        let index = -1;
        take.recipe.snippets.forEach((sn, i) => { if (snippetCue(sn) <= frame) index = i; });
        return index;
    }, [take, isPlaying, playhead]);
    const playingIndex = isPlaying && auditioning !== null ? auditioning : -1;

    const hover = (index: number | null) => {
        const sn = index === null ? undefined : take?.recipe.snippets[index];
        onHighlight(sn ? [sn.outStart / SR, (sn.outStart + sn.length) / SR] : null);
    };

    // The table is rebuilt only when what it shows changes; its handlers go through
    // this ref, so they always act on the current take.
    const handlers = useRef({ audition, hover, deleteSnippets, moveSnippets, lock, setPitch, rerollRest });
    handlers.current = { audition, hover, deleteSnippets, moveSnippets, lock, setPitch, rerollRest };
    const table = useMemo(() => take && (
        <SnippetTable
            entry={take}
            busy={busy}
            activeIndex={activeIndex}
            playingIndex={playingIndex}
            onPlay={i => handlers.current.audition(i)}
            onHover={i => handlers.current.hover(i)}
            onDelete={indices => handlers.current.deleteSnippets(indices)}
            onMove={(indices, to) => handlers.current.moveSnippets(indices, to)}
            onToggleLock={i => handlers.current.lock([i], !take.locked?.includes(i))}
            onLock={(indices, on) => handlers.current.lock(indices, on)}
            onPitch={(indices, choice) => handlers.current.setPitch(indices, choice)}
            onReroll={() => handlers.current.rerollRest()}
            variations={1}
        />
    ), [take, busy, activeIndex, playingIndex]);

    return (
        <div className="grid gap-x-8 gap-y-4 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(14rem,16rem)] py-1">
            <SettingsPanel settings={{ ...settings, outputSeconds: seconds }} onChange={update} hide={HIDDEN}
                storageKey="editor_mangle_groups" initiallyClosed={['tempo', 'loudness', 'envelope', 'pitch']} lengthStep={0.1}
                onHint={setHelpText} className="min-w-0 columns-[17rem] gap-3 [&>section]:mb-3" />

            <section className="space-y-3 min-w-0">
                <h3 className={heading}>Take</h3>
                <div className="flex flex-wrap gap-1" {...hint('Starting points for the settings')}>
                    {['Default', ...Object.keys(PRESETS)].map(p => (
                        <button key={p}
                            onClick={() => setSettings(p === 'Default' ? DEFAULT_SETTINGS : sanitizeSettings({ ...DEFAULT_SETTINGS, ...PRESETS[p] }))}
                            className="px-2 py-1 rounded-md text-[11px] font-bold border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                        >{p}</button>
                    ))}
                    <button onClick={() => setSettings(prev => rollAll(prev))} {...hint('Surprise: roll every group of settings at once')}
                        className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold border border-white/10 text-gray-400 hover:text-synthux-red hover:bg-white/5 transition-colors">
                        <Dices size={12} /> Surprise
                    </button>
                </div>
                {rendering !== null ? (
                    <button onClick={cancel} {...hint('Stop rendering')}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-bold uppercase tracking-wider bg-synthux-red text-white">
                        <Loader size={14} className="animate-spin" /> {Math.round(rendering * 100)}% <Square size={11} />
                    </button>
                ) : (
                    <button onClick={mangle} disabled={busy || !blob}
                        {...hint(hasTake ? 'Roll a different take' : 'Make a take from snippets of this file and play it')}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-bold uppercase tracking-wider transition-colors bg-synthux-red/80 hover:bg-synthux-red text-white disabled:opacity-50 disabled:cursor-not-allowed">
                        <Dices size={14} /> {hasTake ? 'Again' : 'Mangle'}
                    </button>
                )}
                <div className="grid grid-cols-2 gap-2">
                    <button onClick={onApply} disabled={!hasTake || busy} {...hint('Keep this take as the next version of the file')}
                        className={`flex items-center justify-center gap-2 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-colors border ${!hasTake || busy
                            ? 'bg-gray-900 border-gray-800 text-gray-600 cursor-not-allowed opacity-50'
                            : 'bg-gray-800 hover:bg-gray-700 border-gray-700 text-green-400 hover:text-green-300 hover:border-green-800'}`}>
                        <Check size={12} /> Apply
                    </button>
                    <button onClick={onDiscard} disabled={!hasTake || busy} {...hint('Drop the take and go back to the file')}
                        className={`flex items-center justify-center gap-2 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-colors ${!hasTake || busy
                            ? 'opacity-50 cursor-not-allowed bg-gray-900 text-gray-600 border border-gray-800'
                            : 'bg-gray-800 hover:bg-red-900/50 text-red-400 border border-transparent hover:border-red-900/30'}`}>
                        <RotateCcw size={12} /> Discard
                    </button>
                </div>
                <p className="text-[10px] leading-snug text-gray-500">
                    Apply saves the take with a cue point at each snippet, inside the WAV. They become the file's
                    slice markers, so the Slicer shows them; editing slices there replaces these cues. The Slicer's
                    {' '}<span className="text-gray-400">Edit in Mangler</span> brings slices back here to rearrange.
                </p>
                {onOpenFullMangler && (
                    <button onClick={onOpenFullMangler} {...hint('Mangle this file together with other sounds, in the full Sample Mangler')}
                        className="flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-synthux-red transition-colors">
                        Mangle with other sounds <ExternalLink size={11} />
                    </button>
                )}
            </section>

            {take && (
                <section className="col-span-full min-w-0 border-t border-gray-800 pt-3">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setListOpen(o => !o)}
                            className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-gray-500 hover:text-gray-300">
                            {listOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                            Snippets ({take.recipe.snippets.length}) · {take.recipe.cuePoints.length} cues
                            {take.recipe.cuesCapped ? ' (capped)' : ''}
                        </button>
                        {undo && (
                            <button onClick={undoEdit} disabled={busy} {...hint('Back to the take before the last edit')}
                                className="flex items-center gap-1 px-2 py-0.5 rounded border border-white/10 text-[10px] text-gray-400 hover:text-white hover:bg-white/5 disabled:opacity-30">
                                <Undo2 size={11} /> Undo
                            </button>
                        )}
                    </div>
                    {listOpen && table}
                </section>
            )}
        </div>
    );
}
