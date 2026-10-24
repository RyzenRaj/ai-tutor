/**
 * Request helpers for route handlers (findings F6, F7).
 */

/**
 * Rate-limit key for the caller. Only headers set by the hosting platform are trusted:
 * Vercel sets `x-vercel-forwarded-for` / `x-real-ip`. `X-Forwarded-For` is client-controlled
 * unless a trusted proxy rewrites it, so it is ignored unless explicitly enabled
 * (TRUST_PROXY_FORWARDED_FOR=true), and then only its last hop is used.
 * Callers without a trusted IP share one "anonymous" bucket.
 */
export function clientKey(headers: Headers, opts: { trustForwardedFor?: boolean } = {}): string {
  const first = (v: string | null) => v?.split(",")[0]?.trim() || null;
  const fromPlatform = first(headers.get("x-vercel-forwarded-for")) ?? first(headers.get("x-real-ip"));
  if (fromPlatform) return fromPlatform;
  if (opts.trustForwardedFor) {
    const hops = headers.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean);
    if (hops?.length) return hops[hops.length - 1];
  }
  return "anonymous";
}

export type JsonBodyResult = { ok: true; value: unknown } | { ok: false; status: 400 | 413 };

/** Read and parse a JSON body, refusing more than `maxBytes` without buffering the rest. */
export async function readJsonBody(request: Request, maxBytes: number): Promise<JsonBodyResult> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, status: 413 };
  if (!request.body) return { ok: false, status: 400 };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      return { ok: false, status: 413 };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.byteLength;
  }
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { ok: false, status: 400 };
  }
}
