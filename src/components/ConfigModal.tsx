import React, { useState, useEffect } from 'react';
import { X, Disc, Check, Download, HardDrive, FileDown } from 'lucide-react';
import { Rnd } from 'react-rnd';
import { ConfigForm } from './ConfigForm';
import { downloadConfig, ensureWritable, readConfigFromCard, writeConfigToCard } from '../utils/configFile';
import type { ProjectConfig, ProjectSummary } from '../types';

interface ConfigModalProps {
    isOpen: boolean;
    onClose: () => void;
    config: ProjectConfig;
    onChange: (config: ProjectConfig) => void;
    projects: ProjectSummary[];
    currentProjectName?: string;
    workHandle: FileSystemDirectoryHandle | null;
    sdHandle?: FileSystemDirectoryHandle | null;
}

/**
 * Studio's `config.txt` surface: the project's own settings, in a draggable window.
 *
 * The fields and the presets live in `ConfigForm`, shared with the standalone
 * Config mode (`#/config`) — this component is the Studio container around them,
 * plus the card I/O, which goes through `utils/configFile` for the same reason.
 */
export const ConfigModal: React.FC<ConfigModalProps> = ({
    isOpen,
    onClose,
    config,
    onChange,
    projects,
    currentProjectName,
    workHandle,
    sdHandle
}) => {
    const [pos, setPos] = useState({ x: window.innerWidth / 2 - 250, y: 100 });
    const [saveStatus, setSaveStatus] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    useEffect(() => {
        if (saveStatus) {
            const t = setTimeout(() => setSaveStatus(null), 3000);
            return () => clearTimeout(t);
        }
    }, [saveStatus]);

    const handleDownloadConfig = async () => {
        await downloadConfig(config);
        setSaveStatus("Downloaded config.txt");
    };

    const handleSaveToSD = async () => {
        try {
            const targetHandle = sdHandle || workHandle;
            if (!targetHandle) {
                alert("No SD card / Workspace folder is currently open. Please open your SD card root first, or use the Download button.");
                return;
            }
            if (!await ensureWritable(targetHandle)) {
                alert("Write permission for that folder was declined.");
                return;
            }
            await writeConfigToCard(targetHandle, config);
            setSaveStatus(sdHandle ? "Saved to Hardware SD card!" : "Saved to SD (Work Folder)!");
        } catch (e) {
            console.error("Failed to save to SD", e);
            alert("Failed to save to SD. Make sure you have granted write permissions.");
        }
    };

    // The card is the device's truth (open question 4), so what's on it can be read
    // back into the project rather than only ever being overwritten by it.
    const handleReadFromSD = async () => {
        if (!sdHandle) return;
        try {
            const result = await readConfigFromCard(sdHandle);
            if (!result) {
                alert("No config.txt was found on the connected card.");
                return;
            }
            onChange(result.config);
            setSaveStatus(`Read from card (${result.location === 'sk' ? 'SK/' : 'card root'})`);
        } catch (e) {
            console.error("Failed to read config from SD", e);
            alert("Could not read config.txt from the card.");
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
                <div className="flex-1 p-6 overflow-y-auto custom-scrollbar scroll-smooth">
                    <ConfigForm
                        config={config}
                        onChange={onChange}
                        onStatus={setSaveStatus}
                        projects={projects}
                        currentProjectName={currentProjectName}
                        workHandle={workHandle}
                        // A panel opening below the fold is easier to reach if the
                        // window isn't sitting low on the screen.
                        onPanelOpen={() => setPos(prev => (prev.y > 60 ? { ...prev, y: 60 } : prev))}
                    />
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

                    {sdHandle && (
                        <button
                            onClick={handleReadFromSD}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-gray-800 text-gray-400 hover:text-white hover:bg-white/5 transition-all text-[11px] uppercase tracking-wider font-bold"
                        >
                            <FileDown size={14} /> Read from card
                        </button>
                    )}

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
