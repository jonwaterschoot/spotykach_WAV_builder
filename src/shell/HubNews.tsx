import React, { useEffect, useState } from 'react';
import { Calendar, ChevronRight, ExternalLink, Newspaper } from 'lucide-react';
import { resolveAssetPath } from '../utils/assetUtils';
import { fetchNewsFeed, featuredNewsItem, type NewsItem } from '../utils/newsFeed';
import { NewsArticle } from '../components/NewsArticle';

/**
 * News, inline beneath the hub's doors.
 *
 * v4 replaces the auto-opening modal with this: the same content, but it can't
 * stand between a first-time visitor and the four doors. The modal survives only
 * as a Studio header button (see NewsModal), so there is one source of articles
 * and no "show on start" preference to keep in sync.
 *
 * Renders nothing at all when the feed is empty or unreachable — the hub must
 * work offline and on a fork with no news folder.
 */
export const HubNews: React.FC = () => {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [content, setContent] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchNewsFeed()
      .then(({ items, content }) => {
        if (cancelled) return;
        setNews(items);
        setContent(content);
        const featured = featuredNewsItem(items);
        if (featured) setSelectedId(featured.id);
      })
      .catch(error => console.error('Failed to fetch news:', error));
    return () => { cancelled = true; };
  }, []);

  if (news.length === 0) return null;

  const activeItem = news.find(i => i.id === selectedId) || news[0];
  const otherItems = news.filter(i => i.id !== activeItem.id);

  return (
    <section className="mt-14 border-t border-white/10 pt-10">
      <div className="flex items-center justify-between gap-4 mb-6">
        <h2 className="flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-[0.2em] text-gray-400">
          <Newspaper size={14} className="text-synthux-orange" />
          What's new
        </h2>
        <a
          href="https://github.com/jonwaterschoot/spotykach_WAV_builder/blob/main/CHANGELOG.md"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-500 hover:text-synthux-yellow transition-colors"
        >
          Full changelog
          <ExternalLink size={11} />
        </a>
      </div>

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
           * The manifest title is still what the picker buttons below show.
           */}

          {/* The hub is a landing screen, not a reader: cap the body and let it scroll. */}
          <div className="max-h-[26rem] overflow-y-auto pr-2 custom-scrollbar">
            <NewsArticle markdown={content[activeItem.id] || ''} />
          </div>
        </div>
      </article>

      {otherItems.length > 0 && (
        <div className="mt-4 grid gap-1.5 sm:grid-cols-2">
          {otherItems.map(item => (
            <button
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              className="flex items-center gap-3 p-2.5 rounded-lg border border-white/5 bg-white/[0.03] text-left
                text-gray-400 hover:text-white hover:bg-white/[0.07] hover:border-white/15 transition-all
                focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            >
              <span className="w-7 h-7 shrink-0 rounded-md bg-white/5 text-gray-500 flex items-center justify-center font-bold text-[10px]">
                {item.category?.charAt(0) || 'U'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[8px] font-bold uppercase tracking-widest opacity-40">{item.date}</span>
                <span className="block text-[13px] font-bold truncate leading-tight">{item.title}</span>
              </span>
              <ChevronRight size={12} className="shrink-0 opacity-30" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
};

export default HubNews;
