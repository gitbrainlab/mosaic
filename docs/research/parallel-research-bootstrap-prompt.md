# Parallel Research Bootstrap Prompt

Paste this into a separate Codex/GPT window when you want a dedicated research lane to run alongside UX work.

```text
We are working in the Mosaic repo at /Users/matthewlean/Development/mosaic.

Goal: run a parallel deep-enrichment research lane for the ice cream atlas while the main thread works on UX. Do not change the UX. Do not promote unverified candidates into public map entries.

Context:
- Mosaic is a 100% static GitHub Pages app.
- Public map data lives under public/data/maps/{slug}/.
- The current public map ice-cream-nationwide-albany-radial was quality-gated down to verified entries because the 300-entry version had weak precision, missing photos, stale evidence, and chain/gas-station filler.
- The rejected 300-candidate backlog is at:
  public/data/enrichment/ice-cream-nationwide-albany-radial-rejected-candidates.json
- Deep enrichment protocol is at:
  docs/research/deep-enrichment-protocol.md
- First small recovery wave config is at:
  batches/ice-cream-quality-recovery-wave-1.json

Your job:
1. Read AGENTS.md and docs/research/deep-enrichment-protocol.md.
2. Inspect the rejected candidate backlog.
3. Select a small batch of 10-20 promising candidates near Albany / Capital Region / nearby Northeast.
4. Deep-research each candidate using official websites, menus, local food press, recent social posts, and source-attributed product photos.
5. Reject candidates that lack:
   - exact street address
   - address-level coordinates
   - current 2023-2026 operation/product signal
   - at least two real product photos from the actual place
   - non-chain/non-convenience-store relevance
6. Produce a structured enrichment artifact only. Do not edit public entries.json unless the candidates fully pass validation.

Output target:
Create a new file under data/enrichment-runs/, for example:
data/enrichment-runs/ice-cream-quality-recovery-wave-1-{timestamp}.json

Return JSON in this shape:
{
  "wave": "ice-cream-quality-recovery-wave-1",
  "generatedAt": "ISO timestamp",
  "passed": [
    {
      "id": "stable-slug",
      "name": "Exact business name",
      "location": {
        "address": "Exact street address",
        "city": "City",
        "region": "NY",
        "country": "USA",
        "lat": 0,
        "lng": 0
      },
      "description": "Factual 1-3 sentence description focused on why this belongs.",
      "confidence": "high|medium|low",
      "evidence": [
        {
          "type": "menu|review|photo|article|other",
          "source": "Source name",
          "url": "https://...",
          "detail": "What this source proves",
          "date": "YYYY or YYYY-MM-DD"
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
      "notes": "What was checked and what failed.",
      "nextBestAction": "Specific action needed to reconsider."
    }
  ],
  "openQuestions": []
}

Important rules:
- Do not use stock images.
- Do not use storefront/parking-lot/logo images as product photos.
- Do not include Stewart's Shops, Dairy Queen, Carvel, Cold Stone, Baskin-Robbins, Friendly's, Sonic, McDonald's, Culver's, Shake Shack, or similar commodity-chain filler.
- Do not overwrite UX files.
- Do not change public/data/maps/ice-cream-nationwide-albany-radial/entries.json unless explicitly asked after the enrichment artifact is reviewed.
- Prefer fewer, proven entries over a big weak list.

When finished, summarize:
- passed count
- rejected count
- strongest 5 candidates
- any sources/photos that need manual review
- exact files changed
```
