# ADR 0004 — In-memory rate limit as a stopgap

**Status:** accepted (temporary) · 2026-10-22

**Decision.** `/api/lesson` allows 10 requests/minute per client IP using an in-process fixed window, plus a 500-char prompt limit and 4 KB body limit.

**Consequences.** Works for local/dev and single-instance use. On Vercel each instance has its own memory, so this is not a global quota. Replace with a shared store (Postgres/Upstash) and per-user limits once auth exists (Phase 5), before public launch.
