import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const tmpDir = path.join(repoRoot, '.tmp');
const v2BuildDir = path.join(tmpDir, 'v2-build');
const distDir = path.join(repoRoot, 'dist');
const shellDir = path.join(repoRoot, 'site');
const legacyV1Dir = path.join(repoRoot, 'legacy', 'v1-dist');
const distV1Dir = path.join(distDir, 'v1');
const distV2Dir = path.join(distDir, 'v2');

const run = (command) => {
  execSync(command, { cwd: repoRoot, stdio: 'inherit' });
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

rmSync(tmpDir, { recursive: true, force: true });

