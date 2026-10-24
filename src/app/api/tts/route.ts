import { connection } from "next/server";
import { z } from "zod";
import { createRateLimiter } from "@/lib/server/rate-limit";
import { clientKey, readJsonBody } from "@/lib/server/request";
import { MAX_TTS_CHARS, TtsError, VOICE_ID, readTtsConfig, synthesizeUpstream } from "@/lib/server/tts";

const BodySchema = z.object({
  text: z.string().trim().min(1).max(MAX_TTS_CHARS),
  voice: z.string().regex(VOICE_ID).optional(),
});
const limiter = createRateLimiter(30, 60_000);
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

function config() {
  try {
    return { cfg: readTtsConfig() };
  } catch (err) {
    return { cfg: null, error: err instanceof Error ? err.message : "Invalid voice configuration" };
  }
}

/** Whether server voice is configured. Never reveals the endpoint. */
export async function GET() {
  await connection();
  const { cfg } = config();
  return json(cfg ? { available: true, provider: "kokoro" } : { available: false });
}

export async function POST(request: Request) {
  const rl = limiter(clientKey(request.headers, { trustForwardedFor: process.env.TRUST_PROXY_FORWARDED_FOR === "true" }));
  if (!rl.ok) return json({ error: "Too many narration requests. Slow down a little." }, 429, { "Retry-After": String(rl.retryAfterSeconds) });

  const { cfg, error } = config();
  if (!cfg) return json({ error: error ?? "Voice narration is not configured on this server." }, 503);

  const raw = await readJsonBody(request, 4096);
  if (!raw.ok && raw.status === 413) return json({ error: "Request too large" }, 413);
  const parsed = raw.ok ? BodySchema.safeParse(raw.value) : null;
  if (!parsed?.success) return json({ error: `Send {"text": string} with 1–${MAX_TTS_CHARS} characters.` }, 400);

  const started = Date.now();
  try {
    const audio = await synthesizeUpstream(cfg, parsed.data.text, parsed.data.voice);
    console.info(JSON.stringify({ event: "tts", ms: Date.now() - started, bytes: audio.bytes.byteLength }));
    return new Response(audio.bytes, { status: 200, headers: { "Content-Type": audio.contentType, "Cache-Control": "no-store" } });
  } catch (err) {
    const status = err instanceof TtsError ? err.status : 502;
    console.info(JSON.stringify({ event: "tts", ms: Date.now() - started, error: status }));
    return json({ error: err instanceof Error ? err.message : "Narration failed" }, status);
  }
}
