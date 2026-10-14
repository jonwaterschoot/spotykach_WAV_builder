import { NOTE_NAMES, semitonesToPitchClasses } from './pitch.ts';
import type { PitchChoice, SnippetInfo } from './render.ts';
import { scalePitchClasses, type MangleSettings } from './settings.ts';

/**
 * A snippet's pitch, as the snippet list edits it: the random detune stays,
 * and on top of it the snippet goes to its own pitch, the nearest note of the
 * scale, the nearest given note, or a plain shift.
 *
 * Results from before `choice` existed only have `toCApplied`; they read as
 * "nearest C".
 */

export const detuneOf = (s: SnippetInfo): number =>
    s.detune ?? s.shift - (s.toCApplied && s.pitch ? s.pitch.toC : 0);

export const choiceOf = (s: SnippetInfo): PitchChoice | undefined =>
    s.choice ?? (s.toCApplied ? { kind: 'note', pc: 0 } : undefined);

/** The shift a choice adds, or null when it needs a detected pitch and there is none. */
export function offsetFor(choice: PitchChoice | undefined, s: SnippetInfo, settings: MangleSettings): number | null {
    if (!choice) return 0;
    if (choice.kind === 'st') return choice.st;
    if (!s.pitch) return null;
    const classes = choice.kind === 'scale'
        ? scalePitchClasses(settings.scaleRoot, settings.scaleMask)
        : [choice.pc];
    return semitonesToPitchClasses(s.pitch.frequency, classes);
}

/** The snippet with its pitch set to `choice`; unchanged when that isn't possible. */
export function withChoice(s: SnippetInfo, choice: PitchChoice | undefined, settings: MangleSettings): SnippetInfo {
    const offset = offsetFor(choice, s, settings);
    if (offset === null) return s;
    const detune = detuneOf(s);
    return { ...s, detune, choice, shift: detune + offset, toCApplied: undefined };
}

export const sameChoice = (a: PitchChoice | undefined, b: PitchChoice | undefined): boolean =>
    JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** A short label: `scale`, `→ D`, `+3 st`, or `own`. */
export function choiceLabel(choice: PitchChoice | undefined): string {
    if (!choice) return 'own';
    if (choice.kind === 'scale') return 'scale';
    if (choice.kind === 'note') return `→ ${NOTE_NAMES[choice.pc]}`;
    return `${choice.st > 0 ? '+' : ''}${choice.st} st`;
}

/** Stable `<select>` values for choices. */
export const choiceKey = (choice: PitchChoice | undefined): string =>
    !choice ? 'own' : choice.kind === 'scale' ? 'scale' : choice.kind === 'note' ? `note:${choice.pc}` : `st:${choice.st}`;

export function choiceFromKey(key: string): PitchChoice | undefined {
    if (key === 'scale') return { kind: 'scale' };
    if (key.startsWith('note:')) return { kind: 'note', pc: Number(key.slice(5)) };
    if (key.startsWith('st:')) return { kind: 'st', st: Number(key.slice(3)) };
    return undefined;
}
