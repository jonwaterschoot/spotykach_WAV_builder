/**
 * The link table — username in, URL out.
 *
 * The guide asks for full URLs, and full URLs are what nobody has to hand: an
 * artist knows they are `jonwtr` on Bandcamp, not that the address is
 * `https://jonwtr.bandcamp.com`. So each platform takes a bare handle and the
 * template does the rest, which also means every submitted link is well-formed
 * without anyone checking.
 *
 * Order is the order they appear in the form: the music platforms an artist is
 * most likely to want credited first, the rest after.
 */
export interface LinkPlatform {
    id: string;
    /** The `label` written into `manifest.json`'s `links[]`. */
    label: string;
    /** What the field asks for, when it isn't simply "username". */
    placeholder: string;
    /** `handle` → full URL. */
    toUrl: (handle: string) => string;
    /**
     * Hosts whose URLs belong to this platform, so a pasted address is unwrapped
     * to its handle rather than rejected. Matched against the hostname, suffix-wise.
     */
    hosts: string[];
    /**
     * Pull the handle out of a pasted URL's path. Defaults to the first path
     * segment, which is right for most of them.
     */
    fromPath?: (path: string, hostname: string) => string;
}

const firstSegment = (path: string): string => path.split('/').filter(Boolean)[0] || '';

export const LINK_PLATFORMS: LinkPlatform[] = [
    {
        id: 'bandcamp',
        label: 'Bandcamp',
        placeholder: 'yourname',
        toUrl: h => `https://${h}.bandcamp.com`,
        hosts: ['bandcamp.com'],
        // The handle is the subdomain here, not the path.
        fromPath: (_path, hostname) => hostname.replace(/\.bandcamp\.com$/, ''),
    },
    {
        id: 'soundcloud',
        label: 'SoundCloud',
        placeholder: 'yourname',
        toUrl: h => `https://soundcloud.com/${h}`,
        hosts: ['soundcloud.com'],
    },
    {
        id: 'spotify',
        label: 'Spotify',
        placeholder: 'artist id',
        toUrl: h => `https://open.spotify.com/artist/${h}`,
        hosts: ['open.spotify.com', 'spotify.com'],
        fromPath: path => path.split('/').filter(Boolean).pop() || '',
    },
    {
        id: 'youtube',
        label: 'YouTube',
        placeholder: 'yourname',
        // The `@handle` form, which is the one people know. A bare name is given its @.
        toUrl: h => `https://youtube.com/@${h.replace(/^@/, '')}`,
        hosts: ['youtube.com', 'youtu.be'],
        fromPath: path => firstSegment(path).replace(/^@/, ''),
    },
    {
        id: 'instagram',
        label: 'Instagram',
        placeholder: 'yourname',
        toUrl: h => `https://instagram.com/${h.replace(/^@/, '')}`,
        hosts: ['instagram.com'],
    },
    {
        id: 'patreon',
        label: 'Patreon',
        placeholder: 'yourname',
        toUrl: h => `https://patreon.com/${h}`,
        hosts: ['patreon.com'],
    },
    {
        id: 'github',
        label: 'GitHub',
        placeholder: 'yourname',
        toUrl: h => `https://github.com/${h}`,
        hosts: ['github.com'],
    },
    {
        id: 'mastodon',
        label: 'Mastodon',
        placeholder: 'you@instance.social',
        // Full address, because the instance is half the handle and there is no
        // single host to assume.
        toUrl: h => {
            const [user, host] = h.replace(/^@/, '').split('@');
            return host ? `https://${host}/@${user}` : `https://mastodon.social/@${user}`;
        },
        hosts: [],
    },
    {
        id: 'x',
        label: 'X',
        placeholder: 'yourname',
        toUrl: h => `https://x.com/${h.replace(/^@/, '')}`,
        hosts: ['x.com', 'twitter.com'],
    },
    {
        id: 'tiktok',
        label: 'TikTok',
        placeholder: 'yourname',
        toUrl: h => `https://tiktok.com/@${h.replace(/^@/, '')}`,
        hosts: ['tiktok.com'],
        fromPath: path => firstSegment(path).replace(/^@/, ''),
    },
    {
        id: 'discord',
        label: 'Discord',
        placeholder: 'yourname',
        // Not a link — a handle, so the maintainer can reach the artist. Rendered as
        // plain text in the outputs rather than an address that goes nowhere.
        toUrl: h => h,
        hosts: [],
    },
];

export const PLATFORMS_BY_ID: Record<string, LinkPlatform> =
    Object.fromEntries(LINK_PLATFORMS.map(p => [p.id, p]));

/** Discord is a handle to write down, not a URL to follow. */
export const isHandleOnly = (platformId: string): boolean => platformId === 'discord';

/**
 * Turn whatever was typed into the handle the template expects.
 *
 * Someone who pastes `https://soundcloud.com/jonwtr/tracks` into the SoundCloud
 * field has done nothing wrong, and telling them so would be the app being pedantic
 * about a field it can read perfectly well. A URL from the wrong host is left alone
 * — it will be shown back as-is and is more likely a genuine oddity than a mistake.
 */
export const normalizeHandle = (platform: LinkPlatform, raw: string): string => {
    const value = raw.trim();
    if (!value) return '';
    if (!/^https?:\/\//i.test(value)) return value.replace(/^@/, '').replace(/\/+$/, '');

    try {
        const url = new URL(value);
        const hostname = url.hostname.replace(/^www\./, '');
        const matches = platform.hosts.some(h => hostname === h || hostname.endsWith(`.${h}`));
        if (!matches) return value;
        const handle = platform.fromPath
            ? platform.fromPath(url.pathname, hostname)
            : firstSegment(url.pathname);
        return handle || value;
    } catch {
        return value;
    }
};

/** `{ label, url }` rows for `manifest.json`, in table order, empties dropped. */
export const buildLinkEntries = (
    handles: Record<string, string>,
    website: string,
    custom: { label: string; url: string }[],
): { label: string; url: string }[] => {
    const entries: { label: string; url: string }[] = [];

    const site = website.trim();
    if (site) {
        entries.push({
            label: 'Website',
            url: /^https?:\/\//i.test(site) ? site : `https://${site}`,
        });
    }

    LINK_PLATFORMS.forEach(platform => {
        const handle = (handles[platform.id] || '').trim();
        if (!handle) return;
        // A pasted URL that survived normalization is already a URL; don't re-wrap it.
        const url = /^https?:\/\//i.test(handle) ? handle : platform.toUrl(handle);
        entries.push({ label: platform.label, url });
    });

    custom.forEach(row => {
        const label = row.label.trim();
        const url = row.url.trim();
        if (!label || !url) return;
        entries.push({ label, url: /^https?:\/\//i.test(url) ? url : `https://${url}` });
    });

    return entries;
};
