#!/usr/bin/env tsx
/**
 * Converts passed[] records from an enrichment artifact into a guarded promotion
 * preview, or appends them to a public map when --apply is explicit.
 *
 * Default mode is dry-run. It never promotes entries with missing exact address,
 * bad coordinates, insufficient verified product photos, stale evidence, blocked
 * chain names, manual-review tags, or out-of-bounds coordinates.
 */
import fs from 'fs';
import path from 'path';

interface Bounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

interface Manifest {
  slug: string;
  title: string;
  totalEntries: number;
  lastUpdated: string;
  chunks: string[];
  intentHistory?: Array<{ changedAt: string; author: string; summary: string }>;
  validation?: {
    coordinateBounds?: Bounds;
    requireStreetAddress?: boolean;
    requireVerifiedProductPhotos?: boolean;
    requireRecentSignalSince?: number;
    blockedNamePatterns?: string[];
  };
}

interface Entry {
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
  evidence: Array<{ type?: string; source?: string; url?: string; detail?: string; date?: string }>;
  sources?: string[];
  photos?: Array<{ url: string; caption: string; credit?: string; type?: string }>;
  photoEvidence?: Array<{ url: string; caption?: string; credit?: string; verified?: boolean; publicDisplayReady?: boolean }>;
  tags?: string[];
  attributes?: Record<string, unknown>;
  added?: string;
  lastVerified?: string;
  notes?: string;
  classification?: Record<string, unknown>;
}

function argValue(name: string, fallback?: string) {
  const prefix = `--${name}=`;
  const arg = process.argv.find(item => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

function writeJson(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function slugify(text: string) {
  return text.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function hasPreciseStreetAddress(address: unknown) {
  if (typeof address !== 'string' || address.trim().length < 5) return false;
  if (!/\d/.test(address)) return false;
  return !/(multiple|area|unknown|city center|downtown|various|including|nearby|tbd)/i.test(address);
}

function inBounds(lat: number, lng: number, bounds: Bounds) {
  return lat >= bounds.minLat &&
    lat <= bounds.maxLat &&
    lng >= bounds.minLng &&
    lng <= bounds.maxLng;
}

function hasRecentSignal(entry: Entry, sinceYear: number) {
  const haystack = JSON.stringify({
    evidence: entry.evidence,
    attributes: entry.attributes,
    lastVerified: entry.lastVerified,
    added: entry.added,
  });
  const years = haystack.match(/20\d{2}/g) || [];
  return years.some(year => Number(year) >= sinceYear);
}

function blockedPatterns(manifest: Manifest) {
  return (manifest.validation?.blockedNamePatterns || [
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
  ]).map(pattern => new RegExp(pattern, 'i'));
}

function normalizedIdentity(entry: Entry) {
  return `${entry.name}|${entry.location.address}|${entry.location.city}|${entry.location.region || ''}`
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function findExistingDuplicate(entry: Entry, existingEntries: Entry[]) {
  return existingEntries.find(existing => existing.id === entry.id) ||
    existingEntries.find(existing => normalizedIdentity(existing) === normalizedIdentity(entry));
}

function verifiedPhotos(entry: Entry) {
  return (entry.photoEvidence || []).filter(photo => photo?.verified);
}

function hasManualReviewTag(entry: Entry) {
  return (entry.tags || []).some(tag => /manual|proof_only|needs_review/i.test(tag));
}

function hasOutOfBoundsTag(entry: Entry) {
  return (entry.tags || []).some(tag => /out_of_current_bounds|out_of_bounds/i.test(tag));
}

function validationFailures(
  entry: Entry,
  manifest: Manifest,
  existingEntries: Entry[],
  options: {
    minPhotos: number;
    sinceYear: number;
    allowManualReview: boolean;
    allowOutOfBounds: boolean;
    requirePublicDisplayReady: boolean;
  },
) {
  const failures: string[] = [];
  const bounds = manifest.validation?.coordinateBounds;
  const lat = entry.location?.lat;
  const lng = entry.location?.lng;

  if (!entry.id || typeof entry.id !== 'string') failures.push('missing_id');
  if (!entry.name || typeof entry.name !== 'string') failures.push('missing_name');
  if (!['high', 'medium', 'low'].includes(entry.confidence)) failures.push('invalid_confidence');
  if (!entry.description || typeof entry.description !== 'string') failures.push('missing_description');
  if (!hasPreciseStreetAddress(entry.location?.address)) failures.push('missing_exact_street_address');
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) failures.push('missing_address_level_coordinates');
  if (isFiniteNumber(lat) && isFiniteNumber(lng) && bounds && !inBounds(lat, lng, bounds)) {
    failures.push('outside_manifest_coordinate_bounds');
  }
  if (hasOutOfBoundsTag(entry) && !options.allowOutOfBounds) failures.push('out_of_bounds_tag_requires_review');
  if (hasManualReviewTag(entry) && !options.allowManualReview) failures.push('manual_review_tag_requires_review');
  if (!Array.isArray(entry.evidence) || entry.evidence.length === 0) failures.push('missing_evidence');
  if (!hasRecentSignal(entry, options.sinceYear)) failures.push('missing_recent_signal');
  if ((entry.photos || []).length < options.minPhotos) failures.push('insufficient_public_photos');
  if (verifiedPhotos(entry).length < options.minPhotos) failures.push('insufficient_verified_product_photos');
  if (options.requirePublicDisplayReady && verifiedPhotos(entry).some(photo => photo.publicDisplayReady === false)) {
    failures.push('proof_only_photo_not_public_display_ready');
  }
  if (blockedPatterns(manifest).some(pattern => pattern.test(entry.name))) failures.push('blocked_chain_or_convenience_store');
  if (existingEntries.some(existing => existing.id === entry.id)) failures.push('duplicate_id');
  if (existingEntries.some(existing => normalizedIdentity(existing) === normalizedIdentity(entry))) failures.push('duplicate_name_address');

  return failures;
}

function normalizeEntry(entry: Entry, sourceArtifact: string, generatedAt: string) {
  const tags = Array.from(new Set([
    ...(entry.tags || []),
    'address_level',
    'real_product_photos',
  ]));

  return {
    ...entry,
    id: entry.id || slugify(`${entry.name}-${entry.location.city}`),
    location: {
      ...entry.location,
      country: entry.location.country || 'USA',
    },
    tags,
    added: entry.added || generatedAt.split('T')[0],
    lastVerified: entry.lastVerified || (entry.attributes?.lastVerified as string | undefined) || generatedAt.split('T')[0],
    attributes: {
      ...(entry.attributes || {}),
      qualityStatus: 'verified_public_entry',
      photoSourcingStatus: 'verified_real_product_photos',
      promotionSourceArtifact: sourceArtifact,
      promotionDate: generatedAt.split('T')[0],
    },
    classification: {
      ...(entry.classification || {}),
      publicQualityGate: 'passed',
    },
  };
}

function updateIndex(mapSlug: string, manifest: Manifest) {
  const indexPath = path.join('public', 'data', 'index.json');
  if (!fs.existsSync(indexPath)) return false;

  const index = readJson<any>(indexPath);
  if (!Array.isArray(index.maps)) return false;

  let touched = false;
  index.lastUpdated = manifest.lastUpdated;
  index.maps = index.maps.map((map: any) => {
    if (map.slug !== mapSlug) return map;
    touched = true;
    return {
      ...map,
      entryCount: manifest.totalEntries,
      lastUpdated: manifest.lastUpdated,
    };
  });

  if (touched) writeJson(indexPath, index);
  return touched;
}

const inputPath = argValue('input');
const mapSlug = argValue('map') || argValue('slug');
const outDir = argValue('out-dir', 'data/enrichment-runs')!;
const minPhotos = Number(argValue('min-photos', '2'));
const apply = hasFlag('apply');
const allowManualReview = hasFlag('allow-manual-review');
const allowOutOfBounds = hasFlag('allow-out-of-bounds');
const requirePublicDisplayReady = !hasFlag('allow-proof-only-photos');

if (!inputPath || !mapSlug) {
  console.error('Usage: npx tsx scripts/promote-enrichment-artifact.ts --input=<enrichment.json> --map=<slug> [--apply]');
  process.exit(1);
}

const mapDir = path.join('public', 'data', 'maps', mapSlug);
const entriesPath = path.join(mapDir, 'entries.json');
const manifestPath = path.join(mapDir, 'manifest.json');

if (!fs.existsSync(entriesPath) || !fs.existsSync(manifestPath)) {
  console.error(`Map ${mapSlug} must have entries.json and manifest.json.`);
  process.exit(1);
}

const source = readJson<any>(inputPath);
const passed = Array.isArray(source.passed) ? source.passed as Entry[] : [];
const existingEntries = readJson<Entry[]>(entriesPath);
const manifest = readJson<Manifest>(manifestPath);
const generatedAt = new Date().toISOString();
const sinceYear = Number(argValue('since', String(manifest.validation?.requireRecentSignalSince || 2023)));

const accepted: Entry[] = [];
const rejected: Array<{ id: string; name: string; failures: string[] }> = [];
const updateCandidates: Array<{
  existingId: string;
  proposedId: string;
  name: string;
  address: string;
  city: string;
  photoCount: number;
  verifiedPhotoEvidenceCount: number;
  evidenceCount: number;
}> = [];

for (const candidate of passed) {
  const failures = validationFailures(candidate, manifest, [...existingEntries, ...accepted], {
    minPhotos,
    sinceYear,
    allowManualReview,
    allowOutOfBounds,
    requirePublicDisplayReady,
  });

  const duplicateFailures = failures.filter(failure => failure === 'duplicate_id' || failure === 'duplicate_name_address');
  const nonDuplicateFailures = failures.filter(failure => failure !== 'duplicate_id' && failure !== 'duplicate_name_address');
  const existingDuplicate = findExistingDuplicate(candidate, existingEntries);

  if (failures.length > 0 && duplicateFailures.length > 0 && nonDuplicateFailures.length === 0 && existingDuplicate) {
    updateCandidates.push({
      existingId: existingDuplicate.id,
      proposedId: candidate.id || slugify(candidate.name || 'unknown'),
      name: candidate.name || 'Unknown',
      address: candidate.location.address,
      city: candidate.location.city,
      photoCount: candidate.photos?.length || 0,
      verifiedPhotoEvidenceCount: verifiedPhotos(candidate).length,
      evidenceCount: candidate.evidence?.length || 0,
    });
  } else if (failures.length > 0) {
    rejected.push({
      id: candidate.id || slugify(candidate.name || 'unknown'),
      name: candidate.name || 'Unknown',
      failures,
    });
  } else {
    accepted.push(normalizeEntry(candidate, inputPath, generatedAt));
  }
}

const preview = {
  generatedAt,
  sourceArtifact: inputPath,
  targetMap: mapSlug,
  mode: apply ? 'apply' : 'dry_run',
  policy: {
    minVerifiedProductPhotos: minPhotos,
    recentSignalSince: sinceYear,
    allowManualReview,
    allowOutOfBounds,
    requirePublicDisplayReady,
  },
  summary: {
    passedCandidatesInArtifact: passed.length,
    acceptedCount: accepted.length,
    updateCandidateCount: updateCandidates.length,
    rejectedCount: rejected.length,
    existingEntryCount: existingEntries.length,
    resultingEntryCount: existingEntries.length + accepted.length,
  },
  accepted: accepted.map(entry => ({
    id: entry.id,
    name: entry.name,
    address: entry.location.address,
    city: entry.location.city,
    lat: entry.location.lat,
    lng: entry.location.lng,
    photoCount: entry.photos?.length || 0,
    verifiedPhotoEvidenceCount: verifiedPhotos(entry).length,
  })),
  updateCandidates,
  rejected,
};

const previewFile = path.join(outDir, `${mapSlug}-promotion-preview-${generatedAt.replace(/[:.]/g, '-')}.json`);
writeJson(previewFile, preview);

if (apply && accepted.length > 0) {
  const nextEntries = [...existingEntries, ...accepted];
  const nextManifest: Manifest = {
    ...manifest,
    totalEntries: nextEntries.length,
    lastUpdated: generatedAt.split('T')[0],
    intentHistory: [
      ...(manifest.intentHistory || []),
      {
        changedAt: generatedAt,
        author: 'promote-enrichment-artifact',
        summary: `Promoted ${accepted.length} verified enrichment entries from ${inputPath}.`,
      },
    ],
  };

  writeJson(entriesPath, nextEntries);
  writeJson(manifestPath, nextManifest);
  updateIndex(mapSlug, nextManifest);
}

console.log(`Wrote promotion preview: ${previewFile}`);
console.log(`Accepted: ${accepted.length}`);
console.log(`Rejected: ${rejected.length}`);
console.log(apply ? 'Apply mode complete.' : 'Dry run only. Public map entries were not changed.');
