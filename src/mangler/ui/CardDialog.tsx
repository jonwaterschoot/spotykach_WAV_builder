import React, { useEffect, useState } from 'react';
import { Check, Download, HardDrive, Loader, Upload, Usb, X } from 'lucide-react';
import { toSlotFile } from '../../lib/audio/slotFile';
import type { CardBackend, SlotDescriptor } from '../../lib/card/cardBackend';
import { FolderBackend } from '../../lib/card/folderBackend';
import { usbTransferSupported, useUsbTransferEnabled } from '../../lib/usb/flag';
import { usbSession, useUsbSession } from '../../lib/usb/usbSession';
import { UsbDiagnosticsButton } from '../../components/UsbDiagnosticsButton';
import { useEscapeLayer } from '../../shell/escapeStack';
import { TAPE_COLORS, type TapeColor } from '../../types';
import { canPickFolder, ensureWorkspacePermission } from '../../utils/newProject';
import { getDirectoryHandle, saveDirectoryHandle } from '../../utils/storageUtils';

/**
 * The mangler and a Spotykach's card, both ways and both routes:
 *
 * - send: results into slots (one, or several into consecutive slots);
 * - import: slots into the source pool, cue points and all.
 *
 * Over USB (the device in transfer mode; closing this sends it back to MIDI and
 * play), or straight on the SD card in a card reader: the folder Studio uses as
 * its SD card, asked for once if Studio has none.
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
    onClose: () => void;
    onSent?: (where: string[]) => void;
    /** Import mode: the chosen slot files, as read. */
    onImport?: (files: { file: File; tape: TapeColor; slot: number }[]) => Promise<void> | void;
}

type Route = 'usb' | 'sd';
const SLOTS = 6;
const SWATCH: Record<TapeColor, string> = {
    Blue: 'bg-blue-500', Green: 'bg-green-500', Pink: 'bg-pink-400', Red: 'bg-red-600', Turquoise: 'bg-teal-400', Yellow: 'bg-yellow-400',
};

/** Slot n after (tape, slot), across the tapes in order; null past the last. */
const slotAfter = (tape: TapeColor, slot: number, n: number): { tape: TapeColor; slot: number } | null => {
    const at = TAPE_COLORS.indexOf(tape) * SLOTS + (slot - 1) + n;
    return at < TAPE_COLORS.length * SLOTS ? { tape: TAPE_COLORS[Math.floor(at / SLOTS)], slot: (at % SLOTS) + 1 } : null;
};

export const CardDialog: React.FC<CardDialogProps> = ({ mode, items = [], onClose, onSent, onImport }) => {
    const usbOn = useUsbTransferEnabled() && usbTransferSupported();
    const sdOn = canPickFolder();
    const [route, setRoute] = useState<Route | null>(sdOn && !usbOn ? 'sd' : usbOn && !sdOn ? 'usb' : null);
    const usb = useUsbSession();
    const [sd, setSd] = useState<FolderBackend | null>(null);
    const [sdName, setSdName] = useState<string | null>(null);
    const card: CardBackend | null = route === 'usb' ? (usb.status === 'connected' ? usb.backend : null) : route === 'sd' ? sd : null;
    const [tape, setTape] = useState<TapeColor>('Blue');
    const [slot, setSlot] = useState(1);
    const [slots, setSlots] = useState<SlotDescriptor[] | null>(null);
    /** Import: the slots picked, as "Tape n". */
    const [picked, setPicked] = useState<Set<string>>(new Set());
    const [progress, setProgress] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState<string | null>(null);

    const close = () => { if (route === 'usb') void usbSession.disconnect(); onClose(); };
    useEscapeLayer(true, () => { if (progress === null) close(); return true; });

    // The SD card Studio knows, by name, before asking for permission.
    useEffect(() => { getDirectoryHandle('sd').then(h => setSdName(h?.name ?? null)).catch(() => undefined); }, []);

    const list = async (backend: CardBackend) => {
        try { setSlots(await backend.listSlots()); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    };
    useEffect(() => { if (card) void list(card); }, [card]);

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
    const taken = (t: TapeColor, s: number) => slots?.find(d => d.tape === t && d.slot === s);
    // Send: where each item goes, from the chosen slot on.
    const plan = items.map((it, i) => ({ it, at: slotAfter(tape, slot, i) }));
    const overwrites = plan.filter(p => p.at && taken(p.at.tape, p.at.slot)).length;

    const send = async () => {
        if (!card) return;
        setError(null);
        setDone(null);
        const where: string[] = [];
        try {
            await card.ensureLayout?.();
            for (let i = 0; i < plan.length; i++) {
                const { it, at } = plan[i];
                if (!at) break;
                setProgress(`${it.name} → ${key(at.tape, at.slot)} (${i + 1} of ${plan.length})`);
                const file = await toSlotFile(it.blob, { name: it.name, slicePoints: it.cues });
                await card.writeSlot(at.tape, at.slot, file.blob, { compare: 'always' });
                where.push(key(at.tape, at.slot));
            }
            setDone(where.join(', '));
            onSent?.(where);
            await list(card);
            if (route === 'usb') void usbSession.refreshInfo();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            if (where.length) onSent?.(where);
        } finally {
            setProgress(null);
        }
    };

    const importPicked = async () => {
        if (!card || !onImport) return;
        setError(null);
        const files: { file: File; tape: TapeColor; slot: number }[] = [];
        try {
            const chosen = [...picked].map(k => { const [t, s] = k.split(' '); return { tape: t as TapeColor, slot: Number(s) }; });
            for (let i = 0; i < chosen.length; i++) {
                const { tape: t, slot: s } = chosen[i];
                setProgress(`Reading ${key(t, s)} (${i + 1} of ${chosen.length})`);
                files.push({ file: await card.readFile(t, s), tape: t, slot: s });
            }
            setProgress('Adding to the source pool…');
            await onImport(files);
            setDone(`${files.length} file${files.length === 1 ? '' : 's'} in the source pool`);
            setPicked(new Set());
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setProgress(null);
        }
    };

    const routeButton = 'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg font-bold border transition-colors disabled:opacity-40';
    return (
        <div className="fixed inset-0 z-[95] bg-black/75 flex items-center justify-center p-4" onClick={() => progress === null && close()}>
            <div className="w-full max-w-lg max-h-full overflow-y-auto rounded-xl border border-white/10 bg-synthux-panel shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
                    {mode === 'send' ? <Upload size={18} className="text-synthux-orange" /> : <Download size={18} className="text-synthux-orange" />}
                    <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-bold uppercase tracking-widest text-synthux-orange">
                            {mode === 'send' ? 'Send to Spotykach' : 'Import from Spotykach'}
                        </div>
                        <div className="text-sm font-bold truncate">
                            {mode === 'send' ? (items.length === 1 ? items[0].name : `${items.length} results, into consecutive slots`) : 'Slots into the source pool'}
                        </div>
                    </div>
                    <button onClick={close} disabled={progress !== null} className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/10" aria-label="Close"><X size={18} /></button>
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
                                <button onClick={() => { setRoute('usb'); setSlots(null); }} aria-pressed={route === 'usb'}
                                    className={`${routeButton} ${route === 'usb' ? 'border-synthux-orange bg-synthux-orange/15 text-synthux-orange' : 'border-white/10 text-gray-300 hover:bg-white/5'}`}>
                                    <Usb size={14} /> USB
                                </button>
                            )}
                            {sdOn && (
                                <button onClick={() => { setRoute('sd'); setSlots(null); }} aria-pressed={route === 'sd'}
                                    className={`${routeButton} ${route === 'sd' ? 'border-synthux-orange bg-synthux-orange/15 text-synthux-orange' : 'border-white/10 text-gray-300 hover:bg-white/5'}`}>
                                    <HardDrive size={14} /> SD card{sdName ? ` (${sdName})` : ''}
                                </button>
                            )}
                        </div>
                    )}

                    {route === 'usb' && usb.status !== 'connected' && (
                        <>
                            <p className="text-[12px] text-gray-400">
                                Plug the Spotykach in over USB. Connecting switches it to transfer mode (the rings light up); it goes back to playing
                                when you close this.
                            </p>
                            {usb.status === 'needs-authorization' ? (
                                <button onClick={() => void usbSession.authorize()}
                                    className="w-full px-4 py-2 rounded-lg font-bold border border-synthux-orange/40 bg-synthux-orange/10 text-synthux-orange hover:bg-synthux-orange/20">
                                    Authorise port
                                </button>
                            ) : (
                                <button onClick={() => void usbSession.connect()} disabled={usb.status === 'connecting'}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-bold border border-synthux-orange/40 bg-synthux-orange/10 text-synthux-orange hover:bg-synthux-orange/20 disabled:opacity-50">
                                    {usb.status === 'connecting' ? <Loader size={14} className="animate-spin" /> : <Usb size={14} />} Connect
                                </button>
                            )}
                            {usb.error && <p className="text-[12px] text-synthux-red">{usb.error}</p>}
                            {usb.error && <UsbDiagnosticsButton />}
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

                    {card && <>
                        <div className="flex gap-1.5">
                            {TAPE_COLORS.map(c => (
                                <button key={c} onClick={() => setTape(c)} title={c} aria-pressed={tape === c}
                                    className={`relative flex-1 h-8 rounded ${SWATCH[c]} ${tape === c ? 'ring-2 ring-white' : 'opacity-50 hover:opacity-80'}`}>
                                    {mode === 'import' && [...picked].some(k => k.startsWith(c)) && <span className="absolute top-0.5 right-1 h-1.5 w-1.5 rounded-full bg-white" />}
                                </button>
                            ))}
                        </div>
                        <div className="grid grid-cols-6 gap-1.5">
                            {Array.from({ length: SLOTS }, (_, i) => i + 1).map(s => {
                                const there = taken(tape, s);
                                const inPlan = mode === 'send' && plan.some(p => p.at?.tape === tape && p.at.slot === s);
                                const isPicked = picked.has(key(tape, s));
                                return (
                                    <button key={s}
                                        onClick={() => {
                                            if (mode === 'send') { setSlot(s); return; }
                                            if (!there) return;
                                            setPicked(prev => { const next = new Set(prev); if (next.has(key(tape, s))) next.delete(key(tape, s)); else next.add(key(tape, s)); return next; });
                                        }}
                                        disabled={mode === 'import' && !there}
                                        title={there ? `${tape} ${s}: ${there.fileName}` : `${tape} ${s}: empty`}
                                        className={`h-11 rounded border text-sm font-bold transition-colors disabled:opacity-30
                                            ${inPlan || isPicked ? 'border-white bg-white/15 text-white' : 'border-white/10 text-gray-400 hover:bg-white/5'}`}>
                                        {s}
                                        <span className={`block text-[8px] font-normal ${there ? 'text-synthux-yellow' : 'text-gray-600'}`}>{there ? 'full' : 'empty'}</span>
                                    </button>
                                );
                            })}
                        </div>

                        {mode === 'send' ? (
                            <>
                                {plan.some(p => !p.at) && <p className="text-[11px] text-synthux-red">Past the last slot: start earlier, or send fewer.</p>}
                                {overwrites > 0 && <p className="text-[11px] text-synthux-yellow">{overwrites} of these slots hold a sample: sending replaces {overwrites === 1 ? 'it' : 'them'}.</p>}
                                <button onClick={send} disabled={progress !== null || plan.some(p => !p.at)}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-bold bg-synthux-orange text-black hover:bg-synthux-orange/80 disabled:opacity-50">
                                    {progress !== null ? <><Loader size={14} className="animate-spin" /> Sending…</>
                                        : <>Send to {key(tape, slot)}{items.length > 1 ? ` … ${plan[plan.length - 1].at ? key(plan[plan.length - 1].at!.tape, plan[plan.length - 1].at!.slot) : '?'}` : ''}</>}
                                </button>
                            </>
                        ) : (
                            <button onClick={importPicked} disabled={progress !== null || picked.size === 0}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-bold bg-synthux-orange text-black hover:bg-synthux-orange/80 disabled:opacity-50">
                                {progress !== null ? <><Loader size={14} className="animate-spin" /> Reading…</> : <>Import {picked.size || ''} into the source pool</>}
                            </button>
                        )}
                    </>}

                    {progress && <p className="text-[12px] text-gray-400">{progress}</p>}
                    {done && <p className="flex items-center gap-1.5 text-[12px] text-synthux-green"><Check size={13} /> {mode === 'send' ? `In ${done}.` : `${done}.`}</p>}
                    {error && <p className="text-[12px] text-synthux-red">{error}</p>}
                </div>
            </div>
        </div>
    );
};
