import React, { useEffect, useState } from 'react';
import { X, Newspaper, ExternalLink } from 'lucide-react';
import { fetchNewsFeed, featuredNewsItem, type NewsItem } from '../utils/newsFeed';
import { NewsReader } from './NewsReader';

interface NewsModalProps {
  onClose: () => void;
}

/**
 * The Studio news reader, opened from the header button.
 *
 * It no longer auto-opens: since v4 the hub shows news inline beneath the doors
 * (see HubNews), so there is one route to the same content instead of two, and
 * no "don't show on start" preference to keep in sync.
 *
 * The reading is `NewsReader`, shared with the hub. What is left here is the
 * dialog — its frame, its title bar and its footer.
 */
export const NewsModal: React.FC<NewsModalProps> = ({ onClose }) => {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [content, setContent] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    fetchNewsFeed()
      .then(({ items, content }) => {
        setNews(items);
        setContent(content);
        const featured = featuredNewsItem(items);
        if (featured) setSelectedId(featured.id);
      })
      .catch(error => console.error('Failed to fetch news:', error))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[110] p-4 md:p-8">
      <div className="bg-synthux-panel border border-white/10 rounded-3xl w-full max-w-5xl h-[90vh] shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-300">

        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-white/5 bg-white/5 shrink-0">
          <div className="flex items-center gap-4">
            <div className="bg-gradient-to-br from-synthux-orange to-synthux-yellow p-2 rounded-xl shadow-lg shadow-synthux-orange/20">
              <Newspaper size={20} className="text-black" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white font-header tracking-tight uppercase">
                Spotykach WAV.builder <span className="text-synthux-orange">News</span>
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-full transition-all text-gray-400 hover:text-white group"
          >
            <X size={20} className="group-hover:rotate-90 transition-transform duration-300" />
          </button>
        </div>

        {/* Main Content (Scrollable) */}
        <div className="flex-1 overflow-y-auto bg-gradient-to-b from-transparent to-black/20">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full space-y-4">
              <div className="w-10 h-10 border-2 border-synthux-orange/30 border-t-synthux-orange rounded-full animate-spin"></div>
              <p className="text-gray-500 font-medium animate-pulse text-sm">Loading updates...</p>
            </div>
          ) : (
            <div className="p-5 md:p-8 pb-16 max-w-3xl mx-auto">
              <NewsReader
                items={news}
                content={content}
                activeId={selectedId}
                onSelect={setSelectedId}
              />
            </div>
          )}
        </div>

        {/* Sticky Footer */}
        <div className="p-4 border-t border-white/5 bg-black/40 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-2 text-gray-500 text-[10px] font-bold uppercase tracking-widest">
            <div className="w-2 h-2 rounded-full bg-synthux-green animate-pulse" />
            <span>Stay up to date with my development</span>
          </div>
          <a
            href="https://github.com/jonwaterschoot/spotykach_WAV_builder/blob/main/CHANGELOG.md"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-synthux-yellow hover:text-white text-[10px] font-bold uppercase tracking-widest transition-colors group"
          >
            Full Changelog
            <ExternalLink size={12} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </a>
        </div>
      </div>
    </div>
  );
};
