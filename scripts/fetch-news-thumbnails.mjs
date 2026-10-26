#!/usr/bin/env node
/**
 * Downloads a still for every YouTube video a news post links to.
 *
 *   node scripts/fetch-news-thumbnails.mjs   (runs itself before `dev` and `build`)
 *
 * The news player (src/components/YouTubeEmbed.tsx) shows a still until someone
 * presses play. Taking it from YouTube's image server in the browser would mean a
 * request to Google from every visitor who opens the hub, which is what the
 * click-to-load player exists to avoid. So the still is fetched once, here, and
 * served from `public/news/youtube/<id>.jpg` like any other article image.
 *
 * Existing files are kept, so this only touches the network for a new video. A
 * post that wraps the link around its own image doesn't need one, but gets one
 * anyway; it's a few hundred KB and keeps this a plain scan.
 *
 * Never fails the build. Offline, or a video that has been taken down, prints a
 * warning and the player falls back to its drawn placeholder.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYouTubeUrl } from '../src/utils/youtube.ts';

const newsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'news');
const outDir = join(newsDir, 'youtube');

// Only a link alone on its line becomes a player (see NewsArticle): a bare URL,
// `[text](url)` or `[![alt](img)](url)`. One mid-sentence stays a link and
// needs no still.
const ids = new Set();
for (const file of readdirSync(newsDir).filter(f => f.endsWith('.md'))) {
    for (const line of readFileSync(join(newsDir, file), 'utf8').split('\n')) {
        const own = line.trim().match(/^(?:\[.*\]\((\S+?)\)|<?(https?:\/\/\S+?)>?)$/);
        const video = own && parseYouTubeUrl(own[1] || own[2]);
        if (video) ids.add(video.id);
    }
}

const missing = [...ids].filter(id => !existsSync(join(outDir, `${id}.jpg`)));
if (missing.length === 0) process.exit(0);
mkdirSync(outDir, { recursive: true });

// maxresdefault is 1280×720 but not every video has one (YouTube answers 404);
// hqdefault always exists, at 480×360 with letterbox bars the player crops off.
const fetchStill = async id => {
    for (const name of ['maxresdefault', 'hqdefault']) {
        const res = await fetch(`https://i.ytimg.com/vi/${id}/${name}.jpg`);
        if (res.ok) return Buffer.from(await res.arrayBuffer());
    }
    return null;
};

for (const id of missing) {
    try {
        const still = await fetchStill(id);
        if (!still) {
            console.warn(`[news thumbnails] No still for ${id}, the post will show the placeholder.`);
            continue;
        }
        writeFileSync(join(outDir, `${id}.jpg`), still);
        console.log(`[news thumbnails] Saved youtube/${id}.jpg`);
    } catch (error) {
        console.warn(`[news thumbnails] Could not fetch ${id} (${error.message}); skipped.`);
    }
}
