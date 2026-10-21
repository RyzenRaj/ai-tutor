import { z } from "zod";
import { SceneSchema } from "@/lib/scene/schema";

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
  objective: z.string().min(1).max(200),
  narration: z.string().min(1).max(800),
  /** 1-based line numbers in the lesson's code artifact. */
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
    steps: z.array(LessonStepSchema).min(1).max(80),
  })
  .superRefine((lesson, ctx) => {
    const lineCount = lesson.code.source.split("\n").length;
    const ids = new Set<string>();
    lesson.steps.forEach((s, i) => {
      if (ids.has(s.id)) ctx.addIssue({ code: "custom", message: `Duplicate step id ${s.id}` });
      ids.add(s.id);
      for (const l of s.highlightLines) {
        if (l > lineCount)
          ctx.addIssue({ code: "custom", message: `Step ${i}: highlight line ${l} beyond code length ${lineCount}` });
      }
      if (s.scene.fidelity !== lesson.fidelity)
        ctx.addIssue({ code: "custom", message: `Step ${i}: scene fidelity differs from lesson fidelity` });
    });
  });
export type Lesson = z.infer<typeof LessonSchema>;
export type LessonInput = z.input<typeof LessonSchema>;

export function parseLesson(input: unknown): Lesson {
  return LessonSchema.parse(input);
}
