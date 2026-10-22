import React from 'react';
import { USB_FIRMWARE } from '../lib/usb/flag';

/**
 * What each route to the card reaches and needs. One source for the route dialog
 * (SD / USB in the header) and the "?" panel in Build & Import, so the two say
 * the same things.
 */

interface InfoSection {
    title: string;
    body: React.ReactNode;
}

const code = (text: string) => <code className="bg-white/5 px-1 rounded text-gray-300">{text}</code>;

const USB_SECTIONS: InfoSection[] = [
    {
        title: 'What USB reaches',
        body: <>The 36 slot files, {code('config.txt')}, the notes ({code('README.md')}) and {code('SK/project.json')}, with firmware {USB_FIRMWARE.version} or later. Older firmware reaches the slot files only. The project copy and the SK backup need the card reader, and a preset&apos;s {code('config.txt')} settings don&apos;t reach the device over USB.</>,
    },
    {
        title: 'Needs',
        body: <>Firmware <a href={USB_FIRMWARE.url} target="_blank" rel="noreferrer" className="text-synthux-blue underline hover:text-white">{USB_FIRMWARE.version}</a>, and Chrome, Edge or another Chromium browser on a computer. Linux: your user needs to be in the {code('dialout')} group.</>,
    },
    {
        title: 'Cables and ports',
        body: 'A good data cable straight into a USB-A port on the computer. No hubs, even powered ones: transfers there stall and drop off. Front USB-C ports can run at half speed.',
    },
    {
        title: 'Transfer mode',
        body: 'Connecting lights up the rings and mutes the audio until you disconnect, or press Play A or Play B on the device. The first time, the browser asks which port to use: select Spotykach.',
    },
    {
        title: 'Windows',
        body: 'Close apps that hold the Spotykach MIDI port (your DAW, MIDI monitors) before connecting.',
    },
    {
        title: 'Speed',
        body: 'About 35 s per full slot each way. For a full rebuild the card reader is faster.',
    },
];

/** Each connect error, what it means, and what to try. */
const USB_ERRORS: [string, string][] = [
    ['MIDI port not found', 'The browser doesn\'t see Spotykach. Use the rear USB-C port and a data cable, and check it is switched on.'],
    ['Didn\'t give access to MIDI', 'Another app or tab holds MIDI. Close it, then Try again.'],
    ['MIDI access was denied', 'Allow MIDI for this site in the browser\'s site settings, then Try again.'],
    ['MIDI port didn\'t respond / may not support USB transfer', `The firmware has no USB transfer: flash ${USB_FIRMWARE.version}.`],
    ['Select Spotykach in the port picker', 'The rings are lit and the device waits for its port: click Authorise port and select it.'],
    ['Can\'t open the serial port / didn\'t open or answer', 'Another tab or app holds the port, or the cable or port is flaky. Close other WAV Builder and Spotykach tabs, try another port.'],
];

const USB_TRY: React.ReactNode =
    'Another USB-A port, closing MIDI apps, then Try again. If the rings stay lit, switch the Spotykach off and on. Still stuck: Copy diagnostics and send it along.';

const READER_SECTIONS = (formatting: React.ReactNode): InfoSection[] => [
    {
        title: 'Pick the card itself',
        body: <>Not a folder on it: pick the drive root, the one that holds {code('SK')}. Browsers only show a picked folder&apos;s name, not where it is.</>,
    },
    {
        title: 'What the reader reaches',
        body: <>Everything: the slot files, {code('config.txt')}, the notes, the project copy and the SK backup. Much faster than USB.</>,
    },
    {
        title: 'Formatting',
        body: <>FAT32. Cards over 32 GB need a tool to format as FAT32: see {formatting}.</>,
    },
];

const Sections: React.FC<{ sections: InfoSection[]; compact?: boolean }> = ({ sections, compact }) => compact ? (
    <ul className="list-disc pl-5 flex flex-col gap-0.5">
        {sections.map(s => <li key={s.title}><span className="text-gray-300">{s.title}:</span> {s.body}</li>)}
    </ul>
) : (
    <div className="flex flex-col gap-3">
        {sections.map(s => (
            <div key={s.title}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-0.5">{s.title}</p>
                <p>{s.body}</p>
            </div>
        ))}
    </div>
);

/** USB: what it reaches, cables, transfer mode, and what each connect error means. */
export const UsbRouteInfo: React.FC<{ compact?: boolean; className?: string }> = ({ compact, className = '' }) => (
    <div className={`text-[11px] text-gray-400 leading-relaxed flex flex-col gap-3 ${className}`}>
        <Sections sections={USB_SECTIONS} compact={compact} />
        <details className="group">
            <summary className="cursor-pointer select-none text-gray-300 hover:text-white">If it doesn&apos;t connect</summary>
            <dl className="mt-2 flex flex-col gap-1.5 pl-3 border-l border-white/10">
                {USB_ERRORS.map(([error, meaning]) => (
                    <div key={error}>
                        <dt className="text-gray-300">&ldquo;{error}&rdquo;</dt>
                        <dd>{meaning}</dd>
                    </div>
                ))}
                <div className="mt-1"><dt className="text-gray-300">What to try</dt><dd>{USB_TRY}</dd></div>
            </dl>
        </details>
    </div>
);

/**
 * The card reader: pick the card itself, what it reaches, formatting.
 * `onOpenFormatting` makes "the Formatting Guide" a link into Help.
 */
export const ReaderRouteInfo: React.FC<{ compact?: boolean; className?: string; onOpenFormatting?: () => void }> = ({ compact, className = '', onOpenFormatting }) => {
    const formatting = onOpenFormatting
        ? <button type="button" onClick={onOpenFormatting} className="text-synthux-blue underline hover:text-white">the Formatting Guide in Help</button>
        : <em>Help ▸ Formatting Guide</em>;
    return (
        <div className={`text-[11px] text-gray-400 leading-relaxed ${className}`}>
            <Sections sections={READER_SECTIONS(formatting)} compact={compact} />
        </div>
    );
};
