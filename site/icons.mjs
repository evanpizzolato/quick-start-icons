// Loads src/*.svg, src/aliases.json and src/categories.json, and throws on any gap so the build fails instead of shipping it.
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { squarePath } from "./square-path.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = join(HERE, "..");
export const SRC = join(REPO, "src");

// Every source carries this exact root, which is what lets one CSS rule drive the stroke weight of the whole page.
const EXPECTED_ROOT_ATTRS = [
  'viewBox="0 0 32 32"',
  'fill="none"',
  'stroke="currentColor"',
  'stroke-width="2"',
  'stroke-linecap="round"',
  'stroke-linejoin="round"',
];

export const DEFAULTS = { weight: 1.25, corners: "square" };
export const EXPORT_SIZE = 24;

const ALIAS_MIN = 3;
const ALIAS_MAX = 8;

// Words the mechanical name-to-title rule would get wrong.
const DISPLAY = { cpu: "CPU", wifi: "Wi-Fi" };

/** "arrow-down-left" becomes "arrow down left", for use inside a sentence. */
export const spokenName = (name) => DISPLAY[name] ?? name.replace(/-/g, " ");

/** "arrow-down-left" becomes "Arrow down left", for use as a title. */
export const titleName = (name) => {
  const s = spokenName(name);
  return s[0].toUpperCase() + s.slice(1);
};

// Square is the default corner style, so the squared geometry is the live `d`.
const squareByDefault = (tag, round, square) =>
  tag.replace(`d="${round}"`, `d="${square}"`).replace(/\/>$/, ` data-d-round="${round}"/>`);

export function loadLibrary() {
  const files = readdirSync(SRC).filter((f) => f.endsWith(".svg")).sort();
  if (!files.length) throw new Error(`No SVGs found in ${SRC}`);

  const stats = { scaledRects: 0, fixedRects: 0, squaredArcs: 0, squaredPaths: 0, fixedPaths: 0, authoredSquares: 0 };
  const icons = [];

  for (const file of files) {
    const name = file.replace(/\.svg$/, "");
    const raw = readFileSync(join(SRC, file), "utf8");

    const open = raw.match(/<svg\b[^>]*>/);
    if (!open) throw new Error(`${file}: no <svg> root`);
    for (const attr of EXPECTED_ROOT_ATTRS) {
      if (!open[0].includes(attr)) throw new Error(`${file}: root is missing ${attr}`);
    }

    // Everything between the root tags, one child per line.
    const children = raw
      .slice(open.index + open[0].length)
      .replace(/<\/svg>\s*$/, "")
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const geometry = children.map((tag) => {
      if (tag.startsWith("<rect")) {
        if (tag.includes('data-radius="fixed"')) {
          stats.fixedRects++;
          return tag; // radius carries the meaning here: toggle, mic, mic-off
        }
        const rx = tag.match(/\brx="([0-9.]+)"/);
        if (!rx) return tag;
        stats.scaledRects++;
        return tag.replace(/\/>$/, ` style="--base-rx:${rx[1]}"/>`);
      }

      // An arc corner is baked geometry no CSS reaches, so the page ships the squared `d` and keeps the authored one as data-d-round.
      if (!tag.startsWith("<path")) return tag;
      if (tag.includes('data-corner="fixed"')) {
        stats.fixedPaths++;
        return tag.replace(/ data-corner="fixed"/, "");
      }
      const d = tag.match(/\bd="([^"]+)"/);
      if (!d) return tag;
      // An authored data-d-square covers a stroke that ends on another path's fillet, such as `send`'s fold line.
      const authored = tag.match(/ data-d-square="([^"]+)"/);
      if (authored) {
        stats.authoredSquares++;
        stats.squaredPaths++;
        return squareByDefault(tag.replace(authored[0], ""), d[1], authored[1]);
      }
      const result = squarePath(d[1]);
      if (!result) return tag;
      stats.squaredArcs += result.squared;
      stats.squaredPaths++;
      return squareByDefault(tag, d[1], result.d);
    });

    icons.push({ name, file, raw, geometry, aliases: [], category: null, related: [] });
  }

  const byName = new Map(icons.map((i) => [i.name, i]));

  // Every icon needs 3 to 8 aliases, and every key needs an icon.
  const aliases = JSON.parse(readFileSync(join(SRC, "aliases.json"), "utf8"));
  for (const key of Object.keys(aliases)) {
    if (!byName.has(key)) throw new Error(`aliases.json: "${key}" has no src/${key}.svg`);
  }
  for (const icon of icons) {
    const list = aliases[icon.name];
    if (!Array.isArray(list)) throw new Error(`aliases.json: ${icon.name} has no entry`);
    if (list.length < ALIAS_MIN || list.length > ALIAS_MAX)
      throw new Error(`aliases.json: ${icon.name} has ${list.length} aliases, needs ${ALIAS_MIN} to ${ALIAS_MAX}`);
    if (new Set(list).size !== list.length) throw new Error(`aliases.json: ${icon.name} repeats an alias`);
    if (list.includes(icon.name) || list.includes(spokenName(icon.name))) throw new Error(`aliases.json: ${icon.name} lists its own name`);
    if (list.some((a) => typeof a !== "string" || !a.trim() || a !== a.toLowerCase() || /[<>&"]/.test(a)))
      throw new Error(`aliases.json: ${icon.name} has an empty, uppercase or markup alias`);
    icon.aliases = list;
  }

  // Every icon belongs to exactly one category.
  const categories = JSON.parse(readFileSync(join(SRC, "categories.json"), "utf8"));
  for (const cat of categories) {
    for (const key of ["slug", "title", "heading", "intro", "icons"]) {
      if (!cat[key]) throw new Error(`categories.json: a category is missing "${key}"`);
    }
    for (const name of cat.icons) {
      const icon = byName.get(name);
      if (!icon) throw new Error(`categories.json: ${cat.slug} lists "${name}", which has no SVG`);
      if (icon.category) throw new Error(`categories.json: ${name} is in both ${icon.category.slug} and ${cat.slug}`);
      icon.category = cat;
    }
    cat.members = cat.icons.map((n) => byName.get(n));
  }
  const orphans = icons.filter((i) => !i.category).map((i) => i.name);
  if (orphans.length) throw new Error(`categories.json: no category for ${orphans.join(", ")}`);

  for (const icon of icons) icon.related = relatedTo(icon, icons);

  return { icons, byName, categories, stats };
}

// Related icons score on same category, shared name words and shared aliases, with name order breaking ties.
const RELATED = 8;

function relatedTo(icon, icons) {
  const words = new Set(icon.name.split("-"));
  const terms = new Set(icon.aliases);
  return icons
    .filter((other) => other !== icon)
    .map((other) => {
      let score = other.category === icon.category ? 4 : 0;
      for (const w of other.name.split("-")) if (words.has(w)) score += 3;
      for (const a of other.aliases) if (terms.has(a)) score += 2;
      return { other, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.other.name.localeCompare(b.other.name))
    .slice(0, RELATED)
    .map((r) => r.other);
}

// Mirrors svgText() in page/app.js, and check.mjs confirms the two produce the same bytes.
const trim = (n) => String(Math.round(n * 1000) / 1000);

export function fileText(icon, { weight, corners } = DEFAULTS) {
  const scale = corners === "rounded" ? 1 : 0;
  const lines = icon.geometry.map((tag) => {
    const [, el, body] = tag.match(/^<(\w+)(.*?)\s*\/>$/);
    const attrs = [...body.matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]);
    const get = (k) => attrs.find((a) => a[0] === k)?.[1];
    const drop = (k) => { const i = attrs.findIndex((a) => a[0] === k); if (i >= 0) attrs.splice(i, 1); };

    if (el === "rect") {
      const base = get("style")?.match(/--base-rx:([0-9.]+)/)?.[1];
      drop("style");
      if (get("data-radius") !== undefined) drop("data-radius");
      else if (base !== undefined) attrs.find((a) => a[0] === "rx")[1] = trim(parseFloat(base) * scale);
    }
    const round = get("data-d-round");
    if (round !== undefined) {
      if (corners === "rounded") attrs.find((a) => a[0] === "d")[1] = round;
      drop("data-d-round");
    }
    return `  <${el}${attrs.length ? " " + attrs.map(([k, v]) => `${k}="${v}"`).join(" ") : ""}/>`;
  });

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" ` +
    `width="${EXPORT_SIZE}" height="${EXPORT_SIZE}" fill="none"\n` +
    `     stroke="currentColor" stroke-width="${trim(weight)}" ` +
    `stroke-linecap="round" stroke-linejoin="${corners === "rounded" ? "round" : "miter"}">\n` +
    lines.join("\n") +
    `\n</svg>\n`
  );
}
