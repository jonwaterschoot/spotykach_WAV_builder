import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { X, Play, Pause, Download, FolderOpen, Loader, Check, User, Briefcase, Plus, RefreshCw, Trash2, Edit2, Pencil, Settings, Crosshair, ChevronDown, ChevronRight, Layers, Menu, Package } from 'lucide-react';
import { SAMPLE_PACKS, fetchSampleManifest } from '../data/samplePacks';
import type { PresetManifestEntry, SamplePack } from '../data/samplePacks';
import { resolveAssetPath } from '../utils/assetUtils';
import { SAMPLE_DRAG_TYPE } from '../utils/dragTypes';
import type { UserLibrary, ProjectSummary, FileRecord, TapeColor } from '../types';
import { TAPE_COLORS, COLOR_MAP } from '../types';
// dynamic utility imports
import { LocalFolderBrowser } from './LocalFolderBrowser';

const EMPTY_LIBRARY: UserLibrary = { files: {}, metadata: {} };
const NO_PROJECTS: ProjectSummary[] = [];

interface SampleBrowserProps {
    isOpen: boolean;
    onClose: () => void;
    onImport: (url: string, name: string, origin?: string, license?: string, sourcePath?: string) => Promise<void>;
    /**
     * Paths the *caller* considers already taken, unioned with the browser's own
     * record of what it imported this session. Browse mode derives it from the live
     * selection pool, so the mark survives switching packs and clears again when an
     * entry is removed from the pool.
     */
    addedPaths?: Set<string>;
    /**
     * `project` is the Studio browser: library management, project sources, and
     * "send to slot/tape" targets. `standalone` is Browse mode (#/browse) — no
     * project exists, so every project-bound action is hidden and the only exit
     * is the caller's selection pool.
     */
    mode?: 'standalone' | 'project';
    userLibrary?: UserLibrary;
    projects?: ProjectSummary[];
    onOpenLibraryManager?: (tab?: 'upload' | 'project' | 'manage' | 'settings', highlightFileId?: string) => void;
    currentProjectName?: string;
    currentFiles?: Record<string, FileRecord>;
    workHandle?: FileSystemDirectoryHandle | null;
    selectionMode?: 'global' | 'slot-selection';
    onImportToPool?: (files: { file: File, path: string }[]) => Promise<void>;
    onImportToTape?: (files: { file: File, path: string }[], targetTape: TapeColor) => Promise<void>;
    onRemoteBulkImport?: (samples: { url: string, name: string, path?: string }[], target: 'pool' | 'slots' | import('../types').TapeColor, origin?: string, license?: string) => Promise<void>;
    /**
     * Edit one sample straight from the row — Phase 7, step 5.
     *
     * Same signature as `onImport`, because it *is* an import: the host pools the
     * file and opens the editor on the pooled entry. Trimming one sample used to
     * mean building a selection first, which is a concept the user never asked for.
     * Optional, so the Studio browser (a different host, with a project behind it)
     * simply doesn't pass it yet.
     */
    onEditSample?: (url: string, name: string, origin?: string, license?: string, sourcePath?: string) => Promise<void>;
    /**
     * A blob the *host* wants played, routed through this browser's own player so it
     * arrives with the transport bar, the scrubber, the name and locate.
     *
     * There used to be a second `<audio>` in Browse mode and a two-way handshake to
     * keep the pair from playing over each other; one player and one request needs
     * neither. `null` means "stop" — the host sends it when the blob behind the key
     * is replaced or removed, so a stale object URL is never played. `nonce` is
     * bumped per click, so asking twice for the same key still arrives and toggles.
     */
    hostPlayback?: { key: string; name: string; blob: Blob; nonce: number } | null;
    /** What the player is on now, so a host row can show its own play/pause state. */
    onPlaybackChange?: (key: string | null, playing: boolean) => void;
    /**
     * "Locate" for a file the host is also holding. Called with the playing sample's
     * path alongside the in-list locate, and the host decides whether it recognises
     * it — Browse mode reveals it in the temporary pool.
     */
    onLocateInPool?: (sourcePath: string) => void;
    /**
     * One-way "stop, something else has the audio now" — both hosts raise it while an
     * editor is open, and that editor brings its own transport.
     */
    forceStop?: boolean;
    /**
     * "There is a ready-made card for this pack" — the link under a pack's ZIP.
     *
     * The two hosts mean two different things by it, which is why it is a callback
     * and not a route: Browse leaves for `#/presets`, and Studio closes this window
     * and opens its own presets modal (which sits *under* the browser's window, so
     * it has to be got out of the way first). Absent means the host has no preset
     * surface to send anyone to, and the link isn't drawn.
     */
    onOpenPreset?: (preset: PresetManifestEntry) => void;
    /**
     * A drag of one or more sample rows, from the moment it starts until it ends.
     *
     * The payload is a *thunk*, not a list, because a sample's audio is a blob in
     * this component and `DataTransfer` carries strings. Minting object URLs at
     * dragstart would leak every one the user dropped nowhere, and revoking them at
     * dragend would race the host's import — so the URLs are minted inside `commit`,
     * which the host calls if and when the drop lands. `null` means the drag ended,
     * dropped or not.
     *
     * Absent means the host has no target for it, and the rows aren't draggable —
     * Studio's browser is a floating window over a grid that takes project files,
     * not pack samples, so it doesn't subscribe.
     */
    onSampleDrag?: (drag: { count: number; commit: () => Promise<void> } | null) => void;
}

/**
 * The shape a row actually needs. The rest of this file still passes samples around
 * as `any` — they come from four differently-shaped sources — but new code doesn't
 * have to inherit that.
 */
interface BrowsableSample {
    path: string;
    name: string;
    /** True for a file the browser holds in memory rather than fetches by path. */
    _isVirtual?: boolean;
    _blob?: Blob;
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
    addedPaths,
    mode = 'project',
    userLibrary = EMPTY_LIBRARY,
    projects = NO_PROJECTS,
    onOpenLibraryManager,
    currentProjectName,
    currentFiles,
    workHandle = null,
    selectionMode = 'global',
    onImportToPool,
    onImportToTape,
    onRemoteBulkImport,
    onEditSample,
    hostPlayback,
    onPlaybackChange,
    onLocateInPool,
    forceStop,
    onOpenPreset,
    onSampleDrag,
}: SampleBrowserProps) => {

    const isStandalone = mode === 'standalone';
    // Locked decision: the library is IDB-resident and needs no work folder, so it
    // rides along in standalone — but read-only, and only when there's something in it.
    const hasUserLibrary = Object.keys(userLibrary.files).length > 0;
    const showUserLibrary = !isStandalone || hasUserLibrary;

    // Core Selection State
    const [selectedPackId, setSelectedPackId] = useState<string>(SAMPLE_PACKS[0]?.id || 'my-library');
    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
    const [selectedCustomFolderId, setSelectedCustomFolderId] = useState<string | null>(null);
    const [remotePacks, setRemotePacks] = useState<SamplePack[]>([]);
    /** Read only to answer "is there a ready-made card built on this pack?". */
    const [remotePresets, setRemotePresets] = useState<PresetManifestEntry[]>([]);
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
    /**
     * Which source the playing sample came from, captured at play time.
     *
     * "Locate" has to be able to jump back to it after the user has wandered off
     * into other packs. Searching every loaded source for the path would be both
     * slower and ambiguous — two mounted folders can produce the same relative
     * path — so we simply remember where we were.
     */
    const [playingSampleOrigin, setPlayingSampleOrigin] = useState<{
        packId: string;
        projectId: string | null;
        folderId: string | null;
    } | null>(null);
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
    const [editingSample, setEditingSample] = useState<string | null>(null);
    const [addedSamples, setAddedSamples] = useState<Set<string>>(new Set());
    /** Handed to LocalFolderBrowser, which owns locating inside a mounted folder. */
    const [locateTarget, setLocateTarget] = useState<string | null>(null);
    /** The row to scroll to and glow in the pack/library/project list. */
    const [locatedSamplePath, setLocatedSamplePath] = useState<string | null>(null);

    /** Below `md` the sources list is a drawer over the sample list, not a column beside it. */
    const [sourcesOpen, setSourcesOpen] = useState(false);

    // Multi-select state
    const [selectedSamplePaths, setSelectedSamplePaths] = useState<Set<string>>(new Set());
    const [lastSelectedPath, setLastSelectedPath] = useState<string | null>(null);
    const [showActionMenu, setShowActionMenu] = useState(false);

    // Track added samples globally based on the project's current files
    const allAddedPaths = useMemo(() => {
        const paths = new Set<string>(addedSamples);
        addedPaths?.forEach(path => paths.add(path));
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
    }, [currentFiles, addedSamples, addedPaths]);

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
                const { packs, presets } = await fetchSampleManifest();
                setRemotePacks(packs);
                setRemotePresets(presets);
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

    /**
     * Send these paths, in this order, to one target. Shared by the bulk action menu
     * and by a drag onto the host's pool — a drop is the same import, asked for with
     * the hand instead of the menu.
     *
     * Object URLs are minted here rather than by the caller, so a drag that ends
     * nowhere has never made one. Returns what it actually sent.
     */
    const importPathsTo = async (paths: string[], target: 'pool' | 'slots' | TapeColor) => {
        if (paths.length === 0 || !onRemoteBulkImport) return [];

        // Read from the resolved pack rather than re-finding it in the built-in list,
        // so the library, project sources and mounted folders bulk-import too — they
        // carry their blobs on `_blob` and only need an object URL.
        const pack = selectedPack;
        if (!pack) return [];

        const allSamples: any[] = pack.samples || [];
        const samplesToImport = paths.map(path => {
            const s = allSamples.find(sample => sample.path === path);
            if (!s) return null;
            let url = resolveAssetPath(s.path);
            if (s._isVirtual && s._blob) {
                url = URL.createObjectURL(s._blob);
            }
            return { url, name: s.name, path: s.path };
        }).filter((s): s is { url: string, name: string, path: string } => s !== null);

        if (samplesToImport.length === 0) return [];

        await onRemoteBulkImport(samplesToImport, target, pack.id, pack.license);
        // The single-file path marks these; the bulk path used not to, so a bulk
        // selection came back unmarked the moment you switched packs.
        setAddedSamples(prev => {
            const next = new Set(prev);
            samplesToImport.forEach(s => next.add(s.path));
            return next;
        });
        return samplesToImport;
    };

    const handleBulkActionWithTarget = async (target: 'pool' | 'slots' | TapeColor) => {
        setShowActionMenu(false);
        const sent = await importPathsTo(Array.from(selectedSamplePaths), target);
        if (sent.length > 0) setSelectedSamplePaths(new Set());
    };

    // --------------------------------------------------------------------------------
    // Dragging rows out of the browser
    //
    // The row already had a button that does this. A drag is the same act performed
    // where the user is looking: onto the pool, which is the thing the button's
    // result lands in anyway. What crosses the boundary is a marker MIME type — the
    // payload rides in the host's hands through `onSampleDrag`, since a blob can't
    // be put on a DataTransfer.
    // --------------------------------------------------------------------------------

    /** Both halves have to be there: somewhere to drop it, and a way to import it. */
    const canDragSamples = !!onSampleDrag && !!onRemoteBulkImport;

    /** A drag started on a selected row carries the whole selection; otherwise, just that row. */
    const dragPathsFor = (path: string) =>
        (selectedSamplePaths.has(path) ? Array.from(selectedSamplePaths) : [path]);

    /**
     * The count under the cursor. Without it a five-file drag looks exactly like a
     * one-file drag — the browser paints the row you happened to grab.
     */
    const setMultiDragImage = (e: React.DragEvent, count: number) => {
        if (count < 2 || typeof document === 'undefined') return;
        const chip = document.createElement('div');
        chip.textContent = `${count} samples`;
        chip.style.cssText = [
            'position:fixed', 'top:-1000px', 'left:-1000px', 'padding:6px 12px',
            'border-radius:8px', 'background:#f26522', 'color:#000',
            'font:700 12px ui-monospace,monospace', 'white-space:nowrap',
        ].join(';');
        document.body.appendChild(chip);
        e.dataTransfer.setDragImage(chip, 12, 12);
        // The browser snapshots the element for the cursor; it doesn't need to stay.
        setTimeout(() => chip.remove(), 0);
    };

    const handleSampleDragStart = (e: React.DragEvent, sample: BrowsableSample) => {
        if (!onSampleDrag || !onRemoteBulkImport) return;
        const paths = dragPathsFor(sample.path);

        // A marker, not the cargo: `dragover` can read types but never data, so this
        // is what lets the pool light up before the drop. `text/plain` is both the
        // mobile-drag-drop polyfill's fallback and what a drag into a text field gets.
        e.dataTransfer.setData(SAMPLE_DRAG_TYPE, String(paths.length));
        e.dataTransfer.setData('text/plain', paths.length > 1 ? `${paths.length} samples` : sample.name);
        e.dataTransfer.effectAllowed = 'copy';
        setMultiDragImage(e, paths.length);

        onSampleDrag({
            count: paths.length,
            commit: async () => {
                const sent = await importPathsTo(paths, 'pool');
                // Same ending as the bulk button: the selection has been spent.
                if (sent.length > 0) setSelectedSamplePaths(new Set());
            },
        });
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
    // 4a. Locate: scroll the located row into view once the source switch has rendered
    // --------------------------------------------------------------------------------
    useEffect(() => {
        if (!locatedSamplePath) return;
        const timer = setTimeout(() => {
            const row = scrollRef.current?.querySelector(`[data-sample-path="${CSS.escape(locatedSamplePath)}"]`);
            row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
        return () => clearTimeout(timer);
    }, [locatedSamplePath]);

    // --------------------------------------------------------------------------------
    // 4b. The host's player: a blob it holds, played through this one
    // --------------------------------------------------------------------------------
    /**
     * `handlePlay` is declared further down (after the `isOpen` guard) and is a fresh
     * closure every render, so the request effect reaches it through a ref rather
     * than listing it as a dependency and re-firing on every render.
     */
    const handlePlayRef = useRef<(sample: any) => void>(() => {});

    /** Off, unloaded, and no object URL left behind. */
    const stopPlayback = useCallback(() => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.removeAttribute('src');
        }
        if (previewUrlRef.current) {
            URL.revokeObjectURL(previewUrlRef.current);
            previewUrlRef.current = null;
        }
        setIsPreviewPlaying(false);
        setPlayingSample(null);
        setPlayingSampleName('');
        setPlayingSampleOrigin(null);
    }, []);

    useEffect(() => {
        if (forceStop) stopPlayback();
    }, [forceStop, stopPlayback]);

    useEffect(() => {
        if (!hostPlayback) {
            // Nothing requested, or the host retracting one: whatever it had us load
            // may be a blob that no longer exists.
            stopPlayback();
            return;
        }
        handlePlayRef.current({
            path: hostPlayback.key,
            name: hostPlayback.name,
            _isVirtual: true,
            _blob: hostPlayback.blob,
            _external: true,
        });
    }, [hostPlayback, stopPlayback]);

    useEffect(() => {
        onPlaybackChange?.(playingSample, isPreviewPlaying);
    }, [playingSample, isPreviewPlaying, onPlaybackChange]);


    // --------------------------------------------------------------------------------
    // 5. Build Final Active Selection 
    // --------------------------------------------------------------------------------
    const allPacks = [...SAMPLE_PACKS, ...remotePacks];
    let selectedPack: any = allPacks.find(p => p.id === selectedPackId);

    if (isUserLibrarySelected && showUserLibrary) {
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


    /**
     * Ready-made cards built on the pack that is open.
     *
     * A preset names the packs it draws from, so the pack page can say so without
     * anything new in the manifest. The library, a project's samples and a mounted
     * folder can't match — no preset requires an id that only exists in this session.
     */
    const packPresets = selectedPack
        ? remotePresets.filter(p => p.requiredPacks.includes(selectedPack.id))
        : [];

    /** Drawn only when the host has somewhere to send the click. */
    const showPresetLink = packPresets.length > 0 && !!onOpenPreset;

    // The pack's own links, split once. A "download" is an asset; everything else is
    // a connection — and a pack with only a ZIP no longer gets an empty Connections heading.
    const isAssetLink = (label: string) => {
        const l = label.toLowerCase();
        return l.includes('.zip') || l.includes('download');
    };
    const packLinks: { label: string; url: string }[] = selectedPack?.links || [];
    const packZipLinks = packLinks.filter(l => isAssetLink(l.label));
    const packOtherLinks = packLinks.filter(l => !isAssetLink(l.label));

    /**
     * What is actually inside the ZIP, read off the pack's own file list rather than
     * written into the button — a pack that ships WAV shouldn't be labelled FLAC
     * because today's three happen to be FLAC.
     */
    const packSampleFormats = Array.from(new Set(
        ((selectedPack?.samples || []) as { path?: string }[])
            .map(s => (s.path?.split('.').pop() || '').toLowerCase())
            .filter(Boolean)
    )).map(ext => ext.toUpperCase());

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
                // A host blob belongs to no source in this column, so there is nowhere
                // for locate to switch to — it hands the key to the host instead.
                setPlayingSampleOrigin(sample._external ? null : {
                    packId: selectedPackId,
                    projectId: selectedProjectId,
                    folderId: selectedCustomFolderId,
                });
            }
        }
    };

    handlePlayRef.current = handlePlay;

    /**
     * Jump back to the playing file: reopen the source it came from, scroll it into
     * view and leave it glowing until the user clicks it. Same behaviour as locate
     * inside a mounted folder, which LocalFolderBrowser handles via `locateTarget`.
     */
    const handleLocatePlaying = () => {
        if (!playingSample) return;

        // A blob the host asked us to play has no row in this column — only the host
        // knows where it lives, so the whole of locate is its answer.
        if (!playingSampleOrigin) {
            onLocateInPool?.(playingSample);
            return;
        }

        // Setting an unchanged id is a no-op, so an in-place locate won't trip
        // the source-change effect that clears the current multi-selection.
        setSelectedPackId(playingSampleOrigin.packId);
        setSelectedProjectId(playingSampleOrigin.projectId);
        setSelectedCustomFolderId(playingSampleOrigin.folderId);

        // A tag filter can be hiding the very row we're about to scroll to.
        if (playingSampleOrigin.packId === 'my-library') {
            setUserLibraryTagFilter('');
            setSelectedUserLibraryTags([]);
        }

        // A mounted folder renders LocalFolderBrowser instead of the categorised list,
        // and it owns the scroll-and-glow for its own rows.
        setLocateTarget(playingSample);
        if (playingSampleOrigin.packId !== 'custom-folder') {
            setLocatedSamplePath(playingSample);
        }

        // A file can be in two places at once — here and in the host's pool. The host
        // ignores a path it doesn't hold, so this is unconditional.
        onLocateInPool?.(playingSample);
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
                selectedPack?.license,
                sample.path
            );
            setAddedSamples(prev => new Set(prev).add(sample.path));
        } catch (error) {
            console.error("Import failed", error);
        } finally {
            setImportingSample(null);
        }
    };

    /** Pool this one file and hand it straight to the editor. */
    const handleEdit = async (sample: BrowsableSample) => {
        if (!onEditSample) return;
        setEditingSample(sample.path);
        try {
            let url = resolveAssetPath(sample.path);
            if (sample._isVirtual && sample._blob) {
                url = URL.createObjectURL(sample._blob);
            }
            await onEditSample(
                url,
                sample.name,
                selectedPack?.name || 'Local Folder',
                selectedPack?.license,
                sample.path
            );
            setAddedSamples(prev => new Set(prev).add(sample.path));
        } catch (error) {
            console.error("Edit failed", error);
        } finally {
            setEditingSample(null);
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
            <div className="sample-browser-drag-handle flex items-center justify-between p-3 sm:p-4 border-b border-gray-800 bg-synthux-panel shadow-md z-10 cursor-move">
                <h2 className="text-base sm:text-xl font-bold flex items-center gap-2 text-white min-w-0">
                    {/* The sources list is a drawer below `md`; this is the only way back to it. */}
                    <button
                        onClick={() => setSourcesOpen(v => !v)}
                        className="md:hidden p-1.5 -ml-1 rounded text-gray-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
                        title="Sources"
                    >
                        <Menu size={18} />
                    </button>
                    <FolderOpen className="text-synthux-orange shrink-0" /> <span className="truncate">Sample Browser</span>
                </h2>
                <div className="flex items-center gap-2 shrink-0">
                    {onOpenLibraryManager && (
                        <button
                            onClick={() => onOpenLibraryManager('settings')}
                            className="p-1.5 hover:bg-white/10 rounded-md text-gray-500 hover:text-synthux-orange transition-all"
                            title="Browser Settings"
                        >
                            <Settings size={20} />
                        </button>
                    )}
                    <button onClick={onClose} className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden relative">
                {/* Tapping the list behind the drawer is how you dismiss it. */}
                {sourcesOpen && (
                    <div
                        className="md:hidden absolute inset-0 z-30 bg-black/60"
                        onClick={() => setSourcesOpen(false)}
                    />
                )}

                {/*
                  * Sidebar: Tree View. A fixed 288px column takes most of a phone
                  * screen, so below `md` it slides over the list instead of beside
                  * it, and picking a source closes it again.
                  */}
                <div
                    onClick={(e) => {
                        if ((e.target as HTMLElement).closest('[data-source]')) setSourcesOpen(false);
                    }}
                    className={`${sourcesOpen ? 'flex' : 'hidden'} md:flex absolute md:static inset-y-0 left-0 z-40
                        w-72 max-w-[85%] md:max-w-none shrink-0 bg-synthux-browsebg border-r border-gray-800 flex-col overflow-hidden`}
                >
                    <div className="flex-1 p-4 flex flex-col gap-1 overflow-y-auto">

                        {/*
                          * BUILT-IN PACKS (Remote + Local) — first in the column.
                          *
                          * Curated Library used to lead, which put the one source whose
                          * origin is unexplained, and whose contents can't be changed from
                          * here, at the top with a filter field attached. The packs are what
                          * a visitor with nothing set up can actually browse.
                          */}
                        <div className="mb-4">
                            <h3 className="text-[10px] font-bold text-gray-500 uppercase px-1 mb-2">Built-in Packs</h3>
                            {isManifestLoading && remotePacks.length === 0 && (
                                <div className="px-3 py-2 text-xs text-gray-600 flex items-center gap-2">
                                    <Loader size={12} className="animate-spin" /> Loading manifest...
                                </div>
                            )}
                            {allPacks.map((pack: any) => (
                                <button
                                    key={pack.id}
                                    data-source
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

                        {/* PROJECT SAMPLES — a project source needs a work folder, so Studio only. */}
                        {!isStandalone && (
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
                                            data-source
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
                        )}

                        {/* CURATED LIBRARY */}
                        {showUserLibrary && (
                        <div className="mb-4">
                            <h3 className="text-[10px] font-bold text-gray-500 uppercase flex items-center justify-between px-1 mb-2">
                                Curated Library
                                {onOpenLibraryManager && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onOpenLibraryManager(); }}
                                        className="p-1 hover:bg-gray-700 rounded text-synthux-orange"
                                        title="Open Library Manager"
                                    >
                                        <Edit2 size={12} />
                                    </button>
                                )}
                            </h3>
                            <button
                                data-source
                                onClick={() => { setSelectedPackId('my-library'); setSelectedProjectId(null); setSelectedCustomFolderId(null); }}
                                className={`w-full text-left px-3 py-2 rounded text-sm font-medium transition-colors flex items-center gap-2 ${selectedPackId === 'my-library'
                                    ? 'bg-synthux-orange/20 text-synthux-orange border border-synthux-orange/50'
                                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                                    }`}
                            >
                                <User size={14} /> Curated Library
                            </button>
                            {/* Where the collection comes from — the one thing the name doesn't say. */}
                            <p className="px-3 pt-1.5 text-[10px] text-gray-600 leading-relaxed">
                                {isStandalone
                                    ? 'Sounds you saved to your own library in Studio, kept in this browser. Read-only here.'
                                    : 'Sounds you saved to your own library, kept in this browser. Add and tag them in the Library Manager.'}
                            </p>
                            {isUserLibrarySelected && (
                                <div className="mt-2 ml-2 pl-2 border-l border-gray-800">
                                    {/*
                                      * The typed filter is Studio's. There it sits over the user's
                                      * own managed library with a Library Manager behind it; in
                                      * standalone the list is short, read-only, and the field was
                                      * the most prominent control in the column. The chips stay in
                                      * both — they say what is in the list rather than asking.
                                      */}
                                    {!isStandalone && (
                                        <input
                                            value={userLibraryTagFilter}
                                            onChange={(e) => setUserLibraryTagFilter(e.target.value)}
                                            placeholder="Filter by tags..."
                                            className="w-full bg-black/40 border border-gray-700 rounded px-2 py-1.5 text-[11px] text-gray-200"
                                        />
                                    )}
                                    {availableUserLibraryTags.length > 0 && (
                                        <div className={`flex flex-wrap gap-1.5 ${isStandalone ? '' : 'mt-2'}`}>
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
                        )}

                        {/* LOCAL FOLDERS — last: mounting a folder is a deliberate act. */}
                        <div>
                            <h3 className="text-[10px] font-bold text-gray-500 uppercase flex items-center justify-between px-1 mb-2">
                                Local Folders
                                <button onClick={handleAddCustomFolder} className="p-1 hover:bg-gray-700 rounded text-synthux-orange" title="Mount Local Folder">
                                    <Plus size={12} />
                                </button>
                            </h3>

                            {customFolders.map(folder => (
                                <div key={folder.id} className="group relative">
                                    <button
                                        data-source
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

                    </div>
                </div>

                {/* Main View: Sample List */}
                <div className="flex-1 bg-synthux-main flex flex-col overflow-hidden relative noise-texture">
                    <div ref={scrollRef} className="flex-1 p-3 sm:p-6 overflow-y-auto relative z-10">
                        {selectedPack ? (
                            <>
                                <div className="mb-6 sm:mb-10 w-full">
                                    {/* HERO BANNER */}
                                    <div className="relative w-full h-40 sm:h-64 lg:h-80 rounded-xl sm:rounded-2xl overflow-hidden shadow-2xl border border-white/5 bg-black/40 group mb-5 sm:mb-8">
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
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent flex flex-col justify-end p-4 sm:p-8 md:p-10">
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
                                                <h1 className="text-2xl sm:text-4xl md:text-5xl font-black text-white tracking-tighter drop-shadow-2xl">
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

                                        {((selectedPack.links && selectedPack.links.length > 0) || showPresetLink) && (
                                            <div className="space-y-10 border-t border-white/5 pt-8">
                                                {/* ZIP DOWNLOADS — and, beside them, the same pack already built for the card */}
                                                {(packZipLinks.length > 0 || showPresetLink) && (
                                                    <div>
                                                        <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] mb-4">Available Assets</h4>
                                                        <div className="flex gap-4 flex-wrap">
                                                            {packZipLinks.map((link, i) => (
                                                                <a
                                                                    key={i}
                                                                    href={link.url}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="group flex flex-1 min-w-full sm:min-w-[320px] max-w-full sm:max-w-[440px] items-center justify-between gap-4 px-5 py-4 bg-synthux-blue/10 hover:bg-synthux-blue/20 text-synthux-blue rounded-xl border border-synthux-blue/30 transition-all active:scale-95"
                                                                >
                                                                    <div className="flex items-center gap-4 min-w-0">
                                                                        <Download size={20} className="shrink-0 group-hover:animate-bounce-subtle" />
                                                                        {/*
                                                                          * What the ZIP is, under what it's called. It is the pack as the
                                                                          * artist sent it — one flat folder, nothing trimmed, nothing
                                                                          * arranged — which is the difference between it and the preset
                                                                          * below, and the button never said so.
                                                                          */}
                                                                        <span className="min-w-0">
                                                                            <span className="block font-bold text-sm tracking-tight">{link.label}</span>
                                                                            <span className="block text-[10px] opacity-60 leading-relaxed mt-0.5">
                                                                                Dry file list · all {selectedPack.samples.length} files, one folder
                                                                                {packSampleFormats.length > 0 && `, ${packSampleFormats.join('/')} format`}
                                                                            </span>
                                                                        </span>
                                                                    </div>
                                                                    <span className="shrink-0 text-[10px] opacity-40 font-mono">.ZIP</span>
                                                                </a>
                                                            ))}
                                                        </div>

                                                        {/*
                                                          * "This pack, already arranged" — the ZIP is the raw files, the preset
                                                          * is the same pack laid out across the 6×6 grid. What the click does
                                                          * differs by host, so the wording does too: Browse leaves for the
                                                          * preset screen, Studio swaps this window for its presets panel.
                                                          */}
                                                        {showPresetLink && packPresets.map(preset => (
                                                            <button
                                                                key={preset.id}
                                                                onClick={() => onOpenPreset!(preset)}
                                                                className="group mt-4 w-full max-w-full sm:max-w-[620px] flex items-center gap-4 px-5 py-4 rounded-xl
                                                                    border border-violet-500/30 bg-violet-500/10 hover:bg-violet-500/20 text-left transition-all active:scale-[0.99]"
                                                            >
                                                                <Package size={20} className="shrink-0 text-violet-300" />
                                                                <span className="min-w-0 flex-1">
                                                                    <span className="block text-sm font-bold text-violet-200 tracking-tight">
                                                                        Want this pack in a ready-to-go format for SK? Use the preset.
                                                                    </span>
                                                                    <span className="block text-[11px] text-violet-300/60 leading-relaxed mt-0.5">
                                                                        {isStandalone
                                                                            ? <>“{preset.name}” is this pack already spread across the 6×6 grid. Opens the preset screen, which builds the whole <span className="font-mono">SK/</span> folder for your card. Your pool stays as it is.</>
                                                                            : <>“{preset.name}” is this pack already spread across the 6×6 grid. Opens the presets panel — this browser closes, and nothing is loaded until you pick it there.</>}
                                                                    </span>
                                                                </span>
                                                                <ChevronRight size={16} className="shrink-0 text-violet-300/60 group-hover:text-violet-200 group-hover:translate-x-0.5 transition-all" />
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}

                                                {/* EXTERNAL LINKS */}
                                                {packOtherLinks.length > 0 && (
                                                <div>
                                                    <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] mb-4">Connections</h4>
                                                    <div className="flex flex-wrap gap-2">
                                                        {packOtherLinks.map((link, i) => {
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
                                                )}
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
                                        addedFileIds={allAddedPaths.paths}
                                        mode="add"
                                        bulkActionLabel={selectionMode === 'slot-selection' ? 'Add to Slot' : 'Copy to Pool'}
                                        onBulkImport={handleBulkImport}
                                        availableTapeColors={isStandalone ? [] : TAPE_COLORS}
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
                                                                const isLocated = locatedSamplePath === sample.path;

                                                                return (
                                                                    <div
                                                                        key={idx}
                                                                        data-sample-path={sample.path}
                                                                        // Only where the host has somewhere to drop it. `title` says which
                                                                        // rows will travel, since the answer depends on the selection.
                                                                        draggable={canDragSamples}
                                                                        onDragStart={(e) => handleSampleDragStart(e, sample)}
                                                                        onDragEnd={() => onSampleDrag?.(null)}
                                                                        title={canDragSamples
                                                                            ? (isSelected && selectedSamplePaths.size > 1
                                                                                ? `Drag to add all ${selectedSamplePaths.size} selected samples to the pool`
                                                                                : 'Drag to the pool, or use the button on the right')
                                                                            : undefined}
                                                                        onClick={(e) => {
                                                                            // Acknowledging the file is what dismisses the glow.
                                                                            if (isLocated) setLocatedSamplePath(null);
                                                                            toggleSampleSelection(sample.path, allSamplesInView, e);
                                                                        }}
                                                                        className={`grid grid-cols-[22px_32px_1fr_auto_auto] sm:grid-cols-[30px_40px_1fr_auto_auto] gap-2 sm:gap-3 items-center px-2 sm:px-4 py-2 hover:bg-gray-800/80 transition-all group cursor-pointer border rounded-md ${isLocated ? 'border-synthux-orange bg-synthux-orange/10 relative z-10' : isSelected ? 'border-synthux-orange bg-synthux-orange/10 relative z-10' : 'border-transparent'}`}
                                                                        style={isLocated ? { animation: 'locatePulse 2s ease-in-out infinite' } : undefined}
                                                                    >
                                                                        <div className="flex items-center justify-center">
                                                                            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${isSelected ? 'bg-synthux-orange border-synthux-orange shadow-[0_0_8px_rgba(249,115,22,0.3)]' : 'bg-black/40 border-gray-700 group-hover:border-gray-500'}`}>
                                                                                {isSelected && <Check size={10} className="text-black stroke-[3]" />}
                                                                            </div>
                                                                        </div>

                                                                        <button
                                                                            onClick={(e) => { e.stopPropagation(); handlePlay(sample); }}
                                                                            className={`w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-full transition-all ${isPlaying && isPreviewPlaying ? 'text-black bg-synthux-yellow scale-110 shadow-lg' : 'text-gray-400 hover:text-white bg-black hover:bg-gray-700 border border-gray-700'
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

                                                                        {/*
                                                                          * Both row actions share one grid cell. Separately they were two
                                                                          * children for one `auto` column, so a source that offered both
                                                                          * pushed the import button onto a second row.
                                                                          */}
                                                                        <div className="flex items-center justify-end gap-1">
                                                                            {onEditSample && (
                                                                                <button
                                                                                    onClick={(e) => { e.stopPropagation(); handleEdit(sample); }}
                                                                                    disabled={editingSample === sample.path}
                                                                                    className="flex items-center gap-1.5 px-2 py-1.5 rounded text-xs font-bold text-gray-400 hover:text-synthux-yellow
                                                                                        hover:bg-synthux-yellow/10 transition-all disabled:opacity-70"
                                                                                    title="Edit this file. It goes into the temporary pool and opens in the editor"
                                                                                >
                                                                                    {editingSample === sample.path
                                                                                        ? <Loader size={14} className="animate-spin" />
                                                                                        : <Pencil size={14} />}
                                                                                    <span className="hidden sm:inline">Edit</span>
                                                                                </button>
                                                                            )}

                                                                            {isUserLibrarySelected && onOpenLibraryManager && (
                                                                                <button
                                                                                    onClick={(e) => { e.stopPropagation(); onOpenLibraryManager('manage', sample.path); }}
                                                                                    className="p-1.5 text-gray-500 hover:text-synthux-orange hover:bg-synthux-orange/10 rounded transition-all"
                                                                                    title="Edit in Library Manager"
                                                                                >
                                                                                    <Edit2 size={14} />
                                                                                </button>
                                                                            )}
                                                                        </div>

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
                                                                                        <Check size={14} />
                                                                                        <span className="sm:hidden">{isStandalone ? 'In pool' : 'Added'}</span>
                                                                                        <span className="hidden sm:inline">{isStandalone ? 'In pool (add again)' : 'Added (Add Again)'}</span>
                                                                                    </>
                                                                                ) : (
                                                                                    <>
                                                                                        <Download size={14} />
                                                                                        <span className="sm:hidden">{selectionMode === 'slot-selection' ? 'Assign' : 'Add'}</span>
                                                                                        <span className="hidden sm:inline">{selectionMode === 'slot-selection' ? 'Assign' : isStandalone ? 'Add to pool' : 'Add'}</span>
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
            <div className="border-t border-gray-800 bg-[#121212] flex items-center px-3 sm:px-4 py-3 gap-3 sm:gap-4 shadow-xl z-20">
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
                                    onClick={handleLocatePlaying}
                                    className="shrink-0 p-1 text-gray-500 hover:text-synthux-orange hover:bg-white/10 rounded transition-colors"
                                    title={onLocateInPool
                                        ? 'Show this file where it came from, and in the temporary pool if it is there'
                                        : 'Locate playing file'}
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
                <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] max-w-[95vw] animate-in slide-in-from-bottom-4 duration-300">
                    {/* Submenu dropdown — every target below is a project target, so standalone has none. */}
                    {showActionMenu && !isStandalone && (
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
                                onClick={() => handleBulkActionWithTarget(isStandalone ? 'pool' : 'slots')}
                                className="bg-synthux-orange hover:bg-synthux-orange/80 text-black py-2 px-6 rounded-full font-bold text-xs flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-synthux-orange/20"
                            >
                                <Plus size={14} /> {isStandalone ? 'Add to pool' : 'Import Selection'}
                            </button>

                            {!isStandalone && (
                                <button
                                    onClick={() => setShowActionMenu(!showActionMenu)}
                                    className={`w-10 h-10 rounded-full flex items-center justify-center border transition-all ${showActionMenu ? 'bg-synthux-orange border-synthux-orange text-black' : 'bg-black/60 border-white/10 text-gray-400 hover:border-white/30 hover:text-white'}`}
                                >
                                    <ChevronDown size={20} className={`transition-transform duration-300 ${showActionMenu ? 'rotate-180' : ''}`} />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
