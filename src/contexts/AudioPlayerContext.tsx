import React, { createContext, useContext, useRef, useState, useEffect } from 'react';
import type { FileRecord } from '../types';

interface AudioPlayerContextType {
    isPlaying: boolean;
    activeFileId: string | null;
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

export const AudioPlayerProvider = ({ children }: { children: React.ReactNode }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [activeFileId, setActiveFileId] = useState<string | null>(null);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const currentUrlRef = useRef<string | null>(null);

    useEffect(() => {
        audioRef.current = new Audio();
        audioRef.current.onended = () => {
            setIsPlaying(false);
            setActiveFileId(null);
            setCurrentTime(0);
        };
        audioRef.current.ontimeupdate = () => {
            if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
        };
        audioRef.current.onloadedmetadata = () => {
            if (audioRef.current) setDuration(audioRef.current.duration);
        };
        audioRef.current.onerror = (e) => {
            console.error("Audio Playback Error", e);
            setIsPlaying(false);
            setActiveFileId(null);
        };

        return () => {
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


    const fadeIntervalRef = useRef<number | null>(null);
    const pendingActionRef = useRef<(() => void) | null>(null);

    const clearFade = () => {
        if (fadeIntervalRef.current) {
            cancelAnimationFrame(fadeIntervalRef.current);
            fadeIntervalRef.current = null;
        }
        pendingActionRef.current = null;
    };

    const fadeOut = (callback: () => void) => {
        clearFade(); // Cancel any existing fade/action

        if (!audioRef.current || audioRef.current.paused) {
            callback();
            return;
        }

        const audio = audioRef.current;
        const startVolume = 1.0;
        const fadeTime = 15; // Shorter fade (15ms)
        const startTime = performance.now();
        pendingActionRef.current = callback;

        const animate = (now: number) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / fadeTime, 1);

            if (audioRef.current) {
                audio.volume = startVolume * (1 - progress);
            }

            if (progress < 1) {
                fadeIntervalRef.current = requestAnimationFrame(animate);
            } else {
                audio.pause();
                audio.volume = startVolume;
                const action = pendingActionRef.current;
                fadeIntervalRef.current = null;
                pendingActionRef.current = null;
                if (action) action();
            }
        };
        fadeIntervalRef.current = requestAnimationFrame(animate);
    };

    const stop = () => {
        fadeOut(() => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.currentTime = 0;
            }
            setIsPlaying(false);
            setActiveFileId(null);
            setCurrentTime(0);
        });
    };

    const pause = () => {
        fadeOut(() => {
            setIsPlaying(false);
        });
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
                        const startTime = performance.now();
                        const fadeIn = (now: number) => {
                            const elapsed = now - startTime;
                            const progress = Math.min(elapsed / 15, 1);
                            if (audioRef.current) audioRef.current.volume = progress;
                            if (progress < 1) fadeIntervalRef.current = requestAnimationFrame(fadeIn);
                            else fadeIntervalRef.current = null;
                        };
                        fadeIntervalRef.current = requestAnimationFrame(fadeIn);
                    })
                    .catch(e => console.error("Resume failed", e));
            }
            return;
        }

        const proceedToPlay = () => {
            const version = file.versions.find(v => v.id === targetVersionId);

            if (!version || !version.blob) {
                console.warn("AudioPlayer: No valid blob found for file", file.name);
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
                        const startTime = performance.now();
                        const fadeIn = (now: number) => {
                            const elapsed = now - startTime;
                            const progress = Math.min(elapsed / 15, 1);
                            if (audioRef.current) audioRef.current.volume = progress;
                            if (progress < 1) fadeIntervalRef.current = requestAnimationFrame(fadeIn);
                            else fadeIntervalRef.current = null;
                        };
                        fadeIntervalRef.current = requestAnimationFrame(fadeIn);
                    })
                    .catch(e => {
                        console.error("Play failed", e);
                        alert("Playback failed. See console.");
                    });
            }
        };

        if (isPlaying || fadeIntervalRef.current) {
            fadeOut(proceedToPlay);
        } else {
            proceedToPlay();
        }
    };

    return (
        <AudioPlayerContext.Provider value={{ isPlaying, activeFileId, play, stop, pause, seek, duration, currentTime }}>
            {children}
        </AudioPlayerContext.Provider>
    );
};
