import { AlertTriangle, Usb } from 'lucide-react';
import { setUsbTransferEnabled, USB_FIRMWARE, usbTransferSupported, useUsbTransferEnabled } from '../lib/usb/flag';

/**
 * Settings ▸ System: the USB transfer switch. On by default; turning it off hides the
 * USB routes and keeps the card reader only.
 */
type ExplainerProps = { short: React.ReactNode; more?: React.ReactNode; className?: string };

/** `Explainer` is the settings modal's own short/more text, passed in to match it. */
export function UsbTransferSetting({ Explainer }: { Explainer: React.FC<ExplainerProps> }) {
    const enabled = useUsbTransferEnabled();
    const supported = usbTransferSupported();

    return (
        <div className="space-y-3 pt-4 border-t border-white/10">
            <h3 className="text-[10px] font-bold text-orange-400/80 uppercase tracking-widest flex items-center gap-2">
                <Usb size={12} /> USB
            </h3>
            <div className={`rounded-lg border transition-colors ${enabled ? 'bg-orange-500/10 border-orange-500/30' : 'bg-white/[0.02] border-white/5'}`}>
                <button
                    type="button"
                    onClick={() => setUsbTransferEnabled(!enabled)}
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
                    more={<>Needs firmware {USB_FIRMWARE.version} or later on the device, and Chrome or Edge on a computer.
                        Adds an SD | USB switch to the sync window. Use a good data cable straight to a USB-A port, not
                        through a hub. The card reader is faster for a full rebuild: over USB a full slot takes about 35 seconds.</>}
                />
                {enabled && !supported && (
                    <p className="pr-3 pb-3 pl-[56px] flex items-start gap-1.5 text-[11px] text-amber-300">
                        <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                        This browser can't reach USB devices. Use Chrome or Edge on a computer.
                    </p>
                )}
            </div>
        </div>
    );
}
