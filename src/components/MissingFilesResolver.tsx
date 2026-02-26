import { AlertTriangle, FolderSearch, Trash2, ArrowRight } from 'lucide-react';

interface MissingAsset {
    fileId: string;
    fileName: string;
    versionId: string;
    blobRef: string;
    reason: string;
}

interface MissingFilesResolverProps {
    isOpen: boolean;
    missingAssets: MissingAsset[];
    projectName: string | undefined;
    onResolve: (action: 'skip' | 'remove', resolvedIds: string[]) => void;
    onRelocate: (asset: MissingAsset) => void;
}

export const MissingFilesResolver = ({
    isOpen,
    missingAssets,
    projectName,
    onResolve,
    onRelocate
}: MissingFilesResolverProps) => {
    if (!isOpen || missingAssets.length === 0) return null;

    return (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-2xl bg-synthux-panel border border-gray-700 rounded-xl overflow-hidden flex flex-col max-h-[85vh]">

                <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-800 bg-red-950/20">
                    <AlertTriangle className="text-synthux-orange" size={24} />
                    <div>
                        <h2 className="text-lg font-bold text-white">Missing Files Detected</h2>
                        <p className="text-xs text-gray-400">
                            {missingAssets.length} file{missingAssets.length !== 1 && 's'} could not be found while loading {projectName || 'the library'}.
                        </p>
                    </div>
                </div>

                <div className="p-5 flex-1 overflow-y-auto space-y-4">
                    <div className="bg-black/30 border border-gray-800 rounded-lg overflow-hidden">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-900/50 text-gray-400 text-xs uppercase">
                                <tr>
                                    <th className="px-4 py-3 font-medium">File Name</th>
                                    <th className="px-4 py-3 font-medium">Path / Reason</th>
                                    <th className="px-4 py-3 font-medium w-32 text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800">
                                {missingAssets.map((asset) => (
                                    <tr key={asset.blobRef} className="hover:bg-white/5 transition-colors">
                                        <td className="px-4 py-3 font-medium text-gray-300">
                                            {asset.fileName}
                                        </td>
                                        <td className="px-4 py-3 text-xs text-gray-500 font-mono">
                                            <div>{asset.blobRef}</div>
                                            <div className="text-red-400/70 text-[10px] mt-0.5">{asset.reason}</div>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <button
                                                onClick={() => onRelocate(asset)}
                                                className="px-3 py-1 bg-synthux-blue hover:bg-blue-500 text-black text-xs font-bold rounded shadow transition-colors w-full flex items-center justify-center gap-1"
                                            >
                                                <FolderSearch size={14} /> Relocate
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="p-4 bg-gray-900/50 border-t border-gray-800 flex justify-between items-center gap-4">
                    <div className="text-xs text-gray-400 flex-1">
                        If you deleted files outside the app, you can remove them from the index here.
                    </div>

                    <button
                        onClick={() => onResolve('remove', missingAssets.map(a => a.fileId))}
                        className="px-4 py-2 bg-red-950 hover:bg-red-900 text-red-300 rounded font-bold text-sm border border-red-900 transition-colors flex items-center gap-2"
                    >
                        <Trash2 size={16} /> Remove from Index
                    </button>

                    <button
                        onClick={() => onResolve('skip', missingAssets.map(a => a.fileId))}
                        className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded font-bold text-sm transition-colors flex items-center gap-2"
                    >
                        Skip for now <ArrowRight size={16} />
                    </button>
                </div>

            </div>
        </div>
    );
};
