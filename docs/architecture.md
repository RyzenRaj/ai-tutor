# Architecture

Modular monolith: one Next.js (App Router) app. No microservices or multi-agent setup until there is evidence they're needed.

```
          ┌──────────── browser ─────────────┐
 prompt → │ Workspace ──POST /api/lesson──┐  │
          │   │  quick picks / custom input│  │  (engines are pure TS, so built-in
          │   │  build lessons locally ────┼──┼── examples run without a server call)
          │   ▼                            │  │
          │ Lesson (validated) ─► active step ─┬─► Canvas (default): drawing, focus ring,
          │                                    │    teacher note + arrow, question, variables,
          │                                    │    current-line strip, learner ink, pan/zoom
          │                                    └─► Editor tab: full code + highlighted lines
          └───────────────────────────────────┘
                                          │
              ┌──────── server ───────────▼───────────────┐
              │ route: bound body, rate limit, log meta    │
              │ planner ──► LLMProvider (OpenRouter|Fake)   │
              │   │  model → {capabilityId, params, intro}  │
              │   ▼  zod-validate                           │
              │ registry → engine.build(params) → Lesson    │
              │   (or whiteboard plan → illustrative Lesson)│
              │ LessonSchema.parse → JSON                   │
              └─────────────────────────────────────────────┘
```

## Responsibilities

| Module | Owns | Must not |
|---|---|---|
| `lib/scene/schema` | Scene contract v1, structural invariants (unique ids, arrow targets, pointer ranges) | Contain styling or executable content |
| `lib/lesson/schema` | Lesson/step contract; highlight lines within code; consistent fidelity | Know about any specific concept |
| `lib/lesson/runtime` | Transient playback state (pure reducer) | Be persisted with the lesson |
| `lib/engines/*` | Domain computation + narration + scene for each step | Call a model |
| `lib/registry` | Capability lookup, params schemas, defaults, deterministic topic matching | Build lessons without validating params |
| `lib/ai/*` | Provider interface, OpenRouter transport, planning prompt, repair policy | Compute domain results; fall back to another (paid) model |
| `app/api/*` | HTTP boundary: limits, errors, logging | Log prompts, content or secrets |
| `components/TeachingCanvas` | The classroom: board layout, pan/zoom/pinch, teacher callout, learner ink (per lesson, not persisted) | Hold lesson state; compute domain facts |
| `components/*` (others) | Rendering only; Editor view is separate from the canvas | Trust network data without re-validating |

## Key flows and failure handling

- **Demo mode** (no key): deterministic keyword planner + fixtures; UI shows "Demo mode" / "Demo fixture".
- **Live**: one model call; on malformed/invalid output, **one** repair call, then a clear error. Invalid engine params → built-in example with a visible notice. 401/402/429/5xx/timeouts map to typed `ProviderError`s and user-facing messages; 402 never triggers a fallback model.
- **Client**: re-validates the lesson it receives; 45 s client timeout; previous lesson remains on error.

## Data and multi-user (planned, Phase 5)

Supabase Auth + Postgres with RLS. Proposed tables: `lessons(id, owner_id, capability_id, params jsonb, lesson jsonb, schema_version, created_at)`, `progress(user_id, lesson_id, step_index, checkpoint_results jsonb, updated_at)`. Policies: `owner_id = auth.uid()` for all operations; lessons store **params + schema version** so they can be rebuilt by newer engines. Isolation tests will exercise two users against a real Supabase project.
