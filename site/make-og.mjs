#!/usr/bin/env node
/**
 * Draw the Open Graph card.
 *
 *   node site/make-og.mjs        # writes site/page/og.png
 *
 * Run by hand, not by the build. `build.mjs` stays dependency free and copies
 * the finished PNG into dist/; this needs a browser on the machine, so keeping
 * the two apart means a clone can build the site without one.
 *
 * PNG rather than SVG on purpose: an SVG og:image is ignored by every major
 * link unfurler, so the card would simply not appear.
 */
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src");
const OUT = join(HERE, "page", "og.png");

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const W = 1200;
const H = 630;

/* A row that reads as a set rather than as a random handful: an arrow, a
   container, a person, a state, a tool. Weight is the site default. */
const ROW = [
  "sparkle", "arrow-right", "folder", "user", "search",
  "heart", "gear", "code", "chart-line", "rocket",
];

const glyph = (name) => {
  const raw = readFileSync(join(SRC, `${name}.svg`), "utf8");
  const open = raw.match(/<svg\b[^>]*>/);
  const inner = raw.slice(open.index + open[0].length).replace(/<\/svg>\s*$/, "");
  return `<svg viewBox="0 0 32 32">${inner}</svg>`;
};

const html = `<!doctype html>
<html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=Inter:wght@400;500&display=swap">
<style>
  * { box-sizing: border-box; margin: 0; }
  body {
    width: ${W}px; height: ${H}px;
    display: flex; flex-direction: column; justify-content: space-between;
    padding: 72px;
    background: #020203;
    color: #dfdfe5;
    font: 500 14px/24px Inter, sans-serif;
    letter-spacing: -0.01em;
    -webkit-font-smoothing: antialiased;
  }
  .mark {
    display: grid; place-items: center;
    width: 64px; height: 64px;
    background: #1a1a1a;
    font: 600 26px/1 "IBM Plex Mono", monospace;
  }
  h1 { margin-top: 40px; font: 600 68px/1.1 "IBM Plex Mono", monospace; }
  p { margin-top: 20px; max-width: 720px; font-size: 26px; line-height: 40px; color: #7d7e7f; }
  .row { display: flex; gap: 24px; border-top: 1px solid #1f2126; padding-top: 40px; }
  .row div { display: grid; place-items: center; width: 72px; height: 72px; background: #101012; }
  .row svg {
    width: 36px; height: 36px;
    fill: none; stroke: currentColor;
    stroke-width: 1.25; stroke-linecap: round; stroke-linejoin: round;
  }
</style></head>
<body>
  <div>
    <div class="mark">QS</div>
    <h1>Quick Start Icons</h1>
    <p>170 open source SVG icons. Set the stroke weight and the corners, then copy.</p>
  </div>
  <div class="row">${ROW.map((n) => `<div>${glyph(n)}</div>`).join("")}</div>
</body></html>`;

const tmp = join(tmpdir(), "qs-og.html");
writeFileSync(tmp, html);

execFileSync(CHROME, [
  "--headless",
  "--disable-gpu",
  "--hide-scrollbars",
  "--force-device-scale-factor=1",
  `--window-size=${W},${H}`,
  `--screenshot=${OUT}`,
  "--virtual-time-budget=4000",
  `file://${tmp}`,
], { stdio: "inherit" });

unlinkSync(tmp);
console.log(`page/og.png  ${W}x${H}`);
