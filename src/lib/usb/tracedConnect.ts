/**
 * The package's `connect()` and `authorizePort()`, step by step, with a time limit
 * on every step that can hang and a line in the diagnostics for each.
 *
 * Why not just call `connect()`: on one Windows machine it never settled, with no
 * console error, and we couldn't tell which step stopped. Only Web MIDI's
 * `requestMIDIAccess()` and `open()` and Web Serial's `port.open()` have no time
 * limit there. Keep the order of steps in line with the package's `connect()`.
 */
import * as link from '@synthuxacademy/spotykach-transfer';
import type { Connection, SerialPortLike } from '@synthuxacademy/spotykach-transfer';

export type Trace = (line: string) => void;

/** Chrome grants a known site at once; anything slower than this is stuck. */
const MIDI_ACCESS_MS = 8000;
/** The package's own limit is 2 + 3 s for the reply; the rest is MIDI `open()`. */
const ENTER_MS = 10000;
/** Port open (retried for ~2 s) plus HELLO (5 s). */
const HANDSHAKE_MS = 15000;
/** How long the serial port takes to appear once the device has switched. */
const PORT_WAIT_MS = 2500;

interface WebSerial {
    requestPort(options: { filters: { usbVendorId: number; usbProductId: number }[] }): Promise<SerialPortLike>;
    getPorts(): Promise<SerialPortLike[]>;
    addEventListener(type: 'connect' | 'disconnect', listener: (e: Event) => void): void;
    removeEventListener(type: 'connect' | 'disconnect', listener: (e: Event) => void): void;
}

const serial = (): WebSerial | undefined => (navigator as unknown as { serial?: WebSerial }).serial;
const userActive = (): boolean =>
    (navigator as unknown as { userActivation?: { isActive: boolean } }).userActivation?.isActive ?? false;

class StepTimeout extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'StepTimeout';
    }
}

/** Rejects after `ms`; `onLate` gets a result that arrives after that. */
const within = <T>(promise: Promise<T>, ms: number, message: string, onLate?: (value: T) => void): Promise<T> =>
    new Promise((resolve, reject) => {
        let late = false;
        const timer = setTimeout(() => { late = true; reject(new StepTimeout(message)); }, ms);
        promise.then(
            value => { if (late) onLate?.(value); else { clearTimeout(timer); resolve(value); } },
            error => { if (!late) { clearTimeout(timer); reject(error); } },
        );
    });

const REPORT = ' Use "Copy diagnostics" and send it along when you report this.';

const portText = (port: SerialPortLike): string => {
    const info = port.getInfo();
    const hex = (n?: number) => n === undefined ? '?' : n.toString(16).padStart(4, '0');
    return `${hex(info.usbVendorId)}:${hex(info.usbProductId)}`;
};

const isSpotykach = (port: MIDIPort) => /spotykach/i.test(port.name ?? '');

const midiPortsText = (access: MIDIAccess): string => {
    const all = [...access.inputs.values(), ...access.outputs.values()];
    if (all.length === 0) return 'none';
    return all.map(p => `${p.type} "${p.name}" (${p.state}, ${p.connection})`).join('; ');
};

async function midiPermission(): Promise<string> {
    try {
        const status = await navigator.permissions.query({ name: 'midi', sysex: true } as unknown as PermissionDescriptor);
        return status.state;
    } catch {
        return 'unknown';
    }
}

async function handshake(port: SerialPortLike, trace: Trace): Promise<Connection> {
    trace(`opening serial port ${portText(port)} and sending HELLO`);
    const connection = await within(
        link.handshake(port),
        HANDSHAKE_MS,
        `Spotykach's serial port didn't open or answer within ${HANDSHAKE_MS / 1000} s.` + REPORT,
        late => { void late.link.exit(); },
    );
    const { info } = connection;
    trace(`HELLO: firmware ${info.firmware}, protocol ${info.protoMajor}.${info.protoMinor}`);
    return connection;
}

/** The browser's port picker, then HELLO. Must run from a click. */
export async function tracedAuthorize(trace: Trace): Promise<Connection> {
    const webSerial = serial();
    if (!webSerial) throw new Error('This browser has no Web Serial.');
    trace('showing the port picker');
    const port = await webSerial.requestPort({ filters: [{ usbVendorId: link.USB_VENDOR_ID, usbProductId: link.USB_PRODUCT_ID }] });
    trace(`picked ${portText(port)}`);
    return handshake(port, trace);
}

/** SysEx to transfer mode, the serial port, HELLO: `connect()` with a trace. */
export async function tracedConnect(trace: Trace): Promise<Connection> {
    if (!link.isSupported()) return link.connect(); // throws the package's "use Chrome" message

    const webSerial = serial()!;
    const onSerial = (e: Event) => trace(`serial ${e.type} ${portText(e.target as unknown as SerialPortLike)}`);
    webSerial.addEventListener('connect', onSerial);
    webSerial.addEventListener('disconnect', onSerial);
    let access: MIDIAccess | null = null;
    let switched = false;
    const onMidi = (e: Event) => {
        const port = (e as MIDIConnectionEvent).port;
        if (!port || !isSpotykach(port)) return;
        trace(`MIDI ${port.type} "${port.name}" is ${port.state}, ${port.connection}`);
        if (port.type === 'output' && port.state === 'disconnected') switched = true;
    };

    try {
        const granted = await webSerial.getPorts();
        trace(`serial ports granted to this site: ${granted.map(portText).join(', ') || 'none'}`);

        const existing = await link.grantedPort();
        if (existing) {
            try {
                return await handshake(existing, trace);
            } catch (e) {
                if (e instanceof link.ProtocolMismatchError) throw e;
                trace(`no answer on the granted port, switching the device: ${e instanceof Error ? e.message : e}`);
            }
        }

        // Our own MIDI access first, so a hang shows here and not inside `enterTransferMode()`
        const permission = await midiPermission();
        trace(`MIDI SysEx permission: ${permission}`);
        try {
            const request = navigator.requestMIDIAccess({ sysex: true });
            // A permission prompt waits on the user, so no time limit then
            access = permission === 'prompt'
                ? await request
                : await within(request, MIDI_ACCESS_MS,
                    `The browser didn't give access to MIDI within ${MIDI_ACCESS_MS / 1000} s. Close other apps and tabs that use MIDI, then try again.` + REPORT);
            trace(`MIDI ports: ${midiPortsText(access)}`);
            access.addEventListener('statechange', onMidi);
        } catch (e) {
            if (e instanceof StepTimeout) {
                trace('MIDI access timed out');
                throw e;
            }
            trace(`MIDI access failed: ${e instanceof Error ? e.message : e}`);
            // `enterTransferMode()` asks again and throws its own message
        }

        trace('sending SysEx: enter transfer mode');
        try {
            await within(link.enterTransferMode(), ENTER_MS,
                `Spotykach's MIDI port didn't respond within ${ENTER_MS / 1000} s.` + REPORT);
            trace(switched ? 'device switched (its MIDI port is gone)' : 'device replied OK');
        } catch (e) {
            if (e instanceof StepTimeout && switched) {
                trace('switching timed out, but the MIDI port is gone, so the device switched: waiting for its serial port');
            } else if (e instanceof link.MidiPortNotFoundError && userActive()) {
                // Maybe already in transfer mode with a port this site hasn't been granted yet
                trace('no Spotykach MIDI port: asking for the serial port');
                try {
                    return await tracedAuthorize(trace);
                } catch (pickerError) {
                    trace(`port picker: ${pickerError instanceof Error ? pickerError.message : pickerError}`);
                    throw e;
                }
            } else {
                trace(`switching failed: ${e instanceof Error ? e.message : e}`);
                throw e;
            }
        }

        trace('waiting for the serial port');
        const start = performance.now();
        while (performance.now() - start < PORT_WAIT_MS) {
            const port = await link.grantedPort();
            if (port) return await handshake(port, trace);
            await new Promise(resolve => setTimeout(resolve, 250));
        }
        // The click that started this still counts as a user gesture for about 5 s
        if (userActive()) return await tracedAuthorize(trace);
        trace('no granted serial port, and the click has expired: needs "Authorise port"');
        throw new link.NeedsAuthorizationError();
    } finally {
        webSerial.removeEventListener('connect', onSerial);
        webSerial.removeEventListener('disconnect', onSerial);
        access?.removeEventListener('statechange', onMidi);
    }
}
