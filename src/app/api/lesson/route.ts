import { z } from "zod";
import { MAX_PROMPT_CHARS, planLive, planMock } from "@/lib/ai/planner";
import { OpenRouterProvider, readOpenRouterConfig } from "@/lib/ai/openrouter";
import { ProviderError } from "@/lib/ai/provider";
import { createRateLimiter } from "@/lib/server/rate-limit";
import { clientKey, readJsonBody } from "@/lib/server/request";

const BodySchema = z.object({ prompt: z.string().trim().min(2).max(MAX_PROMPT_CHARS) });
const MAX_BODY_BYTES = 4096;
const perClient = Number(process.env.RATE_LIMIT_PER_MINUTE);
const limiter = createRateLimiter(Number.isInteger(perClient) && perClient > 0 ? perClient : 10, 60_000);

/** Global cap on live model calls per instance, independent of client identity (F6). */
const liveLimiters = new Map<number, ReturnType<typeof createRateLimiter>>();
function liveLimiter() {
  const n = Number(process.env.LIVE_AI_MAX_PER_MINUTE);
  const limit = Number.isInteger(n) && n > 0 ? n : 30;
  let l = liveLimiters.get(limit);
  if (!l) liveLimiters.set(limit, (l = createRateLimiter(limit, 60_000)));
  return l;
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

const USER_MESSAGES: Record<ProviderError["code"], string> = {
  config: "The AI tutor is misconfigured on the server.",
  auth: "The AI tutor's API key was rejected.",
  payment_required: "The AI provider reports no credits. No paid fallback was attempted.",
  rate_limited: "The AI tutor is busy (rate limited). Try again shortly.",
  unavailable: "The AI model is unavailable right now. Try again shortly.",
  timeout: "The AI tutor took too long to respond. Try again.",
  bad_request: "The AI provider rejected the request.",
  bad_response: "The AI tutor returned an answer that failed validation.",
};

export async function POST(request: Request) {
  const started = Date.now();
  const key = clientKey(request.headers, { trustForwardedFor: process.env.TRUST_PROXY_FORWARDED_FOR === "true" });
  const rl = limiter(key);
  if (!rl.ok) return json({ error: "Too many requests. Slow down a little." }, 429, { "Retry-After": String(rl.retryAfterSeconds) });

  const raw = await readJsonBody(request, MAX_BODY_BYTES);
  if (!raw.ok && raw.status === 413) return json({ error: "Request too large" }, 413);
  const parsed = raw.ok ? BodySchema.safeParse(raw.value) : null;
  if (!parsed?.success) return json({ error: `Send {"prompt": string} with 2–${MAX_PROMPT_CHARS} characters.` }, 400);
  const body = parsed.data;

  let config;
  try {
    config = readOpenRouterConfig();
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Invalid configuration" }, 500);
  }

  if (!config) {
    const planned = planMock(body.prompt);
    log({ mode: "mock", ms: Date.now() - started, capability: planned.lesson.capabilityId });
    return json(planned);
  }

  const global = liveLimiter()("live-ai");
  if (!global.ok) {
    log({ mode: "live", ms: Date.now() - started, error: "global_cap" });
    return json({ error: "The AI tutor is busy right now. Try again in a minute.", code: "rate_limited" }, 429, { "Retry-After": String(global.retryAfterSeconds) });
  }

  try {
    const provider = new OpenRouterProvider(config);
    const planned = await planLive(provider, body.prompt);
    log({ mode: "live", ms: Date.now() - started, capability: planned.lesson.capabilityId, model: planned.meta.model });
    return json(planned);
  } catch (err) {
    if (err instanceof ProviderError) {
      log({ mode: "live", ms: Date.now() - started, error: err.code });
      const status = err.code === "rate_limited" ? 429 : err.code === "config" ? 500 : 502;
      const headers: Record<string, string> = err.retryAfterSeconds ? { "Retry-After": String(err.retryAfterSeconds) } : {};
      return json({ error: err.code === "config" ? err.message : USER_MESSAGES[err.code], code: err.code }, status, headers);
    }
    log({ mode: "live", ms: Date.now() - started, error: "internal" });
    return json({ error: "Something went wrong while building the lesson." }, 500);
  }
}

/** Operational metadata only — never prompts, keys or lesson content. */
function log(fields: Record<string, string | number | undefined>) {
  console.info(JSON.stringify({ event: "lesson_plan", ...fields }));
}
