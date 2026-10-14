import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Dices, Lock, Unlock } from 'lucide-react';
import { rollGroupInStyle } from '../randomize';
import { ScrubNumber } from '../../components/ScrubNumber';
import { NOTE_NAMES } from '../pitch';
import { appStorage } from '../../utils/storageNamespace';
import {
    ATTACK_MAX_MS, BPM_MAX, BPM_MIN, MAX_LAYERS, OVERLAP_MAX_PCT, DECAY_MAX_MS, DECAY_MIN_MS, STEPS_MAX, barSeconds, maxBars, OUTPUT_MAX_SECONDS, SCALES, SNIPPET_MAX_MS, SNIPPET_MIN_MS, SOFT_MAX_DB, XFADE_MAX_MS,
    maskFromIntervals, scaleName, type MangleSettings,
} from '../settings';
import { DensityContext, type Density } from './density';
import { formatMs, formatSeconds } from './format';
import { ScaleKeys } from './ScaleKeys';
import { RangeSlider, Segmented, Slider, Toggle } from './Sliders';

/**
 * The mangler's settings, written once for both hosts: the full Sample Mangler
 * (a column) and the editor's Mangle tool (a row of columns). Each group folds
 * away and shows a one-line summary when folded; the fold state is remembered
 * per host. A host leaves out what makes no sense there (`hide`), e.g. the
 * source mix when there is only one source.
 */

export type SettingsGroup = 'shape' | 'tempo' | 'loudness' | 'envelope' | 'pitch' | 'file';

interface SettingsPanelProps {
    settings: MangleSettings;
    onChange: (patch: Partial<MangleSettings>) => void;
    /** Fields this host doesn't offer. */
    hide?: readonly (keyof MangleSettings)[];
    /** Where the fold state is kept. */
    storageKey: string;
    /** Folded the first time, before anything is remembered. */
    initiallyClosed?: readonly SettingsGroup[];
    /** Step of the output length slider, in seconds. */
    lengthStep?: number;
    /** Hints go here (the editor's help line) instead of a tooltip. */
    onHint?: (text: string) => void;
    /** Compact (the default): one row per slider, tighter groups. */
    density?: Density;
    className?: string;
    /** Groups the dice and presets leave alone. With `onLock`, each group gets a lock next to its dice. */
    locked?: readonly SettingsGroup[];
    onLock?: (group: SettingsGroup, locked: boolean) => void;
    /** The style (a preset) the group dice stay near. */
    style?: Partial<MangleSettings> | null;
}

/**
 * The typical length of `count` snippets: the median of the log-uniform pick
 * (skewed by the bias), less the median crossfade. A guide, not a promise.
 */
const countEstimate = (s: MangleSettings, count: number) => {
    const u = Math.pow(0.5, Math.pow(4, -s.bias));
    const median = Math.exp(Math.log(s.snippetMinMs) + u * (Math.log(s.snippetMaxMs) - Math.log(s.snippetMinMs)));
    const xfade = (s.xfadeMinMs + s.xfadeMaxMs) / 2;
    const seconds = Math.max(0, count * median - (count - 1) * Math.min(xfade, median / 2)) / 1000;
    return seconds >= OUTPUT_MAX_SECONDS ? '42 s (full)' : `~${formatSeconds(seconds)}`;
};

const range = (lo: number, hi: number) => (lo === hi ? formatMs(lo) : `${formatMs(lo)}–${formatMs(hi)}`);

const summaries: Record<SettingsGroup, (s: MangleSettings) => string> = {
    shape: s => (s.grid ? ['on the grid'] : [
        s.fillMode === 'length' ? `${s.outputSeconds} s` : `${s.snippetCount} snippets`,
        range(s.snippetMinMs, s.snippetMaxMs),
        s.polyphony ? `poly ×${s.maxLayers}` : '',
    ]).concat(`rev ${Math.round(s.reverseProbability * 100)}%`).filter(Boolean).join(' · '),
    tempo: s => (s.grid
        ? `${s.bpm} bpm · ${s.division} · ${s.bars} bar${s.bars === 1 ? '' : 's'} · ${s.stepsMin === s.stepsMax ? s.stepsMin : `${s.stepsMin}–${s.stepsMax}`} steps`
        : 'off'),
    loudness: s => [
        `${s.loudnessTargetDb} dBFS`, s.loudnessSpreadDb ? `± ${s.loudnessSpreadDb} dB` : '',
        s.restProbability ? `rests ${Math.round(s.restProbability * 100)}%` : '',
        s.softProbability ? `soft ${Math.round(s.softProbability * 100)}%` : '',
        s.limiter ? 'limiter' : '',
    ]
        .filter(Boolean).join(' · '),
    envelope: s => (s.envelope
        ? `A ${range(s.attackMinMs, s.attackMaxMs)} · D ${range(s.decayMinMs, s.decayMaxMs)}`
        : 'off'),
    pitch: s => [
        s.repitch === 'off' ? 'no repitch' : s.repitch,
        `${NOTE_NAMES[s.scaleRoot]} ${scaleName(s.scaleMask) ?? 'custom'}`,
        s.detuneSt ? `± ${s.detuneSt} st` : '',
    ].filter(Boolean).join(' · '),
    file: s => [s.cuePoints ? 'cues' : 'no cues', s.loop ? 'loop' : ''].filter(Boolean).join(' · '),
};

const TITLES: Record<SettingsGroup, string> = { shape: 'Shape', tempo: 'Tempo grid', loudness: 'Loudness', envelope: 'Envelope', pitch: 'Pitch', file: 'File' };

/** A range's two ends as drag-to-change fields; each keeps to its side of the other. */
const RangeReadout = ({ low, high, min, max, label, onChange }: {
    low: number; high: number; min: number; max: number; label: string;
    onChange: (low: number, high: number) => void;
}) => (
    <span className="flex items-center gap-1">
        <ScrubNumber value={low} min={min} max={high} scale="log" unit="ms" width="w-[5rem]" ariaLabel={`${label}, shortest`}
            onChange={v => onChange(v, high)} />
        <span className="text-gray-600 text-[10px]">–</span>
        <ScrubNumber value={high} min={low} max={max} scale="log" unit="ms" width="w-[5rem]" ariaLabel={`${label}, longest`}
            onChange={v => onChange(low, v)} />
    </span>
);

const loadOpen = (key: string, closed: readonly SettingsGroup[]): Record<SettingsGroup, boolean> => {
    const fallback = { shape: true, tempo: true, loudness: true, envelope: true, pitch: true, file: true };
    for (const g of closed) fallback[g] = false;
    try {
        return { ...fallback, ...JSON.parse(appStorage.getItem(key) ?? 'null') };
    } catch {
        return fallback;
    }
};

export function SettingsPanel({
    settings: s, onChange, hide = [], storageKey, initiallyClosed = [], lengthStep = 1, onHint, density = 'compact', className,
    locked = [], onLock, style = null,
}: SettingsPanelProps) {
    const [open, setOpen] = useState(() => loadOpen(storageKey, initiallyClosed));
    useEffect(() => {
        try { appStorage.setItem(storageKey, JSON.stringify(open)); } catch { /* not remembered */ }
    }, [open, storageKey]);

    const shown = (key: keyof MangleSettings) => !hide.includes(key);
    const set = <K extends keyof MangleSettings>(key: K) => (value: MangleSettings[K]) => onChange({ [key]: value } as Partial<MangleSettings>);

    /** A hint as the host wants it: the help line on hover, or a tooltip. */
    const tip = (text: string) => (onHint
        ? { onMouseEnter: () => onHint(text), onMouseLeave: () => onHint('') }
        : { title: text });

    const group = (id: SettingsGroup, children: React.ReactNode, title = TITLES[id]) => (
        <section className="rounded-lg border border-white/5 bg-white/[0.02] min-w-0 break-inside-avoid">
            <div className="flex items-center">
                <button
                    onClick={() => setOpen(o => ({ ...o, [id]: !o[id] }))}
                    aria-expanded={open[id]}
                    className="min-w-0 flex-1 flex items-center gap-1.5 pl-3 pr-1 py-2 text-left"
                >
                    {open[id] ? <ChevronDown size={12} className="text-gray-500" /> : <ChevronRight size={12} className="text-gray-500" />}
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{title}</span>
                    {!open[id] && <span className="ml-auto truncate text-[10px] font-mono text-gray-600">{summaries[id](s)}</span>}
                </button>
                {onLock && (
                    <button onClick={() => onLock(id, !locked.includes(id))} aria-pressed={locked.includes(id)}
                        title={locked.includes(id)
                            ? `Locked: the dice and presets leave the ${title.toLowerCase()} settings as they are. Click to unlock`
                            : `Lock the ${title.toLowerCase()} settings: the dice and presets leave them alone`}
                        aria-label={`${locked.includes(id) ? 'Unlock' : 'Lock'} the ${title.toLowerCase()} settings`}
                        className={`shrink-0 p-1 rounded hover:bg-white/5 transition-colors ${locked.includes(id) ? 'text-synthux-yellow' : 'text-gray-700 hover:text-white'}`}>
                        {locked.includes(id) ? <Lock size={11} /> : <Unlock size={11} />}
                    </button>
                )}
                <button onClick={() => onChange(rollGroupInStyle(id, style))} disabled={locked.includes(id)}
                    title={`Dice: roll the ${title.toLowerCase()} settings${style ? ', near the style' : ''}`} aria-label={`Roll the ${title.toLowerCase()} settings`}
                    className="shrink-0 mr-2 p-1 rounded text-gray-600 hover:text-synthux-red hover:bg-white/5 transition-colors
                        disabled:opacity-25 disabled:hover:text-gray-600 disabled:hover:bg-transparent">
                    <Dices size={12} />
                </button>
            </div>
            {open[id] && <div className={`${density === 'compact' ? 'space-y-2' : 'space-y-3'} px-3 pb-3`}>{children}</div>}
        </section>
    );

    const reverse = Math.round(s.reverseProbability * 100);

    return (
        <DensityContext.Provider value={density}>
            <div className={className}>
                {group('shape', <>
                    {s.grid && (
                        <p className="text-[10px] leading-snug text-gray-500">
                            The tempo grid sets the length, the snippet lengths (in steps) and the cuts (on the lines, no crossfade).
                        </p>
                    )}
                    {!s.grid && <>
                    {shown('fillMode') && (
                        <div {...tip("By length: as many snippets as fit the length. By count: that many snippets, and the file is as long as they turn out (42 s at most)")}>
                            <Segmented label="Fill" value={s.fillMode} onChange={set('fillMode')}
                                options={[{ value: 'length', label: 'By length' }, { value: 'count', label: 'By count' }]} />
                        </div>
                    )}
                    {s.fillMode === 'length' ? (
                        <div {...tip(`Length of the file, up to ${OUTPUT_MAX_SECONDS} s. The hardware plays the first 42 s`)}>
                            <Slider label="Output length" min={1} max={OUTPUT_MAX_SECONDS} step={lengthStep} value={s.outputSeconds}
                                onChange={set('outputSeconds')} format={v => `${v} s`}
                                readout={<ScrubNumber value={s.outputSeconds} onChange={set('outputSeconds')} min={1} max={OUTPUT_MAX_SECONDS}
                                    step={lengthStep} unit="s" width="w-[5rem]" ariaLabel="Output length in seconds" />} />
                        </div>
                    ) : (
                        <div {...tip("This many snippets; their lengths decide how long the file is. The estimate is the typical length")}>
                            <Slider label="Snippets" min={1} max={128} value={Math.min(128, s.snippetCount)}
                                onChange={set('snippetCount')} format={v => `${v} → ${countEstimate(s, v)}`} />
                        </div>
                    )}
                    <div {...tip("Snippet length: each one is picked between these two")}>
                        <RangeSlider label="Snippet length" min={SNIPPET_MIN_MS} max={SNIPPET_MAX_MS} scale="log"
                            low={s.snippetMinMs} high={s.snippetMaxMs} format={formatMs}
                            onChange={(lo, hi) => onChange({ snippetMinMs: lo, snippetMaxMs: hi })}
                            readout={<RangeReadout label="Snippet" low={s.snippetMinMs} high={s.snippetMaxMs}
                                min={SNIPPET_MIN_MS} max={SNIPPET_MAX_MS}
                                onChange={(lo, hi) => onChange({ snippetMinMs: lo, snippetMaxMs: hi })} />} />
                    </div>
                    </>}
                    <div {...tip("Skews the pick inside the snippet length range")}>
                        <Slider label="Bias" min={-1} max={1} step={0.05} value={s.bias} onChange={set('bias')}
                            format={v => (Math.abs(v) < 0.025 ? 'even' : v < 0 ? `short ${Math.round(-v * 100)}%` : `long ${Math.round(v * 100)}%`)} />
                    </div>
                    {!s.grid && <div {...tip("Equal-power crossfade between snippets, at most half the shorter of the two")}>
                        <RangeSlider label="Crossfade" min={0} max={XFADE_MAX_MS} scale="cubic"
                            low={s.xfadeMinMs} high={s.xfadeMaxMs} format={formatMs}
                            onChange={(lo, hi) => onChange({ xfadeMinMs: lo, xfadeMaxMs: hi })}
                            readout={<RangeReadout label="Crossfade" low={s.xfadeMinMs} high={s.xfadeMaxMs} min={0} max={XFADE_MAX_MS}
                                onChange={(lo, hi) => onChange({ xfadeMinMs: lo, xfadeMaxMs: hi })} />} />
                    </div>}
                    {!s.grid && <>
                        <div {...tip("Polyphony: a snippet keeps sounding while the next ones start, so a long one rings under several short ones. The crossfade is then each snippet's fade in and out")}>
                            <Toggle label="Polyphony (let snippets ring)" checked={s.polyphony} onChange={set('polyphony')} />
                        </div>
                        {s.polyphony && <>
                            <div {...tip("How far into a snippet the next one starts: 75% means after its first quarter. Each snippet picks between the two")}>
                                <RangeSlider label="Overlap" min={0} max={OVERLAP_MAX_PCT} step={1} low={s.overlapMinPct} high={s.overlapMaxPct}
                                    format={v => `${Math.round(v)}%`} onChange={(lo, hi) => onChange({ overlapMinPct: lo, overlapMaxPct: hi })} />
                            </div>
                            <div {...tip("At most this many snippets at once; a new one waits for the first to end")}>
                                <Slider label="Max layers" min={2} max={MAX_LAYERS} value={s.maxLayers} onChange={set('maxLayers')} format={String} />
                            </div>
                        </>}
                    </>}
                    <div {...tip("Off adds a 2 ms fade at each snippet edge")}>
                        <Toggle label="Hard cuts (leave clicks in)" checked={s.hardCuts} onChange={set('hardCuts')} />
                    </div>
                    <div {...tip("Zero: on a zero crossing, so hard cuts don't click. Transient: on the strongest attack in the first half second")}>
                        <Segmented label="Snippet start" value={s.snapStart} onChange={set('snapStart')}
                            options={[{ value: 'off', label: 'Anywhere' }, { value: 'zero', label: 'Zero' }, { value: 'onset', label: 'Transient' }]} />
                    </div>
                    <div {...tip("For drum loops: a snippet ends before the next hit in its source, so each cue point holds one sound. Best with Transient start")}>
                        <Toggle label="One hit per snippet" checked={s.oneHit} onChange={set('oneHit')} />
                    </div>
                    <div {...tip("Chance that a snippet plays backwards")}>
                        <Slider label="Reverse" min={0} max={100} value={reverse} format={v => `${v}%`}
                            onChange={v => onChange({ reverseProbability: v / 100 })}
                            readout={<ScrubNumber value={reverse} min={0} max={100} unit="%" width="w-[5rem]" ariaLabel="Reverse chance"
                                onChange={v => onChange({ reverseProbability: v / 100 })} />} />
                    </div>
                </>)}

                {group('tempo', <>
                    <div {...tip("Lay the snippets on a tempo grid: an exact number of bars, every snippet whole steps long and starting on a line, so the file loops in time. The Spotykach doesn't read a tempo: this is for playing it as a loop")}>
                        <Toggle label="Tempo grid" checked={s.grid} onChange={set('grid')} />
                    </div>
                    {s.grid && <>
                        <div {...tip(`Beats per minute, ${BPM_MIN}–${BPM_MAX}`)}>
                            <Slider label="Tempo" min={BPM_MIN} max={BPM_MAX} value={s.bpm} onChange={set('bpm')} format={v => `${v} bpm`}
                                readout={<ScrubNumber value={s.bpm} onChange={set('bpm')} min={BPM_MIN} max={BPM_MAX} step={0.5}
                                    unit="bpm" width="w-[5.5rem]" ariaLabel="Tempo in bpm" />} />
                        </div>
                        <div {...tip("The size of one step. T: triplets")}>
                            <Segmented label="Step" value={s.division} onChange={set('division')}
                                options={[{ value: '1/4', label: '1/4' }, { value: '1/8', label: '1/8' }, { value: '1/16', label: '1/16' },
                                    { value: '1/8T', label: '1/8T' }, { value: '1/16T', label: '1/16T' }]} />
                        </div>
                        <div {...tip(`The file is exactly this many bars of 4/4: at most ${maxBars(s.bpm)} at this tempo (42 s)`)}>
                            <Slider label="Bars" min={1} max={maxBars(s.bpm)} value={Math.min(s.bars, maxBars(s.bpm))} onChange={set('bars')}
                                format={v => `${v} · ${(v * barSeconds(s.bpm)).toFixed(1)} s`} />
                        </div>
                        <div {...tip("Snippet length in steps: each one is picked between these two")}>
                            <RangeSlider label="Snippet steps" min={1} max={STEPS_MAX} step={1}
                                low={s.stepsMin} high={s.stepsMax} format={v => String(v)}
                                onChange={(lo, hi) => onChange({ stepsMin: lo, stepsMax: hi })} />
                        </div>
                        <div {...tip("Cut: exactly the frames the steps need. Tape: the snippet at its own length, sped up or slowed down to fit (pitch moves with it, up to about 7 semitones)")}>
                            <Segmented label="Fit" value={s.gridFit} onChange={set('gridFit')}
                                options={[{ value: 'cut', label: 'Cut' }, { value: 'tape', label: 'Tape' }]} />
                        </div>
                    </>}
                </>)}

                {group('loudness', <>
                    <div {...tip("Gated RMS every snippet is matched to")}>
                        <Slider label="Target (RMS)" min={-30} max={-6} value={s.loudnessTargetDb}
                            onChange={set('loudnessTargetDb')} format={v => `${v} dBFS`} />
                    </div>
                    <div {...tip("Random deviation from the target, for dynamics on purpose")}>
                        <Slider label="Spread" min={0} max={12} step={0.5} value={s.loudnessSpreadDb}
                            onChange={set('loudnessSpreadDb')} format={v => `± ${v} dB`} />
                    </div>
                    <div {...tip("Stops near-silent snippets being pulled up into hiss")}>
                        <Slider label="Max boost" min={0} max={36} value={s.maxBoostDb}
                            onChange={set('maxBoostDb')} format={v => `${v} dB`} />
                    </div>
                    <div {...tip("Redraws a snippet that is quieter than the threshold (up to 5 times)")}>
                        <Toggle label="Skip silence" checked={s.skipSilence} onChange={set('skipSilence')} />
                    </div>
                    <Slider label="Silence threshold" min={-70} max={-30} value={s.silenceThresholdDb}
                        onChange={set('silenceThresholdDb')} format={v => `${v} dBFS`} disabled={!s.skipSilence} />
                    <div {...tip("Chance that a snippet is a rest: silence of its own length. Its cue point stays, so on the hardware it is an empty slice")}>
                    <Slider label="Rests" min={0} max={50} value={Math.round(s.restProbability * 100)}
                        onChange={v => onChange({ restProbability: v / 100 })} format={v => (v ? `${v}%` : 'off')} />
                </div>
                <div {...tip("Chance that a snippet is turned down: quiet passages between the loud ones")}>
                    <Slider label="Soft parts" min={0} max={100} value={Math.round(s.softProbability * 100)}
                        onChange={v => onChange({ softProbability: v / 100 })} format={v => (v ? `${v}%` : 'off')} />
                </div>
                {s.softProbability > 0 && (
                    <div {...tip("How much quieter a soft part is: each one is picked between these two")}>
                        <RangeSlider label="Softer by" min={1} max={SOFT_MAX_DB} low={s.softMinDb} high={s.softMaxDb}
                            format={v => `${v} dB`} onChange={(lo, hi) => onChange({ softMinDb: lo, softMaxDb: hi })} />
                    </div>
                )}
                <div {...tip("Off scales the whole file down instead when it peaks over −1 dBFS")}>
                        <Toggle label="Limiter at −1 dBFS" checked={s.limiter} onChange={set('limiter')} />
                    </div>
                </>)}

                {group('envelope', <>
                    <div {...tip("An attack and a decay on every snippet: plucked, swelling or clipped. Each snippet gets its own, picked from the ranges")}>
                        <Toggle label="Attack–decay envelope" checked={s.envelope} onChange={set('envelope')} />
                    </div>
                    {s.envelope && <>
                        <div {...tip("How long a snippet takes to rise from silence: 0 is a hard start, a few hundred ms a swell")}>
                            <RangeSlider label="Attack" min={0} max={ATTACK_MAX_MS} scale="cubic"
                                low={s.attackMinMs} high={s.attackMaxMs} format={formatMs}
                                onChange={(lo, hi) => onChange({ attackMinMs: lo, attackMaxMs: hi })} />
                        </div>
                        <div {...tip("How long it takes to die away after the attack. Longer than the snippet: only a gentle fall")}>
                            <RangeSlider label="Decay" min={DECAY_MIN_MS} max={DECAY_MAX_MS} scale="log"
                                low={s.decayMinMs} high={s.decayMaxMs} format={formatMs}
                                onChange={(lo, hi) => onChange({ decayMinMs: lo, decayMaxMs: hi })} />
                        </div>
                        <div {...tip("Exp: falls fast, then lingers (−60 dB at the end of the decay), like a struck sound. Linear: a straight fade to silence")}>
                            <Segmented label="Curve" value={s.envelopeCurve} onChange={set('envelopeCurve')}
                                options={[{ value: 'exp', label: 'Exp' }, { value: 'linear', label: 'Linear' }]} />
                        </div>
                    </>}
                </>)}

                {group('pitch', <>
                    <div {...tip("Suggest only detects and lists; Apply moves every snippet with a clear pitch to the nearest note of the scale")}>
                        <Segmented label="Repitch" value={s.repitch} onChange={set('repitch')}
                            options={[{ value: 'off', label: 'Off' }, { value: 'suggest', label: 'Suggest' }, { value: 'apply', label: 'Apply' }]} />
                    </div>
                    <div {...tip("The notes Apply (and 'scale' in the snippet list) move snippets to. Click keys for a custom scale")}>
                        <div className="space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[11px]">
                                <span className="text-gray-400">Scale</span>
                                <span className="flex items-center gap-1 min-w-0">
                                    <select value={s.scaleRoot} onChange={e => onChange({ scaleRoot: Number(e.target.value) })}
                                        aria-label="Root note"
                                        className="bg-black/40 border border-white/10 rounded px-1 py-0.5 text-[11px] text-gray-200">
                                        {NOTE_NAMES.map((n, pc) => <option key={n} value={pc}>{n}</option>)}
                                    </select>
                                    <select
                                        value={scaleName(s.scaleMask) ?? ''}
                                        onChange={e => {
                                            const preset = SCALES.find(sc => sc.name === e.target.value);
                                            if (preset) onChange({ scaleMask: maskFromIntervals(preset.intervals) });
                                        }}
                                        aria-label="Scale"
                                        className="bg-black/40 border border-white/10 rounded px-1 py-0.5 text-[11px] text-gray-200"
                                    >
                                        {scaleName(s.scaleMask) === null && <option value="">Custom</option>}
                                        {SCALES.map(sc => <option key={sc.name} value={sc.name}>{sc.name}</option>)}
                                    </select>
                                </span>
                            </div>
                            <ScaleKeys root={s.scaleRoot} mask={s.scaleMask} onChange={m => onChange({ scaleMask: m })} />
                        </div>
                    </div>
                    <div {...tip("Below this a snippet keeps its own pitch")}>
                        <Slider label="Pitch confidence" min={0} max={1} step={0.05} value={s.pitchConfidence}
                            onChange={set('pitchConfidence')} format={v => v.toFixed(2)} disabled={s.repitch !== 'apply'} />
                    </div>
                    <div {...tip("Extra random shift per snippet, on top of the scale")}>
                        <Slider label="Random detune" min={0} max={12} step={0.5} value={s.detuneSt}
                            onChange={set('detuneSt')} format={v => (v ? `± ${v} st` : 'off')} />
                    </div>
                    <div {...tip("Clean (windowed sinc) keeps the highs on big shifts; Lo-fi (linear) is duller and grittier")}>
                        <Segmented label="Resampling" value={s.resampler} onChange={set('resampler')}
                            options={[{ value: 'sinc', label: 'Clean' }, { value: 'linear', label: 'Lo-fi' }]} />
                    </div>
                </>)}

                {group('file', <>
                    {shown('sourceMix') && (
                        <div {...tip("Even: every source equally likely. By length: longer files are picked more")}>
                            <Segmented label="Source mix" value={s.sourceMix} onChange={set('sourceMix')}
                                options={[{ value: 'even', label: 'Even' }, { value: 'length', label: 'By length' }]} />
                        </div>
                    )}
                    {shown('maxPerSource') && (
                        <div {...tip("Caps how many snippets one file can give")}>
                            <Slider label="Max per source" min={0} max={50} value={s.maxPerSource}
                                onChange={set('maxPerSource')} format={v => (v === 0 ? 'no limit' : String(v))} />
                        </div>
                    )}
                    <div {...tip("So the slice mode jumps between snippets. At most 255")}>
                        <Toggle label="Cue point at each snippet" checked={s.cuePoints} onChange={set('cuePoints')} />
                    </div>
                    <div {...tip("Crossfades the end into the start, so the file loops cleanly")}>
                        <Toggle label="Loop the file" checked={s.loop} onChange={set('loop')} />
                    </div>
                </>, shown('sourceMix') ? 'Sources and file' : 'File')}
            </div>
        </DensityContext.Provider>
    );
}
