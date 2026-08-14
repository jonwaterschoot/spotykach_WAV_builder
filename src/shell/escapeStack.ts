import { useEffect, useRef } from 'react';

/**
 * A global Escape dispatch stack.
 *
 * The studio shell resolves Escape with a hand-ordered `if` chain over ~15 boolean
 * flags. That chain can't grow to cover modes, and two window listeners racing each
 * other is worse. Instead every surface registers a layer here: the most recently
 * mounted layer gets Escape first, and a layer that doesn't consume the key returns
 * `false` to let the one below it try.
 *
 * Returning `true` means "I closed something, stop here".
 */
export type EscapeHandler = () => boolean;

interface EscapeLayer {
  handler: EscapeHandler;
}

const layers: EscapeLayer[] = [];
let listening = false;

const onKeyDown = (e: KeyboardEvent) => {
  if (e.key !== 'Escape') return;
  // Iterate over a snapshot: a handler may unmount layers while we walk the stack.
  for (const layer of [...layers].reverse()) {
    if (layer.handler()) return;
  }
};

const pushLayer = (layer: EscapeLayer) => {
  layers.push(layer);
  if (!listening) {
    window.addEventListener('keydown', onKeyDown);
    listening = true;
  }
};

const removeLayer = (layer: EscapeLayer) => {
  const index = layers.indexOf(layer);
  if (index >= 0) layers.splice(index, 1);
  if (layers.length === 0 && listening) {
    window.removeEventListener('keydown', onKeyDown);
    listening = false;
  }
};

/**
 * Register an Escape layer for as long as `active` is true. The handler is read
 * through a ref, so it always sees fresh state without re-registering the layer
 * (and without a dependency list that has to be maintained by hand).
 */
export function useEscapeLayer(active: boolean, handler: EscapeHandler) {
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    if (!active) return;
    const layer: EscapeLayer = { handler: () => handlerRef.current() };
    pushLayer(layer);
    return () => removeLayer(layer);
  }, [active]);
}
