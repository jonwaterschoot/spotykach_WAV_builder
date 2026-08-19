import React, { useEffect, useRef, useState } from 'react';
import { X, Play, Download, Loader, ChevronRight, Package, Check, HardDrive, AlertTriangle, ExternalLink } from 'lucide-react';
import type { PresetManifestEntry } from '../data/samplePacks';
import { DISCORD_HANDLE, SUBMISSION_GUIDE_URL } from '../data/links';
import { canWriteToSDDirectly, type PresetProgress } from '../utils/presetLoader';
import { SDCardWriteModal, type SDCardWriteStage } from './modals/SDCardWriteModal';
// Static, not lazy: `requestPermission` needs the click's transient activation, and
// awaiting a dynamic import first is exactly how that gets spent.
import { ensureWritable } from '../utils/configFile';

type PresetAction = 'load' | 'sd';

/**
 * Returning a string surfaces it as a warning on the card — e.g. slots left empty.
 *
 * `destination` is the card the user just picked, handed down so the writer doesn't
 * open a second picker of its own (which would land outside the click's activation
 * window and be refused).
 */
type PresetRunner = (
    entry: PresetManifestEntry,
    onProgress: PresetProgress,
    destination?: FileSystemDirectoryHandle,
) => Promise<string | void>;

interface PresetsPanelProps {
    isOpen: boolean;
    onClose: () => void;
    presets: PresetManifestEntry[];
    /**
     * `project` is Studio's modal: a preset can be loaded into the open workspace.
     * `standalone` is the `#/presets` mode — no project exists and none is created,
     * so the card is the only destination.
     */
    mode?: 'standalone' | 'project';
    /** Adopt the preset as the live project. Project mode only. */
    onLoadPreset?: PresetRunner;
    /** Hydrate and write straight to the card — no project, no work folder. */
    onWriteToSD?: PresetRunner;
    /** Overridden to "Build SD ZIP" where the browser has no directory picker. */
    writeLabel?: string;
    /** Sits under the write button, saying where the files are about to land. */
    writeHint?: string;
    /**
     * A card the app already holds — Studio's connected card. Offered as a shortcut
     * on the confirmation step, never written to without a click on it.
     */
    knownCard?: FileSystemDirectoryHandle | null;
    /**
     * The preset the visitor asked for by name — they clicked "use the preset" on a
     * pack in the sample browser. Its card is scrolled to and ringed for a few
     * seconds. Nothing is run: the buttons on the card are still the only way in.
     */
    focusPresetId?: string | null;
}

export const PresetsPanel: React.FC<PresetsPanelProps> = ({
    isOpen,
    onClose,
    presets,
    mode = 'project',
    onLoadPreset,
    onWriteToSD,
    writeLabel = 'To SD card',
    writeHint,
    knownCard,
    focusPresetId,
}) => {
    const [busy, setBusy] = useState<{ id: string; action: PresetAction } | null>(null);
    const [progress, setProgress] = useState<{ msg: string; pct: number } | null>(null);
    const [done, setDone] = useState<{ id: string; action: PresetAction } | null>(null);
    const [warning, setWarning] = useState<{ id: string; msg: string } | null>(null);
    const [errorId, setErrorId] = useState<{ id: string; msg: string } | null>(null);

    /** The card conversation, from the moment "write" is clicked to the moment a root is in hand. */
    const [cardPrompt, setCardPrompt] = useState<{
        entry: PresetManifestEntry;
        stage: SDCardWriteStage;
        handle?: FileSystemDirectoryHandle;
        error?: string | null;
    } | null>(null);

    const isStandalone = mode === 'standalone';

    /**
     * The card that was asked for, ringed until it has been seen.
     *
     * Kept in state rather than read straight from the prop so the ring fades on its
     * own — it is a "here it is", not a selection, and a highlight that never leaves
     * starts reading as one.
     */
    const [highlightId, setHighlightId] = useState<string | null>(focusPresetId ?? null);
    const listRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        setHighlightId(focusPresetId ?? null);
    }, [focusPresetId]);

    useEffect(() => {
        if (!isOpen || !highlightId || presets.length === 0) return;
        listRef.current
            ?.querySelector(`[data-preset-id="${CSS.escape(highlightId)}"]`)
            ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        const timer = setTimeout(() => setHighlightId(null), 6000);
        return () => clearTimeout(timer);
    }, [isOpen, highlightId, presets.length]);

    if (!isOpen) return null;

    const run = async (
        entry: PresetManifestEntry,
        action: PresetAction,
        runner: PresetRunner,
        destination?: FileSystemDirectoryHandle,
    ) => {
        if (busy) return; // one at a time — both actions download the same 36 files
        setBusy({ id: entry.id, action });
        setDone(null);
        setWarning(null);
        setErrorId(null);
        setProgress({ msg: 'Starting…', pct: 0 });

        try {
            const note = await runner(entry, (msg, pct) => setProgress({ msg, pct }), destination);
            setDone({ id: entry.id, action });
            if (note) setWarning({ id: entry.id, msg: note });

            if (action === 'load' && !isStandalone) {
                // Loading swaps the workspace out from under the modal, so get out of the way.
                setTimeout(() => { setDone(null); onClose(); }, 1200);
            } else {
                setTimeout(() => setDone(null), 4000);
            }
        } catch (e) {
            const err = e as { name?: string; message?: string };
            // Dismissing the directory picker isn't a failure worth shouting about.
            if (err?.name !== 'AbortError' && err?.name !== 'NotAllowedError') {
                setErrorId({ id: entry.id, msg: err?.message || 'Failed to load preset' });
            }
        } finally {
            setBusy(null);
            setProgress(null);
        }
    };

    /**
     * The card write, in the only order the browser allows: a click, then the picker,
     * then the download. It used to be download-then-picker, which spent the click's
     * transient activation on the fetch and got the picker refused outright
     * ("Must be handling a user gesture to show a file picker").
     *
     * Where there is no directory picker at all the write is a ZIP download, so
     * there is no card to choose and nothing to warn about — straight through.
     */
    const requestCard = (entry: PresetManifestEntry) => {
        if (!onWriteToSD || busy) return;
        if (!canWriteToSDDirectly()) {
            void run(entry, 'sd', onWriteToSD);
            return;
        }
        setCardPrompt({ entry, stage: 'intro' });
    };

    /**
     * A root is in hand. Look for an `SK/` already on it before writing through one:
     * this runs after the picker, so it costs no activation, and it turns "your set is
     * gone" into a question asked in time.
     */
    const inspectCard = async (entry: PresetManifestEntry, handle: FileSystemDirectoryHandle) => {
        setCardPrompt({ entry, stage: 'checking', handle });

        let hasSK = false;
        try {
            await handle.getDirectoryHandle('SK');
            hasSK = true;
        } catch (e) {
            // NotFoundError is the good case. Anything else — a card that went away, a
            // permission that wasn't granted — is the write's problem to report, not ours.
            const err = e as { name?: string };
            if (err?.name && err.name !== 'NotFoundError' && err.name !== 'TypeMismatchError') {
                setCardPrompt({
                    entry,
                    stage: 'intro',
                    error: err.name === 'NotAllowedError'
                        ? 'The browser didn’t grant write access to that card. Try choosing it again.'
                        : 'That folder couldn’t be read. Try choosing the card again.',
                });
                return;
            }
        }

        if (hasSK) {
            setCardPrompt({ entry, stage: 'existing', handle });
            return;
        }

        setCardPrompt(null);
        if (onWriteToSD) void run(entry, 'sd', onWriteToSD, handle);
    };

    /** Straight out of the click — `showDirectoryPicker` is the first thing awaited. */
    const handlePickCard = async () => {
        const entry = cardPrompt?.entry;
        if (!entry) return;

        let handle: FileSystemDirectoryHandle;
        try {
            handle = await window.showDirectoryPicker({ id: 'spotykach_sd', mode: 'readwrite' });
        } catch (e) {
            const err = e as { name?: string; message?: string };
            // Backing out of the picker is a decision, not a failure — leave the step up.
            if (err?.name === 'AbortError') return;
            setCardPrompt({ entry, stage: 'intro', error: err?.message || 'Could not open the folder picker.' });
            return;
        }
        await inspectCard(entry, handle);
    };

    /** Same, for the card Studio already holds — the permission prompt needs the click too. */
    const handleUseKnownCard = async () => {
        const entry = cardPrompt?.entry;
        if (!entry || !knownCard) return;

        if (!(await ensureWritable(knownCard))) {
            setCardPrompt({
                entry,
                stage: 'intro',
                error: 'Write access to that card wasn’t granted. Choose it again below.',
            });
            return;
        }
        await inspectCard(entry, knownCard);
    };

    const cardModal = onWriteToSD && cardPrompt && (
        <SDCardWriteModal
            isOpen
            presetName={cardPrompt.entry.name}
            knownCard={knownCard}
            stage={cardPrompt.stage}
            chosenCard={cardPrompt.handle}
            error={cardPrompt.error}
            onUseKnownCard={() => { void handleUseKnownCard(); }}
            onPickCard={() => { void handlePickCard(); }}
            onConfirmOverwrite={() => {
                const { entry, handle } = cardPrompt;
                setCardPrompt(null);
                void run(entry, 'sd', onWriteToSD, handle);
            }}
            onCancel={() => setCardPrompt(null)}
        />
    );

    const body = (
        <>
            {/* Header */}
            <header className="flex items-center justify-between px-6 py-5 border-b border-white/10 bg-[#141414] shrink-0">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-violet-500/20 rounded-xl">
                        <Package size={22} className="text-violet-400" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-white">Starter Presets</h2>
                        <p className="text-gray-400 text-sm mt-0.5">
                            {isStandalone
                                ? 'Pick one and write it to your card · No project, no work folder'
                                : 'Curated project presets using built-in sample packs · Samples load from cloud'}
                        </p>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
                >
                    <X size={22} />
                </button>
            </header>

            {/* Info strip */}
            <div className="px-6 py-4 bg-violet-500/5 border-b border-violet-500/10 shrink-0">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="flex gap-3">
                        <Package size={16} className="shrink-0 text-violet-400 mt-0.5" />
                        <div>
                            <p className="text-[11px] font-bold text-violet-200 uppercase tracking-wider mb-0.5">Shared Samples</p>
                            <p className="text-[11px] text-violet-300/70 leading-normal">
                                Uses built-in packs also available in the normal sample browser.
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-3 md:border-l md:border-white/5 md:pl-6">
                        <Download size={16} className="shrink-0 text-violet-400 mt-0.5" />
                        <div>
                            <p className="text-[11px] font-bold text-violet-200 uppercase tracking-wider mb-0.5">Cloud Fetch</p>
                            <p className="text-[11px] text-violet-300/70 leading-normal">
                                {isStandalone
                                    ? 'Audio downloads when you pick a preset. Nothing is kept afterwards.'
                                    : 'Audio fetches from cloud on load and stores locally for full editing.'}
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-3 md:border-l md:border-white/5 md:pl-6">
                        {isStandalone ? (
                            <HardDrive size={16} className="shrink-0 text-violet-400 mt-0.5" />
                        ) : (
                            <Play size={16} className="shrink-0 text-violet-400 mt-0.5" />
                        )}
                        <div>
                            <p className="text-[11px] font-bold text-violet-200 uppercase tracking-wider mb-0.5">
                                {isStandalone ? 'Straight to the Card' : 'Create & Share'}
                            </p>
                            <p className="text-[11px] text-violet-300/70 leading-normal">
                                {isStandalone
                                    ? 'The card is asked for at the moment of writing, never before.'
                                    : 'Save your own projects or share them through the Project Manager.'}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Cards */}
            <div ref={listRef} className="flex-1 overflow-y-auto p-6">
                {presets.length === 0 ? (
                    <div className={`flex flex-col items-center justify-center opacity-40 gap-4 ${isStandalone ? 'py-16' : 'h-full'}`}>
                        <Package size={48} className="text-gray-600" />
                        <p className="text-gray-400">No presets available yet. Check back soon.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {presets.map(entry => {
                            const isBusy = busy?.id === entry.id;
                            const isLoading = isBusy && busy?.action === 'load';
                            const isWriting = isBusy && busy?.action === 'sd';
                            const isLoaded = done?.id === entry.id && done.action === 'load';
                            const isWritten = done?.id === entry.id && done.action === 'sd';
                            const hasError = errorId?.id === entry.id;
                            const hasWarning = warning?.id === entry.id;
                            const isHighlighted = highlightId === entry.id;

                            return (
                                <div
                                    key={entry.id}
                                    data-preset-id={entry.id}
                                    className={`
                                        rounded-xl border overflow-hidden flex flex-col transition-all duration-200
                                        ${isBusy
                                            ? 'border-violet-500/40 shadow-violet-500/10 shadow-lg'
                                            : isHighlighted
                                                ? 'border-violet-400 ring-2 ring-violet-500/40 shadow-lg shadow-violet-500/10'
                                                : 'border-white/8 hover:border-white/15'}
                                        bg-[#161616]
                                    `}
                                >
                                    {/* Cover image */}
                                    {entry.coverImage ? (
                                        <div className="h-36 overflow-hidden bg-black/40 relative shrink-0">
                                            <img
                                                src={entry.coverImage}
                                                alt={entry.name}
                                                crossOrigin="anonymous"
                                                className="w-full h-full object-cover opacity-80"
                                            />
                                            <div className="absolute inset-0 bg-gradient-to-t from-[#161616] via-transparent to-transparent" />
                                        </div>
                                    ) : (
                                        <div className="h-36 bg-gradient-to-br from-violet-900/30 to-indigo-900/30 relative shrink-0 flex items-center justify-center">
                                            <Package size={40} className="text-violet-400/30" />
                                        </div>
                                    )}

                                    {/* Content */}
                                    <div className="flex flex-col flex-1 p-4 gap-3">
                                        <div>
                                            <h3 className="font-bold text-white text-base leading-tight">{entry.name}</h3>
                                            {entry.description && (
                                                <p className="text-gray-400 text-xs mt-1 line-clamp-2 leading-relaxed">{entry.description}</p>
                                            )}
                                        </div>

                                        {/* Pack badges */}
                                        {entry.requiredPacks.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5">
                                                {entry.requiredPacks.map(packId => (
                                                    <span
                                                        key={packId}
                                                        className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-medium"
                                                    >
                                                        {packId}
                                                    </span>
                                                ))}
                                            </div>
                                        )}

                                        {/* Progress */}
                                        {isBusy && progress && (
                                            <div className="space-y-1.5">
                                                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-violet-500 rounded-full transition-all duration-300"
                                                        style={{ width: `${progress.pct}%` }}
                                                    />
                                                </div>
                                                <p className="text-[10px] text-violet-300 truncate">{progress.msg}</p>
                                            </div>
                                        )}

                                        {/* Error */}
                                        {hasError && (
                                            <p className="text-[10px] text-red-400 bg-red-500/10 rounded px-2 py-1">
                                                {errorId!.msg}
                                            </p>
                                        )}

                                        {/* Warning — written, but not everything made it */}
                                        {hasWarning && (
                                            <p className="text-[10px] text-amber-300 bg-amber-500/10 rounded px-2 py-1 flex items-start gap-1.5">
                                                <AlertTriangle size={11} className="shrink-0 mt-px" />
                                                {warning!.msg}
                                            </p>
                                        )}

                                        {/* Buttons */}
                                        <div className="flex gap-2 mt-auto pt-1">
                                            {/* Load into App — needs a workspace, so project mode only */}
                                            {!isStandalone && onLoadPreset && (
                                                <button
                                                    onClick={() => run(entry, 'load', onLoadPreset)}
                                                    disabled={!!busy}
                                                    className={`
                                                        flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold uppercase tracking-wide
                                                        transition-all duration-200
                                                        ${isLoaded
                                                            ? 'bg-green-600 text-white'
                                                            : isLoading
                                                                ? 'bg-violet-600/50 text-violet-300 cursor-wait'
                                                                : 'bg-violet-600 hover:bg-violet-500 text-white shadow-md shadow-violet-500/20'
                                                        }
                                                        disabled:opacity-60 disabled:cursor-not-allowed
                                                    `}
                                                >
                                                    {isLoaded ? (
                                                        <><Check size={12} /> Loaded!</>
                                                    ) : isLoading ? (
                                                        <><Loader size={12} className="animate-spin" /> Loading…</>
                                                    ) : (
                                                        <><Play size={12} fill="currentColor" /> Load into App</>
                                                    )}
                                                </button>
                                            )}

                                            {/* Write to the card — the whole point of the standalone tier */}
                                            {onWriteToSD && (
                                                <button
                                                    onClick={() => requestCard(entry)}
                                                    disabled={!!busy}
                                                    title="Builds the SK/ folder from this preset and writes it to the card"
                                                    className={`
                                                        flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold uppercase tracking-wide
                                                        transition-all duration-200
                                                        ${isWritten
                                                            ? 'bg-green-600 text-white'
                                                            : isWriting
                                                                ? 'bg-synthux-orange/40 text-orange-200 cursor-wait'
                                                                : isStandalone
                                                                    ? 'bg-synthux-orange hover:bg-synthux-orange/80 text-black shadow-md shadow-synthux-orange/20'
                                                                    : 'bg-white/5 hover:bg-white/10 border border-white/10 text-gray-200'
                                                        }
                                                        disabled:opacity-60 disabled:cursor-not-allowed
                                                    `}
                                                >
                                                    {isWritten ? (
                                                        <><Check size={12} /> Written!</>
                                                    ) : isWriting ? (
                                                        <><Loader size={12} className="animate-spin" /> Writing…</>
                                                    ) : (
                                                        <><HardDrive size={12} /> {writeLabel}</>
                                                    )}
                                                </button>
                                            )}

                                            {/* Prebuilt SD-ready ZIP — only when the manifest names one */}
                                            {entry.sdExportUrl && (
                                                <a
                                                    href={entry.sdExportUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    download
                                                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white text-xs font-bold uppercase tracking-wide transition-all duration-200"
                                                    title="Download SD-Ready ZIP (manually built export)"
                                                >
                                                    <Download size={12} />
                                                    <span className="hidden sm:inline">SD ZIP</span>
                                                </a>
                                            )}
                                        </div>

                                        {/* Footer note */}
                                        <p className="text-[9px] text-gray-600 flex items-center gap-1 mt-0.5">
                                            <ChevronRight size={8} />
                                            {writeHint || 'Loads from cloud · No files stored in preset'}
                                            {entry.sdExportUrl && ' · SD ZIP is a direct copy-ready download'}
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/*
                  * Where presets come from — the door never said, and one card in an empty
                  * screen reads like a catalogue that ended rather than one that hasn't
                  * started. A signpost, not a form: authoring a preset needs Studio, and this
                  * tier has no project. Step 0 of docs/presets-samples/submission-workflow.md.
                  */}
                {isStandalone && (
                    <div className="mt-6 rounded-xl border border-white/8 bg-[#141414] px-5 py-4
                        flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-sm font-bold text-gray-200">Want yours here?</p>
                            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                                Presets are projects built in Studio, then sent in over Discord
                                (<span className="text-gray-400">{DISCORD_HANDLE}</span>) or email. Sample packs
                                come from artists the same way.
                            </p>
                        </div>
                        <a
                            href={SUBMISSION_GUIDE_URL}
                            target="_blank"
                            rel="noreferrer"
                            className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-white/10
                                bg-white/5 hover:bg-white/10 text-xs font-bold uppercase tracking-wide text-gray-300
                                hover:text-white transition-colors no-underline"
                        >
                            How to submit <ExternalLink size={12} />
                        </a>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-white/10 bg-[#141414] shrink-0 flex items-center justify-between">
                <span className="text-xs text-gray-500">{presets.length} preset{presets.length !== 1 ? 's' : ''} available</span>
                <button
                    onClick={onClose}
                    className="px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                >
                    {isStandalone ? 'Back to hub' : 'Close'}
                </button>
            </div>
        </>
    );

    // Standalone fills the mode's own shell; project mode keeps the floating modal.
    if (isStandalone) {
        return (
            <div className="h-full w-full flex flex-col bg-[#0e0e0e] overflow-hidden">
                {body}
                {cardModal}
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#0e0e0e] w-full max-w-5xl rounded-2xl border border-white/10 flex flex-col shadow-2xl overflow-hidden h-[90vh]">
                {body}
            </div>
            {cardModal}
        </div>
    );
};
