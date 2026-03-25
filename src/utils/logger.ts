type LogLevel = 'info' | 'warn' | 'error';

interface LogEntry {
    timestamp: number;
    level: LogLevel;
    message: string;
}

class Logger {
    private logs: LogEntry[] = [];
    private maxLogs = 1000;
    private listeners: ((logs: LogEntry[]) => void)[] = [];
    private workHandle: FileSystemDirectoryHandle | null = null;
    private logFile: string = 'logs.txt';

    setWorkHandle(handle: FileSystemDirectoryHandle | null) {
        this.workHandle = handle;
    }

    private async addLog(level: LogLevel, message: string) {
        const entry: LogEntry = {
            timestamp: Date.now(),
            level,
            message
        };

        this.logs.unshift(entry);
        if (this.logs.length > this.maxLogs) {
            this.logs.pop();
        }

        this.notifyListeners();
        this.persistLog(entry);
    }

    info(message: string) {
        this.addLog('info', message);
        console.log(`[INFO] ${message}`);
    }

    warn(message: string) {
        this.addLog('warn', message);
        console.warn(`[WARN] ${message}`);
    }

    error(message: string) {
        this.addLog('error', message);
        console.error(`[ERROR] ${message}`);
    }

    getLogs() {
        return [...this.logs];
    }

    subscribe(listener: (logs: LogEntry[]) => void) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    private notifyListeners() {
        this.listeners.forEach(l => l(this.getLogs()));
    }

    private async persistLog(entry: LogEntry) {
        if (!this.workHandle) return;

        try {
            const dateStr = new Date(entry.timestamp).toISOString();
            const logLine = `[${dateStr}] [${entry.level.toUpperCase()}] ${entry.message}\n`;
            
            const fileHandle = await this.workHandle.getFileHandle(this.logFile, { create: true });
            const file = await fileHandle.getFile();
            const existingContent = await file.text();
            
            const writable = await (fileHandle as any).createWritable();
            await writable.write(existingContent + logLine);
            await writable.close();
        } catch (e) {
            console.error('Failed to persist log:', e);
        }
    }

    async clearPersistentLogs() {
        if (!this.workHandle) return;
        try {
            const fileHandle = await this.workHandle.getFileHandle(this.logFile, { create: true });
            const writable = await (fileHandle as any).createWritable();
            await writable.write('');
            await writable.close();
        } catch (e) {
            console.error('Failed to clear persistent logs:', e);
        }
    }
}

export const logger = new Logger();
export type { LogEntry, LogLevel };
