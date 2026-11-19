import React, { useState } from 'react';
import { Check, Clipboard, Terminal } from 'lucide-react';

const COMMAND = 'sudo usermod -aG dialout $USER';

/**
 * The fix for the package's Linux "can't open the serial port" error, as one
 * command to copy, with what `sudo` does to the system said plainly.
 */
export const UsbLinuxHelp: React.FC = () => {
    const [copied, setCopied] = useState(false);
    const copy = () => {
        void navigator.clipboard?.writeText(COMMAND).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };
    return (
        <div className="flex flex-col gap-2 text-xs text-gray-300 bg-white/5 border border-white/10 rounded-lg p-3">
            <p className="flex items-center gap-1.5 font-bold text-white"><Terminal size={13} /> On Linux: allow your user to use the USB port</p>
            <p>Paste this into a terminal and press Enter:</p>
            <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-md pl-2.5 pr-1 py-1 min-w-0">
                <code className="flex-1 min-w-0 font-mono text-[11px] text-orange-300 select-all break-all">{COMMAND}</code>
                <button type="button" onClick={copy}
                    className="shrink-0 flex items-center gap-1 px-2 py-1 rounded text-[11px] text-gray-300 hover:text-white hover:bg-white/10">
                    {copied ? <Check size={12} /> : <Clipboard size={12} />} {copied ? 'Copied' : 'Copy'}
                </button>
            </div>
            <p>Then <strong className="text-white">restart the computer</strong> (logging out isn&apos;t always enough) and connect again.</p>
            <p className="text-gray-400">
                <code className="font-mono">sudo</code> runs the command as administrator, so it asks for your password, and nothing shows as you type it.
                It changes one setting on your system: it adds your account to <code className="font-mono">dialout</code>, the group allowed to use USB serial devices.
                Nothing is installed. On Arch, Manjaro or EndeavourOS, type <code className="font-mono">uucp</code> instead of <code className="font-mono">dialout</code>.
            </p>
        </div>
    );
};
