import React, { useEffect, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Clipboard } from 'lucide-react';
import { usbSession } from '../lib/usb/usbSession';

/**
 * Copies the last USB connect attempt, step by step, for a bug report; Show
 * opens the same text below, kept current while a connect is running.
 */
export const UsbDiagnosticsButton: React.FC<{ className?: string }> = ({ className = '' }) => {
    const [copied, setCopied] = useState(false);
    const [open, setOpen] = useState(false);
    const [text, setText] = useState('');

    // The trace grows without a state change, so read it again while it's shown
    useEffect(() => {
        if (!open) return;
        const read = () => setText(usbSession.diagnostics());
        read();
        const timer = setInterval(read, 500);
        return () => clearInterval(timer);
    }, [open]);

    const copy = () => {
        void navigator.clipboard?.writeText(usbSession.diagnostics()).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };
    return (
        <div className={`flex flex-col gap-1.5 min-w-0 ${className}`}>
            <div className="flex items-center gap-3">
                <button type="button" onClick={copy} title="Copies what happened during the last connect attempt"
                    className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-white">
                    {copied ? <Check size={12} /> : <Clipboard size={12} />} {copied ? 'Copied' : 'Copy diagnostics'}
                </button>
                <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open}
                    className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-white">
                    {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />} {open ? 'Hide' : 'Show'}
                </button>
            </div>
            {open && (
                <pre className="text-[10px] text-gray-400 bg-black/30 border border-white/10 rounded-lg p-2 max-h-48 overflow-auto whitespace-pre-wrap break-words select-text">{text}</pre>
            )}
        </div>
    );
};
