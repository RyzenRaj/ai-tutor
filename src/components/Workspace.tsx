"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { Lesson } from "@/lib/lesson/schema";
import { LessonSchema } from "@/lib/lesson/schema";
import { initPlayback, playbackReducer } from "@/lib/lesson/runtime";
import { buildLesson, getCapability } from "@/lib/registry";
import { BinarySearchParamsSchema } from "@/lib/engines/binary-search";
import { DEFAULT_SQL_JOIN } from "@/lib/engines/sql-join";
import { CodePanel } from "./CodePanel";
import { TeachingCanvas } from "./TeachingCanvas";
import { httpBackend, type TutorBackend, type TutorStatus } from "@/lib/client/backend";
import { PlaybackControls } from "./PlaybackControls";

type Source =
  | { kind: "builtin" }
  | { kind: "custom" }
  | { kind: "mock"; intro: string; notices: string[] }
  | { kind: "live"; model?: string; intro: string; notices: string[] };

type Status = TutorStatus | null;

const AUTOPLAY_MS = 1800;

const QUICK_PICKS: { label: string; build: () => Lesson }[] = [
  { label: "Binary search", build: () => buildLesson("binary-search", getCapability("binary-search")!.defaultParams) },
  { label: "Binary search (absent)", build: () => buildLesson("binary-search", { values: [2, 5, 9, 14, 20, 27], target: 10 }) },
  { label: "INNER JOIN", build: () => buildLesson("sql-join", DEFAULT_SQL_JOIN) },
  { label: "LEFT JOIN", build: () => buildLesson("sql-join", { ...DEFAULT_SQL_JOIN, joinType: "LEFT" }) },
  { label: "Spark shuffle", build: () => buildLesson("spark-shuffle", getCapability("spark-shuffle")!.defaultParams) },
];

export function Workspace({ initialLesson, backend = httpBackend }: { initialLesson: Lesson; backend?: TutorBackend }) {
  const [lesson, setLesson] = useState(initialLesson);
  const [source, setSource] = useState<Source>({ kind: "builtin" });
  const [pb, dispatch] = useReducer(playbackReducer, initialLesson.steps.length, initPlayback);
  const [pauseAtQuestions, setPauseAtQuestions] = useState(true);
  const [status, setStatus] = useState<Status>(null);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"canvas" | "editor">("canvas");
  const abortRef = useRef<AbortController | null>(null);

  const step = lesson.steps[Math.min(pb.index, lesson.steps.length - 1)];

  const loadLesson = useCallback((next: Lesson, src: Source) => {
    setLesson(next);
    setSource(src);
    setError(null);
    dispatch({ type: "load", stepCount: next.steps.length });
  }, []);

  useEffect(() => {
    let cancelled = false;
    backend
      .status()
      .then((s) => !cancelled && setStatus(s))
      .catch(() => !cancelled && setStatus({ mode: "mock" }));
    return () => {
      cancelled = true;
    };
  }, [backend]);

  // Autoplay: one timer per step. When autoplay *arrives* at a question it pauses,
  // so the learner can answer; pressing Play on a question step continues.
  const arrivedByTick = useRef(false);
  useEffect(() => {
    const arrived = arrivedByTick.current;
    arrivedByTick.current = false;
    if (!pb.playing) return;
    if (pauseAtQuestions && step.checkpoint && arrived) {
      dispatch({ type: "pause" });
      return;
    }
    const t = setTimeout(() => {
      arrivedByTick.current = true;
      dispatch({ type: "tick" });
    }, AUTOPLAY_MS);
    return () => clearTimeout(t);
  }, [pb.playing, pb.index, pauseAtQuestions, step.checkpoint]);

  // Keyboard: ← → navigate, Space play/pause, Home/R replay. Ignored while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowRight") dispatch({ type: "next" });
      else if (e.key === "ArrowLeft") dispatch({ type: "prev" });
      else if (e.key === " " && t?.tagName !== "BUTTON") {
        e.preventDefault();
        dispatch({ type: "toggle" });
      } else if (e.key === "Home" || e.key.toLowerCase() === "r") dispatch({ type: "replay" });
      else return;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function askTutor(e: React.FormEvent) {
    e.preventDefault();
    const text = prompt.trim();
    if (text.length < 2 || loading) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const timer = setTimeout(() => ac.abort(), 45_000);
    setLoading(true);
    setError(null);
    try {
      const data = await backend.plan(text, ac.signal);
      const parsed = LessonSchema.safeParse(data.lesson); // never trust the network either
      if (!parsed.success) throw new Error("The server returned a lesson that failed validation.");
      const meta = data.meta;
      loadLesson(parsed.data, meta.mode === "live" ? { kind: "live", model: meta.model, intro: meta.intro, notices: meta.notices } : { kind: "mock", intro: meta.intro, notices: meta.notices });
    } catch (err) {
      setError(ac.signal.aborted ? "The tutor took too long to answer. Try again." : err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }

  return (
    <div className="flex h-dvh min-h-0 w-full flex-col overflow-hidden">
      <header className="flex shrink-0 flex-col gap-2 border-b border-slate-200 bg-white px-3 py-2 sm:px-4 dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="mr-2 hidden text-base font-bold tracking-tight whitespace-nowrap sm:block">AI Visual Tutor</h1>
          <form onSubmit={askTutor} className="flex min-w-0 flex-1 basis-80 gap-2">
            <label htmlFor="topic" className="sr-only">
              What do you want to learn?
            </label>
            <input
              id="topic"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              maxLength={500}
              placeholder='What should I teach? e.g. "binary search for 7 in [1, 3, 5, 7, 9]"'
              className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30 dark:border-slate-700"
            />
            <button type="submit" disabled={loading || prompt.trim().length < 2} className="rounded-lg bg-sky-600 px-4 py-1.5 text-sm font-semibold whitespace-nowrap text-white hover:bg-sky-700 disabled:opacity-50">
              {loading ? "Planning…" : "Teach me"}
            </button>
          </form>
          <ModeBadge status={status} />
        </div>
        <div className="flex items-center gap-1.5">
        <div className="-mx-1 flex min-w-0 items-center gap-1.5 overflow-x-auto px-1 pb-0.5 whitespace-nowrap sm:flex-wrap sm:overflow-visible">
          <span className="text-xs text-slate-500">Try:</span>
          {QUICK_PICKS.map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => loadLesson(q.build(), { kind: "builtin" })}
              className="shrink-0 rounded-full border border-slate-300 px-2.5 py-0.5 text-xs font-medium hover:border-sky-500 hover:text-sky-700 dark:border-slate-700 dark:hover:text-sky-300"
            >
              {q.label}
            </button>
          ))}
        </div>
          <BinarySearchEditor onBuild={(l) => loadLesson(l, { kind: "custom" })} />
        </div>
        {error && (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-1.5 text-sm text-rose-800 dark:bg-rose-950 dark:text-rose-200">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <LessonHeader lesson={lesson} source={source} />
          <div role="tablist" aria-label="View" className="ml-auto flex rounded-lg border border-slate-300 p-0.5 text-sm dark:border-slate-700">
            {(["canvas", "editor"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={`rounded-md px-3 py-1 font-medium capitalize ${view === v ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-600 dark:text-slate-300"}`}
              >
                {v === "canvas" ? "✎ Canvas" : "</> Editor"}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="relative min-h-0 flex-1">
        {view === "canvas" ? (
          <TeachingCanvas key={lesson.id} lesson={lesson} step={step} index={pb.index} onOpenEditor={() => setView("editor")} />
        ) : (
          <EditorView lesson={lesson} step={step} index={pb.index} onOpenCanvas={() => setView("canvas")} />
        )}
      </main>

      <PlaybackControls
        index={pb.index}
        count={lesson.steps.length}
        playing={pb.playing}
        pauseAtQuestions={pauseAtQuestions}
        onPauseAtQuestions={setPauseAtQuestions}
        dispatch={dispatch}
      />
    </div>
  );
}

/** The code editor is a separate surface; it follows the same active step as the canvas. */
function EditorView({ lesson, step, index, onOpenCanvas }: { lesson: Lesson; step: Lesson["steps"][number]; index: number; onOpenCanvas: () => void }) {
  return (
    <div className="grid h-full min-h-0 gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <CodePanel code={lesson.code} highlight={step.highlightLines} tall />
      <aside className="flex min-h-0 flex-col gap-3 overflow-auto">
        <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-900" data-testid="editor-step">
          <p className="text-xs font-semibold tracking-wide text-sky-700 uppercase dark:text-sky-300">
            Step {index + 1} of {lesson.steps.length} · {step.objective}
          </p>
          <p className="mt-2 leading-relaxed">{step.narration}</p>
          <button type="button" onClick={onOpenCanvas} className="mt-3 text-xs font-semibold text-sky-700 hover:underline dark:text-sky-300">
            ← See it on the canvas
          </button>
        </section>
        <StateInspector state={step.state} />
      </aside>
    </div>
  );
}

function ModeBadge({ status }: { status: Status }) {
  if (!status) return <span className="text-xs text-slate-400">Checking AI…</span>;
  if (status.mode === "live")
    return (
      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" data-testid="mode-badge">
        Live AI · {status.model}
      </span>
    );
  return (
    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200" data-testid="mode-badge" title={status.configError}>
      Demo mode · no live AI{status.configError ? " (config error)" : ""}
    </span>
  );
}

function LessonHeader({ lesson, source }: { lesson: Lesson; source: Source }) {
  const verified = lesson.fidelity === "verified";
  const intro = "intro" in source && source.intro ? source.intro : lesson.summary;
  return (
    <section aria-label="Lesson" className="flex min-w-0 flex-wrap items-center gap-2">
      <h2 className="text-base font-semibold" data-testid="lesson-title">
        {lesson.title}
      </h2>
      <span
        data-testid="fidelity-badge"
        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${verified ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200"}`}
        title={verified ? "Every step is computed by a deterministic engine" : "A sketch for explanation — not computed by a simulator"}
      >
        {verified ? "Verified simulation" : "Illustrative sketch"}
      </span>
      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        {source.kind === "live" ? `Planned by live AI${source.model ? ` (${source.model})` : ""}` : source.kind === "mock" ? "Demo fixture (no live AI)" : source.kind === "custom" ? "Your input" : "Built-in example"}
      </span>
      {"notices" in source &&
        source.notices.map((n) => (
          <span key={n} className="text-xs text-amber-800 dark:text-amber-300">
            ⚠ {n}
          </span>
        ))}
      <details className="relative text-xs text-slate-600 dark:text-slate-300">
        <summary className="cursor-pointer select-none hover:text-sky-700">About this lesson</summary>
        <div className="absolute top-6 left-0 z-30 w-[min(28rem,85vw)] rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900">
          <p className="text-sm">{intro}</p>
          {lesson.assumptions.length > 0 && (
            <>
              <p className="mt-3 font-semibold">Assumptions &amp; limits</p>
              <ul className="mt-1 list-disc pl-5">
                {lesson.assumptions.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      </details>
    </section>
  );
}

function StateInspector({ state }: { state: Lesson["steps"][number]["state"] }) {
  const entries = Object.entries(state);
  if (entries.length === 0) return null;
  return (
    <section aria-label="Variables" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900" data-testid="state">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">State</h3>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-sm sm:grid-cols-3">
        {entries.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2 border-b border-dashed border-slate-200 py-0.5 dark:border-slate-800">
            <dt className="truncate text-slate-500">{k}</dt>
            <dd data-var={k} className="font-semibold">
              {v === null ? "—" : String(v)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function BinarySearchEditor({ onBuild }: { onBuild: (l: Lesson) => void }) {
  const [values, setValues] = useState("1, 4, 7, 9, 13, 18, 22, 31");
  const [target, setTarget] = useState("22");
  const [err, setErr] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const nums = values.split(/[\s,]+/).filter(Boolean).map(Number);
    const parsed = BinarySearchParamsSchema.safeParse({ values: nums, target: target.trim() === "" ? NaN : Number(target) });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setErr(issue.path[0] === "target" ? "Target must be a number." : issue.code === "too_big" ? "Use at most 32 values." : issue.message.includes("sorted") ? issue.message : "Values must be numbers separated by commas.");
      return;
    }
    setErr(null);
    onBuild(buildLesson("binary-search", parsed.data));
  }

  return (
    <details className="relative shrink-0 text-sm">
      <summary className="cursor-pointer rounded-full border border-dashed border-slate-400 px-2.5 py-0.5 text-xs font-medium text-slate-600 select-none dark:text-slate-300"><span className="sm:hidden">Your input…</span><span className="hidden sm:inline">Your own binary search…</span></summary>
      <form onSubmit={submit} className="absolute top-8 right-0 z-30 flex w-[min(26rem,90vw)] sm:right-auto sm:left-0 flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <label className="flex min-w-48 flex-1 flex-col text-xs">
          Sorted values
          <input value={values} onChange={(e) => setValues(e.target.value)} className="mt-1 rounded-lg border border-slate-300 bg-transparent px-2 py-1.5 font-mono text-sm dark:border-slate-700" />
        </label>
        <label className="flex w-24 flex-col text-xs">
          Target
          <input value={target} onChange={(e) => setTarget(e.target.value)} inputMode="numeric" className="mt-1 rounded-lg border border-slate-300 bg-transparent px-2 py-1.5 font-mono text-sm dark:border-slate-700" />
        </label>
        <button type="submit" className="rounded-lg border border-sky-600 px-3 py-1.5 text-sm font-semibold text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-950">
          Visualize
        </button>
        {err && (
          <p role="alert" className="w-full text-xs text-rose-700 dark:text-rose-300">
            {err}
          </p>
        )}
      </form>
    </details>
  );
}
