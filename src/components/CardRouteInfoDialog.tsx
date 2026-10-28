import React from 'react';
import { AlertTriangle, Check, FolderOpen, Loader, Plug, Unplug, Usb, X } from 'lucide-react';
import { RiSdCardMiniLine } from 'react-icons/ri';
import type { UsbState } from '../lib/usb/usbSession';
import type { CardSource } from './CardSourceBar';
import { useEscapeLayer } from '../shell/escapeStack';
import { UsbDiagnosticsButton } from './UsbDiagnosticsButton';
import { ReaderRouteInfo, UsbRouteInfo } from './CardRouteInfo';

export type ReaderCheck =
    | { status: 'checking' }
    | { status: 'none' }
    | { status: 'missing'; label: string }
    | { status: 'ok'; label: string; slots: number };

interface CardRouteInfoDialogProps {
    route: CardSource;
    usb: UsbState;
    /** Occupied slots on the card over USB, once listed. */
    usbSlots: number | null;
    reader: ReaderCheck;
    onConnect: () => void;
    onAuthorize: () => void;
    onDisconnect: () => void;
    onPickFolder: () => void;
    /** Help ▸ Formatting Guide. */
    onOpenFormatting: () => void;
    /** Closes this and opens Build & Import. */
    onOpenImportBuild: () => void;
    onClose: () => void;
}

const formatSize = (kib: number) => kib >= 1024 * 1024
    ? `${(kib / 1024 / 1024).toFixed(1)} GB`
    : `${(kib / 1024).toFixed(0)} MB`;

const slotsText = (n: number) => n === 0 ? 'no slots in use' : `${n} slot${n === 1 ? '' : 's'} in use`;

const primaryButton = 'w-fit flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold';
const secondaryButton = 'w-fit flex items-center gap-1.5 px-4 py-2 rounded-lg border border-white/10 text-gray-300 hover:text-white text-xs font-bold';

/**
 * What the header's SD | USB toggle opens: picks the route, gets it ready
 * (connects USB, checks the card folder) and says what the route reaches and
 * needs. Building and importing stay in Import / Build.
 */
export const CardRouteInfoDialog: React.FC<CardRouteInfoDialogProps> = ({
    route, usb, usbSlots, reader, onConnect, onAuthorize, onDisconnect, onPickFolder, onOpenFormatting, onOpenImportBuild, onClose,
}) => {
    useEscapeLayer(true, () => { onClose(); return true; });

    let status: React.ReactNode;
    if (route === 'usb') {
        if (usb.status === 'connected') {
            const { info } = usb;
            status = (
                <div className="flex flex-col gap-3">
                    <p className="flex items-start gap-2 text-green-400">
                        <Check size={16} className="shrink-0 mt-0.5" />
                        <span>
                            {info?.label ?? 'Spotykach'} is connected.
                            <span className="block text-gray-400 text-xs mt-0.5">
                                {usbSlots === null ? 'Reading the card…' : `The card has ${slotsText(usbSlots)}`}
                                {info?.freeKiB !== undefined && ` · ${formatSize(info.freeKiB)} free${info.totalKiB !== undefined ? ` of ${formatSize(info.totalKiB)}` : ''}`}
                                . Its audio is muted until you disconnect.
                            </span>
                        </span>
                    </p>
                    <button onClick={onDisconnect} className={secondaryButton}><Unplug size={13} /> Disconnect</button>
                    <UsbDiagnosticsButton />
                </div>
            );
        } else if (usb.status === 'connecting') {
            status = (
                <div className="flex flex-col gap-3">
                    <p className="flex items-center gap-2 text-gray-300"><Loader size={16} className="animate-spin" /> Switching Spotykach to transfer mode…</p>
                    <UsbDiagnosticsButton />
                </div>
            );
        } else if (usb.status === 'needs-authorization') {
            status = (
                <div className="flex flex-col gap-3">
                    <p className="flex items-start gap-2 text-amber-400"><AlertTriangle size={16} className="shrink-0 mt-0.5" /> {usb.error}</p>
                    <div className="flex items-center gap-2">
                        <button onClick={onAuthorize} className={primaryButton}><Usb size={13} /> Authorise port</button>
                        <button onClick={onConnect} className={secondaryButton}>Try again</button>
                    </div>
                    <UsbDiagnosticsButton />
                </div>
            );
        } else {
            status = (
                <div className="flex flex-col gap-3">
                    <p className={`flex items-start gap-2 ${usb.error ? 'text-red-400' : 'text-gray-300'}`}>
                        {usb.error && <AlertTriangle size={16} className="shrink-0 mt-0.5" />}
                        <span>
                            {usb.error ?? 'Connect Spotykach to this computer through its rear USB-C port.'}
                            {usb.error && usb.step && <span className="block text-gray-400 text-xs mt-0.5">Stopped at: {usb.step}</span>}
                        </span>
                    </p>
                    <button onClick={onConnect} className={primaryButton}>
                        <Plug size={13} /> {usb.error ? 'Try again' : 'Connect'}
                    </button>
                    <UsbDiagnosticsButton />
                </div>
            );
        }
    } else {
        const browserNote = 'Browsers only show a picked folder\'s name, not where it is.';
        const pick = (
            <button onClick={onPickFolder} className={reader.status === 'ok' ? secondaryButton : primaryButton}>
                <FolderOpen size={13} /> {reader.status === 'none' ? 'Pick card' : 'Change card'}
            </button>
        );
        switch (reader.status) {
            case 'checking':
                status = <p className="flex items-center gap-2 text-gray-300"><Loader size={16} className="animate-spin" /> Checking the card…</p>;
                break;
            case 'ok':
                status = (
                    <div className="flex flex-col gap-3">
                        <p className="flex items-start gap-2 text-green-400" title={browserNote}>
                            <Check size={16} className="shrink-0 mt-0.5" />
                            <span>
                                Card <span className="text-white font-bold">{reader.label}</span> is available.
                                <span className="block text-gray-400 text-xs mt-0.5">It has {slotsText(reader.slots)}.</span>
                            </span>
                        </p>
                        {pick}
                    </div>
                );
                break;
            case 'missing':
            case 'none':
                status = (
                    <div className="flex flex-col gap-3">
                        <p className="flex items-start gap-2 text-amber-400" title={browserNote}>
                            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                            {reader.status === 'missing'
                                ? <span>Card <span className="font-bold">{reader.label}</span> can&apos;t be read. Insert it (checked again every 2 s), or pick it again.</span>
                                : 'No card picked yet.'}
                        </p>
                        {pick}
                    </div>
                );
                break;
        }
    }

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div role="dialog" aria-labelledby="card-route-title"
                className="bg-[#151515] w-full max-w-md max-h-[90vh] rounded-2xl border border-white/10 shadow-2xl flex flex-col overflow-hidden">
                <div className="flex items-center gap-3 px-6 py-4 border-b border-white/10 bg-[#1a1a1a] shrink-0">
                    <span className="text-orange-400">{route === 'usb' ? <Usb size={18} /> : <RiSdCardMiniLine size={18} />}</span>
                    <h2 id="card-route-title" className="text-base font-bold text-white flex-1">
                        {route === 'usb' ? 'Spotykach over USB' : 'SD card in the card reader'}
                    </h2>
                    <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"><X size={18} /></button>
                </div>

                <div className="overflow-y-auto min-h-0">
                    <div className="px-6 py-5 text-sm border-b border-white/5">{status}</div>
                    <div className="px-6 py-5">
                        {route === 'usb' ? <UsbRouteInfo /> : <ReaderRouteInfo onOpenFormatting={onOpenFormatting} />}
                    </div>
                </div>

                <p className="px-6 py-3 border-t border-white/10 bg-[#1a1a1a] text-xs text-gray-400 shrink-0">
                    Build and import with{' '}
                    <button type="button" onClick={onOpenImportBuild} className="text-orange-400 font-bold underline hover:text-white">Import / Build</button>.
                </p>
            </div>
        </div>
    );
};
