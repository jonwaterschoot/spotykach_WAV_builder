/**
 * `window.skUsb`: drives the USB backend from the browser console, for testing on
 * hardware before the USB UI exists. Loaded only with the USB flag on.
 *
 *   await skUsb.connect()            // SysEx, serial port, HELLO
 *   await skUsb.authorize()          // first use, if connect() asks for a click
 *   await skUsb.slots()              // LIST + header read per slot, as a table
 *   await skUsb.download('Blue', 1)  // saves the slot as a file
 *   await skUsb.upload('Blue', 1)    // picks a WAV and writes it to the slot
 *   await skUsb.remove('Blue', 1)
 *   await skUsb.exit()
 */
import type { TapeColor } from '../../types';
import { authorizePort, connect, MidiPortNotFoundError, NeedsAuthorizationError } from './skLink';
import type { Connection } from './skLink';
import { UsbBackend } from './usbBackend';

let backend: UsbBackend | null = null;

const adopt = (connection: Connection): UsbBackend => {
    backend = new UsbBackend(connection);
    backend.ondisconnect = (error) => {
        console.warn(`[usb] ${error.message}`);
        backend = null;
    };
    console.info('[usb] connected', connection.hello);
    return backend;
};

const need = (): UsbBackend => {
    if (!backend) throw new Error('Not connected: run skUsb.connect() first.');
    return backend;
};

const pickFile = (): Promise<File | null> => new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.wav,audio/wav';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
});

const progress = (label: string) => {
    let last = -1;
    return (fraction: number) => {
        const pct = Math.floor(fraction * 10) * 10;
        if (pct !== last) console.info(`[usb] ${label} ${pct}%`);
        last = pct;
    };
};

const api = {
    get backend() {
        return backend;
    },

    async connect() {
        try {
            return adopt(await connect());
        } catch (e) {
            if (e instanceof NeedsAuthorizationError || e instanceof MidiPortNotFoundError) {
                console.info('[usb] If the rings are lit for transfer, run: await skUsb.authorize()  (the device waits about a minute for it)');
            }
            throw e;
        }
    },

    async authorize() {
        return adopt(await authorizePort());
    },

    async info() {
        return need().info();
    },

    async slots() {
        const card = need();
        const started = performance.now();
        const rows = [];
        for (const listed of await card.listSlots()) {
            const d = await card.readHeader(listed.tape, listed.slot);
            if (!d) continue;
            rows.push({
                slot: `${d.tape} ${d.slot}`,
                name: d.name ?? '',
                seconds: d.frames && d.sampleRate ? +(d.frames / d.sampleRate).toFixed(2) : null,
                cues: d.cueCount,
                loadable: d.loadable,
                dataOffset: d.dataOffset,
                id: d.meta?.id ?? '',
                hash: d.meta?.hash?.slice(0, 12) ?? '',
            });
        }
        console.table(rows);
        console.info(`[usb] ${rows.length} slots in ${((performance.now() - started) / 1000).toFixed(1)} s`);
        return rows;
    },

    async download(tape: TapeColor, slot: number) {
        const card = need();
        const started = performance.now();
        const file = await card.readFile(tape, slot, progress('download'));
        const seconds = (performance.now() - started) / 1000;
        console.info(`[usb] ${file.size} bytes in ${seconds.toFixed(1)} s (${(file.size / 1024 / seconds).toFixed(0)} KB/s)`);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(file);
        a.download = `${tape.charAt(0)}${slot}.wav`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 10000);
        return file;
    },

    async upload(tape: TapeColor, slot: number, file?: File) {
        const card = need();
        const source = file ?? await pickFile();
        if (!source) return false;
        const started = performance.now();
        const wrote = await card.writeSlot(tape, slot, source, { compare: 'always', onProgress: progress('upload') });
        const seconds = (performance.now() - started) / 1000;
        console.info(`[usb] ${source.size} bytes in ${seconds.toFixed(1)} s (${(source.size / 1024 / seconds).toFixed(0)} KB/s)`);
        return wrote;
    },

    async remove(tape: TapeColor, slot: number) {
        return need().deleteSlot(tape, slot);
    },

    async exit() {
        await backend?.close();
        backend = null;
    },
};

export function installUsbConsole() {
    (window as unknown as { skUsb: typeof api }).skUsb = api;
    console.info('[usb] USB transfer is on (experimental). Try: await skUsb.connect()');
}
