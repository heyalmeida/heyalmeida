#!/usr/bin/env node
/**
 * Scrape the public contribution calendar and persist it as JSON.
 *
 * GitHub serves the exact fragment the profile page uses at
 * https://github.com/users/<username>/contributions — no GraphQL, no token.
 * We read the per-day `data-level`, the day cell ids (week/day grid position)
 * and the tool-tip text, which carries the exact contribution count for the day.
 *
 * Usage: node scripts/fetch-contributions.mjs [--user heyalmeida]
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const argUser = process.argv.find((arg) => arg.startsWith('--user='))?.split('=')[1];
const USERNAME = argUser ?? process.env.PROFILE_USERNAME ?? 'heyalmeida';
const OUTPUT = resolve(ROOT, 'data/contributions.json');

function attribute(tag, name) {
  const match = new RegExp(`\\b${name}="([^"]*)"`).exec(tag);
  return match ? match[1] : null;
}

function decodeEntities(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/** GitHub buckets each day into 0..4 using quartiles of the user's own data. */
function levelsFromCounts(counts) {
  const active = counts.filter((count) => count > 0).sort((a, b) => a - b);
  if (active.length === 0) return () => 0;
  const quantile = (q) => active[Math.min(active.length - 1, Math.floor(q * active.length))];
  const [q1, q2, q3] = [quantile(0.25), quantile(0.5), quantile(0.75)];
  return (count) => {
    if (count <= 0) return 0;
    if (count <= q1) return 1;
    if (count <= q2) return 2;
    if (count <= q3) return 3;
    return 4;
  };
}

async function main() {
  const endpoint = `https://github.com/users/${USERNAME}/contributions`;
  const response = await fetch(endpoint, {
    headers: {
      'User-Agent': `${USERNAME}-profile-art (+https://github.com/${USERNAME})`,
      Accept: 'text/html',
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub responded ${response.status} ${response.statusText} for ${endpoint}`);
  }

  const html = await response.text();

  const tooltips = new Map();
  for (const match of html.matchAll(
    /<tool-tip\b[^>]*\bfor="(contribution-day-component-\d+-\d+)"[^>]*>([\s\S]*?)<\/tool-tip>/g,
  )) {
    const text = decodeEntities(match[2]).trim();
    const counted = /^(\d+)\s+contribution/u.exec(text);
    tooltips.set(match[1], counted ? Number(counted[1]) : 0);
  }

  const days = [];
  let estimated = 0;

  for (const match of html.matchAll(/<td\b[^>]*class="ContributionCalendar-day"[^>]*>/g)) {
    const tag = match[0];
    const date = attribute(tag, 'data-date');
    const id = attribute(tag, 'id');
    if (!date || !id) continue;

    // GitHub ids the cells as contribution-day-component-<weekday>-<week>.
    const [, weekdayIndex, weekIndex] = /contribution-day-component-(\d+)-(\d+)/.exec(id) ?? [];
    const hasExact = tooltips.has(id);
    const count = hasExact ? tooltips.get(id) : Number(attribute(tag, 'data-level') ?? 0);
    if (!hasExact) estimated += 1;

    days.push({
      date,
      count,
      level: Number(attribute(tag, 'data-level') ?? 0),
      week: Number(weekIndex),
      weekday: Number(weekdayIndex),
      exact: hasExact,
    });
  }

  if (days.length === 0) {
    throw new Error('Could not find any contribution cells — GitHub may have changed its markup.');
  }

  days.sort((a, b) => a.date.localeCompare(b.date));

  // Fallback only: if GitHub ever drops the tool-tips we still get sane buckets.
  const fallbackLevel = levelsFromCounts(days.map((day) => day.count));
  for (const day of days) {
    if (!day.exact) day.level = fallbackLevel(day.count);
  }

  const weekCount = Math.max(...days.map((day) => day.week)) + 1;
  const weeks = Array.from({ length: weekCount }, (_, index) => ({
    index,
    days: Array.from({ length: 7 }, () => null),
  }));

  for (const day of days) {
    weeks[day.week].days[day.weekday] = {
      date: day.date,
      count: day.count,
      level: day.level,
    };
  }

  // Month labels: the first week that actually starts a new month gets the label.
  const months = [];
  let lastMonth = null;
  for (const week of weeks) {
    const first = week.days.find(Boolean);
    if (!first) continue;
    const month = first.date.slice(0, 7);
    if (month === lastMonth) continue;
    lastMonth = month;
    months.push({
      week: week.index,
      label: new Date(`${first.date}T00:00:00Z`).toLocaleString('en-US', {
        month: 'short',
        timeZone: 'UTC',
      }),
    });
  }

  let current = 0;
  let longest = 0;
  let longestRange = null;
  let run = 0;
  let runStart = null;
  let bestDay = days[0];

  for (const day of days) {
    if (day.count > 0) {
      run += 1;
      if (run === 1) runStart = day.date;
      if (run > longest) {
        longest = run;
        longestRange = { from: runStart, to: day.date };
      }
    } else {
      run = 0;
      runStart = null;
    }
    if (day.count > bestDay.count) bestDay = day;
  }

  // Allow the streak to survive a quiet "today" (the graph's last cell).
  let cursor = days.length - 1;
  if (cursor >= 0 && days[cursor].count === 0) cursor -= 1;
  while (cursor >= 0 && days[cursor].count > 0) {
    current += 1;
    cursor -= 1;
  }

  const payload = {
    username: USERNAME,
    generatedAt: new Date().toISOString(),
    source: endpoint,
    exactCounts: estimated === 0,
    range: { from: days[0].date, to: days[days.length - 1].date },
    totals: {
      contributions: days.reduce((sum, day) => sum + day.count, 0),
      activeDays: days.filter((day) => day.count > 0).length,
      days: days.length,
      bestDay: { date: bestDay.date, count: bestDay.count },
    },
    streaks: { current, longest, longestRange },
    months,
    weeks,
  };

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  const { from, to } = payload.range;
  console.log(
    `[contributions] ${payload.totals.contributions.toLocaleString('en-US')} contributions ` +
      `(${from} -> ${to}) · streak ${current}d / best ${longest}d · best day ${bestDay.count} on ${bestDay.date}`,
  );
  if (estimated > 0) {
    console.warn(`[contributions] ${estimated} day(s) had no tool-tip; counts were approximated.`);
  }
}

main().catch((error) => {
  console.error(`[contributions] ${error.message}`);
  process.exit(1);
});