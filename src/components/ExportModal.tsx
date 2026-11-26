import { X, HardDrive, FileAudio, Archive, Download, Info, Send } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { type FileRecord } from '../types';
import { useEscapeKey } from '../shell/escapeStack';
// dynamic utility imports

interface ExportModalProps {
    files: Record<string, FileRecord>;
    onClose: () => void;
    onExportSD: (options: { directWrite: boolean; skMode: 'clean' | 'overwrite'; includeConfig?: boolean }) => void;
    onExportFiles: (options: { keepStructure: boolean; fileIds: string[] }) => void;
    /** The open project as a project file: the zip Project ▸ Import project file reads back. */
    onExportProject: () => void;
    /**
     * Hand this project to the submission tool instead of downloading it.
     *
     * Optional so the modal keeps working for any caller that has no route to the
     * tool — the button is simply absent then.
     */
    onPrepareSubmission?: () => void;
}

/*
 * Three choices, one per reason to export: move or keep the project, fill a card,
 * or get the audio out. Presets aren't one of them. They are made for the official
 * library through the submission tool, linked at the bottom.
 */
type ExportTab = 'project' | 'sd' | 'files';

const TABS: { id: ExportTab; label: string; icon: ReactNode }[] = [
    { id: 'project', label: 'Project file', icon: <Archive size={18} /> },
    { id: 'sd', label: 'SD card folder', icon: <HardDrive size={18} /> },
    { id: 'files', label: 'Audio files', icon: <FileAudio size={18} /> },
];

const Intro = ({ title, children }: { title: string; children: ReactNode }) => (
    <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-lg flex gap-3">
        <Info className="text-blue-400 shrink-0 mt-1" size={20} />
        <div className="text-sm text-gray-300 space-y-2">
            <strong className="text-blue-400 block">{title}</strong>
            {children}
        </div>
    </div>
);

const primaryButton = 'w-full py-3 bg-synthux-yellow hover:bg-yellow-400 text-black font-bold rounded-lg transition-colors flex items-center justify-center gap-2';

export const ExportModal = ({ files, onClose, onExportSD, onExportFiles, onExportProject, onPrepareSubmission }: ExportModalProps) => {
    const [activeTab, setActiveTab] = useState<ExportTab>('project');

    // Mounted only while shown, so always enabled.
    useEscapeKey(onClose);

    const [filesKeepStructure, setFilesKeepStructure] = useState(true);
    const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set(Object.keys(files)));

    const fileGroup = (parked: boolean) => {
        const entries = Object.entries(files).filter(([, f]) => !!f.isParked === parked);
        if (entries.length === 0) {
            return <div className="text-gray-600 text-xs px-2 italic">{parked ? 'Pool is empty' : 'No assigned files'}</div>;
        }
        return entries.map(([id, file]) => (
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
        ));
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
            <div className="bg-synthux-panel border border-gray-800 rounded-2xl w-full max-w-2xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">

                {/* Header */}
                <div className="p-6 border-b border-gray-800 bg-black/20 shrink-0">
                    <div className="flex justify-between items-center">
                        <h2 className="text-2xl font-bold text-white font-header flex items-center gap-3">
                            <Download className="text-synthux-action" />
                            Export
                        </h2>
                        <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-full transition-colors text-gray-400 hover:text-white">
                            <X size={24} />
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-800 overflow-x-auto shrink-0">
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex-1 min-w-[100px] p-4 flex items-center justify-center gap-2 transition-colors ${activeTab === tab.id ? 'bg-synthux-action/10 text-synthux-action border-b-2 border-synthux-action' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                        >
                            {tab.icon}
                            <span className="font-bold text-sm whitespace-nowrap">{tab.label}</span>
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="p-8 min-h-[300px] flex flex-col overflow-y-auto">

                    {activeTab === 'project' && (
                        <div className="space-y-6 animate-in slide-in-from-right-4 duration-200 fade-in flex flex-col h-full">
                            <Intro title="Project file">
                                <p>
                                    For opening this project on another computer, or a copy to keep. It holds the
                                    tapes, the pool, the notes, the device settings and the current version of every
                                    file, sample-library files too.
                                </p>
                                <p className="text-gray-400">Open it again with Project ▸ Import project file.</p>
                            </Intro>

                            <div className="mt-auto pt-4 border-t border-gray-800">
                                <button onClick={onExportProject} className={primaryButton}>
                                    <Download size={20} />
                                    Download project file
                                </button>
                            </div>
                        </div>
                    )}

                    {activeTab === 'sd' && (
                        <div className="space-y-6 animate-in slide-in-from-right-4 duration-200 fade-in flex flex-col h-full">
                            <Intro title="SD card folder">
                                <p>
                                    The SK folder for the card: every file converted and renamed to the slot that
                                    Spotykach reads it from (<span className="font-mono text-gray-200">SK/B/1.WAV</span> etc.).
                                    Unzip it and copy what's inside to the root of the card.
                                </p>
                                <p className="text-gray-400">
                                    To write to a card directly, use <strong className="text-gray-300">Import / Build SD</strong> in
                                    the header.
                                </p>
                            </Intro>

                            <div className="mt-auto pt-4 border-t border-gray-800">
                                <button
                                    onClick={() => onExportSD({ directWrite: false, skMode: 'clean', includeConfig: true })}
                                    className={primaryButton}
                                >
                                    <Download size={20} />
                                    Download SD card folder
                                </button>
                            </div>
                        </div>
                    )}

                    {activeTab === 'files' && (
                        <div className="flex flex-col h-full animate-in slide-in-from-right-4 duration-200 fade-in">
                            <p className="text-sm text-gray-300 mb-3">The chosen files as WAVs, with their own names.</p>
                            <div className="flex-1 overflow-y-auto mb-4 border border-gray-800 rounded-lg bg-black/20 p-2">
                                <div className="flex flex-wrap gap-4 mb-4 p-2 bg-gray-800/50 rounded-lg">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="structure"
                                            checked={filesKeepStructure}
                                            onChange={() => setFilesKeepStructure(true)}
                                            className="text-synthux-yellow focus:ring-synthux-yellow bg-gray-700 border-gray-600"
                                        />
                                        <span className="text-gray-300 text-sm">A folder per tape (B, G, P…), the rest in POOL</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="structure"
                                            checked={!filesKeepStructure}
                                            onChange={() => setFilesKeepStructure(false)}
                                            className="text-synthux-yellow focus:ring-synthux-yellow bg-gray-700 border-gray-600"
                                        />
                                        <span className="text-gray-300 text-sm">All in one folder</span>
                                    </label>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 px-2">Assigned Files</h3>
                                        {fileGroup(false)}
                                    </div>
                                    <div>
                                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 px-2 border-t border-gray-800 pt-2">Unassigned Pool</h3>
                                        {fileGroup(true)}
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
                                    Download audio files
                                </button>
                            </div>
                        </div>
                    )}

                </div>

                {onPrepareSubmission && (
                    <div className="px-8 py-3 border-t border-gray-800 bg-black/20 shrink-0 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-gray-500">
                        <span>Making a preset for the official library?</span>
                        <button
                            onClick={onPrepareSubmission}
                            className="inline-flex items-center gap-1.5 font-bold text-synthux-turquoise hover:underline"
                        >
                            <Send size={12} />
                            Prepare a submission
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
