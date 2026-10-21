/**
 * Provider-independent LLM interface. The teaching engine depends only on this,
 * so OpenRouter (or any other provider) can be swapped without touching lessons.
 * Server-only: implementations read secrets from process.env.
 */

export type ProviderErrorCode =
  | "config" // missing/invalid configuration
  | "auth" // bad key
  | "payment_required" // no credits — never auto-switch to another model
  | "rate_limited"
  | "unavailable" // provider/model down or no endpoint supports the request
  | "timeout"
  | "bad_request"
  | "bad_response"; // malformed / schema-invalid output

export class ProviderError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
  get retryable() {
    return this.code === "rate_limited" || this.code === "unavailable" || this.code === "timeout";
  }
}

export type JsonRequest<T> = {
  system: string;
  user: string;
  schemaName: string;
  /** JSON Schema sent to the provider as a hint; `validate` is the real authority. */
  jsonSchema: Record<string, unknown>;
  validate: (value: unknown) => T;
  maxTokens?: number;
};

export type JsonResult<T> = { value: T; model: string };

export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  completeJSON<T>(req: JsonRequest<T>): Promise<JsonResult<T>>;
}

/** Extract a JSON value from model text (tolerates ```json fences). */
export function parseJsonText(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  const body = fenced ? fenced[1] : trimmed;
  try {
    return JSON.parse(body);
  } catch {
    const start = body.indexOf("{");
    const end = body.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(body.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
    throw new ProviderError("bad_response", "Model did not return valid JSON");
  }
}
