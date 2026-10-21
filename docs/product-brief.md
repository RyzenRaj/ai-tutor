# Product brief

**User.** Engineers learning or revising technical concepts — first target: data engineers preparing for interviews (algorithms, SQL, distributed data processing).

**Problem.** Text explanations and static diagrams make learners simulate the concept in their head. Chatbots explain but don't *show*, and AI-drawn diagrams can be confidently wrong.

**Promise.** For the active step, the code line, the picture, the variables and the explanation always describe the same moment. Where we claim a simulation, code — not the model — computed it.

## MVP scope

In:
- Synchronized lesson player: narration, highlighted code, visual scene, state inspector, checkpoints; play/pause/next/prev/replay/scrub; keyboard; reduced motion.
- **Canvas-first**: teaching happens on a pan/zoom board (notes, focus ring + arrow, learner ink); the code editor is a separate tab synced to the same step.
- Verified engines: binary search, SQL INNER/LEFT JOIN, simplified Spark `reduceByKey` shuffle.
- Illustrative whiteboard fallback for other topics, clearly labeled.
- AI planner (OpenRouter) that picks a capability and example inputs; demo mode without a key.

Out (for now):
- Executing user- or model-written code.
- A universal simulator; adding engines is deliberate per concept.
- Accounts, saved lessons, progress (Phase 5 — designed, not built).
- Adaptive teaching beyond single-step checkpoints.

## Acceptance criteria (MVP)

1. Every step of every verified lesson validates against the lesson/scene contracts, and its pointers/rows/chips match the engine state (unit + E2E tests).
2. Binary search is correct against a linear scan on 2,000 random cases, including empty, single-element, duplicates, absent targets and first/middle/last positions.
3. Model output is schema-validated; invalid engine params never reach an engine; the UI labels live AI vs demo fixture vs built-in example, and verified vs illustrative.
4. No secret is exposed client-side; possibly-paid models require explicit opt-in.
5. Works with keyboard only, at phone width without horizontal scroll, and with `prefers-reduced-motion`.
