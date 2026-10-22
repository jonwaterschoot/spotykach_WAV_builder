import { useState } from 'react';
import { X, FolderOpen, HardDrive, Dices, AudioWaveform } from 'lucide-react';

interface BrowserChoiceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onChoice: (choice: 'os' | 'sample-browser', remember: boolean) => void;
    /** The smaller third way: make a sound for the slot in the Sample Mangler. Never remembered. */
    onMangler?: () => void;
    /** Next to it: make a drum or FM hit for the slot in the mangler's synth. Never remembered. */
    onSynth?: () => void;
}

const BrowserChoiceModal = ({ isOpen, onClose, onChoice, onMangler, onSynth }: BrowserChoiceModalProps) => {
    const [remember, setRemember] = useState(false);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-synthux-panel border border-white/10 rounded-lg p-6 w-full max-w-md max-h-full overflow-y-auto shadow-2xl relative">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
                >
                    <X size={20} />
                </button>

                <h2 className="text-xl font-bold mb-2">Choose Browser</h2>
                <p className="text-gray-400 text-sm mb-6">
                    How would you like to assign an audio file to this slot?
                </p>

                <div className="flex flex-col gap-3 mb-6">
                    <button
                        onClick={() => onChoice('sample-browser', remember)}
                        className="flex flex-col items-center justify-center gap-2 p-4 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-synthux-orange hover:text-synthux-orange transition-all"
                    >
                        <FolderOpen size={32} />
                        <span className="font-bold">App Sample Browser</span>
                        <span className="text-xs text-gray-400 text-center uppercase tracking-wide">
                            Curated Library & Packs
                        </span>
                    </button>

                    <button
                        onClick={() => onChoice('os', remember)}
                        className="flex flex-col items-center justify-center gap-2 p-4 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-synthux-blue hover:text-synthux-blue transition-all"
                    >
                        <HardDrive size={32} />
                        <span className="font-bold">OS File Browser</span>
                        <span className="text-xs text-gray-400 text-center uppercase tracking-wide">
                            Local File System
                        </span>
                    </button>

                    {(onMangler || onSynth) && (
                        <div className="flex gap-2">
                            {onMangler && (
                                <button
                                    onClick={onMangler}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm text-gray-400 border border-gray-800
                                        hover:border-synthux-red/60 hover:text-synthux-red transition-all"
                                    title="Make a new sound from random snippets of this project's files"
                                >
                                    <Dices size={16} />
                                    <span className="font-bold">Sample Mangler</span>
                                    <span className="text-[10px] uppercase tracking-wide text-gray-500">from this project</span>
                                </button>
                            )}
                            {onSynth && (
                                <button
                                    onClick={onSynth}
                                    className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm text-gray-400 border border-gray-800
                                        hover:border-synthux-blue/60 hover:text-synthux-blue transition-all"
                                    title="Make a kick, snare, hat, clap, percussion or FM sound for this slot"
                                >
                                    <AudioWaveform size={16} />
                                    <span className="font-bold">Synth</span>
                                </button>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2 px-2">
                    <input
                        type="checkbox"
                        id="remember-choice"
                        checked={remember}
                        onChange={(e) => setRemember(e.target.checked)}
                        className="rounded border-gray-600 bg-gray-800 text-synthux-orange focus:ring-synthux-orange focus:ring-offset-gray-900"
                    />
                    <label htmlFor="remember-choice" className="text-sm text-gray-400 cursor-pointer">
                        Remember this choice (can be changed in Settings)
                    </label>
                </div>
            </div>
        </div>
    );
};

export default BrowserChoiceModal;
