import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Check, CheckCircle, Loader, Minus, Terminal, Trash2, X, XCircle } from 'lucide-react';
import { jobBytes, jobSecondsLeft } from '../session/transferJob';
import type { TransferItem, TransferJob } from '../session/transferJob';

interface TransferProgressModalProps {
    job: TransferJob;
    onCancel: () => void;
    onClose: () => void;
}

const TAPE_HEX: Record<string, string> = {
    Blue: '#3b82f6', Green: '#22c55e', Pink: '#ec4899', Red: '#ef4444', Turquoise: '#06b6d4', Yellow: '#eab308',
};

const formatBytes = (n: number) => n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

const formatTime = (seconds: number) => {
    const s = Math.max(0, Math.round(seconds));
    return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
};

const clock = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

const slotLabel = (slot: string) => {
    const m = slot.match(/^([A-Za-z]+)(\d+)$/);
    return m ? { color: m[1], text: `${m[1]} ${m[2]}` } : { color: '', text: slot };
};

const StatusCell = ({ item }: { item: TransferItem }) => {
    switch (item.status) {
        case 'active':
            return <span className="text-white">{item.direction === 'delete' ? 'deleting' : `${Math.round(item.fraction * 100)}%`}</span>;
        case 'done':
            return <span className="text-green-400 flex items-center gap-1 justify-end"><Check size={11} /> {item.direction === 'delete' ? 'deleted' : 'done'}</span>;
        case 'skipped':
            return <span className="text-gray-500">already there</span>;
        case 'failed':
            return <span className="text-red-400">failed</span>;
        case 'cancelled':
            return <span className="text-gray-500">not run</span>;
        default:
            return <span className="text-gray-600">queued</span>;
    }
};

/**
 * A sync run between the project and the card: overall progress with time left,
 * every slot with its state, and a log. Cancel stops between slots, and over USB
 * also mid-transfer (the slot keeps its old file).
 */
export const TransferProgressModal = ({ job, onCancel, onClose }: TransferProgressModalProps) => {
    const [now, setNow] = useState(() => Date.now());
    const [cancelling, setCancelling] = useState(false);
    const logEnd = useRef<HTMLDivElement>(null);
    const running = job.finishedAt === undefined;

    useEffect(() => {
        if (!running) return;
        const timer = setInterval(() => setNow(Date.now()), 500);
        return () => clearInterval(timer);
    }, [running]);

    useEffect(() => {
        logEnd.current?.scrollIntoView({ block: 'nearest' });
    }, [job.log.length]);

    const { done, total } = jobBytes(job);
    const fraction = total ? done / total : (running ? 0 : 1);
    const elapsed = ((job.finishedAt ?? now) - job.startedAt) / 1000;
    const left = running ? jobSecondsLeft(job, now) : null;
    const transfers = job.items.filter(i => i.direction !== 'delete');
    const finished = transfers.filter(i => i.status === 'done' || i.status === 'skipped').length;

    const title = running
        ? (cancelling ? 'Cancelling…' : job.title)
        : job.cancelled ? 'Cancelled' : job.error ? 'Sync failed' : 'Sync complete';

    return (
        <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div role="dialog" aria-labelledby="transfer-title"
                className="bg-[#121212] w-full max-w-2xl rounded-2xl border border-white/10 shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">

                <div className="flex items-center gap-3 px-6 py-5 border-b border-white/10 bg-[#1a1a1a]">
                    {running
                        ? <Loader size={20} className="text-orange-400 animate-spin" />
                        : job.error ? <XCircle size={20} className="text-red-400" />
                            : job.cancelled ? <XCircle size={20} className="text-gray-400" />
                                : <CheckCircle size={20} className="text-green-400" />}
                    <h2 id="transfer-title" className="text-lg font-bold text-white flex-1">{title}</h2>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                        {job.route === 'usb' ? 'USB' : 'Card reader'}
                    </span>
                </div>

                <div className="px-6 pt-5 pb-4 flex flex-col gap-2">
                    <div className="h-2.5 bg-white/5 rounded-full overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fraction * 100)}>
                        <div className={`h-full transition-all duration-300 ease-out ${job.error ? 'bg-red-500' : running ? 'bg-orange-500' : 'bg-green-500'}`}
                            style={{ width: `${Math.round(fraction * 100)}%` }} />
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-mono text-gray-400">
                        <span>{finished} of {transfers.length} slots · {formatBytes(done)} of {formatBytes(total)}</span>
                        <span>
                            {running
                                ? (left === null ? 'estimating…' : `about ${formatTime(left)} left`)
                                : `took ${formatTime(elapsed)}`}
                        </span>
                    </div>
                    {job.error && <p className="text-sm text-red-400 mt-1">{job.error}</p>}
                </div>

                <div className="px-6 pb-4 overflow-y-auto min-h-0 flex-shrink">
                    <div className="rounded-lg border border-white/5 divide-y divide-white/5">
                        {job.items.map(item => {
                            const { color, text } = slotLabel(item.slot);
                            return (
                                <div key={`${item.direction}${item.slot}`}
                                    className={`grid grid-cols-[18px_80px_1fr_70px_80px] items-center gap-2 px-3 py-1.5 text-[11px] font-mono ${item.status === 'active' ? 'bg-white/[0.04]' : ''}`}>
                                    <span className="text-gray-500" title={item.direction === 'up' ? 'To the card' : item.direction === 'down' ? 'From the card' : 'Removed from the card'}>
                                        {item.direction === 'up' ? <ArrowUp size={12} /> : item.direction === 'down' ? <ArrowDown size={12} /> : <Trash2 size={12} />}
                                    </span>
                                    <span className="font-bold" style={{ color: TAPE_HEX[color] ?? '#aaa' }}>{text}</span>
                                    <span className="text-gray-300 truncate" title={item.name}>{item.name}</span>
                                    <span className="text-gray-500 text-right">{item.direction === 'delete' ? <Minus size={10} className="inline" /> : formatBytes(item.bytes)}</span>
                                    <span className="text-right"><StatusCell item={item} /></span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="mx-6 mb-4 bg-black/60 border border-white/5 rounded-lg p-3 h-36 overflow-y-auto font-mono text-[11px] shrink-0">
                    <div className="flex items-center gap-2 text-gray-600 mb-1.5"><Terminal size={11} /> Log</div>
                    {job.log.map((line, i) => (
                        <div key={i} className={line.tone === 'error' ? 'text-red-400' : line.tone === 'warn' ? 'text-amber-400' : line.tone === 'ok' ? 'text-green-400' : 'text-gray-400'}>
                            <span className="text-gray-600">{clock(line.at)}</span>  {line.text}
                        </div>
                    ))}
                    <div ref={logEnd} />
                </div>

                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10 bg-[#1a1a1a]">
                    {running ? (
                        <button
                            onClick={() => { setCancelling(true); onCancel(); }}
                            disabled={cancelling}
                            className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition-colors font-medium disabled:opacity-40"
                        >
                            <X size={14} /> {cancelling ? 'Stopping after this step…' : 'Cancel'}
                        </button>
                    ) : (
                        <button onClick={onClose}
                            className="px-6 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white font-bold transition-colors">
                            Close
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
