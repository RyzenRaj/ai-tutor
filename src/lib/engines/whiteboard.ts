import { z } from "zod";
import { type Lesson, type LessonStepInput, LessonSchema } from "@/lib/lesson/schema";
import type { SceneInput as Scene } from "@/lib/scene/schema";

/**
 * General-purpose fallback: an *illustrative* whiteboard built from boxes and arrows.
 * Used for topics without a specialist simulator. Never presented as a simulation.
 */

const BoxId = z.string().regex(/^[a-z][a-z0-9_]{0,23}$/);

export const WhiteboardPlanSchema = z.object({
  title: z.string().min(1).max(100),
  summary: z.string().min(1).max(400),
  steps: z
    .array(
      z.object({
        objective: z.string().min(1).max(120),
        narration: z.string().min(1).max(600),
        boxes: z.array(z.object({ id: BoxId, label: z.string().min(1).max(60), detail: z.string().max(120).optional() })).min(1).max(6),
        arrows: z.array(z.object({ from: BoxId, to: BoxId, label: z.string().max(30).optional() })).max(8),
        focus: z.array(BoxId).max(6).optional(),
      }),
    )
    .min(1)
    .max(8),
});
export type WhiteboardPlan = z.infer<typeof WhiteboardPlanSchema>;

export function buildWhiteboardLesson(plan: WhiteboardPlan, capabilityId = "whiteboard"): Lesson {
  const p = WhiteboardPlanSchema.parse(plan);
  const outline = p.steps.map((s, i) => `${i + 1}. ${s.objective}`).join("\n");
  const steps: LessonStepInput[] = p.steps.map((s, i) => {
    const boxIds = new Set(s.boxes.map((b) => b.id));
    const focus = new Set(s.focus ?? []);
    const scene: Scene = {
      version: 1,
      fidelity: "illustrative",
      layout: "column",
      elements: [
        {
          type: "group",
          id: "board",
          direction: "row",
          children: s.boxes.map((b) => ({
            type: "box" as const,
            id: `box-${b.id}`,
            label: b.label,
            detail: b.detail,
            tone: focus.has(b.id) ? ("active" as const) : ("default" as const),
          })),
        },
      ],
      // Drop arrows that reference unknown boxes instead of failing the whole lesson.
      arrows: s.arrows
        .filter((a) => boxIds.has(a.from) && boxIds.has(a.to) && a.from !== a.to)
        .map((a, k) => ({ id: `arrow-${i}-${k}`, from: `box-${a.from}`, to: `box-${a.to}`, label: a.label, tone: "active" as const })),
      focus: [`box-${(s.focus ?? []).find((f) => boxIds.has(f)) ?? s.boxes[0].id}`],
      caption: "Illustrative sketch — not a verified simulation",
    };
    return {
      id: `wb-${i}`,
      objective: s.objective,
      narration: s.narration,
      highlightLines: [i + 1],
      state: { step: i + 1, of: p.steps.length },
      scene,
    };
  });
  // Every engine output passes the same contract validation as model output.
  return LessonSchema.parse({
    schemaVersion: 1,
    id: `whiteboard:${p.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`,
    capabilityId,
    title: p.title,
    summary: p.summary,
    fidelity: "illustrative",
    assumptions: ["No specialist simulator exists for this topic yet. The diagram is an explanatory sketch and its details are not verified by code."],
    code: { language: "text", source: outline },
    steps,
  });
}

/** Shown when live AI is not configured and the topic has no specialist engine. */
export function mockWhiteboardPlan(topic: string): WhiteboardPlan {
  const t = topic.trim().slice(0, 60) || "this topic";
  return {
    title: `Sketch: ${t}`,
    summary: `Demo mode: live AI is not configured, so this is a placeholder sketch for "${t}". Add OPENROUTER_API_KEY to get a real explanation. Specialist simulators exist for binary search, SQL JOIN and Spark shuffle.`,
    steps: [
      {
        objective: "Name the idea",
        narration: `A good explanation of "${t}" starts with the problem it solves. In live mode the tutor fills this in; in demo mode this text is a fixed placeholder.`,
        boxes: [
          { id: "problem", label: "Problem", detail: "What goes wrong without it?" },
          { id: "idea", label: t, detail: "The core idea" },
        ],
        arrows: [{ from: "problem", to: "idea", label: "solved by" }],
        focus: ["idea"],
      },
      {
        objective: "Show the moving parts",
        narration: "Next, break the idea into parts and show how information flows between them.",
        boxes: [
          { id: "input", label: "Input" },
          { id: "process", label: "Process" },
          { id: "output", label: "Output" },
        ],
        arrows: [
          { from: "input", to: "process" },
          { from: "process", to: "output" },
        ],
        focus: ["process"],
      },
    ],
  };
}
