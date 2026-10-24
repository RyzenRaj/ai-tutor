import { describe, expect, it } from "vitest";
import { LessonSchema, type Lesson } from "@/lib/lesson/schema";
import { CAPABILITIES, buildLesson } from "@/lib/registry";
import { PHASES, phaseOrderIsValid } from "@/lib/teaching/sequence";
import { binarySearchResult, traceBinarySearch } from "@/lib/engines/binary-search";
import { computeJoin, DEFAULT_SQL_JOIN } from "@/lib/engines/sql-join";
import { computeShuffle, DEFAULT_SPARK_SHUFFLE } from "@/lib/engines/spark-shuffle";
import { planMock } from "@/lib/ai/planner";

const phases = (l: Lesson) => l.steps.map((s) => s.phase);
const firstIndex = (l: Lesson, p: string) => phases(l).indexOf(p as never);

describe("teaching sequence contract", () => {
  it("defines the canonical order", () => {
    expect(PHASES).toEqual(["definition", "why", "analogy", "preview", "walkthrough", "check", "summary"]);
  });

  it("accepts in-order phases (gaps allowed) and rejects out-of-order ones", () => {
    expect(phaseOrderIsValid(["definition", "analogy", "walkthrough", "walkthrough", "summary"])).toBe(true);
    expect(phaseOrderIsValid(["walkthrough"])).toBe(true);
    expect(phaseOrderIsValid(["walkthrough", "definition"])).toBe(false);
    expect(phaseOrderIsValid(["summary", "walkthrough"])).toBe(false);
  });

  it("the lesson schema enforces order and requires a walkthrough", () => {
    const lesson = buildLesson("binary-search", { values: [1, 2, 3], target: 2 });
    const swapped = { ...lesson, steps: [lesson.steps.at(-1)!, ...lesson.steps.slice(0, -1)] };
    expect(LessonSchema.safeParse(swapped).success).toBe(false);
    const noWalkthrough = { ...lesson, steps: lesson.steps.filter((s) => s.phase !== "walkthrough") };
    expect(LessonSchema.safeParse(noWalkthrough).success).toBe(false);
  });
});

describe.each(CAPABILITIES.map((c) => [c.id, c] as const))("%s full lesson", (_id, cap) => {
  const lesson = buildLesson(cap.id, cap.defaultParams);

  it("opens with definition → why → analogy → preview, then the walkthrough, then check → summary", () => {
    const p = phases(lesson);
    expect(p.slice(0, 4)).toEqual(["definition", "why", "analogy", "preview"]);
    expect(p[4]).toBe("walkthrough");
    expect(p.at(-1)).toBe("summary");
    expect(firstIndex(lesson, "check")).toBeGreaterThan(p.lastIndexOf("walkthrough"));
    expect(phaseOrderIsValid(p)).toBe(true);
  });

  it("states where the analogy stops matching reality", () => {
    const analogy = lesson.steps.find((s) => s.phase === "analogy")!;
    expect(lesson.teaching?.analogyLimit.length).toBeGreaterThan(20);
    expect(analogy.narration).toContain(lesson.teaching!.analogyLimit);
  });

  it("summary covers the key insight, when to use it and a common mistake", () => {
    const summary = lesson.steps.find((s) => s.phase === "summary")!;
    for (const part of [lesson.teaching!.summary.insight, lesson.teaching!.summary.whenToUse, lesson.teaching!.summary.commonMistake]) {
      expect(part.length).toBeGreaterThan(20);
      expect(summary.narration).toContain(part);
    }
  });

  it("the check question has a single correct, computed answer and distinct options", () => {
    const check = lesson.steps.find((s) => s.phase === "check")!;
    expect(check.checkpoint).toBeDefined();
    expect(new Set(check.checkpoint!.options).size).toBe(check.checkpoint!.options.length);
  });

  it("intro scenes are drawn and pointed at like any other step", () => {
    for (const s of lesson.steps.filter((x) => x.phase !== "walkthrough")) expect(s.scene.focus.length).toBeGreaterThan(0);
  });

  it("quick depth skips the introduction and summary", () => {
    const quick = buildLesson(cap.id, cap.defaultParams, { depth: "quick" });
    expect(new Set(phases(quick))).toEqual(new Set(["walkthrough"]));
  });
});

describe("check answers are computed, not written", () => {
  it("binary search: the maximum comparisons equals the worst case over every possible target", () => {
    for (const values of [[1], [1, 2], [3, 8, 12, 17, 21, 25, 30, 34, 42, 51], Array.from({ length: 32 }, (_, i) => i * 2)]) {
      const lesson = buildLesson("binary-search", { values, target: values[0] });
      const check = lesson.steps.find((s) => s.phase === "check")!.checkpoint!;
      const targets = [...values, ...values.map((v) => v + 1), values[0] - 1];
      const worst = Math.max(...targets.map((t) => traceBinarySearch(values, t).filter((e) => e.kind === "compare").length));
      expect(Number(check.options[check.answerIndex])).toBe(worst);
      expect(binarySearchResult(values, values[0])).toBe(0);
    }
  });

  it("binary search on an empty array has no check question", () => {
    expect(buildLesson("binary-search", { values: [], target: 1 }).steps.some((s) => s.phase === "check")).toBe(false);
  });

  it("SQL: asks for the other join type's row count", () => {
    const lesson = buildLesson("sql-join", DEFAULT_SQL_JOIN);
    const check = lesson.steps.find((s) => s.phase === "check")!.checkpoint!;
    expect(Number(check.options[check.answerIndex])).toBe(computeJoin({ ...DEFAULT_SQL_JOIN, joinType: "LEFT" }).rows.length);
  });

  it("Spark: asks how many records would be shuffled without map-side combine", () => {
    const lesson = buildLesson("spark-shuffle", DEFAULT_SPARK_SHUFFLE);
    const check = lesson.steps.find((s) => s.phase === "check")!.checkpoint!;
    const total = DEFAULT_SPARK_SHUFFLE.inputPartitions.flat().length;
    expect(Number(check.options[check.answerIndex])).toBe(total);
    expect(total).not.toBe(computeShuffle(DEFAULT_SPARK_SHUFFLE).combined.flat().length);
  });
});

describe("depth from the learner's request (mock planner)", () => {
  it.each([
    ["teach me binary search", "full"],
    ["quick binary search for 7 in [1, 3, 5, 7]", "quick"],
    ["just the steps of a left join, skip the intro", "quick"],
    ["tl;dr spark shuffle", "quick"],
  ])("%s → %s", (prompt, depth) => {
    const { lesson } = planMock(prompt);
    expect(lesson.steps[0].phase === "walkthrough" ? "quick" : "full").toBe(depth);
  });
});
