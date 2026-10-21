"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Lesson, LessonStep } from "@/lib/lesson/schema";
import { SceneRenderer, type LocalRect } from "./SceneRenderer";
import { CheckpointCard } from "./CheckpointCard";

/**
 * The classroom: an infinite-feeling whiteboard (pan / zoom / pinch) where the tutor
 * draws the active step, writes the explanation as a note, circles what it is talking
 * about and draws an arrow from the note to it. The learner can draw on top.
 * Everything on the board derives from the same active LessonStep.
 */

type Tool = "hand" | "pen" | "highlighter" | "eraser";
type Stroke = { id: number; tool: "pen" | "highlighter"; color: string; d: string; points: [number, number][] };
type View = { x: number; y: number; k: number };

const MIN_K = 0.3;
const MAX_K = 2.5;
const TOOLBAR_CLEARANCE = 56; // keep the board title clear of the floating toolbar
const PEN_COLORS = ["#e11d48", "#2563eb", "#0f172a"];
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const pathOf = (pts: [number, number][]) =>
  pts.length === 1 ? `M${pts[0][0]},${pts[0][1]} l0.01,0` : pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

export function TeachingCanvas({ lesson, step, index, onOpenEditor }: { lesson: Lesson; step: LessonStep; index: number; onOpenEditor: () => void }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const sceneWrapRef = useRef<HTMLDivElement>(null);
  const noteRef = useRef<HTMLDivElement>(null);

  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const [narrow, setNarrow] = useState(false);
  const [tool, setTool] = useState<Tool>("hand");
  const [color, setColor] = useState(PEN_COLORS[0]);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [focusRect, setFocusRect] = useState<LocalRect | null>(null);
  const [callout, setCallout] = useState<string | null>(null);
  const userMoved = useRef(false);
  const viewRef = useRef(view);
  useLayoutEffect(() => {
    viewRef.current = view;
  }, [view]);

  // ── Fit the board to the viewport ────────────────────────────────────────────
  const fit = useCallback((onlyShrink: boolean) => {
    const vp = viewportRef.current;
    const w = worldRef.current;
    if (!vp || !w) return;
    const vw = vp.clientWidth;
    const vh = vp.clientHeight;
    const W = w.offsetWidth;
    const H = w.offsetHeight;
    const isNarrow = vw < 820;
    // Fit the width; shrink for height only down to 85% of that, so text stays readable
    // (anything taller can be panned to).
    const widthFit = vw / W;
    const k = clamp(isNarrow ? widthFit : Math.min(1.2, widthFit, Math.max((vh - TOOLBAR_CLEARANCE) / H, 0.85 * widthFit)), MIN_K, MAX_K);
    setView((v) => {
      if (onlyShrink && k >= v.k - 0.001) return v;
      return { k, x: (vw - W * k) / 2, y: isNarrow ? TOOLBAR_CLEARANCE : Math.max(TOOLBAR_CLEARANCE, (vh - H * k) / 2) };
    });
  }, []);

  useLayoutEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const ro = new ResizeObserver(() => {
      setNarrow(vp.clientWidth < 820);
      if (!userMoved.current) fit(false);
    });
    ro.observe(vp);
    return () => ro.disconnect();
  }, [fit]);

  // New step: keep the user's view if they moved; otherwise only zoom out if the board grew.
  useLayoutEffect(() => {
    if (!userMoved.current) fit(index === 0);
  }, [index, narrow, fit]);

  // ── Teacher's arrow from the note to the focused element ────────────────────
  const measureCallout = useCallback(() => {
    const world = worldRef.current;
    const wrap = sceneWrapRef.current;
    const note = noteRef.current;
    if (!world || !wrap || !note || !focusRect) return setCallout(null);
    const wb = world.getBoundingClientRect();
    const k = wb.width / (world.offsetWidth || 1) || 1;
    const sb = wrap.getBoundingClientRect();
    const nb = note.getBoundingClientRect();
    const ox = (sb.left - wb.left) / k;
    const oy = (sb.top - wb.top) / k;
    const n = { x: (nb.left - wb.left) / k, y: (nb.top - wb.top) / k, w: nb.width / k, h: nb.height / k };
    const f = { x: ox + focusRect.x - 9, y: oy + focusRect.y - 9, w: focusRect.w + 18, h: focusRect.h + 18 };
    // Route the marker so it does not cut through the drawing:
    // pointers (drawn under arrays) are approached from below, small items from above,
    // big regions from the side facing the note.
    const focusId = step.scene.focus[0] ?? "";
    const noteRight = n.x >= f.x + f.w;
    const x1 = noteRight ? n.x - 4 : n.x + 60;
    const y1 = noteRight ? n.y + 34 : n.y - 4;
    let d: string;
    if (noteRight && f.w > 300) {
      const x2 = f.x + f.w + 4, y2 = f.y + f.h / 2;
      const mx = (x1 + x2) / 2;
      d = `M${x1},${y1} C${mx},${y1 - 30} ${mx + 10},${y2 + 20} ${x2},${y2}`;
    } else if (focusId.startsWith("ptr-") || !noteRight) {
      const x2 = f.x + Math.min(f.w / 2, 120), y2 = f.y + f.h + 4;
      const below = Math.max(y1, y2) + 70;
      d = noteRight ? `M${x1},${y1} C${x1 - 60},${below} ${x2 + 60},${below} ${x2},${y2}` : `M${x1},${y1} C${x1 - 20},${(y1 + y2) / 2} ${x2 + 30},${(y1 + y2) / 2} ${x2},${y2}`;
    } else {
      const x2 = f.x + f.w / 2, y2 = f.y - 4;
      const above = Math.min(y1, y2) - 70;
      d = `M${x1},${y1} C${x1 - 80},${above} ${x2 + 60},${above} ${x2},${y2}`;
    }
    setCallout(d);
  }, [focusRect, step.scene.focus]);

  useLayoutEffect(() => {
    measureCallout();
    const note = noteRef.current;
    if (!note) return;
    const ro = new ResizeObserver(() => measureCallout());
    ro.observe(note);
    return () => ro.disconnect();
  }, [measureCallout, narrow, step.id]);

  // ── Pointer input: pan, pinch-zoom, ink ──────────────────────────────────────
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ kind: "pan" | "ink" | "erase" | "pinch"; strokeId?: number; dist?: number } | null>(null);
  const strokeSeq = useRef(0);

  const toWorld = (clientX: number, clientY: number): [number, number] => {
    const vp = viewportRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    return [(clientX - vp.left - v.x) / v.k, (clientY - vp.top - v.y) / v.k];
  };

  const zoomAt = useCallback((cx: number, cy: number, factor: number) => {
    userMoved.current = true;
    setView((v) => {
      const k = clamp(v.k * factor, MIN_K, MAX_K);
      return { k, x: cx - (cx - v.x) * (k / v.k), y: cy - (cy - v.y) * (k / v.k) };
    });
  }, []);

  const erase = (p: [number, number]) => {
    const r = 12 / viewRef.current.k;
    setStrokes((ss) => ss.filter((s) => !s.points.some(([x, y]) => Math.hypot(x - p[0], y - p[1]) < r)));
  };

  function onPointerDown(e: React.PointerEvent) {
    const target = e.target as HTMLElement;
    if (target.closest("[data-ui]")) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { kind: "pinch", dist: Math.hypot(a.x - b.x, a.y - b.y) };
      return;
    }
    if (tool === "hand") {
      if (target.closest("button, input, select, textarea, a, summary, label")) return; // let controls work
      gesture.current = { kind: "pan" };
    } else if (tool === "eraser") {
      gesture.current = { kind: "erase" };
      erase(toWorld(e.clientX, e.clientY));
    } else {
      const id = ++strokeSeq.current;
      const p = toWorld(e.clientX, e.clientY);
      setStrokes((ss) => [...ss, { id, tool, color: tool === "highlighter" ? "#facc15" : color, points: [p], d: pathOf([p]) }]);
      gesture.current = { kind: "ink", strokeId: id };
    }
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    e.preventDefault();
  }

  function onPointerMove(e: React.PointerEvent) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev || !gesture.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (g.kind === "pinch" && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const vp = viewportRef.current!.getBoundingClientRect();
      if (g.dist) zoomAt((a.x + b.x) / 2 - vp.left, (a.y + b.y) / 2 - vp.top, dist / g.dist);
      g.dist = dist;
    } else if (g.kind === "pan") {
      userMoved.current = true;
      setView((v) => ({ ...v, x: v.x + e.clientX - prev.x, y: v.y + e.clientY - prev.y }));
    } else if (g.kind === "erase") {
      erase(toWorld(e.clientX, e.clientY));
    } else if (g.kind === "ink") {
      const p = toWorld(e.clientX, e.clientY);
      setStrokes((ss) =>
        ss.map((s) => {
          if (s.id !== g.strokeId) return s;
          const last = s.points[s.points.length - 1];
          if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 1.5) return s;
          const points = [...s.points, p];
          return { ...s, points, d: pathOf(points) };
        }),
      );
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) gesture.current = null;
  }

  // Wheel: scroll pans, Ctrl/⌘ + wheel (and trackpad pinch) zooms.
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = vp.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.01));
      else {
        userMoved.current = true;
        setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
      }
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  // Keyboard: + / - zoom, 0 fits. (Step keys live in Workspace.)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const vp = viewportRef.current;
      if (!vp) return;
      if (e.key === "+" || e.key === "=") zoomAt(vp.clientWidth / 2, vp.clientHeight / 2, 1.2);
      else if (e.key === "-") zoomAt(vp.clientWidth / 2, vp.clientHeight / 2, 1 / 1.2);
      else if (e.key === "0") {
        userMoved.current = false;
        fit(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomAt, fit]);

  const codeLines = lesson.code.source.split("\n");
  const shownLines = step.highlightLines.slice(0, 2);
  const stateEntries = Object.entries(step.state);
  const verified = lesson.fidelity === "verified";

  return (
    <div
      ref={viewportRef}
      data-testid="canvas"
      data-zoom={view.k.toFixed(2)}
      className={`board-grid relative h-full w-full touch-none overflow-hidden select-none ${tool === "hand" ? "cursor-grab active:cursor-grabbing" : tool === "eraser" ? "cursor-cell" : "cursor-crosshair"}`}
      style={{ backgroundPosition: `${view.x}px ${view.y}px`, backgroundSize: `${24 * view.k}px ${24 * view.k}px` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      role="application"
      aria-label="Teaching canvas. Drag to pan, Ctrl+scroll or pinch to zoom."
    >
      <div
        ref={worldRef}
        className={`absolute top-0 left-0 origin-top-left p-10 ${narrow ? "w-[680px]" : "w-[1220px]"}`}
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}
      >
        <header className="mb-8 flex items-baseline gap-4">
          <span className="rounded-full bg-[var(--teacher-ink)] px-3 py-1 font-mono text-sm font-bold text-white">
            {index + 1}/{lesson.steps.length}
          </span>
          <h3 className="font-hand text-4xl leading-none text-slate-800 dark:text-slate-100" data-testid="board-title">
            {step.objective}
          </h3>
        </header>

        <div className={`grid items-start gap-x-24 gap-y-14 ${narrow ? "grid-cols-1" : "grid-cols-[720px_340px]"}`}>
          <div ref={sceneWrapRef} className="min-w-0">
            <SceneRenderer scene={step.scene} onFocusRect={setFocusRect} />
          </div>

          <div className="flex flex-col gap-6">
            <div ref={noteRef} className="note-paper relative -rotate-1 rounded-sm px-6 pt-5 pb-6 shadow-lg" data-testid="narration">
              <div className="absolute -top-3 left-1/2 h-6 w-20 -translate-x-1/2 rotate-2 bg-amber-200/70 dark:bg-amber-200/30" aria-hidden="true" />
              <HandNote key={`${lesson.id}:${step.id}`} text={step.narration} />
            </div>

            {step.checkpoint && (
              <div className="rotate-[0.5deg]">
                <CheckpointCard key={`${lesson.id}:${step.id}`} checkpoint={step.checkpoint} />
              </div>
            )}

            {stateEntries.length > 0 && (
              <section aria-label="Variables" data-testid="state" className="rounded-lg border-2 border-dashed border-slate-400/70 px-5 py-3 dark:border-slate-500/70">
                <dl className={`grid gap-x-6 gap-y-0.5 font-hand text-2xl ${stateEntries.some(([k]) => k.length > 10) ? "grid-cols-1" : "grid-cols-2"}`}>
                  {stateEntries.map(([k, v]) => (
                    <div key={k} className="flex gap-2 truncate">
                      <dt className="text-slate-500 dark:text-slate-400">{k} =</dt>
                      <dd data-var={k} className="font-bold text-slate-800 dark:text-slate-100">
                        {v === null ? "—" : String(v)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            {shownLines.length > 0 && (
              <button
                type="button"
                onClick={onOpenEditor}
                data-testid="code-line"
                data-lines={step.highlightLines.join(",")}
                title="Open the full code in the Editor"
                className="group rounded-lg bg-slate-900 px-3 py-2 text-left font-mono text-xs text-slate-200 shadow hover:ring-2 hover:ring-amber-400"
              >
                {shownLines.map((l) => (
                  <div key={l} className="flex gap-3 truncate">
                    <span className="text-amber-400">{l}</span>
                    <span className="truncate whitespace-pre">{codeLines[l - 1]?.trim()}</span>
                  </div>
                ))}
                <div className="mt-1 text-[10px] text-slate-400 group-hover:text-amber-300">
                  {step.highlightLines.length > 2 ? `+${step.highlightLines.length - 2} more · ` : ""}open in Editor →
                </div>
              </button>
            )}
          </div>
        </div>

        <p className="mt-10 font-hand text-xl text-slate-500 dark:text-slate-400">
          {verified ? "✓ verified simulation — every step computed by code" : "✎ illustrative sketch — not a simulation"}
        </p>

        {/* Teacher's callout arrow, drawn on each step */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
          <defs>
            <marker id="teacher-head" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
              <path d="M1,1 L11,6 L1,11" fill="none" stroke="var(--teacher-ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </marker>
          </defs>
          {callout && (
            <path
              key={`${step.id}:${callout}`}
              data-testid="callout"
              d={callout}
              fill="none"
              stroke="var(--teacher-ink)"
              strokeWidth={2.5}
              strokeLinecap="round"
              markerEnd="url(#teacher-head)"
              pathLength={1}
              className="draw-on"
            />
          )}
        </svg>

        {/* Learner ink */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" data-testid="ink-layer" aria-hidden="true">
          {strokes.map((s) => (
            <path
              key={s.id}
              d={s.d}
              fill="none"
              stroke={s.color}
              strokeWidth={s.tool === "highlighter" ? 18 : 3}
              strokeOpacity={s.tool === "highlighter" ? 0.35 : 1}
              strokeLinecap="round"
              strokeLinejoin="round"
              data-stroke={s.tool}
            />
          ))}
        </svg>
      </div>

      <Toolbar
        tool={tool}
        setTool={setTool}
        color={color}
        setColor={setColor}
        zoom={view.k}
        hasInk={strokes.length > 0}
        onClear={() => setStrokes([])}
        onZoom={(f) => {
          const vp = viewportRef.current!;
          zoomAt(vp.clientWidth / 2, vp.clientHeight / 2, f);
        }}
        onFit={() => {
          userMoved.current = false;
          fit(false);
        }}
      />
    </div>
  );
}

/** Narration "written" onto the board. Full text is in the DOM from the start (stable layout, screen readers). */
function HandNote({ text }: { text: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const per = Math.max(2, Math.ceil(text.length / 45)); // ≈ 0.9 s total
    const id = setInterval(
      () =>
        setN((c) => {
          const next = reduce ? text.length : c + per;
          if (next >= text.length) clearInterval(id);
          return Math.min(next, text.length);
        }),
      20,
    );
    return () => clearInterval(id);
  }, [text]);
  return (
    <p className="font-hand text-[26px] leading-[1.25] text-slate-800 dark:text-slate-900">
      <span>{text.slice(0, n)}</span>
      <span className="opacity-0">{text.slice(n)}</span>
    </p>
  );
}

function Toolbar(props: {
  tool: Tool;
  setTool: (t: Tool) => void;
  color: string;
  setColor: (c: string) => void;
  zoom: number;
  hasInk: boolean;
  onClear: () => void;
  onZoom: (factor: number) => void;
  onFit: () => void;
}) {
  const tools: { id: Tool; label: string; icon: string }[] = [
    { id: "hand", label: "Move board", icon: "✋" },
    { id: "pen", label: "Pen", icon: "✎" },
    { id: "highlighter", label: "Highlighter", icon: "▍" },
    { id: "eraser", label: "Eraser", icon: "⌫" },
  ];
  const btn = "flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-sky-500";
  return (
    <div data-ui className="absolute top-3 left-3 flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white/95 p-1 shadow-md backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
      {tools.map((t) => (
        <button
          key={t.id}
          type="button"
          aria-label={t.label}
          title={t.label}
          aria-pressed={props.tool === t.id}
          onClick={() => props.setTool(t.id)}
          className={`${btn} ${props.tool === t.id ? "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-100" : ""}`}
        >
          {t.icon}
        </button>
      ))}
      {props.tool === "pen" &&
        PEN_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Pen colour ${c}`}
            aria-pressed={props.color === c}
            onClick={() => props.setColor(c)}
            className={`h-6 w-6 rounded-full border-2 ${props.color === c ? "border-sky-500" : "border-transparent"}`}
            style={{ background: c }}
          />
        ))}
      <button type="button" className={btn} onClick={props.onClear} disabled={!props.hasInk} aria-label="Clear my drawings" title="Clear my drawings">
        🗑
      </button>
      <span className="mx-1 h-6 w-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
      <button type="button" className={btn} onClick={() => props.onZoom(1 / 1.2)} aria-label="Zoom out" title="Zoom out (−)">
        −
      </button>
      <span className="w-12 text-center font-mono text-xs" data-testid="zoom-level">
        {Math.round(props.zoom * 100)}%
      </span>
      <button type="button" className={btn} onClick={() => props.onZoom(1.2)} aria-label="Zoom in" title="Zoom in (+)">
        +
      </button>
      <button type="button" className={btn} onClick={props.onFit} aria-label="Fit board to screen" title="Fit (0)">
        ⤢
      </button>
    </div>
  );
}
