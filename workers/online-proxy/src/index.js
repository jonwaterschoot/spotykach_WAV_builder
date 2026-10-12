/**
 * WAV Builder online proxy — a Cloudflare Worker.
 *
 * Holds WAV Builder's one Freesound API key (a Worker secret, never sent to the
 * browser) and forwards the app's Freesound searches with it. Only search goes
 * through here: the audio previews come straight from cdn.freesound.org, which
 * already allows the app's origin, so the Worker only ever handles small JSON.
 *
 *   GET /freesound/search?query=rain&page=1&filter=duration:[0 TO 30]
 *   GET /health
 *
 * Guards, cheapest first:
 *   1. Origin: only the app's own pages (ALLOWED_ORIGINS) get an answer, so other
 *      sites can't spend the shared quota.
 *   2. Parameters: a fixed list, a fixed `fields`, page_size at most 50.
 *   3. Per-visitor rate: SEARCH_LIMITER, counted per IP per minute.
 *   4. Freesound's own cap on the key (60/min, 2000/day). A 429 from Freesound is
 *      passed on as is, and the app shows it as "limit reached".
 *
 * Setup and deploy: ../README.md.
 */

const FREESOUND_SEARCH = 'https://freesound.org/apiv2/search/';

/** What the app asks for; everything else in the query string is dropped. */
const ALLOWED_PARAMS = ['query', 'filter', 'sort', 'page', 'page_size', 'group_by_pack'];
/** Fixed here, so the Worker can't be used to read fields the app doesn't show. */
const FIELDS = 'id,name,username,license,duration,url,previews,n_from_same_pack';

const json = (body, status, headers = {}) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', ...headers },
    });

const corsHeaders = origin => ({
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
});

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const origin = request.headers.get('Origin') || '';
        const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);

        if (url.pathname === '/health') {
            return json({ ok: true, freesoundKey: !!env.FREESOUND_KEY }, 200);
        }
        if (!allowed.includes(origin)) {
            return json({ detail: 'This proxy only answers WAV Builder.' }, 403);
        }
        const cors = corsHeaders(origin);
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
        if (request.method !== 'GET') return json({ detail: 'GET only.' }, 405, cors);
        if (url.pathname !== '/freesound/search') return json({ detail: 'Not found.' }, 404, cors);
        if (!env.FREESOUND_KEY) return json({ detail: 'The proxy has no Freesound key set.' }, 503, cors);

        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        if (env.SEARCH_LIMITER) {
            const { success } = await env.SEARCH_LIMITER.limit({ key: ip });
            if (!success) {
                return json({ detail: 'Too many searches from here. Try again in a minute.' }, 429, { ...cors, 'Retry-After': '60' });
            }
        }

        const upstream = new URL(FREESOUND_SEARCH);
        for (const name of ALLOWED_PARAMS) {
            const value = url.searchParams.get(name);
            if (value !== null) upstream.searchParams.set(name, value.slice(0, 500));
        }
        const pageSize = Math.min(50, Math.max(1, Number(upstream.searchParams.get('page_size')) || 30));
        upstream.searchParams.set('page_size', String(pageSize));
        upstream.searchParams.set('fields', FIELDS);
        upstream.searchParams.set('token', env.FREESOUND_KEY);

        const res = await fetch(upstream.toString(), { headers: { Accept: 'application/json' } });
        const headers = { ...cors, 'Content-Type': 'application/json' };
        const retryAfter = res.headers.get('Retry-After');
        if (retryAfter) headers['Retry-After'] = retryAfter;
        // A refused key is our problem, not the visitor's: don't echo Freesound's text.
        if (res.status === 401 || res.status === 403) {
            return json({ detail: 'The proxy\'s Freesound key was refused.' }, 502, cors);
        }
        return new Response(res.body, { status: res.status, headers });
    },
};
