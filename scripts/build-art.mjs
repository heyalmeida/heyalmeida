#!/usr/bin/env node
/**
 * Regenerate every static piece of profile art in one go.
 *
 * The daily GitHub Action only rebuilds the contribution city (that is the only panel whose
 * data changes); run this when the wordmark, the info card or your photo change.
 *
 * Usage: node scripts/build-art.mjs
 */

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

const steps = [
  ['render-ascii.mjs', 'ASCII wordmark'],
  ['render-info-card.mjs', 'neofetch info card'],
  ['render-heatmap.mjs', 'contribution city'],
];

let failed = false;

for (const [script, label] of steps) {
  process.stdout.write(`\n== ${label} ==\n`);
  const result = spawnSync(process.execPath, [resolve(HERE, script)], { stdio: 'inherit' });
  if (result.status !== 0) failed = true;
}

process.exit(failed ? 1 : 0);
