# The Quick Start icons site

Live at **https://icons.evanpizzolato.com**.

## Run it

```bash
node site/build.mjs                       # writes site/dist/
node site/check.mjs                       # checks site/dist/
cd site/dist && python3 -m http.server 8787
```

Then open `http://localhost:8787`.

**Serve it, do not open `dist/index.html` directly.** `file://` is not a secure
context, so `navigator.clipboard` is unavailable there. The page falls back to a
hidden textarea and `execCommand("copy")` so it still works, but the real path is
the one worth testing. The pages also use root paths such as `/styles.css`, which
only resolve when the folder is served.

## What is in here

| Path | What it is |
|---|---|
| `build.mjs` | Writes `dist/` from `src/`. The only build step. No dependencies. |
| `icons.mjs` | Loads the SVGs, `src/aliases.json` and `src/categories.json`, and throws on a gap. Picks the related icons. `fileText()` writes the output file. Shared by `build.mjs`, `check.mjs` and `make-og.mjs`. |
| `check.mjs` | Checks `dist/` after a build. See "Checks" below. |
| `indexnow.mjs` | Sends every sitemap URL to IndexNow after a deploy. |
| `make-og.mjs` | Draws `page/og.png` and `page/og/<name>.png`. Run by hand, needs Chrome. |
| `square-path.mjs` | Derives the squared path for each arc corner. |
| `page/layout.html` | The shell every page shares: head, header, footer. |
| `page/home.html` | The home page body and the docs sheet. |
| `page/icon.html` | The icon page body. |
| `page/category.html` | The category page body. |
| `page/styles.css` | One stylesheet for every page. |
| `page/app.js` | Controls, search, copy, download, the docs sheet, and a store-only zip writer. One script for every page. |
| `page/og.png`, `page/og/` | The social cards, 1 for the site and 170 for the icons. Committed, because the build does not need Chrome. |
| `page/fonts/` | Inter (latin subset) and Paper Mono, variable woff2, each with its OFL 1.1 license. |
| `page/indexnow-key.txt` | The IndexNow key. It is public by design, and the build serves it at `/<key>.txt`. |
| `host/wrangler.jsonc` | The Cloudflare deploy config. No Worker code, no secrets. |
| `dist/` | Generated. Safe to delete. |

The build fails rather than ships when a `{{SLOT}}` is left unfilled, when an icon
has no aliases or no category, or when an icon has no social card.

## What the build writes

| Path | Count | What it is |
|---|---|---|
| `/` | 1 | The home page: all 170 icons, the controls, and the docs sheet. |
| `/icons/<name>/` | 170 | One page per icon. See below. |
| `/icons/<name>.md` | 170 | The same page as markdown, for answer engines. |
| `/svg/<name>.svg` | 170 | The plain file at the site defaults, for Google Images. |
| `/og/<name>.png` | 170 | The social card for each icon page. |
| `/categories/<slug>/` | 12 | One page per category, with an intro paragraph and its icons. |
| `/404.html` | 1 | Served with a 404 status for any unknown URL (`not_found_handling` in `wrangler.jsonc`). |
| `robots.txt`, `sitemap.xml`, `llms.txt`, `llms-full.txt` | 4 | See "Being found". |
| `_headers` | 1 | Cache and content-type rules for Cloudflare. |
| `<key>.txt` | 1 | The IndexNow key file. |

Each icon page has a unique title and description, the icon at 160 px with the same
weight and corner controls, Copy and Download, the SVG code in a `<pre>` that follows
the controls, the jsDelivr URL, the aliases as visible text, 8 related icons, a
breadcrumb, and `WebPage`, `BreadcrumbList` and `ImageObject` JSON-LD. Each card on
the home and category pages links to its icon page. The name is a stretched link, and
Copy and Download sit above it, so they still work.

The related icons are scored in `icons.mjs`: 4 points for the same category, 3 for
each shared word in the name, 2 for each shared alias. Name order breaks ties.

## Deploy

```bash
node site/build.mjs && node site/check.mjs
cd site/host && npx wrangler deploy
cd ../.. && node site/indexnow.mjs
```

`host/wrangler.jsonc` has no `main`. This site has nothing to guard, so Cloudflare
serves the assets straight from the edge with no script bound. `custom_domain` means
Cloudflare owns the DNS record and the certificate, so there is nothing to click in
the dashboard.

Build first. `dist/` is gitignored, so a fresh clone has nothing to upload until
`build.mjs` has run.

`styles.css` and `app.js` are linked with a `?v=` content hash and cached for a year.
The fonts are also cached for a year, so a changed font needs a new file name.

## Being found

`ORIGIN` at the top of `build.mjs` is the one dial for the hostname. It is written
into every canonical link, the Open Graph tags, every JSON-LD `@id`, `robots.txt`,
`sitemap.xml` and the llms files, so moving the site is a one line change.

| File | What it carries |
|---|---|
| `robots.txt` | Allow all, with Bingbot and the retrieval and training crawlers named one by one, plus the sitemap line. Remove a block to shut one out. |
| `sitemap.xml` | 183 URLs: home, 12 categories, 170 icons. Each icon URL carries an `image:image` entry for its `/svg/` file, so this is also the image sitemap. |
| `llms.txt` | The facts, the categories, the FAQ, and every icon as a link to its markdown page with its aliases. |
| `llms-full.txt` | Every icon by category, with its aliases, page URL, CDN URL and SVG code. |

**`lastmod` is real.** For each page it is the newest git commit date among the files
that feed that page: the icon's SVG, `src/aliases.json`, `src/categories.json` and
the templates. A file with uncommitted changes counts as today. Without git, every
page gets today.

Every page links to `llms.txt` from the `<head>`, and each icon page also links to
its markdown copy with `rel="alternate"`. `llms.txt` is a proposal rather than a
standard, and Google has said it does not feed AI Overviews. Treat the llms files as
documentation for machines, not as a ranking signal.

The home page `<head>` carries one JSON-LD `@graph`: `WebSite`, `Person`,
`SoftwareApplication`, an `ItemList` of all 170 icons with their page URLs, a `HowTo`
matching the five steps in the sheet, and a `FAQPage`. Category pages carry a
`CollectionPage` and a `BreadcrumbList`. There is no rating markup, because there are
no ratings.

**The FAQ has one source.** The `FAQ` array in `build.mjs` writes the visible
questions, the `FAQPage` data and the questions in `llms.txt`, so they cannot drift.
Each answer states the fact in its first sentence. Adding a question means editing the
array and nothing else.

**IndexNow** covers Bing, which feeds ChatGPT search and Copilot, plus Yandex and
the other members. `indexnow.mjs` confirms the key file is live, then posts every
sitemap URL to `api.indexnow.org`. No account is needed. Run it after each deploy
that changes pages.

## The docs sheet

The prose lives in a `<dialog>` on the home page, with no dimmed backdrop, so the
page stays the grid. The header links point at `/#about`, `/#faq` and `/#license`.
On the home page `app.js` opens the sheet at that section instead of following the
link. From any other page the link loads the home page, and `app.js` opens the sheet
from the hash. The markup is written into the HTML at build
time and hidden with CSS; nothing fetches or templates it on open, which is what
keeps it readable by anything that reads rather than clicks.

Two things in there are easy to get wrong a second time:

- **`overflow: clip` on `.sheet`, not `hidden`.** An `overflow: hidden` box is still
  scrollable from script, so scrolling a section into view dragged the whole dialog
  up and took the header off screen.
- **`app.js` moves `.sheet-body.scrollTop` by hand rather than calling
  `scrollIntoView`.** That method walks up and scrolls every scrollable ancestor,
  which is the same bug from the other end.

The copyright year is written at build time and corrected by `app.js` on load, so a
page built in December and read in January is still right without a rebuild. Both
places that show it carry `data-year`.

## How the two controls work

**Stroke weight** is one CSS custom property. All 170 sources carry their
presentation attributes on the root and nothing on the children, so
`.glyph svg { stroke-width: var(--qs-weight) }` beats the root attribute and
inherits the whole way down. Moving the slider writes to one element and 170
icons repaint.

**Corners** is a square/rounded toggle rather than a slider, so nothing
interpolates. Square is the default (October 7, 2026), so the build writes the
squared geometry into the page and carries the authored arc as `data-d-round`. It has to reach three different things, because corners in this
library are authored three different ways.

**1. `rect[rx]`** — 41 rects across 32 files. Each rect's authored `rx` is echoed
into a `--base-rx` custom property at build time, and one rule reads it:

```css
.glyph rect:not([data-radius="fixed"]) {
  rx: calc(var(--base-rx) * var(--qs-radius-scale) * 1px);
}
```

That enforces the two rules from `SPEC.md` structurally rather than carefully:
**`<ellipse rx>` is unreachable** because the selector says `rect`, so the
`database` bug cannot recur, and **`data-radius="fixed"` is excluded** by the
`:not()`, so `toggle`, `mic` and `mic-off` keep their meaning.

CSS geometry properties are not universal on older Safari. `app.js` checks
`CSS.supports("rx", "1px")` and falls back to writing the attribute on those 41
rects, which costs nothing measurable.

**2. `stroke-linejoin="round"` on a straight-to-straight join** — 83 icons. Also a
CSS property, so Square sets `stroke-linejoin: miter`. `stroke-linecap` stays
`round` in both modes and is not a dial: 24 dots across 14 icons are authored as
`<path d="M9 16h.01"/>` and only exist because a round cap draws them.

**3. An explicit arc in the path data** — the reason `arrow-return-left` stayed
round after the first two worked. This is baked geometry and no CSS property
reaches it, so `square-path.mjs` derives the squared alternative at build time:
any circular minor arc tangent to the straight segments on both sides of it is
replaced by the vertex where those two tangents meet, at any corner angle. The
build writes the squared result as the live `d` and keeps the authored one as
`data-d-round`; `app.js` swaps `d` on the toggle. 130 arcs across 58 paths.

Two escape hatches, both in `src/` and both listed in `SPEC.md`:

- **`data-corner="fixed"`** skips a path. The test for "this arc is a corner" is
  geometric, and geometry cannot tell a folder's corner from a person's shoulder.
  Seven paths across six icons carry it.
- **`data-d-square="..."`** states a path's squared geometry outright, for the
  case derivation cannot reach: a stroke that stops on a fillet belonging to
  another path has no arc of its own to work back from. `send`'s fold line and
  `exposure`'s diagonal carry it.

A round linejoin only gives a radius of half the stroke width, so at the 1.25
default a corner with no arc reads as sharp in **both** states. Five icons
(`warning`, `tag`, `send`, `pencil`, `layers`) were re-authored with real fillets
for this reason. `SPEC.md` has the rule and how to pick a radius.

## The output file

`svgText()` in `app.js` is the single definition of what a Quick Start icon file
looks like. Copy, per-icon download and download-all all go through it. It
clones the live node, writes the current weight, sets `rx` on the scaled rects,
strips `data-radius` and the `--base-rx` helper, adds `width`/`height`, and
pretty-prints to the same shape as the files in `src/`.

`width` and `height` are set to 24 because an SVG with no intrinsic size renders
at 300x150 when pasted into HTML. `EXPORT_SIZE` at the top of `app.js` is the dial,
and `icons.mjs` has the same constant.

`fileText()` in `icons.mjs` is the build-time copy of `svgText()`. It writes the
`/svg/` files, the code block on each icon page, the markdown pages and
`llms-full.txt`. On load, `app.js` rewrites the icon page's code block with
`svgText()`, so a browser check can compare the two directly.

## Checks

`node site/check.mjs` runs after every build and exits non-zero on a failure. It
checks:

- Every page has exactly one `h1`.
- Every title, description and canonical is unique and correct.
- Every JSON-LD block parses. `WebPage`, `CollectionPage` and `ImageObject` names
  equal the `h1`, and their descriptions equal the visible deck. The `ImageObject`
  keywords equal the visible aliases. `BreadcrumbList` names equal the visible
  breadcrumb. The `CollectionPage` items equal the cards. The `FAQPage` answers equal
  the visible answers.
- Every internal link and asset in every page resolves to a file, and every `#id`
  exists on its target page. The same goes for every URL in `sitemap.xml`, the llms
  files and the markdown pages.
- Each `/svg/` file equals `fileText()` at the defaults. At Rounded and weight 2 the
  output, minus `width` and `height`, is `src/` byte for byte apart from the
  authoring attributes (`data-corner`, `data-radius`, `data-d-square`).
- Each icon page's code block equals its `/svg/` file.

## Verified, not assumed

Checked against the running page rather than reasoned about:

- Weight 1 through 3 propagates to all 170 icons; the readout tracks it.
- Squaring corners takes `grid`'s tiles from `rx="2"` to `rx="0"`, leaves
  `database`'s `<ellipse rx="11">` alone, and leaves `toggle`'s fixed rect at
  `rx="6"`.
- `arrow-return-left`'s arc bend becomes `M27 6L27 21L6 21` at Square, and
  `trash`'s lid handle becomes `M12 9L12 4L20 4L20 9`.
- Squaring a filleted outline reproduces its **original vertices exactly**:
  `warning` returns `M22 16L16 5L4 27L28 27Z`, `layers` returns
  `M9.5 6.25L16 3L29 9.5L16 16L3 9.5Z`.
- The round to square and back swap is **lossless**: the authored path returns
  byte for byte.
- Every one of the 170 sources still conforms to `SPEC.md` after the five were
  re-authored: identical roots, no child-level `stroke`, `fill` or `style`.
- No failing network requests, favicon included.
- The `data-corner="fixed"` icons hold their shape at Square. Whole set checked
  by eye at Square, weight 2.
- Copied SVG bakes the current state and otherwise matches `src/` byte for byte,
  including the `h.01` dot paths. No build helper (`data-d-square`,
  `data-corner`, `--base-rx`) leaks into the output.
- Download all produces a 170-entry archive that passes Python's
  `zipfile.testzip()`, every file parses as XML, and state is baked into all of
  them.
- No console errors.
- The JSON-LD parses, and all 9 schema answers are byte-identical to the 9 answers
  rendered in the sheet. (October 7, 2026: there are now 11, and `check.mjs` compares
  them on every build.)
- One `h1`, and the heading order below it does not skip a level.
- `robots.txt`, `sitemap.xml` and `llms.txt` all return 200.
- The sheet opens with its header in place, closes on Escape, on the close button
  and on a click outside it, and does not close on a click inside it.
- Opening the sheet does not scroll the dialog itself: `sheet.scrollTop` stays 0
  while `.sheet-body.scrollTop` moves.
- No horizontal overflow at 390: `documentElement.scrollWidth` equals `innerWidth`,
  the stacked spec table included.
- Search, the weight slider, the corner toggle and Reset all still behave after the
  sheet was added. Search is debounced 90ms, so a synchronous assertion after
  dispatching `input` reads the old state and is not a bug.

### October 7, 2026: pages, aliases and categories

Checked in headless Chrome against a local build of all 184 pages:

- Copy on the home page, clicked for all 170 cards, puts the same bytes on the
  clipboard as the matching `/svg/` file.
- On all 170 icon pages, the code block that `app.js` writes equals the `/svg/` file.
  After Rounded and weight 2, it equals `src/` byte for byte, apart from `width`,
  `height` and the authoring attributes.
- Searching "notification" finds `bell` and `bell-off` through the aliases.
- A link to `/#faq` from an icon page opens the sheet on the home page.
- No horizontal overflow at 390 px on the home page, two category pages, three icon
  pages (the longest names included), the 404 page, and the open sheet.
- No console errors on any of those pages.
- Lighthouse (mobile, local server without compression): accessibility, best
  practices and SEO score 100 on the home, icon and category pages. Performance is
  100 on icon and category pages and 96 on the home page, where LCP is 2.6 s. The
  404 page scores 66 for SEO because it is `noindex` on purpose. Fixed on the way:
  the footer copyright contrast (1.71:1, now `--text-muted`), the logo's accessible
  name, the icon page Copy button's accessible name, and the `information` card's
  link text, which Lighthouse read as generic. Every card and tile link now ends in a
  hidden " icon".

## Not built yet

URL state (sharing a link with the weight and corners set), and a Filled variant.

Done on October 7, 2026, and kept here as a record: alias metadata, categories, a
page per icon (which replaced the planned detail panel), and a self-hosted Inter.
Inter is now the latin subset of the variable font, served from `page/fonts/`
beside Paper Mono, so the pages make no third-party request. The type still follows
docs.typesafe.ai: Inter for text and headings, Paper Mono for the controls and code.

`styles.css` is the one render-blocking request, and Lighthouse estimates 150 ms of
savings from inlining it. It stays a separate file, because it is shared and cached
across 184 pages.
