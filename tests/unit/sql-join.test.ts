import { describe, expect, it } from "vitest";
import { DEFAULT_SQL_JOIN, SqlJoinParamsSchema, buildSqlJoinLesson, computeJoin, sqlEquals, sqlFor } from "@/lib/engines/sql-join";

describe("SQL JOIN engine", () => {
  it("INNER JOIN keeps only matching rows", () => {
    const out = computeJoin(DEFAULT_SQL_JOIN);
    expect(out.columns).toEqual(["e.emp_id", "e.name", "e.dept_id", "d.dept_name"]);
    expect(out.rows).toEqual([
      [1, "Asha", 10, "Data"],
      [2, "Ravi", 20, "Search"],
      [3, "Meera", 10, "Data"],
    ]);
  });

  it("LEFT JOIN keeps unmatched and NULL-key rows with NULLs", () => {
    const out = computeJoin({ ...DEFAULT_SQL_JOIN, joinType: "LEFT" });
    expect(out.rows).toHaveLength(5);
    expect(out.rows[3]).toEqual([4, "Kabir", null, null]);
    expect(out.rows[4]).toEqual([5, "Zoya", 30, null]);
  });

  it("NULL never equals NULL", () => {
    expect(sqlEquals(null, null)).toBe(false);
    const out = computeJoin({
      joinType: "INNER",
      left: { name: "a", columns: ["k"], rows: [[null]] },
      right: { name: "b", columns: ["k"], rows: [[null]] },
      leftKey: "k",
      rightKey: "k",
    });
    expect(out.rows).toEqual([]);
  });

  it("fans out on duplicate keys and handles an empty right table", () => {
    const dup = computeJoin({
      joinType: "INNER",
      left: { name: "a", columns: ["k"], rows: [[1]] },
      right: { name: "b", columns: ["k", "v"], rows: [[1, "x"], [1, "y"]] },
      leftKey: "k",
      rightKey: "k",
    });
    expect(dup.rows).toEqual([
      [1, "x"],
      [1, "y"],
    ]);
    const empty = buildSqlJoinLesson({ ...DEFAULT_SQL_JOIN, right: { ...DEFAULT_SQL_JOIN.right, rows: [] } });
    expect(empty.steps.at(-1)!.state.outputRows).toBe(0);
    expect(empty.steps.every((s) => !s.checkpoint)).toBe(true);
  });

  it("rejects invalid params", () => {
    expect(SqlJoinParamsSchema.safeParse({ ...DEFAULT_SQL_JOIN, leftKey: "missing" }).success).toBe(false);
    expect(SqlJoinParamsSchema.safeParse({ ...DEFAULT_SQL_JOIN, left: { ...DEFAULT_SQL_JOIN.left, name: "x; DROP TABLE" } }).success).toBe(false);
    expect(SqlJoinParamsSchema.safeParse({ ...DEFAULT_SQL_JOIN, right: { ...DEFAULT_SQL_JOIN.right, rows: [[1]] } }).success).toBe(false);
  });

  it("final scene output table equals the computed result, and checkpoints are correct", () => {
    for (const joinType of ["INNER", "LEFT"] as const) {
      const params = { ...DEFAULT_SQL_JOIN, joinType };
      const lesson = buildSqlJoinLesson(params);
      const out = computeJoin(params);
      const last = lesson.steps.at(-1)!.scene.elements.find((e) => e.id === "out");
      expect(last?.type === "table" && last.rows.map((r) => r.cells)).toEqual(out.rows);
      lesson.steps
        .filter((s) => s.checkpoint)
        .forEach((s) => {
          const i = Number(s.id.split("-").at(-1));
          expect(s.checkpoint!.answerIndex).toBe(Math.min(out.matches[i].length, 2));
        });
      expect(lesson.code.source).toBe(sqlFor(params));
      expect(lesson.code.source).toContain(`${joinType} JOIN`);
    }
  });
});
