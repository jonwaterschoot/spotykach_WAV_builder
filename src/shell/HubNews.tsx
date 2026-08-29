import React, { useEffect, useState } from 'react';
import { ExternalLink, Newspaper } from 'lucide-react';
import { fetchNewsFeed, featuredNewsItem, type NewsItem } from '../utils/newsFeed';
import { NewsReader } from '../components/NewsReader';

/**
 * News, inline beneath the hub's doors.
 *
 * v4 replaces the auto-opening modal with this: the same content, but it can't
 * stand between a first-time visitor and the doors. The modal survives only as a
 * Studio header button (see NewsModal), so there is one source of articles and no
 * "show on start" preference to keep in sync.
 *
 * The reading itself is `NewsReader`, shared with that modal — this file is the
 * heading, the changelog link, and the fetch.
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

  return (
    <section className="mt-14 border-t border-white/10 pt-10">
      <div className="flex items-center justify-between gap-4 mb-5">
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

      <NewsReader
        items={news}
        content={content}
        activeId={selectedId}
        onSelect={setSelectedId}
      />
    </section>
  );
};

export default HubNews;
