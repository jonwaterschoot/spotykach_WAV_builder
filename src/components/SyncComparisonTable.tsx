import { useState, useEffect, useRef } from 'react';
import { Play, Square, ArrowRight, X, FileAudio } from 'lucide-react';

export interface SyncItem {
    id: string;
    file: File;
    type: 'new' | 'update';
    slot: string;
    sourceName: string;
    targetName?: string; // For updates
    size: number;
    decision: 'overwrite' | 'skip' | 'keep_both';
}

interface SyncComparisonTableProps {
    items: SyncItem[];
    onDecisionChange: (id: string, decision: SyncItem['decision']) => void;
}

export const SyncComparisonTable = ({ items, onDecisionChange }: SyncComparisonTableProps) => {
    const [previewId, setPreviewId] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const handlePlay = (id: string, file: File) => {
        if (previewId === id) {
            audioRef.current?.pause();
            setPreviewId(null);
            return;
        }

        if (audioRef.current) {
            audioRef.current.pause();
            URL.revokeObjectURL(audioRef.current.src);
        }

        const url = URL.createObjectURL(file);
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => setPreviewId(null);
        audio.play().catch(e => console.error("Preview failed", e));
        setPreviewId(id);
    };

    useEffect(() => {
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                URL.revokeObjectURL(audioRef.current.src);
            }
        };
    }, []);

    const formatSize = (bytes: number) => {
        return (bytes / 1024 / 1024).toFixed(2) + ' MB';
    };

    return (
        <div className="flex flex-col gap-2 w-full text-sm">
            {/* Header */}
            <div className="grid grid-cols-[auto_1fr_auto_auto] gap-4 px-4 py-2 text-gray-500 font-bold uppercase text-xs border-b border-gray-800">
                <div className="w-8"></div>
                <div>File Info</div>
                <div>Action</div>
                <div className="w-20 text-right">Size</div>
            </div>

            {items.map(item => (
                <div
                    key={item.id}
                    className={`grid grid-cols-[auto_1fr_auto_auto] gap-4 items-center p-3 rounded-lg border transition-colors ${item.decision === 'skip' ? 'bg-black/20 border-gray-800 opacity-60' :
                            item.type === 'new' ? 'bg-green-500/5 border-green-500/20' :
                                'bg-blue-500/5 border-blue-500/20'
                        }`}
                >
                    {/* Play Button */}
                    <button
                        onClick={() => handlePlay(item.id, item.file)}
                        className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${previewId === item.id ? 'bg-synthux-orange text-black' : 'bg-gray-800 text-gray-400 hover:text-white'
                            }`}
                    >
                        {previewId === item.id ? <Square size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
                    </button>

                    {/* File Details */}
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${item.type === 'new' ? 'text-green-400 bg-green-900/30' : 'text-blue-400 bg-blue-900/30'
                                }`}>
                                {item.slot}
                            </span>
                            <span className="font-bold truncate text-gray-200" title={item.sourceName}>{item.sourceName}</span>
                        </div>
                        {item.type === 'update' && (
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                                <ArrowRight size={12} />
                                <span>Replaces: <span className="text-gray-400">{item.targetName}</span></span>
                            </div>
                        )}
                        {item.type === 'new' && (
                            <div className="text-xs text-gray-500">New recording</div>
                        )}
                    </div>

                    {/* Decisions */}
                    <div className="flex gap-1">
                        <button
                            onClick={() => onDecisionChange(item.id, 'overwrite')}
                            className={`px-3 py-1.5 rounded text-xs font-bold transition-colors ${item.decision === 'overwrite'
                                    ? (item.type === 'new' ? 'bg-green-600 text-white' : 'bg-blue-600 text-white')
                                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                                }`}
                        >
                            {item.type === 'new' ? 'Import' : 'Overwrite'}
                        </button>

                        <button
                            onClick={() => onDecisionChange(item.id, 'keep_both')}
                            title="Keep both (Rename Incoming)"
                            className={`p-1.5 rounded transition-colors ${item.decision === 'keep_both' ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                                }`}
                        >
                            <FileAudio size={16} />
                        </button>

                        <button
                            onClick={() => onDecisionChange(item.id, 'skip')}
                            title="Skip / Do Nothing"
                            className={`p-1.5 rounded transition-colors ${item.decision === 'skip' ? 'bg-red-900/50 text-red-400 border border-red-900' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                                }`}
                        >
                            <X size={16} />
                        </button>
                    </div>

                    {/* Size */}
                    <div className="text-right text-xs font-mono text-gray-400 w-20">
                        {formatSize(item.size)}
                    </div>
                </div>
            ))}
        </div>
    );
};
