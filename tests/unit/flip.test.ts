import { describe, expect, it } from "vitest";
import { EASE_MOVE, FLIP_MS, cubicBezier, planFlip, positionAt, type Flight } from "@/lib/animation/flip";

const pt = (x: number, y = 0) => ({ x, y });

describe("cubicBezier", () => {
  it("hits the endpoints and is monotonic for the move easing", () => {
    const e = cubicBezier(...EASE_MOVE);
    expect(e(0)).toBe(0);
    expect(e(1)).toBe(1);
    let prev = 0;
    for (let t = 0.05; t <= 1; t += 0.05) {
      const v = e(t);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = v;
    }
  });
  it("matches the linear curve when control points are on the diagonal", () => {
    const lin = cubicBezier(0.25, 0.25, 0.75, 0.75);
    for (const t of [0.1, 0.33, 0.5, 0.9]) expect(lin(t)).toBeCloseTo(t, 4);
  });
  it("clamps out-of-range time", () => {
    const e = cubicBezier(...EASE_MOVE);
    expect(e(-1)).toBe(0);
    expect(e(2)).toBe(1);
  });
});

describe("positionAt", () => {
  const f: Flight = { from: pt(0), to: pt(100), start: 1000, duration: 400 };
  it("is at `from` at start, `to` when finished, in between mid-flight", () => {
    expect(positionAt(f, 1000)).toEqual(pt(0));
    expect(positionAt(f, 1400)).toEqual(pt(100));
    expect(positionAt(f, 5000)).toEqual(pt(100));
    const mid = positionAt(f, 1200).x;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(100);
  });
  it("handles zero-duration (static) flights", () => {
    expect(positionAt({ from: pt(5), to: pt(5), start: 0, duration: 0 }, 0)).toEqual(pt(5));
  });
});

describe("planFlip", () => {
  it("first render: no animations, everything tracked as static", () => {
    const { plans, tracked } = planFlip(new Map(), new Map([["a", pt(10)]]), 0, { reduceMotion: false });
    expect(plans).toEqual([{ id: "a", kind: "none" }]);
    expect(positionAt(tracked.get("a")!, 999)).toEqual(pt(10));
  });

  it("moves an element from its previous position to the new layout", () => {
    const prev = new Map([["a", { from: pt(0), to: pt(0), start: 0, duration: 0 }]]);
    const { plans, tracked } = planFlip(prev, new Map([["a", pt(100)]]), 1000, { reduceMotion: false });
    expect(plans).toEqual([{ id: "a", kind: "move", dx: -100, dy: 0, duration: FLIP_MS }]);
    expect(tracked.get("a")).toEqual({ from: pt(0), to: pt(100), start: 1000, duration: FLIP_MS });
  });

  it("interrupted flight starts from the current visual position, not the old layout", () => {
    // a was gliding 0 → 100; halfway through, the step changes back to layout 0.
    const prev = new Map([["a", { from: pt(0), to: pt(100), start: 1000, duration: 400 }]]);
    const now = 1200;
    const visual = positionAt(prev.get("a")!, now);
    const { plans } = planFlip(prev, new Map([["a", pt(0)]]), now, { reduceMotion: false });
    const move = plans[0];
    expect(move.kind).toBe("move");
    if (move.kind !== "move") throw new Error();
    expect(move.dx).toBeCloseTo(visual.x - 0, 6); // starts exactly where it is on screen
    expect(Math.abs(move.dx)).toBeLessThan(100); // not from the old layout position (100)
  });

  it("prefers a measured on-screen position over interpolation when one is available", () => {
    const prev = new Map([["a", { from: pt(0), to: pt(100), start: 1000, duration: 400 }]]);
    const { plans, tracked } = planFlip(prev, new Map([["a", pt(0)]]), 1200, { reduceMotion: false, visual: new Map([["a", pt(37)]]) });
    expect(plans[0]).toEqual({ id: "a", kind: "move", dx: 37, dy: 0, duration: FLIP_MS });
    expect(tracked.get("a")!.from).toEqual(pt(37));
  });

  it("new elements enter (fade) only after the first render; removed elements are forgotten", () => {
    const prev = new Map([["a", { from: pt(0), to: pt(0), start: 0, duration: 0 }]]);
    const { plans, tracked } = planFlip(prev, new Map([["b", pt(5)]]), 10, { reduceMotion: false });
    expect(plans).toEqual([{ id: "b", kind: "enter" }]);
    expect(tracked.has("a")).toBe(false);
  });

  it("reduced motion: never animates, still tracks positions", () => {
    const prev = new Map([["a", { from: pt(0), to: pt(0), start: 0, duration: 0 }]]);
    const { plans } = planFlip(prev, new Map([["a", pt(300)], ["b", pt(1)]]), 10, { reduceMotion: true });
    expect(plans.every((p) => p.kind === "none")).toBe(true);
  });

  it("ignores sub-pixel differences", () => {
    const prev = new Map([["a", { from: pt(10), to: pt(10), start: 0, duration: 0 }]]);
    expect(planFlip(prev, new Map([["a", pt(10.3)]]), 10, { reduceMotion: false }).plans[0].kind).toBe("none");
  });

  it("is deterministic for the same inputs (replay)", () => {
    const prev = new Map([["a", { from: pt(0), to: pt(50), start: 0, duration: 400 }]]);
    const layout = new Map([["a", pt(10)]]);
    expect(planFlip(prev, layout, 123, { reduceMotion: false })).toEqual(planFlip(prev, layout, 123, { reduceMotion: false }));
  });
});
