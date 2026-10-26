#!/usr/bin/env node
/** A contribution skyline using the profile's shared terminal theme. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { THEME, esc, panel } from './lib/theme.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WIDTH = 850;
const HEIGHT = 400;
const LEFT = 30;
const RIGHT = 26;
const GROUND_Y = 326;
const ROWS = 7;
const ROW_X = 6.4;       // each row recedes up and to the right
const ROW_Y = 10.2;
const MAX_HEIGHT = 172;
const MIN_HEIGHT = 9;
const SLAB = 6;          // thickness of the ground slab

function shade(hex, amount) {
  return '#' + [1, 3, 5].map((offset) => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16);
    const value = amount > 0 ? channel + (255 - channel) * amount : channel * (1 + amount);
    return Math.round(value).toString(16).padStart(2, '0');
  }).join('');
}

const pts = (points) => points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
const polygon = (points, fill, extra = '') => `<polygon points="${pts(points)}" fill="${fill}" ${extra}/>`;

export function renderCity(data) {
  const weekCount = data.weeks.length;
  const step = (WIDTH - LEFT - RIGHT - ROWS * ROW_X) / weekCount;
  // Grid space -> screen. a = week (fractional), b = row (fractional, 0 = front).
  const P = (a, b, lift = 0) => [LEFT + a * step + b * ROW_X, GROUND_Y - b * ROW_Y - lift];

  const cells = data.weeks.flatMap((week) => week.days
    .map((day, row) => ({ day, week: week.index, row })).filter(({ day }) => day));
  const peakCount = Math.max(1, ...cells.map(({ day }) => Number(day.count) || 0));
  // Square-root scale keeps small active days visible without inventing activity.
  const heightOf = (count) => MIN_HEIGHT + (MAX_HEIGHT - MIN_HEIGHT) * Math.sqrt(count / peakCount);

  const levelOf = (day) => {
    const count = Number(day.count) || 0;
    const level = Math.max(0, Math.min(4, Number(day.level) || 0));
    return count > 0 ? Math.max(1, level) : 0;
  };

  // Gradients per level: lit front, shaded side. Roofs stay flat and bright.
  const defs = `<defs>
    ${[1, 2, 3, 4].map((l) => {
      const base = shade(THEME.green[l], 0.1);
      return `<linearGradient id="cf${l}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(base, 0.08)}"/><stop offset="1" stop-color="${shade(base, -0.48)}"/></linearGradient>` +
        `<linearGradient id="cs${l}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(base, -0.38)}"/><stop offset="1" stop-color="${shade(base, -0.72)}"/></linearGradient>`;
    }).join('\n    ')}
    <linearGradient id="ground" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#16202a"/><stop offset="1" stop-color="#0e151c"/></linearGradient>
    <radialGradient id="glow"><stop offset="0" stop-color="${THEME.green[4]}" stop-opacity=".55"/><stop offset="1" stop-color="${THEME.green[4]}" stop-opacity="0"/></radialGradient>
  </defs>`;

  // Ground slab with a visible edge, so the city sits on something.
  const W = weekCount;
  const slab = [
    polygon([P(-0.3, 0), P(W + 0.3, 0), P(W + 0.3, ROWS + 0.2), P(-0.3, ROWS + 0.2)], 'url(#ground)',
      `stroke="${THEME.border}" stroke-opacity=".55" stroke-width=".7"`),
    polygon([P(-0.3, 0), P(W + 0.3, 0), [P(W + 0.3, 0)[0], P(W + 0.3, 0)[1] + SLAB], [P(-0.3, 0)[0], P(-0.3, 0)[1] + SLAB]], '#0a0f14',
      `stroke="${THEME.border}" stroke-opacity=".4" stroke-width=".6"`),
    polygon([P(W + 0.3, 0), P(W + 0.3, ROWS + 0.2), [P(W + 0.3, ROWS + 0.2)[0], P(W + 0.3, ROWS + 0.2)[1] + SLAB], [P(W + 0.3, 0)[0], P(W + 0.3, 0)[1] + SLAB]], '#080c10',
      `stroke="${THEME.border}" stroke-opacity=".3" stroke-width=".6"`),
  ].join('');

  // Flat plots for every empty day: the grid reads clearly without noisy lines.
  const plots = cells.filter(({ day }) => !(Number(day.count) > 0)).map(({ week, row }) => {
    const g = 0.07;
    return polygon([P(week + g, row + g), P(week + 1 - g, row + g), P(week + 1 - g, row + 1 - g), P(week + g, row + 1 - g)], '#1a2430', 'fill-opacity=".85"');
  }).join('');

  function building({ day, week, row }) {
    const count = Number(day.count) || 0;
    const level = levelOf(day);
    const h = heightOf(count);
    const u0 = week + 0.14, u1 = week + 0.86, v0 = row + 0.19, v1 = row + 0.81;
    const front = [P(u0, v0, h), P(u1, v0, h), P(u1, v0), P(u0, v0)];
    const side = [P(u1, v0, h), P(u1, v1, h), P(u1, v1), P(u1, v0)];
    const roof = [P(u0, v0, h), P(u1, v0, h), P(u1, v1, h), P(u0, v1, h)];
    const roofColor = shade(THEME.green[level], 0.32);
    const faces = [
      polygon(side, `url(#cs${level})`),
      polygon(front, `url(#cf${level})`),
      polygon(roof, roofColor, `stroke="${shade(THEME.green[level], 0.55)}" stroke-opacity=".55" stroke-width=".5" stroke-linejoin="round"`),
    ].join('');
    const title = esc(`${day.date}: ${count} contribution${count === 1 ? '' : 's'}`);
    return `<g class="city-building" style="animation-delay:${row * 55 + week * 6}ms"><title>${title}</title>${faces}</g>`;
  }

  // Back rows first, left to right, so front rows occlude them.
  const active = cells.filter(({ day }) => Number(day.count) > 0).sort((a, b) => b.row - a.row || a.week - b.week);
  const buildings = active.map(building).join('\n');

  let lastMonthX = -Infinity;
  const months = data.months.flatMap((month) => {
    const x = P(month.week, 0)[0];
    if (x - lastMonthX < 30 || x > WIDTH - 45) return [];
    lastMonthX = x;
    return [`<text x="${x.toFixed(1)}" y="${GROUND_Y + SLAB + 17}" font-size="10" style="fill:${THEME.muted}">${esc(month.label)}</text>`];
  }).join('\n');

  const peak = cells.find(({ day }) => day.date === data.totals.bestDay.date);
  let annotation = '';
  if (peak && peak.day.count > 0) {
    const h = heightOf(peak.day.count);
    const [x, y] = P(peak.week + 0.5, peak.row + 0.5, h);
    const labelRight = x < WIDTH - 190;
    const labelX = x + (labelRight ? 10 : -10);
    const anchor = labelRight ? 'start' : 'end';
    const date = new Date(`${peak.day.date}T00:00:00Z`).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
    });
    annotation = `<g class="peak">
      <circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="30" fill="url(#glow)"/>
      <path d="M${x.toFixed(2)} 74 V${(y - 3).toFixed(2)}" fill="none" stroke="${THEME.good}" stroke-opacity=".6" stroke-width=".9" stroke-dasharray="2 3"/>
      <circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="2.6" fill="${THEME.green[4]}" stroke="#0d1117" stroke-width="1"/>
      <text x="${labelX.toFixed(2)}" y="76" text-anchor="${anchor}" font-size="16" font-weight="700">${peak.day.count} contributions</text>
      <text x="${labelX.toFixed(2)}" y="92" text-anchor="${anchor}" font-size="9.5" style="fill:${THEME.muted}">${esc(date)} · best day</text>
    </g>`;
  }

  const total = Number(data.totals.contributions).toLocaleString('en-US');
  const stats = `<text x="${LEFT}" y="379" font-size="10.5" style="fill:${THEME.muted}">` +
    `<tspan fill="${THEME.good}" font-weight="600">${esc(total)}</tspan> contributions in the last year` +
    ` · ${data.totals.activeDays} active days · ${data.streaks.current}d streak · ${data.streaks.longest}d longest</text>`;
  const legend = `<text x="678" y="379" font-size="10" style="fill:${THEME.muted}">Less</text>` +
    THEME.green.map((color, index) => `<rect x="${710 + index * 14}" y="370" width="10" height="10" rx="2" fill="${color}"/>`).join('') +
    `<text x="785" y="379" font-size="10" style="fill:${THEME.muted}">More</text>`;

  return panel({
    width: WIDTH, height: HEIGHT,
    title: `${data.username}@github: ~/contributions`,
    label: `${data.username}'s contribution city: ${total} contributions, ${data.totals.activeDays} active days. Each building is one day; height uses a square-root scale.`,
    css: `.city-building { animation: cityRise .7s cubic-bezier(.2,.7,.3,1) both; transform-box: fill-box; transform-origin: center bottom; }
      @keyframes cityRise { from { transform: scaleY(.05); opacity: 0; } to { transform: none; opacity: 1; } }
      .peak { animation: peakIn .5s ease 1.3s both; }
      @keyframes peakIn { from { opacity: 0; } to { opacity: 1; } }
      @media (prefers-reduced-motion: reduce) { .city-building, .peak { animation: none !important; transform: none !important; opacity: 1 !important; } }`,
    children: [defs, slab, plots, buildings, annotation, months,
      `<path d="M${LEFT} 362 H${WIDTH - 28}" stroke="${THEME.border}" stroke-opacity=".5"/>`, stats, legend].join('\n'),
  });
}

export function writeContributionCity() {
  const data = JSON.parse(readFileSync(resolve(ROOT, 'data/contributions.json'), 'utf8'));
  const svg = renderCity(data);
  mkdirSync(resolve(ROOT, 'assets'), { recursive: true });
  // Keep the original command/asset and the city alias in sync.
  for (const name of ['contrib-heatmap.svg', 'contrib-city.svg']) {
    writeFileSync(resolve(ROOT, 'assets', name), svg, 'utf8');
    console.log(`[city] wrote assets/${name} (${(Buffer.byteLength(svg) / 1024).toFixed(1)} KB)`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { writeContributionCity(); }
  catch (error) { console.error(`[city] ${error.message}`); process.exitCode = 1; }
}
