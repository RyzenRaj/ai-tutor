"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { LeafElement, Scene, SceneElement, Tone } from "@/lib/scene/schema";
import { toneStroke, toneSurface, toneText } from "./tones";
import { ENTER_MS, EASE_MOVE_CSS, FLIP_MS, planFlip, type Pt, type Tracked } from "@/lib/animation/flip";

const FLIP_ANIM = "scene-flip";
const ENTER_ANIM = "scene-enter";

/**
 * Renders a validated Scene as DOM + an SVG arrow overlay.
 * Elements with the same id across steps are the same DOM node, so movement is
 * animated with FLIP (measure → invert → play). Respects prefers-reduced-motion.
 */
export type LocalRect = { x: number; y: number; w: number; h: number };

/**
 * Layout box relative to `root`, from offsets. Unlike getBoundingClientRect this ignores CSS
 * transforms (canvas zoom and running FLIP animations), so measurements are always the
 * element's resting position in unzoomed board units.
 */
export function layoutBox(el: HTMLElement, root: HTMLElement): LocalRect | null {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== root) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  if (node !== root) return null;
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

/** The translate part of an element's current transform (includes running animations). */
function currentTranslate(el: HTMLElement): Pt | null {
  const t = getComputedStyle(el).transform;
  if (!t || t === "none" || typeof DOMMatrixReadOnly === "undefined") return null;
  const m = new DOMMatrixReadOnly(t);
  return { x: m.m41, y: m.m42 };
}

export type FocusInfo = { rect: LocalRect; settleMs: number };

const sameRect = (a: LocalRect, b: LocalRect) =>
  Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.w - b.w) < 0.5 && Math.abs(a.h - b.h) < 0.5;

export function SceneRenderer({ scene, onFocusRect }: { scene: Scene; onFocusRect?: (info: FocusInfo | null) => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const tracked = useRef<Tracked>(new Map());
  const [paths, setPaths] = useState<ArrowPath[]>([]);
  const [ring, setRing] = useState<FocusInfo | null>(null);
  const ringRef = useRef<FocusInfo | null>(null);
  const onFocusRef = useRef(onFocusRect);
  useLayoutEffect(() => {
    onFocusRef.current = onFocusRect;
  }, [onFocusRect]);

  // Arrows and the focus ring use resting (layout) geometry, so they are correct even
  // while elements are still gliding. `settleMs` delays the marker until motion ends (F4).
  const measure = useCallback(
    (settleMs = 0) => {
      const root = rootRef.current;
      if (!root) return;
      setPaths(computeArrowPaths(root, scene));
      const focusEl = scene.focus[0] ? root.querySelector<HTMLElement>(`[data-scene-id="${CSS.escape(scene.focus[0])}"]`) : null;
      const rect = focusEl ? layoutBox(focusEl, root) : null;
      const prev = ringRef.current;
      // A resize-triggered re-measure of the same target must not restart (or un-delay) the marker.
      if (prev && rect && sameRect(prev.rect, rect) && settleMs === 0) return;
      const info = rect ? { rect, settleMs } : null;
      ringRef.current = info;
      setRing(info);
      onFocusRef.current?.(info);
    },
    [scene],
  );

  // One canonical step → one FLIP pass. Obsolete animations are cancelled first, so rapid
  // navigation never stacks animations, and moves continue from the on-screen position (F3).
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const els = Array.from(root.querySelectorAll<HTMLElement>("[data-flip]"));
    const visual = new Map<string, Pt>();
    for (const el of els) {
      const running = el.getAnimations?.().filter((a) => a.id === FLIP_ANIM || a.id === ENTER_ANIM) ?? [];
      if (running.length === 0) continue;
      const id = el.dataset.flip!;
      const before = tracked.current.get(id);
      const t = running.some((a) => a.id === FLIP_ANIM) ? currentTranslate(el) : null;
      if (before && t) visual.set(id, { x: before.to.x + t.x, y: before.to.y + t.y });
      running.forEach((a) => a.cancel());
    }
    const layout = new Map<string, Pt>();
    const byId = new Map<string, HTMLElement>();
    for (const el of els) {
      const box = layoutBox(el, root);
      if (!box) continue;
      layout.set(el.dataset.flip!, { x: box.x, y: box.y });
      byId.set(el.dataset.flip!, el);
    }
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const { plans, tracked: next } = planFlip(tracked.current, layout, performance.now(), { reduceMotion, visual });
    tracked.current = next;
    let moved = false;
    for (const p of plans) {
      const el = byId.get(p.id);
      if (!el || typeof el.animate !== "function") continue;
      if (p.kind === "move") {
        moved = true;
        el.animate([{ transform: `translate(${p.dx}px, ${p.dy}px)` }, { transform: "translate(0px, 0px)" }], {
          duration: p.duration,
          easing: EASE_MOVE_CSS,
          id: FLIP_ANIM,
        });
      } else if (p.kind === "enter") {
        el.animate([{ opacity: 0, transform: "scale(0.85)" }, { opacity: 1, transform: "scale(1)" }], { duration: ENTER_MS, easing: "ease-out", id: ENTER_ANIM });
      }
    }
    measure(moved ? FLIP_MS : 0);
  }, [scene, measure]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure(0));
    ro.observe(root);
    return () => ro.disconnect();
  }, [measure]);

  return (
    <div ref={rootRef} className="relative min-w-0" data-testid="scene" data-fidelity={scene.fidelity}>
      <div className={`flex gap-10 ${scene.layout === "row" ? "flex-row flex-wrap items-start" : "flex-col"}`}>
        {scene.elements.map((el) => (
          <ElementView key={el.id} el={el} />
        ))}
      </div>
      <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
        <defs>
          {(Object.keys(toneStroke) as Tone[]).map((t) => (
            <marker key={t} id={`arrowhead-${t}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill={toneStroke[t]} />
            </marker>
          ))}
        </defs>
        {ring && (
          <path
            key={`${scene.focus[0]}:${ring.rect.x}:${ring.rect.y}`}
            data-testid="focus-ring"
            d={roughRect(ring.rect, 7)}
            style={{ animationDelay: `${150 + ring.settleMs}ms` }}
            fill="none"
            stroke="var(--teacher-ink)"
            strokeWidth={2.5}
            strokeLinecap="round"
            pathLength={1}
            className="draw-on"
          />
        )}
        {paths.map((p) => (
          <g key={p.id} className="scene-fade-in">
            <path d={p.d} fill="none" stroke={toneStroke[p.tone]} strokeWidth={2} markerEnd={`url(#arrowhead-${p.tone})`} />
            {p.label && (
              <text x={p.lx} y={p.ly} textAnchor="middle" dominantBaseline="middle" className="fill-slate-700 text-[11px] font-semibold dark:fill-slate-200" paintOrder="stroke" stroke="var(--board)" strokeWidth={4}>
                {p.label}
              </text>
            )}
          </g>
        ))}
      </svg>
      {scene.caption && <p className="mt-4 text-xs italic text-slate-500 dark:text-slate-400">{scene.caption}</p>}
      <p className="sr-only" aria-live="polite">
        {describeScene(scene)}
      </p>
    </div>
  );
}

/** A slightly wobbly rounded rectangle, like a marker circling something on a whiteboard. */
export function roughRect(r: LocalRect, pad: number): string {
  const x0 = r.x - pad, y0 = r.y - pad, x1 = r.x + r.w + pad, y1 = r.y + r.h + pad;
  const c = Math.min(14, (y1 - y0) / 2, (x1 - x0) / 2);
  const j = 2.5; // deterministic wobble
  return [
    `M${x0 + c},${y0 + 1}`,
    `Q${(x0 + x1) / 2},${y0 - j} ${x1 - c},${y0}`,
    `Q${x1 + 1},${y0 - 1} ${x1},${y0 + c}`,
    `Q${x1 + j},${(y0 + y1) / 2} ${x1 - 1},${y1 - c}`,
    `Q${x1},${y1 + 1} ${x1 - c},${y1}`,
    `Q${(x0 + x1) / 2},${y1 + j} ${x0 + c},${y1 - 1}`,
    `Q${x0 - 1},${y1} ${x0},${y1 - c}`,
    `Q${x0 - j},${(y0 + y1) / 2} ${x0 + 1},${y0 + c}`,
    `Q${x0},${y0 - 2} ${x0 + c + 10},${y0 - 1}`,
  ].join(" ");
}

function ElementView({ el }: { el: SceneElement }) {
  if (el.type === "group") {
    return (
      <section data-scene-id={el.id} aria-label={el.title}>
        {el.title && <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{el.title}</h4>}
        <div className={`flex ${el.direction === "row" ? "flex-row flex-wrap items-start gap-x-10 gap-y-4" : "flex-col gap-4"}`}>
          {el.children.map((c) => (
            <Leaf key={c.id} el={c} />
          ))}
        </div>
      </section>
    );
  }
  return <Leaf el={el} />;
}

function Leaf({ el }: { el: LeafElement }) {
  switch (el.type) {
    case "array":
      return <ArrayView el={el} />;
    case "table":
      return <TableView el={el} />;
    case "container":
      return (
        <div data-scene-id={el.id} className={`min-w-40 flex-1 rounded-lg border-2 p-3 transition-colors duration-300 ${toneSurface[el.tone]}`}>
          <div className="text-sm font-semibold">{el.title}</div>
          {el.subtitle && <div className="text-xs opacity-70">{el.subtitle}</div>}
          <ul className="mt-2 flex min-h-9 flex-wrap gap-1.5" aria-label={`${el.title} contents`}>
            {el.chips.map((c) => (
              <li key={c.id} data-flip={c.id} data-scene-id={c.id} className={`rounded-md border px-2 py-1 font-mono text-xs transition-colors duration-300 ${toneSurface[c.tone]}`}>
                {c.label}
              </li>
            ))}
          </ul>
        </div>
      );
    case "box":
      return (
        <div data-scene-id={el.id} data-flip={el.id} className={`min-w-28 max-w-56 rounded-xl border-2 px-4 py-3 text-center transition-colors duration-300 ${toneSurface[el.tone]}`}>
          <div className="font-semibold">{el.label}</div>
          {el.detail && <div className="mt-1 text-xs opacity-75">{el.detail}</div>}
        </div>
      );
    case "text":
      return (
        <p data-scene-id={el.id} className={`text-sm font-medium ${toneText[el.tone]}`}>
          {el.text}
        </p>
      );
  }
}

function ArrayView({ el }: { el: Extract<LeafElement, { type: "array" }> }) {
  const n = Math.max(el.cells.length, 1);
  const grid = { gridTemplateColumns: `repeat(${n}, minmax(1.9rem, 3.25rem))` };
  return (
    <figure data-scene-id={el.id} className="min-w-0 max-w-full overflow-x-auto pb-1">
      {el.title && <figcaption className="mb-2 font-mono text-sm text-slate-600 dark:text-slate-300">{el.title}</figcaption>}
      {el.cells.length === 0 ? (
        <div className="rounded-md border-2 border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500 dark:border-slate-700">[ ] — empty array</div>
      ) : (
        <>
          {el.showIndices && (
            <div className="grid gap-1" style={grid} aria-hidden="true">
              {el.cells.map((_, i) => (
                <div key={i} className="text-center font-mono text-[11px] text-slate-400">
                  {i}
                </div>
              ))}
            </div>
          )}
          <ol className="grid gap-1" style={grid} aria-label={el.title ?? "array"}>
            {el.cells.map((c, i) => (
              <li
                key={c.id}
                data-scene-id={c.id}
                data-tone={c.tone}
                aria-label={`index ${i}: ${c.value}${c.tone === "muted" ? " (eliminated)" : ""}`}
                className={`flex h-11 items-center justify-center rounded-md border-2 font-mono text-sm font-semibold transition-colors duration-300 ${toneSurface[c.tone]}`}
              >
                {c.value}
              </li>
            ))}
          </ol>
          <div className="mt-1 grid gap-1" style={grid}>
            {el.pointers.map((p, k) => (
              <div
                key={p.id}
                data-flip={p.id}
                data-scene-id={p.id}
                data-testid={`pointer-${p.label}`}
                data-index={p.index}
                style={{ gridColumn: p.index + 1, gridRow: 1 + (el.pointers.slice(0, k).filter((q) => q.index === p.index).length) }}
                className={`flex flex-col items-center font-mono text-xs font-bold ${toneText[p.tone]}`}
              >
                <span aria-hidden="true">▲</span>
                {p.label}
              </div>
            ))}
          </div>
        </>
      )}
    </figure>
  );
}

function TableView({ el }: { el: Extract<LeafElement, { type: "table" }> }) {
  return (
    <figure data-scene-id={el.id} className="min-w-0 flex-1 overflow-x-auto">
      {el.title && <figcaption className="mb-1 font-mono text-sm font-semibold text-slate-600 dark:text-slate-300">{el.title}</figcaption>}
      <table className="w-full border-separate border-spacing-y-1 font-mono text-xs">
        <thead>
          <tr>
            {el.columns.map((c) => (
              <th key={c} scope="col" className="px-2 text-left font-semibold text-slate-500 dark:text-slate-400">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {el.rows.length === 0 && (
            <tr>
              <td colSpan={el.columns.length} className="px-2 py-2 text-slate-400 italic">
                {el.emptyText ?? "No rows"}
              </td>
            </tr>
          )}
          {el.rows.map((r) => (
            <tr key={r.id} data-scene-id={r.id} data-flip={r.id} data-tone={r.tone} className="transition-colors duration-300">
              {r.cells.map((v, i) => (
                <td
                  key={i}
                  className={`border-y-2 px-2 py-1.5 first:rounded-l-md first:border-l-2 last:rounded-r-md last:border-r-2 ${toneSurface[r.tone]} ${v === null ? "italic opacity-60" : ""}`}
                >
                  {v === null ? "NULL" : String(v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

type ArrowPath = { id: string; d: string; tone: Tone; label?: string; lx: number; ly: number };

function computeArrowPaths(root: HTMLElement, scene: Scene): ArrowPath[] {
  // Resting, unzoomed, root-local coordinates (see layoutBox).
  const toLocal = (el: HTMLElement) => {
    const b = layoutBox(el, root);
    return b ? new DOMRect(b.x, b.y, b.w, b.h) : null;
  };
  const base = { left: 0, top: 0 };
  const find = (id: string) => root.querySelector<HTMLElement>(`[data-scene-id="${CSS.escape(id)}"]`);
  type Resolved = { a: Scene["arrows"][number]; f: DOMRect; t: DOMRect; vertical: boolean; down: boolean; right: boolean };
  const resolved: Resolved[] = [];
  for (const a of scene.arrows) {
    const fromEl = find(a.from);
    const toEl = find(a.to);
    if (!fromEl || !toEl) continue;
    const f = toLocal(fromEl);
    const t = toLocal(toEl);
    if (!f || !t) continue;
    // Stacked boxes (no vertical overlap) connect top/bottom; side-by-side boxes connect left/right.
    const vertical = t.top >= f.bottom - 1 || f.top >= t.bottom - 1;
    resolved.push({ a, f, t, vertical, down: t.top >= f.bottom - 1, right: t.left + t.width / 2 > f.left + f.width / 2 });
  }
  // Spread several arrows that leave/enter the same element so they do not overlap.
  const slot = (key: (r: Resolved) => string, r: Resolved, sortBy: (r: Resolved) => number) => {
    const group = resolved.filter((x) => key(x) === key(r)).sort((x, y) => sortBy(x) - sortBy(y));
    return (group.indexOf(r) + 1) / (group.length + 1);
  };
  return resolved.map((r) => {
    const { a, f, t } = r;
    let x1, y1, x2, y2, d;
    if (r.vertical) {
      x1 = f.left - base.left + f.width * slot((x) => `${x.a.from}:${x.vertical}`, r, (x) => x.t.left);
      x2 = t.left - base.left + t.width * slot((x) => `${x.a.to}:${x.vertical}`, r, (x) => x.f.left);
      y1 = (r.down ? f.bottom : f.top) - base.top;
      y2 = (r.down ? t.top - 2 : t.bottom + 2) - base.top;
      const my = (y1 + y2) / 2;
      d = `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`;
    } else {
      x1 = (r.right ? f.right : f.left) - base.left;
      x2 = (r.right ? t.left - 2 : t.right + 2) - base.left;
      y1 = f.top - base.top + f.height * slot((x) => `${x.a.from}:${x.vertical}`, r, (x) => x.t.top);
      y2 = t.top - base.top + t.height * slot((x) => `${x.a.to}:${x.vertical}`, r, (x) => x.f.top);
      const mx = (x1 + x2) / 2;
      d = `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
    }
    // Labels on very short arrows would sit on top of the content they connect.
    const long = Math.hypot(x2 - x1, y2 - y1) > 56;
    return { id: a.id, d, tone: a.tone, label: long ? a.label : undefined, lx: (x1 + x2) / 2, ly: (y1 + y2) / 2 };
  });
}

/** Plain-language summary for screen readers. */
function describeScene(scene: Scene): string {
  const parts: string[] = [];
  const visit = (el: SceneElement) => {
    if (el.type === "group") return el.children.forEach(visit);
    if (el.type === "array") parts.push(el.pointers.map((p) => `${p.label} at index ${p.index}`).join(", "));
    if (el.type === "text") parts.push(el.text);
  };
  scene.elements.forEach(visit);
  return parts.filter(Boolean).join(". ");
}
