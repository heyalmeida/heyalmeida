/**
 * Shared theme + SVG boilerplate for the generated profile art.
 *
 * Everything here is dependency-free: the SVGs are plain files committed to the
 * repo, so the README never depends on a hosted stats service that can rate
 * limit, go offline or render a broken-image icon.
 */

export const THEME = {
  bg: '#0d1117',
  panel: '#161b22',
  border: '#30363d',
  text: '#c9d1d9',
  muted: '#8b949e',
  accent: '#61afef',
  good: '#39d353',
  warn: '#e3b341',
  danger: '#ff5f56',
  // GitHub-ish green ramp: level 0 (none) -> level 4 (busiest)
  green: ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'],
  font: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
};

/** Escape a string for use in SVG text nodes / attributes. */
export function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Animations shared by every panel. CSS inside an <img>-embedded SVG is not stripped. */
const COMMON_CSS = `
text { font-family: ${THEME.font}; fill: ${THEME.text}; }
.mono { font-family: ${THEME.font}; }
.cell { animation: cellIn .5s cubic-bezier(.2,.7,.3,1) both; transform-box: fill-box; transform-origin: center; }
@keyframes cellIn { from { opacity: 0; transform: translate(-3px,-3px) scale(.45); } to { opacity: 1; transform: none; } }
.row { animation: rowIn .55s cubic-bezier(.2,.7,.3,1) both; }
@keyframes rowIn { from { opacity: 0; transform: translateX(-14px); } to { opacity: 1; transform: none; } }
.pop { animation: popIn .6s cubic-bezier(.2,.7,.3,1) both; transform-box: fill-box; transform-origin: center; }
@keyframes popIn { from { opacity: 0; transform: scale(.85); } to { opacity: 1; transform: none; } }
.cursor { animation: blink 1.05s steps(1,end) infinite; }
@keyframes blink { 0%,49% { opacity: 1; } 50%,100% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  /* CSS animations are dropped (elements rest at their visible state), but the
     SMIL row wipe is intentionally kept: without it the clip rects would stay at
     width 0 and the art would never appear. */
  .cell, .row, .pop, .cursor { animation: none !important; opacity: 1 !important; transform: none !important; }
}
`.trim();

/**
 * Wraps panel content in the terminal window chrome used by all three SVGs:
 * rounded dark panel, 1px border and the three "traffic light" dots.
 *
 * @param {{width:number, height:number, title:string, label:string, children:string, css?:string}} options
 */
export function panel({ width, height, title, label, children, css = '' }) {
  const lights = [
    [22, THEME.danger],
    [40, THEME.warn],
    [58, THEME.good],
  ]
    .map(([cx, fill]) => `    <circle cx="${cx}" cy="18" r="5" fill="${fill}" opacity="0.85"/>`)
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${esc(label)}">
  <title>${esc(label)}</title>
  <style>
${COMMON_CSS}
${css}
  </style>
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="14" fill="${THEME.bg}" stroke="${THEME.border}"/>
  <line x1="1" y1="34" x2="${width - 1}" y2="34" stroke="${THEME.border}" stroke-opacity="0.7"/>
${lights}
  <text x="78" y="22.5" font-size="12" fill="${THEME.muted}">${esc(title)}</text>
${children}
</svg>
`;
}