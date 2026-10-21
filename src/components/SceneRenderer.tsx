"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { LeafElement, Scene, SceneElement, Tone } from "@/lib/scene/schema";
import { toneStroke, toneSurface, toneText } from "./tones";

/**
 * Renders a validated Scene as DOM + an SVG arrow overlay.
 * Elements with the same id across steps are the same DOM node, so movement is
 * animated with FLIP (measure → invert → play). Respects prefers-reduced-motion.
 */
export function SceneRenderer({ scene }: { scene: Scene }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const prevRects = useRef(new Map<string, { x: number; y: number }>());
  const [paths, setPaths] = useState<ArrowPath[]>([]);

  const measureArrows = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    setPaths(computeArrowPaths(root, scene));
  }, [scene]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const base = root.getBoundingClientRect();
    const next = new Map<string, { x: number; y: number }>();
    root.querySelectorAll<HTMLElement>("[data-flip]").forEach((el) => {
      const id = el.dataset.flip!;
      const r = el.getBoundingClientRect();
      const pos = { x: r.left - base.left, y: r.top - base.top };
      next.set(id, pos);
      if (reduce || typeof el.animate !== "function") return;
      const prev = prevRects.current.get(id);
      if (prev) {
        const dx = prev.x - pos.x;
        const dy = prev.y - pos.y;
        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
          el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }], {
            duration: 550,
            easing: "cubic-bezier(.2,.8,.2,1)",
          });
        }
      } else if (prevRects.current.size > 0) {
        el.animate([{ opacity: 0, transform: "scale(0.85)" }, { opacity: 1, transform: "scale(1)" }], { duration: 300, easing: "ease-out" });
      }
    });
    prevRects.current = next;
    measureArrows();
  }, [scene, measureArrows]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measureArrows());
    ro.observe(root);
    return () => ro.disconnect();
  }, [measureArrows]);

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
        {paths.map((p) => (
          <g key={p.id} className="scene-fade-in">
            <path d={p.d} fill="none" stroke={toneStroke[p.tone]} strokeWidth={2} markerEnd={`url(#arrowhead-${p.tone})`} />
            {p.label && (
              <text x={p.lx} y={p.ly} textAnchor="middle" dominantBaseline="middle" className="fill-slate-700 text-[11px] font-semibold dark:fill-slate-200" paintOrder="stroke" stroke="var(--background)" strokeWidth={4}>
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
  const base = root.getBoundingClientRect();
  const find = (id: string) => root.querySelector<HTMLElement>(`[data-scene-id="${CSS.escape(id)}"]`);
  type Resolved = { a: Scene["arrows"][number]; f: DOMRect; t: DOMRect; vertical: boolean; down: boolean; right: boolean };
  const resolved: Resolved[] = [];
  for (const a of scene.arrows) {
    const fromEl = find(a.from);
    const toEl = find(a.to);
    if (!fromEl || !toEl) continue;
    const f = fromEl.getBoundingClientRect();
    const t = toEl.getBoundingClientRect();
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
