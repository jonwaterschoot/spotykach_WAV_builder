import { useState } from 'react';
import { X, FolderOpen, HardDrive } from 'lucide-react';

interface BrowserChoiceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onChoice: (choice: 'os' | 'sample-browser', remember: boolean) => void;
}

const BrowserChoiceModal = ({ isOpen, onClose, onChoice }: BrowserChoiceModalProps) => {
    const [remember, setRemember] = useState(false);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-synthux-panel border border-white/10 rounded-lg p-6 w-full max-w-md shadow-2xl relative">
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
