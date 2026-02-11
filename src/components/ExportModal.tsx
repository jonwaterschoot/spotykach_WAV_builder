import { X, HardDrive, FileAudio, Archive, Download, FolderInput, Info, FileDown } from 'lucide-react';
import { useState } from 'react';
import { type FileRecord, type TapeColor, TAPE_COLORS } from '../types';
import { TapeIcon } from './TapeIcon';
import { downloadBlob } from '../utils/exportUtils';

interface ExportModalProps {
    files: Record<string, FileRecord>;
    tapes: Record<TapeColor, import('../types').Tape>;
    onClose: () => void;
    onExportSD: (options: { includeProject: boolean; directWrite: boolean }) => void;
    onExportFiles: (options: { keepStructure: boolean; fileIds: string[] }) => void;
    onExportProject: (options: { excludeCleanup: boolean }) => void;
}

type ExportTab = 'sd' | 'manual' | 'files' | 'project';

export const ExportModal = ({ files, tapes, onClose, onExportSD, onExportFiles, onExportProject }: ExportModalProps) => {
    const [activeTab, setActiveTab] = useState<ExportTab>('sd');

    // SD Options
    const [sdIncludeProject, setSdIncludeProject] = useState(true);
    const [sdDirectWrite, setSdDirectWrite] = useState(false);
    const hasFileSystemAccess = 'showDirectoryPicker' in window;

    // Manual Options
    const [manualTape, setManualTape] = useState<TapeColor>('Blue');

    // File Options
    const [filesKeepStructure, setFilesKeepStructure] = useState(true);
    const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set(Object.keys(files)));

    // Project Options
    const [projectExcludeCleanup, setProjectExcludeCleanup] = useState(false);

    // Helpers
    const getColorVar = (color: string) => `var(--color-synthux-${color.toLowerCase()})`;

    const handleDownloadSlot = (fileId: string, slotId: number) => {
        const file = files[fileId];
        if (!file) return;
        const version = file.versions.find(v => v.id === file.currentVersionId);
        if (version?.blob) {
            downloadBlob(version.blob, `${slotId}.WAV`);
        }
    };

    const handleDownloadTapeBatch = async () => {
        const tape = tapes[manualTape];
        for (const slot of tape.slots) {
            if (slot.fileId) {
                handleDownloadSlot(slot.fileId, slot.id);
                // Minimal delay to try and help browser not choke on robust file system calls? 
                // Wait, standard downloadBlob is just an anchor click. Browsers often throttle multiple.
                await new Promise(r => setTimeout(r, 500));
            }
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
            <div className="bg-synthux-panel border border-gray-800 rounded-2xl w-full max-w-2xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">

                {/* Header */}
                <div className="flex justify-between items-center p-6 border-b border-gray-800 bg-black/20 shrink-0">
                    <h2 className="text-2xl font-bold text-white font-header flex items-center gap-3">
                        <Download className="text-synthux-action" />
                        Export
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-full transition-colors text-gray-400 hover:text-white">
                        <X size={24} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-800 overflow-x-auto shrink-0">
                    <button
                        onClick={() => setActiveTab('sd')}
                        className={`flex-1 min-w-[100px] p-4 flex items-center justify-center gap-2 transition-colors ${activeTab === 'sd' ? 'bg-synthux-action/10 text-synthux-action border-b-2 border-synthux-action' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                    >
                        <HardDrive size={18} />
                        <span className="font-bold text-sm whitespace-nowrap">SD Card</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('manual')}
                        className={`flex-1 min-w-[100px] p-4 flex items-center justify-center gap-2 transition-colors ${activeTab === 'manual' ? 'bg-synthux-action/10 text-synthux-action border-b-2 border-synthux-action' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                    >
                        <FileDown size={18} />
                        <span className="font-bold text-sm whitespace-nowrap">Manual (Mobile)</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('files')}
                        className={`flex-1 min-w-[100px] p-4 flex items-center justify-center gap-2 transition-colors ${activeTab === 'files' ? 'bg-synthux-action/10 text-synthux-action border-b-2 border-synthux-action' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                    >
                        <FileAudio size={18} />
                        <span className="font-bold text-sm whitespace-nowrap">Files Only</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('project')}
                        className={`flex-1 min-w-[100px] p-4 flex items-center justify-center gap-2 transition-colors ${activeTab === 'project' ? 'bg-synthux-action/10 text-synthux-action border-b-2 border-synthux-action' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                    >
                        <Archive size={18} />
                        <span className="font-bold text-sm whitespace-nowrap">Backup</span>
                    </button>
                </div>

                {/* Content */}
                <div className="p-8 min-h-[300px] flex flex-col overflow-y-auto">

                    {/* SD CARD TAB */}
                    {activeTab === 'sd' && (
                        <div className="space-y-6 animate-in slide-in-from-right-4 duration-200 fade-in">
                            <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-lg flex gap-3">
                                <Info className="text-blue-400 shrink-0 mt-1" size={20} />
                                <div className="text-sm text-gray-300">
                                    <strong className="text-blue-400 block mb-1">Strict Spotykach Structure</strong>
                                    Files will be renamed to <code className="bg-black/30 px-1 rounded">1.WAV</code>, <code className="bg-black/30 px-1 rounded">2.WAV</code>... based on their slot position.
                                </div>
                            </div>

                            <div className="space-y-3">
                                <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-800 bg-black/20 hover:bg-black/30 cursor-pointer transition-colors">
                                    <input
                                        type="checkbox"
                                        checked={sdIncludeProject}
                                        onChange={(e) => setSdIncludeProject(e.target.checked)}
                                        className="w-5 h-5 rounded border-gray-600 text-synthux-action focus:ring-synthux-action bg-gray-700"
                                    />
                                    <div>
                                        <div className="font-bold text-white">Include Project Bundle</div>
                                        <div className="text-xs text-gray-400">Saves source files and original names in a backup folder (Recommended)</div>
                                    </div>
                                </label>

                                {hasFileSystemAccess && (
                                    <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-800 bg-black/20 hover:bg-black/30 cursor-pointer transition-colors">
                                        <input
                                            type="checkbox"
                                            checked={sdDirectWrite}
                                            onChange={(e) => setSdDirectWrite(e.target.checked)}
                                            className="w-5 h-5 rounded border-gray-600 text-synthux-action focus:ring-synthux-action bg-gray-700"
                                        />
                                        <div>
                                            <div className="font-bold text-white">Write Directly to SD Card (Desktop)</div>
                                            <div className="text-xs text-gray-400">Select the SD drive to export without creating a ZIP</div>
                                        </div>
                                    </label>
                                )}
                            </div>

                            <div className="mt-auto pt-4">
                                <button
                                    onClick={() => onExportSD({ includeProject: sdIncludeProject, directWrite: sdDirectWrite })}
                                    className="w-full py-3 bg-synthux-yellow hover:bg-yellow-400 text-black font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                                >
                                    {sdDirectWrite ? <FolderInput size={20} /> : <Download size={20} />}
                                    {sdDirectWrite ? 'Select SD Card & Export' : 'Download SD Structure (ZIP)'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* MANUAL TAB */}
                    {activeTab === 'manual' && (
                        <div className="flex flex-col h-full animate-in slide-in-from-right-4 duration-200 fade-in">
                            <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-lg flex gap-3 mb-6">
                                <Info className="text-amber-400 shrink-0 mt-1" size={20} />
                                <div className="text-sm text-gray-300">
                                    <strong className="text-amber-400 block mb-1">For Mobile (iOS / Android)</strong>
                                    Download individual files named correctly (e.g., <code className="bg-black/30 px-1 rounded">1.WAV</code>). You must verify they end up in the correct folder (SK/[Color]) on your SD card.
                                </div>
                            </div>

                            {/* Tape Selector */}
                            <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                                {TAPE_COLORS.map(color => (
                                    <button
                                        key={color}
                                        onClick={() => setManualTape(color)}
                                        className={`
                                            flex items-center gap-2 px-3 py-2 rounded-full border transition-all whitespace-nowrap
                                            ${manualTape === color
                                                ? 'bg-white/10 border-white text-white'
                                                : 'bg-black/20 border-gray-800 text-gray-400 hover:border-gray-600'}
                                        `}
                                    >
                                        <TapeIcon color={getColorVar(color)} className="w-4 h-4" />
                                        <span className="text-xs font-bold uppercase">{color}</span>
                                    </button>
                                ))}
                            </div>

                            {/* File List */}
                            <div className="flex-1 overflow-y-auto border border-gray-800 rounded-lg bg-black/20 p-2 space-y-2">
                                {tapes[manualTape].slots.filter(s => s.fileId).length === 0 ? (
                                    <div className="text-center text-gray-500 py-8 italic">No files assigned to this tape</div>
                                ) : (
                                    tapes[manualTape].slots.map(slot => {
                                        if (!slot.fileId) return null;
                                        const file = files[slot.fileId];
                                        return (
                                            <div key={slot.id} className="flex items-center justify-between p-3 bg-gray-800/30 rounded border border-gray-800 hover:bg-gray-800/50 transition-colors">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-8 h-8 rounded-full bg-black/40 flex items-center justify-center text-synthux-yellow font-mono text-sm border border-gray-700">
                                                        {slot.id}
                                                    </div>
                                                    <div className="overflow-hidden">
                                                        <div className="text-sm font-bold text-gray-200">{slot.id}.WAV</div>
                                                        <div className="text-xs text-gray-500 truncate max-w-[150px]">{file?.name}</div>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => handleDownloadSlot(slot.fileId!, slot.id)}
                                                    className="p-2 bg-synthux-action hover:bg-emerald-400 text-black rounded-full transition-colors"
                                                    title="Download"
                                                >
                                                    <Download size={16} />
                                                </button>
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            {/* Batch Action */}
                            <div className="mt-4 pt-4 border-t border-gray-800">
                                <button
                                    onClick={handleDownloadTapeBatch}
                                    disabled={tapes[manualTape].slots.filter(s => s.fileId).length === 0}
                                    className="w-full py-3 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                                >
                                    <Download size={20} />
                                    Download All {manualTape} Files ({tapes[manualTape].slots.filter(s => s.fileId).length})
                                </button>
                                <div className="text-center mt-2 text-[10px] text-gray-500">
                                    Your browser may ask permission to download multiple files.
                                </div>
                            </div>
                        </div>
                    )}

                    {/* FILES TAB */}
                    {activeTab === 'files' && (
                        <div className="flex flex-col h-full animate-in slide-in-from-right-4 duration-200 fade-in">
                            <div className="flex-1 overflow-y-auto mb-4 border border-gray-800 rounded-lg bg-black/20 p-2">
                                {/* Structure Options */}
                                <div className="flex gap-4 mb-4 p-2 bg-gray-800/50 rounded-lg">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="structure"
                                            checked={filesKeepStructure}
                                            onChange={() => setFilesKeepStructure(true)}
                                            className="text-synthux-yellow focus:ring-synthux-yellow bg-gray-700 border-gray-600"
                                        />
                                        <span className="text-gray-300 text-sm">SK Folders (B/G/P...)</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="structure"
                                            checked={!filesKeepStructure}
                                            onChange={() => setFilesKeepStructure(false)}
                                            className="text-synthux-yellow focus:ring-synthux-yellow bg-gray-700 border-gray-600"
                                        />
                                        <span className="text-gray-300 text-sm">Single Folder (Flat)</span>
                                    </label>
                                </div>

                                {/* File Selection List */}
                                <div className="space-y-4">
                                    {/* Assigned Files Group */}
                                    <div>
                                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 px-2">Assigned Files</h3>
                                        {Object.entries(files).filter(([_, f]) => !f.isParked).length === 0 ? (
                                            <div className="text-gray-600 text-xs px-2 italic">No assigned files</div>
                                        ) : (
                                            Object.entries(files).filter(([_, f]) => !f.isParked).map(([id, file]) => (
                                                <label key={id} className="flex items-center gap-3 p-2 hover:bg-white/5 rounded cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedFiles.has(id)}
                                                        onChange={(e) => {
                                                            const newSet = new Set(selectedFiles);
                                                            if (e.target.checked) newSet.add(id);
                                                            else newSet.delete(id);
                                                            setSelectedFiles(newSet);
                                                        }}
                                                        className="rounded border-gray-600 text-synthux-yellow focus:ring-synthux-yellow bg-gray-700"
                                                    />
                                                    <div className="overflow-hidden">
                                                        <div className="text-sm text-gray-200 truncate">{file.name}</div>
                                                        <div className="text-xs text-gray-500 truncate">{file.originalName}</div>
                                                    </div>
                                                </label>
                                            ))
                                        )}
                                    </div>

                                    {/* Unassigned Pool Group */}
                                    <div>
                                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 px-2 border-t border-gray-800 pt-2">Unassigned Pool</h3>
                                        {Object.entries(files).filter(([_, f]) => f.isParked).length === 0 ? (
                                            <div className="text-gray-600 text-xs px-2 italic">Pool is empty</div>
                                        ) : (
                                            Object.entries(files).filter(([_, f]) => f.isParked).map(([id, file]) => (
                                                <label key={id} className="flex items-center gap-3 p-2 hover:bg-white/5 rounded cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedFiles.has(id)}
                                                        onChange={(e) => {
                                                            const newSet = new Set(selectedFiles);
                                                            if (e.target.checked) newSet.add(id);
                                                            else newSet.delete(id);
                                                            setSelectedFiles(newSet);
                                                        }}
                                                        className="rounded border-gray-600 text-synthux-yellow focus:ring-synthux-yellow bg-gray-700"
                                                    />
                                                    <div className="overflow-hidden">
                                                        <div className="text-sm text-gray-200 truncate">{file.name}</div>
                                                        <div className="text-xs text-gray-500 truncate">{file.originalName}</div>
                                                    </div>
                                                </label>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-between items-center pt-2 border-t border-gray-800">
                                <div className="text-xs text-gray-400">
                                    {selectedFiles.size} files selected
                                </div>
                                <button
                                    onClick={() => onExportFiles({
                                        keepStructure: filesKeepStructure,
                                        fileIds: Array.from(selectedFiles)
                                    })}
                                    disabled={selectedFiles.size === 0}
                                    className="px-6 py-3 bg-synthux-yellow hover:bg-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold rounded-lg transition-colors flex items-center gap-2"
                                >
                                    <Download size={20} />
                                    Download ZIP
                                </button>
                            </div>
                        </div>
                    )}

                    {/* PROJECT TAB */}
                    {activeTab === 'project' && (
                        <div className="space-y-6 animate-in slide-in-from-right-4 duration-200 fade-in">
                            <div className="bg-gray-800/50 p-4 rounded-lg">
                                <p className="text-sm text-gray-300">
                                    Full backup of the current project state, including all file versions and history.
                                    Use this to save your work and continue later.
                                </p>
                            </div>

                            <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-800 bg-black/20 hover:bg-black/30 cursor-pointer transition-colors opacity-50 cursor-not-allowed">
                                <input
                                    type="checkbox"
                                    checked={projectExcludeCleanup}
                                    disabled
                                    onChange={(e) => setProjectExcludeCleanup(e.target.checked)}
                                    className="w-5 h-5 rounded border-gray-600 text-synthux-yellow focus:ring-synthux-yellow bg-gray-700"
                                />
                                <div>
                                    <div className="font-bold text-white">Exclude History / Cleanup</div>
                                    <div className="text-xs text-gray-400">Remove undo history and unused files to save space (Coming Soon)</div>
                                </div>
                            </label>

                            <div className="mt-auto pt-4">
                                <button
                                    onClick={() => onExportProject({ excludeCleanup: projectExcludeCleanup })}
                                    className="w-full py-3 bg-synthux-yellow hover:bg-yellow-400 text-black font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                                >
                                    <Archive size={20} />
                                    Save Project (ZIP)
                                </button>
                            </div>
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
};
