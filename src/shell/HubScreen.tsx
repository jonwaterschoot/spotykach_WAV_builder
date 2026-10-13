import React, { Suspense, useState } from 'react';
import { Library, HardDrive, Sliders, FolderOpen, AudioWaveform, ArrowRight, Monitor, Smartphone, HelpCircle, Dices } from 'lucide-react';
import logoImg from '../assets/img/Spotykach_Logo.webp?url';
import type { AppMode } from './useAppMode';

// The news section pulls in the markdown renderer. Lazy so the hub's own bundle
// stays small — nothing above the fold waits on it.
const HubNews = React.lazy(() => import('./HubNews'));

// Same reasoning, and it matters more here: the help modal is the longest single
// component in the app and most visitors never open it. Nothing in it is needed to
// draw a door.
const AboutHelpModal = React.lazy(() =>
  import('../components/AboutHelpModal').then(m => ({ default: m.AboutHelpModal })),
);

interface Door {
  mode: AppMode;
  label: string;
  tagline: string;
  body: string;
  icon: React.ReactNode;
  /** Static class strings — Tailwind can't see interpolated color names. */
  accentText: string;
  accentBorder: string;
  accentGlow: string;
  ready: boolean;
  /**
   * Needs a desktop browser. Not a guess about screen size: these four either open
   * a folder picker, or lay out a 6×6 grid and a waveform with its overlays, and
   * neither survives a phone. Browse is the one door built for reading and
   * listening, so it is the one door a phone is offered.
   */
  desktopOnly?: boolean;
}

const DOORS: Door[] = [
  {
    mode: 'browse',
    label: 'Browse Samples',
    tagline: 'Start here · no setup',
    body: 'Listen through the packs, collect what you like, and download it as a ready card (6×6) or as loose files. Works on a phone.',
    icon: <Library size={26} strokeWidth={1.75} />,
    accentText: 'text-synthux-green',
    accentBorder: 'hover:border-synthux-green/60',
    accentGlow: 'group-hover:shadow-[0_0_30px_-8px_rgba(35,224,115,0.45)]',
    ready: true,
  },
  {
    mode: 'presets',
    label: 'Preset to SD Card',
    tagline: 'One step',
    body: 'A ready-made card from a curated set, written straight to your SD card. No project to name.',
    icon: <HardDrive size={26} strokeWidth={1.75} />,
    accentText: 'text-synthux-orange',
    accentBorder: 'hover:border-synthux-orange/60',
    accentGlow: 'group-hover:shadow-[0_0_30px_-8px_rgba(245,139,68,0.45)]',
    ready: true,
    desktopOnly: true,
  },
  {
    mode: 'config',
    label: 'Device Config',
    tagline: 'MIDI & preloading',
    body: "Change the Spotykach's settings in config.txt (MIDI channels, preloading, transport, slice mode) without opening a project.",
    icon: <Sliders size={26} strokeWidth={1.75} />,
    accentText: 'text-synthux-blue',
    accentBorder: 'hover:border-synthux-blue/60',
    accentGlow: 'group-hover:shadow-[0_0_30px_-8px_rgba(71,113,249,0.45)]',
    ready: true,
    desktopOnly: true,
  },
  {
    mode: 'editor',
    label: 'Edit One File',
    tagline: "Studio's editor, for one file",
    body: 'Trim, fade, EQ, pitch and slice a single audio file, then download it or send it to the Browse pool. No project needed.',
    icon: <AudioWaveform size={26} strokeWidth={1.75} />,
    accentText: 'text-synthux-pink',
    accentBorder: 'hover:border-synthux-pink/60',
    accentGlow: 'group-hover:shadow-[0_0_30px_-8px_rgba(255,90,158,0.45)]',
    ready: true,
    desktopOnly: true,
  },
  {
    mode: 'studio',
    label: 'Studio',
    tagline: 'The full workspace',
    body: 'Projects, tapes, the waveform editor, and building and syncing the card. Needs a work folder on your drive.',
    icon: <FolderOpen size={26} strokeWidth={1.75} />,
    accentText: 'text-synthux-yellow',
    accentBorder: 'hover:border-synthux-yellow/60',
    accentGlow: 'group-hover:shadow-[0_0_30px_-8px_rgba(255,185,0,0.45)]',
    ready: true,
    desktopOnly: true,
  },
  {
    mode: 'mangle',
    label: 'Sample Mangler',
    tagline: 'Just for fun',
    body: 'Random snippets from the packs or your own files, joined into one 42 s file. Every batch is a surprise.',
    icon: <Dices size={26} strokeWidth={1.75} />,
    accentText: 'text-synthux-red',
    accentBorder: 'hover:border-synthux-red/60',
    accentGlow: 'group-hover:shadow-[0_0_30px_-8px_rgba(240,15,19,0.45)]',
    ready: true,
    // Decoded sources take hundreds of MB and the screen has three columns.
    desktopOnly: true,
  },
];

/**
 * The doors by what the visitor came to do: the two quickest routes to sounds on the
 * device, then making your own set, then the optional tools, drawn smaller. Submit a
 * Pack isn't a door: the few who need it come looking, so it's a line under the grid.
 */
const SECTIONS: Array<{ title: string; modes: AppMode[]; compact?: boolean }> = [
  { title: 'Get sounds onto your Spotykach', modes: ['browse', 'presets'] },
  { title: 'Make your own set', modes: ['studio', 'editor'] },
  { title: 'Tools & extras', modes: ['config', 'mangle'], compact: true },
];

interface HubScreenProps {
  onEnter: (mode: AppMode) => void;
}

/**
 * The landing screen: six doors in three groups, no project, no permission prompts.
 * Doors whose mode isn't built yet still route to their own hash — the router
 * falls back to Studio until the matching phase lands.
 */
export const HubScreen: React.FC<HubScreenProps> = ({ onEnter }) => {
  /*
   * Which tab the help modal opens on, or null for closed.
   *
   * It lived only in Studio until now, behind a header menu, which meant the three
   * things a first-time visitor most needs — what this app is, how to format a card,
   * how to submit a pack — were reachable only from the one door that first asks for
   * a folder. No `onReset` is passed: wiping every project is Studio's to offer,
   * where the projects are.
   */
  const [helpTab, setHelpTab] = useState<'about' | 'help' | 'contribute' | null>(null);

  return (
    <div className="min-h-screen w-full bg-synthux-main text-white font-sans noise-texture texture-viewport">
      <div className="mx-auto max-w-5xl px-6 py-12 sm:py-20">

        <header className="flex items-center gap-4 mb-10 sm:mb-14">
          <img src={logoImg} alt="Spotykach" className="h-12 w-auto object-contain shrink-0" />
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-header bg-gradient-to-r from-synthux-orange to-synthux-yellow bg-clip-text text-transparent leading-tight">
              Spotykach WAV.builder
            </h1>
            <p className="text-sm text-gray-400 mt-1">
              What do you want to do?
            </p>
          </div>

          <button
            onClick={() => setHelpTab('about')}
            title="About this app, formatting a card, and the submission guide"
            className="ml-auto shrink-0 flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2
              text-[11px] font-bold uppercase tracking-widest text-gray-400
              hover:text-white hover:bg-white/5 hover:border-white/20 transition-colors
              focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          >
            <HelpCircle size={15} />
            <span className="hidden sm:inline">About &amp; Help</span>
          </button>
        </header>

        {/*
          * Said once, up front, on the screens where it is true. A phone visitor who
          * taps Studio first meets a folder picker that may not exist and a 6×6 grid
          * that doesn't fit, and concludes the app is broken rather than that they
          * are on the wrong device.
          */}
        <div className="sm:hidden mb-5 flex gap-3 rounded-xl border border-white/10 bg-synthux-panel/80 p-4">
          <Smartphone size={18} className="shrink-0 text-synthux-green mt-0.5" />
          <p className="text-xs text-gray-400 leading-relaxed">
            <span className="text-gray-200 font-bold">On a phone, Browse Samples is the door that works.</span>{' '}
            Listen through the packs and download what you like. Most of the others need a desktop
            browser, because they open folders on your drive and lay out grids and waveforms that a phone
            screen can't hold.
          </p>
        </div>

        <div className="space-y-8">
          {SECTIONS.map(section => (
            <section key={section.title}>
              <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-gray-500">{section.title}</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {section.modes.map(mode => DOORS.find(d => d.mode === mode)!).map(door => (
                  <button
                    key={door.mode}
                    onClick={() => onEnter(door.mode)}
                    className={`group text-left rounded-xl border border-white/10 bg-synthux-panel/80
                      ${section.compact ? 'p-4' : 'p-5 sm:p-6'}
                      transition-all duration-200 hover:bg-white/[0.04] ${door.accentBorder} ${door.accentGlow}
                      focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40`}
                  >
                    <div className={`flex items-start justify-between gap-3 ${section.compact ? 'mb-2' : 'mb-3'}`}>
                      <span className={`${door.accentText} shrink-0`}>{door.icon}</span>
                      <span className="flex items-center gap-2 mt-1">
                        {door.desktopOnly && (
                          <span className="sm:hidden flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest
                            text-gray-500 border border-white/10 rounded px-1.5 py-0.5">
                            <Monitor size={10} /> Desktop
                          </span>
                        )}
                        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                          {door.tagline}
                        </span>
                      </span>
                    </div>

                    <h3 className={`${section.compact ? 'text-base' : 'text-lg'} font-bold tracking-tight mb-1.5 flex items-center gap-2`}>
                      {door.label}
                      <ArrowRight
                        size={16}
                        className="opacity-0 -translate-x-1 transition-all duration-200 group-hover:opacity-70 group-hover:translate-x-0"
                      />
                    </h3>

                    <p className={`${section.compact ? 'text-xs' : 'text-sm'} text-gray-400 leading-relaxed`}>{door.body}</p>

                    {!door.ready && (
                      <p className="mt-3 text-[10px] font-bold uppercase tracking-widest text-gray-600">
                        In progress, opens Studio for now
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>

        <p className="mt-8 text-sm text-gray-400">
          Made your own sounds?{' '}
          <button
            onClick={() => onEnter('submit')}
            className="inline-flex items-center gap-1 font-bold text-synthux-turquoise hover:underline underline-offset-2
              focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 rounded"
          >
            Submit a pack <ArrowRight size={14} />
          </button>
        </p>

        <p className="mt-10 text-xs text-gray-600">
          Nothing here touches your drive. Studio asks for a folder when you enter it; the other modes
          ask only at the moment they write.
        </p>

        <Suspense fallback={null}>
          <HubNews />
        </Suspense>
      </div>

      {helpTab && (
        <Suspense fallback={null}>
          <AboutHelpModal initialTab={helpTab} onClose={() => setHelpTab(null)} />
        </Suspense>
      )}
    </div>
  );
};
