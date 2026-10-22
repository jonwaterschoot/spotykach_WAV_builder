import { X, ExternalLink, Cpu, FileAudio, Bot, AlertTriangle, Save, HardDrive, CheckCircle2, XCircle, Monitor, Command, Terminal, ChevronDown, ChevronRight, BookOpen, FolderClosed, Scissors, UploadCloud, Library, Coffee, Send, Camera, Film, Maximize2, Dices, Usb, Link2, Check } from 'lucide-react';
import { version } from '../../package.json';
import { useEffect, useState } from 'react';
import { resolveAssetPath } from '../utils/assetUtils';
import { DISCORD_HANDLE, submissionEmail, submissionGuideLink, submissionMailto } from '../data/links';
import { hashForMode, modeFromHash } from '../shell/useAppMode';
import { USB_FIRMWARE } from '../lib/usb/flag';

interface AboutHelpModalProps {
    onClose: () => void;
    /**
     * Wipe every project, file and setting, then reload.
     *
     * Optional because the modal opens from three places now and only one of them
     * can honour it: Studio owns the project state the reset replaces. The hub and
     * the submission tool open the same modal for the same reading, and simply
     * don't draw the button — better than handing them a destructive action that
     * half-works from outside the workspace it belongs to.
     */
    onReset?: () => void;
    initialTab?: 'about' | 'help' | 'contribute';
    /** The Help section to open, for example 'formatting'. */
    initialSection?: string;
}


// Buy Me a Coffee's generator hands you a <script> from their CDN that renders the
// button in the Cookie typeface. This is that button rebuilt in markup instead, so
// no third-party script runs here — and it uses our own header font rather than
// pulling a fourth family from Google for one line of text.
const BuyMeACoffeeWidget = () => {
    return (
        <a
            href="https://www.buymeacoffee.com/jonwtr"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 px-6 py-2.5 rounded-xl bg-[#FFDD00] hover:bg-[#FFDD00]/90 transition-all hover:scale-105 active:scale-95 shadow-lg group border border-black/5 no-underline h-[50px]"
        >
            <span className="text-2xl drop-shadow-sm group-hover:rotate-12 transition-transform">🧠</span>
            <span className="text-black font-bold text-lg" style={{ fontFamily: 'var(--font-header)' }}>
                Buy me a coffee
            </span>
        </a>
    );
};

/**
 * One screenshot or video in the contribute tab.
 *
 * `pending` means the capture does not exist yet: the slot draws what belongs there
 * instead of a broken image, so the tab ships while the shot list is worked through.
 * Filling one in is dropping the file at the path already named here and deleting the
 * word `pending` — the path never changes, so re-shooting an existing capture is an
 * overwrite with no code change at all.
 *
 * Captures are WebP, and not out of tidiness: these are full-window shots of a dark
 * UI over a noise texture, which is close to the worst case for PNG. The four
 * submission ones come out around 60 kB each as WebP against 700 kB as PNG, on a tab
 * that shows six of them at once.
 */
const Shot = ({ src, alt, note, kind = 'image', pending = false }: {
    src: string;
    alt: string;
    note: string;
    kind?: 'image' | 'video';
    pending?: boolean;
}) => {
    const [zoomed, setZoomed] = useState(false);

    /*
     * Escape closes the zoom, not the modal underneath it.
     *
     * The modal's own Escape listener is on `window` and was registered first, so a
     * bubble-phase listener here would run second and close both at once. Capture
     * runs before every bubble-phase window listener, which makes stopping it here
     * the whole of the fix.
     */
    useEffect(() => {
        if (!zoomed) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            e.stopPropagation();
            setZoomed(false);
        };
        window.addEventListener('keydown', onKeyDown, true);
        return () => window.removeEventListener('keydown', onKeyDown, true);
    }, [zoomed]);

    if (pending) {
        const Icon = kind === 'video' ? Film : Camera;
        return (
            <div className="rounded-lg border border-dashed border-gray-700 bg-black/30 px-4 py-5 flex items-start gap-3">
                <Icon size={16} className="shrink-0 mt-0.5 text-gray-600" />
                <div className="min-w-0 space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 font-header">
                        {kind === 'video' ? 'Video to come' : 'Screenshot to come'}
                    </p>
                    <p className="text-xs text-gray-500 leading-relaxed">{note}</p>
                    <p className="text-[10px] font-mono text-gray-600 break-all">{src}</p>
                </div>
            </div>
        );
    }

    if (kind === 'video') {
        return (
            <div className="rounded-lg overflow-hidden border border-gray-800 bg-black/50 flex items-center">
                <video src={resolveAssetPath(src)} controls className="w-full h-auto max-h-96 object-contain mx-auto" />
            </div>
        );
    }

    /*
     * Clickable, because a full-window app capture letterboxed into `max-h-96`
     * inside an already-constrained modal lands at roughly 600px wide — enough to
     * recognise the screen, not enough to read a single label on it. The caption
     * carries the meaning; the zoom is there for when someone wants the detail.
     */
    return (
        <>
            <figure className="space-y-2">
                <button
                    type="button"
                    onClick={() => setZoomed(true)}
                    title="Click to enlarge"
                    className="group relative block w-full rounded-lg overflow-hidden border border-gray-800 bg-black/40
                        hover:border-gray-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-synthux-blue"
                >
                    <img src={resolveAssetPath(src)} alt={alt} className="w-full h-auto object-contain max-h-96 mx-auto" />
                    <span className="absolute bottom-2 right-2 flex items-center gap-1.5 rounded-md bg-black/70 px-2 py-1
                        text-[10px] font-bold uppercase tracking-wider text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Maximize2 size={11} /> Enlarge
                    </span>
                </button>
                <figcaption className="text-[11px] text-gray-500 leading-relaxed">{note}</figcaption>
            </figure>

            {zoomed && (
                <div
                    onClick={() => setZoomed(false)}
                    className="fixed inset-0 z-[120] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 md:p-10 cursor-zoom-out"
                >
                    <img src={resolveAssetPath(src)} alt={alt} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" />
                    <button
                        onClick={() => setZoomed(false)}
                        className="absolute top-4 right-4 p-2 rounded-full bg-black/60 text-gray-300 hover:text-white hover:bg-black/80 transition-colors"
                    >
                        <X size={22} />
                    </button>
                </div>
            )}
        </>
    );
};

export const AboutHelpModal = ({ onClose, onReset, initialTab = 'about', initialSection }: AboutHelpModalProps) => {
    const [activeTab, setActiveTab] = useState<'about' | 'help' | 'contribute'>(initialTab);
    const [expandedSection, setExpandedSection] = useState<string | null>(initialSection ?? 'concepts');
    const [linkCopied, setLinkCopied] = useState(false);
    const copyGuideLink = () => {
        void navigator.clipboard?.writeText(submissionGuideLink()).then(() => {
            setLinkCopied(true);
            setTimeout(() => setLinkCopied(false), 2000);
        });
    };

    /*
     * The submission tool opens this modal itself now, which makes the "open the
     * submission tool" card below into a link back to the screen it is covering.
     * Read once at mount rather than tracked: this modal is remounted per open, and
     * the hash cannot change underneath a modal that is holding focus.
     */
    const inSubmitTool = modeFromHash(window.location.hash) === 'submit';

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const toggleSection = (id: string) => {
        setExpandedSection(prev => prev === id ? null : id);
    };

    const SectionHeader = ({ id, title, icon: Icon }: { id: string, title: string, icon: any }) => (
        <button
            onClick={() => toggleSection(id)}
            className={`w-full flex items-center justify-between p-4 ${expandedSection === id ? 'bg-synthux-blue/20 text-white' : 'bg-gray-800/50 text-gray-300 hover:bg-gray-800'} transition-colors border-b border-gray-700 first:rounded-t-lg last:border-0`}
        >
            <div className="flex items-center gap-3">
                <Icon size={20} className={expandedSection === id ? 'text-synthux-blue' : 'text-gray-500'} />
                <span className="font-bold font-header uppercase tracking-wider">{title}</span>
            </div>
            {expandedSection === id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
    );

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 md:p-8">
            <div className="bg-synthux-panel border border-gray-800 rounded-2xl w-full max-w-4xl max-h-full md:max-h-[85vh] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">

                {/* Header */}
                <div className="flex justify-between items-center p-4 md:p-6 border-b border-gray-800 bg-black/20 shrink-0">
                    <div className="hidden md:block">
                        <h2 className="text-2xl font-bold bg-gradient-to-r from-synthux-orange to-synthux-yellow bg-clip-text text-transparent font-header flex items-center gap-3">
                            Spotykach WAV Builder
                        </h2>
                        <p className="text-gray-500 text-sm mt-1 font-body">Version {version}</p>
                    </div>
                    
                    <div className="flex-1 flex justify-center md:justify-end">
                        <div className="flex bg-gray-800/80 p-1.5 rounded-xl border border-gray-700/50 shadow-inner mr-0 md:mr-6 w-full md:w-auto">
                            <button
                                onClick={() => setActiveTab('about')}
                                className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 ${activeTab === 'about' ? 'bg-synthux-blue text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-gray-700/50'}`}
                            >
                                About
                            </button>
                            <button
                                onClick={() => setActiveTab('help')}
                                className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 ${activeTab === 'help' ? 'bg-synthux-blue text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-gray-700/50'}`}
                            >
                                Format Help
                            </button>
                            <button
                                onClick={() => setActiveTab('contribute')}
                                className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 ${activeTab === 'contribute' ? 'bg-synthux-blue text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-gray-700/50'}`}
                            >
                                Submission Guide
                            </button>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        className="absolute right-4 top-6 p-2 hover:bg-gray-800 rounded-full transition-colors text-gray-400 hover:text-white md:static"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto bg-black/10">
                    {activeTab === 'about' && (
                        <div className="p-6 md:p-8 space-y-8 font-body max-w-3xl mx-auto">
                            
                            {/* Compatibility Notice */}
                            <div className="bg-synthux-yellow/10 border border-synthux-yellow/30 p-4 rounded-lg flex items-start gap-3">
                                <div className="text-synthux-yellow mt-0.5">⚠️</div>
                                <div className="text-sm text-gray-300">
                                    <strong className="text-synthux-yellow block mb-1">Desktop Recommended</strong>
                                    This application is optimized for use on a <strong>Desktop Computer</strong> (Chrome/Edge) with a mouse/trackpad.
                                    <br />
                                    <span className="opacity-80 mt-1 block">
                                        <strong>Mobile/Touch Support:</strong> Functional (Beta). Audio processing works, but the layout is cramped on phones and file management (SD Card) varies by OS.
                                    </span>
                                </div>
                            </div>

                            {/* Mission */}
                            <div className="space-y-3">
                                <h3 className="text-lg font-semibold text-white flex items-center gap-2 font-header">
                                    <Cpu size={20} className="text-synthux-blue" />
                                    Purpose
                                </h3>
                                <p className="text-gray-300 leading-relaxed">
                                    This application is specifically designed to prepare audio files for the <strong className="text-white">Synthux Spotykach - the looper playground</strong>.
                                    It automatically handles the strict format requirements needed by the firmware, ensuring your samples assume the correct
                                    <span className="text-synthux-blue font-mono text-xs mx-1 px-1.5 py-0.5 bg-synthux-blue/20 rounded">48kHz Stereo WAV</span>
                                    format and folder structure.
                                </p>
                            </div>

                            {/* File Support */}
                            <div className="space-y-3">
                                <h3 className="text-lg font-semibold text-white flex items-center gap-2 font-header">
                                    <FileAudio size={20} className="text-synthux-green" />
                                    Supported Files
                                </h3>
                                <div className="bg-black/20 p-4 rounded-lg border border-gray-800">
                                    <ul className="list-disc list-inside text-gray-300 space-y-1">
                                        <li>All standard audio formats (MP3, WAV, AIF, OGG, etc.)</li>
                                        <li>Files are automatically converted to 48kHz / 32-bit / Stereo.</li>
                                        <li>Drag & Drop files directly onto slots or use the Import Folder button.</li>
                                    </ul>
                                </div>
                            </div>

                            {/* Tech Stack */}
                            <div className="space-y-3">
                                <h3 className="text-lg font-semibold text-white flex items-center gap-2 font-header">
                                    <Cpu size={20} className="text-synthux-pink" />
                                    Technology Stack
                                </h3>
                                <div className="bg-black/20 p-4 rounded-lg border border-gray-800 text-sm text-gray-300">
                                    Built with <span className="text-white font-bold">React</span>, <span className="text-white font-bold">Vite</span>, and <span className="text-white font-bold">TailwindCSS</span>.
                                    <br />
                                    Slot files are written by Synthux's own <code className="bg-gray-800 px-1 rounded text-synthux-blue">@synthuxacademy/spotykach-transfer</code> package, the encoder the firmware's uploader uses, which also runs USB transfer.
                                    <br />
                                    Written with LLM assistance: set up in <span className="text-synthux-pink font-bold">Google Antigravity</span>, continued with <span className="text-synthux-blue font-bold">Claude Code</span> in <span className="text-white font-bold">VS Code</span>.
                                    <br />
                                    <span className="text-gray-400">Fonts are self-hosted under the SIL Open Font License; nothing is fetched from a third party to render this page.</span>
                                </div>
                            </div>


                            {/* Support & Links */}
                            <div className="space-y-3">
                                <h3 className="text-lg font-semibold text-white flex items-center gap-2 font-header">
                                    <Coffee size={20} className="text-synthux-yellow" />
                                    Support & Links
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <a href="https://github.com/jonwaterschoot/spotykach_WAV_builder" target="_blank" rel="noreferrer"
                                        className="flex items-center justify-between p-4 bg-gray-800/50 hover:bg-gray-800 rounded-xl border border-gray-700 transition-all group">
                                        <span className="font-medium text-white group-hover:text-synthux-blue transition-colors">GitHub Repository</span>
                                        <ExternalLink size={16} className="text-gray-500 group-hover:text-white transition-colors" />
                                    </a>
                                    <a href="https://www.synthux.academy/community" target="_blank" rel="noreferrer"
                                        className="flex items-center justify-between p-4 bg-gray-800/50 hover:bg-gray-800 rounded-xl border border-gray-700 transition-all group">
                                        <span className="font-medium text-synthux-yellow group-hover:text-synthux-yellow-light transition-colors">Join Synthux Community</span>
                                        <ExternalLink size={16} className="text-gray-500 group-hover:text-white transition-colors" />
                                    </a>
                                </div>

                                <div className="mt-6 flex flex-col items-center bg-gray-800/30 p-6 rounded-xl border border-gray-700/50">
                                    <p className="text-gray-300 text-sm mb-6 text-center">If you find this tool useful, consider supporting its development!</p>
                                    <div className="hover:opacity-90 transition-opacity flex items-center h-[60px]">
                                        <BuyMeACoffeeWidget />
                                    </div>
                                </div>
                            </div>

                            {/* License & Credits */}
                            <div className="pt-6 border-t border-gray-800 text-center space-y-4">
                                <div className="text-xs text-gray-500 font-mono bg-black/40 p-3 rounded border border-gray-800/50 mx-auto max-w-md">

                                    <p className="font-bold text-gray-400 mb-1">LICENSE</p>
                                    DO WHAT THE FUCK YOU WANT TO PUBLIC LICENSE
                                    <br />
                                    Version 2, December 2004
                                    <br /><br />
                                    Copyright (C) 2026 @jonwtr
                                    <br />
                                    Everyone is permitted to copy and distribute verbatim or modified copies of this license document, and changing it is allowed as long as the name is changed.
                                </div>

                                <div className="flex items-center justify-center gap-2 text-gray-400 text-sm">
                                    <Bot size={16} />
                                    <span>Built by <a href="https://github.com/jonwaterschoot" target="_blank" rel="noreferrer" className="text-synthux-yellow hover:text-synthux-yellow-light hover:underline">@jonwaterschoot</a></span>
                                </div>

                                {onReset && (
                                    <div className="pt-4 pb-8">
                                        <button
                                            onClick={onReset}
                                            className="text-red-500 hover:text-red-400 text-xs font-bold uppercase tracking-wider hover:underline transition-colors"
                                        >
                                            Reset Application
                                        </button>
                                    </div>
                                )}
                            </div>

                        </div>
                    )}

                    {activeTab === 'help' && (
                        <div className="p-6 space-y-2">

                        {/* 0. Core Concepts */}
                        <div className="border border-gray-700 rounded-lg overflow-hidden">
                            <SectionHeader id="concepts" title="Core Concepts" icon={BookOpen} />

                            {expandedSection === 'concepts' && (
                                <div className="p-6 bg-black/20 text-gray-300 space-y-3 font-body">
                                    <p className="text-sm text-gray-400 mb-4">A quick overview of how this app works before you dive in.</p>
                                    <table className="w-full text-sm">
                                        <thead className="text-xs uppercase bg-gray-800 text-gray-400">
                                            <tr>
                                                <th className="px-3 py-2 rounded-l text-left w-40">Concept</th>
                                                <th className="px-3 py-2 rounded-r text-left">What it means</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-800">
                                            <tr className="bg-white/5">
                                                <td className="px-3 py-3 align-top">
                                                    <span className="flex items-center gap-2 text-indigo-400 font-semibold">
                                                        <FolderClosed size={14} /> Project
                                                    </span>
                                                </td>
                                                <td className="px-3 py-3 text-gray-300">
                                                    A collection of <strong className="text-white">6 Tapes × 6 Slots</strong>. State is saved in a <code className="bg-gray-800 px-1 rounded text-synthux-yellow">project.json</code> file in a local folder of your choice. You can have multiple projects.
                                                </td>
                                            </tr>
                                            <tr>
                                                <td className="px-3 py-3 align-top">
                                                    <span className="flex items-center gap-2 text-orange-400 font-semibold">
                                                        <HardDrive size={14} /> SD Structure
                                                    </span>
                                                </td>
                                                <td className="px-3 py-3 text-gray-300">
                                                    Spotykach needs a strict <code className="bg-gray-800 px-1 rounded text-synthux-orange">SK/</code> folder at the SD card root. This app's primary goal is to <strong className="text-white">build that structure</strong> and convert samples to <strong className="text-white">32-bit float WAV</strong>.
                                                </td>
                                            </tr>
                                            <tr className="bg-white/5">
                                                <td className="px-3 py-3 align-top">
                                                    <span className="flex items-center gap-2 text-pink-400 font-semibold">
                                                        <Scissors size={14} /> Audio Editor
                                                    </span>
                                                </td>
                                                <td className="px-3 py-3 text-gray-300">
                                                    The editor is <strong className="text-white">destructive</strong>: every save writes a new WAV file. A history of bounced files is kept, but overwritten files cannot be recovered. Back up samples you care about.
                                                </td>
                                            </tr>
                                            {/*
                                              * This row said "Build vs. Sync" until v4, and described a
                                              * two-way mirror between the work folder and the card that no
                                              * longer exists. The card is a build target now; backup is one
                                              * deliberate act to a folder picked at the time. See the v4
                                              * entry in CHANGELOG.md and `durabilityPrefs.ts`.
                                              */}
                                            <tr>
                                                <td className="px-3 py-3 align-top">
                                                    <span className="flex items-center gap-2 text-purple-400 font-semibold">
                                                        <UploadCloud size={14} /> Build vs. Backup
                                                    </span>
                                                </td>
                                                <td className="px-3 py-3 text-gray-300">
                                                    <span className="text-synthux-yellow font-semibold">Build for SD</span> writes your project into the hardware folder structure on the card: the <code className="bg-gray-800 px-1 rounded text-synthux-orange">SK/</code> folder, and by default <strong className="text-white">nothing else</strong>. The card is a build target, not a backup: it holds what the device plays, and you can rebuild it at any time.
                                                    <span className="block mt-2">
                                                        <span className="text-synthux-orange font-semibold">Backup</span> is a separate step, in <em>Settings ▸ Files ▸ Workspace backup</em>. It shows what it contains and what it weighs, then copies it to a folder you pick <strong className="text-white">at that moment</strong>; there is no remembered location and nothing is ever written behind your back.
                                                    </span>
                                                </td>
                                            </tr>
                                            <tr className="bg-white/5">
                                                <td className="px-3 py-3 align-top">
                                                    <span className="flex items-center gap-2 text-orange-300 font-semibold">
                                                        <Usb size={14} /> USB Transfer
                                                    </span>
                                                </td>
                                                <td className="px-3 py-3 text-gray-300">
                                                    <span className="text-orange-300 font-semibold">Beta.</span> With the 1.4.0 beta firmware, Studio and Preset to SD Card can reach the card while it stays in the Spotykach. Slower than a card reader; see <em>USB Transfer (beta)</em> below.
                                                </td>
                                            </tr>
                                            <tr>
                                                <td className="px-3 py-3 align-top">
                                                    <span className="flex items-center gap-2 text-sky-400 font-semibold">
                                                        <Save size={14} /> Saving
                                                    </span>
                                                </td>
                                                <td className="px-3 py-3 text-gray-300">
                                                    <strong className="text-white">Save</strong> writes the project to its folder on your drive. That is the copy that counts. <strong className="text-white">Auto-save</strong> is something else: a crash-recovery snapshot in the browser's own storage, on by default, so a closed tab or a crash doesn't cost you the session. It never writes to your drive.
                                                    <span className="block mt-2 text-gray-400">
                                                        Two extra copies are available in <em>Settings ▸ Files</em> and are <strong className="text-white">off by default</strong>: mirroring the project source onto the card, and snapshotting the card's <code className="bg-gray-800 px-1 rounded">SK/</code> folder back into the project folder after a build.
                                                    </span>
                                                </td>
                                            </tr>
                                            <tr className="bg-white/5">
                                                <td className="px-3 py-3 align-top">
                                                    <span className="flex items-center gap-2 text-teal-400 font-semibold">
                                                        <Library size={14} /> Library
                                                    </span>
                                                </td>
                                                <td className="px-3 py-3 text-gray-300">
                                                    Link any folder on your drive as a sample library. Library samples can be <strong className="text-white">shared across multiple projects</strong>. + Option to build a custom curated library of your favorite samples.
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* Sample Mangler */}
                        <div className="border border-gray-700 rounded-lg overflow-hidden">
                            <SectionHeader id="mangler" title="Sample Mangler" icon={Dices} />

                            {expandedSection === 'mangler' && (
                                <div className="p-6 bg-black/20 text-gray-300 space-y-3 font-body text-sm leading-relaxed">
                                    <p>
                                        The <strong className="text-white">Sample Mangler</strong> cuts random snippets out of a pool of sounds
                                        and joins them into one file of up to 42&nbsp;s. Set the ranges, generate a batch, keep what you like.
                                        Every snippet starts on a cue point, so the Spotykach&apos;s slice mode jumps from one to the next. Other
                                        samplers that read WAV cue points should pick them up too, though that&apos;s untested.
                                    </p>
                                    <p className="text-gray-400">
                                        It started when I played a friend some ambient textures and he asked: wouldn&apos;t samples with a lot of
                                        variance be more fun? This is that idea, taken literally.
                                    </p>
                                    <p className="text-gray-400">
                                        A result keeps the licences of the sounds it uses: personal-use sources mark it, and a source that allows
                                        no changes can&apos;t be saved.
                                    </p>
                                    <p className="text-gray-400">
                                        <strong className="text-gray-300">Polyphony</strong> (under Shape) lets snippets ring on while the next ones
                                        start, so a long one merges with several short ones; <em>Max layers</em> caps how many play at once.
                                        <strong className="text-gray-300"> Rests and soft parts</strong> (under Loudness) make room in the
                                        file: a rest is a snippet of silence that keeps its cue point, a soft part is a snippet turned down.
                                    </p>
                                    <p className="text-gray-400">
                                        <strong className="text-gray-300">Chop a drum loop:</strong> the scissors on a source open it up close.
                                        <em> Find hits</em> marks each sound (low, mid or high) and where it has died away; play, merge or drop
                                        them, then <em>Use as parts</em> (snippets come only from the hits, never the silence) or
                                        <em> Make a kit</em> (every hit once, a cue at each: one sound per slice on the Spotykach).
                                    </p>
                                    <p className="text-gray-400">
                                        <strong className="text-gray-300">Slices</strong> (top bar) keep single sounds: <em>To slices</em> from
                                        the hits, or from snippets selected in a result. Select some and <em>Make a kit</em>. The
                                        <strong className="text-gray-300"> Envelope</strong> group gives every snippet an attack and a decay.
                                    </p>
                                    <p className="text-gray-400">
                                        <strong className="text-gray-300">Tempo grid</strong> makes loops in time: an exact number of bars, every
                                        snippet whole steps long and starting on a beat line. The Spotykach reads no tempo; this is for playing the
                                        file as a loop.
                                    </p>
                                    <p className="text-gray-400">
                                        <strong className="text-gray-300">Sequence</strong> (top bar) is a step sequencer for your slices: four
                                        patterns of 16 steps, a chain, up to 8 tracks. Right-click (or long-press) a step for its velocity and a slice
                                        of its own. <em>Render</em> makes a result of the whole chain, with cues at the hits.
                                    </p>
                                    <p className="text-gray-400">
                                        <strong className="text-gray-300">Synth</strong> (top bar) makes kicks, snares, hats, claps, percussion,
                                        FM and noise sounds from ranges, like the mangler: every take is different. Keep them as slices, sources or
                                        results. In Studio, an empty slot&apos;s choice offers <em>Synth</em> too.
                                    </p>
                                    <p className="text-gray-400">
                                        <strong className="text-gray-300">Projects</strong> (the Project menu) save everything (pools, results,
                                        slices, sequence, synth and settings) to <em>Mangler/</em> in your workspace folder, or as a .mangler.zip.
                                        <em> Start fresh</em> empties it all. The dice buttons roll settings, patterns, slices and ranges; a <em>style</em> (a preset) keeps the settings dice near its sound, and a group&apos;s lock keeps that group as it is.
                                    </p>
                                    <p className="text-gray-400">
                                        <strong className="text-gray-300">Spotykach link:</strong> in Sequence, <em>Link</em> connects over MIDI.
                                        Lead sends clock and Start / Stop; Follow takes the Spotykach&apos;s clock; a track set to <em>SK A</em> or
                                        <em> SK B</em> plays that deck, note 60 plus the step&apos;s pitch.
                                    </p>
                                    <p className="text-gray-400">
                                        <strong className="text-gray-300">The Spotykach&apos;s card:</strong> results go into its slots, and slots come back as
                                        sources (<em>Card</em> in the source pool), over USB (with the USB setting on) or on the SD card in a card reader,
                                        the folder Studio uses as its SD card. The <em>Kept</em> menu above the results sends, saves or reuses every
                                        kept result at once.
                                    </p>
                                    <p className="text-gray-400">
                                        <strong className="text-gray-300">Track kinds:</strong> a <em>Cue</em> track plays a result or a file with cue
                                        points, each step&apos;s note picking a cue (C1 the first); a <em>CC</em> track drives a Spotykach control (position,
                                        size, pitch, grit, flux…) with a value per step or an LFO. A sequence <em>Scale</em> keeps pitches in key on the
                                        tracks that switch it on. Right-click a step for all its options.
                                    </p>
                                    <p className="text-gray-400">
                                        <strong className="text-gray-300">On a phone</strong> it switches to phone mode by itself (the phone
                                        button in the header): sources are mixed to mono, the pool warns from 2&nbsp;minutes, and a click
                                        makes at most 4 variations. The output is the same 48&nbsp;kHz stereo file.
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* 1. SD Card Structure */}
                        <div className="border border-gray-700 rounded-lg overflow-hidden">
                            <SectionHeader id="structure" title="SD Card Structure" icon={HardDrive} />

                            {expandedSection === 'structure' && (
                                <div className="p-6 bg-black/20 text-gray-300 space-y-6 font-body">
                                    <div className="bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-lg flex gap-3">
                                        <AlertTriangle className="text-yellow-500 shrink-0" />
                                        <div className="text-sm">
                                            <strong className="text-yellow-500 block mb-1">Important Safety Tips</strong>
                                            <ul className="list-disc list-inside space-y-1 opacity-90">
                                                <li>Lower volumes after loading new files!</li>
                                                <li>Insert card <strong>before</strong> powering up.</li>
                                                <li><strong>Do not hot-swap</strong> the card while powered on.</li>
                                            </ul>
                                        </div>
                                    </div>

                                    <div>
                                        <h4 className="text-white font-bold mb-2">The SK Folder</h4>
                                        <p className="mb-4">
                                            Spotykach uses a specific folder structure accessed by both decks. Everything resides inside the root folder named <code className="bg-gray-800 px-1.5 py-0.5 rounded text-white font-mono">SK</code>.
                                        </p>
                                        <p>
                                            Files must be in <strong>32-bit float 48kHz Stereo WAV</strong> format.
                                        </p>
                                    </div>

                                    <div className="grid md:grid-cols-2 gap-6">
                                        <div>
                                            <h4 className="text-white font-bold mb-2">Tapes & Navigation</h4>
                                            <p className="text-sm mb-2">Files are grouped into 6 "Tapes", corresponding to colors:</p>
                                            <ul className="space-y-2 text-sm">
                                                <li className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-blue-500"></span> <strong>B</strong>lue → Folder <code className="bg-gray-800 px-1 rounded">B</code></li>
                                                <li className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-green-500"></span> <strong>G</strong>reen → Folder <code className="bg-gray-800 px-1 rounded">G</code></li>
                                                <li className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-pink-500"></span> <strong>P</strong>ink → Folder <code className="bg-gray-800 px-1 rounded">P</code></li>
                                                <li className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-red-500"></span> <strong>R</strong>ed → Folder <code className="bg-gray-800 px-1 rounded">R</code></li>
                                                <li className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-cyan-400"></span> <strong>T</strong>urquoise → Folder <code className="bg-gray-800 px-1 rounded">T</code></li>
                                                <li className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-yellow-400"></span> <strong>Y</strong>ellow → Folder <code className="bg-gray-800 px-1 rounded">Y</code></li>
                                            </ul>
                                        </div>
                                        <div>
                                            <h4 className="text-white font-bold mb-2">File Naming</h4>
                                            <div className="bg-gray-800 p-4 rounded text-sm font-mono">
                                                SK/<br />
                                                ├── B/<br />
                                                │   ├── 1.WAV<br />
                                                │   ├── ...<br />
                                                │   └── 6.WAV<br />
                                                ├── G/<br />
                                                │   └── 1.WAV<br />
                                                └── ...<br />
                                            </div>
                                            <p className="text-xs text-gray-400 mt-2">
                                                The app writes these names in <strong>UPPERCASE</strong>. Recent firmware
                                                accepts either case, so <code className="bg-gray-800 px-1 rounded">B/1.WAV</code> and{' '}
                                                <code className="bg-gray-800 px-1 rounded">B/1.wav</code> both play.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="mt-4 pt-4 border-t border-gray-700">
                                        <h4 className="text-white font-bold mb-2">Hardware Verification</h4>
                                        <p className="text-sm text-gray-400 mb-3">
                                            Download this special test file to verify if your Spotykach can read WAV files with embedded metadata (INFO chunks) and slices (CUE chunks).
                                        </p>
                                        <button
                                            onClick={() => import('../utils/testWavGenerator').then(m => m.downloadTestWav())}
                                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors flex items-center gap-2 text-sm font-medium"
                                        >
                                            <Save size={16} /> Download Metadata Test File
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* USB Transfer (beta) */}
                        <div className="border border-gray-700 rounded-lg overflow-hidden">
                            <SectionHeader id="usb" title="USB Transfer (beta)" icon={Usb} />

                            {expandedSection === 'usb' && (
                                <div className="p-6 bg-black/20 text-gray-300 space-y-4 font-body text-sm leading-relaxed">
                                    <p>
                                        With beta firmware, WAV Builder reaches the SD card while it stays in the Spotykach, through the
                                        rear USB port. It suits the smaller jobs: a few slots, a preset, a recording pulled off the device.
                                    </p>
                                    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 space-y-3">
                                        <strong className="flex items-center gap-2 text-amber-300">
                                            <AlertTriangle size={16} /> Slow, and picky about cables
                                        </strong>
                                        <table className="w-full text-xs">
                                            <tbody className="divide-y divide-amber-500/15">
                                                <tr><td className="py-1.5 pr-3 text-gray-300">A full 42&nbsp;s slot</td><td className="py-1.5 text-white font-semibold">about 35&nbsp;s</td></tr>
                                                <tr><td className="py-1.5 pr-3 text-gray-300">A whole card, 36 slots</td><td className="py-1.5 text-white font-semibold">about 10 minutes</td></tr>
                                                <tr><td className="py-1.5 pr-3 text-gray-300">The same with a card reader</td><td className="py-1.5 text-white font-semibold">much faster</td></tr>
                                            </tbody>
                                        </table>
                                        <table className="w-full text-xs">
                                            <thead>
                                                <tr className="text-[10px] uppercase tracking-wider text-amber-300/80"><th className="pb-1 pr-3 text-left font-bold">Connection</th><th className="pb-1 text-left font-bold">In our tests</th></tr>
                                            </thead>
                                            <tbody className="divide-y divide-amber-500/15">
                                                <tr><td className="py-1.5 pr-3 text-gray-300">Straight into a USB-A port, good cable</td><td className="py-1.5 text-green-300 font-semibold">best, about 470&nbsp;KB/s</td></tr>
                                                <tr><td className="py-1.5 pr-3 text-gray-300">Front USB-C port</td><td className="py-1.5 text-amber-300 font-semibold">half speed</td></tr>
                                                <tr><td className="py-1.5 pr-3 text-gray-300">USB hub, even a powered USB&nbsp;3 one</td><td className="py-1.5 text-red-300 font-semibold">stalls, dropped connections</td></tr>
                                                <tr><td className="py-1.5 pr-3 text-gray-300">A poor or charge-only cable</td><td className="py-1.5 text-red-300 font-semibold">flickering device, or no connection</td></tr>
                                            </tbody>
                                        </table>
                                    </div>
                                    <ol className="list-decimal list-inside space-y-2">
                                        <li>
                                            <strong className="text-white">Flash firmware {USB_FIRMWARE.version}</strong> from Synthux's GitHub:{' '}
                                            <a href={USB_FIRMWARE.url} target="_blank" rel="noreferrer" className="text-synthux-blue underline hover:text-white">Spotykach {USB_FIRMWARE.version}</a>.
                                        </li>
                                        <li><strong className="text-white">Switch it on</strong> in Studio's <em>Settings ▸ System ▸ USB transfer</em>. It needs Chrome or Edge on a computer.</li>
                                        <li><strong className="text-white">Connect directly:</strong> a good data cable into a USB-A port on the computer, as in the table above.</li>
                                    </ol>
                                    <div className="bg-black/20 p-4 rounded-lg border border-gray-800 space-y-2">
                                        <p><strong className="text-white">Studio:</strong> click <em>USB</em> in the header. It connects and shows the status, what USB reaches and what to try if it doesn't connect (with <em>Copy diagnostics</em>). Then build or import with <em>Import / Build</em>: you review every slot first. <em>Import ▸ Into a new project</em> starts a clean project from the card.</p>
                                        <p><strong className="text-white">Preset to SD Card:</strong> <em>Write to SD card ▸ Over USB</em> shows which slots the preset fills and which files it replaces, and can save those to a ZIP first.</p>
                                        <p><strong className="text-white">What USB reaches.</strong> The 36 slot files, and with firmware {USB_FIRMWARE.version} or later also <code className="bg-gray-800 px-1 rounded">config.txt</code>, the README and the project file (<code className="bg-gray-800 px-1 rounded">SK/project.json</code>), so the card says the same whichever way you build. Over USB one file is at most 32 KB: a project of more than about 115 samples gets a shorter project file, listing only the samples in slots. Older firmware reaches the slot files only. The project copy and the SK backup on the card need the card reader.</p>
                                        <p><strong className="text-white">Transfer mode.</strong> While connected the Spotykach is silent; it plays again when you disconnect. If the cable comes out, the slot being written keeps its old file, and <em>Continue</em> picks up where it stopped.</p>
                                        <p><strong className="text-white">Windows:</strong> close apps that hold the Spotykach's MIDI port (your DAW) before connecting.</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* 2. Formatting Guide */}
                        <div className="border border-gray-700 rounded-lg overflow-hidden">
                            <SectionHeader id="formatting" title="Formatting Guide (FAT32)" icon={Save} />

                            {expandedSection === 'formatting' && (
                                <div className="p-6 bg-black/20 text-gray-300 space-y-6 font-body">
                                    <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-lg">
                                        <strong className="text-blue-400 block mb-1">Recommendation</strong>
                                        <p className="text-sm">
                                            32GB microSD cards are ideal (holding ~21 hours of audio). <br />
                                            Cards larger than 32GB require special tools to format as <strong>FAT32</strong>.
                                        </p>
                                    </div>

                                    <div className="space-y-6">
                                        {/* Windows */}
                                        <div>
                                            <h4 className="text-white font-bold flex items-center gap-2 mb-2">
                                                <Monitor size={18} /> Windows
                                            </h4>
                                            <p className="text-sm mb-2">Native Windows tools limit FAT32 formatting to 32GB.</p>
                                            <div className="bg-gray-800 p-3 rounded text-sm">
                                                <strong>Solution:</strong> Use <a href="http://ridgecrop.co.uk/index.htm?guiformat.htm" target="_blank" className="text-synthux-blue underline hover:text-white">GUIFormat</a> (Ridgecrop Consultants).
                                                <br />It is a simple tool that formats drives larger than 32GB to FAT32 in seconds.
                                            </div>
                                        </div>

                                        {/* MacOS */}
                                        <div>
                                            <h4 className="text-white font-bold flex items-center gap-2 mb-2">
                                                <Command size={18} /> macOS
                                            </h4>
                                            <ol className="list-decimal list-inside text-sm space-y-1">
                                                <li>Open <strong>Disk Utility</strong>.</li>
                                                <li>View &rarr; <strong>Show All Devices</strong>.</li>
                                                <li>Select the physical drive.</li>
                                                <li>Click <strong>Erase</strong>.</li>
                                                <li>Format: <strong>MS-DOS (FAT)</strong>.</li>
                                                <li>Scheme: <strong>Master Boot Record</strong> (Crucial!).</li>
                                            </ol>
                                        </div>

                                        {/* Linux */}
                                        <div>
                                            <h4 className="text-white font-bold flex items-center gap-2 mb-2">
                                                <Terminal size={18} /> Linux
                                            </h4>
                                            <ul className="list-disc list-inside text-sm space-y-1">
                                                <li><strong>GNOME Disks</strong>: Choose "Format Partition" &rarr; "Compatible with all systems (FAT)".</li>
                                                <li><strong>GParted</strong>: Format to <code>fat32</code>.</li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* 3. Card Compatibility */}
                        <div className="border border-gray-700 rounded-lg overflow-hidden">
                            <SectionHeader id="cards" title="Compatible Cards" icon={CheckCircle2} />

                            {expandedSection === 'cards' && (
                                <div className="p-6 bg-black/20 text-gray-300 font-body">
                                    <div className="grid md:grid-cols-2 gap-8">

                                        {/* Working */}
                                        <div>
                                            <h4 className="text-green-400 font-bold flex items-center gap-2 mb-4">
                                                <CheckCircle2 size={18} /> Working
                                            </h4>
                                            <table className="w-full text-sm text-left">
                                                <thead className="text-xs uppercase bg-gray-800 text-gray-400">
                                                    <tr>
                                                        <th className="px-3 py-2 rounded-l">Brand</th>
                                                        <th className="px-3 py-2 rounded-r">Size (GB)</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-800">
                                                    <tr className="bg-white/5"><td className="px-3 py-2">SanDisk Ultra</td><td className="px-3 py-2">32*, 64, 128*, 256</td></tr>
                                                    <tr><td className="px-3 py-2">SanDisk Extreme</td><td className="px-3 py-2">32*, 64, 128*</td></tr>
                                                    <tr className="bg-white/5"><td className="px-3 py-2">SanDisk Edge</td><td className="px-3 py-2">8*</td></tr>
                                                    <tr><td className="px-3 py-2">Kingston SDC10</td><td className="px-3 py-2">32*</td></tr>
                                                    <tr className="bg-white/5"><td className="px-3 py-2">Toshiba M203</td><td className="px-3 py-2">16*</td></tr>
                                                    <tr><td className="px-3 py-2">Samsung EVO Plus</td><td className="px-3 py-2">128**</td></tr>
                                                </tbody>
                                            </table>
                                            <div className="text-[10px] text-gray-500 mt-2">
                                                * Verified by users. <br />
                                                ** Had initial errors but seems to work.
                                            </div>
                                        </div>

                                        {/* Failing */}
                                        <div>
                                            <h4 className="text-red-400 font-bold flex items-center gap-2 mb-4">
                                                <XCircle size={18} /> Failing / Avoid
                                            </h4>
                                            <table className="w-full text-sm text-left">
                                                <thead className="text-xs uppercase bg-gray-800 text-gray-400">
                                                    <tr>
                                                        <th className="px-3 py-2 rounded-l">Brand</th>
                                                        <th className="px-3 py-2 rounded-r">Size (GB)</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-800">
                                                    <tr className="bg-white/5"><td className="px-3 py-2">PNY Elite</td><td className="px-3 py-2">32</td></tr>
                                                    <tr><td className="px-3 py-2">Netac Pro</td><td className="px-3 py-2">16</td></tr>
                                                    <tr className="bg-white/5"><td className="px-3 py-2">Generic / Off-brand</td><td className="px-3 py-2">Any</td></tr>
                                                </tbody>
                                            </table>
                                        </div>

                                    </div>

                                    <div className="mt-8 pt-6 border-t border-gray-800 text-center">
                                        <a
                                            href="https://www.notion.so/Spotykach-Recommended-microSD-Cards-2e96331933b880ab94e7e88996f8fd44?pvs=21"
                                            target="_blank"
                                            rel="noreferrer"
                                            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors inline-flex items-center gap-2 text-sm"
                                        >
                                            View Full List on Notion <ChevronRight size={14} />
                                        </a>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                    )}

                    {activeTab === 'contribute' && (
                        <div className="p-6 md:p-8 space-y-8 font-body max-w-3xl mx-auto text-gray-300">
                            <div className="space-y-3">
                                <h3 className="text-xl font-bold text-white flex items-center gap-2 font-header">
                                    <BookOpen size={20} className="text-synthux-blue" />
                                    Submission Guide
                                </h3>
                                <p className="leading-relaxed text-sm">
                                    Made sounds of your own, or a card worth sharing? Send it in as a <strong className="text-white">sample pack</strong> or
                                    a <strong className="text-white">preset</strong>, and it becomes part of the app for everyone.
                                </p>
                            </div>

                            {/* The tool first; everything below is background. */}
                            {inSubmitTool ? (
                                <button
                                    onClick={onClose}
                                    className="w-full text-left rounded-xl border border-synthux-turquoise/40 bg-synthux-turquoise/10 p-5
                                        hover:bg-synthux-turquoise/15 transition-colors"
                                >
                                    <span className="flex items-start gap-3">
                                        <Send size={20} className="shrink-0 mt-0.5 text-synthux-turquoise" />
                                        <span className="min-w-0">
                                            <strong className="block text-synthux-turquoise text-sm mb-1">Back to the form</strong>
                                            <span className="block text-xs text-gray-400 leading-relaxed">Your draft is saved as you go.</span>
                                        </span>
                                    </span>
                                </button>
                            ) : (
                                <a
                                    href={hashForMode('submit')}
                                    onClick={onClose}
                                    className="block rounded-xl border border-synthux-turquoise/40 bg-synthux-turquoise/10 p-5
                                        hover:bg-synthux-turquoise/15 transition-colors no-underline"
                                >
                                    <span className="flex items-start gap-3">
                                        <Send size={20} className="shrink-0 mt-0.5 text-synthux-turquoise" />
                                        <span className="min-w-0">
                                            <strong className="block text-synthux-turquoise text-sm mb-1">Open the submission tool</strong>
                                            <span className="block text-xs text-gray-400 leading-relaxed">
                                                Drop in your folder. The tool asks for what it needs and gives you one ZIP to send.
                                                Nothing is uploaded, and it remembers where you got to.
                                            </span>
                                        </span>
                                    </span>
                                </a>
                            )}

                            <div className="overflow-x-auto border border-gray-800 rounded-xl bg-black/20">
                                <table className="w-full text-xs text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-gray-800 bg-white/5 uppercase font-header tracking-wider text-gray-400 text-[10px]">
                                            <th className="px-4 py-3"></th>
                                            <th className="px-4 py-3">📦 Sample pack</th>
                                            <th className="px-4 py-3">🎛️ Preset</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-800 font-body">
                                        <tr>
                                            <td className="px-4 py-3 font-semibold text-white">What it is</td>
                                            <td className="px-4 py-3">A set of sounds with its own page in the Sample Browser.</td>
                                            <td className="px-4 py-3">A full card: which sound sits in which slot, with notes per tape.</td>
                                        </tr>
                                        <tr className="bg-white/5">
                                            <td className="px-4 py-3 font-semibold text-white">Size</td>
                                            <td className="px-4 py-3">10 sounds or more.</td>
                                            <td className="px-4 py-3">Up to 36 slots.</td>
                                        </tr>
                                        <tr>
                                            <td className="px-4 py-3 font-semibold text-white">How it's used</td>
                                            <td className="px-4 py-3">People pick sounds and place them themselves.</td>
                                            <td className="px-4 py-3">Loaded in one go, or written straight to a card.</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            <div className="space-y-6 border-t border-gray-800 pt-6">
                                <h4 className="text-base font-bold text-white flex items-center gap-2 font-header">
                                    <span className="text-lg">📷</span> What It Looks Like
                                </h4>

                                <div className="flex flex-col gap-6">
                                    <div className="bg-black/20 rounded-xl border border-gray-800 p-5 space-y-4">
                                        <div className="space-y-1">
                                            <h5 className="font-bold text-white text-sm font-header uppercase tracking-wider flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-synthux-turquoise"></span>
                                                The Submission Tool
                                            </h5>
                                            <p className="text-xs text-gray-400 leading-relaxed">
                                                Six steps, from your files to a ZIP. On the hub it&apos;s <em>Submit a pack</em>, under the doors.
                                            </p>
                                        </div>
                                        <div className="flex flex-col gap-4">
                                            <Shot
                                                src="/img/docs/submit-step2-audio.webp"
                                                alt="Step 2, the audio"
                                                note="Step 2: your files, with titles and categories you can edit."
                                            />
                                            <Shot
                                                src="/img/docs/submit-step5-preset.webp"
                                                alt="Step 5, the preset grid"
                                                note="Step 5: the 6×6 grid for a preset, with a tape's notes open."
                                            />
                                            <Shot
                                                src="/img/docs/submit-step6-review.webp"
                                                alt="Step 6, review and send"
                                                note="Step 6: what's still missing, and the download."
                                            />
                                            <Shot
                                                pending
                                                kind="video"
                                                src="/vid/docs/submit-pack-walkthrough.mp4"
                                                alt="A pack, end to end"
                                                note="A pack from start to finish."
                                            />
                                            <Shot
                                                pending
                                                kind="video"
                                                src="/vid/docs/submit-preset-from-packs.mp4"
                                                alt="A preset built from published packs"
                                                note="A preset made from packs already in the app."
                                            />
                                        </div>
                                    </div>

                                    <div className="bg-black/20 rounded-xl border border-gray-800 p-5 space-y-4">
                                        <div className="space-y-1">
                                            <h5 className="font-bold text-white text-sm font-header uppercase tracking-wider flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-synthux-blue"></span>
                                                Sample Browser
                                            </h5>
                                            <p className="text-xs text-gray-400 leading-relaxed">
                                                Where a pack ends up, next to people&apos;s own folders and the open archives.
                                            </p>
                                        </div>
                                        <div className="flex flex-col gap-4">
                                            <Shot
                                                src="/img/docs/samplebrowser_sidebar.jpg"
                                                alt="Sample Browser Sidebar"
                                                note="The Sample Browser, with the pool."
                                            />
                                            <Shot
                                                kind="video"
                                                src="/vid/docs/samplepackbrowser.mp4"
                                                alt="Browsing a sample pack"
                                                note="A pack page, and pooling a sample."
                                            />
                                        </div>
                                    </div>

                                    <div className="bg-black/20 rounded-xl border border-gray-800 p-5 space-y-4">
                                        <div className="space-y-1">
                                            <h5 className="font-bold text-white text-sm font-header uppercase tracking-wider flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-synthux-orange"></span>
                                                Presets
                                            </h5>
                                            <p className="text-xs text-gray-400 leading-relaxed">
                                                Where a preset ends up: loaded into Studio, or written straight to a card.
                                            </p>
                                        </div>
                                        <div className="flex flex-col gap-4">
                                            <Shot
                                                src="/img/docs/presets_menu.png"
                                                alt="Presets Menu"
                                                note="Preset to SD Card."
                                            />
                                            <Shot
                                                kind="video"
                                                src="/vid/docs/presetsbrowser_1.mp4"
                                                alt="Loading a preset"
                                                note="Loading a preset, then writing it to a card."
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4 border-t border-gray-800 pt-6">
                                <h4 className="text-base font-bold text-white flex items-center gap-2 font-header">
                                    <span className="text-lg">🎨</span> A sample pack
                                </h4>
                                <ul className="list-disc list-inside space-y-1.5 text-sm text-gray-300 bg-black/20 p-5 rounded-lg border border-gray-800">
                                    <li>Good-quality WAV or FLAC. We normalize and convert them later; the tool leaves your files as they are.</li>
                                    <li>At least 10 sounds. Subfolders become categories.</li>
                                    <li>The device plays the first 42 seconds. Longer files are fine.</li>
                                    <li>A landscape cover image, at least 1200×800.</li>
                                    <li>Your links (usernames are enough) and a licence.</li>
                                </ul>
                                <p className="text-xs text-gray-400">You don&apos;t need a Spotykach for this, or to know the app.</p>
                            </div>

                            <div className="space-y-4 border-t border-gray-800 pt-6">
                                <h4 className="text-base font-bold text-white flex items-center gap-2 font-header">
                                    <span className="text-lg">🎛️</span> A preset
                                </h4>
                                <ul className="list-disc list-inside space-y-1.5 text-sm text-gray-300 bg-black/20 p-5 rounded-lg border border-gray-800">
                                    <li>From a Studio project: <strong className="text-white">Export ▸ Prepare a submission</strong>.</li>
                                    <li>From packs in the app: pool sounds in the Sample Browser, press <strong className="text-white">Send to the submission tool</strong>, and arrange the grid there.</li>
                                    <li>Using sounds of your own? Send them as a pack with it, so the preset can find them.</li>
                                </ul>
                                <p className="text-xs text-gray-400">
                                    Only sharing with a friend? Studio&apos;s <strong className="text-gray-200">Export ▸ Project Preset</strong> is enough;
                                    they open it with <strong className="text-gray-200">Import</strong>.
                                </p>
                            </div>

                            <div className="space-y-4 border-t border-gray-800 pt-6">
                                <h4 className="text-base font-bold text-white flex items-center gap-2 font-header">
                                    <span className="text-lg">📦</span> What you get
                                </h4>
                                <p className="text-sm leading-relaxed">
                                    One ZIP with everything we need: your details, the licence, your preset and your audio, untouched.
                                    Keep it. Drop it back into the tool to pick up where you left off. The last step can also build an
                                    <code className="mx-1">SK/</code>folder, so you can try it on your own card first.
                                </p>
                            </div>

                            <div className="space-y-4 border-t border-gray-800 pt-6">
                                <h4 className="text-base font-bold text-white flex items-center gap-2 font-header">
                                    <span className="text-lg">📮</span> Where to send it
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="bg-black/20 p-4 rounded-lg border border-gray-800 space-y-1">
                                        <strong className="text-white text-sm block">Discord</strong>
                                        <p className="text-xs text-gray-400">
                                            <code className="text-synthux-blue">{DISCORD_HANDLE}</code>, also for questions before you start.
                                        </p>
                                    </div>
                                    <div className="bg-black/20 p-4 rounded-lg border border-gray-800 space-y-1">
                                        <strong className="text-white text-sm block">Email</strong>
                                        <p className="text-xs text-gray-400">
                                            <a href={submissionMailto()} className="text-synthux-blue hover:underline break-all">{submissionEmail()}</a>
                                        </p>
                                    </div>
                                </div>
                                <p className="text-xs text-gray-400 leading-relaxed">
                                    Share the ZIP as a link (WeTransfer, Drive, Dropbox). A preset without audio is small enough to attach.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-gray-800 pt-6 text-xs">
                                <button onClick={copyGuideLink} title={submissionGuideLink()}
                                    className="flex items-center justify-between p-3 rounded-lg bg-black/20 hover:bg-black/40 border border-gray-800 hover:border-synthux-blue/40 text-gray-300 hover:text-white transition-colors text-left">
                                    {linkCopied ? 'Link copied' : 'Copy a link to this guide'} {linkCopied ? <Check size={12} className="text-synthux-green" /> : <Link2 size={12} />}
                                </button>
                                <a href="https://github.com/jonwaterschoot/spotykach_WAV_builder/blob/main/public/presets/README.md" target="_blank" rel="noreferrer"
                                    className="flex items-center justify-between p-3 rounded-lg bg-black/20 hover:bg-black/40 border border-gray-800 hover:border-synthux-pink/40 text-gray-300 hover:text-white transition-colors no-underline">
                                    For maintainers: presets, scripts, schema <ExternalLink size={12} />
                                </a>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
