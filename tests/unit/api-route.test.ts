import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/lesson/route";

const post = (body: unknown, ip = "1.1.1.1") =>
  POST(new Request("http://localhost/api/lesson", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) }));

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

  it("rate limits per client", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) codes.push((await post({ prompt: "binary search" }, "9.9.9.9")).status);
    expect(codes.slice(0, 10).every((c) => c === 200)).toBe(true);
    expect(codes[10]).toBe(429);
  });
});
