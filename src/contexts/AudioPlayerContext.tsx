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

    const stop = () => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
        }
        setIsPlaying(false);
        setActiveFileId(null);
        setCurrentTime(0);
    };

    const pause = () => {
        if (audioRef.current) {
            audioRef.current.pause();
        }
        setIsPlaying(false);
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
                audioRef.current.play()
                    .then(() => setIsPlaying(true))
                    .catch(e => console.error("Resume failed", e));
            }
            return;
        }

        stop(); // Ensure previous is stopped

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
            audioRef.current.play()
                .then(() => {
                    setIsPlaying(true);
                    setActiveFileId(file.id);
                })
                .catch(e => {
                    console.error("Play failed", e);
                    alert("Playback failed. See console.");
                });
        }
    };

    return (
        <AudioPlayerContext.Provider value={{ isPlaying, activeFileId, play, stop, pause, seek, duration, currentTime }}>
            {children}
        </AudioPlayerContext.Provider>
    );
};
