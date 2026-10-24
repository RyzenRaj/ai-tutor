---
name: quality-review
description: Run the AI Visual Tutor quality review for a feature or release - gather evidence (tests, build, browser review, axe), assess every checklist area, and write prioritized findings with repro steps and regression tests.
---

# Quality review (AI Visual Tutor)

Follow `docs/quality/review-checklist.md` exactly. Summary:

1. Work as a reviewer, separate from implementation. If you also wrote the change, say so in the report; don't claim independence.
2. Gather evidence by running the commands in section 1 of the checklist, including `npm run review:browser` against a running build or preview URL. Record real pass/fail counts and anything you could not verify.
3. Assess every area in section 2 (correctness, pedagogy, synchronization, animation, accessibility, responsive, states, security/isolation, performance, AI failures, voice, regression risk, docs).
4. Write findings to `docs/quality/findings-YYYY-MM-DD.md` with severity, repro, expected/actual, evidence, cause, fix and regression test. Mark each one verified or assumption.
5. For safe in-scope defects: fix test-first per `CONTRIBUTING.md` (prove the test fails first), rerun all suites, update the finding status. For product or high-risk decisions, propose options instead.
6. Never weaken or skip tests to get green, and never report a check, deployment or push that did not actually happen.
