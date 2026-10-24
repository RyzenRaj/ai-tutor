/**
 * Server side of voice narration (P5): a thin, bounded proxy to a self-hosted
 * OpenAI-compatible speech endpoint such as Kokoro-FastAPI (`POST /v1/audio/speech`).
 * The endpoint URL and key stay on the server. Audio is streamed through, never stored.
 */
import { MAX_TTS_CHARS } from "@/lib/voice/types";

export type TtsConfig = { baseUrl: string; model: string; voice: string; apiKey?: string; timeoutMs: number };

export const VOICE_ID = /^[a-z]{1,3}_[a-z0-9]{1,24}$/;
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024; // under Vercel's 4.5 MB response limit
export { MAX_TTS_CHARS };

export function readTtsConfig(env: Record<string, string | undefined> = process.env): TtsConfig | null {
  const raw = env.KOKORO_TTS_URL?.trim();
  if (!raw) return null;
  const url = new URL(raw);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) throw new Error("KOKORO_TTS_URL must use https (http is allowed only for localhost)");
  const voice = env.KOKORO_TTS_VOICE?.trim() || "af_heart";
  if (!VOICE_ID.test(voice)) throw new Error("KOKORO_TTS_VOICE must look like af_heart");
  return {
    baseUrl: raw.replace(/\/+$/, ""),
    model: env.KOKORO_TTS_MODEL?.trim() || "kokoro",
    voice,
    apiKey: env.KOKORO_TTS_API_KEY?.trim() || undefined,
    timeoutMs: Number(env.KOKORO_TTS_TIMEOUT_MS) > 0 ? Math.min(Number(env.KOKORO_TTS_TIMEOUT_MS), 60_000) : 20_000,
  };
}

export class TtsError extends Error {
  constructor(
    readonly status: 502 | 503 | 504,
    message: string,
  ) {
    super(message);
  }
}

/** Calls the upstream and returns validated audio bytes. */
export async function synthesizeUpstream(cfg: TtsConfig, text: string, voice?: string, fetchImpl: typeof fetch = fetch) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
  let res: Response;
  try {
    res = await fetchImpl(`${cfg.baseUrl}/v1/audio/speech`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model: cfg.model, input: text, voice: voice ?? cfg.voice, response_format: "wav" }),
      signal: AbortSignal.timeout(cfg.timeoutMs),
    });
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === "TimeoutError" || name === "AbortError") throw new TtsError(504, "The voice service took too long to respond.");
    throw new TtsError(502, "Could not reach the voice service.");
  }
  if (!res.ok) throw new TtsError(502, `The voice service returned HTTP ${res.status}.`);
  const type = res.headers.get("content-type") ?? "";
  if (!type.startsWith("audio/")) throw new TtsError(502, "The voice service did not return audio.");
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_AUDIO_BYTES) throw new TtsError(502, "The narration audio was too large.");
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > MAX_AUDIO_BYTES) throw new TtsError(502, "The narration audio was too large.");
  return { bytes, contentType: type.split(";")[0] };
}
