import { describe, expect, it } from "vitest";
import { planView, fitView, type View } from "@/lib/canvas/view";

const wide = { viewport: { w: 1440, h: 700 }, content: { w: 1220, h: 600 }, narrow: false, toolbar: 56 };

describe("canvas view planning (F1)", () => {
  it("fits width on load, capped at 1.2× and never below 85% of the width fit for height", () => {
    const v = fitView(wide);
    expect(v.k).toBeCloseTo(Math.min(1.2, 1440 / 1220, Math.max((700 - 56) / 600, 0.85 * (1440 / 1220))), 5);
    expect(v.x).toBeCloseTo((1440 - 1220 * v.k) / 2, 5);
    expect(v.y).toBeGreaterThanOrEqual(56);
  });

  it("does not change the view on a step when content still fits", () => {
    const current = fitView(wide);
    expect(planView({ ...wide, current, reason: "step" })).toBeNull();
  });

  it("never zooms in on a step even if content got smaller", () => {
    const current: View = { x: 0, y: 56, k: 0.9 };
    expect(planView({ ...wide, content: { w: 1220, h: 300 }, current, reason: "step" })).toBeNull();
  });

  it("only shrinks on a step when the content overflows, keeping x/y anchored sensibly", () => {
    const current = fitView(wide);
    const taller = { ...wide, content: { w: 1220, h: 1100 } };
    const next = planView({ ...taller, current, reason: "step" });
    expect(next).not.toBeNull();
    expect(next!.k).toBeLessThan(current.k);
    expect(next!.k).toBeGreaterThanOrEqual(0.85 * (1440 / 1220) - 1e-9);
  });

  it("refits fully on load and resize", () => {
    const current: View = { x: 123, y: 456, k: 2 };
    expect(planView({ ...wide, current, reason: "load" })).toEqual(fitView(wide));
    expect(planView({ ...wide, current, reason: "resize" })).toEqual(fitView(wide));
  });

  it("fits narrow screens to width only", () => {
    const narrow = { viewport: { w: 400, h: 700 }, content: { w: 680, h: 2000 }, narrow: true, toolbar: 56 };
    expect(fitView(narrow).k).toBeCloseTo(400 / 680, 5);
  });

  it("is safe with zero-size inputs (hidden tab, unmounted)", () => {
    const v = fitView({ ...wide, viewport: { w: 0, h: 0 }, content: { w: 0, h: 0 } });
    expect(Number.isFinite(v.k) && Number.isFinite(v.x) && Number.isFinite(v.y)).toBe(true);
  });
});
