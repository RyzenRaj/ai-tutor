# ADR 0001 — Engines compute, the model plans

**Status:** accepted · 2026-10-22

**Context.** The product promise is that visuals are correct. LLMs produce plausible but sometimes wrong algorithm traces.

**Decision.** The model only (a) picks a capability, (b) proposes example inputs, (c) writes an intro, or (d) for unknown topics drafts an *illustrative* whiteboard. Deterministic engines compute every verified state, narration and scene. Engine params are zod-validated; invalid params fall back to the built-in example with a visible notice.

**Consequences.** + Verified lessons are testable and replayable. + Model swaps can't corrupt simulations. − New concepts need engineering work (an engine) to be "verified". − Narration for verified lessons is templated, so less personalised until we add model-written commentary *around* (not instead of) engine facts.
