# Contributing

## Workflow

1. Branch from `main`: `feature/<short-name>` or `fix/<short-name>`. Never commit to `main` directly; never force-push shared branches.
2. Work in small increments. Each one has observable acceptance criteria and tests.
3. Open a pull request. CI (`.github/workflows/ci.yml`) must be green: lint, types, unit, integration, build, demo build, E2E.
4. Run the quality review (`docs/quality/review-checklist.md`) and fill in the PR template with real evidence.
5. Merge only after review and green checks. Vercel deploys the preview per PR and production from `main` (see README).

Never commit `.env*` (except `.env.example` placeholders), API keys, tokens or personal data.

## Test-driven development

For new behaviour and bug fixes:

1. Write the acceptance criterion as a test.
2. Run it and **watch it fail for the expected reason** (not a typo or import error).
3. Make the smallest change that passes.
4. Run the targeted test, then the wider suites.
5. Refactor without changing behaviour; rerun.
6. Update docs if behaviour or setup changed.

Rules:

- Don't assert on implementation details or duplicate the code under test; assert on behaviour a learner or caller can observe.
- Don't weaken assertions, add `.skip`, or mock away the thing under test to get a green build.
- A UI timing test must fail on the broken build. Check that by running it against the old code once (see the F1/F3/F4 tests).
- For legacy code where test-first isn't practical, add a characterization test first, then refactor.

## Test layers

| Layer | Where | Runs | What |
|---|---|---|---|
| Unit | `tests/unit` | `npm run test:unit` | engines, schemas, playback reducer, view/animation maths, providers, security helpers |
| Integration | `tests/integration` | `npm run test:integration` | request → planner → engine → schema → runtime; sync invariants for every capability |
| E2E | `tests/e2e` | `npm run build && npm run test:e2e` | learner journeys in Chromium (desktop + Pixel 7 smoke), transitions, a11y (axe), failure states |

External services are never called in tests: OpenRouter is mocked (`fetch` stubs / fake provider) and E2E runs with no key (demo mode). Voice uses the mock provider in tests.

React component tests (React Testing Library) are not used yet: UI behaviour is covered end to end in a real browser, which also exercises layout and animation. Add RTL when a component gets logic worth isolating.
