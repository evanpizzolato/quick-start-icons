#!/usr/bin/env node
// Checks site/dist/ after a build and exits non-zero on any failure: `node site/check.mjs`.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { loadLibrary, fileText, REPO } from "./icons.mjs";

const DIST = join(REPO, "site", "dist");
const ORIGIN = "https://icons.evanpizzolato.com";
const failures = [];
const fail = (where, msg) => failures.push(`${where}: ${msg}`);

const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
const files = walk(DIST);
const htmlFiles = files.filter((f) => f.endsWith(".html"));

const decode = (s) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&copy;/g, "©").replace(/&amp;/g, "&");
const text = (html) => decode(html.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
const all = (html, re) => [...html.matchAll(re)];

// Turns a site URL into the file Cloudflare would serve for it, or null when none exists.
function resolve(url) {
  const path = decodeURIComponent(url.replace(ORIGIN, "").split(/[?#]/)[0]);
  const candidates = path.endsWith("/") ? [`${path}index.html`] : [path, `${path}/index.html`, `${path}.html`];
  for (const c of candidates) {
    const f = join(DIST, c);
    if (existsSync(f) && statSync(f).isFile()) return f;
  }
  return null;
}

const titles = new Map();
const descriptions = new Map();
let links = 0;
let blocks = 0;

for (const file of htmlFiles) {
  const where = "/" + relative(DIST, file);
  const html = readFileSync(file, "utf8");

  // Exactly one h1 per page.
  const h1s = all(html, /<h1[\s>][\s\S]*?<\/h1>/g);
  if (h1s.length !== 1) fail(where, `${h1s.length} h1 elements`);
  const h1 = h1s[0] ? text(h1s[0][0]) : "";

  // Unique titles and descriptions, 404 aside.
  if (!where.endsWith("404.html")) {
    const title = decode(html.match(/<title>([^<]*)<\/title>/)[1]);
    const desc = decode(html.match(/<meta name="description" content="([^"]*)"/)[1]);
    if (titles.has(title)) fail(where, `title repeats ${titles.get(title)}`);
    if (descriptions.has(desc)) fail(where, `description repeats ${descriptions.get(desc)}`);
    titles.set(title, where);
    descriptions.set(desc, where);
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
    const expected = ORIGIN + where.replace(/index\.html$/, "");
    if (canonical !== expected) fail(where, `canonical ${canonical} should be ${expected}`);
  }

  // Every JSON-LD block parses.
  const graphs = all(html, /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g).map((m) => {
    blocks++;
    try {
      return JSON.parse(m[1]);
    } catch (e) {
      fail(where, `JSON-LD does not parse: ${e.message}`);
      return { "@graph": [] };
    }
  });
  const nodes = graphs.flatMap((g) => g["@graph"] ?? [g]);
  const node = (type) => nodes.find((n) => n["@type"] === type);
  const deck = text(html.match(/<p class="deck">([\s\S]*?)<\/p>/)?.[1] ?? "");

  // Breadcrumb data matches the visible trail.
  const crumbData = node("BreadcrumbList");
  const crumbNav = html.match(/<nav class="crumbs"[\s\S]*?<\/nav>/)?.[0];
  if (crumbData || crumbNav) {
    const visible = crumbNav ? all(crumbNav, /<li>([\s\S]*?)<\/li>/g).map((m) => text(m[1])) : [];
    const data = crumbData ? crumbData.itemListElement.map((i) => i.name) : [];
    if (JSON.stringify(visible) !== JSON.stringify(data)) fail(where, `breadcrumb data ${JSON.stringify(data)} differs from page ${JSON.stringify(visible)}`);
  }

  // Page and image names and descriptions match the h1 and the deck.
  for (const type of ["WebPage", "CollectionPage", "ImageObject"]) {
    const n = node(type);
    if (!n) continue;
    if (n.name !== h1) fail(where, `${type} name "${n.name}" differs from h1 "${h1}"`);
    if (n.description !== deck) fail(where, `${type} description differs from the deck`);
  }
  const image = node("ImageObject");
  if (image) {
    const terms = text(html.match(/<p class="terms">([\s\S]*?)<\/p>/)?.[1] ?? "");
    if (image.keywords !== terms) fail(where, "ImageObject keywords differ from the visible aliases");
    if (!resolve(image.contentUrl)) fail(where, `ImageObject contentUrl ${image.contentUrl} does not exist`);
    if (!resolve(image.thumbnailUrl)) fail(where, `ImageObject thumbnailUrl ${image.thumbnailUrl} does not exist`);
  }

  // A collection's item list matches the cards on the page.
  const collection = node("CollectionPage");
  if (collection) {
    const cards = all(html, /<a class="card-name" href="([^"]+)">/g).map((m) => ORIGIN + m[1]);
    const data = collection.mainEntity.itemListElement.map((i) => i.url);
    if (JSON.stringify(cards) !== JSON.stringify(data)) fail(where, "CollectionPage items differ from the cards");
  }

  // The FAQ data is the visible FAQ, answer for answer.
  const faq = node("FAQPage");
  if (faq) {
    const visible = all(html, /<div class="qa-item">\s*<h3>([\s\S]*?)<\/h3>\s*<p>([\s\S]*?)<\/p>/g).map((m) => [text(m[1]), text(m[2])]);
    const data = faq.mainEntity.map((q) => [q.name, q.acceptedAnswer.text]);
    if (JSON.stringify(visible) !== JSON.stringify(data)) fail(where, "FAQPage data differs from the visible FAQ");
  }

  // Every internal link and asset resolves, and every fragment names an id on its target.
  for (const m of all(html, /\s(?:href|src)="([^"]+)"/g)) {
    const url = decode(m[1]);
    if (/^(https?:)?\/\//.test(url) && !url.startsWith(ORIGIN)) continue;
    if (/^(data:|mailto:|#)/.test(url)) {
      if (url.startsWith("#") && url.length > 1 && !html.includes(`id="${url.slice(1)}"`)) fail(where, `no id for ${url}`);
      continue;
    }
    links++;
    const target = resolve(url.startsWith("/") || url.startsWith(ORIGIN) ? url : "/" + url);
    if (!target) {
      fail(where, `broken link ${url}`);
      continue;
    }
    const hash = url.split("#")[1];
    if (hash && !readFileSync(target, "utf8").includes(`id="${hash}"`)) fail(where, `no id "${hash}" in ${url}`);
  }
}

// Every URL in the sitemap, llms.txt, llms-full.txt and the markdown pages exists.
const textFiles = files.filter((f) => /\.(xml|txt|md)$/.test(f));
for (const file of textFiles) {
  const where = "/" + relative(DIST, file);
  for (const m of readFileSync(file, "utf8").matchAll(/https:\/\/icons\.evanpizzolato\.com[^\s<>)\]"]*/g)) {
    const url = m[0].replace(/[.,]$/, "");
    if (m.input[m.index + m[0].length] === "<") continue; // a pattern such as /icons/<name>/, not a link
    links++;
    if (!resolve(url)) fail(where, `broken link ${url}`);
  }
}

// The served SVG is the default output, and the rounded weight-2 output is src/ minus authoring attributes.
const { icons } = loadLibrary();
for (const icon of icons) {
  const served = readFileSync(join(DIST, "svg", `${icon.name}.svg`), "utf8");
  if (served !== fileText(icon)) fail(`/svg/${icon.name}.svg`, "differs from the default output");
  const authored = fileText(icon, { weight: 2, corners: "rounded" }).replace(' width="24" height="24"', "");
  const source = icon.raw.replace(/ data-corner="fixed"| data-radius="fixed"| data-d-square="[^"]*"/g, "");
  if (authored !== source) fail(`src/${icon.file}`, "rounded weight 2 output is not byte for byte the source");
  const code = readFileSync(join(DIST, "icons", icon.name, "index.html"), "utf8").match(/<code id="code"[^>]*>([\s\S]*?)<\/code>/)[1];
  if (decode(code) !== served.trimEnd()) fail(`/icons/${icon.name}/`, "the code block differs from the SVG file");
}

console.log(`${htmlFiles.length} pages, ${blocks} JSON-LD blocks, ${links} internal links, ${icons.length} SVGs checked`);
if (failures.length) {
  console.error(`\n${failures.length} failures:\n` + failures.slice(0, 60).join("\n"));
  process.exit(1);
}
console.log("All checks pass.");
