import { X, ExternalLink, Cpu, FileAudio, Bot, AlertTriangle, Save, HardDrive, CheckCircle2, XCircle, Monitor, Command, Terminal, ChevronDown, ChevronRight, BookOpen, FolderClosed, Scissors, UploadCloud, Library, Coffee } from 'lucide-react';
import { version } from '../../package.json';
import { useEffect, useState } from 'react';

interface AboutHelpModalProps {
    onClose: () => void;
    onReset: () => void;
    initialTab?: 'about' | 'help';
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
    const [activeTab, setActiveTab] = useState<'about' | 'help'>(initialTab);
    const [expandedSection, setExpandedSection] = useState<string | null>('concepts');

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
                                className={`flex-1 md:flex-none px-6 py-2 rounded-lg text-sm font-bold transition-all duration-200 ${activeTab === 'about' ? 'bg-synthux-blue text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-gray-700/50'}`}
                            >
                                About
                            </button>
                            <button
                                onClick={() => setActiveTab('help')}
                                className={`flex-1 md:flex-none px-6 py-2 rounded-lg text-sm font-bold transition-all duration-200 ${activeTab === 'help' ? 'bg-synthux-blue text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-gray-700/50'}`}
                            >
                                Format Help
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
                                        <a href="https://www.buymeacoffee.com/jonwtr" target="_blank" rel="noreferrer" className="bg-white p-3 rounded-2xl shadow-xl hover:scale-105 transition-transform cursor-pointer block">
                                            <svg width="180" height="180" style={{shapeRendering: 'crispEdges'}}><defs><clipPath id="clipPath-dot-color"><circle cx="26" cy="58" r="2" transform="rotate(0,26,58)"></circle><circle cx="26" cy="70" r="2" transform="rotate(0,26,70)"></circle><circle cx="26" cy="78" r="2" transform="rotate(0,26,78)"></circle><circle cx="26" cy="98" r="2" transform="rotate(0,26,98)"></circle><circle cx="26" cy="102" r="2" transform="rotate(0,26,102)"></circle><circle cx="26" cy="118" r="2" transform="rotate(0,26,118)"></circle><circle cx="30" cy="62" r="2" transform="rotate(0,30,62)"></circle><circle cx="30" cy="66" r="2" transform="rotate(0,30,66)"></circle><circle cx="30" cy="70" r="2" transform="rotate(0,30,70)"></circle><circle cx="30" cy="74" r="2" transform="rotate(0,30,74)"></circle><circle cx="30" cy="78" r="2" transform="rotate(0,30,78)"></circle><circle cx="30" cy="82" r="2" transform="rotate(0,30,82)"></circle><circle cx="30" cy="90" r="2" transform="rotate(0,30,90)"></circle><circle cx="30" cy="94" r="2" transform="rotate(0,30,94)"></circle><circle cx="30" cy="110" r="2" transform="rotate(0,30,110)"></circle><circle cx="30" cy="114" r="2" transform="rotate(0,30,114)"></circle><circle cx="30" cy="118" r="2" transform="rotate(0,30,118)"></circle><circle cx="34" cy="58" r="2" transform="rotate(0,34,58)"></circle><circle cx="34" cy="62" r="2" transform="rotate(0,34,62)"></circle><circle cx="34" cy="74" r="2" transform="rotate(0,34,74)"></circle><circle cx="34" cy="86" r="2" transform="rotate(0,34,86)"></circle><circle cx="34" cy="94" r="2" transform="rotate(0,34,94)"></circle><circle cx="34" cy="102" r="2" transform="rotate(0,34,102)"></circle><circle cx="34" cy="106" r="2" transform="rotate(0,34,106)"></circle><circle cx="34" cy="122" r="2" transform="rotate(0,34,122)"></circle><circle cx="38" cy="58" r="2" transform="rotate(0,38,58)"></circle><circle cx="38" cy="62" r="2" transform="rotate(0,38,62)"></circle><circle cx="38" cy="66" r="2" transform="rotate(0,38,66)"></circle><circle cx="38" cy="74" r="2" transform="rotate(0,38,74)"></circle><circle cx="38" cy="78" r="2" transform="rotate(0,38,78)"></circle><circle cx="38" cy="82" r="2" transform="rotate(0,38,82)"></circle><circle cx="38" cy="90" r="2" transform="rotate(0,38,90)"></circle><circle cx="38" cy="94" r="2" transform="rotate(0,38,94)"></circle><circle cx="38" cy="102" r="2" transform="rotate(0,38,102)"></circle><circle cx="38" cy="110" r="2" transform="rotate(0,38,110)"></circle><circle cx="38" cy="118" r="2" transform="rotate(0,38,118)"></circle><circle cx="42" cy="62" r="2" transform="rotate(0,42,62)"></circle><circle cx="42" cy="70" r="2" transform="rotate(0,42,70)"></circle><circle cx="42" cy="74" r="2" transform="rotate(0,42,74)"></circle><circle cx="42" cy="78" r="2" transform="rotate(0,42,78)"></circle><circle cx="42" cy="82" r="2" transform="rotate(0,42,82)"></circle><circle cx="42" cy="86" r="2" transform="rotate(0,42,86)"></circle><circle cx="42" cy="102" r="2" transform="rotate(0,42,102)"></circle><circle cx="42" cy="114" r="2" transform="rotate(0,42,114)"></circle><circle cx="46" cy="58" r="2" transform="rotate(0,46,58)"></circle><circle cx="46" cy="62" r="2" transform="rotate(0,46,62)"></circle><circle cx="46" cy="66" r="2" transform="rotate(0,46,66)"></circle><circle cx="46" cy="74" r="2" transform="rotate(0,46,74)"></circle><circle cx="46" cy="78" r="2" transform="rotate(0,46,78)"></circle><circle cx="46" cy="86" r="2" transform="rotate(0,46,86)"></circle><circle cx="46" cy="94" r="2" transform="rotate(0,46,94)"></circle><circle cx="46" cy="98" r="2" transform="rotate(0,46,98)"></circle><circle cx="46" cy="106" r="2" transform="rotate(0,46,106)"></circle><circle cx="46" cy="110" r="2" transform="rotate(0,46,110)"></circle><circle cx="46" cy="114" r="2" transform="rotate(0,46,114)"></circle><circle cx="46" cy="118" r="2" transform="rotate(0,46,118)"></circle><circle cx="50" cy="58" r="2" transform="rotate(0,50,58)"></circle><circle cx="50" cy="66" r="2" transform="rotate(0,50,66)"></circle><circle cx="50" cy="74" r="2" transform="rotate(0,50,74)"></circle><circle cx="50" cy="82" r="2" transform="rotate(0,50,82)"></circle><circle cx="50" cy="90" r="2" transform="rotate(0,50,90)"></circle><circle cx="50" cy="98" r="2" transform="rotate(0,50,98)"></circle><circle cx="50" cy="106" r="2" transform="rotate(0,50,106)"></circle><circle cx="50" cy="114" r="2" transform="rotate(0,50,114)"></circle><circle cx="50" cy="122" r="2" transform="rotate(0,50,122)"></circle><circle cx="54" cy="58" r="2" transform="rotate(0,54,58)"></circle><circle cx="54" cy="62" r="2" transform="rotate(0,54,62)"></circle><circle cx="54" cy="78" r="2" transform="rotate(0,54,78)"></circle><circle cx="54" cy="82" r="2" transform="rotate(0,54,82)"></circle><circle cx="54" cy="86" r="2" transform="rotate(0,54,86)"></circle><circle cx="54" cy="94" r="2" transform="rotate(0,54,94)"></circle><circle cx="54" cy="102" r="2" transform="rotate(0,54,102)"></circle><circle cx="54" cy="106" r="2" transform="rotate(0,54,106)"></circle><circle cx="54" cy="110" r="2" transform="rotate(0,54,110)"></circle><circle cx="54" cy="122" r="2" transform="rotate(0,54,122)"></circle><circle cx="58" cy="30" r="2" transform="rotate(0,58,30)"></circle><circle cx="58" cy="38" r="2" transform="rotate(0,58,38)"></circle><circle cx="58" cy="46" r="2" transform="rotate(0,58,46)"></circle><circle cx="58" cy="50" r="2" transform="rotate(0,58,50)"></circle><circle cx="58" cy="54" r="2" transform="rotate(0,58,54)"></circle><circle cx="58" cy="58" r="2" transform="rotate(0,58,58)"></circle><circle cx="58" cy="66" r="2" transform="rotate(0,58,66)"></circle><circle cx="58" cy="74" r="2" transform="rotate(0,58,74)"></circle><circle cx="58" cy="86" r="2" transform="rotate(0,58,86)"></circle><circle cx="58" cy="102" r="2" transform="rotate(0,58,102)"></circle><circle cx="58" cy="110" r="2" transform="rotate(0,58,110)"></circle><circle cx="58" cy="122" r="2" transform="rotate(0,58,122)"></circle><circle cx="58" cy="126" r="2" transform="rotate(0,58,126)"></circle><circle cx="58" cy="130" r="2" transform="rotate(0,58,130)"></circle><circle cx="58" cy="134" r="2" transform="rotate(0,58,134)"></circle><circle cx="58" cy="142" r="2" transform="rotate(0,58,142)"></circle><circle cx="58" cy="146" r="2" transform="rotate(0,58,146)"></circle><circle cx="58" cy="154" r="2" transform="rotate(0,58,154)"></circle><circle cx="62" cy="26" r="2" transform="rotate(0,62,26)"></circle><circle cx="62" cy="30" r="2" transform="rotate(0,62,30)"></circle><circle cx="62" cy="42" r="2" transform="rotate(0,62,42)"></circle><circle cx="62" cy="66" r="2" transform="rotate(0,62,66)"></circle><circle cx="62" cy="82" r="2" transform="rotate(0,62,82)"></circle><circle cx="62" cy="90" r="2" transform="rotate(0,62,90)"></circle><circle cx="62" cy="106" r="2" transform="rotate(0,62,106)"></circle><circle cx="62" cy="114" r="2" transform="rotate(0,62,114)"></circle><circle cx="62" cy="122" r="2" transform="rotate(0,62,122)"></circle><circle cx="62" cy="126" r="2" transform="rotate(0,62,126)"></circle><circle cx="62" cy="130" r="2" transform="rotate(0,62,130)"></circle><circle cx="62" cy="134" r="2" transform="rotate(0,62,134)"></circle><circle cx="62" cy="150" r="2" transform="rotate(0,62,150)"></circle><circle cx="62" cy="154" r="2" transform="rotate(0,62,154)"></circle><circle cx="66" cy="26" r="2" transform="rotate(0,66,26)"></circle><circle cx="66" cy="30" r="2" transform="rotate(0,66,30)"></circle><circle cx="66" cy="34" r="2" transform="rotate(0,66,34)"></circle><circle cx="66" cy="42" r="2" transform="rotate(0,66,42)"></circle><circle cx="66" cy="46" r="2" transform="rotate(0,66,46)"></circle><circle cx="66" cy="50" r="2" transform="rotate(0,66,50)"></circle><circle cx="66" cy="54" r="2" transform="rotate(0,66,54)"></circle><circle cx="66" cy="58" r="2" transform="rotate(0,66,58)"></circle><circle cx="66" cy="62" r="2" transform="rotate(0,66,62)"></circle><circle cx="66" cy="70" r="2" transform="rotate(0,66,70)"></circle><circle cx="66" cy="82" r="2" transform="rotate(0,66,82)"></circle><circle cx="66" cy="86" r="2" transform="rotate(0,66,86)"></circle><circle cx="66" cy="94" r="2" transform="rotate(0,66,94)"></circle><circle cx="66" cy="102" r="2" transform="rotate(0,66,102)"></circle><circle cx="66" cy="110" r="2" transform="rotate(0,66,110)"></circle><circle cx="66" cy="114" r="2" transform="rotate(0,66,114)"></circle><circle cx="66" cy="122" r="2" transform="rotate(0,66,122)"></circle><circle cx="66" cy="134" r="2" transform="rotate(0,66,134)"></circle><circle cx="66" cy="138" r="2" transform="rotate(0,66,138)"></circle><circle cx="66" cy="146" r="2" transform="rotate(0,66,146)"></circle><circle cx="66" cy="154" r="2" transform="rotate(0,66,154)"></circle><circle cx="70" cy="70" r="2" transform="rotate(0,70,70)"></circle><circle cx="70" cy="86" r="2" transform="rotate(0,70,86)"></circle><circle cx="70" cy="90" r="2" transform="rotate(0,70,90)"></circle><circle cx="70" cy="94" r="2" transform="rotate(0,70,94)"></circle><circle cx="70" cy="118" r="2" transform="rotate(0,70,118)"></circle><circle cx="70" cy="122" r="2" transform="rotate(0,70,122)"></circle><circle cx="70" cy="138" r="2" transform="rotate(0,70,138)"></circle><circle cx="70" cy="142" r="2" transform="rotate(0,70,142)"></circle><circle cx="70" cy="150" r="2" transform="rotate(0,70,150)"></circle><circle cx="74" cy="34" r="2" transform="rotate(0,74,34)"></circle><circle cx="74" cy="38" r="2" transform="rotate(0,74,38)"></circle><circle cx="74" cy="42" r="2" transform="rotate(0,74,42)"></circle><circle cx="74" cy="50" r="2" transform="rotate(0,74,50)"></circle><circle cx="74" cy="62" r="2" transform="rotate(0,74,62)"></circle><circle cx="74" cy="70" r="2" transform="rotate(0,74,70)"></circle><circle cx="74" cy="118" r="2" transform="rotate(0,74,118)"></circle><circle cx="74" cy="122" r="2" transform="rotate(0,74,122)"></circle><circle cx="74" cy="126" r="2" transform="rotate(0,74,126)"></circle><circle cx="74" cy="130" r="2" transform="rotate(0,74,130)"></circle><circle cx="74" cy="142" r="2" transform="rotate(0,74,142)"></circle><circle cx="74" cy="150" r="2" transform="rotate(0,74,150)"></circle><circle cx="78" cy="26" r="2" transform="rotate(0,78,26)"></circle><circle cx="78" cy="30" r="2" transform="rotate(0,78,30)"></circle><circle cx="78" cy="42" r="2" transform="rotate(0,78,42)"></circle><circle cx="78" cy="54" r="2" transform="rotate(0,78,54)"></circle><circle cx="78" cy="66" r="2" transform="rotate(0,78,66)"></circle><circle cx="78" cy="114" r="2" transform="rotate(0,78,114)"></circle><circle cx="78" cy="118" r="2" transform="rotate(0,78,118)"></circle><circle cx="78" cy="130" r="2" transform="rotate(0,78,130)"></circle><circle cx="78" cy="138" r="2" transform="rotate(0,78,138)"></circle><circle cx="78" cy="142" r="2" transform="rotate(0,78,142)"></circle><circle cx="78" cy="150" r="2" transform="rotate(0,78,150)"></circle><circle cx="78" cy="154" r="2" transform="rotate(0,78,154)"></circle><circle cx="82" cy="30" r="2" transform="rotate(0,82,30)"></circle><circle cx="82" cy="38" r="2" transform="rotate(0,82,38)"></circle><circle cx="82" cy="50" r="2" transform="rotate(0,82,50)"></circle><circle cx="82" cy="62" r="2" transform="rotate(0,82,62)"></circle><circle cx="82" cy="114" r="2" transform="rotate(0,82,114)"></circle><circle cx="82" cy="118" r="2" transform="rotate(0,82,118)"></circle><circle cx="82" cy="122" r="2" transform="rotate(0,82,122)"></circle><circle cx="82" cy="126" r="2" transform="rotate(0,82,126)"></circle><circle cx="82" cy="130" r="2" transform="rotate(0,82,130)"></circle><circle cx="82" cy="150" r="2" transform="rotate(0,82,150)"></circle><circle cx="86" cy="26" r="2" transform="rotate(0,86,26)"></circle><circle cx="86" cy="34" r="2" transform="rotate(0,86,34)"></circle><circle cx="86" cy="38" r="2" transform="rotate(0,86,38)"></circle><circle cx="86" cy="54" r="2" transform="rotate(0,86,54)"></circle><circle cx="86" cy="58" r="2" transform="rotate(0,86,58)"></circle><circle cx="86" cy="62" r="2" transform="rotate(0,86,62)"></circle><circle cx="86" cy="110" r="2" transform="rotate(0,86,110)"></circle><circle cx="86" cy="114" r="2" transform="rotate(0,86,114)"></circle><circle cx="86" cy="130" r="2" transform="rotate(0,86,130)"></circle><circle cx="86" cy="134" r="2" transform="rotate(0,86,134)"></circle><circle cx="86" cy="138" r="2" transform="rotate(0,86,138)"></circle><circle cx="86" cy="150" r="2" transform="rotate(0,86,150)"></circle><circle cx="90" cy="42" r="2" transform="rotate(0,90,42)"></circle><circle cx="90" cy="50" r="2" transform="rotate(0,90,50)"></circle><circle cx="90" cy="54" r="2" transform="rotate(0,90,54)"></circle><circle cx="90" cy="58" r="2" transform="rotate(0,90,58)"></circle><circle cx="90" cy="66" r="2" transform="rotate(0,90,66)"></circle><circle cx="90" cy="70" r="2" transform="rotate(0,90,70)"></circle><circle cx="90" cy="110" r="2" transform="rotate(0,90,110)"></circle><circle cx="90" cy="114" r="2" transform="rotate(0,90,114)"></circle><circle cx="90" cy="122" r="2" transform="rotate(0,90,122)"></circle><circle cx="90" cy="130" r="2" transform="rotate(0,90,130)"></circle><circle cx="90" cy="138" r="2" transform="rotate(0,90,138)"></circle><circle cx="90" cy="150" r="2" transform="rotate(0,90,150)"></circle><circle cx="94" cy="26" r="2" transform="rotate(0,94,26)"></circle><circle cx="94" cy="30" r="2" transform="rotate(0,94,30)"></circle><circle cx="94" cy="34" r="2" transform="rotate(0,94,34)"></circle><circle cx="94" cy="42" r="2" transform="rotate(0,94,42)"></circle><circle cx="94" cy="54" r="2" transform="rotate(0,94,54)"></circle><circle cx="94" cy="66" r="2" transform="rotate(0,94,66)"></circle><circle cx="94" cy="70" r="2" transform="rotate(0,94,70)"></circle><circle cx="94" cy="110" r="2" transform="rotate(0,94,110)"></circle><circle cx="94" cy="118" r="2" transform="rotate(0,94,118)"></circle><circle cx="94" cy="134" r="2" transform="rotate(0,94,134)"></circle><circle cx="94" cy="142" r="2" transform="rotate(0,94,142)"></circle><circle cx="94" cy="150" r="2" transform="rotate(0,94,150)"></circle><circle cx="98" cy="26" r="2" transform="rotate(0,98,26)"></circle><circle cx="98" cy="30" r="2" transform="rotate(0,98,30)"></circle><circle cx="98" cy="46" r="2" transform="rotate(0,98,46)"></circle><circle cx="98" cy="50" r="2" transform="rotate(0,98,50)"></circle><circle cx="98" cy="54" r="2" transform="rotate(0,98,54)"></circle><circle cx="98" cy="58" r="2" transform="rotate(0,98,58)"></circle><circle cx="98" cy="62" r="2" transform="rotate(0,98,62)"></circle><circle cx="98" cy="66" r="2" transform="rotate(0,98,66)"></circle><circle cx="98" cy="70" r="2" transform="rotate(0,98,70)"></circle><circle cx="98" cy="114" r="2" transform="rotate(0,98,114)"></circle><circle cx="98" cy="126" r="2" transform="rotate(0,98,126)"></circle><circle cx="98" cy="146" r="2" transform="rotate(0,98,146)"></circle><circle cx="98" cy="154" r="2" transform="rotate(0,98,154)"></circle><circle cx="102" cy="34" r="2" transform="rotate(0,102,34)"></circle><circle cx="102" cy="42" r="2" transform="rotate(0,102,42)"></circle><circle cx="102" cy="46" r="2" transform="rotate(0,102,46)"></circle><circle cx="102" cy="58" r="2" transform="rotate(0,102,58)"></circle><circle cx="102" cy="62" r="2" transform="rotate(0,102,62)"></circle><circle cx="102" cy="66" r="2" transform="rotate(0,102,66)"></circle><circle cx="102" cy="70" r="2" transform="rotate(0,102,70)"></circle><circle cx="102" cy="110" r="2" transform="rotate(0,102,110)"></circle><circle cx="102" cy="122" r="2" transform="rotate(0,102,122)"></circle><circle cx="102" cy="130" r="2" transform="rotate(0,102,130)"></circle><circle cx="102" cy="134" r="2" transform="rotate(0,102,134)"></circle><circle cx="102" cy="150" r="2" transform="rotate(0,102,150)"></circle><circle cx="106" cy="30" r="2" transform="rotate(0,106,30)"></circle><circle cx="106" cy="42" r="2" transform="rotate(0,106,42)"></circle><circle cx="106" cy="50" r="2" transform="rotate(0,106,50)"></circle><circle cx="106" cy="54" r="2" transform="rotate(0,106,54)"></circle><circle cx="106" cy="62" r="2" transform="rotate(0,106,62)"></circle><circle cx="106" cy="66" r="2" transform="rotate(0,106,66)"></circle><circle cx="106" cy="114" r="2" transform="rotate(0,106,114)"></circle><circle cx="106" cy="118" r="2" transform="rotate(0,106,118)"></circle><circle cx="106" cy="126" r="2" transform="rotate(0,106,126)"></circle><circle cx="106" cy="150" r="2" transform="rotate(0,106,150)"></circle><circle cx="110" cy="30" r="2" transform="rotate(0,110,30)"></circle><circle cx="110" cy="34" r="2" transform="rotate(0,110,34)"></circle><circle cx="110" cy="42" r="2" transform="rotate(0,110,42)"></circle><circle cx="110" cy="46" r="2" transform="rotate(0,110,46)"></circle><circle cx="110" cy="58" r="2" transform="rotate(0,110,58)"></circle><circle cx="110" cy="62" r="2" transform="rotate(0,110,62)"></circle><circle cx="110" cy="66" r="2" transform="rotate(0,110,66)"></circle><circle cx="110" cy="70" r="2" transform="rotate(0,110,70)"></circle><circle cx="110" cy="74" r="2" transform="rotate(0,110,74)"></circle><circle cx="110" cy="82" r="2" transform="rotate(0,110,82)"></circle><circle cx="110" cy="86" r="2" transform="rotate(0,110,86)"></circle><circle cx="110" cy="94" r="2" transform="rotate(0,110,94)"></circle><circle cx="110" cy="98" r="2" transform="rotate(0,110,98)"></circle><circle cx="110" cy="102" r="2" transform="rotate(0,110,102)"></circle><circle cx="110" cy="106" r="2" transform="rotate(0,110,106)"></circle><circle cx="110" cy="114" r="2" transform="rotate(0,110,114)"></circle><circle cx="110" cy="122" r="2" transform="rotate(0,110,122)"></circle><circle cx="110" cy="130" r="2" transform="rotate(0,110,130)"></circle><circle cx="110" cy="146" r="2" transform="rotate(0,110,146)"></circle><circle cx="110" cy="150" r="2" transform="rotate(0,110,150)"></circle><circle cx="110" cy="154" r="2" transform="rotate(0,110,154)"></circle><circle cx="114" cy="26" r="2" transform="rotate(0,114,26)"></circle><circle cx="114" cy="30" r="2" transform="rotate(0,114,30)"></circle><circle cx="114" cy="38" r="2" transform="rotate(0,114,38)"></circle><circle cx="114" cy="46" r="2" transform="rotate(0,114,46)"></circle><circle cx="114" cy="50" r="2" transform="rotate(0,114,50)"></circle><circle cx="114" cy="58" r="2" transform="rotate(0,114,58)"></circle><circle cx="114" cy="70" r="2" transform="rotate(0,114,70)"></circle><circle cx="114" cy="74" r="2" transform="rotate(0,114,74)"></circle><circle cx="114" cy="78" r="2" transform="rotate(0,114,78)"></circle><circle cx="114" cy="82" r="2" transform="rotate(0,114,82)"></circle><circle cx="114" cy="86" r="2" transform="rotate(0,114,86)"></circle><circle cx="114" cy="90" r="2" transform="rotate(0,114,90)"></circle><circle cx="114" cy="94" r="2" transform="rotate(0,114,94)"></circle><circle cx="114" cy="106" r="2" transform="rotate(0,114,106)"></circle><circle cx="114" cy="114" r="2" transform="rotate(0,114,114)"></circle><circle cx="114" cy="122" r="2" transform="rotate(0,114,122)"></circle><circle cx="114" cy="130" r="2" transform="rotate(0,114,130)"></circle><circle cx="114" cy="134" r="2" transform="rotate(0,114,134)"></circle><circle cx="114" cy="138" r="2" transform="rotate(0,114,138)"></circle><circle cx="114" cy="142" r="2" transform="rotate(0,114,142)"></circle><circle cx="114" cy="154" r="2" transform="rotate(0,114,154)"></circle><circle cx="118" cy="30" r="2" transform="rotate(0,118,30)"></circle><circle cx="118" cy="38" r="2" transform="rotate(0,118,38)"></circle><circle cx="118" cy="46" r="2" transform="rotate(0,118,46)"></circle><circle cx="118" cy="62" r="2" transform="rotate(0,118,62)"></circle><circle cx="118" cy="82" r="2" transform="rotate(0,118,82)"></circle><circle cx="118" cy="94" r="2" transform="rotate(0,118,94)"></circle><circle cx="118" cy="98" r="2" transform="rotate(0,118,98)"></circle><circle cx="118" cy="110" r="2" transform="rotate(0,118,110)"></circle><circle cx="118" cy="114" r="2" transform="rotate(0,118,114)"></circle><circle cx="118" cy="122" r="2" transform="rotate(0,118,122)"></circle><circle cx="118" cy="138" r="2" transform="rotate(0,118,138)"></circle><circle cx="118" cy="142" r="2" transform="rotate(0,118,142)"></circle><circle cx="122" cy="26" r="2" transform="rotate(0,122,26)"></circle><circle cx="122" cy="42" r="2" transform="rotate(0,122,42)"></circle><circle cx="122" cy="46" r="2" transform="rotate(0,122,46)"></circle><circle cx="122" cy="50" r="2" transform="rotate(0,122,50)"></circle><circle cx="122" cy="58" r="2" transform="rotate(0,122,58)"></circle><circle cx="122" cy="66" r="2" transform="rotate(0,122,66)"></circle><circle cx="122" cy="74" r="2" transform="rotate(0,122,74)"></circle><circle cx="122" cy="82" r="2" transform="rotate(0,122,82)"></circle><circle cx="122" cy="86" r="2" transform="rotate(0,122,86)"></circle><circle cx="122" cy="94" r="2" transform="rotate(0,122,94)"></circle><circle cx="122" cy="102" r="2" transform="rotate(0,122,102)"></circle><circle cx="122" cy="106" r="2" transform="rotate(0,122,106)"></circle><circle cx="122" cy="110" r="2" transform="rotate(0,122,110)"></circle><circle cx="122" cy="122" r="2" transform="rotate(0,122,122)"></circle><circle cx="122" cy="126" r="2" transform="rotate(0,122,126)"></circle><circle cx="122" cy="130" r="2" transform="rotate(0,122,130)"></circle><circle cx="122" cy="134" r="2" transform="rotate(0,122,134)"></circle><circle cx="122" cy="138" r="2" transform="rotate(0,122,138)"></circle><circle cx="122" cy="154" r="2" transform="rotate(0,122,154)"></circle><circle cx="126" cy="58" r="2" transform="rotate(0,126,58)"></circle><circle cx="126" cy="62" r="2" transform="rotate(0,126,62)"></circle><circle cx="126" cy="66" r="2" transform="rotate(0,126,66)"></circle><circle cx="126" cy="70" r="2" transform="rotate(0,126,70)"></circle><circle cx="126" cy="74" r="2" transform="rotate(0,126,74)"></circle><circle cx="126" cy="78" r="2" transform="rotate(0,126,78)"></circle><circle cx="126" cy="82" r="2" transform="rotate(0,126,82)"></circle><circle cx="126" cy="90" r="2" transform="rotate(0,126,90)"></circle><circle cx="126" cy="98" r="2" transform="rotate(0,126,98)"></circle><circle cx="126" cy="102" r="2" transform="rotate(0,126,102)"></circle><circle cx="126" cy="106" r="2" transform="rotate(0,126,106)"></circle><circle cx="126" cy="114" r="2" transform="rotate(0,126,114)"></circle><circle cx="126" cy="122" r="2" transform="rotate(0,126,122)"></circle><circle cx="126" cy="138" r="2" transform="rotate(0,126,138)"></circle><circle cx="126" cy="142" r="2" transform="rotate(0,126,142)"></circle><circle cx="126" cy="154" r="2" transform="rotate(0,126,154)"></circle><circle cx="130" cy="58" r="2" transform="rotate(0,130,58)"></circle><circle cx="130" cy="70" r="2" transform="rotate(0,130,70)"></circle><circle cx="130" cy="86" r="2" transform="rotate(0,130,86)"></circle><circle cx="130" cy="90" r="2" transform="rotate(0,130,90)"></circle><circle cx="130" cy="94" r="2" transform="rotate(0,130,94)"></circle><circle cx="130" cy="106" r="2" transform="rotate(0,130,106)"></circle><circle cx="130" cy="110" r="2" transform="rotate(0,130,110)"></circle><circle cx="130" cy="122" r="2" transform="rotate(0,130,122)"></circle><circle cx="130" cy="130" r="2" transform="rotate(0,130,130)"></circle><circle cx="130" cy="138" r="2" transform="rotate(0,130,138)"></circle><circle cx="130" cy="142" r="2" transform="rotate(0,130,142)"></circle><circle cx="130" cy="146" r="2" transform="rotate(0,130,146)"></circle><circle cx="130" cy="150" r="2" transform="rotate(0,130,150)"></circle><circle cx="134" cy="58" r="2" transform="rotate(0,134,58)"></circle><circle cx="134" cy="66" r="2" transform="rotate(0,134,66)"></circle><circle cx="134" cy="74" r="2" transform="rotate(0,134,74)"></circle><circle cx="134" cy="78" r="2" transform="rotate(0,134,78)"></circle><circle cx="134" cy="82" r="2" transform="rotate(0,134,82)"></circle><circle cx="134" cy="94" r="2" transform="rotate(0,134,94)"></circle><circle cx="134" cy="102" r="2" transform="rotate(0,134,102)"></circle><circle cx="134" cy="122" r="2" transform="rotate(0,134,122)"></circle><circle cx="134" cy="138" r="2" transform="rotate(0,134,138)"></circle><circle cx="138" cy="62" r="2" transform="rotate(0,138,62)"></circle><circle cx="138" cy="66" r="2" transform="rotate(0,138,66)"></circle><circle cx="138" cy="70" r="2" transform="rotate(0,138,70)"></circle><circle cx="138" cy="78" r="2" transform="rotate(0,138,78)"></circle><circle cx="138" cy="90" r="2" transform="rotate(0,138,90)"></circle><circle cx="138" cy="94" r="2" transform="rotate(0,138,94)"></circle><circle cx="138" cy="98" r="2" transform="rotate(0,138,98)"></circle><circle cx="138" cy="102" r="2" transform="rotate(0,138,102)"></circle><circle cx="138" cy="114" r="2" transform="rotate(0,138,114)"></circle><circle cx="138" cy="122" r="2" transform="rotate(0,138,122)"></circle><circle cx="138" cy="126" r="2" transform="rotate(0,138,126)"></circle><circle cx="138" cy="130" r="2" transform="rotate(0,138,130)"></circle><circle cx="138" cy="134" r="2" transform="rotate(0,138,134)"></circle><circle cx="138" cy="138" r="2" transform="rotate(0,138,138)"></circle><circle cx="138" cy="142" r="2" transform="rotate(0,138,142)"></circle><circle cx="138" cy="154" r="2" transform="rotate(0,138,154)"></circle><circle cx="142" cy="58" r="2" transform="rotate(0,142,58)"></circle><circle cx="142" cy="70" r="2" transform="rotate(0,142,70)"></circle><circle cx="142" cy="74" r="2" transform="rotate(0,142,74)"></circle><circle cx="142" cy="82" r="2" transform="rotate(0,142,82)"></circle><circle cx="142" cy="86" r="2" transform="rotate(0,142,86)"></circle><circle cx="142" cy="102" r="2" transform="rotate(0,142,102)"></circle><circle cx="142" cy="106" r="2" transform="rotate(0,142,106)"></circle><circle cx="142" cy="110" r="2" transform="rotate(0,142,110)"></circle><circle cx="142" cy="118" r="2" transform="rotate(0,142,118)"></circle><circle cx="142" cy="122" r="2" transform="rotate(0,142,122)"></circle><circle cx="142" cy="130" r="2" transform="rotate(0,142,130)"></circle><circle cx="142" cy="138" r="2" transform="rotate(0,142,138)"></circle><circle cx="142" cy="142" r="2" transform="rotate(0,142,142)"></circle><circle cx="142" cy="146" r="2" transform="rotate(0,142,146)"></circle><circle cx="142" cy="150" r="2" transform="rotate(0,142,150)"></circle><circle cx="146" cy="62" r="2" transform="rotate(0,146,62)"></circle><circle cx="146" cy="78" r="2" transform="rotate(0,146,78)"></circle><circle cx="146" cy="82" r="2" transform="rotate(0,146,82)"></circle><circle cx="146" cy="90" r="2" transform="rotate(0,146,90)"></circle><circle cx="146" cy="94" r="2" transform="rotate(0,146,94)"></circle><circle cx="146" cy="98" r="2" transform="rotate(0,146,98)"></circle><circle cx="146" cy="118" r="2" transform="rotate(0,146,118)"></circle><circle cx="146" cy="122" r="2" transform="rotate(0,146,122)"></circle><circle cx="146" cy="126" r="2" transform="rotate(0,146,126)"></circle><circle cx="146" cy="138" r="2" transform="rotate(0,146,138)"></circle><circle cx="146" cy="142" r="2" transform="rotate(0,146,142)"></circle><circle cx="146" cy="146" r="2" transform="rotate(0,146,146)"></circle><circle cx="146" cy="154" r="2" transform="rotate(0,146,154)"></circle><circle cx="150" cy="58" r="2" transform="rotate(0,150,58)"></circle><circle cx="150" cy="70" r="2" transform="rotate(0,150,70)"></circle><circle cx="150" cy="74" r="2" transform="rotate(0,150,74)"></circle><circle cx="150" cy="78" r="2" transform="rotate(0,150,78)"></circle><circle cx="150" cy="82" r="2" transform="rotate(0,150,82)"></circle><circle cx="150" cy="86" r="2" transform="rotate(0,150,86)"></circle><circle cx="150" cy="90" r="2" transform="rotate(0,150,90)"></circle><circle cx="150" cy="94" r="2" transform="rotate(0,150,94)"></circle><circle cx="150" cy="110" r="2" transform="rotate(0,150,110)"></circle><circle cx="150" cy="122" r="2" transform="rotate(0,150,122)"></circle><circle cx="150" cy="126" r="2" transform="rotate(0,150,126)"></circle><circle cx="150" cy="142" r="2" transform="rotate(0,150,142)"></circle><circle cx="154" cy="66" r="2" transform="rotate(0,154,66)"></circle><circle cx="154" cy="70" r="2" transform="rotate(0,154,70)"></circle><circle cx="154" cy="74" r="2" transform="rotate(0,154,74)"></circle><circle cx="154" cy="82" r="2" transform="rotate(0,154,82)"></circle><circle cx="154" cy="94" r="2" transform="rotate(0,154,94)"></circle><circle cx="154" cy="110" r="2" transform="rotate(0,154,110)"></circle><circle cx="154" cy="122" r="2" transform="rotate(0,154,122)"></circle><circle cx="154" cy="126" r="2" transform="rotate(0,154,126)"></circle><circle cx="154" cy="130" r="2" transform="rotate(0,154,130)"></circle><circle cx="154" cy="138" r="2" transform="rotate(0,154,138)"></circle><circle cx="154" cy="142" r="2" transform="rotate(0,154,142)"></circle><circle cx="154" cy="150" r="2" transform="rotate(0,154,150)"></circle><path clipRule="evenodd" d="M 24 34v 8a 10 10, 0, 0, 0, 10 10h 8a 10 10, 0, 0, 0, 10 -10v -8a 10 10, 0, 0, 0, -10 -10h -8a 10 10, 0, 0, 0, -10 10M 34 28h 8a 6 6, 0, 0, 1, 6 6v 8a 6 6, 0, 0, 1, -6 6h -8a 6 6, 0, 0, 1, -6 -6v -8a 6 6, 0, 0, 1, 6 -6" transform="rotate(0,38,38)"></path><rect x="32" y="32" width="12" height="12" transform="rotate(0,38,38)"></rect><path clipRule="evenodd" d="M 128 34v 8a 10 10, 0, 0, 0, 10 10h 8a 10 10, 0, 0, 0, 10 -10v -8a 10 10, 0, 0, 0, -10 -10h -8a 10 10, 0, 0, 0, -10 10M 138 28h 8a 6 6, 0, 0, 1, 6 6v 8a 6 6, 0, 0, 1, -6 6h -8a 6 6, 0, 0, 1, -6 -6v -8a 6 6, 0, 0, 1, 6 -6" transform="rotate(90,142,38)"></path><rect x="136" y="32" width="12" height="12" transform="rotate(90,142,38)"></rect><path clipRule="evenodd" d="M 24 138v 8a 10 10, 0, 0, 0, 10 10h 8a 10 10, 0, 0, 0, 10 -10v -8a 10 10, 0, 0, 0, -10 -10h -8a 10 10, 0, 0, 0, -10 10M 34 132h 8a 6 6, 0, 0, 1, 6 6v 8a 6 6, 0, 0, 1, -6 6h -8a 6 6, 0, 0, 1, -6 -6v -8a 6 6, 0, 0, 1, 6 -6" transform="rotate(-90,38,142)"></path><rect x="32" y="136" width="12" height="12" transform="rotate(-90,38,142)"></rect></clipPath></defs><rect x="0" y="0" height="180" width="180" clipPath="url('#clipPath-background-color')" fill="#fff"></rect><rect x="24" y="24" height="132" width="132" clipPath="url('#clipPath-dot-color')" fill="#000000"></rect><image href="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiByeD0iMjMuMzMzMyIgZmlsbD0iI0ZGREQwMCIvPgo8cGF0aCBkPSJNNzEuODE4OSAyOC42NTg5TDcxLjc2NDEgMjguNjI2Nkw3MS42MzcyIDI4LjU4NzlDNzEuNjg4MyAyOC42MzEgNzEuNzUyMiAyOC42NTYgNzEuODE4OSAyOC42NTg5VjI4LjY1ODlaIiBmaWxsPSIjMEQwQzIyIi8+CjxwYXRoIGQ9Ik03Mi42MTg1IDM0LjM2OTFMNzIuNTU3MSAzNC4zODY0TDcyLjYxODUgMzQuMzY5MVoiIGZpbGw9IiMwRDBDMjIiLz4KPHBhdGggZD0iTTcxLjg0MyAyOC42NDhDNzEuODM1MiAyOC42NDcgNzEuODI3NiAyOC42NDUyIDcxLjgyMDIgMjguNjQyNkM3MS44MTk3IDI4LjY0NzYgNzEuODE5NyAyOC42NTI3IDcxLjgyMDIgMjguNjU3OEM3MS44Mjg1IDI4LjY1NjcgNzEuODM2NCAyOC42NTMzIDcxLjg0MyAyOC42NDhWMjguNjQ4WiIgZmlsbD0iIzBEMEMyMiIvPgo8cGF0aCBkPSJNNzEuODE5OCAyOC42NTc1SDcxLjgyODFWMjguNjUyM0w3MS44MTk4IDI4LjY1NzVaIiBmaWxsPSIjMEQwQzIyIi8+CjxwYXRoIGQ9Ik03Mi41NjkzIDM0LjM1NzRMNzIuNjYxOSAzNC4zMDQ3TDcyLjY5NjMgMzQuMjg1M0w3Mi43Mjc1IDM0LjI1MkM3Mi42Njg4IDM0LjI3NzIgNzIuNjE1MiAzNC4zMTMgNzIuNTY5MyAzNC4zNTc0VjM0LjM1NzRaIiBmaWxsPSIjMEQwQzIyIi8+CjxwYXRoIGQ9Ik03MS45NzkzIDI4Ljc4MTVMNzEuODg5IDI4LjY5NTVMNzEuODI3NiAyOC42NjIxQzcxLjg2MDYgMjguNzIwMyA3MS45MTUxIDI4Ljc2MzIgNzEuOTc5MyAyOC43ODE1VjI4Ljc4MTVaIiBmaWxsPSIjMEQwQzIyIi8+CjxwYXRoIGQ9Ik00OS4yNTEzIDg0LjE5OTJDNDkuMTc5MSA4NC4yMzA0IDQ5LjExNTkgODQuMjc5MiA0OS4wNjc0IDg0LjM0MTJMNDkuMTI0NCA4NC4zMDQ2QzQ5LjE2MzEgODQuMjY5MSA0OS4yMTc5IDg0LjIyNzIgNDkuMjUxMyA4NC4xOTkyWiIgZmlsbD0iIzBEMEMyMiIvPgo8cGF0aCBkPSJNNjIuNDQ5NiA4MS42MDE1QzYyLjQ0OTYgODEuNTE5OCA2Mi40MDk4IDgxLjUzNDggNjIuNDE5NSA4MS44MjUyQzYyLjQxOTUgODEuODAxNSA2Mi40MjkyIDgxLjc3NzggNjIuNDMzNSA4MS43NTUzQzYyLjQzODggODEuNzAzNiA2Mi40NDMxIDgxLjY1MzEgNjIuNDQ5NiA4MS42MDE1WiIgZmlsbD0iIzBEMEMyMiIvPgo8cGF0aCBkPSJNNjEuMDc5OSA4NC4xOTkyQzYxLjAwNzcgODQuMjMwNCA2MC45NDQ1IDg0LjI3OTIgNjAuODk2IDg0LjM0MTJMNjAuOTUzIDg0LjMwNDZDNjAuOTkxNyA4NC4yNjkxIDYxLjA0NjYgODQuMjI3MiA2MS4wNzk5IDg0LjE5OTJaIiBmaWxsPSIjMEQwQzIyIi8+CjxwYXRoIGQ9Ik0zOS45NTY4IDg0LjgxNjlDMzkuOTAyIDg0Ljc2OTIgMzkuODM0OSA4NC43Mzc5IDM5Ljc2MzIgODQuNzI2NkMzOS44MjEzIDg0Ljc1NDUgMzkuODc5MyA4NC43ODI1IDM5LjkxOCA4NC44MDRMMzkuOTU2OCA4NC44MTY5WiIgZmlsbD0iIzBEMEMyMiIvPgo8cGF0aCBkPSJNMzcuODY1NCA4Mi44MTMyQzM3Ljg1NjggODIuNzI4NSAzNy44MzA5IDgyLjY0NjQgMzcuNzg5MSA4Mi41NzIzQzM3LjgxODcgODIuNjQ5NSAzNy44NDM0IDgyLjcyODUgMzcuODYzMyA4Mi44MDg5TDM3Ljg2NTQgODIuODEzMloiIGZpbGw9IiMwRDBDMjIiLz4KPHBhdGggZD0iTTI3LjI5MzUgMzQuMTk1M0wyNy4zNDMgMzQuMjQxNkwyNy4zNzUzIDM0LjI2MUMyNy4zNTA0IDM0LjIzNjMgMjcuMzIzIDM0LjIxNDIgMjcuMjkzNSAzNC4xOTUzVjM0LjE5NTNaIiBmaWxsPSIjMEQwQzIyIi8+CjxwYXRoIGQ9Ik03MS40NDQ0IDI4LjU5NjRMNzEuMzg5NiAyOC41NjQxTDcxLjI2MjcgMjguNTI1NEM3MS4zMTM4IDI4LjU2ODUgNzEuMzc3NyAyOC41OTM1IDcxLjQ0NDQgMjguNTk2NFYyOC41OTY0WiIgZmlsbD0iIzBEMEMyMiIvPgo8cGF0aCBkPSJNNzIuMjQzOSAzNC4zMDY2TDcyLjE4MjYgMzQuMzIzOEw3Mi4yNDM5IDM0LjMwNjZaIiBmaWxsPSIjMEQwQzIyIi8+CjxwYXRoIGQ9Ik03MS40Njg1IDI4LjU4NTVDNzEuNDYwNyAyOC41ODQ1IDcxLjQ1MzEgMjguNTgyNyA3MS40NDU3IDI4LjU4MDFDNzEuNDQ1MiAyOC41ODUxIDcxLjQ0NTIgMjguNTkwMiA3MS40NDU3IDI4LjU5NTNDNzEuNDU0IDI4LjU5NDIgNzEuNDYxOSAyOC41OTA4IDcxLjQ2ODUgMjguNTg1NVYyOC41ODU1WiIgZmlsbD0iIzBEMEMyMiIvPgo8cGF0aCBkPSJNNzEuNDQ1MyAyOC41OTVINzEuNDUzNVYyOC41ODk4TDcxLjQ0NTMgMjguNTk1WiIgZmlsbD0iIzBEMEMyMiIvPgo8cGF0aCBkPSJNNzIuMTk0OCAzNC4yOTQ4TDcyLjI4NzMgMzQuMjQyMUw3Mi4zMjE3IDM0LjIyMjhMNzIuMzUyOSAzNC4xODk1QzcyLjI5NDMgMzQuMjE0NyA3Mi4yNDA3IDM0LjI1MDQgNzIuMTk0OCAzNC4yOTQ4VjM0LjI5NDhaIiBmaWxsPSIjMEQwQzIyIi8+CjxwYXRoIGQ9Ik03MS42MDQ4IDI4LjcxOUw3MS41MTQ0IDI4LjYzMjlMNzEuNDUzMSAyOC41OTk2QzcxLjQ4NjEgMjguNjU3NyA3MS41NDA1IDI4LjcwMDYgNzEuNjA0OCAyOC43MTlWMjguNzE5WiIgZmlsbD0iIzBEMEMyMiIvPgo8cGF0aCBkPSJNNDguODc2OCA4NC4xMzY3QzQ4LjgwNDYgODQuMTY3OSA0OC43NDE0IDg0LjIxNjcgNDguNjkyOSA4NC4yNzg3TDQ4Ljc0OTkgODQuMjQyMUM0OC43ODg2IDg0LjIwNjYgNDguODQzNCA4NC4xNjQ3IDQ4Ljg3NjggODQuMTM2N1oiIGZpbGw9IiMwRDBDMjIiLz4KPHBhdGggZD0iTTYyLjA3NTEgODEuNTM5QzYyLjA3NTEgODEuNDU3MyA2Mi4wMzUzIDgxLjQ3MjMgNjIuMDQ1IDgxLjc2MjdDNjIuMDQ1IDgxLjczOSA2Mi4wNTQ3IDgxLjcxNTMgNjIuMDU5IDgxLjY5MjhDNjIuMDY0MyA4MS42NDExIDYyLjA2ODYgODEuNTkwNiA2Mi4wNzUxIDgxLjUzOVoiIGZpbGw9IiMwRDBDMjIiLz4KPHBhdGggZD0iTTYwLjcwNTQgODQuMTM2N0M2MC42MzMyIDg0LjE2NzkgNjAuNTcgODQuMjE2NyA2MC41MjE1IDg0LjI3ODdMNjAuNTc4NSA4NC4yNDIxQzYwLjYxNzIgODQuMjA2NiA2MC42NzIgODQuMTY0NyA2MC43MDU0IDg0LjEzNjdaIiBmaWxsPSIjMEQwQzIyIi8+CjxwYXRoIGQ9Ik0zOS41ODIyIDg0Ljc1NDRDMzkuNTI3NSA4NC43MDY3IDM5LjQ2MDQgODQuNjc1NCAzOS4zODg3IDg0LjY2NDFDMzkuNDQ2NyA4NC42OTIgMzkuNTA0OCA4NC43MiAzOS41NDM1IDg0Ljc0MTVMMzkuNTgyMiA4NC43NTQ0WiIgZmlsbD0iIzBEMEMyMiIvPgo8cGF0aCBkPSJNMzcuNDkwOSA4Mi43NTA3QzM3LjQ4MjMgODIuNjY2IDM3LjQ1NjMgODIuNTgzOSAzNy40MTQ2IDgyLjUwOThDMzcuNDQ0MiA4Mi41ODcgMzcuNDY4OSA4Mi42NjYgMzcuNDg4OCA4Mi43NDY0TDM3LjQ5MDkgODIuNzUwN1oiIGZpbGw9IiMwRDBDMjIiLz4KPHBhdGggZD0iTTUxLjUzOTMgNDYuOTI3QzQ4LjY2OCA0OC4xNTYxIDQ1LjQwOTUgNDkuNTQ5OSA0MS4xODY0IDQ5LjU0OTlDMzkuNDE5OCA0OS41NDYzIDM3LjY2MTcgNDkuMzA0IDM1Ljk2IDQ4LjgyOTNMMzguODgwOCA3OC44MTY5QzM4Ljk4NDEgODAuMDcwMyAzOS41NTUxIDgxLjIzOSA0MC40ODAzIDgyLjA5MDlDNDEuNDA1NSA4Mi45NDI4IDQyLjYxNzMgODMuNDE1NiA0My44NzQ5IDgzLjQxNTRDNDMuODc0OSA4My40MTU0IDQ4LjAxNjMgODMuNjMwNCA0OS4zOTgyIDgzLjYzMDRDNTAuODg1NSA4My42MzA0IDU1LjM0NTIgODMuNDE1NCA1NS4zNDUyIDgzLjQxNTRDNTYuNjAyNiA4My40MTUzIDU3LjgxNDEgODIuOTQyNCA1OC43MzkxIDgyLjA5MDVDNTkuNjY0MSA4MS4yMzg3IDYwLjIzNDkgODAuMDcwMiA2MC4zMzgzIDc4LjgxNjlMNjMuNDY2NiA0NS42Nzk1QzYyLjA2ODYgNDUuMjAyIDYwLjY1NzcgNDQuODg0OCA1OS4wNjcxIDQ0Ljg4NDhDNTYuMzE2MyA0NC44ODM3IDU0LjA5OTkgNDUuODMxMSA1MS41MzkzIDQ2LjkyN1oiIGZpbGw9IndoaXRlIi8+CjxwYXRoIGQ9Ik0yNi45MTg5IDM0LjEzMjhMMjYuOTY4NCAzNC4xNzkxTDI3LjAwMDcgMzQuMTk4NEMyNi45NzU4IDM0LjE3MzcgMjYuOTQ4NCAzNC4xNTE3IDI2LjkxODkgMzQuMTMyOFYzNC4xMzI4WiIgZmlsbD0iIzBEMEMyMiIvPgoKPHBhdGggZD0iTTc2Ljk3MjkgMzEuMzY1Nkw3Ni41MzMxIDI5LjE0N0M3Ni4xMzg0IDI3LjE1NjQgNzUuMjQyNiAyNS4yNzU1IDczLjE5OTQgMjQuNTU2MUM3Mi41NDQ0IDI0LjMyNiA3MS44MDEzIDI0LjIyNyA3MS4yOTkxIDIzLjc1MDZDNzAuNzk2OSAyMy4yNzQyIDcwLjY0ODUgMjIuNTM0MyA3MC41MzI0IDIxLjg0ODJDNzAuMzE3MyAyMC41ODg5IDcwLjExNTEgMTkuMzI4NiA2OS44OTQ2IDE4LjA3MTRDNjkuNzA0MyAxNi45OTA2IDY5LjU1MzcgMTUuNzc2NSA2OS4wNTggMTQuNzg1QzY4LjQxMjcgMTMuNDUzNiA2Ny4wNzM5IDEyLjY3NTEgNjUuNzQyNSAxMi4xNTk5QzY1LjA2MDMgMTEuOTA1MyA2NC4zNjQxIDExLjY4OTggNjMuNjU3MyAxMS41MTQ3QzYwLjMzMTEgMTAuNjM3MiA1Ni44MzM5IDEwLjMxNDUgNTMuNDExOSAxMC4xMzA3QzQ5LjMwNDcgOS45MDQwMSA0NS4xODY0IDkuOTcyMyA0MS4wODg5IDEwLjMzNUMzOC4wMzkxIDEwLjYxMjQgMzQuODI2OCAxMC45NDggMzEuOTI4NiAxMi4wMDI5QzMwLjg2OTQgMTIuMzg5IDI5Ljc3NzggMTIuODUyNSAyOC45NzIzIDEzLjY3MDlDMjcuOTg0MSAxNC42NzY0IDI3LjY2MTQgMTYuMjMxNCAyOC4zODMgMTcuNDg1M0MyOC44OTYgMTguMzc1OCAyOS43NjQ5IDE5LjAwNDkgMzAuNjg2NSAxOS40MjExQzMxLjg4NyAxOS45NTczIDMzLjE0MDcgMjAuMzY1MyAzNC40MjY4IDIwLjYzODRDMzguMDA3OSAyMS40Mjk5IDQxLjcxNjkgMjEuNzQwNyA0NS4zNzU1IDIxLjg3M0M0OS40MzA0IDIyLjAzNjYgNTMuNDkxOSAyMS45MDQgNTcuNTI3NSAyMS40NzYyQzU4LjUyNTUgMjEuMzY2NSA1OS41MjE3IDIxLjIzNDkgNjAuNTE2MSAyMS4wODE1QzYxLjY4NzIgMjAuOTAxOSA2Mi40Mzg5IDE5LjM3MDUgNjIuMDkzNyAxOC4zMDM3QzYxLjY4MDcgMTcuMDI4MyA2MC41NzA5IDE2LjUzMzYgNTkuMzE1OSAxNi43MjYxQzU5LjEzMDkgMTYuNzU1MSA1OC45NDcgMTYuNzgyIDU4Ljc2MjEgMTYuODA4OUw1OC42Mjg3IDE2LjgyODNDNTguMjAzNiAxNi44ODIgNTcuNzc4NCAxNi45MzIyIDU3LjM1MzMgMTYuOTc4OEM1Ni40NzUxIDE3LjA3MzUgNTUuNTk0NyAxNy4xNTA5IDU0LjcxMjEgMTcuMjExMUM1Mi43MzU1IDE3LjM0ODggNTAuNzUzNiAxNy40MTIyIDQ4Ljc3MjcgMTcuNDE1NEM0Ni44MjYyIDE3LjQxNTQgNDQuODc4NiAxNy4zNjA2IDQyLjkzNjUgMTcuMjMyNkM0Mi4wNTAzIDE3LjE3NDUgNDEuMTY2MyAxNy4xMDA3IDQwLjI4NDUgMTcuMDExMUMzOS44ODM0IDE2Ljk2OTEgMzkuNDgzMyAxNi45MjUgMzkuMDgzMyAxNi44NzU2TDM4LjcwMjYgMTYuODI3MkwzOC42MTk4IDE2LjgxNTRMMzguMjI1MSAxNi43NTg0QzM3LjQxODYgMTYuNjM2OCAzNi42MTIgMTYuNDk3IDM1LjgxNDEgMTYuMzI4MkMzNS43MzM1IDE2LjMxMDMgMzUuNjYxNSAxNi4yNjU1IDM1LjYwOTkgMTYuMjAxMkMzNS41NTgzIDE2LjEzNjkgMzUuNTMwMSAxNi4wNTY5IDM1LjUzMDEgMTUuOTc0NEMzNS41MzAxIDE1Ljg5MTkgMzUuNTU4MyAxNS44MTE5IDM1LjYwOTkgMTUuNzQ3NkMzNS42NjE1IDE1LjY4MzIgMzUuNzMzNSAxNS42Mzg0IDM1LjgxNDEgMTUuNjIwNkgzNS44MjkxQzM2LjUyMDYgMTUuNDczMyAzNy4yMTc1IDE1LjM0NzQgMzcuOTE2NSAxNS4yMzc3QzM4LjE0OTUgMTUuMjAxMiAzOC4zODMyIDE1LjE2NTMgMzguNjE3NiAxNS4xMzAySDM4LjYyNDFDMzkuMDYxOCAxNS4xMDEyIDM5LjUwMTYgMTUuMDIyNyAzOS45MzcyIDE0Ljk3MUM0My43MjY1IDE0LjU3NjkgNDcuNTM4NCAxNC40NDI1IDUxLjM0NjEgMTQuNTY4OEM1My4xOTQ3IDE0LjYyMjYgNTUuMDQyMyAxNC43MzEyIDU2Ljg4MjMgMTQuOTE4M0M1Ny4yNzggMTQuOTU5MiA1Ny42NzE2IDE1LjAwMjIgNTguMDY1MiAxNS4wNTA2QzU4LjIxNTggMTUuMDY4OSA1OC4zNjc0IDE1LjA5MDQgNTguNTE5IDE1LjEwODdMNTguODI0NSAxNS4xNTI4QzU5LjcxNDkgMTUuMjg1NCA2MC42MDA3IDE1LjQ0NjQgNjEuNDgxOCAxNS42MzU2QzYyLjc4NzMgMTUuOTE5NSA2NC40NjM5IDE2LjAxMiA2NS4wNDQ2IDE3LjQ0MjNDNjUuMjI5NSAxNy44OTYxIDY1LjMxMzQgMTguNDAwNSA2NS40MTU2IDE4Ljg3NjlMNjUuNTQ1NyAxOS40ODQ1QzY1LjU0OTEgMTkuNDk1NCA2NS41NTE2IDE5LjUwNjUgNjUuNTUzMiAxOS41MTc4QzY1Ljg2MDggMjAuOTUxNyA2Ni4xNjg3IDIyLjM4NTYgNjYuNDc3IDIzLjgxOTVDNjYuNDk5NiAyMy45MjU0IDY2LjUwMDEgMjQuMDM0OCA2Ni40Nzg2IDI0LjE0MUM2Ni40NTcgMjQuMjQ3MSA2Ni40MTM4IDI0LjM0NzcgNjYuMzUxNiAyNC40MzYzQzY2LjI4OTUgMjQuNTI1IDY2LjIwOTcgMjQuNiA2Ni4xMTczIDI0LjY1NjVDNjYuMDI0OSAyNC43MTMgNjUuOTIxOCAyNC43NDk4IDY1LjgxNDYgMjQuNzY0N0g2NS44MDZMNjUuNjE3OCAyNC43OTA1TDY1LjQzMTcgMjQuODE1M0M2NC44NDI0IDI0Ljg5MiA2NC4yNTI0IDI0Ljk2MzcgNjMuNjYxNiAyNS4wMzA0QzYyLjQ5OCAyNS4xNjMgNjEuMzMyNiAyNS4yNzc3IDYwLjE2NTUgMjUuMzc0NUM1Ny44NDYyIDI1LjU2NzMgNTUuNTIyMiAyNS42OTM5IDUzLjE5MzYgMjUuNzU0MUM1Mi4wMDcxIDI1Ljc4NTYgNTAuODIwOSAyNS44MDAzIDQ5LjYzNTEgMjUuNzk4MkM0NC45MTUyIDI1Ljc5NDUgNDAuMTk5MyAyNS41MjAxIDM1LjUxMDggMjQuOTc2NkMzNS4wMDMyIDI0LjkxNjQgMzQuNDk1NiAyNC44NTE4IDMzLjk4OCAyNC43ODYyQzM0LjM4MTYgMjQuODM2OCAzMy43MDIgMjQuNzQ3NSAzMy41NjQzIDI0LjcyODJDMzMuMjQxNyAyNC42ODMgMzIuOTE5MSAyNC42MzYgMzIuNTk2NSAyNC41ODczQzMxLjUxMzUgMjQuNDI0OSAzMC40MzcgMjQuMjI0OSAyOS4zNTYzIDI0LjA0OTZDMjguMDQ5NyAyMy44MzQ1IDI2LjggMjMuOTQyIDI1LjYxODIgMjQuNTg3M0MyNC42NDggMjUuMTE4MiAyMy44NjI4IDI1LjkzMjIgMjMuMzY3MyAyNi45MjA5QzIyLjg1NzYgMjcuOTc0OCAyMi43MDYgMjkuMTIyMyAyMi40NzggMzAuMjU0N0MyMi4yNSAzMS4zODcxIDIxLjg5NTEgMzIuNjA1NSAyMi4wMjk1IDMzLjc2OEMyMi4zMTg4IDM2LjI3NjkgMjQuMDcyOCAzOC4zMTU5IDI2LjU5NTcgMzguNzcxOUMyOC45NjkxIDM5LjIwMiAzMS4zNTU0IDM5LjU1MDQgMzMuNzQ4MiAzOS44NDczQzQzLjE0NzYgNDAuOTk4NCA1Mi42NDM0IDQxLjEzNjIgNjIuMDcyMiA0MC4yNTgxQzYyLjg0IDQwLjE4NjQgNjMuNjA2OCA0MC4xMDgyIDY0LjM3MjQgNDAuMDIzNkM2NC42MTE2IDM5Ljk5NzMgNjQuODUzNiA0MC4wMjQ5IDY1LjA4MDcgNDAuMTA0M0M2NS4zMDc5IDQwLjE4MzYgNjUuNTE0NCA0MC4zMTI4IDY1LjY4NTEgNDAuNDgyM0M2NS44NTU4IDQwLjY1MTggNjUuOTg2NSA0MC44NTc0IDY2LjA2NzUgNDEuMDgzOUM2Ni4xNDg1IDQxLjMxMDQgNjYuMTc3OSA0MS41NTIyIDY2LjE1MzMgNDEuNzkxNkw2NS45MTQ2IDQ0LjExMjNDNjUuNDMzNSA0OC44MDE4IDY0Ljk1MjUgNTMuNDkwOSA2NC40NzE0IDU4LjE3OTZDNjMuOTY5NSA2My4xMDM2IDYzLjQ2NDUgNjguMDI3MSA2Mi45NTYxIDcyLjk1MDNDNjIuODEyOCA3NC4zMzY5IDYyLjY2OTQgNzUuNzIzIDYyLjUyNiA3Ny4xMDg5QzYyLjM4ODMgNzguNDczNiA2Mi4zNjkgNzkuODgxMyA2Mi4xMDk4IDgxLjIyOThDNjEuNzAxMiA4My4zNTA1IDYwLjI2NTUgODQuNjUyOCA1OC4xNzA2IDg1LjEyOTJDNTYuMjUxNCA4NS41NjYgNTQuMjkwOCA4NS43OTUzIDUyLjMyMjYgODUuODEzMkM1MC4xNDA2IDg1LjgyNSA0Ny45NTk3IDg1LjcyODIgNDUuNzc3NyA4NS43NDAxQzQzLjQ0ODMgODUuNzUzIDQwLjU5NTMgODUuNTM3OSAzOC43OTcyIDgzLjgwNDNDMzcuMjE3NSA4Mi4yODE2IDM2Ljk5OTIgNzkuODk3NCAzNi43ODQxIDc3LjgzNTlDMzYuNDk3MyA3NS4xMDY1IDM2LjIxMyA3Mi4zNzc1IDM1LjkzMTMgNjkuNjQ4OEwzNC4zNTA0IDU0LjQ3NkwzMy4zMjc3IDQ0LjY1ODZDMzMuMzEwNSA0NC40OTYyIDMzLjI5MzMgNDQuMzM2IDMzLjI3NzIgNDQuMTcyNUMzMy4xNTQ2IDQzLjAwMTQgMzIuMzI1NSA0MS44NTUgMzEuMDE4OCA0MS45MTQyQzI5LjkwMDQgNDEuOTYzNyAyOC42MjkzIDQyLjkxNDMgMjguNzYwNSA0NC4xNzI1TDI5LjUxODcgNTEuNDUwOUwzMS4wODY2IDY2LjUwNjVDMzEuNTMzMiA3MC43ODMgMzEuOTc4OCA3NS4wNjAyIDMyLjQyMzMgNzkuMzM4MkMzMi41MDkzIDgwLjE1NzcgMzIuNTkgODAuOTc5MyAzMi42ODAzIDgxLjc5ODdDMzMuMTcxOCA4Ni4yNzY3IDM2LjU5MTYgODguNjg5OSA0MC44MjY1IDg5LjM2OTVDNDMuMjk5OSA4OS43Njc0IDQ1LjgzMzYgODkuODQ5MiA0OC4zNDM2IDg5Ljg5QzUxLjU2MTIgODkuOTQxNyA1NC44MTEgOTAuMDY1MyA1Ny45NzYgODkuNDgyNUM2Mi42NjU4IDg4LjYyMjEgNjYuMTg0NSA4NS40OTA2IDY2LjY4NjcgODAuNjMzQzY2LjgzMDEgNzkuMjMwNyA2Ni45NzM1IDc3LjgyOCA2Ny4xMTY5IDc2LjQyNDlDNjcuNTkzNiA3MS43ODQ5IDY4LjA2OTcgNjcuMTQ0NiA2OC41NDUgNjIuNTAzOEw3MC4xIDQ3LjM0MDdMNzAuODEzIDQwLjM5MTRDNzAuODQ4NiA0MC4wNDY4IDcwLjk5NDEgMzkuNzIyOCA3MS4yMjggMzkuNDY3NEM3MS40NjIgMzkuMjExOSA3MS43NzIgMzkuMDM4NiA3Mi4xMTIxIDM4Ljk3M0M3My40NTMyIDM4LjcxMTYgNzQuNzM1IDM4LjI2NTMgNzUuNjg4OSAzNy4yNDQ4Qzc3LjIwNzQgMzUuNjE5OCA3Ny41MDk2IDMzLjUwMTMgNzYuOTcyOSAzMS4zNjU2Wk0yNi41MjY5IDMyLjg2NDdDMjYuNTQ3MyAzMi44NTUgMjYuNTA5NyAzMy4wMzAzIDI2LjQ5MzUgMzMuMTEyQzI2LjQ5MDMgMzIuOTg4MyAyNi40OTY4IDMyLjg3ODYgMjYuNTI2OSAzMi44NjQ3Wk0yNi42NTcgMzMuODcxMkMyNi42Njc4IDMzLjg2MzcgMjYuNyAzMy45MDY3IDI2LjczMzQgMzMuOTU4M0MyNi42ODI4IDMzLjkxMSAyNi42NTA2IDMzLjg3NTUgMjYuNjU1OSAzMy44NzEySDI2LjY1N1pNMjYuNzg1IDM0LjA0MDFDMjYuODMxMiAzNC4xMTg2IDI2Ljg1NiAzNC4xNjgxIDI2Ljc4NSAzNC4wNDAxVjM0LjA0MDFaTTI3LjA0MiAzNC4yNDg3SDI3LjA0ODRDMjcuMDQ4NCAzNC4yNTYyIDI3LjA2MDMgMzQuMjYzOCAyNy4wNjQ2IDM0LjI3MTNDMjcuMDU3NSAzNC4yNjMgMjcuMDQ5NSAzNC4yNTU0IDI3LjA0MDkgMzQuMjQ4N0gyNy4wNDJaTTcyLjA0OTggMzMuOTM2OEM3MS41NjggMzQuMzk1IDcwLjg0MjEgMzQuNjA3OSA3MC4xMjQ4IDM0LjcxNDRDNjIuMDgwOCAzNS45MDgxIDUzLjkxOTUgMzYuNTEyNCA0NS43ODczIDM2LjI0NTdDMzkuOTY3MyAzNi4wNDY4IDM0LjIwODUgMzUuNDAwNSAyOC40NDY1IDM0LjU4NjRDMjcuODgxOSAzNC41MDY4IDI3LjI3IDM0LjQwMzYgMjYuODgxOCAzMy45ODc0QzI2LjE1MDUgMzMuMjAyMyAyNi41MDk3IDMxLjYyMTUgMjYuNyAzMC42NzNDMjYuODc0MiAyOS44MDQxIDI3LjIwNzYgMjguNjQ1OSAyOC4yNDExIDI4LjUyMjJDMjkuODU0MiAyOC4zMzI5IDMxLjcyNzUgMjkuMDEzNiAzMy4zMjM0IDI5LjI1NTZDMzUuMjQ0OCAyOS41NDg4IDM3LjE3MzQgMjkuNzgzNiAzOS4xMDkxIDI5Ljk2QzQ3LjM3MDMgMzAuNzEyOCA1NS43NzAzIDMwLjU5NTYgNjMuOTk1IDI5LjQ5NDRDNjUuNDk0MSAyOS4yOTI5IDY2Ljk4NzggMjkuMDU4OCA2OC40NzYyIDI4Ljc5MjFDNjkuODAyMiAyOC41NTQ1IDcxLjI3MjIgMjguMTA4MiA3Mi4wNzM0IDI5LjQ4MTRDNzIuNjIyOSAzMC40MTcxIDcyLjY5NjEgMzEuNjY4OCA3Mi42MTExIDMyLjcyNTlDNzIuNTg0OSAzMy4xODY1IDcyLjM4MzcgMzMuNjE5NyA3Mi4wNDg3IDMzLjkzNjhINzIuMDQ5OFoiIGZpbGw9IiMwRDBDMjIiLz4KCjwvc3ZnPg==" x="80" y="80" width="20px" height="20px"></image></svg>
                                        </a>
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
                                                ⚠️ Folder and File names must be <strong>UPPERCASE</strong>.
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
                    )}
                </div>
            </div>
        </div>
    );
};
