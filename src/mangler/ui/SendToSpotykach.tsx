import React, { useEffect, useState } from 'react';
import { Check, Loader, Usb, X } from 'lucide-react';
import { toSlotFile } from '../../lib/audio/slotFile';
import type { SlotDescriptor } from '../../lib/card/cardBackend';
import { usbSession, useUsbSession } from '../../lib/usb/usbSession';
import { useEscapeLayer } from '../../shell/escapeStack';
import { TAPE_COLORS, type TapeColor } from '../../types';

/**
 * One result straight into a slot on the Spotykach, over USB. The standalone
 * mangler only: inside Studio, results go into the project and the project is
 * what goes to the card. Connecting switches the Spotykach to transfer mode;
 * closing this sends it back to MIDI, so it plays (and the sequencer's link
 * works) again.
 */

interface SendToSpotykachProps {
    name: string;
    blob: Blob;
    /** Seconds: the result's cue points, written as the slot file's slices. */
    cues: number[];
    onClose: () => void;
    onSent: (where: string) => void;
}

const SWATCH: Record<TapeColor, string> = {
    Blue: 'bg-blue-500', Green: 'bg-green-500', Pink: 'bg-pink-400', Red: 'bg-red-600', Turquoise: 'bg-teal-400', Yellow: 'bg-yellow-400',
};

export const SendToSpotykach: React.FC<SendToSpotykachProps> = ({ name, blob, cues, onClose, onSent }) => {
    const usb = useUsbSession();
    const [tape, setTape] = useState<TapeColor>('Blue');
    const [slot, setSlot] = useState(1);
    const [slots, setSlots] = useState<SlotDescriptor[] | null>(null);
    const [progress, setProgress] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState<string | null>(null);
    const close = () => { void usbSession.disconnect(); onClose(); };
    useEscapeLayer(true, () => { if (progress === null) close(); return true; });

    // What is on the device, once connected: occupied slots are marked.
    useEffect(() => {
        if (usb.status !== 'connected' || !usb.backend) return;
        let alive = true;
        usb.backend.listSlots().then(list => { if (alive) setSlots(list); }).catch(() => undefined);
        return () => { alive = false; };
    }, [usb.status, usb.backend]);

    const slotsPerTape = 6;
    const taken = (t: TapeColor, s: number) => slots?.find(d => d.tape === t && d.slot === s);

    const send = async () => {
        const backend = usb.backend;
        if (!backend) return;
        setError(null);
        setDone(null);
        setProgress(0);
        try {
            const file = await toSlotFile(blob, { name, slicePoints: cues });
            await backend.writeSlot(tape, slot, file.blob, { compare: 'always', onProgress: setProgress });
            const where = `${tape} ${slot}`;
            setDone(where + (file.truncated ? ' (cut to the 42 s the Spotykach plays)' : ''));
            onSent(where);
            setSlots(await backend.listSlots().catch(() => slots));
            void usbSession.refreshInfo();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setProgress(null);
        }
    };

    return (
        <div className="fixed inset-0 z-[95] bg-black/75 flex items-center justify-center p-4" onClick={() => progress === null && close()}>
            <div className="w-full max-w-md rounded-xl border border-white/10 bg-synthux-panel shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
                    <Usb size={18} className="text-synthux-orange" />
                    <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-bold uppercase tracking-widest text-synthux-orange">Send to Spotykach</div>
                        <div className="text-sm font-bold truncate">{name}</div>
                    </div>
                    <button onClick={close} disabled={progress !== null} className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/10" aria-label="Close"><X size={18} /></button>
                </div>
                <div className="p-5 space-y-4 text-sm">
                    {usb.status !== 'connected' ? (
                        <>
                            <p className="text-[12px] text-gray-400">
                                Plug the Spotykach in over USB. Connecting switches it to transfer mode (the rings light up); it goes back to
                                playing when you close this.
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
                        </>
                    ) : (
                        <>
                            <div className="flex gap-1.5">
                                {TAPE_COLORS.map(c => (
                                    <button key={c} onClick={() => setTape(c)} title={c} aria-pressed={tape === c}
                                        className={`flex-1 h-8 rounded ${SWATCH[c]} ${tape === c ? 'ring-2 ring-white' : 'opacity-50 hover:opacity-80'}`} />
                                ))}
                            </div>
                            <div className="grid grid-cols-6 gap-1.5">
                                {Array.from({ length: slotsPerTape }, (_, i) => i + 1).map(s => {
                                    const there = taken(tape, s);
                                    return (
                                        <button key={s} onClick={() => setSlot(s)} aria-pressed={slot === s}
                                            title={there ? `${tape} ${s}: holds ${there.name || 'a sample'}; sending replaces it` : `${tape} ${s}: empty`}
                                            className={`h-10 rounded border text-sm font-bold transition-colors
                                                ${slot === s ? 'border-white bg-white/15 text-white' : 'border-white/10 text-gray-400 hover:bg-white/5'}`}>
                                            {s}
                                            {there && <span className="block text-[8px] font-normal text-synthux-yellow">full</span>}
                                        </button>
                                    );
                                })}
                            </div>
                            {taken(tape, slot) && <p className="text-[11px] text-synthux-yellow">{tape} {slot} holds {taken(tape, slot)?.name || 'a sample'}: sending replaces it.</p>}
                            <button onClick={send} disabled={progress !== null}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-bold bg-synthux-orange text-black hover:bg-synthux-orange/80 disabled:opacity-50">
                                {progress !== null ? <><Loader size={14} className="animate-spin" /> {Math.round(progress * 100)}%</> : <>Send to {tape} {slot}</>}
                            </button>
                            {done && <p className="flex items-center gap-1.5 text-[12px] text-synthux-green"><Check size={13} /> In {done}.</p>}
                            {error && <p className="text-[12px] text-synthux-red">{error}</p>}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
