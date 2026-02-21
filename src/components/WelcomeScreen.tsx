import React from 'react';
import { HardDrive, FolderOpen, Globe, AlertTriangle } from 'lucide-react';

interface WelcomeScreenProps {
    onSelectMode: (mode: 'LOCAL' | 'SD' | 'BROWSER') => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onSelectMode }) => {
    return (
        <div className="fixed inset-0 z-[100] bg-[#121212] flex flex-col items-center justify-center p-6 text-white font-sans relative">
            {/* Close / Dismiss Button */}
            <button
                onClick={() => onSelectMode('BROWSER')}
                className="absolute top-6 right-6 p-2 text-gray-500 hover:text-white transition-colors rounded-full hover:bg-white/10"
                title="Dismiss (Enter Temporary Browser Mode)"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>

            <div className="max-w-xl w-full flex flex-col items-center text-center space-y-12">

                {/* Branding */}
                <div className="space-y-4">
                    <h1 className="text-5xl font-bold tracking-tighter bg-gradient-to-br from-indigo-400 to-purple-600 bg-clip-text text-transparent">
                        Spotykach <br /> WAV Builder
                    </h1>
                    <p className="text-xl text-gray-400 leading-relaxed max-w-md mx-auto">
                        Manage your samples, build projects, and sync directly to your hardware.
                    </p>
                </div>

                {/* Primary Action */}
                <button
                    onClick={() => onSelectMode('LOCAL')}
                    className="group relative w-full p-8 bg-[#1a1a1a] border border-white/10 hover:border-indigo-500/50 rounded-3xl text-left transition-all hover:shadow-2xl hover:shadow-indigo-900/20 flex items-center gap-6"
                >
                    <div className="p-4 bg-indigo-500/10 rounded-2xl group-hover:bg-indigo-500/20 transition-colors">
                        <FolderOpen className="text-indigo-400" size={32} />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-2xl font-bold text-white mb-2 group-hover:text-indigo-300 transition-colors">Open Work Folder</h3>
                        <p className="text-sm text-gray-400">
                            Select a folder on your Computer or SD Card to store your projects.
                        </p>
                    </div>
                    <div className="text-gray-500 group-hover:text-white transition-colors">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </div>
                </button>

                <div className="text-xs text-gray-600 flex items-center gap-2">
                    <AlertTriangle size={12} />
                    <span>Works best in Chrome / Edge due to File System Access API support.</span>
                </div>
            </div>
        </div>
    );
};
