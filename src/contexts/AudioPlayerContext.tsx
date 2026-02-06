import React, { createContext, useContext, useRef, useState, useEffect } from 'react';
import type { FileRecord } from '../types';

interface AudioPlayerContextType {
    isPlaying: boolean;
    activeFileId: string | null;
    play: (file: FileRecord, versionId?: string) => void;
    stop: () => void;
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
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const currentUrlRef = useRef<string | null>(null);

    useEffect(() => {
        audioRef.current = new Audio();
        audioRef.current.onended = () => {
            setIsPlaying(false);
            setActiveFileId(null);
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
    };

    const play = (file: FileRecord, versionId?: string) => {
        // If clicking the same file that is playing, stop it (toggle)
        if (activeFileId === file.id && isPlaying) {
            stop();
            return;
        }

        stop(); // Ensure previous is stopped

        const targetVersionId = versionId || file.currentVersionId;
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
        <AudioPlayerContext.Provider value={{ isPlaying, activeFileId, play, stop }}>
            {children}
        </AudioPlayerContext.Provider>
    );
};
