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

interface PublicEntry {
  id?: string;
  name?: string;
  location?: {
    address?: string;
    city?: string;
    region?: string;
  };
}

interface Bounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

interface BatchTarget {
  name: string;
  location: string;
  items?: string[];
  searchFocus?: string[];
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

function normalizeIdentityPart(value?: string) {
  return (value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function locationIdentity(item: Candidate | PublicEntry) {
  return [
    normalizeIdentityPart(item.name),
    normalizeIdentityPart(item.location?.address),
    normalizeIdentityPart(item.location?.city),
    normalizeIdentityPart(item.location?.region),
  ].join('|');
}

function loadExcludedMapIdentities(mapSlug?: string) {
  if (!mapSlug) {
    return {
      ids: new Set<string>(),
      locationIdentities: new Set<string>(),
      coordinateBounds: undefined as Bounds | undefined,
    };
  }

  const entriesPath = path.join('public', 'data', 'maps', mapSlug, 'entries.json');
  const manifestPath = path.join('public', 'data', 'maps', mapSlug, 'manifest.json');
  if (!fs.existsSync(entriesPath)) {
    throw new Error(`Cannot exclude existing entries; map entries file not found: ${entriesPath}`);
  }

  const entries = readJson<PublicEntry[]>(entriesPath);
  const manifest = fs.existsSync(manifestPath) ? readJson<any>(manifestPath) : {};
  return {
    ids: new Set(entries.map(entry => entry.id).filter((id): id is string => Boolean(id))),
    locationIdentities: new Set(entries.map(locationIdentity)),
    coordinateBounds: manifest?.validation?.coordinateBounds as Bounds | undefined,
  };
}

function isExcludedByMap(candidate: Candidate, excluded: ReturnType<typeof loadExcludedMapIdentities>) {
  if (candidate.id && excluded.ids.has(candidate.id)) return true;
  return excluded.locationIdentities.has(locationIdentity(candidate));
}

function isInsideBounds(candidate: Candidate, bounds?: Bounds) {
  if (!bounds) return true;
  const lat = candidate.location?.lat;
  const lng = candidate.location?.lng;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return lat! >= bounds.minLat &&
    lat! <= bounds.maxLat &&
    lng! >= bounds.minLng &&
    lng! <= bounds.maxLng;
}

function slugify(text: string) {
  return text.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

const REGION_ALIASES: Record<string, string[]> = {
  ME: ['me', 'maine'],
  NH: ['nh', 'new hampshire'],
  VT: ['vt', 'vermont'],
  MA: ['ma', 'massachusetts'],
  RI: ['ri', 'rhode island'],
  CT: ['ct', 'connecticut'],
  NY: ['ny', 'new york'],
  PA: ['pa', 'pennsylvania'],
  OR: ['or', 'oregon'],
};

function normalizedRegion(region?: string) {
  const lower = normalizeIdentityPart(region);
  for (const [code, aliases] of Object.entries(REGION_ALIASES)) {
    if (aliases.includes(lower)) return code;
  }
  return region?.toUpperCase();
}

function targetRegion(target: BatchTarget) {
  const text = normalizeIdentityPart(`${target.name} ${target.location}`);
  const tokens = new Set(text.split(' '));
  for (const [code, aliases] of Object.entries(REGION_ALIASES)) {
    if (aliases.some(alias => alias.length <= 2 ? tokens.has(alias) : text.includes(alias))) return code;
  }
  return undefined;
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
    const keys = [
      candidate.id,
      `${candidate.name}-${candidate.location?.city || ''}`,
      candidate.location?.address
        ? `loc:${normalizeIdentityPart(candidate.location.address)}|${normalizeIdentityPart(candidate.location.city)}|${normalizeIdentityPart(candidate.location.region)}`
        : undefined,
    ].filter((key): key is string => Boolean(key));

    if (keys.some(key => seen.has(key))) return false;
    for (const key of keys) seen.add(key);
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
    'Ben & Jerry',
    'Van Leeuwen',
    'Cumbys',
    'Cumberland Farms',
  ];

  return [...defaults, ...(batch.exclusions?.blockedNamePatterns || [])]
    .map(pattern => new RegExp(pattern, 'i'));
}

function candidateScore(candidate: Candidate) {
  let score = 0;
  const name = candidate.name || '';
  const reasons = candidate.reasons || [];
  const address = candidate.location?.address || '';

  score += (candidate.evidenceCount || 0) * 4;
  score += (candidate.photoBriefCount || 0) * 3;
  score += (candidate.photoCount || 0) * 2;
  if (candidate.confidence === 'high') score += 3;
  if (/\d/.test(address)) score += 4;
  if (Number.isFinite(candidate.location?.lat) && Number.isFinite(candidate.location?.lng)) score += 3;
  if (/ice cream|creamery|gelato|soft serve|custard|dairy|kreme|scoop|frosty|frozen/i.test(name)) score += 6;
  if (/drive-in|dandee|dairy haus|dairy barn|snowman|jumpin/i.test(name)) score += 3;

  if (reasons.includes('blocked_chain_or_convenience_store')) score -= 80;
  if (reasons.includes('not_address_level')) score -= 20;
  if (reasons.includes('thin_evidence')) score -= 8;
  if (reasons.includes('no_recent_2023_2026_signal')) score -= 5;
  if (/restaurant|market|hot haus|chocolate bar|candy|sweets/i.test(name)) score -= 4;

  return score;
}

function rankCandidates(candidates: Candidate[]) {
  return [...candidates].sort((a, b) => candidateScore(b) - candidateScore(a));
}

function targetItemBoost(candidate: Candidate, target: BatchTarget) {
  const name = normalizeIdentityPart(candidate.name);
  const items = target.items || [];
  if (items.some(item => name === normalizeIdentityPart(item))) return 40;
  if (items.some(item => name.includes(normalizeIdentityPart(item)) || normalizeIdentityPart(item).includes(name))) return 24;
  return 0;
}

function rankCandidatesForTarget(candidates: Candidate[], target: BatchTarget) {
  return [...candidates].sort((a, b) =>
    (candidateScore(b) + targetItemBoost(b, target)) - (candidateScore(a) + targetItemBoost(a, target))
  );
}

function cityInTarget(candidate: Candidate, target: BatchTarget) {
  const city = candidate.location?.city || '';
  const region = normalizedRegion(candidate.location?.region);
  const expectedRegion = targetRegion(target);
  if (expectedRegion && region && region !== expectedRegion) return false;

  const location = `${candidate.location?.address || ''} ${city} ${candidate.location?.region || ''}`;
  const targetText = `${target.name} ${target.location}`;
  const itemMatch = (target.items || []).some(item =>
    normalizeIdentityPart(candidate.name) === normalizeIdentityPart(item) ||
    normalizeIdentityPart(candidate.name).includes(normalizeIdentityPart(item))
  );

  return itemMatch ||
    city.length > 0 && targetText.toLowerCase().includes(city.toLowerCase()) ||
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
    const matches = rankCandidatesForTarget(unblocked.filter(candidate => cityInTarget(candidate, target)), target);
    selected.push(...matches.slice(0, perTarget));
    if (selected.length >= limit) break;
  }

  if (selected.length < limit) {
    selected.push(...rankCandidates(unblocked.filter(candidate => !selected.includes(candidate))).slice(0, limit - selected.length));
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

function targetContext(target?: BatchTarget) {
  if (!target) return '';
  return `\nFocused target cluster:
- name: ${target.name}
- geography: ${target.location}
- anchor items: ${(target.items || []).join('; ') || 'none'}
- search focus: ${(target.searchFocus || []).join('; ') || 'official address/menu, recent operation, source-attributed real product photos'}\n`;
}

function buildPrompt(batch: BatchConfig, selected: Candidate[], selectedTarget?: BatchTarget) {
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
${targetContext(selectedTarget)}

Your task is to prove which candidates are safe to publish, not to maximize count.

Hard pass requirements for every public candidate:
1. Exact street address, not town-only, area-only, "multiple locations", or ambiguous locations.
2. Address-level latitude/longitude matching that exact address.
3. Current 2023-2026 signal that the business operates and serves ice cream/frozen dessert.
4. Product specificity: ice cream, gelato, frozen custard, soft serve, paletas, shave ice, sorbet, cones, sundaes, or a directly relevant frozen dessert.
5. At least two source-attributed real product photos from the actual business/location.
6. Reject stock photos, storefronts, logos, parking lots, generic menu icons, and placeholder photo briefs.
7. Reject convenience-store/gas-station/generic-chain filler unless a later map intent explicitly asks for chains.
8. Do not call a photo "official" unless the source account/page is clearly owned by the business. If a customer, influencer, local guide, press article, Yelp, Google, or Tripadvisor page supplies the photo, credit that source exactly and mark the item for manual review unless the page itself ties the photo to the exact location.
9. A social/gallery page with many images is not enough; each photo record must point to a specific post/page or image candidate and explain what proves the visible product belongs to the actual place.

Research method:
- Check official site/menu first for address and product.
- Check official Instagram/Facebook for current product photos.
- Check local food press and recent reviews for current operation, relevance, and attributed product photos.
- Use Google/Yelp/Maps-like ecosystems only as verification/discovery where appropriate; prefer official or source-attributed URLs in the final evidence.
- Record failed candidates as carefully as passed candidates.
- Prefer "pass with manual review" over false certainty when product photos come from social galleries, review platforms, or third-party posts. Include tags like "manual_photo_review" or reject if two product photos cannot be tied to the exact location.

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
const offset = Number(argValue('offset', '0'));
const excludeMap = argValue('exclude-map') || argValue('target-map');
const targetName = argValue('target');
const targetIndexArg = argValue('target-index');

const rawInput = readJson<any>(inputPath);
const rawBatch = readJson<BatchConfig>(batchPath);
const selectedTarget = targetName
  ? rawBatch.targets?.find(target => normalizeIdentityPart(target.name) === normalizeIdentityPart(targetName))
  : targetIndexArg
    ? rawBatch.targets?.[Number(targetIndexArg)]
    : undefined;

if ((targetName || targetIndexArg) && !selectedTarget) {
  throw new Error(`Target not found in ${batchPath}: ${targetName || targetIndexArg}`);
}

const batch: BatchConfig = selectedTarget
  ? { ...rawBatch, targets: [selectedTarget] }
  : rawBatch;
const allCandidates = uniqueByIdOrName(extractCandidates(rawInput));
const excludedMapIdentities = loadExcludedMapIdentities(excludeMap);
const inBoundsCandidates = allCandidates.filter(candidate => isInsideBounds(candidate, excludedMapIdentities.coordinateBounds));
const candidates = inBoundsCandidates.filter(candidate => !isExcludedByMap(candidate, excludedMapIdentities));
const selectedPool = selectCandidates(candidates, batch, limit + offset);
const selected = selectedPool.slice(offset, offset + limit);
const generatedAt = new Date().toISOString();
const runId = `${batch.wave}-${generatedAt.replace(/[:.]/g, '-')}`;

const artifact = {
  wave: batch.wave,
  generatedAt,
  sourceInput: inputPath,
  sourceBatch: batchPath,
  selectedTarget: selectedTarget || null,
  excludedMap: excludeMap || null,
  excludedPublicCandidateCount: inBoundsCandidates.length - candidates.length,
  outOfBoundsCandidateCount: allCandidates.length - inBoundsCandidates.length,
  offset,
  status: 'prompt_pack_only',
  publicPromotionAllowed: false,
  selectedCount: selected.length,
  selectedCandidates: selected,
  executionAdvice: {
    whereToRun: 'Run the deep research inside this repo in a parallel Codex/GPT/Grok window, writing only data/enrichment-runs artifacts until reviewed.',
    firstCommand: `npx tsx scripts/enrich-candidates.ts --input=${inputPath} --batch=${batchPath} --limit=${limit}`,
    promotionGate: 'Do not edit public/data/maps/*/entries.json until every passed candidate has exact address, address-level coordinates, current evidence, and at least two source-attributed real product photos.',
  },
  deepResearchPrompt: buildPrompt(batch, selected, selectedTarget),
};

fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `${runId}-prompt-pack.json`);
fs.writeFileSync(outFile, `${JSON.stringify(artifact, null, 2)}\n`);

console.log(`Created enrichment prompt pack: ${outFile}`);
console.log(`Selected candidates: ${selected.length}`);
console.log('Public map entries were not changed.');
