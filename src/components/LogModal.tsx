import { useState, useEffect } from 'react';
import { X, Trash2, Download, Terminal, Info, AlertTriangle, XCircle, Search, Clock, FileText } from 'lucide-react';
import { logger, type LogEntry, type LogLevel } from '../utils/logger';

interface LogModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const LogModal = ({ isOpen, onClose }: LogModalProps) => {
    const [logs, setLogs] = useState<LogEntry[]>(logger.getLogs());
    const [filter, setFilter] = useState<string>('');
    const [levelFilter, setLevelFilter] = useState<LogLevel | 'all'>('all');

    useEffect(() => {
        if (isOpen) {
            setLogs(logger.getLogs());
            return logger.subscribe((newLogs) => {
                setLogs(newLogs);
            });
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const filteredLogs = logs.filter(log => {
        const matchesText = log.message.toLowerCase().includes(filter.toLowerCase());
        const matchesLevel = levelFilter === 'all' || log.level === levelFilter;
        return matchesText && matchesLevel;
    });

    const formatTime = (ts: number) => {
        return new Date(ts).toLocaleTimeString('en-GB', { hour12: false });
    };

    const getLevelIcon = (level: LogLevel) => {
        switch (level) {
            case 'info': return <Info size={14} className="text-synthux-blue" />;
            case 'warn': return <AlertTriangle size={14} className="text-synthux-yellow" />;
            case 'error': return <XCircle size={14} className="text-red-500" />;
        }
    };

    const getLevelClass = (level: LogLevel) => {
        switch (level) {
            case 'info': return 'text-gray-300';
            case 'warn': return 'text-yellow-400';
            case 'error': return 'text-red-400';
        }
    };

    const handleDownload = () => {
        const logText = logs.map(l => `[${new Date(l.timestamp).toISOString()}] [${l.level.toUpperCase()}] ${l.message}`).join('\n');
        const blob = new Blob([logText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `spotykach_logs_${new Date().toISOString().split('T')[0]}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[1000] flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-200">
            <div className="bg-[#0f0f11] border border-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden relative">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 shrink-0 bg-black/40">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-500/10 rounded-lg">
                            <Terminal size={20} className="text-indigo-500" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white leading-tight">System Logs</h2>
                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">Application Activity Tracker</p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                         <button
                            onClick={() => {
                                logger.clearPersistentLogs();
                                setLogs([]);
                            }}
                            className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all group"
                            title="Clear Logs"
                        >
                            <Trash2 size={18} />
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Toolbar */}
                <div className="px-6 py-4 bg-black/20 border-b border-gray-800/50 flex flex-col md:flex-row gap-4 shrink-0">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                        <input
                            type="text"
                            placeholder="Search logs..."
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            className="w-full bg-white/5 border border-gray-700 rounded-lg py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                        />
                    </div>
                    
                    <div className="flex gap-2">
                        {(['all', 'info', 'warn', 'error'] as const).map(lvl => (
                            <button
                                key={lvl}
                                onClick={() => setLevelFilter(lvl)}
                                className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider border transition-all ${
                                    levelFilter === lvl 
                                    ? 'bg-indigo-500/20 border-indigo-500 text-indigo-400' 
                                    : 'bg-white/5 border-gray-700 text-gray-400 hover:border-gray-600'
                                }`}
                            >
                                {lvl}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Log List */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-black/40">
                    <div className="space-y-1 font-mono">
                        {filteredLogs.length > 0 ? filteredLogs.map((log, i) => (
                            <div key={log.timestamp + i} className="group flex items-start gap-4 py-1.5 px-3 rounded hover:bg-white/5 transition-colors border-l-2 border-transparent hover:border-indigo-500/30">
                                <span className="text-[11px] text-gray-600 shrink-0 font-bold tabular-nums flex items-center gap-1.5 min-w-[70px]">
                                    <Clock size={10} className="opacity-40" />
                                    {formatTime(log.timestamp)}
                                </span>
                                <div className="shrink-0 pt-0.5">
                                    {getLevelIcon(log.level)}
                                </div>
                                <span className={`text-xs leading-5 break-all ${getLevelClass(log.level)}`}>
                                    {log.message}
                                </span>
                            </div>
                        )) : (
                            <div className="h-full flex flex-col items-center justify-center py-20 text-gray-600 italic">
                                <FileText size={48} className="opacity-10 mb-4" />
                                <p>No logs found matching your criteria</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-800 shrink-0 bg-black/40 flex justify-between items-center">
                    <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                        Total Logs: {logs.length} | Filtered: {filteredLogs.length}
                    </div>
                    <div className="flex gap-4">
                        <button 
                            onClick={handleDownload}
                            className="text-xs text-gray-400 hover:text-white transition-colors flex items-center gap-2"
                        >
                            <Download size={14} />
                            <span>Export Session Logs (.txt)</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
