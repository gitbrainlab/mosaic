# Mosaic

**Mosaic** is a 100% static, mobile-first platform for high-quality, community-curated knowledge maps on any topic.

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
- Live site: https://gitbrainlab.github.io/mosaic/

### First-Time / Repo Setup (One Time)

1. In the GitHub repo:
   - Go to **Settings → Pages**
   - Under "Build and deployment", set **Source** to **GitHub Actions**
2. Ensure the `XAI_KEY` repository secret exists (used for research agents).

The `vite.config.ts` already handles the correct base path (`/mosaic/`) for GitHub Pages.

## Running Research Batches (The Real Power)

Mosaic's research system can run large, targeted enrichment jobs.

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
- `.github/workflows/` — `deploy.yml` (Pages) + `research-agent.yml` (enrichment)

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

**Current status**: The site is live at https://gitbrainlab.github.io/mosaic/ with multiple maps (including photo-enriched Ice Cream data from multi-state research waves).