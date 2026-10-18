import React, { useState } from 'react';
import { Check, Clipboard } from 'lucide-react';
import { usbSession } from '../lib/usb/usbSession';

/** Copies the last USB connect attempt, step by step, for a bug report. */
export const UsbDiagnosticsButton: React.FC<{ className?: string }> = ({ className = '' }) => {
    const [copied, setCopied] = useState(false);
    const copy = () => {
        void navigator.clipboard?.writeText(usbSession.diagnostics()).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };
    return (
        <button type="button" onClick={copy} title="Copies what happened during the last connect attempt"
            className={`flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-white ${className}`}>
            {copied ? <Check size={12} /> : <Clipboard size={12} />} {copied ? 'Copied' : 'Copy diagnostics'}
        </button>
    );
};
