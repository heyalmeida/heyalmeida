#!/usr/bin/env node
/**
 * Render data/contributions.json as an animated SVG heatmap.
 *
 * The calendar is drawn as the classic 53 x 7 grid of rounded boxes that slide
 * in diagonally, then freeze. All motion lives inside the SVG (CSS keyframes),
 * because GitHub strips <script> and inline styles from READMEs.
 *
 * Usage: node scripts/render-heatmap.mjs
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { THEME, esc, panel } from './lib/theme.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const DATA = resolve(ROOT, 'data/contributions.json');
const OUTPUT = resolve(ROOT, 'assets/contrib-heatmap.svg');

const WIDTH = 850;
const GRID_X = 44;
const RIGHT_PAD = 16;
const GAP = 3;
const TITLE_BAR = 34;

const WEEKDAYS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

function loadData() {
  try {
    return JSON.parse(readFileSync(DATA, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read ${DATA} (run "node scripts/fetch-contributions.mjs" first): ${error.message}`);
  }
}

function render(data) {
  const weeks = data.weeks;
  const weekCount = weeks.length;
  const cell = (WIDTH - GRID_X - RIGHT_PAD - (weekCount - 1) * GAP) / weekCount;
  const step = cell + GAP;
  const gridTop = TITLE_BAR + 26;
  const gridHeight = 7 * cell + 6 * GAP;
  const height = Math.ceil(gridTop + gridHeight + 46);
  const baseline = gridTop + gridHeight + 28;

  // The trailing month label is dropped when it would run into the panel edge.
  const monthLabels = data.months
    .filter((month) => GRID_X + month.week * step < WIDTH - 52)
    .map((month) => {
      const x = GRID_X + month.week * step;
      return `  <text class="row" style="animation-delay:${300 + month.week * 12}ms" x="${x.toFixed(1)}" y="${(gridTop - 8).toFixed(1)}" font-size="10.5" fill="${THEME.muted}">${esc(month.label)}</text>`;
    })
    .join('\n');

  const weekdayLabels = WEEKDAYS.map((label, row) =>
    label
      ? `  <text x="${GRID_X - 8}" y="${(gridTop + row * step + cell * 0.78).toFixed(1)}" font-size="10.5" fill="${THEME.muted}" text-anchor="end">${label}</text>`
      : '',
  )
    .filter(Boolean)
    .join('\n');

  const cells = weeks
    .flatMap((week) =>
      week.days.map((day, row) => {
        if (!day) return '';
        const x = GRID_X + week.index * step;
        const y = gridTop + row * step;
        const delay = (week.index + row) * 16;
        const title = `${day.count} contribution${day.count === 1 ? '' : 's'} on ${day.date}`;
        return (
          `  <rect class="cell" style="animation-delay:${delay}ms" x="${x.toFixed(2)}" y="${y.toFixed(2)}" ` +
          `width="${cell.toFixed(2)}" height="${cell.toFixed(2)}" rx="2.5" fill="${THEME.green[day.level]}">` +
          `<title>${esc(title)}</title></rect>`
        );
      }),
    )
    .filter(Boolean)
    .join('\n');

  const legendX = WIDTH - RIGHT_PAD - 152;
  const legend = [
    `  <text x="${legendX}" y="${baseline}" font-size="11" fill="${THEME.muted}">Less</text>`,
    ...THEME.green.map(
      (color, index) =>
        `  <rect x="${legendX + 34 + index * 15}" y="${baseline - 10}" width="11" height="11" rx="2.5" fill="${color}"/>`,
    ),
    `  <text x="${legendX + 34 + 5 * 15 + 4}" y="${baseline}" font-size="11" fill="${THEME.muted}">More</text>`,
  ].join('\n');

  // Keep this line short: the legend sits on the same baseline on the right.
  const total = data.totals.contributions.toLocaleString('en-US');
  const stats =
    `  <text x="${GRID_X}" y="${baseline}" font-size="11" fill="${THEME.muted}">` +
    `<tspan fill="${THEME.good}" font-weight="600">${esc(total)}</tspan> contributions in the last year` +
    `  ·  <tspan fill="${THEME.good}" font-weight="600">${data.streaks.current}d</tspan> streak` +
    `  ·  <tspan fill="${THEME.good}" font-weight="600">${data.streaks.longest}d</tspan> longest` +
    `  ·  best day <tspan fill="${THEME.good}" font-weight="600">${data.totals.bestDay.count}</tspan>` +
    `</text>`;

  const children = [monthLabels, weekdayLabels, cells, stats, legend].join('\n');

  return panel({
    width: WIDTH,
    height,
    title: `${data.username}@github: ~/contributions`,
    label: `Contribution calendar for ${data.username}: ${total} contributions in the last year`,
    children,
  });
}

try {
  const svg = render(loadData());
  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, svg, 'utf8');
  console.log(`[heatmap] wrote ${OUTPUT} (${(svg.length / 1024).toFixed(1)} KB)`);
} catch (error) {
  console.error(`[heatmap] ${error.message}`);
  process.exit(1);
}