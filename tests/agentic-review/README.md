# Mosaic Agentic Review Harness

This harness turns Playwright into a reusable review pipeline for multi-agent UI critique.

## What It Adds

- `config.ts` defines journeys, expectations, inspiration, and expert panel lenses.
- `agentic-review.spec.ts` executes the journeys across the Playwright projects named `agentic-review-*`.
- `build-report.ts` digests screenshots, DOM snapshots, and soft checks into review artifacts.
- `guidance.md` is the shared design brief for reviewers.
- `panel-feedback.schema.json` is the structured feedback shape agents should return.

## Run Locally

```sh
npm run test:agentic
```

The Playwright config starts the production-shaped Vite preview under `/mosaic/v4/`.

## Run Against Live v4

```sh
npm run test:agentic:live
```

This points the same journeys at `http://gitbrain.com/mosaic/v4/` and skips the local web server.

## Rebuild The Report Only

```sh
npm run test:agentic:report
```

Artifacts are written under:

```text
tests/agentic-review/artifacts/latest/
```

## Add A Journey

Edit `reviewJourneys` in `config.ts`. Prefer data-driven steps first:

- `goto`
- `hardExpectVisible`
- `checkVisible`
- `checkCountAtLeast`
- `checkAnyVisible`
- `click`
- `fill`
- `wait`
- `screenshot`
- `snapshot`

Use `hardExpectVisible` only for critical app contracts. Use `check*` steps for design expectations that should be visible to reviewers without making the whole run brittle.

## Add A Panel Lens

Edit `reviewPanelExperts` in `config.ts`. Each expert should have a clear lens, prompt, and focus list. The report builder will include it automatically in `agent-panel-prompt-pack.md`.

## Feedback Loop

1. Run the harness.
2. Send `agent-panel-prompt-pack.md` plus the referenced screenshots/snapshots to the review agents.
3. Ask each agent to return JSON matching `panel-feedback.schema.json`.
4. Convert repeated findings into implementation guidance and new Playwright expectations.
