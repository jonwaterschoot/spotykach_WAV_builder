#!/usr/bin/env node
/**
 * Builds and runs scripts/project-file.test.ts: the project file out and back in,
 * every older export through the importer, and project folders saved and loaded on
 * disk (a temp folder).
 *
 *   node scripts/check-project-file.mjs     (or: npm run check:project-file)
 *
 * Exits 1 on any failure.
 */
import { runTsTest } from './runTsTest.mjs';

await runTsTest('project-file');
