import { describe, expect, it } from "vitest";
import { DEFAULT_SPARK_SHUFFLE, buildSparkShuffleLesson, computeShuffle, hashPartition, javaStringHashCode } from "@/lib/engines/spark-shuffle";

describe("Spark shuffle engine", () => {
  it("reproduces Java String.hashCode", () => {
    expect(javaStringHashCode("")).toBe(0);
    expect(javaStringHashCode("a")).toBe(97);
    expect(javaStringHashCode("hello")).toBe(99162322);
    expect(javaStringHashCode("polygenelubricants")).toBe(-2147483648); // Integer.MIN_VALUE
  });

  it("uses non-negative modulo like Spark's HashPartitioner", () => {
    expect(hashPartition("polygenelubricants", 3)).toBe(((-2147483648 % 3) + 3) % 3);
    for (const k of ["mumbai", "pune", "delhi", "goa", "x", "polygenelubricants"]) {
      for (const n of [1, 2, 3, 4]) {
        const p = hashPartition(k, n);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThan(n);
      }
    }
  });

  it("preserves totals and sends each key to exactly one reducer", () => {
    const { reduced } = computeShuffle(DEFAULT_SPARK_SHUFFLE);
    const expected = new Map<string, number>();
    for (const part of DEFAULT_SPARK_SHUFFLE.inputPartitions) for (const r of part) expected.set(r.key, (expected.get(r.key) ?? 0) + r.value);
    const seen = new Map<string, number>();
    reduced.forEach((chips, j) =>
      chips.forEach((c) => {
        expect(seen.has(c.key)).toBe(false);
        seen.set(c.key, c.value);
        expect(hashPartition(c.key, DEFAULT_SPARK_SHUFFLE.numReducers)).toBe(j);
      }),
    );
    expect(seen).toEqual(expected);
  });

  it("map-side combine reduces shuffled records", () => {
    const { combined } = computeShuffle(DEFAULT_SPARK_SHUFFLE);
    expect(combined.flat().length).toBe(7); // 8 input records, "mumbai" combined in partition 0
  });

  it("keeps chip ids across the shuffle so movement can be animated", () => {
    const lesson = buildSparkShuffleLesson(DEFAULT_SPARK_SHUFFLE);
    const chipIds = (stepId: string, prefix: string) => {
      const s = lesson.steps.find((x) => x.id === stepId)!;
      return s.scene.elements
        .flatMap((e) => (e.type === "group" ? e.children : [e]))
        .filter((e) => e.type === "container" && e.id.startsWith(prefix))
        .flatMap((e) => (e.type === "container" ? e.chips.map((c) => c.id) : []))
        .sort();
    };
    expect(chipIds("spark-shuffle", "red-")).toEqual(chipIds("spark-route", "map-"));
    expect(lesson.assumptions.join(" ")).toMatch(/not a Spark execution engine/);
  });

  it("handles a single reducer and empty partitions", () => {
    const lesson = buildSparkShuffleLesson({ inputPartitions: [[], [{ key: "a", value: 2 }]], numReducers: 1 });
    expect(lesson.steps.at(-1)!.state).toEqual({ a: 2 });
    const none = buildSparkShuffleLesson({ inputPartitions: [[]], numReducers: 2 });
    expect(none.steps.at(-1)!.state).toEqual({});
  });
});
