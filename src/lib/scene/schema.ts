import { z } from "zod";

/**
 * Visual Scene Contract — version 1.
 *
 * A scene is pure, declarative data. Renderers interpret it; nothing in a scene
 * is ever executed. Every element has a stable `id` so the renderer can animate
 * the same element between steps (FLIP-style movement, colour transitions).
 *
 * Add primitives only when a real concept needs them (see docs/visual-scene-contract.md).
 */

export const SCENE_VERSION = 1 as const;

/** Semantic emphasis. Renderers map these to colours; scenes never carry raw CSS. */
export const ToneSchema = z.enum([
  "default",
  "muted", // eliminated / out of scope
  "active", // currently being looked at
  "compare", // involved in a comparison
  "success", // match / found / output
  "warning", // mismatch / in-flight
]);
export type Tone = z.infer<typeof ToneSchema>;

const Id = z.string().min(1).max(64).regex(/^[A-Za-z0-9_\-:.]+$/);
const Label = z.string().max(200);

export const ArrayCellSchema = z.object({
  id: Id,
  value: z.union([z.string().max(40), z.number()]),
  tone: ToneSchema.default("default"),
});

export const PointerSchema = z.object({
  id: Id,
  label: z.string().min(1).max(12),
  index: z.number().int().min(0),
  tone: ToneSchema.default("active"),
});

export const ArrayElementSchema = z.object({
  type: z.literal("array"),
  id: Id,
  title: Label.optional(),
  cells: z.array(ArrayCellSchema).max(64),
  pointers: z.array(PointerSchema).max(6).default([]),
  showIndices: z.boolean().default(true),
});

export const TableRowSchema = z.object({
  id: Id,
  cells: z.array(z.union([z.string().max(80), z.number(), z.null()])).max(12),
  tone: ToneSchema.default("default"),
});

export const TableElementSchema = z.object({
  type: z.literal("table"),
  id: Id,
  title: Label.optional(),
  columns: z.array(z.string().min(1).max(40)).min(1).max(12),
  rows: z.array(TableRowSchema).max(50),
  emptyText: Label.optional(),
});

export const ChipSchema = z.object({
  id: Id,
  label: z.string().min(1).max(40),
  tone: ToneSchema.default("default"),
});

/** A titled container of small movable chips — partitions, buckets, workers, queues. */
export const ContainerElementSchema = z.object({
  type: z.literal("container"),
  id: Id,
  title: Label,
  subtitle: Label.optional(),
  tone: ToneSchema.default("default"),
  chips: z.array(ChipSchema).max(40),
});

export const BoxElementSchema = z.object({
  type: z.literal("box"),
  id: Id,
  label: Label,
  detail: Label.optional(),
  tone: ToneSchema.default("default"),
});

export const TextElementSchema = z.object({
  type: z.literal("text"),
  id: Id,
  text: z.string().max(400),
  tone: ToneSchema.default("default"),
});

export const LeafElementSchema = z.discriminatedUnion("type", [
  ArrayElementSchema,
  TableElementSchema,
  ContainerElementSchema,
  BoxElementSchema,
  TextElementSchema,
]);
export type LeafElement = z.infer<typeof LeafElementSchema>;
export type LeafElementInput = z.input<typeof LeafElementSchema>;

/** Groups lay their children out in a row or column. One level of nesting only. */
export const GroupElementSchema = z.object({
  type: z.literal("group"),
  id: Id,
  title: Label.optional(),
  direction: z.enum(["row", "column"]).default("row"),
  children: z.array(LeafElementSchema).max(12),
});

export const SceneElementSchema = z.discriminatedUnion("type", [
  ArrayElementSchema,
  TableElementSchema,
  ContainerElementSchema,
  BoxElementSchema,
  TextElementSchema,
  GroupElementSchema,
]);
export type SceneElement = z.infer<typeof SceneElementSchema>;
export type SceneElementInput = z.input<typeof SceneElementSchema>;

/** Connection between any two element / chip / cell / row ids in the scene. */
export const ArrowSchema = z.object({
  id: Id,
  from: Id,
  to: Id,
  label: z.string().max(40).optional(),
  tone: ToneSchema.default("active"),
});

export const SceneSchema = z
  .object({
    version: z.literal(SCENE_VERSION),
    /** verified = produced by a deterministic engine; illustrative = a sketch, not a simulation. */
    fidelity: z.enum(["verified", "illustrative"]),
    layout: z.enum(["row", "column"]).default("column"),
    elements: z.array(SceneElementSchema).min(1).max(16),
    arrows: z.array(ArrowSchema).max(40).default([]),
    /** Ids the tutor is talking about on this step; the canvas points its note at the first one. */
    focus: z.array(Id).max(4).default([]),
    caption: Label.optional(),
  })
  .superRefine((scene, ctx) => {
    const ids = collectIds(scene.elements);
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) ctx.addIssue({ code: "custom", message: `Duplicate scene id "${id}"` });
      seen.add(id);
    }
    for (const a of scene.arrows) {
      if (!seen.has(a.from)) ctx.addIssue({ code: "custom", message: `Arrow ${a.id}: unknown from "${a.from}"` });
      if (!seen.has(a.to)) ctx.addIssue({ code: "custom", message: `Arrow ${a.id}: unknown to "${a.to}"` });
    }
    for (const f of scene.focus) {
      if (!seen.has(f)) ctx.addIssue({ code: "custom", message: `Unknown focus id "${f}"` });
    }
    for (const el of flatten(scene.elements)) {
      if (el.type === "array") {
        for (const p of el.pointers) {
          if (p.index >= el.cells.length)
            ctx.addIssue({ code: "custom", message: `Pointer ${p.id} index ${p.index} out of range` });
        }
      }
      if (el.type === "table") {
        for (const r of el.rows) {
          if (r.cells.length !== el.columns.length)
            ctx.addIssue({ code: "custom", message: `Row ${r.id} has ${r.cells.length} cells, expected ${el.columns.length}` });
        }
      }
    }
  });

export type Scene = z.infer<typeof SceneSchema>;
export type SceneInput = z.input<typeof SceneSchema>;

function flatten(elements: SceneElement[]): LeafElement[] {
  return elements.flatMap((e) => (e.type === "group" ? e.children : [e]));
}

export function collectIds(elements: SceneElement[]): string[] {
  const ids: string[] = [];
  for (const e of elements) {
    ids.push(e.id);
    const leaves = e.type === "group" ? e.children : [e];
    for (const leaf of leaves) {
      if (leaf !== e) ids.push(leaf.id);
      if (leaf.type === "array") {
        ids.push(...leaf.cells.map((c) => c.id), ...leaf.pointers.map((p) => p.id));
      } else if (leaf.type === "table") {
        ids.push(...leaf.rows.map((r) => r.id));
      } else if (leaf.type === "container") {
        ids.push(...leaf.chips.map((c) => c.id));
      }
    }
  }
  return ids;
}

/** Parse untrusted scene data. Throws a ZodError on invalid input. */
export function parseScene(input: unknown): Scene {
  return SceneSchema.parse(input);
}
