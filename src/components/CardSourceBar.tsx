import React, { useState } from 'react';
import { AlertTriangle, Check, HelpCircle, Loader, Plug, Unplug, Usb } from 'lucide-react';
import { RiSdCardMiniLine } from 'react-icons/ri';
import type { UsbState } from '../lib/usb/usbSession';

export type CardSource = 'reader' | 'usb';

interface CardSourceBarProps {
    source: CardSource;
    onSourceChange: (source: CardSource) => void;
    /** The picked card folder, for the reader side. */
    readerLabel?: string;
    /** Occupied slots the reader found. */
    readerSlots?: number;
    /** The picked folder can't be read (card ejected), or none was picked. */
    readerMissing?: boolean;
    usb: UsbState;
    onConnect: () => void;
    onAuthorize: () => void;
    onDisconnect: () => void;
    /** The card against the project's last write (`describeSnapshotCheck`). */
    cardNote?: string | null;
    /** The note is a probable card swap, not just changes. */
    cardNoteIsWarning?: boolean;
    disabled?: boolean;
}

const formatSize = (kib: number) => kib >= 1024 * 1024
    ? `${(kib / 1024 / 1024).toFixed(1)} GB`
    : `${(kib / 1024).toFixed(0)} MB`;

/**
 * Where the sync modal reads and writes the card: the card reader (a picked
 * folder) or Spotykach's rear USB. On USB it also connects, and keeps
 * "Authorise port" in view while the device waits in transfer mode.
 */
export const CardSourceBar: React.FC<CardSourceBarProps> = ({
    source, onSourceChange, readerLabel, readerSlots, readerMissing, usb, onConnect, onAuthorize, onDisconnect,
    cardNote, cardNoteIsWarning, disabled,
}) => {
    const [showHelp, setShowHelp] = useState(false);
    const busy = usb.status === 'connecting';

    const tab = (value: CardSource, label: React.ReactNode) => (
        <button
            type="button"
            onClick={() => onSourceChange(value)}
            disabled={disabled || busy}
            aria-pressed={source === value}
            className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 disabled:cursor-not-allowed ${source === value ? 'bg-white/15 text-white' : 'text-gray-500 hover:text-white'}`}
        >
            {label}
        </button>
    );

    const button = (label: React.ReactNode, onClick: () => void, primary = false) => (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled || busy}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${primary
                ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg'
                : 'border border-white/10 text-gray-300 hover:text-white hover:border-white/20'}`}
        >
            {label}
        </button>
    );

    let status: React.ReactNode = null;
    let action: React.ReactNode = null;
    if (source === 'reader' && readerMissing) {
        status = (
            <span className="flex items-start gap-1.5 text-red-400">
                <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                {readerLabel
                    ? 'SD card not found. Insert it (it is rescanned as soon as it is back), or pick it again with Change SD.'
                    : 'No card folder picked yet. Pick it with Change SD, or use USB.'}
            </span>
        );
    } else if (source === 'reader') {
        status = (
            <span className="text-gray-500" title="Browsers only show a picked folder's name, not where it is.">
                {readerLabel
                    ? <>Card folder <span className="text-gray-300">{readerLabel}</span>{readerSlots !== undefined && <> · {readerSlots} slot{readerSlots === 1 ? '' : 's'} in use</>}</>
                    : 'No card folder picked'}
            </span>
        );
    } else if (usb.status === 'connected') {
        const { info } = usb;
        status = (
            <span className="flex items-center gap-1.5 text-green-400">
                <Check size={12} />
                {info?.label ?? 'Spotykach'}
                {info?.freeKiB !== undefined && info.totalKiB !== undefined && (
                    <span className="text-gray-500">· {formatSize(info.freeKiB)} free of {formatSize(info.totalKiB)}</span>
                )}
            </span>
        );
        action = button(<><Unplug size={12} /> Disconnect</>, onDisconnect);
    } else if (busy) {
        status = <span className="flex items-center gap-1.5 text-gray-400"><Loader size={12} className="animate-spin" /> Switching Spotykach to transfer mode…</span>;
    } else if (usb.status === 'needs-authorization') {
        status = <span className="flex items-start gap-1.5 text-amber-400"><AlertTriangle size={12} className="shrink-0 mt-0.5" /> {usb.error}</span>;
        action = <>
            {button(<><Usb size={12} /> Authorise port</>, onAuthorize, true)}
            {button('Try again', onConnect)}
        </>;
    } else {
        status = usb.error
            ? <span className="flex items-start gap-1.5 text-red-400"><AlertTriangle size={12} className="shrink-0 mt-0.5" /> {usb.error}</span>
            : <span className="text-gray-500">Connect Spotykach to this computer through its rear USB-C port.</span>;
        action = button(<><Plug size={12} /> {usb.error ? 'Try again' : 'Connect'}</>, onConnect, true);
    }

    return (
        <div className="px-6 py-3 bg-[#151515] border-b border-white/5 flex flex-col gap-2 shrink-0">
            <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1 p-0.5 bg-black/40 rounded-lg border border-white/5" role="group" aria-label="Card source">
                    {tab('reader', <><RiSdCardMiniLine size={11} /> Card reader</>)}
                    {tab('usb', <><Usb size={11} /> USB <span className="text-[8px] text-amber-400/80 normal-case tracking-normal">experimental</span></>)}
                </div>
                <div className="text-[11px] min-w-0 flex-1">{status}</div>
                <div className="flex items-center gap-2">
                    {action}
                    {source === 'usb' && (
                        <button
                            type="button"
                            onClick={() => setShowHelp(v => !v)}
                            aria-expanded={showHelp}
                            title="USB transfer help"
                            className={`p-1.5 rounded-lg transition-colors ${showHelp ? 'text-white bg-white/10' : 'text-gray-500 hover:text-white'}`}
                        >
                            <HelpCircle size={14} />
                        </button>
                    )}
                </div>
            </div>
            {source === 'usb' && showHelp && (
                <ul className="text-[11px] text-gray-400 leading-relaxed list-disc pl-5 flex flex-col gap-0.5">
                    <li>Needs firmware with USB transfer, and Chrome, Edge or another Chromium browser on a computer.</li>
                    <li>Connect Spotykach straight to a USB-A port on the computer with a good data cable. Avoid hubs, even powered ones: transfers there stalled and dropped off. Front USB-C ports can run at half speed.</li>
                    <li>Connect sends Spotykach into transfer mode: its rings light up and its audio is muted. Disconnect, or Play A or Play B on the device, brings it back.</li>
                    <li>The first time, the browser asks which port to use: select Spotykach. If that window was closed while the rings are lit, click Authorise port.</li>
                    <li>Windows: close apps that hold the Spotykach MIDI port (your DAW) before connecting.</li>
                    <li>Linux: your user needs to be in the <code>dialout</code> group for the serial port.</li>
                    <li>USB reaches the 36 slot files only. config.txt, the project copy on the card and Snapshot card to project need the card reader.</li>
                    <li>A full slot takes about 35 s each way (477 KB/s). For a full rebuild the card reader is much faster.</li>
                </ul>
            )}
            {cardNote && (
                <p className={`text-[11px] flex items-start gap-1.5 ${cardNoteIsWarning ? 'text-amber-400' : 'text-gray-400'}`}>
                    <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                    <span>{cardNote}{cardNoteIsWarning && ' Building binds this project to this card.'}</span>
                </p>
            )}
        </div>
    );
};
