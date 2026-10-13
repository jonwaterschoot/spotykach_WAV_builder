import React, { useEffect, useLayoutEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEscapeLayer } from '../../shell/escapeStack';

interface TourStep {
    /** The `data-tour` value of the element to spotlight; none centres the card. */
    target?: string;
    title: string;
    body: React.ReactNode;
}

/** The order of operations, left to right across the screen. */
const STEPS: TourStep[] = [
    {
        title: 'Sample Mangler in five steps',
        body: (
            <>
                Random snippets from your sounds, joined into one file of up to 42 s with a cue point at each
                snippet. The screen reads left to right: sources, settings, results. This guide walks through it
                in that order.
            </>
        ),
    },
    {
        target: 'sources',
        title: '1 · Fill the source pool',
        body: (
            <>
                Add sounds with <b>Packs</b> or <b>Files</b>, or drop files on the window. The checkbox switches a
                source in or out of the next batch; the scissors mark the parts snippets may come from.
            </>
        ),
    },
    {
        target: 'settings',
        title: '2 · Set the ranges',
        body: (
            <>
                Each slider is a range, and the dice pick a value inside it for every snippet. Start from a{' '}
                <b>Preset</b>, then adjust Shape (length, fill, crossfades), Loudness and Pitch.
            </>
        ),
    },
    {
        target: 'generate',
        title: '3 · Generate',
        body: (
            <>
                <b>Variations</b> sets how many files one click makes, each with its own seed. Lock the seed to get
                the same batch again; <b>Click plays</b> sets how much a click on a waveform plays.
            </>
        ),
    },
    {
        target: 'results',
        title: '4 · Listen, keep, refine',
        body: (
            <>
                Play a result or click its waveform to hear one snippet. <b>Star</b> the ones you like: unstarred
                results are cleared when the next batch starts. Open <b>Snippets</b> to delete, reorder, lock or
                repitch them, or use <b>Same seed</b>, Cues, Crop and Editor on the card.
            </>
        ),
    },
    {
        target: 'save',
        title: '5 · Save',
        body: (
            <>
                Each card can download the WAV, save to the Studio library, add to the Browse pool or start a new
                project. Starred results can be saved together from this bar. A result made from a no-derivatives
                source can't be saved.
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
    const top = below + cardHeight <= vh - 16 ? below : rect.top - GAP - cardHeight;
    return { top: clampTop(top), left: clampLeft(rect.left + rect.width / 2 - CARD_WIDTH / 2) };
};

/**
 * A short guided tour of the mangler: dims the screen, spotlights one column at a
 * time and explains what to do there. Arrow keys step, Escape closes.
 */
export const ManglerTour: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [index, setIndex] = useState(0);
    const [rect, setRect] = useState<Rect | null>(null);
    const [cardHeight, setCardHeight] = useState(200);
    const cardRef = React.useRef<HTMLDivElement>(null);
    const step = STEPS[index];
    const last = index === STEPS.length - 1;

    useLayoutEffect(() => {
        const update = () => setRect(measure(step.target));
        update();
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
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
