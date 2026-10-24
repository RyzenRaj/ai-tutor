import { afterEach, describe, expect, it, vi } from "vitest";
import { clientKey, readJsonBody } from "@/lib/server/request";

const h = (o: Record<string, string>) => new Headers(o);

describe("clientKey (F6)", () => {
  it("prefers platform-set headers", () => {
    expect(clientKey(h({ "x-vercel-forwarded-for": "1.2.3.4", "x-real-ip": "5.6.7.8", "x-forwarded-for": "9.9.9.9" }))).toBe("1.2.3.4");
    expect(clientKey(h({ "x-real-ip": "5.6.7.8", "x-forwarded-for": "9.9.9.9" }))).toBe("5.6.7.8");
  });
  it("ignores client-supplied X-Forwarded-For unless explicitly trusted", () => {
    expect(clientKey(h({ "x-forwarded-for": "6.6.6.6" }))).toBe("anonymous");
    expect(clientKey(h({ "x-forwarded-for": "6.6.6.6, 10.0.0.1" }), { trustForwardedFor: true })).toBe("10.0.0.1");
  });
});

describe("readJsonBody (F7)", () => {
  const streamOf = (text: string, chunk = 1024) =>
    new ReadableStream<Uint8Array>({
      start(c) {
        const bytes = new TextEncoder().encode(text);
        for (let i = 0; i < bytes.length; i += chunk) c.enqueue(bytes.slice(i, i + chunk));
        c.close();
      },
    });
  const req = (body: ReadableStream<Uint8Array> | string, headers: Record<string, string> = {}) =>
    new Request("http://x/api", { method: "POST", body, headers, duplex: "half" } as RequestInit);

  it("parses a small JSON body", async () => {
    await expect(readJsonBody(req('{"a":1}'), 4096)).resolves.toEqual({ ok: true, value: { a: 1 } });
  });
  it("rejects bodies over the limit without a content-length, and stops reading early", async () => {
    let pulled = 0;
    const big = new ReadableStream<Uint8Array>({
      pull(c) {
        pulled += 1024;
        if (pulled > 2_000_000) c.close();
        else c.enqueue(new Uint8Array(1024).fill(97));
      },
    });
    await expect(readJsonBody(req(big), 4096)).resolves.toEqual({ ok: false, status: 413 });
    expect(pulled).toBeLessThan(64 * 1024);
  });
  it("rejects a declared oversized content-length immediately", async () => {
    await expect(readJsonBody(req(streamOf("{}"), { "content-length": "999999" }), 4096)).resolves.toEqual({ ok: false, status: 413 });
  });
  it("reports invalid JSON as 400", async () => {
    await expect(readJsonBody(req("{nope"), 4096)).resolves.toEqual({ ok: false, status: 400 });
  });
});

describe("security headers (F8)", () => {
  afterEach(() => vi.resetModules());
  it("hides X-Powered-By and sends baseline headers on every route", async () => {
    const config = (await import("../../next.config")).default;
    expect(config.poweredByHeader).toBe(false);
    const rules = await config.headers!();
    const all = rules.find((r) => r.source === "/:path*");
    const names = Object.fromEntries((all?.headers ?? []).map((x) => [x.key.toLowerCase(), x.value]));
    expect(names["x-content-type-options"]).toBe("nosniff");
    expect(names["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(names["x-frame-options"]).toBe("DENY");
    expect(names["permissions-policy"]).toContain("camera=()");
  });
});
