import React, { useState, useMemo } from 'react';
import { Folder, FolderOpen, HardDrive, Trash2, Edit2, X, Check, Copy, ArrowLeftRight, RefreshCw, Save, Download, Upload, AlertTriangle, HelpCircle } from 'lucide-react';
import { RiSdCardMiniLine } from 'react-icons/ri';
import type { ProjectSummary } from '../types';
import { SlotGrid6x6 } from './SlotGrid6x6';

interface ProjectManagerProps {
    isOpen: boolean;
    onClose: () => void;
    projects: ProjectSummary[];
    onLoadProject: (projectName: string) => void;
    onSaveProject: (projectName: string) => void;
    onCreateEmptyProject: (projectName: string) => void;
    currentProjectName?: string;
    hasUnsavedChanges?: boolean;
    onDeleteProject?: (name: string) => void;
    onDeleteBackupProject?: (name: string) => void;
    onRenameProject?: (oldName: string, newName: string, renameBackup?: boolean) => void;
    onDuplicateProject?: (sourceName: string, newName: string) => void;
    workHandle?: FileSystemDirectoryHandle | null;
    backupHandle?: FileSystemDirectoryHandle | null;
    onChangeWorkFolder?: () => void;
    onChangeBackupFolder?: () => void;
    onSyncProject?: (projectName: string) => void;
    onBuildProject?: (projectName: string) => void;
    onImportSK?: () => void;
    onSyncUserLibraryToSD?: () => void;
    activeSKProject?: string;
    deviceDiff?: import('../utils/importUtils').DeviceDiff;
    onScan: () => void;
    isScanning?: boolean;
    onCleanupProject?: (options?: { removeUnusedFiles: boolean }) => void;
    onImportZip?: () => void;
    onExportZip?: (projectName: string, settingsOnly?: boolean) => void;
    onOpenHelp?: () => void;
}

// Sub-component for the editable input to handle focus/select properly on mount
const ProjectNameInput = ({
    value,
    onChange,
    onSave,
    onCancel
}: {
    value: string,
    onChange: (val: string) => void,
    onSave: () => void,
    onCancel: () => void
}) => {
    const inputRef = React.useRef<HTMLInputElement>(null);

    React.useEffect(() => {
        if (inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, []);

    return (
        <input
            ref={inputRef}
            value={value}
            onChange={e => onChange(e.target.value)}
            className="bg-black border border-indigo-500 rounded px-1 text-sm text-white w-24"
            onKeyDown={e => {
                if (e.key === 'Enter') onSave();
                if (e.key === 'Escape') onCancel();
            }}
            onBlur={() => {
                // Optional: Save on blur? Or Cancel?
                // Standard behavior often saves or just leaves edit mode.
                // Let's stick to explicit Enter/Escape for now to match previous logic,
                // but we could just do nothing.
            }}
        />
    );
};

export const ProjectManager: React.FC<ProjectManagerProps> = ({
    isOpen,
    onClose,
    projects,
    onLoadProject,
    onSaveProject,
    onCreateEmptyProject,
    currentProjectName,
    hasUnsavedChanges,
    onDeleteProject,
    onRenameProject,
    onDuplicateProject,
    workHandle,
    backupHandle,
    onChangeWorkFolder,
    onChangeBackupFolder,
    onSyncProject,
    onBuildProject,
    onImportSK,
    onSyncUserLibraryToSD,
    onDeleteBackupProject,
    activeSKProject,
    deviceDiff,
    onScan,
    isScanning,
    onCleanupProject,
    onImportZip,
    onExportZip,
    onOpenHelp,
}) => {
    const [editingProject, setEditingProject] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [autoSaveBanner, setAutoSaveBanner] = useState<string | null>(null);

    const [renameConfirm, setRenameConfirm] = useState<{ oldName: string, newName: string } | null>(null);
    const [isSDExpanded, setIsSDExpanded] = useState(false);
    const [exportSettingsOnly, setExportSettingsOnly] = useState(false);


    // Track pending creation to auto-edit
    const [pendingCreate, setPendingCreate] = useState<string | null>(null);

    // Guard: save the current project before syncing so the backup doesn't get stale data.
    const handleSyncWithGuard = (projectName: string) => {
        if (onSyncProject) {
            if (currentProjectName === projectName && hasUnsavedChanges) {
                onSaveProject(projectName);
                setAutoSaveBanner(`"${projectName}" had unsaved changes — auto-saved before sync.`);
                setTimeout(() => setAutoSaveBanner(null), 5000);
            }
            onSyncProject(projectName);
        }
    };

    // Effect to trigger edit mode when pending project appears
    React.useEffect(() => {
        if (pendingCreate) {
            const projectExists = projects.find(p => p.name === pendingCreate);
            if (projectExists) {
                // We need to define startEdit or use setEditingProject directly if startEdit is not hoisted?
                // startEdit is defined below.
                // Let's just set state directly here to be safe and simple.
                setEditingProject(pendingCreate);
                setEditName(pendingCreate);
                setPendingCreate(null);
            }
        }
    }, [projects, pendingCreate]);

    // Prepare Rows
    const rows = useMemo(() => {
        const workProjs = projects.filter(p => p.status === 'local' || p.status === 'synced' || p.status === 'modified');
        const backProjs = projects.filter(p => p.status === 'backup' || p.status === 'synced' || p.status === 'modified');

        const allNames = Array.from(new Set([...workProjs.map(p => p.name), ...backProjs.map(p => p.name)]));

        return allNames.sort().map(name => {
            return {
                name,
                local: workProjs.find(p => p.name === name),
                backup: backProjs.find(p => p.name === name)
            };
        });
    }, [projects]);


    if (!isOpen) return null;

    const startEdit = (name: string) => {
        setEditingProject(name);
        setEditName(name);
    };

    const cancelEdit = () => {
        setEditingProject(null);
        setEditName('');
    };

    const saveEdit = (oldName: string) => {
        setEditingProject(null); // Close edit mode immediately

        if (editName && editName !== oldName && onRenameProject) {
            const project = projects.find(p => p.name === oldName);

            if (project && project.local && project.backup) {
                // Synced project - Show custom confirm modal
                setRenameConfirm({ oldName, newName: editName });
            } else {
                // Not synced, just rename
                onRenameProject(oldName, editName, false);
            }
        }
    };

    const handleConfirmMyRename = (alsoBackup: boolean) => {
        if (renameConfirm && onRenameProject) {
            onRenameProject(renameConfirm.oldName, renameConfirm.newName, alsoBackup);
        }
        setRenameConfirm(null);
    };

    const handleDuplicate = (name: string) => {
        // Creates a duplicate row on the side where it exists
        // If it exists on both, usually duplicate the Local version
        const newName = prompt(`Enter name for copy of "${name}":`, `${name}_Copy`);
        if (newName && onDuplicateProject) {
            onDuplicateProject(name, newName);
        }
    };

    const handleCreateNew = () => {
        let baseName = `Project_${new Date().toISOString().slice(0, 10)}`;
        let newName = baseName;
        let counter = 1;

        while (projects.some(p => p.name === newName)) {
            newName = `${baseName}_${counter}`;
            counter++;
        }

        onCreateEmptyProject(newName);
        setPendingCreate(newName);
    };

    const handleDuplicateActive = () => {
        let baseName = currentProjectName ? `${currentProjectName}_Copy` : `Project_Copy`;
        let newName = baseName;
        let counter = 1;

        while (projects.some(p => p.name === newName)) {
            newName = `${baseName}_${counter}`;
            counter++;
        }

        onSaveProject(newName);
        setPendingCreate(newName);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#121212] w-full max-w-6xl rounded-2xl border border-white/10 flex flex-col shadow-2xl overflow-hidden h-[90vh] relative">

                {/* RENAME CONFIRM MODAL OVERLAY */}
                {renameConfirm && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md">
                        <div className="bg-[#1a1a1a] p-6 rounded-xl border border-indigo-500/50 shadow-2xl max-w-md w-full animate-in fade-in zoom-in duration-200">
                            <h3 className="text-xl font-bold text-white mb-4">Rename Synced Project?</h3>
                            <p className="text-gray-300 mb-6">
                                You are renaming "<strong>{renameConfirm.oldName}</strong>" to "<strong>{renameConfirm.newName}</strong>".
                                <br /><br />
                                This project is currently synced to the Backup Drive. Do you want to rename it there as well to keep them linked?
                            </p>
                            <div className="flex flex-col gap-3">
                                <button
                                    onClick={() => handleConfirmMyRename(true)}
                                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold flex items-center justify-center gap-2 transition-colors"
                                >
                                    <Check size={18} /> Yes, Rename Both (Keep Synced)
                                </button>
                                <button
                                    onClick={() => handleConfirmMyRename(false)}
                                    className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
                                >
                                    No, Only Rename Local (Unlink)
                                </button>
                                <button
                                    onClick={() => setRenameConfirm(null)}
                                    className="w-full py-2 text-gray-500 hover:text-white text-sm mt-2"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* HEAD */}
                <header className="flex items-center justify-between p-6 border-b border-white/10 bg-[#1a1a1a] shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-indigo-500/20 rounded-xl">
                            <FolderOpen size={24} className="text-indigo-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">Project Manager</h2>
                            <p className="text-gray-400 text-sm">Synchronize Work Folder and SD Card</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onScan}
                            className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
                            title="Rescan Projects & Device"
                        >
                            <RefreshCw size={20} className={isScanning ? "animate-spin" : ""} />
                        </button>
                        {onOpenHelp && (
                            <button
                                onClick={onOpenHelp}
                                className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
                                title="Open Help"
                            >
                                <HelpCircle size={20} />
                            </button>
                        )}
                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white">
                            <X size={24} />
                        </button>
                    </div>
                </header>

                {/* SUB HEADER - SD CARD STATUS */}
                {backupHandle && (
                    <div className="flex flex-col border-b border-white/5 bg-[#111] shrink-0">

                        {/* Clickable row — whole row toggles expand */}
                        <button
                            className="w-full px-4 py-2 flex items-center justify-between hover:bg-white/[0.02] transition-colors cursor-pointer"
                            onClick={() => setIsSDExpanded(!isSDExpanded)}
                        >
                            <div className="flex items-center gap-3">
                                {activeSKProject ? (
                                    <div className="flex items-center gap-2 text-sm">
                                        <RiSdCardMiniLine size={16} className="text-indigo-400" />
                                        <span className="text-gray-300">
                                            SK folder: <strong className="text-white">{activeSKProject}</strong>
                                        </span>
                                        {deviceDiff && deviceDiff.newFiles.length > 0 && (
                                            <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full font-bold">
                                                {deviceDiff.newFiles.length} new
                                            </span>
                                        )}
                                        {deviceDiff && deviceDiff.updatedFiles.length > 0 && (
                                            <span className="text-[10px] bg-orange-500/20 text-orange-300 px-2 py-0.5 rounded-full font-bold">
                                                {deviceDiff.updatedFiles.length} modified
                                            </span>
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 text-sm text-gray-500">
                                        <RiSdCardMiniLine size={16} />
                                        <span>No project active on hardware.</span>
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center gap-3">
                                {onImportSK && (
                                    <span
                                        onClick={(e) => { e.stopPropagation(); onImportSK(); }}
                                        className="flex items-center gap-1.5 px-2.5 py-1 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 text-orange-300 rounded text-[10px] uppercase font-bold transition-colors cursor-pointer"
                                        title="Import SK from SD into project"
                                    >
                                        <RiSdCardMiniLine size={10} /> Import Sync
                                    </span>
                                )}
                                <span className="text-[10px] text-gray-600 select-none">
                                    {isSDExpanded ? '▲ Hide' : '▼ Show'}
                                </span>
                            </div>
                        </button>

                        {/* EXPANDABLE SD GRID — always 6×6, grey placeholder for empty slots */}
                        {isSDExpanded && (() => {
                            const allFiles = [
                                ...(deviceDiff?.newFiles || []),
                                ...(deviceDiff?.updatedFiles || []),
                                ...(deviceDiff?.syncedFiles || []),
                            ];
                            const sdSlots: Record<string, import('./SlotGrid6x6').SlotEntry> = {};
                            allFiles.forEach(f => {
                                const color = f.slot.replace(/\d+$/, '');
                                const num = parseInt(f.slot.replace(/^\D+/, ''), 10);
                                sdSlots[f.slot] = { slotKey: f.slot, color, num, blob: f.file, name: f.slot };
                            });
                            return (
                                <div className="px-4 pt-3 pb-4 bg-[#0a0a0a] border-t border-white/5 flex justify-center">
                                    <SlotGrid6x6
                                        slots={sdSlots}
                                        title="SK Hardware Slots"
                                        titleIcon={<RiSdCardMiniLine size={12} className="text-indigo-400" />}
                                        className="w-1/2"
                                    />
                                </div>
                            );
                        })()}
                    </div>
                )}

                {/* COLUMNS HEADER */}
                <div className="flex border-b border-white/10 bg-[#151515] text-sm font-bold text-gray-400 uppercase tracking-wider shrink-0">
                    <div className="flex-1 p-4 flex items-center gap-2 border-r border-white/5">
                        <HardDrive size={14} className="text-indigo-400" />
                        <span className="text-white">Work Folder</span>
                        {workHandle && <span className="text-[10px] bg-indigo-500/10 px-1.5 py-0.5 rounded text-indigo-300 normal-case">{workHandle.name}</span>}
                        {onChangeWorkFolder && <button onClick={onChangeWorkFolder} className="ml-auto text-xs text-indigo-400 hover:underline normal-case">Change</button>}
                    </div>
                    <div className="w-56 p-4 text-center border-r border-white/5 bg-[#111] flex items-center justify-center">
                        <span className="text-gray-500 text-[10px]">Sync Actions</span>
                    </div>
                    <div className="flex-1 p-4 flex items-center gap-2">
                        <RiSdCardMiniLine size={16} className="text-orange-400" />
                        <span className="text-white">SD Card / Backup</span>
                        {backupHandle ? (
                            <span className="text-[10px] bg-orange-500/10 px-1.5 py-0.5 rounded text-orange-300 normal-case">{backupHandle.name}</span>
                        ) : (
                            <span className="text-[10px] text-gray-600 italic normal-case">Not Connected</span>
                        )}
                        {onChangeBackupFolder && <button onClick={onChangeBackupFolder} className="ml-auto text-xs text-orange-400 hover:underline normal-case">{backupHandle ? 'Change' : 'Connect'}</button>}

                        {/* Sync User Library Button */}
                        {onSyncUserLibraryToSD && backupHandle && (
                            <button
                                onClick={onSyncUserLibraryToSD}
                                className="ml-4 mr-2 px-2 py-1 bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/30 text-orange-300 rounded text-[10px] uppercase font-bold transition-colors"
                                title="Sync My Library to SD Card"
                            >
                                Sync Lib
                            </button>
                        )}

                        {/* Import Device Changes (Legacy or Specific) */}
                    </div>
                </div>

                {/* ROWS CONTENT */}
                <div className="flex-1 overflow-y-scroll bg-[#0f0f0f]">
                    {rows.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full opacity-50 space-y-4">
                            <Folder size={48} className="text-gray-600" />
                            <p>No projects found. Create one directly or check your folders.</p>
                        </div>
                    )}

                    {rows.map((row) => (
                        <div key={row.name} className="flex border-b border-white/5 hover:bg-white/5 transition-colors group">

                            {/* LOCAL CELL */}
                            <div className="flex-1 p-3 border-r border-white/5 relative">
                                {row.local ? (
                                    <div className={`h-full rounded-lg p-3 border flex flex-col justify-between ${currentProjectName === row.name ? 'bg-indigo-500/10 border-indigo-500/50' : 'bg-[#1e1e1e] border-white/5'}`}>
                                        <div className="flex justify-between items-start">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center text-indigo-300 font-bold text-sm">
                                                    {row.name.charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    {editingProject === row.name ? (
                                                        <div className="flex items-center gap-1">
                                                            <ProjectNameInput
                                                                value={editName}
                                                                onChange={setEditName}
                                                                onSave={() => saveEdit(row.name)}
                                                                onCancel={cancelEdit}
                                                            />
                                                            <Check size={14} className="text-green-400 cursor-pointer" onClick={() => saveEdit(row.name)} />
                                                        </div>
                                                    ) : (
                                                        <div className="font-medium text-white flex items-center gap-2 group/title">
                                                            {row.name}
                                                            {currentProjectName === row.name && hasUnsavedChanges && (
                                                                <button
                                                                    onClick={() => onSaveProject(row.name)}
                                                                    className="text-[10px] bg-yellow-500/20 text-yellow-300 px-1.5 py-0.5 rounded font-bold border border-yellow-500/30 flex items-center gap-1 hover:bg-yellow-500/30 transition-colors cursor-pointer"
                                                                    title="Click to save now"
                                                                >
                                                                    <Save size={8} /> UNSAVED
                                                                </button>
                                                            )}
                                                            <Edit2
                                                                size={12}
                                                                className="text-gray-500 opacity-0 group-hover/title:opacity-100 hover:text-white cursor-pointer transition-opacity"
                                                                onClick={() => startEdit(row.name)}
                                                            />
                                                        </div>
                                                    )}
                                                    <div className="flex items-center gap-2 text-[10px] text-gray-400">
                                                        <span>{row.local.fileCount} files</span>
                                                    </div>
                                                </div>
                                            </div>
                                            {!editingProject && (
                                                <button
                                                    onClick={() => onLoadProject(row.name)}
                                                    className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${currentProjectName === row.name ? 'bg-indigo-500 text-white' : 'bg-white/10 text-gray-400 hover:text-white'}`}
                                                >
                                                    {currentProjectName === row.name ? 'Active' : 'Load'}
                                                </button>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                                            {onDuplicateProject && <button onClick={() => handleDuplicate(row.name)} className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white" title="Duplicate"><Copy size={12} /></button>}
                                            {onRenameProject && <button onClick={() => startEdit(row.name)} className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white" title="Rename"><Edit2 size={12} /></button>}
                                            {onExportZip && <button onClick={() => onExportZip(row.name, exportSettingsOnly)} className="p-1 hover:bg-indigo-500/10 rounded text-gray-400 hover:text-indigo-400" title={`Export project as Zip${exportSettingsOnly ? ' (Settings Only)' : ''}`}><Download size={12} /></button>}
                                            {onDeleteProject && <button onClick={() => onDeleteProject(row.name)} className="p-1 hover:bg-red-500/10 rounded text-gray-400 hover:text-red-400" title="Delete Local"><Trash2 size={12} /></button>}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="h-full flex items-center justify-center opacity-30">
                                        <div className="w-full h-full border-2 border-dashed border-gray-700 rounded-lg"></div>
                                    </div>
                                )}
                            </div>


                            {/* ACTIONS CELL */}
                            <div className="w-56 p-2 border-r border-white/5 bg-[#121212] flex flex-col items-center justify-center gap-2">
                                {(row.local && row.backup && (row.local.status === 'synced' || row.backup.status === 'synced')) ? (
                                    <>
                                        <div className="flex flex-col gap-1 items-center mb-1">
                                            <div className="text-[10px] bg-green-500/10 text-green-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                                                <Check size={8} /> Backup Synced
                                            </div>
                                            {activeSKProject === row.name ? (
                                                (deviceDiff && (deviceDiff.newFiles.length > 0 || deviceDiff.updatedFiles.length > 0)) ? (
                                                    <div className="text-[9px] bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded-full flex items-center gap-1 font-bold animate-pulse" title="Hardware SD:/SK folder doesn't match project">
                                                        <RefreshCw size={8} /> Hardware Differs
                                                    </div>
                                                ) : (
                                                    <div className="text-[9px] bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded-full flex items-center gap-1" title="Hardware SD:/SK folder matches this project">
                                                        <Check size={8} /> Hardware Synced
                                                    </div>
                                                )
                                            ) : (
                                                <div className="text-[9px] bg-gray-500/10 text-gray-400 px-2 py-0.5 rounded-full" title="Another project is currently pushed to hardware">
                                                    Not on Hardware
                                                </div>
                                            )}
                                        </div>

                                        {/* Force Push/Pull */}
                                        <div className="flex flex-col gap-2 mt-2 w-full px-2">
                                            {onBuildProject && (
                                                (activeSKProject === row.name && deviceDiff && deviceDiff.newFiles.length === 0 && deviceDiff.updatedFiles.length === 0) ? (
                                                    <button onClick={() => onBuildProject(row.name)} className="flex items-center justify-center gap-1.5 w-full py-1.5 bg-indigo-500/5 hover:bg-indigo-500/10 border border-indigo-500/20 text-indigo-400/70 rounded text-[10px] uppercase font-bold transition-colors" title="Hardware is up-to-date (Click to force reinstall)">
                                                        <Check size={12} className="text-indigo-400" /> Hardware Up-to-Date
                                                    </button>
                                                ) : (
                                                    <button onClick={() => onBuildProject(row.name)} className="flex items-center justify-center gap-1.5 w-full py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded text-[10px] uppercase font-bold transition-colors" title="Push Update to SK Hardware">
                                                        <HardDrive size={12} /> Build SD (Push)
                                                    </button>
                                                )
                                            )}
                                            {onSyncProject && (
                                                <button onClick={() => handleSyncWithGuard(row.name)} className="flex items-center justify-center gap-1.5 w-full py-1.5 bg-green-500/5 hover:bg-green-500/10 border border-green-500/20 text-green-500/70 rounded text-[10px] uppercase font-bold transition-colors" title="Compare and sync local ↔ backup">
                                                    <ArrowLeftRight size={12} className="text-green-500" /> Sync ↕ Backup
                                                </button>
                                            )}
                                        </div>
                                    </>
                                ) : (row.local && row.backup && (row.local.status === 'modified' || row.backup.status === 'modified')) ? (
                                    <>
                                        <div className="flex flex-col gap-1 items-center mb-1">
                                            <div className="text-[10px] bg-orange-500/10 text-orange-400 px-2 py-0.5 rounded-full flex items-center gap-1 font-bold animate-pulse">
                                                <RefreshCw size={8} /> Backup Modified
                                            </div>
                                            {activeSKProject === row.name && (
                                                <div className="text-[9px] bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded-full flex items-center gap-1 font-bold animate-pulse">
                                                    <RefreshCw size={8} /> Hardware Differs
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex flex-col gap-2 mt-2 w-full px-2">
                                            {onBuildProject && (
                                                <button onClick={() => onBuildProject(row.name)} className="flex items-center justify-center gap-1 w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[10px] uppercase font-bold shadow-sm transition-colors">
                                                    <HardDrive size={12} /> Build SD (Push)
                                                </button>
                                            )}
                                            {onSyncProject && (
                                                <button onClick={() => handleSyncWithGuard(row.name)} className="flex items-center justify-center gap-1 w-full py-1.5 bg-orange-500/15 hover:bg-orange-500/25 border border-orange-500/30 text-orange-300 rounded text-[10px] uppercase font-bold shadow-sm transition-colors">
                                                    <ArrowLeftRight size={12} /> Sync ↕ Backup
                                                </button>
                                            )}
                                        </div>
                                    </>
                                ) : row.local && !row.backup ? (
                                    <div className="flex flex-col items-center gap-2 w-full px-2">
                                        {onBuildProject && (
                                            <button onClick={() => onBuildProject(row.name)} className="flex items-center justify-center gap-1 w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-[10px] uppercase font-bold transition-colors">
                                                <HardDrive size={12} /> Push SK to SD Root
                                            </button>
                                        )}
                                        {onSyncProject && (
                                            <button onClick={() => handleSyncWithGuard(row.name)} className="flex items-center justify-center gap-1 w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-[10px] uppercase font-bold transition-colors">
                                                <ArrowLeftRight size={12} /> Sync to Backup
                                            </button>
                                        )}
                                        <span className="text-[9px] text-gray-500 uppercase tracking-widest mt-1">Not on SD yet</span>
                                    </div>
                                ) : !row.local && row.backup ? (
                                    <div className="flex flex-col items-center gap-1">
                                        {onSyncProject && (
                                            <button onClick={() => handleSyncWithGuard(row.name)} className="flex items-center gap-1 px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-md text-xs transition-colors">
                                                <ArrowLeftRight size={12} /> <span>Sync from Backup</span>
                                            </button>
                                        )}
                                        <span className="text-[10px] text-gray-500">Missing Locally</span>
                                    </div>
                                ) : null}
                            </div>


                            {/* BACKUP CELL */}
                            <div className="flex-1 p-3 relative">
                                {row.backup ? (
                                    <div className="h-full rounded-lg p-3 bg-[#181818] border border-white/5 flex flex-col justify-between">
                                        <div className="flex justify-between items-start">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500/20 to-red-500/20 flex items-center justify-center text-orange-300 font-bold text-sm">
                                                    {row.name.charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-gray-300 text-sm flex items-center gap-2">
                                                        {row.name}
                                                        {activeSKProject === row.name && (
                                                            <span className="text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded font-bold uppercase tracking-wider animate-pulse">
                                                                Live on SK
                                                            </span>
                                                        )}
                                                    </h3>
                                                    <div className="flex items-center gap-2 text-[10px] text-gray-500">
                                                        <span>{row.backup.fileCount} files</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                                            {onDeleteBackupProject && (
                                                <button
                                                    onClick={() => onDeleteBackupProject(row.name)}
                                                    className="p-1 hover:bg-red-500/10 rounded text-gray-400 hover:text-red-400 transition-colors"
                                                    title="Delete from SD Backup"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="h-full flex items-center justify-center opacity-30">
                                        <div className="w-full h-full border-2 border-dashed border-gray-700 rounded-lg"></div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                {/* FOOTER */}
                <div className="p-4 border-t border-white/10 bg-[#1a1a1a] flex flex-col gap-3 shrink-0">
                    {/* Auto-save banner */}
                    {autoSaveBanner && (
                        <div className="flex items-center gap-2 px-4 py-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-yellow-300 text-xs font-medium">
                            <AlertTriangle size={13} className="shrink-0" />
                            {autoSaveBanner}
                        </div>
                    )}
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <span className="text-sm text-gray-500">{rows.length} Projects Total</span>
                            {onImportZip && (
                                <button
                                    onClick={onImportZip}
                                    className="px-3 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 text-indigo-300 font-bold rounded-lg flex items-center gap-2 transition-colors text-xs"
                                    title="Import project from a .zip file"
                                >
                                    <Upload size={14} /> Import from Zip
                                </button>
                            )}
                            {onExportZip && (
                                <label className="flex items-center gap-2 text-[10px] text-gray-400 hover:text-gray-300 cursor-pointer ml-2">
                                    <input 
                                        type="checkbox" 
                                        checked={exportSettingsOnly} 
                                        onChange={(e) => setExportSettingsOnly(e.target.checked)} 
                                        className="rounded border-gray-600 bg-black/40 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-0 w-3 h-3"
                                    />
                                    Settings-Only ZIP
                                </label>
                            )}
                        </div>
                        <div className="flex gap-3">
                            {currentProjectName && onCleanupProject && (
                                <button
                                    onClick={() => { onCleanupProject(); onClose(); }}
                                    className="px-4 py-2.5 bg-red-600/10 hover:bg-red-600/20 border border-red-500/20 text-red-500 font-bold rounded-lg flex items-center gap-2 transition-colors"
                                    title="Clean Up Active Project"
                                >
                                    <Trash2 size={16} /> Clean Up
                                </button>
                            )}
                            <button
                                onClick={handleDuplicateActive}
                                className="px-6 py-2.5 bg-[#252525] hover:bg-[#333] text-gray-300 font-bold rounded-lg flex items-center gap-2 transition-colors border border-white/5"
                            >
                                <Copy size={18} /> Duplicate Active
                            </button>
                            <button
                                onClick={handleCreateNew}
                                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg flex items-center gap-2 transition-colors shadow-lg shadow-indigo-500/20"
                            >
                                <Folder size={18} /> Create Empty Project
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
