import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, Newspaper } from 'lucide-react';
import { fetchNewsFeed, featuredNewsItem, newsItemFromParam, newsSlug, type NewsItem } from '../utils/newsFeed';
import { NewsReader } from '../components/NewsReader';
import { paramsFromHash } from './useAppMode';

/**
 * News, inline beneath the hub's doors.
 *
 * v4 replaces the auto-opening modal with this: the same content, but it can't
 * stand between a first-time visitor and the doors. The modal survives only as a
 * Studio header button (see NewsModal), so there is one source of articles and no
 * "show on start" preference to keep in sync.
 *
 * The reading itself is `NewsReader`, shared with that modal — this file is the
 * heading, the changelog link, the fetch, and the link handling.
 *
 * `#/?news=<slug>` opens on one article, the same way `#/presets?preset=<id>`
 * opens on one card. This is the hub, though, and news sits below the doors — a
 * link that lands at the top of the page and leaves the reader to find the post
 * themselves has not really gone anywhere, so an arriving link scrolls the
 * section into view. Selecting a post rewrites the hash so the address bar always
 * holds the link to what is on screen, with `replaceState` rather than a hash
 * assignment: reading down an index is browsing, and Back should return to
 * wherever the reader came from, not walk them back up eleven posts.
 *
 * Renders nothing at all when the feed is empty or unreachable — the hub must
 * work offline and on a fork with no news folder.
 */
export const HubNews: React.FC = () => {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [content, setContent] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const sectionRef = useRef<HTMLElement>(null);

  /** Point the address bar at the post on screen, without a history entry. */
  const writeHash = (item: NewsItem) => {
    const { pathname, search } = window.location;
    window.history.replaceState(null, '', `${pathname}${search}#/?news=${encodeURIComponent(newsSlug(item))}`);
  };

  useEffect(() => {
    let cancelled = false;
    fetchNewsFeed()
      .then(({ items, content }) => {
        if (cancelled) return;
        setNews(items);
        setContent(content);

        // A link to one post wins over the pinned one. An unrecognised slug — an
        // old link to a post that has since left the manifest — falls through to
        // the featured item rather than to an empty reader, and the hash is
        // rewritten so the address bar stops claiming otherwise.
        const requested = paramsFromHash(window.location.hash).get('news');
        const landing = newsItemFromParam(items, requested) || featuredNewsItem(items);
        if (!landing) return;
        setSelectedId(landing.id);
        if (requested) {
          writeHash(landing);
          // After paint: the article is what should be in view, and it does not
          // exist yet at this point in the same tick.
          requestAnimationFrame(() => sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
        }
      })
      .catch(error => console.error('Failed to fetch news:', error));
    return () => { cancelled = true; };
  }, []);

  // A news link pasted while the hub is already open changes the hash without
  // changing the mode, so nothing above would remount to notice it.
  useEffect(() => {
    const onHashChange = () => {
      const item = newsItemFromParam(news, paramsFromHash(window.location.hash).get('news'));
      if (item) setSelectedId(item.id);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [news]);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    const item = news.find(i => i.id === id);
    if (item) writeHash(item);
  };

  if (news.length === 0) return null;

  return (
    <section ref={sectionRef} className="mt-14 border-t border-white/10 pt-10">
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
        onSelect={handleSelect}
      />
    </section>
  );
};

export default HubNews;
