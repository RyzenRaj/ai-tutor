import { describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/lesson/route";
import { LessonSchema, type Lesson } from "@/lib/lesson/schema";
import { initPlayback, playbackReducer, type PlaybackAction } from "@/lib/lesson/runtime";
import { CAPABILITIES, buildLesson } from "@/lib/registry";
import { collectIds } from "@/lib/scene/schema";

/**
 * Integration: request → planner → engine → schema → runtime, and the synchronization
 * invariants every lesson must satisfy (code line, scene, state and narration describe one step).
 */

async function requestLesson(prompt: string): Promise<Lesson> {
  vi.stubEnv("OPENROUTER_API_KEY", "");
  const res = await POST(
    new Request("http://localhost/api/lesson", {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": `int-${prompt.length}-${Math.random()}` },
      body: JSON.stringify({ prompt }),
    }),
  );
  expect(res.status).toBe(200);
  const data = await res.json();
  return LessonSchema.parse(data.lesson);
}

function assertSynchronized(lesson: Lesson) {
  const lines = lesson.code.source.split("\n");
  for (const [i, step] of lesson.steps.entries()) {
    const where = `${lesson.capabilityId} step ${i + 1} (${step.objective})`;
    if (step.phase === "walkthrough") expect(step.highlightLines.length, where).toBeGreaterThan(0);
    for (const l of step.highlightLines) expect(lines[l - 1]?.trim(), `${where}: line ${l}`).toBeTruthy();
    const ids = new Set(collectIds(step.scene.elements));
    for (const f of step.scene.focus) expect(ids.has(f), `${where}: focus ${f}`).toBe(true);
    if (step.phase === "walkthrough" || step.phase === "preview" || step.phase === "check") expect(step.scene.fidelity, where).toBe(lesson.fidelity);
    if (step.checkpoint) expect(step.checkpoint.answerIndex, where).toBeLessThan(step.checkpoint.options.length);
  }
}

describe("request → lesson → runtime", () => {
  it.each([
    ["binary search for 7 in [1, 3, 5, 7, 9]", "binary-search"],
    ["explain an inner join", "sql-join"],
    ["what happens in a spark shuffle?", "spark-shuffle"],
    ["explain TCP handshakes", "whiteboard"],
  ])("%s → %s, synchronized on every step", async (prompt, capability) => {
    const lesson = await requestLesson(prompt);
    expect(lesson.capabilityId).toBe(capability);
    assertSynchronized(lesson);
  });

  it("playback over a served lesson is deterministic: next/prev/replay land on identical steps", async () => {
    const lesson = await requestLesson("binary search for 7 in [1, 3, 5, 7, 9]");
    const script: PlaybackAction[] = [{ type: "next" }, { type: "next" }, { type: "prev" }, { type: "goto", index: 99 }, { type: "replay" }, { type: "tick" }, { type: "tick" }];
    const run = () => script.reduce((s, a) => [...s, playbackReducer(s.at(-1)!, a)], [initPlayback(lesson.steps.length)]).map((s) => s.index);
    expect(run()).toEqual(run());
    expect(run()).toEqual([0, 1, 2, 1, lesson.steps.length - 1, 0, 1, 2]);
  });
});

describe("every built-in capability", () => {
  for (const cap of CAPABILITIES) {
    it(`${cap.id}: default lesson is valid and synchronized`, () => {
      assertSynchronized(buildLesson(cap.id, cap.defaultParams));
    });
  }
});
