import { z } from "zod";
import type { Lesson } from "@/lib/lesson/schema";
import { BinarySearchParamsSchema, buildBinarySearchLesson } from "@/lib/engines/binary-search";
import { DEFAULT_SQL_JOIN, SqlJoinParamsSchema, buildSqlJoinLesson } from "@/lib/engines/sql-join";
import { DEFAULT_SPARK_SHUFFLE, SparkShuffleParamsSchema, buildSparkShuffleLesson } from "@/lib/engines/spark-shuffle";

/**
 * Concept capability registry. Each entry is a *verified* specialist engine:
 * params are validated, and the engine (not the model) computes every state.
 * Topics with no entry fall back to the illustrative whiteboard.
 */

export type Capability<P = unknown> = {
  id: string;
  title: string;
  family: "algorithms" | "sql" | "distributed-systems";
  description: string;
  /** Lower-case phrases used by the deterministic (mock) topic matcher. */
  keywords: string[];
  paramsSchema: z.ZodType<P>;
  defaultParams: P;
  /** Short natural-language description of params for the LLM planner. */
  paramsHint: string;
  build: (params: P) => Lesson;
};

const defineCapability = <P>(c: Capability<P>) => c as unknown as Capability<unknown>;

export const CAPABILITIES: readonly Capability<unknown>[] = [
  defineCapability({
    id: "binary-search",
    title: "Binary search",
    family: "algorithms",
    description: "Find a target in a sorted array by halving the search range.",
    keywords: ["binary search", "bisect", "binary-search", "search sorted"],
    paramsSchema: BinarySearchParamsSchema,
    defaultParams: { values: [3, 8, 12, 17, 21, 25, 30, 34, 42, 51], target: 34 },
    paramsHint: '{"values": number[] (sorted ascending, ≤32 items), "target": number}',
    build: buildBinarySearchLesson,
  }),
  defineCapability({
    id: "sql-join",
    title: "SQL JOIN",
    family: "sql",
    description: "Combine rows from two tables with INNER or LEFT JOIN, including NULL keys.",
    keywords: ["join", "inner join", "left join", "sql join", "outer join"],
    paramsSchema: SqlJoinParamsSchema,
    defaultParams: DEFAULT_SQL_JOIN,
    paramsHint:
      '{"joinType": "INNER"|"LEFT", "left": {"name": ident, "columns": ident[] (≤5), "rows": (string|number|null)[][] (≤8)}, "right": same shape, "leftKey": ident, "rightKey": ident}',
    build: buildSqlJoinLesson,
  }),
  defineCapability({
    id: "spark-shuffle",
    title: "Spark shuffle (reduceByKey)",
    family: "distributed-systems",
    description: "Simplified Spark shuffle: map-side combine, hash partitioning, data movement, reduce.",
    keywords: ["shuffle", "spark", "reducebykey", "partition", "wide transformation"],
    paramsSchema: SparkShuffleParamsSchema,
    defaultParams: DEFAULT_SPARK_SHUFFLE,
    paramsHint: '{"inputPartitions": {"key": string (a-z0-9_, ≤12), "value": int}[][] (≤4 partitions, ≤6 each), "numReducers": 1..4}',
    build: buildSparkShuffleLesson,
  }),
];

export function getCapability(id: string): Capability<unknown> | undefined {
  return CAPABILITIES.find((c) => c.id === id);
}

/** Deterministic topic matcher used in mock mode and as a guard on model choices. */
export function matchCapability(topic: string): Capability<unknown> | undefined {
  const t = topic.toLowerCase();
  let best: { c: Capability<unknown>; score: number } | undefined;
  for (const c of CAPABILITIES) {
    const score = c.keywords.reduce((s, k) => (t.includes(k) ? s + k.length : s), 0);
    if (score > 0 && (!best || score > best.score)) best = { c, score };
  }
  return best?.c;
}

/** Validate params and build. Throws ZodError for invalid params. */
export function buildLesson(capabilityId: string, params: unknown): Lesson {
  const cap = getCapability(capabilityId);
  if (!cap) throw new Error(`Unknown capability: ${capabilityId}`);
  return cap.build(cap.paramsSchema.parse(params));
}
