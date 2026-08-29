import React, { useEffect, useState } from 'react';
import { Calendar, Check, Link2, Pin } from 'lucide-react';
import { resolveAssetPath } from '../utils/assetUtils';
import { newsPermalink, type NewsItem } from '../utils/newsFeed';
import { NewsArticle } from './NewsArticle';

interface NewsReaderProps {
    items: NewsItem[];
    /** Markdown body per item id, as `fetchNewsFeed` returns it. */
    content: Record<string, string>;
    activeId: string | null;
    onSelect: (id: string) => void;
}

/**
 * The news reader: an index of every post, then the one being read.
 *
 * Shared by the Studio modal and the hub's inline section, because the difference
 * between the two was never the reading — it was the chrome around it. The hub had
 * its own banner-and-picker layout and the modal had a featured hero beside a column
 * of cards, which meant two places to change whenever an article gained an image or
 * a category.
 *
 * The index is a list of lines rather than a grid of bordered cards with avatar
 * squares and chevrons. Ten posts drawn as cards took as much vertical room as the
 * article they were pointing at — on the hub, below the doors, that was most of the
 * screen spent on a table of contents. A table of contents is a list.
 *
 * The image belongs to the article, not to the picker. Drawing it here means every
 * post that has one shows it, instead of only whichever post happened to be pinned.
 */
/**
 * Copy this article's link.
 *
 * The address bar already carries the link on the hub, but not in the Studio
 * modal, and "copy the URL out of the bar, then delete the part that isn't the
 * article" is not something anyone does. The button says what it did on itself
 * rather than through a toast, so the reader stays a presentational component
 * with no toast context to thread through two very different parents.
 */
const CopyLinkButton: React.FC<{ item: NewsItem }> = ({ item }) => {
    const [copied, setCopied] = useState(false);

    // Clears itself. Switching articles resets it too — the caller keys this by
    // article id, so a different post gets a fresh button rather than one still
    // saying "Copied" about the last one.
    useEffect(() => {
        if (!copied) return;
        const timer = window.setTimeout(() => setCopied(false), 2000);
        return () => window.clearTimeout(timer);
    }, [copied]);

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(newsPermalink(item));
            setCopied(true);
        } catch {
            // No clipboard (an insecure origin, or permission refused). The link is
            // on the anchor itself, so "copy link address" from the context menu
            // still gets it.
            console.warn('[News] Could not write the link to the clipboard.');
        }
    };

    return (
        <a
            href={newsPermalink(item)}
            onClick={e => { e.preventDefault(); void copy(); }}
            title="Copy a link to this post"
            className="ml-auto flex items-center gap-1.5 rounded px-1.5 py-1 -mr-1.5 text-gray-500 hover:text-synthux-yellow hover:bg-white/[0.06] transition-colors
                focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
        >
            {copied ? <Check size={12} className="text-synthux-green" /> : <Link2 size={12} />}
            <span className="text-[10px] font-bold uppercase tracking-widest">
                {copied ? 'Copied' : 'Copy link'}
            </span>
        </a>
    );
};

export const NewsReader: React.FC<NewsReaderProps> = ({ items, content, activeId, onSelect }) => {
    const activeItem = items.find(i => i.id === activeId) || items[0];
    if (!activeItem) return null;

    return (
        <div className="space-y-5">

            {/* The index */}
            <ul className="grid gap-x-4 sm:grid-cols-2">
                {items.map(item => {
                    const isActive = item.id === activeItem.id;
                    return (
                        <li key={item.id}>
                            <button
                                onClick={() => onSelect(item.id)}
                                className={`w-full flex items-center gap-2.5 py-1.5 px-2 -mx-2 rounded text-left transition-colors
                                    focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40
                                    ${isActive
                                        ? 'text-white bg-white/[0.06]'
                                        : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'}`}
                            >
                                <span
                                    aria-hidden
                                    className={`shrink-0 w-1.5 h-1.5 rounded-full transition-colors
                                        ${isActive ? 'bg-synthux-orange' : 'bg-white/15'}`}
                                />
                                <span className="shrink-0 font-mono text-[10px] tabular-nums text-gray-600">
                                    {item.date}
                                </span>
                                <span className="min-w-0 flex-1 truncate text-[13px] leading-snug">
                                    {item.title}
                                </span>
                                {item.pinned && (
                                    <Pin size={10} className="shrink-0 text-synthux-orange/60" />
                                )}
                            </button>
                        </li>
                    );
                })}
            </ul>

            {/* The article */}
            <article className="rounded-xl border border-white/10 bg-synthux-panel/60 overflow-hidden">
                {activeItem.image && (
                    <div className="relative h-44 sm:h-56">
                        <img
                            src={resolveAssetPath(`/news/${activeItem.image}`)}
                            alt={activeItem.title}
                            className="w-full h-full object-cover opacity-70"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-synthux-panel via-synthux-panel/40 to-transparent" />
                    </div>
                )}

                <div className="p-5 sm:p-7">
                    <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest text-synthux-orange/80 mb-3">
                        <Calendar size={12} />
                        {new Date(activeItem.date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                        <span className="text-white/10">•</span>
                        <span className="text-gray-500">{activeItem.category || 'Update'}</span>
                        <CopyLinkButton key={activeItem.id} item={activeItem} />
                    </div>

                    {/*
                     * No title here. Every article opens with its own `# ` heading, which
                     * NewsArticle renders as the big yellow header — printing the manifest
                     * title above it said the same thing twice, in two different voices.
                     * The manifest title is what the index above shows.
                     */}
                    <NewsArticle markdown={content[activeItem.id] || ''} />
                </div>
            </article>
        </div>
    );
};

export default NewsReader;
