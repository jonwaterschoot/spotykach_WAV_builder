import { useState, useRef } from 'react';
import { X, Play, Square, Download, FolderOpen, Loader, Check } from 'lucide-react';
import { SAMPLE_PACKS, type Sample } from '../data/samplePacks';

interface SamplePackModalProps {
    isOpen: boolean;
    onClose: () => void;
    onImport: (url: string, name: string, origin?: string, license?: string) => Promise<void>;
}

export const SamplePackModal = ({ isOpen, onClose, onImport }: SamplePackModalProps) => {
    const [selectedPackId, setSelectedPackId] = useState<string>(SAMPLE_PACKS[0]?.id || '');
    const [playingSample, setPlayingSample] = useState<string | null>(null);
    const [importingSample, setImportingSample] = useState<string | null>(null);
    const [addedSamples, setAddedSamples] = useState<Set<string>>(new Set());
    const audioRef = useRef<HTMLAudioElement | null>(null);

    if (!isOpen) return null;

    const selectedPack = SAMPLE_PACKS.find(p => p.id === selectedPackId);

    const handlePlay = (sample: Sample) => {
        if (playingSample === sample.path) {
            // Stop
            audioRef.current?.pause();
            setPlayingSample(null);
        } else {
            // Play new
            if (audioRef.current) {
                audioRef.current.pause();
                const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, '');
                audioRef.current.src = `${baseUrl}${sample.path}`;
                audioRef.current.play().catch(e => console.error("Preview failed", e));
                setPlayingSample(sample.path);
            }
        }
    };

    const handleImport = async (sample: Sample) => {
        setImportingSample(sample.path);
        try {
            const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, '');
            await onImport(
                `${baseUrl}${sample.path}`,
                sample.name,
                selectedPack?.name, // Use Pack Name as Origin
                selectedPack?.license // Pass License text
            );
            setAddedSamples(prev => new Set(prev).add(sample.path));
        } catch (error) {
            console.error("Import failed", error);
            // Toast is handled by parent, but we can keep alert here as fallback or remove if relying on parent
        } finally {
            setImportingSample(null);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6">
            <div className="bg-synthux-panel border border-gray-700 rounded-lg shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-synthux-panel">
                    <h2 className="text-xl font-bold flex items-center gap-2 text-white">
                        <FolderOpen className="text-synthux-orange" /> Sample Pack Browser
                    </h2>
                    <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 flex overflow-hidden">
                    {/* Sidebar: Packs List */}
                    <div className="w-64 bg-synthux-sidebg border-r border-gray-800 p-4 flex flex-col gap-2 overflow-y-auto">
                        <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">Available Packs</h3>
                        {SAMPLE_PACKS.map(pack => (
                            <button
                                key={pack.id}
                                onClick={() => setSelectedPackId(pack.id)}
                                className={`text-left px-3 py-2 rounded text-sm font-medium transition-colors ${selectedPackId === pack.id
                                    ? 'bg-synthux-orange/20 text-synthux-orange border border-synthux-orange/50'
                                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                                    }`}
                            >
                                {pack.name}
                            </button>
                        ))}
                    </div>

                    {/* Main: Sample List */}
                    <div className="flex-1 bg-synthux-main p-6 overflow-y-auto">
                        {selectedPack ? (
                            <>
                                <div className="mb-6">
                                    <h1 className="text-2xl font-bold text-white mb-2">{selectedPack.name}</h1>
                                    <p className="text-gray-400 text-sm max-w-xl mb-4 leading-relaxed font-body">{selectedPack.description}</p>

                                    {selectedPack.license && (
                                        <div className="bg-black/20 p-3 rounded-lg border border-gray-800 text-xs text-gray-400 font-mono whitespace-pre-wrap mb-4 max-w-xl">
                                            <strong className="block text-gray-500 mb-1 uppercase tracking-wider">License</strong>
                                            {selectedPack.license}
                                        </div>
                                    )}

                                    {selectedPack.links && selectedPack.links.length > 0 && (
                                        <div className="flex gap-2 mb-4 flex-wrap text-sm">
                                            {selectedPack.links.map((link, i) => (
                                                <a
                                                    key={i}
                                                    href={link.url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-synthux-blue rounded border border-gray-700 transition-colors"
                                                >
                                                    {link.label}
                                                </a>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-6">
                                    {Object.entries(
                                        selectedPack.samples.reduce((acc, sample) => {
                                            const category = sample.category || 'Uncategorized';
                                            if (!acc[category]) acc[category] = [];
                                            acc[category].push(sample);
                                            return acc;
                                        }, {} as Record<string, Sample[]>)
                                    ).map(([category, samples]) => (
                                        <div key={category}>
                                            <h3 className="sticky top-0 z-10 bg-synthux-main text-xs font-bold text-synthux-orange uppercase py-2 px-4 mb-1 border-b border-gray-800">
                                                {category}
                                            </h3>
                                            <div className="space-y-1">
                                                {samples.map((sample, idx) => {
                                                    const isPlaying = playingSample === sample.path;
                                                    const isImporting = importingSample === sample.path;
                                                    const isAdded = addedSamples.has(sample.path);

                                                    return (
                                                        <div key={idx} className="grid grid-cols-[40px_1fr_100px] gap-4 items-center px-4 py-3 hover:bg-gray-800/50 rounded border border-transparent hover:border-gray-800 transition-colors group">
                                                            {/* Play Button */}
                                                            <button
                                                                onClick={() => handlePlay(sample)}
                                                                className={`w-8 h-8 flex items-center justify-center rounded-full transition-all ${isPlaying ? 'text-synthux-orange bg-synthux-orange/10' : 'text-gray-500 hover:text-white bg-gray-800 hover:bg-gray-700'
                                                                    }`}
                                                            >
                                                                {isPlaying ? <Square size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
                                                            </button>

                                                            {/* Name */}
                                                            <div className="font-mono text-sm text-gray-300 group-hover:text-white truncate">
                                                                {sample.name}
                                                            </div>

                                                            {/* Action */}
                                                            <div className="text-right">
                                                                <button
                                                                    onClick={() => handleImport(sample)}
                                                                    disabled={isImporting || isAdded}
                                                                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold transition-colors disabled:cursor-not-allowed ${isAdded
                                                                        ? 'bg-synthux-yellow/20 text-synthux-yellow border border-synthux-yellow/50'
                                                                        : 'bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white'
                                                                        }`}
                                                                >
                                                                    {isImporting ? (
                                                                        <>
                                                                            <Loader size={12} className="animate-spin" /> Adding...
                                                                        </>
                                                                    ) : isAdded ? (
                                                                        <>
                                                                            <Check size={14} /> Added
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            <Download size={14} /> Add
                                                                        </>
                                                                    )}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <div className="flex items-center justify-center h-full text-gray-500">
                                Select a pack to browse samples
                            </div>
                        )}
                    </div>
                </div>

                {/* Hidden Audio Element for Preview */}
                <audio ref={audioRef} onEnded={() => setPlayingSample(null)} />
            </div>
        </div>
    );
};
