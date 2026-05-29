#!/usr/bin/env tsx
/**
 * Build strict deep-enrichment prompt packs from candidate backlogs.
 *
 * This script does not promote public map entries. It prepares a small,
 * reviewable research artifact that another Codex/GPT/Grok window can run
 * while UX work continues safely in parallel.
 *
 * Usage:
 *   npx tsx scripts/enrich-candidates.ts \
 *     --input=public/data/enrichment/ice-cream-nationwide-albany-radial-rejected-candidates.json \
 *     --batch=batches/ice-cream-quality-recovery-wave-1.json \
 *     --limit=12
 */
import fs from 'fs';
import path from 'path';

interface Candidate {
  id?: string;
  name: string;
  location?: {
    address?: string;
    city?: string;
    region?: string;
    country?: string;
    lat?: number;
    lng?: number;
  };
  confidence?: string;
  reasons?: string[];
  enrichmentRequired?: string[];
  evidenceCount?: number;
  photoCount?: number;
  photoBriefCount?: number;
}

interface BatchTarget {
  name: string;
  location: string;
}

interface BatchConfig {
  wave: string;
  baseTopic: string;
  perLocationLimit?: number;
  models?: string[];
  targets?: BatchTarget[];
  exclusions?: {
    blockedNamePatterns?: string[];
    blockedCategories?: string[];
  };
}

const DEFAULT_INPUT = 'public/data/enrichment/ice-cream-nationwide-albany-radial-rejected-candidates.json';
const DEFAULT_BATCH = 'batches/ice-cream-quality-recovery-wave-1.json';
const DEFAULT_OUT_DIR = 'data/enrichment-runs';

function argValue(name: string, fallback?: string) {
  const arg = process.argv.find(item => item.startsWith(`--${name}=`));
  return arg ? arg.slice(name.length + 3) : fallback;
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

function slugify(text: string) {
  return text.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function extractCandidates(raw: any): Candidate[] {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.rejectedCandidates)) return raw.rejectedCandidates;
  if (Array.isArray(raw.candidates)) return raw.candidates;
  if (Array.isArray(raw.rejected)) return raw.rejected;
  throw new Error('Input JSON must be an array or include rejectedCandidates/candidates/rejected.');
}

function uniqueByIdOrName(candidates: Candidate[]) {
  const seen = new Set<string>();
  return candidates.filter(candidate => {
    const key = candidate.id || `${candidate.name}-${candidate.location?.city || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function compileBlockedPatterns(batch: BatchConfig) {
  const defaults = [
    "Stewart'?s Shops?",
    'Dairy Queen',
    'Carvel',
    'Cold Stone',
    'Baskin',
    "Friendly'?s",
    'Sonic',
    "McDonald'?s",
    "Culver'?s",
    'Shake Shack',
  ];

  return [...defaults, ...(batch.exclusions?.blockedNamePatterns || [])]
    .map(pattern => new RegExp(pattern, 'i'));
}

function cityInTarget(candidate: Candidate, target: BatchTarget) {
  const city = candidate.location?.city || '';
  const location = `${candidate.location?.address || ''} ${city} ${candidate.location?.region || ''}`;
  const targetText = `${target.name} ${target.location}`;
  return city.length > 0 && targetText.toLowerCase().includes(city.toLowerCase()) ||
    location.toLowerCase().includes(target.location.toLowerCase().split(',')[0] || '');
}

function selectCandidates(candidates: Candidate[], batch: BatchConfig, limit: number) {
  const blockedPatterns = compileBlockedPatterns(batch);
  const unblocked = candidates.filter(candidate =>
    !blockedPatterns.some(pattern => pattern.test(candidate.name))
  );

  if (!batch.targets?.length) return uniqueByIdOrName(unblocked).slice(0, limit);

  const selected: Candidate[] = [];
  const perTarget = Math.max(1, Math.ceil(limit / batch.targets.length));

  for (const target of batch.targets) {
    const matches = unblocked.filter(candidate => cityInTarget(candidate, target));
    selected.push(...matches.slice(0, perTarget));
    if (selected.length >= limit) break;
  }

  if (selected.length < limit) {
    selected.push(...unblocked.filter(candidate => !selected.includes(candidate)).slice(0, limit - selected.length));
  }

  return uniqueByIdOrName(selected).slice(0, limit);
}

function candidateSearchQueries(candidate: Candidate) {
  const cityState = [candidate.location?.city, candidate.location?.region].filter(Boolean).join(' ');
  const exactName = `"${candidate.name}" ${cityState}`.trim();
  return [
    `${exactName} official ice cream menu address`,
    `${exactName} Instagram ice cream cone sundae scoop`,
    `${exactName} Facebook ice cream photos`,
    `${exactName} Google reviews ice cream photos 2025`,
    `${exactName} gluten free cone OR gluten-free cone`,
  ];
}

function buildPrompt(batch: BatchConfig, selected: Candidate[]) {
  const candidateBlock = selected.map((candidate, index) => {
    const location = candidate.location || {};
    return `${index + 1}. ${candidate.name}
   candidateId: ${candidate.id || slugify(candidate.name)}
   currentLocation: ${location.address || 'UNKNOWN'}, ${location.city || 'UNKNOWN'}, ${location.region || 'UNKNOWN'}, ${location.country || 'USA'}
   currentCoords: ${location.lat ?? 'UNKNOWN'}, ${location.lng ?? 'UNKNOWN'}
   knownIssues: ${(candidate.reasons || []).join(', ') || 'none recorded'}
   requiredFixes: ${(candidate.enrichmentRequired || []).join('; ') || 'apply full quality bar'}
   searchQueries:
     - ${candidateSearchQueries(candidate).join('\n     - ')}`;
  }).join('\n\n');

  return `You are running a Mosaic deep-enrichment recovery wave.

Map intent:
${batch.baseTopic}

Your task is to prove which candidates are safe to publish, not to maximize count.

Hard pass requirements for every public candidate:
1. Exact street address, not town-only, area-only, "multiple locations", or ambiguous locations.
2. Address-level latitude/longitude matching that exact address.
3. Current 2023-2026 signal that the business operates and serves ice cream/frozen dessert.
4. Product specificity: ice cream, gelato, frozen custard, soft serve, paletas, shave ice, sorbet, cones, sundaes, or a directly relevant frozen dessert.
5. At least two source-attributed real product photos from the actual business/location.
6. Reject stock photos, storefronts, logos, parking lots, generic menu icons, and placeholder photo briefs.
7. Reject convenience-store/gas-station/generic-chain filler unless a later map intent explicitly asks for chains.

Research method:
- Check official site/menu first for address and product.
- Check official Instagram/Facebook for current product photos.
- Check local food press and recent reviews for current operation and relevance.
- Use Google/Yelp/Maps-like ecosystems only as verification/discovery where appropriate; prefer official or source-attributed URLs in the final evidence.
- Record failed candidates as carefully as passed candidates.

Candidates to investigate:

${candidateBlock}

Return only valid JSON in this exact shape:
{
  "wave": "${batch.wave}",
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
      "description": "Factual 1-3 sentence explanation of why this belongs.",
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
          "caption": "What real product is visible and why it is archetypal",
          "credit": "Source attribution",
          "type": "product"
        }
      ],
      "photoEvidence": [
        {
          "url": "https://...",
          "caption": "What real product is visible",
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
}`;
}

const inputPath = argValue('input', DEFAULT_INPUT)!;
const batchPath = argValue('batch', DEFAULT_BATCH)!;
const outDir = argValue('out-dir', DEFAULT_OUT_DIR)!;
const limit = Number(argValue('limit', '12'));

const rawInput = readJson<any>(inputPath);
const batch = readJson<BatchConfig>(batchPath);
const candidates = uniqueByIdOrName(extractCandidates(rawInput));
const selected = selectCandidates(candidates, batch, limit);
const generatedAt = new Date().toISOString();
const runId = `${batch.wave}-${generatedAt.replace(/[:.]/g, '-')}`;

const artifact = {
  wave: batch.wave,
  generatedAt,
  sourceInput: inputPath,
  sourceBatch: batchPath,
  status: 'prompt_pack_only',
  publicPromotionAllowed: false,
  selectedCount: selected.length,
  selectedCandidates: selected,
  executionAdvice: {
    whereToRun: 'Run the deep research inside this repo in a parallel Codex/GPT/Grok window, writing only data/enrichment-runs artifacts until reviewed.',
    firstCommand: `npx tsx scripts/enrich-candidates.ts --input=${inputPath} --batch=${batchPath} --limit=${limit}`,
    promotionGate: 'Do not edit public/data/maps/*/entries.json until every passed candidate has exact address, address-level coordinates, current evidence, and at least two source-attributed real product photos.',
  },
  deepResearchPrompt: buildPrompt(batch, selected),
};

fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `${runId}-prompt-pack.json`);
fs.writeFileSync(outFile, `${JSON.stringify(artifact, null, 2)}\n`);

console.log(`Created enrichment prompt pack: ${outFile}`);
console.log(`Selected candidates: ${selected.length}`);
console.log('Public map entries were not changed.');
