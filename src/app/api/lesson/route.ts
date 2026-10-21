import { z } from "zod";
import { MAX_PROMPT_CHARS, planLive, planMock } from "@/lib/ai/planner";
import { OpenRouterProvider, readOpenRouterConfig } from "@/lib/ai/openrouter";
import { ProviderError } from "@/lib/ai/provider";
import { createRateLimiter } from "@/lib/server/rate-limit";

const BodySchema = z.object({ prompt: z.string().trim().min(2).max(MAX_PROMPT_CHARS) });
const limiter = createRateLimiter(10, 60_000);

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
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const rl = limiter(ip);
  if (!rl.ok) return json({ error: "Too many requests. Slow down a little." }, 429, { "Retry-After": String(rl.retryAfterSeconds) });

  const len = Number(request.headers.get("content-length") ?? 0);
  if (len > 4096) return json({ error: "Request too large" }, 413);

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch {
    return json({ error: `Send {"prompt": string} with 2–${MAX_PROMPT_CHARS} characters.` }, 400);
  }

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
