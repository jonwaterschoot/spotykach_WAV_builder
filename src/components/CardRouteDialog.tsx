import React from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, Check, FilePlus, FolderOpen, Loader, Plug, Usb, X } from 'lucide-react';
import { RiSdCardMiniLine } from 'react-icons/ri';
import type { UsbState } from '../lib/usb/usbSession';
import type { CardSource } from './CardSourceBar';
import { useEscapeLayer } from '../shell/escapeStack';

export type ReaderCheck =
    | { status: 'checking' }
    | { status: 'none' }
    | { status: 'missing'; label: string }
    | { status: 'ok'; label: string; slots: number };

interface CardRouteDialogProps {
    route: CardSource;
    usb: UsbState;
    /** Occupied slots on the card over USB, once listed. */
    usbSlots: number | null;
    reader: ReaderCheck;
    projectName?: string;
    /** The open project has nothing in it: offer the whole card into it, not a build or a new project. */
    projectEmpty: boolean;
    onConnect: () => void;
    onAuthorize: () => void;
    onPickFolder: () => void;
    onBuild: () => void;
    onImportHere: () => void;
    onImportWholeHere: () => void;
    onImportWholeNew: () => void;
    onChooseSlotsNew: () => void;
    onClose: () => void;
}

const formatSize = (kib: number) => kib >= 1024 * 1024
    ? `${(kib / 1024 / 1024).toFixed(1)} GB`
    : `${(kib / 1024).toFixed(0)} MB`;

const slotsText = (n: number) => n === 0 ? 'no slots in use' : `${n} slot${n === 1 ? '' : 's'} in use`;

/**
 * What the header's SD | USB toggle opens: gets the route ready (connects USB,
 * checks the card folder), then asks what to do with the card.
 */
export const CardRouteDialog: React.FC<CardRouteDialogProps> = ({
    route, usb, usbSlots, reader, projectName, projectEmpty,
    onConnect, onAuthorize, onPickFolder, onBuild, onImportHere, onImportWholeHere, onImportWholeNew, onChooseSlotsNew, onClose,
}) => {
    useEscapeLayer(true, () => { onClose(); return true; });
    const busy = route === 'usb' && usb.status === 'connecting';
    const ready = route === 'usb' ? usb.status === 'connected' : reader.status === 'ok';

    let status: React.ReactNode;
    if (route === 'usb') {
        if (usb.status === 'connected') {
            status = (
                <p className="flex items-start gap-2 text-green-400">
                    <Check size={16} className="shrink-0 mt-0.5" />
                    <span>
                        {usb.info?.label ?? 'Spotykach'} is connected.
                        <span className="block text-gray-400 text-xs mt-0.5">
                            {usbSlots === null ? 'Reading the card…' : `The card has ${slotsText(usbSlots)}`}
                            {usb.info?.freeKiB !== undefined && ` · ${formatSize(usb.info.freeKiB)} free`}
                            . Its audio is muted until you disconnect.
                        </span>
                    </span>
                </p>
            );
        } else if (busy) {
            status = <p className="flex items-center gap-2 text-gray-300"><Loader size={16} className="animate-spin" /> Switching Spotykach to transfer mode…</p>;
        } else if (usb.status === 'needs-authorization') {
            status = (
                <div className="flex flex-col gap-3">
                    <p className="flex items-start gap-2 text-amber-400"><AlertTriangle size={16} className="shrink-0 mt-0.5" /> {usb.error}</p>
                    <div className="flex gap-2">
                        <button onClick={onAuthorize} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"><Usb size={13} /> Authorise port</button>
                        <button onClick={onConnect} className="px-4 py-2 rounded-lg border border-white/10 text-gray-300 hover:text-white text-xs font-bold">Try again</button>
                    </div>
                </div>
            );
        } else {
            status = (
                <div className="flex flex-col gap-3">
                    <p className={`flex items-start gap-2 ${usb.error ? 'text-red-400' : 'text-gray-300'}`}>
                        {usb.error && <AlertTriangle size={16} className="shrink-0 mt-0.5" />}
                        {usb.error ?? 'Connect Spotykach to this computer through its rear USB-C port.'}
                    </p>
                    <button onClick={onConnect} className="w-fit flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold">
                        <Plug size={13} /> {usb.error ? 'Try again' : 'Connect'}
                    </button>
                </div>
            );
        }
    } else {
        const browserNote = 'Browsers only show a picked folder\'s name, not where it is.';
        switch (reader.status) {
            case 'checking':
                status = <p className="flex items-center gap-2 text-gray-300"><Loader size={16} className="animate-spin" /> Checking the card folder…</p>;
                break;
            case 'ok':
                status = (
                    <p className="flex items-start gap-2 text-green-400" title={browserNote}>
                        <Check size={16} className="shrink-0 mt-0.5" />
                        <span>
                            Card folder <span className="text-white font-bold">{reader.label}</span> is available.
                            <span className="block text-gray-400 text-xs mt-0.5">The card has {slotsText(reader.slots)}.</span>
                        </span>
                    </p>
                );
                break;
            case 'missing':
            case 'none':
                status = (
                    <div className="flex flex-col gap-3">
                        <p className="flex items-start gap-2 text-amber-400" title={browserNote}>
                            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                            {reader.status === 'missing'
                                ? <span>Card folder <span className="font-bold">{reader.label}</span> can't be read. Insert the card, or pick its folder again.</span>
                                : 'No card folder picked yet.'}
                        </p>
                        <button onClick={onPickFolder} className="w-fit flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold">
                            <FolderOpen size={13} /> Pick card folder
                        </button>
                    </div>
                );
                break;
        }
    }

    const action = (icon: React.ReactNode, title: string, detail: string, onClick: () => void, secondary?: { label: string; onClick: () => void }) => (
        <div className="flex items-stretch rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
            <button
                onClick={onClick}
                disabled={!ready}
                className="flex-1 flex items-start gap-3 p-4 hover:bg-white/[0.06] text-left transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
            >
                <span className="p-2 rounded-lg bg-white/5 text-orange-400 shrink-0">{icon}</span>
                <span>
                    <span className="block text-sm font-bold text-white">{title}</span>
                    <span className="block text-xs text-gray-400 mt-0.5">{detail}</span>
                </span>
            </button>
            {secondary && (
                <button
                    onClick={secondary.onClick}
                    disabled={!ready}
                    className="px-4 border-l border-white/10 text-xs font-bold text-gray-400 hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-35 disabled:cursor-not-allowed whitespace-nowrap"
                >
                    {secondary.label}
                </button>
            )}
        </div>
    );

    const timeNote = route === 'usb' ? ' Over USB each full slot takes 20–40 s; you see the progress.' : '';

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div role="dialog" aria-labelledby="card-route-title"
                className="bg-[#151515] w-full max-w-md rounded-2xl border border-white/10 shadow-2xl flex flex-col overflow-hidden">
                <div className="flex items-center gap-3 px-6 py-4 border-b border-white/10 bg-[#1a1a1a]">
                    <span className="text-orange-400">{route === 'usb' ? <Usb size={18} /> : <RiSdCardMiniLine size={18} />}</span>
                    <h2 id="card-route-title" className="text-base font-bold text-white flex-1">
                        {route === 'usb' ? 'Spotykach over USB' : 'SD card in the card reader'}
                    </h2>
                    <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"><X size={18} /></button>
                </div>

                <div className="px-6 py-5 text-sm border-b border-white/5">{status}</div>

                <div className="px-6 py-5 flex flex-col gap-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">What do you want to do?</p>
                    {projectEmpty ? (
                        action(<ArrowLeft size={16} />, 'Import the whole card',
                            `${projectName ? `"${projectName}"` : 'This project'} is empty: every card slot goes into the same slot here, without a review.${timeNote}`,
                            onImportWholeHere, { label: 'Choose slots…', onClick: onImportHere })
                    ) : (<>
                        {action(<ArrowRight size={16} />, 'Build to the card',
                            `Write ${projectName ? `"${projectName}"` : 'this project'} to the card. You review every slot first.`, onBuild)}
                        {action(<ArrowLeft size={16} />, 'Import into this project',
                            'Add the card\'s files to this project, into the pool or into slots. You review every slot first.', onImportHere)}
                        {action(<FilePlus size={16} />, 'Import into a new project',
                            `A clean project with every card slot in the same slot, without a review.${timeNote}`,
                            onImportWholeNew, { label: 'Choose slots…', onClick: onChooseSlotsNew })}
                    </>)}
                </div>
            </div>
        </div>
    );
};
