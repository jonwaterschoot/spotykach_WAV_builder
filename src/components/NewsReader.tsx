import React from 'react';
import { Calendar, Pin } from 'lucide-react';
import { resolveAssetPath } from '../utils/assetUtils';
import type { NewsItem } from '../utils/newsFeed';
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
