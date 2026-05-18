import React, { useEffect, useState } from 'react';
import { X, Newspaper, ChevronRight, ExternalLink, Calendar, Info } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { resolveAssetPath } from '../utils/assetUtils';

interface NewsItem {
  id: string;
  date: string;
  title: string;
  file: string;
  image?: string;
  pinned?: boolean;
  category?: string;
}

interface NewsModalProps {
  onClose: () => void;
}

export const NewsModal: React.FC<NewsModalProps> = ({ onClose }) => {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [content, setContent] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showOnStart, setShowOnStart] = useState<boolean>(() => {
    return localStorage.getItem('spotykach_show_news_on_start') !== 'false';
  });

  useEffect(() => {
    const fetchNews = async () => {
      try {
        const response = await fetch(resolveAssetPath('/news/news-manifest.json'));
        const manifest: NewsItem[] = await response.json();
        setNews(manifest);

        // Find featured (pinned) item or default to first
        const featured = manifest.find(i => i.pinned) || manifest[0];
        if (featured) setSelectedId(featured.id);

        // Fetch content for each news item
        const contentMap: Record<string, string> = {};
        for (const item of manifest) {
          try {
            const res = await fetch(resolveAssetPath(`/news/${item.file}`));
            if (res.ok) {
              const text = await res.text();
              contentMap[item.id] = text;
            }
          } catch (e) {
            console.error(`Failed to fetch content for ${item.id}`, e);
          }
        }
        setContent(contentMap);
      } catch (error) {
        console.error('Failed to fetch news:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchNews();
  }, []);

  const featuredItem = news.find(i => i.pinned) || news[0];
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

                    <div className="prose prose-invert max-w-none 
                      prose-h1:text-3xl prose-h1:font-bold prose-h1:text-synthux-yellow prose-h1:mt-8 prose-h1:mb-4 prose-h1:font-header prose-h1:uppercase prose-h1:tracking-tight
                      prose-h2:text-xl prose-h2:font-bold prose-h2:text-synthux-orange prose-h2:mt-6 prose-h2:mb-3 prose-h2:font-header prose-h2:uppercase prose-h2:tracking-tight
                      prose-p:text-gray-300 prose-p:leading-relaxed prose-p:text-lg prose-p:my-5
                      prose-ul:list-disc prose-ul:pl-6 prose-ul:my-5
                      prose-li:text-gray-300 prose-li:my-2
                      prose-strong:text-white prose-strong:font-bold
                      prose-em:italic prose-em:opacity-80
                      prose-a:text-synthux-yellow prose-a:no-underline hover:prose-a:underline prose-a:font-bold
                      prose-img:rounded-3xl prose-img:border prose-img:border-white/10 prose-img:shadow-2xl prose-img:my-10
                      prose-video:rounded-3xl prose-video:border prose-video:border-white/10 prose-video:shadow-2xl prose-video:my-10 prose-video:w-full
                    ">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeRaw]}
                        components={{
                          video: ({ node, ...props }) => {
                            const resolvedSrc = props.src ? (props.src.startsWith('http') || props.src.startsWith('/') ? resolveAssetPath(props.src) : resolveAssetPath(`/news/${props.src}`)) : '';
                            return <video {...props} src={resolvedSrc} />;
                          },
                          img: ({ node, ...props }) => {
                            const resolvedSrc = props.src ? (props.src.startsWith('http') || props.src.startsWith('/') ? resolveAssetPath(props.src) : resolveAssetPath(`/news/${props.src}`)) : '';
                            return <img {...props} src={resolvedSrc} />;
                          },
                          a: ({ node, ...props }) => {
                            return <a {...props} target="_blank" rel="noreferrer" />;
                          }
                        }}
                      >
                        {content[activeItem.id] || ''}
                      </ReactMarkdown>
                    </div>
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
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer group">
              <div className="relative flex items-center justify-center">
                <input
                  type="checkbox"
                  checked={!showOnStart}
                  onChange={(e) => {
                    const newVal = !e.target.checked;
                    setShowOnStart(newVal);
                    localStorage.setItem('spotykach_show_news_on_start', String(newVal));
                  }}
                  className="peer appearance-none w-4 h-4 rounded border border-white/20 bg-white/5 checked:bg-synthux-orange checked:border-synthux-orange transition-all"
                />
                <X size={10} className="absolute text-black opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 group-hover:text-white transition-colors">Don't show on start</span>
            </label>

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
    </div>
  );
};
