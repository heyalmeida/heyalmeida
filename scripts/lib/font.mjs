/**
 * A tiny hand-authored dot-matrix font (8 x 7 per glyph, '#' = ink).
 *
 * It exists so the profile art can be generated with zero dependencies and zero
 * image assets: the banner is rasterised locally, then rendered either as real
 * text characters (ASCII art) or as crisp rounded cells (neofetch-style logo).
 */

const GLYPH_W = 8;
const GLYPH_H = 7;
const LETTER_GAP = 2;
const SPACE_W = 4;
const LINE_GAP = 1;

const GLYPHS = {
  A: ['..####..', '.##..##.', '##....##', '##....##', '########', '##....##', '##....##'],
  B: ['#####...', '##...##.', '##...##.', '#####...', '##...##.', '##...##.', '#####...'],
  C: ['..####..', '.##..##.', '##......', '##......', '##......', '.##..##.', '..####..'],
  D: ['#####...', '##...##.', '##....##', '##....##', '##....##', '##...##.', '#####...'],
  E: ['########', '##......', '##......', '######..', '##......', '##......', '########'],
  F: ['########', '##......', '##......', '######..', '##......', '##......', '##......'],
  G: ['..####..', '.##..##.', '##......', '##..####', '##....##', '.##..##.', '..####..'],
  H: ['##....##', '##....##', '##....##', '########', '##....##', '##....##', '##....##'],
  I: ['########', '...##...', '...##...', '...##...', '...##...', '...##...', '########'],
  J: ['....###.', '.....##.', '.....##.', '.....##.', '##...##.', '##...##.', '.#####..'],
  K: ['##....##', '##...##.', '##..##..', '#####...', '##..##..', '##...##.', '##....##'],
  L: ['##......', '##......', '##......', '##......', '##......', '##......', '########'],
  M: ['##....##', '###..###', '##.##.##', '##....##', '##....##', '##....##', '##....##'],
  N: ['##....##', '###...##', '####..##', '##.##.##', '##..####', '##...###', '##....##'],
  O: ['..####..', '.##..##.', '##....##', '##....##', '##....##', '.##..##.', '..####..'],
  P: ['######..', '##...##.', '##....##', '##...##.', '######..', '##......', '##......'],
  Q: ['..####..', '.##..##.', '##....##', '##....##', '##.##.##', '.##..##.', '..####.#'],
  R: ['######..', '##...##.', '##....##', '##...##.', '######..', '##..##..', '##...##.'],
  S: ['.#####..', '##...##.', '##......', '.#####..', '.....##.', '##...##.', '.#####..'],
  T: ['########', '...##...', '...##...', '...##...', '...##...', '...##...', '...##...'],
  U: ['##....##', '##....##', '##....##', '##....##', '##....##', '.##..##.', '..####..'],
  V: ['##....##', '##....##', '##....##', '.##..##.', '.##..##.', '..####..', '...##...'],
  W: ['##....##', '##....##', '##....##', '##.##.##', '##.##.##', '###..###', '##....##'],
  X: ['##....##', '.##..##.', '..####..', '...##...', '..####..', '.##..##.', '##....##'],
  Y: ['##....##', '.##..##.', '..####..', '...##...', '...##...', '...##...', '...##...'],
  Z: ['########', '.....##.', '....##..', '...##...', '..##....', '.##.....', '########'],
};

const blankColumns = (count) => Array.from({ length: count }, () => '0'.repeat(GLYPH_H));

/**
 * Rasterise uppercase text into a grid of '0' / '1' cells.
 * Supports "\\n" for stacked lines; each line is left-aligned and then trimmed.
 *
 * @param {string} text
 * @returns {{ rows: string[], width: number, height: number, masked: string }}
 */
export function rasterize(text) {
  const lines = String(text).split('\n');

  const lineColumns = lines.map((line) => {
    const columns = [];
    for (const char of line) {
      if (char === ' ') {
        columns.push(...blankColumns(SPACE_W));
        continue;
      }
      const glyph = GLYPHS[char.toUpperCase()];
      if (!glyph) {
        throw new Error(
          `No glyph for "${char}". Available: ${Object.keys(GLYPHS).join('')} (plus space and \\n)`,
        );
      }
      for (let x = 0; x < GLYPH_W; x += 1) {
        columns.push(glyph.map((row) => (row[x] === '#' ? '1' : '0')).join(''));
      }
      columns.push(...blankColumns(LETTER_GAP));
    }
    // Drop the trailing letter spacing so lines can be centred cleanly.
    while (columns.length > 0 && !columns[columns.length - 1].includes('1')) columns.pop();
    return columns;
  });

  const width = lineColumns.reduce((max, columns) => Math.max(max, columns.length), 0);
  const height = lines.length * GLYPH_H + (lines.length - 1) * LINE_GAP;

  const rows = [];
  lineColumns.forEach((columns, lineIndex) => {
    for (let y = 0; y < GLYPH_H; y += 1) {
      rows.push(
        Array.from({ length: width }, (_, x) => columns[x]?.[y] ?? '0').join(''),
      );
    }
    if (lineIndex < lineColumns.length - 1) {
      for (let y = 0; y < LINE_GAP; y += 1) rows.push('0'.repeat(width));
    }
  });

  return {
    rows,
    width,
    height,
    masked: rows.join('\n'),
    lineWidths: lineColumns.map((columns) => columns.length),
    lineHeight: GLYPH_H,
    lineGap: LINE_GAP,
  };
}

/**
 * Convert a rasterised grid into ASCII art text using a brightness ramp.
 * Here the grid is binary, so ink maps to the darkest ramp glyph.
 *
 * @param {string[]} rows
 * @param {string} ramp bright -> dark
 */
export function gridToAscii(rows, ramp = ' .:-=+*#%@') {
  const ink = ramp[ramp.length - 1];
  const empty = ramp[0];
  return rows.map((row) => [...row].map((cell) => (cell === '1' ? ink : empty)).join(''));
}

export const FONT_METRICS = { GLYPH_W, GLYPH_H, LETTER_GAP, SPACE_W, LINE_GAP };
export { GLYPHS };