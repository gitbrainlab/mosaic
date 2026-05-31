# Mosaic — Project Rules

This repository follows a strict set of principles to keep the platform clean, maintainable, and true to its vision.

## DESIGN SYSTEM — MOSAIC v4 (STRICT — DO NOT DEVIATE)

**Brand Essence**: Quiet luxury, calm authority, high-signal infrastructure.

**Core Palette**:
- Deep Charcoal: #0f0f11 (bg)
- Surface: #17171a (cards)
- Raised Surface: #1f1d1a
- Accent Gold: #c9a86c (primary actions + selection only)
- Text: #e4e4e7 / #a1a1aa
- Border: #27272a

**Logo**: Always use the geometric hex lattice logo in brand gold. Never use placeholder text or the purple favicon as the main logo.

**Golden Rule**: Gold is sacred. Use it only for primary CTAs, active states, selected cards, and key highlights. Everything else stays cool and muted.

**Hierarchy Principle**: Cards should feel like premium tiles. Use background shifts and gold accents for selection. Avoid visual clutter.

**Enforcement**: Any PR or change that violates these rules must be rejected or corrected before merging.

## Core Principles

- **100% static only (client)** — The delivered experience (GitHub Pages) is 100% static. No runtime backend, databases, or always-running services in the browser app.
- **Research agents are GitHub-native** — Deep research, data gathering, and curation happen via GitHub Actions workflows / agents. These are triggered by Issues (and PRs/comments), run LLM calls (Grok/xAI), validate output, and commit structured JSON data into `public/data/`. The static site is the beautiful read-only viewer of that committed data.
- **Netlify is a rapid Hunt gateway, not the source of truth** — Netlify Functions may broker fast LLM refinement/draft generation and Netlify Blobs may store provisional Hunt state, but promoted public map data must still flow through GitHub review/validation into committed `public/data/`.
- **Vanilla TypeScript + Vite** — No React, no heavy frameworks. Prefer the simplest solution that works.
- **Mobile-first PWA** — The experience is designed primarily for mobile. Desktop is an enhancement, not the source of truth.
- **Mosaic v4 brand system is active** — v4 uses a dark-first Mosaic brand system: Deep Charcoal #0f0f11, Surface #17171a, Raised Surface #1f1d1a, Accent Gold #c9a86c, text #e4e4e7 / #a1a1aa, border #27272a. Do not reintroduce the old warm-neutral/taupe scaffold.
- **No domain seeding** — The platform must never feel like "Pizza Atlas plus extras". All example content must be generic and domain-agnostic.

## Implementation Rules

- All data loading must go through `src/lib/data-loader.ts`.
- The Curation Studio AI assistant lives only in `src/lib/assistant.ts` — keep its command surface small, deterministic, and extremely reliable.
- Netlify function code belongs under `netlify/functions/`; keep server-only LLM, Blob, and GitHub token handling out of `src/`.
- Draft Hunt data from Netlify Blobs must be visually labeled provisional and must not silently override canonical `public/data/` maps.
- Map rendering logic belongs in `src/lib/map-renderer.ts`.
- Never introduce a new runtime dependency without a one-paragraph justification and explicit maintainer approval.
- Prefer the simplest DOM solution that works. Avoid complex abstractions when a focused module will do.
- Update this file whenever a new enduring convention is discovered during implementation.
- Localized maps should declare `manifest.validation.coordinateBounds` so `npm run validate-data` can catch bad coordinates without applying Albany-specific assumptions to every topic.
- The public v2 deployment is built with `VITE_BASE_PATH=/mosaic/v2/` and published as a nested Pages artifact under `v2/`, targeting `http://gitbrain.com/mosaic/v2/`.

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

Public atlas entries must not be promoted from research candidates unless they meet the map's declared validation contract. For quality-gated maps, this means exact street-level addresses, current/recent evidence, no convenience-store or generic-chain filler, and verified real product photos from the actual place. Placeholder photo briefs belong in enrichment backlogs, not public `entries.json`.

See `.github/PUSH_AND_TEST_PLAN.md` for the full model of how testing integrates with GitHub push, Pages deployment, and research agent workflows.

## Phase Awareness

- **v4 brand pass**: The Mosaic brand system is now the source of truth for the Curator Dashboard and adjacent v4 flows.
- **Functional work** must preserve the dark-first design direction unless the user explicitly asks for a separate design exploration.

Follow the approved plan at `.grok/sessions/.../plan.md` for the current execution order.
