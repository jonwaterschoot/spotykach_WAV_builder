import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import type { SyncDiff, SyncSlotDiff, DuplicateGroup, DuplicateEntry } from '../utils/importUtils';
import {
    Check, X, Play, AlertTriangle,
    ArrowRight, ArrowLeft, Trash2, Archive, Loader,
    RefreshCw, Settings2, Copy,
    Save, Shield, Layers, ArrowDown, HardDrive, ChevronsUp, ChevronsDown
} from 'lucide-react';
import { RiSdCardMiniLine } from 'react-icons/ri';
import { SlotGrid6x6, type SlotEntry, type SlotActionBadge, TAPE_LETTER } from './SlotGrid6x6';
import type { SKPrimaryDecision, ExportOptions } from '../types';
import { getDurabilityPrefs } from '../utils/durabilityPrefs';
import { USB_FIRMWARE } from '../lib/usb/flag';

// ─── Types ────────────────────────────────────────────────────────────────────

export type QuickPreset = 'import_pool_only' | 'import_merge_project' | 'import_sync_merge' | 'push_sync' | 'push_clean' | 'custom';

// Keep old shape for backward compat with exportSDStructure
export type LegacyDecision = 'export' | 'skip' | 'delete';

interface SlotRow {
    id: string;
    slot: string;
    tapeColor: string;
    slotNum: number;
    status: 'LOCAL_ONLY' | 'REMOTE_ONLY' | 'CONFLICT' | 'MATCH' | 'EMPTY';
    localName?: string;
    localBlob?: Blob | null;
    hardwareName?: string;
    /** The card file, when the route has it without a download. Null over USB. */
    hardwareBlob?: Blob | null;
    /** The card holds a file in this slot, whether or not its bytes are at hand. */
    onCard: boolean;
    /** Only the card file's name and length tie it to the project file (`match: 'name'`). */
    probableMatch?: boolean;
    /** Same audio, but the card file's header is out of date (see `SyncSlotDiff.staleHeader`). */
    staleHeader?: boolean;
    /** A conflict where the card file is an older version this project wrote (`SyncSlotDiff.ownOlderVersion`). */
    ownOlderVersion?: boolean;
    size: number;
    /** The card file's size, from the listing. */
    remoteSize: number;
    primary: SKPrimaryDecision;
    toPool: boolean;
}

export interface ImportDecision {
    pullToSlot: boolean;
    toPool: boolean;
    /** The card file. Null over USB: the caller downloads it. */
    file: File | null;
    color: string;
    slotIndex: number;
}

interface ExportPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (
        decisions: Record<string, LegacyDecision>,
        options: ExportOptions,
        importDecisions: Record<string, ImportDecision>
    ) => void;
    diff: SyncDiff;
    projectName?: string;
    defaultMode?: 'import' | 'push';
    /** The preset to start on, instead of the mode's first one. */
    defaultPreset?: QuickPreset;
    onRefresh?: () => void;
    isRefreshing?: boolean;
    onChangeSDCard?: () => void;
    /** The card can't be read any more (ejected): nothing may be written or imported. */
    cardMissing?: boolean;
    /** Card reader / USB switch and connection, under the header. */
    sourceBar?: React.ReactNode;
    /**
     * Over USB: every slot costs an upload or a download, so the confirmation gives
     * a time, and the SK backup needs the card reader.
     */
    usbMode?: boolean;
    /**
     * Over USB, what the connected firmware reaches besides the slots: `config.txt`
     * (protocol 1.1) and README plus `SK/project.json` (protocol 1.2).
     */
    usbReach?: { config: boolean; files: boolean };
    /** Why nothing can be applied right now (USB not connected). */
    blockedReason?: string;
    /**
     * Import tab: the card into a clean project instead, every slot in its place
     * (`whole`, no review) or reviewed slot by slot.
     */
    onImportIntoNewProject?: (whole: boolean) => void;
}

/** Measured on Windows, uploader firmware: 460–481 KB/s up, 470 KB/s down. */
const USB_BYTES_PER_SECOND = 450 * 1024;

const formatDuration = (seconds: number) => seconds < 90
    ? `${Math.max(1, Math.round(seconds))} s`
    : `${Math.round(seconds / 60)} min`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TAPE_DOT_COLORS: Record<string, string> = {
    Blue: '#3b82f6', Green: '#22c55e', Pink: '#ec4899',
    Red: '#ef4444', Turquoise: '#06b6d4', Yellow: '#eab308',
};

function parseTapeColor(slotId: string) {
    const m = slotId.match(/^([A-Za-z]+)(\d+)$/);
    return m ? { color: m[1], num: parseInt(m[2]) } : { color: 'Gray', num: 0 };
}

function defaultPrimary(status: SlotRow['status'], preset: QuickPreset, _mode: 'import' | 'push' = 'push', staleHeader = false): SKPrimaryDecision {
    switch (preset) {
        case 'import_pool_only':
            return 'skip';
        case 'import_merge_project':
            // Merge SD into project: Pull SD to slots. Displaced project files will be pooled by defaultToPool.
            if (status === 'REMOTE_ONLY' || status === 'CONFLICT') return 'pull_to_slot';
            return 'skip';
        case 'import_sync_merge':
            if (status === 'REMOTE_ONLY' || status === 'CONFLICT') return 'pull_to_slot';
            if (status === 'LOCAL_ONLY') return 'push_to_sk';
            if (status === 'MATCH' && staleHeader) return 'push_to_sk';
            return 'skip';
        case 'push_clean':
            // A mirror rewrites every project slot, in-sync ones included: it is the
            // "force it" build, and the clean wipes the card's SK folder first, so a
            // skipped MATCH would be deleted from the card rather than kept.
            if (status === 'LOCAL_ONLY' || status === 'CONFLICT' || status === 'MATCH') return 'push_to_sk';
            if (status === 'REMOTE_ONLY') return 'delete_sk';
            return 'skip';
        case 'push_sync':
            if (status === 'LOCAL_ONLY' || status === 'CONFLICT') return 'push_to_sk';
            if (status === 'REMOTE_ONLY') return 'pull_to_slot';
            // Same audio, outdated header: rewrite it once in the current layout.
            if (status === 'MATCH' && staleHeader) return 'push_to_sk';
            return 'skip';
        default: return 'skip';
    }
}

function defaultToPool(
    status: SlotRow['status'],
    preset: QuickPreset,
    _mode: 'import' | 'push' = 'push',
    /** Clean Mirror only: the user took the offer to keep the doomed files. */
    rescueBeforeClean = false,
    /** The card file is an older version this project wrote: the project has it, no copy needed. */
    ownOlderVersion = false,
): boolean {
    if (preset === 'import_pool_only') {
        // "Standard Import" = Pool incoming SD files only (no slot changes)
        return status === 'REMOTE_ONLY' || status === 'CONFLICT';
    }
    if (preset === 'import_merge_project' || preset === 'import_sync_merge') {
        // "Merge Import" & "Merge + Mirror" = Sync SD to Slots + Pool displaced PROJECT files
        return status === 'CONFLICT';
    }
    if (preset === 'push_clean') {
        // Clean Mirror makes the card match the project, so it pools nothing by
        // default — that is the whole point of it. The offer in the preview turns
        // this on for exactly the slots the card is about to lose, so "clean" is
        // not the only way out of it.
        return rescueBeforeClean && (status === 'CONFLICT' || status === 'REMOTE_ONLY');
    }
    // Preservation by default: if we are overwriting a slot in Push Sync, pool the old
    // file, unless it is just an older version of the project's own.
    return preset === 'push_sync' && status === 'CONFLICT' && !ownOlderVersion;
}

/**
 * Slots the card loses a file from. `delete_sk` is the obvious one. The other is
 * a push over a conflicting slot: the write lands on top of the card's copy, so it
 * leaves the card just as surely as a delete does.
 *
 * **It is no longer gated to `push_clean`.** It was, and `currentPreset` falls to
 * `'custom'` the moment one row is hand-edited — so touching a single row in
 * Advanced took the red wash off every *other* row while their actions stayed
 * exactly as they were. A conflicting push is the same loss whichever button is lit.
 *
 * This says only that the file leaves that slot. Whether it survives — pooled, or
 * written back to another slot — is `cardFate`, and every surface reads that one.
 */
function isCardRemoval(r: SlotRow): boolean {
    if (!r.onCard) return false;
    if (r.primary === 'delete_sk') return true;
    return r.primary === 'push_to_sk' && r.status === 'CONFLICT';
}

/** `Blue2` → `B2`, the short form the grids label cells with. */
function shortSlot(slotId: string): string {
    const { color, num } = parseTapeColor(slotId);
    return `${TAPE_LETTER[color] ?? color}${num}`;
}

/**
 * Where a removed card file's audio still is once the write finishes, by slot id.
 * Clean Mirror often *shifts* a file rather than destroying it — what the card
 * holds in B1 is what the project holds in C3 — and that is a move, not a loss.
 *
 * Content identity comes from `diff.duplicates`, already hashed for the duplicates
 * banner, so this costs nothing extra. A slot holds the audio after the write if
 * the project pushes it there, or if the card's own copy is left alone.
 */
function buildCardMoves(rows: SlotRow[], duplicates: DuplicateGroup[]): Record<string, string[]> {
    const moves: Record<string, string[]> = {};
    const removals = rows.filter(isCardRemoval);
    if (removals.length === 0 || duplicates.length === 0) return moves;

    const byId = new Map(rows.map(r => [r.id, r]));
    const survivesOnCard = (e: DuplicateEntry) => {
        const row = byId.get(e.slotId);
        if (!row) return false;
        return e.side === 'project' ? row.primary === 'push_to_sk' : !isCardRemoval(row);
    };

    removals.forEach(r => {
        const group = duplicates.find(g => g.entries.some(e => e.slotId === r.id && e.side === 'sd'));
        if (!group) return;
        const dest = [...new Set(
            group.entries.filter(e => e.slotId !== r.id && survivesOnCard(e)).map(e => e.slotId)
        )];
        if (dest.length) moves[r.id] = dest;
    });
    return moves;
}

/** What becomes of the card's copy. `null` when the card keeps it where it is. */
type CardFate = 'destroyed' | 'moved' | 'pooled';
function cardFate(r: SlotRow, moves: Record<string, string[]>): CardFate | null {
    if (!isCardRemoval(r)) return null;
    if (moves[r.id]) return 'moved';
    return r.toPool ? 'pooled' : 'destroyed';
}

/**
 * README.md and SK/project.json only go to the card: where a slot would be pulled
 * or deleted, the notes are left alone.
 */
function notesDefault(status: SlotRow['status'] | undefined, preset: QuickPreset): SKPrimaryDecision {
    if (!status) return 'skip';
    return defaultPrimary(status, preset) === 'push_to_sk' ? 'push_to_sk' : 'skip';
}

function syncMatchPreset(rows: SlotRow[], configStatus: SlotRow['status'] | undefined, configDecision: SKPrimaryDecision, preset: QuickPreset, rescueBeforeClean = false, notesStatus?: SlotRow['status'], notesDecision: SKPrimaryDecision = 'skip'): boolean {
    const slotsMatch = rows.every(r =>
        r.primary === defaultPrimary(r.status, preset, 'push', r.staleHeader) &&
        r.toPool === defaultToPool(r.status, preset, 'push', rescueBeforeClean, r.ownOlderVersion));
    const notesMatch = notesDecision === notesDefault(notesStatus, preset);
    if (!configStatus) return slotsMatch && notesMatch;
    const configMatch = configDecision === defaultPrimary(configStatus, preset);
    return slotsMatch && configMatch && notesMatch;
}

interface PresetMeta {
    label: string;
    /** One line under the name saying where the files end up. */
    line: string;
    /** True when applying the preset writes to the SD card. */
    writesToCard: boolean;
}

const PRESET_META: Record<QuickPreset, PresetMeta> = {
    import_pool_only: {
        label: 'Import to pool',
        line: 'SD files land in the pool. Slots and card unchanged.',
        writesToCard: false,
    },
    import_merge_project: {
        label: 'Merge into project',
        line: 'SD files fill the slots; anything they displace goes to the pool. Card unchanged.',
        writesToCard: false,
    },
    import_sync_merge: {
        label: 'Merge into project + mirror',
        line: 'Same, then writes your slot-only files back to the card.',
        writesToCard: true,
    },
    push_sync: {
        label: 'Standard Build',
        line: 'Project files go to the card; card-only files come into your slots.',
        writesToCard: true,
    },
    push_clean: {
        label: 'Clean Mirror',
        line: 'Makes the card match the project exactly — card-only files are deleted.',
        writesToCard: true,
    },
    custom: {
        label: 'Custom',
        line: 'Pick every slot yourself in Advanced view.',
        writesToCard: false,
    },
};

const COMPACT_KEY = 'exportPreview.compact';

const ACTIVE_ACCENT: Record<'indigo' | 'orange' | 'gray', string> = {
    indigo: 'bg-indigo-600 text-white border-transparent shadow-lg',
    orange: 'bg-orange-600 text-white border-transparent shadow-lg',
    gray: 'bg-gray-700 text-white border-transparent',
};

const PresetButton: React.FC<{
    preset: QuickPreset;
    active: boolean;
    accent: 'indigo' | 'orange' | 'gray';
    /** Only set in import mode, where writing to the card is the surprise. */
    warnCardWrite?: boolean;
    /** Label only; the description moves to the tooltip. */
    compact?: boolean;
    onClick: () => void;
}> = ({ preset, active, accent, warnCardWrite, compact, onClick }) => {
    const meta = PRESET_META[preset];
    return (
        <button
            onClick={onClick}
            title={compact ? meta.line : undefined}
            className={[
                'group flex flex-col gap-1 border text-left transition-all',
                compact ? 'px-3 py-1.5 rounded-lg' : 'w-[210px] px-4 py-2.5 rounded-xl',
                active ? ACTIVE_ACCENT[accent] : 'border-white/5 text-gray-500 hover:border-white/20',
            ].join(' ')}
        >
            <span className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-black uppercase tracking-widest">{meta.label}</span>
                {warnCardWrite && meta.writesToCard && (
                    <span className={[
                        'flex items-center gap-1 px-1.5 py-0.5 rounded border text-[8px] font-black uppercase tracking-wider whitespace-nowrap',
                        active
                            ? 'bg-black/30 border-white/20 text-orange-200'
                            : 'bg-orange-500/10 border-orange-500/30 text-orange-400',
                    ].join(' ')}>
                        <RiSdCardMiniLine size={9} /> Writes to card
                    </span>
                )}
            </span>
            {!compact && (
                <span className={`text-[10px] leading-snug font-medium ${active ? 'text-white/70' : 'text-gray-600 group-hover:text-gray-400'}`}>
                    {meta.line}
                </span>
            )}
        </button>
    );
};

const PRIMARY_LABEL: Record<SKPrimaryDecision, string> = {
    delete_local: 'Delete local',
    push_to_sk: 'Push to SK →',
    pull_to_slot: '← Into slot',
    delete_sk: 'Delete SK',
    skip: 'Skip',
};


// ─── DuplicatesBanner ─────────────────────────────────────────────────────────

const SIDE_COLOR: Record<DuplicateGroup['entries'][0]['side'], string> = {
    project: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    sd: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
};

const DuplicatesBanner: React.FC<{
    duplicates: DuplicateGroup[];
    hoveredSlotKey: string | null;
    onHoverSlot: (key: string | null) => void;
    onTrashSlot: (slotId: string, side: 'project' | 'sd') => void;
    isSlotTrashed: (slotId: string, side: 'project' | 'sd') => boolean;
}> = ({ duplicates, hoveredSlotKey, onHoverSlot, onTrashSlot, isSlotTrashed }) => {
    const [open, setOpen] = useState(false);
    if (!duplicates || duplicates.length === 0) return null;

    const totalFiles = duplicates.reduce((sum, g) => sum + g.entries.length, 0);

    return (
        <div className="mx-6 mt-4 rounded-xl border border-yellow-500/30 bg-yellow-500/5 overflow-hidden animate-in slide-in-from-top-2 duration-300 shrink-0">
            <button
                onClick={() => setOpen(v => !v)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-yellow-500/10 transition-colors"
            >
                <div className="p-1.5 bg-yellow-500/20 rounded-lg shrink-0">
                    <Copy size={13} className="text-yellow-400" />
                </div>
                <div className="flex-1 min-w-0">
                    <span className="text-[11px] font-black text-yellow-300 uppercase tracking-widest">
                        {duplicates.length} duplicate group{duplicates.length !== 1 ? 's' : ''} detected
                    </span>
                    <span className="text-[10px] text-yellow-500/70 ml-2 font-medium">
                        {totalFiles} slots share identical audio content
                    </span>
                </div>
                <span className="text-[10px] text-yellow-500/50 font-bold uppercase tracking-wider shrink-0">
                    {open ? 'Hide ▲' : 'Show ▼'}
                </span>
            </button>

            {open && (
                <div className="px-4 pb-4 flex flex-col gap-2 border-t border-yellow-500/10">
                    {duplicates.map((group, i) => (
                        <div key={group.hash} className="flex items-start gap-3 pt-2">
                            <span className="text-[9px] text-yellow-600 font-mono font-bold mt-1 shrink-0 w-4 text-right">
                                {i + 1}.
                            </span>
                            <div className="flex flex-wrap gap-1.5 flex-1">
                                {group.entries.map((entry, j) => {
                                    const isHovered = hoveredSlotKey === entry.slotId;
                                    const trashed = isSlotTrashed(entry.slotId, entry.side);
                                    return (
                                        <div key={`${entry.slotId}-${entry.side}-${j}`} className="relative group/tag">
                                            <span
                                                onMouseEnter={() => onHoverSlot(entry.slotId)}
                                                onMouseLeave={() => onHoverSlot(null)}
                                                className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-mono font-black cursor-pointer transition-all ${
                                                    isHovered
                                                        ? SIDE_COLOR[entry.side] + ' ring-2 ring-yellow-400/60 scale-110 brightness-125'
                                                        : SIDE_COLOR[entry.side]
                                                } ${trashed ? 'opacity-40 grayscale line-through' : ''}`}
                                            >
                                                <span className="opacity-50">{entry.side === 'project' ? 'PR' : 'SD'}</span>
                                                {' '}{entry.slotId}
                                                <span className="opacity-40 font-normal ml-1 truncate max-w-[80px]" title={entry.name}>
                                                    {entry.name}
                                                </span>
                                            </span>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onTrashSlot(entry.slotId, entry.side); }}
                                                className={`absolute -top-1 -right-1 p-0.5 rounded-full shadow-lg transition-all border ${
                                                    trashed 
                                                        ? 'bg-red-600 border-red-400 text-white opacity-100' 
                                                        : 'bg-white/10 border-white/20 text-white opacity-0 group-hover/tag:opacity-100 hover:bg-red-500'
                                                }`}
                                                title={trashed ? "Restore from trash" : "Mark this duplicate for removal"}
                                            >
                                                <Trash2 size={8} />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                            <span className="text-[8px] text-yellow-700 font-mono mt-1 shrink-0 hidden sm:block" title={`SHA-256: ${group.hash}`}>
                                #{group.hash.slice(0, 8)}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};


// ─── CardLossPanel ────────────────────────────────────────────────────────────

const LossList: React.FC<{
    rows: SlotRow[];
    tone: string;
    suffix?: (r: SlotRow) => React.ReactNode;
}> = ({ rows, tone, suffix }) => (
    <ul className="flex flex-col gap-1 pl-6">
        {rows.map(r => (
            <li key={r.id} className={`text-[11px] font-medium flex items-center gap-2 min-w-0 ${tone}`}>
                <span className="font-black opacity-60 shrink-0 min-w-[4.5rem]">{r.slot}</span>
                <span className="truncate">{r.hardwareName || 'Unnamed file'}</span>
                {suffix?.(r)}
            </li>
        ))}
    </ul>
);

/**
 * What the write takes off the card, named, for the simple view — which said it
 * only with a red trash badge on a 6×6 grid cell, and said nothing at all about
 * the files that merely change slot (S1-8).
 */
const CardLossPanel: React.FC<{
    destroyed: SlotRow[];
    moved: SlotRow[];
    pooled: SlotRow[];
    moves: Record<string, string[]>;
    rescued: boolean;
    onRescue: () => void;
    onUndoRescue: () => void;
}> = ({ destroyed, moved, pooled, moves, rescued, onRescue, onUndoRescue }) => {
    const total = destroyed.length + moved.length + pooled.length;
    if (total === 0) return null;

    return (
        <div className={[
            'rounded-2xl border overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300',
            destroyed.length ? 'border-red-500/30 bg-red-500/[0.04]' : 'border-white/10 bg-white/[0.02]',
        ].join(' ')}>
            <div className="px-5 py-3 flex items-center gap-3 border-b border-white/5">
                <div className={`p-2 rounded-xl shrink-0 ${destroyed.length ? 'bg-red-500/20 text-red-400' : 'bg-white/5 text-gray-400'}`}>
                    {destroyed.length ? <Trash2 size={16} /> : <ArrowRight size={16} />}
                </div>
                <div className="min-w-0">
                    <p className="text-[12px] font-black text-white tracking-tight">
                        {total} card file{total !== 1 ? 's' : ''} leave{total === 1 ? 's' : ''} {total === 1 ? 'its slot' : 'their slots'}
                    </p>
                    <p className="text-[10px] text-gray-500 font-medium mt-0.5">
                        {destroyed.length > 0
                            ? `${destroyed.length} of them ${destroyed.length === 1 ? 'is' : 'are'} kept nowhere — read this before you build`
                            : 'All of them are kept — in the pool, or elsewhere on the card'}
                    </p>
                </div>
            </div>

            <div className="px-5 py-4 flex flex-col gap-4">
                {destroyed.length > 0 && (
                    <div className="flex flex-col gap-2">
                        <p className="text-[10px] font-black uppercase tracking-widest text-red-400 flex items-center gap-1.5">
                            <Trash2 size={11} /> Gone for good — not kept anywhere
                        </p>
                        <LossList rows={destroyed} tone="text-red-200/80" />
                        <button
                            onClick={onRescue}
                            className="ml-6 mt-1 w-fit flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-[10px] font-black uppercase tracking-widest transition-all shadow-lg hover:-translate-y-0.5"
                        >
                            <Archive size={12} /> Import them to the pool first
                        </button>
                    </div>
                )}

                {moved.length > 0 && (
                    <div className="flex flex-col gap-2">
                        <p className="text-[10px] font-black uppercase tracking-widest text-amber-400 flex items-center gap-1.5">
                            <ArrowRight size={11} /> Moved — the same audio lands in another slot
                        </p>
                        <LossList
                            rows={moved}
                            tone="text-amber-200/80"
                            suffix={r => (
                                <span className="ml-auto pl-2 shrink-0 font-black text-amber-400/80">
                                    → {(moves[r.id] ?? []).join(', ')}
                                </span>
                            )}
                        />
                    </div>
                )}

                {pooled.length > 0 && (
                    <div className="flex flex-col gap-2">
                        <p className="text-[10px] font-black uppercase tracking-widest text-orange-400 flex items-center gap-1.5">
                            <Archive size={11} /> Kept in the pool before the card is written
                        </p>
                        <LossList rows={pooled} tone="text-orange-200/80" />
                        {rescued && (
                            <button
                                onClick={onUndoRescue}
                                className="ml-6 w-fit text-[9px] font-black uppercase tracking-widest text-gray-500 hover:text-white transition-colors"
                            >
                                Undo — let them go
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

// ─── Component ────────────────────────────────────────────────────────────────

export const ExportPreviewModal: React.FC<ExportPreviewModalProps> = ({
    isOpen, onClose, onConfirm, diff: cardDiff, projectName, defaultMode = 'push', defaultPreset,
    onRefresh, isRefreshing, onChangeSDCard, cardMissing = false,
    sourceBar, usbMode = false, usbReach, blockedReason, onImportIntoNewProject,
}) => {
    // Firmware without the settings commands can't reach config.txt over USB: leave it
    // out of the decisions, show it as locked.
    const configLocked = usbMode && !usbReach?.config;
    const filesLocked = usbMode && !!usbReach && !usbReach.files;
    const diff = useMemo(() => configLocked ? { ...cardDiff, config: undefined } : cardDiff, [cardDiff, configLocked]);
    const [mode, setMode] = useState<'import' | 'push'>(defaultMode);

    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    const initialPreset: QuickPreset = defaultPreset ?? (mode === 'import' ? 'import_pool_only' : 'push_sync');


    const buildRows = useCallback((preset: QuickPreset, currentMode: 'import' | 'push'): SlotRow[] => {
        const rows: SlotRow[] = [];
        Object.values(diff.slots).forEach((sd: SyncSlotDiff) => {
            const lf = sd.localFile;
            const lv = lf?.versions.find(v => v.id === lf.currentVersionId);
            const { color, num } = parseTapeColor(sd.slotId);
            const status = sd.status as SlotRow['status'];
            rows.push({
                id: sd.slotId, slot: sd.slotId,
                tapeColor: color, slotNum: num, status,
                localName: lf?.name,
                localBlob: lv?.blob || null,
                // The original name (INAM) when the card file has one, not `1.WAV`.
                hardwareName: sd.remoteMeta?.name ?? sd.remote?.name ?? sd.remoteFile?.name ?? sd.remote?.fileName,
                hardwareBlob: sd.remoteFile || null,
                onCard: !!sd.remote,
                probableMatch: sd.match === 'name',
                staleHeader: sd.staleHeader,
                ownOlderVersion: sd.ownOlderVersion,
                size: lv?.blob?.size || sd.remote?.size || 0,
                remoteSize: sd.remote?.size ?? 0,
                primary: defaultPrimary(status, preset, currentMode, sd.staleHeader),
                toPool: defaultToPool(status, preset, currentMode, false, sd.ownOlderVersion),
            });
        });
        return rows.sort((a, b) => a.tapeColor.localeCompare(b.tapeColor) || a.slotNum - b.slotNum);
    }, [diff]);

    const [rows, setRows] = useState<SlotRow[]>(() => buildRows(initialPreset, mode));
    const [showAll, setShowAll] = useState(false);
    const [isApplying, setIsApplying] = useState(false);
    const [isAdvanced, setIsAdvanced] = useState(false);
    const [isCustomOverride, setIsCustomOverride] = useState(false);
    const [showConflictSummary, setShowConflictSummary] = useState(false);
    const [showFinalConfirmation, setShowFinalConfirmation] = useState(false);
    // Per-build opt-in, seeded from the saved preference (off by default).
    // Not persisted back — ticking it here is a decision about this build only.
    const [skSnapshot, setSkSnapshot] = useState(() => getDurabilityPrefs().skSnapshots);
    const [highlightedSlot, setHighlightedSlot] = useState<string | null>(null);
    const [hoveredSlotKey, setHoveredSlotKey] = useState<string | null>(null);
    const [showFuture, setShowFuture] = useState(false);
    // Slims the presets bar and footer so the slot grids get the height. Remembered.
    const [compact, setCompact] = useState(() => {
        try { return localStorage.getItem(COMPACT_KEY) === '1'; } catch { return false; }
    });
    const toggleCompact = () => setCompact(v => {
        try { localStorage.setItem(COMPACT_KEY, v ? '0' : '1'); } catch { /* not critical */ }
        return !v;
    });
    // The pool-first offer on Clean Mirror. Held as preset state rather than as a
    // hand edit so that taking it does not knock the preset down to Custom —
    // which would turn `skMode` back to 'overwrite' and stop it being a mirror.
    const [rescueBeforeClean, setRescueBeforeClean] = useState(false);

    // Unified preview state
    const [activePreviewBlob, setActivePreviewBlob] = useState<Blob | null>(null);
    const [activePreviewUrl, setActivePreviewUrl] = useState<string | null>(null);
    const [activePreviewLabel, setActivePreviewLabel] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const playerTimerRef = useRef<NodeJS.Timeout | null>(null);

    const clearPlayerTimer = useCallback(() => {
        if (playerTimerRef.current) {
            clearTimeout(playerTimerRef.current);
            playerTimerRef.current = null;
        }
    }, []);

    const startPlayerTimer = useCallback(() => {
        clearPlayerTimer();
        playerTimerRef.current = setTimeout(() => {
            setActivePreviewUrl(null);
            setActivePreviewLabel(null);
            setActivePreviewBlob(null);
        }, 10000);
    }, [clearPlayerTimer]);

    const handlePreview = (blob: Blob, label: string) => {
        clearPlayerTimer();
        if (activePreviewBlob === blob) {
            setActivePreviewBlob(null);
            if (activePreviewUrl) {
                URL.revokeObjectURL(activePreviewUrl);
                setActivePreviewUrl(null);
            }
            setActivePreviewLabel(null);
        } else {
            if (activePreviewUrl) URL.revokeObjectURL(activePreviewUrl);
            const url = URL.createObjectURL(blob);
            setActivePreviewBlob(blob);
            setActivePreviewUrl(url);
            setActivePreviewLabel(label);
            
            setTimeout(() => {
                if (audioRef.current) {
                    audioRef.current.load();
                    audioRef.current.play().catch(e => console.warn("Audio play failed:", e));
                }
            }, 10);
        }
    };

    // Clean up URLs
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            if (activePreviewUrl) URL.revokeObjectURL(activePreviewUrl);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [activePreviewUrl, isOpen, onClose]);

    const [configDecision, setConfigDecision] = useState<SKPrimaryDecision>(() => {
        if (!diff.config) return 'skip';
        return defaultPrimary(diff.config.status as any, initialPreset, mode);
    });
    const [notesDecision, setNotesDecision] = useState<SKPrimaryDecision>(() =>
        notesDefault(diff.notes?.status as SlotRow['status'] | undefined, initialPreset));

    // A rescan (Refresh, another source, a USB connect) brings a new diff: start
    // over from it, keeping the mode.
    const shownDiff = useRef(diff);
    useEffect(() => {
        if (shownDiff.current === diff) return;
        shownDiff.current = diff;
        setIsCustomOverride(false);
        setRescueBeforeClean(false);
        const preset: QuickPreset = mode === 'import' ? 'import_pool_only' : 'push_sync';
        setRows(buildRows(preset, mode));
        setConfigDecision(diff.config ? defaultPrimary(diff.config.status as SlotRow['status'], preset, mode) : 'skip');
        setNotesDecision(notesDefault(diff.notes?.status as SlotRow['status'] | undefined, preset));
    }, [diff, buildRows, mode]);

    const handleModeToggle = (m: 'import' | 'push') => {
        setMode(m);
    };

    const setPrimary = useCallback((id: string, primary: SKPrimaryDecision) => {
        setIsCustomOverride(false);
        setRows(prev => prev.map(r => r.id === id ? { ...r, primary } : r));
    }, []);

    const togglePool = useCallback((id: string) => {
        setIsCustomOverride(false);
        setRows(prev => prev.map(r => r.id === id ? { ...r, toPool: !r.toPool } : r));
    }, []);

    const applyPreset = useCallback((preset: QuickPreset) => {
        setIsCustomOverride(preset === 'custom');
        setRescueBeforeClean(false);
        if (preset === 'custom') {
            setRows(prev => prev.map(r => ({ ...r, primary: 'skip' as const, toPool: false })));
            setConfigDecision('skip');
            setNotesDecision('skip');
            return;
        }
        setRows(prev => prev.map(r => ({
            ...r,
            primary: defaultPrimary(r.status, preset, mode, r.staleHeader),
            toPool: defaultToPool(r.status, preset, mode, false, r.ownOlderVersion),
        })));
        if (diff.config) {
            setConfigDecision(defaultPrimary(diff.config.status as any, preset, mode));
        }
        setNotesDecision(notesDefault(diff.notes?.status as SlotRow['status'] | undefined, preset));
    }, [diff.config, diff.notes, mode]);

    const currentPreset: QuickPreset = useMemo(() => {
        if (isCustomOverride) return 'custom';
        const presets: QuickPreset[] = mode === 'import' 
            ? ['import_pool_only', 'import_merge_project', 'import_sync_merge']
            : ['push_sync', 'push_clean'];
        return presets.find(p => syncMatchPreset(rows, diff.config?.status as any, configDecision, p, rescueBeforeClean,
            diff.notes?.status as SlotRow['status'] | undefined, notesDecision)) ?? 'custom';
    }, [rows, configDecision, notesDecision, diff.config, diff.notes, mode, isCustomOverride, rescueBeforeClean]);

    const visibleRows = showAll ? rows : rows.filter(r => r.status !== 'MATCH' && r.status !== 'EMPTY');

    const configActionPending = configDecision !== 'skip';
    const notesActionPending = notesDecision === 'push_to_sk';
    const actionCount = rows.filter(r => r.primary !== 'skip' || r.toPool).length + (configActionPending ? 1 : 0) + (notesActionPending ? 1 : 0);

    // Push/push counts for Simple view summary
    const pushCount = rows.filter(r => r.primary === 'push_to_sk').length;
    const pullCount = rows.filter(r => r.primary === 'pull_to_slot').length;
    // One classification, read by the grids, the slot list, the panel and the
    // confirmation. Two of these disagreeing is what S1-8 was.
    const cardMoves = useMemo(() => buildCardMoves(rows, diff.duplicates ?? []), [rows, diff.duplicates]);
    const cardRemovals = rows.filter(isCardRemoval);
    const destroyedRemovals = cardRemovals.filter(r => cardFate(r, cardMoves) === 'destroyed');
    const movedRemovals = cardRemovals.filter(r => cardFate(r, cardMoves) === 'moved');
    const pooledRemovals = cardRemovals.filter(r => cardFate(r, cardMoves) === 'pooled');
    const localDeleteCount = rows.filter(r => r.primary === 'delete_local').length;

    /** The offer: keep the doomed files by pooling them before the card is written. */
    const rescueDoomedToPool = useCallback(() => {
        const doomed = new Set(rows.filter(r => cardFate(r, cardMoves) === 'destroyed').map(r => r.id));
        setRescueBeforeClean(true);
        setRows(prev => prev.map(r => doomed.has(r.id) ? { ...r, toPool: true } : r));
    }, [rows, cardMoves]);

    const undoRescue = useCallback(() => {
        const rescued = new Set(rows.filter(r => cardFate(r, cardMoves) === 'pooled').map(r => r.id));
        setRescueBeforeClean(false);
        setRows(prev => prev.map(r => rescued.has(r.id) ? { ...r, toPool: false } : r));
    }, [rows, cardMoves]);

    const handleTrashSlot = useCallback((slotId: string, side: 'project' | 'sd') => {
        setIsCustomOverride(true);
        setRows(prev => prev.map(r => {
            if (r.id !== slotId) return r;
            if (side === 'project') {
                const wasTrashOrPull = r.primary === 'delete_local' || (r.status === 'CONFLICT' && r.primary === 'pull_to_slot');
                if (wasTrashOrPull) return { ...r, primary: 'skip' as const, toPool: false };

                // If conflict, resolving via trash means pulling SD version into the "freed" slot
                if (r.status === 'CONFLICT') return { ...r, primary: 'pull_to_slot' as const, toPool: true };
                return { ...r, primary: 'delete_local' as const };
            } else {
                const wasTrashOrPush = r.primary === 'delete_sk' || (r.status === 'CONFLICT' && r.primary === 'push_to_sk');
                if (wasTrashOrPush) return { ...r, primary: 'skip' as const, toPool: false };

                if (r.status === 'CONFLICT') return { ...r, primary: 'push_to_sk' as const, toPool: true };
                return { ...r, primary: 'delete_sk' as const };
            }
        }));
    }, []);

    const isSlotTrashed = useCallback((slotId: string, side: 'project' | 'sd') => {
        const row = rows.find(r => r.id === slotId);
        if (!row) return false;
        if (side === 'project') {
            return row.primary === 'delete_local' || (row.status === 'CONFLICT' && row.primary === 'pull_to_slot');
        } else {
            return row.primary === 'delete_sk' || (row.status === 'CONFLICT' && row.primary === 'push_to_sk');
        }
    }, [rows]);

    // ── Drag state ────────────────────────────────────────────────────────────
    const [_dragSource, setDragSource] = useState<{ slotKey: string; prefix: 'PR' | 'SD' } | null>(null);
    const [poolDragOver, setPoolDragOver] = useState(false);

    const handleGridDrop = (droppedKey: string, droppedPrefix: string, targetPrefix: 'PR' | 'SD') => {
        if (droppedPrefix === targetPrefix) return;
        setIsCustomOverride(false);
        setRows(prev => prev.map(r => {
            const key = `${r.tapeColor}${r.slotNum}`;
            if (key !== droppedKey) return r;
            if (droppedPrefix === 'SD' && targetPrefix === 'PR') return { ...r, primary: 'pull_to_slot' as const };
            if (droppedPrefix === 'PR' && targetPrefix === 'SD') return { ...r, primary: 'push_to_sk' as const };
            return r;
        }));
        setDragSource(null);
    };

    const handlePoolDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setPoolDragOver(false);
        setIsCustomOverride(false);
        try {
            const { slotKey } = JSON.parse(e.dataTransfer.getData('text/plain'));
            setRows(prev => prev.map(r => `${r.tapeColor}${r.slotNum}` === slotKey && r.onCard ? { ...r, toPool: true } : r));
        } catch { /* ignore */ }
        setDragSource(null);
    };

    const handleConfirm = () => {
        // If in Simple view, verify there are no unresolved conflicts
        if (!isAdvanced) {
            const hasConflicts = rows.some(r => r.status === 'CONFLICT' && r.primary === 'skip');
            if (hasConflicts) {
                setShowConflictSummary(true);
                return;
            }
        }
        
        setShowFinalConfirmation(true);
    };

    const proceedWithConfirm = () => {
        setIsApplying(true);
        setShowConflictSummary(false);
        const legacyDecisions: Record<string, LegacyDecision> = {};
        const importDecisions: Record<string, ImportDecision> = {};
        rows.forEach(r => {
            if (r.primary === 'push_to_sk') legacyDecisions[r.id] = 'export';
            else if (r.primary === 'delete_sk') legacyDecisions[r.id] = 'delete';
            else legacyDecisions[r.id] = 'skip';

            if (r.primary === 'pull_to_slot' || r.toPool) {
                importDecisions[r.id] = {
                    pullToSlot: r.primary === 'pull_to_slot',
                    toPool: r.toPool,
                    file: r.hardwareBlob as File | null,
                    color: r.tapeColor,
                    slotIndex: r.slotNum,
                };
            }
        });
        // Always include the config decision: without one, a build writes config.txt anyway.
        if (diff.config) legacyDecisions['config'] = configDecision === 'push_to_sk' ? 'export' : 'skip';
        // Not a slot: every build writes README.md and SK/project.json. This makes a
        // notes-only change a build of its own.
        if (notesActionPending) legacyDecisions['notes'] = 'export';
        onConfirm(legacyDecisions, {
            preset: currentPreset,
            moveDisplacedToPool: rows.some(r => r.toPool),
            skMode: currentPreset === 'push_clean' ? 'clean' : 'overwrite',
            configDecision,
            // Legacy fields App.tsx still reads
            includeConfig: !configLocked,
            forceOverwrite: true,
            skSnapshot: skSnapshot && !usbMode,
        } as any, importDecisions);
        setIsApplying(false);
    };

    if (!isOpen) return null;

    // ── Shared: slot grid visualizer (BEFORE & AFTER) ─────────────────────────
    const projectSlots: Record<string, SlotEntry> = {};
    const sdSlots: Record<string, SlotEntry> = {};
    const afterProjectSlots: Record<string, SlotEntry> = {};
    const afterSdSlots: Record<string, SlotEntry> = {};
    
    // Dimming logic
    const dimmedProjectSlots: Record<string, boolean> = {};
    const dimmedSdSlots: Record<string, boolean> = {};
    const dimmedAfterProjectSlots: Record<string, boolean> = {};
    const dimmedAfterSdSlots: Record<string, boolean> = {};

    // Visual Indicator logic (Before side)
    const prIndicatorBorders: Record<string, { color: string, variant: 'dashed' | 'solid' }> = {};
    const sdIndicatorBorders: Record<string, { color: string, variant: 'dashed' | 'solid' }> = {};
    const prTrashFlags: Record<string, boolean> = {};
    const sdTrashFlags: Record<string, boolean> = {};
    const prPoolFlags: Record<string, boolean> = {};
    const sdPoolFlags: Record<string, boolean> = {};
    const prBadges: Record<string, SlotActionBadge> = {};
    const sdBadges: Record<string, SlotActionBadge> = {};

    rows.forEach(r => {
        const key = `${r.tapeColor}${r.slotNum}`;
        const isUntouched = (r.status === 'MATCH' && r.primary === 'skip') || r.status === 'EMPTY';

        // ── CURRENT (BEFORE) ──────────────────────────────────────────────────
        if (r.localBlob) {
            projectSlots[key] = { slotKey: key, color: r.tapeColor, num: r.slotNum, blob: r.localBlob, name: r.localName };
            if (isUntouched) dimmedProjectSlots[key] = true;
        }
        // Over USB a card slot has no blob (`hardwareBlob` null) but is still occupied.
        const cardEntry = r.onCard ? { blob: r.hardwareBlob ?? null, name: r.hardwareName } : null;
        const projectEntry = r.localBlob ? { blob: r.localBlob, name: r.localName } : null;
        if (cardEntry) {
            sdSlots[key] = { slotKey: key, color: r.tapeColor, num: r.slotNum, ...cardEntry, occupied: true };
            if (isUntouched) dimmedSdSlots[key] = true;
        }

        // ── FUTURE (AFTER) ────────────────────────────────────────────────────
        // Project side future
        const prChanges = r.primary === 'pull_to_slot' || r.primary === 'delete_local';
        const prAfter = r.primary === 'pull_to_slot' ? cardEntry
            : r.primary === 'delete_local' ? null
            : projectEntry;
        if (prAfter) {
            afterProjectSlots[key] = { slotKey: key, color: r.tapeColor, num: r.slotNum, ...prAfter, occupied: true };
            if (!prChanges) dimmedAfterProjectSlots[key] = true;
        }

        // SD side future
        const sdChanges = r.primary === 'push_to_sk' || r.primary === 'delete_sk';
        const sdAfter = r.primary === 'push_to_sk' ? projectEntry
            : r.primary === 'delete_sk' ? null
            : cardEntry;
        if (sdAfter) {
            afterSdSlots[key] = { slotKey: key, color: r.tapeColor, num: r.slotNum, ...sdAfter, occupied: true };
            if (!sdChanges) dimmedAfterSdSlots[key] = true;
        }

        // ── Visual Indicators (Current Grids Only) ───────────────────────────
        
        // 1. POOLED / COPIED (Orange/Green logic)
        if (r.toPool) {
            if (r.primary === 'pull_to_slot') {
                // Project slot is being updated from SD, and PR file is pooled
                prBadges[key] = { label: 'POOL', bg: 'bg-orange-600' };
                prPoolFlags[key] = true;
                prIndicatorBorders[key] = { color: 'border-orange-500', variant: 'dashed' };
                
                sdBadges[key] = { label: 'COPIED', bg: 'bg-green-600 text-white' };
                sdIndicatorBorders[key] = { color: 'border-orange-500', variant: 'dashed' };
            } else if (r.primary === 'skip' && mode === 'import') {
                // Import to Pool only (SD file is pooled, project stays same)
                sdBadges[key] = { label: 'COPIED', bg: 'bg-green-600 text-white' };
                sdPoolFlags[key] = true;
                sdIndicatorBorders[key] = { color: 'border-orange-500', variant: 'dashed' };
            } else if (r.primary === 'push_to_sk') {
                // Push to SD (already exists or conflict), SD file is pooled
                sdBadges[key] = { label: 'POOL', bg: 'bg-orange-600' };
                sdPoolFlags[key] = true;
                sdIndicatorBorders[key] = { color: 'border-orange-500', variant: 'dashed' };
            } else if (r.primary === 'delete_sk') {
                // The pool-first offer's own case: the card's copy is read into the
                // pool, then the slot is cleared. Without this the grid showed the
                // rescue as a plain delete.
                sdBadges[key] = { label: 'POOL', bg: 'bg-orange-600' };
                sdPoolFlags[key] = true;
                sdIndicatorBorders[key] = { color: 'border-orange-500', variant: 'dashed' };
            }
        }

        // Action-specific badges
        if (r.primary === 'push_to_sk' && !r.toPool) {
            prBadges[key] = { label: '→ SD', bg: 'bg-indigo-600' };
        } else if (r.primary === 'pull_to_slot' && !r.toPool) {
            sdBadges[key] = { label: '→ PR', bg: 'bg-orange-600' };
        }

        // 2. LEAVING THE CARD — destroyed takes the trash icon, moved says where it
        //    goes instead, pooled already wears the POOL badge from the block above.
        const fate = cardFate(r, cardMoves);
        if (fate === 'destroyed') {
            sdTrashFlags[key] = true;
            sdIndicatorBorders[key] = { color: 'border-red-500', variant: 'dashed' };
        } else if (fate === 'moved') {
            if (!sdBadges[key]) {
                sdBadges[key] = { label: `→ ${(cardMoves[r.id] ?? []).map(shortSlot).join(' ')}`, bg: 'bg-amber-600' };
            }
            sdIndicatorBorders[key] = { color: 'border-amber-500', variant: 'dashed' };
        } else if (r.primary === 'delete_local') {
            prTrashFlags[key] = true;
            prIndicatorBorders[key] = { color: 'border-red-500', variant: 'dashed' };
        }

        // 3. NEW (Green dashed border)
        if (r.status === 'LOCAL_ONLY' && r.primary === 'push_to_sk') {
            sdIndicatorBorders[key] = { color: 'border-green-500', variant: 'dashed' };
        } else if (r.status === 'REMOTE_ONLY' && r.primary === 'pull_to_slot') {
            prIndicatorBorders[key] = { color: 'border-green-500', variant: 'dashed' };
        }
    });

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#121212] w-full max-w-6xl rounded-2xl border border-white/10 flex flex-col shadow-2xl overflow-hidden max-h-[90vh]">

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/10 bg-[#1a1a1a] shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-indigo-500/20 rounded-xl">
                            <RiSdCardMiniLine size={22} className="text-indigo-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white leading-tight">
                                SD card SK/ Build & Import
                                {projectName && <span className="text-indigo-300 opacity-50 ml-2"> · {projectName}</span>}
                            </h2>
                            <div className="flex items-center gap-1 mt-2 p-0.5 bg-black/40 rounded-lg border border-white/5 w-fit">
                                <button 
                                    onClick={() => handleModeToggle('push')}
                                    className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${mode === 'push' ? 'bg-orange-600 text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}
                                >
                                    <ArrowRight size={11} /> Build SD
                                </button>
                                <button 
                                    onClick={() => handleModeToggle('import')}
                                    className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${mode === 'import' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}
                                >
                                    <ArrowLeft size={11} /> Import SD
                                </button>
                                {onChangeSDCard && (
                                    <button
                                        onClick={onChangeSDCard}
                                        className="ml-2 px-2 text-[9px] text-orange-400/60 hover:text-orange-300 underline font-bold uppercase tracking-widest"
                                    >
                                        Change SD
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {!isAdvanced && (
                            <button
                                onClick={() => setShowFuture(v => !v)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${showFuture ? 'bg-green-600/20 border-green-500/50 text-green-400' : 'border-white/10 text-gray-400 hover:text-white hover:border-white/20'}`}
                            >
                                {showFuture ? <X size={13} /> : <Check size={13} />}
                                {showFuture ? 'Hide Result' : 'Show Result'}
                            </button>
                        )}
                        {onRefresh && (
                            <button
                                onClick={onRefresh}
                                disabled={isRefreshing}
                                className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
                                title="Rescan Device"
                            >
                                <RefreshCw size={22} className={isRefreshing ? "animate-spin" : ""} />
                            </button>
                        )}
                        <button
                            onClick={() => setIsAdvanced(v => !v)}
                            className={[
                                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all',
                                isAdvanced
                                    ? 'bg-white/10 border-white/20 text-white'
                                    : 'border-white/10 text-gray-400 hover:text-white hover:border-white/20',
                            ].join(' ')}
                        >
                            <Settings2 size={13} />
                            {isAdvanced ? 'Simple' : 'Advanced'}
                        </button>
                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white">
                            <X size={22} />
                        </button>
                    </div>
                </div>
                {sourceBar}
                {/* ════ SHARED PRESETS HEADER ══════════════════════════════════ */}
                <div className={`px-6 ${compact ? 'py-2' : 'py-4'} bg-[#111] border-b border-white/5 flex items-start justify-between gap-4 flex-wrap shrink-0`}>
                    <div className="flex items-stretch gap-2 flex-wrap">
                        {(mode === 'import'
                            ? (['import_pool_only', 'import_merge_project', 'import_sync_merge', 'custom'] as QuickPreset[])
                            : (['push_sync', 'push_clean', 'custom'] as QuickPreset[])
                        ).map(preset => (
                            <PresetButton
                                key={preset}
                                preset={preset}
                                active={currentPreset === preset}
                                accent={preset === 'custom' ? 'gray' : mode === 'import' ? 'indigo' : 'orange'}
                                warnCardWrite={mode === 'import'}
                                compact={compact}
                                onClick={() => applyPreset(preset)}
                            />
                        ))}
                        {mode === 'import' && onImportIntoNewProject && (
                            <div className={compact
                                ? 'flex items-center gap-2 px-3 py-1 rounded-lg border border-dashed border-white/10'
                                : 'w-[210px] flex flex-col gap-1.5 px-4 py-2.5 rounded-xl border border-dashed border-white/10 text-left'}>
                                <span className="text-[11px] font-black uppercase tracking-widest text-gray-400">Into a new project</span>
                                {!compact && (
                                    <span className="text-[10px] leading-snug font-medium text-gray-600">
                                        A clean project with every card slot in the same slot.{usbMode && ' Over USB a full slot takes about 35 s.'}
                                    </span>
                                )}
                                <span className="flex items-center gap-1.5">
                                    <button
                                        onClick={() => onImportIntoNewProject(true)}
                                        disabled={!!blockedReason || cardMissing}
                                        title="Every slot, without a review"
                                        className="px-2 py-1 rounded-md border border-white/10 text-[10px] font-bold text-gray-300 hover:text-white hover:border-white/20 disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        Whole card
                                    </button>
                                    <button
                                        onClick={() => onImportIntoNewProject(false)}
                                        disabled={!!blockedReason || cardMissing}
                                        title="Review every slot first"
                                        className="px-2 py-1 rounded-md border border-white/10 text-[10px] font-bold text-gray-300 hover:text-white hover:border-white/20 disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        Choose slots…
                                    </button>
                                </span>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-4 ml-auto self-center">
                        {isAdvanced && (
                            <label className="flex items-center gap-1.5 cursor-pointer select-none group">
                                <input
                                    type="checkbox"
                                    checked={showAll}
                                    onChange={(e) => setShowAll(e.target.checked)}
                                    className="w-3.5 h-3.5 rounded bg-white/10 border-white/20 text-indigo-500 focus:ring-0 focus:ring-offset-0"
                                />
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none group-hover:text-white transition-colors">Show all slots</span>
                            </label>
                        )}
                        <button
                            onClick={toggleCompact}
                            title={compact ? 'Show the full presets and footer' : 'Make the presets and footer smaller'}
                            aria-label={compact ? 'Expand presets' : 'Collapse presets'}
                            aria-pressed={compact}
                            className="p-1.5 rounded-lg border border-white/10 text-gray-500 hover:text-white hover:border-white/20 transition-colors"
                        >
                            {compact ? <ChevronsDown size={14} /> : <ChevronsUp size={14} />}
                        </button>
                    </div>
                </div>

                {/* Scrollable Content Wrapper */}
                <div className="flex-1 overflow-y-auto min-h-0 bg-[#0c0c0c] flex flex-col custom-scrollbar">

                <DuplicatesBanner
                    duplicates={diff.duplicates ?? []}
                    hoveredSlotKey={hoveredSlotKey}
                    onHoverSlot={setHoveredSlotKey}
                    onTrashSlot={handleTrashSlot}
                    isSlotTrashed={isSlotTrashed}
                />
                
                {diff.config?.location === 'root' && (
                    <div className="mx-6 mt-4 rounded-xl border border-orange-500/30 bg-orange-500/5 px-4 py-3 flex items-center gap-3 animate-in slide-in-from-top-2 duration-300">
                        <div className="p-1.5 bg-orange-500/20 rounded-lg shrink-0">
                            <AlertTriangle size={13} className="text-orange-400" />
                        </div>
                        <div className="flex-1">
                            <p className="text-[11px] font-black text-white uppercase tracking-wider">Legacy Config Location Detected</p>
                            <p className="text-[10px] text-gray-400 mt-0.5">Your config.txt is at the SD root. Building will move it to the SK/ folder for future firmware compatibility.</p>
                        </div>
                    </div>
                )}

                {/* ════ SIMPLE VIEW ════════════════════════════════════════════ */}
                {!isAdvanced && (
                    <div className="px-6 py-6 flex flex-col gap-8">
                        {/* CUSTOM MODE ADVICE */}
                        {currentPreset === 'custom' && (
                            <div className="flex items-center gap-6 px-6 py-4 bg-orange-500/5 border border-orange-500/20 rounded-2xl animate-in fade-in slide-in-from-top-4 duration-500">
                                <div className="p-2 bg-orange-500/20 rounded-xl text-orange-400 shrink-0">
                                    <Settings2 size={20} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-sm font-black text-white tracking-tight">Advanced View Required</h3>
                                    <p className="text-[11px] text-gray-400 truncate">
                                        Switch to Advanced mode to make custom changes to individual slots or use the Preservation Pool.
                                    </p>
                                </div>
                                <button 
                                    onClick={() => setIsAdvanced(true)}
                                    className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-[10px] font-black uppercase tracking-widest rounded-lg transition-all shadow-lg hover:-translate-y-0.5 shrink-0"
                                >
                                    Switch to Advanced
                                </button>
                            </div>
                        )}

                        {/* WHAT THE CARD LOSES — named, not just badged. Quiet when
                            everything is pooled by default, as Standard Build does. */}
                        {(destroyedRemovals.length > 0 || movedRemovals.length > 0 || rescueBeforeClean) && (
                        <CardLossPanel
                            destroyed={destroyedRemovals}
                            moved={movedRemovals}
                            pooled={pooledRemovals}
                            moves={cardMoves}
                            rescued={rescueBeforeClean}
                            onRescue={rescueDoomedToPool}
                            onUndoRescue={undoRescue}
                        />
                        )}

                        {/* BEFORE SYNC */}
                        <div className="flex gap-4 items-stretch">
                            <SlotGrid6x6
                                slots={projectSlots}
                                title="Project (Before Sync)"
                                prefix="PR"
                                titleIcon={<div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
                                actionBadges={prBadges}
                                dimmedSlots={dimmedProjectSlots}
                                poolFlags={prPoolFlags}
                                trashFlags={prTrashFlags}
                                indicatorBorders={prIndicatorBorders}
                                hoveredSlotKey={hoveredSlotKey}
                                onHover={setHoveredSlotKey}
                                onPlay={handlePreview}
                                showPlayer={false}
                                className="flex-1 min-w-0"
                            />
                            <div className="flex flex-col items-center justify-center w-8 shrink-0">
                                {mode === 'push' ? (
                                    <ArrowRight size={24} className="text-orange-500/40 animate-pulse" strokeWidth={3} />
                                ) : (
                                    <ArrowLeft size={24} className="text-indigo-500/40 animate-pulse" strokeWidth={3} />
                                )}
                            </div>
                            <SlotGrid6x6
                                slots={sdSlots}
                                title="SD Card (Before Sync)"
                                prefix="SD"
                                titleIcon={<RiSdCardMiniLine size={12} className="text-orange-400" />}
                                actionBadges={sdBadges}
                                dimmedSlots={dimmedSdSlots}
                                poolFlags={sdPoolFlags}
                                trashFlags={sdTrashFlags}
                                indicatorBorders={sdIndicatorBorders}
                                hoveredSlotKey={hoveredSlotKey}
                                onHover={setHoveredSlotKey}
                                onPlay={handlePreview}
                                showPlayer={false}
                                className="flex-1 min-w-0"
                            />
                        </div>

                        {/* The card's other files, one small line each under the grids */}
                        {(diff.config || configLocked || diff.notes || filesLocked) && (
                        <div className="-mt-5 flex flex-col gap-1">
                        {(diff.config || configLocked) && (
                            <div className="flex items-center gap-2 text-[10px] text-gray-500">
                                <Archive size={11} className="text-orange-400/70 shrink-0" />
                                <span className="text-gray-300 font-bold">config.txt</span>
                                {configLocked ? (
                                    <span>needs firmware {USB_FIRMWARE.version} or later over USB</span>
                                ) : diff.config!.status === 'MATCH' ? (
                                    <span className="text-green-500 flex items-center gap-1"><Check size={9} /> settings in sync</span>
                                ) : diff.config!.status === 'EMPTY' ? (
                                    <span>none on either side</span>
                                ) : (
                                    <>
                                        <span className="text-orange-400">
                                            {diff.config!.status === 'LOCAL_ONLY' ? 'not on the card yet' : diff.config!.status === 'REMOTE_ONLY' ? 'only on the card' : 'settings differ'}
                                        </span>
                                        {diff.config!.status !== 'REMOTE_ONLY' && (
                                            <button onClick={() => { setIsCustomOverride(false); setConfigDecision(prev => prev === 'push_to_sk' ? 'skip' : 'push_to_sk'); }}
                                                className={['flex items-center gap-1 px-1.5 py-0.5 rounded transition-all font-bold', configDecision === 'push_to_sk' ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:text-gray-200 hover:bg-white/10'].join(' ')}>
                                                <ArrowRight size={9} /> to card
                                            </button>
                                        )}
                                        {diff.config!.status !== 'LOCAL_ONLY' && (
                                            <button onClick={() => { setIsCustomOverride(false); setConfigDecision(prev => prev === 'pull_to_slot' ? 'skip' : 'pull_to_slot'); }}
                                                className={['flex items-center gap-1 px-1.5 py-0.5 rounded transition-all font-bold', configDecision === 'pull_to_slot' ? 'bg-teal-600 text-white' : 'text-gray-500 hover:text-gray-200 hover:bg-white/10'].join(' ')}>
                                                <ArrowLeft size={9} /> into project
                                            </button>
                                        )}
                                        {configDecision === 'skip' && <span className="italic">skipped</span>}
                                    </>
                                )}
                            </div>
                        )}
                        {(diff.notes || filesLocked) && (
                            <div className="flex items-center gap-2 text-[10px] text-gray-500">
                                <Archive size={11} className="text-orange-400/70 shrink-0" />
                                <span className="text-gray-300 font-bold">README.md, SK/project.json</span>
                                {filesLocked ? (
                                    <span>need firmware {USB_FIRMWARE.version} or later over USB</span>
                                ) : diff.notes!.status === 'MATCH' ? (
                                    <span className="text-green-500 flex items-center gap-1"><Check size={9} /> notes in sync</span>
                                ) : (
                                    <>
                                        <span className="text-orange-400">{diff.notes!.status === 'LOCAL_ONLY' ? 'not on the card yet' : 'notes differ'}</span>
                                        <button onClick={() => { setIsCustomOverride(false); setNotesDecision(prev => prev === 'push_to_sk' ? 'skip' : 'push_to_sk'); }}
                                            className={['flex items-center gap-1 px-1.5 py-0.5 rounded transition-all font-bold', notesDecision === 'push_to_sk' ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:text-gray-200 hover:bg-white/10'].join(' ')}>
                                            <ArrowRight size={9} /> {notesDecision === 'push_to_sk' ? 'will be written' : 'skipped'}
                                        </button>
                                    </>
                                )}
                            </div>
                        )}
                        </div>
                        )}

                        {/* AFTER SYNC (Collapsible) */}
                        {showFuture && (
                            <div className="flex flex-col gap-3 border-t border-white/5 pt-6 mt-2">
                                <div className="flex gap-4 items-stretch opacity-90">
                                    <SlotGrid6x6
                                        slots={afterProjectSlots}
                                        title="Project (After Sync)"
                                        prefix="PR"
                                        titleIcon={<div className="w-1.5 h-1.5 rounded-full bg-green-500" />}
                                        dimmedSlots={dimmedAfterProjectSlots}
                                        hoveredSlotKey={hoveredSlotKey}
                                        onHover={setHoveredSlotKey}
                                        onPlay={handlePreview}
                                        showPlayer={false}
                                        className="flex-1 min-w-0"
                                    />
                                    <div className="flex flex-col items-center justify-center w-8 shrink-0">
                                        <Check size={24} className="text-green-500/40" strokeWidth={3} />
                                    </div>
                                    <SlotGrid6x6
                                        slots={afterSdSlots}
                                        title="SD Card (After Sync)"
                                        prefix="SD"
                                        titleIcon={<RiSdCardMiniLine size={12} className="text-green-400" />}
                                        dimmedSlots={dimmedAfterSdSlots}
                                        hoveredSlotKey={hoveredSlotKey}
                                        onHover={setHoveredSlotKey}
                                        onPlay={handlePreview}
                                        showPlayer={false}
                                        className="flex-1 min-w-0"
                                    />
                                </div>
                            </div>
                        )}

                    </div>
                )}

                {/* ════ ADVANCED VIEW ══════════════════════════════════════════ */}
                {isAdvanced && (
                    <>

                        {/* Dual slot grids — BEFORE & AFTER */}
                        <div className="px-6 py-6 border-b border-white/5 bg-[#0f0f0f] shrink-0 flex flex-col gap-6">
                            {/* BEFORE SYNC */}
                            <div className="flex gap-6 items-stretch">
                                <SlotGrid6x6
                                    slots={projectSlots}
                                    title="Project (Before Sync)"
                                    prefix="PR"
                                    titleIcon={<div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
                                    actionBadges={prBadges}
                                    poolFlags={prPoolFlags}
                                    trashFlags={prTrashFlags}
                                    indicatorBorders={prIndicatorBorders}
                                    dimmedSlots={dimmedProjectSlots}
                                    highlightedSlot={highlightedSlot}
                                    hoveredSlotKey={hoveredSlotKey}
                                    onHover={setHoveredSlotKey}
                                    onPlay={handlePreview}
                                    showPlayer={false}
                                    draggable
                                    droppable
                                    onDragStart={(key, pfx) => setDragSource({ slotKey: key, prefix: pfx as 'PR' | 'SD' })}
                                    onDrop={(key, pfx) => handleGridDrop(key, pfx, 'PR')}
                                    className="flex-1 min-w-0"
                                />
                                <div className="flex flex-col items-center justify-center w-8 shrink-0">
                                    {mode === 'push' ? (
                                        <ArrowRight size={24} className="text-orange-500/40" strokeWidth={3} />
                                    ) : (
                                        <ArrowLeft size={24} className="text-indigo-500/40" strokeWidth={3} />
                                    )}
                                </div>
                                <SlotGrid6x6
                                    slots={sdSlots}
                                    title="SD Card · SK (Before Sync)"
                                    prefix="SD"
                                    titleIcon={<RiSdCardMiniLine size={12} className="text-orange-400" />}
                                    actionBadges={sdBadges}
                                    poolFlags={sdPoolFlags}
                                    trashFlags={sdTrashFlags}
                                    indicatorBorders={sdIndicatorBorders}
                                    dimmedSlots={dimmedSdSlots}
                                    highlightedSlot={highlightedSlot}
                                    hoveredSlotKey={hoveredSlotKey}
                                    onHover={setHoveredSlotKey}
                                    onPlay={handlePreview}
                                    showPlayer={false}
                                    draggable
                                    droppable
                                    onDragStart={(key, pfx) => setDragSource({ slotKey: key, prefix: pfx as 'PR' | 'SD' })}
                                    onDrop={(key, pfx) => handleGridDrop(key, pfx, 'SD')}
                                    className="flex-1 min-w-0"
                                />
                            </div>

                            {/* AFTER SYNC */}
                            <div className="flex gap-6 items-stretch opacity-90">
                                <SlotGrid6x6
                                    slots={afterProjectSlots}
                                    title="Project (After Sync)"
                                    prefix="PR"
                                    titleIcon={<div className="w-1.5 h-1.5 rounded-full bg-green-500" />}
                                    dimmedSlots={dimmedAfterProjectSlots}
                                    hoveredSlotKey={hoveredSlotKey}
                                    onHover={setHoveredSlotKey}
                                    onPlay={handlePreview}
                                    showPlayer={false}
                                    className="flex-1 min-w-0"
                                />
                                <div className="flex flex-col items-center justify-center w-8 shrink-0">
                                    <Check size={24} className="text-green-500/40" strokeWidth={3} />
                                </div>
                                <SlotGrid6x6
                                    slots={afterSdSlots}
                                    title="SD Card (After Sync)"
                                    prefix="SD"
                                    titleIcon={<RiSdCardMiniLine size={12} className="text-green-400" />}
                                    dimmedSlots={dimmedAfterSdSlots}
                                    hoveredSlotKey={hoveredSlotKey}
                                    onHover={setHoveredSlotKey}
                                    onPlay={handlePreview}
                                    showPlayer={false}
                                    className="flex-1 min-w-0"
                                />
                            </div>
                        </div>

                            {/* Pool zone */}
                            <div
                                className={`flex flex-col gap-2 border rounded-xl px-4 py-3 transition-all ${poolDragOver
                                    ? 'border-orange-500 bg-orange-500/10 shadow-[0_0_20px_rgba(249,115,22,0.2)]'
                                    : 'border-white/8 bg-black/40'
                                    }`}
                                onDragOver={(e) => { e.preventDefault(); setPoolDragOver(true); }}
                                onDragLeave={() => setPoolDragOver(false)}
                                onDrop={handlePoolDrop}
                            >
                                <div className="flex items-center gap-2">
                                    <div className="p-1 bg-orange-500/20 rounded border border-orange-500/20">
                                        <Archive size={10} className="text-orange-400" />
                                    </div>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-orange-500">📥 Preservation Pool</span>
                                    <span className="text-[9px] text-[#555] normal-case ml-2 flex items-center gap-2 italic">
                                        Hover tags to highlight origin grid cells • Drag slots here to pool instead of deleting
                                    </span>
                                </div>
                                <div className="flex flex-wrap gap-2 min-h-[24px]">
                                    {rows.filter(r => r.toPool).map(r => {
                                        const hex = TAPE_DOT_COLORS[r.tapeColor] || '#888';
                                        const lbl = `${r.onCard ? 'SD' : 'PR'} ${TAPE_LETTER[r.tapeColor] || r.tapeColor[0]}${r.slotNum}`;
                                        const isHighlighted = highlightedSlot === r.slot;
                                        return (
                                            <span
                                                key={r.id}
                                                onMouseEnter={() => setHighlightedSlot(r.slot)}
                                                onMouseLeave={() => setHighlightedSlot(null)}
                                                className={`flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] font-mono font-black transition-all cursor-default ${isHighlighted ? 'scale-110 shadow-lg brightness-125 ring-2 ring-orange-500/50' : 'opacity-80'}`}
                                                style={{ borderColor: `${hex}60`, color: hex, background: `${hex}20` }}
                                            >
                                                {lbl}
                                                <button
                                                    onClick={() => togglePool(r.id)}
                                                    className="ml-1 opacity-40 hover:opacity-100 text-[12px] leading-none text-white/50 hover:text-white"
                                                    title="Remove from pool"
                                                >×</button>
                                            </span>
                                        );
                                    })}
                                    {rows.every(r => !r.toPool) && (
                                        <span className="text-[9px] text-gray-700 italic">No files currently pooled.</span>
                                    )}
                                </div>
                            </div>
                        
                        {/* Table Area — Now part of the main scroll flow */}
                        <div className="mt-4 pb-20">
                            <div className="grid grid-cols-[40px_1fr_80px_150px_1fr] gap-0 text-[10px] font-black uppercase tracking-widest text-[#555] px-4 py-2 border-y border-white/5 bg-[#0f0f0f] sticky top-0 z-30">
                                <div />
                                <div className="pl-2 flex items-center gap-1 text-indigo-300">● Project</div>
                                <div className="text-center">Status</div>
                                <div className="text-center">Decision</div>
                                <div className="flex items-center gap-1 justify-end pr-2 text-orange-300">
                                    <RiSdCardMiniLine size={12} className="text-orange-400" /> SK Hardware
                                </div>
                            </div>

                            {visibleRows.length === 0 && (diff.config?.status === 'MATCH' || !diff.config) && (diff.notes?.status === 'MATCH' || !diff.notes) && (
                                <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-500">
                                    <Check size={32} className="text-green-500" />
                                    <p className="font-medium text-gray-300">Hardware matches project</p>
                                    <p className="text-sm">Toggle "Show all slots" to review everything.</p>
                                </div>
                            )}

                            {configLocked && (
                                <div className="grid grid-cols-[40px_1fr] gap-0 border-b border-white/5 opacity-60">
                                    <div className="flex items-center justify-center py-3 border-r border-white/5">
                                        <Archive size={14} className="text-gray-500" />
                                    </div>
                                    <div className="p-3 flex items-center gap-3 min-w-0">
                                        <p className="text-xs text-gray-300 font-bold">config.txt</p>
                                        <p className="text-[10px] text-gray-500">Over USB this needs firmware {USB_FIRMWARE.version} or later. Use the card reader, or update the firmware.</p>
                                    </div>
                                </div>
                            )}

                            {filesLocked && (
                                <div className="grid grid-cols-[40px_1fr] gap-0 border-b border-white/5 opacity-60">
                                    <div className="flex items-center justify-center py-3 border-r border-white/5">
                                        <Archive size={14} className="text-gray-500" />
                                    </div>
                                    <div className="p-3 flex items-center gap-3 min-w-0">
                                        <p className="text-xs text-gray-300 font-bold shrink-0">README.md, SK/project.json</p>
                                        <p className="text-[10px] text-gray-500">Over USB these need firmware {USB_FIRMWARE.version} or later. The card keeps the ones from its last card-reader build.</p>
                                    </div>
                                </div>
                            )}

                            {/* Config Row — always listed, like the card's other files */}
                            {diff.config && (
                                <div className="grid grid-cols-[40px_1fr_80px_150px_1fr] gap-0 border-b border-white/5 bg-orange-500/5 hover:bg-orange-500/10 transition-colors">
                                    <div className="flex flex-col items-center justify-center gap-1 py-3 border-r border-white/5">
                                        <Archive size={14} className="text-orange-400" />
                                    </div>
                                    <div className="p-3 flex items-center gap-2 border-r border-white/5 min-w-0">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs text-white font-bold truncate">config.txt</p>
                                            <p className="text-[10px] text-gray-500 mt-0.5">Project Settings</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-center p-2 border-r border-white/5">
                                        {diff.config.status === 'MATCH' && <span className="text-[8px] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1"><Check size={7} /> Sync</span>}
                                        {diff.config.status === 'CONFLICT' && <span className="text-[8px] text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1"><AlertTriangle size={7} /> Conflict</span>}
                                        {diff.config.status === 'LOCAL_ONLY' && <span className="text-[8px] text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1"><ArrowRight size={7} /> Local</span>}
                                        {diff.config.status === 'REMOTE_ONLY' && <span className="text-[8px] text-orange-300 bg-orange-500/10 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1"><ArrowLeft size={7} /> SD only</span>}
                                        {diff.config.status === 'EMPTY' && <span className="text-[8px] text-gray-500 bg-white/5 px-1.5 py-0.5 rounded-full font-bold">None</span>}
                                    </div>
                                    <div className="flex flex-col items-center justify-center gap-1 p-2 border-r border-white/5">
                                        {diff.config.status === 'MATCH' ? (
                                            <span className="text-[9px] text-green-500 font-bold flex items-center gap-1"><Check size={9} /> In sync</span>
                                        ) : diff.config.status === 'EMPTY' ? (
                                            <span className="text-[9px] text-gray-600">—</span>
                                        ) : (
                                            <div className="flex items-center gap-0.5">
                                                <button onClick={() => { setIsCustomOverride(false); setConfigDecision(prev => prev === 'push_to_sk' ? 'skip' : 'push_to_sk'); }}
                                                    className={['p-1.5 rounded transition-all', configDecision === 'push_to_sk' ? 'bg-indigo-600 text-white shadow-sm scale-110' : 'text-gray-500 hover:text-gray-200 hover:bg-white/10'].join(' ')}>
                                                    <ArrowRight size={12} />
                                                </button>
                                                <span className="text-gray-700 text-[10px] mx-0.5 select-none">|</span>
                                                <button onClick={() => { setIsCustomOverride(false); setConfigDecision(prev => prev === 'pull_to_slot' ? 'skip' : 'pull_to_slot'); }}
                                                    className={['p-1.5 rounded transition-all', configDecision === 'pull_to_slot' ? 'bg-teal-600 text-white shadow-sm scale-110' : 'text-gray-500 hover:text-gray-200 hover:bg-white/10'].join(' ')}>
                                                    <ArrowLeft size={12} />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    <div className="p-3 flex items-center gap-2 min-w-0 flex-row-reverse">
                                        <div className="flex-1 min-w-0 text-right">
                                            <p className="text-xs text-white font-medium truncate">config.txt</p>
                                            <div className="flex flex-col items-end gap-1 mt-0.5">
                                                <p className="text-[10px] text-gray-500">on SD {diff.config.location === 'sk' ? 'SK folder' : 'Root'}</p>
                                                {diff.config.location === 'root' && (
                                                    <p className="text-[8px] text-orange-400 font-bold uppercase tracking-tight bg-orange-400/10 px-1.5 py-0.5 rounded flex items-center gap-1">
                                                        <AlertTriangle size={8} /> Old Location
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* README.md + SK/project.json: compared by the notes they carry */}
                            {diff.notes && (
                                <div className="grid grid-cols-[40px_1fr_80px_150px_1fr] gap-0 border-b border-white/5 bg-orange-500/5 hover:bg-orange-500/10 transition-colors">
                                    <div className="flex flex-col items-center justify-center gap-1 py-3 border-r border-white/5">
                                        <Archive size={14} className="text-orange-400" />
                                    </div>
                                    <div className="p-3 flex items-center gap-2 border-r border-white/5 min-w-0">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs text-white font-bold truncate">README.md, SK/project.json</p>
                                            <p className="text-[10px] text-gray-500 mt-0.5">Project and tape notes</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-center p-2 border-r border-white/5">
                                        {diff.notes.status === 'MATCH' && <span className="text-[8px] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1"><Check size={7} /> Sync</span>}
                                        {diff.notes.status === 'CONFLICT' && <span className="text-[8px] text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1"><AlertTriangle size={7} /> Differs</span>}
                                        {diff.notes.status === 'LOCAL_ONLY' && <span className="text-[8px] text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1"><ArrowRight size={7} /> Local</span>}
                                    </div>
                                    <div className="flex flex-col items-center justify-center gap-1 p-2 border-r border-white/5">
                                        {diff.notes.status === 'MATCH' ? (
                                            <span className="text-[9px] text-green-500 font-bold flex items-center gap-1"><Check size={9} /> In sync</span>
                                        ) : (
                                            <button onClick={() => { setIsCustomOverride(false); setNotesDecision(prev => prev === 'push_to_sk' ? 'skip' : 'push_to_sk'); }}
                                                title="Write the project's notes to the card"
                                                className={['p-1.5 rounded transition-all', notesDecision === 'push_to_sk' ? 'bg-indigo-600 text-white shadow-sm scale-110' : 'text-gray-500 hover:text-gray-200 hover:bg-white/10'].join(' ')}>
                                                <ArrowRight size={12} />
                                            </button>
                                        )}
                                    </div>
                                    <div className="p-3 flex items-center min-w-0">
                                        <p className="text-[10px] text-gray-500 text-right w-full">Written with every build</p>
                                    </div>
                                </div>
                            )}

                            {visibleRows.map(row => {
                                const dotColor = TAPE_DOT_COLORS[row.tapeColor] || '#888';
                                // A MATCH can still be pushed (a mirror, a stale header, or by hand in Advanced).
                                const isSame = row.status === 'EMPTY' || (row.status === 'MATCH' && row.primary === 'skip' && !isAdvanced);

                                const canDeleteLocal = isAdvanced;
                                const canPushRight = row.status === 'LOCAL_ONLY' || row.status === 'CONFLICT' || row.status === 'MATCH';
                                const canPullSlot = row.status === 'REMOTE_ONLY' || row.status === 'CONFLICT';
                                const canDeleteSK = row.status === 'REMOTE_ONLY' || row.status === 'CONFLICT';
                                // A slot in sync can still be copied to the pool, to check what the card holds.
                                const canToPool = row.status === 'REMOTE_ONLY' || row.status === 'CONFLICT' || row.status === 'MATCH';
                                const fate = cardFate(row, cardMoves);
                                const cardFileDestroyed = fate === 'destroyed';
                                const cardFileMoved = fate === 'moved';
                                const cardFilePooled = fate === 'pooled';
                                const moveTargets = (cardMoves[row.id] ?? []).map(shortSlot).join(', ');

                                const pBtn = (dec: SKPrimaryDecision, icon: React.ReactNode, enabled: boolean, activeColor: string) => {
                                    const isActive = row.primary === dec;
                                    return (
                                        <button key={dec}
                                            onClick={() => enabled && setPrimary(row.id, isActive ? 'skip' : dec)}
                                            title={PRIMARY_LABEL[dec]}
                                            className={[
                                                'p-1.5 rounded transition-all',
                                                isActive
                                                    ? `${activeColor} text-white shadow-sm scale-110`
                                                    : enabled
                                                        ? 'text-gray-500 hover:text-gray-200 hover:bg-white/10'
                                                        : 'text-gray-700 opacity-25 cursor-default',
                                            ].join(' ')}>
                                            {icon}
                                        </button>
                                    );
                                };

                                const parts: string[] = [];
                                // If PR is trashed AND we are pulling from SD
                                if (row.primary === 'pull_to_slot' && row.status === 'CONFLICT') {
                                    parts.push('🗑️ Trashed & Imported');
                                } else if (cardFileDestroyed && row.primary === 'push_to_sk') {
                                    // The card's copy is overwritten and not pooled
                                    parts.push('🗑️ Trashed & Pushed');
                                } else if (row.primary !== 'skip') {
                                    parts.push(PRIMARY_LABEL[row.primary]);
                                }
                                if (row.toPool && row.primary !== 'pull_to_slot' && row.primary !== 'push_to_sk') parts.push('+ Pool');
                                const activeLabel = parts.length ? parts.join(' ') : 'Skip';

                                return (
                                    <div key={row.id}
                                        className={[
                                            'grid grid-cols-[40px_1fr_80px_150px_1fr] gap-0 border-b border-white/5 transition-colors',
                                            cardFileDestroyed ? 'bg-red-500/[0.07] hover:bg-red-500/[0.11]'
                                                : cardFileMoved ? 'bg-amber-500/[0.06] hover:bg-amber-500/[0.10]'
                                                    : 'hover:bg-white/[0.02]',
                                            isSame ? 'opacity-40' : '',
                                        ].join(' ')}>

                                        <div className="flex flex-col items-center justify-center gap-1 py-3 border-r border-white/5">
                                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: dotColor }} />
                                            <span className="text-[9px] text-gray-500 font-mono font-bold">{row.slotNum}</span>
                                        </div>

                                        <div className="p-3 flex items-center gap-2 border-r border-white/5 min-w-0">
                                            {row.localBlob ? (
                                                <button
                                                    onClick={() => handlePreview(row.localBlob!, `${row.slot} (Project)`)}
                                                    className={`p-1.5 rounded-full shrink-0 transition-colors ${activePreviewBlob === row.localBlob ? 'bg-indigo-500 text-white' : 'text-gray-500 hover:text-white hover:bg-white/10'}`}
                                                ><Play size={10} fill="currentColor" /></button>
                                            ) : (
                                                <div className="w-6 h-6 shrink-0" />
                                            )}
                                            {row.localName ? (
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs text-white font-medium truncate">{row.localName}</p>
                                                    <p className="text-[10px] text-gray-500 mt-0.5">{(row.size / 1024 / 1024).toFixed(1)} MB</p>
                                                </div>
                                            ) : (
                                                <p className="text-xs text-gray-600 italic">—</p>
                                            )}
                                        </div>

                                        <div className="flex items-center justify-center p-2 border-r border-white/5">
                                            {row.status === 'MATCH' && (row.staleHeader
                                                ? <span title="Same audio. Only the header differs: a new name or slices in the project, or a file written before 4.2 or by another tool. A build rewrites the file in place; nothing is lost or pooled." className="text-[8px] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1"><Check size={7} /> Sync · header update</span>
                                                : <span className="text-[8px] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1"><Check size={7} /> Sync</span>)}
                                            {row.status === 'EMPTY' && <span className="text-[8px] text-gray-500 bg-white/5 px-1.5 py-0.5 rounded-full font-bold">Empty</span>}
                                            {row.status === 'CONFLICT' && (row.ownOlderVersion
                                                ? <span title="The card holds an older version of this project file, written by this project. A build replaces it; the project already has that version, so nothing is pooled." className="text-[8px] text-indigo-300 bg-indigo-500/10 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1"><ArrowRight size={7} /> Changed</span>
                                                : row.probableMatch
                                                ? <span title="Same name and length, but nothing else ties the card file to this project file. Probably the same file." className="text-[8px] text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1"><AlertTriangle size={7} /> Same name?</span>
                                                : <span className="text-[8px] text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1"><AlertTriangle size={7} /> Conflict</span>)}
                                            {row.status === 'LOCAL_ONLY' && <span className="text-[8px] text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1"><ArrowRight size={7} /> Local</span>}
                                            {row.status === 'REMOTE_ONLY' && <span className="text-[8px] text-orange-300 bg-orange-500/10 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1"><ArrowLeft size={7} /> SK only</span>}
                                        </div>

                                        <div className="flex flex-col items-center justify-center gap-2 p-2 border-r border-white/5">
                                            {isSame ? (
                                                <span className="text-[9px] text-green-500 font-bold flex items-center gap-1"><Check size={9} /> In sync</span>
                                            ) : (
                                                <>
                                                    <div className="flex items-center gap-0.5">
                                                        {pBtn('delete_local', <Trash2 size={12} />, canDeleteLocal, 'bg-red-700')}
                                                        {pBtn('push_to_sk', <ArrowRight size={12} />, canPushRight, 'bg-indigo-600')}
                                                        <span className="text-gray-700 text-[10px] mx-0.5 select-none font-light">|</span>
                                                        {pBtn('pull_to_slot', <ArrowLeft size={12} />, canPullSlot, 'bg-teal-600')}
                                                        {pBtn('delete_sk', <Trash2 size={12} />, canDeleteSK, 'bg-red-700')}
                                                    </div>
                                                    
                                                    {canToPool && (
                                                        <button 
                                                            onClick={() => togglePool(row.id)}
                                                            className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[8px] font-black uppercase tracking-tighter transition-all border ${row.toPool ? 'bg-orange-600 border-transparent text-white shadow-md' : 'border-white/5 text-gray-500 hover:text-white hover:bg-white/5'}`}
                                                        >
                                                            <Archive size={10} /> 
                                                            {row.toPool ? (
                                                                row.primary === 'pull_to_slot' ? 'POOLING PR SLOT' : 'POOLING SD FILE'
                                                            ) : (
                                                                row.primary === 'pull_to_slot' ? 'MOVE PR -> POOL' : 'MOVE SD -> POOL'
                                                            )}
                                                        </button>
                                                    )}
                                                    
                                                    {cardFileDestroyed && (
                                                        <span className="text-[8px] text-red-400 font-black uppercase tracking-tighter flex items-center gap-1">
                                                            <Trash2 size={9} /> SD file deleted
                                                        </span>
                                                    )}

                                                    {cardFileMoved && (
                                                        <span className="text-[8px] text-amber-400 font-black uppercase tracking-tighter flex items-center gap-1">
                                                            <ArrowRight size={9} /> Moves to {moveTargets}
                                                        </span>
                                                    )}

                                                    {!canToPool && !fate && (
                                                        <span className="text-[8px] text-gray-600 font-black uppercase tracking-widest mt-1">
                                                            {activeLabel}
                                                        </span>
                                                    )}
                                                </>
                                            )}
                                        </div>

                                        <div className="p-3 flex items-center gap-2 min-w-0 flex-row-reverse">
                                            {row.hardwareBlob ? (
                                                <button
                                                    onClick={() => handlePreview(row.hardwareBlob!, `${row.slot} (SK)`)}
                                                    className={`p-1.5 rounded-full shrink-0 transition-colors ${activePreviewBlob === row.hardwareBlob ? 'bg-orange-500 text-white' : 'text-gray-500 hover:text-white hover:bg-white/10'}`}
                                                ><Play size={10} fill="currentColor" /></button>
                                            ) : (
                                                <div className="w-6 h-6 shrink-0" />
                                            )}
                                            {row.hardwareName ? (
                                                <div className="flex-1 min-w-0 text-right">
                                                    <p className={`text-xs font-medium truncate ${cardFileDestroyed ? 'text-red-200/70 line-through decoration-red-500/70' : 'text-white'}`}>
                                                        {row.hardwareName}
                                                    </p>
                                                    {cardFileDestroyed ? (
                                                        <p className="text-[10px] text-red-400 mt-0.5 font-bold flex items-center justify-end gap-1">
                                                            <Trash2 size={9} /> Deleted from card
                                                        </p>
                                                    ) : cardFileMoved ? (
                                                        <p className="text-[10px] text-amber-400 mt-0.5 font-bold flex items-center justify-end gap-1">
                                                            <ArrowRight size={9} /> Moves to {moveTargets}
                                                        </p>
                                                    ) : cardFilePooled ? (
                                                        <p className="text-[10px] text-orange-400 mt-0.5 font-bold flex items-center justify-end gap-1">
                                                            <Archive size={9} /> Into the pool, off the card
                                                        </p>
                                                    ) : (
                                                        <p className="text-[10px] text-gray-500 mt-0.5">on SK</p>
                                                    )}
                                                </div>
                                            ) : (
                                                <p className="text-xs text-gray-600 italic text-right flex-1">—</p>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>

                {/* Unified Sleek Player Bar */}
                {activePreviewUrl && (
                    <div className="border-t border-white/5 bg-[#0a0a0a] px-6 py-2.5 flex items-center gap-4 shrink-0 transition-all animate-in slide-in-from-bottom-2 duration-300">
                        <div className="flex items-center gap-2 min-w-[200px] max-w-[300px]">
                            <div className="p-1 bg-indigo-500/10 rounded-md border border-indigo-500/20">
                                <Play size={10} className="text-indigo-400" fill="currentColor" />
                            </div>
                            <span className="text-[10px] font-bold text-gray-400 truncate tracking-tight">
                                {activePreviewLabel || 'Select a slot to preview audio'}
                            </span>
                        </div>
                        <audio
                            ref={audioRef}
                            src={activePreviewUrl}
                            controls
                            autoPlay
                            onPlay={clearPlayerTimer}
                            onPause={startPlayerTimer}
                            onEnded={startPlayerTimer}
                            className="h-7 flex-1 opacity-90 invert hue-rotate-180 grayscale contrast-150"
                            controlsList="nodownload noplaybackrate"
                        />
                    </div>
                )}

                {/* Footer */}
                <div className={`${compact ? 'px-5 py-2' : 'p-5'} border-t border-white/10 bg-[#1a1a1a] flex items-center justify-between gap-4 shrink-0 flex-wrap`}>
                    <div className="text-xs text-gray-500 hidden sm:flex items-center gap-4">
                        <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-md border border-white/5">
                            <Save size={12} className="text-indigo-400" />
                            <span className="text-[10px] font-bold text-indigo-300">Project will be saved before sync</span>
                        </div>
                        {actionCount > 0
                            ? <>{actionCount} item{actionCount !== 1 ? 's' : ''} will be updated</>
                            : <span className="italic">No changes selected</span>}
                    </div>
                    <div className="flex items-center gap-3 ml-auto">
                        <button onClick={onClose}
                            className="px-5 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors font-medium">
                            Cancel
                        </button>
                        <button
                            onClick={handleConfirm}
                            disabled={isApplying || actionCount === 0 || cardMissing || !!blockedReason}
                            title={cardMissing ? 'SD card not found' : blockedReason}
                            className={`${compact ? 'px-5 py-2' : 'px-8 py-3'} ${mode === 'push' ? 'bg-orange-600 hover:bg-orange-500 shadow-[0_8px_24px_rgba(249,115,22,0.3)]' : 'bg-indigo-600 hover:bg-indigo-500 shadow-[0_8px_24px_rgba(79,70,229,0.3)]'} disabled:opacity-40 disabled:cursor-not-allowed text-white font-black rounded-xl flex items-center gap-3 transition-all transform hover:-translate-y-0.5`}
                        >
                            {isApplying ? <Loader size={20} className="animate-spin" /> : 
                             (mode === 'push' ? <ArrowRight size={20} /> : <ArrowDown size={20} />)}
                            <div className="flex flex-col items-start leading-tight">
                                <span className="text-[13px] uppercase tracking-wider">
                                    {isApplying ? 'Processing…' : (
                                        currentPreset === 'custom'
                                            ? PRESET_META.custom.label
                                            : mode === 'push'
                                                ? `${PRESET_META[currentPreset].label} to SD`
                                                : PRESET_META[currentPreset].label
                                    )}
                                </span>
                                {!isApplying && !compact && (
                                    <span className="text-[10px] opacity-70 font-bold uppercase italic">
                                        {currentPreset === 'custom' ? 'Apply Custom Changes' : 'Confirm Actions'}
                                    </span>
                                )}
                            </div>
                        </button>
                    </div>
                </div>
                {/* Card not reachable: blocks the modal until it is back or another folder is picked */}
                {cardMissing && (
                    <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6">
                        <div role="alertdialog" aria-labelledby="card-missing-title"
                            className="bg-[#1a1a1a] border border-red-500/40 rounded-2xl shadow-2xl max-w-md w-full max-h-full overflow-y-auto p-8 flex flex-col gap-6 text-center animate-in fade-in zoom-in duration-200">
                            <div className="mx-auto w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center">
                                <AlertTriangle size={28} className="text-red-400" />
                            </div>
                            <div className="flex flex-col gap-2">
                                <h3 id="card-missing-title" className="text-lg font-bold text-white">SD card not found</h3>
                                <p className="text-sm text-gray-400">
                                    The card was ejected or its location can't be read. Insert the card, or pick its location again.
                                </p>
                            </div>
                            <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
                                <Loader size={14} className="animate-spin" />
                                Waiting for the card. It is rescanned as soon as it is back.
                            </div>
                            <div className="flex items-center justify-center gap-3">
                                <button onClick={onClose}
                                    className="px-5 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors font-medium">
                                    Cancel
                                </button>
                                {onChangeSDCard && (
                                    <button onClick={onChangeSDCard}
                                        className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-colors">
                                        Change SD location
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}
                {/* Conflict Summary Modal (Simple View Only) */}
                {showConflictSummary && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-md p-6">
                        <div className="bg-[#1a1a1a] border border-orange-500/40 rounded-3xl shadow-2xl max-w-lg w-full max-h-full overflow-y-auto p-8 flex flex-col gap-6 animate-in fade-in zoom-in duration-300 text-center">
                            <div className="flex flex-col items-center gap-4 text-orange-400">
                                <AlertTriangle size={48} />
                                <div>
                                    <h3 className="text-2xl font-black text-white tracking-tight">Resolve Conflicts Manually</h3>
                                    <p className="text-sm opacity-60 font-medium mt-1">Some slots have different content on SD and Project. Switching to Advanced view to resolve.</p>
                                </div>
                            </div>
                            
                            <div className="flex flex-col gap-4">
                                <button 
                                    onClick={() => { setShowConflictSummary(false); setIsAdvanced(true); }}
                                    className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black shadow-lg transition-all transform hover:-translate-y-1 active:translate-y-0 uppercase tracking-widest text-[11px]"
                                >
                                    Open Advanced View
                                </button>
                                <button 
                                    onClick={() => setShowConflictSummary(false)}
                                    className="w-full py-2 text-gray-500 hover:text-gray-300 font-bold text-[10px] uppercase tracking-widest"
                                >
                                    Back
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Final Confirmation Modal */}
                {showFinalConfirmation && (
                    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/95 backdrop-blur-xl p-4">
                        <div className="bg-[#151515] border border-white/10 rounded-[2rem] shadow-[0_32px_120px_rgba(0,0,0,0.8)] max-w-md w-full max-h-full flex flex-col overflow-hidden animate-in fade-in zoom-in duration-500">
                            {/* Header and footer stay put; the list scrolls so the button is always reachable */}
                            <div className="p-6 pb-4 flex items-center gap-4 shrink-0">
                                <div className="p-3 bg-indigo-500/10 rounded-2xl border border-indigo-500/20 text-indigo-400 shrink-0">
                                    <Shield size={24} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-white tracking-tight">Confirm Sync Actions</h3>
                                    <p className="text-gray-400 text-xs mt-1 leading-relaxed">
                                        You are about to modify your {projectName || 'Project'} and SD card.
                                    </p>
                                </div>
                            </div>

                            <div className="px-6 pb-4 flex flex-col gap-2 overflow-y-auto min-h-0">
                                <div className="p-3.5 bg-white/[0.03] rounded-2xl border border-white/5 flex items-center justify-between group">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-indigo-500/20 rounded-xl text-indigo-400">
                                            <HardDrive size={16} />
                                        </div>
                                        <div>
                                            <p className="text-white text-[13px] font-bold">Push to SD</p>
                                            <p className="text-[10px] text-gray-500 mt-0.5 uppercase tracking-wider font-medium">Slots to overwrite</p>
                                        </div>
                                    </div>
                                    <span className="text-xl font-black text-white group-hover:text-indigo-400 transition-colors">{pushCount}</span>
                                </div>

                                <div className="p-3.5 bg-white/[0.03] rounded-2xl border border-white/5 flex items-center justify-between group">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-teal-500/20 rounded-xl text-teal-400">
                                            <Layers size={16} />
                                        </div>
                                        <div>
                                            <p className="text-white text-[13px] font-bold">Import to Pool</p>
                                            <p className="text-[10px] text-gray-500 mt-0.5 uppercase tracking-wider font-medium">
                                                {pooledRemovals.length > 0
                                                    ? `Displaced files preserved · ${pooledRemovals.length} rescued from the card`
                                                    : 'Displaced files preserved'}
                                            </p>
                                            {rescueBeforeClean && pooledRemovals.length > 0 && (
                                                <button
                                                    onClick={undoRescue}
                                                    className="text-[9px] font-black uppercase tracking-widest text-gray-600 hover:text-white transition-colors mt-1"
                                                >
                                                    Undo — let them go
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <span className="text-xl font-black text-white group-hover:text-teal-400 transition-colors">
                                        {rows.filter(r => r.toPool).length + pullCount}
                                    </span>
                                </div>

                                {movedRemovals.length > 0 && (
                                    <div className="p-3.5 bg-amber-500/5 rounded-2xl border border-amber-500/20 flex flex-col gap-3">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-amber-500/20 rounded-xl text-amber-400">
                                                    <ArrowRight size={16} />
                                                </div>
                                                <div>
                                                    <p className="text-white text-[13px] font-bold">
                                                        {movedRemovals.length} file{movedRemovals.length !== 1 ? 's' : ''} move{movedRemovals.length === 1 ? 's' : ''} to another slot
                                                    </p>
                                                    <p className="text-[10px] text-amber-500/70 mt-0.5 uppercase tracking-wider font-medium">
                                                        Same audio, new slot — the card keeps it
                                                    </p>
                                                </div>
                                            </div>
                                            <span className="text-xl font-black text-amber-400">{movedRemovals.length}</span>
                                        </div>
                                        <ul className="flex flex-col gap-1 pl-[2.75rem] -mt-1">
                                            {movedRemovals.map(r => (
                                                <li key={r.id} className="text-[11px] text-amber-200/80 font-medium flex items-center gap-2 min-w-0">
                                                    <span className="text-amber-500/50 font-black shrink-0">{r.slot}</span>
                                                    <span className="truncate">{r.hardwareName || 'Unnamed file'}</span>
                                                    <span className="ml-auto pl-2 shrink-0 font-black text-amber-400/80">
                                                        → {(cardMoves[r.id] ?? []).join(', ')}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {destroyedRemovals.length > 0 && (
                                    <div className="p-3.5 bg-red-500/5 rounded-2xl border border-red-500/20 flex flex-col gap-3">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-red-500/20 rounded-xl text-red-500">
                                                    <Trash2 size={16} />
                                                </div>
                                                <div>
                                                    <p className="text-white text-[13px] font-bold">
                                                        {destroyedRemovals.length} file{destroyedRemovals.length !== 1 ? 's' : ''} removed from the card
                                                    </p>
                                                    <p className="text-[10px] text-red-500/70 mt-0.5 uppercase tracking-wider font-medium">
                                                        Not kept in the pool — gone for good
                                                    </p>
                                                </div>
                                            </div>
                                            <span className="text-xl font-black text-red-500">{destroyedRemovals.length}</span>
                                        </div>
                                        <ul className="flex flex-col gap-1 pl-[2.75rem] -mt-1">
                                            {destroyedRemovals.map(r => (
                                                <li key={r.id} className="text-[11px] text-red-200/80 font-medium flex items-center gap-2 min-w-0">
                                                    <span className="text-red-500/50 font-black shrink-0">{r.slot}</span>
                                                    <span className="truncate">{r.hardwareName || 'Unnamed file'}</span>
                                                </li>
                                            ))}
                                        </ul>
                                        <button
                                            onClick={rescueDoomedToPool}
                                            className="ml-[2.75rem] w-fit flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-[10px] font-black uppercase tracking-widest transition-all shadow-lg hover:-translate-y-0.5"
                                        >
                                            <Archive size={12} /> Import them to the pool first
                                        </button>
                                    </div>
                                )}

                                {localDeleteCount > 0 && (
                                    <div className="p-3.5 bg-red-500/5 rounded-2xl border border-red-500/10 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-red-500/20 rounded-xl text-red-500">
                                                <Trash2 size={16} />
                                            </div>
                                            <div>
                                                <p className="text-white text-[13px] font-bold">Removed from the project</p>
                                                <p className="text-[10px] text-red-500/70 mt-0.5 uppercase tracking-wider font-medium">Slots to be cleared</p>
                                            </div>
                                        </div>
                                        <span className="text-xl font-black text-red-500">{localDeleteCount}</span>
                                    </div>
                                )}

                                {usbMode && (pushCount > 0 || pullCount > 0) && (() => {
                                    // Pushes: the project version's size, close to the hardware WAV for
                                    // a WAV source. Pulls: the card file's size from the listing.
                                    const bytes = rows.reduce((sum, r) => sum
                                        + (r.primary === 'push_to_sk' ? r.size : 0)
                                        + (r.primary === 'pull_to_slot' || r.toPool ? r.remoteSize : 0), 0);
                                    return (
                                        <div className="p-3.5 bg-amber-500/5 rounded-2xl border border-amber-500/20 flex items-center gap-3">
                                            <div className="p-2 bg-amber-500/20 rounded-xl text-amber-400">
                                                <Loader size={16} />
                                            </div>
                                            <div>
                                                <p className="text-white text-[13px] font-bold">About {formatDuration(bytes / USB_BYTES_PER_SECOND)} over USB</p>
                                                <p className="text-[10px] text-gray-500 mt-0.5 font-medium">
                                                    {(bytes / 1024 / 1024).toFixed(0)} MB at about 450 KB/s. Keep Spotykach connected until it finishes.
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })()}

                                {usbMode ? (
                                    <div className="p-3.5 rounded-2xl border border-white/5 flex items-center gap-3 opacity-60">
                                        <div className="p-2 rounded-xl bg-white/5 text-gray-600">
                                            <Shield size={16} />
                                        </div>
                                        <div>
                                            <p className="text-white text-[13px] font-bold">Snapshot card to project</p>
                                            <p className="text-[10px] text-gray-500 mt-0.5 uppercase tracking-wider font-medium">Needs the card reader</p>
                                        </div>
                                    </div>
                                ) : (
                                <button
                                    type="button"
                                    onClick={() => setSkSnapshot(v => !v)}
                                    className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 text-left transition-all ${skSnapshot
                                        ? 'bg-white/[0.03] border-amber-500/30'
                                        : 'bg-transparent border-white/5 hover:border-white/10'
                                        }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-xl transition-colors ${skSnapshot ? 'bg-amber-500/20 text-amber-400' : 'bg-white/5 text-gray-600'}`}>
                                            <Shield size={16} />
                                        </div>
                                        <div>
                                            <p className="text-white text-[13px] font-bold">Snapshot card to project</p>
                                            <p className="text-[10px] text-gray-500 mt-0.5 uppercase tracking-wider font-medium">
                                                {skSnapshot ? 'Copies the whole SK folder, slower' : 'Off, builds write only SK/'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className={`w-11 h-6 rounded-full p-0.5 shrink-0 transition-colors ${skSnapshot ? 'bg-amber-500' : 'bg-white/10'}`}>
                                        <div className={`w-5 h-5 rounded-full bg-white transition-transform ${skSnapshot ? 'translate-x-5' : 'translate-x-0'}`} />
                                    </div>
                                </button>
                                )}
                            </div>

                        <div className="p-6 pt-4 border-t border-white/5 flex flex-col gap-2 shrink-0">
                            <button
                                onClick={proceedWithConfirm}
                                className="w-full py-4 bg-white text-black hover:bg-indigo-50 hover:text-indigo-600 rounded-2xl font-black shadow-[0_12px_48px_rgba(255,255,255,0.15)] transition-all transform hover:-translate-y-0.5 active:translate-y-0 uppercase tracking-[0.2em] text-[12px]"
                            >
                                Proceed & Build
                            </button>
                            <button 
                                onClick={() => setShowFinalConfirmation(false)}
                                className="w-full py-2 text-gray-500 hover:text-white font-bold text-[10px] uppercase tracking-widest transition-colors"
                            >
                                Back to review
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    </div>
    );
};
