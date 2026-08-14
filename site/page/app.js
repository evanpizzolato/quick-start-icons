/* Quick Start Icons
   ------------------------------------------------------------------
   State is four values: weight, corners, query, and nothing else. The live
   preview is two CSS custom properties, so moving the weight slider writes to
   one element and 170 icons repaint. The only place the SVG is rebuilt as text
   is copy and download, and there is exactly one function that does it, so
   there is exactly one definition of what a Quick Start icon file looks like.
   ------------------------------------------------------------------ */
(() => {
  "use strict";

  const EXPORT_SIZE = 24; // an SVG with no intrinsic size renders 300x150 in HTML
  /* The sources are authored at stroke-width 2, per SPEC.md. The site opens at
     1.25 because that is the weight the set looks best at on screen. Reset
     returns here, not to 2. */
  const DEFAULTS = { weight: 1.25, corners: "rounded" };

  const root = document.documentElement;
  const grid = document.getElementById("grid");
  const cards = [...grid.querySelectorAll(".card")];
  const search = document.getElementById("search");
  const weight = document.getElementById("weight");
  const weightOut = document.getElementById("weight-out");
  const cornerBtns = [...document.querySelectorAll("[data-corners]")];
  const count = document.getElementById("count");
  const empty = document.getElementById("empty");
  const live = document.getElementById("live");

  const state = { ...DEFAULTS };

  /* Every card indexed once: name plus its hyphen-split words, so "pull" finds
     git-pull-request without any alias metadata existing yet. */
  const index = cards.map((el) => ({
    el,
    name: el.dataset.name,
    haystack: el.dataset.name + " " + el.dataset.name.split("-").join(" "),
  }));

  /* ---------- live preview ---------- */

  /* CSS geometry properties (rx on a rect) are not universal on older Safari.
     Where they are missing, write the attribute instead: 41 rects across 32
     files, so the fallback costs nothing measurable. */
  const cssRxWorks = CSS.supports("rx", "1px");
  const scalableRects = cssRxWorks
    ? []
    : [...grid.querySelectorAll('.glyph > svg rect:not([data-radius="fixed"])')];

  /* Path corners authored as quarter-turn arcs cannot be reached by CSS, so the
     build carried a derived squared `d` on each affected path. Stash the
     authored one on first use rather than shipping both copies in the HTML. */
  const swappablePaths = [...grid.querySelectorAll(".glyph > svg path[data-d-square]")];
  for (const path of swappablePaths) path.dataset.dRound = path.getAttribute("d");

  function applyWeight() {
    root.style.setProperty("--qs-weight", String(state.weight));
    weightOut.textContent = String(state.weight);
  }

  function applyCorners() {
    const scale = state.corners === "rounded" ? 1 : 0;
    root.style.setProperty("--qs-radius-scale", String(scale));
    root.style.setProperty("--qs-join", state.corners === "rounded" ? "round" : "miter");
    const key = state.corners === "rounded" ? "dRound" : "dSquare";
    for (const path of swappablePaths) path.setAttribute("d", path.dataset[key]);
    if (!cssRxWorks) {
      for (const rect of scalableRects) {
        const base = parseFloat(rect.style.getPropertyValue("--base-rx")) || 0;
        rect.setAttribute("rx", String(base * scale));
      }
    }
    for (const btn of cornerBtns) {
      btn.setAttribute("aria-checked", String(btn.dataset.corners === state.corners));
    }
  }

  /* ---------- serialization: the one definition of the output file ---------- */

  function svgText(name) {
    /* Child combinator: the download button's own chrome icon is also an svg
       inside .glyph, and only document order kept this from picking it. */
    const source = grid.querySelector(`.card[data-name="${name}"] .glyph > svg`);
    const clone = source.cloneNode(true);
    const scale = state.corners === "rounded" ? 1 : 0;

    for (const rect of clone.querySelectorAll("rect")) {
      const base = parseFloat(rect.style.getPropertyValue("--base-rx"));
      rect.removeAttribute("style"); // --base-rx is a build helper, not output
      if (rect.hasAttribute("data-radius")) {
        rect.removeAttribute("data-radius"); // authoring metadata, stays in the repo
        continue; // and its rx is deliberately untouched
      }
      if (!Number.isNaN(base)) rect.setAttribute("rx", trim(base * scale));
    }

    /* The live `d` is already the right one, since applyCorners swapped it.
       Drop the build helpers so the file matches src/ apart from the geometry
       the controls actually changed. */
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
    const previous = slot ? slot.textContent : null;
    btn.classList.add("is-done");
    if (slot) slot.textContent = label;
    clearTimeout(btn._t);
    btn._t = setTimeout(() => {
      btn.classList.remove("is-done");
      if (slot) slot.textContent = previous;
    }, 2000);
  }

  function announce(message) {
    live.textContent = "";
    requestAnimationFrame(() => { live.textContent = message; });
  }

  grid.addEventListener("click", async (event) => {
    const btn = event.target.closest("[data-act]");
    if (!btn) return;
    const name = btn.closest(".card").dataset.name;
    const text = svgText(name);

    if (btn.dataset.act === "copy") {
      const ok = await copy(text);
      flash(btn, ok ? "Copied!" : "Failed");
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
    count.textContent = query
      ? `${shown} of ${index.length} icons`
      : `${index.length} icons`;
    empty.hidden = shown > 0;
    announce(query ? `${shown} icons match ${query}` : `${index.length} icons`);
  }

  let pending;
  search.addEventListener("input", () => {
    clearTimeout(pending);
    pending = setTimeout(filter, 90);
  });

  document.getElementById("clear").addEventListener("click", () => {
    search.value = "";
    filter();
    search.focus();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "/" || event.metaKey || event.ctrlKey) return;
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    /* Behind an open modal the search box is inert, so focusing it would fail
       while preventDefault still ate the key. Leave the key alone. */
    if (document.getElementById("sheet").open) return;
    event.preventDefault();
    search.focus();
    search.select();
  });

  /* ---------- the docs sheet ----------
     The markup is already in the page from build time. Nothing here fetches or
     renders it; the dialog only decides whether it is on screen. showModal, not
     show, for the focus trap and Escape. Its backdrop is transparent in CSS. */

  const sheet = document.getElementById("sheet");
  const sheetBody = sheet.querySelector(".sheet-body");
  /* Scroll behaviour is set per call, not in CSS, so check the query here. */
  const REDUCED_MOTION = matchMedia("(prefers-reduced-motion: reduce)");

  /* Not scrollIntoView: it scrolls every scrollable ancestor, and the dialog
     counts as one, which dragged the header off the top. Move one box by hand. */
  const SCROLL_GAP = 24;

  const scrollToSection = (target, smooth) => {
    const top =
      sheetBody.scrollTop +
      target.getBoundingClientRect().top -
      sheetBody.getBoundingClientRect().top -
      SCROLL_GAP;
    sheetBody.scrollTo({ top: Math.max(0, top), behavior: smooth ? "smooth" : "auto" });
  };

  const openSheet = (id) => {
    /* Jump when the sheet is opening, animate when it is already up. Smooth
       scrolling in a box that just appeared reads as a glitch. */
    const wasOpen = sheet.open;
    if (!wasOpen) sheet.showModal();
    const target = document.getElementById(id);
    if (target) scrollToSection(target, wasOpen && !REDUCED_MOTION.matches);
  };

  for (const btn of document.querySelectorAll("[data-sheet]")) {
    btn.addEventListener("click", () => openSheet(btn.dataset.sheet));
  }

  document.getElementById("sheet-close").addEventListener("click", () => sheet.close());

  /* Every child fills the dialog, so a click on the element itself is a click
     outside. That is what the margin around the sheet is for. */
  sheet.addEventListener("click", (event) => {
    if (event.target === sheet) sheet.close();
  });

  /* ---------- the year ----------
     Build time writes it so it is right without script. This corrects it when
     the page is read in a later year. Two spots: footer and licence. */

  for (const el of document.querySelectorAll("[data-year]")) {
    el.textContent = String(new Date().getFullYear());
  }

  /* ---------- controls ---------- */

  /* A range fires input roughly per pixel of drag, and every one of those wrote
     --qs-weight on :root, which repaints 651 SVG children. Coalesce to one
     write per frame. The search box next to it was already debounced; this was
     the control that was not. */
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

  document.getElementById("reset").addEventListener("click", () => {
    Object.assign(state, DEFAULTS);
    weight.value = String(DEFAULTS.weight);
    search.value = "";
    applyWeight();
    applyCorners();
    filter();
    announce("Reset");
  });

  /* ---------- download all ----------
     A store-only zip, written by hand so the page has no dependencies. No
     compression, so roughly 60 KB rather than 15, which nobody will notice. */

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

  document.getElementById("download-all").addEventListener("click", (event) => {
    const entries = index.map((item) => ({
      name: `quick-start-icons/${item.name}.svg`,
      text: svgText(item.name),
    }));
    save(zipStore(entries), "quick-start-icons.zip");
    flash(event.currentTarget, "Downloaded");
    announce(`Downloaded ${entries.length} icons`);
  });

  /* ---------- go ---------- */

  applyWeight();
  applyCorners();
})();
