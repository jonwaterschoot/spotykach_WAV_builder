/**
 * The video id and start offset in a YouTube link, or null when it isn't one.
 *
 * Takes every shape the share menu and address bar produce: `youtu.be/<id>`,
 * `watch?v=<id>`, `/shorts/`, `/live/` and `/embed/`, with `t=` / `start=` given
 * either as seconds or as `1m30s`.
 */
export const parseYouTubeUrl = (href?: string): { id: string; start: number } | null => {
    if (!href) return null;
    let url: URL;
    try {
        url = new URL(href);
    } catch {
        return null;
    }

    const host = url.hostname.replace(/^(www\.|m\.)/, '');
    let id: string | null = null;
    if (host === 'youtu.be') {
        id = url.pathname.slice(1).split('/')[0];
    } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
        const path = url.pathname.match(/^\/(?:shorts|live|embed)\/([^/]+)/);
        id = path ? path[1] : url.searchParams.get('v');
    }
    if (!id || !/^[\w-]{11}$/.test(id)) return null;

    const t = url.searchParams.get('t') || url.searchParams.get('start') || '';
    const parts = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
    const start = parts ? (Number(parts[1] || 0) * 3600) + (Number(parts[2] || 0) * 60) + Number(parts[3] || 0) : 0;

    return { id, start };
};
