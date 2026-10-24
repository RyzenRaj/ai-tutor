import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/lesson/route";

const post = (body: unknown, ip = "1.1.1.1") =>
  POST(new Request("http://localhost/api/lesson", { method: "POST", headers: { "content-type": "application/json", "x-real-ip": ip }, body: JSON.stringify(body) }));

describe("POST /api/lesson", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("serves a labeled mock lesson when no key is configured", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const res = await post({ prompt: "teach me a left join" });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.meta.mode).toBe("mock");
    expect(data.lesson.capabilityId).toBe("sql-join");
    expect(data.lesson.title).toBe("SQL LEFT JOIN");
  });

  it("validates the request body", async () => {
    expect((await post({ prompt: "x" }, "2.2.2.2")).status).toBe(400);
    expect((await post({ prompt: "y".repeat(501) }, "2.2.2.2")).status).toBe(400);
    expect((await post({ nope: true }, "2.2.2.2")).status).toBe(400);
  });

  it("refuses a possibly-paid model without opt-in, without calling the provider", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "k");
    vi.stubEnv("OPENROUTER_MODEL", "openai/gpt-4o");
    const spy = vi.spyOn(globalThis, "fetch");
    const res = await post({ prompt: "binary search" }, "3.3.3.3");
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/OPENROUTER_ALLOW_PAID/);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("F6: a spoofed X-Forwarded-For does not get a fresh rate-limit bucket", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await POST(
        new Request("http://localhost/api/lesson", {
          method: "POST",
          headers: { "content-type": "application/json", "x-real-ip": "7.7.7.7", "x-forwarded-for": `10.0.0.${i}` },
          body: JSON.stringify({ prompt: "binary search" }),
        }),
      );
      codes.push(res.status);
    }
    expect(codes[10]).toBe(429);
  });

  it("F6: live AI calls have a global per-minute cap that per-client headers cannot bypass", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "k");
    vi.stubEnv("OPENROUTER_MODEL", "openrouter/free");
    vi.stubEnv("LIVE_AI_MAX_PER_MINUTE", "2");
    const plan = { capabilityId: "binary-search", params: { values: [1, 2, 3], target: 2 }, intro: "hi" };
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ model: "x:free", choices: [{ message: { content: JSON.stringify(plan) } }] }), { status: 200 }),
    );
    const codes: number[] = [];
    for (let i = 0; i < 3; i++) codes.push((await post({ prompt: "binary search" }, `20.0.0.${i}`)).status);
    expect(codes).toEqual([200, 200, 429]);
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it("F7: rejects oversized bodies with 413", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const res = await post({ prompt: "binary search", pad: "x".repeat(10_000) }, "8.8.8.8");
    expect(res.status).toBe(413);
  });

  it("rate limits per client", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) codes.push((await post({ prompt: "binary search" }, "9.9.9.9")).status);
    expect(codes.slice(0, 10).every((c) => c === 200)).toBe(true);
    expect(codes[10]).toBe(429);
  });
});
