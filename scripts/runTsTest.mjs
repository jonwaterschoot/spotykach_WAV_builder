/**
 * Bundles a `scripts/<name>.test.ts` with esbuild and runs it in node. The app's
 * modules import without `.ts` extensions and use Vite's `?raw` and `import.meta.env`,
 * which node can't load as they are. Sets the exit code to 1 on any failure.
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

export const runTsTest = async (name) => {
    const dir = mkdtempSync(join(tmpdir(), `check-${name}-`));
    const out = join(dir, `${name}.test.mjs`);
    try {
        await build({
            entryPoints: [join(import.meta.dirname, `${name}.test.ts`)],
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
};
