import { useCallback, useState } from 'react';
import type { ToastData, ToastType } from '../components/Toast';

const newId = () => Math.random().toString(36).substring(2, 11);

/**
 * Toast queue for the modes.
 *
 * `showToast` lives in App.tsx alongside the rest of the studio's state, which the
 * project-free modes can't reach. Same `Toast` component, same shape — the modes
 * just own their own short list.
 */
export function useToasts() {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const showToast = useCallback((msg: string, type: ToastType = 'info') => {
    setToasts(prev => [...prev, { id: newId(), msg, type }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return { toasts, showToast, removeToast };
}
