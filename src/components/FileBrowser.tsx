import { useState } from 'react';
import { FileAudio, GripVertical, ChevronDown, ChevronRight, Play, Square, List, LayoutList, FolderOpen, Download } from 'lucide-react';
import type { FileRecord, AppState } from '../types';
import { useAudioPlayer } from '../contexts/AudioPlayerContext';

interface FileBrowserProps {
    files: FileRecord[];
    tapes: AppState['tapes'];
    onParkRequest: (fileId: string) => void;
    onOpenSampleBrowser: () => void;
}

export const FileBrowser = ({ files, tapes, onParkRequest, onOpenSampleBrowser }: FileBrowserProps) => {
    const [isAssignedOpen, setAssignedOpen] = useState(true);
    const [isUnassignedOpen, setUnassignedOpen] = useState(true);
    const [isMinified, setIsMinified] = useState(false);

    const handleDragStart = (e: React.DragEvent, fileId: string) => {
        e.dataTransfer.setData('application/x-spotykach-file-id', fileId);
        e.dataTransfer.setData('application/x-spotykach-source', 'browser');
        e.dataTransfer.effectAllowed = 'copyMove';
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

    const FileItem = ({ file, location }: { file: FileRecord, location?: string }) => {
        const isThisPlaying = isPlaying && activeFileId === file.id;

        // Dynamic classes based on state
        const borderClass = (isMinified && location)
            ? getBorderColor(location)
            : (location ? 'border-gray-700' : 'border-gray-600');

        const bgClass = location ? 'bg-gray-800/50' : 'bg-gray-800';

        return (
            <div
                draggable
                onDragStart={(e) => handleDragStart(e, file.id)}
                className={`
                relative rounded-md text-sm border cursor-grab active:cursor-grabbing group flex items-start gap-2 select-none transition-colors mb-2
                ${bgClass} ${borderClass}
                hover:border-gray-500 hover:bg-gray-700
                ${isMinified ? 'p-1.5' : 'p-2'}
            `}
            >
                {/* Playback Control & Download */}
                <div className="flex items-center shrink-0 mt-0.5">
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

                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            import('../utils/exportUtils').then(u => u.exportSingleFile(file));
                        }}
                        className="p-1.5 rounded-md transition-colors bg-gray-700 text-gray-400 hover:text-white hover:bg-gray-600 ml-1"
                        title="Download WAV"
                    >
                        <Download size={12} />
                    </button>
                </div>

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

                {/* Tape Position Indicator - Show ONLY in Full Mode */}
                {location && !isMinified && (
                    <div className={`absolute bottom-1 right-1 text-[9px] px-1 py-0.5 rounded border leading-none font-mono ${getLabelStyle(location)}`}>
                        {location}
                    </div>
                )}


                {/* Drag Handle (Secondary) */}
                <GripVertical size={16} className="text-gray-600 mt-0.5 shrink-0 opacity-50 group-hover:opacity-100" />
            </div>
        );
    };

    return (
        <div
            className="w-72 bg-synthux-browsebg border-r border-gray-800 flex flex-col h-full transition-all"
            onDragOver={handleDragOver}
            onDrop={handleDrop}
        >
            <div className="p-4 border-b border-gray-800 bg-synthux-panel flex items-center justify-between">
                <div>
                    <h3 className="text-gray-400 uppercase text-xs font-bold flex items-center gap-2">
                        <FileAudio size={14} /> File Registry
                    </h3>
                    <p className="text-[10px] text-gray-500 mt-1">
                        All imported files.
                    </p>
                </div>

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
                    <button
                        onClick={() => setUnassignedOpen(!isUnassignedOpen)}
                        className="flex items-center gap-1 w-full text-left text-xs font-bold text-gray-400 uppercase hover:text-white mb-2 px-1"
                    >
                        {isUnassignedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        Unassigned ({unassignedFiles.length})
                    </button>

                    {isUnassignedOpen && (
                        <div className="pl-1">
                            {unassignedFiles.map(file => (
                                <FileItem key={file.id} file={file} />
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
                    <button
                        onClick={() => setAssignedOpen(!isAssignedOpen)}
                        className="flex items-center gap-1 w-full text-left text-xs font-bold text-gray-400 uppercase hover:text-white mb-2 px-1"
                    >
                        {isAssignedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        Assigned ({assignedFiles.length})
                    </button>

                    {isAssignedOpen && (
                        <div className="pl-1">
                            {assignedFiles.map(file => (
                                <FileItem key={file.id} file={file} location={getFileLocation(file.id) || 'Unknown'} />
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
