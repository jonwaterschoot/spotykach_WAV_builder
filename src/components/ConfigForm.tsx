import React, { useEffect, useRef, useState } from 'react';
import { Save, Trash2, FolderOpen, Plus, Check, ExternalLink, Info } from 'lucide-react';
import { ConfigTextPreview } from './ConfigTextPreview';
import { configWithoutUnknown } from '../utils/configFile';
import { DEFAULT_PROJECT_CONFIG } from '../types';
import type { CueSizeMode, ProjectConfig, ProjectSummary } from '../types';
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

const CUE_SIZE_MODES: { value: CueSizeMode; label: string; hint: string }[] = [
    { value: 0, label: 'Ignore', hint: 'Cue points play no part. The deck slices as if the sample had none.' },
    { value: 1, label: 'Snap', hint: 'Start and size snap to cue points. Hold ALT for a free size.' },
    { value: 2, label: 'Free', hint: 'Start snaps to cue points, size is free. Hold ALT to snap the size.' },
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
    const [openInfo, setOpenInfo] = useState<string | null>(null);

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
        // Over the defaults: a preset saved before a setting existed leaves it out.
        onChange({ ...DEFAULT_PROJECT_CONFIG, ...p.config, ...(config.unknown ? { unknown: config.unknown } : {}) });
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

    const toggleInfo = (key: string) => setOpenInfo(open => (open === key ? null : key));

    // Cue points are opt-in: on writes both lines (as Ignore until changed), off removes them.
    const cueOn = config.cue_sm_a !== undefined || config.cue_sm_b !== undefined;
    const toggleCue = () => {
        if (cueOn) {
            const next = { ...config };
            delete next.cue_sm_a;
            delete next.cue_sm_b;
            onChange(next);
        } else {
            onChange({ ...config, cue_sm_a: 0, cue_sm_b: 0 });
        }
    };

    return (
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_200px] items-start">
            <div className="min-w-0 space-y-5">

                {/* One row per setting, the two decks side by side. */}
                <div className="rounded-xl border border-gray-800 bg-black/20">
                    <div className={`${ROW_GRID} px-3 py-2 border-b border-gray-800`}>
                        <span className="hidden sm:block text-[9px] font-bold text-gray-600 uppercase tracking-widest">Setting</span>
                        <span className="text-[9px] font-bold text-synthux-orange uppercase tracking-widest text-center">Deck A</span>
                        <span className="text-[9px] font-bold text-synthux-blue uppercase tracking-widest text-center">Deck B</span>
                    </div>

                    <div className="divide-y divide-gray-800/60">
                        <Row label="MIDI channel" info="The channel each deck listens on." infoKey="mid_ch" openInfo={openInfo} onInfo={toggleInfo}>
                            {DECKS.map(d => (
                                <select
                                    key={d}
                                    value={config[`mid_ch_${d}`]}
                                    onChange={e => onChange({ ...config, [`mid_ch_${d}`]: parseInt(e.target.value) })}
                                    aria-label={`Deck ${d.toUpperCase()} MIDI channel`}
                                    className="w-full bg-black/40 border border-gray-800 rounded-md px-2 py-1 font-mono text-xs text-white focus:outline-none focus:border-gray-600"
                                >
                                    {Array.from({ length: 16 }, (_, i) => i + 1).map(ch => <option key={ch} value={ch}>{ch}</option>)}
                                </select>
                            ))}
                        </Row>

                        <Row label="MIDI start/stop" info="Follow MIDI transport: the deck starts and stops with the clock source." infoKey="mid_ps" openInfo={openInfo} onInfo={toggleInfo}>
                            {DECKS.map(d => (
                                <Switch key={d} on={config[`mid_ps_${d}`]} label={`Deck ${d.toUpperCase()} MIDI start/stop`}
                                    onToggle={() => onChange({ ...config, [`mid_ps_${d}`]: !config[`mid_ps_${d}`] })} />
                            ))}
                        </Row>

                        <Row label="Slice: one at a time" info="On disables polyphony in Slice mode, so a new slice cuts the last one off instead of overlapping it." infoKey="slc_mn" openInfo={openInfo} onInfo={toggleInfo}>
                            {DECKS.map(d => (
                                <Switch key={d} on={config[`slc_mn_${d}`]} label={`Deck ${d.toUpperCase()} slice one at a time`}
                                    onToggle={() => onChange({ ...config, [`slc_mn_${d}`]: !config[`slc_mn_${d}`] })} />
                            ))}
                        </Row>

                        <Row
                            label="Cue points"
                            info={<>
                                <b className="text-synthux-orange">Beta.</b> Read by the firmware since 1.3.0 and part of the 1.4.0 beta
                                settings. Off, the lines are left out of config.txt and the device ignores cue points;
                                on, both lines are written.
                                <span className="block mt-1">For samples with their own cue points (slice markers); others are not affected.</span>
                                {CUE_SIZE_MODES.map(m => <span key={m.value} className="block mt-1"><b className="text-gray-300">{m.label}:</b> {m.hint}</span>)}
                            </>}
                            infoKey="cue_sm" openInfo={openInfo} onInfo={toggleInfo}
                            labelExtra={<>
                                <span className="px-1 rounded border border-synthux-orange/40 text-[8px] font-bold uppercase tracking-wider text-synthux-orange">Beta</span>
                                <Switch on={cueOn} label="Write cue point settings to config.txt" onToggle={toggleCue} />
                            </>}
                            wide={!cueOn}
                        >
                            {!cueOn ? (
                                <span className="block text-center text-[10px] text-gray-600">Not in config.txt. Switch on to test.</span>
                            ) : DECKS.map(d => {
                                const mode = config[`cue_sm_${d}`] ?? 0;
                                return (
                                    <div key={d} role="radiogroup" aria-label={`Deck ${d.toUpperCase()} cue points`} className="grid grid-cols-3 gap-0.5 p-0.5 rounded-md bg-black/40 border border-gray-800">
                                        {CUE_SIZE_MODES.map(m => (
                                            <button
                                                key={m.value}
                                                role="radio"
                                                aria-checked={mode === m.value}
                                                title={m.hint}
                                                onClick={() => onChange({ ...config, [`cue_sm_${d}`]: m.value })}
                                                className={`py-1 rounded text-[10px] font-bold transition-colors ${mode === m.value ? 'bg-synthux-yellow/20 text-synthux-yellow' : 'text-gray-500 hover:text-white'}`}
                                            >
                                                {m.label}
                                            </button>
                                        ))}
                                    </div>
                                );
                            })}
                        </Row>

                        <Row label="Grit mix at power-on" info="Where the grit mix of each deck starts when the device powers on. Firmware 1.4.0 or later; older firmware ignores it." infoKey="grt_mx" openInfo={openInfo} onInfo={toggleInfo}>
                            {DECKS.map(d => {
                                const value = config[`grt_mx_${d}`] ?? DEFAULT_PROJECT_CONFIG[`grt_mx_${d}`];
                                return (
                                    <div key={d} className="flex items-center gap-2">
                                        <input
                                            type="range" min="0" max="10" step="1" value={value}
                                            onChange={e => onChange({ ...config, [`grt_mx_${d}`]: parseInt(e.target.value) })}
                                            aria-label={`Deck ${d.toUpperCase()} grit mix at power-on`}
                                            className={`flex-1 min-w-0 ${d === 'a' ? 'accent-synthux-orange' : 'accent-synthux-blue'}`}
                                        />
                                        <span className="w-9 text-right font-mono text-[11px] text-white">{value * 10}%</span>
                                    </div>
                                );
                            })}
                        </Row>

                        {/* Device-wide: one control across both deck columns. */}
                        <Row label="Pre-loading" info="Whenever you load a sample to the buffer or save to SD card, Spotykach remembers the tape and the slot and next time you power the device on, the sample will be pre-loaded." infoKey="pre_load" openInfo={openInfo} onInfo={toggleInfo} wide>
                            <div className="flex items-center justify-center gap-2">
                                <Switch on={config.pre_load} label="Pre-loading" onToggle={() => onChange({ ...config, pre_load: !config.pre_load })} />
                                <span className="text-[10px] text-gray-500">both decks</span>
                            </div>
                        </Row>
                    </div>
                </div>

                {/* Settings this build doesn't know, read off a card and written back untouched. */}
                {config.unknown && config.unknown.length > 0 && (
                    <p className="text-[10px] text-gray-500 leading-relaxed px-1">
                        {config.unknown.length === 1 ? 'One setting' : `${config.unknown.length} settings`} in the file
                        ({config.unknown.map(u => u.key.trim()).join(', ')}) {config.unknown.length === 1 ? 'has' : 'have'} no
                        control here, newer firmware most likely. {config.unknown.length === 1 ? 'It is' : 'They are'} written
                        back exactly as read.
                    </p>
                )}

                {/* Presets & other projects */}
                <div className="flex flex-col gap-3">
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

            <ConfigTextPreview config={config} />
        </div>
    );
};

const DECKS = ['a', 'b'] as const;

/** Label, then the Deck A and Deck B columns. Shared by the header and every row so they line up. */
/** On a phone the label takes its own line above the two decks. */
const ROW_GRID = 'grid grid-cols-2 sm:grid-cols-[minmax(0,1fr)_repeat(2,minmax(0,8.5rem))] gap-x-3 gap-y-1.5 items-center';

/** A setting's label, its two deck controls (or one wide one), and an optional hint. */
const Row: React.FC<{
    label: string;
    info?: React.ReactNode;
    infoKey: string;
    openInfo: string | null;
    onInfo: (key: string) => void;
    /** Beside the label: a badge, an enable switch. */
    labelExtra?: React.ReactNode;
    /** One control spanning both deck columns, for a device-wide setting. */
    wide?: boolean;
    children: React.ReactNode;
}> = ({ label, info, infoKey, openInfo, onInfo, labelExtra, wide, children }) => (
    <div className="px-3 py-2">
        <div className={ROW_GRID}>
            <div className="col-span-2 sm:col-span-1 flex items-center gap-1 min-w-0">
                <span className="text-[11px] text-gray-300 truncate">{label}</span>
                {info && (
                    <button
                        onClick={() => onInfo(infoKey)}
                        aria-expanded={openInfo === infoKey}
                        title="More info"
                        className={`p-0.5 rounded transition-colors ${openInfo === infoKey ? 'text-white' : 'text-gray-600 hover:text-white'}`}
                    >
                        <Info size={12} />
                    </button>
                )}
                {labelExtra && <span className="ml-1 flex items-center gap-1.5 shrink-0">{labelExtra}</span>}
            </div>
            {wide ? <div className="col-span-2">{children}</div> : children}
        </div>
        {info && openInfo === infoKey && (
            <div className="mt-2 p-2 rounded-md bg-black/40 border border-gray-800 text-[10px] text-gray-400 leading-relaxed animate-in fade-in slide-in-from-top-1">
                {info}
            </div>
        )}
    </div>
);

const Switch: React.FC<{ on: boolean; label: string; onToggle: () => void }> = ({ on, label, onToggle }) => (
    <button
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={onToggle}
        className={`justify-self-center w-8 h-5 rounded-full relative transition-colors ${on ? 'bg-synthux-yellow' : 'bg-gray-800 hover:bg-gray-700'}`}
    >
        <span className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all shadow-sm ${on ? 'right-1' : 'left-1'}`} />
    </button>
);
