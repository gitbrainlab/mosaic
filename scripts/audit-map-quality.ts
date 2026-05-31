#!/usr/bin/env tsx
/**
 * Audits public map entries against the Mosaic public-quality bar.
 *
 * This script does not change public data. It writes a structured artifact that
 * shows which entries have exact addresses, address-level coordinates, recent
 * evidence, and source-attributed product photos.
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
  slug?: string;
  title?: string;
  validation?: {
    coordinateBounds?: Bounds;
    requireStreetAddress?: boolean;
    requireVerifiedProductPhotos?: boolean;
    requireRecentSignalSince?: number;
    blockedNamePatterns?: string[];
  };
}

interface Entry {
  id?: string;
  name?: string;
  location?: {
    address?: string;
    city?: string;
    region?: string;
    country?: string;
    lat?: number;
    lng?: number;
  };
  confidence?: string;
  evidence?: unknown[];
  sources?: string[];
  photos?: Array<{ url?: string; caption?: string; credit?: string; type?: string }>;
  photoEvidence?: Array<{ url?: string; caption?: string; credit?: string; verified?: boolean }>;
  attributes?: Record<string, unknown>;
  lastVerified?: string;
  added?: string;
}

function argValue(name: string, fallback?: string) {
  const prefix = `--${name}=`;
  const arg = process.argv.find(item => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
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

function verifiedPhotoCount(entry: Entry) {
  return (entry.photoEvidence || []).filter(photo => photo?.verified).length;
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

function sourceCount(entry: Entry) {
  const urls = new Set<string>();
  for (const source of entry.sources || []) {
    if (typeof source === 'string' && source.startsWith('http')) urls.add(source);
  }
  for (const evidence of entry.evidence || []) {
    const url = (evidence as any)?.url;
    if (typeof url === 'string' && url.startsWith('http')) urls.add(url);
  }
  return urls.size;
}

function blockedPatterns(manifest: Manifest | null) {
  return (manifest?.validation?.blockedNamePatterns || [
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

function auditEntry(entry: Entry, manifest: Manifest | null, minPhotos: number, sinceYear: number) {
  const issues: string[] = [];
  const location = entry.location || {};
  const lat = location.lat;
  const lng = location.lng;
  const bounds = manifest?.validation?.coordinateBounds;

  if (!hasPreciseStreetAddress(location.address)) issues.push('missing_exact_street_address');
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) issues.push('missing_address_level_coordinates');
  if (isFiniteNumber(lat) && isFiniteNumber(lng) && bounds && !inBounds(lat, lng, bounds)) {
    issues.push('outside_manifest_coordinate_bounds');
  }
  if (!Array.isArray(entry.evidence) || entry.evidence.length === 0) issues.push('missing_evidence');
  if (!hasRecentSignal(entry, sinceYear)) issues.push('missing_recent_signal');
  if (verifiedPhotoCount(entry) < minPhotos) issues.push('insufficient_verified_product_photos');
  if (!Array.isArray(entry.photos) || entry.photos.length < minPhotos) issues.push('insufficient_public_photos');
  if (blockedPatterns(manifest).some(pattern => pattern.test(entry.name || ''))) {
    issues.push('blocked_chain_or_convenience_store');
  }

  return {
    id: entry.id || slugify(entry.name || 'unknown'),
    name: entry.name || 'Unknown',
    address: location.address || null,
    city: location.city || null,
    region: location.region || null,
    lat: isFiniteNumber(lat) ? lat : null,
    lng: isFiniteNumber(lng) ? lng : null,
    confidence: entry.confidence || null,
    sourceCount: sourceCount(entry),
    evidenceCount: Array.isArray(entry.evidence) ? entry.evidence.length : 0,
    photoCount: Array.isArray(entry.photos) ? entry.photos.length : 0,
    verifiedPhotoEvidenceCount: verifiedPhotoCount(entry),
    issues,
    publicReady: issues.length === 0,
  };
}

const mapSlug = argValue('map') || argValue('slug');
const entriesArg = argValue('entries');
const outDir = argValue('out-dir', 'data/enrichment-runs')!;
const minPhotos = Number(argValue('min-photos', '2'));
const sinceYear = Number(argValue('since', '2023'));

if (!mapSlug && !entriesArg) {
  console.error('Usage: npx tsx scripts/audit-map-quality.ts --map=<slug> [--min-photos=2] [--since=2023]');
  console.error('   or: npx tsx scripts/audit-map-quality.ts --entries=<path/to/entries.json>');
  process.exit(1);
}

const entriesPath = entriesArg || path.join('public', 'data', 'maps', mapSlug!, 'entries.json');
const mapDir = path.dirname(entriesPath);
const manifestPath = path.join(mapDir, 'manifest.json');
const manifest = fs.existsSync(manifestPath) ? readJson<Manifest>(manifestPath) : null;
const resolvedSlug = mapSlug || manifest?.slug || path.basename(mapDir);
const entries = readJson<Entry[]>(entriesPath);

if (!Array.isArray(entries)) {
  console.error(`${entriesPath} must be a JSON array.`);
  process.exit(1);
}

const generatedAt = new Date().toISOString();
const auditedEntries = entries.map(entry => auditEntry(entry, manifest, minPhotos, sinceYear));
const issueCounts = auditedEntries.reduce<Record<string, number>>((counts, entry) => {
  for (const issue of entry.issues) counts[issue] = (counts[issue] || 0) + 1;
  return counts;
}, {});

const artifact = {
  generatedAt,
  mapSlug: resolvedSlug,
  mapTitle: manifest?.title || resolvedSlug,
  sourceEntries: entriesPath,
  policy: {
    minVerifiedProductPhotos: minPhotos,
    recentSignalSince: sinceYear,
    preciseStreetAddressRequired: true,
    note: 'This audit checks data quality. It does not change whether the current UI displays street addresses on every map surface.',
  },
  summary: {
    totalEntries: entries.length,
    publicReadyCount: auditedEntries.filter(entry => entry.publicReady).length,
    preciseStreetAddressCount: auditedEntries.filter(entry => !entry.issues.includes('missing_exact_street_address')).length,
    coordinateReadyCount: auditedEntries.filter(entry => !entry.issues.includes('missing_address_level_coordinates') && !entry.issues.includes('outside_manifest_coordinate_bounds')).length,
    recentSignalCount: auditedEntries.filter(entry => !entry.issues.includes('missing_recent_signal')).length,
    verifiedPhotoReadyCount: auditedEntries.filter(entry => !entry.issues.includes('insufficient_verified_product_photos')).length,
    issueCounts,
  },
  entries: auditedEntries,
};

const outFile = path.join(outDir, `${resolvedSlug}-quality-audit-${generatedAt.replace(/[:.]/g, '-')}.json`);
writeJson(outFile, artifact);

console.log(`Wrote map quality audit: ${outFile}`);
console.log(`Public-ready entries: ${artifact.summary.publicReadyCount}/${artifact.summary.totalEntries}`);
console.log(`Exact street addresses: ${artifact.summary.preciseStreetAddressCount}/${artifact.summary.totalEntries}`);
console.log(`Verified photo ready: ${artifact.summary.verifiedPhotoReadyCount}/${artifact.summary.totalEntries}`);
