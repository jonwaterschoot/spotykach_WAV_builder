import { useState, useRef } from 'react';
import { X, Upload, Trash2, Edit2, Check, Settings, Plus, FileAudio, FolderOpen, AlertCircle, ChevronDown, ChevronRight, Play, Square } from 'lucide-react';
import type { FileRecord, UserLibrary, UserLibraryMetadata } from '../types';
import { useAudioConverter } from '../utils/useAudioConverter';

interface LibraryManagerProps {
    isOpen: boolean;
    onClose: () => void;
    userLibrary: UserLibrary;
    setUserLibrary: (lib: UserLibrary | ((prev: UserLibrary) => UserLibrary)) => void;
    projectFiles: Record<string, FileRecord>;
    projectName?: string;
    workHandle: FileSystemDirectoryHandle | null;
}

interface UploadDraft {
    id: string;
    file: File;
    displayName: string;
    willConvert: boolean;
    tags: string[];
    tagInput: string;
}

export const LibraryManager = ({ isOpen, onClose, userLibrary, setUserLibrary, projectFiles, projectName, workHandle }: LibraryManagerProps) => {
    const [activeTab, setActiveTab] = useState<'upload' | 'project' | 'settings'>('upload');
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

    const { convertWavToFlac, isLoaded, load } = useAudioConverter();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const previewAudioRef = useRef<HTMLAudioElement | null>(null);
    const previewUrlRef = useRef<string | null>(null);

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

    const toggleDraftPreview = (draft: UploadDraft) => {
        playBlobPreview(draft.file, `draft:${draft.id}`, draft.displayName || draft.file.name);
    };

    const toggleLibraryPreview = (file: FileRecord) => {
        const currentVersion = file.versions.find(v => v.id === file.currentVersionId) || file.versions[0];
        if (!currentVersion?.blob) return;
        playBlobPreview(currentVersion.blob, `library:${file.id}`, file.name);
    };

    const allLibraryTags = Array.from(
        new Set(Object.values(userLibrary.files).flatMap(file => file.tags || []))
    ).sort((a, b) => a.localeCompare(b));

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
        setSelectedLibraryIds(new Set([id]));
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
            const willConvert = shouldConvert ? await detectUncompressedWav(file) : false;
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

                const fileId = crypto.randomUUID();
                const versionId = crypto.randomUUID();

                const newRecord: FileRecord = {
                    id: fileId,
                    name: finalName,
                    originalName: file.name,
                    isParked: true,
                    origin: 'User Upload',
                    license: userLibrary.metadata.license,
                    tags: Array.from(new Set([...tagsForAll, ...draft.tags])),
                    currentVersionId: versionId,
                    versions: [{
                        id: versionId,
                        timestamp: Date.now(),
                        description: 'Original Upload',
                        blob: finalBlob,
                        duration: 0
                    }]
                };

                // Update state incrementally so user sees files appearing
                setUserLibrary(prev => ({
                    ...prev,
                    files: { ...prev.files, [fileId]: newRecord }
                }));

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
        const fileId = crypto.randomUUID();
        const mainVersion = file.versions.find(v => v.id === file.currentVersionId) || file.versions[0];

        const newRecord: FileRecord = {
            ...file,
            id: fileId,
            name: customName || file.name,
            isParked: true,
            origin: `Project: ${projectName || 'Unknown'}`,
            license: userLibrary.metadata.license || file.license,
            versions: [{
                ...mainVersion,
                id: crypto.randomUUID(),
                timestamp: Date.now(),
                description: `Copied from ${projectName || 'Project'}`
            }],
            currentVersionId: '' // Will set below
        };
        newRecord.currentVersionId = newRecord.versions[0].id;

        setUserLibrary(prev => ({
            ...prev,
            files: { ...prev.files, [fileId]: newRecord }
        }));
    };

    const handleRemoveFromLibrary = (id: string) => {
        setUserLibrary(prev => {
            const nextFiles = { ...prev.files };
            delete nextFiles[id];
            return { ...prev, files: nextFiles };
        });
    };

    const updateMetadata = (key: keyof UserLibraryMetadata, value: string) => {
        setUserLibrary(prev => ({
            ...prev,
            metadata: { ...prev.metadata, [key]: value }
        }));
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
                                <div className="bg-black/20 border-2 border-dashed border-gray-700 rounded-xl p-10 text-center hover:border-synthux-orange/50 transition-colors group">
                                    <input
                                        type="file"
                                        multiple
                                        accept="audio/*"
                                        className="hidden"
                                        ref={fileInputRef}
                                        onChange={handleUpload}
                                    />
                                    <Upload className="mx-auto text-gray-500 group-hover:text-synthux-orange mb-4" size={48} />
                                    <h3 className="text-lg font-bold text-white mb-2">Drag & Drop Audio Files</h3>
                                    <p className="text-gray-400 text-sm mb-6">Import multiple samples into your global library</p>

                                    <div className="flex flex-col items-center gap-4">
                                        <button
                                            onClick={() => fileInputRef.current?.click()}
                                            disabled={isConvertingBatch}
                                            className="px-6 py-2 bg-synthux-orange hover:bg-orange-600 text-white rounded-lg font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            Browse Files
                                        </button>

                                        <label className="flex items-center gap-3 cursor-pointer select-none">
                                            <div className={`w-10 h-5 rounded-full p-1 transition-colors ${shouldConvert ? 'bg-synthux-orange' : 'bg-gray-700'}`}>
                                                <div className={`bg-white w-3 h-3 rounded-full transition-transform ${shouldConvert ? 'translate-x-5' : 'translate-x-0'}`} />
                                            </div>
                                            <input type="checkbox" checked={shouldConvert} onChange={e => setShouldConvert(e.target.checked)} className="hidden" />
                                            <span className="text-sm font-medium text-gray-300">Convert WAV to Lossless FLAC (Level 8)</span>
                                        </label>
                                    </div>
                                </div>

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
                                            <div className="max-h-[340px] overflow-y-auto divide-y divide-gray-800/70">
                                                {filteredLibraryFiles.length === 0 && (
                                                    <div className="p-3 text-xs text-gray-500">No library files match your tag filter.</div>
                                                )}
                                                {filteredLibraryFiles.map(file => (
                                                    <div key={file.id} className="px-3 py-2 flex items-center gap-2">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedLibraryIds.has(file.id)}
                                                            onChange={() => toggleLibrarySelection(file.id)}
                                                            className="accent-synthux-orange"
                                                        />
                                                        <button
                                                            onClick={() => toggleLibraryPreview(file)}
                                                            className={`w-7 h-7 rounded-full flex items-center justify-center ${playingPreviewKey === `library:${file.id}` ? 'text-synthux-orange bg-synthux-orange/10' : 'text-gray-400 bg-gray-800 hover:bg-gray-700 hover:text-white'}`}
                                                            title="Audition"
                                                        >
                                                            {playingPreviewKey === `library:${file.id}` ? <Square size={11} fill="currentColor" /> : <Play size={11} fill="currentColor" />}
                                                        </button>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="text-sm text-white truncate font-mono">{file.name}</div>
                                                            <div className="text-[10px] text-gray-500 truncate">{(file.tags || []).join(', ') || 'No tags'}</div>
                                                        </div>
                                                        <button
                                                            onClick={() => selectSingleLibraryFile(file.id)}
                                                            className="p-1.5 text-gray-500 hover:text-synthux-orange hover:bg-synthux-orange/10 rounded"
                                                            title="Edit selected"
                                                        >
                                                            <Edit2 size={12} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleRemoveFromLibrary(file.id)}
                                                            className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded"
                                                            title="Delete"
                                                        >
                                                            <Trash2 size={12} />
                                                        </button>
                                                    </div>
                                                ))}
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
                                                    <input
                                                        value={libraryBulkTagInput}
                                                        onChange={(e) => setLibraryBulkTagInput(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter' || e.key === ',') {
                                                                e.preventDefault();
                                                                applyBulkTags();
                                                            }
                                                        }}
                                                        placeholder="Add tags and press Enter"
                                                        className="flex-1 bg-black/50 border border-gray-700 rounded px-3 py-2 text-xs text-white"
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
                                        </div>
                                    </div>

                                    <div className="bg-black/30 border border-gray-800 rounded-lg p-3">
                                        <div className="flex items-center justify-between text-xs text-gray-400">
                                            <div className="truncate font-mono">
                                                {playingPreviewKey?.startsWith('library:') ? `Preview: ${playingPreviewLabel}` : 'Select a library file to audition'}
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
                                            disabled={!playingPreviewKey?.startsWith('library:') || playbackDuration <= 0}
                                            onChange={(e) => {
                                                const t = Number(e.target.value);
                                                if (!previewAudioRef.current) return;
                                                previewAudioRef.current.currentTime = t;
                                                setPlaybackTime(t);
                                            }}
                                            className="w-full mt-2 accent-synthux-orange disabled:opacity-40"
                                        />
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
                                            />
                                        ))}
                                    </div>
                                </section>
                            </div>
                        )}

                        {activeTab === 'settings' && (
                            <div className="max-w-xl mx-auto space-y-8 py-4">
                                <div className="space-y-4">
                                    <h3 className="text-white font-bold text-lg flex items-center gap-2">
                                        <Settings size={18} className="text-synthux-orange" /> Global Library Settings
                                    </h3>
                                    <p className="text-gray-400 text-sm">These metadata values will be attached to all samples added to your Main User Library. This information is used for crediting and licensing when sharing projects.</p>
                                </div>

                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Default Artist / Creator Name</label>
                                        <input
                                            type="text"
                                            value={userLibrary.metadata.artist || ''}
                                            onChange={e => updateMetadata('artist', e.target.value)}
                                            placeholder="e.g., Jonwtr"
                                            className="w-full bg-black/40 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-synthux-orange/50 focus:ring-1 focus:ring-synthux-orange/20 transition-all font-mono text-sm"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Default License Text</label>
                                        <textarea
                                            value={userLibrary.metadata.license || ''}
                                            onChange={e => updateMetadata('license', e.target.value)}
                                            placeholder="e.g., CC-BY 4.0"
                                            rows={5}
                                            className="w-full bg-black/40 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-synthux-orange/50 focus:ring-1 focus:ring-synthux-orange/20 transition-all font-mono text-sm resize-none"
                                        />
                                    </div>
                                </div>

                                <div className="bg-synthux-yellow/10 border border-synthux-yellow/30 rounded-lg p-4 flex gap-4">
                                    <AlertCircle className="text-synthux-yellow shrink-0" size={20} />
                                    <div className="text-sm text-synthux-yellow/90">
                                        <p className="font-bold mb-1">About Licenses</p>
                                        <p className="leading-relaxed">Licenses help other users understand how they can use your shared samples. If you leave this clear, standard copyright applies.</p>
                                    </div>
                                </div>
                            </div>
                        )}

                    </div>

                </div>
            </div>

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
                                <input
                                    value={globalTagInput}
                                    onChange={e => setGlobalTagInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ',') {
                                            e.preventDefault();
                                            if (!globalTagInput.trim()) return;
                                            setGlobalTags(prev => appendTags(prev, globalTagInput));
                                            setGlobalTagInput('');
                                        }
                                    }}
                                    placeholder="Add comma-separated tags and press Enter"
                                    className="flex-1 bg-black/50 border border-gray-700 rounded px-3 py-2 text-sm text-white"
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
                                            <input
                                                value={draft.tagInput}
                                                onChange={e => setPendingUploadDrafts(prev => (prev || []).map(d => d.id === draft.id ? { ...d, tagInput: e.target.value } : d))}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' || e.key === ',') {
                                                        e.preventDefault();
                                                        setPendingUploadDrafts(prev => (prev || []).map(d => {
                                                            if (d.id !== draft.id || !d.tagInput.trim()) return d;
                                                            return { ...d, tags: appendTags(d.tags, d.tagInput), tagInput: '' };
                                                        }));
                                                    }
                                                }}
                                                placeholder="Add tags and press Enter"
                                                className="flex-1 bg-black/50 border border-gray-700 rounded px-3 py-2 text-xs text-white"
                                            />
                                            <button
                                                onClick={() => setPendingUploadDrafts(prev => (prev || []).map(d => {
                                                    if (d.id !== draft.id || !d.tagInput.trim()) return d;
                                                    return { ...d, tags: appendTags(d.tags, d.tagInput), tagInput: '' };
                                                }))}
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
                onEnded={stopPreview}
            />
        </div>
    );
};

interface ProjectFileRowProps {
    file: FileRecord;
    isExpanded: boolean;
    onToggle: () => void;
    onCopy: (file: FileRecord, name?: string) => void;
}

const ProjectFileRow = ({ file, isExpanded, onToggle, onCopy }: ProjectFileRowProps) => {
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
                    onClick={() => onCopy(file, newName)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-synthux-orange text-gray-300 hover:text-white rounded text-xs font-bold transition-all"
                >
                    <Plus size={14} /> Copy to Library
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
                            {/* Option to preview version? */}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
