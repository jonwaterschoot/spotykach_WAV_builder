import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import type { Element } from 'hast';
import { resolveAssetPath } from '../utils/assetUtils';
import { parseYouTubeUrl } from '../utils/youtube';
import { YouTubeEmbed } from './YouTubeEmbed';

/** Article bodies reference their assets relative to `/news/`. */
const resolveNewsSrc = (src?: string) => {
    if (!src) return '';
    return src.startsWith('http') || src.startsWith('/')
        ? resolveAssetPath(src)
        : resolveAssetPath(`/news/${src}`);
};

/**
 * react-markdown hands each component the mdast `node` alongside the HTML props.
 * Spreading that onto a DOM element warns, so drop it before rendering.
 */
const stripNode = <T extends object>(props: T): Omit<T, 'node'> => {
    const rest = { ...props } as Record<string, unknown>;
    delete rest.node;
    return rest as Omit<T, 'node'>;
};

/**
 * A paragraph that is nothing but a YouTube link becomes a player.
 *
 * Only a link alone on its line: one mid-sentence is part of the prose and stays
 * a link. A link wrapping an image uses that image as the player's still, which
 * is also how the markdown reads on GitHub — a thumbnail that goes to the video.
 */
const videoFromParagraph = (node?: Element) => {
    const children = (node?.children || []).filter(c => !(c.type === 'text' && !c.value.trim()));
    const link = children[0];
    if (children.length !== 1 || link.type !== 'element' || link.tagName !== 'a') return null;

    const href = String(link.properties.href || '');
    const video = parseYouTubeUrl(href);
    if (!video) return null;

    const img = link.children.find((c): c is Element => c.type === 'element' && c.tagName === 'img');
    if (img) {
        return { ...video, thumbnail: resolveNewsSrc(String(img.properties.src || '')), title: String(img.properties.alt || '') || undefined };
    }
    const text = link.children.map(c => (c.type === 'text' ? c.value : '')).join('').trim();
    return { ...video, title: text && text !== href ? text : undefined };
};

interface NewsArticleProps {
    markdown: string;
}

/**
 * One rendered news post. Shared by the Studio news modal and the hub's inline
 * news section so both resolve asset paths and prose styling the same way.
 */
export const NewsArticle: React.FC<NewsArticleProps> = ({ markdown }) => (
    <div className="prose prose-invert max-w-none
      [&>*:first-child]:mt-0
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
                video: (props) => <video {...stripNode(props)} src={resolveNewsSrc(props.src)} />,
                img: (props) => <img {...stripNode(props)} src={resolveNewsSrc(props.src)} />,
                a: (props) => <a {...stripNode(props)} target="_blank" rel="noreferrer" />,
                p: (props) => {
                    const video = videoFromParagraph(props.node);
                    return video ? <YouTubeEmbed {...video} /> : <p {...stripNode(props)} />;
                },
            }}
        >
            {markdown}
        </ReactMarkdown>
    </div>
);
