import { afterEach, describe, expect, it, vi } from "vitest";

// Framework boundary: `connection()` only works inside a real Next.js request.
vi.mock("next/server", () => ({ connection: async () => {} }));
import { GET, POST } from "@/app/api/tts/route";
import { readTtsConfig } from "@/lib/server/tts";

/** P5: server-side proxy to a self-hosted, OpenAI-compatible Kokoro endpoint. */
const post = (body: unknown, ip = "1.2.3.4") =>
  POST(new Request("http://localhost/api/tts", { method: "POST", headers: { "content-type": "application/json", "x-real-ip": ip }, body: JSON.stringify(body) }));

const wav = new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 65, 86, 69]); // "RIFF....WAVE"

describe("TTS config", () => {
  it("is off without KOKORO_TTS_URL", () => {
    expect(readTtsConfig({})).toBeNull();
  });
  it("requires https except for localhost development", () => {
    expect(readTtsConfig({ KOKORO_TTS_URL: "https://tts.example.com" })?.baseUrl).toBe("https://tts.example.com");
    expect(readTtsConfig({ KOKORO_TTS_URL: "http://localhost:8880/" })?.baseUrl).toBe("http://localhost:8880");
    expect(readTtsConfig({ KOKORO_TTS_URL: "http://127.0.0.1:8880" })).not.toBeNull();
    expect(() => readTtsConfig({ KOKORO_TTS_URL: "http://tts.example.com" })).toThrow(/https/);
  });
  it("defaults to the Kokoro model and a stock voice; rejects odd voice ids", () => {
    expect(readTtsConfig({ KOKORO_TTS_URL: "https://x.dev" })).toMatchObject({ model: "kokoro", voice: "af_heart" });
    expect(() => readTtsConfig({ KOKORO_TTS_URL: "https://x.dev", KOKORO_TTS_VOICE: "../../etc" })).toThrow();
  });
});

describe("/api/tts", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("GET reports availability without leaking the endpoint", async () => {
    vi.stubEnv("KOKORO_TTS_URL", "");
    expect(await (await GET()).json()).toEqual({ available: false });
    vi.stubEnv("KOKORO_TTS_URL", "https://secret-host.internal");
    const body = await (await GET()).json();
    expect(body).toEqual({ available: true, provider: "kokoro" });
    expect(JSON.stringify(body)).not.toContain("secret-host");
  });

  it("POST returns 503 when voice is not configured", async () => {
    vi.stubEnv("KOKORO_TTS_URL", "");
    expect((await post({ text: "hello" })).status).toBe(503);
  });

  it("proxies to the OpenAI-compatible speech endpoint and streams audio back", async () => {
    vi.stubEnv("KOKORO_TTS_URL", "https://tts.example.com");
    vi.stubEnv("KOKORO_TTS_API_KEY", "server-secret");
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(wav, { status: 200, headers: { "content-type": "audio/wav" } }));
    const res = await post({ text: "Binary search halves the range." }, "5.5.5.5");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/wav");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(wav);
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://tts.example.com/v1/audio/speech");
    expect(JSON.parse(init.body as string)).toEqual({ model: "kokoro", input: "Binary search halves the range.", voice: "af_heart", response_format: "wav" });
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer server-secret");
  });

  it("validates input: empty, too long, bad voice", async () => {
    vi.stubEnv("KOKORO_TTS_URL", "https://tts.example.com");
    expect((await post({ text: "" }, "6.6.6.1")).status).toBe(400);
    expect((await post({ text: "x".repeat(1001) }, "6.6.6.2")).status).toBe(400);
    expect((await post({ text: "hi", voice: "<script>" }, "6.6.6.3")).status).toBe(400);
  });

  it.each([
    ["upstream error", () => new Response("boom", { status: 500 }), 502],
    ["non-audio upstream", () => new Response("<html>", { status: 200, headers: { "content-type": "text/html" } }), 502],
    ["oversized audio", () => new Response(new Uint8Array(5 * 1024 * 1024), { status: 200, headers: { "content-type": "audio/wav" } }), 502],
  ])("maps %s to a clean error", async (_n, reply, status) => {
    vi.stubEnv("KOKORO_TTS_URL", "https://tts.example.com");
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => reply());
    const res = await post({ text: "hello" }, `7.7.7.${status}${_n.length}`);
    expect(res.status).toBe(status);
    expect((await res.json()).error).toBeTruthy();
  });

  it("times out slow upstreams", async () => {
    vi.stubEnv("KOKORO_TTS_URL", "https://tts.example.com");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new DOMException("timed out", "TimeoutError"));
    expect((await post({ text: "hello" }, "8.8.8.9")).status).toBe(504);
  });

  it("rate limits per client", async () => {
    vi.stubEnv("KOKORO_TTS_URL", "https://tts.example.com");
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(wav, { status: 200, headers: { "content-type": "audio/wav" } }));
    const codes: number[] = [];
    for (let i = 0; i < 31; i++) codes.push((await post({ text: "hello" }, "9.9.9.9")).status);
    expect(codes.slice(0, 30).every((c) => c === 200)).toBe(true);
    expect(codes[30]).toBe(429);
  });
});
