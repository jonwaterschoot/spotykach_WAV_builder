import React from 'react';
import { ConfirmModal } from '../components/ConfirmModal';

interface ProjectCreatedModalProps {
  /** The project's folder name, or `null` when nothing has been created. */
  projectName: string | null;
  onDismiss: () => void;
  /** Absent when the shell didn't provide a route — the modal then just confirms. */
  onEnterStudio?: () => void;
}

/**
 * What happens after a project-free mode makes a project.
 *
 * Both upgrade paths — Browse's "Import into project" and Editor's "Save as project"
 * — end the same way: the project is on disk and the mode has nothing more to offer
 * it. Studio is the answer, but going there is the user's call: it wants a folder
 * permission back and it is the heaviest surface in the app.
 */
export const ProjectCreatedModal: React.FC<ProjectCreatedModalProps> = ({
  projectName,
  onDismiss,
  onEnterStudio,
}) => (
  <ConfirmModal
    isOpen={projectName !== null}
    onClose={onDismiss}
    onConfirm={() => {
      onDismiss();
      onEnterStudio?.();
    }}
    title="Project created"
    message={
      <span>
        <strong>{projectName}</strong> is on your drive, in <span className="font-mono">Projects/</span>.
        {onEnterStudio
          ? ' Open Studio to keep working on it — tapes, the full grid, and building the card.'
          : ' Open Studio from the hub to keep working on it.'}
      </span>
    }
    confirmLabel={onEnterStudio ? 'Open Studio' : 'Got it'}
    showCancel={!!onEnterStudio}
  />
);
