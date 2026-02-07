import { useState, useRef, useEffect } from 'react';
import { TapeSelector } from './components/TapeSelector';

import logoImg from './assets/img/Spotykach_Logo.webp?url';
import tapeIcon from './assets/img/spotykachtapeicon.svg?url';
import { SlotGrid } from './components/SlotGrid';
import { AllViewGrid } from './components/AllViewGrid';
import { WaveformEditor } from './components/WaveformEditor';
import { FileBrowser } from './components/FileBrowser';
import type { AppState, TapeColor, FileRecord, AudioVersion } from './types';
import { getInitialState } from './utils/initialState';
import { audioEngine } from './lib/audio/audioEngine';
import { exportZip, exportSaveState, exportToSDCard, exportSingleTape } from './utils/exportUtils';
import { parseImportFiles } from './utils/importUtils';
import { InfoModal } from './components/InfoModal';
import { ConfirmModal } from './components/ConfirmModal';
import { SamplePackModal } from './components/SamplePackModal';
import { Toast, type ToastType } from './components/Toast';
import { Info, Upload, Download, FileJson, HardDrive, Play, Pause } from 'lucide-react';
import { TapeIcon } from './components/TapeIcon';

import { ErrorBoundary } from './components/ErrorBoundary';
import { loadStateFromDB, saveStateToDB } from './utils/persistence';




function App() {
  const [state, setState] = useState<AppState>(getInitialState());
  const [currentTapeColor, setCurrentTapeColor] = useState<TapeColor>('Blue');
  const [viewMode, setViewMode] = useState<'single' | 'all'>('single');
  const [activeSlotId, setActiveSlotId] = useState<number | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [showSampleBrowser, setShowSampleBrowser] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: ToastType } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [showSDConfirm, setShowSDConfirm] = useState(false);
  const [showProjectSaveConfirm, setShowProjectSaveConfirm] = useState(false);
  const [showImportConfirm, setShowImportConfirm] = useState(false);

  // Import Handler Wrapper
  const handleImportClick = () => {
    setShowImportConfirm(true);
  };

  const handleImportConfirm = () => {
    setShowImportConfirm(false);
    fileInputRef.current?.click();
  };

  // Wrapper for Zip Export
  const handleZipExport = async () => {
    setIsProcessing(true);
    setProgressMsg('Zipping files...');
    try {
      await exportZip(state);
      setToast({ msg: "Zip created successfully!", type: 'success' });
    } catch (e) {
      console.error(e);
      setToast({ msg: "Failed to create Zip.", type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Wrapper for Project Export
  const handleProjectExport = async () => {
    setIsProcessing(true);
    setProgressMsg('Saving project...');
    try {
      await exportSaveState(state);
      setToast({ msg: "Project saved successfully!", type: 'success' });
    } catch (e) {
      console.error(e);
      setToast({ msg: "Failed to save project.", type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Wrapper for SD Export (The actual action)
  const handleSDExport = async () => {
    setShowSDConfirm(false);
    setIsProcessing(true);
    setProgressMsg('Writing to SD Card...');
    try {
      await exportToSDCard(state);
      setToast({ msg: "Export to SD successful!", type: 'success' });
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : "Failed to write to SD.";
      setToast({ msg, type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

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
  const handleSlotDrop = async (slotId: number, files: FileList, targetColor: TapeColor = currentTapeColor) => {
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
          [targetColor]: {
            ...prev.tapes[targetColor],
            slots: prev.tapes[targetColor].slots.map(s =>
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
  const handleSlotDropInternal = (targetSlotId: number, fileId: string, source: string, isDuplicate: boolean = false, targetColor: TapeColor = currentTapeColor) => {
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
      const targetTape = nextTapes[targetColor];
      const targetSlot = targetTape.slots.find(s => s.id === targetSlotId);
      const previousFileId = targetSlot?.fileId;

      // If occupied, what do we do? Swap? Park the old one?
      // Let's Park the old one for now to keep it simple, or Swap if source was slot?
      if (previousFileId) {
        // Park the occupant
        nextFiles[previousFileId] = { ...nextFiles[previousFileId], isParked: true };
      }

      // Assign new file
      nextTapes[targetColor] = {
        ...nextTapes[targetColor],
        slots: nextTapes[targetColor].slots.map(s =>
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
              // NOTE: If we move to a different tape, we definitely clear the old one.
              // If same tape, we check slot id.
              const isTargetLocation = c === targetColor && s.id === targetSlotId;

              if (s.fileId === fileId && !isTargetLocation) {
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

  // Handle Drop on "View All" Icon (Auto-Fill first free slot)
  const handleDropOnViewAll = (fileId: string, source: string, isDuplicate: boolean) => {
    setState(prev => {
      const nextFiles = { ...prev.files };
      const nextTapes = { ...prev.tapes };

      // 1. Find First Free Slot across all tapes (Order: TAPE_COLORS)
      let targetSlotId: number | null = null;
      let targetColor: TapeColor | null = null;

      // Helper: get TAPE_COLORS from types (we need to import or re-declare if not available, but we can iterate keys or use the constant if imported)
      // TAPE_COLORS is imported from types in line 9
      // We need TAPE_COLORS array. It is imported in line 9? Let's check imports.
      // Yes line 9: import type { ... } from './types'. Wait, TAPE_COLORS is a const, not type.
      // Check imports first. If not imported, we need to add it to imports.

      // Assuming TAPE_COLORS is imported or we use Object.keys (but keys order is not guaranteed).
      // Let's assume we need to add it to imports or use a hardcoded list for order validity.
      const colors: TapeColor[] = ['Blue', 'Green', 'Pink', 'Red', 'Turquoise', 'Yellow'];

      for (const color of colors) {
        const tape = nextTapes[color];
        const freeSlot = tape.slots.find(s => s.fileId === null);
        if (freeSlot) {
          targetSlotId = freeSlot.id;
          targetColor = color;
          break;
        }
      }

      if (targetSlotId === null || !targetColor) {
        alert("All tapes are full!");
        return prev;
      }

      // 2. Unpark if from browser
      if (source === 'browser') {
        nextFiles[fileId] = { ...nextFiles[fileId], isParked: false };
      }

      // 3. Move Logic (Clear old slot if not duplicate)
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

      // 4. Assign to new slot
      nextTapes[targetColor] = {
        ...nextTapes[targetColor],
        slots: nextTapes[targetColor].slots.map(s =>
          s.id === targetSlotId ? { ...s, fileId: fileId } : s
        )
      };

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

  const handleAllViewSlotClick = (slotId: number, color: TapeColor) => {
    // 1. Switch Context
    setCurrentTapeColor(color);

    // 2. Check content
    const tape = state.tapes[color];
    const slot = tape.slots.find(s => s.id === slotId);

    if (slot && slot.fileId) {
      // 3a. Open Editor
      setActiveSlotId(slotId);
      // We ALSO need to set viewMode to 'single' IF we want the spinning backdrop color to match immediately?
      // Or does Editor overlay everything? Editor is a modal.
      // However, user might expect to be in that tape's view if they close the editor?
      // Let's switch viewMode to 'single' so when they close the editor, they are on that tape.
      // Let's switch viewMode to 'single' so when they close the editor, they are on that tape.
      // USER REQUEST: Stay in All View (removed setViewMode)
      // setViewMode('single');
    } else {
      // 3b. Open Upload
      // We must track which tape this upload is for!
      // currently setTargetSlotForUpload stores ID.
      setTargetSlotForUpload(slotId);
      // IMPORTANT: Single File Input handler (line 546) uses `currentTapeColor`.
      // Since we just set setCurrentTapeColor(color) above, React state update might not be immediate 
      // inside the event handler if we triggered click immediately.
      // However, setState is async.
      // By the time `onChange` fires on the input, re-render will have happened with new `currentTapeColor`.
      // So this is safe!
      // USER REQUEST: Stay in All View (removed setViewMode)
      singleFileInputRef.current?.click();
    }
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
        isAllView={viewMode === 'all'}
        onSelect={(color) => {
          setCurrentTapeColor(color);
          setViewMode('single');
        }}
        onToggleAllView={() => setViewMode('all')}
        onDropOnTape={handleTapeDrop}
        onDropOnViewAll={handleDropOnViewAll}
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
                // Determine color? Single file input is only used by SlotGrid (currentTape) or maybe AllView?
                // Currently setTargetSlotForUpload is only called in SlotGrid (Single View) and AllView.
                // We need to know which tape too if we support upload in AllView.
                // For now, let's assume currentTapeColor for Single View.
                // If AllView calls this, we need to track targetColorForUpload.
                // Let's defer exact AllView upload "click to upload" support or assume it uses currentTapeColor?
                // Actually AllView upload isn't fully wired for "click empty slot", simpler to just support D&D for now in AllView.
                // Fixing for Single View:
                handleSlotDrop(targetSlotForUpload, e.target.files, currentTapeColor);
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
              onClick={handleImportClick}
              className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-lg transition-colors text-sm font-bold border border-gray-700"
              title="Import SK folder or project folder"
            >
              <Upload size={16} /> <span className="hidden sm:inline">Import</span>
            </button>

            <div className="h-6 w-px bg-gray-700 my-auto"></div>

            {/* Save Project */}
            <button
              onClick={() => setShowProjectSaveConfirm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-lg transition-colors text-sm font-bold border border-gray-700"
              title="Save Project (JSON)"
            >
              <FileJson size={16} /> <span className="hidden sm:inline">Project</span>
            </button>

            {/* Export All (SK Zip) */}
            <button
              onClick={handleZipExport}
              className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-lg transition-colors text-sm font-bold border border-gray-700"
              title="Save SK Zip"
            >
              <Download size={16} /> <span className="hidden sm:inline">SK Zip</span>
            </button>

            {/* Export SD */}
            <button
              onClick={() => setShowSDConfirm(true)}
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
                  backgroundColor: viewMode === 'all' ? '#ffffff' : `var(--color-synthux-${
                    // Helper to map Color to Var Name (Need to duplicate logic or import?)
                    // Simple inline map for now to avoid refactor overhead
                    (currentTapeColor === 'Red' ? 'red' :
                      currentTapeColor === 'Blue' ? 'blue' :
                        currentTapeColor === 'Green' ? 'green' :
                          currentTapeColor === 'Pink' ? 'pink' :
                            currentTapeColor === 'Yellow' ? 'yellow' :
                              currentTapeColor === 'Turquoise' ? 'turquoise' : 'blue')
                    })`,
                  opacity: viewMode === 'all' ? 0.05 : undefined
                }}
              />
            </div>

            <div className="w-full max-w-5xl py-8 relative z-10">
              {viewMode === 'single' ? (
                <>
                  <div className="flex items-center gap-4 mb-6 w-full">
                    {/* Tape Icon */}
                    <div className="flex items-center justify-center">
                      <TapeIcon color={`var(--color-synthux-${currentTapeColor.toLowerCase()})`} size={40} />
                    </div>
                    {/* Title */}
                    <div className="flex-1">
                      <h2
                        style={{ color: `var(--color-synthux-${currentTapeColor.toLowerCase()})` }}
                        className="text-4xl font-bold font-header tracking-tight uppercase drop-shadow-md shrink-0"
                      >
                        Tape {currentTapeColor}
                      </h2>
                    </div>

                    {/* Actions */}
                    <button
                      onClick={() => exportSingleTape(currentTapeColor, currentTape, state.files)}
                      className="p-3 rounded-full bg-gray-800 hover:bg-white/10 text-gray-400 hover:text-white transition-colors border border-gray-700 hover:border-gray-500"
                      title={`Download ${currentTapeColor} Tape (Zip)`}
                    >
                      <Download size={20} />
                    </button>
                  </div>

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
                    onSlotDrop={(id, files) => handleSlotDrop(id, files, currentTapeColor)}
                    onSlotDropInternal={(slotId, fileId, source) => {
                      handleSlotDropInternal(slotId, fileId, source, false, currentTapeColor);
                    }}
                    onRemoveSlot={handleRemoveFromTape}
                  />
                </>
              ) : (
                <div className="bg-black/40 rounded-3xl p-4 border border-white/5 backdrop-blur-md">
                  <div className="flex items-center gap-3 mb-6 px-4">
                    <h2 className="text-4xl font-bold font-header tracking-tight uppercase text-white drop-shadow-md">
                      All Tapes
                    </h2>
                  </div>
                  <AllViewGrid
                    tapes={state.tapes}
                    files={state.files}
                    onRemoveSlot={(slotId) => handleRemoveFromTape(slotId)}
                    onSlotDrop={handleSlotDrop} // AllViewGrid will pass color
                    onSlotDropInternal={handleSlotDropInternal} // AllViewGrid will pass color
                    onSlotClick={handleAllViewSlotClick}
                  />
                </div>
              )}
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
                  tapeColor={currentTapeColor}
                  onClose={() => setActiveSlotId(null)}
                  onSave={(newBlob, duration, description, isDirty, processing) => {
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
                      duration,
                      processing
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
                  onDeleteVersion={(versionId) => {
                    if (!activeFileId) return;

                    setState(prev => {
                      const file = prev.files[activeFileId];
                      if (!file) return prev;
                      if (file.versions.length <= 1) return prev; // Keep at least one

                      const newVersions = file.versions.filter(v => v.id !== versionId);
                      let newCurrentId = file.currentVersionId;

                      // If current version is deleted, switch to the first available one
                      // (Which will be the previous one since we prepend new ones)
                      if (file.currentVersionId === versionId) {
                        newCurrentId = newVersions[0].id; // New newest version
                      }

                      return {
                        ...prev,
                        files: {
                          ...prev.files,
                          [activeFileId]: {
                            ...file,
                            versions: newVersions,
                            currentVersionId: newCurrentId
                          }
                        }
                      };
                    });
                  }}
                  onAssignVersion={(versionId) => {
                    if (!activeFileId) return;
                    setState(prev => ({
                      ...prev,
                      files: {
                        ...prev.files,
                        [activeFileId]: {
                          ...prev.files[activeFileId],
                          currentVersionId: versionId
                        }
                      }
                    }));
                    setToast({ msg: "Version Assigned to Slot 🫡", type: "success" });
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

        {/* Project Save Confirm */}
        <ConfirmModal
          isOpen={showProjectSaveConfirm}
          onClose={() => setShowProjectSaveConfirm(false)}
          onConfirm={handleProjectExport}
          title="Save Project Backup"
          confirmLabel="Download Backup"
          message={
            <div className="space-y-4">
              <p>
                This will download a <code>.zip</code> file containing your entire project state (JSON) and all source audio files.
              </p>
              <div className="bg-blue-500/10 border border-blue-500/30 p-4 rounded-lg text-sm text-gray-300">
                <strong className="text-blue-400 block mb-1">Why save?</strong>
                Browser storage is temporary. If you clear your cache or change computers, your work will be lost unless you save this backup file.
              </div>
            </div>
          }
        />

        {/* Import Confirm */}
        <ConfirmModal
          isOpen={showImportConfirm}
          onClose={() => setShowImportConfirm(false)}
          onConfirm={handleImportConfirm}
          title="Import Project or Folder"
          confirmLabel="Select File/Folder"
          message={
            <div className="space-y-4">
              <p>
                You can import a previously saved <code>spotykach_project.zip</code> to restore your session, or any folder containing audio files.
              </p>
              <div className="bg-synthux-blue/10 border border-synthux-blue/30 p-4 rounded-lg text-sm text-gray-300">
                <strong className="text-synthux-blue block mb-1 flex items-center gap-2">
                  <HardDrive size={14} /> Edit Existing SD Card
                </strong>
                <p className="mb-2">
                  You can select an existing <strong>Spotykach SD Card folder</strong> (e.g. the <code>SK</code> folder) to load your tapes, tweak them, and rearrange slots.
                </p>
                <p className="text-xs text-gray-400 italic">
                  Note: Changes are NOT saved automatically back to the folder. You must use "Export to SD" when you are finished.
                </p>
              </div>
            </div>
          }
        />

        <ConfirmModal
          isOpen={showSDConfirm}
          onClose={() => setShowSDConfirm(false)}
          onConfirm={handleSDExport}
          title="Export to SD Card"
          confirmLabel="Select Folder & Write"
          message={
            <div className="space-y-4">
              <p>
                You are about to write files directly to a folder on your computer (or SD card).
              </p>
              <div className="bg-synthux-yellow/10 border border-synthux-yellow/30 p-4 rounded-lg text-sm text-gray-300">
                <strong className="text-synthux-yellow block mb-1">Important:</strong>
                <ul className="list-disc list-inside space-y-1">
                  <li>Please select the <strong>Root Directory</strong> of your SD Card.</li>
                  <li>Existing files in <code>SK/BLUE</code>, <code>SK/RED</code> etc. will be <strong>overwritten</strong>.</li>
                  <li>The browser will ask for permission to view/edit files.</li>
                </ul>
              </div>
            </div>
          }
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
