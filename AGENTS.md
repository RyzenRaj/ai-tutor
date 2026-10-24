<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project workflow (all agents)

- Branch + PR workflow, TDD rules and test layers: `CONTRIBUTING.md`.
- Quality review procedure: `docs/quality/review-checklist.md` (Claude Code: `/quality-review` skill in `.claude/skills/`).
- Roadmap and status: `docs/implementation-plan.md`. Decisions: `docs/decisions/`.
- Engines compute every verified state; models never invent simulation states (ADR 0001).
- Never commit secrets; never call real model or TTS services from tests.
