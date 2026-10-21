/**
 * Fixed-window, in-memory rate limiter. Per server instance only — on Vercel each
 * instance has its own memory, so this is a guard rail, not a global quota.
 * Replace with a shared store (e.g. Postgres/Redis) before relying on it for cost control.
 */
export function createRateLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return function check(key: string): { ok: boolean; retryAfterSeconds: number } {
    const t = now();
    if (hits.size > 10_000) for (const [k, v] of hits) if (v.resetAt <= t) hits.delete(k);
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= t) {
      hits.set(key, { count: 1, resetAt: t + windowMs });
      return { ok: true, retryAfterSeconds: 0 };
    }
    if (entry.count >= limit) return { ok: false, retryAfterSeconds: Math.ceil((entry.resetAt - t) / 1000) };
    entry.count++;
    return { ok: true, retryAfterSeconds: 0 };
  };
}
