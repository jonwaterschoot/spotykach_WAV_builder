import React, { useMemo, useState } from 'react';
import {
    AlertTriangle, Check, Copy, Download, HardDrive, Loader, MessageCircle, Package,
} from 'lucide-react';
import { Field, Note, StepHeading, StepPanel, TextArea } from '../ui';
import { DISCORD_HANDLE, submissionEmail, submissionMailto } from '../../data/links';
import { requirementsFor } from '../validate';
import { ownFiles, referencedFiles, sdPresetFor } from '../draft';
import { presetIdsFor, submittablePresets } from '../outputs';
import { downloadBlob } from '../outputs';
import { buildSDState, sdSlotCount } from '../sdExport';
import { archiveNameFor, buildSubmissionArchive } from '../packZip';
import type { StepProps } from './types';

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

/**
 * Step 6 — review, download, send.
 *
 * The checklist is the part that earns the tool. A submission that arrives missing
 * its licence costs a round trip over Discord, and the guide's answer to that was a
 * checkbox in a template that nobody ticked honestly. Here what is missing is
 * *known*, named, and one click from the field that fixes it.
 *
 * Warnings never block. An artist who wants to send a pack without a cover image is
 * making a choice, and the maintainer would rather have the pack.
 */
export const StepReview: React.FC<StepProps> = ({ draft, update, goToStep, showToast }) => {
    const [busy, setBusy] = useState<string | null>(null);
    const [sdProgress, setSdProgress] = useState<string | null>(null);
    const [hasDownloaded, setHasDownloaded] = useState(false);

    const requirements = useMemo(() => requirementsFor(draft), [draft]);
    const missing = requirements.filter(r => r.required && !r.ok);
    const warnings = requirements.filter(r => !r.required && !r.ok);

    // Only the artist's own rows travel; the borrowed ones are references and weigh
    // nothing. Sizing the download off `draft.files` overstated it by whatever came
    // from Browse's pool.
    const own = useMemo(() => ownFiles(draft), [draft]);
    const borrowed = useMemo(() => referencedFiles(draft), [draft]);
    const totalBytes = own.reduce((sum, file) => sum + file.size, 0);
    const nothingToSend = !draft.wants.pack && !draft.wants.preset;

    const presets = useMemo(() => submittablePresets(draft), [draft]);
    const presetIds = useMemo(() => presetIdsFor(draft), [draft]);
    const sdPreset = sdPresetFor(draft);

    const subject = `Spotykach submission — ${draft.details.name.trim() || presets[0]?.name.trim() || 'new pack'}`;

    const downloadSubmission = async () => {
        setBusy('Preparing…');
        try {
            const { blob, fileName, count } = await buildSubmissionArchive(draft, message => setBusy(message));
            downloadBlob(blob, fileName);
            setHasDownloaded(true);
            showToast(
                count > 0
                    ? `${fileName} — ${count} audio file${count === 1 ? '' : 's'} and the details.`
                    : `${fileName} downloaded.`,
                'success',
            );
        } catch (e) {
            console.error('[Submit] Could not build the submission', e);
            // A browser builds a ZIP in memory, so a very large pack can genuinely run
            // out of room. Saying which failure it was saves the artist retrying it.
            showToast(
                e instanceof Error && /quota|memory|allocation/i.test(e.message)
                    ? 'That archive was too large for this browser to hold in memory. Zip the folder from your drive instead and send it with the details.'
                    : 'That could not be built.',
                'error',
            );
        } finally {
            setBusy(null);
        }
    };

    const downloadSDFolder = async () => {
        setSdProgress('Preparing…');
        try {
            const { state, missing } = await buildSDState(draft, message => setSdProgress(message));
            const { exportSDStructure } = await import('../../utils/exportUtils');
            await exportSDStructure(
                state,
                {
                    skMode: 'overwrite',
                    directWrite: false,
                    includeProject: false,
                    // A submitting artist has no device settings to express here, and a
                    // defaults config.txt on the card would quietly replace theirs.
                    includeConfig: false,
                    projectName: draft.details.name.trim() || sdPreset?.name.trim() || 'Spotykach',
                },
                message => { if (message) setSdProgress(message); },
            );
            showToast(
                missing.length
                    ? `SK folder downloaded, but ${missing.length} sample${missing.length === 1 ? '' : 's'} could not be fetched: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''}. Those slots are empty.`
                    : 'SK folder downloaded — unzip it onto your card.',
                missing.length ? 'warning' : 'success',
            );
        } catch (e) {
            console.error('[Submit] Could not build the SK folder', e);
            showToast(e instanceof Error ? e.message : 'The SK folder could not be built.', 'error');
        } finally {
            setSdProgress(null);
        }
    };

    const copyEmail = async () => {
        try {
            await navigator.clipboard.writeText(submissionEmail());
            showToast('Address copied.', 'success');
        } catch {
            showToast('Copying failed — the address is on screen.', 'warning');
        }
    };

    return (
        <StepPanel>
            <StepHeading title="Review and send">
                Everything below is built here in your browser. Nothing has been uploaded, and nothing will be.
            </StepHeading>

            {/* The checklist */}
            <div className="rounded-xl border border-white/10 divide-y divide-white/5 overflow-hidden mb-6">
                {requirements.map(requirement => (
                    <div key={requirement.id} className="flex items-start gap-3 px-4 py-3">
                        <span className="mt-0.5 shrink-0">
                            {requirement.ok
                                ? <Check size={15} className="text-synthux-green" />
                                : <AlertTriangle size={15} className={requirement.required ? 'text-synthux-red' : 'text-synthux-yellow'} />}
                        </span>
                        <div className="flex-1 min-w-0">
                            <p className={`text-sm ${requirement.ok ? 'text-gray-400' : 'text-white font-bold'}`}>
                                {requirement.label}
                                {!requirement.required && !requirement.ok && (
                                    <span className="ml-2 text-[10px] font-bold uppercase tracking-widest text-gray-600">
                                        optional
                                    </span>
                                )}
                            </p>
                            {!requirement.ok && requirement.hint && (
                                <p className="mt-0.5 text-xs text-gray-500 leading-relaxed">{requirement.hint}</p>
                            )}
                        </div>
                        {!requirement.ok && (
                            <button
                                onClick={() => goToStep(requirement.step)}
                                className="shrink-0 text-[11px] font-bold uppercase tracking-widest text-gray-500
                                    hover:text-white transition-colors"
                            >
                                Fix
                            </button>
                        )}
                    </div>
                ))}
            </div>

            <Field
                label="Anything to tell the maintainer"
                hint="Goes into the submission as-is. Where the sounds came from, what you would like the pack called if the name is taken, anything unusual about the files."
            >
                <TextArea
                    value={draft.notes}
                    onChange={e => update({ notes: e.target.value })}
                    rows={3}
                    placeholder="Optional."
                />
            </Field>

            {/* The downloads */}
            <div className="space-y-3 mb-6">
                {!nothingToSend && (
                    <div className="rounded-xl border border-synthux-green/30 bg-synthux-green/5 p-4">
                        <div className="flex items-start gap-3">
                            <Package size={20} className="shrink-0 mt-0.5 text-synthux-green" />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold">Your submission</p>
                                <p className="mt-1 text-xs text-gray-400 leading-relaxed">
                                    One archive with everything in it: the details, the file list, the licence
                                    {presets.length === 1 && `, the preset (${presetIds.get(presets[0].id)}.json)`}
                                    {presets.length > 1 && `, ${presets.length} presets under presets/`}
                                    {draft.details.cover && ', your cover image'}
                                    {own.length > 0 && `, and all ${own.length} audio file${own.length === 1 ? '' : 's'} under audio/ with your categories as folders`}.
                                    {own.length > 0 && ' The audio goes in exactly as you gave it, so the maintainer normalizes from your masters.'}
                                </p>

                                {borrowed.length > 0 && (
                                    <p className="mt-2 text-xs text-gray-500 leading-relaxed">
                                        The {borrowed.length} sample{borrowed.length === 1 ? '' : 's'} you reused from
                                        packs already in the app {borrowed.length === 1 ? 'is' : 'are'} listed but not
                                        included — your preset points at where they already live.
                                    </p>
                                )}

                                {/*
                                  * The naming choice sits on the download rather than on step 2: it is a
                                  * property of this archive, not of the pack. Its second audience is the
                                  * artist who renamed everything here and wants that work back out, to
                                  * use in a DAW or another sampler.
                                  */}
                                {own.length > 0 && (
                                    <>
                                        <div className="mt-3 flex flex-wrap items-center gap-2">
                                            {([
                                                ['original', 'Original filenames'],
                                                ['title', 'The titles I typed'],
                                            ] as const).map(([value, label]) => (
                                                <button
                                                    key={value}
                                                    onClick={() => update({ audioNaming: value })}
                                                    className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors
                                                        ${draft.audioNaming === value
                                                            ? 'border-synthux-green/60 bg-synthux-green/15 text-synthux-green'
                                                            : 'border-white/10 text-gray-400 hover:text-white hover:border-white/25'}`}
                                                >
                                                    {label}
                                                </button>
                                            ))}
                                        </div>
                                        <p className="mt-2 text-[11px] text-gray-600 font-mono truncate">
                                            e.g. audio/{own[0].category && own[0].category !== 'General'
                                                ? own[0].category + '/'
                                                : ''}{archiveNameFor(own[0], draft.audioNaming)}
                                        </p>
                                    </>
                                )}

                                <button
                                    onClick={downloadSubmission}
                                    disabled={!!busy || missing.length > 0}
                                    className="mt-3 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold
                                        bg-synthux-green text-black hover:bg-synthux-green/90 transition-colors
                                        disabled:opacity-40 disabled:hover:bg-synthux-green"
                                >
                                    {busy ? <Loader size={15} className="animate-spin" /> : <Download size={15} />}
                                    {busy || `Download the submission${totalBytes ? ` (${formatBytes(totalBytes)})` : ''}`}
                                </button>
                                {missing.length > 0 && (
                                    <p className="mt-2 text-xs text-synthux-red">
                                        {missing.length} thing{missing.length === 1 ? '' : 's'} still needed above.
                                    </p>
                                )}
                                {warnings.length > 0 && missing.length === 0 && (
                                    <p className="mt-2 text-xs text-gray-500">
                                        {warnings.length} optional thing{warnings.length === 1 ? '' : 's'} left out — that’s allowed.
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {draft.wants.sd && (
                    <div className="rounded-xl border border-white/10 bg-synthux-panel/60 p-4">
                        <div className="flex items-start gap-3">
                            <HardDrive size={20} className="shrink-0 mt-0.5 text-synthux-blue" />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold">SK folder for your card</p>
                                <p className="mt-1 text-xs text-gray-400 leading-relaxed">
                                    {sdSlotCount(draft)} slot{sdSlotCount(draft) === 1 ? '' : 's'}, converted to the
                                    48 kHz WAV the hardware reads and laid out as it expects. Unzip it onto the card
                                    and listen before you send anything. This is yours — it is not part of the
                                    submission.
                                    {borrowed.length > 0 && ' Samples borrowed from published packs are downloaded as the card is built, so this one needs a connection.'}
                                </p>
                                {presets.length > 1 && (
                                    <div className="mt-3">
                                        <span className="block mb-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-500">
                                            Which preset goes on the card
                                        </span>
                                        <div className="flex flex-wrap gap-2">
                                            {presets.map(preset => (
                                                <button
                                                    key={preset.id}
                                                    onClick={() => update({ sdPresetId: preset.id })}
                                                    className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors
                                                        ${sdPreset?.id === preset.id
                                                            ? 'border-synthux-blue/60 bg-synthux-blue/15 text-synthux-blue'
                                                            : 'border-white/10 text-gray-400 hover:text-white hover:border-white/25'}`}
                                                >
                                                    {preset.name.trim() || 'Unnamed'}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <button
                                    onClick={downloadSDFolder}
                                    disabled={!!sdProgress || draft.files.length === 0}
                                    className="mt-3 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold
                                        bg-white/10 hover:bg-white/15 transition-colors disabled:opacity-40"
                                >
                                    {sdProgress ? <Loader size={15} className="animate-spin" /> : <Download size={15} />}
                                    {sdProgress || 'Build the SK folder'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Where it goes */}
            {!nothingToSend && (
                <div className="rounded-xl border border-white/10 bg-synthux-panel/60 p-4 mb-5">
                    <p className="text-sm font-bold mb-1">Where to send it</p>
                    <p className="text-xs text-gray-400 leading-relaxed mb-3">
                        There is no upload here and no form. Put the archive on WeTransfer, Drive or Dropbox
                        and send the link — Discord is the easiest, and the best place to ask something before
                        you start. A small submission with no audio in it will attach to a message directly.
                    </p>

                    <div className="flex flex-wrap gap-2">
                        <span className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-black/30 text-sm">
                            <MessageCircle size={14} className="text-synthux-blue" />
                            <span className="text-gray-400">Discord</span>
                            <code className="text-white">{DISCORD_HANDLE}</code>
                        </span>

                        <a
                            href={submissionMailto(subject)}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-black/30
                                text-sm text-gray-300 hover:text-white hover:border-white/25 transition-colors"
                        >
                            Email {submissionEmail()}
                        </a>

                        <button
                            onClick={copyEmail}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-gray-500
                                hover:text-white transition-colors"
                            title="Copy the address"
                        >
                            <Copy size={14} />
                        </button>
                    </div>
                </div>
            )}

            {own.length > 0 && (
                <Note tone="warn">
                    <strong>Nothing is uploaded from this app.</strong> The {formatBytes(totalBytes)} archive is
                    built here, in your browser, and downloaded to your machine — putting it somewhere shareable
                    and sending the link is the one part only you can do.
                </Note>
            )}

            {draft.wants.pack && (
                <div className="mt-5">
                    <Note>
                        <strong className="text-gray-200">What happens to it.</strong> Once accepted, your pack
                        appears in the app's Sample Browser under your name, with its own link you can share, and
                        as a full-pack download on its page. The audio is converted to FLAC there, which is
                        lossless and about half the size; anything built for a card stays{' '}
                        <code className="text-gray-400">.wav</code>, because that is all the hardware reads.
                    </Note>
                </div>
            )}

            {hasDownloaded && (
                <div className="mt-5">
                    <Note>
                        <strong className="text-gray-200">Keep that archive.</strong> Your draft stays in this
                        browser until you clear it — but the archive is the real copy: drop it back into step 2
                        on any machine and the whole form comes back, files, licence, preset and all. That is how
                        you pick this up again after clearing your browser, or fix one title six months from now.
                    </Note>
                </div>
            )}
        </StepPanel>
    );
};
