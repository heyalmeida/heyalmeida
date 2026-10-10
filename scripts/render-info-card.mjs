#!/usr/bin/env node
/**
 * Render the neofetch-style info card.
 *
 * A title bar, a dot-matrix monogram on the left and coloured key/value rows that
 * fade in on a short stagger — the same information a `neofetch` run prints, so
 * the numbers-as-a-graph job stays with the contribution heatmap.
 *
 * Usage: node scripts/render-info-card.mjs
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { THEME, esc, panel } from './lib/theme.mjs';
import { rasterize } from './lib/font.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUTPUT = resolve(ROOT, 'assets/pedro-info-card.svg');

const WIDTH = 850;
const TITLE_BAR = 34;
const INNER_TOP = 22;
const HEADLINE = 26;
const SEPARATOR = 24;
const ROW_HEIGHT = 22;
const BOTTOM = 30;

const CARD = {
  user: 'pedro',
  host: 'github',
  logo: 'P\nA',
  rows: [
    ['Now', 'Software Engineer · Go & TypeScript'],
    ['Focus', 'Backend architecture · SaaS infra · AI tooling'],
    ['Stack', 'Go · TypeScript · Node.js · Next.js · Docker'],
    ['Data', 'MySQL · Redis · MongoDB · SQL Server'],
    ['Infra', 'Cloudflare · Nginx · GitHub Actions · Linux'],
    ['Building', 'Émile CLI — provider-agnostic terminal coding agent'],
    ['Also', 'Luarvia — managed deployment platform'],
    ['Web', 'dash.luarvia.dev · github.com/heyalmeida'],
    ['Mail', 'mc33pedrobr@gmail.com'],
  ],
};

function renderLogo() {
  const grid = rasterize(CARD.logo);
  const cell = 8;
  const gap = 2;
  const step = cell + gap;
  const width = grid.width * step - gap;
  const height = grid.height * step - gap;

  const cells = [];
  grid.rows.forEach((row, y) => {
    [...row].forEach((value, x) => {
      if (value !== '1') return;
      const delay = 120 + (x + y) * 22;
      cells.push(
        `  <rect class="pop" style="animation-delay:${delay}ms" x="${x * step}" ` +
          `y="${y * step}" width="${cell}" height="${cell}" rx="2" fill="${THEME.accent}"/>`,
      );
    });
  });

  return { markup: cells.join('\n'), width, height };
}

function render() {
  const rows = CARD.rows.length;
  const height = TITLE_BAR + INNER_TOP + HEADLINE + SEPARATOR + rows * ROW_HEIGHT + BOTTOM;
  const logo = renderLogo();

  const infoX = 172;
  const valueX = 300;
  const logoX = 44;
  const logoY = Math.round((TITLE_BAR + height) / 2 - logo.height / 2);

  const headline =
    `  <text x="${infoX}" y="${TITLE_BAR + INNER_TOP + 18}" font-size="15" ` +
    `fill="${THEME.accent}" font-weight="600">${esc(`${CARD.user}@${CARD.host}`)}</text>`;

  const separator =
    `  <line x1="${infoX}" y1="${TITLE_BAR + INNER_TOP + HEADLINE + 8}" x2="${WIDTH - 44}" ` +
    `y2="${TITLE_BAR + INNER_TOP + HEADLINE + 8}" stroke="${THEME.border}"/>`;

  const rowTop = TITLE_BAR + INNER_TOP + HEADLINE + SEPARATOR + 4;
  const body = CARD.rows
    .map(([key, value], index) => {
      const y = rowTop + index * ROW_HEIGHT + 15;
      const delay = 260 + index * 70;
      return (
        `  <g class="row" style="animation-delay:${delay}ms">\n` +
        `    <text x="${infoX}" y="${y}" font-size="12.5" fill="${THEME.accent}" font-weight="600">${esc(key)}</text>\n` +
        `    <text x="${valueX}" y="${y}" font-size="13" fill="${THEME.text}">${esc(value)}</text>\n` +
        `  </g>`
      );
    })
    .join('\n');

  return panel({
    width: WIDTH,
    height,
    title: `${CARD.user}@${CARD.host}: ~ (neofetch)`,
    label: `${CARD.user}@${CARD.host} — neofetch-style profile card: ${CARD.rows
      .map(([key, value]) => `${key}: ${value}`)
      .join(' · ')}`,
    children: [
      `  <g transform="translate(${logoX}, ${logoY})">`,
      logo.markup,
      '  </g>',
      headline,
      separator,
      body,
    ].join('\n'),
  });
}

try {
  const svg = render();
  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, svg, 'utf8');
  console.log(`[info-card] wrote ${OUTPUT} (${(svg.length / 1024).toFixed(1)} KB)`);
} catch (error) {
  console.error(`[info-card] ${error.message}`);
  process.exit(1);
}