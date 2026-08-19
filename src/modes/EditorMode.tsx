import React, { Suspense, useCallback, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Download, Library, Loader, Music, Upload } from 'lucide-react';
import { audioEngine } from '../lib/audio/audioEngine';
import { collapseFileVersions } from '../utils/versionHistory';
import { useEscapeLayer } from '../shell/escapeStack';
import { useToasts } from '../shell/useToasts';
import { Toast } from '../components/Toast';
import { ConfirmModal } from '../components/ConfirmModal';
import { loadBrowsePoolFromDB, saveBrowsePoolToDB } from '../utils/persistence';
import type { BrowsePoolEntry } from '../utils/persistence';
import type { AudioVersion, FileRecord, WavMetadata } from '../types';
import type { CommitLabels } from '../components/WaveformEditor';

const WaveformEditor = React.lazy(() =>
  import('../components/WaveformEditor').then(m => ({ default: m.WaveformEditor }))
);

const newId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2, 15);

const stripExtension = (name: string) => name.replace(/\.[^/.]+$/, '');

/**
 * The transport button's wording without a project.
 *
 * The default speaks of assigning to a tape; there is no tape here. "Apply" is the
 * honest word: it bakes the pending edits into the current version, and the two exits
 * beside it — the download and the pool — decide where that version ends up.
 */
const LOOSE_COMMIT_LABELS: CommitLabels = {
  clean: 'UP TO DATE',
  dirty: 'APPLY EDIT',
  hint: 'Bake the pending edits into this file',
  cleanToast: 'Nothing to apply',
};

/**
 * The same button when a host pool is holding this file — Browse's editor.
 *
 * "Apply edit" described the mechanism and left the destination unsaid, which is
 * the whole of what the user needed to know: the edit goes back to the temporary
 * pool, and everything the pool can do downstream picks it up. Naming the
 * destination also makes the button the answer to "where did my edit go".
 */
const POOL_COMMIT_LABELS: CommitLabels = {
  clean: 'SAVED TO POOL',
  dirty: 'SAVE TO TEMPORARY POOL',
  hint: 'Save these edits back into the temporary pool',
  cleanToast: 'Already saved to the pool',
};

/** A file being edited outside any project: a blob and a name, nothing else. */
export interface LooseFile {
  name: string;
  blob: Blob;
  duration?: number;
  origin?: string;
  license?: string;
  sourceSamplePath?: string;
  metadata?: WavMetadata;
  /**
   * The file as it first arrived, when the host still has it.
   *
   * Without this the editor had only the current blob to build a record from, and
   * labelled it "Original" — so reopening an edited pool entry showed the *edit*
   * under the original's name, with no way back. Browse has held both since R2-4.
   */
  originalBlob?: Blob;
  originalDuration?: number;
}

const recordFromLooseFile = (file: LooseFile): FileRecord => {
  const currentId = newId();
  const current: AudioVersion = {
    id: currentId,
    timestamp: Date.now(),
    description: 'Current',
    blob: file.blob,
    duration: file.duration ?? 0,
  };

  // Same blob object means nothing has been edited yet: one entry, and it really is
  // the original. Two distinct blobs are the two-version rule's `[original, current]`.
  const isEdited = !!file.originalBlob && file.originalBlob !== file.blob;
  const versions: AudioVersion[] = isEdited
    ? [{
        id: newId(),
        timestamp: Date.now(),
        description: 'Original',
        blob: file.originalBlob!,
        duration: file.originalDuration ?? 0,
      }, current]
    : [{ ...current, description: 'Original' }];

  return {
    id: newId(),
    name: stripExtension(file.name),
    originalName: file.name,
    versions,
    currentVersionId: isEdited ? currentId : versions[0].id,
    isParked: false,
    origin: file.origin,
    license: file.license,
    sourceSamplePath: file.sourceSamplePath,
    metadata: file.metadata,
  };
};

const currentVersion = (record: FileRecord) =>
  record.versions.find(v => v.id === record.currentVersionId) ?? record.versions[0];

interface LooseFileEditorProps {
  file: LooseFile;
  /** Back to whatever opened the editor — Browse's pool, or the picker below. */
  onClose: () => void;
  /**
   * Fires on every applied edit, not on a button. The host that owns this file — the
   * Browse pool — keeps its copy current, so closing the editor never drops work.
   */
  onEdited?: (edited: { blob: Blob; duration: number; name: string }) => void;
  /** Shown under the editor's title, e.g. which pack the sample came from. */
  subtitle?: string;
  /** Offered after "Add to pool". Absent when the shell gave no route there. */
  onEnterBrowse?: () => void;
}

/**
 * The editor on one loose file — Phase 6, steps 1–3.
 *
 * The whole file lives in this component's state as a single `FileRecord`, which is
 * why it needs no project, no work folder and no IndexedDB: nothing here is persisted
 * until the user picks one of the two exits.
 *
 * History is deep in session and collapsed on the way out — Appendix E.2's actual
 * shape. It used to collapse on every commit, which meant the sidebar could never
 * show more than two entries even with the editor open, and a host that handed back
 * only the current blob then relabelled that edit "Original" on the next visit. Now
 * every step is kept while the editor lives, `collapseFileVersions` runs at the
 * project exit, and the pool receives one blob against the original it already holds.
 */
export const LooseFileEditor: React.FC<LooseFileEditorProps> = ({ file, onClose, onEdited, subtitle, onEnterBrowse }) => {
  const [record, setRecord] = useState<FileRecord>(() => recordFromLooseFile(file));
  const [isDirty, setIsDirty] = useState(false);
  const [hasEdited, setHasEdited] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [pooledPrompt, setPooledPrompt] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  /**
   * The pool entry this file owns, once it has one.
   *
   * Pressing the button again after another edit updates that entry rather than
   * adding a second copy of the same file under the same name, which is what a
   * plain append would do and what the pool has no way to undo. State, not a ref:
   * the button's own wording is the visible half of knowing this.
   */
  const [pooledId, setPooledId] = useState<string | null>(null);

  const { toasts, showToast, removeToast } = useToasts();

  const active = useMemo(() => currentVersion(record), [record]);

  /**
   * Only warn about what closing would actually lose.
   *
   * With a host that takes `onEdited` the applied edit is already safe in its pool,
   * so only the un-applied changes are at risk. Without one, this component is the
   * only place the edit exists.
   */
  const atRisk = onEdited ? isDirty : isDirty || hasEdited;

  const requestClose = useCallback(() => {
    if (atRisk) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  }, [atRisk, onClose]);

  const handleSave = useCallback((
    blob: Blob,
    duration: number,
    description: string,
    dirty: boolean,
  ) => {
    if (!dirty) return; // Nothing baked; the editor closes itself.

    const version: AudioVersion = {
      id: newId(),
      timestamp: Date.now(),
      description: description || 'Edited',
      blob,
      duration,
    };

    // Not collapsed here. Every step stays in this component's state for as long as
    // the editor is open, which is the in-session depth Appendix E.2 explicitly
    // allows — collapsing on each commit gave that up and left the sidebar with
    // nothing to step back through. The two exits below both collapse, and the host
    // pool only ever receives one blob, so nothing past `[original, current]`
    // reaches disk or IndexedDB.
    setRecord(prev => ({
      ...prev,
      versions: [...prev.versions, version],
      currentVersionId: version.id,
    }));
    setHasEdited(true);
    onEdited?.({ blob, duration, name: record.name });
  }, [onEdited, record.name]);

  /** The version sidebar's one meaningful action here: go back to the original. */
  const handleAssignVersion = useCallback((versionId: string) => {
    setRecord(prev => (
      prev.versions.some(v => v.id === versionId)
        ? { ...prev, currentVersionId: versionId }
        : prev
    ));
  }, []);

  const handleRename = useCallback((_fileId: string, name: string) => {
    setRecord(prev => ({ ...prev, name }));
  }, []);

  // ──────────────────────────────────────────────────────────────────────────
  // Exit 1 — download. No permission, no folder, no project.
  // ──────────────────────────────────────────────────────────────────────────

  const download = useCallback(async () => {
    const { exportSingleFile } = await import('../utils/exportUtils');
    await exportSingleFile({
      versions: record.versions,
      currentVersionId: record.currentVersionId,
      name: record.name,
    });
    showToast('Downloaded', 'success');
  }, [record, showToast]);

  // ──────────────────────────────────────────────────────────────────────────
  // Exit 2 — the file joins Browse's pool
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Puts this file in the temporary pool, where Browse's card builder can reach it.
   *
   * This used to be "Save as project", which asked for a folder and left the user in
   * Studio with a one-file project: the whole of Studio for a file that needs five
   * more beside it before a card means anything. Browse is the surface that already
   * collects loose files and turns a handful of them into an `SK/` folder, so an
   * edited file goes *there* and the project exit stays where it belongs, on a pool
   * with something in it.
   *
   * IndexedDB, not the drive: the pool is Browse's own store (R2-4), so this asks for
   * no permission and still leaves the `app-state` slot locked decision 5 protects
   * untouched.
   */
  const addToPool = useCallback(async () => {
    setBusy('Adding to the pool…');
    try {
      const saved = collapseFileVersions(record);
      const original = saved.versions[0];
      const current = saved.versions.find(v => v.id === saved.currentVersionId) ?? original;

      const id = pooledId ?? newId();
      const entry: BrowsePoolEntry = {
        id,
        name: saved.name,
        fileName: saved.originalName,
        duration: current.duration || 0,
        originalDuration: original.duration || 0,
        origin: saved.origin,
        license: saved.license,
        sourceSamplePath: saved.sourceSamplePath,
        edited: current.id !== original.id,
        original: original.blob!,
        current: current.blob!,
      };

      // Read-modify-write against the store rather than against anything held here:
      // Browse may have been in the middle of its own session before this mode opened.
      const entries = await loadBrowsePoolFromDB();
      const existing = entries.findIndex(e => e.id === id);
      await saveBrowsePoolToDB(
        existing >= 0
          ? entries.map((e, i) => (i === existing ? entry : e))
          : [...entries, entry]
      );

      setPooledId(id);
      setHasEdited(false); // The applied work is in the pool now, so closing loses nothing.
      setPooledPrompt(true);
    } catch (e) {
      console.error(e);
      showToast(e instanceof Error ? e.message : 'Could not add this file to the pool', 'error');
    } finally {
      setBusy(null);
    }
  }, [record, pooledId, showToast]);

  /**
   * The exits, and which of them is the obvious next click.
   *
   * `commitClean` is the editor's own answer to "is there anything left to bake". It
   * decides the emphasis rather than just the wording: while edits are pending the
   * commit button has to win, because the download writes the committed version and
   * would quietly hand back the file *without* the edit that is still on screen. Once
   * everything is applied the commit button has nothing left to say, and the download
   * — the whole point of this mode — takes the filled treatment.
   *
   * A host pool means the file already has somewhere to land and the pool has its own
   * exits, so the second button belongs to the standalone editor only.
   */
  const transportActions = ({ commitClean }: { commitClean: boolean }) => {
    // Both exits take the committed version, so both say the same thing about edits
    // that are still pending rather than letting the user find out afterwards.
    const stale = commitClean ? '' : ' (applies to the last saved version, not the edits still pending)';

    return (
      <>
        <button
          onClick={download}
          className={`flex items-center gap-2 px-6 h-12 rounded-full text-sm font-bold transition-all hover:scale-105
            active:scale-95 shadow-lg border ${commitClean
              ? 'bg-synthux-blue border-synthux-blue text-white hover:bg-blue-500 shadow-synthux-blue/30'
              : 'border-synthux-blue/50 bg-synthux-blue/15 text-synthux-blue hover:bg-synthux-blue/25'}`}
          title={`Download this file as SK-ready WAV${stale}`}
        >
          <Download size={16} /> DOWNLOAD
        </button>
        {!onEdited && (
          <button
            onClick={addToPool}
            disabled={busy !== null}
            className="flex items-center gap-2 px-6 h-12 rounded-full text-sm font-bold transition-all hover:scale-105
              active:scale-95 shadow-lg border border-synthux-yellow/50 bg-synthux-yellow/15 text-synthux-yellow
              hover:bg-synthux-yellow/25 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
            title={`Put this file in Browse's pool, where the card builder and the project exit pick it up${stale}`}
          >
            <Library size={16} /> {pooledId ? 'UPDATE IN POOL' : 'ADD TO POOL'}
          </button>
        )}
      </>
    );
  };

  return (
    <div className="fixed inset-0 z-[80] bg-synthux-main flex flex-col">
      {subtitle && (
        <div className="shrink-0 px-4 py-1.5 text-[11px] text-gray-500 border-b border-white/5 bg-synthux-panel truncate">
          {subtitle}
        </div>
      )}

      <div className="flex-1 min-h-0 relative">
        <Suspense fallback={
          <div className="h-full w-full flex items-center justify-center text-gray-500">
            <Loader size={20} className="animate-spin" />
          </div>
        }>
          <WaveformEditor
            slot={{ name: record.name, blob: active.blob!, fileId: record.id }}
            versions={record.versions}
            activeVersionId={record.currentVersionId}
            metadata={record.metadata}
            commitLabels={onEdited ? POOL_COMMIT_LABELS : LOOSE_COMMIT_LABELS}
            commitCleanTone={onEdited ? 'primary' : 'quiet'}
            transportActions={transportActions}
            onAssignVersion={handleAssignVersion}
            onRenameFile={handleRename}
            onDirtyStateChange={setIsDirty}
            onSave={handleSave}
            onClose={requestClose}
            showToast={showToast}
          />
        </Suspense>
      </div>

      {busy && (
        <div className="fixed inset-0 z-[120] bg-black/70 flex items-center justify-center">
          <div className="flex items-center gap-3 px-5 py-4 rounded-xl bg-synthux-panel border border-white/10 text-sm">
            <Loader size={16} className="animate-spin text-synthux-yellow" /> {busy}
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={pooledPrompt}
        onClose={() => setPooledPrompt(false)}
        onConfirm={() => { setPooledPrompt(false); onEnterBrowse?.(); }}
        title="Added to the pool"
        message={
          <span>
            <strong>{record.name}</strong> is in the temporary pool, alongside anything you collected
            in Browse Samples.{onEnterBrowse
              ? ' Open Browse to download the whole pool as a ready SK/ folder, or to keep adding to it.'
              : ' Open Browse Samples from the hub to build a card from it.'}
          </span>
        }
        confirmLabel={onEnterBrowse ? 'Open Browse' : 'Got it'}
        cancelLabel="Keep editing"
        showCancel={!!onEnterBrowse}
      />

      <ConfirmModal
        isOpen={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        onConfirm={() => { setConfirmDiscard(false); onClose(); }}
        title="Leave the editor?"
        message={
          onEdited
            ? 'Changes you have not saved to the temporary pool will be lost. Everything already saved to the pool stays there.'
            : 'This file is only in memory. Anything you have not downloaded or added to the pool will be lost.'
        }
        confirmLabel="Leave"
        isDestructive
      />

      <Toast toasts={toasts} onRemove={removeToast} />
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// The `#/editor` route: pick a file off the disk, edit it, download or pool it.
// ────────────────────────────────────────────────────────────────────────────

interface EditorModeProps {
  onExitToHub: () => void;
  onEnterBrowse?: () => void;
}

/**
 * Tier 3-lite — the standalone editor at `#/editor`.
 *
 * A file input, not a folder handle: opening a file this way is permission-free and
 * gives back no write access, so the mode can do its whole job without a single
 * prompt. Neither exit changes that — the download goes to the browser's own
 * downloads folder, and the pool is IndexedDB.
 */
export const EditorMode: React.FC<EditorModeProps> = ({ onExitToHub, onEnterBrowse }) => {
  const [file, setFile] = useState<LooseFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * Everything goes through `loadAndProcessAudio` on the way in, so the editor always
   * has the 48 kHz stereo float WAV the hardware reads — and an MP3 or a 44.1 kHz WAV
   * is converted once here rather than at every export.
   */
  const open = useCallback(async (picked: File) => {
    setLoading(true);
    setError(null);
    try {
      const { buffer, blob } = await audioEngine.loadAndProcessAudio(picked);
      setFile({ name: picked.name, blob, duration: buffer.duration, origin: 'Local file' });
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'That file could not be decoded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEscapeLayer(!file, () => {
    onExitToHub();
    return true;
  });

  if (file) {
    return (
      <LooseFileEditor
        file={file}
        subtitle={`Editing ${file.name}. Nothing is written to your drive until you download it.`}
        onClose={() => setFile(null)}
        onEnterBrowse={onEnterBrowse}
      />
    );
  }

  return (
    <div className="h-screen w-full flex flex-col bg-synthux-main text-white overflow-hidden">
      <div className="shrink-0 flex items-center justify-between gap-4 px-4 py-2 border-b border-white/10 bg-synthux-panel">
        <button
          onClick={onExitToHub}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-bold uppercase tracking-widest
            text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <ChevronLeft size={14} /> Hub
        </button>
        <div className="min-w-0 text-center">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-synthux-pink">Editor</span>
          <span className="hidden sm:inline text-[11px] text-gray-500 ml-3">
            One file, no project. Trim, fade, normalise, EQ, pitch, then download.
          </span>
        </div>
        <span className="w-16" aria-hidden />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto flex items-center justify-center p-6">
        <div className="w-full max-w-lg">
          <label
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const dropped = e.dataTransfer.files?.[0];
              if (dropped) open(dropped);
            }}
            className={`block rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer transition-colors ${
              isDragging
                ? 'border-synthux-pink bg-synthux-pink/10'
                : 'border-white/15 bg-synthux-panel/60 hover:border-white/30 hover:bg-white/[0.03]'
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept="audio/*,.wav,.mp3,.flac,.aif,.aiff,.ogg,.m4a"
              className="sr-only"
              onChange={(e) => {
                const picked = e.target.files?.[0];
                if (picked) open(picked);
                e.target.value = '';
              }}
            />
            {loading ? (
              <span className="flex flex-col items-center gap-3 text-gray-400">
                <Loader size={28} className="animate-spin text-synthux-pink" />
                <span className="text-sm">Decoding…</span>
              </span>
            ) : (
              <span className="flex flex-col items-center gap-3">
                <Upload size={28} className="text-synthux-pink" />
                <span className="text-base font-bold">Drop an audio file, or click to choose one</span>
                <span className="text-xs text-gray-500 leading-relaxed max-w-sm">
                  WAV, MP3, FLAC, AIFF, anything the browser can decode. It is converted to the
                  48&nbsp;kHz stereo float WAV the Spotykach reads as it opens.
                </span>
              </span>
            )}
          </label>

          {error && (
            <p className="mt-4 text-xs text-red-400 text-center">{error}</p>
          )}

          <p className="mt-6 flex items-start gap-2 text-[11px] text-gray-600 leading-relaxed">
            <Music size={13} className="shrink-0 mt-0.5" />
            Nothing is uploaded and nothing is written to your drive. When you are done, download the
            file, or add it to the pool in Browse Samples and build a card from a whole set.
          </p>
        </div>
      </div>
    </div>
  );
};

export default EditorMode;
