import { useEffect, useRef, useState, useMemo } from 'react';
import { X, Play, Pause, Download, FolderOpen, Loader, Check, User, Briefcase, Plus, RefreshCw, Trash2, Edit2, Settings, Crosshair, ChevronDown, Layers } from 'lucide-react';
import { SAMPLE_PACKS, fetchSampleManifest } from '../data/samplePacks';
import type { SamplePack } from '../data/samplePacks';
import { resolveAssetPath } from '../utils/assetUtils';
import type { UserLibrary, ProjectSummary, FileRecord, TapeColor } from '../types';
import { TAPE_COLORS, COLOR_MAP } from '../types';
// dynamic utility imports
import { LocalFolderBrowser } from './LocalFolderBrowser';

interface SampleBrowserProps {
    isOpen: boolean;
    onClose: () => void;
    onImport: (url: string, name: string, origin?: string, license?: string) => Promise<void>;
    userLibrary: UserLibrary;
    projects: ProjectSummary[];
    onOpenLibraryManager: (tab?: 'upload' | 'project' | 'manage' | 'settings', highlightFileId?: string) => void;
    currentProjectName?: string;
    currentFiles?: Record<string, FileRecord>;
    workHandle: FileSystemDirectoryHandle | null;
    mode?: 'global' | 'slot-selection'; // Context for future extensions
    onImportToPool?: (files: { file: File, path: string }[]) => Promise<void>;
    onImportToTape?: (files: { file: File, path: string }[], targetTape: TapeColor) => Promise<void>;
    onRemoteBulkImport?: (samples: { url: string, name: string }[], target: 'pool' | 'slots' | import('../types').TapeColor, origin?: string, license?: string) => Promise<void>;
    forceStop?: boolean;
}

// OS Folder Handle Type
interface CustomFolder {
    id: string;
    name: string;
    handle: FileSystemDirectoryHandle;
}

export const SampleBrowser = ({
    isOpen,
    onClose,
    onImport,
    userLibrary,
    projects,
    onOpenLibraryManager,
    currentProjectName,
    currentFiles,
    workHandle,
    mode = 'global',
    onImportToPool,
    onImportToTape,
    onRemoteBulkImport,
    forceStop
}: SampleBrowserProps) => {

    // Core Selection State
    const [selectedPackId, setSelectedPackId] = useState<string>(SAMPLE_PACKS[0]?.id || 'my-library');
    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
    const [selectedCustomFolderId, setSelectedCustomFolderId] = useState<string | null>(null);
    const [remotePacks, setRemotePacks] = useState<SamplePack[]>([]);
    const [isManifestLoading, setIsManifestLoading] = useState(true);

    const resetSelection = () => {
        setSelectedSamplePaths(new Set());
        setLastSelectedPath(null);
        setShowActionMenu(false);
    };

    // Selection logic
    const toggleSampleSelection = (path: string, allSamplesInList: any[], event?: React.MouseEvent) => {
        const newSelection = new Set(selectedSamplePaths);

        if (event?.shiftKey && lastSelectedPath) {
            const currentIndex = allSamplesInList.findIndex(s => s.path === path);
            const lastIndex = allSamplesInList.findIndex(s => s.path === lastSelectedPath);

            if (currentIndex !== -1 && lastIndex !== -1) {
                const start = Math.min(currentIndex, lastIndex);
                const end = Math.max(currentIndex, lastIndex);

                for (let i = start; i <= end; i++) {
                    newSelection.add(allSamplesInList[i].path);
                }
            }
        } else {
            if (newSelection.has(path)) {
                newSelection.delete(path);
            } else {
                newSelection.add(path);
            }
        }

        setSelectedSamplePaths(newSelection);
        setLastSelectedPath(path);
    };

    const selectAllInCategory = (samples: any[], select: boolean) => {
        const newSelection = new Set(selectedSamplePaths);
        samples.forEach(s => {
            if (select) newSelection.add(s.path);
            else newSelection.delete(s.path);
        });
        setSelectedSamplePaths(newSelection);
    };

    // Data Caches
    const [projectFilesCache, setProjectFilesCache] = useState<Record<string, FileRecord[]>>({});
    const [customFolders, setCustomFolders] = useState<CustomFolder[]>([]);
    const [customFolderCache, setCustomFolderCache] = useState<Record<string, any[]>>({}); // Temporary OS File tracking

    // Loading / Status States
    const [projectLoadError, setProjectLoadError] = useState<string | null>(null);
    const [loadingProjectId, setLoadingProjectId] = useState<string | null>(null);
    const [isLoadingFolder, setIsLoadingFolder] = useState<string | null>(null);

    // Playback State
    const [playingSample, setPlayingSample] = useState<string | null>(null);
    const [playingSampleName, setPlayingSampleName] = useState<string>('');
    const [isPreviewPlaying, setIsPreviewPlaying] = useState<boolean>(false);
    const [playbackTime, setPlaybackTime] = useState(0);
    const [playbackDuration, setPlaybackDuration] = useState(0);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const previewUrlRef = useRef<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Tag & Filtering State
    const [userLibraryTagFilter, setUserLibraryTagFilter] = useState('');
    const [selectedUserLibraryTags, setSelectedUserLibraryTags] = useState<string[]>([]);
    const [importingSample, setImportingSample] = useState<string | null>(null);
    const [addedSamples, setAddedSamples] = useState<Set<string>>(new Set());
    const [locateTarget, setLocateTarget] = useState<string | null>(null);

    // Multi-select state
    const [selectedSamplePaths, setSelectedSamplePaths] = useState<Set<string>>(new Set());
    const [lastSelectedPath, setLastSelectedPath] = useState<string | null>(null);
    const [showActionMenu, setShowActionMenu] = useState(false);

    // Track added samples globally based on the project's current files
    const allAddedPaths = useMemo(() => {
        const paths = new Set<string>(addedSamples);
        const addedNames = new Set<string>();
        
        if (currentFiles) {
            Object.values(currentFiles).forEach(file => {
                if (file.sourceSamplePath) {
                    paths.add(file.sourceSamplePath);
                } else if (file.origin && file.origin !== 'SD Card' && file.origin !== 'User Library') {
                    if (file.originalName) addedNames.add(file.originalName);
                }
            });
        }
        return { paths, addedNames };
    }, [currentFiles, addedSamples]);

    const isUserLibrarySelected = selectedPackId === 'my-library';
    const isProjectSamplesSelected = selectedPackId === 'project-samples';
    const isCustomFolderSelected = selectedPackId === 'custom-folder';

    // --------------------------------------------------------------------------------
    // 1. Initial Data Loading (Custom Folders from DB)
    // --------------------------------------------------------------------------------
    useEffect(() => {
        if (!isOpen) return;
        const loadFolders = async () => {
            try {
                // Fetch remote manifest packs
                const { packs } = await fetchSampleManifest();
                setRemotePacks(packs);
                setIsManifestLoading(false);

                // If no pack is selected yet and we have remote packs, select the first one
                if (selectedPackId === 'my-library' && packs.length > 0) {
                    setSelectedPackId(packs[0].id);
                }

                const { loadCustomFoldersFromDB } = await import('../utils/persistence');
                const folders: any[] = await loadCustomFoldersFromDB();
                if (folders && Array.isArray(folders)) {
                    // Verify handles
                    const validFolders = [];
                    for (const folder of folders) {
                        try {
                            if (await (folder.handle as any).queryPermission({ mode: 'read' }) === 'granted') {
                                validFolders.push(folder);
                            } else if (await (folder.handle as any).requestPermission({ mode: 'read' }) === 'granted') {
                                validFolders.push(folder);
                            }
                        } catch (e) {
                            console.warn(`Skipping unresponsive folder handle ${folder.name}`, e);
                        }
                    }
                    setCustomFolders(validFolders);
                }
                if (selectedPackId === 'my-library' && packs.length > 0) {
                    setSelectedPackId(packs[0].id);
                }
            } catch (e) {
                console.error("Manifest load failed", e);
            }
        };
        loadFolders();
    }, [isOpen]);

    useEffect(() => {
        resetSelection();
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
    }, [selectedPackId, selectedProjectId, selectedCustomFolderId]);

    const handleBulkActionWithTarget = async (target: 'pool' | 'slots' | TapeColor) => {
        setShowActionMenu(false);
        if (selectedSamplePaths.size === 0) return;

        const allPacks = [...SAMPLE_PACKS, ...remotePacks];
        const pack = allPacks.find(p => p.id === selectedPackId);
        
        if (pack && onRemoteBulkImport) {
            const allSamples = pack.samples || [];
            const samplesToImport = Array.from(selectedSamplePaths).map(path => {
                const s = allSamples.find(sample => sample.path === path);
                if (s) {
                    let url = resolveAssetPath(s.path);
                    if ((s as any)._isVirtual && (s as any)._blob) {
                        url = URL.createObjectURL((s as any)._blob);
                    }
                    return { url, name: s.name };
                }
                return null;
            }).filter((s): s is { url: string, name: string } => s !== null);

            if (samplesToImport.length > 0) {
                await onRemoteBulkImport(samplesToImport, target, pack.id, pack.license);
                setSelectedSamplePaths(new Set());
            }
        } else if (isUserLibrarySelected || isProjectSamplesSelected) {
            // Local project files bulk assignment
            // This is a future enhancement, but we could call onBulkAssign here if needed
            console.info("Bulk actions for local library coming soon!");
        }
    };


    // --------------------------------------------------------------------------------
    // 2. Add / Remove Custom Folders
    // --------------------------------------------------------------------------------
    const handleAddCustomFolder = async () => {
        try {
            const handle = await window.showDirectoryPicker({ mode: 'read' });
            if (!handle) return;

            const newFolder = { id: crypto.randomUUID(), name: handle.name, handle };
            const updated = [...customFolders, newFolder];
            setCustomFolders(updated);

            // Save to DB
            const { saveCustomFoldersToDB } = await import('../utils/persistence');
            await saveCustomFoldersToDB(updated);

            setSelectedPackId('custom-folder');
            setSelectedCustomFolderId(newFolder.id);

        } catch (error: any) {
            if (error.name !== 'AbortError') console.error("Could not picker directory", error);
        }
    };

    const handleRemoveCustomFolder = (e: React.MouseEvent, folderId: string) => {
        e.stopPropagation();
        const updated = customFolders.filter(f => f.id !== folderId);
        setCustomFolders(updated);

        import('../utils/persistence').then(({ saveCustomFoldersToDB }) => {
            saveCustomFoldersToDB(updated);
        });

        if (selectedCustomFolderId === folderId) {
            setSelectedPackId('my-library');
            setSelectedCustomFolderId(null);
        }
    };

    const refreshCustomFolder = async (folder: CustomFolder) => {
        setIsLoadingFolder(folder.id);
        const files: any[] = [];
        try {
            if (await (folder.handle as any).queryPermission({ mode: 'read' }) !== 'granted') {
                await (folder.handle as any).requestPermission({ mode: 'read' });
            }

            for await (const entry of (folder.handle as any).values()) {
                if (entry.name.startsWith('._')) continue;
                if (entry.name === '__MACOSX') continue; // macOS metadata directory
                if (entry.kind === 'file' && (entry.name.endsWith('.wav') || entry.name.endsWith('.mp3') || entry.name.endsWith('.flac') || entry.name.endsWith('.ogg'))) {
                    const fileHandle = entry as FileSystemFileHandle;
                    const file = await fileHandle.getFile();
                    files.push({
                        name: file.name,
                        path: `${folder.id}/${file.name}`,
                        category: folder.name,
                        tags: [],
                        _isVirtual: true,
                        _blob: file
                    });
                }
            }
            setCustomFolderCache(prev => ({ ...prev, [folder.id]: files }));
        } catch (e) {
            console.error(`Failed to refresh OS Folder: ${folder.name}`, e);
        } finally {
            setIsLoadingFolder(null);
        }
    };


    // Load selected custom folder contents if missing
    useEffect(() => {
        if (isCustomFolderSelected && selectedCustomFolderId && !customFolderCache[selectedCustomFolderId]) {
            const folder = customFolders.find(f => f.id === selectedCustomFolderId);
            if (folder) refreshCustomFolder(folder);
        }
    }, [isCustomFolderSelected, selectedCustomFolderId, customFolders, customFolderCache]);


    // --------------------------------------------------------------------------------
    // 3. Project File Loading
    // --------------------------------------------------------------------------------
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

        import('../utils/exportUtils').then(({ loadProjectFromDirectory }) => {
            loadProjectFromDirectory(selectedProjectId, workHandle)
            .then((state) => {
                if (cancelled) return;
                const missingAssets = state.loadIssues?.missingAssets || [];
                if (missingAssets.length > 0) {
                    const affected = Array.from(new Set(missingAssets.map(m => m.fileId)));
                    setProjectLoadError(`Warning: ${missingAssets.length} missing asset file(s). ${affected.length} sample record(s) may be unavailable.`);
                }

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
        });

        return () => { cancelled = true; };
    }, [isProjectSamplesSelected, selectedProjectId, projectFilesCache, workHandle]);


    // --------------------------------------------------------------------------------
    // 4. Memory Cleanup
    // --------------------------------------------------------------------------------
    useEffect(() => {
        return () => {
            if (previewUrlRef.current) {
                URL.revokeObjectURL(previewUrlRef.current);
                previewUrlRef.current = null;
            }
        };
    }, []);

    // --------------------------------------------------------------------------------
    // 4b. External Stop Signal
    // --------------------------------------------------------------------------------
    useEffect(() => {
        if (forceStop && audioRef.current && !audioRef.current.paused) {
            audioRef.current.pause();
            setIsPreviewPlaying(false);
            setPlayingSample(null);
            setPlayingSampleName('');
        }
    }, [forceStop]);


    // --------------------------------------------------------------------------------
    // 5. Build Final Active Selection 
    // --------------------------------------------------------------------------------
    const allPacks = [...SAMPLE_PACKS, ...remotePacks];
    let selectedPack: any = allPacks.find(p => p.id === selectedPackId);

    if (isUserLibrarySelected) {
        selectedPack = {
            id: 'my-library',
            name: 'Curated Library',
            description: 'Your curated list of samples and uploaded sounds.',
            license: userLibrary.metadata.license,
            samples: Object.values(userLibrary.files).map(f => ({
                name: f.name,
                path: f.id,
                category: f.origin || 'Curated Library',
                tags: f.tags || [],
                _isVirtual: true,
                _blob: f.versions.find(v => v.id === f.currentVersionId)?.blob
            }))
        };
    } else if (isProjectSamplesSelected && selectedProjectId) {
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
    } else if (isCustomFolderSelected && selectedCustomFolderId) {
        const folder = customFolders.find(f => f.id === selectedCustomFolderId);
        const cachedFiles = customFolderCache[selectedCustomFolderId] || [];
        if (folder) {
            selectedPack = {
                id: folder.id,
                name: `Local Folder: ${folder.name}`,
                description: `WAV/MP3/FLAC/OGG files stored locally at ${folder.name}`,
                samples: cachedFiles
            }
        }
    }


    // --------------------------------------------------------------------------------
    // 6. Filtering Logic
    // --------------------------------------------------------------------------------
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


    // --------------------------------------------------------------------------------
    // 7. Event Handlers
    // --------------------------------------------------------------------------------
    // 7. Event Handlers
    const handlePlay = (sample: any) => {
        if (playingSample === sample.path && audioRef.current && !audioRef.current.paused) {
            audioRef.current?.pause();
        } else if (playingSample === sample.path && audioRef.current && audioRef.current.paused) {
            audioRef.current.play().catch(e => console.error("Preview resume failed", e));
        } else {
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
                } else {
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
                selectedPack?.name || 'Local Folder',
                selectedPack?.license
            );
            setAddedSamples(prev => new Set(prev).add(sample.path));
        } catch (error) {
            console.error("Import failed", error);
        } finally {
            setImportingSample(null);
        }
    };

    const handleBulkImport = async (files: { file: File, path: string }[]) => {
        for (const { file, path } of files) {
            const sample = {
                path: path,
                name: file.name,
                _isVirtual: true,
                _blob: file
            };
            await handleImport(sample);
        }
    };

    // --------------------------------------------------------------------------------
    // 8. Render UI
    // --------------------------------------------------------------------------------
    return (
        <div className="bg-synthux-panel border border-gray-700 rounded-lg shadow-2xl w-full h-full flex flex-col overflow-hidden">

            {/* Header */}
            <div className="sample-browser-drag-handle flex items-center justify-between p-4 border-b border-gray-800 bg-synthux-panel shadow-md z-10 cursor-move">
                <h2 className="text-xl font-bold flex items-center gap-2 text-white">
                    <FolderOpen className="text-synthux-orange" /> Sample Browser
                </h2>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => onOpenLibraryManager('settings')}
                        className="p-1.5 hover:bg-white/10 rounded-md text-gray-500 hover:text-synthux-orange transition-all"
                        title="Browser Settings"
                    >
                        <Settings size={20} />
                    </button>
                    <button onClick={onClose} className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Sidebar: Tree View */}
                <div className="w-72 bg-synthux-browsebg border-r border-gray-800 flex flex-col overflow-hidden">
                    <div className="flex-1 p-4 flex flex-col gap-1 overflow-y-auto">

                        {/* MY LIBRARY */}
                        <div className="mb-4">
                            <h3 className="text-[10px] font-bold text-gray-500 uppercase flex items-center justify-between px-1 mb-2">
                                Curated Library
                                <button
                                    onClick={(e) => { e.stopPropagation(); onOpenLibraryManager(); }}
                                    className="p-1 hover:bg-gray-700 rounded text-synthux-orange"
                                    title="Open Library Manager"
                                >
                                    <Edit2 size={12} />
                                </button>
                            </h3>
                            <button
                                onClick={() => { setSelectedPackId('my-library'); setSelectedProjectId(null); setSelectedCustomFolderId(null); }}
                                className={`w-full text-left px-3 py-2 rounded text-sm font-medium transition-colors flex items-center gap-2 ${selectedPackId === 'my-library'
                                    ? 'bg-synthux-orange/20 text-synthux-orange border border-synthux-orange/50'
                                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                                    }`}
                            >
                                <User size={14} /> Curated Library
                            </button>
                            {isUserLibrarySelected && (
                                <div className="mt-2 ml-2 pl-2 border-l border-gray-800">
                                    <input
                                        value={userLibraryTagFilter}
                                        onChange={(e) => setUserLibraryTagFilter(e.target.value)}
                                        placeholder="Filter by tags..."
                                        className="w-full bg-black/40 border border-gray-700 rounded px-2 py-1.5 text-[11px] text-gray-200"
                                    />
                                    {availableUserLibraryTags.length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                            {availableUserLibraryTags.slice(0, 10).map(tag => {
                                                const selected = selectedUserLibraryTags.includes(tag);
                                                return (
                                                    <button
                                                        key={tag}
                                                        onClick={() => setSelectedUserLibraryTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])}
                                                        className={`px-2 py-1 rounded-full text-[9px] border transition-colors ${selected
                                                            ? 'bg-synthux-orange/20 border-synthux-orange/50 text-synthux-orange'
                                                            : 'bg-black/40 border-gray-700 text-gray-500 hover:text-gray-300'
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

                        {/* PROJECT SAMPLES */}
                        <div className="mb-4">
                            <h3 className="text-[10px] font-bold text-gray-500 uppercase px-1 mb-2">Projects</h3>
                            <button
                                onClick={() => { setSelectedPackId('project-samples'); setSelectedCustomFolderId(null); }}
                                className={`w-full text-left px-3 py-2 rounded text-sm font-medium transition-colors flex items-center gap-2 ${selectedPackId === 'project-samples'
                                    ? 'bg-synthux-orange/20 text-synthux-orange border border-synthux-orange/50'
                                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                                    }`}
                            >
                                <Briefcase size={14} /> Workspace Projects
                            </button>

                            {isProjectSamplesSelected && (
                                <div className="mt-1 ml-2 pl-2 border-l border-gray-800 space-y-1 py-1">
                                    {projects.filter(p => (p as any).hasMeta && ((p as any).local || !(p as any).backup)).map(proj => (
                                        <button
                                            key={proj.name}
                                            onClick={() => {
                                                setSelectedProjectId(proj.name);
                                                setProjectLoadError(null);
                                            }}
                                            className={`w-full text-left px-2 py-1.5 rounded text-[11px] font-mono transition-colors truncate ${selectedProjectId === proj.name
                                                ? 'text-white bg-white/5 border border-white/10'
                                                : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'
                                                }`}
                                        >
                                            {proj.name} {proj.name === currentProjectName && <span className="text-synthux-orange ml-1 text-[9px]">(Current)</span>}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* LOCAL FOLDERS */}
                        <div className="mb-4">
                            <h3 className="text-[10px] font-bold text-gray-500 uppercase flex items-center justify-between px-1 mb-2">
                                Local Folders
                                <button onClick={handleAddCustomFolder} className="p-1 hover:bg-gray-700 rounded text-synthux-orange" title="Mount Local Folder">
                                    <Plus size={12} />
                                </button>
                            </h3>

                            {customFolders.map(folder => (
                                <div key={folder.id} className="group relative">
                                    <button
                                        onClick={() => { setSelectedPackId('custom-folder'); setSelectedProjectId(null); setSelectedCustomFolderId(folder.id); }}
                                        className={`w-full text-left px-3 py-2 rounded text-sm font-medium transition-colors flex items-center gap-2 ${selectedCustomFolderId === folder.id
                                            ? 'bg-synthux-orange/20 text-synthux-orange border border-synthux-orange/50'
                                            : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                                            }`}
                                    >
                                        <FolderOpen size={14} />
                                        <span className="truncate flex-1">{folder.name}</span>
                                        {isLoadingFolder === folder.id && <Loader size={12} className="animate-spin text-synthux-orange" />}
                                    </button>

                                    {/* Hover Actions */}
                                    <div className="absolute right-1 top-1.5 bg-[#151515] rounded border border-gray-700 shadow flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); refreshCustomFolder(folder); }}
                                            className="p-1 text-gray-400 hover:text-white" title="Refresh folder"
                                        >
                                            <RefreshCw size={12} />
                                        </button>
                                        <button
                                            onClick={(e) => handleRemoveCustomFolder(e, folder.id)}
                                            className="p-1 text-gray-400 hover:text-red-400" title="Unmount folder"
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {customFolders.length === 0 && (
                                <div className="px-3 py-2 text-xs text-gray-600 italic">No folders mounted.</div>
                            )}
                        </div>

                        {/* BUILT-IN PACKS (Remote + Local) */}
                        <div>
                            <h3 className="text-[10px] font-bold text-gray-500 uppercase px-1 mb-2">Built-in Packs</h3>
                            {isManifestLoading && remotePacks.length === 0 && (
                                <div className="px-3 py-2 text-xs text-gray-600 flex items-center gap-2">
                                    <Loader size={12} className="animate-spin" /> Loading manifest...
                                </div>
                            )}
                            {allPacks.map((pack: any) => (
                                <button
                                    key={pack.id}
                                    onClick={() => { setSelectedPackId(pack.id); setSelectedProjectId(null); setSelectedCustomFolderId(null); }}
                                    className={`w-full text-left px-3 py-2 rounded text-sm font-medium transition-colors mb-0.5 ${selectedPackId === pack.id
                                        ? 'bg-synthux-orange/20 text-synthux-orange border border-synthux-orange/50'
                                        : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                                        }`}
                                >
                                    {pack.name}
                                </button>
                            ))}
                        </div>

                    </div>
                </div>

                {/* Main View: Sample List */}
                <div className="flex-1 bg-synthux-main flex flex-col overflow-hidden relative noise-texture">
                    <div ref={scrollRef} className="flex-1 p-6 overflow-y-auto relative z-10">
                        {selectedPack ? (
                            <>
                                <div className="mb-10 w-full">
                                    {/* HERO BANNER */}
                                    <div className="relative w-full h-80 rounded-2xl overflow-hidden shadow-2xl border border-white/5 bg-black/40 group mb-8">
                                        {selectedPack.coverImage ? (
                                            <img
                                                src={selectedPack.coverImage}
                                                alt={selectedPack.name}
                                                crossOrigin="anonymous"
                                                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                                            />
                                        ) : (
                                            /* Fallback for local folders/library */
                                            <div className="w-full h-full bg-gradient-to-br from-synthux-orange/20 via-black to-synthux-blue/20 flex items-center justify-center">
                                                <FolderOpen size={80} className="text-white/5" />
                                            </div>
                                        )}
                                        
                                        {/* Overlay with Title */}
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent flex flex-col justify-end p-8 md:p-10">
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <span className="px-2 py-0.5 bg-synthux-orange/90 text-white text-[10px] font-bold uppercase tracking-widest rounded-sm shadow-lg">
                                                        {isCustomFolderSelected ? 'Local Folder' : 
                                                         isProjectSamplesSelected ? 'Project Samples' : 
                                                         isUserLibrarySelected ? 'System Library' : 'Free Sample Pack'}
                                                    </span>
                                                    {!isCustomFolderSelected && (
                                                        <span className="px-2 py-0.5 bg-white/10 backdrop-blur-md text-gray-300 text-[10px] font-medium uppercase tracking-widest rounded-sm border border-white/5">
                                                            {selectedPack.samples.length > 100 ? '+100 Files' : `${selectedPack.samples.length} Files`}
                                                        </span>
                                                    )}
                                                </div>
                                                <h1 className="text-4xl md:text-5xl font-black text-white tracking-tighter drop-shadow-2xl">
                                                    {selectedPack.name}
                                                </h1>
                                            </div>
                                        </div>
                                    </div>

                                    {/* INFO SECTION - Single Column Flow */}
                                    <div className="space-y-10 px-2 lg:px-4">
                                        <div className="space-y-6">
                                            <div>
                                                <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] mb-4">About this pack</h4>
                                                <div className="text-gray-300 text-base leading-relaxed font-body max-w-4xl whitespace-pre-wrap">
                                                    {selectedPack.description.split(/(https?:\/\/[^\s]+)/g).map((part: string, i: number) => 
                                                        /(https?:\/\/[^\s]+)/g.test(part) ? (
                                                            <a key={i} href={part} target="_blank" rel="noreferrer" className="text-synthux-blue hover:underline">
                                                                {part}
                                                            </a>
                                                        ) : part
                                                    )}
                                                </div>
                                            </div>

                                            {selectedPack.license && (
                                                <div className="max-w-4xl bg-black/30 backdrop-blur-sm p-4 rounded-xl border border-white/5">
                                                    <div className="flex items-center gap-2 mb-3">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-synthux-orange shadow-[0_0_8px_rgba(242,101,34,0.8)]" />
                                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Usage Context</span>
                                                    </div>
                                                    <p className="text-[11px] text-gray-400 font-mono leading-relaxed">{selectedPack.license}</p>
                                                </div>
                                            )}
                                        </div>

                                        {selectedPack.links && selectedPack.links.length > 0 && (
                                            <div className="space-y-10 border-t border-white/5 pt-8">
                                                {/* ZIP DOWNLOADS */}
                                                {selectedPack.links.some((l: any) => l.label.toLowerCase().includes('.zip') || l.label.toLowerCase().includes('download')) && (
                                                    <div>
                                                        <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] mb-4">Available Assets</h4>
                                                        <div className="flex gap-4 flex-wrap">
                                                            {selectedPack.links.filter((l: any) => l.label.toLowerCase().includes('.zip') || l.label.toLowerCase().includes('download')).map((link: any, i: number) => (
                                                                <a
                                                                    key={i}
                                                                    href={link.url}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="group flex flex-1 min-w-[280px] max-w-[400px] items-center justify-between px-5 py-4 bg-synthux-blue/10 hover:bg-synthux-blue/20 text-synthux-blue rounded-xl border border-synthux-blue/30 transition-all active:scale-95"
                                                                >
                                                                    <div className="flex items-center gap-4">
                                                                        <Download size={20} className="group-hover:animate-bounce-subtle" />
                                                                        <span className="font-bold text-sm tracking-tight">{link.label}</span>
                                                                    </div>
                                                                    <span className="text-[10px] opacity-40 font-mono">.ZIP</span>
                                                                </a>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* EXTERNAL LINKS */}
                                                <div>
                                                    <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] mb-4">Connections</h4>
                                                    <div className="flex flex-wrap gap-2">
                                                        {selectedPack.links.filter((l: any) => 
                                                            !l.label.toLowerCase().includes('.zip') && 
                                                            !l.label.toLowerCase().includes('download')
                                                        ).map((link: any, i: number) => {
                                                            const isSynthux = link.label.toLowerCase().includes('synthux') || link.label.toLowerCase().includes('website');
                                                            return (
                                                                <a
                                                                    key={i}
                                                                    href={link.url}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold border transition-all hover:-translate-y-0.5 ${
                                                                        isSynthux 
                                                                        ? 'bg-synthux-orange/10 border-synthux-orange/30 text-synthux-orange hover:bg-synthux-orange/20' 
                                                                        : 'bg-white/5 border-white/10 text-gray-400 hover:text-white hover:bg-white/10'
                                                                    }`}
                                                                >
                                                                    {link.label}
                                                                </a>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>


                                {isCustomFolderSelected && selectedCustomFolderId && customFolders.find(f => f.id === selectedCustomFolderId) ? (
                                    <LocalFolderBrowser
                                        rootHandle={customFolders.find(f => f.id === selectedCustomFolderId)!.handle}
                                        rootName={customFolders.find(f => f.id === selectedCustomFolderId)!.name}
                                        onPreview={async (file, name, filePath) => {
                                            handlePlay({
                                                path: filePath || `${selectedCustomFolderId}/${name}`,
                                                name: name,
                                                _isVirtual: true,
                                                _blob: file
                                            });
                                        }}
                                        onImport={async (file, path) => {
                                            const sample = {
                                                path: path,
                                                name: file.name,
                                                _isVirtual: true,
                                                _blob: file
                                            };
                                            await handleImport(sample);
                                        }}
                                        playingFileId={playingSample || undefined}
                                        isPreviewPlaying={isPreviewPlaying}
                                        importingFileId={importingSample || undefined}
                                        addedFileIds={addedSamples}
                                        mode="add"
                                        bulkActionLabel={mode === 'slot-selection' ? 'Add to Slot' : 'Copy to Pool'}
                                        onBulkImport={handleBulkImport}
                                        availableTapeColors={TAPE_COLORS}
                                        onImportToPool={onImportToPool || (async (files) => {
                                            for (const { file, path } of files) {
                                                await handleImport({ path, name: file.name, _isVirtual: true, _blob: file });
                                            }
                                        })}
                                        onImportToTape={onImportToTape || (async (files, _targetTape) => {
                                            // Fallback: import normally (App.tsx will provide the real handler)
                                            for (const { file, path } of files) {
                                                await handleImport({ path, name: file.name, _isVirtual: true, _blob: file });
                                            }
                                        })}
                                        locateFilePath={locateTarget}
                                        onLocateHandled={() => setLocateTarget(null)}
                                    />
                                ) : (
                                    <div className="space-y-6 pb-20">
                                        {(() => {
                                            const allSamplesInView = categorizedSamples.flatMap(([_, s]) => s);
                                            return categorizedSamples.map(([category, samples]) => {
                                                const selectedInCategory = samples.filter(s => selectedSamplePaths.has(s.path));
                                                const isAllSelected = selectedInCategory.length === samples.length && samples.length > 0;
                                                const isSomeSelected = selectedInCategory.length > 0 && selectedInCategory.length < samples.length;

                                                return (
                                                    <div key={category} className="bg-black/20 rounded-lg overflow-hidden border border-white/5">
                                                        <h3 className="sticky top-0 z-20 bg-[#151515] text-[10px] font-bold text-gray-400 uppercase tracking-widest py-2 px-4 shadow-sm border-b border-gray-800 flex items-center justify-between">
                                                            <span>{category}</span>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[9px] opacity-40 font-mono lowercase mr-2">{samples.length} files</span>
                                                                <button
                                                                    onClick={() => selectAllInCategory(samples, !isAllSelected)}
                                                                    className={`flex items-center gap-1.5 px-2 py-0.5 rounded transition-all border ${isAllSelected
                                                                        ? 'bg-synthux-orange/20 border-synthux-orange/40 text-synthux-orange'
                                                                        : 'bg-black/40 border-white/10 text-gray-500 hover:text-gray-300'
                                                                        }`}
                                                                >
                                                                    <div className={`w-3 h-3 rounded-[3px] border flex items-center justify-center transition-colors ${isAllSelected ? 'bg-synthux-orange border-synthux-orange' : 'bg-black/60 border-gray-700'}`}>
                                                                        {isAllSelected ? <Check size={8} className="text-black stroke-[4]" /> : isSomeSelected ? <div className="w-1.5 h-0.5 bg-gray-500 rounded-full" /> : null}
                                                                    </div>
                                                                    <span className="uppercase tracking-widest text-[8px]">{isAllSelected ? 'Deselect Category' : 'Select Category'}</span>
                                                                </button>
                                                            </div>
                                                        </h3>
                                                        <div className="divide-y divide-gray-800/50">
                                                            {samples.map((sample: any, idx: number) => {
                                                                const isPlaying = playingSample === sample.path;
                                                                const isImporting = importingSample === sample.path;
                                                                const isAdded = allAddedPaths.paths.has(sample.path) || allAddedPaths.addedNames.has(sample.name);
                                                                const isSelected = selectedSamplePaths.has(sample.path);

                                                                return (
                                                                    <div 
                                                                        key={idx} 
                                                                        onClick={(e) => toggleSampleSelection(sample.path, allSamplesInView, e)}
                                                                        className={`grid grid-cols-[30px_40px_1fr_auto_100px] gap-3 items-center px-4 py-2 hover:bg-gray-800/80 transition-all group cursor-pointer border rounded-md ${isSelected ? 'border-synthux-orange bg-synthux-orange/10 relative z-10' : 'border-transparent'}`}
                                                                    >
                                                                        <div className="flex items-center justify-center">
                                                                            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${isSelected ? 'bg-synthux-orange border-synthux-orange shadow-[0_0_8px_rgba(249,115,22,0.3)]' : 'bg-black/40 border-gray-700 group-hover:border-gray-500'}`}>
                                                                                {isSelected && <Check size={10} className="text-black stroke-[3]" />}
                                                                            </div>
                                                                        </div>

                                                                        <button
                                                                            onClick={(e) => { e.stopPropagation(); handlePlay(sample); }}
                                                                            className={`w-8 h-8 flex items-center justify-center rounded-full transition-all ${isPlaying && isPreviewPlaying ? 'text-black bg-synthux-yellow scale-110 shadow-lg' : 'text-gray-400 hover:text-white bg-black hover:bg-gray-700 border border-gray-700'
                                                                                }`}
                                                                        >
                                                                            {isPlaying && isPreviewPlaying ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" className="ml-0.5" />}
                                                                        </button>

                                                                        <div className="font-mono text-sm text-gray-300 group-hover:text-white truncate">
                                                                            <div className="truncate font-bold">{sample.name}</div>
                                                                            {sample.tags && sample.tags.length > 0 && (
                                                                                <div className="mt-0.5 text-[10px] text-gray-500 truncate flex gap-1">
                                                                                    {sample.tags.map((t: string) => <span key={t} className="bg-gray-800 px-1 py-0.5 rounded text-gray-400">#{t}</span>)}
                                                                                </div>
                                                                            )}
                                                                        </div>

                                                                        {isUserLibrarySelected && (
                                                                            <button
                                                                                onClick={(e) => { e.stopPropagation(); onOpenLibraryManager('manage', sample.path); }}
                                                                                className="p-1.5 text-gray-500 hover:text-synthux-orange hover:bg-synthux-orange/10 rounded opacity-0 group-hover:opacity-100 transition-all"
                                                                                title="Edit in Library Manager"
                                                                            >
                                                                                <Edit2 size={14} />
                                                                            </button>
                                                                        )}

                                                                        <div className="text-right">
                                                                            <button
                                                                                onClick={(e) => { e.stopPropagation(); handleImport(sample); }}
                                                                                disabled={isImporting}
                                                                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold transition-all shadow-sm ${isImporting ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:scale-[1.02] active:scale-95'} ${isAdded
                                                                                    ? 'bg-synthux-yellow hover:bg-yellow-400 text-black border border-synthux-yellow shadow-synthux-yellow/20'
                                                                                    : 'bg-synthux-blue/20 hover:bg-synthux-blue hover:text-black text-synthux-blue border border-synthux-blue/50'
                                                                                    }`}
                                                                            >
                                                                                {isImporting ? (
                                                                                    <>
                                                                                        <Loader size={12} className="animate-spin" /> Adding
                                                                                    </>
                                                                                ) : isAdded ? (
                                                                                    <>
                                                                                        <Check size={14} /> Added (Add Again)
                                                                                    </>
                                                                                ) : (
                                                                                    <>
                                                                                        <Download size={14} /> {mode === 'slot-selection' ? 'Assign' : 'Add'}
                                                                                    </>
                                                                                )}
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                );
                                            });
                                        })()}
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-gray-500 font-mono text-sm">
                                <FolderOpen size={48} className="mb-4 opacity-20 text-synthux-orange" />
                                {isProjectSamplesSelected && !selectedProjectId
                                    ? 'Select a project from the sidebar to browse its samples.'
                                    : isProjectSamplesSelected && loadingProjectId
                                        ? `Loading project samples for ${loadingProjectId}...`
                                        : isProjectSamplesSelected && projectLoadError
                                            ? <span className="text-red-400">{projectLoadError}</span>
                                            : isCustomFolderSelected && isLoadingFolder
                                                ? 'Reading local folder...'
                                                : 'Select a Pack, Project, or Folder to browse.'}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* AUDIO PREVIEW BAR */}
            <div className="border-t border-gray-800 bg-[#121212] flex items-center px-4 py-3 gap-4 shadow-xl z-20">
                <button
                    onClick={() => {
                        if (audioRef.current) {
                            if (isPreviewPlaying) audioRef.current.pause();
                            else audioRef.current.play().catch(e => console.error(e));
                        }
                    }}
                    disabled={!playingSample}
                    className={`flex flex-shrink-0 items-center justify-center w-10 h-10 rounded-full transition-colors ${playingSample && isPreviewPlaying ? 'bg-synthux-yellow text-black shadow-lg scale-105' : playingSample ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-white/5 text-gray-700 cursor-not-allowed'}`}
                >
                    {isPreviewPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-1" />}
                </button>

                <div className="flex-1 flex flex-col justify-center min-w-0">
                    <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs font-bold text-gray-300 truncate">
                                {playingSample ? playingSampleName : 'No file playing'}
                            </span>
                            {playingSample && (
                                <button
                                    onClick={() => {
                                        if (playingSample) setLocateTarget(playingSample);
                                    }}
                                    className="shrink-0 p-1 text-gray-500 hover:text-synthux-orange hover:bg-white/10 rounded transition-colors"
                                    title="Locate playing file"
                                >
                                    <Crosshair size={12} />
                                </button>
                            )}
                        </div>
                        <span className="font-mono text-[10px] text-gray-500 bg-black/40 px-1.5 py-0.5 rounded">
                            {Math.floor(playbackTime)}s / {Math.floor(playbackDuration)}s
                        </span>
                    </div>
                    <div className="relative w-full h-1.5 bg-black rounded-full overflow-hidden">
                        <div
                            className="absolute top-0 left-0 h-full bg-synthux-orange"
                            style={{ width: `${playbackDuration > 0 ? (playbackTime / playbackDuration) * 100 : 0}%` }}
                        />
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
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                    </div>
                </div>
            </div>


            <audio
                ref={audioRef}
                crossOrigin="anonymous"
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

            {/* Bulk Action Sticky Bar — matches LocalFolderBrowser pattern */}
            {selectedSamplePaths.size > 0 && (
                <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-bottom-4 duration-300">
                    {/* Submenu dropdown */}
                    {showActionMenu && (
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 bg-[#1a1a1a] border border-gray-700/50 rounded-xl shadow-2xl py-2 min-w-[280px] animate-in fade-in slide-in-from-bottom-2 duration-200 backdrop-blur-md">
                            <div className="px-4 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] border-b border-white/5 mb-1">Import Target</div>
                            
                            <button
                                onClick={() => handleBulkActionWithTarget('slots')}
                                className="w-full text-left px-4 py-2.5 text-xs text-gray-300 hover:bg-synthux-orange/10 hover:text-synthux-orange transition-colors flex items-center gap-3 group"
                            >
                                <Plus size={14} className="group-hover:scale-110 transition-transform" /> 
                                <div className="flex flex-col">
                                    <span className="font-bold">Add to Slot / Active Tape</span>
                                </div>
                            </button>

                            <button
                                onClick={() => handleBulkActionWithTarget('pool')}
                                className="w-full text-left px-4 py-2.5 text-xs text-gray-300 hover:bg-white/5 hover:text-white transition-colors flex items-center gap-3 group border-t border-white/5"
                            >
                                <Layers size={14} className="text-gray-400 group-hover:text-white" />
                                <div className="flex flex-col">
                                    <span className="font-bold">Add all to Pool</span>
                                </div>
                            </button>

                            <div className="mx-2 my-1 border-t border-white/5" />
                            <div className="px-4 py-1.5 text-[9px] font-bold text-gray-500 uppercase tracking-widest">Target Tape</div>
                            
                            <div className="grid grid-cols-6 gap-1 px-3 py-1">
                                {TAPE_COLORS.map(color => (
                                    <button
                                        key={color}
                                        onClick={() => handleBulkActionWithTarget(color)}
                                        className="group relative flex flex-col items-center gap-1.5 p-2 rounded-lg hover:bg-white/5 transition-all"
                                        title={`Import to ${color} Tape`}
                                    >
                                        <div 
                                            className={`w-4 h-4 rounded-full border border-white/10 shadow-lg group-hover:scale-110 group-hover:border-white/30 transition-all ${COLOR_MAP[color]}`}
                                        />
                                        <span className="text-[8px] font-mono text-gray-500 group-hover:text-white uppercase">Tape {color}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Main Bar */}
                    <div className="flex items-center gap-4 bg-black/90 border border-white/10 rounded-full px-5 py-2 shadowing-2xl backdrop-blur-xl ring-1 ring-white/20 h-14">
                        <div className="flex items-center gap-3">
                            <span className="text-xs font-bold text-white whitespace-nowrap">{selectedSamplePaths.size} files</span>
                            <button
                                onClick={() => resetSelection()}
                                className="text-[10px] text-gray-400 hover:text-white transition-colors font-bold uppercase tracking-wider"
                            >
                                Clear
                            </button>
                        </div>

                        <div className="flex items-center gap-2 border-l border-white/10 pl-4">
                            <button
                                onClick={() => handleBulkActionWithTarget('slots')}
                                className="bg-synthux-orange hover:bg-synthux-orange/80 text-black py-2 px-6 rounded-full font-bold text-xs flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-synthux-orange/20"
                            >
                                <Plus size={14} /> Import Selection
                            </button>
                            
                            <button 
                                onClick={() => setShowActionMenu(!showActionMenu)}
                                className={`w-10 h-10 rounded-full flex items-center justify-center border transition-all ${showActionMenu ? 'bg-synthux-orange border-synthux-orange text-black' : 'bg-black/60 border-white/10 text-gray-400 hover:border-white/30 hover:text-white'}`}
                            >
                                <ChevronDown size={20} className={`transition-transform duration-300 ${showActionMenu ? 'rotate-180' : ''}`} />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
