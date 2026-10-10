#!/usr/bin/env node
/**
 * Render an ASCII art banner as a self-typing SVG.
 *
 * Two modes:
 *   node scripts/render-ascii.mjs                       -> dot-matrix wordmark from the built-in font
 *   node scripts/render-ascii.mjs --image photo.png     -> real photo converted to ASCII art
 *
 * Every row is wrapped in a clip rect whose width is animated with SMIL, so the
 * art "prints" top to bottom once and then freezes. SMIL still runs inside an
 * SVG loaded through <img>, which is exactly how GitHub embeds profile READMEs.
 *
 * Usage:
 *   node scripts/render-ascii.mjs [--text "PEDRO\nALMEIDA"] [--image photo.png]
 *                                 [--cols 100] [--cell 10] [--ramp " .:-=+*#%@"]
 *                                 [--invert] [--no-contrast] [--out assets/pedro-ascii.svg]
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { THEME, esc, panel } from './lib/theme.mjs';
import { gridToAscii, rasterize } from './lib/font.mjs';
import { decodePng } from './lib/png.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const WIDTH = 850;
const TITLE_BAR = 34;
const TOP_PAD = 24;
const BOTTOM_PAD = 26;
const SIDE_PAD = 32;
const CELL_RATIO = 0.6; // monospace advance / line height
const MAX_RAMP_ROWS = 48;

const DEFAULT_RAMP = ' .:-=+*#%@';
const DEFAULT_TEXT = 'PEDRO\nALMEIDA';

function parseArgs(argv) {
  const options = {
    text: DEFAULT_TEXT,
    image: null,
    cols: 100,
    cell: 10,
    ramp: DEFAULT_RAMP,
    invert: false,
    contrast: true,
    center: true,
    out: 'assets/pedro-ascii.svg',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const [flag, inline] = argv[i].split('=');
    const value = inline ?? argv[i + 1];
    const consume = () => {
      if (inline === undefined) i += 1;
    };

    switch (flag) {
      case '--text':
        options.text = String(value ?? '').replace(/\\n/g, '\n');
        consume();
        break;
      case '--image':
        options.image = value;
        break;
      case '--cols':
        options.cols = Number(value);
        consume();
        break;
      case '--cell':
        options.cell = Number(value);
        consume();
        break;
      case '--ramp':
        options.ramp = value;
        consume();
        break;
      case '--invert':
        options.invert = true;
        break;
      case '--no-contrast':
        options.contrast = false;
        break;
      case '--no-center':
        options.center = false;
        break;
      case '--out':
        options.out = value;
        consume();
        break;
      default:
        break;
    }
  }

  return options;
}

/** Map a 0..1 luminance grid onto the brightness ramp (bright -> sparse glyph). */
function luminanceToAscii(lu, cols, rows, ramp) {
  const glyphs = [];
  for (let y = 0; y < rows; y += 1) {
    let line = '';
    for (let x = 0; x < cols; x += 1) {
      const value = Math.min(1, Math.max(0, lu[y * cols + x]));
      line += ramp[Math.round((1 - value) * (ramp.length - 1))];
    }
    glyphs.push(line);
  }
  return glyphs;
}

function centerLine(line, width) {
  const trimmed = line.replace(/\s+$/, '');
  const lead = Math.max(0, Math.floor((width - trimmed.length) / 2));
  return ' '.repeat(lead) + trimmed;
}

/** Box-filter a decoded PNG down to a cols x rows luminance grid. */
function downscale(image, cols, rows, { invert, contrast }) {
  const { width, height, luminance } = image;
  const out = new Float32Array(cols * rows);
  let min = 1;
  let max = 0;

  for (let y = 0; y < rows; y += 1) {
    const y0 = Math.floor((y * height) / rows);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * height) / rows));
    for (let x = 0; x < cols; x += 1) {
      const x0 = Math.floor((x * width) / cols);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * width) / cols));
      let sum = 0;
      let count = 0;
      for (let sy = y0; sy < y1; sy += 1) {
        for (let sx = x0; sx < x1; sx += 1) {
          sum += luminance[sy * width + sx];
          count += 1;
        }
      }
      const value = count > 0 ? sum / count : 1;
      out[y * cols + x] = value;
      if (value < min) min = value;
      if (value > max) max = value;
    }
  }

  // Auto-levels: a flatly lit portrait turns into an unreadable blob otherwise.
  if (contrast && max - min > 0.02) {
    const low = min + (max - min) * 0.02;
    const high = min + (max - min) * 0.98;
    const span = Math.max(1e-6, high - low);
    for (let i = 0; i < out.length; i += 1) {
      out[i] = Math.min(1, Math.max(0, (out[i] - low) / span));
    }
  }

  if (invert) {
    for (let i = 0; i < out.length; i += 1) out[i] = 1 - out[i];
  }

  return out;
}

function buildArt(options) {
  if (!options.image) {
    const grid = rasterize(options.text);
    const lines = gridToAscii(grid.rows, options.ramp);
    const glyphs = options.center
      ? lines.map((line) => centerLine(line, grid.width))
      : lines;
    return {
      glyphs,
      plain: options.text.replace(/\n/g, ' / '),
      source: `dot-matrix font ${grid.width}x${grid.height}`,
    };
  }

  const image = decodePng(options.image);
  let cols = Math.max(12, Math.min(160, Math.round(options.cols)));
  let rows = Math.max(4, Math.round(cols * (image.height / image.width) * CELL_RATIO));

  if (rows > MAX_RAMP_ROWS) {
    cols = Math.max(12, Math.round(cols * (MAX_RAMP_ROWS / rows)));
    rows = Math.max(4, Math.round(cols * (image.height / image.width) * CELL_RATIO));
  }

  const luminance = downscale(image, cols, rows, options);
  return {
    glyphs: luminanceToAscii(luminance, cols, rows, options.ramp),
    plain: `ASCII portrait from ${options.image}`,
    source: `${options.image} ${image.width}x${image.height} -> ${cols}x${rows} characters`,
  };
}

function render(options) {
  const { glyphs, plain, source } = buildArt(options);
  const rows = glyphs.length;
  const cols = glyphs.reduce((max, line) => Math.max(max, line.length), 0);

  const maxArtWidth = WIDTH - 2 * SIDE_PAD;
  const cell = Math.min(options.cell, maxArtWidth / cols);
  const lineHeight = cell / CELL_RATIO;
  const fontSize = lineHeight;
  const artWidth = cols * cell;
  const artHeight = rows * lineHeight;
  const height = Math.ceil(TITLE_BAR + TOP_PAD + artHeight + BOTTOM_PAD);

  const originX = (WIDTH - artWidth) / 2;
  const originY = TITLE_BAR + TOP_PAD;
  const stagger = rows > 24 ? 55 : 90;

  const clips = [];
  const groups = [];

  glyphs.forEach((line, index) => {
    // Trailing blanks are dropped (they confuse textLength measurements) and the
    // row is positioned by its own leading offset, which keeps every row aligned.
    const trimmed = line.replace(/\s+$/, '');
    if (trimmed.length === 0) return;

    const lead = line.length - line.trimStart().length;
    const x = originX + lead * cell;
    const rowWidth = trimmed.length * cell;
    const top = originY + index * lineHeight;
    const begin = (0.15 + index * (stagger / 1000)).toFixed(3);

    clips.push(
      `    <clipPath id="wipe-${index}">\n` +
        `      <rect x="${x.toFixed(2)}" y="${top.toFixed(2)}" width="0" height="${lineHeight.toFixed(2)}">\n` +
        `        <animate attributeName="width" from="0" to="${rowWidth.toFixed(2)}" dur="0.42s" begin="${begin}s" ` +
        `fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.2 0.8 0.25 1"/>\n` +
        `      </rect>\n` +
        `    </clipPath>`,
    );

    groups.push(
      `  <g clip-path="url(#wipe-${index})">\n` +
        `    <text xml:space="preserve" x="${x.toFixed(2)}" y="${(top + fontSize * 0.78).toFixed(2)}" ` +
        `font-size="${fontSize.toFixed(2)}" textLength="${rowWidth.toFixed(2)}" lengthAdjust="spacing" ` +
        `fill="${THEME.accent}">${esc(trimmed)}</text>\n` +
        `  </g>`,
    );
  });

  const cursor =
    `  <rect class="cursor" x="${originX.toFixed(2)}" ` +
    `y="${(originY + artHeight - 3).toFixed(2)}" width="${Math.min(artWidth, 14).toFixed(2)}" height="3" ` +
    `rx="1.5" fill="${THEME.accent}"/>`;

  const svg = panel({
    width: WIDTH,
    height,
    title: 'pedro@github: ~/whoami',
    label: `ASCII art banner: ${plain}`,
    children: ['  <defs>', ...clips, '  </defs>', ...groups, cursor].join('\n'),
  });

  return { svg, source };
}

try {
  const options = parseArgs(process.argv.slice(2));
  const { svg, source } = render(options);
  const output = resolve(ROOT, options.out);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, svg, 'utf8');
  console.log(`[ascii] ${source}`);
  console.log(`[ascii] wrote ${output} (${(svg.length / 1024).toFixed(1)} KB)`);
} catch (error) {
  console.error(`[ascii] ${error.message}`);
  process.exit(1);
}