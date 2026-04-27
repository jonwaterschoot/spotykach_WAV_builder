import React, { useState, useEffect, useRef } from 'react';
import { X, FolderPlus } from 'lucide-react';

interface ProjectNameModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (name: string) => void;
    title: string;
    initialValue?: string;
    placeholder?: string;
    confirmLabel?: string;
}

export const ProjectNameModal = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    initialValue = '',
    placeholder = 'Enter project name...',
    confirmLabel = 'Create Project'
}: ProjectNameModalProps) => {
    const [name, setName] = useState(initialValue);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setName(initialValue);
            // Auto-focus after animation
            setTimeout(() => inputRef.current?.focus(), 100);

            const handleKeyDown = (e: KeyboardEvent) => {
                if (e.key === 'Escape') onClose();
            };
            window.addEventListener('keydown', handleKeyDown);
            return () => window.removeEventListener('keydown', handleKeyDown);
        }
    }, [isOpen, initialValue, onClose]);

    if (!isOpen) return null;

    const handleSubmit = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (name.trim()) {
            onConfirm(name.trim());
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[110] p-6 animate-in fade-in duration-200">
            <div className="bg-synthux-panel border border-gray-800 rounded-2xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                
                {/* Header */}
                <div className="flex justify-between items-center p-6 border-b border-gray-800 bg-black/20">
                    <h3 className="text-xl font-bold text-white font-header flex items-center gap-2">
                        <FolderPlus size={20} className="text-synthux-blue" />
                        {title}
                    </h3>
                    <button 
                        onClick={onClose}
                        className="p-2 hover:bg-gray-800 rounded-full transition-colors text-gray-400 hover:text-white"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest text-gray-500 ml-1">
                            Project Name
                        </label>
                        <input
                            ref={inputRef}
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder={placeholder}
                            className="w-full bg-black/40 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-synthux-blue focus:ring-1 focus:ring-synthux-blue transition-all font-mono"
                            onKeyDown={(e) => {
                                if (e.key === 'Escape') onClose();
                            }}
                        />
                    </div>
                    <p className="text-[10px] text-gray-500 italic ml-1">
                        Use alphanumeric characters, underscores, or hyphens for best compatibility.
                    </p>
                </form>

                {/* Actions */}
                <div className="p-6 pt-4 border-t border-gray-800 bg-gray-900/50 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white font-bold text-sm transition-colors border border-transparent hover:border-gray-700"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => handleSubmit()}
                        disabled={!name.trim()}
                        className={`px-6 py-2 rounded-lg text-white font-bold text-sm transition-all shadow-lg hover:scale-105 active:scale-95 bg-synthux-blue hover:bg-blue-600 shadow-blue-900/20 disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed`}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};
