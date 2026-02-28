import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    FolderOpen,
    Search,
    ChevronRight,
    ChevronDown,
    Play,
    Pause,
    Plus,
    Check,
    Loader,
    Info,
    Copy,
    X,
    Clock,
    Layers,
    Skull,
    ChevronUp,
    HardDrive
} from 'lucide-react';
import type { TapeColor } from '../types';

interface LocalFolderBrowserProps {
    rootHandle: FileSystemDirectoryHandle;
    rootName: string;
    onImport: (file: File, path: string) => Promise<void>;
    onBulkImport?: (files: { file: File, path: string }[]) => Promise<void>;
    onPreview: (file: File, name: string, filePath?: string) => void;
    onCloseFolder?: () => void;
    playingFileId?: string;
    isPreviewPlaying?: boolean;
    importingFileId?: string;
    addedFileIds?: Set<string>;
    mode?: 'add' | 'import'; // 'add' for project, 'import' for library
    bulkActionLabel?: string;
    // Tape-targeting support
    availableTapeColors?: TapeColor[];
    onImportToTape?: (files: { file: File, path: string }[], targetTape: TapeColor) => Promise<void>;
    onImportToPool?: (files: { file: File, path: string }[]) => Promise<void>;
    // Locate playing file
    locateFilePath?: string | null;
    onLocateHandled?: () => void;
}

interface FolderNode {
    handle: FileSystemDirectoryHandle;
    name: string;
    path: string;
    children: (FolderNode | FileEntry)[];
    isOpen: boolean;
    isLoading: boolean;
}

interface FileEntry {
    handle: FileSystemFileHandle;
    name: string;
    path: string;
    kind: 'file';
    size?: number;
}

const formatFileSize = (bytes?: number): string => {
    if (bytes === undefined || bytes === null) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const LocalFolderBrowser = ({
    rootHandle,
    rootName,
    onImport,
    onBulkImport,
    onPreview,
    onCloseFolder,
    playingFileId,
    isPreviewPlaying,
    importingFileId,
    addedFileIds = new Set(),
    mode = 'add',
    bulkActionLabel,
    availableTapeColors,
    onImportToTape,
    onImportToPool,
    locateFilePath,
    onLocateHandled
}: LocalFolderBrowserProps) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedFolderPath, setSelectedFolderPath] = useState<string>('');
    const selectedFolderHandleRef = useRef<FileSystemDirectoryHandle>(rootHandle);
    const [folderTree, setFolderTree] = useState<FolderNode | null>(null);
    const [currentFiles, setCurrentFiles] = useState<FileEntry[]>([]);

    // Selection State
    const [selectedFilePaths, setSelectedFilePaths] = useState<Set<string>>(new Set());
    const [lastSelectedPath, setLastSelectedPath] = useState<string | null>(null);
    const [isBulkImporting, setIsBulkImporting] = useState(false);

    // Filter & Search Enhanced State
    const [searchSubfolders, setSearchSubfolders] = useState(false);
    const [minDuration, setMinDuration] = useState<string>('');
    const [maxDuration, setMaxDuration] = useState<string>('');
    const [isCrawling, setIsCrawling] = useState(false);
    const [recursiveFiles, setRecursiveFiles] = useState<FileEntry[]>([]);
    const [cachedDurations, setCachedDurations] = useState<Record<string, number>>({});
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [showActionMenu, setShowActionMenu] = useState(false);
    const [locatedFilePath, setLocatedFilePath] = useState<string | null>(null);
    const fileListRef = useRef<HTMLDivElement>(null);

    // Initialize tree
    useEffect(() => {
        setFolderTree({
            handle: rootHandle,
            name: rootName,
            path: rootName,
            children: [],
            isOpen: true,
            isLoading: false
        });
        setSelectedFolderPath(rootName);
        selectedFolderHandleRef.current = rootHandle;
    }, [rootHandle, rootName]);

    const loadFolderContents = useCallback(async (node: FolderNode): Promise<(FolderNode | FileEntry)[]> => {
        const children: (FolderNode | FileEntry)[] = [];
        for await (const entry of (node.handle as any).values()) {
            // Filter macOS metadata
            if (entry.name === '__MACOSX' || entry.name.startsWith('._')) continue;

            const entryPath = `${node.path}/${entry.name}`;
            if (entry.kind === 'directory') {
                children.push({
                    handle: entry as FileSystemDirectoryHandle,
                    name: entry.name,
                    path: entryPath,
                    children: [],
                    isOpen: false,
                    isLoading: false
                });
            } else if (entry.kind === 'file') {
                const name = entry.name.toLowerCase();
                if (name.endsWith('.wav') || name.endsWith('.mp3') || name.endsWith('.flac') || name.endsWith('.ogg')) {
                    let fileSize: number | undefined;
                    try {
                        const file = await (entry as FileSystemFileHandle).getFile();
                        fileSize = file.size;
                    } catch { /* ignore */ }
                    children.push({
                        handle: entry as FileSystemFileHandle,
                        name: entry.name,
                        path: entryPath,
                        kind: 'file',
                        size: fileSize
                    });
                }
            }
        }
        return children.sort((a, b) => {
            // Folders first, then alphabetical
            if ('children' in a && !('children' in b)) return -1;
            if (!('children' in a) && 'children' in b) return 1;
            return a.name.localeCompare(b.name);
        });
    }, []);

    // Load root contents initially
    useEffect(() => {
        if (folderTree && folderTree.children.length === 0 && !folderTree.isLoading) {
            const init = async () => {
                const children = await loadFolderContents(folderTree);
                setFolderTree(prev => prev ? { ...prev, children } : null);
                setCurrentFiles(children.filter(c => !('children' in c)) as FileEntry[]);
            };
            init();
        }
    }, [folderTree, loadFolderContents]);

    const toggleFolder = async (path: string) => {
        const updateNode = async (node: FolderNode): Promise<FolderNode> => {
            if (node.path === path) {
                const nextOpen = !node.isOpen;
                let nextChildren = node.children;
                if (nextOpen && nextChildren.length === 0) {
                    node.isLoading = true;
                    setFolderTree(prev => prev ? { ...prev } : null); // Trigger re-render for loader
                    nextChildren = await loadFolderContents(node);
                }
                return { ...node, isOpen: nextOpen, children: nextChildren, isLoading: false };
            }
            if (node.children) {
                const nextChildren = await Promise.all(node.children.map(async child => {
                    if ('children' in child) return await updateNode(child);
                    return child;
                }));
                return { ...node, children: nextChildren };
            }
            return node;
        };

        if (folderTree) {
            const nextTree = await updateNode(folderTree);
            setFolderTree(nextTree);
            setSelectedFolderPath(path);

            // Update current files view
            const findNode = (node: FolderNode): FolderNode | null => {
                if (node.path === path) return node;
                for (const child of node.children) {
                    if ('children' in child) {
                        const found = findNode(child);
                        if (found) return found;
                    }
                }
                return null;
            };

            const targetNode = findNode(nextTree);
            if (targetNode) {
                selectedFolderHandleRef.current = targetNode.handle;
                setCurrentFiles(targetNode.children.filter(c => !('children' in c)) as FileEntry[]);
                setSelectedFilePaths(new Set()); // Reset selection when changing folder
                setLastSelectedPath(null);
            }
        }
    };

    const crawlRecursive = useCallback(async (handle: FileSystemDirectoryHandle, currentPath: string, depth = 0): Promise<FileEntry[]> => {
        // Safety: Limit depth and count
        if (depth > 12) return [];

        let results: FileEntry[] = [];
        try {
            for await (const entry of (handle as any).values()) {
                // Filter macOS metadata
                if (entry.name === '__MACOSX' || entry.name.startsWith('._')) continue;

                const entryPath = `${currentPath}/${entry.name}`;
                if (entry.kind === 'directory') {
                    const subResults = await crawlRecursive(entry as FileSystemDirectoryHandle, entryPath, depth + 1);
                    results = [...results, ...subResults];
                } else if (entry.kind === 'file') {
                    const name = entry.name.toLowerCase();
                    if (name.endsWith('.wav') || name.endsWith('.mp3') || name.endsWith('.flac') || name.endsWith('.ogg')) {
                        results.push({
                            handle: entry as FileSystemFileHandle,
                            name: entry.name,
                            path: entryPath,
                            kind: 'file'
                        });
                    }
                }
                // Safety: Limit total files to prevent memory issues
                if (results.length > 3000) break;
            }
        } catch (err) {
            console.warn('Crawl error at', currentPath, err);
        }
        return results;
    }, []);

    useEffect(() => {
        if (searchSubfolders) {
            const handle = selectedFolderHandleRef.current;
            const path = selectedFolderPath || rootName;

            setIsCrawling(true);
            crawlRecursive(handle, path)
                .then(files => {
                    setRecursiveFiles(files);
                    setIsCrawling(false);
                })
                .catch(err => {
                    console.error('Recursive crawl failed', err);
                    setIsCrawling(false);
                });
        }
    }, [searchSubfolders, selectedFolderPath, rootName, crawlRecursive]);

    const getAudioDuration = async (file: File, path: string): Promise<number> => {
        if (cachedDurations[path] !== undefined) return cachedDurations[path];

        return new Promise((resolve) => {
            const audio = new Audio();
            const url = URL.createObjectURL(file);
            audio.src = url;
            audio.addEventListener('loadedmetadata', () => {
                const dur = audio.duration;
                URL.revokeObjectURL(url);
                setCachedDurations(prev => ({ ...prev, [path]: dur }));
                resolve(dur);
            });
            audio.addEventListener('error', () => {
                URL.revokeObjectURL(url);
                resolve(0);
            });
            // Timeout if it takes too long
            setTimeout(() => {
                URL.revokeObjectURL(url);
                resolve(0);
            }, 2000);
        });
    };

    const toggleFileSelection = (path: string, event?: React.MouseEvent) => {
        const newSelection = new Set(selectedFilePaths);

        if (event?.shiftKey && lastSelectedPath) {
            const currentIndex = currentFiles.findIndex(f => f.path === path);
            const lastIndex = currentFiles.findIndex(f => f.path === lastSelectedPath);

            if (currentIndex !== -1 && lastIndex !== -1) {
                const start = Math.min(currentIndex, lastIndex);
                const end = Math.max(currentIndex, lastIndex);

                for (let i = start; i <= end; i++) {
                    newSelection.add(currentFiles[i].path);
                }
            }
        } else {
            if (newSelection.has(path)) {
                newSelection.delete(path);
            } else {
                newSelection.add(path);
            }
        }

        setSelectedFilePaths(newSelection);
        setLastSelectedPath(path);
    };

    const handleBulkAction = async () => {
        if (!onBulkImport || selectedFilePaths.size === 0) return;

        setIsBulkImporting(true);
        try {
            const filesToImport = await Promise.all(
                Array.from(selectedFilePaths).map(async path => {
                    const entry = currentFiles.find(f => f.path === path);
                    if (entry) {
                        const file = await entry.handle.getFile();
                        return { file, path };
                    }
                    return null;
                })
            );

            const validFiles = filesToImport.filter((f): f is { file: File, path: string } => f !== null);
            await onBulkImport(validFiles);
            setSelectedFilePaths(new Set());
        } catch (e) {
            console.error('Bulk import failed', e);
        } finally {
            setIsBulkImporting(false);
        }
    };

    const handleCopyPath = (file: FileEntry) => {
        // Copy the full relative path from root
        navigator.clipboard.writeText(file.path);
    };

    // Handle targeted tape import from submenu
    const handleActionWithTarget = async (target: 'slot' | 'pool' | TapeColor) => {
        setShowActionMenu(false);
        if (selectedFilePaths.size === 0) return;

        const filesToImport = await Promise.all(
            Array.from(selectedFilePaths).map(async path => {
                const entry = (searchSubfolders ? recursiveFiles : currentFiles).find(f => f.path === path);
                if (entry) {
                    const file = await entry.handle.getFile();
                    return { file, path };
                }
                return null;
            })
        );
        const validFiles = filesToImport.filter((f): f is { file: File, path: string } => f !== null);
        if (validFiles.length === 0) return;

        if (target === 'slot') {
            // Default behavior - use onBulkImport or onImport
            if (onBulkImport) {
                setIsBulkImporting(true);
                try {
                    await onBulkImport(validFiles);
                    setSelectedFilePaths(new Set());
                } finally {
                    setIsBulkImporting(false);
                }
            }
        } else if (target === 'pool' && onImportToPool) {
            setIsBulkImporting(true);
            try {
                await onImportToPool(validFiles);
                setSelectedFilePaths(new Set());
            } finally {
                setIsBulkImporting(false);
            }
        } else if (onImportToTape) {
            // target is a TapeColor
            setIsBulkImporting(true);
            try {
                await onImportToTape(validFiles, target as TapeColor);
                setSelectedFilePaths(new Set());
            } finally {
                setIsBulkImporting(false);
            }
        }
    };

    // Locate file: scroll to it when locateFilePath changes
    useEffect(() => {
        if (!locateFilePath) return;

        // Extract folder path from the file path to navigate there
        const lastSlash = locateFilePath.lastIndexOf('/');
        const folderPath = lastSlash > 0 ? locateFilePath.substring(0, lastSlash) : rootName;

        // Navigate to the folder if we're not already there
        if (selectedFolderPath !== folderPath && folderTree) {
            const findAndOpen = async (node: FolderNode, targetPath: string): Promise<boolean> => {
                if (node.path === targetPath) {
                    await toggleFolder(node.path);
                    return true;
                }
                if (targetPath.startsWith(node.path + '/')) {
                    if (!node.isOpen) {
                        await toggleFolder(node.path);
                    }
                    for (const child of node.children) {
                        if ('children' in child) {
                            const found = await findAndOpen(child, targetPath);
                            if (found) return true;
                        }
                    }
                }
                return false;
            };

            findAndOpen(folderTree, folderPath);
        }

        // Set persistent highlight and scroll after folder navigation settles
        setLocatedFilePath(locateFilePath);

        const timer = setTimeout(() => {
            if (!fileListRef.current) return;
            const fileEl = fileListRef.current.querySelector(`[data-file-path="${CSS.escape(locateFilePath)}"]`);
            if (fileEl) {
                fileEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            onLocateHandled?.();
        }, 300);

        return () => clearTimeout(timer);
    }, [locateFilePath]);

    const renderTree = (node: FolderNode, depth = 0) => {
        return (
            <div key={node.path} className="select-none">
                <div
                    onClick={() => toggleFolder(node.path)}
                    className={`flex items-center gap-1 py-1 px-2 rounded cursor-pointer transition-colors ${selectedFolderPath === node.path ? 'bg-synthux-orange/10 text-synthux-orange' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}`}
                    style={{ paddingLeft: `${depth * 12 + 8}px` }}
                >
                    {node.isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <FolderOpen size={14} className={node.isOpen ? 'text-synthux-orange' : 'text-gray-500'} />
                    <span className="text-xs truncate">{node.name}</span>
                    {node.isLoading && <Loader size={10} className="animate-spin ml-auto" />}
                </div>
                {node.isOpen && node.children.length > 0 && (
                    <div className="mt-0.5">
                        {node.children.map(child => {
                            if ('children' in child) return renderTree(child, depth + 1);
                            return null;
                        })}
                    </div>
                )}
            </div>
        );
    };

    const filteredFiles = useMemo(() => {
        const baseFiles = searchSubfolders ? recursiveFiles : currentFiles;
        return baseFiles.filter(f => {
            const matchesSearch = f.name.toLowerCase().includes(searchQuery.toLowerCase());
            if (!matchesSearch) return false;

            // Apply duration filters if set
            const duration = cachedDurations[f.path];
            const min = minDuration ? parseFloat(minDuration) : 0;
            const max = maxDuration ? parseFloat(maxDuration) : Infinity;

            if (duration !== undefined) {
                if (duration < min) return false;
                if (max !== Infinity && duration > max) return false;
            }

            return true;
        });
    }, [searchSubfolders, recursiveFiles, currentFiles, searchQuery, cachedDurations, minDuration, maxDuration]);

    // Safety: Limit number of results displayed to prevent DOM-induced crashes
    const displayFiles = useMemo(() => filteredFiles.slice(0, 300), [filteredFiles]);

    // Effect to trigger duration loading for visible/filtered items (lazy + debounced)
    useEffect(() => {
        if (!minDuration && !maxDuration) return;

        const timer = setTimeout(() => {
            const toLoad = displayFiles.filter(f => cachedDurations[f.path] === undefined).slice(0, 5);
            if (toLoad.length > 0) {
                Promise.all(toLoad.map(async f => {
                    try {
                        const file = await f.handle.getFile();
                        await getAudioDuration(file, f.path);
                    } catch (e) {
                        setCachedDurations(prev => ({ ...prev, [f.path]: 0 }));
                    }
                }));
            }
        }, 800);

        return () => clearTimeout(timer);
    }, [displayFiles, minDuration, maxDuration, cachedDurations]);

    return (
        <div className="flex flex-col h-full bg-synthux-main overflow-hidden text-gray-300 font-sans relative">
            {/* Header Area */}
            <div className="p-4 border-b border-gray-800 bg-synthux-panel/50 backdrop-blur-sm">
                <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            {onCloseFolder && (
                                <button
                                    onClick={onCloseFolder}
                                    className="text-xs text-synthux-blue hover:underline font-bold mr-2"
                                >
                                    Back
                                </button>
                            )}
                            <div className="w-10 h-10 rounded-lg bg-synthux-orange/20 flex items-center justify-center text-synthux-orange border border-synthux-orange/30">
                                <FolderOpen size={20} />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-white tracking-tight">Local Folder: {rootName}</h2>
                                <p className="text-[10px] text-gray-500 font-mono uppercase tracking-widest">
                                    {searchSubfolders ? 'Recursive View' : 'Folder View'}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 flex-1 max-w-xl">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder={searchSubfolders ? "Search all subfolders..." : "Search files in active folder..."}
                                    className="w-full bg-black/40 border border-gray-700 rounded-full py-1.5 pl-9 pr-10 text-xs focus:outline-none focus:border-synthux-orange/50 transition-all"
                                />
                                {searchQuery && (
                                    <button
                                        onClick={() => setSearchQuery('')}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                            </div>

                            <button
                                onClick={() => setSearchSubfolders(!searchSubfolders)}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-bold transition-all ${searchSubfolders ? 'bg-synthux-orange border-synthux-orange text-black' : 'bg-black/40 border-gray-700 text-gray-400 hover:border-gray-500'}`}
                                title="Recursive Search"
                            >
                                <Layers size={14} />
                                <span className="hidden sm:inline">Recursive</span>
                                {isCrawling && <Loader size={12} className="animate-spin" />}
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-synthux-blue/5 border border-synthux-blue/20 rounded-lg text-[10px] text-synthux-blue/80">
                        <div className="flex items-center gap-2">
                            <Info size={12} />
                            <p>Files added from local folders are COPIED into the project workspace. To add to Curated Library, use the Library Manager.</p>
                        </div>
                        <button
                            onClick={() => {
                                const nextShow = !showAdvanced;
                                setShowAdvanced(nextShow);
                                if (!nextShow) {
                                    setMinDuration('');
                                    setMaxDuration('');
                                }
                            }}
                            className={`flex items-center gap-1.5 px-2 py-0.5 rounded transition-colors ${showAdvanced ? 'bg-synthux-orange/20 text-synthux-orange' : 'hover:bg-white/5 text-gray-400'}`}
                        >
                            <span className="font-bold uppercase tracking-wider text-[9px]">Advanced</span>
                            {showAdvanced ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                        </button>
                    </div>

                    {showAdvanced && (
                        <div className="flex flex-col gap-3 p-3 bg-red-500/5 border border-red-500/20 rounded-lg animate-in fade-in slide-in-from-top-2 duration-200">
                            <div className="flex items-start gap-3">
                                <div className="p-2 rounded-full bg-red-500/20 text-red-500 shrink-0">
                                    <Skull size={16} />
                                </div>
                                <div className="space-y-1">
                                    <h4 className="text-[10px] font-bold text-red-400 uppercase tracking-widest">Performance Warning</h4>
                                    <p className="text-[10px] text-gray-400 leading-relaxed">
                                        Calculating durations and recursive crawling are resource-intensive. Deep folder structures (max depth: 12) or large collections (crawling max: 3000 files) may impact application responsiveness depending on your system's power.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-4 pt-2 border-t border-red-500/10">
                                <span className="text-[9px] font-bold text-gray-500 uppercase">Duration Filters:</span>
                                <div className="flex items-center gap-2 bg-black/40 border border-gray-700 rounded-full px-3 py-1">
                                    <Clock size={12} className="text-gray-500" />
                                    <input
                                        type="number"
                                        value={minDuration}
                                        onChange={e => setMinDuration(e.target.value)}
                                        placeholder="Min"
                                        className="w-10 bg-transparent text-[10px] outline-none text-white font-mono"
                                        title="Min duration (sec)"
                                    />
                                    <span className="text-gray-600">-</span>
                                    <input
                                        type="number"
                                        value={maxDuration}
                                        onChange={e => setMaxDuration(e.target.value)}
                                        placeholder="Max"
                                        className="w-10 bg-transparent text-[10px] outline-none text-white font-mono"
                                        title="Max duration (sec)"
                                    />
                                    <span className="text-[9px] text-gray-600 font-bold uppercase ml-1">sec</span>
                                </div>
                                <div className="ml-auto text-[9px] text-gray-500 font-mono italic">
                                    Max display limit: 300 files
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Main Content Pane */}
            <div className="flex-1 flex overflow-hidden min-h-0">
                {/* Left: Folder Tree */}
                <div className="w-64 border-r border-gray-800 h-full flex flex-col bg-synthux-browsebg/30">
                    <div className="p-2 overflow-y-auto flex-1">
                        {folderTree ? renderTree(folderTree) : (
                            <div className="flex items-center justify-center h-full">
                                <Loader className="animate-spin text-synthux-orange" size={20} />
                            </div>
                        )}
                    </div>
                </div>

                {/* Right: File Content */}
                <div className="flex-1 flex flex-col overflow-hidden relative">
                    {/* Grid/List Header */}
                    <div className="px-6 py-2 border-b border-gray-800/50 bg-black/10 flex items-center justify-between text-[10px] uppercase font-bold text-gray-500 tracking-wider">
                        <span>File Name</span>
                        <span>Actions</span>
                    </div>

                    <div ref={fileListRef} className="flex-1 overflow-y-auto p-4 space-y-1 custom-scrollbar">
                        {filteredFiles.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-gray-600 opacity-50 space-y-2">
                                <FolderOpen size={48} />
                                <p className="text-sm font-mono">No audio files found in this folder.</p>
                            </div>
                        ) : (
                            <>
                                {displayFiles.map(file => {
                                    const isPlaying = playingFileId === file.path;
                                    const isAdded = addedFileIds.has(file.path);
                                    const isImporting = importingFileId === file.path;
                                    const isLocated = locatedFilePath === file.path;

                                    return (
                                        <div
                                            key={file.path}
                                            data-file-path={file.path}
                                            onClick={(e) => {
                                                setLocatedFilePath(null);
                                                toggleFileSelection(file.path, e);
                                            }}
                                            className={`group grid grid-cols-[auto_1fr_auto] gap-4 items-center px-4 py-2 hover:bg-white/5 rounded-lg border-2 transition-all cursor-pointer ${isLocated ? 'border-synthux-orange bg-synthux-orange/5' : isAdded ? 'bg-synthux-yellow/5 border-synthux-yellow/20' : selectedFilePaths.has(file.path) ? 'bg-synthux-orange/10 border-synthux-orange/30' : 'border-transparent hover:border-white/10'}`}
                                            style={isLocated ? {
                                                animation: 'locatePulse 2s ease-in-out infinite'
                                            } : undefined}
                                        >
                                            <div className="flex items-center">
                                                <div
                                                    className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${selectedFilePaths.has(file.path) ? 'bg-synthux-orange border-synthux-orange' : 'bg-black/40 border-gray-700 group-hover:border-gray-500'}`}
                                                >
                                                    {selectedFilePaths.has(file.path) && <Check size={10} className="text-black stroke-[3]" />}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <button
                                                    onClick={async (e) => {
                                                        e.stopPropagation();
                                                        setLocatedFilePath(null);
                                                        const f = await file.handle.getFile();
                                                        onPreview(f, file.name, file.path);
                                                    }}
                                                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isPlaying && isPreviewPlaying ? 'bg-synthux-orange text-black shadow-lg scale-105' : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'}`}
                                                >
                                                    {isPlaying && isPreviewPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-0.5" />}
                                                </button>
                                                <div className="flex flex-col min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-medium text-gray-200 truncate group-hover:text-white transition-colors">{file.name}</span>
                                                        {isAdded && <span className="shrink-0 text-[8px] font-bold bg-synthux-yellow/20 text-synthux-yellow px-1.5 py-0.5 rounded-full uppercase tracking-wider">Added</span>}
                                                    </div>
                                                    <div className="flex items-center gap-2 text-[9px] text-gray-600 truncate font-mono">
                                                        {file.size !== undefined && (
                                                            <span className="text-gray-500 flex items-center gap-0.5">
                                                                <HardDrive size={8} className="opacity-50" />
                                                                {formatFileSize(file.size)}
                                                            </span>
                                                        )}
                                                        {cachedDurations[file.path] !== undefined && (
                                                            <span className="text-synthux-orange/70 font-bold">
                                                                {Math.round(cachedDurations[file.path] * 10) / 10}s
                                                            </span>
                                                        )}
                                                        <span className="truncate">{file.path}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleCopyPath(file);
                                                    }}
                                                    className="p-1.5 text-gray-500 hover:text-white hover:bg-white/10 rounded transition-colors"
                                                    title="Copy Path"
                                                >
                                                    <Copy size={14} />
                                                </button>

                                                <button
                                                    onClick={async (e) => {
                                                        e.stopPropagation();
                                                        const f = await file.handle.getFile();
                                                        onImport(f, file.path);
                                                    }}
                                                    disabled={isImporting || isAdded}
                                                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-bold transition-all ${isAdded
                                                        ? 'bg-synthux-yellow/20 text-synthux-yellow cursor-default'
                                                        : 'bg-synthux-orange/20 text-synthux-orange border border-synthux-orange/30 hover:bg-synthux-orange hover:text-white'}`}
                                                >
                                                    {isImporting ? <Loader size={12} className="animate-spin" /> : isAdded ? <Check size={12} /> : <Plus size={12} />}
                                                    {isAdded ? 'Added' : 'Add'}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                                {filteredFiles.length > displayFiles.length && (
                                    <div className="p-4 text-center text-[10px] text-gray-500 font-mono uppercase tracking-widest border border-dashed border-gray-800 rounded-lg">
                                        Showing top 300 results. Refine your search to find more.
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                </div>
            </div>

            {/* Bulk Action Sticky Bar with Submenu — overlays entire component */}
            {selectedFilePaths.size > 0 && (
                <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 duration-300">
                    {/* Submenu dropdown (appears above) */}
                    {showActionMenu && (
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-[#1a1a1a] border border-gray-700 rounded-xl shadow-2xl py-2 min-w-[220px] animate-in fade-in slide-in-from-bottom-2 duration-200">
                            <div className="px-3 py-1.5 text-[9px] font-bold text-gray-500 uppercase tracking-widest">Import Target</div>
                            <button
                                onClick={() => handleActionWithTarget('slot')}
                                className="w-full text-left px-4 py-2 text-xs text-gray-300 hover:bg-synthux-orange/10 hover:text-synthux-orange transition-colors flex items-center gap-2"
                            >
                                <Plus size={12} /> Add to Slot / Active Tape
                            </button>
                            {onImportToPool && (
                                <button
                                    onClick={() => handleActionWithTarget('pool')}
                                    className="w-full text-left px-4 py-2 text-xs text-gray-300 hover:bg-synthux-blue/10 hover:text-synthux-blue transition-colors flex items-center gap-2"
                                >
                                    <Layers size={12} /> Add all to Pool
                                </button>
                            )}
                            {availableTapeColors && availableTapeColors.length > 0 && onImportToTape && (
                                <>
                                    <div className="h-px bg-gray-800 my-1" />
                                    <div className="px-3 py-1.5 text-[9px] font-bold text-gray-500 uppercase tracking-widest">Target Tape</div>
                                    {availableTapeColors.map(color => (
                                        <button
                                            key={color}
                                            onClick={() => handleActionWithTarget(color)}
                                            className="w-full text-left px-4 py-2 text-xs text-gray-300 hover:bg-white/5 transition-colors flex items-center gap-2"
                                        >
                                            <div className={`w-2.5 h-2.5 rounded-full`} style={{ backgroundColor: `var(--color-synthux-${color.toLowerCase()})` }} />
                                            Tape {color}
                                        </button>
                                    ))}
                                </>
                            )}
                        </div>
                    )}

                    {/* Main bar */}
                    <div className="bg-[#151515] border border-synthux-orange/50 px-5 py-2.5 rounded-full shadow-2xl flex items-center gap-4">
                        <span className="text-xs font-bold text-white whitespace-nowrap">
                            {selectedFilePaths.size} file{selectedFilePaths.size !== 1 ? 's' : ''}
                        </span>
                        <div className="w-px h-4 bg-gray-800" />
                        <div className="flex items-center gap-1.5">
                            <button
                                onClick={() => setSelectedFilePaths(new Set())}
                                className="text-[10px] font-bold text-gray-400 hover:text-white transition-colors px-2 py-1"
                            >
                                Clear
                            </button>
                            <button
                                onClick={handleBulkAction}
                                disabled={isBulkImporting}
                                className="px-4 py-1.5 bg-synthux-orange text-black rounded-full font-bold text-[10px] hover:bg-white transition-colors flex items-center gap-1.5"
                            >
                                {isBulkImporting ? <Loader size={12} className="animate-spin" /> : <Plus size={12} />}
                                {bulkActionLabel || (mode === 'import' ? 'Import' : 'Add to Slot')}
                            </button>
                            <button
                                onClick={() => setShowActionMenu(!showActionMenu)}
                                className={`p-1.5 rounded-full transition-all ${showActionMenu ? 'bg-synthux-orange text-black' : 'bg-white/10 text-gray-400 hover:text-white hover:bg-white/20'}`}
                                title="More import options"
                            >
                                <ChevronUp size={14} className={`transition-transform duration-200 ${showActionMenu ? 'rotate-180' : ''}`} />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
