import React, { useEffect, useRef, useState } from 'react';
import { Download, FolderOpen, HardDrive, Loader, Upload, X } from 'lucide-react';
import { useEscapeLayer } from '../../shell/escapeStack';
import type { ProjectInfo } from '../project';

/**
 * Saving and opening a mangler project. With a workspace folder (Chrome, Edge on
 * a computer) projects live in `Mangler/` next to Studio's `Projects/`; anywhere
 * else a project is one .mangler.zip to download and open again.
 */

interface ProjectDialogProps {
    mode: 'save' | 'open';
    /** The browser can write folders. */
    canFolder: boolean;
    /** The stored workspace's name, if there is one. */
    workspaceName: string | null;
    defaultName: string;
    busy: string | null;
    /** Folder projects, once listed (listing needs a click for permission). */
    projects: ProjectInfo[] | null;
    onListProjects: () => void;
    onSaveFolder: (name: string) => void;
    onSaveZip: (name: string) => void;
    onOpenFolder: (name: string) => void;
    onOpenZip: (file: File) => void;
    onClose: () => void;
}

const when = (t: number) => new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export const ProjectDialog: React.FC<ProjectDialogProps> = ({
    mode, canFolder, workspaceName, defaultName, busy, projects, onListProjects,
    onSaveFolder, onSaveZip, onOpenFolder, onOpenZip, onClose,
}) => {
    const [name, setName] = useState(defaultName);
    const zipInput = useRef<HTMLInputElement>(null);
    useEscapeLayer(true, () => { if (!busy) onClose(); return true; });
    useEffect(() => { setName(defaultName); }, [defaultName]);
    const button = 'flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-40';
    const existing = projects?.some(p => p.name === name.trim());

    return (
        <div className="fixed inset-0 z-[95] bg-black/75 flex items-center justify-center p-4" onClick={() => !busy && onClose()}>
            <div className="w-full max-w-lg max-h-full overflow-y-auto rounded-xl border border-white/10 bg-synthux-panel shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
                    <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-bold uppercase tracking-widest text-synthux-red">Mangler project</div>
                        <div className="text-sm font-bold">{mode === 'save' ? 'Save everything' : 'Open a project'}</div>
                    </div>
                    <button onClick={onClose} disabled={!!busy} className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/10" aria-label="Close"><X size={18} /></button>
                </div>

                <div className="p-5 space-y-4 text-sm">
                    {mode === 'save' ? (
                        <>
                            <p className="text-[12px] text-gray-400">
                                The source pool, results, slices, sequence, synth ranges and settings, together. Open it again later, or
                                start fresh in between.
                            </p>
                            <label className="block space-y-1">
                                <span className="text-[11px] text-gray-400">Name</span>
                                <input value={name} onChange={e => setName(e.target.value)} autoFocus
                                    className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-gray-100" />
                            </label>
                            {canFolder && (
                                <button onClick={() => onSaveFolder(name)} disabled={!name.trim() || !!busy}
                                    className={`${button} w-full bg-synthux-red text-white hover:bg-synthux-red/80`}>
                                    <HardDrive size={15} /> Save to {workspaceName ? `${workspaceName}/Mangler` : 'a workspace folder'}
                                </button>
                            )}
                            {canFolder && existing && <p className="text-[11px] text-synthux-yellow">A project with this name is there: saving replaces it.</p>}
                            <button onClick={() => onSaveZip(name)} disabled={!name.trim() || !!busy}
                                className={`${button} w-full border border-white/15 text-gray-200 hover:bg-white/10`}>
                                <Download size={15} /> Download as .mangler.zip
                            </button>
                            {!canFolder && <p className="text-[11px] text-gray-500">This browser can&apos;t write folders: the zip is the way to keep it.</p>}
                        </>
                    ) : (
                        <>
                            <p className="text-[12px] text-gray-400">Opening replaces what the mangler holds now. Save that first if you want to keep it.</p>
                            {canFolder && (
                                projects === null ? (
                                    <button onClick={onListProjects} disabled={!!busy}
                                        className={`${button} w-full bg-synthux-red text-white hover:bg-synthux-red/80`}>
                                        <FolderOpen size={15} /> Show the projects in {workspaceName ? `${workspaceName}/Mangler` : 'a workspace folder'}
                                    </button>
                                ) : projects.length === 0 ? (
                                    <p className="text-[12px] text-gray-500">No mangler projects in {workspaceName ?? 'the workspace'} yet.</p>
                                ) : (
                                    <ul className="max-h-64 overflow-y-auto rounded-lg border border-white/10 divide-y divide-white/5">
                                        {projects.map(p => (
                                            <li key={p.name}>
                                                <button onClick={() => onOpenFolder(p.name)} disabled={!!busy}
                                                    className="w-full text-left px-3 py-2 hover:bg-white/5 disabled:opacity-40">
                                                    <span className="block font-bold text-gray-100">{p.name}</span>
                                                    <span className="block text-[10px] text-gray-500">
                                                        {when(p.savedAt)} · {p.sources} sources · {p.results} results · {p.slices} slices
                                                    </span>
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )
                            )}
                            <button onClick={() => zipInput.current?.click()} disabled={!!busy}
                                className={`${button} w-full border border-white/15 text-gray-200 hover:bg-white/10`}>
                                <Upload size={15} /> Open a .mangler.zip
                            </button>
                            <input ref={zipInput} type="file" accept=".zip,application/zip" className="sr-only"
                                onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onOpenZip(f); }} />
                        </>
                    )}
                    {busy && <p className="flex items-center gap-2 text-[12px] text-gray-400"><Loader size={13} className="animate-spin" /> {busy}</p>}
                </div>
            </div>
        </div>
    );
};
