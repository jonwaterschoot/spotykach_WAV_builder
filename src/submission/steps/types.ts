import type { FileRecord } from '../../types';
import type { ToastType } from '../../components/Toast';
import type { SubmissionDraft } from '../draft';

/** What every step is handed. Identical across the six, so the shell can spread it. */
export interface StepProps {
    draft: SubmissionDraft;
    update: (patch: Partial<SubmissionDraft>) => void;
    goToStep: (step: number) => void;
    showToast: (message: string, type?: ToastType) => void;
    /**
     * Make something playable that isn't in the draft.
     *
     * The player bar lives in the shell and names whatever is playing, which it does
     * by looking the active id up among the draft's rows. A file being auditioned out
     * of a folder the artist has not added yet is playing and *is not* one of those
     * rows, so it is handed up here instead. `null` clears it.
     */
    registerPreview: (record: FileRecord | null) => void;
    /**
     * Open the written guide — the help modal's contribute tab — over the form.
     *
     * The shell owns it, because it is one modal for the whole tool rather than one
     * per step, and because Escape has to reach it before the layer that walks the
     * visitor back out to the hub.
     */
    openGuide: () => void;
}
