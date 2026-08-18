import React, { createContext, useContext, useRef, useState, useEffect } from 'react';
import type { FileRecord } from '../types';

interface AudioPlayerContextType {
    isPlaying: boolean;
    activeFileId: string | null;
    /**
     * The last file the transport loaded, kept after `stop()` clears `activeFileId`.
     * The player bar shows it so the bar does not empty out between plays, and it lives
     * here rather than in a bar so that both bars — the one in All Tapes and the one in
     * a single tape — still name the same file after a view switch.
     */
    lastActiveFileId: string | null;
    play: (file: FileRecord, versionId?: string) => void;
    stop: () => void;
    pause: () => void;
    seek: (time: number) => void;
    duration: number;
    currentTime: number;
}

const AudioPlayerContext = createContext<AudioPlayerContextType | null>(null);

export const useAudioPlayer = () => {
    const context = useContext(AudioPlayerContext);
    if (!context) throw new Error('useAudioPlayer must be used within AudioPlayerProvider');
    return context;
};

// Long enough to take the click off a hard cut, short enough that nobody waits for it.
const FADE_MS = 15;

export const AudioPlayerProvider = ({ children }: { children: React.ReactNode }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [activeFileId, setActiveFileId] = useState<string | null>(null);
    const [lastActiveFileId, setLastActiveFileId] = useState<string | null>(null);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const currentUrlRef = useRef<string | null>(null);

    // The volume ramp runs on frames, but whatever waits at the end of it — the pause,
    // the return to full volume — runs on a timer. Frames stop landing whenever the main
    // thread is busy (decoding a waveform, encoding a WAV) and stop altogether when the
    // tab is hidden, so nothing that has to happen may be left sitting inside the ramp.
    const fadeRafRef = useRef<number | null>(null);
    const haltTimerRef = useRef<number | null>(null);

    const clearFade = () => {
        if (fadeRafRef.current) {
            cancelAnimationFrame(fadeRafRef.current);
            fadeRafRef.current = null;
        }
        if (haltTimerRef.current) {
            clearTimeout(haltTimerRef.current);
            haltTimerRef.current = null;
        }
    };

    // Ramps down, then pauses and runs `halt`. `halt` belongs to the timer, so a ramp
    // that never gets a frame costs the fade and nothing else.
    const fadeOutThen = (halt: () => void) => {
        clearFade();

        const audio = audioRef.current;
        if (!audio || audio.paused) {
            halt();
            return;
        }

        const startVolume = audio.volume;
        const startTime = performance.now();

        const step = (now: number) => {
            const progress = Math.min((now - startTime) / FADE_MS, 1);
            if (audioRef.current) audioRef.current.volume = startVolume * (1 - progress);
            fadeRafRef.current = progress < 1 ? requestAnimationFrame(step) : null;
        };
        fadeRafRef.current = requestAnimationFrame(step);

        haltTimerRef.current = window.setTimeout(() => {
            haltTimerRef.current = null;
            if (fadeRafRef.current) {
                cancelAnimationFrame(fadeRafRef.current);
                fadeRafRef.current = null;
            }
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.volume = 1;
            }
            halt();
        }, FADE_MS);
    };

    // The mirror of the above, for a start or a resume. Expects the element to be at
    // zero already so the first frame does not jump.
    const fadeIn = () => {
        clearFade();

        const audio = audioRef.current;
        if (!audio) return;

        audio.volume = 0;
        const startTime = performance.now();

        const step = (now: number) => {
            const progress = Math.min((now - startTime) / FADE_MS, 1);
            if (audioRef.current) audioRef.current.volume = progress;
            fadeRafRef.current = progress < 1 ? requestAnimationFrame(step) : null;
        };
        fadeRafRef.current = requestAnimationFrame(step);

        haltTimerRef.current = window.setTimeout(() => {
            haltTimerRef.current = null;
            if (fadeRafRef.current) {
                cancelAnimationFrame(fadeRafRef.current);
                fadeRafRef.current = null;
            }
            if (audioRef.current) audioRef.current.volume = 1;
        }, FADE_MS);
    };

    useEffect(() => {
        const audio = new Audio();
        audioRef.current = audio;

        audio.onended = () => {
            setIsPlaying(false);
            setActiveFileId(null);
            setCurrentTime(0);
        };
        audio.ontimeupdate = () => {
            setCurrentTime(audio.currentTime);
        };
        audio.onloadedmetadata = () => {
            setDuration(audio.duration);
        };
        audio.onerror = (e) => {
            console.error("Audio Playback Error", e);
            clearFade();
            audio.volume = 1;
            setIsPlaying(false);
            setActiveFileId(null);
        };

        return () => {
            clearFade();
            audio.pause();
            if (currentUrlRef.current) {
                URL.revokeObjectURL(currentUrlRef.current);
            }
        };
    }, []);

    // Smooth Playhead Update Loop
    const rafRef = useRef<number | null>(null);
    useEffect(() => {
        const updateProgress = () => {
            if (audioRef.current && !audioRef.current.paused) {
                setCurrentTime(audioRef.current.currentTime);
                rafRef.current = requestAnimationFrame(updateProgress);
            }
        };

        if (isPlaying) {
            rafRef.current = requestAnimationFrame(updateProgress);
        } else {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }

        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [isPlaying]);

    // Stop and pause report themselves before they fade. The button has to answer the
    // click now, not once the ramp is finished with it.
    const stop = () => {
        setIsPlaying(false);
        setActiveFileId(null);
        setCurrentTime(0);
        fadeOutThen(() => {
            if (audioRef.current) audioRef.current.currentTime = 0;
        });
    };

    const pause = () => {
        setIsPlaying(false);
        fadeOutThen(() => { });
    };

    const seek = (time: number) => {
        if (audioRef.current) {
            audioRef.current.currentTime = time;
            setCurrentTime(time);
        }
    };

    const play = (file: FileRecord, versionId?: string) => {
        const targetVersionId = versionId || file.currentVersionId;

        // If clicking the same file that is playing, pause it (toggle)
        if (activeFileId === file.id && isPlaying) {
            pause();
            return;
        }

        // If clicking the same file and it is paused, resume it
        if (activeFileId === file.id && !isPlaying && currentUrlRef.current) {
            if (audioRef.current) {
                clearFade();
                audioRef.current.volume = 0;
                audioRef.current.play()
                    .then(() => {
                        setIsPlaying(true);
                        fadeIn();
                    })
                    .catch(e => {
                        console.error("Resume failed", e);
                        if (audioRef.current) audioRef.current.volume = 1;
                    });
            }
            return;
        }

        const proceedToPlay = () => {
            const version = file.versions.find(v => v.id === targetVersionId);

            if (!version || !version.blob) {
                // The fade-out has already stopped whatever was running, so the transport
                // has to be told it is idle. Left alone it keeps reporting the previous
                // file as playing, and the card that file sits in keeps offering a STOP
                // for audio that is no longer there.
                console.warn("AudioPlayer: No valid blob found for file", file.name);
                setIsPlaying(false);
                setActiveFileId(null);
                setCurrentTime(0);
                alert(`"${file.name}" has no audio to play. The file is missing or unreadable.`);
                return;
            }

            // Cleanup previous URL
            if (currentUrlRef.current) {
                URL.revokeObjectURL(currentUrlRef.current);
            }

            const url = URL.createObjectURL(version.blob);
            currentUrlRef.current = url;

            if (audioRef.current) {
                audioRef.current.src = url;
                audioRef.current.volume = 0;
                audioRef.current.play()
                    .then(() => {
                        setIsPlaying(true);
                        setActiveFileId(file.id);
                        setLastActiveFileId(file.id);
                        fadeIn();
                    })
                    .catch(e => {
                        console.error("Play failed", e);
                        if (audioRef.current) audioRef.current.volume = 1;
                        setIsPlaying(false);
                        setActiveFileId(null);
                        alert("Playback failed. See console.");
                    });
            }
        };

        if (isPlaying || fadeRafRef.current || haltTimerRef.current) {
            fadeOutThen(proceedToPlay);
        } else {
            proceedToPlay();
        }
    };

    return (
        <AudioPlayerContext.Provider value={{ isPlaying, activeFileId, lastActiveFileId, play, stop, pause, seek, duration, currentTime }}>
            {children}
        </AudioPlayerContext.Provider>
    );
};
