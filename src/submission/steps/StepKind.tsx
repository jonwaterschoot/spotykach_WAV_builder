import React from 'react';
import {
    Download, FileArchive, FolderTree, HardDrive, Layers, Library, RotateCcw, Send, Sliders, Users,
} from 'lucide-react';
import { ChoiceCard, Note, StepHeading, StepPanel } from '../ui';
import { ACCENTS } from '../accents';
import { ownFiles } from '../draft';
import { PACK_MAXIMUM_SAMPLES, PACK_MINIMUM_SAMPLES } from '../validate';
import type { StepProps } from './types';

/**
 * Step 1 — what are you sending?
 *
 * Three checkboxes that decide the shape of everything after them, which is why
 * they are a step of their own rather than a row of toggles somewhere. A pack and a
 * preset are genuinely different submissions — different ceilings, different
 * outputs, different things that have to travel — and the guide's habit of
 * explaining both to everyone is most of why it ran to 175 lines.
 */
export const StepKind: React.FC<StepProps> = ({ draft, update, goToStep }) => {
    const { wants } = draft;
    const arrived = draft.files.length;
    const own = ownFiles(draft).length;

    const set = (patch: Partial<typeof wants>) => update({ wants: { ...wants, ...patch } });

    return (
        <StepPanel>
            <StepHeading title="Share your sounds with other Spotykach users">
                This tool turns a folder of your audio into a <strong className="text-gray-200">sample pack</strong>{' '}
                inside this app — browsable, auditionable and loadable by anyone — and, if you want, a{' '}
                <strong className="text-gray-200">preset</strong> that fills a card in one step. It asks for what a
                submission needs, checks it, and hands you the files to send.
                <span className="block mt-2 text-xs text-gray-400 leading-relaxed">
                    → At the end you get a single archive you need to manually upload to WeTransfer, Drive,
                    Dropbox, etc., and send as a link.
                </span>
            </StepHeading>

            {/*
              * Said before the checkboxes, because "can I use what I already have?" is the
              * question that decides whether someone starts at all. Four of these five are
              * things the app itself produced, and none of them were obviously accepted.
              */}
            {/*
              * The way back in, said before the questions.
              *
              * Someone holding a submission archive is not starting a submission —
              * they are continuing one, and every word on this screen is addressed to
              * the other person. The drop zone that reads the archive is on step 2,
              * which is a reasonable place for it and an unreasonable place to have to
              * *find* it. So the route is here, at the top, where the question "I
              * already made one of these" gets asked.
              */}
            <div className="mb-6 rounded-xl border border-white/10 bg-synthux-panel/40 p-4
                flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-gray-400 leading-relaxed min-w-0">
                    <strong className="text-gray-200">Been here before?</strong> Drop the{' '}
                    <code className="text-gray-300">-submission.zip</code> the tool gave you back onto the audio
                    step and the whole form comes back — files, details, licence, preset, and where you left off.
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
                            {arrived} file{arrived === 1 ? '' : 's'} are already here.
                        </strong>{' '}
                        Answer this once and they carry through — you can look at them on the next step.
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
                        <span>
                            <strong className="text-gray-200">A folder off your drive</strong>, subfolders and all —
                            those folder names become the categories people filter by.
                        </span>
                    </li>
                    <li className="flex gap-2.5">
                        <HardDrive size={14} className="shrink-0 mt-0.5 text-synthux-blue" />
                        <span>
                            <strong className="text-gray-200">An <code className="text-gray-300">SK/</code> folder</strong>{' '}
                            off a card — a build this app made, or the one on the device you have been playing.
                        </span>
                    </li>
                    <li className="flex gap-2.5">
                        <FileArchive size={14} className="shrink-0 mt-0.5 text-synthux-orange" />
                        <span>
                            <strong className="text-gray-200">A WAV.builder export</strong> — the settings-only
                            <code className="text-gray-300 mx-1">.json</code> preset or the
                            <code className="text-gray-300 mx-1">.zip</code> around it. The layout comes back with it.
                        </span>
                    </li>
                    <li className="flex gap-2.5">
                        <Layers size={14} className="shrink-0 mt-0.5 text-synthux-pink" />
                        <span>
                            <strong className="text-gray-200">A pool from Browse, or a project from Studio</strong> —
                            sent straight over, edits and all, from the button in either place.
                        </span>
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
                    Your own audio, for the app’s Sample Browser — a page of your own with cover art, a bio and
                    your links, that anyone can play through and load from. This is the usual submission.
                    Presets are limited to 36 slots; a pack is not, and users pick what they want from it.
                </ChoiceCard>

                <ChoiceCard
                    checked={wants.preset}
                    onChange={() => set({ preset: !wants.preset })}
                    title="A preset"
                    accent={ACCENTS.orange}
                    footer={
                        <span className="mt-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-600">
                            <Sliders size={11} /> Up to 36 slots — 6 tapes × 6
                        </span>
                    }
                >
                    A ready-made layout: which sample sits in which slot, with the tape notes that go with it.
                    Loading it fills a card in one step. Optional, and it can be built from a pack you are
                    submitting here or from packs already in the app.
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
                    Build the folder the hardware reads and download it, so you can copy it to a card and hear
                    your pack on the device before you send it. Nobody else sees this.
                </ChoiceCard>
            </div>

            {!wants.pack && !wants.preset && (
                <div className="mt-5">
                    <Note tone="warn">
                        With neither of the first two ticked there is nothing to submit — the tool will still
                        build you an SK folder, but nothing will be sent anywhere.
                    </Note>
                </div>
            )}

            {!wants.pack && wants.preset && (
                <div className="mt-5">
                    <Note>
                        <strong className="text-gray-200">A preset on its own.</strong> The samples it uses must
                        already be in the app — a preset points at published audio, never carries it. If it uses
                        sounds of your own, tick the sample pack too and they travel together.
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
                        <strong>
                            You have {own} sound{own === 1 ? '' : 's'} of your own — too few for a pack page.
                        </strong>
                        <span className="block mt-2">
                            A published preset can only point at published audio, so those sounds have to be part
                            of a pack for anyone else’s copy to resolve. Two ways on:
                        </span>
                        <span className="block mt-2">
                            <strong className="text-gray-200">Grow the pack</strong> to at least{' '}
                            {PACK_MINIMUM_SAMPLES} and submit both together — the usual route, and the one that
                            gets your name on a page.
                        </span>
                        <span className="block mt-2">
                            <strong className="text-gray-200">Or don’t publish at all.</strong> In Studio, Export
                            → Project Preset → <em>Full Backup Bundle (ZIP)</em> carries the audio inside the file.
                            Anyone you send it to opens it with Import and gets your layout and your sounds, with
                            no submission, no review and no licence to choose. For a preset built around a few
                            personal recordings, this is usually the better answer.
                        </span>
                    </Note>
                </div>
            )}

            <div className="mt-8 rounded-xl border border-white/10 bg-synthux-panel/60 p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">
                    Where your pack ends up, once it is accepted
                </p>
                <ul className="space-y-2 text-xs text-gray-400 leading-relaxed">
                    <li className="flex gap-2.5">
                        <Library size={14} className="shrink-0 mt-0.5 text-synthux-green" />
                        <span>
                            <strong className="text-gray-200">In the app’s Sample Browser</strong>, under your name,
                            with your description, links and licence — auditionable, and loadable into anyone’s
                            project. Your pack gets its own link, so you can send people straight to it.
                        </span>
                    </li>
                    <li className="flex gap-2.5">
                        <Download size={14} className="shrink-0 mt-0.5 text-synthux-blue" />
                        <span>
                            <strong className="text-gray-200">As a direct download</strong> — a full-pack ZIP on the
                            pack’s own page, for people who want the sounds outside this app.
                        </span>
                    </li>
                    <li className="flex gap-2.5">
                        <FileArchive size={14} className="shrink-0 mt-0.5 text-synthux-orange" />
                        <span>
                            <strong className="text-gray-200">Converted to FLAC in the app</strong>, which is lossless
                            and roughly half the size — so browsing your pack costs a visitor half the bandwidth.
                            Anything built for the card comes out as <code className="text-gray-300">.wav</code>,
                            because that is the only thing the hardware reads.
                        </span>
                    </li>
                </ul>
                <p className="mt-3 pt-3 border-t border-white/5 text-xs text-gray-500 leading-relaxed">
                    <strong className="text-gray-300">Nothing is uploaded from here.</strong> The tool runs entirely
                    in your browser. At the end it builds one archive — the details and the audio together — which
                    you put on WeTransfer, Drive or Dropbox and send as a link.
                </p>
            </div>

            {/*
              * The other reason people arrive here, and the one this tool is wrong for.
              *
              * Submitting means review, deployment, and a pack published under your name
              * for everyone. Sending a project to one person is a different act entirely,
              * needs nobody's permission, and already works — it just has no signpost, so
              * people were about to fill in a licence and a bio to do it.
              */}
            <div className="mt-4 rounded-xl border border-white/10 bg-synthux-panel/40 p-4">
                <div className="flex items-start gap-3">
                    <Users size={16} className="shrink-0 mt-0.5 text-synthux-pink" />
                    <div className="min-w-0 text-xs text-gray-400 leading-relaxed">
                        <strong className="text-gray-200 block mb-1">
                            Just sending something to one person? You don’t need this.
                        </strong>
                        This tool is for publishing <em>into the app</em> — reviewed, deployed, and listed under
                        your name for everyone. To share a project with a friend, open it in Studio and use{' '}
                        <strong className="text-gray-300">Export</strong>: the settings-only{' '}
                        <code className="text-gray-300">.json</code> is tiny and works if you both have the same
                        packs, and the full backup <code className="text-gray-300">.zip</code> carries the audio
                        with it for anything you recorded yourself. They open it with{' '}
                        <strong className="text-gray-300">Import</strong>. No submission, no waiting, no licence
                        to choose.
                    </div>
                </div>
            </div>
        </StepPanel>
    );
};
