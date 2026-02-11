import { X, AlertTriangle, Save, HardDrive, CheckCircle2, XCircle, Monitor, Command, Terminal, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';

interface HelpModalProps {
    onClose: () => void;
}

export const HelpModal = ({ onClose }: HelpModalProps) => {
    const [expandedSection, setExpandedSection] = useState<string | null>('structure');

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
                <div className="flex justify-between items-center p-6 border-b border-gray-800 bg-black/20 shrink-0">
                    <div>
                        <h2 className="text-2xl font-bold text-white font-header flex items-center gap-3">
                            <span className="bg-white text-black rounded-full w-8 h-8 flex items-center justify-center text-lg">?</span>
                            Spotykach Format & Storage
                        </h2>
                        <p className="text-gray-400 text-sm mt-1 max-w-lg font-body">
                            WAV Builder ensures your files are exported in the correct 48kHz 32-bit Float format with the required folder structure.
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-800 rounded-full transition-colors text-gray-400 hover:text-white"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto">
                    <div className="p-6 space-y-2">

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
                                                ⚠️ Folder and File names must be <strong>UPPERCASE</strong>.
                                            </p>
                                        </div>
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

                        {/* 4. Mobile Export (New) */}
                        <div className="border border-gray-700 rounded-lg overflow-hidden">
                            <SectionHeader id="mobile" title="Mobile & Tablet Export" icon={Monitor} />

                            {expandedSection === 'mobile' && (
                                <div className="p-6 bg-black/20 text-gray-300 space-y-6 font-body">
                                    <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-lg flex gap-3">
                                        <AlertTriangle className="text-amber-500 shrink-0" />
                                        <div className="text-sm">
                                            <strong className="text-amber-500 block mb-1">Android & iOS Limitations</strong>
                                            <p className="mb-2">
                                                Mobile operating systems strictly restrict apps from writing directly to SD cards or system folders.
                                                The "Direct Write" feature is mainly for Desktop browsers (Chrome/Edge).
                                            </p>
                                        </div>
                                    </div>

                                    <div>
                                        <h4 className="text-white font-bold mb-2">How to Export on Mobile</h4>
                                        <ol className="list-decimal list-inside space-y-3 text-sm">
                                            <li>
                                                <strong>Option A: Download ZIP</strong>
                                                <p className="ml-5 text-gray-400 mt-1">
                                                    Use "Download SD Structure (ZIP)". Save it to your "Files", then unzip it and move the contents to your SD card manually.
                                                </p>
                                            </li>
                                            <li>
                                                <strong>Option B: Manual File Export</strong>
                                                <p className="ml-5 text-gray-400 mt-1">
                                                    Use the <strong>"Manual (Mobile)"</strong> tab in the Export menu.
                                                </p>
                                                <ul className="list-disc list-inside ml-5 mt-1 space-y-1 text-gray-400">
                                                    <li>Select a Tape (Color).</li>
                                                    <li>Download each file individually (e.g., <code className="bg-gray-800 px-1 rounded">1.WAV</code>).</li>
                                                    <li>Move these files to the corresponding folder (e.g., <code className="bg-gray-800 px-1 rounded">SK/B</code>) on your card.</li>
                                                </ul>
                                            </li>
                                        </ol>
                                    </div>
                                </div>
                            )}
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
};
