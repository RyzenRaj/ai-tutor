import { z } from "zod";
import { type Lesson, type LessonStepInput, LessonSchema } from "@/lib/lesson/schema";
import type { SceneInput as Scene, LeafElementInput as SceneElement, Tone } from "@/lib/scene/schema";

/**
 * Simplified Spark shuffle for `rdd.reduceByKey(_ + _, R)`.
 * Partition routing reproduces Spark's HashPartitioner for String keys
 * (Java String.hashCode, non-negative mod). Everything else is a teaching model.
 */

const Rec = z.object({ key: z.string().regex(/^[a-z0-9_]{1,12}$/i), value: z.number().int().min(-999).max(999) });

export const SparkShuffleParamsSchema = z.object({
  inputPartitions: z.array(z.array(Rec).max(6)).min(1).max(4),
  numReducers: z.number().int().min(1).max(4),
});
export type SparkShuffleParams = z.infer<typeof SparkShuffleParamsSchema>;
type Record_ = z.infer<typeof Rec>;

export const DEFAULT_SPARK_SHUFFLE: SparkShuffleParams = {
  inputPartitions: [
    [
      { key: "mumbai", value: 1 },
      { key: "pune", value: 1 },
      { key: "mumbai", value: 1 },
    ],
    [
      { key: "delhi", value: 1 },
      { key: "pune", value: 1 },
    ],
    [
      { key: "mumbai", value: 1 },
      { key: "delhi", value: 1 },
      { key: "goa", value: 1 },
    ],
  ],
  numReducers: 2,
};

/** Java's String.hashCode (32-bit signed). */
export function javaStringHashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

/** Spark's Utils.nonNegativeMod as used by HashPartitioner.getPartition. */
export function hashPartition(key: string, numPartitions: number): number {
  const raw = javaStringHashCode(key) % numPartitions;
  return raw + (raw < 0 ? numPartitions : 0);
}

export const SPARK_CODE = (p: number, r: number) => `// Stage 1 — map side (${p} tasks, one per input partition)
val pairs  = sc.parallelize(data, numSlices = ${p})
val totals = pairs.reduceByKey(_ + _, numPartitions = ${r})
//   a) combine values per key inside each partition
//   b) reducer = nonNegativeMod(key.hashCode, ${r})
//   c) write shuffle output, one bucket per reducer
// ---- stage boundary: the shuffle ----
// Stage 2 — reduce side (${r} tasks)
//   d) fetch this reducer's bucket from every map task
//   e) merge values per key
totals.collect()`;

type Chip = { id: string; key: string; value: number; from: number };

function combine(records: Record_[], p: number): Chip[] {
  const out: Chip[] = [];
  records.forEach((rec, i) => {
    const existing = out.find((c) => c.key === rec.key);
    if (existing) existing.value += rec.value;
    else out.push({ id: `rec-${p}-${i}`, key: rec.key, value: rec.value, from: p });
  });
  return out;
}

export function computeShuffle(params: SparkShuffleParams) {
  const p = SparkShuffleParamsSchema.parse(params);
  const combined = p.inputPartitions.map((recs, i) => combine(recs, i));
  const fetched: Chip[][] = Array.from({ length: p.numReducers }, () => []);
  for (const part of combined) for (const c of part) fetched[hashPartition(c.key, p.numReducers)].push(c);
  const reduced = fetched.map((chips) => {
    const merged: Chip[] = [];
    for (const c of chips) {
      const m = merged.find((x) => x.key === c.key);
      if (m) m.value += c.value;
      else merged.push({ ...c });
    }
    return merged;
  });
  return { params: p, combined, fetched, reduced };
}

export function buildSparkShuffleLesson(params: SparkShuffleParams): Lesson {
  const { params: p, combined, fetched, reduced } = computeShuffle(params);
  const P = p.inputPartitions.length;
  const R = p.numReducers;
  const totalRecords = p.inputPartitions.reduce((n, x) => n + x.length, 0);
  const shuffled = combined.reduce((n, x) => n + x.length, 0);

  const mapContainer = (i: number, chips: { id: string; label: string; tone: Tone }[], subtitle: string): SceneElement => ({
    type: "container",
    id: `map-${i}`,
    title: `Map task ${i} · partition ${i}`,
    subtitle,
    chips,
  });
  const redContainer = (j: number, chips: { id: string; label: string; tone: Tone }[], subtitle: string): SceneElement => ({
    type: "container",
    id: `red-${j}`,
    title: `Reduce task ${j}`,
    subtitle,
    chips,
  });
  const scene = (maps: SceneElement[], reds: SceneElement[], caption: string, arrows: Scene["arrows"] = [], focus: string[] = ["stage1"]): Scene => ({
    version: 1,
    fidelity: "verified",
    layout: "column",
    focus,
    elements: [
      { type: "group", id: "stage1", title: "Stage 1 · map side", direction: "row", children: maps },
      { type: "group", id: "stage2", title: "Stage 2 · reduce side", direction: "row", children: reds },
      { type: "text", id: "caption", text: caption },
    ],
    arrows,
  });
  const emptyReds = (sub = "waiting for shuffle") => Array.from({ length: R }, (_, j) => redContainer(j, [], sub));

  const steps: LessonStepInput[] = [];

  // 1. Input
  steps.push({
    id: "spark-input",
    objective: "See the input partitions",
    narration: `The data starts in ${P} partitions, and Spark runs one map task per partition in parallel. reduceByKey needs every value for a key in one place, but the same key appears in several partitions — that is why a shuffle is needed.`,
    highlightLines: [1, 2],
    state: { inputPartitions: P, reducers: R, records: totalRecords },
    scene: scene(
      p.inputPartitions.map((recs, i) =>
        mapContainer(i, recs.map((r, k) => ({ id: `rec-${i}-${k}`, label: `${r.key}:${r.value}`, tone: "default" })), `${recs.length} records`),
      ),
      emptyReds(),
      `${totalRecords} records across ${P} partitions`,
    ),
    checkpoint: {
      prompt: "Why can't each map task produce final totals on its own?",
      options: ["The same key can live in several partitions", "Map tasks cannot add numbers", "The data is too big for memory"],
      answerIndex: 0,
      explanation: "A task only sees its own partition, so its sum for a key is partial until all partials for that key meet.",
    },
  });

  // 2. Map-side combine
  steps.push({
    id: "spark-combine",
    objective: "Combine inside each partition first",
    narration: `Before shuffling, reduceByKey adds up values for the same key inside each partition (map-side combine). ${totalRecords} records become ${shuffled} partial results, so less data crosses the network.`,
    highlightLines: [3, 4],
    state: { recordsBefore: totalRecords, recordsAfterCombine: shuffled },
    scene: scene(
      combined.map((chips, i) =>
        mapContainer(i, chips.map((c) => ({ id: c.id, label: `${c.key}:${c.value}`, tone: "compare" })), `${chips.length} partial result(s)`),
      ),
      emptyReds(),
      `Shuffle volume reduced from ${totalRecords} to ${shuffled} records`,
    ),
  });

  // 3. Routing
  const keys = [...new Set(combined.flat().map((c) => c.key))];
  steps.push({
    id: "spark-route",
    objective: "Decide where each key goes",
    narration: `Each key is routed with HashPartitioner: reducer = nonNegativeMod(key.hashCode, ${R}). ${keys
      .map((k) => `"${k}" → ${hashPartition(k, R)}`)
      .join(", ")}. The same key always goes to the same reducer — that is the guarantee reduceByKey relies on.`,
    highlightLines: [5, 6],
    state: Object.fromEntries(keys.map((k) => [`${k}.hashCode`, javaStringHashCode(k)])),
    scene: scene(
      combined.map((chips, i) =>
        mapContainer(
          i,
          chips.map((c) => ({ id: c.id, label: `${c.key}:${c.value} → r${hashPartition(c.key, R)}`, tone: "warning" })),
          "bucketed by reducer",
        ),
      ),
      emptyReds(),
      "Each map task writes one bucket per reducer to local disk",
    ),
    checkpoint: {
      prompt: `If two different map tasks both hold partial results for "${keys[0] ?? "a key"}", where do they go?`,
      options: ["To the same reducer", "To different reducers", "It is random each run"],
      answerIndex: 0,
      explanation: "The reducer depends only on the key's hash, so equal keys always land together.",
    },
  });

  // 4. Shuffle — chips keep their ids, so the renderer animates them moving.
  const flows: Scene["arrows"] = [];
  combined.forEach((chips, i) => {
    for (let j = 0; j < R; j++) {
      const n = chips.filter((c) => hashPartition(c.key, R) === j).length;
      if (n > 0) flows.push({ id: `flow-${i}-${j}`, from: `map-${i}`, to: `red-${j}`, label: `${n}`, tone: "warning" });
    }
  });
  steps.push({
    id: "spark-shuffle",
    objective: "Move data across the stage boundary",
    narration: `This is the shuffle: each reduce task fetches its bucket from every map task, over the network. ${flows.length} map→reduce transfers move ${shuffled} records. The stage boundary means stage 2 cannot start until stage 1's shuffle files are written.`,
    highlightLines: [7, 8, 9],
    state: { transfers: flows.length, recordsShuffled: shuffled },
    scene: scene(
      combined.map((_, i) => mapContainer(i, [], "shuffle files written")),
      fetched.map((chips, j) =>
        redContainer(j, chips.map((c) => ({ id: c.id, label: `${c.key}:${c.value} (from p${c.from})`, tone: "warning" })), `${chips.length} fetched`),
      ),
      "Arrows show how many records each reducer fetched from each map task",
      flows,
      ["stage2"],
    ),
  });

  // 5. Reduce
  steps.push({
    id: "spark-reduce",
    objective: "Merge partial results per key",
    narration: `Each reduce task now sees every partial value for its keys and adds them: ${reduced
      .flat()
      .map((c) => `${c.key} = ${c.value}`)
      .join(", ")}.`,
    highlightLines: [10, 11],
    state: Object.fromEntries(reduced.flat().map((c) => [c.key, c.value])),
    scene: scene(
      combined.map((_, i) => mapContainer(i, [], "done")),
      reduced.map((chips, j) => redContainer(j, chips.map((c) => ({ id: c.id, label: `${c.key}:${c.value}`, tone: "success" })), `${chips.length} key(s)`)),
      "Final totals, partitioned by key",
      [],
      ["stage2"],
    ),
  });

  // Every engine output passes the same contract validation as model output.
  return LessonSchema.parse({
    schemaVersion: 1,
    id: `spark-shuffle:${P}:${R}:${totalRecords}`,
    capabilityId: "spark-shuffle",
    title: "Spark shuffle: reduceByKey",
    summary: `Follow ${totalRecords} records through map-side combine, hash partitioning and the shuffle into ${R} reduce task(s).`,
    fidelity: "verified",
    assumptions: [
      "Simplified model of an RDD reduceByKey; not a Spark execution engine.",
      "Routing reproduces HashPartitioner with Java String.hashCode. DataFrame/SQL shuffles use Murmur3 hashing instead, so keys may land on different partitions there.",
      "Ignores spill-to-disk, shuffle file format, executor placement, retries, adaptive query execution and skew handling.",
    ],
    code: { language: "scala", source: SPARK_CODE(P, R) },
    steps,
  });
}
