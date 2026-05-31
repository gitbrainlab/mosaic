#!/usr/bin/env tsx
/**
 * Generates a prioritized enrichment backlog across all committed maps.
 *
 * Output:
 *   public/data/enrichment/verification-index.json
 */
import fs from 'fs';
import path from 'path';

type Bounds = { minLat: number; maxLat: number; minLng: number; maxLng: number };

type Manifest = {
  slug: string;
  title: string;
  intent?: { statement?: string; scope?: string; photoPolicy?: string };
  validation?: { coordinateBounds?: Bounds };
};

type Entry = {
  id: string;
  name: string;
  confidence: 'high' | 'medium' | 'low';
  location: { city: string; lat: number; lng: number };
  evidence?: Array<{ source?: string; url?: string; date?: string }>;
  photos?: Array<{ url: string; caption?: string }>;
  photoEvidence?: Array<{ url: string; verified?: boolean; caption?: string }>;
  sources?: string[];
};

function inBounds(lat: number, lng: number, bounds: Bounds) {
  return lat >= bounds.minLat && lat <= bounds.maxLat && lng >= bounds.minLng && lng <= bounds.maxLng;
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

function scoreEntry(entry: Entry, manifest: Manifest) {
  const issues: string[] = [];
  let score = 0;

  const bounds = manifest.validation?.coordinateBounds;
  if (bounds && !inBounds(entry.location.lat, entry.location.lng, bounds)) {
    issues.push('coordinate_out_of_scope');
    score += 40;
  }

  const evidenceCount = entry.evidence?.length ?? 0;
  if (evidenceCount === 0) {
    issues.push('missing_evidence');
    score += 30;
  } else if (evidenceCount < 2) {
    issues.push('thin_evidence');
    score += 12;
  }

  const hasPhotos = (entry.photos?.length ?? 0) > 0;
  const verifiedPhotoCount = (entry.photoEvidence || []).filter(p => p.verified).length;
  if (!hasPhotos && verifiedPhotoCount === 0) {
    issues.push('missing_product_photos');
    score += 28;
  } else if (verifiedPhotoCount === 0) {
    issues.push('photos_unverified');
    score += 12;
  }

  const sourceCount = entry.sources?.length ?? 0;
  if (sourceCount === 0) {
    const hasEvidenceLinks = (entry.evidence || []).some(e => !!e.url);
    if (!hasEvidenceLinks) {
      issues.push('missing_source_urls');
      score += 18;
    }
  }

  if (entry.confidence === 'low') score += 14;
  if (entry.confidence === 'medium') score += 6;

  return { score, issues };
}

function main() {
  const mapsRoot = path.join('public', 'data', 'maps');
  const mapSlugs = fs.readdirSync(mapsRoot).filter(slug => fs.existsSync(path.join(mapsRoot, slug, 'manifest.json')));

  const backlog: Array<{
    mapSlug: string;
    mapTitle: string;
    entryId: string;
    entryName: string;
    city: string;
    confidence: string;
    priorityScore: number;
    issues: string[];
  }> = [];

  for (const slug of mapSlugs) {
    const mapDir = path.join(mapsRoot, slug);
    const manifest = readJson<Manifest>(path.join(mapDir, 'manifest.json'));
    const entries = readJson<Entry[]>(path.join(mapDir, 'entries.json'));

    for (const entry of entries) {
      const { score, issues } = scoreEntry(entry, manifest);
      if (issues.length === 0) continue;

      backlog.push({
        mapSlug: slug,
        mapTitle: manifest.title,
        entryId: entry.id,
        entryName: entry.name,
        city: entry.location.city,
        confidence: entry.confidence,
        priorityScore: score,
        issues,
      });
    }
  }

  backlog.sort((a, b) => b.priorityScore - a.priorityScore);

  const output = {
    generatedAt: new Date().toISOString(),
    totalMaps: mapSlugs.length,
    totalFlaggedEntries: backlog.length,
    issueTypes: [
      'coordinate_out_of_scope',
      'missing_evidence',
      'thin_evidence',
      'missing_product_photos',
      'photos_unverified',
      'missing_source_urls',
    ],
    backlog,
  };

  const outDir = path.join('public', 'data', 'enrichment');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'verification-index.json'), JSON.stringify(output, null, 2));
  console.log(`Wrote enrichment backlog with ${backlog.length} flagged entries -> public/data/enrichment/verification-index.json`);
}

main();
