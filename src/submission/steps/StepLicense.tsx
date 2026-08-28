import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { ChoiceCard, Field, Note, StepHeading, StepPanel, TextArea } from '../ui';
import { ACCENTS } from '../accents';
import { LICENSE_CHOICES } from '../licenses';
import { emptyPreset, type SubmissionPreset } from '../draft';
import { GRID_CAPACITY } from '../../utils/detachedState';
import { PresetEditor } from './PresetEditor';
import type { StepProps } from './types';

/**
 * Step 5 — the licence, and the presets if any were asked for.
 *
 * These share a step because both are decisions rather than data entry, and because
 * a preset-only submission would otherwise have a step with one radio group in it.
 *
 * The licence is a menu, not a text box: "free to use" typed into a box reads as
 * permission and settles nothing about resale, attribution or commercial work, and
 * the person who eventually has to know is a stranger downloading a sample two years
 * from now.
 *
 * Presets are a *list* because one pack can carry several layouts — the artist's own
 * arrangement, and one that mixes in packs already in the app — and the expensive
 * half of a submission is the audio, which they share. Making that two submissions
 * would ship the same audio twice.
 */
export const StepLicense: React.FC<StepProps> = ({ draft, update, showToast }) => {
    const { license, presets, wants } = draft;

    /** Which preset is unfolded. One at a time: each is a whole screen of controls. */
    const [openId, setOpenId] = useState<string | null>(() => presets[0]?.id ?? null);
    const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

    const patchPreset = (id: string, patch: Partial<SubmissionPreset>) => {
        update({ presets: presets.map(preset => (preset.id === id ? { ...preset, ...patch } : preset)) });
    };

    const addPreset = () => {
        const preset = emptyPreset();
        update({ presets: [...presets, preset] });
        setOpenId(preset.id);
    };

    const removePreset = (id: string) => {
        // The list never empties: with none left there is nothing to draw and nothing
        // to press "add" on, so the last one is replaced by a blank rather than removed.
        const remaining = presets.filter(preset => preset.id !== id);
        const next = remaining.length ? remaining : [emptyPreset()];
        update({
            presets: next,
            sdPresetId: draft.sdPresetId === id ? undefined : draft.sdPresetId,
        });
        setOpenId(next[0].id);
        setConfirmRemove(null);
    };

    return (
        <StepPanel>
            <StepHeading title={wants.preset ? 'Licence and presets' : 'Licence'}>
                {wants.pack
                    ? 'How people may use your samples, said once and clearly, so nobody has to guess.'
                    : 'The terms under which this preset is shared.'}
            </StepHeading>

            <div className="space-y-2 mb-5" role="radiogroup" aria-label="Licence">
                {LICENSE_CHOICES.map(choice => (
                    <ChoiceCard
                        key={choice.id}
                        kind="radio"
                        checked={license.choice === choice.id}
                        onChange={() => update({ license: { ...license, choice: choice.id } })}
                        title={choice.label}
                        accent={ACCENTS.green}
                    >
                        {choice.summary}
                    </ChoiceCard>
                ))}
            </div>

            {license.choice === 'custom' && (
                <Field
                    label="Your terms"
                    required
                    hint="Write it as you want it read on the pack’s page. One or two sentences is plenty."
                >
                    <TextArea
                        value={license.custom}
                        onChange={e => update({ license: { ...license, custom: e.target.value } })}
                        rows={3}
                        placeholder="Free to use in your music. No resale as samples, and no AI training."
                    />
                </Field>
            )}

            {wants.preset && (
                <div className="mt-10 pt-8 border-t border-white/10">
                    <StepHeading title={presets.length > 1 ? 'The presets' : 'The preset'}>
                        Which sample sits in which slot, and what to say about it. Empty slots are allowed — they
                        arrive on the card empty. One pack can carry several layouts, and they all travel in the
                        same submission.
                    </StepHeading>

                    <div className="space-y-3">
                        {presets.map((preset, index) => {
                            const isOpen = openId === preset.id;
                            const filled = preset.slots.filter(Boolean).length;
                            const shown = preset.name.trim() || `Preset ${index + 1}`;

                            return (
                                <div
                                    key={preset.id}
                                    className={`rounded-xl border overflow-hidden transition-colors
                                        ${isOpen ? 'border-white/20 bg-synthux-panel/40' : 'border-white/10'}`}
                                >
                                    <div className="flex items-center gap-2 pr-2">
                                        <button
                                            onClick={() => setOpenId(isOpen ? null : preset.id)}
                                            className="flex-1 min-w-0 flex items-center gap-3 px-3 py-3 text-left
                                                hover:bg-white/[0.03] transition-colors"
                                        >
                                            {isOpen
                                                ? <ChevronDown size={14} className="shrink-0 text-gray-500" />
                                                : <ChevronRight size={14} className="shrink-0 text-gray-600" />}
                                            <span className={`flex-1 min-w-0 truncate text-sm ${
                                                preset.name.trim() ? 'text-white font-bold' : 'text-gray-500 italic'
                                            }`}>
                                                {shown}
                                            </span>
                                            <span className={`shrink-0 text-[11px] font-mono ${
                                                filled === 0 ? 'text-gray-700' : 'text-gray-500'
                                            }`}>
                                                {filled}/{GRID_CAPACITY}
                                            </span>
                                        </button>

                                        {(presets.length > 1 || filled > 0 || preset.name.trim()) && (
                                            <button
                                                onClick={() => setConfirmRemove(preset.id)}
                                                className="shrink-0 p-2 rounded text-gray-600 hover:text-synthux-red
                                                    hover:bg-white/5 transition-colors"
                                                title="Remove this preset"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>

                                    {confirmRemove === preset.id && (
                                        <div className="px-3 pb-3 flex flex-wrap items-center gap-3">
                                            <span className="text-xs text-gray-400">
                                                Remove <strong className="text-gray-200">{shown}</strong>? The samples
                                                stay in your pack; only this layout goes.
                                            </span>
                                            <span className="flex gap-2 ml-auto">
                                                <button
                                                    onClick={() => removePreset(preset.id)}
                                                    className="px-3 py-1.5 rounded-lg text-xs font-bold
                                                        bg-synthux-red/15 border border-synthux-red/40 text-synthux-red
                                                        hover:bg-synthux-red/25 transition-colors"
                                                >
                                                    Remove
                                                </button>
                                                <button
                                                    onClick={() => setConfirmRemove(null)}
                                                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-gray-400
                                                        hover:text-white transition-colors"
                                                >
                                                    Keep it
                                                </button>
                                            </span>
                                        </div>
                                    )}

                                    {isOpen && (
                                        <div className="px-4 pb-4 pt-1 border-t border-white/5">
                                            <PresetEditor
                                                draft={draft}
                                                preset={preset}
                                                onChange={patch => patchPreset(preset.id, patch)}
                                                onToast={showToast}
                                            />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    <button
                        onClick={addPreset}
                        className="mt-3 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold
                            text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                    >
                        <Plus size={13} /> Add another preset
                    </button>

                    {presets.length > 1 && (
                        <div className="mt-5">
                            <Note>
                                All {presets.length} travel in one submission, over the same pack, so the audio is
                                sent once. Give them names people can tell apart: each is published separately and
                                works out for itself which packs it needs.
                            </Note>
                        </div>
                    )}
                </div>
            )}
        </StepPanel>
    );
};
