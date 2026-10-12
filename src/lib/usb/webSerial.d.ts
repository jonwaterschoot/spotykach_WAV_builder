/**
 * The parts of the Web Serial API that `skLink.ts` uses. TypeScript's DOM lib
 * doesn't include Web Serial (Chromium only); the full typings are
 * `@types/w3c-web-serial`.
 */
interface SerialPortInfo {
    usbVendorId?: number;
    usbProductId?: number;
}

interface SerialPortFilter {
    usbVendorId?: number;
    usbProductId?: number;
}

interface SerialOptions {
    baudRate: number;
    bufferSize?: number;
}

interface SerialPort extends EventTarget {
    readonly readable: ReadableStream<Uint8Array> | null;
    readonly writable: WritableStream<Uint8Array> | null;
    open(options: SerialOptions): Promise<void>;
    close(): Promise<void>;
    getInfo(): SerialPortInfo;
}

interface Serial extends EventTarget {
    getPorts(): Promise<SerialPort[]>;
    requestPort(options?: { filters?: SerialPortFilter[] }): Promise<SerialPort>;
}

interface Navigator {
    readonly serial?: Serial;
}
