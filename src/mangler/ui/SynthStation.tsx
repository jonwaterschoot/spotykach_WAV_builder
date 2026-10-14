import React from 'react';
import { rollRanges } from '../randomize';
import { Dices, FileAudio, Grid2x2Plus, Import, Loader, Play, Plus, RotateCcw, Square, Trash2 } from 'lucide-react';
import type { Stereo } from '../dsp';
import type { HitClass } from '../hits';
import { GENERATORS, SYNTH_KINDS, type SynthKind, type SynthParam, type SynthRanges } from '../synth';
import { DensityContext } from './density';
import { formatMs } from './format';
import { RangeSlider, Slider } from './Sliders';

/**
 * The synth: pick a generator, set its ranges, generate a handful of takes, and
 * keep the good ones as slices, sources or results (or put one straight into
 * the Studio slot the mangler was opened from).
 */

export interface SynthTake {
    id: string;
    name: string;
    kind: SynthKind;
    seed: number;
    values: Record<string, number>;
    audio: Stereo;
    peaks: number[];
}

interface SynthStationProps {
    kind: SynthKind;
    onKind: (kind: SynthKind) => void;
    ranges: SynthRanges;
    onRanges: (ranges: SynthRanges) => void;
    onResetRanges: () => void;
    count: number;
    maxCount: number;
    onCount: (n: number) => void;
    generating: boolean;
    onGenerate: () => void;
    takes: SynthTake[];
    playingId: string | null;
    onPlay: (take: SynthTake) => void;
    onStop: () => void;
    onToSlices: (takes: SynthTake[]) => void;
    onToSources: (takes: SynthTake[]) => void;
    onToResults: (takes: SynthTake[]) => void;
    /** Studio: the empty slot the mangler was opened from. */
    slotLabel?: string;
    onToSlot?: (take: SynthTake) => void;
    onDiscard: (ids: string[]) => void;
}

const SR = 48000;
const CLASS_COLOR: Record<HitClass, string> = { low: '#f58b44', mid: '#f5d544', high: '#4771f9' };

const formatValue = (q: SynthParam, v: number) => {
    if (q.unit === 'Hz') return v >= 1000 ? `${(v / 1000).toFixed(1)} kHz` : `${Math.round(v)} Hz`;
    if (q.unit === 'ms') return formatMs(v);
    if (q.key === 'bursts') return String(Math.round(v));
    return q.max > 2 ? v.toFixed(1) : `${Math.round(v * 100)}%`;
};

export const SynthStation: React.FC<SynthStationProps> = ({
    kind, onKind, ranges, onRanges, onResetRanges, count, maxCount, onCount, generating, onGenerate,
    takes, playingId, onPlay, onStop, onToSlices, onToSources, onToResults, slotLabel, onToSlot, onDiscard,
}) => {
    const gen = GENERATORS[kind];
    const action = 'flex items-center gap-1 px-2 py-0.5 rounded border border-white/10 text-gray-400 hover:text-white hover:bg-white/5';
    return (
        // One scrolling column on a phone; two that scroll apart on a wide screen.
        <div className="h-full min-h-0 overflow-y-auto lg:overflow-hidden lg:grid lg:grid-cols-[minmax(260px,320px)_1fr]">
            <section className="lg:min-h-0 lg:overflow-y-auto lg:border-r border-b lg:border-b-0 border-white/10 p-4 space-y-3">
                <div className="grid grid-cols-4 gap-1">
                    {SYNTH_KINDS.map(k => (
                        <button key={k} onClick={() => onKind(k)}
                            className={`px-1 py-1.5 rounded-md text-[11px] font-bold transition-colors border
                                ${k === kind ? 'bg-synthux-red/80 text-white border-transparent' : 'border-white/10 text-gray-400 hover:text-white hover:bg-white/5'}`}>
                            {GENERATORS[k].label}
                        </button>
                    ))}
                </div>
                <DensityContext.Provider value="compact">
                    <div className="space-y-2 rounded-lg border border-white/5 bg-white/[0.02] p-3">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{gen.label} ranges</span>
                            <span className="flex items-center gap-2">
                                <button onClick={() => onRanges(rollRanges(kind))} title="Dice: roll every range of this generator"
                                    className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-synthux-red"><Dices size={11} /> Roll</button>
                                <button onClick={onResetRanges} title="Back to the starting ranges"
                                    className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-white"><RotateCcw size={10} /> Reset</button>
                            </span>
                        </div>
                        {gen.params.map(q => {
                            const [lo, hi] = ranges[q.key] ?? q.range;
                            return (
                                <div key={q.key} title={q.hint}>
                                    <RangeSlider label={q.label} min={q.min} max={q.max} low={lo} high={hi}
                                        scale={q.log ? 'log' : 'linear'} step={q.key === 'bursts' ? 1 : q.log ? undefined : (q.max - q.min) / 200}
                                        format={v => formatValue(q, v)}
                                        onChange={(a, b) => onRanges({ ...ranges, [q.key]: [a, b] })} />
                                </div>
                            );
                        })}
                    </div>
                    <Slider label="Takes" min={1} max={maxCount} value={Math.min(count, maxCount)} onChange={onCount} format={String} />
                </DensityContext.Provider>
                <button onClick={onGenerate} disabled={generating}
                    className="w-full flex items-center justify-center gap-2 px-4 h-10 rounded-full text-sm font-bold bg-synthux-red text-white
                        shadow-lg shadow-synthux-red/30 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50">
                    {generating ? <Loader size={15} className="animate-spin" /> : <Dices size={15} />} Generate {Math.min(count, maxCount)}
                </button>
                <p className="text-[10px] leading-snug text-gray-500">
                    Each take picks its own values inside the ranges. Keep the good ones: as slices (for kits and the sequencer), as
                    sources (to mangle), or as results (to save).
                </p>
            </section>

            <section className="lg:min-h-0 lg:overflow-y-auto p-4">
                {takes.length === 0 ? (
                    <p className="mt-12 text-center text-sm text-gray-500">Set the ranges and generate a few takes.</p>
                ) : (
                    <>
                        <div className="flex flex-wrap items-center gap-2 mb-3 text-[11px]">
                            <span className="text-gray-400">{takes.length} take{takes.length === 1 ? '' : 's'}</span>
                            <button onClick={() => onToSlices(takes)} className={action}><Grid2x2Plus size={11} /> All to slices</button>
                            <button onClick={() => onDiscard(takes.map(t => t.id))} className={`${action} ml-auto`}><Trash2 size={11} /> Clear</button>
                        </div>
                        <div className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(14rem,1fr))]">
                            {takes.map(t => {
                                const color = CLASS_COLOR[GENERATORS[t.kind].cls];
                                const playing = playingId === t.id;
                                return (
                                    <div key={t.id} className="rounded-lg border border-white/10 bg-synthux-panel/80 p-2">
                                        <div className="flex items-center gap-1.5">
                                            <button onClick={() => (playing ? onStop() : onPlay(t))} title={playing ? 'Stop' : 'Play'}
                                                className="h-7 w-7 shrink-0 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
                                                {playing ? <Square size={10} fill="currentColor" /> : <Play size={11} className="ml-px" />}
                                            </button>
                                            <span className="min-w-0 flex-1 truncate text-[11px] font-bold">{t.name}</span>
                                            <span className="text-[10px] font-mono text-gray-500">{formatMs((t.audio[0].length / SR) * 1000)}</span>
                                            <button onClick={() => onDiscard([t.id])} title="Discard" className="p-0.5 text-gray-600 hover:text-synthux-red"><Trash2 size={11} /></button>
                                        </div>
                                        <svg viewBox={`0 0 ${t.peaks.length} 20`} preserveAspectRatio="none" className="mt-1.5 w-full h-8" aria-hidden>
                                            {t.peaks.map((pk, k) => (
                                                <rect key={k} x={k} width={0.8} y={10 - Math.max(0.3, pk * 10)} height={Math.max(0.6, pk * 20)} fill={color} opacity={0.8} />
                                            ))}
                                        </svg>
                                        <div className="mt-1.5 flex flex-wrap gap-1 text-[10px]">
                                            <button onClick={() => onToSlices([t])} className={action} title="Into the slice pool: for kits and the sequencer">
                                                <Plus size={10} /> Slice
                                            </button>
                                            <button onClick={() => onToSources([t])} className={action} title="Into the source pool, to mangle">
                                                <Import size={10} /> Source
                                            </button>
                                            <button onClick={() => onToResults([t])} className={action} title="A result: save it like any other">
                                                <FileAudio size={10} /> Result
                                            </button>
                                            {slotLabel && onToSlot && (
                                                <button onClick={() => onToSlot(t)} title={`Put it in slot ${slotLabel}`}
                                                    className="flex items-center gap-1 px-2 py-0.5 rounded border border-synthux-orange/50 text-synthux-orange hover:bg-synthux-orange/10">
                                                    <Plus size={10} /> {slotLabel}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </section>
        </div>
    );
};
