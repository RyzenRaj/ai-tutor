"use client";

import type { Dispatch } from "react";
import type { PlaybackAction } from "@/lib/lesson/runtime";

type Props = {
  index: number;
  count: number;
  playing: boolean;
  pauseAtQuestions: boolean;
  onPauseAtQuestions: (v: boolean) => void;
  dispatch: Dispatch<PlaybackAction>;
};

const btn =
  "inline-flex h-10 min-w-10 items-center justify-center rounded-lg border border-slate-300 px-3 text-sm font-semibold hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-slate-700 dark:hover:bg-slate-800";

export function PlaybackControls({ index, count, playing, pauseAtQuestions, onPauseAtQuestions, dispatch }: Props) {
  const atStart = index === 0;
  const atEnd = index >= count - 1;
  return (
    <nav aria-label="Lesson playback" className="shrink-0 border-t border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-3 sm:px-6">
        <button type="button" className={btn} onClick={() => dispatch({ type: "prev" })} disabled={atStart} aria-label="Previous step" title="Previous (←)">
          ‹ Prev
        </button>
        <button
          type="button"
          className={`${btn} min-w-24 border-sky-600 bg-sky-600 text-white hover:bg-sky-700 dark:hover:bg-sky-700`}
          onClick={() => dispatch({ type: "toggle" })}
          disabled={count <= 1}
          aria-label={playing ? "Pause" : "Play"}
          aria-pressed={playing}
          title="Play / pause (Space)"
        >
          {playing ? "❚❚ Pause" : "▶ Play"}
        </button>
        <button type="button" className={btn} onClick={() => dispatch({ type: "next" })} disabled={atEnd} aria-label="Next step" title="Next (→)">
          Next ›
        </button>
        <button type="button" className={btn} onClick={() => dispatch({ type: "replay" })} aria-label="Replay from start" title="Replay (R)">
          ↺ Replay
        </button>
        <label className="ml-2 flex min-w-40 flex-1 items-center gap-2 text-xs text-slate-500">
          <span className="sr-only">Jump to step</span>
          <input
            type="range"
            min={1}
            max={Math.max(count, 1)}
            value={index + 1}
            onChange={(e) => dispatch({ type: "goto", index: Number(e.target.value) - 1 })}
            className="flex-1 accent-sky-600"
            aria-valuetext={`Step ${index + 1} of ${count}`}
          />
          <span className="w-16 text-right font-mono" data-testid="step-counter">
            {index + 1} / {count}
          </span>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={pauseAtQuestions} onChange={(e) => onPauseAtQuestions(e.target.checked)} />
          Pause at questions
        </label>
      </div>
    </nav>
  );
}
