import { useState, useRef, useEffect, useMemo } from 'react';
import { X, Upload, Trash2, Edit2, Check, Settings, Plus, FileAudio, FolderOpen, AlertCircle, Info, ChevronDown, ChevronRight, Play, Pause, Square, RotateCcw, RefreshCw } from 'lucide-react';
import type { FileRecord, UserLibrary, UserLibraryMetadata, AudioVersion } from '../types';
import { useAudioConverter } from '../utils/useAudioConverter';
import { type CustomFolderRecord, loadCustomFoldersFromDB, saveCustomFoldersToDB } from '../utils/persistence';
import { SmartTagInput } from './SmartTagInput';
import { NotesEditor } from './NotesEditor';
import { LocalFolderBrowser } from './LocalFolderBrowser';
import { saveKnownTags } from '../utils/tagStore';
import { detectCueChunk } from '../utils/importUtils';

const COMMON_LICENSES = [
    { label: "Standard Copyright / All Rights Reserved", value: "", short: "ARR" },
    { label: "Creative Commons Attribution 4.0 International (CC-BY 4.0)", value: "Creative Commons Attribution 4.0 International (CC-BY 4.0)\n\nThis license allows reusers to distribute, remix, adapt, and build upon the material in any medium or format, so long as attribution is given to the creator. The license allows for commercial use.", short: "CC-BY" },
    { label: "Creative Commons Attribution-ShareAlike 4.0 (CC-BY-SA 4.0)", value: "Creative Commons Attribution-ShareAlike 4.0 International (CC-BY-SA 4.0)\n\nThis license allows reusers to distribute, remix, adapt, and build upon the material in any medium or format, so long as attribution is given to the creator. If you remix, adapt, or build upon the material, you must license the modified material under identical terms. The license allows for commercial use.", short: "CC-BY-SA" },
    { label: "Creative Commons Attribution-NonCommercial 4.0 (CC-BY-NC 4.0)", value: "Creative Commons Attribution-NonCommercial 4.0 International (CC-BY-NC 4.0)\n\nThis license allows reusers to distribute, remix, adapt, and build upon the material in any medium or format for noncommercial purposes only, and only so long as attribution is given to the creator.", short: "CC-BY-NC" },
    { label: "Creative Commons Attribution-NoDerivs 4.0 (CC-BY-ND 4.0)", value: "Creative Commons Attribution-NoDerivs 4.0 International (CC-BY-ND 4.0)\n\nThis license allows reusers to copy and distribute the material in any medium or format in unadapted form only, and only so long as attribution is given to the creator. The license allows for commercial use.", short: "CC-BY-ND" },
    { label: "Public Domain Dedication (CC0 1.0)", value: "CC0 1.0 Universal (CC0 1.0) Public Domain Dedication\n\nThe person who associated a work with this deed has dedicated the work to the public domain by waiving all of his or her rights to the work worldwide under copyright law, including all related and neighboring rights, to the extent allowed by law. You can copy, modify, distribute and perform the work, even for commercial purposes, all without asking permission.", short: "CC0" },
    { label: "MIT License", value: "MIT License\n\nCopyright (c) [year] [fullname]\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the \"Software\"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.", short: "MIT" },
    { label: "DO WHAT THE FUCK YOU WANT TO PUBLIC LICENSE", value: "DO WHAT THE FUCK YOU WANT TO PUBLIC LICENSE\nVersion 2, December 2004\n\nEveryone is permitted to copy and distribute verbatim or modified copies of this license document, and changing it is allowed as long as the name is changed.", short: "WTFPL" },
];

interface LibraryManagerProps {
    isOpen: boolean;
    onClose: () => void;
    userLibrary: UserLibrary;
    setUserLibrary: (lib: UserLibrary | ((prev: UserLibrary) => UserLibrary)) => void;
    projectFiles: Record<string, FileRecord>;
    projectName?: string;
    workHandle: FileSystemDirectoryHandle | null;
    missingLibraryFiles: string[];
    onSmartScan: () => void;
    onRefreshLibrary: () => Promise<void>;
    onDeleteLibraryFile?: (id: string) => Promise<void>;
    initialTab?: 'upload' | 'project' | 'manage' | 'settings';
    initialHighlightFileId?: string | null;
    onResetBrowserPreference?: () => void;
    onOpenLibrarySync?: () => void;
    onDownloadZip?: () => void;
}

interface UploadDraft {
    id: string;
    file: File;
    displayName: string;
    willConvert: boolean;
    tags: string[];
    tagInput: string;
}

const ProjectFileRow = ({ file, isExpanded, onToggle, onCopy, status }: {
    file: FileRecord;
    isExpanded: boolean;
    onToggle: () => void;
    onCopy: (file: FileRecord, name?: string) => void;
    status: 'missing' | 'synced' | 'changed';
}) => {
    const [editName, setEditName] = useState(false);
    const [newName, setNewName] = useState(file.name);

    return (
        <div className="bg-black/20 border border-gray-800 rounded-lg overflow-hidden transition-all hover:border-gray-700">
            <div className="flex items-center justify-between p-3">
                <div className="flex items-center gap-3">
                    <button onClick={onToggle} className="text-gray-500 hover:text-white transition-colors">
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    <div className="p-1.5 bg-gray-800 rounded text-synthux-green">
                        <FileAudio size={14} />
                    </div>
                    <div>
                        {editName ? (
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={newName}
                                    onChange={e => setNewName(e.target.value)}
                                    autoFocus
                                    className="bg-black/50 border border-synthux-orange/50 rounded px-2 py-0.5 text-xs text-white outline-none font-mono"
                                />
                                <button onClick={() => setEditName(false)} className="text-synthux-green hover:brightness-125">
                                    <Check size={14} />
                                </button>
                            </div>
                        ) : (
                            <div className="text-sm font-medium text-white flex items-center gap-2">
                                {file.name}
                                <button onClick={() => { setEditName(true); setNewName(file.name); }} className="text-gray-600 hover:text-gray-400">
                                    <Edit2 size={10} />
                                </button>
                            </div>
                        )}
                        <div className="text-[10px] text-gray-500 font-mono">
                            {file.versions.length} versions • {file.license || 'No License'}
                        </div>
                    </div>
                </div>

                <button
                    onClick={() => status !== 'synced' && onCopy(file, newName)}
                    disabled={status === 'synced'}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold transition-all ${status === 'synced'
                        ? 'bg-synthux-green/20 text-synthux-green/60 cursor-default cursor-not-allowed'
                        : status === 'changed'
                            ? 'bg-synthux-orange hover:bg-synthux-orange/80 text-white'
                            : 'bg-gray-800 hover:bg-synthux-orange text-gray-300 hover:text-white'
                        }`}
                >
                    {status === 'synced' ? (
                        <>
                            <Check size={14} /> In Library
                        </>
                    ) : status === 'changed' ? (
                        <>
                            <RefreshCw size={14} className="animate-pulse" /> Update Library
                        </>
                    ) : (
                        <>
                            <Plus size={14} /> Copy to Library
                        </>
                    )}
                </button>
            </div>

            {isExpanded && (
                <div className="bg-black/40 border-t border-gray-800 p-3 space-y-2">
                    <div className="text-[10px] font-bold text-gray-600 uppercase tracking-widest pl-10 mb-2">History & Versions</div>
                    {file.versions.map(v => (
                        <div key={v.id} className="flex items-center justify-between pl-10 pr-4 py-1.5 hover:bg-white/5 rounded transition-colors group">
                            <div className="flex items-center gap-3">
                                <div className={`w-1.5 h-1.5 rounded-full ${v.id === file.currentVersionId ? 'bg-synthux-orange shadow-[0_0_5px_rgba(255,107,0,0.5)]' : 'bg-gray-700'}`} />
                                <div className="text-xs text-gray-400 group-hover:text-gray-200 transition-colors">{v.description}</div>
                                <div className="text-[10px] text-gray-600 font-mono">{new Date(v.timestamp).toLocaleString()}</div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export const LibraryManager = ({ 
    isOpen, onClose, userLibrary, setUserLibrary, projectFiles, 
    projectName, workHandle, missingLibraryFiles, onSmartScan, 
    onRefreshLibrary, onDeleteLibraryFile, initialTab = 'upload', 
    initialHighlightFileId, onResetBrowserPreference,
    onOpenLibrarySync, onDownloadZip
}: LibraryManagerProps) => {
    const [activeTab, setActiveTab] = useState<'upload' | 'project' | 'manage' | 'settings'>(initialTab);
    const [isConvertingBatch, setIsConvertingBatch] = useState(false);
    const [batchProgress, setBatchProgress] = useState(0);
    const [batchLog, setBatchLog] = useState<string[]>([]);
    const [shouldConvert, setShouldConvert] = useState(true);
    const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
    const [pendingUploadDrafts, setPendingUploadDrafts] = useState<UploadDraft[] | null>(null);
    const [globalTags, setGlobalTags] = useState<string[]>([]);
    const [globalTagInput, setGlobalTagInput] = useState('');
    const [playingPreviewKey, setPlayingPreviewKey] = useState<string | null>(null);
    const [playingPreviewLabel, setPlayingPreviewLabel] = useState<string>('');
    const [playbackTime, setPlaybackTime] = useState(0);
    const [playbackDuration, setPlaybackDuration] = useState(0);
    const [libraryTagFilter, setLibraryTagFilter] = useState('');
    const [selectedLibraryFilterTags, setSelectedLibraryFilterTags] = useState<string[]>([]);
    const [selectedLibraryIds, setSelectedLibraryIds] = useState<Set<string>>(new Set());
    const [libraryBulkName, setLibraryBulkName] = useState('');
    const [libraryBulkTagInput, setLibraryBulkTagInput] = useState('');
    const [libraryBulkLicense, setLibraryBulkLicense] = useState('');

    const [customFolders, setCustomFolders] = useState<CustomFolderRecord[]>([]);
    const [activeCustomFolder, setActiveCustomFolder] = useState<string | null>(null);
    const [showSavedCheck, setShowSavedCheck] = useState(false);
    const [isPlaybackActive, setIsPlaybackActive] = useState(false);

    const { convertWavToFlac, isLoaded, load } = useAudioConverter();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const previewAudioRef = useRef<HTMLAudioElement | null>(null);
    const previewUrlRef = useRef<string | null>(null);
    const manageListRef = useRef<HTMLDivElement>(null);
    const [highlightedFileId, setHighlightedFileId] = useState<string | null>(null);
    const hasAutoRefreshed = useRef(false);

    // --- Computed Project Library Status ---
    const projectLibraryStatus = useMemo(() => {
        const statusMap: Record<string, 'missing' | 'synced' | 'changed'> = {};
        const libraryFiles = Object.values(userLibrary.files);

        Object.values(projectFiles).forEach(file => {
            const existingInLibrary = libraryFiles.find(libFile => libFile.sourceFileId === file.id);

            if (!existingInLibrary) {
                statusMap[file.id] = 'missing';
            } else if (existingInLibrary.sourceVersionId === file.currentVersionId) {
                statusMap[file.id] = 'synced';
            } else {
                statusMap[file.id] = 'changed';
            }
        });

        return statusMap;
    }, [userLibrary.files, projectFiles]);

    // --- Custom Folder Logic ---
    useEffect(() => {
        if (isOpen) {
            loadCustomFoldersFromDB().then(setCustomFolders);
            if (initialTab) setActiveTab(initialTab);

            if (!hasAutoRefreshed.current) {
                onRefreshLibrary?.(); // Auto-sync with disk on open
                hasAutoRefreshed.current = true;
            }
        } else {
            hasAutoRefreshed.current = false;
        }
    }, [isOpen, initialTab, onRefreshLibrary]);

    const getLicenseAbbr = (licenseText?: string) => {
        if (!licenseText) return '';
        const found = COMMON_LICENSES.find(l => l.value === licenseText);
        if (found) return found.short;
        // Basic heuristic for abbreviations if it's a custom string
        const match = licenseText.match(/\(([^)]+)\)/);
        if (match) return match[1];
        return 'Custom';
    };

    const allLibraryTags = Array.from(
        new Set(Object.values(userLibrary.files).flatMap(file => file.tags || []))
    ).sort((a, b) => a.localeCompare(b));

    // Sync known tags to global store for autocomplete
    useEffect(() => {
        if (allLibraryTags.length > 0) {
            saveKnownTags(allLibraryTags);
        }
    }, [allLibraryTags]);

    // --- Highlight file from external navigation (e.g. pencil icon in Sample Browser) ---
    useEffect(() => {
        if (!isOpen || !initialHighlightFileId) return;

        // Switch to manage tab and pre-select the file
        setActiveTab('manage');
        setSelectedLibraryIds(new Set([initialHighlightFileId]));
        setHighlightedFileId(initialHighlightFileId);

        // Populate the edit panel
        const file = userLibrary.files[initialHighlightFileId];
        if (file) {
            setLibraryBulkName(file.name);
            setLibraryBulkLicense(file.license || '');
        }

        // Scroll to the highlighted file after a short delay (DOM needs to render)
        const timer = setTimeout(() => {
            if (!manageListRef.current) return;
            const fileEl = manageListRef.current.querySelector(`[data-library-file-id="${CSS.escape(initialHighlightFileId)}"]`);
            if (fileEl) {
                fileEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [isOpen, initialHighlightFileId]);

    if (!isOpen) return null;

    const detectUncompressedWav = async (file: File): Promise<boolean> => {
        const extension = file.name.split('.').pop()?.toLowerCase();
        const wavLikeMime = file.type.includes('wav') || file.type.includes('wave');
        const wavLikeName = extension === 'wav' || extension === 'wave';
        if (!wavLikeMime && !wavLikeName) return false;

        try {
            const header = await file.slice(0, 4096).arrayBuffer();
            if (header.byteLength < 44) return false;

            const view = new DataView(header);
            const tagAt = (offset: number) => String.fromCharCode(
                view.getUint8(offset),
                view.getUint8(offset + 1),
                view.getUint8(offset + 2),
                view.getUint8(offset + 3)
            );

            if (tagAt(0) !== 'RIFF' || tagAt(8) !== 'WAVE') return false;

            let offset = 12;
            while (offset + 8 <= view.byteLength) {
                const chunkId = tagAt(offset);
                const chunkSize = view.getUint32(offset + 4, true);
                const chunkDataStart = offset + 8;
                const chunkDataEnd = chunkDataStart + chunkSize;

                if (chunkId === 'fmt ' && chunkDataStart + 2 <= view.byteLength) {
                    const audioFormat = view.getUint16(chunkDataStart, true);
                    // 1 = PCM, 3 = IEEE float, 65534 = WAVE_FORMAT_EXTENSIBLE.
                    return audioFormat === 1 || audioFormat === 3 || audioFormat === 65534;
                }

                // Chunks are word-aligned.
                offset = chunkDataEnd + (chunkSize % 2);
            }
        } catch (err) {
            console.warn("Failed to inspect WAV header", err);
        }

        return false;
    };

    const parseTags = (raw: string) => {
        return Array.from(new Set(
            raw
                .split(',')
                .map(t => t.trim())
                .filter(Boolean)
        ));
    };

    const appendTags = (existing: string[], input: string) => {
        return Array.from(new Set([...existing, ...parseTags(input)]));
    };

    const buildDraftName = (file: File, willConvert: boolean) => {
        if (willConvert) {
            const renamed = file.name.replace(/\.(wav|wave)$/i, '.flac');
            return renamed.toLowerCase().endsWith('.flac') ? renamed : `${renamed}.flac`;
        }
        return file.name;
    };

    const sanitizeFileName = (name: string) => {
        return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
    };

    const renameWithExistingExtension = (baseName: string, currentName: string) => {
        const cleanedBase = sanitizeFileName(baseName);
        if (!cleanedBase) return currentName;

        // Keep explicit extension if user typed one; otherwise preserve current extension.
        const hasTypedExtension = /\.[a-z0-9]{2,8}$/i.test(cleanedBase);
        if (hasTypedExtension) return cleanedBase;

        const extMatch = currentName.match(/(\.[a-z0-9]{2,8})$/i);
        return `${cleanedBase}${extMatch ? extMatch[1] : ''}`;
    };

    const stopPreview = () => {
        previewAudioRef.current?.pause();
        if (previewUrlRef.current) {
            URL.revokeObjectURL(previewUrlRef.current);
            previewUrlRef.current = null;
        }
        setPlayingPreviewKey(null);
        setPlayingPreviewLabel('');
        setPlaybackTime(0);
        setPlaybackDuration(0);
    };

    const playBlobPreview = (blob: Blob, previewKey: string, label: string) => {
        const audio = previewAudioRef.current;
        if (!audio) return;

        if (playingPreviewKey === previewKey && !audio.paused) {
            stopPreview();
            return;
        }

        stopPreview();
        const url = URL.createObjectURL(blob);
        previewUrlRef.current = url;
        audio.src = url;
        audio.play().then(() => {
            setPlayingPreviewKey(previewKey);
            setPlayingPreviewLabel(label);
        }).catch((err) => {
            console.error("Preview failed", err);
            stopPreview();
        });
    };

    // --- Custom Folder Handlers ---
    const handleAddCustomFolder = async () => {
        if (!('showDirectoryPicker' in window)) {
            alert('Your browser does not support picking local folders.');
            return;
        }
        try {
            // @ts-ignore
            const dirHandle = await window.showDirectoryPicker({ mode: 'read' });

            // Avoid duplicates
            if (customFolders.some(f => f.name === dirHandle.name)) {
                alert('Folder already added.');
                return;
            }

            const newFolder: CustomFolderRecord = {
                id: crypto.randomUUID(),
                name: dirHandle.name,
                handle: dirHandle
            };

            const updated = [...customFolders, newFolder];
            setCustomFolders(updated);
            await saveCustomFoldersToDB(updated);

        } catch (e: any) {
            if (e.name !== 'AbortError') {
                console.error('Add custom folder failed', e);
                alert('Could not add folder: ' + e.message);
            }
        }
    };

    const handleRemoveCustomFolder = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const updated = customFolders.filter(f => f.id !== id);
        setCustomFolders(updated);
        await saveCustomFoldersToDB(updated);
        if (activeCustomFolder === id) {
            setActiveCustomFolder(null);
        }
    };

    const handleOpenCustomFolder = async (folder: CustomFolderRecord) => {
        setActiveCustomFolder(folder.id);

        try {
            // Re-verify permission
            // @ts-ignore
            if (await folder.handle.queryPermission({ mode: 'read' }) !== 'granted') {
                // @ts-ignore
                if (await folder.handle.requestPermission({ mode: 'read' }) !== 'granted') {
                    throw new Error('Permission denied to read folder.');
                }
            }
        } catch (e: any) {
            console.error('Failed to read custom folder', e);
            alert('Could not read folder. Please re-add it if permission was lost.');
            setActiveCustomFolder(null);
        }
    };

    const toggleCustomFilePreview = (file: File) => {
        playBlobPreview(file, `custom:${file.name}`, file.name);
    };

    const importCustomFile = async (file: File) => {
        // Send directly to the draft upload queue so text inputs and FFmpeg conversion can follow normal flow
        let willConvert = shouldConvert ? await detectUncompressedWav(file) : false;

        // Exception: If file HAS slices, we MUST NOT convert to FLAC or we lose them
        const hasSlices = await detectCueChunk(file);
        if (hasSlices) willConvert = false;

        const newDraft: UploadDraft = {
            id: crypto.randomUUID(),
            file,
            willConvert,
            displayName: buildDraftName(file, willConvert),
            tags: [],
            tagInput: '',
        };

        // Append to current drafts or start a new draft list
        setPendingUploadDrafts(prev => prev ? [...prev, newDraft] : [newDraft]);
    };

    const handleBulkImport = async (files: { file: File, path: string }[]) => {
        const drafts: UploadDraft[] = [];
        for (const { file } of files) {
            let willConvert = shouldConvert ? await detectUncompressedWav(file) : false;

            // Exception: Skip conversion for files with slices
            const hasSlices = await detectCueChunk(file);
            if (hasSlices) willConvert = false;

            drafts.push({
                id: crypto.randomUUID(),
                file,
                willConvert,
                displayName: buildDraftName(file, willConvert),
                tags: [],
                tagInput: '',
            });
        }
        setPendingUploadDrafts(prev => prev ? [...prev, ...drafts] : drafts);
    };

    // --- End Custom Folder Logic ---

    const toggleDraftPreview = (draft: UploadDraft) => {
        playBlobPreview(draft.file, `draft:${draft.id}`, draft.displayName || draft.file.name);
    };

    const toggleLibraryPreview = (file: FileRecord) => {
        const currentVersion = file.versions.find(v => v.id === file.currentVersionId) || file.versions[0];
        if (!currentVersion?.blob) return;
        playBlobPreview(currentVersion.blob, `library:${file.id}`, file.name);
    };

    const typedLibraryTagTerms = libraryTagFilter
        .split(/[,\s]+/)
        .map(t => t.trim().toLowerCase())
        .filter(Boolean);

    const filteredLibraryFiles = Object.values(userLibrary.files).filter(file => {
        const tags = (file.tags || []).map(t => t.toLowerCase());
        const name = (file.name || '').toLowerCase();

        const typedMatches = typedLibraryTagTerms.every(term =>
            tags.some(tag => tag.includes(term)) || name.includes(term)
        );
        const pillMatches = selectedLibraryFilterTags.every(tag =>
            tags.includes(tag.toLowerCase())
        );
        return typedMatches && pillMatches;
    });

    const selectedLibraryFiles = filteredLibraryFiles.filter(file => selectedLibraryIds.has(file.id));

    const toggleLibrarySelection = (id: string) => {
        setHighlightedFileId(null);
        setSelectedLibraryIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleSelectAllFiltered = () => {
        const filteredIds = filteredLibraryFiles.map(file => file.id);
        const allSelected = filteredIds.length > 0 && filteredIds.every(id => selectedLibraryIds.has(id));
        setSelectedLibraryIds(prev => {
            const next = new Set(prev);
            if (allSelected) {
                filteredIds.forEach(id => next.delete(id));
            } else {
                filteredIds.forEach(id => next.add(id));
            }
            return next;
        });
    };

    const selectSingleLibraryFile = (id: string) => {
        setHighlightedFileId(null);
        setSelectedLibraryIds(new Set([id]));
        const file = userLibrary.files[id];
        if (file) {
            setLibraryBulkName(file.name);
            setLibraryBulkLicense(file.license || '');
        }
    };

    const applyBulkRename = async () => {
        const base = libraryBulkName.trim();
        if (!base || selectedLibraryFiles.length === 0) return;

        const renamePlan = selectedLibraryFiles.map((file, index) => {
            const raw = selectedLibraryFiles.length === 1 ? base : `${base} ${index + 1}`;
            const newName = renameWithExistingExtension(raw, file.name);
            const currentVersion = file.versions.find(v => v.id === file.currentVersionId) || file.versions[0];
            return {
                id: file.id,
                oldName: file.name,
                newName,
                blob: currentVersion?.blob || null,
            };
        });

        setUserLibrary(prev => {
            const next = { ...prev.files };
            renamePlan.forEach(plan => {
                if (!next[plan.id]) return;
                next[plan.id] = { ...next[plan.id], name: plan.newName };
            });
            return { ...prev, files: next };
        });

        if (workHandle) {
            try {
                const userLibraryDir = await workHandle.getDirectoryHandle('User_Library', { create: true });
                for (const plan of renamePlan) {
                    if (plan.oldName === plan.newName || !plan.blob) continue;
                    try {
                        const newFileHandle = await userLibraryDir.getFileHandle(plan.newName, { create: true });
                        // @ts-ignore
                        const writable = await newFileHandle.createWritable();
                        await writable.write(plan.blob);
                        await writable.close();

                        try {
                            await userLibraryDir.removeEntry(plan.oldName);
                        } catch {
                            // Old file may not exist; ignore.
                        }
                    } catch (err) {
                        console.warn(`Failed to rename library file ${plan.oldName} -> ${plan.newName}`, err);
                    }
                }
            } catch (err) {
                console.warn("Failed to access User_Library for rename sync", err);
            }
        }
    };

    const applyBulkTags = () => {
        const parsed = parseTags(libraryBulkTagInput);
        if (parsed.length === 0 || selectedLibraryFiles.length === 0) return;
        const selectedIds = selectedLibraryFiles.map(f => f.id);
        setUserLibrary(prev => {
            const next = { ...prev.files };
            selectedIds.forEach(id => {
                const file = next[id];
                if (!file) return;
                next[id] = { ...file, tags: Array.from(new Set([...(file.tags || []), ...parsed])) };
            });
            return { ...prev, files: next };
        });
        setLibraryBulkTagInput('');
    };

    const applyBulkLicense = () => {
        if (selectedLibraryFiles.length === 0) return;
        const selectedIds = selectedLibraryFiles.map(f => f.id);
        setUserLibrary(prev => {
            const next = { ...prev.files };
            selectedIds.forEach(id => {
                const file = next[id];
                if (!file) return;
                next[id] = { ...file, license: libraryBulkLicense };
            });
            return { ...prev, files: next };
        });
    };



    const selectedTagCounts = selectedLibraryFiles.reduce<Record<string, number>>((acc, file) => {
        (file.tags || []).forEach(tag => {
            acc[tag] = (acc[tag] || 0) + 1;
        });
        return acc;
    }, {});

    const selectedTagEntries = Object.entries(selectedTagCounts).sort((a, b) => a[0].localeCompare(b[0]));

    const removeTagFromSelected = (tag: string) => {
        const selectedIds = selectedLibraryFiles.map(f => f.id);
        setUserLibrary(prev => {
            const next = { ...prev.files };
            selectedIds.forEach(id => {
                const file = next[id];
                if (!file) return;
                next[id] = { ...file, tags: (file.tags || []).filter(t => t !== tag) };
            });
            return { ...prev, files: next };
        });
    };

    const toggleExpand = (id: string) => {
        setExpandedFiles(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        const drafts: UploadDraft[] = [];
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            let willConvert = shouldConvert ? await detectUncompressedWav(file) : false;

            // Exception: Skip conversion for files with slices
            const hasSlices = await detectCueChunk(file);
            if (hasSlices) willConvert = false;

            drafts.push({
                id: crypto.randomUUID(),
                file,
                willConvert,
                displayName: buildDraftName(file, willConvert),
                tags: [],
                tagInput: '',
            });
        }

        setPendingUploadDrafts(drafts);
        setGlobalTags([]);
        setGlobalTagInput('');
        stopPreview();
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const processDraftBatch = async (draftsToImport: UploadDraft[], tagsForAll: string[]) => {
        setIsConvertingBatch(true);
        setBatchProgress(0);
        setBatchLog([`Starting batch upload of ${draftsToImport.length} files...`]);

        let userLibraryDir: FileSystemDirectoryHandle | null = null;

        // 1. Verifying Local Folder (if connected)
        if (workHandle) {
            setBatchLog(prev => [...prev, "Checking Local Library Folder (User_Library)..."]);
            try {
                userLibraryDir = await workHandle.getDirectoryHandle('User_Library', { create: true });
                setBatchLog(prev => [...prev, "-> Local folder is ready."]);
            } catch (err) {
                setBatchLog(prev => [...prev, "!! Warning: Cannot access local folder. Files will ONLY be in browser memory."]);
                console.error("Folder Check Failed", err);
            }
        } else {
            setBatchLog(prev => [...prev, "No local folder connected. Files will ONLY be in browser memory."]);
        }

        let conversionReady = isLoaded;

        for (let i = 0; i < draftsToImport.length; i++) {
            const draft = draftsToImport[i];
            const file = draft.file;
            const displayIndex = i + 1;
            setBatchLog(prev => [...prev, `[${displayIndex}/${draftsToImport.length}] Processing: ${file.name}`]);

            try {
                let finalBlob = file as Blob;
                const isUncompressedWav = draft.willConvert;
                let finalName = draft.displayName.trim() || buildDraftName(file, isUncompressedWav);

                if (shouldConvert && isUncompressedWav) {
                    if (!conversionReady) {
                        setBatchLog(prev => [...prev, "Initializing Audio Engine (FFmpeg)..."]);
                        try {
                            await load();
                            conversionReady = true;
                            setBatchLog(prev => [...prev, "-> Audio Engine Ready."]);
                        } catch (err: any) {
                            conversionReady = false;
                            setBatchLog(prev => [...prev, `!! FFmpeg initialization failed: ${err?.message || 'Unknown error'}`]);
                            setBatchLog(prev => [...prev, "!! Keeping original file format for this upload."]);
                            console.error("FFmpeg load failed", err);
                        }
                    }
                }

                if (shouldConvert && isUncompressedWav && conversionReady) {
                    setBatchLog(prev => [...prev, `   -> Converting uncompressed WAV: ${file.name} -> FLAC...`]);
                    finalBlob = await convertWavToFlac(file, file.name);
                    finalName = finalName.replace(/\.(wav|wave)$/i, '.flac');
                    if (!finalName.toLowerCase().endsWith('.flac')) finalName += '.flac';
                    setBatchLog(prev => [...prev, `   -> Done: ${finalName}`]);
                } else if (shouldConvert && !isUncompressedWav) {
                    setBatchLog(prev => [...prev, "   -> Not an uncompressed WAV. Keeping original format."]);
                }

                // Check for existing record with the same name (robust de-duplication)
                const existingId = Object.keys(userLibrary.files).find(id =>
                    userLibrary.files[id].name.toLowerCase() === finalName.toLowerCase()
                );

                const versionId = crypto.randomUUID();
                const newVersion: AudioVersion = {
                    id: versionId,
                    timestamp: Date.now(),
                    description: 'Original Upload',
                    blob: finalBlob,
                    duration: 0
                };

                if (existingId) {
                    setBatchLog(prev => [...prev, `   -> Existing entry found: "${finalName}". Adding as new version.`]);
                    const existingRecord = userLibrary.files[existingId];
                    const updatedRecord: FileRecord = {
                        ...existingRecord,
                        currentVersionId: versionId,
                        versions: [newVersion, ...existingRecord.versions],
                        // Merge tags
                        tags: Array.from(new Set([...(existingRecord.tags || []), ...tagsForAll, ...draft.tags]))
                    };
                    setUserLibrary(prev => ({
                        ...prev,
                        files: { ...prev.files, [existingId]: updatedRecord }
                    }));
                } else {
                    const fileId = crypto.randomUUID();
                    const newRecord: FileRecord = {
                        id: fileId,
                        name: finalName,
                        originalName: file.name,
                        isParked: true,
                        origin: 'User Upload',
                        license: userLibrary.metadata.license,
                        tags: Array.from(new Set([...tagsForAll, ...draft.tags])),
                        currentVersionId: versionId,
                        versions: [newVersion]
                    };

                    // Update state incrementally so user sees files appearing
                    setUserLibrary(prev => ({
                        ...prev,
                        files: { ...prev.files, [fileId]: newRecord }
                    }));
                }

                if (userLibraryDir) {
                    try {
                        const outputHandle = await userLibraryDir.getFileHandle(finalName, { create: true });
                        // @ts-ignore
                        const writable = await outputHandle.createWritable();
                        await writable.write(finalBlob);
                        await writable.close();
                    } catch (writeErr) {
                        setBatchLog(prev => [...prev, `   !! Failed local save: ${finalName}`]);
                        console.error("User_Library write failed", writeErr);
                    }
                }

                setBatchProgress(Math.round((displayIndex / draftsToImport.length) * 100));
            } catch (err) {
                console.error("Upload Error", err);
                setBatchLog(prev => [...prev, `!! Failed to process ${file.name}`]);
            }
        }

        setBatchLog(prev => [...prev, '--- Batch upload complete ---']);
        setIsConvertingBatch(false);
    };

    const handleConfirmDraftImport = async () => {
        const draftsToImport = (pendingUploadDrafts || []).filter(d => !!d.file);
        if (draftsToImport.length === 0) {
            setPendingUploadDrafts(null);
            return;
        }

        stopPreview();
        setPendingUploadDrafts(null);
        await processDraftBatch(draftsToImport, globalTags);
    };

    const handleCloseReview = () => {
        stopPreview();
        setPendingUploadDrafts(null);
    };

    const handleCloseManager = () => {
        stopPreview();
        setPendingUploadDrafts(null);
        onClose();
    };

    const handleCopyToLibrary = (file: FileRecord, customName?: string) => {
        const mainVersion = file.versions.find(v => v.id === file.currentVersionId) || file.versions[0];

        setUserLibrary(prev => {
            const existingId = Object.keys(prev.files).find(id => prev.files[id].sourceFileId === file.id);

            if (existingId) {
                // Update existing record
                const existingRecord = prev.files[existingId];
                // Check if this version already exists in the library record
                const alreadyHasVersion = existingRecord.versions.some(v => v.id === mainVersion.id);

                const updatedRecord: FileRecord = {
                    ...existingRecord,
                    name: customName || existingRecord.name,
                    sourceVersionId: file.currentVersionId || mainVersion.id,
                };

                if (!alreadyHasVersion) {
                    updatedRecord.versions = [
                        ...existingRecord.versions,
                        {
                            ...mainVersion,
                            timestamp: Date.now(),
                            description: `Updated from ${projectName || 'Project'}`
                        }
                    ];
                    updatedRecord.currentVersionId = mainVersion.id;
                }

                return {
                    ...prev,
                    files: { ...prev.files, [existingId]: updatedRecord }
                };
            }

            // Create new record
            const fileId = crypto.randomUUID();
            const newRecord: FileRecord = {
                ...file,
                id: fileId,
                name: customName || file.name,
                isParked: true,
                origin: `Project: ${projectName || 'Unknown'}`,
                license: userLibrary.metadata.license || file.license,
                sourceFileId: file.id,
                sourceVersionId: file.currentVersionId || mainVersion.id,
                versions: [{
                    ...mainVersion,
                    id: mainVersion.id, // Keep source version ID
                    timestamp: Date.now(),
                    description: `Copied from ${projectName || 'Project'}`
                }],
                currentVersionId: mainVersion.id
            };

            return {
                ...prev,
                files: { ...prev.files, [fileId]: newRecord }
            };
        });
    };

    const handleRemoveFromLibrary = (id: string) => {
        if (onDeleteLibraryFile) {
            onDeleteLibraryFile(id);
        } else {
            setUserLibrary(prev => {
                const nextFiles = { ...prev.files };
                delete nextFiles[id];
                return { ...prev, files: nextFiles };
            });
        }
    };

    const handleDeleteAllMissing = () => {
        const count = missingLibraryFiles.length;
        if (!confirm(`Are you sure you want to remove all ${count} missing files from your library index? This cannot be undone.`)) return;

        setUserLibrary(prev => {
            const nextFiles = { ...prev.files };
            missingLibraryFiles.forEach(id => {
                delete nextFiles[id];
            });
            return { ...prev, files: nextFiles };
        });
    };

    const handleRecoverFromCache = async () => {
        if (!workHandle) {
            alert("No work folder connected. Please set a work folder first.");
            return;
        }

        const count = missingLibraryFiles.length;
        if (!confirm(`This will attempt to recreate ${count} missing files in your User_Library folder using audio data stored in your browser's cache.\n\nWarning: This only works if you haven't cleared your browser data since the files went missing.`)) return;

        setIsConvertingBatch(true);
        setBatchProgress(0);
        setBatchLog(["Starting recovery from browser cache..."]);

        try {
            const libDir = await workHandle.getDirectoryHandle('User_Library', { create: true });
            let recovered = 0;
            let failed = 0;

            for (let i = 0; i < missingLibraryFiles.length; i++) {
                const id = missingLibraryFiles[i];
                const fileRec = userLibrary.files[id];
                if (!fileRec) continue;

                const latestVersion = fileRec.versions[fileRec.versions.length - 1];
                if (latestVersion?.blob) {
                    try {
                        const fileHandle = await libDir.getFileHandle(fileRec.name, { create: true });
                        // @ts-ignore
                        const writable = await fileHandle.createWritable();
                        await writable.write(latestVersion.blob);
                        await writable.close();
                        recovered++;
                        setBatchLog(prev => [...prev.slice(-4), `Recovered: ${fileRec.name}`]);
                    } catch (err) {
                        console.error(`Failed to write ${fileRec.name}`, err);
                        failed++;
                        setBatchLog(prev => [...prev.slice(-4), `Error: ${fileRec.name}`]);
                    }
                } else {
                    failed++;
                    setBatchLog(prev => [...prev.slice(-4), `No data for: ${fileRec.name}`]);
                }
                setBatchProgress(Math.round(((i + 1) / count) * 100));
            }

            setBatchLog(prev => [...prev, `DONE: ${recovered} recovered, ${failed} failed.`]);

            await onRefreshLibrary();

            setTimeout(() => {
                setIsConvertingBatch(false);
                if (recovered > 0) {
                    alert(`Successfully restored ${recovered} files to User_Library.`);
                }
            }, 500);

        } catch (e: any) {
            console.error("Recovery failed", e);
            setBatchLog(prev => [...prev, `FATAL ERROR: ${e.message}`]);
            setIsConvertingBatch(false);
        }
    };

    const handleRecoverSingleFile = async (id: string) => {
        if (!workHandle) return;
        const fileRec = userLibrary.files[id];
        if (!fileRec) return;

        const latestVersion = fileRec.versions[fileRec.versions.length - 1];
        if (!latestVersion?.blob) {
            alert("No audio data found in cache for this file.");
            return;
        }

        try {
            const libDir = await workHandle.getDirectoryHandle('User_Library', { create: true });
            const fileHandle = await libDir.getFileHandle(fileRec.name, { create: true });
            // @ts-ignore
            const writable = await fileHandle.createWritable();
            await writable.write(latestVersion.blob);
            await writable.close();

            await onRefreshLibrary();
        } catch (err: any) {
            console.error("Single recovery failed", err);
            alert(`Failed to restore ${fileRec.name}: ${err.message}`);
        }
    };

    const handleDeleteSingleMissing = (id: string) => {
        const fileRec = userLibrary.files[id];
        if (!fileRec) return;

        if (!confirm(`Remove ${fileRec.name} from your library index?`)) return;

        handleRemoveFromLibrary(id);
        // Sync should follow in App via useEffect, but let's be explicit
        setTimeout(() => onRefreshLibrary(), 0);
    };

    const updateMetadata = (key: keyof UserLibraryMetadata, value: string) => {
        setUserLibrary(prev => ({
            ...prev,
            metadata: { ...prev.metadata, [key]: value }
        }));

        // Show saved indicator
        setShowSavedCheck(true);
        const timer = setTimeout(() => setShowSavedCheck(false), 2000);
        return () => clearTimeout(timer);
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-md p-6">
            <div className="bg-synthux-panel border border-gray-700 rounded-lg shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-synthux-panel">
                    <div className="flex items-center gap-4">
                        <h2 className="text-xl font-bold flex items-center gap-2 text-white">
                            <FolderOpen className="text-synthux-orange" /> My Library Manager
                        </h2>
                        <button
                            onClick={() => onRefreshLibrary()}
                            className="p-2 text-gray-500 hover:text-white transition-colors flex items-center gap-2 group"
                            title="Force Rescan Library Folder"
                        >
                            <RefreshCw size={16} className="group-hover:rotate-180 transition-transform duration-500" />
                            <span className="text-[10px] font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">Rescan Folder</span>
                        </button>

                        <div className="flex bg-black/40 p-1 rounded-lg border border-gray-800">
                            <button
                                onClick={() => setActiveTab('upload')}
                                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'upload' ? 'bg-synthux-orange text-white' : 'text-gray-400 hover:text-white'}`}
                            >
                                <Upload size={14} className="inline mr-2" /> Upload
                            </button>
                            <button
                                onClick={() => setActiveTab('project')}
                                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'project' ? 'bg-synthux-orange text-white' : 'text-gray-400 hover:text-white'}`}
                            >
                                <FileAudio size={14} className="inline mr-2" /> Project
                            </button>
                            <button
                                onClick={() => setActiveTab('manage')}
                                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'manage' ? 'bg-synthux-orange text-white' : 'text-gray-400 hover:text-white'}`}
                            >
                                <Settings size={14} className="inline mr-2" /> Manage
                            </button>
                            <button
                                onClick={() => setActiveTab('settings')}
                                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'settings' ? 'bg-synthux-orange text-white' : 'text-gray-400 hover:text-white'}`}
                            >
                                <Settings size={14} className="inline mr-2" /> Settings
                            </button>
                        </div>
                    </div>

                    <button onClick={handleCloseManager} className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-hidden flex bg-synthux-main">

                    {/* Main Content Area */}
                    <div className="flex-1 p-6 overflow-y-auto">

                        {activeTab === 'upload' && (
                            <div className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {/* Traditional Upload Box */}
                                    <div className="md:col-span-1 bg-black/20 border-2 border-dashed border-gray-700 rounded-xl p-6 text-center hover:border-synthux-orange/50 transition-colors flex flex-col justify-center">
                                        <input
                                            type="file"
                                            multiple
                                            accept="audio/*"
                                            className="hidden"
                                            ref={fileInputRef}
                                            onChange={handleUpload}
                                        />
                                        <Upload className="mx-auto text-gray-500 mb-2" size={32} />
                                        <h3 className="text-base font-bold text-white mb-1">Upload Audio Files</h3>
                                        <p className="text-gray-400 text-xs mb-4">Directly import files into your library</p>

                                        <div className="flex flex-col items-center gap-3">
                                            <button
                                                onClick={() => fileInputRef.current?.click()}
                                                disabled={isConvertingBatch}
                                                className="px-4 py-1.5 bg-synthux-orange hover:bg-orange-600 text-white rounded font-bold disabled:opacity-50 text-sm"
                                            >
                                                Browse Files
                                            </button>

                                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                                <div className={`w-8 h-4 rounded-full p-0.5 transition-colors ${shouldConvert ? 'bg-synthux-orange' : 'bg-gray-700'}`}>
                                                    <div className={`bg-white w-3 h-3 rounded-full transition-transform ${shouldConvert ? 'translate-x-4' : 'translate-x-0'}`} />
                                                </div>
                                                <input type="checkbox" checked={shouldConvert} onChange={e => setShouldConvert(e.target.checked)} className="hidden" />
                                                <span className="text-[10px] font-medium text-gray-300">Convert to Lossless FLAC</span>
                                            </label>
                                        </div>
                                    </div>

                                    {/* Custom Folders Browser */}
                                    <div className="md:col-span-2 bg-black/20 border-2 border-dashed border-gray-700 rounded-xl overflow-hidden hover:border-synthux-blue/50 transition-colors flex flex-col min-h-[400px]">
                                        {activeCustomFolder ? (
                                            <LocalFolderBrowser
                                                rootHandle={customFolders.find(f => f.id === activeCustomFolder)!.handle as FileSystemDirectoryHandle}
                                                rootName={customFolders.find(f => f.id === activeCustomFolder)!.name}
                                                mode="import"
                                                onPreview={(file) => toggleCustomFilePreview(file)}
                                                onImport={async (file) => importCustomFile(file)}
                                                onBulkImport={handleBulkImport}
                                                bulkActionLabel="Review"
                                                playingFileId={playingPreviewKey?.startsWith('custom:') ? playingPreviewKey.split('custom:')[1] : undefined}
                                                isPreviewPlaying={!!playingPreviewKey}
                                                onCloseFolder={() => setActiveCustomFolder(null)}
                                            />
                                        ) : (
                                            <div className="flex flex-col h-full justify-center text-center p-6">
                                                <FolderOpen className="mx-auto text-gray-500 mb-2" size={32} />
                                                <h3 className="text-base font-bold text-white mb-1">Custom Folders</h3>
                                                <p className="text-gray-400 text-[10px] mb-3">Browse local folders directly (read-only)</p>

                                                {customFolders.length > 0 && (
                                                    <div className="flex flex-wrap gap-2 justify-center mb-3">
                                                        {customFolders.map(folder => (
                                                            <div key={folder.id} className="flex items-center bg-black/40 border border-gray-700 rounded-lg overflow-hidden group">
                                                                <button onClick={() => handleOpenCustomFolder(folder)} className="px-2 py-1 text-xs text-gray-300 hover:text-white hover:bg-synthux-blue/20 transition-colors">
                                                                    {folder.name}
                                                                </button>
                                                                <button onClick={(e) => handleRemoveCustomFolder(folder.id, e)} className="px-1.5 py-1 text-gray-500 hover:text-red-400 hover:bg-red-400/20 transition-colors">
                                                                    <X size={12} />
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                <button
                                                    onClick={handleAddCustomFolder}
                                                    className="mx-auto px-4 py-1.5 bg-gray-800 hover:bg-gray-700 text-white rounded font-bold text-sm flex items-center gap-2 border border-gray-600 hover:border-synthux-blue/50 transition-colors"
                                                >
                                                    <Plus size={14} /> Add Local Folder
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'project' && (
                            <div className="space-y-8">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-white font-bold flex items-center gap-2">
                                        Active Project: <span className="text-synthux-orange">{projectName || 'Current Project'}</span>
                                    </h3>
                                    <div className="text-xs text-gray-500 bg-black/40 px-3 py-1 rounded-full border border-gray-800">
                                        {Object.keys(projectFiles).length} files across all tapes & pool
                                    </div>
                                </div>

                                {/* Assigned Samples */}
                                <section className="space-y-4">
                                    <h4 className="text-[10px] font-bold text-synthux-orange uppercase tracking-[0.2em]">Assigned to Slots</h4>
                                    <div className="space-y-2">
                                        {Object.values(projectFiles).filter(f => !f.isParked).map(file => (
                                            <ProjectFileRow
                                                key={file.id}
                                                file={file}
                                                isExpanded={expandedFiles.has(file.id)}
                                                onToggle={() => toggleExpand(file.id)}
                                                onCopy={handleCopyToLibrary}
                                                status={projectLibraryStatus[file.id] || 'missing'}
                                            />
                                        ))}
                                    </div>
                                </section>

                                {/* Unassigned Samples */}
                                <section className="space-y-4 pt-4 border-t border-gray-800">
                                    <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">Unassigned (Project Pool)</h4>
                                    <div className="space-y-2">
                                        {Object.values(projectFiles).filter(f => f.isParked).map(file => (
                                            <ProjectFileRow
                                                key={file.id}
                                                file={file}
                                                isExpanded={expandedFiles.has(file.id)}
                                                onToggle={() => toggleExpand(file.id)}
                                                onCopy={handleCopyToLibrary}
                                                status={projectLibraryStatus[file.id] || 'missing'}
                                            />
                                        ))}
                                    </div>
                                </section>
                            </div>
                        )}

                        {activeTab === 'manage' && (
                            <div className="space-y-6">
                                <div className="flex items-center justify-between border-b border-gray-800 pb-4">
                                    <h3 className="text-white font-bold text-lg flex items-center gap-2">
                                        <Settings size={18} className="text-synthux-orange" /> Library Maintenance
                                    </h3>
                                    <div className="text-xs text-gray-500">
                                        {Object.keys(userLibrary.files).length} Total Indexed Samples
                                    </div>
                                </div>

                                {missingLibraryFiles.length > 0 ? (
                                    <div className="bg-red-900/20 border border-red-500/50 rounded-xl p-6">
                                        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-8">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center text-red-500 shadow-inner">
                                                    <AlertCircle size={24} />
                                                </div>
                                                <div className="max-w-md">
                                                    <h4 className="text-base font-bold text-white mb-0.5">Missing Library Files Detected</h4>
                                                    <p className="text-xs text-red-200/60 leading-relaxed">
                                                        {missingLibraryFiles.length} samples in your index were not found in the <code className="bg-red-500/20 px-1 rounded text-red-300">User_Library</code> folder.
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                                                <button
                                                    onClick={handleRecoverFromCache}
                                                    className="flex-1 md:flex-none px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-bold transition-all shadow-lg shadow-green-500/20 flex items-center justify-center gap-2"
                                                    title="Recreate all physical files from browser cache"
                                                >
                                                    <RotateCcw size={14} /> Recover All
                                                </button>
                                                <button
                                                    onClick={onSmartScan}
                                                    className="flex-1 md:flex-none px-4 py-2 bg-synthux-orange hover:bg-orange-600 text-white rounded-lg text-xs font-bold transition-all shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2"
                                                >
                                                    <FolderOpen size={14} /> Smart Scan Folder
                                                </button>
                                            </div>
                                        </div>

                                        {/* Detailed File List */}
                                        <div className="bg-black/30 rounded-lg border border-red-500/20 overflow-hidden">
                                            <div className="px-4 py-2 bg-red-900/30 border-b border-red-500/20 text-[10px] font-bold text-red-300 uppercase tracking-widest flex items-center justify-between">
                                                <span>Missing Assets Detail</span>
                                                <span>{missingLibraryFiles.length} Total</span>
                                            </div>
                                            <div className="max-h-[40vh] overflow-y-auto divide-y divide-red-500/10">
                                                {missingLibraryFiles.map(id => {
                                                    const file = userLibrary.files[id];
                                                    if (!file) return null;
                                                    return (
                                                        <div key={id} className="px-4 py-2.5 flex items-center justify-between gap-4 hover:bg-red-500/5 transition-colors group">
                                                            <div className="flex items-center gap-3 overflow-hidden">
                                                                <FileAudio size={14} className="text-red-400/50 flex-shrink-0" />
                                                                <span className="text-xs text-white font-medium truncate">{file.name}</span>
                                                            </div>
                                                            <div className="flex items-center gap-1.5 flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
                                                                <button
                                                                    onClick={() => handleRecoverSingleFile(id)}
                                                                    className="flex items-center gap-1.5 px-2 py-1 hover:bg-green-500/20 text-green-400 rounded transition-colors text-[9px] font-bold uppercase tracking-wider"
                                                                    title="Recover from cache"
                                                                >
                                                                    <RotateCcw size={10} /> Recover
                                                                </button>
                                                                <button
                                                                    onClick={onSmartScan}
                                                                    className="flex items-center gap-1.5 px-2 py-1 hover:bg-orange-500/20 text-orange-400 rounded transition-colors text-[9px] font-bold uppercase tracking-wider"
                                                                    title="Browse for file"
                                                                >
                                                                    <FolderOpen size={10} /> Scan
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDeleteSingleMissing(id)}
                                                                    className="flex items-center gap-1.5 px-2 py-1 hover:bg-red-500/20 text-red-400 rounded transition-colors text-[9px] font-bold uppercase tracking-wider"
                                                                    title="Remove from index"
                                                                >
                                                                    <Trash2 size={10} /> Delete
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                        <div className="mt-6 flex justify-end">
                                            <button
                                                onClick={handleDeleteAllMissing}
                                                className="px-4 py-2 bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white border border-red-500/30 rounded-lg text-xs font-bold transition-all flex items-center gap-2"
                                            >
                                                <Trash2 size={14} /> Purge All Missing From Index
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="bg-synthux-green/10 border border-synthux-green/30 rounded-xl p-12 text-center space-y-4">
                                        <div className="w-16 h-16 bg-synthux-green/20 rounded-full flex items-center justify-center text-synthux-green mx-auto">
                                            <Check size={32} />
                                        </div>
                                        <h4 className="text-white font-bold text-lg">Library is Healthy</h4>
                                        <p className="text-gray-400 text-sm max-w-sm mx-auto">
                                            All {Object.keys(userLibrary.files).length} indexed samples were successfully located in your <code className="bg-black/40 px-1 rounded">User_Library</code> folder.
                                        </p>
                                    </div>
                                )}

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <button
                                        onClick={() => onRefreshLibrary()}
                                        className="bg-black/20 border border-gray-700 rounded-xl p-6 text-left hover:border-synthux-orange transition-colors group"
                                    >
                                        <RefreshCw className="text-gray-500 mb-2 group-hover:rotate-180 transition-transform duration-500" size={24} />
                                        <h4 className="text-white font-bold mb-1">Rescan Folder</h4>
                                        <p className="text-gray-400 text-xs">Verify all files on disk and update the library index.</p>
                                    </button>

                                    <button
                                        onClick={onSmartScan}
                                        className="bg-black/20 border border-gray-700 rounded-xl p-6 text-left hover:border-synthux-orange transition-colors"
                                    >
                                        <FolderOpen className="text-gray-500 mb-2" size={24} />
                                        <h4 className="text-white font-bold mb-1">Smart Find Folder</h4>
                                        <p className="text-gray-400 text-xs">Relocate missing files by scanning a different root folder.</p>
                                    </button>
                                </div>

                                {/* Batch Log (Transplanted from Upload Tab) */}
                                {batchLog.length > 0 && (
                                    <div className="bg-black/30 border border-gray-800 rounded-lg p-6 space-y-4">
                                        <div className="flex justify-between items-center text-sm">
                                            <div className="flex items-center gap-3">
                                                <span className="text-synthux-orange font-bold uppercase tracking-wider">
                                                    {isConvertingBatch ? 'Processing Batch...' : 'Batch Log'}
                                                </span>
                                                {!isConvertingBatch && (
                                                    <span className="text-synthux-green font-bold uppercase tracking-wider">Complete</span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="text-white font-mono">{batchProgress}%</span>
                                                <button
                                                    onClick={() => setBatchLog([])}
                                                    disabled={isConvertingBatch}
                                                    className="px-2 py-1 rounded text-[10px] font-bold border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    Clear
                                                </button>
                                            </div>
                                        </div>
                                        <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-synthux-orange transition-all duration-300"
                                                style={{ width: `${batchProgress}%` }}
                                            />
                                        </div>
                                        <div className="bg-black/50 rounded p-3 h-32 overflow-y-auto font-mono text-xs text-gray-400 space-y-1">
                                            {batchLog.map((log, i) => (
                                                <div key={i}>{log}</div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Library Management (Transplanted from Upload Tab) */}
                                <div className="space-y-4">
                                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest border-b border-gray-800 pb-2">Your Current Library ({Object.keys(userLibrary.files).length} samples)</h3>
                                    <div className="bg-black/20 border border-gray-800 rounded-lg p-3 space-y-3">
                                        <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Tag Filter</div>
                                        <input
                                            value={libraryTagFilter}
                                            onChange={(e) => setLibraryTagFilter(e.target.value)}
                                            placeholder="Type tags (partial match)"
                                            className="w-full bg-black/50 border border-gray-700 rounded px-3 py-2 text-xs text-white"
                                        />
                                        {allLibraryTags.length > 0 && (
                                            <div className="flex flex-wrap gap-2">
                                                {allLibraryTags.map(tag => {
                                                    const selected = selectedLibraryFilterTags.includes(tag);
                                                    return (
                                                        <button
                                                            key={tag}
                                                            onClick={() => setSelectedLibraryFilterTags(prev =>
                                                                prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
                                                            )}
                                                            className={`px-2 py-1 rounded-full text-[10px] border transition-colors ${selected
                                                                ? 'bg-synthux-orange/20 border-synthux-orange/50 text-synthux-orange'
                                                                : 'bg-black/40 border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-500'
                                                                }`}
                                                        >
                                                            {tag}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-4">
                                        <div className="bg-black/20 border border-gray-800 rounded-lg overflow-hidden">
                                            <div className="px-3 py-2 border-b border-gray-800 flex items-center justify-between">
                                                <button
                                                    onClick={toggleSelectAllFiltered}
                                                    className="text-[10px] font-bold uppercase tracking-wider text-synthux-orange hover:underline"
                                                >
                                                    {filteredLibraryFiles.length > 0 && filteredLibraryFiles.every(file => selectedLibraryIds.has(file.id)) ? 'Unselect All' : 'Select All'}
                                                </button>
                                                <div className="text-[10px] text-gray-500 font-mono">{filteredLibraryFiles.length} shown</div>
                                            </div>
                                            <div ref={manageListRef} className="max-h-[600px] min-h-[400px] overflow-y-auto divide-y divide-gray-800/70">
                                                {filteredLibraryFiles.length === 0 && (
                                                    <div className="p-3 text-xs text-gray-500">No library files match your tag filter.</div>
                                                )}
                                                {filteredLibraryFiles.map(file => {
                                                    const isHighlighted = highlightedFileId === file.id;
                                                    return (
                                                        <div
                                                            key={file.id}
                                                            data-library-file-id={file.id}
                                                            onClick={() => toggleLibrarySelection(file.id)}
                                                            className={`px-3 py-2 flex items-center gap-2 transition-all cursor-pointer group/row ${isHighlighted ? 'bg-synthux-orange/10 border-2 border-synthux-orange/50 rounded-lg' : 'hover:bg-white/5'}`}
                                                            style={isHighlighted ? { animation: 'locatePulse 2s ease-in-out infinite' } : undefined}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedLibraryIds.has(file.id)}
                                                                onChange={(e) => {
                                                                    e.stopPropagation();
                                                                    toggleLibrarySelection(file.id);
                                                                }}
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="accent-synthux-orange cursor-pointer"
                                                            />
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    toggleLibraryPreview(file);
                                                                }}
                                                                className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${playingPreviewKey === `library:${file.id}` ? 'text-synthux-orange bg-synthux-orange/10' : 'text-gray-400 bg-gray-800 group-hover/row:bg-gray-700 hover:text-white'}`}
                                                                title="Audition"
                                                            >
                                                                {playingPreviewKey === `library:${file.id}` && isPlaybackActive ? <Pause size={11} fill="currentColor" /> : <Play size={11} fill="currentColor" />}
                                                            </button>
                                                            <div className="min-w-0 flex-1 pr-2">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="text-sm text-white truncate font-mono">{file.name}</div>
                                                                    {missingLibraryFiles.includes(file.id) && (
                                                                        <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-500 text-[9px] font-bold uppercase tracking-wider border border-red-500/30 shrink-0">Missing</span>
                                                                    )}
                                                                    <div className="flex items-center gap-1">
                                                                        {(file.metadata?.tempo || (file.tags || []).some(t => t.toLowerCase().includes('bpm'))) && (
                                                                            <span className="px-1 rounded bg-synthux-blue/20 text-synthux-blue text-[8px] font-black border border-synthux-blue/30" title="Tempo Enabled">T</span>
                                                                        )}
                                                                        {(file.metadata?.slicePoints?.length || (file.versions[0]?.processing || []).includes('sliced')) && (
                                                                            <span className="px-1 rounded bg-synthux-orange/20 text-synthux-orange text-[8px] font-black border border-synthux-orange/30" title="Slices Embedded">S</span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                <div className="text-[10px] truncate flex items-center gap-2">
                                                                    {file.license && (
                                                                        <span className="text-synthux-orange font-bold uppercase tracking-wider">{getLicenseAbbr(file.license)}</span>
                                                                    )}
                                                                    <span className="text-gray-500">{(file.tags || []).join(', ') || 'No tags'}</span>
                                                                </div>
                                                            </div>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    selectSingleLibraryFile(file.id);
                                                                }}
                                                                className="p-1.5 text-gray-500 hover:text-synthux-orange hover:bg-synthux-orange/10 rounded transition-colors"
                                                                title="Edit selected"
                                                            >
                                                                <Edit2 size={12} />
                                                            </button>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleRemoveFromLibrary(file.id);
                                                                }}
                                                                className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                                                                title="Delete"
                                                            >
                                                                <Trash2 size={12} />
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <div className="bg-black/20 border border-gray-800 rounded-lg p-4 space-y-4">
                                            <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Selected Files</div>
                                            <div className="text-xs text-gray-300">
                                                {selectedLibraryFiles.length === 0 ? 'Select at least one file from the left list.' : `${selectedLibraryFiles.length} selected`}
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Rename</label>
                                                <div className="flex gap-2">
                                                    <input
                                                        value={libraryBulkName}
                                                        onChange={(e) => setLibraryBulkName(e.target.value)}
                                                        placeholder={selectedLibraryFiles.length > 1 ? 'Base title, numbering will be appended' : 'New title'}
                                                        className="flex-1 bg-black/50 border border-gray-700 rounded px-3 py-2 text-sm text-white font-mono"
                                                    />
                                                    <button
                                                        onClick={applyBulkRename}
                                                        disabled={selectedLibraryFiles.length === 0 || !libraryBulkName.trim()}
                                                        className="px-3 py-2 rounded bg-gray-800 hover:bg-gray-700 text-xs font-bold text-white disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        Apply
                                                    </button>
                                                </div>
                                                {selectedLibraryFiles.length > 1 && (
                                                    <div className="text-[10px] text-gray-500">Multi-rename format: "Title 1", "Title 2", ...</div>
                                                )}
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Tags</label>
                                                <div className="flex gap-2">
                                                    <SmartTagInput
                                                        value={libraryBulkTagInput}
                                                        onChange={setLibraryBulkTagInput}
                                                        onAdd={(val) => {
                                                            const parsed = parseTags(val);
                                                            if (parsed.length === 0 || selectedLibraryFiles.length === 0) return;
                                                            const selectedIds = selectedLibraryFiles.map(f => f.id);
                                                            setUserLibrary(prev => {
                                                                const next = { ...prev.files };
                                                                selectedIds.forEach(id => {
                                                                    const file = next[id];
                                                                    if (!file) return;
                                                                    next[id] = { ...file, tags: Array.from(new Set([...(file.tags || []), ...parsed])) };
                                                                });
                                                                return { ...prev, files: next };
                                                            });
                                                            setLibraryBulkTagInput('');
                                                        }}
                                                        placeholder="Add tags..."
                                                    />
                                                    <button
                                                        onClick={applyBulkTags}
                                                        disabled={selectedLibraryFiles.length === 0}
                                                        className="px-3 py-2 rounded bg-gray-800 hover:bg-gray-700 text-xs font-bold text-white disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        Add
                                                    </button>
                                                </div>

                                                {selectedTagEntries.length > 0 && (
                                                    <div className="flex flex-wrap gap-2">
                                                        {selectedTagEntries.map(([tag, count]) => (
                                                            <button
                                                                key={tag}
                                                                onClick={() => removeTagFromSelected(tag)}
                                                                className="px-2 py-1 rounded-full text-[10px] font-bold bg-synthux-blue/20 border border-synthux-blue/40 text-synthux-blue"
                                                            >
                                                                {tag} ({count}) x
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="space-y-3 pt-2 border-t border-gray-800">
                                                <div className="flex items-center justify-between">
                                                    <label className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">License</label>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">Preselect:</span>
                                                        <select
                                                            className="bg-black/60 border border-gray-700/50 rounded-lg px-2 py-0.5 text-[10px] text-gray-400 outline-none hover:border-gray-600 transition-colors"
                                                            onChange={(e) => setLibraryBulkLicense(e.target.value)}
                                                            value=""
                                                        >
                                                            <option value="" disabled>Presets</option>
                                                            {COMMON_LICENSES.map(l => (
                                                                <option key={l.label} value={l.value}>{l.label}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </div>

                                                <div className="min-h-[140px] relative">
                                                    <NotesEditor
                                                        value={libraryBulkLicense}
                                                        onChange={setLibraryBulkLicense}
                                                        placeholder="License terms..."
                                                        minHeight="140px"
                                                        fullHeight={false}
                                                    />
                                                </div>

                                                <button
                                                    onClick={applyBulkLicense}
                                                    disabled={selectedLibraryFiles.length === 0}
                                                    className="w-full px-3 py-2 rounded bg-synthux-orange hover:bg-orange-600 text-white text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    Apply License to Selected
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="sticky bottom-0 bg-synthux-panel/95 backdrop-blur-md border border-gray-800 rounded-lg p-3 shadow-2xl z-20 -mx-1">
                                        <div className="flex items-center gap-4">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (!previewAudioRef.current) return;
                                                    if (previewAudioRef.current.paused) previewAudioRef.current.play();
                                                    else previewAudioRef.current.pause();
                                                }}
                                                disabled={!playingPreviewKey}
                                                className="w-10 h-10 rounded-full flex items-center justify-center bg-synthux-orange text-white hover:bg-orange-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0 shadow-lg"
                                            >
                                                {isPlaybackActive ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
                                            </button>

                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                                                    <div className="truncate font-mono">
                                                        {playingPreviewKey?.startsWith('library:') ? `Preview: ${playingPreviewLabel}` : 'Select a library file to audition'}
                                                    </div>
                                                    <div className="font-mono tabular-nums">
                                                        {Math.floor(playbackTime)}s / {Math.floor(playbackDuration)}s
                                                    </div>
                                                </div>
                                                <input
                                                    type="range"
                                                    min={0}
                                                    max={playbackDuration || 0}
                                                    value={playbackTime}
                                                    disabled={!playingPreviewKey || playbackDuration <= 0}
                                                    onChange={(e) => {
                                                        const t = Number(e.target.value);
                                                        if (!previewAudioRef.current) return;
                                                        previewAudioRef.current.currentTime = t;
                                                        setPlaybackTime(t);
                                                    }}
                                                    className="w-full accent-synthux-orange disabled:opacity-40"
                                                />
                                            </div>

                                            <button
                                                onClick={stopPreview}
                                                disabled={!playingPreviewKey}
                                                className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-800 text-gray-400 hover:text-white transition-colors disabled:opacity-40 shrink-0"
                                                title="Stop"
                                            >
                                                <Square size={14} fill="currentColor" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'settings' && (
                            <div className="max-w-xl mx-auto space-y-8 py-4 px-2">
                                <div className="flex items-center justify-between gap-4">
                                    <div className="space-y-4">
                                        <h3 className="text-white font-bold text-lg flex items-center gap-2">
                                            <Settings size={18} className="text-synthux-orange" /> Global Library Settings
                                        </h3>
                                        <p className="text-gray-400 text-sm">These metadata values will be attached to all samples added to your Main User Library. This information is used for crediting and licensing when sharing projects.</p>
                                    </div>

                                    {/* Saved Indicator */}
                                    <div className={`p-2 bg-green-500/20 border border-green-500/40 text-green-400 rounded-full transition-all duration-300 ${showSavedCheck ? 'opacity-100 scale-100' : 'opacity-0 scale-75'}`} title="Settings Saved">
                                        <Check size={20} />
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Default Artist / Creator Name</label>
                                        <div className="relative group">
                                            <input
                                                type="text"
                                                value={userLibrary.metadata.artist || ''}
                                                onChange={e => updateMetadata('artist', e.target.value)}
                                                placeholder="e.g., Jonwtr"
                                                className="w-full bg-black/60 border border-gray-700/50 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-synthux-orange/50 focus:ring-1 focus:ring-synthux-orange/20 transition-all font-mono text-sm group-hover:border-gray-600 outline-none shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]"
                                            />
                                            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 group-hover:text-gray-400 transition-colors">
                                                <Edit2 size={14} />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Default License Text</label>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Preselect:</span>
                                                <select
                                                    className="bg-black/60 border border-gray-700/50 rounded-lg px-2 py-1 text-[11px] text-gray-300 outline-none hover:border-gray-600 transition-colors"
                                                    onChange={(e) => updateMetadata('license', e.target.value)}
                                                    value=""
                                                >
                                                    <option value="" disabled>Common Licenses</option>
                                                    {COMMON_LICENSES.map(l => (
                                                        <option key={l.label} value={l.value}>{l.label}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>

                                        <div className="min-h-[220px]">
                                            <NotesEditor
                                                value={userLibrary.metadata.license || ''}
                                                onChange={val => updateMetadata('license', val)}
                                                placeholder="e.g., CC-BY 4.0 - Add your licensing details here..."
                                                minHeight="180px"
                                                fullHeight={false}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-synthux-yellow/10 border border-synthux-yellow/30 rounded-xl p-5 flex gap-4 shadow-lg shadow-black/20">
                                    <div className="w-10 h-10 rounded-full bg-synthux-yellow/20 flex items-center justify-center text-synthux-yellow shrink-0 border border-synthux-yellow/30">
                                        <Info size={20} />
                                    </div>
                                    <div className="text-sm text-synthux-yellow/90">
                                        <p className="font-bold mb-1 uppercase tracking-wider">About Licenses</p>
                                        <p className="leading-relaxed opacity-80">Licenses help other users understand how they can use your shared samples. If you leave this clear, standard copyright applies to your original work.</p>
                                    </div>
                                </div>

                                <div className="pt-8 border-t border-white/5 space-y-4">
                                    {/* Library Actions */}
                                    <div className="bg-black/20 p-4 rounded-xl border border-gray-800/50 space-y-4">
                                        <div className="space-y-1">
                                            <h4 className="text-white font-bold text-sm">Library Actions</h4>
                                            <p className="text-xs text-gray-400">Synchronize your library with the workspace folder or download a backup.</p>
                                        </div>
                                        <div className="flex flex-wrap gap-3">
                                            <button
                                                onClick={onOpenLibrarySync}
                                                className="px-4 py-2 bg-gray-800 hover:bg-synthux-blue/20 border border-gray-700 hover:border-synthux-blue/50 text-gray-300 hover:text-synthux-blue rounded-lg text-xs font-bold transition-all flex items-center gap-2 group"
                                            >
                                                <RefreshCw size={14} className="group-hover:rotate-180 transition-transform duration-500" /> Sync Library
                                            </button>
                                            <button
                                                onClick={onDownloadZip}
                                                className="px-4 py-2 bg-gray-800 hover:bg-synthux-green/20 border border-gray-700 hover:border-synthux-green/50 text-gray-300 hover:text-synthux-green rounded-lg text-xs font-bold transition-all flex items-center gap-2"
                                            >
                                                <Upload size={14} className="rotate-180" /> Download ZIP
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between bg-black/20 p-4 rounded-xl border border-gray-800/50">
                                        <div className="space-y-1">
                                            <h4 className="text-white font-bold text-sm">Browser Choice Preference</h4>
                                            <p className="text-xs text-gray-400">Reset the saved choice between OS Browser and App Sample Browser.</p>
                                        </div>
                                        <button
                                            onClick={onResetBrowserPreference}
                                            className="px-4 py-2 bg-gray-800 hover:bg-red-500/20 border border-gray-700 hover:border-red-500/50 text-gray-300 hover:text-red-400 rounded-lg text-xs font-bold transition-all flex items-center gap-2 group"
                                        >
                                            <RotateCcw size={14} className="group-hover:rotate-180 transition-transform duration-500" /> Reset Preference
                                        </button>
                                    </div>

                                    {/* Local Folders Management */}
                                    <div className="bg-black/20 p-4 rounded-xl border border-gray-800/50 space-y-4">
                                        <div className="flex items-center justify-between">
                                            <div className="space-y-1">
                                                <h4 className="text-white font-bold text-sm">Local Folders</h4>
                                                <p className="text-xs text-gray-400">Manage mounted folders shown in the Sample Browser.</p>
                                            </div>
                                            <button
                                                onClick={handleAddCustomFolder}
                                                className="px-3 py-1.5 bg-synthux-blue/20 hover:bg-synthux-blue text-synthux-blue hover:text-black border border-synthux-blue/30 rounded-lg text-xs font-bold transition-all flex items-center gap-2"
                                            >
                                                <Plus size={14} /> Add Folder
                                            </button>
                                        </div>

                                        {customFolders.length > 0 ? (
                                            <div className="space-y-2">
                                                {customFolders.map(folder => (
                                                    <div key={folder.id} className="flex items-center justify-between bg-black/40 p-2 rounded-lg border border-gray-800 group transition-colors hover:border-gray-700">
                                                        <div className="flex items-center gap-3 min-w-0">
                                                            <FolderOpen size={16} className="text-gray-500 shrink-0" />
                                                            <span className="text-xs text-gray-300 truncate" title={folder.name}>{folder.name}</span>
                                                        </div>
                                                        <button
                                                            onClick={(e) => handleRemoveCustomFolder(folder.id, e)}
                                                            className="p-1 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                                                            title="Remove Folder"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-center py-4 text-xs text-gray-600 italic border border-dashed border-gray-800 rounded-lg">No folders mounted.</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {pendingUploadDrafts && (
                            <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
                                <div className="w-full max-w-5xl max-h-[88vh] overflow-hidden rounded-xl border border-gray-700 bg-synthux-panel flex flex-col">
                                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
                                        <div>
                                            <h3 className="text-white text-lg font-bold">Review Import Batch</h3>
                                            <p className="text-xs text-gray-400">Audition, rename, remove, and tag files before conversion/import.</p>
                                        </div>
                                        <button onClick={handleCloseReview} className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white">
                                            <X size={18} />
                                        </button>
                                    </div>

                                    <div className="px-5 py-4 border-b border-gray-800 bg-black/20 space-y-3">
                                        <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                                            Global Tags (applied to all imports)
                                        </div>
                                        <div className="flex gap-2">
                                            <SmartTagInput
                                                value={globalTagInput}
                                                onChange={setGlobalTagInput}
                                                onAdd={(val) => {
                                                    setGlobalTags(prev => appendTags(prev, val));
                                                    setGlobalTagInput('');
                                                }}
                                                placeholder="Add comma-separated tags and press Enter"
                                            />
                                            <button
                                                onClick={() => {
                                                    if (!globalTagInput.trim()) return;
                                                    setGlobalTags(prev => appendTags(prev, globalTagInput));
                                                    setGlobalTagInput('');
                                                }}
                                                className="px-3 py-2 rounded bg-gray-800 hover:bg-gray-700 text-xs font-bold text-white"
                                            >
                                                Add
                                            </button>
                                        </div>
                                        {globalTags.length > 0 && (
                                            <div className="flex flex-wrap gap-2">
                                                {globalTags.map(tag => (
                                                    <button
                                                        key={tag}
                                                        onClick={() => setGlobalTags(prev => prev.filter(t => t !== tag))}
                                                        className="px-2 py-1 rounded-full text-[10px] font-bold bg-synthux-orange/20 border border-synthux-orange/40 text-synthux-orange"
                                                        title="Remove tag"
                                                    >
                                                        {tag} x
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-synthux-main">
                                        {pendingUploadDrafts.length === 0 && (
                                            <div className="text-sm text-gray-400">No files left in this batch.</div>
                                        )}

                                        {pendingUploadDrafts.map(draft => (
                                            <div key={draft.id} className="border border-gray-800 bg-black/20 rounded-lg p-4 space-y-3">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <button
                                                            onClick={() => toggleDraftPreview(draft)}
                                                            className={`w-8 h-8 rounded-full flex items-center justify-center ${playingPreviewKey === `draft:${draft.id}` ? 'text-synthux-orange bg-synthux-orange/10' : 'text-gray-400 bg-gray-800 hover:bg-gray-700 hover:text-white'}`}
                                                            title="Audition"
                                                        >
                                                            {playingPreviewKey === `draft:${draft.id}` ? <Square size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
                                                        </button>
                                                        <div className="min-w-0">
                                                            <div className="text-xs text-gray-400 font-mono truncate">{draft.file.name}</div>
                                                            <div className="text-[10px] text-gray-500">
                                                                {draft.willConvert ? 'Will convert WAV -> FLAC' : 'No conversion'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => {
                                                            if (playingPreviewKey === `draft:${draft.id}`) stopPreview();
                                                            setPendingUploadDrafts(prev => (prev || []).filter(d => d.id !== draft.id));
                                                        }}
                                                        className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                                                        title="Remove from batch"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>

                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Display Name</label>
                                                    <input
                                                        value={draft.displayName}
                                                        onChange={e => setPendingUploadDrafts(prev => (prev || []).map(d => d.id === draft.id ? { ...d, displayName: e.target.value } : d))}
                                                        className="w-full bg-black/50 border border-gray-700 rounded px-3 py-2 text-sm text-white font-mono"
                                                    />
                                                </div>

                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Tags (per file)</label>
                                                    <div className="flex gap-2">
                                                        <SmartTagInput
                                                            value={draft.tagInput}
                                                            onChange={val => setPendingUploadDrafts(prev => (prev || []).map(d => d.id === draft.id ? { ...d, tagInput: val } : d))}
                                                            onAdd={(val) => {
                                                                const parsed = parseTags(val);
                                                                if (parsed.length === 0) return;
                                                                setPendingUploadDrafts(prev => (prev || []).map(d => {
                                                                    if (d.id !== draft.id) return d;
                                                                    return { ...d, tags: Array.from(new Set([...d.tags, ...parsed])), tagInput: '' };
                                                                }));
                                                            }}
                                                            placeholder="Add tags..."
                                                        />
                                                        <button
                                                            onClick={() => {
                                                                const parsed = parseTags(draft.tagInput);
                                                                if (parsed.length === 0) return;
                                                                setPendingUploadDrafts(prev => (prev || []).map(d => {
                                                                    if (d.id !== draft.id) return d;
                                                                    return { ...d, tags: Array.from(new Set([...d.tags, ...parsed])), tagInput: '' };
                                                                }));
                                                            }}
                                                            className="px-3 py-2 rounded bg-gray-800 hover:bg-gray-700 text-xs font-bold text-white"
                                                        >
                                                            Add
                                                        </button>
                                                    </div>
                                                    {draft.tags.length > 0 && (
                                                        <div className="flex flex-wrap gap-2">
                                                            {draft.tags.map(tag => (
                                                                <button
                                                                    key={`${draft.id}-${tag}`}
                                                                    onClick={() => setPendingUploadDrafts(prev => (prev || []).map(d => d.id === draft.id ? { ...d, tags: d.tags.filter(t => t !== tag) } : d))}
                                                                    className="px-2 py-1 rounded-full text-[10px] font-bold bg-synthux-blue/20 border border-synthux-blue/40 text-synthux-blue"
                                                                >
                                                                    {tag} x
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="px-5 py-4 border-t border-gray-800 bg-black/20 space-y-3">
                                        <div>
                                            <div className="flex items-center justify-between text-xs text-gray-400">
                                                <div className="truncate font-mono">
                                                    {playingPreviewKey?.startsWith('draft:') ? `Preview: ${playingPreviewLabel}` : 'Select a draft file to audition'}
                                                </div>
                                                <div className="font-mono">
                                                    {Math.floor(playbackTime)}s / {Math.floor(playbackDuration)}s
                                                </div>
                                            </div>
                                            <input
                                                type="range"
                                                min={0}
                                                max={playbackDuration || 0}
                                                value={playbackTime}
                                                disabled={!playingPreviewKey?.startsWith('draft:') || playbackDuration <= 0}
                                                onChange={(e) => {
                                                    const t = Number(e.target.value);
                                                    if (!previewAudioRef.current) return;
                                                    previewAudioRef.current.currentTime = t;
                                                    setPlaybackTime(t);
                                                }}
                                                className="w-full mt-2 accent-synthux-orange disabled:opacity-40"
                                            />
                                        </div>

                                        <div className="flex items-center justify-between">
                                            <div className="text-xs text-gray-400">
                                                {pendingUploadDrafts.length} file(s) queued for import
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={handleCloseReview}
                                                    className="px-3 py-2 rounded border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 text-xs font-bold"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    onClick={handleConfirmDraftImport}
                                                    disabled={pendingUploadDrafts.length === 0 || isConvertingBatch}
                                                    className="px-4 py-2 rounded bg-synthux-orange hover:bg-orange-600 text-white text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    Import Selected
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}


                        <audio
                            ref={previewAudioRef}
                            onLoadedMetadata={() => {
                                if (!previewAudioRef.current) return;
                                setPlaybackDuration(previewAudioRef.current.duration || 0);
                            }}
                            onTimeUpdate={() => {
                                if (!previewAudioRef.current) return;
                                setPlaybackTime(previewAudioRef.current.currentTime || 0);
                            }}
                            onPlay={() => setIsPlaybackActive(true)}
                            onPause={() => setIsPlaybackActive(false)}
                            onEnded={() => {
                                setIsPlaybackActive(false);
                                stopPreview();
                            }}
                        />
                    </div>
                </div>
            </div>

        </div>
    );
};
