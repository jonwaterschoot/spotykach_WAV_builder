import React, { useState, useEffect } from 'react';
import { X, Save, Disc, Play, Trash2, FolderOpen, Plus, Check, Download, ExternalLink, HardDrive, Info } from 'lucide-react';
import { Rnd } from 'react-rnd';
import type { ProjectConfig, ProjectSummary } from '../types';
// dynamic utility imports

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

const FACTORY_PRESETS: Preset[] = [
    {
        id: 'factory-1',
        name: 'A+B Play (Deck A:1, Deck B:2)',
        config: { mid_ch_a: 1, mid_ch_b: 2, mid_ps_a: true, mid_ps_b: true, pre_load: true }
    },
    {
        id: 'factory-2',
        name: 'A+B No Play (Deck A:1, Deck B:2)',
        config: { mid_ch_a: 1, mid_ch_b: 2, mid_ps_a: false, mid_ps_b: false, pre_load: true }
    }
];

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
    const [saveStatus, setSaveStatus] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    const [showPreloadInfo, setShowPreloadInfo] = useState(false);

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

    useEffect(() => {
        if (saveStatus) {
            const t = setTimeout(() => setSaveStatus(null), 3000);
            return () => clearTimeout(t);
        }
    }, [saveStatus]);

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
        setSaveStatus(`Loaded: ${p.id.startsWith('factory') ? 'Default' : p.name}`);
    };

    const handleLoadFromProject = async (projectName: string) => {
        if (!workHandle) return;
        try {
            const { loadProjectFromDirectory } = await import('../utils/exportUtils');
            const state = await loadProjectFromDirectory(projectName, workHandle);
            if (state && state.projectConfig) {
                onChange(state.projectConfig || { mid_ch_a: 1, mid_ch_b: 2, mid_ps_a: false, mid_ps_b: false, pre_load: true });
                setShowProjectBrowser(false);
                setSaveStatus(`Loaded from ${projectName}`);
            } else {
                alert("This project has no config.txt settings saved.");
            }
        } catch (e) {
            console.error("Failed to load config from project", e);
            alert("Could not load project config.");
        }
    };

    const handleDownloadConfig = async () => {
        const { generateConfigText, downloadBlob } = await import('../utils/exportUtils');
        const text = generateConfigText(config);
        const blob = new Blob([text], { type: 'text/plain' });
        downloadBlob(blob, 'config.txt');
        setSaveStatus("Downloaded config.txt");
    };

    const handleSaveToSD = async () => {
        if (!workHandle) {
            alert("No SD card / Workspace folder is currently open. Please open your SD card root first, or use the Download button.");
            return;
        }

        try {
            const { generateConfigText, safeWriteBlob } = await import('../utils/exportUtils');
            const text = generateConfigText(config);
            const blob = new Blob([text], { type: 'text/plain' });
            const configHandle = await workHandle.getFileHandle('config.txt', { create: true });
            await safeWriteBlob(configHandle, blob, true); // Force overwrite
            setSaveStatus("Saved to SD card!");
        } catch (e) {
            console.error("Failed to save to SD", e);
            alert("Failed to save to SD. Make sure you have granted write permissions.");
        }
    };

    useEffect(() => {
        if (showPresets || showProjectBrowser) {
            // Jump to top if we're too low (using 60px from top)
            if (pos.y > 60) {
                setPos(prev => ({ ...prev, y: 60 }));
            }
        }
    }, [showPresets, showProjectBrowser]);

    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

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
            <div className="w-[500px] max-h-[85vh] flex flex-col border border-gray-700/80 rounded-xl bg-[#0f0f11] shadow-2xl overflow-hidden">
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
                <div className="flex-1 p-6 space-y-8 overflow-y-auto custom-scrollbar scroll-smooth">

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

                    {/* Configuration & Transport */}
                    <div className="space-y-4">
                        <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-gray-800 pb-2">Device Configuration</h3>
                        
                        <div className="grid grid-cols-1 gap-3">
                            <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => onChange({ ...config, pre_load: !config.pre_load })}
                                        className={`flex-1 flex items-center justify-between p-3 rounded-xl border transition-all ${config.pre_load ? 'bg-synthux-yellow/5 border-synthux-yellow/30 text-white' : 'bg-black/20 border-gray-800 text-gray-500 hover:border-gray-700'}`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-lg ${config.pre_load ? 'bg-synthux-yellow/20 text-synthux-yellow' : 'bg-gray-800 text-gray-600'}`}>
                                                <Save size={16} fill={config.pre_load ? "currentColor" : "none"} />
                                            </div>
                                            <div className="text-left">
                                                <div className="text-xs font-bold">Pre-loading</div>
                                                <div className="text-[10px] opacity-60">Enable audio pre-loading</div>
                                            </div>
                                        </div>
                                        <div className={`w-8 h-5 rounded-full relative transition-colors ${config.pre_load ? 'bg-synthux-yellow' : 'bg-gray-800'}`}>
                                            <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all shadow-sm ${config.pre_load ? 'right-1' : 'left-1'}`} />
                                        </div>
                                    </button>
                                    <button 
                                        onClick={() => setShowPreloadInfo(!showPreloadInfo)}
                                        className={`p-3 rounded-xl border transition-all ${showPreloadInfo ? 'bg-white/10 border-white/20 text-white' : 'bg-black/20 border-gray-800 text-gray-500 hover:text-white hover:border-gray-700'}`}
                                        title="More Info"
                                    >
                                        <Info size={16} />
                                    </button>
                                </div>
                                {showPreloadInfo && (
                                    <div className="p-3 mt-1 rounded-lg bg-black/40 border border-gray-800 text-[10px] text-gray-400 leading-relaxed animate-in fade-in slide-in-from-top-1">
                                        Whenever you load a sample to the buffer or save to SD card, Spotykach remembers the tape and the slot and next time you power the device on, the sample will be pre-loaded.
                                    </div>
                                )}
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
                                <Save size={14} /> Presets
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
                                {/* Factory Presets Section */}
                                <div className="space-y-2">
                                    <h4 className="text-[9px] font-bold text-gray-600 uppercase tracking-widest px-1">Factory Presets</h4>
                                    <div className="grid grid-cols-1 gap-1.5">
                                        {FACTORY_PRESETS.map(p => (
                                            <button
                                                key={p.id}
                                                onClick={() => handleLoadPreset(p)}
                                                className="flex items-center justify-between p-2.5 rounded-lg bg-synthux-yellow/10 border border-synthux-yellow/20 hover:bg-synthux-yellow/20 hover:border-synthux-yellow/30 text-left transition-all group"
                                            >
                                                <span className="text-[11px] text-synthux-yellow font-bold uppercase">{p.name}</span>
                                                <Check size={12} className="text-synthux-yellow opacity-0 group-hover:opacity-100" />
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="border-t border-gray-800/50 my-2" />

                                <div className="space-y-2">
                                    <h4 className="text-[9px] font-bold text-gray-600 uppercase tracking-widest px-1">Custom Presets</h4>
                                    <div className="flex gap-2">
                                        <input
                                            placeholder="New preset name..."
                                            value={newPresetName}
                                            onChange={e => setNewPresetName(e.target.value)}
                                            className="flex-1 bg-black/40 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder:text-gray-700 focus:outline-none focus:border-gray-500 transition-colors"
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
                                        {presets.length === 0 && <div className="text-center py-4 text-xs text-gray-600">No custom presets yet.</div>}
                                        {presets.map(p => (
                                            <div key={p.id} className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/5 hover:border-white/10 group">
                                                <span className="text-xs text-gray-300 font-medium">{p.name}</span>
                                                <div className="flex items-center gap-1 opacity-10 md:opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={() => handleLoadPreset(p)}
                                                        className="p-1.5 text-synthux-blue hover:bg-synthux-blue/10 rounded transition-colors"
                                                        title="Load"
                                                    >
                                                        <Check size={14} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeletePreset(p.id)}
                                                        className="p-1.5 text-red-500 hover:bg-red-500/10 rounded transition-colors"
                                                        title="Delete"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
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
                <div className="px-6 py-4 bg-black border-t border-gray-800 space-y-4">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleSaveToSD}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-synthux-blue text-black font-bold rounded-lg hover:scale-[1.02] transition-all text-[11px] uppercase tracking-wider"
                        >
                            <HardDrive size={14} strokeWidth={3} /> Save to SD Card
                        </button>
                        <button
                            onClick={handleDownloadConfig}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-800 text-white font-bold rounded-lg hover:bg-gray-700 transition-all text-[11px] uppercase tracking-wider"
                        >
                            <Download size={14} /> Download File
                        </button>
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-gray-500 italic">Strict 8-char formatting</span>
                            {saveStatus && (
                                <span className="text-[10px] text-synthux-yellow font-bold animate-pulse">
                                    • {saveStatus}
                                </span>
                            )}
                        </div>
                        <button
                            onClick={onClose}
                            className="flex items-center gap-2 px-6 py-2 bg-synthux-yellow text-black font-bold rounded-lg hover:scale-105 transition-all text-xs"
                        >
                            <Check size={14} strokeWidth={3} /> Done
                        </button>
                    </div>
                </div>
            </div>
        </Rnd>
    );
};
