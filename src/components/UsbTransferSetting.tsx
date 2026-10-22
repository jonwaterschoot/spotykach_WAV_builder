import { useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, ExternalLink, FlaskConical, Usb } from 'lucide-react';
import { setUsbTransferEnabled, USB_FIRMWARE, usbTransferSupported, useUsbTransferEnabled } from '../lib/usb/flag';

/**
 * Settings ▸ System ▸ Experimental: the USB transfer switch. Turning it on asks first,
 * since it needs beta firmware; turning it off doesn't.
 */
type ExplainerProps = { short: React.ReactNode; more?: React.ReactNode; className?: string };

/** `Explainer` is the settings modal's own short/more text, passed in to match it. */
export function UsbTransferSetting({ Explainer }: { Explainer: React.FC<ExplainerProps> }) {
    const enabled = useUsbTransferEnabled();
    const [confirming, setConfirming] = useState(false);
    const supported = usbTransferSupported();

    const toggle = () => {
        if (enabled) setUsbTransferEnabled(false);
        else setConfirming(true);
    };

    return (
        <div className="space-y-3 pt-4 border-t border-white/10">
            <h3 className="text-[10px] font-bold text-orange-400/80 uppercase tracking-widest flex items-center gap-2">
                <FlaskConical size={12} /> Experimental
            </h3>
            <div className={`rounded-lg border transition-colors ${enabled ? 'bg-orange-500/10 border-orange-500/30' : 'bg-white/[0.02] border-white/5'}`}>
                <button
                    type="button"
                    onClick={toggle}
                    aria-pressed={enabled}
                    className="w-full px-3 pt-3 pb-1.5 text-left flex items-center gap-3"
                >
                    <div className={`w-8 h-[18px] rounded-full p-0.5 shrink-0 transition-colors ${enabled ? 'bg-orange-500' : 'bg-white/10'}`}>
                        <div className={`w-[14px] h-[14px] rounded-full bg-white transition-transform ${enabled ? 'translate-x-[14px]' : 'translate-x-0'}`} />
                    </div>
                    <p className={`text-[12px] font-bold flex items-center gap-1.5 ${enabled ? 'text-orange-300' : 'text-gray-400'}`}>
                        <Usb size={12} /> USB transfer
                    </p>
                </button>
                <Explainer
                    className="pr-3 pb-3 pl-[56px]"
                    short="Sync with Spotykach over its rear USB port, without taking the SD card out."
                    more={<>Needs firmware {USB_FIRMWARE.version} on the device, and Chrome or Edge on a computer.
                        Adds an SD | USB switch to the sync window.</>}
                />
            </div>

            {confirming && createPortal(
                // Portalled out of the settings card, but React still bubbles clicks up to
                // the settings backdrop, which would close it: stop them here.
                <div className="fixed inset-0 z-[80] bg-black/60 flex items-center justify-center p-4" onClick={e => { e.stopPropagation(); setConfirming(false); }}>
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="usb-experimental-title"
                        className="w-full max-w-[420px] max-h-full overflow-y-auto bg-[#161616] border border-orange-500/30 rounded-xl shadow-2xl p-5 space-y-4"
                        onClick={e => e.stopPropagation()}
                    >
                        <h2 id="usb-experimental-title" className="text-sm font-bold text-white flex items-center gap-2">
                            <FlaskConical size={16} className="text-orange-400" /> USB transfer is experimental
                        </h2>
                        <div className="space-y-2 text-[12px] text-gray-300 leading-relaxed">
                            <p>
                                It works only with Spotykach firmware <strong className="text-white">{USB_FIRMWARE.version}</strong>,
                                a beta release. On the current release (1.3.1) the device won't answer over USB.
                            </p>
                            <a
                                href={USB_FIRMWARE.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 text-orange-300 hover:text-orange-200 underline underline-offset-2"
                            >
                                Firmware {USB_FIRMWARE.version} on GitHub <ExternalLink size={11} />
                            </a>
                            <p className="text-gray-400">
                                Use a good data cable, from Spotykach straight to a USB-A port on the computer. Avoid hubs, even powered ones.
                            </p>
                            <p className="text-gray-400">
                                The card reader stays the safer route for a full rebuild: over USB a full slot takes about 35 seconds.
                                Slot files written over USB play on 1.3.1 too.
                            </p>
                            {!supported && (
                                <p className="flex items-start gap-1.5 text-amber-300">
                                    <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                                    This browser can't reach USB devices. Use Chrome or Edge on a computer.
                                </p>
                            )}
                        </div>
                        <div className="flex justify-end gap-2 pt-1">
                            <button
                                onClick={() => setConfirming(false)}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => { setUsbTransferEnabled(true); setConfirming(false); }}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-orange-600 hover:bg-orange-500 text-white transition-colors"
                            >
                                Turn on USB transfer
                            </button>
                        </div>
                    </div>
                </div>,
                document.body,
            )}
        </div>
    );
}
