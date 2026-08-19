import React, { useEffect, useState, useMemo } from 'react';
import { Folder, FolderOpen, HardDrive, Layers, Trash2, Edit2, X, Check, Copy, RefreshCw, Save, Download, Upload, HelpCircle } from 'lucide-react';
import { RiSdCardMiniLine } from 'react-icons/ri';
import type { ProjectSummary } from '../types';
import { loadBrowsePoolSummaryFromDB, type BrowsePoolSummary } from '../utils/persistence';
import { SlotGrid6x6 } from './SlotGrid6x6';

/**
 * The Project Manager — Phase 7, step 3.
 *
 * This used to be a two-column mirror: Work Folder on the left, "SD Card / Backup"
 * on the right, and a column of sync actions between them. Locked decision 6 retired
 * that mirror — the card is a build target, not a backup — and Phase 4 turned off the
 * copying, but the screen the user actually reads still described it.
 *
 * What is left is a list of projects, plus the two card relationships that are still
 * real:
 *
 *   - **the build** — which project is in `SK/` on the card right now, and whether it
 *     still matches ("Import Sync" reads device changes back into the project);
 *   - **migration** — projects an older version left on a card, which can be imported
 *     into the workspace. Reading a card is not mirroring it.
 *
 * Gone with the mirror: "Sync ↕ Backup" in its three variants, "Sync Lib", "Delete
 * from SD Backup", the rename-on-the-backup-drive prompt, the Backup Synced / Backup
 * Modified badges, and the save-before-sync banner (auto-save covers that now).
 */
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
    onRenameProject?: (oldName: string, newName: string) => void;
    onDuplicateProject?: (sourceName: string, newName: string) => void;
    workHandle?: FileSystemDirectoryHandle | null;
    sdHandle?: FileSystemDirectoryHandle | null;
    onChangeWorkFolder?: () => void;
    onChangeSDFolder?: () => void;
    onImportBackupProject?: (projectName: string) => void;
    onBuildProject?: (projectName: string) => void;
    onImportSK?: () => void;
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
            className="bg-black border border-indigo-500 rounded px-1 text-sm text-white w-40"
            onKeyDown={e => {
                if (e.key === 'Enter') onSave();
                if (e.key === 'Escape') onCancel();
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
    sdHandle,
    onChangeWorkFolder,
    onChangeSDFolder,
    onImportBackupProject,
    onBuildProject,
    onImportSK,
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
    const [isSDExpanded, setIsSDExpanded] = useState(false);
    const [exportSettingsOnly, setExportSettingsOnly] = useState(false);

    // Track pending creation to auto-edit
    const [pendingCreate, setPendingCreate] = useState<string | null>(null);

    /** Browse's pool, if there is one. Re-read each time this modal opens. */
    const [poolSummary, setPoolSummary] = useState<BrowsePoolSummary | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;
        loadBrowsePoolSummaryFromDB()
            .then(summary => { if (!cancelled) setPoolSummary(summary); })
            .catch(e => console.warn('Could not read the temporary pool summary', e));
        return () => { cancelled = true; };
    }, [isOpen]);

    // Effect to trigger edit mode when pending project appears
    React.useEffect(() => {
        if (pendingCreate) {
            const projectExists = projects.find(p => p.name === pendingCreate);
            if (projectExists) {
                setEditingProject(pendingCreate);
                setEditName(pendingCreate);
                setPendingCreate(null);
            }
        }
    }, [projects, pendingCreate]);

    /**
     * Two lists, not two columns.
     *
     * `status` still carries the four-value mirror vocabulary because existing cards
     * still have projects on them that `scanProjects` has to merge — see open item H.
     * The only distinction that survives here is "in the workspace" vs "only on the
     * card, importable", so that is all this reads out of it.
     */
    const { workspaceProjects, cardOnlyProjects } = useMemo(() => {
        const inWorkspace = projects.filter(p => p.status !== 'backup');
        const workspaceNames = new Set(inWorkspace.map(p => p.name));
        return {
            workspaceProjects: [...inWorkspace].sort((a, b) => a.name.localeCompare(b.name)),
            cardOnlyProjects: projects
                .filter(p => p.status === 'backup' && !workspaceNames.has(p.name))
                .sort((a, b) => a.name.localeCompare(b.name)),
        };
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
        setEditingProject(null);
        if (editName && editName !== oldName && onRenameProject) {
            onRenameProject(oldName, editName);
        }
    };

    const handleDuplicate = (name: string) => {
        const newName = prompt(`Enter name for copy of "${name}":`, `${name}_Copy`);
        if (newName && onDuplicateProject) {
            onDuplicateProject(name, newName);
        }
    };

    const handleCreateNew = () => {
        const baseName = `Project_${new Date().toISOString().slice(0, 10)}`;
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
        const baseName = currentProjectName ? `${currentProjectName}_Copy` : `Project_Copy`;
        let newName = baseName;
        let counter = 1;

        while (projects.some(p => p.name === newName)) {
            newName = `${baseName}_${counter}`;
            counter++;
        }

        onSaveProject(newName);
        setPendingCreate(newName);
    };

    /** How this project stands with the card's SK folder, or null when it isn't on it. */
    const hardwareState = (name: string): 'current' | 'differs' | null => {
        if (activeSKProject !== name) return null;
        const differs = !!deviceDiff && (deviceDiff.newFiles.length > 0 || deviceDiff.updatedFiles.length > 0);
        return differs ? 'differs' : 'current';
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#121212] w-full max-w-4xl rounded-2xl border border-white/10 flex flex-col shadow-2xl overflow-hidden h-[90vh] relative">

                {/* HEAD */}
                <header className="flex items-center justify-between p-6 border-b border-white/10 bg-[#1a1a1a] shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-indigo-500/20 rounded-xl">
                            <FolderOpen size={24} className="text-indigo-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">Projects</h2>
                            <p className="text-gray-400 text-sm">
                                {workHandle ? workHandle.name : 'No workspace folder connected'}
                                {onChangeWorkFolder && (
                                    <button onClick={onChangeWorkFolder} className="ml-2 text-xs text-indigo-400 hover:underline">
                                        {workHandle ? 'Change' : 'Choose'}
                                    </button>
                                )}
                            </p>
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

                {/* SD CARD — the build, which is the one card relationship that is still real */}
                <div className="flex flex-col border-b border-white/5 bg-[#111] shrink-0">
                    <button
                        className="w-full px-4 py-2 flex items-center justify-between hover:bg-white/[0.02] transition-colors cursor-pointer"
                        onClick={() => sdHandle && setIsSDExpanded(!isSDExpanded)}
                    >
                        <div className="flex items-center gap-3">
                            {!sdHandle ? (
                                <div className="flex items-center gap-2 text-sm text-gray-500">
                                    <RiSdCardMiniLine size={16} />
                                    <span>No SD card connected.</span>
                                </div>
                            ) : activeSKProject ? (
                                <div className="flex items-center gap-2 text-sm">
                                    <RiSdCardMiniLine size={16} className="text-indigo-400" />
                                    <span className="text-gray-300">
                                        SK folder on <strong className="text-white">{sdHandle.name}</strong>: <strong className="text-white">{activeSKProject}</strong>
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
                                    <span>{sdHandle.name} has no project built onto it yet.</span>
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-3">
                            {onImportSK && sdHandle && (
                                <span
                                    onClick={(e) => { e.stopPropagation(); onImportSK(); }}
                                    className="flex items-center gap-1.5 px-2.5 py-1 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 text-orange-300 rounded text-[10px] uppercase font-bold transition-colors cursor-pointer"
                                    title="Read the card's SK folder back into the project"
                                >
                                    <RiSdCardMiniLine size={10} /> Import Sync
                                </span>
                            )}
                            {onChangeSDFolder && (
                                <span
                                    onClick={(e) => { e.stopPropagation(); onChangeSDFolder(); }}
                                    className="text-xs text-orange-400 hover:underline cursor-pointer"
                                >
                                    {sdHandle ? 'Change' : 'Connect'}
                                </span>
                            )}
                            {sdHandle && (
                                <span className="text-[10px] text-gray-600 select-none">
                                    {isSDExpanded ? '▲ Hide' : '▼ Show'}
                                </span>
                            )}
                        </div>
                    </button>

                    {/* EXPANDABLE SD GRID — always 6×6, grey placeholder for empty slots */}
                    {sdHandle && isSDExpanded && (() => {
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

                {/* PROJECT LIST */}
                <div className="flex-1 overflow-y-auto bg-[#0f0f0f]">
                    {/*
                      * The temporary pool — R2-9's other half.
                      *
                      * Browse's pool survives a refresh now, which means it can sit in
                      * storage indefinitely with nothing on this side of the app ever
                      * mentioning it. One line, deliberately inert: it is not a project,
                      * it is not selectable, and there is no sync between it and
                      * anything here. Read from the summary key, so mentioning the pool
                      * never loads its audio.
                      */}
                    {poolSummary && poolSummary.count > 0 && (
                        <div className="flex items-center gap-4 px-4 py-3 border-b border-white/5 bg-white/[0.02]">
                            <div className="w-9 h-9 shrink-0 rounded-full bg-white/5 flex items-center justify-center text-gray-500">
                                <Layers size={15} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="text-sm text-gray-400">
                                    Temporary pool
                                    <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-gray-600">
                                        not a project
                                    </span>
                                </div>
                                <div className="text-[11px] text-gray-600 truncate">
                                    {poolSummary.count} {poolSummary.count === 1 ? 'file' : 'files'} kept in this
                                    browser's storage, from Browse. Open Browse to download it or copy it into a project.
                                </div>
                            </div>
                        </div>
                    )}

                    {workspaceProjects.length === 0 && cardOnlyProjects.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full opacity-50 space-y-4">
                            <Folder size={48} className="text-gray-600" />
                            <p>No projects yet. Create one below.</p>
                        </div>
                    )}

                    {workspaceProjects.map((project) => {
                        const isActive = currentProjectName === project.name;
                        const hardware = hardwareState(project.name);
                        return (
                            <div
                                key={project.name}
                                className={`flex items-center gap-4 px-4 py-3 border-b border-white/5 transition-colors group ${isActive ? 'bg-indigo-500/[0.07]' : 'hover:bg-white/[0.03]'}`}
                            >
                                <div className="w-9 h-9 shrink-0 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center text-indigo-300 font-bold text-sm">
                                    {project.name.charAt(0).toUpperCase()}
                                </div>

                                <div className="min-w-0 flex-1">
                                    {editingProject === project.name ? (
                                        <div className="flex items-center gap-1">
                                            <ProjectNameInput
                                                value={editName}
                                                onChange={setEditName}
                                                onSave={() => saveEdit(project.name)}
                                                onCancel={cancelEdit}
                                            />
                                            <Check size={14} className="text-green-400 cursor-pointer" onClick={() => saveEdit(project.name)} />
                                        </div>
                                    ) : (
                                        <div className="font-medium text-white flex items-center gap-2 group/title truncate">
                                            <span className="truncate">{project.name}</span>
                                            {isActive && hasUnsavedChanges && (
                                                <button
                                                    onClick={() => onSaveProject(project.name)}
                                                    className="shrink-0 text-[10px] bg-yellow-500/20 text-yellow-300 px-1.5 py-0.5 rounded font-bold border border-yellow-500/30 flex items-center gap-1 hover:bg-yellow-500/30 transition-colors cursor-pointer"
                                                    title="Click to save now"
                                                >
                                                    <Save size={8} /> UNSAVED
                                                </button>
                                            )}
                                            {onRenameProject && (
                                                <Edit2
                                                    size={12}
                                                    className="shrink-0 text-gray-500 opacity-0 group-hover/title:opacity-100 hover:text-white cursor-pointer transition-opacity"
                                                    onClick={() => startEdit(project.name)}
                                                />
                                            )}
                                        </div>
                                    )}
                                    <div className="flex items-center gap-2 text-[10px] text-gray-500 mt-0.5">
                                        <span>{project.fileCount} files</span>
                                        {hardware === 'current' && (
                                            <span className="text-indigo-400 flex items-center gap-1" title="The card's SK folder matches this project">
                                                <Check size={8} /> On the card
                                            </span>
                                        )}
                                        {hardware === 'differs' && (
                                            <span className="text-orange-400 flex items-center gap-1 font-bold" title="The card's SK folder no longer matches this project">
                                                <RefreshCw size={8} /> On the card, changed
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* ACTIONS */}
                                <div className="flex items-center gap-1 shrink-0">
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {onDuplicateProject && <button onClick={() => handleDuplicate(project.name)} className="p-1.5 hover:bg-white/10 rounded text-gray-400 hover:text-white" title="Duplicate"><Copy size={13} /></button>}
                                        {onExportZip && <button onClick={() => onExportZip(project.name, exportSettingsOnly)} className="p-1.5 hover:bg-indigo-500/10 rounded text-gray-400 hover:text-indigo-400" title={`Export project as Zip${exportSettingsOnly ? ' (Settings Only)' : ''}`}><Download size={13} /></button>}
                                        {onDeleteProject && <button onClick={() => onDeleteProject(project.name)} className="p-1.5 hover:bg-red-500/10 rounded text-gray-400 hover:text-red-400" title="Delete project"><Trash2 size={13} /></button>}
                                    </div>
                                    {onBuildProject && (
                                        <button
                                            onClick={() => onBuildProject(project.name)}
                                            className={`ml-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-[10px] uppercase font-bold transition-colors ${hardware === 'current'
                                                ? 'bg-indigo-500/5 hover:bg-indigo-500/10 border border-indigo-500/20 text-indigo-400/70'
                                                : 'bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 text-indigo-400'
                                                }`}
                                            title={hardware === 'current' ? 'The card is up to date. Click to rebuild' : 'Build this project onto the SD card'}
                                        >
                                            <HardDrive size={12} /> {hardware === 'current' ? 'Rebuild' : 'Build SD'}
                                        </button>
                                    )}
                                    <button
                                        onClick={() => onLoadProject(project.name)}
                                        className={`ml-1 px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider ${isActive ? 'bg-indigo-500 text-white' : 'bg-white/10 text-gray-400 hover:text-white'}`}
                                    >
                                        {isActive ? 'Active' : 'Load'}
                                    </button>
                                </div>
                            </div>
                        );
                    })}

                    {/* FOUND ON THE CARD — the migration path, and the only reason the SD
                        read side survives at all. Appendix D.3. */}
                    {cardOnlyProjects.length > 0 && (
                        <div className="border-t border-white/10">
                            <div className="px-4 py-2 bg-[#141414] flex items-center gap-2">
                                <RiSdCardMiniLine size={14} className="text-orange-400" />
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                    Found on the card, not in your workspace
                                </span>
                            </div>
                            {cardOnlyProjects.map(project => (
                                <div key={project.name} className="flex items-center gap-4 px-4 py-3 border-b border-white/5 hover:bg-white/[0.03] transition-colors">
                                    <div className="w-9 h-9 shrink-0 rounded-full bg-gradient-to-br from-orange-500/20 to-red-500/20 flex items-center justify-center text-orange-300 font-bold text-sm">
                                        {project.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="font-medium text-gray-300 truncate">{project.name}</div>
                                        <div className="text-[10px] text-gray-500 mt-0.5">{project.fileCount} files</div>
                                    </div>
                                    {onImportBackupProject && (
                                        <button
                                            onClick={() => onImportBackupProject(project.name)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[10px] uppercase font-bold transition-colors shadow-sm shrink-0"
                                            title="Copy this project from the card into your workspace"
                                        >
                                            <Download size={12} /> Import to workspace
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* FOOTER */}
                <div className="p-4 border-t border-white/10 bg-[#1a1a1a] flex flex-col gap-3 shrink-0">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <span className="text-sm text-gray-500">
                                {workspaceProjects.length} {workspaceProjects.length === 1 ? 'project' : 'projects'}
                            </span>
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
