import { useState } from 'react';
import { ChevronDown, Wrench, X } from 'lucide-react';
import { useEscapeLayer } from '../shell/escapeStack';

/**
 * The editor's tool menu: one button that names the open tool, opening a grouped
 * menu of all of them. Replaces a row of buttons that had outgrown the toolbar and
 * scrolled sideways. A dot marks a tool with work not applied yet.
 */

export interface EditorTool<Id extends string> {
    id: Id;
    label: string;
    icon: React.ReactNode;
    group: string;
    description: string;
    /** Unapplied work in this tool. */
    hasContent: boolean;
    /** Tailwind classes: text colour for the label, background for the dot and the open tool. */
    textColor: string;
    activeColor: string;
}

interface EditorToolPickerProps<Id extends string> {
    tools: EditorTool<Id>[];
    activeTool: Id | null;
    /** Opens a tool, or closes it when it is the open one. */
    onToggle: (id: Id) => void;
    setHelpText: (text: string) => void;
}

export function EditorToolPicker<Id extends string>({ tools, activeTool, onToggle, setHelpText }: EditorToolPickerProps<Id>) {
    const [open, setOpen] = useState(false);
    useEscapeLayer(open, () => { setOpen(false); return true; });

    const active = tools.find(t => t.id === activeTool) ?? null;
    const groups = [...new Set(tools.map(t => t.group))];
    const pending = tools.filter(t => t.hasContent && t.id !== activeTool);

    const pick = (id: Id) => {
        setOpen(false);
        onToggle(id);
    };

    return (
        <div className="flex items-center gap-3 min-w-0 w-full">
            <div className="relative shrink-0">
                <button
                    onClick={() => setOpen(o => !o)}
                    onMouseEnter={() => setHelpText('Pick an edit tool or effect')}
                    onMouseLeave={() => setHelpText('')}
                    aria-haspopup="menu"
                    aria-expanded={open}
                    className={`flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider border transition-colors
                        ${active ? `${active.activeColor} text-white border-transparent` : 'bg-gray-800/60 text-gray-300 border-gray-700 hover:bg-gray-800 hover:text-white'}`}
                >
                    {active ? active.icon : <Wrench size={13} />}
                    {active ? active.label : 'Tools'}
                    {pending.length > 0 && (
                        <span className="flex gap-0.5" aria-label={`${pending.length} tool${pending.length === 1 ? '' : 's'} with unapplied changes`}>
                            {pending.map(t => <span key={t.id} className={`w-1.5 h-1.5 rounded-full ${t.activeColor} ring-1 ring-black/40`} />)}
                        </span>
                    )}
                    <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>

                {open && (
                    <>
                        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                        <div role="menu"
                            className="absolute left-0 top-full mt-2 z-50 w-[40rem] max-w-[calc(100vw-6rem)] rounded-xl border border-gray-700
                                bg-[#161616] shadow-2xl shadow-black/60 p-3 grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-4">
                            {groups.map(group => (
                                <div key={group} className="min-w-0">
                                    <div className="px-2 pb-1.5 text-[9px] font-bold uppercase tracking-widest text-gray-600">{group}</div>
                                    <div className="space-y-0.5">
                                        {tools.filter(t => t.group === group).map(t => {
                                            const isActive = t.id === activeTool;
                                            return (
                                                <button key={t.id} role="menuitem" onClick={() => pick(t.id)}
                                                    className={`w-full text-left flex items-start gap-2 px-2 py-1.5 rounded-lg transition-colors
                                                        ${isActive ? 'bg-white/10' : 'hover:bg-white/5'}`}>
                                                    <span className={`mt-0.5 shrink-0 ${isActive || t.hasContent ? t.textColor : 'text-gray-400'}`}>{t.icon}</span>
                                                    <span className="min-w-0 flex-1">
                                                        <span className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider ${isActive ? 'text-white' : 'text-gray-300'}`}>
                                                            {t.label}
                                                            {t.hasContent && <span className={`w-1.5 h-1.5 rounded-full ${t.activeColor}`} />}
                                                        </span>
                                                        <span className="block text-[10px] leading-snug text-gray-500">{t.description}</span>
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {active && (
                <>
                    <span className="min-w-0 truncate text-[11px] text-gray-500">{active.description}</span>
                    <button
                        onClick={() => onToggle(active.id)}
                        onMouseEnter={() => setHelpText(`Close ${active.label}`)}
                        onMouseLeave={() => setHelpText('')}
                        className="ml-auto shrink-0 p-1.5 rounded-md text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"
                        aria-label={`Close ${active.label}`}
                    >
                        <X size={14} />
                    </button>
                </>
            )}
        </div>
    );
}
