import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NarrationController } from "@/lib/voice/controller";
import { MockSpeechProvider } from "@/lib/voice/providers/mock";

/** P5: narration follows the active step and never speaks a stale one. */
describe("NarrationController", () => {
  let provider: MockSpeechProvider;
  let c: NarrationController;
  beforeEach(() => {
    vi.useFakeTimers();
    provider = new MockSpeechProvider({ delayMs: 100 });
    c = new NarrationController(provider);
  });
  afterEach(() => {
    c.dispose();
    vi.useRealTimers();
  });

  it("is off until the learner turns it on (autoplay rules), and remembers the current step", async () => {
    c.narrate("s1", "first");
    await vi.advanceTimersByTimeAsync(500);
    expect(provider.requests).toEqual([]);
    expect(c.getState().status).toBe("off");
    c.enable(); // called from a click handler
    expect(c.getState().status).toBe("loading");
    await vi.advanceTimersByTimeAsync(100);
    expect(provider.requests.map((r) => r.text)).toEqual(["first"]);
    expect(c.getState()).toMatchObject({ status: "playing", stepKey: "s1" });
  });

  it("navigating mid-request discards the stale audio and plays only the new step", async () => {
    c.enable();
    c.narrate("s1", "one");
    await vi.advanceTimersByTimeAsync(50); // s1 still loading
    c.narrate("s2", "two");
    await vi.advanceTimersByTimeAsync(200);
    const played = provider.playbacks.filter((p) => p.played).map((p) => p.text);
    expect(played).toEqual(["two"]);
    expect(provider.requests[0].signal.aborted).toBe(true);
    expect(c.getState()).toMatchObject({ status: "playing", stepKey: "s2" });
  });

  it("a late response for an old step is stopped, never played (even if the provider ignores abort)", async () => {
    provider.ignoreAbort = true;
    c.enable();
    c.narrate("s1", "one");
    await vi.advanceTimersByTimeAsync(10);
    c.narrate("s2", "two");
    await vi.advanceTimersByTimeAsync(300);
    const one = provider.playbacks.find((p) => p.text === "one")!;
    expect(one.played).toBe(false);
    expect(one.stopped).toBe(true);
  });

  it("navigating while speaking stops the current narration first", async () => {
    c.enable();
    c.narrate("s1", "one");
    await vi.advanceTimersByTimeAsync(100);
    const first = provider.playbacks[0];
    c.narrate("s2", "two");
    expect(first.stopped).toBe(true);
  });

  it("pause, resume, replay and stop", async () => {
    c.enable();
    c.narrate("s1", "one");
    await vi.advanceTimersByTimeAsync(100);
    c.pause();
    expect(c.getState().status).toBe("paused");
    expect(provider.playbacks[0].paused).toBe(true);
    c.resume();
    expect(c.getState().status).toBe("playing");
    c.replay();
    await vi.advanceTimersByTimeAsync(100);
    expect(provider.requests.map((r) => r.text)).toEqual(["one", "one"]);
    c.stop();
    expect(c.getState().status).toBe("idle");
    expect(provider.playbacks.at(-1)!.stopped).toBe(true);
  });

  it("mute silences without losing the position; unmute restores", async () => {
    c.enable();
    c.narrate("s1", "one");
    await vi.advanceTimersByTimeAsync(100);
    c.setMuted(true);
    expect(provider.playbacks[0].muted).toBe(true);
    expect(c.getState().muted).toBe(true);
    c.narrate("s2", "two");
    await vi.advanceTimersByTimeAsync(100);
    expect(provider.playbacks[1].muted).toBe(true); // stays muted on the next step
    c.setMuted(false);
    expect(provider.playbacks[1].muted).toBe(false);
  });

  it("reports when narration of the current step has finished (for autoplay)", async () => {
    c.enable();
    c.narrate("s1", "one");
    await vi.advanceTimersByTimeAsync(100);
    provider.playbacks[0].finish();
    expect(c.getState()).toMatchObject({ status: "idle", finishedStepKey: "s1" });
  });

  it("errors are reported and recoverable; the lesson is unaffected", async () => {
    provider.failNext = new Error("Voice service unavailable");
    c.enable();
    c.narrate("s1", "one");
    await vi.advanceTimersByTimeAsync(100);
    expect(c.getState()).toMatchObject({ status: "error", error: "Voice service unavailable" });
    c.narrate("s2", "two");
    await vi.advanceTimersByTimeAsync(100);
    expect(c.getState().status).toBe("playing");
  });

  it("an unavailable provider leaves voice unavailable instead of failing", async () => {
    provider.available = false;
    await c.refreshAvailability();
    c.enable();
    expect(c.getState().status).toBe("unavailable");
    c.narrate("s1", "one");
    await vi.advanceTimersByTimeAsync(200);
    expect(provider.requests).toEqual([]);
  });

  it("turning voice off stops everything and ignores later steps", async () => {
    c.enable();
    c.narrate("s1", "one");
    await vi.advanceTimersByTimeAsync(100);
    c.disable();
    expect(provider.playbacks[0].stopped).toBe(true);
    c.narrate("s2", "two");
    await vi.advanceTimersByTimeAsync(200);
    expect(provider.requests).toHaveLength(1);
    expect(c.getState().status).toBe("off");
  });

  it("notifies subscribers and stops notifying after unsubscribe", async () => {
    const seen: string[] = [];
    const off = c.subscribe(() => seen.push(c.getState().status));
    c.enable();
    c.narrate("s1", "one");
    await vi.advanceTimersByTimeAsync(100);
    off();
    c.stop();
    expect(seen).toEqual(["idle", "loading", "playing"]);
  });
});
