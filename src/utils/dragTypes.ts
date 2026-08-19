/**
 * Drag-and-drop MIME markers.
 *
 * `dragover` can read the *types* on a DataTransfer but never the data, so a drop
 * target that wants to light up before the drop has only this to go on. Kept in its
 * own module rather than in the components that use it: the host recognising the
 * drag and the browser starting it are lazy-loaded separately, and neither should
 * pull the other into its chunk for the sake of one string.
 *
 * Studio's older, project-file drags (`application/x-spotykach-file-id` and friends)
 * still declare their types inline where they are used.
 */

/** One or more sample rows dragged out of the sample browser. The value is the count. */
export const SAMPLE_DRAG_TYPE = 'application/x-spotykach-samples';

/** True for a drag carrying sample rows out of the sample browser. */
export const isSampleDrag = (e: { dataTransfer?: DataTransfer | null }): boolean =>
    Array.from(e.dataTransfer?.types || []).includes(SAMPLE_DRAG_TYPE);
