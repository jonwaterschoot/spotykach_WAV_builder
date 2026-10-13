import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { AppShell } from './shell/AppShell'
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
import { isUsbTransferEnabled } from './lib/usb/flag'

// Experimental: USB transfer, behind Settings ▸ System (or ?usb=1) until the firmware is released.
// The console helper loads at startup only, so it needs a reload after turning the switch on.
if (isUsbTransferEnabled()) void import('./lib/usb/devConsole').then(m => m.installUsbConsole());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AudioPlayerProvider>
      <AppShell />
    </AudioPlayerProvider>
  </StrictMode>,
)
