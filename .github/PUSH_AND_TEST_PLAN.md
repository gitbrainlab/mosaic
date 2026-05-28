# Mosaic — GitHub Push + Local Test Model (Phase 1a)

**Date**: 2026-05-28  
**Status**: Ready for first push + test hardening

This document models exactly how to push the Mosaic repository to GitHub (for real GitHub Pages + agent workflows) and the local/CI test strategy that must accompany it.

---

## 1. GitHub Push Strategy (How to get this live on GitHub Pages)

### 1.1 Repository Setup (one-time)
- Create repo on GitHub as `yourusername/mosaic` (or in an org).
- **Important**: The Vite base path is hardcoded to `/mosaic/` in production (see `vite.config.ts`). The Pages site will live at `https://<user>.github.io/mosaic/`.
- After creation, enable GitHub Pages in repo settings:
  - Build and deployment → Source: **GitHub Actions** (not "Deploy from a branch").

### 1.2 First Local Setup & Push
```bash
cd /path/to/mosaic
git init
git add .
git commit -m "chore: initial Mosaic Phase 1a (static + research agents + photo-enriched Ice Cream demo)"

# Add the remote (replace with real URL)
git remote add origin https://github.com/<your-username>/mosaic.git

git branch -M main
git push -u origin main
```

### 1.3 Required GitHub Secrets
- `XAI_API_KEY` (for the Research Agent workflow when it actually runs Grok calls)

Add it in: Settings → Secrets and variables → Actions.

### 1.4 Workflow Hardening Needed (before or right after first push)
Current state of `.github/workflows/`:

**deploy.yml** — Mostly good.
- Runs on `push: main` + manual dispatch.
- Uses correct `actions/configure-pages` + `deploy-pages`.
- **Minor fixes recommended**:
  - Pin Node to 22 (already does).
  - Add explicit `permissions` for the deploy job if needed in future.
  - Consider adding a `typecheck` + coordinate validation job as a required gate (see testing section).

**research-agent.yml** — Currently broken.
- Uses `pnpm` but the project uses `npm` + `package-lock.json`.
- Writes to wrong paths (`data/research-runs/` vs actual `public/data/...` flow via `ingest-research.ts`).
- Does not run the new `validate-map-coordinates.ts` guardrail.
- Does not handle the new photo/aggregate tooling well.

**Recommended fixes** (implement these in the first few PRs after push):
1. Switch research workflow to `npm ci` + `npx tsx`.
2. Make the research job call a proper orchestration script that ends with the validator.
3. After successful research + ingest, the workflow should also run the coordinate validator and fail the job if it doesn't pass.
4. The agent commits should target `public/data/maps/<slug>/` + update `PHOTO-SOURCING-TASKS.md` when appropriate.
5. Add a "review" label path so humans can approve before merge (optional but recommended for data quality).

### 1.5 Branch Protection & CI Gates (recommended)
After first successful deploy:

- Require status checks before merging to `main`:
  - `build` (from deploy.yml)
  - `typecheck`
  - `validate-coordinates` (new job or separate workflow)
  - `test:regression` (once we have proper Playwright tests)

- Protect `main` (require PRs, no force push).

### 1.6 Data vs Code Changes
- **Code / UI / test changes** → Normal PRs.
- **Research data changes** → Can be committed by the agent bot (via the research workflow) or via human PR after running local research + validation.
- Never merge data that fails `validate-map-coordinates.ts`.

### 1.7 First Deploy Verification
After pushing `main`:
1. Go to Actions tab → the Deploy workflow should run.
2. When green, visit `https://<user>.github.io/mosaic/`.
3. Verify the Ice Cream map loads with the 16 entries that have real photos + the coordinate fixes we applied.

---

## 2. Local Test Plan (and what we will implement)

### Current State (as of this plan)
- Playwright + `@playwright/test` are installed.
- We have powerful ad-hoc visual regression scripts:
  - `tests/regression-full.ts`
  - `tests/verify-design-regression.ts` (new comprehensive one)
  - `tests/verify-hunt-contrast.ts`
  - `scripts/validate-map-coordinates.ts` (new, critical for data quality)
- No `playwright.config.ts`
- No `npm test` script
- All "tests" are run with raw `npx tsx tests/xxx.ts`
- No CI integration of the visual + data validation tests

### Goals for Local Tests
1. **Make `npm test` do something real and useful locally.**
2. Achieve parity between local developer experience and what will run in GitHub Actions.
3. Protect the two most important things:
   - The static site builds and is functionally correct.
   - Data committed to `public/data/` passes strong coordinate + schema validation (prevents the "locations all off on the map" class of bug).
4. Keep the excellent visual regression screenshots for design review while making them runnable in a standard way.
5. Low maintenance — no new heavy frameworks.

### Proposed Test Architecture

**Layer 1 — Static + Type Safety (fast, always run)**
- `npm run typecheck`
- `npm run build` (catches Vite + TS issues in production mode)

**Layer 2 — Data Validation (fast, critical)**
- `npx tsx scripts/validate-map-coordinates.ts public/data/maps/*/entries.json`
- Future: simple schema checks against `src/types/index.ts`

**Layer 3 — Functional + Visual Regression (Playwright)**
- Use official Playwright test runner for new or converted tests.
- Keep the heavy visual design regression as a separate `npm run test:regression` command (because it produces hundreds of screenshots and is intentionally slow/manual-review oriented).
- The new `verify-design-regression.ts` can be invoked by the runner or stay as a powerful standalone script.

**Recommended `package.json` scripts (to implement)**

```json
"test": "npm run typecheck && npm run validate-data && npm run test:smoke",
"validate-data": "tsx scripts/validate-map-coordinates.ts 'public/data/maps/*/entries.json'",
"test:smoke": "playwright test --grep @smoke",
"test:regression": "tsx tests/verify-design-regression.ts && tsx tests/regression-full.ts",
"test:ui": "playwright test --ui"
```

### Playwright Config Strategy
- Create `playwright.config.ts` with:
  - Projects for mobile (iPhone 14), tablet, desktop.
  - Light + dark mode via `colorScheme`.
  - Reasonable timeouts for the dev server or preview server.
  - Artifact collection for failures.
  - Optional: trace on first retry.

For the heavy visual regressions we can keep using the custom launch scripts (they give us full control over the exact flows and screenshot names we already use for the design board).

### CI Integration (after push)
In `deploy.yml` or a separate `ci.yml`:
- Run `npm test` as a required job before the build job.
- The coordinate validator becomes a hard gate on any PR that touches `public/data/`.

### Future Enhancements (post Phase 1a)
- Snapshot testing for critical UI text/states.
- Lighthouse CI for performance budgets.
- Automated a11y checks on key pages.

---

## 3. Immediate Implementation Plan (what to do in this session)

1. **Document** this plan (done — this file).
2. **Fix obvious workflow bugs** (research-agent.yml uses wrong package manager and paths).
3. **Implement local test foundation**:
   - Create `playwright.config.ts`.
   - Add the new test scripts to `package.json`.
   - Wire the coordinate validator into `npm test`.
   - Make the existing `verify-design-regression.ts` and `regression-full.ts` runnable via the new `test:regression` command (they already work).
4. **Add a small smoke test** using real Playwright test syntax so `npm test` actually exercises the Playwright runner.
5. **Update AGENTS.md** with the new testing + validation expectations.
6. **Optional**: Add a root `README.md` with the quick "how to develop + test + push" instructions.

---

## 4. Open Questions / Decisions for Maintainer

- Do we want the research agent to be allowed to push directly to `main`, or should it always open a PR for human review of coordinate + photo quality?
- How strict should the coordinate validator be initially (current thresholds may need tuning per map)?
- Do we keep the heavy visual regression as "run manually before design reviews" or try to run it on every PR (expensive)?

---

**Next step after this document**: Implement the local test improvements (todo items 3 & 4) so `npm test` becomes a real, trustworthy command before the first real GitHub push.
---

## Scaling to 100+ Localized Research Batches (May 2026 Update + Infrastructure)

**Core Principle**: Quality >> Volume. One broad query produces noisy, poorly geocoded, weak-photo data. Many tightly-scoped micro-location runs (different models) + strong X + photo prompts + validator gate = much better results.

**Current Implementation**:
- Enhanced `research-agent.ts` with:
  - Mandatory X historical post emphasis (for authentic recent photos + evidence).
  - Much stricter product-only photoBriefs (2–4 per entry).
  - Explicit coordinate defense instruction.
  - Tool calling scaffolding for future X search tool use.
- `rich-research.ts` now documents multi-state patterns (see `MULTI_STATE_EXAMPLE`).
- New validator (`scripts/validate-map-coordinates.ts`) is the hard gate.

**Pilot Wave Executed** (3 states, different models):
- Berkshires + Western Massachusetts (grok-4.3) → 6 entries, ingested as `ice-cream-berkshires-western-massachusetts`
- Burlington / Chittenden County VT (non-reasoning) → 5 entries
- Boston + North Shore MA (grok-4.3) → 5 entries

All runs used the new X + photo-heavy prompts.

**Path to 100 Batches**:
1. Create JSON target files per wave (e.g. `batches/northeast-ice-cream-wave-2.json`).
2. Small script to fan out `research-agent.ts` calls (or extend rich-research).
3. Always: research → ingest → validate (fail on bad coords) → photo sourcing tasks.
4. Aggregate strong runs with `aggregate-research-runs.ts`.
5. Human review + coordinate fixes where the model is still weak.

This approach directly addresses the previous data quality problems (wrong side of river, 50km+ errors, weak photos).

Next wave can easily target 20–30 more micro-locations across additional states using the same pattern.

### New Scaling Infrastructure (Added)

- `batches/` directory for wave config files (JSON defining many micro-locations across states).
- `scripts/run-batch-research.ts` — the main fan-out tool. Takes a wave config + `--max-parallel=N` and launches dozens of targeted `research-agent.ts` calls automatically with the enhanced X/photo prompts.
- Example config: `batches/ice-cream-northeast-wave-2.json` (18 micro-locations across ME, NH, VT, MA, RI, CT, NY — 36 total calls when using 2 models each).

A full Wave 2 run was launched in the background right after these tools were built (max-parallel=3 for responsible API usage).

This makes reaching 100+ high-quality, localized batches practical and repeatable while keeping the strict photo + X + coordinate standards.

**How to run the next wave:**
```bash
npx tsx scripts/run-batch-research.ts batches/ice-cream-northeast-wave-2.json --max-parallel=4
```

Then ingest promising outputs, run the validator (mandatory), and prepare photo tasks.

### GitHub Actions + Repository Secret (XAI_KEY)

User has added `XAI_KEY` as a repository secret.

The research workflows have been updated (May 2026) to:
- Accept `XAI_KEY` (and also `XAI_API_KEY` for compatibility)
- Support two modes on manual dispatch:
  - `single`: traditional one-topic research
  - `batch`: runs `scripts/run-batch-research.ts` against a wave config in `batches/`

This allows launching large overnight enrichment waves (e.g. the 36-call Northeast Wave 2) directly from the GitHub Actions UI → "Run workflow" before going to sleep.

The agent will commit results (research artifacts + any ingested map data) back to the repo.

Recommended usage for big runs:
1. Go to Actions → "Research Agent"
2. Choose "Run workflow"
3. Set mode = batch
4. Set wave = batches/ice-cream-northeast-wave-2.json (or future waves)
5. Set max_parallel = 3 or 4

All runs use the enhanced prompts with heavy X historical data + strict product photo requirements.
