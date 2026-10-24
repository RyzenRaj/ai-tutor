import { z } from "zod";
import { type Lesson, type LessonStepInput, LessonSchema } from "@/lib/lesson/schema";
import type { SceneInput as Scene, Tone } from "@/lib/scene/schema";
import { BINARY_SEARCH_TEXT } from "@/lib/teaching/content";
import { shortHash } from "@/lib/util/hash";
import { boxesScene, composeSteps, numericOptions } from "@/lib/teaching/compose";
import { analogyNarration, mergeTeaching, summaryNarration, type BuildOptions } from "@/lib/teaching/sequence";

/** Deterministic binary search engine: computes every state; the model never does. */

export const BinarySearchParamsSchema = z
  .object({
    values: z.array(z.number().finite()).max(32),
    target: z.number().finite(),
  })
  .refine((p) => p.values.every((v, i) => i === 0 || p.values[i - 1] <= v), {
    message: "Binary search requires values sorted in non-decreasing order",
    path: ["values"],
  });
export type BinarySearchParams = z.infer<typeof BinarySearchParamsSchema>;

export const BINARY_SEARCH_CODE = `def binary_search(arr, target):
    low, high = 0, len(arr) - 1
    while low <= high:
        mid = (low + high) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            low = mid + 1
        else:
            high = mid - 1
    return -1`;

export type TraceEvent =
  | { kind: "init"; low: number; high: number }
  | { kind: "mid"; low: number; high: number; mid: number }
  | { kind: "compare"; low: number; high: number; mid: number; relation: "eq" | "lt" | "gt" }
  | { kind: "found"; low: number; high: number; mid: number }
  | { kind: "moveLow"; low: number; high: number; mid: number }
  | { kind: "moveHigh"; low: number; high: number; mid: number }
  | { kind: "notFound"; low: number; high: number };

/** Pure algorithm trace. Mirrors BINARY_SEARCH_CODE line by line. */
export function traceBinarySearch(values: readonly number[], target: number): TraceEvent[] {
  const events: TraceEvent[] = [];
  let low = 0;
  let high = values.length - 1;
  events.push({ kind: "init", low, high });
  // Bounded loop: binary search on n items needs at most floor(log2 n) + 1 iterations.
  for (let guard = 0; low <= high && guard < 64; guard++) {
    const mid = Math.floor((low + high) / 2);
    events.push({ kind: "mid", low, high, mid });
    const v = values[mid];
    const relation = v === target ? "eq" : v < target ? "lt" : "gt";
    events.push({ kind: "compare", low, high, mid, relation });
    if (relation === "eq") {
      events.push({ kind: "found", low, high, mid });
      return events;
    }
    if (relation === "lt") {
      low = mid + 1;
      events.push({ kind: "moveLow", low, high, mid });
    } else {
      high = mid - 1;
      events.push({ kind: "moveHigh", low, high, mid });
    }
  }
  events.push({ kind: "notFound", low, high });
  return events;
}

export function binarySearchResult(values: readonly number[], target: number): number {
  const last = traceBinarySearch(values, target).at(-1)!;
  return last.kind === "found" ? last.mid : -1;
}

const LINES: Record<TraceEvent["kind"], number[]> = {
  init: [2],
  mid: [3, 4],
  compare: [5],
  found: [6],
  moveLow: [7, 8],
  moveHigh: [9, 10],
  notFound: [3, 11],
};

function sceneFor(values: readonly number[], target: number, e: TraceEvent): Scene {
  const mid = "mid" in e ? e.mid : undefined;
  const cells = values.map((v, i) => {
    let tone: Tone = i < e.low || i > e.high ? "muted" : "default";
    if (mid === i) {
      tone = e.kind === "found" ? "success" : e.kind === "compare" || e.kind === "mid" ? "compare" : tone;
    }
    return { id: `cell-${i}`, value: v, tone };
  });
  const inRange = (i: number) => i >= 0 && i < values.length;
  const pointers: { id: string; label: string; index: number; tone: Tone }[] = [];
  if (inRange(e.low)) pointers.push({ id: "ptr-low", label: "low", index: e.low, tone: "active" });
  if (inRange(e.high)) pointers.push({ id: "ptr-high", label: "high", index: e.high, tone: "active" });
  if (mid !== undefined && e.kind !== "moveLow" && e.kind !== "moveHigh")
    pointers.push({ id: "ptr-mid", label: "mid", index: mid, tone: e.kind === "found" ? "success" : "compare" });

  const status =
    e.kind === "found"
      ? `Found ${target} at index ${e.mid}`
      : e.kind === "notFound"
        ? `${target} is not in the array → return -1`
        : e.low > e.high
          ? `Search range is empty (low=${e.low} > high=${e.high})`
          : `Searching indices ${e.low}…${e.high} for ${target}`;

  let focus: string[];
  if (mid !== undefined && (e.kind === "mid" || e.kind === "compare" || e.kind === "found")) focus = [`cell-${mid}`];
  else if (e.kind === "moveLow" && inRange(e.low)) focus = ["ptr-low"];
  else if (e.kind === "moveHigh" && inRange(e.high)) focus = ["ptr-high"];
  else if (e.kind === "init") focus = ["arr"];
  else focus = ["status"];

  return {
    version: 1,
    fidelity: "verified",
    layout: "column",
    focus,
    elements: [
      {
        type: "array",
        id: "arr",
        title: `arr (target = ${target})`,
        cells,
        pointers,
        showIndices: true,
      },
      { type: "text", id: "status", text: status, tone: e.kind === "found" ? "success" : e.kind === "notFound" ? "warning" : "default" },
    ],
    arrows: [],
  };
}

function narrate(values: readonly number[], target: number, e: TraceEvent): { objective: string; narration: string } {
  const n = values.length;
  switch (e.kind) {
    case "init":
      return n === 0
        ? { objective: "Set up the search range", narration: `The array is empty, so low = 0 and high = len(arr) - 1 = -1. The range low…high contains nothing.` }
        : {
            objective: "Set up the search range",
            narration: `We start with the whole array as candidates: low = 0 and high = ${e.high}. Binary search only works because the values are sorted — that is what lets one comparison rule out half of them.`,
          };
    case "mid":
      return {
        objective: "Pick the middle candidate",
        narration: `low (${e.low}) ≤ high (${e.high}), so there are still candidates. mid = (${e.low} + ${e.high}) // 2 = ${e.mid}, and arr[${e.mid}] = ${values[e.mid]}.`,
      };
    case "compare": {
      const v = values[e.mid];
      const rel = e.relation === "eq" ? "equal to" : e.relation === "lt" ? "less than" : "greater than";
      return { objective: "Compare with the target", narration: `arr[${e.mid}] = ${v} is ${rel} the target ${target}.` };
    }
    case "found":
      return { objective: "Return the match", narration: `arr[${e.mid}] == ${target}, so we return index ${e.mid}. Done.` };
    case "moveLow":
      return {
        objective: "Discard the left half",
        narration: `Because ${values[e.mid]} < ${target} and the array is sorted, everything at index ${e.mid} and to its left is too small. low moves to mid + 1 = ${e.low}.`,
      };
    case "moveHigh":
      return {
        objective: "Discard the right half",
        narration: `Because ${values[e.mid]} > ${target} and the array is sorted, everything at index ${e.mid} and to its right is too big. high moves to mid - 1 = ${e.high}.`,
      };
    case "notFound":
      return {
        objective: "Conclude the target is absent",
        narration: `low (${e.low}) > high (${e.high}): no candidates remain, so ${target} is not in the array and we return -1.`,
      };
  }
}

const CHECK_OPTIONS = ["Found it — return mid", "Search right: low = mid + 1", "Search left: high = mid - 1"];

/** Worst-case comparisons for n sorted values with this midpoint rule: floor(log2 n) + 1. */
export function maxComparisons(n: number): number {
  return n <= 0 ? 0 : Math.floor(Math.log2(n)) + 1;
}

export function buildBinarySearchLesson(params: BinarySearchParams, opts: BuildOptions = {}): Lesson {
  const { values, target } = BinarySearchParamsSchema.parse(params);
  const events = traceBinarySearch(values, target);
  const text = mergeTeaching(BINARY_SEARCH_TEXT, opts.teaching);
  const n = values.length;
  const allLines = BINARY_SEARCH_CODE.split("\n").map((_, i) => i + 1);
  const plainArray = (title = "sorted values"): Scene => ({
    version: 1,
    fidelity: "verified",
    layout: "column",
    focus: ["arr"],
    elements: [
      { type: "array", id: "arr", title: `${title} (target = ${target})`, cells: values.map((v, i) => ({ id: `cell-${i}`, value: v })), pointers: [] },
      { type: "text", id: "status", text: n === 0 ? "No values at all." : `${n} values, smallest ${values[0]}, largest ${values[n - 1]}.` },
    ],
  });
  const steps: LessonStepInput[] = events.map((e, i) => {
    const { objective, narration } = narrate(values, target, e);
    const mid = "mid" in e ? e.mid : null;
    const step: LessonStepInput = {
      id: `bs-${i}`,
      objective,
      narration,
      highlightLines: LINES[e.kind],
      state: {
        low: e.low,
        high: e.high,
        mid,
        "arr[mid]": mid === null ? null : values[mid],
        target,
        result: e.kind === "found" ? e.mid : e.kind === "notFound" ? -1 : null,
      },
      scene: sceneFor(values, target, e),
    };
    if (e.kind === "mid") {
      const v = values[e.mid];
      const answerIndex = v === target ? 0 : v < target ? 1 : 2;
      step.checkpoint = {
        prompt: `arr[mid] = ${v} and target = ${target}. What happens next?`,
        options: CHECK_OPTIONS,
        answerIndex,
        explanation:
          answerIndex === 0
            ? "They are equal, so mid is the answer."
            : answerIndex === 1
              ? `${v} is too small; every value left of it is also too small, so the answer can only be to the right.`
              : `${v} is too big; every value right of it is also too big, so the answer can only be to the left.`,
      };
    }
    return step;
  });

  // ── Intuition before mechanics ───────────────────────────────────────────────
  const firstCompare = events.find((e) => e.kind === "compare");
  const preview: Scene = (() => {
    if (!firstCompare || firstCompare.kind !== "compare") return plainArray();
    const m = firstCompare.mid;
    const discard = (i: number) => (firstCompare.relation === "lt" ? i <= m : firstCompare.relation === "gt" ? i >= m : false);
    return {
      version: 1,
      fidelity: "verified",
      layout: "column",
      focus: [`cell-${m}`],
      elements: [
        {
          type: "array",
          id: "arr",
          title: `first look (target = ${target})`,
          cells: values.map((v, i) => ({ id: `cell-${i}`, value: v, tone: i === m ? (firstCompare.relation === "eq" ? "success" : "compare") : discard(i) ? "muted" : "default" })),
          pointers: [{ id: "ptr-mid", label: "mid", index: m, tone: "compare" }],
        },
        { type: "text", id: "status", text: "Greyed-out values are ruled out by one comparison." },
      ],
    };
  })();
  const previewNarration = (() => {
    if (!firstCompare || firstCompare.kind !== "compare") return `There is nothing to search here: the array is empty, so the answer will be -1 straight away.`;
    const m = firstCompare.mid;
    const v = values[m];
    if (firstCompare.relation === "eq") return `Here's the idea in one move: look at the middle value, ${v}. It is the target, so we'd be done after a single comparison.`;
    const ruledOut = firstCompare.relation === "lt" ? m + 1 : n - m;
    return `Here's the idea in one move: look at the middle value, ${v}. Since ${v} ${firstCompare.relation === "lt" ? "<" : ">"} ${target}, ${ruledOut} of the ${n} values are ruled out at once. Now let's watch it step by step, with the code.`;
  })();
  const intro: LessonStepInput[] = [
    { id: "bs-definition", phase: "definition", objective: "What binary search does", narration: text.definition, highlightLines: [1], state: { values: n, target }, scene: plainArray() },
    {
      id: "bs-why",
      phase: "why",
      objective: "Why it matters",
      narration: text.why,
      highlightLines: [],
      state: { values: n, "one by one (worst)": n, "binary search (worst)": maxComparisons(n) },
      scene: boxesScene(
        [
          { id: "linear", label: "Check one by one", detail: `up to ${n} comparisons here`, tone: "warning" },
          { id: "halve", label: "Halve each time", detail: `at most ${maxComparisons(n)} comparisons here`, tone: "success" },
        ],
        { focus: "halve", chain: false, note: "For 1,000,000 sorted values: up to 1,000,000 checks one by one, at most 20 with binary search." },
      ),
    },
    {
      id: "bs-analogy",
      phase: "analogy",
      objective: "Think of a dictionary",
      narration: analogyNarration(text),
      highlightLines: [],
      state: {},
      scene: boxesScene([
        { id: "open", label: "Open in the middle", detail: "e.g. at 'M'" },
        { id: "decide", label: "Before or after?", detail: "compare with your word" },
        { id: "keep", label: "Keep that half", detail: "repeat until found" },
      ]),
    },
    { id: "bs-preview", phase: "preview", objective: "The idea in one move", narration: previewNarration, highlightLines: [4, 5], state: { values: n, target }, scene: preview },
  ];

  const worst = maxComparisons(n);
  const { options, answerIndex } = numericOptions(worst, [n, Math.ceil(n / 2), worst * 2, worst - 1], n);
  const check: LessonStepInput | null =
    n === 0
      ? null
      : {
          id: "bs-check",
          phase: "check",
          objective: "Predict the worst case",
          narration: `One more prediction before we wrap up. Think about the slowest possible search on these ${n} values.`,
          highlightLines: [3],
          state: { values: n },
          scene: plainArray(),
          checkpoint: {
            prompt: `With ${n} sorted values, what is the most comparisons binary search can ever need?`,
            options,
            answerIndex,
            explanation: `Each comparison halves the range, so ${n} values need at most ⌊log₂ ${n}⌋ + 1 = ${worst} comparisons, whatever the target.`,
          },
        };
  const summary: LessonStepInput = {
    id: "bs-summary",
    phase: "summary",
    objective: "Summary",
    narration: summaryNarration(text),
    highlightLines: allLines,
    state: {},
    scene: boxesScene(
      [
        { id: "insight", label: "Key insight", detail: "halve the range each step", tone: "success" },
        { id: "when", label: "When to use", detail: "sorted data, random access", tone: "active" },
        { id: "mistake", label: "Common mistake", detail: "mixing loop styles", tone: "warning" },
      ],
      { chain: false },
    ),
  };

  const result = binarySearchResult(values, target);
  // Every engine output passes the same contract validation as model output.
  return LessonSchema.parse({
    schemaVersion: 1,
    // Bounded id (F15): a hash of the input instead of the raw values.
    id: `binary-search:${shortHash(values.join(","))}:${n}:${String(target).slice(0, 20)}${opts.depth === "quick" ? ":quick" : ""}`,
    capabilityId: "binary-search",
    title: `Binary search for ${target}`,
    summary:
      result >= 0
        ? `Find ${target} in a sorted array of ${values.length} values by halving the search range each step. It is found at index ${result}.`
        : `Search a sorted array of ${values.length} values for ${target} by halving the range each step. It is absent, so the search returns -1.`,
    fidelity: "verified",
    assumptions: ["Integer division (//) rounds down, so mid favours the left element in even-sized ranges."],
    code: { language: "python", source: BINARY_SEARCH_CODE },
    depth: opts.depth ?? "full",
    teaching: text,
    steps: composeSteps({ intro, walkthrough: steps, check, summary }, opts.depth),
  });
}
