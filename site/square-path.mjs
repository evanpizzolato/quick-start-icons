/**
 * Derive a squared path from an authored rounded one.
 *
 * `SPEC.md` says corner radius is expressed two ways: a `rect`'s `rx`, and path
 * corners that rely on `stroke-linejoin="round"` "plus explicit arc segments
 * where a corner must read as rounded at any weight". The first two are CSS
 * properties, so the Square toggle reaches them for free. The third is baked
 * geometry, and no CSS property can touch it. 52 icons carry one.
 *
 * This replaces each of those arcs with the vertex where its two tangent lines
 * meet, which is what the corner would have been had it never been rounded.
 * It runs at build time. `src/` is never modified.
 *
 * The test for "this arc is a corner" is: equal radii, and an endpoint displaced
 * by exactly the radius on both axes (a quarter turn), between two axis-aligned
 * straight segments that meet at a right angle. That is a geometric test, and
 * geometry cannot tell a folder's corner from a person's shoulder. Six icons
 * pass the test but are not corners, so their paths carry `data-corner="fixed"`
 * in `src/` and are skipped, mirroring the existing `data-radius="fixed"`.
 */

const ARGC = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

function tokenize(d) {
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [];
  const segs = [];
  let cmd = null;
  let i = 0;
  while (i < tokens.length) {
    if (/[a-z]/i.test(tokens[i])) cmd = tokens[i++];
    if (!cmd) break;
    const n = ARGC[cmd.toUpperCase()];
    if (n === 0) {
      segs.push({ cmd, args: [] });
      continue;
    }
    const args = tokens.slice(i, i + n).map(Number);
    if (args.length < n) break;
    i += n;
    segs.push({ cmd, args });
    // a repeated moveto is a lineto, per the path grammar
    if (cmd === "M") cmd = "L";
    else if (cmd === "m") cmd = "l";
  }
  return segs;
}

/** Flatten to absolute segments carrying explicit start and end points. */
function absolutize(segs) {
  const out = [];
  let cx = 0, cy = 0, sx = 0, sy = 0;
  for (const { cmd, args } of segs) {
    const rel = cmd !== cmd.toUpperCase();
    const up = cmd.toUpperCase();
    const start = [cx, cy];
    if (up === "M") {
      const x = rel ? cx + args[0] : args[0];
      const y = rel ? cy + args[1] : args[1];
      out.push({ type: "M", start, end: [x, y] });
      cx = x; cy = y; sx = x; sy = y;
    } else if (up === "L") {
      const x = rel ? cx + args[0] : args[0];
      const y = rel ? cy + args[1] : args[1];
      out.push({ type: "L", start, end: [x, y] });
      cx = x; cy = y;
    } else if (up === "H") {
      const x = rel ? cx + args[0] : args[0];
      out.push({ type: "L", start, end: [x, cy] });
      cx = x;
    } else if (up === "V") {
      const y = rel ? cy + args[0] : args[0];
      out.push({ type: "L", start, end: [cx, y] });
      cy = y;
    } else if (up === "A") {
      const x = rel ? cx + args[5] : args[5];
      const y = rel ? cy + args[6] : args[6];
      out.push({ type: "A", rx: args[0], ry: args[1], rot: args[2], laf: args[3], sf: args[4], start, end: [x, y] });
      cx = x; cy = y;
    } else if (up === "C") {
      const p = rel
        ? [cx + args[0], cy + args[1], cx + args[2], cy + args[3], cx + args[4], cy + args[5]]
        : args.slice();
      out.push({ type: "C", ctrl: p.slice(0, 4), start, end: [p[4], p[5]] });
      cx = p[4]; cy = p[5];
    } else if (up === "Z") {
      out.push({ type: "Z", start, end: [sx, sy] });
      cx = sx; cy = sy;
    } else {
      // Q, S, T are not used anywhere in src/. Bail rather than guess.
      return null;
    }
  }
  return out;
}

const near = (a, b, tolerance = 0.16) => Math.abs(a - b) < tolerance;

function direction(from, to) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  return length < 1e-6 ? null : [dx / length, dy / length];
}

const round3 = (n) => String(Math.round(n * 1000) / 1000);

/* A reconstructed vertex lands a hair off its authored coordinate, because the
   tangent points it was derived from are rounded to 2 decimals in src/. Snap
   back to the nearest half unit, which is what SPEC.md asks coordinates to sit
   on, so `4.988` reads as `5` in copied output. */
const snapHalf = (n) => {
  const half = Math.round(n * 2) / 2;
  return Math.abs(n - half) < 0.06 ? half : n;
};

/** Direction of the first drawing segment of the subpath containing index `i`. */
function firstDirectionOfSubpath(segs, i) {
  let start = i;
  while (start > 0 && segs[start].type !== "M") start--;
  const first = segs[start + 1];
  return first ? direction(first.start, first.end) : null;
}

/** Where the line through `a` along `da` meets the line through `b` along `db`. */
function intersect(a, da, b, db) {
  const denom = da[0] * db[1] - da[1] * db[0];
  if (Math.abs(denom) < 1e-9) return null; // parallel, so no vertex
  const t = ((b[0] - a[0]) * db[1] - (b[1] - a[1]) * db[0]) / denom;
  return [a[0] + da[0] * t, a[1] + da[1] * t];
}

/**
 * @returns {{ d: string, squared: number, skipped: number } | null}
 *   null when the path has no squareable corner, so the caller can leave the
 *   element untouched rather than emit a second copy of identical geometry.
 */
export function squarePath(d) {
  const segs = absolutize(tokenize(d));
  if (!segs) return null;

  const dropped = new Set();
  let squared = 0;
  let skipped = 0;

  for (let i = 0; i < segs.length; i++) {
    const arc = segs[i];
    if (arc.type !== "A") continue;

    const r = arc.rx;
    // A fillet is a circular minor arc. Anything else is part of the drawing.
    if (!near(arc.rx, arc.ry, 0.01) || arc.laf === 1) { skipped++; continue; }

    const before = segs[i - 1];
    const after = segs[i + 1];
    const incoming = before && before.type === "L" ? direction(before.start, before.end) : null;

    /* Z is a straight segment back to the subpath start, so an arc on the seam
       of a closed outline is still a fillet with a line on both sides. When the
       arc lands exactly on that start the Z has no length and no direction of
       its own, and the corner continues into whatever follows the M instead. */
    let outgoing = null;
    if (after && after.type === "L") {
      outgoing = direction(after.start, after.end);
    } else if (after && after.type === "Z") {
      outgoing = direction(after.start, after.end) ?? firstDirectionOfSubpath(segs, i);
    }
    if (!incoming || !outgoing) { skipped++; continue; }

    const vertex = intersect(arc.start, incoming, arc.end, outgoing);
    if (!vertex) { skipped++; continue; }

    // The vertex has to lie ahead of the arc's start and behind its end,
    // otherwise the arc curves away from the corner rather than cutting it.
    const toVertex = [vertex[0] - arc.start[0], vertex[1] - arc.start[1]];
    const fromVertex = [arc.end[0] - vertex[0], arc.end[1] - vertex[1]];
    if (toVertex[0] * incoming[0] + toVertex[1] * incoming[1] <= 0) { skipped++; continue; }
    if (fromVertex[0] * outgoing[0] + fromVertex[1] * outgoing[1] <= 0) { skipped++; continue; }

    // Tangency: a fillet touches both edges at equal distance from the vertex,
    // and that distance is r / tan(half the interior angle). Checking the
    // implied radius against the authored one is what keeps decorative arcs out.
    const dIn = Math.hypot(toVertex[0], toVertex[1]);
    const dOut = Math.hypot(fromVertex[0], fromVertex[1]);
    if (!near(dIn, dOut, 0.05)) { skipped++; continue; }
    const cos = -(incoming[0] * outgoing[0] + incoming[1] * outgoing[1]);
    const interior = Math.acos(Math.max(-1, Math.min(1, cos)));
    if (!near(dIn * Math.tan(interior / 2), r, 0.05)) { skipped++; continue; }

    // Re-point both neighbours at the vertex and drop the arc.
    const snapped = [snapHalf(vertex[0]), snapHalf(vertex[1])];
    before.end = snapped;
    after.start = snapped;
    dropped.add(i);
    squared++;
  }

  if (squared === 0) return null;

  let out = "";
  segs.forEach((s, i) => {
    if (dropped.has(i)) return;
    if (s.type === "M") out += `M${round3(s.end[0])} ${round3(s.end[1])}`;
    else if (s.type === "L") out += `L${round3(s.end[0])} ${round3(s.end[1])}`;
    else if (s.type === "A")
      out += `A${round3(s.rx)} ${round3(s.ry)} ${s.rot} ${s.laf} ${s.sf} ${round3(s.end[0])} ${round3(s.end[1])}`;
    else if (s.type === "C") out += `C${s.ctrl.map(round3).join(" ")} ${round3(s.end[0])} ${round3(s.end[1])}`;
    else if (s.type === "Z") out += "Z";
  });

  return { d: out, squared, skipped };
}
