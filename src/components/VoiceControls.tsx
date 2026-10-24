"use client";

import type { NarrationApi } from "./useNarration";

const btn =
  "inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-slate-300 px-2.5 text-sm font-medium hover:bg-slate-100 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-slate-700 dark:hover:bg-slate-800";

const STATUS_TEXT: Record<string, string> = {
  loading: "Preparing voice…",
  playing: "Speaking",
  paused: "Paused",
  idle: "Ready",
  unavailable: "Voice isn't available here. The lesson works fully without audio.",
};

/** Optional narration. Off by default; enabling it is the user gesture browsers require. */
export function VoiceControls({ narration }: { narration: NarrationApi }) {
  const { state, controller, providers } = narration;
  const on = state.status !== "off";

  if (!on) {
    return (
      <button type="button" className={btn} aria-pressed={false} onClick={() => controller.enable()} data-testid="voice-toggle" title="Read each step aloud">
        🔈 Voice off
      </button>
    );
  }

  const speaking = state.status === "playing";
  return (
    <div role="group" aria-label="Narration" className="flex flex-wrap items-center gap-1.5" data-testid="voice-controls">
      <button type="button" className={`${btn} border-sky-700 text-sky-800 dark:text-sky-200`} aria-pressed onClick={() => controller.disable()} data-testid="voice-toggle" title="Turn narration off">
        🔊 Voice on
      </button>
      <button
        type="button"
        className={btn}
        onClick={() => (speaking ? controller.pause() : state.status === "paused" ? controller.resume() : controller.replay())}
        disabled={state.status === "unavailable" || state.status === "loading"}
        aria-label={speaking ? "Pause narration" : state.status === "paused" ? "Resume narration" : "Read this step aloud"}
      >
        {speaking ? "❚❚" : "▶"}
      </button>
      <button type="button" className={btn} onClick={() => controller.replay()} disabled={state.status === "unavailable"} aria-label="Replay narration">
        ↺
      </button>
      <button type="button" className={btn} onClick={() => controller.stop()} disabled={!["playing", "paused", "loading"].includes(state.status)} aria-label="Stop narration">
        ■
      </button>
      <button type="button" className={btn} aria-pressed={state.muted} onClick={() => controller.setMuted(!state.muted)} aria-label={state.muted ? "Unmute narration" : "Mute narration"}>
        {state.muted ? "🔇" : "🔉"}
      </button>
      {providers.length > 1 && (
        <label className="text-xs text-slate-600 dark:text-slate-400">
          <span className="sr-only">Voice</span>
          <select
            className="rounded-md border border-slate-300 bg-transparent px-1.5 py-1 text-xs dark:border-slate-700"
            value={state.providerId}
            onChange={(e) => {
              const p = providers.find((x) => x.id === e.target.value);
              if (p) void controller.setProvider(p);
            }}
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <span role="status" aria-live="polite" data-testid="voice-status" data-status={state.status} data-step={state.stepKey ?? ""} className={`text-xs ${state.status === "error" ? "text-rose-700 dark:text-rose-300" : "text-slate-600 dark:text-slate-400"}`}>
        {state.status === "error" ? `${state.error ?? "Narration failed"} The lesson still works without audio.` : STATUS_TEXT[state.status]}
      </span>
    </div>
  );
}
