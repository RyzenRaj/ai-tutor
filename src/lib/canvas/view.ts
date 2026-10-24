/**
 * Pure pan/zoom decisions for the teaching canvas (finding F1).
 * The board refits on lesson load and window resize only. While stepping it never
 * zooms in, and zooms out only when new content would not fit — so the board does
 * not jump scale between steps.
 */

export type View = { x: number; y: number; k: number };
export type Size = { w: number; h: number };
export type FitInput = { viewport: Size; content: Size; narrow: boolean; toolbar: number };
export type ViewReason = "load" | "resize" | "step";

export const MIN_K = 0.3;
export const MAX_K = 2.5;
const MAX_FIT_K = 1.2;
/** Height-fitting may shrink the board to no less than this share of the width fit (keeps text readable). */
const MIN_HEIGHT_FIT_SHARE = 0.85;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function fitView({ viewport, content, narrow, toolbar }: FitInput): View {
  const W = Math.max(1, content.w);
  const H = Math.max(1, content.h);
  const vw = Math.max(1, viewport.w);
  const vh = Math.max(1, viewport.h);
  const widthFit = vw / W;
  const raw = narrow ? widthFit : Math.min(MAX_FIT_K, widthFit, Math.max((vh - toolbar) / H, MIN_HEIGHT_FIT_SHARE * widthFit));
  const k = clamp(raw, MIN_K, MAX_K);
  return { k, x: (vw - W * k) / 2, y: narrow ? toolbar : Math.max(toolbar, (vh - H * k) / 2) };
}

/** Returns the view to move to, or null to keep the current one. */
export function planView(input: FitInput & { current: View; reason: ViewReason }): View | null {
  const target = fitView(input);
  if (input.reason !== "step") return target;
  // Step change: keep scale unless the board now overflows the viewport.
  const bottom = input.current.y + input.content.h * input.current.k;
  const overflows = bottom > input.viewport.h + 1;
  if (!overflows || target.k >= input.current.k - 0.001) return null;
  return { k: target.k, x: (input.viewport.w - input.content.w * target.k) / 2, y: Math.min(input.current.y, target.y) };
}
