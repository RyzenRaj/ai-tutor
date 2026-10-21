import "server-only";
import { type JsonRequest, type JsonResult, type LLMProvider, ProviderError, parseJsonText } from "./provider";

/**
 * OpenRouter provider over its OpenAI-compatible Chat Completions endpoint, using plain fetch
 * (no SDK dependency). Docs: https://openrouter.ai/docs/api/reference/overview
 * Structured outputs: https://openrouter.ai/docs/guides/features/structured-outputs
 */

export type OpenRouterConfig = {
  apiKey: string;
  model: string;
  baseUrl: string;
  allowPaid: boolean;
  timeoutMs: number;
  appUrl?: string;
};

export const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const DEFAULT_OPENROUTER_MODEL = "openrouter/free";

/** Free = the free router or an explicit `:free` variant. Anything else may cost money. */
export function isFreeModel(model: string): boolean {
  return model === "openrouter/free" || model.endsWith(":free");
}

export function readOpenRouterConfig(env: Record<string, string | undefined> = process.env): OpenRouterConfig | null {
  const apiKey = env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) return null;
  const model = env.OPENROUTER_MODEL?.trim() || DEFAULT_OPENROUTER_MODEL;
  const baseUrl = (env.OPENROUTER_BASE_URL?.trim() || DEFAULT_OPENROUTER_BASE_URL).replace(/\/+$/, "");
  if (!/^https:\/\//.test(baseUrl)) throw new ProviderError("config", "OPENROUTER_BASE_URL must use https");
  return {
    apiKey,
    model,
    baseUrl,
    allowPaid: env.OPENROUTER_ALLOW_PAID === "true",
    timeoutMs: Number(env.OPENROUTER_TIMEOUT_MS) > 0 ? Math.min(Number(env.OPENROUTER_TIMEOUT_MS), 60_000) : 30_000,
    appUrl: env.APP_URL?.trim() || undefined,
  };
}

export class OpenRouterProvider implements LLMProvider {
  readonly name = "openrouter";
  readonly model: string;

  constructor(
    private readonly config: OpenRouterConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    if (!isFreeModel(config.model) && !config.allowPaid) {
      throw new ProviderError(
        "config",
        `Model "${config.model}" may be paid. Use "openrouter/free" or a ":free" model, or set OPENROUTER_ALLOW_PAID=true to opt in explicitly.`,
      );
    }
    this.model = config.model;
  }

  async completeJSON<T>(req: JsonRequest<T>): Promise<JsonResult<T>> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.apiKey}`,
      "Content-Type": "application/json",
      "X-Title": "AI Visual Tutor",
    };
    if (this.config.appUrl) headers["HTTP-Referer"] = this.config.appUrl;

    const body = {
      model: this.config.model,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.user },
      ],
      temperature: 0.2,
      max_tokens: req.maxTokens ?? 1500,
      response_format: {
        type: "json_schema",
        json_schema: { name: req.schemaName, strict: false, schema: req.jsonSchema },
      },
      // Only route to endpoints that support response_format.
      provider: { require_parameters: true },
    };

    let res: Response;
    try {
      res = await this.fetchImpl(`${this.config.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch (err) {
      const name = (err as { name?: string })?.name;
      if (name === "TimeoutError" || name === "AbortError") throw new ProviderError("timeout", "The AI provider timed out");
      throw new ProviderError("unavailable", "Could not reach the AI provider");
    }

    if (!res.ok) throw await toProviderError(res);

    let payload: unknown;
    try {
      payload = await res.json();
    } catch {
      throw new ProviderError("bad_response", "Provider returned a non-JSON response");
    }
    const p = payload as {
      model?: string;
      error?: { message?: string; code?: number };
      choices?: { message?: { content?: string | null } }[];
    };
    if (p.error) throw new ProviderError("unavailable", `Provider error: ${String(p.error.message ?? "unknown").slice(0, 200)}`);
    const content = p.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) throw new ProviderError("bad_response", "Model returned no content");

    const value = req.validate(parseJsonText(content));
    return { value, model: p.model ?? this.config.model };
  }
}

async function toProviderError(res: Response): Promise<ProviderError> {
  let message = "";
  try {
    const j = (await res.json()) as { error?: { message?: string } };
    message = String(j.error?.message ?? "").slice(0, 200);
  } catch {
    /* ignore */
  }
  const retryAfter = Number(res.headers.get("retry-after")) || undefined;
  switch (res.status) {
    case 400:
      return new ProviderError("bad_request", message || "The provider rejected the request");
    case 401:
    case 403:
      return new ProviderError("auth", "OpenRouter rejected the API key");
    case 402:
      return new ProviderError("payment_required", "OpenRouter reports insufficient credits. No other model was tried.");
    case 404:
      return new ProviderError("unavailable", message || "Model not found or no endpoint supports this request");
    case 408:
      return new ProviderError("timeout", "The provider timed out");
    case 429:
      return new ProviderError("rate_limited", "The AI provider is rate limiting requests", retryAfter);
    default:
      return new ProviderError("unavailable", message || `Provider returned HTTP ${res.status}`);
  }
}
