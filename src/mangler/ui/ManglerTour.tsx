import React, { useEffect, useLayoutEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Dices, X } from 'lucide-react';
import { useEscapeLayer } from '../../shell/escapeStack';

interface TourStep {
    /** The `data-tour` value of the element to spotlight; none centres the card. */
    target?: string;
    title: string;
    body: React.ReactNode;
}

/** The dice, as it looks on screen, inline in the text. */
const Die = () => <Dices size={12} className="inline -mt-0.5 text-synthux-red" aria-label="dice" />;

/**
 * The basics, left to right across the screen, then the other stations. Each
 * step points at its dice: roll first, open the details when you want control.
 */
const STEPS: TourStep[] = [
    {
        title: 'Sample Mangler, the short version',
        body: (
            <>
                Random snippets from your sounds, joined into one file with a cue point at each snippet, ready for
                a Spotykach slot. You don&apos;t need to learn every slider: wherever you see <Die />, roll it and
                listen. Dig into the details when you want more control.
            </>
        ),
    },
    {
        target: 'sources',
        title: '1 · Add sounds',
        body: (
            <>
                <b>Packs</b>, <b>Files</b> or drop files on the window; <b>Card</b> takes slots from your Spotykach.
                The checkbox puts a source in or out of the next batch; <Die /> switches on a random few.
            </>
        ),
    },
    {
        target: 'settings',
        title: '2 · Roll the settings',
        body: (
            <>
                <Die /> at the top rolls everything; pick a style (Cloud, Beat grid, Drum hits…) and it stays near
                that sound. The <Die /> on a group rolls only that group, and its lock keeps a group you like. Every
                slider is a range the dice pick from, per snippet: open a group to drag the one that bothers you.
            </>
        ),
    },
    {
        target: 'generate',
        title: '3 · Generate',
        body: (
            <>
                One click makes a few <b>Variations</b>, each with its own seed. The lock keeps the seed, to make the
                same batch again after a change.
            </>
        ),
    },
    {
        target: 'results',
        title: '4 · Listen and keep',
        body: (
            <>
                Play a result, or click its waveform to hear one snippet. <b>Star</b> the keepers: the rest go when
                the next batch starts. For more control, <b>Snippets</b> opens each snippet to repitch, reorder or
                lock it.
            </>
        ),
    },
    {
        target: 'save',
        title: '5 · Use what you kept',
        body: (
            <>
                Once you have starred results, the <b>Kept</b> menu above them takes them all at once: to the
                library, to a new project, to your Spotykach (USB or SD card), or back into the source pool to mangle
                again. Each card has the same buttons for one result.
            </>
        ),
    },
    {
        target: 'stations',
        title: 'More stations',
        body: (
            <>
                <b>Slices</b> cuts hits from your sounds into kits, <b>Sequence</b> plays them in a 16-step loop (and
                can drive the Spotykach over MIDI), <b>Synth</b> makes drum hits from scratch. Each starts the same
                way: <Die /> first, details later. <b>Project</b> saves the lot; <b>Guide</b> brings this back.
            </>
        ),
    },
];

const CARD_WIDTH = 320;
const GAP = 14;
const PAD = 6;

interface Rect { top: number; left: number; width: number; height: number }

const measure = (target?: string): Rect | null => {
    if (!target) return null;
    const el = document.querySelector(`[data-tour="${target}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    // Hidden (another phone pane, nothing to show yet): the card goes in the middle.
    if (r.width === 0 || r.height === 0) return null;
    // Padded, but kept inside the window so the ring stays visible on edge columns.
    const top = Math.max(2, r.top - PAD);
    const left = Math.max(2, r.left - PAD);
    const bottom = Math.min(window.innerHeight - 2, r.bottom + PAD);
    const right = Math.min(window.innerWidth - 2, r.right + PAD);
    return { top, left, width: right - left, height: bottom - top };
};

/** Beside the spotlight where there is room, else below or above it; always on screen. */
const cardPosition = (rect: Rect | null, cardHeight: number): React.CSSProperties => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (!rect) return { top: Math.max(16, (vh - cardHeight) / 2), left: (vw - CARD_WIDTH) / 2 };
    const clampTop = (t: number) => Math.min(Math.max(16, t), vh - cardHeight - 16);
    const clampLeft = (l: number) => Math.min(Math.max(16, l), vw - CARD_WIDTH - 16);
    if (rect.left + rect.width + GAP + CARD_WIDTH <= vw - 16) {
        return { top: clampTop(rect.top), left: rect.left + rect.width + GAP };
    }
    if (rect.left - GAP - CARD_WIDTH >= 16) {
        return { top: clampTop(rect.top), left: rect.left - GAP - CARD_WIDTH };
    }
    const below = rect.top + rect.height + GAP;
    const above = rect.top - GAP - cardHeight;
    // A target taller than the screen (a phone pane): the card at the foot, clear of its top.
    const top = below + cardHeight <= vh - 16 ? below : above >= 16 ? above : vh - cardHeight - 16;
    return { top: clampTop(top), left: clampLeft(rect.left + rect.width / 2 - CARD_WIDTH / 2) };
};

/**
 * A short guided tour of the mangler: dims the screen, spotlights one column at a
 * time and explains what to do there. Arrow keys step, Escape closes.
 * `onStep` lets the host bring the step's target into view (station, phone pane).
 */
export const ManglerTour: React.FC<{ onClose: () => void; onStep?: (target?: string) => void }> = ({ onClose, onStep }) => {
    const [index, setIndex] = useState(0);
    const [rect, setRect] = useState<Rect | null>(null);
    const [cardHeight, setCardHeight] = useState(200);
    const cardRef = React.useRef<HTMLDivElement>(null);
    const step = STEPS[index];
    const last = index === STEPS.length - 1;

    useLayoutEffect(() => {
        onStep?.(step.target);
    }, [step.target, onStep]);

    useLayoutEffect(() => {
        // After the host has shown the target (a pane, a station): measured a frame later.
        const update = () => setRect(measure(step.target));
        update();
        const frame = requestAnimationFrame(update);
        window.addEventListener('resize', update);
        return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', update); };
    }, [step.target]);

    useLayoutEffect(() => {
        if (cardRef.current) setCardHeight(cardRef.current.offsetHeight);
    }, [index]);

    useEscapeLayer(true, () => { onClose(); return true; });

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight' || e.key === 'Enter') {
                e.preventDefault();
                if (last) onClose(); else setIndex(i => i + 1);
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                setIndex(i => Math.max(0, i - 1));
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [last, onClose]);

    return (
        <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-labelledby="mangler-tour-title">
            {/* Catches clicks so the screen underneath stays as it is during the tour. */}
            <div className={`absolute inset-0 ${rect ? '' : 'bg-black/70'}`} onClick={onClose} />
            {rect && (
                <div
                    className="pointer-events-none absolute rounded-xl ring-2 ring-synthux-red transition-all duration-300"
                    style={{ ...rect, boxShadow: '0 0 0 9999px rgba(0,0,0,0.7)' }}
                />
            )}

            <div
                ref={cardRef}
                className="absolute rounded-xl border border-white/15 bg-synthux-panel p-4 shadow-2xl transition-all duration-300"
                style={{ width: CARD_WIDTH, ...cardPosition(rect, cardHeight) }}
            >
                <div className="flex items-start justify-between gap-3 mb-2">
                    <h2 id="mangler-tour-title" className="text-sm font-bold text-white">{step.title}</h2>
                    <button onClick={onClose} className="shrink-0 text-gray-500 hover:text-white" title="Close the guide" aria-label="Close the guide">
                        <X size={15} />
                    </button>
                </div>
                <p className="text-xs leading-relaxed text-gray-300 [&_b]:text-white">{step.body}</p>

                <div className="mt-4 flex items-center gap-2">
                    <div className="flex gap-1" aria-label={`Step ${index + 1} of ${STEPS.length}`}>
                        {STEPS.map((_, i) => (
                            <button key={i} onClick={() => setIndex(i)} aria-label={`Step ${i + 1}`}
                                className={`h-1.5 rounded-full transition-all ${i === index ? 'w-4 bg-synthux-red' : 'w-1.5 bg-white/20 hover:bg-white/40'}`} />
                        ))}
                    </div>
                    <div className="ml-auto flex items-center gap-1.5">
                        {index > 0 ? (
                            <button onClick={() => setIndex(index - 1)}
                                className="flex items-center gap-0.5 px-2 py-1 rounded-md text-[11px] text-gray-400 hover:text-white hover:bg-white/10">
                                <ChevronLeft size={12} /> Back
                            </button>
                        ) : (
                            <button onClick={onClose}
                                className="px-2 py-1 rounded-md text-[11px] text-gray-400 hover:text-white hover:bg-white/10">
                                Skip
                            </button>
                        )}
                        <button onClick={() => (last ? onClose() : setIndex(index + 1))}
                            className="flex items-center gap-0.5 px-3 py-1 rounded-full text-[11px] font-bold bg-synthux-red text-white hover:bg-synthux-red/80">
                            {last ? 'Done' : <>Next <ChevronRight size={12} /></>}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
