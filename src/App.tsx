import { useState, useRef, useEffect } from 'react';
import { TapeSelector } from './components/TapeSelector';

import logoImg from './assets/img/Spotykach_Logo.webp?url';
import tapeIcon from './assets/img/spotykachtapeicon.svg?url';
import { SlotGrid } from './components/SlotGrid';
import { WaveformEditor } from './components/WaveformEditor';
import { FileBrowser } from './components/FileBrowser';
import type { AppState, TapeColor, FileRecord, AudioVersion } from './types';
import { getInitialState } from './utils/initialState';
import { audioEngine } from './lib/audio/audioEngine';
import { exportZip, exportSaveState, exportToSDCard, exportSingleTape } from './utils/exportUtils';
import { parseImportFiles } from './utils/importUtils';
import { InfoModal } from './components/InfoModal';
import { SamplePackModal } from './components/SamplePackModal';
import { Toast, type ToastType } from './components/Toast';
import { Info, Upload, Download, FileJson, HardDrive } from 'lucide-react';

import { ErrorBoundary } from './components/ErrorBoundary';
import { loadStateFromDB, saveStateToDB } from './utils/persistence';




function App() {
  const [state, setState] = useState<AppState>(getInitialState());
  const [currentTapeColor, setCurrentTapeColor] = useState<TapeColor>('Blue');
  const [activeSlotId, setActiveSlotId] = useState<number | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [showSampleBrowser, setShowSampleBrowser] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: ToastType } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');

  // Persistence Loading
  useEffect(() => {
    loadStateFromDB().then(saved => {
      if (saved) {
        setState(saved);
      }
    });
  }, []);

  // Persistence Saving (Debounced slightly or just on change)
  useEffect(() => {
    // Small timeout to prevent hammering DB
    const handler = setTimeout(() => {
      saveStateToDB(state);
    }, 1000);
    return () => clearTimeout(handler);
  }, [state]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const singleFileInputRef = useRef<HTMLInputElement>(null);
  const [targetSlotForUpload, setTargetSlotForUpload] = useState<number | null>(null);

  const currentTape = state.tapes[currentTapeColor];
  const activeSlot = activeSlotId ? currentTape.slots.find(s => s.id === activeSlotId) : null;
  const activeFileId = activeSlot?.fileId;
  const activeFile = activeFileId ? state.files[activeFileId] : null;
  const showEditor = activeFile !== null;

  const generateId = () => crypto.randomUUID();

  // Handle external file drop (New Upload)
  const handleSlotDrop = async (slotId: number, files: FileList) => {
    if (files.length === 0) return;
    const file = files[0];

    if (!file.type.includes('audio') && !file.name.toLowerCase().endsWith('.wav')) {
      alert('Please upload an audio file.');
      return;
    }

    setIsProcessing(true);
    setProgressMsg('Processing audio...');
    try {
      const { buffer, blob } = await audioEngine.loadAndProcessAudio(file);

      const fileId = generateId();
      const versionId = generateId();

      const version: AudioVersion = {
        id: versionId,
        timestamp: Date.now(),
        description: 'Original Upload',
        blob,
        duration: buffer.duration
      };

      const newFile: FileRecord = {
        id: fileId,
        name: file.name.toUpperCase().replace(/\.[^/.]+$/, ""),
        originalName: file.name,
        versions: [version],
        currentVersionId: versionId,
        isParked: false // It's assigned immediately
      };

      setState(prev => ({
        ...prev,
        files: { ...prev.files, [fileId]: newFile },
        tapes: {
          ...prev.tapes,
          [currentTapeColor]: {
            ...prev.tapes[currentTapeColor],
            slots: prev.tapes[currentTapeColor].slots.map(s =>
              s.id === slotId ? { ...s, fileId: fileId } : s
            )
          }
        }
      }));

    } catch (e) {
      console.error(e);
      alert('Error processing audio.');
    } finally {
      setIsProcessing(false);
      setProgressMsg('');
    }
  };

  // Handle internal drag drop (Move/Swap/Assign)
  const handleSlotDropInternal = (targetSlotId: number, fileId: string, source: string, isDuplicate: boolean = false) => {
    // source is 'browser' or 'slot'

    setState(prev => {
      const nextFiles = { ...prev.files };
      const nextTapes = { ...prev.tapes };

      // 1. If coming from Browser, unpark it
      if (source === 'browser') {
        nextFiles[fileId] = { ...nextFiles[fileId], isParked: false };
      }

      // 2. Assign to new slot
      // We need to check if target slot is occupied
      const targetSlot = nextTapes[currentTapeColor].slots.find(s => s.id === targetSlotId);
      const previousFileId = targetSlot?.fileId;

      // If occupied, what do we do? Swap? Park the old one?
      // Let's Park the old one for now to keep it simple, or Swap if source was slot?
      if (previousFileId) {
        // Park the occupant
        nextFiles[previousFileId] = { ...nextFiles[previousFileId], isParked: true };
      }

      // Assign new file
      nextTapes[currentTapeColor] = {
        ...nextTapes[currentTapeColor],
        slots: nextTapes[currentTapeColor].slots.map(s =>
          s.id === targetSlotId ? { ...s, fileId } : s
        )
      };

      // 3. If source was another slot, clear that slot (Move)
      // Ideally we'd know WHICH slot it came from to clear it.
      // But 'source' string doesn't say.
      // The source drag data has 'application/x-spotykach-slot-id'
      // We can't access drag data here easily without passing it through.
      // However, if we assume a file can only be in one slot at a time...
      // We can iterate all slots and remove it.
      // For now, let's enforce "Unique Assignment" (File in one slot only).

      // IF DUPLICATE IS FALSE, we clear the old slot.
      if (!isDuplicate && source === 'slot') {
        Object.keys(nextTapes).forEach(color => {
          const c = color as TapeColor;
          nextTapes[c] = {
            ...nextTapes[c],
            slots: nextTapes[c].slots.map(s => {
              // If this slot had the file we just moved, AND it's not the target slot
              // (Cross-tape moves or same-tape moves)
              if (s.fileId === fileId && (c !== currentTapeColor || s.id !== targetSlotId)) {
                return { ...s, fileId: null };
              }
              return s;
            })
          };
        });
      }

      return { files: nextFiles, tapes: nextTapes };
    });
  };

  const handleParkRequest = (fileId: string) => {
    setState(prev => {
      const nextFiles = { ...prev.files };
      nextFiles[fileId] = { ...nextFiles[fileId], isParked: true };

      const nextTapes = { ...prev.tapes };
      // Remove from all slots
      Object.keys(nextTapes).forEach(color => {
        const c = color as TapeColor;
        nextTapes[c] = {
          ...nextTapes[c],
          slots: nextTapes[c].slots.map(s =>
            s.fileId === fileId ? { ...s, fileId: null } : s
          )
        };
      });

      return { files: nextFiles, tapes: nextTapes };
    });
  };

  const handleTapeDrop = (color: TapeColor, fileId: string, source: string, isDuplicate: boolean) => {
    setState(prev => {
      const nextFiles = { ...prev.files };
      const nextTapes = { ...prev.tapes };
      const targetTape = nextTapes[color];

      // 1. Check for free slot
      const freeSlot = targetTape.slots.find(s => s.fileId === null);

      if (!freeSlot) {
        alert(`Tape ${color} is full!`);
        return prev; // No change
      }

      // 2. Unpark if from browser
      if (source === 'browser') {
        nextFiles[fileId] = { ...nextFiles[fileId], isParked: false };
      }

      // 3. Handle Move (Clear old slot if not duplicate)
      if (!isDuplicate && source === 'slot') {
        Object.keys(nextTapes).forEach(cKey => {
          const c = cKey as TapeColor;
          nextTapes[c] = {
            ...nextTapes[c],
            slots: nextTapes[c].slots.map(s =>
              s.fileId === fileId ? { ...s, fileId: null } : s
            )
          }
        });
      }

      // 4. Assign to free slot
      // finding index of free slot
      const slotIndex = nextTapes[color].slots.findIndex(s => s.id === freeSlot.id);
      if (slotIndex >= 0) {
        nextTapes[color] = {
          ...nextTapes[color],
          slots: nextTapes[color].slots.map((s, idx) =>
            idx === slotIndex ? { ...s, fileId: fileId } : s
          )
        };
      }

      return { files: nextFiles, tapes: nextTapes };
    });
  };

  const handleRemoveFromTape = (slotId: number) => {
    setState(prev => {
      const nextTapes = { ...prev.tapes };
      const currentTape = nextTapes[currentTapeColor];

      nextTapes[currentTapeColor] = {
        ...currentTape,
        slots: currentTape.slots.map(s =>
          s.id === slotId ? { ...s, fileId: null } : s
        )
      };

      return { ...prev, tapes: nextTapes };
    });
  };

  const handleImportFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;

    setIsProcessing(true);
    try {
      const result: any = await parseImportFiles(e.target.files, (curr, total) => {
        setProgressMsg(`Importing file ${curr} of ${total}...`);
      });

      const newFiles = result.files;
      const newAssignments = result.tapes;

      setState(prev => {
        const nextFiles = { ...prev.files, ...newFiles };
        const nextTapes = { ...prev.tapes };

        Object.entries(newAssignments).forEach(([color, slots]: [string, any]) => {
          const c = color as TapeColor;
          slots.forEach((assignment: any) => {
            nextTapes[c] = {
              ...nextTapes[c],
              slots: nextTapes[c].slots.map(s =>
                s.id === assignment.slotId ? { ...s, fileId: assignment.fileId } : s
              )
            };
          });
        });

        return { files: nextFiles, tapes: nextTapes };
      });

    } catch (err) {
      console.error(err);
      alert("Import failed");
    } finally {
      setIsProcessing(false);
      setProgressMsg('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSampleImport = async (url: string, name: string) => {
    setIsProcessing(true);
    setProgressMsg(`Downloading ${name}...`);
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Network response was not ok");
      const blob = await response.blob();

      const { buffer, blob: processedBlob } = await audioEngine.loadAndProcessAudio(blob);

      const fileId = generateId();
      const versionId = generateId();

      const version: AudioVersion = {
        id: versionId,
        timestamp: Date.now(),
        description: 'Imported Sample',
        blob: processedBlob,
        duration: buffer.duration
      };

      const newFile: FileRecord = {
        id: fileId,
        name: name.toUpperCase().replace(/\.[^/.]+$/, ""),
        originalName: name,
        versions: [version],
        currentVersionId: versionId,
        isParked: true // Unassigned by default
      };

      setState(prev => ({
        ...prev,
        files: { ...prev.files, [fileId]: newFile }
      }));

      // Feedback toast
      setToast({ msg: `Imported ${name}`, type: 'success' });

    } catch (e) {
      console.error(e);
      setToast({ msg: "Error importing sample", type: 'error' });
    } finally {
      setIsProcessing(false);
      setProgressMsg('');
    }
  };

  const tapeMetadata: Record<TapeColor, { hex: string }> = {
    Blue: { hex: '#00aaff' },
    Green: { hex: '#00ff00' },
    Pink: { hex: '#ff00ff' },
    Red: { hex: '#f00f13' },
    Turquoise: { hex: '#00ffff' },
    Yellow: { hex: '#ffff00' },
  };

  return (
    <div className="flex h-screen bg-synthux-main text-white font-sans overflow-hidden">

      {/* Sidebar Tape Selector */}
      <TapeSelector
        currentTape={currentTapeColor}
        onSelect={setCurrentTapeColor}
        onDropOnTape={handleTapeDrop}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Header */}
        <header className="h-16 border-b border-gray-800 flex items-center justify-between px-6 bg-synthux-panel">
          <div className="flex items-center gap-4">
            <img src={logoImg} alt="Spotykach Logo" className="h-10 w-auto object-contain" />
            <span className="text-[2rem] font-bold tracking-tight bg-gradient-to-r from-synthux-orange to-synthux-yellow bg-clip-text text-transparent hidden md:block font-header leading-none pt-2">
              Spotykach .WAV builder
            </span>
          </div>

          {/* HIDDEN INPUTS */}
          <input
            type="file"
            multiple
            {...{ webkitdirectory: "" } as any}
            ref={fileInputRef}
            onChange={handleImportFiles}
            className="hidden"
          />
          {/* Single File Upload Input (Used by SlotGrid) */}
          <input
            type="file"
            ref={singleFileInputRef}
            onChange={(e) => {
              if (e.target.files && targetSlotForUpload !== null) {
                handleSlotDrop(targetSlotForUpload, e.target.files);
              }
              setTargetSlotForUpload(null);
              if (singleFileInputRef.current) singleFileInputRef.current.value = '';
            }}
            className="hidden"
          />

          <div className="flex gap-4">
            <button
              onClick={() => setShowInfo(true)}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors border border-transparent hover:border-gray-600"
              title="Information"
            >
              <Info size={20} />
            </button>

            <div className="h-6 w-px bg-gray-700 my-auto"></div>

            {/* Import */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-lg transition-colors text-sm font-bold border border-gray-700"
              title="Import SK folder or project folder"
            >
              <Upload size={16} /> <span className="hidden sm:inline">Import</span>
            </button>

            <div className="h-6 w-px bg-gray-700 my-auto"></div>

            {/* Save Project */}
            <button
              onClick={() => exportSaveState(state)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-lg transition-colors text-sm font-bold border border-gray-700"
              title="Save Project (JSON)"
            >
              <FileJson size={16} /> <span className="hidden sm:inline">Project</span>
            </button>

            {/* Export All (SK Zip) */}
            <button
              onClick={() => exportZip(state)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-lg transition-colors text-sm font-bold border border-gray-700"
              title="Save SK Zip"
            >
              <Download size={16} /> <span className="hidden sm:inline">SK Zip</span>
            </button>

            {/* Export SD */}
            <button
              onClick={() => exportToSDCard(state)}
              className="flex items-center gap-2 px-4 py-2 bg-synthux-blue hover:bg-blue-500 text-white rounded-lg transition-colors text-sm font-bold shadow-lg shadow-blue-900/20"
              title="Save to SD Card"
            >
              <HardDrive size={16} /> <span className="hidden sm:inline">To SD</span>
            </button>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          <FileBrowser
            files={Object.values(state.files)}
            tapes={state.tapes}
            onParkRequest={handleParkRequest}
            onOpenSampleBrowser={() => setShowSampleBrowser(true)}
          />

          {/* Grid Area */}
          <main className="flex-1 overflow-y-auto p-4 flex flex-col items-center relative">

            {/* Background Decoration */}
            <div
              className="absolute right-0 bottom-0 pointer-events-none z-0 overflow-hidden w-full h-full"
              style={{
                // Ensure it doesn't block clicks
                zIndex: 0
              }}
            >
              <div
                className="absolute right-0 bottom-0 animate-slow-spin opacity-15"
                style={{
                  width: '120%',
                  aspectRatio: '1/1',
                  transform: 'translate(50%, 50%)', // Center on bottom-right corner
                  maskImage: `url(${tapeIcon})`,
                  maskSize: 'contain',
                  maskPosition: 'center',
                  maskRepeat: 'no-repeat',
                  WebkitMaskImage: `url(${tapeIcon})`,
                  WebkitMaskSize: 'contain',
                  WebkitMaskPosition: 'center',
                  WebkitMaskRepeat: 'no-repeat',
                  backgroundColor: `var(--color-synthux-${
                    // Helper to map Color to Var Name (Need to duplicate logic or import?)
                    // Simple inline map for now to avoid refactor overhead
                    (currentTapeColor === 'Red' ? 'red' :
                      currentTapeColor === 'Blue' ? 'blue' :
                        currentTapeColor === 'Green' ? 'green' :
                          currentTapeColor === 'Pink' ? 'pink' :
                            currentTapeColor === 'Yellow' ? 'yellow' :
                              currentTapeColor === 'Turquoise' ? 'turquoise' : 'blue')
                    })`,
                }}
              />
            </div>

            <div className="w-full max-w-5xl py-8 relative z-10">
              {(() => {
                return (
                  <div className="flex items-center gap-3 mb-6">
                    <h2 style={{ color: tapeMetadata[currentTapeColor as TapeColor].hex }} className="text-4xl font-bold font-header tracking-tight uppercase drop-shadow-md">
                      Tape {currentTapeColor}
                    </h2>
                    <button
                      onClick={() => exportSingleTape(currentTapeColor, currentTape, state.files)}
                      className="p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                      title={`Download ${currentTapeColor} Tape (Zip)`}
                    >
                      <Download size={20} />
                    </button>
                  </div>
                );
              })()}

              <SlotGrid
                slots={currentTape.slots}
                files={state.files}
                tapeColor={currentTapeColor}
                activeSlotId={activeSlotId}
                onSlotClick={(id) => {
                  const slot = currentTape.slots.find(s => s.id === id);
                  if (slot && slot.fileId) {
                    setActiveSlotId(id);
                  } else {
                    // Empty slot -> Trigger Upload
                    setTargetSlotForUpload(id);
                    singleFileInputRef.current?.click();
                  }
                }}
                onSlotDrop={handleSlotDrop}
                onSlotDropInternal={(slotId, fileId, source) => {
                  // If moving from another slot -> clear old slot logic?
                  // Currently we rely on "unique assignment logic" in handleSlotDropInternal
                  // which clears previous slot if needed.
                  handleSlotDropInternal(slotId, fileId, source);
                }}
                onRemoveSlot={handleRemoveFromTape}
              />
            </div>
          </main>
        </div>

        {/* Editor Modal */}
        {showEditor && activeFile && (
          <ErrorBoundary>
            {(() => {
              const currentVersion = activeFile.versions.find(v => v.id === activeFile.currentVersionId);
              const blob = currentVersion?.blob;

              // Defensive Check for valid Blob
              if (!blob || !(blob instanceof Blob)) {
                return (
                  <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
                    <div className="bg-gray-900 p-6 rounded-lg text-center max-w-sm border border-red-900">
                      <h3 className="text-red-500 font-bold mb-2">Audio Data Missing</h3>
                      <p className="text-sm text-gray-400 mb-4">
                        The audio file for "{activeFile.name}" could not be loaded.
                        This usually happens if the data cache was cleared or corrupted.
                      </p>
                      <button
                        onClick={() => setActiveSlotId(null)}
                        className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded text-sm"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <WaveformEditor
                  slot={{ ...activeSlot!, name: activeFile.name, blob } as any}
                  versions={activeFile.versions}
                  activeVersionId={activeFile.currentVersionId}
                  onClose={() => setActiveSlotId(null)}
                  onSave={(newBlob, duration, description, isDirty) => {
                    if (!activeFileId) return;

                    // SMART SAVE LOGIC
                    if (!isDirty) {
                      // File unchanged. Just ensure assignment (already done usually).
                      // We could force re-assignment validation here if needed, but for now just close.
                      // Maybe update timestamp or something? No, keep it clean.
                      // showToast is handled by Editor? No, Editor closed.
                      // Editor called onClose().
                      // Wait, if Editor calls onClose(), we just unmount.
                      // We don't need to do anything here except maybe ensure the slot points to this file (it does).
                      return;
                    }

                    const fileId = activeFileId;
                    const versionId = generateId();
                    const version: AudioVersion = {
                      id: versionId,
                      timestamp: Date.now(),
                      description: description || 'Edited',
                      blob: newBlob,
                      duration
                    };

                    setState(prev => ({
                      ...prev,
                      files: {
                        ...prev.files,
                        [fileId]: {
                          ...prev.files[fileId],
                          versions: [version, ...prev.files[fileId].versions],
                          currentVersionId: versionId
                        }
                      }
                    }));

                  }}
                  onSaveAsCopy={(newBlob, duration) => {
                    const fileId = generateId();
                    const versionId = generateId();
                    const version: AudioVersion = {
                      id: versionId,
                      timestamp: Date.now(),
                      description: 'Copy from ' + activeFile.name,
                      blob: newBlob,
                      duration
                    };

                    const newFile: FileRecord = {
                      id: fileId,
                      name: activeFile.name + "_COPY",
                      originalName: activeFile.originalName,
                      versions: [version],
                      currentVersionId: versionId,
                      isParked: true
                    };

                    // ALSO record this action in the source file's history
                    const sourceVersionId = generateId();
                    const sourceVersion: AudioVersion = {
                      id: sourceVersionId,
                      timestamp: Date.now(),
                      description: 'Saved to Pool',
                      blob: newBlob,
                      duration
                    };

                    setState(prev => ({
                      ...prev,
                      files: {
                        ...prev.files,
                        [fileId]: newFile,
                        // Update active file history
                        [activeFileId!]: {
                          ...prev.files[activeFileId!],
                          versions: [sourceVersion, ...prev.files[activeFileId!].versions],
                          currentVersionId: sourceVersionId
                        }
                      }
                    }));
                  }}
                />
              );
            })()}
          </ErrorBoundary>
        )}

        {/* Overlay Loading */}
        {isProcessing && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
            <div className="flex flex-col items-center">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
              <div className="text-white font-medium">{progressMsg}</div>
            </div>
          </div>
        )}

        {showInfo && <InfoModal onClose={() => setShowInfo(false)} />}

        <SamplePackModal
          isOpen={showSampleBrowser}
          onClose={() => setShowSampleBrowser(false)}
          onImport={handleSampleImport}
        />

        {toast && (
          <Toast
            message={toast.msg}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}

      </div>
    </div>
  );
}

export default App;
