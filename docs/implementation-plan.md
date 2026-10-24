# Implementation plan & status

Roadmap tracker (stands in for GSD, which is not installed in this environment). Status values: **done** (implemented + checks passed), **partial**, **planned**.

| Phase | Scope | Status | Evidence |
|---|---|---|---|
| 0 | Inspect workspace | done | `D:\learning` had no app code; no GSD install found |
| 1 | Scaffold, contracts, docs, ADRs | done | Next.js 16.4.2 / React 19.3 / TS strict / Tailwind 4 / zod 4; `docs/` |
| 2 | Binary search vertical slice | done | Engine, lesson builder, renderer, controls, checkpoints; unit + E2E sync tests |
| 3 | Registry + SQL JOIN + Spark shuffle + whiteboard fallback | done | Engines + tests; shared scene contract; FLIP + arrows |
| 3b | Canvas-first teaching (feedback: "teach in canvas, editor is a different thing") | done | Board with pan/zoom/pinch, handwritten notes, focus ring + teacher arrow, on-board questions/variables, pen/highlighter/eraser; code moved to a separate Editor tab synced to the step; E2E covers callout, editor sync, ink, zoom, pan |
| 3c | Quality pass (audit, TDD fixes F1–F15, CI, review workflow) | done | `docs/quality/findings-2026-10-24.md`; branch `feature/quality-teaching-voice` |
| 3d | Teaching sequence (definition → why → analogy → preview → walkthrough → check → summary) | done | phases validated by schema; unit + E2E |
| 3e | Voice narration | partial | provider interface, browser voice, Kokoro proxy, controller, tests; **live Kokoro not verified** (ADR 0006) |
| 4 | OpenRouter behind provider interface | partial | Provider, planner, repair policy, paid-model guard, error mapping — tested with mocked `fetch`/fake provider. **Not yet exercised against the real OpenRouter API** (no key in the build environment). |
| 5 | Auth, saved lessons, progress, RLS, isolation tests | planned | Design in `architecture.md`; needs a Supabase project |
| 6 | GitHub + Vercel | blocked | CI workflow and deployment steps ready (`docs/deployment.md`); needs the owner's GitHub/Vercel access |

## Checks (last run)

`npm run typecheck` ✓ · `npm run lint` ✓ · `npm run test:unit` + `test:integration` 167/167 ✓ (14 files) · `npm run build` ✓ · `npm run build:demo` ✓ · `npm run test:e2e` 46/46 ✓ (desktop Chromium + Pixel 7 smoke) — fresh clone, `npm ci`, 2026-10-24.

## Next increments

0. **Push and open the PR** (`docs/deployment.md`), protect `main`, link Vercel; confirm CI is green on GitHub.
1. **Live AI smoke test** with your key: run `npm run dev`, ask "explain a left join" and an unknown topic; confirm mode badge, model name, and graceful 429 behaviour. Add a recorded-response fixture from a real call.
2. **Persistence (Phase 5)**: create Supabase project → migrations for `lessons`/`progress` with RLS → server-side Supabase client → save/load lesson by params → two-user isolation test.
3. **Shared rate limiting** (Postgres or Upstash) before public deployment.
4. Canvas next: persist learner ink per step with saved lessons; step "trail" (earlier notes fade but stay on the board); on-canvas sticky notes typed by the learner; live-AI–written notes around engine facts.
5. Teaching depth: learner-chosen inputs for SQL/Spark, "predict then reveal" mode, checkpoint scoring saved to progress.
6. Next concept candidates (each needs its own engine): two pointers / sliding window, GROUP BY + window functions, Spark skew & broadcast join.

## Known limitations

- Whiteboard lessons are sketches; their content is unverified by design.
- Rate limiter is per-instance memory.
- Spark model ignores spills, AQE, retries, executor placement; DataFrame shuffles use Murmur3 (documented in-lesson).
