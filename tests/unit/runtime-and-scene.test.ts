import { describe, expect, it } from "vitest";
import { initPlayback, playbackReducer, type PlaybackAction, type PlaybackState } from "@/lib/lesson/runtime";
import { parseScene } from "@/lib/scene/schema";

const run = (s: PlaybackState, ...actions: PlaybackAction[]) => actions.reduce(playbackReducer, s);

describe("playback runtime", () => {
  it("navigates within bounds", () => {
    const s = initPlayback(3);
    expect(run(s, { type: "prev" }).index).toBe(0);
    expect(run(s, { type: "next" }, { type: "next" }, { type: "next" }).index).toBe(2);
    expect(run(s, { type: "goto", index: 99 }).index).toBe(2);
    expect(run(s, { type: "goto", index: -4 }).index).toBe(0);
    expect(run(s, { type: "goto", index: NaN }).index).toBe(0);
  });

  it("autoplays to the end and stops", () => {
    let s = run(initPlayback(3), { type: "play" });
    expect(s.playing).toBe(true);
    s = run(s, { type: "tick" });
    expect(s).toMatchObject({ index: 1, playing: true });
    s = run(s, { type: "tick" });
    expect(s).toMatchObject({ index: 2, playing: false });
    expect(run(s, { type: "tick" }).index).toBe(2);
  });

  it("play at the end restarts; replay rewinds; manual navigation pauses", () => {
    expect(run(initPlayback(3), { type: "goto", index: 2 }, { type: "play" })).toMatchObject({ index: 0, playing: true });
    expect(run(initPlayback(3), { type: "next" }, { type: "replay" })).toMatchObject({ index: 0, playing: true });
    expect(run(initPlayback(3), { type: "play" }, { type: "next" }).playing).toBe(false);
    expect(run(initPlayback(3), { type: "toggle" }, { type: "toggle" }).playing).toBe(false);
  });

  it("is safe with 0 or 1 steps", () => {
    expect(run(initPlayback(0), { type: "next" }, { type: "play" }, { type: "tick" })).toEqual({ index: 0, stepCount: 0, playing: false });
    expect(run(initPlayback(1), { type: "play" }).playing).toBe(false);
  });

  it("load resets state", () => {
    expect(run(initPlayback(5), { type: "goto", index: 3 }, { type: "load", stepCount: 2 })).toEqual(initPlayback(2));
  });
});

describe("scene contract", () => {
  const base = { version: 1, fidelity: "verified", elements: [{ type: "text", id: "t", text: "hi" }] };

  it("accepts a minimal scene and fills defaults", () => {
    const s = parseScene(base);
    expect(s.layout).toBe("column");
    expect(s.arrows).toEqual([]);
  });

  it.each([
    ["unknown element type", { ...base, elements: [{ type: "script", id: "x", code: "alert(1)" }] }],
    ["wrong version", { ...base, version: 2 }],
    ["duplicate ids", { ...base, elements: [{ type: "text", id: "t", text: "a" }, { type: "box", id: "t", label: "b" }] }],
    ["arrow to unknown id", { ...base, arrows: [{ id: "a", from: "t", to: "nope" }] }],
    ["pointer out of range", { ...base, elements: [{ type: "array", id: "a", cells: [{ id: "c0", value: 1 }], pointers: [{ id: "p", label: "low", index: 1 }] }] }],
    ["table row width mismatch", { ...base, elements: [{ type: "table", id: "tb", columns: ["a", "b"], rows: [{ id: "r", cells: [1] }] }] }],
    ["id with markup", { ...base, elements: [{ type: "text", id: "<img onerror=x>", text: "a" }] }],
    ["unknown focus id", { ...base, focus: ["ghost"] }],
    ["nested groups", { ...base, elements: [{ type: "group", id: "g", children: [{ type: "group", id: "g2", children: [] }] }] }],
  ])("rejects %s", (_name, scene) => {
    expect(() => parseScene(scene)).toThrow();
  });
});

describe("every engine step tells the canvas what to point at", () => {
  it("has at least one valid focus target per step", async () => {
    const { CAPABILITIES } = await import("@/lib/registry");
    for (const cap of CAPABILITIES) {
      const lesson = cap.build(cap.defaultParams);
      for (const step of lesson.steps) expect(step.scene.focus.length).toBeGreaterThan(0);
    }
  });
});
