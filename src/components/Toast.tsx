import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Check, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'neutral' | 'warning';

export interface ToastData {
    id: string;
    msg: string;
    type: ToastType;
}

interface ToastProps {
    toasts: ToastData[];
    onRemove: (id: string) => void;
}

const ToastItem = ({ msg, type = 'info', onRemove, duration = 3000 }: { msg: string, type?: ToastType, onRemove: () => void, duration?: number }) => {
    useEffect(() => {
        const timer = setTimeout(onRemove, duration);
        return () => clearTimeout(timer);
    }, [duration, onRemove]);

    const bgColors = {
        success: 'bg-synthux-main border-synthux-green text-green-400',
        error: 'bg-synthux-main border-red-500 text-red-400',
        info: 'bg-synthux-main border-synthux-blue text-synthux-blue',
        neutral: 'bg-synthux-panel border-gray-600 text-gray-300',
        warning: 'bg-synthux-main border-synthux-yellow text-synthux-yellow'
    };

    const icons = {
        success: <Check size={18} />,
        error: <AlertTriangle size={18} />,
        info: <Info size={18} />,
        neutral: <Info size={18} />,
        warning: <AlertTriangle size={18} />
    };

    return (
        <div
            className={`flex items-center gap-3 px-4 py-3 rounded-lg border shadow-2xl w-auto max-w-[90vw] md:max-w-md animate-[toast-slide-in_0.3s_ease-out] ${bgColors[type]}`}
        >
            {icons[type]}
            <span className="font-medium text-sm text-gray-200">{msg}</span>
            <button onClick={onRemove} className="ml-2 hover:bg-white/10 p-1 rounded transition-colors">
                <X size={14} />
            </button>
        </div>
    );
};

export const Toast = ({ toasts, onRemove }: ToastProps) => {
    const portalRoot = document.getElementById('unfiltered-portal-root');
    if (!portalRoot) return null;

    return createPortal(
        <div className="!fixed top-8 left-1/2 -translate-x-1/2 z-[10002] flex flex-col gap-2 items-center pointer-events-none">
            {toasts.map((toast) => (
                <div key={toast.id} className="pointer-events-auto">
                    <ToastItem
                        msg={toast.msg}
                        type={toast.type}
                        onRemove={() => onRemove(toast.id)}
                    />
                </div>
            ))}
        </div>,
        portalRoot
    );
};
