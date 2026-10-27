import React, { useRef, useState } from 'react';
import { AlertTriangle, Check, FileDown, HardDrive, Loader, Unplug, Usb } from 'lucide-react';
import { useUsbSession, usbSession } from '../lib/usb/usbSession';
import type { UsbBackend } from '../lib/usb/usbBackend';
import { USB_FIRMWARE, usbTransferSupported, useUsbTransferEnabled } from '../lib/usb/flag';
import { generateConfigText, parseConfigText } from '../utils/configText';
import type { ProjectConfig } from '../types';
import { UsbDiagnosticsButton } from './UsbDiagnosticsButton';

/**
 * `config.txt` over Spotykach's rear USB, for the config editors (Config mode and
 * Studio's config window). Firmware with protocol 1.1 (1.4.0 and later)
 * reads and writes the file in transfer mode; it applies from the next power-on.
 *
 * Shares the one USB session with the sync window, so a connection made there is
 * used here and the other way round. Hidden when USB transfer is switched off.
 */
interface UsbConfigBarProps {
    config: ProjectConfig;
    /** The settings read from the device. Not called when it has no `config.txt`. */
    onRead: (config: ProjectConfig) => void;
    /** A finished read or write, for the container's own status line. */
    onDone?: (message: string) => void;
}

type Action = 'read' | 'write';

export const UsbConfigBar: React.FC<UsbConfigBarProps> = ({ config, onRead, onDone }) => {
    const enabled = useUsbTransferEnabled();
    const usb = useUsbSession();
    const [busy, setBusy] = useState<Action | null>(null);
    const [problem, setProblem] = useState<string | null>(null);
    // What was clicked before the browser asked for the port, so Authorise finishes it.
    const pending = useRef<Action | null>(null);

    if (!enabled || !usbTransferSupported()) return null;

    const run = async (action: Action, backend: UsbBackend) => {
        if (!backend.readConfig || !backend.writeConfig) {
            setProblem(`Settings over USB need firmware ${USB_FIRMWARE.version} or later. This Spotykach runs ${backend.hello.firmware || 'an older version'}: use the card reader, or update the firmware.`);
            return;
        }
        if (action === 'read') {
            const card = await backend.readConfig();
            const parsed = card ? parseConfigText(card.text) : null;
            if (card && !parsed) throw new Error('The config.txt on Spotykach could not be read.');
            // Nothing on the device leaves the settings on screen as they are, like the card reader does.
            if (parsed) onRead(parsed);
            onDone?.(parsed ? 'Read config.txt from Spotykach over USB.' : 'Spotykach has no config.txt yet. Write these settings to create it.');
        } else {
            await backend.writeConfig(generateConfigText(config), 'always');
            onDone?.('Written to SK/config.txt on Spotykach. It applies from the next power-on.');
        }
    };

    const start = async (action: Action) => {
        setBusy(action);
        setProblem(null);
        try {
            const backend = usb.backend?.connected ? usb.backend : await usbSession.connect();
            if (!backend) {
                // The session says why (needs a click to authorise, or an error).
                pending.current = action;
                return;
            }
            pending.current = null;
            await run(action, backend);
        } catch (e) {
            setProblem(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(null);
        }
    };

    const authorize = async () => {
        setBusy(pending.current ?? 'read');
        setProblem(null);
        try {
            const backend = await usbSession.authorize();
            const action = pending.current;
            pending.current = null;
            if (backend && action) await run(action, backend);
        } catch (e) {
            setProblem(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(null);
        }
    };

    const connecting = usb.status === 'connecting';
    const disabled = !!busy || connecting;
    const button = (label: React.ReactNode, onClick: () => void, primary = false) => (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed ${primary
                ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                : 'border border-gray-800 bg-black/40 text-gray-300 hover:text-white hover:bg-white/5'}`}
        >
            {label}
        </button>
    );

    let status: React.ReactNode;
    if (problem) {
        status = <span className="flex items-start gap-1.5 text-red-400"><AlertTriangle size={12} className="shrink-0 mt-0.5" /> {problem}</span>;
    } else if (connecting || busy) {
        status = <span className="flex items-center gap-1.5 text-gray-400"><Loader size={12} className="animate-spin" />
            {connecting ? 'Switching Spotykach to transfer mode…' : busy === 'read' ? 'Reading config.txt…' : 'Writing config.txt…'}</span>;
    } else if (usb.status === 'connected') {
        status = <span className="flex items-center gap-1.5 text-green-400"><Check size={12} /> {usb.info?.label ?? 'Spotykach'}</span>;
    } else if (usb.status === 'needs-authorization' || usb.error) {
        status = <span className="flex items-start gap-1.5 text-amber-400"><AlertTriangle size={12} className="shrink-0 mt-0.5" />
            <span>{usb.error}{usb.step && <span className="text-gray-500"> · stopped at: {usb.step}</span>}</span></span>;
    } else {
        status = <span className="text-gray-500">Or straight to Spotykach through its rear USB-C port, no card reader.</span>;
    }

    return (
        <div className="space-y-2 pt-3 border-t border-white/10">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-500">
                <Usb size={12} /> USB
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
                {button(<><FileDown size={14} /> Read over USB</>, () => void start('read'))}
                {button(<><HardDrive size={14} /> Write over USB</>, () => void start('write'), true)}
            </div>
            <div className="flex items-start justify-between gap-2 text-[11px]">
                <div className="min-w-0">{status}</div>
                <div className="flex items-center gap-2 shrink-0">
                    {(usb.error || problem) && <UsbDiagnosticsButton />}
                    {usb.status === 'needs-authorization' && !busy && button(<><Usb size={12} /> Authorise port</>, () => void authorize(), true)}
                    {usb.status === 'connected' && !busy && (
                        <button type="button" onClick={() => void usbSession.disconnect()} title="Spotykach goes back to playing"
                            className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-white">
                            <Unplug size={12} /> Disconnect
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
