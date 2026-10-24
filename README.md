# AI Visual Tutor

A teaching **canvas**: pick (or ask for) a technical concept and the tutor teaches it on a whiteboard — drawing the concept, writing each explanation as a note, circling what it's talking about, asking check-yourself questions, and animating every step. The full code lives in a separate **Editor** tab. Canvas and editor follow the **same active lesson step**.

Status: binary search, SQL JOIN (INNER/LEFT) and a simplified Spark shuffle work end to end as **verified simulations**; other topics get an **illustrative whiteboard**. OpenRouter is wired behind a provider interface; without a key the app runs in a clearly labeled demo mode. Auth/persistence is planned, not built. See [`docs/implementation-plan.md`](docs/implementation-plan.md).

## Requirements

- Node.js ≥ 20.9 and npm
- For E2E tests: `npx playwright install chromium` (once)

## Run locally

**Windows, easiest:** double-click `start.cmd`. It installs packages on the first run, starts the app and opens http://localhost:3000.

Or from a terminal:

```bash
npm install
cp .env.example .env.local   # optional — add OPENROUTER_API_KEY for live AI
npm run dev                  # http://localhost:3000
```

Keyboard: `←` / `→` step, `Space` play/pause, `R` replay, `+` / `−` zoom, `0` fit.
Canvas: drag to pan (hand tool), scroll to pan, Ctrl/⌘ + scroll or pinch to zoom; pen, highlighter and eraser for your own notes.

## Environment variables (server-side only)

| Variable | Default | Notes |
|---|---|---|
| `OPENROUTER_API_KEY` | — | Empty → demo mode (deterministic fixtures, labeled in the UI). |
| `OPENROUTER_MODEL` | `openrouter/free` | Must be `openrouter/free` or end in `:free` unless `OPENROUTER_ALLOW_PAID=true`. |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | Must be https. |
| `OPENROUTER_ALLOW_PAID` | `false` | Explicit opt-in before any possibly-paid model is used. |
| `OPENROUTER_TIMEOUT_MS` | `30000` | Max 60000. |
| `APP_URL` | — | Optional, sent as `HTTP-Referer`. |
| `RATE_LIMIT_PER_MINUTE` | `10` | Lesson requests per client per minute (per instance). |
| `LIVE_AI_MAX_PER_MINUTE` | `30` | Global cap on live model calls per instance. |
| `TRUST_PROXY_FORWARDED_FOR` | `false` | Only behind a proxy you control that rewrites `X-Forwarded-For`. |
| `KOKORO_TTS_URL` | — | Self-hosted OpenAI-compatible speech endpoint (https, or http for localhost). Empty → browser voice only. |
| `KOKORO_TTS_VOICE` / `KOKORO_TTS_MODEL` | `af_heart` / `kokoro` | Voice and model sent upstream. |
| `KOKORO_TTS_API_KEY` | — | Optional bearer token for the TTS server. |

The key never reaches the browser, logs, prompts or committed files. `/api/status` reports only the mode and model name.

## Voice narration (optional)

Turn on **🔈 Voice** in the playback bar to have each step read aloud. It is off by default and the lesson works fully without it.

- **Browser voice** works out of the box (Web Speech API; quality depends on your OS voices).
- **Kokoro voice** (free, open-weight) needs a Kokoro server you run yourself, e.g. [Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI):

  ```bash
  docker run -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-cpu:latest   # pin a release tag in practice
  # .env.local
  KOKORO_TTS_URL=http://localhost:8880
  ```

  The app proxies through `/api/tts`, so the URL (and optional `KOKORO_TTS_API_KEY`) never reach the browser. Audio isn't stored. See ADR 0006 for why Kokoro doesn't run inside Vercel Functions or the browser yet.

## No-server demo build

`npm run build:demo` writes `dist-demo/ai-visual-tutor.html`: the same app as one file, demo mode only (no API routes, no model calls; React loads from cdnjs). Useful for sharing a preview.

## Test

```bash
npm run typecheck
npm run lint
npm test            # unit + integration (Vitest); or test:unit / test:integration
npm run build
npm run test:e2e    # Playwright against the production build, live AI forced off
npm run check       # all of the above
REVIEW_URL=http://localhost:3000 npm run review:browser   # quality-review evidence (see docs/quality)
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
src/components/TeachingCanvas  Board: pan/zoom, teacher note + arrow, focus ring, learner ink
src/components/*             Workspace (Canvas | Editor), SceneRenderer (FLIP + arrows), CodePanel, controls
src/app/fonts/               Caveat handwriting font (SIL OFL), bundled locally
docs/                        Brief, architecture, scene contract, plan, ADRs
```
