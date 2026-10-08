#!/usr/bin/env node
// Builds the Quick Start Icons site from src/ into site/dist/ with no dependencies: `node site/build.mjs`.
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { loadLibrary, fileText, spokenName, titleName, DEFAULTS, REPO } from "./icons.mjs";

const HERE = join(REPO, "site");
const PAGE = join(HERE, "page");
const DIST = join(HERE, "dist");

/* ---------- site identity ---------- */

// ORIGIN is the only place the hostname is written, with no trailing slash.
const ORIGIN = "https://icons.evanpizzolato.com";
const NAME = "Quick Start Icons";
const AUTHOR = "Evan Pizzolato";
const REPO_URL = "https://github.com/evanpizzolato/quick-start-icons";
const CDN = "https://cdn.jsdelivr.net/gh/evanpizzolato/quick-start-icons/src";
const AUTHOR_SAME_AS = ["https://github.com/evanpizzolato"];
// Bing Webmaster Tools ownership tag, which must stay on the home page after verification.
const BING_SITE_AUTH = "C5619139927EDADDCA0ADDB81DE34EF9";
const YEAR = new Date().getFullYear();
// Local date, to match the committer dates git reports for lastmod.
const TODAY = new Date().toLocaleDateString("en-CA");

const { icons, categories, stats } = loadLibrary();
const COUNT = icons.length;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const squash = (s) => s.replace(/\s+/g, " ").trim();
// Schema and markdown answers are plain text, so the page's little markup comes out.
const plain = (s) => squash(s).replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const listOf = (words) => (words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`);
const hash = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 10);

const iconPath = (icon) => `/icons/${icon.name}/`;
const catPath = (cat) => `/categories/${cat.slug}/`;

/* ---------- markup pieces ---------- */

// The root attributes are CSS properties on .glyph svg, so the page does not repeat them 170 times.
const glyph = (geometry) => `<svg viewBox="0 0 32 32" aria-hidden="true">${geometry.join("")}</svg>`;

// Chrome icons come from the library through one hidden sprite, outside .glyph so the controls never reach them.
const UI_ICONS = ["copy", "download", "search", "close", "refresh"];
const SQUARE_UI = new Set(["copy"]);

const sprite = () =>
  `<svg class="sprite" aria-hidden="true"><defs>` +
  UI_ICONS.map((name) => {
    const icon = icons.find((i) => i.name === name);
    if (!icon) throw new Error(`UI icon "${name}" is not in src/`);
    const square = SQUARE_UI.has(name);
    const geometry = icon.geometry
      .map((t) => {
        t = t.replace(/ style="[^"]*"/, "");
        if (!square) return t.replace(/ d="[^"]*" data-d-round="([^"]*)"/, ' d="$1"');
        return t.replace(/ data-d-round="[^"]*"/, "").replace(/(<rect(?![^>]*data-radius)[^>]*) rx="[^"]*"/, "$1");
      })
      .join("");
    return (
      `<symbol id="ui-${name}" viewBox="0 0 32 32" fill="none" stroke="currentColor" ` +
      `stroke-width="2" stroke-linecap="round" stroke-linejoin="${square ? "miter" : "round"}">${geometry}</symbol>`
    );
  }).join("") +
  `</defs></svg>`;

const ui = (name, size = 16) => `<svg class="ui" style="--ui:${size}px"><use href="#ui-${name}"/></svg>`;

// The name is a stretched link over the whole card, and the two buttons sit above it.
const card = (icon) => `<article class="card" data-name="${icon.name}" data-terms="${esc(icon.aliases.join(" "))}">
<div class="glyph">${glyph(icon.geometry)}<button class="btn btn-icon card-dl" data-act="download" aria-label="Download ${icon.name}.svg">${ui("download")}</button></div>
<div class="card-meta">
<a class="card-name" href="${iconPath(icon)}">${icon.name}<span class="sr-only"> icon</span></a>
<button class="btn btn-copy" data-act="copy" aria-label="Copy ${icon.name} SVG">${ui("copy")}<span class="btn-label">Copy</span></button>
</div>
</article>`;

const searchField = (count) => `
        <div class="field field-search">
          <label class="label" for="search">Search</label>
          <div class="search">
            <span class="search-icon" aria-hidden="true">${ui("search", 18)}</span>
            <input type="search" id="search" placeholder="Search ${count} icons" aria-describedby="count">
            <kbd class="search-key" aria-hidden="true">/</kbd>
          </div>
        </div>
`;

const gridFoot = (count, label, zip) => `
          <p class="count" id="count">${count} icons</p>
          <button type="button" class="btn btn-block" id="download-all" data-zip="${zip}">${ui("download")}<span class="btn-label">${label}</span></button>`;

const iconFoot = (icon) => `
          <button type="button" class="btn btn-block" data-act="copy" data-name="${icon.name}" aria-label="Copy SVG, ${icon.name}">${ui("copy")}<span class="btn-label">Copy SVG</span></button>
          <button type="button" class="btn btn-block btn-quiet-block" data-act="download" data-name="${icon.name}" aria-label="Download ${icon.name}.svg">${ui("download")}<span class="btn-label">Download</span></button>`;

const panel = ({ search = "", foot }) => `    <form class="panel" id="panel" autocomplete="off" onsubmit="return false">
      <div class="panel-inner">

        <div class="panel-head">
          <h2>Customize</h2>
          <button type="button" class="btn btn-quiet" id="reset">${ui("refresh")}<span class="btn-label">Reset</span></button>
        </div>
${search}
        <div class="field field-weight">
          <div class="label-row">
            <label class="label" for="weight">Stroke weight</label>
            <output class="readout" id="weight-out" for="weight">${DEFAULTS.weight}</output>
          </div>
          <input type="range" id="weight" min="1" max="3" step="0.25" value="${DEFAULTS.weight}">
        </div>

        <div class="field field-corners">
          <span class="label" id="corners-label">Corners</span>
          <div class="segmented" role="radiogroup" aria-labelledby="corners-label">
            <button type="button" role="radio" aria-checked="true" data-corners="square">Square</button>
            <button type="button" role="radio" aria-checked="false" data-corners="rounded">Rounded</button>
          </div>
        </div>

        <div class="panel-foot">${foot}
        </div>

      </div>
    </form>`;

const footNav = (current) =>
  categories
    .map((c) => `    <a href="${catPath(c)}"${c === current ? ' aria-current="page"' : ""}>${esc(c.title)}</a>`)
    .join("\n");

/* ---------- questions ---------- */

// One array writes the visible FAQ, the FAQPage data and llms.txt, and each answer states the fact in its first sentence.
const FAQ = [
  [
    `Is Quick Start Icons free for commercial use?`,
    `Yes, Quick Start Icons is MIT licensed, so all ${COUNT} icons are free to use in
     commercial products, client work and paid apps. You can modify them and ship the
     modified versions. Attribution is appreciated and not required, and there is no paid
     tier holding icons back.`,
  ],
  [
    `How many icons are in the set?`,
    `There are ${COUNT} icons in ${categories.length} categories: ${listOf(categories.map((c) => c.title.toLowerCase()))}.
     Each one is a single SVG file drawn on the same 32 by 32 canvas.`,
  ],
  [
    `Can I change the stroke weight?`,
    `Yes, the stroke weight slider sets every icon from 1 to 3 in steps of 0.25, and the
     default is 1.25. The weight showing on the page is baked into the file you copy or
     download, so there is no separate thin or bold set to install.`,
  ],
  [
    `What does the corners toggle do?`,
    `The corners toggle switches every icon between square and rounded corners, and square
     is the default. Corners are authored three ways in SVG, as a rect radius, as a stroke
     line join, and as an arc inside the path data, and the toggle reaches all three. Both
     states come from the same source file.`,
  ],
  [
    `Do I need to install a package?`,
    `No, there is no npm package, no icon font and no runtime to install. You copy the SVG
     markup or download the file, and paste it into your project. That works in HTML, JSX,
     Vue, Svelte and Figma without a build step.`,
  ],
  [
    `Can I load the icons from a CDN?`,
    `Yes, jsDelivr serves every icon at <code>${CDN}/&lt;name&gt;.svg</code>, with no
     account and no install. Replace the name with the icon's file name, such as bell or
     gear. The CDN file is the authored source, with rounded corners and a stroke weight of
     2, and each icon page shows its own CDN URL.`,
  ],
  [
    `Does every icon have its own page?`,
    `Yes, every icon has a page at <code>${ORIGIN.replace("https://", "")}/icons/&lt;name&gt;/</code>
     with the SVG code, the CDN URL, the words it is also found under, and related icons.
     The same page is available as markdown at <code>/icons/&lt;name&gt;.md</code>.`,
  ],
  [
    `How do I change the color of an icon?`,
    `Set the CSS <code>color</code> property on the icon or on its parent, because every
     icon is stroked with <code>currentColor</code>. It inherits color the same way text
     does, so an icon follows a theme change without a second copy.`,
  ],
  [
    `What size are the icons?`,
    `Each icon is drawn on a 32 by 32 viewBox and exported with a width and height of 24.
     The export size gives the SVG an intrinsic size, because a pasted SVG without one
     renders at 300 by 150. Change the width and height, or remove them and size the icon
     with CSS.`,
  ],
  [
    `Can I download all the icons at once?`,
    `Yes, the Download all button saves the complete set as one zip file, with your current
     stroke weight and corner setting applied to every icon. The archive is written in the
     browser, so nothing is uploaded and no account or email address is asked for.`,
  ],
  [
    `Who made Quick Start Icons?`,
    `${AUTHOR}, a product designer, drew and shipped the set. Every icon is authored by hand
     as a live stroke rather than traced or converted from a filled path, which is what lets
     one stroke weight control drive the whole library.`,
  ],
];

const faqHtml = FAQ.map(([q, a]) => `<div class="qa-item">\n<h3>${q}</h3>\n<p>${squash(a)}</p>\n</div>`).join("\n");

/* ---------- structured data ---------- */

const PERSON = {
  "@type": "Person",
  "@id": `${ORIGIN}/#author`,
  name: AUTHOR,
  jobTitle: "Product Designer",
  url: `${ORIGIN}/`,
  ...(AUTHOR_SAME_AS.length ? { sameAs: AUTHOR_SAME_AS } : {}),
};

const WEBSITE = {
  "@type": "WebSite",
  "@id": `${ORIGIN}/#website`,
  url: `${ORIGIN}/`,
  name: NAME,
  description: `${COUNT} open source SVG icons with live stroke weight and corner controls.`,
  inLanguage: "en",
  publisher: { "@id": `${ORIGIN}/#author` },
};

const crumbs = (items) => ({
  "@type": "BreadcrumbList",
  "@id": `${items.at(-1).url}#breadcrumb`,
  itemListElement: items.map((item, i) => ({ "@type": "ListItem", position: i + 1, name: item.name, item: item.url })),
});

const homeJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    WEBSITE,
    PERSON,
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
        "Square or rounded corners",
        "Copy to clipboard or download a single SVG",
        "Download the whole set as a zip",
        "currentColor stroke, no hard coded hex",
        "Every icon served by jsDelivr",
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
        url: `${ORIGIN}${iconPath(icon)}`,
      })),
    },
    {
      "@type": "HowTo",
      "@id": `${ORIGIN}/#how-to-use`,
      name: "How to use a Quick Start icon",
      description: "Set the stroke weight and the corner style, find the icon, then copy the SVG. Nothing to install.",
      totalTime: "PT1M",
      step: [
        ["Set the stroke weight", "Move the slider between 1 and 3. All icons repaint together."],
        ["Choose the corners", "Switch between square and rounded corners for the whole set. Square is the default."],
        ["Find the icon", "Type in the search box, or press the slash key from anywhere on the page."],
        ["Copy or download", "Copy puts the SVG markup on the clipboard. Download saves a single file, or the whole set as a zip."],
        ["Paste it in", "Inline SVG works in HTML, JSX, Vue, Svelte and Figma with no build step."],
      ].map(([name, text], i) => ({ "@type": "HowToStep", position: i + 1, name, text, url: `${ORIGIN}/#using` })),
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

/* ---------- per-icon copy ---------- */

const iconCopy = (icon) => {
  const spoken = spokenName(icon.name);
  const first = listOf(icon.aliases.slice(0, 3));
  return {
    heading: `${titleName(icon.name)} icon`,
    title: `${titleName(icon.name)} icon: free SVG, adjustable stroke | ${NAME}`,
    deck: `A free ${spoken} icon in SVG, also found under ${first}. Set the stroke weight and the corners, then copy the code or download the file.`,
    description: `Free ${spoken} SVG icon, also found under ${first}. Adjust the stroke weight and corners, then copy the code or download the file. MIT licensed.`,
    cdn: `${CDN}/${icon.name}.svg`,
  };
};

const iconJsonLd = (icon, copy) => {
  const url = `${ORIGIN}${iconPath(icon)}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", "@id": `${ORIGIN}/#website`, url: `${ORIGIN}/`, name: NAME },
      PERSON,
      {
        "@type": "WebPage",
        "@id": `${url}#webpage`,
        url,
        name: copy.heading,
        description: copy.deck,
        isPartOf: { "@id": `${ORIGIN}/#website` },
        breadcrumb: { "@id": `${url}#breadcrumb` },
        primaryImageOfPage: { "@id": `${url}#image` },
        inLanguage: "en",
      },
      crumbs([
        { name: NAME, url: `${ORIGIN}/` },
        { name: icon.category.title, url: `${ORIGIN}${catPath(icon.category)}` },
        { name: icon.name, url },
      ]),
      {
        "@type": "ImageObject",
        "@id": `${url}#image`,
        name: copy.heading,
        description: copy.deck,
        contentUrl: `${ORIGIN}/svg/${icon.name}.svg`,
        url,
        thumbnailUrl: `${ORIGIN}/og/${icon.name}.png`,
        encodingFormat: "image/svg+xml",
        keywords: icon.aliases.join(", "),
        license: "https://opensource.org/licenses/MIT",
        acquireLicensePage: `${ORIGIN}/#license`,
        creditText: NAME,
        copyrightNotice: `Copyright ${YEAR} ${AUTHOR}`,
        creator: { "@id": `${ORIGIN}/#author` },
        isAccessibleForFree: true,
        representativeOfPage: true,
      },
    ],
  };
};

const categoryJsonLd = (cat) => {
  const url = `${ORIGIN}${catPath(cat)}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", "@id": `${ORIGIN}/#website`, url: `${ORIGIN}/`, name: NAME },
      {
        "@type": "CollectionPage",
        "@id": `${url}#webpage`,
        url,
        name: cat.heading,
        description: cat.intro,
        isPartOf: { "@id": `${ORIGIN}/#website` },
        breadcrumb: { "@id": `${url}#breadcrumb` },
        inLanguage: "en",
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: cat.members.length,
          itemListElement: cat.members.map((icon, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: icon.name,
            url: `${ORIGIN}${iconPath(icon)}`,
          })),
        },
      },
      crumbs([
        { name: NAME, url: `${ORIGIN}/` },
        { name: cat.title, url },
      ]),
    ],
  };
};

/* ---------- pages ---------- */

const ASSETS = ["styles.css", "app.js"];
const assetBytes = Object.fromEntries(ASSETS.map((a) => [a, readFileSync(join(PAGE, a))]));
const LAYOUT = readFileSync(join(PAGE, "layout.html"), "utf8");
const read = (f) => readFileSync(join(PAGE, f), "utf8");

const fill = (template, slots) => {
  let out = template;
  for (const [key, value] of Object.entries(slots)) out = out.replaceAll(`{{${key}}}`, value);
  return out;
};

const page = ({ path, title, description, ogTitle, ogDescription, ogImage, ogAlt, jsonLd, main, after = "", headExtra = "", robots, current }) => {
  const html = fill(LAYOUT, {
    TITLE: esc(title),
    DESCRIPTION: esc(description),
    URL: `${ORIGIN}${path}`,
    ROBOTS: robots ?? "index, follow, max-image-preview:large, max-snippet:-1",
    OG_TITLE: esc(ogTitle ?? title),
    OG_DESCRIPTION: esc(ogDescription ?? description),
    OG_IMAGE: ogImage ?? `${ORIGIN}/og.png`,
    OG_IMAGE_ALT: esc(ogAlt ?? `${NAME}, ${COUNT} open source SVG icons`),
    CSS_V: hash(assetBytes["styles.css"]),
    JS_V: hash(assetBytes["app.js"]),
    HEAD_EXTRA: headExtra,
    // A "<" inside JSON-LD would end the script element early, so it is escaped.
    JSONLD: jsonLd ? JSON.stringify(jsonLd).replace(/</g, "\\u003c") : "{}",
    SPRITE: sprite(),
    MAIN: main,
    AFTER_MAIN: after,
    FOOT_NAV: footNav(current),
    REPO: REPO_URL,
    YEAR: String(YEAR),
  });
  const leftover = html.match(/\{\{[A-Z_]+\}\}/g);
  if (leftover) throw new Error(`${path}: unfilled template slots ${[...new Set(leftover)].join(", ")}`);
  return html;
};

// The homepage template carries the docs sheet after </main>, so it is split there.
const homeSource = read("home.html");
const splitAt = homeSource.indexOf("</main>") + "</main>".length;
const homeSlots = {
  COUNT: String(COUNT),
  CATEGORY_COUNT: String(categories.length),
  PANEL: panel({ search: searchField(COUNT), foot: gridFoot(COUNT, "Download all", "quick-start-icons") }),
  GRID: icons.map(card).join("\n"),
  FAQ: faqHtml,
  CDN,
  EXAMPLE: esc(fileText(icons.find((i) => i.name === "plus"))).trimEnd(),
  UI_CLOSE: ui("close", 16),
  YEAR: String(YEAR),
};

const homeHtml = page({
  path: "/",
  title: `${NAME}: ${COUNT} free open source SVG icons`,
  description: `${COUNT} open source SVG icons with live stroke weight and corner controls. Copy or download any icon, or the whole set as a zip. MIT licensed, free for commercial use.`,
  ogDescription: `Set the stroke weight and the corners, then copy. ${COUNT} MIT licensed SVG icons, free for personal and commercial use.`,
  jsonLd: homeJsonLd,
  headExtra: `<meta name="msvalidate.01" content="${BING_SITE_AUTH}">`,
  main: fill(homeSource.slice(0, splitAt), homeSlots),
  after: fill(homeSource.slice(splitAt), homeSlots),
});

const iconTemplate = read("icon.html");
const iconPages = icons.map((icon) => {
  const copy = iconCopy(icon);
  const main = fill(iconTemplate, {
    NAME: icon.name,
    HEADING: esc(copy.heading),
    DECK: esc(copy.deck),
    CAT_SLUG: icon.category.slug,
    CAT_TITLE: esc(icon.category.title),
    CAT_TITLE_LOWER: esc(icon.category.title.toLowerCase()),
    PANEL: panel({ foot: iconFoot(icon) }),
    GLYPH: glyph(icon.geometry),
    CODE: esc(fileText(icon)).trimEnd(),
    CDN_URL: copy.cdn,
    ALIASES: esc(icon.aliases.join(", ")),
    RELATED: icon.related
      .map((r) => `          <li><a class="tile" href="${iconPath(r)}"><span class="glyph">${glyph(r.geometry)}</span><span class="tile-name">${r.name}<span class="sr-only"> icon</span></span></a></li>`)
      .join("\n"),
  });
  return {
    icon,
    copy,
    html: page({
      path: iconPath(icon),
      title: copy.title,
      description: copy.description,
      ogTitle: `${copy.heading}: free SVG | ${NAME}`,
      ogImage: `${ORIGIN}/og/${icon.name}.png`,
      ogAlt: `The ${spokenName(icon.name)} icon from ${NAME}`,
      jsonLd: iconJsonLd(icon, copy),
      headExtra: `<link rel="alternate" type="text/markdown" href="/icons/${icon.name}.md" title="${esc(copy.heading)} as markdown">`,
      main,
      current: icon.category,
    }),
  };
});

const categoryTemplate = read("category.html");
const categoryPages = categories.map((cat) => ({
  cat,
  html: page({
    path: catPath(cat),
    title: `${cat.heading}: ${cat.members.length} free SVG icons | ${NAME}`,
    description: `${cat.members.length} free ${cat.heading.toLowerCase()} in SVG. ${cat.intro.split(". ")[0].replace(/\.$/, "")}. MIT licensed.`,
    jsonLd: categoryJsonLd(cat),
    main: fill(categoryTemplate, {
      TITLE: esc(cat.title),
      HEADING: esc(cat.heading),
      INTRO: esc(cat.intro),
      PANEL: panel({ search: searchField(cat.members.length), foot: gridFoot(cat.members.length, "Download these", `quick-start-icons-${cat.slug}`) }),
      GRID: cat.members.map(card).join("\n"),
    }),
    current: cat,
  }),
}));

const notFound = page({
  path: "/404.html",
  title: `Page not found | ${NAME}`,
  description: `This page does not exist. ${NAME} has ${COUNT} free SVG icons.`,
  robots: "noindex",
  jsonLd: { "@context": "https://schema.org", "@graph": [WEBSITE] },
  main: `<main class="page">
  <div class="hero">
    <h1>Page not found</h1>
    <p class="deck">There is no page at this address. Every icon is on the <a href="/">home page</a>, and the categories are listed below.</p>
  </div>
</main>`,
});

/* ---------- markdown and text for answer engines ---------- */

const iconMarkdown = ({ icon, copy }) => `# ${copy.heading}

${copy.deck}

- Name: ${icon.name}
- Category: [${icon.category.title}](${ORIGIN}${catPath(icon.category)})
- Also found under: ${icon.aliases.join(", ")}
- Page: ${ORIGIN}${iconPath(icon)}
- SVG file: ${ORIGIN}/svg/${icon.name}.svg
- CDN: ${copy.cdn}
- License: MIT. Free for personal and commercial use. Attribution is not required.

## SVG

This is the file Copy gives you at the site defaults: square corners and a stroke weight of ${DEFAULTS.weight}.

\`\`\`svg
${fileText(icon).trimEnd()}
\`\`\`

## Use it from a CDN

The CDN file is the authored source: rounded corners, a stroke weight of 2, and no width or height. An image tag draws it in black, so paste the markup inline to color it with CSS.

\`\`\`html
<img src="${copy.cdn}" width="24" height="24" alt="">
\`\`\`

## Related icons

${icon.related.map((r) => `- [${r.name}](${ORIGIN}/icons/${r.name}.md)`).join("\n")}
`;

const facts = `- Icons: ${COUNT}, outline style, one SVG file each, in ${categories.length} categories.
- Canvas: 32 by 32 viewBox, exported at 24 by 24.
- Stroke: authored at 2, adjustable on the page from 1 to 3 in steps of 0.25, default ${DEFAULTS.weight}.
- Corners: square or rounded, default square, both derived from the same source file.
- Color: stroke is currentColor, so an icon inherits the CSS color of its parent.
- CDN: ${CDN}/<name>.svg serves the authored source through jsDelivr.
- Pages: ${ORIGIN}/icons/<name>/ for each icon, and ${ORIGIN}/icons/<name>.md as markdown.
- Dependencies: none. No npm package, no icon font, no runtime, no build step.
- Delivery: copy the markup, download one SVG, or download the whole set as a zip built in the browser.`;

const header = `# ${NAME}

> ${COUNT} free, open source, MIT licensed SVG icons for people scaffolding a new project.
> Stroke weight and corner style are live controls on the page rather than separate
> downloads, and the setting is baked into the file you copy.

Site: ${ORIGIN}/
Source: ${REPO_URL}
Author: ${AUTHOR}
License: MIT. Free for personal and commercial use, modification allowed, attribution not required.`;

const llms = `${header}

## Facts

${facts}

## Docs

- [Every icon with its aliases and SVG code](${ORIGIN}/llms-full.txt): one file, ${COUNT} icons.
${categories.map((c) => `- [${c.heading}](${ORIGIN}${catPath(c)}): ${c.members.length} icons. ${c.intro.split(". ")[0].replace(/\.$/, "")}.`).join("\n")}

## Questions and answers

${FAQ.map(([q, a]) => `### ${q}\n\n${plain(a)}`).join("\n\n")}

## Every icon

${icons.map((i) => `- [${i.name}](${ORIGIN}/icons/${i.name}.md): ${i.aliases.join(", ")}`).join("\n")}
`;

const llmsFull = `${header}

## Facts

${facts}

The SVG under each icon is the file Copy gives you at the site defaults: square corners and a stroke weight of ${DEFAULTS.weight}.

${categories
  .map(
    (c) => `## ${c.heading}

${c.intro}

${c.members
  .map(
    (i) => `### ${i.name}

Also found under: ${i.aliases.join(", ")}
Page: ${ORIGIN}${iconPath(i)}
CDN: ${CDN}/${i.name}.svg

\`\`\`svg
${fileText(i).trimEnd()}
\`\`\``
  )
  .join("\n\n")}`
  )
  .join("\n\n")}
`;

/* ---------- crawl files ---------- */

// Every crawler is welcome, and several of these bots read only their own block.
const robots = `# ${NAME}
# ${COUNT} MIT licensed SVG icons. Crawling and citation are allowed without restriction.

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

User-agent: Bingbot
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

// lastmod is the newest commit date among the files that feed a page, or today when one of them has uncommitted changes.
function lastModified() {
  const scope = ["src", "site/page", "site/build.mjs"];
  try {
    const opts = { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] };
    const dates = new Map();
    let date = TODAY;
    for (const line of execFileSync("git", ["log", "--format=@%cs", "--name-only", "--", ...scope], opts).split("\n")) {
      if (line.startsWith("@")) date = line.slice(1);
      else if (line && !dates.has(line)) dates.set(line, date);
    }
    for (const line of execFileSync("git", ["status", "--porcelain", "--untracked-files=all", "--", ...scope], opts).split("\n")) {
      if (line) dates.set(line.slice(3).split(" -> ").at(-1), TODAY);
    }
    return (paths) => paths.map((p) => dates.get(p) ?? TODAY).sort().at(-1);
  } catch {
    return () => TODAY;
  }
}
const lastmod = lastModified();

const SHELL = ["site/page/layout.html", "src/categories.json"];
const sitemapEntries = [
  { loc: "/", lastmod: lastmod([...icons.map((i) => `src/${i.file}`), "src/aliases.json", "site/page/home.html", "site/build.mjs", ...SHELL]) },
  ...categories.map((c) => ({
    loc: catPath(c),
    lastmod: lastmod([...c.members.map((i) => `src/${i.file}`), "src/aliases.json", "site/page/category.html", ...SHELL]),
  })),
  ...icons.map((i) => ({
    loc: iconPath(i),
    lastmod: lastmod([`src/${i.file}`, "src/aliases.json", "site/page/icon.html", ...SHELL]),
    image: `/svg/${i.name}.svg`,
  })),
];

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${sitemapEntries
  .map(
    (e) => `  <url>
    <loc>${ORIGIN}${e.loc}</loc>
    <lastmod>${e.lastmod}</lastmod>${e.image ? `\n    <image:image><image:loc>${ORIGIN}${e.image}</image:loc></image:image>` : ""}
  </url>`
  )
  .join("\n")}
</urlset>
`;

// Fingerprinted by ?v= in every page, so the CSS and JS can be cached for a year.
const headers = `/styles.css
  Cache-Control: public, max-age=31536000, immutable

/app.js
  Cache-Control: public, max-age=31536000, immutable

/fonts/*
  Cache-Control: public, max-age=31536000, immutable

/svg/*
  Cache-Control: public, max-age=86400
  Access-Control-Allow-Origin: *

/og/*
  Cache-Control: public, max-age=86400

/*.md
  Content-Type: text/markdown; charset=utf-8

/*.txt
  Content-Type: text/plain; charset=utf-8
`;

/* ---------- write ---------- */

const INDEXNOW_KEY = read("indexnow-key.txt").trim();
if (!/^[a-f0-9]{32}$/.test(INDEXNOW_KEY)) throw new Error("page/indexnow-key.txt must hold 32 hex characters");

const missingOg = icons.filter((i) => !existsSync(join(PAGE, "og", `${i.name}.png`))).map((i) => i.name);
if (missingOg.length) throw new Error(`No Open Graph image for ${missingOg.join(", ")}. Run node site/make-og.mjs`);

const write = (path, content) => {
  const full = join(DIST, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
};

rmSync(DIST, { recursive: true, force: true });
write("index.html", homeHtml);
write("404.html", notFound);
for (const { icon, html, copy } of iconPages) {
  write(`icons/${icon.name}/index.html`, html);
  write(`icons/${icon.name}.md`, iconMarkdown({ icon, copy }));
  write(`svg/${icon.name}.svg`, fileText(icon));
  write(`og/${icon.name}.png`, readFileSync(join(PAGE, "og", `${icon.name}.png`)));
}
for (const { cat, html } of categoryPages) write(`categories/${cat.slug}/index.html`, html);
write("robots.txt", robots);
write("sitemap.xml", sitemap);
write("llms.txt", llms);
write("llms-full.txt", llmsFull);
write("_headers", headers);
write(`${INDEXNOW_KEY}.txt`, INDEXNOW_KEY);
for (const asset of [...ASSETS, "og.png", "fonts/PaperMono.woff2", "fonts/PaperMono-OFL.txt", "fonts/Inter-latin.woff2", "fonts/Inter-OFL.txt"]) {
  write(asset, readFileSync(join(PAGE, asset)));
}

const kb = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(1)} KB`;
console.log(`dist/index.html       ${COUNT} icons inlined, ${kb(homeHtml)}`);
console.log(`dist/icons/           ${iconPages.length} pages, ${iconPages.length} markdown files`);
console.log(`dist/svg/             ${COUNT} files`);
console.log(`dist/categories/      ${categoryPages.length} pages`);
console.log(`dist/sitemap.xml      ${sitemapEntries.length} URLs, ${COUNT} images`);
console.log(`dist/llms.txt         ${kb(llms)}`);
console.log(`dist/llms-full.txt    ${kb(llmsFull)}`);
console.log(`                      ${FAQ.length} questions in the page and in the FAQPage data`);
console.log(`                      ${stats.scaledRects} rects scale with the corner toggle`);
console.log(`                      ${stats.fixedRects} rects marked data-radius="fixed" and left alone`);
console.log(`                      ${stats.squaredArcs} arc corners squared across ${stats.squaredPaths} paths`);
console.log(`                      ${stats.authoredSquares} paths carry an authored data-d-square`);
console.log(`                      ${stats.fixedPaths} paths marked data-corner="fixed" and left alone`);
