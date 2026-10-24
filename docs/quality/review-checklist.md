# Quality review workflow

A repeatable review for every feature and release. It is run as a **separate pass from implementation**: finish the change, then switch roles and review it against this list. When the same coding agent does both, say so in the report; do not call it an independent review.

## 1. Gather evidence (never from memory)

```bash
npm ci
npm run typecheck && npm run lint
npm run test:unit && npm run test:integration
npm run build && npm run test:e2e
# Browser evidence against a running build:
npm start &                                   # or a Vercel preview URL
REVIEW_URL=http://localhost:3000 npm run review:browser > review.json
```

`review:browser` reports console errors, failed requests, long tasks, zoom per step, steps with no focus marker, per-frame motion speed (normal / reversed / rapid navigation), and axe violations for Canvas and Editor. It gathers evidence; the reviewer judges it.

Record what you did **not** verify (real model calls, other browsers, physical devices, production).

## 2. Assess each area

| Area | Ask | Typical evidence |
|---|---|---|
| Functional correctness | Do the acceptance criteria hold? Edge cases (empty, single, absent, duplicates, NULLs)? | unit + integration tests |
| Pedagogy | Definition → why → analogy (and where it breaks) → preview → walkthrough → check → summary? Is each step one idea? Would a learner know *why* the step happens? | read the lesson end to end |
| Synchronization | Do code line, diagram, state, note and focus ring describe the same step on every step? | `tests/integration/lesson-pipeline`, F2/F3 E2E |
| Animation | Smooth, consistent timing; interrupted and rapid navigation; no teleports (> 4 px/ms); reduced motion is instant | `review:browser` motion, F3 E2E |
| Accessibility | Keyboard only, visible focus, labels, contrast (axe serious/critical = 0), screen-reader text | `tests/e2e/a11y.spec.ts` |
| Responsive / browsers | 400 px wide, no page-level horizontal scroll; pinch/zoom on touch | smoke (Pixel 7), screenshots |
| States | Loading, empty, error, retry, recovery; previous lesson kept on failure | `tests/e2e/failure-states.spec.ts` |
| Security & isolation | Secrets server-side only; input bounded; rate limits not bypassable; (Phase 5) one user cannot read another's data | `tests/unit/security.test.ts`, route tests |
| Performance | Long tasks, rerenders in loops, timers/animations cleaned up, memory growth on long sessions | `review:browser` long tasks, DevTools |
| AI failures | Missing key, 401/402/429/5xx, timeout, malformed or invalid output, no silent paid fallback | `tests/unit/ai.test.ts`, route tests |
| Voice | Stale-step audio never plays; stop on navigation; works without audio; autoplay rules | voice unit + E2E |
| Regression risk | What could this change break? Is there a test that would catch it? | diff review |
| Docs & setup | README commands work on a fresh clone; env vars documented; plan/ADRs current | run them |

## 3. Write findings

One entry per issue in `docs/quality/findings-YYYY-MM-DD.md`:

- **ID, title, severity:** blocker (unusable/unsafe, stop release) · critical (core journey broken or data/security exposure) · major (core experience clearly degraded) · minor (noticeable, workaround exists) · suggestion.
- **Repro steps**, **expected**, **actual**, **evidence** (command output, numbers, screenshot), **cause** if known, **recommended fix**, **regression test** that will guard it.
- Mark each as *verified* or *assumption*.

## 4. Act

- In-scope, safe defects: fix with TDD (see `CONTRIBUTING.md`), add the regression test, rerun everything, update the finding's status.
- High-risk or product decisions (pricing, data retention, UX direction): report with options; do not decide silently.
- Never weaken an assertion, skip a test or mock away the behaviour under test to get green.
