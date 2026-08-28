import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Check, ChevronDown, ChevronRight, ImageIcon, Link2, Sparkles, StickyNote, X,
} from 'lucide-react';
import { COLOR_MAP, TAPE_COLORS } from '../../types';
import { Field, Note, TextArea, TextInput } from '../ui';
import { NotesEditor } from '../../components/NotesEditor';
import { GRID_CAPACITY } from '../../utils/detachedState';
import { isOwnFile, type SubmissionDraft, type SubmissionPreset } from '../draft';
import { requiredPacksFor } from '../outputs';
import { coverWarnings, isImageFile, readCover } from '../intake';
import { presetGradient } from '../../utils/presetGradients';

/** `0 → "B1"` — the label printed on the hardware. */
const slotLabel = (index: number) =>
    `${TAPE_COLORS[Math.floor(index / 6)].charAt(0).toUpperCase()}${(index % 6) + 1}`;

/**
 * The grid's own drag marker.
 *
 * `dragover` can read a DataTransfer's *types* but never its data, so a slot that
 * wants to light up before the drop has only this to go on. Deliberately distinct
 * from Studio's `application/x-spotykach-file-id`: those drags carry a project file
 * id, and a slot here holds a draft row id, which would resolve to nothing.
 */
const SLOT_DRAG_TYPE = 'application/x-spotykach-submission-slot';

interface PresetEditorProps {
    draft: SubmissionDraft;
    onToast?: (message: string, type?: 'error') => void;
    preset: SubmissionPreset;
    onChange: (patch: Partial<SubmissionPreset>) => void;
}

/**
 * One preset: its name, its description, its 36 slots and its notes.
 *
 * Extracted from step 5 when a draft became able to hold several. Everything here is
 * about *this* preset; the licence and the pack it draws on belong to the submission
 * and stay in the step above.
 */
export const PresetEditor: React.FC<PresetEditorProps> = ({ draft, preset, onChange, onToast }) => {
    const [activeSlot, setActiveSlot] = useState<number | null>(null);
    /** Where a slot drag started, and which slot it is currently over. */
    const [dragFrom, setDragFrom] = useState<number | null>(null);
    const [dragOver, setDragOver] = useState<number | null>(null);
    /** Which tape's notes are open. One at a time — six editors at once is a wall. */
    const [openTapeNotes, setOpenTapeNotes] = useState<number | null>(null);
    const [filter, setFilter] = useState('');

    const filesById = useMemo(
        () => new Map(draft.files.map(file => [file.id, file])),
        [draft.files],
    );

    const assigned = useMemo(
        () => new Set(preset.slots.filter((id): id is string => !!id)),
        [preset.slots],
    );

    const candidates = useMemo(() => {
        const needle = filter.trim().toLowerCase();
        return draft.files.filter(file => !needle || file.title.toLowerCase().includes(needle));
    }, [draft.files, filter]);

    const setSlot = (index: number, fileId: string | null) => {
        const slots = [...preset.slots];
        slots[index] = fileId;
        onChange({ slots });
    };

    /**
     * Drag a slot onto another — the same rules the grids in Studio follow.
     *
     * Onto an empty slot it moves and leaves the source empty; onto a filled one the
     * two swap, so nothing is ever destroyed by a drag. Holding Ctrl or Alt copies
     * instead, which is how the same sound ends up under two fingers — a normal thing
     * to want on this device and, in the picker, four clicks away.
     */
    const moveSlot = (from: number, to: number, copy: boolean) => {
        if (from === to) return;
        const slots = [...preset.slots];
        const moving = slots[from];
        if (!moving) return;

        if (copy) {
            slots[to] = moving;
        } else {
            slots[to] = moving;
            slots[from] = preset.slots[to] ?? null;
        }
        onChange({ slots });
    };

    const setTapeNote = (tapeIndex: number, value: string) => {
        const tapeNotes = [...preset.tapeNotes];
        tapeNotes[tapeIndex] = value || undefined;
        onChange({ tapeNotes });
    };

    /** Fill the empty slots in list order — Blue 1-6, Green 1-6, and so on. */
    const autoFill = () => {
        const queue = draft.files.filter(file => !assigned.has(file.id)).map(file => file.id);
        onChange({ slots: preset.slots.map(slot => slot || queue.shift() || null) });
        setActiveSlot(null);
    };

    const coverInput = useRef<HTMLInputElement>(null);

    /**
     * What the card will actually show, and why.
     *
     * `pack` is only ever the cover of the pack *in this submission* — a preset built
     * on packs already in the app is not given their artwork, because an image is a
     * credit as much as a decoration. With neither, the door draws a gradient keyed to
     * this preset's id.
     */
    const packCover = draft.wants.pack ? draft.details.cover : undefined;
    const coverSource: 'own' | 'pack' | 'none' =
        preset.cover ? 'own' : (preset.coverFollowsPack && packCover ? 'pack' : 'none');
    const shownCover = coverSource === 'own' ? preset.cover : coverSource === 'pack' ? packCover : undefined;

    /**
     * The preview URL, created and revoked as one unit.
     *
     * State and an effect, not `useMemo` — and deliberately so. A memo that mints the
     * URL is only computed when its deps change, but the effect that revokes it runs
     * on *every* mount, and `StrictMode` mounts twice: create, mount, revoke, mount
     * again with the memo not recomputed. The `<img>` is then pointing at a URL that
     * no longer resolves, which is a dev-only `ERR_FILE_NOT_FOUND` and a blank frame
     * where the artwork should be.
     *
     * Creating and revoking in the same effect makes the pair inseparable: the second
     * mount makes a fresh URL, and nothing outlives its own cleanup. This is the case
     * the "no setState in an effect" rule is meant to allow — an external system with
     * a lifetime of its own, subscribed to and unsubscribed from.
     */
    const [coverUrl, setCoverUrl] = useState<string | null>(null);
    /* eslint-disable react-hooks/set-state-in-effect -- see the note above */
    useEffect(() => {
        if (!shownCover) {
            setCoverUrl(null);
            return;
        }
        const url = URL.createObjectURL(shownCover.blob);
        setCoverUrl(url);
        return () => {
            URL.revokeObjectURL(url);
            setCoverUrl(null);
        };
    }, [shownCover]);
    /* eslint-enable react-hooks/set-state-in-effect */

    const takeCover = async (file: File) => {
        if (!isImageFile(file)) {
            onToast?.('That doesn’t look like an image.', 'error');
            return;
        }
        try {
            onChange({ cover: await readCover(file), coverFollowsPack: false });
        } catch (e) {
            onToast?.(e instanceof Error ? e.message : 'That image could not be read.', 'error');
        }
    };

    const gradient = presetGradient(preset.id);
    const coverIssues = preset.cover ? coverWarnings(preset.cover) : [];

    const requiredPacks = requiredPacksFor(draft, preset);

    /**
     * What the description box shows.
     *
     * Mirrored rather than copied into the draft on a timer: the pack description is
     * still being written on step 3, and a value snapshotted the first time this
     * rendered would quietly go stale. `presetDescriptionFor` reads the same fallback,
     * so what is shown is what is submitted.
     */
    const packDescription = draft.details.shortDescription.trim();
    const shownDescription =
        preset.descriptionFollowsPack && !preset.description ? packDescription : preset.description;

    const borrowedInSlots = preset.slots.some(id => {
        const file = id ? filesById.get(id) : undefined;
        return file && !isOwnFile(file);
    });

    return (
        <div>
            <Field label="Preset name" required>
                <TextInput
                    value={preset.name}
                    onChange={e => onChange({ name: e.target.value })}
                    placeholder="Tape Ruins"
                />
            </Field>

            {/*
              * Defaults to the pack's own description, and says so.
              *
              * A preset built on a pack is usually described by the same sentence, and
              * asking for it a second time gets either a paste or a blank. It follows
              * until the first edit, the same way the pack id follows the pack name —
              * and "use the pack's words" puts it back.
              */}
            <Field
                label="Preset description"
                hint={
                    shownDescription === packDescription && packDescription
                        ? 'Taken from your pack description. Type here if the preset needs its own words.'
                        : 'What it is for, or what it sounds like. One or two sentences.'
                }
                aside={
                    !preset.descriptionFollowsPack && packDescription && shownDescription !== packDescription ? (
                        <button
                            type="button"
                            onClick={() => onChange({ description: '', descriptionFollowsPack: true })}
                            className="text-[11px] font-bold uppercase tracking-widest text-gray-500
                                hover:text-white transition-colors"
                        >
                            Use the pack’s words
                        </button>
                    ) : undefined
                }
            >
                <TextArea
                    value={shownDescription}
                    onChange={e => onChange({ description: e.target.value, descriptionFollowsPack: false })}
                    rows={2}
                    placeholder={packDescription ? undefined : 'Slow tape loops, laid out darkest to brightest.'}
                />
            </Field>

            {/*
              * Artwork, in three levels: this preset's own, the submitted pack's, or a
              * gradient. Never a published pack's — see `presetCoverPath`.
              */}
            <div className="mb-5">
                <span className="block mb-1.5 text-xs font-bold uppercase tracking-widest text-gray-400">
                    Preset image
                </span>

                <div
                    onDragOver={e => e.preventDefault()}
                    onDrop={async e => {
                        e.preventDefault();
                        const file = e.dataTransfer.files?.[0];
                        if (file) await takeCover(file);
                    }}
                    className="rounded-xl border border-white/10 overflow-hidden bg-black/30"
                >
                    <div className="relative h-32">
                        {coverUrl ? (
                            <img src={coverUrl} alt="" className="w-full h-full object-cover opacity-90" />
                        ) : (
                            <div className={`w-full h-full bg-gradient-to-br ${gradient} flex items-center justify-center`}>
                                <ImageIcon size={26} className="text-white/25" />
                            </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                        <span className="absolute bottom-2 left-3 text-[10px] font-bold uppercase tracking-widest text-white/80">
                            {coverSource === 'own' && 'This preset’s own image'}
                            {coverSource === 'pack' && 'Your pack’s cover'}
                            {coverSource === 'none' && 'A gradient, unique to this preset'}
                        </span>
                    </div>

                    <div className="px-3 py-2 flex flex-wrap items-center gap-2">
                        <button
                            onClick={() => coverInput.current?.click()}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/10 hover:bg-white/15 transition-colors"
                        >
                            {preset.cover ? 'Replace image' : 'Use a different image'}
                        </button>

                        {preset.cover && (
                            <button
                                onClick={() => onChange({ cover: undefined, coverFollowsPack: !!packCover })}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold text-gray-400
                                    hover:text-white transition-colors"
                            >
                                {packCover ? 'Back to the pack’s cover' : 'Remove'}
                            </button>
                        )}

                        {!preset.cover && packCover && (
                            <button
                                onClick={() => onChange({ coverFollowsPack: !preset.coverFollowsPack })}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold text-gray-400
                                    hover:text-white transition-colors"
                            >
                                {preset.coverFollowsPack ? 'Use a gradient instead' : 'Use the pack’s cover'}
                            </button>
                        )}

                        <span className="ml-auto text-[11px] text-gray-600 font-mono truncate">
                            {preset.cover
                                ? `${preset.cover.width}×${preset.cover.height}`
                                : coverSource === 'pack' ? 'shared with the pack' : ''}
                        </span>
                    </div>
                </div>

                <input
                    ref={coverInput}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async e => {
                        const file = e.target.files?.[0];
                        if (file) await takeCover(file);
                        e.target.value = '';
                    }}
                />

                <span className="block mt-1.5 text-xs text-gray-500 leading-relaxed">
                    {coverSource === 'pack'
                        ? 'Taken from your pack. Give this preset its own image if it should look different in the list.'
                        : coverSource === 'none' && !packCover && draft.wants.pack
                            ? 'Add a cover on step 3 and it will be used here too, or drop an image for this preset alone.'
                            : 'Landscape, 1200×800 or larger. Presets built on packs already in the app never borrow their artwork — that image belongs to whoever made it.'}
                </span>

                {coverIssues.length > 0 && (
                    <div className="mt-3 space-y-2">
                        {coverIssues.map(warning => <Note key={warning} tone="warn">{warning}</Note>)}
                    </div>
                )}
            </div>

            {draft.files.length === 0 ? (
                <Note tone="warn">
                    There are no samples to place. Go back to step 2 and add your audio, or drop in an
                    exported project to read its layout.
                </Note>
            ) : (
                <>
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                        <span className="text-xs text-gray-400">
                            <span className="text-white font-bold">{assigned.size}</span> of {GRID_CAPACITY} slots filled
                        </span>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={autoFill}
                                className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest
                                    text-gray-400 hover:text-white transition-colors"
                            >
                                <Sparkles size={12} /> Fill the empties
                            </button>
                            <button
                                onClick={() => onChange({ slots: preset.slots.map(() => null) })}
                                className="text-[11px] font-bold uppercase tracking-widest text-gray-600
                                    hover:text-synthux-red transition-colors"
                            >
                                Clear
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-6 gap-1.5">
                        {TAPE_COLORS.map((color, tapeIndex) => (
                            <React.Fragment key={color}>
                                {Array.from({ length: 6 }, (_, slotIndex) => {
                                    const index = tapeIndex * 6 + slotIndex;
                                    const fileId = preset.slots[index];
                                    const file = fileId ? filesById.get(fileId) : undefined;
                                    const isActive = activeSlot === index;
                                    const isDropTarget = dragOver === index && dragFrom !== null && dragFrom !== index;
                                    const isSource = dragFrom === index;
                                    return (
                                        <button
                                            key={index}
                                            onClick={() => setActiveSlot(isActive ? null : index)}
                                            // Only a filled slot has anything to drag. An empty one is still a
                                            // drop target, which is how a sample is moved out of a full tape.
                                            draggable={!!file}
                                            onDragStart={e => {
                                                if (!file) {
                                                    e.preventDefault();
                                                    return;
                                                }
                                                setDragFrom(index);
                                                e.dataTransfer.setData(SLOT_DRAG_TYPE, String(index));
                                                // Some browsers refuse to start a drag with no text payload.
                                                e.dataTransfer.setData('text/plain', file.title);
                                                e.dataTransfer.effectAllowed = 'copyMove';
                                            }}
                                            onDragEnd={() => { setDragFrom(null); setDragOver(null); }}
                                            onDragOver={e => {
                                                if (dragFrom === null) return;
                                                e.preventDefault();
                                                e.dataTransfer.dropEffect = e.ctrlKey || e.altKey ? 'copy' : 'move';
                                                if (dragOver !== index) setDragOver(index);
                                            }}
                                            onDragLeave={e => {
                                                // Children raise this too; ignore anything still inside the slot.
                                                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                                                    setDragOver(current => (current === index ? null : current));
                                                }
                                            }}
                                            onDrop={e => {
                                                e.preventDefault();
                                                const raw = e.dataTransfer.getData(SLOT_DRAG_TYPE);
                                                const from = raw ? Number(raw) : dragFrom;
                                                if (from !== null && Number.isInteger(from)) {
                                                    moveSlot(from, index, e.ctrlKey || e.altKey);
                                                }
                                                setDragFrom(null);
                                                setDragOver(null);
                                            }}
                                            className={`group relative h-16 rounded-lg border px-1.5 py-1 text-left overflow-hidden
                                                transition-colors
                                                ${isSource ? 'opacity-40' : ''}
                                                ${isDropTarget
                                                    ? 'border-synthux-green/70 bg-synthux-green/10'
                                                    : isActive
                                                        ? 'border-white/60 bg-white/[0.06]'
                                                        : file
                                                            ? 'border-white/15 bg-synthux-panel hover:border-white/35 cursor-grab active:cursor-grabbing'
                                                            : 'border-white/5 bg-black/20 hover:border-white/20'}`}
                                            title={file
                                                ? `${file.title} — drag to move, or drop on another slot to swap`
                                                : `${slotLabel(index)} — empty`}
                                        >
                                            <span className="flex items-center gap-1">
                                                <span className={`w-1.5 h-1.5 rounded-full ${COLOR_MAP[color]}`} />
                                                <span className="text-[9px] font-bold text-gray-500 font-mono">
                                                    {slotLabel(index)}
                                                </span>
                                            </span>
                                            <span className="mt-1 block text-[10px] leading-tight text-gray-300 line-clamp-2">
                                                {file ? file.title : ''}
                                            </span>
                                            {file && !isOwnFile(file) && (
                                                <Link2
                                                    size={9}
                                                    className="absolute bottom-1 right-1 text-synthux-blue"
                                                    aria-label={`From ${file.origin || 'an existing pack'}`}
                                                />
                                            )}
                                            {file && (
                                                <span
                                                    role="button"
                                                    tabIndex={-1}
                                                    onClick={e => { e.stopPropagation(); setSlot(index, null); }}
                                                    className="absolute top-0.5 right-0.5 p-0.5 rounded text-gray-600
                                                        opacity-0 group-hover:opacity-100 hover:text-synthux-red transition-opacity"
                                                >
                                                    <X size={10} />
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </React.Fragment>
                        ))}
                    </div>

                    {activeSlot !== null && (
                        <div className="mt-4 rounded-xl border border-white/15 bg-synthux-panel/60 p-3">
                            <div className="flex items-center gap-3 mb-3">
                                <span className="text-xs font-bold uppercase tracking-widest text-gray-400">
                                    Slot {slotLabel(activeSlot)}
                                </span>
                                <TextInput
                                    value={filter}
                                    onChange={e => setFilter(e.target.value)}
                                    placeholder="Find a sample…"
                                    className="flex-1 py-1 text-sm"
                                    autoFocus
                                />
                                <button
                                    onClick={() => setActiveSlot(null)}
                                    className="p-1.5 rounded text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
                                >
                                    <X size={14} />
                                </button>
                            </div>

                            <div className="max-h-56 overflow-y-auto divide-y divide-white/5">
                                {candidates.map(file => {
                                    const isHere = preset.slots[activeSlot] === file.id;
                                    const elsewhere = !isHere && assigned.has(file.id);
                                    return (
                                        <button
                                            key={file.id}
                                            onClick={() => {
                                                setSlot(activeSlot, isHere ? null : file.id);
                                                if (!isHere) setActiveSlot(null);
                                            }}
                                            className="w-full flex items-center gap-3 px-2 py-2 text-left text-sm
                                                hover:bg-white/5 transition-colors"
                                        >
                                            <span className="w-4 shrink-0 text-synthux-green">
                                                {isHere && <Check size={13} />}
                                            </span>
                                            <span className="flex-1 min-w-0 truncate text-gray-200">{file.title}</span>
                                            {!isOwnFile(file) && (
                                                <Link2 size={11} className="shrink-0 text-synthux-blue" />
                                            )}
                                            {elsewhere && (
                                                <span className="text-[10px] uppercase tracking-widest text-gray-600 shrink-0">
                                                    already placed
                                                </span>
                                            )}
                                            <span className="text-[11px] font-mono text-gray-600 shrink-0">
                                                {file.duration ? `${file.duration.toFixed(1)}s` : ''}
                                            </span>
                                        </button>
                                    );
                                })}
                                {candidates.length === 0 && (
                                    <p className="px-2 py-3 text-xs text-gray-600">Nothing matches that.</p>
                                )}
                            </div>
                        </div>
                    )}

                    <p className="mt-3 text-[11px] text-gray-600 leading-relaxed">
                        Drag a slot to move it. Dropping on a filled slot swaps the two; hold{' '}
                        <kbd className="px-1 py-0.5 rounded bg-white/10 text-gray-400 font-mono text-[10px]">Ctrl</kbd>{' '}
                        to copy instead, so one sound can sit under two fingers.
                    </p>

                    {borrowedInSlots && (
                        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-gray-500">
                            <Link2 size={11} className="text-synthux-blue" />
                            Slots marked like this use samples already published in the app. They are referenced
                            where they live, not re-submitted.
                        </p>
                    )}

                    {/*
                      * Notes, here rather than only in Studio.
                      *
                      * A preset is a layout *and* what the artist has to say about it — which
                      * tape is which, what to reach for, how it was meant to be played. Both
                      * halves have always been part of the format and both survived a Studio
                      * handoff, but an artist who never opened Studio had no way to write
                      * either. Same editor the project view uses, so what is typed here
                      * renders there.
                      */}
                    <div className="mt-8 pt-6 border-t border-white/5">
                        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-400 mb-1.5">
                            <StickyNote size={13} /> Notes
                        </p>
                        <p className="text-xs text-gray-500 leading-relaxed mb-4">
                            Optional, and the part people remember. These travel with the preset and show up in
                            the project when someone loads it.
                        </p>

                        <div className="mb-4">
                            <span className="block mb-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-500">
                                About the whole preset
                            </span>
                            <NotesEditor
                                value={preset.projectNotes}
                                onChange={value => onChange({ projectNotes: value })}
                                minHeight="120px"
                                placeholder="What this is, how it is meant to be played, what to try first…"
                            />
                        </div>

                        <span className="block mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-500">
                            Per tape
                        </span>
                        <div className="rounded-xl border border-white/10 divide-y divide-white/5 overflow-hidden">
                            {TAPE_COLORS.map((color, tapeIndex) => {
                                const note = preset.tapeNotes[tapeIndex] || '';
                                const isOpen = openTapeNotes === tapeIndex;
                                const filled = preset.slots
                                    .slice(tapeIndex * 6, tapeIndex * 6 + 6)
                                    .filter(Boolean).length;
                                return (
                                    <div key={color}>
                                        <button
                                            onClick={() => setOpenTapeNotes(isOpen ? null : tapeIndex)}
                                            className="w-full flex items-center gap-3 px-3 py-2.5 text-left
                                                hover:bg-white/[0.03] transition-colors"
                                        >
                                            {isOpen
                                                ? <ChevronDown size={13} className="shrink-0 text-gray-500" />
                                                : <ChevronRight size={13} className="shrink-0 text-gray-600" />}
                                            <span className={`w-2 h-2 rounded-full shrink-0 ${COLOR_MAP[color]}`} />
                                            <span className="text-sm text-gray-300 flex-1 min-w-0">{color}</span>
                                            <span className="text-[11px] font-mono text-gray-600 shrink-0">{filled}/6</span>
                                            <span className="w-16 shrink-0 text-right text-[10px] font-bold uppercase tracking-widest">
                                                {note.trim()
                                                    ? <span className="text-synthux-green">written</span>
                                                    : <span className="text-gray-700">empty</span>}
                                            </span>
                                        </button>
                                        {isOpen && (
                                            <div className="px-3 pb-3">
                                                <NotesEditor
                                                    value={note}
                                                    onChange={value => setTapeNote(tapeIndex, value)}
                                                    minHeight="100px"
                                                    initialEdit={!note.trim()}
                                                    placeholder={`What is on the ${color} tape, and what it is for…`}
                                                />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {requiredPacks.length > 0 && (
                        <p className="mt-4 text-xs text-gray-500">
                            Needs {requiredPacks.length === 1 ? 'the pack' : 'the packs'}{' '}
                            {requiredPacks.map(pack => (
                                <code key={pack} className="text-gray-300 mx-0.5">{pack}</code>
                            ))}
                            — worked out from the samples you placed, and written into the submission for you.
                        </p>
                    )}
                </>
            )}
        </div>
    );
};
