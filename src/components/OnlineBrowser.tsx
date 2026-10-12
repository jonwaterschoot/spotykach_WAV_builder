import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronRight, Download, ExternalLink, Globe, KeyRound, Loader, Pause, Pencil, Play, Search } from 'lucide-react';
import {
    PROVIDERS, PROVIDERS_BY_ID, DEFAULT_PROVIDERS, LICENSE_FILTERS, DEFAULT_LICENSE_FILTERS,
    RateLimitError, createBudget, dedupeKey,
    type LicenseFilter, type MaxLength, type OnlineHit, type OnlineProvider, type OnlineQuery, type ProviderId,
} from '../online';
import { MAX_BYTES, isTooBig, resolveHit, type PlayableHit } from '../online/playable';
import { appStorage } from '../utils/storageNamespace';

export type { PlayableHit };

/**
 * The Online source of the sample browser: one search over open audio archives
 * (src/online), listed like a pack's rows. Nothing is stored until a row is added;
 * then the host downloads it once, the same way it takes a pack sample.
 *
 * The browser owns the player and the import, so this only finds sounds and hands
 * them over with a playable URL. Plan: docs/sample_mangler/online-sources-plan.md.
 */

interface OnlineBrowserProps {
    playingKey: string | null;
    isPreviewPlaying: boolean;
    /** The row being added or edited right now. */
    busyKey: string | null;
    isAdded: (key: string) => boolean;
    /** The row to scroll to and glow, from the player's locate. */
    locatedKey: string | null;
    onLocatedSeen: () => void;
    addLabel: string;
    addedLabel: string;
    onPlay: (hit: PlayableHit) => void;
    onAdd: (hit: PlayableHit) => Promise<void>;
    onEdit?: (hit: PlayableHit) => Promise<void>;
    /**
     * Multi-select, owned by the browser so its bulk bar and drag serve online rows
     * the same as pack rows. `orderedKeys` is every selectable row in view, in order,
     * for shift-click ranges.
     */
    selectedKeys: Set<string>;
    onToggleSelect: (key: string, orderedKeys: string[], e: React.MouseEvent) => void;
    onSelectMany: (keys: string[], select: boolean) => void;
    /** Every selectable hit on screen, so the browser can import a selection by key. */
    onHitsShown: (hits: OnlineHit[]) => void;
    /** A new search: a selection of the old list's rows means nothing any more. */
    onNewSearch: () => void;
    /** Drag a row (or the selection) onto the host's pool; absent where there is no target. */
    dragProps?: (hit: OnlineHit) => {
        draggable: boolean;
        onDragStart: (e: React.DragEvent) => void;
        onDragEnd: () => void;
        title?: string;
    };
}

const LENGTHS: { value: MaxLength; label: string }[] = [
    { value: 30, label: '≤ 30 s' },
    { value: 120, label: '≤ 2 min' },
    { value: null, label: 'Any length' },
];

const SUGGESTIONS = ['rain', 'bell', 'field recording', 'machine', 'piano', 'voice', 'birds', 'metal', 'drone', 'radio'];

const KEY_STORE = 'wavbuilder_freesound_key';

/**
 * WAV Builder's own proxy (workers/online-proxy), which holds the shared Freesound
 * key. The URL is no secret (only the key is, and it stays in the Worker), so it is
 * built in like the R2 address. `VITE_ONLINE_PROXY_URL` overrides it, e.g. with
 * `http://localhost:8787` for `wrangler dev`, or with "off" to build without it.
 */
const DEFAULT_PROXY_URL = 'https://wavbuilder-online.jonwtr.workers.dev';
const PROXY_URL = (() => {
    const raw = import.meta.env.VITE_ONLINE_PROXY_URL ?? DEFAULT_PROXY_URL;
    return raw === 'off' ? '' : raw.replace(/\/+$/, '');
})();
const PREFS_STORE = 'wavbuilder_online_prefs';

const LICENSE_TONE: Record<LicenseFilter, string> = {
    pd: 'text-synthux-green border-synthux-green/40 bg-synthux-green/10',
    by: 'text-synthux-blue border-synthux-blue/40 bg-synthux-blue/10',
    'by-sa': 'text-violet-300 border-violet-400/40 bg-violet-500/10',
    nc: 'text-synthux-yellow border-synthux-yellow/40 bg-synthux-yellow/10',
};

interface Prefs { providers: ProviderId[]; licenses: LicenseFilter[]; maxSeconds: MaxLength }

const loadPrefs = (): Prefs => {
    const fallback: Prefs = { providers: DEFAULT_PROVIDERS, licenses: DEFAULT_LICENSE_FILTERS, maxSeconds: 120 };
    try {
        const p = JSON.parse(appStorage.getItem(PREFS_STORE) ?? 'null');
        if (!p) return fallback;
        const providers = (p.providers ?? []).filter((id: string) => id in PROVIDERS_BY_ID);
        const licenses = (p.licenses ?? []).filter((id: string) => LICENSE_FILTERS.some(l => l.id === id));
        return {
            providers: providers.length ? providers : fallback.providers,
            licenses: licenses.length ? licenses : fallback.licenses,
            maxSeconds: [30, 120, null].includes(p.maxSeconds) ? p.maxSeconds : fallback.maxSeconds,
        };
    } catch {
        return fallback;
    }
};

interface ProviderResults {
    hits: OnlineHit[];
    page: number;
    hasMore: boolean;
    total?: number;
    loading: boolean;
    error?: string;
}

interface Expansion { loading: boolean; files: OnlineHit[]; error?: string }

/**
 * The last search outlives the component: switching to a pack and back should not
 * spend another of Openverse's 200 daily requests to show the same list.
 */
const session: {
    query: OnlineQuery | null;
    text: string;
    results: Partial<Record<ProviderId, ProviderResults>>;
    expanded: Record<string, Expansion>;
} = { query: null, text: '', results: {}, expanded: {} };

const budget = createBudget({
    getItem: k => appStorage.getItem(k),
    setItem: (k, v) => appStorage.setItem(k, v),
});

const formatDuration = (sec?: number) => {
    if (!sec || !Number.isFinite(sec)) return null;
    const s = Math.round(sec);
    return s >= 3600
        ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
        : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const formatBytes = (n?: number) =>
    !n ? null : n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(n >= 10 * 1024 * 1024 ? 0 : 1)} MB` : `${Math.ceil(n / 1024)} kB`;

export const OnlineBrowser = ({
    playingKey, isPreviewPlaying, busyKey, isAdded, locatedKey, onLocatedSeen,
    addLabel, addedLabel, onPlay, onAdd, onEdit,
    selectedKeys, onToggleSelect, onSelectMany, onHitsShown, onNewSearch, dragProps,
}: OnlineBrowserProps) => {
    const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
    const [text, setText] = useState(session.text);
    const [results, setResults] = useState(session.results);
    const [expanded, setExpanded] = useState(session.expanded);
    const [query, setQuery] = useState<OnlineQuery | null>(session.query);
    const [apiKey, setApiKey] = useState(() => appStorage.getItem(KEY_STORE) ?? '');
    const [keyDraft, setKeyDraft] = useState('');
    const [showKeyField, setShowKeyField] = useState(false);
    const [rowError, setRowError] = useState<{ key: string; message: string } | null>(null);
    /** Re-render once a minute so "N left" and waits stay current. */
    const [, setTick] = useState(0);
    const aborts = useRef<Partial<Record<ProviderId, AbortController>>>({});

    useEffect(() => { session.results = results; }, [results]);
    useEffect(() => { session.expanded = expanded; }, [expanded]);
    useEffect(() => { session.query = query; session.text = text; }, [query, text]);
    useEffect(() => { appStorage.setItem(PREFS_STORE, JSON.stringify(prefs)); }, [prefs]);
    useEffect(() => {
        const id = window.setInterval(() => setTick(t => t + 1), 30_000);
        const pending = aborts.current;
        return () => {
            window.clearInterval(id);
            Object.values(pending).forEach(c => c?.abort());
        };
    }, []);

    /** How a provider would be reached now: free, the user's key, the shared key, or not at all. */
    const access = (p: OnlineProvider): 'open' | 'own-key' | 'shared' | 'none' =>
        !p.needsKey ? 'open' : apiKey ? 'own-key' : p.proxyable && PROXY_URL ? 'shared' : 'none';
    /** The budget a provider spends from: the shared key's is a smaller, separate one. */
    const budgetFor = (p: OnlineProvider) =>
        access(p) === 'shared' && p.sharedLimits
            ? { id: `${p.id}-shared`, limits: p.sharedLimits }
            : { id: p.id, limits: p.limits };

    const activeProviders = PROVIDERS.filter(p => prefs.providers.includes(p.id) && access(p) !== 'none');

    const runProvider = async (id: ProviderId, q: OnlineQuery, page: number) => {
        const provider = PROVIDERS_BY_ID[id];
        const spend = budgetFor(provider);
        const wait = budget.take(spend.id, spend.limits).waitSec;
        if (wait > 0) {
            setResults(prev => ({
                ...prev,
                [id]: { ...(prev[id] ?? { hits: [], page: 0, hasMore: false }), loading: false,
                    error: `Request limit for ${provider.label} reached in this browser. Try again in ${wait >= 120 ? `${Math.ceil(wait / 60)} min` : `${wait} s`}.` },
            }));
            return;
        }
        aborts.current[id]?.abort();
        const controller = new AbortController();
        aborts.current[id] = controller;
        setResults(prev => ({
            ...prev,
            [id]: page === 1
                ? { hits: [], page: 0, hasMore: false, loading: true }
                : { ...(prev[id] as ProviderResults), loading: true, error: undefined },
        }));
        try {
            const res = await provider.search(q, page, {
                signal: controller.signal,
                apiKey: apiKey || undefined,
                proxyUrl: PROXY_URL || undefined,
            });
            setResults(prev => {
                const before = page === 1 ? [] : prev[id]?.hits ?? [];
                const seen = new Set(before.map(h => h.key));
                return {
                    ...prev,
                    [id]: { hits: [...before, ...res.hits.filter(h => !seen.has(h.key))], page, hasMore: res.hasMore, total: res.total, loading: false },
                };
            });
        } catch (e) {
            if (controller.signal.aborted) return;
            if (e instanceof RateLimitError) budget.exhaustMinute(spend.id, spend.limits);
            const message = e instanceof Error ? e.message : String(e);
            setResults(prev => ({
                ...prev,
                [id]: { ...(prev[id] ?? { hits: [], page: 0, hasMore: false }), loading: false, error: message },
            }));
        }
    };

    const search = (raw: string) => {
        const t = raw.trim();
        if (!t) return;
        const q: OnlineQuery = { text: t, licenses: prefs.licenses, maxSeconds: prefs.maxSeconds };
        setText(t);
        setQuery(q);
        setResults({});
        setExpanded({});
        setRowError(null);
        onNewSearch();
        activeProviders.forEach(p => runProvider(p.id, q, 1));
    };

    const toggleExpand = async (hit: OnlineHit) => {
        if (expanded[hit.key]) {
            setExpanded(prev => { const next = { ...prev }; delete next[hit.key]; return next; });
            return;
        }
        const provider = PROVIDERS_BY_ID[hit.provider];
        if (!provider.expand) return;
        setExpanded(prev => ({ ...prev, [hit.key]: { loading: true, files: [] } }));
        try {
            const files = await provider.expand(hit, {});
            const kept = query?.maxSeconds ? files.filter(f => !f.durationSec || f.durationSec <= query.maxSeconds! * 1.05) : files;
            setExpanded(prev => ({
                ...prev,
                [hit.key]: {
                    loading: false,
                    files: kept,
                    error: files.length === 0
                        ? 'No playable audio files in this item.'
                        : kept.length === 0 ? 'Every track is longer than the length filter.' : undefined,
                },
            }));
        } catch (e) {
            setExpanded(prev => ({ ...prev, [hit.key]: { loading: false, files: [], error: e instanceof Error ? e.message : String(e) } }));
        }
    };

    const withResolved = async (hit: OnlineHit, act: (h: PlayableHit) => void | Promise<void>, checkSize: boolean) => {
        setRowError(null);
        try {
            const playable = await resolveHit(hit);
            if (!playable) {
                setRowError({ key: hit.key, message: 'No playable file found for this one.' });
                return;
            }
            if (checkSize && isTooBig(playable)) {
                setRowError({ key: hit.key, message: `${formatBytes(playable.bytes)} is too big to bring in (limit ${formatBytes(MAX_BYTES)}). Preview it, or pick a shorter track.` });
                return;
            }
            await act(playable);
        } catch (e) {
            console.error('Online source:', e);
            setRowError({ key: hit.key, message: e instanceof Error ? `Could not get it: ${e.message}` : 'Could not get it.' });
        }
    };

    /** Openverse indexes Freesound and Commons; drop what an earlier list already shows. */
    const visible = useMemo(() => {
        const seen = new Set<string>();
        const out: Partial<Record<ProviderId, OnlineHit[]>> = {};
        for (const p of PROVIDERS) {
            const r = results[p.id];
            if (!r) continue;
            out[p.id] = r.hits.filter(h => {
                const k = dedupeKey(h);
                if (!k) return true;
                if (seen.has(k)) return false;
                seen.add(k);
                return true;
            });
        }
        return out;
    }, [results]);

    /**
     * What can be ticked, per archive, in screen order: every row with a file of its
     * own or one it resolves to, and an open Archive item's tracks right under it.
     * The item itself is a folder, not a sound, so it has no box.
     */
    const selectable = useMemo(() => {
        const out: Partial<Record<ProviderId, OnlineHit[]>> = {};
        for (const p of PROVIDERS) {
            const hits = visible[p.id];
            if (!hits) continue;
            out[p.id] = hits.flatMap(h => (h.expandable ? expanded[h.key]?.files ?? [] : [h]));
        }
        return out;
    }, [visible, expanded]);

    const orderedKeys = useMemo(
        () => PROVIDERS.flatMap(p => (selectable[p.id] ?? []).map(h => h.key)),
        [selectable],
    );

    useEffect(() => {
        onHitsShown(PROVIDERS.flatMap(p => selectable[p.id] ?? []));
    }, [selectable, onHitsShown]);

    const toggleIn = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter(x => x !== v) : [...list, v]);

    const saveKey = () => {
        const k = keyDraft.trim();
        appStorage.setItem(KEY_STORE, k);
        setApiKey(k);
        setKeyDraft('');
        setShowKeyField(false);
        if (k && !prefs.providers.includes('freesound')) setPrefs(p => ({ ...p, providers: [...p.providers, 'freesound'] }));
    };
    const forgetKey = () => {
        appStorage.removeItem(KEY_STORE);
        setApiKey('');
    };

    /** The chips changed under a live search: the list on screen no longer matches them. */
    const stale = !!query && (
        query.maxSeconds !== prefs.maxSeconds
        || query.licenses.length !== prefs.licenses.length
        || query.licenses.some(l => !prefs.licenses.includes(l))
    );

    const renderRow = (hit: OnlineHit, nested = false) => {
        const isPlaying = playingKey === hit.key;
        const busy = busyKey === hit.key;
        const added = isAdded(hit.key);
        const located = locatedKey === hit.key;
        const exp = expanded[hit.key];
        const canSelect = !hit.expandable;
        const isSelected = canSelect && selectedKeys.has(hit.key);
        const drag = canSelect ? dragProps?.(hit) : undefined;
        const meta = [
            hit.author,
            formatDuration(hit.durationSec),
            hit.format && hit.bitrateKbps ? `${hit.format} ${hit.bitrateKbps} kbps` : hit.format,
            hit.expandable ? null : formatBytes(hit.bytes),
            hit.via ? `via ${hit.via}` : null,
            hit.morePackSounds ? `+${hit.morePackSounds} more in its pack` : null,
        ].filter(Boolean);
        return (
            <div key={hit.key}>
                <div
                    data-sample-path={hit.key}
                    {...drag}
                    // Same as a pack row: a click anywhere but a button ticks it.
                    onClick={(e) => {
                        if (located) onLocatedSeen();
                        if (canSelect) onToggleSelect(hit.key, orderedKeys, e);
                        else toggleExpand(hit);
                    }}
                    className={`grid grid-cols-[22px_32px_1fr_auto] sm:grid-cols-[30px_40px_1fr_auto] gap-2 sm:gap-3 items-center px-2 sm:px-4 py-2 hover:bg-gray-800/80 transition-all group border rounded-md cursor-pointer
                        ${nested ? 'pl-6 sm:pl-10' : ''} ${located || isSelected ? 'border-synthux-orange bg-synthux-orange/10 relative z-10' : 'border-transparent'}`}
                    style={located ? { animation: 'locatePulse 2s ease-in-out infinite' } : undefined}
                >
                    <div className="flex items-center justify-center">
                        {canSelect && (
                            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${isSelected ? 'bg-synthux-orange border-synthux-orange shadow-[0_0_8px_rgba(249,115,22,0.3)]' : 'bg-black/40 border-gray-700 group-hover:border-gray-500'}`}>
                                {isSelected && <Check size={10} className="text-black stroke-[3]" />}
                            </div>
                        )}
                    </div>

                    <button
                        onClick={(e) => { e.stopPropagation(); withResolved(hit, onPlay, false); }}
                        className={`w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-full transition-all ${isPlaying && isPreviewPlaying ? 'text-black bg-synthux-yellow scale-110 shadow-lg' : 'text-gray-400 hover:text-white bg-black hover:bg-gray-700 border border-gray-700'}`}
                        title={hit.expandable ? 'Preview the first track' : 'Preview'}
                    >
                        {isPlaying && isPreviewPlaying ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" className="ml-0.5" />}
                    </button>

                    <div className="min-w-0 font-mono">
                        <div className="flex items-center gap-2 min-w-0">
                            {hit.expandable && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); toggleExpand(hit); }}
                                    className="shrink-0 p-0.5 -ml-1 text-gray-500 hover:text-white rounded"
                                    title={exp ? 'Hide the tracks' : 'Show the tracks in this item'}
                                >
                                    {exp?.loading ? <Loader size={14} className="animate-spin" /> : exp ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </button>
                            )}
                            <span className="truncate text-sm font-bold text-gray-300 group-hover:text-white">{hit.title}</span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-gray-500 min-w-0">
                            <span
                                className={`shrink-0 px-1.5 py-px rounded border font-bold ${LICENSE_TONE[hit.license.filter]}`}
                                title={hit.provider === 'archive' ? `${hit.license.label}, as stated by the uploader` : hit.license.label}
                            >
                                {hit.license.label}
                            </span>
                            <span className="truncate">{meta.join(' · ')}</span>
                        </div>
                        {rowError?.key === hit.key && (
                            <div className="mt-1 text-[11px] text-red-400 font-body">{rowError.message}</div>
                        )}
                    </div>

                    <div className="flex items-center justify-end gap-1">
                        <a
                            href={hit.pageUrl}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="p-1.5 text-gray-500 hover:text-white hover:bg-white/10 rounded transition-colors"
                            title="Open its page (author, license, description)"
                        >
                            <ExternalLink size={14} />
                        </a>
                        {!hit.expandable && onEdit && (
                            <button
                                onClick={(e) => { e.stopPropagation(); withResolved(hit, onEdit, true); }}
                                disabled={busy}
                                className="flex items-center gap-1.5 px-2 py-1.5 rounded text-xs font-bold text-gray-400 hover:text-synthux-yellow hover:bg-synthux-yellow/10 transition-all disabled:opacity-70"
                                title="Edit this file. It goes into the temporary pool and opens in the editor"
                            >
                                <Pencil size={14} />
                                <span className="hidden sm:inline">Edit</span>
                            </button>
                        )}
                        {!hit.expandable && (
                            <button
                                onClick={(e) => { e.stopPropagation(); withResolved(hit, onAdd, true); }}
                                disabled={busy}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold transition-all shadow-sm ${busy ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:scale-[1.02] active:scale-95'} ${added
                                    ? 'bg-synthux-yellow hover:bg-yellow-400 text-black border border-synthux-yellow'
                                    : 'bg-synthux-blue/20 hover:bg-synthux-blue hover:text-black text-synthux-blue border border-synthux-blue/50'}`}
                            >
                                {busy ? <><Loader size={12} className="animate-spin" /> Adding</>
                                    : added ? <><Check size={14} /><span className="hidden sm:inline">{addedLabel}</span></>
                                        : <><Download size={14} /><span className="sm:hidden">Add</span><span className="hidden sm:inline">{addLabel}</span></>}
                            </button>
                        )}
                    </div>
                </div>
                {exp && !exp.loading && (
                    <div className="border-l border-gray-800 ml-6 sm:ml-8">
                        {exp.error && <div className="px-4 py-2 text-[11px] text-gray-500 italic">{exp.error}</div>}
                        {exp.files.map(f => renderRow(f, true))}
                    </div>
                )}
            </div>
        );
    };

    const anyResults = Object.keys(results).length > 0;

    return (
        <div className="pb-20">
            {/* Header and search */}
            <div className="mb-6 rounded-xl sm:rounded-2xl border border-white/5 bg-gradient-to-br from-synthux-blue/15 via-black/40 to-synthux-green/10 p-4 sm:p-6">
                <div className="flex items-center gap-2 mb-1">
                    <Globe size={18} className="text-synthux-blue" />
                    <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">Online sources</h1>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed max-w-3xl mb-4">
                    Search open audio archives without leaving the app. Previews stream from the archive;
                    adding a sound downloads it once, with its license and author kept alongside it.
                </p>

                <form
                    onSubmit={(e) => { e.preventDefault(); search(text); }}
                    className="flex gap-2 max-w-3xl"
                >
                    <div className="relative flex-1">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                        <input
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            placeholder="rain on metal, church bell, typewriter…"
                            className="w-full bg-black/50 border border-gray-700 focus:border-synthux-blue rounded-lg pl-9 pr-3 py-2 text-sm text-gray-100 outline-none"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={!text.trim() || activeProviders.length === 0}
                        className="px-4 py-2 rounded-lg bg-synthux-blue text-black text-sm font-bold hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        Search
                    </button>
                </form>

                {/* Filters */}
                <div className="mt-4 flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest w-16">License</span>
                        {LICENSE_FILTERS.map(l => {
                            const on = prefs.licenses.includes(l.id);
                            return (
                                <button
                                    key={l.id}
                                    title={l.title}
                                    onClick={() => setPrefs(p => {
                                        const next = toggleIn(p.licenses, l.id);
                                        return { ...p, licenses: next.length ? next : p.licenses };
                                    })}
                                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors ${on ? LICENSE_TONE[l.id] : 'bg-black/40 border-gray-700 text-gray-500 hover:text-gray-300'}`}
                                >
                                    {l.label}
                                </button>
                            );
                        })}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest w-16">Length</span>
                        {LENGTHS.map(l => (
                            <button
                                key={String(l.value)}
                                onClick={() => setPrefs(p => ({ ...p, maxSeconds: l.value }))}
                                className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors ${prefs.maxSeconds === l.value
                                    ? 'bg-white/10 border-white/30 text-white'
                                    : 'bg-black/40 border-gray-700 text-gray-500 hover:text-gray-300'}`}
                            >
                                {l.label}
                            </button>
                        ))}
                    </div>
                    {stale && (
                        <button
                            onClick={() => search(query!.text)}
                            className="self-start text-[11px] text-synthux-blue hover:underline"
                        >
                            Filters changed. Search “{query!.text}” again with them
                        </button>
                    )}
                </div>

                {/* Archives */}
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-1.5">
                    {PROVIDERS.map(p => {
                        const how = access(p);
                        const on = prefs.providers.includes(p.id) && how !== 'none';
                        const spend = budgetFor(p);
                        const left = spend.limits.perDay - budget.state(spend.id, spend.limits).usedDay;
                        // A count is worth showing where the cap is real and small enough to meet.
                        const showLeft = on && (p.id === 'openverse' || p.needsKey);
                        const keyOffer = p.needsKey && how !== 'own-key';
                        return (
                            <div key={p.id} className={`rounded-lg border px-3 py-2 transition-colors ${on ? 'border-white/15 bg-white/5' : 'border-gray-800 bg-black/30'}`}>
                                <label className={`flex items-center gap-2 ${how === 'none' ? 'cursor-default' : 'cursor-pointer'}`}>
                                    <input
                                        type="checkbox"
                                        checked={on}
                                        disabled={how === 'none'}
                                        onChange={() => setPrefs(prev => ({ ...prev, providers: toggleIn(prev.providers, p.id) }))}
                                        className="accent-synthux-blue"
                                    />
                                    <span className={`text-xs font-bold ${on ? 'text-gray-200' : 'text-gray-500'}`}>{p.label}</span>
                                    {how === 'shared' && <span className="text-[9px] text-gray-500">shared key</span>}
                                    {how === 'own-key' && <span className="text-[9px] text-synthux-green">your key</span>}
                                    {showLeft && (
                                        <span className="ml-auto text-[9px] font-mono text-gray-500" title={p.limitNote}>
                                            {left} left today
                                        </span>
                                    )}
                                </label>
                                <p className="text-[10px] text-gray-500 leading-snug mt-0.5 pl-5">{p.blurb}</p>
                                <p className="text-[10px] text-gray-600 leading-snug mt-1 pl-5">
                                    <span className="text-gray-500">Audio:</span> {p.quality}
                                </p>
                                <p className="text-[10px] text-gray-600 leading-snug pl-5">
                                    <span className="text-gray-500">Limits:</span> {p.limitNote}
                                </p>
                                {how === 'own-key' && (
                                    <button onClick={forgetKey} className="mt-1 ml-5 text-[10px] text-gray-500 hover:text-red-400" title="Remove your key from this browser">
                                        Forget my key{PROXY_URL ? ' (back to the shared key)' : ''}
                                    </button>
                                )}
                                {keyOffer && !showKeyField && (
                                    <button
                                        onClick={() => setShowKeyField(true)}
                                        className="mt-1 ml-5 inline-flex items-center gap-1 text-[10px] text-synthux-blue hover:underline"
                                    >
                                        <KeyRound size={10} /> {how === 'shared' ? 'Use your own key for more' : 'Add your API key'}
                                    </button>
                                )}
                                {keyOffer && showKeyField && (
                                    <div className="mt-1.5 pl-5">
                                        <div className="flex gap-1">
                                            <input
                                                value={keyDraft}
                                                onChange={(e) => setKeyDraft(e.target.value)}
                                                onKeyDown={(e) => { if (e.key === 'Enter') saveKey(); }}
                                                placeholder="Paste your key"
                                                className="flex-1 min-w-0 bg-black/50 border border-gray-700 rounded px-2 py-1 text-[11px] font-mono text-gray-200"
                                            />
                                            <button onClick={saveKey} disabled={!keyDraft.trim()} className="px-2 rounded bg-synthux-blue text-black text-[11px] font-bold disabled:opacity-40">
                                                Save
                                            </button>
                                        </div>
                                        <p className="text-[10px] text-gray-500 leading-snug mt-1">
                                            Free, needs a Freesound account:{' '}
                                            <a href="https://freesound.org/apiv2/apply" target="_blank" rel="noreferrer" className="text-synthux-blue hover:underline">freesound.org/apiv2/apply</a>.
                                            Name it (e.g. “WAV Builder”), leave the callback URL empty, describe it in a line, accept
                                            the terms. Copy the “Client secret/Api key” column. Kept in this browser only.
                                        </p>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Before the first search */}
            {!anyResults && (
                <div className="px-2">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] mb-3">Try</p>
                    <div className="flex flex-wrap gap-2">
                        {SUGGESTIONS.map(s => (
                            <button
                                key={s}
                                onClick={() => search(s)}
                                disabled={activeProviders.length === 0}
                                className="px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-xs text-gray-300 hover:text-white hover:border-white/30 disabled:opacity-40"
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                    {activeProviders.length === 0 && (
                        <p className="mt-3 text-xs text-gray-500">Switch on at least one archive above.</p>
                    )}
                </div>
            )}

            {/* Results, one section per archive */}
            <div className="space-y-6">
                {query && PROVIDERS.filter(p => results[p.id]).map(p => {
                    const r = results[p.id]!;
                    const hits = visible[p.id] ?? [];
                    const hidden = r.hits.length - hits.length;
                    const keys = (selectable[p.id] ?? []).map(h => h.key);
                    const picked = keys.filter(k => selectedKeys.has(k)).length;
                    const allPicked = keys.length > 0 && picked === keys.length;
                    return (
                        <div key={p.id} className="bg-black/20 rounded-lg overflow-hidden border border-white/5">
                            <h3 className="sticky top-0 z-20 bg-[#151515] text-[10px] font-bold text-gray-400 uppercase tracking-widest py-2 px-4 shadow-sm border-b border-gray-800 flex items-center justify-between gap-2">
                                <span className="flex items-center gap-2">
                                    {p.label}
                                    {r.loading && <Loader size={11} className="animate-spin text-synthux-blue" />}
                                </span>
                                <span className="flex items-center gap-2">
                                    <span className="text-[9px] opacity-50 font-mono lowercase">
                                        {hits.length} shown
                                        {typeof r.total === 'number' && ` of ${r.total.toLocaleString()} found`}
                                        {hidden > 0 && ` · ${hidden} already listed above`}
                                    </span>
                                    {keys.length > 0 && (
                                        <button
                                            onClick={() => onSelectMany(keys, !allPicked)}
                                            title={p.id === 'archive' ? 'Ticks the tracks of the items you have opened' : undefined}
                                            className={`flex items-center gap-1.5 px-2 py-0.5 rounded transition-all border ${allPicked
                                                ? 'bg-synthux-orange/20 border-synthux-orange/40 text-synthux-orange'
                                                : 'bg-black/40 border-white/10 text-gray-500 hover:text-gray-300'}`}
                                        >
                                            <span className={`w-3 h-3 rounded-[3px] border flex items-center justify-center transition-colors ${allPicked ? 'bg-synthux-orange border-synthux-orange' : 'bg-black/60 border-gray-700'}`}>
                                                {allPicked ? <Check size={8} className="text-black stroke-[4]" /> : picked > 0 ? <span className="w-1.5 h-0.5 bg-gray-500 rounded-full" /> : null}
                                            </span>
                                            <span className="uppercase tracking-widest text-[8px]">{allPicked ? 'Deselect all' : 'Select all'}</span>
                                        </button>
                                    )}
                                </span>
                            </h3>
                            {r.error && (
                                <div className="px-4 py-3 text-xs text-red-400 flex items-start gap-2">
                                    <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {r.error}
                                </div>
                            )}
                            {!r.loading && !r.error && hits.length === 0 && (
                                <div className="px-4 py-3 text-xs text-gray-500 italic">
                                    Nothing here with these filters.
                                    {p.id === 'nasa' && !prefs.licenses.includes('pd') && ' NASA audio is all public domain: switch on CC0 / PD.'}
                                </div>
                            )}
                            <div className="divide-y divide-gray-800/50">
                                {hits.map(h => renderRow(h))}
                            </div>
                            {r.hasMore && !r.loading && (
                                <button
                                    onClick={() => runProvider(p.id, query, r.page + 1)}
                                    className="w-full py-2 text-[11px] font-bold text-gray-400 hover:text-white hover:bg-white/5 border-t border-gray-800"
                                >
                                    More from {p.label}
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
