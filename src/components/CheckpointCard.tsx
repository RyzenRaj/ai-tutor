"use client";

import { useState } from "react";
import type { Checkpoint } from "@/lib/lesson/schema";

/** Remount with key={step.id} to reset between steps. */
export function CheckpointCard({ checkpoint, onAnswered }: { checkpoint: Checkpoint; onAnswered?: (correct: boolean) => void }) {
  const [choice, setChoice] = useState<number | null>(null);
  const answered = choice !== null;
  const correct = choice === checkpoint.answerIndex;

  return (
    <fieldset className="rounded-xl border border-violet-300 bg-violet-50 p-4 dark:border-violet-800 dark:bg-violet-950/40" data-testid="checkpoint">
      <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">Check yourself</legend>
      <p className="text-sm font-medium">{checkpoint.prompt}</p>
      <div className="mt-3 flex flex-col gap-2">
        {checkpoint.options.map((opt, i) => {
          const isAnswer = i === checkpoint.answerIndex;
          const state = !answered ? "" : isAnswer ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950" : i === choice ? "border-rose-400 bg-rose-50 dark:bg-rose-950" : "opacity-60";
          return (
            <button
              key={i}
              type="button"
              disabled={answered}
              onClick={() => {
                setChoice(i);
                onAnswered?.(i === checkpoint.answerIndex);
              }}
              className={`rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm transition hover:border-violet-500 focus-visible:outline-2 focus-visible:outline-violet-500 disabled:cursor-default dark:border-slate-700 dark:bg-slate-900 ${state}`}
            >
              {opt}
            </button>
          );
        })}
      </div>
      {answered && (
        <p role="status" className={`mt-3 text-sm ${correct ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>
          <strong>{correct ? "Correct." : "Not quite."}</strong> {checkpoint.explanation}
        </p>
      )}
    </fieldset>
  );
}
