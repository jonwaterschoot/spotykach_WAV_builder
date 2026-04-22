import { useEffect, useRef, useState } from 'react';
import { X, Play, Pause, Download, FolderOpen, Loader, Check, User, Briefcase, Edit2 } from 'lucide-react';
import { SAMPLE_PACKS } from '../data/samplePacks';
import { resolveAssetPath } from '../utils/assetUtils';
import type { UserLibrary, ProjectSummary, FileRecord } from '../types';
import { loadProjectFromDirectory } from '../utils/exportUtils';

interface SamplePackModalProps {
    isOpen: boolean;
    onClose: () => void;
    onImport: (url: string, name: string, origin?: string, license?: string) => Promise<void>;
    userLibrary: UserLibrary;
    projects: ProjectSummary[];
    onOpenLibraryManager: () => void;
    currentProjectName?: string;
    workHandle: FileSystemDirectoryHandle | null;
}

export const SamplePackModal = ({ isOpen, onClose, onImport, userLibrary, projects, onOpenLibraryManager, currentProjectName, workHandle }: SamplePackModalProps) => {
    const [selectedPackId, setSelectedPackId] = useState<string>(SAMPLE_PACKS[0]?.id || '');
    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
    const [projectFilesCache, setProjectFilesCache] = useState<Record<string, FileRecord[]>>({});
    const [projectLoadError, setProjectLoadError] = useState<string | null>(null);
    const [loadingProjectId, setLoadingProjectId] = useState<string | null>(null);
    const [playingSample, setPlayingSample] = useState<string | null>(null);
    const [playingSampleName, setPlayingSampleName] = useState<string>('');
    const [isPreviewPlaying, setIsPreviewPlaying] = useState<boolean>(false);
    const [playbackTime, setPlaybackTime] = useState(0);
    const [playbackDuration, setPlaybackDuration] = useState(0);
    const [userLibraryTagFilter, setUserLibraryTagFilter] = useState('');
    const [selectedUserLibraryTags, setSelectedUserLibraryTags] = useState<string[]>([]);
    const [importingSample, setImportingSample] = useState<string | null>(null);
    const [addedSamples, setAddedSamples] = useState<Set<string>>(new Set());
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const previewUrlRef = useRef<string | null>(null);

    const isUserLibrarySelected = selectedPackId === 'my-library';
    const isProjectSamplesSelected = selectedPackId === 'project-samples';

    useEffect(() => {
        if (!isProjectSamplesSelected || !selectedProjectId) return;
        if (projectFilesCache[selectedProjectId]) return;
        if (!workHandle) {
            setProjectLoadError("Work folder is not connected.");
            return;
        }

        let cancelled = false;
        setLoadingProjectId(selectedProjectId);
        setProjectLoadError(null);

        loadProjectFromDirectory(selectedProjectId, workHandle)
            .then((state) => {
                if (cancelled) return;
                const missingAssets = state.loadIssues?.missingAssets || [];
                if (missingAssets.length > 0) {
                    const affected = Array.from(new Set(missingAssets.map(m => m.fileId)));
                    setProjectLoadError(`Warning: ${missingAssets.length} missing asset file(s). ${affected.length} sample record(s) may be unavailable.`);
                }

                // Cache only files with an available current blob for preview/import safety.
                const available = Object.values(state.files || {}).filter(f => {
                    const current = f.versions.find(v => v.id === f.currentVersionId) || f.versions[0];
                    return !!current?.blob;
                });

                setProjectFilesCache(prev => ({ ...prev, [selectedProjectId]: available }));
            })
            .catch((err) => {
                if (cancelled) return;
                console.error("Failed to load selected project samples", err);
                setProjectLoadError(`Could not load samples for "${selectedProjectId}".`);
            })
            .finally(() => {
                if (!cancelled) setLoadingProjectId(null);
            });

        return () => {
            cancelled = true;
        };
    }, [isProjectSamplesSelected, selectedProjectId, projectFilesCache, workHandle]);

    useEffect(() => {
        return () => {
            if (previewUrlRef.current) {
                URL.revokeObjectURL(previewUrlRef.current);
                previewUrlRef.current = null;
            }
        };
    }, []);

    let selectedPack: any = SAMPLE_PACKS.find(p => p.id === selectedPackId);

    // Virtual pack for User Library
    if (isUserLibrarySelected) {
        selectedPack = {
            id: 'my-library',
            name: 'Main User Library',
            description: 'Your curated list of samples and uploaded sounds.',
            license: userLibrary.metadata.license,
            samples: Object.values(userLibrary.files).map(f => ({
                name: f.name,
                path: f.id, // Using ID for virtual samples
                category: f.origin || 'User Library',
                tags: f.tags || [],
                _isVirtual: true,
                _blob: f.versions.find(v => v.id === f.currentVersionId)?.blob
            }))
        };
    }

    // Virtual pack for Project Samples
    if (isProjectSamplesSelected && selectedProjectId) {
        const project = projects.find(p => p.name === selectedProjectId);
        const cachedFiles = projectFilesCache[selectedProjectId];
        if (project && cachedFiles) {
            selectedPack = {
                id: 'project-samples',
                name: `Project: ${project.name}`,
                description: `Samples from project ${project.name} (Assigned & Parked)`,
                samples: cachedFiles.map(f => ({
                    name: f.name,
                    path: f.id,
                    category: f.isParked ? 'Unassigned' : 'Assigned',
                    _isVirtual: true,
                    _blob: f.versions.find(v => v.id === f.currentVersionId)?.blob
                }))
            };
        }
    }

    const availableUserLibraryTags = isUserLibrarySelected
        ? Array.from(new Set(Object.values(userLibrary.files).flatMap(f => f.tags || []))).sort((a, b) => a.localeCompare(b))
        : [];

    const normalizedTagFilters = userLibraryTagFilter
        .split(/[,\s]+/)
        .map(t => t.trim().toLowerCase())
        .filter(Boolean);

    const filteredSamples = selectedPack
        ? (selectedPack.samples as any[]).filter(sample => {
            if (!isUserLibrarySelected) return true;
            const tags = (sample.tags || []).map((t: string) => t.toLowerCase());
            const name = (sample.name || '').toLowerCase();
            const typedMatches = normalizedTagFilters.every(term =>
                tags.some((tag: string) => tag.includes(term)) || name.includes(term)
            );
            const pillMatches = selectedUserLibraryTags.every(tag =>
                tags.includes(tag.toLowerCase())
            );
            return typedMatches && pillMatches;
        })
        : [];

    const categorizedSamples = selectedPack
        ? (Object.entries(
            (filteredSamples).reduce((acc, sample) => {
                const category = sample.category || 'Uncategorized';
                if (!acc[category]) acc[category] = [];
                acc[category].push(sample);
                return acc;
            }, {} as Record<string, any[]>)
        ) as [string, any[]][])
        : [];

    if (!isOpen) return null;

    const handlePlay = (sample: any) => {
        if (playingSample === sample.path && audioRef.current && !audioRef.current.paused) {
            // Stop
            audioRef.current?.pause();
        } else if (playingSample === sample.path && audioRef.current && audioRef.current.paused) {
            // Resume
            audioRef.current.play().catch(e => console.error("Preview resume failed", e));
        } else {
            // Play new
            if (audioRef.current) {
                audioRef.current.pause();
                if (previewUrlRef.current) {
                    URL.revokeObjectURL(previewUrlRef.current);
                    previewUrlRef.current = null;
                }
                if (sample._isVirtual && sample._blob) {
                    const blobUrl = URL.createObjectURL(sample._blob);
                    previewUrlRef.current = blobUrl;
                    audioRef.current.src = blobUrl;
                    audioRef.current.crossOrigin = null; // No CORS needed for blobs
                } else {
                    audioRef.current.crossOrigin = 'anonymous'; // Trigger CORS for R2
                    audioRef.current.src = resolveAssetPath(sample.path);
                }
                setPlaybackTime(0);
                audioRef.current.play().catch(e => console.error("Preview failed", e));
                setPlayingSample(sample.path);
                setPlayingSampleName(sample.name || sample.path);
            }
        }
    };

    const handleImport = async (sample: any) => {
        setImportingSample(sample.path);
        try {
            let url = resolveAssetPath(sample.path);
            if (sample._isVirtual && sample._blob) {
                url = URL.createObjectURL(sample._blob);
            }

            await onImport(
                url,
                sample.name,
                selectedPack?.name, // Use Pack Name as Origin
                selectedPack?.license // Pass License text
            );
            setAddedSamples(prev => new Set(prev).add(sample.path));
        } catch (error) {
            console.error("Import failed", error);
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
                        <FolderOpen className="text-synthux-orange" /> Sample Browser
                    </h2>
                    <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 flex overflow-hidden">
                    {/* Sidebar: Packs List */}
                    <div className="w-64 bg-synthux-browsebg border-r border-gray-800 flex flex-col overflow-hidden">
                        <div className="flex-1 p-4 flex flex-col gap-2 overflow-y-auto">
                            <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">Available Packs</h3>
                            {SAMPLE_PACKS.map((pack: any) => (
                                <button
                                    key={pack.id}
                                    onClick={() => { setSelectedPackId(pack.id); setSelectedProjectId(null); }}
                                    className={`text-left px-3 py-2 rounded text-sm font-medium transition-colors ${selectedPackId === pack.id
                                        ? 'bg-synthux-orange/20 text-synthux-orange border border-synthux-orange/50'
                                        : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                                        }`}
                                >
                                    {pack.name}
                                </button>
                            ))}

                            <div className="mt-4 space-y-2">
                                <h3 className="text-xs font-bold text-gray-500 uppercase flex items-center justify-between">
                                    My Library
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onOpenLibraryManager(); }}
                                        className="p-1 hover:bg-gray-700 rounded text-synthux-orange"
                                        title="Open Library Manager"
                                    >
                                        <Edit2 size={12} />
                                    </button>
                                </h3>

                                <button
                                    onClick={() => { setSelectedPackId('project-samples'); }}
                                    className={`w-full text-left px-3 py-2 rounded text-sm font-medium transition-colors flex items-center gap-2 ${selectedPackId === 'project-samples'
                                        ? 'bg-synthux-orange/20 text-synthux-orange border border-synthux-orange/50'
                                        : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                                        }`}
                                >
                                    <Briefcase size={14} /> Projects Samples
                                </button>

                                {isProjectSamplesSelected && (
                                    <div className="pl-6 space-y-1">
                                        {projects.filter(p => (p as any).hasMeta && ((p as any).local || !(p as any).backup)).map(proj => (
                                            <button
                                                key={proj.name}
                                                onClick={() => {
                                                    setSelectedProjectId(proj.name);
                                                    setProjectLoadError(null);
                                                }}
                                                className={`w-full text-left px-2 py-1.5 rounded text-[11px] font-mono transition-colors truncate ${selectedProjectId === proj.name
                                                    ? 'text-white bg-white/5'
                                                    : 'text-gray-500 hover:text-gray-300'
                                                    }`}
                                            >
                                                {proj.name} {proj.name === currentProjectName && '(Current)'}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                <button
                                    onClick={() => { setSelectedPackId('my-library'); setSelectedProjectId(null); }}
                                    className={`w-full text-left px-3 py-2 rounded text-sm font-medium transition-colors flex items-center gap-2 ${selectedPackId === 'my-library'
                                        ? 'bg-synthux-orange/20 text-synthux-orange border border-synthux-orange/50'
                                        : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                                        }`}
                                >
                                    <User size={14} /> Main User Library
                                </button>

                                {isUserLibrarySelected && (
                                    <div className="mt-2">
                                        <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">Filter by tags</label>
                                        <input
                                            value={userLibraryTagFilter}
                                            onChange={(e) => setUserLibraryTagFilter(e.target.value)}
                                            placeholder="Type tags (partial match)"
                                            className="w-full bg-black/40 border border-gray-700 rounded px-2 py-1.5 text-[11px] text-gray-200"
                                        />
                                        {availableUserLibraryTags.length > 0 && (
                                            <div className="mt-2 flex flex-wrap gap-1.5">
                                                {availableUserLibraryTags.map(tag => {
                                                    const selected = selectedUserLibraryTags.includes(tag);
                                                    return (
                                                        <button
                                                            key={tag}
                                                            onClick={() => {
                                                                setSelectedUserLibraryTags(prev =>
                                                                    prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
                                                                );
                                                            }}
                                                            className={`px-2 py-1 rounded-full text-[10px] border transition-colors ${selected
                                                                ? 'bg-synthux-orange/20 border-synthux-orange/50 text-synthux-orange'
                                                                : 'bg-black/40 border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-500'
                                                                }`}
                                                        >
                                                            {tag}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Main: Sample List */}
                    <div className="flex-1 bg-synthux-main flex flex-col overflow-hidden">
                        <div className="flex-1 p-6 overflow-y-auto">
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
                                                {selectedPack.links.map((link: any, i: number) => (
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
                                        {categorizedSamples.map(([category, samples]) => (
                                            <div key={category}>
                                                <h3 className="sticky top-0 z-10 bg-synthux-main text-xs font-bold text-synthux-orange uppercase py-2 px-4 mb-1 border-b border-gray-800">
                                                    {category}
                                                </h3>
                                                <div className="space-y-1">
                                                    {samples.map((sample: any, idx: number) => {
                                                        const isPlaying = playingSample === sample.path;
                                                        const isImporting = importingSample === sample.path;
                                                        const isAdded = addedSamples.has(sample.path);

                                                        return (
                                                            <div key={idx} className="grid grid-cols-[40px_1fr_100px] gap-4 items-center px-4 py-3 hover:bg-gray-800/50 rounded border border-transparent hover:border-gray-800 transition-colors group">
                                                                {/* Play Button */}
                                                                <button
                                                                    onClick={() => handlePlay(sample)}
                                                                    className={`w-8 h-8 flex items-center justify-center rounded-full transition-all ${isPlaying && isPreviewPlaying ? 'text-synthux-orange bg-synthux-orange/10' : 'text-gray-500 hover:text-white bg-gray-800 hover:bg-gray-700'
                                                                        }`}
                                                                >
                                                                    {isPlaying && isPreviewPlaying ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
                                                                </button>

                                                                {/* Name */}
                                                                <div className="font-mono text-sm text-gray-300 group-hover:text-white truncate">
                                                                    <div className="truncate">{sample.name}</div>
                                                                    {sample.tags && sample.tags.length > 0 && (
                                                                        <div className="mt-1 text-[10px] text-gray-500 truncate">
                                                                            #{sample.tags.join(' #')}
                                                                        </div>
                                                                    )}
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
                                <div className="flex items-center justify-center h-full text-gray-500 font-mono text-sm">
                                    {isProjectSamplesSelected && !selectedProjectId
                                        ? 'Select a project from the sidebar to browse its samples'
                                        : isProjectSamplesSelected && loadingProjectId
                                            ? `Loading project samples for ${loadingProjectId}...`
                                            : isProjectSamplesSelected && projectLoadError
                                                ? projectLoadError
                                                : 'Select a pack to browse samples'}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Hidden Audio Element for Preview */}
                <div className="border-t border-gray-800 bg-black/30 px-4 py-3">
                    <div className="flex items-center gap-3 text-xs text-gray-300">
                        <button
                            onClick={() => {
                                if (audioRef.current) {
                                    if (isPreviewPlaying) audioRef.current.pause();
                                    else audioRef.current.play().catch(e => console.error(e));
                                }
                            }}
                            disabled={!playingSample}
                            className={`flex flex-shrink-0 items-center justify-center w-8 h-8 rounded-full transition-colors ${playingSample && isPreviewPlaying ? 'bg-synthux-orange/20 text-synthux-orange' : playingSample ? 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white' : 'bg-gray-900 text-gray-700 cursor-not-allowed'}`}
                        >
                            {isPreviewPlaying ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
                        </button>
                        <div className="min-w-0 flex-1 truncate font-mono">
                            {playingSample ? `Preview: ${playingSampleName}` : 'No sample selected'}
                        </div>
                        <div className="font-mono text-[10px] text-gray-500">
                            {Math.floor(playbackTime)}s / {Math.floor(playbackDuration)}s
                        </div>
                    </div>
                    <input
                        type="range"
                        min={0}
                        max={playbackDuration || 0}
                        value={playbackTime}
                        disabled={!playingSample || playbackDuration <= 0}
                        onChange={(e) => {
                            const t = Number(e.target.value);
                            if (!audioRef.current) return;
                            audioRef.current.currentTime = t;
                            setPlaybackTime(t);
                        }}
                        className="w-full mt-2 accent-synthux-orange disabled:opacity-40"
                    />
                </div>

                <audio
                    ref={audioRef}
                    onLoadedMetadata={() => {
                        if (!audioRef.current) return;
                        setPlaybackDuration(audioRef.current.duration || 0);
                    }}
                    onTimeUpdate={() => {
                        if (!audioRef.current) return;
                        setPlaybackTime(audioRef.current.currentTime || 0);
                    }}
                    onPlay={() => setIsPreviewPlaying(true)}
                    onPause={() => setIsPreviewPlaying(false)}
                    onEnded={() => setIsPreviewPlaying(false)}
                />
            </div>
        </div>
    );
};
