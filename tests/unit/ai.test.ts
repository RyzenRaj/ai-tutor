import { describe, expect, it, vi } from "vitest";
import { OpenRouterProvider, isFreeModel, readOpenRouterConfig, type OpenRouterConfig } from "@/lib/ai/openrouter";
import { type JsonRequest, type LLMProvider, ProviderError, parseJsonText } from "@/lib/ai/provider";
import { extractBinarySearchParams, planJsonSchema, planLive, planMock, sanitizePrompt } from "@/lib/ai/planner";
import { buildLesson, getCapability, matchCapability } from "@/lib/registry";

const cfg = (over: Partial<OpenRouterConfig> = {}): OpenRouterConfig => ({
  apiKey: "sk-or-test-SECRET",
  model: "openrouter/free",
  baseUrl: "https://openrouter.ai/api/v1",
  allowPaid: false,
  timeoutMs: 1000,
  ...over,
});

const okResponse = (content: string, model = "some/free-model:free") =>
  new Response(JSON.stringify({ model, choices: [{ message: { content } }] }), { status: 200 });

const req: JsonRequest<{ a: number }> = {
  system: "s",
  user: "u",
  schemaName: "x",
  jsonSchema: { type: "object" },
  validate: (v) => {
    if (typeof (v as { a?: unknown }).a !== "number") throw new ProviderError("bad_response", "bad");
    return v as { a: number };
  },
};

describe("OpenRouter config", () => {
  it("is null without a key and defaults to the free router", () => {
    expect(readOpenRouterConfig({})).toBeNull();
    const c = readOpenRouterConfig({ OPENROUTER_API_KEY: "k" })!;
    expect(c.model).toBe("openrouter/free");
    expect(c.baseUrl).toBe("https://openrouter.ai/api/v1");
  });

  it("rejects non-https base URLs", () => {
    expect(() => readOpenRouterConfig({ OPENROUTER_API_KEY: "k", OPENROUTER_BASE_URL: "http://evil" })).toThrow(ProviderError);
  });

  it("refuses possibly-paid models unless explicitly allowed", () => {
    expect(isFreeModel("openrouter/free")).toBe(true);
    expect(isFreeModel("meta-llama/llama-3.3-70b-instruct:free")).toBe(true);
    expect(isFreeModel("anthropic/claude-sonnet-4")).toBe(false);
    expect(() => new OpenRouterProvider(cfg({ model: "openai/gpt-4o" }))).toThrow(/OPENROUTER_ALLOW_PAID/);
    expect(() => new OpenRouterProvider(cfg({ model: "openai/gpt-4o", allowPaid: true }))).not.toThrow();
  });
});

describe("OpenRouter provider", () => {
  it("sends a structured-output request with the key only in the Authorization header", async () => {
    const fetchMock = vi.fn(async () => okResponse('{"a": 1}'));
    const p = new OpenRouterProvider(cfg(), fetchMock as unknown as typeof fetch);
    const res = await p.completeJSON(req);
    expect(res).toEqual({ value: { a: 1 }, model: "some/free-model:free" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-or-test-SECRET");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("openrouter/free");
    expect(body.response_format.type).toBe("json_schema");
    expect(body.provider).toEqual({ require_parameters: true });
    expect(init.body).not.toContain("SECRET");
  });

  it.each([
    [429, "rate_limited"],
    [402, "payment_required"],
    [401, "auth"],
    [404, "unavailable"],
    [503, "unavailable"],
    [400, "bad_request"],
  ])("maps HTTP %d → %s without leaking the key", async (status, code) => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: { message: "nope" } }), { status, headers: { "retry-after": "7" } }));
    const p = new OpenRouterProvider(cfg(), fetchMock as unknown as typeof fetch);
    const err = (await p.completeJSON(req).catch((e) => e)) as ProviderError;
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.code).toBe(code);
    expect(err.message).not.toContain("SECRET");
    if (status === 429) expect(err.retryAfterSeconds).toBe(7);
  });

  it("maps timeouts and network failures", async () => {
    const timeout = vi.fn(async () => {
      throw new DOMException("timed out", "TimeoutError");
    });
    await expect(new OpenRouterProvider(cfg(), timeout as unknown as typeof fetch).completeJSON(req)).rejects.toMatchObject({ code: "timeout" });
    const down = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(new OpenRouterProvider(cfg(), down as unknown as typeof fetch).completeJSON(req)).rejects.toMatchObject({ code: "unavailable" });
  });

  it("rejects empty / malformed / schema-invalid content", async () => {
    for (const content of ["", "not json", '{"a": "x"}']) {
      const p = new OpenRouterProvider(cfg(), (async () => okResponse(content)) as unknown as typeof fetch);
      await expect(p.completeJSON(req)).rejects.toMatchObject({ code: "bad_response" });
    }
  });

  it("parses fenced JSON", () => {
    expect(parseJsonText('```json\n{"a":2}\n```')).toEqual({ a: 2 });
    expect(parseJsonText('Sure! {"a":3} hope that helps')).toEqual({ a: 3 });
  });
});

class FakeProvider implements LLMProvider {
  name = "fake";
  model = "fake/free:free";
  calls = 0;
  constructor(private readonly replies: unknown[]) {}
  async completeJSON<T>(r: JsonRequest<T>) {
    const reply = this.replies[this.calls++];
    if (reply instanceof Error) throw reply;
    return { value: r.validate(reply), model: this.model };
  }
}

describe("planner", () => {
  it("builds a JSON schema for the provider", () => {
    const schema = planJsonSchema() as { properties: Record<string, unknown> };
    expect(Object.keys(schema.properties)).toEqual(expect.arrayContaining(["capabilityId", "params", "intro", "whiteboard"]));
  });

  it("matches capabilities deterministically", () => {
    expect(matchCapability("teach me binary search")?.id).toBe("binary-search");
    expect(matchCapability("How does a LEFT JOIN work?")?.id).toBe("sql-join");
    expect(matchCapability("what is a spark shuffle")?.id).toBe("spark-shuffle");
    expect(matchCapability("explain TCP handshakes")).toBeUndefined();
  });

  it("mock mode extracts binary search input and labels itself", () => {
    const r = planMock("binary search for 7 in [9, 1, 7, 3]");
    expect(r.meta.mode).toBe("mock");
    expect(r.lesson.capabilityId).toBe("binary-search");
    expect(r.lesson.steps.filter((s) => s.phase === "walkthrough").at(-1)!.state.result).toBe(2);
    expect(r.meta.notices.join(" ")).toMatch(/sorted/);
    expect(extractBinarySearchParams("binary search please")).toBeNull();
  });

  it("mock mode falls back to an illustrative whiteboard for unknown topics", () => {
    const r = planMock("explain TCP handshakes");
    expect(r.lesson.fidelity).toBe("illustrative");
    expect(r.lesson.summary).toMatch(/Demo mode/);
  });

  it("strips control characters and bounds prompt length", () => {
    expect(sanitizePrompt("a\u0000b" + "x".repeat(900))).toHaveLength(500);
  });

  it("live: engine computes states from model-chosen params", async () => {
    const p = new FakeProvider([{ capabilityId: "binary-search", params: { values: [2, 4, 6], target: 6 }, intro: "Let's go" }]);
    const r = await planLive(p, "binary search");
    expect(r.meta).toMatchObject({ mode: "live", model: "fake/free:free", intro: "Let's go", notices: [] });
    expect(r.lesson.steps.filter((s) => s.phase === "walkthrough").at(-1)!.state.result).toBe(2);
  });

  it("live: invalid params never reach the engine — falls back to the example with a notice", async () => {
    const p = new FakeProvider([{ capabilityId: "binary-search", params: { values: [5, 1], target: 1 }, intro: "x" }]);
    const r = await planLive(p, "binary search");
    expect(r.meta.notices[0]).toMatch(/failed validation/);
    expect(r.lesson.id).toBe(buildLesson("binary-search", getCapability("binary-search")!.defaultParams).id);
  });

  it("live: whiteboard plans become illustrative lessons; bad arrows are dropped", async () => {
    const p = new FakeProvider([
      {
        capabilityId: "whiteboard",
        intro: "x",
        whiteboard: {
          title: "TCP handshake",
          summary: "s",
          steps: [{ objective: "o", narration: "n", boxes: [{ id: "client", label: "Client" }, { id: "server", label: "Server" }], arrows: [{ from: "client", to: "server", label: "SYN" }, { from: "client", to: "ghost" }] }],
        },
      },
    ]);
    const r = await planLive(p, "tcp");
    expect(r.lesson.fidelity).toBe("illustrative");
    expect(r.lesson.steps[0].scene.arrows).toHaveLength(1);
  });

  it("live: one repair attempt after malformed output, then gives up", async () => {
    const good = { capabilityId: "spark-shuffle", intro: "x" };
    const p1 = new FakeProvider([{ capabilityId: "nope" }, good]);
    await expect(planLive(p1, "spark")).resolves.toBeTruthy();
    expect(p1.calls).toBe(2);
    const p2 = new FakeProvider([{ capabilityId: "nope" }, { capabilityId: "nope" }]);
    await expect(planLive(p2, "spark")).rejects.toMatchObject({ code: "bad_response" });
    expect(p2.calls).toBe(2);
  });

  it("live: provider failures propagate (no silent fallback)", async () => {
    const p = new FakeProvider([new ProviderError("payment_required", "no credits")]);
    await expect(planLive(p, "x")).rejects.toMatchObject({ code: "payment_required" });
    expect(p.calls).toBe(1);
  });
});
