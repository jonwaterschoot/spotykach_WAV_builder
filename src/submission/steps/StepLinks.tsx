import React from 'react';
import { ExternalLink, Plus, X } from 'lucide-react';
import { Field, Note, StepHeading, StepPanel, TextInput } from '../ui';
import { buildLinkEntries, isHandleOnly, LINK_PLATFORMS, normalizeHandle } from '../platforms';
import { newId } from '../draft';
import type { StepProps } from './types';

/**
 * Step 4 — links.
 *
 * The guide asks for full URLs, in a bulleted list, from memory. Nobody knows their
 * own Bandcamp address; everybody knows their name. So each row takes the name and
 * shows the address it becomes, live, underneath — which doubles as the check that
 * it went in the right box.
 *
 * A pasted URL is unwrapped rather than refused. Someone reaching for the address
 * bar has not made a mistake, and telling them so would be the form being pedantic
 * about something it can read perfectly well.
 */
export const StepLinks: React.FC<StepProps> = ({ draft, update }) => {
    const { links } = draft;

    const setHandle = (platformId: string, value: string) => {
        update({ links: { ...links, handles: { ...links.handles, [platformId]: value } } });
    };

    const blurHandle = (platformId: string) => {
        const platform = LINK_PLATFORMS.find(p => p.id === platformId);
        if (!platform) return;
        const normalized = normalizeHandle(platform, links.handles[platformId] || '');
        if (normalized !== links.handles[platformId]) setHandle(platformId, normalized);
    };

    const setCustom = (id: string, patch: { label?: string; url?: string }) => {
        update({
            links: {
                ...links,
                custom: links.custom.map(row => (row.id === id ? { ...row, ...patch } : row)),
            },
        });
    };

    const preview = buildLinkEntries(links.handles, links.website, links.custom);

    return (
        <StepPanel>
            <StepHeading title="Links">
                Just your username — the address is built for you. Everything filled in here shows on your pack’s
                page in the app. All optional, and skipping the lot is fine.
            </StepHeading>

            <Field label="Website" hint="Anything that isn’t on the list below.">
                <TextInput
                    value={links.website}
                    onChange={e => update({ links: { ...links, website: e.target.value } })}
                    placeholder="yourname.com"
                />
            </Field>

            <div className="rounded-xl border border-white/10 divide-y divide-white/5 overflow-hidden mb-5">
                {LINK_PLATFORMS.map(platform => {
                    const value = links.handles[platform.id] || '';
                    const url = value.trim() ? platform.toUrl(value.trim()) : '';
                    return (
                        <div key={platform.id} className="flex items-center gap-3 px-3 py-2.5">
                            <span className="w-24 shrink-0 text-xs font-bold text-gray-400">{platform.label}</span>
                            <div className="flex-1 min-w-0">
                                <TextInput
                                    value={value}
                                    onChange={e => setHandle(platform.id, e.target.value)}
                                    onBlur={() => blurHandle(platform.id)}
                                    placeholder={platform.placeholder}
                                    className="py-1 text-sm"
                                />
                            </div>
                            <span className="hidden sm:block w-56 shrink-0 text-[11px] text-gray-600 font-mono truncate text-right">
                                {url && !isHandleOnly(platform.id) ? url : ''}
                            </span>
                        </div>
                    );
                })}
            </div>

            <div className="mb-5">
                <div className="flex items-baseline justify-between gap-3 mb-2">
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Anything else</span>
                    <button
                        onClick={() => update({
                            links: { ...links, custom: [...links.custom, { id: newId(), label: '', url: '' }] },
                        })}
                        className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest
                            text-gray-500 hover:text-white transition-colors"
                    >
                        <Plus size={12} /> Add a link
                    </button>
                </div>

                {links.custom.length === 0 ? (
                    <p className="text-xs text-gray-600">
                        A label and an address — a Linktree, a label page, a full-pack download.
                    </p>
                ) : (
                    <div className="space-y-2">
                        {links.custom.map(row => (
                            <div key={row.id} className="flex items-center gap-2">
                                <TextInput
                                    value={row.label}
                                    onChange={e => setCustom(row.id, { label: e.target.value })}
                                    placeholder="Label"
                                    className="w-40 shrink-0 py-1 text-sm"
                                />
                                <TextInput
                                    value={row.url}
                                    onChange={e => setCustom(row.id, { url: e.target.value })}
                                    placeholder="https://…"
                                    className="flex-1 min-w-0 py-1 text-sm"
                                />
                                <button
                                    onClick={() => update({
                                        links: { ...links, custom: links.custom.filter(c => c.id !== row.id) },
                                    })}
                                    className="p-1.5 rounded text-gray-600 hover:text-synthux-red hover:bg-white/5 transition-colors"
                                    title="Remove"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {preview.length > 0 && (
                <div className="rounded-xl border border-white/10 bg-synthux-panel/40 p-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">
                        How this will look on your pack
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {preview.map(link => (
                            <span
                                key={`${link.label}-${link.url}`}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/10
                                    bg-black/30 text-xs text-gray-300"
                            >
                                {link.label}
                                <ExternalLink size={11} className="text-gray-600" />
                            </span>
                        ))}
                    </div>
                </div>
            )}

            <div className="mt-5">
                <Note>
                    <strong className="text-gray-200">Discord is for reaching you, not for linking.</strong> It
                    goes in the submission notes so the maintainer can ask you something, and never on a public
                    page.
                </Note>
            </div>
        </StepPanel>
    );
};
