import React, { useState, useRef, useEffect } from 'react';
import { HardDrive, FolderOpen, ArrowRight, Save, ChevronLeft, ChevronRight, FolderClosed, Scissors, UploadCloud, Library } from 'lucide-react';
import { resolveAssetPath } from '../utils/assetUtils';

const OVERLAYS = [
    { name: 'None', svg: '' },
    { name: 'Sq 2x2 gap 3', svg: `<svg xmlns='http://www.w3.org/2000/svg' width='5' height='5'><rect width='2' height='2' fill='rgba(0,0,0,0.5)'/></svg>` }
];

interface SetupWizardProps {
    onComplete: (workHandle: FileSystemDirectoryHandle, sdHandle: FileSystemDirectoryHandle | null, projectName: string | null) => void;
    onSkip: () => void;
    restorableHandles?: { work: FileSystemDirectoryHandle; backup: FileSystemDirectoryHandle | null } | null;
    onRestore?: () => void;
}

type WizardStep = 'INTRO' | 'EXPLAINER' | 'SELECT_WORK' | 'SELECT_BACKUP' | 'PROJECT_TITLE';

interface Slide {
    icon: React.ReactNode;
    accent: string;      // tailwind color class prefix, e.g. 'indigo'
    headline: string;
    body: React.ReactNode;
}

const EXPLAINER_SLIDES: Slide[] = [
    {
        icon: <FolderClosed size={36} />,
        accent: 'indigo',
        headline: 'What is a Project?',
        body: (
            <>
                A <strong className="text-white">Project</strong> is a collection of{' '}
                <strong className="text-white">6 Tapes</strong>, each with{' '}
                <strong className="text-white">6 Slots</strong> for WAV files.
                <br /><br />
                The app stores the project state in a <code className="text-synthux-yellow bg-white/10 px-1 rounded text-sm">project.json</code>{' '}
                file inside a local folder you choose. You can manage as many projects as you like.
            </>
        ),
    },
    {
        icon: <HardDrive size={36} />,
        accent: 'orange',
        headline: 'The SD Card Structure',
        body: (
            <>
                Spotykach requires a <strong className="text-white">strict folder structure</strong> on the root of the SD card
                (the <code className="text-synthux-orange bg-white/10 px-1 rounded text-sm">SK/</code> folder).
                <br /><br />
                This app's primary goal is to <strong className="text-white">build that structure</strong> for you and convert samples
                to the required format{' '}(<strong className="text-white">32-bit float WAV</strong>).
            </>
        ),
    },
    {
        icon: <Scissors size={36} />,
        accent: 'pink',
        headline: 'Destructive Audio Editing',
        body: (
            <>
                The built-in audio editor is <strong className="text-white">destructive</strong>: every save writes
                a new WAV file to disk.
                <br /><br />
                A <strong className="text-white">history of edits</strong> is kept as separate bounced files,
                but there is no non-destructive undo once a file is overwritten.
                Always make backups of samples you care about.
            </>
        ),
    },
    {
        icon: <UploadCloud size={36} />,
        accent: 'purple',
        headline: 'Build for SD vs. Sync',
        body: (
            <>
                These are <strong className="text-white">two different operations</strong>:
                <br /><br />
                <span className="text-synthux-yellow font-semibold">Build for SD</span> — exports your project into
                the hardware-ready folder structure on the SD card.
                <br /><br />
                <span className="text-synthux-orange font-semibold">Sync</span> — copies or updates files between
                your local work folder and the SD card. Don't confuse them!
            </>
        ),
    },
    {
        icon: <Library size={36} />,
        accent: 'teal',
        headline: 'Sample Library',
        body: (
            <>
                Link <strong className="text-white">any folder</strong> on your drive to use as a sample library.
                <br /><br />
                Library samples can be <strong className="text-white">shared across multiple projects</strong>.
                You can also build a unique curated library directly inside the app.
            </>
        ),
    },
];

export const SetupWizard: React.FC<SetupWizardProps> = ({ onComplete, onSkip, restorableHandles, onRestore }) => {
    const [step, setStep] = useState<WizardStep>('INTRO');
    const [slideIndex, setSlideIndex] = useState(0);
    const overlayIdx = 1;
    const [isMuted, setIsMuted] = useState(true);
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        return () => {
            if (videoRef.current) {
                videoRef.current.pause();
                videoRef.current.removeAttribute('src');
                videoRef.current.load();
            }
        };
    }, []);
    const [workHandle, setWorkHandle] = useState<FileSystemDirectoryHandle | null>(null);
    const [sdHandle, setBackupHandle] = useState<FileSystemDirectoryHandle | null>(null);
    const [projectName, setProjectName] = useState('');

    // STEP 1: Select Work Folder
    const handleSelectWork = async () => {
        try {
            const handle = await window.showDirectoryPicker({
                id: 'spotykach_work',
                mode: 'readwrite',
                startIn: 'documents'
            });
            setWorkHandle(handle);

            try {
                // Check for Projects folder
                await handle.getDirectoryHandle('Projects');
            } catch {
                // Check for SK folder (SD Card structure)
                try {
                    await handle.getDirectoryHandle('SK');
                } catch { }
            }
            setStep('SELECT_BACKUP');
        } catch (e) {
            console.log("Work folder selection cancelled");
        }
    };
    
    // Select a DIFFERENT existing workspace directly
    const handleOpenDifferentWorkspace = async () => {
        try {
            const handle = await window.showDirectoryPicker({
                id: 'spotykach_work',
                mode: 'readwrite',
                startIn: 'documents'
            });
            // Calling onComplete with null backup and no projectName 
            // will trigger scan and show project manager in App.tsx
            onComplete(handle, null, null);
        } catch (e) {
            console.log("Workspace selection cancelled");
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
            try {
                await handle.getDirectoryHandle('SK');
            } catch { }
            setStep('PROJECT_TITLE');

        } catch (e) {
            console.log("Backup folder selection cancelled");
        }
    };

    const handleSkipBackup = () => {
        setBackupHandle(null);
        setStep('PROJECT_TITLE');
    };

    // FINAL: Finish
    const handleFinish = (name: string | null) => {
        if (workHandle) {
            onComplete(workHandle, sdHandle, name);
        }
    };

    // RENDER STEPS
    const renderIntro = () => (
        <div className="max-w-xl w-full text-center space-y-8 animate-in fade-in zoom-in duration-300">
            <div className="space-y-4">
                <h1 className="text-5xl font-bold tracking-tighter bg-gradient-to-br from-synthux-yellow to-synthux-orange bg-clip-text text-transparent">
                    Spotykach <br /> WAV Builder
                </h1>
                <p className="text-xl text-gray-400 leading-relaxed">
                    Let's set up your workspace. We recommend using a <br />
                    <span className="text-white font-bold">Local Folder</span> for projects and your <span className="text-orange-400 font-bold">SD Card</span> for backups.
                </p>
            </div>

            <div className="flex flex-col gap-4 max-w-sm mx-auto">
                {restorableHandles && onRestore && (
                    <div className="flex flex-col items-center mb-4">
                        <button
                            onClick={onRestore}
                            className="w-full py-5 bg-gradient-to-r from-emerald-600/60 to-teal-600/60 hover:from-emerald-500/80 hover:to-teal-500/80 rounded-2xl font-bold text-white text-lg flex flex-col items-center justify-center gap-1 transition-all transform hover:scale-[1.02] shadow-xl hover:shadow-emerald-500/20"
                        >
                            <div className="flex items-center gap-3">
                                <HardDrive size={24} />
                                <div className="text-left leading-tight">
                                    <div className="text-xs font-normal opacity-80 uppercase tracking-wider">Resume Session</div>
                                    <div className="truncate max-w-[200px] text-sm">{restorableHandles.work.name}</div>
                                </div>
                                <ArrowRight />
                            </div>
                            <div className="px-4 py-1 mt-1 bg-black/20 rounded-lg">
                                <p className="text-xs text-orange-300 font-medium leading-tight text-center">
                                    Note: Possible conflict with previous versions. <br />
                                    We recommend making manual backups for crucial work.
                                </p>
                            </div>
                        </button>
                    </div>
                )}

                <button
                    onClick={() => { setSlideIndex(0); setStep('EXPLAINER'); }}
                    className="w-full py-4 bg-indigo-600/60 hover:bg-indigo-500/80 rounded-2xl font-bold text-white text-lg flex items-center justify-center gap-3 transition-all transform hover:scale-[1.02] shadow-xl hover:shadow-indigo-500/20"
                >
                    Start New Setup <ArrowRight />
                </button>

                <button 
                    onClick={handleOpenDifferentWorkspace}
                    className="text-gray-400 hover:text-white text-sm font-bold uppercase tracking-wider py-3 px-4 bg-black/40 backdrop-blur-sm rounded-xl transition-all border border-white/5 hover:border-white/20"
                >
                    {restorableHandles ? "Or select another workspace" : "Load Existing Workspace"}
                </button>

                <button
                    onClick={onSkip}
                    className="text-gray-500/80 hover:text-gray-400 text-[11px] py-1.5 px-3 transition-all hover:underline"
                >
                    Skip setup (Use Browser Cache)
                </button>
            </div>
        </div>
    );

    const accentClasses: Record<string, { bg: string; ring: string; text: string; dot: string; btn: string }> = {
        indigo: { bg: 'bg-indigo-500/10', ring: 'ring-indigo-500/30', text: 'text-indigo-400', dot: 'bg-indigo-500', btn: 'bg-indigo-600/60 hover:bg-indigo-500/80' },
        orange: { bg: 'bg-orange-500/10', ring: 'ring-orange-500/30', text: 'text-orange-400', dot: 'bg-orange-500', btn: 'bg-orange-600/60 hover:bg-orange-500/80' },
        pink:   { bg: 'bg-pink-500/10',   ring: 'ring-pink-500/30',   text: 'text-pink-400',   dot: 'bg-pink-500',   btn: 'bg-pink-600/60 hover:bg-pink-500/80'   },
        purple: { bg: 'bg-purple-500/10', ring: 'ring-purple-500/30', text: 'text-purple-400', dot: 'bg-purple-500', btn: 'bg-purple-600/60 hover:bg-purple-500/80' },
        teal:   { bg: 'bg-teal-500/10',   ring: 'ring-teal-500/30',   text: 'text-teal-400',   dot: 'bg-teal-500',   btn: 'bg-teal-600/60 hover:bg-teal-500/80'   },
    };

    const renderExplainer = () => {
        const slide = EXPLAINER_SLIDES[slideIndex];
        const isLast = slideIndex === EXPLAINER_SLIDES.length - 1;
        const ac = accentClasses[slide.accent];
        return (
            <div className="max-w-xl w-full space-y-8 animate-in fade-in duration-300">
                {/* Progress dots */}
                <div className="flex justify-center gap-2">
                    {EXPLAINER_SLIDES.map((_, i) => (
                        <button
                            key={i}
                            onClick={() => setSlideIndex(i)}
                            className={`transition-all duration-300 rounded-full ${
                                i === slideIndex ? `w-6 h-2.5 ${ac.dot}` : 'w-2.5 h-2.5 bg-white/20 hover:bg-white/40'
                            }`}
                        />
                    ))}
                </div>

                {/* Slide card */}
                <div key={slideIndex} className={`p-8 rounded-3xl border border-white/10 bg-black/40 backdrop-blur-sm space-y-5 animate-in slide-in-from-right-4 duration-300`}>
                    {/* Icon */}
                    <div className={`w-16 h-16 ${ac.bg} rounded-2xl flex items-center justify-center mx-auto ${ac.text} ring-1 ${ac.ring}`}>
                        {slide.icon}
                    </div>
                    {/* Headline */}
                    <h2 className="text-2xl font-bold text-white text-center">{slide.headline}</h2>
                    {/* Body */}
                    <p className={`text-gray-300 text-sm leading-relaxed text-center`}>
                        {slide.body}
                    </p>
                </div>

                {/* Navigation */}
                <div className="flex items-center justify-between gap-4">
                    <button
                        onClick={() => slideIndex > 0 ? setSlideIndex(slideIndex - 1) : setStep('INTRO')}
                        className="flex items-center gap-1 text-gray-400 hover:text-white text-sm py-1.5 px-3 bg-black/40 backdrop-blur-sm rounded-lg transition-all border border-white/5 hover:border-white/20"
                    >
                        <ChevronLeft size={16} />
                        {slideIndex === 0 ? 'Back' : 'Previous'}
                    </button>

                    {isLast ? (
                        <button
                            onClick={() => setStep('SELECT_WORK')}
                            className={`flex-1 py-3 ${ac.btn} rounded-2xl font-bold text-white text-base flex items-center justify-center gap-2 transition-all transform hover:scale-[1.02] shadow-xl`}
                        >
                            Continue to Setup <ArrowRight size={18} />
                        </button>
                    ) : (
                        <button
                            onClick={() => setSlideIndex(slideIndex + 1)}
                            className={`flex-1 py-3 ${ac.btn} rounded-2xl font-bold text-white text-base flex items-center justify-center gap-2 transition-all transform hover:scale-[1.02] shadow-xl`}
                        >
                            Next <ChevronRight size={18} />
                        </button>
                    )}
                </div>

                {/* Skip */}
                <div className="text-center">
                    <button
                        onClick={() => setStep('SELECT_WORK')}
                        className="text-gray-500 hover:text-white text-xs py-1 px-2.5 bg-black/40 backdrop-blur-sm rounded-lg transition-all border border-white/5 hover:border-white/20 underline underline-offset-2"
                    >
                        Skip intro
                    </button>
                </div>
            </div>
        );
    };

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
                className="w-full py-12 border-2 border-dashed border-white/10 hover:border-indigo-500/50 bg-black/40 backdrop-blur-sm hover:bg-black/60 rounded-3xl flex flex-col items-center justify-center gap-4 transition-all group"
            >
                <div className="p-4 bg-black/50 rounded-full group-hover:scale-110 transition-transform">
                    <FolderOpen className="text-gray-400 group-hover:text-indigo-400 transition-colors" size={32} />
                </div>
                <span className="text-lg font-medium text-gray-300 group-hover:text-white">Choose Local Folder...</span>
            </button>

            <div className="flex flex-col items-center gap-6">
                <div className="flex justify-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-indigo-500"></div>
                    <div className="w-3 h-3 rounded-full bg-white/10"></div>
                    <div className="w-3 h-3 rounded-full bg-white/10"></div>
                </div>

                <button
                    onClick={() => setStep('INTRO')}
                    className="text-gray-400 hover:text-white text-sm py-1.5 px-3 bg-black/40 backdrop-blur-sm rounded-lg transition-all border border-white/5 hover:border-white/20 flex items-center gap-2"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Back to Start
                </button>
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
                    className="w-full py-10 border-2 border-dashed border-white/10 hover:border-orange-500/50 bg-black/40 backdrop-blur-sm hover:bg-black/60 rounded-3xl flex flex-col items-center justify-center gap-3 transition-all group"
                >
                    <div className="p-4 bg-black/50 rounded-full group-hover:scale-110 transition-transform">
                        <FolderOpen className="text-gray-400 group-hover:text-orange-400 transition-colors" size={32} />
                    </div>
                    <span className="text-lg font-medium text-gray-300 group-hover:text-white">Select SD Card Root...</span>
                </button>

                <button
                    onClick={handleSkipBackup}
                    className="w-full py-4 text-gray-400 hover:text-white bg-black/40 backdrop-blur-sm border border-white/5 hover:border-white/20 rounded-xl transition-all"
                >
                    Skip for now
                </button>
            </div>

            <div className="flex flex-col items-center gap-6">
                <div className="flex justify-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-indigo-900/50"></div>
                    <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                    <div className="w-3 h-3 rounded-full bg-white/10"></div>
                </div>

                <button
                    onClick={() => setStep('SELECT_WORK')}
                    className="text-gray-400 hover:text-white text-sm py-1.5 px-3 bg-black/40 backdrop-blur-sm rounded-lg transition-all border border-white/5 hover:border-white/20 flex items-center gap-2"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Back to Project Selection
                </button>
            </div>
        </div>
    );

    const renderProjectTitle = () => (
        <div className="max-w-lg w-full space-y-8 animate-in slide-in-from-right duration-300">
            <div className="text-center space-y-4">
                <div className="w-20 h-20 bg-pink-500/10 rounded-3xl flex items-center justify-center mx-auto text-pink-400 ring-1 ring-pink-500/30">
                    <FolderOpen size={40} />
                </div>
                <div>
                    <h2 className="text-3xl font-bold text-white">Name Your Project</h2>
                    <p className="text-gray-400 mt-2">
                        Give your first project a name to get started.
                    </p>
                </div>
            </div>

            <div className="space-y-4">
                <input
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="Project Title"
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-mono text-center text-lg"
                    autoFocus
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && projectName.trim()) {
                            handleFinish(projectName.trim());
                        }
                    }}
                />

                <div className="flex flex-col gap-3 mt-8">
                    <button
                        onClick={() => {
                            if (projectName.trim()) {
                                handleFinish(projectName.trim());
                            }
                        }}
                        disabled={!projectName.trim()}
                        className={`w-full py-4 rounded-xl font-bold text-white text-base flex items-center justify-center gap-2 transition-all transform shadow-xl ${projectName.trim() ? 'bg-indigo-600 hover:bg-indigo-500 hover:scale-[1.02]' : 'bg-gray-800 text-gray-500 cursor-not-allowed'}`}
                    >
                        Create & Enter Studio <ArrowRight size={18} />
                    </button>
                    <button
                        onClick={() => handleFinish(null)}
                        className="w-full py-4 rounded-xl font-bold text-gray-300 bg-white/5 border border-white/10 hover:bg-white/10 transition-all flex items-center justify-center gap-2"
                    >
                        Or go to Project Manager
                    </button>
                </div>
            </div>

            <div className="flex flex-col items-center gap-6 mt-8">
                <div className="flex justify-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-indigo-900/50"></div>
                    <div className="w-3 h-3 rounded-full bg-orange-900/50"></div>
                    <div className="w-3 h-3 rounded-full bg-pink-500"></div>
                </div>

                <button
                    onClick={() => setStep('SELECT_BACKUP')}
                    className="text-gray-400 hover:text-white text-sm py-1.5 px-3 bg-black/40 backdrop-blur-sm rounded-lg transition-all border border-white/5 hover:border-white/20 flex items-center gap-2"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Back to SD Setup
                </button>
            </div>
        </div>
    );

    const overlayStyle = OVERLAYS[overlayIdx].svg
        ? { backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(OVERLAYS[overlayIdx].svg)}")` }
        : {};

    return (
        <div className="fixed inset-0 z-[100] bg-[#121212] text-white font-sans overflow-hidden grid">
            <video
                ref={videoRef}
                autoPlay
                loop
                muted={isMuted}
                playsInline
                className="col-start-1 row-start-1 w-full h-full object-cover z-0 opacity-80 pointer-events-none"
                src={resolveAssetPath('/vid/wavbuilderfullscreen_1.mp4')}
            />
            <div className="col-start-1 row-start-1 w-full h-full z-0 pointer-events-none" style={overlayStyle} />

            <div className="col-start-1 row-start-1 z-10 w-full h-full flex flex-col items-center justify-center p-6 overflow-x-hidden overflow-y-auto">
                {step === 'INTRO' && renderIntro()}
                {step === 'EXPLAINER' && renderExplainer()}
                {step === 'SELECT_WORK' && renderSelectWork()}
                {step === 'SELECT_BACKUP' && renderSelectBackup()}
                {step === 'PROJECT_TITLE' && renderProjectTitle()}
            </div>

            <div className="col-start-1 row-start-1 z-20 self-end justify-self-center mb-12 flex gap-4 pointer-events-auto">
                <button
                    onClick={() => setIsMuted(!isMuted)}
                    className={`w-12 h-12 rounded-full border-2 overflow-hidden flex items-center justify-center transition-all border-white/20 hover:border-white/50 bg-black/50`}
                    title={isMuted ? "Unmute Sound" : "Mute Sound"}
                >
                    <div className="text-[9px] font-bold text-gray-400 flex flex-col items-center leading-none pointer-events-none">
                        <span>SND</span>
                        <span>{isMuted ? "OFF" : "ON"}</span>
                    </div>
                </button>
            </div>
        </div>
    );
};
