import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { TapeSelector } from './components/TapeSelector';

import logoImg from './assets/img/Spotykach_Logo.webp?url';
import tapeIcon from './assets/img/spotykachtapeicon.svg?url';
import { SlotGrid } from './components/SlotGrid';
import { AllViewGrid } from './components/AllViewGrid';
import { WaveformEditor } from './components/WaveformEditor';
import { FileBrowser } from './components/FileBrowser';
import type { AppState, TapeColor, FileRecord, AudioVersion, ExportOptions } from './types';
import { TAPE_COLORS } from './types';
import { getInitialState } from './utils/initialState';
import { audioEngine } from './lib/audio/audioEngine';
import { exportSaveState, exportSingleTape, exportSDStructure, exportFilesOnly, loadProjectFromDirectory, saveProjectToDirectory, duplicateProject, verifyProjectBlobs } from './utils/exportUtils';
import { analyzeImport, type ImportAnalysis } from './utils/importUtils';
import { ImportModal } from './components/ImportModal';
import { InfoModal } from './components/InfoModal';
import { HelpModal } from './components/HelpModal';
import { ExportModal } from './components/ExportModal';
import { ExportProgressModal } from './components/ExportProgressModal';
import { SampleBrowser } from './components/SampleBrowser';
import BrowserChoiceModal from './components/BrowserChoiceModal';
import { TapeIcon } from './components/TapeIcon';
import { DuplicateResolveModal } from './components/DuplicateResolveModal';
import { BulkConflictModal } from './components/BulkConflictModal';
import { ProjectManager } from './components/ProjectManager';
import { ProjectSyncModal } from './components/ProjectSyncModal';
import { LibraryManager } from './components/LibraryManager';
import { LibrarySyncModal } from './components/LibrarySyncModal';
import { AlertTriangle, Folder, Save, Loader, Download, Info, HelpCircle, FilePlus, ArrowLeft, ArrowRight, Settings, StickyNote, ScrollText, ChevronDown, X, FileText } from 'lucide-react';
import { RiSdCardMiniLine } from 'react-icons/ri';

import { ConfirmModal } from './components/ConfirmModal';
import { Toast, type ToastType, type ToastData } from './components/Toast';
import { LogModal } from './components/LogModal';
import { logger } from './utils/logger';
import { SetupWizard } from './components/SetupWizard';
import { SettingsModal } from './components/SettingsModal';
import { ExportPreviewModal } from './components/ExportPreviewModal';
import { CleanupModal } from './components/CleanupModal';
import { NotesEditor } from './components/NotesEditor';
import { MissingFilesResolver, type MissingAsset } from './components/MissingFilesResolver';
import { ConfigModal } from './components/ConfigModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Rnd } from 'react-rnd';

import { useAudioPlayer } from './contexts/AudioPlayerContext';

// Confirm Action Helper
import { loadStateFromDB, clearState } from './utils/persistence';
import { saveDirectoryHandle, getDirectoryHandle } from './utils/storageUtils';
import { resolveAssetPath, hashBlob } from './utils/assetUtils';

const sanitizeFilename = (name: string) => {
  return name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
};

const getNotePreview = (notes?: string) => {
  if (!notes) return '';
  const firstLine = notes.split('\n').find(line => line.trim() !== '') || '';
  // Basic markdown removal: # title, **bold**, *italic*, [link](url), `code`
  return firstLine
    .replace(/^[#\s\*-\+>]+/, '') // Headers, lists, quotes
    .replace(/(\*\*|__)(.*?)\1/g, '$2') // Bold
    .replace(/(\*|_)(.*?)\1/g, '$2') // Italic
    .replace(/\[(.*?)\]\(.*?\)/g, '$1') // Links
    .replace(/`{1,3}(.*?)`{1,3}/g, '$1') // Code
    .trim();
};

function App() {
  console.log("App Component Rendered");
  // ==========================================
  // STATE DEFINITIONS
  // ==========================================
  const [state, setState] = useState<AppState>(getInitialState());
  const [restorableHandles, setRestorableHandles] = useState<{ work: FileSystemDirectoryHandle, backup: FileSystemDirectoryHandle | null } | null>(null);
  const [currentTapeColor, setCurrentTapeColor] = useState<TapeColor>('Blue');
  const [viewMode, setViewMode] = useState<'single' | 'all'>('single');
  const [activeSlotId, setActiveSlotId] = useState<number | null>(null);

  const { stop: stopGlobalPlayer } = useAudioPlayer();

  // Modals & UI State
  const [showInfo, setShowInfo] = useState(false);
  const [showProjectNotes, setShowProjectNotes] = useState(false);
  const [isProjectNotesMinimized, setIsProjectNotesMinimized] = useState(false);

  // Track RND position explicitly for snapping
  const [projectNotesPos, setProjectNotesPos] = useState({
    x: window.innerWidth > 650 ? window.innerWidth - 620 : 20,
    y: 70
  });
  // Track where it was before minimizing
  const [projectNotesPreMinPos, setProjectNotesPreMinPos] = useState({ x: 0, y: 0 });

  // Track explicit sizing for Project Notes to prevent auto-resize conflicts
  const [projectNotesSize, setProjectNotesSize] = useState({
    width: Math.min(600, window.innerWidth - 40),
    height: 400
  });

  const [showHelp, setShowHelp] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showExportProgress, setShowExportProgress] = useState(false);
  const [showSampleBrowser, setShowSampleBrowser] = useState(false);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [sampleBrowserPos, setSampleBrowserPos] = useState({
    x: Math.max(20, (window.innerWidth - 1000) / 2),
    y: 50
  });
  const [sampleBrowserSize, setSampleBrowserSize] = useState({
    width: Math.min(1000, window.innerWidth - 40),
    height: Math.min(window.innerHeight * 0.85, 800)
  });
  const [showBrowserChoiceModal, setShowBrowserChoiceModal] = useState(false);

  const [showDuplicateModal, setShowDuplicateModal] = useState(false);

  // Export Logic State
  const [exportLogs, setExportLogs] = useState<string[]>([]);
  const [isExportComplete, setIsExportComplete] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportProgress, setExportProgress] = useState<number | null>(null);

  // General UI
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const showToast = useCallback((msg: string, type: ToastType = 'success') => {
    setToasts(prev => [...prev, { id: Date.now().toString() + Math.random(), msg, type }]);
    // Map ToastType to LogLevel
    const level = type === 'error' ? 'error' : (type === 'warning' ? 'warn' : 'info');
    logger[level](msg);
  }, []);
  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');

  // Confirm Action Helper
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    message: React.ReactNode;
    onConfirm: () => void;
    isDestructive?: boolean;
    confirmLabel?: string;
    showCancel?: boolean;
  } | null>(null);

  const [importAnalysis, setImportAnalysis] = useState<ImportAnalysis | null>(null);
  const [missingFilesWarning, setMissingFilesWarning] = useState<MissingAsset[] | null>(null);


  // Project Manager State
  const [showProjectManager, setShowProjectManager] = useState(false);
  const [showCleanupModal, setShowCleanupModal] = useState(false);
  const [showLibrarySyncModal, setShowLibrarySyncModal] = useState(false);
  const [syncProjectTarget, setSyncProjectTarget] = useState<string | null>(null);
  const [isWelcomeActive, setIsWelcomeActive] = useState(true); // NEW: Track welcome screen visibility
  const [isEditorDirty, setIsEditorDirty] = useState(false);
  const [foundProjects, setFoundProjects] = useState<import('./types').ProjectSummary[]>([]);
  const [currentProjectName, setCurrentProjectName] = useState<string | undefined>(() => localStorage.getItem('spotykach_current_project') || undefined);
  const [skBackups, setSkBackups] = useState<{ timestamp: string; sizeBytes: number }[]>([]);
  const SK_BACKUP_LIMIT = 5;

  useEffect(() => {
    if (currentProjectName) {
      localStorage.setItem('spotykach_current_project', currentProjectName);
    } else {
      localStorage.removeItem('spotykach_current_project');
    }
  }, [currentProjectName]);

  const [allViewNoteStates, setAllViewNoteStates] = useState<Record<TapeColor, 'collapsed' | 'preview' | 'expanded'>>({
    Blue: 'collapsed', Green: 'collapsed', Pink: 'collapsed', Red: 'collapsed', Turquoise: 'collapsed', Yellow: 'collapsed'
  });

  const [expandedProjectTapeNotes, setExpandedProjectTapeNotes] = useState<Record<TapeColor, boolean>>({
    Blue: false, Green: false, Pink: false, Red: false, Turquoise: false, Yellow: false
  });

  const toggleAllNotes = () => {
    const vals = Object.entries(allViewNoteStates)
      .filter(([color]) => {
        const tape = state.tapes[color as TapeColor];
        return !!tape.notes && tape.notes.trim() !== '';
      })
      .map(([_, s]) => s);

    let newState: 'collapsed' | 'preview' | 'expanded' = 'preview';

    if (vals.length > 0) {
      const anyCollapsed = vals.some(s => s === 'collapsed');
      const anyPreview = vals.some(s => s === 'preview');

      if (anyCollapsed) {
        newState = 'preview';
      } else if (anyPreview) {
        newState = 'expanded';
      } else {
        newState = 'collapsed';
      }
    } else {
      // If there are no tapes with notes, just toggle between expanded and collapsed
      // or probably just default to collapsed to hide everything empty.
      const currentlyAnyExpanded = Object.values(allViewNoteStates).some(s => s !== 'collapsed');
      newState = currentlyAnyExpanded ? 'collapsed' : 'expanded'; // actually probably better to just leave as collapsed
    }

    const newStates = { ...allViewNoteStates };
    TAPE_COLORS.forEach(c => {
      const tape = state.tapes[c];
      const hasNotes = !!tape.notes && tape.notes.trim() !== '';
      if (hasNotes) {
        newStates[c] = newState;
      } else {
        newStates[c] = 'collapsed';
      }
    });

    setAllViewNoteStates(newStates);
  };

  // Workflow / Settings State
  const [workHandle, setWorkHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [backupHandle, setBackupHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Sync Logic State
  const [syncModalState, setSyncModalState] = useState<{
    isOpen: boolean;
    projectName: string;
    diff: import('./utils/importUtils').SyncDiff | null;
    defaultMode?: 'import' | 'push';
  } | null>(null);

  const [activeSKProject, setActiveSKProject] = useState<string | null>(null);
  const [deviceDiff, setDeviceDiff] = useState<import('./utils/importUtils').DeviceDiff | null>(null);

  // ── SK Backup helpers ─────────────────────────────────────────────────────
  const scanSKBackups = async (projectName: string, handle: FileSystemDirectoryHandle) => {
    try {
      const projectDir = await handle.getDirectoryHandle('Projects', { create: false })
        .then(d => d.getDirectoryHandle(projectName, { create: false }));
      let backupsDir: FileSystemDirectoryHandle | null = null;
      try { backupsDir = await projectDir.getDirectoryHandle('_sk_backups', { create: false }); } catch { /* not yet created */ }
      if (!backupsDir) { setSkBackups([]); return; }
      const entries: { timestamp: string; sizeBytes: number }[] = [];
      for await (const [name, entry] of (backupsDir as any).entries()) {
        if (entry.kind === 'directory') {
          let size = 0;
          try {
            for await (const [, fh] of (entry as any).entries()) {
              if ((fh as any).kind === 'file') {
                const f = await (fh as FileSystemFileHandle).getFile();
                size += f.size;
              }
            }
          } catch { /* ignore */ }
          entries.push({ timestamp: name, sizeBytes: size });
        }
      }
      setSkBackups(entries);
    } catch { setSkBackups([]); }
  };

  const createSKBackup = async (projectName: string, workDir: FileSystemDirectoryHandle, sdHandle: FileSystemDirectoryHandle) => {
    try {
      const projectDir = await workDir.getDirectoryHandle('Projects', { create: true })
        .then(d => d.getDirectoryHandle(projectName, { create: true }));
      const backupsDir = await projectDir.getDirectoryHandle('_sk_backups', { create: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const targetDir = await backupsDir.getDirectoryHandle(timestamp, { create: true });

      // Copy SK folder root files from the SD card into target
      const copyDir = async (src: FileSystemDirectoryHandle, dst: FileSystemDirectoryHandle) => {
        for await (const [name, entry] of (src as any).entries()) {
          if ((entry as any).kind === 'file') {
            const file = await (entry as FileSystemFileHandle).getFile();
            const buf = await file.arrayBuffer();
            const writer = await (await dst.getFileHandle(name, { create: true })).createWritable();
            await writer.write(buf);
            await writer.close();
          } else {
            const subDst = await dst.getDirectoryHandle(name, { create: true });
            await copyDir(entry as FileSystemDirectoryHandle, subDst);
          }
        }
      };

      let skFolder: FileSystemDirectoryHandle | null = null;
      try { skFolder = await sdHandle.getDirectoryHandle('SK', { create: false }); } catch { /* maybe a flat structure */ }
      if (skFolder) await copyDir(skFolder, targetDir);

      // Prune old backups beyond the limit
      const allEntries: string[] = [];
      for await (const [name] of (backupsDir as any).entries()) allEntries.push(name);
      const sorted = allEntries.sort();
      if (sorted.length > SK_BACKUP_LIMIT) {
        for (const old of sorted.slice(0, sorted.length - SK_BACKUP_LIMIT)) {
          try { await backupsDir.removeEntry(old, { recursive: true }); } catch { /* ignore */ }
        }
      }
    } catch (e) {
      console.warn('SK backup failed (non-fatal):', e);
    }
  };

  const handleDeleteSKBackup = async (timestamp: string) => {
    if (!workHandle || !currentProjectName) return;
    try {
      const backupsDir = await workHandle
        .getDirectoryHandle('Projects', { create: false })
        .then(d => d.getDirectoryHandle(currentProjectName, { create: false }))
        .then(d => d.getDirectoryHandle('_sk_backups', { create: false }));
      await backupsDir.removeEntry(timestamp, { recursive: true });
      setSkBackups(prev => prev.filter(b => b.timestamp !== timestamp));
      showToast('SK backup deleted', 'success');
    } catch (e: any) {
      showToast('Failed to delete backup: ' + e.message, 'error');
    }
  };

  // ── Zip Import / Export ───────────────────────────────────────────────────
  const handleImportZip = async () => {
    if (!workHandle) {
      showToast('Connect a Work Folder first.', 'error');
      return;
    }
    try {
      // @ts-ignore – showOpenFilePicker is not in all TS libs yet
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'Zip Archive', accept: { 'application/zip': ['.zip'] } }],
        multiple: false,
      });
      const file = await handle.getFile();
      const JSZip = (await import('jszip')).default;
      const zip = await JSZip.loadAsync(file);

      // Determine project name from zip (top-level folder or filename)
      const entries = Object.keys(zip.files);
      const topFolders = [...new Set(entries.map(e => e.split('/')[0]).filter(Boolean))];
      const projectName = topFolders.length === 1 ? topFolders[0] : file.name.replace(/\.zip$/i, '');

      setIsProcessing(true);
      setProgressMsg(`Importing "${projectName}" from zip...`);

      const projectsDir = await workHandle.getDirectoryHandle('Projects', { create: true });
      const projectDir = await projectsDir.getDirectoryHandle(projectName, { create: true });

      for (const [path, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue;
        // Strip leading top-folder prefix if present
        const relPath = topFolders.length === 1 && path.startsWith(topFolders[0] + '/')
          ? path.slice(topFolders[0].length + 1)
          : path;
        if (!relPath) continue;

        const parts = relPath.split('/');
        let dir: FileSystemDirectoryHandle = projectDir;
        for (const part of parts.slice(0, -1)) {
          dir = await dir.getDirectoryHandle(part, { create: true });
        }
        const buf = await entry.async('arraybuffer');
        const fh = await dir.getFileHandle(parts[parts.length - 1], { create: true });
        const w = await fh.createWritable();
        await w.write(buf);
        await w.close();
      }

      await scanProjects(workHandle, backupHandle);
      showToast(`"${projectName}" imported from zip`, 'success');
    } catch (e: any) {
      if (e.name !== 'AbortError') showToast('Import failed: ' + e.message, 'error');
    } finally {
      setIsProcessing(false);
      setProgressMsg('');
    }
  };

  const handleExportZip = async (projectName: string) => {
    if (!workHandle) {
      showToast('Connect a Work Folder first.', 'error');
      return;
    }
    setIsProcessing(true);
    setProgressMsg(`Zipping "${projectName}"...`);
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      const projectDir = await workHandle
        .getDirectoryHandle('Projects', { create: false })
        .then(d => d.getDirectoryHandle(projectName, { create: false }));

      const addDir = async (dir: FileSystemDirectoryHandle, zipPath: string) => {
        for await (const [name, entry] of (dir as any).entries()) {
          if ((entry as any).kind === 'file') {
            const file = await (entry as FileSystemFileHandle).getFile();
            const buf = await file.arrayBuffer();
            zip.file(`${zipPath}/${name}`, buf);
          } else {
            await addDir(entry as FileSystemDirectoryHandle, `${zipPath}/${name}`);
          }
        }
      };
      await addDir(projectDir, projectName);

      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${projectName}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(`"${projectName}" exported as zip`, 'success');
    } catch (e: any) {
      showToast('Export failed: ' + e.message, 'error');
    } finally {
      setIsProcessing(false);
      setProgressMsg('');
    }
  };

  // Computed Mode for UI/Logic compatibility
  // const workflowMode: 'LOCAL' | 'BROWSER' = workHandle ? 'LOCAL' : 'BROWSER';

  // Ref for the Root Handle (SD or Folder) - Merged into workHandle state but we might keep ref for non-reactive access if needed?
  // Actually, let's keep it sync'd or just use state. State is fine for high level.
  // BUT many utils depend on ref.current for async ops without staleness.
  const projectRootHandleRef = useRef<FileSystemDirectoryHandle | null>(null);

  // Sync ref with state
  useEffect(() => {
    projectRootHandleRef.current = workHandle;
  }, [workHandle]);

  // Bulk Conflict State
  const [bulkConflictState, setBulkConflictState] = useState<{
    targetSlotId: number;
    fileIds: string[];
    conflicts: number;
    targetColor?: TapeColor;
    sourceSlotKeys?: string[];
  } | null>(null);

  const [userLibrary, setUserLibrary] = useState<import('./types').UserLibrary>({
    files: {},
    metadata: { artist: '', license: '' }
  });
  const [showLibraryManager, setShowLibraryManager] = useState(false);
  const [libraryManagerInitialTab, setLibraryManagerInitialTab] = useState<'upload' | 'project' | 'manage' | 'settings'>('upload');
  const [libraryManagerHighlightFileId, setLibraryManagerHighlightFileId] = useState<string | null>(null);
  const [missingLibraryFiles, setMissingLibraryFiles] = useState<string[]>([]);

  // Keep missing library files in sync if entries are removed from the index
  useEffect(() => {
    setMissingLibraryFiles(prev => prev.filter(id => !!userLibrary.files[id]));
  }, [userLibrary.files]);

  // Visual Filters State
  const [visualFilters, setVisualFilters] = useState<import('./types').VisualFilters>(() => {
    try {
      const saved = localStorage.getItem('spotykach_visual_filters');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Failed to load visual filters', e);
    }
    return {
      invert: 0,
      grayscale: 0,
      contrast: 1,
      brightness: 1,
      textureOpacity: 0.05,
      fontSize: 1,
      textureImage: 'highrestexture_tapenoisevhs_whitetrans.png',
      textureSize: 'cover',
      texturePosition: 'center'
    };
  });

  // Sync Visual Filters to CSS Variables
  useEffect(() => {
    localStorage.setItem('spotykach_visual_filters', JSON.stringify(visualFilters));
    const root = document.documentElement;
    root.style.setProperty('--master-invert', String(visualFilters.invert));
    root.style.setProperty('--master-grayscale', String(visualFilters.grayscale));
    root.style.setProperty('--master-contrast', String(visualFilters.contrast));
    root.style.setProperty('--master-brightness', String(visualFilters.brightness));
    root.style.setProperty('--master-texture-opacity', String(visualFilters.textureOpacity));
    root.style.setProperty('--master-font-size', `${visualFilters.fontSize * 16}px`);
    const imgDir = visualFilters.textureImage.endsWith('.mp4') || visualFilters.textureImage.endsWith('.gif') ? '/vid/' : '/img/';
    root.style.setProperty('--master-texture-image', `url('${resolveAssetPath(`${imgDir}${visualFilters.textureImage}`)}')`);
    root.style.setProperty('--master-texture-size', visualFilters.textureSize || 'cover');
    root.style.setProperty('--master-texture-position', visualFilters.texturePosition || 'center');
  }, [visualFilters]);

  const handleSaveVisualSettings = async () => {
    if (!projectRootHandleRef.current) {
      showToast("No active project folder found", "error");
      return;
    }

    try {
      const fileHandle = await projectRootHandleRef.current.getFileHandle('visual_settings.json', { create: true });
      const writable = await (fileHandle as any).createWritable();
      await writable.write(JSON.stringify(visualFilters, null, 2));
      await writable.close();
      showToast("Visual settings saved to workspace", "success");
    } catch (e) {
      console.error("Failed to save visual settings", e);
      showToast("Save failed - folder access might be restricted", "error");
    }
  };

  // Advanced Selection
  const [selectedSlots, setSelectedSlots] = useState<Set<string>>(new Set());
  const [lastSelectedSlot, setLastSelectedSlot] = useState<string | null>(null);
  const [anchorSlot, setAnchorSlot] = useState<string | null>(null);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const singleFileInputRef = useRef<HTMLInputElement>(null);
  const [targetSlotForUpload, setTargetSlotForUpload] = useState<number | null>(null);
  const isSlotSampleImportInFlightRef = useRef(false);

  // Handle Reset
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const isFirstRender = useRef(true);
  const isSystemUpdate = useRef(false);

  useEffect(() => {
    logger.setWorkHandle(workHandle);
  }, [workHandle]);

  const handleReset = () => {
    setConfirmAction({
      title: "Reset Application?",
      message: (
        <div className="space-y-2">
          <p>This will <strong>delete all projects, files, and settings</strong>.</p>
          <p className="text-sm text-gray-400">The application will reload with a clean state.</p>
        </div>
      ),
      confirmLabel: "Reset Everything",
      isDestructive: true,
      onConfirm: async () => {
        try {
          await clearState();
          localStorage.removeItem('spotykach_state');
          setState(getInitialState());
          showToast("Application Reset", "success");
          window.location.reload();
        } catch (e) {
          console.error(e);
          showToast("Reset Failed", "error");
        }
      }
    });
  };

  const checkUnsavedChanges = (action: () => void) => {
    // Determine if the project is effectively empty
    const hasAnyFiles = Object.keys(state.files).length > 0;
    const hasProjectNotes = !!(state.projectNotes && state.projectNotes.trim() !== '');
    const hasTapeNotes = TAPE_COLORS.some(color => !!(state.tapes[color]?.notes && state.tapes[color].notes!.trim() !== ''));
    const isProjectEmpty = !hasAnyFiles && !hasProjectNotes && !hasTapeNotes;

    // Only warn if something changed AND the project isn't empty (we don't care about saving empty projects)
    if ((hasUnsavedChanges || isEditorDirty) && !isProjectEmpty) {
      const confirmed = window.confirm("You have unsaved changes. These will be lost. Continue anyway?");
      if (confirmed) action();
    } else {
      action();
    }
  };

  // ==========================================
  // PROJECT MANAGEMENT HANDLERS
  // ==========================================

  const handleScanProjects = async () => {
    await scanProjects(workHandle, backupHandle);
    setShowProjectManager(true);
  };

  const handleLoadProject = async (projectName: string, overrideWorkHandle?: FileSystemDirectoryHandle | null) => {
    const activeWorkHandle = overrideWorkHandle || workHandle;
    if (!activeWorkHandle) return;

    setIsProcessing(true);
    setProgressMsg(`Loading ${projectName}...`);

    try {
      const loadedState = await loadProjectFromDirectory(projectName, activeWorkHandle, (msg) => {
        setProgressMsg(msg || "Loading...");
      });
      const missingAssets = loadedState.loadIssues?.missingAssets || [];

      // Update Ref to point to this new project folder
      const projectsDir = await activeWorkHandle.getDirectoryHandle('Projects');
      projectRootHandleRef.current = await projectsDir.getDirectoryHandle(projectName);

      // Merge with current running state specifics if needed? 
      // No, replace state.
      isSystemUpdate.current = true;
      setState(loadedState);
      setCurrentProjectName(projectName);
      setHasUnsavedChanges(false); // Clean state after load
      setShowProjectManager(false);

      // --- NEW: Load Visual Settings from Workspace ---
      try {
        const projectsDir = await activeWorkHandle.getDirectoryHandle('Projects', { create: false });
        const pDir = await projectsDir.getDirectoryHandle(projectName, { create: false });
        try {
          const vHandle = await pDir.getFileHandle('visual_settings.json', { create: false });
          const vFile = await vHandle.getFile();
          const vText = await vFile.text();
          const vJson = JSON.parse(vText);
          setVisualFilters(vJson);
          console.log("[ProjectLoad] Applied visual settings from workspace");
        } catch (e) {
          // No visual settings file, ignore
        }
      } catch (e) {
        console.warn("[ProjectLoad] Failed to check for visual_settings.json", e);
      }
      if (missingAssets.length > 0) {
        const missingRefsUnique = Array.from(new Set(missingAssets.map(m => m.blobRef)));

        const resolveBackupProjectDir = async (): Promise<FileSystemDirectoryHandle | null> => {
          if (!backupHandle) return null;
          try {
            const wbHandle = await backupHandle.getDirectoryHandle('WAV_Builder', { create: false });
            const projects = await wbHandle.getDirectoryHandle('Projects', { create: false });
            return await projects.getDirectoryHandle(projectName, { create: false });
          } catch {
            try {
              const projects = await backupHandle.getDirectoryHandle('Projects', { create: false });
              return await projects.getDirectoryHandle(projectName, { create: false });
            } catch {
              return null;
            }
          }
        };

        let recoverableRefs = new Set<string>();
        if (backupHandle) {
          try {
            const backupProjectDir = await resolveBackupProjectDir();
            if (backupProjectDir) {
              const backupAssets = await backupProjectDir.getDirectoryHandle('Assets', { create: false });
              for (const blobRef of missingRefsUnique) {
                const parts = blobRef.split('/');
                const fileName = parts[parts.length - 1];
                try {
                  await backupAssets.getFileHandle(fileName, { create: false });
                  recoverableRefs.add(blobRef);
                } catch {
                  // Not recoverable from backup.
                }
              }
            }
          } catch (err) {
            console.warn("Backup cross-reference failed", err);
          }
        }

        const projectMissingAssets: MissingAsset[] = missingAssets.map((asset) => {
          const file = loadedState.files[asset.fileId];
          const slotRefs: string[] = [];

          (Object.entries(loadedState.tapes) as [keyof typeof loadedState.tapes, typeof loadedState.tapes[keyof typeof loadedState.tapes]][]).forEach(([color, tape]) => {
            tape.slots.forEach(slot => {
              if (slot.fileId === asset.fileId) {
                slotRefs.push(`${String(color).charAt(0).toUpperCase()}${slot.id}`);
              }
            });
          });

          return {
            ...asset,
            slots: slotRefs,
            versionCount: file?.versions.length || 1,
            sdRecoverable: recoverableRefs.has(asset.blobRef)
          };
        });

        const sdMatchCount = recoverableRefs.size;
        showToast(`Project "${projectName}" loaded with ${missingAssets.length} missing asset(s).${sdMatchCount > 0 ? ` ${sdMatchCount} match(es) found on SD.` : ''}`, 'info');
        setMissingFilesWarning(projectMissingAssets);
      } else {
        showToast(`Project "${projectName}" Loaded`, 'success');
      }
    } catch (e) {
      console.error(e);
      showToast("Failed to load project", "error");
    } finally {
      setIsProcessing(false);
      setProgressMsg('');
    }
  };




  const handleCreateEmptyProject = async (projectName: string, overrideWorkHandle?: FileSystemDirectoryHandle | null) => {
    const activeWorkHandle = overrideWorkHandle || workHandle;
    if (!activeWorkHandle) {
      showToast("Please set a Work Folder first.", "error");
      return;
    }

    if (!projectName) return;

    setIsProcessing(true);
    setProgressMsg(`Creating Empty Project ${projectName}...`);

    try {
      // 1. Get/Create 'Projects' folder
      const projectsDir = await activeWorkHandle.getDirectoryHandle('Projects', { create: true });

      // 2. Create specific Project folder
      const projectDir = await projectsDir.getDirectoryHandle(projectName, { create: true });

      // 3. Update Ref to point to this new project folder
      projectRootHandleRef.current = projectDir;

      // 4. Save blank state
      const emptyState = getInitialState();
      // @ts-ignore
      await saveProjectToDirectory(emptyState, activeWorkHandle, (msg) => setProgressMsg(msg || ''), projectName);

      // 5. Load blank state into UI map
      setState(emptyState);
      setCurrentProjectName(projectName);
      setHasUnsavedChanges(false);
      showToast("Empty Project Created", "success");

      handleSmartScan(activeWorkHandle);
    } catch (e: any) {
      console.error(e);
      showToast("Failed to create project: " + e.message, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveProjectAs = async (projectName: string) => {
    // If we are in Browser Mode (no workHandle), we can't "Save As" to disk directly without picking a folder.
    // The UI should handle this by asking to Set Work Folder first.
    if (!workHandle) {
      showToast("Please set a Work Folder first.", "error");
      return;
    }

    if (!projectName) return;

    setIsProcessing(true);
    setProgressMsg(`Creating Project ${projectName}...`);

    try {
      // 1. Get/Create 'Projects' folder
      const projectsDir = await workHandle.getDirectoryHandle('Projects', { create: true });

      // 2. Create specific Project folder
      const projectDir = await projectsDir.getDirectoryHandle(projectName, { create: true });

      // 3. Update Ref to point to this new project folder
      projectRootHandleRef.current = projectDir;

      // 4. Save
      // @ts-ignore
      const exportedFiles = await saveProjectToDirectory(state, workHandle, (msg) => setProgressMsg(msg || ''), projectName);

      setCurrentProjectName(projectName);
      setHasUnsavedChanges(false);
      showToast("Project Created & Saved", 'success');

      // Refresh found projects list?
      // Maybe trigger a silent scan or just add to list?
      // For now, simple scan:
      handleSmartScan(workHandle);

    } catch (e: any) {
      console.error(e);
      showToast("Failed to create project: " + e.message, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteProject = async (projectName: string) => {
    setConfirmAction({
      title: "Delete Project",
      message: `Are you sure you want to delete "${projectName}"? This cannot be undone.`,
      confirmLabel: "Delete",
      isDestructive: true,
      showCancel: true,
      onConfirm: async () => {
        setConfirmAction(null);
        if (!workHandle) return;
        setIsProcessing(true);
        setProgressMsg(`Deleting ${projectName}...`);
        try {
          const { deleteProject } = await import('./utils/exportUtils');
          await deleteProject(workHandle, projectName);
          showToast("Project Deleted", 'success');

          // If current project was deleted, create new
          if (currentProjectName === projectName) {
            setCurrentProjectName(undefined);
            setState(getInitialState());
            setHasUnsavedChanges(false);
          }

          await scanProjects(workHandle, backupHandle);
        } catch (e: any) {
          console.error(e);
          showToast("Delete Failed: " + e.message, 'error');
        } finally {
          setIsProcessing(false);
          setProgressMsg('');
        }
      }
    });
  };

  const handleCleanupProject = () => {
    setShowCleanupModal(true);
  };

  const executeProjectCleanup = async (deleteFileIds: string[], deleteVersionIds: Record<string, string[]>) => {
    setShowCleanupModal(false);
    setIsProcessing(true);
    setProgressMsg("Cleaning up project...");

    try {
      const newFiles = { ...state.files };
      let removedFilesCount = 0;
      let removedVersionsCount = 0;

      // 1. Delete entirely selected files
      deleteFileIds.forEach(id => {
        if (newFiles[id]) {
          delete newFiles[id];
          removedFilesCount++;
        }
      });

      // 2. Delete specific versions for other files
      Object.entries(deleteVersionIds).forEach(([fileId, versionIds]) => {
        const file = newFiles[fileId];
        if (file) {
          const vSet = new Set(versionIds);
          const newVersions = file.versions.filter(v => !vSet.has(v.id));
          
          if (newVersions.length < file.versions.length) {
            removedVersionsCount += file.versions.length - newVersions.length;
            
            if (newVersions.length === 0) {
              delete newFiles[fileId];
              removedFilesCount++;
            } else {
              // Ensure currentVersionId still points to a valid version
              let nextCurrentId = file.currentVersionId;
              if (vSet.has(file.currentVersionId)) {
                nextCurrentId = newVersions[0].id;
              }
              newFiles[fileId] = { 
                ...file, 
                versions: newVersions,
                currentVersionId: nextCurrentId
              };
            }
          }
        }
      });

      setState(prev => ({ ...prev, files: newFiles }));

      // Clean up orphaned disk assets if we're working locally
      if (workHandle && currentProjectName) {
        setProgressMsg("Cleaning up disk...");
        const { cleanOrphanedAssets, saveProjectToDirectory } = await import('./utils/exportUtils');
        await cleanOrphanedAssets(workHandle, currentProjectName, newFiles, (msg) => setProgressMsg(msg));

        // Auto-save the updated state to project.json so it matches the new disk state
        setProgressMsg("Saving Project...");
        await saveProjectToDirectory(
          { ...state, files: newFiles },
          workHandle,
          (msg) => setProgressMsg(msg || ''),
          currentProjectName
        );
        setHasUnsavedChanges(false);
      }

      showToast(`Cleaned ${removedFilesCount} files and ${removedVersionsCount} history versions. Project saved.`, 'success');
    } catch (e: any) {
      console.error(e);
      showToast("Cleanup Failed: " + e.message, 'error');
    } finally {
      setIsProcessing(false);
      setProgressMsg('');
    }
  };

  const handleRenameProject = async (oldName: string, newName: string, renameBackup: boolean = false) => {
    if (!workHandle) return;
    try {
      setIsProcessing(true);
      setProgressMsg("Renaming Project...");
      const { renameProject } = await import('./utils/exportUtils');
      // @ts-ignore
      await renameProject(workHandle, oldName, newName);

      if (renameBackup && backupHandle) {
        try {
          setProgressMsg("Renaming Backup...");
          // @ts-ignore
          await renameProject(backupHandle, oldName, newName);
          showToast(`Renamed Local & Backup to "${newName}"`, 'success');
        } catch (e) {
          console.error("Backup rename failed", e);
          showToast(`Renamed Local, but Backup failed`, 'info');
        }
      } else {
        showToast(`Renamed to "${newName}"`, 'success');
      }

      if (currentProjectName === oldName) {
        setCurrentProjectName(newName);
      }
      handleScanProjects();
    } catch (e) {
      console.error(e);
      showToast("Failed to rename project", 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSKRefresh = async () => {
    if (!backupHandle || !syncModalState) return;

    setIsProcessing(true);
    setProgressMsg('Scanning SK folder on SD...');
    try {
      const { calculateSyncDiff, scanSKStructure } = await import('./utils/importUtils');
      const projectName = syncModalState.projectName;

      let projectState = state;
      if (projectName && projectName !== currentProjectName && workHandle) {
        projectState = await loadProjectFromDirectory(projectName, workHandle, (msg) => setProgressMsg(msg || 'Loading...'));
      }

      const structureMap = await scanSKStructure(backupHandle);
      const diff = await calculateSyncDiff(projectState, structureMap);

      setSyncModalState(prev => prev ? { ...prev, diff } : null);
      showToast("SD Card rescanned", "success");
    } catch (e: any) {
      console.error(e);
      showToast("SK scan failed: " + e.message, 'error');
    } finally {
      setIsProcessing(false);
      setProgressMsg('');
    }
  };

  // ==========================================
  // EFFECTS
  // ==========================================

  // Track Unsaved Changes
  // Track Unsaved Changes
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (isSystemUpdate.current) {
      isSystemUpdate.current = false;
      return;
    }

    setHasUnsavedChanges(true);
  }, [state]);

  // Initial Load
  useEffect(() => {
    // Try loading from DB first (Async), falling back to LocalStorage is handled inside loadStateFromDB logic usually?
    // Current persistence.ts handles IDB. 
    loadStateFromDB().then(saved => {
      if (saved) {
        isSystemUpdate.current = true;
        setState(saved);
      } else {
        // Fallback to localStorage if IDB is empty? 
        const savedLS = localStorage.getItem('spotykach_state');
        if (savedLS) {
          try {
            const parsed = JSON.parse(savedLS);
            if (parsed.files && parsed.tapes) {
              isSystemUpdate.current = true;
              setState(parsed);
            }
          } catch (e) { console.error(e); }
        }
      }
    });

    // Load User Library
    import('./utils/persistence').then(({ loadUserLibraryFromDB }) => {
      loadUserLibraryFromDB().then(saved => {
        if (saved) {
          setUserLibrary(saved);
        } else {
          // Fallback for old sessions that may have used localStorage only
          try {
            const raw = localStorage.getItem('spotykach_user_library');
            if (raw) {
              const parsed = JSON.parse(raw);
              if (parsed && parsed.files && parsed.metadata) {
                setUserLibrary(parsed);
              }
            }
          } catch (e) {
            console.error('Failed to parse local user library fallback', e);
          }
        }
      });
    });
  }, []);

  // Check for persistent handles on mount
  useEffect(() => {
    const checkHandles = async () => {
      try {
        const savedWork = await getDirectoryHandle('work');
        const savedBackup = await getDirectoryHandle('backup');

        if (savedWork) {
          setRestorableHandles({ work: savedWork, backup: savedBackup });
        }
      } catch (e) { console.error("Error loading handles", e); }
    };
    checkHandles();
  }, []);

  const handleRestoreSession = async () => {
    if (!restorableHandles) return;

    // @ts-ignore
    let workPermission = await restorableHandles.work.queryPermission({ mode: 'readwrite' });
    if (workPermission !== 'granted') {
      // @ts-ignore
      workPermission = await restorableHandles.work.requestPermission({ mode: 'readwrite' });
    }

    if (workPermission !== 'granted') {
      showToast("Permission denied for Work Folder", 'error');
      return;
    }

    setWorkHandle(restorableHandles.work);

    // Verify Backup Handle (if exists)
    if (restorableHandles.backup) {
      // @ts-ignore
      let backupPermission = await restorableHandles.backup.queryPermission({ mode: 'readwrite' });
      if (backupPermission !== 'granted') {
        // @ts-ignore
        backupPermission = await restorableHandles.backup.requestPermission({ mode: 'readwrite' });
      }
      if (backupPermission === 'granted') {
        setBackupHandle(restorableHandles.backup);
      }
    }

    setIsWelcomeActive(false);
    showToast("Session Restored", 'success');

    // Scan
    await handleSmartScan(restorableHandles.work);

    if (currentProjectName) {
      await handleLoadProject(currentProjectName, restorableHandles.work);
    }
  };

  // Autosave User Library (DB + Local Folder Sync)
  useEffect(() => {
    const handler = setTimeout(async () => {
      // 1. Always save to DB
      const { saveUserLibraryToDB } = await import('./utils/persistence');
      await saveUserLibraryToDB(userLibrary);
      localStorage.setItem('spotykach_user_library', JSON.stringify(userLibrary));

      // 2. Sync to local folder if connected
      if (workHandle) {
        try {
          const { saveUserLibraryToDirectory } = await import('./utils/exportUtils');
          const skipIds = new Set(missingLibraryFiles);
          await saveUserLibraryToDirectory(userLibrary, workHandle, skipIds);
        } catch (e) {
          console.error("Local Library Sync Failed", e);
        }
      }
    }, 2000);
    return () => clearTimeout(handler);
  }, [userLibrary, workHandle, missingLibraryFiles]);

  // Ensure User_Library directory exists when manager opens
  const handleRefreshLibrary = useCallback(async () => {
    if (!workHandle) return;
    try {
      const libDir = await workHandle.getDirectoryHandle('User_Library', { create: true });
      const diskFiles = new Map<string, File>();

      // @ts-ignore
      for await (const [name, entry] of libDir.entries()) {
        if (entry.kind !== 'file') continue;

        // Skip temporary browser files and hidden files
        if (name.startsWith('.') || name.endsWith('.crswap') || name.endsWith('.tmp')) {
          continue;
        }

        const fh = entry as FileSystemFileHandle;
        const file = await fh.getFile();
        diskFiles.set(file.name.toLowerCase(), file);
      }

      let missingFromDisk: string[] = [];
      setUserLibrary(prev => {
        const nextFiles: Record<string, FileRecord> = {};
        const diskFileNamesProcessed = new Set<string>();
        missingFromDisk = []; // reset for this run

        // Group existing records by name to identify duplicates
        const recordsByName: Record<string, FileRecord[]> = {};
        Object.values(prev.files).forEach(f => {
          const lowerName = (f.name || '').toLowerCase();
          if (!recordsByName[lowerName]) recordsByName[lowerName] = [];
          recordsByName[lowerName].push(f);
        });

        // 1. Process existing records and reconcile with disk
        for (const [lowerName, records] of Object.entries(recordsByName)) {
          const diskFile = diskFiles.get(lowerName);

          // Merge duplicates if they exist (keep the first ID, combine versions)
          let canonical = records[0];
          if (records.length > 1) {
            const allVersions = records.flatMap(r => r.versions);
            // Unique versions by ID
            const versionMap = new Map<string, AudioVersion>();
            allVersions.forEach(v => {
              if (!versionMap.has(v.id)) versionMap.set(v.id, v);
            });
            const uniqueVersions = Array.from(versionMap.values()).sort((a, b) => b.timestamp - a.timestamp);

            canonical = {
              ...canonical,
              versions: uniqueVersions,
              currentVersionId: uniqueVersions[0]?.id || canonical.currentVersionId
            };
          }

          if (diskFile) {
            // Found on disk: update blob of current version to point to the live File object
            const updatedVersions = canonical.versions.map(v =>
              v.id === canonical.currentVersionId ? { ...v, blob: diskFile } : v
            );
            nextFiles[canonical.id] = { ...canonical, versions: updatedVersions };
            diskFileNamesProcessed.add(lowerName);
          } else {
            // Not on disk: keep in index but mark as missing
            nextFiles[canonical.id] = canonical;
            missingFromDisk.push(canonical.id);
          }
        }

        // 2. Add new files from disk (those not already in index)
        for (const [lowerName, file] of diskFiles.entries()) {
          if (!diskFileNamesProcessed.has(lowerName)) {
            const fileId = crypto.randomUUID();
            const versionId = crypto.randomUUID();
            nextFiles[fileId] = {
              id: fileId,
              name: file.name,
              originalName: file.name,
              isParked: true,
              origin: 'User Library',
              currentVersionId: versionId,
              versions: [{
                id: versionId,
                timestamp: file.lastModified || Date.now(),
                description: 'Workspace Library',
                blob: file,
                duration: 0
              }],
              tags: []
            };
          }
        }

        return { ...prev, files: nextFiles };
      });
      setMissingLibraryFiles(missingFromDisk);
    } catch (e) {
      console.error('Failed to load workspace User_Library', e);
    }
  }, [workHandle]);

  const handleDownloadLibraryZip = async () => {
    const files = Object.values(userLibrary.files);
    if (files.length === 0) {
      showToast("Library is empty.", "warning");
      return;
    }

    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      let addedCount = 0;

      for (const file of files) {
        const currentVersion = file.versions.find(v => v.id === file.currentVersionId) || file.versions[0];
        if (currentVersion?.blob) {
          zip.file(file.name, currentVersion.blob);
          addedCount++;
        }
      }

      if (addedCount === 0) {
        showToast("No files with audio data found in library.", "warning");
        return;
      }

      // @ts-ignore
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Spotykach_Library_${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("ZIP Generation failed", e);
      showToast("Failed to generate ZIP.", "error");
    }
  };

  const handleOpenLibraryManager = (tab?: 'upload' | 'project' | 'manage' | 'settings', highlightFileId?: string) => {
    setShowSampleBrowser(false);
    setTargetSlotForUpload(null);
    if (tab) setLibraryManagerInitialTab(tab);
    setLibraryManagerHighlightFileId(highlightFileId || null);
    setShowLibraryManager(true);
  };

  const handleRemoveLibraryFile = useCallback(async (id: string) => {
    const fileRec = userLibrary.files[id];
    if (!fileRec) return;

    // 1. Remove from state
    setUserLibrary(prev => {
      const nextFiles = { ...prev.files };
      delete nextFiles[id];
      return { ...prev, files: nextFiles };
    });

    // 2. Remove from physical disk if possible
    if (workHandle) {
      try {
        const libDir = await workHandle.getDirectoryHandle('User_Library', { create: false });
        await libDir.removeEntry(fileRec.name);
      } catch (e) {
        // Might be already gone or no permission, that's okay.
      }
    }
  }, [workHandle, userLibrary.files]);

  // Bootstrap user library from workspace User_Library folder
  useEffect(() => {
    if (workHandle) {
      handleRefreshLibrary();
    }
  }, [workHandle]);

  // Ensure User_Library directory exists when manager opens
  useEffect(() => {
    if (showLibraryManager && workHandle) {
      workHandle.getDirectoryHandle('User_Library', { create: true }).catch(e => {
        console.error("Failed to create/access User_Library folder", e);
      });
    }
  }, [showLibraryManager, workHandle]);


  // --- Background Hashing for Duplicate Detection ---
  useEffect(() => {
    let changed = false;
    const nextFiles = { ...state.files };

    const runHashScan = async () => {
      // Find all file versions that are assigned to slots but missing a hash
      const assignedFileIds = new Set<string>();
      Object.values(state.tapes).forEach(tape => {
        tape.slots.forEach(slot => {
          if (slot.fileId) assignedFileIds.add(slot.fileId);
        });
      });

      for (const fileId of assignedFileIds) {
        const file = nextFiles[fileId];
        if (!file) continue;

        const version = file.versions.find(v => v.id === file.currentVersionId);
        if (version && version.blob && !version.hash) {
          try {
            const h = await hashBlob(version.blob);
            // Update the version in our local copy
            const updatedVersions = file.versions.map(v => 
              v.id === version.id ? { ...v, hash: h } : v
            );
            nextFiles[fileId] = { ...file, versions: updatedVersions };
            changed = true;
          } catch (e) {
            console.warn(`Failed to hash file ${file.name}`, e);
          }
        }
      }

      if (changed) {
        // Use functional update to avoid capturing stale state, 
        // though we are careful with nextFiles here.
        isSystemUpdate.current = true; // Prevent "Unsaved Changes" toast for background hashing
        setState(prev => ({ ...prev, files: { ...prev.files, ...nextFiles } }));
      }
    };

    runHashScan();
  }, [state.tapes, state.files]); // Re-run when tapes (assignments) or files change

  // ==========================================
  // HANDLERS
  // ==========================================





  // Duplicate Detection - Bit-Level (SHA-256)
  // Map<HashOrFileID, Array<{slotId, color, fileId}>>
  const duplicatesMap = new Map<string, { slotId: number, color: TapeColor, fileId: string }[]>();
  const duplicateFileIds = new Set<string>();

  // Helper to calculate duplicates
  // We scan all tapes and build the map based on content hash
  Object.entries(state.tapes).forEach(([color, tape]) => {
    tape.slots.forEach(slot => {
      if (slot.fileId) {
        const file = state.files[slot.fileId];
        const version = file?.versions.find(v => v.id === file.currentVersionId);
        
        // Use hash as identity if available, otherwise fallback to fileId
        const identity = version?.hash || slot.fileId;
        
        const currentList = duplicatesMap.get(identity) || [];
        currentList.push({ slotId: slot.id, color: color as TapeColor, fileId: slot.fileId });
        duplicatesMap.set(identity, currentList);
      }
    });
  });

  // Filter out non-duplicates (count <= 1)
  for (const [id, locs] of duplicatesMap.entries()) {
    if (locs.length <= 1) {
      duplicatesMap.delete(id);
    } else {
      // For cross-file identification, we need to know all involved file IDs
      locs.forEach(l => duplicateFileIds.add(l.fileId));
    }
  }

  const handleResolveKeep = (identity: string, keepLocation: { slotId: number, color: TapeColor, fileId: string }) => {
    setState(prev => {
      const nextTapes = { ...prev.tapes };

      // Iterate all tapes to find occurrences that match this identity
      (Object.keys(nextTapes) as TapeColor[]).forEach(c => {
        nextTapes[c] = {
          ...nextTapes[c],
          slots: nextTapes[c].slots.map(s => {
            if (!s.fileId) return s;
            
            const file = prev.files[s.fileId];
            const version = file?.versions.find(v => v.id === file.currentVersionId);
            const slotIdentity = version?.hash || s.fileId;

            if (slotIdentity === identity) {
              // If this is the one to keep, leave it.
              if (c === keepLocation.color && s.id === keepLocation.slotId) {
                return s;
              }
              // Otherwise clear it
              return { ...s, fileId: null };
            }
            return s;
          })
        };
      });

      return { ...prev, tapes: nextTapes };
    });
  };

  const handleResolveUnique = (identity: string) => {
    setState(prev => {
      const locations = duplicatesMap.get(identity);
      if (!locations || locations.length < 2) return prev;

      const nextFiles = { ...prev.files };
      const nextTapes = { ...prev.tapes };

      // Keep the first one as is, others get clones
      // Important: We clone the FileRecord so they have different IDs
      for (let i = 1; i < locations.length; i++) {
        const loc = locations[i];
        const sourceFile = prev.files[loc.fileId];
        if (!sourceFile) continue;

        const newFileId = generateId();
        const clonedVersions = sourceFile.versions.map(v => ({ ...v }));

        const newFile: FileRecord = {
          ...sourceFile,
          id: newFileId,
          name: `${sourceFile.name}_${i + 1}`, // Suffix to distinguish
          originalName: sourceFile.originalName,
          versions: clonedVersions,
          currentVersionId: clonedVersions.find(v => v.id === sourceFile.currentVersionId)?.id || clonedVersions[0].id,
          isParked: false,
          origin: sourceFile.origin,
          license: sourceFile.license
        };

        nextFiles[newFileId] = newFile;

        // Update the slot to point to the new unique file
        const tape = nextTapes[loc.color];
        nextTapes[loc.color] = {
          ...tape,
          slots: tape.slots.map(s => s.id === loc.slotId ? { ...s, fileId: newFileId } : s)
        };
      }

      return {
        ...prev,
        files: nextFiles,
        tapes: nextTapes
      };
    });
  };




  // ==========================================
  // WORKFLOW HANDLERS
  // ==========================================

  // ==========================================
  // STORAGE HANDLERS
  // ==========================================

  const handleSetWorkFolder = async () => {
    checkUnsavedChanges(async () => {
      // @ts-ignore
      if (!('showDirectoryPicker' in window)) {
        alert("Your browser doesn't support direct file access. Please use Chrome or Edge.");
        return;
      }

      try {
        // @ts-ignore
        const handle = await window.showDirectoryPicker({
          mode: 'readwrite',
          startIn: 'documents'
        });

        if (!handle) return;

        setWorkHandle(handle);
        setCurrentProjectName(undefined);
        setHasUnsavedChanges(false);
        showToast(`Work Folder Set: ${handle.name}`, 'success');

        // Save for persistence
        saveDirectoryHandle('work', handle).catch(console.error);

        // Auto-scan and open Project Manager
        await handleSmartScan(handle);
        setShowProjectManager(true);

      } catch (e: any) {
        if (e.name !== 'AbortError') {
          console.error("Setup failed", e);
          showToast("Could not access folder.", 'error');
        }
      }
    });
  };

  const handleSetBackupFolder = async () => {
    try {
      // @ts-ignore
      const handle = await window.showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'documents'
      });
      if (!handle) return;

      setBackupHandle(handle);
      saveDirectoryHandle('backup', handle).catch(console.error);
      showToast(`Backup Folder Set: ${handle.name}`, 'success');
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        showToast("Could not access folder.", 'error');
      }
    }
  };


  const scanProjects = async (localDir: FileSystemDirectoryHandle | null, backupDir: FileSystemDirectoryHandle | null) => {
    // Lazy load utils
    // Lazy load utils
    const { scanForProjects, getActiveSKProject } = await import('./utils/exportUtils');
    const { scanDeviceChanges } = await import('./utils/importUtils');

    let localProjects: import('./types').ProjectSummary[] = [];
    let backupProjects: import('./types').ProjectSummary[] = [];
    let activeSK: string | null = null;
    let diff: import('./utils/importUtils').DeviceDiff | null = null;

    if (localDir) {
      try {
        console.log(`[scanProjects] Scanning Local: ${localDir.name}`);
        localProjects = await scanForProjects(localDir);
      } catch (e) { console.error("Local Scan Error", e); }
    }

    if (backupDir) {
      try {
        console.log(`[scanProjects] Scanning Backup: ${backupDir.name}`);
        backupProjects = await scanForProjects(backupDir);
        activeSK = await getActiveSKProject(backupDir); // Get active project from SD

        // Scan for Device Changes (SK Folder)
        try {
          const skHandle = await backupDir.getDirectoryHandle('SK');
          diff = await scanDeviceChanges(skHandle);
          if (diff) {
            console.log("[DeviceDiff] Hardware state loaded:", diff);
          }
        } catch (e) { /* No SK folder or scan failed */ }

      } catch (e) { console.error("Backup Scan Error", e); }
    }

    console.log(`[scanProjects] Local: ${localProjects.length}, Backup: ${backupProjects.length}, ActiveSK: ${activeSK}`);
    setActiveSKProject(activeSK); // Update state
    setDeviceDiff(diff); // Update diff state

    // Merge Logic (Match by Name)
    const projectMap = new Map<string, import('./types').ProjectSummary & { local?: import('./types').ProjectSummary, backup?: import('./types').ProjectSummary }>();

    localProjects.forEach(p => {
      projectMap.set(p.name, { ...p, local: p });
    });

    backupProjects.forEach(p => {
      const existing = projectMap.get(p.name);
      if (existing) {
        projectMap.set(p.name, { ...existing, backup: p });
      } else {
        projectMap.set(p.name, { ...p, backup: p });
      }
    });

    const { quickCompareProjects } = await import('./utils/projectSyncUtils');

    const merged = Array.from(projectMap.values()).map(p => {
      let status: 'synced' | 'local' | 'backup' | 'modified' = 'local';

      if (p.local && p.backup) {
        // Content-based comparison: check if slot assignments, files, and notes match
        if (p.local._rawData && p.backup._rawData) {
          const contentMatch = quickCompareProjects(p.local._rawData, p.backup._rawData);
          status = contentMatch ? 'synced' : 'modified';
        } else {
          // Fallback to timestamp if raw data not available
          const localTime = p.local.lastModified || 0;
          const backupTime = p.backup.lastModified || 0;
          status = (Math.abs(localTime - backupTime) <= 2000) ? 'synced' : 'modified';
        }
      } else if (p.backup) {
        status = 'backup';
      }

      return { ...p, status };
    });

    console.log(`[scanProjects] Merged Total: ${merged.length}. Setting foundProjects.`);
    setFoundProjects(merged);
  };

  // Wrapper for compatibility
  const handleSmartScan = async (newWorkHandle?: FileSystemDirectoryHandle) => {
    // Use passed handle or fall back to state (state might be stale during setup)
    const effectiveWork = newWorkHandle || workHandle;
    await scanProjects(effectiveWork, backupHandle);
  };

  // Effect to rescan when handles change
  useEffect(() => {
    if (workHandle || backupHandle) {
      scanProjects(workHandle, backupHandle);
    }
  }, [workHandle, backupHandle]);








  // Restore Handler
  const handleRestoreAndSync = async (backupFile: File, _structureMap: any) => {
    setIsProcessing(true);
    setProgressMsg("Restoring Backup...");
    try {
      const { loadProjectFromZip } = await import('./utils/importUtils');
      const loadedState = await loadProjectFromZip(backupFile, (msg) => setProgressMsg(msg));

      if (loadedState) {
        setState(loadedState);
        setImportAnalysis(null);
        showToast("Project Restored Successfully", 'success');
      } else {
        showToast("Failed to load project from backup.", 'error');
      }
    } catch (e) {
      console.error(e);
      showToast("Restore Failed", 'error');
    } finally {
      setIsProcessing(false);
      setProgressMsg('');
    }
  };

  // Rename File Handler
  const handleRenameFile = (fileId: string, newName: string) => {
    setState(prev => {
      const file = prev.files[fileId];
      if (!file) return prev;
      return {
        ...prev,
        files: {
          ...prev.files,
          [fileId]: {
            ...file,
            name: newName
          }
        }
      };
    });
    setHasUnsavedChanges(true);
  };
  // Save File Version Handler (Bakes changes into existing file record)
  const handleSaveFile = (newBlob: Blob, duration: number, description?: string, isDirty: boolean = true, processing: ('normalized' | 'trimmed' | 'looped' | 'eq' | 'limited' | 'cut' | 'sliced')[] = []) => {
    if (!activeFileId) return;

    if (!isDirty) {
      setIsEditorDirty(false);
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
          currentVersionId: versionId,
          versions: [...prev.files[fileId].versions, version]
        }
      }
    }));
    console.log(`[handleSaveFile] Setting hasUnsavedChanges=true, isEditorDirty=false`);
    setHasUnsavedChanges(true);
    setIsEditorDirty(false);
    showToast("Edit Saved", 'success');
  };

  // Save as Unique Handler (Creates a new file record and assigns it to the slot)
  const handleSaveUnique = (newBlob: Blob, duration: number, processing: ('normalized' | 'trimmed' | 'looped' | 'eq' | 'limited' | 'cut' | 'sliced')[] = [], createdId: string) => {
    if (!activeSlotId || !activeFile) return;

    // 1. Generate IDs
    const newFileId = createdId;
    const newVersionId = generateId();

    // 2. Create Version
    const version: AudioVersion = {
      id: newVersionId,
      timestamp: Date.now(),
      description: 'Unique Version from ' + activeFile.name,
      blob: newBlob,
      duration,
      processing
    };

    // 3. Create New File Record
    const newFile: FileRecord = {
      id: newFileId,
      name: activeFile.name + " (Unique)",
      originalName: activeFile.originalName,
      versions: [version],
      currentVersionId: newVersionId,
      isParked: false // It will be assigned immediately
    };

    // 4. Update State
    setState(prev => {
      // a. Add new file
      const updatedFiles = { ...prev.files, [newFileId]: newFile };

      // b. Update the Tape Slot to point to newFileId
      const updatedTapes = { ...prev.tapes };
      const tape = updatedTapes[currentTapeColor as TapeColor];
      if (tape) {
        updatedTapes[currentTapeColor as TapeColor] = {
          ...tape,
          slots: tape.slots.map(s => s.id === activeSlotId ? { ...s, fileId: newFileId } : s)
        };
      }

      return {
        ...prev,
        files: updatedFiles,
        tapes: updatedTapes
      };
    });

    console.log(`[handleSaveUnique] Setting hasUnsavedChanges=true, isEditorDirty=false`);
    setHasUnsavedChanges(true); // Explicitly mark project as unsaved
    setIsEditorDirty(false);
    showToast("Created Unique Copy", 'success');

    // 5. Close Editor (Since we switched file, keeping editor open might be tricky without full re-mount)
    setActiveSlotId(null);
  };
  // Save as Copy Handler (Saves edited version to pool without affecting current slot)
  const handleSaveAsCopy = (newBlob: Blob, duration: number, createdId: string) => {
    if (!activeFileId || !activeFile) return;

    const fileId = createdId;
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
        [activeFileId]: {
          ...prev.files[activeFileId],
          versions: [sourceVersion, ...prev.files[activeFileId].versions],
          currentVersionId: sourceVersionId
        }
      }
    }));
    console.log(`[handleSaveAsCopy] Setting hasUnsavedChanges=true`);
    setHasUnsavedChanges(true);
    showToast("Saved copy to pool", 'success');
  };

  const handleDeleteVersion = (versionId: string) => {
    if (!activeFileId) return;

    setState(prev => {
      const file = prev.files[activeFileId];
      if (!file) return prev;
      if (file.versions.length <= 1) return prev; // Keep at least one

      const newVersions = file.versions.filter(v => v.id !== versionId);
      let newCurrentId = file.currentVersionId;

      // If current version is deleted, switch to the newest available
      if (file.currentVersionId === versionId) {
        newCurrentId = newVersions[0].id;
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
    setHasUnsavedChanges(true);
  };

  const handleAssignVersion = (versionId: string) => {
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
    setHasUnsavedChanges(true);
    showToast("Version Assigned to Slot 🫡", "success");
  };

  const handleMoveVersionToPool = (versionId: string) => {
    if (!activeFileId) return;
    const file = state.files[activeFileId];
    if (!file) return;
    const versionToMove = file.versions.find(v => v.id === versionId);
    if (!versionToMove) return;

    if (file.versions.length <= 1) {
      showToast("Cannot move the only version. Use 'Save Copy' instead.", "error");
      return;
    }

    // 1. Create New File from Version
    const newFileId = generateId();
    const newVersionId = generateId();

    const newVersion: AudioVersion = {
      ...versionToMove,
      id: newVersionId,
      timestamp: Date.now(),
      description: `Extracted from ${file.name}`
    };

    const newFile: FileRecord = {
      id: newFileId,
      name: `${file.name}_v${new Date(versionToMove.timestamp).getTime().toString().slice(-4)}`,
      originalName: file.name,
      versions: [newVersion],
      currentVersionId: newVersionId,
      isParked: true
    };

    setState(prev => {
      const currentFile = prev.files[activeFileId];
      const newVersions = currentFile.versions.filter(v => v.id !== versionId);
      let newCurrentId = currentFile.currentVersionId;

      if (currentFile.currentVersionId === versionId) {
        newCurrentId = newVersions[0].id;
      }

      return {
        ...prev,
        files: {
          ...prev.files,
          [newFileId]: newFile,
          [activeFileId]: {
            ...currentFile,
            versions: newVersions,
            currentVersionId: newCurrentId
          }
        }
      };
    });
    setHasUnsavedChanges(true);
    showToast("Version moved to Unassigned Pool", "success");
  };

  // Save Project Handler
  const handleSaveProject = async () => {
    setIsProcessing(true);
    setProgressMsg("Checking files...");
    try {
      const { verifyProjectBlobs } = await import('./utils/exportUtils');
      const missing = await verifyProjectBlobs(state);

      if (missing.length > 0) {
        setMissingFilesWarning(missing);
        return; // Pause save, wait for user resolution
      }
    } catch (e) {
      console.error("Verification failed", e);
    } finally {
      setIsProcessing(false);
      setProgressMsg('');
    }

    await executeSaveProject();
  };

  const handleSmartRelocate = async () => {
    if (!missingFilesWarning) return;

    try {
      // @ts-ignore
      const rootFolder = await window.showDirectoryPicker({ mode: 'read' });
      if (!rootFolder) return;

      setIsProcessing(true);
      setProgressMsg("Scanning folder for matches...");

      const foundFiles = new Map<string, File>();

      const scan = async (handle: FileSystemDirectoryHandle) => {
        // @ts-ignore
        for await (const entry of handle.values()) {
          if (entry.kind === 'file') {
            if (entry.name.toLowerCase().endsWith('.wav') || entry.name.toLowerCase().endsWith('.mp3')) {
              const file = await (entry as FileSystemFileHandle).getFile();
              foundFiles.set(entry.name.toLowerCase(), file);
            }
          } else if (entry.kind === 'directory') {
            await scan(entry as FileSystemDirectoryHandle);
          }
        }
      };

      await scan(rootFolder);

      let resolvedCount = 0;
      const nextFiles = { ...state.files };

      missingFilesWarning.forEach(asset => {
        const fileName = asset.fileName.toLowerCase();
        const refParts = asset.blobRef.split('/');
        const refName = refParts[refParts.length - 1].toLowerCase();

        const match = foundFiles.get(fileName) || foundFiles.get(refName);

        if (match) {
          const fileRecord = nextFiles[asset.fileId];
          if (fileRecord) {
            const updatedVersions = fileRecord.versions.map(v => {
              if (v.id === asset.versionId) {
                return { ...v, blob: match };
              }
              return v;
            });
            nextFiles[asset.fileId] = { ...fileRecord, versions: updatedVersions };
            resolvedCount++;
          }
        }
      });

      if (resolvedCount > 0) {
        isSystemUpdate.current = true;
        setState(prev => ({
          ...prev,
          files: nextFiles
        }));

        setMissingFilesWarning(prev => {
          if (!prev) return null;
          const remaining = prev.filter(asset => {
            const fileName = asset.fileName.toLowerCase();
            const refParts = asset.blobRef.split('/');
            const refName = refParts[refParts.length - 1].toLowerCase();
            return !foundFiles.has(fileName) && !foundFiles.has(refName);
          });
          return remaining.length > 0 ? remaining : null;
        });

        showToast(`Successfully relocated ${resolvedCount} file(s).`, 'success');
      } else {
        showToast("No matching files found in the selected folder.", 'info');
      }

    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.error("Smart relocate failed", e);
        showToast("Folder scan failed.", 'error');
      }
    } finally {
      setIsProcessing(false);
      setProgressMsg('');
    }
  };

  const handleRecoverProjectAssetFromCache = async (asset: MissingAsset) => {
    if (!workHandle || !currentProjectName) return;

    const fileRecord = state.files[asset.fileId];
    if (!fileRecord) return;

    const version = fileRecord.versions.find(v => v.id === asset.versionId);
    if (!version || !version.blob) {
      showToast("No audio data found in browser cache for this file.", 'error');
      return;
    }

    try {
      const projectsHandle = await workHandle.getDirectoryHandle('Projects', { create: true });
      const projectDirHandle = await projectsHandle.getDirectoryHandle(currentProjectName, { create: true });
      const assetsHandle = await projectDirHandle.getDirectoryHandle('Assets', { create: true });

      const parts = asset.blobRef.split('/');
      const technicalName = parts[parts.length - 1];
      const fileHandle = await assetsHandle.getFileHandle(technicalName, { create: true });
      // @ts-ignore
      const writable = await fileHandle.createWritable();
      await writable.write(version.blob);
      await writable.close();

      showToast(`Recovered ${asset.fileName} from cache.`, 'success');

      setMissingFilesWarning(prev => {
        if (!prev) return null;
        const next = prev.filter(a => a.versionId !== asset.versionId);
        return next.length > 0 ? next : null;
      });
    } catch (e: any) {
      console.error("Cache recovery failed", e);
      showToast("Failed to write file to disk: " + e.message, 'error');
    }
  };

  const handleRecoverAllMissingAssetsFromCache = async () => {
    if (!missingFilesWarning || !workHandle || !currentProjectName) return;

    setIsProcessing(true);
    setProgressMsg("Restoring files from cache...");

    let recoveredCount = 0;
    try {
      const projectsHandle = await workHandle.getDirectoryHandle('Projects', { create: true });
      const projectDirHandle = await projectsHandle.getDirectoryHandle(currentProjectName, { create: true });
      const assetsHandle = await projectDirHandle.getDirectoryHandle('Assets', { create: true });

      for (const asset of missingFilesWarning) {
        const fileRecord = state.files[asset.fileId];
        if (!fileRecord) continue;

        const version = fileRecord.versions.find(v => v.id === asset.versionId);
        if (version && version.blob) {
          try {
            const parts = asset.blobRef.split('/');
            const technicalName = parts[parts.length - 1];
            const fileHandle = await assetsHandle.getFileHandle(technicalName, { create: true });
            // @ts-ignore
            const writable = await fileHandle.createWritable();
            await writable.write(version.blob);
            await writable.close();
            recoveredCount++;
          } catch (err) {
            console.error(`Failed to recover ${asset.fileName}`, err);
          }
        }
      }

      if (recoveredCount > 0) {
        showToast(`Recovered ${recoveredCount} files from cache.`, 'success');
        setMissingFilesWarning(prev => {
          if (!prev) return null;
          const remaining = prev.filter(a => {
            const rec = state.files[a.fileId];
            const ver = rec?.versions.find(v => v.id === a.versionId);
            return !ver || !ver.blob;
          });
          return remaining.length > 0 ? remaining : null;
        });
      } else {
        showToast("No files could be recovered from cache.", 'info');
      }
    } catch (e: any) {
      console.error("Bulk recovery failed", e);
      showToast("Recovery error: " + e.message, 'error');
    } finally {
      setIsProcessing(false);
      setProgressMsg('');
    }
  };

  const handleRecoverProjectAssetFromSD = async (asset: MissingAsset) => {
    if (!workHandle || !backupHandle || !currentProjectName) return;

    try {
      const projectsHandle = await workHandle.getDirectoryHandle('Projects', { create: true });
      const projectDirHandle = await projectsHandle.getDirectoryHandle(currentProjectName, { create: true });
      const assetsHandle = await projectDirHandle.getDirectoryHandle('Assets', { create: true });

      // Resolve backup dir again (cleanest approach for standalone function)
      let backupProjectDir: FileSystemDirectoryHandle | null = null;
      try {
        const wb = await backupHandle.getDirectoryHandle('WAV_Builder', { create: false });
        const ps = await wb.getDirectoryHandle('Projects', { create: false });
        backupProjectDir = await ps.getDirectoryHandle(currentProjectName, { create: false });
      } catch {
        try {
          const ps = await backupHandle.getDirectoryHandle('Projects', { create: false });
          backupProjectDir = await ps.getDirectoryHandle(currentProjectName, { create: false });
        } catch { /* ignore */ }
      }

      if (!backupProjectDir) throw new Error("Could not find project on SD backup.");
      const backupAssets = await backupProjectDir.getDirectoryHandle('Assets', { create: false });

      const parts = asset.blobRef.split('/');
      const fileName = parts[parts.length - 1];
      const backupFileHandle = await backupAssets.getFileHandle(fileName, { create: false });
      const backupFile = await backupFileHandle.getFile();

      const targetFileHandle = await assetsHandle.getFileHandle(fileName, { create: true });
      // @ts-ignore
      const writable = await targetFileHandle.createWritable();
      await writable.write(backupFile);
      await writable.close();

      showToast(`Recovered ${asset.fileName} from SD backup.`, 'success');

      setMissingFilesWarning(prev => {
        if (!prev) return null;
        const next = prev.filter(a => a.versionId !== asset.versionId);
        return next.length > 0 ? next : null;
      });
    } catch (e: any) {
      console.error("SD recovery failed", e);
      showToast("Failed to recover from SD: " + e.message, 'error');
    }
  };

  const handleRecoverAllMissingAssetsFromSD = async () => {
    if (!missingFilesWarning || !workHandle || !backupHandle || !currentProjectName) return;

    setIsProcessing(true);
    setProgressMsg("Restoring files from SD backup...");

    let recoveredRefs = new Set<string>();
    try {
      let backupProjectDir: FileSystemDirectoryHandle | null = null;
      try {
        const wb = await backupHandle.getDirectoryHandle('WAV_Builder', { create: false });
        const ps = await wb.getDirectoryHandle('Projects', { create: false });
        backupProjectDir = await ps.getDirectoryHandle(currentProjectName, { create: false });
      } catch {
        try {
          const ps = await backupHandle.getDirectoryHandle('Projects', { create: false });
          backupProjectDir = await ps.getDirectoryHandle(currentProjectName, { create: false });
        } catch { /* ignore */ }
      }

      if (!backupProjectDir) throw new Error("Could not find project on SD backup.");
      const backupAssets = await backupProjectDir.getDirectoryHandle('Assets', { create: false });

      const projectsHandle = await workHandle.getDirectoryHandle('Projects', { create: true });
      const projectDirHandle = await projectsHandle.getDirectoryHandle(currentProjectName, { create: true });
      const assetsHandle = await projectDirHandle.getDirectoryHandle('Assets', { create: true });

      for (const asset of missingFilesWarning) {
        if (!asset.sdRecoverable) continue;

        try {
          const parts = asset.blobRef.split('/');
          const fileName = parts[parts.length - 1];
          const backupFileHandle = await backupAssets.getFileHandle(fileName, { create: false });
          const backupFile = await backupFileHandle.getFile();

          const targetFileHandle = await assetsHandle.getFileHandle(fileName, { create: true });
          // @ts-ignore
          const writable = await targetFileHandle.createWritable();
          await writable.write(backupFile);
          await writable.close();
          recoveredRefs.add(asset.versionId);
        } catch (err) {
          console.error(`Failed to recover ${asset.fileName} from SD`, err);
        }
      }

      if (recoveredRefs.size > 0) {
        showToast(`Recovered ${recoveredRefs.size} files from SD backup.`, 'success');
        setMissingFilesWarning(prev => {
          if (!prev) return null;
          const remaining = prev.filter(a => !recoveredRefs.has(a.versionId));
          return remaining.length > 0 ? remaining : null;
        });
      } else {
        showToast("No eligible files found locally on SD backup.", 'info');
      }
    } catch (e: any) {
      console.error("Bulk SD recovery failed", e);
      showToast("SD Recovery error: " + e.message, 'error');
    } finally {
      setIsProcessing(false);
      setProgressMsg('');
    }
  };

  const handleLibrarySmartScan = useCallback(async () => {
    if (missingLibraryFiles.length === 0) return;

    try {
      // @ts-ignore
      const rootFolder = await window.showDirectoryPicker({ mode: 'read' });
      if (!rootFolder) return;
      setIsProcessing(true);
      setProgressMsg("Scanning folder for library matches...");

      const foundFiles = new Map<string, File>();
      const scan = async (handle: FileSystemDirectoryHandle) => {
        // @ts-ignore
        for await (const entry of handle.values()) {
          // Skip temporary browser files and hidden files
          if (entry.name.startsWith('.') || entry.name.endsWith('.crswap') || entry.name.endsWith('.tmp')) {
            continue;
          }

          if (entry.kind === 'file') {
            const ext = entry.name.toLowerCase().split('.').pop();
            if (['wav', 'mp3', 'flac'].includes(ext || '')) {
              const file = await (entry as FileSystemFileHandle).getFile();
              foundFiles.set(entry.name.toLowerCase(), file);
            }
          } else if (entry.kind === 'directory') {
            await scan(entry as FileSystemDirectoryHandle);
          }
        }
      };

      await scan(rootFolder);

      let matchesCount = 0;
      let missingFromDisk: string[] = [];

      setUserLibrary(prev => {
        const nextFiles = { ...prev.files };
        missingFromDisk = [];

        Object.values(nextFiles).forEach(file => {
          const lowerName = file.name.toLowerCase();
          const diskFile = foundFiles.get(lowerName);

          if (diskFile) {
            const currentVer = file.versions.find(v => v.id === file.currentVersionId);
            if (currentVer) {
              currentVer.blob = diskFile;
              matchesCount++;
            }
          } else {
            missingFromDisk.push(file.id);
          }
        });

        return { ...prev, files: nextFiles };
      });

      setMissingLibraryFiles(missingFromDisk);
      if (matchesCount > 0) {
        showToast(`Smart Scan Complete: Linked ${matchesCount} samples.`, 'success');
      } else {
        showToast("No matching files found in the selected folder.", 'info');
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.error("Library smart scan failed", e);
        showToast('Scan failed: ' + e.message, 'error');
      }
    } finally {
      setIsProcessing(false);
      setProgressMsg('');
    }
  }, [userLibrary.files, missingLibraryFiles]);

  const executeSaveProject = async () => {
    // 1. If we have an active project handle (or Work Handle + Name), save
    if (workHandle && currentProjectName) {
      setIsProcessing(true);
      setProgressMsg("Saving Project...");
      try {
        const { saveProjectToDirectory } = await import('./utils/exportUtils');
        // Save using Root Handle + Project Name logic for robustness
        // @ts-ignore
        await saveProjectToDirectory(state, workHandle, (msg) => setProgressMsg(msg || ''), currentProjectName);

        showToast("Project Saved Successfully", 'success');
        setHasUnsavedChanges(false);
      } catch (e: any) {
        console.error(e);
        showToast("Save Failed: " + e.message, 'error');
      } finally {
        setIsProcessing(false);
        setProgressMsg('');
      }
      return;
    }

    // 2. If no active project handle, but we have a Work Folder -> Prompt to Create (Save As)
    if (workHandle) {
      const name = prompt("Enter Project Name to Save:");
      if (name) await handleSaveProjectAs(name);
      return;
    }

    // 3. Fallback (Browser Mode) -> Prompt to Export
    if (confirm("Download Project Backup?")) {
      await handleExportProgress('Project Backup', async (log) => {
        await exportSaveState(state, false, log);
      });
    }
  };



  const handleDuplicateProject = async (sourceName: string, newName: string) => {
    if (!workHandle) return;
    setIsProcessing(true);
    setProgressMsg(`Duplicating "${sourceName}" to "${newName}"...`);
    try {
      await duplicateProject(workHandle, sourceName, newName);
      showToast("Project Duplicated Successfully", 'success');
      // Refresh list
      await handleSmartScan(workHandle);
    } catch (e: any) {
      console.error(e);
      showToast("Duplicate Failed: " + e.message, 'error');
    } finally {
      setIsProcessing(false);
      setProgressMsg('');
    }
  };

  /* Removed duplicate handlers */




  // ==========================================
  // UNIFIED SYNC FLOW
  // ==========================================



  // NOTE: TO PROPERLY IMPLEMENT ACTIONS, I NEED THE ROOT HANDLE.
  // I will store it in a Ref.
  // const sdRootHandleRef = useRef<any>(null);

  // Re-write handleSyncClick to store ref
  // REMOVED handleSyncClickWithRef - Unified Sync now uses Backup Folder logic.

  // REMOVED performSyncAction - Unified Sync now uses Backup Folder logic.


  // Export Progress Handler
  const handleExportProgress = async (
    actionName: string,
    action: (log: (msg: string | undefined, progress?: number) => void) => Promise<void>
  ) => {
    setShowExportProgress(true);
    setExportLogs([`Starting ${actionName}...`]);
    setIsExportComplete(false);
    setExportError(null);
    setExportProgress(0);

    const log = (msg: string | undefined, progress?: number) => {
      if (msg) {
        setExportLogs(prev => {
          // Debounce logs if same message? No, keep simple.
          // Don't log if message is just "..."?
          return [...prev, msg];
        });
      }
      if (progress !== undefined) {
        setExportProgress(progress);
      }
    };

    try {
      await action(log);
      setIsExportComplete(true);
      setExportProgress(100);
      log('Process finished successfully.');
    } catch (e: any) {
      console.error(e);
      setExportError(e.message || 'Unknown error occurred');
      setIsExportComplete(true);
      log(`Error: ${e.message}`);
    }
  };




  const currentTape = state.tapes[currentTapeColor];
  const activeSlot = activeSlotId ? currentTape.slots.find(s => s.id === activeSlotId) : null;
  const activeFileId = activeSlot?.fileId;
  const activeFile = activeFileId ? state.files[activeFileId] : null;
  const showEditor = activeFile !== null;

  useEffect(() => {
    if (showEditor) {
      stopGlobalPlayer();
    }
  }, [showEditor, stopGlobalPlayer]);

  // Helper for IDs (Safe for non-secure contexts like local network dev)
  const generateId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      try {
        return crypto.randomUUID();
      } catch (e) {
        // Fallback if randomUUID fails
      }
    }
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  };

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

      const safeName = sanitizeFilename(file.name);

      if (safeName !== file.name) {
        showToast(`Renamed "${file.name}" to "${safeName}"`, 'info');
      }

      const newFile: FileRecord = {
        id: fileId,
        name: safeName.toUpperCase().replace(/\.[^/.]+$/, ""),
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
  // Handle internal drag drop (Move/Swap/Assign)
  // Handle internal drag drop (Move/Swap/Assign)
  const handleSlotDropInternal = (targetSlotId: number, fileId: string, source: string, isDuplicate: boolean = false, targetColor: TapeColor = currentTapeColor, sourceSlotId?: number, sourceSlotColor?: TapeColor) => {
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

      // Swap Logic: If source is 'slot' AND target is occupied AND we have sourceSlotId/Color
      if (source === 'slot' && previousFileId && sourceSlotId !== undefined && sourceSlotColor && !isDuplicate) {
        const sourceTape = nextTapes[sourceSlotColor];
        const sourceSlotIndex = sourceTape.slots.findIndex(s => s.id === sourceSlotId);

        if (sourceSlotIndex !== -1) {
          // Perform Swap

          // Update Target Tape (Assign new file)
          // We need to be careful: if targetColor === sourceSlotColor, we are modifying the same tape object twice.
          // Best to retrieve the tape again or modify a shared reference?
          // Since we clone `nextTapes` at the top (shallow copy of the map), `nextTapes[targetColor]` is the tape object.
          // If we replace `nextTapes[targetColor] = ...`, we need to make sure we don't overwrite if we do it again for source.

          // Let's modify the slots arrays directly on the cloned tape objects?
          // But we need to clone the tape object first to respect immutability of `prev`.
          // `nextTapes` is { ...prev.tapes }. The values are still references to old tapes!
          // So we MUST clone the tape objects we modify.

          let targetTapeClone = nextTapes[targetColor];
          if (targetTapeClone === prev.tapes[targetColor]) {
            targetTapeClone = { ...targetTapeClone, slots: [...targetTapeClone.slots] };
            nextTapes[targetColor] = targetTapeClone;
          }

          let sourceTapeClone = nextTapes[sourceSlotColor];
          if (sourceTapeClone === prev.tapes[sourceSlotColor]) {
            sourceTapeClone = { ...sourceTapeClone, slots: [...sourceTapeClone.slots] };
            nextTapes[sourceSlotColor] = sourceTapeClone;
          }

          // Note: if targetColor === sourceSlotColor, targetTapeClone and sourceTapeClone should refer to the Same Object (if we assigned it back to nextTapes).
          // Wait, if `targetColor === sourceSlotColor`:
          // 1. We clone T. `nextTapes[T] = T_clone`.
          // 2. We fetch `nextTapes[T]`. It gets `T_clone`.
          // 3. We check `T_clone === prev.tapes[T]` -> False.
          // 4. We assign `sourceTapeClone = T_clone`.
          // So they are the same object reference. Good.

          // Now update slots.

          // Update Target Slot (in targetTapeClone)
          targetTapeClone.slots = targetTapeClone.slots.map(s => s.id === targetSlotId ? { ...s, fileId: fileId } : s);

          // Update Source Slot (in sourceTapeClone)
          // Careful: if same tape, `sourceTapeClone` is same ref as `targetTapeClone`. 
          // `targetTapeClone.slots` was just replaced with a new array.
          // `sourceTapeClone.slots` is ... the OLD array if we didn't re-read it?
          // No, `sourceTapeClone` refers to the object. `sourceTapeClone.slots` refers to the property.
          // BUT we just did `targetTapeClone.slots = ...`. 
          // If `sourceTapeClone === targetTapeClone`, then `sourceTapeClone.slots` is the NEW array.
          // So we are good.

          // However, `map` creates a new array.
          // So `targetTapeClone.slots` is now Array B.
          // If we then do `sourceTapeClone.slots = sourceTapeClone.slots.map(...)`, we are mapping over Array B.
          // This is correct.

          sourceTapeClone.slots = sourceTapeClone.slots.map(s => s.id === sourceSlotId ? { ...s, fileId: previousFileId } : s);

          // Don't park anyone. Swap complete.
          return { files: nextFiles, tapes: nextTapes };
        }
      }

      // Fallback: Overwrite / Move without Swap
      if (previousFileId) {
        // Park the occupant
        nextFiles[previousFileId] = { ...nextFiles[previousFileId], isParked: true };
      }

      // Assign new file to target
      nextTapes[targetColor] = {
        ...nextTapes[targetColor],
        slots: nextTapes[targetColor].slots.map(s =>
          s.id === targetSlotId ? { ...s, fileId } : s
        )
      };

      // 3. Clear old slot (Move) if not duplicate
      if (!isDuplicate && source === 'slot') {
        Object.keys(nextTapes).forEach(color => {
          const c = color as TapeColor;
          // Clone tape if we are going to modify it
          // Wait, we are iterating. We only modify if we find the file.
          const tape = nextTapes[c];
          // We need to check if this tape contains the file we moved.
          // BUT NOT if it's the target slot we just assigned!

          const hasFile = tape.slots.some(s => {
            const isTarget = c === targetColor && s.id === targetSlotId;
            return s.fileId === fileId && !isTarget;
          });

          if (hasFile) {
            nextTapes[c] = {
              ...tape,
              slots: tape.slots.map(s => {
                const isTarget = c === targetColor && s.id === targetSlotId;
                if (s.fileId === fileId && !isTarget) {
                  return { ...s, fileId: null };
                }
                return s;
              })
            };
          }
        });
      }

      return { files: nextFiles, tapes: nextTapes };
    });
  };

  const handleParkRequest = (fileId: string) => {
    // Park logic matching user request: "Remove from slots, move to unassigned"
    // Just reuse the unassign logic essentially
    onUnassignFile(fileId);
  };

  const onUnassignFile = (fileId: string) => {
    const file = state.files[fileId];
    if (!file) return;

    setConfirmAction({
      title: "Unassign File",
      message: `Remove "${file.name}" from all assigned slots? It will remain in the unassigned pool.`,
      onConfirm: () => {
        const newTapes = { ...state.tapes };
        let usedInSlots = false;

        (Object.keys(newTapes) as TapeColor[]).forEach(color => {
          const tape = newTapes[color];
          if (tape.slots.some(s => s.fileId === fileId)) {
            newTapes[color] = {
              ...tape,
              slots: tape.slots.map(s => s.fileId === fileId ? { ...s, fileId: null } : s)
            };
            usedInSlots = true;
          }
        });

        if (usedInSlots) {
          setState(prev => ({
            ...prev,
            files: {
              ...prev.files,
              [fileId]: { ...prev.files[fileId], isParked: true }
            },
            tapes: newTapes
          }));
          showToast("File unassigned from all slots", "success");
        }
        setConfirmAction(null);
      }
    });
  };

  const handleBulkUnassign = (fileIds: string[]) => {
    // Filter out files that are actually assigned
    const assignedIds = fileIds.filter(id => !state.files[id]?.isParked);

    if (assignedIds.length === 0) return;

    setConfirmAction({
      title: "Unassign Multiple Files",
      message: `Remove ${assignedIds.length} files from all assigned slots? They will remain in the unassigned pool.`,
      onConfirm: () => {
        setState(prev => {
          const newTapes = { ...prev.tapes };
          const newFiles = { ...prev.files };
          let count = 0;

          assignedIds.forEach(id => {
            let used = false;
            (Object.keys(newTapes) as TapeColor[]).forEach(color => {
              const tape = newTapes[color];
              // If file is in this tape, clear it
              if (tape.slots.some(s => s.fileId === id)) {
                newTapes[color] = {
                  ...tape,
                  slots: tape.slots.map(s => s.fileId === id ? { ...s, fileId: null } : s)
                };
                used = true;
              }
            });

            if (used) {
              newFiles[id] = { ...newFiles[id], isParked: true };
              count++;
            }
          });

          showToast(`Unassigned ${count} files`, "success");
          return { ...prev, tapes: newTapes, files: newFiles };
        });
        setConfirmAction(null);
      }
    });
  };

  const onDeleteFile = (fileId: string) => {
    const file = state.files[fileId];
    if (!file) return;

    // Check if used in any slots for the message
    let usedInSlots = false;
    (Object.values(state.tapes) as any[]).forEach(tape => {
      if (tape.slots.some((s: any) => s.fileId === fileId)) {
        usedInSlots = true;
      }
    });

    const message = usedInSlots
      ? "This will remove it from all assigned slots and the project."
      : "This will permanently remove it from the project.";

    setConfirmAction({
      title: `Permanently delete "${file.name}"?`,
      message: message,
      isDestructive: true,
      confirmLabel: "Delete Forever",
      onConfirm: () => {
        // 1. Remove from all slots
        const newTapes = { ...state.tapes };
        let usedInSlots = false;

        (Object.keys(newTapes) as TapeColor[]).forEach(color => {
          const tape = newTapes[color];
          if (tape.slots.some(s => s.fileId === fileId)) {
            newTapes[color] = {
              ...tape,
              slots: tape.slots.map(s => s.fileId === fileId ? { ...s, fileId: null } : s)
            };
            usedInSlots = true;
          }
        });

        // 2. Remove from files
        const newFiles = { ...state.files };
        delete newFiles[fileId];

        setState(prev => ({
          ...prev,
          files: newFiles,
          tapes: usedInSlots ? newTapes : prev.tapes
        }));

        if (activeFileId === fileId) {
          // If the deleted file was the one currently active in the editor, close the editor.
          setActiveSlotId(null);
        }
        setConfirmAction(null);
        showToast("File permanently deleted", "success");
      }
    });
  };

  const handleSlotClick = (id: number) => {
    const currentTape = state.tapes[currentTapeColor];
    const slot = currentTape.slots.find(s => s.id === id);

    if (slot && slot.fileId) {
      setActiveSlotId(id);
    } else {
      // Empty slot -> Check preference 
      setTargetSlotForUpload(id);
      const pref = localStorage.getItem('spotykach_emptySlotPreferredBrowser');
      if (pref === 'os') {
        singleFileInputRef.current?.click();
      } else if (pref === 'sample-browser') {
        setShowSampleBrowser(true);
      } else {
        setShowBrowserChoiceModal(true);
      }
    }
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
    setHasUnsavedChanges(true); // Mark project as dirty after slot movement
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
    setHasUnsavedChanges(true); // Mark project as dirty after slot movement
  };



  // Centralized Bulk Assign Logic
  // Centralized Bulk Assign Logic
  const processBulkAssign = (
    targetSlotId: number,
    fileIds: string[],
    mode: 'check' | 'overwrite' | 'fill',
    targetColorHint?: TapeColor,
    sourceSlotKeys?: string[]
  ): { conflicts: number } | void => {

    // For 'check' mode, we don't update state, just return conflict count.
    if (mode === 'check') {
      const tapes = state.tapes;
      let conflictCount = 0;

      // Find starting point
      let startColor: TapeColor | null = null;
      let startIdx = -1;

      if (targetColorHint) {
        const idx = tapes[targetColorHint].slots.findIndex(s => s.id === targetSlotId);
        if (idx !== -1) {
          startColor = targetColorHint;
          startIdx = idx;
        }
      } else {
        // Fallback (unsafe if IDs are not unique)
        for (const color of TAPE_COLORS) {
          const idx = tapes[color].slots.findIndex(s => s.id === targetSlotId);
          if (idx !== -1) {
            startColor = color;
            startIdx = idx;
            break;
          }
        }
      }
      if (!startColor || startIdx === -1) return { conflicts: 0 };

      let currentTapeIdx = TAPE_COLORS.indexOf(startColor);
      let currentSlotIdx = startIdx;

      // Simulate assignment
      for (const fileId of fileIds) {
        // Find slot
        let assigned = false;
        while (currentTapeIdx < TAPE_COLORS.length) {
          const tape = tapes[TAPE_COLORS[currentTapeIdx]];
          if (currentSlotIdx < tape.slots.length) {
            const slot = tape.slots[currentSlotIdx];
            if (slot.fileId && slot.fileId !== fileId) {
              conflictCount++;
            }
            assigned = true;
            currentSlotIdx++;
            break;
          }
          currentTapeIdx++;
          currentSlotIdx = 0;
        }
        if (!assigned) break; // Ran out of slots
      }
      return { conflicts: conflictCount };
    }

    // Execution Mode
    setState(prev => {
      const nextFiles = { ...prev.files };
      const nextTapes = { ...prev.tapes };

      // Find starting point (re-find in prev state)
      let startColor: TapeColor | null = null;
      let startIdx = -1;

      if (targetColorHint) {
        const idx = nextTapes[targetColorHint].slots.findIndex(s => s.id === targetSlotId);
        if (idx !== -1) {
          startColor = targetColorHint;
          startIdx = idx;
        }
      } else {
        for (const color of TAPE_COLORS) {
          const idx = nextTapes[color].slots.findIndex(s => s.id === targetSlotId);
          if (idx !== -1) {
            startColor = color;
            startIdx = idx;
            break;
          }
        }
      }

      if (!startColor || startIdx === -1) return prev;

      let currentTapeIdx = TAPE_COLORS.indexOf(startColor);
      let currentSlotIdx = startIdx;
      const leftovers: string[] = [];
      let assignCount = 0;
      const assignedSlots = new Set<string>(); // Track assigned slots to avoid clearing them

      for (const fileId of fileIds) {
        let assigned = false;

        // Search for slot
        while (currentTapeIdx < TAPE_COLORS.length) {
          const color = TAPE_COLORS[currentTapeIdx];

          // Clone tape lazily
          let tape = nextTapes[color];
          if (tape === prev.tapes[color]) {
            tape = { ...tape, slots: [...tape.slots] };
            nextTapes[color] = tape;
          }

          while (currentSlotIdx < tape.slots.length) {
            const slot = tape.slots[currentSlotIdx];

            // Fill Mode: Skip occupied spots
            const isOccupied = slot.fileId !== null && slot.fileId !== fileId;

            if (mode === 'fill' && isOccupied) {
              // Skip this slot
              currentSlotIdx++;
              continue;
            }

            // Assign here
            // Park old if overwriting (only happens in overwrite mode or if logic forces it)
            if (slot.fileId && slot.fileId !== fileId) {
              nextFiles[slot.fileId] = { ...nextFiles[slot.fileId], isParked: true };
            }

            // Assign new
            tape.slots[currentSlotIdx] = { ...slot, fileId };
            nextFiles[fileId] = { ...nextFiles[fileId], isParked: false };

            // Track assignment
            assignedSlots.add(`${color}-${slot.id}`);

            assigned = true;
            assignCount++;
            currentSlotIdx++;
            break; // File assigned, move to next file
          }

          if (assigned) break; // Break tape loop, move to next file

          // Tape exhausted, move next
          currentTapeIdx++;
          currentSlotIdx = 0;
        }

        if (!assigned) leftovers.push(fileId);
      }

      // Cleanup Source Slots (Move Logic)
      if (sourceSlotKeys && sourceSlotKeys.length > 0) {
        sourceSlotKeys.forEach(key => {
          // Only clear if NOT in the set of newly assigned slots
          if (!assignedSlots.has(key)) {
            const [c, sIdStr] = key.split('-');
            const color = c as TapeColor;
            const sId = parseInt(sIdStr);

            let tape = nextTapes[color];
            // Clone if not already clone of prev (check referential equality)
            // Note: We might have cloned it in the loop above.
            // If nextTapes[color] === prev.tapes[color], we MUST clone before mutating.
            // But wait, if we are in this block, we might interact with a tape we haven't touched yet.
            if (tape === prev.tapes[color]) {
              tape = { ...tape, slots: [...tape.slots] };
              nextTapes[color] = tape;
            }

            // Clear the slot
            nextTapes[color].slots = nextTapes[color].slots.map(s => s.id === sId ? { ...s, fileId: null } : s);
          }
        });

        // Clear selection after successful move to remove visual borders
        setSelectedSlots(new Set());
      }

      if (leftovers.length > 0) {
        setConfirmAction({
          title: "Bulk Assignment Complete",
          message: `Assigned ${assignCount} files. ${leftovers.length} files could not create space.`,
          confirmLabel: "OK",
          showCancel: false,
          onConfirm: () => setConfirmAction(null)
        });
      } else {
        showToast(`Assigned ${assignCount} files (${mode})`, "success");
      }

      return { ...prev, files: nextFiles, tapes: nextTapes };
    });
  };

  const handleBulkAssign = (targetSlotId: number, fileIds: string[], targetColor?: TapeColor, sourceSlotKeys?: string[]) => {
    // 1. Check conflicts
    const result = processBulkAssign(targetSlotId, fileIds, 'check', targetColor);
    const conflicts = (result as { conflicts: number }).conflicts;

    if (conflicts > 0) {
      setBulkConflictState({
        targetSlotId,
        fileIds,
        conflicts,
        targetColor, // Save color for execution
        sourceSlotKeys
      });
    } else {
      processBulkAssign(targetSlotId, fileIds, 'overwrite', targetColor, sourceSlotKeys);
    }
  };

  const handleBulkOverwrite = () => {
    if (bulkConflictState) {
      processBulkAssign(bulkConflictState.targetSlotId, bulkConflictState.fileIds, 'overwrite', bulkConflictState.targetColor, bulkConflictState.sourceSlotKeys);
      setBulkConflictState(null);
    }
  };

  const handleBulkFillEmpty = () => {
    if (bulkConflictState) {
      processBulkAssign(bulkConflictState.targetSlotId, bulkConflictState.fileIds, 'fill', bulkConflictState.targetColor, bulkConflictState.sourceSlotKeys);
      setBulkConflictState(null);
    }
  };

  // Handle "Fill All Free Slots" from Unassigned
  const handleFillAllFreeSlots = (fileIds: string[]) => {
    // Current state from closure
    const nextFiles = { ...state.files };
    const nextTapes = { ...state.tapes };

    let currentTapeIdx = 0;
    let currentSlotIdx = 0;
    let assignedCount = 0;

    const assignNext = (fileId: string) => {
      while (currentTapeIdx < TAPE_COLORS.length) {
        const color = TAPE_COLORS[currentTapeIdx];

        // Clone tape/slots if not already cloned
        let tape = nextTapes[color];
        if (tape === state.tapes[color]) {
          tape = { ...tape, slots: [...tape.slots] };
          nextTapes[color] = tape;
        }

        while (currentSlotIdx < tape.slots.length) {
          const slot = tape.slots[currentSlotIdx];
          if (slot.fileId === null) {
            // Assign
            nextFiles[fileId] = { ...nextFiles[fileId], isParked: false };
            tape.slots[currentSlotIdx] = { ...slot, fileId: fileId };
            currentSlotIdx++;
            return true;
          }
          currentSlotIdx++;
        }
        currentTapeIdx++;
        currentSlotIdx = 0;
      }
      return false;
    };

    const leftovers: string[] = [];
    fileIds.forEach(id => {
      if (assignNext(id)) {
        assignedCount++;
      } else {
        leftovers.push(id);
      }
    });

    // Update State
    setState(prev => ({ ...prev, files: nextFiles, tapes: nextTapes }));

    // Show Feedback
    if (leftovers.length > 0) {
      setConfirmAction({
        title: "Fill Slots Complete",
        message: `Filled all free slots. ${leftovers.length} file(s) could not be assigned.`,
        confirmLabel: "OK",
        showCancel: false,
        onConfirm: () => setConfirmAction(null)
      });
    } else {
      showToast(`Assigned ${assignedCount} files to slots`, 'success');
    }
  };




  const handleRemoveFromTape = (slotId: number, color?: TapeColor) => {
    setState(prev => {
      const nextTapes = { ...prev.tapes };

      // Determine Target Tape (Use arg if provided, otherwise default to current or search?)
      // It's safer to rely on argument now.
      // But for backward compat (if called elsewhere), we can fallback to search or current?)
      // Given the bug, we should prioritize explicit color.

      let targetTapeColor: TapeColor | null = color || null;
      let targetSlot: typeof nextTapes.Blue.slots[0] | undefined;

      if (targetTapeColor) {
        targetSlot = nextTapes[targetTapeColor].slots.find(s => s.id === slotId);
      } else {
        // Fallback search (Legacy / Risk of bug)
        for (const c of TAPE_COLORS) {
          const s = nextTapes[c].slots.find(s => s.id === slotId);
          if (s) {
            targetTapeColor = c;
            targetSlot = s;
            break;
          }
        }
      }

      if (!targetTapeColor || !targetSlot) return prev; // Should not happen

      const fileId = targetSlot.fileId;

      nextTapes[targetTapeColor] = {
        ...nextTapes[targetTapeColor],
        slots: nextTapes[targetTapeColor].slots.map(s =>
          s.id === slotId ? { ...s, fileId: null } : s
        )
      };

      let nextFiles = prev.files;

      // If we removed a file, check if it's still used anywhere else
      if (fileId) {
        let stillUsed = false;
        (Object.keys(nextTapes) as TapeColor[]).forEach(color => {
          if (nextTapes[color].slots.some(s => s.fileId === fileId)) {
            stillUsed = true;
          }
        });

        if (!stillUsed && nextFiles[fileId]) {
          nextFiles = {
            ...prev.files,
            [fileId]: { ...prev.files[fileId], isParked: true }
          };
        }
      }

      return { ...prev, files: nextFiles, tapes: nextTapes };
    });
  };


  // --- Advanced Selection Logic (Slots) ---
  const handleSlotSelectionClick = (slotId: number, color: TapeColor, e: React.MouseEvent) => {
    e.stopPropagation();
    const slotKey = `${color}-${slotId}`;
    const newSet = new Set(selectedSlots);

    if (e.shiftKey && lastSelectedSlot) {
      // Range Selection (Cross-Tape or Single Tape?)
      // We need a linear list of all slots to determine range.
      // Order: TAPE_COLORS order, then 0-5.

      const allSlots: string[] = [];
      TAPE_COLORS.forEach(c => {
        for (let i = 0; i < 6; i++) allSlots.push(`${c}-${i}`);
      });

      const startIdx = allSlots.indexOf(lastSelectedSlot);
      const endIdx = allSlots.indexOf(slotKey);

      if (startIdx !== -1 && endIdx !== -1) {
        const low = Math.min(startIdx, endIdx);
        const high = Math.max(startIdx, endIdx);

        if (!e.ctrlKey && !e.metaKey) {
          newSet.clear();
        }

        for (let i = low; i <= high; i++) {
          newSet.add(allSlots[i]);
        }
      }
    } else if (e.ctrlKey || e.metaKey) {
      // Toggle
      if (newSet.has(slotKey)) {
        newSet.delete(slotKey);
      } else {
        newSet.add(slotKey);
        setLastSelectedSlot(slotKey);
        setAnchorSlot(slotKey);
      }
    } else {
      // Single Select
      newSet.clear();
      newSet.add(slotKey);
      setLastSelectedSlot(slotKey);
      setAnchorSlot(slotKey);
    }

    setSelectedSlots(newSet);
  };

  const toggleSlotSelection = (slotId: number, color: TapeColor) => {
    // Touch/Checkbox toggler
    const slotKey = `${color}-${slotId}`;
    const newSet = new Set(selectedSlots);
    if (newSet.has(slotKey)) newSet.delete(slotKey);
    else {
      newSet.add(slotKey);
      newSet.add(slotKey);
      setLastSelectedSlot(slotKey);
      setAnchorSlot(slotKey);
    }
    setSelectedSlots(newSet);
  };

  // Keyboard Navigation for Slots
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if input/teaxtarea or if focus is explicitly elsewhere (like FileBrowser)
      const active = document.activeElement as HTMLElement;
      if (active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA') return;
      if (active !== document.body && active?.getAttribute('tabindex') !== null) return;

      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      e.preventDefault();

      const allSlots: string[] = [];
      TAPE_COLORS.forEach(c => {
        for (let i = 0; i < 6; i++) allSlots.push(`${c}-${i}`);
      });

      let nextIndex = 0;
      if (lastSelectedSlot) {
        const currentIdx = allSlots.indexOf(lastSelectedSlot);
        if (currentIdx !== -1) {
          if (e.key === 'ArrowUp') nextIndex = Math.max(0, currentIdx - 6);
          else if (e.key === 'ArrowDown') nextIndex = Math.min(allSlots.length - 1, currentIdx + 6);
          else if (e.key === 'ArrowLeft') nextIndex = Math.max(0, currentIdx - 1);
          else if (e.key === 'ArrowRight') nextIndex = Math.min(allSlots.length - 1, currentIdx + 1);
        }
      } else {
        // Default to first slot if nothing selected
        nextIndex = 0;
      }

      const nextSlot = allSlots[nextIndex];
      const newSet = new Set(selectedSlots);

      if (e.shiftKey) {
        if (!anchorSlot) setAnchorSlot(lastSelectedSlot || nextSlot);
        const startId = anchorSlot || lastSelectedSlot || nextSlot;

        const startIdx = allSlots.indexOf(startId);
        const endIdx = nextIndex;

        const low = Math.min(startIdx, endIdx);
        const high = Math.max(startIdx, endIdx);

        if (!e.ctrlKey && !e.metaKey) newSet.clear();

        for (let i = low; i <= high; i++) newSet.add(allSlots[i]);

        setLastSelectedSlot(nextSlot);
      } else {
        newSet.clear();
        newSet.add(nextSlot);
        setLastSelectedSlot(nextSlot);
        setAnchorSlot(nextSlot);
      }

      setSelectedSlots(newSet);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedSlots, lastSelectedSlot, anchorSlot]);

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
      setTargetSlotForUpload(slotId);

      const pref = localStorage.getItem('spotykach_emptySlotPreferredBrowser');
      if (pref === 'os') {
        singleFileInputRef.current?.click();
      } else if (pref === 'sample-browser') {
        setShowSampleBrowser(true);
      } else {
        setShowBrowserChoiceModal(true);
      }
    }
  };

  const handleSlotDragStart = (e: React.DragEvent, slotId: number, color: TapeColor) => {
    const slotKey = `${color}-${slotId}`;
    const tape = state.tapes[color];
    const slot = tape.slots.find(s => s.id === slotId);

    if (!slot || !slot.fileId) {
      e.preventDefault();
      return;
    }

    // Check if dragging a selected slot
    if (selectedSlots.has(slotKey)) {
      // Collect all file IDs and Slot Keys from selected slots
      const fileIds: string[] = [];
      const sourceKeys: string[] = [];

      selectedSlots.forEach(key => {
        const [c, sIdStr] = key.split('-');
        const sId = parseInt(sIdStr);
        const s = state.tapes[c as TapeColor]?.slots.find(sl => sl.id === sId);
        if (s && s.fileId) {
          fileIds.push(s.fileId);
          sourceKeys.push(key);
        }
      });

      if (fileIds.length > 0) {
        e.dataTransfer.setData('application/x-spotykach-bulk-ids', JSON.stringify(fileIds));
        e.dataTransfer.setData('application/x-spotykach-bulk-source-slots', JSON.stringify(sourceKeys));
      }
    }

    // Standard Single File Data
    e.dataTransfer.setData('application/x-spotykach-file-id', slot.fileId);
    e.dataTransfer.setData('application/x-spotykach-source', 'slot');
    e.dataTransfer.setData('application/x-spotykach-slot-id', slot.id.toString());
    e.dataTransfer.setData('application/x-spotykach-slot-color', color);
    e.dataTransfer.effectAllowed = 'copyMove';

    // Polyfill Fallback: Serialize ALL data to JSON
    // Note: We include bulk info here too if it exists, so the receiver handles it.
    const fileIds = selectedSlots.has(slotKey) ? (() => {
      const ids: string[] = [];
      const keys: string[] = [];
      selectedSlots.forEach(key => {
        const [c, sIdStr] = key.split('-');
        const sId = parseInt(sIdStr);
        const s = state.tapes[c as TapeColor]?.slots.find(sl => sl.id === sId);
        if (s && s.fileId) {
          ids.push(s.fileId);
          keys.push(key);
        }
      });
      return ids.length > 0 ? { ids, keys } : null;
    })() : null;

    e.dataTransfer.setData('text/plain', JSON.stringify({
      id: slot.fileId,
      source: 'slot',
      slotId: slot.id,
      slotColor: color,
      bulkIds: fileIds?.ids,
      bulkSourceKeys: fileIds?.keys
    }));
  };

  const handleImportFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);

    setIsProcessing(true);
    setProgressMsg("Analyzing content...");

    try {
      const analysis = await analyzeImport(fileArray, (msg) => setProgressMsg(msg));
      setImportAnalysis(analysis);
    } catch (e) {
      console.error("Import analysis failed", e);
      showToast("Failed to analyze import", "error");
    } finally {
      setIsProcessing(false);
      setProgressMsg('');
    }

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSampleImport = async (url: string, name: string, origin?: string, license?: string) => {
    const slotTarget = targetSlotForUpload;
    const slotTargetTapeColor = currentTapeColor;
    if (slotTarget !== null) {
      if (isSlotSampleImportInFlightRef.current) return;
      isSlotSampleImportInFlightRef.current = true;
      setShowSampleBrowser(false);
      setTargetSlotForUpload(null);
    }

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

      const safeName = sanitizeFilename(name);

      if (safeName !== name) {
        showToast(`Renamed "${name}" to "${safeName}"`, 'info');
      }

      const newFile: FileRecord = {
        id: fileId,
        name: safeName.toUpperCase().replace(/\.[^/.]+$/, ""),
        originalName: name,
        versions: [version],
        currentVersionId: versionId,
        isParked: slotTarget === null, // Unassigned by default if not targeting a slot
        origin,
        license
      };

      setState(prev => {
        const nextFiles = { ...prev.files, [fileId]: newFile };

        if (slotTarget !== null) {
          const nextTapes = { ...prev.tapes };
          const tape = { ...nextTapes[slotTargetTapeColor] };
          const slots = [...tape.slots];
          const slotIndex = slots.findIndex(s => s.id === slotTarget);
          if (slotIndex >= 0) {
            slots[slotIndex] = { ...slots[slotIndex], fileId };
            tape.slots = slots;
            nextTapes[slotTargetTapeColor] = tape;
          }
          return { ...prev, files: nextFiles, tapes: nextTapes };
        }

        return { ...prev, files: nextFiles };
      });

      // Feedback toast
      showToast(`Imported ${name}`, 'success');

    } catch (e) {
      console.error(e);
      showToast("Error importing sample", 'error');
    } finally {
      if (slotTarget !== null) {
        isSlotSampleImportInFlightRef.current = false;
      }
      setIsProcessing(false);
      setProgressMsg('');
    }
  };

  // Import files directly to pool (unassigned)
  const handleImportToPool = async (files: { file: File, path: string }[]) => {
    setIsProcessing(true);
    setProgressMsg(`Adding ${files.length} file(s) to pool...`);
    try {
      for (const { file } of files) {
        const { buffer, blob: processedBlob } = await audioEngine.loadAndProcessAudio(file);
        const fileId = generateId();
        const versionId = generateId();
        const safeName = sanitizeFilename(file.name);

        const version: AudioVersion = {
          id: versionId,
          timestamp: Date.now(),
          description: 'Imported Sample',
          blob: processedBlob,
          duration: buffer.duration
        };

        const newFile: FileRecord = {
          id: fileId,
          name: safeName.toUpperCase().replace(/\.[^/.]+$/, ""),
          originalName: file.name,
          versions: [version],
          currentVersionId: versionId,
          isParked: true, // Always to pool
          origin: 'Local Folder'
        };

        setState(prev => ({
          ...prev,
          files: { ...prev.files, [fileId]: newFile }
        }));
      }
      showToast(`Added ${files.length} file(s) to pool`, 'success');
    } catch (e) {
      console.error(e);
      showToast('Import to pool failed', 'error');
    } finally {
      setIsProcessing(false);
      setProgressMsg('');
    }
  };

  // Import files targeting a specific tape
  const handleImportToTape = async (files: { file: File, path: string }[], targetTape: TapeColor) => {
    setIsProcessing(true);
    setProgressMsg(`Adding ${files.length} file(s) to Tape ${targetTape}...`);
    try {
      for (const { file } of files) {
        const { buffer, blob: processedBlob } = await audioEngine.loadAndProcessAudio(file);
        const fileId = generateId();
        const versionId = generateId();
        const safeName = sanitizeFilename(file.name);

        const version: AudioVersion = {
          id: versionId,
          timestamp: Date.now(),
          description: 'Imported Sample',
          blob: processedBlob,
          duration: buffer.duration
        };

        const newFile: FileRecord = {
          id: fileId,
          name: safeName.toUpperCase().replace(/\.[^/.]+$/, ""),
          originalName: file.name,
          versions: [version],
          currentVersionId: versionId,
          isParked: false,
          origin: 'Local Folder'
        };

        setState(prev => {
          const nextFiles = { ...prev.files, [fileId]: newFile };
          const nextTapes = { ...prev.tapes };
          const tape = { ...nextTapes[targetTape] };
          const slots = [...tape.slots];

          // Find first free slot on this tape
          const freeIdx = slots.findIndex(s => s.fileId === null);
          if (freeIdx >= 0) {
            slots[freeIdx] = { ...slots[freeIdx], fileId };
            tape.slots = slots;
            nextTapes[targetTape] = tape;
          } else {
            // Tape full — park it instead
            nextFiles[fileId] = { ...nextFiles[fileId], isParked: true };
          }

          return { ...prev, files: nextFiles, tapes: nextTapes };
        });
      }
      showToast(`Added ${files.length} file(s) to Tape ${targetTape}`, 'success');
    } catch (e) {
      console.error(e);
      showToast(`Import to Tape ${targetTape} failed`, 'error');
    } finally {
      setIsProcessing(false);
      setProgressMsg('');
    }
  };

  const handleResetEmptySlotBrowserPreference = () => {
    localStorage.removeItem('spotykach_emptySlotPreferredBrowser');
    showToast('Empty slot browser preference reset', 'success');
  };
  const missingFileIds = useMemo(() => new Set((missingFilesWarning || []).map(a => a.fileId)), [missingFilesWarning]);

  return (
    <ErrorBoundary>
      {isWelcomeActive && !workHandle && (
        <SetupWizard
          onComplete={async (work, backup, projectName) => {
            setWorkHandle(work);
            setBackupHandle(backup || null);
            setIsWelcomeActive(false);
            showToast("Workspace Configured!", 'success');

            // Save handles
            saveDirectoryHandle('work', work);
            if (backup) saveDirectoryHandle('backup', backup);

            // Auto-scan projects
            await handleSmartScan(work);

            if (projectName) {
              await handleCreateEmptyProject(projectName, work);
            } else {
              setShowProjectManager(true);
            }
          }}
          onSkip={() => {
            if (confirm("Browser Cache Mode is temporary. Your work will be lost if you clear browser data. Continue?")) {
              setIsWelcomeActive(false);
            }
          }}
          restorableHandles={restorableHandles}
          onRestore={handleRestoreSession}
        />
      )}

      {(!isWelcomeActive || workHandle) && (
        <div className="flex h-screen bg-synthux-main text-white font-sans overflow-hidden noise-texture">

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
            onOpenLogs={() => setIsLogModalOpen(true)}
          />

          {/* Duplicates Banner */}


          {/* Main Content Area */}
          <div className="flex-1 flex flex-col min-h-0 relative">
            {/* DEBUGGER REMOVED - See docs/debugging/README.md */}

            {/* Header */}
            <header className="h-14 border-b border-gray-800 flex items-center justify-between px-4 bg-synthux-panel shrink-0 gap-4">

              {/* LEFT — Logo + context */}
              <div className="flex items-center gap-3 min-w-0 shrink-0">
                <img src={logoImg} alt="Spotykach Logo" className="h-8 w-auto object-contain shrink-0" />
                <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-synthux-orange to-synthux-yellow bg-clip-text text-transparent hidden lg:block font-header leading-none">
                  Spotykach WAV.builder
                </span>

                {/* Context pill */}
                <div className="hidden sm:flex ml-1 px-2.5 py-1 rounded-full bg-gray-900/60 border border-gray-700/60 text-[11px] font-medium text-gray-300 items-center gap-1.5 select-none shrink-0 max-w-[260px] truncate">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${workHandle ? 'bg-indigo-400 shadow-[0_0_6px_rgba(99,102,241,0.6)]' : 'bg-gray-600'}`} />
                  {workHandle ? (
                    <>
                      <span className="text-gray-400 truncate">{workHandle.name}</span>
                      {currentProjectName && (
                        <>
                          <span className="text-gray-600">/</span>
                          <span className="text-white font-bold truncate">{currentProjectName}</span>
                          {(hasUnsavedChanges || isEditorDirty) && (
                            <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shadow-[0_0_5px_rgba(250,204,21,0.5)] shrink-0 animate-pulse" title={isEditorDirty ? "Unapplied changes in editor" : "Unsaved changes"} />
                          )}
                        </>
                      )}
                    </>
                  ) : <span className="text-gray-500 italic">No folder</span>}
                </div>
              </div>

              {/* HIDDEN INPUTS */}
              <input type="file" multiple {...{ webkitdirectory: "" } as any} ref={fileInputRef} onChange={handleImportFiles} className="hidden" />
              <input type="file" ref={singleFileInputRef} onChange={(e) => {
                if (e.target.files && targetSlotForUpload !== null) {
                  handleSlotDrop(targetSlotForUpload, e.target.files, currentTapeColor);
                }
                setTargetSlotForUpload(null);
                if (singleFileInputRef.current) singleFileInputRef.current.value = '';
              }} className="hidden" />

              {/* RIGHT — Action buttons */}
              <div className="flex items-center gap-1.5 shrink-0">

                <button onClick={() => setShowConfigModal(true)} title="config.txt Settings"
                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md transition-colors ${showConfigModal ? 'text-white bg-white/10' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}>
                  <div className="w-5 h-5 shrink-0">
                    <img src={tapeIcon} alt="Config" className="w-full h-full opacity-60 invert group-hover:opacity-100" />
                  </div>
                  <span className="text-[11px] font-bold uppercase tracking-wider">config.txt</span>
                </button>

                <div className="h-5 w-px bg-gray-700 mx-1" />

                <button onClick={() => setShowProjectNotes(!showProjectNotes)} title="Project Notes"
                  className={`p-1.5 rounded-md transition-colors ${showProjectNotes ? 'text-white bg-white/10' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}>
                  <StickyNote size={16} />
                </button>
                <button onClick={() => setShowSettings(true)} title="Settings"
                  className="p-1.5 text-gray-500 hover:text-white hover:bg-white/5 rounded-md transition-colors">
                  <Settings size={16} />
                </button>
                <button onClick={() => setShowInfo(true)} title="About"
                  className="p-1.5 text-gray-500 hover:text-white hover:bg-white/5 rounded-md transition-colors">
                  <Info size={16} />
                </button>
                <button onClick={() => setShowHelp(true)} title="Help"
                  className="p-1.5 text-gray-500 hover:text-white hover:bg-white/5 rounded-md transition-colors">
                  <HelpCircle size={16} />
                </button>

                <div className="h-5 w-px bg-gray-700 mx-1" />

                {/* Build SD — only when SD connected */}
                {backupHandle && (
                  <button
                    onClick={async () => {
                      if (!currentProjectName) {
                        handleScanProjects(); // open PM to pick a project
                        return;
                      }
                      setIsProcessing(true);
                      setProgressMsg('Scanning SK slot differences...');
                      try {
                        const { calculateSyncDiff, scanSKStructure } = await import('./utils/importUtils');
                        const structureMap = await scanSKStructure(backupHandle);
                        const diff = await calculateSyncDiff(state, structureMap);
                        setSyncModalState({ isOpen: true, projectName: currentProjectName, diff, defaultMode: 'push' });
                      } catch (e: any) {
                        showToast('SK scan failed: ' + e.message, 'error');
                      } finally {
                        setIsProcessing(false);
                        setProgressMsg('');
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-orange-500/30 text-orange-400 hover:text-white hover:bg-orange-500/15 hover:border-orange-500/50 transition-all text-[11px] font-bold uppercase tracking-wider"
                    title="Push SK to SD card"
                  >
                    <RiSdCardMiniLine size={14} />
                    <ArrowRight size={11} strokeWidth={2.5} />
                    <span className="hidden sm:inline">Build SD</span>
                  </button>
                )}

                {/* Import SD — only when SD connected */}
                {backupHandle && (
                  <button
                    onClick={async () => {
                      setIsProcessing(true);
                      setProgressMsg('Scanning SK folder on SD...');
                      try {
                        const { calculateSyncDiff, scanSKStructure } = await import('./utils/importUtils');
                        const structureMap = await scanSKStructure(backupHandle);
                        const diff = await calculateSyncDiff(state, structureMap);
                        setSyncModalState({ isOpen: true, projectName: currentProjectName || '', diff, defaultMode: 'import' });
                      } catch (e: any) {
                        showToast('SK scan failed: ' + e.message, 'error');
                      } finally {
                        setIsProcessing(false);
                        setProgressMsg('');
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-500/30 text-indigo-400 hover:text-white hover:bg-indigo-500/15 hover:border-indigo-500/50 transition-all text-[11px] font-bold uppercase tracking-wider"
                    title="Import SK from SD card"
                  >
                    <RiSdCardMiniLine size={14} />
                    <ArrowLeft size={11} strokeWidth={2.5} />
                    <span className="hidden sm:inline">Import SD</span>
                  </button>
                )}

                <div className="h-5 w-px bg-gray-700 mx-1" />

                {/* Save */}
                <button
                  onClick={handleSaveProject}
                  title={hasUnsavedChanges || isEditorDirty ? `Save ${currentProjectName || 'Project'} (unsaved changes)` : `Save ${currentProjectName || 'Project'}`}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-bold uppercase tracking-wider transition-all ${hasUnsavedChanges || isEditorDirty
                    ? 'border-yellow-500/50 text-yellow-300 bg-yellow-500/10 hover:bg-yellow-500/20 shadow-[0_0_10px_rgba(234,179,8,0.1)]'
                    : 'border-white/10 text-gray-400 hover:text-white hover:bg-white/5'
                    } ${(hasUnsavedChanges || isEditorDirty) ? 'animate-[pulse_2s_cubic-bezier(0.4,0,0.6,1)_infinite]' : ''}`}
                >
                  <Save size={13} strokeWidth={2.5} />
                  <span className="hidden sm:inline">Save</span>
                  {(hasUnsavedChanges || isEditorDirty) && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse border border-yellow-500/50" />}
                  {(() => {
                    // console.log(`[Render] SaveButton: hasUnsavedChanges=${hasUnsavedChanges}, isEditorDirty=${isEditorDirty}`);
                    return null;
                  })()}
                </button>

                {/* New Project */}
                <button
                  id="save-as-btn"
                  onClick={async () => {
                    if (!workHandle) { handleSetWorkFolder(); return; }
                    const name = prompt("New project name:", currentProjectName ? `${currentProjectName}_copy` : "New Project");
                    if (name) await handleSaveProjectAs(name);
                  }}
                  title="Save current state as a new project"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 text-[11px] font-bold uppercase tracking-wider transition-all"
                >
                  <FilePlus size={13} strokeWidth={2.5} />
                  <span className="hidden sm:inline">New Project</span>
                </button>

                {/* Project Manager */}
                <button
                  onClick={() => {
                    if (!workHandle) handleSetWorkFolder();
                    else handleScanProjects();
                  }}
                  title="Project Manager"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-gray-300 hover:text-white hover:bg-white/5 text-[11px] font-bold uppercase tracking-wider transition-all"
                >
                  <Folder size={13} strokeWidth={2.5} />
                  <span className="hidden sm:inline">Project Manager</span>
                </button>

              </div>
            </header>



            <div className="flex flex-1 overflow-hidden">
              <FileBrowser
                files={Object.values(state.files)}
                tapes={state.tapes}
                onParkRequest={handleParkRequest}
                onOpenSampleBrowser={() => setShowSampleBrowser(true)}
                duplicates={duplicateFileIds}
                onOpenDuplicateModal={() => setShowDuplicateModal(true)}
                onUnassignFile={onUnassignFile}
                onBulkUnassign={handleBulkUnassign}
                onDeleteFile={onDeleteFile}
                onFillFreeSlots={handleFillAllFreeSlots}
                onRenameFile={handleRenameFile}
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
                        {/* Title and Notes Teaser */}
                        <div className="flex-1 flex items-center gap-4 min-w-0 pr-4">
                          <h2
                            style={{ color: `var(--color-synthux-${currentTapeColor.toLowerCase()})` }}
                            className="text-4xl font-bold font-header tracking-tight uppercase drop-shadow-md shrink-0 flex items-center gap-3"
                          >
                            Tape {currentTapeColor}
                            {/* Download Tape Button (Next to Title) */}
                            <button
                              onClick={() => exportSingleTape(currentTapeColor, currentTape, state.files)}
                              className="p-1.5 rounded-full bg-gray-800 hover:bg-white/10 text-gray-400 hover:text-white transition-colors border border-gray-700 hover:border-gray-500"
                              title={`Download ${currentTapeColor} Tape (Zip)`}
                            >
                              <Download size={16} />
                            </button>
                          </h2>

                          {/* Notes Teaser */}
                          {currentTape.notes && currentTape.notes.trim() !== '' && (
                            <div
                              className="flex items-center gap-2 cursor-pointer group px-3 py-1.5 rounded-lg bg-gray-800/50 hover:bg-gray-800 border border-gray-700/50 hover:border-gray-600 transition-all max-w-[300px] md:max-w-[400px] hidden sm:flex shrink-0 min-w-0"
                              onClick={() => {
                                document.getElementById('tape-notes-section')?.scrollIntoView({ behavior: 'smooth' });
                              }}
                              title="Scroll to Tape Notes"
                            >
                              <FileText size={16} className="text-gray-400 group-hover:text-synthux-yellow transition-colors shrink-0" />
                              <span className="text-xs text-gray-400 group-hover:text-gray-200 transition-colors font-mono truncate">
                                {(() => {
                                  const firstLine = currentTape.notes.split('\n').map(l => l.trim()).filter(l => l.length > 0)[0]?.replace(/^#+\s*/, '').replace(/\*\*/g, '').replace(/-\s*/, '');
                                  if (!firstLine) return 'Notes...';
                                  return firstLine;
                                })()}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Single View Duplicate Notification (Left Aligned next to title) */}
                        {duplicateFileIds.size > 0 && (
                          <div className="flex items-center gap-4 bg-[#1a1a1a]/80 border border-orange-500/20 rounded-lg px-4 py-2 backdrop-blur-sm">
                            <div className="flex items-center gap-2">
                              <div className="p-1 bg-orange-500/10 rounded-full">
                                <AlertTriangle className="text-orange-900" size={14} />
                              </div>
                              <span className="text-xs font-medium text-gray-400">
                                {duplicateFileIds.size} file{duplicateFileIds.size !== 1 ? 's' : ''} assigned to multiple slots.
                              </span>
                            </div>
                            <button
                              onClick={() => setShowDuplicateModal(true)}
                              className="text-[10px] font-bold uppercase text-orange-600 hover:text-orange-400 hover:bg-orange-500/10 px-2 py-1 rounded transition-all"
                            >
                              Resolve
                            </button>
                          </div>
                        )}
                      </div>

                      <SlotGrid
                        slots={currentTape.slots}
                        files={state.files}
                        tapeColor={currentTapeColor}
                        activeSlotId={activeSlotId}
                        onSlotClick={handleSlotClick}
                        onSlotDrop={(id, files) => handleSlotDrop(id, files, currentTapeColor)}
                        onSlotDropInternal={(slotId, fileId, source, isDuplicate, sourceSlotId, sourceSlotColor) => {
                          handleSlotDropInternal(slotId, fileId, source, isDuplicate, currentTapeColor, sourceSlotId, sourceSlotColor);
                        }}
                        onRemoveSlot={handleRemoveFromTape}
                        duplicates={duplicateFileIds}
                        onDeleteFile={onDeleteFile}
                        onBulkAssign={handleBulkAssign}
                        selectedSlots={selectedSlots}
                        onSlotSelectionClick={(color, id, e) => handleSlotSelectionClick(id, color, e)}
                        onToggleSlotSelection={(color, id) => toggleSlotSelection(id, color)}
                        onSlotDragStart={handleSlotDragStart}
                        onRenameFile={handleRenameFile}
                        missingFileIds={missingFileIds}
                      />

                      {/* Tape Notes */}
                      <div id="tape-notes-section" className="mt-8 border-t border-white/10 pt-6 px-6 relative z-10">
                        <NotesEditor
                          title={
                            <span
                              className="flex items-center gap-2 drop-shadow-sm"
                              style={{ color: `var(--color-synthux-${currentTapeColor.toLowerCase()})` }}
                            >
                              <StickyNote size={14} /> Tape {currentTapeColor} Notes
                            </span>
                          }
                          value={currentTape.notes || ''}
                          onChange={(val) => {
                            setState((prev: AppState) => ({
                              ...prev,
                              tapes: {
                                ...prev.tapes,
                                [currentTapeColor]: {
                                  ...prev.tapes[currentTapeColor],
                                  notes: val
                                }
                              }
                            }));
                            setHasUnsavedChanges(true);
                          }}
                          minHeight="150px"
                        />
                      </div>
                    </>
                  ) : (
                    <div className="bg-black/40 rounded-3xl p-4 border border-white/5 backdrop-blur-md">
                      <div className="flex items-center justify-between gap-3 mb-6 px-4">
                        <div className="flex items-center gap-4">
                          <h2 className="text-4xl font-bold font-header tracking-tight uppercase text-white drop-shadow-md">
                            All Tapes
                          </h2>
                          <button
                            onClick={toggleAllNotes}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs font-bold transition-colors uppercase tracking-wider"
                            title="Toggle All Notes"
                          >
                            <ScrollText size={14} /> Toggle All Notes
                          </button>
                        </div>

                        {/* All View Duplicate Notification */}
                        {duplicateFileIds.size > 0 && (
                          <div className="flex items-center gap-4 bg-[#1a1a1a]/80 border border-orange-500/20 rounded-lg px-4 py-2 backdrop-blur-sm">
                            <div className="flex items-center gap-2">
                              <div className="p-1 bg-orange-500/10 rounded-full">
                                <AlertTriangle className="text-orange-900" size={14} />
                              </div>
                              <span className="text-xs font-medium text-gray-400">
                                {duplicateFileIds.size} Conflict{duplicateFileIds.size !== 1 ? 's' : ''}
                              </span>
                            </div>
                            <button
                              onClick={() => setShowDuplicateModal(true)}
                              className="text-[10px] font-bold uppercase text-orange-600 hover:text-orange-400 hover:bg-orange-500/10 px-2 py-1 rounded transition-all"
                            >
                              Resolve
                            </button>
                          </div>
                        )}


                      </div>

                      <AllViewGrid
                        tapes={state.tapes}
                        files={state.files}
                        onRemoveSlot={(slotId, color) => handleRemoveFromTape(slotId, color)}
                        onSlotDrop={handleSlotDrop} // AllViewGrid will pass color
                        onSlotDropInternal={handleSlotDropInternal} // AllViewGrid will pass color
                        onSlotClick={handleAllViewSlotClick}
                        onTapeHeaderClick={(color) => {
                          setCurrentTapeColor(color);
                          setViewMode('single');
                        }}
                        duplicates={duplicatesMap}
                        onDeleteFile={onDeleteFile}
                        onBulkAssign={handleBulkAssign}
                        selectedSlots={selectedSlots}
                        onSlotSelectionClick={handleSlotSelectionClick}
                        onToggleSlotSelection={(id, color) => toggleSlotSelection(id, color)}
                        onSlotDragStart={handleSlotDragStart}
                        noteStates={allViewNoteStates}
                        setNoteStates={setAllViewNoteStates}
                        onTapeNoteChange={(color, note) => {
                          setState(prev => ({
                            ...prev,
                            tapes: {
                              ...prev.tapes,
                              [color]: { ...prev.tapes[color], notes: note }
                            }
                          }));
                          setHasUnsavedChanges(true);
                        }}
                        onRenameFile={handleRenameFile}
                        missingFileIds={missingFileIds}
                      />
                    </div>
                  )}
                </div>

                {/* Duplicates Notification (Calm & Below Tapes) */}



              </main>
            </div>

            {/* Editor Modal */}
            {
              showEditor && activeFile && (
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
                        isDuplicate={duplicateFileIds.has(activeFile.id)}
                        metadata={activeFile.metadata}
                        onClose={() => {
                          setActiveSlotId(null);
                        }}
                        onCleanupProject={handleCleanupProject}
                        onRenameFile={handleRenameFile}
                        onDirtyStateChange={(dirty) => {
                          setIsEditorDirty(dirty);
                        }}
                        onSaveUnique={handleSaveUnique}
                        onSave={handleSaveFile}
                        onSaveAsCopy={handleSaveAsCopy}
                        onDeleteVersion={handleDeleteVersion}
                        onAssignVersion={handleAssignVersion}
                        onMoveVersionToPool={handleMoveVersionToPool}
                        showToast={showToast}
                      />
                    );
                  })()}
                </ErrorBoundary>
              )
            }

            {
              bulkConflictState && (
                <BulkConflictModal
                  count={bulkConflictState.conflicts}
                  onOverwrite={handleBulkOverwrite}
                  onFillEmpty={handleBulkFillEmpty}
                  onCancel={() => setBulkConflictState(null)}
                />
              )
            }

            <BrowserChoiceModal
              isOpen={showBrowserChoiceModal}
              onClose={() => {
                setShowBrowserChoiceModal(false);
                setTargetSlotForUpload(null);
              }}
              onChoice={(choice, remember) => {
                setShowBrowserChoiceModal(false);
                if (remember) {
                  localStorage.setItem('spotykach_emptySlotPreferredBrowser', choice);
                }
                if (choice === 'os') {
                  singleFileInputRef.current?.click();
                } else {
                  setShowSampleBrowser(true);
                }
              }}
            />

            {
              showDuplicateModal && (
                <DuplicateResolveModal
                  duplicates={duplicatesMap}
                  files={state.files}
                  onClose={() => setShowDuplicateModal(false)}
                  onKeep={handleResolveKeep}
                  onMakeUnique={handleResolveUnique}
                />
              )
            }



            {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
            {showInfo && <InfoModal onClose={() => setShowInfo(false)} onReset={handleReset} />}
            <SettingsModal
              isOpen={showSettings}
              onClose={() => setShowSettings(false)}
              onResetApp={handleReset}
              onCleanupProject={handleCleanupProject}
              currentProjectName={currentProjectName}
              onResetEmptySlotBrowserPreference={handleResetEmptySlotBrowserPreference}
              visualFilters={visualFilters}
              onUpdateVisualFilters={setVisualFilters}
              onSaveVisualSettings={handleSaveVisualSettings}
            />
            {showExport && (
              <ExportModal
                files={state.files}
                tapes={state.tapes}
                onClose={() => setShowExport(false)}
                onExportSD={async (opts) => {
                  setShowExport(false); // Close settings modal
                  await handleExportProgress('SD Card Export', async (log: (msg: string | undefined, progress?: number) => void) => {
                    await exportSDStructure(state, opts, log);
                  });
                }}
                onExportFiles={async (opts) => {
                  setShowExport(false);
                  await handleExportProgress('File Export', async (log: (msg: string | undefined, progress?: number) => void) => {
                    await exportFilesOnly(state, opts, log);
                  });
                }}
                onExportProject={async (_opts) => {
                  setShowExport(false);
                  await handleExportProgress('Project Backup', async (log) => {
                    await exportSaveState(state, false, log);
                  });
                }}
              />
            )}

            <ExportProgressModal
              isOpen={showExportProgress}
              onClose={() => setShowExportProgress(false)}
              logs={exportLogs}
              isComplete={isExportComplete}
              error={exportError}
              progress={exportProgress !== null ? exportProgress : undefined}
            />

            {
              importAnalysis && (
                <ImportModal
                  analysis={importAnalysis}
                  onClose={() => setImportAnalysis(null)}
                  onRestoreAndSync={handleRestoreAndSync}
                  onRestoreProject={(projectState) => {
                    setState(projectState);
                    setImportAnalysis(null);
                    showToast("Project Restored Successfully", "success");
                  }}
                  onImportStructure={async (structureMap) => {
                    showToast("Importing Structure...", "neutral");

                    import('./utils/importUtils').then(({ processSDStructure }) => {
                      setState(prev => {
                        const result = processSDStructure(structureMap, prev.files, prev.tapes);
                        return { ...prev, files: result.files, tapes: result.tapes };
                      });
                      setImportAnalysis(null);
                      showToast("SD Structure Imported", "success");
                    });
                  }}
                  onImportFiles={(files) => {
                    import('./utils/importUtils').then(({ processAudioFiles }) => {
                      const newFiles = processAudioFiles(files);
                      const count = Object.keys(newFiles).length;

                      if (count > 0) {
                        setState(prev => ({
                          ...prev,
                          files: { ...prev.files, ...newFiles }
                        }));
                        showToast(`Imported ${count} files to Pool`, "success");
                      }
                      setImportAnalysis(null);
                    });
                  }}
                />
              )
            }





            <ProjectManager
              isOpen={showProjectManager}
              onClose={() => setShowProjectManager(false)}
              projects={foundProjects}
              onLoadProject={(name) => {
                checkUnsavedChanges(() => handleLoadProject(name));
              }}
              onSaveProject={handleSaveProjectAs}
              onCreateEmptyProject={handleCreateEmptyProject}
              currentProjectName={currentProjectName}
              hasUnsavedChanges={hasUnsavedChanges}
              onCleanupProject={handleCleanupProject}
              onDeleteProject={handleDeleteProject}
              onDeleteBackupProject={backupHandle ? async (name) => {
                setConfirmAction({
                  title: 'Delete SD Backup?',
                  message: (
                    <span>
                      This will permanently delete <strong>{name}</strong> from the SD card backup.<br /><br />
                      The local copy in your Work Folder will <em>not</em> be affected.
                    </span>
                  ),
                  isDestructive: true,
                  confirmLabel: 'Delete from SD',
                  onConfirm: async () => {
                    try {
                      setIsProcessing(true);
                      setProgressMsg(`Deleting SD backup: ${name}...`);
                      const projectsDir = await backupHandle!
                        .getDirectoryHandle('WAV_Builder', { create: false })
                        .then(d => d.getDirectoryHandle('Projects', { create: false }));
                      await projectsDir.removeEntry(name, { recursive: true });
                      showToast(`SD backup "${name}" deleted`, 'success');
                      await scanProjects(workHandle, backupHandle);
                    } catch (e: any) {
                      showToast('Delete failed: ' + e.message, 'error');
                    } finally {
                      setIsProcessing(false);
                      setProgressMsg('');
                    }
                  },
                });
              } : undefined}
              onRenameProject={handleRenameProject}
              onDuplicateProject={handleDuplicateProject}
              onScan={async () => {
                if (isProcessing) return;
                setIsProcessing(true);
                try {
                  const startTime = Date.now();
                  await scanProjects(workHandle, backupHandle);

                  // Ensure spinner shows for at least 500ms
                  const elapsed = Date.now() - startTime;
                  if (elapsed < 500) {
                    await new Promise(r => setTimeout(r, 500 - elapsed));
                  }

                  showToast("Project scan complete", "success");
                } catch (e) {
                  console.error("Scan failed", e);
                  showToast("Scan failed", "error");
                } finally {
                  setIsProcessing(false);
                }
              }}
              isScanning={isProcessing}
              onOpenHelp={() => setShowHelp(true)}
              deviceDiff={deviceDiff || undefined}
              workHandle={workHandle}
              backupHandle={backupHandle}
              onChangeWorkFolder={handleSetWorkFolder}
              onChangeBackupFolder={handleSetBackupFolder}
              onSyncProject={(projectName) => setSyncProjectTarget(projectName)}
              onImportZip={handleImportZip}
              onExportZip={handleExportZip}
              onBuildProject={async (projectName) => {
                if (!workHandle || !backupHandle) {
                  showToast("Both Project Folder and SD Card must be connected.", 'error');
                  return;
                }

                setIsProcessing(true);
                setProgressMsg(`Analyzing ${projectName}...`);

                try {
                  const { loadProjectFromDirectory } = await import('./utils/exportUtils');
                  const { calculateSyncDiff, scanSKStructure } = await import('./utils/importUtils');

                  // 1. Load Project State Headless
                  const projectState = await loadProjectFromDirectory(projectName, workHandle, (msg) => setProgressMsg(msg || 'Loading project...'));

                  // 2. Scan SD Structure
                  setProgressMsg('Scanning SD Card...');
                  const structureMap = await scanSKStructure(backupHandle);

                  // 3. Calculate Diff
                  setProgressMsg('Calculating Differences...');
                  const diff = await calculateSyncDiff(projectState, structureMap);

                  setSyncModalState({ isOpen: true, projectName, diff, defaultMode: 'push' });

                } catch (e: any) {
                  console.error(e);
                  showToast("Failed to build diff: " + e.message, 'error');
                } finally {
                  setIsProcessing(false);
                  setProgressMsg('');
                }
              }}
              onImportSK={async () => {
                if (!backupHandle) {
                  showToast("SD card not connected.", 'error');
                  return;
                }
                setIsProcessing(true);
                setProgressMsg('Scanning SK folder on SD...');
                try {
                  const { calculateSyncDiff, scanSKStructure } = await import('./utils/importUtils');
                  const structureMap = await scanSKStructure(backupHandle);
                  const diff = await calculateSyncDiff(state, structureMap);
                  setSyncModalState({ isOpen: true, projectName: currentProjectName || '', diff, defaultMode: 'import' });
                } catch (e: any) {
                  console.error(e);
                  showToast("SK scan failed: " + e.message, 'error');
                } finally {
                  setIsProcessing(false);
                  setProgressMsg('');
                }
              }}
              onSyncUserLibraryToSD={() => setShowLibrarySyncModal(true)}
              activeSKProject={activeSKProject || undefined}
            />

            {syncProjectTarget && workHandle && backupHandle && (
              <ProjectSyncModal
                projectName={syncProjectTarget}
                localState={state}
                backupHandle={backupHandle}
                onChangeSDCard={handleSetBackupFolder}
                onClose={() => setSyncProjectTarget(null)}
                onApply={async (newState) => {
                  if (!workHandle || !backupHandle || !syncProjectTarget) return;
                  setIsProcessing(true);
                  setProgressMsg('Saving sync changes locally...');
                  try {
                    // Stamp a shared saved-at timestamp so both copies have the same
                    // metadata.exportDate — this prevents scanProjects from
                    // marking the project as "modified" right after a sync.
                    const savedAt = new Date().toISOString();
                    const stampedState: AppState = {
                      ...newState,
                      metadata: {
                        ...newState.metadata,
                        exportDate: savedAt,
                        appName: newState.metadata?.appName ?? 'WAV Builder',
                        version: newState.metadata?.version ?? '1.0',
                      },
                    };

                    // Local: Work/Projects/{name}/
                    await saveProjectToDirectory(stampedState, workHandle, (msg) => setProgressMsg(msg || ''), syncProjectTarget);

                    // Backup: SD/WAV_Builder/ → Projects/{name}/
                    setProgressMsg('Saving sync changes to SD backup...');
                    const wavBuilderHandle = await backupHandle.getDirectoryHandle('WAV_Builder', { create: true });
                    await saveProjectToDirectory(stampedState, wavBuilderHandle, (msg) => setProgressMsg(msg || ''), syncProjectTarget);

                    // If this is the active project, update in-memory state without
                    // triggering the hasUnsavedChanges watcher.
                    if (currentProjectName === syncProjectTarget) {
                      isSystemUpdate.current = true;
                      setState(stampedState);
                      setHasUnsavedChanges(false);
                    }

                    showToast(`${syncProjectTarget} synced successfully`, 'success');
                    setSyncProjectTarget(null);
                    await scanProjects(workHandle, backupHandle);
                  } catch (e: any) {
                    console.error(e);
                    showToast('Sync failed: ' + e.message, 'error');
                  } finally {
                    setIsProcessing(false);
                    setProgressMsg('');
                  }
                }}
              />
            )}

            {syncModalState?.diff && (
              <ExportPreviewModal
                isOpen={!!syncModalState?.isOpen}
                projectName={syncModalState?.projectName || ''}
                diff={syncModalState.diff}
                defaultMode={syncModalState.defaultMode ?? 'push'}
                onChangeSDCard={handleSetBackupFolder}
                onRefresh={handleSKRefresh}
                isRefreshing={isProcessing}
                onClose={() => setSyncModalState(null)}
                onConfirm={async (decisions, options: ExportOptions, importDecisions) => {
                  const projectName = syncModalState?.projectName;
                  setSyncModalState(null); // Close modal

                  if (!workHandle || !projectName) return;

                  setIsProcessing(true);
                  setProgressMsg(`Syncing ${projectName}...`);

                    try {
                      const projectState = await loadProjectFromDirectory(projectName, workHandle, (msg) => setProgressMsg(msg || 'Loading...'));

                      // 1. Verify Blobs (Pre-sync check for NotReadableError)
                      const unreadable = await verifyProjectBlobs(projectState);
                      if (unreadable.length > 0) {
                        const fileList = unreadable.map(u => u.fileName).slice(0, 3).join(', ') + (unreadable.length > 3 ? '...' : '');
                        showToast(`Unreadable files detected: ${fileList}. Please refresh or re-link project folder.`, 'error');
                        setIsProcessing(false);
                        setProgressMsg('');
                        return;
                      }

                      // 2. Prepare decisions and state
                      const finalDecisions = { ...decisions };
                      if (options.includeConfig && options.configDecision === 'push_to_sk') {
                        finalDecisions['config'] = 'export';
                      }

                      const TAPE_COLORS_ORDERED = ['Blue', 'Green', 'Pink', 'Red', 'Turquoise', 'Yellow'] as const;
                      // Deep-clone state to mutate safely for imports
                      const newState = JSON.parse(JSON.stringify(state)) as typeof state;
                      for (const [id, fr] of Object.entries(state.files)) {
                        if (newState.files[id]) newState.files[id].versions = fr.versions;
                      }

                      // ─── PHASE A: IMPORT / POOL (Read from SD) ───
                      const importEntries = Object.entries(importDecisions);
                      if (importEntries.length > 0) {
                        setProgressMsg('Preserving & Importing SK files...');

                        // Verification check for import files
                        for (const [slotId, dec] of importEntries) {
                          if (!dec.file) continue;
                          try {
                            await dec.file.slice(0, 1).arrayBuffer();
                          } catch (e: any) {
                            throw new Error(`SD file unreadable: ${dec.file.name || slotId}. Hardware connection may have been interrupted.`);
                          }
                        }

                        const { v4: uuidv4 } = await import('uuid');

                        for (const [slotId, dec] of importEntries) {
                          if (!dec.file) continue;
                          const arrayBuffer = await dec.file.arrayBuffer();
                          const blob = new Blob([arrayBuffer], { type: dec.file.type || 'audio/wav' });
                          const fileName = dec.file.name || `${slotId}.wav`;

                          const versionId = uuidv4();
                          const fileId = uuidv4();
                          const version = {
                            id: versionId,
                            timestamp: Date.now(),
                            description: `Imported from SK (${slotId})`,
                            blob,
                            duration: 0,
                            processing: [] as ('normalized' | 'trimmed' | 'looped')[],
                          };
                          const fileRecord = {
                            id: fileId,
                            name: fileName,
                            originalName: fileName,
                            versions: [version],
                            currentVersionId: versionId,
                            isParked: true,
                            origin: 'SK Import',
                          };
                          newState.files[fileId] = fileRecord;

                          if (dec.pullToSlot) {
                            const color = dec.color as typeof TAPE_COLORS_ORDERED[number];
                            const slotIdx = dec.slotIndex - 1;
                            if (newState.tapes[color]?.slots[slotIdx] != null) {
                              newState.tapes[color].slots[slotIdx].fileId = fileId;
                              fileRecord.isParked = false;
                            }
                          }
                        }

                        // Apply config import if requested
                        const currentDiff = syncModalState?.diff;
                        if (options.includeConfig && options.configDecision === 'pull_to_slot' && currentDiff?.config?.remoteConfigText) {
                          try {
                            const { parseConfigText } = await import('./utils/exportUtils');
                            const parsedConfig = parseConfigText(currentDiff.config.remoteConfigText);
                            if (parsedConfig) newState.projectConfig = parsedConfig;
                          } catch (e) {
                            console.warn("Failed to parse remote config during import", e);
                          }
                        }

                        // Commit state change early so export reflects the new slots if needed
                        // Though exportSDStructure uses projectState (shallow clone of current state), 
                        // we'll update it here to be sure.
                        isSystemUpdate.current = true;
                        setState(newState);
                      }

                      // ─── PHASE B: EXPORT / BUILD (Write to SD) ───
                      const hasPushDecisions = Object.values(decisions).some(d => d !== 'skip');
                      if (hasPushDecisions || (options.includeConfig && options.configDecision === 'push_to_sk')) {
                        if (!backupHandle) throw new Error("Hardware folder access lost. Please re-select SD folder.");
                        
                        await exportSDStructure(newState, { // Use newState which includes pooled files
                          includeProject: true,
                          directWrite: true,
                          smartSync: options.skMode === 'overwrite',
                          skMode: options.skMode,
                          userLibrary: userLibrary,
                          backupSKToProject: options.backupSKToProject,
                          destinationHandle: backupHandle,
                          workHandle: workHandle,
                          projectName: projectName,
                          syncDecisions: finalDecisions,
                          includeConfig: options.includeConfig,
                          forceOverwrite: options.forceOverwrite,
                        }, (msg, _p) => setProgressMsg(msg || 'Pushing to SK...'));
                      }

                      showToast("Hardware Sync Complete", "success");
                      scanProjects(workHandle, backupHandle);
                      // ── Background SK Backup (non-blocking) ──
                      if (workHandle && backupHandle && projectName) {
                        createSKBackup(projectName, workHandle, backupHandle)
                          .then(() => {
                            if (currentProjectName === projectName) {
                              scanSKBackups(projectName, workHandle!);
                            }
                          })
                          .catch(e => console.warn('SK backup error (non-fatal):', e));
                      }
                    } catch (e: any) {
                      console.error(e);
                      showToast("Sync Failed: " + e.message, "error");
                    } finally {
                      setIsProcessing(false);
                      setProgressMsg('');
                    }
                  }}
              />
            )}

            {showSampleBrowser && (
              <Rnd
                position={{ x: sampleBrowserPos.x, y: sampleBrowserPos.y }}
                onDragStop={(_e, d) => setSampleBrowserPos({ x: d.x, y: d.y })}
                onResizeStop={(_e, _direction, ref, _delta, position) => {
                  setSampleBrowserSize({
                    width: parseInt(ref.style.width, 10),
                    height: parseInt(ref.style.height, 10)
                  });
                  setSampleBrowserPos(position);
                }}
                size={{ width: sampleBrowserSize.width, height: sampleBrowserSize.height }}
                minWidth={600}
                minHeight={400}
                bounds="window"
                dragHandleClassName="sample-browser-drag-handle"
                className="z-[70] !fixed"
                resizeHandleStyles={{
                  top: { top: '0', height: '10px' },
                  bottom: { bottom: '0', height: '10px' },
                  left: { left: '0', width: '10px' },
                  right: { right: '0', width: '10px' },
                  topRight: { top: '0', right: '0', width: '15px', height: '15px' },
                  bottomRight: { bottom: '0', right: '0', width: '15px', height: '15px' },
                  bottomLeft: { bottom: '0', left: '0', width: '15px', height: '15px' },
                  topLeft: { top: '0', left: '0', width: '15px', height: '15px' },
                }}
              >
                <SampleBrowser
                  isOpen={showSampleBrowser}
                  onClose={() => {
                    setShowSampleBrowser(false);
                    setTargetSlotForUpload(null);
                  }}
                  onImport={handleSampleImport}
                  userLibrary={userLibrary}
                  projects={foundProjects}
                  workHandle={workHandle}
                  mode={targetSlotForUpload !== null ? "slot-selection" : "global"}
                  onOpenLibraryManager={handleOpenLibraryManager}
                  currentProjectName={currentProjectName}
                  onImportToPool={handleImportToPool}
                  onImportToTape={handleImportToTape}
                  forceStop={showEditor}
                />
              </Rnd>
            )}

            <LibraryManager
              isOpen={showLibraryManager}
              onClose={() => {
                setShowLibraryManager(false);
                setLibraryManagerInitialTab('upload');
                setLibraryManagerHighlightFileId(null);
                setShowSampleBrowser(true);
              }}
              userLibrary={userLibrary}
              setUserLibrary={setUserLibrary}
              projectFiles={state.files}
              projectName={currentProjectName}
              workHandle={workHandle}
              missingLibraryFiles={missingLibraryFiles}
              onSmartScan={handleLibrarySmartScan}
              onRefreshLibrary={handleRefreshLibrary}
              onDeleteLibraryFile={handleRemoveLibraryFile}
              onOpenLibrarySync={() => setShowLibrarySyncModal(true)}
              onDownloadZip={handleDownloadLibraryZip}
              initialTab={libraryManagerInitialTab}
              initialHighlightFileId={libraryManagerHighlightFileId}
              onResetBrowserPreference={handleResetEmptySlotBrowserPreference}
            />





            {/* VIDEO TEXTURE OVERLAY */}
            {visualFilters.textureImage === 'wavbuilderfullscreen_1.mp4' && (
              <video
                autoPlay
                loop
                muted
                playsInline
                className="fixed inset-0 w-full h-full object-cover pointer-events-none z-[1]"
                style={{
                  opacity: visualFilters.textureOpacity,
                  mixBlendMode: 'overlay',
                }}
              >
                <source src="/vid/wavbuilderfullscreen_1.mp4" type="video/mp4" />
              </video>
            )}
          </div>
        </div>
      )}
      <ConfigModal
        isOpen={showConfigModal}
        onClose={() => setShowConfigModal(false)}
        config={state.projectConfig || { mid_ch_a: 1, mid_ch_b: 2, mid_ps_a: false, mid_ps_b: false }}
        onChange={(config) => {
          setState(prev => ({ ...prev, projectConfig: config }));
          setHasUnsavedChanges(true);
        }}
        projects={foundProjects}
        currentProjectName={currentProjectName}
        workHandle={workHandle}
        sdHandle={backupHandle}
      />

      {showProjectNotes && (
        <Rnd
          position={{ x: projectNotesPos.x, y: projectNotesPos.y }}
          onDragStop={(_e, d) => {
            setProjectNotesPos({ x: d.x, y: d.y });
            if (!isProjectNotesMinimized) {
              setProjectNotesPreMinPos({ x: d.x, y: d.y });
            }
          }}
          onResizeStop={(_e, _direction, ref, _delta, position) => {
            setProjectNotesSize({
              width: parseInt(ref.style.width, 10),
              height: parseInt(ref.style.height, 10)
            });
            setProjectNotesPos(position);
          }}
          size={{ width: isProjectNotesMinimized ? 300 : projectNotesSize.width, height: isProjectNotesMinimized ? 44 : projectNotesSize.height }}
          enableResizing={!isProjectNotesMinimized}
          minWidth={300}
          bounds="window"
          dragHandleClassName="notes-drag-handle"
          className="z-[75] !fixed" // Removed transition-all duration-300 here to fix drag lag
          resizeHandleStyles={{
            top: { top: '0', height: '10px' },
            bottom: { bottom: '0', height: '10px' },
            left: { left: '0', width: '10px' },
            right: { right: '0', width: '10px' },
            topRight: { top: '0', right: '0', width: '15px', height: '15px' },
            bottomRight: { bottom: '0', right: '0', width: '15px', height: '15px' },
            bottomLeft: { bottom: '0', left: '0', width: '15px', height: '15px' },
            topLeft: { top: '0', left: '0', width: '15px', height: '15px' },
          }}
          resizeHandleComponent={
            !isProjectNotesMinimized ? {
              bottom: (
                <div className="absolute bottom-0 left-0 right-0 h-4 flex items-center justify-center hover:bg-white/5 transition-colors rounded-b-xl z-10 w-full">
                  <div className="w-8 h-1 bg-gray-600 rounded-full opacity-50 block pointer-events-none" />
                </div>
              )
            } : undefined
          }
          resizeHandleClasses={{
            bottom: "cursor-ns-resize"
          }}
        >
          <div className="w-full flex flex-col border border-gray-700/80 rounded-xl bg-[#0f0f11] shadow-2xl overflow-hidden" style={{ height: isProjectNotesMinimized ? 44 : '100%' }}>
            <div className="flex-1 flex flex-col min-h-0">
              {/* FIXED HEADER / DRAG HANDLE */}
              <div className="notes-drag-handle flex items-center justify-between px-3 py-2 bg-black border-b border-gray-800 cursor-move shrink-0">
                <div className="flex items-center gap-2">
                  <StickyNote size={14} className="text-synthux-yellow" />
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-300 select-none">Project Notes</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isProjectNotesMinimized) {
                        setProjectNotesPreMinPos({ ...projectNotesPos });
                        setProjectNotesPos({ x: 20, y: window.innerHeight - 60 });
                      } else {
                        setProjectNotesPos({ ...projectNotesPreMinPos });
                      }
                      setIsProjectNotesMinimized(!isProjectNotesMinimized);
                    }}
                    className="p-1 text-gray-400 hover:text-white hover:bg-white/10 rounded transition-colors"
                    title={isProjectNotesMinimized ? "Expand" : "Minimize"}
                  >
                    <ChevronDown size={14} className={`transition-transform duration-300 ${isProjectNotesMinimized ? 'rotate-180' : ''}`} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowProjectNotes(false); setIsProjectNotesMinimized(false); }}
                    className="p-1 text-gray-400 hover:text-red-400 hover:bg-white/10 rounded transition-colors"
                    title="Close Notes"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              {/* SCROLLABLE CONTENT */}
              {!isProjectNotesMinimized && (
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-1 text-left">
                  <NotesEditor
                    value={state.projectNotes || ''}
                    onChange={(val) => {
                      setState((prev: AppState) => ({ ...prev, projectNotes: val }));
                      setHasUnsavedChanges(true);
                    }}
                    minHeight="200px"
                    placeholder="Add main project notes here..."
                  />

                  <div className="mt-4 border-t border-gray-800 pt-4 flex flex-col gap-2 pb-4">
                    {TAPE_COLORS.map(color => {
                      const isExpanded = expandedProjectTapeNotes[color];
                      const tape = state.tapes[color];
                      const hasNotes = !!tape.notes && tape.notes.trim() !== '';

                      return (
                        <div key={color} className="border border-gray-800/50 rounded-lg overflow-hidden bg-black/20 mx-1">
                          <button
                            onClick={() => setExpandedProjectTapeNotes(prev => ({ ...prev, [color]: !prev[color] }))}
                            className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 transition-colors group"
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0 justify-start">
                              <div className="w-28 shrink-0 flex items-center gap-2">
                                <div className="w-5 h-5 group-hover:scale-110 transition-transform shrink-0">
                                  <TapeIcon color={`var(--color-synthux-${color.toLowerCase()})`} className="w-full h-full" />
                                </div>
                                <span className="text-[10px] font-bold uppercase tracking-widest truncate text-left" style={{ color: `var(--color-synthux-${color.toLowerCase()})` }}>
                                  {color}
                                </span>
                              </div>
                              {!isExpanded && hasNotes && (
                                <span className="text-[10px] text-gray-500 font-medium truncate flex-1 opacity-60 group-hover:opacity-100 transition-opacity text-left">
                                  {getNotePreview(tape.notes)}
                                </span>
                              )}
                              {hasNotes && !isExpanded && (
                                <div className="w-1.5 h-1.5 rounded-full bg-synthux-yellow animate-pulse shrink-0" />
                              )}
                            </div>
                            <ChevronDown size={14} className={`text-gray-500 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                          </button>

                          {isExpanded && (
                            <div className="p-2 border-t border-gray-800/50">
                              <NotesEditor
                                value={tape.notes || ''}
                                onChange={(val) => {
                                  setState(prev => ({
                                    ...prev,
                                    tapes: {
                                      ...prev.tapes,
                                      [color]: { ...prev.tapes[color], notes: val }
                                    }
                                  }));
                                  setHasUnsavedChanges(true);
                                }}
                                minHeight="100px"
                                placeholder={`Add notes for ${color} tape...`}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Rnd>
      )}

      {/* GLOBAL MODALS */}
      {
        confirmAction && (
          <ConfirmModal
            isOpen={true}
            onClose={() => setConfirmAction(null)}
            onConfirm={confirmAction.onConfirm}
            title={confirmAction.title}
            message={confirmAction.message}
            isDestructive={confirmAction.isDestructive}
            confirmLabel={confirmAction.confirmLabel}
            showCancel={confirmAction.showCancel}
          />
        )
      }

      <CleanupModal
        isOpen={showCleanupModal}
        onClose={() => setShowCleanupModal(false)}
        files={state.files}
        tapes={state.tapes}
        currentProjectName={currentProjectName}
        onConfirm={executeProjectCleanup}
        skBackups={skBackups}
        onDeleteSKBackup={handleDeleteSKBackup}
        skBackupLimit={SK_BACKUP_LIMIT}
      />

      <Toast
        toasts={toasts}
        onRemove={removeToast}
      />



      {/* MISSING FILES RESOLVER */}
      <MissingFilesResolver
        isOpen={!!missingFilesWarning}
        missingAssets={missingFilesWarning || []}
        projectName={currentProjectName}
        onResolve={(action, ids) => {
          if (action === 'remove') {
            setState((prev: AppState) => {
              const next = { ...prev, files: { ...prev.files } };
              ids.forEach(id => delete next.files[id]);
              // Also clear from tapes
              const nextTapes = { ...prev.tapes };
              TAPE_COLORS.forEach(c => {
                nextTapes[c] = {
                  ...nextTapes[c],
                  slots: nextTapes[c].slots.map(s => (s.fileId && ids.includes(s.fileId)) ? { ...s, fileId: null } : s)
                };
              });
              return { ...prev, files: next.files, tapes: nextTapes };
            });
            setHasUnsavedChanges(true);
          }
          setMissingFilesWarning(null);
        }}
        onRelocate={async (asset) => {
          try {
            // @ts-ignore
            const [handle] = await window.showOpenFilePicker({
              multiple: false,
              types: [{
                description: 'Audio Files',
                accept: { 'audio/*': ['.wav', '.mp3', '.flac'] }
              }]
            });
            const file = await handle.getFile();
            isSystemUpdate.current = true;
            setState((prev: AppState) => {
              const next = { ...prev, files: { ...prev.files } };
              const fileRecord = next.files[asset.fileId];
              if (fileRecord) {
                const updatedVersions = fileRecord.versions.map(v =>
                  v.id === asset.versionId ? { ...v, blob: file } : v
                );
                next.files[asset.fileId] = { ...fileRecord, versions: updatedVersions };
              }
              return next;
            });
            setHasUnsavedChanges(true);

            setMissingFilesWarning(prev => {
              if (!prev) return null;
              const next = prev.filter(a => a.versionId !== asset.versionId);
              return next.length > 0 ? next : null;
            });
          } catch (e: any) {
            if (e.name !== 'AbortError') {
              console.error("Relocation failed", e);
              showToast('Failed to relocate file: ' + e.message, 'error');
            }
          }
        }}
        onRecover={handleRecoverProjectAssetFromCache}
        onRecoverAll={handleRecoverAllMissingAssetsFromCache}
        onSmartRelocate={handleSmartRelocate}
        onRecoverSD={handleRecoverProjectAssetFromSD}
        onRecoverAllSD={handleRecoverAllMissingAssetsFromSD}
      />

      {/* PROCESSING OVERLAY */}
      {
        isProcessing && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center animate-in fade-in duration-200">
            <div className="bg-[#1a1a1a] border border-white/10 p-8 rounded-2xl shadow-2xl flex flex-col items-center gap-4 min-w-[300px]">
              <Loader className="animate-spin text-indigo-500" size={32} />
              <div className="text-white font-medium text-lg">{progressMsg || "Processing..."}</div>
            </div>
          </div>
        )
      }


      <LogModal 
        isOpen={isLogModalOpen} 
        onClose={() => setIsLogModalOpen(false)} 
      />
      <Toast toasts={toasts} onRemove={removeToast} />
      <LibrarySyncModal
        isOpen={showLibrarySyncModal}
        onClose={() => setShowLibrarySyncModal(false)}
        userLibrary={userLibrary}
        backupHandle={backupHandle}
        onSetBackupFolder={handleSetBackupFolder}
        onOpenProjectManager={() => {
          setShowLibrarySyncModal(false);
          setShowLibraryManager(false);
          setShowProjectManager(true);
        }}
        onDownloadZip={handleDownloadLibraryZip}
        onSyncComplete={() => handleRefreshLibrary()}
      />
    </ErrorBoundary>
  );
}

export default App;


