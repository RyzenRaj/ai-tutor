import { describe, expect, it } from "vitest";
import {
  BINARY_SEARCH_CODE,
  BinarySearchParamsSchema,
  binarySearchResult,
  buildBinarySearchLesson,
  traceBinarySearch,
} from "@/lib/engines/binary-search";
import { LessonSchema } from "@/lib/lesson/schema";

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 2 ** 32;
    return seed / 2 ** 32;
  };
}

describe("binary search engine", () => {
  it("agrees with a linear scan on 2,000 random sorted arrays (incl. duplicates)", () => {
    const rand = rng(42);
    for (let t = 0; t < 2000; t++) {
      const n = Math.floor(rand() * 33);
      const values = Array.from({ length: n }, () => Math.floor(rand() * 40)).sort((a, b) => a - b);
      const target = Math.floor(rand() * 44) - 2;
      const idx = binarySearchResult(values, target);
      if (values.includes(target)) expect(values[idx]).toBe(target);
      else expect(idx).toBe(-1);
      const iterations = traceBinarySearch(values, target).filter((e) => e.kind === "mid").length;
      expect(iterations).toBeLessThanOrEqual(n === 0 ? 0 : Math.floor(Math.log2(n)) + 1);
    }
  });

  it("handles an empty array", () => {
    const lesson = buildBinarySearchLesson({ values: [], target: 5 });
    expect(lesson.steps.map((s) => s.id)).toHaveLength(2);
    expect(lesson.steps.at(-1)!.state.result).toBe(-1);
    const arr = lesson.steps[0].scene.elements[0];
    expect(arr.type === "array" && arr.pointers).toEqual([]);
  });

  it.each([
    [[7], 7, 0],
    [[7], 3, -1],
    [[7], 9, -1],
    [[1, 3, 5, 7, 9, 11], 1, 0],
    [[1, 3, 5, 7, 9, 11], 5, 2],
    [[1, 3, 5, 7, 9, 11], 11, 5],
    [[1, 3, 5, 7, 9, 11], 6, -1],
    [[1, 3, 5, 7, 9, 11], 100, -1],
    [[-5, -2, 0, 0.5, 3], 0.5, 3],
  ])("search %j for %d → %d", (values, target, expected) => {
    expect(binarySearchResult(values, target)).toBe(expected);
    expect(buildBinarySearchLesson({ values, target }).steps.at(-1)!.state.result).toBe(expected);
  });

  it("rejects unsorted, oversized and non-finite input", () => {
    expect(BinarySearchParamsSchema.safeParse({ values: [3, 1, 2], target: 1 }).success).toBe(false);
    expect(BinarySearchParamsSchema.safeParse({ values: Array.from({ length: 33 }, (_, i) => i), target: 1 }).success).toBe(false);
    expect(BinarySearchParamsSchema.safeParse({ values: [1, 2], target: NaN }).success).toBe(false);
    expect(() => buildBinarySearchLesson({ values: [2, 1], target: 1 })).toThrow();
  });

  it("is deterministic", () => {
    const a = buildBinarySearchLesson({ values: [1, 4, 9, 16, 25], target: 16 });
    const b = buildBinarySearchLesson({ values: [1, 4, 9, 16, 25], target: 16 });
    expect(a).toEqual(b);
  });

  it("keeps code, scene, state and checkpoints synchronized on every step", () => {
    const values = [3, 8, 12, 17, 21, 25, 30, 34, 42, 51];
    for (const target of [3, 34, 51, 20, 0, 99]) {
      const lesson = buildBinarySearchLesson({ values, target });
      expect(LessonSchema.safeParse(lesson).success).toBe(true);
      const codeLines = BINARY_SEARCH_CODE.split("\n");
      lesson.steps.forEach((step, i) => {
        // Highlighted lines exist and are non-empty.
        for (const l of step.highlightLines) expect(codeLines[l - 1]?.trim()).toBeTruthy();
        const arr = step.scene.elements[0];
        if (arr.type !== "array") throw new Error("expected array");
        const ptr = (label: string) => arr.pointers.find((p) => p.label === label)?.index;
        // Pointers drawn = state variables (when in range).
        const { low, high, mid } = step.state as { low: number; high: number; mid: number | null };
        if (low < values.length) expect(ptr("low")).toBe(low);
        else expect(ptr("low")).toBeUndefined();
        if (high >= 0) expect(ptr("high")).toBe(high);
        if (ptr("mid") !== undefined) expect(ptr("mid")).toBe(mid);
        // Cells outside [low, high] are shown as eliminated.
        arr.cells.forEach((c, k) => {
          if (k < low || k > high) expect(c.tone).toBe("muted");
        });
        // The canvas points at the cell being compared.
        if (step.objective === "Pick the middle candidate" || step.objective === "Compare with the target") expect(step.scene.focus).toEqual([`cell-${mid}`]);
        // Checkpoint answer matches what the engine does next.
        if (step.checkpoint) {
          const nextKind = lesson.steps[i + 2]!.objective;
          const expected = ["Return the match", "Discard the left half", "Discard the right half"][step.checkpoint.answerIndex];
          expect(nextKind).toBe(expected);
        }
      });
    }
  });

  it("moves pointers by stable ids so the renderer can animate them", () => {
    const lesson = buildBinarySearchLesson({ values: [1, 2, 3, 4, 5, 6, 7, 8], target: 7 });
    const ids = new Set(
      lesson.steps.flatMap((s) => {
        const arr = s.scene.elements[0];
        return arr.type === "array" ? arr.pointers.map((p) => p.id) : [];
      }),
    );
    expect([...ids].sort()).toEqual(["ptr-high", "ptr-low", "ptr-mid"]);
  });
});
