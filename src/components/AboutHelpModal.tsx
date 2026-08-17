import { X, ExternalLink, Cpu, FileAudio, Bot, AlertTriangle, Save, HardDrive, CheckCircle2, XCircle, Monitor, Command, Terminal, ChevronDown, ChevronRight, BookOpen, FolderClosed, Scissors, UploadCloud, Library, Coffee, Copy, Check } from 'lucide-react';
import { version } from '../../package.json';
import { useEffect, useState } from 'react';
import { resolveAssetPath } from '../utils/assetUtils';
import { DISCORD_HANDLE, SUBMISSION_GUIDE_URL, submissionEmail, submissionMailto } from '../data/links';

interface AboutHelpModalProps {
    onClose: () => void;
    onReset: () => void;
    initialTab?: 'about' | 'help' | 'contribute';
}


const BuyMeACoffeeWidget = () => {
    return (
        <>
            <style>
                {`@import url('https://fonts.googleapis.com/css2?family=Cookie&display=swap');`}
            </style>
            <a 
                href="https://www.buymeacoffee.com/jonwtr" 
                target="_blank" 
                rel="noreferrer"
                className="flex items-center gap-3 px-6 py-2.5 rounded-xl bg-[#FFDD00] hover:bg-[#FFDD00]/90 transition-all hover:scale-105 active:scale-95 shadow-lg group border border-black/5 no-underline h-[50px]"
            >
                <span className="text-2xl drop-shadow-sm group-hover:rotate-12 transition-transform">🧠</span>
                <span className="text-black font-bold text-xl" style={{ fontFamily: "'Cookie', cursive" }}>
                    Buy me a coffee
                </span>
            </a>
        </>
    );
};

export const AboutHelpModal = ({ onClose, onReset, initialTab = 'about' }: AboutHelpModalProps) => {
    const [activeTab, setActiveTab] = useState<'about' | 'help' | 'contribute'>(initialTab);
    const [expandedSection, setExpandedSection] = useState<string | null>('concepts');
    const [templateCopied, setTemplateCopied] = useState(false);

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
                                Sample & Preset Guide
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
                                    Assisted by <span className="text-synthux-pink font-bold">Google Deepmind</span>'s experimental agentic coding models.
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
                                    <div className="flex flex-col md:flex-row items-center justify-center gap-8">
                                        <div className="hover:opacity-90 transition-opacity flex items-center h-[60px]">
                                            <BuyMeACoffeeWidget />
                                        </div>
                                        <div className="hidden md:block w-px h-16 bg-gray-700"></div>
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

                                <div className="pt-4 pb-8">
                                    <button
                                        onClick={onReset}
                                        className="text-red-500 hover:text-red-400 text-xs font-bold uppercase tracking-wider hover:underline transition-colors"
                                    >
                                        Reset Application
                                    </button>
                                </div>
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
                                            <tr>
                                                <td className="px-3 py-3 align-top">
                                                    <span className="flex items-center gap-2 text-purple-400 font-semibold">
                                                        <UploadCloud size={14} /> Build vs. Sync
                                                    </span>
                                                </td>
                                                <td className="px-3 py-3 text-gray-300">
                                                    <span className="text-synthux-yellow font-semibold">Build for SD</span> exports your project into the hardware folder structure. <span className="text-synthux-orange font-semibold">Sync</span> copies a backup of the full project folder between your work folder and the SD card. These are <strong className="text-white">two different operations</strong>.
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
                            {/* Concepts Header */}
                            <div className="space-y-3">
                                <h3 className="text-xl font-bold text-white flex items-center gap-2 font-header">
                                    <BookOpen size={20} className="text-synthux-blue" />
                                    Preset & Sample Pack Submission Guide
                                </h3>
                                <p className="leading-relaxed text-sm">
                                    Before preparing your contribution, it's important to understand how Spotykach distinguishes between a <strong>Sample Pack</strong> and a <strong>Project Preset</strong>:
                                </p>
                            </div>

                            {/* Concepts Table */}
                            <div className="overflow-x-auto border border-gray-800 rounded-xl bg-black/20">
                                <table className="w-full text-xs text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-gray-800 bg-white/5 uppercase font-header tracking-wider text-gray-400 text-[10px]">
                                            <th className="px-4 py-3">Feature</th>
                                            <th className="px-4 py-3">📦 Sample Packs</th>
                                            <th className="px-4 py-3">🎛️ Project Presets (Layouts)</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-800 font-body">
                                        <tr>
                                            <td className="px-4 py-3 font-semibold text-white">What it is</td>
                                            <td className="px-4 py-3">A library of curated audio files available in the <strong>Sample Browser</strong>.</td>
                                            <td className="px-4 py-3">A saved project configuration where all slots have been mapped to specific samples.</td>
                                        </tr>
                                        <tr className="bg-white/5">
                                            <td className="px-4 py-3 font-semibold text-white">Slot Limit</td>
                                            <td className="px-4 py-3"><strong className="text-synthux-blue">Unlimited</strong>. A pack can contain 50, 100, or more files; users choose what to load.</td>
                                            <td className="px-4 py-3"><strong className="text-synthux-orange">Maximum of 36 slots</strong> (6 tapes × 6 slots) corresponding to the hardware.</td>
                                        </tr>
                                        <tr>
                                            <td className="px-4 py-3 font-semibold text-white">How it loads</td>
                                            <td className="px-4 py-3">Users browse individual samples and manually assign them to any tape slot.</td>
                                            <td className="px-4 py-3">Loads samples into pre-assigned slots automatically, along with custom tape notes.</td>
                                        </tr>
                                        <tr className="bg-white/5">
                                            <td className="px-4 py-3 font-semibold text-white">Sharing Method</td>
                                            <td className="px-4 py-3">Handled by maintainers updating the catalog in the web app database.</td>
                                            <td className="px-4 py-3">Can be exported/imported as a settings-only JSON or shared as a full ZIP archive.</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            {/* Visual Showcase */}
                            <div className="space-y-6 border-t border-gray-800 pt-6">
                                <h4 className="text-base font-bold text-white flex items-center gap-2 font-header">
                                    <span className="text-lg">📷</span> Visual Showcase: Sample Browser & Project Presets
                                </h4>
                                
                                <div className="flex flex-col gap-6">
                                    {/* 1. Sample Browser */}
                                    <div className="bg-black/20 rounded-xl border border-gray-800 p-5 space-y-4">
                                        <div className="space-y-1">
                                            <h5 className="font-bold text-white text-sm font-header uppercase tracking-wider flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-synthux-blue"></span>
                                                Sample Pack Browser
                                            </h5>
                                            <p className="text-xs text-gray-400 leading-relaxed">
                                                Browse and preview cataloged packs (like Hainbach, Jonwtr, or Horror) or local/uploaded samples. Open via the slot (+) or sidebar folder icon.
                                            </p>
                                        </div>
                                        <div className="flex flex-col gap-4">
                                            <div className="relative rounded-lg overflow-hidden border border-gray-800 bg-black/40">
                                                <img 
                                                    src={resolveAssetPath('/img/docs/samplebrowser_sidebar.jpg')} 
                                                    alt="Sample Browser Sidebar" 
                                                    className="w-full h-auto object-contain max-h-96 mx-auto"
                                                />
                                            </div>
                                            <div className="rounded-lg overflow-hidden border border-gray-800 bg-black/40 flex items-center bg-black/50">
                                                <video 
                                                    src={resolveAssetPath('/vid/docs/samplepackbrowser.mp4')} 
                                                    controls 
                                                    className="w-full h-auto max-h-96 object-contain mx-auto"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* 2. Preset Manager */}
                                    <div className="bg-black/20 rounded-xl border border-gray-800 p-5 space-y-4">
                                        <div className="space-y-1">
                                            <h5 className="font-bold text-white text-sm font-header uppercase tracking-wider flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-synthux-orange"></span>
                                                Preset Manager
                                            </h5>
                                            <p className="text-xs text-gray-400 leading-relaxed">
                                                Load pre-mapped community configurations to instantly fill all 36 slots, apply custom names, and load any written tape notes.
                                            </p>
                                        </div>
                                        <div className="flex flex-col gap-4">
                                            <div className="relative rounded-lg overflow-hidden border border-gray-800 bg-black/40">
                                                <img 
                                                    src={resolveAssetPath('/img/docs/presets_menu.png')} 
                                                    alt="Presets Menu" 
                                                    className="w-full h-auto object-contain max-h-96 mx-auto"
                                                />
                                            </div>
                                            <div className="rounded-lg overflow-hidden border border-gray-800 bg-black/40 flex items-center bg-black/50">
                                                <video 
                                                    src={resolveAssetPath('/vid/docs/presetsbrowser_1.mp4')} 
                                                    controls 
                                                    className="w-full h-auto max-h-96 object-contain mx-auto"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Share Box */}
                            <div className="bg-synthux-blue/10 border border-synthux-blue/30 p-4 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div>
                                    <strong className="text-synthux-blue block mb-1 text-sm">Need to share this guide?</strong>
                                    <p className="text-xs text-gray-400">
                                        Send a direct link to the GitHub guide for anyone wishing to contribute their custom samples or presets.
                                    </p>
                                </div>
                                <a
                                    href={SUBMISSION_GUIDE_URL}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 bg-synthux-blue text-white rounded-lg hover:bg-synthux-blue/80 transition-colors text-xs font-bold uppercase tracking-wider no-underline"
                                >
                                    GitHub Submission Guide <ExternalLink size={12} />
                                </a>
                            </div>

                            {/* Developer Resources Box */}
                            <div className="bg-synthux-pink/10 border border-synthux-pink/30 p-5 rounded-lg space-y-4">
                                <div className="flex items-start gap-3">
                                    <div className="text-synthux-pink mt-0.5">🛠️</div>
                                    <div className="space-y-1">
                                        <strong className="text-synthux-pink block text-sm">App Maintainer & Developer Resources</strong>
                                        <p className="text-xs text-gray-400 leading-relaxed">
                                            Looking to deploy custom presets directly into the web application, execute normalization scripts, or inspect the metadata schemas? The full technical backend guides are stored on GitHub:
                                        </p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 font-mono text-[10px] uppercase tracking-wider font-bold">
                                    <a 
                                        href="https://github.com/jonwaterschoot/spotykach_WAV_builder/blob/main/public/presets/README.md" 
                                        target="_blank" 
                                        rel="noreferrer"
                                        className="flex items-center justify-between p-2.5 rounded bg-black/40 hover:bg-black/60 border border-gray-800 hover:border-synthux-pink/40 text-gray-300 hover:text-white transition-all duration-200 no-underline"
                                    >
                                        Preset Dev Guide <ExternalLink size={10} />
                                    </a>
                                    <a 
                                        href="https://github.com/jonwaterschoot/spotykach_WAV_builder/blob/main/scripts/normalize-audio.md" 
                                        target="_blank" 
                                        rel="noreferrer"
                                        className="flex items-center justify-between p-2.5 rounded bg-black/40 hover:bg-black/60 border border-gray-800 hover:border-synthux-pink/40 text-gray-300 hover:text-white transition-all duration-200 no-underline"
                                    >
                                        Audio Scripts <ExternalLink size={10} />
                                    </a>
                                    <a 
                                        href="https://github.com/jonwaterschoot/spotykach_WAV_builder/blob/main/public/presets/README.md" 
                                        target="_blank" 
                                        rel="noreferrer"
                                        className="flex items-center justify-between p-2.5 rounded bg-black/40 hover:bg-black/60 border border-gray-800 hover:border-synthux-pink/40 text-gray-300 hover:text-white transition-all duration-200 no-underline"
                                    >
                                        JSON Schema Spec <ExternalLink size={10} />
                                    </a>
                                </div>
                            </div>

                            {/* Artists Guidelines */}
                            <div className="space-y-4 border-t border-gray-800 pt-6">
                                <h4 className="text-base font-bold text-white flex items-center gap-2 font-header">
                                    <span className="text-lg">🎨</span> 1. For External Artists (Contributing a Sample Pack)
                                </h4>
                                <p className="text-sm leading-relaxed">
                                    Guest artists contributing their first sample pack to Spotykach <strong>do not need to own a device or know how to use the web app!</strong>
                                </p>
                                <div className="space-y-3 bg-black/20 p-5 rounded-lg border border-gray-800 text-sm">
                                    <h5 className="font-bold text-white flex items-center gap-2">
                                        <AlertTriangle size={14} className="text-synthux-orange" />
                                        Audio & Hardware Guidelines:
                                    </h5>
                                    <ul className="list-disc list-inside space-y-2 text-gray-300">
                                        <li><strong>Duration Limit:</strong> Strictly <strong>42 seconds per sample</strong> is used by the hardware. You can submit longer files (the editor allows users to crop/select sections), but the hardware only plays the first 42 seconds by default.</li>
                                        <li><strong>Decks & Slots:</strong> A complete project preset maps to 36 slots (6 color decks × 6 slots). However, your submitted <strong>sample pack is unlimited</strong> and can contain more than 36 files.</li>
                                        <li><strong>Format:</strong> High-quality 24-bit <code>.wav</code> or <code>.flac</code>. App maintainers normalize them to -1dB, convert to FLAC for streaming, and sanitize filenames.</li>
                                        <li><strong>Organization:</strong> Group files into subfolders if you want them categorized (e.g. Drums, FX, Melodies) in the browser.</li>
                                        <li><strong>Cover Image:</strong> A landscape image (approx. 3:2, 4:3, or 16:9, e.g. min 1200x800px) that will display in the hero banner.</li>
                                    </ul>
                                </div>
                            </div>

                            {/* Users Guidelines */}
                            <div className="space-y-4 border-t border-gray-800 pt-6">
                                <h4 className="text-base font-bold text-white flex items-center gap-2 font-header">
                                    <span className="text-lg">🎛️</span> 2. For Spotykach Users (Contributing a Preset)
                                </h4>
                                <p className="text-sm leading-relaxed">
                                    If you own a Spotykach and want to share your custom tape configuration, mappings, and notes:
                                </p>
                                <div className="space-y-2 bg-black/20 p-5 rounded-lg border border-gray-800 text-sm">
                                    <ol className="list-decimal list-inside space-y-2 text-gray-300">
                                        <li>Open the Export menu and select <strong>Settings-Only Preset (JSON)</strong> to download your project configuration.</li>
                                        <li>If you use custom samples not in the default library, package those sample files too.</li>
                                        <li>Attach the exported <code>.json</code> file along with the preset metadata (Name, short description, optional cover image).</li>
                                        <li>Optionally, export the <strong>Portable SK Folder (ZIP)</strong> to share a ready-to-copy SD Card backup with the community.</li>
                                    </ol>
                                </div>
                            </div>

                            {/* Submission Template */}
                            <div className="space-y-4 border-t border-gray-800 pt-6">
                                <h4 className="text-base font-bold text-white flex items-center gap-2 font-header">
                                    <span className="text-lg">📋</span> 3. Submission Checklist & Template
                                </h4>
                                <p className="text-sm">
                                    Copy and fill in this template when sending in your submission:
                                </p>
                                <div className="relative group">
                                    <pre className="bg-gray-900/80 p-4 rounded-lg border border-gray-800 text-[10px] font-mono text-gray-400 overflow-x-auto whitespace-pre select-all pr-24">
{`# Submission Template

## 👤 Artist & Pack Info
* Artist Name: [Your Moniker]
* Sample Pack Name: [e.g., Tape Loops]
* Short Description: [1-2 sentences for app card]
* Full Bio / Pack Description: [Detailed gear/vibe description]

## 🔗 Links (Socials & Bio)
* Website/Socials: [Links]

## 📄 Licensing
* License: [e.g., CC-BY 4.0 / Free to use, no resale]

## 📁 Sample Organization
* Categories: [Yes/No] (e.g. Drums, Synths)

## 🖼️ Cover Art
* [ ] Included landscape cover image (e.g. min 1200x800px)

## 🎛️ Preset Details (Optional)
* [ ] Exported settings-only .json preset file attached`}
                                    </pre>
                                    <button
                                        onClick={() => {
                                            const text = `# Submission Template

## 👤 Artist & Pack Info
* Artist Name: [Your Moniker]
* Sample Pack Name: [e.g., Tape Loops]
* Short Description: [1-2 sentences for app card]
* Full Bio / Pack Description: [Detailed gear/vibe description]

## 🔗 Links (Socials & Bio)
* Website/Socials: [Links]

## 📄 Licensing
* License: [e.g., CC-BY 4.0 / Free to use, no resale]

## 📁 Sample Organization
* Categories: [Yes/No] (e.g. Drums, Synths)

## 🖼️ Cover Art
* [ ] Included landscape cover image (e.g. min 1200x800px)

## 🎛️ Preset Details (Optional)
* [ ] Exported settings-only .json preset file attached`;
                                            navigator.clipboard.writeText(text);
                                            setTemplateCopied(true);
                                            setTimeout(() => setTemplateCopied(false), 2000);
                                        }}
                                        className="absolute top-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-700 text-[10px] font-bold uppercase tracking-wider transition-all duration-200 active:scale-95 shadow-md cursor-pointer"
                                    >
                                        {templateCopied ? (
                                            <>
                                                <Check size={12} className="text-synthux-green" />
                                                <span className="text-synthux-green">Copied!</span>
                                            </>
                                        ) : (
                                            <>
                                                <Copy size={12} />
                                                <span>Copy</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>

                            {/* Where to send it — the one thing both guides never said */}
                            <div className="space-y-4 border-t border-gray-800 pt-6">
                                <h4 className="text-base font-bold text-white flex items-center gap-2 font-header">
                                    <span className="text-lg">📮</span> 4. Where to Send It
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="bg-black/20 p-4 rounded-lg border border-gray-800 space-y-1">
                                        <strong className="text-white text-sm block">Discord</strong>
                                        <p className="text-xs text-gray-400">
                                            <code className="text-synthux-blue">{DISCORD_HANDLE}</code> is the easiest
                                            route, and the best one for questions before you start.
                                        </p>
                                    </div>
                                    <div className="bg-black/20 p-4 rounded-lg border border-gray-800 space-y-1">
                                        <strong className="text-white text-sm block">Email</strong>
                                        <p className="text-xs text-gray-400">
                                            <a
                                                href={submissionMailto()}
                                                className="text-synthux-blue hover:underline break-all"
                                            >
                                                {submissionEmail()}
                                            </a>
                                        </p>
                                    </div>
                                </div>
                                <p className="text-xs text-gray-400 leading-relaxed">
                                    Send the small files directly: the preset <code>.json</code>, the cover image,
                                    the filled-in template. <strong className="text-gray-200">Audio goes by link</strong>:
                                    WeTransfer, Drive, Dropbox, anything. A sample pack is far too big to attach, and
                                    nothing is uploaded through this app.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
