#!/usr/bin/env node
/**
 * Builds and runs scripts/card-sync.test.ts: exportSDStructure and calculateSyncDiff
 * end to end, over USB (real UsbBackend, stand-in device link) and the card reader
 * (real FolderBackend over a temp folder).
 *
 *   node scripts/check-card-sync.mjs        (or: npm run check:card)
 *
 * Exits 1 on any failure.
 */
import { runTsTest } from './runTsTest.mjs';

await runTsTest('card-sync');
