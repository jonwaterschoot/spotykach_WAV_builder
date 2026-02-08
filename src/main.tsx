import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
// Polyfill for Touch Drag & Drop
import { polyfill } from "mobile-drag-drop";
import { scrollBehaviourDragImageTranslateOverride } from "mobile-drag-drop/scroll-behaviour";

polyfill({
  dragImageTranslateOverride: scrollBehaviourDragImageTranslateOverride,
  holdToDrag: 300 // Press and hold to drag (allows scrolling)
});

// Fix for iOS preventing scrolling when dragging
window.addEventListener("touchmove", function () { }, { passive: false });

import { AudioPlayerProvider } from './contexts/AudioPlayerContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AudioPlayerProvider>
      <App />
    </AudioPlayerProvider>
  </StrictMode>,
)
