import { X, ExternalLink, Cpu, FileAudio, Bot } from 'lucide-react';
import { version } from '../../package.json';

interface InfoModalProps {
    onClose: () => void;
}

export const InfoModal = ({ onClose }: InfoModalProps) => {
    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-6">
            <div className="bg-synthux-panel border border-gray-800 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">

                {/* Header */}
                <div className="flex justify-between items-center p-6 border-b border-gray-800 bg-black/20">
                    <div>
                        <h2 className="text-2xl font-bold bg-gradient-to-r from-synthux-orange to-synthux-yellow bg-clip-text text-transparent font-header">
                            About Spotykach WAV Builder
                        </h2>
                        <p className="text-gray-500 text-sm mt-1 font-body">Version {version}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-800 rounded-full transition-colors text-gray-400 hover:text-white"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-8 overflow-y-auto max-h-[70vh] space-y-8 font-body">

                    {/* Compatibility Notice */}
                    <div className="bg-synthux-yellow/10 border border-synthux-yellow/30 p-4 rounded-lg flex items-start gap-3">
                        <div className="text-synthux-yellow mt-0.5">⚠️</div>
                        <div className="text-sm text-gray-300">
                            <strong className="text-synthux-yellow block mb-1">Desktop Computer Required</strong>
                            This application is designed for use on a <strong>Desktop Computer</strong> (Chrome/Edge recommended) with a mouse/trackpad.
                            It relies on advanced browser audio features that are not available on mobile devices.
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
                                <li>Files are automatically converted to 48kHz / 16-bit / Stereo.</li>
                                <li> Drag & Drop files directly onto slots or use the Import Folder button.</li>
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

                    {/* Roadmap & Contributing */}
                    <div className="space-y-3">
                        <h3 className="text-lg font-semibold text-white flex items-center gap-2 font-header">
                            <Cpu size={20} className="text-synthux-yellow" />
                            Roadmap & Contributing
                        </h3>
                        <div className="bg-black/20 p-4 rounded-lg border border-gray-800 text-sm text-gray-300 space-y-2">
                            <p>
                                Future versions will include <strong>Multi-Project Support</strong>, a <strong>Shared Sample Pool</strong>, and a <strong>Project Manager</strong>.
                            </p>
                            <p>
                                Want to help? Join the discussion on the <a href="https://synthux.academy" target="_blank" rel="noreferrer" className="text-synthux-yellow hover:underline">Synthux Discord</a>, open an issue on GitHub, or check out our <a href="https://github.com/jonwaterschoot/spotykach_WAV_builder/blob/main/CONTRIBUTING.md" target="_blank" rel="noreferrer" className="text-synthux-yellow hover:underline">Contribution Guide</a>.
                            </p>
                        </div>
                    </div>

                    {/* Resources */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <a href="https://github.com/jonwaterschoot/spotykach_WAV_builder" target="_blank" rel="noreferrer"
                            className="flex items-center justify-between p-4 bg-gray-800/50 hover:bg-gray-800 rounded-xl border border-gray-700 transition-all group">
                            <span className="font-medium text-white group-hover:text-synthux-blue transition-colors">GitHub Repository</span>
                            <ExternalLink size={16} className="text-gray-500 group-hover:text-white transition-colors" />
                        </a>
                        <a href="https://discord.gg/synthux" target="_blank" rel="noreferrer"
                            className="flex items-center justify-between p-4 bg-gray-800/50 hover:bg-gray-800 rounded-xl border border-gray-700 transition-all group">
                            <span className="font-medium text-synthux-yellow group-hover:text-synthux-yellow-light transition-colors">Synthux Discord</span>
                            <ExternalLink size={16} className="text-gray-500 group-hover:text-white transition-colors" />
                        </a>
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
                    </div>

                </div>
            </div>
        </div>
    );
};
