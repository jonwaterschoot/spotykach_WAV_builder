import React, { useState, useEffect, useRef } from 'react';
import { loadKnownTags } from '../utils/tagStore';

interface SmartTagInputProps {
    value: string;
    onChange: (val: string) => void;
    onAdd: (tag: string) => void;
    placeholder?: string;
    className?: string;
}

export const SmartTagInput: React.FC<SmartTagInputProps> = ({ value, onChange, onAdd, placeholder, className }) => {
    const [knownTags, setKnownTags] = useState<string[]>([]);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);

    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        loadKnownTags().then(setKnownTags);
    }, []);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Extract the "current typing word" after the last comma
    const getCurrentWord = (fullText: string) => {
        const parts = fullText.split(',');
        return parts[parts.length - 1].trimLeft();
    };

    const replaceCurrentWord = (fullText: string, newWord: string) => {
        const parts = fullText.split(',');
        parts[parts.length - 1] = ' ' + newWord;
        return parts.join(',').trimLeft(); // remove leading space if it was the first word
    };

    useEffect(() => {
        const currentWord = getCurrentWord(value);
        if (currentWord.length > 0) {
            const matches = knownTags.filter(t =>
                t.toLowerCase().includes(currentWord.toLowerCase()) &&
                t.toLowerCase() !== currentWord.toLowerCase() // don't suggest if exact match
            );
            setSuggestions(matches.slice(0, 5)); // max 5 suggestions
            setShowSuggestions(matches.length > 0);
            setActiveIndex(-1);
        } else {
            setShowSuggestions(false);
            setSuggestions([]);
        }
    }, [value, knownTags]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (showSuggestions && suggestions.length > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : prev));
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIndex(prev => (prev > 0 ? prev - 1 : -1));
                return;
            }
            if (e.key === 'Tab' || (e.key === 'Enter' && activeIndex >= 0)) {
                e.preventDefault();
                const selected = activeIndex >= 0 ? suggestions[activeIndex] : suggestions[0]; // Tab defaults to first
                const newFullText = replaceCurrentWord(value, selected) + ', ';
                onChange(newFullText);
                setShowSuggestions(false);
                return;
            }
        }

        if (e.key === 'Enter') {
            e.preventDefault();
            if (!value.trim()) return;
            onAdd(value);
            onChange(''); // Clear after adding batch
            setShowSuggestions(false);
        }
    };

    return (
        <div ref={wrapperRef} className="relative flex-1 flex">
            <input
                type="text"
                value={value}
                onChange={e => onChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                    if (suggestions.length > 0) setShowSuggestions(true);
                }}
                placeholder={placeholder || "Tags (comma-separated)..."}
                className={className || "flex-1 bg-black/50 border border-gray-700 rounded px-3 py-2 text-sm text-white"}
            />

            {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded shadow-xl overflow-hidden">
                    {suggestions.map((s, i) => (
                        <div
                            key={s}
                            onMouseDown={(e) => {
                                e.preventDefault(); // keep focus on input
                                const newFullText = replaceCurrentWord(value, s) + ', ';
                                onChange(newFullText);
                                setShowSuggestions(false);
                            }}
                            className={`px-3 py-2 text-sm cursor-pointer transition-colors ${i === activeIndex ? 'bg-synthux-blue text-black' : 'text-gray-300 hover:bg-gray-700 hover:text-white'}`}
                        >
                            {s}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
