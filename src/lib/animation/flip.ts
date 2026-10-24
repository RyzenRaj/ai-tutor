/**
 * Interruptible FLIP planning (finding F3). Pure and time-injected so it is unit-testable.
 *
 * Each animated element is tracked as a "flight" (from → to over a duration). When the step
 * changes mid-flight, the next animation starts from where the element *currently is on
 * screen* (interpolated), not from its previous layout position — so reversing or skipping
 * steps never teleports anything.
 */

export type Pt = { x: number; y: number };
export type Flight = { from: Pt; to: Pt; start: number; duration: number };
export type Tracked = Map<string, Flight>;
export type FlipPlan =
  | { id: string; kind: "none" }
  | { id: string; kind: "enter" }
  | { id: string; kind: "move"; dx: number; dy: number; duration: number };

/** One duration and one easing for every move, so steps feel consistent. */
export const FLIP_MS = 450;
/** Ease-in-out: starts and ends gently (no first-frame lurch). Used for both WAAPI and interpolation. */
export const EASE_MOVE = [0.4, 0, 0.2, 1] as const;
export const EASE_MOVE_CSS = `cubic-bezier(${EASE_MOVE.join(",")})`;
export const ENTER_MS = 250;

/** CSS cubic-bezier timing function (x1,y1,x2,y2), solved for y given time progress x. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sampleX = (s: number) => ((ax * s + bx) * s + cx) * s;
  const sampleY = (s: number) => ((ay * s + by) * s + cy) * s;
  const slopeX = (s: number) => (3 * ax * s + 2 * bx) * s + cx;
  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    // Newton–Raphson, then bisection as a fallback.
    let s = t;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(s) - t;
      if (Math.abs(err) < 1e-7) return sampleY(s);
      const d = slopeX(s);
      if (Math.abs(d) < 1e-7) break;
      s -= err / d;
    }
    let lo = 0, hi = 1;
    s = t;
    for (let i = 0; i < 40; i++) {
      const x = sampleX(s);
      if (Math.abs(x - t) < 1e-7) break;
      if (x < t) lo = s;
      else hi = s;
      s = (lo + hi) / 2;
    }
    return sampleY(s);
  };
}

const easeMove = cubicBezier(...EASE_MOVE);

export function positionAt(f: Flight, now: number, ease: (t: number) => number = easeMove): Pt {
  if (f.duration <= 0) return { ...f.to };
  const p = ease((now - f.start) / f.duration);
  if (p >= 1) return { ...f.to };
  if (p <= 0) return { ...f.from };
  return { x: f.from.x + (f.to.x - f.from.x) * p, y: f.from.y + (f.to.y - f.from.y) * p };
}

const still = (p: Pt, now: number): Flight => ({ from: { ...p }, to: { ...p }, start: now, duration: 0 });

export function planFlip(
  prev: Tracked,
  layout: Map<string, Pt>,
  now: number,
  opts: {
    reduceMotion: boolean;
    duration?: number;
    /** Exact on-screen positions read from running animations; falls back to interpolation. */
    visual?: Map<string, Pt>;
  },
): { plans: FlipPlan[]; tracked: Tracked } {
  const duration = opts.duration ?? FLIP_MS;
  const plans: FlipPlan[] = [];
  const tracked: Tracked = new Map();
  const firstRender = prev.size === 0;
  for (const [id, to] of layout) {
    const before = prev.get(id);
    if (!before) {
      plans.push({ id, kind: firstRender || opts.reduceMotion ? "none" : "enter" });
      tracked.set(id, still(to, now));
      continue;
    }
    const visual = opts.visual?.get(id) ?? positionAt(before, now);
    const dx = visual.x - to.x;
    const dy = visual.y - to.y;
    if (opts.reduceMotion || (Math.abs(dx) <= 0.5 && Math.abs(dy) <= 0.5)) {
      plans.push({ id, kind: "none" });
      tracked.set(id, still(to, now));
      continue;
    }
    plans.push({ id, kind: "move", dx, dy, duration });
    tracked.set(id, { from: visual, to: { ...to }, start: now, duration });
  }
  return { plans, tracked };
}
