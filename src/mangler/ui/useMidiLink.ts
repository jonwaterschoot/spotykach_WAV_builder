import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { appStorage } from '../../utils/storageNamespace';
import type { SequencerHooks, StepEvent } from './useSequencePlayer';

/**
 * The sequencer's link to a Spotykach (or anything else) over MIDI, through the
 * browser's Web MIDI (Chrome, Edge). What the firmware does with it, from its
 * source (core.midi.cpp, core.ui.cpp):
 *
 * - Clock: it follows MIDI clock when its clock source is MIDI, over USB or the
 *   TRS jack. Start / Stop play and stop a deck when config.txt enables that for
 *   the deck.
 * - Notes: a note-on on a deck's channel (1 for A, 2 for B by default) plays
 *   that deck, note 60 at its own speed, other notes repitched.
 * - It sends clock itself when it is the master, which the sequencer can follow.
 *
 * Over USB the Spotykach is either a MIDI device or in transfer mode: sending a
 * sample over USB switches it, and it comes back to MIDI after.
 */

export interface MidiSettings {
    outputId: string | null;
    inputId: string | null;
    /** Send clock and Start / Stop while the sequencer plays (it is the master). */
    sendClock: boolean;
    /** Follow an incoming clock: its tempo, Start, Stop and Continue (the other is the master). */
    follow: boolean;
    /** MIDI channels of the decks, 1–16. */
    channelA: number;
    channelB: number;
}

export interface MidiPort {
    id: string;
    name: string;
}

const KEY = 'mangler_midi';
const DEFAULTS: MidiSettings = { outputId: null, inputId: null, sendClock: true, follow: false, channelA: 1, channelB: 2 };
/** How a Spotykach (a Daisy) names its USB MIDI port. */
const LOOKS_LIKE_SK = /spotykach|daisy/i;

const load = (): MidiSettings => {
    try { return { ...DEFAULTS, ...JSON.parse(appStorage.getItem(KEY) ?? 'null') }; } catch { return DEFAULTS; }
};

export const midiSupported = () => typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;

export function useMidiLink() {
    const [access, setAccess] = useState<MIDIAccess | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [ports, setPorts] = useState<{ inputs: MidiPort[]; outputs: MidiPort[] }>({ inputs: [], outputs: [] });
    const [settings, setSettings] = useState<MidiSettings>(load);
    useEffect(() => { appStorage.setItem(KEY, JSON.stringify(settings)); }, [settings]);

    const refresh = useCallback((a: MIDIAccess) => {
        const list = (m: MIDIInputMap | MIDIOutputMap) => [...m.values()].map(p => ({ id: p.id, name: p.name ?? p.id }));
        const inputs = list(a.inputs), outputs = list(a.outputs);
        setPorts({ inputs, outputs });
        // A Spotykach that shows up is picked, unless something else was chosen.
        setSettings(s => ({
            ...s,
            outputId: s.outputId && outputs.some(p => p.id === s.outputId) ? s.outputId : outputs.find(p => LOOKS_LIKE_SK.test(p.name))?.id ?? s.outputId,
            inputId: s.inputId && inputs.some(p => p.id === s.inputId) ? s.inputId : inputs.find(p => LOOKS_LIKE_SK.test(p.name))?.id ?? s.inputId,
        }));
    }, []);

    const enable = useCallback(async () => {
        if (!midiSupported()) { setError('This browser has no Web MIDI: use Chrome or Edge.'); return; }
        try {
            const a = await navigator.requestMIDIAccess();
            a.onstatechange = () => refresh(a);
            setAccess(a);
            setError(null);
            refresh(a);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'MIDI access was refused.');
        }
    }, [refresh]);

    const output = access && settings.outputId ? access.outputs.get(settings.outputId) ?? null : null;
    const input = access && settings.inputId ? access.inputs.get(settings.inputId) ?? null : null;

    // The sequencer's hooks read the latest port and settings through refs, so the
    // hooks object itself never changes.
    const live = useRef({ output, settings });
    useEffect(() => { live.current = { output, settings }; }, [output, settings]);

    const hooks = useMemo<SequencerHooks>(() => ({
        onStart: perfMs => {
            const { output: out, settings: s } = live.current;
            if (out && s.sendClock && !s.follow) out.send([0xfa], perfMs);
        },
        onStop: () => {
            const { output: out, settings: s } = live.current;
            if (out && s.sendClock && !s.follow) out.send([0xfc]);
        },
        onStep: (e: StepEvent) => {
            const { output: out, settings: s } = live.current;
            if (!out) return;
            // 24 clocks a beat: six to a sixteenth, on the unswung grid so the clock stays even.
            if (s.sendClock && !s.follow) for (let i = 0; i < 6; i++) out.send([0xf8], e.gridPerfMs + (i * e.stepMs) / 6);
            const channelOf = (deck: 'A' | 'B') => Math.min(16, Math.max(1, deck === 'A' ? s.channelA : s.channelB)) - 1;
            for (const c of e.controls) out.send([0xb0 | channelOf(c.deck), c.cc, Math.min(127, Math.max(0, c.value))], e.perfMs + c.at * e.stepMs);
            for (const hit of e.hits) {
                if (!hit.deck) continue;
                const channel = channelOf(hit.deck);
                const note = Math.min(127, Math.max(0, Math.round(hit.note)));
                const velocity = Math.min(127, Math.max(1, Math.round(hit.velocity * 127)));
                out.send([0x90 | channel, note, velocity], e.perfMs);
                out.send([0x80 | channel, note, 0], e.perfMs + Math.min(e.stepMs * 0.9, 120));
            }
        },
    }), []);

    return { supported: midiSupported(), enabled: !!access, enable, error, ports, settings, setSettings, output, input, hooks };
}

/**
 * Follows an outside clock: Start and Continue start the sequencer on it, Stop
 * stops it, every sixth tick is a sixteenth, and the tempo is measured from the
 * ticks and reported (`onTempo`) when it moves.
 */
export function useMidiFollow(input: MIDIInput | null, on: boolean, handlers: {
    start: (fromStart: boolean) => void;
    step: (perfMs: number) => void;
    stop: () => void;
    onTempo: (bpm: number) => void;
}) {
    const h = useRef(handlers);
    useEffect(() => { h.current = handlers; }, [handlers]);
    const [tempo, setTempo] = useState<number | null>(null);

    useEffect(() => {
        if (!input || !on) { setTempo(null); return; }
        let ticks = 0;
        let running = false;
        let last: number | null = null;
        let average: number | null = null;
        let reported = 0;
        const listener = (event: MIDIMessageEvent) => {
            const status = event.data?.[0];
            if (status === 0xfa || status === 0xfb) {
                ticks = 0;
                running = true;
                h.current.start(status === 0xfa);
            } else if (status === 0xfc) {
                running = false;
                h.current.stop();
            } else if (status === 0xf8) {
                if (last !== null) {
                    const interval = event.timeStamp - last;
                    average = average === null ? interval : average * 0.9 + interval * 0.1;
                    const bpm = Math.round((60000 / (average * 24)) * 2) / 2;
                    if (ticks % 24 === 0 && Math.abs(bpm - reported) >= 0.5) {
                        reported = bpm;
                        setTempo(bpm);
                        h.current.onTempo(bpm);
                    }
                }
                last = event.timeStamp;
                if (running && ticks % 6 === 0) h.current.step(event.timeStamp);
                ticks++;
            }
        };
        input.addEventListener('midimessage', listener as EventListener);
        return () => input.removeEventListener('midimessage', listener as EventListener);
    }, [input, on]);

    return { tempo };
}
