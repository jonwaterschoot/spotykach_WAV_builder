import { X, FileAudio, FolderInput, AlertTriangle, Archive, Music, ArrowRight, Check } from 'lucide-react';
import type { ImportAnalysis } from '../utils/importUtils';

interface ImportModalProps {
    analysis: ImportAnalysis;
    onClose: () => void;
    onRestoreProject: (state: any) => void;
    onImportStructure: (structureMap: any) => void;
    onImportFiles: (files: File[]) => void;
}

export const ImportModal = ({ analysis, onClose, onRestoreProject, onImportStructure, onImportFiles }: ImportModalProps) => {

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
            <div className="bg-synthux-panel border border-gray-800 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">

                {/* Header */}
                <div className="flex justify-between items-center p-6 border-b border-gray-800 bg-black/20">
                    <h2 className="text-2xl font-bold text-white font-header flex items-center gap-3">
                        <FolderInput className="text-synthux-turquoise" />
                        Import Content
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-full transition-colors text-gray-400 hover:text-white">
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-8 flex flex-col gap-6">

                    {/* TYPE: PROJECT BACKUP */}
                    {analysis.type === 'PROJECT_BACKUP' && (
                        <div className="space-y-6">
                            <div className="bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-lg flex gap-3">
                                <Archive className="text-yellow-500 shrink-0 mt-1" size={24} />
                                <div>
                                    <h3 className="text-lg font-bold text-yellow-500">Project Backup Detected</h3>
                                    <p className="text-sm text-gray-300 mt-1">
                                        This ZIP contains a full Spotykach project backup.
                                    </p>
                                    <p className="text-xs text-gray-500 mt-2 font-mono">
                                        {analysis.summary}
                                    </p>
                                </div>
                            </div>

                            <div className="grid gap-3">
                                <button
                                    onClick={() => analysis.projectState && onRestoreProject(analysis.projectState)}
                                    className="w-full py-4 px-4 bg-synthux-red hover:bg-red-600 text-white font-bold rounded-lg transition-colors flex items-center justify-between group"
                                >
                                    <div className="flex items-center gap-3">
                                        <AlertTriangle size={20} />
                                        <div className="text-left">
                                            <div>Restore Full Project</div>
                                            <div className="text-xs font-normal opacity-80">Replaces current project entirely</div>
                                        </div>
                                    </div>
                                    <ArrowRight className="opacity-50 group-hover:translate-x-1 transition-transform" />
                                </button>

                                {/* TODO: Extract Files Only option? For now just full restore. */}
                            </div>
                        </div>
                    )}

                    {/* TYPE: SD STRUCTURE */}
                    {analysis.type === 'SD_STRUCTURE' && (
                        <div className="space-y-6">
                            <div className="bg-synthux-blue/10 border border-synthux-blue/20 p-4 rounded-lg flex gap-3">
                                <FolderInput className="text-synthux-blue shrink-0 mt-1" size={24} />
                                <div>
                                    <h3 className="text-lg font-bold text-synthux-blue">SD Card Structure</h3>
                                    <p className="text-sm text-gray-300 mt-1">
                                        Found Spotykach folder structure (SK/B/1.WAV, etc).
                                    </p>
                                    <p className="text-xs text-gray-500 mt-2 font-mono">
                                        {analysis.summary}
                                    </p>
                                </div>
                            </div>

                            <div className="grid gap-3">
                                <button
                                    onClick={() => analysis.structureMap && onImportStructure(analysis.structureMap)}
                                    className="w-full py-4 px-4 bg-synthux-blue hover:bg-blue-600 text-white font-bold rounded-lg transition-colors flex items-center justify-between group"
                                >
                                    <div className="flex items-center gap-3">
                                        <Check size={20} />
                                        <div className="text-left">
                                            <div>Map to Tape Slots</div>
                                            <div className="text-xs font-normal opacity-80">Assigns files to matching slots</div>
                                        </div>
                                    </div>
                                    <ArrowRight className="opacity-50 group-hover:translate-x-1 transition-transform" />
                                </button>

                                <button
                                    onClick={() => {
                                        // Flatten structure map to file list
                                        const files: File[] = [];
                                        if (analysis.structureMap) {
                                            Object.values(analysis.structureMap).forEach(slots => {
                                                Object.values(slots).forEach(f => files.push(f));
                                            });
                                        }
                                        onImportFiles(files);
                                    }}
                                    className="w-full py-3 px-4 bg-gray-700 hover:bg-gray-600 text-gray-200 font-bold rounded-lg transition-colors flex items-center justify-between"
                                >
                                    <div className="flex items-center gap-3">
                                        <FileAudio size={20} />
                                        <div className="text-left">
                                            <div>Import to Pool Only</div>
                                            <div className="text-xs font-normal opacity-80">Add files without assigning slots</div>
                                        </div>
                                    </div>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* TYPE: LOOSE FILES */}
                    {analysis.type === 'LOOSE_FILES' && (
                        <div className="space-y-6">
                            <div className="bg-synthux-green/10 border border-synthux-green/20 p-4 rounded-lg flex gap-3">
                                <Music className="text-synthux-green shrink-0 mt-1" size={24} />
                                <div>
                                    <h3 className="text-lg font-bold text-synthux-green">Audio Files</h3>
                                    <p className="text-sm text-gray-300 mt-1">
                                        Ready to import audio files into the pool.
                                    </p>
                                    <p className="text-xs text-gray-500 mt-2 font-mono">
                                        {analysis.summary}
                                    </p>
                                </div>
                            </div>

                            <div className="grid gap-3">
                                <button
                                    onClick={() => analysis.files && onImportFiles(analysis.files)}
                                    className="w-full py-4 px-4 bg-synthux-green hover:bg-green-600 text-black font-bold rounded-lg transition-colors flex items-center justify-between group"
                                >
                                    <div className="flex items-center gap-3">
                                        <Check size={20} />
                                        <div className="text-left">
                                            <div>Import to Pool</div>
                                            <div className="text-xs font-normal opacity-80">Add {analysis.files?.length} files</div>
                                        </div>
                                    </div>
                                    <ArrowRight className="opacity-50 group-hover:translate-x-1 transition-transform" />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* TYPE: UNKNOWN */}
                    {analysis.type === 'UNKNOWN' && (
                        <div className="space-y-6">
                            <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-lg flex gap-3">
                                <AlertTriangle className="text-red-500 shrink-0 mt-1" size={24} />
                                <div>
                                    <h3 className="text-lg font-bold text-red-500">Unknown Content</h3>
                                    <p className="text-sm text-gray-300 mt-1">
                                        Could not recognize a Spotykach project, SD structure, or standard audio files.
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-lg transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
};
