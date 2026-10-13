import React, { useState } from 'react';
import {
    BookOpen, Download, FileArchive, Film, FolderTree, HardDrive, Layers, Library, Play, RotateCcw,
    Send, Sliders, Users,
} from 'lucide-react';
import { ChoiceCard, Note, StepHeading, StepPanel } from '../ui';
import { ACCENTS } from '../accents';
import { ownFiles } from '../draft';
import { SUBMISSION_VIDEO_ID } from '../../data/links';
import { PACK_MAXIMUM_SAMPLES, PACK_MINIMUM_SAMPLES } from '../validate';
import type { StepProps } from './types';

/**
 * The walkthrough video, or the space it will occupy.
 *
 * Two states and no third: a dashed placeholder while `SUBMISSION_VIDEO_ID` is null,
 * and a click-to-play facade once it isn't. The facade matters — an `<iframe>` on
 * step 1 would have YouTube setting cookies and running scripts for every visitor
 * who never pressed play, in a tool whose whole promise is that nothing leaves the
 * machine. Nothing is requested from Google until someone asks for the video, and
 * `youtube-nocookie.com` is the host even then.
 */
const IntroVideo: React.FC = () => {
    const [playing, setPlaying] = useState(false);

    if (!SUBMISSION_VIDEO_ID) {
        return (
            <div className="aspect-video w-full rounded-lg border border-dashed border-white/15 bg-black/30
                flex flex-col items-center justify-center gap-2 text-center px-4">
                <Film size={20} className="text-gray-600" />
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                    A short video will go here
                </p>
                <p className="text-[11px] text-gray-600 leading-relaxed max-w-xs">
                    Until then, the guide covers it.
                </p>
            </div>
        );
    }

    if (!playing) {
        return (
            <button
                onClick={() => setPlaying(true)}
                className="group relative aspect-video w-full overflow-hidden rounded-lg border border-white/10
                    bg-black/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-synthux-turquoise"
            >
                <img
                    src={`https://i.ytimg.com/vi/${SUBMISSION_VIDEO_ID}/hqdefault.jpg`}
                    alt=""
                    loading="lazy"
                    className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity"
                />
                <span className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                    <span className="w-12 h-12 rounded-full bg-black/70 border border-white/20 flex items-center justify-center
                        group-hover:scale-110 transition-transform">
                        <Play size={18} className="text-white translate-x-0.5" fill="currentColor" />
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-300">
                        Watch the walkthrough
                    </span>
                </span>
            </button>
        );
    }

    return (
        <iframe
            src={`https://www.youtube-nocookie.com/embed/${SUBMISSION_VIDEO_ID}?autoplay=1&rel=0`}
            title="Submitting a pack: a walkthrough"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="aspect-video w-full rounded-lg border border-white/10 bg-black"
        />
    );
};

/**
 * Step 1 — what are you sending?
 *
 * Three checkboxes that decide the shape of everything after them, which is why
 * they are a step of their own rather than a row of toggles somewhere. A pack and a
 * preset are genuinely different submissions — different ceilings, different
 * outputs, different things that have to travel — and the guide's habit of
 * explaining both to everyone is most of why it ran to 175 lines.
 */
export const StepKind: React.FC<StepProps> = ({ draft, update, goToStep, openGuide }) => {
    const { wants } = draft;
    const arrived = draft.files.length;
    const own = ownFiles(draft).length;

    const set = (patch: Partial<typeof wants>) => update({ wants: { ...wants, ...patch } });

    return (
        <StepPanel>
            <StepHeading title="Share your sounds with other Spotykach users">
                Turn your sounds into a <strong className="text-gray-200">sample pack</strong> in this app and, if you
                like, a <strong className="text-gray-200">preset</strong> that fills a card in one step. The tool checks
                everything and gives you one ZIP to share as a link. Nothing is uploaded from here.
            </StepHeading>

            <div className="mb-6 grid gap-4 sm:grid-cols-2 items-stretch">
                <IntroVideo />

                <div className="rounded-lg border border-white/10 bg-synthux-panel/60 p-4 flex flex-col justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">
                            First time here?
                        </p>
                        <p className="text-xs text-gray-400 leading-relaxed">
                            The guide says what to have ready and where to send it.
                        </p>
                    </div>
                    <button
                        onClick={openGuide}
                        className="self-start flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold
                            bg-white/10 hover:bg-white/15 transition-colors"
                    >
                        <BookOpen size={13} /> Read the guide
                    </button>
                </div>
            </div>

            <div className="mb-6 rounded-xl border border-white/10 bg-synthux-panel/40 p-4
                flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-gray-400 leading-relaxed min-w-0">
                    <strong className="text-gray-200">Been here before?</strong> Drop your{' '}
                    <code className="text-gray-300">-submission.zip</code> on the next step to pick up where you left off.
                </p>
                <button
                    onClick={() => goToStep(2)}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold
                        bg-white/10 hover:bg-white/15 transition-colors"
                >
                    <RotateCcw size={13} /> Reopen an archive
                </button>
            </div>

            {arrived > 0 && (
                <div className="mb-6 rounded-xl border border-synthux-green/30 bg-synthux-green/5 p-4
                    flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-gray-300 leading-relaxed min-w-0">
                        <strong className="text-synthux-green">
                            {arrived} file{arrived === 1 ? '' : 's'} already here.
                        </strong>{' '}
                        You'll see them on the next step.
                    </p>
                    <button
                        onClick={() => goToStep(2)}
                        className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold
                            bg-white/10 hover:bg-white/15 transition-colors"
                    >
                        <Send size={12} /> See them
                    </button>
                </div>
            )}

            <div className="mb-6 rounded-xl border border-white/10 bg-synthux-panel/60 p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">
                    What you can bring in
                </p>
                <ul className="space-y-2 text-xs text-gray-400 leading-relaxed">
                    <li className="flex gap-2.5">
                        <FolderTree size={14} className="shrink-0 mt-0.5 text-synthux-green" />
                        <span><strong className="text-gray-200">A folder from your drive.</strong> Subfolders become categories.</span>
                    </li>
                    <li className="flex gap-2.5">
                        <HardDrive size={14} className="shrink-0 mt-0.5 text-synthux-blue" />
                        <span><strong className="text-gray-200">An <code className="text-gray-300">SK/</code> folder</strong> from a card.</span>
                    </li>
                    <li className="flex gap-2.5">
                        <FileArchive size={14} className="shrink-0 mt-0.5 text-synthux-orange" />
                        <span>
                            <strong className="text-gray-200">A project export</strong> (<code className="text-gray-300">.json</code> or{' '}
                            <code className="text-gray-300">.zip</code>), layout included.
                        </span>
                    </li>
                    <li className="flex gap-2.5">
                        <Layers size={14} className="shrink-0 mt-0.5 text-synthux-pink" />
                        <span><strong className="text-gray-200">A pool from Browse, or a project from Studio</strong>, with the button there.</span>
                    </li>
                </ul>
            </div>

            <div className="space-y-3">
                <ChoiceCard
                    checked={wants.pack}
                    onChange={() => set({ pack: !wants.pack })}
                    title="A sample pack"
                    accent={ACCENTS.green}
                    footer={
                        <span className="mt-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-600">
                            <Library size={11} /> {PACK_MINIMUM_SAMPLES}–{PACK_MAXIMUM_SAMPLES} samples
                        </span>
                    }
                >
                    Your own sounds, with a page in the Sample Browser: cover art, bio and links. The usual choice.
                </ChoiceCard>

                <ChoiceCard
                    checked={wants.preset}
                    onChange={() => set({ preset: !wants.preset })}
                    title="A preset"
                    accent={ACCENTS.orange}
                    footer={
                        <span className="mt-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-600">
                            <Sliders size={11} /> Up to 36 slots
                        </span>
                    }
                >
                    Which sound sits in which slot, with tape notes. Loading it fills a card in one step. Make it
                    from your pack or from packs already in the app.
                </ChoiceCard>

                <ChoiceCard
                    checked={wants.sd}
                    onChange={() => set({ sd: !wants.sd })}
                    title="An SK folder for my own card"
                    accent={ACCENTS.blue}
                    footer={
                        <span className="mt-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-600">
                            <HardDrive size={11} /> Not part of the submission
                        </span>
                    }
                >
                    Download the folder the Spotykach reads, to hear it on your own card first. Only for you.
                </ChoiceCard>
            </div>

            {!wants.pack && !wants.preset && (
                <div className="mt-5">
                    <Note tone="warn">
                        With neither ticked there's nothing to submit, only the SK folder.
                    </Note>
                </div>
            )}

            {!wants.pack && wants.preset && (
                <div className="mt-5">
                    <Note>
                        <strong className="text-gray-200">A preset on its own</strong> can only use sounds already in
                        the app. Using sounds of your own? Tick the sample pack too.
                    </Note>
                </div>
            )}

            {/*
              * The fork, at the moment the choice is made rather than at the end.
              *
              * A handful of new sounds that exist to serve one preset is the commonest
              * shape that does not fit: too few to be a pack page, and a published
              * preset cannot carry audio of its own. Both real answers are outside this
              * tool, and saying so here is cheaper than letting someone fill in six
              * fields and meet a red line on step 6.
              */}
            {wants.preset && own > 0 && own < PACK_MINIMUM_SAMPLES && (
                <div className="mt-5">
                    <Note tone="warn">
                        <strong>You have {own} sound{own === 1 ? '' : 's'} of your own, too few for a pack ({PACK_MINIMUM_SAMPLES} or more).</strong>
                        <span className="block mt-2">
                            Add more and send both together, or share it privately instead: in Studio,
                            Export ▸ Project Preset ▸ <em>Full Backup Bundle (ZIP)</em> carries the audio with it.
                        </span>
                    </Note>
                </div>
            )}

            <div className="mt-8 rounded-xl border border-white/10 bg-synthux-panel/60 p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">
                    Where your pack ends up
                </p>
                <ul className="space-y-2 text-xs text-gray-400 leading-relaxed">
                    <li className="flex gap-2.5">
                        <Library size={14} className="shrink-0 mt-0.5 text-synthux-green" />
                        <span>In the Sample Browser, under your name, with its own link.</span>
                    </li>
                    <li className="flex gap-2.5">
                        <Download size={14} className="shrink-0 mt-0.5 text-synthux-blue" />
                        <span>As a ZIP download on the pack's page.</span>
                    </li>
                    <li className="flex gap-2.5">
                        <FileArchive size={14} className="shrink-0 mt-0.5 text-synthux-orange" />
                        <span>Stored as FLAC (lossless, half the size). Anything for the card is WAV.</span>
                    </li>
                </ul>
            </div>

            <div className="mt-4 rounded-xl border border-white/10 bg-synthux-panel/40 p-4">
                <div className="flex items-start gap-3">
                    <Users size={16} className="shrink-0 mt-0.5 text-synthux-pink" />
                    <p className="min-w-0 text-xs text-gray-400 leading-relaxed">
                        <strong className="text-gray-200">Only sharing with a friend? You don't need this.</strong>{' '}
                        In Studio, <strong className="text-gray-300">Export</strong> the project: the{' '}
                        <code className="text-gray-300">.json</code> if you both have the same packs, the{' '}
                        <code className="text-gray-300">.zip</code> if it has your own audio. They open it with{' '}
                        <strong className="text-gray-300">Import</strong>.
                    </p>
                </div>
            </div>
        </StepPanel>
    );
};
