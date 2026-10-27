import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Circle, Clipboard, Download, Loader, Usb, X } from 'lucide-react';
import type { PresetManifestEntry } from '../../data/samplePacks';
import type { SlotDescriptor } from '../../lib/card/cardBackend';
import { usbSession, useUsbSession } from '../../lib/usb/usbSession';
import { UsbDiagnosticsButton } from '../UsbDiagnosticsButton';
import { presetSlots, writePresetOverUsb, type PresetSlot } from '../../utils/presetLoader';
import type { TapeColor } from '../../types';

/**
 * A preset onto Spotykach over USB. The card reader route can only say
 * "SK/ is already on this card"; over USB the device lists its slots, so this shows
 * exactly which files the preset replaces, offers to save them first, and says how
 * long the write takes. The finished step keeps the measured times, for the record.
 */

/**
 * Measured on firmware 1.4.0.b1, Windows, Oct 13 2026: Hainbach's Spotykach Tapes,
 * 36 slots, 286.5 MB in 10 min 16 s (477 KB/s; 413–501 KB/s per slot), plus about
 * 10 s to download the audio. Downloads off the device run at the same speed.
 */
const BYTES_PER_SECOND = 477 * 1024;
/** Same run: 17 s per slot on average, for samples of mixed length. */
const AVG_SLOT_SECONDS = 17;
/** A full slot: 42 s of 48 kHz stereo float, about 34 s over USB. */
const FULL_SLOT_BYTES = 2016000 * 8;

const TAPE_HEX: Record<TapeColor, string> = {
    Blue: '#3b82f6', Green: '#22c55e', Pink: '#ec4899', Red: '#ef4444', Turquoise: '#14b8a6', Yellow: '#eab308',
};
const key = (tape: TapeColor, slot: number) => `${tape}${slot}`;
const label = (tape: TapeColor, slot: number) => `${tape} ${slot}`;
const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const duration = (seconds: number) => {
    const s = Math.max(1, Math.round(seconds));
    return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
};

interface Plan {
    slots: PresetSlot[];
    /** Occupied slots the preset writes over, by slot key. */
    replaced: Map<string, SlotDescriptor>;
    /** Occupied slots the preset leaves alone. */
    kept: number;
    freeKiB?: number;
}

interface SlotTiming { slot: string; bytes: number; seconds: number }

type Step =
    | { kind: 'plan' }
    | { kind: 'saving'; done: number; total: number; fraction: number }
    | { kind: 'writing' }
    | { kind: 'done'; seconds: number; timings: SlotTiming[]; missing: number }
    | { kind: 'failed'; message: string; timings: SlotTiming[] };

interface UsbPresetWriteModalProps {
    entry: PresetManifestEntry;
    onClose: () => void;
}

export const UsbPresetWriteModal: React.FC<UsbPresetWriteModalProps> = ({ entry, onClose }) => {
    const usb = useUsbSession();
    const backend = usb.backend;
    const [plan, setPlan] = useState<Plan | null>(null);
    const [planError, setPlanError] = useState<string | null>(null);
    const [step, setStep] = useState<Step>({ kind: 'plan' });
    const [saved, setSaved] = useState(false);
    const [copied, setCopied] = useState(false);
    /** The write as it goes: what's done, the slot in hand, and when it all started. */
    const [live, setLive] = useState<{
        startedAt: number;
        downloadPct: number;
        downloaded: boolean;
        timings: SlotTiming[];
        current?: { slot: string; started: number; fraction: number };
    } | null>(null);
    /** Spotykach was handed back (transfer mode left), the dialog still open for the report. */
    const [released, setReleased] = useState(false);
    const [now, setNow] = useState(() => performance.now());
    const abort = useRef<AbortController | null>(null);

    // A clock for the elapsed and remaining times while writing.
    useEffect(() => {
        if (step.kind !== 'writing') return;
        const id = setInterval(() => setNow(performance.now()), 1000);
        return () => clearInterval(id);
    }, [step.kind]);
    const busy = step.kind === 'saving' || step.kind === 'writing';

    // Connected: read the preset's slots and the device's, and set them side by side.
    useEffect(() => {
        // Without a connection the last plan stands: a write that lost it still needs its count.
        if (!backend) return;
        let cancelled = false;
        setPlanError(null);
        Promise.all([presetSlots(entry), backend.listSlots(), backend.info()])
            .then(([slots, onCard, info]) => {
                if (cancelled) return;
                const occupied = new Map(onCard.map(d => [key(d.tape, d.slot), d]));
                const replaced = new Map<string, SlotDescriptor>();
                for (const s of slots) {
                    const d = occupied.get(key(s.tape, s.slot));
                    if (d) replaced.set(key(s.tape, s.slot), d);
                }
                setPlan({ slots, replaced, kept: occupied.size - replaced.size, freeKiB: info.freeKiB });
            })
            .catch(e => { if (!cancelled) setPlanError(e instanceof Error ? e.message : String(e)); });
        return () => { cancelled = true; };
    }, [backend, entry]);

    const close = () => {
        if (busy) return;
        // Transfer mode keeps the device silent: hand it back unless it's needed again.
        void usbSession.disconnect();
        onClose();
    };

    /** The files about to be replaced, as a ZIP laid out like the card (`SK/B/1.WAV`). */
    const saveReplaced = async () => {
        if (!backend || !plan) return;
        const files = [...plan.replaced.values()];
        const controller = new AbortController();
        abort.current = controller;
        setStep({ kind: 'saving', done: 0, total: files.length, fraction: 0 });
        try {
            const JSZip = (await import('jszip')).default;
            const zip = new JSZip();
            const lines = [`Spotykach slots replaced by the preset "${entry.name}", saved ${new Date().toLocaleString()}.`,
                'Copy SK/ onto the card to put them back.', ''];
            for (const [i, d] of files.entries()) {
                const file = await backend.readFile(d.tape, d.slot,
                    fraction => setStep({ kind: 'saving', done: i, total: files.length, fraction }), controller.signal);
                zip.file(`SK/${d.tape.charAt(0)}/${d.slot}.WAV`, file);
                lines.push(`${label(d.tape, d.slot)}: ${d.name || d.meta?.name || '(no name, recorded on the device)'}`);
            }
            zip.file('README.txt', lines.join('\r\n'));
            const blob = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `spotykach-slots-before-${entry.id}.zip`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 10000);
            setSaved(true);
            setStep({ kind: 'plan' });
        } catch (e) {
            setStep({ kind: 'plan' });
            if (!(e instanceof DOMException && e.name === 'AbortError')) setPlanError(`Saving failed: ${e instanceof Error ? e.message : String(e)}`);
        }
    };

    /** `resume`: after an interrupted write, only the slots it didn't finish. */
    const write = async (resume = false) => {
        let card = backend;
        if (!card) card = await usbSession.connect();
        if (!card) return;
        const controller = new AbortController();
        abort.current = controller;
        const earlier = resume && (step.kind === 'failed' || step.kind === 'done') ? step.timings : [];
        const timings: SlotTiming[] = [...earlier];
        const t0 = resume && live ? live.startedAt : performance.now();
        let current: { slot: string; started: number; fraction: number } | undefined;
        let downloadPct = 0;
        let downloaded = false;
        const update = () => setLive({ startedAt: t0, downloadPct, downloaded, timings: [...timings], current: current && { ...current } });
        setStep({ kind: 'writing' });
        update();
        try {
            const { missing } = await writePresetOverUsb(entry, card, {
                signal: controller.signal,
                skip: earlier.map(t => t.slot),
                onProgress: (_message, pct) => {
                    if (!downloaded && pct < 100) { downloadPct = pct; update(); }
                },
                onSlot: e => {
                    if (e.phase === 'start') { downloaded = true; current = { slot: e.slot, started: performance.now(), fraction: 0 }; }
                    if (e.phase === 'progress' && current) current.fraction = e.fraction ?? 0;
                    if ((e.phase === 'done' || e.phase === 'skipped') && !earlier.some(t => t.slot === e.slot)) {
                        timings.push({ slot: e.slot, bytes: e.phase === 'done' ? e.bytes ?? 0 : 0, seconds: (performance.now() - (current?.started ?? performance.now())) / 1000 });
                        current = undefined;
                    }
                    update();
                },
            });
            const seconds = (performance.now() - t0) / 1000;
            console.info(report(timings, seconds));
            setStep({ kind: 'done', seconds, timings, missing });
        } catch (e) {
            const cancelled = e instanceof DOMException && e.name === 'AbortError';
            console.info(report(timings));
            setStep({ kind: 'failed', timings, message: cancelled
                ? 'Stopped. The slots written so far hold the preset; the slot that was being written keeps its old file.'
                // The package's "(upload at byte …, attempt …)" detail is in the console already.
                : `${(e instanceof Error ? e.message : String(e)).replace(/ \((upload|read) at byte .*\)$/, '')} The slot that was being written keeps its old file.` });
        } finally {
            void usbSession.refreshInfo();
        }
    };

    /** Leave transfer mode so the device plays, and keep the dialog (and its report) open. */
    const release = () => {
        void usbSession.disconnect();
        setReleased(true);
    };

    const report = (timings: SlotTiming[], total?: number) => {
        const sent = timings.filter(t => t.bytes);
        const bytes = sent.reduce((n, t) => n + t.bytes, 0);
        const secs = sent.reduce((n, t) => n + t.seconds, 0);
        return [
            `Preset "${entry.name}" over USB (${usb.info?.label ?? 'Spotykach'}), ${new Date().toLocaleString()}`,
            total !== undefined ? `Total ${duration(total)} (download from the cloud included)` : '',
            `Slots written: ${sent.length}, ${mb(bytes)} in ${duration(secs)}${secs ? ` (${Math.round(bytes / 1024 / secs)} KB/s)` : ''}`,
            ...timings.map(t => `  ${t.slot}: ${t.bytes ? `${mb(t.bytes)} in ${t.seconds.toFixed(1)} s (${Math.round(t.bytes / 1024 / t.seconds)} KB/s)` : 'already on the device, skipped'}`),
        ].filter(Boolean).join('\n');
    };

    const copyReport = (text: string) => {
        void navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
    };

    const replacedBytes = plan ? [...plan.replaced.values()].reduce((n, d) => n + d.size, 0) : 0;
    const worstCase = plan ? (plan.slots.length * FULL_SLOT_BYTES) / BYTES_PER_SECOND : 0;
    const typical = plan ? plan.slots.length * AVG_SLOT_SECONDS : 0;
    const total = plan?.slots.length ?? 0;

    /** Seconds left: this run's own pace once a slot is done, the measured average before. */
    const remaining = (() => {
        if (!live) return typical;
        const n = live.timings.length;
        const pace = n ? live.timings.reduce((t, x) => t + x.seconds, 0) / n : AVG_SLOT_SECONDS;
        const inHand = live.current ? Math.min((now - live.current.started) / 1000, pace) : 0;
        return Math.max(0, (total - n) * pace - inHand);
    })();

    const finished = step.kind === 'done' || step.kind === 'failed';
    const writtenCount = live?.timings.length ?? 0;
    type StepState = 'done' | 'active' | 'todo' | 'skipped';
    const steps: Array<{ label: React.ReactNode; state: StepState }> = [
        { label: 'Connected to Spotykach', state: 'done' },
        ...(plan?.replaced.size ? [{
            label: saved ? `Saved the ${plan.replaced.size} replaced files (ZIP)` : 'Replaced files not saved',
            state: (saved ? 'done' : 'skipped') as StepState,
        }] : []),
        {
            label: live?.downloaded || finished ? 'Downloaded the preset audio' : `Downloading the preset audio… ${Math.round(live?.downloadPct ?? 0)}%`,
            state: live?.downloaded || finished ? 'done' : 'active',
        },
        {
            label: step.kind === 'done' ? `Wrote ${total} slots`
                : step.kind === 'failed' ? `Stopped${live?.current ? ` at ${live.current.slot.replace(/(\d)$/, ' $1')}` : ''} · ${writtenCount} of ${total} written`
                : live?.current ? <>Writing <span className="font-mono">{live.current.slot.replace(/(\d)$/, ' $1')}</span> · {writtenCount + 1} of {total}</>
                : `Write ${total} slots`,
            state: step.kind === 'done' ? 'done' : live?.downloaded && !finished ? 'active' : 'todo',
        },
        { label: 'Let Spotykach play again', state: released ? 'done' : finished ? 'active' : 'todo' },
    ];
    const stepIcon = (state: StepState) => state === 'done' ? <Check size={12} className="text-synthux-green" />
        : state === 'active' && !finished ? <Loader size={12} className="animate-spin text-synthux-orange" />
        : state === 'active' ? <Circle size={10} className="text-synthux-orange" />
        : <Circle size={10} className="text-gray-600" />;
    const overallPct = live ? (live.downloaded
        ? 10 + 90 * ((writtenCount + (live.current?.fraction ?? 0)) / Math.max(1, total))
        : 10 * (live.downloadPct / 100)) : 0;


    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[110] p-6 animate-in fade-in duration-200">
            <div className="bg-synthux-panel border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[calc(100vh-48px)]">
                <div className="p-6 pb-4 flex items-start justify-between gap-4">
                    <div>
                        <h3 className="text-lg font-bold text-white flex items-center gap-2.5">
                            <Usb size={18} className="shrink-0 text-synthux-orange" /> Write over USB
                        </h3>
                        <p className="text-xs text-gray-400 mt-1"><span className="text-gray-300">{entry.name}</span> onto Spotykach, through its rear USB port.</p>
                    </div>
                    {!busy && <button onClick={close} className="p-1 text-gray-500 hover:text-white"><X size={16} /></button>}
                </div>

                <div className="px-6 pb-5 space-y-4 overflow-y-auto text-xs text-gray-300 leading-relaxed">
                    {/* Connect */}
                    {!backend && step.kind === 'plan' && (
                        <div className="space-y-3">
                            <p>Connect Spotykach with a USB cable to its rear port. It goes into transfer mode and is silent until you're done here.</p>
                            <p className="text-[11px] text-gray-400">Connect Spotykach straight to a USB-A port on the computer with a good data cable. Avoid hubs, even powered ones: transfers there stalled and dropped off. Front USB-C ports can run at half speed.</p>
                            {usb.error && <p className="text-[11px] text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{usb.error}</p>}
                            {usb.error && <UsbDiagnosticsButton />}
                            {usb.status === 'needs-authorization' ? (
                                <button onClick={() => void usbSession.authorize()} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-synthux-orange/40 bg-synthux-orange/10 hover:bg-synthux-orange/20 text-sm font-bold text-synthux-orange">
                                    <Usb size={16} /> Authorise port
                                </button>
                            ) : (
                                <button onClick={() => void usbSession.connect()} disabled={usb.status === 'connecting'} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-synthux-orange/40 bg-synthux-orange/10 hover:bg-synthux-orange/20 text-sm font-bold text-synthux-orange disabled:opacity-50">
                                    {usb.status === 'connecting' ? <Loader size={16} className="animate-spin" /> : <Usb size={16} />} Connect Spotykach
                                </button>
                            )}
                        </div>
                    )}

                    {/* Plan */}
                    {backend && (step.kind === 'plan' || step.kind === 'saving') && (
                        planError ? (
                            <p className="text-[11px] text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{planError}</p>
                        ) : !plan ? (
                            <p className="flex items-center gap-2 text-gray-400"><Loader size={14} className="animate-spin" /> Reading the device's slots…</p>
                        ) : (
                            <div className="space-y-4">
                                <div className="grid grid-cols-6 gap-1">
                                    {(['Blue', 'Green', 'Pink', 'Red', 'Turquoise', 'Yellow'] as TapeColor[]).map(tape => (
                                        <div key={tape} className="space-y-1">
                                            {[1, 2, 3, 4, 5, 6].map(slot => {
                                                const writes = plan.slots.some(s => s.tape === tape && s.slot === slot);
                                                const replaces = plan.replaced.has(key(tape, slot));
                                                return (
                                                    <div key={slot} title={`${label(tape, slot)}: ${replaces ? 'replaced' : writes ? 'filled' : 'left as it is'}`}
                                                        className={`h-4 rounded-sm border-l-2 ${replaces ? 'bg-red-500/40' : writes ? 'bg-white/25' : 'bg-white/[0.04]'}`}
                                                        style={{ borderLeftColor: TAPE_HEX[tape] }} />
                                                );
                                            })}
                                        </div>
                                    ))}
                                </div>
                                <p className="text-[11px] text-gray-400">
                                    <span className="inline-block w-2 h-2 rounded-sm bg-white/25 mr-1" />{plan.slots.length - plan.replaced.size} empty slots filled
                                    <span className="inline-block w-2 h-2 rounded-sm bg-red-500/40 ml-3 mr-1" />{plan.replaced.size} replaced
                                    <span className="inline-block w-2 h-2 rounded-sm bg-white/[0.04] border border-white/10 ml-3 mr-1" />other slots left as they are{plan.kept ? ` (${plan.kept} hold a file)` : ''}
                                </p>

                                {plan.replaced.size > 0 && (
                                    <div className="rounded-xl border border-red-500/25 bg-red-500/[0.06] p-3 space-y-2">
                                        <p className="font-bold text-red-300 flex items-center gap-1.5"><AlertTriangle size={13} /> {plan.replaced.size} file{plan.replaced.size === 1 ? '' : 's'} on the device will be gone</p>
                                        <ul className="max-h-28 overflow-y-auto space-y-0.5 text-[11px] text-gray-300">
                                            {[...plan.replaced.values()].map(d => (
                                                <li key={key(d.tape, d.slot)} className="flex justify-between gap-3">
                                                    <span><span className="font-mono" style={{ color: TAPE_HEX[d.tape] }}>{label(d.tape, d.slot)}</span> {d.name || <span className="italic text-gray-500">recorded on the device</span>}</span>
                                                    <span className="text-gray-500 shrink-0">{mb(d.size)}</span>
                                                </li>
                                            ))}
                                        </ul>
                                        {step.kind === 'saving' ? (
                                            <p className="flex items-center gap-2 text-gray-300"><Loader size={13} className="animate-spin" /> Saving {step.done + 1} of {step.total}… {Math.round(step.fraction * 100)}%
                                                <button onClick={() => abort.current?.abort()} className="ml-auto text-gray-500 hover:text-white">Stop</button></p>
                                        ) : saved ? (
                                            <p className="flex items-center gap-1.5 text-synthux-green"><Check size={13} /> Saved as a ZIP in your downloads. Copy its SK/ onto the card to put them back.</p>
                                        ) : (
                                            <button onClick={() => void saveReplaced()} className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-white/15 bg-black/30 hover:bg-white/5 font-bold text-gray-200">
                                                <Download size={13} /> Save these {plan.replaced.size} first ({mb(replacedBytes)}, about {duration(replacedBytes / BYTES_PER_SECOND)})
                                            </button>
                                        )}
                                    </div>
                                )}

                                <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-1.5 text-[11px] text-gray-400">
                                    <p><span className="text-gray-200 font-bold">One click, then a long wait: about {duration(typical)}</span> for {plan.slots.length} slots,
                                        {' '}up to {duration(worstCase)} if every sample is a full 42 seconds. USB writes about 477 KB/s, so a slot takes 2–34 seconds by its length.
                                        {' '}The audio downloads from the cloud first, in seconds.</p>
                                    <p>Keep the cable in until it's done. If it comes out, the slot being written keeps its old file. Straight to a USB-A port, no hub.</p>
                                    {plan.freeKiB !== undefined && <p>Free on the card: {mb(plan.freeKiB * 1024)}.</p>}
                                </div>
                            </div>
                        )
                    )}

                    {/* Steps, shown from the moment the write starts */}
                    {(step.kind === 'writing' || finished) && (
                        <ol className="space-y-1.5">
                            {steps.map((st, i) => (
                                <li key={i} className={`flex items-center gap-2 ${st.state === 'todo' ? 'text-gray-600' : st.state === 'skipped' ? 'text-gray-500 line-through' : st.state === 'active' ? 'text-white' : 'text-gray-400'}`}>
                                    <span className="w-4 flex justify-center shrink-0">{stepIcon(st.state)}</span> {st.label}
                                </li>
                            ))}
                        </ol>
                    )}

                    {/* Writing */}
                    {step.kind === 'writing' && live && (
                        <div className="space-y-3">
                            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-synthux-orange transition-all" style={{ width: `${Math.min(100, overallPct)}%` }} /></div>
                            <p className="flex justify-between text-[11px] text-gray-400">
                                <span>Elapsed {duration((now - live.startedAt) / 1000)}</span>
                                <span>{live.downloaded ? `About ${duration(remaining)} left` : `Then about ${duration(remaining)} of writing`}</span>
                            </p>
                            {live.timings.length > 0 && (
                                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                                    {live.timings.map(t => (
                                        <span key={t.slot} title={t.bytes ? `${mb(t.bytes)} in ${t.seconds.toFixed(1)} s` : 'already on the device'}
                                            className="text-[10px] font-mono rounded px-1.5 py-0.5 bg-white/5 border-l-2"
                                            style={{ borderLeftColor: TAPE_HEX[t.slot.replace(/\d+$/, '') as TapeColor] }}>
                                            {t.slot.charAt(0)}{t.slot.replace(/^\D+/, '')} {t.seconds.toFixed(0)}s
                                        </span>
                                    ))}
                                </div>
                            )}
                            <p className="text-[11px] text-gray-500">Keep the cable in. Stopping leaves the slot being written as it was.</p>
                        </div>
                    )}

                    {/* Done / failed */}
                    {(step.kind === 'done' || step.kind === 'failed') && (() => {
                        const text = report(step.timings, step.kind === 'done' ? step.seconds : undefined);
                        return (
                            <div className="space-y-3">
                                {step.kind === 'done' ? (
                                    <p className="flex items-center gap-2 text-synthux-green font-bold"><Check size={15} /> Written in {duration(step.seconds)}.</p>
                                ) : (
                                    <p className="text-[11px] text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{step.message}</p>
                                )}
                                {step.kind === 'failed' && !backend && usb.status === 'needs-authorization' && (
                                    <div className="flex items-center gap-2 text-[11px] text-amber-300">
                                        <span className="flex-1">{usb.error ?? 'Spotykach is waiting in transfer mode.'}</span>
                                        <button onClick={() => void usbSession.authorize()} className="shrink-0 px-3 py-1 rounded-lg border border-synthux-orange/40 bg-synthux-orange/10 font-bold text-synthux-orange">Authorise port</button>
                                    </div>
                                )}
                                {step.kind === 'done' && step.missing > 0 && (
                                    <p className="text-amber-300">{step.missing} sample{step.missing === 1 ? '' : 's'} couldn't be downloaded, so {step.missing === 1 ? 'that slot was' : 'those slots were'} left as {step.missing === 1 ? 'it was' : 'they were'}.</p>
                                )}
                                <pre className="text-[10px] text-gray-400 bg-black/30 border border-white/10 rounded-lg p-2 max-h-40 overflow-auto whitespace-pre-wrap">{text}</pre>
                                <button onClick={() => copyReport(text)} className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-white">
                                    {copied ? <Check size={12} /> : <Clipboard size={12} />} {copied ? 'Copied' : 'Copy timings'}
                                </button>
                            </div>
                        );
                    })()}
                </div>

                <div className="px-6 py-3 border-t border-white/10 bg-black/20 flex justify-end gap-2">
                    {step.kind === 'writing' ? (
                        <button onClick={() => abort.current?.abort()} className="px-4 py-2 rounded-full text-xs font-bold text-gray-400 hover:text-white hover:bg-white/10">Stop</button>
                    ) : finished ? (
                        step.kind === 'failed' && !released && writtenCount < total ? (
                            <>
                                <button onClick={release} className="px-4 py-2 rounded-full text-xs font-bold text-gray-400 hover:text-white hover:bg-white/10">Stop here, let Spotykach play</button>
                                <button onClick={() => void write(true)} disabled={usb.status === 'connecting'}
                                    className="px-4 py-2 rounded-full text-xs font-bold bg-synthux-orange text-black hover:brightness-110 disabled:opacity-40">
                                    {backend ? 'Continue' : 'Reconnect and continue'} ({total - writtenCount} left)
                                </button>
                            </>
                        ) : released ? (
                            <button onClick={onClose} className="px-4 py-2 rounded-full text-xs font-bold bg-white/10 text-white hover:bg-white/15">Close</button>
                        ) : (
                            <button onClick={release} className="px-4 py-2 rounded-full text-xs font-bold bg-synthux-orange text-black hover:brightness-110">Let Spotykach play</button>
                        )
                    ) : (
                        <>
                            <button onClick={close} disabled={busy} className="px-4 py-2 rounded-full text-xs font-bold text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-40">Cancel</button>
                            <button onClick={() => void write()} disabled={!plan || busy || !!planError}
                                className="px-4 py-2 rounded-full text-xs font-bold bg-synthux-orange text-black hover:brightness-110 disabled:opacity-40">
                                {plan?.replaced.size ? `Replace ${plan.replaced.size} and write ${plan.slots.length} slots` : `Write ${plan?.slots.length ?? ''} slots`}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
