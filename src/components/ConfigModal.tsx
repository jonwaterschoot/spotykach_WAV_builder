import React, { useState, useEffect } from 'react';
import { X, Save, Disc, Play, Trash2, FolderOpen, Plus, Check, Download, ExternalLink } from 'lucide-react';
import { Rnd } from 'react-rnd';
import type { ProjectConfig, ProjectSummary } from '../types';

interface ConfigModalProps {
    isOpen: boolean;
    onClose: () => void;
    config: ProjectConfig;
    onChange: (config: ProjectConfig) => void;
    projects: ProjectSummary[];
    currentProjectName?: string;
    workHandle: FileSystemDirectoryHandle | null;
}

interface Preset {
    id: string;
    name: string;
    config: ProjectConfig;
}

export const ConfigModal: React.FC<ConfigModalProps> = ({
    isOpen,
    onClose,
    config,
    onChange,
    projects,
    currentProjectName,
    workHandle
}) => {
    const [pos, setPos] = useState({ x: window.innerWidth / 2 - 250, y: 100 });
    const [presets, setPresets] = useState<Preset[]>([]);
    const [showPresets, setShowPresets] = useState(false);
    const [showProjectBrowser, setShowProjectBrowser] = useState(false);
    const [newPresetName, setNewPresetName] = useState('');

    // Load presets from localStorage
    useEffect(() => {
        const saved = localStorage.getItem('spotykach_config_presets');
        if (saved) {
            try {
                setPresets(JSON.parse(saved));
            } catch (e) {
                console.error("Failed to load presets", e);
            }
        }
    }, []);

    const savePresets = (newPresets: Preset[]) => {
        setPresets(newPresets);
        localStorage.setItem('spotykach_config_presets', JSON.stringify(newPresets));
    };

    const handleAddPreset = () => {
        if (!newPresetName.trim()) return;
        const newPreset: Preset = {
            id: crypto.randomUUID(),
            name: newPresetName.trim(),
            config: { ...config }
        };
        savePresets([...presets, newPreset]);
        setNewPresetName('');
    };

    const handleDeletePreset = (id: string) => {
        savePresets(presets.filter(p => p.id !== id));
    };

    const handleLoadPreset = (p: Preset) => {
        onChange(p.config);
        setShowPresets(false);
    };

    const handleLoadFromProject = async (projectName: string) => {
        if (!workHandle) return;
        try {
            const { loadProjectFromDirectory } = await import('../utils/exportUtils');
            const state = await loadProjectFromDirectory(projectName, workHandle);
            if (state && state.projectConfig) {
                onChange(state.projectConfig || { mid_ch_a: 1, mid_ch_b: 2, mid_ps_a: false, mid_ps_b: false });
                setShowProjectBrowser(false);
            } else {
                alert("This project has no config.txt settings saved.");
            }
        } catch (e) {
            console.error("Failed to load config from project", e);
            alert("Could not load project config.");
        }
    };

    if (!isOpen) return null;

    return (
        <Rnd
            position={pos}
            onDragStop={(_, d) => setPos({ x: d.x, y: d.y })}
            bounds="window"
            dragHandleClassName="config-drag-handle"
            className="z-[80] !fixed"
            enableResizing={false}
        >
            <div className="w-[500px] flex flex-col border border-gray-700/80 rounded-xl bg-[#0f0f11] shadow-2xl overflow-hidden min-h-[400px]">
                {/* Header */}
                <div className="config-drag-handle flex items-center justify-between px-4 py-3 bg-black border-b border-gray-800 cursor-move shrink-0">
                    <div className="flex items-center gap-2">
                        <Disc size={16} className="text-synthux-yellow" />
                        <span className="text-xs font-bold uppercase tracking-wider text-gray-300 select-none">Config.txt Settings</span>
                    </div>
                    <button onClick={onClose} className="p-1 text-gray-400 hover:text-red-400 hover:bg-white/10 rounded transition-colors">
                        <X size={18} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 p-6 space-y-8 overflow-y-auto custom-scrollbar">

                    {/* MIDI Channels */}
                    <div className="space-y-4">
                        <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-gray-800 pb-2">MIDI Assignment</h3>
                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-[11px] text-gray-400 block px-1">Deck A MIDI Channel</label>
                                <div className="flex items-center gap-3">
                                    <input
                                        type="range" min="1" max="16" value={config.mid_ch_a}
                                        onChange={(e) => onChange({ ...config, mid_ch_a: parseInt(e.target.value) })}
                                        className="flex-1 accent-synthux-orange"
                                    />
                                    <span className="w-8 text-center font-mono text-white bg-black/40 rounded py-1 text-sm border border-gray-800">{config.mid_ch_a}</span>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[11px] text-gray-400 block px-1">Deck B MIDI Channel</label>
                                <div className="flex items-center gap-3">
                                    <input
                                        type="range" min="1" max="16" value={config.mid_ch_b}
                                        onChange={(e) => onChange({ ...config, mid_ch_b: parseInt(e.target.value) })}
                                        className="flex-1 accent-synthux-blue"
                                    />
                                    <span className="w-8 text-center font-mono text-white bg-black/40 rounded py-1 text-sm border border-gray-800">{config.mid_ch_b}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Transport */}
                    <div className="space-y-4">
                        <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-gray-800 pb-2">MIDI Transport (Start/Stop)</h3>
                        <div className="grid grid-cols-1 gap-3">
                            {/* Deck A */}
                            <button
                                onClick={() => onChange({ ...config, mid_ps_a: !config.mid_ps_a })}
                                className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${config.mid_ps_a ? 'bg-synthux-yellow/5 border-synthux-yellow/30 text-white' : 'bg-black/20 border-gray-800 text-gray-500 hover:border-gray-700'}`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-lg ${config.mid_ps_a ? 'bg-synthux-yellow/20 text-synthux-yellow' : 'bg-gray-800 text-gray-600'}`}>
                                        <Play size={16} fill={config.mid_ps_a ? "currentColor" : "none"} />
                                    </div>
                                    <div className="text-left">
                                        <div className="text-xs font-bold">Deck A Start/Stop</div>
                                        <div className="text-[10px] opacity-60">Respect MIDI transport for Deck A</div>
                                    </div>
                                </div>
                                <div className={`w-8 h-5 rounded-full relative transition-colors ${config.mid_ps_a ? 'bg-synthux-yellow' : 'bg-gray-800'}`}>
                                    <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all shadow-sm ${config.mid_ps_a ? 'right-1' : 'left-1'}`} />
                                </div>
                            </button>

                            {/* Deck B */}
                            <button
                                onClick={() => onChange({ ...config, mid_ps_b: !config.mid_ps_b })}
                                className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${config.mid_ps_b ? 'bg-synthux-yellow/5 border-synthux-yellow/30 text-white' : 'bg-black/20 border-gray-800 text-gray-500 hover:border-gray-700'}`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-lg ${config.mid_ps_b ? 'bg-synthux-yellow/20 text-synthux-yellow' : 'bg-gray-800 text-gray-600'}`}>
                                        <Play size={16} fill={config.mid_ps_b ? "currentColor" : "none"} />
                                    </div>
                                    <div className="text-left">
                                        <div className="text-xs font-bold">Deck B Start/Stop</div>
                                        <div className="text-[10px] opacity-60">Respect MIDI transport for Deck B</div>
                                    </div>
                                </div>
                                <div className={`w-8 h-5 rounded-full relative transition-colors ${config.mid_ps_b ? 'bg-synthux-yellow' : 'bg-gray-800'}`}>
                                    <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all shadow-sm ${config.mid_ps_b ? 'right-1' : 'left-1'}`} />
                                </div>
                            </button>
                        </div>
                    </div>

                    {/* Presets & External */}
                    <div className="pt-4 flex flex-col gap-3">
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => { setShowPresets(!showPresets); setShowProjectBrowser(false); }}
                                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-xs font-bold uppercase tracking-wider transition-all ${showPresets ? 'bg-white/10 border-white/20 text-white' : 'bg-black/40 border-gray-800 text-gray-400 hover:text-white hover:bg-white/5'}`}
                            >
                                <Save size={14} /> My Presets
                            </button>
                            <button
                                onClick={() => { setShowProjectBrowser(!showProjectBrowser); setShowPresets(false); }}
                                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-xs font-bold uppercase tracking-wider transition-all ${showProjectBrowser ? 'bg-white/10 border-white/20 text-white' : 'bg-black/40 border-gray-800 text-gray-400 hover:text-white hover:bg-white/5'}`}
                            >
                                <FolderOpen size={14} /> Other Projects
                            </button>
                        </div>

                        {/* Presets Panel */}
                        {showPresets && (
                            <div className="bg-black/60 rounded-xl border border-gray-800 p-4 space-y-4 animate-in fade-in slide-in-from-top-2">
                                <div className="flex gap-2">
                                    <input
                                        placeholder="New preset name..."
                                        value={newPresetName}
                                        onChange={e => setNewPresetName(e.target.value)}
                                        className="flex-1 bg-black/40 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white"
                                        onKeyDown={e => e.key === 'Enter' && handleAddPreset()}
                                    />
                                    <button
                                        onClick={handleAddPreset}
                                        className="p-2 bg-synthux-orange text-white rounded-lg hover:bg-synthux-orange/80 transition-colors"
                                    >
                                        <Plus size={16} />
                                    </button>
                                </div>
                                <div className="space-y-2 max-h-[150px] overflow-y-auto custom-scrollbar pr-1">
                                    {presets.length === 0 && <div className="text-center py-4 text-xs text-gray-600">No presets saved yet.</div>}
                                    {presets.map(p => (
                                        <div key={p.id} className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/5 hover:border-white/10 group">
                                            <span className="text-xs text-gray-300 font-medium">{p.name}</span>
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => handleLoadPreset(p)}
                                                    className="p-1 text-indigo-400 hover:bg-indigo-400/10 rounded transition-colors"
                                                    title="Load"
                                                >
                                                    <Download size={14} />
                                                </button>
                                                <button
                                                    onClick={() => handleDeletePreset(p.id)}
                                                    className="p-1 text-red-500 hover:bg-red-500/10 rounded transition-colors"
                                                    title="Delete"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Project Browser Panel */}
                        {showProjectBrowser && (
                            <div className="bg-black/60 rounded-xl border border-gray-800 p-4 space-y-2 animate-in fade-in slide-in-from-top-2">
                                <h4 className="text-[10px] font-bold text-gray-500 uppercase px-1 mb-2">Workspace Projects</h4>
                                <div className="space-y-1 max-h-[200px] overflow-y-auto custom-scrollbar pr-1">
                                    {projects.filter(p => (p as any).hasMeta && p.name !== currentProjectName).map(proj => (
                                        <button
                                            key={proj.name}
                                            onClick={() => handleLoadFromProject(proj.name)}
                                            className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-white/5 text-left text-xs text-gray-400 hover:text-white transition-colors group"
                                        >
                                            <span className="truncate">{proj.name}</span>
                                            <ExternalLink size={12} className="opacity-0 group-hover:opacity-100" />
                                        </button>
                                    ))}
                                    {projects.filter(p => (p as any).hasMeta && p.name !== currentProjectName).length === 0 && (
                                        <div className="text-center py-4 text-xs text-gray-600">No other projects found.</div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-black/60 border-t border-gray-800 flex items-center justify-between">
                    <div className="text-[10px] text-gray-500 italic">
                        Formatting: Strict 8-char keys
                    </div>
                    <button
                        onClick={onClose}
                        className="flex items-center gap-2 px-5 py-2 bg-synthux-yellow text-black font-bold rounded-lg hover:scale-105 transition-all text-xs"
                    >
                        <Check size={14} strokeWidth={3} /> Done
                    </button>
                </div>
            </div>
        </Rnd>
    );
};
