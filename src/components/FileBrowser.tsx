import { useState, useRef, useEffect, useMemo } from 'react';
import { FileAudio, GripVertical, ChevronDown, ChevronRight, Play, Square, List, LayoutList, FolderOpen, Download, Trash2, X, Check, ArrowRightToLine, ArrowDownAZ, ArrowUpAZ, Palette, ListOrdered } from 'lucide-react';
import type { FileRecord, AppState } from '../types';
import { TAPE_COLORS } from '../types';
import { useAudioPlayer } from '../contexts/AudioPlayerContext';
import { appStorage } from '../utils/storageNamespace';
import { Dropdown } from './Dropdown';

// ─── Registry sorting ─────────────────────────────────────────────────────────
//
// One order governs both lists. `custom` is the registry's own order — the order
// files arrived in — and is the default, so nothing reorders itself until asked.
type SortMode = 'abc' | 'tape' | 'custom';
type SortDir = 'asc' | 'desc';

const SORT_KEY = 'spotykach_registry_sort';

const SORT_LABELS: Record<SortMode, string> = {
    abc: 'A–Z',
    tape: 'By tape',
    custom: 'As added',
};

/** The remembered sort, or the default when nothing valid is stored. */
const readStoredSort = (): { mode: SortMode; dir: SortDir } => {
    const fallback = { mode: 'custom' as SortMode, dir: 'asc' as SortDir };
    try {
        const raw = appStorage.getItem(SORT_KEY);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw);
        return {
            mode: parsed.mode in SORT_LABELS ? parsed.mode : fallback.mode,
            dir: parsed.dir === 'desc' ? 'desc' : 'asc',
        };
    } catch {
        return fallback;
    }
};

// Digits collate before letters and `numeric` puts 10 after 2, so one call covers
// both halves of "numbers first, then A–Z".
const byName = (a: FileRecord, b: FileRecord) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });

interface FileBrowserProps {
    files: FileRecord[];
    tapes: AppState['tapes'];

    onParkRequest: (fileId: string) => void;
    onOpenSampleBrowser: () => void;
    duplicates: Set<string>;
    onOpenDuplicateModal: () => void;
    onUnassignFile?: (fileId: string) => void;
    onBulkUnassign?: (fileIds: string[]) => void;
    onDeleteFile?: (fileId: string) => void;
    onBulkDeleteFiles?: (fileIds: string[]) => void;
    onFillFreeSlots?: (fileIds: string[]) => void;
    onRenameFile?: (fileId: string, newName: string) => void;
    currentProjectName?: string;
    workFolderName?: string;
}
export const FileBrowser = ({ 
    files, 
    tapes, 
    onParkRequest, 
    onOpenSampleBrowser, 
    duplicates, 
    onOpenDuplicateModal, 
    onUnassignFile, 
    onBulkUnassign, 
    onDeleteFile, 
    onBulkDeleteFiles, 
    onFillFreeSlots, 
    onRenameFile,
    currentProjectName,
    workFolderName
}: FileBrowserProps) => {
    const [isAssignedOpen, setAssignedOpen] = useState(true);
    const [isUnassignedOpen, setUnassignedOpen] = useState(true);
    const [isMinified, setIsMinified] = useState(false);
    const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
    const [lastSelectedId, setLastSelectedId] = useState<string | null>(null); // Focus/Last Interacted
    const [anchorId, setAnchorId] = useState<string | null>(null); // Start of Range Selection
    const [sort, setSort] = useState(readStoredSort);

    const [width, setWidth] = useState(288);
    const isDraggingRef = useRef(false);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDraggingRef.current) return;
            e.preventDefault();
            const newWidth = Math.max(288, Math.min(e.clientX, window.innerWidth * 0.75));
            setWidth(newWidth);
        };

        const handleMouseUp = () => {
            if (isDraggingRef.current) {
                isDraggingRef.current = false;
                document.body.style.cursor = '';
            }
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    const handleDragResizeStart = (e: React.MouseEvent) => {
        isDraggingRef.current = true;
        document.body.style.cursor = 'col-resize';
        e.preventDefault();
    };

    // Where each assigned file sits, looked up once per tape change rather than
    // once per row: the label the row shows, and the rank "By tape" sorts on.
    // Slots run 1–6, so `tape * 10 + slot` orders tape-then-slot in one number.
    const slotIndex = useMemo(() => {
        const index = new Map<string, { label: string; rank: number }>();
        TAPE_COLORS.forEach((color, i) => {
            tapes[color]?.slots.forEach(slot => {
                // First placement wins, as the old per-row scan did: a file sitting
                // on two tapes keeps naming the earlier one.
                if (slot.fileId && !index.has(slot.fileId)) {
                    index.set(slot.fileId, { label: `${color} ${slot.id}`, rank: i * 10 + slot.id });
                }
            });
        });
        return index;
    }, [tapes]);

    const UNPLACED_RANK = TAPE_COLORS.length * 10 + 10; // Below every tape, above nothing.

    const applySort = (list: FileRecord[]): FileRecord[] => {
        // "As added" is the list exactly as the registry holds it — reversing is
        // the only thing sorting does to it.
        if (sort.mode === 'custom') return sort.dir === 'asc' ? list : [...list].reverse();

        const sorted = [...list].sort((a, b) => {
            if (sort.mode === 'tape') {
                const ra = slotIndex.get(a.id)?.rank ?? UNPLACED_RANK;
                const rb = slotIndex.get(b.id)?.rank ?? UNPLACED_RANK;
                // Two files can't share a slot, so this only ties in the pool —
                // where nothing has a tape and A–Z decides the whole list.
                if (ra !== rb) return ra - rb;
            }
            return byName(a, b);
        });
        return sort.dir === 'asc' ? sorted : sorted.reverse();
    };

    const chooseSortMode = (mode: SortMode) => {
        const next = { ...sort, mode };
        setSort(next);
        appStorage.setItem(SORT_KEY, JSON.stringify(next));
    };

    const toggleSortDir = () => {
        const next = { ...sort, dir: sort.dir === 'asc' ? 'desc' as const : 'asc' as const };
        setSort(next);
        appStorage.setItem(SORT_KEY, JSON.stringify(next));
    };

    // Helpers to get all visible files in order
    const getVisibleFiles = () => {
        // Shift-ranges and arrow keys have to follow what the eye sees, so this is
        // the sorted lists concatenated in the order the sections appear:
        // Assigned first, then Project Pool (Unassigned).
        return [...assignedFiles, ...unassignedFiles];
    };

    const handleSelectionClick = (fileId: string, e: React.MouseEvent) => {
        e.stopPropagation();

        const visibleFiles = getVisibleFiles();
        const newSet = new Set(selectedFileIds);

        if (e.shiftKey && anchorId) {
            // Range Selection
            const startIdx = visibleFiles.findIndex(f => f.id === anchorId);
            const endIdx = visibleFiles.findIndex(f => f.id === fileId);

            if (startIdx !== -1 && endIdx !== -1) {
                const low = Math.min(startIdx, endIdx);
                const high = Math.max(startIdx, endIdx);

                if (!e.ctrlKey && !e.metaKey) {
                    newSet.clear();
                }

                for (let i = low; i <= high; i++) {
                    newSet.add(visibleFiles[i].id);
                }
                setLastSelectedId(fileId); // Move focus
            }
        } else if (e.ctrlKey || e.metaKey) {
            // Toggle Selection
            if (newSet.has(fileId)) {
                newSet.delete(fileId);
            } else {
                newSet.add(fileId);
                setLastSelectedId(fileId);
                setAnchorId(fileId);
            }
        } else {
            // Single Selection
            newSet.clear();
            newSet.add(fileId);
            setLastSelectedId(fileId);
            setAnchorId(fileId);
        }

        setSelectedFileIds(newSet);
    };

    const toggleSelection = (id: string) => {
        // This is the Checkbox/Touch toggler (mimics Ctrl+Click)
        const newSet = new Set(selectedFileIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
            setLastSelectedId(id);
            setAnchorId(id);
        }
        setSelectedFileIds(newSet);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();

        const visibleFiles = getVisibleFiles();
        if (visibleFiles.length === 0) return;

        let nextIndex = 0;
        if (lastSelectedId) {
            const currentIdx = visibleFiles.findIndex(f => f.id === lastSelectedId);
            if (currentIdx !== -1) {
                if (e.key === 'ArrowUp') {
                    nextIndex = Math.max(0, currentIdx - 1);
                } else {
                    nextIndex = Math.min(visibleFiles.length - 1, currentIdx + 1);
                }
            }
        }

        const nextFile = visibleFiles[nextIndex];
        const nextId = nextFile.id;

        const newSet = new Set(selectedFileIds);

        if (e.shiftKey) {
            if (!anchorId) setAnchorId(lastSelectedId || nextId);

            // Range from Anchor to Next
            const startId = anchorId || lastSelectedId || nextId;
            const startIdx = visibleFiles.findIndex(f => f.id === startId);
            const endIdx = nextIndex;

            const low = Math.min(startIdx, endIdx);
            const high = Math.max(startIdx, endIdx);

            if (!e.ctrlKey && !e.metaKey) {
                newSet.clear();
            }

            for (let i = low; i <= high; i++) {
                newSet.add(visibleFiles[i].id);
            }
            setLastSelectedId(nextId); // Focus moves
        } else {
            // Single Select move
            newSet.clear();
            newSet.add(nextId);
            setLastSelectedId(nextId);
            setAnchorId(nextId);
        }

        setSelectedFileIds(newSet);

        // Scroll into view logic could be added here or via Ref in FileItem
        const el = document.getElementById(`file-item-${nextId}`);
        el?.scrollIntoView({ block: 'nearest' });
    };

    // Batch Action Handlers
    const handleBatchUnassign = () => {
        if (!onBulkUnassign && !onUnassignFile) return;

        const idsToUnassign: string[] = [];
        selectedFileIds.forEach(id => {
            const file = files.find(f => f.id === id);
            if (file && !file.isParked) {
                idsToUnassign.push(id);
            }
        });

        if (idsToUnassign.length === 0) return;

        if (onBulkUnassign) {
            onBulkUnassign(idsToUnassign);
        } else if (onUnassignFile) {
            // Fallback (though we should always have bulk now)
            idsToUnassign.forEach(id => onUnassignFile(id));
        }

        setSelectedFileIds(new Set());
    };

    const handleBatchDelete = () => {
        if (!onDeleteFile && !onBulkDeleteFiles) return;

        if (onBulkDeleteFiles) {
            onBulkDeleteFiles(Array.from(selectedFileIds));
            setSelectedFileIds(new Set());
            return;
        }

        // Fallback for single delete confirmation (Legacy / If no bulk handler)
        if (confirm(`Are you sure you want to delete ${selectedFileIds.size} files? This cannot be undone.`)) {
            selectedFileIds.forEach(id => onDeleteFile!(id));
            setSelectedFileIds(new Set());
        }
    };


    const clearSelection = () => setSelectedFileIds(new Set());

    const handleSelectAllUnassigned = () => {
        const newSet = new Set(selectedFileIds);
        unassignedFiles.forEach(f => allUnassignedSelected ? newSet.delete(f.id) : newSet.add(f.id));
        setSelectedFileIds(newSet);
    };

    const handleSelectAllAssigned = () => {
        const newSet = new Set(selectedFileIds);
        assignedFiles.forEach(f => allAssignedSelected ? newSet.delete(f.id) : newSet.add(f.id));
        setSelectedFileIds(newSet);
    };

    const handleFillSlots = () => {
        if (!onFillFreeSlots) return;
        // Use selected UNASSIGNED files if any, otherwise all unassigned
        const unassignedSelected = unassignedFiles.filter(f => selectedFileIds.has(f.id)).map(f => f.id);
        const sourceIds = unassignedSelected.length > 0 ? unassignedSelected : unassignedFiles.map(f => f.id);

        if (sourceIds.length === 0) return;
        onFillFreeSlots(sourceIds);
        clearSelection();
    };


    const handleDragStart = (e: React.DragEvent, fileId: string) => {
        // If the dragged file is part of the selection, we drag ALL selected files
        if (selectedFileIds.has(fileId)) {
            const ids = Array.from(selectedFileIds);
            e.dataTransfer.setData('application/x-spotykach-bulk-ids', JSON.stringify(ids));
            e.dataTransfer.setData('application/x-spotykach-source', 'browser'); // common source
            e.dataTransfer.effectAllowed = 'copyMove';
            // Also set the single ID for fallback logic if needed
            e.dataTransfer.setData('application/x-spotykach-file-id', fileId);

            // Polyfill Fallback: Serialize ALL data to JSON
            e.dataTransfer.setData('text/plain', JSON.stringify({
                id: fileId,
                source: 'browser',
                bulkIds: ids
            }));
        } else {
            // Standard single file drag
            e.dataTransfer.setData('application/x-spotykach-file-id', fileId);
            e.dataTransfer.setData('application/x-spotykach-source', 'browser');
            e.dataTransfer.effectAllowed = 'copyMove';

            // Polyfill Fallback: Serialize ALL data to JSON
            e.dataTransfer.setData('text/plain', JSON.stringify({
                id: fileId,
                source: 'browser'
            }));
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        if (e.dataTransfer.types.includes('application/x-spotykach-file-id')) {
            e.dataTransfer.dropEffect = 'move';
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const fileId = e.dataTransfer.getData('application/x-spotykach-file-id');
        const source = e.dataTransfer.getData('application/x-spotykach-source');

        // If dropped on the browser itself, and it came from a slot, park it.
        if (fileId && source === 'slot') {
            onParkRequest(fileId);
        }
    };

    // Helper to find location
    const getFileLocation = (fileId: string): string | null => slotIndex.get(fileId)?.label ?? null;

    const unassignedFiles = applySort(files.filter(f => f.isParked));
    const assignedFiles = applySort(files.filter(f => !f.isParked));

    // An empty section is never "all selected" — there would be nothing to deselect.
    const allAssignedSelected = assignedFiles.length > 0 && assignedFiles.every(f => selectedFileIds.has(f.id));
    const allUnassignedSelected = unassignedFiles.length > 0 && unassignedFiles.every(f => selectedFileIds.has(f.id));

    const getLabelStyle = (location?: string) => {
        if (!location) return '';
        const color = location.split(' ')[0];
        switch (color) {
            case 'Blue': return 'bg-synthux-blue/20 text-synthux-blue border-synthux-blue/50';
            case 'Green': return 'bg-synthux-green/20 text-synthux-green border-synthux-green/50';
            case 'Pink': return 'bg-synthux-pink/20 text-synthux-pink border-synthux-pink/50';
            case 'Red': return 'bg-synthux-red/20 text-synthux-red border-synthux-red/50';
            case 'Turquoise': return 'bg-teal-400/20 text-teal-400 border-teal-400/50';
            case 'Yellow': return 'bg-synthux-yellow/20 text-synthux-yellow border-synthux-yellow/50';
            default: return 'bg-gray-700 text-gray-300 border-gray-600';
        }
    };

    const getLeftBorderColor = (location?: string) => {
        if (!location) return 'border-l-gray-600'; // Default
        const color = location.split(' ')[0];
        switch (color) {
            case 'Blue': return 'border-l-synthux-blue';
            case 'Green': return 'border-l-synthux-green';
            case 'Pink': return 'border-l-synthux-pink';
            case 'Red': return 'border-l-synthux-red';
            case 'Turquoise': return 'border-l-teal-400';
            case 'Yellow': return 'border-l-synthux-yellow';
            default: return 'border-l-gray-600';
        }
    };

    // Context
    const { play, stop, isPlaying, activeFileId } = useAudioPlayer();

    // The control wears the sort it is in, and lights up whenever the lists are
    // in anything other than the order the files arrived in.
    const isSorted = sort.mode !== 'custom' || sort.dir !== 'asc';
    const sortIcon = sort.mode === 'abc'
        ? (sort.dir === 'asc' ? <ArrowDownAZ size={16} /> : <ArrowUpAZ size={16} />)
        : sort.mode === 'tape'
            ? <Palette size={16} />
            : <ListOrdered size={16} />;
    const sortTick = (on: boolean) => on
        ? <Check size={12} className="text-synthux-yellow" />
        : <span className="block w-3" />;
    const sortModeItem = (mode: SortMode) => ({
        label: SORT_LABELS[mode],
        icon: sortTick(sort.mode === mode),
        onClick: () => chooseSortMode(mode),
    });

    return (
        <div
            className="bg-synthux-browsebg border-r border-gray-800 flex flex-col h-full outline-none focus:ring-1 focus:ring-synthux-blue/50 shrink-0 relative"
            style={{ width: `${width}px` }}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            tabIndex={0}
            onKeyDown={handleKeyDown}
        >
            {/* Drag Handle */}
            <div
                className="absolute top-0 right-[-3px] w-1.5 h-full cursor-col-resize hover:bg-synthux-blue/50 active:bg-synthux-blue z-20"
                onMouseDown={handleDragResizeStart}
            />
            <div className="p-4 border-b border-gray-800 bg-synthux-panel flex items-center justify-between min-h-[60px]">
                {selectedFileIds.size > 0 ? (
                    <div className="flex items-center gap-2 w-full animate-in fade-in slide-in-from-top-1 duration-200">
                        <button
                            onClick={clearSelection}
                            className="mr-auto text-xs font-bold text-gray-400 hover:text-white flex items-center gap-1"
                        >
                            <X size={14} /> {selectedFileIds.size} Selected
                        </button>

                        {/* Batch Unassign (Only shows if passing onUnassignFile) */}
                        {onUnassignFile && (
                            <button
                                onClick={handleBatchUnassign}
                                className="p-1.5 rounded-md bg-synthux-yellow/10 border border-synthux-yellow/30 text-synthux-yellow hover:bg-synthux-yellow/30 transition-colors"
                                title="Move Selected to Unassigned"
                            >
                                <X size={14} />
                            </button>
                        )}

                        {/* Batch Delete */}
                        {onDeleteFile && (
                            <button
                                onClick={handleBatchDelete}
                                className="p-1.5 rounded-md bg-red-900/20 border border-red-900/30 text-red-500 hover:bg-red-900/40 transition-colors"
                                title="Delete Selected"
                            >
                                <Trash2 size={14} />
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="min-w-0 flex-1 pr-2">
                        <div className="flex items-center gap-2 mb-0.5">
                            <h3 className="text-gray-400 uppercase text-[10px] font-black tracking-widest flex items-center gap-1.5 shrink-0">
                                <FileAudio size={11} className="text-synthux-blue" /> Registry
                            </h3>
                            {currentProjectName && (
                                <div className="h-2 w-px bg-gray-800" />
                            )}
                            {currentProjectName && (
                                <span className="text-white font-bold text-[11px] truncate" title={currentProjectName}>
                                    {currentProjectName}
                                </span>
                            )}
                        </div>
                        {workFolderName && (
                            <p className="text-[9px] text-gray-500 font-mono flex items-center gap-1 truncate" title={`Workspace: ${workFolderName}`}>
                                <span className="w-1 h-1 rounded-full bg-indigo-500/50" />
                                {workFolderName}
                            </p>
                        )}
                        {!currentProjectName && !workFolderName && (
                           <p className="text-[10px] text-gray-500 mt-1 uppercase tracking-wider font-bold">
                               All imported files.
                           </p>
                        )}
                    </div>
                )}

                <div className="flex items-center gap-2">
                    {/* Sort — one order, both lists */}
                    <div title={`Sort: ${SORT_LABELS[sort.mode]}${sort.dir === 'desc' ? ' (reversed)' : ''}`}>
                        <Dropdown
                            align="right"
                            iconOnly
                            label={sortIcon}
                            buttonClassName={`!p-1.5 !rounded !border-transparent hover:!bg-gray-700 ${isSorted ? '!text-synthux-blue !bg-gray-800' : '!text-gray-400 hover:!text-white'}`}
                            items={[
                                { type: 'header', label: 'Sort registry' },
                                sortModeItem('abc'),
                                sortModeItem('tape'),
                                sortModeItem('custom'),
                                { type: 'divider' },
                                {
                                    label: 'Reversed',
                                    icon: sortTick(sort.dir === 'desc'),
                                    onClick: toggleSortDir,
                                },
                            ]}
                        />
                    </div>

                    {/* Sample Pack Browser Toggle */}
                    <button
                        onClick={onOpenSampleBrowser}
                        className="p-1.5 rounded hover:bg-gray-700 transition-colors text-gray-400 hover:text-synthux-orange"
                        title="Browse Sample Packs"
                    >
                        <FolderOpen size={16} />
                    </button>

                    {/* Minified Toggle */}
                    <button
                        onClick={() => setIsMinified(!isMinified)}
                        className={`p-1.5 rounded hover:bg-gray-700 transition-colors ${isMinified ? 'text-synthux-blue bg-gray-800' : 'text-gray-400'}`}
                        title={isMinified ? "Expand View" : "Compact View"}
                    >
                        {isMinified ? <LayoutList size={16} /> : <List size={16} />}
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">

                {/* Assigned Section */}
                <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2 px-1 w-full">
                        <button
                            onClick={() => setAssignedOpen(!isAssignedOpen)}
                            className="flex items-center gap-1 text-left text-xs font-bold text-gray-400 uppercase hover:text-white flex-1"
                        >
                            {isAssignedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            Assigned ({assignedFiles.length})
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); handleSelectAllAssigned(); }}
                            className="text-[10px] text-gray-500 hover:text-white underline decoration-transparent hover:decoration-white transition-all"
                            title={allAssignedSelected ? "Deselect All Assigned" : "Select All Assigned"}
                        >
                            {allAssignedSelected ? 'Deselect All' : 'Select All'}
                        </button>
                    </div>

                    {isAssignedOpen && (
                        <div className="pl-1">
                            {assignedFiles.map(file => (
                                <FileItem
                                    key={file.id}
                                    file={file}
                                    isMinified={isMinified}
                                    isPlaying={isPlaying}
                                    activeFileId={activeFileId}
                                    play={play}
                                    stop={stop}
                                    onDragStart={handleDragStart}
                                    location={getFileLocation(file.id)}
                                    getLabelStyle={getLabelStyle}
                                    getLeftBorderColor={getLeftBorderColor}
                                    isDuplicate={duplicates.has(file.id)}
                                    onRenameFile={onRenameFile}
                                    onOpenDuplicateModal={onOpenDuplicateModal}
                                    isSelected={selectedFileIds.has(file.id)}
                                    onToggleSelect={() => toggleSelection(file.id)}
                                    onSelectionClick={(e) => handleSelectionClick(file.id, e)}
                                    onUnassign={() => {
                                        if (onUnassignFile) onUnassignFile(file.id);
                                    }}
                                    onDelete={() => {
                                        if (onDeleteFile) onDeleteFile(file.id);
                                    }}
                                />
                            ))}
                            {assignedFiles.length === 0 && (
                                <div className="text-gray-600 text-xs italic px-2 py-4 border border-dashed border-gray-800 rounded">
                                    No assigned files
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Project Pool (Unassigned Section) */}
                <div>
                    <div className="flex items-center gap-2 mb-2 px-1 w-full">
                        <button
                            onClick={() => setUnassignedOpen(!isUnassignedOpen)}
                            className="flex items-center gap-1 text-left text-xs font-bold text-gray-400 uppercase hover:text-white flex-1"
                        >
                            {isUnassignedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            Project Pool ({unassignedFiles.length})
                        </button>

                        {/* Select All Button */}
                        <button
                            onClick={(e) => { e.stopPropagation(); handleSelectAllUnassigned(); }}
                            className="text-[10px] text-gray-500 hover:text-white underline decoration-transparent hover:decoration-white transition-all"
                            title={allUnassignedSelected ? "Deselect All in Pool" : "Select All in Pool"}
                        >
                            {allUnassignedSelected ? 'Deselect All' : 'Select All'}
                        </button>

                        {/* Fill Slots Button (Visible if we have unassigned files) */}
                        {onFillFreeSlots && unassignedFiles.length > 0 && (
                            <button
                                onClick={(e) => { e.stopPropagation(); handleFillSlots(); }}
                                className="p-1 rounded bg-gray-800 hover:bg-synthux-blue/20 text-gray-400 hover:text-synthux-blue transition-colors ml-1"
                                title="Add all in pool to free slots"
                            >
                                <ArrowRightToLine size={12} />
                            </button>
                        )}
                    </div>

                    {isUnassignedOpen && (
                        <div className="pl-1">
                            {unassignedFiles.map(file => (
                                <FileItem
                                    key={file.id}
                                    file={file}
                                    isMinified={isMinified}
                                    isPlaying={isPlaying}
                                    activeFileId={activeFileId}
                                    play={play}
                                    stop={stop}
                                    onDragStart={handleDragStart}
                                    onRenameFile={onRenameFile}
                                    location={null}
                                    getLabelStyle={getLabelStyle}
                                    getLeftBorderColor={getLeftBorderColor}
                                    isSelected={selectedFileIds.has(file.id)}
                                    onToggleSelect={() => toggleSelection(file.id)}
                                    onSelectionClick={(e) => handleSelectionClick(file.id, e)}
                                    onDelete={() => {
                                        if (onDeleteFile) onDeleteFile(file.id);
                                    }}
                                />
                            ))}
                            {unassignedFiles.length === 0 && (
                                <div className="text-gray-600 text-xs italic px-2 py-4 border border-dashed border-gray-800 rounded">
                                    Project Pool is empty
                                </div>
                            )}
                        </div>
                    )}
                </div>

            </div>


        </div>
    );
};

interface FileItemProps {
    file: FileRecord;
    location: string | null;
    isMinified: boolean;
    isPlaying: boolean;
    activeFileId: string | null;
    play: (file: FileRecord) => void;
    stop: () => void;
    onDragStart: (e: React.DragEvent, fileId: string) => void;

    getLabelStyle: (location?: string) => string;
    getLeftBorderColor: (location?: string) => string;
    isDuplicate?: boolean;
    onOpenDuplicateModal?: () => void;
    onUnassign?: () => void;
    onDelete?: () => void;

    isSelected: boolean;
    onToggleSelect: () => void;
    onSelectionClick: (e: React.MouseEvent) => void;
    onRenameFile?: (fileId: string, newName: string) => void;
}

const FileItem = ({
    file,
    location,
    isMinified,
    isPlaying,
    activeFileId,
    play,
    stop,
    onDragStart,
    getLabelStyle,
    getLeftBorderColor,
    isDuplicate,
    onUnassign,
    onDelete,
    isSelected,
    onToggleSelect,
    onSelectionClick,
    onRenameFile
}: FileItemProps) => {
    const isThisPlaying = isPlaying && activeFileId === file.id;

    // Rename state
    const [isRenaming, setIsRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState("");

    const handleRenameSubmit = () => {
        if (renameValue.trim() && renameValue !== file.name && onRenameFile) {
            onRenameFile(file.id, renameValue.trim());
        }
        setIsRenaming(false);
    };

    const handleRenameKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleRenameSubmit();
        if (e.key === 'Escape') setIsRenaming(false);
    };

    // Dynamic classes based on state.
    // Compact rows carry the tape colour on the left edge only — a full coloured ring
    // is noise at that density. The rest of the row stays as quiet as any other.
    const isTapeStriped = Boolean(isMinified && location);
    const borderClass = (isMinified && location)
        ? `border-gray-700 border-l-2 ${getLeftBorderColor(location)}`
        : (location ? 'border-gray-700' : 'border-gray-600');

    const bgClass = location ? 'bg-gray-800/50' : 'bg-gray-800';

    return (
        <div
            id={`file-item-${file.id}`}
            draggable
            onDragStart={(e) => onDragStart(e, file.id)}
            onClick={onSelectionClick}
            className={`
            relative rounded-md text-sm border cursor-grab active:cursor-grabbing group flex gap-2 select-none transition-colors mb-2
            ${bgClass} ${borderClass}
            ${isMinified ? 'items-center p-1.5' : 'items-start p-2'}

            hover:bg-gray-700
            ${isTapeStriped ? '' : 'hover:border-gray-500'}
            ${isDuplicate ? '!border-orange-500' : ''}
            ${isSelected ? 'bg-synthux-yellow/10 border-synthux-yellow/50' : ''}
        `}
        >
            {/* Left Controls Group: Checkbox + Play + Download */}
            <div className={`flex shrink-0 ${isMinified ? 'flex-row items-center gap-2' : 'flex-col items-center gap-1'}`}>

                {/* Selection Checkbox */}
                <div
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggleSelect();
                    }}
                    className={`
                        w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors cursor-pointer
                        ${isSelected ? 'bg-synthux-yellow border-synthux-yellow' : 'bg-gray-800 border-gray-600 hover:border-gray-500'}
                    `}
                    title={isSelected ? "Deselect" : "Select"}
                >
                    {isSelected && <Check size={10} className="text-black stroke-[3]" />}
                </div>

                {/* Play Button */}
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        isThisPlaying ? stop() : play(file);
                    }}
                    className={`p-1.5 rounded-md transition-colors ${isThisPlaying ? 'bg-synthux-blue text-white' : 'bg-gray-700 text-gray-400 hover:text-white hover:bg-gray-600'}`}
                    title={isThisPlaying ? "Stop Preview" : "Preview Audio"}
                >
                    {isThisPlaying ? <Square size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
                </button>

                {/* Download Button */}
                {!isMinified && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            import('../utils/exportUtils').then(u => u.exportSingleFile(file));
                        }}
                        className="p-1.5 rounded-md transition-colors bg-gray-700 text-gray-400 hover:text-white hover:bg-gray-600"
                        title="Download WAV"
                    >
                        <Download size={12} />
                    </button>
                )}
            </div>

            {/* Duplicate Icon - Top Right */}

            <div className={`flex-1 min-w-0 flex flex-col justify-center ${isMinified ? '' : 'pr-16'}`}>
                {isRenaming ? (
                    <input
                        autoFocus
                        type="text"
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onBlur={handleRenameSubmit}
                        onKeyDown={handleRenameKeyDown}
                        onClick={e => e.stopPropagation()}
                        className="w-full bg-[#111] text-white text-sm font-medium px-1 py-0 border border-synthux-yellow rounded outline-none"
                    />
                ) : (
                    <div
                        className="font-medium truncate text-gray-200 cursor-text hover:text-synthux-yellow transition-colors"
                        onDoubleClick={(e) => {
                            e.stopPropagation();
                            setRenameValue(file.name);
                            setIsRenaming(true);
                        }}
                    >
                        {file.name}
                    </div>
                )}

                {!isMinified && (
                    <>
                        <div className="flex items-center justify-between text-[10px] text-gray-400 mt-0.5">
                            <span className="truncate max-w-[100px]">{file.originalName}</span>
                        </div>
                        <div className="text-[10px] text-gray-500 truncate">
                            {file.versions.find(v => v.id === file.currentVersionId)?.description || 'Original'}
                        </div>
                        <div className="text-[10px] text-gray-600 mt-1">
                            {file.versions.length} version{file.versions.length !== 1 ? 's' : ''}
                        </div>
                    </>
                )}
            </div>

            {/* Actions: Unassign / Delete */}
            <div className={`flex items-center gap-1 ${isMinified ? 'ml-1' : `absolute right-1 z-10 ${location ? 'bottom-7' : 'bottom-1.5'}`}`}>
                {/* Unassign (Only if assigned/location exists) */}
                {location && onUnassign && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onUnassign();
                        }}
                        className="p-1 rounded hover:bg-synthux-yellow/20 text-gray-500 hover:text-synthux-yellow transition-colors"
                        title="Unassign (Move to Unassigned)"
                    >
                        <X size={12} />
                    </button>
                )}

                {/* Delete (Always available if passed) */}
                {onDelete && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete();
                        }}
                        className="p-1 rounded hover:bg-red-900/40 text-gray-500 hover:text-red-500 transition-colors"
                        title="Permanently Delete"
                    >
                        <Trash2 size={12} />
                    </button>
                )}
            </div>

            {/* Tape Position Indicator - Show ONLY in Full Mode */}
            {
                location && !isMinified && (
                    <div className={`absolute bottom-1 right-1 text-[9px] px-1 py-0.5 rounded border leading-none font-mono ${getLabelStyle(location)}`}>
                        {location}
                    </div>
                )
            }


            {/* Drag Handle (Secondary) - Hidden in mini view */}
            {!isMinified && (
                <div className="absolute top-2 right-1 flex">
                    <GripVertical size={16} className="text-gray-600 opacity-50 group-hover:opacity-100" />
                </div>
            )}
        </div >
    );
};
