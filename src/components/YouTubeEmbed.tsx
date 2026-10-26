import React, { useState } from 'react';
import { ExternalLink, Play } from 'lucide-react';
import { resolveAssetPath } from '../utils/assetUtils';

/**
 * Dev and preview serve `Cross-Origin-Embedder-Policy: require-corp` for ffmpeg,
 * which refuses a YouTube frame outright. A credentialless frame is allowed under
 * it (Chromium only; elsewhere the attribute is ignored). Spread rather than
 * written inline because React's iframe types don't know the attribute yet.
 */
const credentialless = { credentialless: '' };

interface YouTubeEmbedProps {
    id: string;
    start?: number;
    /** Shown on the placeholder and used as the frame's title. */
    title?: string;
    /**
     * A still of the post's own choosing. Without one it uses the still the build
     * downloaded (scripts/fetch-news-thumbnails.mjs), and without that, a drawn
     * placeholder. Never one fetched from YouTube in the reader's browser.
     */
    thumbnail?: string;
}

/**
 * A YouTube video in a news post, loaded only when someone asks for it.
 *
 * Until the click this is a self-hosted still: no frame, no script, no request to
 * Google, so opening the hub costs a visitor nothing they didn't choose. The click
 * swaps in the `youtube-nocookie.com` player with autoplay, so it still takes one
 * press to start watching.
 *
 * Posts write it as a link on a line of its own:
 *
 *     https://youtu.be/<id>
 *     [![What the video shows](images/<still>.jpg)](https://youtu.be/<id>)
 *
 * The first form gets the video's own still, downloaded at build time. The second
 * picks a different one from `/news/`, and reads as a clickable thumbnail on
 * GitHub too. See `NewsArticle` for the detection.
 */
export const YouTubeEmbed: React.FC<YouTubeEmbedProps> = ({ id, start = 0, title, thumbnail }) => {
    const [playing, setPlaying] = useState(false);
    // A video added since the last dev/build run has no still yet.
    const [stillMissing, setStillMissing] = useState(false);
    const still = stillMissing ? null : thumbnail || resolveAssetPath(`/news/youtube/${id}.jpg`);
    const label = title || 'YouTube video';
    const watchUrl = `https://www.youtube.com/watch?v=${id}${start ? `&t=${start}s` : ''}`;

    return (
        <figure className="not-prose my-10">
            <div className="relative aspect-video w-full overflow-hidden rounded-3xl border border-white/10 bg-black shadow-2xl">
                {playing ? (
                    <iframe
                        {...credentialless}
                        src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0${start ? `&start=${start}` : ''}`}
                        title={label}
                        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                        referrerPolicy="strict-origin-when-cross-origin"
                        allowFullScreen
                        className="absolute inset-0 h-full w-full"
                    />
                ) : (
                    <button
                        onClick={() => setPlaying(true)}
                        className="group absolute inset-0 flex h-full w-full items-center justify-center
                            focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/40"
                        aria-label={`Play ${label}`}
                    >
                        {still ? (
                            <img src={still} alt="" onError={() => setStillMissing(true)} className="absolute inset-0 h-full w-full object-cover opacity-70 transition-opacity group-hover:opacity-90" />
                        ) : (
                            <div className="absolute inset-0 bg-gradient-to-br from-synthux-panel to-black" />
                        )}
                        <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-synthux-orange/90 text-black shadow-xl transition-transform group-hover:scale-110">
                            <Play size={28} className="ml-1" fill="currentColor" />
                        </span>
                        {!still && title && (
                            <span className="absolute bottom-5 left-6 right-6 truncate text-left text-sm font-bold text-gray-300">
                                {title}
                            </span>
                        )}
                    </button>
                )}
            </div>
            <figcaption className="mt-2 flex items-center justify-between gap-3 px-1 text-[10px] font-bold uppercase tracking-widest text-gray-600">
                <span>{playing ? 'Playing from YouTube' : 'Plays from YouTube when you press play'}</span>
                <a
                    href={watchUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 hover:text-synthux-yellow transition-colors"
                >
                    Open on YouTube <ExternalLink size={11} />
                </a>
            </figcaption>
        </figure>
    );
};

export default YouTubeEmbed;
