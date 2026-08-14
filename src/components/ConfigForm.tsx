import React, { useEffect, useRef, useState } from 'react';
import { Save, Play, Trash2, FolderOpen, Plus, Check, ExternalLink, Info, Scissors } from 'lucide-react';
import { configWithoutUnknown } from '../utils/configFile';
import { DEFAULT_PROJECT_CONFIG } from '../types';
import type { ProjectConfig, ProjectSummary } from '../types';
import { appStorage } from '../utils/storageNamespace';

/**
 * The `config.txt` fields themselves, plus the saved presets that go with them.
 *
 * Extracted from `ConfigModal` in Phase 5 so the standalone Config mode and the
 * Studio modal render one set of fields rather than two that drift — which matters
 * because the field set is expected to grow with the firmware.
 *
 * Everything here is about the *settings*. Where they are read from and written to
 * is the container's job: Studio writes them into the open project, Config mode
 * holds them in local state and writes them to a card.
 */

interface Preset {
    id: string;
    name: string;
    config: ProjectConfig;
}

const FACTORY_PRESETS: Preset[] = [
    {
        id: 'factory-1',
        name: 'A+B Play (Deck A:1, Deck B:2)',
        config: { ...DEFAULT_PROJECT_CONFIG, mid_ps_a: true, mid_ps_b: true }
    },
    {
        id: 'factory-2',
        name: 'A+B No Play (Deck A:1, Deck B:2)',
        config: { ...DEFAULT_PROJECT_CONFIG }
    }
];

interface ConfigFormProps {
    config: ProjectConfig;
    onChange: (config: ProjectConfig) => void;
    /** Reported so the container can put the confirmation wherever its layout wants it. */
    onStatus?: (message: string) => void;
    /**
     * Studio only — the other projects whose config can be borrowed. Omitted (or
     * with no work folder) the section is hidden, which is the standalone case.
     */
    projects?: ProjectSummary[];
    currentProjectName?: string;
    workHandle?: FileSystemDirectoryHandle | null;
    /** Called when a panel opens, so a draggable container can make room. */
    onPanelOpen?: () => void;
}

export const ConfigForm: React.FC<ConfigFormProps> = ({
    config,
    onChange,
    onStatus,
    projects,
    currentProjectName,
    workHandle,
    onPanelOpen,
}) => {
    const [presets, setPresets] = useState<Preset[]>([]);
    const [showPresets, setShowPresets] = useState(false);
    const [showProjectBrowser, setShowProjectBrowser] = useState(false);
    const [newPresetName, setNewPresetName] = useState('');
    const [showPreloadInfo, setShowPreloadInfo] = useState(false);

    const otherProjects = (projects || []).filter(p => p.hasMeta && p.name !== currentProjectName);
    const canBorrowFromProjects = !!workHandle && (projects?.length ?? 0) > 0;

    // Load presets from localStorage
    useEffect(() => {
        const saved = appStorage.getItem('spotykach_config_presets');
        if (saved) {
            try {
                setPresets(JSON.parse(saved));
            } catch (e) {
                console.error("Failed to load presets", e);
            }
        }
    }, []);

    // Read through a ref so an inline callback from the container doesn't re-fire
    // this on every render.
    const onPanelOpenRef = useRef(onPanelOpen);
    useEffect(() => { onPanelOpenRef.current = onPanelOpen; });

    useEffect(() => {
        if (showPresets || showProjectBrowser) onPanelOpenRef.current?.();
    }, [showPresets, showProjectBrowser]);

    const savePresets = (newPresets: Preset[]) => {
        setPresets(newPresets);
        appStorage.setItem('spotykach_config_presets', JSON.stringify(newPresets));
    };

    const handleAddPreset = () => {
        if (!newPresetName.trim()) return;
        const newPreset: Preset = {
            id: crypto.randomUUID(),
            name: newPresetName.trim(),
            // A preset holds the choices the user made, not the unrecognised pairs
            // that came off whichever file this config was read from.
            config: configWithoutUnknown(config)
        };
        savePresets([...presets, newPreset]);
        setNewPresetName('');
    };

    const handleDeletePreset = (id: string) => {
        savePresets(presets.filter(p => p.id !== id));
    };

    const handleLoadPreset = (p: Preset) => {
        // Unknown pairs belong to the file, not to the preset — applying a preset
        // changes the settings, it doesn't drop what the device told us.
        onChange({ ...p.config, ...(config.unknown ? { unknown: config.unknown } : {}) });
        setShowPresets(false);
        onStatus?.(`Loaded: ${p.id.startsWith('factory') ? 'Default' : p.name}`);
    };

    const handleLoadFromProject = async (projectName: string) => {
        if (!workHandle) return;
        try {
            const { loadProjectFromDirectory } = await import('../utils/exportUtils');
            const state = await loadProjectFromDirectory(projectName, workHandle);
            if (state && state.projectConfig) {
                onChange(state.projectConfig);
                setShowProjectBrowser(false);
                onStatus?.(`Loaded from ${projectName}`);
            } else {
                alert("This project has no config.txt settings saved.");
            }
        } catch (e) {
            console.error("Failed to load config from project", e);
            alert("Could not load project config.");
        }
    };

    return (
        <div className="space-y-8">

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

            {/* Slice mode — the setting is stated as the file states it: on means
                polyphony is *disabled*, so the toggle can't disagree with the manual. */}
            <div className="space-y-4">
                <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-gray-800 pb-2">Slice Mode</h3>
                <div className="grid grid-cols-1 gap-3">
                    {([
                        { key: 'slc_mn_a', label: 'Deck A — disable polyphony' },
                        { key: 'slc_mn_b', label: 'Deck B — disable polyphony' },
                    ] as const).map(({ key, label }) => (
                        <button
                            key={key}
                            onClick={() => onChange({ ...config, [key]: !config[key] })}
                            className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${config[key] ? 'bg-synthux-yellow/5 border-synthux-yellow/30 text-white' : 'bg-black/20 border-gray-800 text-gray-500 hover:border-gray-700'}`}
                        >
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg ${config[key] ? 'bg-synthux-yellow/20 text-synthux-yellow' : 'bg-gray-800 text-gray-600'}`}>
                                    <Scissors size={16} />
                                </div>
                                <div className="text-left">
                                    <div className="text-xs font-bold">{label}</div>
                                    <div className="text-[10px] opacity-60">
                                        {config[key] ? 'One slice at a time' : 'Slices can overlap'}
                                    </div>
                                </div>
                            </div>
                            <div className={`w-8 h-5 rounded-full relative transition-colors ${config[key] ? 'bg-synthux-yellow' : 'bg-gray-800'}`}>
                                <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all shadow-sm ${config[key] ? 'right-1' : 'left-1'}`} />
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Settings this build doesn't know — read off a card and written back untouched. */}
            {config.unknown && config.unknown.length > 0 && (
                <div className="space-y-3">
                    <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-gray-800 pb-2">
                        Kept from the file
                    </h3>
                    <p className="text-[10px] text-gray-500 leading-relaxed px-1">
                        {config.unknown.length === 1 ? 'One setting' : `${config.unknown.length} settings`} this version has no
                        control for — newer firmware, most likely. {config.unknown.length === 1 ? 'It is' : 'They are'} written
                        back exactly as read rather than dropped.
                    </p>
                    <div className="rounded-lg bg-black/40 border border-gray-800 divide-y divide-gray-800/60">
                        {config.unknown.map((setting, i) => (
                            <div key={`${setting.key}-${i}`} className="flex items-center justify-between px-3 py-2">
                                <span className="font-mono text-[11px] text-gray-400">{setting.key}</span>
                                <span className="font-mono text-[11px] text-gray-500">{setting.value}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Presets & other projects */}
            <div className="pt-4 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => { setShowPresets(!showPresets); setShowProjectBrowser(false); }}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-xs font-bold uppercase tracking-wider transition-all ${showPresets ? 'bg-white/10 border-white/20 text-white' : 'bg-black/40 border-gray-800 text-gray-400 hover:text-white hover:bg-white/5'}`}
                    >
                        <Save size={14} /> Presets
                    </button>
                    {canBorrowFromProjects && (
                        <button
                            onClick={() => { setShowProjectBrowser(!showProjectBrowser); setShowPresets(false); }}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-xs font-bold uppercase tracking-wider transition-all ${showProjectBrowser ? 'bg-white/10 border-white/20 text-white' : 'bg-black/40 border-gray-800 text-gray-400 hover:text-white hover:bg-white/5'}`}
                        >
                            <FolderOpen size={14} /> Other Projects
                        </button>
                    )}
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
                {canBorrowFromProjects && showProjectBrowser && (
                    <div className="bg-black/60 rounded-xl border border-gray-800 p-4 space-y-2 animate-in fade-in slide-in-from-top-2">
                        <h4 className="text-[10px] font-bold text-gray-500 uppercase px-1 mb-2">Workspace Projects</h4>
                        <div className="space-y-1 max-h-[200px] overflow-y-auto custom-scrollbar pr-1">
                            {otherProjects.map(proj => (
                                <button
                                    key={proj.name}
                                    onClick={() => handleLoadFromProject(proj.name)}
                                    className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-white/5 text-left text-xs text-gray-400 hover:text-white transition-colors group"
                                >
                                    <span className="truncate">{proj.name}</span>
                                    <ExternalLink size={12} className="opacity-0 group-hover:opacity-100" />
                                </button>
                            ))}
                            {otherProjects.length === 0 && (
                                <div className="text-center py-4 text-xs text-gray-600">No other projects found.</div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
