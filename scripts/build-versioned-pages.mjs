import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const tmpDir = path.join(repoRoot, '.tmp');
const v2BuildDir = path.join(tmpDir, 'v2-build');
const distDir = path.join(repoRoot, 'dist');
const shellDir = path.join(repoRoot, 'site');
const legacyV1Dir = path.join(repoRoot, 'legacy', 'v1-dist');
const distV1Dir = path.join(distDir, 'v1');
const distV2Dir = path.join(distDir, 'v2');
const sampleAssetBaseUrl = (process.env.SAMPLE_ASSET_BASE_URL || process.env.VITE_SAMPLE_ASSET_BASE_URL || '').replace(/\/+$/, '');

const run = (command) => {
  execSync(command, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_SAMPLE_ASSET_BASE_URL: sampleAssetBaseUrl || process.env.VITE_SAMPLE_ASSET_BASE_URL || ''
    }
  });
};

const resetDir = (targetDir) => {
  rmSync(targetDir, { recursive: true, force: true });
  mkdirSync(targetDir, { recursive: true });
};

resetDir(tmpDir);
resetDir(distDir);

run('npm run build:v2:raw');

cpSync(shellDir, distDir, { recursive: true });
cpSync(v2BuildDir, distV2Dir, { recursive: true });

if (existsSync(legacyV1Dir)) {
  cpSync(legacyV1Dir, distV1Dir, { recursive: true, force: true });
}

if (sampleAssetBaseUrl) {
  const rewriteV1SamplePaths = () => {
    const v1AssetsDir = path.join(distV1Dir, 'assets');
    if (!existsSync(v1AssetsDir)) return;

    for (const fileName of readdirSync(v1AssetsDir)) {
      if (!fileName.endsWith('.js')) continue;
      const filePath = path.join(v1AssetsDir, fileName);
      const source = readFileSync(filePath, 'utf8');
      const rewritten = source
        .replace(/"\/samples\/[^"]+\.wav"/gi, (match) => {
          const rawPath = match.slice(1, -1);
          const leafName = rawPath.split('/').pop();
          return leafName ? `"${sampleAssetBaseUrl}/${leafName}"` : match;
        })
        .replace(/'\/samples\/[^']+\.wav'/gi, (match) => {
          const rawPath = match.slice(1, -1);
          const leafName = rawPath.split('/').pop();
          return leafName ? `'${sampleAssetBaseUrl}/${leafName}'` : match;
        });

      if (rewritten !== source) {
        writeFileSync(filePath, rewritten, 'utf8');
      }
    }
  };

  const removeAudioFilesRecursively = (baseDir) => {
    if (!existsSync(baseDir)) return;
    for (const entry of readdirSync(baseDir, { withFileTypes: true })) {
      const entryPath = path.join(baseDir, entry.name);
      if (entry.isDirectory()) {
        removeAudioFilesRecursively(entryPath);
        continue;
      }
      if (/\.wav$/i.test(entry.name)) {
        rmSync(entryPath, { force: true });
      }
    }
  };

  rewriteV1SamplePaths();

  removeAudioFilesRecursively(path.join(distV1Dir, 'samples'));
  removeAudioFilesRecursively(path.join(distV2Dir, 'samples'));
}

rmSync(tmpDir, { recursive: true, force: true });

