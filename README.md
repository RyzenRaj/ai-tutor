# AI Visual Tutor

A workspace where a learner picks (or asks for) a technical concept and sees it happen: code with highlighted lines, an animated visual, a plain-language explanation, and check-yourself questions — all driven by the **same active lesson step**.

Status: binary search, SQL JOIN (INNER/LEFT) and a simplified Spark shuffle work end to end as **verified simulations**; other topics get an **illustrative whiteboard**. OpenRouter is wired behind a provider interface; without a key the app runs in a clearly labeled demo mode. Auth/persistence is planned, not built. See [`docs/implementation-plan.md`](docs/implementation-plan.md).

## Requirements

- Node.js ≥ 20.9 and npm
- For E2E tests: `npx playwright install chromium` (once)

## Run locally

```bash
npm install
cp .env.example .env.local   # optional — add OPENROUTER_API_KEY for live AI
npm run dev                  # http://localhost:3000
```

Keyboard: `←` / `→` step, `Space` play/pause, `R` replay.

## Environment variables (server-side only)

| Variable | Default | Notes |
|---|---|---|
| `OPENROUTER_API_KEY` | — | Empty → demo mode (deterministic fixtures, labeled in the UI). |
| `OPENROUTER_MODEL` | `openrouter/free` | Must be `openrouter/free` or end in `:free` unless `OPENROUTER_ALLOW_PAID=true`. |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | Must be https. |
| `OPENROUTER_ALLOW_PAID` | `false` | Explicit opt-in before any possibly-paid model is used. |
| `OPENROUTER_TIMEOUT_MS` | `30000` | Max 60000. |
| `APP_URL` | — | Optional, sent as `HTTP-Referer`. |

The key never reaches the browser, logs, prompts or committed files. `/api/status` reports only the mode and model name.

## Test

```bash
npm run typecheck
npm run lint
npm test            # unit + route tests (Vitest)
npm run build
npm run test:e2e    # Playwright against the production build, live AI forced off
npm run check       # all of the above
```

## Deploy (Vercel)

1. Import the repo in Vercel (framework: Next.js; defaults are fine).
2. Project → Settings → Environment Variables: add `OPENROUTER_API_KEY` (and optionally `OPENROUTER_MODEL`) for Production/Preview. Do not prefix with `NEXT_PUBLIC_`.
3. Deploy. Note: the API rate limiter is in-memory per instance — see ADR 0004 before relying on it for cost control.

## Layout

```
src/lib/scene/schema.ts      Visual scene contract v1 (zod)
src/lib/lesson/schema.ts     Lesson + step contract (zod)
src/lib/lesson/runtime.ts    Pure playback reducer
src/lib/engines/*            Deterministic concept engines + whiteboard fallback
src/lib/registry.ts          Capability registry
src/lib/ai/*                 Provider interface, OpenRouter provider, planner
src/app/api/lesson           POST {prompt} → validated lesson
src/components/*             Workspace, SceneRenderer (FLIP + arrows), CodePanel, controls
docs/                        Brief, architecture, scene contract, plan, ADRs
```
