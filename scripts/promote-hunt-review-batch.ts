#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import type { DataIndex, KnowledgeEntry, MapManifest } from '../src/types';
import type { HuntSpec } from '../src/types/hunt';

interface PromotionArtifact {
  huntId: string;
  targetMapSlug: string;
  mapTitle?: string;
  tagline?: string;
  intent?: {
    statement?: string;
    scope?: string;
    photoPolicy?: string;
  };
  approvedEntries: KnowledgeEntry[];
}

interface Args {
  huntId: string;
  targetMapSlug: string;
  promotionArtifact: string;
  approval?: string;
  apply: boolean;
  previewOutput?: string;
}

const args = parseArgs(process.argv.slice(2));
if (args.apply && args.approval !== 'PROMOTE') {
  throw new Error('Refusing public data write: --approval=PROMOTE is required with --apply.');
}

const promotion = readJson<PromotionArtifact>(args.promotionArtifact);
const huntSpecPath = path.join('public/data/research-batches/hunts', args.huntId, 'hunt-spec.json');
const spec = fs.existsSync(huntSpecPath) ? readJson<HuntSpec>(huntSpecPath) : null;
const mapSlug = args.targetMapSlug || promotion.targetMapSlug;
const mapDir = path.join('public/data/maps', mapSlug);
const manifestPath = path.join(mapDir, 'manifest.json');
const entriesPath = path.join(mapDir, 'entries.json');
const indexPath = 'public/data/index.json';
const existingManifest = fs.existsSync(manifestPath) ? readJson<MapManifest>(manifestPath) : null;
const existingEntries = fs.existsSync(entriesPath) ? readJson<KnowledgeEntry[]>(entriesPath) : [];
const manifest = existingManifest || createManifest(mapSlug, promotion, spec);
const validation = validatePromotion(promotion.approvedEntries || [], manifest, existingEntries);
const preview = {
  huntId: args.huntId,
  targetMapSlug: mapSlug,
  apply: args.apply,
  acceptedCount: validation.accepted.length,
  rejectedCount: validation.rejected.length,
  accepted: validation.accepted.map(entry => ({ id: entry.id, name: entry.name })),
  rejected: validation.rejected,
  generatedAt: new Date().toISOString(),
};

const previewPath = args.previewOutput || path.join('data/hunt-promotions', `${args.huntId}-promotion-preview.json`);
writeJson(previewPath, preview);

if (validation.rejected.length > 0) {
  console.error(JSON.stringify(preview, null, 2));
  throw new Error('Promotion failed quality gates. See preview artifact for rejected candidates.');
}

if (!args.apply) {
  console.log(JSON.stringify(preview, null, 2));
  console.log('Dry run only. Re-run with --apply --approval=PROMOTE to write public map data.');
  process.exit(0);
}

fs.mkdirSync(mapDir, { recursive: true });
const mergedEntries = mergeEntries(existingEntries, validation.accepted);
const updatedManifest = updateManifest(manifest, promotion, spec, mergedEntries.length);
writeJson(manifestPath, updatedManifest);
writeJson(entriesPath, mergedEntries);
updateIndex(indexPath, updatedManifest);

console.log(JSON.stringify({
  promoted: validation.accepted.length,
  targetMapSlug: mapSlug,
  entriesPath,
  manifestPath,
}, null, 2));

function validatePromotion(entries: KnowledgeEntry[], manifest: MapManifest, existingEntries: KnowledgeEntry[]) {
  const existingIds = new Set(existingEntries.map(entry => entry.id));
  const accepted: KnowledgeEntry[] = [];
  const rejected: Array<{ id: string; name: string; issues: string[] }> = [];

  for (const entry of entries) {
    const issues = qualityIssues(entry, manifest, existingIds);
    if (issues.length > 0) {
      rejected.push({ id: entry.id, name: entry.name, issues });
    } else {
      accepted.push(entry);
    }
  }

  return { accepted, rejected };
}

function qualityIssues(entry: KnowledgeEntry, manifest: MapManifest, existingIds: Set<string>) {
  const issues: string[] = [];
  const address = entry.location?.address || '';
  const lat = entry.location?.lat;
  const lng = entry.location?.lng;

  if (!entry.id) issues.push('missing_entry_id');
  if (existingIds.has(entry.id)) issues.push('duplicate_entry_id');
  if (!/\d/.test(address) || /\b(area|region|unknown|tbd|various)\b/i.test(address)) {
    issues.push('exact_address_required');
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
    issues.push('valid_coordinates_required');
  }

  const bounds = manifest.validation?.coordinateBounds;
  if (bounds && Number.isFinite(lat) && Number.isFinite(lng)) {
    if (lat < bounds.minLat || lat > bounds.maxLat || lng < bounds.minLng || lng > bounds.maxLng) {
      issues.push('coordinates_out_of_bounds');
    }
  }

  const recentSince = manifest.validation?.requireRecentSignalSince || new Date().getFullYear() - 4;
  if (!hasRecentEvidence(entry, recentSince)) issues.push('recent_evidence_required');

  const blocked = [
    ...(manifest.validation?.blockedNamePatterns || []),
    "stewart'?s",
    'dairy queen',
    'cold stone',
    'baskin',
    'mcdonald',
    'wendy',
    'burger king',
    'sonic',
  ];
  if (blocked.some(pattern => new RegExp(`\\b(${pattern})\\b`, 'i').test(entry.name))) {
    issues.push('generic_chain_or_filler_review');
  }

  if (!hasVerifiedPhotos(entry)) issues.push('verified_real_location_tied_photos_required');

  return issues;
}

function hasRecentEvidence(entry: KnowledgeEntry, sinceYear: number) {
  if (entry.lastVerified && Number(entry.lastVerified.slice(0, 4)) >= sinceYear) return true;
  return (entry.evidence || []).some(evidence => {
    const year = Number(`${evidence.date || ''}`.match(/\b(20\d{2})\b/)?.[1]);
    return Number.isFinite(year) && year >= sinceYear;
  });
}

function hasVerifiedPhotos(entry: KnowledgeEntry) {
  if (entry.photoEvidence?.some(photo => photo.url && photo.verified === true && !isBlockedPhotoUrl(photo.url))) return true;
  return (entry.photos || []).some(photo => {
    if (!photo.url || isBlockedPhotoUrl(photo.url)) return false;
    return Boolean(photo.caption && (photo.credit || photo.url.startsWith('/data/maps/') || photo.url.startsWith('data/maps/')));
  });
}

function isBlockedPhotoUrl(url: string) {
  return /^https:\/\/images\.unsplash\.com/i.test(url) || /placeholder|stock/i.test(url);
}

function createManifest(slug: string, promotion: PromotionArtifact, spec: HuntSpec | null): MapManifest {
  const entries = promotion.approvedEntries || [];
  const center = averageCenter(entries);
  const today = new Date().toISOString().slice(0, 10);
  return {
    slug,
    title: promotion.mapTitle || spec?.title?.replace(/^Hunt:\s*/i, '') || slugToTitle(slug),
    tagline: promotion.tagline || spec?.intent || 'Community-researched Mosaic map',
    version: '1.0.0',
    totalEntries: 0,
    lastUpdated: today,
    defaultCenter: center,
    defaultZoom: 10,
    filterFields: ['city', 'confidence'],
    chunks: ['entries.json'],
    intent: {
      statement: promotion.intent?.statement || spec?.intent || `Promoted Hunt results for ${slugToTitle(slug)}.`,
      scope: promotion.intent?.scope || spec?.scope,
      photoPolicy: promotion.intent?.photoPolicy || spec?.photoPolicy,
    },
    intentHistory: [],
    validation: {
      coordinateBounds: spec?.geography.coordinateBounds,
      requireStreetAddress: true,
      requireVerifiedProductPhotos: true,
      requireRecentSignalSince: new Date().getFullYear() - 4,
      blockedNamePatterns: [],
    },
  };
}

function updateManifest(manifest: MapManifest, promotion: PromotionArtifact, spec: HuntSpec | null, totalEntries: number): MapManifest {
  const now = new Date().toISOString();
  return {
    ...manifest,
    totalEntries,
    lastUpdated: now.slice(0, 10),
    intent: {
      statement: promotion.intent?.statement || manifest.intent?.statement || spec?.intent,
      scope: promotion.intent?.scope || manifest.intent?.scope || spec?.scope,
      photoPolicy: promotion.intent?.photoPolicy || manifest.intent?.photoPolicy || spec?.photoPolicy,
    },
    intentHistory: [
      ...(manifest.intentHistory || []),
      {
        changedAt: now,
        author: 'mosaic-hunt-promotion',
        summary: `Promoted approved Hunt entries from ${promotion.huntId}.`,
      },
    ],
  };
}

function mergeEntries(existing: KnowledgeEntry[], approved: KnowledgeEntry[]) {
  const next = new Map(existing.map(entry => [entry.id, entry]));
  for (const entry of approved) next.set(entry.id, entry);
  return Array.from(next.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function updateIndex(indexPath: string, manifest: MapManifest) {
  const index = fs.existsSync(indexPath)
    ? readJson<DataIndex>(indexPath)
    : { version: 1, lastUpdated: '', maps: [] };
  const summary = {
    slug: manifest.slug,
    title: manifest.title,
    tagline: manifest.tagline,
    entryCount: manifest.totalEntries,
    lastUpdated: manifest.lastUpdated,
  };

  index.lastUpdated = manifest.lastUpdated;
  index.maps = [
    summary,
    ...index.maps.filter(map => map.slug !== manifest.slug),
  ];
  writeJson(indexPath, index);
}

function averageCenter(entries: KnowledgeEntry[]): [number, number] {
  const points = entries
    .map(entry => entry.location)
    .filter(location => Number.isFinite(location?.lat) && Number.isFinite(location?.lng));
  if (points.length === 0) return [42.6526, -73.7562];
  const lat = points.reduce((sum, point) => sum + point.lat, 0) / points.length;
  const lng = points.reduce((sum, point) => sum + point.lng, 0) / points.length;
  return [Number(lat.toFixed(5)), Number(lng.toFixed(5))];
}

function parseArgs(argv: string[]): Args {
  const parsed: Args = {
    huntId: '',
    targetMapSlug: '',
    promotionArtifact: '',
    apply: false,
  };

  for (const arg of argv) {
    if (arg === '--apply') parsed.apply = true;
    if (arg.startsWith('--hunt-id=')) parsed.huntId = arg.slice('--hunt-id='.length);
    if (arg.startsWith('--target-map-slug=')) parsed.targetMapSlug = arg.slice('--target-map-slug='.length);
    if (arg.startsWith('--promotion-artifact=')) parsed.promotionArtifact = arg.slice('--promotion-artifact='.length);
    if (arg.startsWith('--approval=')) parsed.approval = arg.slice('--approval='.length);
    if (arg.startsWith('--preview-output=')) parsed.previewOutput = arg.slice('--preview-output='.length);
  }

  if (!parsed.huntId) throw new Error('Missing --hunt-id');
  if (!parsed.targetMapSlug) throw new Error('Missing --target-map-slug');
  if (!parsed.promotionArtifact) throw new Error('Missing --promotion-artifact');
  return parsed;
}

function slugToTitle(slug: string) {
  return slug
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
