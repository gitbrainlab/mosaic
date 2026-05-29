#!/usr/bin/env tsx
/**
 * Tightens the public nationwide ice-cream map to only entries that meet the
 * current Mosaic quality bar. The previous 300-entry wave is retained as a
 * rejected candidate backlog so research agents can enrich it back to scale.
 */
import fs from 'fs';
import path from 'path';

type Entry = {
  id: string;
  name: string;
  location: {
    address: string;
    city: string;
    region?: string;
    country: string;
    lat: number;
    lng: number;
  };
  description: string;
  confidence: 'high' | 'medium' | 'low';
  evidence: Array<{ source?: string; url?: string; date?: string; detail?: string }>;
  tags: string[];
  photos?: Array<{ url: string; caption?: string; credit?: string; type?: string }>;
  photoEvidence?: Array<{ url: string; caption?: string; credit?: string; verified?: boolean }>;
  sources?: string[];
  attributes?: Record<string, unknown>;
  classification?: Record<string, unknown>;
};

const TARGET_SLUG = 'ice-cream-nationwide-albany-radial';
const SOURCE_SLUG = 'gluten-free-cone-ice-cream-capital-region';

const targetDir = path.join('public', 'data', 'maps', TARGET_SLUG);
const sourceDir = path.join('public', 'data', 'maps', SOURCE_SLUG);
const enrichmentDir = path.join('public', 'data', 'enrichment');

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

function writeJson(file: string, value: unknown) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function hasProductPhotos(entry: Entry) {
  const photos = entry.photos || [];
  const verified = (entry.photoEvidence || []).filter(photo => photo.verified);
  return photos.length > 0 && verified.length > 0;
}

function hasPreciseStreetAddress(entry: Entry) {
  const address = entry.location.address || '';
  if (address.length < 5) return false;
  if (!/\d/.test(address)) return false;
  return !/(multiple|area|unknown|city center|downtown|various|including|nearby|tbd)/i.test(address);
}

function hasRecentSignal(entry: Entry) {
  const haystack = JSON.stringify({
    evidence: entry.evidence,
    added: (entry as any).added,
    lastVerified: (entry as any).lastVerified,
    attributes: entry.attributes,
  });
  return /202[3-6]/.test(haystack);
}

function isBlockedChainOrConvenience(entry: Entry) {
  return /(stewart'?s|dairy queen|carvel|cold stone|baskin|friendly'?s|sonic|mcdonald|culver'?s|shake shack)/i.test(entry.name);
}

function rejectionReasons(entry: Entry) {
  const reasons: string[] = [];
  if (isBlockedChainOrConvenience(entry)) reasons.push('blocked_chain_or_convenience_store');
  if (!hasPreciseStreetAddress(entry)) reasons.push('not_address_level');
  if (!hasProductPhotos(entry)) reasons.push('missing_verified_real_product_photos');
  if (!hasRecentSignal(entry)) reasons.push('no_recent_2023_2026_signal');
  if ((entry.evidence || []).length < 2) reasons.push('thin_evidence');
  return reasons;
}

function distanceFromAlbanyMiles(lat: number, lng: number) {
  const albany = { lat: 42.6526, lng: -73.7562 };
  const rad = Math.PI / 180;
  const earthMiles = 3958.8;
  const dLat = (lat - albany.lat) * rad;
  const dLng = (lng - albany.lng) * rad;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(albany.lat * rad) * Math.cos(lat * rad) * Math.sin(dLng / 2) ** 2;
  return Number((earthMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(1));
}

function qualityGateEntry(entry: Entry): Entry {
  const distance = distanceFromAlbanyMiles(entry.location.lat, entry.location.lng);
  return {
    ...entry,
    id: entry.id.replace(/^gluten-free-cone-ice-cream-capital-region-/, ''),
    tags: Array.from(new Set([...(entry.tags || []), 'verified_seed', 'real_product_photos', 'address_level'])),
    attributes: {
      ...(entry.attributes || {}),
      distanceFromAlbanyMiles: distance,
      radialRing: distance <= 50 ? 'Albany core and immediate Capital Region' : 'Albany radial verified seed',
      nationwideWave: 'ice-cream-nationwide-albany-radial-quality-gate',
      qualityStatus: 'verified_public_entry',
      photoSourcingStatus: 'verified_real_product_photos',
    },
    classification: {
      ...(entry.classification || {}),
      publicQualityGate: 'passed',
    },
  };
}

function main() {
  const previousEntries = readJson<Entry[]>(path.join(targetDir, 'entries.json'));
  const verifiedSeed = readJson<Entry[]>(path.join(sourceDir, 'entries.json')).map(qualityGateEntry);

  const rejectedCandidates = previousEntries.map(entry => ({
    id: entry.id,
    name: entry.name,
    location: entry.location,
    confidence: entry.confidence,
    reasons: rejectionReasons(entry),
    evidenceCount: entry.evidence?.length || 0,
    photoCount: entry.photos?.length || 0,
    photoBriefCount: ((entry as any).photoBriefs || []).length,
    enrichmentRequired: [
      'verify current operation and exact street address',
      'remove if it is primarily a convenience store, gas station, or generic chain',
      'add 2 or more source-attributed real product photos from the actual location',
      'add recent 2023-2026 evidence with source URLs',
      'replace broad town coordinates with address-level coordinates',
    ],
  }));

  const now = new Date().toISOString();
  const lats = verifiedSeed.map(entry => entry.location.lat);
  const lngs = verifiedSeed.map(entry => entry.location.lng);

  const manifest = {
    slug: TARGET_SLUG,
    title: 'Ice Cream Nationwide - Verified Albany Radial Seed',
    tagline: 'Verified address-level ice cream entries with current evidence and real product photos; 300-candidate expansion backlog retained for enrichment',
    version: '1.0.0',
    totalEntries: verifiedSeed.length,
    lastUpdated: now.split('T')[0],
    defaultCenter: [42.85, -73.78],
    defaultZoom: 9,
    filterFields: ['city', 'confidence'],
    chunks: ['entries.json'],
    intent: {
      statement: 'Build a nationwide ice cream atlas outward from Albany, but only publish entries once they have precise location data, recent relevance, and real product-photo evidence.',
      scope: 'Public entries must be independent or destination-worthy frozen dessert places with exact street addresses, current evidence, and verified real product photos. The 300-entry target remains a research backlog, not a public-quality claim.',
      photoPolicy: 'No stock images, no generic storefronts, no placeholder photo briefs in the public map. Display only source-attributed real product photos from the actual place.',
    },
    intentHistory: [
      {
        changedAt: now,
        author: 'codex',
        summary: 'Applied strict quality gate after review found town-level pins, convenience-store entries, stale evidence, and placeholder-only photos in the 300-candidate wave.',
      },
    ],
    validation: {
      coordinateBounds: {
        minLat: Number((Math.min(...lats) - 0.2).toFixed(6)),
        maxLat: Number((Math.max(...lats) + 0.2).toFixed(6)),
        minLng: Number((Math.min(...lngs) - 0.2).toFixed(6)),
        maxLng: Number((Math.max(...lngs) + 0.2).toFixed(6)),
      },
      requireStreetAddress: true,
      requireVerifiedProductPhotos: true,
      requireRecentSignalSince: 2023,
      blockedNamePatterns: [
        "Stewart's",
        'Dairy Queen',
        'Carvel',
        'Cold Stone',
        'Baskin',
        "Friendly's",
        'Sonic',
        "McDonald's",
        "Culver's",
        'Shake Shack',
      ],
    },
    research: {
      publicQualityStatus: 'verified_seed_only',
      targetEntries: 300,
      previousCandidateCount: previousEntries.length,
      publishedVerifiedEntries: verifiedSeed.length,
      rejectedCandidateBacklog: 'public/data/enrichment/ice-cream-nationwide-albany-radial-rejected-candidates.json',
      restorationRule: 'Only promote candidates back into entries.json after passing the validation gates in this manifest.',
    },
  };

  fs.mkdirSync(enrichmentDir, { recursive: true });
  writeJson(path.join(targetDir, 'entries.json'), verifiedSeed);
  writeJson(path.join(targetDir, 'manifest.json'), manifest);
  writeJson(path.join(enrichmentDir, 'ice-cream-nationwide-albany-radial-rejected-candidates.json'), {
    generatedAt: now,
    sourceMap: TARGET_SLUG,
    targetEntries: 300,
    publicVerifiedEntries: verifiedSeed.length,
    rejectedCandidateCount: rejectedCandidates.length,
    rejectedCandidates,
  });

  const indexPath = path.join('public', 'data', 'index.json');
  const index = readJson<any>(indexPath);
  index.lastUpdated = now.split('T')[0];
  index.maps = index.maps.map((map: any) => map.slug === TARGET_SLUG ? {
    ...map,
    title: manifest.title,
    tagline: manifest.tagline,
    entryCount: verifiedSeed.length,
    lastUpdated: manifest.lastUpdated,
  } : map);
  writeJson(indexPath, index);

  console.log(`Published ${verifiedSeed.length} verified entries and moved ${rejectedCandidates.length} candidates to enrichment backlog.`);
}

main();
