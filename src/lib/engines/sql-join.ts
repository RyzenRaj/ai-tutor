import { z } from "zod";
import { type Lesson, type LessonStepInput, LessonSchema } from "@/lib/lesson/schema";
import type { SceneInput as Scene, LeafElementInput as SceneElement, Tone } from "@/lib/scene/schema";

/** Deterministic SQL JOIN engine (INNER / LEFT) with SQL NULL semantics. */

const Cell = z.union([z.string().max(40), z.number().finite(), z.null()]);
const Ident = z.string().regex(/^[a-z_][a-z0-9_]{0,29}$/i, "Use simple SQL identifiers");

const TableSchema = z
  .object({
    name: Ident,
    columns: z.array(Ident).min(1).max(5),
    rows: z.array(z.array(Cell)).max(8),
  })
  .refine((t) => t.rows.every((r) => r.length === t.columns.length), { message: "Every row must match the column count" })
  .refine((t) => new Set(t.columns).size === t.columns.length, { message: "Duplicate column names" });

export const SqlJoinParamsSchema = z
  .object({
    joinType: z.enum(["INNER", "LEFT"]),
    left: TableSchema,
    right: TableSchema,
    leftKey: Ident,
    rightKey: Ident,
  })
  .refine((p) => p.left.columns.includes(p.leftKey), { message: "leftKey must be a left column", path: ["leftKey"] })
  .refine((p) => p.right.columns.includes(p.rightKey), { message: "rightKey must be a right column", path: ["rightKey"] })
  .refine((p) => p.left.name !== p.right.name, { message: "Use two different table names" });
export type SqlJoinParams = z.infer<typeof SqlJoinParamsSchema>;
type Value = z.infer<typeof Cell>;

export const DEFAULT_SQL_JOIN: SqlJoinParams = {
  joinType: "INNER",
  left: {
    name: "employees",
    columns: ["emp_id", "name", "dept_id"],
    rows: [
      [1, "Asha", 10],
      [2, "Ravi", 20],
      [3, "Meera", 10],
      [4, "Kabir", null],
      [5, "Zoya", 30],
    ],
  },
  right: {
    name: "departments",
    columns: ["dept_id", "dept_name"],
    rows: [
      [10, "Data"],
      [20, "Search"],
      [40, "Ads"],
    ],
  },
  leftKey: "dept_id",
  rightKey: "dept_id",
};

/** SQL equality: NULL never equals anything (not even NULL). */
export function sqlEquals(a: Value, b: Value): boolean {
  if (a === null || b === null) return false;
  return a === b;
}

export type JoinOutput = { columns: string[]; rows: Value[][]; matches: number[][] };

export function computeJoin(p: SqlJoinParams): JoinOutput {
  const li = p.left.columns.indexOf(p.leftKey);
  const ri = p.right.columns.indexOf(p.rightKey);
  const rightKeep = p.right.columns.map((c, i) => ({ c, i })).filter((x) => x.i !== ri || p.leftKey !== p.rightKey);
  const columns = [
    ...p.left.columns.map((c) => `${alias(p).l}.${c}`),
    ...rightKeep.map((x) => `${alias(p).r}.${x.c}`),
  ];
  const rows: Value[][] = [];
  const matches: number[][] = [];
  for (const lrow of p.left.rows) {
    const m = p.right.rows.flatMap((rrow, j) => (sqlEquals(lrow[li], rrow[ri]) ? [j] : []));
    matches.push(m);
    for (const j of m) rows.push([...lrow, ...rightKeep.map((x) => p.right.rows[j][x.i])]);
    if (m.length === 0 && p.joinType === "LEFT") rows.push([...lrow, ...rightKeep.map(() => null)]);
  }
  return { columns, rows, matches };
}

function alias(p: SqlJoinParams) {
  const l = p.left.name[0].toLowerCase();
  let r = p.right.name[0].toLowerCase();
  if (r === l) r = `${r}2`;
  return { l, r };
}

export function sqlFor(p: SqlJoinParams): string {
  const { l, r } = alias(p);
  const keepRight = p.right.columns.filter((c) => c !== p.rightKey || p.leftKey !== p.rightKey);
  const select = [`${l}.*`, ...keepRight.map((c) => `${r}.${c}`)].join(", ");
  return [
    `SELECT ${select}`,
    `FROM ${p.left.name} ${l}`,
    `${p.joinType} JOIN ${p.right.name} ${r}`,
    `  ON ${l}.${p.leftKey} = ${r}.${p.rightKey};`,
  ].join("\n");
}

const fmt = (v: Value) => (v === null ? "NULL" : typeof v === "string" ? `'${v}'` : String(v));

export function buildSqlJoinLesson(params: SqlJoinParams): Lesson {
  const p = SqlJoinParamsSchema.parse(params);
  const out = computeJoin(p);
  const li = p.left.columns.indexOf(p.leftKey);
  const { l, r } = alias(p);

  const scene = (opts: {
    activeLeft?: number;
    compared?: boolean;
    outRows: number;
    newOut?: number[];
    caption: string;
  }): Scene => {
    const matches = opts.activeLeft !== undefined ? out.matches[opts.activeLeft] : [];
    const leftTable: SceneElement = {
      type: "table",
      id: "left",
      title: `${p.left.name} ${l}`,
      columns: p.left.columns,
      rows: p.left.rows.map((row, i) => ({
        id: `l-${i}`,
        cells: row,
        tone: (i === opts.activeLeft ? "active" : opts.activeLeft !== undefined && i < opts.activeLeft ? "muted" : "default") as Tone,
      })),
    };
    const rightTable: SceneElement = {
      type: "table",
      id: "right",
      title: `${p.right.name} ${r}`,
      columns: p.right.columns,
      rows: p.right.rows.map((row, j) => ({
        id: `r-${j}`,
        cells: row,
        tone: (opts.compared ? (matches.includes(j) ? "success" : "muted") : "default") as Tone,
      })),
    };
    const outTable: SceneElement = {
      type: "table",
      id: "out",
      title: "result",
      columns: out.columns,
      rows: out.rows.slice(0, opts.outRows).map((row, k) => ({
        id: `o-${k}`,
        cells: row,
        tone: (opts.newOut?.includes(k) ? "success" : "default") as Tone,
      })),
      emptyText: "No rows yet",
    };
    return {
      version: 1,
      fidelity: "verified",
      layout: "column",
      elements: [
        { type: "group", id: "inputs", direction: "row", children: [leftTable, rightTable] },
        outTable,
        { type: "text", id: "caption", text: opts.caption },
      ],
      arrows: opts.compared
        ? matches.map((j) => ({ id: `m-${opts.activeLeft}-${j}`, from: `l-${opts.activeLeft}`, to: `r-${j}`, label: "match", tone: "success" as Tone }))
        : [],
    };
  };

  const steps: LessonStepInput[] = [];
  steps.push({
    id: "join-intro",
    objective: "Read the query",
    narration: `${p.joinType} JOIN pairs each row of ${p.left.name} with every row of ${p.right.name} where ${l}.${p.leftKey} = ${r}.${p.rightKey}. ${
      p.joinType === "LEFT"
        ? `A LEFT JOIN also keeps left rows with no match, filling the right-side columns with NULL.`
        : `Rows without a match are dropped.`
    }`,
    highlightLines: [2, 3, 4],
    state: { joinType: p.joinType, leftRows: p.left.rows.length, rightRows: p.right.rows.length, outputRows: 0 },
    scene: scene({ outRows: 0, caption: `Inputs: ${p.left.rows.length} × ${p.right.rows.length} rows` }),
  });

  let emitted = 0;
  p.left.rows.forEach((lrow, i) => {
    const key = lrow[li];
    const m = out.matches[i];
    steps.push({
      id: `join-take-${i}`,
      objective: `Take ${p.left.name} row ${i + 1}`,
      narration: `Next left row: ${p.left.columns.map((c, k) => `${c} = ${fmt(lrow[k])}`).join(", ")}. Its join key is ${fmt(key)}.`,
      highlightLines: [2],
      state: { leftRow: i + 1, key: key === null ? null : key, outputRows: emitted },
      scene: scene({ activeLeft: i, outRows: emitted, caption: `Looking for ${r}.${p.rightKey} = ${fmt(key)}` }),
      checkpoint:
        p.right.rows.length > 0
          ? {
              prompt: `How many ${p.right.name} rows will match ${p.leftKey} = ${fmt(key)}?`,
              options: ["0", "1", "2 or more"],
              answerIndex: Math.min(m.length, 2),
              explanation:
                key === null
                  ? "NULL is never equal to anything in SQL — not even another NULL — so it cannot match."
                  : `${m.length} row(s) in ${p.right.name} have ${p.rightKey} = ${fmt(key)}.`,
            }
          : undefined,
    });
    const before = emitted;
    const added = m.length > 0 ? m.length : p.joinType === "LEFT" ? 1 : 0;
    emitted += added;
    const newOut = Array.from({ length: added }, (_, k) => before + k);
    const narration =
      key === null
        ? `The key is NULL. In SQL, NULL = anything is unknown (not true), so no row matches. ${
            p.joinType === "LEFT" ? "LEFT JOIN keeps the row and fills the right columns with NULL." : "INNER JOIN drops this row."
          }`
        : m.length === 0
          ? `No ${p.right.name} row has ${p.rightKey} = ${fmt(key)}. ${
              p.joinType === "LEFT" ? "LEFT JOIN keeps the row with NULLs on the right." : "INNER JOIN drops this row."
            }`
          : `${m.length} matching row${m.length > 1 ? "s" : ""} found, so ${m.length} output row${m.length > 1 ? "s are" : " is"} produced${
              m.length > 1 ? " — one left row can fan out into several results" : ""
            }.`;
    steps.push({
      id: `join-match-${i}`,
      objective: "Match on the join condition",
      narration,
      highlightLines: added > 0 ? [1, 4] : [4],
      state: { leftRow: i + 1, key: key === null ? null : key, matches: m.length, outputRows: emitted },
      scene: scene({ activeLeft: i, compared: true, outRows: emitted, newOut, caption: added > 0 ? `+${added} result row(s)` : "Row dropped" }),
    });
  });

  steps.push({
    id: "join-done",
    objective: "Inspect the result",
    narration: `The ${p.joinType} JOIN produced ${out.rows.length} row(s) from ${p.left.rows.length} left row(s).${
      p.joinType === "INNER" ? " Left rows without a match are absent; right rows nobody matched are also absent." : ""
    }`,
    highlightLines: [1, 2, 3, 4],
    state: { joinType: p.joinType, outputRows: out.rows.length },
    scene: scene({ outRows: out.rows.length, caption: `${out.rows.length} result row(s)` }),
  });

  // Every engine output passes the same contract validation as model output.
  return LessonSchema.parse({
    schemaVersion: 1,
    id: `sql-join:${p.joinType}:${p.left.name}:${p.right.name}`,
    capabilityId: "sql-join",
    title: `SQL ${p.joinType} JOIN`,
    summary: `See how ${p.joinType} JOIN combines ${p.left.name} and ${p.right.name} on ${p.leftKey} = ${p.rightKey}, row by row.`,
    fidelity: "verified",
    assumptions: [
      "Shown as a nested-loop comparison for clarity. Real databases may use hash or merge joins; the result rows are the same, though row order may differ without ORDER BY.",
    ],
    code: { language: "sql", source: sqlFor(p) },
    steps,
  });
}
