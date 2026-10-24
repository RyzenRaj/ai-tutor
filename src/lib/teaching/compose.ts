import type { LessonStepInput } from "@/lib/lesson/schema";
import type { SceneInput, Tone } from "@/lib/scene/schema";
import type { Depth } from "./sequence";

/** Assemble a lesson's steps in teaching order. Quick lessons keep only the walkthrough. */
export function composeSteps(
  parts: { intro: LessonStepInput[]; walkthrough: LessonStepInput[]; check?: LessonStepInput | null; summary: LessonStepInput },
  depth: Depth = "full",
): LessonStepInput[] {
  const walkthrough = parts.walkthrough.map((s) => ({ ...s, phase: "walkthrough" as const }));
  if (depth === "quick") return walkthrough;
  return [...parts.intro, ...walkthrough, ...(parts.check ? [parts.check] : []), parts.summary];
}

export type BoxSpec = { id: string; label: string; detail?: string; tone?: Tone };

/**
 * A row of labelled boxes joined by arrows — used for "why", analogy and summary boards.
 * These are explanatory sketches, so they are marked illustrative.
 */
export function boxesScene(
  boxes: BoxSpec[],
  opts: { focus?: string; chain?: boolean; caption?: string; note?: string } = {},
): SceneInput {
  const ids = boxes.map((b) => `box-${b.id}`);
  return {
    version: 1,
    fidelity: "illustrative",
    layout: "column",
    elements: [
      {
        type: "group",
        id: "board",
        direction: "row",
        children: boxes.map((b) => ({ type: "box" as const, id: `box-${b.id}`, label: b.label, detail: b.detail, tone: b.tone ?? "default" })),
      },
      ...(opts.note ? [{ type: "text" as const, id: "note", text: opts.note }] : []),
    ],
    arrows: opts.chain === false ? [] : ids.slice(1).map((to, i) => ({ id: `chain-${i}`, from: ids[i], to, tone: "active" as const })),
    focus: [opts.focus ? `box-${opts.focus}` : ids[0]],
    caption: opts.caption ?? "Explanatory sketch, not a simulation",
  };
}

/** Deterministic distractors: unique, never equal to the answer, correct answer placed by `seed`. */
export function numericOptions(answer: number, candidates: number[], seed: number): { options: string[]; answerIndex: number } {
  const distractors = [...new Set(candidates.filter((c) => Number.isFinite(c) && c >= 0 && c !== answer))].slice(0, 2);
  for (let extra = answer + 1; distractors.length < 2; extra++) if (!distractors.includes(extra)) distractors.push(extra);
  const answerIndex = Math.abs(seed) % 3;
  const options = [...distractors];
  options.splice(answerIndex, 0, answer);
  return { options: options.map(String), answerIndex };
}
