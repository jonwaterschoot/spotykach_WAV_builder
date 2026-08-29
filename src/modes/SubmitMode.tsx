import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, BookOpen, Check, ChevronLeft, ChevronRight, Loader, Trash2 } from 'lucide-react';
import { useEscapeLayer } from '../shell/escapeStack';
import { useToasts } from '../shell/useToasts';
import { Toast } from '../components/Toast';
import { ConfirmModal } from '../components/ConfirmModal';
import { GlobalPlayerBar } from '../components/GlobalPlayerBar';
import { useAudioPlayer } from '../contexts/AudioPlayerContext';
import { takeSubmissionHandoffFromDB } from '../utils/persistence';
import {
    discardDraft, emptyDraft, isDraftEmpty, loadDraft, saveDraft, slugify,
    type SubmissionDraft,
} from '../submission/draft';
import type { FileRecord } from '../types';
import { releaseIntakeResources } from '../submission/intake';
import { asPlayableRecord } from '../submission/player';
import { loadPackLookup, needsPackId, resolvePackIds } from '../submission/packLookup';
import { stepStates } from '../submission/validate';
import { applyHandoff, type SubmissionHandoff } from '../submission/handoff';
import { StepKind } from '../submission/steps/StepKind';
import { StepAudio } from '../submission/steps/StepAudio';
import { StepDetails } from '../submission/steps/StepDetails';
import { StepLinks } from '../submission/steps/StepLinks';
import { StepLicense } from '../submission/steps/StepLicense';
import { StepReview } from '../submission/steps/StepReview';

// The written guide, which is the help modal's third tab. Lazy because it is the
// longest component in the app and this tool is usable without ever opening it.
const AboutHelpModal = React.lazy(() =>
    import('../components/AboutHelpModal').then(m => ({ default: m.AboutHelpModal })),
);

/** How long a keystroke waits before the draft is written back. */
const DRAFT_SAVE_DEBOUNCE_MS = 800;

const STEP_COUNT = 6;

interface SubmitModeProps {
    onExitToHub: () => void;
}

/**
 * Tier 6 — the submission tool at `#/submit`.
 *
 * A form, and nothing more ambitious than that. No account, no upload, no backend:
 * it collects what a sample pack or a preset submission needs, checks it while the
 * author is still here to fix it, and hands back a few kilobytes of JSON and
 * Markdown to attach to a message. The audio never leaves the machine — the artist
 * sends that by link, as they always did.
 *
 * It replaces a 175-line guide that asked people to copy a template into a message
 * and fill it in from memory. Everything that template asked for is a field here,
 * asked at the moment it makes sense, with the answer checked.
 *
 * The one piece of state that outlives the visit is the draft, in IndexedDB.
 * Filling this in takes ten minutes and carries blobs; losing it to a closed tab
 * would be the tool's worst possible failure, so it is written on a debounce from
 * the first keystroke.
 */
export const SubmitMode: React.FC<SubmitModeProps> = ({ onExitToHub }) => {
    const [draft, setDraft] = useState<SubmissionDraft>(emptyDraft);
    const [isLoaded, setIsLoaded] = useState(false);
    const [showDiscard, setShowDiscard] = useState(false);
    /**
     * The written guide, open over the form.
     *
     * The tool explains each step as you reach it, which is the right way round for
     * filling one in and no use at all for the question people actually arrive with:
     * what is being asked of me before I start. That answer was only ever in Studio's
     * help modal, behind the one door this tool exists so you don't have to open.
     */
    const [showGuide, setShowGuide] = useState(false);
    const { toasts, showToast, removeToast } = useToasts();
    const { activeFileId, lastActiveFileId, pause } = useAudioPlayer();

    /**
     * The one file playing that the draft has never heard of - a row in a folder
     * being auditioned before it is picked. Set by step 2, cleared when it moves on.
     */
    const [previewRecord, setPreviewRecord] = useState<FileRecord | null>(null);

    const draftRef = useRef(draft);
    draftRef.current = draft;
    const saveTimer = useRef<number | null>(null);

    // ──────────────────────────────────────────────────────────────────────────
    // The draft: read once, written on a debounce
    // ──────────────────────────────────────────────────────────────────────────

    useEffect(() => {
        let cancelled = false;

        (async () => {
            const [stored, handoff] = await Promise.all([
                loadDraft(),
                takeSubmissionHandoffFromDB<SubmissionHandoff>(),
            ]);
            if (cancelled) return;

            const base = stored || emptyDraft();

            if (handoff) {
                // A parcel from Studio or Browse. It fills an empty draft outright; over
                // work in progress it adds its files and leaves every typed field alone,
                // because the alternative is a hash change quietly eating ten minutes of
                // someone's afternoon.
                const merged = applyHandoff(base, handoff);
                setDraft(merged);
                showToast(
                    stored && !isDraftEmpty(base)
                        ? `${handoff.files.length} file${handoff.files.length === 1 ? '' : 's'} added to your draft.`
                        : `${handoff.files.length} file${handoff.files.length === 1 ? '' : 's'} brought in from ${handoff.source === 'pool' ? 'the pool' : 'your project'}.`,
                    'success',
                );
            } else {
                setDraft(base);
                if (stored && !isDraftEmpty(stored)) {
                    showToast('Picked up where you left off.', 'info');
                }
            }

            setIsLoaded(true);
        })().catch(e => {
            console.warn('[Submit] Could not read the draft', e);
            if (!cancelled) setIsLoaded(true);
        });

        return () => { cancelled = true; };
        // Runs once. `showToast` is stable, but listing it would re-run this on any
        // identity change and re-import the handoff that has already been consumed.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!isLoaded) return;
        if (saveTimer.current) window.clearTimeout(saveTimer.current);
        saveTimer.current = window.setTimeout(() => {
            saveDraft(draftRef.current).catch(e => console.warn('[Submit] Could not save the draft', e));
        }, DRAFT_SAVE_DEBOUNCE_MS);
        return () => {
            if (saveTimer.current) window.clearTimeout(saveTimer.current);
        };
    }, [draft, isLoaded]);

    /**
     * Work out which published pack each borrowed sample belongs to.
     *
     * Rows arrive from Browse's pool knowing their pack only by its display name,
     * which is the right thing for a credit and the wrong thing for `requiredPacks`.
     * The manifest is the only place the two are tied together, so it is fetched once
     * and every row with a `sourceSamplePath` gets its id filled in.
     *
     * Keyed on the file list rather than run at mount, because rows also arrive
     * *later* — a handoff from Browse, a restored archive, a dropped project export —
     * and a draft repaired only at mount would leave every one of those wrong.
     * `resolvePackIds` returns the same array when it changes nothing, so a settled
     * draft costs one comparison and no render.
     */
    const resolvingRef = useRef(false);
    useEffect(() => {
        if (!isLoaded || resolvingRef.current) return;
        if (!draft.files.some(needsPackId)) return;

        resolvingRef.current = true;
        loadPackLookup()
            .then(lookup => {
                setDraft(prev => {
                    const files = resolvePackIds(prev.files, lookup);
                    return files === prev.files ? prev : { ...prev, files };
                });
            })
            .catch(e => console.warn('[Submit] Could not resolve pack ids', e))
            // Released either way: a second attempt is worth having when new rows
            // arrive, and a manifest that is unreachable now may not be in a minute.
            .finally(() => { resolvingRef.current = false; });
    }, [draft.files, isLoaded]);

    // A pending debounce dies with the component, so flush on the way out — leaving
    // the last 800ms of typing behind is exactly the loss the draft store exists to
    // prevent. The decode context goes too; nothing else in the app shares it.
    useEffect(() => () => {
        if (saveTimer.current) window.clearTimeout(saveTimer.current);
        saveDraft(draftRef.current).catch(() => { /* the tab is going away anyway */ });
        releaseIntakeResources();
        // The transport is the app's, shared with every other mode. A sample left
        // running would follow the visitor to the hub with nothing on screen to stop
        // it. `pause` is stable on the provider, so this runs once, on the way out.
        pause();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /**
     * Everything the transport might be playing, in the shape the bar reads.
     *
     * `asPlayableRecord` wraps rather than copies - the blob is passed by reference -
     * so rebuilding this for a hundred rows costs a hundred small objects and no
     * audio. Memoised on the file list all the same, because it is rebuilt on every
     * keystroke in every other field otherwise.
     */
    const playerFiles = useMemo(() => {
        const records: Record<string, FileRecord> = {};
        draft.files.forEach(file => { records[file.id] = asPlayableRecord(file); });
        if (previewRecord) records[previewRecord.id] = previewRecord;
        return records;
    }, [draft.files, previewRecord]);

    // The bar appears once there is something to name and stays, so the transport
    // does not jump the page around between plays. `lastActiveFileId` is what keeps
    // it there after a file ends.
    const showPlayer = !!(activeFileId || lastActiveFileId) &&
        !!playerFiles[(activeFileId || lastActiveFileId) as string];

    // ──────────────────────────────────────────────────────────────────────────
    // Navigation
    // ──────────────────────────────────────────────────────────────────────────

    const update = useCallback((patch: Partial<SubmissionDraft>) => {
        setDraft(prev => ({ ...prev, ...patch }));
    }, []);

    const goToStep = useCallback((step: number) => {
        setDraft(prev => ({ ...prev, step: Math.min(STEP_COUNT, Math.max(1, step)) }));
        // The rail can be taller than the panel beside it; a jump that leaves the
        // reader halfway down the previous step reads as nothing having happened.
        document.getElementById('submit-scroll')?.scrollTo({ top: 0 });
    }, []);

    // The confirm modal and the guide both have their own Escape listener; the layer
    // here is what makes the tool itself leave for the hub, which is what every other
    // mode does. It stands down while either is open, so Escape closes the thing on
    // top rather than walking out of a half-filled form behind it.
    useEscapeLayer(!showDiscard && !showGuide, () => {
        onExitToHub();
        return true;
    });

    const handleDiscard = async () => {
        await discardDraft();
        setDraft(emptyDraft());
        setShowDiscard(false);
        showToast('Draft cleared.', 'info');
    };

    // What each step's mark means — content, not position. See `stepStates`.
    const states = stepStates(draft);

    // The pack half is off for a preset-only submission, and step 2 changes with it.
    const stepLabels = [
        'What you’re sending',
        draft.wants.pack ? 'The audio' : 'The slots',
        draft.wants.pack ? 'Pack details' : 'Your details',
        'Links',
        draft.wants.preset ? 'Licence & preset' : 'Licence',
        'Review & send',
    ];

    if (!isLoaded) {
        return (
            <div className="h-screen w-full flex items-center justify-center bg-synthux-main text-gray-500">
                <Loader size={20} className="animate-spin" />
            </div>
        );
    }

    const stepProps = {
        draft, update, goToStep, showToast,
        registerPreview: setPreviewRecord,
        openGuide: () => setShowGuide(true),
    };

    return (
        <div className="h-screen w-full flex flex-col bg-synthux-main text-white overflow-hidden font-sans">

            {/* Mode bar — the same shape every other door wears */}
            <div className="shrink-0 flex items-center justify-between gap-4 px-4 py-2 border-b border-white/10 bg-synthux-panel">
                <button
                    onClick={onExitToHub}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-bold uppercase tracking-widest
                        text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                >
                    <ChevronLeft size={14} /> Hub
                </button>

                <div className="min-w-0 text-center">
                    <span className="text-xs font-bold uppercase tracking-[0.2em] text-synthux-blue">Submit</span>
                    <span className="hidden md:inline text-[11px] text-gray-500 ml-3">
                        Nothing is uploaded — this builds files for you to send.
                    </span>
                </div>

                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setShowGuide(true)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-bold uppercase tracking-widest
                            text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                        title="The written guide — what to have ready, and what happens after you send"
                    >
                        <BookOpen size={14} />
                        <span className="hidden sm:inline">Guide</span>
                    </button>

                    <button
                        onClick={() => setShowDiscard(true)}
                        disabled={isDraftEmpty(draft)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-bold uppercase tracking-widest
                            text-gray-500 hover:text-synthux-red hover:bg-white/5 transition-colors
                            disabled:opacity-30 disabled:hover:text-gray-500 disabled:hover:bg-transparent"
                        title="Clear this draft"
                    >
                        <Trash2 size={14} />
                        <span className="hidden sm:inline">Clear</span>
                    </button>
                </div>
            </div>

            <div className="flex-1 min-h-0 flex">

                {/* The rail. Hidden on a phone, where six steps of chrome would cost
                    more room than they navigate — the footer's Back/Next is enough. */}
                <nav className="hidden md:flex shrink-0 w-60 flex-col gap-1 border-r border-white/10 bg-synthux-panel/40 p-3 overflow-y-auto">
                    {stepLabels.map((label, index) => {
                        const step = index + 1;
                        const isCurrent = draft.step === step;
                        const state = states[step];
                        return (
                            <button
                                key={label}
                                onClick={() => goToStep(step)}
                                title={state === 'missing' ? 'Something this step needs is still missing' : undefined}
                                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors
                                    ${isCurrent
                                        ? 'bg-white/[0.06] text-white font-bold'
                                        : 'text-gray-400 hover:text-white hover:bg-white/[0.03]'}`}
                            >
                                <span
                                    className={`shrink-0 w-5 h-5 rounded-full border flex items-center justify-center text-[10px] font-bold
                                        ${state === 'done'
                                            ? 'border-synthux-green/60 text-synthux-green'
                                            : state === 'missing'
                                                ? 'border-synthux-yellow/60 text-synthux-yellow'
                                                : isCurrent
                                                    ? 'border-synthux-blue text-synthux-blue'
                                                    : 'border-white/20 text-gray-600'}`}
                                >
                                    {state === 'done'
                                        ? <Check size={11} />
                                        : state === 'missing'
                                            ? <AlertCircle size={11} />
                                            : step}
                                </span>
                                <span className="min-w-0 truncate">{label}</span>
                            </button>
                        );
                    })}
                </nav>

                <div id="submit-scroll" className="flex-1 min-w-0 overflow-y-auto">
                    <div className="px-5 sm:px-8 py-6 sm:py-8">

                        <p className="md:hidden mb-4 text-[10px] font-bold uppercase tracking-widest text-gray-600">
                            Step {draft.step} of {STEP_COUNT} · {stepLabels[draft.step - 1]}
                        </p>

                        {draft.step === 1 && <StepKind {...stepProps} />}
                        {draft.step === 2 && <StepAudio {...stepProps} />}
                        {draft.step === 3 && <StepDetails {...stepProps} />}
                        {draft.step === 4 && <StepLinks {...stepProps} />}
                        {draft.step === 5 && <StepLicense {...stepProps} />}
                        {draft.step === 6 && <StepReview {...stepProps} />}
                    </div>

                    {/*
                      * One bar, for every kind of audition.
                      *
                      * There were two before: an inline scrubber under whichever row was
                      * playing, and nothing at all for a file previewed out of the folder
                      * tree. Both play through the same single transport, so the split was
                      * only ever in the drawing of it - and the tree's preview, the loudest
                      * thing on screen, was the half with no controls.
                      */}
                    {showPlayer && (
                        <div className="sticky bottom-[3.25rem] z-10 px-5 sm:px-8 pb-2">
                            <GlobalPlayerBar files={playerFiles} />
                        </div>
                    )}

                    <div className="sticky bottom-0 border-t border-white/10 bg-synthux-main/95 backdrop-blur px-5 sm:px-8 py-3
                        flex items-center justify-between gap-4">
                        <button
                            onClick={() => goToStep(draft.step - 1)}
                            disabled={draft.step === 1}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-gray-400
                                hover:text-white hover:bg-white/5 transition-colors disabled:opacity-30
                                disabled:hover:bg-transparent disabled:hover:text-gray-400"
                        >
                            <ChevronLeft size={16} /> Back
                        </button>

                        <span className="hidden sm:block text-[11px] text-gray-600 font-mono truncate">
                            {draft.details.id || slugify(draft.details.name) || ''}
                        </span>

                        <button
                            onClick={() => goToStep(draft.step + 1)}
                            disabled={draft.step === STEP_COUNT}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold
                                bg-white/10 hover:bg-white/15 transition-colors disabled:opacity-30
                                disabled:hover:bg-white/10"
                        >
                            Next <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
            </div>

            {showDiscard && (
                <ConfirmModal
                    isOpen
                    title="Clear this draft?"
                    message="Everything typed here, and every file brought in, is deleted from this browser. There is no undo — and nothing was ever sent anywhere, so there is nothing to withdraw."
                    confirmLabel="Clear it"
                    onConfirm={handleDiscard}
                    onClose={() => setShowDiscard(false)}
                    isDestructive
                />
            )}

            {showGuide && (
                <Suspense fallback={null}>
                    <AboutHelpModal initialTab="contribute" onClose={() => setShowGuide(false)} />
                </Suspense>
            )}

            <Toast toasts={toasts} onRemove={removeToast} />
        </div>
    );
};

export default SubmitMode;
