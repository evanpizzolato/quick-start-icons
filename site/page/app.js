// Quick Start Icons: one script for the home page, the category pages and the icon pages.
(() => {
  "use strict";

  const EXPORT_SIZE = 24; // an SVG with no intrinsic size renders 300x150 in HTML
  // Sources are authored at weight 2 and rounded, and the page opens at 1.25 and square.
  const DEFAULTS = { weight: 1.25, corners: "square" };

  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  const cards = [...document.querySelectorAll(".card")];
  const search = $("search");
  const weight = $("weight");
  const weightOut = $("weight-out");
  const cornerBtns = [...document.querySelectorAll("[data-corners]")];
  const count = $("count");
  const empty = $("empty");
  const live = $("live");
  const code = $("code");
  const sheet = $("sheet");

  const state = { ...DEFAULTS };

  // Each card is indexed once by its name, the words in its name, and its aliases.
  const index = cards.map((el) => ({
    el,
    name: el.dataset.name,
    haystack: [el.dataset.name, el.dataset.name.split("-").join(" "), el.dataset.terms || ""].join(" "),
  }));

  /* ---------- live preview ---------- */

  // Older Safari lacks CSS rx on a rect, so the attribute is written instead.
  const cssRxWorks = CSS.supports("rx", "1px");
  const scalableRects = cssRxWorks ? [] : [...document.querySelectorAll('.glyph > svg rect:not([data-radius="fixed"])')];

  // The build ships each arc-cornered path squared, with the authored `d` in data-d-round.
  const swappablePaths = [...document.querySelectorAll(".glyph > svg path[data-d-round]")];
  for (const path of swappablePaths) path.dataset.dSquare = path.getAttribute("d");

  const renderCode = () => {
    if (code) code.textContent = svgText(code.dataset.name).trimEnd();
  };

  function applyWeight() {
    root.style.setProperty("--qs-weight", String(state.weight));
    if (weightOut) weightOut.textContent = String(state.weight);
    renderCode();
  }

  function applyCorners() {
    const scale = state.corners === "rounded" ? 1 : 0;
    root.style.setProperty("--qs-radius-scale", String(scale));
    root.style.setProperty("--qs-join", state.corners === "rounded" ? "round" : "miter");
    const key = state.corners === "rounded" ? "dRound" : "dSquare";
    for (const path of swappablePaths) path.setAttribute("d", path.dataset[key]);
    for (const rect of scalableRects) {
      const base = parseFloat(rect.style.getPropertyValue("--base-rx")) || 0;
      rect.setAttribute("rx", String(base * scale));
    }
    for (const btn of cornerBtns) {
      btn.setAttribute("aria-checked", String(btn.dataset.corners === state.corners));
    }
    renderCode();
  }

  /* ---------- serialization: the one definition of the output file ---------- */

  // site/icons.mjs fileText() mirrors this function, and check.mjs compares the two.
  function svgText(name) {
    const source = document.querySelector(`[data-name="${name}"] .glyph > svg`);
    const clone = source.cloneNode(true);
    const scale = state.corners === "rounded" ? 1 : 0;

    for (const rect of clone.querySelectorAll("rect")) {
      const base = parseFloat(rect.style.getPropertyValue("--base-rx"));
      rect.removeAttribute("style"); // --base-rx is a build helper, not output
      if (rect.hasAttribute("data-radius")) {
        rect.removeAttribute("data-radius"); // its rx carries the meaning and stays as authored
        continue;
      }
      if (!Number.isNaN(base)) rect.setAttribute("rx", trim(base * scale));
    }

    // applyCorners already set the live `d`, so only the build helpers come off.
    const geometry = [...clone.children].map((el) => {
      el.removeAttribute("data-d-square");
      el.removeAttribute("data-d-round");
      const attrs = [...el.attributes].map((a) => `${a.name}="${a.value}"`).join(" ");
      return `  <${el.tagName}${attrs ? " " + attrs : ""}/>`;
    });

    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" ` +
      `width="${EXPORT_SIZE}" height="${EXPORT_SIZE}" fill="none"\n` +
      `     stroke="currentColor" stroke-width="${trim(state.weight)}" ` +
      `stroke-linecap="round" stroke-linejoin="${state.corners === "rounded" ? "round" : "miter"}">\n` +
      geometry.join("\n") +
      `\n</svg>\n`
    );
  }

  const trim = (n) => String(Math.round(n * 1000) / 1000);

  /* ---------- copy and download ---------- */

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // file:// and other non-secure contexts have no clipboard API
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;top:-1000px;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    }
  }

  function save(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function flash(btn, label) {
    const slot = btn.querySelector(".btn-label");
    // Keep the resting label once, so a second click inside the window cannot store "Copied" as it.
    if (slot && !btn.dataset.label) btn.dataset.label = slot.textContent;
    btn.classList.add("is-done");
    if (slot) slot.textContent = label;
    clearTimeout(btn._t);
    btn._t = setTimeout(() => {
      btn.classList.remove("is-done");
      if (slot) slot.textContent = btn.dataset.label;
    }, 3000);
  }

  function announce(message) {
    live.textContent = "";
    requestAnimationFrame(() => { live.textContent = message; });
  }

  document.addEventListener("click", async (event) => {
    const btn = event.target.closest("[data-act]");
    if (!btn) return;
    const name = btn.closest("[data-name]").dataset.name;
    const text = svgText(name);

    if (btn.dataset.act === "copy") {
      const ok = await copy(text);
      flash(btn, ok ? "Copied" : "Failed");
      announce(ok ? `Copied ${name}.svg` : `Could not copy ${name}.svg`);
    } else {
      save(new Blob([text], { type: "image/svg+xml" }), `${name}.svg`);
      announce(`Downloaded ${name}.svg`);
    }
  });

  /* ---------- search ---------- */

  function filter() {
    const query = search.value.trim().toLowerCase();
    let shown = 0;
    for (const item of index) {
      const hit = !query || item.haystack.includes(query);
      item.el.hidden = !hit;
      if (hit) shown++;
    }
    count.textContent = query ? `${shown} of ${index.length} icons` : `${index.length} icons`;
    empty.hidden = shown > 0;
    announce(query ? `${shown} icons match ${query}` : `${index.length} icons`);
  }

  if (search) {
    let pending;
    search.addEventListener("input", () => {
      clearTimeout(pending);
      pending = setTimeout(filter, 90);
    });

    $("clear").addEventListener("click", () => {
      search.value = "";
      filter();
      search.focus();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey) return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      // Behind an open modal the search box is inert, so the key is left alone.
      if (sheet?.open) return;
      event.preventDefault();
      search.focus();
      search.select();
    });
  }

  /* ---------- the docs sheet ---------- */

  // The header links go to /#about and friends, and on the home page they open the sheet instead.
  if (sheet) {
    const sheetBody = sheet.querySelector(".sheet-body");
    const REDUCED_MOTION = matchMedia("(prefers-reduced-motion: reduce)");
    const SCROLL_GAP = 24;

    // Not scrollIntoView, which also scrolls the dialog and drags the header off the top.
    const scrollToSection = (target, smooth) => {
      const top = sheetBody.scrollTop + target.getBoundingClientRect().top - sheetBody.getBoundingClientRect().top - SCROLL_GAP;
      sheetBody.scrollTo({ top: Math.max(0, top), behavior: smooth ? "smooth" : "auto" });
    };

    // Jump when the sheet is opening and animate when it is already up.
    const openSheet = (id) => {
      const target = document.getElementById(id);
      if (!target || !sheet.contains(target)) return false;
      const wasOpen = sheet.open;
      if (!wasOpen) sheet.showModal();
      scrollToSection(target, wasOpen && !REDUCED_MOTION.matches);
      return true;
    };

    for (const link of document.querySelectorAll("[data-sheet]")) {
      link.addEventListener("click", (event) => {
        if (openSheet(link.dataset.sheet)) event.preventDefault();
      });
    }

    $("sheet-close").addEventListener("click", () => sheet.close());

    // A click on the dialog element itself lands in its margin, which is outside the sheet.
    sheet.addEventListener("click", (event) => {
      if (event.target === sheet) sheet.close();
    });

    // A link from another page arrives as /#faq, so the sheet opens on that section.
    if (location.hash) openSheet(decodeURIComponent(location.hash.slice(1)));
    sheet.addEventListener("close", () => {
      if (location.hash) history.replaceState(null, "", location.pathname + location.search);
    });
  }

  // The build writes the year, and this corrects it when the page is read in a later year.
  for (const el of document.querySelectorAll("[data-year]")) {
    el.textContent = String(new Date().getFullYear());
  }

  /* ---------- controls ---------- */

  // The 404 page has no controls, so everything below is skipped there.
  if (!weight) return;

  // A range fires input about once per pixel of drag, so writes are coalesced to one per frame.
  let weightFrame = 0;
  weight.addEventListener("input", () => {
    state.weight = parseFloat(weight.value);
    if (weightFrame) return;
    weightFrame = requestAnimationFrame(() => {
      weightFrame = 0;
      applyWeight();
    });
  });

  for (const btn of cornerBtns) {
    btn.addEventListener("click", () => {
      state.corners = btn.dataset.corners;
      applyCorners();
      announce(`Corners ${state.corners}`);
    });
  }

  $("reset").addEventListener("click", () => {
    Object.assign(state, DEFAULTS);
    weight.value = String(DEFAULTS.weight);
    applyWeight();
    applyCorners();
    if (search) {
      search.value = "";
      filter();
    }
    announce("Reset");
  });

  /* ---------- download all ---------- */

  // A store-only zip, written by hand so the page has no dependencies.

  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[i] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function zipStore(entries) {
    const encoder = new TextEncoder();
    const parts = [];
    const central = [];
    let offset = 0;

    for (const entry of entries) {
      const name = encoder.encode(entry.name);
      const data = encoder.encode(entry.text);
      const crc = crc32(data);

      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);   // version needed
      local.setUint16(6, 0, true);    // flags
      local.setUint16(8, 0, true);    // method: stored
      local.setUint16(10, 0, true);   // time
      local.setUint16(12, 0x21, true);// date: 1980-01-01, so builds are stable
      local.setUint32(14, crc, true);
      local.setUint32(18, data.length, true);
      local.setUint32(22, data.length, true);
      local.setUint16(26, name.length, true);
      local.setUint16(28, 0, true);
      parts.push(new Uint8Array(local.buffer), name, data);

      const cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true);
      cd.setUint16(4, 20, true);      // version made by
      cd.setUint16(6, 20, true);      // version needed
      cd.setUint16(8, 0, true);
      cd.setUint16(10, 0, true);
      cd.setUint16(12, 0, true);
      cd.setUint16(14, 0x21, true);
      cd.setUint32(16, crc, true);
      cd.setUint32(20, data.length, true);
      cd.setUint32(24, data.length, true);
      cd.setUint16(28, name.length, true);
      cd.setUint16(30, 0, true);
      cd.setUint16(32, 0, true);
      cd.setUint16(34, 0, true);
      cd.setUint16(36, 0, true);
      cd.setUint32(38, 0, true);
      cd.setUint32(42, offset, true);
      central.push(new Uint8Array(cd.buffer), name);

      offset += 30 + name.length + data.length;
    }

    const cdSize = central.reduce((n, part) => n + part.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(4, 0, true);
    end.setUint16(6, 0, true);
    end.setUint16(8, entries.length, true);
    end.setUint16(10, entries.length, true);
    end.setUint32(12, cdSize, true);
    end.setUint32(16, offset, true);
    end.setUint16(20, 0, true);

    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], {
      type: "application/zip",
    });
  }

  const downloadAll = $("download-all");
  if (downloadAll) {
    downloadAll.addEventListener("click", () => {
      const folder = downloadAll.dataset.zip;
      const entries = index.map((item) => ({ name: `${folder}/${item.name}.svg`, text: svgText(item.name) }));
      save(zipStore(entries), `${folder}.zip`);
      flash(downloadAll, "Downloaded");
      announce(`Downloaded ${entries.length} icons`);
    });
  }

  /* ---------- go ---------- */

  applyWeight();
  applyCorners();
})();
