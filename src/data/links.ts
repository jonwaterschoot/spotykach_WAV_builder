/**
 * Outward-facing URLs and contact details, in one place.
 *
 * The submission guide is linked from the Presets door and from the help modal's
 * contribute tab, both of which now lead with the in-app tool at `#/submit` and keep
 * this as the read-before-you-start page
 * ([docs/presets-samples/submission-tool-plan.md](../../docs/presets-samples/submission-tool-plan.md)).
 * It is a GitHub URL rather than a route because the guide lives in the repo, not in
 * the app.
 */
export const SUBMISSION_GUIDE_URL =
    'https://github.com/jonwaterschoot/spotykach_WAV_builder/blob/main/docs/presets-samples/README.md';

/**
 * The submission walkthrough, as a YouTube video id — `null` until one is shot.
 *
 * An id rather than a URL because nothing here should be able to embed an arbitrary
 * page: the id is dropped into a `youtube-nocookie.com/embed/` address, and setting
 * this constant is the whole of publishing the video. Step 1 draws a placeholder
 * while it is null, so the layout the video lands in already exists.
 *
 * Nothing from YouTube is fetched until the visitor clicks play — see `IntroVideo`
 * in StepKind. Same reasoning as the Buy Me a Coffee button in the help modal: no
 * third-party script runs in this app unless someone asks for it.
 */
export const SUBMISSION_VIDEO_ID: string | null = null;

/** Public, and carries no spam cost — Discord won't take a DM from a stranger unasked. */
export const DISCORD_HANDLE = 'jonwtr';

// Split so the address is never a contiguous string in the shipped bundle or in the
// rendered HTML. Bulk harvesters scrape both for /\S+@\S+/; composing at runtime puts
// the address out of reach of the naive majority of them, which is most of the volume.
// It is a filter, not a wall — anything that executes the page still sees it.
const MAIL_USER = 'jon';
const MAIL_HOST = 'synthux.academy';

/** The address itself, for display. Call it — don't hoist the result into a module constant. */
export const submissionEmail = (): string => `${MAIL_USER}@${MAIL_HOST}`;

/**
 * A `mailto:` with the subject prefilled, so submissions arrive filterable rather than
 * as one more untitled mail.
 */
export const submissionMailto = (subject = 'Spotykach submission'): string =>
    `mailto:${submissionEmail()}?subject=${encodeURIComponent(subject)}`;
