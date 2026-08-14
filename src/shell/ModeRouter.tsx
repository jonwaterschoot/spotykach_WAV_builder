import React, { Suspense } from 'react';
import { Loader } from 'lucide-react';
import { HubScreen } from './HubScreen';
import type { AppMode } from './useAppMode';

// The studio shell is the whole of App.tsx. Lazy so the hub — and the lighter
// modes — don't pay for it.
const StudioMode = React.lazy(() => import('../App'));
const BrowseMode = React.lazy(() => import('../modes/BrowseMode'));
const PresetsMode = React.lazy(() => import('../modes/PresetsMode'));

const ModeLoading: React.FC = () => (
  <div className="h-screen w-full flex items-center justify-center bg-synthux-main text-gray-500">
    <Loader size={20} className="animate-spin" />
  </div>
);

interface ModeRouterProps {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
}

export const ModeRouter: React.FC<ModeRouterProps> = ({ mode, setMode }) => {
  if (mode === 'hub') {
    return <HubScreen onEnter={setMode} />;
  }

  if (mode === 'browse') {
    return (
      <Suspense fallback={<ModeLoading />}>
        <BrowseMode onExitToHub={() => setMode('hub')} />
      </Suspense>
    );
  }

  if (mode === 'presets') {
    return (
      <Suspense fallback={<ModeLoading />}>
        <PresetsMode onExitToHub={() => setMode('hub')} />
      </Suspense>
    );
  }

  // `config` (Phase 5) and `editor` (Phase 6) fall through to Studio until their
  // mode lands. Each phase replaces one line here.
  return (
    <Suspense fallback={<ModeLoading />}>
      <StudioMode onExitToHub={() => setMode('hub')} />
    </Suspense>
  );
};
