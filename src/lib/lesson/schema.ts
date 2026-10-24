import { z } from "zod";
import { SceneSchema } from "@/lib/scene/schema";
import { DepthSchema, PhaseSchema, TeachingTextSchema, phaseOrderIsValid } from "@/lib/teaching/sequence";

/**
 * Canonical lesson contract. Every panel (narration, code, scene, checkpoint)
 * renders from the same active LessonStep, so they cannot drift apart.
 */

export const CheckpointSchema = z
  .object({
    prompt: z.string().min(1).max(300),
    options: z.array(z.string().min(1).max(120)).min(2).max(5),
    answerIndex: z.number().int().min(0),
    explanation: z.string().max(400),
  })
  .refine((c) => c.answerIndex < c.options.length, { message: "answerIndex out of range" });
export type Checkpoint = z.infer<typeof CheckpointSchema>;

export const CodeArtifactSchema = z.object({
  language: z.enum(["python", "sql", "scala", "text"]),
  source: z.string().max(4000),
});
export type CodeArtifact = z.infer<typeof CodeArtifactSchema>;

export const LessonStepSchema = z.object({
  id: z.string().min(1).max(64),
  /** Where this step sits in the teaching sequence (definition → … → summary). */
  phase: PhaseSchema.default("walkthrough"),
  objective: z.string().min(1).max(200),
  narration: z.string().min(1).max(800),
  /** 1-based line numbers in the lesson's code artifact (may be empty before the walkthrough). */
  highlightLines: z.array(z.number().int().min(1)).max(20),
  /** Engine-specific, verified domain state — shown in the "State" inspector. */
  state: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  scene: SceneSchema,
  checkpoint: CheckpointSchema.optional(),
});
export type LessonStep = z.infer<typeof LessonStepSchema>;
export type LessonStepInput = z.input<typeof LessonStepSchema>;

export const LessonSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().min(1).max(80),
    capabilityId: z.string().min(1).max(64),
    title: z.string().min(1).max(120),
    summary: z.string().max(600),
    fidelity: z.enum(["verified", "illustrative"]),
    assumptions: z.array(z.string().max(300)).max(10).default([]),
    code: CodeArtifactSchema,
    depth: DepthSchema.default("full"),
    teaching: TeachingTextSchema.optional(),
    steps: z.array(LessonStepSchema).min(1).max(80),
  })
  .superRefine((lesson, ctx) => {
    const phases = lesson.steps.map((s) => s.phase);
    if (!phaseOrderIsValid(phases)) ctx.addIssue({ code: "custom", message: `Teaching phases out of order: ${phases.join(" → ")}` });
    if (!phases.includes("walkthrough")) ctx.addIssue({ code: "custom", message: "A lesson needs at least one walkthrough step" });
    const lineCount = lesson.code.source.split("\n").length;
    const ids = new Set<string>();
    lesson.steps.forEach((s, i) => {
      if (ids.has(s.id)) ctx.addIssue({ code: "custom", message: `Duplicate step id ${s.id}` });
      ids.add(s.id);
      for (const l of s.highlightLines) {
        if (l > lineCount)
          ctx.addIssue({ code: "custom", message: `Step ${i}: highlight line ${l} beyond code length ${lineCount}` });
      }
      // Explanatory steps may show an illustrative sketch inside a verified lesson; the
      // walkthrough, preview and check must match the lesson's fidelity.
      const explanatory = s.phase === "definition" || s.phase === "why" || s.phase === "analogy" || s.phase === "summary";
      if (s.scene.fidelity !== lesson.fidelity && !(explanatory && s.scene.fidelity === "illustrative"))
        ctx.addIssue({ code: "custom", message: `Step ${i}: scene fidelity differs from lesson fidelity` });
    });
  });
export type Lesson = z.infer<typeof LessonSchema>;
export type LessonInput = z.input<typeof LessonSchema>;

export function parseLesson(input: unknown): Lesson {
  return LessonSchema.parse(input);
}
