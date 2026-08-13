# Quick Start icons: authoring spec

The `src/*.svg` files are the source of truth. Figma is generated from them, not the other way round.

## Canvas

| Property | Value |
|---|---|
| viewBox | `0 0 32 32` |
| Live area | 24 x 24, inset 4 on every side, so content spans **4 to 28** |
| Circle keyline | 26 diameter (radius 13, centre 16,16) |
| Square keyline | 24 x 24 |
| Optical overshoot | Circles and diagonals may exceed the square keyline by up to 2, never past 28 |

## Stroke

| Property | Value |
|---|---|
| `fill` | `none` on the root, always |
| `stroke` | `currentColor` |
| `stroke-width` | `2` default. **This is the slider.** Range 1 to 3 |
| `stroke-linecap` | `round` |
| `stroke-linejoin` | `round` |

2 on 32 is a 0.0625 ratio, identical to Slim's 1.5 on 24. Keep this ratio if the box size ever changes.

## Corner radius

`4` default. **This is the second slider.** Range 0 to 8.

Radius is expressed two ways, and every icon must use one of them so the slider can reach it:

1. **`<rect>` elements** carry an `rx`. The site rewrites it.
2. **Path corners** rely on `stroke-linejoin="round"`, plus explicit arc segments where a corner must read as rounded at any weight.

Never bake a corner into a boolean-subtracted outline. That is exactly what broke the old library.

### The base `rx` is per shape, not a flat 4

37 rects across 24 icons carry base radii of 1.5, 2, 3, 4, or 6, picked for the shape's size — 2 on a 10-unit `grid` tile, 6 on the 26x12 `toggle` track. A flat 4 everywhere would make the small rects look like blobs and the large ones look square. The slider scales from each rect's own base value rather than setting an absolute one.

### `stroke-linejoin="round"` alone is not enough at low weights

A round linejoin produces a radius of **half the stroke width**. At the site's
default weight of 1.25 that is 0.625, which reads as sharp. So a corner that must
look rounded needs an explicit arc, and the rule is:

> **If a corner should read as rounded, author the arc.** Do not rely on the
> linejoin to do it. The linejoin is what makes the *square* state possible, not
> what makes the rounded state look rounded.

`warning`, `tag`, `send`, `pencil` and `layers` were all authored without arcs and
looked sharp in both states, which is what prompted this. They now carry fillets:
1.5 on `warning`, `pencil` and `layers`, 1.25 on `send` because its 42 to 51
degree tips blunt badly at 1.5, and 2 on `tag`'s three square corners alongside
the 2.8 already on its two tips.

Pick a radius by the **tangent length**, not by eye: `r / tan(interior / 2)`. It
grows fast as a corner gets acute, and it must stay well under half the shorter
of the two edges. `site/square-path.mjs` enforces the same relation in reverse.

### A path corner authored as an arc is not reachable by CSS

`stroke-linejoin` is a CSS property, so squaring it is free: the site sets
`stroke-linejoin: miter`. **An explicit arc segment is not.** It is baked
geometry, which is why `arrow-return-left` stayed round long after the rect radii
worked.

The site derives the squared alternative at build time
(`site/square-path.mjs`): a circular minor arc that is tangent to the straight
segments on both sides of it is replaced by the vertex where those two tangent
lines meet, at any corner angle. `src/` is never modified, and the round trip is
lossless — squaring a filleted path reproduces its original vertices exactly.

Two consequences for authoring:

- **Start a closed filleted outline at a point on an edge, not at a corner.** A
  corner sitting on the `M`/`Z` seam has no straight segment on one side, so it
  cannot be squared.
- **A stroke that ends on another path's fillet needs its own squared value.**
  `send`'s fold line stops on the tip fillet, so it has no arc to work back from.
  Such a path carries **`data-d-square`** stating its squared geometry outright,
  and the build uses it instead of deriving one. One path uses this so far.

**A path marked `data-corner="fixed"` is skipped**, the direct counterpart of
`data-radius="fixed"` on a rect. It exists because the test for "this arc is a
corner" is geometric, and geometry cannot tell a folder's corner from a person's
shoulder. Seven paths across six icons carry it:

| Icon | Why |
|---|---|
| `user`, `user-add`, `user-minus`, `users` | The shoulder arc flattens into a top hat and the figure stops reading as a person |
| `command` | The four loops are the glyph, not corners |
| `braces` (both paths) | Squaring turns `{ }` into `[ ]`, which is a different symbol, not a restyled one |

When authoring a new icon, the question to ask about every small arc is whether
squaring it would change the *style* or the *meaning*. If it is the meaning, mark
it.

### Two rects the slider must not touch

- **`<ellipse rx>` is not a corner radius.** `database` uses `<ellipse cx="16" cy="8" rx="11" ry="4">`. A regex that rewrites every `rx=` collapses it. Target `rect[rx]` only.
- **A rect marked `data-radius="fixed"` is skipped.** For three icons the radius *is* the meaning: at radius 0, `toggle` stops being a switch and `mic` / `mic-off` stop being a microphone. They carry `data-radius="fixed"` and the slider leaves them alone. `data-radius` is not a presentation attribute, so it lives on the child, not the root.

Everything else is fair game, including the shapes that resolve to circles at radius 8 — `grid` tiles and `stop` both do. That is the intended aesthetic range, but note that `stop` at maximum radius reads as a record button.

## Rules

- **No expanded outlines.** If a shape needs to look filled, that is the `Filled` variant, authored separately as `fill="currentColor"` with no stroke.
- **No `<circle>` for dots.** Use `<path d="M9 16h.01"/>` with a round cap, so dot size tracks the weight slider.
- Coordinates on whole or half units wherever possible. Avoid long decimals.
- One concept per file. `kebab-case.svg` filenames; the Figma component name is the camelCase equivalent.
- Keep the path count low. Fewer, longer paths beat many fragments.

## File template

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none"
     stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <!-- geometry -->
</svg>
```

The site strips the presentation attributes and re-injects them from the slider state, so they must live on the root element, never on individual children.

## Naming

Files use kebab-case. The Figma set name is camelCase. Direction is a suffix, never a digit:
`arrow-down-right.svg` becomes `arrowDownRight`. No `star2`, no `coins2`.
