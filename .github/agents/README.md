# Mosaic Research Agents

This folder + the `scripts/` research tools power the real curation loop.

## Current Tools

- `scripts/research-agent.ts` — Core deep research engine using Grok (xAI)
- `scripts/ingest-research.ts` — Converts raw research output into proper map data (manifest + entries)

## Local Usage (with real API key)

```bash
export XAI_API_KEY="xai-..."   # or use .xai-key file

# Basic research (uses grok-4.3 by default)
npx tsx scripts/research-agent.ts "Veal Parm in the Capital District" --limit=8

# Targeted + specific model (non-reasoning or multi-agent)
npx tsx scripts/research-agent.ts "Veal Parm" --location="Albany proper, NY" --model=grok-4.20-0309-non-reasoning --limit=5

# Rich multi-location, multi-model hunt (recommended for best coverage)
npx tsx scripts/rich-research.ts --base-topic="Veal Parm in the Capital District"
```

The rich-research script fans out across Albany / Saratoga / Troy / Schenectady using both the non-reasoning and multi-agent models in parallel.

## GitHub Actions (Autonomous) — Recommended for Large Runs

The `research-agent.yml` workflow supports two modes via manual dispatch (or issue labels):

- `single` — traditional one-topic research
- `batch` — runs large waves using `scripts/run-batch-research.ts` + a config in `batches/`

**Repository Secret**: `XAI_KEY` (user-provided). The workflow maps it to both `XAI_API_KEY` and `XAI_KEY` so all scripts work.

**Best for sleeping / overnight enrichment**:
1. Go to Actions → Research Agent → "Run workflow"
2. Set mode = `batch`
3. Set wave = path to a file in `batches/` (e.g. `batches/ice-cream-northeast-wave-2.json`)
4. Set max_parallel (3–4 recommended)

This can comfortably run 30–100+ targeted micro-location calls overnight.

See the main plan at `.github/PUSH_AND_TEST_PLAN.md` for details on wave configs and scaling strategy.

### Local Usage (with real API key)

```bash
export XAI_API_KEY="xai-..."   # or use .xai-key file

# Basic research
npx tsx scripts/research-agent.ts "Ice Cream in the Berkshires" --limit=6

# Large batch wave (uses the new scaling tooling)
npx tsx scripts/run-batch-research.ts batches/ice-cream-northeast-wave-2.json --max-parallel=3
```

- Triggered by Issues labeled `research`
- Or manual `workflow_dispatch` with `topic` input
- Uses `secrets.XAI_API_KEY`
- Commits results back to the repo

## Philosophy

- Multiple research passes for quality
- Honest confidence levels
- Strong emphasis on verifiable evidence
- No fabrication — the agent is allowed to return fewer results if evidence is weak

## Photos (New Requirement)

Photos are now a required part of enrichment.

Rules:
- Must be centered on the actual product (the veal cutlet, the specific ice cream scoop, the dish).
- Interesting variants and novel facts shown visually are highly valuable.
- Reject generic photos: no parking lots, no building exteriors, no "front of the restaurant".
- During ingest, real image files are committed into `public/data/maps/{slug}/images/`.
- The agent should output precise captions and recommended real-world sources for the best photos.

## Data Accuracy Strategy (LLM + Scraping)

Pure LLM research has accuracy limits (knowledge cutoff, hallucination risk on current details).

**Hybrid approach**:
1. Grok agent does discovery, reasoning, structuring, and generates high-quality photo briefs + scrape targets.
2. Real web scrapers (Playwright + Chrome in containers) run in GitHub Actions to fetch ground-truth data:
   - Current product photos from business sites / recent reviews
   - Menu items
   - Recent reviews with dates
3. Scraped data is merged back into the KnowledgeEntry records before commit.

Tools:
- `scripts/scrapers/base-scraper.ts` + `restaurant-scraper.ts`
- `npm run scrape <research-output.json>`

Scrapers must be respectful (rate limiting, robots.txt, proper user-agent).

The browser app stays 100% static. All intelligence lives in these agents.
