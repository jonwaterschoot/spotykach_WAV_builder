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

/**
 * The readable half of an article's link: `4.1.0-submit.md` → `4.1.0-submit`.
 *
 * Not the manifest `id`, which is a mix of version numbers with the dots taken
 * out ("410") and slugs ("hainbach"). A link is something a person pastes into a
 * message, so it should say which article it points at.
 */
export const newsSlug = (item: NewsItem): string => item.file.replace(/\.md$/i, '');

/**
 * Resolve a `?news=` value to an item, by slug or by manifest id.
 *
 * Both are accepted because the id is the older identity — anything already
 * linked by id keeps working — while the slug is what `newsPermalink` writes.
 * An unknown value returns undefined, and the caller falls back to the featured
 * post rather than showing an empty reader.
 */
export const newsItemFromParam = (items: NewsItem[], param: string | null): NewsItem | undefined => {
    if (!param) return undefined;
    const wanted = param.toLowerCase();
    return items.find(i => newsSlug(i).toLowerCase() === wanted || i.id.toLowerCase() === wanted);
};

/**
 * The absolute link to one article, on the hub.
 *
 * Always the hub, even when it's copied from the Studio modal: the hub is the
 * one surface that shows news to somebody who has never opened this app, and a
 * link that first demands a work folder is not a link you can send anyone.
 */
export const newsPermalink = (item: NewsItem): string =>
    `${window.location.origin}${window.location.pathname}#/?news=${encodeURIComponent(newsSlug(item))}`;
