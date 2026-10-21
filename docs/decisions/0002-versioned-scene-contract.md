# ADR 0002 — Typed, versioned, data-only scene contract

**Status:** accepted · 2026-10-22

**Context.** Scenes come from engines today and may come from models; rendering untrusted executable content (JS/HTML/SVG paths) is an XSS and correctness risk.

**Decision.** `Scene v1` is a zod-validated discriminated union of a few primitives (array, table, container+chips, box, text, one-level group, arrows) with semantic tones and stable ids. Engine output and model output pass the same `LessonSchema.parse`. Animation is derived by the renderer from id continuity (FLIP), not from per-step animation scripts.

**Alternatives.** Free-form SVG from the model (rejected: unsafe, unverifiable); a universal diagram DSL up front (rejected: speculative). Absolute coordinates (rejected for now: layout via flex/grid is responsive and simpler).

**Consequences.** + Safe by construction; one renderer serves three different concept families. − Layout control is coarse; complex graphs will need a new primitive (e.g. `graph` with auto-layout) when a concept demands it — bump `version` if breaking.
