import React, { useEffect, useState } from 'react';
import { X, Newspaper, ChevronRight, ExternalLink, Calendar, Info } from 'lucide-react';
import { resolveAssetPath } from '../utils/assetUtils';
import { fetchNewsFeed, featuredNewsItem, type NewsItem } from '../utils/newsFeed';
import { NewsArticle } from './NewsArticle';

interface NewsModalProps {
  onClose: () => void;
}

/**
 * The Studio news reader, opened from the header button.
 *
 * It no longer auto-opens: since v4 the hub shows news inline beneath the doors
 * (see HubNews), so there is one route to the same content instead of two, and
 * no "don't show on start" preference to keep in sync.
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

  const featuredItem = featuredNewsItem(news);
  // Show all items except featured in the history list
  const historyItems = news.filter(i => i.id !== (featuredItem?.id));
  const activeItem = news.find(i => i.id === selectedId);

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
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-full transition-all text-gray-400 hover:text-white group"
            >
              <X size={20} className="group-hover:rotate-90 transition-transform duration-300" />
            </button>
          </div>
        </div>

        {/* Main Content (Scrollable) */}
        <div
          className="flex-1 overflow-y-auto bg-gradient-to-b from-transparent to-black/20"
        >
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full space-y-4">
              <div className="w-10 h-10 border-2 border-synthux-orange/30 border-t-synthux-orange rounded-full animate-spin"></div>
              <p className="text-gray-500 font-medium animate-pulse text-sm">Loading updates...</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {/* Overview Section */}
              {news.length > 0 && (
                <div className="p-4 md:p-6 bg-black/20 border-b border-white/5 shrink-0">
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch h-full">
                    {/* Featured / Pinned Item */}
                    {featuredItem && (
                      <div
                        onClick={() => setSelectedId(featuredItem.id)}
                        className={`md:col-span-7 relative group cursor-pointer overflow-hidden rounded-2xl border transition-all duration-300 h-[320px] ${selectedId === featuredItem.id ? 'border-synthux-orange ring-1 ring-synthux-orange' : 'border-white/10 hover:border-white/30'}`}
                      >
                        <div className="w-full h-full relative">
                          {featuredItem.image ? (
                            <img
                              src={resolveAssetPath(`/news/${featuredItem.image}`)}
                              alt={featuredItem.title}
                              className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity"
                            />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-synthux-orange/20 to-synthux-yellow/20" />
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                          <div className="absolute bottom-0 left-0 p-4 space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 bg-synthux-orange text-black text-[9px] font-black uppercase tracking-wider rounded">Featured Update</span>
                            </div>
                            <h3 className="text-lg font-bold text-white leading-tight group-hover:text-synthux-yellow transition-colors font-header">{featuredItem.title}</h3>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* News History List */}
                    <div className="md:col-span-5 flex flex-col h-[320px]">
                      <div className="flex items-center justify-between mb-3 px-1">
                        <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-gray-400">Update History</h3>
                        <span className="text-[10px] font-bold text-synthux-yellow/50 bg-synthux-yellow/5 px-2 py-0.5 rounded-full">{historyItems.length} Posts</span>
                      </div>
                      <div className="flex-1 grid grid-cols-1 gap-1.5 overflow-y-auto pr-2 custom-scrollbar">
                        {historyItems.map(item => (
                          <button
                            key={item.id}
                            onClick={() => setSelectedId(item.id)}
                            className={`flex items-center gap-3 p-2 rounded-xl border text-left transition-all duration-200 shrink-0 ${selectedId === item.id ? 'bg-synthux-orange/15 border-synthux-orange/50 text-white shadow-[0_0_10px_rgba(245,139,68,0.1)]' : 'bg-white/5 border-white/5 hover:bg-white/10 text-gray-400 hover:text-white'}`}
                          >
                            <div className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center font-bold text-[10px] ${selectedId === item.id ? 'bg-synthux-orange text-black' : 'bg-white/5 text-gray-500'}`}>
                              {item.category?.charAt(0) || 'U'}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-[8px] font-bold uppercase tracking-widest opacity-40">{item.date}</div>
                              <div className="text-[13px] font-bold truncate leading-tight">{item.title}</div>
                            </div>
                            <ChevronRight size={12} className={`ml-auto shrink-0 transition-transform ${selectedId === item.id ? 'translate-x-1' : 'opacity-10'}`} />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Article Content Area */}
              <div className="p-6 md:p-10 pb-20">
                {activeItem ? (
                  <article className="max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-widest text-synthux-orange/80 mb-8 border-b border-white/5 pb-4">
                      <Calendar size={14} />
                      {new Date(activeItem.date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                      <span className="text-white/10">•</span>
                      <span className="text-gray-500">{activeItem.category || 'Update'}</span>
                    </div>

                    <NewsArticle markdown={content[activeItem.id] || ''} />
                  </article>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-gray-500 py-20">
                    <Info size={40} className="mb-4 opacity-20" />
                    <p>Select an update to read more.</p>
                  </div>
                )}
              </div>
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
