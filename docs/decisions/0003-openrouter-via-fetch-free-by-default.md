# ADR 0003 — OpenRouter via plain fetch, free models by default

**Status:** accepted · 2026-10-22

**Context.** Need a swappable provider; must never incur charges silently. OpenRouter exposes an OpenAI-compatible `POST /api/v1/chat/completions` with `response_format: {type: "json_schema"}`; support varies by model/provider, and `provider.require_parameters: true` restricts routing to endpoints that support the requested parameters. `openrouter/free` picks a random available free model and may have lower rate limits. (Verified against openrouter.ai docs on 2026-10-22.)

**Decision.** A small `LLMProvider` interface (`completeJSON`) with an `OpenRouterProvider` using `fetch` (no SDK dependency), `strict: false` JSON schema as a hint + our own zod validation as the authority, 30 s timeout, typed error mapping, one repair retry. Default model `openrouter/free`; any model not `openrouter/free` or `*:free` is refused unless `OPENROUTER_ALLOW_PAID=true`. No automatic fallback to other models.

**Consequences.** + Swap providers by adding a class. + No accidental spend. − Free-router output quality varies between calls; the repair retry and validation absorb some of that. Revisit an SDK if we need streaming or tool calls.
