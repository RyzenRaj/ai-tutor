import type { Tone } from "@/lib/scene/schema";

/** Single mapping from semantic tone → classes, shared by every renderer. */
export const toneSurface: Record<Tone, string> = {
  default: "bg-white border-slate-300 text-slate-900 dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100",
  muted: "bg-slate-100 border-slate-200 text-slate-400 dark:bg-slate-900/40 dark:border-slate-800 dark:text-slate-600",
  active: "bg-sky-50 border-sky-500 text-sky-900 dark:bg-sky-950 dark:border-sky-400 dark:text-sky-100",
  compare: "bg-amber-50 border-amber-500 text-amber-900 dark:bg-amber-950 dark:border-amber-400 dark:text-amber-100",
  success: "bg-emerald-50 border-emerald-500 text-emerald-900 dark:bg-emerald-950 dark:border-emerald-400 dark:text-emerald-100",
  warning: "bg-rose-50 border-rose-400 text-rose-900 dark:bg-rose-950 dark:border-rose-400 dark:text-rose-100",
};

export const toneText: Record<Tone, string> = {
  default: "text-slate-700 dark:text-slate-300",
  muted: "text-slate-400 dark:text-slate-500",
  active: "text-sky-700 dark:text-sky-300",
  compare: "text-amber-700 dark:text-amber-300",
  success: "text-emerald-700 dark:text-emerald-300",
  warning: "text-rose-700 dark:text-rose-300",
};

/** Stroke colours for SVG arrows (CSS variables defined in globals.css). */
export const toneStroke: Record<Tone, string> = {
  default: "var(--arrow-default)",
  muted: "var(--arrow-muted)",
  active: "var(--arrow-active)",
  compare: "var(--arrow-compare)",
  success: "var(--arrow-success)",
  warning: "var(--arrow-warning)",
};
