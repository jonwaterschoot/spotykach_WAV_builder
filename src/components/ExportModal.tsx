import { X, HardDrive, FileAudio, Archive, Download, Info } from 'lucide-react';
import { useEffect, useState } from 'react';
import { type FileRecord } from '../types';
// dynamic utility imports

interface ExportModalProps {
    files: Record<string, FileRecord>;
    onClose: () => void;
    onExportSD: (options: { includeProject: boolean; directWrite: boolean; smartSync?: boolean; skMode: 'clean' | 'overwrite'; includeConfig?: boolean }) => void;
    onExportFiles: (options: { keepStructure: boolean; fileIds: string[] }) => void;
    onExportProject: (options: { settingsOnly: boolean }) => void;
}

type ExportTab = 'sd' | 'preset' | 'files';

export const ExportModal = ({ files, onClose, onExportSD, onExportFiles, onExportProject }: ExportModalProps) => {
    const [activeTab, setActiveTab] = useState<ExportTab>('sd');

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    // SD Options
    const [sdIncludeProject, setSdIncludeProject] = useState(true);
    // File Options
    const [filesKeepStructure, setFilesKeepStructure] = useState(true);
    const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set(Object.keys(files)));

    // Preset Options
    const [presetSettingsOnly, setPresetSettingsOnly] = useState(true);

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
            <div className="bg-synthux-panel border border-gray-800 rounded-2xl w-full max-w-2xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">

                {/* Header */}
                <div className="p-6 border-b border-gray-800 bg-black/20 shrink-0">
                    <div className="flex justify-between items-center mb-2">
                        <h2 className="text-2xl font-bold text-white font-header flex items-center gap-3">
                            <Download className="text-synthux-action" />
                            Export
                        </h2>
                        <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-full transition-colors text-gray-400 hover:text-white">
                            <X size={24} />
                        </button>
                    </div>
                    <div className="bg-orange-500/10 border border-orange-500/20 px-3 py-2 rounded text-[11px] text-orange-200/80 flex items-center gap-2">
                        <Info size={14} className="text-orange-400" />
                        <span>To write directly to an SD card, use the <strong>Import / Build SD</strong> button in the main header.</span>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-800 overflow-x-auto shrink-0">
                    <button
                        onClick={() => setActiveTab('sd')}
                        className={`flex-1 min-w-[100px] p-4 flex items-center justify-center gap-2 transition-colors ${activeTab === 'sd' ? 'bg-synthux-action/10 text-synthux-action border-b-2 border-synthux-action' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                    >
                        <HardDrive size={18} />
                        <span className="font-bold text-sm whitespace-nowrap">Portable SK Folder</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('preset')}
                        className={`flex-1 min-w-[100px] p-4 flex items-center justify-center gap-2 transition-colors ${activeTab === 'preset' ? 'bg-synthux-action/10 text-synthux-action border-b-2 border-synthux-action' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                    >
                        <Archive size={18} />
                        <span className="font-bold text-sm whitespace-nowrap">Project Preset</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('files')}
                        className={`flex-1 min-w-[100px] p-4 flex items-center justify-center gap-2 transition-colors ${activeTab === 'files' ? 'bg-synthux-action/10 text-synthux-action border-b-2 border-synthux-action' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                    >
                        <FileAudio size={18} />
                        <span className="font-bold text-sm whitespace-nowrap">Custom Files</span>
                    </button>
                </div>

                {/* Content */}
                <div className="p-8 min-h-[300px] flex flex-col overflow-y-auto">

                    {/* SD CARD TAB */}
                    {activeTab === 'sd' && (
                        <div className="space-y-6 animate-in slide-in-from-right-4 duration-200 fade-in flex flex-col h-full">
                            <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-lg flex gap-3">
                                <Info className="text-blue-400 shrink-0 mt-1" size={20} />
                                <div className="text-sm text-gray-300">
                                    <strong className="text-blue-400 block mb-1">Portable SK Folder</strong>
                                    Downloads a fully formatted ZIP containing the SK folder structure and instructions. 
                                    Ready to be shared or uploaded to Cloudflare R2 for web deployment.
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
                                        <div className="font-bold text-white">Include Project Bundle Backup</div>
                                        <div className="text-xs text-gray-400">Saves your source files alongside the SK folder just in case</div>
                                    </div>
                                </label>
                            </div>

                            <div className="mt-auto pt-4 border-t border-gray-800">
                                <button
                                    onClick={() => onExportSD({ includeProject: sdIncludeProject, directWrite: false, skMode: 'clean', includeConfig: true })}
                                    className="w-full py-3 bg-synthux-yellow hover:bg-yellow-400 text-black font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                                >
                                    <Download size={20} />
                                    Download Portable SK Folder (ZIP)
                                </button>
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

                    {/* PRESET TAB */}
                    {activeTab === 'preset' && (
                        <div className="space-y-6 animate-in slide-in-from-right-4 duration-200 fade-in flex flex-col h-full">
                            <div className="bg-purple-500/10 border border-purple-500/20 p-4 rounded-lg flex gap-3">
                                <Info className="text-purple-400 shrink-0 mt-1" size={20} />
                                <div className="text-sm text-gray-300">
                                    <strong className="text-purple-400 block mb-1">Export Project Preset</strong>
                                    Create a preset package to share with other users or submit to the official repository.
                                </div>
                            </div>

                            <div className="space-y-3">
                                <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-800 bg-black/20 hover:bg-black/30 cursor-pointer transition-colors">
                                    <input
                                        type="radio"
                                        checked={presetSettingsOnly}
                                        onChange={() => setPresetSettingsOnly(true)}
                                        name="presetType"
                                        className="w-5 h-5 text-synthux-action focus:ring-synthux-action bg-gray-700 border-gray-600"
                                    />
                                    <div>
                                        <div className="font-bold text-white">Settings-Only Preset (JSON)</div>
                                        <div className="text-xs text-gray-400">Exports just the `project-descriptor.json`. Required for submitting presets that use Cloudflare R2 samples.</div>
                                    </div>
                                </label>

                                <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-800 bg-black/20 hover:bg-black/30 cursor-pointer transition-colors">
                                    <input
                                        type="radio"
                                        checked={!presetSettingsOnly}
                                        onChange={() => setPresetSettingsOnly(false)}
                                        name="presetType"
                                        className="w-5 h-5 text-synthux-action focus:ring-synthux-action bg-gray-700 border-gray-600"
                                    />
                                    <div>
                                        <div className="font-bold text-white">Full Backup Bundle (ZIP)</div>
                                        <div className="text-xs text-gray-400">Bundles the JSON descriptor AND all audio files. Best for sharing custom samples with friends.</div>
                                    </div>
                                </label>
                            </div>

                            <div className="mt-auto pt-4 border-t border-gray-800">
                                <button
                                    onClick={() => onExportProject({ settingsOnly: presetSettingsOnly })}
                                    className="w-full py-3 bg-synthux-yellow hover:bg-yellow-400 text-black font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                                >
                                    <Download size={20} />
                                    Export Preset
                                </button>
                                <div className="text-center mt-3 text-xs text-gray-500">
                                    See the <a href="https://github.com/jonwaterschoot/spotykach_WAV_builder/blob/main/public/presets/preset_upload_guide.md" target="_blank" rel="noreferrer" className="text-synthux-action hover:underline">Preset Upload Guide</a> for submission instructions.
                                </div>
                            </div>
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
};
