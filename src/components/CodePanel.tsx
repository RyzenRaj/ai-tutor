"use client";

import { useEffect, useRef } from "react";
import type { CodeArtifact } from "@/lib/lesson/schema";

export function CodePanel({ code, highlight, tall = false }: { code: CodeArtifact; highlight: number[]; tall?: boolean }) {
  const lines = code.source.split("\n");
  const active = new Set(highlight);
  const listRef = useRef<HTMLOListElement>(null);

  // Keep the active line visible by scrolling the code box only (never the page).
  useEffect(() => {
    const list = listRef.current;
    const line = list?.querySelector<HTMLElement>("[data-active]");
    if (!list || !line) return;
    const top = line.offsetTop; // the list is position:relative, so this is list-relative
    if (top < list.scrollTop || top + line.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = Math.max(0, top - list.clientHeight / 3);
    }
  }, [highlight]);

  return (
    <figure className={`flex min-h-0 flex-col overflow-hidden rounded-xl ${tall ? "h-full" : ""} border border-slate-200 bg-slate-950 text-slate-100 dark:border-slate-800`} data-testid="code-panel">
      <figcaption className="flex items-center justify-between border-b border-slate-800 px-4 py-2 text-xs text-slate-400">
        <span>{code.language === "text" ? "outline" : code.language}</span>
        <span>{highlight.length ? `line ${highlight.join(", ")}` : ""}</span>
      </figcaption>
      <ol ref={listRef} className={`relative min-h-0 overflow-auto py-2 font-mono leading-7 ${tall ? "flex-1 text-[15px]" : "max-h-[22rem] text-[13px]"}`}>
        {lines.map((line, i) => {
          const n = i + 1;
          const on = active.has(n);
          return (
            <li
              key={n}
              data-line={n}
              data-active={on || undefined}
              aria-current={on ? "step" : undefined}
              className={`flex border-l-4 pr-4 transition-colors duration-300 ${on ? "border-amber-400 bg-amber-400/15" : "border-transparent"}`}
            >
              <span className="w-10 shrink-0 select-none pr-3 text-right text-slate-500">{n}</span>
              <code className="whitespace-pre">{line || " "}</code>
            </li>
          );
        })}
      </ol>
    </figure>
  );
}
