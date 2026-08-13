#!/usr/bin/env node
/**
 * Build the Quick Start icons site.
 *
 *   node site/build.mjs        # writes site/dist/
 *
 * Reads src/*.svg and inlines every one of them into a single static page.
 * The 170 sources are ~48 KB raw and gzip to under 5 KB, so inlining is both
 * the cheapest and the simplest option: the grid is readable before a line of
 * script runs, and copy/download can serialize straight from the live DOM
 * without a second copy of the geometry in JS.
 *
 * The one transform applied to each source: every <rect> that is not marked
 * data-radius="fixed" gets its authored rx echoed into a --base-rx custom
 * property, so one CSS rule can square every corner at once. <ellipse rx> is
 * never touched, because the rule that reads --base-rx selects rect only.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { squarePath } from "./square-path.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..");
const SRC = join(REPO, "src");
const PAGE = join(HERE, "page");
const DIST = join(HERE, "dist");

/* ---------- site identity ----------
   ORIGIN is the only place the hostname is written. It fills the canonical link,
   the Open Graph tags, every JSON-LD @id, robots.txt and sitemap.xml. No
   trailing slash. */
const ORIGIN = "https://icons.evanpizzolato.com";
const NAME = "Quick Start Icons";
const AUTHOR = "Evan Pizzolato";
const REPO_URL = "https://github.com/evanpizzolato/quick-start-icons";
/* sameAs tells search engines this name is one person, not a string. */
const AUTHOR_SAME_AS = ["https://github.com/evanpizzolato"];

/* The root every source is expected to carry. All 170 are byte-identical here,
   and the site depends on that: presentation attributes on the root and nowhere
   else is what lets one CSS rule drive the stroke weight of the whole page. */
const EXPECTED_ROOT_ATTRS = [
  'viewBox="0 0 32 32"',
  'fill="none"',
  'stroke="currentColor"',
  'stroke-width="2"',
  'stroke-linecap="round"',
  'stroke-linejoin="round"',
];

const files = readdirSync(SRC).filter((f) => f.endsWith(".svg")).sort();
if (!files.length) throw new Error(`No SVGs found in ${SRC}`);

let scaledRects = 0;
let fixedRects = 0;
let squaredArcs = 0;
let squaredPaths = 0;
let fixedPaths = 0;
let authoredSquares = 0;
const icons = [];

for (const file of files) {
  const name = file.replace(/\.svg$/, "");
  const raw = readFileSync(join(SRC, file), "utf8");

  const open = raw.match(/<svg\b[^>]*>/);
  if (!open) throw new Error(`${file}: no <svg> root`);
  for (const attr of EXPECTED_ROOT_ATTRS) {
    if (!open[0].includes(attr)) throw new Error(`${file}: root is missing ${attr}`);
  }

  // Everything between the root tags, whitespace normalized to one child per line.
  let inner = raw.slice(open.index + open[0].length).replace(/<\/svg>\s*$/, "");
  const children = inner
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const geometry = children.map((tag) => {
    if (tag.startsWith("<rect")) {
      if (tag.includes('data-radius="fixed"')) {
        fixedRects++;
        return tag; // radius carries the meaning here: toggle, mic, mic-off
      }
      const rx = tag.match(/\brx="([0-9.]+)"/);
      if (!rx) return tag;
      scaledRects++;
      return tag.replace(/\/>$/, ` style="--base-rx:${rx[1]}"/>`);
    }

    /* A path corner authored as an explicit arc is baked geometry, so no CSS
       property reaches it. Derive the squared alternative here and carry it as
       data-d-square; app.js swaps `d` on the toggle. */
    if (!tag.startsWith("<path")) return tag;
    if (tag.includes('data-corner="fixed"')) {
      fixedPaths++;
      return tag.replace(/ data-corner="fixed"/, ""); // authoring metadata, not output
    }
    /* A path may also state its own squared geometry, for the case derivation
       cannot reach: a stroke that stops on a fillet belonging to another path
       has no arc of its own to work back from. `send`'s fold line is the only
       one so far. */
    if (tag.includes("data-d-square=")) {
      authoredSquares++;
      squaredPaths++;
      return tag;
    }
    const d = tag.match(/\bd="([^"]+)"/);
    if (!d) return tag;
    const result = squarePath(d[1]);
    if (!result) return tag;
    squaredArcs += result.squared;
    squaredPaths++;
    return tag.replace(/\/>$/, ` data-d-square="${result.d}"/>`);
  });

  icons.push({ name, geometry });
}

/* ---------- markup ---------- */

/* The authored root attributes are not repeated 170 times in the DOM. Every one
   of them is a CSS property, so .glyph svg sets fill, stroke, both line joins
   and the weight, exactly as the weight control already worked. The copy and
   download paths rebuild the root from a template string, so the file that
   leaves the site still carries the full authored root and matches src/. */
const glyph = (geometry) =>
  `<svg viewBox="0 0 32 32" aria-hidden="true">${geometry.join("")}</svg>`;

/* Chrome icons come from the library itself, via one hidden sprite rather than
   inline copies. The Copy and Download glyphs appear on all 170 cards, and
   inlining them there cost more DOM than every icon in the library combined.
   They live outside .glyph, so the controls do not reach them, and they never
   need serializing, which is the only thing <use> would have made awkward. */
const UI_ICONS = ["copy", "download", "search", "close", "refresh"];

const sprite = () =>
  `<svg class="sprite" aria-hidden="true"><defs>` +
  UI_ICONS.map((name) => {
    const icon = icons.find((i) => i.name === name);
    if (!icon) throw new Error(`UI icon "${name}" is not in src/`);
    const geometry = icon.geometry.map((t) => t.replace(/ style="[^"]*"/, "")).join("");
    return (
      `<symbol id="ui-${name}" viewBox="0 0 32 32" fill="none" stroke="currentColor" ` +
      `stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${geometry}</symbol>`
    );
  }).join("") +
  `</defs></svg>`;

/* Size comes from CSS, everything else from the symbol, so each of the 340
   instances on the page costs 38 bytes instead of 190. */
const ui = (name, size = 16) =>
  `<svg class="ui" style="--ui:${size}px"><use href="#ui-${name}"/></svg>`;

/* The footer is quickstart's exactly: name left, Copy right, one hairline above.
   Download does not fit beside them without truncating every name over about
   twelve characters, so it sits in the corner of the glyph area and appears on
   hover or focus. It is the one hover behaviour on the page, borrowed from
   slimicons, and it leaves the resting state identical to the reference. */
const card = ({ name, geometry }) => `<article class="card" data-name="${name}">
<div class="glyph">${glyph(geometry)}<button class="btn btn-icon card-dl" data-act="download" aria-label="Download ${name}.svg">${ui("download")}</button></div>
<div class="card-meta">
<span class="card-name">${name}</span>
<button class="btn btn-copy" data-act="copy" aria-label="Copy ${name} SVG">${ui("copy")}<span class="btn-label">Copy</span></button>
</div>
</article>`;

/* ---------- questions ----------
   One array writes both the visible FAQ and the FAQPage data, so they cannot
   drift. Search engines require that: schema answer must equal page answer.
   Each answer opens with a full sentence, so quoting only the first is safe. */
const COUNT = icons.length;

const FAQ = [
  [
    `Is Quick Start Icons free for commercial use?`,
    `Yes. Quick Start Icons is MIT licensed, so all ${COUNT} icons are free to use in
     commercial products, client work, and paid apps. You can modify them and ship the
     modified versions. Attribution is appreciated and not required, and there is no paid
     tier holding icons back.`,
  ],
  [
    `How many icons are in the set?`,
    `There are ${COUNT} icons, covering the things a new project needs on day one:
     navigation and arrows, files and folders, users, media controls, editing, git, charts,
     weather, and interface furniture. Each one is a single SVG file drawn on the same 32 by
     32 canvas.`,
  ],
  [
    `Can I change the stroke weight?`,
    `Yes, on the page, before you copy. The stroke weight slider runs from 1 to 3 in steps
     of 0.25 and repaints all ${COUNT} icons at once. Whatever weight is showing is baked
     into the file you copy or download, so there is no separate thin or bold set to
     install.`,
  ],
  [
    `What does the corners toggle do?`,
    `It switches every icon between rounded and square corners. Corners are authored three
     ways in SVG, as a rect radius, as a stroke line join, and as an arc inside the path
     data, and the toggle reaches all three. Both states come from the same source file, so
     the two are always in step.`,
  ],
  [
    `Do I need to install a package?`,
    `No. There is no npm package, no icon font, and no runtime. You copy the SVG markup or
     download the file, and paste it into your project. That works in HTML, JSX, Vue,
     Svelte, and Figma without a build step, and it means an icon costs nothing at install
     time.`,
  ],
  [
    `How do I change the color of an icon?`,
    `Set the CSS <code>color</code> property on the icon or on anything containing it. Every
     icon is stroked with <code>currentColor</code> rather than a hard coded hex value, so
     it inherits color the same way text does. That also means an icon follows a dark mode
     or a theme change without a second copy.`,
  ],
  [
    `What size are the icons?`,
    `Each icon is drawn on a 32 by 32 viewBox and exported with a width and height of 24.
     The export size is set so the SVG has an intrinsic size; without one, a browser renders
     a pasted SVG at 300 by 150. Change the width and height, or remove them and size the
     icon with CSS.`,
  ],
  [
    `Can I download all the icons at once?`,
    `Yes. The Download all button saves the complete set as a zip, with your current stroke
     weight and corner setting already applied to every file. The archive is written in the
     browser, so nothing is uploaded and no account or email address is asked for.`,
  ],
  [
    `Who made Quick Start Icons?`,
    `${AUTHOR}, a product designer, drew and shipped the set. Every icon is authored by hand
     as a live stroke rather than traced or converted from a filled path, which is what makes
     one stroke weight control able to drive the whole library.`,
  ],
];

/* Schema answers are plain text. Strip the little markup the page answers use. */
const squash = (s) => s.replace(/\s+/g, " ").trim();
const plain = (s) => squash(s).replace(/<\/?code>/g, "");

const faqHtml = FAQ.map(
  ([q, a]) => `<div class="qa-item">
<h3>${q}</h3>
<p>${squash(a)}</p>
</div>`
).join("\n");

/* ---------- structured data ----------
   One @graph, so site, software and person link by @id instead of repeating.
   The ItemList holds all icon names. It is the only machine-readable answer to
   "does this set have a bell icon", which is what an AI actually gets asked. */
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${ORIGIN}/#website`,
      url: `${ORIGIN}/`,
      name: NAME,
      description: `${COUNT} open source SVG icons with live stroke weight and corner controls.`,
      inLanguage: "en",
      publisher: { "@id": `${ORIGIN}/#author` },
    },
    {
      "@type": "Person",
      "@id": `${ORIGIN}/#author`,
      name: AUTHOR,
      jobTitle: "Product Designer",
      ...(AUTHOR_SAME_AS.length ? { sameAs: AUTHOR_SAME_AS } : {}),
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${ORIGIN}/#icons`,
      name: NAME,
      url: `${ORIGIN}/`,
      applicationCategory: "DesignApplication",
      operatingSystem: "Any",
      description:
        `Quick Start Icons is a free, open source set of ${COUNT} SVG icons for people ` +
        `scaffolding a new project. Every icon is drawn as a live stroke on a 32 by 32 canvas, ` +
        `so the stroke weight and the corner style are controls on the page rather than separate ` +
        `downloads. Copy one icon or download all ${COUNT}. The license is MIT.`,
      license: "https://opensource.org/licenses/MIT",
      codeRepository: REPO_URL,
      isAccessibleForFree: true,
      author: { "@id": `${ORIGIN}/#author` },
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      featureList: [
        `${COUNT} outline SVG icons`,
        "Stroke weight adjustable from 1 to 3",
        "Rounded or square corners",
        "Copy to clipboard or download a single SVG",
        "Download the whole set as a zip",
        "currentColor stroke, no hard coded hex",
        "No dependencies and no install step",
        "MIT licensed for personal and commercial use",
      ],
    },
    {
      "@type": "ItemList",
      "@id": `${ORIGIN}/#icon-list`,
      name: `Every icon in ${NAME}`,
      numberOfItems: COUNT,
      itemListOrder: "https://schema.org/ItemListOrderAscending",
      itemListElement: icons.map((icon, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: icon.name,
      })),
    },
    {
      "@type": "HowTo",
      "@id": `${ORIGIN}/#how-to-use`,
      name: "How to use a Quick Start icon",
      description:
        "Set the stroke weight and the corner style, find the icon, then copy the SVG. " +
        "Nothing to install.",
      totalTime: "PT1M",
      step: [
        ["Set the stroke weight", "Move the slider between 1 and 3. All icons repaint together."],
        ["Choose the corners", "Switch between rounded and square corners for the whole set."],
        ["Find the icon", "Type in the search box, or press the slash key from anywhere on the page."],
        ["Copy or download", "Copy puts the SVG markup on the clipboard. Download saves a single file, or the whole set as a zip."],
        ["Paste it in", "Inline SVG works in HTML, JSX, Vue, Svelte and Figma with no build step."],
      ].map(([name, text], i) => ({
        "@type": "HowToStep",
        position: i + 1,
        name,
        text,
        url: `${ORIGIN}/#using`,
      })),
    },
    {
      "@type": "FAQPage",
      "@id": `${ORIGIN}/#faq`,
      mainEntity: FAQ.map(([q, a]) => ({
        "@type": "Question",
        name: q,
        acceptedAnswer: { "@type": "Answer", text: plain(a) },
      })),
    },
  ],
};

const template = readFileSync(join(PAGE, "template.html"), "utf8");
const html = template
  .replaceAll("{{COUNT}}", String(COUNT))
  .replaceAll("{{ORIGIN}}", ORIGIN)
  .replaceAll("{{REPO}}", REPO_URL)
  /* No-script fallback. app.js overwrites it on load, so a page built in
     December and read in January is still right. */
  .replaceAll("{{YEAR}}", String(new Date().getFullYear()))
  .replaceAll("{{GRID}}", icons.map(card).join("\n"))
  .replaceAll("{{SPRITE}}", sprite())
  .replaceAll("{{FAQ}}", faqHtml)
  .replaceAll("{{JSONLD}}", JSON.stringify(jsonLd))
  .replaceAll("{{UI_SEARCH}}", ui("search", 18))
  .replaceAll("{{UI_CLOSE}}", ui("close", 16))
  .replaceAll("{{UI_DOWNLOAD}}", ui("download", 16))
  .replaceAll("{{UI_REFRESH}}", ui("refresh", 16));

const leftover = html.match(/\{\{[A-Z_]+\}\}/g);
if (leftover) throw new Error(`Unfilled template slots: ${[...new Set(leftover)].join(", ")}`);

/* ---------- the crawl files ----------
   Generated, not hand-kept, so the icon list and hostname have one source. */

/* One date per build. lastmod is all a one-page sitemap has to say. */
const TODAY = new Date().toISOString().slice(0, 10);

/* Every crawler is welcome, assistants included. Named one by one, not left to
   the wildcard, because several of these bots read only their own block.
   Remove a block to shut one out. */
const robots = `# ${NAME}
# ${COUNT} MIT licensed SVG icons. Everything here is meant to be found, quoted
# and copied, so crawling and citation are allowed without restriction.

User-agent: *
Allow: /

# Retrieval and citation agents
User-agent: OAI-SearchBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Claude-User
Allow: /

User-agent: Claude-SearchBot
Allow: /

# Training crawlers
User-agent: GPTBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: Applebot-Extended
Allow: /

Sitemap: ${ORIGIN}/sitemap.xml
`;

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${ORIGIN}/</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`;

/* llms.txt is a proposal, not a standard, and Google says it does not feed AI
   Overviews. Kept because it costs one file and is the only place the icon list
   exists as plain text: a model can answer "is there a git-merge icon" without
   parsing 170 inlined SVGs. Documentation for machines, not a ranking signal. */
const llms = `# ${NAME}

> ${COUNT} free, open source, MIT licensed SVG icons for people scaffolding a new project.
> Stroke weight and corner style are live controls on the page rather than separate
> downloads, and the setting is baked into the file you copy.

Site: ${ORIGIN}/
Source: ${REPO_URL}
Author: ${AUTHOR}
License: MIT. Free for personal and commercial use, modification allowed, attribution not required.

## Facts

- Icons: ${COUNT}, outline style, one SVG file each.
- Canvas: 32 by 32 viewBox, exported at 24 by 24.
- Stroke: authored at 2, adjustable on the page from 1 to 3 in steps of 0.25, default 1.25.
- Corners: rounded or square, both derived from the same source file.
- Color: stroke is currentColor, so an icon inherits the CSS color of its parent.
- Dependencies: none. No npm package, no icon font, no runtime, no build step.
- Delivery: copy the markup, download one SVG, or download the whole set as a zip built in the browser.

## Questions and answers

${FAQ.map(([q, a]) => `### ${q}\n\n${plain(a)}`).join("\n\n")}

## Every icon

${icons.map((i) => i.name).join(", ")}
`;

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });
writeFileSync(join(DIST, "index.html"), html);
writeFileSync(join(DIST, "robots.txt"), robots);
writeFileSync(join(DIST, "sitemap.xml"), sitemap);
writeFileSync(join(DIST, "llms.txt"), llms);
for (const asset of ["styles.css", "app.js", "og.png"]) {
  writeFileSync(join(DIST, asset), readFileSync(join(PAGE, asset)));
}

const bytes = Buffer.byteLength(html);
console.log(`dist/index.html  ${icons.length} icons inlined, ${(bytes / 1024).toFixed(1)} KB`);
console.log(`                 ${FAQ.length} questions in the page and in the FAQPage data`);
console.log(`                 JSON-LD ${(Buffer.byteLength(JSON.stringify(jsonLd)) / 1024).toFixed(1)} KB across ${jsonLd["@graph"].length} entities`);
console.log(`dist/robots.txt  sitemap at ${ORIGIN}/sitemap.xml`);
console.log(`dist/sitemap.xml lastmod ${TODAY}`);
console.log(`dist/llms.txt    ${(Buffer.byteLength(llms) / 1024).toFixed(1)} KB`);
console.log(`                 ${scaledRects} rects scale with the corner toggle`);
console.log(`                 ${fixedRects} rects marked data-radius="fixed" and left alone`);
console.log(`                 ${squaredArcs} arc corners squared across ${squaredPaths} paths`);
console.log(`                 ${authoredSquares} paths carry an authored data-d-square`);
console.log(`                 ${fixedPaths} paths marked data-corner="fixed" and left alone`);
