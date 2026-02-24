import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Check, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'neutral';

interface ToastProps {
    message: string;
    type?: ToastType;
    onClose: () => void;
    duration?: number;
}

export const Toast = ({ message, type = 'info', onClose, duration = 3000 }: ToastProps) => {
    useEffect(() => {
        const timer = setTimeout(onClose, duration);
        return () => clearTimeout(timer);
    }, [duration, onClose]);

    const bgColors = {
        success: 'bg-synthux-main border-synthux-green text-green-400',
        error: 'bg-synthux-main border-red-500 text-red-400',
        info: 'bg-synthux-main border-synthux-blue text-synthux-blue',
        neutral: 'bg-synthux-panel border-gray-600 text-gray-300'
    };

    const icons = {
        success: <Check size={18} />,
        error: <AlertTriangle size={18} />,
        info: <Info size={18} />,
        neutral: <Info size={18} />
    };

    const portalRoot = document.getElementById('unfiltered-portal-root');
    if (!portalRoot) return null;

    return createPortal(
        <div
            className={`!fixed top-8 left-1/2 z-[10002] flex items-center gap-3 px-4 py-3 rounded-lg border shadow-2xl w-auto max-w-[90vw] md:max-w-md animate-[toast-slide-in_0.3s_ease-out] ${bgColors[type]}`}
            style={{ transform: 'translateX(-50%)' }}
        >
            {icons[type]}
            <span className="font-medium text-sm text-gray-200">{message}</span>
            <button onClick={onClose} className="ml-2 hover:bg-white/10 p-1 rounded transition-colors">
                <X size={14} />
            </button>
        </div>,
        portalRoot
    );
};
