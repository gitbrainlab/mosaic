# Mosaic Deep Enrichment Protocol

This protocol is for turning rough research candidates into public-quality Mosaic map entries. It exists because broad LLM runs can discover interesting places, but they do not reliably prove current operation, exact address, real product photos, or niche relevance.

## Recommendation

Run deep enrichment in this repository, not in a separate project, but keep it in an experimental lane until entries pass validation.

For prompt measurement, experiment design, and progressive evidence assimilation across runs, use `docs/research/prompt-effectiveness-and-progressive-assimilation.md`.

Why:

- The real product contract lives here: `KnowledgeEntry`, map manifests, validators, image paths, and GitHub Pages deployment.
- Failed candidates can stay in `public/data/enrichment/` without polluting public `entries.json`.
- Playwright experiments can run in GitHub Actions and commit only structured evidence artifacts.
- The static app remains clean: no runtime backend, no live scraping from the browser.

Use a separate project only for throwaway scraper experiments that need risky dependencies, unusual browsers, or exploratory notebooks. Once an experiment proves useful, port it back here as a script under `scripts/scrapers/` or `scripts/research/`.

## Quality Bar

A candidate can be promoted to public `entries.json` only when it has:

- Exact street address, not town-level or area-level location.
- Coordinates matching that address.
- Current signal from 2023 or later, preferably 2025-2026.
- Evidence that the place currently serves the product category or niche.
- At least two source-attributed real product photos from the actual business/location.
- No stock photos, generic storefront photos, parking lots, logos, or placeholder photo briefs.
- No generic convenience-store, gas-station, or commodity chain filler unless the map intent explicitly includes that category.

## Pipeline

1. Candidate Discovery
   - LLM finds possible entities from local knowledge, official sites, food press, review ecosystems, and social posts.
   - Output goes to `data/research-runs/` or `public/data/enrichment/`, not directly to public map entries.

2. Address and Current-Operation Verification
   - Verify official business site, current Google/Apple/Bing place listing if available, recent review pages, and social accounts.
   - Capture exact address, canonical website, social URLs, and recent operation signal.

3. Product Relevance Verification
   - Confirm the niche product is actually served now.
   - For ice cream this means a current menu, product page, recent customer review/photo, or social post showing the ice cream/frozen dessert.

4. Photo Evidence
   - Prefer official business product galleries, menu images, or recent social posts by the business.
   - Customer review photos may be used as evidence references when source-attributed and clearly from the place.
   - Photos must show the product itself.
   - Save local copies only when license/source policy allows it; otherwise store source URL and attribution if the current map policy permits remote source images.

5. Structured Promotion
   - Convert only passed candidates into `KnowledgeEntry`.
   - Include `photos`, `photoEvidence`, `sources`, evidence dates, and quality attributes.
   - Run `npm run validate-data` and `npm test`.

## Browser Automation Guidance

Use Playwright for direct business websites, public menu pages, and source pages where automated access is appropriate. Avoid relying on direct scraping of platforms with heavy anti-bot controls or restrictive terms as the core path. For Google Maps/Yelp-style platforms, treat them as discovery and verification targets where legally and technically appropriate; prefer official APIs, human review, search result snippets, or user-provided exports when needed.

Respect robots.txt, rate limits, and source terms. The goal is evidence quality, not adversarial scraping.

## Deep Research Prompt

Use this as the first pass in GPT Deep Research, Grok, or another research model with browsing/search tools:

```text
You are doing deep enrichment for Mosaic, a static public knowledge-map product. Your job is not to produce a large list. Your job is to prove which candidates are safe to publish.

Map intent:
Build an ice cream / frozen dessert atlas centered on Albany, NY and fanning outward nationwide. Public entries must be exact, current, relevant, and photo-evidenced.

Hard public-entry requirements:
1. Exact street address. Reject town-only, area-only, "multiple locations," or ambiguous locations.
2. Address-level coordinates. If you cannot verify the address, reject or mark as candidate-only.
3. Current relevance. Require a 2023-2026 signal that the business is currently operating and serving the relevant product.
4. Product specificity. Confirm the place serves ice cream, gelato, frozen custard, soft serve, paletas, shave ice, or a clearly relevant frozen dessert.
5. Real product photos. Find at least two source-attributed photos that show the actual product from the actual place. Reject stock images, storefronts, logos, parking lots, and generic photos.
6. No convenience-store/gas-station/generic-chain filler unless the specific map intent asks for chains. For this map, reject Stewart's Shops, Dairy Queen, Carvel, Cold Stone, Baskin-Robbins, Friendly's, Sonic, McDonald's, Culver's, Shake Shack, and similar commodity chains.
7. Evidence must be cited with URLs and dates where possible. If evidence is weak, keep the item in the enrichment backlog, not the public map.

Research method:
- Start from the provided candidate backlog if one exists.
- For each candidate, search official website, official menu/product pages, official Instagram/Facebook, local food press, recent review pages, and recent social posts.
- Prefer official business sources for address/current operation.
- Prefer official or recent social/product pages for photos.
- Record why a candidate failed as explicitly as why it passed.

Return only valid JSON:
{
  "passed": [
    {
      "id": "stable-slug",
      "name": "Exact business name",
      "location": {
        "address": "Exact street address",
        "city": "City",
        "region": "State",
        "country": "USA",
        "lat": 0,
        "lng": 0
      },
      "description": "Factual 1-3 sentence description focused on why this belongs on the map.",
      "confidence": "high|medium|low",
      "evidence": [
        {
          "type": "menu|review|photo|article|other",
          "source": "Source name",
          "url": "https://...",
          "detail": "What this source proves",
          "date": "YYYY or YYYY-MM-DD when known"
        }
      ],
      "sources": ["https://..."],
      "photos": [
        {
          "url": "https://...",
          "caption": "What product is visible and why it is archetypal",
          "credit": "Source attribution",
          "type": "product"
        }
      ],
      "photoEvidence": [
        {
          "url": "https://...",
          "caption": "What product is visible",
          "credit": "Source attribution",
          "verified": true
        }
      ],
      "tags": ["ice_cream", "address_level", "real_product_photos"],
      "attributes": {
        "lastVerified": "YYYY-MM-DD",
        "currentSignal": "What proves it is current",
        "photoPolicy": "real product photos only"
      }
    }
  ],
  "rejected": [
    {
      "candidateId": "original id if available",
      "name": "Candidate name",
      "reasons": [
        "missing_verified_product_photos",
        "not_address_level",
        "stale_or_closed",
        "blocked_chain_or_convenience_store",
        "product_relevance_unproven"
      ],
      "notes": "Short explanation of what was checked and what failed.",
      "nextBestAction": "Specific action needed to reconsider this candidate."
    }
  ],
  "openQuestions": [
    "Any candidate that may be promising but needs manual verification."
  ]
}
```

## Implementation Prompt For A Scraper Agent

Use this after the deep research pass identifies URLs worth checking:

```text
You are a respectful Playwright-based verification agent for Mosaic.

For each target URL:
1. Load the page with a normal browser user agent and a conservative timeout.
2. Extract page title, canonical URL, visible business name, address text, menu/product text, social links, and image candidates.
3. Score image candidates for product relevance. Prefer images with alt text, surrounding captions, filenames, or page sections containing words like ice cream, gelato, cone, sundae, scoop, custard, soft serve, paleta, sorbet, shake.
4. Reject logos, icons, avatars, storefronts, exteriors, maps, and tracking images.
5. Return structured evidence only. Do not promote a candidate by yourself.

Return JSON:
{
  "targetUrl": "https://...",
  "loaded": true,
  "canonicalUrl": "https://...",
  "title": "...",
  "detectedAddress": "...",
  "currentSignals": [
    {"text": "...", "source": "visible page text", "confidence": "high|medium|low"}
  ],
  "productSignals": [
    {"text": "...", "source": "menu/product/social text", "confidence": "high|medium|low"}
  ],
  "photoCandidates": [
    {
      "url": "https://...",
      "alt": "...",
      "nearbyText": "...",
      "reasonLikelyProduct": "...",
      "rejectReason": null
    }
  ],
  "errors": []
}
```

## Next Engineering Step

Build a `scripts/enrich-candidates.ts` orchestrator that:

- Reads `public/data/enrichment/*rejected-candidates.json`.
- Processes a small batch, such as 10 candidates.
- Uses LLM deep research to produce source URLs.
- Runs Playwright only against candidate official/source URLs.
- Writes `data/enrichment-runs/{timestamp}.json`.
- Promotes only entries that pass manifest validation.

Do not attempt a 300-entry public push in one step. Target 10-20 verified promotions per wave.

## Current Local Runner

The first runner now exists:

```bash
npx tsx scripts/enrich-candidates.ts \
  --input=public/data/enrichment/ice-cream-nationwide-albany-radial-rejected-candidates.json \
  --batch=batches/ice-cream-quality-recovery-wave-1.json \
  --limit=12
```

It writes a prompt-pack artifact into `data/enrichment-runs/` and marks it `publicPromotionAllowed: false`.

After a deep research pass returns concrete `passed[]` entries with source URLs, run the browser verifier:

```bash
npx tsx scripts/verify-enrichment-sources.ts \
  --input=data/enrichment-runs/{deep-research-result}.json \
  --limit=10 \
  --max-urls=4
```

For smoke-testing the verifier against already curated data:

```bash
npx tsx scripts/verify-enrichment-sources.ts \
  --input=public/data/maps/ice-cream-nationwide-albany-radial/entries.json \
  --limit=2 \
  --max-urls=3
```

The verifier writes `*-source-verification.json` artifacts with address snippets, product snippets, current-operation signals, social links, and scored image candidates. These artifacts are supporting evidence only; they do not promote public map entries.

## Promotion Pipeline

Use the enrichment pipeline as staged gates. Public entries should only change in the final promotion stage.

1. Audit an existing public map:

```bash
npm run audit:map -- --map=ice-cream-nationwide-albany-radial
```

This writes a `data/enrichment-runs/*quality-audit*.json` artifact showing exact-address, coordinate, recency, photo, and chain/convenience-store gaps.

2. Build a prompt pack:

```bash
npm run enrichment:prompt -- \
  --input=public/data/enrichment/ice-cream-nationwide-albany-radial-rejected-candidates.json \
  --batch=batches/ice-cream-quality-recovery-wave-1.json \
  --limit=12 \
  --offset=0 \
  --exclude-map=ice-cream-nationwide-albany-radial
```

3. Run the prompt pack through the research model:

```bash
npm run enrichment:run -- \
  --prompt-pack=data/enrichment-runs/{prompt-pack}.json \
  --model=grok-4.3
```

This writes a research-only `*-deep-research.json` artifact. By default the runner uses xAI's Responses API with web search, image search, and image understanding enabled so the model can cite current source pages and discover product-photo candidates. It does not edit public map data.

4. Verify source pages and photo candidates:

```bash
npm run enrichment:verify -- \
  --input=data/enrichment-runs/{deep-research}.json \
  --limit=10 \
  --max-urls=4
```

5. Build a promotion preview:

```bash
npm run enrichment:promote -- \
  --input=data/enrichment-runs/{deep-research}.json \
  --map=ice-cream-nationwide-albany-radial
```

The preview enforces exact street addresses, numeric address-level coordinates, current evidence, map bounds, non-chain policy, and at least two verified product photos. By default it rejects manual-review tags, proof-only photos, and out-of-bounds candidates.

6. Optional model benchmark:

```bash
npm run enrichment:benchmark -- \
  --input=public/data/enrichment/ice-cream-nationwide-albany-radial-rejected-candidates.json \
  --batch=batches/ice-cream-quality-recovery-wave-1.json \
  --limit=3 \
  --offset=0 \
  --models=grok-4.3,grok-4.20-0309-non-reasoning \
  --map=ice-cream-capital-district
```

This runs the same prompt pack against multiple models, writes a benchmark artifact, and creates dry-run promotion previews for each model. It still does not edit public entries.

For wider Northeast scale-out, prefer targeted cluster runs instead of broad regional prompts:

```bash
npm run enrichment:benchmark -- \
  --input=public/data/enrichment/ice-cream-nationwide-albany-radial-rejected-candidates.json \
  --batch=batches/ice-cream-northeast-targeted-clusters-v1.json \
  --target=Portland-ME-Peninsula \
  --limit=3 \
  --models=grok-4.20-0309-non-reasoning,grok-4.20-multi-agent \
  --reasoning-effort=low \
  --map=ice-cream-northeast-pilot \
  --transport=responses
```

Use `grok-4.20-multi-agent` only through the Responses API. Its `reasoning.effort` parameter controls agent count, not thinking depth: `low`/`medium` use a smaller 4-agent configuration for focused cluster checks, while `high`/`xhigh` use the larger 16-agent configuration and should be reserved for expensive follow-up.

7. Promote only after review:

```bash
npm run enrichment:promote -- \
  --input=data/enrichment-runs/{reviewed-deep-research}.json \
  --map=ice-cream-nationwide-albany-radial \
  --apply
```

Then run:

```bash
npm run validate-data
npm test
```

The GitHub Actions workflow `.github/workflows/enrichment-pipeline.yml` exposes the same stages: `audit`, `prompt-pack`, `research`, `verify`, `promotion-preview`, `benchmark`, and `promote`. The `promote` stage requires `confirm_public_promotion=PROMOTE`.
