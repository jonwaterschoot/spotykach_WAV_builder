import { useEffect } from 'react';
import { AlertTriangle, FolderSearch, Trash2, ArrowRight, Check } from 'lucide-react';
import { RiSdCardMiniLine } from 'react-icons/ri';

export interface MissingAsset {
    fileId: string;
    fileName: string;
    versionId: string;
    blobRef: string;
    reason: string;
    slots?: string[];
    versionCount?: number;
    sdRecoverable?: boolean;
}

interface MissingFilesResolverProps {
    isOpen: boolean;
    missingAssets: MissingAsset[];
    projectName: string | undefined;
    onResolve: (action: 'skip' | 'remove', resolvedIds: string[]) => void;
    onRelocate: (asset: MissingAsset) => void;
    onRecover: (asset: MissingAsset) => void;
    onRecoverAll: () => void;
    onSmartRelocate: () => void;
    onRecoverSD?: (asset: MissingAsset) => void;
    onRecoverAllSD?: () => void;
}

export const MissingFilesResolver = ({
    isOpen,
    missingAssets,
    projectName,
    onResolve,
    onRelocate,
    onRecover,
    onRecoverAll,
    onSmartRelocate,
    onRecoverSD,
    onRecoverAllSD
}: MissingFilesResolverProps) => {
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onResolve('skip', missingAssets.map(a => a.fileId));
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onResolve, missingAssets]);

    if (!isOpen || missingAssets.length === 0) return null;

    const sdMatchCount = missingAssets.filter(a => a.sdRecoverable).length;

    return (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-2xl bg-synthux-panel border border-gray-700 rounded-xl overflow-hidden flex flex-col max-h-[85vh]">

                <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-800 bg-red-950/20">
                    <AlertTriangle className="text-synthux-orange" size={24} />
                    <div className="flex-1">
                        <h2 className="text-lg font-bold text-white">Missing Files Detected</h2>
                        <p className="text-xs text-gray-400">
                            {missingAssets.length} file{missingAssets.length !== 1 && 's'} missing from {projectName || 'the library'}.
                            {sdMatchCount > 0 && (
                                <span className="ml-1.5 px-1.5 py-0.5 bg-green-900/40 text-green-400 rounded text-[10px] font-bold border border-green-800/50">
                                    {sdMatchCount} Found on SD Backup
                                </span>
                            )}
                        </p>
                    </div>
                    <button
                        onClick={onSmartRelocate}
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-black text-xs font-bold rounded flex items-center gap-1.5 transition-colors shadow-lg"
                    >
                        <FolderSearch size={14} /> Smart Scan Folder
                    </button>
                </div>

                <div className="p-5 flex-1 overflow-y-auto space-y-4">
                    <div className="bg-black/30 border border-gray-800 rounded-lg overflow-hidden">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-900/50 text-gray-400 text-xs uppercase">
                                <tr>
                                    <th className="px-4 py-8 font-medium">Asset Diagnostic</th>
                                    <th className="px-4 py-3 font-medium w-48 text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800">
                                {missingAssets.map((asset) => (
                                    <tr key={asset.blobRef} className="hover:bg-white/5 transition-colors">
                                        <td className="px-4 py-4">
                                            <div className="space-y-1">
                                                <div className="font-bold text-white text-base tracking-tight">{asset.fileName}</div>
                                                <div className="flex flex-wrap gap-2 items-center">
                                                    {asset.slots && asset.slots.length > 0 && (
                                                        <span className="px-1.5 py-0.5 bg-gray-800 rounded text-[10px] text-gray-300 font-mono">
                                                            Slot(s): {asset.slots.join(', ')}
                                                        </span>
                                                    )}
                                                    {asset.versionCount !== undefined && (
                                                        <span className="px-1.5 py-0.5 bg-blue-900/30 rounded text-[10px] text-blue-300 border border-blue-800/50">
                                                            {asset.versionCount} Version{asset.versionCount !== 1 ? 's' : ''}
                                                        </span>
                                                    )}
                                                    {asset.sdRecoverable && (
                                                        <span className="px-1.5 py-0.5 bg-green-900/30 rounded text-[10px] text-green-300 border border-green-800/50 flex items-center gap-1">
                                                            <Check size={10} /> SD Match
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-[11px] text-gray-500 font-mono break-all opacity-60">
                                                    {asset.blobRef}
                                                </div>
                                                <div className="text-red-400/80 text-[10px] font-medium italic">{asset.reason}</div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-4 align-top">
                                            <div className="flex flex-col gap-1.5">
                                                <button
                                                    onClick={() => onRecover(asset)}
                                                    className="px-3 py-1 bg-green-600 hover:bg-green-500 text-white text-[10px] font-bold rounded shadow transition-colors w-full flex items-center justify-center gap-1.5"
                                                    title="Recreate from browser cache"
                                                >
                                                    <FolderSearch size={12} /> Recover from Cache
                                                </button>
                                                {asset.sdRecoverable && onRecoverSD && (
                                                    <button
                                                        onClick={() => onRecoverSD(asset)}
                                                        className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold rounded shadow transition-colors w-full flex items-center justify-center gap-1.5"
                                                        title="Restore from SD backup"
                                                    >
                                                        <RiSdCardMiniLine size={12} /> Recover from SD
                                                    </button>
                                                )}
                                                <div className="flex gap-1">
                                                    <button
                                                        onClick={() => onRelocate(asset)}
                                                        className="flex-1 px-2 py-1 bg-synthux-blue hover:bg-blue-500 text-black text-[10px] font-bold rounded shadow transition-colors flex items-center justify-center gap-1"
                                                        title="Locate file manually"
                                                    >
                                                        <FolderSearch size={12} /> Relocate
                                                    </button>
                                                </div>
                                            </div>
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

                    <div className="flex items-center gap-2">
                        {sdMatchCount > 0 && onRecoverAllSD && (
                            <button
                                onClick={onRecoverAllSD}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-bold text-sm shadow-lg shadow-indigo-900/20 transition-colors flex items-center gap-2"
                            >
                                <RiSdCardMiniLine size={16} /> Recover All (SD)
                            </button>
                        )}

                        <button
                            onClick={onRecoverAll}
                            className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded font-bold text-sm shadow-lg shadow-green-900/20 transition-colors flex items-center gap-2"
                        >
                            <FolderSearch size={16} /> Recover All (Cache)
                        </button>

                        <button
                            onClick={() => onResolve('remove', missingAssets.map(a => a.fileId))}
                            className="px-4 py-2 bg-red-950 hover:bg-red-900 text-red-300 rounded font-bold text-sm border border-red-900 transition-colors flex items-center gap-2"
                        >
                            <Trash2 size={16} /> Bulk Purge
                        </button>
                    </div>

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
