# Visual scene contract (v1)

Source of truth: `src/lib/scene/schema.ts` (zod). This page explains intent; the schema wins on details.

## Principles

1. **Data, never code.** Scenes are JSON validated before rendering. No HTML, JS, SVG paths, CSS or URLs from engines or models.
2. **Stable ids animate.** An element/cell/chip/row/pointer with the same `id` in consecutive steps is "the same thing": the renderer animates movement (FLIP) and tone changes. New ids fade in.
3. **Semantic tones, not colours.** `default | muted | active | compare | success | warning`; the renderer maps them for light/dark themes.
4. **Fidelity is explicit.** `verified` (engine-computed) or `illustrative` (sketch). The lesson and all its scenes must agree.
5. **Grow on demand.** Add a primitive only when a real concept needs it, with tests.

## Shape

```ts
Scene = {
  version: 1,
  fidelity: "verified" | "illustrative",
  layout: "row" | "column",          // top-level flow
  elements: SceneElement[],          // 1–16
  arrows: { id, from, to, label?, tone }[],  // ids of any element/cell/row/chip
  focus: string[],                   // ids the tutor is talking about (≤4); the canvas circles
                                     // focus[0] and draws its note's arrow to it
  caption?: string,
}
SceneElement =
  | { type: "array", id, title?, cells: {id, value, tone}[], pointers: {id, label, index, tone}[], showIndices }
  | { type: "table", id, title?, columns: string[], rows: {id, cells: (string|number|null)[], tone}[], emptyText? }
  | { type: "container", id, title, subtitle?, tone, chips: {id, label, tone}[] }   // partitions, buckets, workers
  | { type: "box", id, label, detail?, tone }
  | { type: "text", id, text, tone }
  | { type: "group", id, title?, direction, children: <non-group element>[] }    // one nesting level
```

Invariants enforced by the schema: focus ids exist; ids unique across the whole scene and limited to `[A-Za-z0-9_\-:.]`; arrows reference existing ids; pointer index within the array; table rows match column count; size limits on every list and string.

## Renderer contract (`SceneRenderer`)

- Lays out elements with CSS flex/grid; arrows are an SVG overlay measured from rendered element boxes (`data-scene-id`). Stacked boxes connect top→bottom, side-by-side boxes left→right; multiple arrows per element are spread out; labels are dropped on very short arrows.
- FLIP animation for `data-flip` nodes (chips, pointers, rows, boxes); disabled under `prefers-reduced-motion`.
- Measures before animating (running transforms distort `getBoundingClientRect`), and divides by the canvas zoom so geometry is in unzoomed board units.
- Circles `focus[0]` with a hand-drawn ring and reports its rectangle to the canvas for the teacher's arrow.
- Provides an `aria-live` text summary of pointers/status for screen readers.

## Used by

| Concept | Primitives |
|---|---|
| Binary search | `array` + pointers `low/high/mid`, `text` status |
| SQL JOIN | `group(row)` of two `table`s, result `table`, row→row `arrows` |
| Spark shuffle | `group`s of `container`s (map/reduce tasks) with movable `chip`s, container→container `arrows` |
| Whiteboard | `group(row)` of `box`es + `arrows` |
