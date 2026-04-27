import React, { useState } from 'react';
import { X, Play, Download, Loader, ChevronRight, Package, Check } from 'lucide-react';
import type { PresetManifestEntry } from '../data/samplePacks';

interface PresetsPanelProps {
    isOpen: boolean;
    onClose: () => void;
    presets: PresetManifestEntry[];
    onLoadPreset: (entry: PresetManifestEntry) => Promise<void>;
}

export const PresetsPanel: React.FC<PresetsPanelProps> = ({
    isOpen,
    onClose,
    presets,
    onLoadPreset,
}) => {
    const [loadingId, setLoadingId] = useState<string | null>(null);
    const [loadProgress, setLoadProgress] = useState<{ msg: string; pct: number } | null>(null);
    const [doneId, setDoneId] = useState<string | null>(null);
    const [errorId, setErrorId] = useState<{ id: string; msg: string } | null>(null);

    if (!isOpen) return null;

    const handleLoad = async (entry: PresetManifestEntry) => {
        if (loadingId) return; // prevent double-click
        setLoadingId(entry.id);
        setDoneId(null);
        setErrorId(null);
        setLoadProgress({ msg: 'Starting…', pct: 0 });

        try {
            await onLoadPreset(entry);
            setDoneId(entry.id);
            setTimeout(() => {
                setDoneId(null);
                onClose();
            }, 1200);
        } catch (e: any) {
            setErrorId({ id: entry.id, msg: e.message || 'Failed to load preset' });
        } finally {
            setLoadingId(null);
            setLoadProgress(null);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#0e0e0e] w-full max-w-5xl rounded-2xl border border-white/10 flex flex-col shadow-2xl overflow-hidden h-[90vh]">

                {/* Header */}
                <header className="flex items-center justify-between px-6 py-5 border-b border-white/10 bg-[#141414] shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-violet-500/20 rounded-xl">
                            <Package size={22} className="text-violet-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">Starter Presets</h2>
                            <p className="text-gray-400 text-sm mt-0.5">
                                Curated project presets using built-in sample packs · Samples load from cloud
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
                    >
                        <X size={22} />
                    </button>
                </header>

                {/* Info strip */}
                <div className="px-6 py-4 bg-violet-500/5 border-b border-violet-500/10 shrink-0">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="flex gap-3">
                            <Package size={16} className="shrink-0 text-violet-400 mt-0.5" />
                            <div>
                                <p className="text-[11px] font-bold text-violet-200 uppercase tracking-wider mb-0.5">Shared Samples</p>
                                <p className="text-[11px] text-violet-300/70 leading-normal">
                                    Uses built-in packs also available in the normal sample browser.
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-3 md:border-l md:border-white/5 md:pl-6">
                            <Download size={16} className="shrink-0 text-violet-400 mt-0.5" />
                            <div>
                                <p className="text-[11px] font-bold text-violet-200 uppercase tracking-wider mb-0.5">Cloud Fetch</p>
                                <p className="text-[11px] text-violet-300/70 leading-normal">
                                    Audio fetches from cloud on load and stores locally for full editing.
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-3 md:border-l md:border-white/5 md:pl-6">
                            <Play size={16} className="shrink-0 text-violet-400 mt-0.5" />
                            <div>
                                <p className="text-[11px] font-bold text-violet-200 uppercase tracking-wider mb-0.5">Create & Share</p>
                                <p className="text-[11px] text-violet-300/70 leading-normal">
                                    Save your own projects or share them through the Project Manager.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto p-6">
                    {presets.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full opacity-40 gap-4">
                            <Package size={48} className="text-gray-600" />
                            <p className="text-gray-400">No presets available yet — check back soon.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {presets.map(entry => {
                                const isLoading = loadingId === entry.id;
                                const isDone = doneId === entry.id;
                                const hasError = errorId?.id === entry.id;

                                return (
                                    <div
                                        key={entry.id}
                                        className={`
                                            rounded-xl border overflow-hidden flex flex-col transition-all duration-200
                                            ${isLoading ? 'border-violet-500/40 shadow-violet-500/10 shadow-lg' : 'border-white/8 hover:border-white/15'}
                                            bg-[#161616]
                                        `}
                                    >
                                        {/* Cover image */}
                                        {entry.coverImage ? (
                                            <div className="h-36 overflow-hidden bg-black/40 relative shrink-0">
                                                <img
                                                    src={entry.coverImage}
                                                    alt={entry.name}
                                                    crossOrigin="anonymous"
                                                    className="w-full h-full object-cover opacity-80"
                                                />
                                                <div className="absolute inset-0 bg-gradient-to-t from-[#161616] via-transparent to-transparent" />
                                            </div>
                                        ) : (
                                            <div className="h-36 bg-gradient-to-br from-violet-900/30 to-indigo-900/30 relative shrink-0 flex items-center justify-center">
                                                <Package size={40} className="text-violet-400/30" />
                                            </div>
                                        )}

                                        {/* Content */}
                                        <div className="flex flex-col flex-1 p-4 gap-3">
                                            <div>
                                                <h3 className="font-bold text-white text-base leading-tight">{entry.name}</h3>
                                                {entry.description && (
                                                    <p className="text-gray-400 text-xs mt-1 line-clamp-2 leading-relaxed">{entry.description}</p>
                                                )}
                                            </div>

                                            {/* Pack badges */}
                                            {entry.requiredPacks.length > 0 && (
                                                <div className="flex flex-wrap gap-1.5">
                                                    {entry.requiredPacks.map(packId => (
                                                        <span
                                                            key={packId}
                                                            className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-medium"
                                                        >
                                                            {packId}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Loading progress */}
                                            {isLoading && loadProgress && (
                                                <div className="space-y-1.5">
                                                    <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-violet-500 rounded-full transition-all duration-300"
                                                            style={{ width: `${loadProgress.pct}%` }}
                                                        />
                                                    </div>
                                                    <p className="text-[10px] text-violet-300 truncate">{loadProgress.msg}</p>
                                                </div>
                                            )}

                                            {/* Error */}
                                            {hasError && (
                                                <p className="text-[10px] text-red-400 bg-red-500/10 rounded px-2 py-1">
                                                    {errorId!.msg}
                                                </p>
                                            )}

                                            {/* Buttons */}
                                            <div className="flex gap-2 mt-auto pt-1">
                                                {/* Load into App */}
                                                <button
                                                    onClick={() => handleLoad(entry)}
                                                    disabled={!!loadingId}
                                                    className={`
                                                        flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold uppercase tracking-wide
                                                        transition-all duration-200
                                                        ${isDone
                                                            ? 'bg-green-600 text-white'
                                                            : isLoading
                                                                ? 'bg-violet-600/50 text-violet-300 cursor-wait'
                                                                : 'bg-violet-600 hover:bg-violet-500 text-white shadow-md shadow-violet-500/20'
                                                        }
                                                        disabled:opacity-60 disabled:cursor-not-allowed
                                                    `}
                                                >
                                                    {isDone ? (
                                                        <><Check size={12} /> Loaded!</>
                                                    ) : isLoading ? (
                                                        <><Loader size={12} className="animate-spin" /> Loading…</>
                                                    ) : (
                                                        <><Play size={12} fill="currentColor" /> Load into App</>
                                                    )}
                                                </button>

                                                {/* SD-ready download — only shown when sdExportUrl is present */}
                                                {entry.sdExportUrl && (
                                                    <a
                                                        href={entry.sdExportUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        download
                                                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white text-xs font-bold uppercase tracking-wide transition-all duration-200"
                                                        title="Download SD-Ready ZIP (manually built export)"
                                                    >
                                                        <Download size={12} />
                                                        <span className="hidden sm:inline">SD ZIP</span>
                                                    </a>
                                                )}
                                            </div>

                                            {/* Footer note */}
                                            <p className="text-[9px] text-gray-600 flex items-center gap-1 mt-0.5">
                                                <ChevronRight size={8} />
                                                Loads from cloud · No files stored in preset
                                                {entry.sdExportUrl && ' · SD ZIP is a direct copy-ready download'}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-3 border-t border-white/10 bg-[#141414] shrink-0 flex items-center justify-between">
                    <span className="text-xs text-gray-500">{presets.length} preset{presets.length !== 1 ? 's' : ''} available</span>
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};
