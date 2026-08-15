import React from 'react';
import { FolderOpen, FolderPlus, GraduationCap, HardDrive } from 'lucide-react';

interface WorkspaceChoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The project about to be created, so the step says what it is for. */
  projectName: string;
  /** The workspace the app already knows about, if any. Read for its name only. */
  existing: FileSystemDirectoryHandle | null;
  /** Use `existing` — the caller asks for permission back before writing. */
  onUseExisting: () => void;
  /** Open the folder picker, which is what "choose a workspace" actually is. */
  onPickFolder: () => void;
  /**
   * Hand the whole thing to Studio's setup wizard. Only offered when there is no
   * workspace yet — with one already known the wizard has nothing left to ask.
   */
  onRunSetup?: () => void;
}

/**
 * The step before the folder picker — round 4.
 *
 * "Import into a project" used to open `showDirectoryPicker` immediately, which put
 * the single most consequential choice in the app — where your workspace lives —
 * behind an OS dialog with no explanation attached and no way to know one had
 * already been made. Someone who had a workspace was quietly invited to start a
 * second one; someone who had none was asked to invent it in a file browser.
 *
 * So: name the decision, show the answer when there is one, and let the picker be
 * the deliberate alternative rather than the only door.
 */
export const WorkspaceChoiceModal: React.FC<WorkspaceChoiceModalProps> = ({
  isOpen,
  onClose,
  projectName,
  existing,
  onUseExisting,
  onPickFolder,
  onRunSetup,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-6 animate-in fade-in duration-200">
      <div className="bg-synthux-panel border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">

        <div className="p-6 pb-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2.5">
            <HardDrive size={18} className="text-synthux-yellow" />
            Where should <span className="font-mono text-synthux-yellow">{projectName}</span> live?
          </h3>
          <p className="text-xs text-gray-400 leading-relaxed mt-2">
            Studio keeps every project inside one folder on your drive — your <strong>workspace</strong>.
            Projects go in <span className="font-mono text-gray-300">Projects/</span> inside it, next to
            your library. You pick it once and the app remembers it.
          </p>
        </div>

        <div className="px-6 pb-6 space-y-2">
          {existing ? (
            <>
              <button
                onClick={onUseExisting}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-synthux-green/40 bg-synthux-green/10
                  text-left transition-all hover:bg-synthux-green/20"
              >
                <FolderOpen size={18} className="shrink-0 text-synthux-green" />
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-synthux-green">Use your workspace</span>
                  <span className="block text-[11px] text-gray-400 truncate font-mono">{existing.name}</span>
                </span>
              </button>
              <p className="text-[10px] text-gray-600 leading-relaxed px-1">
                Your browser may ask for permission to this folder again — it forgets between visits,
                the app does not.
              </p>
              <button
                onClick={onPickFolder}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-white/10 bg-black/30
                  text-left transition-all hover:bg-white/5 hover:border-white/20"
              >
                <FolderPlus size={18} className="shrink-0 text-gray-400" />
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-gray-200">Choose a different folder</span>
                  <span className="block text-[11px] text-gray-500">
                    Becomes your workspace from now on. The old one is left untouched.
                  </span>
                </span>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onPickFolder}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-synthux-yellow/40 bg-synthux-yellow/10
                  text-left transition-all hover:bg-synthux-yellow/20"
              >
                <FolderPlus size={18} className="shrink-0 text-synthux-yellow" />
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-synthux-yellow">Choose the folder</span>
                  <span className="block text-[11px] text-gray-400">
                    An empty folder is the easiest start — this becomes your workspace.
                  </span>
                </span>
              </button>
              {onRunSetup && (
                <button
                  onClick={onRunSetup}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-white/10 bg-black/30
                    text-left transition-all hover:bg-white/5 hover:border-white/20"
                >
                  <GraduationCap size={18} className="shrink-0 text-gray-400" />
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-gray-200">Walk me through setup instead</span>
                    <span className="block text-[11px] text-gray-500">
                      Studio's setup covers the workspace, your SD card and a first project. Your
                      temporary pool is kept while you do it.
                    </span>
                  </span>
                </button>
              )}
            </>
          )}
        </div>

        <div className="px-6 py-3 border-t border-white/10 bg-black/20 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-full text-xs font-bold text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
