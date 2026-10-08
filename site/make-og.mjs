#!/usr/bin/env node
// Draws page/og.png and page/og/<name>.png with headless Chrome, run by hand: `node site/make-og.mjs [name ...]`.
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir, availableParallelism } from "node:os";
import { loadLibrary, fileText, titleName } from "./icons.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE = join(HERE, "page");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const W = 1200;
const H = 630;
const run = promisify(execFile);

const { icons, byName } = loadLibrary();

// Fonts go in as data URLs, because Chrome blocks a file:// page from loading a file:// font.
const font = (file) => `data:font/woff2;base64,${readFileSync(join(PAGE, "fonts", file)).toString("base64")}`;
const FONTS = `
  @font-face { font-family: "Inter"; src: url("${font("Inter-latin.woff2")}") format("woff2"); font-weight: 400 700; }
  @font-face { font-family: "Paper Mono"; src: url("${font("PaperMono.woff2")}") format("woff2"); font-weight: 100 800; }`;

const BASE = `
  * { box-sizing: border-box; margin: 0; }
  body {
    width: ${W}px; height: ${H}px;
    padding: 72px;
    background: #020203;
    color: #dfdfe5;
    font: 400 14px/24px Inter, sans-serif;
    letter-spacing: -0.01em;
    -webkit-font-smoothing: antialiased;
  }
  .mark {
    display: grid; place-items: center;
    width: 64px; height: 64px;
    background: #1a1a1a;
    font: 600 26px/1 "Paper Mono", monospace;
  }
  h1 { font: 500 68px/1.05 Inter, sans-serif; letter-spacing: -0.04em; color: #e5e5eb; }
  p { font-size: 26px; line-height: 40px; color: #7d7e7f; }
  .url { font: 400 20px/24px "Paper Mono", monospace; color: #7d7e7f; letter-spacing: 0; }`;

// The site default, square corners at weight 1.25, is what each card shows.
const art = (name) => fileText(byName.get(name));

const ROW = ["sparkle", "arrow-right", "folder", "user", "search", "heart", "gear", "code", "chart-line", "rocket"];

const siteCard = () => `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}${BASE}
  body { display: flex; flex-direction: column; justify-content: space-between; }
  h1 { margin-top: 40px; }
  p { margin-top: 20px; max-width: 760px; }
  .row { display: flex; gap: 24px; border-top: 1px solid #1f2126; padding-top: 40px; }
  .row div { display: grid; place-items: center; width: 72px; height: 72px; background: #101012; }
  .row svg { width: 36px; height: 36px; }
</style></head><body>
  <div>
    <div class="mark">QS</div>
    <h1>Quick Start Icons</h1>
    <p>${icons.length} open source SVG icons. Set the stroke weight and the corners, then copy.</p>
  </div>
  <div class="row">${ROW.map((n) => `<div>${art(n)}</div>`).join("")}</div>
</body></html>`;

const iconCard = (icon) => `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}${BASE}
  body { display: flex; gap: 64px; align-items: stretch; }
  .text { flex: 1; display: flex; flex-direction: column; justify-content: space-between; min-width: 0; }
  h1 { margin-top: 48px; }
  p { margin-top: 20px; }
  .art { flex: none; display: grid; place-items: center; width: 486px; border: 1px solid #1f2126; background: #101012; }
  .art svg { width: 256px; height: 256px; }
</style></head><body>
  <div class="text">
    <div>
      <div class="mark">QS</div>
      <h1>${titleName(icon.name)} icon</h1>
      <p>Free SVG with adjustable stroke weight and corners. MIT licensed.</p>
    </div>
    <div class="url">icons.evanpizzolato.com</div>
  </div>
  <div class="art">${art(icon.name)}</div>
</body></html>`;

const work = mkdtempSync(join(tmpdir(), "qs-og-"));

async function shoot(html, out, key) {
  const file = join(work, `${key}.html`);
  writeFileSync(file, html);
  await run(CHROME, [
    "--headless",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--disable-component-update",
    "--force-device-scale-factor=1",
    `--window-size=${W},${H}`,
    `--screenshot=${out}`,
    "--virtual-time-budget=2000",
    `file://${file}`,
  ]);
}

const only = process.argv.slice(2);
const targets = only.length
  ? only.map((n) => {
      if (!byName.has(n)) throw new Error(`No icon named ${n}`);
      return byName.get(n);
    })
  : icons;

mkdirSync(join(PAGE, "og"), { recursive: true });
const jobs = [];
if (!only.length) jobs.push(() => shoot(siteCard(), join(PAGE, "og.png"), "site"));
for (const icon of targets) jobs.push(() => shoot(iconCard(icon), join(PAGE, "og", `${icon.name}.png`), icon.name));

let next = 0;
const lanes = Math.min(6, availableParallelism());
await Promise.all(Array.from({ length: lanes }, async () => {
  while (next < jobs.length) await jobs[next++]();
}));

rmSync(work, { recursive: true, force: true });
console.log(`${jobs.length} cards at ${W}x${H} in page/og.png and page/og/`);
