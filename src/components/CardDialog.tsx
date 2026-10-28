import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Download, FolderPlus, HardDrive, HelpCircle, Loader, Upload, Usb, X } from 'lucide-react';
import { DEVICE_MAX_FRAMES, toSlotFile, type SlotFile } from '../lib/audio/slotFile';
import type { CardBackend, SlotDescriptor } from '../lib/card/cardBackend';
import { downloadSlotsZip } from '../lib/card/slotZip';
import { formatSeconds, USB_BYTES_PER_SECOND, usbSecondsLeft } from '../lib/usb/speed';
import { FolderBackend } from '../lib/card/folderBackend';
import { usbTransferSupported, useUsbTransferEnabled } from '../lib/usb/flag';
import { usbSession, useUsbSession } from '../lib/usb/usbSession';
import { UsbDiagnosticsButton } from './UsbDiagnosticsButton';
import { ReaderRouteInfo, UsbRouteInfo } from './CardRouteInfo';
import { useEscapeLayer } from '../shell/escapeStack';
import { TAPE_COLORS, type TapeColor } from '../types';
import { canPickFolder, ensureWorkspacePermission } from '../utils/newProject';
import { getDirectoryHandle, saveDirectoryHandle } from '../utils/storageUtils';

/**
 * Files and a Spotykach's card, both ways and both routes, without a project:
 *
 * - send: files into slots, placed on a 6×6 grid (auto fill, in order, or by hand);
 * - import: slots into the caller, cue points and all.
 *
 * Over USB (the device in transfer mode; closing this sends it back to MIDI and
 * play), or straight on the SD card in a card reader: the folder Studio uses as
 * its SD card, asked for once if Studio has none. Used by the mangler and Browse.
 *
 * Nothing here keeps a record of the card: what a send replaces is gone. Studio
 * is the place for a card worth keeping track of, and `onUseStudio` says so.
 */

export interface CardItem {
    name: string;
    blob: Blob;
    /** Seconds: the slot file's slices. */
    cues: number[];
}

interface CardDialogProps {
    mode: 'send' | 'import';
    /** What to send (send mode). */
    items?: CardItem[];
    /** What the items are called in the header: "results", "files". */
    itemNoun?: string;
    onClose: () => void;
    onSent?: (where: string[]) => void;
    /** Import mode: the chosen slot files, as read. */
    onImport?: (files: { file: File; tape: TapeColor; slot: number }[]) => Promise<void> | void;
    /** Import mode: where the slots go, for the wording. Default "the source pool". */
    importInto?: string;
    /** Import mode: one slot at a time; picking another replaces the pick. */
    single?: boolean;
    /** Send mode: where the items go before anyone chooses, e.g. the slot a file came from. Default: the free slots. */
    startAt?: SlotRef[];
    /** Send mode: the way to a Studio project, offered beside the overwrite warning. */
    onUseStudio?: () => void;
}

type Route = 'usb' | 'sd';
export interface SlotRef { tape: TapeColor; slot: number }

const SLOTS = 6;
const SWATCH: Record<TapeColor, string> = {
    Blue: 'bg-blue-500', Green: 'bg-green-500', Pink: 'bg-pink-400', Red: 'bg-red-600', Turquoise: 'bg-teal-400', Yellow: 'bg-yellow-400',
};
/** Every slot, Blue 1 to Yellow 6: the order the pool's B1… labels follow. */
const ALL_SLOTS: SlotRef[] = TAPE_COLORS.flatMap(tape => Array.from({ length: SLOTS }, (_, i) => ({ tape, slot: i + 1 })));
const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export const CardDialog: React.FC<CardDialogProps> = ({
    mode, items = [], itemNoun = 'results', onClose, onSent, onImport, importInto = 'the source pool', single = false, startAt, onUseStudio,
}) => {
    const usbOn = useUsbTransferEnabled() && usbTransferSupported();
    const sdOn = canPickFolder();
    const [route, setRoute] = useState<Route | null>(sdOn && !usbOn ? 'sd' : usbOn && !sdOn ? 'usb' : null);
    const usb = useUsbSession();
    const [sd, setSd] = useState<FolderBackend | null>(null);
    const [sdName, setSdName] = useState<string | null>(null);
    const card: CardBackend | null = route === 'usb' ? (usb.status === 'connected' ? usb.backend : null) : route === 'sd' ? sd : null;
    const [slots, setSlots] = useState<SlotDescriptor[] | null>(null);
    /** Send: where each item goes, item i into `targets[i]`. */
    const [targets, setTargets] = useState<SlotRef[]>([]);
    /** Send: fill the free slots once this card's listing arrives. */
    const autoFillPending = useRef(true);
    /** Import: the slots picked, as "Tape n". */
    const [picked, setPicked] = useState<Set<string>>(new Set());
    const [progress, setProgress] = useState<string | null>(null);
    /** 0–1, the slot being written. */
    const [fraction, setFraction] = useState<number | null>(null);
    /** USB: seconds left in the send or download under way. */
    const [eta, setEta] = useState<number | null>(null);
    /** Slots saved to a ZIP this session, as "Tape n": the backup button says so. */
    const [backedUp, setBackedUp] = useState<Set<string>>(new Set());
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState<string | null>(null);
    const [showHelp, setShowHelp] = useState(false);

    // Transfer mode keeps the device silent: hand it back however the dialog goes,
    // by its own X or by a host that closes it (after an import, or for Studio).
    const routeRef = useRef(route);
    routeRef.current = route;
    useEffect(() => () => { if (routeRef.current === 'usb') void usbSession.disconnect(); }, []);
    const close = onClose;
    useEscapeLayer(true, () => { if (progress === null) close(); return true; });

    // The SD card Studio knows, by name, before asking for permission.
    useEffect(() => { getDirectoryHandle('sd').then(h => setSdName(h?.name ?? null)).catch(() => undefined); }, []);

    const list = async (backend: CardBackend) => {
        try { setSlots(await backend.listSlots()); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    };
    useEffect(() => { if (card) void list(card); }, [card]);

    const pickRoute = (next: Route) => {
        setRoute(next);
        setSlots(null);
        setTargets([]);
        setPicked(new Set());
        setBackedUp(new Set());
        autoFillPending.current = true;
    };

    /** The SD card: Studio's folder (permission asked on this click), or one picked now and kept for Studio too. */
    const openSd = async () => {
        setError(null);
        try {
            let handle = await getDirectoryHandle('sd');
            if (handle && !(await ensureWorkspacePermission(handle))) handle = null;
            if (!handle) {
                handle = await (window as Window & { showDirectoryPicker: (o: object) => Promise<FileSystemDirectoryHandle> })
                    .showDirectoryPicker({ mode: 'readwrite', id: 'wavbuilder-sd' });
                await saveDirectoryHandle('sd', handle);
            }
            const backend = new FolderBackend(handle);
            if (!(await backend.isReachable())) { setError(`The card "${handle.name}" can't be read. Insert it, or pick it again.`); return; }
            setSdName(handle.name);
            setSd(backend);
        } catch (e) {
            if ((e as DOMException)?.name !== 'AbortError') setError(e instanceof Error ? e.message : String(e));
        }
    };

    const key = (t: TapeColor, s: number) => `${t} ${s}`;
    const same = (a: SlotRef, b: SlotRef) => a.tape === b.tape && a.slot === b.slot;
    const taken = (t: TapeColor, s: number) => slots?.find(d => d.tape === t && d.slot === s);

    // Send: at most one item per slot, in list order.
    const sendable = Math.min(items.length, ALL_SLOTS.length);
    const free = ALL_SLOTS.filter(at => !taken(at.tape, at.slot));
    /** The files that don't fit were left out on purpose: stop asking. */
    const [skipRest, setSkipRest] = useState(false);
    const autoFill = () => { setSkipRest(false); setTargets(free.slice(0, sendable)); };
    const inOrder = () => setTargets(ALL_SLOTS.slice(0, sendable));

    useEffect(() => {
        if (mode !== 'send' || !slots || !autoFillPending.current) return;
        autoFillPending.current = false;
        setTargets(startAt?.length ? startAt.slice(0, sendable)
            : ALL_SLOTS.filter(at => !slots.some(d => d.tape === at.tape && d.slot === at.slot)).slice(0, sendable));
    }, [mode, slots, sendable, startAt]);

    /** A free cell takes the next item; a placed one gives its item back, and the later ones move up. */
    const toggleTarget = (at: SlotRef) => {
        setDone(null);
        setTargets(prev => prev.some(t => same(t, at)) ? prev.filter(t => !same(t, at))
            : prev.length < sendable ? [...prev, at] : prev);
    };

    const replaced = targets.map(at => taken(at.tape, at.slot)).filter((d): d is SlotDescriptor => !!d);
    const overwrites = replaced.length;
    const unplaced = sendable - targets.length;
    /** Full slots still free to take the files that didn't fit, in card order. */
    const spareFull = ALL_SLOTS.filter(at => taken(at.tape, at.slot) && !targets.some(t => same(t, at)));
    /** Files left over with every free slot already taken: Auto fill ran out of room. */
    const unfit = unplaced > 0 && free.every(at => targets.some(t => same(t, at)));
    const overwriteRest = () => setTargets(prev => [...prev, ...spareFull.slice(0, sendable - prev.length)]);

    /** What a send moves: each slot file is the audio, cut at the device's limit. */
    const maxBytes = (usb.info?.maxFrames ?? DEVICE_MAX_FRAMES) * 8;
    const sendBytes = targets.reduce((n, _, i) => n + Math.min(items[i]?.blob.size ?? 0, maxBytes), 0);

    /** Stop, for a send or a download that would otherwise run for minutes. */
    const abortRef = useRef<AbortController | null>(null);
    const stopped = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

    /** The slots, from the card into the browser's downloads as a ZIP. */
    const backup = async (descs: SlotDescriptor[], title: string, fileName: string) => {
        if (!card || descs.length === 0) return;
        setError(null);
        setDone(null);
        const trace = route === 'usb' ? usbSession.note : () => undefined;
        const controller = new AbortController();
        abortRef.current = controller;
        const total = descs.reduce((n, d) => n + d.size, 0);
        const started = performance.now();
        let before = 0;
        trace(`download ${descs.length} slot${descs.length === 1 ? '' : 's'} as a ZIP: ${descs.map(d => key(d.tape, d.slot)).join(', ')}`);
        try {
            await downloadSlotsZip(card, descs, {
                title, fileName, signal: controller.signal,
                onProgress: (i, f) => {
                    before = descs.slice(0, i).reduce((n, d) => n + d.size, 0);
                    const moved = before + descs[i].size * f;
                    setProgress(`Reading ${key(descs[i].tape, descs[i].slot)} (${i + 1} of ${descs.length})`);
                    setFraction(f);
                    if (route === 'usb') setEta(usbSecondsLeft(total - moved, moved, (performance.now() - started) / 1000));
                },
            });
            trace(`download done: ${mb(total)} in ${((performance.now() - started) / 1000).toFixed(1)} s`);
            setBackedUp(prev => new Set([...prev, ...descs.map(d => key(d.tape, d.slot))]));
            setDone(`${descs.length} file${descs.length === 1 ? '' : 's'} saved to your downloads as ${fileName}.`);
        } catch (e) {
            const message = stopped(e) ? 'Stopped. Nothing was saved.' : e instanceof Error ? e.message : String(e);
            trace(`download failed: ${message}`);
            setError(message);
        } finally {
            abortRef.current = null;
            setProgress(null);
            setFraction(null);
            setEta(null);
        }
    };
    const replacedSaved = replaced.length > 0 && replaced.every(d => backedUp.has(key(d.tape, d.slot)));
    const stamp = () => new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');

    const send = async () => {
        if (!card || targets.length === 0) return;
        setError(null);
        setDone(null);
        const controller = new AbortController();
        abortRef.current = controller;
        // Over USB the writes join the connect's trace, so "Copy diagnostics" has them.
        const trace = route === 'usb' ? usbSession.note : () => undefined;
        const plan = targets.map((at, i) => ({ it: items[i], at }));
        const where: string[] = [];
        const cut: string[] = [];
        let at: SlotRef | null = null;
        trace(`send ${plan.length} file${plan.length === 1 ? '' : 's'}: ${plan.map(p => key(p.at.tape, p.at.slot)).join(', ')} (${overwrites} replaced)`);
        try {
            await card.ensureLayout?.();
            const files: SlotFile[] = [];
            for (let i = 0; i < plan.length; i++) {
                setProgress(`Preparing ${plan[i].it.name} (${i + 1} of ${plan.length})`);
                files.push(await toSlotFile(plan[i].it.blob, {
                    name: plan[i].it.name, slicePoints: plan[i].it.cues, maxFrames: route === 'usb' ? usb.info?.maxFrames : undefined,
                }));
            }
            if (card.checkSpace) {
                const space = await card.checkSpace(plan.map((p, i) => ({ ...p.at, size: files[i].blob.size })));
                trace(`space: ${space.neededKiB} KiB needed, ${space.freeKiB} KiB free`);
                if (!space.ok) throw new Error(`Not enough room on the card: this needs ${mb(space.neededKiB * 1024)}, ${mb(space.freeKiB * 1024)} is free.`);
            }
            const total = files.reduce((n, f) => n + f.blob.size, 0);
            const runStarted = performance.now();
            let moved = 0;
            for (let i = 0; i < plan.length; i++) {
                const { it } = plan[i];
                at = plan[i].at;
                const slot = key(at.tape, at.slot);
                const size = files[i].blob.size;
                // The card reader's writes don't take the signal: Stop lands between slots.
                controller.signal.throwIfAborted();
                setProgress(`${it.name} → ${slot} (${i + 1} of ${plan.length})`);
                setFraction(0);
                const started = performance.now();
                await card.writeSlot(at.tape, at.slot, files[i].blob, {
                    compare: 'always',
                    signal: controller.signal,
                    onProgress: f => {
                        setFraction(f);
                        if (route === 'usb') {
                            const now = moved + size * f;
                            setEta(usbSecondsLeft(total - now, now, (performance.now() - runStarted) / 1000));
                        }
                    },
                });
                moved += size;
                const seconds = (performance.now() - started) / 1000;
                trace(`wrote ${slot} "${it.name}": ${mb(files[i].blob.size)} in ${seconds.toFixed(1)} s`);
                where.push(slot);
                if (files[i].truncated) cut.push(slot);
            }
            trace('send done');
            setDone(`In ${where.join(', ')}.${cut.length ? ` ${cut.join(', ')} ${cut.length === 1 ? 'was' : 'were'} longer than the device holds and ${cut.length === 1 ? 'was' : 'were'} cut to fit.` : ''}`);
            setTargets([]);
            onSent?.(where);
        } catch (e) {
            const message = stopped(e) ? 'Stopped.' : e instanceof Error ? e.message : String(e);
            trace(`send failed${at ? ` at ${key(at.tape, at.slot)}` : ''}: ${message}`);
            setError(`${message}${at ? ` ${key(at.tape, at.slot)} keeps the file it had.` : ''}`);
            if (where.length) {
                setDone(`In ${where.join(', ')} before it stopped.`);
                setTargets(prev => prev.slice(where.length));
                onSent?.(where);
            }
        } finally {
            abortRef.current = null;
            setProgress(null);
            setFraction(null);
            setEta(null);
            // Quietly: after a failed write the error above is the one worth showing.
            try { setSlots(await card.listSlots()); } catch { /* a lost USB connection reports itself */ }
            if (route === 'usb') void usbSession.refreshInfo();
        }
    };

    const importPicked = async () => {
        if (!card || !onImport) return;
        setError(null);
        const files: { file: File; tape: TapeColor; slot: number }[] = [];
        try {
            const chosen = ALL_SLOTS.filter(at => picked.has(key(at.tape, at.slot)));
            for (let i = 0; i < chosen.length; i++) {
                const { tape: t, slot: s } = chosen[i];
                setProgress(`Reading ${key(t, s)} (${i + 1} of ${chosen.length})`);
                files.push({ file: await card.readFile(t, s), tape: t, slot: s });
            }
            setProgress(`Adding to ${importInto}…`);
            await onImport(files);
            setDone(`${files.length} file${files.length === 1 ? '' : 's'} in ${importInto}.`);
            setPicked(new Set());
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setProgress(null);
        }
    };

    const busy = progress !== null;
    const routeButton = 'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg font-bold border transition-colors disabled:opacity-40';
    const smallButton = 'px-2.5 py-1 rounded-md text-[11px] font-bold border border-white/10 text-gray-300 hover:bg-white/5 hover:text-white disabled:opacity-40';
    return (
        <div className="fixed inset-0 z-[95] bg-black/75 flex items-center justify-center p-4" onClick={() => !busy && close()}>
            <div className="w-full max-w-lg max-h-full overflow-y-auto rounded-xl border border-white/10 bg-synthux-panel shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
                    {mode === 'send' ? <Upload size={18} className="text-synthux-orange" /> : <Download size={18} className="text-synthux-orange" />}
                    <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-bold uppercase tracking-widest text-synthux-orange">
                            {mode === 'send' ? 'Send to Spotykach' : 'Import from Spotykach'}
                        </div>
                        <div className="text-sm font-bold truncate">
                            {mode === 'send' ? (items.length === 1 ? items[0].name : `${items.length} ${itemNoun}`) : `${single ? 'A slot' : 'Slots'} into ${importInto}`}
                        </div>
                    </div>
                    <button onClick={close} disabled={busy} className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/10" aria-label="Close"><X size={18} /></button>
                </div>

                <div className="p-5 space-y-4 text-sm">
                    {!usbOn && !sdOn && (
                        <p className="text-[12px] text-gray-400">
                            This browser can reach neither: the SD card needs folder access (Chrome or Edge on a computer), USB needs the USB transfer
                            setting (Settings) and Web Serial.
                        </p>
                    )}
                    {(usbOn || sdOn) && (
                        <div className="flex gap-2">
                            {usbOn && (
                                <button onClick={() => pickRoute('usb')} disabled={busy} aria-pressed={route === 'usb'}
                                    className={`${routeButton} ${route === 'usb' ? 'border-synthux-orange bg-synthux-orange/15 text-synthux-orange' : 'border-white/10 text-gray-300 hover:bg-white/5'}`}>
                                    <Usb size={14} /> USB
                                </button>
                            )}
                            {sdOn && (
                                <button onClick={() => pickRoute('sd')} disabled={busy} aria-pressed={route === 'sd'}
                                    className={`${routeButton} ${route === 'sd' ? 'border-synthux-orange bg-synthux-orange/15 text-synthux-orange' : 'border-white/10 text-gray-300 hover:bg-white/5'}`}>
                                    <HardDrive size={14} /> SD card{sdName ? ` (${sdName})` : ''}
                                </button>
                            )}
                        </div>
                    )}

                    {route && (
                        <div className="flex justify-end -mt-2">
                            <button onClick={() => setShowHelp(v => !v)} aria-expanded={showHelp}
                                className={`flex items-center gap-1 text-[11px] ${showHelp ? 'text-white' : 'text-gray-500 hover:text-white'}`}>
                                <HelpCircle size={12} /> {route === 'usb' ? 'About USB' : 'About the card reader'}
                            </button>
                        </div>
                    )}
                    {showHelp && route === 'usb' && <UsbRouteInfo compact className="rounded-lg border border-white/10 bg-black/20 p-3" />}
                    {showHelp && route === 'sd' && <ReaderRouteInfo compact className="rounded-lg border border-white/10 bg-black/20 p-3" />}

                    {route === 'usb' && usb.status === 'connected' && (
                        <p className="flex items-center gap-1.5 text-[12px] text-synthux-green">
                            <Check size={13} /> {usb.info?.label ?? 'Spotykach'} is connected. Its audio is muted until you close this.
                        </p>
                    )}

                    {route === 'usb' && usb.status !== 'connected' && (
                        <>
                            <p className="text-[12px] text-gray-400">
                                Plug the Spotykach in over USB. Connecting switches it to transfer mode (the rings light up); it goes back to playing
                                when you close this.
                            </p>
                            {usb.status === 'needs-authorization' ? (
                                <div className="flex gap-2">
                                    <button onClick={() => void usbSession.authorize()}
                                        className="flex-1 px-4 py-2 rounded-lg font-bold border border-synthux-orange/40 bg-synthux-orange/10 text-synthux-orange hover:bg-synthux-orange/20">
                                        Authorise port
                                    </button>
                                    <button onClick={() => void usbSession.connect()}
                                        className="px-4 py-2 rounded-lg font-bold border border-white/10 text-gray-300 hover:bg-white/5">
                                        Try again
                                    </button>
                                </div>
                            ) : (
                                <button onClick={() => void usbSession.connect()} disabled={usb.status === 'connecting'}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-bold border border-synthux-orange/40 bg-synthux-orange/10 text-synthux-orange hover:bg-synthux-orange/20 disabled:opacity-50">
                                    {usb.status === 'connecting' ? <Loader size={14} className="animate-spin" /> : <Usb size={14} />} Connect
                                </button>
                            )}
                            {usb.error && (
                                <p className={`text-[12px] ${usb.status === 'needs-authorization' ? 'text-synthux-yellow' : 'text-synthux-red'}`}>
                                    {usb.error}
                                    {usb.step && usb.status !== 'needs-authorization' && <span className="block text-gray-500">Stopped at: {usb.step}</span>}
                                </p>
                            )}
                        </>
                    )}

                    {route === 'sd' && !sd && (
                        <>
                            <p className="text-[12px] text-gray-400">
                                {sdName
                                    ? <>The SD card Studio uses: <strong className="text-gray-200">{sdName}</strong>. Insert it in the card reader, then open it.</>
                                    : <>Pick the SD card&apos;s root folder (the one holding <code>SK</code>). Studio will use it too.</>}
                            </p>
                            <button onClick={openSd}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-bold border border-synthux-orange/40 bg-synthux-orange/10 text-synthux-orange hover:bg-synthux-orange/20">
                                <HardDrive size={14} /> {sdName ? `Open ${sdName}` : 'Pick the SD card'}
                            </button>
                        </>
                    )}

                    {card && !slots && !error && (
                        <p className="flex items-center gap-2 text-[12px] text-gray-400"><Loader size={13} className="animate-spin" /> Reading the card…</p>
                    )}

                    {card && slots && <>
                        {mode === 'send' && (
                            <div className="flex flex-wrap items-center gap-1.5">
                                <button onClick={autoFill} disabled={busy} className={smallButton}
                                    title="Each file into the next free slot, so nothing on the card is replaced">Auto fill</button>
                                <button onClick={inOrder} disabled={busy} className={smallButton}
                                    title="Blue 1, Blue 2 and on, in list order, whatever the slots hold">In order from B1</button>
                                <button onClick={() => setTargets([])} disabled={busy || targets.length === 0} className={smallButton}>Clear</button>
                                <span className="ml-auto text-[11px] text-gray-500">
                                    {targets.length} of {sendable} placed
                                </span>
                            </div>
                        )}

                        {/* The whole card at once: a row per tape, a column per slot. */}
                        <div className="grid grid-cols-[auto_repeat(6,minmax(0,1fr))] gap-1">
                            {TAPE_COLORS.map(t => (
                                <React.Fragment key={t}>
                                    <span title={t} className={`w-2 rounded-sm ${SWATCH[t]}`} />
                                    {Array.from({ length: SLOTS }, (_, i) => i + 1).map(s => {
                                        const there = taken(t, s);
                                        const order = mode === 'send' ? targets.findIndex(at => at.tape === t && at.slot === s) : -1;
                                        const isPicked = mode === 'import' && picked.has(key(t, s));
                                        const label = order >= 0
                                            ? `${key(t, s)}: ${items[order].name}${there ? `, replacing ${there.name || there.fileName}` : ''}`
                                            : there ? `${key(t, s)}: ${there.name || there.fileName}` : `${key(t, s)}: free`;
                                        const look = order >= 0
                                            ? there ? 'border-synthux-red bg-synthux-red/20 text-white' : 'border-synthux-green bg-synthux-green/20 text-white'
                                            : isPicked ? 'border-white bg-white/15 text-white'
                                            : there ? 'border-synthux-yellow/30 bg-synthux-yellow/10 text-synthux-yellow/80 hover:bg-synthux-yellow/20'
                                            : 'border-white/10 text-gray-600 hover:bg-white/5';
                                        return (
                                            <button key={s} title={label} aria-label={label} aria-pressed={order >= 0 || isPicked}
                                                onClick={() => {
                                                    if (mode === 'send') { toggleTarget({ tape: t, slot: s }); return; }
                                                    setPicked(prev => {
                                                        if (prev.has(key(t, s))) { const next = new Set(prev); next.delete(key(t, s)); return next; }
                                                        return new Set(single ? [key(t, s)] : [...prev, key(t, s)]);
                                                    });
                                                }}
                                                disabled={busy || (mode === 'import' && !there)}
                                                className={`h-10 rounded border text-[11px] font-bold leading-tight transition-colors disabled:cursor-default ${mode === 'import' && !there ? 'opacity-30' : ''} ${look}`}>
                                                {order >= 0 ? <>{order + 1}<span className="block text-[8px] font-normal">{there ? 'replace' : 'new'}</span></>
                                                    : <>{t.charAt(0)}{s}<span className="block text-[8px] font-normal">{there ? 'full' : 'free'}</span></>}
                                            </button>
                                        );
                                    })}
                                </React.Fragment>
                            ))}
                        </div>

                        {slots.length > 0 && (
                            <button onClick={() => backup(ALL_SLOTS.map(at => taken(at.tape, at.slot)).filter((d): d is SlotDescriptor => !!d),
                                'Every slot on a Spotykach card, saved by WAV Builder', `spotykach-card-${stamp()}.zip`)}
                                disabled={busy}
                                className="flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-white disabled:opacity-40">
                                <Download size={12} /> Download all {slots.length} files on the card (ZIP{route === 'usb'
                                    ? `, about ${formatSeconds(slots.reduce((n, d) => n + d.size, 0) / USB_BYTES_PER_SECOND)}` : ''})
                            </button>
                        )}

                        {mode === 'send' ? (
                            <>
                                <p className="text-[11px] text-gray-500 leading-relaxed">
                                    Click a slot to put the next file there, click it again to take it back. Numbers follow the list order.
                                    {items.length > ALL_SLOTS.length && ` The card holds ${ALL_SLOTS.length}, so the last ${items.length - ALL_SLOTS.length} can't go on.`}
                                    {unplaced > 0 && (!unfit || skipRest) && ` ${unplaced} not placed: ${unplaced === 1 ? 'it stays' : 'they stay'} behind.`}
                                </p>
                                {/* Every free slot is taken and files are left: overwrite full slots for them, or leave them out. */}
                                {unfit && !skipRest && (
                                    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-synthux-yellow/30 bg-synthux-yellow/5 px-3 py-2 text-[11px] text-gray-300">
                                        <span className="flex-1 min-w-[10rem]">
                                            {unplaced} {unplaced === 1 ? "file doesn't" : "files don't"} fit in the free slots.
                                        </span>
                                        <button onClick={overwriteRest} disabled={busy} className={smallButton}
                                            title="The rest go into the first full slots, from B1 on. Or click the full slots you'd rather replace">
                                            Overwrite {Math.min(unplaced, spareFull.length)} full {Math.min(unplaced, spareFull.length) === 1 ? 'slot' : 'slots'}
                                        </button>
                                        <button onClick={() => setSkipRest(true)} disabled={busy} className={smallButton}>
                                            Skip {unplaced === 1 ? 'it' : 'them'}
                                        </button>
                                    </div>
                                )}
                                {items.length > 1 && (
                                    <details className="text-[11px] text-gray-400">
                                        <summary className="cursor-pointer text-gray-500 hover:text-white">What goes where</summary>
                                        <ol className="mt-1.5 max-h-40 overflow-y-auto space-y-0.5 font-mono">
                                            {items.slice(0, sendable).map((it, i) => (
                                                <li key={i} className="flex gap-2">
                                                    <span className="w-6 shrink-0 text-right text-gray-600">{i + 1}</span>
                                                    <span className="truncate flex-1">{it.name}</span>
                                                    <span className={targets[i] ? taken(targets[i].tape, targets[i].slot) ? 'text-synthux-red' : 'text-synthux-green' : 'text-gray-600'}>
                                                        {targets[i] ? key(targets[i].tape, targets[i].slot) : 'not placed'}
                                                    </span>
                                                </li>
                                            ))}
                                        </ol>
                                    </details>
                                )}

                                {/* Written straight onto the card, with no copy kept: said every time, louder when it replaces something. */}
                                <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-[11px] leading-relaxed ${overwrites > 0
                                    ? 'border-synthux-red/50 bg-synthux-red/10 text-red-200'
                                    : 'border-synthux-yellow/30 bg-synthux-yellow/5 text-gray-300'}`}>
                                    <AlertTriangle size={14} className={`shrink-0 mt-0.5 ${overwrites > 0 ? 'text-synthux-red' : 'text-synthux-yellow'}`} />
                                    <span>
                                        {overwrites > 0 && <strong className="block text-synthux-red">
                                            {overwrites} {overwrites === 1 ? 'slot holds a file' : 'slots hold files'} that will be overwritten.
                                        </strong>}
                                        Sending writes straight onto the card. A slot you send to loses the file it held, with no undo and no copy kept here.
                                        {overwrites > 0 && ' Use Auto fill to send to free slots only, or save them first.'}
                                        {overwrites > 0 && (
                                            <button onClick={() => backup(replaced, 'Spotykach slots replaced by a send from WAV Builder', `spotykach-slots-before-${stamp()}.zip`)}
                                                disabled={busy}
                                                className="mt-1.5 flex items-center gap-1.5 font-bold text-white hover:underline disabled:opacity-40">
                                                {replacedSaved
                                                    ? <><Check size={12} className="text-synthux-green" /> Saved the {overwrites} {overwrites === 1 ? 'file' : 'files'} it replaces</>
                                                    : <><Download size={12} /> Download the {overwrites} {overwrites === 1 ? 'file' : 'files'} it replaces first (ZIP{route === 'usb'
                                                        ? `, about ${formatSeconds(replaced.reduce((n, d) => n + d.size, 0) / USB_BYTES_PER_SECOND)}` : ''})</>}
                                            </button>
                                        )}
                                    </span>
                                </div>
                                {onUseStudio && (
                                    <div className="flex items-start gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-[11px] text-gray-400 leading-relaxed">
                                        <FolderPlus size={14} className="shrink-0 mt-0.5 text-synthux-yellow" />
                                        <span>
                                            Building a card you want to keep? <strong className="text-gray-200">Studio</strong> keeps your samples in a project folder
                                            and shows what a sync will change before it writes, so files don&apos;t get lost.{' '}
                                            <button onClick={onUseStudio} disabled={busy} className="font-bold text-synthux-yellow hover:underline">Make it a Studio project</button>
                                        </span>
                                    </div>
                                )}

                                {route === 'usb' && targets.length > 0 && !busy && (
                                    <p className="text-[11px] text-gray-500 text-center">
                                        About {formatSeconds(sendBytes / USB_BYTES_PER_SECOND)} over USB for {mb(sendBytes)} (USB moves about 477 KB/s)
                                    </p>
                                )}
                                <button onClick={send} disabled={busy || targets.length === 0}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-bold bg-synthux-orange text-black hover:bg-synthux-orange/80 disabled:opacity-50">
                                    {busy ? <><Loader size={14} className="animate-spin" /> Sending…</>
                                        : targets.length === 0 ? 'Place files on the grid first'
                                        : <>Send {targets.length} {targets.length === 1 ? 'file' : 'files'}{overwrites > 0 ? `, overwrite ${overwrites}` : ''}</>}
                                </button>
                            </>
                        ) : (
                            <button onClick={importPicked} disabled={busy || picked.size === 0}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-bold bg-synthux-orange text-black hover:bg-synthux-orange/80 disabled:opacity-50">
                                {busy ? <><Loader size={14} className="animate-spin" /> Reading…</>
                                    : single ? <>Open {picked.size ? [...picked][0] : 'a slot'} in {importInto}</>
                                    : <>Import {picked.size || ''} into {importInto}</>}
                            </button>
                        )}
                    </>}

                    {progress && (
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <p className="flex-1 min-w-0 text-[12px] text-gray-400 truncate">
                                    {progress}{eta !== null && <span className="text-gray-500"> · about {formatSeconds(eta)} left</span>}
                                </p>
                                {abortRef.current && (
                                    <button onClick={() => abortRef.current?.abort()} className={smallButton}
                                        title="Stops after the slot in hand; a slot that was being written keeps its old file">Stop</button>
                                )}
                            </div>
                            {fraction !== null && (
                                <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                                    <div className="h-full bg-synthux-orange transition-[width]" style={{ width: `${Math.round(fraction * 100)}%` }} />
                                </div>
                            )}
                        </div>
                    )}
                    {done && <p className="flex items-start gap-1.5 text-[12px] text-synthux-green"><Check size={13} className="shrink-0 mt-0.5" /> {done}</p>}
                    {error && <p className="text-[12px] text-synthux-red">{error}</p>}
                    {route === 'usb' && <UsbDiagnosticsButton />}
                </div>
            </div>
        </div>
    );
};
