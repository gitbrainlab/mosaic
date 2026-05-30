# mosaic

**mosaic** is a 100% static, mobile-first platform for high-quality, community-curated knowledge maps on any topic.

Everything runs on GitHub Pages. All research, enrichment, and data updates are powered by GitHub Actions agents that call Grok (xAI) and commit structured data back to the repo.

## Features

- Clean gallery of maps
- "Launch a Hunt" experience (manual trigger for new research)
- Interactive MapLibre maps with list + detail views
- Mobile-first BottomSheet + desktop bottom panel details
- Photo-first design with graceful "sourcing in progress" states
- Research batch tooling for large-scale, multi-location enrichment

## Local Development

```bash
git clone https://github.com/gitbrainlab/mosaic.git
cd mosaic
npm install
npm run dev
```

Open http://localhost:5173

### Useful Scripts

- `npm run build` — Production build
- `npm run typecheck` — TypeScript check
- `npm run preview` — Preview the production build locally
- `npm run validate-data` — Run coordinate sanity checks on all maps
- `npm test` — Typecheck + data validation + smoke tests
- `npm run test:regression` — Full visual design regression (multi-viewport + light/dark)

## Deployment (GitHub Pages)

This site is deployed automatically via GitHub Actions.

- Push or merge to `main` → `deploy.yml` builds the site and deploys it.
- Live v3 site: http://gitbrain.com/mosaic/v3/
- Live v4 experiment: http://gitbrain.com/mosaic/v4/

### First-Time / Repo Setup (One Time)

1. In the GitHub repo:
   - Go to **Settings → Pages**
   - Under "Build and deployment", set **Source** to **GitHub Actions**
2. Ensure the `XAI_KEY` repository secret exists (used for research agents).

The deployment workflow builds the pinned v3 source with `VITE_BASE_PATH=/mosaic/v3/` and the current v4 source with `VITE_BASE_PATH=/mosaic/v4/`, then publishes both directories in one GitHub Pages artifact.

## Netlify Hunt Gateway

Mosaic can use Netlify as an optional API-only rapid Hunt gateway while keeping GitHub as the source of truth. The primary v4 Hunt path is static: frontend to prefilled GitHub Issue to Actions artifacts to Studio review to approval-gated promotion.

- Netlify Functions live in `netlify/functions/`.
- Netlify Blobs store draft Hunt profiles, provisional maps, events, and promotion requests.
- Draft Hunts are public/provisional at `/hunts/{id}` when `VITE_API_BASE_URL` is configured and are not canonical map data.
- Promotion creates a GitHub `hunt-promotion` issue and the `Hunt Promotion Intake` workflow captures it into a review PR artifact.
- Public map data is still written only after GitHub validation/review promotes entries into `public/data/`.

Required Netlify environment variables:

- `XAI_API_KEY` or `XAI_KEY` — server-side LLM key.
- `MOSAIC_GITHUB_TOKEN` — optional token for creating promotion issues.
- `MOSAIC_GITHUB_REPOSITORY` — defaults to `gitbrainlab/mosaic`.
- `ALLOWED_ORIGIN` — allowed frontend origin.

GitHub Pages needs `VITE_API_BASE_URL` set as a repository variable or secret when the Netlify API is live, for example:

```text
https://your-netlify-site.netlify.app/.netlify/functions
```

The manual `Seed Netlify Hunt Environment` workflow can copy existing GitHub Actions secrets into Netlify when `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID` are available.

## Running Research Batches (The Real Power)

mosaic's research system can run large, targeted enrichment jobs.

### Locally (for testing)
```bash
# Single topic
npx tsx scripts/research-agent.ts "Ice Cream in the Berkshires" --limit=6

# Large multi-state batch wave (recommended pattern)
npx tsx scripts/run-batch-research.ts batches/ice-cream-northeast-wave-2.json --max-parallel=3
```

Results land in `data/research-runs/`. Use `scripts/ingest-research.ts` to turn good runs into live map data.

### Overnight / Large Runs via GitHub (Recommended)

You can trigger big batch jobs that run for hours in the cloud using the `XAI_KEY` secret.

**How to run a big wave while you sleep:**

1. Go to the repo → **Actions** tab
2. Select **Research Agent** workflow
3. Click **"Run workflow"**
4. Fill in:
   - `mode` → `batch`
   - `wave` → `batches/ice-cream-northeast-wave-2.json` (or any file in the `batches/` folder)
   - `max_parallel` → `3` or `4`
5. Click **Run workflow**

The agent will:
- Use the `XAI_KEY` secret
- Run dozens of tightly-scoped, high-quality research calls (with strong X historical data + product-centered photo briefs)
- Commit results back to the repository

New maps and updated data will appear on the live site after the next deploy.

## Project Structure

- `src/` — The static frontend (vanilla TS + Vite + MapLibre + Tailwind)
- `public/data/` — All committed map data (manifests + entries + photos)
- `scripts/` — Research tools (`research-agent.ts`, `run-batch-research.ts`, ingest, photo helpers, validators, etc.)
- `batches/` — JSON configs for large multi-location research waves
- `.github/workflows/` — `deploy.yml` (Pages) + `research-agent.yml` (single + batch) + `batch-enrichment.yml` (long-running dedicated workflow)

## Troubleshooting First Deploy

If the "Deploy to GitHub Pages" workflow fails with "Get Pages site failed" or 404:

1. Go to **Settings → Pages**
2. Change **Source** to **GitHub Actions**
3. Re-run the failed workflow from the Actions tab.

The `batch-enrichment.yml` workflow is recommended for large overnight runs (has a 6-hour timeout).

## Contributing

- Small UI / UX fixes: normal PRs
- Research data changes: Usually come through the agent workflows or via Issues
- New batch waves: Add a config in `batches/` and run it via GitHub Actions (or locally)

See `AGENTS.md` for deeper project rules and research philosophy.

## Tech

- 100% static (GitHub Pages)
- Vite + TypeScript + Tailwind v4
- MapLibre GL
- GitHub Actions for all research & deployment

## License

TBD

---

**Current status**: The v3 site is targeted at http://gitbrain.com/mosaic/v3/ with multiple maps and a first static Curation Studio batch-review surface.
