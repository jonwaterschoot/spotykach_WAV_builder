import { useState } from 'react';

export const DragDebug = () => {
    const [logs, setLogs] = useState<string[]>([]);
    const [dropCount, setDropCount] = useState(0);

    const log = (msg: string) => {
        setLogs(prev => [msg, ...prev].slice(0, 10)); // Keep last 10
    };

    const handleDragStart = (e: React.DragEvent) => {
        log(`DragStart: ${e.type}`);
        // Serialize a test payload
        const payload = JSON.stringify({ id: 'debug-item', source: 'debug' });
        e.dataTransfer.setData('text/plain', payload);
        e.dataTransfer.effectAllowed = 'copyMove';
    };

    const handleDragEnter = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        log(`DragEnter`);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        // log(`DragOver`); // Too spammy, uncomment if needed
        e.dataTransfer.dropEffect = 'copy';
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        log(`DragLeave`);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const data = e.dataTransfer.getData('text/plain');
        log(`DROP! Data: ${data}`);
        setDropCount(c => c + 1);
    };

    return (
        <div className="p-4 bg-gray-900 border-t-4 border-red-500 mt-8 mb-20 pointer-events-auto">
            <h3 className="text-xl font-bold text-red-500 mb-4">🐞 TOUCH DRAG DEBUGGER</h3>

            <div className="flex gap-4 mb-4">
                {/* Draggable */}
                <div
                    draggable
                    onDragStart={handleDragStart}
                    className="w-24 h-24 bg-blue-500 rounded flex items-center justify-center font-bold cursor-grab active:cursor-grabbing touch-none select-none"
                    style={{ touchAction: 'none' }}
                >
                    DRAG ME
                </div>

                {/* Drop Zone */}
                <div
                    onDragEnter={handleDragEnter}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className="w-24 h-24 border-4 border-dashed border-gray-500 rounded flex items-center justify-center font-bold transition-colors bg-gray-800"
                >
                    DROP HERE ({dropCount})
                </div>
            </div>

            {/* Logs */}
            <div className="bg-black p-2 font-mono text-xs h-32 overflow-y-auto border border-gray-700 rounded">
                {logs.map((l, i) => (
                    <div key={i} className="border-b border-gray-800 py-0.5 text-green-400">{l}</div>
                ))}
                {logs.length === 0 && <div className="text-gray-500 italic">Waiting for events...</div>}
            </div>

            <div className="text-xs text-gray-400 mt-2">
                <strong>Note:</strong> Dragging requires `touch-action: none` on the draggable element source to work on mobile without polyfill interference.
            </div>
        </div>
    );
};
