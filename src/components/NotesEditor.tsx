import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { Bold, List, Heading1, Heading2, Check, Edit2, Italic, Underline, Strikethrough } from 'lucide-react';
import { mdToHtml } from '../utils/markdownUtils';

interface NotesEditorProps {
    value: string;
    onChange: (val: string) => void;
    placeholder?: string;
    minHeight?: string;
    title?: React.ReactNode;
    headerRightItem?: React.ReactNode;
    dragHandleClass?: string;
    fullHeight?: boolean;
    initialEdit?: boolean;
}

export const NotesEditor = ({ value, onChange, placeholder = "Add notes here...", minHeight = "120px", title, headerRightItem, dragHandleClass, fullHeight, initialEdit = false }: NotesEditorProps) => {
    const [explicitEdit, setExplicitEdit] = useState(initialEdit);

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const userResizedRef = useRef(false);
    const lastHeightRef = useRef<number | null>(null);

    const isEditView = explicitEdit;

    // Click outside to cancel edit mode
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setExplicitEdit(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Auto-resize Textarea
    const adjustHeight = () => {
        if (!textareaRef.current || fullHeight) return;
        if (userResizedRef.current && lastHeightRef.current) {
            textareaRef.current.style.height = `${lastHeightRef.current}px`;
            return;
        }

        textareaRef.current.style.height = 'auto'; // Reset to auto to measure
        const newHeight = Math.max(textareaRef.current.scrollHeight, parseInt(minHeight, 10) || 120);
        textareaRef.current.style.height = `${newHeight}px`;
    };

    const handleResizeStart = (e: React.MouseEvent) => {
        e.preventDefault();
        if (!textareaRef.current) return;

        const startY = e.clientY;
        const startHeight = textareaRef.current.clientHeight;

        const onMouseMove = (moveEvent: MouseEvent) => {
            if (!textareaRef.current) return;
            const deltaY = moveEvent.clientY - startY;
            const newHeight = Math.max(parseInt(minHeight, 10) || 120, startHeight + deltaY);
            textareaRef.current.style.height = `${newHeight}px`;
            lastHeightRef.current = newHeight;
            userResizedRef.current = true;
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    useLayoutEffect(() => {
        if (isEditView) {
            // Do not reset userResizedRef so it remembers manual resizes across toggles
            adjustHeight();
        }
    }, [isEditView]);

    const handleMouseUp = () => {
        // User might have selected text, we can check if they resized manually but
        // since we are using a custom drag handle, we don't strictly need to check
        // the native textarea resize grip anymore.
    };

    const handleAction = (action: string) => {
        if (!textareaRef.current) return;
        const ta = textareaRef.current;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const text = ta.value;

        let newText = text;

        const setSelection = (textStr: string, cursorStart: number, cursorEnd: number) => {
            onChange(textStr);
            setTimeout(() => {
                ta.focus();
                ta.setSelectionRange(cursorStart, cursorEnd);
                adjustHeight();
            }, 0);
        };

        let lineStart = start;
        while (lineStart > 0 && text[lineStart - 1] !== '\n') lineStart--;
        let lineEnd = end;
        while (lineEnd < text.length && text[lineEnd] !== '\n') lineEnd++;

        if (['bold', 'italic', 'underline', 'strikeThrough'].includes(action)) {
            const chars = action === 'bold' ? '**' : action === 'italic' ? '*' : action === 'underline' ? '__' : '~~';
            const charLen = chars.length;

            if (start === end) {
                // Find word boundaries
                let wordStart = start;
                let wordEnd = start;
                const boundaryRegex = /[\s\*_~#'"()\[\]]/;
                while (wordStart > 0 && !boundaryRegex.test(text[wordStart - 1])) wordStart--;
                while (wordEnd < text.length && !boundaryRegex.test(text[wordEnd])) wordEnd++;

                if (wordStart === wordEnd) { // cursor on white space or empty line
                    newText = text.substring(0, start) + chars + chars + text.substring(start);
                    setSelection(newText, start + charLen, start + charLen);
                } else {
                    const isWrapped =
                        wordStart >= charLen && text.substring(wordStart - charLen, wordStart) === chars &&
                        wordEnd <= text.length - charLen && text.substring(wordEnd, wordEnd + charLen) === chars;

                    if (isWrapped) {
                        newText = text.substring(0, wordStart - charLen) + text.substring(wordStart, wordEnd) + text.substring(wordEnd + charLen);
                        const diff = charLen;
                        setSelection(newText, Math.max(0, start - diff), Math.max(0, end - diff));
                    } else {
                        newText = text.substring(0, wordStart) + chars + text.substring(wordStart, wordEnd) + chars + text.substring(wordEnd);
                        const diff = start >= wordStart ? charLen : 0;
                        setSelection(newText, start + diff, end + diff);
                    }
                }
            } else {
                const selText = text.substring(start, end);
                const startsWithWrap = selText.startsWith(chars);
                const endsWithWrap = selText.endsWith(chars);

                const isSurrounded = start >= charLen && text.substring(start - charLen, start) === chars && text.substring(end, end + charLen) === chars;

                if (startsWithWrap && endsWithWrap && selText.length >= charLen * 2) {
                    newText = text.substring(0, start) + selText.substring(charLen, selText.length - charLen) + text.substring(end);
                    setSelection(newText, start, end - charLen * 2);
                } else if (isSurrounded) {
                    newText = text.substring(0, start - charLen) + selText + text.substring(end + charLen);
                    setSelection(newText, start - charLen, end - charLen);
                } else {
                    newText = text.substring(0, start) + chars + selText + chars + text.substring(end);
                    setSelection(newText, start + charLen, end + charLen);
                }
            }
        } else if (['H1', 'H2', 'list'].includes(action)) {
            const lineText = text.substring(lineStart, lineEnd);
            let newLineText = lineText;

            const isH1 = /^#\s/.test(lineText);
            const isH2 = /^##\s/.test(lineText);
            const isList = /^-\s/.test(lineText);

            newLineText = lineText.replace(/^(#|##|-)\s/, '');

            let addPrefix = '';
            if (action === 'H1' && !isH1) addPrefix = '# ';
            else if (action === 'H2' && !isH2) addPrefix = '## ';
            else if (action === 'list' && !isList) addPrefix = '- ';

            newLineText = addPrefix + newLineText;
            newText = text.substring(0, lineStart) + newLineText + text.substring(lineEnd);

            const diff = newLineText.length - lineText.length;
            const newPos = Math.max(lineStart, start + diff);
            setSelection(newText, newPos, Math.max(lineStart, end + diff));
        }
    };

    return (
        <div ref={containerRef} className={`flex flex-col w-full transition-all duration-300 relative ${isEditView ? 'bg-gray-900 border border-gray-800 rounded-xl shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]' : 'bg-transparent border border-transparent'} ${fullHeight ? 'h-full flex-1' : ''}`}>
            {(!isEditView && !title && !headerRightItem) ? (
                <div className="absolute top-2 right-2 z-20">
                    <button onClick={() => setExplicitEdit(true)} className="p-1.5 text-gray-500 hover:text-white hover:bg-white/10 rounded transition-colors bg-black/40 backdrop-blur-sm" title="Edit Notes">
                        <Edit2 size={13} />
                    </button>
                </div>
            ) : (
                <div className={`flex items-center justify-between px-3 py-2 transition-colors duration-300 relative z-10 ${dragHandleClass ? `${dragHandleClass} cursor-move` : ''} ${isEditView ? 'bg-black border-b border-gray-800 rounded-t-xl' : 'hover:bg-white/5 rounded-t-xl'}`}>
                    <div className="flex items-center gap-1 sm:gap-3 flex-wrap">

                        <div className="flex items-center">
                            {title && (
                                <div className="text-synthux-yellow font-bold uppercase tracking-wider text-sm mr-2 select-none">
                                    {title}
                                </div>
                            )}
                            {!isEditView && (
                                <button onClick={() => setExplicitEdit(true)} className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded transition-colors" title="Edit Notes">
                                    <Edit2 size={13} />
                                </button>
                            )}
                        </div>

                        {/* FORMATTING TOOLS */}
                        <div className={`flex items-center gap-1 transition-all duration-300 overflow-hidden ${isEditView ? 'opacity-100 max-w-[400px] ml-1' : 'opacity-0 max-w-0 m-0'}`}>
                            <button onMouseDown={(e) => { e.preventDefault(); handleAction('bold'); }} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors" title="Bold">
                                <Bold size={14} />
                            </button>
                            <button onMouseDown={(e) => { e.preventDefault(); handleAction('italic'); }} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors" title="Italic">
                                <Italic size={14} />
                            </button>
                            <button onMouseDown={(e) => { e.preventDefault(); handleAction('underline'); }} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors" title="Underline">
                                <Underline size={14} />
                            </button>
                            <button onMouseDown={(e) => { e.preventDefault(); handleAction('strikeThrough'); }} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors" title="Strikethrough">
                                <Strikethrough size={14} />
                            </button>
                            <button onMouseDown={(e) => { e.preventDefault(); handleAction('list'); }} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors" title="List">
                                <List size={14} />
                            </button>
                            <button onMouseDown={(e) => { e.preventDefault(); handleAction('H1'); }} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors" title="H1">
                                <Heading1 size={14} />
                            </button>
                            <button onMouseDown={(e) => { e.preventDefault(); handleAction('H2'); }} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors" title="H2">
                                <Heading2 size={14} />
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className={`transition-all duration-300 overflow-hidden ${isEditView ? 'opacity-100 max-w-[150px]' : 'opacity-0 max-w-0'}`}>
                            <button onClick={() => setExplicitEdit(false)} className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600/20 hover:bg-green-600/40 text-green-400 rounded-lg text-xs font-bold transition-colors">
                                <Check size={14} /> Apply
                            </button>
                        </div>
                        {headerRightItem}
                    </div>
                </div>
            )}

            <div className={`w-full relative flex flex-col transition-all duration-300 ${isEditView && !fullHeight ? 'pb-3' : ''} ${fullHeight ? 'flex-1 min-h-0' : ''}`} style={{ minHeight: fullHeight ? '100%' : (isEditView ? minHeight : 'auto') }}>
                {isEditView ? (
                    <>
                        <textarea
                            ref={textareaRef}
                            value={value}
                            onChange={(e) => {
                                onChange(e.target.value);
                                adjustHeight();
                            }}
                            onMouseUp={handleMouseUp}
                            placeholder={placeholder}
                            className={`w-full bg-transparent text-gray-300 p-3 pt-2 outline-none font-mono text-sm leading-relaxed resize-none overflow-auto ${fullHeight ? 'flex-1 h-full' : ''}`}
                            autoFocus
                        />
                        {/* Custom Resize Grabber */}
                        {!fullHeight && (
                            <div
                                onMouseDown={handleResizeStart}
                                className="absolute bottom-0 left-0 right-0 h-4 cursor-ns-resize flex items-center justify-center hover:bg-white/5 transition-colors rounded-b-xl z-10"
                                title="Drag to resize"
                            >
                                <div className="w-8 h-1 bg-gray-600 rounded-full opacity-50 block pointer-events-none" />
                            </div>
                        )}
                    </>
                ) : (
                    <div
                        className="w-full px-3 py-2 cursor-text text-sm leading-relaxed rounded-b-xl hover:bg-white/[0.02] transition-colors break-words overflow-hidden [&_h1]:text-lg [&_h1]:font-bold [&_h1]:text-synthux-yellow [&_h1]:mt-3 [&_h1]:mb-1 [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-synthux-orange [&_h2]:mt-2 [&_h2]:mb-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1 [&_b]:font-bold [&_b]:text-white [&_strong]:font-bold [&_strong]:text-white [&_i]:italic [&_i]:opacity-80 [&_em]:italic [&_u]:underline [&_s]:line-through [&>div]:min-h-[1.2em]"
                        onClick={() => { setExplicitEdit(true); }}
                        dangerouslySetInnerHTML={{ __html: value ? mdToHtml(value) : `<span class="opacity-50 text-sm">${placeholder}</span>` }}
                    />
                )}
            </div>
        </div>
    );
};
