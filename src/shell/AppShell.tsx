import React from 'react';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ModeRouter } from './ModeRouter';
import { useAppMode } from './useAppMode';

/**
 * The root of the app. Owns nothing but the current mode — no project, no state,
 * no filesystem handles. Everything heavier is mounted by the mode that needs it.
 */
export const AppShell: React.FC = () => {
  const { mode, setMode } = useAppMode();
  return (
    <ErrorBoundary>
      <ModeRouter mode={mode} setMode={setMode} />
    </ErrorBoundary>
  );
};
