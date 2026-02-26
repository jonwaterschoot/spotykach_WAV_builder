import React, { useState, useEffect, useRef, useMemo } from 'react';
import { loadKnownTags } from '../utils/tagStore';
import { Tag, Search } from 'lucide-react';

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
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        loadKnownTags().then(tags => setKnownTags(tags.sort()));
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
    const currentWord = useMemo(() => {
        const parts = value.split(',');
        return parts[parts.length - 1].trimLeft();
    }, [value]);

    useEffect(() => {
        if (currentWord.trim().length > 0) {
            const query = currentWord.trim().toLowerCase();
            const matches = knownTags.filter(t =>
                t.toLowerCase().includes(query) &&
                t.toLowerCase() !== query // don't suggest if exact match
            );
            setSuggestions(matches.slice(0, 8)); // increased to 8
            setShowSuggestions(matches.length > 0);
            setActiveIndex(-1);
        } else {
            setShowSuggestions(false);
            setSuggestions([]);
        }
    }, [currentWord, knownTags]);

    const replaceCurrentWord = (fullText: string, newWord: string) => {
        const parts = fullText.split(',');
        parts[parts.length - 1] = ' ' + newWord;
        return parts.join(',').trimLeft();
    };

    const handleCommit = (selectedTag: string) => {
        const newFullText = replaceCurrentWord(value, selectedTag) + ', ';
        onChange(newFullText);
        setShowSuggestions(false);
        setActiveIndex(-1);
        // Put focus back and keep it
        inputRef.current?.focus();
    };

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
            if (e.key === 'Tab') {
                e.preventDefault();
                const selected = activeIndex >= 0 ? suggestions[activeIndex] : suggestions[0];
                handleCommit(selected);
                return;
            }
            if (e.key === 'Enter') {
                if (activeIndex >= 0) {
                    e.preventDefault();
                    handleCommit(suggestions[activeIndex]);
                    return;
                }
                // If suggestions are visible but none selected, Enter still adds the whole line
                // But let's check if there's exactly one suggestion, maybe commit it?
                // For now, let it fall through to the main Enter handler.
            }
        }

        if (e.key === 'Enter') {
            e.preventDefault();
            if (!value.trim()) return;
            onAdd(value);
            onChange('');
            setShowSuggestions(false);
        }

        if (e.key === ',') {
            // Optional: could trigger something here, but default behavior is fine.
        }
    };

    const highlightMatch = (text: string, query: string) => {
        const index = text.toLowerCase().indexOf(query.toLowerCase());
        if (index === -1) return text;
        const before = text.substring(0, index);
        const match = text.substring(index, index + query.length);
        const after = text.substring(index + query.length);
        return (
            <span>
                {before}
                <span className="text-synthux-orange font-bold">{match}</span>
                {after}
            </span>
        );
    };

    return (
        <div ref={wrapperRef} className="relative flex-1 flex group">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-synthux-orange transition-colors">
                <Tag size={14} />
            </div>
            <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={e => onChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                    if (suggestions.length > 0) setShowSuggestions(true);
                }}
                placeholder={placeholder || "Tags (comma-separated)..."}
                className={className || "flex-1 bg-black/40 border border-gray-700/50 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-synthux-orange/50 focus:ring-1 focus:ring-synthux-orange/20 transition-all font-mono"}
            />

            {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-50 left-0 right-0 top-full mt-2 bg-gray-900/95 backdrop-blur-md border border-gray-700 rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.6)] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="px-3 py-1.5 bg-black/40 border-b border-gray-800 flex items-center justify-between">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                            <Search size={10} /> Suggestions
                        </span>
                        <span className="text-[9px] text-gray-600 font-mono">TAB to pick</span>
                    </div>
                    <div className="max-h-[240px] overflow-y-auto">
                        {suggestions.map((s, i) => (
                            <div
                                key={s}
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    handleCommit(s);
                                }}
                                onMouseEnter={() => setActiveIndex(i)}
                                className={`px-4 py-2.5 text-sm cursor-pointer transition-all flex items-center justify-between ${i === activeIndex ? 'bg-synthux-orange/10 text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'}`}
                            >
                                <span className="flex items-center gap-2">
                                    <div className={`w-1 h-1 rounded-full transition-colors ${i === activeIndex ? 'bg-synthux-orange' : 'bg-gray-700'}`} />
                                    {highlightMatch(s, currentWord)}
                                </span>
                                {i === activeIndex && (
                                    <span className="text-[10px] text-synthux-orange/50 font-bold uppercase tracking-wider">Tab</span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
