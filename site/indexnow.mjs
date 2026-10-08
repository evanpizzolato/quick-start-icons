#!/usr/bin/env node
// Submits every URL in dist/sitemap.xml to IndexNow after a deploy: `node site/indexnow.mjs`.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const HOST = "icons.evanpizzolato.com";
const key = readFileSync(join(HERE, "page", "indexnow-key.txt"), "utf8").trim();
const sitemap = readFileSync(join(HERE, "dist", "sitemap.xml"), "utf8");
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

// The key file must be live first, because IndexNow fetches it to confirm the site owner.
const check = await fetch(`https://${HOST}/${key}.txt`);
if (!check.ok || (await check.text()).trim() !== key) throw new Error(`https://${HOST}/${key}.txt is not live yet, so deploy first`);

const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: HOST, key, keyLocation: `https://${HOST}/${key}.txt`, urlList }),
});
console.log(`IndexNow answered ${res.status} ${res.statusText} for ${urlList.length} URLs`);
if (res.status >= 300) {
  console.error(await res.text());
  process.exit(1);
}
