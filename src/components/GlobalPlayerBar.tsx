import { Play, Pause } from 'lucide-react';
import type { AppState } from '../types';
import { useAudioPlayer } from '../contexts/AudioPlayerContext';

interface GlobalPlayerBarProps {
    files: AppState['files'];
    /**
     * Where the bar sits. Both views place it with `sticky`, so it inherits the width and
     * the left offset of whatever column it is dropped into and never has to know how wide
     * the (resizable) file browser currently is.
     */
    className?: string;
}

/**
 * The transport for the main view. Lives in All Tapes inside the grid card, and in a single
 * tape at the foot of the scroll column.
 *
 * The play/pause control is a real `<button>`, which is the whole of the spacebar behaviour:
 * once it has been clicked it holds focus, and the browser fires a click on Space. There is
 * no key handler here on purpose — adding one would fight the native activation.
 */
export const GlobalPlayerBar = ({ files, className = '' }: GlobalPlayerBarProps) => {
    const { isPlaying, activeFileId, lastActiveFileId, play, pause, currentTime, duration, seek } = useAudioPlayer();

    const displayFileId = activeFileId || lastActiveFileId;
    const activeFile = displayFileId ? files[displayFileId] : null;
    const isThisPlaying = isPlaying && activeFile?.id === activeFileId;

    return (
        <div className={`p-3 bg-[#0f0f11]/95 backdrop-blur-sm border border-gray-700/80 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.8)] rounded-xl flex items-center justify-between gap-4 transition-all ${className}`}>
            <div className="flex items-center gap-3 w-full">
                <button
                    onClick={() => {
                        if (isThisPlaying) pause();
                        else if (activeFile) play(activeFile);
                    }}
                    disabled={!activeFile}
                    className={`p-3 rounded-full transition-colors flex-shrink-0 ${activeFile && isThisPlaying ? 'bg-gray-700 text-white hover:bg-gray-600' : activeFile ? 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white' : 'bg-gray-900/50 text-gray-700 cursor-not-allowed'}`}
                    title={isThisPlaying ? "Pause" : "Play"}
                >
                    {isThisPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                </button>
                <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-sm font-bold text-gray-300 truncate" title={activeFile ? activeFile.name : 'No file selected'}>
                        {activeFile ? activeFile.name : 'No file selected'}
                    </span>
                    {activeFile && (
                        <div className="flex items-center gap-3 mt-1 w-full">
                            <span className="text-[10px] text-gray-400 font-mono min-w-[30px] text-right">
                                {Math.floor(currentTime || 0)}s
                            </span>
                            <input
                                type="range"
                                min={0}
                                max={duration || 0}
                                value={currentTime || 0}
                                disabled={!activeFile || duration <= 0}
                                onChange={(e) => {
                                    if (duration > 0) {
                                        seek(Number(e.target.value));
                                    }
                                }}
                                className="flex-1 accent-gray-300 disabled:opacity-40"
                            />
                            <span className="text-[10px] text-gray-400 font-mono min-w-[30px]">
                                {Math.floor(duration || 0)}s
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
