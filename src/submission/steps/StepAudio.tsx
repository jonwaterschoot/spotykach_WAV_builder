import React, { Suspense, useCallback, useMemo, useRef, useState } from 'react';
import {
    AlertTriangle, FileAudio, FolderOpen, FolderTree, Library, Link2, Loader, Pause, Pencil, Play,
    RotateCcw, Trash2, Upload, X,
} from 'lucide-react';
import { Note, StepHeading, StepPanel, TextInput } from '../ui';
import {
    entriesFromDataTransfer, entriesFromDirectoryHandle, entriesFromInput, intakeAudio,
    intakeDescriptorFile, intakeSubmissionArchive, type IntakeEntry,
} from '../intake';
import {
    duplicateTitleSet, HARDWARE_MAX_SECONDS, issuesForFile, PACK_MAXIMUM_SAMPLES,
    PACK_MINIMUM_SAMPLES,
} from '../validate';
import { asPlayableRecord } from '../player';
import { useAudioPlayer } from '../../contexts/AudioPlayerContext';
import { hashForMode } from '../../shell/useAppMode';
import {
    emptyPreset, isDraftEmpty, isOwnFile, ownFiles, referencedFiles, type SubmissionDraft,
    type SubmissionFile,
} from '../draft';
import { ConfirmModal } from '../../components/ConfirmModal';
import type { StepProps } from './types';

// Both are heavy and neither is needed by a visitor who only drops a folder in: the
// tree browser pulls the folder machinery, the editor pulls wavesurfer and the
// processor. Same lazy split Browse uses for the same two components.
const LocalFolderBrowser = React.lazy(() =>
    import('../../components/LocalFolderBrowser').then(m => ({ default: m.LocalFolderBrowser }))
);
const LooseFileEditor = React.lazy(() =>
    import('../../modes/EditorMode').then(m => ({ default: m.LooseFileEditor }))
);

const formatBytes = (bytes: number): string => {
    if (!bytes) return '—';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit++;
    }
    return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
};

const isDescriptorFile = (file: File) =>
    /\.(json|zip)$/i.test(file.name) && !/\.(wav|flac|mp3)$/i.test(file.name);

const canPickDirectory = () => 'showDirectoryPicker' in window;

/**
 * Step 2 — the audio.
 *
 * Two ways to work, because two kinds of artist arrive here. One has a folder that
 * *is* the pack and wants all of it: they drop it, and the table is the whole job.
 * The other has a drive full of recordings and wants forty of them — that one needs
 * to look before choosing, which is what the folder tree is for. It is the same
 * `LocalFolderBrowser` the Sample Browser uses for local folders, so browsing to
 * build a pack behaves exactly like browsing to build a project.
 *
 * Rows can be auditioned through the app's own transport and opened in the app's own
 * editor. Neither is decoration: nobody should submit a pack they have not listened
 * to, and the commonest fix — a second of silence at the top, a tail that runs long
 * — is one the editor already does.
 *
 * Files are held as dropped. Nothing is re-encoded on the way in — see `intake.ts`.
 */
export const StepAudio: React.FC<StepProps> = ({ draft, update, goToStep, showToast, registerPreview }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const [browseRoot, setBrowseRoot] = useState<{ handle: FileSystemDirectoryHandle; name: string } | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    /** A restored draft waiting on permission to replace work in progress. */
    const [pendingRestore, setPendingRestore] = useState<{ draft: SubmissionDraft; missing: string[] } | null>(null);
    const fileInput = useRef<HTMLInputElement>(null);
    const folderInput = useRef<HTMLInputElement>(null);

    const { isPlaying, activeFileId, play, pause } = useAudioPlayer();

    const duplicates = useMemo(() => duplicateTitleSet(draft.files), [draft.files]);
    // Only the artist's own rows are going anywhere; the borrowed ones are pointers
    // and weigh nothing, so counting them into the size overstated the download.
    const own = useMemo(() => ownFiles(draft), [draft]);
    const borrowed = useMemo(() => referencedFiles(draft), [draft]);
    const totalBytes = own.reduce((sum, file) => sum + file.size, 0);
    const categories = useMemo(
        () => [...new Set(draft.files.map(file => file.category || 'General'))],
        [draft.files],
    );

    const editingItem = draft.files.find(file => file.id === editingId) || null;

    const addEntries = useCallback(async (entries: IntakeEntry[]) => {
        if (entries.length === 0) return;
        setBusy(`Reading ${entries.length} file${entries.length === 1 ? '' : 's'}…`);
        try {
            const { files, rejected } = await intakeAudio(entries, (done, total, name) => {
                setBusy(`Reading ${done + 1} of ${total}${name ? ` — ${name}` : ''}`);
            });

            // Same name and same size is the same file, most often a folder dropped
            // twice. Adding it again would put two identical rows in the table with no
            // way to tell which to delete.
            const existing = new Set(draft.files.map(file => `${file.fileName}:${file.size}`));
            const fresh = files.filter(file => !existing.has(`${file.fileName}:${file.size}`));
            const skipped = files.length - fresh.length;

            update({
                files: [...draft.files, ...fresh],
                rejected: [...draft.rejected, ...rejected],
            });

            const parts = [`${fresh.length} file${fresh.length === 1 ? '' : 's'} added`];
            if (skipped) parts.push(`${skipped} already here`);
            if (rejected.length) parts.push(`${rejected.length} couldn’t be read`);
            showToast(parts.join(' · '), rejected.length ? 'warning' : 'success');
        } catch (e) {
            console.error('[Submit] Intake failed', e);
            showToast(e instanceof Error ? e.message : 'Those files could not be read.', 'error');
        } finally {
            setBusy(null);
        }
    }, [draft.files, draft.rejected, update, showToast]);

    /**
     * Tree paths taken into the pack, so the browser can tick them.
     *
     * The tree marks rows by its own `path`, which is rooted at the folder that was
     * opened — a key the draft has no reason to keep, since the same file dropped
     * from the desktop has no tree path at all. Held for the life of the open folder,
     * which is exactly as long as anything can see it.
     */
    const [addedTreePaths, setAddedTreePaths] = useState<Set<string>>(new Set());

    /** `User_Library/Drones/x.wav` → `Drones/x.wav`. The root is not a category. */
    const withoutRoot = (path: string) => path.split('/').slice(1).join('/') || path;

    const addFromTree = useCallback(async (picked: { file: File; path: string }[]) => {
        await addEntries(picked.map(({ file, path }) => ({ file, relativePath: withoutRoot(path) })));
        setAddedTreePaths(prev => {
            const next = new Set(prev);
            picked.forEach(({ path }) => next.add(path));
            return next;
        });
    }, [addEntries]);

    /** The tree's play button lights from the same transport the rows below use. */
    const previewingPath = activeFileId?.startsWith('preview:') ? activeFileId.slice('preview:'.length) : undefined;

    const applyRestore = useCallback((restored: { draft: SubmissionDraft; missing: string[] }) => {
        // Every field at once, which is the point — this is the draft, not an import
        // into one. `step` comes back too, so the artist lands where they left off.
        update(restored.draft);
        showToast(
            restored.missing.length
                ? `Draft restored. ${restored.missing.length} audio file${restored.missing.length === 1 ? '' : 's'} were not in the archive — add them again.`
                : 'Draft restored from the archive.',
            restored.missing.length ? 'warning' : 'success',
        );
    }, [update, showToast]);

    const addArchive = useCallback(async (file: File) => {
        setBusy('Reading the submission archive…');
        try {
            const restored = await intakeSubmissionArchive(file);
            // Replacing a draft someone is in the middle of is the one destructive
            // thing this step can do, so it asks — unless there is nothing to lose.
            if (isDraftEmpty(draft)) applyRestore(restored);
            else setPendingRestore(restored);
        } catch (e) {
            console.error('[Submit] Archive import failed', e);
            showToast(e instanceof Error ? e.message : 'That archive could not be read.', 'error');
        } finally {
            setBusy(null);
        }
    }, [draft, applyRestore, showToast]);

    const addDescriptor = useCallback(async (file: File) => {
        setBusy('Reading the exported project…');
        try {
            const imported = await intakeDescriptorFile(file);
            update({
                files: [...draft.files, ...imported.files],
                rejected: [...draft.rejected, ...imported.rejected],
                // A project export always describes a layout, so it turns the preset half
                // on: it is the only reason anyone drops one of these in here.
                wants: { ...draft.wants, preset: true },
                // Into the first preset when it is still blank, as its own entry when
                // it is not — dropping a second exported project should give you a
                // second layout, not overwrite the one you were looking at.
                presets: draft.presets[0] && !draft.presets[0].slots.some(Boolean) && !draft.presets[0].name
                    ? [{ ...draft.presets[0], ...imported.preset }, ...draft.presets.slice(1)]
                    : [...draft.presets, { ...emptyPreset(), ...imported.preset }],
            });
            showToast(
                `${imported.filledSlots} slot${imported.filledSlots === 1 ? '' : 's'} read from ${file.name}.`,
                'success',
            );
        } catch (e) {
            console.error('[Submit] Descriptor import failed', e);
            showToast(e instanceof Error ? e.message : 'That file could not be read.', 'error');
        } finally {
            setBusy(null);
        }
    }, [draft, update, showToast]);

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (busy) return;

        const dropped = Array.from(e.dataTransfer?.files || []);
        const descriptor = dropped.find(isDescriptorFile);
        if (descriptor && dropped.length === 1) {
            await takeSingleFile(descriptor);
            return;
        }

        await addEntries(await entriesFromDataTransfer(e.dataTransfer));
    };

    /** Ask for a folder handle once, then either take all of it or browse it. */
    /**
     * One dropped `.zip`/`.json` — three things it could be.
     *
     * A submission archive this tool built (has `submission.json`), a settings-only
     * project export (has `project-descriptor.json`), or neither. Sniffed rather than
     * asked about, because an artist holding a ZIP should not have to know which
     * button it belongs under.
     */
    const takeSingleFile = async (file: File) => {
        if (/\.zip$/i.test(file.name)) {
            const JSZip = (await import('jszip')).default;
            try {
                const zip = await JSZip.loadAsync(file);
                if (zip.file('submission.json')) {
                    await addArchive(file);
                    return;
                }
            } catch {
                // Not readable as a ZIP at all — let the descriptor path report it.
            }
        }
        await addDescriptor(file);
    };

    const pickDirectory = async (): Promise<FileSystemDirectoryHandle | null> => {
        const picker = window as unknown as {
            showDirectoryPicker(options?: { mode?: string; startIn?: string }): Promise<FileSystemDirectoryHandle>;
        };
        try {
            return await picker.showDirectoryPicker({ mode: 'read', startIn: 'music' });
        } catch (e) {
            // An abort is the picker being dismissed, which is not a failure.
            if ((e as DOMException)?.name !== 'AbortError') {
                console.error('[Submit] Folder read failed', e);
                showToast('That folder could not be opened.', 'error');
            }
            return null;
        }
    };

    const takeWholeFolder = async () => {
        if (!canPickDirectory()) {
            folderInput.current?.click();
            return;
        }
        const handle = await pickDirectory();
        if (handle) await addEntries(await entriesFromDirectoryHandle(handle));
    };

    const openFolderTree = async () => {
        const handle = await pickDirectory();
        if (handle) {
            setBrowseRoot({ handle, name: handle.name });
            setAddedTreePaths(new Set());
        }
    };

    const patchFile = (id: string, patch: Partial<SubmissionFile>) => {
        update({ files: draft.files.map(file => (file.id === id ? { ...file, ...patch } : file)) });
    };

    const removeFile = (id: string) => {
        if (activeFileId === id) pause();
        update({
            files: draft.files.filter(file => file.id !== id),
            // A slot pointing at a file that no longer exists renders as an empty slot
            // with a name — clear the reference wherever it is held.
            presets: draft.presets.map(preset => ({
                ...preset,
                slots: preset.slots.map(slot => (slot === id ? null : slot)),
            })),
        });
    };

    const togglePlay = (file: SubmissionFile) => {
        if (!file.blob || file.blob.size === 0) {
            showToast('This row references a published sample, so there is nothing here to play.', 'info');
            return;
        }
        // `play` toggles when handed the file that is already active, so pause and
        // resume both come out of the same call.
        play(asPlayableRecord(file));
    };

    return (
        <StepPanel>
            <StepHeading title={draft.wants.pack ? 'The audio' : 'The samples your preset uses'}>
                {draft.wants.pack
                    ? 'Drop a folder in to take all of it, or browse one and pick. Subfolder names become the categories people filter by, and the titles below are what they will see — play anything, edit anything, rename anything that came out wrong.'
                    : 'A preset points at samples that are already in the app. Drop in an exported project to read its layout, or add audio if some of it is your own.'}
            </StepHeading>

            <div
                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors
                    ${isDragging ? 'border-synthux-green/70 bg-synthux-green/5' : 'border-white/15 bg-synthux-panel/40'}`}
            >
                {busy ? (
                    <div className="flex items-center justify-center gap-3 text-sm text-gray-400">
                        <Loader size={16} className="animate-spin" /> {busy}
                    </div>
                ) : (
                    <>
                        <Upload size={22} className="mx-auto mb-3 text-gray-500" />
                        <p className="text-sm text-gray-300 font-bold">
                            {draft.files.length > 0
                                ? 'Add more — dropping again tops up the list'
                                : <>Drop a folder, an <code className="text-gray-400">SK/</code> folder, some files, or a WAV.builder export</>}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                            {draft.files.length > 0
                                ? 'Nothing here is replaced. Files already in the list are recognised and skipped, so a folder dropped twice does not double up — and you can keep filling slots on step 5 as you go.'
                                : <>Audio stays on your machine. A <code className="text-gray-400">.json</code> or{' '}
                                    <code className="text-gray-400">.zip</code> preset export is read for its layout.</>}
                        </p>
                        {/*
                          * The archive route, spelled out rather than implied.
                          *
                          * It is the difference between a tool you can leave and a tool you
                          * have to finish in one sitting, and a drop zone listing four things
                          * it accepts buries the one that means "carry on where you were".
                          */}
                        <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-synthux-turquoise">
                            <RotateCcw size={12} className="shrink-0" />
                            Dropping a <code>-submission.zip</code> from this tool restores the whole form
                        </p>
                        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                            <button
                                onClick={takeWholeFolder}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold
                                    bg-white/10 hover:bg-white/15 transition-colors"
                            >
                                <FolderOpen size={14} /> Take a whole folder
                            </button>
                            {canPickDirectory() && (
                                <button
                                    onClick={openFolderTree}
                                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold
                                        bg-white/10 hover:bg-white/15 transition-colors"
                                >
                                    <FolderTree size={14} /> Browse and pick
                                </button>
                            )}
                            <button
                                onClick={() => fileInput.current?.click()}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold
                                    text-gray-300 hover:bg-white/5 transition-colors"
                            >
                                <FileAudio size={14} /> Choose files
                            </button>
                        </div>
                    </>
                )}

                <input
                    ref={fileInput}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={async e => {
                        const list = e.target.files;
                        if (!list?.length) return;
                        const descriptor = Array.from(list).find(isDescriptorFile);
                        if (descriptor && list.length === 1) await takeSingleFile(descriptor);
                        else await addEntries(Array.from(list).map(file => ({ file, relativePath: file.name })));
                        e.target.value = '';
                    }}
                />
                <input
                    ref={folderInput}
                    type="file"
                    multiple
                    // Non-standard, and the only folder picker Firefox and Safari have.
                    {...{ webkitdirectory: '', directory: '' } as Record<string, string>}
                    className="hidden"
                    onChange={async e => {
                        if (e.target.files?.length) await addEntries(entriesFromInput(e.target.files));
                        e.target.value = '';
                    }}
                />
            </div>

            {/* The folder tree, when one is open — the Sample Browser's own component. */}
            {browseRoot && (
                <div className="mt-5 rounded-xl border border-white/10 bg-synthux-panel/40 overflow-hidden">
                    <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-white/10">
                        <span className="flex items-center gap-2 min-w-0 text-xs font-bold text-gray-300">
                            <FolderTree size={14} className="shrink-0 text-synthux-orange" />
                            <span className="truncate font-mono">{browseRoot.name}</span>
                        </span>
                        <button
                            onClick={() => { setBrowseRoot(null); setAddedTreePaths(new Set()); }}
                            className="shrink-0 p-1.5 rounded text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
                            title="Close the folder"
                        >
                            <X size={14} />
                        </button>
                    </div>
                    <div className="h-[26rem]">
                        <Suspense fallback={
                            <div className="h-full flex items-center justify-center text-gray-600">
                                <Loader size={18} className="animate-spin" />
                            </div>
                        }>
                            <LocalFolderBrowser
                                rootHandle={browseRoot.handle}
                                rootName={browseRoot.name}
                                mode="import"
                                bulkActionLabel="Add to the pack"
                                addedFileIds={addedTreePaths}
                                playingFileId={previewingPath}
                                isPreviewPlaying={isPlaying}
                                onImport={async (file, path) => { await addFromTree([{ file, path }]); }}
                                onBulkImport={addFromTree}
                                onPreview={(file, name, filePath) => {
                                    // Auditioned before it is chosen, through the same transport and
                                    // the same bar the rows below use — so picking one out of a folder
                                    // and checking one already in the pack are the same act. The
                                    // `preview:` prefix keeps the id out of the draft's namespace,
                                    // where it would light up a row that is not playing.
                                    const record = asPlayableRecord({
                                        id: `preview:${filePath || name}`,
                                        fileName: file.name,
                                        title: name,
                                        category: 'General',
                                        duration: 0,
                                        size: file.size,
                                        blob: file,
                                    });
                                    registerPreview(record);
                                    play(record);
                                }}
                                onCloseFolder={() => { setBrowseRoot(null); setAddedTreePaths(new Set()); }}
                            />
                        </Suspense>
                    </div>
                    <p className="px-4 py-2 border-t border-white/10 text-[11px] text-gray-600 leading-relaxed">
                        Folders here become categories exactly as they do on a whole-folder drop. Nothing is copied
                        anywhere until you add it.
                    </p>
                </div>
            )}

            {/*
              * Failures before the list, not after it.
              *
              * Nine files that didn't make it, reported below a hundred and eleven that
              * did, is a report nobody scrolls to — and the ones that failed are the only
              * ones needing a decision.
              */}
            {/*
              * Where a preset's other half comes from.
              *
              * Samples already in the app cannot be dropped in from a folder - they have
              * to be the published files, or the preset would depend on a second copy of
              * audio everyone already has. Browse's pool is the way in, and it has a
              * button that comes straight back here.
              */}
            {(!draft.wants.pack || draft.wants.preset) && (
                <div className="mt-5 rounded-xl border border-synthux-blue/25 bg-synthux-blue/5 p-4
                    flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-gray-400 leading-relaxed min-w-0">
                        <strong className="text-gray-200">Using samples that are already in the app?</strong>{' '}
                        Collect them in Browse and press <em>Send to the submission tool</em>. They come back as
                        references — your preset points at where they already live, and they are never re-uploaded.
                    </p>
                    <a
                        href={hashForMode('browse')}
                        className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold
                            bg-white/10 hover:bg-white/15 transition-colors no-underline text-white"
                    >
                        <Library size={14} /> Open Browse
                    </a>
                </div>
            )}

            {draft.rejected.length > 0 && (
                <div className="mt-5 rounded-xl border border-synthux-red/25 bg-synthux-red/5 p-4">
                    <div className="flex items-center justify-between gap-3 mb-2">
                        <p className="text-xs font-bold uppercase tracking-widest text-synthux-red">
                            {draft.rejected.length} file{draft.rejected.length === 1 ? '' : 's'} could not be read
                        </p>
                        <button
                            onClick={() => update({ rejected: [] })}
                            className="p-1 rounded text-gray-600 hover:text-white transition-colors"
                            title="Dismiss this list"
                        >
                            <Trash2 size={13} />
                        </button>
                    </div>
                    <ul className="space-y-1.5 text-xs text-gray-400">
                        {draft.rejected.map((entry, i) => (
                            <li key={`${entry.fileName}-${i}`}>
                                <span className="font-mono text-gray-300">{entry.fileName}</span> — {entry.reason}
                            </li>
                        ))}
                    </ul>
                    <p className="mt-3 pt-3 border-t border-synthux-red/15 text-[11px] text-gray-500 leading-relaxed">
                        Left out of the pack, and listed in the submission so the maintainer knows they were meant
                        to be there. Project sidecars and stray non-audio files are safe to ignore.
                    </p>
                </div>
            )}

            {draft.files.length > 0 && (
                <>
                    <div className="mt-6 mb-3 flex flex-wrap items-baseline justify-between gap-3">
                        <p className="text-xs text-gray-400">
                            <span className={
                                draft.wants.pack && own.length > 0 && own.length < PACK_MINIMUM_SAMPLES
                                    ? 'text-synthux-yellow font-bold'
                                    : 'text-white font-bold'
                            }>
                                {own.length}
                            </span>
                            {draft.wants.pack && <span className="text-gray-600">/{PACK_MINIMUM_SAMPLES}</span>} of your own ·{' '}
                            <span className="text-white font-bold">{categories.length}</span> categor
                            {categories.length === 1 ? 'y' : 'ies'} ·{' '}
                            <span className="text-white font-bold">{formatBytes(totalBytes)}</span>
                            {borrowed.length > 0 && (
                                <> · <span className="text-synthux-blue font-bold">{borrowed.length}</span> from
                                    existing packs</>
                            )}
                        </p>
                        <button
                            onClick={() => {
                                pause();
                                update({
                                    files: [],
                                    rejected: [],
                                    presets: draft.presets.map(preset => ({
                                        ...preset,
                                        slots: preset.slots.map(() => null),
                                    })),
                                });
                            }}
                            title="Empties the list and clears the preset slots that pointed at it"

                            className="text-[11px] font-bold uppercase tracking-widest text-gray-600 hover:text-synthux-red transition-colors"
                        >
                            Remove all
                        </button>
                    </div>

                    {/*
                      * The list is the page, not a window onto the page.
                      *
                      * It used to sit in a 26rem scroller, which put a second scrollbar
                      * inside the first and made a hundred files feel like a peephole. The
                      * step scrolls; the list is simply long, which is the truth about it.
                      */}
                    <div className="rounded-xl border border-white/10 overflow-hidden">
                        <div className="flex items-center gap-3 px-3 py-2 bg-synthux-panel
                            text-[10px] font-bold uppercase tracking-widest text-gray-500">
                            <span className="w-8 shrink-0" />
                            <span className="flex-1 min-w-0">Title</span>
                            <span className="w-40 shrink-0">Category</span>
                            <span className="w-16 shrink-0 text-right">Length</span>
                            <span className="w-16 shrink-0" />
                        </div>

                        {draft.files.map(file => {
                            const issues = issuesForFile(file, duplicates);
                            const worst = issues.find(i => i.level === 'error') || issues[0];
                            const isThis = activeFileId === file.id;
                            const isThisPlaying = isThis && isPlaying;
                            const playable = !!file.blob && file.blob.size > 0;

                            return (
                                <div key={file.id} className="border-t border-white/5">
                                    <div className="flex items-start gap-3 px-3 py-2">
                                        <button
                                            onClick={() => togglePlay(file)}
                                            disabled={!playable}
                                            className={`w-8 h-8 shrink-0 mt-0.5 rounded-full flex items-center justify-center
                                                transition-colors disabled:opacity-25 disabled:cursor-not-allowed
                                                ${isThisPlaying
                                                    ? 'bg-synthux-green text-black'
                                                    : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'}`}
                                            title={playable ? (isThisPlaying ? 'Pause' : 'Play') : 'Nothing to play — this row points at a published sample'}
                                        >
                                            {isThisPlaying
                                                ? <Pause size={13} fill="currentColor" />
                                                : <Play size={13} fill="currentColor" />}
                                        </button>

                                        <div className="flex-1 min-w-0">
                                            <TextInput
                                                value={file.title}
                                                onChange={e => patchFile(file.id, { title: e.target.value })}
                                                className="py-1 text-sm"
                                            />
                                            <span className="block mt-1 text-[11px] text-gray-600 font-mono truncate">
                                                {file.fileName}
                                                {file.size > 0 && <span className="ml-2">{formatBytes(file.size)}</span>}
                                            </span>
                                            {!isOwnFile(file) && (
                                                <span className="mt-1 inline-flex items-center gap-1.5 text-[10px] font-bold
                                                    uppercase tracking-widest text-synthux-blue">
                                                    <Link2 size={11} />
                                                    From {file.origin || 'an existing pack'} — referenced, not submitted
                                                </span>
                                            )}
                                            {worst && (
                                                <span
                                                    className={`mt-1 flex items-start gap-1.5 text-[11px] leading-relaxed
                                                        ${worst.level === 'error' ? 'text-synthux-red' : 'text-synthux-yellow'}`}
                                                >
                                                    <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                                                    {worst.detail}
                                                </span>
                                            )}
                                        </div>

                                        <div className="w-40 shrink-0">
                                            <TextInput
                                                value={file.category}
                                                onChange={e => patchFile(file.id, { category: e.target.value })}
                                                className="py-1 text-sm"
                                                list="submit-categories"
                                            />
                                        </div>

                                        <span className="w-16 shrink-0 mt-2 text-right font-mono text-xs text-gray-400">
                                            {file.duration
                                                ? <span className={file.duration > HARDWARE_MAX_SECONDS ? 'text-synthux-yellow' : ''}>
                                                    {file.duration.toFixed(1)}s
                                                </span>
                                                : '—'}
                                        </span>

                                        <span className="w-16 shrink-0 mt-1 flex items-center justify-end gap-0.5">
                                            <button
                                                onClick={() => setEditingId(file.id)}
                                                disabled={!playable || !isOwnFile(file)}
                                                className="p-1.5 rounded text-gray-600 hover:text-synthux-pink hover:bg-white/5
                                                    transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
                                                title={isOwnFile(file) ? 'Trim, fade, EQ or pitch this file' : 'This sample belongs to a published pack, so it is used as it is'}
                                            >
                                                <Pencil size={14} />
                                            </button>
                                            <button
                                                onClick={() => removeFile(file.id)}
                                                className="p-1.5 rounded text-gray-600 hover:text-synthux-red hover:bg-white/5 transition-colors"
                                                title="Remove from the pack"
                                            >
                                                <X size={14} />
                                            </button>
                                        </span>
                                    </div>

                                </div>
                            );
                        })}
                    </div>

                    <datalist id="submit-categories">
                        {categories.map(category => <option key={category} value={category} />)}
                    </datalist>
                </>
            )}

            {draft.wants.pack && own.length > 0 && own.length < PACK_MINIMUM_SAMPLES && (
                <div className="mt-5">
                    <Note tone="warn">
                        <strong>{own.length} sample{own.length === 1 ? '' : 's'} is short for a pack.</strong>{' '}
                        A pack gets its own page in the browser — cover image, bio, links, a licence — and
                        {' '}{PACK_MINIMUM_SAMPLES} is about where that stops looking like a mistake. Add more, or,
                        if these few exist to serve one preset rather than to be browsed,{' '}
                        <button
                            type="button"
                            onClick={() => goToStep(1)}
                            className="underline underline-offset-2 hover:text-white transition-colors"
                        >
                            see the note on step 1
                        </button>{' '}
                        about sharing a preset directly instead of publishing a pack.
                    </Note>
                </div>
            )}

            {draft.wants.pack && own.length > PACK_MAXIMUM_SAMPLES && (
                <div className="mt-5">
                    <Note tone="warn">
                        <strong>{own.length} samples is a large pack.</strong> Nothing stops you sending it, and
                        generous packs are welcome — but past about {PACK_MAXIMUM_SAMPLES} it becomes a page
                        nobody scrolls and a normalization run measured in hours. Worth a word in the notes on
                        the last step about how you would like it categorised, or trimming to the strongest ones.
                    </Note>
                </div>
            )}

            {draft.files.length > 0 && draft.wants.pack && (
                <div className="mt-5">
                    <Note>
                        <strong className="text-gray-200">About formats and length.</strong> Send WAV or FLAC at the
                        best quality you have — 24-bit is ideal, and everything is normalized and converted to FLAC
                        when it is deployed, which is lossless and about half the size. Files longer than{' '}
                        {HARDWARE_MAX_SECONDS} seconds are welcome: the hardware plays the first{' '}
                        {HARDWARE_MAX_SECONDS} of them, and users can choose a different part in the editor.
                    </Note>
                </div>
            )}

            {pendingRestore && (
                <ConfirmModal
                    isOpen
                    title="Replace what you have with this archive?"
                    message="Everything in the current draft — the files, the details, the licence, the preset — is replaced by what is in this archive. Nothing was ever sent anywhere, so there is nothing to withdraw, but this cannot be undone."
                    confirmLabel="Restore it"
                    isDestructive
                    onConfirm={() => { applyRestore(pendingRestore); setPendingRestore(null); }}
                    onClose={() => setPendingRestore(null)}
                />
            )}

            {editingItem && (
                <Suspense fallback={
                    <div className="fixed inset-0 z-[80] bg-synthux-main flex items-center justify-center text-gray-500">
                        <Loader size={20} className="animate-spin" />
                    </div>
                }>
                    <LooseFileEditor
                        // Remount on a different row rather than reusing the editor's state.
                        key={editingItem.id}
                        file={{
                            name: editingItem.title || editingItem.fileName,
                            blob: editingItem.blob,
                            duration: editingItem.duration,
                            origin: editingItem.origin,
                            license: editingItem.license,
                            sourceSamplePath: editingItem.sourceSamplePath,
                        }}
                        subtitle={`Editing ${editingItem.title}. Every applied edit replaces this file in your pack — it is what will be submitted, and what the SK folder is built from.`}
                        onEdited={({ blob, duration, name }) => {
                            // The edit *is* the submission now, so the row takes the new blob
                            // and its new size. The file keeps its name: renaming it here would
                            // break the category folder the maintainer receives.
                            patchFile(editingItem.id, {
                                blob,
                                duration,
                                size: blob.size,
                                title: name || editingItem.title,
                            });
                        }}
                        onClose={() => setEditingId(null)}
                    />
                </Suspense>
            )}
        </StepPanel>
    );
};
