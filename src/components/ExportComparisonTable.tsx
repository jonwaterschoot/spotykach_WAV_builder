import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, ArrowRight, X, RotateCcw, FileAudio, AlertTriangle, Trash2, Check } from 'lucide-react';

export interface ExportItem {
    id: string;
    file: File | Blob | null; // Null if we are deleting from hardware or empty
    type: 'new' | 'update' | 'delete' | 'match' | 'empty';
    slot: string;
    localName?: string;
    hardwareName?: string;
    size: number;
    decision: 'export' | 'skip' | 'delete';
}

interface ExportComparisonTableProps {
    items: ExportItem[];
    onDecisionChange: (id: string, decision: ExportItem['decision']) => void;
}

export const ExportComparisonTable = ({ items, onDecisionChange }: ExportComparisonTableProps) => {
    const [previewId, setPreviewId] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const handlePlay = (id: string, file: File | Blob | null) => {
        if (!file) return;
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
            <div className="grid grid-cols-[1fr_auto_1fr_auto] gap-4 px-4 py-2 text-gray-500 font-bold uppercase text-xs border-b border-gray-800 text-center">
                <div className="text-left pl-10">Project File</div>
                <div className="w-20">Slot</div>
                <div className="text-left pl-4">Hardcopy File</div>
                <div className="w-24 text-right">Action</div>
            </div>

            {items.map(item => (
                <div
                    key={item.id}
                    className={`grid grid-cols-[1fr_auto_1fr_auto] gap-4 items-center p-3 rounded-lg border transition-colors ${item.decision === 'skip' ? 'bg-black/20 border-gray-800 opacity-60' :
                        item.type === 'new' ? 'bg-indigo-500/5 border-indigo-500/20' :
                            item.type === 'delete' ? 'bg-red-500/5 border-red-500/20' :
                                item.type === 'match' ? 'bg-transparent border-gray-800 opacity-60' :
                                    item.type === 'empty' ? 'bg-transparent border-gray-900 opacity-40' :
                                        'bg-blue-500/5 border-blue-500/20'
                        }`}
                >
                    {/* LEFT COLUMN: Local Project File */}
                    <div className="flex items-center gap-3 min-w-0">
                        <button
                            onClick={() => handlePlay(item.id, item.file)}
                            disabled={!item.file || item.type === 'empty'}
                            className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full transition-colors ${!item.file || item.type === 'empty' ? 'opacity-30 cursor-not-allowed text-gray-600' :
                                previewId === item.id ? 'bg-synthux-orange text-black' : 'bg-gray-800 text-gray-400 hover:text-white'
                                }`}
                        >
                            {previewId === item.id ? <Square size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
                        </button>
                        <div className="min-w-0">
                            {item.type === 'empty' ? (
                                <span className="text-gray-600 italic">Empty Slot</span>
                            ) : item.type === 'delete' ? (
                                <span className="text-gray-500 italic">No File</span>
                            ) : (
                                <div className="flex flex-col">
                                    <span className="font-bold truncate text-gray-200" title={item.localName}>
                                        {item.localName}
                                    </span>
                                    <span className="text-[10px] text-gray-500 font-mono flex items-center gap-2">
                                        <FileAudio size={10} /> {formatSize(item.size)}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* CENTER COLUMN: Slot Badge */}
                    <div className="flex justify-center items-center w-20">
                        <span className={`text-[10px] font-mono px-2 py-1 rounded w-full text-center ${item.type === 'new' ? 'text-indigo-400 bg-indigo-900/40 border border-indigo-700/50' :
                            item.type === 'delete' ? 'text-red-400 bg-red-900/40 border border-red-700/50' :
                                item.type === 'match' ? 'text-gray-400 bg-gray-900 border border-gray-800' :
                                    item.type === 'empty' ? 'text-gray-600 bg-gray-900 border border-gray-800 shadow-inner' :
                                        'text-blue-400 bg-blue-900/40 border border-blue-700/50'
                            }`}>
                            {item.slot}
                        </span>
                    </div>

                    {/* RIGHT COLUMN: Hardware File */}
                    <div className="flex items-center gap-3 min-w-0 pl-2">
                        {item.type === 'new' ? (
                            <ArrowRight className="text-indigo-500 flex-shrink-0" size={16} />
                        ) : item.type === 'update' ? (
                            <RotateCcw className="text-blue-500 flex-shrink-0" size={16} />
                        ) : item.type === 'delete' ? (
                            <Trash2 className="text-red-500 flex-shrink-0" size={16} />
                        ) : item.type === 'match' ? (
                            <Check className="text-gray-600 flex-shrink-0" size={16} />
                        ) : (
                            <div className="w-4 flex-shrink-0" /> // Spacer for empty
                        )}

                        <div className="min-w-0">
                            {item.type === 'new' || item.type === 'empty' ? (
                                <span className="text-gray-600 italic">Empty</span>
                            ) : (
                                <div className="flex flex-col">
                                    <span className={`font-bold truncate ${item.type === 'delete' || item.type === 'update' ? 'text-gray-500 line-through' : 'text-gray-400'}`} title={item.hardwareName}>
                                        {item.hardwareName}
                                    </span>
                                    {item.type !== 'match' && (
                                        <span className="text-[10px] text-gray-500 flex items-center gap-1">
                                            {item.type === 'delete' ? <AlertTriangle size={10} className="text-red-500/50" /> : null}
                                            Hardware file
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ACTIONS */}
                    <div className="flex gap-1 justify-end w-24">
                        {item.type === 'match' || item.type === 'empty' ? (
                            <div className="text-[10px] text-gray-500 px-2 py-1 uppercase tracking-widest font-bold w-full text-right">
                                {item.type === 'match' ? 'In Sync' : '-'}
                            </div>
                        ) : (
                            <>
                                {item.type !== 'delete' && (
                                    <button
                                        onClick={() => onDecisionChange(item.id, 'export')}
                                        className={`px-3 py-1.5 rounded text-xs font-bold transition-colors shadow-sm ${item.decision === 'export'
                                            ? (item.type === 'new' ? 'bg-indigo-600 text-white' : 'bg-blue-600 text-white')
                                            : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                                            }`}
                                    >
                                        {item.type === 'new' ? 'Push' : 'Overwrite'}
                                    </button>
                                )}

                                {item.type === 'delete' && (
                                    <button
                                        onClick={() => onDecisionChange(item.id, 'delete')}
                                        className={`px-3 py-1.5 rounded text-xs font-bold transition-colors flex items-center gap-1 shadow-sm ${item.decision === 'delete'
                                            ? 'bg-red-600 text-white'
                                            : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                                            }`}
                                    >
                                        <Trash2 size={12} /> Delete
                                    </button>
                                )}

                                <button
                                    onClick={() => onDecisionChange(item.id, 'skip')}
                                    title="Skip / Keep existing SD state"
                                    className={`p-1.5 rounded transition-colors ${item.decision === 'skip' ? 'bg-gray-600 text-white border border-gray-500 shadow-inner' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                                        }`}
                                >
                                    <X size={16} />
                                </button>
                            </>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
};
