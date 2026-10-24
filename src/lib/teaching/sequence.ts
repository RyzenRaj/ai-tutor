import { z } from "zod";

/**
 * Teaching sequence (P4): intuition before mechanics.
 * definition → why → analogy (with where it breaks) → preview → walkthrough → check → summary.
 * Any phase except the walkthrough may be skipped (e.g. a quick follow-up), but never reordered.
 */
export const PHASES = ["definition", "why", "analogy", "preview", "walkthrough", "check", "summary"] as const;
export type Phase = (typeof PHASES)[number];
export const PhaseSchema = z.enum(PHASES);

export const PHASE_LABEL: Record<Phase, string> = {
  definition: "Definition",
  why: "Why it matters",
  analogy: "Analogy",
  preview: "Preview",
  walkthrough: "Walkthrough",
  check: "Check yourself",
  summary: "Summary",
};

const rank = (p: Phase) => PHASES.indexOf(p);

export function phaseOrderIsValid(phases: readonly Phase[]): boolean {
  return phases.every((p, i) => i === 0 || rank(phases[i - 1]) <= rank(p));
}

export const DepthSchema = z.enum(["full", "quick"]);
export type Depth = z.infer<typeof DepthSchema>;

/** Words a learner uses when they want the short version. */
const QUICK = /\b(quick(ly)?|tl;?dr|just the (code|steps)|skip (the )?intro(duction)?|no intro|briefly|short version)\b/i;
export function depthFromPrompt(prompt: string): Depth {
  return QUICK.test(prompt) ? "quick" : "full";
}

/** Human-written (or AI-written, validated) teaching text. It never contains simulation state. */
export const TeachingTextSchema = z.object({
  definition: z.string().min(10).max(400),
  why: z.string().min(10).max(500),
  analogy: z.string().min(10).max(500),
  analogyLimit: z.string().min(10).max(300),
  summary: z.object({
    insight: z.string().min(10).max(300),
    whenToUse: z.string().min(10).max(300),
    commonMistake: z.string().min(10).max(300),
  }),
});
export type TeachingText = z.infer<typeof TeachingTextSchema>;

/** Text an AI planner may supply to replace the built-in wording (never states, scenes or answers). */
export const TeachingOverrideSchema = TeachingTextSchema.pick({ definition: true, why: true, analogy: true, analogyLimit: true }).partial();
export type TeachingOverride = z.infer<typeof TeachingOverrideSchema>;

export type BuildOptions = { depth?: Depth; teaching?: TeachingOverride };

export function mergeTeaching(base: TeachingText, override?: TeachingOverride): TeachingText {
  if (!override) return base;
  const ok = TeachingOverrideSchema.safeParse(override);
  return ok.success ? { ...base, ...Object.fromEntries(Object.entries(ok.data).filter(([, v]) => v)) } : base;
}

export const analogyNarration = (t: TeachingText) => `${t.analogy}\n\nWhere the analogy stops: ${t.analogyLimit}`;
export const summaryNarration = (t: TeachingText) =>
  `Key insight: ${t.summary.insight}\nWhen to use it: ${t.summary.whenToUse}\nCommon mistake: ${t.summary.commonMistake}`;
