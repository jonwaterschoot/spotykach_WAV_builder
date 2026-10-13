#!/usr/bin/env node
/**
 * Builds and runs scripts/card-sync.test.ts: exportSDStructure and calculateSyncDiff
 * end to end, over USB (real UsbBackend, stand-in device link) and the card reader
 * (real FolderBackend over a temp folder).
 *
 *   node scripts/check-card-sync.mjs        (or: npm run check:card)
 *
 * The app's modules import without `.ts` extensions and use Vite's `?raw` and
 * `import.meta.env`, so the test is bundled with esbuild first. Exits 1 on any failure.
 */
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const raw = {
    name: 'raw',
    setup(b) {
        b.onResolve({ filter: /\?raw$/ }, a => ({ path: resolve(a.resolveDir, a.path.replace(/\?raw$/, '')), namespace: 'raw' }));
        b.onLoad({ filter: /.*/, namespace: 'raw' }, a => ({ contents: readFileSync(a.path, 'utf8'), loader: 'text' }));
    },
};

const dir = mkdtempSync(join(tmpdir(), 'check-card-'));
const out = join(dir, 'card-sync.test.mjs');
try {
    await build({
        entryPoints: [join(import.meta.dirname, 'card-sync.test.ts')],
        outfile: out, bundle: true, platform: 'node', format: 'esm', logLevel: 'error',
        plugins: [raw],
        define: { 'import.meta.env': '{"BASE_URL":"/","DEV":false}', __APP_VERSION__: '"test"' },
        external: ['@ffmpeg/*'],
    });
    execFileSync(process.execPath, [out], { stdio: 'inherit' });
} catch {
    process.exitCode = 1;
} finally {
    rmSync(dir, { recursive: true, force: true });
}
