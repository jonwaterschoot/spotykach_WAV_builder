import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

interface DropdownItem {
  label?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  destructive?: boolean;
  type?: 'item' | 'divider' | 'header';
}

interface DropdownProps {
  label: React.ReactNode;
  items: DropdownItem[];
  className?: string;
  buttonClassName?: string;
  align?: 'left' | 'right';
  iconOnly?: boolean;
  /** Opens while the pointer is over it (mouse only); a click still toggles it. */
  openOnHover?: boolean;
  /** Tooltip and accessible name, for an icon-only button. */
  title?: string;
}

export const Dropdown = ({ 
  label, 
  items, 
  className = '', 
  buttonClassName = '', 
  align = 'right',
  iconOnly = false,
  openOnHover = false,
  title,
}: DropdownProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The mouse is over it: a click then keeps the hover-opened menu open instead of closing it. */
  const hovered = useRef(false);

  // A short delay on leave, so crossing the gap to the menu doesn't close it.
  const hover = openOnHover ? {
    onPointerEnter: (e: React.PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      hovered.current = true;
      if (closeTimer.current) clearTimeout(closeTimer.current);
      setIsOpen(true);
    },
    onPointerLeave: (e: React.PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      hovered.current = false;
      closeTimer.current = setTimeout(() => setIsOpen(false), 200);
    },
  } : {};

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={`relative ${className}`} ref={containerRef} {...hover}>
      <button
        onClick={() => setIsOpen(open => (openOnHover && hovered.current) || !open)}
        title={title}
        aria-label={iconOnly ? title : undefined}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-gray-300 hover:text-white hover:bg-white/5 text-[11px] font-bold uppercase tracking-wider transition-all ${buttonClassName} ${isOpen ? 'bg-white/10 text-white' : ''}`}
      >
        {label}
        {!iconOnly && <ChevronDown size={12} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />}
      </button>

      {isOpen && openOnHover && <div className="absolute top-full left-0 right-0 h-2" aria-hidden />}
      {isOpen && (
        <div role="menu" className={`
          absolute top-full mt-1 w-48 bg-[#1a1a1a] border border-white/10 rounded-lg shadow-2xl z-[100] py-1 overflow-hidden 
          animate-in fade-in zoom-in-95 duration-100 origin-top
          ${align === 'right' ? 'right-0' : 'left-0'}
        `}>
          {/* Subtle noise texture overlay for the dropdown */}
          <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[url('/img/highrestexture_tapenoisevhs_whitetrans.png')] bg-cover mix-blend-overlay" />
          
          <div className="relative z-10">
            {items.map((item, index) => {
              if (item.type === 'divider') {
                return <div key={index} className="h-px bg-white/10 my-1 mx-2" />;
              }
              if (item.type === 'header') {
                return (
                  <div key={index} className="px-4 py-1.5 text-[9px] font-bold text-gray-500 uppercase tracking-[0.2em] select-none">
                    {item.label}
                  </div>
                );
              }
              return (
                <button
                  key={index}
                  onClick={() => {
                    item.onClick?.();
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-left transition-all
                    ${item.destructive ? 'text-red-400 hover:bg-red-500/10' : 'text-gray-400 hover:bg-white/5 hover:text-white'}
                  `}
                >
                  {item.icon && <span className="shrink-0 opacity-70 group-hover:opacity-100">{item.icon}</span>}
                  <span className="flex-1">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
