import React, { Suspense, useEffect, useState } from 'react';
import { ChevronLeft, Loader } from 'lucide-react';
import { fetchSampleManifest, type PresetManifestEntry } from '../data/samplePacks';
import {
  canWriteToSDDirectly, hydratePreset, missingAssetCount, writeToSD,
} from '../utils/presetLoader';

const PresetsPanel = React.lazy(() =>
  import('../components/PresetsPanel').then(m => ({ default: m.PresetsPanel }))
);

interface PresetsModeProps {
  onExitToHub: () => void;
}

/**
 * Tier 2 — the preset surface at `#/presets`.
 *
 * The whole flow is: pick a preset, choose the card, done. No work folder, no
 * project name, nothing written to the global IDB slot — `hydratePreset` returns a
 * detached `AppState` that goes straight to `exportSDStructure` and is dropped
 * again. The only permission prompt is the directory picker, and it fires at the
 * moment of the write (locked decision 3).
 */
export const PresetsMode: React.FC<PresetsModeProps> = ({ onExitToHub }) => {
  const [presets, setPresets] = useState<PresetManifestEntry[]>([]);
  const [manifestError, setManifestError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSampleManifest()
      .then(({ presets: fetched }) => {
        if (!cancelled) setPresets(fetched);
      })
      .catch(e => {
        console.warn('[Presets] Failed to load manifest:', e);
        if (!cancelled) setManifestError('Could not reach the preset list. Check your connection and reload.');
      });
    return () => { cancelled = true; };
  }, []);

  // Firefox and Safari have no directory picker, so the same tree is offered as a
  // ZIP instead of leaving the tier at a dead end.
  const canWriteDirectly = canWriteToSDDirectly();

  const handleWriteToSD = async (entry: PresetManifestEntry, onProgress: (msg: string, pct: number) => void) => {
    // Fetching the audio is the long half; the write is quick by comparison.
    const { state, name } = await hydratePreset(entry, (msg, pct) => onProgress(msg, pct * 0.55));

    await writeToSD(
      state,
      { projectName: name, asZip: !canWriteDirectly },
      (msg, pct) => onProgress(msg || 'Writing to card…', 55 + ((pct ?? 0) * 0.45)),
    );

    const missing = missingAssetCount(state);
    if (missing > 0) {
      return `${missing} sample${missing === 1 ? '' : 's'} could not be downloaded — ${missing === 1 ? 'that slot is' : 'those slots are'} empty.`;
    }
  };

  return (
    <div className="h-screen w-full flex flex-col bg-synthux-main text-white overflow-hidden">

      {/* Mode bar */}
      <div className="shrink-0 flex items-center justify-between gap-4 px-4 py-2 border-b border-white/10 bg-synthux-panel">
        <button
          onClick={onExitToHub}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-bold uppercase tracking-widest
            text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <ChevronLeft size={14} /> Hub
        </button>

        <div className="min-w-0 text-center">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-synthux-orange">Preset → SD</span>
          <span className="hidden sm:inline text-[11px] text-gray-500 ml-3">
            {canWriteDirectly
              ? 'Your card is asked for when the writing starts, not before.'
              : 'This browser can’t write to a folder — presets come back as a ZIP instead.'}
          </span>
        </div>

        <span className="text-[11px] text-gray-600 font-mono">{presets.length || ''}</span>
      </div>

      <div className="flex-1 min-h-0">
        {manifestError ? (
          <div className="h-full w-full flex items-center justify-center px-6 text-center text-sm text-gray-400">
            {manifestError}
          </div>
        ) : (
          <Suspense fallback={
            <div className="h-full w-full flex items-center justify-center text-gray-500">
              <Loader size={20} className="animate-spin" />
            </div>
          }>
            <PresetsPanel
              isOpen
              mode="standalone"
              onClose={onExitToHub}
              presets={presets}
              onWriteToSD={handleWriteToSD}
              writeLabel={canWriteDirectly ? 'Write to SD card' : 'Build SD ZIP'}
              writeHint={canWriteDirectly
                ? 'Builds SK/ on the card you pick · Nothing is saved on this machine'
                : 'Downloads a ZIP holding the whole SK/ folder · Copy it to the card'}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
};

export default PresetsMode;
