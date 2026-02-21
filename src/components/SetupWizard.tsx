import React, { useState } from 'react';
import { HardDrive, FolderOpen, ArrowRight, Check, Save } from 'lucide-react';

interface SetupWizardProps {
    onComplete: (workHandle: FileSystemDirectoryHandle, backupHandle: FileSystemDirectoryHandle | null) => void;
    onSkip: () => void;
    restorableHandles?: { work: FileSystemDirectoryHandle; backup: FileSystemDirectoryHandle | null } | null;
    onRestore?: () => void;
}

type WizardStep = 'INTRO' | 'SELECT_WORK' | 'SELECT_BACKUP' | 'CONFIRM';

export const SetupWizard: React.FC<SetupWizardProps> = ({ onComplete, onSkip, restorableHandles, onRestore }) => {
    const [step, setStep] = useState<WizardStep>('INTRO');
    const [workHandle, setWorkHandle] = useState<FileSystemDirectoryHandle | null>(null);
    const [backupHandle, setBackupHandle] = useState<FileSystemDirectoryHandle | null>(null);
    const [workAnalysis, setWorkAnalysis] = useState<string | null>(null);
    const [backupAnalysis, setBackupAnalysis] = useState<string | null>(null);

    // STEP 1: Select Work Folder
    const handleSelectWork = async () => {
        try {
            const handle = await window.showDirectoryPicker({
                id: 'spotykach_work',
                mode: 'readwrite',
                startIn: 'documents'
            });
            setWorkHandle(handle);

            // Analyze
            let analysis = "New Workspace";
            try {
                // Check for Projects folder
                await handle.getDirectoryHandle('Projects');
                analysis = "Existing Projects Found";
            } catch {
                // Check for SK folder (SD Card structure)
                try {
                    await handle.getDirectoryHandle('SK');
                    analysis = "SD Card Structure Detected";
                } catch { }
            }
            setWorkAnalysis(analysis);
            setStep('SELECT_BACKUP');
        } catch (e) {
            console.log("Work folder selection cancelled");
        }
    };

    // STEP 2: Select Backup Folder
    const handleSelectBackup = async () => {
        try {
            const handle = await window.showDirectoryPicker({
                id: 'spotykach_backup',
                mode: 'readwrite'
            });

            if (handle.name === workHandle?.name) { // Simple check, handles are unique obj but names might match
                alert("Please select a different folder for backup.");
                return;
            }

            setBackupHandle(handle);
            // Analyze
            let analysis = "Empty Backup Target";
            try {
                await handle.getDirectoryHandle('SK');
                analysis = "Valid Spotykach SD Card";
            } catch { }
            setBackupAnalysis(analysis);
            setStep('CONFIRM');

        } catch (e) {
            console.log("Backup folder selection cancelled");
        }
    };

    const handleSkipBackup = () => {
        setBackupHandle(null);
        setStep('CONFIRM');
    };

    // FINAL: Finish
    const handleFinish = () => {
        if (workHandle) {
            onComplete(workHandle, backupHandle);
        }
    };

    // RENDER STEPS
    const renderIntro = () => (
        <div className="max-w-xl w-full text-center space-y-8 animate-in fade-in zoom-in duration-300">
            <div className="space-y-4">
                <h1 className="text-5xl font-bold tracking-tighter bg-gradient-to-br from-indigo-400 to-purple-600 bg-clip-text text-transparent">
                    Spotykach <br /> WAV Builder
                </h1>
                <p className="text-xl text-gray-400 leading-relaxed">
                    Let's set up your workspace. We recommend using a <br />
                    <span className="text-white font-bold">Local Folder</span> for projects and your <span className="text-orange-400 font-bold">SD Card</span> for backups.
                </p>
            </div>

            <div className="flex flex-col gap-4 max-w-sm mx-auto">
                {restorableHandles && onRestore && (
                    <button
                        onClick={onRestore}
                        className="w-full py-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 rounded-2xl font-bold text-white text-lg flex items-center justify-center gap-3 transition-all transform hover:scale-[1.02] shadow-xl hover:shadow-emerald-500/20 mb-2"
                    >
                        <HardDrive size={24} />
                        <div className="text-left leading-tight">
                            <div className="text-xs font-normal opacity-80 uppercase tracking-wider">Resume Session</div>
                            <div className="truncate max-w-[200px] text-sm">{restorableHandles.work.name}</div>
                        </div>
                        <ArrowRight className="ml-auto" />
                    </button>
                )}

                <button
                    onClick={() => setStep('SELECT_WORK')}
                    className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 rounded-2xl font-bold text-white text-lg flex items-center justify-center gap-3 transition-all transform hover:scale-[1.02] shadow-xl hover:shadow-indigo-500/20"
                >
                    Start New Setup <ArrowRight />
                </button>
                <button
                    onClick={onSkip}
                    className="text-gray-500 hover:text-gray-300 text-sm py-2"
                >
                    Skip setup (Use Browser Cache)
                </button>
            </div>
        </div>
    );

    const renderSelectWork = () => (
        <div className="max-w-lg w-full space-y-8 animate-in slide-in-from-right duration-300">
            <div className="text-center space-y-4">
                <div className="w-20 h-20 bg-indigo-500/10 rounded-3xl flex items-center justify-center mx-auto text-indigo-400 ring-1 ring-indigo-500/30">
                    <HardDrive size={40} />
                </div>
                <div>
                    <h2 className="text-3xl font-bold text-white">Select Workspace</h2>
                    <p className="text-gray-400 mt-2">
                        Choose a folder on your computer to store your projects.
                    </p>
                </div>
            </div>

            <button
                onClick={handleSelectWork}
                className="w-full py-12 border-2 border-dashed border-white/10 hover:border-indigo-500/50 bg-white/5 hover:bg-white/10 rounded-3xl flex flex-col items-center justify-center gap-4 transition-all group"
            >
                <div className="p-4 bg-black/50 rounded-full group-hover:scale-110 transition-transform">
                    <FolderOpen className="text-gray-400 group-hover:text-indigo-400 transition-colors" size={32} />
                </div>
                <span className="text-lg font-medium text-gray-300 group-hover:text-white">Choose Local Folder...</span>
            </button>

            <div className="flex justify-center gap-3">
                <div className="w-3 h-3 rounded-full bg-indigo-500"></div>
                <div className="w-3 h-3 rounded-full bg-white/10"></div>
                <div className="w-3 h-3 rounded-full bg-white/10"></div>
            </div>
        </div>
    );

    const renderSelectBackup = () => (
        <div className="max-w-lg w-full space-y-8 animate-in slide-in-from-right duration-300">
            <div className="text-center space-y-4">
                <div className="w-20 h-20 bg-orange-500/10 rounded-3xl flex items-center justify-center mx-auto text-orange-400 ring-1 ring-orange-500/30">
                    <Save size={40} />
                </div>
                <div>
                    <h2 className="text-3xl font-bold text-white">Connect SD Card</h2>
                    <p className="text-gray-400 mt-2">
                        (Optional) Select your Spotykach SD Card root for <span className="text-orange-400 font-medium">1-Click Sync</span>.
                    </p>
                </div>
            </div>

            <div className="space-y-4">
                <button
                    onClick={handleSelectBackup}
                    className="w-full py-10 border-2 border-dashed border-white/10 hover:border-orange-500/50 bg-white/5 hover:bg-white/10 rounded-3xl flex flex-col items-center justify-center gap-3 transition-all group"
                >
                    <div className="p-4 bg-black/50 rounded-full group-hover:scale-110 transition-transform">
                        <FolderOpen className="text-gray-400 group-hover:text-orange-400 transition-colors" size={32} />
                    </div>
                    <span className="text-lg font-medium text-gray-300 group-hover:text-white">Select SD Card Root...</span>
                </button>

                <button
                    onClick={handleSkipBackup}
                    className="w-full py-4 text-gray-500 hover:text-white hover:bg-white/5 rounded-xl transition-colors"
                >
                    Skip for now
                </button>
            </div>

            <div className="flex justify-center gap-3">
                <div className="w-3 h-3 rounded-full bg-indigo-900/50"></div>
                <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                <div className="w-3 h-3 rounded-full bg-white/10"></div>
            </div>
        </div>
    );

    const renderConfirm = () => (
        <div className="max-w-lg w-full space-y-8 animate-in scale-95 duration-300 text-center">
            <div>
                <h2 className="text-4xl font-bold text-white mb-2">You're All Set!</h2>
                <p className="text-gray-400">Your workspace is ready to go.</p>
            </div>

            <div className="grid gap-4 text-left">
                {/* WORK SUMMARY */}
                <div className="p-5 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl flex items-center gap-5">
                    <div className="p-3 bg-indigo-500/20 rounded-xl text-indigo-400">
                        <HardDrive size={24} />
                    </div>
                    <div>
                        <h3 className="font-bold text-indigo-100 text-lg">Work Folder</h3>
                        <p className="text-sm text-gray-400 font-mono mt-1 opacity-80">{workHandle?.name}</p>
                        {workAnalysis && <p className="text-xs text-indigo-400 mt-2 flex items-center gap-1"><Check size={10} /> {workAnalysis}</p>}
                    </div>
                </div>

                {/* BACKUP SUMMARY */}
                {backupHandle ? (
                    <div className="p-5 bg-orange-500/10 border border-orange-500/20 rounded-2xl flex items-center gap-5">
                        <div className="p-3 bg-orange-500/20 rounded-xl text-orange-400">
                            <Save size={24} />
                        </div>
                        <div>
                            <h3 className="font-bold text-orange-100 text-lg">Backup Target</h3>
                            <p className="text-sm text-gray-400 font-mono mt-1 opacity-80">{backupHandle.name}</p>
                            {backupAnalysis && <p className="text-xs text-orange-400 mt-2 flex items-center gap-1"><Check size={10} /> {backupAnalysis}</p>}
                        </div>
                    </div>
                ) : (
                    <div className="p-5 bg-white/5 border border-white/10 rounded-2xl flex items-center gap-5 opacity-60">
                        <div className="p-3 bg-white/10 rounded-xl">
                            <Save size={24} />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-300 text-lg">No Backup Configured</h3>
                            <p className="text-sm text-gray-500">You can add this later in Settings.</p>
                        </div>
                    </div>
                )}
            </div>

            <button
                onClick={handleFinish}
                className="w-full py-5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 rounded-2xl font-bold text-xl text-white shadow-xl shadow-indigo-900/20 transition-all transform hover:scale-[1.02]"
            >
                Enter Studio
            </button>

            <div className="flex justify-center gap-3">
                <div className="w-3 h-3 rounded-full bg-indigo-900/50"></div>
                <div className="w-3 h-3 rounded-full bg-orange-900/50"></div>
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 z-[100] bg-[#121212] flex flex-col items-center justify-center p-6 text-white font-sans">
            {step === 'INTRO' && renderIntro()}
            {step === 'SELECT_WORK' && renderSelectWork()}
            {step === 'SELECT_BACKUP' && renderSelectBackup()}
            {step === 'CONFIRM' && renderConfirm()}
        </div>
    );
};
