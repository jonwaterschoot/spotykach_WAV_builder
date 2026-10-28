/**
 * Slot files off the card, as a ZIP laid out like the card (`SK/B/1.WAV`), into the
 * browser's downloads. The backup before a write replaces them, or a copy of the
 * whole card. Copying `SK/` back onto the card puts them back.
 */
import type { CardBackend, SlotDescriptor } from './cardBackend';

export interface SlotZipOptions {
    /** The README's first line: what these are and why they were saved. */
    title: string;
    fileName: string;
    /** Slot index, and 0–1 within it. */
    onProgress?: (index: number, fraction: number) => void;
    signal?: AbortSignal;
}

export async function downloadSlotsZip(card: CardBackend, slots: SlotDescriptor[], { title, fileName, onProgress, signal }: SlotZipOptions): Promise<void> {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    const lines = [`${title}, saved ${new Date().toLocaleString()}.`, 'Copy SK/ onto the card to put them back.', ''];
    for (const [i, d] of slots.entries()) {
        signal?.throwIfAborted();
        onProgress?.(i, 0);
        // The folder route already holds the file; over USB it's a download.
        const file = d.file ?? await card.readFile(d.tape, d.slot, fraction => onProgress?.(i, fraction), signal);
        zip.file(`SK/${d.tape.charAt(0)}/${d.slot}.WAV`, file);
        lines.push(`${d.tape} ${d.slot}: ${d.name || d.meta?.name || '(no name, recorded on the device)'}`);
    }
    zip.file('README.txt', lines.join('\r\n'));
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
}
