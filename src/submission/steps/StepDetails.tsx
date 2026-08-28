import React, { useEffect, useRef, useState } from 'react';
import { ImageIcon, X } from 'lucide-react';
import { Field, Note, StepHeading, StepPanel, TextArea, TextInput } from '../ui';
import { coverWarnings, isImageFile, readCover } from '../intake';
import { slugify } from '../draft';
import type { StepProps } from './types';

/**
 * Step 3 — who you are, and what this is.
 *
 * The fields the guide listed under "Pack Metadata Required", asked as fields. The
 * one piece of real machinery is the id: it is a path in the bucket and a key in
 * `manifest.json`, it has to be a slug, and asking an artist for "a slug" gets
 * blank looks. So it follows the name until someone edits it, and then it stops.
 */
export const StepDetails: React.FC<StepProps> = ({ draft, update, showToast }) => {
    const { details, wants } = draft;
    const coverInput = useRef<HTMLInputElement>(null);

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
        if (!details.cover) {
            setCoverUrl(null);
            return;
        }
        const url = URL.createObjectURL(details.cover.blob);
        setCoverUrl(url);
        return () => {
            URL.revokeObjectURL(url);
            setCoverUrl(null);
        };
    }, [details.cover]);
    /* eslint-enable react-hooks/set-state-in-effect */

    const set = (patch: Partial<typeof details>) => update({ details: { ...details, ...patch } });

    const setName = (name: string) => {
        set({ name, ...(details.idFollowsName ? { id: slugify(name) } : {}) });
    };

    const setId = (raw: string) => {
        // Typed by hand from here on. Slugged anyway, because what goes in the bucket
        // has to be a slug whether or not it was typed like one.
        set({ id: slugify(raw), idFollowsName: false });
    };

    const takeCover = async (file: File) => {
        if (!isImageFile(file)) {
            showToast('That doesn’t look like an image.', 'error');
            return;
        }
        try {
            set({ cover: await readCover(file) });
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'That image could not be read.', 'error');
        }
    };

    const warnings = details.cover ? coverWarnings(details.cover) : [];

    return (
        <StepPanel>
            <StepHeading title={wants.pack ? 'Pack details' : 'Your details'}>
                {wants.pack
                    ? 'This is what people read on the pack’s card and in its info panel before they listen to anything.'
                    : 'Who made this preset, and what it is. Shown beside it in the preset list.'}
            </StepHeading>

            <Field label="Artist name or moniker" required>
                <TextInput
                    value={details.artist}
                    onChange={e => set({ artist: e.target.value })}
                    placeholder="How you want to be credited"
                />
            </Field>

            {wants.pack && (
                <>
                    <Field
                        label="Pack name"
                        required
                        aside={details.id ? `id: ${details.id}` : undefined}
                    >
                        <TextInput
                            value={details.name}
                            onChange={e => setName(e.target.value)}
                            placeholder="Dust & Tape Loops"
                        />
                    </Field>

                    <Field
                        label="Pack id"
                        required
                        hint="Used for the folder, the file paths and the entry in the app’s catalogue. Letters, numbers and hyphens only. It follows the name until you change it."
                    >
                        <TextInput
                            value={details.id}
                            onChange={e => setId(e.target.value)}
                            placeholder="dust-tape-loops"
                            className="font-mono"
                        />
                    </Field>
                </>
            )}

            <Field
                label="Short description"
                required
                aside={`${details.shortDescription.trim().length} chars`}
                hint="One or two sentences. This is the line on the catalogue card, so it is the first thing anyone reads."
            >
                <TextArea
                    value={details.shortDescription}
                    onChange={e => set({ shortDescription: e.target.value })}
                    rows={2}
                    placeholder="Tape loops recorded to a broken Nagra and left in the sun."
                />
            </Field>

            <Field
                label="Full description"
                hint="Shown in the info panel when someone opens the pack. The gear you used, the vibe, how to get the most out of these sounds — as long as you like."
            >
                <TextArea
                    value={details.fullDescription}
                    onChange={e => set({ fullDescription: e.target.value })}
                    rows={7}
                    placeholder="Tell people about it."
                />
            </Field>

            {wants.pack && (
                <div className="mb-5">
                    <span className="block mb-1.5 text-xs font-bold uppercase tracking-widest text-gray-400">
                        Cover image
                    </span>

                    {details.cover ? (
                        <div className="rounded-xl border border-white/10 overflow-hidden bg-black/30">
                            {coverUrl && (
                                <div className="relative">
                                    <img
                                        src={coverUrl}
                                        alt=""
                                        className="w-full aspect-[3/1] object-cover"
                                    />
                                    <button
                                        onClick={() => set({ cover: undefined })}
                                        className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/70 text-gray-300
                                            hover:text-white hover:bg-black transition-colors"
                                        title="Remove the cover"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            )}
                            <div className="px-3 py-2 flex items-baseline justify-between gap-3">
                                <span className="text-xs text-gray-400 font-mono truncate">{details.cover.fileName}</span>
                                <span className="text-[11px] text-gray-600 font-mono shrink-0">
                                    {details.cover.width}×{details.cover.height}
                                </span>
                            </div>
                        </div>
                    ) : (
                        <div
                            onDragOver={e => e.preventDefault()}
                            onDrop={async e => {
                                e.preventDefault();
                                const file = e.dataTransfer.files?.[0];
                                if (file) await takeCover(file);
                            }}
                            className="rounded-xl border-2 border-dashed border-white/15 bg-synthux-panel/40 p-6 text-center"
                        >
                            <ImageIcon size={20} className="mx-auto mb-2 text-gray-500" />
                            <p className="text-sm text-gray-300">Drop an image, or</p>
                            <button
                                onClick={() => coverInput.current?.click()}
                                className="mt-2 px-3 py-1.5 rounded-lg text-xs font-bold bg-white/10 hover:bg-white/15 transition-colors"
                            >
                                Choose one
                            </button>
                        </div>
                    )}

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
                        Landscape, 1200×800 or larger. It runs across the top of the pack’s page as a wide banner,
                        so anything portrait gets cropped to a strip.
                    </span>

                    {warnings.length > 0 && (
                        <div className="mt-3 space-y-2">
                            {warnings.map(warning => <Note key={warning} tone="warn">{warning}</Note>)}
                        </div>
                    )}
                </div>
            )}
        </StepPanel>
    );
};
