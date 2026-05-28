# Mosaic — Project Rules

This repository follows a strict set of principles to keep the platform clean, maintainable, and true to its vision.

## Core Principles

- **100% static only (client)** — The delivered experience (GitHub Pages) is 100% static. No runtime backend, databases, or always-running services in the browser app.
- **Research agents are GitHub-native** — Deep research, data gathering, and curation happen via GitHub Actions workflows / agents. These are triggered by Issues (and PRs/comments), run LLM calls (Grok/xAI), validate output, and commit structured JSON data into `public/data/`. The static site is the beautiful read-only viewer of that committed data.
- **Vanilla TypeScript + Vite** — No React, no heavy frameworks. Prefer the simplest solution that works.
- **Mobile-first PWA** — The experience is designed primarily for mobile. Desktop is an enhancement, not the source of truth.
- **Neutral foundation in Phase 1a** — All visual work in Phase 1a uses a clean neutral scaffold. The full brand identity (lattice motif, Deep Charcoal #1C1C1E, Warm Bronze #C9A86C, Soft Ivory, Muted Taupe, refined typography) is applied only in Phase 1b after the brand report and mobile research are incorporated.
- **No domain seeding** — The platform must never feel like "Pizza Atlas plus extras". All example content must be generic and domain-agnostic.

## Implementation Rules

- All data loading must go through `src/lib/data-loader.ts`.
- The Curation Studio AI assistant lives only in `src/lib/assistant.ts` — keep its command surface small, deterministic, and extremely reliable.
- Map rendering logic belongs in `src/lib/map-renderer.ts`.
- Never introduce a new runtime dependency without a one-paragraph justification and explicit maintainer approval.
- Prefer the simplest DOM solution that works. Avoid complex abstractions when a focused module will do.
- Update this file whenever a new enduring convention is discovered during implementation.

## Research / Curation Workflow (Important)

The "backend" for growing maps is **not** a traditional server. It is a set of GitHub Actions-powered agents:

1. A new topic or research task is proposed via a GitHub Issue (or PR comment, etc.).
2. A workflow (see `.github/workflows/research-agent.yml`) picks up the request.
3. One or more jobs execute: they call Grok/xAI, perform deep targeted research (via `scripts/research-agent.ts` and `rich-research.ts`), extract structured evidence, geocode locations, research high-quality product-centered photos, and produce validated JSON matching the `KnowledgeEntry` schema (including photos).
4. For higher accuracy on current details (menus, recent photos, reviews), the pipeline can run real web scrapers (Playwright + Chrome in containers) against business sites and public review platforms. See `scripts/scrapers/`.
5. Real product photos are committed into the repo under `public/data/maps/{slug}/images/`.
6. The agent commits the new/updated map data directly into `public/data/maps/{slug}/`.
5. On next deploy (or manual dispatch), the static site immediately serves the fresh content.

Local development uses the same scripts + a `.xai-key` file (never committed).

See `.github/agents/README.md` for more details.

This keeps the **user-facing product** pure static while still enabling powerful community-driven, LLM-augmented curation.

## Testing & Data Quality (Mandatory)

All changes must pass the local test suite before being pushed or merged:

- `npm test` — Runs typecheck + data coordinate validation + smoke tests.
- `npm run validate-data` — Explicitly runs the coordinate sanity checker against every map's `entries.json`. This is the primary guard against the "locations are all off on the map" class of bug.
- `npm run test:regression` — Runs the full visual design regression (multi-viewport + light/dark) used for design board reviews. Produces the screenshots in `tests/screenshots/design-review/`.

New research data **must** pass `validate-map-coordinates.ts` before being committed (the validator is wired into `npm test` and will be enforced in CI).

See `.github/PUSH_AND_TEST_PLAN.md` for the full model of how testing integrates with GitHub push, Pages deployment, and research agent workflows.

## Phase Awareness

- **Phase 1a**: Functional completeness with neutral visual skin + mobile-first layouts + basic PWA foundations.
- **Phase 1b**: Full brand identity application + refined mobile/PWA patterns (after brand report + research delivered).

Follow the approved plan at `.grok/sessions/.../plan.md` for the current execution order.
