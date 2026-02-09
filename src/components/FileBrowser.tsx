import { useState } from 'react';
import { FileAudio, GripVertical, ChevronDown, ChevronRight, Play, Square, List, LayoutList, FolderOpen, Download, Trash2, X, Check, ArrowRightToLine } from 'lucide-react';
import type { FileRecord, AppState } from '../types';
import { useAudioPlayer } from '../contexts/AudioPlayerContext';

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
    onFillFreeSlots?: (fileIds: string[]) => void;
}
export const FileBrowser = ({ files, tapes, onParkRequest, onOpenSampleBrowser, duplicates, onOpenDuplicateModal, onUnassignFile, onBulkUnassign, onDeleteFile, onFillFreeSlots }: FileBrowserProps) => {
    const [isAssignedOpen, setAssignedOpen] = useState(true);
    const [isUnassignedOpen, setUnassignedOpen] = useState(true);
    const [isMinified, setIsMinified] = useState(false);
    const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
    const [lastSelectedId, setLastSelectedId] = useState<string | null>(null); // Focus/Last Interacted
    const [anchorId, setAnchorId] = useState<string | null>(null); // Start of Range Selection

    // Helpers to get all visible files in order
    const getVisibleFiles = () => {
        // We need to return files in the order they are rendered
        // Unassigned first, then Assigned (or whatever the rendering order is)
        // Currently: Unassigned Section -> Assigned Section
        // Inside sections: filtered by type

        const unassigned = files.filter(f => f.isParked);
        const assigned = files.filter(f => !f.isParked);

        // Sorting logic inside sections matches the render logic?
        // Render logic just maps them. They are likely in ID or creation order unless sorted.
        // Let's assume 'files' array order is the base order, and we just filter.

        // Actually, let's just concatenate them in the order sections appear
        return [...unassigned, ...assigned];
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
        if (!onDeleteFile) return;
        if (confirm(`Are you sure you want to delete ${selectedFileIds.size} files? This cannot be undone.`)) {
            selectedFileIds.forEach(id => onDeleteFile(id));
            setSelectedFileIds(new Set());
        }
    };


    const clearSelection = () => setSelectedFileIds(new Set());

    const handleSelectAllUnassigned = () => {
        const newSet = new Set(selectedFileIds);
        unassignedFiles.forEach(f => newSet.add(f.id));
        setSelectedFileIds(newSet);
    };

    const handleSelectAllAssigned = () => {
        const newSet = new Set(selectedFileIds);
        assignedFiles.forEach(f => newSet.add(f.id));
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
    const getFileLocation = (fileId: string): string | null => {
        for (const [color, tape] of Object.entries(tapes)) {
            const slot = tape.slots.find(s => s.fileId === fileId);
            if (slot) {
                return `${color} ${slot.id}`;
            }
        }
        return null;
    };

    const unassignedFiles = files.filter(f => f.isParked);
    const assignedFiles = files.filter(f => !f.isParked);

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

    const getBorderColor = (location?: string) => {
        if (!location) return 'border-gray-600'; // Default
        const color = location.split(' ')[0];
        switch (color) {
            case 'Blue': return 'border-synthux-blue';
            case 'Green': return 'border-synthux-green';
            case 'Pink': return 'border-synthux-pink';
            case 'Red': return 'border-synthux-red';
            case 'Turquoise': return 'border-teal-400';
            case 'Yellow': return 'border-synthux-yellow';
            default: return 'border-gray-600';
        }
    };

    // Context
    const { play, stop, isPlaying, activeFileId } = useAudioPlayer();

    return (
        <div
            className="w-72 bg-synthux-browsebg border-r border-gray-800 flex flex-col h-full transition-all outline-none focus:ring-1 focus:ring-synthux-blue/50"
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            tabIndex={0}
            onKeyDown={handleKeyDown}
        >
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
                    <div>
                        <h3 className="text-gray-400 uppercase text-xs font-bold flex items-center gap-2">
                            <FileAudio size={14} /> File Registry
                        </h3>
                        <p className="text-[10px] text-gray-500 mt-1">
                            All imported files.
                        </p>
                    </div>
                )}

                <div className="flex items-center gap-2">
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

                {/* Unassigned Section */}
                <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2 px-1 w-full">
                        <button
                            onClick={() => setUnassignedOpen(!isUnassignedOpen)}
                            className="flex items-center gap-1 text-left text-xs font-bold text-gray-400 uppercase hover:text-white flex-1"
                        >
                            {isUnassignedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            Unassigned ({unassignedFiles.length})
                        </button>

                        {/* Select All Button */}
                        <button
                            onClick={(e) => { e.stopPropagation(); handleSelectAllUnassigned(); }}
                            className="text-[10px] text-gray-500 hover:text-white underline decoration-transparent hover:decoration-white transition-all"
                            title="Select All Unassigned"
                        >
                            Select All
                        </button>

                        {/* Fill Slots Button (Visible if we have unassigned files) */}
                        {onFillFreeSlots && unassignedFiles.length > 0 && (
                            <button
                                onClick={(e) => { e.stopPropagation(); handleFillSlots(); }}
                                className="p-1 rounded bg-gray-800 hover:bg-synthux-blue/20 text-gray-400 hover:text-synthux-blue transition-colors ml-1"
                                title="Add all unassigned to free slots"
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
                                    location={null}
                                    getLabelStyle={getLabelStyle}
                                    getBorderColor={getBorderColor}
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
                                    No unassigned files
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Assigned Section */}
                <div>
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
                            title="Select All Assigned"
                        >
                            Select All
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
                                    getBorderColor={getBorderColor}
                                    isDuplicate={duplicates.has(file.id)}
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

            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-800">
                <button
                    onClick={() => {
                        if (confirm("Factory Reset: This will delete all imported files and assignments. Are you sure?")) {
                            import('../utils/persistence').then(p => p.clearState());
                        }
                    }}
                    className="w-full py-2 text-xs font-bold text-red-900 bg-red-900/20 hover:bg-red-900/40 border border-red-900 rounded uppercase transition-colors"
                >
                    Reset Application
                </button>
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
    getBorderColor: (location?: string) => string;
    isDuplicate?: boolean;
    onOpenDuplicateModal?: () => void;
    onUnassign?: () => void;
    onDelete?: () => void;

    isSelected: boolean;
    onToggleSelect: () => void;
    onSelectionClick: (e: React.MouseEvent) => void;
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
    getBorderColor,
    isDuplicate,
    onUnassign,
    onDelete,
    isSelected,
    onToggleSelect,
    onSelectionClick
}: FileItemProps) => {
    const isThisPlaying = isPlaying && activeFileId === file.id;

    // Dynamic classes based on state
    const borderClass = (isMinified && location)
        ? getBorderColor(location)
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

            hover:border-gray-500 hover:bg-gray-700
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
            </div>

            {/* Duplicate Icon - Top Right */}

            <div className="flex-1 min-w-0 flex flex-col justify-center">
                <div className="font-medium truncate text-gray-200">{file.name}</div>

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
            <div className={`flex items-center gap-1 ${isMinified ? 'ml-1' : 'ml-2'}`}>
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
                <GripVertical size={16} className="text-gray-600 mt-0.5 shrink-0 opacity-50 group-hover:opacity-100" />
            )}
        </div >
    );
};
