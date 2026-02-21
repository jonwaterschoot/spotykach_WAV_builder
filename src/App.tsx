import { useState, useRef, useEffect } from 'react';
import { TapeSelector } from './components/TapeSelector';

import logoImg from './assets/img/Spotykach_Logo.webp?url';
import tapeIcon from './assets/img/spotykachtapeicon.svg?url';
import { SlotGrid } from './components/SlotGrid';
import { AllViewGrid } from './components/AllViewGrid';
import { WaveformEditor } from './components/WaveformEditor';
import { FileBrowser } from './components/FileBrowser';
import type { AppState, TapeColor, FileRecord, AudioVersion } from './types';
import { TAPE_COLORS } from './types';
import { getInitialState } from './utils/initialState';
import { audioEngine } from './lib/audio/audioEngine';
import { exportSaveState, exportSingleTape, exportSDStructure, exportFilesOnly, loadProjectFromDirectory, saveProjectToDirectory, duplicateProject } from './utils/exportUtils';
import { analyzeImport, type ImportAnalysis } from './utils/importUtils';
import { ImportModal } from './components/ImportModal';
import { InfoModal } from './components/InfoModal';
import { HelpModal } from './components/HelpModal';
import { ExportModal } from './components/ExportModal';
import { ExportProgressModal } from './components/ExportProgressModal';
import { SamplePackModal } from './components/SamplePackModal';
import { TapeIcon } from './components/TapeIcon';
import { DuplicateResolveModal } from './components/DuplicateResolveModal';
import { BulkConflictModal } from './components/BulkConflictModal';
import { ProjectManager } from './components/ProjectManager';
import { ProjectSyncModal } from './components/ProjectSyncModal';
import { DeviceImportModal } from './components/DeviceImportModal';
import { AlertTriangle, Folder, Save, Loader, Download, Info, HelpCircle, FilePlus, ArrowLeft, ArrowRight } from 'lucide-react';
import { RiSdCardMiniLine } from 'react-icons/ri';

import { ConfirmModal } from './components/ConfirmModal';
import { Toast, type ToastType } from './components/Toast';
import { SetupWizard } from './components/SetupWizard';
import { SettingsModal } from './components/SettingsModal';
import { ExportPreviewModal } from './components/ExportPreviewModal';
// import { TapeSettingsModal } from './components/TapeSettingsModal'; // Removed: not used

import { ErrorBoundary } from './components/ErrorBoundary';

// ... (Rest of component)

// Confirm Action Helper
import { loadStateFromDB, saveStateToDB, clearState } from './utils/persistence';
import { saveDirectoryHandle, getDirectoryHandle } from './utils/storageUtils';

const sanitizeFilename = (name: string) => {
  return name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
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

  // Modals & UI State
  const [showInfo, setShowInfo] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showExportProgress, setShowExportProgress] = useState(false);
  const [showSampleBrowser, setShowSampleBrowser] = useState(false);

  const [showDuplicateModal, setShowDuplicateModal] = useState(false);

  // Export Logic State
  const [exportLogs, setExportLogs] = useState<string[]>([]);
  const [isExportComplete, setIsExportComplete] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportProgress, setExportProgress] = useState<number | null>(null);

  // General UI
  const [toast, setToast] = useState<{ msg: string; type: ToastType } | null>(null);
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

  // Import State
  const [importAnalysis, setImportAnalysis] = useState<ImportAnalysis | null>(null);


  // Project Manager State
  const [showProjectManager, setShowProjectManager] = useState(false);
  const [syncProjectTarget, setSyncProjectTarget] = useState<string | null>(null);
  const [isWelcomeActive, setIsWelcomeActive] = useState(true); // NEW: Track welcome screen visibility
  const [foundProjects, setFoundProjects] = useState<import('./types').ProjectSummary[]>([]);
  const [currentProjectName, setCurrentProjectName] = useState<string | undefined>(undefined);

  // Workflow / Settings State
  const [workHandle, setWorkHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [backupHandle, setBackupHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [syncUserLibrary, setSyncUserLibrary] = useState(true); // Global Pref

  // Sync Logic State
  const [syncModalState, setSyncModalState] = useState<{
    isOpen: boolean;
    projectName: string;
    diff: import('./utils/importUtils').SyncDiff | null;
    defaultMode?: 'import' | 'push';
  } | null>(null);

  const [activeSKProject, setActiveSKProject] = useState<string | null>(null);
  const [deviceDiff, setDeviceDiff] = useState<import('./utils/importUtils').DeviceDiff | null>(null);
  const [showDeviceImport, setShowDeviceImport] = useState(false);

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

  // Advanced Selection
  const [selectedSlots, setSelectedSlots] = useState<Set<string>>(new Set());
  const [lastSelectedSlot, setLastSelectedSlot] = useState<string | null>(null);
  const [anchorSlot, setAnchorSlot] = useState<string | null>(null);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const singleFileInputRef = useRef<HTMLInputElement>(null);
  const [targetSlotForUpload, setTargetSlotForUpload] = useState<number | null>(null);

  // Handle Reset
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const isFirstRender = useRef(true);
  const isSystemUpdate = useRef(false);

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
          setToast({ msg: "Application Reset", type: "success" });
          window.location.reload();
        } catch (e) {
          console.error(e);
          setToast({ msg: "Reset Failed", type: "error" });
        }
      }
    });
  };

  const checkUnsavedChanges = (action: () => void) => {
    if (hasUnsavedChanges) {
      setConfirmAction({
        title: "Unsaved Changes",
        message: "You have unsaved changes. Discard them?",
        confirmLabel: "Discard Changes",
        isDestructive: true,
        showCancel: true,
        onConfirm: () => {
          setConfirmAction(null);
          action();
        }
      });
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

  const handleLoadProject = async (projectName: string) => {
    if (!workHandle) return;

    setIsProcessing(true);
    setProgressMsg(`Loading ${projectName}...`);

    try {
      const loadedState = await loadProjectFromDirectory(projectName, workHandle, (msg) => {
        setProgressMsg(msg || "Loading...");
      });

      // Update Ref to point to this new project folder
      const projectsDir = await workHandle.getDirectoryHandle('Projects');
      projectRootHandleRef.current = await projectsDir.getDirectoryHandle(projectName);

      // Merge with current running state specifics if needed? 
      // No, replace state.
      isSystemUpdate.current = true;
      setState(loadedState);
      setCurrentProjectName(projectName);
      setHasUnsavedChanges(false); // Clean state after load
      setShowProjectManager(false);
      setToast({ msg: `Project "${projectName}" Loaded`, type: 'success' });
    } catch (e) {
      console.error(e);
      setToast({ msg: "Failed to load project", type: 'error' });
    } finally {
      setIsProcessing(false);
      setProgressMsg('');
    }
  };

  const handleImportDeviceChanges = async (selectedFiles: import('./utils/importUtils').DeviceFileChange[]) => {
    console.log("[DeviceImport] Starting import for", selectedFiles.length, "files");

    const newFiles: Record<string, import('./types').FileRecord> = {};
    const newTapes = { ...state.tapes };
    let importedCount = 0;

    for (const change of selectedFiles) {
      try {
        const file = change.file;

        // FORCE SAFE COPY: Read into ArrayBuffer to detach from file system
        const arrayBuffer = await file.arrayBuffer();
        const safeBlob = new Blob([arrayBuffer], { type: "audio/wav" });

        // Validate size
        if (safeBlob.size === 0) {
          console.warn(`[DeviceImport] Warning: Read 0 bytes from ${change.slot}`);
        }

        const isMod = 'originalFileId' in change && change.originalFileId;

        if (isMod) {
          // MODIFIED FILE: Create new version
          const originalId = change.originalFileId!;
          const originalFile = state.files[originalId];

          if (originalFile) {
            console.log(`[DeviceImport] Updating version for ${originalFile.originalName} (${originalId})`);

            const newVersionId = crypto.randomUUID();
            const newVersion = {
              id: newVersionId,
              timestamp: Date.now(),
              description: `Device Import (${new Date().toLocaleTimeString()})`,
              blob: safeBlob,
              duration: 0
            };

            const updatedFile = {
              ...originalFile,
              versions: [...originalFile.versions, newVersion],
              currentVersionId: newVersionId
            };

            newFiles[originalId] = updatedFile;
            importedCount++;
          }
        } else {
          // NEW FILE: Create new asset
          console.log(`[DeviceImport] Importing new file for slot ${change.slot}`);

          const newId = crypto.randomUUID();
          const versionId = crypto.randomUUID();

          const newFile: import('./types').FileRecord = {
            id: newId,
            name: file.name,
            originalName: file.name,
            versions: [{
              id: versionId,
              timestamp: Date.now(),
              description: 'Device Import',
              blob: safeBlob,
              duration: 0
            }],
            currentVersionId: versionId,
            isParked: false
          };
          newFiles[newId] = newFile;

          // Assign to Slot if color/slotId available
          if (change.color && change.slotId) {
            const tapeColor = change.color as import('./types').TapeColor;
            const slotIndex = change.slotId - 1; // 0-based

            if (newTapes[tapeColor] && slotIndex >= 0 && slotIndex < 6) {
              // Clone the tape object to avoid mutation
              // @ts-ignore
              const updatedTape = { ...newTapes[tapeColor] };
              // Clone the slots array
              // @ts-ignore
              updatedTape.slots = [...newTapes[tapeColor].slots];

              // Update the specific slot
              // @ts-ignore
              updatedTape.slots[slotIndex] = { id: slotIndex + 1, fileId: newId };

              // Assign back to tapes object
              // @ts-ignore
              newTapes[tapeColor] = updatedTape;
            }
          }
          importedCount++;
        }

      } catch (e) {
        console.error(`[DeviceImport] Failed to import ${change.slot}`, e);
      }
    }

    // Apply changes
    if (importedCount > 0) {
      setState(prev => ({
        ...prev,
        files: { ...prev.files, ...newFiles },
        tapes: newTapes
      }));

      setToast({ msg: `Successfully imported ${importedCount} files from device.`, type: "success" });
      setDeviceDiff(null);
    }
    setShowDeviceImport(false);
  };


  const handleCreateEmptyProject = async (projectName: string) => {
    if (!workHandle) {
      setToast({ msg: "Please set a Work Folder first.", type: 'error' });
      return;
    }

    if (!projectName) return;

    setIsProcessing(true);
    setProgressMsg(`Creating Empty Project ${projectName}...`);

    try {
      // 1. Get/Create 'Projects' folder
      const projectsDir = await workHandle.getDirectoryHandle('Projects', { create: true });

      // 2. Create specific Project folder
      const projectDir = await projectsDir.getDirectoryHandle(projectName, { create: true });

      // 3. Update Ref to point to this new project folder
      projectRootHandleRef.current = projectDir;

      // 4. Save blank state
      const emptyState = getInitialState();
      // @ts-ignore
      await saveProjectToDirectory(emptyState, workHandle, (msg) => setProgressMsg(msg || ''), projectName);

      // 5. Load blank state into UI map
      setState(emptyState);
      setCurrentProjectName(projectName);
      setHasUnsavedChanges(false);
      setToast({ msg: "Empty Project Created", type: 'success' });

      handleSmartScan(workHandle);
    } catch (e: any) {
      console.error(e);
      setToast({ msg: "Failed to create project: " + e.message, type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveProjectAs = async (projectName: string) => {
    // If we are in Browser Mode (no workHandle), we can't "Save As" to disk directly without picking a folder.
    // The UI should handle this by asking to Set Work Folder first.
    if (!workHandle) {
      setToast({ msg: "Please set a Work Folder first.", type: 'error' });
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
      setToast({ msg: "Project Created & Saved", type: 'success' });

      // Refresh found projects list?
      // Maybe trigger a silent scan or just add to list?
      // For now, simple scan:
      handleSmartScan(workHandle);

    } catch (e: any) {
      console.error(e);
      setToast({ msg: "Failed to create project: " + e.message, type: 'error' });
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
          setToast({ msg: "Project Deleted", type: 'success' });

          // If current project was deleted, create new
          if (currentProjectName === projectName) {
            setCurrentProjectName(undefined);
            setState(getInitialState());
            setHasUnsavedChanges(false);
          }

          await scanProjects(workHandle, backupHandle);
        } catch (e: any) {
          console.error(e);
          setToast({ msg: "Delete Failed: " + e.message, type: 'error' });
        } finally {
          setIsProcessing(false);
          setProgressMsg('');
        }
      }
    });
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
          setToast({ msg: `Renamed Local & Backup to "${newName}"`, type: 'success' });
        } catch (e) {
          console.error("Backup rename failed", e);
          setToast({ msg: `Renamed Local, but Backup failed`, type: 'warning' });
        }
      } else {
        setToast({ msg: `Renamed to "${newName}"`, type: 'success' });
      }

      if (currentProjectName === oldName) {
        setCurrentProjectName(newName);
      }
      handleScanProjects();
    } catch (e) {
      console.error(e);
      setToast({ msg: "Failed to rename project", type: 'error' });
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
        const { loadProjectFromDirectory } = await import('./utils/exportUtils');
        projectState = await loadProjectFromDirectory(projectName, workHandle, (msg) => setProgressMsg(msg || 'Loading...'));
      }

      const structureMap = await scanSKStructure(backupHandle);
      const diff = await calculateSyncDiff(projectState, structureMap);

      setSyncModalState(prev => prev ? { ...prev, diff } : null);
      setToast({ msg: "SD Card rescanned", type: "success" });
    } catch (e: any) {
      console.error(e);
      setToast({ msg: "SK scan failed: " + e.message, type: 'error' });
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
      setHasUnsavedChanges(false);
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

    // Verify Work Handle
    let workPermission = await restorableHandles.work.queryPermission({ mode: 'readwrite' });
    if (workPermission !== 'granted') {
      workPermission = await restorableHandles.work.requestPermission({ mode: 'readwrite' });
    }

    if (workPermission !== 'granted') {
      setToast({ msg: "Permission denied for Work Folder", type: 'error' });
      return;
    }

    setWorkHandle(restorableHandles.work);

    // Verify Backup Handle (if exists)
    if (restorableHandles.backup) {
      let backupPermission = await restorableHandles.backup.queryPermission({ mode: 'readwrite' });
      if (backupPermission !== 'granted') {
        backupPermission = await restorableHandles.backup.requestPermission({ mode: 'readwrite' });
      }
      if (backupPermission === 'granted') {
        setBackupHandle(restorableHandles.backup);
      }
    }

    setIsWelcomeActive(false);
    setToast({ msg: "Session Restored", type: 'success' });

    // Scan
    await handleSmartScan(restorableHandles.work);

    // Open Project Manager
    setShowProjectManager(true);
  };

  // Autosave
  useEffect(() => {
    const handler = setTimeout(() => {
      saveStateToDB(state);
      localStorage.setItem('spotykach_state', JSON.stringify(state));
    }, 1000);
    return () => clearTimeout(handler);
  }, [state]);

  // ==========================================
  // HANDLERS
  // ==========================================





  // Duplicate Detection
  // Map<FileID, Array<{slotId, color}>>
  const duplicatesMap = new Map<string, { slotId: number, color: TapeColor }[]>();
  const duplicateFileIds = new Set<string>();

  // Helper to calculate duplicates
  // We scan all tapes and build the map
  Object.entries(state.tapes).forEach(([color, tape]) => {
    tape.slots.forEach(slot => {
      if (slot.fileId) {
        const currentList = duplicatesMap.get(slot.fileId) || [];
        currentList.push({ slotId: slot.id, color: color as TapeColor });
        duplicatesMap.set(slot.fileId, currentList);
      }
    });
  });

  // Filter out non-duplicates (count <= 1)
  for (const [id, locs] of duplicatesMap.entries()) {
    if (locs.length <= 1) {
      duplicatesMap.delete(id);
    } else {
      duplicateFileIds.add(id);
    }
  }

  const handleResolveKeep = (fileId: string, keepLocation: { slotId: number, color: TapeColor }) => {
    setState(prev => {
      const nextTapes = { ...prev.tapes };

      // Iterate all tapes to find occurrences of this fileId
      (Object.keys(nextTapes) as TapeColor[]).forEach(c => {
        nextTapes[c] = {
          ...nextTapes[c],
          slots: nextTapes[c].slots.map(s => {
            if (s.fileId === fileId) {
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
    // Check if this was the last duplicate to close modal? 
    // Effect will re-calc duplicatesMap, if empty modal can close or update.
  };

  const handleResolveUnique = (fileId: string) => {
    setState(prev => {
      const fileToClone = prev.files[fileId];
      if (!fileToClone) return prev; // Should not happen

      const nextFiles = { ...prev.files };
      const nextTapes = { ...prev.tapes };

      // Get all locations
      const locations = duplicatesMap.get(fileId);
      if (!locations) return prev;

      // Keep the first one as original (or just first in list), clone others
      // Actually, let's clone ALL except the very first one found in our map to keep ID stable for at least one.
      // locations[0] keeps `fileId`. locations[1..n] get new IDs.

      for (let i = 1; i < locations.length; i++) {
        const loc = locations[i];
        const newFileId = generateId();

        // Create deep copy of file record
        // We also need to clone versions if we want them truly independent? 
        // Yes, otherwise editing version in one affects other? 
        // Wait, versions are Inside the file record. So just cloning the file record is enough 
        // IF we don't share reference to version objects.

        const clonedVersions = fileToClone.versions.map(v => ({ ...v })); // Shallow copy version objects

        const newFile: FileRecord = {
          ...fileToClone,
          id: newFileId,
          name: `${fileToClone.name}_${i + 1}`, // Suffix to distinguish?
          originalName: fileToClone.originalName,
          versions: clonedVersions,
          currentVersionId: clonedVersions[0].id, // New file points to its own first version
          isParked: false, // It's assigned immediately
          origin: fileToClone.origin,
          license: fileToClone.license
        };

        nextFiles[newFileId] = newFile;

        // Update Slot
        nextTapes[loc.color] = {
          ...nextTapes[loc.color],
          slots: nextTapes[loc.color].slots.map(s =>
            s.id === loc.slotId ? { ...s, fileId: newFileId } : s
          )
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
        setToast({ msg: `Work Folder Set: ${handle.name}`, type: 'success' });

        // Save for persistence
        saveDirectoryHandle('work', handle).catch(console.error);

        // Auto-scan and open Project Manager
        await handleSmartScan(handle);
        setShowProjectManager(true);

      } catch (e: any) {
        if (e.name !== 'AbortError') {
          console.error("Setup failed", e);
          setToast({ msg: "Could not access folder.", type: 'error' });
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
      setToast({ msg: `Backup Folder Set: ${handle.name}`, type: 'success' });
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        setToast({ msg: "Could not access folder.", type: 'error' });
      }
    }
  };


  const scanProjects = async (localDir: FileSystemDirectoryHandle | null, backupDir: FileSystemDirectoryHandle | null) => {
    // Lazy load utils
    // Lazy load utils
    const { scanForProjects, getActiveSKProject, exportSaveState } = await import('./utils/exportUtils');
    const { scanDeviceChanges, applySyncDiff } = await import('./utils/importUtils');

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

    const merged = Array.from(projectMap.values()).map(p => {
      let status: 'synced' | 'local' | 'backup' | 'modified' = 'local';

      if (p.local && p.backup) {
        status = 'synced';
        // Check for modifications (Local newer than Backup by > 2 seconds)
        const localTime = p.local.lastModified || 0;
        const backupTime = p.backup.lastModified || 0;
        if (localTime > (backupTime + 2000)) {
          status = 'modified';
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


  const handleImportClick = () => {
    // Direct trigger for now, Import Modal coming in Phase 2
    fileInputRef.current?.click();
  };





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
        setToast({ msg: "Project Restored Successfully", type: 'success' });
      } else {
        setToast({ msg: "Failed to load project from backup.", type: 'error' });
      }
    } catch (e) {
      console.error(e);
      setToast({ msg: "Restore Failed", type: 'error' });
    } finally {
      setIsProcessing(false);
      setProgressMsg('');
    }
  };

  // Save Project Handler
  const handleSaveProject = async () => {
    // 1. If we have an active project handle (or Work Handle + Name), save
    if (workHandle && currentProjectName) {
      setIsProcessing(true);
      setProgressMsg("Saving Project...");
      try {
        const { saveProjectToDirectory } = await import('./utils/exportUtils');
        // Save using Root Handle + Project Name logic for robustness
        // @ts-ignore
        await saveProjectToDirectory(state, workHandle, (msg) => setProgressMsg(msg || ''), currentProjectName);

        setToast({ msg: "Project Saved Successfully", type: 'success' });
        setHasUnsavedChanges(false);
      } catch (e: any) {
        console.error(e);
        setToast({ msg: "Save Failed: " + e.message, type: 'error' });
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
      setToast({ msg: "Project Duplicated Successfully", type: 'success' });
      // Refresh list
      await handleSmartScan(workHandle);
    } catch (e: any) {
      console.error(e);
      setToast({ msg: "Duplicate Failed: " + e.message, type: 'error' });
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
        setToast({ msg: `Renamed "${file.name}" to "${safeName}"`, type: 'info' });
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
          setToast({ msg: "File unassigned from all slots", type: "success" });
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

          setToast({ msg: `Unassigned ${count} files`, type: "success" });
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
        setToast({ msg: "File permanently deleted", type: "success" });
      }
    });
  };

  const handleSlotClick = (id: number) => {
    const currentTape = state.tapes[currentTapeColor];
    const slot = currentTape.slots.find(s => s.id === id);

    if (slot && slot.fileId) {
      setActiveSlotId(id);
    } else {
      // Empty slot -> Trigger Upload
      setTargetSlotForUpload(id);
      singleFileInputRef.current?.click();
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
        setToast({ msg: `Assigned ${assignCount} files (${mode})`, type: "success" });
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
      setToast({ msg: `Assigned ${assignedCount} files to slots`, type: 'success' });
    }
  };




  const handleRemoveFromTape = (slotId: number, color?: TapeColor) => {
    setState(prev => {
      const nextTapes = { ...prev.tapes };

      // Determine Target Tape (Use arg if provided, otherwise default to current or search?)
      // It's safer to rely on argument now.
      // But for backward compat (if called elsewhere), we can fallback to search or current?
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
      setToast({ msg: "Failed to analyze import", type: "error" });
    } finally {
      setIsProcessing(false);
      setProgressMsg('');
    }

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSampleImport = async (url: string, name: string, origin?: string, license?: string) => {
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
        setToast({ msg: `Renamed "${name}" to "${safeName}"`, type: 'info' });
      }

      const newFile: FileRecord = {
        id: fileId,
        name: safeName.toUpperCase().replace(/\.[^/.]+$/, ""),
        originalName: name,
        versions: [version],
        currentVersionId: versionId,
        isParked: true, // Unassigned by default
        origin,
        license
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

  return (
    <ErrorBoundary>
      {isWelcomeActive && !workHandle && (
        <SetupWizard
          onComplete={async (work, backup) => {
            setWorkHandle(work);
            setBackupHandle(backup || null);
            setIsWelcomeActive(false);
            setToast({ msg: "Workspace Configured!", type: 'success' });

            // Save handles
            saveDirectoryHandle('work', work);
            if (backup) saveDirectoryHandle('backup', backup);

            // Auto-scan projects
            await handleSmartScan(work);

            // If backup is set, maybe do a quick sync check?
            // For now just open Project Manager
            setShowProjectManager(true);
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
            onReset={handleReset}
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
                  Spotykach
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
                          {hasUnsavedChanges && (
                            <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shadow-[0_0_5px_rgba(250,204,21,0.5)] shrink-0" title="Unsaved changes" />
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

                {/* Info + Help (icon-only, small) */}
                <button onClick={() => setShowInfo(true)} title="About"
                  className="p-1.5 text-gray-500 hover:text-white hover:bg-white/5 rounded-md transition-colors">
                  <Info size={16} />
                </button>
                <button onClick={() => setShowHelp(true)} title="Help"
                  className="p-1.5 text-gray-500 hover:text-white hover:bg-white/5 rounded-md transition-colors">
                  <HelpCircle size={16} />
                </button>

                <div className="h-5 w-px bg-gray-700 mx-1" />

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
                        setToast({ msg: 'SK scan failed: ' + e.message, type: 'error' });
                      } finally {
                        setIsProcessing(false);
                        setProgressMsg('');
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-orange-500/30 text-orange-400 hover:text-white hover:bg-orange-500/15 hover:border-orange-500/50 transition-all text-[11px] font-bold uppercase tracking-wider"
                    title="Import SK from SD card"
                  >
                    <RiSdCardMiniLine size={14} />
                    <ArrowLeft size={11} strokeWidth={2.5} />
                    <span className="hidden sm:inline">Import SD</span>
                  </button>
                )}

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
                        setToast({ msg: 'SK scan failed: ' + e.message, type: 'error' });
                      } finally {
                        setIsProcessing(false);
                        setProgressMsg('');
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-500/30 text-indigo-400 hover:text-white hover:bg-indigo-500/15 hover:border-indigo-500/50 transition-all text-[11px] font-bold uppercase tracking-wider"
                    title="Push SK to SD card"
                  >
                    <RiSdCardMiniLine size={14} />
                    <ArrowRight size={11} strokeWidth={2.5} />
                    <span className="hidden sm:inline">Build SD</span>
                  </button>
                )}

                <div className="h-5 w-px bg-gray-700 mx-1" />

                {/* Save */}
                <button
                  onClick={handleSaveProject}
                  title={hasUnsavedChanges ? `Save ${currentProjectName || 'Project'} (unsaved changes)` : `Save ${currentProjectName || 'Project'}`}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-bold uppercase tracking-wider transition-all ${hasUnsavedChanges
                    ? 'border-yellow-500/50 text-yellow-300 bg-yellow-500/10 hover:bg-yellow-500/20'
                    : 'border-white/10 text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                >
                  <Save size={13} strokeWidth={2.5} />
                  <span className="hidden sm:inline">Save</span>
                  {hasUnsavedChanges && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />}
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
                      />
                    </>
                  ) : (
                    <div className="bg-black/40 rounded-3xl p-4 border border-white/5 backdrop-blur-md">
                      <div className="flex items-center justify-between gap-3 mb-6 px-4">
                        <h2 className="text-4xl font-bold font-header tracking-tight uppercase text-white drop-shadow-md">
                          All Tapes
                        </h2>

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
                        onClose={() => setActiveSlotId(null)}
                        onSaveUnique={(newBlob, duration, processing, createdId) => {
                          if (!activeFileId || !activeSlotId) return;

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
                            // b. Update the Tape Slot to point to newFileId
                            const updatedTapes = { ...prev.tapes };
                            // const targetTape = updatedTapes[activeSlot!.color]; // Removed: inactive code causing error

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

                          // 5. Close Editor (Since we switched file, keeping editor open might be tricky without full re-mount)
                          // User likely wants to confirm it's done.
                          setActiveSlotId(null);
                        }}
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
                        onSaveAsCopy={(newBlob, duration, createdId) => {
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
                        onMoveVersionToPool={(versionId) => {
                          if (!activeFileId) return;
                          const file = state.files[activeFileId];
                          const versionToMove = file.versions.find(v => v.id === versionId);
                          if (!versionToMove) return;

                          // 1. Create New File from Version
                          const newFileId = generateId();
                          const newVersionId = generateId(); // New ID for independence? Or keep same? Let's give new ID.

                          const newVersion: AudioVersion = {
                            ...versionToMove,
                            id: newVersionId,
                            timestamp: Date.now(),
                            description: `Extracted from ${file.name}`
                          };

                          const newFile: FileRecord = {
                            id: newFileId,
                            name: `${file.name}_v${new Date(versionToMove.timestamp).getTime().toString().slice(-4)}`,
                            originalName: file.originalName,
                            versions: [newVersion],
                            currentVersionId: newVersionId,
                            isParked: true // Unassigned
                          };

                          // 2. Remove Version from Source (if not the only one/current?)
                          // User wants "Move", implying removal from source history.
                          // If it's the current version, we need to handle that (switch to another).
                          // If it's the ONLY version, we probably shouldn't fully remove it? Or maybe we can?
                          // If we remove the only version, the file is empty/invalid.

                          if (file.versions.length <= 1) {
                            setToast({ msg: "Cannot move the only version. Use 'Save Copy' instead.", type: "error" });
                            return;
                          }

                          setState(prev => {
                            const currentFile = prev.files[activeFileId];
                            const newVersions = currentFile.versions.filter(v => v.id !== versionId);
                            let newCurrentId = currentFile.currentVersionId;

                            if (currentFile.currentVersionId === versionId) {
                              newCurrentId = newVersions[0].id; // Fallback to first available
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
                          setToast({ msg: "Version moved to Unassigned Pool", type: "success" });
                        }}
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
              workFolderName={workHandle?.name || null}
              backupFolderName={backupHandle?.name || null}
              onSetWorkFolder={handleSetWorkFolder}
              onSetBackupFolder={handleSetBackupFolder}
              onResetApp={handleReset}
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
                    setToast({ msg: "Project Restored Successfully", type: "success" });
                  }}
                  onImportStructure={async (structureMap) => {
                    setToast({ msg: "Importing Structure...", type: "neutral" });

                    import('./utils/importUtils').then(({ processSDStructure }) => {
                      setState(prev => {
                        const result = processSDStructure(structureMap, prev.files, prev.tapes);
                        return { ...prev, files: result.files, tapes: result.tapes };
                      });
                      setImportAnalysis(null);
                      setToast({ msg: "SD Structure Imported", type: "success" });
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
                        setToast({ msg: `Imported ${count} files to Pool`, type: "success" });
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
                      setToast({ msg: `SD backup "${name}" deleted`, type: 'success' });
                      await scanProjects(workHandle, backupHandle);
                    } catch (e: any) {
                      setToast({ msg: 'Delete failed: ' + e.message, type: 'error' });
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

                  setToast({ msg: "Project scan complete", type: "success" });
                } catch (e) {
                  console.error("Scan failed", e);
                  setToast({ msg: "Scan failed", type: "error" });
                } finally {
                  setIsProcessing(false);
                }
              }}
              isScanning={isProcessing}
              deviceDiff={deviceDiff || undefined}
              onImportDeviceChanges={() => setShowDeviceImport(true)}
              workHandle={workHandle}
              backupHandle={backupHandle}
              onChangeWorkFolder={handleSetWorkFolder}
              onChangeBackupFolder={handleSetBackupFolder}
              onSyncProject={(projectName) => setSyncProjectTarget(projectName)}
              onBuildProject={async (projectName) => {
                if (!workHandle || !backupHandle) {
                  setToast({ msg: "Both Project Folder and SD Card must be connected.", type: 'error' });
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
                  setToast({ msg: "Failed to build diff: " + e.message, type: 'error' });
                } finally {
                  setIsProcessing(false);
                  setProgressMsg('');
                }
              }}
              onImportSK={async () => {
                if (!backupHandle) {
                  setToast({ msg: "SD card not connected.", type: 'error' });
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
                  setToast({ msg: "SK scan failed: " + e.message, type: 'error' });
                } finally {
                  setIsProcessing(false);
                  setProgressMsg('');
                }
              }}
              syncUserLibrary={syncUserLibrary}
              onToggleSyncUserLibrary={setSyncUserLibrary}
              activeSKProject={activeSKProject || undefined}
            />

            {syncProjectTarget && workHandle && backupHandle && (
              <ProjectSyncModal
                projectName={syncProjectTarget}
                localState={state}
                workHandle={workHandle}
                backupHandle={backupHandle}
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

                    setToast({ msg: `${syncProjectTarget} synced successfully`, type: 'success' });
                    setSyncProjectTarget(null);
                    await scanProjects(workHandle, backupHandle);
                  } catch (e: any) {
                    console.error(e);
                    setToast({ msg: 'Sync failed: ' + e.message, type: 'error' });
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
                onRefresh={handleSKRefresh}
                isRefreshing={isProcessing}
                onClose={() => setSyncModalState(null)}
                onConfirm={async (decisions, options, importDecisions) => {
                  const projectName = syncModalState?.projectName;
                  setSyncModalState(null); // Close modal

                  if (!workHandle || !projectName) return;

                  setIsProcessing(true);
                  setProgressMsg(`Syncing ${projectName}...`);

                  try {
                    const { loadProjectFromDirectory, exportSDStructure } = await import('./utils/exportUtils');

                    const projectState = await loadProjectFromDirectory(projectName, workHandle, (msg) => setProgressMsg(msg || 'Loading...'));

                    // 2. Export push decisions (push_to_sk, delete_sk)
                    const hasPushDecisions = Object.values(decisions).some(d => d !== 'skip');
                    if (hasPushDecisions) {
                      await exportSDStructure(projectState, {
                        includeProject: true,
                        directWrite: true,
                        smartSync: options.skMode === 'overwrite',
                        skMode: options.skMode,
                        syncUserLibrary: syncUserLibrary,
                        backupSKToProject: options.backupSKToProject,
                        destinationHandle: backupHandle!,
                        workHandle: workHandle,
                        projectName: projectName,
                        syncDecisions: decisions,
                      }, (msg, _p) => setProgressMsg(msg || 'Pushing to SK...'));
                    }

                    // 3. Apply import decisions (pull_to_slot, toPool)
                    const importEntries = Object.entries(importDecisions);
                    if (importEntries.length > 0) {
                      setProgressMsg('Importing SK files into project...');
                      const { v4: uuidv4 } = await import('uuid');
                      const TAPE_COLORS_ORDERED = ['Blue', 'Green', 'Pink', 'Red', 'Turquoise', 'Yellow'] as const;

                      // Deep-clone state to mutate safely
                      const newState = JSON.parse(JSON.stringify(state)) as typeof state;
                      // Blobs can't survive JSON round-trip — restore them in newState.files
                      for (const [id, fr] of Object.entries(state.files)) {
                        if (newState.files[id]) {
                          newState.files[id].versions = fr.versions;
                        }
                      }

                      for (const [slotId, dec] of importEntries) {
                        if (!dec.file) continue;

                        // SAFE COPY: Read into ArrayBuffer to detach from hardware handle
                        // This prevents NotReadableError when saving later if permissions change
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
                          // Assign to the tape slot matching current row's color+index
                          const color = dec.color as typeof TAPE_COLORS_ORDERED[number];
                          const slotIdx = dec.slotIndex - 1; // convert 1-based to 0-based
                          if (newState.tapes[color]?.slots[slotIdx] != null) {
                            newState.tapes[color].slots[slotIdx].fileId = fileId;
                            fileRecord.isParked = false;
                          }
                        }
                        // toPool: isParked stays true — file sits in the pool
                      }

                      isSystemUpdate.current = true;
                      setState(newState);
                    }

                    setToast({ msg: "Hardware Build Complete", type: "success" });
                    scanProjects(workHandle, backupHandle);
                  } catch (e: any) {
                    console.error(e);
                    setToast({ msg: "Build Failed: " + e.message, type: "error" });
                  } finally {
                    setIsProcessing(false);
                    setProgressMsg('');
                  }
                }}
              />
            )}

            <SamplePackModal
              isOpen={showSampleBrowser}
              onClose={() => setShowSampleBrowser(false)}
              onImport={handleSampleImport}
            />




          </div>
        </div >
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

      {
        toast && (
          <Toast
            message={toast.msg}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )
      }

      {showDeviceImport && (
        <DeviceImportModal
          isOpen={showDeviceImport}
          onClose={() => setShowDeviceImport(false)}
          diff={deviceDiff}
          projectState={state}
          onImport={handleImportDeviceChanges}
        />
      )}

      {/* PROCESSING OVERLAY */}
      {isProcessing && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center animate-in fade-in duration-200">
          <div className="bg-[#1a1a1a] border border-white/10 p-8 rounded-2xl shadow-2xl flex flex-col items-center gap-4 min-w-[300px]">
            <Loader className="animate-spin text-indigo-500" size={32} />
            <div className="text-white font-medium text-lg">{progressMsg || "Processing..."}</div>
          </div>
        </div>
      )}

    </ErrorBoundary >
  );
}

export default App;
