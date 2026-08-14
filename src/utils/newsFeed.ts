import { resolveAssetPath } from './assetUtils';

export interface NewsItem {
    id: string;
    date: string;
    title: string;
    file: string;
    image?: string;
    pinned?: boolean;
    category?: string;
}

export interface NewsFeed {
    items: NewsItem[];
    /** Markdown body per item id. Missing entries just render empty. */
    content: Record<string, string>;
}

/**
 * Loads the news manifest and every article body.
 *
 * Shared by the hub's inline news section and the Studio news modal, so the two
 * can't drift. The manifest is cache-busted; the bodies are not, since they're
 * addressed by name and change with a deploy.
 */
export const fetchNewsFeed = async (): Promise<NewsFeed> => {
    const response = await fetch(`${resolveAssetPath('/news/news-manifest.json')}?t=${Date.now()}`);
    if (!response.ok) throw new Error('Failed to fetch news manifest');
    const items: NewsItem[] = await response.json();

    const content: Record<string, string> = {};
    await Promise.all(items.map(async (item) => {
        try {
            const res = await fetch(resolveAssetPath(`/news/${item.file}`));
            if (res.ok) content[item.id] = await res.text();
        } catch (e) {
            console.error(`Failed to fetch content for ${item.id}`, e);
        }
    }));

    return { items, content };
};

/** The item a reader should land on: the pinned one, else the newest listed. */
export const featuredNewsItem = (items: NewsItem[]): NewsItem | undefined =>
    items.find(i => i.pinned) || items[0];
