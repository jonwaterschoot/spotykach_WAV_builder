import React, { Suspense } from 'react';
import { Library, HardDrive, Sliders, FolderOpen, AudioWaveform, ArrowRight, Monitor, Smartphone } from 'lucide-react';
import logoImg from '../assets/img/Spotykach_Logo.webp?url';
import type { AppMode } from './useAppMode';

// The news section pulls in the markdown renderer. Lazy so the hub's own bundle
// stays small — nothing above the fold waits on it.
const HubNews = React.lazy(() => import('./HubNews'));

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
    tagline: 'No setup',
    body: 'Listen through the sample packs and download what you like. No folders, no permissions, nothing to install.',
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
    body: 'Pick a curated project and write it straight to the card, ready for the hardware. No project to name.',
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
    tagline: 'MIDI & settings',
    body: 'Read and write the config.txt on your card — MIDI channel, device options — without opening a project.',
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
    tagline: 'No project',
    body: 'Open a single audio file, trim, fade and slice it, then download it — or turn it into a project.',
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
    body: 'Projects, tapes, the waveform editor and SD builds. Needs a work folder on your drive.',
    icon: <FolderOpen size={26} strokeWidth={1.75} />,
    accentText: 'text-synthux-yellow',
    accentBorder: 'hover:border-synthux-yellow/60',
    accentGlow: 'group-hover:shadow-[0_0_30px_-8px_rgba(255,185,0,0.45)]',
    ready: true,
    desktopOnly: true,
  },
];

interface HubScreenProps {
  onEnter: (mode: AppMode) => void;
}

/**
 * The landing screen: five doors, no project, no permission prompts.
 * Doors whose mode isn't built yet still route to their own hash — the router
 * falls back to Studio until the matching phase lands.
 */
export const HubScreen: React.FC<HubScreenProps> = ({ onEnter }) => {
  return (
    <div className="min-h-screen w-full bg-synthux-main text-white font-sans noise-texture overflow-y-auto">
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
            Listen through the packs and download what you like. The other four need a desktop
            browser — they open folders on your drive and lay out grids and waveforms that a phone
            screen can't hold.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {DOORS.map(door => (
            <button
              key={door.mode}
              onClick={() => onEnter(door.mode)}
              className={`group text-left rounded-xl border border-white/10 bg-synthux-panel/80 p-5 sm:p-6
                transition-all duration-200 hover:bg-white/[0.04] ${door.accentBorder} ${door.accentGlow}
                focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40`}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
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

              <h2 className="text-lg font-bold tracking-tight mb-1.5 flex items-center gap-2">
                {door.label}
                <ArrowRight
                  size={16}
                  className="opacity-0 -translate-x-1 transition-all duration-200 group-hover:opacity-70 group-hover:translate-x-0"
                />
              </h2>

              <p className="text-sm text-gray-400 leading-relaxed">{door.body}</p>

              {!door.ready && (
                <p className="mt-3 text-[10px] font-bold uppercase tracking-widest text-gray-600">
                  In progress — opens Studio for now
                </p>
              )}
            </button>
          ))}
        </div>

        <p className="mt-10 text-xs text-gray-600">
          Nothing here touches your drive. Studio asks for a folder when you enter it; the other modes
          ask only at the moment they write.
        </p>

        <Suspense fallback={null}>
          <HubNews />
        </Suspense>
      </div>
    </div>
  );
};
