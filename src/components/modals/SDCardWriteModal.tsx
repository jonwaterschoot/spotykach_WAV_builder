import React from 'react';
import { AlertTriangle, FolderOpen, HardDrive, Loader } from 'lucide-react';

/** Which half of the conversation the modal is having. */
export type SDCardWriteStage = 'intro' | 'checking' | 'existing';

interface SDCardWriteModalProps {
  isOpen: boolean;
  /** The preset about to be written, named once under the heading. */
  presetName: string;
  /**
   * A card the app already holds — Studio's connected card. Offered as a shortcut,
   * never used silently: the write is destructive enough to be worth one click.
   */
  knownCard?: FileSystemDirectoryHandle | null;
  stage: SDCardWriteStage;
  /** The chosen root, once there is one. Shown by name on the overwrite step. */
  chosenCard?: FileSystemDirectoryHandle | null;
  /** Reuse `knownCard`. Must run inside the click — permission may need asking again. */
  onUseKnownCard: () => void;
  /**
   * Open `showDirectoryPicker`. Must be called straight out of the click handler,
   * with no awaited work in front of it — see the comment on the component below.
   */
  onPickCard: () => void;
  /** The card already has `SK/` and the user wants to write into it anyway. */
  onConfirmOverwrite: () => void;
  onCancel: () => void;
  /** Set when the picker or the card itself refused. */
  error?: string | null;
}

/**
 * The step before the card picker.
 *
 * Two things were wrong with going straight to `showDirectoryPicker`. The first was
 * a bug: the preset's audio was fetched *before* the picker opened, so by the time
 * the browser was asked for a folder the click's transient activation had long
 * expired and Chrome threw "Must be handling a user gesture to show a file picker".
 *
 * The second was that the picker never said what it was for. Only two things can go
 * wrong here — choosing a folder on the card instead of the card, which buries `SK/`
 * a level too deep, and writing through an `SK/` someone wanted to keep. So the modal
 * says those two things and nothing else; the rest was documentation, and this is a
 * dialog.
 */
export const SDCardWriteModal: React.FC<SDCardWriteModalProps> = ({
  isOpen,
  presetName,
  knownCard,
  stage,
  chosenCard,
  onUseKnownCard,
  onPickCard,
  onConfirmOverwrite,
  onCancel,
  error,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[110] p-6 animate-in fade-in duration-200">
      <div className="bg-synthux-panel border border-white/10 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">

        {stage === 'existing' ? (
          <>
            <div className="p-6 pb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2.5">
                <AlertTriangle size={18} className="shrink-0 text-amber-400" />
                <span><span className="font-mono text-amber-300">SK/</span> is already on this card</span>
              </h3>
              <p className="text-xs text-gray-400 leading-relaxed mt-2">
                Writing replaces its tape files. To keep it, cancel and rename it on the card first, to
                <span className="font-mono text-gray-300"> SK_1</span>.
              </p>
            </div>

            <div className="px-6 pb-6">
              <button
                onClick={onConfirmOverwrite}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-500/40 bg-amber-500/10
                  text-left transition-all hover:bg-amber-500/20"
              >
                <HardDrive size={18} className="shrink-0 text-amber-400" />
                <span className="text-sm font-bold text-amber-300">
                  Overwrite <span className="font-mono">{chosenCard?.name || 'the card'}</span>
                </span>
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="p-6 pb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2.5">
                <HardDrive size={18} className="shrink-0 text-synthux-orange" />
                Choose your SD card
              </h3>
              <p className="text-xs text-gray-400 leading-relaxed mt-2">
                Pick the card itself, not a folder on it.
                <span className="font-mono text-gray-300"> SK/</span> is written inside what you choose.
                Then <span className="text-gray-300">{presetName}</span> downloads onto it.
              </p>
            </div>

            {error && (
              <div className="px-6 pb-3">
                <p className="text-[11px] text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {error}
                </p>
              </div>
            )}

            <div className="px-6 pb-6 space-y-2">
              {stage === 'checking' ? (
                <div className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-white/10 bg-black/30">
                  <Loader size={18} className="shrink-0 text-gray-400 animate-spin" />
                  <span className="text-sm text-gray-300">Reading the card…</span>
                </div>
              ) : (
                <>
                  {knownCard && (
                    <button
                      onClick={onUseKnownCard}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-synthux-green/40 bg-synthux-green/10
                        text-left transition-all hover:bg-synthux-green/20"
                    >
                      <HardDrive size={18} className="shrink-0 text-synthux-green" />
                      <span className="text-sm font-bold text-synthux-green truncate">
                        Use <span className="font-mono">{knownCard.name}</span>
                      </span>
                    </button>
                  )}
                  <button
                    onClick={onPickCard}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all
                      ${knownCard
                        ? 'border-white/10 bg-black/30 hover:bg-white/5 hover:border-white/20'
                        : 'border-synthux-orange/40 bg-synthux-orange/10 hover:bg-synthux-orange/20'}`}
                  >
                    <FolderOpen size={18} className={`shrink-0 ${knownCard ? 'text-gray-400' : 'text-synthux-orange'}`} />
                    <span className={`text-sm font-bold ${knownCard ? 'text-gray-200' : 'text-synthux-orange'}`}>
                      {knownCard ? 'Choose a different card' : 'Choose the card'}
                    </span>
                  </button>
                </>
              )}
            </div>
          </>
        )}

        <div className="px-6 py-3 border-t border-white/10 bg-black/20 flex justify-end">
          <button
            onClick={onCancel}
            disabled={stage === 'checking'}
            className="px-4 py-2 rounded-full text-xs font-bold text-gray-400 hover:text-white hover:bg-white/10
              transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
